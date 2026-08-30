// FenceMapObject — auto-connects to adjacent FENCE/GATE tiles.
// Sprite frame is selected by a 4-bit cardinal-direction bitmask (0–15):
//   bit 0 = N, bit 1 = E, bit 2 = S, bit 3 = W
// Variation row is a deterministic hash of the tile's grid position,
// giving each fence tile a stable visual style without storing extra data.

class FenceMapObject extends MapObject {
    static COMPATIBLE_TYPES = ['FENCE', 'GATE'];

    static DIRECTIONS = [
        { dx:  0, dy: -1, bit: 1 },  // N
        { dx:  1, dy:  0, bit: 2 },  // E
        { dx:  0, dy:  1, bit: 4 },  // S
        { dx: -1, dy:  0, bit: 8 },  // W
    ];

    static HEALTH_THRESHOLDS = {
        damaged:  75,   // below this → 'fence-damaged' class
        critical: 40,   // below this → 'fence-critical' class
        fallen:    0,   // at or below this → collapse
    };

    constructor(parent, type, variant, posX, posY, config = {}, options = {}) {
        super(parent, type, variant, posX, posY, config, options);
        this.health = 100;
        this._degradationAccumulator = 0;
        const degradation = this.getConfig('degradation', {});
        this._degradationEnabled = degradation.enabled ?? false;
        this._degradationTime = degradation.durationMs ?? 7200000;
        this._fallen = false;
    }

    getBaseCssClass() { return 'fence'; }

    // ── Grid helpers ──────────────────────────────────────────────────────────

    _cellSize() {
        return this.gameMap?.gridSystem?.config?.cellSize ?? 32;
    }

    _gridPos() {
        const cs = this._cellSize();
        const offsetX = this.collider?.offsetX || 0;
        const offsetY = this.collider?.offsetY || 0;
        return {
            x: Math.floor((this.posX + offsetX) / cs),
            y: Math.floor((this.posY + offsetY) / cs),
        };
    }

    // ── Connection mask ───────────────────────────────────────────────────────

    _computeConnectionMask() {
        const gs = this.gameMap?.gridSystem;
        if (!gs) return 0;

        const { x: gx, y: gy } = this._gridPos();
        let mask = 0;

        for (const { dx, dy, bit } of FenceMapObject.DIRECTIONS) {
            const cell = gs.grid[gx + dx]?.[gy + dy];
            if (!cell) continue;
            const connected = [...cell.objects].some(o =>
                o !== this &&
                o.active !== false &&
                FenceMapObject.COMPATIBLE_TYPES.includes(o.type)
            );
            if (connected) mask |= bit;
        }

        return mask;
    }

    // ── Variation row ─────────────────────────────────────────────────────────

    _computeVariationRow() {
        const { x, y } = this._gridPos();
        const n = this.getConfig('numVariations', 1);
        return Math.abs(x * 31 + y * 37) % n;
    }

    // ── Sprite frame ──────────────────────────────────────────────────────────

    _resolveFrame(mask) {
        const maskMap = this.getConfig('maskMap', null);
        if (Array.isArray(maskMap) && maskMap.length === 16) {
            return maskMap[mask] ?? mask;
        }
        return mask;
    }

    refreshConnectionSprite() {
        const rawMask = this._computeConnectionMask();
        const col = this._resolveFrame(rawMask);
        const row = this._computeVariationRow();

        const frameSize = this.getVisualFrameSize() ?? {};
        const frameW = frameSize.width  ?? this.getVisualFrameWidth() ?? 32;
        const frameH = frameSize.height ?? this.size.height;
        const scale  = this.getVisualScale?.() ?? 1;

        const bgPos = `${-(col * frameW * scale)}px ${-(row * frameH * scale)}px`;

        if (this.renderState) {
            this.renderState.bgPosition = bgPos;
            this.renderState.dirty = true;
        }
        const sprite = this.getSpriteElement?.();
        if (sprite) sprite.style.backgroundPosition = bgPos;
    }

    // ── Neighbor notification ─────────────────────────────────────────────────

    _notifyNeighbors() {
        const gs = this.gameMap?.gridSystem;
        if (!gs) return;

        const { x: gx, y: gy } = this._gridPos();

        for (const { dx, dy } of FenceMapObject.DIRECTIONS) {
            const cell = gs.grid[gx + dx]?.[gy + dy];
            if (!cell) continue;
            for (const obj of cell.objects) {
                if (obj !== this && typeof obj.refreshConnectionSprite === 'function') {
                    obj.refreshConnectionSprite();
                }
            }
        }
    }

    // ── Degradation ───────────────────────────────────────────────────────────

    repair() {
        if (this._fallen) {
            this._fallen = false;
            this._updateCollisionFromHealth();
        }
        this.health = 100;
        this._degradationAccumulator = 0;
        this._updateHealthVisuals();
    }

    _updateDegradation(delta) {
        if (!this._degradationEnabled || this._fallen) return;

        this._degradationAccumulator += delta;
        const rate = this._degradationTime;
        while (this._degradationAccumulator >= rate / 100) {
            this._degradationAccumulator -= rate / 100;
            this.health = Math.max(0, this.health - 1);
        }

        if (this.health <= FenceMapObject.HEALTH_THRESHOLDS.fallen) {
            this._collapse();
        } else {
            this._updateHealthVisuals();
        }
    }

    _collapse() {
        this._fallen = true;
        this.health = 0;
        this._updateCollisionFromHealth();
        this._updateHealthVisuals();
    }

    _updateCollisionFromHealth() {
        if (!this.element) return;
        if (this._fallen) {
            this.element.classList.add('fence-fallen');
            // Disable collision so entities can pass through
            if (this.collider) this.collider._disabled = true;
            this.gameMap?.gridSystem?.updateObjectPosition?.(this);
        } else {
            this.element.classList.remove('fence-fallen');
            if (this.collider) delete this.collider._disabled;
            this.gameMap?.gridSystem?.updateObjectPosition?.(this);
        }
    }

    _updateHealthVisuals() {
        if (!this.element) return;
        const { damaged, critical } = FenceMapObject.HEALTH_THRESHOLDS;
        this.element.classList.toggle('fence-damaged',  this.health < damaged && !this._fallen);
        this.element.classList.toggle('fence-critical', this.health < critical && !this._fallen);
    }

    getHealthLabel() {
        if (this._fallen)         return 'Fallen';
        if (this.health < FenceMapObject.HEALTH_THRESHOLDS.critical) return 'Critical';
        if (this.health < FenceMapObject.HEALTH_THRESHOLDS.damaged)  return 'Damaged';
        return 'Good';
    }

    // ── Selection info ────────────────────────────────────────────────────────

    getSelectionDebugInfo() {
        const base = super.getSelectionDebugInfo?.() ?? [];
        if (!this._degradationEnabled) return base;
        return [
            { label: 'Health', value: `${Math.ceil(this.health)}% (${this.getHealthLabel()})` },
            ...base,
        ];
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    render(container, parent) {
        const element = super.render(container, parent);
        this.refreshConnectionSprite();
        this._notifyNeighbors();
        if (this._degradationEnabled) this._updateHealthVisuals();
        return element;
    }

    tickUpdate(delta) {
        this._updateDegradation(delta);
    }

    // Leaving the map by any route — the Fence tool, the Move tool, stored into
    // the inventory — has to redraw the neighbours it was connecting, or they
    // keep drawing a join to a fence that is no longer there.
    remove() {
        this._notifyNeighbors();
        super.remove();
    }

    // Player-placed fences persist through the ordinary WorldState object path;
    // authored ones are rebuilt from the map and this just re-applies wear.
    serializeState() {
        return { health: this.health, fallen: this._fallen };
    }

    restoreState(data = {}) {
        if (Number.isFinite(data.health)) this.health = data.health;
        this._fallen = data.fallen === true;
        this._updateCollisionFromHealth();
        this._updateHealthVisuals();
        this.refreshConnectionSprite();
    }
}
