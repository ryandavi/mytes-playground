// ─────────────────────────────────────────────────────────────────────────────
// WangSet — a Tiled wang set, parsed once and readable both ways.
//
// A wang set is Tiled's answer to "which tile goes here": every tile in the set
// declares what terrain meets it on each side, and the editor picks the tile
// whose declaration matches its neighbours. That is the whole of auto-tiling,
// and it is why grass, water and paths blend without anybody drawing corners by
// hand.
//
// Tiled writes a tile's declaration as a `wangid` — eight colour indices in a
// fixed rotation starting at the top and going clockwise:
//
//        7   0   1          0  Top          4  Bottom
//         ┌──┬──┐           1  Top-right    5  Bottom-left
//        6│     │2          2  Right        6  Left
//         └──┴──┘           3  Bottom-right 7  Top-left
//        5   4   3
//
// A `type="corner"` set uses only the odd slots (the four corners) and a
// `type="edge"` set only the even ones. Index 0 means "no colour here"; 1..n
// index into the set's `wangcolor` list. That single convention covers ground
// terrain, walls, cliffs, fences — anything a future tileset wants to author —
// which is why this class parses ALL of them and stays out of the business of
// what any particular set means.
//
// The wall system's mask ↔ tile bijection (WallWangAtlas) and the ground
// painter's corner ↔ tile lookup (TerrainAtlas) are both built on this. Neither
// parses XML of its own.
// ─────────────────────────────────────────────────────────────────────────────
class WangSet {
    /** Corner slots in the order the rest of the code names them: TL, TR, BR, BL. */
    static CORNER_SLOTS = Object.freeze([7, 1, 3, 5]);

    /** Edge slots, N E S W. */
    static EDGE_SLOTS = Object.freeze([0, 2, 4, 6]);

    static TYPE = Object.freeze({ CORNER: 'corner', EDGE: 'edge', MIXED: 'mixed' });

    /**
     * Eight colour indices, or null if the attribute is not one. Tiled always
     * writes eight; anything else is a file we do not understand and would
     * rather skip than half-read.
     */
    static parseWangId(value) {
        const parts = String(value || '').split(',').map(part => Number(part.trim()));
        if (parts.length !== 8 || parts.some(part => !Number.isFinite(part) || part < 0)) return null;
        return parts;
    }

    /** Reads one `<wangset>` element. Returns null for a set with no usable tiles. */
    static fromElement(element) {
        if (!element) return null;

        const colors = [...element.querySelectorAll(':scope > wangcolor')].map((colorEl, index) => ({
            // Tiled colour indices are 1-based; index 0 is "nothing".
            index: index + 1,
            name: colorEl.getAttribute('name') || `Color ${index + 1}`,
            color: colorEl.getAttribute('color') || null,
            probability: Number(colorEl.getAttribute('probability')) || 1,
            // A colour may name the terrain it stands for, which is how a
            // painted tile knows to make the ground under it water or grass.
            // Falls back to the colour's own name lowercased.
            terrain: (
                colorEl.querySelector(':scope > properties > property[name="terrain"]')?.getAttribute('value') ||
                colorEl.getAttribute('name') || ''
            ).toLowerCase() || null
        }));

        const tiles = new Map();
        for (const tileEl of element.querySelectorAll(':scope > wangtile')) {
            const tileId = Number(tileEl.getAttribute('tileid'));
            const wangId = WangSet.parseWangId(tileEl.getAttribute('wangid'));
            if (!Number.isInteger(tileId) || !wangId) continue;
            tiles.set(tileId, wangId);
        }
        if (tiles.size === 0) return null;

        return new WangSet({
            name: element.getAttribute('name') || 'Unnamed',
            type: element.getAttribute('type') || WangSet.TYPE.MIXED,
            colors,
            tiles
        });
    }

    constructor({ name, type, colors = [], tiles = new Map() }) {
        this.name = name;
        this.type = String(type || WangSet.TYPE.MIXED).toLowerCase();
        this.colors = colors;
        this.tiles = tiles;

        // signature -> tileId, built once. The first tile wins: a set may
        // author several tiles for the same arrangement as variants, and
        // picking a stable one keeps a repaint from shuffling the map.
        this._byCornerKey = new Map();
        for (const [tileId, wangId] of this.tiles) {
            const key = WangSet.cornerKey(WangSet.CORNER_SLOTS.map(slot => wangId[slot]));
            if (!this._byCornerKey.has(key)) this._byCornerKey.set(key, tileId);
        }
    }

    get isCorner() {
        return this.type === WangSet.TYPE.CORNER;
    }

    get isEdge() {
        return this.type === WangSet.TYPE.EDGE;
    }

    static cornerKey(corners) {
        return corners.join(',');
    }

    /** The four corner colours of a tile, TL TR BR BL, or null if it is not in the set. */
    cornersFor(tileId) {
        const wangId = this.tiles.get(tileId);
        return wangId ? WangSet.CORNER_SLOTS.map(slot => wangId[slot]) : null;
    }

    /** The tile whose corners are exactly these, or null when the set has none. */
    tileIdForCorners(corners) {
        return this._byCornerKey.get(WangSet.cornerKey(corners)) ?? null;
    }

    /** Whether the set can draw this arrangement at all. */
    hasCorners(corners) {
        return this._byCornerKey.has(WangSet.cornerKey(corners));
    }

    colorAt(index) {
        return this.colors.find(color => color.index === index) || null;
    }

    /** The colour index that paints `terrain`, e.g. 'grass'. Zero means none. */
    colorIndexForTerrain(terrain) {
        const wanted = String(terrain || '').toLowerCase();
        return this.colors.find(color => color.terrain === wanted)?.index ?? 0;
    }

    /** Every tile that is a solid field of one colour — the palette's swatches. */
    solidTileIdForColor(index) {
        return this.tileIdForCorners([index, index, index, index]);
    }
}
