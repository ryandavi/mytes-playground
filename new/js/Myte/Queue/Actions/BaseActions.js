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
        this.options = {
            duration: options.duration || this.constructor.metadata.defaultDuration,
            current_duration: -1,
            total_time: 0,
            userInitiated: false,
            ...options
        };

        // Apply mood effects if configured
        if (this.constructor.metadata.affectsMood) {
            this.myte.updateMood(this.constructor.metadata.moodEffect);
        }
    }

    start() {
        if (this.options.duration > 0) {
            if (this.options.current_duration === -1) {
                this.options.current_duration = this.options.duration;
            }
        }
    }

    update() {
        return true;
    }

    complete() {
        if (this.options.onComplete) this.options.onComplete();
        return true;
    }

    isMovementAction() {
        return this.constructor.metadata.isMovementAction;
    }

    isInterruptible() {
        return this.constructor.metadata.isInterruptible;
    }

    static canPerform(selected, active) {
        return true;
    }
}

// Action for basic movement
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
        return active && !active.queue.isCarrying();
    }

    constructor(myte, options) {
        super(myte, options);
        if (!options.target?.[0]) {
            throw new Error('MoveAction requires a target position');
        }
        this.target = options.target[0];
    }

    start() {
        super.start();
        this.myte.setTarget(this.target.x, this.target.y);
        this.myte.reset();
    }

    update() {
        if (this.myte.is_at_target()) {
            return true;
        }
        this.myte.move_toward_target();
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

    getTargetRect(targetObject) {
        if (targetObject instanceof Myte) {
            return targetObject.getOffsetRect();
        } else if (targetObject instanceof MapObject) {
            return this.myte.parent.getLocalOffset(targetObject.element);
        } else {
            return this.myte.parent.getLocalOffset(targetObject);
        }
    }

    getClosestSideHorizontal(destination_rect, myte_rect) {
        return this.myte.posX + (myte_rect.width/2) < destination_rect.x + (destination_rect.height / 2) ? 'left' : 'right';
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
        const myteOffset = {
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

        // Handle special case where horizontal value should be assigned to y
        if (!positions[horizontal] && typeof horizontal === 'number') {
            return {
                x: positions.center,
                y: horizontal
            };
        }

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
        if (this.options.current_duration === -1) {
            this.options.current_duration = this.options.duration;
        }
        this.options.current_duration--;
        return this.options.current_duration <= 0;
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
        this.options.repeat = options.repeat || 1;
    }

    update() {
        this.options.current_duration--;

        if (this.options.current_duration <= 0) {
            this.options.repeat--;
            if (this.options.repeat <= 0) {
                // complete
                return true;
            }
            this.options.current_duration = this.options.duration;
        }
        return false;
    }
}