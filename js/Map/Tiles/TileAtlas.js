// ─────────────────────────────────────────────────────────────────────────────
// TileAtlas — "where does tile N live in this tileset's image, and draw it".
//
// The half of an atlas that has nothing to do with wang sets, walls or terrain:
// tile id → source rect, tile id → gid, and a decoded image shared through the
// resource manager. Both WallWangAtlas and TerrainAtlas redraw whole regions on
// every edit, so re-decoding the PNG per stroke is not an option.
// ─────────────────────────────────────────────────────────────────────────────
class TileAtlas {
    constructor(tileset) {
        this.tileset = tileset;
        this.firstgid = tileset.firstgid;
        this.columns = tileset.columns;
        this.tileWidth = tileset.tileWidth;
        this.tileHeight = tileset.tileHeight;
        this.image = null;
    }

    /** Where a tile's art sits in the tileset image. */
    sourceRect(tileId) {
        if (!Number.isInteger(tileId) || tileId < 0) return null;
        return {
            x: (tileId % this.columns) * this.tileWidth,
            y: Math.floor(tileId / this.columns) * this.tileHeight,
            width: this.tileWidth,
            height: this.tileHeight
        };
    }

    /** The global id a .tmx layer's CSV would carry for this tile. */
    gidForTileId(tileId) {
        return Number.isInteger(tileId) && tileId >= 0 ? tileId + this.firstgid : 0;
    }

    /** The local tile id a .tmx gid refers to, or null if it is another tileset's. */
    tileIdForGid(gid) {
        const tileId = Number(gid) - this.firstgid;
        return Number.isInteger(tileId) && tileId >= 0 && tileId < (this.tileset.tileCount ?? Infinity)
            ? tileId
            : null;
    }

    /** The tileset's per-tile properties, as the loader parsed them. */
    propertiesForTileId(tileId) {
        return this.tileset.tiles?.[tileId]?.properties || {};
    }

    /**
     * Resolves the tileset image, preferring whatever the resource manager has
     * already decoded.
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

    /** Blits one tile. Silent no-op until the image lands. */
    drawTile(ctx, tileId, destX, destY) {
        const rect = this.sourceRect(tileId);
        if (!ctx || !this.image || !rect) return false;
        ctx.drawImage(
            this.image,
            rect.x, rect.y, rect.width, rect.height,
            destX, destY, rect.width, rect.height
        );
        return true;
    }

    /**
     * A single tile as a data URL, for palette swatches. Cached per tile —
     * a palette re-renders on every panel open.
     */
    swatchUrl(tileId) {
        this._swatches ??= new Map();
        if (this._swatches.has(tileId)) return this._swatches.get(tileId);
        const rect = this.sourceRect(tileId);
        if (!this.image || !rect) return null;

        const canvas = document.createElement('canvas');
        canvas.width = rect.width;
        canvas.height = rect.height;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(this.image, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
        const url = canvas.toDataURL('image/png');
        this._swatches.set(tileId, url);
        return url;
    }
}
