

class Myte {

	constructor(id, parent, element, definition = null) {
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
		this.name = element.dataset.myteName || this.definition.displayName || `Myte ${id}`;
		this.stats = null;
		this.isActive = false;
		this.isPaused = false;

		this.direction = DIRECTION.SOUTH;
		this.diagonalMovement = false;

		this.elements = {
			wrapper: this.element.closest(".myte-slot"),
		};

		this.capabilities = {
			...(typeof EntityDefaults?.capabilities === 'function' ? EntityDefaults.capabilities() : {}),
			...(this.definition.capabilities || {})
		};

		// elements owned by renderer (accessed via forwarding getters below)
		this.dropTarget;

		this.dialogue;

		// renderer initialised in init()
		this.renderer = null;

		// speed
		this.speed = this.definition.movement?.baseSpeed ?? 1;

		// positions
		this.posX = 0;
		this.posY = 0;
		this.targetX = 0;
		this.targetY = 0;

		this.modes = [MOVE_TYPES.FOLLOW, MOVE_TYPES.FREEROAM, MOVE_TYPES.GRAVITY, MOVE_TYPES.GOHOME, MOVE_TYPES.QUEUE_ONLY];
		this.followModes = [MOVE_FOLLOW_TYPES.NORMAL, MOVE_FOLLOW_TYPES.CIRCLES, MOVE_FOLLOW_TYPES.RUNAWAY, MOVE_FOLLOW_TYPES.LEASH];
		this.autonomyModes = [MOVE_AUTONOMY_TYPES.WANDER, MOVE_AUTONOMY_TYPES.INTERACT, MOVE_AUTONOMY_TYPES.REST, MOVE_AUTONOMY_TYPES.SOCIAL];

		// goal vars
		this.atOriginal = true;
		this.isFreeRoam = false;
		this.followMouse = false;
		this.isGravity = false;
		this.isDragging = false;

		// goals
		this.goal = DEFAULT_MODE;
		this.previousGoal = DEFAULT_MODE;
		this.followGoal = DEFAULT_FOLLOW_MODE;
		this.autonomyGoal = DEFAULT_AUTONOMY_MODE;

		// systems
		this.queue;
		this.stateMachine;
		this.physicsController;
		this.ai;

		// bools
		this.checkForCollisions = true;




		this.followRadius = {
			min: this.definition.movement?.followRadius?.min ?? 96,
			max: this.definition.movement?.followRadius?.max ?? 384
		};

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

		// physics state lives on physicsController — initialised in init()

		this.startTime = 0;
		this.runAwayAngleDistance = this.definition.movement?.runAwayDistance ?? 300;
		this.followOrbitAngle = 0;
		this.followOrbitSpeed = this.definition.movement?.orbitSpeed ?? 0.08;
		this.followLeashDistance = this.definition.movement?.leashDistance ?? Math.max(96, this.followRadius.min + 32);
		this.inputHandler;
		this.holdAtHomeSlotWhilePointerInside = false;
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

	get limitToContainer() { return this.parent.settings.limitMap; }

	// Forwarding getters so external code (StateMachine, actions) reads physics state
	// directly from myte without knowing about physicsController.
	get isJumping()       { return this.physicsController?.isJumping ?? false; }
	get isFalling()       { return this.physicsController?.isFalling ?? false; }
	get isOnSolidGround() { return this.physicsController?.isOnSolidGround ?? false; }
	set isJumping(v)       { if (this.physicsController) this.physicsController.isJumping = v; }
	set isFalling(v)       { if (this.physicsController) this.physicsController.isFalling = v; }
	set isOnSolidGround(v) { if (this.physicsController) this.physicsController.isOnSolidGround = v; }

	// Forwarding getters so external code reads DOM elements from the renderer.
	get duplicate() { return this.renderer?.duplicate ?? null; }
	get sprite()    { return this.renderer?.sprite ?? null; }
	get targetDot() { return this.renderer?.targetDot ?? null; }
	get battery()   { return this.renderer?.battery ?? null; }
	get slotBattery() { return this.renderer?.homeBattery ?? null; }
	get isDeployed() { return this.isActive; }
	get isControlled() { return this.isActiveMyte; }
	get isInSlot() { return !this.isDeployed; }

	initParticleEffects() {
		const particleSystem = this.parent.gameMap.particleSystem;
		
		// Add particle control methods to this Myte
		particleSystem.addParticleMethodsToObject(this);

		this.addEventEffect('myte:landed', 'LANDING_DUST', {
			storeReference: false,
			attachmentPoint: 'feet',
			positionAtFeet: true,
			eventFilter: ({ myte }) => myte === this
		});
		

		// Dust for regular movement
		// this.addEffect("SMOKE_SPRITE");
		
	}

	pause() {
		this.isPaused = true;
	}

	resume() {
		this.isPaused = false;
	}


	init() {
		this.physicsController = new MytePhysics(this);
		this.movementController = new MyteMovementController(this);
		this.renderer = new MyteRenderer(this);
		this.renderer.initInteractiveMyte();
		this.renderer.createTargetDot();
		this.dropTarget = this.element.closest('.myte-slot');

		this.queue = new MyteQueue(this);
		this.stateMachine = new StateMachine(this, DEFAULT_STATE);
		this.inputHandler = new MyteInputHandler(this);
		this.dialogue = new MyteDialogue(this);
		this.stats = new MyteStats(this);
		this.ai = new MyteAI(this);

		const rect = this.parent.getOffset(this.element);
		const offsetX = rect.x - this.parent.getContainerRect().x;
		const offsetY = rect.y - this.parent.getContainerRect().y;
		this.setTarget(offsetX, offsetY);
		this.setPosition(offsetX, offsetY);
		this.setSpritePosition(this.posX, this.posY);
		this.ensureFiniteCoordinates('init');

		// Initialize particle effects if the game map has a particle system
		if (this.parent?.gameMap?.particleSystem) {
			this.initParticleEffects();
		} else {
			console.error(`Myte ${this.id}: Cannot initialize particle effects - ParticleSystem not found.`);
		}

		this.setStartTime();
	}


	setWrapperPosition(x, y){
		this.elements.wrapper.style.left = x + 'px';
		this.elements.wrapper.style.top = y + 'px';

		this.snapToHomePosition();
	}

	setStartTime() {
		this.startTime = Date.now();
	}

	canDrag() {
		return Date.now() - this.startTime > 1000;
	}

	stop() {
		this.isActive = false;
		this.atOriginal = true;
		this.queue.clear();
		this.clearHomeSlotHold();
		this.cancelInactivityFreeRoam();
		this.resetGoHomeState();

		if (this.goal === MOVE_TYPES.GOHOME) {
			this.goal = this.previousGoal === MOVE_TYPES.GOHOME ? DEFAULT_MODE : this.previousGoal;
		}

		// Keep the duplicate aligned to the exact center of the home slot.
		const home = this.getHomePosition();
		this.posX = home.x;
		this.posY = home.y;
		this.setTarget(home.x, home.y);
		this.setSpritePosition(home.x, home.y);

		// hide it
		this.element.classList.remove("is-deactivated");
		this.duplicate.classList.remove("is-active");
		this.duplicate.classList.add('is-deactivated');
		this.elements.wrapper.classList.remove('empty');

		this.targetDot.classList.add('is-hidden');

		// set next as active
		this.playSlotEnterSound();
		this.parent.setNextMyteAsActive(this);
		if (this.parent.activeMyte == null) {
			this.parent.ui.debugPanel.disableButtons();
			this.parent.camera.setMode(DEFAULT_CAMERA_FOLLOW_MODE);
			this.parent.camera.resetView();
		}

		this.parent.eventManager?.emit('myte:stopped', { myte: this });
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

		this.element.classList.add("is-deactivated"); // hide the original element
		this.elements.wrapper.classList.add('empty');
		this.duplicate.classList.remove("is-deactivated"); // show the duplicate element

		// modes
		this.setAutonomyMode(autonomyGoal);
		this.setFollowMode(followGoal);
		this.setMode(goal);

		// set start time - we need this to disable dragging for a few seconds at start
		this.setStartTime();


		// Start centered in the home slot rather than at the slot's top-left corner.
		this.cancelInactivityFreeRoam();
		this.resetGoHomeState();
		this.snapToHomePosition();
		this.playSlotExitSound();

		this.syncSelectionState();
		if (this.isActiveMyte) {
			this.parent.ui?.debugPanel?.enableButtons?.();
		}

		this.parent.eventManager?.emit('myte:started', { myte: this });
	}

	updateTargetDot() {
		this.targetDot.style.left = (this.targetX + this.size.width / 2) + 'px';
		this.targetDot.style.top = (this.targetY + this.size.height / 2) + 'px';
		this.logVisualDebug('update_target_dot');

	}

	setFollowMode(newGoal = null) { this.movementController.setFollowMode(newGoal); }
	setAutonomyMode(newGoal = null) { this.movementController.setAutonomyMode(newGoal); }

	isIndependent(){
		return !this.isDragging;
	}

	setMode(newGoal = null) { this.movementController.setMode(newGoal); }
	handleModeTransition(previousGoal, nextGoal) { this.movementController.handleModeTransition(previousGoal, nextGoal); }

	unsetTarget() {
		this.targetX = this.posX;
		this.targetY = this.posY;
	}

	getHomeSlotRect() {
		const slotElement = this.getHomeSlotElement();
		const rect = this.parent.getLocalOffset(slotElement);
		return {
			x: rect.left,
			y: rect.top,
			left: rect.left,
			top: rect.top,
			right: rect.right,
			bottom: rect.bottom,
			width: rect.width,
			height: rect.height
		};
	}

	getHomeSlotElement() {
		return this.dropTarget?.querySelector?.('.myte-home-slot') ||
			this.dropTarget ||
			this.elements.wrapper ||
			this.element;
	}

	getHomePosition() {
		const rect = this.getHomeSlotRect();
		return {
			x: rect.left + ((rect.width - this.size.width) / 2),
			y: rect.top + ((rect.height - this.size.height) / 2)
		};
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

	holdInHomeSlotUntilPointerLeaves() { return this.movementController.holdInHomeSlotUntilPointerLeaves(); }
	clearHomeSlotHold() { this.movementController.clearHomeSlotHold(); }
	shouldHoldInHomeSlot() { return this.movementController.shouldHoldInHomeSlot(); }

	isPointerInsideHomeSlot() {
		if (!this.dropTarget || !this.parent?.inputHandler) {
			return false;
		}

		const mouse = this.parent.inputHandler.getMousePosition();
		const slotRect = this.parent.getRect(this.dropTarget);
		return Utility.isCoordTouchingElement(mouse.x, mouse.y, slotRect);
	}

	moveTowardsTargetDirect(doXAxis = true, doYAxis = true) {
		this.ensureFiniteCoordinates('moveTowardsTargetDirect:start');
		const dx = this.targetX - this.posX;
		const dy = this.targetY - this.posY;
		const distance = Math.hypot(dx, dy);

		const step = this.stats.getSpeed() * ((this._dt ?? 16.667) / 16.667);
		if (Number.isFinite(distance) && distance !== 0) {
			const moveX = (dx / distance) * step;
			const moveY = (dy / distance) * step;

			if (doXAxis) {
				this.posX += moveX;
			}

			if (doYAxis) {
				this.posY += moveY;
			}
		}

		if (distance < step) {
			this.snapPositionToTarget(doXAxis, doYAxis);
		}

		this.ensureFiniteCoordinates('moveTowardsTargetDirect:end');
		this.setDirection(this.getDirection());
		this.setSpritePosition(this.posX, this.posY);
	}


	setTargetToOrigin() {
		const home = this.getHomePosition();
		this.targetX = home.x;
		this.targetY = home.y;
	}

	resetGoHomeState() { this.movementController.resetGoHomeState(); }
	beginGoHomeJourney(forceReplan = false) { return this.movementController.beginGoHomeJourney(forceReplan); }

	enterInactivityFreeRoam() { return this.movementController.enterInactivityFreeRoam(); }
	restoreFromInactivityFreeRoam() { return this.movementController.restoreFromInactivityFreeRoam(); }
	cancelInactivityFreeRoam() { this.movementController.cancelInactivityFreeRoam(); }

	get isActiveMyte() {
		return this === this.parent.activeMyte;
	}

	syncSelectionState() {
		if (!this.duplicate || !this.targetDot) {
			return;
		}

		this.duplicate.classList.toggle('is-active', this.isActiveMyte);
		this.targetDot.classList.toggle('is-hidden', !this.isActiveMyte);
	}

	/********************************************
	 * events - hover
	********************************************/

	createTargetDot()     { /* moved to MyteRenderer.createTargetDot() */ }
	logVisualDebug(source) { this.renderer?.logVisualDebug(source); }

	getRect()       { return this.parent.getRect(this.duplicate); }
	getOffsetRect() { return this.parent.getLocalOffset(this.duplicate); }

	normalizeRegionId(regionId = 'collider') {
		switch (String(regionId || '').trim().toLowerCase()) {
			case 'interactionregion':
			case 'interaction':
				return 'interaction';
			case 'selectbox':
			case 'select':
				return 'select';
			case 'hitbox':
			case 'hit':
				return 'hit';
			case 'pickupbox':
			case 'pickup':
				return 'pickup';
			case 'collider':
			default:
				return 'collider';
		}
	}

	getRegionConfig(regionId = 'collider', direction = this.direction) {
		return MyteDefinitionRegistry.getSpatialRegion(
			this.definition,
			this.normalizeRegionId(regionId),
			direction
		);
	}

	getRegionRect(regionId = 'collider', direction = this.direction) {
		const region = this.getRegionConfig(regionId, direction);
		if (!region) {
			return null;
		}

		const x = this.posX + (region.x ?? region.offsetX ?? 0);
		const y = this.posY + (region.y ?? region.offsetY ?? 0);
		const width = region.width ?? this.size.width;
		const height = region.height ?? this.size.height;
		return {
			x,
			y,
			left: x,
			top: y,
			right: x + width,
			bottom: y + height,
			width,
			height,
			type: region.type ?? 'box'
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

	getHitRect() {
		return this.getRegionRect('hit') || this.getRegionRect('collider');
	}

	getPickupRect() {
		return this.getRegionRect('pickup') ||
			this.getSelectionRect();
	}

	getCenterPoint(regionId = 'collider') {
		const rect = this.getRegionRect(regionId) || this.getRegionRect('collider');
		if (!rect) {
			return {
				x: this.posX + (this.size.width / 2),
				y: this.posY + (this.size.height / 2)
			};
		}

		return {
			x: rect.left + (rect.width / 2),
			y: rect.top + (rect.height / 2)
		};
	}

	reset() { this.physicsController.reset(); }

	getSafeHomePosition() {
		const home = this.getHomePosition();
		return {
			x: Number.isFinite(home?.x) ? home.x : 0,
			y: Number.isFinite(home?.y) ? home.y : 0
		};
	}

	rememberFiniteCoordinates() {
		if (Number.isFinite(this.posX) && Number.isFinite(this.posY)) {
			this._lastFinitePosition = { x: this.posX, y: this.posY };
		}

		if (Number.isFinite(this.targetX) && Number.isFinite(this.targetY)) {
			this._lastFiniteTarget = { x: this.targetX, y: this.targetY };
		}
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

		if (!Number.isFinite(this.posX)) {
			this.posX = Number.isFinite(fallbackPosition.x) ? fallbackPosition.x : home.x;
			didCorrect = true;
		}

		if (!Number.isFinite(this.posY)) {
			this.posY = Number.isFinite(fallbackPosition.y) ? fallbackPosition.y : home.y;
			didCorrect = true;
		}

		if (!Number.isFinite(this.targetX)) {
			this.targetX = Number.isFinite(fallbackTarget.x) ? fallbackTarget.x : this.posX;
			didCorrect = true;
		}

		if (!Number.isFinite(this.targetY)) {
			this.targetY = Number.isFinite(fallbackTarget.y) ? fallbackTarget.y : this.posY;
			didCorrect = true;
		}

		if (didCorrect) {
			this.physicsController?.reset?.();
			this.setSpritePosition(this.posX, this.posY);
			console.warn(`[Myte:${this.name}] Recovered invalid coordinates during ${source}`, {
				posX: this.posX,
				posY: this.posY,
				targetX: this.targetX,
				targetY: this.targetY
			});
		}

		this.rememberFiniteCoordinates();
		return didCorrect;
	}

	isMoving() {
		if (this.isAtTarget()) return false;
		return this.getDistanceToPoint(this.targetX, this.targetY) > 0;
	}


	isAtTarget() {
		if (!Number.isFinite(this.posX) || !Number.isFinite(this.posY) ||
			!Number.isFinite(this.targetX) || !Number.isFinite(this.targetY)) {
			return false;
		}
		return this.getDistanceToPoint(this.targetX, this.targetY) <= 0.5;
	}

	setDirection(direction) {
		if (direction !== this.direction) {
			this.direction = direction;
		}
	}

	faceTowardsPoint(x, y, directionWeight = 2) {
		const dx = x - (this.posX + this.size.width / 2);
		const dy = y - (this.posY + this.size.height / 2);
		const distance = Math.hypot(dx, dy);

		if (!Number.isFinite(distance) || distance === 0) {
			return this.direction;
		}

		const directionX = dx / distance;
		const directionY = dy / distance;
		const weightedDirectionX = directionX * directionWeight;
		const weightedDirectionY = directionY;
		const direction = Math.abs(weightedDirectionX) > Math.abs(weightedDirectionY)
			? (weightedDirectionX > 0 ? DIRECTION.EAST : DIRECTION.WEST)
			: (weightedDirectionY > 0 ? DIRECTION.SOUTH : DIRECTION.NORTH);

		this.setDirection(direction);
		return direction;
	}

	getDirection(directionWeight = 2) {
		let dx = this.targetX - this.posX;
		let dy = this.targetY - this.posY;
		let distance = Math.hypot(dx, dy);

		if (!Number.isFinite(distance) || distance === 0) {
			return this.direction;
		}

		const directionX = dx / distance;
		const directionY = dy / distance;

		// Adjust the weights for the X and Y directions
		const weightedDirectionX = directionX * directionWeight;
		const weightedDirectionY = directionY;

		if (Math.abs(weightedDirectionX) > Math.abs(weightedDirectionY)) {
			return weightedDirectionX > 0 ? DIRECTION.EAST : DIRECTION.WEST;
		} else {
			return weightedDirectionY > 0 ? DIRECTION.SOUTH : DIRECTION.NORTH;
		}
	}



	snapPositionToTarget(doXAxis = true, doYAxis = true) {
		if (doXAxis) this.posX = this.targetX;
		if (doYAxis) this.posY = this.targetY;
		this.ensureFiniteCoordinates('snapPositionToTarget');
	}
	get distanceFromTarget() {
		return this.getDistanceToPoint(this.targetX, this.targetY).toFixed(2);
	}

	get distanceFromMouse() {
		return this.getDistanceFromMouse().toFixed(2);
	}

	// canAutoOpenCollider and tryOpenCollider are provided by EntityMixin (Entity.js).

	moveTowardsTarget(doXAxis = true, doYAxis = true) {
		this.ensureFiniteCoordinates('moveTowardsTarget:start');
		const dx = this.targetX - this.posX;
		const dy = this.targetY - this.posY;
		const distance = Math.hypot(dx, dy);
		const step = this.stats.getSpeed() * ((this._dt ?? 16.667) / 16.667);

		// Store original position
		const originalX = this.posX;
		const originalY = this.posY;

		if (Number.isFinite(distance) && distance !== 0) {
			const moveX = (dx / distance) * step;
			const moveY = (dy / distance) * step;
			const gridSystem = this.parent?.gameMap?.gridSystem;
			
			let xBlocked = false;
			let yBlocked = false;
	
			const CORNER_SLIP = 1.0; // px — small enough to not squeeze through real gaps

			// Try to move on X axis
			if (doXAxis) {
				const newX = this.posX + moveX;

				if (this.canMoveToPosition(newX, this.posY)) {
					this.posX = newX;

					if (this.checkForCollisions && gridSystem) {
						const potentialColliders = gridSystem.getPotentialColliders(this);
						for (const collider of potentialColliders) {
							if (this.parent.checkCollision(this, collider)) {
								if (this.tryOpenCollider(collider, 'x')) {
									this.posX = originalX;
									xBlocked = true;
									break;
								}
								this.posX = originalX;
								xBlocked = true;
								break;
							}
						}
					}
				} else {
					// Corner slip: a tiny perpendicular nudge may let us clear a corner edge
					const slipDir = moveY !== 0 ? Math.sign(moveY) : 1;
					if (this.canMoveToPosition(newX, this.posY + slipDir * CORNER_SLIP)) {
						this.posX = newX;
						this.posY += slipDir * CORNER_SLIP;
					} else if (this.canMoveToPosition(newX, this.posY - slipDir * CORNER_SLIP)) {
						this.posX = newX;
						this.posY -= slipDir * CORNER_SLIP;
					} else {
						xBlocked = true;
						// Grid cell is blocked — temporarily step into it to find door colliders there.
						if (this.checkForCollisions && gridSystem) {
							this.posX = newX;
							const potentialColliders = gridSystem.getPotentialColliders(this);
							this.posX = originalX;
							// In cursor-follow mode the min-radius check may leave targetX stale.
							// Temporarily set _movementDestination to the live cursor so the door
							// can detect it is between the myte and the cursor.
							const savedDest = this._movementDestination;
							if (this.followMouse && !this._movementDestination) {
								const cursor = this.parent?.inputHandler?.getMouseWorldPosition?.();
								if (cursor && Number.isFinite(cursor.x)) {
									this._movementDestination = { x: cursor.x, y: cursor.y };
								}
							}
							for (const collider of potentialColliders) {
								this.tryOpenCollider(collider, 'x');
							}
							this._movementDestination = savedDest;
						}
					}
				}
			}

			// Try to move on Y axis
			if (doYAxis) {
				const newY = this.posY + moveY;

				if (this.canMoveToPosition(this.posX, newY)) {
					this.posY = newY;

					if (this.checkForCollisions && gridSystem) {
						const potentialColliders = gridSystem.getPotentialColliders(this);
						for (const collider of potentialColliders) {
							if (this.parent.checkCollision(this, collider)) {
								if (this.tryOpenCollider(collider, 'y')) {
									this.posY = originalY;
									yBlocked = true;
									break;
								}
								this.posY = originalY;
								yBlocked = true;
								break;
							}
						}
					}
				} else {
					// Corner slip: a tiny perpendicular nudge may let us clear a corner edge
					const slipDir = moveX !== 0 ? Math.sign(moveX) : 1;
					if (this.canMoveToPosition(this.posX + slipDir * CORNER_SLIP, newY)) {
						this.posY = newY;
						this.posX += slipDir * CORNER_SLIP;
					} else if (this.canMoveToPosition(this.posX - slipDir * CORNER_SLIP, newY)) {
						this.posY = newY;
						this.posX -= slipDir * CORNER_SLIP;
					} else {
						yBlocked = true;
						// Grid cell is blocked — temporarily step into it to find door colliders there.
						if (this.checkForCollisions && gridSystem) {
							this.posY = newY;
							const potentialColliders = gridSystem.getPotentialColliders(this);
							this.posY = originalY;
							const savedDest = this._movementDestination;
							if (this.followMouse && !this._movementDestination) {
								const cursor = this.parent?.inputHandler?.getMouseWorldPosition?.();
								if (cursor && Number.isFinite(cursor.x)) {
									this._movementDestination = { x: cursor.x, y: cursor.y };
								}
							}
							for (const collider of potentialColliders) {
								this.tryOpenCollider(collider, 'y');
							}
							this._movementDestination = savedDest;
						}
					}
				}
			}
			
			// If both directions are blocked, try to slide along the wall
			if (xBlocked && yBlocked && Math.abs(moveX) > 0.1 && Math.abs(moveY) > 0.1) {
				// Try sliding horizontally if vertical movement is blocked
				if (Math.abs(moveX) > Math.abs(moveY) * 0.5) {
					const slideX = this.posX + moveX * 1.2; // Slightly increase slide speed for better feel
					if (this.canMoveToPosition(slideX, originalY)) {
						this.posX = slideX;
					}
				} 
				// Try sliding vertically if horizontal movement is blocked
				else if (Math.abs(moveY) > Math.abs(moveX) * 0.5) {
					const slideY = this.posY + moveY * 1.2; // Slightly increase slide speed for better feel
					if (this.canMoveToPosition(originalX, slideY)) {
						this.posY = slideY;
					}
				}
			}
		}
	
		if (distance < step) {
			this.snapPositionToTarget(doXAxis, doYAxis);
		}

		this.ensureFiniteCoordinates('moveTowardsTarget:end');
		this.setDirection(this.getDirection());
		this.setSpritePosition(this.posX, this.posY);
	}
	
	// Add this helper method to check if a position is valid
	canMoveToPosition(newX, newY) {
		if (!this.parent?.gameMap?.gridSystem) {
			return true;
		}

		const gridSystem = this.parent.gameMap.gridSystem;
		return gridSystem.isEntityPositionValid?.(this, newX, newY) ?? true;
	}

	getOverlappingColliders() {
		if (!this.checkForCollisions) {
			return [];
		}

		const gridSystem = this.parent?.gameMap?.gridSystem;
		if (!gridSystem || !this.parent?.checkCollision) {
			return [];
		}

		return gridSystem.getPotentialColliders(this).filter(collider =>
			collider &&
			collider !== this &&
			!collider.isPickedUp &&
			this.parent.checkCollision(this, collider)
		);
	}

	tryResolveColliderOverlap(force = false) {
		if (this.isDragging || !this.checkForCollisions) {
			this.colliderRecoveryState.overlapFrames = 0;
			return false;
		}

		const overlaps = this.getOverlappingColliders();
		if (overlaps.length === 0) {
			this.colliderRecoveryState.overlapFrames = 0;
			return false;
		}

		this.colliderRecoveryState.overlapFrames++;
		const now = Date.now();
		if (this.colliderRecoveryState.overlapFrames < (force ? 1 : 24)) {
			return false;
		}

		if (!force && now - this.colliderRecoveryState.lastRecoverAt < 700) {
			return false;
		}

		const gridSystem = this.parent?.gameMap?.gridSystem;
		const safePosition = gridSystem?.findNearestValidPositionForEntity?.(this, this.posX, this.posY, 22)
			?? gridSystem?.findNearestValidPositionForEntity?.(this, this.targetX, this.targetY, 22)
			?? gridSystem?.findNearestValidPositionForEntity?.(this, this.getHomePosition().x, this.getHomePosition().y, 18)
			?? null;

		if (!safePosition) {
			return false;
		}

		this.setPosition(safePosition.x, safePosition.y);
		this.setTarget(safePosition.x, safePosition.y);
		this.setSpritePosition(safePosition.x, safePosition.y);
		this.physicsController?.reset?.();
		this.colliderRecoveryState.overlapFrames = 0;
		this.colliderRecoveryState.lastRecoverAt = now;
		return true;
	}

	setSpritePosition(x, y, limit) { this.renderer?.setSpritePosition(x, y, limit); }
	getZIndex(y)              { return this.renderer?.getZIndex(y) ?? 0; }
	setZIndex(y)              { this.renderer?.setZIndex(y); }
	updateTargetDot()         { this.renderer?.updateTargetDot(); }
	setTarget(x = null, y = null, limit = false) {

		let setX = (x == null ? false : true);
		let setY = (y == null ? false : true);

		if (x == null) {
			x = this.targetX;
		}

		if (y == null) {
			y = this.targetY;
		}

		let rect = this.getRect();

		if (limit) {
			const clamped = this.parent.clampEntityPosition(this, x, y, { rect });
			x = clamped.x;
			y = clamped.y;
		}

		if (setX && Number.isFinite(x)) this.targetX = x;
		if (setY && Number.isFinite(y)) this.targetY = y;
		this.rememberFiniteCoordinates();
	}

	setPosition(x = null, y = null, limit = false) {

		let rect = this.getRect();

		let setX = (x == null ? false : true);
		let setY = (y == null ? false : true);

		if (x == null) {
			x = this.posX;
		}

		if (y == null) {
			y = this.posY;
		}


		if (limit) {
			const clamped = this.parent.clampEntityPosition(this, x, y, { rect });
			x = clamped.x;
			y = clamped.y;
		}

		if (setX && Number.isFinite(x)) this.posX = x;
		if (setY && Number.isFinite(y)) this.posY = y;
		this.rememberFiniteCoordinates();
	}

	getCarriedItemPosition(itemSize = {}) {
		const carryAnchor = MyteDefinitionRegistry.getSpatialAnchor(this.definition, 'carry.item', this.direction) || {};
		const itemWidth = itemSize.width ?? 0;
		const itemHeight = itemSize.height ?? 0;
		const anchorX = carryAnchor.x ?? Math.round(this.size.width * 0.5);
		const anchorY = carryAnchor.y ?? Math.round(this.size.height * 0.12);
		const itemAnchorX = carryAnchor.itemAnchorX ?? 0.5;
		const itemAnchorY = carryAnchor.itemAnchorY ?? 1;

		return {
			x: this.posX + anchorX - (itemWidth * itemAnchorX),
			y: this.posY + anchorY - (itemHeight * itemAnchorY)
		};
	}

	isDoingAction(action) {
		return this.queue.count() >= 1 && this.queue.getCurrentAction().action === action;
	}


	moveDrag() {

		var rect = this.getRect();

		let mouse = this.parent.inputHandler.getMouseWorldPosition();
		var newMousePosX = mouse.x;
		var newMousePosY = mouse.y;

		// offset where you're holding the myte from
		var x = newMousePosX - (rect.width / 2);
		var y = newMousePosY - (rect.height / 4);

		// set positions
		this.setTarget(x, y, this.limitToContainer);
		this.setPosition(x, y, this.limitToContainer);
		this.setSpritePosition(x, y, this.limitToContainer);

		// Add the "dragging" class to the draggable element when dragging
		this.duplicate.classList.add("is-dragging");

		// Check if the draggable element is touching the drop target
		const dropTargetRect = this.parent.getRect(this.dropTarget);
		if (Utility.isCoordTouchingElement(this.parent.mousePosX, this.parent.mousePosY, dropTargetRect)) {
			this.dropTarget.classList.add("is-drag-over");
		} else {
			this.dropTarget.classList.remove("is-drag-over");
		}

		this.dropTarget.classList.add("is-droppable");

	}






	getRandomNearbyObject(range, returnClosest = false) {
		const nearbyObjects = this.parent.mapArea.objects.filter(obj => {
			const distanceX = Math.abs(this.posX - obj.posX);
			const distanceY = Math.abs(this.posY - obj.posY);
			return obj !== this && obj.active && distanceX <= range && distanceY <= range;
		});

		if (nearbyObjects.length > 0) {
			if (returnClosest) {
				let closestObject = nearbyObjects[0];
				let closestDistance = Math.hypot(this.posX - closestObject.posX, this.posY - closestObject.posY);

				nearbyObjects.forEach(obj => {
					const distance = Math.hypot(this.posX - obj.posX, this.posY - obj.posY);
					if (distance < closestDistance) {
						closestDistance = distance;
						closestObject = obj;
					}
				});

				return closestObject;
			} else {
				const randomIndex = Math.floor(Math.random() * nearbyObjects.length);
				return nearbyObjects[randomIndex];
			}
		}

		return null; // If no nearby object is found
	}





	/********************************************
	 * movement - gravity (delegated to MytePhysics)
	********************************************/

	adjustPhysicsForCharacter() { this.physicsController.adjustPhysicsForCharacter(); }
	getFeetPosition()            { return this.physicsController.getFeetPosition(); }
	isStandingOnCollider(c)      { return this.physicsController.isStandingOnCollider(c); }
	applyGravity()               { return this.physicsController.applyGravity(); }
	moveGravity()                { this.physicsController.moveGravity(); }
	isCurrentlyJumping()         { return this.physicsController.isCurrentlyJumping(); }

	playSound(sound) {
		this.parent.core.soundManager.playMyteSound(sound, {
			species: this.species
		});
	}

	playSlotEnterSound() {
		this.playSound('slot_enter');
	}

	playSlotExitSound() {
		this.playSound('slot_exit');
	}

	doJump()        { return this.physicsController.doJump(); }
	doLandFromFall() { this.physicsController.doLandFromFall(); }

	doMovementLogic(deltaTime) { this.movementController.doMovementLogic(deltaTime); }
	watchCursor() { this.movementController.watchCursor(); }

	getDistanceFromMouse() {
		const mouse = this.parent.inputHandler.getMouseWorldPosition({ element: this });
		return this.getDistanceToPoint(mouse.x, mouse.y);
	}

	getDistanceTo(target) {
		if (!target) return Infinity;
		return Math.hypot((target.posX ?? 0) - this.posX, (target.posY ?? 0) - this.posY);
	}

	getDistanceToPoint(x, y) {
		return Math.hypot(x - this.posX, y - this.posY);
	}

	getMoveType(i) {
		return Utility.getKeyByValue(MOVE_TYPES, i);
	}

	getMoveFollowType(i) {
		return Utility.getKeyByValue(MOVE_FOLLOW_TYPES, i);
	}

	getMoveAutonomyType(i) {
		return Utility.getKeyByValue(MOVE_AUTONOMY_TYPES, i);
	}


	updateTargetToFollowMouse(doXAxis = true, doYAxis = true) { this.movementController.updateTargetToFollowMouse(doXAxis, doYAxis); }
	doCircleFollow(mouse, mouseDistance, doXAxis = true, doYAxis = true) { this.movementController.doCircleFollow(mouse, mouseDistance, doXAxis, doYAxis); }
	doLeashFollow(mouse, mouseDistance, doXAxis = true, doYAxis = true) { this.movementController.doLeashFollow(mouse, mouseDistance, doXAxis, doYAxis); }
	doRunAway(doXAxis = true, doYAxis = true) { this.movementController.doRunAway(doXAxis, doYAxis); }


	dispose() {
		this.queue?.clear?.();
		this.inputHandler?.dispose?.();
		this.dialogue?.destroy?.();
		this.stats?.destroy?.();
		this.targetDot?.remove?.();
		this.duplicate?.remove?.();
	}

	update(deltaTime) {
		if (!this.isActive) return;
		this._dt = deltaTime; // stored so movement helpers can read it without threading it through every call site
		this.ensureFiniteCoordinates('update:start');

		this.updateTargetDot();
		this.doMovementLogic(deltaTime);
		this.tryResolveColliderOverlap();
		this.ensureFiniteCoordinates('update:end');

		this.stats.update(deltaTime);

		// StateMachine self-paces its own frame timing per-animation.
		this.stateMachine.update(deltaTime);

		// Grid front-tile update: only needs ~8fps, keep a lightweight throttle here.
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
		this.stats?.updateInHomeSlot?.(deltaTime);
	}

	tickUpdate(tickDelta) {
		if (!this.isActive) return;
		this.ai?.tickUpdate(tickDelta);
	}



}

// Shared pathfinding and capability methods (initPathfinder, tryOpenCollider, etc.)
applyEntityMixin(Myte);
