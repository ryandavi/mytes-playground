class AmbientCreatureMapObject extends AnimatedMapObject {
    static _debugAttributesEnabled = false;
    static _debugAttributesSyncAt = -1;

    get restingTarget() {
        const relationships = this.container?.relationships;
        if (relationships) return relationships.get('targeting', this) ?? null;
        return this._restingTarget ?? null;
    }

    set restingTarget(target) {
        const relationships = this.container?.relationships;
        const previous = relationships?.get?.('targeting', this) ?? this._restingTarget ?? null;
        this._restingTarget = target ?? null;

        if (!relationships) return;

        if (previous && previous !== target) {
            relationships.clear('targeting', this, previous);
        }

        if (target?.worldId) {
            relationships.set('targeting', this, target);
            return;
        }

        relationships.clear('targeting', this);
    }

    constructor(parent, type, variant, posX, posY, config = {}, options = {}) {
        super(parent, type, variant, posX, posY, config, options);

        this.velocity = { x: 0, y: 0 };
        this.speed = this.getConfig('speed', 1);
        this.moveThreshold = options.moveThreshold || 0.025;
        this.direction = 'S';

        this.bounds = {
            left: 0,
            right: options.mapWidth || 500,
            top: 0,
            bottom: options.mapHeight || 500
        };

        this.hoverHeightBase = this.getConfig('hoverHeight', 18);
        this.hoverVariance = this.getConfig('hoverVariance', 8);

        this.stateElapsed = 0;
        this.hoverDuration = 2000 + Math.random() * 2000;
        this.moveDuration = 2000 + Math.random() * 3000;
        this.isHovering = Math.random() > 0.5;

        this.isIdle = false;
        this.idleElapsed = 0;
        this.idleDuration = 0;
        this.idleChance = options.idleChance || this.getConfig('idleChance', 0.001);

        this.fluttering = false;
        this.flutterChance = options.flutterChance || this.getConfig('flutterChance', 0.01);

        this.targetSeekChance = this.getConfig('targetSeekChance', 0.003);
        this.targetSearchRadius = this.getConfig('targetSearchRadius', 320);
        this.targetRestDurationMin = this.getConfig('targetRestDurationMin', 2200);
        this.targetRestDurationMax = this.getConfig('targetRestDurationMax', 5200);
        this._restingTarget = null;
        this.restingTarget = null;
        this.isRestingOnTarget = false;
        this.restElapsed = 0;
        this.restDuration = 0;
        this.seekCooldown = 0;

        this.blockedFrames = 0;
        this.stuckFrames = 0;
        this.lastBlockedReason = 'none';
        this.lastMoveDelta = { x: 0, y: 0 };

        this.initializeVelocity();
    }

    shouldSimulateOffScreen() { return true; }

    initializeVelocity() {
        const startAngle = Math.random() * Math.PI * 2;
        this.velocity = {
            x: Math.cos(startAngle) * this.speed,
            y: Math.sin(startAngle) * this.speed
        };
    }

    // Override in subclass: return target object or null
    findTarget() { return null; }

    // Override in subclass: return { x, y } rest position centered on target
    getTargetRestPosition(target) { return null; }

    // Override in subclass: called once when creature arrives at resting target
    onRestStart(target) {}

    // Override in subclass: called just before creature leaves resting target
    onRestEnd(target) {}

    beginTargetRest(target) {
        if (!target) return false;
        const pos = this.getTargetRestPosition(target);
        if (!pos || !this.isPathToPositionClear(pos.x, pos.y)) return false;

        this.restingTarget = target;
        this.isRestingOnTarget = false;
        this.restElapsed = 0;
        this.restDuration = this.targetRestDurationMin +
            Math.random() * Math.max(1, this.targetRestDurationMax - this.targetRestDurationMin);
        this.seekCooldown = 0;
        this.isIdle = false;
        this.fluttering = false;
        return true;
    }

    clearTargetRest() {
        this.restingTarget = null;
        this.isRestingOnTarget = false;
        this.restElapsed = 0;
        this.restDuration = 0;
        this.switchToMoving();
    }

    getRestingTargetPosition() {
        return this.getTargetRestPosition(this.restingTarget);
    }

    updateBehavior(tickDelta) {
        this.seekCooldown = Math.max(0, this.seekCooldown - tickDelta);

        if (this.restingTarget) {
            this.updateTargetRestBehavior(tickDelta);
            return;
        }

        if (this.isIdle) {
            this.idleElapsed += tickDelta;
            if (this.idleElapsed >= this.idleDuration) {
                this.exitIdleState();
            } else {
                this.updateIdleState();
            }
            return;
        }

        if (this.seekCooldown <= 0 && Math.random() < this.targetSeekChance) {
            const target = this.findTarget();
            if (target) {
                this.beginTargetRest(target);
                return;
            }
        }

        if (Math.random() < this.idleChance) {
            this.enterIdleState();
            return;
        }

        this.updateHoverMoveBehavior(tickDelta);
    }

    enterIdleState() {
        this.isIdle = true;
        this.fluttering = false;
        this.idleElapsed = 0;
        this.idleDuration = 3000 + Math.random() * 5000;
        this.velocity.x = 0;
        this.velocity.y = 0;
        this.playAnimation('idle');
    }

    exitIdleState() {
        this.isIdle = false;
        this.fluttering = false;
        this.stateElapsed = 0;

        const angle = Math.random() * Math.PI * 2;
        this.velocity.x = Math.cos(angle) * this.speed * 0.5;
        this.velocity.y = Math.sin(angle) * this.speed * 0.5;
    }

    updateIdleState() {
        if (this.fluttering) {
            if (Math.random() < 0.01) {
                this.fluttering = false;
                this.playAnimation('idle');
            }
        } else if (Math.random() < this.flutterChance) {
            this.fluttering = true;
            this.playAnimation('flutter');
        }

        this.velocity.x = 0;
        this.velocity.y = 0;
    }

    updateHoverMoveBehavior(tickDelta) {
        this.stateElapsed += tickDelta;

        if (this.isHovering) {
            if (this.stateElapsed >= this.hoverDuration) {
                this.switchToMoving();
            } else {
                this.updateHoveringMotion();
            }
        } else if (this.stateElapsed >= this.moveDuration) {
            this.switchToHovering();
        } else {
            this.updateMovingMotion();
        }
    }

    updateTargetRestBehavior(tickDelta) {
        if (!this.restingTarget || this.restingTarget.active === false) {
            this.clearTargetRest();
            return;
        }

        const pos = this.getRestingTargetPosition();
        if (!pos) {
            this.clearTargetRest();
            return;
        }

        const dx = pos.x - this.posX;
        const dy = pos.y - this.posY;
        const distance = Math.hypot(dx, dy);

        if (!this.isRestingOnTarget && !this.isPathToPositionClear(pos.x, pos.y)) {
            this.abandonTargetRest('blocked path');
            return;
        }

        if (!this.isRestingOnTarget && distance > 6) {
            const approachSpeed = Math.max(0.3, this.speed * 0.8);
            this.velocity.x = (dx / Math.max(distance, 1)) * approachSpeed;
            this.velocity.y = (dy / Math.max(distance, 1)) * approachSpeed;
            this.updateDirection();
            return;
        }

        if (!this.isRestingOnTarget) {
            this.isRestingOnTarget = true;
            this.velocity.x = 0;
            this.velocity.y = 0;
            this.posX = pos.x;
            this.posY = pos.y;
            this.playAnimation('idle');
            this.onRestStart(this.restingTarget);
        }

        this.restElapsed += tickDelta;
        if (this.restElapsed >= this.restDuration) {
            this.onRestEnd(this.restingTarget);
            this.clearTargetRest();
        }
    }

    abandonTargetRest(reason = 'target unavailable') {
        this.lastBlockedReason = reason;
        this.seekCooldown = 1200 + Math.random() * 1200;
        this.clearTargetRest();
        this.initializeVelocity();
    }

    switchToMoving() {
        this.isHovering = false;
        this.stateElapsed = 0;
        this.moveDuration = 2000 + Math.random() * 3000;
        const angle = Math.random() * Math.PI * 2;
        this.velocity.x = Math.cos(angle) * this.speed;
        this.velocity.y = Math.sin(angle) * this.speed;
    }

    switchToHovering() {
        this.isHovering = true;
        this.stateElapsed = 0;
        this.hoverDuration = 1000 + Math.random() * 2000;
        this.velocity.x *= 0.3;
        this.velocity.y *= 0.3;
    }

    updateHoveringMotion() {
        const t = this.stateElapsed * 0.001;
        this.velocity.x = Math.sin(t) * this.speed * 0.2;
        this.velocity.y = Math.cos(t) * this.speed * 0.2;
    }

    updateMovingMotion() {
        if (Math.random() < 0.05) {
            this.velocity.x += (Math.random() - 0.5) * this.speed;
            this.velocity.y += (Math.random() - 0.5) * this.speed;
            this.normalizeVelocity();
        }
    }

    normalizeVelocity() {
        const currentSpeed = Math.sqrt(
            this.velocity.x * this.velocity.x +
            this.velocity.y * this.velocity.y
        );
        if (currentSpeed > 0) {
            const targetSpeed = this.speed * (0.8 + Math.random() * 0.4);
            this.velocity.x = (this.velocity.x / currentSpeed) * targetSpeed;
            this.velocity.y = (this.velocity.y / currentSpeed) * targetSpeed;
        }
    }

    updateDirection() {
        if (Math.abs(this.velocity.x) < 0.01 && Math.abs(this.velocity.y) < 0.01) return;

        if (Math.abs(this.velocity.x) > Math.abs(this.velocity.y)) {
            this.direction = this.velocity.x > 0 ? 'E' : 'W';
        } else {
            this.direction = this.velocity.y > 0 ? 'S' : 'N';
        }

        if (!this.isIdle && !this.isRestingOnTarget) {
            this.playAnimation(this.direction);
        }
    }

    canOccupyPosition(x, y) {
        const gridSystem = this.gameMap?.gridSystem;
        if (!gridSystem) return true;
        return gridSystem.isEntityPositionValid?.(this, x, y) ?? true;
    }

    isPathToPositionClear(targetX, targetY, stepSize = 12) {
        const dx = targetX - this.posX;
        const dy = targetY - this.posY;
        const distance = Math.hypot(dx, dy);
        if (distance <= 1) return this.canOccupyPosition(targetX, targetY);

        const steps = Math.max(1, Math.ceil(distance / stepSize));
        for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            if (!this.canOccupyPosition(this.posX + dx * t, this.posY + dy * t)) return false;
        }
        return true;
    }

    tryAlternateMovement(nextX, nextY) {
        if (this.canOccupyPosition(nextX, nextY)) {
            return { moved: true, x: nextX, y: nextY, vx: this.velocity.x, vy: this.velocity.y };
        }
        if (this.canOccupyPosition(nextX, this.posY)) {
            return { moved: true, x: nextX, y: this.posY, vx: this.velocity.x, vy: 0 };
        }
        if (this.canOccupyPosition(this.posX, nextY)) {
            return { moved: true, x: this.posX, y: nextY, vx: 0, vy: this.velocity.y };
        }

        const baseAngle = Math.atan2(this.velocity.y, this.velocity.x || 0.0001);
        const speed = Math.max(this.speed * 0.6, Math.hypot(this.velocity.x, this.velocity.y));
        const angleOffsets = [Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2, (3 * Math.PI) / 4, -(3 * Math.PI) / 4];

        for (const offset of angleOffsets) {
            const testVx = Math.cos(baseAngle + offset) * speed;
            const testVy = Math.sin(baseAngle + offset) * speed;
            const testX = this.posX + testVx;
            const testY = this.posY + testVy;
            if (this.canOccupyPosition(testX, testY)) {
                return { moved: true, x: testX, y: testY, vx: testVx, vy: testVy };
            }
        }

        return { moved: false, x: this.posX, y: this.posY, vx: this.velocity.x, vy: this.velocity.y };
    }

    recoverFromStuckState(reason = 'stuck') {
        this.lastBlockedReason = reason;
        this.blockedFrames = 0;
        this.stuckFrames = 0;
        this.seekCooldown = 1500 + Math.random() * 1500;
        if (this.restingTarget) this.clearTargetRest();

        const safePosition = this.gameMap?.gridSystem?.findNearestValidPositionForEntity(
            this, this.posX, this.posY, 6
        );
        if (safePosition) {
            this.posX = safePosition.x;
            this.posY = safePosition.y;
        }

        this.initializeVelocity();
        this.switchToMoving();
    }

    bounceAwayFromObstacle() {
        this.velocity.x *= -1;
        this.velocity.y *= -1;

        if (Math.abs(this.velocity.x) < this.moveThreshold) {
            this.velocity.x += (Math.random() - 0.5) * this.speed;
        }
        if (Math.abs(this.velocity.y) < this.moveThreshold) {
            this.velocity.y += (Math.random() - 0.5) * this.speed;
        }

        this.normalizeVelocity();
        this.switchToMoving();
    }

    checkBoundaries() {
        if (this.posX < this.bounds.left || this.posX > this.bounds.right - this.size.width) {
            this.velocity.x *= -1;
            this.posX = Math.max(this.bounds.left, Math.min(this.bounds.right - this.size.width, this.posX));
        }
        if (this.posY < this.bounds.top || this.posY > this.bounds.bottom - this.size.height) {
            this.velocity.y *= -1;
            this.posY = Math.max(this.bounds.top, Math.min(this.bounds.bottom - this.size.height, this.posY));
        }
    }

    shouldRenderShadow() {
        return true;
    }

    getShadowConfig() {
        const explicit = super.getShadowConfig();
        if (explicit) return explicit;
        const maxZ = Math.max(this.hoverHeightBase || 18, 10);
        return {
            enabled: true,
            widthRatio: 0.6,
            heightRatio: 0.15,
            anchorX: 0.5,
            anchorY: 0.88,
            maxOpacity: 0.45,
            minOpacity: 0.10,
            opacityFadeDistance: maxZ * 2.6,
            scaleFadeDistance: maxZ * 1.8,
            minScale: 0.6,
            blur: 2
        };
    }

    // Override in subclass to manage posZ each frame (flight bobbing, landing lerp, etc.)
    updateFlightHeight() {}

    applyFlightLift() {
        this.setSpriteVerticalLift?.(this.posZ || 0);
    }

    render(container, parent) {
        const element = super.render(container, parent);
        element.classList.add('animated-map-object');

        if (parent?.getMaxDimensions) {
            const { width, height } = parent.getMaxDimensions();
            this.bounds = { left: 0, right: width, top: 0, bottom: height };
        }

        element.setAttribute('data-idle', this.isIdle);
        element.setAttribute('data-hovering', this.isHovering);
        element.setAttribute('data-fluttering', this.fluttering);
        element.setAttribute('data-direction', this.direction);

        return element;
    }

    tickUpdate(tickDelta) {
        super.tickUpdate(tickDelta);
        const oldX = this.posX;
        const oldY = this.posY;

        this.updateBehavior(tickDelta);

        const nextX = this.posX + this.velocity.x;
        const nextY = this.posY + this.velocity.y;
        const result = this.tryAlternateMovement(nextX, nextY);

        if (result.moved) {
            this.posX = result.x;
            this.posY = result.y;
            this.velocity.x = result.vx;
            this.velocity.y = result.vy;
            this.blockedFrames = 0;
            this.lastBlockedReason = 'none';
        } else {
            this.blockedFrames++;
            if (this.restingTarget) this.abandonTargetRest('blocked by obstacle');
            this.bounceAwayFromObstacle();
        }

        this.lastMoveDelta = { x: this.velocity.x, y: this.velocity.y };
        this.checkBoundaries();
        this.updateDirection();

        const movementAmount = Math.hypot(this.posX - this.renderState.posX, this.posY - this.renderState.posY);
        if (!this.isIdle && !this.isRestingOnTarget && movementAmount < 0.1 && Math.hypot(this.velocity.x, this.velocity.y) > 0.05) {
            this.stuckFrames++;
        } else {
            this.stuckFrames = 0;
        }

        if (this.blockedFrames >= 8 || this.stuckFrames >= 20 || !this.canOccupyPosition(this.posX, this.posY)) {
            this.recoverFromStuckState(this.blockedFrames >= 8 ? 'blocked repeatedly' : 'stuck in place');
        }

        if ((this.posX !== oldX || this.posY !== oldY) && this.gameMap?.gridSystem) {
            this.gameMap.gridSystem.updateObjectPosition(this, oldX, oldY);
        }
    }

    update(deltaTime) {
        this.updateFlightHeight();
        super.update(deltaTime);
        this.applyFlightLift();
        const simNow = SimClock.now();
        if (AmbientCreatureMapObject._debugAttributesSyncAt !== simNow) {
            AmbientCreatureMapObject._debugAttributesSyncAt = simNow;
            AmbientCreatureMapObject._debugAttributesEnabled = document.body.classList.contains('debug');
        }
        this.updateDebugAttributes();
    }

    updateDebugAttributes() {
        if (!this.element || !AmbientCreatureMapObject._debugAttributesEnabled) return;
        this.element.setAttribute('data-idle', this.isIdle);
        this.element.setAttribute('data-hovering', this.isHovering);
        this.element.setAttribute('data-fluttering', this.fluttering);
        this.element.setAttribute('data-direction', this.direction);
        this.element.setAttribute('data-resting', this.isRestingOnTarget);
    }
}
