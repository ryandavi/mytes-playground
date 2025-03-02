class GridSystem {
    constructor(parent, config = {}) {
        this.parent = parent;
        // Initialize pathfinder
        this.pathfinder = new AStarPathfinder(this);
        
        // Grid configuration
        this.config = {
            cellSize: config.cellSize || 32,  // Base grid size (32x32)
            mainGridSize: config.mainGridSize || 64, // Larger grid size (64x64)
            width: parent.dimensions.width|| 2000,  // Total width of the map
            height: parent.dimensions.height || 2000, // Total height of the map
            cullingPadding: config.cullingPadding || 32 // 128 // Extra padding around viewport for culling
        };

        this.lastCameraPos = { x: 0, y: 0 }; // Add this line to track position

        // Calculate grid dimensions
        this.gridWidth = Math.ceil(this.parent.dimensions.width/ this.config.cellSize);
        this.gridHeight = Math.ceil(this.parent.dimensions.height / this.config.cellSize);
        
        // Initialize grid cells
        this.grid = Array(this.gridWidth).fill(null).map(() => 
            Array(this.gridHeight).fill(null).map(() => ({
                objects: new Set(),
                walkable: true,
                debugElement: null
            }))
        );

        // Viewport tracking for culling
        this.visibleCells = new Set();
        this.activeObjects = new Set();

        // Debug mode
        this.debugMode = true;
        this.enableDebug(this.parent.layers.debug);

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

    // Snap world coordinates to grid
    snapToGrid(x, y, useMainGrid = false) {
        const gridSize = useMainGrid ? this.config.mainGridSize : this.config.cellSize;
        return {
            x: Math.floor(x / gridSize) * gridSize,
            y: Math.floor(y / gridSize) * gridSize
        };
    }

    // Get all cells that an object occupies
    getObjectCells(obj) {
        const startGrid = this.worldToGrid(obj.posX, obj.posY);
        const endGrid = this.worldToGrid(
            obj.posX + obj.size.width,
            obj.posY + obj.size.height
        );

        const cells = new Set();
        for (let x = startGrid.x; x <= endGrid.x; x++) {
            for (let y = startGrid.y; y <= endGrid.y; y++) {
                if (x >= 0 && x < this.gridWidth && y >= 0 && y < this.gridHeight) {
                    cells.add(this.grid[x][y]);
                }
            }
        }
        return cells;
    }

    // Add object to grid
    addObject(obj) {
        const cells = this.getObjectCells(obj);

        console.log(cells);
        cells.forEach(cell => {
            cell.objects.add(obj);
            if (!obj.config.walkable) {
                cell.walkable = false;
            }
        });
    }

    // Remove object from grid
    removeObject(obj) {
        const cells = this.getObjectCells(obj);
        cells.forEach(cell => {
            cell.objects.delete(obj);
            // Recalculate walkable status
            cell.walkable = Array.from(cell.objects).every(obj => obj.config.walkable);
        });
    }

    // Update object's position in grid
    updateObjectPosition(obj, oldX, oldY) {
        // Remove from old cells
        const oldStartGrid = this.worldToGrid(oldX, oldY);
        const oldEndGrid = this.worldToGrid(
            oldX + obj.size.width,
            oldY + obj.size.height
        );

        for (let x = oldStartGrid.x; x <= oldEndGrid.x; x++) {
            for (let y = oldStartGrid.y; y <= oldEndGrid.y; y++) {
                if (x >= 0 && x < this.gridWidth && y >= 0 && y < this.gridHeight) {
                    this.grid[x][y].objects.delete(obj);
                }
            }
        }

        // Add to new cells
        this.addObject(obj);
    }

    // Get objects in a specific cell
    getObjectsInCell(gridX, gridY) {
        if (gridX >= 0 && gridX < this.gridWidth && 
            gridY >= 0 && gridY < this.gridHeight) {
            return Array.from(this.grid[gridX][gridY].objects);
        }
        return [];
    }

    // Get objects in an area
    getObjectsInArea(x, y, width, height) {
        const startGrid = this.worldToGrid(x, y);
        const endGrid = this.worldToGrid(x + width, y + height);
        
        const objects = new Set();
        for (let gridX = startGrid.x; gridX <= endGrid.x; gridX++) {
            for (let gridY = startGrid.y; gridY <= endGrid.y; gridY++) {
                if (gridX >= 0 && gridX < this.gridWidth && 
                    gridY >= 0 && gridY < this.gridHeight) {
                    this.grid[gridX][gridY].objects.forEach(obj => objects.add(obj));
                }
            }
        }
        return Array.from(objects);
    }

    // Update culling based on camera viewport
    updateCulling(camera) {
        
        // Check if camera has moved
        const moveThreshold = 0;
        // Check if camera has moved more than the threshold
        if (Math.abs(camera.posX - this.lastCameraPos.x) < moveThreshold && 
            Math.abs(camera.posY - this.lastCameraPos.y) < moveThreshold) {
            return; // Skip update if camera movement is below threshold
        }
        
        // Save current camera position
        this.lastCameraPos.x = camera.posX;
        this.lastCameraPos.y = camera.posY;
        
        // Rest of your existing updateCulling code
        const viewport = this.parent.parent.getContainerRect();
        const pad = this.config.cullingPadding;
        
        const bounds = {
            left: -camera.posX - pad,
            top: -camera.posY - pad,
            right: -camera.posX + viewport.width + pad,
            bottom: -camera.posY + viewport.height + pad
        };

        // Convert to grid coordinates
        const startGrid = this.worldToGrid(bounds.left, bounds.top);
        const endGrid = this.worldToGrid(bounds.right, bounds.bottom);

        // Update visible cells
        this.visibleCells.clear();
        this.activeObjects.clear();

        for (let x = startGrid.x; x <= endGrid.x; x++) {
            for (let y = startGrid.y; y <= endGrid.y; y++) {
                if (x >= 0 && x < this.gridWidth && y >= 0 && y < this.gridHeight) {
                    const cell = this.grid[x][y];
                    this.visibleCells.add(cell);
                    cell.objects.forEach(obj => this.activeObjects.add(obj));
                }
            }
        }

        if (this.debugMode) {
            this.updateDebugVisuals();
        }
    }

    // Debug visualization methods
    enableDebug(container) {
        this.debugMode = true;
        this.parent.layers.debug = container;
        this.createDebugGrid();
    }

    disableDebug() {
        this.debugMode = false;
        if (this.parent.layers.debug) {
            this.grid.forEach(row => {
                row.forEach(cell => {
                    if (cell.debugElement) {
                        cell.debugElement.remove();
                        cell.debugElement = null;
                    }
                });
            });
        }
    }

    createDebugGrid() {
        if (!this.parent.layers.debug) return;

        for (let x = 0; x < this.gridWidth; x++) {
            for (let y = 0; y < this.gridHeight; y++) {
                const cell = this.grid[x][y];
                const element = document.createElement('div');
                element.className = 'grid-cell debug';

                element.style.left = `${x * this.config.cellSize}px`;
                element.style.top = `${y * this.config.cellSize}px`;
                element.style.width = `${this.config.cellSize}px`;
                element.style.height = `${this.config.cellSize}px`;

                this.parent.layers.debug.appendChild(element);
                cell.debugElement = element;
            }
        }
    }

    updateDebugVisuals() {
        if (!this.debugMode) return;

        this.grid.forEach(row => {
            row.forEach(cell => {
                if (cell.debugElement) {
                    cell.debugElement.classList.remove('walkable', 'unwalkable');
                    if (this.visibleCells.has(cell)) {
                        cell.debugElement.classList.add(cell.walkable ? 'walkable' : 'unwalkable');
                    }
                }
            });
        });
    }
}

