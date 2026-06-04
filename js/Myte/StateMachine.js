const StateTypes = {
	IDLE: 'idle',
	MOVING: 'moving',
	EXPRESSION: 'expression',
	SLIDE_DOWN: 'slide_down',
	GRAVITY: 'gravity',
	DRAGGING: 'dragging',
	BEING_CARRIED: 'being_carried'
};


class StateController {
	constructor(parent, states, priorities, stateConfig) {
		this.parent = parent;
		this.states = states;
		this.priorities = priorities;
		this.stateConfig = stateConfig;
		this.currentState = null;
		this.previousState = null;
		this.isTransitioning = false;
	}

	determineNextState(conditions) {
		if (this.isDroppingState() && !conditions.isDragging) {
			return this.handleDroppingState(conditions);
		}

		const validStates = Object.entries(this.states)
			.filter(([_, rule]) => rule.check(conditions))
			.map(([stateName, rule]) => ({
				name: stateName,
				priority: this.priorities[stateName],
				state: rule.getState(conditions)
			}))
			.sort((a, b) => b.priority - a.priority);

		return validStates[0]?.state || 'idle';
	}

	isDroppingState() {
		return ['dropping', 'dragging', 'pickup'].includes(this.currentState);
	}

	handleDroppingState(conditions) {
		if (conditions.isGravity && conditions.isFalling) {
			return 'falling';
		}

		return 'dropping';
	}

	transitionTo(newState) {
		if (this.isTransitioning) {
			return false;
		}

		const transitionRule = this.getTransitionRule(newState);
		if (transitionRule) {
			this.isTransitioning = true;
			newState = transitionRule;
		}

		if (this.currentState === newState) {
			return false;
		}

		this.previousState = this.currentState;
		this.currentState = newState;

		const stateConfig = this.stateConfig[newState];
		if (stateConfig?.sound) {
			this.parent.parent.playSound(stateConfig.sound);
		}

		return true;
	}

	getTransitionRule(newState) {
		return this.stateConfig[this.currentState]?.transitions?.[newState];
	}

	handleTransitionComplete() {
		this.isTransitioning = false;
		const nextState = this.stateConfig[this.currentState]?.onTransitionEnd;
		if (nextState) {
			this.transitionTo(nextState);
		}
	}
}

class StateMachine {
	constructor(parent, initialState) {
		this.parent = parent;
		this.spriteElement = parent.duplicate.querySelector('.sprite');
		this.spriteConfig = {};
		this.spriteSize = { width: 64, height: 64 };
		this.spriteAnimator = new SpriteAnimator();

		this.stateRules = this.loadStateRules();
		this.statePriorities = this.loadStatePriorities();
		this.stateConfig = this.loadStateConfig();

		this.stateController = new StateController(
			this,
			this.stateRules,
			this.statePriorities,
			this.stateConfig
		);

		this.applySpeciesDefinition(this.parent.definition);
		this.stateController.transitionTo(initialState);
	}

	loadStateRules() {
		return {
			[StateTypes.DRAGGING]: {
				check: (context) => context.isDragging,
				getState: (context) => this.getDraggingState()
			},
			[StateTypes.GRAVITY]: {
				check: (context) => {
					return context.isGravity && (context.isFalling || context.isJumping ||
						   (context.stateController?.currentState === 'falling' && !context.isFalling));
				},
				getState: (context) => {
					if (context.stateController?.currentState === 'falling' && !context.isFalling) {
						return 'land';
					}
					return context.isFalling ? 'falling' : 'jumping';
				}
			},
			[StateTypes.SLIDE_DOWN]: {
				check: (context) => context.isDoingAction('slide_down') &&
					context.queue.getCurrentAction().currentTargetIndex > 0,
				getState: () => 'slide_down'
			},

			[StateTypes.EXPRESSION]: {
				check: (context) => context.isDoingAction('expression'),
				getState: () => this.handleExpressionState()
			},
			[StateTypes.MOVING]: {
				check: (context) => context.isMoving() && !context.isDragging,
				getState: (context) => 'moving_' + context.direction
			},
			[StateTypes.IDLE]: {
				check: () => true,
				getState: (context) => 'idle_' + (context.direction || 'S')
			},
			[StateTypes.BEING_CARRIED]: {
				check: (context) => context.isDoingAction('being_carried'),
				getState: (context) => 'being_carried_' + context.direction
			},
		};
	}

	loadStatePriorities() {
		return {
			[StateTypes.IDLE]: 0,
			[StateTypes.MOVING]: 1,
			[StateTypes.EXPRESSION]: 2,
			[StateTypes.SLIDE_DOWN]: 3,
			[StateTypes.GRAVITY]: 4,
			[StateTypes.DRAGGING]: 5,
			[StateTypes.BEING_CARRIED]: 6
		};
	}

	loadStateConfig() {
		return {
			'idle': {
				spriteSet: ['idle'],
				repeat: true
			},
			'idle_N': {
				spriteSet: ['idle_N'],
				repeat: true
			},
			'idle_S': {
				spriteSet: ['idle_S'],
				repeat: true
			},
			'idle_E': {
				spriteSet: ['idle_E'],
				repeat: true
			},
			'idle_W': {
				spriteSet: ['idle_W'],
				repeat: true
			},

			'moving_N': {
				spriteSet: ['N'],
				repeat: true,
				transitions: {
					'moving_S': 'transition_NS'
				}
			},
			'moving_S': {
				spriteSet: ['S'],
				repeat: true,
				transitions: {
					'moving_N': 'transition_SN'
				}
			},
			'moving_E': {
				spriteSet: ['E'],
				repeat: true,
				transitions: {
					'moving_W': 'transition_EW'
				}
			},
			'moving_W': {
				spriteSet: ['W'],
				repeat: true,
				transitions: {
					'moving_E': 'transition_WE'
				}
			},

			'transition_NS': {
				spriteSet: ['verticalTurn'],
				repeat: true,
				onTransitionEnd: 'moving_S'
			},
			'transition_SN': {
				spriteSet: ['verticalTurn'],
				repeat: true,
				onTransitionEnd: 'moving_N'
			},
			'transition_WE': {
				spriteSet: ['horizontalTurn'],
				repeat: true,
				onTransitionEnd: 'moving_E'
			},
			'transition_EW': {
				spriteSet: ['horizontalTurn'],
				repeat: true,
				onTransitionEnd: 'moving_W'
			},

			'scratch_left': {
				spriteSet: ['scratchLeft'],
				repeat: true
			},
			'scratch_right': {
				spriteSet: ['scratchRight'],
				repeat: true
			},

			'cry': {
				spriteSet: ['cry_expression'],
				repeat: false
			},
			'surprise': {
				spriteSet: ['surprise_expression'],
				repeat: false
			},
			'fall': {
				spriteSet: ['fall_expression'],
				repeat: false
			},
			'sit': {
				spriteSet: ['sit_expression'],
				repeat: false
			},
			'kiss': {
				spriteSet: ['kiss_expression'],
				repeat: false
			},

			'dragging': {
				spriteSet: ['dragging'],
				repeat: true
			},
			'pickup': {
				spriteSet: ['pickup'],
				repeat: false,
				onTransitionEnd: 'dragging'
			},
			'dropping': {
				spriteSet: ['dropping'],
				repeat: false,
				onTransitionEnd: 'land'
			},

			'land': {
				spriteSet: ['land'],
				repeat: false,
				sound: 'land',
			},

			'jumping': {
				spriteSet: ['jumping'],
				repeat: true,
				sound: 'jump'
			},

			'falling': {
				spriteSet: ['falling'],
				repeat: true,
				onTransitionEnd: 'land'
			},

			'slide_down': {
				spriteSet: ['slide_down'],
				repeat: true
			},

			'being_carried': {
				spriteSet: ['idle'],
				repeat: true
			},

			'being_carried_N': {
				spriteSet: ['idle_N'],
				repeat: true
			},
			'being_carried_S': {
				spriteSet: ['idle_S'],
				repeat: true
			},
			'being_carried_E': {
				spriteSet: ['idle_E'],
				repeat: true
			},
			'being_carried_W': {
				spriteSet: ['idle_W'],
				repeat: true
			},
		};
	}

	getDraggingState() {
		const currentState = this.stateController.currentState;
		if (currentState !== 'pickup' && currentState !== 'dragging') {
			return 'pickup';
		}

		if (currentState === 'pickup' && this.spriteAnimator.isComplete) {
			return 'dragging';
		}

		return currentState;
	}

	handleExpressionState() {
		const currentAction = this.parent.queue.getCurrentAction();
		if (!currentAction) {
			return 'idle_' + this.parent.direction;
		}

		const resolvedState = MyteDefinitionRegistry.resolveExpression(
			currentAction.actionType,
			this.stateConfig,
			this.parent?.definition
		);

		if (!resolvedState) {
			this.parent.queue.removeCurrentAction();
			return 'idle_' + this.parent.direction;
		}

		if (this.spriteAnimator.isComplete) {
			this.parent.queue.removeCurrentAction();
			return 'idle_' + this.parent.direction;
		}
		return resolvedState;
	}

	applySpeciesDefinition(definition) {
		const visualConfig = definition?.visual || {};
		const frameSize = visualConfig.frameSize || {};
		const spriteSets = visualConfig.spriteSets;
		const speciesId = definition?.id || this.parent.species;

		MyteDefinitionRegistry.getSpeciesIds().forEach((knownSpeciesId) => {
			this.parent.duplicate.classList.remove(knownSpeciesId);
			this.parent.element.classList.remove(knownSpeciesId);
			this.parent.elements.wrapper.classList.remove(knownSpeciesId);
		});

		this.parent.duplicate.classList.add(speciesId);
		this.parent.element.classList.add(speciesId);
		this.parent.elements.wrapper.classList.add(speciesId);
		this.parent.duplicate.dataset.myteSpecies = speciesId;
		this.parent.element.dataset.myteSpecies = speciesId;
		this.parent.elements.wrapper.dataset.myteSpecies = speciesId;

		if (!spriteSets || Object.keys(spriteSets).length === 0) {
			console.error(`[StateMachine] Species "${speciesId}" has no spriteSets defined.`);
		}

		this.spriteSize = { width: frameSize.width || 64, height: frameSize.height || 64 };
		this.spriteConfig = spriteSets || {};
	}

	// Load frames for the given state into the animator.
	// Merges per-state frameDurations into frame data so SpriteAnimator only needs frame[2].
	_initAnimatorForState(state) {
		const cfg = this.stateConfig[state];
		const animKey = this.getAnimationKey(state);
		let frames = this.spriteConfig[animKey] ?? [];

		const durations = cfg?.frameDurations;
		if (durations) {
			frames = frames.map((f, i) => {
				if (Array.isArray(f) && f[2] != null) return f;
				const dur = durations[i];
				if (dur == null) return f;
				return Array.isArray(f) ? [f[0], f[1], dur] : [f, 0, dur];
			});
		}

		this.spriteAnimator.setFrames(frames, {
			fps: cfg?.fps,
			loop: cfg?.repeat ?? true
		});
	}

	_getAnimationSpeedScale(state) {
		if (!String(state || '').startsWith('moving_')) {
			return 1;
		}

		const locomotionConfig = this.parent.definition?.audio?.locomotion ?? {};
		const animationRange = locomotionConfig.animationSpeedScale ?? {};
		const currentSpeed = this.parent.stats?.getSpeed?.() ?? this.parent.speed ?? 1;
		const baseSpeed = this.parent.definition?.movement?.baseSpeed ?? this.parent.speed ?? 1;
		const safeBaseSpeed = Math.max(0.01, baseSpeed);
		const rawScale = currentSpeed / safeBaseSpeed;

		return Utility.clamp(
			rawScale,
			animationRange.min ?? 0.85,
			animationRange.max ?? 1.25
		);
	}

	_getFrameEvents(state) {
		const events = [];
		if (!String(state || '').startsWith('moving_')) {
			return events;
		}

		const footsteps = this.parent.definition?.audio?.locomotion?.footsteps ?? {};
		if (footsteps.enabled === false) {
			return events;
		}

		const frames = Array.isArray(footsteps.frames) && footsteps.frames.length
			? footsteps.frames
			: [1, 5];

		frames.forEach((frameIndex, index) => {
			events.push({
				type: 'footstep',
				frameIndex: Number(frameIndex),
				foot: index % 2 === 0 ? 'left' : 'right'
			});
		});

		return events;
	}

	_triggerFrameEvents(state, animationKey, frameIndex) {
		const matchingEvents = this._getFrameEvents(state).filter(event => event.frameIndex === frameIndex);
		if (!matchingEvents.length) return;

		matchingEvents.forEach(event => {
			this.parent.handleAnimationFrameEvent?.({
				...event,
				state,
				animationKey
			});
		});
	}

	update(deltaTime) {
		const context = {
			isDragging: this.parent.isDragging,
			isGravity: this.parent.isGravity,
			isFalling: this.parent.isFalling,
			isJumping: this.parent.isJumping,
			direction: this.parent.direction,
			isDoingAction: (action) => this.parent.isDoingAction(action),
			isMoving: () => this.parent.isMoving(),
			queue: this.parent.queue,
			stateController: this.stateController
		};

		const newState = this.stateController.determineNextState(context);
		if (this.stateController.transitionTo(newState)) {
			this._initAnimatorForState(this.stateController.currentState);
			this._renderCurrentFrame();
		}

		const currentState = this.stateController.currentState;
		this.spriteAnimator.setSpeedScale(this._getAnimationSpeedScale(currentState));

		if (this.spriteAnimator.update(deltaTime)) {
			this._renderCurrentFrame();
			const animKey = this.getAnimationKey(currentState);
			this._triggerFrameEvents(currentState, animKey, this.spriteAnimator.frameIndex);

			if (this.spriteAnimator.isComplete) {
				this.handleAnimationComplete(currentState);
			}
		}
	}

	// Write the current frame to the DOM without advancing the index.
	_renderCurrentFrame() {
		const animKey = this.getAnimationKey(this.stateController.currentState);
		if (!animKey || !this.spriteElement) return;
		this.spriteElement.style.backgroundPosition =
			this.spriteAnimator.getBackgroundPosition(this.spriteSize.width, this.spriteSize.height);
		this.parent.duplicate.setAttribute('sprite', animKey);
	}

	getAnimationKey(state) {
		return this.stateConfig[state]?.spriteSet[0];
	}

	getAnchorDirection(fallbackDirection = this.parent.direction) {
		const normalizedFallback = String(fallbackDirection || 'S').trim().toUpperCase();
		const currentState = this.stateController?.currentState || '';
		const animationKey = this.getAnimationKey(currentState);
		const directDirection = this._extractCardinalDirection(currentState) || this._extractCardinalDirection(animationKey);
		if (directDirection) {
			return directDirection;
		}

		const frameRow = this._getSpriteFrameRow(animationKey);
		if (frameRow == null) {
			return normalizedFallback;
		}

		for (const candidate of ['N', 'S', 'E', 'W', 'idle_N', 'idle_S', 'idle_E', 'idle_W']) {
			if (this._getSpriteFrameRow(candidate) !== frameRow) {
				continue;
			}

			return this._extractCardinalDirection(candidate) || normalizedFallback;
		}

		return normalizedFallback;
	}

	_extractCardinalDirection(value) {
		const match = String(value || '').trim().toUpperCase().match(/(?:^|_)(N|S|E|W)$/);
		return match ? match[1] : null;
	}

	_getSpriteFrameRow(spriteKey) {
		if (!spriteKey) return null;
		const frames = this.spriteConfig[spriteKey];
		if (!Array.isArray(frames) || frames.length === 0 || !Array.isArray(frames[0])) {
			return null;
		}

		const row = Number(frames[0][1]);
		return Number.isFinite(row) ? row : null;
	}

	handleAnimationComplete(state) {
		const config = this.stateConfig[state];
		if (!config) return;

		if (this.stateController.isTransitioning) {
			this.stateController.handleTransitionComplete();
			// handleTransitionComplete may have changed currentState — re-init for the new state
			this._initAnimatorForState(this.stateController.currentState);
			this._renderCurrentFrame();
		} else if (!config.repeat && config.onTransitionEnd) {
			if (this.stateController.transitionTo(config.onTransitionEnd)) {
				this._initAnimatorForState(this.stateController.currentState);
				this._renderCurrentFrame();
			}
		}
		// If !repeat and no onTransitionEnd: animator stays complete.
		// determineNextState will detect isComplete on the next tick and transition out.
	}
}
