class MyteQueue {
    constructor(myte) {
        this.myte = myte;
        this.queue = [];
        this.isDoingAction = false;
        this.max_total_time = 1500;

        // Action type mapping
        this.actionTypes = {

            // actions
            'idle': IdleAction,
            'expression': ExpressionAction,
            'dance': DanceAction,
            'simpleSleep': SimpleSleepAction,
            'eat_element': EatElementAction,

            // movement
            'follow_mouse': FollowMouseAction,
            'move': MoveAction,
            'run_laps': RunLapsAction,
            'follow_object': FollowObjectAction,
            'go_to_object': GoToObjectAction,

            // pickup/carrying
            'carry_pickup': CarryPickupAction,
            'carry': CarryAction,
            'being_carried': BeingCarriedAction,
            'carry_putdown': CarryPutdownAction,

            // test
            'jump': JumpAction,
            'circle': CircleAction,
            'zigzag': ZigzagAction,
            'spin': SpinAction,
            'show_affection': ShowAffectionAction,
            'play_tag': PlayTagAction,

            'run_away': RunAwayAction,
            'hide': HideAction,
            'sleep': SleepAction,
            'inspect': InspectAction,
            'play_fetch': PlayFetchAction

        };
        
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

    addPickupMyte(targetObject) {
        if (!targetObject || targetObject.queue.isBeingCarried()) return false;

        this.add("go_to_object", {
            targetObject: targetObject
        });

        this.add("carry_pickup", {
            targetObject: targetObject,
            duration: 100
        });

        return true;
    }

    addFollowObject(element) {
        this.add("follow_object", {
            targetObject: element
        });
    }

    addPutDownMyte() {
        const currentAction = this.getCurrentAction();
        if (!(currentAction instanceof CarryAction) || !currentAction.targetObject) return false;

        this.clear();

        this.add("carry_putdown", {
            targetObject: currentAction.targetObject,
            duration: 100
        });

        return true;
    }

    add(actionType, options = {}) {
        const ActionClass = this.actionTypes[actionType];
        if (!ActionClass) {
            console.error(`Unknown action type: ${actionType}`);
            return;
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
            currentAction.complete();
            this.removeCurrentAction();
            if (this.queue.length > 0) {
                // go to next item
                this.queue[0].start();
                this.isDoingAction = true;
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
    addRunAway(targetObject, duration = -1) {
        this.add('run_away', { targetObject, duration });
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
            this.add('pickup', { targetObject: targetMyte });
            this.add('carry', { targetObject: targetMyte });
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