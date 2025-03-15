
class DoorMapObject extends AnimatedMapObject {
    constructor(type, variant, posX, posY, config = {}, options = {}) {
        super(type, variant, posX, posY, config, options);
        
        // Door-specific state
        this.isOpen = false;
        this.isAnimating = false;
        this.facingDirection = options.direction || 'right'; // default direction
        this.teleportTarget = options.teleportTarget || null; // optional map to teleport to
        
        // Initialize collision state based on door being closed by default
        this.updateCollisionState();
    }
    
    // Override interaction handling
    press(myte) {
        if (this.isAnimating) return false;

		console.log("Interacted with door");
        
        // Toggle door state
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
        
        // Call parent interact for basic interaction tracking
        super.interact(myte);
        
        return true;
    }
    
    // Door-specific methods
    open() {
        if (this.isOpen || this.isAnimating) return;
        
        this.isAnimating = true;
        
        // Play opening animation
        this.playAnimation('opening', () => {
            this.isOpen = true;
            this.isAnimating = false;
            
            // Update collision after animation completes
            this.updateCollisionState();
            
            // Switch to open state animation if it exists
            if (this.hasAnimation('open')) {
                this.playAnimation('open');
            }
        });
    }
    
    close() {
        if (!this.isOpen || this.isAnimating) return;
        
        this.isAnimating = true;
        
        // Play closing animation
        this.playAnimation('closing', () => {
            this.isOpen = false;
            this.isAnimating = false;
            
            // Update collision after animation completes
            this.updateCollisionState();
            
            // Switch to closed state animation if it exists
            if (this.hasAnimation('closed')) {
                this.playAnimation('closed');
            }
        });
    }
    
    // Update collision state based on door open/closed state
    updateCollisionState() {
        this.config.walkable = this.isOpen;
        this.config.collision = !this.isOpen;
        
        // If the door is part of a grid system, update its cells
        if (this.parent?.gameMap?.gridSystem) {
            // Remove from grid to update walkable status
            this.parent.gameMap.gridSystem.removeObject(this);
            // Add back to grid with new walkable status
            this.parent.gameMap.gridSystem.addObject(this);
        }
    }
    
    // Teleport a myte if this door has a teleport target
    teleportMyte(myte) {
        if (!this.teleportTarget || !this.isOpen) return;
        
        // Check if teleport target is valid
        if (typeof this.teleportTarget === 'string') {
            // Transition to the target map
            this.parent.transitionToMap(this.teleportTarget);
        } else if (typeof this.teleportTarget === 'object' && this.teleportTarget.x && this.teleportTarget.y) {
            // Teleport within the same map
            myte.setPosition(this.teleportTarget.x, this.teleportTarget.y);
            myte.queue.addExpression('teleport');
        }
    }
    
    // Check if a myte is trying to walk through the door
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
        
        // Add door-specific class
        element.classList.add('door', `facing-${this.facingDirection}`);
        
        // Set appropriate transform based on facing direction
        if (this.facingDirection === 'left') {
            element.querySelector('.sprite').style.transform = 'scaleX(-1)';
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