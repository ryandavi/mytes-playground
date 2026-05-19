const CARRY_OFFSET = 45;

// Pickup animation — lifts target Myte toward the carrier over a fixed duration
class CarryPickupAction extends MyteAction {
    static metadata = {
        id: 'carry_pickup',
        label: 'Pick Up',
        category: 'carry',
        priority: 2,
        isMovementAction: true,
        isInterruptible: false,
        defaultDuration: 100,
        description: 'Pick up another Myte',
        requiresTarget: true,
        affectsMood: true,
        moodEffect: 2
    };

    static canPerform(selected, active) {
        return selected instanceof Myte &&
               selected !== active &&
               !selected.queue.isBeingCarried() &&
               !active?.queue.isCarrying();
    }

    constructor(myte, options) {
        super(myte, options);
        this.startPosition = { x: this.target.posX, y: this.target.posY };
    }

    update() {
        if (this.current_duration === -1) {
            this.current_duration = this.duration;
        }

        const progress      = 1 - (this.current_duration / this.duration);
        const easedProgress = 1 - Math.pow(1 - progress, 3);

        const currentPos = {
            x: this.startPosition.x + (this.myte.posX - this.startPosition.x) * easedProgress,
            y: this.startPosition.y + ((this.myte.posY - CARRY_OFFSET) - this.startPosition.y) * easedProgress
        };

        this.target.setPosition(currentPos.x, currentPos.y);
        this.target.setSpritePosition(currentPos.x, currentPos.y);

        this.current_duration--;

        if (this.current_duration <= 0) {
            this.myte.queue.add('carry', { target: this.target, duration: -1 });
            this.target.queue.clear();
            this.target.queue.add('being_carried', { carrierMyte: this.myte, duration: -1 });
        }

        return this.current_duration <= 0;
    }
}

// Carry — the carrier follows the mouse while keeping the target overhead
class CarryAction extends MyteAction {
    static metadata = {
        id: 'carry',
        label: 'Carry',
        category: 'carry',
        priority: 2,
        isMovementAction: true,
        isInterruptible: true,
        defaultDuration: -1,
        description: 'Carry another Myte around',
        requiresTarget: true,
        affectsMood: false
    };

    static canPerform(selected, active) {
        return active?.queue.isCarrying();
    }

    update() {
        this.myte.updateTargetToFollowMouse();
        this.myte.move_toward_target();

        this.target.setPosition(this.myte.posX, this.myte.posY - CARRY_OFFSET);
        this.target.setSpritePosition(this.myte.posX, this.myte.posY - CARRY_OFFSET);

        return false;
    }
}

// Being carried — passive state on the carried Myte
class BeingCarriedAction extends MyteAction {
    static metadata = {
        id: 'being_carried',
        label: 'Being Carried',
        category: 'carry',
        priority: 1,
        isMovementAction: false,
        isInterruptible: false,
        defaultDuration: -1,
        description: 'Being carried by another Myte',
        requiresTarget: false,
        affectsMood: true,
        moodEffect: 1
    };

    static canPerform(selected, active) {
        return selected instanceof Myte &&
               selected !== active &&
               !selected.queue.isBeingCarried() &&
               !active?.queue.isCarrying();
    }

    update() {
        return false;
    }
}

// Putdown animation — lowers the carried Myte to the ground
class CarryPutdownAction extends MyteAction {
    static metadata = {
        id: 'carry_putdown',
        label: 'Put Down',
        category: 'carry',
        priority: 2,
        isMovementAction: true,
        isInterruptible: false,
        defaultDuration: 100,
        description: 'Put down a carried Myte',
        requiresTarget: true,
        affectsMood: false
    };

    static canPerform(selected, active) {
        return active?.queue.isCarrying();
    }

    constructor(myte, options) {
        super(myte, options);
        this.startPosition = { x: this.target.posX, y: this.target.posY };
    }

    update() {
        if (this.current_duration === -1) {
            this.current_duration = this.duration;
        }

        const progress      = 1 - (this.current_duration / this.duration);
        const easedProgress = 1 - Math.pow(1 - progress, 3);

        const currentPos = {
            x: this.startPosition.x + (this.myte.posX - this.startPosition.x) * easedProgress,
            y: this.startPosition.y + ((this.myte.posY + CARRY_OFFSET) - this.startPosition.y) * easedProgress
        };

        this.target.setPosition(currentPos.x, currentPos.y);
        this.target.setSpritePosition(currentPos.x, currentPos.y);
        this.current_duration--;

        if (this.current_duration <= 0) {
            this.target.queue.clear();
        }

        return this.current_duration <= 0;
    }
}

// Hold a BallMapObject (no queue on the ball side)
class HoldBallAction extends MyteAction {
    static metadata = {
        id: 'hold-ball',
        label: 'Hold Ball',
        category: 'carry',
        priority: 2,
        isMovementAction: true,
        isInterruptible: true,
        defaultDuration: -1,
        description: 'Carry a ball',
        requiresTarget: false,
        affectsMood: false
    };

    static canPerform(selected, active) {
        return active?.queue.isCarrying();
    }

    constructor(myte, options) {
        super(myte, options);
        this.ball = options.ball ?? null;
    }

    start() {
        super.start();
        if (this.ball) {
            this.ball.pendingPickup = false;
            this.ball.pickup(this.myte);
        }
    }

    update() {
        if (!this.ball) return true;
        this.myte.updateTargetToFollowMouse();
        this.myte.move_toward_target();
        return false;
    }

    interrupt() {
        super.interrupt();
        this._dropBall();
    }

    complete() {
        super.complete();
        this._dropBall();
    }

    _dropBall() {
        if (!this.ball) return;
        const dx   = this.myte.targetX - this.myte.posX;
        const dy   = this.myte.targetY - this.myte.posY;
        const dist = Math.hypot(dx, dy);
        const spd  = 3;
        this.ball.pendingPickup = false;
        this.ball.drop(
            dist > 1 ? (dx / dist) * spd : 0,
            dist > 1 ? (dy / dist) * spd : 0
        );
        this.ball = null;
    }
}
