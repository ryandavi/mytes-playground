// Object interactions
// Going to an object action
class GoToObjectAction extends PositionableAction {
    static metadata = {
        id: 'go_to_object',
        label: 'Go To',
        category: 'interactions',
        priority: 1,
        isMovementAction: true,
        isInterruptible: true,
        defaultDuration: 0,
        description: 'Move to a specific object or Myte',
        requiresTarget: true,
        affectsMood: false,
        defaultOptions: {
            vertical: 'bottom',
            insideHorizontal: false,
            insideVertical: true
        }
    };

    static canPerform(selected, active) {
        return active && selected && !active.queue.isCarrying();
    }

    constructor(myte, options) {
        super(myte, {
            ...GoToObjectAction.metadata.defaultOptions,
            duration: GoToObjectAction.metadata.defaultDuration,
            ...options
        });
        this.targetObject = options.targetObject;
    }

    update() {
        const targetRect = this.getTargetRect(this.targetObject);
        const myteRect = this.myte.getRect();
        let horizontal = this.getClosestSideHorizontal(targetRect, myteRect);
        let targetPos = this.calculatePosition(
            myteRect, 
            targetRect, 
            horizontal, 
            this.options.vertical, 
            this.options.insideHorizontal, 
            this.options.insideVertical
        );

        const adjusted = this.adjustPositionToBounds(targetPos, myteRect, targetRect);
        targetPos = adjusted.position;

        this.myte.setTarget(targetPos.x, targetPos.y);
        this.myte.move_toward_target();

        return this.myte.is_at_target();
    }
}

// Inspect object action with curiosity animation
// Inspect object action
class InspectAction extends PositionableAction {
    static metadata = {
        id: 'inspect',
        label: 'Inspect',
        category: 'interactions',
        priority: 2,
        isMovementAction: true,
        isInterruptible: true,
        defaultDuration: 3000,
        description: 'Curiously inspect an object from different angles',
        requiresTarget: true,
        affectsMood: true,
        moodEffect: 2,
        defaultOptions: {
            pointDuration: 500,
            numPoints: 4,
            expressionType: 'curious',
            expressionDuration: 300
        }
    };

    static canPerform(selected, active) {
        return active && selected instanceof MapObject && !active.queue.isCarrying();
    }

    constructor(myte, options) {
        super(myte, {
            ...InspectAction.metadata.defaultOptions,
            duration: InspectAction.metadata.defaultDuration,
            ...options
        });
        
        this.inspectPoints = this.generateInspectPoints();
        this.currentPoint = 0;
        this.pointTimer = this.options.pointDuration;
    }

    generateInspectPoints() {
        let targetRect = this.getTargetRect(this.options.target);
        const points = [];
        const myteRect = this.myte.getRect();

        for (let i = 0; i < this.options.numPoints; i++) {
            const horizontal = i % 2 === 0 ? 'left' : 'right';
            const vertical = i < this.options.numPoints/2 ? 'top' : 'bottom';
            const pos = this.calculatePosition(myteRect, targetRect, horizontal, vertical, false, false);
            points.push(pos);
        }
        return points;
    }

    update() {
        this.pointTimer -= 16;
        if (this.pointTimer <= 0) {
            this.currentPoint = (this.currentPoint + 1) % this.inspectPoints.length;
            this.pointTimer = this.options.pointDuration;
            this.myte.queue.addExpression(
                this.options.expressionType,
                this.options.expressionDuration
            );
        }

        const point = this.inspectPoints[this.currentPoint];
        this.myte.setTarget(point.x, point.y);
        this.myte.move_toward_target();

        this.options.current_duration--;
        return this.options.current_duration <= 0;
    }
}


// Eat element action
class EatElementAction extends MyteAction {
    static metadata = {
        id: 'eat_element',
        label: 'Eat',
        category: 'interactions',
        priority: 2,
        isMovementAction: false,
        isInterruptible: false,
        defaultDuration: 0,
        description: 'Consume an edible object',
        requiresTarget: true,
        affectsMood: true,
        moodEffect: 5
    };

    static canPerform(selected, active) {
        return active && selected instanceof MapObject && !active.queue.isCarrying();
    }

    constructor(myte, options) {
        super(myte, {
            duration: EatElementAction.metadata.defaultDuration,
            ...options
        });
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
}

// Show affection action
class ShowAffectionAction extends MyteAction {
    static metadata = {
        id: 'show_affection',
        label: 'Show Affection',
        category: 'interactions',
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
        super(myte, {
            ...ShowAffectionAction.metadata.defaultOptions,
            duration: ShowAffectionAction.metadata.defaultDuration,
            ...options
        });
        this.heartEmitter = null;
        this.emitTimer = 0;
    }

    start() {
        super.start();
        this.myte.queue.addExpression(
            this.options.expressionType,
            this.options.expressionDuration,
            this.options.expressionRepeat
        );
    }

    update() {
        this.emitTimer -= 16;
        if (this.emitTimer <= 0) {
            this.emitTimer = this.options.emitDelay;
        }

        this.options.current_duration--;
        return this.options.current_duration <= 0;
    }
}

// Play tag action
class PlayTagAction extends PositionableAction {
    static metadata = {
        id: 'play_tag',
        label: 'Play Tag',
        category: 'play',
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
        super(myte, {
            ...PlayTagAction.metadata.defaultOptions,
            duration: PlayTagAction.metadata.defaultDuration,
            ...options
        });
        this.isIt = this.options.isIt;
    }

    update() {
        const target = this.options.targetMyte;
        if (!target) return true;

        const dx = target.posX - this.myte.posX;
        const dy = target.posY - this.myte.posY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (this.isIt) {
            this.myte.setTarget(target.posX, target.posY);
            this.myte.move_toward_target();

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
            const angle = Math.atan2(dy, dx) + Math.PI;
            this.myte.setTarget(
                this.myte.posX + Math.cos(angle) * this.options.runDistance,
                this.myte.posY + Math.sin(angle) * this.options.runDistance
            );
            this.myte.move_toward_target();
        }

        this.options.current_duration--;
        return this.options.current_duration <= 0;
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
    static metadata = {
        id: 'play_fetch',
        label: 'Play Fetch',
        category: 'play',
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
            throwableOffset: { x: 0, y: -20 },
            expressionType: 'excited',
            expressionDuration: 500,
            happyDuration: 500
        }
    };

    static canPerform(selected, active) {
        return active && selected instanceof MapObject && !active.queue.isCarrying();
    }

    constructor(myte, options) {
        super(myte, {
            ...PlayFetchAction.metadata.defaultOptions,
            ...options
        });

        this.throwPosition = null;
        this.throwTarget = null;
        this.throwProgress = 0;
    }

    start() {
        super.start();
        this.myte.queue.addExpression(
            this.options.expressionType,
            this.options.expressionDuration
        );
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
