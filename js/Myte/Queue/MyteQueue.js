class MyteQueue {
    constructor(myte) {
        this.myte = myte;
        this.queue = [];
        this.isDoingAction = false;
        this.max_total_time = 1500;
        
    }

    count() {
        return this.queue.length;
    }

    addMoveToElement(element = null, duration = 1) {

        const destination = this.myte.parent.getLocalOffset(element);
        this.add('move', {
            target: [{
                x: destination.x,
                y: destination.y
            }],
            mapObject: element,
            duration: 300
        });
    }

    addPickupMyte(target) {
        if (!target || target.queue.isBeingCarried()) return false;

        this.add("go_to_object", {
            target: target
        });

        this.add("carry_pickup", {
            target: target,
            duration: 100
        });

        return true;
    }

    addFollowObject(element) {
        this.add("follow_object", {
            target: element
        });
    }

    addPutDownMyte() {
        const currentAction = this.getCurrentAction();
        if (!(currentAction instanceof CarryAction) || !currentAction.target) return false;

        this.clear();

        this.add("carry_putdown", {
            target: currentAction.target,
            duration: 100
        });

        return true;
    }

    add(actionId, options = {}) {
        const ActionClass = ActionManager.actions.get(actionId);
        if (!ActionClass) {
            console.error(`Unknown action type: ${actionId}`);
            return;
        }

        // Use metadata for default duration if not specified
        if (!options.duration) {
            options.duration = ActionClass.metadata.defaultDuration;
        }

        // Handle mood effects
        if (ActionClass.metadata.affectsMood) {
            this.myte.stats.updateMood(ActionClass.metadata.moodEffect);
        }

        const action = new ActionClass(this.myte, options);
        this.queue.push(action);
    }

    addToBeginning(actionType, options = {}) {
        const ActionClass = this.actionTypes[actionType];
        if (!ActionClass) {
            console.error(`Unknown action type: ${actionType}`);
            return;
        }

        const action = new ActionClass(this.myte, options);
        this.queue.unshift(action);
    }

    update() {
        if (this.queue.length === 0) return;

        const currentAction = this.queue[0];

        if (!this.isDoingAction) {
            currentAction.start();
            this.isDoingAction = true;
        }

        if (currentAction.update()) {
            
            this.removeCurrentAction();
            if (this.queue.length > 0) {
                // go to next item
                this.queue[0].start();
                this.isDoingAction = true;
            }else{
                // no more, run complete
                currentAction.complete();
            }
        }
    }

    removeCurrentAction() {
        this.queue.shift();
        this.isDoingAction = false;
    }

    clear() {
        this.queue = [];
        this.isDoingAction = false;
    }

    getCurrentAction() {
        return this.queue[0] || null;
    }

    isEmpty() {
        return this.queue.length === 0;
    }

    // Convenience methods for common actions
    addIdle(duration = 200) {
        this.add('idle', { duration });
    }

    addExpression(type, duration = 50, repeat = 1) {
        this.add('expression', { action_type: type, duration, repeat });
    }

    addExpressionToBeginning(type, duration = 50, repeat = 1) {
        this.addToBeginning('expression', { action_type: type, duration, repeat });
    }

    addDance(duration = 2000) {
        this.add('dance', { duration });
    }

    addSimpleSleep(duration = 5000) {
        this.add('simple_sleep', { duration });
    }

    addFollowMouse() {
        this.add('follow_mouse');
    }

    // Add convenience methods to MyteQueue:
    addJump(height = 100) {
        this.add('jump', { height });
    }

    addCircle(centerX, centerY, radius = 50, duration = 3000) {
        this.add('circle', { centerX, centerY, radius, duration });
    }

    addEatElement(element) {
        this.addMoveToElement(element);
        this.add('eat_element', { element });
    }

    addZigzag(direction = { x: 1, y: 0 }, duration = 2000) {
        this.add('zigzag', { direction, duration });
    }

    addSpin(rotations = 2, duration = 1000) {
        this.add('spin', { rotations, duration });
    }

    addShowAffection(targetMyte) {
        this.add('show_affection', { targetMyte });
    }

    addPlayTag(targetMyte, isIt = true) {
        this.add('play_tag', { targetMyte, isIt });
    }

    addRunLaps(element, repeat = 5) {
        // Calculate targets based on element
        const targets = this.calculateLapTargets(element);
        this.add('run_laps', { target: targets, repeat });
    }

    // Add convenience methods to MyteQueue:
    addRunAway(target, duration = -1) {
        this.add('run_away', { target, duration });
    }

    addHide(hideTarget, scaryObject, duration = 5000) {
        this.add('hide', { hideTarget, scaryObject, duration });
    }

    addSleep(duration = 5000) {
        this.add('sleep', { duration });
    }

    addInspect(target, duration = 3000) {
        this.add('inspect', { target, duration });
    }

    addPlayFetch(throwable, throwStrength = 10) {
        this.add('play_fetch', {
            throwable,
            throwStrength
        });
    }

    addCarry(targetMyte) {
        if (!targetMyte.queue.isBeingCarried()) {
            this.add('pickup', { target: targetMyte });
            this.add('carry', { target: targetMyte });
        }
    }

    isBeingCarried() {
        const current = this.getCurrentAction();
        return current instanceof BeingCarriedAction;
    }

    isCarrying() {
        const current = this.getCurrentAction();
        return current instanceof CarryAction;
    }

    calculateLapTargets(element) {
        // Implementation to calculate targets for running laps
        // This would return an array of target positions around the element
        return [
            { x: element.offsetLeft - 50, y: element.offsetTop },
            { x: element.offsetLeft + element.offsetWidth + 50, y: element.offsetTop }
        ];
    }
}