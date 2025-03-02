// Factory for creating specific types of map objects
// Object registry to store mappings between categories and their constructors
class MapObjectRegistry {
	constructor() {
		this.typeMappings = new Map();
		this.defaultConstructor = MapObject;
	}

	// Register a category with its corresponding constructor
	register(type, constructor) {
		this.typeMappings.set(type, constructor);
		return this; // Allow chaining
	}

	// Get the constructor for a given category
	getConstructor(type) {
		return this.typeMappings.get(type) || this.defaultConstructor;
	}

	// Set the default constructor for unknown categories
	setDefaultConstructor(constructor) {
		this.defaultConstructor = constructor;
		return this; // Allow chaining
	}
}

// Enhanced factory with registry
class MapObjectFactory {
	static registry = new MapObjectRegistry();

	// Method to register new object types at runtime
	static registerObjectType(type, constructor) {
		this.registry.register(type, constructor);
	}

	// Create method now uses the registry
	static create(type, variant, x, y, options = {}) {
		const config = MAP_OBJECT_TYPES[type];

		if (!config) {
			console.error(`Unknown object type: ${type}`);
			return null;
		}

		const Constructor = this.registry.getConstructor(type);
		return new Constructor(type, variant, x, y, config, options);
	}
}

MapObjectFactory.registry
.register('GRASS', MapObject)
.register('FLOWER', MapObject)
.register('MUSIC_BOX', MapObject)

.register('TREASURE_CHEST', TreasureChestMapObject)
.register('FOUNTAIN', FountainMapObject)
.register('LANTERN', LightMapObject)
.register('GROWING_PLANT', GrowingPlantMapObject)
.register('NIGHT_BLOOM', NightBloomMapObject)

.register('ITEM', MapObject)
.register('FOOD', MapObject)
.register('DROPPED_ITEM', DroppedMapItem)

.register('CROP', CropPlantMapObject)
.register('BREEDING_FLOWER', BreedingFlowerMapObject)

.register('BALL', BallMapObject)
.register('PATROL_GUARD', PatrolGuardMapObject)
.register('BUTTERFLY', ButterflyMapObject)

.setDefaultConstructor(MapObject);