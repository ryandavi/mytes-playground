class ResourceManager {
    constructor() {
        this.sprites = new Map();
        this.sounds = new Map();
        this.loadingPromises = [];
        this.isLoaded = false;

        // Define configurations as static properties
        this.spriteConfigs = {
            'myte': '../images/snail/spritesheet.png',
            'snail': '../images/snail/spritesheet.png',
            'grass_1_back': '../images/MapObjects/grass_1_back.png',
            'grass_1_front': '../images/MapObjects/grass_1_front.png',
            'grass_2_back': '../images/MapObjects/grass_2_back.png',
            'grass_2_front': '../images/MapObjects/grass_2_front.png',
            'grass_3_back': '../images/MapObjects/grass_3_back.png',
            'grass_3_front': '../images/MapObjects/grass_3_front.png'
        };

        this.cursorConfigs = {
            'pointer': '../images/cursor/arrow.png',
            'grab': '../images/cursor/arrow.png',
            'grabbing': '../images/cursor/arrow.png',
            'arrow_up': '../images/cursor/arrow.png',
            'arrow_down': '../images/cursor/arrow.png',
            'arrow_left': '../images/cursor/arrow.png',
            'arrow_right': '../images/cursor/arrow.png',
            'move': '../images/cursor/arrow.png',
            'no': '../images/cursor/arrow.png',
        };

        // Define essential resources
        this.essentialResources = [
            // Essential sprites
            'myte',
            'snail',
            // Essential cursor
            'pointer',
            'grab',
            'grabbing'
        ];
    }

    async loadResources() {
        try {
            // Load sprites
            for (const [key, path] of Object.entries(this.spriteConfigs)) {
                this.loadingPromises.push(
                    this.loadSprite(key, path)
                );
            }

            // Load cursor
            for (const [key, path] of Object.entries(this.cursorConfigs)) {
                this.loadingPromises.push(
                    this.loadSprite(`cursor_${key}`, path)
                );
            }

            // Wait for all resources to load
            await Promise.all(this.loadingPromises);
            this.isLoaded = true;
            console.log('All resources loaded successfully');
            
        } catch (error) {
            console.error('Error loading resources:', error);
            throw error;
        }
    }

    async preloadEssentialResources() {
        try {
            const loadingPromises = this.essentialResources.map(id => {
                // Check if it's a sprite or cursor
                if (this.spriteConfigs[id]) {
                    return this.loadSprite(id, this.spriteConfigs[id]);
                } else if (this.cursorConfigs[id]) {
                    return this.loadSprite(`cursor_${id}`, this.cursorConfigs[id]);
                }
                return Promise.resolve(); // Skip if not found
            });

            await Promise.all(loadingPromises);
            console.log('Essential resources loaded successfully');
        } catch (error) {
            console.error('Error loading essential resources:', error);
            throw error;
        }
    }

    loadSprite(id, url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                this.sprites.set(id, img);
                resolve(img);
            };
            img.onerror = () => {
                console.warn(`Failed to load sprite: ${id} at ${url}`);
                resolve(null); // Resolve with null instead of rejecting
            };
            img.src = url;
        });
    }

    getSprite(id) {
        return this.sprites.get(id);
    }

    getSpriteURL(id) {
        if (id.startsWith('cursor_')) {
            const cursorId = id.replace('cursor_', '');
            return this.cursorConfigs[cursorId];
        }
        return this.spriteConfigs[id];
    }

    getLoadingProgress() {
        if (this.loadingPromises.length === 0) return 1;
        const loaded = this.loadingPromises.filter(p => p.status === 'resolved').length;
        return loaded / this.loadingPromises.length;
    }

    isResourceLoaded(id) {
        return this.sprites.has(id);
    }

    unloadUnusedResources(usedResourceIds) {
        for (const [id, resource] of this.sprites.entries()) {
            if (!usedResourceIds.includes(id) && !this.essentialResources.includes(id)) {
                this.sprites.delete(id);
            }
        }
    }
}