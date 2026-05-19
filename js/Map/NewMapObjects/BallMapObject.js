class BallMapObject extends AnimatedMapObject {
    constructor(parent, type, variant, posX, posY, config = {}, options = {}) {
        // Ensure we have proper configuration for animation

        // Call parent constructor
        super(parent, type, variant, posX, posY, config, options);

        // Physics properties
        this.velocity = { x: 0, y: 0 };
        this.friction = this.getConfig('friction', 0.95);
        this.maxSpeed = this.getConfig('speed', 3);
        this.isMoving = false;

        // Interaction properties
        this.pushForce = this.getConfig('pushForce', 5);
        this.lastPushTime = 0;
        this.pushCooldown = options.pushCooldown || 1500; // ms

        this.debug = this.getConfig('debug', false);

        // Safe defaults — overwritten by setupBoundaries() once render() has a parent
        this.bounds = { left: 0, top: 0, right: 500, bottom: 500 };
    }

    shouldSimulateOffScreen() { return true; }

    // Override to only allow dragging when not in motion
    canBeDragged() {
        if (this.isMoving) return false;
        return super.canBeDragged();
    }

    // Get the center of the collider
    getColliderCenter() {
        return {
            x: this.posX + this.collider.offsetX,
            y: this.posY + this.collider.offsetY
        };
    }

    // Get the center of a myte's collider
    getMyteColliderCenter(myte) {
        return {
            x: myte.posX + (myte.collider?.offsetX || myte.size.width / 2),
            y: myte.posY + (myte.collider?.offsetY || myte.size.height / 2)
        };
    }

    reactToNearbyCreature(myte) {
        if (this.isDragging) return;

        const now = performance.now();
        if (now - this.lastPushTime < this.pushCooldown) return;

        // Only react to moving mytes
        if (!myte.is_moving()) return;

        // Check if myte collides with ball
        const collides = this.gameMap?.checkCollision
            ? this.gameMap.checkCollision(myte, this)
            : myte.parent?.checkCollision?.(myte, this);

        if (collides) {
            // Calculate push direction and force
            const ballCenter = this.getColliderCenter();
            const myteCenter = this.getMyteColliderCenter(myte);
    
            // Calculate distance between centers
            const dx = ballCenter.x - myteCenter.x;
            const dy = ballCenter.y - myteCenter.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (!Number.isFinite(distance) || distance <= 0.0001) {
                return;
            }

            // Calculate push vector
            const pushX = (dx / distance) * this.pushForce;
            const pushY = (dy / distance) * this.pushForce;

            // Apply push force as velocity
            this.velocity.x += pushX;
            this.velocity.y += pushY;

            // Cap velocity at maxSpeed
            this.capVelocity();

            // Update animation based on movement
            this.updateBallAnimation();

            // Mark as moving and update last push time
            this.isMoving = true;
            this.lastPushTime = now;

            // Make the creature react
            myte.queue.addExpression('happy');
            
            if (this.debug) {
                console.log(`Ball pushed! Velocity X: ${this.velocity.x.toFixed(2)}, Y: ${this.velocity.y.toFixed(2)}`);
            }
        }
    }
    
    // Cap velocity at maximum speed
    capVelocity() {
        const speed = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.y * this.velocity.y);
        if (!Number.isFinite(speed)) {
            this.velocity.x = 0;
            this.velocity.y = 0;
            this.isMoving = false;
            this.pauseAnimation();
            return;
        }

        if (speed > this.maxSpeed) {
            this.velocity.x = (this.velocity.x / speed) * this.maxSpeed;
            this.velocity.y = (this.velocity.y / speed) * this.maxSpeed;
        }
    }
    
    // Update animation based on movement direction
    updateBallAnimation() {
        // Skip if not moving significantly
        if (Math.abs(this.velocity.x) < 0.1 && Math.abs(this.velocity.y) < 0.1) {
            return;
        }
        
        // Resume animation if paused
        if (this.animation && this.animation.paused) {
            this.animation.paused = false;
        }
        
        // Determine primary direction of movement
        const absX = Math.abs(this.velocity.x);
        const absY = Math.abs(this.velocity.y);
        
        // Choose animation based on direction
        let animName;
        if (absX > absY) {
            // Moving right (positive X) = rotateZ_reverse
            // Moving left (negative X) = rotateY
            animName = this.velocity.x > 0 ? 'rotateZ_reverse' : 'rotateY';
        } else {
            // Moving down (positive Y) = rotateX
            // Moving up (negative Y) = rotateX_reverse
            animName = this.velocity.y > 0 ? 'rotateX' : 'rotateX_reverse';
        }
        
        this.playAnimation(animName);
        
        if (this.debug) {
            console.log(`Playing ${absX > absY ? 'horizontal' : 'vertical'} animation: ${animName}`);
        }
    }

    updatePhysics() {
        if (!this.isMoving) return;

        this.posX += this.velocity.x;
        this.posY += this.velocity.y;
        this.checkBoundaries();

        this.velocity.x *= this.friction;
        this.velocity.y *= this.friction;

        if (Math.abs(this.velocity.x) > 0.1 || Math.abs(this.velocity.y) > 0.1) {
            this.updateBallAnimation();
        } else if (Math.abs(this.velocity.x) < 0.3 && Math.abs(this.velocity.y) < 0.3) {
            this.velocity.x = 0;
            this.velocity.y = 0;
            this.isMoving = false;
            this.pauseAnimation();
            if (this.debug) console.log("Ball stopped");
        }
        // markPositionDirty() called by base update()
    }
    
    // Check and handle boundary collisions
    checkBoundaries() {
        const bounceMultiplier = 0.8; // Reduce velocity slightly on bounce
        
        // Check and handle horizontal boundaries
        if (this.posX < this.bounds.left) {
            this.posX = this.bounds.left;
            this.velocity.x = Math.abs(this.velocity.x) * bounceMultiplier;
            this.updateBallAnimation();
            if (this.debug) console.log("Bounced left boundary");
        } else if (this.posX + this.size.width > this.bounds.right) {
            this.posX = this.bounds.right - this.size.width;
            this.velocity.x = -Math.abs(this.velocity.x) * bounceMultiplier;
            this.updateBallAnimation();
            if (this.debug) console.log("Bounced right boundary");
        }
        
        // Check and handle vertical boundaries
        if (this.posY < this.bounds.top) {
            this.posY = this.bounds.top;
            this.velocity.y = Math.abs(this.velocity.y) * bounceMultiplier;
            this.updateBallAnimation();
            if (this.debug) console.log("Bounced top boundary");
        } else if (this.posY + this.size.height > this.bounds.bottom) {
            this.posY = this.bounds.bottom - this.size.height;
            this.velocity.y = -Math.abs(this.velocity.y) * bounceMultiplier;
            this.updateBallAnimation();
            if (this.debug) console.log("Bounced bottom boundary");
        }
    }

    // Override the play animation method to handle special cases
    playAnimation(animationName, onComplete) {
        if (this.debug) console.log("Ball playAnimation called with:", animationName);
        
        // If we're playing idle but we already have an animation running,
        // skip it to preserve the last animation frame
        if (animationName === 'idle' && this.animation && this.animation.currentAnimation) {
            if (this.debug) console.log("Skipping idle animation to preserve last frame");
            return;
        }
        
        // Call parent class implementation
        super.playAnimation(animationName, onComplete);
    }

    // Override render method
    render(container, parent) {
        const element = super.render(container, parent);
        element.classList.add('ball-object');
        element.setAttribute('data-moving', this.isMoving);
        
        // Set up boundaries and other parent-dependent configs
        if (parent) {
            this.setupBoundaries(parent);
        }
        
        return element;
    }
    
    // Set up boundaries based on parent container
    setupBoundaries(parent) {
        if (parent && parent.getMaxDimensions) {
            const mapDimensions = parent.getMaxDimensions();
            this.bounds = {
                left: 0,
                top: 0,
                right: mapDimensions.width,
                bottom: mapDimensions.height
            };
            
            if (this.debug) {
                console.log("Ball boundaries set:", this.bounds);
            }
        }
    }

    // tickUpdate: collision detection + physics (no DOM)
    tickUpdate(tickDelta) {
        super.tickUpdate(tickDelta);

        if (this.mytes.length) {
            for (const myte of this.mytes) {
                if (myte.isActive) this.reactToNearbyCreature(myte);
            }
        }

        this.updatePhysics();
    }

    // update: animation + dirty marking
    update(deltaTime) {
        super.update(deltaTime);
        if (this.element) {
            this.element.setAttribute('data-moving', String(this.isMoving));
        }
    }
}
