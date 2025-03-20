class MapTransitionManager {
    constructor(parent) {
        this.parent = parent;
        this.isTransitioning = false;
        this.transitionConfig = null;
        
		// Create transition overlay
		this.overlay = document.createElement('div');
		this.overlay.className = 'map-transition-overlay';

		// Create message display
		this.messageElement = document.createElement('div');
		this.messageElement.className = 'transition-message';

		this.overlay.appendChild(this.messageElement);
        
        // Append to DOM when container is available
        if (parent.element) {
            parent.element.appendChild(this.overlay);
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
            myte: config.myte || this.parent.activeMyte,
            sourcePortal: config.sourcePortal || null,
            onComplete: config.onComplete || null,
            message: config.message || '',
            preserveCamera: config.preserveCamera !== undefined ? config.preserveCamera : true
        };
        
        this.isTransitioning = true;
        
        // Save camera position if needed
        if (this.transitionConfig.preserveCamera && this.parent.camera) {
            this.savedCameraPosition = {
                x: this.parent.camera.posX,
                y: this.parent.camera.posY,
                zoom: this.parent.camera.zoom
            };
        }
        
        // Freeze all mytes during transition
        this.parent.mytes.forEach(myte => {
            myte.pause();
        });
        
        // Show transition message if provided
        if (this.transitionConfig.message) {
            this.showMessage(this.transitionConfig.message);
        }
        
		this.overlay.classList.add('visible');
        
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
            const success = await this.parent.gameMap.loadMap(this.transitionConfig.targetMap);
            
            if (!success) {
                this.showMessage('Error loading map');
                setTimeout(() => this.finishTransition(false), 1000);
                return;
            }
            
            // Position active myte at target spawn point
            if (this.transitionConfig.myte && this.parent.gameMap) {
                const spawnPoint = this.parent.gameMap.getSpawnPoint(
                    this.transitionConfig.targetSpawnPoint
                );
                
                // this.transitionConfig.myte.setPosition(spawnPoint.x, spawnPoint.y);
            }
            
            // Restore camera position if needed
            if (this.transitionConfig.preserveCamera && 
                this.savedCameraPosition && 
                this.parent.camera) {
                this.parent.camera.posX = this.savedCameraPosition.x;
                this.parent.camera.posY = this.savedCameraPosition.y;
                this.parent.camera.zoom = this.savedCameraPosition.zoom;
            }
            
            // Complete the transition
            setTimeout(() => this.finishTransition(true), 500);
            
        } catch (error) {
            this.showMessage('Error: ' + error.message);
            setTimeout(() => this.finishTransition(false), 1000);
        }
    }
    
    // Finish the transition process
    finishTransition(success) {
        // Fade out overlay
        this.overlay.classList.remove('visible');
        this.hideMessage();
        
        // Resume mytes after transition completes
        setTimeout(() => {
            this.parent.mytes.forEach(myte => {
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
        this.messageElement.classList.add('visible');
    }
    
    // Hide the transition message
    hideMessage() {
        this.messageElement.classList.remove('visible');
    }
    
    // Clean up resources
    dispose() {
        if (this.overlay && this.overlay.parentNode) {
            this.overlay.parentNode.removeChild(this.overlay);
        }
        
        this.overlay = null;
        this.messageElement = null;
        this.parent = null;
    }
}