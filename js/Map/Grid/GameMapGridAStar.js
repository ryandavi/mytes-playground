class AStarPathfinder {
    constructor(gridSystem) {
        this.gridSystem = gridSystem;
        this.openSet = new BinaryHeap(node => node.f);
        
        this.directions = [
            { x: 0, y: -1 },   // North
            { x: 1, y: 0 },    // East
            { x: 0, y: 1 },    // South
            { x: -1, y: 0 },   // West
            { x: -1, y: -1 },  // Northwest
            { x: 1, y: -1 },   // Northeast
            { x: -1, y: 1 },   // Southwest
            { x: 1, y: 1 }     // Southeast
        ];
        
        this.options = {
            allowDiagonals: true,
            allowDiagonalCutting: false,
            heuristicWeight: 1.2,
            maxSearchSteps: 5000,
            smoothPaths: true,
            pathPaddingFactor: 0.2,
            debug: true,
            useDirectPathFallback: false  // Whether to use direct path as fallback
        };
        
        this.entityDimensions = {
            width: 0,
            height: 0
        };
        
        this.entityCollider = null;
        
        this.debugElements = {
            exploredNodes: new Set(),
            rejectedNodes: new Set(),
            path: []
        };
    }
    
    getKey(x, y) {
        return `${x},${y}`;
    }

    findPath(startX, startY, endX, endY, entityWidth = 0, entityHeight = 0, collider = null) {
        // Add timestamp for timeout detection
        const startTime = performance.now();
        const timeoutMs = 500; // 500ms timeout
        
        if (this.options.debug) {
            console.log(`Finding path from (${startX.toFixed(0)},${startY.toFixed(0)}) to (${endX.toFixed(0)},${endY.toFixed(0)})`);
        }
        
        // Fast path: if start and end are very close, just return direct line
        const dx = endX - startX;
        const dy = endY - startY;
        const directDistance = Math.sqrt(dx * dx + dy * dy);
        
        if (directDistance < this.gridSystem.config.cellSize * 2) {
            return [
                { x: startX, y: startY },
                { x: endX, y: endY }
            ];
        }
        
        this.debugElements.exploredNodes.clear();
        this.debugElements.rejectedNodes.clear();
        this.debugElements.path = [];
        
        this.entityDimensions.width = entityWidth;
        this.entityDimensions.height = entityHeight;
        
        if (collider) {
            this.entityCollider = {
                width: collider.width || entityWidth * 0.8,
                height: collider.height || entityHeight * 0.5,
                offsetX: collider.offsetX || 0,
                offsetY: collider.offsetY || entityHeight * 0.5
            };
        } else {
            this.entityCollider = {
                width: entityWidth * 0.8, 
                height: entityHeight * 0.5,
                offsetX: 0,
                offsetY: entityHeight * 0.5
            };
        }
        
        const start = this.gridSystem.worldToGrid(startX, startY);
        const end = this.gridSystem.worldToGrid(endX, endY);
        
        // Safety check for identical start and end positions
        if (start.x === end.x && start.y === end.y) {
            return [
                { x: startX, y: startY },
                { x: endX, y: endY }
            ];
        }
        
        // Check if start position is valid
        let validStart = null;
        
        if (!this.canEntityFitAt(start.x, start.y)) {
            if (this.options.debug) {
                console.warn(`Entity cannot fit at start position (${start.x}, ${start.y})`);
            }
            
            validStart = this.findNearestValidPosition(start.x, start.y, 5);
            
            // If we couldn't find a valid start position, return a direct path as fallback
            if (!validStart) {
                console.warn("No valid start position found");
                if (this.options.useDirectPathFallback) {
                    console.log("Using direct path as fallback");
                    return [
                        { x: startX, y: startY },
                        { x: endX, y: endY }
                    ];
                }
                return null; // Return null if fallbacks are disabled
            }
            
            start.x = validStart.x;
            start.y = validStart.y;
        }
        
        // Check if end position is valid
        let validEnd = null;
        
        if (!this.canEntityFitAt(end.x, end.y)) {
            if (this.options.debug) {
                console.warn(`Entity cannot fit at end position (${end.x}, ${end.y})`);
            }
            
            validEnd = this.findNearestValidPosition(end.x, end.y, 5);
            
            // If we couldn't find a valid end position, return a direct path as fallback
            if (!validEnd) {
                console.warn("No valid end position found");
                if (this.options.useDirectPathFallback) {
                    console.log("Using direct path as fallback");
                    return [
                        { x: startX, y: startY },
                        { x: endX, y: endY }
                    ];
                }
                return null; // Return null if fallbacks are disabled
            }
            
            end.x = validEnd.x;
            end.y = validEnd.y;
        }
        
        // Initialize the A* data structures
        this.openSet.clear();
        const closedSet = new Set();
        const cameFrom = new Map();
        const gScore = new Map();
        const fScore = new Map();
        
        const startKey = this.getKey(start.x, start.y);
        const endKey = this.getKey(end.x, end.y);
        
        gScore.set(startKey, 0);
        fScore.set(startKey, this.heuristic(start.x, start.y, end.x, end.y));
        
        this.openSet.push({
            x: start.x,
            y: start.y,
            f: fScore.get(startKey),
            key: startKey
        });
        
        let steps = 0;
        
        while (!this.openSet.isEmpty()) {
            steps++;
            
            // Check for timeout to prevent freezing
            if (performance.now() - startTime > timeoutMs) {
                console.warn(`Pathfinding timeout after ${steps} steps (${timeoutMs}ms)`);
                const partialTarget = this.findBestPartialTarget(end.x, end.y, closedSet, cameFrom);
                if (partialTarget) {
                    return this.reconstructPath(cameFrom, partialTarget, end);
                }
                
                // If no partial path found, return direct path as fallback
                if (this.options.useDirectPathFallback) {
                    return [
                        this.gridSystem.gridToWorld(start.x, start.y),
                        this.gridSystem.gridToWorld(end.x, end.y)
                    ];
                }
                return null; // Return null if fallbacks are disabled
            }
            
            // Check for maximum steps
            if (steps > this.options.maxSearchSteps) {
                if (this.options.debug) {
                    console.warn(`Exceeded max search steps (${this.options.maxSearchSteps})`);
                }
                const partialTarget = this.findBestPartialTarget(end.x, end.y, closedSet, cameFrom);
                if (partialTarget) {
                    return this.reconstructPath(cameFrom, partialTarget, end);
                }
                
                // If no partial path found, return direct path as fallback
                if (this.options.useDirectPathFallback) {
                    return [
                        this.gridSystem.gridToWorld(start.x, start.y),
                        this.gridSystem.gridToWorld(end.x, end.y)
                    ];
                }
                return null; // Return null if fallbacks are disabled
            }
            
            const current = this.openSet.pop();
            
            if (this.options.debug) {
                this.debugElements.exploredNodes.add(current.key);
            }
            
            // Check if we've reached the goal
            if (current.key === endKey) {
                if (this.options.debug) {
                    console.log(`Path found in ${steps} steps`);
                }
                return this.reconstructPath(cameFrom, current, end);
            }
            
            closedSet.add(current.key);
            
            // Check for direct line of sight to end (for smoother paths)
            if (steps > 10 && this.hasLineOfSight(
                this.gridSystem.gridToWorld(current.x, current.y),
                this.gridSystem.gridToWorld(end.x, end.y)
            )) {
                // If we have line of sight to the goal from current position, go directly there
                cameFrom.set(endKey, current);
                return this.reconstructPath(cameFrom, { x: end.x, y: end.y, key: endKey }, end);
            }
            
            const neighbors = this.getNeighbors(current.x, current.y);
            
            for (const neighbor of neighbors) {
                const neighborKey = this.getKey(neighbor.x, neighbor.y);
                
                if (closedSet.has(neighborKey)) continue;
                
                const tentativeG = gScore.get(current.key) + this.getMovementCost(current, neighbor);
                
                if (!gScore.has(neighborKey) || tentativeG < gScore.get(neighborKey)) {
                    cameFrom.set(neighborKey, current);
                    gScore.set(neighborKey, tentativeG);
                    const h = this.heuristic(neighbor.x, neighbor.y, end.x, end.y);
                    const f = tentativeG + (h * this.options.heuristicWeight);
                    fScore.set(neighborKey, f);
                    
                    const neighborNode = {
                        x: neighbor.x,
                        y: neighbor.y,
                        f: f,
                        key: neighborKey
                    };
                    
                    if (!this.openSet.contains(neighborKey)) {
                        this.openSet.push(neighborNode);
                    }
                }
            }
        }
        
        if (this.options.debug) {
            console.warn(`No path found after ${steps} steps`);
        }
        
        // Return direct path as fallback
        if (this.options.useDirectPathFallback) {
            return [
                this.gridSystem.gridToWorld(start.x, start.y),
                this.gridSystem.gridToWorld(end.x, end.y)
            ];
        }
        return null; // Return null if fallbacks are disabled
    }
    
    findBestPartialTarget(endX, endY, closedSet, cameFrom) {
        let bestNode = null;
        let bestScore = Infinity;
        
        for (const key of closedSet) {
            const [x, y] = key.split(',').map(Number);
            const distance = this.heuristic(x, y, endX, endY);
            
            if (distance < bestScore && cameFrom.has(key)) {
                bestScore = distance;
                bestNode = { x, y, key };
            }
        }
        
        return bestNode;
    }
    
    findNearestValidPosition(x, y, maxRadius) {
        // First check if the original position is valid
        if (this.canEntityFitAt(x, y)) {
            return { x, y };
        }
        
        // Safety check - limit the maxRadius to prevent excessive calculations
        maxRadius = Math.min(maxRadius, 8);
        
        // Array of positions to check, in order of preference
        const directions = [
            { dx: 0, dy: -1 },  // North
            { dx: 1, dy: 0 },   // East
            { dx: 0, dy: 1 },   // South
            { dx: -1, dy: 0 },  // West
            { dx: 1, dy: -1 },  // Northeast
            { dx: 1, dy: 1 },   // Southeast
            { dx: -1, dy: 1 },  // Southwest
            { dx: -1, dy: -1 }  // Northwest
        ];
        
        // Maximum number of positions to check to prevent infinite loops
        const maxChecks = 100;
        let checksPerformed = 0;

        // First try the direct neighbors for a faster solution
        for (const dir of directions) {
            const nx = x + dir.dx;
            const ny = y + dir.dy;
            
            if (this.canEntityFitAt(nx, ny)) {
                return { x: nx, y: ny };
            }
            checksPerformed++;
        }
        
        // If direct neighbors don't work, try expanding rings
        for (let radius = 2; radius <= maxRadius; radius++) {
            // Check in order of preference: cardinal directions first, then diagonals
            for (const dir of directions) {
                const nx = x + (dir.dx * radius);
                const ny = y + (dir.dy * radius);
                
                if (this.canEntityFitAt(nx, ny)) {
                    return { x: nx, y: ny };
                }
                checksPerformed++;
                
                if (checksPerformed >= maxChecks) {
                    console.warn(`findNearestValidPosition reached max checks (${maxChecks}), returning null`);
                    return null;
                }
            }
            
            // If cardinal and ordinal positions at this radius don't work, 
            // check other positions along the perimeter
            
            // Check top and bottom edges (excluding corners)
            for (let dx = -radius + 1; dx <= radius - 1; dx++) {
                // Skip already checked positions
                if (dx === 0 || Math.abs(dx) === radius) continue;
                
                // Top edge
                if (this.canEntityFitAt(x + dx, y - radius)) {
                    return { x: x + dx, y: y - radius };
                }
                
                // Bottom edge
                if (this.canEntityFitAt(x + dx, y + radius)) {
                    return { x: x + dx, y: y + radius };
                }
                
                checksPerformed += 2;
                if (checksPerformed >= maxChecks) {
                    console.warn(`findNearestValidPosition reached max checks (${maxChecks}), returning null`);
                    return null;
                }
            }
            
            // Check left and right edges (excluding corners)
            for (let dy = -radius + 1; dy <= radius - 1; dy++) {
                // Skip already checked positions
                if (dy === 0 || Math.abs(dy) === radius) continue;
                
                // Left edge
                if (this.canEntityFitAt(x - radius, y + dy)) {
                    return { x: x - radius, y: y + dy };
                }
                
                // Right edge
                if (this.canEntityFitAt(x + radius, y + dy)) {
                    return { x: x + radius, y: y + dy };
                }
                
                checksPerformed += 2;
                if (checksPerformed >= maxChecks) {
                    console.warn(`findNearestValidPosition reached max checks (${maxChecks}), returning null`);
                    return null;
                }
            }
        }
        
        console.warn(`findNearestValidPosition found no valid position within radius ${maxRadius}`);
        return null;
    }

    getNeighbors(x, y) {
        const neighbors = [];
        
        const directions = this.options.allowDiagonals ? this.directions : this.directions.slice(0, 4);
        
        for (const dir of directions) {
            const newX = x + dir.x;
            const newY = y + dir.y;
            
            // Skip if out of bounds
            if (newX < 0 || newX >= this.gridSystem.gridWidth ||
                newY < 0 || newY >= this.gridSystem.gridHeight) {
                continue;
            }
            
            // Check if the cell is walkable - also check for doors specifically
            const cell = this.gridSystem.grid[newX][newY];
            if (!cell.walkable && !this.hasDoorInCell(newX, newY)) {
                if (this.options.debug) {
                    this.debugElements.rejectedNodes.add(this.getKey(newX, newY));
                }
                continue;
            }
            
            // Check if entity can fit at the new position
            if (this.entityDimensions.width > 0 && this.entityDimensions.height > 0) {
                if (!this.canEntityFitAt(newX, newY)) {
                    if (this.options.debug) {
                        this.debugElements.rejectedNodes.add(this.getKey(newX, newY));
                    }
                    continue;
                }
            }
            
            // Check diagonal movement restrictions
            if (!this.options.allowDiagonalCutting && 
                Math.abs(dir.x) === 1 && Math.abs(dir.y) === 1) {
                // Prevent cutting corners
                if ((!this.gridSystem.grid[x][newY].walkable && !this.hasDoorInCell(x, newY)) || 
                    (!this.gridSystem.grid[newX][y].walkable && !this.hasDoorInCell(newX, y))) {
                    if (this.options.debug) {
                        this.debugElements.rejectedNodes.add(this.getKey(newX, newY));
                    }
                    continue;
                }
                
                // Check if entity can fit through the corner
                if (this.entityDimensions.width > 0 && this.entityDimensions.height > 0) {
                    if (!this.canEntityFitAt(x, newY) || !this.canEntityFitAt(newX, y)) {
                        if (this.options.debug) {
                            this.debugElements.rejectedNodes.add(this.getKey(newX, newY));
                        }
                        continue;
                    }
                }
            }
            
            neighbors.push({ x: newX, y: newY });
        }
        
        return neighbors;
    }
    
    // Helper method to check for open doors in a cell
    hasDoorInCell(gridX, gridY) {
        if (gridX < 0 || gridX >= this.gridSystem.gridWidth || 
            gridY < 0 || gridY >= this.gridSystem.gridHeight) {
            return false;
        }
        
        const cell = this.gridSystem.grid[gridX][gridY];
        for (const obj of cell.objects) {
            const isDoor = obj.type === 'door' || obj.objectType === 'door' || obj.type === 'DOOR' || obj.objectType === 'DOOR';
            if (isDoor) {
                const isOpen = typeof obj.isOpen === 'function' ? obj.isOpen() : obj.isOpen;
                if (isOpen) {
                    return true; // Found an open door
                }
            }
        }
        return false;
    }
    
    canEntityFitAt(gridX, gridY) {
        // Boundary check
        if (gridX < 0 || gridX >= this.gridSystem.gridWidth || 
            gridY < 0 || gridY >= this.gridSystem.gridHeight) {
            return false;
        }
        
        // Basic walkability check from the grid - check for open doors too
        if (!this.gridSystem.grid[gridX][gridY].walkable && !this.hasDoorInCell(gridX, gridY)) {
            return false;
        }
        
        // If no entity dimensions provided, just use the grid walkability
        if (this.entityDimensions.width <= 0 || this.entityDimensions.height <= 0) {
            return true;
        }
        
        // For entities with dimensions, do a more detailed check
        const worldX = gridX * this.gridSystem.config.cellSize;
        const worldY = gridY * this.gridSystem.config.cellSize;
        
        const collisionEntity = {
            posX: worldX,
            posY: worldY,
            size: this.entityDimensions,
            collider: this.entityCollider,
            config: {
                walkable: true
            }
        };
        
        // Check all cells the entity would overlap
        const cells = this.getEntityOverlappingCells(gridX, gridY);
        for (const cell of cells) {
            if (!cell.walkable && !this.hasCellWithOpenDoor(cell)) {
                return false;
            }
        }
        
        // Get potential colliders
        const potentialColliders = this.gridSystem.getPotentialColliders(collisionEntity);
        if (!potentialColliders || potentialColliders.length === 0) {
            return true;
        }
        
        // Check for collisions
        if (this.gridSystem.parent && this.gridSystem.parent.parent && 
            typeof this.gridSystem.parent.parent.checkCollision === 'function') {
            
            // Use the parent's collision detection if available
            for (const collider of potentialColliders) {
                // Skip open doors
                if (this.isDoorAndOpen(collider)) {
                    continue;
                }
                // Only check collision with non-walkable objects
                if (!collider.config?.walkable) {
                    if (this.gridSystem.parent.parent.checkCollision(collisionEntity, collider)) {
                        return false;
                    }
                }
            }
        } else {
            // Simple bounding box collision check
            for (const collider of potentialColliders) {
                // Skip open doors
                if (this.isDoorAndOpen(collider)) {
                    continue;
                }
                // Only check collision with non-walkable objects
                if (collider.config && !collider.config.walkable) {
                    if (this.checkBoundingBoxCollision(collisionEntity, collider)) {
                        return false;
                    }
                }
            }
        }
        
        return true;
    }
    
    // Helper method to check if a collider is an open door
    isDoorAndOpen(obj) {
        const isDoor = obj.type === 'door' || obj.objectType === 'door' || 
                     obj.type === 'DOOR' || obj.objectType === 'DOOR';
        if (isDoor) {
            const isOpen = typeof obj.isOpen === 'function' ? obj.isOpen() : obj.isOpen;
            return isOpen;
        }
        return false;
    }
    
    // Helper method to check if a grid cell contains an open door
    hasCellWithOpenDoor(cell) {
        for (const obj of cell.objects) {
            if (this.isDoorAndOpen(obj)) {
                return true;
            }
        }
        return false;
    }
    
    getEntityOverlappingCells(gridX, gridY) {
        const cells = [];
        const worldX = gridX * this.gridSystem.config.cellSize;
        const worldY = gridY * this.gridSystem.config.cellSize;
        
        const left = worldX + (this.entityCollider ? this.entityCollider.offsetX : 0);
        const top = worldY + (this.entityCollider ? this.entityCollider.offsetY : 0);
        const right = left + (this.entityCollider ? this.entityCollider.width : this.entityDimensions.width);
        const bottom = top + (this.entityCollider ? this.entityCollider.height : this.entityDimensions.height);
        
        const startGridX = Math.floor(left / this.gridSystem.config.cellSize);
        const startGridY = Math.floor(top / this.gridSystem.config.cellSize);
        const endGridX = Math.ceil(right / this.gridSystem.config.cellSize);
        const endGridY = Math.ceil(bottom / this.gridSystem.config.cellSize);
        
        for (let x = startGridX; x < endGridX; x++) {
            for (let y = startGridY; y < endGridY; y++) {
                if (x >= 0 && x < this.gridSystem.gridWidth && 
                    y >= 0 && y < this.gridSystem.gridHeight) {
                    cells.push(this.gridSystem.grid[x][y]);
                }
            }
        }
        
        return cells;
    }
    
    checkBoundingBoxCollision(entity1, entity2) {
        const e1Left = entity1.posX + (entity1.collider ? entity1.collider.offsetX : 0);
        const e1Top = entity1.posY + (entity1.collider ? entity1.collider.offsetY : 0);
        const e1Right = e1Left + (entity1.collider ? entity1.collider.width : entity1.size.width);
        const e1Bottom = e1Top + (entity1.collider ? entity1.collider.height : entity1.size.height);
        
        const e2Left = entity2.posX + (entity2.collider ? entity2.collider.offsetX : 0);
        const e2Top = entity2.posY + (entity2.collider ? entity2.collider.offsetY : 0);
        const e2Right = e2Left + (entity2.collider ? entity2.collider.width : entity2.size.width);
        const e2Bottom = e2Top + (entity2.collider ? entity2.collider.height : entity2.size.height);
        
        return !(
            e1Right < e2Left ||
            e1Left > e2Right ||
            e1Bottom < e2Top ||
            e1Top > e2Bottom
        );
    }
    
    getMovementCost(from, to) {
        // Diagonal movement costs more
        if (from.x !== to.x && from.y !== to.y) {
            return Math.SQRT2;
        }
        
        return 1.0;
    }
    
    heuristic(x1, y1, x2, y2) {
        const dx = Math.abs(x2 - x1);
        const dy = Math.abs(y2 - y1);
        
        if (this.options.allowDiagonals) {
            return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
        } else {
            return dx + dy;
        }
    }
    
    reconstructPath(cameFrom, current, end) {
        const path = [];
        let currentNode = current;
        
        while (currentNode) {
            const worldPos = this.gridSystem.gridToWorld(currentNode.x, currentNode.y);
            path.unshift(worldPos);
            
            const key = this.getKey(currentNode.x, currentNode.y);
            currentNode = cameFrom.get(key);
        }
        
        const finalPath = this.options.smoothPaths ? this.smoothPath(path) : path;
        
        if (this.options.debug) {
            this.debugElements.path = [...finalPath];
        }
        
        return finalPath;
    }
    
    smoothPath(path) {
        if (path.length <= 2) return path;
        
        const smoothed = [path[0]];
        let currentIndex = 0;
        
        while (currentIndex < path.length - 1) {
            let furthestVisible = currentIndex + 1;
            
            for (let i = currentIndex + 2; i < path.length; i++) {
                if ((i - currentIndex) % 2 !== 0 && i < path.length - 1) continue;
                
                if (this.hasLineOfSight(path[currentIndex], path[i])) {
                    furthestVisible = i;
                }
            }
            
            smoothed.push(path[furthestVisible]);
            currentIndex = furthestVisible;
        }
        
        return smoothed;
    }
    
    hasLineOfSight(start, end) {
        const startGrid = this.gridSystem.worldToGrid(start.x, start.y);
        const endGrid = this.gridSystem.worldToGrid(end.x, end.y);
        
        const dx = Math.abs(endGrid.x - startGrid.x);
        const dy = Math.abs(endGrid.y - startGrid.y);
        const sx = startGrid.x < endGrid.x ? 1 : -1;
        const sy = startGrid.y < endGrid.y ? 1 : -1;
        let err = dx - dy;
        
        let x = startGrid.x;
        let y = startGrid.y;
        
        while (x !== endGrid.x || y !== endGrid.y) {
            if (x < 0 || x >= this.gridSystem.gridWidth || 
                y < 0 || y >= this.gridSystem.gridHeight ||
                (!this.gridSystem.grid[x][y].walkable && !this.hasDoorInCell(x, y)) ||
                !this.canEntityFitAt(x, y)) {
                return false;
            }
            
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
        
        return true;
    }
    
    // Debug method to diagnose door issues
    diagnoseDoorPathfinding(startX, startY, endX, endY) {
        console.log('=== DOOR PATHFINDING DIAGNOSIS ===');
        
        const start = this.gridSystem.worldToGrid(startX, startY);
        const end = this.gridSystem.worldToGrid(endX, endY);
        
        // Check for doors along the theoretical path
        const doorCells = [];
        
        // Draw a line between start and end
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const steps = Math.max(Math.abs(dx), Math.abs(dy));
        
        console.log(`Checking for doors between (${start.x},${start.y}) and (${end.x},${end.y})`);
        
        for (let i = 0; i <= steps; i++) {
            const ratio = steps === 0 ? 0 : i / steps;
            const x = Math.round(start.x + dx * ratio);
            const y = Math.round(start.y + dy * ratio);
            
            if (x >= 0 && x < this.gridSystem.gridWidth && 
                y >= 0 && y < this.gridSystem.gridHeight) {
                
                const cell = this.gridSystem.grid[x][y];
                console.log(`Cell (${x},${y}): walkable=${cell.walkable}, tileWalkable=${cell.tileWalkable}, objectWalkable=${cell.objectWalkable}`);
                
                const hasDoor = this.hasDoorInCell(x, y);
                console.log(`Has open door: ${hasDoor}`);
                
                for (const obj of cell.objects) {
                    const isDoor = obj.type === 'door' || obj.objectType === 'door' || 
                                 obj.type === 'DOOR' || obj.objectType === 'DOOR';
                    if (isDoor) {
                        const isOpen = typeof obj.isOpen === 'function' ? obj.isOpen() : obj.isOpen;
                        console.log(`DOOR at (${x},${y}): open=${isOpen}, walkable=${obj.config.walkable}`);
                        doorCells.push({x, y, door: obj});
                    }
                }
                
                // Check if this cell is considered valid for the entity
                if (this.entityDimensions.width > 0 && this.entityDimensions.height > 0) {
                    const canFit = this.canEntityFitAt(x, y);
                    console.log(`Entity can fit at (${x},${y}): ${canFit}`);
                }
            }
        }
        
        if (doorCells.length === 0) {
            console.log('No doors found between start and end points.');
        }
        
        // Try the actual pathfinding
        const path = this.findPath(startX, startY, endX, endY, 
            this.entityDimensions.width, this.entityDimensions.height);
        
        console.log(`Pathfinding result: ${path ? 'Path found' : 'No path found'}`);
        console.log('================================');
        
        return path;
    }

    visualizePath(container, path) {
        if (!container || !path) return;
        
        const existingNodes = container.querySelectorAll('.pathfinder-node');
        existingNodes.forEach(node => node.remove());
        
        if (this.options.debug && this.debugElements.exploredNodes.size > 0) {
            for (const nodeKey of this.debugElements.exploredNodes) {
                const [x, y] = nodeKey.split(',').map(Number);
                const worldPos = this.gridSystem.gridToWorld(x, y);
                
                const node = document.createElement('div');
                node.className = 'pathfinder-node explored-node debug';
                
                Object.assign(node.style, {
                    left: `${worldPos.x - 3}px`,
                    top: `${worldPos.y - 3}px`,
                    width: '6px',
                    height: '6px',
                    position: 'absolute',
                    borderRadius: '50%',
                    backgroundColor: 'rgba(255, 255, 0, 0.3)',
                    zIndex: 900
                });
                
                container.appendChild(node);
            }
        }
        
        if (this.options.debug && this.debugElements.rejectedNodes.size > 0) {
            for (const nodeKey of this.debugElements.rejectedNodes) {
                const [x, y] = nodeKey.split(',').map(Number);
                const worldPos = this.gridSystem.gridToWorld(x, y);
                
                const node = document.createElement('div');
                node.className = 'pathfinder-node rejected-node debug';
                
                Object.assign(node.style, {
                    left: `${worldPos.x - 3}px`,
                    top: `${worldPos.y - 3}px`,
                    width: '6px',
                    height: '6px',
                    position: 'absolute',
                    borderRadius: '50%',
                    backgroundColor: 'rgba(255, 0, 0, 0.3)',
                    zIndex: 900
                });
                
                container.appendChild(node);
            }
        }
        
        path.forEach((point, index) => {
            const node = document.createElement('div');
            node.className = 'pathfinder-node path-node debug';
            node.classList.add(index === 0 ? 'start-node' : 
                          index === path.length - 1 ? 'end-node' : 'waypoint-node');
            
            const nodeSize = index === 0 || index === path.length - 1 ? 10 : 6;
            const nodeColor = index === 0 ? 'rgba(0, 255, 0, 0.8)' : 
                         index === path.length - 1 ? 'rgba(255, 0, 0, 0.8)' : 
                         'rgba(0, 100, 255, 0.8)';
            
            Object.assign(node.style, {
                left: `${point.x - nodeSize/2}px`,
                top: `${point.y - nodeSize/2}px`,
                width: `${nodeSize}px`,
                height: `${nodeSize}px`,
                position: 'absolute',
                borderRadius: '50%',
                backgroundColor: nodeColor,
                zIndex: 1000 + index
            });
            
            if (index > 0 && index < path.length - 1) {
                node.textContent = index;
                node.style.color = 'white';
                node.style.fontSize = '8px';
                node.style.textAlign = 'center';
                node.style.lineHeight = `${nodeSize}px`;
            }
            
            container.appendChild(node);
        });
        
        for (let i = 0; i < path.length - 1; i++) {
            const start = path[i];
            const end = path[i + 1];
            
            const line = document.createElement('div');
            line.className = 'pathfinder-node path-line debug';
            
            const dx = end.x - start.x;
            const dy = end.y - start.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx) * 180 / Math.PI;
            
            Object.assign(line.style, {
                position: 'absolute',
                left: `${start.x}px`,
                top: `${start.y}px`,
                width: `${distance}px`,
                height: '2px',
                backgroundColor: 'rgba(0, 100, 255, 0.6)',
                transformOrigin: '0 0',
                transform: `rotate(${angle}deg)`,
                zIndex: 990 + i
            });
            
            container.appendChild(line);
        }
        
        this.visualizeEntityCollider(container, path[0], 'start');
        this.visualizeEntityCollider(container, path[path.length - 1], 'end');
    }

    visualizeEntityCollider(container, point, nodeType) {
        if (!container || !point) return;
        
        const collider = document.createElement('div');
        collider.className = `pathfinder-node entity-collider debug ${nodeType}-collider`;
        
        const left = point.x + (this.entityCollider ? this.entityCollider.offsetX : 0);
        const top = point.y + (this.entityCollider ? this.entityCollider.offsetY : 0);
        const width = this.entityCollider ? this.entityCollider.width : this.entityDimensions.width;
        const height = this.entityCollider ? this.entityCollider.height : this.entityDimensions.height;
        
        Object.assign(collider.style, {
            position: 'absolute',
            left: `${left}px`,
            top: `${top}px`,
            width: `${width}px`,
            height: `${height}px`,
            border: `1px solid ${nodeType === 'start' ? 'rgba(0, 255, 0, 0.8)' : 'rgba(255, 0, 0, 0.8)'}`,
            backgroundColor: `${nodeType === 'start' ? 'rgba(0, 255, 0, 0.2)' : 'rgba(255, 0, 0, 0.2)'}`,
            zIndex: 980
        });
        
        container.appendChild(collider);
    }

    setDebugMode(enabled) {
        this.options.debug = enabled;
    }
    
    // New method to manually check walkability at a specific grid location
    checkWalkableAt(gridX, gridY) {
        // Boundary check
        if (gridX < 0 || gridX >= this.gridSystem.gridWidth || 
            gridY < 0 || gridY >= this.gridSystem.gridHeight) {
            console.log(`Position (${gridX}, ${gridY}) is out of bounds`);
            return false;
        }
        
        const cell = this.gridSystem.grid[gridX][gridY];
        console.log(`Checking cell at (${gridX}, ${gridY}):`);
        console.log(`- Cell walkable: ${cell.walkable}`);
        console.log(`- Tile walkable: ${cell.tileWalkable}`);
        console.log(`- Object walkable: ${cell.objectWalkable}`);
        
        // Check for doors
        let hasDoor = false;
        for (const obj of cell.objects) {
            const isDoor = obj.type === 'door' || obj.objectType === 'door' || 
                         obj.type === 'DOOR' || obj.objectType === 'DOOR';
            if (isDoor) {
                const isOpen = typeof obj.isOpen === 'function' ? obj.isOpen() : obj.isOpen;
                console.log(`- Door found: open=${isOpen}, walkable=${obj.config.walkable}`);
                hasDoor = true;
                if (isOpen) {
                    console.log(`- Cell is passable because door is open`);
                    return true;
                }
            }
        }
        
        if (!hasDoor) {
            console.log(`- No doors found in cell`);
        }
        
        return cell.walkable;
    }

    dispose() {
        this.openSet.clear();
        this.debugElements.exploredNodes.clear();
        this.debugElements.rejectedNodes.clear();
        this.debugElements.path = [];
        this.gridSystem = null;
    }
}

/**
 * Binary heap implementation for optimized open set
 */
class BinaryHeap {
    constructor(scoreFunction) {
        this.content = [];
        this.scoreFunction = scoreFunction;
        this.nodeMap = new Map();
    }

    push(element) {
        this.content.push(element);
        this.nodeMap.set(element.key, this.content.length - 1);
        this.bubbleUp(this.content.length - 1);
    }

    pop() {
        const result = this.content[0];
        const end = this.content.pop();
        this.nodeMap.delete(result.key);

        if (this.content.length > 0) {
            this.content[0] = end;
            this.nodeMap.set(end.key, 0);
            this.sinkDown(0);
        }

        return result;
    }

    contains(key) {
        return this.nodeMap.has(key);
    }

    clear() {
        this.content = [];
        this.nodeMap.clear();
    }

    isEmpty() {
        return this.content.length === 0;
    }

    bubbleUp(n) {
        const element = this.content[n];
        const score = this.scoreFunction(element);

        while (n > 0) {
            const parentN = Math.floor((n + 1) / 2) - 1;
            const parent = this.content[parentN];

            if (score >= this.scoreFunction(parent)) break;

            this.content[parentN] = element;
            this.content[n] = parent;
            this.nodeMap.set(element.key, parentN);
            this.nodeMap.set(parent.key, n);
            n = parentN;
        }
    }

    sinkDown(n) {
        const length = this.content.length;
        const element = this.content[n];
        const score = this.scoreFunction(element);

        while (true) {
            let child2N = (n + 1) * 2;
            let child1N = child2N - 1;
            let swap = null;

            if (child1N < length) {
                const child1 = this.content[child1N];
                const child1Score = this.scoreFunction(child1);
                if (child1Score < score) swap = child1N;
            }

            if (child2N < length) {
                const child2 = this.content[child2N];
                const child2Score = this.scoreFunction(child2);
                if (child2Score < (swap === null ? score : this.scoreFunction(this.content[child1N]))) {
                    swap = child2N;
                }
            }

            if (swap === null) break;

            this.content[n] = this.content[swap];
            this.content[swap] = element;
            this.nodeMap.set(this.content[n].key, n);
            this.nodeMap.set(element.key, swap);
            n = swap;
        }
    }
}