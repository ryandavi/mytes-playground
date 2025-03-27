class GridSystem {
    constructor(parent, config = {}) {
        this.parent = parent;
        // Initialize pathfinder
        this.pathfinder = new AStarPathfinder(this);

        // Grid configuration
        this.config = {
            cellSize: config.cellSize || 32,  // Base grid size (32x32)
            mainGridSize: config.mainGridSize || 64, // Larger grid size (64x64)
            width: parent.dimensions.width || 2000,  // Total width of the map
            height: parent.dimensions.height || 2000, // Total height of the map
            cullingPadding: config.cullingPadding || -64, // Increased padding for better culling behavior
        };

        this.lastCameraPos = { x: -9999, y: -9999 }; // Initialize to force first update

        // Calculate grid dimensions
        this.gridWidth = Math.ceil(this.parent.dimensions.width / this.config.cellSize);
        this.gridHeight = Math.ceil(this.parent.dimensions.height / this.config.cellSize);

        // Initialize grid cells - using arrays instead of Set where possible for performance
        this.grid = Array(this.gridWidth).fill(null).map((_, x) =>
            Array(this.gridHeight).fill(null).map((_, y) => ({
                objects: new Set(), // Still need Set for uniqueness
                tileWalkable: true, // Base tile walkability (from map data)
                objectWalkable: true, // Whether objects in this cell allow walking
                walkable: true, // Combined walkability status
                // Store cell position and dimensions
                posX: x * this.config.cellSize,
                posY: y * this.config.cellSize,
                width: this.config.cellSize,
                height: this.config.cellSize
            }))
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
            debugStats: null
        };

        this.debugInitialized = false;

        this.toggleDebug();
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
        this.parent.parent.element.removeEventListener('mousemove', this.handleMouseMove);

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
        for (let x = 0; x < (createAll ? this.gridWidth : visibleCellsX); x++) {
            for (let y = 0; y < (createAll ? this.gridHeight : visibleCellsY); y++) {
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
                }
            });
        }
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

        // Convert to world coordinates
        const mouse = this.parent.parent.getLocalMouse();

        // Get grid coordinates
        const gridPos = this.worldToGrid(mouse.x, mouse.y);

        // Update cursor tile position
        if (gridPos.x >= 0 && gridPos.x < this.gridWidth && gridPos.y >= 0 && gridPos.y < this.gridHeight) {
            const cell = this.grid[gridPos.x][gridPos.y];

            this.debugElements.cursorTile.style.left = `${cell.posX}px`;
            this.debugElements.cursorTile.style.top = `${cell.posY}px`;

            // Update coordinates text
            const coordsElement = this.debugElements.cursorTile.querySelector('.coords');
            coordsElement.innerText = `${gridPos.x}, ${gridPos.y}`;

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
        } else if (this.parent.layers.debug) {
            this.parent.layers.debug.style.display = 'none';
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
        const startGrid = this.worldToGrid(obj.posX, obj.posY);
        const endGrid = this.worldToGrid(
            obj.posX + obj.size.width,
            obj.posY + obj.size.height
        );

        const cells = new Set();
        for (let x = Math.max(0, startGrid.x); x <= Math.min(endGrid.x, this.gridWidth - 1); x++) {
            for (let y = Math.max(0, startGrid.y); y <= Math.min(endGrid.y, this.gridHeight - 1); y++) {
                cells.add(this.grid[x][y]);
            }
        }
        return cells;
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

        const cells = this.getObjectCells(obj);
        cells.forEach(cell => {
            cell.objects.delete(obj);

            // Only recalculate walkable if removing a non-walkable object
            if (!obj.config.walkable) {
                // Recalculate objectWalkable status - use Array.from only once
                const objects = Array.from(cell.objects);
                cell.objectWalkable = objects.every(o => o.config.walkable);

                // Update combined walkability
                cell.walkable = cell.tileWalkable && cell.objectWalkable;
            }
        });

        // Remove from active objects
        this.activeObjects.delete(obj);
    }

    // IMPROVED: Update object's position in grid - more efficient implementation
    updateObjectPosition(obj, oldX, oldY) {
        if (!obj) return; // Safety check

        // Skip if position hasn't changed significantly
        if (Math.abs(oldX - obj.posX) < 1 && Math.abs(oldY - obj.posY) < 1) {
            return;
        }

        // Get old and new cells
        const oldCells = this.getObjectCells({ ...obj, posX: oldX, posY: oldY });
        const newCells = this.getObjectCells(obj);

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
            }
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
            needsDebugRecreation;

        if (!forceUpdate) {
            return; // Skip update if not needed
        }

        // Save current camera position
        this.lastCameraPos.x = camera.posX;
        this.lastCameraPos.y = camera.posY;

        // Get viewport bounds with padding
        const viewport = this.parent.parent.getContainerRect();
        const pad = this.config.cullingPadding;

        const bounds = {
            left: Math.max(0, -camera.posX - pad),
            top: Math.max(0, -camera.posY - pad),
            right: Math.min(this.parent.dimensions.width, -camera.posX + viewport.width + pad),
            bottom: Math.min(this.parent.dimensions.height, -camera.posY + viewport.height + pad)
        };

        // Store for reference in other methods
        this.lastCullingBounds = bounds;

        // Convert to grid coordinates
        const startGrid = this.worldToGrid(bounds.left, bounds.top);
        const endGrid = this.worldToGrid(bounds.right, bounds.bottom);

        // Clear previously visible cells and active objects
        this.visibleCells = [];
        this.activeObjects.clear();

        // Gather visible cells and active objects from grid
        for (let x = Math.max(0, startGrid.x); x <= Math.min(endGrid.x, this.gridWidth - 1); x++) {
            for (let y = Math.max(0, startGrid.y); y <= Math.min(endGrid.y, this.gridHeight - 1); y++) {
                const cell = this.grid[x][y];
                this.visibleCells.push(cell);

                // Add objects to active set
                cell.objects.forEach(obj => {
                    this.activeObjects.add(obj);
                });
            }
        }

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
    // OPTIMIZATION: Efficient grid update from tile map data
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
                Array(this.gridHeight).fill(null).map((_, y) => ({
                    objects: new Set(),
                    tileWalkable: true,
                    objectWalkable: true,
                    walkable: true,
                    posX: x * this.config.cellSize,
                    posY: y * this.config.cellSize,
                    width: this.config.cellSize,
                    height: this.config.cellSize
                }))
            );
        }

        // Update walkability from tile grid
        for (let x = 0; x < dataWidth; x++) {
            for (let y = 0; y < dataHeight; y++) {
                if (x < tileGridData.grid.length && y < tileGridData.grid[x].length) {
                    // Update base tile walkability from tile data
                    this.grid[x][y].tileWalkable = tileGridData.grid[x][y].walkable;

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
                }

                // Update combined walkability
                this.grid[x][y].walkable = this.grid[x][y].tileWalkable && this.grid[x][y].objectWalkable;
            }
        });

        // Force culling update on next frame
        this.lastCameraPos = { x: -9999, y: -9999 };

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
                missingCount++;
            } else if (!shouldBeActive && isActive) {
                this.activeObjects.delete(obj);
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
        if (this.parent && this.parent.parent && this.parent.parent.element) {
            this.parent.parent.element.removeEventListener('mousemove', this.handleMouseMove);
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