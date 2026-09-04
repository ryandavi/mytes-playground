class SurfaceCustomizer {
    constructor(gameMap) {
        this.gameMap = gameMap;
        this.previewState = null;
    }

    listFinishes(surface) {
        const registry = surface === 'wall'
            ? this.gameMap?.wallMaterialRegistry
            : surface === 'floor'
                ? this.gameMap?.floorMaterialRegistry
                : null;
        return [...(registry?.finishes || [])].map(([id, finish]) => ({ id, ...finish }));
    }

    /**
     * Locked walls and floors are dropped here rather than at the panel, so
     * every caller — palette click, undo replay, a future script — is held to
     * the same rule.
     */
    normalizeRequests(request) {
        const rules = this.gameMap?.container?.buildRules;
        return (Array.isArray(request) ? request : [request])
            .filter(Boolean)
            .filter(entry => {
                if (!rules) return true;
                if (entry.surface === 'floor') {
                    return rules.canPaintRoomFloor(this.gameMap?.regionManager?.get('room', entry.roomId)).allowed;
                }
                if (entry.buildingId && !entry.cells) return true;
                if (entry.roomId && !entry.cells) {
                    return !!this.gameMap?.regionManager?.get('room', entry.roomId);
                }
                const [cellX, cellY] = entry.cells?.from || [];
                return rules.canPaintWallFace({ x: cellX, y: cellY }).allowed;
            });
    }

    preview(request) {
        this.revertPreview();
        const requests = this.normalizeRequests(request);
        if (requests.length === 0) return false;
        const build = this.gameMap?.buildTransaction;
        if (!build) return false;
        const before = build.document.captureStores();
        const preview = build.preview((draft, level) => this.mutateDraft(draft, level, requests, build.cache));
        const after = preview.document.captureStores();
        const dirty = BuildTransaction.dirty(
            before, after, build.cache.grid, preview.grid, build.levelId,
            preview.geometry, preview.topology
        );
        this.previewState = { dirty };
        this.gameMap.wallBuilder.previewDocument = preview.document;
        this.gameMap.wallBuilder.previewCache = preview;
        this.gameMap.floorBuilder.previewDocument = preview.document;
        this.gameMap.wallBuilder.invalidate(dirty.cells, { geometryChanged: false });
        this.gameMap.floorBuilder.invalidate(dirty.blocks);
        return true;
    }

    revertPreview() {
        if (!this.previewState) return false;
        const wallBuilder = this.gameMap?.wallBuilder;
        const { dirty } = this.previewState;
        wallBuilder.previewDocument = null;
        wallBuilder.previewCache = null;
        this.gameMap.floorBuilder.previewDocument = null;
        wallBuilder.invalidate(dirty.cells, { geometryChanged: false });
        this.gameMap.floorBuilder.invalidate(dirty.blocks);
        this.previewState = null;
        return true;
    }

    apply(request) {
        this.revertPreview();
        const requests = this.normalizeRequests(request);
        const applied = this.gameMap?.buildTransaction ? this.applyTransaction(requests) : false;
        if (!applied) return false;

        this.gameMap?.container?.worldState?.captureMap?.(this.gameMap);
        this.gameMap?.core?.user?._scheduleSave?.();
        return true;
    }

    applyTransaction(requests) {
        if (requests.length === 0) return false;
        const build = this.gameMap.buildTransaction;
        return build.run('Paint surfaces', (draft, level) => {
            this.mutateDraft(draft, level, requests, build.cache);
        }).committed;
    }

    mutateDraft(document, level, requests, cache) {
        const roomWallIds = new Set(requests
            .filter(request => request.surface === 'wall' && request.roomId && !request.cells)
            .map(request => request.roomId));
        const exteriorBuildingIds = new Set(requests
            .filter(request => request.surface === 'wall' && request.exterior && request.buildingId)
            .map(request => request.buildingId));
        for (const request of requests) {
                if (request.surface === 'floor') {
                    const room = level.rooms.get(request.roomId);
                    if (room) level.rooms.set(room.id, { ...room, floorFinishId: request.finishId || null });
                    continue;
                }
                if (request.roomId && !request.cells) {
                    const room = level.rooms.get(request.roomId);
                    if (room) level.rooms.set(room.id, { ...room, wallFinishId: request.finishId || null });
                    continue;
                }
                if (request.exterior && request.buildingId && !request.cells) {
                    const building = document.buildings.get(request.buildingId);
                    if (building) document.buildings.set(building.id, {
                        ...building,
                        exteriorFinishId: request.finishId || null
                    });
                    continue;
                }
                const [x0, y0] = request.cells.from;
                const [x1, y1] = request.cells.to;
                for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
                    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
                        if (!level.walls.has(BuildKeys.cell(x, y))) continue;
                        for (const half of request.halves?.length ? request.halves : [0, 1]) {
                            const atom = { x, y, face: request.face, half, finishId: request.finishId };
                            level.atoms.set(BuildKeys.atom(x, y, request.face, half), atom);
                        }
                    }
                }
        }
        if (roomWallIds.size) for (const atom of level.atoms.values()) {
                const classification = WallFaceResolver.classify(
                    atom,
                    cache.grid,
                    { ...cache.topology, walls: cache.geometry }
                );
                if (roomWallIds.has(classification.roomId)) {
                    level.atoms.delete(BuildKeys.atom(atom.x, atom.y, atom.face, atom.half));
                }
        }
        if (exteriorBuildingIds.size) for (const atom of level.atoms.values()) {
            const wall = level.walls.get(BuildKeys.cell(atom.x, atom.y));
            if (!wall || !exteriorBuildingIds.has(wall.buildingId)) continue;
            const classification = WallFaceResolver.classify(
                atom, cache.grid, { ...cache.topology, walls: cache.geometry }
            );
            if (classification.kind === 'exterior') {
                level.atoms.delete(BuildKeys.atom(atom.x, atom.y, atom.face, atom.half));
            }
        }
    }

    dispose() {
        this.revertPreview();
        this.gameMap = null;
    }
}
