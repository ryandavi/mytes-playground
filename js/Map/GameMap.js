class GameMap {
    constructor(parent, mapData = null) {
        this.parent = parent;
        this.mapData = mapData || {}; // Default empty object if no data provided

        // Core properties
        this.name = mapData?.name || 'Default Map';
        this.displayName = mapData?.displayName || this.name;
        this.id = null;
        this.dimensions = mapData?.dimensions || {
            width: 1000,
            height: 1000
        };

        // Layer references
        this.layers = {
            background: parent.canvas?.querySelector('.layer.background'),
            objects: parent.canvas?.querySelector('.layer.foreground'),
            overlay: parent.canvas?.querySelector('.layer.overlay'),
            debug: parent.canvas?.querySelector('.layer.debug'),
            particles: parent.canvas?.querySelector('.layer.particles')
        };

        // Systems
        this.zoneManager = new ZoneManager(this);
        this.gridSystem = new GridSystem(this);
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
// Update the testPathfinding method in GameMap class
testPathfinding(startX = 80, startY = 80, endX = 0, endY = 0, entityWidth = 32, entityHeight = 32) {
    // Check if grid system and pathfinder are available
    if (!this.gridSystem) {
        console.warn("Grid system not available, initializing...");
        this.gridSystem = new GridSystem(this);
        // Force grid system to initialize crucial components
        if (this.parent && this.parent.camera) {
            this.gridSystem.updateCulling(this.parent.camera);
        }
    }
    
    if (!this.gridSystem.pathfinder) {
        console.warn("Pathfinder not available, initializing...");
        this.gridSystem.pathfinder = new AStarPathfinder(this.gridSystem);
    }

    if (!this.parent.inputHandler.isMouseInContainer()) {
        return null;
    }

    if (this.parent.mytes && this.parent.mytes.length > 0 && this.parent.mytes[0].isActive) {
        const myte = this.parent.mytes[0];
        entityHeight = myte.size.height;
        entityWidth = myte.size.width;

        // Use the center of the myte's collider as the start position
        startX = myte.posX;
        startY = myte.posY;

        endX = this.parent.inputHandler.getAdjustedMouse().x;
        endY = this.parent.inputHandler.getAdjustedMouse().y;
        
        console.log(`Testing path from myte collider center (${startX.toFixed(0)},${startY.toFixed(0)}) to (${endX.toFixed(0)},${endY.toFixed(0)})`);
    }

    // Enable debug visualization
    this.gridSystem.pathfinder.options.debug = true;
    this.gridSystem.config.showTerrainColors = true;

    // Check for doors in the path
    this.findDoorsInPath(startX, startY, endX, endY);

    // Calculate path
    const path = this.gridSystem.pathfinder.findPath(
        startX, startY, endX, endY, entityWidth, entityHeight,
        this.parent.mytes[0].collider, // collider parameter
        { can_open_doors: true, can_swim: false, follows_paths: true }
    );

    // Visualize the path
    this.gridSystem.pathfinder.visualizePath(this.layers.debug, path || []);

    // Output results
    if (path) {
        console.log(`Path found with ${path.length} waypoints`);
    } else {
        console.log("No path found - check explored/rejected nodes for debugging");
        
        // Try diagnostic function if path failed
        if (this.gridSystem.pathfinder.diagnoseDoorPathfinding) {
            console.log("Running door diagnostic...");
            this.gridSystem.pathfinder.diagnoseDoorPathfinding(
                startX, startY, endX, endY,
                { can_open_doors: true, can_swim: false, follows_paths: true }
            );
        }
    }

    return path;
}

// Add helper method to find doors in path
findDoorsInPath(startX, startY, endX, endY) {
    if (!this.gridSystem) return [];
    
    const start = this.gridSystem.worldToGrid(startX, startY);
    const end = this.gridSystem.worldToGrid(endX, endY);
    
    console.log("Checking for doors between:", start, end);
    
    // Simple line between points to check for doors
    const linePoints = this.getLinePoints(start.x, start.y, end.x, end.y);
    
    let doorsFound = 0;
    const doors = [];
    
    for (const point of linePoints) {
        if (point.x < 0 || point.x >= this.gridSystem.gridWidth || 
            point.y < 0 || point.y >= this.gridSystem.gridHeight) {
            continue;
        }
        
        const cell = this.gridSystem.grid[point.x][point.y];
        const terrainType = cell.terrainType;
        
        if (terrainType === 'door_closed' || terrainType === 'door_open') {
            console.log(`Door terrain found at (${point.x},${point.y}): ${terrainType}`);
            doorsFound++;
            
            // Check for actual door objects
            for (const obj of cell.objects) {
                if (obj.type === 'door' || obj.objectType === 'door') {
                    doors.push({
                        x: point.x,
                        y: point.y,
                        isOpen: obj.isOpen,
                        terrainType: obj.terrainType || terrainType
                    });
                    console.log(`Door object found: open=${obj.isOpen}`);
                }
            }
        }
    }
    
    console.log(`Found ${doorsFound} doors along path`);
    return doors;
}

// Line algorithm helper
getLinePoints(x0, y0, x1, y1) {
    const points = [];
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = (x0 < x1) ? 1 : -1;
    const sy = (y0 < y1) ? 1 : -1;
    let err = dx - dy;
    
    let x = x0;
    let y = y0;
    
    while (true) {
        points.push({x, y});
        
        if (x === x1 && y === y1) break;
        
        const e2 = 2 * err;
        if (e2 > -dy) {
            err -= dy;
            x += sx;
        }
        if (e2 < dx) {
            err += dx;
            y += sy;
        }
    }
    
    return points;
}
    // Modify the initialize method in GameMap.js to handle initial loads differently
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
                await this.tileMapLoader.applyToGameMap(this, mapData);
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

            }, 3000); // Update every 3 seconds

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
