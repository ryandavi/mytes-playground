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

    normalizeRequests(request) {
        return (Array.isArray(request) ? request : [request]).filter(Boolean);
    }

    capturePreviewState(requests) {
        const floorFinishes = new Map();
        for (const request of requests) {
            if (request.surface !== 'floor' || floorFinishes.has(request.roomId)) continue;
            const room = this.gameMap?.regionManager?.get('room', request.roomId);
            floorFinishes.set(request.roomId, room?.properties?.floorFinishId ?? null);
        }
        return {
            wallOverrides: Utility.deepClone(this.gameMap?.wallBuilder?.faceOverrides || []),
            floorFinishes
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
            if (request.surface === 'wall') {
                applied = this.gameMap?.wallBuilder?.setFaceFinish({
                    face: request.face,
                    cells: request.cells,
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
