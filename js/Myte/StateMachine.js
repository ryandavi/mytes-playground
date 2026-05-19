const StateTypes = {
	IDLE: 'idle',
	MOVING: 'moving',
	EXPRESSION: 'expression',
	SLIDE_DOWN: 'slide_down',
	GRAVITY: 'gravity',
	DRAGGING: 'dragging',
	BEING_CARRIED: 'being_carried'  // Add this
};


class SpriteAnimator {
	constructor(sprite, spriteConfig) {
		this.sprite = sprite;
		this.spriteConfig = spriteConfig;
		this.size = { width: 64, height: 64 };
	}

	setSize(width, height) {
		this.size = { width, height };
	}

	setSpriteConfig(config) {
		this.spriteConfig = config;
	}

	updateSprite(animationKey, frameIndex) {
		const spriteData = this.spriteConfig[animationKey];
		if (!spriteData || !spriteData[frameIndex]) return false;

		const [x, y] = spriteData[frameIndex];
		this.setPosition(x, y);
		return true;
	}

	setPosition(x, y) {
		this.sprite.style.backgroundPosition =
			`${x * -this.size.width}px ${y * -this.size.height}px`;
	}

	getFrameCount(animationKey) {
		return this.spriteConfig[animationKey]?.length || 0;
	}
}

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
		// Handle special case for dropping state
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
		this.animator = new SpriteAnimator(
			parent.duplicate.querySelector('.sprite'),
			{}
		);
		this.stateRules = this.loadStateRules();
		this.statePriorities = this.loadStatePriorities();
		this.stateConfig = this.loadStateConfig();

		this.stateController = new StateController(
			this,
			this.stateRules,
			this.statePriorities,
			this.stateConfig
		);

		this.currentFrameIndex = 0;
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
					// We need to check if we're in a gravity-affected state
					return context.isGravity && (context.isFalling || context.isJumping || 
						   // The key addition: detect when we've just landed
						   (context.stateController?.currentState === 'falling' && !context.isFalling));
				},
				getState: (context) => {
					// If we were falling but no longer are, we must have landed
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
		return { 			// Idle states
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

			// Movement states
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

			// Transition states
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

			// Action states
			'scratch_left': {
				spriteSet: ['scratchLeft'],
				repeat: true
			},
			'scratch_right': {
				spriteSet: ['scratchRight'],
				repeat: true
			},

			// Expression states
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

			// Special states
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
				onTransitionEnd: 'land'  // Add this line
			},

			'land': {
				spriteSet: ['land'],
				repeat: false,
				sound: 'land',
				// onTransitionEnd: 'idle'  // Add this line
			},

			'jumping': {
				spriteSet: ['jumping'],
				repeat: true,
				sound: 'jump'
			},

			'falling': {
				spriteSet: ['falling'],
				repeat: true,
				onTransitionEnd: 'land'  // Add this line

			},
			
			'slide_down': {
				spriteSet: ['slide_down'],
				repeat: true
			},

			'being_carried': {
				spriteSet: ['idle'],  // Using idle animation while being carried
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

		if (currentState === 'pickup' && this.currentFrameIndex === -1) {
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
			this.stateConfig
		);

		if (!resolvedState) {
			this.parent.queue.removeCurrentAction();
			return 'idle_' + this.parent.direction;
		}

		if (this.currentFrameIndex === -1) {
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

		this.animator.setSize(frameSize.width || 64, frameSize.height || 64);
		this.animator.setSpriteConfig(spriteSets || {});
	}

	update() {
		// Get current context
		const context = {
			isDragging: this.parent.isDragging,
			isGravity: this.parent.isGravity,
			isFalling: this.parent.isFalling,
			isJumping: this.parent.isJumping,
			direction: this.parent.direction,
			isDoingAction: (action) => this.parent.isDoingAction(action),
			isMoving: () => this.parent.isMoving(),
			queue: this.parent.queue,
			stateController: this.stateController // Add this line
		};

		// Determine and set new state
		const newState = this.stateController.determineNextState(context);
		if (this.stateController.transitionTo(newState)) {
			this.currentFrameIndex = 0;
		}

		// Update animation
		this.updateAnimation();
	}

	updateAnimation() {
		const currentState = this.stateController.currentState;
		const animationKey = this.getAnimationKey(currentState);

		if (!animationKey) return;

		// Update sprite
		const updated = this.animator.updateSprite(animationKey, this.currentFrameIndex);
		if (!updated) return;

		// Set sprite attribute
		this.parent.duplicate.setAttribute("sprite", animationKey);

		// Handle frame updates
		if (this.isAtLastFrame(animationKey)) {
			this.handleAnimationComplete(currentState);
		} else {
			this.currentFrameIndex++;
		}
	}

	getAnimationKey(state) {
		return this.stateConfig[state]?.spriteSet[0];
	}

	isAtLastFrame(animationKey) {
		return this.currentFrameIndex >= this.animator.getFrameCount(animationKey) - 1;
	}

	handleAnimationComplete(state) {
		const config = this.stateConfig[state];
		if (!config) {
			this.currentFrameIndex = 0;
			return;
		}

		if (this.stateController.isTransitioning) {
			this.stateController.handleTransitionComplete();
		} else if (!config.repeat) {
			this.currentFrameIndex = -1;
			if (config.onTransitionEnd) {
				this.stateController.transitionTo(config.onTransitionEnd);
			}
		} else {
			this.currentFrameIndex = 0;
		}
	}
}
