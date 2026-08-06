class ParticleConfigResolver {
    constructor() {
        this.presets = new Map();
    }

    register(name, config = {}) {
        if (!name) return;
        const key = String(name).toUpperCase();
        const nextConfig = ParticleDataUtils.clone(config);
        const existingConfig = this.presets.get(key) || null;

        // Allow a subsystem to override a shared preset by re-registering the same
        // key and "extending" that existing base definition.
        if (
            existingConfig &&
            typeof nextConfig.extends === 'string' &&
            String(nextConfig.extends).toUpperCase() === key
        ) {
            delete nextConfig.extends;
            this.presets.set(key, ParticleDataUtils.merge(existingConfig, nextConfig));
            return;
        }

        this.presets.set(key, nextConfig);
    }

    registerMany(presets = {}) {
        Object.entries(presets).forEach(([name, config]) => this.register(name, config));
    }

    has(name) {
        return this.presets.has(String(name).toUpperCase());
    }

    getRawPreset(name) {
        return this.presets.get(String(name).toUpperCase()) || null;
    }

    resolve(configOrPreset, overrides = {}) {
        let resolvedName = 'CUSTOM';
        let rawConfig = {};

        if (typeof configOrPreset === 'string') {
            resolvedName = String(configOrPreset).toUpperCase();
            rawConfig = this.resolvePresetByName(resolvedName);
        } else if (ParticleDataUtils.isPlainObject(configOrPreset)) {
            resolvedName = String(configOrPreset.name || configOrPreset.type || overrides.name || 'CUSTOM').toUpperCase();

            if (configOrPreset.preset && this.has(configOrPreset.preset)) {
                rawConfig = this.resolvePresetByName(configOrPreset.preset);
                rawConfig = ParticleDataUtils.merge(rawConfig, configOrPreset);
            } else if (configOrPreset.extends) {
                rawConfig = this.resolvePresetByName(configOrPreset.extends);
                rawConfig = ParticleDataUtils.merge(rawConfig, configOrPreset);
            } else {
                rawConfig = ParticleDataUtils.clone(configOrPreset);
            }
        }

        const merged = ParticleDataUtils.merge(rawConfig, overrides);
        return this.normalize(merged, resolvedName);
    }

    resolvePresetByName(name, visited = null) {
        const key = String(name).toUpperCase();
        const chain = visited || new Set();

        if (chain.has(key)) {
            throw new Error(`Circular particle preset inheritance detected: ${[...chain, key].join(' -> ')}`);
        }

        chain.add(key);

        const preset = this.getRawPreset(key);
        if (!preset) return {};

        if (preset.extends) {
            const base = this.resolvePresetByName(preset.extends, chain);
            chain.delete(key);
            return ParticleDataUtils.merge(base, preset);
        }

        chain.delete(key);
        return ParticleDataUtils.clone(preset);
    }

    normalize(effect = {}, fallbackName = 'CUSTOM') {
        const normalized = ParticleDataUtils.clone(effect);

        normalized.name = String(normalized.name || normalized.type || fallbackName || 'CUSTOM').toUpperCase();
        normalized.type = String(normalized.type || normalized.name || 'custom').toLowerCase();
        normalized.renderLayer = normalized.renderLayer || normalized.layerKey || 'default';
        normalized.className = normalized.className || normalized.particleClassName || '';
        normalized.debugLabel = normalized.debugLabel || normalized.name;
        normalized.tags = Array.isArray(normalized.tags) ? normalized.tags.slice() : [];

        normalized.count = Math.max(1, Math.round(ParticleDataUtils.toFiniteNumber(normalized.count, 1)));
        normalized.interval = Math.max(1, ParticleDataUtils.toFiniteNumber(normalized.interval, 100));
        normalized.cooldown = Math.max(0, ParticleDataUtils.toFiniteNumber(normalized.cooldown, 0));
        normalized.priority = ParticleDataUtils.toFiniteNumber(normalized.priority, 0);
        normalized.maxBursts = Number.isFinite(normalized.maxBursts) ? Math.max(0, normalized.maxBursts) : null;

        normalized.life = Math.max(1, ParticleDataUtils.toFiniteNumber(normalized.life, 500));
        normalized.lifeVariance = Math.max(0, ParticleDataUtils.toFiniteNumber(normalized.lifeVariance, normalized.lifeJitter || 0));
        normalized.size = Math.max(0.1, ParticleDataUtils.toFiniteNumber(normalized.size, 6));
        normalized.sizeEnd = Math.max(0.1, ParticleDataUtils.toFiniteNumber(
            normalized.sizeEnd,
            normalized.size
        ));
        normalized.sizeVariance = Math.max(0, ParticleDataUtils.toFiniteNumber(normalized.sizeVariance, 0));

        normalized.opacity = ParticleMath.clamp(ParticleDataUtils.toFiniteNumber(normalized.opacity, 1), 0, 1);
        normalized.opacityEnd = ParticleMath.clamp(ParticleDataUtils.toFiniteNumber(
            normalized.opacityEnd,
            normalized.opacity
        ), 0, 1);
        normalized.opacityVariance = Math.max(0, ParticleDataUtils.toFiniteNumber(normalized.opacityVariance, 0));

        normalized.gravity = ParticleDataUtils.toFiniteNumber(normalized.gravity, 0);
        normalized.wind = ParticleDataUtils.toFiniteNumber(normalized.wind, 0);
        normalized.friction = ParticleMath.clamp(
            ParticleDataUtils.toFiniteNumber(normalized.friction, 0.98),
            0,
            1
        );
        normalized.speed = ParticleDataUtils.toFiniteNumber(normalized.speed, 0);
        normalized.speedMin = Number.isFinite(normalized.speedMin) ? normalized.speedMin : normalized.speed;
        normalized.speedMax = Number.isFinite(normalized.speedMax) ? normalized.speedMax : normalized.speed;
        normalized.inheritVelocity = ParticleDataUtils.toFiniteNumber(normalized.inheritVelocity, 0);
        normalized.angle = Number.isFinite(normalized.angle) ? normalized.angle : null;
        normalized.angleMin = Number.isFinite(normalized.angleMin) ? normalized.angleMin : 0;
        normalized.angleMax = Number.isFinite(normalized.angleMax) ? normalized.angleMax : Math.PI * 2;

        normalized.vx = Number.isFinite(normalized.vx) ? normalized.vx : null;
        normalized.vy = Number.isFinite(normalized.vy) ? normalized.vy : null;
        normalized.rotation = ParticleDataUtils.toFiniteNumber(normalized.rotation, normalized.angleDegrees || 0);
        normalized.rotationSpeed = ParticleDataUtils.toFiniteNumber(normalized.rotationSpeed, 0);
        normalized.rotationVariance = Math.max(0, ParticleDataUtils.toFiniteNumber(normalized.rotationVariance, 0));
        normalized.scaleX = ParticleDataUtils.toFiniteNumber(normalized.scaleX, 1);
        normalized.scaleY = ParticleDataUtils.toFiniteNumber(normalized.scaleY, 1);
        normalized.borderRadius = normalized.borderRadius || '50%';

        normalized.useSprite = normalized.useSprite === true || !!normalized.sprite;
        normalized.sprite = normalized.sprite || normalized.spriteUrl || null;
        normalized.spriteFrames = Array.isArray(normalized.spriteFrames) ? normalized.spriteFrames.slice() : null;
        normalized.loop = normalized.loop !== false;
        normalized.frameDuration = Math.max(
            16,
            ParticleDataUtils.toFiniteNumber(
                normalized.frameDuration,
                Number.isFinite(normalized.frameDelay) ? normalized.frameDelay * 16 : 100
            )
        );
        normalized.spriteFrameWidth = Math.max(
            1,
            ParticleDataUtils.toFiniteNumber(normalized.spriteFrameWidth, normalized.size)
        );
        normalized.spriteFrameHeight = Math.max(
            1,
            ParticleDataUtils.toFiniteNumber(normalized.spriteFrameHeight, normalized.size)
        );

        normalized.color = normalized.color || '#ffffff';
        normalized.colors = Array.isArray(normalized.colors) && normalized.colors.length > 0
            ? normalized.colors.slice()
            : [normalized.color];

        normalized.randomizePosition = !!normalized.randomizePosition;
        normalized.randomizeFactor = Math.max(0, ParticleDataUtils.toFiniteNumber(normalized.randomizeFactor, 0));
        normalized.spreadX = Math.max(0, ParticleDataUtils.toFiniteNumber(normalized.spreadX, normalized.spread || 0));
        normalized.spreadY = Math.max(0, ParticleDataUtils.toFiniteNumber(normalized.spreadY, normalized.spread || 0));
        normalized.offsetX = ParticleDataUtils.toFiniteNumber(normalized.offsetX, 0);
        normalized.offsetY = ParticleDataUtils.toFiniteNumber(normalized.offsetY, 0);
        normalized.positionAtFeet = !!normalized.positionAtFeet;
        normalized.attachmentPoint = normalized.attachmentPoint || (normalized.positionAtFeet ? 'feet' : 'center');

        normalized.emissionMode = normalized.emissionMode ||
            (normalized.eventName ? 'event' : (normalized.oneShot || normalized.oneTimeEmission ? 'burst' : 'continuous'));
        normalized.oneShot = normalized.oneShot === true || normalized.oneTimeEmission === true;

        normalized.emitWhenMoving = !!normalized.emitWhenMoving;
        normalized.movementThreshold = Math.max(0, ParticleDataUtils.toFiniteNumber(normalized.movementThreshold, 0.5));
        normalized.emitWhileVisible = !!normalized.emitWhileVisible;
        normalized.emitWhileAirborne = !!normalized.emitWhileAirborne;
        normalized.emitWhileGrounded = !!normalized.emitWhileGrounded;
        normalized.emitWhileSelected = !!normalized.emitWhileSelected;
        normalized.emitWhileActive = !!normalized.emitWhileActive;
        normalized.emitWhileAlive = normalized.emitWhileAlive !== false;
        normalized.eventName = normalized.eventName || null;

        normalized.renderOffscreen = !!normalized.renderOffscreen;
        normalized.simulateOffscreen = normalized.simulateOffscreen !== false;
        normalized.cullMargin = Math.max(0, ParticleDataUtils.toFiniteNumber(normalized.cullMargin, 96));
        normalized.zIndexOffset = ParticleDataUtils.toFiniteNumber(normalized.zIndexOffset, 0);
        normalized.blendMode = normalized.blendMode || '';

        normalized.orbitalMotion = !!normalized.orbitalMotion;
        normalized.orbitalSpeed = ParticleDataUtils.toFiniteNumber(normalized.orbitalSpeed, 0.02);
        normalized.orbitalRadius = Math.max(0, ParticleDataUtils.toFiniteNumber(normalized.orbitalRadius, 20));
        normalized.orbitalRadiusVariance = Math.max(0, ParticleDataUtils.toFiniteNumber(normalized.orbitalRadiusVariance, 0));
        normalized.pulseEffect = !!normalized.pulseEffect;
        normalized.pulseFrequency = ParticleDataUtils.toFiniteNumber(normalized.pulseFrequency, 0.05);
        normalized.pulseAmplitude = ParticleDataUtils.toFiniteNumber(normalized.pulseAmplitude, 0.2);
        normalized.stretchByVelocity = !!normalized.stretchByVelocity;
        normalized.maxStretch = Math.max(1, ParticleDataUtils.toFiniteNumber(normalized.maxStretch, 2.5));

        normalized.wrapWithinBounds = !!normalized.wrapWithinBounds;
        normalized.bounceWithinBounds = !!normalized.bounceWithinBounds;
        normalized.respawnOnBoundsExit = !!normalized.respawnOnBoundsExit;
        normalized.accumulateAtBounds = !!normalized.accumulateAtBounds;
        normalized.boundPadding = Math.max(0, ParticleDataUtils.toFiniteNumber(normalized.boundPadding, 0));
        normalized.respawnEdge = normalized.respawnEdge || 'top';

        normalized.spawnOnDeath = normalized.spawnOnDeath || null;
        normalized.behaviorData = ParticleDataUtils.clone(normalized.behaviorData || normalized.behaviorProps || {});
        normalized.behaviors = Array.isArray(normalized.behaviors) && normalized.behaviors.length > 0
            ? normalized.behaviors.slice()
            : this.inferBehaviors(normalized);

        return normalized;
    }

    inferBehaviors(effect) {
        const behaviors = ['velocity'];

        if (effect.size !== effect.sizeEnd) {
            behaviors.push('scaleLife');
        }

        if (effect.opacity !== effect.opacityEnd) {
            behaviors.push('fadeLife');
        }

        if (effect.rotationSpeed !== 0) {
            behaviors.push('spin');
        }

        if (effect.type === 'smoke') {
            behaviors.push('smokeRise', 'wander');
        }

        if (effect.type === 'snow') {
            behaviors.push('sway');
        }

        if (effect.type === 'swarm') {
            behaviors.push('wander');
        }

        if (effect.orbitalMotion) {
            behaviors.push('orbit');
        }

        if (effect.pulseEffect) {
            behaviors.push('pulse');
        }

        if (effect.stretchByVelocity) {
            behaviors.push('stretchVelocity');
        }

        return [...new Set(behaviors)];
    }
}
