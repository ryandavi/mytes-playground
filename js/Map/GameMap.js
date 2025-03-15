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
            overlay: parent.canvas.querySelector('.layer.overlay'),
            debug: parent.canvas.querySelector('.layer.debug'),
            particles: parent.canvas.querySelector('.layer.particles')
        };

        // Systems
        this.zoneManager = new ZoneManager(this);
        this.gridSystem = new GridSystem(this);
        // Create the extended particle system
        this.particleSystem;

        // Map elements
        this.objects = [];
        this.zones = new Map();
        this.spawnPoints = new Map();



    }


    async initialize() {
        try {

            try {
                // Ensure tileMapLoader exists
                if (!this.tileMapLoader) {
                    this.tileMapLoader = new TileMapLoader(this.parent);
                }
                
                // Load map data
                const mapData = await this.tileMapLoader.loadTileMap(`data/spritesheets/HouseNew.tmx`);
                
                // Get the proper container for the layers
                const container = this.parent.canvas;
                
                // Render the map's tile layers
                const renderedMap = this.tileMapLoader.renderMap(mapData, container);


                
                // Apply the map data to this GameMap instance
                await this.tileMapLoader.applyToGameMap(this, mapData);
                
                console.log('Tile map successfully initialized');
            } catch (error) {
                console.error('Error initializing tile map:', error);
            }


    


            // Initialize particle system
            this.particleSystem = new GameMapParticleSystem(this);
            this.particleSystem.start();






            // Initialize background
            if (this.mapData?.background) {
                console.log(this.mapData.background);
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
                // this.addRandomObjects(5, ['MUSIC_BOX']);
            }


            // this.addObject('DOOR', 'wooden_door', 400, 100, { direction: 'right' });

            // Create a ball
            // this.addObject('BALL', 'red_ball', 100, 100);

            // this.addObject('BALL', 'red_ball', 400, 400);

            // Create a patrol guard with a specific path
            /*
            const guard = this.addObject('PATROL_GUARD', 'guard', 200, 200, {
                patrolPoints: [
                    { x: 200, y: 200 },
                    { x: 400, y: 200 },
                    { x: 400, y: 400 },
                    { x: 200, y: 400 }
                ]
            });
            */

            /* this.particleSystem.createMapEffect('rain', null, {
                intensity: 15
            });
            */

            // Create a butterfly
            //this.addObject('BUTTERFLY', 'green', 300, 300);
            this.addObject('BUTTERFLY', 'small', 100, 100);
            this.addObject('BUTTERFLY', 'purple', 400, 300);
            this.addObject('BUTTERFLY', 'blue', 400, 300);

            // Create a crop
            // this.addObject('CROP', 'tomato', 250, 250);

            // this.addObject('BED', 'bed_long', 0, 0);



            // Create a chest
            /*
            this.addObject('TREASURE_CHEST', 'wooden_chest', 200, 200, {
                items: [
                    { type: 'COIN', variant: 'gold' },
                    { type: 'HEALTH', variant: 'potion' }
                ]
            });

            // Create a golden chest
            this.addObject('TREASURE_CHEST', 'golden_chest', 400, 300, {
                items: [
                    { type: 'COIN', variant: 'gold' },
                    { type: 'COIN', variant: 'gold' },
                    { type: 'EQUIPMENT', variant: 'sword' },
                    { type: 'COIN', variant: 'gold' },
                    { type: 'COIN', variant: 'gold' },
                    { type: 'EQUIPMENT', variant: 'sword' }
                ]
            });
            */




            // Then to find a path:
            const path = this.gridSystem.pathfinder.findPath(192 / 2, 192 / 2, 500, 500, 192, 192);
            if (path) {
                console.log('Path found:', path);
                this.gridSystem.pathfinder.visualizePath(this.layers.debug, path);
            }


            return true;
        } catch (error) {
            console.error('Error initializing map:', error);
            return false;
        }
    }




    setBackground(background) {
        if (!this.layers.background) return;

        if (background.color) {
            this.layers.background.style.backgroundColor = background.color;
        }

        if (background.url) {
            this.layers.background.style.backgroundImage = `url(${background.url})`;
            this.layers.background.style.backgroundSize = 'fill';
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

    add(object, properties = {}) {
        if (object) {
            // Apply any custom properties
            Object.assign(object, properties);

            // Add to objects array
            this.objects.push(object);

            // Add to grid system
            this.gridSystem.addObject(object);

            // Render in the objects layer
            if (this.layers.objects) {
                object.render(this.layers.objects, this.parent);
            }
        }
        return object;
    }



    addObject(type, variant, x, y, options = {}) {
        // Create the object
        const object = MapObjectFactory.create(type, variant, x, y, options);

        // Check if object was created successfully
        if (!object) {
            console.error(`Failed to create object of type: ${type}, variant: ${variant}`);
            return null;
        }

        // Snap it to grid
        let newposition = this.gridSystem.snapToGridOptimal(
            x,
            y,
            object.size.width,
            object.size.height,
            this.gridSystem.config.cellSize);

        object.posX = newposition.x;
        object.posY = newposition.y;

        return this.add(object, options);
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
    removeInactiveObjects() {
        this.objects = this.objects.filter(obj => obj.active);
    }





    update(deltaTime) {
        // Update all active objects

        this.objects.forEach(object => {
            if (object.update) {
                object.update(this.parent);
            }
        });

        // Update culling based on camera
        this.gridSystem.updateCulling(this.parent.camera);



        // Only update visible objects
        this.gridSystem.activeObjects.forEach(object => {
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

        if (this.particleSystem) {  // Add these lines
            this.particleSystem.dispose();
            this.particleSystem = null;
        }

    }
}