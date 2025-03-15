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
            cullingPadding: config.cullingPadding || 64 // 128 // Extra padding around viewport for culling
        };

        this.lastCameraPos = { x: 0, y: 0 }; // Add this line to track position

        // Calculate grid dimensions
        this.gridWidth = Math.ceil(this.parent.dimensions.width / this.config.cellSize);
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

    snapToGridNearest(x, y, width, height, gridSize, useCenter = true) {
        // If we're using the center point for decision making
        if (useCenter) {
            const centerX = x + (width / 2);
            const centerY = y + (height / 2);

            // Find the nearest grid cell based on the center point
            const gridX = Math.round(centerX / gridSize) * gridSize;
            const gridY = Math.round(centerY / gridSize) * gridSize;

            // Adjust back to top-left corner
            return {
                x: gridX - (width / 2),
                y: gridY - (height / 2)
            };
        }
        // Using the top-left corner and finding the nearest grid
        else {
            // Calculate the nearest grid position for the top-left corner
            const gridX = Math.round(x / gridSize) * gridSize;
            const gridY = Math.round(y / gridSize) * gridSize;

            return { x: gridX, y: gridY };
        }
    }

    snapToGridOptimal(x, y, width, height, gridSize) {
        // Calculate how many grid cells the object spans
        const cellsWide = Math.ceil(width / gridSize);
        const cellsHigh = Math.ceil(height / gridSize);

        // If the object fits within one cell or is smaller than a cell
        if (cellsWide <= 1 && cellsHigh <= 1) {
            return this.snapToGridNearest(x, y, width, height, gridSize);
        }

        // For objects spanning multiple cells, find the best alignment

        // Calculate remainder of width/height compared to grid
        const widthRemainder = width % gridSize;
        const heightRemainder = height % gridSize;

        // Calculate the offset to center the object in the grid cells it occupies
        const offsetX = widthRemainder > 0 ? (gridSize - widthRemainder) / 2 : 0;
        const offsetY = heightRemainder > 0 ? (gridSize - heightRemainder) / 2 : 0;

        // Find nearest grid lines for the top-left corner
        const gridX = Math.round(x / gridSize) * gridSize;
        const gridY = Math.round(y / gridSize) * gridSize;

        return {
            x: gridX + offsetX,
            y: gridY + offsetY
        };
    }

    snapToGridWithCollision(x, y, width, height, gridSize, gridSystem) {
        // First get the optimal position without collision checking
        let snapped = snapToGridOptimal(x, y, width, height, gridSize);

        // Now check if this position overlaps with any unwalkable cells
        const startGridX = Math.floor(snapped.x / gridSize);
        const startGridY = Math.floor(snapped.y / gridSize);
        const endGridX = Math.ceil((snapped.x + width) / gridSize);
        const endGridY = Math.ceil((snapped.y + height) / gridSize);

        let hasCollision = false;

        // Check if any of the grid cells the object would occupy are unwalkable
        for (let gridX = startGridX; gridX < endGridX; gridX++) {
            for (let gridY = startGridY; gridY < endGridY; gridY++) {
                // Skip out of bounds cells
                if (gridX < 0 || gridX >= gridSystem.gridWidth ||
                    gridY < 0 || gridY >= gridSystem.gridHeight) {
                    continue;
                }

                if (!gridSystem.grid[gridX][gridY].walkable) {
                    hasCollision = true;
                    break;
                }
            }
            if (hasCollision) break;
        }

        // If there's a collision, try to find the nearest valid position
        if (hasCollision) {
            // This is a simplified approach - you might want to implement
            // a more sophisticated algorithm to find the best valid position
            const searchRadius = 1;

            // Try positions in a small radius around the original snapped position
            for (let offsetX = -searchRadius; offsetX <= searchRadius; offsetX++) {
                for (let offsetY = -searchRadius; offsetY <= searchRadius; offsetY++) {
                    if (offsetX === 0 && offsetY === 0) continue; // Skip the original position

                    const testX = snapped.x + offsetX * gridSize;
                    const testY = snapped.y + offsetY * gridSize;

                    // Check if this position is valid
                    let testValid = true;
                    const testStartGridX = Math.floor(testX / gridSize);
                    const testStartGridY = Math.floor(testY / gridSize);
                    const testEndGridX = Math.ceil((testX + width) / gridSize);
                    const testEndGridY = Math.ceil((testY + height) / gridSize);

                    // Check all grid cells this position would occupy
                    checkValidity:
                    for (let gridX = testStartGridX; gridX < testEndGridX; gridX++) {
                        for (let gridY = testStartGridY; gridY < testEndGridY; gridY++) {
                            // Skip out of bounds cells
                            if (gridX < 0 || gridX >= gridSystem.gridWidth ||
                                gridY < 0 || gridY >= gridSystem.gridHeight) {
                                continue;
                            }

                            if (!gridSystem.grid[gridX][gridY].walkable) {
                                testValid = false;
                                break checkValidity;
                            }
                        }
                    }

                    if (testValid) {
                        return { x: testX, y: testY };
                    }
                }
            }

            // If no valid position found in the search radius, just return the original
            // snapped position (or you could implement more complex fallback behavior)
        }

        return snapped;
    }



    getPotentialColliders(entity) {
        // Get all cells that the entity overlaps
        const cells = this.getObjectCells(entity);

        // Collect all unique objects from these cells (except the entity itself)
        const potentialColliders = new Set();
        cells.forEach(cell => {
            cell.objects.forEach(obj => {
                if (obj !== entity && !obj.config.walkable) {
                    potentialColliders.add(obj);
                }
            });
        });

        return Array.from(potentialColliders);
    }





    // Get all cells that an object occupies
    getObjectCells(obj) {
        const startGrid = this.worldToGrid(obj.posX, obj.posY);
        const endGrid = this.worldToGrid(
            obj.posX + obj.size.width,
            obj.posY + obj.size.height
        );

        const cells = new Set();
        for (let x = startGrid.x; x < endGrid.x; x++) {
            for (let y = startGrid.y; y < endGrid.y; y++) {
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

    // Add this method to GridSystem class
    highlightCursorGrid(mouseX, mouseY) {
        const gridPos = this.worldToGrid(mouseX, mouseY);

        // Remove any previous cursor highlight
        const oldHighlight = this.parent.layers.debug.querySelector('.grid-cursor-highlight');
        if (oldHighlight) oldHighlight.remove();

        // Create new highlight
        const highlight = document.createElement('div');
        highlight.className = 'grid-cell grid-cursor-highlight debug';

        // Position at grid cell
        const cellPos = this.gridToWorld(gridPos.x, gridPos.y);
        highlight.style.left = `${gridPos.x * this.config.cellSize}px`;
        highlight.style.top = `${gridPos.y * this.config.cellSize}px`;
        highlight.style.width = `${this.config.cellSize}px`;
        highlight.style.height = `${this.config.cellSize}px`;

        // Add coordinates text
        highlight.innerHTML = `<span class="grid-coords">${gridPos.x},${gridPos.y}</span>`;

        this.parent.layers.debug.appendChild(highlight);
        return gridPos;
    }



    // Add this method to GridSystem class
    highlightFacingTiles(myte, count = 3) {
        // Remove previous facing highlights
        const oldHighlights = this.parent.layers.debug.querySelectorAll('.grid-facing-highlight');
        oldHighlights.forEach(h => h.remove());

        // Get direction vectors based on myte direction
        let dx = 0, dy = 0;
        switch (myte.direction) {
            case 'N': dy = -1; break;
            case 'S': dy = 1; break;
            case 'E': dx = 1; break;
            case 'W': dx = -1; break;
            case 'NE': dx = 1; dy = -1; break;
            case 'NW': dx = -1; dy = -1; break;
            case 'SE': dx = 1; dy = 1; break;
            case 'SW': dx = -1; dy = 1; break;
            default: return; // No valid direction
        }

        // Get myte's current grid position
        const myteGridPos = this.worldToGrid(myte.posX + myte.size.width / 2, myte.posY + myte.size.height / 2);

        // Highlight tiles in facing direction
        for (let i = 1; i <= count; i++) {
            const gridX = myteGridPos.x + (dx * i);
            const gridY = myteGridPos.y + (dy * i);

            // Skip if out of bounds
            if (gridX < 0 || gridX >= this.gridWidth || gridY < 0 || gridY >= this.gridHeight) continue;

            const highlight = document.createElement('div');
            highlight.className = 'grid-cell grid-facing-highlight debug';

            // More intense color for closer tiles
            const opacity = 0.8 - ((i - 1) * 0.2);
            highlight.style.opacity = opacity;

            highlight.style.left = `${gridX * this.config.cellSize}px`;
            highlight.style.top = `${gridY * this.config.cellSize}px`;
            highlight.style.width = `${this.config.cellSize}px`;
            highlight.style.height = `${this.config.cellSize}px`;

            // Add walkable/unwalkable indicator
            if (!this.grid[gridX][gridY].walkable) {
                highlight.classList.add('unwalkable');
            }

            this.parent.layers.debug.appendChild(highlight);
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


    updateFromTileGrid(tileGridData) {
        if (!tileGridData || !tileGridData.grid) {
            console.warn('Invalid tile grid data provided');
            return;
        }

        console.log('Updating grid system from tile data');

        // Store the original objects temporarily
        const objectsByCell = {};
        for (let x = 0; x < this.gridWidth; x++) {
            for (let y = 0; y < this.gridHeight; y++) {
                if (this.grid[x][y].objects.size > 0) {
                    objectsByCell[`${x},${y}`] = Array.from(this.grid[x][y].objects);
                }
            }
        }

        // Update grid dimensions if needed
        if (tileGridData.width !== this.gridWidth || tileGridData.height !== this.gridHeight) {
            this.gridWidth = tileGridData.width;
            this.gridHeight = tileGridData.height;

            // Rebuild the grid with new dimensions
            this.grid = Array(this.gridWidth).fill(null).map(() =>
                Array(this.gridHeight).fill(null).map(() => ({
                    objects: new Set(),
                    walkable: true,
                    debugElement: null
                }))
            );

            // Create new debug visualizations if needed
            if (this.debugMode && this.parent.layers.debug) {
                this.disableDebug();
                this.enableDebug(this.parent.layers.debug);
            }
        }

        // Update walkability from tile grid
        for (let x = 0; x < this.gridWidth; x++) {
            for (let y = 0; y < this.gridHeight; y++) {
                if (x < tileGridData.grid.length && y < tileGridData.grid[x].length) {
                    // Update walkability based on tile data
                    this.grid[x][y].walkable = tileGridData.grid[x][y].walkable;
                }
            }
        }

        // Restore objects to their cells
        for (const key in objectsByCell) {
            const [x, y] = key.split(',').map(Number);
            if (x >= 0 && x < this.gridWidth && y >= 0 && y < this.gridHeight) {
                const objects = objectsByCell[key];
                objects.forEach(obj => {
                    this.grid[x][y].objects.add(obj);

                    // Update walkability based on objects
                    if (!obj.config.walkable) {
                        this.grid[x][y].walkable = false;
                    }
                });
            }
        }

        // Update debug visualization if enabled
        if (this.debugMode) {
            this.updateDebugVisuals();
        }

        console.log(`Grid system updated from tile grid: ${this.gridWidth}x${this.gridHeight} cells`);
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

