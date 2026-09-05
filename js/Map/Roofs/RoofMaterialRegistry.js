class RoofMaterialRegistry extends SurfaceMaterialRegistry {
    static PALETTE_OVERRIDES = Object.freeze({
        body: 'color', line: 'line', shade: 'shade', light: 'light', edge: 'edge'
    });

    constructor(resourceManager = null) {
        super(resourceManager);
        this.tileSize = 32;
        this.colors = new Map();
        this.atlases = new Map();
    }

    async load(path = SiteConfig.roofSystem.materialsPath) {
        const data = await this.fetchDefinition(path, 'roof materials');
        this.validate(data);
        this.setCommonDefinition(data);
        this.tileSize = Number(data.tileSize) || 32;
        this.colors = new Map(Object.entries(data.colors || {}));
        this.atlases.clear();
        await this.loadImageRecords([...this.finishes].filter(([, finish]) => finish.sheet)
            .map(([id, finish]) => [`roof-${id}`, finish.sheet]));
        return this;
    }

    validate(data) {
        if (!data || data.schemaVersion !== 1 || !data.finishes) {
            throw new Error('roof-materials.json must use schemaVersion 1 and declare finishes');
        }
        for (const [id, finish] of Object.entries(data.finishes)) {
            if (!!finish.sheet === (typeof finish.template === 'string')) {
                throw new Error(`Roof finish "${id}" needs exactly one of "sheet" or "template"`);
            }
            if (!finish.sheet) {
                const problem = FinishPalette.describeTemplateProblem(id, finish, data.finishes);
                if (problem) throw new Error(`Roof finish "${id}" ${problem}`);
            } else if (!finish.palette?.body) {
                throw new Error(`Roof finish "${id}" needs a palette with a body slot`);
            }
        }
    }

    resolveColor(colorId, finish) {
        if (FinishPalette.isColor(colorId)) return colorId;
        return this.colors.get(colorId) || finish?.color || finish?.palette?.body || '#808080';
    }

    getAtlas(finishId, colorId = null) {
        const key = `${finishId}|${colorId || ''}`;
        if (this.atlases.has(key)) return this.atlases.get(key);
        const finish = this.getFinish(finishId);
        if (!finish) return null;
        const templateId = finish.template || finishId;
        const template = this.getFinish(templateId);
        const source = this.images.get(`roof-${templateId}`);
        if (!source || !template?.palette) return null;
        const tint = { ...finish, color: this.resolveColor(colorId, finish) };
        const atlas = FinishPalette.recolor(source,
            FinishPalette.resolve(template.palette, tint, RoofMaterialRegistry.PALETTE_OVERRIDES));
        this.atlases.set(key, atlas);
        return atlas;
    }

    getColor(id) { return FinishPalette.isColor(id) ? id : this.colors.get(id) || null; }

    getSample(finishId, colorId = null) {
        const atlas = this.getAtlas(finishId, colorId);
        if (!atlas) return null;
        const canvas = document.createElement('canvas');
        canvas.width = this.tileSize;
        canvas.height = this.tileSize;
        canvas.getContext('2d').drawImage(atlas, 0, this.tileSize, this.tileSize, this.tileSize,
            0, 0, this.tileSize, this.tileSize);
        return canvas;
    }
}
