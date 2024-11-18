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
    constructor(gridWidth, gridHeight, tileSize, blockedRectangles, characterSize, edgeMargin = 2) {
        this.gridWidth = gridWidth;
        this.gridHeight = gridHeight;
        this.tileSize = tileSize;
        this.characterSize = characterSize;
        this.edgeMargin = edgeMargin;
        this.grid = new Uint8Array(this.gridWidth * this.gridHeight);
        this.blockedRectangles = blockedRectangles;
        this.avoidEdges = true;
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
                        this.grid[y * this.gridWidth + x] = 1; // Mark as blocked
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
        if (this.avoidEdges && (x < this.edgeMargin || x >= this.gridWidth - this.edgeMargin ||
            y < this.edgeMargin || y >= this.gridHeight - this.edgeMargin)) {
            return false;
        }

        const characterRadius = Math.ceil(this.characterSize / (2 * this.tileSize));
        for (let dx = -characterRadius; dx <= characterRadius; dx++) {
            for (let dy = -characterRadius; dy <= characterRadius; dy++) {
                const checkX = x + dx;
                const checkY = y + dy;
                if (this.isInsideGrid(checkX, checkY) && this.grid[checkY * this.gridWidth + checkX] === 1) {
                    return false;
                }
            }
        }
        return true;
    }

    calculateHeuristic(node, target) {
        return Math.abs(node.x - target.x) + Math.abs(node.y - target.y);
    }

    findPath(start, target) {
        const startNode = new Node(Math.floor(start.x / this.tileSize), Math.floor(start.y / this.tileSize));
        const targetNode = new Node(Math.floor(target.x / this.tileSize), Math.floor(target.y / this.tileSize));

        if (!this.isWalkable(targetNode.x, targetNode.y)) {
            return null; // Target is not reachable
        }

        const openList = new BinaryHeap(node => node.f);
        openList.push(startNode);
        const closedSet = new Set();

        const neighbors = [
            { x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 },
            { x: -1, y: -1 }, { x: -1, y: 1 }, { x: 1, y: -1 }, { x: 1, y: 1 }
        ];

        while (openList.size() > 0) {
            const currentNode = openList.pop();
            
            if (currentNode.x === targetNode.x && currentNode.y === targetNode.y) {
                return this.reconstructPath(currentNode);
            }

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
                    openList.updateItem(neighborNode);
                }
            }
        }

        return null; // No path found
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

    setAvoidEdges(avoid) {
        this.avoidEdges = avoid;
    }
}

/* A binary heap allows us to perform these operations much more efficiently:
Finding and removing the lowest f-score node: O(log n)
Adding a new node: O(log n)
Updating a node's f-score: O(log n)
*/

class BinaryHeap {
    constructor(scoreFunction) {
        this.content = [];
        this.scoreFunction = scoreFunction;
    }

    push(element) {
        this.content.push(element);
        this.bubbleUp(this.content.length - 1);
    }

    pop() {
        const result = this.content[0];
        const end = this.content.pop();
        if (this.content.length > 0) {
            this.content[0] = end;
            this.sinkDown(0);
        }
        return result;
    }

    remove(node) {
        const len = this.content.length;
        for (let i = 0; i < len; i++) {
            if (this.content[i] != node) continue;
            const end = this.content.pop();
            if (i == len - 1) break;
            this.content[i] = end;
            this.bubbleUp(i);
            this.sinkDown(i);
            break;
        }
    }

    size() {
        return this.content.length;
    }

    bubbleUp(n) {
        const element = this.content[n];
        while (n > 0) {
            const parentN = ((n + 1) >> 1) - 1;
            const parent = this.content[parentN];
            if (this.scoreFunction(element) >= this.scoreFunction(parent)) break;
            this.content[parentN] = element;
            this.content[n] = parent;
            n = parentN;
        }
    }

    sinkDown(n) {
        const length = this.content.length;
        const element = this.content[n];
        const elemScore = this.scoreFunction(element);

        while (true) {
            const child2N = (n + 1) << 1;
            const child1N = child2N - 1;
            let swap = null;
            let child1Score;
            if (child1N < length) {
                const child1 = this.content[child1N];
                child1Score = this.scoreFunction(child1);
                if (child1Score < elemScore) swap = child1N;
            }
            if (child2N < length) {
                const child2 = this.content[child2N];
                const child2Score = this.scoreFunction(child2);
                if (child2Score < (swap === null ? elemScore : child1Score)) {
                    swap = child2N;
                }
            }
            if (swap === null) break;
            this.content[n] = this.content[swap];
            this.content[swap] = element;
            n = swap;
        }
    }

    updateItem(item) {
        const index = this.content.indexOf(item);
        this.bubbleUp(index);
        this.sinkDown(index);
    }

    find(predicate) {
        return this.content.find(predicate);
    }
}