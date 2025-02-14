// Follow mouse action
class FollowMouseAction extends MyteAction {
    static metadata = {
        id: 'follow_mouse',
        label: 'Follow Mouse',
        category: 'movement',
        priority: 1,
        isMovementAction: true,
        isInterruptible: true,
        defaultDuration: -1,
        description: 'Follow the mouse cursor',
        requiresTarget: false,
        affectsMood: false
    };

    static canPerform(selected, active) {
        return active === selected && !active?.queue.isCarrying();
    }

    update() {
        this.myte.updateTargetToFollowMouse();
        this.myte.move_toward_target();
        return false;
    }
}

// Follow object action
class FollowObjectAction extends PositionableAction {
    static metadata = {
        id: 'follow_object',
        label: 'Follow Object',
        category: 'movement',
        priority: 2,
        isMovementAction: true,
        isInterruptible: true,
        defaultDuration: -1,
        description: 'Follow another object or Myte',
        requiresTarget: true,
        affectsMood: false,
        defaultOptions: {
            vertical: 'bottom',
            insideHorizontal: false,
            insideVertical: true
        }
    };

    static canPerform(selected, active) {
        return active && selected && selected !== active && !active?.queue.isCarrying();
    }

    constructor(myte, options) {
        super(myte, {
            ...FollowObjectAction.metadata.defaultOptions,
            duration: FollowObjectAction.metadata.defaultDuration,
            ...options
        });
        this.targetObject = options.targetObject;
    }

    update() {
        if (!this.targetObject) return true;

        let targetRect = this.targetObject.getOffsetRect();
        const myteRect = this.myte.getRect();
        const canvasWidth = this.myte.parent.getCanvasRect().width;

        let horizontal = this.getClosestSideHorizontal(targetRect, myteRect);
        let targetPos = this.calculatePosition(
            myteRect, 
            targetRect, 
            horizontal, 
            this.options.vertical, 
            this.options.insideHorizontal, 
            this.options.insideVertical
        );

        if (targetPos.x + myteRect.width > canvasWidth || targetPos.x < 0) {
            horizontal = (targetPos.x < 0) ? 'right' : 'left';
            targetPos = this.calculatePosition(
                myteRect, 
                targetRect, 
                horizontal, 
                this.options.vertical, 
                this.options.insideHorizontal, 
                this.options.insideVertical
            );
        }

        this.myte.setTarget(targetPos.x, targetPos.y);
        this.myte.move_toward_target();

        return false;
    }
}

// Run laps action
class RunLapsAction extends MyteAction {
    static metadata = {
        id: 'run_laps',
        label: 'Run Laps',
        category: 'movement',
        priority: 3,
        isMovementAction: true,
        isInterruptible: true,
        defaultDuration: 0,
        description: 'Run laps around a target',
        requiresTarget: true,
        affectsMood: true,
        moodEffect: 5,
        defaultOptions: {
            repeat: 1,
            current_target_index: 0
        }
    };

    static canPerform(selected, active) {
        return active && selected && !active?.queue.isCarrying();
    }

    constructor(myte, options) {
        super(myte, {
            ...RunLapsAction.metadata.defaultOptions,
            duration: RunLapsAction.metadata.defaultDuration,
            ...options
        });
        this.targets = options.target;
        this.currentTargetIndex = this.options.current_target_index;
    }

    start() {
        super.start();
        this.myte.setTarget(
            this.targets[this.currentTargetIndex].x,
            this.targets[this.currentTargetIndex].y
        );
        this.myte.reset();
    }

    update() {
        if (this.myte.is_at_target()) {
            this.currentTargetIndex = (this.currentTargetIndex + 1) % this.targets.length;
            if (this.currentTargetIndex === 0) {
                this.options.repeat--;
                if (this.options.repeat <= 0) return true;
            }
            this.myte.setTarget(
                this.targets[this.currentTargetIndex].x,
                this.targets[this.currentTargetIndex].y
            );
        }
        this.myte.move_toward_target();
        return false;
    }
}

// Circle action
class CircleAction extends MyteAction {
    static metadata = {
        id: 'circle',
        label: 'Circle',
        category: 'movement',
        priority: 3,
        isMovementAction: true,
        isInterruptible: true,
        defaultDuration: 3000,
        description: 'Move in a circular pattern',
        requiresTarget: false,
        affectsMood: true,
        moodEffect: 3,
        defaultOptions: {
            radius: 50,
            speed: 0.01,
            centerX: null,
            centerY: null
        }
    };

    static canPerform(selected, active) {
        return active === selected && !active?.queue.isCarrying();
    }

    constructor(myte, options) {
        super(myte, {
            ...CircleAction.metadata.defaultOptions,
            centerX: options.centerX || myte.posX,
            centerY: options.centerY || myte.posY,
            duration: CircleAction.metadata.defaultDuration,
            ...options
        });
        this.angle = 0;
    }

    update() {
        this.angle += this.options.speed;

        const newX = this.options.centerX + Math.cos(this.angle) * this.options.radius;
        const newY = this.options.centerY + Math.sin(this.angle) * this.options.radius;

        this.myte.setTarget(newX, newY);
        this.myte.move_toward_target();

        this.options.current_duration--;
        return this.options.current_duration <= 0;
    }
}

// Zigzag action
class ZigzagAction extends MyteAction {
    static metadata = {
        id: 'zigzag',
        label: 'Zigzag',
        category: 'movement',
        priority: 3,
        isMovementAction: true,
        isInterruptible: true,
        defaultDuration: 2000,
        description: 'Move in a zigzag pattern',
        requiresTarget: false,
        affectsMood: true,
        moodEffect: 4,
        defaultOptions: {
            amplitude: 100,
            frequency: 0.05,
            direction: { x: 1, y: 0 }
        }
    };

    static canPerform(selected, active) {
        return active === selected && !active?.queue.isCarrying();
    }

    constructor(myte, options) {
        super(myte, {
            ...ZigzagAction.metadata.defaultOptions,
            duration: ZigzagAction.metadata.defaultDuration,
            ...options
        });
        this.startX = myte.posX;
        this.startY = myte.posY;
        this.distance = 0;
    }

    update() {
        this.distance += 1;

        const zigzag = Math.sin(this.distance * this.options.frequency) * this.options.amplitude;
        const newX = this.startX + this.distance * this.options.direction.x - zigzag * this.options.direction.y;
        const newY = this.startY + this.distance * this.options.direction.y + zigzag * this.options.direction.x;

        this.myte.setTarget(newX, newY);
        this.myte.move_toward_target();

        this.options.current_duration--;
        return this.options.current_duration <= 0;
    }
}

// Jump action
class JumpAction extends MyteAction {
    static metadata = {
        id: 'jump',
        label: 'Jump',
        category: 'movement',
        priority: 2,
        isMovementAction: true,
        isInterruptible: false,
        defaultDuration: 0,
        description: 'Jump with physics-based movement',
        requiresTarget: false,
        affectsMood: true,
        moodEffect: 3,
        defaultOptions: {
            height: 100,
            gravity: 0.5,
            initialVelocity: -12,
            bounceReduction: 0.5,
            minBounceVelocity: 2
        }
    };

    static canPerform(selected, active) {
        return active === selected && !active?.queue.isCarrying();
    }

    constructor(myte, options) {
        super(myte, {
            ...JumpAction.metadata.defaultOptions,
            ...options
        });
        
        this.gravity = this.options.gravity;
        this.velocity = this.options.initialVelocity;
    }

    start() {
        super.start();
        this.groundY = this.myte.posY;
        this.maxHeight = this.groundY - this.options.height;
    }

    update() {
        this.velocity += this.gravity;
        this.myte.posY += this.velocity;

        if (this.myte.posY >= this.groundY) {
            this.myte.posY = this.groundY;
            this.velocity = -this.velocity * this.options.bounceReduction;

            if (Math.abs(this.velocity) < this.options.minBounceVelocity) {
                return true;
            }
        }

        this.myte.setSpritePosition(null, this.myte.posY);
        return false;
    }

    complete() {
        super.complete();
        this.velocity = 0;
        this.myte.posY = this.groundY;
    }
}

