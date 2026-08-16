/**
 * WallWangAtlas — the two-way bridge between a wall cell's neighbour mask and
 * the Tiled wang tile that represents it.
 *
 * The loader has always thrown the wangid away and kept only "is this a wall
 * tile", because the runtime recomputes the mask from neighbours and never
 * needs to know which tile it came from. Two things do need the mapping:
 *
 *  - the flat 'hidden' presentation, which draws wall cells as top-down tiles
 *    and must pick a tile for a cell the map author never painted;
 *  - the Tiled exporter, which turns in-game walls back into a tile layer.
 *
 * The `Wall` wang set is `type="edge"`, so of the eight wangid slots only
 * 0/2/4/6 carry an edge colour — north, east, south, west, in that order.
 * That lines up one-for-one with WallBuilder's mask bits, which makes this a
 * bijection over every mask the tileset actually authors.
 */
class WallWangAtlas {
    // A getter, not a static field: WallBuilder is a separate script and this
    // would otherwise read its constants before the bundle has defined them.
    static get EDGE_SLOTS() {
        return [
            [0, WallBuilder.MASK_NORTH],
            [2, WallBuilder.MASK_EAST],
            [4, WallBuilder.MASK_SOUTH],
            [6, WallBuilder.MASK_WEST]
        ];
    }

    /**
     * A wangid is eight comma-separated colour indices. For an edge set the
     * corner slots are always 0, so only the four edge slots decide the mask;
     * any non-zero colour counts as "wall here" because the set has one colour.
     */
    static maskFromWangId(wangId) {
        const parts = String(wangId || '').split(',').map(part => Number(part.trim()));
        if (parts.length !== 8 || parts.some(part => !Number.isFinite(part))) return null;
        let mask = 0;
        for (const [slot, bit] of WallWangAtlas.EDGE_SLOTS) {
            if (parts[slot] > 0) mask |= bit;
        }
        return mask;
    }

    /**
     * Picks the first tileset that authors the Wall wang set. A map may pull in
     * several tilesets, but only one of them can own the wall contract — the
     * mask→tile answer has to be unambiguous.
     */
    static fromTilesets(tilesets = []) {
        const tileset = tilesets.find(candidate => candidate?.wallWangTiles?.size > 0);
        return tileset ? new WallWangAtlas(tileset) : null;
    }

    constructor(tileset) {
        this.tileset = tileset;
        this.byMask = new Map(tileset.wallWangTiles);
        this.byTileId = new Map([...this.byMask].map(([mask, tileId]) => [tileId, mask]));
        this.firstgid = tileset.firstgid;
        this.columns = tileset.columns;
        this.tileWidth = tileset.tileWidth;
        this.tileHeight = tileset.tileHeight;
        this.image = null;
    }

    /**
     * The mask an isolated cell resolves to.
     *
     * Mask 0 — a wall cell with no wall neighbour at all — has no wang tile in
     * walls3.tsx, and it cannot: an edge wang set has nothing to say about a
     * tile with no edges. Tiled can't paint one either, so this is not a
     * regression the round-trip introduces, just a hole it has to land in
     * somewhere. The fallback is configurable because which tile reads best as
     * a lone pillar is an art decision, not a geometry one.
     */
    resolveMask(mask) {
        if (this.byMask.has(mask)) return mask;
        const fallback = SiteConfig.wallSystem.wangIsolatedFallbackMask;
        return this.byMask.has(fallback) ? fallback : null;
    }

    hasExactTile(mask) {
        return this.byMask.has(mask);
    }

    tileIdForMask(mask) {
        const resolved = this.resolveMask(mask);
        return resolved === null ? null : this.byMask.get(resolved);
    }

    /** The global tile id a .tmx layer's CSV data would carry for this mask. */
    gidForMask(mask) {
        const tileId = this.tileIdForMask(mask);
        return tileId === null ? 0 : tileId + this.firstgid;
    }

    /** Where this mask's art sits in the tileset image. */
    sourceRectForMask(mask) {
        const tileId = this.tileIdForMask(mask);
        if (tileId === null) return null;
        return {
            x: (tileId % this.columns) * this.tileWidth,
            y: Math.floor(tileId / this.columns) * this.tileHeight,
            width: this.tileWidth,
            height: this.tileHeight
        };
    }

    /**
     * Resolves the tileset image, preferring whatever the resource manager has
     * already decoded — the flat overlay redraws on every wall edit and must
     * not re-decode a PNG each time.
     */
    async loadImage(resourceManager = null) {
        if (this.image) return this.image;
        const cached = resourceManager?.getSprite?.(this.tileset.name);
        if (cached) {
            this.image = cached;
            return this.image;
        }
        if (!this.tileset.imageSource) return null;
        this.image = await new Promise(resolve => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = () => resolve(null);
            image.src = this.tileset.imageSource;
        });
        if (this.image) resourceManager?.sprites?.set(this.tileset.name, this.image);
        return this.image;
    }

    /** Blits one cell's flat top-down art. Silent no-op until the image lands. */
    drawCell(ctx, mask, destX, destY) {
        const rect = this.sourceRectForMask(mask);
        if (!ctx || !this.image || !rect) return false;
        ctx.drawImage(
            this.image,
            rect.x, rect.y, rect.width, rect.height,
            destX, destY, rect.width, rect.height
        );
        return true;
    }
}
