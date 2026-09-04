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
        const snapshot = {
            mapId: map.id,
            objects: map.objects
                .filter(object => typeof object.serializeState === 'function')
                .map(object => ({
                    id: String(object.id),
                    type: object.type,
                    variant: object.variant,
                    posX: object.posX,
                    posY: object.posY,
                    state: object.serializeState()
                })),
            droppedItems: map.droppedItems
                .filter(item => item.active && !item.collected)
                .map(item => item.serializeState()),
            build: map.buildDocument?.serialize?.() ?? null,
            terrain: map.terrainBuilder?.serializeState?.() ?? null,
            savedAt: Date.now()
        };
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

        if (map.buildDocument && map.buildTransaction) {
            const legacy = !snapshot.build && ['walls', 'roomCells', 'floors', 'roomWalls', 'roomEdits']
                .some(field => snapshot[field] != null);
            const result = map.buildDocument.restore(snapshot.build || (legacy ? { version: 7 } : null), {
                onLegacyReset: message => map.container?.ui?.showMessage?.(message, 'info', 'Build Mode')
            });
            if (result.restored || result.reset) {
                map.wallBuilder?.syncBuildDocumentRecords?.();
                if (map.wallBuilder?.pruneOrphanedRecords?.()) {
                    const level = map.buildDocument.level();
                    level.openings.replace(map.wallBuilder.openings);
                    level.fixtures.replace(map.wallBuilder.fixtures);
                }
                map.buildTransaction.reconcile('Restore build state', { renderWalls: true });
                map.wallBuilder?.rebindOpeningObjects?.(map.wallBuilder.openings.map(record => record.id));
            }
        }

        if (snapshot.terrain && map.terrainBuilder) {
            map.terrainBuilder.restoreState(snapshot.terrain);
        }
        return true;
    }
}
