// MapLoader.js
class GameMapLoader {
    constructor() {
        this.maps = new Map();
        this.currentMap = null;
    }

    async loadMapData() {
        try {
            const response = await fetch('../data/maps/maps.json');
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const mapData = await response.json();
            
            // Store maps in the Map object
            Object.entries(mapData.maps).forEach(([id, mapData]) => {
                this.maps.set(id, mapData);
            });

            return true;
        } catch (error) {
            console.error('Error loading map data:', error);
            return false;
        }
    }

    async loadMap(mapId, container) {
        const mapData = this.maps.get(mapId);
        if (!mapData) {
            console.error(`Map ${mapId} not found`);
            return null;
        }

        // Create map instance
        const map = new GameMap(mapData, container);
        await map.initialize();
        
        this.currentMap = map;
        return map;
    }


    async loadMapWithTransition(mapId, container) {
        // Show loading screen
        if (this.core && this.core.loadingManager) {
            this.core.loadingManager.show();
            this.core.loadingManager.setMessage(`Traveling to ${mapId}...`);
            this.core.loadingManager.updateProgress(10);
        }
        
        try {
            // Prepare for map change
            if (this.currentMap) {
                // Save current map state
                // ...
                
                // Update progress
                if (this.core && this.core.loadingManager) {
                    this.core.loadingManager.updateProgress(30);
                    this.core.loadingManager.setMessage(`Unloading current map...`);
                }
                
                // Clean up current map
                this.currentMap.dispose();
                this.currentMap = null;
            }
            
            // Update progress
            if (this.core && this.core.loadingManager) {
                this.core.loadingManager.updateProgress(50);
                this.core.loadingManager.setMessage(`Loading ${mapId}...`);
            }
            
            // Load the new map data
            const mapData = this.maps.get(mapId);
            if (!mapData) {
                throw new Error(`Map ${mapId} not found`);
            }
            
            // Update progress
            if (this.core && this.core.loadingManager) {
                this.core.loadingManager.updateProgress(70);
                this.core.loadingManager.setMessage(`Initializing ${mapId}...`);
            }
            
            // Create map instance
            const map = new GameMap(mapData, container);
            await map.initialize();
            
            // Update progress
            if (this.core && this.core.loadingManager) {
                this.core.loadingManager.updateProgress(90);
                this.core.loadingManager.setMessage(`Almost ready...`);
            }
            
            // Final setup
            this.currentMap = map;
            
            // Complete loading and hide loading screen
            if (this.core && this.core.loadingManager) {
                this.core.loadingManager.updateProgress(100);
                this.core.loadingManager.setMessage(`Welcome to ${mapId}!`);
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
    
    async transitionToMap(mapId) {
        // Disable user controls during transition
        this.inputHandler.disable();
        
        // Load the new map with loading screen transition
        const newMap = await this.parent.core.mapLoader.loadMapWithTransition(mapId, this);
        
        if (newMap) {
            // Set up the new map environment
            this.gameMap = newMap;
            
            // Reset camera and other systems
            this.camera.reset();
            
            // Position mytes in the new map
            this.mytes.forEach(myte => {
                const spawnPoint = this.gameMap.getSpawnPoint('myte');
                myte.setPosition(spawnPoint.x, spawnPoint.y);
            });
            
            // Re-enable user controls after map is ready
            this.inputHandler.enable();
            
            return true;
        } else {
            // Handle failed map loading
            this.inputHandler.enable();
            return false;
        }
    }


}