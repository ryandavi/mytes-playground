// ─────────────────────────────────────────────────────────────────────────────
// TerrainBuilder — painting ground the way Tiled paints it, in game.
//
// Grass, water, paths and carpet are corner wang terrain (see TerrainAtlas), so
// this owns the corner grids, resolves them to tiles, draws them, keeps the
// pathfinding grid honest about what was painted, and hands every edit back as
// an undoable command.
//
// ── Where it draws ───────────────────────────────────────────────────────────
// The map's tile layers are normally flattened into one baked background PNG at
// load. A layer that can change at runtime cannot live in that image, so the
// loader excludes terrain layers from the bake exactly as it already excludes
// wall layers, and this draws them instead — one canvas per layer, inside the
// background layer, above the baked image and below floors, objects and walls.
//
// That puts terrain above every non-terrain tile layer, which is the authoring
// convention this system asks for and the one every map already follows: base
// ground first, terrain over it, and anything that must draw ON TOP of terrain
// is an object or a wall, not a tile layer. `validate-maps` enforces it.
//
// ── What it stores ───────────────────────────────────────────────────────────
// Corner colours, never tiles (TerrainAtlas explains why), diffed against the
// map file's own corners so a save carries the player's edits rather than a
// copy of the map. Exporting to .tmx rebaselines, and the deltas empty out.
// ─────────────────────────────────────────────────────────────────────────────
class TerrainBuilder {
    // A ceiling on one bucket fill. The largest honest fill is the whole map,
    // and a 64x64 map is 4096 cells — this is that, rounded up, so the cap only
    // ever catches a runaway rather than a real edit.
    static MAX_FILL_CELLS = 8192;

    constructor(gameMap, terrainData) {
        this.gameMap = gameMap;
        this.tileWidth = terrainData.tileWidth;
        this.tileHeight = terrainData.tileHeight;
        this.width = terrainData.width;
        this.height = terrainData.height;
        this.atlases = terrainData.atlases;          // name -> TerrainAtlas
        this.layers = terrainData.layers;            // TerrainLayer[], in draw order
        this.container = null;
        this.canvas = null;                          // the composite, see Rendering
        // Authored layers the player has deleted. Kept as ids rather than
        // forgotten, because a save that merely omits a layer is
        // indistinguishable from one written before that layer existed — the
        // map file would put it straight back on the next load.
        this.removedLayerIds = new Set();
        this._imagesReady = false;
    }

    /**
     * A map has terrain painting when some tileset authors a corner wang set.
     * Layers can be absent — a map with none simply gets its first one made for
     * it on the first stroke, which is what every new map needs.
     */
    static isAvailable(gameMap) {
        return (gameMap?.terrainBuilder?.atlases?.size ?? 0) > 0;
    }

    get eventManager() {
        return this.gameMap?.container?.eventManager || null;
    }

    get defaultAtlas() {
        return this.atlases.get(SiteConfig.terrainSystem.wangSetName) ||
            this.atlases.values().next().value ||
            null;
    }

    getLayer(layerId) {
        return this.layers.find(layer => String(layer.id) === String(layerId)) || null;
    }

    // ── Rendering ────────────────────────────────────────────────────────────
    //
    // ONE canvas, not one per layer.
    //
    // Layers are a fact about the model — what is painted where, and in what
    // order — not about the DOM. Giving each one its own canvas meant the
    // stacking order had to be expressed as `z-index`, and a positioned element
    // with a z-index outranks a sibling without one: the ground layers climbed
    // straight over the room floors, which are drawn in the same background
    // layer and never asked for a z-index of their own.
    //
    // Compositing here instead means the terrain is a single element with a
    // single place in the DOM, ordering between ground layers is decided by the
    // loop that draws them, and everything downstream — floors, decor, walls,
    // objects — sits above it because it comes after it. It is also simply less
    // to carry: a map with six ground layers is one canvas, not six.

    async build() {
        await this.loadImages();
        this.ensureCanvas();
        this.drawAll();
        return this.layers.length;
    }

    orderedLayers() {
        return [...this.layers].sort((a, b) => a.order - b.order);
    }

    /** The layers that actually draw, bottom first. */
    visibleLayers() {
        return this.orderedLayers().filter(layer => layer.visible !== false);
    }

    async loadImages() {
        if (this._imagesReady) return;
        const resourceManager = this.gameMap?.container?.core?.resourceManager || null;
        await Promise.all([...this.atlases.values()].map(atlas => atlas.loadImage(resourceManager)));
        this._imagesReady = true;
    }

    ensureContainer() {
        if (this.container?.isConnected) return this.container;
        const layer = this.gameMap.layers?.background;
        if (!layer) return null;
        this.container = document.createElement('div');
        this.container.className = 'terrain-surfaces';
        // No render-inset offset: `.layer` is already positioned and sized in
        // map coordinates, so a layer child is too. See FloorBuilder.
        Object.assign(this.container.style, {
            position: 'absolute',
            inset: '0',
            pointerEvents: 'none'
        });
        // First child of the background layer: ground is under everything, and
        // the room floors that FloorBuilder appends after it draw on top by
        // being later in the DOM rather than by outbidding it.
        layer.prepend(this.container);
        return this.container;
    }

    ensureCanvas() {
        if (this.canvas?.isConnected) return this.canvas;
        const container = this.ensureContainer();
        if (!container) return null;

        this.canvas = document.createElement('canvas');
        this.canvas.className = 'terrain-surface';
        this.canvas.width = this.width * this.tileWidth;
        this.canvas.height = this.height * this.tileHeight;
        Object.assign(this.canvas.style, {
            position: 'absolute',
            left: '0',
            top: '0',
            width: `${this.canvas.width}px`,
            height: `${this.canvas.height}px`
        });
        container.appendChild(this.canvas);
        return this.canvas;
    }

    get context() {
        const canvas = this.ensureCanvas();
        if (!canvas) return null;
        const context = canvas.getContext('2d');
        context.imageSmoothingEnabled = false;
        return context;
    }

    drawAll() {
        const context = this.context;
        if (!context) return false;
        context.clearRect(0, 0, this.width * this.tileWidth, this.height * this.tileHeight);
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) this.drawCell(x, y, context);
        }
        return true;
    }

    /** One cell, every visible layer, bottom first. */
    drawCell(x, y, context = this.context) {
        if (!context) return false;
        const destX = x * this.tileWidth;
        const destY = y * this.tileHeight;
        context.clearRect(destX, destY, this.tileWidth, this.tileHeight);

        let drew = false;
        for (const layer of this.visibleLayers()) {
            const tileId = layer.tileIdForCell(x, y);
            if (tileId !== null) {
                drew = layer.atlas.drawTile(context, tileId, destX, destY) || drew;
                continue;
            }
            // Nothing painted here on this layer, but the author may have left
            // decoration on it.
            const foreignGid = layer.foreignGidAt(x, y);
            if (!foreignGid) continue;
            const foreignTileId = layer.atlas.tileIdForGid(foreignGid);
            if (foreignTileId !== null) {
                drew = layer.atlas.drawTile(context, foreignTileId, destX, destY) || drew;
            }
        }
        return drew;
    }

    /**
     * Hide a layer without deleting it — the only way to paint the layer
     * UNDERNEATH one you have already covered the map with. Purely a view
     * state: the corners, the grid and the export are untouched, because a
     * layer you cannot currently see is still part of the map.
     */
    setLayerVisible(layerId, visible) {
        const layer = this.getLayer(layerId);
        if (!layer || layer.visible === visible) return false;
        layer.visible = visible;
        this.drawAll();
        this.eventManager?.emit?.(EVENTS.TERRAIN_LAYERS_CHANGED, { mapId: this.gameMap.id });
        return true;
    }

    /**
     * Show where a layer actually is, briefly, over the map.
     *
     * With one composited canvas there is no per-layer element to light up, and
     * that is the right trade: the question "which layer did I just select" is
     * about the ground, so the answer is drawn on the ground — this layer's
     * painted cells, tinted, fading out on their own.
     */
    highlightLayer(layerId) {
        const layer = this.getLayer(layerId);
        const container = this.ensureContainer();
        if (!layer || !container) return false;

        this._highlight?.remove();
        const canvas = document.createElement('canvas');
        canvas.className = 'terrain-highlight';
        canvas.width = this.width * this.tileWidth;
        canvas.height = this.height * this.tileHeight;
        Object.assign(canvas.style, {
            position: 'absolute',
            left: '0',
            top: '0',
            width: `${canvas.width}px`,
            height: `${canvas.height}px`,
            pointerEvents: 'none'
        });

        const context = canvas.getContext('2d');
        const color = layer.atlas.colorAt(layer.dominantColorIndex())?.color || '#ffffff';
        context.fillStyle = color;
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                if (!layer.hasPaintAt(x, y)) continue;
                context.fillRect(x * this.tileWidth, y * this.tileHeight, this.tileWidth, this.tileHeight);
            }
        }

        container.appendChild(canvas);
        this._highlight = canvas;
        canvas.addEventListener('animationend', () => {
            canvas.remove();
            if (this._highlight === canvas) this._highlight = null;
        });
        return true;
    }

    clear() {
        this._highlight?.remove();
        this._highlight = null;
        this.canvas?.remove();
        this.canvas = null;
    }

    // ── Painting ─────────────────────────────────────────────────────────────

    /**
     * Paint one cell. Setting all four of a cell's corners to a colour is the
     * whole of the brush — the tiles that resolve from those corners, including
     * the blends in the eight cells around it, fall out of the corner grid.
     *
     * Returns the cells whose corners actually moved, so a drag can skip the
     * work when a stroke crosses the same cell twice.
     */
    paintCell(layer, x, y, colorIndex) {
        if (!layer || x < 0 || y < 0 || x >= this.width || y >= this.height) return null;

        // Paint wins over decoration: a tuft of grass the author dropped here
        // has no business showing through the water you just painted over it.
        if (colorIndex > 0) layer.clearForeignAt(x, y);

        const changed = [];
        for (const [cornerX, cornerY] of TerrainLayer.cornerPointsFor(x, y)) {
            const previous = layer.colorAt(cornerX, cornerY);
            if (previous === colorIndex) continue;
            if (layer.setColorAt(cornerX, cornerY, colorIndex)) {
                changed.push({ x: cornerX, y: cornerY, from: previous, to: colorIndex });
            }
        }
        return changed.length > 0 ? changed : null;
    }

    /**
     * Apply a set of corner changes and redraw what they touch.
     *
     * Everything goes through here — the brush, undo, redo and a restored save
     * alike — so there is one path that keeps the canvas, the grid and the
     * listeners in step, and no way to move a corner without them.
     */
    applyCornerChanges(layer, changes, { direction = 'to' } = {}) {
        if (!layer || !changes?.length) return false;

        const touched = new Set();
        for (const change of changes) {
            layer.setColorAt(change.x, change.y, direction === 'to' ? change.to : change.from);
            // A corner belongs to the four cells that meet at it.
            for (const [cellX, cellY] of TerrainBuilder.cellsAroundCorner(change.x, change.y)) {
                if (cellX < 0 || cellY < 0 || cellX >= this.width || cellY >= this.height) continue;
                touched.add(`${cellX},${cellY}`);
            }
        }

        const context = this.context;
        for (const key of touched) {
            const [cellX, cellY] = key.split(',').map(Number);
            this.drawCell(cellX, cellY, context);
            this.syncGridCell(cellX, cellY);
        }

        this.eventManager?.emit?.(EVENTS.TERRAIN_CHANGED, {
            mapId: this.gameMap.id,
            layerId: layer.id,
            cells: [...touched]
        });
        return true;
    }

    /**
     * Could this layer take `colorIndex` over these cells without breaking?
     *
     * A corner wang set does not have to author a tile for every pair of
     * terrains meeting. The common case — and what walls3.tsx does — is the
     * 15-tile blob per colour, where each terrain blends against NOTHING and
     * the layer below shows through the seam. On such a set, dropping water
     * into a grass layer asks for a grass/water tile that does not exist, and
     * the boundary cells resolve to no tile at all: a transparent hole around
     * everything you paint.
     *
     * So the answer is about the halo, not just the cells: a stroke's own
     * corners AND its neighbours' have to be either empty or the same colour,
     * because those neighbours are the cells that would have to draw the blend.
     */
    layerAccepts(layer, cells, colorIndex) {
        if (colorIndex === 0) return true;                  // erasing breaks nothing

        for (const { x, y } of cells) {
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const [cellX, cellY] = [x + dx, y + dy];
                    if (cellX < 0 || cellY < 0 || cellX >= this.width || cellY >= this.height) continue;
                    for (const corner of layer.cornersForCell(cellX, cellY)) {
                        if (corner !== 0 && corner !== colorIndex) return false;
                    }
                }
            }
        }
        return true;
    }

    /**
     * The layer a stroke should actually land on.
     *
     * The player's chosen layer wins whenever it can take the paint. When it
     * cannot, the paint goes above it rather than tearing a hole in it — which
     * is both what the art demands and what somebody laying a path across a
     * field means: the path is ON the grass, not instead of it.
     *
     * Erasing is the mirror image: it takes the topmost layer that actually has
     * something there, because that is the paint you can see.
     */
    resolveLayerFor(cells, colorIndex, preferred = null) {
        const ordered = this.orderedLayers();

        if (colorIndex === 0) {
            for (const layer of [...ordered].reverse()) {
                if (cells.some(cell => layer.hasPaintAt(cell.x, cell.y))) return layer;
            }
            return preferred || ordered[ordered.length - 1] || null;
        }

        if (preferred && this.layerAccepts(preferred, cells, colorIndex)) return preferred;

        // Above the preferred layer only: a path drawn over grass must not fall
        // through to a layer beneath the grass, where the grass would cover it.
        const floor = preferred ? preferred.order : -Infinity;
        for (const layer of ordered) {
            if (layer.order <= floor) continue;
            if (this.layerAccepts(layer, cells, colorIndex)) return layer;
        }
        return this.addLayer();
    }

    /**
     * The contiguous run of cells that read as the same ground as (x, y) on
     * this layer — a paint bucket's region.
     *
     * Matched on the cell's DOMINANT colour rather than its exact corners, so a
     * fill run up to the edge of a pond stops at the water instead of stopping
     * one cell early on the half-and-half blend tiles that border it. Those
     * blends belong to the shore you are filling; treating them as a different
     * region would leave a one-cell moat of old ground around everything.
     *
     * Four-connected, because a fill that leaks diagonally through a corner
     * touch is a fill nobody asked for.
     */
    fillRegion(layer, x, y, { limit = TerrainBuilder.MAX_FILL_CELLS } = {}) {
        if (!layer || x < 0 || y < 0 || x >= this.width || y >= this.height) return [];

        const target = TerrainBuilder.dominantColor(layer.cornersForCell(x, y));
        const seen = new Set([`${x},${y}`]);
        const region = [];
        const queue = [{ x, y }];

        while (queue.length > 0 && region.length < limit) {
            const cell = queue.shift();
            region.push(cell);
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const [nextX, nextY] = [cell.x + dx, cell.y + dy];
                const key = `${nextX},${nextY}`;
                if (seen.has(key)) continue;
                if (nextX < 0 || nextY < 0 || nextX >= this.width || nextY >= this.height) continue;
                if (TerrainBuilder.dominantColor(layer.cornersForCell(nextX, nextY)) !== target) continue;
                seen.add(key);
                queue.push({ x: nextX, y: nextY });
            }
        }
        return region;
    }

    /**
     * What is painted at this cell, topmost first: the layer you can see and
     * the terrain it is showing. The eyedropper's answer, and the one the layer
     * list uses to say which layer a click belongs to.
     */
    sampleAt(x, y) {
        for (const layer of [...this.orderedLayers()].reverse()) {
            if (!layer.hasPaintAt(x, y)) continue;
            const colorIndex = TerrainBuilder.dominantColor(layer.cornersForCell(x, y));
            if (colorIndex > 0) return { layer, colorIndex };
        }
        return null;
    }

    static cellsAroundCorner(cornerX, cornerY) {
        return [
            [cornerX - 1, cornerY - 1], [cornerX, cornerY - 1],
            [cornerX - 1, cornerY], [cornerX, cornerY]
        ];
    }

    /**
     * The player-facing edit: paint `cells` on `layer` with `colorIndex` (0
     * erases), as one undoable command.
     */
    paint(layer, cells, colorIndex) {
        const changes = [];
        for (const { x, y } of cells) {
            const cellChanges = this.paintCell(layer, x, y, colorIndex);
            if (cellChanges) changes.push(...cellChanges);
        }
        if (changes.length === 0) return null;

        // paintCell already moved the corners; this redraws and syncs them.
        this.applyCornerChanges(layer, changes, { direction: 'to' });
        return changes;
    }

    /**
     * The grid's view of a painted cell: what terrain it is and whether it can
     * be walked on. Top layer with paint wins, which is what you see.
     */
    syncGridCell(cellX, cellY) {
        const gridSystem = this.gameMap?.gridSystem;
        const cell = gridSystem?.grid?.[cellX]?.[cellY];
        if (!cell) return false;

        let effect = null;
        for (const layer of this.orderedLayers()) {
            if (!layer.hasPaintAt(cellX, cellY)) continue;
            const corners = layer.cornersForCell(cellX, cellY);
            // The terrain a cell IS, is the one covering most of it. A blend
            // tile that is three parts water and one part grass is water to
            // walk on, which is what it looks like.
            const dominant = TerrainBuilder.dominantColor(corners);
            if (dominant > 0) effect = layer.atlas.groundEffectForColor(dominant);
        }
        if (!effect) return false;

        if (effect.terrainType) gridSystem.updateCellTerrain(cellX, cellY, effect.terrainType);
        // The authored map may have made this cell unwalkable for a reason that
        // is not terrain (a collider tile on another layer); painting walkable
        // ground over water must not quietly unlock those.
        if (effect.walkable === false) {
            cell.tileWalkable = false;
        } else if (cell._terrainBlocked === true) {
            cell.tileWalkable = true;
        }
        cell._terrainBlocked = effect.walkable === false;
        cell.walkable = cell.tileWalkable && cell.objectWalkable;
        return true;
    }

    static dominantColor(corners) {
        const counts = new Map();
        for (const corner of corners) counts.set(corner, (counts.get(corner) ?? 0) + 1);
        let best = 0;
        let bestCount = 0;
        for (const [color, count] of counts) {
            if (color === 0 || count <= bestCount) continue;
            best = color;
            bestCount = count;
        }
        return best;
    }

    // ── Layers ───────────────────────────────────────────────────────────────

    /**
     * A new paint layer, drawn above every existing one. A map with no terrain
     * layer at all gets its first here rather than needing a trip through
     * Tiled — which is the point of building in game.
     */
    addLayer({ name = null, wangSetName = null } = {}) {
        const atlas = (wangSetName && this.atlases.get(wangSetName)) || this.defaultAtlas;
        if (!atlas) return null;

        const order = this.layers.reduce((highest, layer) => Math.max(highest, layer.order), 0) + 1;
        const layer = new TerrainLayer({
            // Negative ids are this session's: the exporter allocates a real
            // Tiled id when the layer is written, and a collision with an
            // authored id would replace somebody else's layer.
            id: -(this.layers.length + 1),
            name: name || `${atlas.name} ${this.layers.length + 1}`,
            order,
            atlas,
            width: this.width,
            height: this.height
        });
        this.layers.push(layer);
        this.eventManager?.emit?.(EVENTS.TERRAIN_LAYERS_CHANGED, { mapId: this.gameMap.id });
        return layer;
    }

    /**
     * Take a layer out. Returns the layer itself so the caller can put it back —
     * deleting a layer full of work is exactly the edit that needs an undo, and
     * the layer object holds everything needed to restore it.
     */
    removeLayer(layerId) {
        const index = this.layers.findIndex(layer => String(layer.id) === String(layerId));
        if (index === -1) return null;

        const [layer] = this.layers.splice(index, 1);
        this.drawAll();
        // Only authored ids need remembering; one this session invented has
        // nothing in the map file to come back from.
        if (layer.id >= 0) this.removedLayerIds.add(layer.id);
        this.eventManager?.emit?.(EVENTS.TERRAIN_LAYERS_CHANGED, { mapId: this.gameMap.id });
        return layer;
    }

    /** Put a removed layer back where it was, art and all. */
    restoreLayer(layer) {
        if (!layer || this.getLayer(layer.id)) return false;
        this.layers.push(layer);
        this.removedLayerIds.delete(layer.id);
        this.drawAll();
        this.syncGrid();
        this.eventManager?.emit?.(EVENTS.TERRAIN_LAYERS_CHANGED, { mapId: this.gameMap.id });
        return true;
    }

    renameLayer(layerId, name) {
        const layer = this.getLayer(layerId);
        const next = String(name || '').trim();
        if (!layer || !next || next === layer.name) return null;
        const previous = layer.name;
        layer.name = next;
        this.eventManager?.emit?.(EVENTS.TERRAIN_LAYERS_CHANGED, { mapId: this.gameMap.id });
        return previous;
    }

    /** Move a layer up or down the stack. Ordering is a real authoring decision. */
    reorderLayer(layerId, delta) {
        const ordered = this.orderedLayers();
        const index = ordered.findIndex(layer => String(layer.id) === String(layerId));
        const target = index + delta;
        if (index === -1 || target < 0 || target >= ordered.length) return false;

        const moved = ordered[index];
        const swapped = ordered[target];
        [moved.order, swapped.order] = [swapped.order, moved.order];
        this.drawAll();
        this.eventManager?.emit?.(EVENTS.TERRAIN_LAYERS_CHANGED, { mapId: this.gameMap.id });
        return true;
    }

    // ── Persistence ──────────────────────────────────────────────────────────

    serializeState() {
        const layers = this.layers
            .map(layer => ({
                id: layer.id,
                name: layer.name,
                order: layer.order,
                visible: layer.visible,
                wangSet: layer.atlas.name,
                // A layer this session invented has no authored corners, so its
                // "delta" is the whole thing — which is correct: without it the
                // layer would not come back at all.
                authored: layer.id >= 0,
                edited: layer.name !== layer.authoredName ||
                    layer.order !== layer.authoredOrder ||
                    layer.visible === false,
                corners: layer.serializeDeltas()
            }))
            // An authored layer only needs recording when the player changed
            // something about it — its paint, its name or its place in the stack.
            .filter(record => !record.authored ||
                record.edited ||
                Object.keys(record.corners).length > 0);

        const removed = [...this.removedLayerIds];
        if (layers.length === 0 && removed.length === 0) return null;
        return { layers, removed };
    }

    restoreState(state) {
        if (!state?.layers?.length && !state?.removed?.length) return false;

        // Removals first: a layer the player deleted must not be re-created by
        // the record that follows, and its art must be gone before the rest of
        // the stack is drawn over it.
        for (const layerId of state.removed || []) {
            this.removeLayer(layerId);
            this.removedLayerIds.add(layerId);
        }

        for (const record of state.layers || []) {
            let layer = this.getLayer(record.id);
            if (!layer) {
                if (this.removedLayerIds.has(record.id)) continue;
                const atlas = this.atlases.get(record.wangSet) || this.defaultAtlas;
                if (!atlas) continue;
                layer = new TerrainLayer({
                    id: record.id,
                    name: record.name,
                    order: record.order,
                    atlas,
                    width: this.width,
                    height: this.height
                });
                this.layers.push(layer);
            }
            // A name the player typed outlives the one in the map file.
            if (record.name) layer.name = record.name;
            if (Number.isFinite(record.order)) layer.order = record.order;
            if (record.visible === false) layer.visible = false;
            layer.restoreDeltas(record.corners);
        }

        this.build();
        this.syncGrid();
        return true;
    }

    /** Re-derive every painted cell's grid state. Cheap enough to do on load. */
    syncGrid() {
        for (const layer of this.orderedLayers()) {
            for (let y = 0; y < this.height; y++) {
                for (let x = 0; x < this.width; x++) {
                    if (layer.hasPaintAt(x, y)) this.syncGridCell(x, y);
                }
            }
        }
    }

    rebaseline() {
        for (const layer of this.layers) layer.rebaseline();
    }

    dispose() {
        this.clear();
        this.container?.remove();
        this.container = null;
        this.layers = [];
    }
}
