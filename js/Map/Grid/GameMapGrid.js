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

        this.debugElements = {
            gridCells: [],
            cursorTile: null,
            myteFrontTile: null,
            cullingBounds: null,
            debugStats: null,
            terrainLegend: null
        };

        this.debugInitialized = false;

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


        console.log(`[GridSystem Init] Calculated Grid Dimensions: ${this.gridWidth} x ${this.gridHeight}`);
        console.log(`[GridSystem Init] Parent Dimensions: ${this.parent.dimensions.width} x ${this.parent.dimensions.height}`);
        console.log(`[GridSystem Init] Cell Size: ${this.config.cellSize}`);
        
        // Initialize grid cells...
        // Check the actual created size
        if (this.grid.length !== this.gridWidth || (this.gridWidth > 0 && this.grid[0].length !== this.gridHeight)) {
            console.error(`[GridSystem Init] Mismatch! Grid created with size: ${this.grid.length} x ${this.grid[0]?.length || 0}`);
        } else {
            console.log(`[GridSystem Init] Grid array created successfully with size: ${this.grid.length} x ${this.grid[0]?.length || 0}`);
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
        if (this.pathfinder?.validationCache) {
            this.pathfinder.validationCache.clear();
        }

        const mytes = this.parent?.mytes || [];
        mytes.forEach(myte => {
            if (myte?.pathfinder?.validationCache) {
                myte.pathfinder.validationCache.clear();
            }
        });

        // Also clear caches for any map objects that have their own pathfinder
        // (e.g. NpcMapObject). Covers doors opening, gates toggling, etc.
        const objects = this.parent?.objects || [];
        objects.forEach(obj => {
            if (obj?.pathfinder?.validationCache) {
                obj.pathfinder.validationCache.clear();
            }
        });
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

        // Update visual representation if in debug mode
        if (this.debugMode && this.debugInitialized && this.config.showTerrainColors) {
            this.updateGridCellVisuals(gridX, gridY);
        }

        this.invalidatePathfinderCaches();

        return true;
    }

    updateGridCellVisuals(gridX, gridY) {
        // Find the cell element in the debug grid
        const cellElement = this.debugElements.gridCells.find(
            cell => cell.gridX === gridX && cell.gridY === gridY
        )?.element;

        if (!cellElement) return;

        // Get the terrain type for this cell
        const terrainType = this.grid[gridX][gridY].terrainType || GridSystem.defaultTerrain;

        // Update the cell background color based on terrain
        if (this.terrainColors[terrainType]) {
            cellElement.style.backgroundColor = this.terrainColors[terrainType];

            // Add a data attribute for terrain type
            cellElement.dataset.terrainType = terrainType;

            // Add cost label if debugging terrain costs
            if (this.pathfinder && this.config.showTerrainCosts) {
                const cost = GridSystem.terrainCosts[terrainType] || GridSystem.defaultTerrainCost;

                // Add or update cost label
                let costLabel = cellElement.querySelector('.terrain-cost');
                if (!costLabel) {
                    costLabel = document.createElement('span');
                    costLabel.className = 'terrain-cost';
                    costLabel.style.fontSize = '8px';
                    costLabel.style.position = 'absolute';
                    costLabel.style.top = '2px';
                    costLabel.style.left = '2px';
                    costLabel.style.color = 'white';
                    costLabel.style.textShadow = '1px 1px 1px black';
                    cellElement.appendChild(costLabel);
                }

                costLabel.textContent = cost.toFixed(1) + 'x';
            }
        }
    }


    // Initialize culling visualization elements
    initializeCullingDebug() {
        console.log('[GridSystem] Initializing culling debug elements');

        // Make sure the debug layer exists
        if (!this.parent || !this.parent.layers || !this.parent.layers.debug) {
            console.error('[GridSystem] Debug layer not available for culling visualization');
            return;
        }

        // Create culling bounds visualization if it doesn't exist or lost its parent
        if (!this.debugElements.cullingBounds || !this.debugElements.cullingBounds.parentNode) {
            // Remove any existing element first (cleanup)
            if (this.debugElements.cullingBounds && this.debugElements.cullingBounds.parentNode) {
                this.debugElements.cullingBounds.parentNode.removeChild(this.debugElements.cullingBounds);
            }

            // Create new element
            const cullingBounds = document.createElement('div');
            cullingBounds.className = 'culling-bounds';
            this.parent.layers.debug.appendChild(cullingBounds);
            this.debugElements.cullingBounds = cullingBounds;

            console.log('[GridSystem] Created culling bounds element');
        }

        // Create debug stats display if it doesn't exist or lost its parent
        if (!this.debugElements.debugStats || !this.debugElements.debugStats.parentNode) {
            // Remove any existing element first (cleanup)
            if (this.debugElements.debugStats && this.debugElements.debugStats.parentNode) {
                this.debugElements.debugStats.parentNode.removeChild(this.debugElements.debugStats);
            }

            // Create new element
            const debugStats = document.createElement('div');
            debugStats.className = 'debug-stats debug';
            debugStats.innerHTML = `
            <div class="stat"><span class="label">Visible Cells:</span><span class="value" id="visible-cells-count">0</span></div>
            <div class="stat"><span class="label">Active Objects:</span><span class="value" id="active-objects-count">0</span></div>
            <div class="stat"><span class="label">Total Cells:</span><span class="value" id="total-cells-count">${this.gridWidth * this.gridHeight}</span></div>
            <div class="stat"><span class="label">Culling Ratio:</span><span class="value" id="culling-ratio">0%</span></div>
        `;

            if (this.parent.parent && this.parent.parent.element) {
                this.parent.parent.element.appendChild(debugStats);
                console.log('[GridSystem] Created debug stats element');
            } else {
                console.warn('[GridSystem] Could not find parent element for debug stats');
            }

            this.debugElements.debugStats = debugStats;
        }
    }

    // Method to initialize debug DOM elements
    initializeDebugDOM() {
        if (this.debugInitialized) {
            console.log('[GridSystem] Debug DOM already initialized, refreshing elements');
            // Instead of returning, we'll refresh the elements to ensure they're properly created
        } else {
            console.log('[GridSystem] Initializing debug DOM elements');
        }

        // Make sure we have access to the debug layer
        if (!this.parent || !this.parent.layers || !this.parent.layers.debug) {
            console.error('[GridSystem] Debug layer not available for DOM elements');
            return;
        }

        // Create cursor tile indicator
        if (!this.debugElements.cursorTile || !this.debugElements.cursorTile.parentNode) {
            // Remove any existing element first (cleanup)
            if (this.debugElements.cursorTile && this.debugElements.cursorTile.parentNode) {
                this.debugElements.cursorTile.parentNode.removeChild(this.debugElements.cursorTile);
            }

            const cursorTile = document.createElement('div');
            cursorTile.className = 'cursor-tile';

            cursorTile.style.width = `${this.config.cellSize}px`;
            cursorTile.style.height = `${this.config.cellSize}px`;

            // Add text element for coordinates
            const cursorCoords = document.createElement('div');
            cursorCoords.className = 'coords';
            cursorCoords.innerText = '0, 0';
            cursorTile.appendChild(cursorCoords);

            this.parent.layers.debug.appendChild(cursorTile);
            this.debugElements.cursorTile = cursorTile;

            console.log('[GridSystem] Created cursor tile element');
        }

        // Create myte front tile indicator
        if (!this.debugElements.myteFrontTile || !this.debugElements.myteFrontTile.parentNode) {
            // Remove any existing element first (cleanup)
            if (this.debugElements.myteFrontTile && this.debugElements.myteFrontTile.parentNode) {
                this.debugElements.myteFrontTile.parentNode.removeChild(this.debugElements.myteFrontTile);
            }

            const myteFrontTile = document.createElement('div');
            myteFrontTile.className = 'myte-front-tile';
            this.parent.layers.debug.appendChild(myteFrontTile);
            this.debugElements.myteFrontTile = myteFrontTile;

            myteFrontTile.style.width = `${this.config.cellSize}px`;
            myteFrontTile.style.height = `${this.config.cellSize}px`;

            console.log('[GridSystem] Created myte front tile element');
        }

        // Create grid cell elements (only for visible area)
        this.createGridCellElements();

        // Initialize culling visualization
        this.initializeCullingDebug();

        this.debugInitialized = true;

        // Remove any existing listener to prevent duplicates
        if (this.boundMouseMoveHandler) {
            this.parent.parent.element.removeEventListener('mousemove', this.boundMouseMoveHandler);
        }

        // Create a bound version of the handler to use for both adding and removing
        this.boundMouseMoveHandler = this.handleMouseMove.bind(this);

        // Attach mouse move listener for cursor tile tracking
        this.parent.parent.element.addEventListener('mousemove', this.boundMouseMoveHandler);

        console.log('[GridSystem] Debug DOM initialization complete');
    }
    // Create grid cell elements (only create what's visible)
    createGridCellElements() {
        // Clear existing grid cells
        this.debugElements.gridCells.forEach(cell => cell.element.remove());
        this.debugElements.gridCells = [];

        // Get viewport bounds
        const viewport = this.parent.parent.getContainerRect();
        const visibleCellsX = Math.ceil(viewport.width / this.config.cellSize) + 1;
        const visibleCellsY = Math.ceil(viewport.height / this.config.cellSize) + 1;

        // Limit to a reasonable number to prevent performance issues
        const maxCells = 1000; // Adjust based on performance testing
        const totalCells = visibleCellsX * visibleCellsY;
        const createAll = totalCells <= maxCells;

        // Create cells for visible area only
        for (let x = 0; x < this.gridWidth; x++) { // Use full gridWidth
            for (let y = 0; y < this.gridHeight; y++) { // Use full gridHeight
                const cellElement = document.createElement('div');
                cellElement.className = 'grid-cell';

                cellElement.style.width = `${this.config.cellSize - 1}px`;
                cellElement.style.height = `${this.config.cellSize - 1}px`;
                cellElement.style.left = `${x * this.config.cellSize}px`;
                cellElement.style.top = `${y * this.config.cellSize}px`;

                this.parent.layers.debug.appendChild(cellElement);

                this.debugElements.gridCells.push({
                    element: cellElement,
                    gridX: x,
                    gridY: y
                });
            }
        }
    }

    // Update grid cell positions and visibility
    // Enhanced version of the existing updateGridDebug method
    updateGridDebug(camera) {
        if (!this.debugMode || !this.debugInitialized) return;

        // Get viewport bounds
        const viewport = this.parent.parent.getContainerRect();
        const visibleCellsX = Math.ceil(viewport.width / this.config.cellSize) + 1;
        const visibleCellsY = Math.ceil(viewport.height / this.config.cellSize) + 1;

        // Update grid cells if not showing the entire grid
        if (this.debugElements.gridCells.length < this.gridWidth * this.gridHeight) {
            const startX = Math.floor(-camera.posX / this.config.cellSize);
            const startY = Math.floor(-camera.posY / this.config.cellSize);

            this.debugElements.gridCells.forEach((cell, index) => {
                const x = startX + (index % visibleCellsX);
                const y = startY + Math.floor(index / visibleCellsX);

                if (x >= 0 && x < this.gridWidth && y >= 0 && y < this.gridHeight) {
                    cell.element.style.left = `${x * this.config.cellSize}px`;
                    cell.element.style.top = `${y * this.config.cellSize}px`;
                    cell.gridX = x;
                    cell.gridY = y;

                    // Update cell class based on walkability
                    this.updateCellClass(cell.element, x, y);

                    // Update cell color based on terrain type if enabled
                    if (this.config.showTerrainColors) {
                        this.updateGridCellVisuals(x, y);
                    }

                    cell.element.style.display = 'block';
                } else {
                    cell.element.style.display = 'none';
                }
            });
        } else {
            // Just update classes for full grid view
            this.debugElements.gridCells.forEach(cell => {
                const x = cell.gridX;
                const y = cell.gridY;

                if (x >= 0 && x < this.gridWidth && y >= 0 && y < this.gridHeight) {
                    this.updateCellClass(cell.element, x, y);

                    // Update cell color based on terrain type if enabled
                    if (this.config.showTerrainColors) {
                        this.updateGridCellVisuals(x, y);
                    }
                }
            });
        }

        // Update terrain legend if showing terrain colors
        this.updateTerrainLegend();
    }

    // New method to update or create terrain legend
    updateTerrainLegend() {
        if (!this.debugMode || !this.config.showTerrainColors) {
            // Hide legend if not showing terrain colors
            if (this.debugElements.terrainLegend) {
                this.debugElements.terrainLegend.style.display = 'none';
            }
            return;
        }

        // Create legend if it doesn't exist
        if (!this.debugElements.terrainLegend) {
            const legend = document.createElement('div');
            legend.className = 'terrain-legend debug';



            // Add to parent container
            if (this.parent && this.parent.parent && this.parent.parent.element) {
                this.parent.parent.element.appendChild(legend);
                this.debugElements.terrainLegend = legend;
            }
        }

        // Ensure legend is visible
        if (this.debugElements.terrainLegend) {
            this.debugElements.terrainLegend.style.display = 'block';

            // Update legend content
            let html = '<div style="font-weight: bold; margin-bottom: 5px">Terrain Types</div>';

            // Add entries for each terrain type
            Object.entries(this.terrainColors).forEach(([type, color]) => {
                const cost = GridSystem.terrainCosts[type] || GridSystem.defaultTerrainCost;
                html += `
            <div style="display: flex; align-items: center; margin-bottom: 2px">
                <div style="width: 12px; height: 12px; background-color: ${color}; margin-right: 5px; border: 1px solid white;"></div>
                <span>${type}: ${cost.toFixed(1)}x</span>
            </div>`;
            });

            this.debugElements.terrainLegend.innerHTML = html;
        }
    }

    // Toggle showing terrain colors in debug mode
    toggleTerrainColors() {
        this.config.showTerrainColors = !this.config.showTerrainColors;

        if (this.debugMode && this.debugInitialized) {
            // Update all grid cells
            this.updateGridDebug(this.parent.parent.camera);
        }

        return this.config.showTerrainColors;
    }


    // Helper method to update cell class based on walkability
    updateCellClass(cellElement, x, y) {
        // First, remove any existing walkability classes
        cellElement.classList.remove(
            'unwalkable',
            'tile-unwalkable',
            'object-unwalkable'
        );

        const gridCell = this.grid[x][y];
        if (!gridCell.walkable) {
            cellElement.classList.add('unwalkable');
        } else if (!gridCell.tileWalkable) {
            cellElement.classList.add('tile-unwalkable');
        } else if (!gridCell.objectWalkable) {
            cellElement.classList.add('object-unwalkable');
        }
    }

    // Handle mouse movement to update cursor tile
    handleMouseMove(event) {
        if (!this.debugMode || !this.debugInitialized) return;

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

            if (!this.debugElements.cursorTile.classList.contains('visible')) {
                this.debugElements.cursorTile.classList.add('visible');
            }
        } else {
            this.debugElements.cursorTile.classList.remove('visible');
        }
    }

    // Update the tile in front of a myte based on direction
    // Update the tile in front of a myte based on direction and collider
    updateMyteFrontTile(myte) {
        if (!this.debugMode || !this.debugInitialized || !myte) return;

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
            if (!this.debugElements.myteFrontTile.classList.contains('visible')) {
                this.debugElements.myteFrontTile.classList.add('visible');
            }

            // Optionally, you could add a data attribute to show which direction it's in
            this.debugElements.myteFrontTile.dataset.direction = direction;
        } else {
            // Hide the indicator if outside the grid
            this.debugElements.myteFrontTile.classList.remove('visible');
        }
    }

    // Modify the existing toggleDebug method 
    // Enhanced version of the existing toggleDebug method
    toggleDebug() {
        const wasDebugMode = this.debugMode;
        this.debugMode = !this.debugMode;

        console.log(`[GridSystem] Toggle debug mode: ${wasDebugMode} → ${this.debugMode}`);

        if (this.debugMode) {
            if (!this.debugInitialized) {
                console.log("[GridSystem] Initializing debug mode...");
                this.initializeDebugDOM();
            }

            if (this.parent.layers.debug) {
                this.parent.layers.debug.style.display = 'block';

                // Force an immediate update of the debug visualization
                if (this.parent.parent && this.parent.parent.camera) {
                    this.updateGridDebug(this.parent.parent.camera);

                    if (this.lastCullingBounds) {
                        const startGrid = this.worldToGrid(this.lastCullingBounds.left, this.lastCullingBounds.top);
                        const endGrid = this.worldToGrid(this.lastCullingBounds.right, this.lastCullingBounds.bottom);
                        this.updateCullingVisualization(this.lastCullingBounds, startGrid, endGrid);
                    }
                }
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
            const capabilities = entity.capabilities || {};

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
                if (obj !== entity && !obj.config.walkable) {
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
                     if (obj && obj !== entityToExclude && obj.config && !obj.config.walkable) {
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
            if (!obj.config.walkable) {
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
        this.invalidatePathfinderCaches();
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
            if (!obj.config.walkable || !cell.objectWalkable) {
                const objects = Array.from(cell.objects);
                cell.objectWalkable = objects.every(o => o.config.walkable);
                cell.walkable = cell.tileWalkable && cell.objectWalkable;
            }
        });

        // Remove from active objects
        this.activeObjects.delete(obj);
        delete obj._gridOccupancyX;
        delete obj._gridOccupancyY;
        this.invalidatePathfinderCaches();
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
                if (!obj.config.walkable) {
                    const objects = Array.from(cell.objects);
                    cell.objectWalkable = objects.every(o => o.config.walkable);
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
                if (!obj.config.walkable) {
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
            } else if (!isVisible && wasVisible) {
                // Object left visible area
                this.activeObjects.delete(obj);
            }
        }

        obj._gridOccupancyX = obj.posX;
        obj._gridOccupancyY = obj.posY;
        this.invalidatePathfinderCaches();
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
                missingObjects.push(obj);

                // Also add to appropriate grid cells if not already there
                const cells = this.getObjectCells(obj);
                cells.forEach(cell => {
                    if (!cell.objects.has(obj)) {
                        cell.objects.add(obj);

                        // Update walkability if needed
                        if (!obj.config.walkable) {
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
            console.warn('[GridSystem] No camera provided for culling update');
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
            this.activeObjects.size === 0 ||
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

        // Check for any objects that might have been missed
        const missedCount = this.ensureObjectActivation(bounds);

        if (missedCount > 0) {
            console.log(`[GridSystem] Found ${missedCount} objects that were missed in culling`);
        }

        // Update parent's activeObjectsCount
        if (this.parent.activeObjectsCount !== this.activeObjects.size) {
            this.parent.activeObjectsCount = this.activeObjects.size;
        }

        // Update debug visualization if enabled
        if (this.debugMode) {
            // Check if we need to initialize debug elements
            if (!this.debugInitialized || needsDebugRecreation) {
                console.log('[GridSystem] Debug elements missing, reinitializing');
                this.debugInitialized = false; // Force reinitialization
                this.initializeDebugDOM();
            }

            this.updateGridDebug(camera);
            this.updateCullingVisualization(bounds, startGrid, endGrid);
        }
    }
    // Add a new method for updating the culling visualization
    // Add a new method for updating the culling visualization
    updateCullingVisualization(bounds, startGrid, endGrid) {
        // Update culling bounds visualization
        if (!this.debugElements.cullingBounds || !this.debugElements.cullingBounds.parentNode) {
            // If the culling bounds element is missing, recreate it
            this.initializeCullingDebug();
        }

        const cullingBounds = this.debugElements.cullingBounds;
        if (cullingBounds) {
            cullingBounds.style.left = `${bounds.left}px`;
            cullingBounds.style.top = `${bounds.top}px`;
            cullingBounds.style.width = `${bounds.right - bounds.left}px`;
            cullingBounds.style.height = `${bounds.bottom - bounds.top}px`;
        } else {
            console.warn('[GridSystem] Culling bounds element not available for update');
        }

        // Mark grid cells as active or culled
        this.debugElements.gridCells.forEach(cell => {
            if (!cell || !cell.element || !cell.element.parentNode) return;

            const x = cell.gridX;
            const y = cell.gridY;

            // Check if the cell is within the visible range
            const isVisible = x >= startGrid.x && x <= endGrid.x &&
                y >= startGrid.y && y <= endGrid.y &&
                x >= 0 && x < this.gridWidth &&
                y >= 0 && y < this.gridHeight;

            // Update cell classes based on visibility
            if (isVisible) {
                cell.element.classList.add('active');
                cell.element.classList.remove('culled');
            } else {
                cell.element.classList.remove('active');
                cell.element.classList.add('culled');
            }
        });

        // Update stats display
        if (!this.debugElements.debugStats || !this.debugElements.debugStats.parentNode) {
            // If the debug stats element is missing, recreate it
            this.initializeCullingDebug();
        }

        if (this.debugElements.debugStats) {
            const visibleCellsCount = this.visibleCells.length;
            const activeObjectsCount = this.activeObjects.size;
            const totalCellsCount = this.gridWidth * this.gridHeight;
            const cullingRatio = Math.round((1 - (visibleCellsCount / totalCellsCount)) * 100);

            const visibleCellsElement = this.debugElements.debugStats.querySelector('#visible-cells-count');
            const activeObjectsElement = this.debugElements.debugStats.querySelector('#active-objects-count');
            const cullingRatioElement = this.debugElements.debugStats.querySelector('#culling-ratio');

            if (visibleCellsElement) visibleCellsElement.textContent = visibleCellsCount;
            if (activeObjectsElement) activeObjectsElement.textContent = activeObjectsCount;
            if (cullingRatioElement) {
                cullingRatioElement.textContent = `${cullingRatio}%`;

                // Color based on effectiveness
                cullingRatioElement.className = 'value';
                if (cullingRatio > 80) {
                    cullingRatioElement.classList.add('good');
                } else if (cullingRatio > 50) {
                    cullingRatioElement.classList.add('warning');
                } else {
                    cullingRatioElement.classList.add('bad');
                }
            }
        } else {
            console.warn('[GridSystem] Debug stats element not available for update');
        }
    }
    // Update from tile grid with terrain support
    updateFromTileGrid(tileGridData) {
        if (!tileGridData || !tileGridData.grid) {
            console.warn('[GridSystem] Invalid tile grid data provided');
            return;
        }

        console.log('[GridSystem] Updating grid system from tile data');

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
                    if (!obj.config.walkable) {
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

        // Force culling update on next frame
        this.lastCameraPos = { x: -9999, y: -9999 };
        this.invalidatePathfinderCaches();

        console.log(`[GridSystem] Grid system updated: ${this.gridWidth}x${this.gridHeight} cells`);
    }

    // Sync active objects with the parent
    syncActiveObjects() {
        // If parent has a different active object count than we do, force a culling update
        if (this.parent && this.parent.activeObjectsCount !== this.activeObjects.size) {
            console.log(`[GridSystem] Active objects count mismatch: Grid=${this.activeObjects.size}, Map=${this.parent.activeObjectsCount}`);
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
            console.log(`[GridSystem] Corrected active objects: Added ${missingCount}, Removed ${extraCount}`);
            this.parent.activeObjectsCount = this.activeObjects.size;

            // Update debug visualization if enabled
            if (this.debugMode && this.debugInitialized && this.debugElements.debugStats) {
                const activeObjectsElement = this.debugElements.debugStats.querySelector('#active-objects-count');
                if (activeObjectsElement) {
                    activeObjectsElement.textContent = this.activeObjects.size;
                }
            }
        }

        return missingCount + extraCount; // Return total corrections
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
        console.log("[GridSystem] Disposing grid system");

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
            // Handle grid cells array
            if (Array.isArray(this.debugElements.gridCells)) {
                this.debugElements.gridCells.forEach(cell => {
                    if (cell && cell.element && cell.element.parentNode) {
                        cell.element.parentNode.removeChild(cell.element);
                    }
                });
            }

            // Handle individual elements
            ['cursorTile', 'myteFrontTile', 'cullingBounds', 'debugStats'].forEach(elemName => {
                const elem = this.debugElements[elemName];
                if (elem && elem.parentNode) {
                    elem.parentNode.removeChild(elem);
                }
            });

            // Reset debug elements references
            this.debugElements = {
                gridCells: [],
                cursorTile: null,
                myteFrontTile: null,
                cullingBounds: null,
                debugStats: null
            };
        }

        // Reset debug initialization flag
        this.debugInitialized = false;

        // Remove any event listeners
        if (this.parent && this.parent.parent && this.parent.parent.element && this.boundMouseMoveHandler) {
            this.parent.parent.element.removeEventListener('mousemove', this.boundMouseMoveHandler);
        }

        // Clean up pathfinder
        if (this.pathfinder && typeof this.pathfinder.dispose === 'function') {
            this.pathfinder.dispose();
        }

        this.pathfinder = null;
        this.parent = null;

        console.log("[GridSystem] Grid system disposed successfully");
    }
}
