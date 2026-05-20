class ResourceManager {
    // Asset registry — single source of truth for all game images.
    // To add a new asset: add one entry here. Set essential: true if it must
    // finish loading before the game world appears (keeps the essentials list
    // automatically in sync with the config).
    static SPRITES = {
        'myte':          { path: 'images/snail/spritesheet.png', essential: true  },
        'snail':         { path: 'images/snail/spritesheet.png', essential: true  },
        'worm':          { path: 'images/snail/spritesheet.png'                   },
        'grass_1_back':  { path: 'images/MapObjects/grass_1_back.png'             },
        'grass_1_front': { path: 'images/MapObjects/grass_1_front.png'            },
        'grass_2_back':  { path: 'images/MapObjects/grass_2_back.png'             },
        'grass_2_front': { path: 'images/MapObjects/grass_2_front.png'            },
        'grass_3_back':  { path: 'images/MapObjects/grass_3_back.png'             },
        'grass_3_front': { path: 'images/MapObjects/grass_3_front.png'            },
    };

    static CURSORS = {
        'pointer':     { path: 'images/cursor/arrow.png', essential: true  },
        'grab':        { path: 'images/cursor/arrow.png', essential: true  },
        'grabbing':    { path: 'images/cursor/arrow.png', essential: true  },
        'arrow_up':    { path: 'images/cursor/arrow.png'                   },
        'arrow_down':  { path: 'images/cursor/arrow.png'                   },
        'arrow_left':  { path: 'images/cursor/arrow.png'                   },
        'arrow_right': { path: 'images/cursor/arrow.png'                   },
        'move':        { path: 'images/cursor/arrow.png'                   },
        'no':          { path: 'images/cursor/arrow.png'                   },
    };

    // Maximum simultaneous image loads (browser typically allows 6-8 per origin anyway)
    static MAX_CONCURRENT_LOADS = 8;

    constructor(core) {
        this.core = core;
        this.sprites = new Map();
        this.isLoaded = false;
        this.loadedResources = new Set(); // Tracks IDs in-flight or completed to prevent duplicate loads
    }

    // --- Public API ---------------------------------------------------------

    async preloadEssentialResources() {
        const essentials = this._buildLoadList({ essentialOnly: true });
        const total = essentials.length;
        let loaded = 0;

        await Promise.all(essentials.map(({ id, path }) =>
            this.loadSprite(id, path, true).then(() => {
                loaded++;
                this.core?.loadingManager?.updateStageProgress(
                    'resources',
                    (loaded / total) * 0.3 // Essentials occupy the first 30% of the resources stage
                );
            })
        ));
    }

    async loadResources() {
        const nonEssentials = this._buildLoadList({ essentialOnly: false })
            .filter(({ id }) => !this.loadedResources.has(id));

        await this._loadQueue(nonEssentials, { stageOffset: 0.3, stageRange: 0.7 });
        this.isLoaded = true;
    }

    // Preload tilesets and object sprites for a specific map.
    async preloadMapResources(mapData) {
        if (!mapData) return;

        // Use a Map keyed by ID to deduplicate entries before loading
        const pending = new Map();

        if (mapData.TileData?.tilesets) {
            for (const tileset of mapData.TileData.tilesets) {
                if (tileset.imageSource && !this.isResourceLoaded(tileset.name)) {
                    pending.set(tileset.name, { id: tileset.name, path: tileset.imageSource });
                }
            }
        }

        if (mapData.objects) {
            for (const obj of mapData.objects) {
                const id = `${obj.type.toLowerCase()}_${obj.variant}`;
                const config = ResourceManager.SPRITES[id];
                if (config && !this.isResourceLoaded(id)) {
                    pending.set(id, { id, path: config.path });
                }
            }
        }

        if (pending.size > 0) {
            await this._loadQueue([...pending.values()]);
        }
    }

    getSprite(id) {
        return this.sprites.get(id);
    }

    getSpriteURL(id) {
        if (id.startsWith('cursor_')) {
            return ResourceManager.CURSORS[id.slice(7)]?.path ?? null;
        }
        return ResourceManager.SPRITES[id]?.path ?? null;
    }

    isResourceLoaded(id) {
        return this.sprites.has(id);
    }

    unloadUnusedResources(usedResourceIds) {
        const keep = new Set(usedResourceIds);
        const essentialIds = new Set(this._buildLoadList({ essentialOnly: true }).map(e => e.id));

        for (const [id, resource] of this.sprites.entries()) {
            if (keep.has(id) || essentialIds.has(id)) continue;
            this.sprites.delete(id);
            this.loadedResources.delete(id);
            if (resource instanceof Image) resource.src = '';
        }
    }

    // --- Private helpers ----------------------------------------------------

    // Returns a flat array of {id, path} entries from SPRITES + CURSORS.
    // essentialOnly: true  → only entries with essential: true
    // essentialOnly: false → only entries without essential: true (background load)
    _buildLoadList({ essentialOnly }) {
        const result = [];

        for (const [id, cfg] of Object.entries(ResourceManager.SPRITES)) {
            if (Boolean(cfg.essential) === essentialOnly) {
                result.push({ id, path: cfg.path });
            }
        }
        for (const [id, cfg] of Object.entries(ResourceManager.CURSORS)) {
            const key = `cursor_${id}`;
            if (Boolean(cfg.essential) === essentialOnly) {
                result.push({ id: key, path: cfg.path });
            }
        }

        return result;
    }

    // Loads a list of {id, path} entries with bounded concurrency.
    // Optionally reports progress into the 'resources' loading stage.
    async _loadQueue(items, { stageOffset = 0, stageRange = 0 } = {}) {
        if (items.length === 0) return;

        const total = items.length;
        let loaded = 0;
        const queue = [...items];

        const runOne = async () => {
            while (queue.length > 0) {
                const { id, path } = queue.shift();
                try {
                    await this.loadSprite(id, path);
                } catch {
                    // Non-fatal: log already emitted inside loadSprite
                }
                loaded++;
                if (stageRange > 0) {
                    this.core?.loadingManager?.updateStageProgress(
                        'resources',
                        Math.min(stageOffset + (loaded / total) * stageRange, 0.99)
                    );
                }
            }
        };

        // Launch up to MAX_CONCURRENT_LOADS workers simultaneously
        const workers = Array.from(
            { length: Math.min(ResourceManager.MAX_CONCURRENT_LOADS, items.length) },
            runOne
        );
        await Promise.all(workers);
    }

    loadSprite(id, url, isPriority = false) {
        if (this.loadedResources.has(id)) {
            return Promise.resolve(this.sprites.get(id));
        }
        this.loadedResources.add(id);

        return new Promise((resolve) => {
            const img = new Image();
            if (isPriority) img.fetchPriority = 'high';
            img.onload = () => {
                this.sprites.set(id, img);
                resolve(img);
            };
            img.onerror = () => {
                console.warn(`Failed to load sprite: ${id} from ${url}`);
                resolve(null);
            };
            img.src = url;
        });
    }
}
