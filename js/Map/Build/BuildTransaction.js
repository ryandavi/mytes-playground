class BuildTransaction {
    constructor(options = {}) {
        if (!options.document) throw new Error('BuildTransaction requires a BuildDocument');
        this.document = options.document;
        this.levelId = options.levelId || BuildDocument.DEFAULT_LEVEL_ID;
        this.width = Number(options.width);
        this.height = Number(options.height);
        this.reachBlocks = Number(options.reachBlocks) || 1;
        this.geometryOptions = options.geometryOptions || {};
        this.cellSize = Number(options.cellSize) || 32;
        this.validate = options.validate || null;
        this.regionManager = options.regionManager || null;
        this.eventManager = options.eventManager || null;
        this.history = options.history || null;
        this.onCommit = options.onCommit || null;
        this.renderers = options.renderers || {};
        this.revision = 0;
        this.cache = null;
        this.undoStack = [];
        this.redoStack = [];
        this._active = false;
        this._stats = {
            transactions: 0,
            wallRebuilds: 0,
            ownershipSolves: 0,
            topologyRebuilds: 0,
            floorChunksRedrawn: 0,
            wallPiecesRedrawn: 0,
            hitTests: 0,
            imageDataReads: 0
        };
    }

    run(label, edit, options = {}) {
        if (this._active) throw new Error('Build transactions cannot be nested');
        if (typeof edit !== 'function') throw new Error('BuildTransaction.run requires an edit callback');
        this._active = true;
        const before = this.document.captureStores();
        try {
            const draft = new BuildDocument(before);
            edit(draft, draft.level(this.levelId));
            this.assertValid(draft);
            const derived = this.derive(draft, { proposeSeeds: true, previousGrid: this.cache?.grid });
            const after = draft.captureStores();
            const forward = BuildTransaction.diffDocuments(before, after);
            if (BuildTransaction.deltaIsEmpty(forward)) return { committed: false, label };
            const inverse = BuildTransaction.diffDocuments(after, before);
            return this.commit({ label, before, after, forward, inverse, derived, recordHistory: options.recordHistory !== false });
        } finally {
            this._active = false;
        }
    }

    preview(edit) {
        const before = this.document.captureStores();
        const draft = new BuildDocument(before);
        edit(draft, draft.level(this.levelId));
        this.assertValid(draft);
        return Object.freeze({
            ...this.derive(draft, { proposeSeeds: true, previousGrid: this.cache?.grid, count: false }),
            document: draft
        });
    }

    initialize() {
        if (this.cache) return this.cache;
        this.cache = this.derive(this.document, { proposeSeeds: true, count: false });
        this.document.authored = this.document.captureStores();
        RoomRegionProjection.sync(
            this.regionManager,
            this.document.level(this.levelId).rooms,
            this.cache.grid,
            this.cache.topology,
            this.cellSize
        );
        this.renderers.floors?.setOwnershipGrid?.(this.cache.grid);
        return this.cache;
    }

    reconcile(label = 'Reconcile build state', { renderWalls = false } = {}) {
        const before = this.document.captureStores();
        const draft = new BuildDocument(before);
        const derived = this.derive(draft, { proposeSeeds: true, previousGrid: this.cache?.grid });
        const after = draft.captureStores();
        return this.commit({
            label,
            before,
            after,
            forward: BuildTransaction.diffDocuments(before, after),
            inverse: BuildTransaction.diffDocuments(after, before),
            derived,
            recordHistory: false,
            skipWallRender: !renderWalls,
            forceWallGeometry: renderWalls
        });
    }

    undo() {
        const entry = this.undoStack.pop();
        if (!entry) return false;
        this.replay(entry.label, entry.inverse, false);
        this.redoStack.push(entry);
        return true;
    }

    redo() {
        const entry = this.redoStack.pop();
        if (!entry) return false;
        this.replay(entry.label, entry.forward, false);
        this.undoStack.push(entry);
        return true;
    }

    replay(label, delta, recordHistory = false) {
        const before = this.document.captureStores();
        const draft = new BuildDocument(before);
        BuildTransaction.applyDocumentDelta(draft, delta);
        const derived = this.derive(draft, { proposeSeeds: false, previousGrid: this.cache?.grid });
        const after = draft.captureStores();
        return this.commit({
            label, before, after, forward: delta,
            inverse: BuildTransaction.diffDocuments(after, before),
            derived, recordHistory
        });
    }

    derive(draft, options = {}) {
        const level = draft.level(this.levelId);
        const revision = this.revision + 1;
        const geometry = WallGeometry.compute(level.walls.snapshot(), { ...this.geometryOptions, revision });
        if (options.count !== false) this._stats.wallRebuilds++;
        if (options.proposeSeeds) {
            const proposal = RoomTopology.proposeSeeds({
                width: this.width, height: this.height, geometry,
                plans: level.rooms, previousGrid: options.previousGrid
            });
            level.rooms.replace(proposal.plans);
        }
        const grid = FloorOwnershipResolver.solve({
            width: this.width,
            height: this.height,
            walls: new Map([...geometry.cells].map(([key, cell]) => [key, { ...cell, mask: geometry.masks.get(key) }])),
            expandCells: [...geometry.thresholds],
            plans: BuildTransaction.seedsOffThresholds(level.rooms.values(), geometry.thresholds),
            reachBlocks: this.reachBlocks,
            revision
        });
        if (options.count !== false) this._stats.ownershipSolves++;
        const topology = RoomTopology.compute({
            width: this.width, height: this.height, geometry, grid,
            plans: level.rooms, openings: level.openings.values(), revision
        });
        if (options.count !== false) this._stats.topologyRebuilds++;
        return Object.freeze({ geometry, grid, topology, revision });
    }

    // Thresholds belong to both sides of an opening. Filter them only from the
    // solve; stored room definitions retain every cell the player drew.
    static seedsOffThresholds(plans, thresholds) {
        const list = [...plans];
        if (!thresholds?.size) return list;
        return list.map(plan => (plan.seedCells || []).some(key => thresholds.has(key))
            ? { ...plan, seedCells: plan.seedCells.filter(key => !thresholds.has(key)) }
            : plan);
    }

    commit(data) {
        const previousGrid = this.cache?.grid || null;
        this.document.replaceCurrent(data.after);
        this.revision++;
        this.cache = data.derived;
        const dirty = BuildTransaction.dirty(
            data.before,
            data.after,
            previousGrid,
            this.cache.grid,
            this.levelId,
            data.derived.geometry,
            data.derived.topology
        );
        const regions = RoomRegionProjection.sync(
            this.regionManager,
            this.document.level(this.levelId).rooms,
            data.derived.grid,
            data.derived.topology,
            this.cellSize
        );
        if (!data.skipWallRender && (dirty.cells.length > 0 || data.forceWallGeometry)) {
            const wallCells = data.forceWallGeometry ? [...data.derived.geometry.cells.keys()] : dirty.cells;
            this._stats.wallPiecesRedrawn += Number(this.renderers.walls?.invalidate?.(wallCells, {
                geometryChanged: dirty.geometryChanged || data.forceWallGeometry === true,
                recordsChanged: dirty.recordsChanged
            })) || 0;
        }
        this.renderers.floors?.setOwnershipGrid?.(data.derived.grid);
        this._stats.floorChunksRedrawn += Number(this.renderers.floors?.invalidate?.(dirty.blocks)) || 0;
        const event = Object.freeze({
            label: data.label,
            deltas: data.forward,
            dirty,
            revision: this.revision,
            geometry: data.derived.geometry,
            grid: data.derived.grid,
            topology: data.derived.topology,
            regions
        });
        this._stats.transactions++;
        this.eventManager?.emit?.('build:committed', event);
        this.onCommit?.(event);
        if (data.recordHistory) this.recordHistory(data.label, data.forward, data.inverse);
        return { committed: true, ...event };
    }

    recordHistory(label, forward, inverse) {
        const entry = { label, forward, inverse };
        const recorded = this.history?.push?.({
            label,
            undo: () => this.replay(label, inverse, false),
            redo: () => this.replay(label, forward, false)
        });
        if (recorded) return;
        this.undoStack.push(entry);
        this.redoStack.length = 0;
    }

    assertValid(draft) {
        const result = this.validate?.(draft);
        if (result === false || result?.allowed === false) {
            throw new Error(result?.reason || 'Build edit was rejected');
        }
    }

    stats() { return Object.freeze({ ...this._stats }); }

    static diffDocuments(before, after) {
        const levels = {};
        const levelIds = new Set([...Object.keys(before.levels || {}), ...Object.keys(after.levels || {})]);
        for (const levelId of [...levelIds].sort()) {
            levels[levelId] = Object.fromEntries(BuildDocument.LEVEL_STORES.map(name => [
                name, StoreDelta.diff(before.levels?.[levelId]?.[name], after.levels?.[levelId]?.[name])
            ]));
        }
        return { buildings: StoreDelta.diff(before.buildings, after.buildings), levels };
    }

    static applyDocumentDelta(document, delta) {
        document.buildings.applyDelta(delta.buildings);
        for (const [levelId, levelDelta] of Object.entries(delta.levels || {})) {
            if (!document.levels[levelId]) document.levels[levelId] = document.createLevel({});
            for (const name of BuildDocument.LEVEL_STORES) document.levels[levelId][name].applyDelta(levelDelta[name]);
        }
    }

    static deltaIsEmpty(delta) {
        return StoreDelta.isEmpty(delta.buildings) && Object.values(delta.levels || {}).every(level =>
            BuildDocument.LEVEL_STORES.every(name => StoreDelta.isEmpty(level[name]))
        );
    }

    static dirty(before, after, previousGrid, nextGrid, levelId = BuildDocument.DEFAULT_LEVEL_ID,
        geometry = null, topology = null) {
        return BuildDirty.compute(before, after, previousGrid, nextGrid, levelId, geometry, topology);
    }
}
