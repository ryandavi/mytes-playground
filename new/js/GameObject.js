class GameEntity {
    constructor(x, y, width, height, options = {}) {
        // Position
        this.posX = x;
        this.posY = y;

        // Size
        this.size = {
            width: width,
            height: height
        };

        // Active state
        this.active = true;

        // Visual element references
        this.element = null;
        this.sprite = null;

        // Movement and collision
        this.direction = options.direction || DIRECTION.SOUTH;
        this.checkForCollisions = options.checkForCollisions !== undefined ? options.checkForCollisions : true;
        this.isWalkable = options.isWalkable !== undefined ? options.isWalkable : true;
        this.speed = options.speed || 0.5;

        // Interaction properties
        this.interactionRadius = options.interactionRadius || 100;
        this.interactionType = options.interactionType || null;
        this.lastInteractionTime = 0;
        this.interactionCooldown = options.interactionCooldown || 5000;

        // Reference to parent container/manager
        this.parent = options.parent || null;
    }

    // Position methods
    setPosition(x = null, y = null, limit = false) {
        if (x !== null) this.posX = x;
        if (y !== null) this.posY = y;

        if (limit) {
            this.limitPositionToContainer();
        }

        this.updateSpritePosition();
    }

    limitPositionToContainer() {
        if (!this.parent) return;

        const maxDimensions = this.parent.getMaxDimensions();
        this.posX = Math.max(0, Math.min(this.posX, maxDimensions.width - this.size.width));
        this.posY = Math.max(0, Math.min(this.posY, maxDimensions.height - this.size.height));
    }

    updateSpritePosition() {
        if (this.element) {
            this.element.style.left = `${this.posX}px`;
            this.element.style.top = `${this.posY}px`;
            this.updateZIndex();
        }
    }

    // Z-Index handling
    updateZIndex() {
        if (this.element && this.parent) {
            this.element.style.zIndex = this.parent.getZIndex(this.posY, this.size.height);
        }
    }

    // Collision detection
    getRect() {
        return {
            left: this.posX,
            top: this.posY,
            right: this.posX + this.size.width,
            bottom: this.posY + this.size.height,
            width: this.size.width,
            height: this.size.height
        };
    }

    intersects(other) {
        const rect1 = this.getRect();
        const rect2 = other.getRect();

        return !(rect1.right < rect2.left || 
                rect1.left > rect2.right || 
                rect1.bottom < rect2.top || 
                rect1.top > rect2.bottom);
    }

    // Distance calculations
    getDistanceTo(entity) {
        const dx = this.posX - entity.posX;
        const dy = this.posY - entity.posY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    isInInteractionRange(entity) {
        return this.getDistanceTo(entity) <= this.interactionRadius;
    }

    // Interaction methods
    canInteract() {
        return Date.now() - this.lastInteractionTime >= this.interactionCooldown;
    }

    startInteraction() {
        this.lastInteractionTime = Date.now();
    }

    // State methods
    deactivate() {
        this.active = false;
        if (this.element) {
            this.element.classList.add('deactivated');
        }
    }

    activate() {
        this.active = true;
        if (this.element) {
            this.element.classList.remove('deactivated');
        }
    }

    // Cleanup
    destroy() {
        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
        this.active = false;
        this.element = null;
        this.sprite = null;
    }

    // Update method to be overridden by child classes
    update(deltaTime) {
        // Base update logic
        if (!this.active) return;
        
        this.updateSpritePosition();
    }
}