class MapTransitionManager {
    constructor(containerManager) {
        this.containerManager = containerManager;
        this.isTransitioning = false;
        this.transitionConfig = null;
        
        // Create transition overlay
        this.overlay = document.createElement('div');
        this.overlay.className = 'map-transition-overlay';
        this.overlay.style.position = 'absolute';
        this.overlay.style.top = '0';
        this.overlay.style.left = '0';
        this.overlay.style.width = '100%';
        this.overlay.style.height = '100%';
        this.overlay.style.backgroundColor = 'black';
        this.overlay.style.opacity = '0';
        this.overlay.style.pointerEvents = 'none';
        this.overlay.style.transition = 'opacity 0.5s ease-in-out';
        this.overlay.style.zIndex = '10000';
        
        // Add message display
        this.messageElement = document.createElement('div');
        this.messageElement.className = 'transition-message';
        this.messageElement.style.position = 'absolute';
        this.messageElement.style.top = '50%';
        this.messageElement.style.left = '50%';
        this.messageElement.style.transform = 'translate(-50%, -50%)';
        this.messageElement.style.color = 'white';
        this.messageElement.style.fontSize = '24px';
        this.messageElement.style.fontFamily = 'sans-serif';
        this.messageElement.style.textAlign = 'center';
        this.messageElement.style.opacity = '0';
        this.messageElement.style.transition = 'opacity 0.3s ease-in-out';
        this.overlay.appendChild(this.messageElement);
        
        // Append to DOM when container is available
        if (containerManager.element) {
            containerManager.element.appendChild(this.overlay);
        }
    }
    
    /**
     * Begin a map transition
     * @param {Object} config - Transition configuration
     * @param {string} config.targetMap - ID of the target map to load
     * @param {string} [config.targetSpawnPoint='default'] - Spawn point name in the target map
     * @param {number} [config.duration=1000] - Transition duration in milliseconds
     * @param {Object} [config.myte=null] - The myte initiating the transition
     * @param {Object} [config.sourcePortal=null] - The portal that initiated the transition
     * @param {Function} [config.onComplete=null] - Callback after transition completes
     * @param {string} [config.message=''] - Message to show during transition
     * @param {boolean} [config.preserveCamera=true] - Whether to preserve camera position
     */
    startTransition(config) {
        if (this.isTransitioning) return false;
        
        // Default configuration
        this.transitionConfig = {
            targetMap: config.targetMap,
            targetSpawnPoint: config.targetSpawnPoint || 'default',
            duration: config.duration || 1000,
            myte: config.myte || this.containerManager.activeMyte,
            sourcePortal: config.sourcePortal || null,
            onComplete: config.onComplete || null,
            message: config.message || '',
            preserveCamera: config.preserveCamera !== undefined ? config.preserveCamera : true
        };
        
        this.isTransitioning = true;
        
        // Save camera position if needed
        if (this.transitionConfig.preserveCamera && this.containerManager.camera) {
            this.savedCameraPosition = {
                x: this.containerManager.camera.posX,
                y: this.containerManager.camera.posY,
                zoom: this.containerManager.camera.zoom
            };
        }
        
        // Freeze all mytes during transition
        this.containerManager.mytes.forEach(myte => {
            myte.pause();
        });
        
        // Show transition message if provided
        if (this.transitionConfig.message) {
            this.showMessage(this.transitionConfig.message);
        }
        
        // Fade in transition overlay
        this.overlay.style.opacity = '1';
        this.overlay.style.pointerEvents = 'auto';
        
        // Begin map loading after fade completes
        setTimeout(() => this.loadTargetMap(), 500);
        
        return true;
    }
    
    // Load the target map
    async loadTargetMap() {
        try {
            // Show loading message
            this.showMessage(`Loading ${this.transitionConfig.targetMap}...`);
            
            // Load the new map
            const success = await this.containerManager.loadMap(this.transitionConfig.targetMap);
            
            if (!success) {
                this.showMessage('Error loading map');
                setTimeout(() => this.finishTransition(false), 1000);
                return;
            }
            
            // Position active myte at target spawn point
            if (this.transitionConfig.myte && this.containerManager.gameMap) {
                const spawnPoint = this.containerManager.gameMap.getSpawnPoint(
                    this.transitionConfig.targetSpawnPoint
                );
                
                this.transitionConfig.myte.setPosition(spawnPoint.x, spawnPoint.y);
            }
            
            // Restore camera position if needed
            if (this.transitionConfig.preserveCamera && 
                this.savedCameraPosition && 
                this.containerManager.camera) {
                this.containerManager.camera.posX = this.savedCameraPosition.x;
                this.containerManager.camera.posY = this.savedCameraPosition.y;
                this.containerManager.camera.zoom = this.savedCameraPosition.zoom;
            }
            
            // Complete the transition
            setTimeout(() => this.finishTransition(true), 500);
            
        } catch (error) {
            console.error('Error during map transition:', error);
            this.showMessage('Error: ' + error.message);
            setTimeout(() => this.finishTransition(false), 1000);
        }
    }
    
    // Finish the transition process
    finishTransition(success) {
        // Fade out overlay
        this.overlay.style.opacity = '0';
        this.overlay.style.pointerEvents = 'none';
        this.hideMessage();
        
        // Resume mytes after transition completes
        setTimeout(() => {
            this.containerManager.mytes.forEach(myte => {
                myte.resume();
            });
            
            // Call completion callback if provided
            if (this.transitionConfig.onComplete) {
                this.transitionConfig.onComplete(success);
            }
            
            this.isTransitioning = false;
            this.transitionConfig = null;
        }, 500);
    }
    
    // Show a message during transition
    showMessage(message) {
        this.messageElement.textContent = message;
        this.messageElement.style.opacity = '1';
    }
    
    // Hide the transition message
    hideMessage() {
        this.messageElement.style.opacity = '0';
    }
    
    // Clean up resources
    dispose() {
        if (this.overlay && this.overlay.parentNode) {
            this.overlay.parentNode.removeChild(this.overlay);
        }
        
        this.overlay = null;
        this.messageElement = null;
        this.containerManager = null;
    }
}