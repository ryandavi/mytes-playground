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
class FloorMaterialRegistry {
    // Floors have no baseboard; a floor's own keys drive its slots directly.
    static PALETTE_OVERRIDES = Object.freeze({ body: 'color', grain: 'grain', seam: 'seam' });

    constructor(resourceManager = null) {
        this.resourceManager = resourceManager;
        this.schemaVersion = 0;
        this.finishes = new Map();
        this.tileSheet = null;
        this.tileSize = 32;
        this.defaultFinishId = null;
        this.images = new Map();
        this.tiles = new Map();
    }

    async load(path = SiteConfig.floorSystem.materialsPath) {
        const response = await fetch(path);
        if (!response.ok) throw new Error(`Unable to load floor materials: ${response.status}`);
        const data = await response.json();
        this.validate(data);
        this.schemaVersion = data.schemaVersion;
        this.finishes = new Map(Object.entries(data.finishes));
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
        const image = this.resourceManager
            ? await this.resourceManager.loadSprite('floor-tile-sheet', this.tileSheet)
            : await new Promise((resolve, reject) => {
                const candidate = new Image();
                candidate.onload = () => resolve(candidate);
                candidate.onerror = () => reject(new Error(`Unable to load ${this.tileSheet}`));
                candidate.src = this.tileSheet;
            });
        this.images.set('floor-tile-sheet', image);
    }

    getFinish(id) {
        return this.finishes.get(id) || null;
    }

    /**
     * The finish's tile, built once and cached. A repaint is a cache hit, which
     * is what makes swapping a room's floor cheap.
     * @returns {HTMLCanvasElement|null}
     */
    getTile(finishId) {
        if (this.tiles.has(finishId)) return this.tiles.get(finishId);
        const tile = this.buildTile(finishId);
        this.tiles.set(finishId, tile);
        return tile;
    }

    buildTile(finishId) {
        const finish = this.getFinish(finishId);
        if (!finish) return null;

        if (typeof finish.template === 'string') {
            const template = this.getFinish(finish.template);
            const source = this.getTile(finish.template);
            if (!source || !template?.palette) return null;
            return FinishPalette.recolor(
                source,
                FinishPalette.resolve(template.palette, finish, FloorMaterialRegistry.PALETTE_OVERRIDES)
            );
        }

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
