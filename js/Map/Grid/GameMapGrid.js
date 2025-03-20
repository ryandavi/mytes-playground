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
            cullingPadding: config.cullingPadding || 64, // Extra padding around viewport for culling
        };

        this.lastCameraPos = { x: 0, y: 0 }; // Track position for optimization

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

        // OPTIMIZATION: Make debug mode off by default
        this.debugMode = false;


        this.debugElements = {
            gridCells: [],
            cursorTile: null,
            myteFrontTile: null
        };
        this.debugInitialized = false;

        this.toggleDebug();




    }



    // New method to initialize debug DOM elements
    initializeDebugDOM() {
        if (this.debugInitialized) return;

        console.log("Initializing debug DOM...");

        // Create cursor tile indicator
        const cursorTile = document.createElement('div');
        cursorTile.className = 'debug cursor-tile';
        cursorTile.style.width = `${this.config.cellSize}px`;
        cursorTile.style.height = `${this.config.cellSize}px`;

        // Add text element for coordinates
        const cursorCoords = document.createElement('div');
        cursorCoords.className = 'coords';
        cursorCoords.innerText = '0, 0';
        cursorTile.appendChild(cursorCoords);

        this.parent.layers.debug.appendChild(cursorTile);
        this.debugElements.cursorTile = cursorTile;

        // Create myte front tile indicator
        const myteFrontTile = document.createElement('div');
        myteFrontTile.className = 'debug myte-front-tile';
        myteFrontTile.style.width = `${this.config.cellSize}px`;
        myteFrontTile.style.height = `${this.config.cellSize}px`;

        this.parent.layers.debug.appendChild(myteFrontTile);
        this.debugElements.myteFrontTile = myteFrontTile;

        // Create grid cell elements (only for visible area)
        this.createGridCellElements();

        this.debugInitialized = true;

        // Attach mouse move listener for cursor tile tracking
        this.parent.parent.element.addEventListener('mousemove', this.handleMouseMove.bind(this));
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
                cellElement.className = 'debug grid-cell';
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

        // Update grid cells if not showing the entire grid
        if (this.debugElements.gridCells.length < this.gridWidth * this.gridHeight) {
            const viewport = this.parent.parent.getContainerRect();
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

        console.log(mouse);

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

            if(!this.debugElements.cursorTile.classList.contains('visible')){
                this.debugElements.cursorTile.classList.add('visible');
            }

            // Update color based on walkability
            if (!cell.walkable) {
                this.debugElements.cursorTile.style.borderColor = 'red';
            } else {
                this.debugElements.cursorTile.style.borderColor = 'yellow';
            }
        } else {
            this.debugElements.cursorTile.classList.remove('visible');
        }
    }

    // Update the tile in front of a myte based on direction
    updateMyteFrontTile(myte) {
        
        if (!this.debugMode || !this.debugInitialized || !myte) return;



        // Get myte's position and direction
        const direction = myte.direction || 'down';
        const myteCenter = {
            x: myte.posX + myte.size.width / 2,
            y: myte.posY + myte.size.height / 2
        };

        // Calculate front tile based on direction
        let frontTileX = myteCenter.x;
        let frontTileY = myteCenter.y;

        const tileDistance = this.config.cellSize;

        switch (direction) {
            case 'up':
                frontTileY -= tileDistance;
                break;
            case 'down':
                frontTileY += tileDistance;
                break;
            case 'left':
                frontTileX -= tileDistance;
                break;
            case 'right':
                frontTileX += tileDistance;
                break;
        }

        // Get grid position
        const gridPos = this.worldToGrid(frontTileX, frontTileY);

        // Update front tile indicator
        if (gridPos.x >= 0 && gridPos.x < this.gridWidth && gridPos.y >= 0 && gridPos.y < this.gridHeight) {
            const cell = this.grid[gridPos.x][gridPos.y];

            this.debugElements.myteFrontTile.style.left = `${cell.posX}px`;
            this.debugElements.myteFrontTile.style.top = `${cell.posY}px`;


            if(!this.debugElements.myteFrontTile.classList.contains('visible')){
                this.debugElements.myteFrontTile.classList.add('visible');
            }

            // Update color based on walkability
            if (!cell.walkable) {
                this.debugElements.myteFrontTile.style.borderColor = 'darkred';
                this.debugElements.myteFrontTile.style.backgroundColor = 'rgba(255, 0, 0, 0.3)';
            } else {
                this.debugElements.myteFrontTile.style.borderColor = 'red';
                this.debugElements.myteFrontTile.style.backgroundColor = 'rgba(255, 0, 0, 0.1)';
            }
        } else {
            this.debugElements.myteFrontTile.classList.remove('visible');
        }
    }

    // Modify the existing toggleDebug method (if it exists) or create a new one
    toggleDebug() {
        this.debugMode = !this.debugMode;

        console.log("Toggle debug");

        if (this.debugMode) {
            if (!this.debugInitialized) {
                console.log("Initializing debug mode...1");
                this.initializeDebugDOM();
            }
            this.parent.layers.debug.style.display = 'block';
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
    }

    // Remove object from grid - optimized to use pre-computed cells
    removeObject(obj) {
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
    }

    // SIMPLIFIED: Update object's position in grid
    updateObjectPosition(obj, oldX, oldY) {
        // Skip if position hasn't changed significantly
        if (Math.abs(oldX - obj.posX) < 1 && Math.abs(oldY - obj.posY) < 1) {
            return;
        }

        // Simple approach: remove from grid and re-add
        this.removeObject(obj);
        this.addObject(obj);
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

    // OPTIMIZATION: Simplified culling system
    updateCulling(camera) {
        // Only update culling if camera moved significantly
        const moveThreshold = this.config.cellSize / 4; // 1/4 of a cell

        if (Math.abs(camera.posX - this.lastCameraPos.x) < moveThreshold &&
            Math.abs(camera.posY - this.lastCameraPos.y) < moveThreshold) {
            return; // Skip update if camera movement is below threshold
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

        // Convert to grid coordinates
        const startGrid = this.worldToGrid(bounds.left, bounds.top);
        const endGrid = this.worldToGrid(bounds.right, bounds.bottom);

        // Clear previously visible cells and active objects
        this.visibleCells = [];
        this.activeObjects.clear();

        // Gather visible cells and active objects
        for (let x = startGrid.x; x <= endGrid.x; x++) {
            for (let y = startGrid.y; y <= endGrid.y; y++) {
                if (x >= 0 && x < this.gridWidth && y >= 0 && y < this.gridHeight) {
                    const cell = this.grid[x][y];
                    this.visibleCells.push(cell);

                    // Add objects to active set
                    cell.objects.forEach(obj => {
                        this.activeObjects.add(obj);
                    });
                }
            }
        }


        if (this.debugMode && this.debugInitialized) {
            this.updateGridDebug(camera);
        }

    }

    // OPTIMIZATION: Efficient grid update from tile map data
    updateFromTileGrid(tileGridData) {
        if (!tileGridData || !tileGridData.grid) {
            console.warn('Invalid tile grid data provided');
            return;
        }

        console.log('Updating grid system from tile data');

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

        // Force culling update
        this.lastCameraPos = { x: -9999, y: -9999 }; // Force update by using an invalid position

        console.log(`Grid system updated: ${this.gridWidth}x${this.gridHeight} cells`);
    }
}