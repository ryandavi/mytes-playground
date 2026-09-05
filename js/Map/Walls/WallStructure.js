class WallStructure extends WallFixtures {
    syncGridWallState() {
        const gridSystem = this.gameMap.gridSystem;
        if (!gridSystem?.grid) return;
        const previous = this._gridWallBaseline ||= new Map();
        const stamped = new Set();
        let changed = false;

        for (const cell of this.baseCells.values()) {
            const key = `${cell.x},${cell.y}`;
            const gridCell = gridSystem.grid[cell.x]?.[cell.y];
            if (!gridCell) continue;
            if (!previous.has(key)) {
                previous.set(key, {
                    tileWalkable: gridCell.tileWalkable,
                    wallBlocksLineOfSight: gridCell.wallBlocksLineOfSight
                });
                changed = true;
            }
            stamped.add(key);
            const opening = this.openingByCell.get(key);
            gridCell.tileWalkable = opening?.type === 'door';
            gridCell.wallBlocksLineOfSight = opening
                ? opening.blocksLineOfSight === true
                : cell.blocksLineOfSight !== false;
            gridCell.walkable = gridCell.tileWalkable && gridCell.objectWalkable;
        }

        for (const [key, baseline] of previous) {
            if (stamped.has(key)) continue;
            previous.delete(key);
            changed = true;
            const [x, y] = key.split(',').map(Number);
            const gridCell = gridSystem.grid[x]?.[y];
            if (!gridCell) continue;
            gridCell.tileWalkable = baseline.tileWalkable;
            gridCell.wallBlocksLineOfSight = baseline.wallBlocksLineOfSight;
            gridCell.walkable = gridCell.tileWalkable && gridCell.objectWalkable;
        }

        // The pathfinder charges a per-node cost from a wall-adjacency count
        // precomputed at load, on the assumption that tile walkability never
        // moves. Build mode moves it, so the count is recomputed whenever the
        // set of wall cells changes.
        if (changed) {
            gridSystem._computeStaticWallCounts?.();
            // The debug grid is only redrawn when something marks it stale, and
            // wall edits move the very cells it colours.
            if (gridSystem.debugMode) gridSystem._debugDirty = true;
        }
        gridSystem.invalidatePathfinderCaches?.();
    }

    computeMask(cell) {
        let mask = 0;
        for (const direction of WallBuilder.DIRECTIONS) {
            const neighbor = this.cells.get(`${cell.x + direction.dx},${cell.y + direction.dy}`);
            if (neighbor && neighbor.connectGroup === cell.connectGroup) mask |= direction.bit;
        }
        return mask;
    }

    roomAtOpenCell(x, y) {
        const roomId = this.previewCache?.grid?.ownerOfCell?.(x, y) ??
            this.gameMap?.buildTransaction?.cache?.grid?.ownerOfCell?.(x, y);
        return roomId ? this.gameMap.regionManager?.get('room', roomId) || null : null;
    }

    rectOverlapsWall(bounds) {
        const cellSize = this.cellSize;
        const startX = Math.floor(bounds.x / cellSize);
        const startY = Math.floor(bounds.y / cellSize);
        const endX = Math.floor((bounds.x + Math.max(1, bounds.width) - 1) / cellSize);
        const endY = Math.floor((bounds.y + Math.max(1, bounds.height) - 1) / cellSize);
        for (let x = startX; x <= endX; x += 1) {
            for (let y = startY; y <= endY; y += 1) {
                if (this.baseCells.has(`${x},${y}`) && !this.openingByCell.has(`${x},${y}`)) return true;
            }
        }
        return false;
    }

    getFaceRoomIdAt(x, y, face) {
        const cache = this.gameMap?.buildTransaction?.cache;
        if (!cache || !this.cells.has(BuildKeys.cell(x, y))) return null;
        const topology = { ...cache.topology, walls: cache.geometry };
        for (const half of [0, 1]) {
            const classification = WallFaceResolver.classify({ x, y, face, half }, cache.grid, topology);
            if (classification.kind === 'room') return classification.roomId;
        }
        return null;
    }

    sampleCellTemplate(cellOrX, y = null) {
        const cell = typeof cellOrX === 'object'
            ? this.baseCells.get(`${cellOrX.x},${cellOrX.y}`)
            : this.baseCells.get(`${cellOrX},${y}`);
        if (!cell) return null;
        return Utility.deepClone({
            constructionId: cell.constructionId,
            heightCells: cell.heightCells,
            connectGroup: cell.connectGroup
        });
    }

    syncBuildDocumentRecords() {
        const level = this.gameMap?.buildDocument?.level?.();
        if (!level) return false;
        this.openings = level.openings.values().map(record => Utility.deepClone(record));
        this.fixtures = level.fixtures.values().map(record => Utility.deepClone(record));
        this.wallData.attachments = level.attachments.values().map(record => Utility.deepClone(record));
        return true;
    }

    applyWallCellChanges(changes = [], options = {}) {
        const transaction = this.gameMap?.buildTransaction;
        if (!transaction) return false;
        const normalized = changes.filter(change => Number.isInteger(change?.x) && Number.isInteger(change?.y));
        if (normalized.length === 0) return false;
        const rules = options.validate === false ? null : this.gameMap.container?.buildRules;
        const applied = [];
        const rejected = [];
        const travellingIds = this.getTravellingRecordIds(options.contentMove);
        this.withTravellingRecords(travellingIds, () => {
            for (const change of normalized) {
                const verdict = !rules
                    ? BuildRules.ALLOWED
                    : (change.data ?? null) === null
                        ? rules.canRemoveWallCell(change.x, change.y)
                        : rules.canBuildWallCell(change.x, change.y);
                if (verdict.allowed) applied.push(change);
                else rejected.push({ ...change, reason: verdict.reason });
            }
        });
        if (options.atomic === true && rejected.length > 0) return { applied: [], rejected, inverse: [] };
        if (applied.length === 0) return { applied, rejected, inverse: [] };
        const inverse = applied.map(({ x, y }) => ({
            x,
            y,
            data: this.baseCells.has(BuildKeys.cell(x, y))
                ? this.baseCells.get(BuildKeys.cell(x, y))
                : null
        }));
        const defaults = this.wallData.defaults || {};
        // Resolved once for the whole batch: cells laid in one gesture are one
        // act of building, and none of them is in `baseCells` yet, so asking
        // per cell would make every cell of a detached run its own building.
        let batchBuildingId = this.resolveBuildingId(
            applied.filter(change => (change.data ?? null) !== null && change.data.buildingId == null)
        );
        const move = options.contentMove;
        const inverseMove = WallBuilder.invertContentMove(move);
        if (move) this.translateWallContents(move);
        try {
            transaction.run(options.label || 'Edit walls', (draft, level) => {
                for (const building of options.buildingCopies || []) draft.buildings.set(building.id, building);
                for (const room of options.roomCopies || []) level.rooms.set(room.id, room);
                if (move) {
                    level.atoms.translateCells(move.cells, move.dx, move.dy);
                    for (const store of [level.openings, level.fixtures, level.attachments]) {
                        store.translateCells(move.cells, move.dx, move.dy);
                    }
                }
                for (const extension of options.atomExtensions || []) {
                    for (const target of extension.targets || []) {
                        for (const atom of extension.atoms || []) {
                            const copied = { ...atom, x: target.x, y: target.y };
                            level.atoms.set(BuildKeys.atom(copied.x, copied.y, copied.face, copied.half), copied);
                        }
                    }
                }
                for (const change of applied) {
                    const key = BuildKeys.cell(change.x, change.y);
                    if ((change.data ?? null) === null) {
                        level.walls.delete(key);
                        level.atoms.deleteCell(change.x, change.y);
                        continue;
                    }
                    const data = { ...defaults, ...change.data };
                    if (data.buildingId == null && batchBuildingId === null) {
                        batchBuildingId = WallStructure.createBuilding(draft);
                    }
                    level.walls.setCell(change.x, change.y, {
                        constructionId: data.constructionId || defaults.constructionId,
                        heightCells: Number(data.heightCells) || Number(defaults.heightCells) || 1,
                        connectGroup: data.connectGroup || defaults.connectGroup || data.constructionId,
                        buildingId: data.buildingId ?? batchBuildingId
                    });
                    for (const room of level.rooms.values()) {
                        if (room.seedCells?.includes(key)) level.rooms.removeSeed(room.id, key);
                    }
                }
                // A room you wall in belongs to the building those walls make.
                // Without this an enclosed Area keeps its walls in one building
                // and itself on the site, which is what the Navigator was
                // reporting as unassigned.
                for (const roomId of options.adoptRoomIds || []) {
                    const room = level.rooms.get(roomId);
                    if (batchBuildingId && room && !room.buildingId) {
                        level.rooms.set(roomId, { ...room, buildingId: batchBuildingId });
                    }
                }
                for (const change of options.roomChanges || []) {
                    const key = BuildKeys.cell(change.x, change.y);
                    const previousOwner = level.rooms.ownerOfSeed(key);
                    if (previousOwner) level.rooms.removeSeed(previousOwner, key);
                    if (change.roomId && level.rooms.has(change.roomId)) {
                        level.rooms.assignSeed(change.roomId, key);
                    }
                }
                for (const roomId of options.deleteRoomIds || []) level.rooms.delete(roomId);
                for (const buildingId of options.deleteBuildingIds || []) draft.buildings.delete(buildingId);
            });
        } catch (error) {
            if (move) this.translateWallContents(inverseMove);
            throw error;
        }
        if (travellingIds.length) this.rebindOpeningObjects(travellingIds);
        return { applied, rejected, inverse };
    }

    /**
     * The building newly built cells join: the structure they touch, else the
     * building of a room they run alongside, else null — and null means a new
     * building, because nothing else in the model says two structures that
     * touch nothing are the same one. Never the first building on the map:
     * that silently annexed every shed to the house.
     */
    resolveBuildingId(cells) {
        if (cells.length === 0) return null;
        const level = this.gameMap?.buildDocument?.level?.();
        const grid = this.gameMap?.buildTransaction?.cache?.grid;
        const pending = new Set(cells.map(cell => BuildKeys.cell(cell.x, cell.y)));
        let roomBuildingId = null;
        for (const cell of cells) {
            for (const direction of WallGeometry.DIRECTIONS) {
                const x = cell.x + direction.dx;
                const y = cell.y + direction.dy;
                const key = BuildKeys.cell(x, y);
                if (pending.has(key)) continue;
                const neighbour = this.baseCells.get(key);
                if (neighbour?.buildingId) return neighbour.buildingId;
                if (roomBuildingId) continue;
                const roomId = grid?.ownerOfCell?.(x, y) ?? null;
                roomBuildingId = (roomId && level?.rooms.get(roomId)?.buildingId) || null;
            }
        }
        return roomBuildingId;
    }

    static createBuilding(draft, displayName = null) {
        let index = draft.buildings.size + 1;
        while (draft.buildings.has(`building_${index}`)) index++;
        const id = `building_${index}`;
        const name = displayName || `Building ${index}`;
        draft.buildings.set(id, { id, displayName: name, authoredDisplayName: name });
        return id;
    }

    translateWallContents(move) {
        const { cells, dx = 0, dy = 0 } = move || {};
        if (!cells || cells.size === 0 || (dx === 0 && dy === 0)) return [];
        const inside = (x, y) => cells.has(`${x},${y}`);
        const moved = [];

        const carryObject = (id) => {
            const object = this.gameMap.getObjectById?.(id);
            if (!object) return;
            object.posX += dx * this.cellSize;
            object.posY += dy * this.cellSize;
            object.updatePosition?.();
            object.syncRenderLayer?.();
            object.handleMovedEvent?.();
        };

        for (const opening of this.openings) {
            const footprint = opening.cells || [];
            if (footprint.length === 0 || !footprint.every(([x, y]) => inside(x, y))) continue;
            opening.cells = footprint.map(([x, y]) => [x + dx, y + dy]);
            carryObject(opening.id);
            moved.push(String(opening.id));
        }

        for (const record of [...this.fixtures, ...(this.wallData.attachments || [])]) {
            const from = record.cells?.from;
            const to = record.cells?.to || from;
            if (!from || !inside(from[0], from[1]) || !inside(to[0], to[1])) continue;
            record.cells = { from: [from[0] + dx, from[1] + dy], to: [to[0] + dx, to[1] + dy] };
            carryObject(record.id);
            moved.push(String(record.id));
        }

        // Paint is applied to a room's wall, and this is still that wall.
        // Leaving the overrides behind would repaint the cells the run vacated
        // — which are about to be nothing at all — and bring the run up in the
        // room's base finish, losing every stroke the player put on it.
        return moved;
    }

    static invertContentMove(move) {
        if (!move?.cells) return null;
        const cells = new Set([...move.cells].map(key => {
            const [x, y] = key.split(',').map(Number);
            return `${x + (move.dx || 0)},${y + (move.dy || 0)}`;
        }));
        return { cells, dx: -(move.dx || 0), dy: -(move.dy || 0) };
    }

    getTravellingRecordIds(move) {
        const { cells } = move || {};
        if (!cells || cells.size === 0) return [];
        const inside = (x, y) => cells.has(`${x},${y}`);
        const ids = [];
        for (const opening of this.openings) {
            const footprint = opening.cells || [];
            if (footprint.length > 0 && footprint.every(([x, y]) => inside(x, y))) ids.push(String(opening.id));
        }
        for (const record of [...this.fixtures, ...(this.wallData.attachments || [])]) {
            const from = record.cells?.from;
            const to = record.cells?.to || from;
            if (from && inside(from[0], from[1]) && inside(to[0], to[1])) ids.push(String(record.id));
        }
        return ids;
    }

    withTravellingRecords(ids, fn) {
        const previous = this._travellingRecordIds;
        this._travellingRecordIds = new Set(ids || []);
        try {
            return fn();
        } finally {
            this._travellingRecordIds = previous;
        }
    }
}

