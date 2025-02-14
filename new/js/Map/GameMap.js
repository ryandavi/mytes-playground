class GameMap {
    constructor(parent, mapData = null) {
        this.parent = parent;
        this.mapData = mapData;
        
        // Core properties
        this.name = mapData?.name || 'Default Map';
        this.dimensions = mapData?.dimensions || {
            width: 1000,
            height: 1000
        };
        
        // Layer management
        this.layers = {
            background: parent.canvas.querySelector('.layer.background'),
            objects: parent.canvas.querySelector('.layer.foreground'),
            overlay: parent.canvas.querySelector('.layer.overlay')
        };

        // Map elements
        this.objects = [];
        this.zones = new Map();
        this.spawnPoints = new Map();
        
        // Systems
        this.zoneManager = new ZoneManager(this);
        this.pathfinding = new PathFindingSystem(32);
    }

    async initialize() {
        try {
            // Set dimensions
            if (this.layers.objects) {
                this.layers.objects.style.width = `${this.dimensions.width}px`;
                this.layers.objects.style.height = `${this.dimensions.height}px`;
            }

            // Initialize background
            if (this.mapData?.background) {
                this.setBackground(this.mapData.background);
            }

            // Load zones if defined in map data
            if (this.mapData?.zones) {
                this.mapData.zones.forEach(zoneData => {
                    this.zoneManager.addZone(zoneData);
                });
            }

            // Load spawn points
            if (this.mapData?.spawns) {
                Object.entries(this.mapData.spawns).forEach(([key, value]) => {
                    this.spawnPoints.set(key, value);
                });
            }

            // Load predefined objects
            if (this.mapData?.objects) {
                await this.loadPredefinedObjects();
            }

            // Add random nature objects if no predefined objects
            if (!this.mapData?.objects) {
                // this.addRandomObjects(100, ['GRASS']);
                // this.addRandomObjects(20, ['FLOWER']);
                this.addRandomObjects(5, ['MUSIC_BOX']);
            }

            // Initialize pathfinding
            this.pathfinding.init();

            return true;
        } catch (error) {
            console.error('Error initializing map:', error);
            return false;
        }
    }

    setBackground(background) {
        if (!this.layers.background) return;

        if (background.type === 'color') {
            this.layers.background.style.backgroundColor = background.value;
        } else if (background.type === 'image') {
            this.layers.background.style.backgroundImage = `url(${background.url})`;
            this.layers.background.style.backgroundSize = 'cover';
        }
    }

    async loadPredefinedObjects() {
        for (const objData of this.mapData.objects) {
            await this.addObject(
                objData.type,
                objData.variant,
                objData.x,
                objData.y,
                objData.properties
            );
        }
    }

    addObject(type, variant, x, y, properties = {}) {
        const object = MapObjectFactory.create(type, variant, x, y);
        if (object) {
            // Apply any custom properties
            Object.assign(object, properties);
            
            // Add to objects array
            this.objects.push(object);
            
            // Render in the objects layer
            if (this.layers.objects) {
                object.render(this.layers.objects, this.parent);
            }
        }
        return object;
    }

    addRandomObjects(count, types = ['GRASS']) {
        if (!this.layers.objects) return;

        const maxX = this.dimensions.width;
        const maxY = this.dimensions.height;

        for (let i = 0; i < count; i++) {
            // Randomly select type and variant
            const type = types[Math.floor(Math.random() * types.length)];
            const config = MAP_OBJECT_TYPES[type];
            const variant = config.variants[Math.floor(Math.random() * config.variants.length)];
            
            const x = Math.floor(Math.random() * maxX);
            const y = Math.floor(Math.random() * maxY);

            this.addObject(type, variant, x, y);
        }
    }

    getObjectsInRadius(x, y, radius) {
        return this.objects.filter(obj => {
            const dx = obj.posX - x;
            const dy = obj.posY - y;
            return Math.sqrt(dx * dx + dy * dy) <= radius && obj.active;
        });
    }

    getSpawnPoint(type = 'myte') {
        const spawn = this.spawnPoints.get(type);
        if (Array.isArray(spawn)) {
            // If it's an array of spawn points, choose random one
            return spawn[Math.floor(Math.random() * spawn.length)];
        }
        return spawn || { x: 0, y: 0 };
    }

    getRandomPosition() {
        return {
            x: Math.random() * this.dimensions.width,
            y: Math.random() * this.dimensions.height
        };
    }

    isPositionValid(x, y) {
        // Check boundaries
        if (x < 0 || x > this.dimensions.width || 
            y < 0 || y > this.dimensions.height) {
            return false;
        }

        // Check collision with objects
        const nearbyObjects = this.getObjectsInRadius(x, y, 50);
        return !nearbyObjects.some(obj => !obj.config.walkable);
    }

    findPath(startX, startY, endX, endY) {
        return this.pathfinding.findPath(startX, startY, endX, endY);
    }

    removeInactiveObjects() {
        this.objects = this.objects.filter(obj => obj.active);
    }

    update(deltaTime) {
        // Update all active objects
        this.objects.forEach(object => {
            if (object.update) {
                object.update(deltaTime);
            }
        });

        // Update zones
        this.parent.mytes.forEach(myte => {
            if (myte.isActive) {
                this.zoneManager.update(myte);
            }
        });

        // Clean up inactive objects periodically
        if (Math.random() < 0.01) { // 1% chance each update
            this.removeInactiveObjects();
        }
    }

    dispose() {
        // Clean up objects
        this.objects.forEach(obj => {
            if (obj.remove) {
                obj.remove();
            }
        });
        this.objects = [];

        // Clean up zones
        this.zones.clear();

        // Clean up spawn points
        this.spawnPoints.clear();
    }
}