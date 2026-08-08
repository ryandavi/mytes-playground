class WallMaterialRegistry {
    static DIRECTIONS = Object.freeze(['north', 'east', 'south', 'west']);

    constructor(resourceManager = null) {
        this.resourceManager = resourceManager;
        this.schemaVersion = 0;
        this.constructions = new Map();
        this.finishes = new Map();
        this.fixtures = new Map();
        this.images = new Map();
    }

    async load(path = SiteConfig.wallSystem.materialsPath) {
        const response = await fetch(path);
        if (!response.ok) throw new Error(`Unable to load wall materials: ${response.status}`);
        const data = await response.json();
        this.validate(data);
        this.schemaVersion = data.schemaVersion;
        this.constructions = new Map(Object.entries(data.constructions));
        this.finishes = new Map(Object.entries(data.finishes));
        this.fixtures = new Map(Object.entries(data.fixtures || {}));
        await this.loadImages();
        return this;
    }

    validate(data) {
        if (!data || data.schemaVersion !== 2) {
            throw new Error('wall-materials.json must use schemaVersion 2');
        }
        if (!data.constructions || !data.finishes) {
            throw new Error('Wall materials require constructions and finishes');
        }

        for (const [id, construction] of Object.entries(data.constructions)) {
            if (!construction.sheet || !Number.isFinite(construction.cellSize) ||
                !Number.isFinite(construction.height) || !Number.isFinite(construction.stubHeight)) {
                throw new Error(`Wall construction "${id}" has an invalid sheet or dimensions`);
            }
            if (!Array.isArray(construction.maskMap) || construction.maskMap.length !== 16 ||
                construction.maskMap.some(column => !Number.isInteger(column) || column < 0 || column > 15)) {
                throw new Error(`Wall construction "${id}" must intentionally map all 16 masks`);
            }
            if (!Array.isArray(construction.debugMaskColors) || construction.debugMaskColors.length !== 16) {
                throw new Error(`Wall construction "${id}" must identify all 16 masks with debug colors`);
            }
            if (!Array.isArray(construction.debugMaskLabels) || construction.debugMaskLabels.length !== 16) {
                throw new Error(`Wall construction "${id}" must label all 16 mask columns`);
            }
        }

        for (const [id, finish] of Object.entries(data.finishes)) {
            if (!finish.sheet || !Array.isArray(finish.maskMap) || finish.maskMap.length !== 16 ||
                !Number.isFinite(finish.bands?.full?.baseY) || !Number.isFinite(finish.bands?.stub?.baseY)) {
                throw new Error(`Wall finish "${id}" requires 16 mask columns and full/stub bands`);
            }
        }

        for (const [id, fixture] of Object.entries(data.fixtures || {})) {
            if (!fixture.sheet) continue;
            if (!fixture.piece || !['x', 'y', 'w', 'h'].every(key => Number.isFinite(fixture.piece[key]))) {
                throw new Error(`Wall fixture "${id}" requires a sheet piece`);
            }
        }
    }

    async loadImages() {
        const records = [
            ...[...this.constructions].map(([id, value]) => [`wall-construction:${id}`, value.sheet]),
            ...[...this.finishes].map(([id, value]) => [`wall-finish:${id}`, value.sheet]),
            ...[...this.fixtures]
                .filter(([, value]) => value.sheet)
                .map(([id, value]) => [`wall-fixture:${id}`, value.sheet])
        ];
        await Promise.all(records.map(async ([key, path]) => {
            const image = this.resourceManager
                ? await this.resourceManager.loadSprite(key, path)
                : await new Promise((resolve, reject) => {
                    const candidate = new Image();
                    candidate.onload = () => resolve(candidate);
                    candidate.onerror = () => reject(new Error(`Unable to load ${path}`));
                    candidate.src = path;
                });
            this.images.set(key, image);
        }));
    }

    getConstruction(id) {
        return this.constructions.get(id) || null;
    }

    getFinish(id) {
        return this.finishes.get(id) || null;
    }

    getConstructionImage(id) {
        return this.images.get(`wall-construction:${id}`) || null;
    }

    getFinishImage(id) {
        return this.images.get(`wall-finish:${id}`) || null;
    }

    getFixture(id) {
        return this.fixtures.get(id) || null;
    }

    getFixtureImage(id) {
        return this.images.get(`wall-fixture:${id}`) || null;
    }
}
