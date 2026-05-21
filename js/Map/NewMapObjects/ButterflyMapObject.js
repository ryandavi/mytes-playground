class ButterflyMapObject extends AnimatedMapObject {
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

        this.bobPhase = Math.random() * Math.PI * 2;
        this.bobAmplitude = options.bobAmplitude || this.getConfig('bobAmplitude', 10);
        this.bobFrequency = options.bobFrequency || this.getConfig('bobFrequency', 0.05);
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

        this.flowerSeekChance = this.getConfig('flowerSeekChance', 0.003);
        this.flowerSearchRadius = this.getConfig('flowerSearchRadius', 320);
        this.flowerRestDurationMin = this.getConfig('flowerRestDurationMin', 2200);
        this.flowerRestDurationMax = this.getConfig('flowerRestDurationMax', 5200);
        this.restingFlower = null;
        this.isRestingOnFlower = false;
        this.restElapsed = 0;
        this.restDuration = 0;
        this.flowerSeekCooldown = 0;
        this.blockedFrames = 0;
        this.stuckFrames = 0;
        this.lastBlockedReason = 'none';
        this.lastMoveDelta = { x: 0, y: 0 };

        this.initializeVelocity();

        this.parent.particleSystem.addParticleMethodsToObject(this);
        this.addEffect('SPARKLE_SPRITE', {
            attachmentPoint: 'back',
            directionalDistance: Math.max(8, this.size.width * 0.18),
            followElevation: true,
            randomizePosition: true,
            randomizeFactor: 10,
            offsetY: this.size.height * 0.05
        });
    }

    shouldSimulateOffScreen() { return true; }

    initializeVelocity() {
        const startAngle = Math.random() * Math.PI * 2;
        this.velocity = {
            x: Math.cos(startAngle) * this.speed,
            y: Math.sin(startAngle) * this.speed
        };
    }

    getFlowerCandidates() {
        return (this.gameMap?.objects || []).filter(obj => {
            if (!obj || obj === this || obj.active === false) return false;
            const type = String(obj.type || '').toUpperCase();
            const variant = String(obj.variant || '').toLowerCase();
            const ctor = obj.constructor?.name || '';
            return type.includes('FLOWER') ||
                variant.includes('flower') ||
                ctor.includes('Flower');
        });
    }

    findNearbyFlower() {
        let best = null;
        let bestDistance = this.flowerSearchRadius;

        for (const flower of this.getFlowerCandidates()) {
            const target = this.getFlowerRestTarget(flower);
            if (!target || !this.canOccupyPosition(target.x, target.y)) {
                continue;
            }

            const distance = Math.hypot(
                (flower.posX + (flower.size?.width || 0) / 2) - (this.posX + this.size.width / 2),
                (flower.posY + (flower.size?.height || 0) / 2) - (this.posY + this.size.height / 2)
            );

            if (distance < bestDistance) {
                best = flower;
                bestDistance = distance;
            }
        }

        return best;
    }

    getFlowerRestTarget(flower) {
        if (!flower) return null;
        return {
            x: flower.posX + ((flower.size?.width || 0) - this.size.width) / 2,
            y: flower.posY + ((flower.size?.height || 0) - this.size.height) / 2
        };
    }

    beginFlowerRest(flower) {
        if (!flower) return false;

        const target = this.getFlowerRestTarget(flower);
        if (!target || !this.isPathToPositionClear(target.x, target.y)) {
            return false;
        }

        this.restingFlower = flower;
        this.isRestingOnFlower = false;
        this.restElapsed = 0;
        this.restDuration = this.flowerRestDurationMin +
            Math.random() * Math.max(1, this.flowerRestDurationMax - this.flowerRestDurationMin);
        this.flowerSeekCooldown = 0;
        this.isIdle = false;
        this.fluttering = false;
        return true;
    }

    clearFlowerRest() {
        this.restingFlower = null;
        this.isRestingOnFlower = false;
        this.restElapsed = 0;
        this.restDuration = 0;
        this.switchToMoving();
    }

    getRestingFlowerTarget() {
        return this.getFlowerRestTarget(this.restingFlower);
    }

    updateBehavior(tickDelta) {
        this.flowerSeekCooldown = Math.max(0, this.flowerSeekCooldown - tickDelta);

        if (this.restingFlower) {
            this.updateFlowerRestBehavior(tickDelta);
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

        if (this.flowerSeekCooldown <= 0 && Math.random() < this.flowerSeekChance) {
            const flower = this.findNearbyFlower();
            if (flower) {
                this.beginFlowerRest(flower);
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

    updateFlowerRestBehavior(tickDelta) {
        if (!this.restingFlower || this.restingFlower.active === false) {
            this.clearFlowerRest();
            return;
        }

        const target = this.getRestingFlowerTarget();
        if (!target) {
            this.clearFlowerRest();
            return;
        }

        const dx = target.x - this.posX;
        const dy = target.y - this.posY;
        const distance = Math.hypot(dx, dy);
        if (!this.isRestingOnFlower && !this.isPathToPositionClear(target.x, target.y)) {
            this.abandonFlowerRest('blocked flower path');
            return;
        }

        if (!this.isRestingOnFlower && distance > 6) {
            const approachSpeed = Math.max(0.3, this.speed * 0.8);
            this.velocity.x = (dx / Math.max(distance, 1)) * approachSpeed;
            this.velocity.y = (dy / Math.max(distance, 1)) * approachSpeed;
            this.updateDirection();
            return;
        }

        this.isRestingOnFlower = true;
        this.velocity.x = 0;
        this.velocity.y = 0;
        this.posX = target.x;
        this.posY = target.y;
        this.playAnimation('idle');

        this.restElapsed += tickDelta;
        if (this.restElapsed >= this.restDuration) {
            this.clearFlowerRest();
        }
    }

    abandonFlowerRest(reason = 'flower unavailable') {
        this.lastBlockedReason = reason;
        this.flowerSeekCooldown = 1200 + Math.random() * 1200;
        this.clearFlowerRest();
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

        if (!this.isIdle && !this.isRestingOnFlower) {
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
        if (distance <= 1) {
            return this.canOccupyPosition(targetX, targetY);
        }

        const steps = Math.max(1, Math.ceil(distance / stepSize));
        for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            const sampleX = this.posX + dx * t;
            const sampleY = this.posY + dy * t;
            if (!this.canOccupyPosition(sampleX, sampleY)) {
                return false;
            }
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
        this.flowerSeekCooldown = 1500 + Math.random() * 1500;
        if (this.restingFlower) {
            this.clearFlowerRest();
        }

        const safePosition = this.gameMap?.gridSystem?.findNearestValidPositionForEntity(
            this,
            this.posX,
            this.posY,
            6
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
        if (this.posX < this.bounds.left ||
            this.posX > this.bounds.right - this.size.width) {
            this.velocity.x *= -1;
            this.posX = Math.max(
                this.bounds.left,
                Math.min(this.bounds.right - this.size.width, this.posX)
            );
        }

        if (this.posY < this.bounds.top ||
            this.posY > this.bounds.bottom - this.size.height) {
            this.velocity.y *= -1;
            this.posY = Math.max(
                this.bounds.top,
                Math.min(this.bounds.bottom - this.size.height, this.posY)
            );
        }
    }

    updateFlightHeight() {
        if (this.isRestingOnFlower) {
            this.posZ = 4;
            return;
        }

        this.bobPhase += this.bobFrequency;
        this.posZ = this.hoverHeightBase + (Math.sin(this.bobPhase) * this.hoverVariance);
    }

    applyBobbing() {
        if (!this.animation?.sprite) return;
        this.animation.sprite.style.transform = `translateY(${-this.posZ}px)`;
    }

    render(container, parent) {
        const element = super.render(container, parent);
        element.classList.add('animated-map-object', 'butterfly');
        element.classList.add('interactive');

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
            if (this.restingFlower) {
                this.abandonFlowerRest('blocked by obstacle');
            }
            this.bounceAwayFromObstacle();
        }

        this.lastMoveDelta = { x: this.velocity.x, y: this.velocity.y };
        this.checkBoundaries();
        this.updateDirection();

        const movementAmount = Math.hypot(this.posX - this.renderState.posX, this.posY - this.renderState.posY);
        if (!this.isIdle && !this.isRestingOnFlower && movementAmount < 0.1 && Math.hypot(this.velocity.x, this.velocity.y) > 0.05) {
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
        super.update(deltaTime);
        this.updateFlightHeight();
        this.applyBobbing();
        this.updateShadowVisual();
        this.updateDebugAttributes();
    }

    updateDebugAttributes() {
        if (!this.element) return;
        this.element.setAttribute('data-idle', this.isIdle);
        this.element.setAttribute('data-hovering', this.isHovering);
        this.element.setAttribute('data-fluttering', this.fluttering);
        this.element.setAttribute('data-direction', this.direction);
        this.element.setAttribute('data-resting', this.isRestingOnFlower);
    }

    getSelectionDebugInfo() {
        const target = this.getRestingFlowerTarget();
        const velocityMagnitude = Math.hypot(this.velocity.x, this.velocity.y);
        return [
            {
                label: 'Butterfly State',
                value: this.isRestingOnFlower ? 'resting' :
                    this.restingFlower ? 'seeking flower' :
                    this.isIdle ? 'idle' :
                    this.isHovering ? 'hovering' : 'moving'
            },
            {
                label: 'Velocity',
                value: `(${this.velocity.x.toFixed(2)}, ${this.velocity.y.toFixed(2)}) @ ${velocityMagnitude.toFixed(2)}`
            },
            {
                label: 'Height',
                value: `${(this.posZ || 0).toFixed(1)}`
            },
            {
                label: 'Flower Target',
                value: target ? `(${target.x.toFixed(0)}, ${target.y.toFixed(0)})` : 'none'
            },
            {
                label: 'Blocked',
                value: `${this.blockedFrames} frames, reason: ${this.lastBlockedReason}`
            },
            {
                label: 'Cooldown',
                value: `${Math.ceil(this.flowerSeekCooldown)} ms`
            }
        ];
    }
}
