class ParticleEmitter {
    static nextId = 1;

    constructor(system, config = {}, options = {}) {
        this.system = system;
        this.id = `particle_emitter_${ParticleEmitter.nextId++}`;
        this.options = system.configResolver.resolve(config, options);
        this.active = true;
        this.enabled = options.enabled !== false;
        this.sourceObject = options.sourceObject || options.object || null;
        this.tracker = options.tracker || options.target || null;
        this.x = ParticleDataUtils.toFiniteNumber(options.x, this.tracker?.x || 0);
        this.y = ParticleDataUtils.toFiniteNumber(options.y, this.tracker?.y || 0);
        this.z = ParticleDataUtils.toFiniteNumber(options.z, this.tracker?.z || 0);
        this.lastX = this.x;
        this.lastY = this.y;
        this.dx = 0;
        this.dy = 0;
        this.speed = 0;
        this.elapsed = 0;
        this.cooldownRemaining = 0;
        this.pendingBursts = [];
        this.burstCount = 0;
        this.hasAutoBurstFired = false;
        this.cleanupCallbacks = new Set();
    }

    setEnabled(enabled = true) {
        this.enabled = !!enabled;
        return this;
    }

    setTracker(tracker) {
        this.tracker = tracker || null;
        return this;
    }

    setPosition(x = this.x, y = this.y, z = this.z) {
        this.x = ParticleDataUtils.toFiniteNumber(x, this.x);
        this.y = ParticleDataUtils.toFiniteNumber(y, this.y);
        this.z = ParticleDataUtils.toFiniteNumber(z, this.z);
        return this;
    }

    addCleanup(callback) {
        if (typeof callback === 'function') {
            this.cleanupCallbacks.add(callback);
        }
    }

    runCleanup() {
        this.cleanupCallbacks.forEach(callback => {
            try {
                callback();
            } catch (error) {
                console.warn('[ParticleEmitter] Cleanup callback failed:', error);
            }
        });
        this.cleanupCallbacks.clear();
    }

    requestBurst(request = {}) {
        this.pendingBursts.push({
            count: Math.max(1, Math.round(ParticleDataUtils.toFiniteNumber(request.count, this.options.count))),
            origin: request.origin || null,
            overrides: request.overrides || null
        });
        return this;
    }

    destroy() {
        this.active = false;
        this.runCleanup();
    }

    updateTracker() {
        this.lastX = this.x;
        this.lastY = this.y;

        if (this.tracker?.update) {
            this.tracker.update();
            this.x = ParticleDataUtils.toFiniteNumber(this.tracker.x, this.x);
            this.y = ParticleDataUtils.toFiniteNumber(this.tracker.y, this.y);
            this.z = ParticleDataUtils.toFiniteNumber(this.tracker.z, this.z);
            this.dx = ParticleDataUtils.toFiniteNumber(this.tracker.dx, this.x - this.lastX);
            this.dy = ParticleDataUtils.toFiniteNumber(this.tracker.dy, this.y - this.lastY);
            this.speed = ParticleDataUtils.toFiniteNumber(this.tracker.speed, Math.hypot(this.dx, this.dy));
            return;
        }

        this.dx = this.x - this.lastX;
        this.dy = this.y - this.lastY;
        this.speed = Math.hypot(this.dx, this.dy);
    }

    shouldDestroyWithSource() {
        if (!this.sourceObject) return false;

        if ('active' in this.sourceObject && this.sourceObject.active === false) {
            return true;
        }

        return false;
    }

    tickUpdate(tickDelta, effectsEnabled = true) {
        if (!this.active) return false;
        if (this.shouldDestroyWithSource()) {
            this.destroy();
            return false;
        }

        this.updateTracker();
        this.cooldownRemaining = Math.max(0, this.cooldownRemaining - tickDelta);
        this.elapsed += tickDelta;

        while (this.pendingBursts.length > 0) {
            const burstRequest = this.pendingBursts.shift();
            if (effectsEnabled) {
                this.emitBurst(burstRequest.count, burstRequest.origin, burstRequest.overrides);
            }
        }

        if (!effectsEnabled) {
            this.elapsed = 0;
            return true;
        }

        if (!this.enabled || !this.system.evaluateEmitterConditions(this)) {
            return true;
        }

        if (this.options.emissionMode === 'burst') {
            if (!this.hasAutoBurstFired) {
                this.emitBurst(this.options.count);
                this.hasAutoBurstFired = true;
                if (this.options.oneShot !== false) {
                    this.active = false;
                }
            }
            return this.active;
        }

        if (this.options.emissionMode === 'event' || this.options.emissionMode === 'manual') {
            return true;
        }

        while (this.elapsed >= this.options.interval) {
            this.elapsed -= this.options.interval;
            this.emitBurst(this.options.count);

            if (!this.active) {
                break;
            }
        }

        return this.active;
    }

    emitBurst(count, origin = null, overrides = null) {
        if (!this.active) return;
        if (this.cooldownRemaining > 0) return;

        this.cooldownRemaining = this.options.cooldown;
        this.burstCount++;

        if (this.options.maxBursts !== null && this.burstCount > this.options.maxBursts) {
            this.active = false;
            return;
        }

        this.system.spawnParticlesFromEmitter(this, count, origin, overrides);
    }
}
