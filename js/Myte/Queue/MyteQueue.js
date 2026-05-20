class MyteQueue {
    constructor(myte) {
        this.myte = myte;
        this.queue = [];
        this.isDoingAction = false;
    }

    // Core API
    count() {
        return this.queue.length;
    }

    isEmpty() {
        return this.queue.length === 0;
    }

    getCurrentAction() {
        return this.queue[0] ?? null;
    }

    // Add an action to the end of the queue
    add(actionId, options = {}) {
        const ActionClass = ActionManager.actions.get(actionId);
        if (!ActionClass) {
            console.error(`[MyteQueue] Unknown action: ${actionId}`);
            return this;
        }

        if (options.duration == null) {
            options.duration = ActionClass.metadata.defaultDuration;
        }

        if (ActionClass.metadata.requiresTarget && options.target == null) {
            console.warn(`[MyteQueue] action "${actionId}" requires a target but got`, options.target);
            console.trace('[MyteQueue] queued without target');
        }

        this.queue.push(new ActionClass(this.myte, options));
        return this;
    }

    // Insert an action at the front - interrupts the current action cleanly.
    addToFront(actionId, options = {}) {
        const ActionClass = ActionManager.actions.get(actionId);
        if (!ActionClass) {
            console.error(`[MyteQueue] Unknown action: ${actionId}`);
            return this;
        }

        if (options.duration == null) {
            options.duration = ActionClass.metadata.defaultDuration;
        }

        if (this.isDoingAction && this.queue[0]?.interrupt) {
            this.queue[0].interrupt();
        }

        this.queue.unshift(new ActionClass(this.myte, options));
        this.isDoingAction = false;
        return this;
    }

    // Clear queue and immediately start a new action
    interrupt(actionId, options = {}) {
        this.clear();
        return this.add(actionId, options);
    }

    // Queue a sequence of [actionId, options] pairs in order
    addSequence(steps) {
        for (const step of steps) {
            const [actionId, options = {}] = Array.isArray(step) ? step : [step, {}];
            this.add(actionId, options);
        }
        return this;
    }

    clear() {
        if (this.isDoingAction && this.queue[0]?.interrupt) {
            this.queue[0].interrupt();
        }
        this.queue = [];
        this.isDoingAction = false;
    }

    removeCurrentAction() {
        if (this.queue.length === 0) {
            return null;
        }

        const currentAction = this.queue.shift();
        if (this.isDoingAction && currentAction?.interrupt) {
            currentAction.interrupt();
        }

        currentAction?.complete?.();
        this.isDoingAction = false;

        if (this.queue.length > 0) {
            this.queue[0].start();
            this.isDoingAction = true;
        }

        return currentAction;
    }

    // Update loop
    update() {
        if (this.queue.length === 0) return;

        const currentAction = this.queue[0];

        if (!this.isDoingAction) {
            currentAction.start();
            this.isDoingAction = true;
        }

        if (currentAction.update()) {
            this.queue.shift();
            this.isDoingAction = false;
            currentAction.complete();

            if (this.queue.length > 0) {
                this.queue[0].start();
                this.isDoingAction = true;
            }
        }
    }

    // Carry state queries
    isBeingCarried() {
        return this.getCurrentAction() instanceof BeingCarriedAction;
    }

    isCarrying() {
        const action = this.getCurrentAction();
        return action instanceof CarryAction || action instanceof HoldItemAction || action instanceof CarryPickupAction;
    }

    isCarryingItem() {
        return this.getCurrentAction() instanceof HoldItemAction;
    }

    isCarryingMyte() {
        return this.getCurrentAction() instanceof CarryAction || this.getCurrentAction() instanceof CarryPickupAction;
    }

    getHeldItem() {
        const currentAction = this.getCurrentAction();
        if (currentAction instanceof HoldItemAction) {
            return currentAction.target ?? null;
        }
        return null;
    }

    // Convenience methods
    addIdle(duration = 200) {
        return this.add('idle', { duration });
    }

    addExpression(type, duration = 50, repeat = 1) {
        return this.add('expression', { actionType: type, duration, repeat });
    }

    addDance(duration = 2000) {
        return this.add('dance', { duration });
    }

    addSimpleSleep(duration = 5000) {
        return this.add('simple_sleep', { duration });
    }

    addSleep(duration = 5000) {
        return this.add('sleep', { duration });
    }

    addFollowMouse() {
        return this.add('follow_mouse');
    }

    addFollowObject(target) {
        return this.add('follow_object', { target });
    }

    addJump(height = 100) {
        return this.add('jump', { height });
    }

    addCircle(centerX, centerY, radius = 50, duration = 3000) {
        return this.add('circle', { centerX, centerY, radius, duration });
    }

    addZigzag(direction = { x: 1, y: 0 }, duration = 2000) {
        return this.add('zigzag', { direction, duration });
    }

    addSpin(rotations = 2, duration = 1000) {
        return this.add('spin', { rotations, duration });
    }

    addInspect(target, duration = 3000) {
        return this.add('inspect', { target, duration });
    }

    addEatElement(target) {
        return this.addSequence([
            ['go_to_object', { target }],
            ['eat_element', { target }]
        ]);
    }

    addOpenChest(chest) {
        return this.addSequence([
            ['go_to_object', { target: chest }],
            ['open_chest', { target: chest }]
        ]);
    }

    addSmellFlower(flower) {
        return this.addSequence([
            ['go_to_object', { target: flower }],
            ['smell_flower', { target: flower }]
        ]);
    }

    addDrinkFromFountain(fountain) {
        return this.addSequence([
            ['go_to_object', { target: fountain }],
            ['drink_fountain', { target: fountain }]
        ]);
    }

    addWaterPlant(plant) {
        return this.addSequence([
            ['go_to_object', { target: plant }],
            ['water_plant', { target: plant }]
        ]);
    }

    addHarvest(plant) {
        return this.addSequence([
            ['go_to_object', { target: plant }],
            ['harvest', { target: plant }]
        ]);
    }

    addShowAffection(targetMyte) {
        return this.addSequence([
            ['go_to_object', { target: targetMyte }],
            ['show_affection', { target: targetMyte }]
        ]);
    }

    addGreet(targetMyte) {
        return this.addSequence([
            ['go_to_object', { target: targetMyte }],
            ['greet', { target: targetMyte }]
        ]);
    }

    addWatch(targetMyte, duration = 5000) {
        return this.addSequence([
            ['go_to_object', { target: targetMyte }],
            ['watch', { target: targetMyte, duration }]
        ]);
    }

    addPlayTag(targetMyte, isIt = true) {
        return this.add('play_tag', { target: targetMyte, isIt });
    }

    addPlayFetch(throwable, throwStrength = 10) {
        return this.add('play_fetch', { throwable, throwStrength });
    }

    addRunAway(target, duration = -1) {
        return this.add('run_away', { target, duration });
    }

    addHide(hideTarget, scaryObject, duration = 5000) {
        return this.add('hide', { hideTarget, scaryObject, duration });
    }

    addPickupMyte(target) {
        if (!target || target.queue.isBeingCarried()) return false;

        this.addSequence([
            ['go_to_object', { target }],
            ['carry_pickup', { target, duration: 100 }]
        ]);
        return true;
    }

    addPutDownMyte() {
        const currentAction = this.getCurrentAction();
        if (!(currentAction instanceof CarryAction) || !currentAction.target) return false;

        this.clear();
        this.add('carry_putdown', { target: currentAction.target, duration: 100 });
        return true;
    }

    addPickupItem(target) {
        if (!target || target.isPickedUp || target.pendingPickup || this.isCarrying()) return false;
        this.add('pickup_item', { target });
        return true;
    }

    addPickupBall(ball) {
        return this.addPickupItem(ball);
    }

    addDropHeldItem() {
        const heldItem = this.getHeldItem();
        if (!heldItem) return false;

        const currentAction = this.getCurrentAction();
        if (currentAction instanceof HoldItemAction) {
            currentAction.target = null;
        }

        this.clear();
        this.add('drop_item', { target: heldItem });
        return true;
    }

    addAStarMove(target) {
        return this.add('astar-move', { target });
    }

    addMoveToElement(element = null) {
        const destination = this.myte.parent.getLocalOffset(element);
        return this.add('move', {
            target: [{ x: destination.x, y: destination.y }],
            duration: 300
        });
    }
}
