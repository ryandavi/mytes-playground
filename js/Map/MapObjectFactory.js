
class MapObjectRegistry {
    constructor() {
        this.typeMappings = new Map();
        this.defaultConstructor = MapObject;
    }

    /**
     * Register a type with its constructor
     * @param {string} type The object type
     * @param {Function} constructor The constructor function
     * @returns {MapObjectRegistry} Returns self for chaining
     */
    register(type, constructor) {
        this.typeMappings.set(type, constructor);
        return this; // Allow chaining
    }

    /**
     * Get the constructor for a type
     * @param {string} type The object type
     * @returns {Function} The constructor function
     */
    getConstructor(type) {
        return this.typeMappings.get(type) || this.defaultConstructor;
    }

    /**
     * Set the default constructor
     * @param {Function} constructor The constructor function
     * @returns {MapObjectRegistry} Returns self for chaining
     */
    setDefaultConstructor(constructor) {
        this.defaultConstructor = constructor;
        return this; // Allow chaining
    }
    
    /**
     * Check if a constructor is registered for a type
     * @param {string} type The object type
     * @returns {boolean} Whether a constructor is registered
     */
    hasConstructor(type) {
        return this.typeMappings.has(type);
    }
    
    /**
     * Get all registered types
     * @returns {Array<string>} Array of registered types
     */
    getRegisteredTypes() {
        return Array.from(this.typeMappings.keys());
    }
}

class MapObjectFactory {
    static registry = new MapObjectRegistry();
    static BASE_CONFIG = {};
    static TYPE_CONFIGS = {};
    static CONFIG_LOADED = false;

    static normalizeType(type) {
        return String(type || '')
            .trim()
            .replace(/\s+/g, '_')
            .toUpperCase();
    }

    static initialize(baseConfig = {}, typeConfigs = {}) {
        this.BASE_CONFIG = baseConfig || {};
        this.TYPE_CONFIGS = typeConfigs || {};
        this.CONFIG_LOADED = true;
        this.parent = null;
    }

    static async loadConfig(configUrl) {
        try {
            const response = await fetch(configUrl);
            if (!response.ok) {
                throw new Error(`Failed to load configuration: ${response.statusText}`);
            }
            
            const config = await response.json();
            this.initialize(config.baseConfig, config.types);
            return true;
        } catch (error) {
            console.error('Error loading map object configuration:', error);
            return false;
        }
    }

    static registerObjectType(type, constructor) {
        this.registry.register(type, constructor);
        return this;
    }

    static create(type, variant, x, y, options = {}) {
        type = this.normalizeType(type);

        // Get the configuration for this type
        const typeConfig = this.getTypeConfig(type);
        if (!typeConfig) {
            console.error(`Unknown object type: ${type}`);
            return null;
        }

        // Merge base config with type config and options
        const config = this.mergeConfigs(type, variant, options);

        // Get the appropriate constructor
        const Constructor = this.registry.getConstructor(type);

        // Create and return the instance
        return new Constructor(this.parent, type, variant, x, y, config, options);
    }

    static isPlainObject(value) {
        return value !== null && typeof value === 'object' && !Array.isArray(value);
    }

    static deepMerge(target = {}, ...sources) {
        const result = { ...target };

        for (const source of sources) {
            if (!this.isPlainObject(source)) continue;

            Object.entries(source).forEach(([key, value]) => {
                if (this.isPlainObject(value) && this.isPlainObject(result[key])) {
                    result[key] = this.deepMerge(result[key], value);
                } else if (this.isPlainObject(value)) {
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

        // Fallback to hardcoded MAP_OBJECT_TYPES if config not loaded
        if (!this.CONFIG_LOADED && typeof MAP_OBJECT_TYPES !== 'undefined') {
            return MAP_OBJECT_TYPES[type];
        }
        
        return this.TYPE_CONFIGS[type];
    }

    static mergeConfigs(type, variant, options = {}) {
        const typeConfig = this.getTypeConfig(type);
        let config = this.deepMerge({}, this.BASE_CONFIG);
        
        // Get the base type if specified
        const baseType = typeConfig.baseType;
        if (baseType && this.TYPE_CONFIGS[baseType]) {
            config = this.deepMerge(config, this.TYPE_CONFIGS[baseType]);
        }
        
        config = this.deepMerge(config, typeConfig);
        
        // Merge variant-specific config if available
        if (typeConfig.variants && typeConfig.variantConfigs && typeConfig.variantConfigs[variant]) {
            config = this.deepMerge(config, typeConfig.variantConfigs[variant]);
        }
        
        // Merge any config overrides from options
        if (options && options?.configOverrides) {
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
        // Use loaded configs or fallback to hardcoded types
        if (this.CONFIG_LOADED) {
            return Object.keys(this.TYPE_CONFIGS);
        } else if (typeof MAP_OBJECT_TYPES !== 'undefined') {
            return Object.keys(MAP_OBJECT_TYPES);
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
    .register('FLOWER', MapObject)
    .register('MUSIC_BOX', MapObject)
    .register('TREASURE_CHEST', TreasureChestMapObject)
    .register('FOUNTAIN', FountainMapObject)
    .register('LANTERN', LightMapObject)
    .register('GROWING_PLANT', GrowingPlantMapObject)
    .register('NIGHT_BLOOM', NightBloomMapObject)
    .register('CROP', CropPlantMapObject)
    .register('BREEDING_FLOWER', BreedingFlowerMapObject)
    .register('BALL', BallMapObject)
    .register('PATROL_GUARD', PatrolGuardMapObject)
    .register('BUTTERFLY', ButterflyMapObject)
    .register('BED', MapObject)
    .register('DOOR', DoorMapObject)
    .register('PORTAL', PortalMapObject)
    .register('GATE', GateMapObject)
    .register('FENCE', FenceMapObject)	
    .setDefaultConstructor(MapObject);

MapObjectFactory.initialize(BASE_CONFIG, TYPE_CONFIGS);
