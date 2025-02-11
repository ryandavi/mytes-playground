
// Run away from a target object or Myte
class RunAwayAction extends MyteAction {
	constructor(myte, options) {
		super(myte, {
			targetObject: options.targetObject,
			panicDistance: options.panicDistance || 400,
			runDistance: options.runDistance || 350,
			duration: options.duration || -1, // -1 means run indefinitely
			...options
		});
	}

	update() {
		const target = this.options.targetObject;
		if (!target) return true;

		// Calculate distance to target
		const dx = target.posX - this.myte.posX;
		const dy = target.posY - this.myte.posY;
		const distance = Math.sqrt(dx * dx + dy * dy);

		// Only run if within panic distance
		if (distance < this.options.panicDistance) {
			// Calculate angle away from target
			const angle = Math.atan2(dy, dx) + Math.PI;

			// Set target point away from scary object
			const runX = this.myte.posX + Math.cos(angle) * this.options.runDistance;
			const runY = this.myte.posY + Math.sin(angle) * this.options.runDistance;

			// Ensure we don't run off screen
			const boundedX = Math.max(0, Math.min(runX, this.myte.parent.getMaxDimensions().width));
			const boundedY = Math.max(0, Math.min(runY, this.myte.parent.getMaxDimensions().height));

			this.myte.setTarget(boundedX, boundedY);


			// Occasionally show panic expression
			if (Math.random() < 0.02) {
				this.myte.queue.addExpressionToBeginning("panic", 200);
			}

		}

		this.myte.move_toward_target();

		// Check duration if set
		if (this.options.duration > 0) {
			this.options.current_duration--;
			return this.options.current_duration <= 0;
		}

		return false; // Continue running indefinitely if no duration set
	}

	isMovementAction() {
		return false;
	}

	isInterruptible() {
		return true;
	}
}

// Hide behind an object
class HideAction extends MyteAction {
	constructor(myte, options) {
		super(myte, {
			hideTarget: options.hideTarget, // Object to hide behind
			scaryObject: options.scaryObject, // Object to hide from
			peekInterval: options.peekInterval || 2000,
			duration: options.duration || 5000,
			...options
		});
		this.peekTimer = this.options.peekInterval;
		this.isPeeking = false;
	}

	update() {
		const hideTarget = this.options.hideTarget;
		const scaryObject = this.options.scaryObject;

		if (!hideTarget || !scaryObject) return true;

		// Get the far side of the hiding spot relative to scary object
		const dx = hideTarget.posX - scaryObject.posX;
		const dy = hideTarget.posY - scaryObject.posY;
		const angle = Math.atan2(dy, dx);

		// Calculate hide position behind object
		const hideX = hideTarget.posX + Math.cos(angle) * 30;
		const hideY = hideTarget.posY + Math.sin(angle) * 30;

		// Move to hide position
		this.myte.setTarget(hideX, hideY);
		this.myte.move_toward_target();

		// Handle peeking behavior
		this.peekTimer -= 16;
		if (this.peekTimer <= 0) {
			this.isPeeking = !this.isPeeking;
			this.peekTimer = this.options.peekInterval;

			if (this.isPeeking) {
				this.myte.queue.addExpression("peek", 500);
			}
		}

		this.options.current_duration--;
		return this.options.current_duration <= 0;
	}

	isMovementAction() {
		return true;
	}
}