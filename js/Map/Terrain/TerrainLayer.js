// ─────────────────────────────────────────────────────────────────────────────
// TerrainLayer — one paintable ground layer: a corner grid, a wang set, and the
// .tmx layer it came from.
//
// Layers exist because ground is not one thing. Grass under a dirt path under a
// puddle is three passes over the same cells, and a corner grid can only hold
// one colour per point — so "paint a path over the grass" is a second layer,
// exactly as it is in Tiled. Ordering is the map file's: a layer's `order` is
// its index among the map's tile layers, and everything downstream (drawing,
// export, the panel's list) reads that one number.
//
// The corner grid is (width+1) × (height+1) and sparse: only painted points are
// stored, so an untouched layer costs nothing and "nothing here" is genuinely
// absent rather than a colour meaning empty.
// ─────────────────────────────────────────────────────────────────────────────
class TerrainLayer {
    /**
     * @param {object} options
     *   id/name/order  identity in the .tmx
     *   atlas          the TerrainAtlas whose wang set this layer is painted with
     *   width/height   the map, in cells
     */
    constructor({ id = null, name = 'Terrain', order = 0, atlas, width, height, visible = true }) {
        this.id = id;
        this.name = name;
        this.order = order;
        this.atlas = atlas;
        this.width = width;
        this.height = height;
        this.visible = visible !== false;
        // Tiles on this layer that belong to no wang set - a decorative tuft or
        // stone the author dropped onto their ground layer. The painter never
        // touches them and the exporter writes them back where they were, so
        // adopting a hand-made layer does not quietly delete its decoration.
        // Keyed by index into the layer data, as the .tmx stores it.
        this.foreignTiles = new Map();
        // "cornerX,cornerY" -> colour index. Absent means unpainted.
        this.corners = new Map();
        // What the map file says about this layer, for diffing what the player
        // changed. A save records an authored layer only when one of these has
        // actually moved.
        this.authoredCorners = new Map();
        this.authoredName = name;
        this.authoredOrder = order;
    }

    static key(cornerX, cornerY) {
        return `${cornerX},${cornerY}`;
    }

    get cornerWidth() {
        return this.width + 1;
    }

    get cornerHeight() {
        return this.height + 1;
    }

    colorAt(cornerX, cornerY) {
        return this.corners.get(TerrainLayer.key(cornerX, cornerY)) ?? 0;
    }

    setColorAt(cornerX, cornerY, colorIndex) {
        if (cornerX < 0 || cornerY < 0 || cornerX >= this.cornerWidth || cornerY >= this.cornerHeight) {
            return false;
        }
        const key = TerrainLayer.key(cornerX, cornerY);
        const previous = this.corners.get(key) ?? 0;
        if (previous === colorIndex) return false;
        if (colorIndex > 0) this.corners.set(key, colorIndex);
        else this.corners.delete(key);
        return true;
    }

    /** The four corner points of a cell, TL TR BR BL — the order wang ids use. */
    static cornerPointsFor(x, y) {
        return [[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]];
    }

    /** The four corner colours of a cell, in the same order. */
    cornersForCell(x, y) {
        return TerrainLayer.cornerPointsFor(x, y).map(([cx, cy]) => this.colorAt(cx, cy));
    }

    /** The tile this cell resolves to right now, or null for "nothing painted". */
    tileIdForCell(x, y) {
        return this.atlas.tileIdForCorners(this.cornersForCell(x, y), x, y);
    }

    gidForCell(x, y) {
        return this.atlas.gidForCorners(this.cornersForCell(x, y), x, y);
    }

    /** The decorative tile sitting on this cell, if the author left one. */
    foreignGidAt(x, y) {
        return this.foreignTiles.get((y * this.width) + x) ?? 0;
    }

    clearForeignAt(x, y) {
        return this.foreignTiles.delete((y * this.width) + x);
    }

    /**
     * The terrain this layer is mostly made of — what it should be called and
     * what it should look like in a list. A layer is nearly always one terrain
     * (that is what layers are FOR here), so the commonest one is not a
     * compromise, it is the answer.
     */
    dominantColorIndex() {
        const counts = new Map();
        for (const color of this.corners.values()) {
            counts.set(color, (counts.get(color) ?? 0) + 1);
        }
        let best = 0;
        let bestCount = 0;
        for (const [color, count] of counts) {
            if (count <= bestCount) continue;
            best = color;
            bestCount = count;
        }
        return best;
    }

    isEmpty() {
        return this.corners.size === 0;
    }

    /** Whether a cell has any paint on it at all. */
    hasPaintAt(x, y) {
        return this.cornersForCell(x, y).some(corner => corner > 0);
    }

    /** Take the current state as the authored baseline (after an export). */
    rebaseline() {
        this.authoredCorners = new Map(this.corners);
        this.authoredName = this.name;
        this.authoredOrder = this.order;
    }

    /**
     * Only what the player changed, as `{ "cx,cy": colourIndex }` — including
     * zeros, which are erasures of authored paint and would otherwise be
     * indistinguishable from "unchanged" on restore.
     */
    serializeDeltas() {
        const deltas = {};
        for (const [key, color] of this.corners) {
            if ((this.authoredCorners.get(key) ?? 0) !== color) deltas[key] = color;
        }
        for (const key of this.authoredCorners.keys()) {
            if (!this.corners.has(key)) deltas[key] = 0;
        }
        return deltas;
    }

    restoreDeltas(deltas = {}) {
        for (const [key, color] of Object.entries(deltas)) {
            if (Number(color) > 0) this.corners.set(key, Number(color));
            else this.corners.delete(key);
        }
        return this;
    }
}
