class MyteQueue {
    constructor(myte) {
        this.myte  = myte;
        this.queue = [];
        this.isDoingAction = false;
    }

    // ─── Core API ─────────────────────────────────────────────────────────────

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

        if (ActionClass.metadata.requiresTarget && (options.target == null)) {
            console.warn(`[MyteQueue] action "${actionId}" requires a target but got`, options.target);
            console.trace('[MyteQueue] queued without target');
        }

        this.queue.push(new ActionClass(this.myte, options));
        return this; // chainable
    }

    // Insert an action at the front — interrupts the current action cleanly
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
        this.isDoingAction = false; // force re-start on next update
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
        this.queue        = [];
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

    // ─── Update loop ──────────────────────────────────────────────────────────

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
            currentAction.complete(); // always called, regardless of queue state

            if (this.queue.length > 0) {
                this.queue[0].start();
                this.isDoingAction = true;
            }
        }
    }

    // ─── Carry state queries ──────────────────────────────────────────────────

    isBeingCarried() {
        return this.getCurrentAction() instanceof BeingCarriedAction;
    }

    isCarrying() {
        const action = this.getCurrentAction();
        return action instanceof CarryAction || action instanceof HoldBallAction;
    }

    // ─── Convenience methods ──────────────────────────────────────────────────

    addIdle(duration = 200) {
        return this.add('idle', { duration });
    }

    addExpression(type, duration = 50, repeat = 1) {
        return this.add('expression', { action_type: type, duration, repeat });
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

    // Approach then eat
    addEatElement(target) {
        return this.addSequence([
            ['go_to_object', { target }],
            ['eat_element',  { target }]
        ]);
    }

    // Approach and open a treasure chest
    addOpenChest(chest) {
        return this.addSequence([
            ['go_to_object', { target: chest }],
            ['open_chest',   { target: chest }]
        ]);
    }

    // Approach and smell a flower
    addSmellFlower(flower) {
        return this.addSequence([
            ['go_to_object',  { target: flower }],
            ['smell_flower',  { target: flower }]
        ]);
    }

    // Approach a fountain and drink
    addDrinkFromFountain(fountain) {
        return this.addSequence([
            ['go_to_object',    { target: fountain }],
            ['drink_fountain',  { target: fountain }]
        ]);
    }

    // Approach and water a crop plant
    addWaterPlant(plant) {
        return this.addSequence([
            ['go_to_object', { target: plant }],
            ['water_plant',  { target: plant }]
        ]);
    }

    // Approach and harvest a crop
    addHarvest(plant) {
        return this.addSequence([
            ['go_to_object', { target: plant }],
            ['harvest',      { target: plant }]
        ]);
    }

    // Approach then show affection
    addShowAffection(targetMyte) {
        return this.addSequence([
            ['go_to_object',  { target: targetMyte }],
            ['show_affection', { target: targetMyte }]
        ]);
    }

    // Approach then greet (greet action pushes receive onto the target's queue)
    addGreet(targetMyte) {
        return this.addSequence([
            ['go_to_object', { target: targetMyte }],
            ['greet',        { target: targetMyte }]
        ]);
    }

    // Stand near and watch another Myte
    addWatch(targetMyte, duration = 5000) {
        return this.addSequence([
            ['go_to_object', { target: targetMyte }],
            ['watch',        { target: targetMyte, duration }]
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

    // Approach then pick up another Myte
    addPickupMyte(target) {
        if (!target || target.queue.isBeingCarried()) return false;

        this.addSequence([
            ['go_to_object',  { target }],
            ['carry_pickup',  { target, duration: 100 }]
        ]);
        return true;
    }

    // Put down the currently carried Myte
    addPutDownMyte() {
        const currentAction = this.getCurrentAction();
        if (!(currentAction instanceof CarryAction) || !currentAction.target) return false;

        this.clear();
        this.add('carry_putdown', { target: currentAction.target, duration: 100 });
        return true;
    }

    // Pick up a ball using A* then hold it
    addPickupBall(ball) {
        if (!ball || ball.isPickedUp || this.isCarrying()) return false;
        ball.pendingPickup = true;
        this.addSequence([
            ['astar-move', { target: { x: ball.posX + ball.size.width / 2, y: ball.posY + ball.size.height / 2 } }],
            ['hold-ball',  { ball }]
        ]);
        return true;
    }

    // Move to a position using A*
    addAStarMove(target) {
        return this.add('astar-move', { target });
    }

    // Low-level: move to a DOM element position (legacy)
    addMoveToElement(element = null) {
        const destination = this.myte.parent.getLocalOffset(element);
        return this.add('move', {
            target: [{ x: destination.x, y: destination.y }],
            duration: 300
        });
    }
}
