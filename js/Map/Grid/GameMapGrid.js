class GridSystem {
    constructor(parent, config = {}) {
        this.parent = parent;

        // Initialize pathfinder with the enhanced version
        this.pathfinder = new AStarPathfinder(this);

        // Grid configuration
        this.config = {
            cellSize: config.cellSize || 32,  // Base grid size (32x32)
            mainGridSize: config.mainGridSize || 64, // Larger grid size (64x64)
            width: parent.dimensions.width || 2000,  // Total width of the map
            height: parent.dimensions.height || 2000, // Total height of the map
            cullingPadding: config.cullingPadding || 32, // Increased padding for better culling behavior
            showTerrainColors: config.showTerrainColors || false, // Whether to color cells based on terrain
            showTerrainCosts: config.showTerrainCosts || false
        };

        this.lastCameraPos = { x: -9999, y: -9999 }; // Initialize to force first update
        this.lastCameraZoom = -1;
        this._needsCullRefresh = true;

        // Calculate grid dimensions
        this.gridWidth = Math.ceil(this.parent.dimensions.width / this.config.cellSize);
        this.gridHeight = Math.ceil(this.parent.dimensions.height / this.config.cellSize);

        // Initialize grid cells - using arrays instead of Set where possible for performance
        this.grid = Array(this.gridWidth).fill(null).map((_, x) =>
            Array(this.gridHeight).fill(null).map((_, y) => this.createCellData(x, y))
        );

        // Viewport tracking for culling - use arrays for better performance
        this.visibleCells = [];
        this.activeObjects = new Set(); // Need Set for uniqueness
        this.lastCullingBounds = null; // Store last culling bounds for reference

        // OPTIMIZATION: Make debug mode off by default
        this.debugMode = false;

        this.overlayFlags = {
            grid: true,
            cursorTile: true,
            myteFrontTile: true
        };

        this.debugElements = {
            cursorTile: null,
            myteFrontTile: null,
            cullingBounds: null,
            terrainLegend: null
        };

        this.debugInitialized = false;
        this._debugResizeObserver = null;
        this._debugCanvas = null;
        this._debugCtx = null;
        this._debugDirty = false;

        // Initialize terrain colors for visualization
        this.terrainColors = {
            'path': 'rgba(100, 100, 255, 0.3)',      // Blue
            'floor': 'rgba(200, 200, 255, 0.3)',     // Light blue
            'ground': 'rgba(150, 150, 150, 0.1)',    // Gray (default)
            'grass': 'rgba(100, 200, 100, 0.3)',     // Green
            'sand': 'rgba(255, 255, 180, 0.3)',      // Yellow
            'mud': 'rgba(139, 69, 19, 0.3)',         // Brown
            'shallow_water': 'rgba(0, 191, 255, 0.3)', // Deep sky blue
            'deep_water': 'rgba(0, 0, 139, 0.4)',     // Dark blue
            'door_closed': 'rgba(139, 69, 19, 0.5)',  // Brown (like wood)
            'door_open': 'rgba(139, 69, 19, 0.2)'     // Lighter brown
        };


        Utility.logDebug(`[GridSystem Init] Calculated Grid Dimensions: ${this.gridWidth} x ${this.gridHeight}`);
        Utility.logDebug(`[GridSystem Init] Parent Dimensions: ${this.parent.dimensions.width} x ${this.parent.dimensions.height}`);
        Utility.logDebug(`[GridSystem Init] Cell Size: ${this.config.cellSize}`);
        
        // Initialize grid cells...
        // Check the actual created size
        if (this.grid.length !== this.gridWidth || (this.gridWidth > 0 && this.grid[0].length !== this.gridHeight)) {
            console.error(`[GridSystem Init] Mismatch! Grid created with size: ${this.grid.length} x ${this.grid[0]?.length || 0}`);
        } else {
            Utility.logDebug(`[GridSystem Init] Grid array created successfully with size: ${this.grid.length} x ${this.grid[0]?.length || 0}`);
        }
        if (config.debugMode === true) {
            this.toggleDebug();
        }
    }

    // Default terrain movement cost multipliers
    static terrainCosts = {
        'path': 0.9,        // Paved paths/roads (preferred)
        'floor': 0.9,       // Indoor flooring/carpet (slightly preferred)
        'ground': 1.0,      // Regular ground (baseline)
        'grass': 1.1,       // Tall grass (slightly avoided)
        'sand': 1.4,        // Sand/gravel (moderately avoided)
        'mud': 1.8,         // Mud/snow (strongly avoided)
        'shallow_water': 2.5, // Shallow water (avoided unless necessary)
        'deep_water': 5.0,  // Deep water (heavily avoided)

        'door_closed': 5.0, // Closed doors (high cost unless can_open_doors)
        'door_open': 1.0    // Open doors (normal passage)
    };

    static defaultTerrain = 'ground';
    static defaultTerrainCost = 1.0;

    createCellData(x, y) {
        return {
            objects: new Set(),
            tileWalkable: true,
            objectWalkable: true,
            walkable: true,
            swimmable: false,
            conditionallyWalkable: false,
            conditionType: null,
            conditionId: null,
            terrainType: GridSystem.defaultTerrain,
            originalTerrainType: GridSystem.defaultTerrain,
            posX: x * this.config.cellSize,
            posY: y * this.config.cellSize,
            width: this.config.cellSize,
            height: this.config.cellSize
        };
    }

    invalidatePathfinderCaches() {
        this.pathfinder?.validationCache?.clear();
    }

    // Add this method to update grid cells with terrain data
    updateCellTerrain(gridX, gridY, terrainType) {
        if (gridX < 0 || gridX >= this.gridWidth ||
            gridY < 0 || gridY >= this.gridHeight) {
            return false;
        }

        // Store the original terrain type if not already set
        if (!this.grid[gridX][gridY].originalTerrainType) {
            this.grid[gridX][gridY].originalTerrainType = this.grid[gridX][gridY].terrainType;
        }

        // Update the terrain type
        this.grid[gridX][gridY].terrainType = terrainType;

        if (this.debugMode && this.debugInitialized) {
            this._debugDirty = true;
        }

        this.invalidatePathfinderCaches();

        return true;
    }

    updateGridCellVisuals() {
        this._debugDirty = true;
    }


    initializeCullingDebug() {
        if (!this.parent?.layers?.debug) return;
        if (!this.debugElements.cullingBounds || !this.debugElements.cullingBounds.parentNode) {
            this.debugElements.cullingBounds?.remove();
            const el = document.createElement('div');
            el.className = 'culling-bounds';
            el.classList.add('ignore');
            el.setAttribute('aria-hidden', 'true');
            this.parent.layers.debug.appendChild(el);
            this.debugElements.cullingBounds = el;
        }
    }

    initializeDebugDOM() {
        if (!this.parent?.layers?.debug) return;

        const debugLayer = this.parent.layers.debug;

        // Cursor tile
        this.debugElements.cursorTile?.remove();
        const cursorTile = document.createElement('div');
        cursorTile.className = 'cursor-tile ignore';
        cursorTile.setAttribute('aria-hidden', 'true');
        cursorTile.style.width = `${this.config.cellSize}px`;
        cursorTile.style.height = `${this.config.cellSize}px`;
        const cursorCoords = document.createElement('div');
        cursorCoords.className = 'coords';
        cursorCoords.innerText = '0, 0';
        cursorTile.appendChild(cursorCoords);
        debugLayer.appendChild(cursorTile);
        this.debugElements.cursorTile = cursorTile;

        // Myte front tile
        this.debugElements.myteFrontTile?.remove();
        const myteFrontTile = document.createElement('div');
        myteFrontTile.className = 'myte-front-tile ignore';
        myteFrontTile.setAttribute('aria-hidden', 'true');
        myteFrontTile.style.width = `${this.config.cellSize}px`;
        myteFrontTile.style.height = `${this.config.cellSize}px`;
        debugLayer.appendChild(myteFrontTile);
        this.debugElements.myteFrontTile = myteFrontTile;

        // Canvas for grid rendering
        this._createDebugCanvas();

        // Culling bounds div
        this.initializeCullingDebug();

        const mapElement = this.parent?.parent?.element;
        if (!mapElement) return;

        if (this.boundMouseMoveHandler) {
            mapElement.removeEventListener('mousemove', this.boundMouseMoveHandler);
        }
        this.boundMouseMoveHandler = this.handleMouseMove.bind(this);
        mapElement.addEventListener('mousemove', this.boundMouseMoveHandler);

        if (this._debugResizeObserver) this._debugResizeObserver.disconnect();
        this._debugResizeObserver = new ResizeObserver(() => {
            if (this.debugMode) this._createDebugCanvas();
        });
        this._debugResizeObserver.observe(mapElement);

        this.debugInitialized = true;
    }

    _createDebugCanvas() {
        if (!this.parent?.layers?.debug) return;

        // Remove old canvas
        this._debugCanvas?.remove();
        this._debugCanvas = null;
        this._debugCtx = null;

        const w = this.parent.dimensions.width;
        const h = this.parent.dimensions.height;

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.className = 'debug-grid-canvas ignore';
        canvas.setAttribute('aria-hidden', 'true');
        canvas.tabIndex = -1;
        canvas.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;';
        this.parent.layers.debug.appendChild(canvas);

        this._debugCanvas = canvas;
        this._debugCtx = canvas.getContext('2d');
        this._debugDirty = true;
    }

    drawDebugGrid() {
        const ctx = this._debugCtx;
        if (!ctx) return;
        if (!this.overlayFlags.grid) return;

        const w = this._debugCanvas.width;
        const h = this._debugCanvas.height;
        ctx.clearRect(0, 0, w, h);

        const cs = this.config.cellSize;
        const showTerrain = this.config.showTerrainColors;

        for (let x = 0; x < this.gridWidth; x++) {
            for (let y = 0; y < this.gridHeight; y++) {
                const cell = this.grid[x][y];
                const px = x * cs;
                const py = y * cs;
                const s = cs - 1;

                if (!cell.walkable) {
                    ctx.fillStyle = 'rgba(255,0,0,0.2)';
                    ctx.fillRect(px, py, s, s);
                } else if (!cell.tileWalkable) {
                    ctx.fillStyle = 'rgba(255,100,0,0.1)';
                    ctx.fillRect(px, py, s, s);
                } else if (!cell.objectWalkable) {
                    ctx.fillStyle = 'rgba(255,0,100,0.1)';
                    ctx.fillRect(px, py, s, s);
                } else if (showTerrain) {
                    const tc = this.terrainColors[cell.terrainType];
                    if (tc) {
                        ctx.fillStyle = tc;
                        ctx.fillRect(px, py, s, s);
                    }
                }

                ctx.strokeStyle = 'rgba(255,255,255,0.3)';
                ctx.lineWidth = 1;
                ctx.strokeRect(px + 0.5, py + 0.5, s, s);
            }
        }

        this._debugDirty = false;
    }

    updateGridDebug(camera) {
        if (!this.debugMode || !this.debugInitialized) return;

        if (this._debugDirty) {
            this.drawDebugGrid();
        }

        this.updateTerrainLegend();
    }

    updateTerrainLegend() {
        if (!this.debugMode || !this.config.showTerrainColors) {
            if (this.debugElements.terrainLegend) {
                this.debugElements.terrainLegend.style.display = 'none';
            }
            return;
        }

        if (!this.debugElements.terrainLegend) {
            const legend = document.createElement('div');
            legend.className = 'terrain-legend debug';
            if (this.parent?.parent?.element) {
                this.parent.parent.element.appendChild(legend);
                this.debugElements.terrainLegend = legend;
            }
        }

        if (this.debugElements.terrainLegend) {
            this.debugElements.terrainLegend.style.display = 'block';
            let html = '<div style="font-weight:bold;margin-bottom:5px">Terrain Types</div>';
            Object.entries(this.terrainColors).forEach(([type, color]) => {
                const cost = GridSystem.terrainCosts[type] || GridSystem.defaultTerrainCost;
                html += `<div style="display:flex;align-items:center;margin-bottom:2px">
                    <div style="width:12px;height:12px;background-color:${color};margin-right:5px;border:1px solid white;"></div>
                    <span>${type}: ${cost.toFixed(1)}x</span></div>`;
            });
            this.debugElements.terrainLegend.innerHTML = html;
        }
    }

    toggleTerrainColors() {
        this.config.showTerrainColors = !this.config.showTerrainColors;
        if (this.debugMode && this.debugInitialized) {
            this._debugDirty = true;
            this.drawDebugGrid();
        }
        return this.config.showTerrainColors;
    }

    // Handle mouse movement to update cursor tile
    handleMouseMove(event) {
        if (!this.debugMode || !this.debugInitialized) return;
        if (!this.overlayFlags.cursorTile) return;

        const inputHandler = this.parent.parent.inputHandler;
        const mouse = inputHandler?.getMouseWorldPosition
            ? (event?.pageX !== undefined && event?.pageY !== undefined
                ? inputHandler.screenToWorldCoordinates(event.pageX, event.pageY)
                : inputHandler.getMouseWorldPosition())
            : { x: 0, y: 0 };

        // Get grid coordinates
        const gridPos = this.worldToGrid(mouse.x, mouse.y);

        // Update cursor tile position
        if (gridPos.x >= 0 && gridPos.x < this.gridWidth && gridPos.y >= 0 && gridPos.y < this.gridHeight) {
            const cell = this.grid[gridPos.x][gridPos.y];

            this.debugElements.cursorTile.style.left = `${cell.posX}px`;
            this.debugElements.cursorTile.style.top = `${cell.posY}px`;


            // Update coordinates text
            const coordsElement = this.debugElements.cursorTile.querySelector('.coords');
            coordsElement.innerText = `${cell.terrainType}: ${gridPos.x}, ${gridPos.y}`;

            if (!this.debugElements.cursorTile.classList.contains('is-visible')) {
                this.debugElements.cursorTile.classList.add('is-visible');
            }
        } else {
            this.debugElements.cursorTile.classList.remove('is-visible');
        }
    }

    // Update the tile in front of a myte based on direction
    // Update the tile in front of a myte based on direction and collider
    updateMyteFrontTile(myte) {
        if (!this.debugMode || !this.debugInitialized || !myte) return;
        if (!this.overlayFlags.myteFrontTile) return;

        // Get myte's direction
        const direction = myte.direction || DIRECTION.SOUTH;

        // Use the collider if available, otherwise fall back to the myte's position and size
        const collider = myte.collider || {
            x: 0,
            y: 0,
            width: myte.size.width,
            height: myte.size.height,
            offsetX: 0,
            offsetY: 0
        };

        // Calculate the starting point at the edge of the collider based on direction
        let edgeX, edgeY;

        // Calculate the actual collider position
        const colliderX = myte.posX + (collider.offsetX || 0);
        const colliderY = myte.posY + (collider.offsetY || 0);
        const colliderWidth = collider.width || myte.size.width;
        const colliderHeight = collider.height || myte.size.height;

        // Calculate the edge point based on direction
        switch (direction) {
            case DIRECTION.NORTH:
                // Use the top-center of the collider
                edgeX = colliderX + colliderWidth / 2;
                edgeY = colliderY;
                break;

            case DIRECTION.SOUTH:
                // Use the bottom-center of the collider
                edgeX = colliderX + colliderWidth / 2;
                edgeY = colliderY + colliderHeight;
                break;

            case DIRECTION.WEST:
                // Use the left-center of the collider
                edgeX = colliderX;
                edgeY = colliderY + colliderHeight / 2;
                break;

            case DIRECTION.EAST:
                // Use the right-center of the collider
                edgeX = colliderX + colliderWidth;
                edgeY = colliderY + colliderHeight / 2;
                break;

            // Handle diagonal directions if your game supports them
            case DIRECTION.NORTHEAST:
                edgeX = colliderX + colliderWidth;
                edgeY = colliderY;
                break;

            case DIRECTION.NORTHWEST:
                edgeX = colliderX;
                edgeY = colliderY;
                break;

            case DIRECTION.SOUTHEAST:
                edgeX = colliderX + colliderWidth;
                edgeY = colliderY + colliderHeight;
                break;

            case DIRECTION.SOUTHWEST:
                edgeX = colliderX;
                edgeY = colliderY + colliderHeight;
                break;

            default:
                // Default to bottom center if direction is unknown
                edgeX = colliderX + colliderWidth / 2;
                edgeY = colliderY + colliderHeight;
                break;
        }

        // Calculate front tile position (one tile away from the edge)
        let frontTileX = edgeX;
        let frontTileY = edgeY;
        const tileDistance = this.config.cellSize;

        // Move one tile in the faced direction
        switch (direction) {
            case DIRECTION.NORTH:
                frontTileY -= tileDistance;
                break;

            case DIRECTION.SOUTH:
                frontTileY += tileDistance;
                break;

            case DIRECTION.WEST:
                frontTileX -= tileDistance;
                break;

            case DIRECTION.EAST:
                frontTileX += tileDistance;
                break;

            // Handle diagonal directions
            case DIRECTION.NORTHEAST:
                frontTileX += tileDistance * 0.7071; // cos(45°)
                frontTileY -= tileDistance * 0.7071; // sin(45°)
                break;

            case DIRECTION.NORTHWEST:
                frontTileX -= tileDistance * 0.7071;
                frontTileY -= tileDistance * 0.7071;
                break;

            case DIRECTION.SOUTHEAST:
                frontTileX += tileDistance * 0.7071;
                frontTileY += tileDistance * 0.7071;
                break;

            case DIRECTION.SOUTHWEST:
                frontTileX -= tileDistance * 0.7071;
                frontTileY += tileDistance * 0.7071;
                break;
        }

        // Get grid position for the front tile
        const gridPos = this.worldToGrid(frontTileX, frontTileY);

        // Update front tile indicator if it's within the grid bounds
        if (gridPos.x >= 0 && gridPos.x < this.gridWidth &&
            gridPos.y >= 0 && gridPos.y < this.gridHeight) {

            const cell = this.grid[gridPos.x][gridPos.y];

            // Set the visual indicator position
            this.debugElements.myteFrontTile.style.left = `${cell.posX}px`;
            this.debugElements.myteFrontTile.style.top = `${cell.posY}px`;

            // Make sure it's visible
            if (!this.debugElements.myteFrontTile.classList.contains('is-visible')) {
                this.debugElements.myteFrontTile.classList.add('is-visible');
            }

            // Optionally, you could add a data attribute to show which direction it's in
            this.debugElements.myteFrontTile.dataset.direction = direction;
        } else {
            // Hide the indicator if outside the grid
            this.debugElements.myteFrontTile.classList.remove('is-visible');
        }
    }

    // Modify the existing toggleDebug method 
    // Enhanced version of the existing toggleDebug method
    toggleDebug() {
        const wasDebugMode = this.debugMode;
        this.debugMode = !this.debugMode;

        Utility.logDebug(`[GridSystem] Toggle debug mode: ${wasDebugMode} -> ${this.debugMode}`);

        if (this.debugMode) {
            if (!this.debugInitialized) {
                this.initializeDebugDOM();
            }

            if (this.parent.layers.debug) {
                this.parent.layers.debug.style.display = 'block';
                this._debugDirty = true;
                this.drawDebugGrid();

                if (this.parent.parent?.camera && this.lastCullingBounds) {
                    this.updateCullingVisualization(this.lastCullingBounds);
                }
            }

            const camera = this.parent.parent?.camera;
            if (camera) {
                this.forceDebugRefresh(camera);
            }
        } else {
            if (this.parent.layers.debug) {
                this.parent.layers.debug.style.display = 'none';
            }

            // Hide terrain legend when debug mode is off
            if (this.debugElements.terrainLegend) {
                this.debugElements.terrainLegend.style.display = 'none';
            }
        }

        return this.debugMode;
    }

    forceDebugRefresh(camera = this.parent?.parent?.camera) {
        if (!camera) return;

        if (this.debugMode && !this.debugInitialized) {
            this.initializeDebugDOM();
        }

        this.lastCameraPos = { x: -9999, y: -9999 };
        this.lastCameraZoom = -1;
        this._debugDirty = true;
        this.updateCulling(camera);
    }

    setOverlayFlag(key, enabled) {
        if (!(key in this.overlayFlags)) return;
        this.overlayFlags[key] = enabled;

        if (!this.debugInitialized) return;

        if (key === 'grid') {
            if (this._debugCanvas) {
                this._debugCanvas.style.display = enabled ? '' : 'none';
                if (enabled) {
                    this._debugDirty = true;
                    this.drawDebugGrid();
                }
            }
        } else if (key === 'cursorTile') {
            if (this.debugElements.cursorTile) {
                if (!enabled) {
                    this.debugElements.cursorTile.classList.remove('is-visible');
                }
            }
        } else if (key === 'myteFrontTile') {
            if (this.debugElements.myteFrontTile) {
                if (!enabled) {
                    this.debugElements.myteFrontTile.classList.remove('is-visible');
                }
            }
        }
    }

    // Convert world coordinates to grid coordinates
    worldToGrid(x, y) {
        return {
            x: Math.floor(x / this.config.cellSize),
            y: Math.floor(y / this.config.cellSize)
        };
    }

    getBoundsForGridOccupancy(obj) {
        const offsetX = obj?.collider?.offsetX || 0;
        const offsetY = obj?.collider?.offsetY || 0;
        const width = obj?.collider?.width || obj?.size?.width || 0;
        const height = obj?.collider?.height || obj?.size?.height || 0;

        return {
            left: obj.posX + offsetX,
            top: obj.posY + offsetY,
            width,
            height,
            right: obj.posX + offsetX + width,
            bottom: obj.posY + offsetY + height
        };
    }

    // Convert grid coordinates to world coordinates (center of cell)
    gridToWorld(gridX, gridY) {
        return {
            x: (gridX * this.config.cellSize) + (this.config.cellSize / 2),
            y: (gridY * this.config.cellSize) + (this.config.cellSize / 2)
        };
    }

    // CONSOLIDATED: Unified grid snapping method
    snapToGrid(x, y, width = 0, height = 0, gridSize = this.config.cellSize, options = {}) {
        const useCenter = options.useCenter ?? true;
        const useMainGrid = options.useMainGrid ?? false;

        // If using main grid override the grid size
        const effectiveGridSize = useMainGrid ? this.config.mainGridSize : gridSize;

        // If width and height are not specified, use a simpler snapping logic
        if (width === 0 && height === 0) {
            return {
                x: Math.floor(x / effectiveGridSize) * effectiveGridSize,
                y: Math.floor(y / effectiveGridSize) * effectiveGridSize
            };
        }

        // For objects with dimensions
        // Calculate how many grid cells the object spans
        const cellsWide = Math.ceil(width / effectiveGridSize);
        const cellsHigh = Math.ceil(height / effectiveGridSize);

        // If using center point for snapping decision
        if (useCenter) {
            const centerX = x + (width / 2);
            const centerY = y + (height / 2);

            // Find the nearest grid cell based on the center point
            const gridX = Math.round(centerX / effectiveGridSize) * effectiveGridSize;
            const gridY = Math.round(centerY / effectiveGridSize) * effectiveGridSize;

            // If the object is smaller than or equal to a cell
            if (cellsWide <= 1 && cellsHigh <= 1) {
                // Adjust back to top-left corner
                return {
                    x: gridX - (width / 2),
                    y: gridY - (height / 2)
                };
            }

            // For larger objects, we need to center it properly
            const widthRemainder = width % effectiveGridSize;
            const heightRemainder = height % effectiveGridSize;

            // Calculate the offset to center the object in the grid cells it occupies
            const offsetX = widthRemainder > 0 ? (effectiveGridSize - widthRemainder) / 2 : 0;
            const offsetY = heightRemainder > 0 ? (effectiveGridSize - heightRemainder) / 2 : 0;

            return {
                x: Math.floor(x / effectiveGridSize) * effectiveGridSize + offsetX,
                y: Math.floor(y / effectiveGridSize) * effectiveGridSize + offsetY
            };
        }
        // Using the top-left corner
        else {
            // Find nearest grid position
            return {
                x: Math.round(x / effectiveGridSize) * effectiveGridSize,
                y: Math.round(y / effectiveGridSize) * effectiveGridSize
            };
        }
    }

    findNearestValidPositionForEntity(entity, x, y, maxRadius = 8) {
        if (!entity || !this.pathfinder) {
            return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
        }

        const entityWidth = entity.size?.width || 0;
        const entityHeight = entity.size?.height || 0;
        const entityCollider = entity.collider || {};
        const collider = {
            offsetX: entityCollider.offsetX || 0,
            offsetY: entityCollider.offsetY || 0,
            width: entityCollider.width || entityWidth,
            height: entityCollider.height || entityHeight
        };
        const capabilities = entity.capabilities || {};

        if (this.pathfinder._validatePosition(
            entity,
            x,
            y,
            entityWidth,
            entityHeight,
            collider,
            capabilities
        )) {
            return { x, y };
        }

        const startGrid = this.worldToGrid(x, y);
        const validGrid = this.pathfinder._findNearestValidGridPos(
            entity,
            startGrid.x,
            startGrid.y,
            maxRadius,
            entityWidth,
            entityHeight,
            collider,
            capabilities
        );

        if (!validGrid) return null;

        return {
            x: validGrid.x * this.config.cellSize,
            y: validGrid.y * this.config.cellSize
        };
    }

    isEntityPositionValid(entity, x, y) {
        if (!entity) return false;

        if (this.pathfinder) {
            const entityWidth = entity.size?.width || 0;
            const entityHeight = entity.size?.height || 0;
            const entityCollider = entity.collider || {};
            const collider = {
                offsetX: entityCollider.offsetX || 0,
                offsetY: entityCollider.offsetY || 0,
                width: entityCollider.width || entityWidth,
                height: entityCollider.height || entityHeight
            };
            // For real-time movement validation, do NOT treat closed doors as passable.
            // The pathfinder skips doors for entities with canOpenDoors=true so A* can
            // route through them, but moveTowardsTarget must be blocked at closed doors
            // so the door-opening logic in canAutoOpenFor gets a chance to run.
            const capabilities = { ...(entity.capabilities || {}), canOpenDoors: false };

            return this.pathfinder._validatePosition(
                entity,
                x,
                y,
                entityWidth,
                entityHeight,
                collider,
                capabilities
            );
        }

        const cellSize = this.config.cellSize;
        const left = x + (entity.collider?.offsetX || 0);
        const top = y + (entity.collider?.offsetY || 0);
        const right = left + (entity.collider?.width || entity.size?.width || 0);
        const bottom = top + (entity.collider?.height || entity.size?.height || 0);
        const startGridX = Math.floor(left / cellSize);
        const startGridY = Math.floor(top / cellSize);
        const endGridX = Math.ceil(right / cellSize);
        const endGridY = Math.ceil(bottom / cellSize);

        for (let gridX = startGridX; gridX < endGridX; gridX++) {
            for (let gridY = startGridY; gridY < endGridY; gridY++) {
                if (gridX < 0 || gridX >= this.gridWidth ||
                    gridY < 0 || gridY >= this.gridHeight ||
                    !this.grid[gridX]?.[gridY]?.walkable) {
                    return false;
                }
            }
        }

        return true;
    }

    // Get all potential colliders for an entity
    getPotentialColliders(entity) {
        // Get all cells that the entity overlaps
        const cells = this.getObjectCells(entity);
        const potentialColliders = new Set();

        cells.forEach(cell => {
            // If the cell itself is not walkable due to tile data
            if (!cell.tileWalkable) {
                // Add the cell itself as a collider
                potentialColliders.add({
                    posX: cell.posX,
                    posY: cell.posY,
                    size: {
                        width: cell.width,
                        height: cell.height
                    },
                    config: {
                        walkable: false
                    },
                    isTileCollider: true // Flag to identify as tile collider
                });
            }

            // Add non-walkable objects from the cell
            cell.objects.forEach(obj => {
                if (obj !== entity && !obj.config.physics?.walkable) {
                    potentialColliders.add(obj);
                }
            });
        });

        return Array.from(potentialColliders);
    }

    // OPTIMIZATION: Improved boundary checking for object cells
    getObjectCells(obj) {
        const bounds = this.getBoundsForGridOccupancy(obj);
        const epsilon = 0.001;
        const startGrid = this.worldToGrid(bounds.left, bounds.top);
        const endGrid = this.worldToGrid(
            Math.max(bounds.left, bounds.right - epsilon),
            Math.max(bounds.top, bounds.bottom - epsilon)
        );

        const cells = new Set();
        for (let x = Math.max(0, startGrid.x); x <= Math.min(endGrid.x, this.gridWidth - 1); x++) {
            for (let y = Math.max(0, startGrid.y); y <= Math.min(endGrid.y, this.gridHeight - 1); y++) {
                cells.add(this.grid[x][y]);
            }
        }
        return cells;
    }



    getObjectCellsForArea(areaX, areaY, areaWidth, areaHeight) {
        const epsilon = 0.001;
        // Calculate grid boundaries for the specific area
        const startGrid = this.worldToGrid(areaX, areaY);
        const endGrid = this.worldToGrid(
            Math.max(areaX, areaX + areaWidth - epsilon),
            Math.max(areaY, areaY + areaHeight - epsilon)
        );
    
        const cells = new Set();
        // Loop through the grid cells covered by the area, clamping to grid bounds
        for (let x = Math.max(0, startGrid.x); x <= Math.min(endGrid.x, this.gridWidth - 1); x++) {
            for (let y = Math.max(0, startGrid.y); y <= Math.min(endGrid.y, this.gridHeight - 1); y++) {
                // Ensure the cell exists before adding
                if (this.grid[x] && this.grid[x][y]) {
                    cells.add(this.grid[x][y]);
                }
            }
        }
        return cells;
    }
    
    /**
     * Get potential colliders (non-walkable tiles and objects) within the specified world area.
     * Designed specifically for checking collider footprints.
     * @param {number} colliderWorldX - World X coordinate of the collider's top-left corner.
     * @param {number} colliderWorldY - World Y coordinate of the collider's top-left corner.
     * @param {number} colliderWidth - Width of the collider.
     * @param {number} colliderHeight - Height of the collider.
     * @param {Object} [entityToExclude=null] - The entity performing the check, to avoid self-collision.
     * @returns {Array<Object>} An array of potential collision objects (tile representations or actual objects).
     */
    getPotentialCollidersForArea(colliderWorldX, colliderWorldY, colliderWidth, colliderHeight, entityToExclude = null) {
        // Get grid cells overlapped specifically by the collider's area
        const cells = this.getObjectCellsForArea(colliderWorldX, colliderWorldY, colliderWidth, colliderHeight);
        const potentialColliders = new Set();

        cells.forEach(cell => {
            // Tile walkability check is REMOVED from this function.

            // Add non-walkable OBJECTS physically present in this cell
            if (cell.objects && cell.objects.size > 0) {
                 cell.objects.forEach(obj => {
                     // Check if the object is collidable (defined by having a !walkable config)
                     // and not the entity performing the check.
                     // Ensure obj and obj.config exist before checking walkable.
                     if (obj && obj !== entityToExclude && obj.config && !obj.config.physics?.walkable) {
                         potentialColliders.add(obj);
                     }
                 });
            }
        });

        // Return only the actual objects found.
        return Array.from(potentialColliders);
    }




    // Add object to grid
    addObject(obj) {
        if (!obj) return; // Safety check

        const cells = this.getObjectCells(obj);
        cells.forEach(cell => {
            cell.objects.add(obj);

            // Update object walkability
            if (!obj.config.physics?.walkable) {
                cell.objectWalkable = false;
            }

            // Update combined walkability
            cell.walkable = cell.tileWalkable && cell.objectWalkable;
        });

        // If the object is within current culling bounds, make it active immediately
        if (this.lastCullingBounds && this.isObjectVisible(obj, this.lastCullingBounds)) {
            this.activeObjects.add(obj);
        }

        obj._gridOccupancyX = obj.posX;
        obj._gridOccupancyY = obj.posY;
        this._needsCullRefresh = true;
        this.invalidatePathfinderCaches();
        if (this.debugMode && !obj.config.physics?.walkable) this._debugDirty = true;
    }

    // Helper method to check if an object is within visible bounds
    isObjectVisible(obj, bounds) {
        return obj.posX < bounds.right &&
            obj.posX + obj.size.width > bounds.left &&
            obj.posY < bounds.bottom &&
            obj.posY + obj.size.height > bounds.top;
    }

    // Remove object from grid - optimized to use pre-computed cells
    removeObject(obj) {
        if (!obj) return; // Safety check

        const trackedX = Number.isFinite(obj._gridOccupancyX) ? obj._gridOccupancyX : obj.posX;
        const trackedY = Number.isFinite(obj._gridOccupancyY) ? obj._gridOccupancyY : obj.posY;
        const cells = this.getObjectCells({ ...obj, posX: trackedX, posY: trackedY });
        cells.forEach(cell => {
            cell.objects.delete(obj);

            // Recalculate if removing a non-walkable object OR if cell is currently
            // blocked — handles the case where an object became walkable (e.g. door
            // opening) before refreshGridOccupancy calls removeObject, so the old
            // objectWalkable=false never gets cleared by the config check alone.
            if (!obj.config.physics?.walkable || !cell.objectWalkable) {
                const objects = Array.from(cell.objects);
                cell.objectWalkable = objects.every(o => o.config.physics?.walkable);
                cell.walkable = cell.tileWalkable && cell.objectWalkable;
            }
        });

        // Remove from active objects
        this.activeObjects.delete(obj);
        this._needsCullRefresh = true;
        delete obj._gridOccupancyX;
        delete obj._gridOccupancyY;
        this.invalidatePathfinderCaches();
        if (this.debugMode && !obj.config.physics?.walkable) this._debugDirty = true;
    }

    // IMPROVED: Update object's position in grid - more efficient implementation
    // UPDATED: Update object's position in grid with terrain awareness
    updateObjectPosition(obj, oldX = obj?._gridOccupancyX, oldY = obj?._gridOccupancyY) {
        if (!obj) return; // Safety check

        if (!Number.isFinite(oldX)) oldX = obj.posX;
        if (!Number.isFinite(oldY)) oldY = obj.posY;

        // Skip if position hasn't changed significantly
        if (Math.abs(oldX - obj.posX) < 1 && Math.abs(oldY - obj.posY) < 1) {
            obj._gridOccupancyX = obj.posX;
            obj._gridOccupancyY = obj.posY;
            return;
        }

        // Get old and new cells
        const oldCells = this.getObjectCells({ ...obj, posX: oldX, posY: oldY });
        const newCells = this.getObjectCells(obj);

        // Track cells that need terrain update
        const needsTerrainUpdate = new Set();

        // Find cells to remove from (cells in oldCells but not in newCells)
        oldCells.forEach(cell => {
            if (!newCells.has(cell)) {
                cell.objects.delete(obj);

                // Recalculate walkability if needed
                if (!obj.config.physics?.walkable) {
                    const objects = Array.from(cell.objects);
                    cell.objectWalkable = objects.every(o => o.config.physics?.walkable);
                    cell.walkable = cell.tileWalkable && cell.objectWalkable;
                }

                // Add to cells needing terrain update
                if (obj.terrainType) {
                    // Get grid coordinates for this cell
                    const cellX = Math.floor(cell.posX / this.config.cellSize);
                    const cellY = Math.floor(cell.posY / this.config.cellSize);

                    // Mark for terrain update
                    needsTerrainUpdate.add(`${cellX},${cellY}`);
                }
            }
        });

        // Find cells to add to (cells in newCells but not in oldCells)
        newCells.forEach(cell => {
            if (!oldCells.has(cell)) {
                cell.objects.add(obj);

                // Update walkability if needed
                if (!obj.config.physics?.walkable) {
                    cell.objectWalkable = false;
                    cell.walkable = cell.tileWalkable && cell.objectWalkable;
                }

                // Update terrain type if the object modifies terrain
                if (obj.terrainType) {
                    // Get grid coordinates for this cell
                    const cellX = Math.floor(cell.posX / this.config.cellSize);
                    const cellY = Math.floor(cell.posY / this.config.cellSize);

                    // Update terrain type
                    this.updateCellTerrain(cellX, cellY, obj.terrainType);
                }
            }
        });

        // Process terrain updates for cells the object left
        needsTerrainUpdate.forEach(key => {
            const [x, y] = key.split(',').map(Number);

            // Reset to original terrain or recalculate based on remaining objects
            let newTerrainType = this.grid[x][y].originalTerrainType || GridSystem.defaultTerrain;

            // Check if any other object in the cell defines terrain
            const objects = Array.from(this.grid[x][y].objects);
            for (const remainingObj of objects) {
                if (remainingObj.terrainType) {
                    newTerrainType = remainingObj.terrainType;
                    break;
                }
            }

            // Update the terrain
            this.updateCellTerrain(x, y, newTerrainType);
        });

        // Check visibility state for active objects management
        if (this.lastCullingBounds) {
            const wasVisible = this.isObjectVisible({ ...obj, posX: oldX, posY: oldY }, this.lastCullingBounds);
            const isVisible = this.isObjectVisible(obj, this.lastCullingBounds);

            if (isVisible && !wasVisible) {
                // Object entered visible area
                this.activeObjects.add(obj);
                if (obj.wake) obj.wake();
            } else if (!isVisible && wasVisible) {
                // Object left visible area
                this.activeObjects.delete(obj);
                if (obj.sleep) obj.sleep();
            }
        }

        obj._gridOccupancyX = obj.posX;
        obj._gridOccupancyY = obj.posY;
        this.invalidatePathfinderCaches();
        if (this.debugMode && !obj.config.physics?.walkable) this._debugDirty = true;
    }
    // Get objects in an area
    getObjectsInArea(x, y, width, height) {
        // OPTIMIZATION: Fast bounds checking
        if (x >= this.parent.dimensions.width ||
            y >= this.parent.dimensions.height ||
            x + width <= 0 ||
            y + height <= 0) {
            return [];
        }

        const startGrid = this.worldToGrid(Math.max(0, x), Math.max(0, y));
        const endGrid = this.worldToGrid(
            Math.min(x + width, this.parent.dimensions.width - 1),
            Math.min(y + height, this.parent.dimensions.height - 1)
        );

        const objects = new Set();
        for (let gridX = startGrid.x; gridX <= endGrid.x; gridX++) {
            for (let gridY = startGrid.y; gridY <= endGrid.y; gridY++) {
                if (gridX >= 0 && gridX < this.gridWidth &&
                    gridY >= 0 && gridY < this.gridHeight) {

                    // If the cell isn't walkable due to tile data, add a virtual collider
                    if (!this.grid[gridX][gridY].tileWalkable) {
                        objects.add({
                            posX: this.grid[gridX][gridY].posX,
                            posY: this.grid[gridX][gridY].posY,
                            size: {
                                width: this.grid[gridX][gridY].width,
                                height: this.grid[gridX][gridY].height
                            },
                            config: {
                                walkable: false
                            },
                            isTileCollider: true
                        });
                    }

                    // Add all regular objects
                    this.grid[gridX][gridY].objects.forEach(obj => objects.add(obj));
                }
            }
        }
        return Array.from(objects);
    }

    // Ensure all objects that should be active are included
    ensureObjectActivation(bounds) {
        // Safety check for objects that should be active but aren't in activeObjects
        const missingObjects = [];

        // Check if any objects in the parent's objects array are within bounds but not active
        this.parent.objects.forEach(obj => {
            if (this.isObjectVisible(obj, bounds) && !this.activeObjects.has(obj)) {
                this.activeObjects.add(obj);
                if (obj.wake) obj.wake();
                missingObjects.push(obj);

                // Also add to appropriate grid cells if not already there
                const cells = this.getObjectCells(obj);
                cells.forEach(cell => {
                    if (!cell.objects.has(obj)) {
                        cell.objects.add(obj);

                        // Update walkability if needed
                        if (!obj.config.physics?.walkable) {
                            cell.objectWalkable = false;
                            cell.walkable = cell.tileWalkable && cell.objectWalkable;
                        }
                    }
                });
            }
        });

        // Return number of objects added
        return missingObjects.length;
    }

    // OPTIMIZATION: Improved culling system
    // OPTIMIZATION: Improved culling system
    updateCulling(camera) {
        if (!camera) {
            Utility.warnDebug('[GridSystem] No camera provided for culling update');
            return;
        }

        // Determine when to force update culling
        const moveThreshold = this.config.cellSize / 4; // 1/4 of a cell

        // Force update in these cases:
        // 1. First update (lastCameraPos is at initialization value)
        // 2. No active objects, which might indicate a problem
        // 3. Camera moved significantly
        // 4. Debug visualization elements are missing but debug mode is on
        const needsDebugRecreation = this.debugMode && (!this.debugElements.cullingBounds || !this.debugElements.cullingBounds.parentNode);

        const forceUpdate =
            this.lastCameraPos.x === -9999 ||
            this._needsCullRefresh ||
            Math.abs(camera.posX - this.lastCameraPos.x) >= moveThreshold ||
            Math.abs(camera.posY - this.lastCameraPos.y) >= moveThreshold ||
            Math.abs(camera.zoomLevel - this.lastCameraZoom) >= 0.001 ||
            needsDebugRecreation;

        if (!forceUpdate) {
            return; // Skip update if not needed
        }

        // Save current camera position
        this.lastCameraPos.x = camera.posX;
        this.lastCameraPos.y = camera.posY;
        this.lastCameraZoom = camera.zoomLevel;
        this._needsCullRefresh = false;

        // Get viewport bounds with padding
        const viewport = this.parent.parent.getContainerRect();
        const viewportWidth = viewport.width / camera.zoomLevel;
        const viewportHeight = viewport.height / camera.zoomLevel;
        const pad = this.config.cullingPadding;

        const bounds = {
            left: Math.max(0, -camera.posX - pad),
            top: Math.max(0, -camera.posY - pad),
            right: Math.min(this.parent.dimensions.width, -camera.posX + viewportWidth + pad),
            bottom: Math.min(this.parent.dimensions.height, -camera.posY + viewportHeight + pad)
        };

        // Store for reference in other methods
        this.lastCullingBounds = bounds;

        // Convert to grid coordinates
        const startGrid = this.worldToGrid(bounds.left, bounds.top);
        const endGrid = this.worldToGrid(bounds.right, bounds.bottom);

        // Build the new active set from visible grid cells
        this.visibleCells = [];
        const nextActive = new Set();

        for (let x = Math.max(0, startGrid.x); x <= Math.min(endGrid.x, this.gridWidth - 1); x++) {
            for (let y = Math.max(0, startGrid.y); y <= Math.min(endGrid.y, this.gridHeight - 1); y++) {
                const cell = this.grid[x][y];
                this.visibleCells.push(cell);
                cell.objects.forEach(obj => nextActive.add(obj));
            }
        }

        // Wake objects that just entered the viewport
        for (const obj of nextActive) {
            if (!this.activeObjects.has(obj) && obj.wake) obj.wake();
        }

        // Sleep objects that just left the viewport
        for (const obj of this.activeObjects) {
            if (!nextActive.has(obj) && obj.sleep) obj.sleep();
        }

        this.activeObjects = nextActive;

        // Full-scan safety net: treat grid membership as authoritative in production.
        // Only run the scan in debug mode to surface insertion/removal bugs.
        if (this.debugMode) {
            const missedCount = this.ensureObjectActivation(bounds);
            if (missedCount > 0) {
                Utility.logDebug(`[GridSystem] Found ${missedCount} objects that were missed in culling`);
            }
        }

        // Update parent's activeObjectsCount
        if (this.parent.activeObjectsCount !== this.activeObjects.size) {
            this.parent.activeObjectsCount = this.activeObjects.size;
        }

        // Update debug visualization if enabled
        if (this.debugMode) {
            // Check if we need to initialize debug elements
            if (!this.debugInitialized || needsDebugRecreation) {
                Utility.logDebug('[GridSystem] Debug elements missing, reinitializing');
                this.debugInitialized = false; // Force reinitialization
                this.initializeDebugDOM();
            }

            this.updateGridDebug(camera);
            this.updateCullingVisualization(bounds);
        }
    }
    updateCullingVisualization(bounds) {
        if (!this.debugElements.cullingBounds || !this.debugElements.cullingBounds.parentNode) {
            this.initializeCullingDebug();
        }
        const el = this.debugElements.cullingBounds;
        if (el) {
            el.style.left = `${bounds.left}px`;
            el.style.top = `${bounds.top}px`;
            el.style.width = `${bounds.right - bounds.left}px`;
            el.style.height = `${bounds.bottom - bounds.top}px`;
        }
    }

    getCullingDebugStats() {
        const totalCells = this.gridWidth * this.gridHeight;
        const visibleCells = this.visibleCells.length;
        const activeObjects = this.activeObjects.size;
        const cullingRatio = totalCells > 0
            ? Math.round((1 - (visibleCells / totalCells)) * 100)
            : 0;

        return {
            visibleCells,
            activeObjects,
            totalCells,
            cullingRatio
        };
    }
    // Update from tile grid with terrain support
    updateFromTileGrid(tileGridData) {
        if (!tileGridData || !tileGridData.grid) {
            console.warn('[GridSystem] Invalid tile grid data provided');
            return;
        }

        Utility.logDebug('[GridSystem] Updating grid system from tile data');

        // Store objects by their position for later restoration
        const objectsByPosition = new Map();

        // Only store objects from grid cells that will be affected
        const dataWidth = Math.min(tileGridData.width, this.gridWidth);
        const dataHeight = Math.min(tileGridData.height, this.gridHeight);

        for (let x = 0; x < dataWidth; x++) {
            for (let y = 0; y < dataHeight; y++) {
                if (this.grid[x][y].objects.size > 0) {
                    objectsByPosition.set(`${x},${y}`, Array.from(this.grid[x][y].objects));
                }
            }
        }

        // Update grid dimensions if needed
        if (tileGridData.width !== this.gridWidth || tileGridData.height !== this.gridHeight) {
            this.gridWidth = tileGridData.width;
            this.gridHeight = tileGridData.height;

            // Create new grid with updated dimensions
            this.grid = Array(this.gridWidth).fill(null).map((_, x) =>
                Array(this.gridHeight).fill(null).map((_, y) => this.createCellData(x, y))
            );
        }

        // Update walkability and terrain types from tile grid
        for (let x = 0; x < dataWidth; x++) {
            for (let y = 0; y < dataHeight; y++) {
                if (x < tileGridData.grid.length && y < tileGridData.grid[x].length) {
                    const sourceCell = tileGridData.grid[x][y];

                    // Update base tile walkability from tile data
                    this.grid[x][y].tileWalkable = sourceCell.walkable;

                    // Update terrain type if provided
                    if (sourceCell.terrainType) {
                        this.grid[x][y].terrainType = sourceCell.terrainType;
                        this.grid[x][y].originalTerrainType = sourceCell.terrainType;
                    }

                    this.grid[x][y].swimmable = !!sourceCell.swimmable;
                    this.grid[x][y].conditionallyWalkable = !!sourceCell.conditionallyWalkable;
                    this.grid[x][y].conditionType = sourceCell.conditionType || null;
                    this.grid[x][y].conditionId = sourceCell.conditionId ?? null;

                    // Update combined walkability
                    this.grid[x][y].walkable = this.grid[x][y].tileWalkable && this.grid[x][y].objectWalkable;
                }
            }
        }

        // Restore objects to their cells and update walkability
        objectsByPosition.forEach((objects, key) => {
            const [x, y] = key.split(',').map(Number);

            if (x >= 0 && x < this.gridWidth && y >= 0 && y < this.gridHeight) {
                // Clear existing objects to avoid duplicates
                this.grid[x][y].objects.clear();
                this.grid[x][y].objectWalkable = true; // Reset object walkability

                // Add each object back
                for (const obj of objects) {
                    this.grid[x][y].objects.add(obj);

                    // Update walkability for objects that affect it
                    if (!obj.config.physics?.walkable) {
                        this.grid[x][y].objectWalkable = false;
                    }

                    // Update terrain type if the object defines it
                    if (obj.terrainType) {
                        this.grid[x][y].terrainType = obj.terrainType;
                    }
                }

                // Update combined walkability
                this.grid[x][y].walkable = this.grid[x][y].tileWalkable && this.grid[x][y].objectWalkable;
            }
        });

        this._computeStaticWallCounts();

        // Force culling update on next frame
        this.lastCameraPos = { x: -9999, y: -9999 };
        this.invalidatePathfinderCaches();
        if (this.debugMode) this._debugDirty = true;

        Utility.logDebug(`[GridSystem] Grid system updated: ${this.gridWidth}x${this.gridHeight} cells`);
    }

    // Tile walkability is static per map (only updateFromTileGrid writes it), so the
    // wall-adjacency counts the pathfinder charges per node can be computed once
    // instead of re-scanning four neighbors on every A* cost evaluation.
    _computeStaticWallCounts() {
        for (let x = 0; x < this.gridWidth; x++) {
            for (let y = 0; y < this.gridHeight; y++) {
                let wallCount = 0;
                if (x === 0 || !this.grid[x - 1][y].tileWalkable) wallCount++;
                if (x === this.gridWidth - 1 || !this.grid[x + 1][y].tileWalkable) wallCount++;
                if (y === 0 || !this.grid[x][y - 1].tileWalkable) wallCount++;
                if (y === this.gridHeight - 1 || !this.grid[x][y + 1].tileWalkable) wallCount++;
                this.grid[x][y].staticWallCount = wallCount;
            }
        }
    }

    // Sync active objects with the parent
    syncActiveObjects() {
        // If parent has a different active object count than we do, force a culling update
        if (this.parent && this.parent.activeObjectsCount !== this.activeObjects.size) {
            Utility.logDebug(`[GridSystem] Active objects count mismatch: Grid=${this.activeObjects.size}, Map=${this.parent.activeObjectsCount}`);
            this.lastCameraPos = { x: -9999, y: -9999 }; // Force update on next frame
        }
    }

    // Active object verification - call periodically to ensure consistency
    verifyActiveObjects(camera) {
        if (!this.lastCullingBounds) {
            // No culling has happened yet, trigger it
            this.updateCulling(camera);
            return;
        }

        // Full parent.objects scan is expensive at scale. Run it only in debug
        // mode so the grid is the authoritative source in production.
        if (!this.debugMode) return 0;

        // Count how many active objects should be visible but aren't
        let missingCount = 0;
        let extraCount = 0;

        // Check for objects that should be active but aren't
        this.parent.objects.forEach(obj => {
            const shouldBeActive = this.isObjectVisible(obj, this.lastCullingBounds);
            const isActive = this.activeObjects.has(obj);

            if (shouldBeActive && !isActive) {
                this.activeObjects.add(obj);
                const cells = this.getObjectCells(obj);
                cells.forEach(cell => {
                    if (!cell.objects.has(obj)) {
                        cell.objects.add(obj);
                    }
                });
                if (obj.wake) obj.wake();
                missingCount++;
            } else if (!shouldBeActive && isActive) {
                this.activeObjects.delete(obj);
                if (obj.sleep) obj.sleep();
                extraCount++;
            }
        });

        // Update parent count if needed
        if (missingCount > 0 || extraCount > 0) {
            Utility.logDebug(`[GridSystem] Corrected active objects: Added ${missingCount}, Removed ${extraCount}`);
            this.parent.activeObjectsCount = this.activeObjects.size;
        }

        return missingCount + extraCount;
    }

    // Method to get active objects - useful for GameMap to query
    getActiveObjects() {
        return Array.from(this.activeObjects);
    }

    // Method to get inactive objects
    getInactiveObjects() {
        const allObjects = new Set(this.parent.objects);
        this.activeObjects.forEach(obj => allObjects.delete(obj));
        return Array.from(allObjects);
    }

    // Clean up resources
    dispose() {
        Utility.logDebug("[GridSystem] Disposing grid system");

        // Clear grid cells
        for (let x = 0; x < this.gridWidth; x++) {
            for (let y = 0; y < this.gridHeight; y++) {
                if (this.grid[x] && this.grid[x][y]) {
                    this.grid[x][y].objects.clear();
                }
            }
        }

        // Reset arrays
        this.grid = [];
        this.visibleCells = [];
        this.activeObjects.clear();

        // Clean up debug elements
        if (this.debugElements) {
            ['cursorTile', 'myteFrontTile', 'cullingBounds', 'terrainLegend'].forEach(name => {
                this.debugElements[name]?.remove();
            });
            this.debugElements = {
                cursorTile: null,
                myteFrontTile: null,
                cullingBounds: null,
                terrainLegend: null
            };
        }

        this._debugCanvas?.remove();
        this._debugCanvas = null;
        this._debugCtx = null;
        this._debugDirty = false;
        this.debugInitialized = false;

        // Remove any event listeners
        if (this.parent && this.parent.parent && this.parent.parent.element && this.boundMouseMoveHandler) {
            this.parent.parent.element.removeEventListener('mousemove', this.boundMouseMoveHandler);
        }

        if (this._debugResizeObserver) {
            this._debugResizeObserver.disconnect();
            this._debugResizeObserver = null;
        }

        // Clean up pathfinder
        if (this.pathfinder && typeof this.pathfinder.dispose === 'function') {
            this.pathfinder.dispose();
        }

        this.pathfinder = null;
        this.parent = null;

        Utility.logDebug("[GridSystem] Grid system disposed successfully");
    }
}
