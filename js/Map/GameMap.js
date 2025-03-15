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

        // Layer references - avoid querying DOM repeatedly
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
        this.particleSystem = null; // Will be initialized later

        // Map elements - use more efficient data structures
        this.objects = [];
        this.zones = new Map();
        this.spawnPoints = new Map();

        MapObjectFactory.parent = this;
        
        // Optimization: Track active objects for faster updates
        this.activeObjectsCount = 0;
        this.updateFrameSkip = 0; // For less frequent updates of non-critical objects
        
        // Tile map loader
        this.tileMapLoader = null;
    }

    async initialize() {
        try {
            // Initialize tile map if not already done
            if (!this.tileMapLoader) {
                this.tileMapLoader = new TileMapLoader(this.parent);
            }
            
            // Load map data - OPTIMIZATION: Store the promise to avoid loading twice
            let mapLoadPromise;
            try {
                // Load map data
                mapLoadPromise = this.tileMapLoader.loadTileMap(`data/spritesheets/HouseNew.tmx`);
                const mapData = await mapLoadPromise;
                
                // Apply the map data to this GameMap instance
                await this.tileMapLoader.applyToGameMap(this, mapData);
                
                console.log('Tile map successfully initialized');
            } catch (error) {
                console.error('Error initializing tile map:', error);
            }

            // Initialize particle system
            this.particleSystem = new GameMapParticleSystem(this);
            this.particleSystem.start();

            // Set background if defined in map data
            if (this.mapData?.background) {
                this.setBackground(this.mapData.background);
            }

            // Load predefined objects
            if (this.mapData?.objects && this.mapData.objects.length > 0) {
                await this.loadPredefinedObjects();
            }

            // DEMONSTRATION OBJECTS - Comment these out or make conditional for production
            this.addObject('BUTTERFLY', 'small', 100, 100);
            this.addObject('BUTTERFLY', 'purple', 400, 300);
            this.addObject('BUTTERFLY', 'blue', 400, 300);

            // Calculate initial pathfinding routes if needed
            if (this.gridSystem && this.gridSystem.pathfinder) {
                const path = this.gridSystem.pathfinder.findPath(192 / 2, 192 / 2, 500, 500, 192, 192);
                if (path) {
                    console.log('Path found:', path);
                    this.gridSystem.pathfinder.visualizePath(this.layers.debug, path);
                }
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
        // OPTIMIZATION: Batch object creation for better performance
        const objectBatches = [];
        const BATCH_SIZE = 10; // Process 10 objects at a time
        
        for (let i = 0; i < this.mapData.objects.length; i += BATCH_SIZE) {
            const batch = this.mapData.objects.slice(i, i + BATCH_SIZE);
            objectBatches.push(batch);
        }
        
        // Process batches with a slight delay to avoid blocking the main thread
        for (const batch of objectBatches) {
            await Promise.all(batch.map(objData => 
                this.addObject(
                    objData.type,
                    objData.variant,
                    objData.x,
                    objData.y,
                    objData.properties
                )
            ));
            
            // Small delay to allow other operations
            if (objectBatches.length > 1) {
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }
    }

    add(object, properties = {}) {
        if (!object) return null;
        
        // Apply any custom properties
        Object.assign(object, properties);

        // Add to objects array
        this.objects.push(object);

        // Add to grid system
        if (this.gridSystem) {
            this.gridSystem.addObject(object);
        }

        // Render in the objects layer
        if (this.layers.objects) {
            object.render(this.layers.objects, this.parent);
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
        if (this.gridSystem) {
            const newposition = this.gridSystem.snapToGrid(
                x, y, 
                object.size.width, 
                object.size.height, 
                this.gridSystem.config.cellSize
            );
            
            object.posX = newposition.x;
            object.posY = newposition.y;
        }

        return this.add(object, options);
    }

    getObjectsInRadius(x, y, radius) {
        // OPTIMIZATION: Use grid system for spatial queries if available
        if (this.gridSystem) {
            const searchArea = {
                x: x - radius,
                y: y - radius,
                width: radius * 2,
                height: radius * 2
            };
            
            const nearbyObjects = this.gridSystem.getObjectsInArea(
                searchArea.x, searchArea.y, 
                searchArea.width, searchArea.height
            );
            
            // Filter by actual radius and active state
            return nearbyObjects.filter(obj => {
                const dx = obj.posX + obj.size.width/2 - x;
                const dy = obj.posY + obj.size.height/2 - y;
                return Math.sqrt(dx * dx + dy * dy) <= radius && obj.active;
            });
        }
        
        // Fallback to direct search if grid system is not available
        return this.objects.filter(obj => {
            const dx = obj.posX + obj.size.width/2 - x;
            const dy = obj.posY + obj.size.height/2 - y;
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

        // OPTIMIZATION: Use grid system for collision check
        if (this.gridSystem) {
            const gridPos = this.gridSystem.worldToGrid(x, y);
            
            // Check if the grid cell is walkable
            if (gridPos.x >= 0 && gridPos.x < this.gridSystem.gridWidth && 
                gridPos.y >= 0 && gridPos.y < this.gridSystem.gridHeight) {
                return this.gridSystem.grid[gridPos.x][gridPos.y].walkable;
            }
        }
        
        // Fallback to object-based check
        const nearbyObjects = this.getObjectsInRadius(x, y, 50);
        return !nearbyObjects.some(obj => !obj.config.walkable);
    }

    removeInactiveObjects() {
        // Find all inactive objects
        const inactiveObjects = this.objects.filter(obj => !obj.active);
        
        // Remove each from the grid
        if (this.gridSystem) {
            inactiveObjects.forEach(obj => this.gridSystem.removeObject(obj));
        }
        
        // Remove from the main array
        this.objects = this.objects.filter(obj => obj.active);
    }

    update(deltaTime) {
        // OPTIMIZATION: Limit updates to active objects from grid system
        if (this.gridSystem && this.gridSystem.activeObjects.size > 0) {
            // Update only active objects from grid system
            this.gridSystem.activeObjects.forEach(object => {
                if (object.update) {
                    object.update(deltaTime);
                }
            });
            
            this.activeObjectsCount = this.gridSystem.activeObjects.size;
        } else {
            // Fallback to updating all objects if grid system isn't available
            this.objects.forEach(object => {
                if (object.update) {
                    object.update(deltaTime);
                }
            });
            
            this.activeObjectsCount = this.objects.length;
        }

        // Update culling based on camera
        if (this.gridSystem) {
            this.gridSystem.updateCulling(this.parent.camera);
        }

        // Update zones - only for active mytes
        this.parent.mytes.forEach(myte => {
            if (myte.isActive) {
                this.zoneManager.update(myte);
            }
        });

        // Clean up inactive objects periodically
        this.updateFrameSkip = (this.updateFrameSkip + 1) % 60; // Every 60 frames (about 1 second)
        if (this.updateFrameSkip === 0) {
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

        // Clean up tile map loader
        if (this.tileMapLoader) {
            this.tileMapLoader.dispose();
        }
        
        // Clean up particle system
        if (this.particleSystem) {
            this.particleSystem.dispose();
            this.particleSystem = null;
        }
        
        // Clean up grid system
        if (this.gridSystem) {
            // Assuming GridSystem has a dispose method
            if (this.gridSystem.dispose) {
                this.gridSystem.dispose();
            }
            this.gridSystem = null;
        }
        
        // Clear layer references
        this.layers = {};
    }
}