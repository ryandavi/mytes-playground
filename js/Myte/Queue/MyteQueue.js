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

    _emitChanged(reason) {
        this.myte?.parent?.eventManager?.emit(EVENTS.MYTE_QUEUE_CHANGED, {
            myte: this.myte,
            queue: this,
            reason
        });
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

        const resolvedOptions = { ...options };
        if (resolvedOptions.duration == null) {
            resolvedOptions.duration = ActionClass.metadata.defaultDuration;
        }

        if (ActionClass.metadata.requiresTarget && resolvedOptions.target == null) {
            console.warn(`[MyteQueue] action "${actionId}" requires a target but got`, resolvedOptions.target);
            console.trace('[MyteQueue] queued without target');
        }

        if (this.strictInterrupt) {
            this._log('add→interrupt', actionId);
            this.clear();
        } else {
            this._log('add', actionId);
        }
        this.queue.push(new ActionClass(this.myte, resolvedOptions));
        this._emitChanged('added');
        return this;
    }

    // Insert an action at the front — do this next, then resume the plan.
    addToFront(actionId, options = {}) {
        const ActionClass = ActionManager.actions.get(actionId);
        if (!ActionClass) {
            console.error(`[MyteQueue] Unknown action: ${actionId}`);
            return this;
        }

        const resolvedOptions = { ...options };
        if (resolvedOptions.duration == null) {
            resolvedOptions.duration = ActionClass.metadata.defaultDuration;
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

        this.queue.unshift(new ActionClass(this.myte, resolvedOptions));
        this.isDoingAction = false;
        this._emitChanged('added_to_front');
        return this;
    }

    // Drop everything and do this now — something external made the current queue meaningless.
    interrupt(actionId, options = {}) {
        this._log('interrupt', actionId);
        if (this.isDoingAction) {
            this.queue[0]?.setInterruptionDestination?.(options);
        }
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

    // keepUserInitiated spares actions the player asked for. Housekeeping that
    // resets movement (mode switches, inactivity restore) fires on the same
    // click that queued a destination, and wiping it there made the command
    // silently do nothing.
    clear({ keepUserInitiated = false } = {}) {
        const kept = keepUserInitiated
            ? this.queue.filter(action => action?.userInitiated)
            : [];
        const hadActions = this.queue.length > kept.length;
        const keepsHead = kept.length > 0 && kept[0] === this.queue[0];

        if (this.isDoingAction && !keepsHead && this.queue[0]?.interrupt) {
            this.queue[0].interrupt();
        }

        this.queue = kept;
        this.isDoingAction = keepsHead && this.isDoingAction;
        if (hadActions) this._emitChanged('cleared');
    }

    removeCurrentAction() {
        return this._advance({ completed: false });
    }

    _advance({ completed }) {
        if (this.queue.length === 0) return null;

        const currentAction = this.queue.shift();
        if (completed && !currentAction._interrupted) {
            currentAction.complete?.();
        } else if (this.isDoingAction) {
            currentAction.interrupt?.();
        }

        this.isDoingAction = false;
        if (this.queue.length > 0) {
            this.queue[0].start();
            this.isDoingAction = true;
        }
        this._emitChanged(completed ? 'completed' : 'removed');
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
            this._advance({ completed: false });
            return;
        }

        if (currentAction.update(deltaTime)) {
            this._advance({ completed: true });
        }
    }

    // Carry state queries
    isBeingCarried() {
        return !!this.myte?.container?.relationships?.get?.('carriedBy', this.myte);
    }

    getCarryRelationTarget() {
        return this.myte?.container?.relationships?.get?.('carrying', this.myte) ?? null;
    }

    isCarrying() {
        return !!this.getCarryRelationTarget();
    }

    isCarryingItem() {
        const relatedTarget = this.getCarryRelationTarget();
        return relatedTarget instanceof MapObject;
    }

    isCarryingMyte() {
        const relatedTarget = this.getCarryRelationTarget();
        return relatedTarget instanceof Myte;
    }

    getHeldItem() {
        const relatedTarget = this.getCarryRelationTarget();
        return relatedTarget instanceof MapObject ? relatedTarget : null;
    }

    // Convenience methods
    addIdle(duration = SiteConfig.actions.queueDefaults.idleDuration) {
        return this.add('idle', { duration });
    }

    addExpression(type, duration = SiteConfig.actions.queueDefaults.expressionDuration, repeat = 1) {
        return this.add('expression', { actionType: type, duration, repeat });
    }

    addDance(duration = SiteConfig.actions.queueDefaults.danceDuration) {
        return this.add('dance', { duration });
    }

    addJump(height = SiteConfig.actions.queueDefaults.jumpHeight) {
        return this.add('jump', { height });
    }

    addPutDownMyte() {
        const carriedMyte = this.getCarryRelationTarget();
        if (!(carriedMyte instanceof Myte)) return false;
        this.interrupt('carry_putdown', {
            target: carriedMyte,
            duration: SiteConfig.actions.queueDefaults.putDownDuration
        });
        return true;
    }

    addPickupItem(target) {
        if (!target || target.isPickedUp || target.pendingPickup || this.isCarrying()) return false;
        this.add('pickup_item', { target });
        return true;
    }

    addDropHeldItem() {
        const heldItem = this.getHeldItem();
        if (!heldItem) return false;

        this.interrupt('drop_item', { target: heldItem });
        return true;
    }

    addAStarMove(target) {
        return this.add('astar-move', { target });
    }

}
