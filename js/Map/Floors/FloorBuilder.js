// ─────────────────────────────────────────────────────────────────────────────
// FloorBuilder — a customisable floor per room, the way a finish is per wall.
//
// The map's own tile layers still draw the ground. This paints OVER them, but
// only inside rooms that ask for it: a room with no `floorFinishId` is left
// exactly as authored, so adding the system changes nothing until a room opts
// in. That is what keeps it from fighting the baked background.
//
// One canvas per room, tiled with the finish's single tile and then clipped to
// the room's own shape — rooms are rect, polygon OR tilemask, and a tilemask
// room is not a rectangle, so filling its bounds would paint over the walls and
// the corridor outside it. The clip is the whole job.
//
// It sits inside the background layer, above the baked map image and below
// ground decor, so objects, mytes and walls all still draw on top.
// ─────────────────────────────────────────────────────────────────────────────
class FloorBuilder {
    constructor(gameMap, registry) {
        this.gameMap = gameMap;
        this.registry = registry;
        this.cellSize = gameMap.gridSystem?.config?.cellSize ?? 32;
        this.surfaces = new Map();
        this.container = null;
    }

    /** Paints every room that asks for a floor. Safe to call again; it rebuilds. */
    build() {
        this.clear();
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

        const canvas = document.createElement('canvas');
        canvas.width = area.width;
        canvas.height = area.height;
        canvas.className = 'floor-surface';
        canvas.dataset.roomId = room.id;
        Object.assign(canvas.style, {
            position: 'absolute',
            left: `${area.x}px`,
            top: `${area.y}px`,
            pointerEvents: 'none'
        });

        const context = canvas.getContext('2d');
        context.imageSmoothingEnabled = false;
        this.fillTiles(context, tile, area);
        context.globalCompositeOperation = 'destination-in';
        context.drawImage(this.buildMask(room, area), 0, 0);
        context.globalCompositeOperation = 'source-over';

        container.appendChild(canvas);
        this.surfaces.set(room.id, { canvas, finishId });
        return canvas;
    }

    /**
     * A canvas over one room, filled to the room's own shape.
     *
     * The customize highlight used to be a CSS outline on the floor canvas,
     * which is a bounding box plus edge bleed — so it drew a rectangle around
     * rooms that are not rectangles, and where two of those boxes overlapped
     * only one room could ever be hovered. A room with no finish had no canvas
     * at all and so could not be highlighted or clicked. This paints the shape
     * itself, and every room has one whether or not it carries a floor.
     */
    createRoomOverlay(room, { fill, className = '' } = {}) {
        const area = this.paintedArea(room);
        const container = this.ensureContainer();
        if (!area || !container) return null;

        const canvas = document.createElement('canvas');
        canvas.width = area.width;
        canvas.height = area.height;
        canvas.className = className;
        Object.assign(canvas.style, {
            position: 'absolute',
            left: `${area.x}px`,
            top: `${area.y}px`,
            pointerEvents: 'none'
        });

        // Masked exactly the way a floor is, not merely filled to the room's
        // cells: `buildMask` is what adds the edge bleed that runs the floor
        // under the wall enclosing it, and what splits the space with a
        // neighbouring room down the midline. Filling the bare shape stopped a
        // cell short of every wall, so the highlight covered less than the
        // floor it was highlighting.
        const context = canvas.getContext('2d');
        context.fillStyle = fill;
        context.fillRect(0, 0, area.width, area.height);
        context.globalCompositeOperation = 'destination-in';
        context.drawImage(this.buildMask(room, area), 0, 0);
        context.globalCompositeOperation = 'source-over';

        container.appendChild(canvas);
        return canvas;
    }

    /**
     * Whether `outer` is the room `inner` was carved out of.
     *
     * A room walled off inside another has to keep its edge bleed — the strip
     * that runs its floor under its own walls — and the parent must not erase
     * it, or the new room stops a cell short of every wall it just gained.
     * The parent yields; the child carves the parent, not the other way round.
     */
    encloses(outer, inner) {
        if (!outer?.bounds || !inner?.bounds) return false;
        const cellSize = this.cellSize;
        if (outer.areaInCells(cellSize) <= inner.areaInCells(cellSize)) return false;
        const a = outer.bounds;
        const b = inner.bounds;
        return b.x >= a.x && b.y >= a.y &&
            b.x + b.width <= a.x + a.width &&
            b.y + b.height <= a.y + a.height;
    }

    edgeBleed() {
        const cells = Number(SiteConfig.floorSystem?.edgeBleedCells ?? 1);
        return Math.max(0, cells) * (this.registry?.tileSize || this.cellSize);
    }

    /**
     * The room's bounds grown by the edge bleed, clamped to the map.
     *
     * A room's bounds stop one cell short of the wall enclosing it, and that
     * wall's footprint is only `thickness` px centred in its own cell — so
     * without the bleed a strip of the map's authored ground shows between the
     * floor and the wall it should be running underneath. Growing by a cell puts
     * floor beneath the wall, which then draws over it.
     */
    paintedArea(room) {
        const bleed = this.edgeBleed();
        const bounds = this.roomBounds(room);
        const map = this.gameMap.dimensions || {};
        const limitX = Number(map.width) || Infinity;
        const limitY = Number(map.height) || Infinity;
        const x0 = Math.max(0, Math.round((bounds.x || 0) - bleed));
        const y0 = Math.max(0, Math.round((bounds.y || 0) - bleed));
        const x1 = Math.min(limitX, Math.round((bounds.x || 0) + (bounds.width || 0) + bleed));
        const y1 = Math.min(limitY, Math.round((bounds.y || 0) + (bounds.height || 0) + bleed));
        const width = Math.max(0, x1 - x0);
        const height = Math.max(0, y1 - y0);
        return (width && height) ? { x: x0, y: y0, width, height } : null;
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
     * A room's bounds snapped to the cell grid. Rooms are authored on the grid,
     * so a bound landing a pixel off is a slip — but two rooms slipping by
     * different amounts show up as a step where their floors meet, which is
     * exactly the kind of thing nobody can find by reading the map file.
     */
    roomBounds(room) {
        const size = this.cellSize;
        const bounds = room?.bounds || {};
        const x = Math.round((bounds.x || 0) / size) * size;
        const y = Math.round((bounds.y || 0) / size) * size;
        const right = Math.round(((bounds.x || 0) + (bounds.width || 0)) / size) * size;
        const bottom = Math.round(((bounds.y || 0) + (bounds.height || 0)) / size) * size;
        return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
    }

    /**
     * Where this room's floor is allowed to land: its own shape grown by the
     * bleed, then cut back so it never reaches into a neighbour's half.
     *
     * Two adjacent rooms both bleed toward each other, and their rings overlap.
     * Nothing decides that overlap except which canvas happens to be appended
     * last, so one room's floor simply covers the other's — including in the
     * corner strips alongside a shared edge, where the ring runs past the
     * neighbour's extent. Splitting at the midline makes the two meet on a line
     * instead, and puts that line in the middle of whatever separates them.
     * @returns {HTMLCanvasElement}
     */
    buildMask(room, area) {
        const canvas = document.createElement('canvas');
        canvas.width = area.width;
        canvas.height = area.height;
        const context = canvas.getContext('2d');
        context.fillStyle = '#ffffff';

        this.fillShape(context, room, area, this.edgeBleed());
        context.globalCompositeOperation = 'destination-out';
        for (const other of this.gameMap.regionManager?.all('room') ?? []) {
            if (other.id === room.id || this.encloses(other, room)) continue;
            this.trimToMidline(context, room, other, area);
            this.fillShape(context, other, area, 0);
        }
        // A room never gives away its own interior, even if two regions were
        // authored overlapping.
        context.globalCompositeOperation = 'source-over';
        this.fillShape(context, room, area, 0);
        return canvas;
    }

    /**
     * Erases everything past the midpoint between this room and an adjacent
     * one, so the two split the space between them evenly. Where a wall stands
     * in that space the split lands on its centreline, which is the same rule
     * the outer edge bleed follows.
     *
     * Only pairs that face each other are trimmed — separated on one axis and
     * overlapping on the other. A diagonal neighbour's ring cannot reach this
     * one, and trimming on both axes would carve the corner out of both rooms
     * and leave a hole between them.
     */
    trimToMidline(context, room, other, area) {
        const a = this.roomBounds(room);
        const b = this.roomBounds(other);
        const overlapX = b.x < a.x + a.width && a.x < b.x + b.width;
        const overlapY = b.y < a.y + a.height && a.y < b.y + b.height;
        const far = 1e5;

        if (overlapY && b.x >= a.x + a.width) {
            const mid = (a.x + a.width + b.x) / 2;
            context.fillRect(mid - area.x, -far, far, far * 2);
        } else if (overlapY && b.x + b.width <= a.x) {
            const mid = (b.x + b.width + a.x) / 2;
            context.fillRect(-far, -far, far + (mid - area.x), far * 2);
        } else if (overlapX && b.y >= a.y + a.height) {
            const mid = (a.y + a.height + b.y) / 2;
            context.fillRect(-far, mid - area.y, far * 2, far);
        } else if (overlapX && b.y + b.height <= a.y) {
            const mid = (b.y + b.height + a.y) / 2;
            context.fillRect(-far, -far, far * 2, far + (mid - area.y));
        }
    }

    /**
     * Fills a room's shape, optionally dilated by `grow`. Rooms are rect,
     * polygon OR tilemask; a tilemask room is not a rectangle, so filling its
     * bounding box would paint over the bordering walls and the corridor
     * outside it.
     */
    fillShape(context, room, area, grow = 0) {
        const shape = room?.shape;
        if (!shape) return;

        if (shape.kind === 'tilemask') {
            const size = shape.cellSize || this.cellSize;
            for (const key of shape.cells) {
                const [cellX, cellY] = String(key).split(',').map(Number);
                context.fillRect(
                    (cellX * size) - area.x - grow, (cellY * size) - area.y - grow,
                    size + (grow * 2), size + (grow * 2)
                );
            }
            return;
        }

        if (shape.kind === 'polygon' && Array.isArray(shape.points) && shape.points.length > 2) {
            context.beginPath();
            shape.points.forEach((point, index) => {
                const x = point.x - area.x;
                const y = point.y - area.y;
                if (index === 0) context.moveTo(x, y);
                else context.lineTo(x, y);
            });
            context.closePath();
            context.fill();
            if (grow > 0) {
                // Stroking the outline with round joins dilates it by half the
                // line width, giving a polygon room the same bleed a rect gets
                // from simply being a bigger rectangle.
                context.save();
                context.lineWidth = grow * 2;
                context.lineJoin = 'round';
                context.lineCap = 'round';
                context.strokeStyle = context.fillStyle;
                context.stroke();
                context.restore();
            }
            return;
        }

        const bounds = this.roomBounds(room);
        context.fillRect(
            bounds.x - area.x - grow, bounds.y - area.y - grow,
            bounds.width + (grow * 2), bounds.height + (grow * 2)
        );
    }

    /**
     * Repaints one room, the floor equivalent of swapping a wall finish.
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
        this.container?.remove();
        this.container = null;
    }
}
