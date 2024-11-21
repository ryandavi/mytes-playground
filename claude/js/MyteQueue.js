class QueueItem {
    constructor(options = {}) {
        this.action = options.action || null;
        this.duration = options.duration || 0;
        this.currentDuration = options.currentDuration || -1;
        this.element = options.element || null;
        this.target = options.target || null;
        this.repeat = options.repeat || 1;
        this.direction = options.direction || null;
        this.totalTime = 0;
        this.mapObject = options.mapObject || null;
        this.actionType = options.actionType || null;
    }
}

class MyteQueue {
    constructor(myte) {
        this.myte = myte;
        this.queue = [];
        this.isDoingAction = false;
        this.maxTotalTime = 1500;
    }

	isEmpty() {
        return this.queue.length === 0;
    }

    count() {
        return this.queue.length;
    }

    getCurrentAction() {
        return this.isEmpty() ? null : this.queue[0];
    }

    // Queue Management Methods
    add(action) {
        this.queue.push(action);
    }

    addToFront(action) {
        this.queue.unshift(action);
    }

    clear() {
        this.queue.forEach(item => {
            if (item.mapObject) {
                item.mapObject.unselect();
            }
        });
        this.queue = [];
        this.isDoingAction = false;
    }


    // Queue Action Creation Methods
    addIdle(duration = 200) {
        this.add(new QueueItem({
            action: "idle",
            duration: duration
        }));
    }

    addExpression(type, duration = 50, repeat = 1) {
        this.add(new QueueItem({
            action: "do_expression",
            actionType: type,
            duration: duration,
            repeat: repeat
        }));
    }

    addExpressionToFront(type, duration = 50) {
        this.addToFront(new QueueItem({
            action: "do_expression",
            actionType: type,
            duration: duration
        }));
    }

    addMoveToElement(element, duration = 200, mapObject = null) {
        if (!element) return false;

        const destination = this.calculateElementDestination(element);
        const direction = this.calculateApproachDirection(destination);
        const target = this.calculateTargetPosition(destination, direction);

        this.add(new QueueItem({
            action: mapObject ? "move_to_map_object" : "move",
            duration: duration,
            element: element,
            direction: direction,
            target: [target],
            mapObject: mapObject
        }));
    }

    addRunLaps(element) {
        if (!element) return false;

        const elementRect = this.myte.container.getLocalOffset(element);
        const myteRect = this.myte.getRect();

        // Skip if element is too small
        if (elementRect.width * 2 < myteRect.width) return false;

        const vertical = this.getVerticalPlacement(element, elementRect);
        const horizontal = this.getHorizontalPlacement(elementRect, myteRect);
        const verticalInside = vertical === 'bottom';

        const target1 = this.calculateLapPosition(myteRect, elementRect, horizontal, vertical, verticalInside);
        const target2 = this.calculateLapPosition(myteRect, elementRect, 
                                                this.getOppositeDirection(horizontal), 
                                                vertical, verticalInside);

        // Validate targets
        if (target1.y < 0 || target2.y < 0) return false;

        this.add(new QueueItem({
            action: "run_laps",
            target: [target1, target2],
            currentTargetIndex: 0,
            element: element,
            repeat: Math.floor(Math.random() * 8) + 2 // 2-10 laps
        }));
    }

    // Queue Processing Methods
	update() {
        if (this.isEmpty()) return;

        const currentAction = this.getCurrentAction();
        if (!currentAction) return;

        // Track action duration
        currentAction.totalTime = (currentAction.totalTime || 0) + 1;
        
        if (currentAction.totalTime > this.maxTotalTime) {
            this.removeCurrentAction();
            this.addExpressionToFront("surprise");
            return;
        }

        // Process action
        if (this.isMovementAction(currentAction.action)) {
            if (this.myte.movement.isAtTarget()) {
                this.completeMovementAction(currentAction);
            } else {
                this.processMovementAction(currentAction);
            }
        } else {
            this.processNonMovementAction(currentAction);
        }
    }

    processMovementAction(action) {
        if (action.target && action.target.length > 0) {
            const currentTarget = action.target[action.currentTargetIndex || 0];
            this.myte.movement.setTarget(currentTarget.x, currentTarget.y);
        }
    }

	processNonMovementAction(action) {
        if (!action.duration) {
            this.removeCurrentAction();
            return;
        }

        if (action.currentDuration === undefined) {
            action.currentDuration = action.duration;
            if (action.direction) {
                this.myte.setDirection(action.direction);
            }
        }

        if (action.currentDuration > 0) {
            action.currentDuration--;
        } else {
            this.completeAction(action);
        }
    }

    shouldCompleteAction(action) {
        switch (action.action) {
            case "idle":
            case "move":
                return true;
            case "move_to_map_object":
                action.mapObject.remove();
                return true;
            case "do_expression":
                action.repeat--;
                action.currentDuration = -1;
                return action.repeat <= 0;
            case "run_laps":
                return this.processRunLaps(action);
            default:
                return false;
        }
    }

    processRunLaps(action) {
        action.repeat--;
        if (action.repeat > 0) {
            action.currentTargetIndex = (action.currentTargetIndex + 1) % action.target.length;
            this.setNewTarget(action);
            return false;
        }
        return true;
    }

    // Helper Methods
    getCurrentAction() {
        return this.isEmpty() ? null : this.queue[0];
    }

    skipCurrentAction() {
        if (this.isEmpty()) return;
        
        const current = this.getCurrentAction();
        if (current.mapObject) {
            current.mapObject.unselect();
        }
        
        this.queue.shift();
        this.isDoingAction = false;

        if (!this.isEmpty()) {
            this.prepareNextAction();
        }
    }

    prepareNextAction() {
        const next = this.getCurrentAction();
        if (next && next.target) {
            const targetIndex = next.currentTargetIndex || 0;
            this.myte.movement.setTarget(next.target[targetIndex]);
        }
    }

    setNewTarget(action) {
        if (!action.target || !action.target[action.currentTargetIndex]) return;
        const target = action.target[action.currentTargetIndex];
        this.myte.movement.setTarget(target);
    }

    isMovementAction(action) {
        return ['move', 'move_to_map_object', 'run_laps'].includes(action);
    }

    // Position Calculation Methods
    calculateElementDestination(element) {
        return this.myte.container.getLocalOffset(element);
    }

    calculateApproachDirection(destination) {
        const mytePos = this.myte.movement.position;
        return mytePos.x < destination.x ? DIRECTION.RIGHT : DIRECTION.LEFT;
    }

    calculateTargetPosition(destination, direction) {
        const myteRect = this.myte.getRect();
        const offset = 35;
        
        return {
            x: direction === DIRECTION.RIGHT ? 
               destination.x - myteRect.width + offset :
               destination.x + destination.width - offset,
            y: destination.y + destination.height - myteRect.height
        };
    }

    getVerticalPlacement(element, elementRect) {
        return element.tagName.toLowerCase() === 'input' ? 'top' : 'bottom';
    }

    getHorizontalPlacement(elementRect, myteRect) {
        const myteCenterX = this.myte.movement.position.x + (myteRect.width / 2);
        const elementCenterX = elementRect.x + (elementRect.width / 2);
        return myteCenterX < elementCenterX ? 'left' : 'right';
    }

    getOppositeDirection(direction) {
        const opposites = {
            left: 'right',
            right: 'left',
            top: 'bottom',
            bottom: 'top'
        };
        return opposites[direction] || direction;
    }

    calculateLapPosition(myteRect, elementRect, horizontal, vertical, verticalInside) {
        const offsets = {
            horizontal: 35,
            vertical: 35
        };

        const positions = {
            x: horizontal === 'left' ? 
               elementRect.x - (verticalInside ? 0 : myteRect.width) + offsets.horizontal :
               elementRect.x + elementRect.width - (verticalInside ? myteRect.width : 0) - offsets.horizontal,
            y: vertical === 'top' ?
               elementRect.y - (verticalInside ? 0 : myteRect.height) + offsets.vertical :
               elementRect.y + elementRect.height - (verticalInside ? myteRect.height : 0) + offsets.vertical
        };

        return positions;
    }

    isMovementAction(action) {
        return ['move', 'move_to_map_object', 'run_laps'].includes(action);
    }

    completeMovementAction(action) {
        if (action.action === "run_laps") {
            action.repeat = (action.repeat || 1) - 1;
            if (action.repeat > 0) {
                action.currentTargetIndex = ((action.currentTargetIndex || 0) + 1) % action.target.length;
                this.processMovementAction(action);
                return;
            }
        }
        this.removeCurrentAction();
    }

    removeCurrentAction() {
        if (this.isEmpty()) return false;

        const current = this.getCurrentAction();
        if (current?.mapObject) {
            current.mapObject.unselect();
        }

        this.queue.shift();
        this.isDoingAction = false;

        if (!this.isEmpty()) {
            this.prepareNextAction();
        }
        return true;
    }

	completeAction(action) {
        switch (action.action) {
            case "do_expression":
                action.repeat = (action.repeat || 1) - 1;
                if (action.repeat > 0) {
                    action.currentDuration = action.duration;
                    return;
                }
                break;
        }
        this.removeCurrentAction();
    }


}