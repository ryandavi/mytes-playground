class GameMap {
    constructor(parent, mapData = null) {
        this.parent = parent;
        this.mapData = mapData || {}; // Default empty object if no data provided

        // Core properties
        this.name = null;
        this.displayName = null;
        this.id = null;
        this.dimensions = null;

        // Layer references
        this.layers = {
            background: parent.canvas?.querySelector('.layer.background'),
            objects: parent.canvas?.querySelector('.layer.foreground'),
            overlay: parent.canvas?.querySelector('.layer.overlay'),
            debug: parent.canvas?.querySelector('.layer.debug'),
            particles: parent.canvas?.querySelector('.layer.particles')
        };

        // Systems
        this.zoneManager = null;
        this.gridSystem = null;
        this.particleSystem = null; // Will be initialized later

        // Map elements
        this.objects = [];
        // this.zones = new Map();
        this.spawnPoints = new Map();

        MapObjectFactory.parent = this;

        this.noCache = true;

        // Optimization tracking
        this.activeObjectsCount = 0;
        this.updateFrameSkip = 0;

        // Tile map loader
        this.tileMapLoader = null;

        // Flag to track initialization state
        this.initialized = false;
    }

    // Add to GameMap class
    testPathfinding() {

        if (!this.initialized || !this.gridSystem || !this.gridSystem.pathfinder) {
            return null;
        }

        if (!this.parent.inputHandler.isMouseInContainer()) return null;
    
        // Get the entity (myte)
        const myte = this.parent.mytes?.[0];
        if (!myte?.isActive) return null;
    
        // Get start position (entity top-left)
        const { posX: startX, posY: startY } = myte;
        // Get end position (target center - mouse coords)
        const { x: endX, y: endY } = this.parent.inputHandler.getAdjustedMouse();
    
        // For visualization and potentially options if needed later
        const { height: entityHeight, width: entityWidth } = myte.size;
        const { collider } = myte; // Get collider from the entity itself
    
        // show debug
        this.gridSystem.pathfinder.options.debug = true; // Keep debug options separate
        this.gridSystem.config.showTerrainColors = true;
    
        // --- MODIFIED CALL to findPath ---
        const path = this.gridSystem.pathfinder.findPath(
            myte,      // 1. Pass the entity object itself
            startX,    // 2. Entity top-left X
            startY,    // 3. Entity top-left Y
            endX,      // 4. Target center X
            endY       // 5. Target center Y
        );
        // --- END MODIFIED CALL ---
    
        // Visualization uses the entity's overall dimensions and collider
        this.gridSystem.pathfinder.visualizePath(this.layers.debug, path || [], entityWidth, entityHeight, collider);
    
        return path;
    }


    async initialize(mapId, options = {}) {
        try {
            console.log(`[GameMap] Initializing map: ${mapId}`);

            // Get initialization options
            const isInitialLoad = options.isInitialLoad || false;

            // Check if the parent and canvas exist
            if (!this.parent) {
                throw new Error('Parent is null or undefined');
            }

            if (!this.parent.canvas) {
                throw new Error('Parent canvas is null or undefined');
            }

            // Initialize particle system first to avoid dependency issues
            console.log(`[GameMap] Creating particle system`);
            this.particleSystem = new GameMapParticleSystem(this);
            this.particleSystem.start();

            // Initialize tile map loader
            if (!this.tileMapLoader) {
                console.log(`[GameMap] Creating new TileMapLoader`);
                this.tileMapLoader = new TileMapLoader(this);
            }

            // Build the TMX path - check if it already has the extension
            let tmxPath = mapId.endsWith('.tmx')
                ? `data/spritesheets/${mapId}`
                : `data/spritesheets/${mapId}.tmx`;

            console.log(`[GameMap] Loading TMX from: ${tmxPath}`);

            if (this.noCache) tmxPath = Utility.preventCache(tmxPath);

            // Try to load the TMX data without applying it yet
            let mapData;
            let tmxLoadFailed = false;
            try {
                mapData = await this.tileMapLoader.loadTileMap(tmxPath);

                if (!mapData) {
                    throw new Error(`TMX data is null or undefined`);
                }

                console.log(`[GameMap] TMX data loaded successfully`);
            } catch (tmxError) {
                console.error(`[GameMap] Failed to load TMX data:`, tmxError);
                tmxLoadFailed = true;

                // Try alternative paths
                const altPaths = [
                    `data/maps/${mapId}.tmx`,
                    `assets/maps/${mapId}.tmx`,
                    `${mapId}.tmx`
                ];

                let loaded = false;
                for (const altPath of altPaths) {
                    try {
                        console.log(`[GameMap] Trying alternative path: ${altPath}`);
                        mapData = await this.tileMapLoader.loadTileMap(altPath);
                        if (mapData) {
                            console.log(`[GameMap] Successfully loaded TMX from ${altPath}`);
                            loaded = true;
                            tmxLoadFailed = false;
                            break;
                        }
                    } catch (e) {
                        console.log(`[GameMap] Failed to load from ${altPath}`);
                    }
                }

                if (!loaded) {
                    // If this is an initial load, create a default map
                    // Otherwise, indicate that loading failed
                    if (isInitialLoad) {
                        console.log(`[GameMap] Creating default minimal map for initial load`);
                        this.createDefaultMap(mapId);
                        this.initialized = true;
                        return true;
                    } else {
                        console.error(`[GameMap] Map ${mapId} could not be loaded from any location`);
                        this.initialized = false;
                        return false;
                    }
                }
            }

            // Apply the TMX data to this GameMap instance with error handling
            try {
                console.log(`[GameMap] Applying TMX data to game map`);
                await this.applyToGameMap(mapData);



                console.log(`[GameMap] TMX data applied successfully`);
            } catch (applyError) {
                console.error(`[GameMap] Error applying TMX data:`, applyError);

                // If this is an initial load, try to create a default map
                // Otherwise, return false if TMX loading failed completely
                if (tmxLoadFailed) {
                    if (isInitialLoad) {
                        console.log(`[GameMap] Creating default minimal map for initial load after apply error`);
                        this.createDefaultMap(mapId);
                        this.initialized = true;
                        return true;
                    } else {
                        console.error(`[GameMap] Map ${mapId} could not be loaded or applied`);
                        this.initialized = false;
                        return false;
                    }
                }

                // If we got some map data but couldn't fully apply it,
                // we can extract basic properties as a fallback
                if (mapData && mapData.properties) {
                    try {
                        // Convert properties to a more accessible format
                        const props = {};
                        mapData.properties.forEach(prop => {
                            props[prop.name] = prop.value;
                        });

                        // Update map metadata
                        this.name = props.Name || mapId;
                        this.description = props.Description || '';
                        this.location = props.Location || '';

                        // Store the original properties
                        this.mapProperties = props;

                    } catch (propsError) {
                        console.warn(`[GameMap] Error extracting properties:`, propsError);
                    }
                }
            }

            // Reset debug initialization state for GridSystem
            if (this.gridSystem) {
                // Store the current debug mode
                const wasDebugMode = this.gridSystem.debugMode;

                // Reset the initialization flag
                this.gridSystem.debugInitialized = false;

                // If debug mode was on, make sure it gets reinitialized
                if (wasDebugMode) {
                    console.log(`[GameMap] Reinitializing GridSystem debug elements`);
                    // Make sure debug mode is off
                    if (this.gridSystem.debugMode) {
                        this.gridSystem.toggleDebug();
                    }

                    // Delay to ensure DOM is ready before reinitializing
                    setTimeout(() => {
                        this.gridSystem.toggleDebug(); // Toggle back on to reinitialize
                    }, 100);
                }
            }

            this._pathfindingDebugInterval = setInterval(() => {

                this.testPathfinding();

            }, 500); // Update every 3 seconds

            console.log(`[GameMap] Map ${mapId} initialization completed successfully`);
            this.initialized = true;
            return true;
        } catch (error) {
            console.error(`[GameMap] Error initializing map:`, error);

            // If this is an initial load, create a default map
            // Otherwise, return failure
            if (options.isInitialLoad) {
                try {
                    console.log(`[GameMap] Creating default minimal map for initial load after error`);
                    this.createDefaultMap(mapId);
                    this.initialized = true;
                    return true;
                } catch (e) {
                    console.error(`[GameMap] Failed to create default map:`, e);
                    this.initialized = false;
                    return false;
                }
            } else {
                this.initialized = false;
                return false;
            }
        }
    }




	async applyToGameMap(mapData) {
		if (!mapData) return;

		// Set dimensions
		this.dimensions = mapData.dimensions;
		this.name = mapData.name;
		this.id = mapData.id;
		this.displayName = mapData.displayName;
		this.description = mapData.description;
		this.location = mapData.environment.location;

		this.gridSystem = new GridSystem(this);
		this.zoneManager = new ZoneManager(this);

		console.log('Tile map dimensions:', this.dimensions);

		// set canvas
		this.parent.canvas.style.width = `${this.dimensions.width}px`;
		this.parent.canvas.style.height = `${this.dimensions.height}px`;

		// Set background from map
		const bgUrl = await this.tileMapLoader.createMapBackgroundUrl(mapData);
		if (bgUrl) {
			this.setBackground({
				url: bgUrl,
				color: mapData.background?.color || '#f0f0f0'
			});
		} else if (mapData.background) {
			this.setBackground(mapData.background);
		}

		// Generate grid data for the GridSystem
		const gridData = this.tileMapLoader.generateGridData(mapData, {
			cellSize: this.gridSystem?.config?.cellSize || 32,
			collisionLayer: 'Collider'
		});

		// Update the grid system
		if (this.gridSystem) {
			this.gridSystem.updateFromTileGrid(gridData);
		}

		// Add zones
		if (mapData.zones) {
			console.log("mapData.zones", mapData.zones);
			for (const zoneData of mapData.zones) {
				this.zoneManager.addZone(zoneData);
			}
		}

		// Set spawn points
		if (mapData.spawns) {
			Object.entries(mapData.spawns).forEach(([key, value]) => {
				this.spawnPoints.set(key, value);
			});
		}

		// set myte position to spawn point
		// get first myte
		let mytes = this.parent.mytes;
		console.log(mytes.length);
		if (mytes.length > 0) {
			let myte = mytes[0];
			myte.setWrapperPosition(mapData.spawns.myte.x, mapData.spawns.myte.y);
		}

		// Add objects
		if (mapData.objects) {
			for (const objData of mapData.objects) {
				this.addObject(
					objData.type.toUpperCase(),
					objData.variant,
					objData.x,
					objData.y,
					objData.properties
				);
			}
		}

		// Apply terrain data to pathfinding after objects have been added
		this.applyTerrainToGameMap(mapData);
	}




	applyObjectTerrainModifiers() {
		if (!this.gridSystem) return;

		const grid = this.gridSystem.grid;

		// Check all map objects for terrain modifiers
		this.objects.forEach(obj => {
			if (!obj.type) return;

			// Check if this object type modifies terrain
			const terrainType = this.tileMapLoader.terrainModifiers[obj.type.toUpperCase()];
			if (!terrainType) return;

			// Calculate grid cells covered by this object
			const objX = Math.floor(obj.posX / this.gridSystem.config.cellSize);
			const objY = Math.floor(obj.posY / this.gridSystem.config.cellSize);
			const objWidth = Math.ceil(obj.size.width / this.gridSystem.config.cellSize);
			const objHeight = Math.ceil(obj.size.height / this.gridSystem.config.cellSize);

			// Apply terrain type to these cells
			for (let x = objX; x < objX + objWidth; x++) {
				for (let y = objY; y < objY + objHeight; y++) {
					if (x >= 0 && x < grid.length &&
						y >= 0 && y < grid[x].length) {

						// Store the original terrain type if not already set
						if (!grid[x][y].originalTerrainType) {
							grid[x][y].originalTerrainType = grid[x][y].terrainType;
						}

						// Apply the new terrain type
						grid[x][y].terrainType = terrainType;

						// Store reference to the modifying object
						grid[x][y].terrainModifier = obj;
					}
				}
			}

			// Set terrain type on the object itself for reference
			obj.terrainType = terrainType;
		});
	}

	applyTerrainToGameMap(mapData) {
		// Apply terrain data to grid system if it exists
		if (this.gridSystem && this.gridSystem.pathfinder) {
			console.log("[TileMapLoader] Applying terrain types to pathfinder");
	
			// Get terrain costs from the pathfinder or use our local copy
			let customTerrainCosts = {};
			
			// Start with our default costs
			Object.assign(customTerrainCosts, GridSystem.terrainCosts);
	
			// Check for custom terrain costs in map properties
			if (mapData.properties) {
				Object.keys(mapData.properties).forEach(key => {
					if (key.startsWith('terrain_cost_')) {
						const terrainType = key.replace('terrain_cost_', '');
						const cost = parseFloat(mapData.properties[key]);
						if (!isNaN(cost)) {
							customTerrainCosts[terrainType] = cost;
						}
					}
				});
			}
	
			// Process objects that modify terrain
			this.applyObjectTerrainModifiers();
			
			// Update pathfinder to check if entity can swim when calculating paths
			if (this.gridSystem.pathfinder.setTerrainCosts) {
				const originalIsWalkable = this.gridSystem.pathfinder.isWalkable;
				
				// Override isWalkable to check swimming ability and conditional walkability
				this.gridSystem.pathfinder.isWalkable = function(x, y, entity) {
					const node = this.grid.getNodeAt(x, y);
					if (!node) return false;
					
					// If it's a water tile, check if entity can swim
					if (!node.walkable && node.swimmable) {
						return entity && entity.canSwim === true;
					}
					
					// If it's a conditionally walkable tile (like a door), check the condition
					if (!node.walkable && node.conditionallyWalkable) {
						if (node.conditionType === 'door') {
							// Get the door object using conditionId
							const door = this.getObjectById(node.conditionId);
							// Check if door exists and is open
							return door && door.isOpen === true;
						}
						// Add more condition types as needed
					}
					
					// Otherwise use the original walkable check
					return node.walkable;
				};
				
				// Update terrain costs
				this.gridSystem.pathfinder.setTerrainCosts(customTerrainCosts);
			}
		}
	}



    // Keep the createDefaultMap method for initial loads
    createDefaultMap(mapId) {
        console.log(`[GameMap] Creating default map for ${mapId}`);

        // Set basic properties
        this.name = mapId;
        this.id = mapId;
        this.description = 'Default Map';
        this.location = 'Unknown';

        // Set up dimensions
        this.dimensions = {
            width: 1000,
            height: 1000
        };

        // Set a background color
        if (this.layers.background) {
            // this.layers.background.style.backgroundColor = '#87CEEB';
        }

        // Add a spawn point
        this.spawnPoints.set('default', { x: 500, y: 500 });
        this.spawnPoints.set('myte', { x: 500, y: 500 });

        // Add a few basic objects if needed
        // Note: This is safe because we've already initialized the particle system
        try {
            this.addObject('BUTTERFLY', 'small', 200, 200);
        } catch (e) {
            console.warn(`[GameMap] Could not add default objects:`, e);
        }
    }

    // This method is now deprecated - use initialize() instead
    async loadMap(mapId, options = {}) {
        console.warn('[GameMap] GameMap.loadMap() is deprecated. Use GameMap.initialize() instead.');
        return this.initialize(mapId);
    }

    // Safe version of addObject
    addObject(type, variant, x, y, options = {}) {
        try {
            // Create the object with error handling
            let object;

            try {
                object = MapObjectFactory.create(type, variant, x, y, options);
            } catch (objError) {
                console.error(`[GameMap] Failed to create object of type: ${type}, variant: ${variant}`, objError);
                return null;
            }

            // Check if object was created successfully
            if (!object) {
                console.error(`[GameMap] Object factory returned null for type: ${type}, variant: ${variant}`);
                return null;
            }

            // Snap it to grid if possible
            if (this.gridSystem) {
                try {
                    const newposition = this.gridSystem.snapToGrid(
                        x, y,
                        object.size.width,
                        object.size.height,
                        this.gridSystem.config.cellSize
                    );

                    object.posX = newposition.x;
                    object.posY = newposition.y;
                } catch (gridError) {
                    console.warn(`[GameMap] Error snapping to grid:`, gridError);
                    // Use original position as fallback
                    object.posX = x;
                    object.posY = y;
                }
            }

            return this.add(object, options);
        } catch (error) {
            console.error(`[GameMap] Error in addObject:`, error);
            return null;
        }
    }

    // Optional method to add demonstration objects for testing
    addDemonstrationObjects() {
        try {
            this.addObject('BUTTERFLY', 'small', 100, 100);
            this.addObject('BUTTERFLY', 'purple', 400, 300);
            this.addObject('BUTTERFLY', 'blue', 400, 300);
        } catch (error) {
            console.warn(`[GameMap] Error adding demo objects:`, error);
        }
    }

    setBackground(background) {
        if (!this.layers.background) return;

        if (background.color) {
            // this.layers.background.style.backgroundColor = background.color;
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
                const dx = obj.posX + obj.size.width / 2 - x;
                const dy = obj.posY + obj.size.height / 2 - y;
                return Math.sqrt(dx * dx + dy * dy) <= radius && obj.active;
            });
        }

        // Fallback to direct search if grid system is not available
        return this.objects.filter(obj => {
            const dx = obj.posX + obj.size.width / 2 - x;
            const dy = obj.posY + obj.size.height / 2 - y;
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

    // Fixed GameMap update method to properly handle culling
    update(deltaTime) {
        // OPTIMIZATION: Ensure GridSystem active objects are consistent
        if (this.gridSystem) {
            // Every 60 frames (about 1 second), verify active objects for consistency
            this.updateFrameSkip = (this.updateFrameSkip + 1) % 60;
            if (this.updateFrameSkip === 0) {
                this.gridSystem.verifyActiveObjects(this.parent.camera);
            }

            // Update culling based on camera - this will populate activeObjects
            this.gridSystem.updateCulling(this.parent.camera);

            // Get the active objects count directly from GridSystem
            this.activeObjectsCount = this.gridSystem.activeObjects.size;

            // Update only active objects from grid system
            this.gridSystem.activeObjects.forEach(object => {
                if (object.update) {
                    object.update(deltaTime);
                }
            });
        } else {
            // Fallback to updating all objects if grid system isn't available
            this.objects.forEach(object => {
                if (object.update) {
                    object.update(deltaTime);
                }
            });

            this.activeObjectsCount = this.objects.length;
        }

        // Update zones - only for active mytes
        this.parent.mytes.forEach(myte => {
            if (myte.isActive) {
                this.zoneManager.update(myte);
            }
        });

        // Clean up inactive objects periodically
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
        // this.zones.clear();

        // Clean up spawn points
        this.spawnPoints.clear();

        // Clean up tile map loader
        if (this.tileMapLoader) {
            this.tileMapLoader.dispose();
            this.tileMapLoader = null;
        }

        // Clean up particle system
        if (this.particleSystem) {
            this.particleSystem.dispose();
            this.particleSystem = null;
        }

        // Clean up grid system
        if (this.gridSystem) {
            // Ensure grid system cleans up properly
            if (this.gridSystem.dispose) {
                this.gridSystem.dispose();
            }
            this.gridSystem = null;
        }

        if (this.layers && this.layers.debug) {
            // Clear all debug elements
            while (this.layers.debug.firstChild) {
                this.layers.debug.removeChild(this.layers.debug.firstChild);
            }
        }

        // dispose zones
        if (this.zoneManager) {
            this.zoneManager.dispose();
            this.zoneManager = null;
        }

        // Clear layer references
        this.layers = {};

        console.log("[GameMap] Map disposed successfully");
    }
}
