
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
            heuristicWeight: 1,
            maxSearchSteps: 8000,
            smoothPaths: true,
            debug: false,
            useDirectPathFallback: true,
            preferPaths: true,
            pathEdgePenaltyFactor: 0.3,
            avoidDifficultTerrain: true,
            allowEntityOutOfBounds: true,
            visualizeSearch: true,
            visualizeRejectedNodes: false,
            maxVisualizedNodes: 250,

            // Smoothing related options
            maxSmoothingDistance: 3,

            // Movement normalization
            normalizeSmallMovements: true,
            minSegmentLength: 1.5, // In grid cells

        };

        // Terrain type categories
        this.terrainCategories = {
            WATER: ['shallow_water', 'deep_water'],
            PREFERRED_PATHS: ['path'],
            DIFFICULT_TERRAIN: ['mountains', 'swamp', 'mud']
        };

        this.terrainCosts = {
            default: (typeof GridSystem !== 'undefined' ? GridSystem.defaultTerrainCost : 1.0),
            ...(typeof GridSystem !== 'undefined' ? GridSystem.terrainCosts : {})
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
     * Find path from start entity top-left to end entity center.
     * Path points represent where the entity's *center* should be.
     * Validation ensures the entity's *collider* fits at each step.
     * @param {number} startX - Start X coordinate of entity TOP-LEFT
     * @param {number} startY - Start Y coordinate of entity TOP-LEFT
     * @param {number} endCenterX - End X coordinate of entity CENTER
     * @param {number} endCenterY - End Y coordinate of entity CENTER
     * @param {Object} options - Pathfinding options including entity dimensions and capabilities
     * @returns {Array|null} Array of path points {x, y} (entity center positions) or null if no path found
     */
    findPath(entity, startX, startY, endCenterX, endCenterY, pathOptions = {}) {
        const startTime = performance.now();

        // --- Entity Properties ---
        const entityWidth = entity.size?.width || 0;
        const entityHeight = entity.size?.height || 0;
        const entityCollider = entity.collider || {};
        const collider = {
            offsetX: entityCollider.offsetX || 0,
            offsetY: entityCollider.offsetY || 0,
            width: entityCollider.width || entityWidth,
            height: entityCollider.height || entityHeight,
        };
        const entityCapabilities = entity.capabilities || {};

        const effectiveOptions = { ...this.options, ...pathOptions };
        const cellSize = this.gridSystem.config.cellSize;

        // --- Calculate Start Center from Input Top-Left ---
        const startCenterX = startX + (entityWidth / 2);
        const startCenterY = startY + (entityHeight / 2);

        // --- Store Original Target and Calculate Initial End TL ---
        const originalEndCenterX = endCenterX;
        const originalEndCenterY = endCenterY;
        let endEntityX = originalEndCenterX - (entityWidth / 2);
        let endEntityY = originalEndCenterY - (entityHeight / 2);

        // --- Initialize effective target variables ---
        // These will hold the coordinates we actually pathfind towards.
        let effectiveEndCenterX = originalEndCenterX;
        let effectiveEndCenterY = originalEndCenterY;
        let endGrid = this.gridSystem.worldToGrid(endEntityX, endEntityY); // Initial target grid

        if (effectiveOptions.debug) {
            console.log(`Finding path for entity (ID: ${entity.id || 'N/A'}, ${entityWidth}x${entityHeight}, collider: ${collider.width}x${collider.height} @ ${collider.offsetX},${collider.offsetY})`);
            console.log(`From TL (${startX.toFixed(0)},${startY.toFixed(0)}) [Center: (${startCenterX.toFixed(0)}, ${startCenterY.toFixed(0)})]`);
            console.log(`To Requested Center (${originalEndCenterX.toFixed(0)},${originalEndCenterY.toFixed(0)}) [TL: (${endEntityX.toFixed(0)}, ${endEntityY.toFixed(0)})]`);
        }

        // Clear debug data
        if (effectiveOptions.debug) {
            this.debugElements.exploredNodes.clear();
            this.debugElements.rejectedNodes.clear();
            this.debugElements.path = [];
        }

        // --- Validate End Position ---
        let isEndValid = this._validatePosition(entity, endEntityX, endEntityY, entityWidth, entityHeight, collider, entityCapabilities);

        // --- ADJUST TARGET IF INVALID ---
        if (!isEndValid) {
            if (effectiveOptions.debug) {
                console.warn(`Requested target position (Center ${originalEndCenterX.toFixed(0)}, ${originalEndCenterY.toFixed(0)} / TL ${endEntityX.toFixed(0)}, ${endEntityY.toFixed(0)}) is invalid. Attempting to find nearest valid spot.`);
            }
            // Use existing helper to find nearest valid grid coordinate for the entity's TL
            const searchRadius = 12; // How far to search (in grid cells)
            const validEndGrid = this._findNearestValidGridPos(
                entity,
                endGrid.x, // Start search from the original invalid grid pos
                endGrid.y,
                searchRadius,
                entityWidth,
                entityHeight,
                collider,
                entityCapabilities
            );

            if (!validEndGrid) {
                if (effectiveOptions.debug) {
                    console.error(`Could not find a valid alternative end position within ${searchRadius} cells of the original target.`);
                }
                return null; // Give up if no nearby valid spot found
            }

            // Update target grid and recalculate effective world center/TL
            endGrid = validEndGrid; // Use the new valid grid coordinates
            endEntityX = endGrid.x * cellSize; // TL X for the adjusted grid pos
            endEntityY = endGrid.y * cellSize; // TL Y for the adjusted grid pos
            effectiveEndCenterX = endEntityX + (entityWidth / 2); // Center X for the adjusted pos
            effectiveEndCenterY = endEntityY + (entityHeight / 2); // Center Y for the adjusted pos
            isEndValid = true; // Mark as valid now

            if (effectiveOptions.debug) {
                console.log(`Adjusted target to nearest valid grid: (${endGrid.x}, ${endGrid.y}). New Target Center: (${effectiveEndCenterX.toFixed(0)}, ${effectiveEndCenterY.toFixed(0)}), TL: (${endEntityX.toFixed(0)}, ${endEntityY.toFixed(0)})`);
            }
        }
        // --- END ADJUST TARGET ---

        // If even after adjustment (or initially) the end is invalid, return null.
        // This check is slightly redundant if _findNearestValidGridPos guarantees validity,
        // but acts as a safeguard.
        if (!isEndValid) {
            if (effectiveOptions.debug) { console.error(`End position remains invalid after adjustment attempt.`); }
            return null;
        }


        // --- OPTIMIZATION: Fast direct path check (use EFFECTIVE end point) ---
        const dx = effectiveEndCenterX - startCenterX;
        const dy = effectiveEndCenterY - startCenterY;
        const directDistance = Math.sqrt(dx * dx + dy * dy);

        if (directDistance < cellSize * 1.5) {
            // Check line of sight between start center and EFFECTIVE end center
            if (this._hasLineOfSight(entity,
                { x: startCenterX, y: startCenterY },
                { x: effectiveEndCenterX, y: effectiveEndCenterY }, // Use effective target
                entityWidth, entityHeight,
                collider, entityCapabilities
            )) {
                if (effectiveOptions.debug) { console.log(`Using direct path to effective target - distance: ${directDistance.toFixed(0)}px`); }
                // Return path to the potentially adjusted end point
                return [
                    { x: startCenterX, y: startCenterY },
                    { x: effectiveEndCenterX, y: effectiveEndCenterY } // Use effective target
                ];
            } else if (effectiveOptions.debug) { console.log(`Direct path (${directDistance.toFixed(0)}px) to effective target blocked, proceeding with A*.`); }
        }

        // --- A* Setup ---
        const startGrid = this.gridSystem.worldToGrid(startX, startY);
        // Note: endGrid is already potentially adjusted from the validation step above

        // Check if start and (potentially adjusted) end grid are the same
        if (startGrid.x === endGrid.x && startGrid.y === endGrid.y) {
            // Still need to validate the start position itself
            if (!this._validatePosition(entity, startX, startY, entityWidth, entityHeight, collider, entityCapabilities)) {
                if (effectiveOptions.debug) { console.warn(`Start and (adjusted) end grid positions are the same, but start TL (${startX}, ${startY}) is invalid.`); }
                return null;
            }
            if (effectiveOptions.debug) { console.log("Start and (adjusted) end grid positions are the same and valid."); }
            // Path goes from start center to the potentially adjusted end center
            return [{ x: startCenterX, y: startCenterY }, { x: effectiveEndCenterX, y: effectiveEndCenterY }];
        }

        // --- Validate Start Position (and adjust if necessary) ---
        if (!this._validatePosition(entity, startX, startY, entityWidth, entityHeight, collider, entityCapabilities)) {
            if (effectiveOptions.debug) { console.warn(`Entity collider cannot fit at input start TL (${startX.toFixed(0)}, ${startY.toFixed(0)})`); }
            const validStartGrid = this._findNearestValidGridPos(entity, startGrid.x, startGrid.y, 12, entityWidth, entityHeight, collider, entityCapabilities);
            if (!validStartGrid) {
                console.error("No valid start grid position found near the initial one.");
                return null;
            }
            if (effectiveOptions.debug) { console.log(`Adjusted start grid position to (${validStartGrid.x}, ${validStartGrid.y})`); }
            // IMPORTANT: If start is adjusted, we should ideally update startCenterX/Y as well,
            // but for simplicity, we'll keep the original start center and let the path correct itself.
            // A* will start from the adjusted grid.
            startGrid.x = validStartGrid.x;
            startGrid.y = validStartGrid.y;
            // TODO: Optionally recalculate startCenterX/Y based on adjusted startGrid for perfect start point.
            // const adjustedStartX = startGrid.x * cellSize;
            // const adjustedStartY = startGrid.y * cellSize;
            // startCenterX = adjustedStartX + entityWidth / 2;
            // startCenterY = adjustedStartY + entityHeight / 2;
        }

        // --- Initialize A* Data Structures ---
        this.openSet.clear();
        const closedSet = new Set();
        const cameFrom = new Map();
        const gScore = new Map();
        const fScore = new Map();

        const startKey = this.getKey(startGrid.x, startGrid.y); // Use potentially adjusted startGrid
        const endKey = this.getKey(endGrid.x, endGrid.y); // Use potentially adjusted endGrid

        gScore.set(startKey, 0);
        fScore.set(startKey, this._heuristic(startGrid.x, startGrid.y, endGrid.x, endGrid.y)); // Heuristic to adjusted end

        this.openSet.push({ x: startGrid.x, y: startGrid.y, f: fScore.get(startKey), key: startKey });

        let steps = 0;
        const timeoutMs = 500;

        // --- Main A* Search Loop ---
        while (!this.openSet.isEmpty()) {
            steps++;
            if (performance.now() - startTime > timeoutMs) {
                console.warn(`A* search timed out after ${timeoutMs}ms`);
                return null; // Timeout
            }
            if (steps > effectiveOptions.maxSearchSteps) {
                console.warn(`A* search exceeded max steps: ${effectiveOptions.maxSearchSteps}`);
                return null; // Max steps exceeded
            }

            const current = this.openSet.pop();

            if (effectiveOptions.debug) { this.debugElements.exploredNodes.add(current.key); }

            // Goal check against the potentially adjusted endKey
            if (current.key === endKey) {
                if (effectiveOptions.debug) { console.log(`Path found in ${steps} steps (${(performance.now() - startTime).toFixed(2)}ms)`); }
                // Pass the EFFECTIVE end center coordinates for path reconstruction
                const path = this._reconstructPath(
                    entity, cameFrom, current, startGrid, endGrid,
                    startCenterX, startCenterY, // Original start center
                    effectiveEndCenterX, effectiveEndCenterY, // Use potentially adjusted end center
                    entityWidth, entityHeight, collider, entityCapabilities,
                    effectiveOptions
                );
                return path;
            }

            closedSet.add(current.key);

            // Get neighbors based on current grid node
            const neighbors = this._getNeighbors(
                entity, current.x, current.y,
                entityWidth, entityHeight, collider, entityCapabilities,
                effectiveOptions
            );

            for (const neighbor of neighbors) {
                const neighborKey = this.getKey(neighbor.x, neighbor.y);
                if (closedSet.has(neighborKey)) continue;

                const moveCost = this._getMovementCost(current, neighbor, entityCapabilities, effectiveOptions);
                const tentativeG = (gScore.get(current.key) ?? Infinity) + moveCost; // Use Infinity default defensively

                if (!gScore.has(neighborKey) || tentativeG < (gScore.get(neighborKey) ?? Infinity)) {
                    cameFrom.set(neighborKey, current);
                    gScore.set(neighborKey, tentativeG);
                    // Heuristic uses the potentially adjusted endGrid
                    const h = this._heuristic(neighbor.x, neighbor.y, endGrid.x, endGrid.y);
                    const f = tentativeG + (h * effectiveOptions.heuristicWeight);
                    fScore.set(neighborKey, f);
                    // Check if node already in openSet to potentially update, otherwise add
                    // Note: BinaryHeap implementation might need an update method or handle duplicates
                    const neighborNode = { x: neighbor.x, y: neighbor.y, f: f, key: neighborKey };
                    // Simple push; heap handles positioning. If duplicates are undesirable, need heap update logic.
                    this.openSet.push(neighborNode);
                }
            }
        } // End A* loop

        if (effectiveOptions.debug) { console.warn(`No path found after ${steps} steps (${(performance.now() - startTime).toFixed(2)}ms)`); }
        return null; // No path found
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
        this.clearVisualization(container);
        if (!container || !this.options.debug) return;

        if (this.options.visualizeSearch) {
            this._visualizeSearchNodes(container, this.debugElements?.exploredNodes, {
                className: 'search-node',
                color: 'rgba(64, 156, 255, 0.22)',
                size: Math.max(4, this.gridSystem.config.cellSize * 0.3)
            });

            if (this.options.visualizeRejectedNodes) {
                this._visualizeSearchNodes(container, this.debugElements?.rejectedNodes, {
                    className: 'rejected-node',
                    color: 'rgba(255, 80, 80, 0.18)',
                    size: Math.max(3, this.gridSystem.config.cellSize * 0.22)
                });
            }
        }

        if (!path || path.length === 0) return;

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

    clearVisualization(container) {
        if (!container) return;
        const existingNodes = container.querySelectorAll('.pathfinder-node');
        existingNodes.forEach(node => node.remove());
    }

    setTerrainCosts(terrainCosts = {}) {
        this.terrainCosts = {
            ...this.terrainCosts,
            ...terrainCosts
        };
        this.validationCache.clear();
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
     * Find nearest valid grid position for placing the entity's top-left corner.
     * @private
     */
    _findNearestValidGridPos(entity, gridX, gridY, maxRadius, entityWidth, entityHeight, collider, entityCapabilities) {
        const worldX = gridX * this.gridSystem.config.cellSize;
        const worldY = gridY * this.gridSystem.config.cellSize;

        // Check original position - PASS ENTITY
        if (this._validatePosition(entity, worldX, worldY, entityWidth, entityHeight, collider, entityCapabilities)) {
            return { x: gridX, y: gridY };
        }

        maxRadius = Math.min(maxRadius, 8);

        // Check cardinal directions - PASS ENTITY
        for (const dir of this.cardinalDirections) {
            const nx = gridX + dir.x; const ny = gridY + dir.y;
            const nWorldX = nx * this.gridSystem.config.cellSize; const nWorldY = ny * this.gridSystem.config.cellSize;
            if (this._validatePosition(entity, nWorldX, nWorldY, entityWidth, entityHeight, collider, entityCapabilities)) {
                return { x: nx, y: ny };
            }
        }
        // Check diagonals - PASS ENTITY
        for (const dir of this.diagonalDirections) {
            const nx = gridX + dir.x; const ny = gridY + dir.y;
            const nWorldX = nx * this.gridSystem.config.cellSize; const nWorldY = ny * this.gridSystem.config.cellSize;
            if (this._validatePosition(entity, nWorldX, nWorldY, entityWidth, entityHeight, collider, entityCapabilities)) {
                return { x: nx, y: ny };
            }
        }

        // Expand search in rings - PASS ENTITY
        for (let radius = 2; radius <= maxRadius; radius++) {
            for (let dx = -radius; dx <= radius; dx++) {
                for (let dy = -radius; dy <= radius; dy++) {
                    if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
                    const nx = gridX + dx; const ny = gridY + dy;
                    const nWorldX = nx * this.gridSystem.config.cellSize; const nWorldY = ny * this.gridSystem.config.cellSize;
                    if (nx < 0 || nx >= this.gridSystem.gridWidth || ny < 0 || ny >= this.gridSystem.gridHeight) continue;
                    if (this._validatePosition(entity, nWorldX, nWorldY, entityWidth, entityHeight, collider, entityCapabilities)) {
                        return { x: nx, y: ny };
                    }
                }
            }
        }
        return null;
    }

    /** Check terrain traversability */
    _canTraverseTerrain(terrainType, entityCapabilities) {
        if (terrainType === 'deep_water') {
            return !!entityCapabilities.canSwim;
        }

        if (terrainType === 'shallow_water') {
            return !!entityCapabilities.canSwim || !!entityCapabilities.canWade;
        }

        return true;
    }

    /** Check if terrain type is in category */
    _isTerrainInCategory(terrainType, category) {
        return this.terrainCategories[category]?.includes(terrainType) || false;
    }

    _isOpenableObstacle(obj, entityCapabilities) {
        return !!(
            obj &&
            entityCapabilities?.canOpenDoors &&
            typeof obj.open === 'function' &&
            ['DOOR', 'GATE'].includes(obj.type)
        );
    }

    _canTraverseConditionalCell(cell, entityCapabilities) {
        if (!cell?.conditionallyWalkable) return false;

        switch (cell.conditionType) {
            case 'door':
            case 'gate':
                return !!entityCapabilities?.canOpenDoors;
            default:
                return false;
        }
    }

    _getCellBlockingObjects(cell, entityToExclude = null) {
        if (!cell?.objects?.size) return [];

        return Array.from(cell.objects).filter(obj =>
            obj &&
            obj !== entityToExclude &&
            obj.config &&
            !obj.config.walkable
        );
    }

    _getEntityTerrainCostMultiplier(terrainType, entityCapabilities = {}) {
        let multiplier = 1.0;

        const explicitMultipliers = entityCapabilities.terrainCostMultipliers;
        if (explicitMultipliers && explicitMultipliers[terrainType] !== undefined) {
            const numericValue = Number(explicitMultipliers[terrainType]);
            if (Number.isFinite(numericValue) && numericValue > 0) {
                multiplier *= numericValue;
            }
        }

        const likedTerrain = entityCapabilities.likedTerrain || [];
        if (likedTerrain.includes?.(terrainType)) {
            multiplier *= 0.75;
        }

        const dislikedTerrain = entityCapabilities.dislikedTerrain || [];
        if (dislikedTerrain.includes?.(terrainType)) {
            multiplier *= 1.35;
        }

        return multiplier;
    }

    /**
     * Check if entity *collider* can fit if the entity's *top-left* is at the specified grid position.
     * Refactored to primarily use _validatePosition.
     * @private
     */
    _canEntityFitAt(entity, gridX, gridY, entityWidth, entityHeight, collider, entityCapabilities) {
        // Calculate the world coordinates where the entity's top-left corner
        // would be if it were aligned with this grid cell.
        // These world coordinates CAN be negative or outside map pixel bounds.
        const entityWorldX = gridX * this.gridSystem.config.cellSize;
        const entityWorldY = gridY * this.gridSystem.config.cellSize;

        // Delegate the actual validation entirely to _validatePosition.
        // _validatePosition correctly calculates the collider's absolute world
        // position based on entityWorldX/Y and the collider offsets. It then
        // checks if THAT collider position is within map bounds [0, mapPixelWidth/Height)
        // and avoids all relevant obstacles (unwalkable tiles, world colliders).
        // Passing the entity object allows _validatePosition to use it for exclusion
        // checks in getPotentialCollidersForArea and potentially for caching keys.
        return this._validatePosition(
            entity,
            entityWorldX,
            entityWorldY,
            entityWidth,
            entityHeight,
            collider,
            entityCapabilities
        );
    }

    /**
     * Validate if the entity's *collider* avoids collisions when the entity's *top-left* is at (entityX, entityY).
     * Checks against grid unwalkable tiles and potential world colliders.
     * This is the core collision check.
     * @private
     */
    _validatePosition(entity, entityX, entityY, entityWidth, entityHeight, collider, entityCapabilities) {
        // --- Options ---
        const debug = this.options.debug;
        const allowEntityOB = this.options.allowEntityOutOfBounds ?? true; // Default to true

        // --- Optional Toggle Logic: Check Entity Bounds First if Required ---
        if (!allowEntityOB) {
            const mapPixelWidth = this.gridSystem.gridWidth * this.gridSystem.config.cellSize;
            const mapPixelHeight = this.gridSystem.gridHeight * this.gridSystem.config.cellSize;
            if (entityX < 0 || entityX + entityWidth > mapPixelWidth ||
                entityY < 0 || entityY + entityHeight > mapPixelHeight) {
                if (debug) console.log(`  ❌ FAIL: Entity TL (${entityX.toFixed(1)}, ${entityY.toFixed(1)}) or BR is out of map bounds [0..${mapPixelWidth}, 0..${mapPixelHeight}] (allowEntityOutOfBounds=false)`);
                return false;
            }
        }

        // --- Proceed with Collider Validation ---
        const colWidth = collider.width;
        const colHeight = collider.height;
        const hasColliderSize = colWidth > 0 && colHeight > 0;

        if (!hasColliderSize) {
            const zeroSizeCacheKey = `validate_${entity?.id || 'no-id'}_${Math.round(entityX)}_${Math.round(entityY)}_0x0`;
            const zeroCached = this.validationCache.get(zeroSizeCacheKey);
            if (zeroCached !== undefined) return zeroCached;
            this.validationCache.set(zeroSizeCacheKey, true);
            return true; // No collider means no collision
        }

        const colliderWorldX = entityX + collider.offsetX;
        const colliderWorldY = entityY + collider.offsetY;
        const colliderRight = colliderWorldX + colWidth;
        const colliderBottom = colliderWorldY + colHeight;

        // --- Caching ---
        const cacheKey = `validate_${entity?.id || 'no-id'}_${Math.round(colliderWorldX)}_${Math.round(colliderWorldY)}_${colWidth}x${colHeight}`;
        const cached = this.validationCache.get(cacheKey);
        if (cached !== undefined) {
            return cached;
        }

        // --- Log Initial Info ---
        if (debug) {
            console.log(`_validatePosition: Checking Entity ${entity?.id} at TL (${entityX.toFixed(1)}, ${entityY.toFixed(1)}). Collider Bounds: X[${colliderWorldX.toFixed(1)}..${colliderRight.toFixed(1)}], Y[${colliderWorldY.toFixed(1)}..${colliderBottom.toFixed(1)}]`);
        }

        // --- Grid Collision Check ---
        const cellSize = this.gridSystem.config.cellSize;
        const gridW = this.gridSystem.gridWidth;
        const gridH = this.gridSystem.gridHeight;
        const startGridX = Math.floor(colliderWorldX / cellSize);
        const startGridY = Math.floor(colliderWorldY / cellSize);
        const endGridX = Math.ceil(colliderRight / cellSize);
        const endGridY = Math.ceil(colliderBottom / cellSize);

        if (debug) {
            console.log(`  Grid Check Loop Range: X[${startGridX}..${endGridX - 1}], Y[${startGridY}..${endGridY - 1}]`);
        }

        // Iterate through all potentially overlapping grid cells
        for (let gridX = startGridX; gridX < endGridX; gridX++) {
            for (let gridY = startGridY; gridY < endGridY; gridY++) {

                const isValidGridIndex = (gridX >= 0 && gridX < gridW && gridY >= 0 && gridY < gridH);
                const cellWorldX = gridX * cellSize;
                const cellWorldY = gridY * cellSize;
                const cellWorldRight = cellWorldX + cellSize;
                const cellWorldBottom = cellWorldY + cellSize;

                // --- Standard Overlap Check (Reverted - No Epsilon) ---
                const overlapsThisCell = (
                    colliderWorldX < cellWorldRight &&    // Collider left is left of cell right
                    colliderRight > cellWorldX &&    // Collider right is right of cell left
                    colliderWorldY < cellWorldBottom && // Collider top is above cell bottom
                    colliderBottom > cellWorldY      // Collider bottom is below cell top
                );
                // --- End Standard Overlap Check ---


                if (!isValidGridIndex) {
                    // Index is out of bounds. Fail ONLY if the collider overlaps this specific OOB cell space.
                    if (overlapsThisCell) { // Check using standard overlap
                        if (debug) console.log(`  ❌ FAIL: Collider overlaps out-of-bounds grid index (${gridX}, ${gridY}) world area [${cellWorldX.toFixed(1)}..${cellWorldRight.toFixed(1)}, ${cellWorldY.toFixed(1)}..${cellWorldBottom.toFixed(1)}]`);
                        this.validationCache.set(cacheKey, false);
                        return false;
                    }
                    // If not overlapping this specific OOB cell, continue loop.
                    continue;
                }

                // --- Process Valid Grid Indices ---
                // Only check properties IF the collider actually overlaps THIS specific valid cell
                if (overlapsThisCell) { // Check using standard overlap
                    const cell = this.gridSystem.grid[gridX]?.[gridY];
                    if (!cell) {
                        if (debug) console.log(`  ❌ FAIL: Valid Cell Index (${gridX}, ${gridY}) is unexpectedly null/undefined.`);
                        this.validationCache.set(cacheKey, false); return false;
                    }

                    // Check properties for this valid, overlapped cell:
                    if ((!cell.tileWalkable && !this._canTraverseConditionalCell(cell, entityCapabilities)) ||
                        (!cell.objectWalkable && this._getCellBlockingObjects(cell, entity).some(obj => !this._isOpenableObstacle(obj, entityCapabilities)))) {
                        if (debug) console.log(`  ❌ FAIL: Collider overlaps non-walkable tile at valid grid (${gridX}, ${gridY})`);
                        this.validationCache.set(cacheKey, false); return false;
                    }
                    if (cell.hasDoor && entityCapabilities && !entityCapabilities.canOpenDoors) {
                        if (debug) console.log(`  ❌ FAIL: Collider overlaps door at valid grid (${gridX}, ${gridY})`);
                        this.validationCache.set(cacheKey, false); return false;
                    }
                    const terrainType = this.getTerrainTypeAt(gridX, gridY);
                    if (!this._canTraverseTerrain(terrainType, entityCapabilities)) {
                        if (debug) console.log(`  ❌ FAIL: Collider overlaps non-traversable terrain '${terrainType}' at valid grid (${gridX}, ${gridY})`);
                        this.validationCache.set(cacheKey, false); return false;
                    }
                }
                // If collider doesn't overlap this specific valid cell, continue loop
            } // end Y loop
        } // end X loop

        // --- World Collider Check --- (Uses separate _checkDetailedCollision)
        if (debug) {
            console.log(`  Grid checks passed. Calling getPotentialCollidersForArea for area X[${colliderWorldX.toFixed(1)}..${colliderRight.toFixed(1)}], Y[${colliderWorldY.toFixed(1)}..${colliderBottom.toFixed(1)}]`);
        }
        // Ensure getPotentialCollidersForArea NO LONGER returns tile representations
        const potentialColliders = this.gridSystem.getPotentialCollidersForArea(
            colliderWorldX, colliderWorldY, colWidth, colHeight, entity
        );
        if (debug) {
            // Log details ONLY if potentialColliders is not null/empty
            if (potentialColliders && potentialColliders.length > 0) {
                const colliderDetails = potentialColliders.map(p => `ID ${p.id || 'N/A'}(Tile:${!!p.isTileCollider})@(${p.posX?.toFixed(0)},${p.posY?.toFixed(0)})`).join(', ');
                console.log(`  Found ${potentialColliders.length} potential world colliders: [${colliderDetails}]`);
            } else {
                console.log(`  Found 0 potential world colliders.`);
            }
        }


        if (potentialColliders && potentialColliders.length > 0) {
            const entityStateForCollision = {
                posX: entityX, posY: entityY, collider: collider,
                size: { width: entityWidth, height: entityHeight }
            };
            for (const objFromGrid of potentialColliders) {
                // Should only be actual objects now, not synthetic tiles
                if (debug) {
                    console.log(`    Checking detailed collision against obj ID ${objFromGrid.id || 'N/A'} (isTile: ${!!objFromGrid.isTileCollider}, walkable: ${objFromGrid.config?.walkable})`);
                }
                if (this._isOpenableObstacle(objFromGrid, entityCapabilities)) {
                    continue;
                }
                if (this._checkDetailedCollision(entityStateForCollision, objFromGrid)) {
                    if (debug) console.log(`  ❌ FAIL: Detailed collision with obj ID ${objFromGrid.id || 'N/A'}`);
                    this.validationCache.set(cacheKey, false);
                    return false;
                }
            }
        }

        // --- Success ---
        if (debug) {
            console.log(`  ✅ SUCCESS: Validation passed for Entity ${entity?.id} at TL (${entityX.toFixed(1)}, ${entityY.toFixed(1)})`);
        }
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
     */
    _getNeighbors(entity, x, y, entityWidth, entityHeight, collider, entityCapabilities, effectiveOptions) {
        const neighbors = [];
        const directions = effectiveOptions.allowDiagonals ?
            [...this.cardinalDirections, ...this.diagonalDirections] :
            this.cardinalDirections;
        const debug = effectiveOptions.debug; // Use effectiveOptions
        const cellSize = this.gridSystem.config.cellSize; // Get cellSize for center calculation

        for (const dir of directions) {
            // Calculate potential grid coordinates for the entity's Top-Left corner
            // These coordinates CAN be negative or outside grid index bounds.
            const newX = x + dir.x;
            const newY = y + dir.y;
            const isDiagonal = Math.abs(dir.x) === 1 && Math.abs(dir.y) === 1;

            // --- Primary Validation: Collider Fit Check at Destination ---
            // This is the core validation step. It calls _canEntityFitAt, which in turn
            // calls _validatePosition. _validatePosition checks everything:
            // 1. Collider world X/Y >= 0
            // 2. Collider world Right/Bottom < mapPixelWidth/Height
            // 3. No overlap with unwalkable grid cells covered by the collider.
            // 4. No overlap with world colliders (other entities, static objects).
            // 5. Terrain traversability based on capabilities.
            // This check determines if placing the entity's TL at (newX, newY) results in a valid state.
            if (!this._canEntityFitAt(entity, newX, newY, entityWidth, entityHeight, collider, entityCapabilities)) {
                if (debug) {
                    // Add to rejectedNodes for visualization ONLY IF the grid key is technically valid
                    // (to avoid trying to visualize nodes at like -1000, -1000)
                    // A better approach might be to log the world coords that failed validation.
                    // For now, just continue.
                    if (newX >= 0 && newX < this.gridSystem.gridWidth && newY >= 0 && newY < this.gridSystem.gridHeight) {
                        this.debugElements.rejectedNodes.add(this.getKey(newX, newY));
                    }
                }
                continue; // Invalid placement according to _validatePosition, skip this neighbor.
            }

            // --- Diagonal Movement Constraint Check ---
            // If diagonal movement is allowed, we must also ensure the entity can pass
            // through the intermediate cardinal positions without collision.
            // We use the same robust _canEntityFitAt check for these intermediate steps.
            if (isDiagonal) {
                // Check intermediate position 1 (moves vertically first: same X, new Y)
                if (!this._canEntityFitAt(entity, x, newY, entityWidth, entityHeight, collider, entityCapabilities)) {
                    if (debug) { /* Optional log */ }
                    continue; // Blocked moving vertically first
                }
                // Check intermediate position 2 (moves horizontally first: new X, same Y)
                if (!this._canEntityFitAt(entity, newX, y, entityWidth, entityHeight, collider, entityCapabilities)) {
                    if (debug) { /* Optional log */ }
                    continue; // Blocked moving horizontally first
                }
            }

            // --- If all checks pass, the neighbor is valid ---
            // Determine the terrain type for movement cost calculation.
            // Since the entity/collider can span multiple tiles, sample the terrain
            // at the entity's *center* when its TL is at (newX, newY).
            const entityWorldX = newX * cellSize;
            const entityWorldY = newY * cellSize;
            const entityCenterX = entityWorldX + entityWidth / 2;
            const entityCenterY = entityWorldY + entityHeight / 2;
            // Convert the calculated center world coordinates back to grid coordinates for sampling.
            const centerGrid = this.gridSystem.worldToGrid(entityCenterX, entityCenterY);
            // Get terrain type at the center grid cell. getTerrainTypeAt handles out-of-bounds sampling gracefully.
            const terrainType = this.getTerrainTypeAt(centerGrid.x, centerGrid.y);

            // Add the neighbor node to the list. The node is identified by the grid coordinates (newX, newY)
            // representing where the entity's TL would be. The terrainType is stored for cost calculation.
            const centerCell = this.gridSystem.grid[centerGrid.x]?.[centerGrid.y];
            neighbors.push({
                x: newX,
                y: newY,
                terrainType: terrainType,
                conditionType: centerCell?.conditionType || null,
                conditionallyWalkable: !!centerCell?.conditionallyWalkable
            });
        }
        return neighbors;
    }

    /**
     * Calculate movement cost between two grid nodes, considering terrain and path centering.
     */
    _getMovementCost(fromNode, toNode, entityCapabilities, effectiveOptions) { // Added options param
        const baseMoveCost = (fromNode.x !== toNode.x && fromNode.y !== toNode.y) ? Math.SQRT2 : 1.0;
        const terrainType = toNode.terrainType;

        // Use options passed in effectiveOptions if they exist, otherwise fallback to this.options
        const preferPaths = (effectiveOptions.preferPaths !== undefined ? effectiveOptions.preferPaths : this.options.preferPaths) &&
            entityCapabilities?.followsPaths !== false;
        const pathEdgePenaltyFactor = effectiveOptions.pathEdgePenaltyFactor !== undefined ? effectiveOptions.pathEdgePenaltyFactor : this.options.pathEdgePenaltyFactor;
        const avoidDifficultTerrain = effectiveOptions.avoidDifficultTerrain !== undefined ? effectiveOptions.avoidDifficultTerrain : this.options.avoidDifficultTerrain;

        const terrainCosts = this.terrainCosts || { default: 1.0 };
        let terrainMultiplier = terrainCosts[terrainType] || terrainCosts['default'];
        const defaultCost = terrainCosts['default'] || 1.0;

        // Path Centering Logic (using preferPaths, pathEdgePenaltyFactor)
        if (preferPaths && terrainType === 'path') {
            const pathBaseCost = terrainCosts['path'] || 0.8;
            terrainMultiplier = pathBaseCost;
            let nonPathNeighbors = 0;
            let isBorderingUnwalkable = false;
            for (const dir of this.cardinalDirections) { /* ... check neighbors ... */
                const nx = toNode.x + dir.x; const ny = toNode.y + dir.y;
                if (nx >= 0 && nx < this.gridSystem.gridWidth && ny >= 0 && ny < this.gridSystem.gridHeight) {
                    const neighborCell = this.gridSystem.grid[nx]?.[ny];
                    if (neighborCell && neighborCell.walkable) {
                        const neighborTerrain = this.getTerrainTypeAt(nx, ny);
                        if (neighborTerrain !== 'path') { nonPathNeighbors++; }
                    } else { isBorderingUnwalkable = true; }
                } else { isBorderingUnwalkable = true; }
            }
            if (nonPathNeighbors > 0 || isBorderingUnwalkable) {
                const costDifference = defaultCost - pathBaseCost;
                const penaltyAmount = costDifference * pathEdgePenaltyFactor;
                terrainMultiplier = Math.min(pathBaseCost + penaltyAmount, defaultCost);
            }
        }

        // Other Capability Adjustments (using avoidDifficultTerrain)
        if (avoidDifficultTerrain && this._isTerrainInCategory(terrainType, 'DIFFICULT_TERRAIN')) {
            terrainMultiplier *= 1.5;
        }

        if (toNode.conditionallyWalkable && ['door', 'gate'].includes(toNode.conditionType)) {
            terrainMultiplier = Math.max(terrainMultiplier, terrainCosts.door_closed || 3.0);
        }

        terrainMultiplier *= this._getEntityTerrainCostMultiplier(terrainType, entityCapabilities);

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
     */
    _hasLineOfSight(entity, startCenter, endCenter, entityWidth, entityHeight, collider, entityCapabilities) {
        const dx = endCenter.x - startCenter.x;
        const dy = endCenter.y - startCenter.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const cellSize = this.gridSystem.config.cellSize;

        if (distance < cellSize * 0.5) return true;

        const checksPerCell = 1.5;
        const numChecks = Math.max(2, Math.min(15, Math.ceil(distance / (cellSize / checksPerCell))));

        for (let i = 1; i < numChecks; i++) {
            const ratio = i / numChecks;
            const checkCenterX = startCenter.x + dx * ratio;
            const checkCenterY = startCenter.y + dy * ratio;
            const entityX = checkCenterX - (entityWidth / 2);
            const entityY = checkCenterY - (entityHeight / 2);

            // Validate the position - PASS ENTITY
            if (!this._validatePosition(entity, entityX, entityY, entityWidth, entityHeight, collider, entityCapabilities)) {
                // if(this.options.debug) { console.log(`LOS blocked at step ${i}/${numChecks}...`); } // Use effectiveOptions if debugging here
                return false;
            }
        }

        // Check the end point itself - PASS ENTITY
        const endEntityX = endCenter.x - (entityWidth / 2);
        const endEntityY = endCenter.y - (entityHeight / 2);
        if (!this._validatePosition(entity, endEntityX, endEntityY, entityWidth, entityHeight, collider, entityCapabilities)) {
            // if(this.options.debug) { console.log(`LOS blocked at final end point.`); }
            return false;
        }
        return true;
    }

    /**
     * Get distance between two points
     * @private
     */
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
     * Uses the original calculated start center and target end center.
     * @private
     */
    _reconstructPath(entity, cameFrom, currentGridNode, startGrid, endGrid,
        originalStartCenterX, originalStartCenterY,
        originalEndCenterX, originalEndCenterY,
        entityWidth, entityHeight, collider, entityCapabilities,
        effectiveOptions /* Pass options */) {

        const gridPath = [];
        let tempNode = currentGridNode;
        while (tempNode) {
            gridPath.unshift(tempNode);
            tempNode = cameFrom.get(tempNode.key);
        }

        // Convert Grid Path to World Path (Entity Centers)
        const worldPath = [];
        const cellSize = this.gridSystem.config.cellSize;
        worldPath.push({ x: originalStartCenterX, y: originalStartCenterY });
        for (let i = 1; i < gridPath.length; i++) {
            const gridNode = gridPath[i];
            const gridWorldX = gridNode.x * cellSize; const gridWorldY = gridNode.y * cellSize;
            const centerX = gridWorldX + (entityWidth / 2); const centerY = gridWorldY + (entityHeight / 2);
            if (i < gridPath.length - 1 || (centerX !== originalEndCenterX || centerY !== originalEndCenterY)) {
                if (worldPath.length === 0 || centerX !== worldPath[0].x || centerY !== worldPath[0].y) {
                    worldPath.push({ x: centerX, y: centerY });
                }
            }
        }
        if (worldPath.length > 0) { // Ensure final point is target end center
            const lastAdded = worldPath[worldPath.length - 1];
            if (lastAdded.x !== originalEndCenterX || lastAdded.y !== originalEndCenterY) {
                // [...] Logic to ensure last point is correct (same as before)
                const lastGridNode = gridPath[gridPath.length - 1];
                const lastGridWorldX = lastGridNode.x * cellSize; const lastGridWorldY = lastGridNode.y * cellSize;
                const lastCalcCenterX = lastGridWorldX + (entityWidth / 2); const lastCalcCenterY = lastGridWorldY + (entityHeight / 2);
                if (lastCalcCenterX !== originalEndCenterX || lastCalcCenterY !== originalEndCenterY) {
                    worldPath.push({ x: originalEndCenterX, y: originalEndCenterY });
                } else {
                    worldPath[worldPath.length - 1] = { x: originalEndCenterX, y: originalEndCenterY };
                }
            }
        } else { /*[...] Handle empty path case (same as before)*/
            if (originalStartCenterX === originalEndCenterX && originalStartCenterY === originalEndCenterY) {
                const startEntityX = originalStartCenterX - (entityWidth / 2); const startEntityY = originalStartCenterY - (entityHeight / 2);
                if (this._validatePosition(entity, startEntityX, startEntityY, entityWidth, entityHeight, collider, entityCapabilities)) {
                    return [{ x: originalStartCenterX, y: originalStartCenterY }];
                } else { return null; }
            }
            console.warn("Path reconstruction resulted in empty worldPath."); return null;
        }

        // Path Processing
        let finalPath = worldPath;
        finalPath = finalPath.filter((point, i, arr) => { // Filter duplicates
            if (i === 0) return true; const dx = point.x - arr[i - 1].x; const dy = point.y - arr[i - 1].y; return (dx * dx + dy * dy) > 0.001;
        });

        // PASS ENTITY to smoothing/normalization if they use validation checks internally (like _hasLineOfSight)
        if (effectiveOptions.smoothPaths && finalPath.length > 2) {
            finalPath = this._smoothPath(entity, finalPath, entityWidth, entityHeight, collider, entityCapabilities, effectiveOptions);
        }
        if (effectiveOptions.normalizeSmallMovements && finalPath.length > 2) {
            // _normalizePathMovements doesn't call validation, so doesn't strictly need entity
            finalPath = this._normalizePathMovements(finalPath, entityWidth, entityHeight, effectiveOptions);
        }

        if (effectiveOptions.debug) { this.debugElements.path = [...finalPath]; }

        // Final check: Ensure start/end points are exactly requested
        if (finalPath.length > 0) {
            finalPath[0] = { x: originalStartCenterX, y: originalStartCenterY };
            if (finalPath.length > 1) { finalPath[finalPath.length - 1] = { x: originalEndCenterX, y: originalEndCenterY }; }
            else { /*[...] Handle single point case*/
                finalPath[0] = { x: originalStartCenterX, y: originalStartCenterY };
                if (originalStartCenterX !== originalEndCenterX || originalStartCenterY !== originalEndCenterY) { finalPath.push({ x: originalEndCenterX, y: originalEndCenterY }); }
            }
            // Remove final duplicates
            if (finalPath.length >= 2) { /*[...] Duplicate removal logic (same as before)*/
                const lastPoint = finalPath[finalPath.length - 1]; const secondLastPoint = finalPath[finalPath.length - 2];
                if (Math.abs(lastPoint.x - secondLastPoint.x) < 0.1 && Math.abs(lastPoint.y - secondLastPoint.y) < 0.1) { finalPath.pop(); }
            }
            if (finalPath.length >= 2) {
                const firstPoint = finalPath[0]; const secondPoint = finalPath[1];
                if (Math.abs(firstPoint.x - secondPoint.x) < 0.1 && Math.abs(firstPoint.y - secondPoint.y) < 0.1) { finalPath.shift(); }
            }
        } else { /*[...] Handle path becoming empty case (same as before)*/
            if (originalStartCenterX === originalEndCenterX && originalStartCenterY === originalEndCenterY) {
                const startEntityX = originalStartCenterX - (entityWidth / 2); const startEntityY = originalStartCenterY - (entityHeight / 2);
                if (this._validatePosition(entity, startEntityX, startEntityY, entityWidth, entityHeight, collider, entityCapabilities)) { return [{ x: originalStartCenterX, y: originalStartCenterY }]; }
            } return null;
        }
        return finalPath;
    }


    /**
     * Optimize path by removing unnecessary waypoints using line-of-sight checks.
     * Operates on world center coordinates.
     * @private
     */
    _smoothPath(entity, path, entityWidth, entityHeight, collider, entityCapabilities, effectiveOptions) {
        if (path.length <= 2) return path;

        const smoothed = [path[0]];
        let currentIndex = 0;

        while (currentIndex < path.length - 1) {
            let furthestVisibleIndex = currentIndex + 1;
            const maxLookAheadIndex = Math.min(currentIndex + 1 + effectiveOptions.maxSmoothingDistance, path.length - 1);

            for (let i = currentIndex + 2; i <= maxLookAheadIndex; i++) {
                // PASS ENTITY to _hasLineOfSight
                if (this._hasLineOfSight(entity, smoothed[smoothed.length - 1], path[i], entityWidth, entityHeight, collider, entityCapabilities)) {
                    furthestVisibleIndex = i;
                } else {
                    break;
                }
            }
            smoothed.push(path[furthestVisibleIndex]);
            currentIndex = furthestVisibleIndex;
            if (currentIndex >= path.length - 1) break;
        }
        // Ensure final point (same logic as before)
        if (smoothed.length > 0 && path.length > 0) {
            const lastSmoothed = smoothed[smoothed.length - 1]; const lastOriginal = path[path.length - 1];
            if (Math.abs(lastSmoothed.x - lastOriginal.x) > 0.1 || Math.abs(lastSmoothed.y - lastOriginal.y) > 0.1) {
                smoothed.push(lastOriginal);
            }
        }
        return smoothed;
    }


    /**
     * Normalize path by removing small segments or insignificant turns.
     * Operates on world center coordinates.
     * @private
     */
    _normalizePathMovements(path, entityWidth, entityHeight, effectiveOptions) { // Added options param
        if (path.length <= 2) return path;

        const normalized = [path[0]];
        // Use effectiveOptions if minSegmentLength were defined there, otherwise use this.options
        const minSegmentLength = (effectiveOptions && effectiveOptions.minSegmentLength !== undefined) ? effectiveOptions.minSegmentLength : this.options.minSegmentLength;
        const minSegmentSq = Math.pow(minSegmentLength * this.gridSystem.config.cellSize, 2);
        const significantAngle = 20; // Keep hardcoded or make an option

        let lastAddedPoint = path[0];
        let prevPoint = path[0];

        for (let i = 1; i < path.length - 1; i++) {
            const currentPoint = path[i];
            const nextPoint = path[i + 1];
            const dx = currentPoint.x - lastAddedPoint.x;
            const dy = currentPoint.y - lastAddedPoint.y;
            const distSq = dx * dx + dy * dy;
            const angle1 = this._getDirection(prevPoint, currentPoint);
            const angle2 = this._getDirection(currentPoint, nextPoint);
            const angleDiff = Math.abs(this._getAngleDifference(angle1, angle2));

            if (angleDiff > significantAngle || distSq >= minSegmentSq) {
                normalized.push(currentPoint);
                lastAddedPoint = currentPoint;
            }
            prevPoint = currentPoint;
        }
        normalized.push(path[path.length - 1]);

        // Duplicate check (same as before)
        if (normalized.length >= 2) {
            const lastPoint = normalized[normalized.length - 1]; const secondLastPoint = normalized[normalized.length - 2];
            if (Math.abs(lastPoint.x - secondLastPoint.x) < 0.1 && Math.abs(lastPoint.y - secondLastPoint.y) < 0.1) {
                normalized.pop();
            }
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
            zIndex: 979
        });
        container.appendChild(entity);

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
                zIndex: 980
            });
            container.appendChild(colliderEl);
        }
    }

    _visualizeSearchNodes(container, nodeKeys, options = {}) {
        if (!container || !nodeKeys?.size || !this.options.debug) return;

        const {
            className = 'search-node',
            color = 'rgba(64, 156, 255, 0.22)',
            size = Math.max(4, this.gridSystem.config.cellSize * 0.3)
        } = options;

        const keys = Array.from(nodeKeys);
        const maxNodes = Math.max(1, this.options.maxVisualizedNodes || 250);
        const step = Math.max(1, Math.ceil(keys.length / maxNodes));

        for (let i = 0; i < keys.length; i += step) {
            const [gridX, gridY] = keys[i].split(',').map(Number);
            if (!Number.isFinite(gridX) || !Number.isFinite(gridY)) continue;

            const center = this.gridSystem.gridToWorld(gridX, gridY);
            const node = document.createElement('div');
            node.className = `pathfinder-node ${className} debug`;
            Object.assign(node.style, {
                position: 'absolute',
                left: `${center.x - size / 2}px`,
                top: `${center.y - size / 2}px`,
                width: `${size}px`,
                height: `${size}px`,
                borderRadius: '50%',
                backgroundColor: color,
                zIndex: 985,
                pointerEvents: 'none'
            });
            container.appendChild(node);
        }
    }

}
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
}
