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
            useDirectPathFallback: false,  // Whether to use direct path as fallback
            preferPaths: true,             // Whether to prefer established paths
            avoidDifficultTerrain: true    // Whether to avoid difficult terrain
        };

        // Terrain type categories - easily extensible
        this.terrainCategories = {
            WATER: ['shallow_water', 'deep_water'],
            PREFERRED_PATHS: ['path'],
            DIFFICULT_TERRAIN: ['mountains', 'swamp', 'mud']
        };


        this.debugElements = {
            exploredNodes: new Set(),
            rejectedNodes: new Set(),
            path: []
        };
    }

    getKey(x, y) {
        return `${x},${y}`;
    }

    // Get terrain type at the specified grid position
    getTerrainTypeAt(gridX, gridY) {
        if (gridX < 0 || gridX >= this.gridSystem.gridWidth ||
            gridY < 0 || gridY >= this.gridSystem.gridHeight) {
            return GridSystem.defaultTerrain; // Default for out of bounds
        }

        const cell = this.gridSystem.grid[gridX][gridY];

        // If no terrain type found, use cell's terrain type
        if (cell.terrainType) {
            return cell.terrainType;
        }

        // Default terrain type
        return GridSystem.defaultTerrain;
    }

    findPath(startX, startY, endX, endY, options = {}) {
        const entityWidth = options.width || 0;
        const entityHeight = options.height || 0;
        const collider = options.collider || null;
        const entityCapabilities = options.capabilities || null;

        // Add timestamp for timeout detection
        const startTime = performance.now();
        const timeoutMs = 500; // 500ms timeout
    
        // Store the original positions
        const originalStartX = startX;
        const originalStartY = startY;
        const originalEndX = endX; 
        const originalEndY = endY;
    
        // The start position is the entity's top-left
        // The end position is where the entity will center itself to
        
        // For start position, we calculate collider position from entity top-left
        let adjustedStartX = startX;
        let adjustedStartY = startY;
        
        // For end position, we need to calculate where the entity top-left would be
        // if it were centered on the end point, then calculate collider from there
        let adjustedEndX = endX - (entityWidth / 2);
        let adjustedEndY = endY - (entityHeight / 2);
    
        if (this.options.debug) {
            console.log(`Finding path from (${originalStartX.toFixed(0)},${originalStartY.toFixed(0)}) to center on (${originalEndX.toFixed(0)},${originalEndY.toFixed(0)})`);
        }
    
        // Adjust target points based on collider offset (if provided)
        if (collider) {

            // Apply collider offset to both start and end positions
            // Start position is already entity top-left, so just add collider offset
            adjustedStartX += collider.offsetX + (collider.width / 2);
            adjustedStartY += collider.offsetY + (collider.height / 2);
            
            // End position: calculate where collider center would be
            // when entity is centered on the target
            adjustedEndX += collider.offsetX + (collider.width / 2);
            adjustedEndY += collider.offsetY + (collider.height / 2);
    
            if (this.options.debug) {
                console.log(`Adjusted for collider: Start (${adjustedStartX.toFixed(0)},${adjustedStartY.toFixed(0)}) to (${adjustedEndX.toFixed(0)},${adjustedEndY.toFixed(0)})`);
            }
        }
    
        // Fast path: if start and end are very close, just return direct line
        const dx = adjustedEndX - adjustedStartX;
        const dy = adjustedEndY - adjustedStartY;
        const directDistance = Math.sqrt(dx * dx + dy * dy);
    
        if (directDistance < this.gridSystem.config.cellSize * 2) {
            return [
                { x: originalStartX, y: originalStartY },
                { x: originalEndX, y: originalEndY }
            ];
        }
    
        this.debugElements.exploredNodes.clear();
        this.debugElements.rejectedNodes.clear();
        this.debugElements.path = [];
    
        // Convert to grid coordinates
        const start = this.gridSystem.worldToGrid(adjustedStartX, adjustedStartY);
        const end = this.gridSystem.worldToGrid(adjustedEndX, adjustedEndY);
    
        // Safety check for identical start and end positions
        if (start.x === end.x && start.y === end.y) {
            return [
                { x: originalStartX, y: originalStartY },
                { x: originalEndX, y: originalEndY }
            ];
        }
    
        // Check if start position is valid
        let validStart = null;
    
        if (!this.canEntityFitAt(start.x, start.y, entityWidth, entityHeight, collider, entityCapabilities)) {
            if (this.options.debug) {
                console.warn(`Entity cannot fit at start position (${start.x}, ${start.y})`);
            }
    
            validStart = this.findNearestValidPosition(start.x, start.y, 5, entityWidth, entityHeight, collider, entityCapabilities);
    
            // If we couldn't find a valid start position, return a direct path as fallback
            if (!validStart) {
                console.warn("No valid start position found");
                if (this.options.useDirectPathFallback) {
                    console.log("Using direct path as fallback");
                    return [
                        { x: originalStartX, y: originalStartY },
                        { x: originalEndX, y: originalEndY }
                    ];
                }
                return null; // Return null if fallbacks are disabled
            }
    
            start.x = validStart.x;
            start.y = validStart.y;
        }
    
        // Check if end position is valid
        let validEnd = null;
    
        if (!this.canEntityFitAt(end.x, end.y, entityWidth, entityHeight, collider, entityCapabilities)) {
            if (this.options.debug) {
                console.warn(`Entity cannot fit at end position (${end.x}, ${end.y})`);
            }
    
            validEnd = this.findNearestValidPosition(end.x, end.y, 5, entityWidth, entityHeight, collider, entityCapabilities);
    
            // If we couldn't find a valid end position, return a direct path as fallback
            if (!validEnd) {
                console.warn("No valid end position found");
                if (this.options.useDirectPathFallback) {
                    console.log("Using direct path as fallback");
                    return [
                        { x: originalStartX, y: originalStartY },
                        { x: originalEndX, y: originalEndY }
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
                    const partialPath = this.reconstructPath(
                        cameFrom, partialTarget, end, 
                        originalStartX, originalStartY, 
                        originalEndX, originalEndY,
                        entityWidth, entityHeight,
                        collider,
                        entityCapabilities
                    );
                    
                    // Don't cache partial paths to allow better paths in future
                    return partialPath;
                }
    
                // If no partial path found, return direct path as fallback
                if (this.options.useDirectPathFallback) {
                    return [
                        { x: originalStartX, y: originalStartY },
                        { x: originalEndX, y: originalEndY }
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
                    const partialPath = this.reconstructPath(
                        cameFrom, partialTarget, end, 
                        originalStartX, originalStartY, 
                        originalEndX, originalEndY,
                        entityWidth, entityHeight,
                        collider,
                        entityCapabilities
                    );
                    
                    // Don't cache partial paths to allow better paths in future
                    return partialPath;
                }
    
                // If no partial path found, return direct path as fallback
                if (this.options.useDirectPathFallback) {
                    return [
                        { x: originalStartX, y: originalStartY },
                        { x: originalEndX, y: originalEndY }
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
                const path = this.reconstructPath(
                    cameFrom, current, end, 
                    originalStartX, originalStartY, 
                    originalEndX, originalEndY,
                    entityWidth, entityHeight,
                    collider,
                    entityCapabilities
                );

                return path;
            }
    
            closedSet.add(current.key);
    
            // Check for direct line of sight to end (for smoother paths)
            if (steps > 10 && this.hasLineOfSight(
                this.gridSystem.gridToWorld(current.x, current.y),
                this.gridSystem.gridToWorld(end.x, end.y),
                entityWidth, entityHeight, collider, entityCapabilities
            )) {
                // If we have line of sight to the goal from current position, go directly there
                cameFrom.set(endKey, current);

                const path = this.reconstructPath(
                    cameFrom, { x: end.x, y: end.y, key: endKey }, end, 
                    originalStartX, originalStartY, 
                    originalEndX, originalEndY,
                    entityWidth, entityHeight,
                    collider,
                    entityCapabilities
                );

                return path;
            }
    
            const neighbors = this.getNeighbors(current.x, current.y, entityWidth, entityHeight, collider, entityCapabilities);
    
            for (const neighbor of neighbors) {
                const neighborKey = this.getKey(neighbor.x, neighbor.y);
    
                if (closedSet.has(neighborKey)) continue;
    
                const tentativeG = gScore.get(current.key) + this.getMovementCost(current, neighbor, entityCapabilities);
    
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
                { x: originalStartX, y: originalStartY },
                { x: originalEndX, y: originalEndY }
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

    findNearestValidPosition(x, y, maxRadius, entityWidth, entityHeight, collider, entityCapabilities) {
        // First check if the original position is valid
        if (this.canEntityFitAt(x, y, entityWidth, entityHeight, collider, entityCapabilities)) {
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

            if (this.canEntityFitAt(nx, ny, entityWidth, entityHeight, collider, entityCapabilities)) {
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

                if (this.canEntityFitAt(nx, ny, entityWidth, entityHeight, collider, entityCapabilities)) {
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
                if (this.canEntityFitAt(x + dx, y - radius, entityWidth, entityHeight, collider, entityCapabilities)) {
                    return { x: x + dx, y: y - radius };
                }

                // Bottom edge
                if (this.canEntityFitAt(x + dx, y + radius, entityWidth, entityHeight, collider, entityCapabilities)) {
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
                if (this.canEntityFitAt(x - radius, y + dy, entityWidth, entityHeight, collider, entityCapabilities)) {
                    return { x: x - radius, y: y + dy };
                }

                // Right edge
                if (this.canEntityFitAt(x + radius, y + dy, entityWidth, entityHeight, collider, entityCapabilities)) {
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

    getNeighbors(x, y, entityWidth, entityHeight, collider, entityCapabilities) {
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

            // Get the cell and check basic walkability first
            const cell = this.gridSystem.grid[newX][newY];
            if (!cell.walkable) {
                if (this.options.debug) {
                    this.debugElements.rejectedNodes.add(this.getKey(newX, newY));
                }
                continue;
            }

            // Get terrain type for traversability check
            const terrainType = this.getTerrainTypeAt(newX, newY);

            // Check if this terrain is traversable based on entity capabilities
            if (!this.canTraverseTerrain(terrainType)) {
                if (this.options.debug) {
                    this.debugElements.rejectedNodes.add(this.getKey(newX, newY));
                }
                continue;
            }

            // Check if entity can fit at the new position
            if (entityWidth > 0 && entityHeight > 0) {
                if (!this.canEntityFitAt(newX, newY, entityWidth, entityHeight, collider, entityCapabilities)) {
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
                if (!this.gridSystem.grid[x][newY].walkable || !this.gridSystem.grid[newX][y].walkable) {
                    if (this.options.debug) {
                        this.debugElements.rejectedNodes.add(this.getKey(newX, newY));
                    }
                    continue;
                }

                // Check if entity can fit through the corner
                if (entityWidth > 0 && entityHeight > 0) {
                    if (!this.canEntityFitAt(x, newY, entityWidth, entityHeight, collider, entityCapabilities) || 
                        !this.canEntityFitAt(newX, y, entityWidth, entityHeight, collider, entityCapabilities)) {
                        if (this.options.debug) {
                            this.debugElements.rejectedNodes.add(this.getKey(newX, newY));
                        }
                        continue;
                    }
                }
            }

            neighbors.push({
                x: newX,
                y: newY,
                terrainType: terrainType // Store the terrain type for use in getMovementCost
            });
        }

        return neighbors;
    }

    // Check if entity can traverse specific terrain type based on capabilities
    canTraverseTerrain(terrainType, entityCapabilities) {
        // Water traversal depends on swim capability
        if (this.isTerrainInCategory(terrainType, 'WATER')) {
            return entityCapabilities.can_swim;
        }

        // All other terrain is traversable with varying costs
        return true;
    }


    isTerrainInCategory(terrainType, category) {
        return this.terrainCategories[category]?.includes(terrainType) || false;
    }

    // Enhance canEntityFitAt to properly check for collisions
    canEntityFitAt(gridX, gridY, entityWidth, entityHeight, collider, entityCapabilities) {
        // Boundary check
        if (gridX < 0 || gridX >= this.gridSystem.gridWidth ||
            gridY < 0 || gridY >= this.gridSystem.gridHeight) {
            return false;
        }

        // Get terrain type for capability check
        const terrainType = this.getTerrainTypeAt(gridX, gridY);

        // Check if entity can traverse this terrain
        if (!this.canTraverseTerrain(terrainType, entityCapabilities)) {
            return false;
        }

        // Basic walkability check
        const cell = this.gridSystem.grid[gridX][gridY];
        if (!cell.walkable) {
            return false;
        }

        // If no entity dimensions provided, just use the grid walkability
        if (entityWidth <= 0 || entityHeight <= 0) {
            return cell.walkable;
        }

        // Check for doors if entity can't open them
        if (!entityCapabilities.can_open_doors && cell.hasDoor) {
            return false;
        }

        // For entities with dimensions, check potential collisions
        const worldX = gridX * this.gridSystem.config.cellSize;
        const worldY = gridY * this.gridSystem.config.cellSize;

        const collisionEntity = {
            posX: worldX,
            posY: worldY,
            size: { width: entityWidth, height: entityHeight },
            collider: collider,
            config: {
                walkable: true
            }
        };

        // Check all cells the entity would overlap
        const cells = this.getEntityOverlappingCells(gridX, gridY, entityWidth, entityHeight, collider);
        for (const cell of cells) {
            if (!cell.walkable) {
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

    getEntityOverlappingCells(gridX, gridY, entityWidth, entityHeight, entityCollider) {
        const cells = [];
        const worldX = gridX * this.gridSystem.config.cellSize;
        const worldY = gridY * this.gridSystem.config.cellSize;

        const left = worldX + (entityCollider ? entityCollider.offsetX : 0);
        const top = worldY + (entityCollider ? entityCollider.offsetY : 0);
        const right = left + (entityCollider ? entityCollider.width : entityWidth);
        const bottom = top + (entityCollider ? entityCollider.height : entityHeight);

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

    // Enhanced movement cost calculation based on terrain type
    getMovementCost(from, to, entityCapabilities) {
        // Base cost for the move (1.0 for orthogonal, Math.SQRT2 for diagonal)
        const baseMoveCost = (from.x !== to.x && from.y !== to.y) ? Math.SQRT2 : GridSystem.defaultTerrainCost;

        // Get terrain type at destination
        const terrainType = to.terrainType || this.getTerrainTypeAt(to.x, to.y);

        // Get the cost multiplier for this terrain type
        let terrainMultiplier = GridSystem.terrainCosts[terrainType] || GridSystem.defaultTerrainCost;


        // Apply entity capability modifiers
        if (this.isTerrainInCategory(terrainType, 'PREFERRED_PATHS') &&
            entityCapabilities.follows_paths && this.options.preferPaths) {
            // Additional preference for paths if entity follows paths
            terrainMultiplier *= 0.9;
        }

        // Penalize difficult terrain if configured to do so
        if (this.isTerrainInCategory(terrainType, 'DIFFICULT_TERRAIN') && 
            this.options.avoidDifficultTerrain) {
            terrainMultiplier *= 1.2;
        }

        return baseMoveCost * terrainMultiplier;
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

    reconstructPath(cameFrom, current, end, originalStartX, originalStartY, originalEndX, originalEndY, entityWidth, entityHeight, collider, entityCapabilities) {
        const path = [];
        let currentNode = current;
    
        // Add adjusted waypoints
        while (currentNode) {
            const worldPos = this.gridSystem.gridToWorld(currentNode.x, currentNode.y);
            path.unshift(worldPos);
    
            const key = this.getKey(currentNode.x, currentNode.y);
            currentNode = cameFrom.get(key);
        }
    
        // Replace first and last points with original positions
        if (path.length > 0) {
            // Start position is entity top-left
            path[0] = { x: originalStartX, y: originalStartY };
            
            if (path.length > 1) {
                // End position is where entity will center itself to
                path[path.length - 1] = { x: originalEndX, y: originalEndY };
            }
        }
    
        const finalPath = this.options.smoothPaths ? this.smoothPath(path, entityWidth, entityHeight, collider, entityCapabilities) : path;
    
        if (this.options.debug) {
            this.debugElements.path = [...finalPath];
        }
    
        return finalPath;
    }

    smoothPath(path, entityWidth, entityHeight, collider, entityCapabilities) {
        if (path.length <= 2) return path;
    
        const smoothed = [path[0]];
        let currentIndex = 0;
    
        while (currentIndex < path.length - 1) {
            let furthestVisible = currentIndex + 1;
    
            for (let i = currentIndex + 2; i < path.length; i++) {
                if ((i - currentIndex) % 2 !== 0 && i < path.length - 1) continue;
    
                if (this.hasLineOfSight(path[currentIndex], path[i], entityWidth, entityHeight, collider, entityCapabilities)) {
                    furthestVisible = i;
                }
            }
    
            smoothed.push(path[furthestVisible]);
            currentIndex = furthestVisible;
        }
    
        return smoothed;
    }

    // Enhanced line of sight check that considers walkability
    hasLineOfSight(start, end, entityWidth, entityHeight, collider, entityCapabilities) {
        const startGrid = this.gridSystem.worldToGrid(start.x, start.y);
        const endGrid = this.gridSystem.worldToGrid(end.x, end.y);

        const dx = Math.abs(endGrid.x - startGrid.x);
        const dy = Math.abs(endGrid.y - startGrid.y);
        const sx = startGrid.x < endGrid.x ? 1 : -1;
        const sy = startGrid.y < endGrid.y ? 1 : -1;
        let err = dx - dy;

        let x = startGrid.x;
        let y = startGrid.y;

        // Keep track of total terrain cost along the line
        let totalCost = 0;
        const maxTerrainCostRatio = 1.5; // Maximum allowed average terrain cost

        let steps = 0;

        while (x !== endGrid.x || y !== endGrid.y) {
            // Check if this cell is walkable by the entity
            if (x < 0 || x >= this.gridSystem.gridWidth ||
                y < 0 || y >= this.gridSystem.gridHeight) {
                return false;
            }

            // Get the cell and check basic walkability
            const cell = this.gridSystem.grid[x][y];
            if (!cell.walkable) {
                return false;
            }

            // Also check entity fit
            if (!this.canEntityFitAt(x, y, entityWidth, entityHeight, collider, entityCapabilities)) {
                return false;
            }

            // Add cost for this cell
            const terrainType = this.getTerrainTypeAt(x, y);
            if (!this.canTraverseTerrain(terrainType, entityCapabilities)) {
                return false;
            }

            totalCost += GridSystem.terrainCosts[terrainType] || GridSystem.defaultTerrainCost;
            steps++;

            // Check if average terrain cost is too high (inefficient path)
            if (steps > 3 && (totalCost / steps) > maxTerrainCostRatio) {
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

    // Method to manually check walkability at a specific grid location
    checkWalkableAt(gridX, gridY, entityOptions = null) {
        // Apply entity capabilities if provided
        if (entityOptions) {
            this.setEntityCapabilities(entityOptions);
        }

        // Boundary check
        if (gridX < 0 || gridX >= this.gridSystem.gridWidth ||
            gridY < 0 || gridY >= this.gridSystem.gridHeight) {
            console.log(`Position (${gridX}, ${gridY}) is out of bounds`);
            return false;
        }

        const cell = this.gridSystem.grid[gridX][gridY];
        const terrainType = this.getTerrainTypeAt(gridX, gridY);

        console.log(`Checking cell at (${gridX}, ${gridY}):`);
        console.log(`- Cell walkable: ${cell.walkable}`);
        console.log(`- Tile walkable: ${cell.tileWalkable}`);
        console.log(`- Object walkable: ${cell.objectWalkable}`);
        console.log(`- Terrain type: ${terrainType}`);
        console.log(`- Terrain cost: ${GridSystem.terrainCosts[terrainType] || GridSystem.defaultTerrainCost}x`);

        // Check if terrain is traversable based on entity capabilities
        if (!this.canTraverseTerrain(terrainType, entityOptions)) {
            console.log(`- Cell not traversable due to terrain type (${terrainType}) and entity capabilities`);
            return false;
        }

        return cell.walkable;
    }

    visualizePath(container, path, entityWidth, entityHeight, collider) {
        if (!container || !path) return;
    
        const existingNodes = container.querySelectorAll('.pathfinder-node');
        existingNodes.forEach(node => node.remove());
    
        // Visualize the explored and rejected nodes if debug mode is on
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
    
        // Draw path waypoints and lines
        path.forEach((point, index) => {
            const node = document.createElement('div');
            node.className = 'pathfinder-node path-node debug';
            node.classList.add(index === 0 ? 'start-node' :
                index === path.length - 1 ? 'end-node' : 'waypoint-node');
    
            const nodeSize = index === 0 || index === path.length - 1 ? 10 : 6;
            const nodeColor = index === 0 ? 'rgba(0, 255, 0, 0.8)' :
                index === path.length - 1 ? 'rgba(255, 0, 0, 0.8)' :
                    'rgba(0, 100, 255, 0.8)';
    
            // Position node at the point coordinates
            // For start point (top-left) add entity center offset
            // For end point, it's already where we want the center
            let displayX, displayY;
            if (index === 0) {
                // Start point is entity top-left, but we show dot at center
                displayX = point.x + (entityWidth || 0) / 2;
                displayY = point.y + (entityHeight || 0) / 2;
            } else if (index === path.length - 1) {
                // End point is already the center position
                displayX = point.x;
                displayY = point.y;
            } else {
                // For intermediate waypoints
                displayX = point.x;
                displayY = point.y;
            }
    
            Object.assign(node.style, {
                left: `${displayX - nodeSize / 2}px`,
                top: `${displayY - nodeSize / 2}px`,
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
    
        // Draw lines between waypoints
        for (let i = 0; i < path.length - 1; i++) {
            const start = path[i];
            const end = path[i + 1];
    
            // Calculate display coordinates
            let startDisplayX, startDisplayY;
            if (i === 0) {
                // Start is entity top-left, but line should start from center
                startDisplayX = start.x + (entityWidth || 0) / 2;
                startDisplayY = start.y + (entityHeight || 0) / 2;
            } else {
                // Intermediate points use original coordinates
                startDisplayX = start.x;
                startDisplayY = start.y;
            }
            
            let endDisplayX, endDisplayY;
            if (i + 1 === path.length - 1) {
                // End point is already center coordinate
                endDisplayX = end.x;
                endDisplayY = end.y;
            } else {
                // Intermediate points use original coordinates
                endDisplayX = end.x;
                endDisplayY = end.y;
            }
    
            const line = document.createElement('div');
            line.className = 'pathfinder-node path-line debug';
    
            const dx = endDisplayX - startDisplayX;
            const dy = endDisplayY - startDisplayY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    
            Object.assign(line.style, {
                position: 'absolute',
                left: `${startDisplayX}px`,
                top: `${startDisplayY}px`,
                width: `${distance}px`,
                height: '2px',
                backgroundColor: 'rgba(0, 100, 255, 0.6)',
                transformOrigin: '0 0',
                transform: `rotate(${angle}deg)`,
                zIndex: 990 + i
            });
    
            container.appendChild(line);
        }
    
        // Visualize entity and collider at start and end
        if (path.length > 0) {
            this.visualizeEntityCollider(container, path[0], 'start', entityWidth, entityHeight, collider);
            if (path.length > 1) {
                this.visualizeEntityCollider(container, path[path.length - 1], 'end', entityWidth, entityHeight, collider);
            }
        }
    }

    visualizeEntityCollider(container, point, nodeType, entityWidth, entityHeight, entityCollider) {
        if (!container || !point || !entityCollider) return;
    
        const collider = document.createElement('div');
        collider.className = `pathfinder-node entity-collider debug ${nodeType}-collider`;
    
        // Calculate entity position differently based on whether it's start or end
        let entityX, entityY;
        
        if (nodeType === 'start') {
            // For start point - use as is (already positioned at top-left)
            entityX = point.x;
            entityY = point.y;
        } else {
            // For end point - position as if Myte were centered on this point
            // Adjust from target point (which Myte will center to) to get top-left
            entityX = point.x - ((entityWidth) / 2);
            entityY = point.y - (entityHeight / 2);
        }
    
        // Calculate collider position relative to entity top-left
        const left = entityX + entityCollider.offsetX;
        const top = entityY + entityCollider.offsetY;
        const width = entityCollider.width;
        const height = entityCollider.height;
    
        // Visualize the entity box (for debugging)
        const entity = document.createElement('div');
        entity.className = `pathfinder-node entity-box debug ${nodeType}-entity`;
        
        Object.assign(entity.style, {
            position: 'absolute',
            left: `${entityX}px`,
            top: `${entityY}px`,
            width: `${entityWidth}px`,
            height: `${entityHeight}px`,
            border: `1px dashed ${nodeType === 'start' ? 'rgba(0, 255, 0, 0.5)' : 'rgba(255, 0, 0, 0.5)'}`,
            backgroundColor: 'transparent',
            zIndex: 979
        });
    
        // Add center dot to show entity center
        const centerDot = document.createElement('div');
        centerDot.className = `pathfinder-node center-dot debug ${nodeType}-center`;
        
        let centerX, centerY;
        if (nodeType === 'start') {
            centerX = entityX + entityWidth/2;
            centerY = entityY + entityHeight/2;
        } else {
            centerX = point.x; // End point is already a center coordinate
            centerY = point.y;
        }
        
        Object.assign(centerDot.style, {
            position: 'absolute',
            left: `${centerX - 2}px`,
            top: `${centerY - 2}px`,
            width: '4px',
            height: '4px',
            borderRadius: '50%',
            backgroundColor: nodeType === 'start' ? 'lime' : 'red',
            zIndex: 981
        });
    
        // Style the collider
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
    
        // Add all visualizations
        container.appendChild(entity);
        container.appendChild(centerDot);
        container.appendChild(collider);
    }

    setDebugMode(enabled) {
        this.options.debug = enabled;
    }

    // Method to visualize terrain costs across the map
    visualizeTerrainCosts(container, area = null) {
        if (!container) return;

        // Clear existing cost visualizations
        const existingCosts = container.querySelectorAll('.terrain-cost-overlay');
        existingCosts.forEach(node => node.remove());

        // Define the area to visualize (default to visible area)
        const bounds = area || (this.gridSystem.lastCullingBounds || {
            left: 0,
            top: 0,
            right: this.gridSystem.parent.dimensions.width,
            bottom: this.gridSystem.parent.dimensions.height
        });

        // Convert to grid coordinates
        const startGrid = this.gridSystem.worldToGrid(bounds.left, bounds.top);
        const endGrid = this.gridSystem.worldToGrid(bounds.right, bounds.bottom);

        // Create a semi-transparent overlay
        const overlay = document.createElement('div');
        overlay.className = 'terrain-cost-overlay debug';

        Object.assign(overlay.style, {
            position: 'absolute',
            left: `${bounds.left}px`,
            top: `${bounds.top}px`,
            width: `${bounds.right - bounds.left}px`,
            height: `${bounds.bottom - bounds.top}px`,
            backgroundColor: 'rgba(0, 0, 0, 0.1)',
            zIndex: 970,
            display: 'grid',
            gridTemplateColumns: `repeat(${endGrid.x - startGrid.x + 1}, ${this.gridSystem.config.cellSize}px)`,
            gridTemplateRows: `repeat(${endGrid.y - startGrid.y + 1}, ${this.gridSystem.config.cellSize}px)`
        });

        // Add cells with color coding based on terrain cost
        for (let y = startGrid.y; y <= endGrid.y; y++) {
            for (let x = startGrid.x; x <= endGrid.x; x++) {
                if (x >= 0 && x < this.gridSystem.gridWidth &&
                    y >= 0 && y < this.gridSystem.gridHeight) {

                    const terrainType = this.getTerrainTypeAt(x, y);
                    const cost = GridSystem.terrainCosts[terrainType] || GridSystem.defaultTerrainCost;

                    const cell = document.createElement('div');
                    cell.className = `terrain-cost-cell terrain-${terrainType}`;

                    // Color based on cost (green for low, yellow for medium, red for high)
                    let color;
                    if (cost <= 0.9) color = `rgba(0, 255, 0, ${0.2 + 0.3 * (1 - cost)})`;  // Green for preferred
                    else if (cost <= 1.5) color = `rgba(255, 255, 0, ${0.1 + 0.2 * (cost - 0.9)})`;  // Yellow for medium
                    else color = `rgba(255, 0, 0, ${0.1 + 0.4 * Math.min(1, (cost - 1.5) / 3.5)})`;  // Red for high cost

                    Object.assign(cell.style, {
                        backgroundColor: color,
                        position: 'relative',
                        textAlign: 'center',
                        fontSize: '8px',
                        lineHeight: `${this.gridSystem.config.cellSize}px`,
                        color: 'white',
                        textShadow: '1px 1px 1px black'
                    });

                    // Add cost as text
                    if (cost !== GridSystem.defaultTerrainCost) {
                        cell.textContent = cost.toFixed(1) + 'x';
                    }

                    overlay.appendChild(cell);
                }
            }
        }

        container.appendChild(overlay);

        // Add a legend
        const legend = document.createElement('div');
        legend.className = 'terrain-cost-legend debug';

        Object.assign(legend.style, {
            position: 'absolute',
            right: '10px',
            top: '10px',
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            color: 'white',
            padding: '5px',
            borderRadius: '5px',
            fontSize: '10px',
            zIndex: 1100
        });

        legend.innerHTML = `
            <div style="font-weight: bold; margin-bottom: 5px">Terrain Costs</div>
            ${Object.entries(GridSystem.terrainCosts)
                .map(([type, cost]) => `<div><span style="color: ${cost <= 0.9 ? 'lightgreen' : cost <= 1.5 ? 'yellow' : 'salmon'}">${type}</span>: ${cost.toFixed(1)}x</div>`)
                .join('')}
        `;

        container.appendChild(legend);

        return overlay;
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
 * Binary heap implementation for optimized open set in A* pathfinding
 * This provides efficient priority queue operations for the pathfinding algorithm
 */
class BinaryHeap {
    constructor(scoreFunction) {
        this.content = [];
        this.scoreFunction = scoreFunction;
        this.nodeMap = new Map();
    }

    /**
     * Add an element to the heap
     * @param {Object} element - The element to add to the heap
     */
    push(element) {
        this.content.push(element);
        this.nodeMap.set(element.key, this.content.length - 1);
        this.bubbleUp(this.content.length - 1);
    }

    /**
     * Remove and return the highest priority element
     * @returns {Object} The highest priority element
     */
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

    /**
     * Check if the heap contains an element with the given key
     * @param {string} key - The key to check for
     * @returns {boolean} True if the key exists in the heap
     */
    contains(key) {
        return this.nodeMap.has(key);
    }

    /**
     * Remove all elements from the heap
     */
    clear() {
        this.content = [];
        this.nodeMap.clear();
    }

    /**
     * Check if the heap is empty
     * @returns {boolean} True if the heap is empty
     */
    isEmpty() {
        return this.content.length === 0;
    }

    /**
     * Move an element up the binary tree to its correct position
     * @param {number} n - The index of the element to bubble up
     * @private
     */
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

    /**
     * Move an element down the binary tree to its correct position
     * @param {number} n - The index of the element to sink down
     * @private
     */
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