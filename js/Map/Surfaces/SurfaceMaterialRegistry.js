class SurfaceMaterialRegistry {
    constructor(resourceManager = null) {
        this.resourceManager = resourceManager;
        this.schemaVersion = 0;
        this.finishes = new Map();
        this.images = new Map();
    }

    async fetchDefinition(path, label) {
        const response = await fetch(path);
        if (!response.ok) throw new Error(`Unable to load ${label}: ${response.status}`);
        return response.json();
    }

    setCommonDefinition(data) {
        this.schemaVersion = data.schemaVersion;
        this.finishes = new Map(Object.entries(data.finishes || {}));
        this.images.clear();
    }

    async loadImage(key, path) {
        const image = this.resourceManager
            ? await this.resourceManager.loadSprite(key, path)
            : await new Promise((resolve, reject) => {
                const candidate = new Image();
                candidate.onload = () => resolve(candidate);
                candidate.onerror = () => reject(new Error(`Unable to load ${path}`));
                candidate.src = path;
            });
        this.images.set(key, image);
        return image;
    }

    async loadImageRecords(records) {
        await Promise.all(records.map(([key, path]) => this.loadImage(key, path)));
    }

    resolveFinishAsset(finishId, options) {
        const { cache, buildDirect, paletteOverrides, recolor } = options;
        if (cache.has(finishId)) return cache.get(finishId);

        const finish = this.getFinish(finishId);
        let asset = null;
        if (finish && typeof finish.template === 'string') {
            const template = this.getFinish(finish.template);
            const source = this.resolveFinishAsset(finish.template, options);
            if (source && template?.palette) {
                asset = recolor(
                    source,
                    FinishPalette.resolve(template.palette, finish, paletteOverrides)
                );
            }
        } else if (finish) {
            asset = buildDirect(finish, finishId);
        }

        cache.set(finishId, asset);
        return asset;
    }

    getFinish(id) {
        return this.finishes.get(id) || null;
    }
}
