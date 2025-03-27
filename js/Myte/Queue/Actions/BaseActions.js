// Base Action class that all actions inherit from
class MyteAction {
    static metadata = {
        id: null,
        label: null,
        category: 'default',
        priority: 0,
        isMovementAction: false,
        isInterruptible: false,
        defaultDuration: 0,
        description: null,
        requiresTarget: false,
        affectsMood: false,
        moodEffect: 0
    };


    constructor(myte, options = {}) {
        this.myte = myte;
        this.duration = 0;
        this.current_duration = -1;
        this.total_time = 0;
        this.userInitiated = false;
        this.onComplete = null;

        // Apply options and then apply defaults
        Object.assign(this, options, {
            duration: options.duration ?? this.constructor.metadata.defaultDuration,
        });

        // Apply mood effects if configured
        if (this.constructor.metadata.affectsMood) {
            this.myte.stats.updateMood(this.constructor.metadata.moodEffect);
        }
    }

    static getRequiredOptions(selected, active) {
        // Return specific options needed for this action
        return {};
    }
    static canAddToQueue(selected, active) {
        return true;
    }

    static canPerform(selected, active) {
        return false;
    }

    start() {
        if (this.duration > 0) {
            if (this.current_duration === -1) {
                this.current_duration = this.duration;
            }
        }
    }

    update() {
        return true;
    }

    complete() {
        if (this.onComplete !== null) {
            this.onComplete();
        }
        return true;
    }

}

class MoveAction extends MyteAction {
    static metadata = {
        id: 'move',
        label: 'Move To',
        category: 'movement',
        priority: 1,
        isMovementAction: true,
        isInterruptible: true,
        defaultDuration: 0,
        description: 'Move to a specific location',
        requiresTarget: true,
        affectsMood: false
    };

    static canPerform(selected, active) {
        return false; // active && !active.queue?.isCarrying();
    }

    constructor(myte, options) {
        super(myte, options);

        if (!options?.target?.length) {
            throw new Error('MoveAction requires at least one target position');
        }

        this.targets = options.target;
        this.targetIndex = 0;
    }

    start() {
        super.start();
        
        // If we have complex collisions, use A* pathfinding
        if (this.myte.checkForCollisions && this.myte.parent.gameMap) {
            const path = this.myte.parent.gameMap.gridSystem.pathfinder.findPath(
                this.myte.posX, 
                this.myte.posY,
                this.targets[this.targetIndex].x,
                this.targets[this.targetIndex].y,
                this.myte.collider.width,
                this.myte.collider.height
            );
            
            if (path) {
                // Replace direct target with path waypoints
                this.targets = path;
                this.targetIndex = 0;
            }
        }
        
        this.setNextTarget();
        this.myte.reset();
    }

    update() {
        if (this.myte.is_at_target()) {
            this.targetIndex++;
            return !this.setNextTarget();
        }
        this.myte.move_toward_target();
        return false;
    }

    setNextTarget() {
        if (this.targets[this.targetIndex]) {
            const { x, y } = this.targets[this.targetIndex];
            this.myte.setTarget(x, y);
            return true;
        }
        return false;
    }
}

class AStarMoveAction extends MyteAction {
    static metadata = {
        id: 'astar-move',
        label: 'Move To (A*)',
        category: 'movement',
        priority: 1,
        isMovementAction: true,
        isInterruptible: true,
        defaultDuration: 0,
        description: 'Move to a specific location using A* pathfinding',
        requiresTarget: true,
        affectsMood: false
    };

    constructor(myte, options) {
        super(myte, options);

        // Process target information from options
        this.finalTarget = this.processTarget(options.target);
        
        // Path properties
        this.path = null;
        this.currentPathIndex = 0;
        this.currentTarget = null;

        // Pathfinding properties - safely get the pathfinder
        if (this.myte.parent && this.myte.parent.gameMap && this.myte.parent.gameMap.gridSystem) {
            this.pathfinder = this.myte.parent.gameMap.gridSystem.pathfinder;
        } else {
            console.error("AStarMoveAction: Could not find pathfinder in grid system");
            this.pathfinder = null;
        }
        
        this.maxPathRetries = options.maxPathRetries || 3;
        this.pathRetries = 0;

        // Movement tolerance
        this.reachTargetTolerance = options.reachTargetTolerance || 5;

        // Whether to recalculate path when straying too far
        this.recalculateOnDeviation = options.recalculateOnDeviation !== false;
        this.maxDeviationDistance = options.maxDeviationDistance || 50;

        // Debug settings
        this.debugMode = options.debugMode || false;
    }

    // Helper method to process different types of targets
    processTarget(target) {
        if (!target) return null;
        
        // If target is an array of positions
        if (Array.isArray(target)) {
            // If it's an array of arrays (multi-point path)
            if (Array.isArray(target[0])) {
                return {
                    x: target[0][0],
                    y: target[0][1]
                };
            }
            // If it's an array with a single object with x, y coordinates
            else if (target.length > 0 && typeof target[0] === 'object' && 'x' in target[0] && 'y' in target[0]) {
                return target[0];
            }
            // If it's a simple [x, y] coordinate pair
            else if (target.length >= 2 && typeof target[0] === 'number' && typeof target[1] === 'number') {
                return {
                    x: target[0],
                    y: target[1]
                };
            }
        }
        // If target is an object with x, y properties (like a position object)
        else if (typeof target === 'object' && 'x' in target && 'y' in target) {
            return {
                x: target.x,
                y: target.y
            };
        }
        // If target is a Myte or MapObject
        else if (typeof target === 'object' && ('posX' in target || 'posY' in target)) {
            return {
                x: target.posX,
                y: target.posY
            };
        }

        console.error("AStarMoveAction: Could not process target", target);
        return null;
    }

    static canPerform(selected, active) {
        return active && 
               active.parent && 
               active.parent.gameMap && 
               active.parent.gameMap.gridSystem && 
               active.parent.gameMap.gridSystem.pathfinder;
    }

    start() {
        super.start();

        // If no pathfinder available, cancel the action
        if (!this.pathfinder) {
            console.error("AStarMoveAction: No pathfinder available");
            return false;
        }

        // If no target provided, cancel the action
        if (!this.finalTarget) {
            console.error("AStarMoveAction: No target provided");
            return false;
        }

        // Reset the Myte's movement state
        this.myte.reset();

        // Calculate initial path and check validity
        if (!this.calculatePath()) {
            console.warn("AStarMoveAction: No valid path found");
            return false;
        }

        // Set the first target point
        this.updateCurrentTarget();

        return true;
    }

    update() {
        // If we don't have a path yet, attempt to calculate one
        if (!this.path || this.path.length === 0) {
            if (this.pathRetries >= this.maxPathRetries) {
                console.warn("AStarMoveAction: Max path retries reached, cancelling action");
                this.clearPathVisualization();
                return true; // End the action
            }

            this.pathRetries++;
            if (!this.calculatePath()) {
                this.clearPathVisualization();
                return true; // End the action if no path found
            }
        }

        // Check if we've reached the current target point
        if (this.hasReachedCurrentTarget()) {
            // Move to the next point in the path
            this.currentPathIndex++;

            // If we've reached the end of the path, we're done
            if (this.currentPathIndex >= this.path.length) {
                this.clearPathVisualization();
                return true; // Action complete
            }

            // Update to the next target
            this.updateCurrentTarget();
        }

        // Check if we've deviated too far from the path
        if (this.recalculateOnDeviation && this.hasDeviatedFromPath()) {
            this.calculatePath();
        }

        // Move toward the current target
        this.moveTowardCurrentTarget();

        return false; // Action not complete yet
    }

    calculatePath() {
        // Make sure we have all necessary components
        if (!this.pathfinder || !this.finalTarget) {
            return false;
        }

        // Get current position and final target
        const startX = this.myte.posX;
        const startY = this.myte.posY;
        const endX = this.finalTarget.x;
        const endY = this.finalTarget.y;

        // Use collider dimensions if available, otherwise use size
        const width = (this.myte.collider && this.myte.collider.width) || this.myte.size.width;
        const height = (this.myte.collider && this.myte.collider.height) || this.myte.size.height;

        // Calculate path using A* pathfinding
        this.path = this.pathfinder.findPath(
            startX, startY,
            endX, endY,
            width, height
        );

        // Reset the path index
        this.currentPathIndex = 0;

        // Check if a valid path was found
        if (!this.path || this.path.length === 0) {
            console.warn(`AStarMoveAction: Failed to find path from (${startX},${startY}) to (${endX},${endY})`);
            return false;
        }

        // Visualize the path if in debug mode
        this.visualizePath();

        return true;
    }

    visualizePath() {
        // Only visualize if debug mode is on and we have a valid path
        if (this.debugMode && this.path && this.path.length > 0) {
            const debugLayer = this.getDebugLayer();
            if (debugLayer) {
                // Clear previous path visualization first
                this.clearPathVisualization();
                // Visualize the new path
                this.pathfinder.visualizePath(debugLayer, this.path);
            }
        }
    }

    getDebugLayer() {
        // Try different ways to access the debug layer
        if (this.myte.parent && this.myte.parent.parent && this.myte.parent.parent.layers) {
            return this.myte.parent.parent.layers.debug;
        } else if (this.myte.parent && this.myte.parent.layers) {
            return this.myte.parent.layers.debug;
        }
        return null;
    }

    updateCurrentTarget() {
        if (this.path && this.currentPathIndex < this.path.length) {
            this.currentTarget = this.path[this.currentPathIndex];
            this.myte.setTarget(this.currentTarget.x, this.currentTarget.y);
        }
    }

    hasReachedCurrentTarget() {
        if (!this.currentTarget) return false;

        const dx = this.myte.posX - this.currentTarget.x;
        const dy = this.myte.posY - this.currentTarget.y;
        const distanceSquared = dx * dx + dy * dy;

        return distanceSquared <= (this.reachTargetTolerance * this.reachTargetTolerance);
    }

    hasDeviatedFromPath() {
        if (!this.path || this.currentPathIndex >= this.path.length) return false;

        // Find the nearest point on the remaining path
        let minDistance = Number.MAX_VALUE;
        
        // Check distance to each upcoming point in the path
        for (let i = this.currentPathIndex; i < this.path.length; i++) {
            const pathPoint = this.path[i];
            const dx = this.myte.posX - pathPoint.x;
            const dy = this.myte.posY - pathPoint.y;
            const distanceSquared = dx * dx + dy * dy;

            if (distanceSquared < minDistance) {
                minDistance = distanceSquared;
            }
        }

        // If we're too far from the path, we need to recalculate
        return Math.sqrt(minDistance) > this.maxDeviationDistance;
    }

    moveTowardCurrentTarget() {
        if (!this.currentTarget) return;

        // Standard move toward target
        this.myte.move_toward_target();
    }

    complete() {
        // Clean up path visualization
        this.clearPathVisualization();
        
        // Call parent's complete method
        return super.complete();
    }

    clearPathVisualization() {
        if (this.debugMode) {
            const debugLayer = this.getDebugLayer();
            if (debugLayer) {
                const pathNodes = debugLayer.querySelectorAll('.path-node');
                pathNodes.forEach(node => node.remove());
            }
        }
    }
}

// New base class for actions that need positioning
class PositionableAction extends MyteAction {

    static metadata = {
        id: 'positionable',
        label: 'Position',
        category: 'movement',
        priority: 1,
        isMovementAction: true,
        isInterruptible: true,
        defaultDuration: 0,
        description: 'Base class for position-based actions',
        requiresTarget: true,
        affectsMood: false
    };

    constructor(myte, options) {
        super(myte, options);

        // Validate target if required
        if (this.constructor.metadata.requiresTarget && !options.target) {
            throw new Error(`${this.constructor.name} requires a target`);
        }
    }

    static canPerform(selected, active) {
        return false;
    }

    getCanvasBounds() {
        const canvasRect = this.myte.parent.getCanvasRect();
        return {
            width: canvasRect.width,
            height: canvasRect.height,
            x: 0,
            y: 0
        };
    }

    isWithinBounds(position, myteRect) {
        const bounds = this.getCanvasBounds();
        return (
            position.x >= bounds.x &&
            position.x + myteRect.width <= bounds.width &&
            position.y >= bounds.y &&
            position.y + myteRect.height <= bounds.height
        );
    }

    adjustPositionToBounds(position, myteRect, targetRect) {
        const bounds = this.getCanvasBounds();
        let horizontal = this.getClosestSideHorizontal(targetRect, myteRect);
        let vertical = 'bottom';

        // Adjust horizontal position if out of bounds
        if (position.x + myteRect.width > bounds.width || position.x < bounds.x) {
            horizontal = (position.x < bounds.x) ? 'right' : 'left';
            position = this.calculatePosition(myteRect, targetRect, horizontal, vertical, false, true);
        }

        // Adjust vertical position if out of bounds
        if (position.y + myteRect.height > bounds.height || position.y < bounds.y) {
            vertical = (position.y < bounds.y) ? 'bottom' : 'top';
            position = this.calculatePosition(myteRect, targetRect, horizontal, vertical, false, true);
        }

        return {
            position,
            horizontal,
            vertical
        };
    }

    getRect(target) {

        if (target instanceof Myte) {
            return target.getOffsetRect();
        } else if (target instanceof MapObject) {
            return this.myte.parent.getLocalOffset(target.element);
        } else if (target instanceof Element) {
            return this.myte.parent.getLocalOffset(target);
        } else {
            return this.myte.parent.getLocalOffset(target);
        }
    }

    getClosestSideHorizontal(destination_rect, myte_rect) {
        return this.myte.posX + (myte_rect.width / 2) < destination_rect.x + (destination_rect.height / 2) ? 'left' : 'right';
    }

    getClosestSideVertical(destination_rect, myte_rect) {
        const myteCenterY = this.myte.posY + (myte_rect.height / 2);
        const destinationCenterY = destination_rect.y + (destination_rect.height / 2);
        return myteCenterY < destinationCenterY ? 'top' : 'bottom';
    }

    getOpposite(side) {
        switch (side) {
            case 'left': return 'right';
            case 'right': return 'left';
            case 'top': return 'bottom';
            case 'bottom': return 'top';
            default: return null;
        }
    }
    calculatePosition(myteRect, destinationRect, horizontal = "center", vertical = "middle", insideHorizontal = false, insideVertical = false) {
        // this is so it appears to be within
        let myteOffset = {
            left: (insideHorizontal ? -1 : 1) * 35,
            right: (insideHorizontal ? -1 : 1) * 35,
            top: (insideVertical ? -1 : 1) * 35,
            bottom: (insideVertical ? 1 : -1) * 35
        };


        const positions = {
            left: destinationRect.x - (insideHorizontal ? 0 : myteRect.width) + myteOffset.left,
            center: destinationRect.x + (destinationRect.width / 2) - (myteRect.width / 2),
            right: destinationRect.x + destinationRect.width - (insideHorizontal ? myteRect.width : 0) - myteOffset.right,

            top: destinationRect.y - (insideVertical ? 0 : myteRect.height) + myteOffset.top,
            middle: destinationRect.y + (destinationRect.height / 2) - (myteRect.height / 2),
            bottom: destinationRect.y + destinationRect.height - (insideVertical ? myteRect.height : 0) + myteOffset.bottom
        };

        return {
            x: positions[horizontal] || positions.center,
            y: positions[vertical] || positions.bottom
        };
    }
}

// Action for idle state
class IdleAction extends MyteAction {
    static metadata = {
        id: 'idle',
        label: 'Idle',
        category: 'state',
        priority: 0,
        isMovementAction: false,
        isInterruptible: true,
        defaultDuration: 200,
        description: 'Stay in place for a moment',
        requiresTarget: false,
        affectsMood: false
    };

    static canPerform(selected, active) {
        return active && selected === active;
    }

    update() {
        if (this.current_duration === -1) {
            this.current_duration = this.duration;
        }
        this.current_duration--;
        return this.current_duration <= 0;
    }
}

// Action for expressing emotions/animations
class ExpressionAction extends MyteAction {
    static metadata = {
        id: 'expression',
        label: 'Express',
        category: 'state',
        priority: 2,
        isMovementAction: false,
        isInterruptible: false,
        defaultDuration: 50,
        description: 'Show an emotion or expression',
        requiresTarget: false,
        affectsMood: true,
        moodEffect: 5
    };

    static canPerform(selected, active) {
        return active && selected === active;
    }

    constructor(myte, options) {
        super(myte, options);
        this.type = options.action_type;
        this.repeat = options.repeat || 1;
    }

    update() {
        this.current_duration--;

        if (this.current_duration <= 0) {
            this.repeat--;
            if (this.repeat <= 0) {
                // complete
                return true;
            }
            this.current_duration = this.duration;
        }
        return false;
    }
}