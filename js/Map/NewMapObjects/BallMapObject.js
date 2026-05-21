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

        // Drop bounce (Z-axis visual only — sprite translates, shadow stays grounded)
        this.dropZ = 0;
        this.dropVelocityZ = 0;
        this.isDropBouncing = false;
        this.dropBounceCount = 0;
        this.maxDropBounces = 3;
        this.dropGravity = 1.2;
        this.dropBounceFactor = 0.48;

        // Safe defaults — overwritten by setupBoundaries() once render() has a parent
        this.bounds = { left: 0, top: 0, right: 500, bottom: 500 };
    }

    triggerArcBounce(height = 30) {
        if (height < 2) return;
        // Single-arc: launch upward, one small bounce, settle
        this.dropZ = height;
        this.dropVelocityZ = 0;
        this.isDropBouncing = true;
        this.dropBounceCount = 0;
        this.maxDropBounces = 1;
    }

    triggerDropBounce(initialHeight = 90) {
        this.dropZ = initialHeight;
        this.dropVelocityZ = 0;
        this.isDropBouncing = true;
        this.dropBounceCount = 0;
    }

    _updateDropBounce() {
        this.dropVelocityZ -= this.dropGravity;
        this.dropZ += this.dropVelocityZ;

        if (this.dropZ <= 0) {
            this.dropZ = 0;
            const speed = Math.abs(this.dropVelocityZ);
            if (this.dropBounceCount < this.maxDropBounces && speed > 1.5) {
                this.dropVelocityZ = speed * this.dropBounceFactor;
                this.dropBounceCount++;
                this.gameMap?.soundManager?.play('obj_ball_bounce');
            } else {
                this.dropVelocityZ = 0;
                this.isDropBouncing = false;
                this.maxDropBounces = 3; // restore default
                this._applySpriteDropOffset(0);
            }
        }
    }

    _applySpriteDropOffset(z) {
        const sprite = this.element?.querySelector('.sprite');
        if (!sprite) return;
        sprite.style.transform = z > 0 ? `translateY(-${z.toFixed(1)}px)` : '';
    }

    shouldSimulateOffScreen() { return true; }

    getApproachConfig() {
        return {
            allowedSides: ['center'],
            preferredSide: 'center',
            gap: 0,
            align: 'center',
            alignTo: 'collider'
        };
    }

    canBeDragged() {
        return super.canBeDragged();
    }

    startDrag() {
        this.stopMotion();
        this.isDropBouncing = false;
        this.dropZ = 0;
        this.dropVelocityZ = 0;
        this._applySpriteDropOffset(0);
        // If the myte is holding this ball, interrupt the hold so the ball is freed
        if (this.isPickedUp && this.carrier) {
            this.carrier.queue.clear();
        }
        super.startDrag?.();
    }

    startDragAtPosition(position = null) {
        this.stopMotion();
        this.isDropBouncing = false;
        this.dropZ = 0;
        this.dropVelocityZ = 0;
        this._applySpriteDropOffset(0);
        super.startDragAtPosition?.(position);
    }

    // Get the center of the collider
    getColliderCenter() {
        return {
            x: this.posX + (this.collider.offsetX ?? 0) + ((this.collider.width ?? this.size.width) / 2),
            y: this.posY + (this.collider.offsetY ?? 0) + ((this.collider.height ?? this.size.height) / 2)
        };
    }

    // Get the center of a myte's collider
    getMyteColliderCenter(myte) {
        return {
            x: myte.posX + (myte.collider?.offsetX ?? 0) + ((myte.collider?.width ?? myte.size.width) / 2),
            y: myte.posY + (myte.collider?.offsetY ?? 0) + ((myte.collider?.height ?? myte.size.height) / 2)
        };
    }

    pickup(myte) {
        if (!super.pickup(myte)) {
            return false;
        }
        this.stopMotion();
        return true;
    }

    drop(vx = 0, vy = 0) {
        super.drop(vx, vy);
        if (vx !== 0 || vy !== 0) {
            this.velocity.x = vx;
            this.velocity.y = vy;
            this.isMoving = true;
            this.updateBallAnimation();
        }
        this.triggerDropBounce(Math.max(36, Math.hypot(vx, vy) * 14));
    }

    reactToNearbyCreature(myte) {
        if (this.isDragging || this.isPickedUp || this.pendingPickup) return;

        const now = performance.now();
        if (now - this.lastPushTime < this.pushCooldown) return;

        // Only react to moving mytes
        if (!myte.isMoving()) return;

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
            const mytePushForce = this.pushForce * this.getConfig('mytePushForceMultiplier', 1);
            const pushX = (dx / distance) * mytePushForce;
            const pushY = (dy / distance) * mytePushForce;

            // Kicks always launch at at least kick force in the kick direction
            const kickMaxSpeed = this.getConfig('myteKickMaxSpeed', this.maxSpeed);
            const kickMinSpeed = this.getConfig('myteKickMinSpeed', mytePushForce * 0.6);
            const currentSpeedInKickDir = this.velocity.x * (dx / distance) + this.velocity.y * (dy / distance);
            if (currentSpeedInKickDir < kickMinSpeed) {
                this.velocity.x = (dx / distance) * kickMinSpeed;
                this.velocity.y = (dy / distance) * kickMinSpeed;
            } else {
                this.velocity.x += pushX;
                this.velocity.y += pushY;
            }

            // Cap velocity at kick max speed (separate from normal maxSpeed)
            this.capVelocityTo(kickMaxSpeed);

            // Update animation based on movement
            this.updateBallAnimation();

            // Arc the ball upward proportional to push speed
            const pushSpeed = Math.hypot(pushX, pushY);
            const arcHeight = Math.min(60, pushSpeed * 6);
            this.triggerArcBounce(arcHeight);

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

    nudgeBy(myte, forceMultiplier = 1) {
        if (!myte || this.isDragging || this.isPickedUp || this.pendingPickup) {
            return false;
        }

        const now = performance.now();
        if (now - this.lastPushTime < this.pushCooldown * 0.35) {
            return false;
        }

        const ballRect = this.getColliderRectFor(this);
        const myteRect = this.getColliderRectFor(myte);
        const ballCenter = this.getCenterPoint();
        const myteCenter = {
            x: (myteRect.left + myteRect.right) / 2,
            y: (myteRect.top + myteRect.bottom) / 2
        };

        let dx = ballCenter.x - myteCenter.x;
        let dy = ballCenter.y - myteCenter.y;
        let distance = Math.hypot(dx, dy);

        if (!Number.isFinite(distance) || distance < 0.001) {
            const facingMap = {
                N: { x: 0, y: -1 },
                S: { x: 0, y: 1 },
                E: { x: 1, y: 0 },
                W: { x: -1, y: 0 }
            };
            const fallback = facingMap[myte.direction] ?? { x: 1, y: 0 };
            dx = fallback.x;
            dy = fallback.y;
            distance = 1;
        }

        const overlapX = Math.max(0, Math.min(ballRect.right, myteRect.right) - Math.max(ballRect.left, myteRect.left));
        const overlapY = Math.max(0, Math.min(ballRect.bottom, myteRect.bottom) - Math.max(ballRect.top, myteRect.top));
        if (overlapX > 0 || overlapY > 0) {
            const pushOutDistance = Math.max(overlapX, overlapY, 4) + 2;
            this.posX += (dx / distance) * pushOutDistance;
            this.posY += (dy / distance) * pushOutDistance;
        }

        const kickMaxSpeed = this.getConfig('myteKickMaxSpeed', this.maxSpeed);
        const force = this.pushForce * this.getConfig('mytePushForceMultiplier', 1) * forceMultiplier;

        // Kicks always launch at at least kick force in the kick direction
        const kickMinSpeed = this.getConfig('myteKickMinSpeed', force * 0.6);
        const nx = dx / distance;
        const ny = dy / distance;
        const currentSpeedInKickDir = this.velocity.x * nx + this.velocity.y * ny;
        if (currentSpeedInKickDir < kickMinSpeed) {
            this.velocity.x = nx * kickMinSpeed;
            this.velocity.y = ny * kickMinSpeed;
        } else {
            this.velocity.x += nx * force;
            this.velocity.y += ny * force;
        }
        this.capVelocityTo(kickMaxSpeed);
        this.isMoving = true;
        this.lastPushTime = now;
        this.updateBallAnimation();
        this.triggerArcBounce(Math.min(60, Math.max(18, force * 6)));
        if (this.element) {
            this.element.setAttribute('data-moving', 'true');
        }

        this.gameMap?.soundManager?.play('ball_hit');
        return true;
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

    capVelocityTo(limit = this.maxSpeed) {
        const speed = this.getSpeed();
        if (!Number.isFinite(speed)) {
            this.stopMotion();
            return;
        }

        if (!Number.isFinite(limit) || limit <= 0) {
            return;
        }

        if (speed > limit) {
            this.velocity.x = (this.velocity.x / speed) * limit;
            this.velocity.y = (this.velocity.y / speed) * limit;
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

    press() {
        return super.press();
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

        this._initSelectDragHandler();

        return element;
    }

    _initSelectDragHandler() {
        super._initSelectDragHandler?.();
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

    remove() {
        this._selectDragCleanup?.();
        super.remove();
    }

    _applyDragVelocity(dragVelocity) {
        if (!dragVelocity) return;
        // Release inertia: convert pointer speed (px/s) into world units/tick.
        // dragVelocityScale = the pointer px/s that maps to 1 world unit/tick.
        // Higher value = need faster mouse for same ball speed (wider proportional range).
        const dragVelocityScale = this.getConfig('dragVelocityScale', 55);
        const scale = (1 / dragVelocityScale) * this.getConfig('dragReleaseVelocityMultiplier', 1);
        const dragReleaseMaxSpeed = this.getConfig('dragReleaseMaxSpeed', this.maxSpeed);
        let vx = dragVelocity.x * scale;
        let vy = dragVelocity.y * scale;

        const edgeTolerance = 0.5;
        const atLeftEdge = this.posX <= this.bounds.left + edgeTolerance;
        const atRightEdge = this.posX >= (this.bounds.right - this.size.width - edgeTolerance);
        const atTopEdge = this.posY <= this.bounds.top + edgeTolerance;
        const atBottomEdge = this.posY >= (this.bounds.bottom - this.size.height - edgeTolerance);

        if ((atLeftEdge && vx < 0) || (atRightEdge && vx > 0)) {
            vx = 0;
        }

        if ((atTopEdge && vy < 0) || (atBottomEdge && vy > 0)) {
            vy = 0;
        }

        if (Math.abs(vx) > 0.2 || Math.abs(vy) > 0.2) {
            this.velocity.x = vx;
            this.velocity.y = vy;
            this.capVelocityTo(dragReleaseMaxSpeed);
            this.isMoving = true;
            this.updateBallAnimation();
            if (this.element) this.element.setAttribute('data-moving', 'true');
        }
    }

    // Set up boundaries based on parent container
    setupBoundaries(parent) {
        const explicitMapDimensions = this.gameMap?.dimensions
            || parent?.gameMap?.dimensions
            || null;
        const worldBounds = parent?.getWorldBounds?.() || null;
        const fallbackDimensions = parent?.getMaxDimensions?.() || null;

        const width = explicitMapDimensions?.width
            ?? worldBounds?.width
            ?? fallbackDimensions?.width;
        const height = explicitMapDimensions?.height
            ?? worldBounds?.height
            ?? fallbackDimensions?.height;

        if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
            this.bounds = {
                left: worldBounds?.left ?? 0,
                top: worldBounds?.top ?? 0,
                right: (worldBounds?.left ?? 0) + width,
                bottom: (worldBounds?.top ?? 0) + height
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

        if (this.isDragging) {
            return;
        }

        if (this.isPickedUp && this.carrier) {
            return;
        }

        if (this.isDropBouncing) {
            this._updateDropBounce();
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
        if (this.isDropBouncing) {
            this._applySpriteDropOffset(this.dropZ);
        }
    }
}
