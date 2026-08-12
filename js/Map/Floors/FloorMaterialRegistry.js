// ─────────────────────────────────────────────────────────────────────────────
// FloorMaterialRegistry — floor finishes, schema v1.
//
// Deliberately much smaller than the wall registry, because a floor has no
// silhouette. A wall finish needs five columns to say how it resolves where the
// wall runs out; a floor never runs out, so a finish is ONE tileable tile and
// the renderer repeats it. Nothing here derives masks or clips anything.
//
// What it does share with walls is the borrowing rule: a finish with no art of
// its own names a `template` plus a `color` and gets that tile recoloured
// (see FinishPalette). That is the one piece worth having in common, and it is
// in common rather than copied.
// ─────────────────────────────────────────────────────────────────────────────
class FloorMaterialRegistry extends SurfaceMaterialRegistry {
    // Floors have no baseboard; a floor's own keys drive its slots directly.
    static PALETTE_OVERRIDES = Object.freeze({ body: 'color', grain: 'grain', seam: 'seam' });

    constructor(resourceManager = null) {
        super(resourceManager);
        this.tileSheet = null;
        this.tileSize = 32;
        this.defaultFinishId = null;
        this.tiles = new Map();
    }

    async load(path = SiteConfig.floorSystem.materialsPath) {
        const data = await this.fetchDefinition(path, 'floor materials');
        this.validate(data);
        this.setCommonDefinition(data);
        this.tileSheet = data.tileSheet || null;
        this.tileSize = Number(data.tileSize) || 32;
        this.defaultFinishId = data.defaultFinishId || null;
        this.tiles.clear();
        await this.loadImages();
        return this;
    }

    validate(data) {
        if (!data || data.schemaVersion !== 1) {
            throw new Error('floor-materials.json must use schemaVersion 1');
        }
        if (!data.finishes || typeof data.finishes !== 'object') {
            throw new Error('Floor materials require a finishes block');
        }
        for (const [id, finish] of Object.entries(data.finishes)) {
            const indexed = Number.isInteger(finish.tile);
            if (indexed === (typeof finish.template === 'string')) {
                throw new Error(`Floor finish "${id}" needs exactly one of "tile" or "template"`);
            }
            if (indexed && !data.tileSheet) {
                throw new Error(`Floor finish "${id}" indexes a tile sheet, but none is declared`);
            }
            if (typeof finish.template !== 'string') continue;
            const problem = FinishPalette.describeTemplateProblem(id, finish, data.finishes);
            if (problem) throw new Error(`Floor finish "${id}" ${problem}`);
        }
    }

    async loadImages() {
        if (!this.tileSheet) return;
        await this.loadImageRecords([['floor-tile-sheet', this.tileSheet]]);
    }

    /**
     * The finish's tile, built once and cached. A repaint is a cache hit, which
     * is what makes swapping a room's floor cheap.
     * @returns {HTMLCanvasElement|null}
     */
    getTile(finishId) {
        return this.resolveFinishAsset(finishId, {
            cache: this.tiles,
            paletteOverrides: FloorMaterialRegistry.PALETTE_OVERRIDES,
            buildDirect: finish => this.buildDirectTile(finish),
            recolor: (source, substitutions) => FinishPalette.recolor(source, substitutions)
        });
    }

    buildDirectTile(finish) {
        const sheet = this.images.get('floor-tile-sheet');
        if (!sheet || !Number.isInteger(finish.tile)) return null;
        const canvas = document.createElement('canvas');
        canvas.width = this.tileSize;
        canvas.height = this.tileSize;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        context.imageSmoothingEnabled = false;
        context.drawImage(
            sheet,
            finish.tile * this.tileSize, 0, this.tileSize, this.tileSize,
            0, 0, this.tileSize, this.tileSize
        );
        return canvas;
    }
}
