class ResourceManager {
    constructor() {
        this.sprites = new Map();
        this.sounds = new Map();
        this.loadingPromises = [];
        this.isLoaded = false;
        this.core = null; // Will be set by MyteCore
        
        // Track loaded resources to avoid duplicates
        this.loadedResources = new Set();
        
        // Image loading optimization
        this.imageLoadQueue = [];
        this.maxConcurrentLoads = 8; // Limit concurrent image loads
        this.activeLoads = 0;

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

    async preloadEssentialResources() {
        try {
            if (this.core && this.core.loadingManager) {
                this.core.loadingManager.setMessage("Loading essential assets...");
            }
            
            // Create a batch of promises for essential resources
            const loadingPromises = this.essentialResources.map(id => {
                // Check if it's a sprite or cursor
                if (this.spriteConfigs[id]) {
                    return this.loadSprite(id, this.spriteConfigs[id], true); // Priority loading
                } else if (this.cursorConfigs[id]) {
                    return this.loadSprite(`cursor_${id}`, this.cursorConfigs[id], true);
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
            
            // OPTIMIZATION: Queue non-essential loads for controlled processing
            this.imageLoadQueue = nonEssentialResources.map(([id, path]) => ({ id, path }));
            
            // Process queue with controlled concurrency
            await this.processImageQueue(nonEssentialResources.length);
            
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
    
    // OPTIMIZATION: Process image queue with controlled concurrency
    async processImageQueue(totalResources) {
        return new Promise((resolve) => {
            // If the queue is empty, resolve immediately
            if (this.imageLoadQueue.length === 0) {
                resolve();
                return;
            }
            
            let loadedResources = 0;
            const initialProgress = 0.3; // Start after essential resources
            const remainingProgress = 0.7;
            
            // Process next item in queue
            const processNext = () => {
                // If queue is empty or we've loaded everything, resolve
                if (this.imageLoadQueue.length === 0 && this.activeLoads === 0) {
                    resolve();
                    return;
                }
                
                // If we have capacity and items to load, start loading
                while (this.activeLoads < this.maxConcurrentLoads && this.imageLoadQueue.length > 0) {
                    const { id, path } = this.imageLoadQueue.shift();
                    this.activeLoads++;
                    
                    this.loadSprite(id, path).then(() => {
                        loadedResources++;
                        this.activeLoads--;
                        
                        // Update loading manager if available
                        if (this.core && this.core.loadingManager) {
                            const progress = initialProgress + 
                                (loadedResources / totalResources) * remainingProgress;
                            
                            this.core.loadingManager.updateStageProgress('resources', Math.min(progress, 0.99));
                        }
                        
                        // Process next item
                        setTimeout(processNext, 0);
                    }).catch(() => {
                        // Even on error, continue processing
                        loadedResources++;
                        this.activeLoads--;
                        setTimeout(processNext, 0);
                    });
                }
            };
            
            // Start processing
            processNext();
        });
    }

    loadSprite(id, url, isPriority = false) {
        // Check if already loaded or loading
        if (this.loadedResources.has(id)) {
            return Promise.resolve(this.sprites.get(id));
        }
        
        // Track this resource as being loaded
        this.loadedResources.add(id);
        
        return new Promise((resolve, reject) => {
            const img = new Image();
            
            // OPTIMIZATION: Set loading priority
            if (isPriority) {
                img.fetchPriority = 'high';
            }
            
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
        const totalToLoad = this.loadingPromises.length + this.imageLoadQueue.length;
        if (totalToLoad === 0) return 1;
        
        // Count loaded resources
        const loadedCount = this.loadingPromises.filter(p => p.status === 'resolved').length;
        const remainingInQueue = this.imageLoadQueue.length;
        
        return (totalToLoad - remainingInQueue) / totalToLoad;
    }

    isResourceLoaded(id) {
        return this.sprites.has(id);
    }

    // OPTIMIZATION: Improved resource cleanup
    unloadUnusedResources(usedResourceIds) {
        // Create a Set for O(1) lookups
        const usedResources = new Set(usedResourceIds);
        const essentialResources = new Set(this.essentialResources);
        
        // Track unloaded resources for logging
        const unloadedResources = [];
        
        // Check each sprite
        for (const [id, resource] of this.sprites.entries()) {
            // Skip essential resources and used resources
            if (essentialResources.has(id) || usedResources.has(id)) {
                continue;
            }
            
            // Unload the sprite
            this.sprites.delete(id);
            this.loadedResources.delete(id);
            unloadedResources.push(id);
            
            // Release image memory if possible
            if (resource instanceof Image) {
                resource.src = ''; // Clear the source to help garbage collection
            }
        }
        
        // Log unloaded resources
        if (unloadedResources.length > 0) {
            console.log(`Unloaded ${unloadedResources.length} unused resources`);
        }
    }
    
    // OPTIMIZATION: Added method to preload resources for a specific map
    async preloadMapResources(mapData) {
        if (!mapData) return;
        
        const resources = new Set();
        
        // Extract tileset image sources
        if (mapData.TileData && mapData.TileData.tilesets) {
            mapData.TileData.tilesets.forEach(tileset => {
                if (tileset.imageSource && !this.isResourceLoaded(tileset.name)) {
                    resources.add({
                        id: tileset.name,
                        path: tileset.imageSource
                    });
                }
            });
        }
        
        // Extract object sprites
        if (mapData.objects) {
            mapData.objects.forEach(obj => {
                const spriteId = `${obj.type.toLowerCase()}_${obj.variant}`;
                if (this.spriteConfigs[spriteId] && !this.isResourceLoaded(spriteId)) {
                    resources.add({
                        id: spriteId,
                        path: this.spriteConfigs[spriteId]
                    });
                }
            });
        }
        
        // Load all resources in parallel with controlled concurrency
        if (resources.size > 0) {
            console.log(`Preloading ${resources.size} resources for map ${mapData.id}`);
            
            this.imageLoadQueue = [...resources];
            await this.processImageQueue(resources.size);
            
            console.log(`Completed preloading resources for map ${mapData.id}`);
        }
    }
}