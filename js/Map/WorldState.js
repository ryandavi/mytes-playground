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
        const roomCells = map.roomAssignments?.serializeState?.() ?? null;
        // Both merged onto what was already stored, never replacing it.
        // Auto-detected rooms are rebuilt from scratch on every wall change, so
        // while a removed wall has two rooms merged into one the second room
        // does not exist to be captured — pruning it here would throw its finish
        // and its name away, and undoing the wall would bring the room back
        // bare. Stale ids cost nothing: restoreRooms skips any room that is not
        // on the map.
        const rooms = map.regionManager?.all('room') || [];
        const floors = Object.assign({}, this.payload.maps[map.id]?.floors,
            Object.fromEntries(rooms
                .filter(room =>
                    (room.properties?.floorFinishId ?? null) !==
                    (room.properties?.authoredFloorFinishId ?? null)
                )
                .map(room => [room.id, room.properties?.floorFinishId ?? null])));
        const roomWalls = Object.assign({}, this.payload.maps[map.id]?.roomWalls,
            Object.fromEntries(rooms
                .filter(room => (room.properties?.wallFinishId ?? null) !==
                    (room.properties?.authoredWallFinishId ?? null))
                .map(room => [room.id, room.properties?.wallFinishId ?? null])));
        const roomEdits = Object.assign({}, this.payload.maps[map.id]?.roomEdits,
            Object.fromEntries(rooms
                .filter(room =>
                    typeof room.properties?.playerName === 'string' ||
                    typeof room.properties?.roomType === 'string')
                .map(room => [room.id, {
                    name: room.properties.playerName ?? null,
                    type: room.properties.roomType ?? null
                }])));
        const snapshot = { mapId: map.id, objects, droppedItems, walls, roomCells, floors, roomWalls, roomEdits, savedAt: Date.now() };
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
        // Before the walls: restoring walls kicks the room detector, and a
        // detector that runs without the player's own rooms merges them back
        // together and then hands restoreRooms ids that no longer exist.
        if (map.roomAssignments) {
            map.roomAssignments.restoreState(snapshot.roomCells ?? {}, { emit: false });
        }
        if (snapshot.walls && map.wallBuilder) {
            map.wallBuilder.restoreState(snapshot.walls);
        }
        this.restoreRooms(map, snapshot);
        return true;
    }

    /**
     * Re-applies everything the player has done to a room — its finish and the
     * name they gave it. Called on load and again every time the room set is
     * recomputed, since auto-detected rooms are rebuilt rather than edited.
     */
    restoreRooms(map, snapshot = this.payload.maps[map?.id]) {
        if (!snapshot || !map?.regionManager) return false;
        let restored = false;

        for (const [roomId, finishId] of Object.entries(snapshot.floors ?? {})) {
            if (!map.regionManager.get('room', roomId) || !map.floorBuilder) continue;
            map.floorBuilder.setRoomFinish(roomId, finishId);
            restored = true;
        }

        for (const [roomId, finishId] of Object.entries(snapshot.roomWalls ?? {})) {
            if (!map.regionManager.get('room', roomId) || !map.wallBuilder) continue;
            map.wallBuilder.setRoomWallFinish(roomId, finishId);
            restored = true;
        }

        for (const [roomId, edit] of Object.entries(snapshot.roomEdits ?? {})) {
            const room = map.regionManager.get('room', roomId);
            if (!room) continue;
            room.properties = {
                ...room.properties,
                playerName: edit.name ?? null,
                roomType: edit.type ?? room.properties.roomType ?? null,
                displayName: edit.name ?? room.properties.authoredDisplayName ?? room.properties.displayName
            };
            restored = true;
        }

        return restored;
    }
}
