/** Derived structural groups shared by paint and future building consumers. */
class BuildingTopology {
    static DIRECTIONS = Object.freeze({
        north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0]
    });

    constructor(gameMap) {
        this.gameMap = gameMap;
        this.components = new Map();
        this.componentByCell = new Map();
        this.openSpaceByCell = new Map();
        this.revision = 0;
        this._unsubscribers = [];
        const events = gameMap?.eventManager;
        if (events) {
            this._unsubscribers.push(events.on(EVENTS.ROOMS_CHANGED, payload => {
                if (!payload?.mapId || payload.mapId === this.gameMap?.id) this.rebuild();
            }));
        }
    }

    static cellKey(x, y) {
        return `${x},${y}`;
    }

    static surfaceKey(surface) {
        return `${surface.cell.x},${surface.cell.y},${surface.face},${surface.from},${surface.to}`;
    }

    getRevision() {
        return this.revision;
    }

    rebuild() {
        const builder = this.gameMap?.wallBuilder;
        const grid = this.gameMap?.gridSystem;
        if (!builder || !grid) return [];

        const oldIds = [...this.components.keys()];
        this.components.clear();
        this.componentByCell.clear();
        this.indexOpenSpaces();

        const remaining = new Set(builder.cells.keys());
        while (remaining.size > 0) {
            const first = [...remaining].sort(BuildingTopology.compareCellKeys)[0];
            const queue = [first];
            const keys = [];
            remaining.delete(first);
            for (let index = 0; index < queue.length; index++) {
                const key = queue[index];
                keys.push(key);
                const [x, y] = key.split(',').map(Number);
                for (const [dx, dy] of Object.values(BuildingTopology.DIRECTIONS)) {
                    const next = BuildingTopology.cellKey(x + dx, y + dy);
                    if (!remaining.delete(next)) continue;
                    queue.push(next);
                }
            }

            const cells = keys.map(key => builder.cells.get(key)).filter(Boolean);
            const surfaces = cells.flatMap(cell => this.getStructuralSurfaces(cell));
            const roomIds = [...new Set(surfaces.map(surface => surface.roomId).filter(Boolean))].sort();
            if (roomIds.length === 0) continue;

            const id = `building:${keys.sort(BuildingTopology.compareCellKeys)[0]}`;
            const exteriorByLoop = new Map();
            for (const surface of surfaces.filter(entry => !entry.roomId)) {
                const loopId = this.resolveOpenSpaceForSurface(surface);
                if (!exteriorByLoop.has(loopId)) exteriorByLoop.set(loopId, []);
                exteriorByLoop.get(loopId).push(surface);
            }
            const footprint = this.getRoomFootprint(roomIds);
            const component = {
                id,
                cellKeys: new Set(keys),
                roomIds,
                exteriorByLoop,
                footprint,
                bounds: BuildingTopology.boundsForKeys([...new Set([...keys, ...footprint])]),
                revision: this.revision + 1
            };
            this.components.set(id, component);
        }

        this.mergeComponentsByRooms();
        this.componentByCell.clear();
        for (const component of this.components.values()) {
            for (const key of component.cellKeys) this.componentByCell.set(key, component.id);
        }

        this.revision += 1;
        const newIds = [...this.components.keys()];
        this.gameMap?.eventManager?.emit(EVENTS.BUILDING_TOPOLOGY_CHANGED, {
            mapId: this.gameMap?.id,
            oldComponentIds: oldIds,
            componentIds: newIds,
            revision: this.revision,
            topology: this
        });
        return [...this.components.values()];
    }

    mergeComponentsByRooms() {
        let merged = true;
        while (merged) {
            merged = false;
            const list = [...this.components.values()];
            for (let leftIndex = 0; leftIndex < list.length && !merged; leftIndex += 1) {
                for (let rightIndex = leftIndex + 1; rightIndex < list.length; rightIndex += 1) {
                    const left = list[leftIndex];
                    const right = list[rightIndex];
                    if (!left.roomIds.some(roomId => right.roomIds.includes(roomId))) continue;
                    const cellKeys = new Set([...left.cellKeys, ...right.cellKeys]);
                    const roomIds = [...new Set([...left.roomIds, ...right.roomIds])].sort();
                    const exteriorByLoop = new Map();
                    for (const component of [left, right]) {
                        for (const [loopId, surfaces] of component.exteriorByLoop) {
                            exteriorByLoop.set(loopId, [...(exteriorByLoop.get(loopId) ?? []), ...surfaces]);
                        }
                    }
                    const footprint = [...new Set([...left.footprint, ...right.footprint])]
                        .sort(BuildingTopology.compareCellKeys);
                    const first = [...cellKeys].sort(BuildingTopology.compareCellKeys)[0];
                    const combined = {
                        id: `building:${first}`,
                        cellKeys,
                        roomIds,
                        exteriorByLoop,
                        footprint,
                        bounds: BuildingTopology.boundsForKeys([...cellKeys, ...footprint]),
                        revision: this.revision + 1
                    };
                    this.components.delete(left.id);
                    this.components.delete(right.id);
                    this.components.set(combined.id, combined);
                    merged = true;
                    break;
                }
            }
        }
    }

    getStructuralSurfaces(cell) {
        const builder = this.gameMap.wallBuilder;
        const faces = builder.assignFaces(cell);
        const rendered = builder.getCellSurfaces(cell);
        const construction = builder.registry.getConstruction(cell.constructionId);
        const width = construction?.cellSize ?? builder.cellSize;
        return WallMaterialRegistry.DIRECTIONS.map(face => {
            const visible = rendered.find(surface => surface.face === face);
            const horizontal = face === 'north' || face === 'south';
            return {
                cell,
                face,
                from: visible?.from ?? 0,
                to: visible?.to ?? width,
                axis: visible?.axis ?? (horizontal ? 'horizontal' : 'vertical'),
                // Paint scope follows the surface the renderer presents, which
                // may expose the outside of masonry whose opposite face belongs
                // to a room. Falling back keeps non-rendered structural faces
                // available to other topology consumers.
                roomId: visible ? visible.roomId : (faces[face]?.roomId ?? null),
                finishId: builder.resolveFaceFinishId({ ...cell, faces }, face)
            };
        });
    }

    indexOpenSpaces() {
        this.openSpaceByCell.clear();
        const grid = this.gameMap.gridSystem;
        const walls = this.gameMap.wallBuilder?.cells ?? new Map();
        const width = Number(grid.gridWidth) || 0;
        const height = Number(grid.gridHeight) || 0;
        const visited = new Set();
        let sequence = 0;
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const start = BuildingTopology.cellKey(x, y);
                if (walls.has(start) || visited.has(start)) continue;
                const queue = [[x, y]];
                const keys = [];
                let touchesEdge = false;
                visited.add(start);
                for (let index = 0; index < queue.length; index++) {
                    const [cellX, cellY] = queue[index];
                    const key = BuildingTopology.cellKey(cellX, cellY);
                    keys.push(key);
                    touchesEdge ||= cellX === 0 || cellY === 0 || cellX === width - 1 || cellY === height - 1;
                    for (const [dx, dy] of Object.values(BuildingTopology.DIRECTIONS)) {
                        const nextX = cellX + dx;
                        const nextY = cellY + dy;
                        if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) continue;
                        const next = BuildingTopology.cellKey(nextX, nextY);
                        if (walls.has(next) || visited.has(next)) continue;
                        visited.add(next);
                        queue.push([nextX, nextY]);
                    }
                }
                const id = touchesEdge ? 'outside' : `courtyard:${++sequence}`;
                for (const key of keys) this.openSpaceByCell.set(key, id);
            }
        }
    }

    resolveOpenSpaceForSurface(surface) {
        const [dx, dy] = BuildingTopology.DIRECTIONS[surface.face] ?? [0, 0];
        return this.openSpaceByCell.get(BuildingTopology.cellKey(
            surface.cell.x + dx, surface.cell.y + dy
        )) ?? 'outside';
    }

    getRoomFootprint(roomIds) {
        const result = new Set();
        for (const roomId of roomIds) {
            const room = this.gameMap.regionManager?.get('room', roomId);
            for (const cell of room?.shape?.cells ?? []) {
                const [x, y] = typeof cell === 'string'
                    ? cell.split(',').map(Number)
                    : Array.isArray(cell) ? cell : [cell.x, cell.y];
                if (Number.isInteger(x) && Number.isInteger(y)) result.add(BuildingTopology.cellKey(x, y));
            }
        }
        return [...result].sort(BuildingTopology.compareCellKeys);
    }

    getComponentAtWallFace(cell) {
        return this.components.get(this.componentByCell.get(BuildingTopology.cellKey(cell?.x, cell?.y))) ?? null;
    }

    getComponentForRoom(roomId) {
        return [...this.components.values()].find(component => component.roomIds.includes(roomId)) ?? null;
    }

    getExteriorSurfaces(componentId, loopId = null) {
        const component = this.components.get(componentId);
        if (!component) return [];
        if (loopId !== null) return [...(component.exteriorByLoop.get(loopId) ?? [])];
        return [...component.exteriorByLoop.values()].flat();
    }

    getExteriorLoopAtSurface(surface) {
        const component = this.getComponentAtWallFace(surface?.cell);
        if (!component) return null;
        const key = BuildingTopology.surfaceKey(surface);
        for (const [loopId, surfaces] of component.exteriorByLoop) {
            if (surfaces.some(entry => BuildingTopology.surfaceKey(entry) === key)) return loopId;
        }
        return null;
    }

    getFootprint(componentId) {
        return [...(this.components.get(componentId)?.footprint ?? [])];
    }

    static compareCellKeys(left, right) {
        const [leftX, leftY] = left.split(',').map(Number);
        const [rightX, rightY] = right.split(',').map(Number);
        return leftY - rightY || leftX - rightX;
    }

    static boundsForKeys(keys) {
        if (keys.length === 0) return null;
        const points = keys.map(key => key.split(',').map(Number));
        const xs = points.map(([x]) => x);
        const ys = points.map(([, y]) => y);
        return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
    }

    dispose() {
        for (const unsubscribe of this._unsubscribers) unsubscribe?.();
        this._unsubscribers = [];
        this.components.clear();
        this.componentByCell.clear();
        this.openSpaceByCell.clear();
        this.gameMap = null;
    }
}
