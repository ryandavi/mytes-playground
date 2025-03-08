
// Run away from a target object or Myte
class RunAwayAction extends MyteAction {
    static metadata = {
        id: 'run_away',
        label: 'Run Away',
        category: 'reactive',
        priority: 5,
        isMovementAction: true,
        isInterruptible: true,
        defaultDuration: -1,
        description: 'Run away from a scary object or Myte',
        requiresTarget: true,
        affectsMood: true,
        moodEffect: -5,
        defaultOptions: {
            panicDistance: 400,
            runDistance: 350
        }
    };

	constructor(myte, options) {
		super(myte, {
			targetObject: options.targetObject,
			panicDistance: options.panicDistance || RunAwayAction.metadata.defaultOptions.panicDistance,
			runDistance: options.runDistance || RunAwayAction.metadata.defaultOptions.runDistance,
			duration: options.duration || RunAwayAction.metadata.defaultDuration, // -1 means run indefinitely
			...options
		});
	}

    static canPerform(selected, active) {
        return selected instanceof Myte && 
               selected !== active &&
               !active?.queue.isCarrying();
    }

	update() {
		const target = this.targetObject;
		if (!target) return true;

		// Calculate distance to target
		const dx = target.posX - this.myte.posX;
		const dy = target.posY - this.myte.posY;
		const distance = Math.sqrt(dx * dx + dy * dy);

		// Only run if within panic distance
		if (distance < this.panicDistance) {
			// Calculate angle away from target
			const angle = Math.atan2(dy, dx) + Math.PI;

			// Set target point away from scary object
			const runX = this.myte.posX + Math.cos(angle) * this.runDistance;
			const runY = this.myte.posY + Math.sin(angle) * this.runDistance;

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
		if (this.duration > 0) {
			this.current_duration--;
			return this.current_duration <= 0;
		}

		return false; // Continue running indefinitely if no duration set
	}

}

// Hide behind an object
class HideAction extends MyteAction {

    static metadata = {
        id: 'hide',
        label: 'Hide',
        category: 'reactive',
        priority: 4,
        isMovementAction: true,
        isInterruptible: false,
        defaultDuration: 5000,
        description: 'Hide behind an object from something scary',
        requiresTarget: true,
        affectsMood: true,
        moodEffect: -2,
        defaultOptions: {
            peekInterval: 2000
        }
    };
    constructor(myte, options) {
        // Use metadata for defaults
        const defaultOptions = {
            ...HideAction.metadata.defaultOptions,
            duration: options.duration || HideAction.metadata.defaultDuration,
            hideTarget: options.hideTarget,
            scaryObject: options.scaryObject,
            ...options
        };
        super(myte, defaultOptions);
        
        this.peekTimer = this.peekInterval;
        this.isPeeking = false;
    }

    static canPerform(selected, active) {
        return selected && 
               !(selected instanceof Myte) && 
               !active?.queue.isCarrying();
    }

	update() {
		const hideTarget = this.hideTarget;
		const scaryObject = this.scaryObject;

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
			this.peekTimer = this.peekInterval;

			if (this.isPeeking) {
				this.myte.queue.addExpression("peek", 500);
			}
		}

		this.current_duration--;
		return this.current_duration <= 0;
	}

}