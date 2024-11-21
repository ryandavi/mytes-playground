class MyteMovement {
    constructor(myte) {
        this.myte = myte;
        this.position = new Vector2(0, 0);
        this.target = new Vector2(0, 0);
        this.velocity = new Vector2(0, 0);
        
        // Movement properties
        this.speed = 0.5;
        this.gravity = 0.1;
        this.jumpForce = -5;
        this.maxFallSpeed = 10;
        
        // State flags
        this.isJumping = false;
        this.isFalling = false;
        this._isMoving = false;
    }

    update(deltaTime) {
        if (this.myte.isDragging) return;

        switch (this.myte.currentMode) {
            case MOVE_TYPES.FOLLOW:
                this.updateFollowMovement();
                break;
            case MOVE_TYPES.FREEROAM:
                this.updateFreeRoamMovement();
                break;
            case MOVE_TYPES.GRAVITY:
                this.updateGravityMovement();
                break;
        }

        this.updatePosition();
    }

    updateFollowMovement() {
        const mousePos = this.myte.container.getLocalMousePosition();
        const toMouse = new Vector2(mousePos.x, mousePos.y).subtract(this.position);
        const distance = toMouse.magnitude();

        if (distance > this.myte.followRadius.min && distance < this.myte.followRadius.max) {
            this.setTarget(mousePos.x, mousePos.y);
        }
    }

    updateFreeRoamMovement() {
        if (!this.myte.queue.isEmpty()) {
            this.myte.queue.update();  // Changed from doCurrentAction to update
        } else {
            this.myte.ai.decideFreeRoamAction();
        }
    }

    updateGravityMovement() {
        if (!this.isJumping && !this.isFalling) {
            this.velocity.y += this.gravity;
            this.isFalling = true;
        }

        // Limit fall speed
        this.velocity.y = Math.min(this.velocity.y, this.maxFallSpeed);
        
        // Update position
        this.position.y += this.velocity.y;
        
        // Check ground collision
        const groundY = this.myte.container.getCanvasRect().height - this.myte.height;
        if (this.position.y >= groundY) {
            this.position.y = groundY;
            this.velocity.y = 0;
            this.isFalling = false;
            this.isJumping = false;
        }
    }


    setPosition(x, y) {
        if (x instanceof Vector2) {
            this.position = x.clone();
        } else {
            this.position = new Vector2(x, y);
        }
    }

    setTarget(x, y) {
        if (x instanceof Vector2) {
            this.target = x.clone();
        } else {
            this.target = new Vector2(x, y);
        }
    }

    updatePosition() {
        const distance = this.position.distanceTo(this.target);
        if (distance > this.speed) {
            // Ensure we're working with Vector2 instances
            const direction = new Vector2(
                this.target.x - this.position.x,
                this.target.y - this.position.y
            ).normalize();
            
            const movement = direction.multiply(this.speed);
            this.position = this.position.add(movement);
            this._isMoving = true;
        } else {
            this.position = new Vector2(this.target.x, this.target.y);
            this._isMoving = false;
        }

        this.myte.updateSpritePosition();
    }

    getDistanceToTarget() {
        return this.position.distanceTo(this.target);
    }

    getDistanceFromMouse() {
        const mousePos = this.myte.container.getLocalMousePosition();
        return this.position.distanceTo(new Vector2(mousePos.x, mousePos.y));
    }

    jump() {
        if (!this.isJumping && !this.isFalling) {
            this.velocity.y = this.jumpForce;
            this.isJumping = true;
            this.isFalling = false;
        }
    }

    reset() {
        this.velocity = new Vector2();
        this.isJumping = false;
        this.isFalling = false;
        this._isMoving = false;
    }

    isAtTarget() {
        return this.getDistanceToTarget() < 0.5;
    }

    isMoving() {
        return this._isMoving || this.isJumping || this.isFalling;
    }
}