
class MapObjectRegistry {
    constructor() {
        this.typeMappings = new Map();
        this.defaultConstructor = MapObject;
    }

    register(type, constructor) {
        this.typeMappings.set(type, constructor);
        return this;
    }

    getConstructor(type) {
        return this.typeMappings.get(type) || this.defaultConstructor;
    }

    setDefaultConstructor(constructor) {
        this.defaultConstructor = constructor;
        return this;
    }

    hasConstructor(type) {
        return this.typeMappings.has(type);
    }

    getRegisteredTypes() {
        return Array.from(this.typeMappings.keys());
    }
}

class MapObjectFactory {
    static registry = new MapObjectRegistry();
    static BASE_CONFIG = {};
    static TYPE_CONFIGS = {};
    static CONFIG_LOADED = false;
    static configSource = null;

    static normalizeType(type) {
        return String(type || '')
            .trim()
            .replace(/\s+/g, '_')
            .toUpperCase();
    }

    static initialize(baseConfig = {}, typeConfigs = {}) {
        this.BASE_CONFIG = this.normalizeCanonicalConfig(baseConfig || {});
        this.TYPE_CONFIGS = this.normalizeCanonicalConfig(typeConfigs || {});
        this.CONFIG_LOADED = true;
        this.configSource = this.configSource || 'initialize';
    }

    static normalizeCanonicalConfig(value) {
        if (Array.isArray(value)) {
            return value.map(entry => this.normalizeCanonicalConfig(entry));
        }

        if (!Utility.isPlainObject(value)) {
            return value;
        }

        const normalized = {};
        Object.entries(value).forEach(([key, childValue]) => {
            normalized[key] = this.normalizeCanonicalConfig(childValue);
        });

        const visual = Utility.isPlainObject(normalized.visual) ? normalized.visual : null;

        if (visual) {
            const inferredDefaultState = this.inferVisualDefaultState(visual);
            if (normalized.renderType === undefined && visual.renderType !== undefined) {
                normalized.renderType = visual.renderType;
            }
            if (normalized.default === undefined && (visual.defaultState !== undefined || inferredDefaultState !== null)) {
                normalized.default = visual.defaultState ?? inferredDefaultState;
            }
            if (normalized.states === undefined && visual.states !== undefined) {
                normalized.states = Utility.deepClone(visual.states);
            }
            if (normalized.animates === undefined && visual.animates !== undefined) {
                normalized.animates = visual.animates;
            }
            if (normalized.frameDelay === undefined && visual.frameDelay !== undefined) {
                normalized.frameDelay = visual.frameDelay;
            }
            if (normalized.shadow === undefined && visual.shadow !== undefined) {
                normalized.shadow = Utility.deepClone(visual.shadow);
            }

            if (normalized.spriteConfig === undefined) {
                const spriteConfig = {};
                if (visual.defaultState !== undefined || inferredDefaultState !== null) {
                    spriteConfig.default = visual.defaultState ?? inferredDefaultState;
                }
                if (visual.frameDelay !== undefined) {
                    spriteConfig.frameDelay = visual.frameDelay;
                }
                if (visual.frameWidth !== undefined) {
                    spriteConfig.frameWidth = visual.frameWidth;
                }
                if (visual.scale !== undefined) {
                    spriteConfig.scale = visual.scale;
                }
                if (visual.spriteSheet !== undefined) {
                    spriteConfig.spriteSheet = Utility.deepClone(visual.spriteSheet);
                }
                if (visual.animations !== undefined) {
                    spriteConfig.animations = Utility.deepClone(visual.animations);
                }

                if (Object.keys(spriteConfig).length > 0) {
                    normalized.spriteConfig = spriteConfig;
                }
            }
        }

        return normalized;
    }

    static inferVisualDefaultState(visual = {}) {
        const animations = visual?.animations;
        if (!Utility.isPlainObject(animations)) {
            return null;
        }

        const animationIds = Object.keys(animations);
        if (!animationIds.length) {
            return null;
        }

        const preferredIds = ['default', 'idle', 'closed', 'off', 'seed', 'active', 'opened', 'open'];
        for (const preferredId of preferredIds) {
            if (animationIds.includes(preferredId)) {
                return preferredId;
            }
        }

        return animationIds[0] || null;
    }

    static async loadConfig(configUrl) {
        try {
            const response = await fetch(configUrl);
            if (!response.ok) {
                throw new Error(`Failed to load configuration: ${response.statusText}`);
            }
            
            const config = await response.json();
            this.initialize(config.baseConfig, config.types);
            this.configSource = configUrl;
            return true;
        } catch (error) {
            console.error('Error loading map object configuration:', error);
            return false;
        }
    }

    static async loadConfigFiles(baseConfigUrl, typeConfigUrl) {
        try {
            const [baseResponse, typeResponse] = await Promise.all([
                fetch(baseConfigUrl),
                fetch(typeConfigUrl)
            ]);

            if (!baseResponse.ok) {
                throw new Error(`Failed to load base map object configuration: ${baseResponse.statusText}`);
            }
            if (!typeResponse.ok) {
                throw new Error(`Failed to load map object type configuration: ${typeResponse.statusText}`);
            }

            const [baseConfig, typeConfigs] = await Promise.all([
                baseResponse.json(),
                typeResponse.json()
            ]);

            this.initialize(baseConfig, typeConfigs);
            this.configSource = `${baseConfigUrl} + ${typeConfigUrl}`;
            return true;
        } catch (error) {
            console.error('Error loading map object configuration files:', error);
            return false;
        }
    }

    static registerObjectType(type, constructor) {
        this.registry.register(type, constructor);
        return this;
    }

    static create(type, variant, x, y, options = {}) {
        type = this.normalizeType(type);
        const { parent: resolvedParent = null, ...factoryOptions } = options;

        const typeConfig = this.getTypeConfig(type);
        if (!typeConfig) {
            console.error(`Unknown object type: ${type}`);
            return null;
        }
        if (typeConfig.abstract) {
            console.error(`Cannot create abstract object type directly: ${type}`);
            return null;
        }
        if (!resolvedParent) {
            console.error(`Cannot create object type "${type}" without a parent map.`);
            return null;
        }

        const config = this.mergeConfigs(type, variant, factoryOptions);
        const Constructor = this.registry.getConstructor(type);
        return new Constructor(resolvedParent, type, variant, x, y, config, factoryOptions);
    }

    static deepMerge(target = {}, ...sources) {
        const result = { ...target };

        for (const source of sources) {
            if (!Utility.isPlainObject(source)) continue;

            Object.entries(source).forEach(([key, value]) => {
                if (Utility.isPlainObject(value) && Utility.isPlainObject(result[key])) {
                    result[key] = this.deepMerge(result[key], value);
                } else if (Utility.isPlainObject(value)) {
                    result[key] = this.deepMerge({}, value);
                } else if (Array.isArray(value)) {
                    result[key] = value.slice();
                } else {
                    result[key] = value;
                }
            });
        }

        return result;
    }

    static getTypeConfig(type) {
        type = this.normalizeType(type);
        
        return this.TYPE_CONFIGS[type];
    }

    static mergeConfigs(type, variant, options = {}) {
        const typeConfig = this.getTypeConfig(type);
        let config = this.deepMerge({}, this.BASE_CONFIG);

        const baseType = typeConfig.baseType;
        if (baseType && this.TYPE_CONFIGS[baseType]) {
            config = this.deepMerge(config, this.TYPE_CONFIGS[baseType]);
        }

        config = this.deepMerge(config, typeConfig);

        if (typeConfig.variants && typeConfig.variantConfigs && typeConfig.variantConfigs[variant]) {
            config = this.deepMerge(config, typeConfig.variantConfigs[variant]);
        }

        if (options?.configOverrides) {
            config = this.deepMerge(config, options.configOverrides);
        }

        if (options?.id !== undefined) {
            config.id = options.id;
        } else if (options?.objectId !== undefined) {
            config.id = options.objectId;
        }

        return config;
    }

    static getAvailableTypes() {
        if (this.CONFIG_LOADED) {
            return Object.keys(this.TYPE_CONFIGS);
        }
        return [];
    }

    static getVariantsForType(type) {
        type = this.normalizeType(type);
        const typeConfig = this.getTypeConfig(type);
        return typeConfig?.variants || [];
    }

    static hasType(type) {
        type = this.normalizeType(type);
        return !!this.getTypeConfig(type);
    }
}



// Set up the factory with default registrations
MapObjectFactory.registry
    .register('GRASS', MapObject)
    .register('FLOWER', FlowerMapObject)
    .register('TREE', TreeMapObject)
    .register('FRUIT_TREE', FruitTreeMapObject)
    .register('TREE_STUMP', TreeStumpMapObject)
    .register('MUSIC_BOX', MusicBoxMapObject)
    .register('TREASURE_CHEST', TreasureChestMapObject)
    .register('FOUNTAIN', FountainMapObject)
    .register('LANTERN', LightMapObject)
    .register('GROWING_PLANT', GrowingPlantMapObject)
    .register('NIGHT_BLOOM', NightBloomMapObject)
    .register('CROP', CropPlantMapObject)
    .register('BREEDING_FLOWER', BreedingFlowerMapObject)
    .register('BALL', BallMapObject)
    .register('PATROL_GUARD', PatrolGuardMapObject)
    .register('NPC', NpcMapObject)
    .register('BUTTERFLY', ButterflyMapObject)
    .register('BEE', BeeMapObject)
    .register('HIVE', HiveMapObject)
    .register('BIRD', BirdMapObject)
    .register('BED', DirectionalMapObject)
    .register('COUCH', DirectionalMapObject)
    .register('DOOR', DoorMapObject)
    .register('PORTAL', PortalMapObject)
    .register('GATE', GateMapObject)
    .register('FENCE', FenceMapObject)	
    .setDefaultConstructor(MapObject);
