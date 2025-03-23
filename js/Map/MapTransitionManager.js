class MapTransitionManager {
    constructor(container) {
        this.container = container;
        this.core = container.core;
        this.transitionElement = document.querySelector('.map-transition');
        this.messageElement = this.transitionElement?.querySelector('.transition-message');

        console.log('[MapTransitionManager] Initializing');

        this.minimumDisplayTime = 500;

        
        this.previousMapId = null;


        // Create if not exists
        if (!this.transitionElement) {
            this.createTransitionElement();
        }
    }

    createTransitionElement() {
        console.log('[MapTransitionManager] Creating transition element');
        this.transitionElement = document.createElement('div');
        this.transitionElement.className = 'map-transition';

        this.messageElement = document.createElement('div');
        this.messageElement.className = 'transition-message';
        this.transitionElement.appendChild(this.messageElement);

        this.container.element.appendChild(this.transitionElement);
    }

    async startTransition(options = {}) {
        const mapId = options.targetMap;
        const spawnPoint = options.targetSpawnPoint || 'default';
        const isInitialLoad = options.isInitialLoad || false;
        const sourcePortal = options.sourcePortal || null;
    
        // For regular transitions (not initial load), disable inputs and show transition
        if (!isInitialLoad) {
            // Disable user controls during transition
            if (this.container.inputHandler && this.container.inputHandler.disable) {
                this.container.inputHandler.disable();
            } else {
                console.warn('InputHandler disable method not available');
            }
    
            // Show transition screen AND wait for it to complete
            await this.showTransition(options.message || `Loading Map`);
        }
    
        // Try to load map using the core's mapLoader
        let newMap;
    
        if (this.core && this.core.mapLoader) {
            // Core has a mapLoader, use it
            if (isInitialLoad) {
                // For initial load, use the regular load method to avoid nested loading screens
                newMap = await this.core.mapLoader.loadMap(mapId, this.container, { isInitialLoad: true });
            } else {
                // For transitions, use the transition method
                newMap = await this.core.mapLoader.loadMapWithTransition(mapId, this.container, {
                    ...options,
                    isInitialLoad: false
                });
            }
        } else {
            // No core mapLoader, create map directly
            console.warn('Core mapLoader not available, creating map directly');
            newMap = new GameMap(this.container);
    
            try {
                const success = await newMap.initialize(mapId, { isInitialLoad });
                if (!success) {
                    console.error(`[MapTransitionManager] Failed to initialize map: ${mapId}`);
                    newMap = null;
                }
            } catch (error) {
                console.error('[MapTransitionManager] Error initializing map:', error);
                newMap = null;
            }
        }
    
        if (newMap) {
            // Save the current map ID as previous before switching to the new map
            if (this.container.gameMap && this.container.gameMap.id) {
                this.previousMapId = this.container.gameMap.id;
                console.log(`[MapTransitionManager] Saved previous map ID: ${this.previousMapId}`);
            }
    
            // Set up the new map environment
            this.container.gameMap = newMap;
    
            // Reset camera if needed
            if (!options.preserveCamera && this.container.camera) {
                // this.container.camera.reset();
            }





            // set camera to center on first myte
            if (this.container.mytes && this.container.mytes.length > 0) {

                const firstMyte = this.container.mytes[0];

                this.container.camera.centerToPosition(firstMyte.posX, firstMyte.posY, firstMyte.size, true);
            }

    
            // Position mytes in the new map if they exist
            if (this.container.mytes && this.container.mytes.length > 0) {
                this.container.mytes.forEach(myte => {
                    const spawnLocation = this.container.gameMap.getSpawnPoint(spawnPoint);
                    // myte.setPosition(spawnLocation.x, spawnLocation.y);
                });
            }



    
            // Hide transition screen if not initial load
            if (!isInitialLoad) {
                // successful transition
                this.hideTransition();
    
                // Re-enable user controls
                if (this.container.inputHandler && this.container.inputHandler.enable) {
                    this.container.inputHandler.enable();
                } else {
                    console.warn('InputHandler enable method not available');
                }
            }
    
            // Call onComplete callback if provided
            if (typeof options.onComplete === 'function') {
                options.onComplete(true);
            }
    
            return true;
        } else {
            // Handle failed map loading
            if (!isInitialLoad) {
                this.messageElement.textContent = "Map not found!";
    
                // Show UI message if possible
                if (this.container.ui && this.container.ui.showMessage) {
                    this.container.ui.showMessage(`Cannot find map "${mapId}"`);
                }
    
                // Hide after delay
                setTimeout(() => {
                    this.hideTransition();
    
                    // Re-enable user controls
                    if (this.container.inputHandler && this.container.inputHandler.enable) {
                        this.container.inputHandler.enable();
                    } else {
                        console.warn('InputHandler enable method not available');
                    }
                }, 2000);
            } else {
                // For initial load failures, we need a fallback approach
                console.error(`[MapTransitionManager] Initial map load failed for ${mapId}`);
    
                // Try to load a known default map as a last resort
                const fallbackMapId = 'House'; // Use a map that should always exist
    
                if (mapId !== fallbackMapId) {
                    console.log(`[MapTransitionManager] Trying fallback map: ${fallbackMapId}`);
                    return this.startTransition({
                        ...options,
                        targetMap: fallbackMapId,
                        message: `Loading fallback map...`
                    });
                } else {
                    // If even the fallback map failed, show critical error
                    console.error(`[MapTransitionManager] Critical error: Fallback map failed to load`);
    
                    if (this.core && this.core.loadingManager) {
                        this.core.loadingManager.setMessage(`Critical error: Could not load any map`);
                    }
                }
            }
    
            // Call onComplete callback with failure if provided
            if (typeof options.onComplete === 'function') {
                options.onComplete(false);
            }
    
            // If this transition came from a portal, re-enable it
            if (sourcePortal) {
                sourcePortal.isAnimating = false;
                sourcePortal.isActive = true;
            }
    
            return false;
        }
    }

    showTransition(message) {
        this.transitionStartTime = Date.now();
        if (this.messageElement) {
            this.messageElement.textContent = message;
        }

        // Show the transition element
        this.transitionElement.classList.add('active');

        // Return a promise that resolves when the transition completes
        return new Promise(resolve => {
            // Listen for the transitionend event
            const transitionEndHandler = () => {
                this.transitionElement.removeEventListener('transitionend', transitionEndHandler);
                resolve();
            };

            this.transitionElement.addEventListener('transitionend', transitionEndHandler);

            // Fallback in case the transition event doesn't fire
            // Get computed style to find actual transition duration
            const computedStyle = window.getComputedStyle(this.transitionElement);
            const transitionDuration = parseFloat(computedStyle.transitionDuration) * 1000;

            // Add a small buffer (50ms) to ensure the transition is complete
            setTimeout(() => {
                this.transitionElement.removeEventListener('transitionend', transitionEndHandler);
                resolve();
            }, transitionDuration + 50);
        });
    }

    hideTransition() {

        const timeShown = Date.now() - this.transitionStartTime;

        if (timeShown < this.minimumDisplayTime) {
            // If it hasn't been shown long enough, delay hiding
            setTimeout(() => {
                this.transitionElement.classList.remove('active');
            }, this.minimumDisplayTime - timeShown);
        } else {
            // If it's been shown long enough, hide immediately
            this.transitionElement.classList.remove('active');
        }
    }

    dispose() {
        console.log('[MapTransitionManager] Disposing');
        if (this.transitionElement && this.transitionElement.parentNode) {
            this.transitionElement.parentNode.removeChild(this.transitionElement);
        }
        this.transitionElement = null;
        this.messageElement = null;
    }
}