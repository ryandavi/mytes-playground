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
        requiresTarget: true, // Expects {x, y} center coords in options.target
        defaultOptions: {
            target: null, // { x: number, y: number } - Target CENTER required
            pathfindingOptions: {}, // Optional pathfinder overrides for this specific action call
            currentTargetIndex: 0
        }
    };

    constructor(myte, options) {
        const mergedOptions = { ...AStarMoveAction.metadata.defaultOptions, ...options };
        super(myte, mergedOptions);

        this.targetPoints = null;
        this.currentTargetIndex = 0;
        this._actionComplete = false;
    }

    getTargetPosition() {
        // Handle different target types
        if (!this.target) {
            console.warn(`[AStarMove] No target specified`);
            return null;
        }
        
        // Handle simple coordinates [x, y]
        if (Array.isArray(this.target) && this.target.length >= 2 && typeof this.target[0] === 'number') {
            console.log(`[AStarMove] Target is coordinate array`);
            return { x: this.target[0], y: this.target[1] };
        }
        
        // Handle point objects with {x, y} 
        if (typeof this.target === 'object' && 'x' in this.target && 'y' in this.target && !('posX' in this.target)) {
            console.log(`[AStarMove] Target is point object`);
            return { x: this.target.x, y: this.target.y };
        }
        
        // Handle game objects with posX, posY
        if (typeof this.target === 'object' && 'posX' in this.target && 'posY' in this.target) {
            
            console.log(`[AStarMove] Target is game object`);
            
            // For regular objects, aim for center accounting for entity size
            const width = this.target.size?.width || 0;
            const height = this.target.size?.height || 0;
            
           // Consider collider if available
           const colliderWidth = this.target.collider?.width || width;
           const colliderHeight = this.target.collider?.height || height;
           const colliderOffsetX = this.target.collider?.offsetX || 0;
           const colliderOffsetY = this.target.collider?.offsetY || 0;
           
           // To find the center of the collider:
           // 1. Start at the object's position (top-left corner)
           // 2. Add the collider's offset to get to the collider's top-left corner
           // 3. Add half the collider's width/height to get to the center of the collider
           return {
               x: this.target.posX + colliderOffsetX + (colliderWidth / 2),
               y: this.target.posY + colliderOffsetY + (colliderHeight / 2)
           };
        }
        
        console.warn(`[AStarMove] Unrecognized target type`);
        return null;
    }

    static canPerform(selected, active) {
        return active && selected && !active?.queue?.isCarrying();
    }

    start() {
        super.start();
        this.targetPoints = null;
        this.currentTargetIndex = this.currentTargetIndex || 0;
        this._actionComplete = false;

        // 1. Pre-checks
        if (!this.myte || !this.myte.pathfinder) {
            console.error(`AStarMoveAction (${this.myte?.id || 'N/A'}): Myte or Myte's pathfinder is missing. Action cannot start.`);
            this._actionComplete = true;
            return;
        }
        if (!this.target) {
            console.error(`AStarMoveAction (${this.myte.id}): Invalid target. Action cannot start.`);
            this._actionComplete = true;
            return;
        }

        const pathfinder = this.myte.pathfinder;
        const myte = this.myte;

        // 2. Coordinates
        const startX = myte.posX;
        const startY = myte.posY;
        const target = this.getTargetPosition();
        
        if (!target) {
            console.error(`AStarMoveAction (${myte.id}): Could not determine target position.`);
            this._actionComplete = true;
            return;
        }

        // 3. Pathfinding Options
        const effectivePathOptions = {
            ...myte.pathfindingOptions,
            ...(this.options?.pathfindingOptions || {})
        };

        console.log(`AStarMoveAction (${myte.id}): Finding path from (${startX.toFixed(0)}, ${startY.toFixed(0)}) to (${target.x.toFixed(0)}, ${target.y.toFixed(0)})`);

        // 4. Call Pathfinder
        const path = pathfinder.findPath(
            myte, startX, startY, target.x, target.y, effectivePathOptions
        );

        // 5. Process Result and convert to targetPoints format
        if (path && path.length > 0) {
            // Transform path waypoints to targetPoints format
            this.targetPoints = path.map(waypoint => {
                // Convert from center to top-left coordinates for the myte
                return {
                    x: waypoint.x - myte.size.width / 2,
                    y: waypoint.y - myte.size.height / 2
                };
            });
            
            // Optional: Remove first point if it's very close to current position
            const currentCenterX = myte.posX + myte.size.width / 2;
            const currentCenterY = myte.posY + myte.size.height / 2;
            if (this.targetPoints.length > 0 && 
                Math.abs((this.targetPoints[0].x + myte.size.width / 2) - currentCenterX) < 1 &&
                Math.abs((this.targetPoints[0].y + myte.size.height / 2) - currentCenterY) < 1) {
                this.targetPoints.shift();
            }

            if (this.targetPoints.length > 0) {
                console.log(`AStarMoveAction (${myte.id}): Path found with ${this.targetPoints.length} waypoints.`);
                
                // Set initial target point
                this.myte.setTarget(
                    this.targetPoints[this.currentTargetIndex].x,
                    this.targetPoints[this.currentTargetIndex].y
                );
            } else {
                console.warn(`AStarMoveAction (${myte.id}): Path found but became empty.`);
                this._actionComplete = true;
            }
        } else {
            console.warn(`AStarMoveAction (${myte.id}): No path found.`);
            this._actionComplete = true;
        }
    }

    update(deltaTime) {
        if (this._actionComplete) return true;

        if (!this.myte || !this.myte.isActive) {
            console.log(`AStarMoveAction (${this.myte?.id || 'N/A'}): Myte invalid/inactive. Completing.`);
            return true;
        }
        
        if (!this.targetPoints || this.targetPoints.length === 0) {
            console.log(`AStarMoveAction (${this.myte.id}): No valid path points. Completing.`);
            return true;
        }

        // Check if we've reached the current target point
        if (this.myte.is_at_target()) {
            this.currentTargetIndex++;
            
            // Check if we've reached the end of the path
            if (this.currentTargetIndex >= this.targetPoints.length) {
                console.log(`AStarMoveAction (${this.myte.id}): Reached final waypoint.`);
                
                // Optional final position adjustment to ensure precise placement
                const finalPoint = this.targetPoints[this.targetPoints.length - 1];
                this.myte.setPosition(finalPoint.x, finalPoint.y);
                this.myte.setSpritePosition(this.myte.posX, this.myte.posY);
                this.myte.setTarget(this.myte.posX, this.myte.posY); // Reset immediate target
                
                this._actionComplete = true;
                return true; // Success
            } else {
                // Set the next target point
                console.log(`AStarMoveAction (${this.myte.id}): Moving to waypoint ${this.currentTargetIndex}`);
                this.myte.setTarget(
                    this.targetPoints[this.currentTargetIndex].x,
                    this.targetPoints[this.currentTargetIndex].y
                );
            }
        }
        
        // Let myte's own movement logic handle the actual movement
        if (typeof this.myte.move_toward_target_new === 'function') {
            this.myte.move_toward_target_new();
        } else {
            this.myte.move_toward_target();
        }
        
        return false; // Still in progress
    }

    interrupt() {
        super.interrupt();
        console.log(`AStarMoveAction (${this.myte?.id}): Interrupted.`);
        this._actionComplete = true;
    }
    
    cancel() {
        super.cancel();
        console.log(`AStarMoveAction (${this.myte?.id}): Cancelled.`);
        this._actionComplete = true;
    }
}
