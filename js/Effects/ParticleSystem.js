// Thin aliases over the shared Utility helpers — kept so particle code reads
// in its own vocabulary, but with a single implementation underneath.
class ParticleMath {
    static FRAME_MS = 1000 / 60;

    static clamp(value, min, max) {
        return Utility.clamp(value, min, max);
    }

    static lerp(start, end, amount) {
        return Utility.lerp(start, end, amount);
    }

    static inverseLerp(start, end, value) {
        return Utility.inverseLerp(start, end, value);
    }

    static wrap(value, min, max) {
        return Utility.wrap(value, min, max);
    }
}

class ParticleDataUtils {
    static isPlainObject(value) {
        return Utility.isPlainObject(value);
    }

    static clone(value) {
        return Utility.deepClone(value);
    }

    static merge(base, extra) {
        if (Array.isArray(extra)) {
            return extra.map(entry => ParticleDataUtils.clone(entry));
        }

        if (!ParticleDataUtils.isPlainObject(base) || !ParticleDataUtils.isPlainObject(extra)) {
            return ParticleDataUtils.clone(extra !== undefined ? extra : base);
        }

        const merged = {};
        const keys = new Set([...Object.keys(base), ...Object.keys(extra)]);

        keys.forEach(key => {
            if (!(key in extra)) {
                merged[key] = ParticleDataUtils.clone(base[key]);
                return;
            }

            if (!(key in base)) {
                merged[key] = ParticleDataUtils.clone(extra[key]);
                return;
            }

            const baseValue = base[key];
            const extraValue = extra[key];

            if (ParticleDataUtils.isPlainObject(baseValue) && ParticleDataUtils.isPlainObject(extraValue)) {
                merged[key] = ParticleDataUtils.merge(baseValue, extraValue);
                return;
            }

            if (Array.isArray(extraValue)) {
                merged[key] = extraValue.map(entry => ParticleDataUtils.clone(entry));
                return;
            }

            merged[key] = ParticleDataUtils.clone(extraValue);
        });

        return merged;
    }

    static toFiniteNumber(value, fallback = 0) {
        return Number.isFinite(value) ? value : fallback;
    }
}

class ParticleRandom {
    constructor(randomFn = Math.random) {
        this.randomFn = typeof randomFn === 'function' ? randomFn : Math.random;
    }

    value() {
        return this.randomFn();
    }

    range(min, max) {
        if (!Number.isFinite(min) && !Number.isFinite(max)) return 0;
        if (!Number.isFinite(max)) return min;
        if (!Number.isFinite(min)) return max;
        return min + (max - min) * this.value();
    }

    centered(amount) {
        if (!Number.isFinite(amount) || amount === 0) return 0;
        return (this.value() - 0.5) * amount * 2;
    }

    pick(list, fallback = null) {
        if (!Array.isArray(list) || list.length === 0) return fallback;
        return list[Math.floor(this.value() * list.length)] ?? fallback;
    }
}

class ParticlePool {
    constructor(factory, options = {}) {
        this.factory = factory;
        this.items = [];
        this.totalCreated = 0;
        this.maxSize = Number.isFinite(options.maxSize) ? options.maxSize : Infinity;

        const initialSize = Number.isFinite(options.initialSize) ? options.initialSize : 0;
        for (let i = 0; i < initialSize; i++) {
            const item = this.factory();
            this.items.push(item);
            this.totalCreated++;
        }
    }

    acquire() {
        if (this.items.length > 0) {
            return this.items.pop();
        }

        if (this.totalCreated >= this.maxSize) {
            return null;
        }

        this.totalCreated++;
        return this.factory();
    }

    release(item) {
        if (!item) return;
        this.items.push(item);
    }

    availableCount() {
        return this.items.length;
    }

    clear(disposer = null) {
        if (typeof disposer === 'function') {
            this.items.forEach(disposer);
        }
        this.items = [];
    }
}

class ParticlePointTracker {
    constructor(x = 0, y = 0, z = 0) {
        this.x = x;
        this.y = y;
        this.z = z;
        this.lastX = x;
        this.lastY = y;
        this.dx = 0;
        this.dy = 0;
        this.speed = 0;
        this.active = true;
        this.visible = true;
    }

    setPosition(x = this.x, y = this.y, z = this.z) {
        this.x = ParticleDataUtils.toFiniteNumber(x, this.x);
        this.y = ParticleDataUtils.toFiniteNumber(y, this.y);
        this.z = ParticleDataUtils.toFiniteNumber(z, this.z);
        return this;
    }

    update() {
        this.dx = this.x - this.lastX;
        this.dy = this.y - this.lastY;
        this.speed = Math.hypot(this.dx, this.dy);
        this.lastX = this.x;
        this.lastY = this.y;
        return this;
    }
}

class ParticleRendererPool {
    constructor() {
        this.pool = [];
    }

    createView() {
        const element = document.createElement('div');
        element.className = 'particle';
        element.style.position = 'absolute';
        element.style.left = '0';
        element.style.top = '0';
        element.style.pointerEvents = 'none';
        element.style.transformOrigin = 'center center';
        element.style.willChange = 'transform, opacity';
        element.style.backgroundRepeat = 'no-repeat';

        return {
            element,
            layerKey: '',
            last: {
                transform: '',
                opacity: '',
                width: '',
                height: '',
                backgroundImage: '',
                backgroundPosition: '',
                backgroundSize: '',
                backgroundColor: '',
                borderRadius: '',
                zIndex: '',
                visibility: '',
                display: '',
                mixBlendMode: '',
                className: ''
            }
        };
    }

    acquire() {
        return this.pool.pop() || this.createView();
    }

    release(view) {
        if (!view) return;
        view.layerKey = '';
        view.element.remove();
        view.last = {
            transform: '',
            opacity: '',
            width: '',
            height: '',
            backgroundImage: '',
            backgroundPosition: '',
            backgroundSize: '',
            backgroundColor: '',
            borderRadius: '',
            zIndex: '',
            visibility: '',
            display: '',
            mixBlendMode: '',
            className: ''
        };
        view.element.className = 'particle';
        this.pool.push(view);
    }

    clear() {
        this.pool.forEach(view => view.element.remove());
        this.pool = [];
    }
}

class ParticleRenderer {
    static LAYER_Z_INDEX = Object.freeze({
        background: 0,
        ground: 5,
        default: 10,
        object: 15,
        overlay: 20,
        debug: 999
    });

    constructor(system, container = null) {
        this.system = system;
        this.container = container;
        this.layerContainers = new Map();
        this.viewPool = new ParticleRendererPool();
        this.viewsByParticleId = new Map();
        this.stats = {
            boundViews: 0,
            domWrites: 0
        };
    }

    setContainer(container) {
        if (container === this.container) return;

        this.container = container;
        this.layerContainers.forEach(layer => layer.remove());
        this.layerContainers.clear();

        this.viewsByParticleId.forEach(view => {
            view.layerKey = '';
            view.element.remove();
            view.last.layerKey = '';
        });
    }

    getLayerZIndex(layerKey) {
        return ParticleRenderer.LAYER_Z_INDEX[layerKey] ?? ParticleRenderer.LAYER_Z_INDEX.default;
    }

    ensureLayerContainer(layerKey = 'default') {
        if (!this.container) return null;

        const normalizedKey = layerKey || 'default';
        if (this.layerContainers.has(normalizedKey)) {
            return this.layerContainers.get(normalizedKey);
        }

        const layer = document.createElement('div');
        layer.className = `particle-layer particle-layer--${normalizedKey}`;
        layer.style.position = 'absolute';
        layer.style.left = '0';
        layer.style.top = '0';
        layer.style.width = '100%';
        layer.style.height = '100%';
        layer.style.pointerEvents = 'none';
        layer.style.overflow = 'visible';
        layer.style.zIndex = String(this.getLayerZIndex(normalizedKey));

        this.container.appendChild(layer);
        this.layerContainers.set(normalizedKey, layer);
        return layer;
    }

    bindParticle(particle) {
        if (!particle?.id) return null;

        let view = this.viewsByParticleId.get(particle.id);
        if (view) return view;

        view = this.viewPool.acquire();
        this.viewsByParticleId.set(particle.id, view);
        this.stats.boundViews = this.viewsByParticleId.size;
        return view;
    }

    releaseParticle(particle) {
        if (!particle?.id) return;

        const view = this.viewsByParticleId.get(particle.id);
        if (!view) return;

        this.viewsByParticleId.delete(particle.id);
        this.viewPool.release(view);
        this.stats.boundViews = this.viewsByParticleId.size;
    }

    flush(particles, alpha = 1, deltaTime = 0) {
        this.stats.domWrites = 0;
        let culled = 0;

        for (const particle of particles) {
            if (!particle?.active) continue;

            const view = this.bindParticle(particle);
            if (!view) continue;

            particle.updateVisual(deltaTime, alpha, this.system);
            this.flushParticle(particle, view);
            if (!particle.renderVisible) culled++;
        }

        return culled;
    }

    flushParticle(particle, view) {
        const layerKey = particle.renderLayer || 'default';
        const layer = this.ensureLayerContainer(layerKey);
        if (!layer) return;

        if (view.layerKey !== layerKey || view.element.parentNode !== layer) {
            layer.appendChild(view.element);
            view.layerKey = layerKey;
        }

        const style = view.element.style;
        const className = particle.renderClassName || 'particle';
        if (view.last.className !== className) {
            view.element.className = className;
            view.last.className = className;
        }

        const display = particle.renderVisible ? '' : 'none';
        if (view.last.display !== display) {
            style.display = display;
            view.last.display = display;
            this.stats.domWrites++;
        }

        if (!particle.renderVisible) return;

        const transform = [
            `translate3d(${(particle.renderX - (particle.renderWidth * 0.5)).toFixed(2)}px, ${(particle.renderY - (particle.renderHeight * 0.5)).toFixed(2)}px, 0)`,
            `rotate(${particle.renderRotation.toFixed(2)}deg)`,
            `scale(${particle.renderScaleX.toFixed(3)}, ${particle.renderScaleY.toFixed(3)})`
        ].join(' ');

        if (view.last.transform !== transform) {
            style.transform = transform;
            view.last.transform = transform;
            this.stats.domWrites++;
        }

        const opacity = `${ParticleMath.clamp(particle.renderOpacity, 0, 1)}`;
        if (view.last.opacity !== opacity) {
            style.opacity = opacity;
            view.last.opacity = opacity;
            this.stats.domWrites++;
        }

        const width = `${Math.max(0.1, particle.renderWidth).toFixed(2)}px`;
        if (view.last.width !== width) {
            style.width = width;
            view.last.width = width;
            this.stats.domWrites++;
        }

        const height = `${Math.max(0.1, particle.renderHeight).toFixed(2)}px`;
        if (view.last.height !== height) {
            style.height = height;
            view.last.height = height;
            this.stats.domWrites++;
        }

        const zIndex = String(Math.round(particle.renderZIndex));
        if (view.last.zIndex !== zIndex) {
            style.zIndex = zIndex;
            view.last.zIndex = zIndex;
            this.stats.domWrites++;
        }

        const visibility = particle.renderVisibility || '';
        if (view.last.visibility !== visibility) {
            style.visibility = visibility;
            view.last.visibility = visibility;
            this.stats.domWrites++;
        }

        const blendMode = particle.renderBlendMode || '';
        if (view.last.mixBlendMode !== blendMode) {
            style.mixBlendMode = blendMode;
            view.last.mixBlendMode = blendMode;
            this.stats.domWrites++;
        }

        if (particle.useSprite) {
            const backgroundImage = particle.spriteUrl ? `url(${particle.spriteUrl})` : '';
            if (view.last.backgroundImage !== backgroundImage) {
                style.backgroundImage = backgroundImage;
                view.last.backgroundImage = backgroundImage;
                this.stats.domWrites++;
            }

            const backgroundPosition = particle.renderBackgroundPosition || '';
            if (view.last.backgroundPosition !== backgroundPosition) {
                style.backgroundPosition = backgroundPosition;
                view.last.backgroundPosition = backgroundPosition;
                this.stats.domWrites++;
            }

            const backgroundSize = particle.renderBackgroundSize || 'contain';
            if (view.last.backgroundSize !== backgroundSize) {
                style.backgroundSize = backgroundSize;
                view.last.backgroundSize = backgroundSize;
                this.stats.domWrites++;
            }

            if (view.last.backgroundColor !== '') {
                style.backgroundColor = '';
                view.last.backgroundColor = '';
                this.stats.domWrites++;
            }

            if (view.last.borderRadius !== '') {
                style.borderRadius = '';
                view.last.borderRadius = '';
                this.stats.domWrites++;
            }
        } else {
            if (view.last.backgroundImage !== '') {
                style.backgroundImage = '';
                view.last.backgroundImage = '';
                this.stats.domWrites++;
            }

            if (view.last.backgroundPosition !== '') {
                style.backgroundPosition = '';
                view.last.backgroundPosition = '';
                this.stats.domWrites++;
            }

            if (view.last.backgroundSize !== '') {
                style.backgroundSize = '';
                view.last.backgroundSize = '';
                this.stats.domWrites++;
            }

            const backgroundColor = particle.renderColor || '';
            if (view.last.backgroundColor !== backgroundColor) {
                style.backgroundColor = backgroundColor;
                view.last.backgroundColor = backgroundColor;
                this.stats.domWrites++;
            }

            const borderRadius = particle.renderBorderRadius || '50%';
            if (view.last.borderRadius !== borderRadius) {
                style.borderRadius = borderRadius;
                view.last.borderRadius = borderRadius;
                this.stats.domWrites++;
            }
        }
    }

    dispose() {
        this.viewsByParticleId.forEach(view => this.viewPool.release(view));
        this.viewsByParticleId.clear();
        this.layerContainers.forEach(layer => layer.remove());
        this.layerContainers.clear();
        this.viewPool.clear();
    }
}

class ParticleBehaviorRegistry {
    constructor() {
        this.behaviors = new Map();
    }

    register(name, behavior = {}) {
        if (!name) return;
        this.behaviors.set(name, behavior);
    }

    get(name) {
        return this.behaviors.get(name) || null;
    }

    runTick(particle, tickDelta, system) {
        if (!Array.isArray(particle.behaviors)) return;

        for (const behaviorName of particle.behaviors) {
            const behavior = this.behaviors.get(behaviorName);
            if (behavior?.tick) {
                behavior.tick(particle, tickDelta, system);
            }
        }
    }

    runVisual(particle, deltaTime, alpha, system) {
        if (!Array.isArray(particle.behaviors)) return;

        for (const behaviorName of particle.behaviors) {
            const behavior = this.behaviors.get(behaviorName);
            if (behavior?.visual) {
                behavior.visual(particle, deltaTime, alpha, system);
            }
        }
    }
}

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

class ParticleDebugSystem {
    constructor(system) {
        this.system = system;
        this.stats = {
            effectsEnabled: true,
            activeParticles: 0,
            pooledParticles: 0,
            activeEmitters: 0,
            boundRenderers: 0,
            spawnedThisTick: 0,
            recycledThisTick: 0,
            culledThisFrame: 0,
            domWritesThisFrame: 0
        };
    }

    beginTick() {
        this.stats.spawnedThisTick = 0;
        this.stats.recycledThisTick = 0;
    }

    recordSpawn() {
        this.stats.spawnedThisTick++;
    }

    recordRecycle() {
        this.stats.recycledThisTick++;
    }

    setFrameCulledCount(count) {
        this.stats.culledThisFrame = count;
    }

    sync() {
        this.stats.effectsEnabled = this.system.effectsEnabled !== false;
        this.stats.activeParticles = this.system.particles.length;
        this.stats.pooledParticles = this.system.particlePool.availableCount();
        this.stats.activeEmitters = this.system.emitters.length;
        this.stats.boundRenderers = this.system.renderer.stats.boundViews;
        this.stats.domWritesThisFrame = this.system.renderer.stats.domWrites;
    }

    snapshot() {
        this.sync();
        return { ...this.stats };
    }
}

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

class Particle {
    constructor(id) {
        this.id = id;
        this.reset();
    }

    reset() {
        this.active = false;
        this.system = null;
        this.sourceEmitter = null;
        this.config = null;
        this.behaviors = [];
        this.behaviorData = {};

        this.x = 0;
        this.y = 0;
        this.z = 0;
        this.prevX = 0;
        this.prevY = 0;
        this.prevSize = 0;
        this.prevOpacity = 1;
        this.prevRotation = 0;
        this.prevScaleX = 1;
        this.prevScaleY = 1;

        this.vx = 0;
        this.vy = 0;
        this.gravity = 0;
        this.wind = 0;
        this.friction = 0.98;

        this.lifeMs = 500;
        this.ageMs = 0;
        this.visualAgeMs = 0;

        this.sizeStart = 4;
        this.sizeEnd = 4;
        this.size = 4;
        this.opacityStart = 1;
        this.opacityEnd = 1;
        this.opacity = 1;
        this.rotation = 0;
        this.rotationSpeed = 0;
        this.scaleX = 1;
        this.scaleY = 1;
        this.baseScaleX = 1;
        this.baseScaleY = 1;

        this.color = '#ffffff';
        this.useSprite = false;
        this.spriteUrl = null;
        this.spriteAnimator = null;
        this.spriteFrameWidth = 1;
        this.spriteFrameHeight = 1;
        this.spriteSheetColumns = 1;
        this.spriteSheetRows = 1;

        this.renderX = 0;
        this.renderY = 0;
        this.renderWidth = 0;
        this.renderHeight = 0;
        this.renderOpacity = 1;
        this.renderRotation = 0;
        this.renderScaleX = 1;
        this.renderScaleY = 1;
        this.renderColor = '';
        this.renderVisible = true;
        this.renderVisibility = '';
        this.renderLayer = 'default';
        this.renderZIndex = 0;
        this.renderBackgroundPosition = '';
        this.renderBackgroundSize = '';
        this.renderBorderRadius = '50%';
        this.renderBlendMode = '';
        this.renderClassName = 'particle';
    }

    activate(system, config, spawnState = {}) {
        this.reset();

        this.active = true;
        this.system = system;
        this.sourceEmitter = spawnState.emitter || null;
        this.config = config;
        this.behaviors = Array.isArray(config.behaviors) ? config.behaviors.slice() : [];
        this.behaviorData = ParticleDataUtils.clone(config.behaviorData || {});

        this.x = spawnState.x;
        this.y = spawnState.y;
        this.z = spawnState.z;
        this.prevX = this.x;
        this.prevY = this.y;

        this.vx = spawnState.vx;
        this.vy = spawnState.vy;
        this.gravity = config.gravity;
        this.wind = config.wind;
        this.friction = config.friction;

        this.lifeMs = spawnState.lifeMs;
        this.ageMs = 0;
        this.visualAgeMs = 0;

        this.sizeStart = spawnState.size;
        this.sizeEnd = spawnState.sizeEnd;
        this.size = this.sizeStart;
        this.prevSize = this.size;

        this.opacityStart = spawnState.opacity;
        this.opacityEnd = spawnState.opacityEnd;
        this.opacity = this.opacityStart;
        this.prevOpacity = this.opacity;

        this.rotation = spawnState.rotation;
        this.rotationSpeed = spawnState.rotationSpeed;
        this.prevRotation = this.rotation;

        this.baseScaleX = spawnState.scaleX;
        this.baseScaleY = spawnState.scaleY;
        this.scaleX = this.baseScaleX;
        this.scaleY = this.baseScaleY;
        this.prevScaleX = this.scaleX;
        this.prevScaleY = this.scaleY;

        this.color = spawnState.color;
        this.useSprite = config.useSprite;
        this.spriteUrl = config.sprite;
        this.spriteFrameWidth = config.spriteFrameWidth;
        this.spriteFrameHeight = config.spriteFrameHeight;
        this.spriteSheetColumns = 1;
        this.spriteSheetRows = 1;

        if (config.useSprite && config.spriteFrames?.length) {
            this.spriteAnimator = new SpriteAnimator(config.spriteFrames.slice(), {
                fps: config.fps,
                frameDuration: config.frameDuration,
                loop: config.loop !== false
            });
        } else {
            this.spriteAnimator = null;
        }

        if (this.spriteAnimator && config.spriteFrames?.length) {
            const frameBounds = config.spriteFrames.reduce((bounds, frame) => ({
                maxX: Math.max(bounds.maxX, frame[0]),
                maxY: Math.max(bounds.maxY, frame[1])
            }), { maxX: 0, maxY: 0 });

            this.spriteSheetColumns = frameBounds.maxX + 1;
            this.spriteSheetRows = frameBounds.maxY + 1;
        }

        if (config.orbitalMotion) {
            this.behaviorData.orbit = {
                angle: spawnState.orbitAngle,
                radius: spawnState.orbitRadius,
                speed: config.orbitalSpeed,
                anchorTracker: spawnState.anchorTracker || this.sourceEmitter?.tracker || null
            };
        }

        this.renderLayer = config.renderLayer;
        this.renderBlendMode = config.blendMode || '';
        this.renderClassName = ['particle', config.className].filter(Boolean).join(' ');
        this.renderBorderRadius = config.borderRadius || '50%';
    }

    get lifeProgress() {
        return ParticleMath.clamp(this.ageMs / Math.max(this.lifeMs, 1), 0, 1);
    }

    beginTick() {
        this.prevX = this.x;
        this.prevY = this.y;
        this.prevSize = this.size;
        this.prevOpacity = this.opacity;
        this.prevRotation = this.rotation;
        this.prevScaleX = this.scaleX;
        this.prevScaleY = this.scaleY;
    }

    tickUpdate(tickDelta, system) {
        if (!this.active) return false;

        this.beginTick();
        this.ageMs += tickDelta;

        if (this.ageMs >= this.lifeMs) {
            system.handleParticleDeath(this);
            return false;
        }

        system.behaviors.runTick(this, tickDelta, system);
        system.applyBoundsBehavior(this);

        return this.active;
    }

    advanceSprite(deltaTime) {
        this.spriteAnimator?.update(deltaTime);
    }

    updateVisual(deltaTime, alpha, system) {
        this.advanceSprite(deltaTime);
        system.behaviors.runVisual(this, deltaTime, alpha, system);

        const clampedAlpha = ParticleMath.clamp(alpha, 0, 1);
        this.renderX = ParticleMath.lerp(this.prevX, this.x, clampedAlpha);
        this.renderY = ParticleMath.lerp(this.prevY, this.y, clampedAlpha);
        this.renderWidth = ParticleMath.lerp(this.prevSize, this.size, clampedAlpha);
        this.renderHeight = this.renderWidth;
        this.renderOpacity = ParticleMath.lerp(this.prevOpacity, this.opacity, clampedAlpha);
        this.renderRotation = ParticleMath.lerp(this.prevRotation, this.rotation, clampedAlpha);
        this.renderScaleX = ParticleMath.lerp(this.prevScaleX, this.scaleX, clampedAlpha);
        this.renderScaleY = ParticleMath.lerp(this.prevScaleY, this.scaleY, clampedAlpha);
        this.renderColor = this.color;
        this.renderZIndex = this.z + (this.config?.zIndexOffset || 0);
        this.renderLayer = this.config?.renderLayer || 'default';
        this.renderVisible = this.active && (this.config?.renderOffscreen || system.isPointVisible(this.renderX, this.renderY, this.config?.cullMargin || 0));
        this.renderVisibility = this.renderVisible ? '' : 'hidden';

        if (this.useSprite && this.spriteAnimator) {
            const [frameX, frameY] = this.spriteAnimator.currentFrame ?? [0, 0];
            this.renderBackgroundPosition = `${-frameX * this.spriteFrameWidth}px ${-frameY * this.spriteFrameHeight}px`;
            this.renderBackgroundSize = `${this.spriteSheetColumns * this.spriteFrameWidth}px ${this.spriteSheetRows * this.spriteFrameHeight}px`;
        } else {
            this.renderBackgroundPosition = '';
            this.renderBackgroundSize = '';
        }
    }
}

class ParticleSystem {
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

    addParticle(options = {}) {
        if (!this.isEffectsEnabled()) return null;

        const config = this.resolveEffectConfig(options, {
            emissionMode: 'manual',
            count: 1,
            name: options.name || options.type || 'CUSTOM_PARTICLE'
        });

        const created = this.spawnParticles(config, 1, {
            x: ParticleDataUtils.toFiniteNumber(options.x, 0),
            y: ParticleDataUtils.toFiniteNumber(options.y, 0),
            z: ParticleDataUtils.toFiniteNumber(options.z, 0)
        }, null);

        return created[0] || null;
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

    addSmoke(x, y, options = {}) {
        this.spawnBurst('SMOKE', x, y, options);
    }

    addImpactSpark(x, y, options = {}) {
        this.spawnBurst('IMPACT_SPARK', x, y, options);
    }

    addHealBurst(x, y, options = {}) {
        this.spawnBurst('HEAL', x, y, options);
    }

    addRain(options = {}) {
        return this.createEmitter('RAIN', options);
    }

    addSnow(options = {}) {
        return this.createEmitter('SNOW', options);
    }

    addMotes(options = {}) {
        return this.createEmitter('MOTES', options);
    }

    addEmbers(options = {}) {
        return this.createEmitter('EMBER', options);
    }

    addPollen(options = {}) {
        return this.createEmitter('POLLEN', options);
    }

    addBubbles(options = {}) {
        return this.createEmitter('BUBBLE', options);
    }

    addTrail(target, options = {}) {
        return this.createEmitter('TRAIL', {
            ...options,
            tracker: target,
            target
        });
    }

    addSwarm(x, y, options = {}) {
        this.spawnBurst('SWARM', x, y, options);
    }

    addFirework(x, y, options = {}) {
        this.spawnBurst('FIREWORK', x, y, options);
    }

    addButterfly(x, y, options = {}) {
        this.spawnBurst('SPARKLE', x, y, options);
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

    setParticleScale(scale = 1) {
        const safeScale = Math.max(0.01, ParticleDataUtils.toFiniteNumber(scale, 1));
        for (const particle of this.particles) {
            particle.sizeStart *= safeScale;
            particle.sizeEnd *= safeScale;
            particle.size *= safeScale;
        }
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
