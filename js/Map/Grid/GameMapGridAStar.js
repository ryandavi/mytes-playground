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
        
        // Pathfinding options
        this.options = {
            allowDiagonals: true,
            allowDiagonalCutting: false,
            heuristicWeight: 1,
            maxSearchSteps: 1000,
            smoothPaths: true
        };
        
        // Entity dimensions - will be set during pathfinding
        this.entityWidth = 0;
        this.entityHeight = 0;
        this.entityRadius = { x: 0, y: 0 };
        
        // Debug support
        this.debugMode = false;
    }

    getKey(x, y) {
        return `${x},${y}`;
    }

    findPath(startX, startY, endX, endY, entityWidth = 0, entityHeight = 0) {
        // Save entity dimensions for collision checking
        this.entityWidth = entityWidth;
        this.entityHeight = entityHeight;
        
        // Convert world coordinates to grid coordinates
        const start = this.gridSystem.worldToGrid(startX, startY);
        const end = this.gridSystem.worldToGrid(endX, endY);

        // Calculate entity radius in grid cells (if dimensions provided)
        this.entityRadius = {
            x: Math.ceil((entityWidth / 2) / this.gridSystem.config.cellSize),
            y: Math.ceil((entityHeight / 2) / this.gridSystem.config.cellSize)
        };

        // Initialize data structures
        this.openSet.clear();
        const closedSet = new Set();
        const cameFrom = new Map();
        const gScore = new Map();
        const fScore = new Map();

        // Helper function to get node key
        const startKey = this.getKey(start.x, start.y);
        const endKey = this.getKey(end.x, end.y);

        // Check if the entity can fit at start and end positions
        if ((this.entityRadius.x > 0 || this.entityRadius.y > 0) && 
            (!this.canFitEntityAt(start.x, start.y) || !this.canFitEntityAt(end.x, end.y))) {
            console.warn('Entity cannot fit at start or end position');
            return null;
        }

        // Initialize start node
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
            if (steps > this.options.maxSearchSteps) {
                console.warn('Pathfinding exceeded maximum steps');
                return null;
            }

            const current = this.openSet.pop();
            const currentKey = current.key;

            if (currentKey === endKey) {
                return this.reconstructPath(cameFrom, current, end);
            }

            closedSet.add(currentKey);

            // Get valid neighbors
            const neighbors = this.getNeighbors(current.x, current.y);

            for (const neighbor of neighbors) {
                const neighborKey = this.getKey(neighbor.x, neighbor.y);

                if (closedSet.has(neighborKey)) continue;

                const tentativeG = gScore.get(currentKey) + this.getMovementCost(current, neighbor);

                if (!gScore.has(neighborKey) || tentativeG < gScore.get(neighborKey)) {
                    cameFrom.set(neighborKey, current);
                    gScore.set(neighborKey, tentativeG);
                    const h = this.heuristic(neighbor.x, neighbor.y, end.x, end.y);
                    const f = tentativeG + h * this.options.heuristicWeight;
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
        
        return null; // No path found
    }

    getNeighbors(x, y) {
        const neighbors = [];
        const directions = this.options.allowDiagonals ? this.directions : this.directions.slice(0, 4);

        for (const dir of directions) {
            const newX = x + dir.x;
            const newY = y + dir.y;

            // Check bounds
            if (newX < 0 || newX >= this.gridSystem.gridWidth ||
                newY < 0 || newY >= this.gridSystem.gridHeight) {
                continue;
            }

            // Check if cell is walkable
            if (!this.gridSystem.grid[newX][newY].walkable) {
                continue;
            }
            
            // For entities with size, check surrounding cells
            if (this.entityRadius.x > 0 || this.entityRadius.y > 0) {
                if (!this.canFitEntityAt(newX, newY)) {
                    continue;
                }
            }

            // Check diagonal movement blocking if not allowed to cut corners
            if (!this.options.allowDiagonalCutting && 
                Math.abs(dir.x) === 1 && Math.abs(dir.y) === 1) {
                if (!this.gridSystem.grid[x][newY].walkable || 
                    !this.gridSystem.grid[newX][y].walkable) {
                    continue;
                }
            }

            neighbors.push({ x: newX, y: newY });
        }

        return neighbors;
    }
    
    // Fixed canFitEntityAt method to use the correct entity dimensions
    canFitEntityAt(x, y) {
        // Check grid cells for walkability based on entity size
        for (let dx = -this.entityRadius.x; dx <= this.entityRadius.x; dx++) {
            for (let dy = -this.entityRadius.y; dy <= this.entityRadius.y; dy++) {
                const checkX = x + dx;
                const checkY = y + dy;
                
                if (checkX < 0 || checkX >= this.gridSystem.gridWidth ||
                    checkY < 0 || checkY >= this.gridSystem.gridHeight ||
                    !this.gridSystem.grid[checkX][checkY].walkable) {
                    return false;
                }
            }
        }
        
        // Create a temporary entity representation at the given position
        const entityBounds = {
            posX: x * this.gridSystem.config.cellSize,
            posY: y * this.gridSystem.config.cellSize,
            size: {
                width: this.entityWidth,
                height: this.entityHeight
            },
            collider: {
                width: this.entityWidth,
                height: this.entityHeight,
                offsetX: 0,
                offsetY: 0
            },
            config: {
                walkable: true
            }
        };
        
        // Check collision with objects in the grid cells
        const potentialColliders = this.gridSystem.getPotentialColliders(entityBounds);
        
        // Skip collision check if gridSystem doesn't have a parent or parent.parent
        if (!this.gridSystem.parent || !this.gridSystem.parent.parent) {
            return potentialColliders.length === 0;
        }
        
        // Check for collisions with other objects
        for (const collider of potentialColliders) {
            if (this.gridSystem.parent.parent.checkCollision) {
                if (this.gridSystem.parent.parent.checkCollision(entityBounds, collider)) {
                    return false;
                }
            }
        }
        
        return true;
    }

    heuristic(x1, y1, x2, y2) {
        // Octile distance (accounts for diagonal movement)
        const dx = Math.abs(x2 - x1);
        const dy = Math.abs(y2 - y1);
        return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
    }

    getMovementCost(from, to) {
        // Diagonal movement costs more
        return (from.x !== to.x && from.y !== to.y) ? Math.SQRT2 : 1;
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

        return this.options.smoothPaths ? this.smoothPath(path) : path;
    }

    smoothPath(path) {
        if (path.length <= 2) return path;

        const smoothed = [path[0]];
        let currentIndex = 0;

        while (currentIndex < path.length - 1) {
            let furthestVisible = currentIndex + 1;

            // Look ahead to find furthest visible node
            for (let i = currentIndex + 2; i < path.length; i++) {
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
        // Bresenham's line algorithm to check if path is clear
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
            // For entities with size, check if they can fit
            if (this.entityRadius.x > 0 || this.entityRadius.y > 0) {
                if (!this.canFitEntityAt(x, y)) {
                    return false;
                }
            } else {
                // Otherwise just check the center point
                if (x < 0 || x >= this.gridSystem.gridWidth || 
                    y < 0 || y >= this.gridSystem.gridHeight ||
                    !this.gridSystem.grid[x][y].walkable) {
                    return false;
                }
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

    visualizePath(container, path) {
        if (!this.debugMode || !container || !path) return;

        // Clear previous visualization
        const existingNodes = container.querySelectorAll('.path-node');
        existingNodes.forEach(node => node.remove());

        // Draw path
        path.forEach((point, index) => {
            const node = document.createElement('div');
            node.className = `path-node debug`;
            node.classList.add(index === 0 ? 'start' : index === path.length - 1 ? 'end' : 'middle');

            Object.assign(node.style, {
                left: `${point.x}px`,
                top: `${point.y}px`,
                width: '6px',
                height: '6px',
                position: 'absolute',
                borderRadius: '50%',
                backgroundColor: index === 0 ? 'green' : index === path.length - 1 ? 'red' : 'blue',
                zIndex: 1000
            });

            container.appendChild(node);
        });
    }
    
    // Cleanup resources
    dispose() {
        this.openSet.clear();
        this.directions = null;
        this.gridSystem = null;
    }
}

// Binary heap implementation for optimized open set
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