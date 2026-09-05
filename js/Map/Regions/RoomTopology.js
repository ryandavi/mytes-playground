class RoomTopology {
    static compute(input) {
        const width = RoomTopology.dimension(input?.width, 'width');
        const height = RoomTopology.dimension(input?.height, 'height');
        const geometry = input.geometry || WallGeometry.compute(input.walls || new Map());
        const plans = RoomTopology.planList(input.plans);
        const grid = input.grid;
        const components = RoomTopology.openComponents(width, height, geometry.cells);
        const componentByCell = new Map(components.flatMap(component =>
            component.cells.map(key => [key, component])
        ));
        const planStates = new Map(plans.map(plan => {
            const spaces = [...new Set(plan.seedCells.map(key => componentByCell.get(key)).filter(Boolean))];
            const primary = spaces.sort((a, b) => b.cells.length - a.cells.length || a.id.localeCompare(b.id))[0] || null;
            return [plan.id, Object.freeze({
                roomId: plan.id,
                indoor: spaces.some(space => space.enclosed),
                openSpaceId: primary?.id || null,
                componentIds: Object.freeze(spaces.map(space => space.id).sort())
            })];
        }));
        const enrichedComponents = components.map(component => Object.freeze({
            ...component,
            planIds: Object.freeze(plans.filter(plan => plan.seedCells.some(key => componentByCell.get(key) === component)).map(plan => plan.id).sort())
        }));
        const loopByBlock = RoomTopology.loopBlocks(enrichedComponents);
        const adjacency = RoomTopology.openingAdjacency(input.openings || [], grid);
        const served = RoomTopology.openingsByRoom(input.openings || [], grid);
        const roofableByBuilding = RoomTopology.roofableFootprints(plans, planStates, geometry.cells, grid);
        const shellEdgesByBuilding = new Map([...roofableByBuilding].map(([buildingId, cells]) => [
            buildingId, Object.freeze(RoomTopology.boundaryEdges(cells))
        ]));
        return Object.freeze({
            revision: Number(input.revision) || 0,
            components: Object.freeze(enrichedComponents),
            openSpaces: Object.freeze(enrichedComponents.filter(component => !component.planIds.length)),
            planStates,
            adjacency: Object.freeze(adjacency),
            // Which rooms an opening of each type reaches. Adjacency answers
            // "are these two rooms connected", which says nothing about a door
            // to the outside — and a front door is still a way in.
            openingRooms: served,
            loopByBlock,
            roofableByBuilding,
            shellEdgesByBuilding,
            componentAtCell: (x, y) => componentByCell.get(BuildKeys.cell(x, y)) || null,
            loopAtBlock: (bx, by) => loopByBlock.get(BuildKeys.block(bx, by)) || null,
            roofableFootprint: buildingId => new Set(roofableByBuilding.get(String(buildingId)) || []),
            exposedWallTopEdges: buildingId => shellEdgesByBuilding.get(String(buildingId)) || []
        });
    }

    static proposeSeeds(input) {
        const width = RoomTopology.dimension(input?.width, 'width');
        const height = RoomTopology.dimension(input?.height, 'height');
        const geometry = input.geometry || WallGeometry.compute(input.walls || new Map());
        const plans = RoomTopology.planList(input.plans).map(plan => StoreDelta.clone(plan));
        for (const plan of plans) plan.seedCells = plan.seedCells.filter(key => !geometry.cells.has(key));
        const byId = new Map(plans.map(plan => [plan.id, plan]));
        const seedOwner = new Map(plans.flatMap(plan => plan.seedCells.map(key => [key, plan.id])));
        const components = RoomTopology.openComponents(width, height, geometry.cells).filter(component => component.enclosed);
        let nextRoomNumber = RoomTopology.nextRoomNumber(plans);
        const createdIds = [];
        for (const component of components) {
            const candidates = plans.filter(plan => plan.seedCells.some(key => component.cellSet.has(key)));
            const expandable = candidates.filter(plan => plan.origin !== 'painted');
            // Thresholds belong to both sides of their opening and are settled
            // by expansion, so they are never proposed to a plan.
            const unowned = component.cells.filter(key =>
                !seedOwner.has(key) && !geometry.thresholds.has(key));
            if (!unowned.length) continue;
            if (!candidates.length) {
                const previousId = RoomTopology.majorityPreviousOwner(unowned, input.previousGrid);
                const previous = byId.get(previousId);
                const id = RoomTopology.uniqueRoomId(byId, nextRoomNumber++);
                const buildingId = RoomTopology.majorityBoundaryBuilding(component, geometry.cells);
                const created = {
                    id,
                    buildingId,
                    displayName: `Room ${nextRoomNumber - 1}`,
                    authoredDisplayName: `Room ${nextRoomNumber - 1}`,
                    roomType: previous?.roomType || null,
                    origin: 'detected',
                    seedCells: [...unowned],
                    floorFinishId: previous?.floorFinishId || null,
                    wallFinishId: previous?.wallFinishId || null,
                    priority: previous?.priority ?? null,
                    properties: StoreDelta.clone(previous?.properties || {})
                };
                plans.push(created);
                byId.set(id, created);
                createdIds.push(id);
                for (const key of unowned) seedOwner.set(key, id);
                continue;
            }
            if (!expandable.length) continue;
            for (const key of unowned) {
                const winner = expandable.length === 1 ? expandable[0] : RoomTopology.nearestPlan(key, expandable);
                winner.seedCells.push(key);
                seedOwner.set(key, winner.id);
            }
        }
        for (const plan of plans) plan.seedCells = RoomPlanStore.normalizeSeeds(plan.seedCells);
        return Object.freeze({ plans: Object.freeze(plans.map(Object.freeze)), createdIds: Object.freeze(createdIds) });
    }

    static openComponents(width, height, walls) {
        const visited = new Set();
        const result = [];
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
            const start = BuildKeys.cell(x, y);
            if (walls.has(start) || visited.has(start)) continue;
            const queue = [[x, y]];
            const cells = [];
            let touchesBoundary = false;
            visited.add(start);
            while (queue.length) {
                const [cx, cy] = queue.shift();
                const key = BuildKeys.cell(cx, cy);
                cells.push(key);
                if (cx === 0 || cy === 0 || cx === width - 1 || cy === height - 1) touchesBoundary = true;
                for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
                    const nx = cx + dx;
                    const ny = cy + dy;
                    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
                    const next = BuildKeys.cell(nx, ny);
                    if (walls.has(next) || visited.has(next)) continue;
                    visited.add(next);
                    queue.push([nx, ny]);
                }
            }
            cells.sort(RoomTopology.compareCellKeys);
            result.push(Object.freeze({
                id: `${touchesBoundary ? 'outside' : 'enclosure'}:${cells[0]}`,
                cells: Object.freeze(cells),
                cellSet: new Set(cells),
                enclosed: !touchesBoundary
            }));
        }
        return result;
    }

    /** roomId → Set of opening types touching it ('door', 'window', …). */
    static openingsByRoom(openings, grid) {
        const byRoom = new Map();
        if (!grid) return byRoom;
        for (const opening of openings instanceof Map ? openings.values() : openings) {
            const type = String(opening.type || 'opening');
            for (const roomId of RoomTopology.roomsAtOpening(opening, grid)) {
                if (!byRoom.has(roomId)) byRoom.set(roomId, new Set());
                byRoom.get(roomId).add(type);
            }
        }
        return byRoom;
    }

    static roomsAtOpening(opening, grid) {
        const rooms = new Set();
        for (const cell of opening.cells || []) {
            const [x, y] = Array.isArray(cell) ? cell : [cell.x, cell.y];
            const faces = opening.axis === 'vertical' ? ['west', 'east'] : ['north', 'south'];
            for (const face of faces) for (const half of [0, 1]) {
                const [bx, by] = BuildKeys.lookBlock(x, y, face, half);
                const owner = grid.ownerAt(bx, by);
                if (owner) rooms.add(owner);
            }
        }
        return rooms;
    }

    static openingAdjacency(openings, grid) {
        if (!grid) return [];
        const pairs = new Set();
        for (const opening of openings instanceof Map ? openings.values() : openings) {
            const ids = [...RoomTopology.roomsAtOpening(opening, grid)].sort();
            for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) pairs.add(`${ids[a]}\0${ids[b]}`);
        }
        return [...pairs].sort().map(pair => {
            const [roomA, roomB] = pair.split('\0');
            return Object.freeze({ roomA, roomB });
        });
    }

    static roofableFootprints(plans, states, walls, grid) {
        const result = new Map();
        const take = (buildingId, key) => {
            if (!buildingId) return;
            if (!result.has(buildingId)) result.set(buildingId, new Set());
            result.get(buildingId).add(key);
        };
        for (const plan of plans) {
            if (!states.get(plan.id)?.indoor || !grid) continue;
            for (const key of grid.cellsOf(plan.id)) take(plan.buildingId, key);
        }
        for (const [key, wall] of walls) take(wall.buildingId, key);
        return result;
    }

    static boundaryEdges(cells) {
        const edges = [];
        const directions = [['north', 0, -1], ['east', 1, 0], ['south', 0, 1], ['west', -1, 0]];
        for (const key of [...cells].sort(RoomTopology.compareCellKeys)) {
            const { x, y } = BuildKeys.parseCell(key);
            for (const [face, dx, dy] of directions) if (!cells.has(BuildKeys.cell(x + dx, y + dy))) {
                edges.push(Object.freeze({ cell: key, face }));
            }
        }
        return edges;
    }

    static loopBlocks(components) {
        const result = new Map();
        for (const component of components) for (const key of component.cells) {
            const { x, y } = BuildKeys.parseCell(key);
            for (const [bx, by] of BuildKeys.blocksOfCell(x, y)) result.set(BuildKeys.block(bx, by), component.id);
        }
        return result;
    }

    static nearestPlan(cellKey, plans) {
        const cell = BuildKeys.parseCell(cellKey);
        return [...plans].sort((a, b) => {
            const distance = plan => Math.min(...plan.seedCells.map(key => {
                const seed = BuildKeys.parseCell(key);
                return Math.abs(seed.x - cell.x) + Math.abs(seed.y - cell.y);
            }));
            return distance(a) - distance(b) || RoomTopology.comparePlans(a, b);
        })[0];
    }

    static comparePlans(a, b) {
        const priority = (Number(b.priority) || 0) - (Number(a.priority) || 0);
        if (priority) return priority;
        if (a.seedCells.length !== b.seedCells.length) return a.seedCells.length - b.seedCells.length;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    }

    static majorityPreviousOwner(cells, grid) {
        if (!grid) return null;
        const counts = new Map();
        for (const key of cells) {
            const { x, y } = BuildKeys.parseCell(key);
            const owner = grid.ownerOfCell(x, y);
            if (owner) counts.set(owner, (counts.get(owner) || 0) + 1);
        }
        return [...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]?.[0] || null;
    }

    static majorityBoundaryBuilding(component, walls) {
        const counts = new Map();
        for (const key of component.cells) {
            const { x, y } = BuildKeys.parseCell(key);
            for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
                const buildingId = walls.get(BuildKeys.cell(x + dx, y + dy))?.buildingId;
                if (buildingId) counts.set(buildingId, (counts.get(buildingId) || 0) + 1);
            }
        }
        return [...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]?.[0] || null;
    }

    static planList(plans) {
        const values = plans?.values instanceof Function ? plans.values() : plans || [];
        return [...values].map(plan => ({ ...StoreDelta.clone(plan), id: String(plan.id), seedCells: RoomPlanStore.normalizeSeeds(plan.seedCells) }));
    }

    static nextRoomNumber(plans) {
        return plans.reduce((next, plan) => Math.max(next, Number(/^room_(\d+)$/.exec(plan.id)?.[1]) + 1 || 1), 1);
    }

    static uniqueRoomId(byId, number) {
        while (byId.has(`room_${number}`)) number++;
        return `room_${number}`;
    }

    static compareCellKeys(a, b) {
        const left = BuildKeys.parseCell(a);
        const right = BuildKeys.parseCell(b);
        return left.y - right.y || left.x - right.x;
    }

    static dimension(value, name) {
        if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
        return value;
    }
}
