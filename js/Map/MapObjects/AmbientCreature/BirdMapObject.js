class BirdMapObject extends AmbientCreatureMapObject {
    constructor(parent, type, variant, posX, posY, config = {}, options = {}) {
        const mergedConfig = {
            targetSeekChance:      config.seedSeekChance      ?? 0.002,
            targetSearchRadius:    config.seedSearchRadius    ?? 280,
            targetRestDurationMin: config.seedRestDurationMin ?? 3000,
            targetRestDurationMax: config.seedRestDurationMax ?? 7000,
            hoverHeight:           config.hoverHeight         ?? 38,
            hoverVariance:         config.hoverVariance       ?? 7,
            ...config
        };

        super(parent, type, variant, posX, posY, mergedConfig, options);

        this.hoverHeightBase = this.hoverHeightBase || this.getConfig('hoverHeight', 38);

        this.flightSpeed = this.getConfig('flightSpeed', this.speed);
        this.groundSpeed = this.getConfig('groundSpeed', this.speed * 0.35);

        this.fleeRadius      = this.getConfig('fleeRadius', 210);
        this.fleeDistanceMin = this.getConfig('fleeDistanceMin', this.fleeRadius * 1.05);
        this.fleeDistanceMax = this.getConfig('fleeDistanceMax', this.fleeRadius * 2);
        this.fleeAltitude    = this.getConfig('fleeAltitude', this.hoverHeightBase * 1.8);
        this.fleeEdgeMargin  = this.getConfig('fleeEdgeMargin', 72);

        this.airborneElapsed     = 0;
        this.airborneMinDuration = this.getConfig('airborneMinDuration', 2200);
        this.airborneMaxDuration = this.getConfig('airborneMaxDuration', 7000);
        this.landingChanceBase   = this.getConfig('landingChanceBase', 0.0025);
        this.landingChanceMax    = this.getConfig('landingChanceMax', 0.012);
        this.takeoffChance       = this.getConfig('takeoffChance', 0.00008);

        this._turnRate    = 0.035 + Math.random() * 0.055;
        this._driftAmount = 0.003 + Math.random() * 0.008;

        this._flightAngle   = Math.random() * Math.PI * 2;
        this._targetAngle   = this._flightAngle;
        this._angleCooldown = Math.random() * 1500;

        this._flapDuration     = 320 + Math.random() * 320;
        this._glideDuration    = 600 + Math.random() * 1100;
        this._flightPhase      = Math.random() < 0.5 ? 'flap' : 'glide';
        this._flightPhaseTimer = Math.random() * this._glideDuration;

        this.bobPhase     = Math.random() * Math.PI * 2;
        this.bobFrequency = this.getConfig('bobFrequency', 0.026);

        this.mode = (options.startGrounded != null)
            ? (options.startGrounded ? 'grounded' : 'airborne')
            : (Math.random() < 0.7 ? 'grounded' : 'airborne');

        this.isFleeing      = false;
        this._fleeDest      = null;
        this._fleeTotalDist = 0;
        this._fleeStartZ    = 0;

        this._landDest       = null;
        this._landTotalDist  = 0;
        this._landingElapsed = 0;

        this._dbgVelOwner  = 'init';
        this._dbgFleeScore = 0;
        this._dbgDestValid = false;

        if (this.mode === 'grounded') {
            this._applyGroundedSpeed();
        } else {
            this._applyAirborneSpeed();
            this.velocity.x = Math.cos(this._flightAngle) * this.flightSpeed;
            this.velocity.y = Math.sin(this._flightAngle) * this.flightSpeed;
        }
    }

    canFlyThroughPosition(x, y) {
        return this._withinBounds(x, y, 8);
    }

    canLandAtPosition(x, y) {
        return this._withinBounds(x, y, 24) && super.canOccupyPosition(x, y);
    }

    canUseAsDestination(x, y) {
        return this._withinBounds(x, y, this.fleeEdgeMargin) && super.canOccupyPosition(x, y);
    }

    canOccupyPosition(x, y) {
        if (this.mode === 'airborne' || this.mode === 'landing') {
            return this.canFlyThroughPosition(x, y);
        }

        return super.canOccupyPosition(x, y);
    }

    updateFlightHeight() {
        let targetZ;

        if (this.isFleeing && this._fleeDest) {
            const dist = Math.hypot(this._fleeDest.x - this.posX, this._fleeDest.y - this.posY);
            const t = Math.max(0, Math.min(1, 1 - dist / Math.max(1, this._fleeTotalDist)));
            const startZ = Math.max(this._fleeStartZ, this.hoverHeightBase * 0.4);
            const endZ = this.hoverHeightBase;
            const baseZ = startZ + (endZ - startZ) * t;
            const arcZ = Math.sin(t * Math.PI) * Math.max(0, this.fleeAltitude - Math.max(startZ, endZ));

            targetZ = baseZ + arcZ;
        } else if (this.mode === 'landing' && this._landDest) {
            const dist = Math.hypot(this._landDest.x - this.posX, this._landDest.y - this.posY);
            const descentRadius = Math.max(this.hoverHeightBase * 2.2, 70);
            targetZ = this.hoverHeightBase * Math.max(0, Math.min(1, dist / descentRadius));
        } else if (this.mode === 'airborne') {
            const phaseOffset = this._flightPhase === 'flap' ? 3 : -2;
            targetZ = this.hoverHeightBase + phaseOffset + Math.sin(this.bobPhase) * (this.hoverVariance * 0.45);
        } else {
            targetZ = 0;
        }

        if (this.mode === 'airborne' || this.mode === 'landing') {
            this.bobPhase += this.bobFrequency;
        }

        const lerpRate = targetZ > this.posZ ? 0.045 : 0.05;
        this.posZ += (targetZ - this.posZ) * lerpRate;

        if (Math.abs(this.posZ - targetZ) < 0.12) {
            this.posZ = targetZ;
        }
    }

    getShadowConfig() {
        const explicit = this.getVisualValue('shadow', this.getConfig('shadow', null));
        if (explicit?.enabled) return explicit;
        const maxZ = Math.max(this.fleeAltitude || 0, this.hoverHeightBase + 1);
        return {
            enabled: true,
            widthRatio: 0.55,
            heightRatio: 0.14,
            anchorX: 0.5,
            anchorY: 0.88,
            maxOpacity: 0.45,
            minOpacity: 0.10,
            opacityFadeDistance: maxZ * 1.3,
            scaleFadeDistance: maxZ * 0.9,
            minScale: 0.6,
            blur: 2
        };
    }

    updateBehavior(tickDelta) {
        if (this.mode === 'airborne' || this.mode === 'landing') {
            this.airborneElapsed += tickDelta;
        }

        if (this._handleFlee()) return;

        if (this.mode === 'landing') {
            this._updateLandingBehavior(tickDelta);
            return;
        }

        if (this.mode === 'airborne') {
            this._updateAirborneBehavior(tickDelta);
            return;
        }

        this._updateGroundedBehavior(tickDelta);
    }

    updateHoverMoveBehavior(tickDelta) {
        this.isHovering = false;
        this.updateMovingMotion();
    }

    _updateAirborneBehavior(tickDelta) {
        this.isHovering = false;

        const shouldConsiderLanding = this.airborneElapsed > this.airborneMinDuration;
        const mustLandSoon = this.airborneElapsed > this.airborneMaxDuration;

        if (shouldConsiderLanding || mustLandSoon) {
            const overTime = Math.max(0, this.airborneElapsed - this.airborneMinDuration);
            const landChance = mustLandSoon
                ? this.landingChanceMax
                : Math.min(this.landingChanceMax, this.landingChanceBase + overTime * 0.000002);

            if (Math.random() < landChance) {
                if (this._attemptLand()) return;
            }
        }

        if (this.restingTarget) this.clearTargetRest();
        this._updateAirborneFlight(tickDelta);
    }

    _updateAirborneFlight(tickDelta) {
        this.isHovering = false;
        this._dbgVelOwner = 'airborne';

        this._flightPhaseTimer += tickDelta;

        const phaseDur = this._flightPhase === 'flap'
            ? this._flapDuration
            : this._glideDuration;

        if (this._flightPhaseTimer >= phaseDur) {
            this._flightPhaseTimer = 0;
            this._flightPhase = this._flightPhase === 'flap' ? 'glide' : 'flap';
        }

        this._angleCooldown -= tickDelta;

        if (this._angleCooldown <= 0) {
            this._angleCooldown = 900 + Math.random() * 2200;
            this._targetAngle = this._flightAngle + (Math.random() - 0.5) * 1.5;
        }

        this._turnToward(this._targetAngle, this._turnRate);
        this._flightAngle += (Math.random() - 0.5) * this._driftAmount;

        const phaseSpeed = this._flightPhase === 'flap'
            ? this.flightSpeed * 1.02
            : this.flightSpeed * 0.78;

        this.velocity.x = Math.cos(this._flightAngle) * phaseSpeed;
        this.velocity.y = Math.sin(this._flightAngle) * phaseSpeed;
    }

    _updateGroundedBehavior(tickDelta) {
        if (Math.random() < this.takeoffChance) {
            this._takeOff();
            return;
        }

        super.updateBehavior(tickDelta);
    }

    _attemptLand() {
        const dest = this._findLandingSpot();
        if (!dest) return false;

        this.mode = 'landing';
        this.isFleeing = false;
        this._fleeDest = null;

        this._landDest = dest;
        this._landTotalDist = Math.max(1, Math.hypot(dest.x - this.posX, dest.y - this.posY));
        this._landingElapsed = 0;
        this._dbgVelOwner = 'landing';

        return true;
    }

    _findLandingSpot() {
        const candidates = [];

        for (let i = 0; i < 20; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 20 + Math.random() * 120;
            const x = this.posX + Math.cos(angle) * dist;
            const y = this.posY + Math.sin(angle) * dist;

            if (!this.canLandAtPosition(x, y)) continue;

            const edgeDist = this._edgeDistance(x, y);
            const travelDist = Math.hypot(x - this.posX, y - this.posY);
            const score = edgeDist * 0.35 - travelDist * 0.15 + Math.random() * 20;

            candidates.push({ x, y, score });
        }

        if (candidates.length > 0) {
            candidates.sort((a, b) => b.score - a.score);
            return candidates[0];
        }

        if (this.canLandAtPosition(this.posX, this.posY)) {
            return { x: this.posX, y: this.posY, score: 0 };
        }

        return null;
    }

    _updateLandingBehavior(tickDelta) {
        if (!this._landDest) {
            this._completeLanding();
            return;
        }

        this._landingElapsed += tickDelta;

        if (this._landingElapsed > 7000) {
            this._takeOff();
            return;
        }

        const dx = this._landDest.x - this.posX;
        const dy = this._landDest.y - this.posY;
        const dist = Math.hypot(dx, dy);

        if (dist < 7) {
            this.velocity.x *= 0.6;
            this.velocity.y *= 0.6;

            if (this.posZ < 2.5) {
                this._completeLanding();
            }

            return;
        }

        const approachSpeed = Math.min(this.flightSpeed * 0.48, Math.max(0.25, dist * 0.1));
        const turnRate = dist < 45 ? 0.34 : 0.14;
        const destAngle = Math.atan2(dy, dx);

        this._turnToward(destAngle, turnRate);

        this.velocity.x = Math.cos(this._flightAngle) * approachSpeed;
        this.velocity.y = Math.sin(this._flightAngle) * approachSpeed;
        this._dbgVelOwner = 'landing';
    }

    _completeLanding() {
        this.mode = 'grounded';

        this._landDest = null;
        this._landTotalDist = 0;
        this._landingElapsed = 0;

        this.airborneElapsed = 0;
        this.posZ = 0;

        this.velocity.x = 0;
        this.velocity.y = 0;

        this._applyGroundedSpeed();

        this.isFleeing = false;
        this._fleeDest = null;

        if (this.restingTarget) this.clearTargetRest();

        this._dbgVelOwner = 'grounded';
    }

    _takeOff() {
        this.mode = 'airborne';
        this.airborneElapsed = 0;

        this._landDest = null;
        this._landTotalDist = 0;
        this._landingElapsed = 0;

        this._applyAirborneSpeed();

        if (this.restingTarget) this.clearTargetRest();

        const spd = Math.hypot(this.velocity.x, this.velocity.y);

        this._flightAngle = spd > 0.01
            ? Math.atan2(this.velocity.y, this.velocity.x)
            : Math.random() * Math.PI * 2;

        this._targetAngle = this._flightAngle;

        this.velocity.x = Math.cos(this._flightAngle) * this.flightSpeed * 0.65;
        this.velocity.y = Math.sin(this._flightAngle) * this.flightSpeed * 0.65;

        this._dbgVelOwner = 'takeOff';
    }

    _applyGroundedSpeed() {
        this.speed = this.groundSpeed;
    }

    _applyAirborneSpeed() {
        this.speed = this.flightSpeed;
    }

    _handleFlee() {
        if (this._fleeDest) {
            return this._flyToFleeDest();
        }

        return this._scanAndFlee();
    }

    _scanAndFlee() {
        let nearestMyte = null;
        let nearestDist = this.fleeRadius;

        for (const myte of this.mytes) {
            if (!myte?.isActive) continue;

            const dist = Math.hypot(myte.posX - this.posX, myte.posY - this.posY);

            if (dist < nearestDist) {
                nearestMyte = myte;
                nearestDist = dist;
            }
        }

        if (!nearestMyte) {
            this.isFleeing = false;
            return false;
        }

        const picked = this._pickFleeDest(nearestMyte);

        if (!picked) {
            this.isFleeing = false;
            return false;
        }

        this.isFleeing = true;

        if (this.mode === 'grounded' || this.mode === 'landing') {
            this._takeOff();
        }

        return this._flyToFleeDest();
    }

    _pickFleeDest(myte) {
        const dx = this.posX - myte.posX;
        const dy = this.posY - myte.posY;
        const baseAngle = Math.atan2(dy, dx);

        const mapW = (this.bounds.right || 1200) - (this.bounds.left || 0);
        const mapH = (this.bounds.bottom || 1200) - (this.bounds.top || 0);

        const maxInteriorDist = Math.min(mapW, mapH) * 0.32;
        const minDist = Math.min(this.fleeDistanceMin, maxInteriorDist);
        const maxDist = Math.min(this.fleeDistanceMax, maxInteriorDist);

        const offsets = [
            0,
            0.25, -0.25,
            0.5, -0.5,
            0.8, -0.8,
            1.1, -1.1,
            Math.PI * 0.5, -Math.PI * 0.5
        ];

        let best = null;
        let bestScore = -Infinity;

        for (let pass = 0; pass < 3; pass++) {
            const edgeMargin = pass === 0 ? this.fleeEdgeMargin : pass === 1 ? 42 : 24;
            const requireCollider = pass < 2;

            for (const offset of offsets) {
                for (let attempt = 0; attempt < 2; attempt++) {
                    const dist = minDist + Math.random() * Math.max(1, maxDist - minDist);
                    const jitter = (Math.random() - 0.5) * 0.22;
                    const angle = baseAngle + offset + jitter;

                    const x = this.posX + Math.cos(angle) * dist;
                    const y = this.posY + Math.sin(angle) * dist;

                    if (!this._withinBounds(x, y, edgeMargin)) continue;
                    if (requireCollider && !this.canUseAsDestination(x, y)) continue;

                    const score = this._scoreFleeDestination(x, y, myte);

                    if (score > bestScore) {
                        bestScore = score;
                        best = { x, y, score, valid: requireCollider };
                    }
                }
            }

            if (best) break;
        }

        if (!best) {
            this._dbgDestValid = false;
            return false;
        }

        this._dbgFleeScore = best.score ?? 0;
        this._dbgDestValid = !!best.valid;

        this._fleeDest = best;
        this._fleeTotalDist = Math.max(60, Math.hypot(best.x - this.posX, best.y - this.posY));
        this._fleeStartZ = this.posZ || 0;

        return true;
    }

    _scoreFleeDestination(x, y, myte) {
        const distFromMyte = Math.hypot(x - myte.posX, y - myte.posY);
        const travelDist = Math.hypot(x - this.posX, y - this.posY);
        const edgeDist = this._edgeDistance(x, y);

        const edgePenalty = Math.max(0, 1 - edgeDist / this.fleeEdgeMargin) * 180;
        const tooFarPenalty = Math.max(0, travelDist - this.fleeDistanceMax) * 0.35;

        return distFromMyte * 0.75
            + travelDist * 0.2
            + edgeDist * 0.25
            - edgePenalty
            - tooFarPenalty
            + Math.random() * 12;
    }

    _flyToFleeDest() {
        if (!this._fleeDest) return false;

        const dx = this._fleeDest.x - this.posX;
        const dy = this._fleeDest.y - this.posY;
        const dist = Math.hypot(dx, dy);

        if (dist < 28) {
            this._fleeDest = null;

            if (this._scanAndFlee()) {
                return true;
            }

            this.isFleeing = false;
            this._attemptLand();
            return false;
        }

        const destAngle = Math.atan2(dy, dx);
        const turnRate = dist < 80 ? 0.28 : 0.18;

        this._turnToward(destAngle, turnRate);

        const speedScale = dist < 80 ? Math.max(0.45, dist / 80) : 1;
        const fleeSpeed = this.flightSpeed * speedScale;

        this.velocity.x = Math.cos(this._flightAngle) * fleeSpeed;
        this.velocity.y = Math.sin(this._flightAngle) * fleeSpeed;

        this._dbgVelOwner = 'flee';

        return true;
    }

    recoverFromStuckState(reason = 'stuck') {
        if (this.mode === 'airborne' || this.mode === 'landing') {
            this.lastBlockedReason = reason;
            this.blockedFrames = 0;
            this.stuckFrames = 0;

            if (this.isFleeing) {
                this._fleeDest = null;
            } else if (this.mode === 'landing') {
                this._landDest = null;
                this.mode = 'airborne';
            }

            this._flightAngle += Math.PI * (0.5 + Math.random());
            this._targetAngle = this._flightAngle;

            return;
        }

        super.recoverFromStuckState(reason);
    }

    _turnToward(targetAngle, rate) {
        let da = targetAngle - this._flightAngle;

        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;

        this._flightAngle += da * rate;
    }

    _withinBounds(x, y, margin = 0) {
        const left = this.bounds.left ?? 0;
        const right = this.bounds.right ?? 1200;
        const top = this.bounds.top ?? 0;
        const bottom = this.bounds.bottom ?? 1200;

        return x >= left + margin
            && x <= right - margin
            && y >= top + margin
            && y <= bottom - margin;
    }

    _edgeDistance(x, y) {
        const left = this.bounds.left ?? 0;
        const right = this.bounds.right ?? 1200;
        const top = this.bounds.top ?? 0;
        const bottom = this.bounds.bottom ?? 1200;

        return Math.min(
            x - left,
            right - x,
            y - top,
            bottom - y
        );
    }

    findTarget() {
        if (this.mode !== 'grounded') return null;
        return this._findPeckingSpot();
    }

    _findPeckingSpot() {
        for (let i = 0; i < 10; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 20 + Math.random() * 70;
            const x = this.posX + Math.cos(angle) * dist;
            const y = this.posY + Math.sin(angle) * dist;

            if (this._withinBounds(x, y, 32) && this.canLandAtPosition(x, y)) {
                return {
                    posX: x,
                    posY: y,
                    size: {
                        width: this.size.width,
                        height: this.size.height
                    },
                    active: true,
                    isPeckSpot: true
                };
            }
        }

        return null;
    }

    getTargetRestPosition(target) {
        if (!target) return null;

        return {
            x: target.posX + ((target.size?.width || 0) - this.size.width) / 2,
            y: target.posY + ((target.size?.height || 0) - this.size.height) / 2
        };
    }

    onRestStart(target) {
        this.playAnimation('peck');
        target?.onPecked?.(this);
    }

    onRestEnd() {
        this.playAnimation('idle');
    }

    render(container, parent) {
        const element = super.render(container, parent);
        element.classList.add('bird', 'interactive');
        return element;
    }

    updateDebugAttributes() {
        super.updateDebugAttributes();
        this.element?.setAttribute('data-mode', this.mode);
        this.element?.setAttribute('data-phase', this._flightPhase || 'grounded');
    }

    getSelectionDebugInfo() {
        const target = this.getRestingTargetPosition();
        const speed = Math.hypot(this.velocity.x, this.velocity.y);

        let stateStr;

        if (this.isFleeing && this._fleeDest) {
            const d = Math.hypot(this._fleeDest.x - this.posX, this._fleeDest.y - this.posY);
            const t = Math.max(0, Math.min(1, 1 - d / Math.max(1, this._fleeTotalDist)));
            stateStr = `flee ${(t * 100).toFixed(0)}% z:${this.posZ.toFixed(0)}`;
        } else if (this.isFleeing) {
            stateStr = 'flee';
        } else if (this.mode === 'landing') {
            const d = this._landDest
                ? Math.hypot(this._landDest.x - this.posX, this._landDest.y - this.posY).toFixed(0)
                : '?';

            stateStr = `landing dist:${d} z:${this.posZ.toFixed(0)}`;
        } else if (this.mode === 'airborne') {
            stateStr = `${this._flightPhase} z:${this.posZ.toFixed(0)}`;
        } else if (this.isRestingOnTarget) {
            stateStr = 'pecking';
        } else if (this.restingTarget) {
            stateStr = 'seeking spot';
        } else if (this.isIdle) {
            stateStr = 'idle';
        } else {
            stateStr = 'walking';
        }

        const destStr = this._fleeDest
            ? `flee(${this._fleeDest.x.toFixed(0)},${this._fleeDest.y.toFixed(0)}) score:${this._dbgFleeScore.toFixed(0)}`
            : this._landDest
                ? `land(${this._landDest.x.toFixed(0)},${this._landDest.y.toFixed(0)})`
                : target
                    ? `spot(${target.x.toFixed(0)},${target.y.toFixed(0)})`
                    : 'none';

        return [
            { label: 'State',       value: stateStr },
            { label: 'Mode',        value: this.mode },
            { label: 'Velocity',    value: `(${this.velocity.x.toFixed(2)}, ${this.velocity.y.toFixed(2)}) @ ${speed.toFixed(2)}` },
            { label: 'Vel owner',   value: this._dbgVelOwner },
            { label: 'Height',      value: `${(this.posZ || 0).toFixed(1)}` },
            { label: 'Airborne',    value: `${Math.ceil(this.airborneElapsed)} / ${this.airborneMinDuration} ms` },
            { label: 'Dest',        value: destStr },
            { label: 'Dest valid',  value: `${this._dbgDestValid}` },
            { label: 'Flee radius', value: `${this.fleeRadius}` },
            { label: 'Blocked',     value: `${this.blockedFrames} frames, reason: ${this.lastBlockedReason}` }
        ];
    }
}