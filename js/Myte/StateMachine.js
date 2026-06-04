// Category keys used as IDs in state definitions. Not all live state strings are listed here —
// directional variants (idle_N, moving_S, etc.) are generated at build time from these categories.
const STATE_CATEGORIES = {
	IDLE:          'idle',
	MOVING:        'moving',
	EXPRESSION:    'expression',
	SLIDE_DOWN:    'slide_down',
	GRAVITY:       'gravity',
	DRAGGING:      'dragging',
	BEING_CARRIED: 'being_carried'
};

const DIRECTIONS = ['N', 'S', 'E', 'W'];

const OPPOSITE_DIRECTION = { N: 'S', S: 'N', E: 'W', W: 'E' };

const TURN_ANIMATION = {
	N: 'verticalTurn',   S: 'verticalTurn',
	E: 'horizontalTurn', W: 'horizontalTurn'
};

const EXPRESSION_STATES = ['cry', 'surprise', 'fall', 'sit', 'kiss'];

const STATE_GROUPS = {
	DRAG: 'drag'
};


// ---------------------------------------------------------------------------
// StateController — pure state machine with no parent references.
// Receives a pre-sorted states array (highest priority first) and calls
// onEnter(newState, config) instead of reaching into the parent hierarchy.
// ---------------------------------------------------------------------------
class StateController {
	constructor({ states, stateConfig, onEnter }) {
		this.states = states;           // sorted array, highest priority first
		this.stateConfig = stateConfig;
		this.onEnter = onEnter;         // (newState, prevState, config) => void
		this.currentState = null;
		this.previousState = null;
		this.stateEnteredAt = null;
		this.isTransitioning = false;
	}

	// Milliseconds spent in the current state. Returns 0 if no state is active.
	getStateDuration() {
		return this.stateEnteredAt != null ? (performance.now() - this.stateEnteredAt) : 0;
	}

	// Iterates in priority order; first passing check wins.
	// ctx must include: isDragging, isGravity, isFalling, isJumping, direction,
	//   isDoingAction(action), isMoving(), queue, currentState, animatorComplete
	determineNextState(ctx) {
		// sticky: hold the current state until its animation completes, then allow
		// normal selection. Prevents one-frame flashes on short non-looping animations.
		const currentConfig = this.stateConfig[this.currentState];
		if (currentConfig?.sticky && !ctx.animatorComplete) {
			return this.currentState;
		}

		for (const def of this.states) {
			if (def.check(ctx)) return def.resolve(ctx);
		}
		return this.currentState; // unreachable if IDLE has check: () => true
	}

	transitionTo(newState) {
		if (this.isTransitioning) return false;

		const transitionTarget = this.stateConfig[this.currentState]?.transitions?.[newState];
		if (transitionTarget) {
			this.isTransitioning = true;
			newState = transitionTarget;
		}

		if (this.currentState === newState) return false;

		const prevState = this.currentState;
		this.previousState = prevState;
		this.currentState = newState;
		this.stateEnteredAt = performance.now();
		this.onEnter?.(newState, prevState, this.stateConfig[newState]);
		return true;
	}

	handleTransitionComplete() {
		this.isTransitioning = false;
		const nextState = this.stateConfig[this.currentState]?.onTransitionEnd;
		if (nextState) this.transitionTo(nextState);
	}
}


// ---------------------------------------------------------------------------
// StateMachine — drives sprite animation and delegates state logic to
// StateController. All state definitions and config are data-driven;
// directional variants and turn transitions are generated programmatically.
// ---------------------------------------------------------------------------
class StateMachine {
	constructor(parent, initialState) {
		this.parent = parent;
		this.spriteElement = parent.duplicate.querySelector('.sprite');
		this.spriteConfig = {};
		this.spriteSize = { width: 64, height: 64 };
		this.spriteAnimator = new SpriteAnimator();

		this.stateConfig = this._buildStateConfig();

		this._stateListeners = new Set();

		this.stateController = new StateController({
			states: this._buildStateDefinitions(),
			stateConfig: this.stateConfig,
			onEnter: (state, prevState, config) => {
				if (config?.sound) this.parent.playSound(config.sound);
				if (window._stateMachineDebug) {
					console.log(`[StateMachine] ${this.parent.id ?? '?'}: ${prevState} → ${state}`);
				}
				this._notifyStateListeners(state, prevState, config);
			}
		});

		this.applySpeciesDefinition(this.parent.definition);
		this.stateController.transitionTo(initialState);
	}

	// -------------------------------------------------------------------------
	// Config builders — called once in the constructor.
	// -------------------------------------------------------------------------

	// Returns state definitions sorted highest priority first so StateController
	// can iterate without sorting on every frame. Priority values are kept as
	// documentation; the array order is what drives selection.
	_buildStateDefinitions() {
		return [
			{
				id: STATE_CATEGORIES.BEING_CARRIED,
				priority: 6,
				check: (ctx) => ctx.isDoingAction('being_carried'),
				resolve: (ctx) => `being_carried_${ctx.direction}`
			},
			{
				id: STATE_CATEGORIES.DRAGGING,
				priority: 5,
				// Continues to own the state while in any drag-cluster state,
				// so pickup → dragging → dropping plays out uninterrupted.
				check: (ctx) => ctx.isDragging || this.stateConfig[ctx.currentState]?.group === STATE_GROUPS.DRAG,
				resolve: (ctx) => this._resolveDraggingState(ctx.currentState, ctx.isDragging, ctx.animatorComplete)
			},
			{
				id: STATE_CATEGORIES.GRAVITY,
				priority: 4,
				check: (ctx) => ctx.isGravity && (
					ctx.isFalling || ctx.isJumping ||
					(ctx.currentState === 'falling' && !ctx.isFalling)
				),
				resolve: (ctx) => {
					if (ctx.currentState === 'falling' && !ctx.isFalling) return 'land';
					return ctx.isFalling ? 'falling' : 'jumping';
				}
			},
			{
				id: STATE_CATEGORIES.SLIDE_DOWN,
				priority: 3,
				check: (ctx) => ctx.isDoingAction('slide_down') &&
					ctx.queue.getCurrentAction().currentTargetIndex > 0,
				resolve: () => 'slide_down'
			},
			{
				id: STATE_CATEGORIES.EXPRESSION,
				priority: 2,
				check: (ctx) => ctx.isDoingAction('expression'),
				resolve: () => this._resolveExpressionState()
			},
			{
				id: STATE_CATEGORIES.MOVING,
				priority: 1,
				check: (ctx) => ctx.isMoving() && !ctx.isDragging,
				resolve: (ctx) => `moving_${ctx.direction}`
			},
			{
				id: STATE_CATEGORIES.IDLE,
				priority: 0,
				check: () => true,
				resolve: (ctx) => `idle_${ctx.direction || 'S'}`
			}
		];
	}

	// Builds the full stateConfig map. Directional idle/move/being_carried states
	// and turn transitions are generated from DIRECTIONS rather than enumerated.
	_buildStateConfig() {
		const config = {};

		for (const dir of DIRECTIONS) {
			const opp = OPPOSITE_DIRECTION[dir];

			config[`idle_${dir}`]          = { spriteKey: `idle_${dir}`, repeat: true };
			config[`being_carried_${dir}`] = { spriteKey: `idle_${dir}`, repeat: true };

			config[`moving_${dir}`] = {
				spriteKey: dir,
				repeat: true,
				transitions: { [`moving_${opp}`]: `transition_${dir}${opp}` }
			};

			// Turn transitions play once then resolve to the destination direction.
			// fps: 6 gives ~167ms hold for the single turn frame regardless of default anim fps.
			config[`transition_${dir}${opp}`] = {
				spriteKey: TURN_ANIMATION[dir],
				repeat: false,
				onTransitionEnd: `moving_${opp}`,
				fps: 6
			};
		}

		for (const expr of EXPRESSION_STATES) {
			config[expr] = { spriteKey: `${expr}_expression`, repeat: false, removeActionOnComplete: true };
		}

		return {
			...config,
			'idle':          { spriteKey: 'idle',         repeat: true },
			'being_carried': { spriteKey: 'idle',         repeat: true },
			'scratch_left':  { spriteKey: 'scratchLeft',  repeat: true },
			'scratch_right': { spriteKey: 'scratchRight', repeat: true },
			// group keeps the DRAGGING definition in control across the full pickup sequence.
			'pickup':        { spriteKey: 'pickup',        repeat: false, onTransitionEnd: 'dragging', group: STATE_GROUPS.DRAG, fps: 12 },
			'dragging':      { spriteKey: 'dragging',      repeat: true,  group: STATE_GROUPS.DRAG },
			'dropping':      { spriteKey: 'dropping',      repeat: false, onTransitionEnd: 'land',     group: STATE_GROUPS.DRAG, fps: 10 },
			'land':          { spriteKey: 'land',          repeat: false, sound: 'land', sticky: true },
			'jumping':       { spriteKey: 'jumping',       repeat: true,  sound: 'jump' },
			'falling':       { spriteKey: 'falling',       repeat: true  },
			'slide_down':    { spriteKey: 'slide_down',    repeat: true  }
		};
	}

	// -------------------------------------------------------------------------
	// State resolution helpers — called from state definitions above.
	// -------------------------------------------------------------------------

	_resolveDraggingState(currentState, isDragging, animatorComplete) {
		if (!isDragging) return 'dropping';
		if (currentState !== 'pickup' && currentState !== 'dragging') return 'pickup';
		if (currentState === 'pickup' && animatorComplete) return 'dragging';
		return currentState;
	}

	_resolveExpressionState() {
		const currentAction = this.parent.queue.getCurrentAction();
		if (!currentAction) return `idle_${this.parent.direction}`;

		const resolvedState = MyteDefinitionRegistry.resolveExpression(
			currentAction.actionType,
			this.stateConfig,
			this.parent?.definition
		);

		// Unresolvable expression — remove immediately and fall back to idle.
		if (!resolvedState) {
			this.parent.queue.removeCurrentAction();
			return `idle_${this.parent.direction}`;
		}

		return resolvedState;
	}

	// -------------------------------------------------------------------------
	// Species / appearance — applies visual definition to DOM and loads sprites.
	// Note: DOM class/dataset management is a visual concern; a future
	// AppearanceController on the parent could own this.
	// -------------------------------------------------------------------------

	applySpeciesDefinition(definition) {
		const visualConfig = definition?.visual || {};
		const frameSize    = visualConfig.frameSize || {};
		const spriteSets   = visualConfig.spriteSets;
		const speciesId    = definition?.id || this.parent.species;

		const targets = [this.parent.duplicate, this.parent.element, this.parent.elements.wrapper];

		MyteDefinitionRegistry.getSpeciesIds().forEach((knownSpeciesId) => {
			targets.forEach(el => el.classList.remove(knownSpeciesId));
		});

		targets.forEach(el => {
			el.classList.add(speciesId);
			el.dataset.myteSpecies = speciesId;
		});

		if (!spriteSets || Object.keys(spriteSets).length === 0) {
			console.error(`[StateMachine] Species "${speciesId}" has no spriteSets defined.`);
		}

		this.spriteSize   = { width: frameSize.width || 64, height: frameSize.height || 64 };
		this.spriteConfig = spriteSets || {};
	}

	// -------------------------------------------------------------------------
	// Animation
	// -------------------------------------------------------------------------

	_initAnimatorForState(state) {
		const cfg    = this.stateConfig[state];
		const animKey = this.getAnimationKey(state);
		let frames   = this.spriteConfig[animKey] ?? [];

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
			fps:  cfg?.fps,
			loop: cfg?.repeat ?? true
		});
	}

	_getAnimationSpeedScale(state) {
		if (!String(state || '').startsWith('moving_')) return 1;

		const locomotionConfig = this.parent.definition?.audio?.locomotion ?? {};
		const animationRange   = locomotionConfig.animationSpeedScale ?? {};
		const currentSpeed     = this.parent.stats?.getSpeed?.() ?? this.parent.speed ?? 1;
		const baseSpeed        = this.parent.definition?.movement?.baseSpeed ?? this.parent.speed ?? 1;
		const rawScale         = currentSpeed / Math.max(0.01, baseSpeed);

		return Utility.clamp(rawScale, animationRange.min ?? 0.85, animationRange.max ?? 1.25);
	}

	_getFrameEvents(state) {
		if (!String(state || '').startsWith('moving_')) return [];

		const footsteps = this.parent.definition?.audio?.locomotion?.footsteps ?? {};
		if (footsteps.enabled === false) return [];

		const frames = Array.isArray(footsteps.frames) && footsteps.frames.length
			? footsteps.frames
			: [1, 5];

		return frames.map((frameIndex, i) => ({
			type:       'footstep',
			frameIndex: Number(frameIndex),
			foot:       i % 2 === 0 ? 'left' : 'right'
		}));
	}

	_triggerFrameEvents(state, animationKey, frameIndex) {
		this._getFrameEvents(state)
			.filter(e => e.frameIndex === frameIndex)
			.forEach(event => {
				this.parent.handleAnimationFrameEvent?.({ ...event, state, animationKey });
			});
	}

	_renderCurrentFrame() {
		const animKey = this.getAnimationKey(this.stateController.currentState);
		if (!animKey || !this.spriteElement) return;
		this.spriteElement.style.backgroundPosition =
			this.spriteAnimator.getBackgroundPosition(this.spriteSize.width, this.spriteSize.height);
		this.parent.duplicate.setAttribute('sprite', animKey);
	}

	// -------------------------------------------------------------------------
	// Update loop
	// -------------------------------------------------------------------------

	update(deltaTime) {
		const ctx = {
			isDragging:       this.parent.isDragging,
			isGravity:        this.parent.isGravity,
			isFalling:        this.parent.isFalling,
			isJumping:        this.parent.isJumping,
			direction:        this.parent.direction,
			isDoingAction:    (action) => this.parent.isDoingAction(action),
			isMoving:         () => this.parent.isMoving(),
			queue:            this.parent.queue,
			currentState:     this.stateController.currentState,
			animatorComplete: this.spriteAnimator.isComplete
		};

		const newState = this.stateController.determineNextState(ctx);
		if (this.stateController.transitionTo(newState)) {
			this._initAnimatorForState(this.stateController.currentState);
			// If the transition animation is already complete (e.g. no frames defined),
			// resolve it immediately rather than waiting for the update loop.
			if (this.stateController.isTransitioning && this.spriteAnimator.isComplete) {
				this.handleAnimationComplete(this.stateController.currentState);
			}
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

	handleAnimationComplete(state) {
		const config = this.stateConfig[state];
		if (!config) return;

		if (config.removeActionOnComplete) {
			this.parent.queue.removeCurrentAction();
		}

		if (this.stateController.isTransitioning) {
			this.stateController.handleTransitionComplete();
			this._initAnimatorForState(this.stateController.currentState);
			this._renderCurrentFrame();
		} else if (!config.repeat && config.onTransitionEnd) {
			if (this.stateController.transitionTo(config.onTransitionEnd)) {
				this._initAnimatorForState(this.stateController.currentState);
				this._renderCurrentFrame();
			}
		}
		// If !repeat and no onTransitionEnd: hold on last frame.
		// determineNextState will see animatorComplete=true and transition out naturally.
	}

	// -------------------------------------------------------------------------
	// Utilities
	// -------------------------------------------------------------------------

	// Public API — callers should use these rather than reaching into stateController.
	get currentState()    { return this.stateController.currentState; }
	get previousState()   { return this.stateController.previousState; }
	getStateDuration()    { return this.stateController.getStateDuration(); }

	getAnimationKey(state) {
		return this.stateConfig[state]?.spriteKey;
	}

	getAnchorDirection(fallbackDirection = this.parent.direction) {
		const normalizedFallback = String(fallbackDirection || 'S').trim().toUpperCase();
		const currentState  = this.currentState || '';
		const animationKey  = this.getAnimationKey(currentState);

		const directDirection = this._extractCardinalDirection(currentState) ||
		                        this._extractCardinalDirection(animationKey);
		if (directDirection) return directDirection;

		const frameRow = this._getSpriteFrameRow(animationKey);
		if (frameRow == null) return normalizedFallback;

		// Check generated directional idle states and raw direction keys.
		const candidates = DIRECTIONS.flatMap(d => [`idle_${d}`, d]);
		for (const candidate of candidates) {
			if (this._getSpriteFrameRow(candidate) !== frameRow) continue;
			return this._extractCardinalDirection(candidate) || normalizedFallback;
		}

		return normalizedFallback;
	}

	// Subscribe to state changes. fn receives (newState, previousState, config).
	addStateListener(fn) {
		this._stateListeners.add(fn);
	}

	removeStateListener(fn) {
		this._stateListeners.delete(fn);
	}

	_notifyStateListeners(newState, prevState, config) {
		if (!this._stateListeners.size) return;
		this._stateListeners.forEach(fn => fn(newState, prevState, config));
	}

	_extractCardinalDirection(value) {
		const match = String(value || '').trim().toUpperCase().match(/(?:^|_)(N|S|E|W)$/);
		return match ? match[1] : null;
	}

	_getSpriteFrameRow(spriteKey) {
		if (!spriteKey) return null;
		const frames = this.spriteConfig[spriteKey];
		if (!Array.isArray(frames) || frames.length === 0 || !Array.isArray(frames[0])) return null;
		const row = Number(frames[0][1]);
		return Number.isFinite(row) ? row : null;
	}
}
