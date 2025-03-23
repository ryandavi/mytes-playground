// Action for dancing
class DanceAction extends MyteAction {
    static metadata = {
        id: 'dance',
        label: 'Dance',
        category: 'state',
        priority: 3,
        isMovementAction: true,
        isInterruptible: false,
        defaultDuration: 2000,
        description: 'Perform a happy dance',
        requiresTarget: false,
        affectsMood: true,
        moodEffect: 10,
        defaultOptions: {
            stepDuration: 250
        }
    };
    constructor(myte, options) {
        super(myte, {
            ...DanceAction.metadata.defaultOptions,
            duration: options.duration || DanceAction.metadata.defaultDuration,
            ...options
        });
        
        this.danceSteps = [
            { x: 0, y: -20 },
            { x: 20, y: 0 },
            { x: 0, y: 20 },
            { x: -20, y: 0 }
        ];
        this.currentStep = 0;
        this.stepDuration = this.stepDuration;
        this.stepTimer = this.stepDuration;
    }

    static canPerform(selected, active) {
        return selected === active && !active?.queue.isCarrying();
    }

    start() {
        super.start();
        this.baseX = this.myte.posX;
        this.baseY = this.myte.posY;
        this.current_duration = this.duration;
    }

    update() {
        this.stepTimer -= 16; // Assuming 60fps

        if (this.stepTimer <= 0) {
            this.currentStep = (this.currentStep + 1) % this.danceSteps.length;
            this.stepTimer = this.stepDuration;

            const step = this.danceSteps[this.currentStep];
            this.myte.setTarget(
                this.baseX + step.x,
                this.baseY + step.y
            );
        }

        this.myte.move_toward_target();

        this.current_duration--;
        return this.current_duration <= 0;
    }

}

// Sleep action with complete metadata defaults
class SleepAction extends MyteAction {
    static metadata = {
        id: 'sleep',
        label: 'Sleep',
        category: 'state',
        priority: 2,
        isMovementAction: false,
        isInterruptible: true,
        defaultDuration: 5000,
        description: 'Take a deep sleep with bobbing animation and Z\'s',
        requiresTarget: false,
        affectsMood: true,
        moodEffect: 8,
        defaultOptions: {
            bobHeight: 5,
            zInterval: 1000
        }
    };

    constructor(myte, options) {
        super(myte, {
            ...SleepAction.metadata.defaultOptions,
            duration: options.duration || SleepAction.metadata.defaultDuration,
            ...options
        });
        this.bobPhase = 0;
        this.zTimer = this.zInterval;
        this.startY = myte.posY;
    }

    static canPerform(selected, active) {
        return selected === active && !active?.queue.isCarrying();
    }

    start() {
        super.start();
        this.myte.queue.addExpression("sleep", 1000);
    }

    update() {
        this.bobPhase += 0.05;
        const newY = this.startY + Math.sin(this.bobPhase) * this.bobHeight;
        this.myte.setPosition(null, newY);
        this.myte.setSpritePosition(null, newY);

        this.zTimer -= 16;
        if (this.zTimer <= 0) {
            this.zTimer = this.zInterval;
        }

        this.current_duration--;
        return this.current_duration <= 0;
    }
}


// Spin action with complete metadata defaults
class SpinAction extends MyteAction {
    static metadata = {
        id: 'spin',
        label: 'Spin',
        category: 'state',
        priority: 3,
        isMovementAction: false,
        isInterruptible: false,
        defaultDuration: 1000,
        description: 'Spin around in place',
        requiresTarget: false,
        affectsMood: true,
        moodEffect: 3,
        defaultOptions: {
            rotations: 2,
            frameDelay: 16
        }
    };

    static canPerform(selected, active) {
        return selected === active && !active?.queue.isCarrying();
    }

    constructor(myte, options) {
        super(myte, {
            ...SpinAction.metadata.defaultOptions,
            duration: options.duration || SpinAction.metadata.defaultDuration,
            ...options
        });
        
        this.directions = [
            DIRECTION.NORTH,
            DIRECTION.EAST,
            DIRECTION.SOUTH,
            DIRECTION.WEST
        ];
        this.currentDirectionIndex = 0;
        this.frameDelay = this.frameDelay;
        this.frameTimer = this.frameDelay;
    }

    update() {
        this.frameTimer--;
        if (this.frameTimer <= 0) {
            this.currentDirectionIndex = (this.currentDirectionIndex + 1) % this.directions.length;
            this.myte.setDirection(this.directions[this.currentDirectionIndex]);
            this.frameTimer = this.frameDelay;
        }

        this.current_duration--;
        return this.current_duration <= 0;
    }
}

// Action for simple sleep animation
class SimpleSleepAction extends MyteAction {
    static metadata = {
        id: 'simple_sleep',
        label: 'Take a Nap',
        category: 'state',
        priority: 2,
        isMovementAction: false,
        isInterruptible: true,
        defaultDuration: 5000,
        description: 'Take a quick nap with gentle floating animation',
        requiresTarget: false,
        affectsMood: true,
        moodEffect: 5,
        defaultOptions: {
            zSpeed: 0.1
        }
    };

    constructor(myte, options) {
        super(myte, {
            ...SimpleSleepAction.metadata.defaultOptions,
            duration: options.duration || SimpleSleepAction.metadata.defaultDuration,
            ...options
        });
        this.zPosition = 0;
        this.zSpeed = this.zSpeed;
    }

    static canPerform(selected, active) {
        return selected === active && !active?.queue.isCarrying();
    }

    start() {
        super.start();
        this.baseY = this.myte.posY;
        this.myte.queue.addExpression("sleep", 500, 10);
    }

    update() {
        this.zPosition += this.zSpeed;
        if (this.zPosition > 1 || this.zPosition < 0) {
            this.zSpeed = -this.zSpeed;
        }

        this.myte.setPosition(null, this.baseY - (Math.sin(this.zPosition * Math.PI) * 10));

        this.current_duration--;
        return this.current_duration <= 0;
    }
}