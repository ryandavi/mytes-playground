// ─────────────────────────────────────────────────────────────────────────────
// RegionManager — the one place that answers "which areas is this entity in?"
//
// Layers are independent and unhierarchical on purpose: a zone may sit inside a
// room, and a zone may straddle two rooms. No containment tree is enforced.
//
// Membership is cached per entity and recomputed only when the entity crosses a
// grid cell, not every frame. Reverse occupant sets are maintained so a region
// can list who is inside it for free — something the old per-frame Zone scan
// could not do.
// ─────────────────────────────────────────────────────────────────────────────
class RegionManager {
    constructor(map, { cellSize = 32 } = {}) {
        this.map = map;
        this.cellSize = cellSize;
        this.regions = new Map();               // regionKey -> SpatialRegion
        this.byLayer = new Map();               // layer -> Set<SpatialRegion>
        this.occupants = new Map();             // regionKey -> Set<entity>
        this._membership = new Map();           // entity -> { cellKey, byLayer: Map<layer, Set<regionKey>> }
    }

    static key(layer, id) {
        return `${layer}:${id}`;
    }

    add(region) {
        if (!region) return null;
        const key = RegionManager.key(region.layer, region.id);
        this.regions.set(key, region);
        if (!this.byLayer.has(region.layer)) this.byLayer.set(region.layer, new Set());
        this.byLayer.get(region.layer).add(region);
        this.occupants.set(key, new Set());
        return region;
    }

    remove(region) {
        if (!region) return;
        const key = RegionManager.key(region.layer, region.id);
        this.regions.delete(key);
        this.byLayer.get(region.layer)?.delete(region);
        this.occupants.delete(key);
    }

    get(layer, id) {
        return this.regions.get(RegionManager.key(layer, id)) ?? null;
    }

    all(layer = null) {
        if (layer === null) return [...this.regions.values()];
        return [...(this.byLayer.get(layer) ?? [])];
    }

    /**
     * Regions containing a point. Bounds-first broad phase; with a few dozen
     * regions per map a linear scan over bounds is cheaper than maintaining a
     * spatial index. Add a cell index only if region counts grow materially.
     */
    regionsAt(x, y, layer = null) {
        const pool = layer === null ? this.regions.values() : (this.byLayer.get(layer) ?? []);
        const found = [];
        for (const region of pool) {
            if (region.contains(x, y)) found.push(region);
        }
        return found;
    }

    getOccupants(region) {
        if (!region) return [];
        return [...(this.occupants.get(RegionManager.key(region.layer, region.id)) ?? [])];
    }

    /**
     * Directly record occupancy, for consumers that decide membership by their own
     * rule rather than the default point test. Zone uses this: its thresholds are
     * intersection-ratio based (touching / halfway / fully), which a centre-point
     * test cannot reproduce, and its effects must stay per-frame so that per-ms
     * stat accumulation keeps its existing cadence.
     */
    setOccupant(region, entity, inside) {
        if (!region || !entity) return;
        const key = RegionManager.key(region.layer, region.id);
        const set = this.occupants.get(key);
        if (!set) return;

        if (inside) set.add(entity);
        else set.delete(entity);

        // Mirror into the entity's membership record so `getMembership` answers the
        // same thing whichever path wrote it — consumer-driven (here) or the
        // default point test in updateMembership.
        let record = this._membership.get(entity);
        if (!record) {
            record = { cellKey: null, byLayer: new Map() };
            this._membership.set(entity, record);
        }
        let layerKeys = record.byLayer.get(region.layer);
        if (!layerKeys) {
            layerKeys = new Set();
            record.byLayer.set(region.layer, layerKeys);
        }
        if (inside) layerKeys.add(key);
        else layerKeys.delete(key);
    }

    _cellKeyFor(entity) {
        const cs = this.cellSize;
        return `${Math.floor(entity.posX / cs)},${Math.floor(entity.posY / cs)}`;
    }

    /**
     * Recompute an entity's membership if it has crossed a grid cell.
     *
     * @param {object} entity
     * @param {object} options
     *   layers  which layers to evaluate (default: all)
     *   test    (region, entity) => boolean — lets a consumer impose its own
     *           containment rule (Zone's intersection thresholds, for example)
     *           instead of the default centre-point test
     *   force   recompute even without a cell crossing
     * @returns {{ entered: SpatialRegion[], exited: SpatialRegion[], changed: boolean }}
     */
    updateMembership(entity, { layers = null, test = null, force = false } = {}) {
        const cellKey = this._cellKeyFor(entity);
        let record = this._membership.get(entity);

        if (!record) {
            record = { cellKey: null, byLayer: new Map() };
            this._membership.set(entity, record);
        } else if (!force && record.cellKey === cellKey) {
            return { entered: [], exited: [], changed: false };
        }

        record.cellKey = cellKey;
        const targetLayers = layers ?? [...this.byLayer.keys()];
        const entered = [];
        const exited = [];

        for (const layer of targetLayers) {
            const previous = record.byLayer.get(layer) ?? new Set();
            const current = new Set();

            for (const region of this.byLayer.get(layer) ?? []) {
                const inside = test
                    ? test(region, entity)
                    : region.contains(entity.posX, entity.posY);
                if (!inside) continue;

                const key = RegionManager.key(region.layer, region.id);
                current.add(key);
                if (!previous.has(key)) {
                    entered.push(region);
                    this.occupants.get(key)?.add(entity);
                }
            }

            for (const key of previous) {
                if (current.has(key)) continue;
                const region = this.regions.get(key);
                if (region) exited.push(region);
                this.occupants.get(key)?.delete(entity);
            }

            record.byLayer.set(layer, current);
        }

        return { entered, exited, changed: entered.length > 0 || exited.length > 0 };
    }

    getMembership(entity, layer) {
        const keys = this._membership.get(entity)?.byLayer.get(layer);
        if (!keys) return [];
        return [...keys].map(key => this.regions.get(key)).filter(Boolean);
    }

    // Single cleanup path — called from despawn alongside the other registries.
    forget(entity) {
        const record = this._membership.get(entity);
        if (!record) return;
        for (const keys of record.byLayer.values()) {
            for (const key of keys) this.occupants.get(key)?.delete(entity);
        }
        this._membership.delete(entity);
    }

    clear() {
        this.regions.clear();
        this.byLayer.clear();
        this.occupants.clear();
        this._membership.clear();
    }
}
