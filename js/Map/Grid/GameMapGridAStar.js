// --- START OF MODIFIED FILE GameMapGridAStar.js ---

/**
 * Optimized A* Pathfinder implementation for efficient path planning with
 * entity dimension awareness and collision avoidance, focusing on the collider.
 */
class AStarPathfinder {
    constructor(gridSystem) {
        this.gridSystem = gridSystem;
        this.openSet = new BinaryHeap(node => node.f);

        // Directions - cardinal and ordinal (diagonals)
        this.cardinalDirections = [
            { x: 0, y: -1 },   // North
            { x: 1, y: 0 },    // East
            { x: 0, y: 1 },    // South
            { x: -1, y: 0 },   // West
        ];

        this.diagonalDirections = [
            { x: -1, y: -1 },  // Northwest
            { x: 1, y: -1 },   // Northeast
            { x: -1, y: 1 },   // Southwest
            { x: 1, y: 1 }     // Southeast
        ];

        // Options with performance-optimized defaults
        this.options = {
            allowDiagonals: true,
            allowDiagonalCutting: true,  // Allows cutting corners
            heuristicWeight: 1.1,
            maxSearchSteps: 3000,
            smoothPaths: true,
            // pathPaddingFactor: 0.0, // Removed - handled by direct collider checks
            debug: false,
            useDirectPathFallback: true,
            preferPaths: true,
            avoidDifficultTerrain: true,

            // Smoothing related options
            maxSmoothingDistance: 1,


            // Movement normalization
            normalizeSmallMovements: true,
            minSegmentLength: 1.5, // In grid cells

            // End point handling
            strictEndPointValidation: true, // (Note: validation happens, but this flag isn't explicitly branched on)
            // endPointClearance: 0.8, // Removed - handled by direct collider checks
        };

        // Terrain type categories
        this.terrainCategories = {
            WATER: ['shallow_water', 'deep_water'],
            PREFERRED_PATHS: ['path'],
            DIFFICULT_TERRAIN: ['mountains', 'swamp', 'mud']
        };

        // Debug elements - only populated when debug is enabled
        this.debugElements = {
            exploredNodes: new Set(),
            rejectedNodes: new Set(),
            path: []
        };

        // Position validation cache
        this.validationCache = new LRUCache(200);
    }

    /**
     * Get unique key for grid coordinates
     * @param {number} x - Grid x coordinate
     * @param {number} y - Grid y coordinate
     * @returns {string} Unique string key
     */
    getKey(x, y) {
        return `${x},${y}`;
    }

    /**
     * Get terrain type at the specified grid position
     * @param {number} gridX - Grid x coordinate
     * @param {number} gridY - Grid y coordinate
     * @returns {string} Terrain type
     */
    getTerrainTypeAt(gridX, gridY) {
        if (gridX < 0 || gridX >= this.gridSystem.gridWidth ||
            gridY < 0 || gridY >= this.gridSystem.gridHeight) {
            return 'default';  // Default for out of bounds
        }

        // Ensure grid and cell exist before accessing terrainType
        const gridRow = this.gridSystem.grid[gridX];
        if (gridRow && gridRow[gridY]) {
            return gridRow[gridY].terrainType || 'default';
        }
        return 'default'; // Default if cell doesn't exist for some reason
    }

    /**
     * Find path from start entity center to end entity center.
     * Path points represent where the entity's *center* should be.
     * Validation ensures the entity's *collider* fits at each step.
     * @param {number} startCenterX - Start X coordinate of entity center
     * @param {number} startCenterY - Start Y coordinate of entity center
     * @param {number} endCenterX - End X coordinate of entity center
     * @param {number} endCenterY - End Y coordinate of entity center
     * @param {Object} options - Pathfinding options including entity dimensions and capabilities
     * @returns {Array|null} Array of path points {x, y} (entity center positions) or null if no path found
     */
    findPath(startCenterX, startCenterY, endCenterX, endCenterY, options = {}) {
        const startTime = performance.now();

        // --- Entity Properties ---
        const entityWidth = options.width || 0;
        const entityHeight = options.height || 0;
        // Collider is relative to entity top-left
        const collider = options.collider ? {
            offsetX: options.collider.offsetX || 0,
            offsetY: options.collider.offsetY || 0,
            width: options.collider.width || entityWidth,
            height: options.collider.height || entityHeight,
        } : { // Default collider if none provided
            offsetX: 0,
            offsetY: 0,
            width: entityWidth,
            height: entityHeight
        };
        const entityCapabilities = options.capabilities || {};

        // Store the original target center positions
        const originalEndX = endCenterX;
        const originalEndY = endCenterY;

        // --- Calculate Top-Left Positions ---
        // Start position (top-left) based on the provided center
        const startEntityX = startCenterX - (entityWidth / 2);
        const startEntityY = startCenterY - (entityHeight / 2);

        // End position (top-left) where the entity would be if centered on the target
        const endEntityX = endCenterX - (entityWidth / 2);
        const endEntityY = endCenterY - (entityHeight / 2);

        if (this.options.debug) {
            console.log(`Finding path for entity (${entityWidth}x${entityHeight}, collider: ${collider.width}x${collider.height} @ ${collider.offsetX},${collider.offsetY})`);
            console.log(`From center (${startCenterX.toFixed(0)},${startCenterY.toFixed(0)}) to center (${endCenterX.toFixed(0)},${endCenterY.toFixed(0)})`);
            console.log(`=> Start TL (${startEntityX.toFixed(0)},${startEntityY.toFixed(0)}), End TL (${endEntityX.toFixed(0)},${endEntityY.toFixed(0)})`);
        }

        // Clear debug data
        if (this.options.debug) {
            this.debugElements.exploredNodes.clear();
            this.debugElements.rejectedNodes.clear();
            this.debugElements.path = [];
        }

        // --- OPTIMIZATION: Fast direct path check ---
        const dx = endCenterX - startCenterX;
        const dy = endCenterY - startCenterY;
        const directDistance = Math.sqrt(dx * dx + dy * dy);
        const cellSize = this.gridSystem.config.cellSize;

        // Check if end position is valid *before* potentially taking a direct path
        if (!this._validatePosition(endEntityX, endEntityY, entityWidth, entityHeight, collider, entityCapabilities)) {
             if (this.options.debug) {
                console.warn(`Target end position (${endCenterX.toFixed(0)}, ${endCenterY.toFixed(0)}) is invalid for the collider.`);
            }
            // Maybe try finding a nearby valid end point? For now, fail fast.
            return null;
        }

        if (directDistance < cellSize * 1.5) { // Use a smaller threshold for direct path
            // Already validated end position above. Now check line of sight.
            if (this._hasLineOfSight(
                { x: startCenterX, y: startCenterY }, // Check from center to center
                { x: endCenterX, y: endCenterY },
                entityWidth, entityHeight,
                collider, entityCapabilities
            )) {
                if (this.options.debug) {
                    console.log(`Using direct path - distance: ${directDistance.toFixed(0)}px`);
                }
                // Return path representing center points
                return [
                    { x: startCenterX, y: startCenterY },
                    { x: endCenterX, y: endCenterY }
                ];
            } else if (this.options.debug) {
                 console.log(`Direct path (${directDistance.toFixed(0)}px) blocked, proceeding with A*.`);
            }
        }

        // --- A* Setup ---
        // Convert entity *top-left* positions to grid coordinates for the search start/end nodes
        const startGrid = this.gridSystem.worldToGrid(startEntityX, startEntityY);
        const endGrid = this.gridSystem.worldToGrid(endEntityX, endEntityY);

        // Safety check for identical start and end grid cells
        if (startGrid.x === endGrid.x && startGrid.y === endGrid.y) {
            // We already validated the end position is okay
             if (this.options.debug) {
                console.log("Start and end grid positions are the same and valid.");
             }
            return [
                 { x: startCenterX, y: startCenterY },
                 { x: endCenterX, y: endCenterY }
             ];
        }

        // --- Validate Start Position ---
        // Check if the entity's collider fits at the starting top-left position
        if (!this._validatePosition(startEntityX, startEntityY, entityWidth, entityHeight, collider, entityCapabilities)) {
            if (this.options.debug) {
                console.warn(`Entity collider cannot fit at start position TL (${startEntityX.toFixed(0)}, ${startEntityY.toFixed(0)}), corresponding to grid (${startGrid.x}, ${startGrid.y})`);
            }
            // Attempt to find a nearby valid starting grid cell
            const validStartGrid = this._findNearestValidGridPos(startGrid.x, startGrid.y, 5, entityWidth, entityHeight, collider, entityCapabilities);
            if (!validStartGrid) {
                 console.error("No valid start position found near the initial one.");
                 return null;
            }
             if (this.options.debug) {
                 console.log(`Adjusted start grid position to (${validStartGrid.x}, ${validStartGrid.y})`);
             }
             startGrid.x = validStartGrid.x;
             startGrid.y = validStartGrid.y;
             // Note: We don't adjust startCenterX/Y here, the path reconstruction handles the originals.
             // The path will start from the original center, but the *search* starts from the adjusted valid grid cell.
        }

        // We already validated the end position's corresponding top-left (endEntityX, endEntityY) earlier.

        // --- Initialize A* Data Structures ---
        this.openSet.clear();
        const closedSet = new Set();
        const cameFrom = new Map();
        const gScore = new Map();
        const fScore = new Map();

        const startKey = this.getKey(startGrid.x, startGrid.y);
        const endKey = this.getKey(endGrid.x, endGrid.y);

        gScore.set(startKey, 0);
        fScore.set(startKey, this._heuristic(startGrid.x, startGrid.y, endGrid.x, endGrid.y));

        this.openSet.push({
            x: startGrid.x,
            y: startGrid.y,
            f: fScore.get(startKey),
            key: startKey
        });

        let steps = 0;
        const timeoutMs = 250; // Keep timeout

        // --- Main A* Search Loop ---
        while (!this.openSet.isEmpty()) {
            steps++;

            // Check for timeout
            if (performance.now() - startTime > timeoutMs) {
                console.warn(`Pathfinding timeout after ${steps} steps (${timeoutMs}ms)`);
                // Try partial path (optional, can be complex to get right with colliders)
                // const partialTarget = this._findBestPartialTarget(endGrid.x, endGrid.y, closedSet, cameFrom); // Find closest *grid* point reached
                // if (partialTarget) { ... reconstruct partial path ... }
                return null; // Fail on timeout for now
            }

            // Check for maximum steps
            if (steps > this.options.maxSearchSteps) {
                if (this.options.debug) {
                    console.warn(`Exceeded max search steps (${this.options.maxSearchSteps})`);
                }
                return null;
            }

            const current = this.openSet.pop(); // current represents a grid cell {x, y, f, key}

            if (this.options.debug) {
                this.debugElements.exploredNodes.add(current.key);
            }

            // Check if we've reached the goal grid cell
            if (current.key === endKey) {
                if (this.options.debug) {
                    console.log(`Path found in ${steps} steps (${(performance.now() - startTime).toFixed(2)}ms)`);
                }
                // Reconstruct path using original start/end centers
                const path = this._reconstructPath(
                    cameFrom, current, // current is the goal grid node
                    startGrid, endGrid, // Start/end grid nodes for reference
                    startCenterX, startCenterY, // Original start center
                    originalEndX, originalEndY, // Original target center
                    entityWidth, entityHeight,
                    collider,
                    entityCapabilities
                );
                return path;
            }

            closedSet.add(current.key);

            // Get neighbors (neighbor grid cells)
            const neighbors = this._getNeighbors(
                current.x, current.y,
                entityWidth, entityHeight,
                collider, entityCapabilities
                // Removed isPathingUpward option
            );

            for (const neighbor of neighbors) { // neighbor is {x, y, terrainType}
                const neighborKey = this.getKey(neighbor.x, neighbor.y);

                if (closedSet.has(neighborKey)) continue;

                const tentativeG = gScore.get(current.key) + this._getMovementCost(current, neighbor, entityCapabilities);

                if (!gScore.has(neighborKey) || tentativeG < gScore.get(neighborKey)) {
                    cameFrom.set(neighborKey, current); // Link neighbor grid cell back to current grid cell
                    gScore.set(neighborKey, tentativeG);
                    const h = this._heuristic(neighbor.x, neighbor.y, endGrid.x, endGrid.y);
                    const f = tentativeG + (h * this.options.heuristicWeight);
                    fScore.set(neighborKey, f);

                    const neighborNode = {
                        x: neighbor.x,
                        y: neighbor.y,
                        f: f,
                        key: neighborKey
                    };

                    // Update or add to open set
                    if (!this.openSet.contains(neighborKey)) {
                        this.openSet.push(neighborNode);
                    } else {
                        // If already in openSet, update its position if this path is better
                        // (BinaryHeap doesn't have a direct update, common practice is to just push
                        // the better node and let the older one get ignored when popped later,
                        // or implement a decrease-key operation if performance critical)
                        // For simplicity, we'll rely on the check `tentativeG < gScore.get(neighborKey)`
                        // to prevent adding worse paths, and BinaryHeap handles duplicates okay.
                        // A more robust heap would allow updates. Let's try pushing again if better.
                        this.openSet.push(neighborNode); // Push potentially duplicate but better node
                    }
                }
            }
        }

        if (this.options.debug) {
            console.warn(`No path found after ${steps} steps (${(performance.now() - startTime).toFixed(2)}ms)`);
        }

        return null; // No path found
    }


    /**
     * Check if entity collider has adequate clearance around a grid point.
     * NOTE: This is NO LONGER USED for path validity checks (neighbor selection).
     * It might be useful for AI decision-making or path quality scoring if needed.
     * @private
     */
    _hasAdequateClearance(gridX, gridY, entityWidth, entityHeight, collider, direction) {
        // This function is kept for potential future use but is not currently called
        // by the core pathfinding logic (_getNeighbors, _validatePosition).
        // Its original logic might have been too restrictive.
        const cellSize = this.gridSystem.config.cellSize;
        const colliderWidth = collider ? collider.width : entityWidth;
        const colliderHeight = collider ? collider.height : entityHeight;

        // Example: Require at least half a cell clear around the collider center grid cell
        const requiredClearance = 1; // Check 1 cell radius around the grid cell

        for (let dx = -requiredClearance; dx <= requiredClearance; dx++) {
            for (let dy = -requiredClearance; dy <= requiredClearance; dy++) {
                if (dx === 0 && dy === 0) continue;

                const checkX = gridX + dx;
                const checkY = gridY + dy;

                // Check bounds first
                 if (checkX < 0 || checkX >= this.gridSystem.gridWidth ||
                    checkY < 0 || checkY >= this.gridSystem.gridHeight) {
                    // Hitting edge of map is like hitting a wall
                    return false;
                }

                // Check if the *neighboring* cell itself is non-walkable
                 const cell = this.gridSystem.grid[checkX]?.[checkY];
                if (!cell || !cell.walkable) {
                     // If any adjacent cell is unwalkable, consider clearance inadequate
                     // This is a very simple check; a more complex one could check distance.
                    return false;
                }
            }
        }
        return true; // All adjacent cells are walkable
    }


    /**
     * Renders the path visually for debugging purposes
     * @param {HTMLElement} container - The container to render visuals in
     * @param {Array} path - The path (array of {x, y} entity *center* points)
     * @param {number} entityWidth - Width of the entity
     * @param {number} entityHeight - Height of the entity
     * @param {Object} collider - Entity's collider object
     */
     visualizePath(container, path, entityWidth, entityHeight, collider) {
        if (!container || !path || path.length === 0 || !this.options.debug) return;

        // Clear existing visualizations
        const existingNodes = container.querySelectorAll('.pathfinder-node');
        existingNodes.forEach(node => node.remove());

        const nodeSize = 6; // Smaller default size
        const endNodeSize = 10;

        // Visualize path segments (lines between entity centers)
        for (let i = 0; i < path.length - 1; i++) {
            const startPoint = path[i]; // Entity center
            const endPoint = path[i + 1]; // Next entity center

            const line = document.createElement('div');
            line.className = 'pathfinder-node path-line debug';

            const dx = endPoint.x - startPoint.x;
            const dy = endPoint.y - startPoint.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx) * 180 / Math.PI;

            Object.assign(line.style, {
                position: 'absolute',
                left: `${startPoint.x}px`,
                top: `${startPoint.y}px`,
                width: `${distance}px`,
                height: '2px',
                backgroundColor: 'rgba(0, 100, 255, 0.6)',
                transformOrigin: '0 0',
                transform: `rotate(${angle}deg)`,
                zIndex: 990 + i
            });
            container.appendChild(line);

             // Add waypoint dots (centers)
             const waypointNode = document.createElement('div');
             waypointNode.className = `pathfinder-node waypoint-node debug`;
             Object.assign(waypointNode.style, {
                 left: `${startPoint.x - nodeSize / 2}px`,
                 top: `${startPoint.y - nodeSize / 2}px`,
                 width: `${nodeSize}px`,
                 height: `${nodeSize}px`,
                 position: 'absolute',
                 borderRadius: '50%',
                 backgroundColor: 'rgba(0, 100, 255, 0.8)',
                 zIndex: 1000 + i
             });
             container.appendChild(waypointNode);
        }

         // Add final waypoint dot
         if (path.length > 0) {
             const endPoint = path[path.length - 1];
             const endNode = document.createElement('div');
             endNode.className = `pathfinder-node end-node debug`;
             Object.assign(endNode.style, {
                 left: `${endPoint.x - endNodeSize / 2}px`,
                 top: `${endPoint.y - endNodeSize / 2}px`,
                 width: `${endNodeSize}px`,
                 height: `${endNodeSize}px`,
                 position: 'absolute',
                 borderRadius: '50%',
                 backgroundColor: 'rgba(255, 0, 0, 0.8)',
                 zIndex: 1000 + path.length
             });
             container.appendChild(endNode);
         }


        // Visualize entity and collider at START
        if (path.length > 0) {
            this._visualizeEntityColliderAtCenter(container, path[0], 'start', entityWidth, entityHeight, collider);
        }
        // Visualize entity and collider at END
        if (path.length > 0) { // Use last point if exists
            this._visualizeEntityColliderAtCenter(container, path[path.length - 1], 'end', entityWidth, entityHeight, collider);
        }
    }


    /**
     * Set debug mode on/off
     * @param {boolean} enabled - Whether to enable debug mode
     */
    setDebugMode(enabled) {
        this.options.debug = enabled;
        // Clear cache if debug mode changes, as behavior might differ
        this.validationCache.clear();
    }

    /**
     * Clean up any resources used by the pathfinder
     */
    dispose() {
        this.openSet.clear();
        if (this.debugElements) { // Check if already disposed
            this.debugElements.exploredNodes.clear();
            this.debugElements.rejectedNodes.clear();
            this.debugElements.path = [];
        }
        this.validationCache.clear();
        this.gridSystem = null;
        this.debugElements = null; // Prevent further use
    }

    // --------------------------------
    // Private helper methods
    // --------------------------------

    /**
     * Find best partial target (closest reached node to end grid) - Not fully implemented for path reconstruction
     * @private
     */
    _findBestPartialTarget(endGridX, endGridY, closedSet, cameFrom) {
        let bestNode = null;
        let bestScore = Infinity;

        for (const key of closedSet) {
            // cameFrom check ensures it's a reachable node from start
            if (!cameFrom.has(key)) continue;

            const [x, y] = key.split(',').map(Number);
            const distance = this._heuristic(x, y, endGridX, endGridY); // Use heuristic as distance metric

            if (distance < bestScore) {
                bestScore = distance;
                // Retrieve the node data from cameFrom's *value* if needed, or just use coords
                 // We need the actual node data stored in cameFrom map values to reconstruct
                 // Let's assume cameFrom stores {x, y, key} of the node *it came from*.
                 // This implementation needs adjustment based on how cameFrom is populated.
                 // For now, just return the grid coords.
                bestNode = { x, y, key };
            }
        }
        if(this.options.debug && bestNode) {
            console.log(`Timeout: Best partial target found at grid (${bestNode.x}, ${bestNode.y}), score ${bestScore.toFixed(1)}`);
        }
        return bestNode;
    }

    /**
     * Find nearest valid grid position for placing the entity's top-left corner.
     * @private
     */
    _findNearestValidGridPos(gridX, gridY, maxRadius, entityWidth, entityHeight, collider, entityCapabilities) {
        // Convert grid coords to world top-left to check validity
        const worldX = gridX * this.gridSystem.config.cellSize;
        const worldY = gridY * this.gridSystem.config.cellSize;

        // First check the original position
        if (this._validatePosition(worldX, worldY, entityWidth, entityHeight, collider, entityCapabilities)) {
            return { x: gridX, y: gridY };
        }

        maxRadius = Math.min(maxRadius, 8); // Increased radius slightly, but keep capped

        // Check cardinal directions first (radius 1)
        for (const dir of this.cardinalDirections) {
            const nx = gridX + dir.x;
            const ny = gridY + dir.y;
            const nWorldX = nx * this.gridSystem.config.cellSize;
            const nWorldY = ny * this.gridSystem.config.cellSize;
            if (this._validatePosition(nWorldX, nWorldY, entityWidth, entityHeight, collider, entityCapabilities)) {
                return { x: nx, y: ny };
            }
        }
         // Then check diagonals (radius 1)
         for (const dir of this.diagonalDirections) {
            const nx = gridX + dir.x;
            const ny = gridY + dir.y;
            const nWorldX = nx * this.gridSystem.config.cellSize;
            const nWorldY = ny * this.gridSystem.config.cellSize;
            if (this._validatePosition(nWorldX, nWorldY, entityWidth, entityHeight, collider, entityCapabilities)) {
                return { x: nx, y: ny };
            }
        }


        // Expand search in growing rings
        for (let radius = 2; radius <= maxRadius; radius++) {
            for (let dx = -radius; dx <= radius; dx++) {
                for (let dy = -radius; dy <= radius; dy++) {
                    // Only check the perimeter of the ring
                    if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) {
                        continue;
                    }

                    const nx = gridX + dx;
                    const ny = gridY + dy;
                    const nWorldX = nx * this.gridSystem.config.cellSize;
                    const nWorldY = ny * this.gridSystem.config.cellSize;

                    // Check bounds before validation call for slight optimization
                    if (nx < 0 || nx >= this.gridSystem.gridWidth || ny < 0 || ny >= this.gridSystem.gridHeight) {
                        continue;
                    }

                    if (this._validatePosition(nWorldX, nWorldY, entityWidth, entityHeight, collider, entityCapabilities)) {
                        return { x: nx, y: ny };
                    }
                }
            }
        }

        return null; // No valid position found within radius
    }

    /** Check terrain traversability */
    _canTraverseTerrain(terrainType, entityCapabilities) {
        if (this._isTerrainInCategory(terrainType, 'WATER')) {
            return !!entityCapabilities.can_swim; // Use !! for explicit boolean conversion
        }
        // Assume other terrains are fundamentally traversable, cost handled elsewhere
        return true;
    }

    /** Check if terrain type is in category */
    _isTerrainInCategory(terrainType, category) {
        return this.terrainCategories[category]?.includes(terrainType) || false;
    }

    /**
     * Check if entity *collider* can fit if the entity's *top-left* is at the specified grid position.
     * Refactored to primarily use _validatePosition.
     * @private
     */
    _canEntityFitAt(gridX, gridY, entityWidth, entityHeight, collider, entityCapabilities) {
        // Basic boundary check
        if (gridX < 0 || gridX >= this.gridSystem.gridWidth ||
            gridY < 0 || gridY >= this.gridSystem.gridHeight) {
            return false;
        }

         // Quick check for base walkability of the target grid cell itself
         // This helps prune early if the target cell is inherently blocked,
         // though _validatePosition will perform the thorough check.
         const cell = this.gridSystem.grid[gridX]?.[gridY];
         if (!cell || !cell.walkable) {
             return false;
         }

        // Convert grid coordinates to the entity's potential top-left world position
        const entityWorldX = gridX * this.gridSystem.config.cellSize;
        const entityWorldY = gridY * this.gridSystem.config.cellSize;

        // Use the main validation function which handles caching and detailed checks
        return this._validatePosition(entityWorldX, entityWorldY, entityWidth, entityHeight, collider, entityCapabilities);
    }

    /**
     * Validate if the entity's *collider* avoids collisions when the entity's *top-left* is at (entityX, entityY).
     * Checks against grid unwalkable tiles and potential world colliders.
     * This is the core collision check.
     * @private
     */
    _validatePosition(entityX, entityY, entityWidth, entityHeight, collider, entityCapabilities) {
        // Use collider dimensions, fallback to entity if needed (though constructor ensures collider exists)
        const colWidth = collider.width;
        const colHeight = collider.height;
        if (!colWidth || !colHeight) {
            return true; // No dimensions to check collision for
        }

        // Calculate the collider's absolute world bounds
        const colliderX = entityX + collider.offsetX;
        const colliderY = entityY + collider.offsetY;
        const colliderRight = colliderX + colWidth;
        const colliderBottom = colliderY + colHeight;

        // --- Caching ---
        // Key based on collider position and size for better caching
        const cacheKey = `validate_${Math.round(colliderX)}_${Math.round(colliderY)}_${colWidth}x${colHeight}`;
        const cached = this.validationCache.get(cacheKey);
        if (cached !== undefined) {
            return cached;
        }

        // --- Grid Collision Check ---
        const cellSize = this.gridSystem.config.cellSize;
        // Determine the range of grid cells the collider overlaps
        // Use floor for start, ceil for end ensures covering all partial overlaps
        const startGridX = Math.floor(colliderX / cellSize);
        const startGridY = Math.floor(colliderY / cellSize);
        const endGridX = Math.ceil(colliderRight / cellSize); // Use ceil for end boundary
        const endGridY = Math.ceil(colliderBottom / cellSize); // Use ceil for end boundary

        // Check all potentially overlapping grid cells
        for (let gridX = startGridX; gridX < endGridX; gridX++) {
            for (let gridY = startGridY; gridY < endGridY; gridY++) {
                // Check grid bounds
                if (gridX < 0 || gridX >= this.gridSystem.gridWidth ||
                    gridY < 0 || gridY >= this.gridSystem.gridHeight) {
                    this.validationCache.set(cacheKey, false);
                    return false; // Collider is overlapping out-of-bounds area
                }

                const cell = this.gridSystem.grid[gridX]?.[gridY]; // Safety check with optional chaining

                // Check for non-walkable grid tile collision
                if (!cell || !cell.walkable) {
                    // Check for actual overlap (since collider might just touch the edge of the cell range)
                    const cellWorldX = gridX * cellSize;
                    const cellWorldY = gridY * cellSize;
                    const cellWorldRight = cellWorldX + cellSize;
                    const cellWorldBottom = cellWorldY + cellSize;

                    // Standard AABB overlap check
                    if (colliderX < cellWorldRight && colliderRight > cellWorldX &&
                        colliderY < cellWorldBottom && colliderBottom > cellWorldY) {
                            this.validationCache.set(cacheKey, false);
                            return false; // Collider overlaps a non-walkable grid cell
                    }
                }

                 // Check for doors if entity can't open them (if door info is on cell)
                 if (cell && cell.hasDoor && entityCapabilities && !entityCapabilities.can_open_doors) {
                     // Check for overlap with door cell
                     const cellWorldX = gridX * cellSize;
                     const cellWorldY = gridY * cellSize;
                     const cellWorldRight = cellWorldX + cellSize;
                     const cellWorldBottom = cellWorldY + cellSize;
                    if (colliderX < cellWorldRight && colliderRight > cellWorldX &&
                        colliderY < cellWorldBottom && colliderBottom > cellWorldY) {
                            this.validationCache.set(cacheKey, false);
                            return false; // Collider overlaps a door cell and cannot open doors
                    }
                 }

                 // Check terrain compatibility (e.g., swimming) for this specific cell
                 const terrainType = this.getTerrainTypeAt(gridX, gridY);
                 if (!this._canTraverseTerrain(terrainType, entityCapabilities)) {
                      // Check for overlap with this specific terrain cell
                     const cellWorldX = gridX * cellSize;
                     const cellWorldY = gridY * cellSize;
                     const cellWorldRight = cellWorldX + cellSize;
                     const cellWorldBottom = cellWorldY + cellSize;
                     if (colliderX < cellWorldRight && colliderRight > cellWorldX &&
                        colliderY < cellWorldBottom && colliderBottom > cellWorldY) {
                            this.validationCache.set(cacheKey, false);
                            return false; // Collider overlaps terrain it cannot traverse
                    }
                 }
            }
        }

        // --- World Collider Check ---
        // Create a temporary representation of the entity *at this position* for checking against world objects
        const testEntity = {
            posX: entityX, // Use the entity's top-left for the check origin
            posY: entityY,
            size: { width: entityWidth, height: entityHeight }, // Keep original size for context if needed
            collider: collider, // The actual collider to check
            // config: { walkable: true } // Assuming the entity itself is 'walkable' in checks
        };

        const potentialColliders = this.gridSystem.getPotentialColliders(testEntity); // Get objects near the entity's collider
        if (potentialColliders && potentialColliders.length > 0) {
            for (const objCollider of potentialColliders) {
                 // Ensure the potential collider itself is not walkable/passable
                 // Check objCollider.config or objCollider properties based on your system
                if (objCollider && objCollider.config && !objCollider.config.walkable) {
                     // Perform detailed collision check between the entity's collider and the object's collider
                    if (this._checkDetailedCollision(testEntity, objCollider)) {
                         this.validationCache.set(cacheKey, false);
                         return false; // Collision detected with a world object
                    }
                }
            }
        }

        // --- Removed Clearance Check ---
        // The _hasAdequateClearance check was removed from here as per requirements.

        // If all checks pass, the position is valid for the collider
        this.validationCache.set(cacheKey, true);
        return true;
    }


    /**
     * Check for detailed AABB collision between two entities based on their colliders.
     * @private
     */
    _checkDetailedCollision(entity1, entity2) {
        // Use defined colliders if available, otherwise fallback (though pathfinder ensures entity1 has one)
        const col1 = entity1.collider || { offsetX: 0, offsetY: 0, width: entity1.size.width, height: entity1.size.height };
        const col2 = entity2.collider || { offsetX: 0, offsetY: 0, width: entity2.size.width, height: entity2.size.height };

        // Calculate absolute world bounds for entity1's collider
        const e1Left = entity1.posX + col1.offsetX;
        const e1Top = entity1.posY + col1.offsetY;
        const e1Right = e1Left + col1.width;
        const e1Bottom = e1Top + col1.height;

        // Calculate absolute world bounds for entity2's collider
        const e2Left = entity2.posX + col2.offsetX;
        const e2Top = entity2.posY + col2.offsetY;
        const e2Right = e2Left + col2.width;
        const e2Bottom = e2Top + col2.height;

        // Standard AABB collision check (no buffer)
        const collision = (
            e1Left < e2Right &&
            e1Right > e2Left &&
            e1Top < e2Bottom &&
            e1Bottom > e2Top
        );

        return collision;
    }


    /**
     * Get valid neighboring grid cells for pathfinding, ensuring the collider fits.
     * @private
     */
    _getNeighbors(x, y, entityWidth, entityHeight, collider, entityCapabilities) {
        const neighbors = [];
        const directions = this.options.allowDiagonals ?
            [...this.cardinalDirections, ...this.diagonalDirections] :
            this.cardinalDirections;

        for (const dir of directions) {
            const newX = x + dir.x;
            const newY = y + dir.y;

            // --- Basic Grid Checks ---
            // Skip if out of bounds
            if (newX < 0 || newX >= this.gridSystem.gridWidth ||
                newY < 0 || newY >= this.gridSystem.gridHeight) {
                continue;
            }

            // Quick check for base walkability of the *target* cell itself.
            // _canEntityFitAt will do the full check, but this can prune early.
            const targetCell = this.gridSystem.grid[newX]?.[newY];
            if (!targetCell || !targetCell.walkable) {
                if (this.options.debug) {
                    this.debugElements.rejectedNodes.add(this.getKey(newX, newY));
                }
                continue;
            }

             // Check terrain traversability based on target cell's terrain
             const terrainType = this.getTerrainTypeAt(newX, newY);
             if (!this._canTraverseTerrain(terrainType, entityCapabilities)) {
                 if (this.options.debug) {
                     this.debugElements.rejectedNodes.add(this.getKey(newX, newY));
                 }
                 continue;
             }

            // --- Diagonal Movement Constraints (Corner Cutting) ---
            if (this.options.allowDiagonals && Math.abs(dir.x) === 1 && Math.abs(dir.y) === 1) {
                 if (!this.options.allowDiagonalCutting) {
                     // Check the two adjacent cardinal cells. If BOTH are blocked, cannot move diagonally.
                     const adjacentCell1 = this.gridSystem.grid[x]?.[newY];
                     const adjacentCell2 = this.gridSystem.grid[newX]?.[y];
                     if ((!adjacentCell1 || !adjacentCell1.walkable) && (!adjacentCell2 || !adjacentCell2.walkable)) {
                         if (this.options.debug) {
                             this.debugElements.rejectedNodes.add(this.getKey(newX, newY));
                         }
                         continue;
                     }
                 }
                 // If allowDiagonalCutting is true, we don't need the above check.
                 // The _canEntityFitAt check below will handle if the collider physically fits through the gap.
            }


            // --- Collider Fit Check ---
            // Check if the entity's *collider* can actually fit if the entity's *top-left* were at this new grid position.
            if (!this._canEntityFitAt(newX, newY, entityWidth, entityHeight, collider, entityCapabilities)) {
                if (this.options.debug) {
                    this.debugElements.rejectedNodes.add(this.getKey(newX, newY));
                }
                continue; // Collider doesn't fit
            }

            // --- Clearance Check Removed ---
            // The _hasAdequateClearance check is removed from here.

            // If all checks pass, add the neighbor
            neighbors.push({
                x: newX,
                y: newY,
                terrainType: terrainType // Pass terrain type for cost calculation
            });
        }

        return neighbors;
    }


    /** Calculate movement cost */
     _getMovementCost(fromNode, toNode, entityCapabilities) {
        const baseMoveCost = (fromNode.x !== toNode.x && fromNode.y !== toNode.y) ? Math.SQRT2 : 1.0;
        const terrainType = toNode.terrainType; // Already fetched in _getNeighbors

        const terrainCosts = {
            'path': 0.8, 'grass': 1.0, 'mud': 1.5, 'swamp': 2.0,
            'shallow_water': 1.8, 'deep_water': 2.5, 'mountains': 2.2,
            'default': 1.0
        };
        let terrainMultiplier = terrainCosts[terrainType] || terrainCosts['default'];

        // Capability adjustments
        if (this.options.preferPaths && this._isTerrainInCategory(terrainType, 'PREFERRED_PATHS') && entityCapabilities?.follows_paths) {
            terrainMultiplier *= 0.7;
        }
        if (this.options.avoidDifficultTerrain && this._isTerrainInCategory(terrainType, 'DIFFICULT_TERRAIN')) {
            terrainMultiplier *= 1.5;
        }
        // Water penalty is implicitly handled by _canTraverseTerrain check in _getNeighbors if can_swim is false.
        // If can_swim is true, the terrainCosts handle the difficulty.

        return baseMoveCost * terrainMultiplier;
    }


    /** A* heuristic (Diagonal Distance) */
    _heuristic(x1, y1, x2, y2) {
        const dx = Math.abs(x2 - x1);
        const dy = Math.abs(y2 - y1);
        const D = 1.0; // Cost of cardinal move
        const D2 = Math.SQRT2; // Cost of diagonal move
        // Octile distance
        return D * (dx + dy) + (D2 - 2 * D) * Math.min(dx, dy);
        // Alternative: return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy); // Similar result
    }

    /**
     * Check line of sight between two entity *center* points, considering the collider.
     * @private
     */
    _hasLineOfSight(startCenter, endCenter, entityWidth, entityHeight, collider, entityCapabilities) {
        const dx = endCenter.x - startCenter.x;
        const dy = endCenter.y - startCenter.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const cellSize = this.gridSystem.config.cellSize;

        // If distance is very small, assume LOS is clear (already checked endpoints)
        if (distance < cellSize * 0.5) return true;

        // Adaptive sampling based on distance and collider size
        const checksPerCell = 1.5; // Balance between accuracy and performance
        const numChecks = Math.max(2, Math.min(15, Math.ceil(distance / (cellSize / checksPerCell)))); // Increased max checks slightly

        // Check points along the line (from center to center)
        for (let i = 1; i < numChecks; i++) {
            const ratio = i / numChecks;
            const checkCenterX = startCenter.x + dx * ratio;
            const checkCenterY = startCenter.y + dy * ratio;

            // Calculate the corresponding entity top-left for this center position
            const entityX = checkCenterX - (entityWidth / 2);
            const entityY = checkCenterY - (entityHeight / 2);

            // Validate the collider at this position
            // Use the consistent _validatePosition check
            if (!this._validatePosition(
                entityX, entityY,
                entityWidth, entityHeight,
                collider, // Use the standard collider
                entityCapabilities
            )) {
                 if(this.options.debug) {
                     console.log(`LOS blocked at step ${i}/${numChecks} near center (${checkCenterX.toFixed(0)}, ${checkCenterY.toFixed(0)})`);
                 }
                return false; // Collision detected along the line
            }
        }

        // Check the end point itself one last time for safety (though should be pre-validated)
         const endEntityX = endCenter.x - (entityWidth / 2);
         const endEntityY = endCenter.y - (entityHeight / 2);
         if (!this._validatePosition(endEntityX, endEntityY, entityWidth, entityHeight, collider, entityCapabilities)) {
              if(this.options.debug) {
                  console.log(`LOS blocked at final end point.`);
              }
              return false;
         }

        return true; // No collisions found along the line
    }

     // Basic line of sight (not used by main logic anymore, but kept for potential utility)
    _basicLineOfSight(start, end) {
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
    _getDistance(pointA, pointB) {
        const dx = pointB.x - pointA.x;
        const dy = pointB.y - pointA.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    /**
     * Get angle between two points (in degrees)
     * @private
     */
    _getDirection(pointA, pointB) {
        const dx = pointB.x - pointA.x;
        const dy = pointB.y - pointA.y;

        // Calculate angle in degrees (0 = right, 90 = down, 180 = left, 270 = up)
        let angle = Math.atan2(dy, dx) * (180 / Math.PI);

        // Normalize to 0-360 range
        if (angle < 0) angle += 360;

        return angle;
    }

    /**
     * Get angle difference (in degrees)
     * @private
     */
    _getAngleDifference(angle1, angle2) {
        let diff = angle2 - angle1;

        // Normalize to [-180, 180]
        if (diff > 180) diff -= 360;
        if (diff < -180) diff += 360;

        return diff;
    }

    /**
     * Reconstruct the final path from A* result (grid nodes) to world center points.
     * @private
     */
    _reconstructPath(cameFrom, currentGridNode, startGrid, endGrid,
                     originalStartCenterX, originalStartCenterY,
                     originalEndCenterX, originalEndCenterY,
                     entityWidth, entityHeight, collider, entityCapabilities) {

        const gridPath = [];
        let tempNode = currentGridNode; // Starts at the end grid node found by A*

        // Trace back using cameFrom map to get sequence of grid nodes
        while (tempNode) {
            gridPath.unshift(tempNode); // Add {x, y, key} grid node to start of array
            const key = tempNode.key;
            tempNode = cameFrom.get(key); // Get the grid node this one came from
        }

         // --- Convert Grid Path to World Path (Entity Centers) ---
         const worldPath = [];
         const cellSize = this.gridSystem.config.cellSize;
         const halfCell = cellSize / 2;

         // Add the original starting center position
         worldPath.push({ x: originalStartCenterX, y: originalStartCenterY });

         // Convert intermediate grid nodes to world center positions
         // A* nodes represent the grid cell the *top-left* of the entity is in.
         // To get the center, we add half the entity size to the world coords of the grid cell's top-left.
         for (let i = 1; i < gridPath.length - 1; i++) { // Skip actual start/end grid nodes
             const gridNode = gridPath[i];
             const gridWorldX = gridNode.x * cellSize; // Grid cell top-left X
             const gridWorldY = gridNode.y * cellSize; // Grid cell top-left Y
             // Calculate entity center when its top-left is at gridWorldX, gridWorldY
             const centerX = gridWorldX + (entityWidth / 2);
             const centerY = gridWorldY + (entityHeight / 2);
             worldPath.push({ x: centerX, y: centerY });
         }

         // Add the original target end center position
         // Ensure there's at least one intermediate point or the start is different from end grid
         if (gridPath.length > 1 || (startGrid.x !== endGrid.x || startGrid.y !== endGrid.y)) {
             worldPath.push({ x: originalEndCenterX, y: originalEndCenterY });
         } else if (worldPath.length === 1 && (originalStartCenterX !== originalEndCenterX || originalStartCenterY !== originalEndCenterY)) {
             // Handle case where start/end grid are same, but world centers differ slightly
              worldPath.push({ x: originalEndCenterX, y: originalEndCenterY });
         }


        // Apply path processing
        let finalPath = worldPath;

        if (this.options.smoothPaths && finalPath.length > 2) { // Need at least 3 points to smooth
            finalPath = this._smoothPath(finalPath, entityWidth, entityHeight, collider, entityCapabilities);
        }

        if (this.options.normalizeSmallMovements && finalPath.length > 2) { // Need at least 3 points
            finalPath = this._normalizePathMovements(finalPath, entityWidth, entityHeight);
        }

        if (this.options.debug) {
            this.debugElements.path = [...finalPath];
        }

        // Final safety check: Ensure start/end points are exactly the requested ones
        if (finalPath.length > 0) {
            finalPath[0] = { x: originalStartCenterX, y: originalStartCenterY };
            if (finalPath.length > 1) {
                finalPath[finalPath.length - 1] = { x: originalEndCenterX, y: originalEndCenterY };
            }
        } else {
             // If somehow path became empty, return the start/end if they are the same valid point
             if (originalStartCenterX === originalEndCenterX && originalStartCenterY === originalEndCenterY) {
                 const startEntityX = originalStartCenterX - (entityWidth / 2);
                 const startEntityY = originalStartCenterY - (entityHeight / 2);
                 if (this._validatePosition(startEntityX, startEntityY, entityWidth, entityHeight, collider, entityCapabilities)) {
                     return [{ x: originalStartCenterX, y: originalStartCenterY }];
                 }
             }
             return null; // Should not happen normally
        }


        return finalPath;
    }

    /**
     * Optimize path by removing unnecessary waypoints using line-of-sight checks.
     * Operates on world center coordinates.
     * @private
     */
    _smoothPath(path, entityWidth, entityHeight, collider, entityCapabilities) {
        if (path.length <= 2) return path;

        const smoothed = [path[0]]; // Start with the first point (original start center)
        let currentIndex = 0;

        while (currentIndex < path.length - 1) {
            let furthestVisibleIndex = currentIndex + 1;

            // Look ahead up to maxSmoothingDistance or end of path
             const maxLookAheadIndex = Math.min(
                 currentIndex + 1 + this.options.maxSmoothingDistance, // +1 because we start check from currentIndex+2
                 path.length - 1 // Don't check beyond the last point
             );


            for (let i = currentIndex + 2; i <= maxLookAheadIndex; i++) {
                 // Check LOS from the last added point (smoothed[smoothed.length - 1])
                 // to the candidate point path[i]. Both are entity centers.
                if (this._hasLineOfSight(
                    smoothed[smoothed.length - 1], // Last confirmed point's center
                    path[i],                   // Candidate point's center
                    entityWidth, entityHeight,
                    collider, entityCapabilities
                )) {
                    // This point is visible, update the furthest visible index
                    furthestVisibleIndex = i;
                } else {
                    // Stop looking ahead as soon as LOS is blocked
                    break;
                }
            }

            // Add the furthest visible point found (or the next point if none further were visible)
             smoothed.push(path[furthestVisibleIndex]);
             // Continue searching from the point we just added
             currentIndex = furthestVisibleIndex;

             // Break if we just added the last point
             if (currentIndex >= path.length - 1) break;
        }

         // Ensure the very last point is always included if it wasn't the last one added
         // This should be guaranteed by the loop structure and check, but double-check.
         if (smoothed[smoothed.length-1] !== path[path.length-1]) {
              // This condition might occur if the last segment's LOS check failed somehow
              // or if smoothing stopped just before the end. Add the final point if needed.
              // However, the loop logic `currentIndex < path.length - 1` and adding `path[furthestVisibleIndex]`
              // should handle reaching the end correctly. Re-evaluate if issues arise.
              // console.warn("Path smoothing didn't reach the exact end point, adding manually.");
              // smoothed.push(path[path.length - 1]);
         }


        return smoothed;
    }


    /**
     * Normalize path by removing small segments or insignificant turns.
     * Operates on world center coordinates.
     * @private
     */
     _normalizePathMovements(path, entityWidth, entityHeight) {
        if (path.length <= 2) return path; // Need at least 3 points to normalize

        const normalized = [path[0]]; // Always keep the start point
        const minSegmentSq = Math.pow(this.options.minSegmentLength * this.gridSystem.config.cellSize, 2); // Use squared distance
        const significantAngle = 20; // Degrees threshold for a turn

        let lastAddedPoint = path[0]; // The last point added to the 'normalized' list
        let prevPoint = path[0];     // The point before the current one being evaluated

        for (let i = 1; i < path.length - 1; i++) { // Iterate through intermediate points
            const currentPoint = path[i];
            const nextPoint = path[i + 1];

            // Calculate squared distance from the last *added* point
            const dx = currentPoint.x - lastAddedPoint.x;
            const dy = currentPoint.y - lastAddedPoint.y;
            const distSq = dx * dx + dy * dy;

            // Calculate angle change at the current point
            const angle1 = this._getDirection(prevPoint, currentPoint);
            const angle2 = this._getDirection(currentPoint, nextPoint);
            const angleDiff = Math.abs(this._getAngleDifference(angle1, angle2));

            // Keep the current point if:
            // 1. It represents a significant turn OR
            // 2. The segment leading to it from the *last added point* is long enough
            if (angleDiff > significantAngle || distSq >= minSegmentSq) {
                normalized.push(currentPoint);
                lastAddedPoint = currentPoint; // Update the last point that was actually added
            }
            // else: Skip this point as it's too close or doesn't change direction enough

            prevPoint = currentPoint; // Update prevPoint for the next iteration's angle calculation
        }

        // Always add the last point of the original path
        normalized.push(path[path.length - 1]);

        // Optional: Final check to remove duplicates if start/end were very close
        if (normalized.length >= 2 &&
            normalized[normalized.length - 1].x === normalized[normalized.length - 2].x &&
            normalized[normalized.length - 1].y === normalized[normalized.length - 2].y) {
            normalized.pop();
        }


        return normalized;
    }


    /**
     * Visualize entity and collider centered at a specific world point.
     * @private
     */
    _visualizeEntityColliderAtCenter(container, centerPoint, nodeType, entityWidth, entityHeight, entityCollider) {
        if (!container || !centerPoint || !this.options.debug) return;

        // Calculate entity top-left based on its center being at centerPoint
        const entityX = centerPoint.x - entityWidth / 2;
        const entityY = centerPoint.y - entityHeight / 2;

        // --- Visualize Entity Bounding Box ---
        const entity = document.createElement('div');
        entity.className = `pathfinder-node entity-box debug ${nodeType}-entity`;
        Object.assign(entity.style, {
            position: 'absolute',
            left: `${entityX}px`, top: `${entityY}px`,
            width: `${entityWidth}px`, height: `${entityHeight}px`,
            border: `1px dashed ${nodeType === 'start' ? 'rgba(0, 255, 0, 0.5)' : 'rgba(255, 0, 0, 0.5)'}`,
            boxSizing: 'border-box', // Important for accurate border rendering
            zIndex: 979
        });
        container.appendChild(entity);

        // --- Visualize Center Dot ---
        // (This is redundant if waypoints are already drawn, but kept for clarity)
        // const centerDot = document.createElement('div');
        // centerDot.className = `pathfinder-node center-dot debug ${nodeType}-center`;
        // Object.assign(centerDot.style, {
        //     position: 'absolute',
        //     left: `${centerPoint.x - 2}px`, top: `${centerPoint.y - 2}px`,
        //     width: '4px', height: '4px',
        //     borderRadius: '50%',
        //     backgroundColor: nodeType === 'start' ? 'lime' : 'red',
        //     zIndex: 981
        // });
        // container.appendChild(centerDot);

        // --- Visualize Collider ---
        if (entityCollider) {
            const colliderLeft = entityX + entityCollider.offsetX;
            const colliderTop = entityY + entityCollider.offsetY;

            const colliderEl = document.createElement('div');
            colliderEl.className = `pathfinder-node entity-collider debug ${nodeType}-collider`;
            Object.assign(colliderEl.style, {
                position: 'absolute',
                left: `${colliderLeft}px`, top: `${colliderTop}px`,
                width: `${entityCollider.width}px`, height: `${entityCollider.height}px`,
                border: `1px solid ${nodeType === 'start' ? 'rgba(0, 255, 0, 0.8)' : 'rgba(255, 0, 0, 0.8)'}`,
                backgroundColor: `${nodeType === 'start' ? 'rgba(0, 255, 0, 0.2)' : 'rgba(255, 0, 0, 0.2)'}`,
                boxSizing: 'border-box', // Important for accurate border rendering
                zIndex: 980
            });
            container.appendChild(colliderEl);
        }
    }

} // End AStarPathfinder Class

/**
 * LRU Cache implementation
 */
class LRUCache {
    constructor(capacity) {
        this.capacity = capacity;
        this.cache = new Map();
    }

    get(key) {
        if (!this.cache.has(key)) return undefined;
        const value = this.cache.get(key);
        this.cache.delete(key);
        this.cache.set(key, value); // Move to end (most recently used)
        return value;
    }

    set(key, value) {
        if (this.cache.has(key)) {
            this.cache.delete(key);
        } else if (this.cache.size >= this.capacity) {
            // Evict least recently used (first key in map iteration)
            this.cache.delete(this.cache.keys().next().value);
        }
        this.cache.set(key, value);
    }

    clear() {
        this.cache.clear();
    }
}

/**
 * Binary heap implementation (Min-Heap)
 */
class BinaryHeap {
    constructor(scoreFunction) {
        this.content = [];
        this.scoreFunction = scoreFunction;
        // We don't strictly need nodeMap for basic A* if we allow duplicates,
        // but it's useful for contains check or potential decrease-key implementations.
        this.nodeMap = new Map(); // Optional: Map key to index for faster contains/update
    }

    push(element) {
        this.content.push(element);
        const index = this.content.length - 1;
        this.nodeMap.set(element.key, index); // Update map
        this.bubbleUp(index);
    }

    pop() {
        if (this.content.length === 0) return null; // Handle empty heap
        const result = this.content[0];
        this.nodeMap.delete(result.key); // Remove from map
        const end = this.content.pop();
        if (this.content.length > 0) {
            this.content[0] = end;
            this.nodeMap.set(end.key, 0); // Update map for the swapped element
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
            const parentN = Math.floor((n - 1) / 2); // Correct parent index calculation
            const parent = this.content[parentN];
            if (score >= this.scoreFunction(parent)) break;

            // Swap elements
            this.content[parentN] = element;
            this.content[n] = parent;
            // Update map
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
            const child1N = 2 * n + 1;
            const child2N = 2 * n + 2;
            let swapIndex = null;
            let minScore = score; // Keep track of the minimum score found so far

            if (child1N < length) {
                const child1 = this.content[child1N];
                const child1Score = this.scoreFunction(child1);
                if (child1Score < minScore) {
                    minScore = child1Score;
                    swapIndex = child1N;
                }
            }

            if (child2N < length) {
                const child2 = this.content[child2N];
                const child2Score = this.scoreFunction(child2);
                 // Important: check against minScore found so far (could be child1's score)
                if (child2Score < minScore) {
                    // minScore = child2Score; // No need to update minScore again here
                    swapIndex = child2N;
                }
            }

            if (swapIndex === null) break; // Element is in correct position

            // Swap elements
            const swapElement = this.content[swapIndex];
            this.content[n] = swapElement;
            this.content[swapIndex] = element;
            // Update map
            this.nodeMap.set(swapElement.key, n);
            this.nodeMap.set(element.key, swapIndex);

            n = swapIndex; // Continue sinking down from the new position
        }
    }
} // End BinaryHeap Class


// --- END OF MODIFIED FILE GameMapGridAStar.js ---