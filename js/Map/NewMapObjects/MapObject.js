// BASE_CONFIG and TYPE_CONFIGS are defined in MapObjectConfigs.js, loaded before this file.

class MapObject {
	static nextObjectId = 1;

	constructor(parent, type, variant, posX, posY, config = {}) {
		this.id = config.id ?? `${type.toLowerCase()}_${MapObject.nextObjectId++}`;
		this.type = type;
		this.variant = variant;
		this.posX = posX;
		this.posY = posY;
		this.posZ = 0;

		// Config already merged by MapObjectFactory
		this.config = config;

		this.active = true;
		this.element = null;
		this.parent = parent;
		this.map = parent || null;
		this.container = parent?.parent || null;
		this.core = this.container?.core || null;

		this.size = {
			width: this.getConfig('size.width', 64) * this.getConfig('scale', 1),
			height: this.getConfig('size.height', 64) * this.getConfig('scale', 1)
		};

		this.collider = this.initializeCollider();

		this.interactionState = {
			lastInteractionTime: 0,
			cooldown: this.getConfig('interactionCooldown', 5000),
			activeInteractions: new Set(),
			interactionTimes: new Map()
		};

		this.inputComponents = {};
		this.isDragging = false;
		this.shadowElement = null;
		this.isPickedUp = false;
		this.carrier = null;
		this.pendingPickup = false;
		this._tempSelectDragActive = false;

		// Render state — simulation writes here, MapRenderer reads and flushes to DOM
		this.renderState = {
			posX: posX,
			posY: posY,
			zIndex: 0,
			bgPosition: null,
			visible: true,
			dirty: true
		};
		this._prevRenderX = -1;
		this._prevRenderY = -1;

		// Sleep/wake: objects outside the culling zone skip visual update.
		// GridSystem.updateCulling() calls wake()/sleep() on transitions.
		// tickUpdate() still runs for objects where shouldSimulateOffScreen() returns true.
		this.sleeping = false;
		this._animationPausedBeforeSleep = false;
	}

	// ── Getters ──────────────────────────────────────────────────────────────

	get gameMap() { return this.map; }

	get activeMyte() {
		return this.container?.activeMyte || this.map?.activeMyte || null;
	}

	get mytes() {
		return this.map?.mytes || this.container?.mytes || [];
	}

	getShadowConfig() {
		const shadow = this.getConfig('shadow', null);
		return shadow?.enabled ? shadow : null;
	}

	shouldRenderShadow() {
		return !!this.getShadowConfig();
	}

	getDisplayName() {
		const explicitName = this.getConfig('displayName', null);
		if (typeof explicitName === 'string' && explicitName.trim()) {
			return explicitName.trim();
		}

		const raw = String(this.variant || this.type || 'Object');
		return raw
			.toLowerCase()
			.split(/[_\s-]+/)
			.filter(Boolean)
			.map(part => part.charAt(0).toUpperCase() + part.slice(1))
			.join(' ');
	}

	// ── Simulation contract ───────────────────────────────────────────────────

	// Override to return true for autonomous objects (AI, physics) that must
	// keep simulating even when outside the visible viewport.
	shouldSimulateOffScreen() {
		return false;
	}

	// ── Sleep / wake ──────────────────────────────────────────────────────────

	wake() {
		if (!this.sleeping) return;
		this.sleeping = false;
		this.renderState.dirty = true;
		if (this.animation) this.animation.paused = this._animationPausedBeforeSleep;
	}

	sleep() {
		if (this.sleeping) return;
		this.sleeping = true;
		if (this.animation) {
			this._animationPausedBeforeSleep = this.animation.paused;
			this.animation.paused = true;
		}
	}

	// ── Config helpers ────────────────────────────────────────────────────────

	getConfig(path, defaultValue = null) {
		const keys = path.split('.');
		let current = this.config;
		for (const key of keys) {
			if (current === undefined || current === null || !Object.prototype.hasOwnProperty.call(current, key)) {
				return defaultValue;
			}
			current = current[key];
		}
		return current !== undefined ? current : defaultValue;
	}

	// ── Direction helpers ─────────────────────────────────────────────────────

	static processDirectionConfig(baseConfig, direction) {
		const config = JSON.parse(JSON.stringify(baseConfig));
		if (!config.directionConfigs) return config;

		const normalizedDirection = MapObject.normalizeFacingDirection(direction, config.directionConfigs);
		const dirConfig = config.directionConfigs[normalizedDirection];
		if (!dirConfig) return config;

		if (dirConfig.size) config.size = dirConfig.size;
		if (dirConfig.collider) config.collider = dirConfig.collider;
		if (dirConfig.interactiveCollider) config.interactiveCollider = dirConfig.interactiveCollider;

		config.facingDirection = normalizedDirection;
		config.transformStyle = dirConfig.transformStyle || '';

		for (const key in dirConfig) {
			if (!['size', 'collider', 'interactiveCollider', 'transformStyle'].includes(key)) {
				config[key] = dirConfig[key];
			}
		}
		return config;
	}

	static normalizeFacingDirection(direction, directionConfigs = {}) {
		if (['N', 'S', 'E', 'W'].includes(direction)) return direction;

		if (directionConfigs[direction] && typeof directionConfigs[direction] === 'string') {
			return directionConfigs[direction];
		}

		const dirMap = {
			up: 'N', north: 'N', u: 'N', n: 'N',
			right: 'E', east: 'E', r: 'E', e: 'E',
			down: 'S', south: 'S', d: 'S', s: 'S',
			left: 'W', west: 'W', l: 'W', w: 'W',
			horizontal: 'S',
			vertical: 'E'
		};
		return dirMap[direction.toLowerCase()] || 'S';
	}

	normalizeFacingDirection(direction) {
		return MapObject.normalizeFacingDirection(direction, this.getConfig('directionConfigs', {}));
	}

	// ── Collision ─────────────────────────────────────────────────────────────

	initializeCollider() {
		if (this.config.collider) return this.config.collider;
		return {
			type: 'box',
			width: this.size.width * 0.8,
			height: this.size.height * 0.8,
			offsetX: this.size.width * 0.1,
			offsetY: this.size.height * 0.1
		};
	}

	intersects(other) {
		return this.posX < other.posX + other.size.width &&
			this.posX + this.size.width > other.posX &&
			this.posY < other.posY + other.size.height &&
			this.posY + this.size.height > other.posY;
	}

	containsPoint(x, y) {
		return x >= this.posX && x <= this.posX + this.size.width &&
			y >= this.posY && y <= this.posY + this.size.height;
	}

	// ── Interaction ───────────────────────────────────────────────────────────

	getInteractionRadius(defaultValue = 100) {
		return this.getConfig('interactionRadius', defaultValue);
	}

	// Mark this plant/flower as deflowered (no flower to pick until regrowth).
	// Sets a runtime config flag and a CSS class; schedules regrowth if regrowthTime is configured.
	setDeflowered(regrowthTime = null) {
		if (this.config) this.config.deflowered = true;
		this.element?.classList.add('deflowered');

		const ms = regrowthTime ?? this.getConfig('regrowthTime', 0);
		if (ms > 0) {
			setTimeout(() => this.clearDeflowered(), ms);
		}
	}

	clearDeflowered() {
		if (this.config) this.config.deflowered = false;
		this.element?.classList.remove('deflowered');
	}

	getAiAffordances(context = {}, actor = null) {
		const configuredAffordances = this.getConfig('ai.affordances', []);
		const affordances = configuredAffordances.map(entry =>
			typeof entry === 'string'
				? { actionId: entry }
				: { ...entry }
		);
		const interactionType = this.getConfig('interactionType');

		if (this.isReadyToHarvest?.()) {
			affordances.push({ actionId: 'harvest', purpose: 'harvest' });
		} else if (this.canWater?.() && (context.energy ?? 1) > 0.4) {
			affordances.push({ actionId: 'water_plant', purpose: 'tend' });
		}

		if ((this.type?.toUpperCase?.() === 'FOOD' || this.getConfig('consumable', false)) && !actor?.queue?.isCarrying?.()) {
			affordances.push({ actionId: 'eat_element', purpose: 'consume' });
		}

		if (interactionType === 'light' && typeof this.isEnabled === 'function' && !this.isEnabled()) {
			affordances.push({ actionId: 'interact_object', purpose: 'light_on' });
		} else if (interactionType === 'dance' && this.isMusicSource?.() && !this.isActiveMusicSource?.()) {
			affordances.push({ actionId: 'interact_object', purpose: 'start_music' });
		} else if (interactionType === 'toggle') {
			affordances.push({ actionId: 'interact_object', purpose: 'toggle' });
		}

		if (this.canBeInspectedByAi()) {
			affordances.push({ actionId: 'inspect', purpose: 'inspect' });
		}

		if (
			this.canBeInspectedByAi() &&
			(context.curiosity ?? 0) > 0.78 &&
			(context.boredom ?? 0) > 0.42 &&
			(context.getNoveltyScore?.(this) ?? 0.4) > 0.55
		) {
			affordances.push({ actionId: 'deep_inspect', purpose: 'inspect' });
		}

		return affordances.filter((affordance, index, list) => {
			const key = `${affordance.actionId}:${affordance.purpose ?? ''}`;
			return list.findIndex(item => `${item.actionId}:${item.purpose ?? ''}` === key) === index;
		});
	}

	canBeInspectedByAi() {
		return this.getConfig('canInspect', true) !== false &&
			this.getConfig('interactionType') !== 'teleport' &&
			this.type?.toUpperCase?.() !== 'PORTAL';
	}

	isMusicSource() {
		return this.getConfig('ai.musicSource', false) === true;
	}

	isActiveMusicSource() {
		return false;
	}

	getDistanceTo(target) {
		if (!target) return Infinity;
		return Math.hypot(this.posX - target.posX, this.posY - target.posY);
	}

	getCenterPoint() {
		return {
			x: this.posX + (this.collider?.offsetX ?? 0) + ((this.collider?.width ?? this.size.width) / 2),
			y: this.posY + (this.collider?.offsetY ?? 0) + ((this.collider?.height ?? this.size.height) / 2)
		};
	}

	getColliderRectFor(entity = this) {
		if (!entity) return null;

		const width = entity.collider?.width ?? entity.size?.width ?? 0;
		const height = entity.collider?.height ?? entity.size?.height ?? 0;
		return {
			left: (entity.posX ?? 0) + (entity.collider?.offsetX ?? 0),
			top: (entity.posY ?? 0) + (entity.collider?.offsetY ?? 0),
			right: (entity.posX ?? 0) + (entity.collider?.offsetX ?? 0) + width,
			bottom: (entity.posY ?? 0) + (entity.collider?.offsetY ?? 0) + height,
			width,
			height
		};
	}

	getColliderGapTo(entity) {
		const a = this.getColliderRectFor(this);
		const b = this.getColliderRectFor(entity);
		if (!a || !b) return Infinity;

		const gapX = Math.max(0, a.left - b.right, b.left - a.right);
		const gapY = Math.max(0, a.top - b.bottom, b.top - a.bottom);
		return Math.hypot(gapX, gapY);
	}

	getPickupRange(myte) {
		const explicitRange = this.getConfig('pickupRange', null);
		if (Number.isFinite(explicitRange)) {
			return explicitRange;
		}

		const myteReach = Math.max(myte?.collider?.width ?? 0, myte?.collider?.height ?? 0) * 0.5;
		const objectReach = Math.max(this.collider?.width ?? 0, this.collider?.height ?? 0) * 0.5;
		return Math.max(24, myteReach + objectReach + 8);
	}

	canBePickedUpBy(myte) {
		return !!myte?.isActive &&
			this.active &&
			this.getConfig('canPickUp', false) &&
			(!this.isPickedUp || this.carrier === myte);
	}

	isInPickupRange(myte) {
		if (!myte) return false;

		const touchThreshold = this.getConfig('pickupTouchThreshold', 12);
		if (this.getColliderGapTo(myte) <= touchThreshold) {
			return true;
		}

		const myteCenter = {
			x: myte.posX + (myte.collider?.offsetX ?? 0) + ((myte.collider?.width ?? myte.size.width) / 2),
			y: myte.posY + (myte.collider?.offsetY ?? 0) + ((myte.collider?.height ?? myte.size.height) / 2)
		};
		const objectCenter = this.getCenterPoint();
		return Math.hypot(objectCenter.x - myteCenter.x, objectCenter.y - myteCenter.y) <= this.getPickupRange(myte);
	}

	getCarriedPosition(carrier) {
		return carrier?.getCarriedItemPosition?.(this.size) || {
			x: this.posX,
			y: this.posY
		};
	}

	updateCarriedState() {
		if (!this.isPickedUp || !this.carrier) {
			return false;
		}

		const previousX = this.posX;
		const previousY = this.posY;
		const carriedPosition = this.getCarriedPosition(this.carrier);
		if (!carriedPosition) {
			return false;
		}

		this.posX = carriedPosition.x;
		this.posY = carriedPosition.y;
		this.posZ = 0;

		if (Math.abs(previousX - this.posX) >= 1 || Math.abs(previousY - this.posY) >= 1) {
			this.gameMap?.gridSystem?.updateObjectPosition(this, previousX, previousY);
			if (this.sleeping) {
				this.wake();
			}
		}
		return true;
	}

	getRenderZIndex() {
		if (this.isPickedUp && this.carrier?.renderer?.getZIndex) {
			return this.carrier.renderer.getZIndex(this.carrier.posY) + 2;
		}

		return this.parent?.getZIndex ? this.parent.getZIndex(this.posY, this.size.height) : 0;
	}

	getRenderLayerKey() {
		return this.getConfig('renderLayer', 'objects');
	}

	getActiveRenderLayerKey() {
		if (this.isDragging || this.isPickedUp) {
			return 'objects';
		}

		return this.getRenderLayerKey();
	}

	syncRenderLayer() {
		if (!this.element || !this.gameMap?.getObjectRenderLayer) {
			return;
		}

		const targetLayer = this.gameMap.getObjectRenderLayer(this);
		if (targetLayer && this.element.parentNode !== targetLayer) {
			targetLayer.appendChild(this.element);
		}
	}

	pickup(myte) {
		if (!this.canBePickedUpBy(myte)) {
			return false;
		}

		this.isPickedUp = true;
		this.carrier = myte;
		this.pendingPickup = false;
		this.element?.classList.add('picked-up');
		this.syncRenderLayer();
		this.wake();
		this.container?.ui?.setSelected?.(this);
		this.playConfiguredSound?.('pickup');
		return true;
	}

	drop(vx = 0, vy = 0) {
		this.isPickedUp = false;
		this.carrier = null;
		this.pendingPickup = false;
		this.element?.classList.remove('picked-up');
		this.syncRenderLayer();
		this.gameMap?.gridSystem?.updateObjectPosition(this);
		this.playConfiguredSound?.('drop');
		return { vx, vy };
	}

	isInInteractionRange(target, radius = this.getInteractionRadius()) {
		return this.getDistanceTo(target) <= radius;
	}

	getSelectionDebugInfo() {
		return [];
	}

	canInteract(myte) {
		if (!this.getConfig('interactionType')) return false;
		if (this.interactionState.activeInteractions.has(myte.id)) return false;
		const timeSinceLastInteraction = performance.now() - this.interactionState.lastInteractionTime;
		if (timeSinceLastInteraction < this.interactionState.cooldown) return false;
		return true;
	}

	interact(myte) {
		if (!this.canInteract(myte)) return false;

		const now = performance.now();
		this.interactionState.lastInteractionTime = now;
		this.interactionState.activeInteractions.add(myte.id);
		this.interactionState.interactionTimes.set(myte.id, now);

		const interactionType = this.getConfig('interactionType');
		switch (interactionType) {
			case 'mood_boost':
				myte.stats.updateMood(this.getConfig('moodBoostAmount', 10));
				myte.queue.addExpression('happy');
				break;
			case 'dance':
				myte.queue.addExpression('dance');
				break;
			case 'consume':
				if (this.getConfig('consumable', false)) this.remove();
				break;
			default: {
				const onInteract = this.getConfig('onInteract');
				if (typeof onInteract === 'function') onInteract(myte, this);
			}
		}
		return true;
	}

	// ── Input components ──────────────────────────────────────────────────────

	initializeInputComponents() {
		if (!this.element || !this.parent) return;

		if (this.getConfig('interactive', true)) this.initClickComponent();
		if (this.getConfig('draggable', false)) this.initDragComponent();
		if (this.getConfig('rubbable', false)) this.initRubbingComponent();

		Object.values(this.inputComponents).forEach(component => {
			if (!component.element) component.element = this.element;
			component.initialize();
		});
	}

	initClickComponent() {
		if (this.inputComponents.click) return;
		this.inputComponents.click = new ClickComponent(this, {
			element: this.element,
			enabled: true,
			canClick: () => this.active,
			onClick: () => this.handleSingleClick(),
			onDoubleClick: (event) => this.handleDoubleClick(event),
			onLongPress: (event) => {
				if (this.canStartSelectModeDrag()) {
					this.parent?.ui?.changeToolMode(UIToolModes.DRAG);
					this.startDrag();
				} else {
					this.handleLongPress(event);
				}
			}
		});
	}

	handleSingleClick() {
		if (!this.active) return;
		this.selectInUi();
	}

	initDragComponent() {
		if (this.inputComponents.drag) return;
		this.inputComponents.drag = new DragComponent(this, {
			element: this.element,
			enabled: true,
			autoActivate: false,
			canDrag: () => this.active && this.canBeDragged(),
			dragThreshold: 3,
			dragTimeThreshold: 0,
			preventDefaultsForDrag: true,
			onDragStart: () => {
				this.isDragging = true;
				this._dragOriginX = this.posX;
				this._dragOriginY = this.posY;
				this._dragOriginDirection = this.getConfig('facingDirection', null);
				this.syncRenderLayer();
				this.element.classList.add('dragging');
				this.container?.camera?.beginTemporaryFollow?.(this);
				if (this.container?.ui) this.container.ui.setSelected(this);
				this.playConfiguredSound?.('pickup');
				if (this.getConfig('directionConfigs', null)) {
					this._rotateKeyHandler = (e) => {
						if ((e.key === 'r' || e.key === 'R') && this.isDragging) {
							e.preventDefault();
							this._rotateDuringDrag();
						}
					};
					window.addEventListener('keydown', this._rotateKeyHandler);
				}
			},
			onDragMove: (event) => {
				const world = this.container?.inputHandler?.screenToWorldCoordinates
					? this.container.inputHandler.screenToWorldCoordinates(event.position.x, event.position.y, {
						element: this
					})
					: { x: this.posX, y: this.posY };
				const clampedWorld = this.container?.clampEntityPosition
					? this.container.clampEntityPosition(this, world.x, world.y)
					: world;
				this.posX = clampedWorld.x;
				this.posY = clampedWorld.y;
				this.updatePosition();
				this.container?.camera?.focusOn?.(this);
				this.showDropTarget();
			},
			onDragEnd: () => {
				this.isDragging = false;
				this.container?.camera?.endTemporaryFollow?.(this);
				this.element.classList.remove('dragging');
				this.hideDropTarget();
				if (this._rotateKeyHandler) {
					window.removeEventListener('keydown', this._rotateKeyHandler);
					this._rotateKeyHandler = null;
				}
				if (this.getConfig('snapToGrid', false)) this.snapToGrid();
				if (this.container?.clampEntityPosition) {
					const clampedWorld = this.container.clampEntityPosition(this, this.posX, this.posY);
					this.posX = clampedWorld.x;
					this.posY = clampedWorld.y;
					this.updatePosition();
				}
				const isValid = this.checkDropValidity(this.posX, this.posY);
				if (!isValid) {
					const safePosition = this.gameMap?.gridSystem?.findNearestValidPositionForEntity?.(
						this,
						this.posX,
						this.posY,
						12
					);
					if (safePosition) {
						this.posX = safePosition.x;
						this.posY = safePosition.y;
						this.updatePosition();
						this.playConfiguredSound?.('drop');
					} else {
						this.posX = this._dragOriginX;
						this.posY = this._dragOriginY;
						if (this._dragOriginDirection !== null &&
							this._dragOriginDirection !== this.getConfig('facingDirection', null)) {
							this.applyFacingDirection(this._dragOriginDirection);
						}
						this.updatePosition();
						this.playConfiguredSound?.('drop_error');
					}
				} else {
					this.playConfiguredSound?.('drop');
				}
				this.syncRenderLayer();
				this.handleMovedEvent();
			}
		});
	}

	initRubbingComponent() {
		if (this.inputComponents.rubbing) return;
		this.inputComponents.rubbing = new RubbingComponent(this, {
			element: this.element,
			enabled: true,
			canRub: () => this.active && this.parent?.ui?.isTool(UIToolModes.PET),
			minRubs: 3,
			maxRubs: 15,
			directionThreshold: 10,
			minTimeBetweenRubs: this.getConfig('rubCooldown', 5000),
			onRubStart: () => this.element.classList.add('being-rubbed'),
			onRubProgress: (event) => {
				if (this.getConfig('rubFeedback')) this.handleRubProgress(event.count);
			},
			onRubComplete: (event) => {
				this.element.classList.remove('being-rubbed');
				if (this.getConfig('onRub')) this.handleRubEvent(event.count);
			},
			onRubOverdone: (event) => {
				this.element.classList.remove('being-rubbed');
				if (this.getConfig('onRubOverdone')) this.handleRubOverdone(event.count);
			}
		});
	}

	// ── Drag helpers ──────────────────────────────────────────────────────────

	canBeDragged() {
		if (!this.getConfig('draggable', false)) return false;
		const isDragMode = this.parent?.ui?.isTool(UIToolModes.DRAG);
		if (isDragMode) {
			return true;
		}
		if (!this.canStartSelectModeDrag()) {
			return false;
		}
		const requiresPickupGesture = this.getConfig('canPickUp', false);
		const isSelectedInSelectMode =
			this.parent?.ui?.isTool(UIToolModes.SELECT) &&
			this.parent?.ui?.selectionManager?.getSelectedObject?.() === this;
		if (requiresPickupGesture) {
			return this._tempSelectDragActive;
		}
		return isSelectedInSelectMode || this._tempSelectDragActive;
	}

	canStartSelectModeDrag() {
		return this.getConfig('draggable', false) &&
			this.getConfig('dragInSelectMode', false) &&
			this.parent?.ui?.isTool(UIToolModes.SELECT);
	}

	canShowSelectPointer() {
		return this.getConfig('canInspect', true) !== false ||
			this.getConfig('canPickUp', false) ||
			this.getConfig('interactionType') != null;
	}

	startDrag() {
		this.startDragAtPosition();
	}

	startDragAtPosition(position = null) {
		if (this.isPickedUp && this.carrier?.queue) {
			this.carrier.queue.clear();
		}
		if (!this.canBeDragged() || !this.inputComponents.drag) return;
		if (position) {
			this.inputComponents.drag.startDragAtPosition(position);
			return;
		}
		this.inputComponents.drag.startDragAtCurrentPosition();
	}

	_initSelectDragHandler() {
		if (!this.element || this._selectDragCleanup || !this.getConfig('dragInSelectMode', false)) {
			return;
		}

		const dragThreshold = this.getConfig('selectDragThreshold', 8);
		const dragTimeThreshold = this.getConfig('selectDragTimeThreshold', 300);
		const maxYForPickup = this.getConfig('selectPickupMaxY', 500);
		const maxXForPickup = this.getConfig('selectPickupMaxX', 300);
		const usePickupGesture = this.getConfig('canPickUp', false);
		const dragModeRestoreDelay = this.getConfig('selectDragModeRestoreDelay', 100);
		const dragStartDelay = this.getConfig('selectDragStartDelay', 10);
		let pressStart = null;
		let previousMode = null;
		let pressStartTime = 0;
		let pendingTemporaryDrag = null;

		const onMouseDown = (event) => {
			if (event.button !== 0 || !this.active || this.isDragging || !this.canStartSelectModeDrag()) {
				return;
			}

			pressStart = {
				x: event.clientX,
				y: event.clientY,
				pageX: event.pageX,
				pageY: event.pageY
			};
			previousMode = UIToolModes.SELECT;
			pressStartTime = Date.now();
		};

		const onMouseMove = (event) => {
			if (!pressStart || this.isDragging || !this.canStartSelectModeDrag()) {
				return;
			}

			const dx = event.clientX - pressStart.x;
			const dy = event.clientY - pressStart.y;
			const distance = Math.hypot(dx, dy);
			const timeElapsed = Date.now() - pressStartTime;
			const passesPickupGesture = !usePickupGesture || (
				distance > dragThreshold &&
				timeElapsed > dragTimeThreshold &&
				event.clientY < pressStart.y &&
				pressStart.y - event.clientY > dragThreshold &&
				pressStart.y - event.clientY < maxYForPickup &&
				Math.abs(pressStart.x - event.clientX) < maxXForPickup
			);

			if (!passesPickupGesture && distance < dragThreshold) {
				return;
			}

			if (usePickupGesture && !passesPickupGesture) {
				return;
			}

			const previousStart = pressStart;
			const pointerPosition = {
				x: event.pageX,
				y: event.pageY,
				clientX: event.clientX,
				clientY: event.clientY
			};
			pressStart = null;
			this._tempSelectDragActive = true;
			pendingTemporaryDrag = {
				previousMode,
				startPosition: previousStart,
				pointerPosition
			};
			this.parent?.ui?.changeToolMode(UIToolModes.DRAG);
			window.setTimeout(() => {
				if (!pendingTemporaryDrag || this.isDragging) {
					return;
				}

				const { previousMode: queuedMode, startPosition, pointerPosition: queuedPointer } = pendingTemporaryDrag;
				pendingTemporaryDrag = null;

				this.startDragAtPosition({
					x: startPosition.pageX ?? startPosition.x,
					y: startPosition.pageY ?? startPosition.y,
					clientX: startPosition.x,
					clientY: startPosition.y
				});

				if (this.isDragging) {
					this.inputComponents.drag?.handleMove?.({
						position: queuedPointer,
						originalEvent: event
					});
					this._restoreToolModeAfterDrag(queuedMode, dragModeRestoreDelay);
				} else {
					this._tempSelectDragActive = false;
					this.parent?.ui?.changeToolMode(queuedMode);
				}
			}, dragStartDelay);
		};

		const onMouseUp = () => {
			pressStart = null;
			previousMode = null;
			pressStartTime = 0;
			pendingTemporaryDrag = null;
			if (!this.isDragging) {
				this._tempSelectDragActive = false;
			}
		};

		this.element.addEventListener('mousedown', onMouseDown);
		document.addEventListener('mousemove', onMouseMove);
		document.addEventListener('mouseup', onMouseUp);

		this._selectDragCleanup = () => {
			this.element?.removeEventListener('mousedown', onMouseDown);
			document.removeEventListener('mousemove', onMouseMove);
			document.removeEventListener('mouseup', onMouseUp);
			this._selectDragCleanup = null;
		};
	}

	_restoreToolModeAfterDrag(mode, delay = 0) {
		const dragComp = this.inputComponents.drag;
		if (!dragComp || !mode) {
			return;
		}

		const savedEnd = dragComp.options.onDragEnd;
		dragComp.options.onDragEnd = (event) => {
			if (savedEnd) {
				savedEnd(event);
			}

			this._tempSelectDragActive = false;
			window.setTimeout(() => {
				this.parent?.ui?.changeToolMode(mode);
			}, delay);
			dragComp.options.onDragEnd = savedEnd;
		};
	}

	playConfiguredSound(type) {
		const soundEffect = this.getConfig(`soundEffects.${type}`);
		if (soundEffect && this.gameMap?.soundManager) {
			this.gameMap.soundManager.play(soundEffect);
		}
	}

	applyFacingDirection(direction) {
		const directionConfigs = this.getConfig('directionConfigs', null);
		if (!directionConfigs) return;

		const normalizedDir = MapObject.normalizeFacingDirection(direction, directionConfigs);
		const dirConfig = directionConfigs[normalizedDir];
		if (!dirConfig) return;

		if (dirConfig.size) {
			this.size = { width: dirConfig.size.width, height: dirConfig.size.height };
		}
		if (dirConfig.collider) {
			this.collider = dirConfig.collider;
		}
		this.config.interactiveCollider = dirConfig.interactiveCollider || null;

		this.config.facingDirection = normalizedDir;
		this.config.transformStyle = dirConfig.transformStyle || '';
		this.config.spriteFrameOffset = dirConfig.spriteFrameOffset || null;

		for (const key in dirConfig) {
			if (!['size', 'collider', 'interactiveCollider', 'transformStyle', 'spriteFrameOffset'].includes(key)) {
				this.config[key] = dirConfig[key];
			}
		}

		if ('facingDirection' in this) {
			this.facingDirection = normalizedDir;
		}

		if (this.element) {
			this.element.style.width = `${this.size.width}px`;
			this.element.style.height = `${this.size.height}px`;
			['n', 's', 'e', 'w'].forEach(d => this.element.classList.remove(`facing-${d}`));
			this.element.classList.add(`facing-${normalizedDir.toLowerCase()}`);
			const spriteEl = this.element.querySelector('.sprite');
			if (spriteEl) {
				spriteEl.style.transform = dirConfig.transformStyle || '';

				const frameSize = this.getConfig('spriteConfig.spriteSheet.frameSize');
				if (frameSize) {
					const offsetOverride = this.getConfig('spriteFrameOffset');
					const offsetX = offsetOverride?.offsetX ?? frameSize.offsetX;
					const offsetY = offsetOverride?.offsetY ?? frameSize.offsetY;
					spriteEl.style.width = `${frameSize.width}px`;
					spriteEl.style.height = `${frameSize.height}px`;
					spriteEl.style.left = `${-offsetX}px`;
					spriteEl.style.top = `${-offsetY}px`;
				}
			}

			const interactiveEl = this.element.querySelector('.interactive-hitbox');
			if (interactiveEl) {
				const interactiveCollider = this.getConfig('interactiveCollider');
				if (interactiveCollider) {
					interactiveEl.style.width = `${interactiveCollider.width}px`;
					interactiveEl.style.height = `${interactiveCollider.height}px`;
					interactiveEl.style.left = `${interactiveCollider.offsetX}px`;
					interactiveEl.style.top = `${interactiveCollider.offsetY}px`;
				}
			}
		}

		if (this._dropTargetEl) {
			this._dropTargetEl.style.width = `${this.size.width}px`;
			this._dropTargetEl.style.height = `${this.size.height}px`;
		}

		this.updatePosition();
	}

	_rotateDuringDrag() {
		const directionConfigs = this.getConfig('directionConfigs', null);
		if (!directionConfigs) return;

		const directions = Object.keys(directionConfigs);
		const currentDir = this.getConfig('facingDirection', directions[0]);
		const currentIdx = directions.indexOf(currentDir);
		const nextDir = directions[(currentIdx + 1) % directions.length];
		this.applyFacingDirection(nextDir);
		this.showDropTarget();
	}

	showDropTarget() {
		const gridSystem = this.gameMap?.gridSystem;
		if (!gridSystem) return;

		if (!this._dropTargetEl) {
			this._dropTargetEl = document.createElement('div');
			this._dropTargetEl.className = 'drop-target';
			this._dropTargetEl.style.width = `${this.size.width}px`;
			this._dropTargetEl.style.height = `${this.size.height}px`;
			this.gameMap.layers.objects.appendChild(this._dropTargetEl);
		}

		const snappedPos = this.getConfig('snapToGrid', false)
			? gridSystem.snapToGrid(this.posX, this.posY, this.size.width, this.size.height, gridSystem.config.cellSize)
			: { x: this.posX, y: this.posY };
		const bounds = this.getDropValidationBounds(snappedPos.x, snappedPos.y);
		this._dropTargetEl.style.width = `${bounds.width}px`;
		this._dropTargetEl.style.height = `${bounds.height}px`;
		this._dropTargetEl.style.left = `${bounds.x}px`;
		this._dropTargetEl.style.top = `${bounds.y}px`;

		const isValid = this.checkDropValidity(snappedPos.x, snappedPos.y);
		this._dropTargetEl.classList.toggle('valid-drop', isValid);
		this._dropTargetEl.classList.toggle('invalid-drop', !isValid);
		this._dropTargetEl.style.display = '';
	}

	hideDropTarget() {
		if (this._dropTargetEl) this._dropTargetEl.style.display = 'none';
	}

	getDropValidationBounds(x = this.posX, y = this.posY) {
		if (this.collider) {
			return {
				x: x + (this.collider.offsetX ?? 0),
				y: y + (this.collider.offsetY ?? 0),
				width: this.collider.width ?? this.size.width,
				height: this.collider.height ?? this.size.height
			};
		}

		return {
			x,
			y,
			width: this.size.width,
			height: this.size.height
		};
	}

	checkDropValidity(x, y) {
		const gridSystem = this.gameMap?.gridSystem;
		if (!gridSystem) return true;

		const thisOverlappable = this.getConfig('overlappable', false);
		const bounds = this.getDropValidationBounds(x, y);
		const startGridX = Math.floor(bounds.x / gridSystem.config.cellSize);
		const startGridY = Math.floor(bounds.y / gridSystem.config.cellSize);
		const endGridX = Math.ceil((bounds.x + bounds.width) / gridSystem.config.cellSize);
		const endGridY = Math.ceil((bounds.y + bounds.height) / gridSystem.config.cellSize);

		for (let gx = startGridX; gx < endGridX; gx++) {
			for (let gy = startGridY; gy < endGridY; gy++) {
				if (gx < 0 || gx >= gridSystem.gridWidth || gy < 0 || gy >= gridSystem.gridHeight) {
					return false;
				}
				const cell = gridSystem.grid[gx][gy];

				// Tile-level block (walls, water) — always hard-block regardless of overlappable
				if (!cell.tileWalkable) return false;

				// Object-level block — skip if this object is overlappable (e.g. rug)
				if (!thisOverlappable) {
					const hasBlocker = [...cell.objects].some(
						obj => obj !== this && !obj.getConfig('overlappable', false)
					);
					if (hasBlocker) return false;
				}
			}
		}
		return true;
	}

	// ── Position / render state ───────────────────────────────────────────────

	// Called at the end of update() — deferred DOM write happens in MapRenderer.flush()
	markPositionDirty() {
		if (this.posX !== this._prevRenderX || this.posY !== this._prevRenderY) {
			this.renderState.posX = this.posX;
			this.renderState.posY = this.posY;
			this.renderState.zIndex = this.getRenderZIndex();
			this.renderState.dirty = true;
		}
	}

	// One-shot imperative move (drag snap, teleport, init). Flushes to DOM immediately.
	updatePosition() {
		if (!this.element) return;
		this.renderState.posX = this.posX;
		this.renderState.posY = this.posY;
		this.renderState.zIndex = this.getRenderZIndex();
		this.element.style.left = `${this.posX}px`;
		this.element.style.top = `${this.posY}px`;
		if (this.renderState.zIndex) this.element.style.zIndex = this.renderState.zIndex;
		this._prevRenderX = this.posX;
		this._prevRenderY = this.posY;
		this.renderState.dirty = false;
		this.updateShadowVisual();
	}

	snapToGrid() {
		const gridSize = this.getConfig('gridSize', 32);
		this.posX = Math.round(this.posX / gridSize) * gridSize;
		this.posY = Math.round(this.posY / gridSize) * gridSize;
		this.updatePosition();
	}

	// ── Render ────────────────────────────────────────────────────────────────

	render(container, parent) {
		const divElement = document.createElement('div');
		divElement.classList.add('map-object', this.variant);
		divElement.dataset.objectType = this.type;
		divElement.dataset.objectId = this.id || '';
		divElement.dataset.renderLayer = this.getRenderLayerKey();

		if (this.getConfig('draggable', false)) {
			divElement.classList.add('draggable');
			if (this.getConfig('dragInSelectMode', false)) {
				divElement.classList.add('drag-in-select-mode');
			}
			divElement.style.touchAction = 'none';
			divElement.style.pointerEvents = 'all';
		}
		if (this.canShowSelectPointer()) {
			divElement.classList.add('inspectable');
		}
		if (this.getConfig('rubbable', false)) divElement.classList.add('rubbable');

		if (this.getConfig('category') === 'interactive') {
			divElement.classList.add('interactive');
			if (this.getConfig('interactiveCollider')) {
				const interactiveElement = document.createElement('div');
				interactiveElement.classList.add('interactive-hitbox');
				interactiveElement.style.width = `${this.getConfig('interactiveCollider.width')}px`;
				interactiveElement.style.height = `${this.getConfig('interactiveCollider.height')}px`;
				interactiveElement.style.top = `${this.getConfig('interactiveCollider.offsetY')}px`;
				interactiveElement.style.left = `${this.getConfig('interactiveCollider.offsetX')}px`;
				divElement.appendChild(interactiveElement);
			}
		}

		Object.assign(divElement.style, {
			left: `${this.posX}px`,
			top: `${this.posY}px`,
			width: `${this.size.width}px`,
			height: `${this.size.height}px`,
			zIndex: this.getRenderZIndex()
		});

		if (this.shouldRenderShadow()) {
			this.shadowElement = document.createElement('div');
			this.shadowElement.className = 'ground-shadow';
			divElement.appendChild(this.shadowElement);
		}

		const renderType = this.getConfig('renderType', 'single');
		if (renderType === 'split') {
			this.renderSplitObject(divElement);
		} else {
			this.renderSingleObject(divElement);
		}

		this.element = divElement;
		container.appendChild(divElement);
		this.updateShadowVisual();
		this.initializeInputComponents();
		this._initSelectDragHandler();
		return divElement;
	}

	updateShadowVisual() {
		if (!this.shadowElement) return;
		if (this.isPickedUp) {
			this.shadowElement.style.display = 'none';
			return;
		}

		const config = this.getShadowConfig();
		if (!config) {
			this.shadowElement.style.display = 'none';
			return;
		}

		const elevation = Math.max(0, Number(this.posZ) || 0);
		const width = Number(config.width) || this.size.width * (config.widthRatio ?? 0.5);
		const height = Number(config.height) || this.size.height * (config.heightRatio ?? 0.18);
		const left = ((this.size.width - width) * (config.anchorX ?? 0.5)) + (config.offsetX ?? 0);
		const top = (this.size.height * (config.anchorY ?? 0.82)) - (height / 2) + (config.offsetY ?? 0);
		const opacityDistance = Math.max(1, config.opacityFadeDistance ?? 96);
		const scaleDistance = Math.max(1, config.scaleFadeDistance ?? 72);
		const maxOpacity = config.maxOpacity ?? 0.28;
		const minOpacity = config.minOpacity ?? 0.08;
		const minScale = config.minScale ?? 0.6;
		const opacity = Math.max(minOpacity, maxOpacity * (1 - (elevation / opacityDistance)));
		const scale = Math.max(minScale, 1 - (elevation / scaleDistance) * 0.35);

		Object.assign(this.shadowElement.style, {
			display: '',
			width: `${width}px`,
			height: `${height}px`,
			left: `${left}px`,
			top: `${top}px`,
			opacity: `${opacity}`,
			transform: `scale(${scale})`,
			backgroundColor: config.color || 'rgba(0, 0, 0, 0.35)',
			filter: `blur(${config.blur ?? 2}px)`
		});
	}

	renderSplitObject(container) {
		const div = document.createElement('div');
		div.classList.add('sprite');
		['back', 'front'].forEach(part => {
			const partDiv = document.createElement('div');
			partDiv.classList.add(part);
			partDiv.style.backgroundImage = `url('images/MapObjects/${this.variant}_${part}.png')`;
			partDiv.style.backgroundSize = 'cover';
			if (part === 'front' && this.getConfig('animation') === 'sway') {
				partDiv.classList.add('sway');
				partDiv.style.animationDelay = `-${Math.random() * 5}s`;
			}
			div.appendChild(partDiv);
		});
		container.appendChild(div);
	}

	renderSingleObject(container) {
		const div = document.createElement('div');
		div.classList.add('sprite');

		if (this.getConfig('spriteConfig.spriteSheet.url')) {
			div.style.backgroundImage = `url(${this.getConfig('spriteConfig.spriteSheet.url')})`;
		}

		if (this.getConfig('spriteConfig.spriteSheet.frameSize')) {
			const frameSize = this.getConfig('spriteConfig.spriteSheet.frameSize');
			const offsetOverride = this.getConfig('spriteFrameOffset');
			const offsetX = offsetOverride?.offsetX ?? frameSize.offsetX;
			const offsetY = offsetOverride?.offsetY ?? frameSize.offsetY;
			div.style.width = `${frameSize.width}px`;
			div.style.height = `${frameSize.height}px`;
			div.style.left = `${-offsetX}px`;
			div.style.top = `${-offsetY}px`;
		}

		if (this.getConfig('animation') === 'sway') {
			div.classList.add('sway');
			div.style.animationDelay = `-${Math.random() * 5}s`;
		}

		container.appendChild(div);
	}

	// ── UI / selection ────────────────────────────────────────────────────────

	selectInUi() { this.container?.ui?.setSelected?.(this); }

	press(parent) {
		if (!this.active) return false;
		if (this.activeMyte && (this.getConfig('canInspect') || this.getConfig('canPickUp') || this.isPickedUp)) {
			this.selectInUi();
		}
		return !!this.activeMyte;
	}

	select() { this.element?.classList.add('selected-object'); }

	unselect() { this.element?.classList.remove('selected-object'); }

	// ── Lifecycle ─────────────────────────────────────────────────────────────

	remove() {
		this.removeAllEffects?.();
		Object.values(this.inputComponents).forEach(c => c.destroy());
		this.inputComponents = {};
		this._selectDragCleanup?.();
		if (this._dropTargetEl) {
			this._dropTargetEl.remove();
			this._dropTargetEl = null;
		}
		if (this.element) {
			this.element.remove();
			this.element = null;
		}
		this.shadowElement = null;
		this.active = false;
		this.gameMap?.gridSystem?.removeObject(this);
	}

	// ── Event handlers ────────────────────────────────────────────────────────

	getBestInteractionAction(myte) {
		const actions = ActionManager.getAvailableActions(this, myte);
		return this.getMajorAction(myte, actions)
			?? this.getFallbackInteractionAction(actions);
	}

	getMajorActionPreferenceIds() {
		const configured = this.getConfig('majorActionId', null);
		if (Array.isArray(configured)) {
			return configured.filter(Boolean);
		}

		return configured ? [configured] : [];
	}

	getMajorAction(myte, availableActions = ActionManager.getAvailableActions(this, myte)) {
		const preferredIds = this.getMajorActionPreferenceIds(myte);
		for (const actionId of preferredIds) {
			const preferred = availableActions.find(action => action.id === actionId);
			if (preferred) {
				return preferred;
			}
		}

		const interactive = availableActions.filter(action =>
			action.category !== 'movement' &&
			!['inspect', 'deep_inspect'].includes(action.id)
		);

		return interactive[0] ?? null;
	}

	getFallbackInteractionAction(availableActions = []) {
		const nonMovement = availableActions.find(action => action.category !== 'movement');
		if (nonMovement) {
			return nonMovement;
		}

		const nonInspect = availableActions.find(action => !['inspect', 'deep_inspect'].includes(action.id));
		return nonInspect ?? availableActions[0] ?? null;
	}

	handleDoubleClick(event) {
		const fn = this.getConfig('doubleClickAction');
		if (typeof fn === 'function') {
			fn(this, event);
			return;
		}

		if (!this.container?.ui?.isTool?.(UIToolModes.SELECT)) return;

		const myte = this.activeMyte;
		if (!myte?.queue) return;

        const best = this.getBestInteractionAction(myte);
        if (best) {
            const actionOptions = ActionManager.getActionOptions(best.id, this, myte);
            if (!actionOptions) {
                return;
            }

            myte.queue.interrupt(best.id, {
                ...actionOptions,
                userInitiated: true
            });
        } else {
            myte.queue.interrupt('go_to_object', {
                target: this,
                userInitiated: true
            });
        }
    }

	handleLongPress(event) {
		const fn = this.getConfig('longPressAction');
		if (typeof fn === 'function') fn(this, event);
	}

	handleMovedEvent() {
		const fn = this.getConfig('onMove');
		if (typeof fn === 'function') fn(this);
		this.gameMap?.gridSystem?.updateObjectPosition(this);
	}

	handleRubProgress(count) {
		const fn = this.getConfig('rubFeedback');
		if (typeof fn === 'function') fn(this, count);
	}

	handleRubEvent(intensity) {
		const fn = this.getConfig('onRub');
		if (typeof fn === 'function') fn(this, intensity);
	}

	handleRubOverdone(intensity) {
		const fn = this.getConfig('onRubOverdone');
		if (typeof fn === 'function') fn(this, intensity);
	}

	// ── Component enable/disable ──────────────────────────────────────────────

	enableDragging() {
		if (!this.getConfig('draggable', false)) this.config.draggable = true;
		if (this.inputComponents.drag) this.inputComponents.drag.enable();
		else this.initDragComponent();
	}

	disableDragging() { this.inputComponents.drag?.disable(); }

	enableRubbing() {
		if (!this.getConfig('rubbable', false)) this.config.rubbable = true;
		if (this.inputComponents.rubbing) this.inputComponents.rubbing.enable();
		else this.initRubbingComponent();
	}

	disableRubbing() { this.inputComponents.rubbing?.disable(); }

	// ── Game-loop hooks ───────────────────────────────────────────────────────

	// Fixed-rate simulation (20 Hz). No DOM writes. Override in subclasses for AI/physics.
	tickUpdate(tickDelta) {
		this.updateCarriedState();
		const now = performance.now();
		for (const [id, time] of this.interactionState.interactionTimes) {
			if (now - time >= this.interactionState.cooldown) {
				this.interactionState.activeInteractions.delete(id);
				this.interactionState.interactionTimes.delete(id);
			}
		}
	}

	// Variable-rate visual update. No simulation state changes. Override for animation.
	update(deltaTime) {
		this.updateCarriedState();
		Object.values(this.inputComponents).forEach(component => {
			if (component.isActive()) component.update(deltaTime);
		});
		const updateFn = this.getConfig('update');
		if (typeof updateFn === 'function') updateFn(this, deltaTime);
		this.updateShadowVisual();
		this.markPositionDirty();
	}
}
