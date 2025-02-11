// Action for dancing
class DanceAction extends MyteAction {
    constructor(myte, options) {
        super(myte, {
            ...options,
            duration: options.duration || 2000,
        });
        this.danceSteps = [
            { x: 0, y: -20 },
            { x: 20, y: 0 },
            { x: 0, y: 20 },
            { x: -20, y: 0 }
        ];
        this.currentStep = 0;
        this.stepDuration = 250;
        this.stepTimer = this.stepDuration;
    }

    start() {
        super.start();
        this.baseX = this.myte.posX;
        this.baseY = this.myte.posY;
        // this.myte.queue.addExpression("dance", 200, 8);
        this.options.current_duration = this.options.duration;
    }

    update() {
        this.stepTimer -= 16; // Assuming 60fps

        // Move to the next step
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

        this.options.current_duration--;
        return this.options.current_duration <= 0;
    }

    isMovementAction() {
        return true;
    }
}

// Action for sleep animation
class SimpleSleepAction extends MyteAction {
    constructor(myte, options) {
        super(myte, {
            ...options,
            duration: options.duration || 5000,
        });
        this.zPosition = 0;
        this.zSpeed = 0.1;
    }

    start() {
        super.start();
        this.baseY = this.myte.posY;
        this.myte.queue.addExpression("sleep", 500, 10);
    }

    update() {
        // Gentle floating animation while sleeping
        this.zPosition += this.zSpeed;
        if (this.zPosition > 1 || this.zPosition < 0) {
            this.zSpeed = -this.zSpeed;
        }

        this.myte.setPosition(null, this.baseY - (Math.sin(this.zPosition * Math.PI) * 10));

        this.options.current_duration--;
        return this.options.current_duration <= 0;
    }
}
// Sleep action with bobbing animation and Z's
class SleepAction extends MyteAction {
    constructor(myte, options) {
        super(myte, {
            duration: options.duration || 5000,
            bobHeight: options.bobHeight || 5,
            ...options
        });
        this.bobPhase = 0;
        this.zTimer = 1000; // Time between Z's
        this.startY = myte.posY;
    }

    start() {
        super.start();
        this.myte.queue.addExpression("sleep", 1000);
    }

    update() {
        // Gentle bobbing motion
        this.bobPhase += 0.05;
        const newY = this.startY + Math.sin(this.bobPhase) * this.options.bobHeight;
        this.myte.setPosition(null, newY);
        this.myte.setSpritePosition(null, newY);

        // Spawn Z's periodically
        this.zTimer -= 16;
        if (this.zTimer <= 0) {
            // Could spawn Z particle effect here
            this.zTimer = 1000;
            // this.myte.queue.addExpression("sleep", 500);
        }

        this.options.current_duration--;
        return this.options.current_duration <= 0;
    }
}

class SpinAction extends MyteAction {
    constructor(myte, options) {
        super(myte, {
            duration: options.duration || 1000,
            rotations: options.rotations || 2,
            ...options
        });
        this.directions = [
            DIRECTION.NORTH,
            // DIRECTION.NORTHEAST,
            DIRECTION.EAST,
            // DIRECTION.SOUTHEAST,
            DIRECTION.SOUTH,
            // DIRECTION.SOUTHWEST,
            DIRECTION.WEST,
            // DIRECTION.NORTHWEST
        ];
        this.currentDirectionIndex = 0;
        this.frameDelay = 16; // Math.floor(options.duration / (this.directions.length * options.rotations));
        this.frameTimer = this.frameDelay;
    }

    update() {
        this.frameTimer--;
        if (this.frameTimer <= 0) {
            this.currentDirectionIndex = (this.currentDirectionIndex + 1) % this.directions.length;
            this.myte.setDirection(this.directions[this.currentDirectionIndex]);
            this.frameTimer = this.frameDelay;
        }

        this.options.current_duration--;
        return this.options.current_duration <= 0;
    }
}
