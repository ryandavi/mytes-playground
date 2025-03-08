// Action for picking up another Myte
class CarryPickupAction extends MyteAction {
    static metadata = {
        id: 'carry_pickup',
        label: 'Pick Up',
        category: 'interactions',
        priority: 2,
        isMovementAction: true,
        isInterruptible: false,
        defaultDuration: 100,
        description: 'Pick up another Myte',
        requiresTarget: true,
        affectsMood: true,
        moodEffect: 2
    };

    constructor(myte, options) {
        super(myte, options);
        this.target = options.target;
        this.startPosition = {
            x: this.target.posX,
            y: this.target.posY
        };
        this.CARRY_OFFSET = 45;
    }

    static canPerform(selected, active) {
        return selected instanceof Myte && 
        selected !== active && 
        !selected.queue.isBeingCarried() &&
        !active?.queue.isCarrying();
    }

    update() {
        if (this.current_duration === -1) {
            this.current_duration = this.duration;
        }

        const progress = 1 - (this.current_duration / this.duration);
        const easedProgress = 1 - Math.pow(1 - progress, 3);

        const currentPos = {
            x: this.startPosition.x + (this.myte.posX - this.startPosition.x) * easedProgress,
            y: this.startPosition.y + ((this.myte.posY - this.CARRY_OFFSET) - this.startPosition.y) * easedProgress
        };

        if (this.target) {
            this.target.setPosition(currentPos.x, currentPos.y);
            this.target.setSpritePosition(currentPos.x, currentPos.y);
        }

        this.current_duration--;

        if (this.current_duration <= 0) {
            // Start the carry action
            this.myte.queue.add('carry', {
                target: this.target,
                duration: -1
            });

            // Add being_carried to target's queue
            this.target.queue.clear();
            this.target.queue.add('being_carried', {
                carrierMyte: this.myte,
                duration: -1
            });
        }

        return this.current_duration <= 0;
    }
}

// Action for carrying another Myte
class CarryAction extends MyteAction {

    static metadata = {
        id: 'carry',
        label: 'Carry',
        category: 'interactions',
        priority: 2,
        isMovementAction: true,
        isInterruptible: true,
        defaultDuration: -1,
        description: 'Carry another Myte around',
        requiresTarget: true,
        affectsMood: false
    };
    constructor(myte, options) {
        super(myte, options);
        this.target = options.target;
        this.CARRY_OFFSET = 45;
    }

    static canPerform(selected, active) {
        return active?.queue.isCarrying();
    }


    update() {

        // Update myte to follow mouse
        this.myte.updateTargetToFollowMouse();
        this.myte.move_toward_target();

        if (this.target) {
            const offset = { x: 0, y: -this.CARRY_OFFSET };
            this.target.setPosition(
                this.myte.posX + offset.x,
                this.myte.posY + offset.y
            );
            this.target.setSpritePosition(
                this.myte.posX + offset.x,
                this.myte.posY + offset.y
            );
        }

        return false; // Carry action continues until interrupted
    }

}

// Action for being carried
class BeingCarriedAction extends MyteAction {

    static metadata = {
        id: 'being_carried',
        label: 'Being Carried',
        category: 'passive',
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
        return false; // Continue until interrupted
    }
}

// Action for putting down a carried Myte
class CarryPutdownAction extends MyteAction {

    static metadata = {
        id: 'carry_putdown',
        label: 'Put Down',
        category: 'interactions',
        priority: 2,
        isMovementAction: true,
        isInterruptible: false,
        defaultDuration: 100,
        description: 'Put down a carried Myte',
        requiresTarget: true,
        affectsMood: false
    };

    constructor(myte, options) {
        super(myte, options);
        this.target = options.target;
        this.startPosition = {
            x: this.target.posX,
            y: this.target.posY
        };
        this.CARRY_OFFSET = 45;
    }

    static canPerform(selected, active) {
        return active?.queue.isCarrying();
    }

    update() {
        if (this.current_duration === -1) {
            this.current_duration = this.duration;
        }

        const progress = 1 - (this.current_duration / this.duration);
        const easedProgress = 1 - Math.pow(1 - progress, 3);

        const currentPos = {
            x: this.startPosition.x + (this.myte.posX - this.startPosition.x) * easedProgress,
            y: this.startPosition.y + ((this.myte.posY + this.CARRY_OFFSET) - this.startPosition.y) * easedProgress
        };

        if (this.target) {
            this.target.setPosition(currentPos.x, currentPos.y);
            this.target.setSpritePosition(currentPos.x, currentPos.y);
        }

        this.current_duration--;

        if (this.current_duration <= 0) {
            // Clear carried Myte's queue
            const carriedMyte = this.target;
            if (carriedMyte) {
                carriedMyte.queue.clear();
            }
        }

        return this.current_duration <= 0;
    }
}