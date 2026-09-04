// ─────────────────────────────────────────────────────────────────────────────
// FloorBuilder — a customisable floor per room, the way a finish is per wall.
//
// The map's own tile layers still draw the ground. This paints OVER them, but
// only inside rooms that ask for it: a room with no `floorFinishId` is left
// exactly as authored, so adding the system changes nothing until a room opts
// in. That is what keeps it from fighting the baked background.
//
// One canvas per room, clipped to the blocks that room OWNS. Ownership is
// computed once for the whole map and shared by every room, so two floors can
// no more overlap than two people can stand in one place — see computeOwnership
// for why that replaced each room masking itself against all the others.
//
// It sits inside the background layer, above the baked map image and below
// ground decor, so objects, mytes and walls all still draw on top.
// ─────────────────────────────────────────────────────────────────────────────
class FloorBuilder {
    // The map is divided into blocks, not cells, because a floor stops on the
    // CENTRELINE of the wall beside it — half a cell in. Two blocks per cell is
    // the coarsest grid that can express that, and every boundary this system
    // draws lands on one.
    static BLOCKS_PER_CELL = 2;

    constructor(gameMap, registry) {
        this.gameMap = gameMap;
        this.registry = registry;
        this.cellSize = gameMap.gridSystem?.config?.cellSize ?? 32;
        this.surfaces = new Map();
        this.container = null;
        // roomId -> [[blockX, blockY], ...]. Null until built; geometry-derived,
        // so it survives a finish change and is thrown away by build().
        this.ownedBlocks = null;
    }

    get blockSize() {
        return this.cellSize / FloorBuilder.BLOCKS_PER_CELL;
    }

    /** Paints every room that asks for a floor. Safe to call again; it rebuilds. */
    build() {
        this.clear();
        this.ownedBlocks = null;
        const rooms = this.gameMap.regionManager?.all('room') ?? [];
        for (const room of rooms) this.paintRoom(room);
        return this.surfaces.size;
    }

    ensureContainer() {
        if (this.container?.isConnected) return this.container;
        const layer = this.gameMap.layers?.background;
        if (!layer) return null;
        this.container = document.createElement('div');
        this.container.className = 'floor-surfaces';
        // NO render-inset offset here. `.layer` is already positioned at
        // `--map-render-inset-*` by CSS and sized to the map, so a layer child
        // is ALREADY in map coordinates. Adding the offset again shifts every
        // floor by the reserved strip — the same double-offset that once moved
        // the cursor away from the art.
        Object.assign(this.container.style, {
            position: 'absolute',
            inset: '0',
            pointerEvents: 'none'
        });
        layer.appendChild(this.container);
        return this.container;
    }

    resolveFinishId(room) {
        return room?.properties?.floorFinishId || SiteConfig.floorSystem?.defaultFinishId || null;
    }

    paintRoom(room) {
        const finishId = this.resolveFinishId(room);
        if (!finishId) return null;                       // authored floor stands
        const tile = this.registry?.getTile(finishId);
        const container = this.ensureContainer();
        const area = this.paintedArea(room);
        if (!tile || !container || !area) return null;

        const canvas = this.createSurfaceCanvas(area, room.id);
        canvas.className = 'floor-surface';
        const context = canvas.getContext('2d');
        context.imageSmoothingEnabled = false;
        this.clipToRoom(context, room, area);
        this.fillTiles(context, tile, area);
        context.restore();

        container.appendChild(canvas);
        this.surfaces.set(room.id, { canvas, finishId });
        return canvas;
    }

    /**
     * A canvas over one room, covering exactly the ground that room owns.
     *
     * The customize highlight used to be a CSS outline on the floor canvas,
     * which is a bounding box plus edge bleed — so it drew a rectangle around
     * rooms that are not rectangles, and where two of those boxes overlapped
     * only one room could ever be hovered. A room with no finish had no canvas
     * at all and so could not be highlighted or clicked. This paints the owned
     * blocks themselves, which every room has whether or not it carries a floor
     * — and being the same blocks the floor uses, the highlight cannot promise
     * ground the floor will not cover.
     */
    createRoomOverlay(room, { fill, className = '', outline = null } = {}) {
        const area = this.paintedArea(room);
        const container = this.ensureContainer();
        if (!area || !container) return null;

        const canvas = this.createSurfaceCanvas(area, room.id);
        canvas.className = className;
        const context = canvas.getContext('2d');
        this.clipToRoom(context, room, area);
        context.fillStyle = fill;
        context.fillRect(0, 0, area.width, area.height);
        context.restore();
        if (outline) this.strokeRoomEdges(context, room, area, outline);

        container.appendChild(canvas);
        return canvas;
    }

    /**
     * A line round the outside of a room.
     *
     * A wash of colour over a patterned floor is easy to miss and hard to read
     * the edges of, which is the one thing it is there to say — where this room
     * stops. Where two rooms meet with no wall between them, the line IS the
     * boundary; there is nothing else standing there to be seen.
     *
     * Drawn from the same owned blocks as the fill, so the outline cannot
     * disagree with it: an edge is any side of a block whose neighbour belongs
     * to somebody else.
     */
    strokeRoomEdges(context, room, area, colour) {
        const size = this.blockSize;
        const blocks = this.blocksOf(room.id);
        const owned = new Set(blocks.map(([blockX, blockY]) => `${blockX},${blockY}`));
        context.save();
        context.strokeStyle = colour;
        context.lineWidth = 2;
        context.beginPath();
        for (const [blockX, blockY] of blocks) {
            const left = (blockX * size) - area.x;
            const top = (blockY * size) - area.y;
            if (!owned.has(`${blockX - 1},${blockY}`)) { context.moveTo(left, top); context.lineTo(left, top + size); }
            if (!owned.has(`${blockX + 1},${blockY}`)) { context.moveTo(left + size, top); context.lineTo(left + size, top + size); }
            if (!owned.has(`${blockX},${blockY - 1}`)) { context.moveTo(left, top); context.lineTo(left + size, top); }
            if (!owned.has(`${blockX},${blockY + 1}`)) { context.moveTo(left, top + size); context.lineTo(left + size, top + size); }
        }
        context.stroke();
        context.restore();
    }

    createSurfaceCanvas(area, roomId) {
        const canvas = document.createElement('canvas');
        canvas.width = area.width;
        canvas.height = area.height;
        canvas.dataset.roomId = roomId;
        Object.assign(canvas.style, {
            position: 'absolute',
            left: `${area.x}px`,
            top: `${area.y}px`,
            pointerEvents: 'none'
        });
        return canvas;
    }

    // Leaves the context saved and clipped; every caller restores it after its
    // fill. Floor boundaries intentionally stay on the half-cell grid instead
    // of borrowing the rounded terrain silhouette.
    clipToRoom(context, room, area) {
        context.save();
        context.beginPath();
        const size = this.blockSize;
        for (const [blockX, blockY] of this.blocksOf(room.id)) {
            context.rect((blockX * size) - area.x, (blockY * size) - area.y, size, size);
        }
        context.clip();
    }

    // ── Ownership ────────────────────────────────────────────────────────────

    /**
     * Who owns every block of the map — the one answer both floors and the
     * customize highlight read.
     *
     * Each room used to mask itself: grow my shape by half a cell, subtract
     * every other room grown the same way, add my own shape back. That is a
     * pairwise rule pretending to be a global one, and it broke wherever more
     * than two claims met. At an inside corner — a wall run ending where two
     * rooms meet — BOTH rooms reached straight into the same block, so both
     * subtracted the other, and neither added it back because a wall cell
     * belongs to no room's own shape. The block came out bare: a sliver of raw
     * map ground beside the wall, on a system whose entire purpose is to not
     * leave one.
     *
     * Deciding ownership once, for every block, in one pass makes gaps and
     * overlaps unrepresentable rather than merely unlikely. There is exactly one
     * entry per block, so nothing can be claimed twice, and any block a room can
     * reach is claimed by someone.
     *
     * @returns {Map<string, Array<[number, number]>>} roomId -> owned blocks
     */
    computeOwnership() {
        const grid = this.gameMap.gridSystem;
        const perCell = FloorBuilder.BLOCKS_PER_CELL;
        const cellsAcross = Number(grid?.gridWidth) || 0;
        const cellsDown = Number(grid?.gridHeight) || 0;
        const owners = new Map();
        // A shared open space assigns every logical cell to the nearest room so
        // membership has no holes. Floors must not inherit that fallback: after
        // removing a wall it turns the former wall cell into a full-tile bulge,
        // then edge bleed adds another half tile. Seed only authored territory
        // here; the normal perimeter pass supplies the intended half-cell edge.
        const rooms = this.gameMap.regionManager?.all?.('room') ?? [];
        const sharedOpenSpaces = new Map();
        for (const room of rooms) {
            const openSpaceId = room.properties?.openSpaceId;
            if (!openSpaceId) continue;
            if (!sharedOpenSpaces.has(openSpaceId)) sharedOpenSpaces.set(openSpaceId, []);
            sharedOpenSpaces.get(openSpaceId).push({
                room,
                ...RoomEnclosureDetector.authoredGeometry(room)
            });
        }
        for (const [openSpaceId, entries] of sharedOpenSpaces) {
            if (entries.length < 2) sharedOpenSpaces.delete(openSpaceId);
        }

        // 1. Ground a room stands on outright, resolved per half-cell block.
        //    An authored room boundary can pass through an open doorway at a
        //    cell's centreline; assigning the whole cell from its centre gave
        //    that doorway tile entirely to one room. Wall cells still belong
        //    to nobody yet — that is step 2's whole job.
        const walls = this.gameMap.wallBuilder?.cells;
        for (let cellY = 0; cellY < cellsDown; cellY++) {
            for (let cellX = 0; cellX < cellsAcross; cellX++) {
                if (walls?.has(`${cellX},${cellY}`)) continue;
                for (let offsetY = 0; offsetY < perCell; offsetY++) {
                    for (let offsetX = 0; offsetX < perCell; offsetX++) {
                        const blockX = (cellX * perCell) + offsetX;
                        const blockY = (cellY * perCell) + offsetY;
                        const centreX = (blockX + 0.5) * this.blockSize;
                        const centreY = (blockY + 0.5) * this.blockSize;
                        let room = this.gameMap.regionManager?.innermostAt(
                            centreX,
                            centreY,
                            'room', this.blockSize
                        );
                        const shared = sharedOpenSpaces.get(room?.properties?.openSpaceId);
                        if (shared) {
                            room = RoomEnclosureDetector.pickAuthoredRoom(
                                shared,
                                centreX,
                                centreY,
                                this.cellSize,
                                { allowNearest: false }
                            );
                        }
                        if (room) owners.set(`${blockX},${blockY}`, room.id);
                    }
                }
            }
        }

        // A wide opening can be authored as a literal gap in a wall run. Its
        // cells are open, but the room boundary still follows the centreline
        // between the two wall ends. Tilemask rooms otherwise hand each whole
        // gap cell to one room, making a hall floor cover both halves. Split
        // bounded gaps before masonry bleed so both adjoining rooms meet on
        // the implied wall line.
        this.splitOpenWallGaps(owners, walls, cellsAcross, cellsDown, perCell);

        // A room can be open at one end while its two side walls already define
        // the rest of the space. The enclosure detector intentionally leaves
        // that opening connected to outdoors, but its floor still needs to run
        // between those walls instead of stopping at the old authored bounds.
        this.fillWallBoundOpenSpaces(owners, walls, cellsAcross, cellsDown, perCell);

        // 2. Grow every room by the configured half-cell perimeter. This is the
        //    same boundary whether it sits beneath masonry or beside open
        //    ground. All rooms grow into one ownership map, so meeting floors
        //    divide the available blocks instead of overlapping by draw order.
        const across = cellsAcross * perCell;
        const down = cellsDown * perCell;
        const terminalWalls = new Set();
        const cornerWalls = new Set();
        for (const [key, cell] of walls ?? []) {
            const mask = this.wallMask(cell, walls);
            const connections = WallBuilder.DIRECTIONS
                .filter(direction => (mask & direction.bit) !== 0).length;
            if (connections <= 1) terminalWalls.add(key);
            if (connections === 2 &&
                WallBuilder.isHorizontalMask(mask) &&
                WallBuilder.isVerticalMask(mask)) {
                cornerWalls.add(key);
            }
        }
        for (let round = 0; round < this.bleedBlocks(); round++) {
            const claims = new Map();
            for (let blockY = 0; blockY < down; blockY++) {
                for (let blockX = 0; blockX < across; blockX++) {
                    const key = `${blockX},${blockY}`;
                    if (owners.has(key)) continue;
                    // The same bleed tucks floor beneath masonry and carries an
                    // unwalled edge to its half-cell centreline.
                    const cellX = Math.floor(blockX / perCell);
                    const cellY = Math.floor(blockY / perCell);
                    const wallCell = walls?.has(`${cellX},${cellY}`) === true;
                    const terminalWall = wallCell && terminalWalls.has(`${cellX},${cellY}`);
                    const wallMask = wallCell
                        ? this.wallMask(walls.get(`${cellX},${cellY}`), walls)
                        : 0;
                    const cornerWall = wallCell && cornerWalls.has(`${cellX},${cellY}`);
                    const wallClaim = wallCell && !cornerWall
                        ? this.claimWallBlock(
                            blockX,
                            blockY,
                            walls.get(`${cellX},${cellY}`),
                            wallMask
                        )
                        : { resolved: false, roomId: null };
                    const claimant = wallClaim.resolved
                        ? wallClaim.roomId
                        : this.claimBlock(blockX, blockY, owners, {
                            wallCell,
                            terminalWall: terminalWall || cornerWall,
                            wallMask
                        });
                    if (claimant) claims.set(key, claimant);
                }
            }
            if (claims.size === 0) break;
            for (const [key, roomId] of claims) owners.set(key, roomId);
        }

        const byRoom = new Map();
        for (const [key, roomId] of owners) {
            const [blockX, blockY] = key.split(',').map(Number);
            if (!byRoom.has(roomId)) byRoom.set(roomId, []);
            byRoom.get(roomId).push([blockX, blockY]);
        }
        return byRoom;
    }

    fillWallBoundOpenSpaces(owners, walls, cellsAcross, cellsDown, perCell) {
        if (!walls?.size) return;
        const wallAt = (x, y) => walls.has(`${x},${y}`);
        const candidates = new Map();
        const markCell = (x, y, roomIds) => {
            if (wallAt(x, y)) return;
            for (let offsetY = 0; offsetY < perCell; offsetY++) {
                for (let offsetX = 0; offsetX < perCell; offsetX++) {
                    const key = `${(x * perCell) + offsetX},${(y * perCell) + offsetY}`;
                    const allowed = candidates.get(key) ?? new Set();
                    for (const roomId of roomIds) allowed.add(roomId);
                    candidates.set(key, allowed);
                }
            }
        };
        const horizontalWall = (x, y) => {
            const cell = walls.get(`${x},${y}`);
            if (!cell) return false;
            const mask = this.wallMask(cell, walls);
            return (mask & WallBuilder.MASK_HORIZONTAL) === WallBuilder.MASK_HORIZONTAL;
        };
        const verticalWall = (x, y) => {
            const cell = walls.get(`${x},${y}`);
            if (!cell) return false;
            const mask = this.wallMask(cell, walls);
            return (mask & WallBuilder.MASK_VERTICAL) === WallBuilder.MASK_VERTICAL;
        };
        const runSideRooms = (cell, axis, face) => {
            const rooms = new Set();
            const queue = [cell];
            const visited = new Set();
            const directions = axis === 'horizontal'
                ? [WallBuilder.DIRECTIONS[1], WallBuilder.DIRECTIONS[3]]
                : [WallBuilder.DIRECTIONS[0], WallBuilder.DIRECTIONS[2]];
            for (let index = 0; index < queue.length; index++) {
                const current = queue[index];
                const key = `${current.x},${current.y}`;
                if (visited.has(key)) continue;
                visited.add(key);
                const wallBuilder = this.gameMap.wallBuilder;
                const faces = current.faces || (
                    typeof wallBuilder?.assignFaces === 'function'
                        ? wallBuilder.assignFaces(current)
                        : null
                );
                const roomId = faces?.[face]?.roomId;
                if (roomId) rooms.add(roomId);
                const mask = this.wallMask(current, walls);
                for (const direction of directions) {
                    if ((mask & direction.bit) === 0) continue;
                    const neighbour = walls.get(`${current.x + direction.dx},${current.y + direction.dy}`);
                    if (neighbour) queue.push(neighbour);
                }
            }
            return rooms;
        };
        const intersection = (first, second) => new Set([...first].filter(roomId => second.has(roomId)));

        for (let x = 0; x < cellsAcross; x++) {
            const anchors = [];
            for (let y = 0; y < cellsDown; y++) {
                if (!horizontalWall(x, y)) continue;
                const cell = walls.get(`${x},${y}`);
                anchors.push({
                    position: y,
                    north: runSideRooms(cell, 'horizontal', 'north'),
                    south: runSideRooms(cell, 'horizontal', 'south')
                });
            }
            for (let index = 1; index < anchors.length; index++) {
                const before = anchors[index - 1];
                const after = anchors[index];
                const roomIds = intersection(before.south, after.north);
                if (roomIds.size === 0) continue;
                for (let y = before.position + 1; y < after.position; y++) markCell(x, y, roomIds);
            }
        }
        for (let y = 0; y < cellsDown; y++) {
            const anchors = [];
            for (let x = 0; x < cellsAcross; x++) {
                if (!verticalWall(x, y)) continue;
                const cell = walls.get(`${x},${y}`);
                anchors.push({
                    position: x,
                    west: runSideRooms(cell, 'vertical', 'west'),
                    east: runSideRooms(cell, 'vertical', 'east')
                });
            }
            for (let index = 1; index < anchors.length; index++) {
                const before = anchors[index - 1];
                const after = anchors[index];
                const roomIds = intersection(before.east, after.west);
                if (roomIds.size === 0) continue;
                for (let x = before.position + 1; x < after.position; x++) markCell(x, y, roomIds);
            }
        }

        for (;;) {
            const claims = new Map();
            for (const [key, allowed] of candidates) {
                if (owners.has(key)) continue;
                const [blockX, blockY] = key.split(',').map(Number);
                const roomIds = new Set([
                    [-1, 0], [1, 0], [0, -1], [0, 1],
                    [-1, -1], [1, -1], [-1, 1], [1, 1]
                ].flatMap(([dx, dy]) => {
                    const roomId = owners.get(`${blockX + dx},${blockY + dy}`);
                    return roomId && allowed.has(roomId) ? [roomId] : [];
                }));
                if (roomIds.size === 1) claims.set(key, [...roomIds][0]);
                else if (roomIds.size > 1) claims.set(key, this.settleClaim([...roomIds], blockX, blockY));
            }
            if (claims.size === 0) break;
            for (const [key, roomId] of claims) owners.set(key, roomId);
        }
    }

    splitOpenWallGaps(owners, walls, cellsAcross, cellsDown, perCell) {
        if (!walls?.size) return;
        const wallAt = (x, y) => walls.has(`${x},${y}`);
        const cellOwners = new Map();
        for (let cellY = 0; cellY < cellsDown; cellY++) {
            for (let cellX = 0; cellX < cellsAcross; cellX++) {
                if (wallAt(cellX, cellY)) continue;
                const counts = new Map();
                for (let offsetY = 0; offsetY < perCell; offsetY++) {
                    for (let offsetX = 0; offsetX < perCell; offsetX++) {
                        const roomId = owners.get(
                            `${(cellX * perCell) + offsetX},${(cellY * perCell) + offsetY}`
                        );
                        if (roomId) counts.set(roomId, (counts.get(roomId) || 0) + 1);
                    }
                }
                const roomId = [...counts].reduce((best, entry) =>
                    !best || entry[1] > best[1] ? entry : best, null)?.[0] ?? null;
                if (roomId) cellOwners.set(`${cellX},${cellY}`, roomId);
            }
        }
        const ownerAt = (x, y) => cellOwners.get(`${x},${y}`) ?? null;
        const pairAt = (x, y, axis) => {
            if (wallAt(x, y)) return null;
            const first = axis === 'vertical' ? ownerAt(x - 1, y) : ownerAt(x, y - 1);
            const second = axis === 'vertical' ? ownerAt(x + 1, y) : ownerAt(x, y + 1);
            const own = ownerAt(x, y);
            return first && second && first !== second
                ? { rooms: [first, second], ownsBoundary: own === first || own === second }
                : null;
        };
        const anchorsBoundary = (axis, x, y, outward) => {
            const cell = walls.get(`${x},${y}`);
            if (!cell) return null;
            const mask = this.wallMask(cell, walls);
            const outwardBit = axis === 'vertical'
                ? (outward < 0 ? WallBuilder.MASK_NORTH : WallBuilder.MASK_SOUTH)
                : (outward < 0 ? WallBuilder.MASK_WEST : WallBuilder.MASK_EAST);
            const perpendicularMask = axis === 'vertical'
                ? WallBuilder.MASK_HORIZONTAL
                : WallBuilder.MASK_VERTICAL;
            const perpendicularConnections = WallBuilder.DIRECTIONS
                .filter(direction => (direction.bit & perpendicularMask) !== 0)
                .filter(direction => (mask & direction.bit) !== 0).length;
            const parallelMask = axis === 'vertical'
                ? WallBuilder.MASK_VERTICAL
                : WallBuilder.MASK_HORIZONTAL;
            if (perpendicularConnections === 1 && (mask & parallelMask) === 0) return 'end-cap';
            return (mask & outwardBit) !== 0 ? 'parallel' : null;
        };
        const splitRun = (axis, fixed, start, end, pair) => {
            for (let variable = start; variable <= end; variable++) {
                const cellX = axis === 'vertical' ? fixed : variable;
                const cellY = axis === 'vertical' ? variable : fixed;
                for (let offsetY = 0; offsetY < perCell; offsetY++) {
                    for (let offsetX = 0; offsetX < perCell; offsetX++) {
                        const side = axis === 'vertical' ? offsetX : offsetY;
                        owners.set(
                            `${(cellX * perCell) + offsetX},${(cellY * perCell) + offsetY}`,
                            pair.rooms[side]
                        );
                    }
                }
            }
        };
        const scan = (axis, fixed, length) => {
            let variable = 0;
            while (variable < length) {
                const cellX = axis === 'vertical' ? fixed : variable;
                const cellY = axis === 'vertical' ? variable : fixed;
                const pair = pairAt(cellX, cellY, axis);
                if (!pair) {
                    variable += 1;
                    continue;
                }
                const start = variable;
                while (variable + 1 < length) {
                    const nextX = axis === 'vertical' ? fixed : variable + 1;
                    const nextY = axis === 'vertical' ? variable + 1 : fixed;
                    const next = pairAt(nextX, nextY, axis);
                    if (!next || next.rooms[0] !== pair.rooms[0] || next.rooms[1] !== pair.rooms[1]) break;
                    variable += 1;
                }
                const end = variable;
                const beforeX = axis === 'vertical' ? fixed : start - 1;
                const beforeY = axis === 'vertical' ? start - 1 : fixed;
                const afterX = axis === 'vertical' ? fixed : end + 1;
                const afterY = axis === 'vertical' ? end + 1 : fixed;
                const anchorBefore = anchorsBoundary(axis, beforeX, beforeY, -1);
                const anchorAfter = anchorsBoundary(axis, afterX, afterY, 1);
                const anchored = anchorBefore || anchorAfter;
                const endCapAnchored = anchorBefore === 'end-cap' || anchorAfter === 'end-cap';
                const boundedByParallelWalls = anchorBefore === 'parallel' && anchorAfter === 'parallel';
                if (anchored && (pair.ownsBoundary || endCapAnchored || boundedByParallelWalls)) {
                    splitRun(axis, fixed, start, end, pair);
                }
                variable += 1;
            }
        };

        for (let cellX = 0; cellX < cellsAcross; cellX++) scan('vertical', cellX, cellsDown);
        for (let cellY = 0; cellY < cellsDown; cellY++) scan('horizontal', cellY, cellsAcross);
    }

    /** How far a floor reaches past its own ground, in blocks. */
    bleedBlocks() {
        const cells = Number(SiteConfig.floorSystem?.edgeBleedCells ?? 0.5);
        return Math.max(0, Math.round(cells * FloorBuilder.BLOCKS_PER_CELL));
    }

    wallMask(cell, walls) {
        const builder = this.gameMap.wallBuilder;
        if (typeof builder?.computeMask === 'function') return builder.computeMask(cell);
        return WallBuilder.DIRECTIONS.reduce((mask, direction) => {
            const neighbour = walls?.get(`${cell.x + direction.dx},${cell.y + direction.dy}`);
            const connected = neighbour && (
                !cell.connectGroup || !neighbour.connectGroup || cell.connectGroup === neighbour.connectGroup
            );
            return connected ? mask | direction.bit : mask;
        }, 0);
    }

    /**
     * Resolve a half-cell beneath masonry from the wall faces it sits behind.
     *
     * Proximity is correct on open ground, but not through a wall: it leaves
     * room-side corner quarters bare and lets a large room grow across an
     * unfinished divider. WallBuilder has already resolved the room on each
     * visible side, so straight runs use their normal face and multi-arm
     * junctions use the two faces bordering the quadrant. L-corners stay with
     * geometric ownership because their inherited wall face can look past the
     * small room tucked into the corner. A resolved exterior face remains
     * empty instead of falling back to a room on the other side of the wall.
     *
     * @returns {{resolved: boolean, roomId: string|null}}
     */
    claimWallBlock(blockX, blockY, cell, mask) {
        const builder = this.gameMap.wallBuilder;
        if (!cell || typeof builder?.assignFaces !== 'function') {
            return { resolved: false, roomId: null };
        }

        const horizontal = WallBuilder.isHorizontalMask(mask);
        const vertical = WallBuilder.isVerticalMask(mask);
        if (!horizontal && !vertical) return { resolved: false, roomId: null };

        // At a T or crossing, a single face cannot describe all four floor
        // quarters beneath the junction. Its buried-face fallback may name a
        // room elsewhere along the wall, which is how joining two pulled runs
        // produced a few tiles from an unrelated third room. Each quarter is
        // beside one diagonal patch of open floor, so use that local authored
        // assignment (or detected room) before consulting wall-face fallback.
        const connections = WallBuilder.DIRECTIONS
            .filter(direction => (mask & direction.bit) !== 0).length;
        if (horizontal && vertical && connections >= 3) {
            const dx = blockX % FloorBuilder.BLOCKS_PER_CELL === 0 ? -1 : 1;
            const dy = blockY % FloorBuilder.BLOCKS_PER_CELL === 0 ? -1 : 1;
            const roomX = cell.x + dx;
            const roomY = cell.y + dy;
            const assigned = this.gameMap.roomAssignments?.get(roomX, roomY);
            const room = assigned
                ? this.gameMap.regionManager?.get('room', assigned)
                : builder.roomAtOpenCell?.(roomX, roomY);
            if (room) return { resolved: true, roomId: room.id };
        }

        // A terminal cap can straddle a doorway's floor boundary. Assigning
        // its whole underside from one wall face pulls a quarter of that room
        // across the otherwise straight split. Local block growth already
        // resolves each half from the floor beside it and still fills ordinary
        // room corners, so endpoints must defer to that geometry.
        if (connections <= 1) return { resolved: false, roomId: null };

        const faces = cell.faces || builder.assignFaces(cell);
        const faceNames = [];
        if (horizontal) {
            faceNames.push(blockY % FloorBuilder.BLOCKS_PER_CELL === 0 ? 'north' : 'south');
        }
        if (vertical) {
            faceNames.push(blockX % FloorBuilder.BLOCKS_PER_CELL === 0 ? 'west' : 'east');
        }
        const roomIds = [...new Set(faceNames
            .map(face => faces?.[face]?.roomId ?? null)
            .filter(Boolean))];

        // A wall end often sits half a cell beyond the room it caps. None of
        // its direct faces sees that diagonally adjacent room, but geometric
        // growth still has the correct answer. Only make face ownership
        // authoritative when it identifies an actual room.
        if (roomIds.length === 0) return { resolved: false, roomId: null };
        if (roomIds.length === 1) return { resolved: true, roomId: roomIds[0] };
        return {
            resolved: true,
            roomId: this.settleClaim(roomIds, blockX, blockY)
        };
    }

    /**
     * Which room, if any, takes an unowned block.
     *
     * Edge-sharing rooms claim first. On open ground, diagonal ownership fills
     * the corner of the half-cell perimeter. At a wall end it completes the
     * room-facing end cap. Beneath a continuous wall, it is allowed only when
     * the two neighbours facing the room form a structural L.
     * @returns {string|null} the winning room id
     */
    claimBlock(blockX, blockY, owners, {
        wallCell = true,
        terminalWall = false,
        wallMask = 0
    } = {}) {
        const straight = [[-1, 0], [1, 0], [0, -1], [0, 1]];
        const candidates = new Set();
        for (const [dx, dy] of straight) {
            const roomId = owners.get(`${blockX + dx},${blockY + dy}`);
            if (roomId) candidates.add(roomId);
        }
        if (candidates.size === 1) return [...candidates][0];
        if (candidates.size > 1) return this.settleClaim([...candidates], blockX, blockY);

        const cellX = Math.floor(blockX / FloorBuilder.BLOCKS_PER_CELL);
        const cellY = Math.floor(blockY / FloorBuilder.BLOCKS_PER_CELL);
        for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
            const roomId = owners.get(`${blockX + dx},${blockY + dy}`);
            if (!roomId) continue;
            if (!wallCell || terminalWall) {
                candidates.add(roomId);
                continue;
            }
            const horizontal = dx < 0 ? WallBuilder.MASK_WEST : WallBuilder.MASK_EAST;
            const vertical = dy < 0 ? WallBuilder.MASK_NORTH : WallBuilder.MASK_SOUTH;
            if ((wallMask & horizontal) !== 0 && (wallMask & vertical) !== 0) {
                candidates.add(roomId);
            }
        }
        if (candidates.size === 1) return [...candidates][0];
        if (candidates.size > 1) return this.settleClaim([...candidates], blockX, blockY);
        return null;
    }

    /**
     * Two rooms reaching the same block from the same distance.
     *
     * Whose TERRITORY the block sits in decides it — a room's shape says where
     * it ends even on ground it cannot stand on, and a wall standing inside one
     * room's rectangle does not hand the far half to the room beyond it. That
     * is what keeps a floor boundary running straight past the end of a wall
     * instead of stepping half a cell sideways the moment the masonry stops.
     *
     * Failing that, the smaller room: the same "innermost wins" rule that
     * decides which room a cell, a face and a point belong to everywhere else.
     * Failing that, the lower id, so a rebuild never reshuffles the map.
     */
    settleClaim(roomIds, blockX, blockY) {
        const size = this.blockSize;
        const centreX = (blockX + 0.5) * size;
        const centreY = (blockY + 0.5) * size;
        const rooms = roomIds
            .map(roomId => this.gameMap.regionManager?.get('room', roomId))
            .filter(Boolean);
        const holding = rooms.filter(room => room.contains(centreX, centreY));
        const pool = holding.length > 0 ? holding : rooms;
        return pool.reduce((best, room) => {
            if (!best) return room;
            const area = room.areaInCells(this.cellSize);
            const bestArea = best.areaInCells(this.cellSize);
            if (area !== bestArea) return area < bestArea ? room : best;
            return room.id < best.id ? room : best;
        }, null)?.id ?? null;
    }

    /** The blocks one room owns, computing the map's ownership if needed. */
    blocksOf(roomId) {
        if (!this.ownedBlocks) this.ownedBlocks = this.computeOwnership();
        return this.ownedBlocks.get(roomId) ?? [];
    }

    /**
     * The canvas a room's floor needs: a box around the blocks it owns.
     *
     * Measured from the ownership rather than from the room's bounds plus a
     * margin, so the canvas is exactly as big as the thing drawn on it however
     * far the bleed reaches.
     */
    paintedArea(room) {
        const blocks = this.blocksOf(room?.id);
        if (blocks.length === 0) return null;
        const size = this.blockSize;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const [blockX, blockY] of blocks) {
            minX = Math.min(minX, blockX);
            minY = Math.min(minY, blockY);
            maxX = Math.max(maxX, blockX);
            maxY = Math.max(maxY, blockY);
        }
        return {
            x: minX * size,
            y: minY * size,
            width: (maxX - minX + 1) * size,
            height: (maxY - minY + 1) * size
        };
    }

    // Anchored to the WORLD grid, not to the area's corner, so two rooms sharing
    // a finish line up across a doorway instead of seaming wherever their bounds
    // happen to start.
    fillTiles(context, tile, area) {
        const size = this.registry.tileSize;
        context.save();
        context.translate(-(area.x % size), -(area.y % size));
        context.fillStyle = context.createPattern(tile, 'repeat');
        context.fillRect(0, 0, area.width + size, area.height + size);
        context.restore();
    }

    /**
     * Repaints one room, the floor equivalent of swapping a wall finish.
     *
     * Ownership is geometry and a finish is not, so it is deliberately NOT
     * recomputed here: a room with no floor still owns its ground, and always
     * did, which is why giving it one cannot take anything from a neighbour.
     * @returns {boolean} whether the room's finish changed
     */
    setRoomFinish(roomId, finishId) {
        const room = this.gameMap.regionManager?.get('room', roomId);
        if (!room) return false;
        const previous = room.properties?.floorFinishId ?? null;
        const next = finishId || null;
        if (previous === next) return false;
        room.properties = { ...room.properties, floorFinishId: next };
        this.removeRoom(roomId);
        this.paintRoom(room);
        // Clearing a finish deliberately leaves no generated canvas. That is
        // still a successful surface change: the authored ground underneath
        // is now the visible floor.
        return true;
    }

    removeRoom(roomId) {
        const existing = this.surfaces.get(roomId);
        if (!existing) return;
        existing.canvas.remove();
        this.surfaces.delete(roomId);
    }

    clear() {
        for (const { canvas } of this.surfaces.values()) canvas.remove();
        this.surfaces.clear();
    }

    dispose() {
        this.clear();
        this.ownedBlocks = null;
        this.container?.remove();
        this.container = null;
    }
}
