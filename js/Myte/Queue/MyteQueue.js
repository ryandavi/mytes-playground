// Queue policy — three tiers, pick the right one for every callsite:
//
//   interrupt(id, opts)   Drop everything, do this now.
//                         Use when something external makes the current queue meaningless:
//                         user commands, pickup/carry/drop, danger, item use, petting.
//
//   addToFront(id, opts)  Do this next, then resume the plan.
//                         Use for brief reactions that shouldn't discard queued intent:
//                         buff/need-signal expressions, cosmetic mid-action responses.
//
//   add(id, opts)         Queue at the end, do when you get to it.
//                         Use for AI autonomous decisions and sequence step building only.

class MyteQueue {
    constructor(myte) {
        this.myte = myte;
        this.queue = [];
        this.isDoingAction = false;
        this.logEnabled = localStorage.getItem('myteQueueLog') === 'true';
        this.consoleClearEnabled = localStorage.getItem('myteQueueConsoleClear') === 'true';
        this.strictInterrupt = localStorage.getItem('myteQueueStrictInterrupt') === 'true';
    }

    _log(tier, actionId) {
        if (!this.logEnabled) return;
        if (this.consoleClearEnabled) console.clear();
        Utility.logDebug(`[Queue:${this.myte?.name ?? '?'}] ${tier.padEnd(10)} ${actionId}`);
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

    hasUserInitiatedAction() {
        return this.queue.some(action => action?.userInitiated);
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

        if (this.strictInterrupt) {
            this._log('add→interrupt', actionId);
            this.clear();
        } else {
            this._log('add', actionId);
        }
        this.queue.push(new ActionClass(this.myte, options));
        return this;
    }

    // Insert an action at the front — do this next, then resume the plan.
    addToFront(actionId, options = {}) {
        const ActionClass = ActionManager.actions.get(actionId);
        if (!ActionClass) {
            console.error(`[MyteQueue] Unknown action: ${actionId}`);
            return this;
        }

        if (options.duration == null) {
            options.duration = ActionClass.metadata.defaultDuration;
        }

        if (this.strictInterrupt) {
            this._log('front→interrupt', actionId);
            this.clear();
        } else {
            if (this.isDoingAction && this.queue[0]?.interrupt) {
                this.queue[0].interrupt();
            }
            this._log('addToFront', actionId);
        }

        this.queue.unshift(new ActionClass(this.myte, options));
        this.isDoingAction = false;
        return this;
    }

    // Drop everything and do this now — something external made the current queue meaningless.
    interrupt(actionId, options = {}) {
        this._log('interrupt', actionId);
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
    update(deltaTime) {
        if (this.queue.length === 0) return;

        const currentAction = this.queue[0];

        if (!this.isDoingAction) {
            currentAction.start();
            this.isDoingAction = true;
        }

        if (currentAction.isTargetValid?.() === false) {
            Utility.logDebug(`[MyteQueue] cancelling ${currentAction.constructor?.name} — target no longer valid`);
            this.queue.shift();
            this.isDoingAction = false;
            currentAction.interrupt?.();

            if (this.queue.length > 0) {
                this.queue[0].start();
                this.isDoingAction = true;
            }
            return;
        }

        if (currentAction.update(deltaTime)) {
            this.queue.shift();
            this.isDoingAction = false;
            if (!currentAction._interrupted) {
                currentAction.complete();
            }

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

    getCarryRelationTarget() {
        return this.myte?.container?.relationships?.get?.('carrying', this.myte) ?? null;
    }

    isCarrying() {
        const relatedTarget = this.getCarryRelationTarget();
        if (relatedTarget) {
            return true;
        }

        const action = this.getCurrentAction();
        return action instanceof CarryAction || action instanceof HoldItemAction || action instanceof CarryPickupAction;
    }

    isCarryingItem() {
        const relatedTarget = this.getCarryRelationTarget();
        if (relatedTarget instanceof MapObject) {
            return true;
        }

        return this.getCurrentAction() instanceof HoldItemAction;
    }

    isCarryingMyte() {
        const relatedTarget = this.getCarryRelationTarget();
        if (relatedTarget instanceof Myte) {
            return true;
        }

        return this.getCurrentAction() instanceof CarryAction || this.getCurrentAction() instanceof CarryPickupAction;
    }

    getHeldItem() {
        const relatedTarget = this.getCarryRelationTarget();
        if (relatedTarget instanceof MapObject) {
            return relatedTarget;
        }

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

    addPlayTag(targetMyte, isIt = true) {
        return this.add('play_tag', { target: targetMyte, isIt });
    }

    addPlayFetch(throwable, throwStrength = 10) {
        return this.add('play_fetch', { target: throwable, throwable, throwStrength });
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

        this.interrupt('carry_putdown', { target: currentAction.target, duration: 100 });
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

        this.interrupt('drop_item', { target: heldItem });
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
