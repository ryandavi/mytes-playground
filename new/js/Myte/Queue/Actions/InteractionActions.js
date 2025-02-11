// Object interactions
// Action for going to an object/Myte
class GoToObjectAction extends PositionableAction {
	constructor(myte, options) {
		super(myte, options);
		this.targetObject = options.targetObject;
	}

    update() {
        const targetRect = this.getTargetRect(this.targetObject);
        const myteRect = this.myte.getRect();

        // Calculate initial position
        let horizontal = this.getClosestSideHorizontal(targetRect, myteRect);
        let targetPos = this.calculatePosition(myteRect, targetRect, horizontal, 'bottom', false, true);

        // Adjust for boundaries
        const adjusted = this.adjustPositionToBounds(targetPos, myteRect, targetRect);
        targetPos = adjusted.position;

        // Set target and move toward it
        this.myte.setTarget(targetPos.x, targetPos.y);
        this.myte.move_toward_target();

        return this.myte.is_at_target();
    }

	isMovementAction() {
		return true;
	}
}

// Inspect object action with curiosity animation
class InspectAction extends PositionableAction {
	constructor(myte, options) {
		super(myte, {
			target: options.target,
			duration: options.duration || 3000,
			...options
		});
		this.inspectPoints = this.generateInspectPoints();
		this.currentPoint = 0;
		this.pointDuration = 500;
		this.pointTimer = this.pointDuration;
	}

    generateInspectPoints() {

		let targetRect = this.getTargetRect(this.options.target);

        const points = [];
        const numPoints = 4;
        const myteRect = this.myte.getRect();

        // Generate points around the target using proper positioning
        for (let i = 0; i < numPoints; i++) {
            const angle = (i / numPoints) * Math.PI * 2;
            const horizontal = i % 2 === 0 ? 'left' : 'right';
            const vertical = i < numPoints/2 ? 'top' : 'bottom';
            
            const pos = this.calculatePosition(myteRect, targetRect, horizontal, vertical, false, false);
            points.push(pos);
        }
        return points;
    }

    update() {
        this.pointTimer -= 16;
        if (this.pointTimer <= 0) {
            this.currentPoint = (this.currentPoint + 1) % this.inspectPoints.length;
            this.pointTimer = this.pointDuration;
            // this.myte.queue.addExpression("curious", 300);
        }

        const point = this.inspectPoints[this.currentPoint];
        this.myte.setTarget(point.x, point.y);
        this.myte.move_toward_target();

        this.options.current_duration--;
        return this.options.current_duration <= 0;
    }

	isMovementAction() {
		return true;
	}
}


class EatElementAction extends MyteAction {
	constructor(myte, options) {
		super(myte, options);
		this.target = options.target[0];
	}

	start() {
		super.start();
		this.myte.setTarget(this.target.x, this.target.y);
		this.myte.reset();
	}

	update() {
		if (this.myte.is_at_target()) {
			return true;
		}
		this.myte.move_toward_target();
		return false;
	}

	complete() {
		super.complete();
		if (this.options.mapObject) {
			this.options.mapObject.remove();
		}
	}

	isMovementAction() {
		return false;
	}
}

// Show affection to another Myte
class ShowAffectionAction extends MyteAction {
	constructor(myte, options) {
		super(myte, {
			duration: options.duration || 1500,
			targetMyte: options.targetMyte,
			...options
		});
		this.heartEmitter = null;
		this.emitDelay = 200;
		this.emitTimer = 0;
	}

	start() {
		super.start();
		// Create heart particles if we had a particle system
		this.myte.queue.addExpression("heart", 300, 3);
	}

	update() {
		// Emit hearts periodically
		this.emitTimer -= 16;
		if (this.emitTimer <= 0) {
			// Could emit heart particles here
			this.emitTimer = this.emitDelay;
		}

		this.options.current_duration--;
		return this.options.current_duration <= 0;
	}

	complete() {
		super.complete();
		// Cleanup any particle effects
	}
}
// Play tag with another Myte
class PlayTagAction extends PositionableAction {
	constructor(myte, options) {
		super(myte, {
			duration: options.duration || 5000,
			targetMyte: options.targetMyte,
			catchDistance: options.catchDistance || 30,
			...options
		});
		this.isIt = options.isIt || true;
	}

	update() {
		const target = this.options.targetMyte;
		if (!target) return true;

		const dx = target.posX - this.myte.posX;
		const dy = target.posY - this.myte.posY;
		const distance = Math.sqrt(dx * dx + dy * dy);

		if (this.isIt) {
			// Chase target
			this.myte.setTarget(target.posX, target.posY);
			this.myte.move_toward_target();

			// Tag target if close enough
			if (distance < this.options.catchDistance) {
				this.isIt = false;
				target.queue.add('play_tag', {
					targetMyte: this.myte,
					isIt: true,
					duration: this.options.current_duration
				});
				return true;
			}
		} else {
			// Run away
			const angle = Math.atan2(dy, dx) + Math.PI;
			const runDistance = 100;
			this.myte.setTarget(
				this.myte.posX + Math.cos(angle) * runDistance,
				this.myte.posY + Math.sin(angle) * runDistance
			);
			this.myte.move_toward_target();
		}

		this.options.current_duration--;
		return this.options.current_duration <= 0;
	}

	isMovementAction() {
		return true;
	}
}

// State machine for the fetch game stages
const FetchStates = {
	PICKUP: 'pickup',
	THROW: 'throw',
	CHASE: 'chase',
	RETURN: 'return'
};

// Action to play fetch with throwable objects
class PlayFetchAction extends MyteAction {
	constructor(myte, options) {
		super(myte, {
			throwable: options.throwable, // The object to throw
			throwStrength: options.throwStrength || 10,
			maxThrowDistance: options.maxThrowDistance || 300,
			fetchState: FetchStates.PICKUP,
			...options
		});

		this.throwPosition = null;
		this.throwTarget = null;
		this.throwProgress = 0;
		this.arcHeight = 100; // Height of throw arc
	}

	start() {
		super.start();
		// Start with excitement expression
		this.myte.queue.addExpression("excited", 500);
	}

	update() {
		switch (this.options.fetchState) {
			case FetchStates.PICKUP:
				return this.handlePickup();
			case FetchStates.THROW:
				return this.handleThrow();
			case FetchStates.CHASE:
				return this.handleChase();
			case FetchStates.RETURN:
				return this.handleReturn();
			default:
				return true;
		}
	}

	handlePickup() {
		if (!this.options.throwable) return true;

		// Move to throwable
		const dx = this.options.throwable.posX - this.myte.posX;
		const dy = this.options.throwable.posY - this.myte.posY;
		const distance = Math.sqrt(dx * dx + dy * dy);

		if (distance > 10) {
			this.myte.setTarget(this.options.throwable.posX, this.options.throwable.posY);
			this.myte.move_toward_target();
			return false;
		}

		// Picked up, prepare to throw
		this.throwPosition = {
			x: this.myte.posX,
			y: this.myte.posY
		};

		// Calculate throw target based on mouse position or random direction
		const angle = Math.random() * Math.PI * 2;
		const throwDistance = Math.random() * this.options.maxThrowDistance;
		this.throwTarget = {
			x: this.throwPosition.x + Math.cos(angle) * throwDistance,
			y: this.throwPosition.y + Math.sin(angle) * throwDistance
		};

		this.throwProgress = 0;
		this.options.fetchState = FetchStates.THROW;
		return false;
	}

	handleThrow() {
		this.throwProgress += this.options.throwStrength / 100;

		if (this.throwProgress >= 1) {
			this.options.fetchState = FetchStates.CHASE;
			return false;
		}

		// Calculate arc trajectory
		const x = this.throwPosition.x + (this.throwTarget.x - this.throwPosition.x) * this.throwProgress;
		const y = this.throwPosition.y + (this.throwTarget.y - this.throwPosition.y) * this.throwProgress
			- Math.sin(this.throwProgress * Math.PI) * this.arcHeight;

		// Update throwable position
		if (this.options.throwable) {
			this.options.throwable.setPosition(x, y);
			this.options.throwable.setSpritePosition(x, y);
		}

		return false;
	}

	handleChase() {
		if (!this.options.throwable) return true;

		// Chase the thrown object
		this.myte.setTarget(this.throwTarget.x, this.throwTarget.y);
		this.myte.move_toward_target();

		const distance = Math.sqrt(
			Math.pow(this.myte.posX - this.throwTarget.x, 2) +
			Math.pow(this.myte.posY - this.throwTarget.y, 2)
		);

		// If we reached the object
		if (distance < 10) {
			// Show happy expression
			this.myte.queue.addExpression("happy", 500);
			this.options.fetchState = FetchStates.RETURN;
		}

		return false;
	}

	handleReturn() {
		// Return to original position
		this.myte.setTarget(this.throwPosition.x, this.throwPosition.y);
		this.myte.move_toward_target();

		// Move throwable with Myte
		if (this.options.throwable) {
			const offset = { x: 0, y: -20 };
			this.options.throwable.setPosition(
				this.myte.posX + offset.x,
				this.myte.posY + offset.y
			);
			this.options.throwable.setSpritePosition(
				this.myte.posX + offset.x,
				this.myte.posY + offset.y
			);
		}

		// If we're back at the start
		if (this.myte.is_at_target()) {
			// Start over
			this.throwProgress = 0;
			this.options.fetchState = FetchStates.THROW;
		}

		return false;
	}

	isMovementAction() {
		return true;
	}
}
