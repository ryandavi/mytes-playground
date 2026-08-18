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
        const components = [];
        const enclosed = [];
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

                // Every enclosed component, not just the ones that become
                // rooms: the same flood fill answers "which authored rooms are
                // one open space", which is what stops a half-height wall
                // between two of them from cutting away on one side only.
                components.push(component);
                if (component.length >= minArea) enclosed.push(component);
            }
        }

        const candidates = this.unclaimedComponents(enclosed, authoredRooms, cellSize);
        candidates.sort((a, b) => a[0][1] - b[0][1] || a[0][0] - b[0][0]);
        for (const existing of regionManager.all('room')) {
            if (existing.properties?.autoDetected === true) regionManager.remove(existing);
        }

        const lighting = Utility.deepClone(this.gameMap.environmentManager?.getRoomDefaults?.() || {});
        const added = candidates.map((cells, index) => {
            const parent = this.roomDividedBy(cells, cellSize);
            return regionManager.add(new SpatialRegion({
                id: `room_auto_${index + 1}`,
                layer: 'room',
                shape: { kind: 'tilemask', cells, cellSize },
                properties: {
                    // A placeholder until the player names it in the Surfaces
                    // panel; numbered so two new rooms are at least tellable apart.
                    displayName: `Room ${index + 1}`,
                    authoredDisplayName: `Room ${index + 1}`,
                    indoor: true,
                    autoDetected: true,
                    // Walling off a corner of a room does not redecorate it.
                    // A new room with no finishes came up in bare plaster with
                    // the map's own ground showing through, so subdividing a
                    // space you had already decorated undid the decorating —
                    // and the seam where the new room met the old one was the
                    // first thing you saw. Inheriting means a partition wall
                    // looks like it was always there, and repainting one side
                    // afterwards is a choice rather than a repair.
                    wallFinishId: parent?.properties?.wallFinishId ?? null,
                    floorFinishId: parent?.properties?.floorFinishId ?? null,
                    lighting: Utility.deepClone(parent?.properties?.lighting ?? lighting)
                },
                source: this
            }));
        });

        this.assignOpenSpaces(components, cellSize);

        for (const myte of this.gameMap.mytes || []) {
            regionManager.updateMembership(myte, { layers: ['room'], force: true });
        }
        // Before the floors and the walls are rebuilt: both read room ids, and
        // the room set has only just changed under them.
        this.gameMap.wallBuilder?.refreshRoomFaces?.();
        this.gameMap.floorBuilder?.build();
        this.gameMap.container?.worldState?.restoreRooms?.(this.gameMap);
        this.gameMap.buildDoorRoomTopology();
        this.gameMap.environmentManager?.rebuildWindowLighting();
        if (this.gameMap.environmentManager) {
            this.gameMap.environmentManager._lightingSignature = '';
            this.gameMap.environmentManager.renderLighting(true);
        }

        return added;
    }

    /**
     * The enclosed areas that are not already somebody's room.
     *
     * Each authored room is matched to the ONE component holding most of it —
     * that component is the room, and is not duplicated. Everything else is a
     * space the player made, including a space made *inside* an authored room:
     * walling off a corner of the Kitchen used to produce a component that
     * merely intersected the Kitchen and was thrown away on that basis, so the
     * new room could never be selected or given a floor of its own.
     */
    unclaimedComponents(components, authoredRooms, cellSize) {
        const claimed = new Set();
        for (const room of authoredRooms) {
            let best = null;
            let bestCount = 0;
            for (const component of components) {
                const count = component.reduce((total, [cellX, cellY]) =>
                    total + (room.contains((cellX + 0.5) * cellSize, (cellY + 0.5) * cellSize) ? 1 : 0), 0);
                if (count > bestCount) {
                    bestCount = count;
                    best = component;
                }
            }
            if (best) claimed.add(best);
        }
        return components.filter(component => !claimed.has(component));
    }

    /**
     * The room a newly enclosed area was taken out of, if it was taken out of
     * one — the space whose ground these cells stood on a moment ago.
     *
     * Innermost, and decided by where the new cells actually are rather than by
     * bounds containment: partition a room that is itself inside another and
     * the new room should take after its immediate parent, not the outermost
     * one it happens to sit within. A room built across the line where two
     * spaces meet belongs to neither cleanly, so the one holding most of it
     * wins — the same "most of it" rule unclaimedComponents matches on.
     * @returns {SpatialRegion|null}
     */
    roomDividedBy(cells, cellSize) {
        const tally = new Map();
        for (const [cellX, cellY] of cells) {
            const room = this.gameMap.regionManager?.innermostAt(
                (cellX + 0.5) * cellSize, (cellY + 0.5) * cellSize, 'room', cellSize
            );
            if (room) tally.set(room, (tally.get(room) || 0) + 1);
        }
        return [...tally.entries()].reduce((best, entry) =>
            !best || entry[1] > best[1] ? entry : best, null)?.[0] ?? null;
    }

    /**
     * Stamps every room with the id of the enclosed area it belongs to.
     *
     * Two rooms only share one when nothing walls them apart — the fill treats
     * wall cells AND openings as solid, so a doorway between two rooms keeps
     * them separate, while a half-height divider or a wall that stops short
     * leaves them as one space. That is the distinction the cutaway needs: a
     * wall bounding one open area belongs to all of it, so standing anywhere
     * inside lowers the whole run rather than the half whose far side happens
     * to be the room you are standing in.
     */
    assignOpenSpaces(components, cellSize) {
        const rooms = this.gameMap?.regionManager?.all('room') || [];
        for (const room of rooms) room.properties.openSpaceId = null;
        components.forEach((cells, index) => {
            const id = `open_${index + 1}`;
            for (const room of rooms) {
                if (room.properties.openSpaceId) continue;
                const inside = cells.some(([cellX, cellY]) =>
                    room.contains((cellX + 0.5) * cellSize, (cellY + 0.5) * cellSize));
                if (inside) room.properties.openSpaceId = id;
            }
        });
        return rooms;
    }

    dispose() {
        if (this._timer !== null) clearTimeout(this._timer);
        this._timer = null;
        this._unsubscribers.forEach(unsubscribe => unsubscribe());
        this._unsubscribers = [];
        this.gameMap = null;
    }
}
