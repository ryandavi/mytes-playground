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

    // Leaves the context saved and clipped — every caller restores it once it
    // has drawn. Clipping to rects beats masking with a second canvas: the
    // owned blocks ARE rectangles, so there is no shape to composite.
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

        // 1. Ground a room stands on outright: every open cell, to the room
        //    whose shape holds its centre. Innermost, so a room built inside
        //    another takes the cells it was carved from. Wall cells belong to
        //    nobody yet — that is step 2's whole job.
        const walls = this.gameMap.wallBuilder?.cells;
        for (let cellY = 0; cellY < cellsDown; cellY++) {
            for (let cellX = 0; cellX < cellsAcross; cellX++) {
                if (walls?.has(`${cellX},${cellY}`)) continue;
                const room = this.gameMap.regionManager?.innermostAt(
                    (cellX + 0.5) * this.cellSize, (cellY + 0.5) * this.cellSize,
                    'room', this.cellSize
                );
                if (!room) continue;
                for (let offsetY = 0; offsetY < perCell; offsetY++) {
                    for (let offsetX = 0; offsetX < perCell; offsetX++) {
                        owners.set(`${(cellX * perCell) + offsetX},${(cellY * perCell) + offsetY}`, room.id);
                    }
                }
            }
        }

        // 2. The bleed: unowned blocks go to the room next to them, one ring per
        //    round. Wall cells are never sources, so masonry cannot carry a
        //    floor through to the far side — a wall's two halves are claimed
        //    from the two rooms it separates, one each, which is the centreline
        //    the whole system is built around.
        const across = cellsAcross * perCell;
        const down = cellsDown * perCell;
        for (let round = 0; round < this.bleedBlocks(); round++) {
            const claims = new Map();
            for (let blockY = 0; blockY < down; blockY++) {
                for (let blockX = 0; blockX < across; blockX++) {
                    if (owners.has(`${blockX},${blockY}`)) continue;
                    const claimant = this.claimBlock(blockX, blockY, owners);
                    if (claimant) claims.set(`${blockX},${blockY}`, claimant);
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

    /** How far a floor reaches past its own ground, in blocks. */
    bleedBlocks() {
        const cells = Number(SiteConfig.floorSystem?.edgeBleedCells ?? 0.5);
        return Math.max(0, Math.round(cells * FloorBuilder.BLOCKS_PER_CELL));
    }

    /**
     * Which room, if any, takes an unowned block.
     *
     * Straight before diagonal: a room carrying its floor along its own edge
     * outranks one rounding a corner into ground it does not border. Without
     * that rule the block where two rooms meet corner to corner went to
     * whichever was checked first, and a corner of every doorway came out in
     * the next room's floor.
     * @returns {string|null} the winning room id
     */
    claimBlock(blockX, blockY, owners) {
        const straight = [[-1, 0], [1, 0], [0, -1], [0, 1]];
        const diagonal = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
        for (const offsets of [straight, diagonal]) {
            const candidates = new Set();
            for (const [dx, dy] of offsets) {
                const roomId = owners.get(`${blockX + dx},${blockY + dy}`);
                if (roomId) candidates.add(roomId);
            }
            if (candidates.size === 1) return [...candidates][0];
            if (candidates.size > 1) return this.settleClaim([...candidates], blockX, blockY);
        }
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
     * @returns {boolean} whether the room now carries a floor
     */
    setRoomFinish(roomId, finishId) {
        const room = this.gameMap.regionManager?.get('room', roomId);
        if (!room) return false;
        room.properties = { ...room.properties, floorFinishId: finishId || null };
        this.removeRoom(roomId);
        return !!this.paintRoom(room);
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
