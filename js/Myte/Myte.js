

class Myte {

	constructor(id, parent, element, definition = null) {

		// --- Identity & Definition ---
		this.id = id;
		this.parent = parent;
		this.element = element;
		this.species = MyteDefinitionRegistry.normalizeSpeciesId(
			element?.dataset?.myteSpecies ||
			element?.closest('.myte-slot')?.dataset?.myteSpecies ||
			definition?.id ||
			'snail'
		);
		this.definition = definition || MyteDefinitionRegistry.getSpeciesSync(this.species);
		this.name = element.dataset.myteName || this.definition.label || `Myte ${id}`;

		// --- DOM elements ---
		this.elements = {
			wrapper: this.element.closest(".myte-slot"),
		};
		this.dropTarget;   // assigned in init() via closest('.myte-slot')
		this.dialogue;
		this.renderer = null;

		// --- Capabilities ---
		this.capabilities = {
			...(typeof EntityDefaults?.capabilities === 'function' ? EntityDefaults.capabilities() : {}),
			...(this.definition.capabilities || {})
		};

		// --- Goals & mode lists ---
		this.modes = [MOVE_TYPES.FOLLOW, MOVE_TYPES.FREEROAM, MOVE_TYPES.GRAVITY, MOVE_TYPES.GOHOME, MOVE_TYPES.QUEUE_ONLY];
		this.followModes = [MOVE_FOLLOW_TYPES.NORMAL, MOVE_FOLLOW_TYPES.CIRCLES, MOVE_FOLLOW_TYPES.RUNAWAY, MOVE_FOLLOW_TYPES.LEASH];
		this.autonomyModes = [MOVE_AUTONOMY_TYPES.WANDER, MOVE_AUTONOMY_TYPES.INTERACT, MOVE_AUTONOMY_TYPES.REST, MOVE_AUTONOMY_TYPES.SOCIAL];

		this.goal = DEFAULT_MODE;
		this.previousGoal = DEFAULT_MODE;
		this.followGoal = DEFAULT_FOLLOW_MODE;
		this.autonomyGoal = DEFAULT_AUTONOMY_MODE;

		// --- State flags ---
		this.stats = null;
		this.isActive = false;
		this.isPaused = false;
		this.isDragging = false;

		this.direction = DIRECTION.SOUTH;
		this.diagonalMovement = false;

		this.atOriginal = true;
		this.isFreeRoam = false;
		this.followMouse = false;
		this.isGravity = false;

		this.checkForCollisions = true;
		this.holdAtHomeSlotWhilePointerInside = false;

		// --- Systems (initialized in init()) ---
		this.queue;
		this.stateMachine;
		this.physicsController;
		this.movementController;
		this.footstepController;
		this.inputHandler;
		this.ai;
		this.buffs;

		// --- Movement config ---
		this.speed = this.definition.movement?.baseSpeed ?? 1;
		this.posX = 0;
		this.posY = 0;
		this.posZ = 0;
		this.targetX = 0;
		this.targetY = 0;

		this.followRadius = {
			min: this.definition.movement?.followRadius?.min ?? 96,
			max: this.definition.movement?.followRadius?.max ?? 384
		};
		this.runAwayAngleDistance = this.definition.movement?.runAwayDistance ?? 300;
		this.followOrbitAngle = 0;
		this.followOrbitSpeed = this.definition.movement?.orbitSpeed ?? 0.08;
		this.followLeashDistance = this.definition.movement?.leashDistance ?? Math.max(96, this.followRadius.min + 32);

		// --- Size & Collider ---
		this.size = {
			width: this.definition.size?.width ?? 192,
			height: this.definition.size?.height ?? 192
		};

		const colliderRegion = MyteDefinitionRegistry.getSpatialRegion(this.definition, 'collider');
		this.collider = {
			type: colliderRegion?.type ?? 'box',
			width: colliderRegion?.width ?? this.size.width * 0.5,
			height: colliderRegion?.height ?? this.size.height * 0.3,
			offsetX: colliderRegion?.x ?? this.size.width * 0.25,
			offsetY: colliderRegion?.y ?? this.size.height * 0.6
		};

		// --- Physics config ---
		this.physics = {
			gravity: this.definition.physics?.gravity ?? 0.3,
			terminalVelocity: this.definition.physics?.terminalVelocity ?? 12,
			jumpHeight: this.definition.physics?.jumpHeight ?? 10,
			airControl: this.definition.physics?.airControl ?? 0.7,
			groundFriction: this.definition.physics?.groundFriction ?? 0.8,
			minFallDamageVelocity: this.definition.physics?.minFallDamageVelocity ?? 22,
			coyoteTime: this.definition.physics?.coyoteTime ?? 80,
			jumpBuffer: this.definition.physics?.jumpBuffer ?? 150,
			collisionTolerance: this.definition.physics?.collisionTolerance ?? 5,
			stepHeight: this.definition.physics?.stepHeight ?? 3,
			velocity: this.definition.physics?.velocity ?? 0
		};

		// --- Misc runtime state ---
		this.startTime = 0;
		this._lastVisualDebugAt = 0;
		this._animElapsed = 0;

		this.inactivityState = {
			isFreeRoaming: false,
			goal: null,
			followGoal: null,
			autonomyGoal: null
		};
		this.goHomePathState = {
			hasPlannedPath: false,
			directFallbackFrames: 0,
			lastPlanAt: 0
		};
		this.colliderRecoveryState = {
			overlapFrames: 0,
			lastRecoverAt: 0
		};
		this._lastFinitePosition = { x: 0, y: 0 };
		this._lastFiniteTarget = { x: 0, y: 0 };
	}


	/********************************************
	 * Lifecycle
	 ********************************************/

	init() {
		this.physicsController = new MytePhysics(this);
		this.movementController = new MyteMovementController(this);
		this.footstepController = new FootstepController(this);
		this.renderer = new MyteRenderer(this);
		this.renderer.initInteractiveMyte();
		this.renderer.createTargetDot();
		this.dropTarget = this.element.closest('.myte-slot');

		this.queue = new MyteQueue(this);
		this.stateMachine = new StateMachine(this, DEFAULT_STATE);
		this.inputHandler = new MyteInputHandler(this);
		this.dialogue = new MyteDialogue(this);
		this.stats = new MyteStats(this);
		this.buffs = new MyteBuffController(this);
		this.ai = new MyteAI(this);

		const rect = this.parent.getOffset(this.element);
		const offsetX = rect.x - this.parent.getContainerRect().x;
		const offsetY = rect.y - this.parent.getContainerRect().y;
		this.setTarget(offsetX, offsetY);
		this.setPosition(offsetX, offsetY);
		this.setSpritePosition(this.posX, this.posY);
		this.ensureFiniteCoordinates('init');

		if (this.parent?.gameMap?.particleSystem) {
			this.initParticleEffects();
		} else {
			console.error(`Myte ${this.id}: Cannot initialize particle effects - ParticleSystem not found.`);
		}

		this.setStartTime();
	}

	pause() {
		this.isPaused = true;
	}

	resume() {
		this.isPaused = false;
	}

	start() {
		this.startWithOptions();
	}

	startWithOptions(options = {}) {
		const {
			goal = this.goal,
			followGoal = this.followGoal,
			autonomyGoal = this.autonomyGoal
		} = options;

		this.isActive = true;

		this.element.classList.add("is-deactivated");
		this.elements.wrapper.classList.add('empty');
		this.duplicate.classList.remove("is-deactivated");

		this.setAutonomyMode(autonomyGoal);
		this.setFollowMode(followGoal);
		this.setMode(goal);

		this.setStartTime();
		this.cancelInactivityFreeRoam();
		this.resetGoHomeState();
		this.footstepController?.reset?.();
		this.snapToHomePosition();
		this.playSlotExitSound();

		this.syncSelectionState();
		if (this.isActiveMyte) {
			this.parent.ui?.debugPanel?.enableButtons?.();
		}

		this.parent.eventManager?.emit('myte:started', { myte: this });
	}

	stop() {
		this.isActive = false;
		this.atOriginal = true;
		this.queue.clear();
		this.footstepController?.reset?.();
		this.clearHomeSlotHold();
		this.cancelInactivityFreeRoam();
		this.resetGoHomeState();

		if (this.goal === MOVE_TYPES.GOHOME) {
			this.goal = this.previousGoal === MOVE_TYPES.GOHOME ? DEFAULT_MODE : this.previousGoal;
		}

		const home = this.getHomePosition();
		this.posX = home.x;
		this.posY = home.y;
		this.posZ = 0;
		this.setTarget(home.x, home.y);
		this.setSpritePosition(home.x, home.y);

		this.element.classList.remove("is-deactivated");
		this.duplicate.classList.remove("is-active");
		this.duplicate.classList.add('is-deactivated');
		this.elements.wrapper.classList.remove('empty');
		this.targetDot.classList.add('is-hidden');

		this.playSlotEnterSound();
		this.parent.setNextMyteAsActive(this);
		if (this.parent.activeMyte == null) {
			this.parent.ui.debugPanel.disableButtons();
			this.parent.camera.setMode(this.parent.settings.defaultMyteCamera);
			this.parent.camera.resetView();
		}

		this.parent.eventManager?.emit('myte:stopped', { myte: this });
	}

	dispose() {
		this.queue?.clear?.();
		this.inputHandler?.dispose?.();
		this.dialogue?.destroy?.();
		this.buffs?.clear?.();
		this.stats?.destroy?.();
		this.targetDot?.remove?.();
		this.duplicate?.remove?.();
	}


	/********************************************
	 * Getters
	 ********************************************/

	get limitToContainer() { return this.parent.settings.limitMap; }
	get isActiveMyte() { return this === this.parent.activeMyte; }

	// Physics state forwarding — callers don't need to know about physicsController
	get isJumping() { return this.physicsController?.isJumping ?? false; }
	get isFalling() { return this.physicsController?.isFalling ?? false; }
	get isOnSolidGround() { return this.physicsController?.isOnSolidGround ?? false; }
	set isJumping(v) { if (this.physicsController) this.physicsController.isJumping = v; }
	set isFalling(v) { if (this.physicsController) this.physicsController.isFalling = v; }
	set isOnSolidGround(v) { if (this.physicsController) this.physicsController.isOnSolidGround = v; }

	// Renderer element forwarding
	get duplicate() { return this.renderer?.duplicate ?? null; }
	get sprite() { return this.renderer?.sprite ?? null; }
	get targetDot() { return this.renderer?.targetDot ?? null; }
	get battery() { return this.renderer?.battery ?? null; }
	get slotBattery() { return this.renderer?.homeBattery ?? null; }

	get isDeployed() { return this.isActive; }
	get isControlled() { return this.isActiveMyte; }
	get isInSlot() { return !this.isDeployed; }

	get distanceFromTarget() { return this.getDistanceToPoint(this.targetX, this.targetY).toFixed(2); }
	get distanceFromMouse() { return this.getDistanceFromMouse().toFixed(2); }


	/********************************************
	 * Home slot
	 ********************************************/

	getHomeSlotElement() {
		return this.dropTarget?.querySelector?.('.myte-home-slot') ||
			this.dropTarget ||
			this.elements.wrapper ||
			this.element;
	}

	getHomeSlotRect() {
		const slotElement = this.getHomeSlotElement();
		const rect = this.parent.getLocalOffset(slotElement);
		return {
			x: rect.left, y: rect.top,
			left: rect.left, top: rect.top,
			right: rect.right, bottom: rect.bottom,
			width: rect.width, height: rect.height
		};
	}

	getHomePosition() {
		// Derived from DOM layout (getLocalOffset walks offsetParents), so cache it —
		// AI thinks and GOHOME movement read this constantly. Invalidated whenever the
		// slot element moves (setWrapperPosition, map transitions, container resize).
		if (this._cachedHomePosition) return this._cachedHomePosition;

		const rect = this.getHomeSlotRect();
		this._cachedHomePosition = {
			x: rect.left + ((rect.width - this.size.width) / 2),
			y: rect.top + ((rect.height - this.size.height) / 2)
		};
		return this._cachedHomePosition;
	}

	invalidateHomePositionCache() {
		this._cachedHomePosition = null;
	}

	isAtHomePosition(tolerance = 0.5) {
		const home = this.getHomePosition();
		return Math.abs(this.posX - home.x) <= tolerance &&
			Math.abs(this.posY - home.y) <= tolerance;
	}

	snapToHomePosition() {
		const home = this.getHomePosition();
		this.setPosition(home.x, home.y);
		this.setTarget(home.x, home.y);
		this.setSpritePosition(home.x, home.y);
		return home;
	}

	setWrapperPosition(x, y) {
		this.elements.wrapper.style.left = x + 'px';
		this.elements.wrapper.style.top = y + 'px';
		this.invalidateHomePositionCache();
		this.snapToHomePosition();
	}

	holdInHomeSlotUntilPointerLeaves() { return this.movementController.holdInHomeSlotUntilPointerLeaves(); }
	clearHomeSlotHold() { this.movementController.clearHomeSlotHold(); }
	shouldHoldInHomeSlot() { return this.movementController.shouldHoldInHomeSlot(); }

	isPointerInsideHomeSlot() {
		if (!this.dropTarget || !this.parent?.inputHandler) return false;
		const mouse = this.parent.inputHandler.getMousePosition();
		const slotRect = this.parent.getRect(this.dropTarget);
		return Utility.isCoordTouchingElement(mouse.x, mouse.y, slotRect);
	}


	/********************************************
	 * Position & Target
	 ********************************************/

	setTarget(x = null, y = null, limit = false) {
		let setX = x != null;
		let setY = y != null;

		if (x == null) x = this.targetX;
		if (y == null) y = this.targetY;

		if (limit) {
			const rect = this.getRect();
			const clamped = this.parent.clampEntityPosition(this, x, y, { rect });
			x = clamped.x;
			y = clamped.y;
		}

		if (setX && Number.isFinite(x)) this.targetX = x;
		if (setY && Number.isFinite(y)) this.targetY = y;
		this.rememberFiniteCoordinates();
	}

	setPosition(x = null, y = null, limit = false) {
		let setX = x != null;
		let setY = y != null;

		if (x == null) x = this.posX;
		if (y == null) y = this.posY;

		if (limit) {
			const rect = this.getRect();
			const clamped = this.parent.clampEntityPosition(this, x, y, { rect });
			x = clamped.x;
			y = clamped.y;
		}

		if (setX && Number.isFinite(x)) this.posX = x;
		if (setY && Number.isFinite(y)) this.posY = y;
		this.rememberFiniteCoordinates();
	}

	unsetTarget() {
		this.targetX = this.posX;
		this.targetY = this.posY;
	}

	setTargetToOrigin() {
		const home = this.getHomePosition();
		this.targetX = home.x;
		this.targetY = home.y;
	}

	snapPositionToTarget(doXAxis = true, doYAxis = true) {
		if (doXAxis) this.posX = this.targetX;
		if (doYAxis) this.posY = this.targetY;
		this.ensureFiniteCoordinates('snapPositionToTarget');
	}

	getResolvedAnchorDirection(direction = null) {
		if (direction != null) {
			return String(direction).trim().toUpperCase();
		}

		return this.stateMachine?.getAnchorDirection?.(this.direction) ||
			String(this.direction || 'S').trim().toUpperCase();
	}

	getAnchorDefinition(anchorId, direction = null) {
		return MyteDefinitionRegistry.getSpatialAnchor(
			this.definition,
			anchorId,
			this.getResolvedAnchorDirection(direction)
		) || {};
	}

	getAnchorWorldPosition(anchorId, direction = null, fallback = {}) {
		const anchor = this.getAnchorDefinition(anchorId, direction);
		const fallbackX = fallback.x ?? Math.round(this.size.width * 0.5);
		const fallbackY = fallback.y ?? Math.round(this.size.height * 0.5);
		return {
			x: this.posX + (anchor.x ?? fallbackX),
			y: this.posY + (anchor.y ?? fallbackY)
		};
	}

	getAnchoredItemPosition(anchorId, itemSize = {}, direction = null, fallback = {}) {
		const anchor = this.getAnchorDefinition(anchorId, direction);
		const itemWidth = itemSize.width ?? 0;
		const itemHeight = itemSize.height ?? 0;
		const anchorX = anchor.x ?? fallback.x ?? Math.round(this.size.width * 0.5);
		const anchorY = anchor.y ?? fallback.y ?? Math.round(this.size.height * 0.5);
		const itemAnchorX = anchor.itemAnchorX ?? fallback.itemAnchorX ?? 0.5;
		const itemAnchorY = anchor.itemAnchorY ?? fallback.itemAnchorY ?? 0.5;
		return {
			x: this.posX + anchorX - (itemWidth * itemAnchorX),
			y: this.posY + anchorY - (itemHeight * itemAnchorY)
		};
	}

	getCarriedItemPosition(itemSize = {}) {
		return this.getAnchoredItemPosition('carry.item', itemSize, null, {
			x: Math.round(this.size.width * 0.5),
			y: Math.round(this.size.height * 0.12),
			itemAnchorX: 0.5,
			itemAnchorY: 1
		});
	}

	getMouthItemPosition(itemSize = {}) {
		return this.getAnchoredItemPosition('mouth.item', itemSize, null, {
			x: Math.round(this.size.width * 0.5),
			y: Math.round(this.size.height * 0.55),
			itemAnchorX: 0.5,
			itemAnchorY: 0.5
		});
	}


	/********************************************
	 * Coordinate safety
	 ********************************************/

	rememberFiniteCoordinates() {
		if (Number.isFinite(this.posX) && Number.isFinite(this.posY))
			this._lastFinitePosition = { x: this.posX, y: this.posY };
		if (Number.isFinite(this.targetX) && Number.isFinite(this.targetY))
			this._lastFiniteTarget = { x: this.targetX, y: this.targetY };
	}

	getSafeHomePosition() {
		const home = this.getHomePosition();
		return {
			x: Number.isFinite(home?.x) ? home.x : 0,
			y: Number.isFinite(home?.y) ? home.y : 0
		};
	}

	ensureFiniteCoordinates(source = 'unknown') {
		const home = this.getSafeHomePosition();

		const fallbackPosition = {
			x: Number.isFinite(this._lastFinitePosition?.x)
				? this._lastFinitePosition.x
				: (Number.isFinite(this.targetX) ? this.targetX : home.x),
			y: Number.isFinite(this._lastFinitePosition?.y)
				? this._lastFinitePosition.y
				: (Number.isFinite(this.targetY) ? this.targetY : home.y)
		};
		const fallbackTarget = {
			x: Number.isFinite(this._lastFiniteTarget?.x)
				? this._lastFiniteTarget.x
				: (Number.isFinite(this.posX) ? this.posX : home.x),
			y: Number.isFinite(this._lastFiniteTarget?.y)
				? this._lastFiniteTarget.y
				: (Number.isFinite(this.posY) ? this.posY : home.y)
		};

		let didCorrect = false;

		if (!Number.isFinite(this.posX)) { this.posX = Number.isFinite(fallbackPosition.x) ? fallbackPosition.x : home.x; didCorrect = true; }
		if (!Number.isFinite(this.posY)) { this.posY = Number.isFinite(fallbackPosition.y) ? fallbackPosition.y : home.y; didCorrect = true; }
		if (!Number.isFinite(this.targetX)) { this.targetX = Number.isFinite(fallbackTarget.x) ? fallbackTarget.x : this.posX; didCorrect = true; }
		if (!Number.isFinite(this.targetY)) { this.targetY = Number.isFinite(fallbackTarget.y) ? fallbackTarget.y : this.posY; didCorrect = true; }

		if (didCorrect) {
			this.physicsController?.reset?.();
			this.setSpritePosition(this.posX, this.posY);
			console.warn(`[Myte:${this.name}] Recovered invalid coordinates during ${source}`, {
				posX: this.posX, posY: this.posY, targetX: this.targetX, targetY: this.targetY
			});
		}

		this.rememberFiniteCoordinates();
		return didCorrect;
	}


	/********************************************
	 * Direction
	 ********************************************/

	setDirection(direction) {
		if (direction !== this.direction) this.direction = direction;
	}

	// Horizontal movement is visually dominant for the side-view sprites, so dx
	// gets extra weight when picking a cardinal facing.
	_directionFromDelta(dx, dy, directionWeight = 2) {
		const distance = Math.hypot(dx, dy);

		if (!Number.isFinite(distance) || distance === 0) return this.direction;

		const wx = (dx / distance) * directionWeight;
		const wy = dy / distance;

		return Math.abs(wx) > Math.abs(wy)
			? (wx > 0 ? DIRECTION.EAST : DIRECTION.WEST)
			: (wy > 0 ? DIRECTION.SOUTH : DIRECTION.NORTH);
	}

	getDirection(directionWeight = 2) {
		return this._directionFromDelta(
			this.targetX - this.posX,
			this.targetY - this.posY,
			directionWeight
		);
	}

	faceTowardsPoint(x, y, directionWeight = 2) {
		const direction = this._directionFromDelta(
			x - (this.posX + this.size.width / 2),
			y - (this.posY + this.size.height / 2),
			directionWeight
		);

		this.setDirection(direction);
		return direction;
	}


	/********************************************
	 * Movement (delegated to MyteMovementController)
	 ********************************************/

	setMode(newGoal = null) { this.movementController.setMode(newGoal); }
	handleModeTransition(previousGoal, nextGoal) { this.movementController.handleModeTransition(previousGoal, nextGoal); }
	setFollowMode(newGoal = null) { this.movementController.setFollowMode(newGoal); }
	setAutonomyMode(newGoal = null) { this.movementController.setAutonomyMode(newGoal); }

	moveTowardsTarget(doXAxis = true, doYAxis = true) { this.movementController.moveTowardsTarget(doXAxis, doYAxis); }
	moveTowardsTargetDirect(doXAxis = true, doYAxis = true) { this.movementController.moveTowardsTargetDirect(doXAxis, doYAxis); }

	doMovementLogic(deltaTime) { this.movementController.doMovementLogic(deltaTime); }
	canMoveToPosition(x, y) { return this.movementController.canMoveToPosition(x, y); }
	watchCursor() { this.movementController.watchCursor(); }

	updateTargetToFollowMouse(doXAxis = true, doYAxis = true) { this.movementController.updateTargetToFollowMouse(doXAxis, doYAxis); }
	doCircleFollow(mouse, mouseDistance, doXAxis = true, doYAxis = true) { this.movementController.doCircleFollow(mouse, mouseDistance, doXAxis, doYAxis); }
	doLeashFollow(mouse, mouseDistance, doXAxis = true, doYAxis = true) { this.movementController.doLeashFollow(mouse, mouseDistance, doXAxis, doYAxis); }
	doRunAway(doXAxis = true, doYAxis = true) { this.movementController.doRunAway(doXAxis, doYAxis); }

	enterInactivityFreeRoam() { return this.movementController.enterInactivityFreeRoam(); }
	restoreFromInactivityFreeRoam() { return this.movementController.restoreFromInactivityFreeRoam(); }
	cancelInactivityFreeRoam() { this.movementController.cancelInactivityFreeRoam(); }

	resetGoHomeState() { this.movementController.resetGoHomeState(); }
	beginGoHomeJourney(forceReplan = false) { return this.movementController.beginGoHomeJourney(forceReplan); }

	moveDrag() {
		const rect = this.getRect();
		const mouse = this.parent.inputHandler.getMouseWorldPosition();
		const x = mouse.x - (rect.width / 2);
		const y = mouse.y - (rect.height / 4);

		this.setTarget(x, y, this.limitToContainer);
		this.setPosition(x, y, this.limitToContainer);
		this.setSpritePosition(x, y, this.limitToContainer);

		this.duplicate.classList.add("is-dragging");

		const dropTargetRect = this.parent.getRect(this.dropTarget);
		if (Utility.isCoordTouchingElement(this.parent.mousePosX, this.parent.mousePosY, dropTargetRect)) {
			this.dropTarget.classList.add("is-drag-over");
		} else {
			this.dropTarget.classList.remove("is-drag-over");
		}
		this.dropTarget.classList.add("is-droppable");
	}

	setStartTime() { this.startTime = Date.now(); }
	canDrag() { return Date.now() - this.startTime > 1000; }
	isIndependent() { return !this.isDragging; }


	/********************************************
	 * Physics (delegated to MytePhysics)
	 ********************************************/

	adjustPhysicsForCharacter() { this.physicsController.adjustPhysicsForCharacter(); }
	getFeetPosition() { return this.physicsController.getFeetPosition(); }
	isStandingOnCollider(c) { return this.physicsController.isStandingOnCollider(c); }
	applyGravity() { return this.physicsController.applyGravity(); }
	moveGravity() { this.physicsController.moveGravity(); }
	isCurrentlyJumping() { return this.physicsController.isCurrentlyJumping(); }
	doJump() { return this.physicsController.doJump(); }
	doLandFromFall() { this.physicsController.doLandFromFall(); }
	reset() { this.physicsController.reset(); }


	/********************************************
	 * Spatial regions & collision
	 ********************************************/

	getRegionConfig(regionId = 'collider', direction = this.direction) {
		return MyteDefinitionRegistry.getSpatialRegion(
			this.definition,
			this.normalizeRegionId(regionId),
			direction
		);
	}

	getRegionRect(regionId = 'collider', direction = this.direction) {
		const region = this.getRegionConfig(regionId, direction);
		if (!region) return null;

		const x = this.posX + (region.x ?? region.offsetX ?? 0);
		const y = this.posY + (region.y ?? region.offsetY ?? 0);
		const width = region.width ?? this.size.width;
		const height = region.height ?? this.size.height;
		return {
			x, y, left: x, top: y,
			right: x + width, bottom: y + height,
			width, height, type: region.type ?? 'box'
		};
	}

	_getFullSpriteRect() {
		return {
			x: this.posX, y: this.posY,
			left: this.posX, top: this.posY,
			right: this.posX + this.size.width,
			bottom: this.posY + this.size.height,
			width: this.size.width, height: this.size.height,
			type: 'box'
		};
	}

	getInteractionRect() {
		return this.getRegionRect('interaction') || this._getFullSpriteRect();
	}

	getSelectionRect() {
		return this.getRegionRect('select') ||
			this.getRegionRect('interaction') ||
			this.getRegionRect('collider') ||
			this._getFullSpriteRect();
	}

	getPickupRect() {
		return this.getRegionRect('pickup') || this.getSelectionRect();
	}

	getOverlappingColliders() { return this.movementController.getOverlappingColliders(); }
	tryResolveColliderOverlap(force = false) { return this.movementController.tryResolveColliderOverlap(force); }


	/********************************************
	 * Queries & predicates
	 ********************************************/

	isMoving() {
		if (this.isAtTarget()) return false;
		return this.getDistanceToPoint(this.targetX, this.targetY) > 0;
	}

	isAtTarget() {
		if (!Number.isFinite(this.posX) || !Number.isFinite(this.posY) ||
			!Number.isFinite(this.targetX) || !Number.isFinite(this.targetY)) return false;
		return this.getDistanceToPoint(this.targetX, this.targetY) <= 0.5;
	}

	isDoingAction(action) {
		return this.queue.count() >= 1 && this.queue.getCurrentAction().action === action;
	}

	getDistanceFromMouse() {
		const mouse = this.parent.inputHandler.getMouseWorldPosition({ element: this });
		return this.getDistanceToPoint(mouse.x, mouse.y);
	}

	getWorldRect() {
		return {
			left: this.posX, top: this.posY,
			right: this.posX + this.size.width,
			bottom: this.posY + this.size.height,
			width: this.size.width, height: this.size.height
		};
	}

	getRect() { return this.parent.getRect(this.duplicate); }
	getOffsetRect() { return this.parent.getLocalOffset(this.duplicate); }

	getRandomNearbyObject(range, returnClosest = false) {
		const nearbyObjects = this.parent.gameMap.objects.filter(obj => {
			const distanceX = Math.abs(this.posX - obj.posX);
			const distanceY = Math.abs(this.posY - obj.posY);
			return obj !== this && obj.active && distanceX <= range && distanceY <= range;
		});

		if (nearbyObjects.length === 0) return null;

		if (returnClosest) {
			return nearbyObjects.reduce((closest, obj) => {
				const d = Math.hypot(this.posX - obj.posX, this.posY - obj.posY);
				const closestD = Math.hypot(this.posX - closest.posX, this.posY - closest.posY);
				return d < closestD ? obj : closest;
			});
		}

		return Utility.randomChoice(nearbyObjects);
	}

	getMoveType(i) { return Utility.getKeyByValue(MOVE_TYPES, i); }
	getMoveFollowType(i) { return Utility.getKeyByValue(MOVE_FOLLOW_TYPES, i); }
	getMoveAutonomyType(i) { return Utility.getKeyByValue(MOVE_AUTONOMY_TYPES, i); }


	/********************************************
	 * Rendering & visuals
	 ********************************************/

	setSpritePosition(x, y, limit) { this.renderer?.setSpritePosition(x, y, limit); }
	getZIndex(y) { return this.renderer?.getZIndex(y) ?? 0; }
	setZIndex(y) { this.renderer?.setZIndex(y); }
	updateTargetDot() { this.renderer?.updateTargetDot(); }
	logVisualDebug(source) { this.renderer?.logVisualDebug(source); }

	syncSelectionState() {
		if (!this.duplicate || !this.targetDot) return;
		this.duplicate.classList.toggle('is-active', this.isActiveMyte);
		this.targetDot.classList.toggle('is-hidden', !this.isActiveMyte);
	}


	/********************************************
	 * Sound
	 ********************************************/

	playSound(sound) {
		if (!sound) return;
		const soundManager = this.parent?.core?.soundManager;
		if (!soundManager) return;

		const normalized = String(sound).trim();
		if (/^(ui_|obj_|env_|music_|footstep_)/.test(normalized)) {
			soundManager.play(normalized);
			return;
		}

		soundManager.playMyteSound(normalized, { species: this.species });
	}

	playSlotEnterSound() { this.playSound('slot_enter'); }
	playSlotExitSound() { this.playSound('slot_exit'); }
	handleAnimationFrameEvent(event) { this.footstepController?.handleAnimationEvent?.(event); }


	/********************************************
	 * Particles
	 ********************************************/

	initParticleEffects() {
		const particleSystem = this.parent.gameMap.particleSystem;
		particleSystem.addParticleMethodsToObject(this);

		this.addEventEffect('myte:landed', 'LANDING_DUST', {
			storeReference: false,
			attachmentPoint: 'feet',
			positionAtFeet: true,
			eventFilter: ({ myte }) => myte === this
		});
	}


	/********************************************
	 * Update loop
	 ********************************************/

	update(deltaTime) {
		if (!this.isActive) return;
		this._dt = deltaTime; // stored so movement helpers can read it without threading it through every call site
		this.ensureFiniteCoordinates('update:start');

		this.updateTargetDot();
		this.doMovementLogic(deltaTime);
		this.tryResolveColliderOverlap();
		this.ensureFiniteCoordinates('update:end');

		this.buffs?.update?.(deltaTime);
		this.stats.update(deltaTime);
		this.stateMachine.update(deltaTime);
		this.renderer?.applyVerticalVisuals?.();

		// Grid front-tile only needs ~8fps
		this._gridElapsed = (this._gridElapsed || 0) + deltaTime;
		if (this._gridElapsed >= 125) {
			this._gridElapsed -= 125;
			if (this.parent?.gameMap?.gridSystem) {
				this.parent.gameMap.gridSystem.updateMyteFrontTile(this);
			}
		}
	}

	updateInactive(deltaTime) {
		if (this.isActive) return;
		this.buffs?.update?.(deltaTime);
		this.stats?.updateInHomeSlot?.(deltaTime);
	}

	tickUpdate(tickDelta) {
		if (!this.isActive) return;
		this.ai?.tickUpdate(tickDelta);
		this._syncCompanionBuffs(tickDelta);
	}

	_syncCompanionBuffs(tickDelta) {
		this._companionAccumulator = (this._companionAccumulator ?? 0) + tickDelta;
		if (this._companionAccumulator < SiteConfig.myte.companionSyncInterval) return;
		this._companionAccumulator = 0;

		const radius = SiteConfig.myte.companionRadius;
		const hasCompanion = (this.parent?.mytes ?? []).some(
			other => other !== this && other.isActive && this.getDistanceTo(other) <= radius
		);
		this.buffs?.syncContextBuff?.('companion:nearby', 'companionship_aura', { active: hasCompanion });
	}

}

// Shared pathfinding and capability methods (initPathfinder, tryOpenCollider, etc.)
applyEntityMixin(Myte);
