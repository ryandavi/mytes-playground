class BallMapObject extends AnimatedMapObject {
    constructor(parent, type, variant, posX, posY, config = {}, options = {}) {
        // Ensure we have proper configuration for animation

        // Call parent constructor
        super(parent, type, variant, posX, posY, config, options);

        // Physics properties
        this.velocity = { x: 0, y: 0 };
        this.friction = this.getConfig('friction', 0.94);
        this.settleFriction = this.getConfig('settleFriction', 0.82);
        this.maxSpeed = this.getConfig('speed', 5);
        this.stopThreshold = this.getConfig('stopThreshold', 0.18);
        this.settleThreshold = this.getConfig('settleThreshold', 1.2);
        this.minAnimationSpeed = this.getConfig('minAnimationSpeed', 0.2);
        this.minAnimationFrameDelay = this.getConfig('minAnimationFrameDelay', 45);
        this.maxAnimationFrameDelay = this.getConfig('maxAnimationFrameDelay', 120);
        this.isMoving = false;

        // Interaction properties
        this.pushForce = this.getConfig('pushForce', 6);
        this.lastPushTime = 0;
        this.pushCooldown = options.pushCooldown || 1500; // ms

        this.debug = this.getConfig('debug', false);

        // Pickup state
        this.isPickedUp = false;
        this.carrier = null;
        this.pendingPickup = false;

        // Safe defaults — overwritten by setupBoundaries() once render() has a parent
        this.bounds = { left: 0, top: 0, right: 500, bottom: 500 };
    }

    shouldSimulateOffScreen() { return true; }

    // Override to only allow dragging when not in motion and not being carried
    canBeDragged() {
        if (this.isMoving || this.isPickedUp) return false;
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

    pickup(myte) {
        this.isPickedUp = true;
        this.carrier = myte;
        this.stopMotion();
    }

    drop(vx = 0, vy = 0) {
        this.isPickedUp = false;
        this.carrier = null;
        if (vx !== 0 || vy !== 0) {
            this.velocity.x = vx;
            this.velocity.y = vy;
            this.isMoving = true;
            this.updateBallAnimation();
        }
    }

    reactToNearbyCreature(myte) {
        if (this.isDragging || this.isPickedUp || this.pendingPickup) return;

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
            if (this.element) {
                this.element.setAttribute('data-moving', 'true');
            }
            this.lastPushTime = now;

            this.gameMap?.soundManager?.play('ball_hit');

            // Make the creature react
            myte.queue.addExpression('happy');
            
            if (this.debug) {
                console.log(`Ball pushed! Velocity X: ${this.velocity.x.toFixed(2)}, Y: ${this.velocity.y.toFixed(2)}`);
            }
        }
    }
    
    // Cap velocity at maximum speed
    capVelocity() {
        const speed = this.getSpeed();
        if (!Number.isFinite(speed)) {
            this.stopMotion();
            return;
        }

        if (speed > this.maxSpeed) {
            this.velocity.x = (this.velocity.x / speed) * this.maxSpeed;
            this.velocity.y = (this.velocity.y / speed) * this.maxSpeed;
        }
    }
    
    // Update animation based on movement direction
    updateBallAnimation() {
        const speed = this.getSpeed();

        // Skip if not moving significantly
        if (speed < this.minAnimationSpeed) {
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
        
        this.syncAnimationSpeed(speed);
        this.playAnimation(animName);
        
        if (this.debug) {
            console.log(`Playing ${absX > absY ? 'horizontal' : 'vertical'} animation: ${animName}`);
        }
    }

    updatePhysics() {
        if (!this.isMoving) return;

        const prevX = this.posX;
        const prevY = this.posY;

        this.posX += this.velocity.x;
        this.posY += this.velocity.y;

        this.checkWallCollision(prevX, prevY);
        this.checkBoundaries();

        const speedBeforeFriction = this.getSpeed();
        const friction = speedBeforeFriction <= this.settleThreshold
            ? this.settleFriction
            : this.friction;

        this.velocity.x *= friction;
        this.velocity.y *= friction;

        const speed = this.getSpeed();

        if (speed >= this.minAnimationSpeed) {
            this.updateBallAnimation();
        } else if (speed <= this.stopThreshold) {
            this.stopMotion();
        }
        // markPositionDirty() called by base update()
    }

    // Check collisions with non-walkable grid cells (interior walls)
    checkWallCollision(prevX, prevY) {
        const gs = this.gameMap?.gridSystem;
        if (!gs?.grid) return;

        const bounceMultiplier = 0.65;
        let bouncedX = false;
        let bouncedY = false;

        // Check X axis: test new X with old Y
        if (!this._isBallPositionWalkable(this.posX, prevY, gs)) {
            this.posX = prevX;
            this.velocity.x *= -bounceMultiplier;
            bouncedX = true;
        }

        // Check Y axis: test new Y with (possibly reverted) X
        if (!this._isBallPositionWalkable(this.posX, this.posY, gs)) {
            this.posY = prevY;
            this.velocity.y *= -bounceMultiplier;
            bouncedY = true;
        }

        if (bouncedX || bouncedY) {
            this.gameMap?.soundManager?.play('ball_hit');
            this.updateBallAnimation();
        }
    }

    _isBallPositionWalkable(px, py, gs) {
        const margin = 6;
        const cx = px + this.size.width / 2;
        const cy = py + this.size.height / 2;

        const points = [
            [px + margin, cy],
            [px + this.size.width - margin, cy],
            [cx, py + margin],
            [cx, py + this.size.height - margin],
        ];

        for (const [wx, wy] of points) {
            const gp = gs.worldToGrid(wx, wy);
            const cell = gs.grid[gp.x]?.[gp.y];
            if (cell && !cell.walkable) return false;
        }
        return true;
    }
    
    // Check and handle boundary collisions
    checkBoundaries() {
        const bounceMultiplier = 0.8;
        let bounced = false;

        if (this.posX < this.bounds.left) {
            this.posX = this.bounds.left;
            this.velocity.x = Math.abs(this.velocity.x) * bounceMultiplier;
            bounced = true;
            if (this.debug) console.log("Bounced left boundary");
        } else if (this.posX + this.size.width > this.bounds.right) {
            this.posX = this.bounds.right - this.size.width;
            this.velocity.x = -Math.abs(this.velocity.x) * bounceMultiplier;
            bounced = true;
            if (this.debug) console.log("Bounced right boundary");
        }

        if (this.posY < this.bounds.top) {
            this.posY = this.bounds.top;
            this.velocity.y = Math.abs(this.velocity.y) * bounceMultiplier;
            bounced = true;
            if (this.debug) console.log("Bounced top boundary");
        } else if (this.posY + this.size.height > this.bounds.bottom) {
            this.posY = this.bounds.bottom - this.size.height;
            this.velocity.y = -Math.abs(this.velocity.y) * bounceMultiplier;
            bounced = true;
            if (this.debug) console.log("Bounced bottom boundary");
        }

        if (bounced) {
            this.gameMap?.soundManager?.play('ball_hit');
            this.updateBallAnimation();
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

        element.addEventListener('click', (e) => {
            e.stopPropagation();
            const myte = this.activeMyte;
            if (!myte?.isActive) return;
            if (this.isPickedUp && this.carrier === myte) {
                // Click ball while carrying it → drop in place
                myte.queue.clear();
            } else if (!myte.queue.isCarrying()) {
                myte.queue.addPickupBall(this);
            }
        });

        // Set up boundaries and other parent-dependent configs
        if (parent) {
            this.setupBoundaries(parent);
        }

        return element;
    }
    
    // Override drag component init to apply physics velocity on drop
    initDragComponent() {
        super.initDragComponent();
        const dragComp = this.inputComponents.drag;
        if (!dragComp) return;
        const originalOnDragEnd = dragComp.options.onDragEnd;
        dragComp.options.onDragEnd = (event) => {
            if (originalOnDragEnd) originalOnDragEnd(event);
            this._applyDragVelocity(event?.velocity);
        };
    }

    _applyDragVelocity(dragVelocity) {
        if (!dragVelocity) return;
        // DragComponent velocity is in px/sec; scale to game units per frame (~60fps)
        const scale = 1 / 55;
        const vx = dragVelocity.x * scale;
        const vy = dragVelocity.y * scale;
        if (Math.abs(vx) > 0.2 || Math.abs(vy) > 0.2) {
            this.velocity.x = vx;
            this.velocity.y = vy;
            this.capVelocity();
            this.isMoving = true;
            this.updateBallAnimation();
            if (this.element) this.element.setAttribute('data-moving', 'true');
        }
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

    getSpeed() {
        return Math.hypot(this.velocity.x, this.velocity.y);
    }

    syncAnimationSpeed(speed = this.getSpeed()) {
        const normalizedSpeed = Math.max(0, Math.min(1, speed / Math.max(this.maxSpeed, 0.001)));
        const frameDelay = this.maxAnimationFrameDelay -
            ((this.maxAnimationFrameDelay - this.minAnimationFrameDelay) * normalizedSpeed);
        this.setAnimationSpeed(frameDelay);
    }

    stopMotion() {
        this.velocity.x = 0;
        this.velocity.y = 0;
        this.isMoving = false;
        this.pauseAnimation();
        if (this.element) {
            this.element.setAttribute('data-moving', 'false');
        }
        if (this.debug) console.log("Ball stopped");
    }

    // tickUpdate: collision detection + physics (no DOM)
    tickUpdate(tickDelta) {
        super.tickUpdate(tickDelta);

        if (this.isPickedUp && this.carrier) {
            // Center ball above carrier's head
            this.posX = this.carrier.posX + (this.carrier.size.width - this.size.width) / 2;
            this.posY = this.carrier.posY - this.size.height - 8;
            return;
        }

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
