class BallMapObject extends withPickup(AnimatedMapObject) {
    constructor(parent, type, variant, posX, posY, config = {}, options = {}) {
        // Ensure we have proper configuration for animation

        // Call parent constructor
        super(parent, type, variant, posX, posY, config, options);

        // Physics properties
        this.velocity = { x: 0, y: 0 };
        this.movementBody = new MovementBody(this);
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

        // Drop bounce (Z-axis visual only — sprite translates, shadow stays grounded)
        this.verticalVelocity = 0;
        this.isDropBouncing = false;
        this.dropBounceCount = 0;
        this.defaultMaxDropBounces = this.getConfig('maxDropBounces', 3);
        this.maxDropBounces = this.defaultMaxDropBounces;
        this.dropGravity = this.getConfig('dropGravity', 1.2);
        this.dropBounceFactor = this.getConfig('dropBounceFactor', 0.48);
        this.airborneFriction = this.getConfig('airborneFriction', 0.985);
        this.landingSquash = 0;
        this.maxLandingSquash = this.getConfig('maxLandingSquash', 0.14);
        this.landingSquashDecay = this.getConfig('landingSquashDecay', 0.7);

        // Safe defaults — overwritten by setupBoundaries() once render() has a parent
        this.dragAnimationVelocity = { x: 0, y: 0 };
        this.dragAnimationTargetVelocity = { x: 0, y: 0 };
        this.dragAnimationLastInputTime = 0;
        this.dragAnimationIdleDelay = this.getConfig('dragAnimationIdleDelay', 56);
        this.dragAnimationResponse = this.getConfig('dragAnimationResponse', 0.4);
        this.dragAnimationDecay = this.getConfig('dragAnimationDecay', this.settleFriction);

        this.bounds = { left: 0, top: 0, right: 500, bottom: 500 };
    }

    triggerArcBounce(height = 30) {
        if (height < 2) return;
        const clampedHeight = Math.min(this.getConfig('maxArcBounceHeight', 60), height);
        // Launch from the ground and let gravity bring it back down.
        this.verticalVelocity = Math.max(
            this.verticalVelocity,
            Math.sqrt(2 * this.dropGravity * clampedHeight)
        );
        this.isDropBouncing = true;
        this.dropBounceCount = 0;
        this.maxDropBounces = 1;
    }

    triggerDropBounce(initialHeight = 90) {
        const clampedHeight = Math.min(this.getConfig('maxDropBounceHeight', 72), initialHeight);
        this.verticalVelocity = Math.max(
            this.verticalVelocity,
            Math.sqrt(2 * this.dropGravity * clampedHeight)
        );
        this.isDropBouncing = true;
        this.dropBounceCount = 0;
        this.maxDropBounces = this.defaultMaxDropBounces;
    }

    _updateDropBounce() {
        if (!this.isDropBouncing && this.posZ <= 0) {
            return;
        }

        this.posZ += this.verticalVelocity;
        this.verticalVelocity -= this.dropGravity;

        if (this.posZ <= 0) {
            this.posZ = 0;
            const speed = Math.abs(this.verticalVelocity);
            this._setLandingSquash(speed);
            if (this.dropBounceCount < this.maxDropBounces && speed > 1.5) {
                this.verticalVelocity = speed * this.dropBounceFactor;
                this.dropBounceCount++;
                this.gameMap?.soundManager?.play('obj_ball_bounce', { source: this });
            } else {
                this.verticalVelocity = 0;
                this.isDropBouncing = false;
                this.maxDropBounces = this.defaultMaxDropBounces;
            }
        }
    }

    _setLandingSquash(impactSpeed = 0) {
        this.landingSquash = Math.min(
            this.maxLandingSquash,
            Math.max(this.landingSquash, impactSpeed * 0.015)
        );
    }

    _applySpriteVisuals() {
        const squash = this.landingSquash > 0.001 ? this.landingSquash : 0;
        this.setSpriteVerticalLift(this.posZ);
        this.setSpriteVisualScale(
            1 + (squash * 0.85),
            Math.max(0.82, 1 - squash)
        );
    }

    _resetVerticalMotion() {
        this.posZ = 0;
        this.verticalVelocity = 0;
        this.isDropBouncing = false;
        this.dropBounceCount = 0;
        this.maxDropBounces = this.defaultMaxDropBounces;
        this.landingSquash = 0;
        this._applySpriteVisuals();
    }

    _triggerImpactHop() {
        if (this.posZ > 0.1) {
            return;
        }

        const speed = this.getSpeed();
        if (speed < 2.8) {
            return;
        }

        this.triggerArcBounce(Math.min(18, Math.max(8, speed * 1.8)));
    }

    shouldSimulateOffScreen() { return true; }

    shouldRenderShadow() {
        return true;
    }

    getShadowConfig() {
        const explicit = this.getVisualValue('shadow', this.getConfig('shadow', null));
        if (explicit?.enabled) return explicit;
        const maxZ = this.getConfig('maxArcBounceHeight', 60);
        return {
            enabled: true,
            widthRatio: 0.65,
            heightRatio: 0.16,
            anchorX: 0.5,
            anchorY: 0.85,
            maxOpacity: 0.35,
            minOpacity: 0.08,
            opacityFadeDistance: maxZ * 1.2,
            scaleFadeDistance: maxZ * 0.9,
            minScale: 0.55,
            blur: 3
        };
    }

    getApproachConfig() {
        return {
            gap: 8,
            align: 'center'
        };
    }

    canBeDragged() {
        return super.canBeDragged();
    }

    startDrag() {
        this.stopMotion();
        this._resetDragAnimationState();
        this._resetVerticalMotion();
        // If the myte is holding this ball, interrupt the hold so the ball is freed
        if (this.isPickedUp && this.carrier) {
            this.carrier.queue.clear();
        }
        super.startDrag?.();
    }

    startDragAtPosition(position = null) {
        this.stopMotion();
        this._resetDragAnimationState();
        this._resetVerticalMotion();
        super.startDragAtPosition?.(position);
    }

    pickup(myte) {
        if (!super.pickup(myte)) {
            return false;
        }
        this.stopMotion();
        this._resetVerticalMotion();
        return true;
    }

    drop(vx = 0, vy = 0) {
        super.drop(vx, vy);
        this.posZ = 0;
        this.verticalVelocity = 0;
        if (vx !== 0 || vy !== 0) {
            this.velocity.x = vx;
            this.velocity.y = vy;
            this.isMoving = true;
            this.updateBallAnimation();
        }
        this.triggerDropBounce(Math.max(18, Math.hypot(vx, vy) * 6));
    }

    reactToNearbyCreature(myte) {
        if (this.isDragging || this.isPickedUp || this.pendingPickup) return;

        const now = SimClock.now();
        if (now - this.lastPushTime < this.pushCooldown) return;

        // Only react to moving mytes
        if (!myte.isMoving()) return;

        // Check if myte collides with ball
        const collides = this.gameMap?.checkCollision
            ? this.gameMap.checkCollision(myte, this)
            : myte.parent?.checkCollision?.(myte, this);

        if (collides) {
            // Calculate push direction and force
            const ballCenter = this.getCenterPoint();
            const myteRect = this.getColliderRectFor(myte);
            const myteCenter = {
                x: (myteRect.left + myteRect.right) / 2,
                y: (myteRect.top + myteRect.bottom) / 2
            };

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

            this.gameMap?.soundManager?.play('ball_hit', { source: this });

            // Make the creature react
            myte.queue.addExpression('happy');
            const bumpReward = SiteConfig.stats.activityRewards.microInteractions.ballBump;
            myte.stats?.applyStatEffects?.(bumpReward, {
                scale: bumpReward.rewardScale
            });
            myte.buffs?.handleActionLike?.(bumpReward, {
                source: 'ballCollision',
                target: this
            });
            
            if (this.debug) {
                Utility.logDebug(`Ball pushed! Velocity X: ${this.velocity.x.toFixed(2)}, Y: ${this.velocity.y.toFixed(2)}`);
            }
        }
    }

    nudgeBy(myte, forceMultiplier = 1) {
        if (!myte || this.isDragging || this.isPickedUp || this.pendingPickup) {
            return false;
        }

        const now = SimClock.now();
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

        this.gameMap?.soundManager?.play('ball_hit', { source: this });
        return true;
    }
    
    // Cap velocity at maximum speed
    capVelocity() {
        const speed = this.getSpeed();
        if (!Number.isFinite(speed)) {
            this.stopMotion();
            return;
        }
        this.movementBody.capVelocity(this.maxSpeed);
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

        this.movementBody.capVelocity(limit);
    }
    
    // Update animation based on movement direction
    updateBallAnimation(velocity = this.velocity) {
        const speed = this.getSpeed(velocity);

        // Skip only once motion has effectively settled.
        if (speed <= this.stopThreshold) {
            return;
        }
        
        // Resume animation if paused (sleep-aware — see AnimatedMapObject)
        if (this.animation && this.animation.paused) {
            this.resumeAnimation();
        }
        
        // Determine primary direction of movement
        const absX = Math.abs(velocity.x);
        const absY = Math.abs(velocity.y);
        const direction = this.movementBody.getDirection(velocity, 0);
        
        // Choose animation based on direction
        let animName;
        if (absX > absY) {
            // Moving right (positive X) = rotateZ_reverse
            // Moving left (negative X) = rotateY
            animName = direction === 'E' ? 'rotateZ_reverse' : 'rotateY';
        } else {
            // Moving down (positive Y) = rotateX
            // Moving up (negative Y) = rotateX_reverse
            animName = direction === 'S' ? 'rotateX' : 'rotateX_reverse';
        }
        
        this.syncAnimationSpeed(speed);
        this.playAnimation(animName);
        
        if (this.debug) {
            Utility.logDebug(`Playing ${absX > absY ? 'horizontal' : 'vertical'} animation: ${animName}`);
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
        const friction = this.posZ > 0.05
            ? this.airborneFriction
            : speedBeforeFriction <= this.settleThreshold
                ? this.settleFriction
                : this.friction;

        this.velocity.x *= friction;
        this.velocity.y *= friction;

        const speed = this.getSpeed();

        if (speed > this.stopThreshold) {
            this.updateBallAnimation();
        } else {
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
            this.gameMap?.soundManager?.play('ball_hit', { source: this });
            this._triggerImpactHop();
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
            if (this.debug) Utility.logDebug("Bounced left boundary");
        } else if (this.posX + this.size.width > this.bounds.right) {
            this.posX = this.bounds.right - this.size.width;
            this.velocity.x = -Math.abs(this.velocity.x) * bounceMultiplier;
            bounced = true;
            if (this.debug) Utility.logDebug("Bounced right boundary");
        }

        if (this.posY < this.bounds.top) {
            this.posY = this.bounds.top;
            this.velocity.y = Math.abs(this.velocity.y) * bounceMultiplier;
            bounced = true;
            if (this.debug) Utility.logDebug("Bounced top boundary");
        } else if (this.posY + this.size.height > this.bounds.bottom) {
            this.posY = this.bounds.bottom - this.size.height;
            this.velocity.y = -Math.abs(this.velocity.y) * bounceMultiplier;
            bounced = true;
            if (this.debug) Utility.logDebug("Bounced bottom boundary");
        }

        if (bounced) {
            this.gameMap?.soundManager?.play('ball_hit', { source: this });
            this._triggerImpactHop();
            this.updateBallAnimation();
        }
    }

    // Override the play animation method to handle special cases
    playAnimation(animationName, onComplete) {
        if (this.debug) Utility.logDebug("Ball playAnimation called with:", animationName);
        
        // If we're playing idle but we already have an animation running,
        // skip it to preserve the last animation frame
        if (animationName === 'idle' && this.animation && this.animation.currentAnimation) {
            if (this.debug) Utility.logDebug("Skipping idle animation to preserve last frame");
            return;
        }
        
        // Call parent class implementation
        super.playAnimation(animationName, onComplete);
    }

    setPosition(x, y) {
        if (x != null) this.posX = x;
        if (y != null) this.posY = y;
        this.markPositionDirty();
    }

    setSpritePosition(_x, _y) {
        // MapObject renders via posX/posY; no separate sprite transform
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
        this._applySpriteVisuals();

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
        const originalOnDragMove = dragComp.options.onDragMove;
        const originalOnDragEnd = dragComp.options.onDragEnd;
        dragComp.options.onDragMove = (event) => {
            if (originalOnDragMove) originalOnDragMove(event);
            this._syncDragAnimation(event?.velocity);
        };
        dragComp.options.onDragEnd = (event) => {
            if (originalOnDragEnd) originalOnDragEnd(event);
            this._resetDragAnimationState();
            this._applyDragVelocity(event?.velocity);
        };
    }

    remove() {
        this._selectDragCleanup?.();
        super.remove();
    }

    _scaleDragVelocity(dragVelocity) {
        if (!dragVelocity) {
            return null;
        }

        const dragVelocityScale = this.getConfig('dragVelocityScale', 55);
        const scale = (1 / dragVelocityScale) * this.getConfig('dragReleaseVelocityMultiplier', 1);

        return {
            x: dragVelocity.x * scale,
            y: dragVelocity.y * scale
        };
    }

    _syncDragAnimation(dragVelocity) {
        const scaledVelocity = this._scaleDragVelocity(dragVelocity);
        if (!scaledVelocity) {
            return;
        }

        this.dragAnimationTargetVelocity = scaledVelocity;
        this.dragAnimationLastInputTime = performance.now();
        if (this.getSpeed(this.dragAnimationVelocity) <= this.stopThreshold) {
            this.dragAnimationVelocity = { ...scaledVelocity };
        }
    }

    _resetDragAnimationState() {
        this.dragAnimationVelocity = { x: 0, y: 0 };
        this.dragAnimationTargetVelocity = { x: 0, y: 0 };
        this.dragAnimationLastInputTime = 0;
    }

    _updateDragAnimation(deltaTime = 16.67) {
        if (!this.isDragging) {
            return;
        }

        const now = performance.now();
        const hasRecentInput = this.dragAnimationLastInputTime > 0 &&
            (now - this.dragAnimationLastInputTime) <= this.dragAnimationIdleDelay;
        const frameRatio = Math.max(0.25, deltaTime / 16.67);

        if (hasRecentInput) {
            const response = 1 - Math.pow(1 - this.dragAnimationResponse, frameRatio);
            this.dragAnimationVelocity.x +=
                (this.dragAnimationTargetVelocity.x - this.dragAnimationVelocity.x) * response;
            this.dragAnimationVelocity.y +=
                (this.dragAnimationTargetVelocity.y - this.dragAnimationVelocity.y) * response;
        } else {
            const decay = Math.pow(this.dragAnimationDecay, frameRatio);
            this.dragAnimationVelocity.x *= decay;
            this.dragAnimationVelocity.y *= decay;
        }

        if (this.getSpeed(this.dragAnimationVelocity) <= this.stopThreshold) {
            this.dragAnimationVelocity = { x: 0, y: 0 };
            this.pauseAnimation();
            return;
        }

        this.updateBallAnimation(this.dragAnimationVelocity);
    }

    _applyDragVelocity(dragVelocity) {
        const scaledVelocity = this._scaleDragVelocity(dragVelocity);
        if (!scaledVelocity) {
            this.pauseAnimation();
            return;
        }

        // Release inertia: convert pointer speed (px/s) into world units/tick.
        // dragVelocityScale = the pointer px/s that maps to 1 world unit/tick.
        // Higher value = need faster mouse for same ball speed (wider proportional range).
        const dragReleaseMaxSpeed = this.getConfig('dragReleaseMaxSpeed', this.maxSpeed);
        let vx = scaledVelocity.x;
        let vy = scaledVelocity.y;

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
        } else {
            this.pauseAnimation();
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
                Utility.logDebug("Ball boundaries set:", this.bounds);
            }

            this.clampIntoBounds();
        }
    }

    // World state restores posX/posY verbatim, so a ball that escaped once
    // stays escaped across reloads unless it is pulled back in here.
    clampIntoBounds() {
        const x = Math.max(this.bounds.left, Math.min(this.bounds.right - this.size.width, this.posX));
        const y = Math.max(this.bounds.top, Math.min(this.bounds.bottom - this.size.height, this.posY));
        if (x === this.posX && y === this.posY) return;

        Utility.warnDebug(`[Ball] position (${this.posX}, ${this.posY}) was outside bounds — clamped to (${x}, ${y})`);
        this.setPosition(x, y);
    }

    getSpeed(velocity = this.velocity) {
        return this.movementBody.getSpeed(velocity);
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
        if (this.debug) Utility.logDebug("Ball stopped");
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
        if (this.isDragging) {
            this._updateDragAnimation(deltaTime);
        }
        if (this.landingSquash > 0.001) {
            const frameRatio = Math.max(0.25, deltaTime / 16.67);
            this.landingSquash *= Math.pow(this.landingSquashDecay, frameRatio);
            if (this.landingSquash < 0.001) {
                this.landingSquash = 0;
            }
        }
        this._applySpriteVisuals();
        if (this.element) {
            this.element.setAttribute('data-moving', String(this.isMoving));
        }
    }
}
