const StateTypes = {
	IDLE: 'idle',
	MOVING: 'moving',
	EXPRESSION: 'expression',
	SLIDE_DOWN: 'slide_down',
	GRAVITY: 'gravity',
	DRAGGING: 'dragging',
	BEING_CARRIED: 'being_carried'  // Add this
};

const BaseSpriteSets = {
	S: [
		[0, 0], [1, 0], [2, 0], [3, 0]
	],
	W: [
		[0, 1], [1, 1], [2, 1], [3, 1]
	],
	E: [
		[0, 2], [1, 2], [2, 2], [3, 2]
	],
	N: [
		[0, 3], [1, 3], [2, 3], [3, 3]
	],
	dance: [
		[0, 0], [0, 1], [0, 2], [0, 3]
	],
	horizontalTurn: [[0, 0]],
	verticalTurn: [[1, 2]],
	idle: [[0, 4], [1, 4]],
	dragging: [[0, 4], [1, 4]],
	scratchLeft: [[0, 1], [0, 1], [2, 1], [3, 1]],
	scratchRight: [[0, 2], [1, 2], [2, 2], [3, 2]],
	cry_expression: [[0, 5], [1, 5], [2, 5]],
	fall_expression: [[1, 5], [2, 5]],
	sit_expression: [[0, 5], [1, 5], [2, 5]],
	surprise_expression: [[0, 5], [1, 5], [2, 5]],
	kiss_expression: [[1, 4]],
	jumping: [[0, 4]],
	falling: [[1, 4]],
	slide_down: [[0, 3]]
};

const SnailSpriteSets = {
	E: [
		[0, 0], [1, 0], [2, 0], [3, 0],
		[4, 0], [5, 0], [6, 0], [7, 0]
	],
	W: [
		[0, 1], [1, 1], [2, 1], [3, 1],
		[4, 1], [5, 1], [6, 1], [7, 1]
	],
	N: [
		[0, 2], [1, 2], [2, 2], [3, 2],
		[4, 2], [5, 2], [6, 2], [7, 2]
	],
	S: [
		[0, 3], [1, 3], [2, 3], [3, 3],
		[4, 3], [5, 3], [6, 3], [7, 3]
	],
	horizontalTurn: [[3, 3]],
	verticalTurn: [[4, 0]],
	idle: [[0, 3]],
	idle_E: [[0, 0]],
	idle_W: [[0, 1]],
	idle_N: [[0, 2]],
	idle_S: [[0, 3]],
	dragging: [[0, 5]],
	pickup: [[0, 4], [2, 4], [4, 4], [6, 4]],
	dropping: [[6, 4], [4, 4], [2, 4], [0, 4]],
	scratchLeft: [[0, 3]],
	scratchRight: [[0, 3]],
	cry_expression: [[0, 3]],
	fall_expression: [[0, 3]],
	sit_expression: [[0, 3]],
	surprise_expression: [[0, 3]],
	jumping: [[7, 4]],
	falling: [[7, 4]],
	slide_down: [[0, 3]]
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
	constructor(states, priorities, stateConfig) {
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
			BaseSpriteSets
		);

		this.stateController = new StateController(
			this.loadStateRules(),
			this.loadStatePriorities(),
			this.loadStateConfig()
		);

		this.currentFrameIndex = 0;
		this.stateController.transitionTo(initialState);
	}

	loadStateRules() {
		return {
			[StateTypes.DRAGGING]: {
				check: (context) => context.isDragging,
				getState: (context) => this.getDraggingState()
			},
			[StateTypes.GRAVITY]: {
				check: (context) => context.isGravity &&
					(context.isFalling || context.isJumping),
				getState: (context) => context.isFalling ? 'falling' : 'jumping'
			},
			[StateTypes.SLIDE_DOWN]: {
				check: (context) => context.is_doing_action('slide_down') &&
					context.queue.getCurrentAction().current_target_index > 0,
				getState: () => 'slide_down'
			},

			[StateTypes.EXPRESSION]: {
				check: (context) => context.is_doing_action('do_expression'),
				getState: () => this.handleExpressionState()
			},
			[StateTypes.MOVING]: {
				check: (context) => context.is_moving() && !context.isDragging,
				getState: (context) => 'moving_' + context.direction
			},
			[StateTypes.IDLE]: {
				check: () => true,
				getState: (context) => context.is_doing_action('idle') ?
					'idle' : 'idle_' + context.direction
			},
			[StateTypes.BEING_CARRIED]: {
				check: (context) => context.is_doing_action('being_carried'),
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
				onTransitionEnd: 'idle'  // Add this line
			},
			'jumping': {
				spriteSet: ['jumping'],
				repeat: true
			},
			'falling': {
				spriteSet: ['falling'],
				repeat: true
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
		if (this.currentFrameIndex === -1) {
			this.parent.queue.removeCurrentAction();
			return 'idle_' + this.parent.direction;
		}
		return currentAction.action_type;
	}

	setSnail() {
		this.parent.duplicate.classList.add('snail');
		this.animator.setSize(192, 192);
		this.animator.setSpriteConfig(SnailSpriteSets);
	}

	update() {
		// Get current context
		const context = {
			isDragging: this.parent.isDragging,
			isGravity: this.parent.isGravity,
			isFalling: this.parent.isFalling,
			isJumping: this.parent.isJumping,
			direction: this.parent.direction,
			is_doing_action: (action) => this.parent.is_doing_action(action),
			is_moving: () => this.parent.is_moving(),
			queue: this.parent.queue
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
		return this.loadStateConfig()[state]?.spriteSet[0];
	}

	isAtLastFrame(animationKey) {
		return this.currentFrameIndex >= this.animator.getFrameCount(animationKey) - 1;
	}

	handleAnimationComplete(state) {
		const config = this.loadStateConfig()[state];

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