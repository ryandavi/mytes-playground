const MAP_PARTICLE_PRESETS = {
    SPARKLE: {
        extends: 'SPARKLE',
        renderLayer: 'overlay'
    },

    SPARKLE_SPRITE: {
        extends: 'SPARKLE',
        emissionMode: 'continuous',
        interval: 300,
        count: 1,
        useSprite: true,
        sprite: 'images/particles/sparkle_2.gif',
        spriteFrames: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [7, 0], [8, 0], [9, 0]],
        spriteFrameWidth: 16,
        spriteFrameHeight: 16,
        size: 16,
        sizeEnd: 16,
        life: 640,
        speedMin: 0.05,
        speedMax: 0.3,
        randomizePosition: true,
        randomizeFactor: 12,
        frameDuration: 50,
        renderLayer: 'overlay'
    },

    TRAIL: {
        extends: 'TRAIL',
        renderLayer: 'ground'
    },

    DUST: {
        extends: 'DUST',
        renderLayer: 'ground'
    },

    DUST_SPRITE: {
        extends: 'DUST',
        useSprite: true,
        sprite: 'images/particles/dust-spritesheet.png',
        spriteFrames: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [7, 0]],
        spriteFrameWidth: 32,
        spriteFrameHeight: 32,
        size: 32,
        sizeEnd: 32,
        life: 700,
        frameDuration: 55,
        renderLayer: 'ground'
    },

    LANDING_DUST: {
        extends: 'DUST_SPRITE',
        emissionMode: 'event',
        count: 16,
        oneShot: false,
        life: 700,
        size: 32,
        sizeEnd: 32,
        speedMin: 0.1,
        speedMax: 0.85,
        gravity: -0.01,
        randomizePosition: true,
        randomizeFactor: 15,
        spreadX: 20,
        spreadY: 10,
        attachmentPoint: 'feet',
        positionAtFeet: true,
        renderLayer: 'ground'
    },

    EMOTION: {
        extends: 'EMOTION',
        renderLayer: 'overlay'
    },

    AURA: {
        extends: 'AURA',
        renderLayer: 'overlay'
    },

    GLOW: {
        extends: 'GLOW',
        renderLayer: 'overlay'
    },

    SLIME: {
        extends: 'SLIME',
        renderLayer: 'ground'
    },

    RAIN: {
        extends: 'RAIN',
        renderLayer: 'overlay',
        emitWhileVisible: true
    },

    SNOW: {
        extends: 'SNOW',
        renderLayer: 'overlay',
        emitWhileVisible: true
    },

    FIREWORK: {
        extends: 'FIREWORK',
        renderLayer: 'overlay'
    },

    SMOKE: {
        extends: 'SMOKE',
        renderLayer: 'object'
    },

    MOTES: {
        extends: 'MOTES',
        renderLayer: 'overlay',
        emitWhileVisible: true
    },

    EMBER: {
        extends: 'EMBER',
        renderLayer: 'object'
    },

    IMPACT_SPARK: {
        extends: 'IMPACT_SPARK',
        renderLayer: 'overlay'
    },

    POLLEN: {
        extends: 'POLLEN',
        renderLayer: 'overlay',
        emitWhileVisible: true
    },

    BUBBLE: {
        extends: 'BUBBLE',
        renderLayer: 'object'
    },

    HEAL: {
        extends: 'HEAL',
        renderLayer: 'overlay'
    },

    SMOKE_SPRITE: {
        extends: 'SMOKE',
        useSprite: true,
        sprite: 'images/particles/smoke-spritesheet.png',
        spriteFrames: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [7, 0]],
        spriteFrameWidth: 64,
        spriteFrameHeight: 64,
        size: 64,
        sizeEnd: 64,
        frameDuration: 70,
        renderLayer: 'object'
    },

    SWARM: {
        extends: 'SWARM',
        renderLayer: 'overlay'
    }
};

class WorldParticleUtilities {
    static getDirectionVector(direction) {
        const raw = String(direction || '').toUpperCase();

        switch (raw) {
            case 'N':
            case 'NORTH':
            case 'UP':
                return { x: 0, y: -1 };
            case 'S':
            case 'SOUTH':
            case 'DOWN':
                return { x: 0, y: 1 };
            case 'E':
            case 'EAST':
            case 'RIGHT':
                return { x: 1, y: 0 };
            case 'W':
            case 'WEST':
            case 'LEFT':
                return { x: -1, y: 0 };
            case 'NE':
            case 'NORTHEAST':
                return { x: Math.SQRT1_2, y: -Math.SQRT1_2 };
            case 'NW':
            case 'NORTHWEST':
                return { x: -Math.SQRT1_2, y: -Math.SQRT1_2 };
            case 'SE':
            case 'SOUTHEAST':
                return { x: Math.SQRT1_2, y: Math.SQRT1_2 };
            case 'SW':
            case 'SOUTHWEST':
                return { x: -Math.SQRT1_2, y: Math.SQRT1_2 };
            default:
                return { x: 0, y: 1 };
        }
    }

    static isSourceActive(source) {
        if (!source) return false;
        if ('active' in source && source.active === false) return false;
        return true;
    }

    static isSourceSelected(map, source) {
        if (!map?.ui || !source) return false;

        if (typeof map.ui.getSelected === 'function') {
            return map.ui.getSelected() === source;
        }

        return !!source.element?.classList?.contains('selected-object');
    }

    static isSourceAirborne(source) {
        if (!source) return false;
        if ('isOnSolidGround' in source) {
            return source.isOnSolidGround === false;
        }
        if ('isFalling' in source && source.isFalling) return true;
        if ('isJumping' in source && source.isJumping) return true;
        return false;
    }

    static isSourceGrounded(source) {
        if (!source) return false;
        if ('isOnSolidGround' in source) {
            return source.isOnSolidGround === true;
        }
        return !WorldParticleUtilities.isSourceAirborne(source);
    }

    static getWorldBounds(map) {
        if (map?.container?.getWorldBounds) {
            return map.container.getWorldBounds();
        }

        const width = ParticleDataUtils.toFiniteNumber(map?.dimensions?.width, 0);
        const height = ParticleDataUtils.toFiniteNumber(map?.dimensions?.height, 0);

        return {
            left: 0,
            top: 0,
            right: width,
            bottom: height,
            width,
            height
        };
    }

    static getCameraBounds(map) {
        const camera = map?.camera;
        const container = map?.container;

        if (!camera || !container) {
            return WorldParticleUtilities.getWorldBounds(map);
        }

        const viewportRect = container.getContainerRect?.() || { width: 0, height: 0 };
        const zoom = Math.max(0.0001, ParticleDataUtils.toFiniteNumber(camera.zoomLevel, 1));
        const left = -ParticleDataUtils.toFiniteNumber(camera.posX, 0);
        const top = -ParticleDataUtils.toFiniteNumber(camera.posY, 0);
        const width = viewportRect.width / zoom;
        const height = viewportRect.height / zoom;

        return {
            left,
            top,
            right: left + width,
            bottom: top + height,
            width,
            height
        };
    }

    static isPointVisible(map, x, y, margin = 0) {
        const bounds = WorldParticleUtilities.getCameraBounds(map);
        return x >= bounds.left - margin &&
            x <= bounds.right + margin &&
            y >= bounds.top - margin &&
            y <= bounds.bottom + margin;
    }

    static matchesEventSource(source, payload, filter = null) {
        if (typeof filter === 'function') {
            return !!filter(payload, source);
        }

        if (!payload) return true;
        if (payload.myte === source || payload.object === source || payload.source === source || payload.target === source) {
            return true;
        }

        return false;
    }

    static resolveEventOrigin(system, source, payload = {}, emitter = null) {
        if (payload.position && Number.isFinite(payload.position.x) && Number.isFinite(payload.position.y)) {
            return {
                x: payload.position.x,
                y: payload.position.y,
                z: ParticleDataUtils.toFiniteNumber(payload.position.z, 0)
            };
        }

        if (Number.isFinite(payload.x) && Number.isFinite(payload.y)) {
            return {
                x: payload.x,
                y: payload.y,
                z: ParticleDataUtils.toFiniteNumber(payload.z, 0)
            };
        }

        const target = payload.myte || payload.object || payload.source || source;
        if (target) {
            const point = AttachmentPointResolver.resolve(target, emitter?.options || {});
            return {
                x: point.x,
                y: point.y,
                z: point.z
            };
        }

        return {
            x: emitter?.x || 0,
            y: emitter?.y || 0,
            z: emitter?.z || 0
        };
    }
}

class AttachmentPointResolver {
    static resolve(object, options = {}) {
        if (!object) {
            return { x: 0, y: 0, z: 0 };
        }

        const size = object.size || { width: 0, height: 0 };
        const collider = object.collider || null;
        const posX = ParticleDataUtils.toFiniteNumber(object.posX, object.x || 0);
        const posY = ParticleDataUtils.toFiniteNumber(object.posY, object.y || 0);
        const point = options.attachmentPoint || (options.positionAtFeet ? 'feet' : 'center');

        const colliderWidth = collider?.width ?? size.width;
        const colliderHeight = collider?.height ?? size.height;
        const colliderOffsetX = collider?.offsetX ?? 0;
        const colliderOffsetY = collider?.offsetY ?? 0;

        const bounds = {
            left: posX,
            top: posY,
            right: posX + size.width,
            bottom: posY + size.height,
            centerX: posX + size.width * 0.5,
            centerY: posY + size.height * 0.5,
            colliderLeft: posX + colliderOffsetX,
            colliderTop: posY + colliderOffsetY,
            colliderRight: posX + colliderOffsetX + colliderWidth,
            colliderBottom: posY + colliderOffsetY + colliderHeight,
            colliderCenterX: posX + colliderOffsetX + colliderWidth * 0.5,
            colliderCenterY: posY + colliderOffsetY + colliderHeight * 0.5
        };

        const direction = object.direction || object.facingDirection || object.getConfig?.('facingDirection', null);
        const directionVector = WorldParticleUtilities.getDirectionVector(direction);
        const directionalDistance = ParticleDataUtils.toFiniteNumber(options.directionalDistance, Math.max(8, Math.min(colliderWidth, colliderHeight) * 0.45));
        const elevation = options.followElevation
            ? ParticleDataUtils.toFiniteNumber(object.posZ, 0)
            : 0;

        let x = bounds.centerX;
        let y = bounds.centerY;

        switch (point) {
            case 'feet':
                x = bounds.colliderCenterX;
                y = bounds.colliderBottom;
                break;
            case 'head':
                x = bounds.colliderCenterX;
                y = bounds.colliderTop;
                break;
            case 'body':
                x = bounds.centerX;
                y = bounds.centerY;
                break;
            case 'colliderCenter':
                x = bounds.colliderCenterX;
                y = bounds.colliderCenterY;
                break;
            case 'front':
                x = bounds.colliderCenterX + directionVector.x * directionalDistance;
                y = bounds.colliderCenterY + directionVector.y * directionalDistance;
                break;
            case 'back':
                x = bounds.colliderCenterX - directionVector.x * directionalDistance;
                y = bounds.colliderCenterY - directionVector.y * directionalDistance;
                break;
            case 'left':
                x = bounds.left;
                y = bounds.centerY;
                break;
            case 'right':
                x = bounds.right;
                y = bounds.centerY;
                break;
            case 'top':
                x = bounds.centerX;
                y = bounds.top;
                break;
            case 'bottom':
                x = bounds.centerX;
                y = bounds.bottom;
                break;
            case 'center':
            default:
                x = bounds.centerX;
                y = bounds.centerY;
                break;
        }

        x += ParticleDataUtils.toFiniteNumber(options.offsetX, 0);
        y += ParticleDataUtils.toFiniteNumber(options.offsetY, 0) - elevation;

        return {
            x,
            y,
            z: ParticleDataUtils.toFiniteNumber(object.posZ, 0)
        };
    }
}

class ObjectTracker extends ParticlePointTracker {
    constructor(system, object, options = {}) {
        super(0, 0, 0);
        this.system = system;
        this.object = object;
        this.options = options;
        this.direction = null;
        this._initialized = false;
        this.update();
    }

    update() {
        const point = AttachmentPointResolver.resolve(this.object, this.options);

        if (!this._initialized) {
            this.x = point.x;
            this.y = point.y;
            this.z = point.z;
            this.lastX = this.x;
            this.lastY = this.y;
            this.dx = 0;
            this.dy = 0;
            this.speed = 0;
            this._initialized = true;
        } else {
            this.dx = point.x - this.x;
            this.dy = point.y - this.y;
            this.speed = Math.hypot(this.dx, this.dy);
            this.lastX = this.x;
            this.lastY = this.y;
            this.x = point.x;
            this.y = point.y;
            this.z = point.z;
        }

        this.direction = this.object?.direction ||
            this.object?.facingDirection ||
            this.object?.getConfig?.('facingDirection', null) ||
            null;
        this.active = WorldParticleUtilities.isSourceActive(this.object);
        this.visible = this.system?.isSourceVisible(this.object, this.x, this.y) ?? true;

        return this;
    }
}

class DirectionalTracker extends ObjectTracker {
    constructor(system, object, options = {}) {
        super(system, object, {
            attachmentPoint: options.attachmentPoint || 'front',
            directionalDistance: options.directionalDistance,
            offsetX: options.offsetX,
            offsetY: options.offsetY
        });
    }
}

class MapParticleHelpers {
    static resolveEffectKey(effectType, resolvedConfig, options = {}) {
        if (options.effectKey) {
            return String(options.effectKey);
        }

        if (typeof effectType === 'string') {
            return String(effectType).toUpperCase();
        }

        return String(resolvedConfig?.name || resolvedConfig?.type || 'CUSTOM').toUpperCase();
    }
}

class GameMapParticleSystem extends ParticleSystem {
    constructor(map, options = {}) {
        super(map, {
            ...options,
            container: options.container || map?.layers?.particles || null,
            maxParticles: options.maxParticles ?? 900,
            poolSize: options.poolSize ?? 220
        });

        this.map = map;
        this.objectEffects = new Map();

        this.registerPresets(MAP_PARTICLE_PRESETS);
    }

    getSimulationBounds() {
        return WorldParticleUtilities.getWorldBounds(this.map);
    }

    getViewportBounds() {
        return WorldParticleUtilities.getCameraBounds(this.map);
    }

    isPointVisible(x, y, margin = 0) {
        return WorldParticleUtilities.isPointVisible(this.map, x, y, margin);
    }

    isSourceVisible(source, x, y) {
        if (!source) return this.isPointVisible(x, y, 0);

        if (source.sleeping && !source.shouldSimulateOffScreen?.()) {
            return false;
        }

        return this.isPointVisible(x, y, 0);
    }

    resolveEffectConfig(configOrPreset, overrides = {}) {
        if (typeof configOrPreset === 'string' && !this.configResolver.has(configOrPreset)) {
            const normalized = String(configOrPreset).toLowerCase();
            const match = [...this.configResolver.presets.keys()].find(key => {
                const preset = this.configResolver.getRawPreset(key);
                return preset?.type === normalized;
            });

            if (match) {
                return super.resolveEffectConfig(match, overrides);
            }
        }

        return super.resolveEffectConfig(configOrPreset, overrides);
    }

    createTrackerForSource(source, options = {}) {
        if (!source) {
            return this.createPointTracker(0, 0, 0);
        }

        if (source instanceof ParticlePointTracker || source instanceof ObjectTracker || source instanceof DirectionalTracker) {
            return source;
        }

        if (Number.isFinite(source.posX) || Number.isFinite(source.posY)) {
            if ((options.attachmentPoint || '').toLowerCase() === 'front') {
                return new DirectionalTracker(this, source, options);
            }
            return new ObjectTracker(this, source, options);
        }

        return this.createPointTracker(
            ParticleDataUtils.toFiniteNumber(source.x, 0),
            ParticleDataUtils.toFiniteNumber(source.y, 0),
            ParticleDataUtils.toFiniteNumber(source.z, 0)
        );
    }

    getObjectRecord(object, create = false) {
        if (!object) return null;

        if (this.objectEffects.has(object)) {
            return this.objectEffects.get(object);
        }

        if (!create) return null;

        const record = {
            emitters: new Map(),
            cleanups: new Set()
        };

        this.objectEffects.set(object, record);
        return record;
    }

    registerObjectCleanup(object, cleanup) {
        if (typeof cleanup !== 'function') return;
        const record = this.getObjectRecord(object, true);
        record.cleanups.add(cleanup);
    }

    runObjectCleanups(object) {
        const record = this.getObjectRecord(object, false);
        if (!record) return;

        record.cleanups.forEach(cleanup => {
            try {
                cleanup();
            } catch (error) {
                console.warn('[GameMapParticleSystem] Cleanup failed:', error);
            }
        });
        record.cleanups.clear();
    }

    addEffect(object, effectType, customOptions = {}) {
        if (!object) {
            console.warn('[GameMapParticleSystem] Cannot add effect without a source object.');
            return null;
        }

        const resolvedConfig = this.resolveEffectConfig(effectType, customOptions);
        const effectKey = MapParticleHelpers.resolveEffectKey(effectType, resolvedConfig, customOptions);

        this.detachEffectFromObject(object, effectKey);

        const tracker = this.createTrackerForSource(object, resolvedConfig);
        const emitter = this.createEmitter(resolvedConfig, {
            tracker,
            target: tracker,
            sourceObject: object,
            enabled: customOptions.enabled !== false
        });

        if (resolvedConfig.eventName) {
            this.bindEmitterToEvent(object, emitter, resolvedConfig.eventName, customOptions);
        }

        const record = this.getObjectRecord(object, true);
        record.emitters.set(effectKey, emitter);

        if (!object.particleEmitters) {
            object.particleEmitters = {};
        }

        if (customOptions.storeReference !== false) {
            object.particleEmitters[effectKey] = emitter;
        }

        return emitter;
    }

    addEventEffect(object, eventName, effectType, options = {}) {
        return this.addEffect(object, effectType, {
            ...options,
            emissionMode: 'event',
            eventName
        });
    }

    burstEffectAtObject(object, effectType, options = {}) {
        if (!object) return;

        const tracker = this.createTrackerForSource(object, options);
        tracker.update();

        this.spawnBurst(
            effectType,
            tracker.x,
            tracker.y,
            {
                ...options,
                z: tracker.z
            }
        );
    }

    bindEmitterToEvent(object, emitter, eventName, options = {}) {
        const eventManager = options.eventManager || this.map?.eventManager || this.map?.container?.eventManager;
        if (!eventManager?.on || !eventName) return emitter;

        const off = eventManager.on(eventName, payload => {
            if (!WorldParticleUtilities.matchesEventSource(object, payload, options.eventFilter)) {
                return;
            }

            const origin = WorldParticleUtilities.resolveEventOrigin(this, object, payload, emitter);
            emitter.requestBurst({
                count: options.count || emitter.options.count,
                origin,
                overrides: options.burstOverrides || null
            });
        });

        emitter.addCleanup(off);
        this.registerObjectCleanup(object, off);
        return emitter;
    }

    detachEffectFromObject(object, effectKey = null) {
        if (!object) return;

        const record = this.getObjectRecord(object, false);
        if (!record) return;

        if (effectKey) {
            const normalizedKey = String(effectKey).toUpperCase();
            const emitter = record.emitters.get(normalizedKey);
            if (emitter) {
                emitter.destroy();
                record.emitters.delete(normalizedKey);
            }

            if (object.particleEmitters) {
                delete object.particleEmitters[normalizedKey];
            }
        } else {
            record.emitters.forEach(emitter => emitter.destroy());
            record.emitters.clear();

            if (object.particleEmitters) {
                object.particleEmitters = {};
            }
        }

        if (record.emitters.size === 0) {
            this.runObjectCleanups(object);
            this.objectEffects.delete(object);
        }
    }

    addParticleMethodsToObject(object) {
        if (!object) return;
        if (object._particleMethodsInstalled && object._particleMethodOwner === this) return;

        if (!object.particleEmitters) {
            object.particleEmitters = {};
        }

        object.addEffect = (effectType, options = {}) => {
            return this.addEffect(object, effectType, {
                ...options,
                storeReference: options.storeReference !== false
            });
        };

        object.addEventEffect = (eventName, effectType, options = {}) => {
            return this.addEventEffect(object, eventName, effectType, {
                ...options,
                storeReference: options.storeReference !== false
            });
        };

        object.burstEffect = (effectType, options = {}) => {
            this.burstEffectAtObject(object, effectType, options);
        };

        object.removeEffect = (effectKey) => {
            this.detachEffectFromObject(object, effectKey);
        };

        object.removeAllEffects = () => {
            this.detachEffectFromObject(object, null);
        };

        object.hasEffect = (effectKey) => {
            const normalizedKey = String(effectKey).toUpperCase();
            return !!object.particleEmitters?.[normalizedKey]?.active;
        };

        object._particleMethodsInstalled = true;
        object._particleMethodOwner = this;
    }

    evaluateEmitterConditions(emitter) {
        if (!super.evaluateEmitterConditions(emitter)) {
            return false;
        }

        const source = emitter.sourceObject;
        const options = emitter.options;

        if (options.emitWhileAlive && !WorldParticleUtilities.isSourceActive(source)) {
            return false;
        }

        if (options.emitWhileActive && source && 'isActive' in source && source.isActive === false) {
            return false;
        }

        if (options.emitWhileAirborne && !WorldParticleUtilities.isSourceAirborne(source)) {
            return false;
        }

        if (options.emitWhileGrounded && !WorldParticleUtilities.isSourceGrounded(source)) {
            return false;
        }

        if (options.emitWhileSelected && !WorldParticleUtilities.isSourceSelected(this.map, source)) {
            return false;
        }

        if (typeof options.condition === 'function' && options.condition({
            source,
            emitter,
            tracker: emitter.tracker,
            map: this.map
        }) === false) {
            return false;
        }

        return true;
    }

    pruneObjectEffects() {
        for (const [object, record] of this.objectEffects.entries()) {
            if (!object) {
                this.objectEffects.delete(object);
                continue;
            }

            for (const [effectKey, emitter] of record.emitters.entries()) {
                if (emitter?.active) continue;
                record.emitters.delete(effectKey);
                if (object.particleEmitters) {
                    delete object.particleEmitters[effectKey];
                }
            }

            const shouldRemoveRecord = ('active' in object && object.active === false) || record.emitters.size === 0;
            if (shouldRemoveRecord) {
                this.runObjectCleanups(object);
                this.objectEffects.delete(object);
            }
        }
    }

    tickUpdate(tickDelta) {
        super.tickUpdate(tickDelta);
        this.pruneObjectEffects();
    }

    update(deltaTime) {
        super.update(deltaTime);
    }

    getDebugStats() {
        const stats = super.getDebugStats();
        return {
            ...stats,
            objectBindings: this.objectEffects.size
        };
    }

    dispose() {
        for (const [object] of this.objectEffects.entries()) {
            this.detachEffectFromObject(object, null);
        }

        this.objectEffects.clear();
        super.dispose();
    }
}
