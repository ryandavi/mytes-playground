class Node {
	constructor(x, y) {
		this.x = x;
		this.y = y;
		this.g = 0; // cost from the start - the actual cost so far to reach this node
		this.h = 0; // heuristic cost to the goal - estimated cost from this node to the goal
		this.f = 0; // sum of g and h costs  - lower = prioritized
		this.parent = null;
	}
}

class AStar {
	constructor(gridWidth, gridHeight, tileSize, blockedRectangles) {
		this.gridWidth = gridWidth;
		this.gridHeight = gridHeight;
		this.tileSize = tileSize;
		this.grid = new Array(gridWidth);

		for (let x = 0; x < gridWidth; x++) {
			this.grid[x] = new Array(gridHeight);
			for (let y = 0; y < gridHeight; y++) {
				this.grid[x][y] = 0;
			}
		}

		this.blockedRectangles = blockedRectangles;
	}

	isInsideGrid(x, y) {
		return x >= 0 && x < this.gridWidth && y >= 0 && y < this.gridHeight;
	}

	isWalkable(x, y) {
		// Check if the cell is within the grid and not within any blocked rectangles
		if (!this.isInsideGrid(x, y)) return false;
		const tileSize = this.tileSize;
		for (const rect of this.blockedRectangles) {
			if (
				x * tileSize + tileSize <= rect.x ||
				x * tileSize >= rect.x + rect.width ||
				y * tileSize + tileSize <= rect.y ||
				y * tileSize >= rect.y + rect.height
			) {
				continue;
			}
			return false;
		}
		return true;
	}


	simplifyPoints(points) {
		if (points.length <= 1) {
			return points;
		}

		const simplifiedPoints = [];

		// add the first one
		simplifiedPoints.push(points[0]);

		// loop through the rest
		for (let i = 1; i < points.length; i++) {
			const currentPoint = points[i];
			const lastPoint = simplifiedPoints[simplifiedPoints.length - 1];

			if (currentPoint.x !== lastPoint.x && currentPoint.y !== lastPoint.y) {
				simplifiedPoints.push(points[i - 1]);
			}
		}

		// add the last one
		simplifiedPoints.push(points[points.length - 1]);

		return simplifiedPoints;
	}


	simplifyPoints2(points, start, end) {
		if (points.length <= 1) {
			return points;
		}

		const simplifiedPoints = [];

		// add the first one
		simplifiedPoints.push(start);

		// loop through the rest
		for (let i = 3; i < points.length; i++) {
			const currentPoint = points[i];
			const lastPoint = simplifiedPoints[simplifiedPoints.length - 1];

			if (currentPoint.x !== lastPoint.x && currentPoint.y !== lastPoint.y) {
				simplifiedPoints.push(points[i - 1]);
			}
		}

		// add the last one
		simplifiedPoints.push(end);

		return simplifiedPoints;
	}


	calculateHeuristic(node, target) {
		// Simple Manhattan distance heuristic
		return Math.abs(node.x - target.x) + Math.abs(node.y - target.y);
	}

	findPath(start, target, maxIterations = 500) {
		const openList = [];
		const closedList = [];

		const startNode = new Node(Math.floor(start.x / this.tileSize), Math.floor(start.y / this.tileSize));
		const targetNode = new Node(Math.floor(target.x / this.tileSize), Math.floor(target.y / this.tileSize));

		// Check if the target is outside the canvas bounds
		if (
			targetNode.x < 0 || targetNode.x >= this.gridWidth ||
			targetNode.y < 0 || targetNode.y >= this.gridHeight ||
			!this.isWalkable(targetNode.x, targetNode.y)
		) {
			return null; // Target is not reachable
		}

		openList.push(startNode);

		const neighbors = [
			{ x: 0, y: -1 },
			{ x: 0, y: 1 },
			{ x: -1, y: 0 },
			{ x: 1, y: 0 },
			{ x: -1, y: -1 }, // Top-left diagonal
			{ x: -1, y: 1 },  // Bottom-left diagonal
			{ x: 1, y: -1 },  // Top-right diagonal
			{ x: 1, y: 1 },   // Bottom-right diagonal
		];

		const diagonalCost = Math.sqrt(2);

		let iterations = 0;

		while (openList.length > 0 && iterations < maxIterations) {
			let currentNode = openList[0];
			let currentIndex = 0;

			// Find the node with the lowest F cost in the open list
			for (let i = 1; i < openList.length; i++) {
				if (openList[i].f < currentNode.f) {
					currentNode = openList[i];
					currentIndex = i;
				}
			}

			// Move the current node from the open list to the closed list
			openList.splice(currentIndex, 1);
			closedList.push(currentNode);

			// Check if the current node is outside the canvas bounds
			if (currentNode.x < 0 || currentNode.x >= this.gridWidth || currentNode.y < 0 || currentNode.y >= this.gridHeight) {
				continue;
			}

			// If the current node is the target node, we've found the path
			if (currentNode.x === targetNode.x && currentNode.y === targetNode.y) {
				const path = [];
				let current = currentNode;
				while (current !== null) {
					path.push({ x: current.x * this.tileSize, y: current.y * this.tileSize });
					current = current.parent;
				}
				return path.reverse();
			}

			for (const neighborOffset of neighbors) {
				const neighborX = currentNode.x + neighborOffset.x;
				const neighborY = currentNode.y + neighborOffset.y;

				if (!this.isInsideGrid(neighborX, neighborY)) continue;

				const isDiagonal = neighborOffset.x !== 0 && neighborOffset.y !== 0;
				const movementCost = isDiagonal ? diagonalCost : 1;

				// Check if the neighbor is outside the canvas bounds
				if (neighborX < 0 || neighborX >= this.gridWidth || neighborY < 0 || neighborY >= this.gridHeight) {
					continue;
				}

				if (!this.isWalkable(neighborX, neighborY)) continue;

				const neighborNode = new Node(neighborX, neighborY);

				if (closedList.some((node) => node.x === neighborNode.x && node.y === neighborNode.y)) {
					continue;
				}

				// Check for corner cutting
				if (isDiagonal) {
					const dx = neighborX - currentNode.x;
					const dy = neighborY - currentNode.y;
					if (!this.isWalkable(currentNode.x + dx, currentNode.y) || !this.isWalkable(currentNode.x, currentNode.y + dy)) {
						continue;
					}
				}

				const gScore = currentNode.g + movementCost;
				const isBetterPath = !openList.some((node) => node.x === neighborNode.x && node.y === neighborNode.y) || gScore < neighborNode.g;

				if (isBetterPath) {
					neighborNode.g = gScore;
					neighborNode.h = this.calculateHeuristic(neighborNode, targetNode);
					neighborNode.f = neighborNode.g + neighborNode.h;
					neighborNode.parent = currentNode;

					if (!openList.some((node) => node.x === neighborNode.x && node.y === neighborNode.y)) {
						openList.push(neighborNode);
					}
				}
			}

			iterations++;
		}

		// No path found or reached maximum iterations
		return null;
	}

}
