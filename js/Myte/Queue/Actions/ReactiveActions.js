// Flee from a scary object or Myte
class RunAwayAction extends MyteAction {
    static metadata = { id: 'run_away' };

    static canPerform(selected, active) {
        return selected instanceof Myte &&
               selected !== active &&
               !active?.queue.isCarrying();
    }

    constructor(myte, options) {
        super(myte, { ...RunAwayAction.metadata.defaultOptions, ...options });
    }

    update() {
        const target = this.target;
        if (!target) return true;

        const dx       = target.posX - this.myte.posX;
        const dy       = target.posY - this.myte.posY;
        const distance = Math.hypot(dx, dy);

        if (distance < this.panicDistance) {
            const angle    = Math.atan2(dy, dx) + Math.PI;
            const clamped = this.myte.parent.clampEntityPosition(
                this.myte,
                this.myte.posX + Math.cos(angle) * this.runDistance,
                this.myte.posY + Math.sin(angle) * this.runDistance
            );

            this.myte.setTarget(clamped.x, clamped.y);

            if (Math.random() < 0.02) {
                this.myte.queue.addExpression('panic', 200);
            }
        }

        this.myte.moveTowardsTarget();

        if (this.duration > 0) {
            this.currentDuration--;
            return this.currentDuration <= 0;
        }

        return false;
    }
}

// Hide behind an object from something scary — occasionally peeks out.
// Not user-triggered; queued internally by AI when the Myte is scared.
// Requires options: { hideTarget: MapObject, scaryObject: MapObject|Myte }
class HideAction extends MyteAction {
    static metadata = { id: 'hide' };

    static canPerform() { return false; }

    constructor(myte, options) {
        super(myte, {
            ...HideAction.metadata.defaultOptions,
            duration: options.duration || HideAction.metadata.defaultDuration,
            ...options
        });
        this.peekTimer  = this.peekInterval;
        this.isPeeking  = false;
    }

    start() {
        super.start();
    }

    update() {
        const hideTarget   = this.hideTarget;
        const scaryObject  = this.scaryObject;
        if (!hideTarget || !scaryObject) return true;

        const dx    = hideTarget.posX - scaryObject.posX;
        const dy    = hideTarget.posY - scaryObject.posY;
        const angle = Math.atan2(dy, dx);

        this.myte.setTarget(
            hideTarget.posX + Math.cos(angle) * 30,
            hideTarget.posY + Math.sin(angle) * 30
        );
        this.myte.moveTowardsTarget();

        this.peekTimer -= 16;
        if (this.peekTimer <= 0) {
            this.isPeeking = !this.isPeeking;
            this.peekTimer = this.peekInterval;
            if (this.isPeeking) {
                this.myte.queue.addExpression('peek', 500);
            }
        }

        this.currentDuration--;
        return this.currentDuration <= 0;
    }
}

// Run away from a MapObject (animals, scary objects, etc.)
class RunFromAction extends MyteAction {
    static metadata = { id: 'run_from' };

    static canPerform(selected, active) {
        return selected instanceof MapObject &&
               selected.getConfig?.('scary', false) === true &&
               !active?.queue.isCarrying();
    }

    constructor(myte, options) {
        super(myte, { ...RunFromAction.metadata.defaultOptions, ...options });
    }

    update() {
        const target = this.target;
        if (!target) return true;

        const dx = target.posX - this.myte.posX;
        const dy = target.posY - this.myte.posY;
        const distance = Math.hypot(dx, dy);

        if (distance < this.panicDistance) {
            const angle = Math.atan2(dy, dx) + Math.PI;
            const clamped = this.myte.parent.clampEntityPosition(
                this.myte,
                this.myte.posX + Math.cos(angle) * this.runDistance,
                this.myte.posY + Math.sin(angle) * this.runDistance
            );
            this.myte.setTarget(clamped.x, clamped.y);

            if (Math.random() < 0.02) {
                this.myte.queue.addExpression('panic', 200);
            }
        }

        this.myte.moveTowardsTarget();
        this.currentDuration--;
        return this.currentDuration <= 0;
    }
}
