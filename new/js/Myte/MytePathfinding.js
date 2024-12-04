class PathFindingSystem {
    constructor(gridSize = 32) {
        this.gridSize = gridSize;
        this.obstacles = new Set(); // Store obstacle coordinates
    }

    init() {
        // Get all elements with .collider class
        const colliders = document.querySelectorAll('.collider');
        
        // Add their positions to obstacles
        colliders.forEach(collider => {
            const rect = collider.getBoundingClientRect();
            
            // Convert rect to grid coordinates
            const startX = Math.floor(rect.left / this.gridSize);
            const startY = Math.floor(rect.top / this.gridSize);
            const endX = Math.ceil(rect.right / this.gridSize);
            const endY = Math.ceil(rect.bottom / this.gridSize);
            
            // Add all grid cells covered by this collider
            for (let x = startX; x < endX; x++) {
                for (let y = startY; y < endY; y++) {
                    this.obstacles.add(`${x},${y}`);
                }
            }
        });
    }



    isWalkable(x, y) {
        const gridX = Math.floor(x / this.gridSize);
        const gridY = Math.floor(y / this.gridSize);
        const key = `${gridX},${gridY}`;
        
        return !this.obstacles.has(key);
    }

    findPath(startX, startY, endX, endY) {
        // Convert to grid coordinates
        const gridStartX = Math.floor(startX / this.gridSize);
        const gridStartY = Math.floor(startY / this.gridSize);
        const gridEndX = Math.floor(endX / this.gridSize);
        const gridEndY = Math.floor(endY / this.gridSize);

        const openSet = new Set([`${gridStartX},${gridStartY}`]);
        const cameFrom = new Map();
        const gScore = new Map();
        const fScore = new Map();

        gScore.set(`${gridStartX},${gridStartY}`, 0);
        fScore.set(`${gridStartX},${gridStartY}`, this.heuristic(gridStartX, gridStartY, gridEndX, gridEndY));

        while (openSet.size > 0) {
            const current = this.getLowestFScore(openSet, fScore);
            const [currentX, currentY] = current.split(',').map(Number);

            if (currentX === gridEndX && currentY === gridEndY) {
                return this.reconstructPath(cameFrom, current);
            }

            openSet.delete(current);

            // Check all neighbors
            const neighbors = this.getNeighbors(currentX, currentY);
            for (const neighbor of neighbors) {
                const [neighborX, neighborY] = neighbor.split(',').map(Number);
                
                if (!this.isWalkable(neighborX * this.gridSize, neighborY * this.gridSize)) {
                    continue;
                }

                const tentativeGScore = gScore.get(current) + 1;

                if (!gScore.has(neighbor) || tentativeGScore < gScore.get(neighbor)) {
                    cameFrom.set(neighbor, current);
                    gScore.set(neighbor, tentativeGScore);
                    fScore.set(neighbor, tentativeGScore + 
                        this.heuristic(neighborX, neighborY, gridEndX, gridEndY));
                    
                    openSet.add(neighbor);
                }
            }
        }

        return null; // No path found
    }

    getNeighbors(x, y) {
        const neighbors = [];
        const directions = [
            [-1, 0], [1, 0], [0, -1], [0, 1], // Cardinal directions
            [-1, -1], [-1, 1], [1, -1], [1, 1] // Diagonals
        ];

        for (const [dx, dy] of directions) {
            neighbors.push(`${x + dx},${y + dy}`);
        }

        return neighbors;
    }

    heuristic(x1, y1, x2, y2) {
        // Manhattan distance
        return Math.abs(x2 - x1) + Math.abs(y2 - y1);
    }

    getLowestFScore(openSet, fScore) {
        let lowest = null;
        let lowestScore = Infinity;

        for (const pos of openSet) {
            const score = fScore.get(pos);
            if (score < lowestScore) {
                lowest = pos;
                lowestScore = score;
            }
        }

        return lowest;
    }

    reconstructPath(cameFrom, current) {
        const path = [current];
        while (cameFrom.has(current)) {
            current = cameFrom.get(current);
            path.unshift(current);
        }

        // Convert back to world coordinates
        return path.map(pos => {
            const [x, y] = pos.split(',').map(Number);
            return {
                x: x * this.gridSize + this.gridSize / 2,
                y: y * this.gridSize + this.gridSize / 2
            };
        });
    }
}