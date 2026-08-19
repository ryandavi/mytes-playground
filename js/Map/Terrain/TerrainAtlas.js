// ─────────────────────────────────────────────────────────────────────────────
// TerrainAtlas — the corner-wang half of the bridge: four corner colours in,
// one tile out, and back again.
//
// Ground terrain in Tiled is a `type="corner"` wang set, which means the unit
// of truth is the CORNER POINT, not the tile. A map w×h cells has (w+1)×(h+1)
// corners; each holds one colour; and every tile is simply whatever the set
// authors for the four corners it happens to touch. Two neighbouring tiles
// share two corners, so a grass tile beside a water tile automatically resolves
// to the pair of blend tiles that meet along their shared edge — nobody picks a
// transition tile by hand, and there is nothing to keep in sync.
//
// That is also why painting stores corners rather than tiles. Storing tiles
// would mean a repaint has to re-derive its neighbours' tiles from tiles, which
// is the same information one lossy step removed: a blend tile does not say
// which side was painted last.
// ─────────────────────────────────────────────────────────────────────────────
class TerrainAtlas extends TileAtlas {
    /**
     * The first tileset on the map that authors `wangSetName` as a corner set.
     * One map, one ground contract — an ambiguous corners→tile answer is not an
     * answer.
     */
    static fromTilesets(tilesets = [], wangSetName = SiteConfig.terrainSystem.wangSetName) {
        const wanted = String(wangSetName || '').toLowerCase();
        for (const tileset of tilesets) {
            const wangSet = tileset?.wangSets?.get?.(wanted);
            if (wangSet?.isCorner) return new TerrainAtlas(tileset, wangSet);
        }
        return null;
    }

    /** Every corner wang set on the map, keyed by name — for the panel's set picker. */
    static allFromTilesets(tilesets = []) {
        const found = new Map();
        for (const tileset of tilesets) {
            for (const wangSet of tileset?.wangSets?.values?.() || []) {
                if (!wangSet.isCorner || found.has(wangSet.name)) continue;
                found.set(wangSet.name, new TerrainAtlas(tileset, wangSet));
            }
        }
        return found;
    }

    constructor(tileset, wangSet) {
        super(tileset);
        this.wangSet = wangSet;
    }

    get name() {
        return this.wangSet.name;
    }

    /** The paintable terrains, in the order the tileset declares them. */
    get colors() {
        return this.wangSet.colors;
    }

    colorAt(index) {
        return this.wangSet.colorAt(index);
    }

    colorIndexForTerrain(terrain) {
        return this.wangSet.colorIndexForTerrain(terrain);
    }

    /**
     * The tile for these four corners, TL TR BR BL.
     *
     * All-zero is "nothing painted here", which is a real answer rather than a
     * missing tile: the layer below shows through. Any other arrangement the
     * set does not author is a hole in the tileset, and the caller decides
     * whether to refuse the paint or fall back.
     */
    tileIdForCorners(corners, x = null, y = null) {
        if (corners.every(corner => corner === 0)) return null;
        if (!SiteConfig.terrainSystem.useTileVariants || x === null || y === null) {
            return this.wangSet.tileIdForCorners(corners);
        }

        const variants = this.wangSet.tileIdsForCorners(corners);
        if (variants.length <= 1) return variants[0] ?? null;
        return variants[TerrainAtlas.variantIndex(x, y, variants.length)];
    }

    /**
     * Which of several equally-valid tiles this cell gets.
     *
     * Hashed from the cell's own coordinates rather than drawn at random, and
     * that is the whole point: a random pick would reshuffle the map on every
     * redraw, and an exported .tmx would differ from the same map reloaded. A
     * position hash is stable, needs nothing stored, and round-trips.
     *
     * The constants are an ordinary integer hash - two odd multipliers and a
     * xorshift - chosen only because they scatter neighbouring cells rather
     * than banding them into stripes, which is what multiplying and adding
     * alone would do.
     */
    static variantIndex(x, y, count) {
        let hash = (x * 73856093) ^ (y * 19349663);
        hash = (hash ^ (hash >>> 13)) >>> 0;
        return hash % count;
    }

    hasCorners(corners) {
        return corners.every(corner => corner === 0) || this.wangSet.hasCorners(corners);
    }

    gidForCorners(corners, x = null, y = null) {
        const tileId = this.tileIdForCorners(corners, x, y);
        return tileId === null ? 0 : this.gidForTileId(tileId);
    }

    /** Reading an authored map back: which corners does this painted gid imply? */
    cornersForGid(gid) {
        const tileId = this.tileIdForGid(gid);
        return tileId === null ? null : this.wangSet.cornersFor(tileId);
    }

    /** The solid swatch a palette shows for a terrain, and paints with. */
    solidTileIdForColor(index) {
        return this.wangSet.solidTileIdForColor(index);
    }

    /** That swatch as an image, for anything that wants to show a terrain. */
    swatchUrlForColor(index) {
        const tileId = this.solidTileIdForColor(index);
        return tileId === null ? null : this.swatchUrl(tileId);
    }

    /**
     * What painting this colour does to the ground underneath: the terrain type
     * the grid should carry, and whether anything can walk on it.
     *
     * Read off the tileset's own per-tile properties rather than a table in the
     * code — the tileset already declares `terrain` and `type="collider"` on its
     * tiles, and that is what the loader believes on load. Painting has to end
     * up at the same answer or the same water would be swimmable when authored
     * and walkable when painted.
     */
    groundEffectForColor(index) {
        const tileId = this.solidTileIdForColor(index);
        if (tileId === null) return { terrainType: null, walkable: true };
        const properties = this.propertiesForTileId(tileId);
        const raw = properties.terrain || properties.terrainType || null;
        return {
            terrainType: raw ? TerrainAtlas.mapTerrainName(raw) : null,
            walkable: String(properties.type || '').toLowerCase() !== 'collider'
        };
    }

    /** Tiled's terrain vocabulary → the grid's. One table, in SiteConfig. */
    static mapTerrainName(name) {
        const mapping = SiteConfig.terrainSystem.terrainMapping;
        return mapping[String(name).toLowerCase()] || GridSystem.defaultTerrain;
    }
}
