
class QueueItem {
    constructor({ action = null, current_duration = -1, total_time = 0 } = {}) {
        this.action = action;
        this.current_duration = current_duration;
        this.total_time = total_time;
    }
}

class MyteQueue {
    constructor(myte) {
        this.myte = myte;
        this.queue = [];
        this.isDoingAction = false;
        this.max_total_time = 1500;
    }

    addInteraction(targetMyte, interactionType) {
        const interaction = this.myte.interactionAnimations[interactionType];
        if (!interaction) return false;

        // Add movement to get in position
        this.add({
            action: 'move_to_myte',
            targetMyte: targetMyte,
            interactionType: interactionType
        });

        // Add the interaction animation
        this.add({
            action: 'do_interaction',
            targetMyte: targetMyte,
            interactionType: interactionType,
            animation: interaction.animation,
            duration: interaction.duration
        });

        return true;
    }

    // Basic queue operations
    add(action) {
        this.queue.push(action);
    }

    // Previously: addToBeginning(x)
    addToBeginning(action) {
        this.queue.unshift(action);
    }

    count() {
        return this.queue.length;
    }

    isEmpty() {
        return this.queue.length === 0;
    }

    // No change: clear()
    clear() {

        // loop through queue
        for (let i = 0; i < this.queue.length; i++) {
            let obj = this.queue[i];
            if (obj.mapObject) obj.mapObject.unselect();
        }

        this.queue = [];
        console.log("Cleared queue");
        this.isDoingAction = false;
    }

    hasElement(elementToCheck) {
        return this.queue.some(item => item.element === elementToCheck);
    }

    // New helper method
    createAction(type, options = {}) {
        return {
            action: type,
            duration: options.duration || 200,
            current_duration: -1,
            ...options
        };
    }

    // Queue addition methods
    addIdle(duration = 200) {
        this.add(this.createAction("idle", { duration }));
    }

    // Previously: add_expression(type, duration = 50)
    addExpression(type, duration = 50, repeat = 1) {
        this.add(this.createAction("do_expression", { action_type: type, duration, repeat }));
    }

    // Previously: add_expression_to_beginning(type, duration = 50)
    addExpressionToBeginning(type, duration = 50) {
        this.addToBeginning(this.createAction("do_expression", { action_type: type, duration }));
    }


    addRunLaps(element = null) {
        if (element == null) return false;

        // rects
        const destination_rect = this.myte.parent.getLocalOffset(element);
        const myte_rect = this.myte.getRect();

        // if it's not wide enough to run on, skip it
        if (destination_rect.width * 2 < myte_rect.width) return false;

        // placement
        let vertical = Utility.isTopOnlyTag(element) ? 'top' : this.getClosestSideVertical(destination_rect, myte_rect);
        let verticalInside = (vertical == 'bottom' ? true : false);
        let horizontal = this.getClosestSideHorizontal(destination_rect, myte_rect);

        // get targets
        let target_1 = this.calculatePosition(myte_rect, destination_rect, horizontal, vertical, true, verticalInside);
        let target_2 = this.calculatePosition(myte_rect, destination_rect, this.getOpposite(horizontal), vertical, true, verticalInside);

        // don't add if we can't get to it
        if (target_1.y < 0 || target_2.y < 0) return false;

        // add
        this.add(this.createAction("run_laps", {
            target: [target_1, target_2],
            current_target_index: 0,
            duration: 0,
            element: element,
            repeat: Utility.random_int(2, 10),
            total_time: 0
        }));

    }

    addMoveToElementExtra(element = null, duration = 1) {
        if (element == null) return false;
        let destination_rect = this.myte.parent.getLocalOffset(element);
        let myte_rect = this.myte.getRect();

        // random
        let randomX = (Math.random() * (destination_rect.width - myte_rect.width)) + destination_rect.x;
        let randomY = (Math.random() * (destination_rect.height - myte_rect.height)) + destination_rect.y;

        let vertical = 'bottom';
        if (Utility.isTopOnlyTag(destination_rect)) {
            vertical = 'top';
        }


        this.add(this.createAction("move_to_element", {
            duration: duration,
            element: element,
            direction: direction,
            target: [target],
            total_time: 0
        }));
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

    addMoveToElement(element = null, duration = 1, mapObject) {

        if (element == null) return false;

        // rects
        const destination_rect = this.myte.parent.getLocalOffset(element);
        const myte_rect = this.myte.getRect();
        const canvas_width = this.myte.parent.getCanvasRect().width;

        // location
        let horizontal = this.getClosestSideHorizontal(destination_rect, myte_rect);
        let vertical = 'bottom';

        // initial target
        let target = this.calculatePosition(myte_rect, destination_rect, horizontal, vertical, false, true);
        let direction = (horizontal === 'left' ? DIRECTION.RIGHT : DIRECTION.LEFT);

        // Check boundaries and adjust position and direction and adjust
        if (target.x + myte_rect.width > canvas_width || target.x < 0) {
            horizontal = (target.x < 0) ? 'right' : 'left';
            target = this.calculatePosition(myte_rect, destination_rect, horizontal, vertical, false, true);
            direction = (horizontal === 'left' ? DIRECTION.RIGHT : DIRECTION.LEFT);
        }

        // type
        let actionType = mapObject ? "move_to_map_object" : "move";

        // add
        this.add(this.createAction(actionType, {
            duration: duration,
            element: element,
            direction: direction,
            target: [target],
            mapObject: mapObject,
            total_time: 0
        }));
    }


    calculatePosition(myteRect, destinationRect, horizontal = "center", vertical = "middle", insideHorizontal = false, insideVertical = false) {

        // Adjust the offset of the myte so it appears closer
        let myteOffset = {
            left: (insideHorizontal ? -1 : 1) * 35,
            right: (insideHorizontal ? -1 : 1) * 35,
            top: (insideVertical ? -1 : 1) * 35,
            bottom: (insideVertical ? 1 : -1) * 35
        };

        const positions = {
            // horizontal
            left: destinationRect.x - (insideHorizontal ? 0 : myteRect.width) + myteOffset.left,
            center: destinationRect.x + (destinationRect.width / 2) - (myteRect.width / 2),
            right: destinationRect.x + destinationRect.width - (insideHorizontal ? myteRect.width : 0) - myteOffset.right,

            // vertical
            top: destinationRect.y - (insideVertical ? 0 : myteRect.height) + myteOffset.top,
            middle: destinationRect.y + (destinationRect.height / 2) - (myteRect.height / 2),
            bottom: destinationRect.y + destinationRect.height - (insideVertical ? myteRect.height : 0) + myteOffset.bottom
        };

        let x, y;

        switch (horizontal) {
            case 'left':
                x = positions.left;
                break;
            case 'middle':
                x = positions.center;
                break;
            case 'center':
                x = positions.center;
                break;
            case 'right':
                x = positions.right;
                break;
            default:
                y = horizontal;
        }

        switch (vertical) {
            case 'top':
                y = positions.top;
                break;
            case 'middle':
                y = positions.middle;
                break;
            case 'center':
                y = positions.middle;
                break;
            case 'bottom':
                y = positions.bottom;
                break;
            default:
                y = vertical;
        }

        return { x, y };
    }


    // Queue execution methods
    canCompleteCurrentAction() {
        const current = this.getCurrentAction();
        if (!current) return false;

        // set duration if unset
        if (current.duration && current.current_duration > 0) return false;

        // complete
        console.log('complete', current.action);
        this.isDoingAction = false;

        // what to do upon completion
        switch (current.action) {

            case 'move_to_myte':
                // move to myte
            case 'do_interaction':
                // do interaction
            case "idle":
                return true;
            case "move":
                return true;
            case "move_to_map_object":
                current.mapObject.remove();
                return true;
            case "move_to_side":
                return true;
            case "do_expression":
                return this.completeExpression(current);
            case "slide_down":
                return this.completeSlideDown(current);
            case "run_laps":
                return this.completeRunLaps(current);
            default:
                return false;
        }

    }



    completeExpression(current) {
        current.repeat--;
        current.current_duration = -1;
        current.total_time = 0;
        return current.repeat === 0;
    }

    completeSlideDown(current) {
        current.current_target_index++;
        if (current.current_target_index > current.target.length - 1) {
            return true;
        }
        this.setTarget(current);
        return false;
    }

    completeRunLaps(current) {
        current.repeat--;
        if (current.repeat > 0) {
            current.current_target_index = (current.current_target_index + 1) % current.target.length;
            this.setTarget(current);
            current.total_time = 0;
            return false;
        }
        return true;
    }

    setTarget(current) {
        const target = current.target[current.current_target_index];
        this.myte.setTarget(target.x, target.y);
    }

    // Previously: prep_current()
    prepCurrentAction() {
        const current = this.getCurrentAction();
        if (current && current.target) {
            const targetIndex = current.target.length > 1 ? current.current_target_index : 0;
            const target = current.target[targetIndex];
            this.myte.reset();
            this.myte.setTarget(target.x, target.y);
        }
    }


    // Add this to your isMovementAction method
    isMovementAction(z) {
        return z == "move" ||
            z == "move_to_map_object" ||
            z == "run_laps" ||
            z == "slide_down" ||
            z == "move_to_side" ||
            z == "follow_object" ||
            z == "move_with_pathfinding";  // Add this line
    }

    isInteruptableAction(z) {
        return z == "follow_object";
    }



    addFollowObject(element){
        this.add(this.createAction("follow_object", {
            targetObject: element
        }));

        console.log(element.constructor.name);
    }

    addMoveWithPathFinding(element = null, duration = 1, mapObject = null) {
        if (element == null) return false;

        const destination_rect = this.myte.parent.getLocalOffset(element);
        const targetX = destination_rect.x;
        const targetY = destination_rect.y;

        const path = this.myte.pathFindingSystem.findPath(
            this.myte.posX,
            this.myte.posY,
            targetX,
            targetY
        );

        if (!path) {
            console.log("No path found to destination");
            this.addExpression("surprise");
            return false;
        }

        this.add(this.createAction("move_with_pathfinding", {
            duration: duration,
            element: element,
            path: path,
            currentPathIndex: 0,
            originalTarget: {
                x: targetX,
                y: targetY
            },
            target: [{ x: path[0].x, y: path[0].y }],
            mapObject: mapObject,
            total_time: 0,
            // Add stuck detection properties
            lastProgressPos: { x: this.myte.posX, y: this.myte.posY },
            lastProgressTime: Date.now(),
            stuckDuration: 0,
            pathfindingAttempts: 0,
            maxPathfindingAttempts: 3,
            stuckThreshold: 1000 // 1 second before considering stuck
        }));

        return true;
    }

    checkIfStuck(current) {
        const now = Date.now();
        const timeSinceProgress = now - current.lastProgressTime;

        // Calculate distance moved since last progress check
        const distanceMoved = Math.hypot(
            this.myte.posX - current.lastProgressPos.x,
            this.myte.posY - current.lastProgressPos.y
        );

        // If we've moved more than 5 pixels, update progress
        if (distanceMoved > 5) {
            current.lastProgressPos = { x: this.myte.posX, y: this.myte.posY };
            current.lastProgressTime = now;
            current.stuckDuration = 0;
            return false;
        }

        // Update stuck duration if we haven't made progress
        if (timeSinceProgress > 100) { // Check every 100ms
            current.stuckDuration += timeSinceProgress;
        }

        return current.stuckDuration >= current.stuckThreshold;
    }

    attemptNewPath(current) {
        if (current.pathfindingAttempts >= current.maxPathfindingAttempts) {
            console.log("Max pathfinding attempts reached, giving up");
            return false;
        }

        const newPath = this.myte.pathFindingSystem.findPath(
            this.myte.posX,
            this.myte.posY,
            current.originalTarget.x,
            current.originalTarget.y
        );

        if (newPath) {
            current.path = newPath;
            current.currentPathIndex = 0;
            current.pathfindingAttempts++;
            current.stuckDuration = 0;
            current.lastProgressTime = Date.now();
            current.lastProgressPos = { x: this.myte.posX, y: this.myte.posY };

            // Set first waypoint of new path
            const nextPoint = newPath[0];
            this.myte.setTarget(nextPoint.x, nextPoint.y);

            console.log(`Found new path (attempt ${current.pathfindingAttempts})`);
            return true;
        }

        return false;
    }

    doCurrentAction() {
        const current = this.getCurrentAction();
        if (!current) return;

        // track how long it's taking if we set max duration
        if (current.total_time !== undefined) {
            current.total_time++;

            // if they're trying too long - skip it and be surprised
            if (current.total_time > this.max_total_time) {
                this.removeCurrentAction();
                this.addExpressionToBeginning("surprise");
                return;
            }
        }

        if (current.action === "carry") {
            // when they're carrying they don't do anything


        }else if (current.action === "being_carried") {
            // when they're being carried it doesn't do anything

        }else if (current.action === "carry_pickup") {
            // transitional animation

        }else if (current.action === "being_picked_up_for_carry") {
            // transitional animation

        }else if (current.action === "go_to_object") {

            let horizontal = (current.targetObject.direction == DIRECTION.LEFT) ? "right" : (current.targetObject.direction == DIRECTION.RIGHT) ? "left" : "center";

            let vertical = (current.targetObject.direction == DIRECTION.NORTH) ? "bottom" : (current.targetObject.direction == DIRECTION.SOUTH) ? "top" : "bottom";


            let targetPos = this.calculatePosition(
                this.myte.getRect(), 
                current.targetObject.getOffsetRect(), 
                horizontal, 
                vertical, 
                false,
                true
            );

            // move toward it
            this.myte.setTarget(targetPos.x, targetPos.y);
            this.myte.move_toward_target();


        }else if (current.action === "follow_object") {


            let horizontal = (current.targetObject.direction == DIRECTION.LEFT) ? "right" : (current.targetObject.direction == DIRECTION.RIGHT) ? "left" : "center";

            let vertical = (current.targetObject.direction == DIRECTION.NORTH) ? "bottom" : (current.targetObject.direction == DIRECTION.SOUTH) ? "top" : "bottom";


            let targetPos = this.calculatePosition(
                this.myte.getRect(), 
                current.targetObject.getOffsetRect(), 
                horizontal, 
                vertical, 
                false,
                true
            );

            // set target and move toward it
            this.myte.setTarget(targetPos.x, targetPos.y);
            this.myte.move_toward_target();

            
            if (this.myte.is_at_target()) {
                this.removeCurrentAction();
            }
            
            
            return;
        }else if (current.action === "move_with_pathfinding") {
            // Check if we're stuck
            if (this.checkIfStuck(current)) {
                console.log("Myte is stuck, attempting new path");
                if (!this.attemptNewPath(current)) {
                    // If we can't find a new path, give up
                    console.log("Unable to find new path, giving up");
                    this.removeCurrentAction();
                    this.addExpressionToBeginning("surprise");
                    return;
                }
            }

            if (this.myte.is_at_target()) {
                // Move to next point in path
                current.currentPathIndex++;

                // If we've reached the end of the path
                if (current.currentPathIndex >= current.path.length) {
                    // Double check we're actually at the final destination
                    const finalDistance = Math.hypot(
                        this.myte.posX - current.originalTarget.x,
                        this.myte.posY - current.originalTarget.y
                    );

                    if (finalDistance < 5) {
                        if (current.mapObject) {
                            current.mapObject.remove();
                        }
                        this.removeCurrentAction();
                        return;
                    } else {
                        this.myte.setTarget(current.originalTarget.x, current.originalTarget.y);
                    }
                } else {
                    // Set next waypoint as target
                    const nextPoint = current.path[current.currentPathIndex];
                    this.myte.setTarget(nextPoint.x, nextPoint.y);
                }
            }

            // Move toward current waypoint
            this.myte.move_toward_target();
            return;
        }


        // if we're at target
        if (!this.isMovementAction(current.action) || this.myte.is_at_target()) {
            if (current.duration) {
                if (current.current_duration == -1) {
                    current.current_duration = current.duration;

                    // set direction when we set the duration
                    if (current.direction) {
                        this.myte.setDirection(current.direction);
                    }
                }
                current.current_duration--;
                if (current.current_duration > 0) return false;
            }

            if (this.canCompleteCurrentAction()) {
                this.removeCurrentAction();
            }

        } else if (current.target) {
            this.myte.move_toward_target();
        }
    }


    removeCurrentAction() {
        if (this.isEmpty()) return false;

        // remove selected
        const current = this.getCurrentAction();
        if (current.mapObject) {
            current.mapObject.unselect();
        }

        this.queue.shift();
        this.isDoingAction = false;

        // if we have a queue item after removing, do the next one
        if (!this.isEmpty() && !this.isDoingAction) {
            this.prepCurrentAction();
        }
        return true;
    }

    getCurrentAction() {
        return this.isEmpty() ? null : this.queue[0];
    }
}