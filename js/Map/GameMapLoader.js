// GameMapLoader with improved error handling
class GameMapLoader {
    constructor(core) {
        this.core = core;
        this.maps = new Map();
        this.currentMap = null;
        console.log(`[GameMapLoader] Initialized`);
    }

    updateTransitionOverlay(progress, message = null) {
        const loadingManager = this.core?.loadingManager;
        if (!loadingManager) return;

        loadingManager.setManualProgress(progress);

        if (message) {
            loadingManager.setMessage(message);
        }
    }

    // Optional initialization method
    async init() {
        console.log(`[GameMapLoader] Init called`);
        return true;
    }

    // Update the loadMap method in GameMapLoader.js to pass the isInitialLoad flag
    async loadMap(mapId, container, options = {}) {
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

            // Initialize with TMX file, passing along initialization options
            console.log(`[GameMapLoader] Initializing map with id: ${mapId}`);
            const success = await map.initialize(mapId, {
                isInitialLoad: options.isInitialLoad || false
            });

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

    // Update the loadMapWithTransition method to pass the isInitialLoad flag
    async loadMapWithTransition(mapId, container, options = {}) {
        // Store the current map for rollback if needed
        const previousMap = this.currentMap;

        // Show loading screen
        if (this.core && this.core.loadingManager) {
            this.core.loadingManager.beginOverlay({
                progress: 10,
                message: options.message || `Traveling to ${mapId}...`
            });
        }

        try {
            // Prepare for map change
            if (this.currentMap) {
                // Update progress
                if (this.core && this.core.loadingManager) {
                    this.updateTransitionOverlay(30, `Unloading current map...`);
                }

                // Don't dispose the current map yet - keep it in case we need to roll back
            }

            // Update progress
            if (this.core && this.core.loadingManager) {
                this.updateTransitionOverlay(50, `Loading ${mapId}...`);
            }

            // Load the new map
            const map = await this.loadMap(mapId, container, {
                isInitialLoad: options.isInitialLoad || false
            });

            if (!map) {
                throw new Error(`Failed to load map: ${mapId}`);
            }

            // Update progress
            if (this.core && this.core.loadingManager) {
                this.updateTransitionOverlay(90, `Almost ready...`);
            }

            // Now that we have successfully loaded the new map, we can safely dispose the old one
            if (previousMap) {
                previousMap.dispose();
            }

            // Final setup
            this.currentMap = map;

            // Complete loading and hide loading screen
            if (this.core && this.core.loadingManager) {
                this.updateTransitionOverlay(100, `Welcome to ${mapId}!`);

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

                // Wait a little longer to show the error message
                setTimeout(() => {
                    this.core.loadingManager.hide();
                }, 2000);
            }

            // Important: keep the current map active since loading failed
            this.currentMap = previousMap;

            return null;
        }
    }
}
