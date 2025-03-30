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