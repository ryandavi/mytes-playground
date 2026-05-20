// Show affection toward another Myte (one-sided emote, no sync needed)
class ShowAffectionAction extends MyteAction {
    static metadata = {
        id: 'show_affection',
        label: 'Show Affection',
        category: 'social',
        priority: 3,
        isMovementAction: false,
        isInterruptible: false,
        defaultDuration: 1500,
        description: 'Show affection to another Myte',
        requiresTarget: true,
        affectsMood: true,
        moodEffect: 8,
        defaultOptions: {
            emitDelay: 200,
            expressionType: 'heart',
            expressionDuration: 300,
            expressionRepeat: 3
        }
    };

    static canPerform(selected, active) {
        return selected instanceof Myte &&
               selected !== active &&
               !active?.queue.isCarrying();
    }

    constructor(myte, options) {
        super(myte, { ...ShowAffectionAction.metadata.defaultOptions, duration: ShowAffectionAction.metadata.defaultDuration, ...options });
    }

    start() {
        super.start();
        this.myte.queue.addExpression(this.expressionType, this.expressionDuration, this.expressionRepeat);
    }

    update() {
        this.currentDuration--;
        return this.currentDuration <= 0;
    }
}

// Greet
// Two-part synchronized greeting. The initiator queues itself; on start it
// pushes GreetReceiveAction onto the target's queue and shares an ActionSync.
// Both actions signal the sync when positioned, then play a wave expression.
class GreetAction extends PositionableAction {
    static metadata = {
        id: 'greet',
        label: 'Greet',
        category: 'social',
        priority: 3,
        isMovementAction: false,
        isInterruptible: true,
        defaultDuration: 120,
        description: 'Greet another Myte with a wave',
        requiresTarget: true,
        affectsMood: true,
        moodEffect: 5,
        defaultOptions: {
            expressionType: 'wave',
            expressionDuration: 400,
            expressionRepeat: 2
        }
    };

    static canPerform(selected, active) {
        return selected instanceof Myte && selected !== active && !active?.queue.isCarrying();
    }

    static getRequiredOptions(selected, active) {
        return { target: selected };
    }

    constructor(myte, options) {
        super(myte, { ...GreetAction.metadata.defaultOptions, duration: GreetAction.metadata.defaultDuration, ...options });
        this.sync = options.sync ?? new ActionSync();
        this._synced = false;
    }

    start() {
        super.start();
        this._faceTarget();

        this.sync.signal(this);
        this.sync.onReady(() => {
            this._synced = true;
            this.myte.queue.addExpression(this.expressionType, this.expressionDuration, this.expressionRepeat);
        });

        const target = this.target;
        if (target instanceof Myte && !target.queue.isCarrying() && !target.queue.isBeingCarried()) {
            target.queue.addToFront('greet_receive', { target: this.myte, sync: this.sync });
        } else {
            // No partner available - signal both sides ourselves so the expression still plays.
            this.sync.signal({});
        }
    }

    _faceTarget() {
        const tr = this.getRect(this.target);
        const mr = this.myte.getRect();
        if (!tr) return;

        const dx = (tr.x + tr.width / 2) - (mr.x + mr.width / 2);
        const dy = (tr.y + tr.height / 2) - (mr.y + mr.height / 2);

        if (Math.abs(dx) > Math.abs(dy)) {
            this.myte.setDirection(dx > 0 ? DIRECTION.EAST : DIRECTION.WEST);
        } else {
            this.myte.setDirection(dy > 0 ? DIRECTION.SOUTH : DIRECTION.NORTH);
        }
    }

    update() {
        this.currentDuration--;
        return this.currentDuration <= 0;
    }
}

// Receiver side of a greet - queued on the target Myte by GreetAction.start().
class GreetReceiveAction extends PositionableAction {
    static metadata = {
        id: 'greet_receive',
        label: 'Greet (receive)',
        category: 'social',
        priority: 3,
        isMovementAction: false,
        isInterruptible: true,
        defaultDuration: 120,
        description: 'Respond to a greeting from another Myte',
        requiresTarget: true,
        affectsMood: true,
        moodEffect: 5,
        defaultOptions: {
            expressionType: 'wave',
            expressionDuration: 400,
            expressionRepeat: 2
        }
    };

    static canPerform() { return false; }

    constructor(myte, options) {
        super(myte, { ...GreetReceiveAction.metadata.defaultOptions, duration: GreetReceiveAction.metadata.defaultDuration, ...options });
        this.sync = options.sync ?? new ActionSync();
    }

    start() {
        super.start();
        this._faceTarget();
        this.sync.signal(this);
        this.sync.onReady(() => {
            this.myte.queue.addExpression(this.expressionType, this.expressionDuration, this.expressionRepeat);
        });
    }

    _faceTarget() {
        const tr = this.getRect(this.target);
        const mr = this.myte.getRect();
        if (!tr) return;

        const dx = (tr.x + tr.width / 2) - (mr.x + mr.width / 2);
        const dy = (tr.y + tr.height / 2) - (mr.y + mr.height / 2);

        if (Math.abs(dx) > Math.abs(dy)) {
            this.myte.setDirection(dx > 0 ? DIRECTION.EAST : DIRECTION.WEST);
        } else {
            this.myte.setDirection(dy > 0 ? DIRECTION.SOUTH : DIRECTION.NORTH);
        }
    }

    update() {
        this.currentDuration--;
        return this.currentDuration <= 0;
    }
}

// Stand near another Myte and loosely follow their position.
class WatchAction extends PositionableAction {
    static metadata = {
        id: 'watch',
        label: 'Watch',
        category: 'social',
        priority: 2,
        isMovementAction: true,
        isInterruptible: true,
        defaultDuration: 5000,
        description: 'Watch another Myte from nearby',
        requiresTarget: true,
        affectsMood: true,
        moodEffect: 2,
        defaultOptions: {
            watchDistance: 60
        }
    };

    static canPerform(selected, active) {
        return selected instanceof Myte && selected !== active && !active?.queue.isCarrying();
    }

    static getRequiredOptions(selected, active) {
        return { target: selected };
    }

    constructor(myte, options) {
        super(myte, { ...WatchAction.metadata.defaultOptions, duration: WatchAction.metadata.defaultDuration, ...options });
    }

    start() {
        super.start();
    }

    update() {
        if (!this.target) return true;

        const targetRect = this.getRect(this.target);
        const myteRect = this.myte.getRect();
        const horizontal = this.getClosestSideHorizontal(targetRect, myteRect);
        const watchPos = this.calculatePosition(myteRect, targetRect, horizontal, { gap: -5, align: 'bottom-edge' });

        this.myte.setTarget(watchPos.x, watchPos.y);
        this.myte.moveTowardsTarget();

        this.currentDuration--;
        return this.currentDuration <= 0;
    }
}

// Play tag - chaser/runner role switches on catch.
class PlayTagAction extends PositionableAction {
    static metadata = {
        id: 'play_tag',
        label: 'Play Tag',
        category: 'social',
        priority: 4,
        isMovementAction: true,
        isInterruptible: true,
        defaultDuration: 5000,
        description: 'Play tag with another Myte',
        requiresTarget: true,
        affectsMood: true,
        moodEffect: 10,
        defaultOptions: {
            catchDistance: 30,
            runDistance: 100,
            isIt: true
        }
    };

    static canPerform(selected, active) {
        return selected instanceof Myte &&
               selected !== active &&
               !active?.queue.isCarrying();
    }

    constructor(myte, options) {
        super(myte, { ...PlayTagAction.metadata.defaultOptions, duration: PlayTagAction.metadata.defaultDuration, ...options });
    }

    update() {
        const target = this.target;
        if (!target) return true;

        const dx = target.posX - this.myte.posX;
        const dy = target.posY - this.myte.posY;
        const distance = Math.hypot(dx, dy);

        if (this.isIt) {
            this.myte.setTarget(target.posX, target.posY);
            this.myte.moveTowardsTarget();

            if (distance < this.catchDistance) {
                this.isIt = false;
                target.queue.add('play_tag', {
                    target: this.myte,
                    isIt: true,
                    duration: this.currentDuration
                });
                return true;
            }
        } else {
            const angle = Math.atan2(dy, dx) + Math.PI;
            this.myte.setTarget(
                this.myte.posX + Math.cos(angle) * this.runDistance,
                this.myte.posY + Math.sin(angle) * this.runDistance
            );
            this.myte.moveTowardsTarget();
        }

        this.currentDuration--;
        return this.currentDuration <= 0;
    }
}

const FetchStates = {
    PICKUP: 'pickup',
    THROW: 'throw',
    CHASE: 'chase',
    RETURN: 'return'
};

// Play fetch with a throwable object.
class PlayFetchAction extends MyteAction {
    static metadata = {
        id: 'play_fetch',
        label: 'Play Fetch',
        category: 'social',
        priority: 4,
        isMovementAction: true,
        isInterruptible: true,
        defaultDuration: 0,
        description: 'Play fetch with a throwable object',
        requiresTarget: true,
        affectsMood: true,
        moodEffect: 8,
        defaultOptions: {
            throwStrength: 10,
            maxThrowDistance: 300,
            fetchState: FetchStates.PICKUP,
            arcHeight: 100,
            pickupDistance: 10,
            catchDistance: 10,
            expressionType: 'excited',
            expressionDuration: 500
        }
    };

    static canPerform(selected, active) {
        return active && selected instanceof MapObject && !active.queue.isCarrying();
    }

    constructor(myte, options) {
        super(myte, { ...PlayFetchAction.metadata.defaultOptions, ...options });
        this.throwPosition = null;
        this.throwTarget = null;
        this.throwProgress = 0;
    }

    start() {
        super.start();
        this.myte.queue.addExpression(this.expressionType, this.expressionDuration);
    }

    update() {
        switch (this.fetchState) {
            case FetchStates.PICKUP: return this._handlePickup();
            case FetchStates.THROW: return this._handleThrow();
            case FetchStates.CHASE: return this._handleChase();
            case FetchStates.RETURN: return this._handleReturn();
            default: return true;
        }
    }

    _handlePickup() {
        if (!this.throwable) return true;

        const dx = this.throwable.posX - this.myte.posX;
        const dy = this.throwable.posY - this.myte.posY;

        if (Math.hypot(dx, dy) > this.pickupDistance) {
            this.myte.setTarget(this.throwable.posX, this.throwable.posY);
            this.myte.moveTowardsTarget();
            return false;
        }

        this.throwPosition = { x: this.myte.posX, y: this.myte.posY };

        const angle = Math.random() * Math.PI * 2;
        const throwDist = Math.random() * this.maxThrowDistance;
        this.throwTarget = {
            x: this.throwPosition.x + Math.cos(angle) * throwDist,
            y: this.throwPosition.y + Math.sin(angle) * throwDist
        };
        this.throwProgress = 0;
        this.fetchState = FetchStates.THROW;
        return false;
    }

    _handleThrow() {
        this.throwProgress += this.throwStrength / 100;

        if (this.throwProgress >= 1) {
            this.fetchState = FetchStates.CHASE;
            return false;
        }

        const t = this.throwProgress;
        const x = this.throwPosition.x + (this.throwTarget.x - this.throwPosition.x) * t;
        const y = this.throwPosition.y + (this.throwTarget.y - this.throwPosition.y) * t
                - Math.sin(t * Math.PI) * this.arcHeight;

        if (this.throwable) {
            this.throwable.setPosition(x, y);
            this.throwable.setSpritePosition(x, y);
        }

        return false;
    }

    _handleChase() {
        if (!this.throwable) return true;

        this.myte.setTarget(this.throwTarget.x, this.throwTarget.y);
        this.myte.moveTowardsTarget();

        if (Math.hypot(this.myte.posX - this.throwTarget.x, this.myte.posY - this.throwTarget.y) < this.catchDistance) {
            this.myte.queue.addExpression('excited', 500);
            this.fetchState = FetchStates.RETURN;
        }

        return false;
    }

    _handleReturn() {
        this.myte.setTarget(this.throwPosition.x, this.throwPosition.y);
        this.myte.moveTowardsTarget();

        if (this.throwable) {
            this.throwable.setPosition(this.myte.posX, this.myte.posY - 20);
            this.throwable.setSpritePosition(this.myte.posX, this.myte.posY - 20);
        }

        if (this.myte.isAtTarget()) {
            this.throwProgress = 0;
            this.fetchState = FetchStates.THROW;
        }

        return false;
    }
}
