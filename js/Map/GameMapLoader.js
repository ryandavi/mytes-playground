// GameMapLoader with improved error handling
class GameMapLoader {
    constructor(core) {
        this.core = core;
        this.maps = new Map();
        this.currentMap = null;
        console.log(`[GameMapLoader] Initialized`);
    }

    // Optional initialization method
    async init() {
        console.log(`[GameMapLoader] Init called`);
        return true;
    }

    async loadMap(mapId, container) {
        try {
            console.log(`[GameMapLoader] Loading map: ${mapId}`);
            
            // Check if container is valid
            if (!container) {
                throw new Error('Container is null or undefined');
            }
            
            if (!container.canvas) {
                throw new Error('Container canvas is null or undefined');
            }
            
            // Create map instance
            console.log(`[GameMapLoader] Creating new GameMap instance`);
            const map = new GameMap(container);
            
            // Initialize with TMX file
            console.log(`[GameMapLoader] Initializing map with id: ${mapId}`);
            const success = await map.initialize(mapId);
            
            if (!success) {
                console.error(`[GameMapLoader] Failed to initialize map: ${mapId}`);
                return null;
            }
            
            this.currentMap = map;
            console.log(`[GameMapLoader] Map ${mapId} loaded successfully`);
            return map;
        } catch (error) {
            console.error(`[GameMapLoader] Error loading map ${mapId}:`, error);
            return null;
        }
    }

    async loadMapWithTransition(mapId, container, options = {}) {
        // Show loading screen
        if (this.core && this.core.loadingManager) {
            this.core.loadingManager.show();
            this.core.loadingManager.setMessage(options.message || `Traveling to ${mapId}...`);
            this.core.loadingManager.updateStageProgress('container', 0.1); // 10% progress
        }
        
        try {
            // Prepare for map change
            if (this.currentMap) {
                // Update progress
                if (this.core && this.core.loadingManager) {
                    this.core.loadingManager.updateStageProgress('container', 0.3); // 30% progress
                    this.core.loadingManager.setMessage(`Unloading current map...`);
                }
                
                // Clean up current map
                this.currentMap.dispose();
                this.currentMap = null;
            }
            
            // Update progress
            if (this.core && this.core.loadingManager) {
                this.core.loadingManager.updateStageProgress('container', 0.5); // 50% progress
                this.core.loadingManager.setMessage(`Loading ${mapId}...`);
            }
            
            // Load the new map
            const map = await this.loadMap(mapId, container);
            
            if (!map) {
                throw new Error(`Failed to load map: ${mapId}`);
            }
            
            // Update progress
            if (this.core && this.core.loadingManager) {
                this.core.loadingManager.updateStageProgress('container', 0.9); // 90% progress
                this.core.loadingManager.setMessage(`Almost ready...`);
            }
            
            // Final setup
            this.currentMap = map;
            
            // Complete loading and hide loading screen
            if (this.core && this.core.loadingManager) {
                this.core.loadingManager.updateStageProgress('container', 1.0); // 100% progress
                this.core.loadingManager.setMessage(`Welcome to ${mapId}!`);
                
                // Wait a short moment before hiding
                setTimeout(() => {
                    this.core.loadingManager.hide();
                }, 200);
            }
            
            return map;
        } catch (error) {
            console.error(`Error loading map ${mapId}:`, error);
            
            // Show error in loading screen
            if (this.core && this.core.loadingManager) {
                this.core.loadingManager.setMessage(`Error loading map: ${error.message}`);
            }
            
            return null;
        }
    }
}