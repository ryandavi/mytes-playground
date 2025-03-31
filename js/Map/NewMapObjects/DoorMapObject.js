// Enhanced DoorMapObject class with pathfinding integration

class DoorMapObject extends AnimatedMapObject {
    constructor(parent, type, variant, posX, posY, config = {}, options = {}) {
        // Process the direction before calling super
        const direction = options.direction || 'E';
        
        // Apply direction-specific configuration using the static method
        const processedConfig = MapObject.processDirectionConfig(config, direction);

        console.log("DIRECTION", direction);
        
        super(parent, type, variant, posX, posY, processedConfig, options);
        
        // Door-specific state
        this.isOpen = false;
        this.isAnimating = false;
        this.facingDirection = processedConfig.facingDirection || direction;
        this.teleportTarget = options.teleportTarget || null;
        
        // Define terrain type for pathfinding
        this.terrainType = 'door_closed';
        
        // Initialize collision state based on door being closed by default
        this.updateCollisionState();
    }
    
    // Override interaction handling
    press(myte) {
        if (this.isAnimating) return false;

        console.log(`Interacted with door facing ${this.facingDirection}`);
        
        // Toggle door state
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
        
        // Call parent interact for basic interaction tracking
        super.press(myte);
        
        return true;
    }
    
// No need to replace the entire class, just these specific methods

// Enhanced open method with improved pathfinding updates
open() {
    if (this.isOpen || this.isAnimating) return;
    
    this.isAnimating = true;
    
    // Play opening animation
    this.playAnimation('opening', () => {
        this.isOpen = true;
        this.isAnimating = false;
        
        // Update terrain type for pathfinding
        this.terrainType = 'door_open';
        
        // Update grid terrain type
        this.updateGridTerrain();
        
        // Update collision after animation completes
        this.updateCollisionState();
        
        // Switch to open state animation if it exists
        if (this.hasAnimation('open')) {
            this.playAnimation('open');
        }
        
        // Emit an event that pathfinding-related systems can listen for
        if (this.parent && this.parent.eventManager) {
            this.parent.eventManager.emit('door_state_changed', {
                door: this,
                state: 'open',
                position: { x: this.posX, y: this.posY }
            });
        }
    });
}

// Enhanced close method with improved pathfinding updates
close() {
    if (!this.isOpen || this.isAnimating) return;
    
    this.isAnimating = true;
    
    // Play closing animation
    this.playAnimation('closing', () => {
        this.isOpen = false;
        this.isAnimating = false;
        
        // Update terrain type for pathfinding
        this.terrainType = 'door_closed';
        
        // Update grid terrain type
        this.updateGridTerrain();
        
        // Update collision after animation completes
        this.updateCollisionState();
        
        // Switch to closed state animation if it exists
        if (this.hasAnimation('closed')) {
            this.playAnimation('closed');
        }
        
        // Emit an event that pathfinding-related systems can listen for
        if (this.parent && this.parent.eventManager) {
            this.parent.eventManager.emit('door_state_changed', {
                door: this,
                state: 'closed',
                position: { x: this.posX, y: this.posY }
            });
        }
    });
}

// Add a new method to update grid terrain
updateGridTerrain() {
    // Ensure we have access to grid system
    if (this.parent?.gameMap?.gridSystem) {
        const gridSystem = this.parent.gameMap.gridSystem;
        const gridPos = gridSystem.worldToGrid(this.posX, this.posY);
        
        // Update terrain type in the grid cell
        gridSystem.updateCellTerrain(gridPos.x, gridPos.y, this.terrainType);
        
        // If door is larger than one cell, update adjacent cells too
        if (this.collider && (this.collider.width > gridSystem.config.cellSize || 
            this.collider.height > gridSystem.config.cellSize)) {
            
            const endPos = gridSystem.worldToGrid(
                this.posX + this.collider.width, 
                this.posY + this.collider.height
            );
            
            // Update all cells the door covers
            for (let x = gridPos.x; x <= endPos.x; x++) {
                for (let y = gridPos.y; y <= endPos.y; y++) {
                    gridSystem.updateCellTerrain(x, y, this.terrainType);
                }
            }
        }
        
        // Force grid system to update pathfinding visualization if in debug mode
        if (gridSystem.pathfinder && gridSystem.pathfinder.options.debug) {
            // Refresh diagnostic visualization
            if (this.parent.gameMap.testPathfinding) {
                setTimeout(() => {
                    this.parent.gameMap.testPathfinding();
                }, 50); // Small delay to ensure terrain update is applied
            }
        }
    }
}

// Enhanced updateCollisionState method with pathfinding integration
updateCollisionState() {
    this.config.walkable = this.isOpen;
    this.config.collision = !this.isOpen;
    
    // Update grid terrain before updating object
    this.updateGridTerrain();
    
    // If the door is part of a grid system, update its cells
    if (this.parent?.gameMap?.gridSystem) {
        // Remove from grid to update walkable status
        this.parent.gameMap.gridSystem.removeObject(this);
        // Add back to grid with new walkable status
        this.parent.gameMap.gridSystem.addObject(this);
    }
}
    
    // Enhanced teleport method with pathfinding context
    teleportMyte(myte) {
        if (!this.teleportTarget || !this.isOpen) return;
        
        // Store pathfinding capabilities before teleport
        const entityCapabilities = {
            can_open_doors: myte.canOpenDoors || false,
            can_swim: myte.canSwim || false,
            follows_paths: myte.followsPaths !== false
        };
        
        // Check if teleport target is valid
        if (typeof this.teleportTarget === 'string') {
            // Transition to the target map
            this.parent.transitionToMap(this.teleportTarget);
        } else if (typeof this.teleportTarget === 'object' && this.teleportTarget.x && this.teleportTarget.y) {
            // Teleport within the same map
            myte.setPosition(this.teleportTarget.x, this.teleportTarget.y);
            myte.queue.addExpression('teleport');
            
            // Reset path if entity has AI pathfinding
            if (myte.ai && typeof myte.ai.resetPath === 'function') {
                // Reset AI path with the same capabilities
                setTimeout(() => {
                    myte.ai.resetPath(entityCapabilities);
                }, 100); // Small delay to allow teleport to complete
            }
        }
    }
    
    // Enhanced check for mytes trying to walk through the door
    checkMytePassThrough(myte) {
        if (!this.isOpen) return;
        
        // Check if myte is close enough to the door
        const dx = myte.posX - (this.posX + this.collider.offsetX);
        const dy = myte.posY - (this.posY + this.collider.offsetY);
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < 50) { // Proximity threshold
            this.teleportMyte(myte);
        }
    }
    
    // Override render to handle direction
    render(container, parent) {
        const element = super.render(container, parent);
        
        // Add door-specific classes
        element.classList.add('door');
        element.classList.add(`facing-${this.facingDirection.toLowerCase()}`);
        element.classList.add(this.isOpen ? 'open' : 'closed');
        
        // Get the sprite element
        const spriteElement = element.querySelector('.sprite');
        
        // Apply transformations based on direction config
        if (spriteElement) {
            const transformStyle = this.getConfig('transformStyle', '');
            if (transformStyle) {
                spriteElement.style.transform = transformStyle;
            }
        }
        
        // Add interactive collision zone visualization if in debug mode
        if (this.getConfig('debug', false) && this.getConfig('interactiveCollider')) {
            const interactiveCollider = this.getConfig('interactiveCollider');
            const interactiveZone = document.createElement('div');
            interactiveZone.classList.add('interactive-zone', 'debug-visible');
            
            interactiveZone.style.width = `${interactiveCollider.width}px`;
            interactiveZone.style.height = `${interactiveCollider.height}px`;
            interactiveZone.style.left = `${interactiveCollider.offsetX}px`;
            interactiveZone.style.top = `${interactiveCollider.offsetY}px`;
            
            element.appendChild(interactiveZone);
        }
        
        return element;
    }
    
    // Override update to check for mytes passing through
    update(deltaTime) {
        super.update(deltaTime);
        
        // Check if any mytes are passing through the door
        if (this.isOpen && this.teleportTarget && this.parent && this.parent.mytes) {
            this.parent.mytes.forEach(myte => {
                if (myte.isActive) {
                    this.checkMytePassThrough(myte);
                }
            });
        }
    }
}