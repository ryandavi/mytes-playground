class ResourceManager {
    constructor() {
        this.sprites = new Map();
        this.sounds = new Map();
        this.loadingPromises = [];
        this.isLoaded = false;
        this.core = null; // Will be set by MyteCore

        // Define configurations as static properties
        this.spriteConfigs = {
            'myte': 'images/snail/spritesheet.png',
            'snail': 'images/snail/spritesheet.png',
            'grass_1_back': 'images/MapObjects/grass_1_back.png',
            'grass_1_front': 'images/MapObjects/grass_1_front.png',
            'grass_2_back': 'images/MapObjects/grass_2_back.png',
            'grass_2_front': 'images/MapObjects/grass_2_front.png',
            'grass_3_back': 'images/MapObjects/grass_3_back.png',
            'grass_3_front': 'images/MapObjects/grass_3_front.png'
        };

        this.cursorConfigs = {
            'pointer': 'images/cursor/arrow.png',
            'grab': 'images/cursor/arrow.png',
            'grabbing': 'images/cursor/arrow.png',
            'arrow_up': 'images/cursor/arrow.png',
            'arrow_down': 'images/cursor/arrow.png',
            'arrow_left': 'images/cursor/arrow.png',
            'arrow_right': 'images/cursor/arrow.png',
            'move': 'images/cursor/arrow.png',
            'no': 'images/cursor/arrow.png',
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


// Only showing the updated methods for ResourceManager.js

async preloadEssentialResources() {
    try {
        if (this.core && this.core.loadingManager) {
            this.core.loadingManager.setMessage("Loading essential assets...");
        }
        
        const loadingPromises = this.essentialResources.map(id => {
            // Check if it's a sprite or cursor
            if (this.spriteConfigs[id]) {
                return this.loadSprite(id, this.spriteConfigs[id]);
            } else if (this.cursorConfigs[id]) {
                return this.loadSprite(`cursor_${id}`, this.cursorConfigs[id]);
            }
            return Promise.resolve(); // Skip if not found
        });

        // Track loading progress
        const totalEssentials = loadingPromises.length;
        let loadedEssentials = 0;
        
        const trackingPromises = loadingPromises.map(promise => {
            return promise.then(result => {
                loadedEssentials++;
                
                // Update loading manager if available
                if (this.core && this.core.loadingManager) {
                    this.core.loadingManager.updateStageProgress(
                        'resources', 
                        loadedEssentials / totalEssentials * 0.3 // Essential resources are ~30% of all resources
                    );
                }
                
                return result;
            });
        });

        await Promise.all(trackingPromises);
        console.log('Essential resources loaded successfully');
    } catch (error) {
        console.error('Error loading essential resources:', error);
        throw error;
    }
}

async loadResources() {
    try {
        // Load sprites
        const spritesToLoad = [...Object.entries(this.spriteConfigs), 
                              ...Object.entries(this.cursorConfigs).map(([key, path]) => 
                                  [`cursor_${key}`, path])];
        
        // Filter out essential resources which are already loaded
        const nonEssentialResources = spritesToLoad.filter(([id]) => 
            !this.essentialResources.includes(id.replace('cursor_', '')) && 
            !this.sprites.has(id));
        
        // If there are very few resources to load (or none), accelerate the progress
        if (nonEssentialResources.length < 5) {
            console.log('Few resources to load, accelerating progress');
            
            // Update loading manager to reflect quick load
            if (this.core && this.core.loadingManager) {
                // Start at 30% (essentials) and quickly move to 75%
                this.core.loadingManager.updateStageProgress('resources', 0.75);
                
                // After a shorter delay, mark as complete
                setTimeout(() => {
                    this.core.loadingManager.updateStageProgress('resources', 1.0);
                    
                    // Check if we can complete loading now
                    if (this.core.loadingManager.stages.container.progress >= 0.95) {
                        this.core.loadingManager.completeLoading();
                    }
                }, 100); // Much shorter delay (100ms instead of 300ms)
            }
        }
        
        this.loadingPromises = nonEssentialResources.map(([id, path]) => 
            this.loadSprite(id, path));

        // Track loading progress
        const totalResources = Math.max(1, this.loadingPromises.length); // Avoid division by zero
        let loadedResources = 0;
        
        // Start from 30% progress (essentials already loaded)
        const initialProgress = 0.3;
        const remainingProgress = 0.7;
        
        // Create a wrapper for each promise to track progress
        const trackingPromises = this.loadingPromises.map(promise => {
            return promise.then(result => {
                loadedResources++;
                
                // Update loading manager if available
                if (this.core && this.core.loadingManager) {
                    const progress = initialProgress + 
                        (loadedResources / totalResources) * remainingProgress;
                    
                    this.core.loadingManager.updateStageProgress('resources', progress);
                }
                
                return result;
            });
        });

        // Wait for all resources to load
        await Promise.all(trackingPromises);
        this.isLoaded = true;
        console.log('All resources loaded successfully');
        
        // Ensure we mark as complete even if there were no resources to load
        if (this.core && this.core.loadingManager && nonEssentialResources.length === 0) {
            this.core.loadingManager.updateStageProgress('resources', 1.0);
        }
        
    } catch (error) {
        console.error('Error loading resources:', error);
        // In case of error, still mark resources as loaded to let the game continue
        if (this.core && this.core.loadingManager) {
            this.core.loadingManager.updateStageProgress('resources', 1.0);
        }
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