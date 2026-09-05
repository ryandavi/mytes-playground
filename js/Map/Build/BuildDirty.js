class BuildDirty {
    static compute(before, after, previousGrid, nextGrid,
        levelId = BuildDocument.DEFAULT_LEVEL_ID, geometry = null, topology = null) {
        const cells = new Set();
        const addCellDelta = delta => {
            for (const key of [...Object.keys(delta.set || {}), ...(delta.removed || [])]) {
                const cellKey = key.includes('/') ? key.split('/')[0] : key;
                if (/^-?\d+,-?\d+$/.test(cellKey)) cells.add(cellKey);
            }
        };
        const wallDelta = StoreDelta.diff(before.levels?.[levelId]?.walls, after.levels?.[levelId]?.walls);
        addCellDelta(wallDelta);
        addCellDelta(StoreDelta.diff(before.levels?.[levelId]?.atoms, after.levels?.[levelId]?.atoms));
        BuildDirty.addBuildingFinishCells(cells, before, after, levelId);
        const structuralCells = new Set([...Object.keys(wallDelta.set || {}), ...(wallDelta.removed || [])]);
        const recordsChanged = BuildDirty.addRecordCells(cells, before, after, levelId);
        const blocks = nextGrid ? [...structuralCells].flatMap(key => {
            const { x, y } = BuildKeys.parseCell(key);
            return BuildKeys.blocksOfCell(x, y).map(([bx, by]) => BuildKeys.block(bx, by));
        }) : [];
        const ownershipChanged = BuildDirty.addOwnershipBlocks(blocks, previousGrid, nextGrid);
        const roomDelta = StoreDelta.diff(before.levels?.[levelId]?.rooms, after.levels?.[levelId]?.rooms);
        const previousRooms = before.levels?.[levelId]?.rooms;
        const previousRoom = id => previousRooms instanceof Map ? previousRooms.get(id) : previousRooms?.[id];
        const removedRoom = (roomDelta.removed || []).length > 0;
        const roomTopologyChanged = removedRoom || Object.entries(roomDelta.set || {}).some(([id, room]) => {
            const previous = previousRoom(id);
            return !previous || previous.buildingId !== room.buildingId ||
                JSON.stringify(previous.seedCells || []) !== JSON.stringify(room.seedCells || []);
        });
        const roomEnvironmentChanged = removedRoom || Object.entries(roomDelta.set || {}).some(([id, room]) => {
            const previous = previousRoom(id);
            return !previous || previous.roomType !== room.roomType ||
                JSON.stringify(previous.properties || {}) !== JSON.stringify(room.properties || {});
        });
        const roofBuildingIds = BuildDirty.roofBuildings(
            before, after, levelId, structuralCells, roomDelta, previousRoom
        );
        BuildDirty.addFinishChanges(cells, blocks, roomDelta, previousRoom, nextGrid, geometry, topology);
        return Object.freeze({
            cells: Object.freeze([...cells].sort()),
            blocks: Object.freeze([...new Set(blocks)].sort()),
            geometryChanged: structuralCells.size > 0,
            ownershipChanged,
            roomTopologyChanged,
            roomEnvironmentChanged,
            roofBuildingIds: Object.freeze([...roofBuildingIds].sort()),
            recordsChanged: Object.freeze(recordsChanged)
        });
    }

    static roofBuildings(before, after, levelId, structuralCells, roomDelta, previousRoom) {
        const ids = new Set();
        const previousWalls = before.levels?.[levelId]?.walls;
        const nextWalls = after.levels?.[levelId]?.walls;
        const record = (store, key) => store instanceof Map ? store.get(key) : store?.[key];
        for (const key of structuralCells) {
            const beforeId = record(previousWalls, key)?.buildingId;
            const afterId = record(nextWalls, key)?.buildingId;
            if (beforeId) ids.add(beforeId);
            if (afterId) ids.add(afterId);
        }
        const roofDelta = StoreDelta.diff(before.levels?.[levelId]?.roofs, after.levels?.[levelId]?.roofs);
        const previousRoofs = before.levels?.[levelId]?.roofs;
        for (const roof of Object.values(roofDelta.set || {})) if (roof.buildingId) ids.add(roof.buildingId);
        for (const key of roofDelta.removed || []) {
            const buildingId = record(previousRoofs, key)?.buildingId;
            if (buildingId) ids.add(buildingId);
        }
        for (const [roomId, room] of Object.entries(roomDelta.set || {})) {
            if (room.buildingId) ids.add(room.buildingId);
            if (previousRoom(roomId)?.buildingId) ids.add(previousRoom(roomId).buildingId);
        }
        for (const roomId of roomDelta.removed || []) if (previousRoom(roomId)?.buildingId) {
            ids.add(previousRoom(roomId).buildingId);
        }
        return ids;
    }

    static addBuildingFinishCells(cells, before, after, levelId) {
        const delta = StoreDelta.diff(before.buildings, after.buildings);
        const previous = id => before.buildings instanceof Map ? before.buildings.get(id) : before.buildings?.[id];
        const nextWalls = after.levels?.[levelId]?.walls;
        for (const [id, building] of Object.entries(delta.set || {})) {
            if ((previous(id)?.exteriorFinishId ?? null) === (building?.exteriorFinishId ?? null)) continue;
            const walls = nextWalls instanceof Map ? nextWalls.values() : Object.values(nextWalls || {});
            for (const wall of walls) if (wall.buildingId === id) cells.add(BuildKeys.cell(wall.x, wall.y));
        }
    }

    static addRecordCells(cells, before, after, levelId) {
        const changed = { openings: false, fixtures: false, attachments: false };
        for (const name of Object.keys(changed)) {
            const delta = StoreDelta.diff(before.levels?.[levelId]?.[name], after.levels?.[levelId]?.[name]);
            const previousStore = before.levels?.[levelId]?.[name];
            const previous = key => previousStore instanceof Map ? previousStore.get(key) : previousStore?.[key];
            const take = record => {
                const points = Array.isArray(record?.cells)
                    ? record.cells : [record?.cells?.from, record?.cells?.to || record?.cells?.from];
                for (const point of points.filter(Array.isArray)) cells.add(BuildKeys.cell(point[0], point[1]));
            };
            for (const record of Object.values(delta.set || {})) take(record);
            for (const key of delta.removed || []) take(previous(key));
            changed[name] = !StoreDelta.isEmpty(delta);
        }
        return changed;
    }

    static addOwnershipBlocks(blocks, previousGrid, nextGrid) {
        let changed = !previousGrid && !!nextGrid;
        if (!previousGrid || !nextGrid) return changed;
        for (let by = 0; by < nextGrid.blockHeight; by++) for (let bx = 0; bx < nextGrid.blockWidth; bx++) {
            if (previousGrid.ownerAt(bx, by) === nextGrid.ownerAt(bx, by)) continue;
            changed = true;
            blocks.push(BuildKeys.block(bx, by));
        }
        return changed;
    }

    static addFinishChanges(cells, blocks, roomDelta, previousRoom, grid, geometry, topology) {
        for (const [roomId, room] of Object.entries(roomDelta.set || {})) {
            const previous = previousRoom(roomId);
            if (grid && (previous?.floorFinishId ?? null) !== (room?.floorFinishId ?? null)) {
                for (const [bx, by] of grid.blocksOf(roomId)) blocks.push(BuildKeys.block(bx, by));
            }
            if (!grid || !geometry || (previous?.wallFinishId ?? null) === (room?.wallFinishId ?? null)) continue;
            for (const cell of geometry.cells.values()) {
                const ownsFace = (geometry.paintSpans.get(BuildKeys.cell(cell.x, cell.y)) || []).some(span =>
                    WallFaceResolver.visibleSurface(
                        { x: cell.x, y: cell.y, kind: span.kind, half: span.half },
                        grid, { ...topology, walls: geometry }, geometry
                    ).classification.roomId === roomId
                );
                if (ownsFace) cells.add(BuildKeys.cell(cell.x, cell.y));
            }
        }
    }
}
