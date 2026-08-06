class ParticleSystem {
    // Particle budget multipliers per Settings > Graphics quality level.
    static QUALITY_PARTICLE_SCALE = Object.freeze({
        low: 0.35,
        medium: 1,
        high: 1.5
    });

    static DEFAULT_PRESETS = Object.freeze({
        SPARKLE: {
            type: 'sparkle',
            emissionMode: 'burst',
            count: 1,
            life: 600,
            size: 5,
            sizeEnd: 1,
            opacity: 0.9,
            opacityEnd: 0,
            speedMin: 0.2,
            speedMax: 0.8,
            gravity: -0.01,
            friction: 0.95,
            colors: ['#ffffff', '#ffff99'],
            behaviors: ['velocity', 'scaleLife', 'fadeLife']
        },
        TRAIL: {
            type: 'trail',
            emissionMode: 'continuous',
            interval: 60,
            count: 2,
            life: 450,
            size: 6,
            sizeEnd: 1,
            opacity: 0.7,
            opacityEnd: 0,
            speedMin: 0.05,
            speedMax: 0.25,
            friction: 0.94,
            emitWhenMoving: true,
            movementThreshold: 0.2,
            colors: ['#ffcc00', '#ff9900', '#ff6600'],
            behaviors: ['velocity', 'scaleLife', 'fadeLife']
        },
        DUST: {
            extends: 'TRAIL',
            type: 'dust',
            interval: 100,
            size: 5,
            sizeEnd: 8,
            life: 550,
            gravity: -0.01,
            friction: 0.99,
            movementThreshold: 0.5,
            colors: ['#e0e0e0', '#d0d0d0', '#c0c0c0'],
            randomizePosition: true,
            randomizeFactor: 10
        },
        EMOTION: {
            type: 'emotion',
            emissionMode: 'burst',
            count: 1,
            life: 900,
            size: 15,
            sizeEnd: 8,
            opacity: 1,
            opacityEnd: 0,
            speedMin: 0.1,
            speedMax: 0.35,
            gravity: -0.05,
            offsetY: -30,
            colors: ['#ff5555'],
            behaviors: ['velocity', 'scaleLife', 'fadeLife']
        },
        AURA: {
            type: 'aura',
            emissionMode: 'continuous',
            interval: 120,
            count: 1,
            life: 650,
            size: 10,
            sizeEnd: 5,
            opacity: 0.6,
            opacityEnd: 0,
            speedMin: 0.05,
            speedMax: 0.2,
            randomizePosition: true,
            randomizeFactor: 15,
            colors: ['#7788ff', '#aabbff'],
            behaviors: ['velocity', 'scaleLife', 'fadeLife']
        },
        GLOW: {
            extends: 'AURA',
            type: 'glow',
            interval: 100,
            size: 8,
            sizeEnd: 4,
            life: 900,
            opacity: 0.5,
            colors: ['#ffffcc', '#ffff88', '#ffff44'],
            orbitalMotion: true,
            orbitalRadius: 20,
            orbitalRadiusVariance: 8,
            orbitalSpeed: 0.02,
            pulseEffect: true,
            pulseFrequency: 0.05,
            pulseAmplitude: 0.18,
            gravity: 0,
            friction: 1,
            behaviors: ['orbit', 'pulse', 'fadeLife', 'scaleLife']
        },
        SLIME: {
            type: 'slime',
            emissionMode: 'continuous',
            interval: 80,
            count: 1,
            life: 650,
            size: 3,
            sizeEnd: 4,
            opacity: 0.7,
            opacityEnd: 0.1,
            friction: 0.999,
            emitWhenMoving: true,
            movementThreshold: 0.1,
            colors: ['#a0e8c8', '#80d0b0'],
            behaviors: ['velocity', 'fadeLife', 'scaleLife']
        },
        RAIN: {
            type: 'rain',
            emissionMode: 'continuous',
            interval: 100,
            count: 10,
            life: 1000,
            size: 3,
            sizeEnd: 2,
            opacity: 0.75,
            opacityEnd: 0.35,
            vx: -1,
            speedMin: 10,
            speedMax: 15,
            gravity: 0.1,
            respawnOnBoundsExit: true,
            stretchByVelocity: true,
            colors: ['#a0c8ff'],
            behaviors: ['velocity', 'scaleLife', 'fadeLife', 'stretchVelocity']
        },
        SNOW: {
            type: 'snow',
            emissionMode: 'continuous',
            interval: 200,
            count: 10,
            life: 2400,
            size: 4,
            sizeEnd: 4,
            opacity: 0.8,
            opacityEnd: 0.6,
            speedMin: 0.8,
            speedMax: 1.5,
            gravity: 0.05,
            friction: 0.98,
            respawnOnBoundsExit: true,
            wrapWithinBounds: true,
            colors: ['#ffffff'],
            behaviors: ['velocity', 'fadeLife', 'sway', 'spin']
        },
        SMOKE: {
            type: 'smoke',
            emissionMode: 'continuous',
            interval: 200,
            count: 1,
            life: 1400,
            size: 15,
            sizeEnd: 40,
            opacity: 0.7,
            opacityEnd: 0,
            speedMin: 0.1,
            speedMax: 0.45,
            gravity: -0.05,
            friction: 0.99,
            colors: ['#bbbbbb', '#aaaaaa', '#999999'],
            behaviors: ['velocity', 'scaleLife', 'fadeLife', 'smokeRise', 'spin', 'wander']
        },
        MOTES: {
            type: 'motes',
            emissionMode: 'continuous',
            interval: 180,
            count: 1,
            life: 2200,
            lifeVariance: 400,
            size: 2.5,
            sizeEnd: 3.5,
            sizeVariance: 1,
            opacity: 0.35,
            opacityEnd: 0.05,
            speedMin: 0.02,
            speedMax: 0.08,
            gravity: -0.002,
            friction: 0.995,
            randomizePosition: true,
            randomizeFactor: 24,
            colors: ['#f7f1d3', '#fff7dd', '#f3ead0'],
            behaviors: ['velocity', 'fadeLife', 'sway', 'spin']
        },
        EMBER: {
            type: 'ember',
            emissionMode: 'continuous',
            interval: 90,
            count: 1,
            life: 950,
            lifeVariance: 180,
            size: 3,
            sizeEnd: 1,
            sizeVariance: 1,
            opacity: 0.9,
            opacityEnd: 0,
            speedMin: 0.15,
            speedMax: 0.6,
            gravity: -0.04,
            friction: 0.97,
            randomizePosition: true,
            randomizeFactor: 10,
            colors: ['#ffd27a', '#ff9e4a', '#ff6b2c', '#fff2b3'],
            behaviors: ['velocity', 'scaleLife', 'fadeLife', 'smokeRise', 'wander']
        },
        IMPACT_SPARK: {
            type: 'impact_spark',
            emissionMode: 'burst',
            count: 10,
            life: 260,
            lifeVariance: 80,
            size: 3,
            sizeEnd: 0.8,
            sizeVariance: 1,
            opacity: 1,
            opacityEnd: 0,
            speedMin: 1.4,
            speedMax: 3.8,
            angleMin: 0,
            angleMax: Math.PI * 2,
            gravity: 0.06,
            friction: 0.9,
            colors: ['#ffffff', '#ffe680', '#ffb347'],
            behaviors: ['velocity', 'scaleLife', 'fadeLife', 'stretchVelocity']
        },
        POLLEN: {
            type: 'pollen',
            emissionMode: 'continuous',
            interval: 220,
            count: 1,
            life: 2400,
            lifeVariance: 500,
            size: 3,
            sizeEnd: 2,
            sizeVariance: 1,
            opacity: 0.55,
            opacityEnd: 0.18,
            speedMin: 0.03,
            speedMax: 0.12,
            gravity: -0.001,
            friction: 0.997,
            randomizePosition: true,
            randomizeFactor: 18,
            colors: ['#f9ef8b', '#f7d96d', '#fff5bf'],
            behaviors: ['velocity', 'fadeLife', 'sway', 'wander']
        },
        BUBBLE: {
            type: 'bubble',
            emissionMode: 'continuous',
            interval: 180,
            count: 1,
            life: 1500,
            lifeVariance: 250,
            size: 6,
            sizeEnd: 9,
            sizeVariance: 2,
            opacity: 0.45,
            opacityEnd: 0,
            speedMin: 0.04,
            speedMax: 0.14,
            gravity: -0.03,
            friction: 0.99,
            randomizePosition: true,
            randomizeFactor: 8,
            colors: ['rgba(210, 245, 255, 0.95)', 'rgba(170, 225, 255, 0.9)', 'rgba(255, 255, 255, 0.85)'],
            behaviors: ['velocity', 'scaleLife', 'fadeLife', 'sway']
        },
        HEAL: {
            type: 'heal',
            emissionMode: 'burst',
            count: 8,
            life: 850,
            lifeVariance: 140,
            size: 8,
            sizeEnd: 2,
            sizeVariance: 2,
            opacity: 0.95,
            opacityEnd: 0,
            speedMin: 0.15,
            speedMax: 0.55,
            gravity: -0.03,
            friction: 0.96,
            offsetY: -12,
            colors: ['#9cf7c1', '#67e8f9', '#d8ffe9'],
            behaviors: ['velocity', 'scaleLife', 'fadeLife', 'pulse']
        },
        SWARM: {
            type: 'swarm',
            emissionMode: 'burst',
            count: 20,
            life: 2400,
            size: 3,
            sizeEnd: 2,
            opacity: 0.8,
            opacityEnd: 0.25,
            speedMin: 0.6,
            speedMax: 2.0,
            friction: 0.95,
            colors: ['#eeee22', '#ddcc11'],
            orbitalMotion: true,
            orbitalRadius: 24,
            orbitalRadiusVariance: 24,
            orbitalSpeed: 0.03,
            behaviors: ['velocity', 'fadeLife', 'scaleLife', 'wander', 'orbit']
        },
        FIREWORK_EXPLOSION: {
            type: 'firework_explosion',
            emissionMode: 'burst',
            count: 36,
            life: 850,
            size: 4,
            sizeEnd: 1,
            opacity: 1,
            opacityEnd: 0,
            speedMin: 2,
            speedMax: 5,
            gravity: 0.1,
            friction: 0.98,
            colors: ['#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff', '#ffffff'],
            behaviors: ['velocity', 'scaleLife', 'fadeLife']
        },
        FIREWORK: {
            type: 'firework',
            emissionMode: 'burst',
            count: 1,
            life: 900,
            size: 4,
            sizeEnd: 4,
            opacity: 1,
            opacityEnd: 0,
            color: '#ffcc00',
            vx: 0,
            vy: -4,
            gravity: 0.05,
            behaviors: ['velocity', 'fadeLife'],
            spawnOnDeath: {
                preset: 'FIREWORK_EXPLOSION'
            }
        }
    });

    constructor(parent, options = {}) {
        this.parent = parent;
        this.container = options.container || parent?.layers?.particles || parent?.container || null;
        this.maxParticles = Math.max(1, ParticleDataUtils.toFiniteNumber(options.maxParticles, 600));
        // Retained so quality changes scale from the configured budget rather than
        // compounding off whatever the previous quality level left behind.
        this.baseMaxParticles = this.maxParticles;
        this.effectsEnabled = options.effectsEnabled !== false;
        this.tickInterval = Math.max(
            1,
            ParticleDataUtils.toFiniteNumber(
                options.tickInterval,
                options.tickInterval || AppConfig.engine.tickInterval
            )
        );
        this.random = new ParticleRandom(options.randomFn || Math.random);
        this.configResolver = new ParticleConfigResolver();
        this.behaviors = new ParticleBehaviorRegistry();
        this.renderer = new ParticleRenderer(this, this.container);
        this.debug = new ParticleDebugSystem(this);
        this.running = false;
        this.particles = [];
        this.emitters = [];
        this.pendingBursts = [];
        this.timeSinceLastTick = 0;
        this.culledThisFrame = 0;
        this._particleId = 0;

        this.particlePool = new ParticlePool(
            () => new Particle(++this._particleId),
            {
                initialSize: Math.max(0, ParticleDataUtils.toFiniteNumber(options.poolSize, 160)),
                maxSize: this.maxParticles
            }
        );

        this.registerDefaultBehaviors();
        this.registerPresets(ParticleSystem.DEFAULT_PRESETS);

        if (options.presets) {
            this.registerPresets(options.presets);
        }
    }

    start() {
        this.running = true;
        return this;
    }

    stop() {
        this.running = false;
        return this;
    }

    isEffectsEnabled() {
        return this.effectsEnabled !== false;
    }

    /**
     * Scale the particle budget from the Settings > Graphics quality level.
     *
     * This is what makes that dropdown do something: it was persisted as
     * `graphicsQuality` and consumed nowhere. `maxParticles` is already enforced
     * in the spawn path, so scaling it is the whole mechanism.
     */
    setQualityLevel(level = 'medium') {
        const scale = ParticleSystem.QUALITY_PARTICLE_SCALE[String(level).toLowerCase()]
            ?? ParticleSystem.QUALITY_PARTICLE_SCALE.medium;
        const next = Math.max(1, Math.round(this.baseMaxParticles * scale));
        if (next === this.maxParticles) return this;

        this.maxParticles = next;
        // Trim immediately so lowering quality takes effect now, not once the
        // current crop of particles happens to expire. Oldest first, via the same
        // pooled release path everything else uses.
        while (this.particles.length > this.maxParticles) {
            this.releaseParticle(this.particles[0], 'quality');
        }
        this.debug.sync();
        return this;
    }

    setEffectsEnabled(enabled = true) {
        const nextEnabled = enabled !== false;
        if (this.effectsEnabled === nextEnabled) return this;

        this.effectsEnabled = nextEnabled;
        this.pendingBursts = [];

        for (const emitter of this.emitters) {
            emitter.pendingBursts = [];
            emitter.elapsed = 0;
        }

        if (!nextEnabled) {
            this.clearParticles();
            this.culledThisFrame = 0;
        }

        this.debug.sync();
        return this;
    }

    registerPresets(presets = {}) {
        this.configResolver.registerMany(presets);
    }

    registerDefaultBehaviors() {
        this.behaviors.register('velocity', {
            tick: (particle, tickDelta) => {
                const step = tickDelta / ParticleMath.FRAME_MS;

                particle.vy += particle.gravity * step;
                particle.vx += particle.wind * step;

                particle.x += particle.vx * step;
                particle.y += particle.vy * step;

                particle.vx *= Math.pow(particle.friction, step);
                particle.vy *= Math.pow(particle.friction, step);
            }
        });

        this.behaviors.register('scaleLife', {
            tick: (particle) => {
                particle.size = ParticleMath.lerp(particle.sizeStart, particle.sizeEnd, particle.lifeProgress);
            }
        });

        this.behaviors.register('fadeLife', {
            tick: (particle) => {
                particle.opacity = ParticleMath.lerp(particle.opacityStart, particle.opacityEnd, particle.lifeProgress);
            }
        });

        this.behaviors.register('spin', {
            tick: (particle, tickDelta) => {
                const step = tickDelta / ParticleMath.FRAME_MS;
                particle.rotation += particle.rotationSpeed * step;
            }
        });

        this.behaviors.register('smokeRise', {
            tick: (particle, tickDelta, system) => {
                const step = tickDelta / ParticleMath.FRAME_MS;
                const driftAmount = ParticleDataUtils.toFiniteNumber(particle.behaviorData.smokeDriftAmount, 0.08);
                const driftChance = ParticleDataUtils.toFiniteNumber(particle.behaviorData.smokeDriftChance, 0.08);

                particle.vy -= 0.02 * step;
                if (system.random.value() < driftChance) {
                    particle.vx += system.random.centered(driftAmount);
                }
            }
        });

        this.behaviors.register('sway', {
            tick: (particle, tickDelta) => {
                const amplitude = ParticleDataUtils.toFiniteNumber(particle.behaviorData.swayAmplitude, 0.03);
                const frequency = ParticleDataUtils.toFiniteNumber(particle.behaviorData.swayFrequency, 0.003);
                const step = tickDelta / ParticleMath.FRAME_MS;
                const phase = particle.behaviorData.swayPhase ??= Math.random() * Math.PI * 2;
                particle.vx += Math.sin((particle.ageMs * frequency) + phase) * amplitude * step;
            }
        });

        this.behaviors.register('wander', {
            tick: (particle, tickDelta, system) => {
                particle.behaviorData.wanderTimer = Math.max(
                    0,
                    ParticleDataUtils.toFiniteNumber(particle.behaviorData.wanderTimer, 0) - tickDelta
                );

                if (particle.behaviorData.wanderTimer > 0) return;

                particle.behaviorData.wanderTimer = ParticleDataUtils.toFiniteNumber(
                    particle.behaviorData.wanderInterval,
                    120
                );

                const impulse = ParticleDataUtils.toFiniteNumber(particle.behaviorData.wanderImpulse, 0.15);
                particle.vx += system.random.centered(impulse);
                particle.vy += system.random.centered(impulse);
            }
        });

        this.behaviors.register('orbit', {
            tick: (particle, tickDelta) => {
                const orbit = particle.behaviorData.orbit;
                if (!orbit) return;

                const anchorTracker = orbit.anchorTracker || particle.sourceEmitter?.tracker || null;
                const anchorX = ParticleDataUtils.toFiniteNumber(anchorTracker?.x, particle.x);
                const anchorY = ParticleDataUtils.toFiniteNumber(anchorTracker?.y, particle.y);
                const step = tickDelta / ParticleMath.FRAME_MS;

                orbit.angle += orbit.speed * step;
                particle.x = anchorX + Math.cos(orbit.angle) * orbit.radius;
                particle.y = anchorY + Math.sin(orbit.angle) * orbit.radius;
                particle.vx = 0;
                particle.vy = 0;
            }
        });

        this.behaviors.register('pulse', {
            tick: (particle) => {
                const frequency = ParticleDataUtils.toFiniteNumber(particle.config?.pulseFrequency, 0.05);
                const amplitude = ParticleDataUtils.toFiniteNumber(particle.config?.pulseAmplitude, 0.2);
                const pulse = 1 + (Math.sin(particle.ageMs * frequency) * amplitude);
                particle.scaleX = particle.baseScaleX * pulse;
                particle.scaleY = particle.baseScaleY * pulse;
            }
        });

        this.behaviors.register('stretchVelocity', {
            visual: (particle) => {
                const speed = Math.hypot(particle.vx, particle.vy);
                const stretch = ParticleMath.clamp(1 + (speed * 0.04), 1, particle.config?.maxStretch || 2.5);
                particle.renderScaleY *= stretch;
            }
        });
    }

    resolveEffectConfig(configOrPreset, overrides = {}) {
        return this.configResolver.resolve(configOrPreset, overrides);
    }

    createPointTracker(x = 0, y = 0, z = 0) {
        return new ParticlePointTracker(x, y, z);
    }

    getSimulationBounds() {
        if (typeof this.parent?.getWorldBounds === 'function') {
            return this.parent.getWorldBounds();
        }

        const rect = this.container?.getBoundingClientRect?.();
        if (!rect) {
            return {
                left: 0,
                top: 0,
                right: 0,
                bottom: 0,
                width: 0,
                height: 0
            };
        }

        return {
            left: 0,
            top: 0,
            right: rect.width,
            bottom: rect.height,
            width: rect.width,
            height: rect.height
        };
    }

    getViewportBounds() {
        return this.getSimulationBounds();
    }

    isPointVisible(x, y, margin = 0) {
        const bounds = this.getViewportBounds();
        if (!bounds) return true;

        return x >= bounds.left - margin &&
            x <= bounds.right + margin &&
            y >= bounds.top - margin &&
            y <= bounds.bottom + margin;
    }

    evaluateEmitterConditions(emitter) {
        const options = emitter?.options;
        if (!options) return true;

        if (options.emitWhenMoving && emitter.speed <= options.movementThreshold) {
            return false;
        }

        if (options.emitWhileVisible && !this.isPointVisible(emitter.x, emitter.y, options.cullMargin || 0)) {
            return false;
        }

        return true;
    }

    queueBurst(effectConfig, origin = {}, overrides = null) {
        if (!this.isEffectsEnabled()) return;

        this.pendingBursts.push({
            effectConfig,
            origin,
            overrides
        });
    }

    processPendingBursts() {
        if (!this.isEffectsEnabled()) {
            this.pendingBursts = [];
            return;
        }

        while (this.pendingBursts.length > 0) {
            const request = this.pendingBursts.shift();
            const resolved = this.resolveEffectConfig(request.effectConfig, request.overrides || {});
            this.spawnParticles(resolved, resolved.count, request.origin, null);
        }
    }

    acquireParticle() {
        let particle = this.particlePool.acquire();
        if (particle) return particle;

        if (this.particles.length === 0) return null;

        const recycled = this.particles[0];
        this.releaseParticle(recycled, 'recycled');
        this.debug.recordRecycle();
        return this.particlePool.acquire();
    }

    releaseParticle(particle, _reason = 'released') {
        if (!particle) return;

        const index = this.particles.indexOf(particle);
        if (index !== -1) {
            this.particles.splice(index, 1);
        }

        this.renderer.releaseParticle(particle);
        particle.reset();
        this.particlePool.release(particle);
    }

    handleParticleDeath(particle) {
        const onDeath = particle.config?.spawnOnDeath;
        if (onDeath) {
            const effectConfig = typeof onDeath === 'string'
                ? onDeath
                : (onDeath.preset || onDeath.effect || onDeath);
            const overrides = ParticleDataUtils.isPlainObject(onDeath)
                ? (onDeath.overrides || null)
                : null;

            this.queueBurst(effectConfig, {
                x: particle.x,
                y: particle.y,
                z: particle.z
            }, overrides);
        }

        particle.active = false;
    }

    buildSpawnState(config, origin = {}, emitter = null) {
        const tracker = emitter?.tracker || null;
        const speed = this.random.range(config.speedMin, config.speedMax);
        const angle = Number.isFinite(config.angle)
            ? config.angle
            : this.random.range(config.angleMin, config.angleMax);

        const baseX = ParticleDataUtils.toFiniteNumber(origin.x, emitter?.x || 0) + config.offsetX;
        const baseY = ParticleDataUtils.toFiniteNumber(origin.y, emitter?.y || 0) + config.offsetY;
        const baseZ = ParticleDataUtils.toFiniteNumber(origin.z, emitter?.z || 0);

        let x = baseX;
        let y = baseY;

        if (config.spreadX > 0) {
            x += this.random.centered(config.spreadX * 0.5);
        }

        if (config.spreadY > 0) {
            y += this.random.centered(config.spreadY * 0.5);
        }

        if (config.randomizePosition && config.randomizeFactor > 0) {
            x += this.random.centered(config.randomizeFactor);
            y += this.random.centered(config.randomizeFactor);
        }

        let orbitAngle = angle;
        let orbitRadius = config.orbitalRadius;
        if (config.orbitalMotion) {
            orbitAngle = this.random.range(0, Math.PI * 2);
            orbitRadius = Math.max(0, config.orbitalRadius + this.random.centered(config.orbitalRadiusVariance));
            x = baseX + Math.cos(orbitAngle) * orbitRadius;
            y = baseY + Math.sin(orbitAngle) * orbitRadius;
        }

        const size = Math.max(0.1, config.size + this.random.centered(config.sizeVariance));
        const opacity = ParticleMath.clamp(config.opacity + this.random.centered(config.opacityVariance), 0, 1);
        const rotationSpeed = config.rotationSpeed + this.random.centered(config.rotationVariance);
        const color = this.random.pick(config.colors, config.color);

        const trackerVelocityX = tracker ? ParticleDataUtils.toFiniteNumber(tracker.dx, 0) : 0;
        const trackerVelocityY = tracker ? ParticleDataUtils.toFiniteNumber(tracker.dy, 0) : 0;

        return {
            emitter,
            anchorTracker: tracker,
            x,
            y,
            z: baseZ,
            vx: Number.isFinite(config.vx)
                ? config.vx + (trackerVelocityX * config.inheritVelocity)
                : Math.cos(angle) * speed + (trackerVelocityX * config.inheritVelocity),
            vy: Number.isFinite(config.vy)
                ? config.vy + (trackerVelocityY * config.inheritVelocity)
                : Math.sin(angle) * speed + (trackerVelocityY * config.inheritVelocity),
            lifeMs: Math.max(1, config.life + this.random.centered(config.lifeVariance)),
            size,
            sizeEnd: config.sizeEnd,
            opacity,
            opacityEnd: config.opacityEnd,
            rotation: config.rotation,
            rotationSpeed,
            scaleX: config.scaleX,
            scaleY: config.scaleY,
            color,
            orbitAngle,
            orbitRadius
        };
    }

    spawnParticlesFromEmitter(emitter, count, origin = null, overrides = null) {
        if (!this.isEffectsEnabled()) return [];

        const effectConfig = this.resolveEffectConfig(emitter.options, overrides || {});
        const spawnOrigin = origin || {
            x: emitter.x,
            y: emitter.y,
            z: emitter.z
        };
        return this.spawnParticles(effectConfig, count, spawnOrigin, emitter);
    }

    spawnParticles(config, count, origin = {}, emitter = null) {
        if (!this.isEffectsEnabled()) return [];

        const created = [];
        const spawnCount = Math.max(1, Math.round(ParticleDataUtils.toFiniteNumber(count, config.count)));

        for (let i = 0; i < spawnCount; i++) {
            if (this.particles.length >= this.maxParticles && this.particles.length > 0) {
                this.releaseParticle(this.particles[0], 'capacity_recycle');
                this.debug.recordRecycle();
            }

            const particle = this.acquireParticle();
            if (!particle) break;

            const spawnState = this.buildSpawnState(config, origin, emitter);
            particle.activate(this, config, spawnState);
            this.particles.push(particle);
            created.push(particle);
            this.debug.recordSpawn();
        }

        return created;
    }

    createEmitter(configOrPreset, options = {}) {
        const emitter = new ParticleEmitter(this, configOrPreset, options);
        this.emitters.push(emitter);
        return emitter;
    }

    emit(effectConfig, x = 0, y = 0, options = {}) {
        const preset = typeof effectConfig === 'string' && this.configResolver.has(effectConfig)
            ? effectConfig
            : (typeof effectConfig === 'string' ? 'SPARKLE' : effectConfig);

        this.queueBurst(preset, {
            x,
            y,
            z: ParticleDataUtils.toFiniteNumber(options.z, 0)
        }, options);
    }

    spawnBurst(effectConfig, x = 0, y = 0, options = {}) {
        this.emit(effectConfig, x, y, {
            ...options,
            emissionMode: 'burst'
        });
    }

    addPollen(options = {}) {
        return this.createEmitter('POLLEN', options);
    }

    applyBoundsBehavior(particle) {
        const config = particle.config;
        const bounds = this.getSimulationBounds();
        if (!bounds) return;

        const padding = config.boundPadding || 0;
        const isOutsideHorizontal = particle.x < bounds.left - padding || particle.x > bounds.right + padding;
        const isOutsideVertical = particle.y < bounds.top - padding || particle.y > bounds.bottom + padding;

        if (config.wrapWithinBounds) {
            if (isOutsideHorizontal) {
                particle.x = particle.x < bounds.left ? bounds.right : bounds.left;
            }
            if (isOutsideVertical) {
                particle.y = particle.y < bounds.top ? bounds.bottom : bounds.top;
            }
        }

        if (config.bounceWithinBounds) {
            if (particle.x < bounds.left + padding || particle.x > bounds.right - padding) {
                particle.vx *= -1;
                particle.x = ParticleMath.clamp(particle.x, bounds.left + padding, bounds.right - padding);
            }
            if (particle.y < bounds.top + padding || particle.y > bounds.bottom - padding) {
                particle.vy *= -1;
                particle.y = ParticleMath.clamp(particle.y, bounds.top + padding, bounds.bottom - padding);
            }
        }

        if (config.accumulateAtBounds && particle.y >= bounds.bottom - padding) {
            particle.y = bounds.bottom - padding;
            particle.vx *= 0.5;
            particle.vy = 0;
        }

        if (config.respawnOnBoundsExit && (isOutsideHorizontal || isOutsideVertical)) {
            const horizontalRange = Math.max(1, bounds.right - bounds.left);
            switch (config.respawnEdge) {
                case 'left':
                    particle.x = bounds.left - padding;
                    particle.y = this.random.range(bounds.top, bounds.bottom);
                    break;
                case 'right':
                    particle.x = bounds.right + padding;
                    particle.y = this.random.range(bounds.top, bounds.bottom);
                    break;
                case 'bottom':
                    particle.x = this.random.range(bounds.left, bounds.right);
                    particle.y = bounds.bottom + padding;
                    break;
                case 'top':
                default:
                    particle.x = bounds.left + (this.random.value() * horizontalRange);
                    particle.y = bounds.top - padding;
                    break;
            }

            particle.ageMs = 0;
        }
    }

    tickUpdate(tickDelta) {
        if (!this.running) return;

        this.timeSinceLastTick = 0;
        this.debug.beginTick();
        this.processPendingBursts();

        for (let i = this.emitters.length - 1; i >= 0; i--) {
            const emitter = this.emitters[i];
            const stillActive = emitter.tickUpdate(tickDelta, this.isEffectsEnabled());
            if (!stillActive || !emitter.active) {
                emitter.runCleanup();
                this.emitters.splice(i, 1);
            }
        }

        if (!this.isEffectsEnabled()) {
            this.debug.setFrameCulledCount(0);
            this.debug.sync();
            return;
        }

        for (let i = this.particles.length - 1; i >= 0; i--) {
            const particle = this.particles[i];
            const stillActive = particle.tickUpdate(tickDelta, this);
            if (!stillActive || !particle.active) {
                this.releaseParticle(particle, 'expired');
            }
        }

        this.debug.sync();
    }

    update(deltaTime) {
        if (!this.running) return;

        if (!this.isEffectsEnabled()) {
            this.timeSinceLastTick = 0;
            this.culledThisFrame = 0;
            this.debug.setFrameCulledCount(0);
            this.debug.sync();
            return;
        }

        this.timeSinceLastTick = Math.min(this.tickInterval, this.timeSinceLastTick + deltaTime);
        const alpha = ParticleMath.clamp(this.timeSinceLastTick / this.tickInterval, 0, 1);

        this.culledThisFrame = this.renderer.flush(this.particles, alpha, deltaTime);
        this.debug.setFrameCulledCount(this.culledThisFrame);
        this.debug.sync();
    }

    clearParticles() {
        while (this.particles.length > 0) {
            this.releaseParticle(this.particles[0], 'clear');
        }
    }

    clear() {
        for (const emitter of this.emitters) {
            emitter.runCleanup();
        }
        this.emitters = [];
        this.pendingBursts = [];
        this.clearParticles();
    }

    getDebugStats() {
        return this.debug.snapshot();
    }

    dispose() {
        this.stop();
        this.clear();
        this.renderer.dispose();
        this.parent = null;
        this.container = null;
    }
}
