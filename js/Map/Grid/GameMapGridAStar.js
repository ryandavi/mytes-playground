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
            avoidDifficultTerrain: true,    // Whether to avoid difficult terrain


            // Smoothing related options
            smoothingLevel: 'light',     // Options: 'none', 'light', 'medium', 'aggressive'
            maxSmoothingDistance: 5,      // Maximum grid cells to look ahead when smoothing
            preserveCornerWaypoints: true, // Preserve waypoints at significant direction changes

            // Movement normalization
            normalizeSmallMovements: true, // Remove small directional changes for smoother animation
            minSegmentLength: 1.5,        // Minimum segment length to preserve (in grid cells)

            // End point handling
            strictEndPointValidation: true, // Extra validation for end points to prevent collider overlap
            endPointClearance: 1.2,        // Additional clearance factor for end points


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

    // 6. Improved findPath to better handle entity dimensions and colliders
    findPath(startX, startY, endX, endY, options = {}) {
        const entityWidth = options.width || 0;
        const entityHeight = options.height || 0;
        const collider = options.collider || null;
        const entityCapabilities = options.capabilities || {};

        // Store the original positions
        const originalStartX = startX;
        const originalStartY = startY;
        const originalEndX = endX;
        const originalEndY = endY;

        if (this.options.debug) {
            console.log(`Finding path from (${originalStartX.toFixed(0)},${originalStartY.toFixed(0)}) to center on (${originalEndX.toFixed(0)},${originalEndY.toFixed(0)})`);
            console.log(`Entity dimensions: ${entityWidth}x${entityHeight}`);
            if (collider) {
                console.log(`Collider: ${collider.width}x${collider.height} at offset (${collider.offsetX},${collider.offsetY})`);
            }
        }

        // Fast validation of end point - check if it's directly on a non-walkable tile
        // This prevents pathing to obstacles
        const directEndGrid = this.gridSystem.worldToGrid(endX, endY);
        if (directEndGrid.x >= 0 && directEndGrid.x < this.gridSystem.gridWidth &&
            directEndGrid.y >= 0 && directEndGrid.y < this.gridSystem.gridHeight) {

            const endCell = this.gridSystem.grid[directEndGrid.x][directEndGrid.y];
            if (!endCell.walkable) {
                if (this.options.debug) {
                    console.warn(`End position (${endX}, ${endY}) is directly on non-walkable tile`);
                }
                return null; // Invalid end point - don't even try to path to it
            }
        }

        // For start position, we calculate collider position from entity top-left
        let adjustedStartX = startX;
        let adjustedStartY = startY;

        // For end position, calculate where the entity top-left would be
        // if it were centered on the end point
        let adjustedEndX = endX - (entityWidth / 2);
        let adjustedEndY = endY - (entityHeight / 2);

        // Adjust for collider offset
        if (collider) {
            // Start position: add collider center
            adjustedStartX += collider.offsetX + (collider.width / 2);
            adjustedStartY += collider.offsetY + (collider.height / 2);

            // End position: calculate where collider center would be
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

        if (directDistance < this.gridSystem.config.cellSize) {
            // Still check if the end position is valid
            const endEntityX = endX - (entityWidth / 2);
            const endEntityY = endY - (entityHeight / 2);

            const validEnd = this.validatePosition(
                endEntityX, endEntityY,
                entityWidth, entityHeight,
                collider, entityCapabilities
            );

            if (!validEnd) {
                if (this.options.debug) {
                    console.warn(`Direct path end position is invalid`);
                }
                return null;
            }

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
            // Validate that the entity can actually fit at the end position
            const endEntityX = endX - (entityWidth / 2);
            const endEntityY = endY - (entityHeight / 2);

            const validEnd = this.validatePosition(
                endEntityX, endEntityY,
                entityWidth, entityHeight,
                collider, entityCapabilities
            );

            if (!validEnd) {
                if (this.options.debug) {
                    console.warn(`End position is invalid even though coords match`);
                }
                return null;
            }

            return [
                { x: originalStartX, y: originalStartY },
                { x: originalEndX, y: originalEndY }
            ];
        }

        // Validate start position
        let validStart = null;
        if (!this.canEntityFitAt(start.x, start.y, entityWidth, entityHeight, collider, entityCapabilities)) {
            if (this.options.debug) {
                console.warn(`Entity cannot fit at start position (${start.x}, ${start.y})`);
            }

            validStart = this.findNearestValidPosition(start.x, start.y, 5, entityWidth, entityHeight, collider, entityCapabilities);

            if (!validStart) {
                console.warn("No valid start position found");
                return null;
            }

            start.x = validStart.x;
            start.y = validStart.y;
        }

        // Validate end position
        let validEnd = null;

        // First validate if entity can be positioned at the end point with its center at the target
        const endEntityX = endX - (entityWidth / 2);
        const endEntityY = endY - (entityHeight / 2);
        const endValidated = this.validatePosition(
            endEntityX, endEntityY,
            entityWidth, entityHeight,
            collider, entityCapabilities
        );

        if (!endValidated) {
            if (this.options.debug) {
                console.warn(`End position (${endX}, ${endY}) is invalid - entity would collide`);
            }
            return null; // Invalid end point
        }

        // Also check if the entity can fit at the grid position
        if (!this.canEntityFitAt(end.x, end.y, entityWidth, entityHeight, collider, entityCapabilities)) {
            if (this.options.debug) {
                console.warn(`Entity cannot fit at end grid position (${end.x}, ${end.y})`);
            }

            validEnd = this.findNearestValidPosition(end.x, end.y, 5, entityWidth, entityHeight, collider, entityCapabilities);

            if (!validEnd) {
                console.warn("No valid end position found");
                return null;
            }

            end.x = validEnd.x;
            end.y = validEnd.y;
        }

        // Initialize A* data structures
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
        const startTime = performance.now();
        const timeoutMs = 500; // 500ms timeout

        // Main A* search loop
        while (!this.openSet.isEmpty()) {
            steps++;

            // Check for timeout
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

                    return partialPath;
                }
                return null;
            }

            // Check for maximum steps
            if (steps > this.options.maxSearchSteps) {
                if (this.options.debug) {
                    console.warn(`Exceeded max search steps (${this.options.maxSearchSteps})`);
                }
                return null;
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

            // Get neighbors with special handling for directional collisions
            const neighbors = this.getNeighbors(
                current.x, current.y,
                entityWidth, entityHeight,
                collider, entityCapabilities,
                { isPathingUpward: adjustedEndY < adjustedStartY } // Flag if pathing upward
            );

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

        return null;
    }



    validatePosition(entityX, entityY, entityWidth, entityHeight, collider, entityCapabilities) {
        if (!entityWidth || !entityHeight) {
            return true; // No entity dimensions to check
        }

        // Calculate world bounds of the entity
        const entityRight = entityX + entityWidth;
        const entityBottom = entityY + entityHeight;

        // Calculate the entity's collider world position
        const colliderX = entityX + (collider ? collider.offsetX : 0);
        const colliderY = entityY + (collider ? collider.offsetY : 0);
        const colliderRight = colliderX + (collider ? collider.width : entityWidth);
        const colliderBottom = colliderY + (collider ? collider.height : entityHeight);

        // Convert to grid coordinates - check all cells the collider would overlap
        const startGridX = Math.floor(colliderX / this.gridSystem.config.cellSize);
        const startGridY = Math.floor(colliderY / this.gridSystem.config.cellSize);
        const endGridX = Math.ceil(colliderRight / this.gridSystem.config.cellSize);
        const endGridY = Math.ceil(colliderBottom / this.gridSystem.config.cellSize);

        // Check all grid cells the collider would overlap
        for (let gridX = startGridX; gridX < endGridX; gridX++) {
            for (let gridY = startGridY; gridY < endGridY; gridY++) {
                // Skip if out of bounds
                if (gridX < 0 || gridX >= this.gridSystem.gridWidth ||
                    gridY < 0 || gridY >= this.gridSystem.gridHeight) {
                    return false; // Consider out-of-bounds as non-walkable
                }

                // Check if cell is walkable
                const cell = this.gridSystem.grid[gridX][gridY];
                if (!cell.walkable) {
                    // Calculate precise overlap with this cell
                    const cellWorldX = gridX * this.gridSystem.config.cellSize;
                    const cellWorldY = gridY * this.gridSystem.config.cellSize;
                    const cellWorldRight = cellWorldX + this.gridSystem.config.cellSize;
                    const cellWorldBottom = cellWorldY + this.gridSystem.config.cellSize;

                    // Check if collider overlaps this cell
                    if (!(colliderRight <= cellWorldX || colliderX >= cellWorldRight ||
                        colliderBottom <= cellWorldY || colliderY >= cellWorldBottom)) {
                        return false; // Collider overlaps non-walkable cell
                    }
                }
            }
        }

        // Check against other colliders in the world
        const testEntity = {
            posX: entityX,
            posY: entityY,
            size: { width: entityWidth, height: entityHeight },
            collider: collider,
            config: { walkable: true }
        };

        const potentialColliders = this.gridSystem.getPotentialColliders(testEntity);
        if (potentialColliders && potentialColliders.length > 0) {
            for (const colliderObj of potentialColliders) {
                if (!colliderObj.config?.walkable) {
                    // Use detailed collision detection
                    if (this.checkDetailedCollision(testEntity, colliderObj)) {
                        return false;
                    }
                }
            }
        }

        return true;
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


    hasAdequateClearance(gridX, gridY, entityWidth, entityHeight, collider, direction) {
        // Determine the clearance needed based on entity size relative to grid cell
        const cellSize = this.gridSystem.config.cellSize;
        const widthInCells = entityWidth / cellSize;
        const heightInCells = entityHeight / cellSize;

        // Calculate required clearance (at least 2 cells or half entity width/height)
        const requiredClearance = Math.max(1, Math.ceil(Math.max(widthInCells, heightInCells) / 2));

        // For large entities, check a wider area
        for (let dx = -requiredClearance; dx <= requiredClearance; dx++) {
            for (let dy = -requiredClearance; dy <= requiredClearance; dy++) {
                // Skip checking the center
                if (dx === 0 && dy === 0) continue;

                // Skip checking cells too far from entity center
                const distance = Math.sqrt(dx * dx + dy * dy);
                if (distance > requiredClearance + 0.5) continue;

                const checkX = gridX + dx;
                const checkY = gridY + dy;

                // Skip if out of bounds
                if (checkX < 0 || checkX >= this.gridSystem.gridWidth ||
                    checkY < 0 || checkY >= this.gridSystem.gridHeight) {
                    continue;
                }

                // If this cell is not walkable, check if it's too close to our path
                if (!this.gridSystem.grid[checkX][checkY].walkable) {
                    // When moving in a direction, we want more clearance in that direction
                    // This prevents hugging walls too closely
                    let isInPathDirection = false;

                    if (direction) {
                        // If moving right, ensure clearance on the right side
                        if (direction.x > 0 && dx > 0) isInPathDirection = true;
                        // If moving left, ensure clearance on the left side
                        if (direction.x < 0 && dx < 0) isInPathDirection = true;
                        // If moving up, ensure clearance above
                        if (direction.y < 0 && dy < 0) isInPathDirection = true;
                        // If moving down, ensure clearance below
                        if (direction.y > 0 && dy > 0) isInPathDirection = true;
                    }

                    // Apply stricter clearance check in the movement direction
                    const minSafeDist = isInPathDirection ? 1.5 : 1.0;

                    if (distance < minSafeDist) {
                        return false; // Too close to an obstacle
                    }
                }
            }
        }

        return true;
    }

    getNeighbors(x, y, entityWidth, entityHeight, collider, entityCapabilities, options = {}) {
        const neighbors = [];
        const directions = this.options.allowDiagonals ? this.directions : this.directions.slice(0, 4);

        // Check if we're pathing upward (needs special handling)
        const isPathingUpward = options.isPathingUpward || false;

        // Add extra clearance for upward movement
        const upwardClearance = isPathingUpward ? 1.5 : 1.0;

        // We'll use this to add extra clearance in the vertical direction if needed
        const getEffectiveCollider = (dir) => {
            if (!collider) return null;

            // For upward movement, increase the collider height temporarily
            // This compensates for the fact that the collider is at the bottom of the entity
            if (isPathingUpward && dir.y < 0) {
                return {
                    offsetX: collider.offsetX,
                    offsetY: collider.offsetY * upwardClearance, // Extend upward
                    width: collider.width,
                    height: collider.height * upwardClearance // Make taller
                };
            }

            return collider;
        };

        for (const dir of directions) {
            const newX = x + dir.x;
            const newY = y + dir.y;

            // Skip if out of bounds
            if (newX < 0 || newX >= this.gridSystem.gridWidth ||
                newY < 0 || newY >= this.gridSystem.gridHeight) {
                continue;
            }

            // Quick check for walkability
            const cell = this.gridSystem.grid[newX][newY];
            if (!cell.walkable) {
                if (this.options.debug) {
                    this.debugElements.rejectedNodes.add(this.getKey(newX, newY));
                }
                continue;
            }

            // Get terrain type and check traversability
            const terrainType = this.getTerrainTypeAt(newX, newY);
            if (!this.canTraverseTerrain(terrainType, entityCapabilities)) {
                if (this.options.debug) {
                    this.debugElements.rejectedNodes.add(this.getKey(newX, newY));
                }
                continue;
            }

            // Get directionally adjusted collider
            const effectiveCollider = getEffectiveCollider(dir);

            // Special case for diagonal movement
            if (Math.abs(dir.x) === 1 && Math.abs(dir.y) === 1) {
                // Extra checks for diagonal movements - ensure both cardinal neighbors are walkable
                if (!this.options.allowDiagonalCutting) {
                    if (!this.gridSystem.grid[x][newY].walkable || !this.gridSystem.grid[newX][y].walkable) {
                        if (this.options.debug) {
                            this.debugElements.rejectedNodes.add(this.getKey(newX, newY));
                        }
                        continue;
                    }

                    // For diagonal movement, check both cardinal directions with the effective collider
                    if (!this.canEntityFitAt(x, newY, entityWidth, entityHeight, effectiveCollider, entityCapabilities) ||
                        !this.canEntityFitAt(newX, y, entityWidth, entityHeight, effectiveCollider, entityCapabilities)) {
                        if (this.options.debug) {
                            this.debugElements.rejectedNodes.add(this.getKey(newX, newY));
                        }
                        continue;
                    }
                }
            }

            // Check if entity can fit with direction-adjusted collider
            if (!this.canEntityFitAt(newX, newY, entityWidth, entityHeight, effectiveCollider, entityCapabilities)) {
                if (this.options.debug) {
                    this.debugElements.rejectedNodes.add(this.getKey(newX, newY));
                }
                continue;
            }

            // Add extra check for adequate clearance
            if (!this.hasAdequateClearance(newX, newY, entityWidth, entityHeight, effectiveCollider, dir)) {
                if (this.options.debug) {
                    this.debugElements.rejectedNodes.add(this.getKey(newX, newY));
                }
                continue;
            }

            neighbors.push({
                x: newX,
                y: newY,
                terrainType: terrainType
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

        // Basic walkability check
        const cell = this.gridSystem.grid[gridX][gridY];
        if (!cell.walkable) {
            return false;
        }

        // Get terrain type for capability check
        const terrainType = this.getTerrainTypeAt(gridX, gridY);
        if (entityCapabilities && !this.canTraverseTerrain(terrainType, entityCapabilities)) {
            return false;
        }

        // If no entity dimensions provided, just use the grid walkability
        if (!entityWidth || entityWidth <= 0 || !entityHeight || entityHeight <= 0) {
            return cell.walkable;
        }

        // Check for doors if entity can't open them
        if (entityCapabilities && !entityCapabilities.can_open_doors && cell.hasDoor) {
            return false;
        }

        // Calculate world position
        const worldX = gridX * this.gridSystem.config.cellSize;
        const worldY = gridY * this.gridSystem.config.cellSize;

        // Create a test entity at this position
        const testEntity = {
            posX: worldX,
            posY: worldY,
            size: { width: entityWidth, height: entityHeight },
            collider: collider,
            config: { walkable: true }
        };

        // Check all grid cells the entity collider would overlap
        if (collider) {
            // Calculate collider world bounds
            const colliderX = worldX + collider.offsetX;
            const colliderY = worldY + collider.offsetY;
            const colliderRight = colliderX + collider.width;
            const colliderBottom = colliderY + collider.height;

            // Convert to grid coordinates
            const startGridX = Math.floor(colliderX / this.gridSystem.config.cellSize);
            const startGridY = Math.floor(colliderY / this.gridSystem.config.cellSize);
            const endGridX = Math.ceil(colliderRight / this.gridSystem.config.cellSize);
            const endGridY = Math.ceil(colliderBottom / this.gridSystem.config.cellSize);

            // Check all overlapping cells
            for (let x = startGridX; x < endGridX; x++) {
                for (let y = startGridY; y < endGridY; y++) {
                    // Skip if out of bounds
                    if (x < 0 || x >= this.gridSystem.gridWidth ||
                        y < 0 || y >= this.gridSystem.gridHeight) {
                        return false;
                    }

                    if (!this.gridSystem.grid[x][y].walkable) {
                        // Calculate precise collision with this cell
                        const cellWorldX = x * this.gridSystem.config.cellSize;
                        const cellWorldY = y * this.gridSystem.config.cellSize;
                        const cellWorldRight = cellWorldX + this.gridSystem.config.cellSize;
                        const cellWorldBottom = cellWorldY + this.gridSystem.config.cellSize;

                        // Check if collider overlaps this cell
                        if (!(colliderRight <= cellWorldX || colliderX >= cellWorldRight ||
                            colliderBottom <= cellWorldY || colliderY >= cellWorldBottom)) {
                            return false; // Collider overlaps non-walkable cell
                        }
                    }
                }
            }
        }

        // Check against world colliders
        const potentialColliders = this.gridSystem.getPotentialColliders(testEntity);
        if (potentialColliders && potentialColliders.length > 0) {
            // Use parent's collision detection if available
            if (this.gridSystem.parent &&
                this.gridSystem.parent.parent &&
                typeof this.gridSystem.parent.parent.checkCollision === 'function') {

                for (const colliderObj of potentialColliders) {
                    if (!colliderObj.config?.walkable) {
                        if (this.gridSystem.parent.parent.checkCollision(testEntity, colliderObj)) {
                            return false;
                        }
                    }
                }
            } else {
                // Fallback to our detailed collision check
                for (const colliderObj of potentialColliders) {
                    if (colliderObj.config && !colliderObj.config.walkable) {
                        if (this.checkDetailedCollision(testEntity, colliderObj)) {
                            return false;
                        }
                    }
                }
            }
        }

        return true;
    }

    checkDetailedCollision(entity1, entity2) {
        // Get collider bounds for entity1
        const e1Left = entity1.posX + (entity1.collider ? entity1.collider.offsetX : 0);
        const e1Top = entity1.posY + (entity1.collider ? entity1.collider.offsetY : 0);
        const e1Width = entity1.collider ? entity1.collider.width : entity1.size.width;
        const e1Height = entity1.collider ? entity1.collider.height : entity1.size.height;
        const e1Right = e1Left + e1Width;
        const e1Bottom = e1Top + e1Height;

        // Get collider bounds for entity2
        const e2Left = entity2.posX + (entity2.collider ? entity2.collider.offsetX : 0);
        const e2Top = entity2.posY + (entity2.collider ? entity2.collider.offsetY : 0);
        const e2Width = entity2.collider ? entity2.collider.width : entity2.size.width;
        const e2Height = entity2.collider ? entity2.collider.height : entity2.size.height;
        const e2Right = e2Left + e2Width;
        const e2Bottom = e2Top + e2Height;

        // Add a safety buffer (2 pixels) for near collisions
        const buffer = 2;

        // Check for collision with buffer
        const collision = !(
            e1Right + buffer <= e2Left ||
            e1Left - buffer >= e2Right ||
            e1Bottom + buffer <= e2Top ||
            e1Top - buffer >= e2Bottom
        );

        return collision;
    }

    // Enhanced movement cost calculation based on terrain type
    getMovementCost(from, to, entityCapabilities) {
        // Base cost for the move (1.0 for orthogonal, Math.SQRT2 for diagonal)
        const baseMoveCost = (from.x !== to.x && from.y !== to.y) ? Math.SQRT2 : 1.0;

        // Get terrain type at destination
        const terrainType = to.terrainType || this.getTerrainTypeAt(to.x, to.y);

        // Get the cost multiplier for this terrain type
        let terrainMultiplier = GridSystem.terrainCosts[terrainType] || GridSystem.defaultTerrainCost;

        // Apply entity capability modifiers with stronger preferences
        if (this.options.preferPaths &&
            this.isTerrainInCategory(terrainType, 'PREFERRED_PATHS') &&
            entityCapabilities && entityCapabilities.follows_paths) {
            // Make paths more attractive for entities that prefer them
            terrainMultiplier *= 0.7;
        }

        // Penalize difficult terrain more significantly if configured
        if (this.options.avoidDifficultTerrain &&
            this.isTerrainInCategory(terrainType, 'DIFFICULT_TERRAIN')) {
            terrainMultiplier *= 1.8;
        }

        // Additional penalty for water if entity can't swim
        if (this.isTerrainInCategory(terrainType, 'WATER') &&
            entityCapabilities && !entityCapabilities.can_swim) {
            terrainMultiplier *= 5.0; // Make water very unattractive
        }

        // Apply obstacle proximity factor if available (from getNeighbors)
        const obstacleFactor = to.obstacleFactor || 1.0;

        return baseMoveCost * terrainMultiplier * obstacleFactor;
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

    // 8. Enhanced hasLineOfSight with special handling for upward movement
    hasLineOfSight(start, end, entityWidth, entityHeight, collider, entityCapabilities) {
        // If no dimensions, use basic LOS
        if (!entityWidth || !entityHeight) {
            return this.basicLineOfSight(start, end);
        }

        // Calculate vector and distance
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Check if moving upward (negative y direction)
        const isMovingUpward = dy < 0;

        // Determine number of check points based on distance
        // More detailed checking for longer distances and upward movement
        const checksPerCell = isMovingUpward ? 3 : 2;
        const cellSize = this.gridSystem.config.cellSize;
        const numChecks = Math.max(10, Math.ceil(distance / (cellSize / checksPerCell)));

        // Temporarily adjust collider for upward movement
        let tempCollider = collider;
        if (isMovingUpward && collider) {
            tempCollider = {
                offsetX: collider.offsetX,
                offsetY: collider.offsetY * 0.9, // Move collider up slightly
                width: collider.width,
                height: collider.height * 1.2  // Make taller for upward movement
            };
        }

        // Check points along the line
        for (let i = 1; i <= numChecks; i++) {
            const ratio = i / numChecks;
            const checkX = start.x + dx * ratio;
            const checkY = start.y + dy * ratio;

            // Create test entity at this position
            // Adjust for entity center vs top-left
            const entityX = checkX - (entityWidth / 2);
            const entityY = checkY - (entityHeight / 2);

            // Validate the entity can fit at this position
            if (!this.validatePosition(
                entityX, entityY,
                entityWidth, entityHeight,
                tempCollider, entityCapabilities
            )) {
                return false;
            }
        }

        return true;
    }

    // 9. Improved and simpler basicLineOfSight for non-entity checks
    basicLineOfSight(start, end) {
        const startGrid = this.gridSystem.worldToGrid(start.x, start.y);
        const endGrid = this.gridSystem.worldToGrid(end.x, end.y);

        // Use Bresenham's line algorithm
        const dx = Math.abs(endGrid.x - startGrid.x);
        const dy = Math.abs(endGrid.y - startGrid.y);
        const sx = startGrid.x < endGrid.x ? 1 : -1;
        const sy = startGrid.y < endGrid.y ? 1 : -1;
        let err = dx - dy;

        let x = startGrid.x;
        let y = startGrid.y;

        while (x !== endGrid.x || y !== endGrid.y) {
            // Check if current cell is walkable
            if (x < 0 || x >= this.gridSystem.gridWidth ||
                y < 0 || y >= this.gridSystem.gridHeight) {
                return false;
            }

            if (!this.gridSystem.grid[x][y].walkable) {
                return false;
            }

            // Move to next cell
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

    // 10. Enhanced path normalization focused on keeping critical points
    normalizePathMovements(path, entityWidth, entityHeight) {
        if (path.length <= 2) return path;

        const normalized = [path[0]];

        // Parameters for normalization
        const minSegmentLength = (this.options.minSegmentLength || 1.5) * this.gridSystem.config.cellSize;
        const significantAngle = 30; // Degrees for significant direction change

        // Special handling for start/end segments
        const firstSegmentLength = this.getDistance(path[0], path[1]);
        const isFirstSegmentShort = firstSegmentLength < minSegmentLength;

        let lastPoint = path[0];
        let lastIndex = 0;

        // Process middle points (skip first, always keep last)
        for (let i = 1; i < path.length - 1; i++) {
            const currentPoint = path[i];

            // Calculate current segment length
            const segmentLength = this.getDistance(lastPoint, currentPoint);

            // Get directions for angle calculation
            const prevDirection = i > 1 ?
                this.getDirection(path[i - 2], lastPoint) :
                this.getDirection(lastPoint, currentPoint);

            const currDirection = this.getDirection(lastPoint, currentPoint);
            const nextDirection = this.getDirection(currentPoint, path[i + 1]);

            // Calculate direction changes
            const prevAngleChange = Math.abs(this.getAngleDifference(prevDirection, currDirection));
            const nextAngleChange = Math.abs(this.getAngleDifference(currDirection, nextDirection));

            // Keep this point if:
            // 1. It's a significant direction change OR
            // 2. The segment is long enough
            const isSignificantTurn = prevAngleChange > significantAngle || nextAngleChange > significantAngle;

            // Special case for first additional point (index 1)
            if (i === 1 && isFirstSegmentShort && !isSignificantTurn) {
                // Skip the first grid point if it's too close to start
                continue;
            }

            // Special case for points near the end
            if (i === path.length - 2) {
                const finalSegmentLength = this.getDistance(currentPoint, path[path.length - 1]);
                if (finalSegmentLength < minSegmentLength && !isSignificantTurn) {
                    // Skip the second-to-last point if it's too close to end and not a turn
                    continue;
                }
            }

            if (isSignificantTurn || segmentLength >= minSegmentLength) {
                normalized.push(currentPoint);
                lastPoint = currentPoint;
                lastIndex = i;
            }
        }

        // Always include the last point
        normalized.push(path[path.length - 1]);

        return normalized;
    }

    // 11. Helper method to get angle difference in degrees
    getAngleDifference(angle1, angle2) {
        let diff = angle2 - angle1;

        // Normalize to [-180, 180]
        if (diff > 180) diff -= 360;
        if (diff < -180) diff += 360;

        return diff;
    }

    // 12. Enhanced reconstructPath to handle entity positioning correctly
    reconstructPath(cameFrom, current, end, originalStartX, originalStartY, originalEndX, originalEndY, entityWidth, entityHeight, collider, entityCapabilities) {
        const path = [];
        let currentNode = current;

        // Build path by following the cameFrom pointers
        while (currentNode) {
            const worldPos = this.gridSystem.gridToWorld(currentNode.x, currentNode.y);
            path.unshift(worldPos);

            const key = this.getKey(currentNode.x, currentNode.y);
            currentNode = cameFrom.get(key);
        }

        // Replace first and last points with original positions
        if (path.length > 0) {
            // Start position is original entity position
            path[0] = { x: originalStartX, y: originalStartY };

            if (path.length > 1) {
                // End position is target center position
                path[path.length - 1] = { x: originalEndX, y: originalEndY };

                // Validate end position one last time
                const endEntityX = originalEndX - (entityWidth / 2);
                const endEntityY = originalEndY - (entityHeight / 2);

                const isEndValid = this.validatePosition(
                    endEntityX, endEntityY,
                    entityWidth, entityHeight,
                    collider, entityCapabilities
                );

                if (!isEndValid && path.length > 2) {
                    // If end position isn't valid but we have waypoints,
                    // use the second-to-last as the final point
                    path.pop();

                    if (this.options.debug) {
                        console.warn("End position invalid, using second-to-last point instead");
                    }
                }
            }
        }

        // Apply path processing based on options
        let finalPath = path;

        // Apply smoothing if enabled
        if (this.options.smoothPaths) {
            finalPath = this.smoothPath(
                finalPath,
                entityWidth, entityHeight,
                collider, entityCapabilities
            );
        }

        // Apply normalization if enabled
        if (this.options.normalizeSmallMovements) {
            finalPath = this.normalizePathMovements(
                finalPath,
                entityWidth, entityHeight
            );
        }

        // Store path for debugging
        if (this.options.debug) {
            this.debugElements.path = [...finalPath];
        }

        return finalPath;
    }

    hasAdequateClearance(gridX, gridY, safetyBuffer) {
        // Check cells in a square around the target position
        for (let dx = -safetyBuffer; dx <= safetyBuffer; dx++) {
            for (let dy = -safetyBuffer; dy <= safetyBuffer; dy++) {
                // Skip checking the center cell (already checked for walkability)
                if (dx === 0 && dy === 0) continue;

                const checkX = gridX + dx;
                const checkY = gridY + dy;

                // Skip if out of bounds
                if (checkX < 0 || checkX >= this.gridSystem.gridWidth ||
                    checkY < 0 || checkY >= this.gridSystem.gridHeight) {
                    continue;
                }

                // Calculate distance from center (use Manhattan distance for speed)
                const distance = Math.abs(dx) + Math.abs(dy);

                // Stricter checks for closer cells
                if (distance <= 1) {
                    // For immediate neighbors, ensure they're walkable
                    if (!this.gridSystem.grid[checkX][checkY].walkable) {
                        return false;
                    }
                }
                // For cells further away, we can be more lenient
                // This helps create better paths while avoiding tight spaces
            }
        }

        return true;
    }




    // 5. Improved smoothPath for better results with obstacles
    smoothPath(path, entityWidth, entityHeight, collider, entityCapabilities) {
        if (path.length <= 2) return path;

        // If smoothing is disabled, return original path
        if (!this.options.smoothPaths) {
            return path;
        }

        const smoothed = [path[0]];
        let currentIndex = 0;

        // Use a conservative approach for smoothing
        const safetyMargin = 1.1; // 10% safety margin

        while (currentIndex < path.length - 1) {
            let furthestVisible = currentIndex + 1;

            // Look ahead for furthest visible point
            for (let i = currentIndex + 2; i < path.length; i++) {
                // Skip distant points for efficiency
                if (i > currentIndex + 5) break;

                // Apply safety margin to entity dimensions for line of sight checks
                const safeWidth = entityWidth * safetyMargin;
                const safeHeight = entityHeight * safetyMargin;

                // Calculate direction of movement
                const dx = path[i].x - path[currentIndex].x;
                const dy = path[i].y - path[currentIndex].y;

                // Determine if this segment moves upward
                const isMovingUpward = dy < 0;

                // Use temporary expanded collider for upward movement
                let tempCollider = collider;
                if (isMovingUpward && collider) {
                    tempCollider = {
                        offsetX: collider.offsetX,
                        offsetY: collider.offsetY * 0.9, // Move collider up slightly
                        width: collider.width,
                        height: collider.height * 1.2  // Make taller
                    };
                }

                // Check line of sight with appropriate collider
                if (this.hasLineOfSight(
                    path[currentIndex],
                    path[i],
                    safeWidth,
                    safeHeight,
                    tempCollider,
                    entityCapabilities
                )) {
                    furthestVisible = i;
                } else {
                    // Stop at first non-visible point
                    break;
                }
            }

            smoothed.push(path[furthestVisible]);
            currentIndex = furthestVisible;
        }

        return smoothed;
    }

    normalizePathMovements(path, entityWidth, entityHeight) {
        if (path.length <= 2) return path;

        const normalized = [path[0]];

        // Parameters for normalization
        const minSegmentLength = (this.options.minSegmentLength || 1.5) * this.gridSystem.config.cellSize;
        const significantAngle = 30; // Degrees for significant direction change

        // Special handling for start/end segments
        const firstSegmentLength = this.getDistance(path[0], path[1]);
        const isFirstSegmentShort = firstSegmentLength < minSegmentLength;

        let lastPoint = path[0];
        let lastIndex = 0;

        // Process middle points (skip first, always keep last)
        for (let i = 1; i < path.length - 1; i++) {
            const currentPoint = path[i];

            // Calculate current segment length
            const segmentLength = this.getDistance(lastPoint, currentPoint);

            // Get directions for angle calculation
            const prevDirection = i > 1 ?
                this.getDirection(path[i - 2], lastPoint) :
                this.getDirection(lastPoint, currentPoint);

            const currDirection = this.getDirection(lastPoint, currentPoint);
            const nextDirection = this.getDirection(currentPoint, path[i + 1]);

            // Calculate direction changes
            const prevAngleChange = Math.abs(this.getAngleDifference(prevDirection, currDirection));
            const nextAngleChange = Math.abs(this.getAngleDifference(currDirection, nextDirection));

            // Keep this point if:
            // 1. It's a significant direction change OR
            // 2. The segment is long enough
            const isSignificantTurn = prevAngleChange > significantAngle || nextAngleChange > significantAngle;

            // Special case for first additional point (index 1)
            if (i === 1 && isFirstSegmentShort && !isSignificantTurn) {
                // Skip the first grid point if it's too close to start
                continue;
            }

            // Special case for points near the end
            if (i === path.length - 2) {
                const finalSegmentLength = this.getDistance(currentPoint, path[path.length - 1]);
                if (finalSegmentLength < minSegmentLength && !isSignificantTurn) {
                    // Skip the second-to-last point if it's too close to end and not a turn
                    continue;
                }
            }

            if (isSignificantTurn || segmentLength >= minSegmentLength) {
                normalized.push(currentPoint);
                lastPoint = currentPoint;
                lastIndex = i;
            }
        }

        // Always include the last point
        normalized.push(path[path.length - 1]);

        return normalized;
    }

    getAngleDifference(angle1, angle2) {
        let diff = angle2 - angle1;

        // Normalize to [-180, 180]
        if (diff > 180) diff -= 360;
        if (diff < -180) diff += 360;

        return diff;
    }


    getDistance(pointA, pointB) {
        const dx = pointB.x - pointA.x;
        const dy = pointB.y - pointA.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    // 6. Helper method to calculate direction angle between points (in degrees)
    getDirection(pointA, pointB) {
        const dx = pointB.x - pointA.x;
        const dy = pointB.y - pointA.y;

        // Calculate angle in degrees (0 = right, 90 = down, 180 = left, 270 = up)
        let angle = Math.atan2(dy, dx) * (180 / Math.PI);

        // Normalize to 0-360 range
        if (angle < 0) angle += 360;

        return angle;
    }


    // Enhanced line of sight check that considers walkability
    hasLineOfSight(start, end, entityWidth, entityHeight, collider, entityCapabilities) {
        // If no dimensions, use basic LOS
        if (!entityWidth || !entityHeight) {
            return this.basicLineOfSight(start, end);
        }

        // Calculate vector and distance
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Check if moving upward (negative y direction)
        const isMovingUpward = dy < 0;

        // Determine number of check points based on distance
        // More detailed checking for longer distances and upward movement
        const checksPerCell = isMovingUpward ? 3 : 2;
        const cellSize = this.gridSystem.config.cellSize;
        const numChecks = Math.max(10, Math.ceil(distance / (cellSize / checksPerCell)));

        // Temporarily adjust collider for upward movement
        let tempCollider = collider;
        if (isMovingUpward && collider) {
            tempCollider = {
                offsetX: collider.offsetX,
                offsetY: collider.offsetY * 0.9, // Move collider up slightly
                width: collider.width,
                height: collider.height * 1.2  // Make taller for upward movement
            };
        }

        // Check points along the line
        for (let i = 1; i <= numChecks; i++) {
            const ratio = i / numChecks;
            const checkX = start.x + dx * ratio;
            const checkY = start.y + dy * ratio;

            // Create test entity at this position
            // Adjust for entity center vs top-left
            const entityX = checkX - (entityWidth / 2);
            const entityY = checkY - (entityHeight / 2);

            // Validate the entity can fit at this position
            if (!this.validatePosition(
                entityX, entityY,
                entityWidth, entityHeight,
                tempCollider, entityCapabilities
            )) {
                return false;
            }
        }

        return true;
    }

    basicLineOfSight(start, end) {
        const startGrid = this.gridSystem.worldToGrid(start.x, start.y);
        const endGrid = this.gridSystem.worldToGrid(end.x, end.y);

        // Use Bresenham's line algorithm
        const dx = Math.abs(endGrid.x - startGrid.x);
        const dy = Math.abs(endGrid.y - startGrid.y);
        const sx = startGrid.x < endGrid.x ? 1 : -1;
        const sy = startGrid.y < endGrid.y ? 1 : -1;
        let err = dx - dy;

        let x = startGrid.x;
        let y = startGrid.y;

        while (x !== endGrid.x || y !== endGrid.y) {
            // Check if current cell is walkable
            if (x < 0 || x >= this.gridSystem.gridWidth ||
                y < 0 || y >= this.gridSystem.gridHeight) {
                return false;
            }

            if (!this.gridSystem.grid[x][y].walkable) {
                return false;
            }

            // Move to next cell
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


    visualizePath(container, path, entityWidth, entityHeight, collider) {
        if (!container || !path) return;

        // Clear existing visualizations
        const existingNodes = container.querySelectorAll('.pathfinder-node');
        existingNodes.forEach(node => node.remove());

        // Visualize the path with directional information
        for (let i = 0; i < path.length; i++) {
            const point = path[i];
            const isStart = i === 0;
            const isEnd = i === path.length - 1;

            // Create node for this point
            const node = document.createElement('div');
            node.className = `pathfinder-node path-node debug ${isStart ? 'start-node' : isEnd ? 'end-node' : 'waypoint-node'}`;

            const nodeSize = isStart || isEnd ? 10 : 6;
            const nodeColor = isStart ? 'rgba(0, 255, 0, 0.8)' :
                isEnd ? 'rgba(255, 0, 0, 0.8)' : 'rgba(0, 100, 255, 0.8)';

            // Position node
            let displayX, displayY;
            if (isStart) {
                // Start position is entity top-left, show dot at center
                displayX = point.x + (entityWidth / 2);
                displayY = point.y + (entityHeight / 2);
            } else if (isEnd) {
                // End position is already center position
                displayX = point.x;
                displayY = point.y;
            } else {
                // Intermediate points
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
                zIndex: 1000 + i
            });

            if (!isStart && !isEnd) {
                node.textContent = i;
                node.style.color = 'white';
                node.style.fontSize = '8px';
                node.style.textAlign = 'center';
                node.style.lineHeight = `${nodeSize}px`;
            }

            container.appendChild(node);

            // Add path lines
            if (i > 0) {
                const prevPoint = path[i - 1];
                const line = document.createElement('div');
                line.className = 'pathfinder-node path-line debug';

                // Calculate display coordinates
                let startX, startY;
                if (i - 1 === 0) {
                    // First segment starts at entity center
                    startX = prevPoint.x + (entityWidth / 2);
                    startY = prevPoint.y + (entityHeight / 2);
                } else {
                    startX = prevPoint.x;
                    startY = prevPoint.y;
                }

                let endX, endY;
                if (isEnd) {
                    // Last segment ends at target center
                    endX = point.x;
                    endY = point.y;
                } else {
                    endX = displayX;
                    endY = displayY;
                }

                const dx = endX - startX;
                const dy = endY - startY;
                const distance = Math.sqrt(dx * dx + dy * dy);
                const angle = Math.atan2(dy, dx) * 180 / Math.PI;

                Object.assign(line.style, {
                    position: 'absolute',
                    left: `${startX}px`,
                    top: `${startY}px`,
                    width: `${distance}px`,
                    height: '2px',
                    backgroundColor: 'rgba(0, 100, 255, 0.6)',
                    transformOrigin: '0 0',
                    transform: `rotate(${angle}deg)`,
                    zIndex: 990 + i
                });

                container.appendChild(line);

                // Add direction indicator for path segments
                if (!isEnd) {
                    const arrowSize = 6;
                    const arrowDist = distance * 0.6; // Position 60% along the line
                    const arrowX = startX + dx * 0.6 - arrowSize / 2;
                    const arrowY = startY + dy * 0.6 - arrowSize / 2;

                    const arrow = document.createElement('div');
                    arrow.className = 'pathfinder-node direction-arrow debug';

                    Object.assign(arrow.style, {
                        position: 'absolute',
                        left: `${arrowX}px`,
                        top: `${arrowY}px`,
                        width: `${arrowSize}px`,
                        height: `${arrowSize}px`,
                        borderRadius: '50%',
                        backgroundColor: 'rgba(255, 255, 255, 0.7)',
                        zIndex: 995 + i
                    });

                    container.appendChild(arrow);
                }
            }
        }

        // Visualize entity and collider at start and end
        this.visualizeEntityCollider(container, path[0], 'start', entityWidth, entityHeight, collider);
        if (path.length > 1) {
            this.visualizeEntityCollider(container, path[path.length - 1], 'end', entityWidth, entityHeight, collider);
        }
    }

    visualizeEntityCollider(container, point, nodeType, entityWidth, entityHeight, entityCollider) {
        if (!container || !point || !entityCollider) return;

        // Calculate entity position
        let entityX, entityY;

        if (nodeType === 'start') {
            // For start - use as is (already positioned at top-left)
            entityX = point.x;
            entityY = point.y;
        } else {
            // For end - position as if Myte were centered on this point
            entityX = point.x - (entityWidth / 2);
            entityY = point.y - (entityHeight / 2);
        }

        // Visualize entity bounding box
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

        // Add center dot
        const centerDot = document.createElement('div');
        centerDot.className = `pathfinder-node center-dot debug ${nodeType}-center`;

        let centerX, centerY;
        if (nodeType === 'start') {
            centerX = entityX + entityWidth / 2;
            centerY = entityY + entityHeight / 2;
        } else {
            centerX = point.x; // End point is already center
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

        // Calculate collider position
        const colliderLeft = entityX + entityCollider.offsetX;
        const colliderTop = entityY + entityCollider.offsetY;

        // Visualize collider
        const collider = document.createElement('div');
        collider.className = `pathfinder-node entity-collider debug ${nodeType}-collider`;

        Object.assign(collider.style, {
            position: 'absolute',
            left: `${colliderLeft}px`,
            top: `${colliderTop}px`,
            width: `${entityCollider.width}px`,
            height: `${entityCollider.height}px`,
            border: `1px solid ${nodeType === 'start' ? 'rgba(0, 255, 0, 0.8)' : 'rgba(255, 0, 0, 0.8)'}`,
            backgroundColor: `${nodeType === 'start' ? 'rgba(0, 255, 0, 0.2)' : 'rgba(255, 0, 0, 0.2)'}`,
            zIndex: 980
        });

        // Add visualization of upward movement collider for 'end' if moving upward
        if (nodeType === 'end' && point.y < container.clientHeight / 2) {
            const upwardCollider = document.createElement('div');
            upwardCollider.className = `pathfinder-node upward-collider debug ${nodeType}-upward-collider`;

            const upwardTop = entityY + entityCollider.offsetY * 0.9;
            const upwardHeight = entityCollider.height * 1.2;

            Object.assign(upwardCollider.style, {
                position: 'absolute',
                left: `${colliderLeft}px`,
                top: `${upwardTop}px`,
                width: `${entityCollider.width}px`,
                height: `${upwardHeight}px`,
                border: `1px dashed ${nodeType === 'start' ? 'rgba(0, 255, 0, 0.6)' : 'rgba(255, 0, 0, 0.6)'}`,
                backgroundColor: 'transparent',
                zIndex: 978
            });

            container.appendChild(upwardCollider);
        }

        // Add elements to container
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