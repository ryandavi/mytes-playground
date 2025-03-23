class GateMapObject extends AnimatedMapObject {
    constructor(parent, type, variant, posX, posY, config = {}, options = {}) {
        // Process the direction before calling super
        const direction = options.direction || 'E'; // Default to East (horizontal)
        
        // Apply direction-specific configuration
        const processedConfig = MapObject.processDirectionConfig(config, direction);
        
        super(parent, type, variant, posX, posY, processedConfig, options);
        
        // Gate-specific state
        this.isOpen = false;
        this.isAnimating = false;
        this.facingDirection = processedConfig.facingDirection || direction;
        this.connectedFences = new Set(); // Track connected fences
        
        // Initialize collision state based on gate being closed by default
        this.updateCollisionState();
        
        // Auto-connect to nearby fences if configured
        if (this.getConfig('autoConnect', true)) {
            this.connectToNearbyFences();
        }
    }
    
    // Auto-connect to other fences nearby when placed
    connectToNearbyFences() {
        if (!this.parent?.gameMap?.objects) return;
        
        const searchRadius = this.getConfig('connectionRadius', 40);
        const fences = this.parent.gameMap.objects.filter(obj => 
            obj !== this && 
            obj.type === 'FENCE' &&
            obj.active
        );
        
        // Check nearby fences
        fences.forEach(fence => {
            // Calculate center points
            const myCenter = {
                x: this.posX + this.size.width / 2,
                y: this.posY + this.size.height / 2
            };
            
            const fenceCenter = {
                x: fence.posX + fence.size.width / 2,
                y: fence.posY + fence.size.height / 2
            };
            
            // Calculate distance between centers
            const dx = myCenter.x - fenceCenter.x;
            const dy = myCenter.y - fenceCenter.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // If within connection range, add to connected fences
            if (distance <= searchRadius) {
                this.connectedFences.add(fence.id);
                
                // Add this gate to the fence's connections (if it has the method)
                if (fence.addConnectedFence) {
                    fence.addConnectedFence(this.id);
                }
            }
        });
    }
    
    // Add a connected fence
    addConnectedFence(fenceId) {
        this.connectedFences.add(fenceId);
    }
    
    // Remove a connected fence
    removeConnectedFence(fenceId) {
        this.connectedFences.delete(fenceId);
    }
    
    // Override interaction handling
    press(myte) {
        if (this.isAnimating) return false;

        console.log(`Interacted with gate facing ${this.facingDirection}`);
        
        // Toggle gate state
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
        
        // Call parent interact for basic interaction tracking
        super.interact(myte);
        
        return true;
    }
    
    // Gate-specific methods
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
            
            // Play sound effect if configured
            if (this.getConfig('soundEffects.open')) {
                this.playSound('open');
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
            
            // Play sound effect if configured
            if (this.getConfig('soundEffects.close')) {
                this.playSound('close');
            }
        });
    }
    
    // Play sound effect
    playSound(type) {
        const soundEffect = this.getConfig(`soundEffects.${type}`);
        if (soundEffect && this.parent?.parent?.soundManager) {
            this.parent.parent.soundManager.play(soundEffect);
        }
    }
    
    // Update collision state based on gate open/closed state
    updateCollisionState() {
        this.config.walkable = this.isOpen;
        this.config.collision = !this.isOpen;
        
        // If the gate is part of a grid system, update its cells
        if (this.parent?.gameMap?.gridSystem) {
            // Remove from grid to update walkable status
            this.parent.gameMap.gridSystem.removeObject(this);
            // Add back to grid with new walkable status
            this.parent.gameMap.gridSystem.addObject(this);
        }
        
        // Update visual state
        if (this.element) {
            if (this.isOpen) {
                this.element.classList.add('open');
                this.element.classList.remove('closed');
            } else {
                this.element.classList.add('closed');
                this.element.classList.remove('open');
            }
        }
    }
    
    // Override render to handle direction
    render(container, parent) {
        const element = super.render(container, parent);
        
        // Add gate-specific classes
        element.classList.add('gate');
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
    
    // Override remove to handle connected fences
    remove() {
        // Remove this gate from all connected fences
        if (this.parent?.gameMap?.objects) {
            this.connectedFences.forEach(fenceId => {
                const fence = this.parent.gameMap.objects.find(obj => obj.id === fenceId);
                if (fence && fence.removeConnectedFence) {
                    fence.removeConnectedFence(this.id);
                }
            });
        }
        
        // Call parent remove method
        super.remove();
    }
}