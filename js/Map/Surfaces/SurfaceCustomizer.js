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
                if (entry.roomId && !entry.cells) {
                    return !!this.gameMap?.regionManager?.get('room', entry.roomId);
                }
                const [cellX, cellY] = entry.cells?.from || [];
                return rules.canPaintWallFace({ x: cellX, y: cellY }).allowed;
            });
    }

    capturePreviewState(requests) {
        const floorFinishes = new Map();
        const roomWallFinishes = new Map();
        for (const request of requests) {
            const room = this.gameMap?.regionManager?.get('room', request.roomId);
            if (request.surface === 'floor' && !floorFinishes.has(request.roomId)) {
                floorFinishes.set(request.roomId, room?.properties?.floorFinishId ?? null);
            } else if (request.surface === 'wall' && request.roomId && !request.cells &&
                !roomWallFinishes.has(request.roomId)) {
                roomWallFinishes.set(request.roomId, room?.properties?.wallFinishId ?? null);
            }
        }
        return {
            wallOverrides: Utility.deepClone(this.gameMap?.wallBuilder?.faceOverrides || []),
            floorFinishes,
            roomWallFinishes
        };
    }

    preview(request) {
        this.revertPreview();
        const requests = this.normalizeRequests(request);
        if (requests.length === 0) return false;
        this.previewState = this.capturePreviewState(requests);
        if (this.applyInternal(requests)) return true;
        this.revertPreview();
        return false;
    }

    revertPreview() {
        if (!this.previewState) return false;
        const wallBuilder = this.gameMap?.wallBuilder;
        for (const [roomId, finishId] of this.previewState.roomWallFinishes ?? []) {
            const room = this.gameMap?.regionManager?.get('room', roomId);
            if (room) room.properties = { ...room.properties, wallFinishId: finishId };
        }
        if (wallBuilder) {
            wallBuilder.faceOverrides = Utility.deepClone(this.previewState.wallOverrides);
            wallBuilder.rebuild();
        }
        for (const [roomId, finishId] of this.previewState.floorFinishes) {
            this.gameMap?.floorBuilder?.setRoomFinish(roomId, finishId);
        }
        this.previewState = null;
        return true;
    }

    apply(request) {
        this.revertPreview();
        const requests = this.normalizeRequests(request);
        if (!this.applyInternal(requests)) return false;

        this.gameMap?.eventManager?.emit(EVENTS.SURFACE_FINISH_CHANGED, {
            mapId: this.gameMap.id,
            requests: Utility.deepClone(requests)
        });
        this.gameMap?.container?.worldState?.captureMap?.(this.gameMap);
        this.gameMap?.core?.user?._scheduleSave?.();
        return true;
    }

    applyInternal(requests) {
        if (requests.length === 0) return false;
        let applied = false;
        for (const request of requests) {
            if (request.surface === 'wall' && request.roomId && !request.cells) {
                applied = this.gameMap?.wallBuilder?.setRoomWallFinish(
                    request.roomId, request.finishId
                ) || applied;
            } else if (request.surface === 'wall') {
                applied = this.gameMap?.wallBuilder?.setFaceFinish({
                    face: request.face,
                    cells: request.cells,
                    // Carried through, not re-derived: the caller resolved which
                    // room the clicked SURFACE faces, and a corner post's two
                    // halves face two different ones. Letting setFaceFinish
                    // guess from the cell scoped the paint to whichever room
                    // that face happened to answer with.
                    roomId: request.roomId,
                    finishId: request.finishId
                }) || applied;
            } else if (request.surface === 'floor') {
                applied = this.gameMap?.floorBuilder?.setRoomFinish(request.roomId, request.finishId) || applied;
            }
        }
        return applied;
    }

    dispose() {
        this.revertPreview();
        this.gameMap = null;
    }
}
