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

	getDistanceTo(target) {
		if (!target) return Infinity;
		return Math.hypot(this.posX - target.posX, this.posY - target.posY);
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
			onClick: () => this.press(this.parent),
			onDoubleClick: (event) => {
				if (this.getConfig('doubleClickAction')) this.handleDoubleClick(event);
			},
			onLongPress: (event) => {
				if (this.getConfig('draggable') && this.parent?.ui?.isTool(UIToolModes.SELECT)) {
					this.parent?.ui?.changeToolMode(UIToolModes.DRAG);
					this.startDrag();
				} else {
					this.handleLongPress(event);
				}
			}
		});
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
				this.element.classList.add('dragging');
				if (this.container?.ui) this.container.ui.setSelected(this);
				this.playConfiguredSound?.('pickup');
			},
			onDragMove: (event) => {
				const world = this.container?.inputHandler?.screenToWorldCoordinates
					? this.container.inputHandler.screenToWorldCoordinates(event.position.x, event.position.y, {
						element: this
					})
					: { x: this.posX, y: this.posY };
				this.posX = world.x;
				this.posY = world.y;
				this.updatePosition();
				this.showDropTarget();
			},
			onDragEnd: () => {
				this.isDragging = false;
				this.element.classList.remove('dragging');
				this.hideDropTarget();
				if (this.getConfig('snapToGrid', false)) this.snapToGrid();
				this.playConfiguredSound?.('drop');
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
		const isSelectedInSelectMode =
			this.parent?.ui?.isTool(UIToolModes.SELECT) &&
			this.parent?.ui?.selectionManager?.getSelectedObject?.() === this;
		return isDragMode || isSelectedInSelectMode;
	}

	startDrag() {
		if (!this.canBeDragged() || !this.inputComponents.drag) return;
		this.inputComponents.drag.startDragAtCurrentPosition();
	}

	_initSelectDragHandler() {
		if (!this.getConfig('draggable', false) || !this.element || this._selectDragCleanup) {
			return;
		}

		const dragThreshold = this.getConfig('selectDragThreshold', 8);
		let pressStart = null;
		let previousMode = null;

		const onMouseDown = (event) => {
			if (event.button !== 0 || !this.active || this.isDragging || !this.parent?.ui?.isTool(UIToolModes.SELECT)) {
				return;
			}

			pressStart = { x: event.clientX, y: event.clientY };
			previousMode = UIToolModes.SELECT;
		};

		const onMouseMove = (event) => {
			if (!pressStart || this.isDragging || !this.parent?.ui?.isTool(UIToolModes.SELECT)) {
				return;
			}

			const dx = event.clientX - pressStart.x;
			const dy = event.clientY - pressStart.y;
			if (Math.hypot(dx, dy) < dragThreshold) {
				return;
			}

			pressStart = null;
			this.parent?.ui?.setSelected?.(this);
			this.parent?.ui?.changeToolMode(UIToolModes.DRAG);
			this.startDrag();
			if (this.isDragging) {
				this._restoreToolModeAfterDrag(previousMode);
			} else {
				this.parent?.ui?.changeToolMode(previousMode);
			}
		};

		const onMouseUp = () => {
			pressStart = null;
			previousMode = null;
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

	_restoreToolModeAfterDrag(mode) {
		const dragComp = this.inputComponents.drag;
		if (!dragComp || !mode) {
			return;
		}

		const savedEnd = dragComp.options.onDragEnd;
		dragComp.options.onDragEnd = (event) => {
			if (savedEnd) {
				savedEnd(event);
			}

			this.parent?.ui?.changeToolMode(mode);
			dragComp.options.onDragEnd = savedEnd;
		};
	}

	playConfiguredSound(type) {
		const soundEffect = this.getConfig(`soundEffects.${type}`);
		if (soundEffect && this.gameMap?.soundManager) {
			this.gameMap.soundManager.play(soundEffect);
		}
	}

	showDropTarget() {
		const gridSystem = this.gameMap?.gridSystem;
		if (!gridSystem) return;

		if (!this._dropTargetEl) {
			this._dropTargetEl = document.createElement('div');
			this._dropTargetEl.className = 'drop-target debug';
			this._dropTargetEl.style.width = `${this.size.width}px`;
			this._dropTargetEl.style.height = `${this.size.height}px`;
			this.gameMap.layers.debug.appendChild(this._dropTargetEl);
		}

		const snappedPos = gridSystem.snapToGridOptimal(
			this.posX, this.posY,
			this.size.width, this.size.height,
			gridSystem.config.cellSize
		);
		this._dropTargetEl.style.left = `${snappedPos.x}px`;
		this._dropTargetEl.style.top = `${snappedPos.y}px`;

		const isValid = this.checkDropValidity(snappedPos.x, snappedPos.y);
		this._dropTargetEl.classList.toggle('valid-drop', isValid);
		this._dropTargetEl.classList.toggle('invalid-drop', !isValid);
		this._dropTargetEl.style.display = '';
	}

	hideDropTarget() {
		if (this._dropTargetEl) this._dropTargetEl.style.display = 'none';
	}

	checkDropValidity(x, y) {
		const gridSystem = this.gameMap?.gridSystem;
		if (!gridSystem) return true;

		const startGridX = Math.floor(x / gridSystem.config.cellSize);
		const startGridY = Math.floor(y / gridSystem.config.cellSize);
		const endGridX = Math.ceil((x + this.size.width) / gridSystem.config.cellSize);
		const endGridY = Math.ceil((y + this.size.height) / gridSystem.config.cellSize);

		for (let gx = startGridX; gx < endGridX; gx++) {
			for (let gy = startGridY; gy < endGridY; gy++) {
				if (gx < 0 || gx >= gridSystem.gridWidth || gy < 0 || gy >= gridSystem.gridHeight) {
					return false;
				}
				if (!gridSystem.grid[gx][gy].walkable) {
					const hasBlocker = [...gridSystem.grid[gx][gy].objects].some(
						obj => obj !== this && !obj.config.walkable
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
			if (this.parent?.getZIndex) {
				this.renderState.zIndex = this.parent.getZIndex(this.posY, this.size.height);
			}
			this.renderState.dirty = true;
		}
	}

	// One-shot imperative move (drag snap, teleport, init). Flushes to DOM immediately.
	updatePosition() {
		if (!this.element) return;
		this.renderState.posX = this.posX;
		this.renderState.posY = this.posY;
		if (this.parent?.getZIndex) {
			this.renderState.zIndex = this.parent.getZIndex(this.posY, this.size.height);
		}
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
		divElement.classList.add('mapObject', this.variant);
		divElement.dataset.objectType = this.type;
		divElement.dataset.objectId = this.id || '';

		if (this.getConfig('draggable', false)) {
			divElement.classList.add('draggable');
			divElement.style.touchAction = 'none';
		}
		if (this.getConfig('rubbable', false)) divElement.classList.add('rubbable');

		if (this.getConfig('category') === 'interactive') {
			divElement.classList.add('interactive');
			if (this.getConfig('interactiveCollider')) {
				const interactiveElement = document.createElement('div');
				interactiveElement.classList.add('interactive-collider');
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
			zIndex: parent.getZIndex(this.posY, this.size.height)
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
		if (this.activeMyte && this.getConfig('canInspect')) this.selectInUi();
		return !!this.activeMyte;
	}

	select() { this.element?.classList.add('selected-object'); }

	unselect() { this.element?.classList.remove('selected-object'); }

	// ── Lifecycle ─────────────────────────────────────────────────────────────

	remove() {
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

	handleDoubleClick(event) {
		const fn = this.getConfig('doubleClickAction');
		if (typeof fn === 'function') {
			fn(this, event);
			return;
		}
		const myte = this.activeMyte;
		if (myte?.queue) myte.queue.add('go_to_object', { target: this });
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
		Object.values(this.inputComponents).forEach(component => {
			if (component.isActive()) component.update(deltaTime);
		});
		const updateFn = this.getConfig('update');
		if (typeof updateFn === 'function') updateFn(this, deltaTime);
		this.updateShadowVisual();
		this.markPositionDirty();
	}
}
