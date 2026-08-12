class WorldState {
    static VERSION = 1;

    constructor(container, user) {
        this.container = container;
        this.user = user;
        if (user && user.worldState?.version !== WorldState.VERSION) {
            user.worldState = WorldState.emptyPayload();
        }
    }

    static emptyPayload() {
        return { version: WorldState.VERSION, maps: {} };
    }

    get payload() {
        if (!this.user.worldState || this.user.worldState.version !== WorldState.VERSION) {
            this.user.worldState = WorldState.emptyPayload();
        }
        return this.user.worldState;
    }

    captureMap(map) {
        if (!map?.id) return null;
        const objects = map.objects
            .filter(object => typeof object.serializeState === 'function')
            .map(object => ({
                id: String(object.id),
                type: object.type,
                variant: object.variant,
                posX: object.posX,
                posY: object.posY,
                state: object.serializeState()
            }));
        const droppedItems = map.droppedItems
            .filter(item => item.active && !item.collected)
            .map(item => item.serializeState());
        const walls = map.wallBuilder?.serializeState?.() ?? null;
        const floors = Object.fromEntries((map.regionManager?.all('room') || [])
            .filter(room =>
                (room.properties?.floorFinishId ?? null) !==
                (room.properties?.authoredFloorFinishId ?? null)
            )
            .map(room => [room.id, room.properties?.floorFinishId ?? null]));
        const snapshot = { mapId: map.id, objects, droppedItems, walls, floors, savedAt: Date.now() };
        this.payload.maps[map.id] = snapshot;
        return snapshot;
    }

    restoreMap(map) {
        const snapshot = this.payload.maps[map?.id];
        if (!snapshot) return false;

        for (const record of snapshot.objects ?? []) {
            let object = map.getObjectById(record.id);
            if (!object && record.type && record.variant) {
                object = map.addObject(record.type, record.variant, record.posX, record.posY, {
                    id: record.id,
                    _worldStateRestored: true
                });
            }
            object?.restoreState?.(record.state ?? {});
        }

        for (const data of snapshot.droppedItems ?? []) {
            const item = map.addDroppedItem(data.type, data.variant, data.posX, data.posY);
            item.restoreState(data);
        }
        if (snapshot.walls && map.wallBuilder) {
            map.wallBuilder.restoreState(snapshot.walls);
        }
        this.restoreFloors(map, snapshot);
        return true;
    }

    restoreFloors(map, snapshot = this.payload.maps[map?.id]) {
        if (!snapshot?.floors || !map?.floorBuilder) return false;
        let restored = false;
        for (const [roomId, finishId] of Object.entries(snapshot.floors)) {
            if (!map.regionManager?.get('room', roomId)) continue;
            map.floorBuilder.setRoomFinish(roomId, finishId);
            restored = true;
        }
        return restored;
    }
}
