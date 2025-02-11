// Action for following mouse cursor
class FollowMouseAction extends MyteAction {
	update() {
		this.myte.updateTargetToFollowMouse();
		this.myte.move_toward_target();
		return false;
	}

	isMovementAction() {
		return true;
	}

	isInterruptible() {
		return true;
	}
}
// Action for following an object/Myte
class FollowObjectAction extends PositionableAction {
	constructor(myte, options) {
		super(myte, options);
		this.targetObject = options.targetObject;
	}

    update() {
        if (!this.targetObject) return true;

        let targetRect = this.targetObject.getOffsetRect();
        const myteRect = this.myte.getRect();
        const canvasWidth = this.myte.parent.getCanvasRect().width;

        // Calculate closest side 
        let horizontal = this.getClosestSideHorizontal(targetRect, myteRect);
        let vertical = 'bottom';

        // Calculate initial target position
        let targetPos = this.calculatePosition(myteRect, targetRect, horizontal, vertical, false, true);

        // Check boundaries and adjust position if needed
        if (targetPos.x + myteRect.width > canvasWidth || targetPos.x < 0) {
            horizontal = (targetPos.x < 0) ? 'right' : 'left';
            targetPos = this.calculatePosition(myteRect, targetRect, horizontal, vertical, false, true);
        }

        this.myte.setTarget(targetPos.x, targetPos.y);
        this.myte.move_toward_target();

        return false; // Continue following until interrupted
    }

	isMovementAction() {
		return true;
	}

	isInterruptible() {
		return true;
	}
}


// Pattern movements
// Action for running laps around an element
class RunLapsAction extends MyteAction {
	constructor(myte, options) {
		super(myte, options);
		this.targets = options.target;
		this.currentTargetIndex = options.current_target_index || 0;
		this.options.repeat = options.repeat || 1;
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
				if (this.options.repeat <= 0) {
					// complete
					return true;
				}
			}
			this.myte.setTarget(
				this.targets[this.currentTargetIndex].x,
				this.targets[this.currentTargetIndex].y
			);
		}
		this.myte.move_toward_target();
		return false;
	}

	complete() {
		super.complete();
		console.log("complete laps");
	}


	isMovementAction() {
		return true;
	}
}
// Circle around a target point
class CircleAction extends MyteAction {
	constructor(myte, options) {
		super(myte, {
			duration: options.duration || 3000,
			radius: options.radius || 50,
			centerX: options.centerX || myte.posX,
			centerY: options.centerY || myte.posY,
			...options
		});
		this.angle = 0;
		this.speed = 0.01;
	}


	update() {
		this.angle += this.speed;

		const newX = this.options.centerX + Math.cos(this.angle) * this.options.radius;
		const newY = this.options.centerY + Math.sin(this.angle) * this.options.radius;

		this.myte.setTarget(newX, newY);
		this.myte.move_toward_target();

		this.options.current_duration--;
		return this.options.current_duration <= 0;
	}

	isMovementAction() {
		return true;
	}
}
// Zigzag movement pattern
class ZigzagAction extends MyteAction {
	constructor(myte, options) {
		super(myte, {
			duration: options.duration || 2000,
			amplitude: options.amplitude || 100, // height
			frequency: options.frequency || 0.05, // width
			direction: options.direction || { x: 1, y: 0 },
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

	isMovementAction() {
		return true;
	}
}

// Physics-based movement
// Jumping action with physics
class JumpAction extends MyteAction {
	constructor(myte, options) {
		super(myte, {
			duration: options.duration || 1000,
			height: options.height || 100,
			...options
		});
		this.initialY = myte.posY;
		this.maxHeight = this.initialY - this.options.height;
		this.gravity = 0.5;
		this.velocity = -12; // Negative means going up
	}

	update() {
		this.velocity += this.gravity;
		this.myte.posY += this.velocity;

		// Bounce back up if we hit the ground
		if (this.myte.posY >= this.initialY) {
			this.myte.posY = this.initialY;
			this.velocity = -this.velocity * 0.5; // Reduce bounce height

			// Stop if bounce is too small
			if (Math.abs(this.velocity) < 2) {
				return true;
			}
		}

		this.myte.setSpritePosition(null, this.myte.posY);
		return false;
	}
}
