// ── PollinatorCreatureMapObject ──────────────────────────────────────────────
// Base for airborne creatures that carry pollen between flowers.
// Owns: bobbing flight height, pollen state, shared flower-finding.

class PollinatorCreatureMapObject extends AmbientCreatureMapObject {
    constructor(parent, type, variant, posX, posY, config = {}, options = {}) {
        super(parent, type, variant, posX, posY, config, options);
        this.bobPhase = Math.random() * Math.PI * 2;
        this.bobFrequency = options.bobFrequency || this.getConfig('bobFrequency', 0.05);
        this.hasPollen = false;
        this.pollenPayload = null;
    }

    // ── Flight height ────────────────────────────────────────────────────────

    updateFlightHeight() {
        if (this.isRestingOnTarget) {
            this.posZ = this.getConfig('restHeight', 4);
            return;
        }
        this.bobPhase += this.bobFrequency;
        this.posZ = this.hoverHeightBase + Math.sin(this.bobPhase) * this.hoverVariance;
    }

    // ── Pollen ───────────────────────────────────────────────────────────────

    isFlower(obj) {
        if (!obj) return false;
        const type = String(obj.type || '').toUpperCase();
        const variant = String(obj.variant || '').toLowerCase();
        const ctor = obj.constructor?.name || '';
        return type.includes('FLOWER') || variant.includes('flower') || ctor.includes('Flower');
    }

    onRestStart(target) {
        if (!this.isFlower(target)) return;
        if (this.hasPollen) {
            target.receivePollen?.(this.pollenPayload);
            this.hasPollen = false;
            this.pollenPayload = null;
        } else if (target.genes) {
            this.hasPollen = true;
            this.pollenPayload = { source: target, genes: { ...target.genes } };
        }
    }

    // ── Target finding ───────────────────────────────────────────────────────

    findTarget() {
        return this._findNearestFlower();
    }

    _findNearestFlower() {
        let best = null;
        let bestDistance = this.targetSearchRadius;
        const objects = this.gameMap?.objects || [];

        for (const obj of objects) {
            if (!obj || obj === this || obj.active === false) continue;
            if (!this.isFlower(obj)) continue;
            if (obj.config?.deflowered || obj.getConfig?.('deflowered')) continue;

            const claimed = objects.some(other =>
                other !== this &&
                other instanceof PollinatorCreatureMapObject &&
                other.restingTarget === obj
            );
            if (claimed) continue;

            const pos = this.getTargetRestPosition(obj);
            if (!pos || !this.canOccupyPosition(pos.x, pos.y)) continue;

            const distance = Math.hypot(
                (obj.posX + (obj.size?.width || 0) / 2) - (this.posX + this.size.width / 2),
                (obj.posY + (obj.size?.height || 0) / 2) - (this.posY + this.size.height / 2)
            );
            if (distance < bestDistance) {
                best = obj;
                bestDistance = distance;
            }
        }
        return best;
    }

    getTargetRestPosition(target) {
        if (!target) return null;
        return {
            x: target.posX + ((target.size?.width || 0) - this.size.width) / 2,
            y: target.posY + ((target.size?.height || 0) - this.size.height) / 2
        };
    }
}


// ── ButterflyMapObject ────────────────────────────────────────────────────────

class ButterflyMapObject extends PollinatorCreatureMapObject {
    constructor(parent, type, variant, posX, posY, config = {}, options = {}) {
        const mergedConfig = {
            targetSeekChance: config.flowerSeekChance ?? 0.003,
            targetSearchRadius: config.flowerSearchRadius ?? 320,
            targetRestDurationMin: config.flowerRestDurationMin ?? 2200,
            targetRestDurationMax: config.flowerRestDurationMax ?? 5200,
            ...config
        };
        super(parent, type, variant, posX, posY, mergedConfig, options);
        this.flutterSoundCooldown = 300 + Math.random() * 300;

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

    render(container, parent) {
        const element = super.render(container, parent);
        element.classList.add('butterfly', 'interactive');
        return element;
    }

    tickUpdate(tickDelta) {
        const wasRestingOnTarget = this.isRestingOnTarget;
        super.tickUpdate(tickDelta);

        this.flutterSoundCooldown = Math.max(0, this.flutterSoundCooldown - tickDelta);
        const currentSpeed = Math.hypot(this.velocity.x, this.velocity.y);
        const soundManager = this.gameMap?.soundManager;
        if (!soundManager) return;

        if (!wasRestingOnTarget && this.isRestingOnTarget) {
            soundManager.play('obj_butterfly_land', { volume: 0.5 });
        } else if (!this.isIdle && !this.isRestingOnTarget && currentSpeed > 0.18 && this.flutterSoundCooldown <= 0) {
            soundManager.play('obj_butterfly_flutter', {
                volume: Utility.clamp(0.38 + (currentSpeed / Math.max(this.speed, 0.01)) * 0.14, 0.36, 0.56)
            });
            this.flutterSoundCooldown = 520 + Math.random() * 420;
        }
    }

    getSelectionDebugInfo() {
        const target = this.getRestingTargetPosition();
        const velocityMagnitude = Math.hypot(this.velocity.x, this.velocity.y);
        return [
            {
                label: 'State',
                value: this.isRestingOnTarget ? 'resting' :
                    this.restingTarget ? 'seeking flower' :
                    this.isIdle ? 'idle' :
                    this.isHovering ? 'hovering' : 'moving'
            },
            { label: 'Pollen', value: this.hasPollen ? 'carrying' : 'none' },
            { label: 'Velocity', value: `(${this.velocity.x.toFixed(2)}, ${this.velocity.y.toFixed(2)}) @ ${velocityMagnitude.toFixed(2)}` },
            { label: 'Height', value: `${(this.posZ || 0).toFixed(1)}` },
            { label: 'Target', value: target ? `(${target.x.toFixed(0)}, ${target.y.toFixed(0)})` : 'none' },
            { label: 'Blocked', value: `${this.blockedFrames} frames, reason: ${this.lastBlockedReason}` },
            { label: 'Cooldown', value: `${Math.ceil(this.seekCooldown)} ms` }
        ];
    }
}


// ── BeeMapObject ─────────────────────────────────────────────────────────────

class BeeMapObject extends PollinatorCreatureMapObject {
    constructor(parent, type, variant, posX, posY, config = {}, options = {}) {
        const mergedConfig = {
            targetSeekChance: config.flowerSeekChance ?? 0.004,
            targetSearchRadius: config.flowerSearchRadius ?? 400,
            targetRestDurationMin: config.flowerRestDurationMin ?? 1200,
            targetRestDurationMax: config.flowerRestDurationMax ?? 2800,
            ...config
        };
        super(parent, type, variant, posX, posY, mergedConfig, options);
        this.phase = 'foraging'; // 'foraging' | 'returning'
        this.homeHive = options.homeHive || null;
        this.buzzSoundCooldown = 300 + Math.random() * 400;

        if (this.homeHive) this.homeHive.registerBee(this);
    }

    // ── Minecraft-inspired gating ────────────────────────────────────────────

    // Override to gate on time-of-day, weather, etc.
    shouldLeaveHive() {
        return true;
    }

    // ── Target finding ───────────────────────────────────────────────────────

    findTarget() {
        if (this.phase === 'returning') {
            if (this.homeHive?.active !== false) return this.homeHive;
            this.phase = 'foraging';
        }
        if (!this.shouldLeaveHive()) return null;
        return this._findNearestFlower();
    }

    getTargetRestPosition(target) {
        if (!target) return null;
        return {
            x: target.posX + ((target.size?.width || 0) - this.size.width) / 2,
            y: target.posY + ((target.size?.height || 0) - this.size.height) / 2
        };
    }

    // ── Rest hooks ───────────────────────────────────────────────────────────

    onRestStart(target) {
        if (this._isHive(target)) {
            target.addPollen(this.pollenPayload);
            this.hasPollen = false;
            this.pollenPayload = null;
            return;
        }
        super.onRestStart(target); // handles pollen pickup/deposit on flowers
    }

    onRestEnd(target) {
        if (this.isFlower(target) && this.hasPollen) {
            this.phase = 'returning';
        } else if (this._isHive(target)) {
            this.phase = 'foraging';
        }
    }

    _isHive(obj) {
        return obj instanceof HiveMapObject;
    }

    // ── Rendering & sound ────────────────────────────────────────────────────

    render(container, parent) {
        const element = super.render(container, parent);
        element.classList.add('bee', 'interactive');
        return element;
    }

    tickUpdate(tickDelta) {
        const wasRestingOnTarget = this.isRestingOnTarget;
        super.tickUpdate(tickDelta);

        this.buzzSoundCooldown = Math.max(0, this.buzzSoundCooldown - tickDelta);
        const currentSpeed = Math.hypot(this.velocity.x, this.velocity.y);
        const soundManager = this.gameMap?.soundManager;
        if (!soundManager) return;

        if (!wasRestingOnTarget && this.isRestingOnTarget) {
            soundManager.play('obj_bee_land', { volume: 0.4 });
        } else if (!this.isIdle && !this.isRestingOnTarget && currentSpeed > 0.18 && this.buzzSoundCooldown <= 0) {
            soundManager.play('obj_bee_buzz', {
                volume: Utility.clamp(0.3 + (currentSpeed / Math.max(this.speed, 0.01)) * 0.12, 0.28, 0.48)
            });
            this.buzzSoundCooldown = 600 + Math.random() * 500;
        }
    }

    getSelectionDebugInfo() {
        const target = this.getRestingTargetPosition();
        const velocityMagnitude = Math.hypot(this.velocity.x, this.velocity.y);
        return [
            {
                label: 'State',
                value: this.isRestingOnTarget
                    ? (this._isHive(this.restingTarget) ? 'at hive' : 'on flower')
                    : this.restingTarget ? `seeking ${this.phase === 'returning' ? 'hive' : 'flower'}`
                    : this.isIdle ? 'idle' : this.isHovering ? 'hovering' : 'moving'
            },
            { label: 'Phase', value: this.phase },
            { label: 'Pollen', value: this.hasPollen ? 'carrying' : 'none' },
            { label: 'Velocity', value: `(${this.velocity.x.toFixed(2)}, ${this.velocity.y.toFixed(2)}) @ ${velocityMagnitude.toFixed(2)}` },
            { label: 'Height', value: `${(this.posZ || 0).toFixed(1)}` },
            { label: 'Target', value: target ? `(${target.x.toFixed(0)}, ${target.y.toFixed(0)})` : 'none' },
            { label: 'Hive', value: this.homeHive ? `(${this.homeHive.posX.toFixed(0)}, ${this.homeHive.posY.toFixed(0)})` : 'none' },
            { label: 'Blocked', value: `${this.blockedFrames} frames, reason: ${this.lastBlockedReason}` },
            { label: 'Cooldown', value: `${Math.ceil(this.seekCooldown)} ms` }
        ];
    }
}
