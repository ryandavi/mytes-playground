class AStarMoveAction extends MyteAction {
    static metadata = {
        id: 'astar-move',
        label: 'A* Move To',
        category: 'movement',
        priority: 1,
        isMovementAction: true,
        isInterruptible: true,
        defaultDuration: 0,
        description: 'Move to a specific location using A* pathfinding',
        requiresTarget: true,
        defaultOptions: {
            currentPathIndex: 0
        }
    };

    constructor(myte, options) {
        super(myte, {
            ...AStarMoveAction.metadata.defaultOptions,
            ...options
        });
        this.pathPoints = [];
        this.currentPathIndex = 0;
    }

    static canPerform(selected, active) {
        return active && selected && !active?.queue.isCarrying();
    }

    start() {
        super.start();
        
        // Get the target position
        const targetX = this.target.posX;
        const targetY = this.target.posY;
        
        // Find path using A* pathfinding
        if (this.myte.parent && this.myte.parent.gameMap) {
            const map = this.myte.parent.gameMap;
            
            // Get collider information from the myte
            const myteCollider = this.myte.collider;
            
            const entityWidth = myteCollider.width;
            const entityHeight = myteCollider.height;
            
            // Calculate start position (center of myte's collider)
            const startX = this.myte.posX;
            const startY = this.myte.posY;
            
            console.log(`Finding A* path from (${startX}, ${startY}) to (${targetX}, ${targetY})`);
            
            // Find the path
            const path = map.gridSystem.pathfinder.findPath(
                startX, startY, 
                targetX, targetY, 
                entityWidth, entityHeight, 
                myteCollider
            );

            console.log(`Path found`, path);
            
            if (path && path.length > 0) {
                this.pathPoints = path;
                this.currentPathIndex = 0;
                console.log(`A* path found with ${path.length} waypoints`);
                
                // Set initial target to first waypoint
                this.setCurrentWaypoint();
            } else {
                console.log(`No A* path found, using direct path`);
                // Fallback to direct path
                this.pathPoints = [{ x: targetX, y: targetY }];
                this.currentPathIndex = 0;
                this.myte.setTarget(targetX, targetY);
            }
        } else {
            // No map or grid system, use direct path
            this.pathPoints = [{ x: targetX, y: targetY }];
            this.currentPathIndex = 0;
            this.myte.setTarget(targetX, targetY);
        }
        
        this.myte.reset();
    }
    
    setCurrentWaypoint() {
        if (this.currentPathIndex < this.pathPoints.length) {
            const waypoint = this.pathPoints[this.currentPathIndex];
            this.myte.setTarget(waypoint.x, waypoint.y);
            console.log(`Moving to waypoint ${this.currentPathIndex + 1}/${this.pathPoints.length}: (${waypoint.x}, ${waypoint.y})`);
        }
    }
    
    update() {
        // If we've reached the current waypoint
        if (this.myte.is_at_target()) {
            this.currentPathIndex++;
            
            // If we've reached the end of the path, we're done
            if (this.currentPathIndex >= this.pathPoints.length) {
                console.log(`Reached final A* destination`);
                return true;
            }
            
            // Otherwise, move to the next waypoint
            this.setCurrentWaypoint();
        }
        
        // Continue moving toward the current waypoint
        this.myte.move_toward_target();
        return false;
    }
}