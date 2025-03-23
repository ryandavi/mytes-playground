class FenceMapObject extends MapObject {
    constructor(parent, type, variant, posX, posY, config = {}, options = {}) {
        // Process the direction before calling super
        const direction = options.direction || 'E'; // Default to East (horizontal)
        
        // Apply direction-specific configuration
        const processedConfig = MapObject.processDirectionConfig(config, direction);
        
        super(parent, type, variant, posX, posY, processedConfig, options);
        
        // Fence-specific properties
        this.facingDirection = processedConfig.facingDirection || direction;
        this.connectedFences = new Set(); // Track connected fences
        
        // Auto-connection to nearby fences when placed
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
            (obj.type === 'FENCE' || obj.type === 'GATE') &&
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
                
                // Add this fence to the other fence's connections (if it has the method)
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
    
    // Override render to apply direction-specific styles
    render(container, parent) {
        const element = super.render(container, parent);
        
        // Add fence-specific classes
        element.classList.add('fence');
        element.classList.add(`facing-${this.facingDirection.toLowerCase()}`);
        
        // Get the sprite element
        const spriteElement = element.querySelector('.sprite');
        
        // Apply transformations based on direction config
        if (spriteElement) {
            const transformStyle = this.getConfig('transformStyle', '');
            if (transformStyle) {
                spriteElement.style.transform = transformStyle;
            }
        }
        
        // Add visual indication of connections if in debug mode
        if (this.getConfig('debug', false) && this.connectedFences.size > 0) {
            const connectionsElement = document.createElement('div');
            connectionsElement.classList.add('fence-connections', 'debug-visible');
            connectionsElement.textContent = `${this.connectedFences.size} connections`;
            element.appendChild(connectionsElement);
        }
        
        return element;
    }
    
    // Override remove to handle connected fences
    remove() {
        // Remove this fence from all connected fences
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