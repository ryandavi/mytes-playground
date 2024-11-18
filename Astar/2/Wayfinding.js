class Node {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.g = 0;
        this.h = 0;
        this.f = 0;
        this.parent = null;
    }
}

class AStar {
    constructor(gridWidth, gridHeight, tileSize, blockedRectangles, characterSize) {
        this.gridWidth = gridWidth;
        this.gridHeight = gridHeight;
        this.tileSize = tileSize;
        this.characterSize = characterSize;
        this.grid = Array.from({ length: gridWidth }, () => new Array(gridHeight).fill(0));
        this.blockedRectangles = blockedRectangles;
        this.initializeGrid();
    }

    initializeGrid() {
        for (const rect of this.blockedRectangles) {
            const startX = Math.floor(rect.x / this.tileSize);
            const startY = Math.floor(rect.y / this.tileSize);
            const endX = Math.ceil((rect.x + rect.width) / this.tileSize);
            const endY = Math.ceil((rect.y + rect.height) / this.tileSize);

            for (let x = startX; x < endX; x++) {
                for (let y = startY; y < endY; y++) {
                    if (this.isInsideGrid(x, y)) {
                        this.grid[x][y] = 1; // Mark as blocked
                    }
                }
            }
        }
    }

    isInsideGrid(x, y) {
        return x >= 0 && x < this.gridWidth && y >= 0 && y < this.gridHeight;
    }

    isWalkable(x, y) {
        if (!this.isInsideGrid(x, y)) return false;

        // Check if any part of the character would overlap with a blocked cell
        const characterRadius = Math.ceil(this.characterSize / (2 * this.tileSize));
        for (let dx = -characterRadius; dx <= characterRadius; dx++) {
            for (let dy = -characterRadius; dy <= characterRadius; dy++) {
                const checkX = x + dx;
                const checkY = y + dy;
                if (this.isInsideGrid(checkX, checkY) && this.grid[checkX][checkY] === 1) {
                    return false;
                }
            }
        }
        return true;
    }

    calculateHeuristic(node, target) {
        return Math.abs(node.x - target.x) + Math.abs(node.y - target.y);
    }

    findPath(start, target, maxIterations = 1000) {
        const startNode = new Node(Math.floor(start.x / this.tileSize), Math.floor(start.y / this.tileSize));
        const targetNode = new Node(Math.floor(target.x / this.tileSize), Math.floor(target.y / this.tileSize));

        if (!this.isWalkable(targetNode.x, targetNode.y)) {
            return null; // Target is not reachable
        }

        const openList = [startNode];
        const closedSet = new Set();

        const neighbors = [
            { x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 },
            { x: -1, y: -1 }, { x: -1, y: 1 }, { x: 1, y: -1 }, { x: 1, y: 1 }
        ];

        for (let iterations = 0; openList.length > 0 && iterations < maxIterations; iterations++) {
            const currentNode = openList.reduce((min, node) => (node.f < min.f ? node : min), openList[0]);
            
            if (currentNode.x === targetNode.x && currentNode.y === targetNode.y) {
                return this.reconstructPath(currentNode);
            }

            openList.splice(openList.indexOf(currentNode), 1);
            closedSet.add(`${currentNode.x},${currentNode.y}`);

            for (const { x: dx, y: dy } of neighbors) {
                const neighborX = currentNode.x + dx;
                const neighborY = currentNode.y + dy;

                if (!this.isWalkable(neighborX, neighborY) || closedSet.has(`${neighborX},${neighborY}`)) {
                    continue;
                }

                const isDiagonal = dx !== 0 && dy !== 0;
                const movementCost = isDiagonal ? Math.SQRT2 : 1;

                const tentativeG = currentNode.g + movementCost;
                const neighborNode = openList.find(node => node.x === neighborX && node.y === neighborY);

                if (!neighborNode) {
                    const newNode = new Node(neighborX, neighborY);
                    newNode.g = tentativeG;
                    newNode.h = this.calculateHeuristic(newNode, targetNode);
                    newNode.f = newNode.g + newNode.h;
                    newNode.parent = currentNode;
                    openList.push(newNode);
                } else if (tentativeG < neighborNode.g) {
                    neighborNode.g = tentativeG;
                    neighborNode.f = neighborNode.g + neighborNode.h;
                    neighborNode.parent = currentNode;
                }
            }
        }

        return null; // No path found or reached maximum iterations
    }

    reconstructPath(endNode) {
        const path = [];
        let currentNode = endNode;
        while (currentNode) {
            path.unshift({ x: currentNode.x * this.tileSize, y: currentNode.y * this.tileSize });
            currentNode = currentNode.parent;
        }
        return this.simplifyPath(path);
    }

    simplifyPath(path) {
        if (path.length <= 2) return path;

        const simplifiedPath = [path[0]];
        let prevDirection = null;

        for (let i = 1; i < path.length - 1; i++) {
            const currentDirection = {
                x: path[i].x - path[i - 1].x,
                y: path[i].y - path[i - 1].y
            };

            if (!prevDirection || 
                currentDirection.x !== prevDirection.x || 
                currentDirection.y !== prevDirection.y) {
                simplifiedPath.push(path[i]);
                prevDirection = currentDirection;
            }
        }

        simplifiedPath.push(path[path.length - 1]);
        return simplifiedPath;
    }
}