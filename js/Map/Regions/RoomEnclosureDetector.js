class RoomEnclosureDetector {
    constructor(gameMap) {
        this.gameMap = gameMap;
        this._timer = null;
        this._unsubscribers = [];
        this.subscribe();
    }

    subscribe() {
        const events = this.gameMap?.eventManager;
        if (!events) return;

        const scheduleForMap = payload => {
            if (!payload?.mapId || payload.mapId === this.gameMap?.id) this.schedule();
        };
        this._unsubscribers.push(events.on(EVENTS.WALL_READY, scheduleForMap));
        this._unsubscribers.push(events.on(EVENTS.WALL_GEOMETRY_CHANGED, scheduleForMap));
    }

    schedule() {
        if (SiteConfig.rooms?.autoDetect !== true || this._timer !== null) return;
        this._timer = setTimeout(() => {
            this._timer = null;
            this.detect();
        }, 0);
    }

    detect() {
        const wallBuilder = this.gameMap?.wallBuilder;
        const grid = this.gameMap?.gridSystem;
        const regionManager = this.gameMap?.regionManager;
        if (!wallBuilder || !grid || !regionManager) return [];

        const width = Number(grid.gridWidth) || 0;
        const height = Number(grid.gridHeight) || 0;
        if (width <= 0 || height <= 0) return [];

        const wallKeys = new Set([
            ...wallBuilder.baseCells.keys(),
            ...wallBuilder.openingByCell.keys()
        ]);
        const keyOf = (x, y) => `${x},${y}`;
        const isOpen = (x, y) => x >= 0 && y >= 0 && x < width && y < height && !wallKeys.has(keyOf(x, y));
        const neighbors = (x, y) => [
            [x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]
        ];

        const exterior = new Set();
        const exteriorQueue = [];
        const enqueueExterior = (x, y) => {
            const key = keyOf(x, y);
            if (!isOpen(x, y) || exterior.has(key)) return;
            exterior.add(key);
            exteriorQueue.push([x, y]);
        };

        for (let x = 0; x < width; x++) {
            enqueueExterior(x, 0);
            enqueueExterior(x, height - 1);
        }
        for (let y = 0; y < height; y++) {
            enqueueExterior(0, y);
            enqueueExterior(width - 1, y);
        }
        for (let index = 0; index < exteriorQueue.length; index++) {
            const [x, y] = exteriorQueue[index];
            for (const [nextX, nextY] of neighbors(x, y)) enqueueExterior(nextX, nextY);
        }

        const authoredRooms = regionManager.all('room').filter(room => room.properties?.autoDetected !== true);
        const visited = new Set(exterior);
        const candidates = [];
        const minArea = Math.max(1, Number(SiteConfig.rooms?.minAreaCells) || 1);
        const cellSize = Number(grid.config?.cellSize) || 32;

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const startKey = keyOf(x, y);
                if (!isOpen(x, y) || visited.has(startKey)) continue;

                const component = [];
                const queue = [[x, y]];
                visited.add(startKey);
                for (let index = 0; index < queue.length; index++) {
                    const [cellX, cellY] = queue[index];
                    component.push([cellX, cellY]);
                    for (const [nextX, nextY] of neighbors(cellX, cellY)) {
                        const nextKey = keyOf(nextX, nextY);
                        if (!isOpen(nextX, nextY) || visited.has(nextKey)) continue;
                        visited.add(nextKey);
                        queue.push([nextX, nextY]);
                    }
                }

                if (component.length < minArea) continue;
                const intersectsAuthored = component.some(([cellX, cellY]) => {
                    const centerX = (cellX + 0.5) * cellSize;
                    const centerY = (cellY + 0.5) * cellSize;
                    return authoredRooms.some(room => room.contains(centerX, centerY));
                });
                if (!intersectsAuthored) candidates.push(component);
            }
        }

        candidates.sort((a, b) => a[0][1] - b[0][1] || a[0][0] - b[0][0]);
        for (const existing of regionManager.all('room')) {
            if (existing.properties?.autoDetected === true) regionManager.remove(existing);
        }

        const lighting = Utility.deepClone(this.gameMap.environmentManager?.getRoomDefaults?.() || {});
        const added = candidates.map((cells, index) => regionManager.add(new SpatialRegion({
            id: `room_auto_${index + 1}`,
            layer: 'room',
            shape: { kind: 'tilemask', cells, cellSize },
            properties: {
                displayName: 'Room',
                indoor: true,
                autoDetected: true,
                lighting: Utility.deepClone(lighting)
            },
            source: this
        })));

        for (const myte of this.gameMap.mytes || []) {
            regionManager.updateMembership(myte, { layers: ['room'], force: true });
        }
        this.gameMap.floorBuilder?.build();
        this.gameMap.container?.worldState?.restoreFloors?.(this.gameMap);
        this.gameMap.buildDoorRoomTopology();
        this.gameMap.environmentManager?.rebuildWindowLighting();
        if (this.gameMap.environmentManager) {
            this.gameMap.environmentManager._lightingSignature = '';
            this.gameMap.environmentManager.renderLighting(true);
        }

        return added;
    }

    dispose() {
        if (this._timer !== null) clearTimeout(this._timer);
        this._timer = null;
        this._unsubscribers.forEach(unsubscribe => unsubscribe());
        this._unsubscribers = [];
        this.gameMap = null;
    }
}
