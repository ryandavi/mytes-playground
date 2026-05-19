// Object interactions
// Going to an object action
class GoToObjectAction extends PositionableAction {
    static metadata = {
        id: 'go_to_object',
        label: 'Go To (Simple)',
        category: 'interactions',
        priority: 1,
        isMovementAction: true,
        isInterruptible: true,
        defaultDuration: 0,
        description: 'Move to a specific object or Myte',
        requiresTarget: true,
        affectsMood: false,
        defaultOptions: {
			targetPosition: {
				vertical: 'bottom',
				insideHorizontal: false,
				insideVertical: true
			}
        }
    };

	targetPos = null;
    targetPoints = null;
    currentTargetIndex = 0;
    targetCenter = null;

    constructor(myte, options) {
        super(myte, {
            ...GoToObjectAction.metadata.defaultOptions,
            ...options
        });
    }

    static canPerform(selected, active) {
        return active && selected && !active.queue.isCarrying();
    }

	static getRequiredOptions(selected, active) {
		return {
			target: selected
		};
	}


	start(){
        super.start();
        this.currentTargetIndex = 0;
        this.buildApproachPlan();
	}

    buildApproachPlan() {
        const targetRect = this.getRect(this.target);
        if (!targetRect) {
            this.targetPos = null;
            this.targetPoints = null;
            return;
        }

        const myteRect = this.myte.getRect();
        this.targetCenter = {
            x: targetRect.x + (targetRect.width / 2),
            y: targetRect.y + (targetRect.height / 2)
        };

        const candidates = this.getCandidatePositions(targetRect, myteRect);
        const bestPath = this.findBestPath(candidates);

        if (bestPath) {
            this.targetPos = bestPath.targetPos;
            this.targetPoints = bestPath.targetPoints;
            return;
        }

        this.targetPos = candidates[0] || {
            x: this.targetCenter.x - (myteRect.width / 2),
            y: this.targetCenter.y - (myteRect.height / 2)
        };
        this.targetPoints = null;
    }

    getCandidatePositions(targetRect, myteRect) {
        const preferredHorizontal = this.getClosestSideHorizontal(targetRect, myteRect);
        const secondaryHorizontal = this.getOpposite(preferredHorizontal);

        const rawCandidates = [
            this.calculatePosition(
                myteRect,
                targetRect,
                preferredHorizontal,
                this.targetPosition.vertical,
                this.targetPosition.insideHorizontal,
                this.targetPosition.insideVertical
            ),
            this.calculatePosition(
                myteRect,
                targetRect,
                secondaryHorizontal,
                this.targetPosition.vertical,
                this.targetPosition.insideHorizontal,
                this.targetPosition.insideVertical
            ),
            this.calculatePosition(myteRect, targetRect, 'center', 'top', false, false),
            this.calculatePosition(myteRect, targetRect, 'center', 'bottom', false, true)
        ];

        const uniqueCandidates = [];
        const seen = new Set();

        for (const candidate of rawCandidates) {
            const adjusted = this.adjustPositionToBounds(candidate, myteRect, targetRect).position;
            const key = `${Math.round(adjusted.x)},${Math.round(adjusted.y)}`;
            if (seen.has(key)) continue;
            seen.add(key);
            uniqueCandidates.push(adjusted);
        }

        return uniqueCandidates;
    }

    findBestPath(candidates) {
        if (!this.myte?.pathfinder || !candidates.length) {
            return null;
        }

        let bestPath = null;

        for (const candidate of candidates) {
            const endCenterX = candidate.x + (this.myte.size.width / 2);
            const endCenterY = candidate.y + (this.myte.size.height / 2);
            const path = this.myte.pathfinder.findPath(
                this.myte,
                this.myte.posX,
                this.myte.posY,
                endCenterX,
                endCenterY
            );

            if (!path?.length) continue;

            const targetPoints = path
                .map(waypoint => ({
                    x: waypoint.x - this.myte.size.width / 2,
                    y: waypoint.y - this.myte.size.height / 2
                }))
                .filter((point, index, arr) => {
                    if (index === 0) {
                        return Math.hypot(point.x - this.myte.posX, point.y - this.myte.posY) > 1;
                    }

                    const previous = arr[index - 1];
                    return Math.hypot(point.x - previous.x, point.y - previous.y) > 0.5;
                });

            const score = this.getPathScore(targetPoints);
            if (!bestPath || score < bestPath.score) {
                bestPath = { targetPos: candidate, targetPoints, score };
            }
        }

        return bestPath;
    }

    getPathScore(points) {
        if (!points?.length) return 0;

        let total = 0;
        let previous = { x: this.myte.posX, y: this.myte.posY };
        for (const point of points) {
            total += Math.hypot(point.x - previous.x, point.y - previous.y);
            previous = point;
        }
        return total;
    }

    moveMyteTowardCurrentTarget() {
        if (typeof this.myte.move_toward_target_new === 'function') {
            this.myte.move_toward_target_new();
            return;
        }

        this.myte.move_toward_target();
    }

    faceTarget() {
        if (!this.targetCenter) return;

        const myteCenterX = this.myte.posX + (this.myte.size.width / 2);
        const myteCenterY = this.myte.posY + (this.myte.size.height / 2);
        const dx = this.targetCenter.x - myteCenterX;
        const dy = this.targetCenter.y - myteCenterY;

        if (Math.abs(dx) > Math.abs(dy)) {
            this.myte.setDirection(dx > 0 ? DIRECTION.EAST : DIRECTION.WEST);
        } else {
            this.myte.setDirection(dy > 0 ? DIRECTION.SOUTH : DIRECTION.NORTH);
        }
    }

    update() {
        if (this.targetPoints?.length) {
            if (this.myte.is_at_target()) {
                this.currentTargetIndex++;

                if (this.currentTargetIndex >= this.targetPoints.length) {
                    this.faceTarget();
                    return true;
                }
            }

            const waypoint = this.targetPoints[this.currentTargetIndex];
            this.myte.setTarget(waypoint.x, waypoint.y);
            this.moveMyteTowardCurrentTarget();
            return false;
        }

        if (!this.targetPos) {
            return true;
        }

        this.myte.setTarget(this.targetPos.x, this.targetPos.y);
        this.moveMyteTowardCurrentTarget();

        if (!this.myte.is_at_target()) {
            return false;
        }

        this.faceTarget();
        return true;
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
        this.pointTimer = this.pointDuration;
    }

    generateInspectPoints() {
        let targetRect = this.getRect(this.target);
        const points = [];
        const myteRect = this.myte.getRect();

        for (let i = 0; i < this.numPoints; i++) {
            const horizontal = i % 2 === 0 ? 'left' : 'right';
            const vertical = i < this.numPoints/2 ? 'top' : 'bottom';
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

			/*
            this.myte.queue.addExpression(
                this.expressionType,
                this.expressionDuration
            );
			*/
        }

        const point = this.inspectPoints[this.currentPoint];
        this.myte.setTarget(point.x, point.y);
        this.myte.move_toward_target();

        this.current_duration--;
        return this.current_duration <= 0;
    }
}


// Eat element action
class EatElementAction extends GoToObjectAction {
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
        moodEffect: 5,
        defaultOptions: {
			targetPosition: {
				vertical: 'bottom',
				insideHorizontal: false,
				insideVertical: true
			}
        }
    };

    static canPerform(selected, active) {
        return active && selected instanceof MapObject && !active.queue.isCarrying();
    }

    complete() {
        super.complete();
        if (this.mapObject) {
            this.mapObject.remove();
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
            this.expressionType,
            this.expressionDuration,
            this.expressionRepeat
        );
    }

    update() {
        this.emitTimer -= 16;
        if (this.emitTimer <= 0) {
            this.emitTimer = this.emitDelay;
        }

        this.current_duration--;
        return this.current_duration <= 0;
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
        this.isIt = this.isIt;
    }

    update() {
        const target = this.targetMyte;
        if (!target) return true;

        const dx = target.posX - this.myte.posX;
        const dy = target.posY - this.myte.posY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (this.isIt) {
            this.myte.setTarget(target.posX, target.posY);
            this.myte.move_toward_target();

            if (distance < this.catchDistance) {
                this.isIt = false;
                target.queue.add('play_tag', {
                    targetMyte: this.myte,
                    isIt: true,
                    duration: this.current_duration
                });
                return true;
            }
        } else {
            const angle = Math.atan2(dy, dx) + Math.PI;
            this.myte.setTarget(
                this.myte.posX + Math.cos(angle) * this.runDistance,
                this.myte.posY + Math.sin(angle) * this.runDistance
            );
            this.myte.move_toward_target();
        }

        this.current_duration--;
        return this.current_duration <= 0;
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
            this.expressionType,
            this.expressionDuration
        );
    }

	update() {
		switch (this.fetchState) {
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
		if (!this.throwable) return true;

		// Move to throwable
		const dx = this.throwable.posX - this.myte.posX;
		const dy = this.throwable.posY - this.myte.posY;
		const distance = Math.sqrt(dx * dx + dy * dy);

		if (distance > 10) {
			this.myte.setTarget(this.throwable.posX, this.throwable.posY);
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
		const throwDistance = Math.random() * this.maxThrowDistance;
		this.throwTarget = {
			x: this.throwPosition.x + Math.cos(angle) * throwDistance,
			y: this.throwPosition.y + Math.sin(angle) * throwDistance
		};

		this.throwProgress = 0;
		this.fetchState = FetchStates.THROW;
		return false;
	}

	handleThrow() {
		this.throwProgress += this.throwStrength / 100;

		if (this.throwProgress >= 1) {
			this.fetchState = FetchStates.CHASE;
			return false;
		}

		// Calculate arc trajectory
		const x = this.throwPosition.x + (this.throwTarget.x - this.throwPosition.x) * this.throwProgress;
		const y = this.throwPosition.y + (this.throwTarget.y - this.throwPosition.y) * this.throwProgress
			- Math.sin(this.throwProgress * Math.PI) * this.arcHeight;

		// Update throwable position
		if (this.throwable) {
			this.throwable.setPosition(x, y);
			this.throwable.setSpritePosition(x, y);
		}

		return false;
	}

	handleChase() {
		if (!this.throwable) return true;

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
			this.fetchState = FetchStates.RETURN;
		}

		return false;
	}

	handleReturn() {
		// Return to original position
		this.myte.setTarget(this.throwPosition.x, this.throwPosition.y);
		this.myte.move_toward_target();

		// Move throwable with Myte
		if (this.throwable) {
			const offset = { x: 0, y: -20 };
			this.throwable.setPosition(
				this.myte.posX + offset.x,
				this.myte.posY + offset.y
			);
			this.throwable.setSpritePosition(
				this.myte.posX + offset.x,
				this.myte.posY + offset.y
			);
		}

		// If we're back at the start
		if (this.myte.is_at_target()) {
			// Start over
			this.throwProgress = 0;
			this.fetchState = FetchStates.THROW;
		}

		return false;
	}

}
