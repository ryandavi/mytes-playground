// Config is provided by MapObjectFactory after loading canonical map object data.

class MapObject {
	static nextObjectId = 1;
	static configPathCache = new Map();

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
		this.container = parent?.parent || null;
		this.core = this.container?.core || null;

		this.size = {
			width: this.getConfig('size.width', 64) * this.getConfig('scale', 1),
			height: this.getConfig('size.height', 64) * this.getConfig('scale', 1)
		};

		this.collider = this.initializeCollider();
		this.capabilities = {
			...(this.getConfig('capabilities', {}) || {})
		};

		this.interactionState = {
			lastInteractionTime: 0,
			cooldown: this.getConfig('interaction.cooldown', 5000),
			activeInteractions: new Set(),
			interactionTimes: new Map()
		};
		this.sockets = new SocketSet(this, this.getConfig('sockets', {}));

		this.inputComponents = {};
		this.input = new MapObjectInputController(this);
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
			sortY: 0,
			zIndex: 0,
			bgPosition: null,
			shadow: null,
			visible: true,
			dirty: true
		};
		this._prevRenderX = -1;
		this._prevRenderY = -1;
		this._spriteElement = null;
		this._spriteBaseTop = 0;
		this._spriteBaseLeft = 0;
		this._baseSpriteTransform = this.getConfig('transformStyle', '') || '';
		this._spriteVisualState = {
			lift: 0,
			scaleX: 1,
			scaleY: 1
		};

		// Sleep/wake: objects outside the culling zone skip visual update.
		// GridSystem.updateCulling() calls wake()/sleep() on transitions.
		// tickUpdate() still runs for objects where shouldSimulateOffScreen() returns true.
		this.sleeping = false;
		this._animationPausedBeforeSleep = false;

		this.invalidateDepthCache();
	}

	// ── Getters ──────────────────────────────────────────────────────────────

	get gameMap() { return this.parent; }

	get activeMyte() {
		return this.container?.activeMyte || this.parent?.activeMyte || null;
	}

	get mytes() {
		return this.parent?.mytes || this.container?.mytes || [];
	}

	getShadowConfig() {
		const shadow = this.getVisualValue('shadow', this.getConfig('shadow', null));
		return shadow?.enabled ? shadow : null;
	}

	getVisualConfig() {
		return this.getConfig('visual', {}) || {};
	}

	getVisualValue(path, defaultValue = null) {
		const keys = String(path || '').split('.').filter(Boolean);
		let current = this.getVisualConfig();
		for (const key of keys) {
			if (current === undefined || current === null || !Object.prototype.hasOwnProperty.call(current, key)) {
				return defaultValue;
			}
			current = current[key];
		}

		return current !== undefined ? current : defaultValue;
	}

	getVisualRenderType() {
		return this.getVisualValue('renderType', this.getConfig('renderType', 'single'));
	}

	getDefaultVisualState(defaultValue = 'default') {
		return this.getVisualValue('defaultState', this.getConfig('default', defaultValue));
	}

	getVisualSpriteSheet() {
		return this.getVisualValue('spriteSheet', this.getConfig('spriteConfig.spriteSheet', {})) || {};
	}

	getVisualFrameSize() {
		const spriteSheet = this.getVisualSpriteSheet();
		return spriteSheet.frameSize || this.getConfig('spriteConfig.spriteSheet.frameSize', null);
	}

	getVisualAnimations() {
		return this.getVisualValue('animations', this.getConfig('spriteConfig.animations', {})) || {};
	}

	getVisualFrameDelay(defaultValue = 100) {
		return this.getVisualValue('frameDelay', this.getConfig('spriteConfig.frameDelay', defaultValue));
	}

	getVisualScale() {
		return this.getVisualValue('scale', this.getConfig('spriteConfig.scale', this.getConfig('scale', 1)));
	}

	getVisualFrameWidth() {
		return this.getVisualValue('frameWidth', this.getConfig('spriteConfig.frameWidth', this.getConfig('size.width')));
	}

	shouldRenderShadow() {
		return !!this.getShadowConfig();
	}

	getSpriteElement() {
		if (!this.element) {
			return null;
		}

		if (!this._spriteElement || !this._spriteElement.isConnected) {
			this._spriteElement = this.element.querySelector('.sprite');
		}

		return this._spriteElement;
	}

	captureSpriteBaseStyles() {
		const sprite = this.getSpriteElement();
		if (!sprite) {
			return;
		}

		const parsedTop = Number.parseFloat(sprite.style.top);
		const parsedLeft = Number.parseFloat(sprite.style.left);
		this._spriteBaseTop = Number.isFinite(parsedTop) ? parsedTop : 0;
		this._spriteBaseLeft = Number.isFinite(parsedLeft) ? parsedLeft : 0;
	}

	setBaseSpriteTransform(transform = '') {
		this._baseSpriteTransform = transform || '';
		this.applySpriteVerticalVisuals();
	}

	setSpriteVerticalLift(lift = 0) {
		this._spriteVisualState.lift = Number.isFinite(lift) ? lift : 0;
		this.applySpriteVerticalVisuals();
	}

	setSpriteVisualScale(scaleX = 1, scaleY = 1) {
		this._spriteVisualState.scaleX = Number.isFinite(scaleX) ? scaleX : 1;
		this._spriteVisualState.scaleY = Number.isFinite(scaleY) ? scaleY : 1;
		this.applySpriteVerticalVisuals();
	}

	resetSpriteVerticalVisuals() {
		this._spriteVisualState.lift = 0;
		this._spriteVisualState.scaleX = 1;
		this._spriteVisualState.scaleY = 1;
		this.applySpriteVerticalVisuals();
	}

	applySpriteVerticalVisuals() {
		const sprite = this.getSpriteElement();
		if (!sprite) {
			return;
		}

		sprite.style.left = `${this._spriteBaseLeft}px`;
		Utility.applyElementVerticalVisuals(sprite, {
			baseTop: this._spriteBaseTop,
			lift: this._spriteVisualState.lift,
			baseTransform: this._baseSpriteTransform,
			scaleX: this._spriteVisualState.scaleX,
			scaleY: this._spriteVisualState.scaleY
		});
	}

	humanizeLabelToken(value) {
		return Utility.humanizeLabel(value);
	}

	formatDisplayQuantity(quantity) {
		return Utility.formatQuantityRange(quantity);
	}

	getDisplayName() {
		const explicitName = this.getConfig('label', null);
		if (typeof explicitName === 'string' && explicitName.trim()) {
			return explicitName.trim();
		}

		const raw = String(this.variant || this.type || 'Object');
		return this.humanizeLabelToken(raw.toLowerCase());
	}

	// Returns true if this object is a flower (for sidebar display and pollinator logic).
	// Override in subclasses or set `isFlower: true` in types.json config.
	isFlower() {
		const type = this.type?.toUpperCase?.();
		return this.getConfig('isFlower', false) || type === 'FLOWER' || type === 'GRASS';
	}

	// ── Deflowered state (pick_flower / regrowth) ─────────────────────────────
	// Lives on MapObject because FLOWER/GRASS map to plain MapObject/FlowerMapObject,
	// not GrowingPlantMapObject — defining it only there left those types pickable
	// forever. Regrowth is a lazy SimClock deadline so it pauses with the sim and
	// works for culled objects (checked in tickUpdate and on every read).

	setDeflowered(regrowthTime = null) {
		if (this.config) this.config.deflowered = true;
		this.element?.classList.add('deflowered');
		const ms = regrowthTime ?? this.getConfig('regrowthTime', 0);
		this._deflowerClearAt = ms > 0 ? SimClock.now() + ms : null;
	}

	clearDeflowered() {
		if (this.config) this.config.deflowered = false;
		this.element?.classList.remove('deflowered');
		this._deflowerClearAt = null;
	}

	isDeflowered() {
		if (this.getConfig('deflowered', false) !== true) return false;
		if (this._deflowerClearAt != null && SimClock.now() >= this._deflowerClearAt) {
			this.clearDeflowered();
			return false;
		}
		return true;
	}

	getSidebarStatusRows() {
		const rows = [];
		const interactionType = this.getConfig('interaction.type');

		if (typeof this.isEnabled === 'function') {
			rows.push({ label: 'Enabled', value: this.isEnabled() ? 'Yes' : 'No' });
		}

		if (this.isMusicSource?.() && typeof this.isActiveMusicSource === 'function') {
			rows.push({ label: 'Music Active', value: this.isActiveMusicSource() ? 'Yes' : 'No' });
		}

		rows.push(...this._getSidebarStatusRows());

		if (typeof this.isEnabled !== 'function' && rows.length === 0 && interactionType) {
			rows.push({ label: 'Interaction', value: interactionType });
		}

		return rows;
	}

	// Hook for subclasses to inject their own status rows without rewriting the base logic.
	_getSidebarStatusRows() { return []; }

	// Player-facing interactions that open UI directly instead of queueing a myte
	// action — opening a shop, talking to an NPC. Each entry is
	// { id, label, run() }; the sidebar renders them above the queued actions.
	getSidebarInteractions() { return []; }

	getMajorSidebarInteraction() {
		return this.getSidebarInteractions().find(interaction => interaction.major === true) ?? null;
	}

	runMajorSidebarInteraction() {
		const interaction = this.getMajorSidebarInteraction();
		if (!interaction) return false;
		interaction.run?.();
		return true;
	}

	getSidebarDetailRows() {
		const rows = [];

		if (this.growthStage != null && this.growthProgress != null) {
			rows.push({
				label: 'Growth',
				value: `${Math.round((this.growthProgress || 0) * 100)}%`
			});
		}

		return rows;
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

	getConfig(path, ...args) {
		const defaultValue = args.length > 0 ? args[0] : null;
		let keys = MapObject.configPathCache.get(path);
		if (!keys) {
			keys = path.split('.');
			MapObject.configPathCache.set(path, keys);
		}
		let current = this.config;
		for (const key of keys) {
			if (current === undefined || current === null || !Object.prototype.hasOwnProperty.call(current, key)) {
				return defaultValue;
			}
			current = current[key];
		}
		return current !== undefined ? current : defaultValue;
	}

	getFiniteConfigNumber(path, defaultValue = null) {
		const value = this.getConfig(path, undefined);
		if (value === undefined || value === null || value === '') {
			return defaultValue;
		}

		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : defaultValue;
	}

	invalidateDepthCache() {
		const colliderBottom = this.getConfig('physics.collision', false)
			? (this.collider?.offsetY ?? 0) + (this.collider?.height ?? 0)
			: 0;
		this._depthOffset = EntityMethods.resolveDepthOffsetValue(
			this.getFiniteConfigNumber('visual.depthLine', null),
			this.getFiniteConfigNumber('visual.depthOffset', null),
			colliderBottom,
			this.size.height
		);

		const explicitPriority = this.getFiniteConfigNumber('visual.depthPriority', null);
		this._depthPriority = Number.isFinite(explicitPriority)
			? explicitPriority
			: this.getFiniteConfigNumber('visual.renderPriority', 0);
		this._renderLayerKey = this.getConfig('visual.renderLayer', 'objects');
	}

	_shadowStateEquals(nextState, previousState = this.renderState?.shadow) {
		if (nextState === previousState) return true;
		if (!nextState || !previousState) return false;

		return nextState.visible === previousState.visible &&
			nextState.width === previousState.width &&
			nextState.height === previousState.height &&
			nextState.left === previousState.left &&
			nextState.top === previousState.top &&
			nextState.opacity === previousState.opacity &&
			nextState.scale === previousState.scale &&
			nextState.color === previousState.color &&
			nextState.blur === previousState.blur;
	}

	getRegionConfig(regionId = 'collider') {
		const normalizedRegionId = this.normalizeRegionId(regionId);
		return this.getConfig(`spatial.regions.${normalizedRegionId}`, null);
	}

	getRegionRect(regionId = 'collider') {
		const region = this.getRegionConfig(regionId);
		if (!region) {
			return null;
		}

		const x = this.posX + (region.x ?? 0);
		const y = this.posY + (region.y ?? 0);
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

	getLocalRegionRect(regionId = 'collider') {
		const region = this.getRegionConfig(regionId);
		if (!region) {
			return null;
		}

		const x = region.x ?? 0;
		const y = region.y ?? 0;
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

	getSelectionRect() {
		return this.getRegionRect('select') ||
			this.getRegionRect('interaction') ||
			this.getRegionRect('collider');
	}

	getPickupRect() {
		return this.getRegionRect('pickup') ||
			this.getSelectionRect() ||
			this.getRegionRect('collider');
	}

	getCenterPoint(regionId = 'collider') {
		const rect = this.getRegionRect(regionId) || this.getSelectionRect() || {
			left: this.posX,
			top: this.posY,
			width: this.size.width,
			height: this.size.height
		};

		return {
			x: rect.left + (rect.width / 2),
			y: rect.top + (rect.height / 2)
		};
	}

	canEmitLight() {
		return this.getConfig('lighting.emitsLight', false) || this.getConfig('lightEmission', false);
	}

	isLightSource() {
		if (!this.active || !this.canEmitLight()) {
			return false;
		}

		if (typeof this.isEnabled === 'function' && this.getConfig('interaction.type') === 'light') {
			return this.isEnabled();
		}

		return true;
	}

	getLightSourceConfig() {
		if (!this.canEmitLight()) {
			return null;
		}

		const type = this.type?.toUpperCase?.() || '';
		const defaultColor = type === 'PORTAL'
			? 'rgba(110, 180, 255, 1)'
			: 'rgba(255, 214, 150, 1)';

		return {
			emitsLight: true,
			radius: this.getConfig('lighting.radius', this.getConfig('aura.radius', Math.max(this.size.width, this.size.height) * 2)),
			intensity: this.getConfig('lighting.intensity', 0.8),
			color: this.getConfig('lighting.color', defaultColor),
			falloff: this.getConfig('lighting.falloff', 'smooth'),
			castsShadows: this.getConfig('lighting.castsShadows', false),
			hero: this.getConfig('lighting.hero', false),
			roomFill: this.getConfig('lighting.roomFill', 0.3)
		};
	}

	isLightBlocking() {
		return !!this.active && this.getConfig('physics.blocksLineOfSight', false);
	}

	getLightBlockerGeometry() {
		if (!this.isLightBlocking()) {
			return null;
		}

		const rect = this.getRegionRect('collider') || this.getSelectionRect() || {
			left: this.posX,
			top: this.posY,
			width: this.size.width,
			height: this.size.height
		};

		return rect ? {
			type: 'rect',
			left: rect.left,
			top: rect.top,
			right: rect.left + rect.width,
			bottom: rect.top + rect.height,
			width: rect.width,
			height: rect.height
		} : null;
	}

	getActionConfig(actionId, defaultValue = null) {
		if (!actionId) {
			return defaultValue;
		}

		return this.getConfig(`actionConfigs.${actionId}`, defaultValue);
	}

	getActionStateToken() {
		if (typeof this.isOpen === 'boolean') return this.isOpen ? 'open' : 'closed';
		if (this.getConfig('interaction.type') === 'light') {
			return this.isEnabled?.() ? 'enabled' : 'disabled';
		}
		return this.visualState ?? null;
	}

	getApproachConfig(actionId = null) {
		const actionConfig = actionId ? this.getActionConfig(actionId, null) : null;
		if (actionConfig && Object.prototype.hasOwnProperty.call(actionConfig, 'approachConfig')) {
			return actionConfig.approachConfig;
		}

		return this.getConfig('approachConfig', null);
	}

	getActionSlotDefinitions(actionId) {
		if (actionId === 'use_surface_slot') {
			return this.sockets.list()
				.filter(socket => socket.kind === 'seat' || socket.kind === 'sleep')
				.map(socket => ({
					id: socket.id,
					restPosition: socket.position,
					restFacing: socket.facing,
					approachConfig: socket.approach,
					entryGap: socket.entryGap,
					returnToEntry: socket.exit?.returnToEntry,
					exitGap: socket.exit?.gap,
					exitSearchRadius: socket.exit?.searchRadius
				}));
		}
		return [];
	}

	// ── Direction helpers ─────────────────────────────────────────────────────

	static processDirectionConfig(baseConfig, direction) {
		const config = Utility.deepClone(baseConfig);
		if (!config.directionConfigs) return config;

		const normalizedDirection = MapObject.normalizeFacingDirection(direction, config.directionConfigs);
		const dirConfig = config.directionConfigs[normalizedDirection];
		if (!dirConfig) return config;

		if (dirConfig.size) config.size = dirConfig.size;
		if (dirConfig.physics) {
			config.physics = Utility.deepMerge(config.physics || {}, dirConfig.physics);
		}
		if (dirConfig.interaction) {
			config.interaction = Utility.deepMerge(config.interaction || {}, dirConfig.interaction);
		}
		if (dirConfig.spatial) {
			config.spatial = Utility.deepMerge(config.spatial || {}, dirConfig.spatial);
		}
		if (dirConfig.visual) {
			config.visual = Utility.deepMerge(config.visual || {}, dirConfig.visual);
		}

		config.facingDirection = normalizedDirection;
		config.transformStyle = dirConfig.transformStyle || '';

		for (const key in dirConfig) {
			if (!['size', 'transformStyle', 'physics', 'interaction', 'spatial', 'visual'].includes(key)) {
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
		const region = this.getRegionConfig('collider');
		if (region) {
			return {
				...region,
				offsetX: region.x ?? region.offsetX ?? 0,
				offsetY: region.y ?? region.offsetY ?? 0
			};
		}
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
		return this.getConfig('interaction.radius', defaultValue);
	}

	normalizeAiAffordanceEntry(entry) {
		if (typeof entry === 'string') {
			return { actionId: entry };
		}

		return Utility.isPlainObject(entry) ? { ...entry } : null;
	}

	resolveAffordanceContextValue(context = {}, path = '') {
		const keys = String(path || '').split('.').filter(Boolean);
		let current = context;

		for (const key of keys) {
			if (current == null || !Object.prototype.hasOwnProperty.call(current, key)) {
				return undefined;
			}
			current = current[key];
		}

		return current;
	}

	passesAffordanceNumericGate(value, gate) {
		if (!Utility.isPlainObject(gate)) return false;

		const threshold = Number(gate.value);
		if (!Number.isFinite(value) || !Number.isFinite(threshold)) {
			return false;
		}

		switch (gate.op) {
			case 'gt': return value > threshold;
			case 'gte': return value >= threshold;
			case 'lt': return value < threshold;
			case 'lte': return value <= threshold;
			default: return false;
		}
	}

	passesAffordanceWhen(when = null, context = {}, actor = null) {
		if (!Utility.isPlainObject(when)) {
			return true;
		}

		if (when.capability && !this.capabilities?.[when.capability]) {
			return false;
		}

		if (Object.prototype.hasOwnProperty.call(when, 'isEnabled')) {
			if (typeof this.isEnabled !== 'function' || this.isEnabled() !== when.isEnabled) {
				return false;
			}
		}

		if (Object.prototype.hasOwnProperty.call(when, 'isActiveMusicSource')) {
			if (typeof this.isActiveMusicSource !== 'function' || this.isActiveMusicSource() !== when.isActiveMusicSource) {
				return false;
			}
		}

		if (when.method) {
			if (typeof this[when.method] !== 'function' || !this[when.method]()) {
				return false;
			}
		}

		if (when.notMethod) {
			if (typeof this[when.notMethod] === 'function' && this[when.notMethod]()) {
				return false;
			}
		}

		if (when.actorNotCarrying === true && actor?.queue?.isCarrying?.()) {
			return false;
		}

		if (when.socketAvailable) {
			if (this.sockets?.availableFor) {
				if ((this.sockets.availableFor(actor, when.socketAvailable) || []).length <= 0) {
					return false;
				}
			} else if ((this.getAvailableActionSlots?.('use_surface_slot', actor) || []).length <= 0) {
				return false;
			}
		}

		if (when.contextGate) {
			const actual = this.resolveAffordanceContextValue(context, when.contextGate.path);
			if (!this.passesAffordanceNumericGate(actual, when.contextGate)) {
				return false;
			}
		}

		if (Array.isArray(when.contextGates)) {
			for (const gate of when.contextGates) {
				const actual = this.resolveAffordanceContextValue(context, gate.path);
				if (!this.passesAffordanceNumericGate(actual, gate)) return false;
			}
		}

		if (when.novelty) {
			const noveltyScore = context.getNoveltyScore?.(this);
			if (!this.passesAffordanceNumericGate(noveltyScore, when.novelty)) {
				return false;
			}
		}

		return true;
	}

	getConfiguredAiAffordances(context = {}, actor = null) {
		const defaults = this.getConfig('ai.defaultAffordances', []);
		const configured = this.getConfig('ai.affordances', []);
		const configuredAffordances = [
			...(Array.isArray(defaults) ? defaults : []),
			...(Array.isArray(configured) ? configured : [])
		];

		return configuredAffordances
			.map(entry => this.normalizeAiAffordanceEntry(entry))
			.filter(entry => entry?.actionId)
			.filter(entry => this.passesAffordanceWhen(entry.when, context, actor))
			.map(({ when, ...affordance }) => affordance);
	}

	getAiAffordances(context = {}, actor = null) {
		const affordances = this.getConfiguredAiAffordances(context, actor);
		return affordances.filter((affordance, index, list) => {
			const key = `${affordance.actionId}:${affordance.purpose ?? ''}`;
			return list.findIndex(item => `${item.actionId}:${item.purpose ?? ''}` === key) === index;
		}).filter(affordance => !this.isActionOccupied(affordance.actionId, actor));
	}

	getAIMetadata() {
		return {
			aiTags:           this.getConfig('ai.tags',            []),
			comfortEffect:    this.getConfig('ai.comfortEffect',   0),
			confidenceEffect: this.getConfig('ai.confidenceEffect', 0),
			noveltyValue:     this.getConfig('ai.noveltyValue',    0),
			scaryStrength:    this.getConfig('ai.scaryStrength',   0)
		};
	}

	canBeInspectedByAi() {
		return this.getConfig('canInspect', true) !== false &&
			this.getConfig('interaction.type') !== 'teleport' &&
			this.type?.toUpperCase?.() !== 'PORTAL';
	}

	isMusicSource() {
		return this.getConfig('ai.musicSource', false) === true;
	}

	isActiveMusicSource() {
		return false;
	}

	getFacingVector() {
		const facing = this.normalizeFacingDirection(
			this.getConfig('facingDirection', this.facingDirection ?? 'S')
		);

		switch (facing) {
			case 'N': return { x: 0, y: -1 };
			case 'E': return { x: 1, y: 0 };
			case 'W': return { x: -1, y: 0 };
			case 'S':
			default:
				return { x: 0, y: 1 };
		}
	}

	getColliderRectFor(entity = this) {
		if (!entity) return null;

		if (typeof entity.getRegionRect === 'function') {
			const colliderRect = entity.getRegionRect('collider');
			if (colliderRect) {
				return colliderRect;
			}
		}

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

	// Thin pickup interface — withPickup overrides these with full implementations.
	canBePickedUpBy(myte) { return false; }
	pickup(myte)          { return false; }
	drop(vx = 0, vy = 0) { return { vx, vy }; }

	resolveDepthOffset() {
		return this._depthOffset;
	}

	getSortY(y = this.posY) {
		return EntityMethods.getSortYValue(y, this.posY, this.resolveDepthOffset());
	}

	getDepthPriority() {
		return this._depthPriority;
	}

	updateCarriedState() {
		if (this.container?.attachments?.getAttachment?.(this)) {
			return true;
		}

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
		if (Number.isFinite(this._attachmentRenderZIndex)) {
			return this._attachmentRenderZIndex;
		}

		if (this.isPickedUp && this.carrier?.renderer?.getZIndex) {
			return this.carrier.renderer.getZIndex(this.carrier.posY) + 2;
		}

		if (this.parent?.getDepthZIndex) {
			return this.parent.getDepthZIndex(this.getSortY(), this.getDepthPriority());
		}

		return this.parent?.getZIndex ? this.parent.getZIndex(this.posY, this.resolveDepthOffset(), this.getDepthPriority()) : 0;
	}

	getRenderLayerKey() {
		return this._renderLayerKey;
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

	isInInteractionRange(target, radius = this.getInteractionRadius()) {
		if (this.getDistanceTo(target) > radius) return false;
		return this._hasLineOfSightTo(target);
	}

	// Returns false if any object with blocksLineOfSight:true lies between this and other.
	// Uses Bresenham grid traversal on the collider-center line.
	_hasLineOfSightTo(other) {
		const gs = this.gameMap?.gridSystem;
		if (!gs) return true;

		const cs = gs.config?.cellSize ?? 32;
		const ax = this.posX + (this.collider?.offsetX ?? 0) + (this.collider?.width  ?? this.size.width)  / 2;
		const ay = this.posY + (this.collider?.offsetY ?? 0) + (this.collider?.height ?? this.size.height) / 2;
		const bx = other.posX + (other.collider?.offsetX ?? 0) + (other.collider?.width  ?? other.size?.width  ?? 0) / 2;
		const by = other.posY + (other.collider?.offsetY ?? 0) + (other.collider?.height ?? other.size?.height ?? 0) / 2;

		let gx = Math.floor(ax / cs);
		let gy = Math.floor(ay / cs);
		const ex = Math.floor(bx / cs);
		const ey = Math.floor(by / cs);
		const dx = Math.abs(ex - gx);
		const dy = Math.abs(ey - gy);
		const sx = gx < ex ? 1 : -1;
		const sy = gy < ey ? 1 : -1;
		let err = dx - dy;

		while (gx !== ex || gy !== ey) {
			const cell = gs.grid[gx]?.[gy];
			if (cell) {
				for (const obj of cell.objects) {
					if (obj === this || obj === other) continue;
					if (obj.getConfig?.('physics.blocksLineOfSight', false)) return false;
				}
			}
			const e2 = 2 * err;
			if (e2 > -dy) { err -= dy; gx += sx; }
			if (e2 <  dx) { err += dx; gy += sy; }
		}
		return true;
	}

	getSelectionDebugInfo() {
		return [
			{ label: 'Sort Y', value: `${this.getSortY().toFixed(2)}px` },
			{ label: 'Depth Offset', value: `${this.resolveDepthOffset().toFixed(2)}px` },
			{ label: 'Z-Index', value: `${this.getRenderZIndex()}` }
		];
	}

	canInteract(myte) {
		if (!this.getConfig('interaction.type')) return false;
		if (this.interactionState.activeInteractions.has(myte.id)) return false;
		const timeSinceLastInteraction = SimClock.now() - this.interactionState.lastInteractionTime;
		if (timeSinceLastInteraction < this.interactionState.cooldown) return false;
		return true;
	}

	interact(myte) {
		if (!this.canInteract(myte)) return false;

		const now = SimClock.now();
		this.interactionState.lastInteractionTime = now;
		this.interactionState.activeInteractions.add(myte.id);
		this.interactionState.interactionTimes.set(myte.id, now);

		const interactionType = this.getConfig('interaction.type');
		switch (interactionType) {
			case 'mood_boost':
				myte.buffs?.applyBuff?.(
					this.getConfig('interactionBuffDefinition', null) ??
					this.getConfig('interactionBuffId', 'object_uplifted'),
					{
						source: 'interaction',
						payload: {
							objectType: this.type,
							objectVariant: this.variant,
							objectId: this.id
						}
					}
				);
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

	isActionSlotOccupied(actionId, slotId, actor = null) {
		if (actionId === 'use_surface_slot' && this.sockets?.get?.(slotId)) {
			return !this.sockets.hasCapacity(slotId, actor);
		}
		return false;
	}

	getAvailableActionSlots(actionId, actor = null) {
		if (actionId === 'use_surface_slot') {
			return this.sockets.availableFor(actor)
				.filter(socket => socket.kind === 'seat' || socket.kind === 'sleep')
				.map(socket => this.getActionSlotDefinitions(actionId).find(slot => slot.id === socket.id));
		}
		return [];
	}

	isActionOccupied(actionId, actor = null) {
		if (actionId === 'use_surface_slot') {
			return this.getAvailableActionSlots(actionId, actor).length === 0;
		}
		return false;
	}

	claimActionSlot(actionId, slotId, actor = null) {
		if (actionId === 'use_surface_slot' && this.sockets?.get?.(slotId)) {
			return this.sockets._claim(slotId, actor);
		}
		return false;
	}

	releaseActionSlot(actionId, slotId, actor = null) {
		if (actionId === 'use_surface_slot' && this.sockets?.get?.(slotId)) {
			return this.sockets._release(slotId, actor);
		}
		return false;
	}

	isInUse(actionId = null) {
		if (!actionId || actionId === 'use_surface_slot') {
			return this.sockets.list().some(socket => this.sockets.occupantsOf(socket.id).length > 0);
		}
		return false;
	}

	// ── Input components ──────────────────────────────────────────────────────

	initializeInputComponents() {
		this.input.initializeInputComponents();
	}

	initClickComponent() {
		this.input.initClickComponent();
	}

	handleSingleClick() {
		if (!this.active) return;
		this.selectInUi();
	}

	initDragComponent() {
		this.input.initDragComponent();
	}

	initRubbingComponent() {
		this.input.initRubbingComponent();
	}

	// ── Drag helpers ──────────────────────────────────────────────────────────

	canBeDragged() {
		if (!this.getConfig('draggable', false)) return false;
		if (this.isInUse()) return false;
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
			this.getConfig('interaction.type') != null ||
			this.getMajorActionPreferenceIds().length > 0;
	}

	startDrag() {
		this.input.startDrag();
	}

	startDragAtPosition(position = null) {
		this.input.startDragAtPosition(position);
	}

	_initSelectDragHandler() {
		this.input._initSelectDragHandler();
	}

	_restoreToolModeAfterDrag(mode, delay = 0) {
		this.input._restoreToolModeAfterDrag(mode, delay);
	}

	playConfiguredSound(type) {
		const soundEffect = this.getConfig(`soundEffects.${type}`);
		if (soundEffect && this.gameMap?.soundManager) {
			this.gameMap.soundManager.playWhenReady(soundEffect, { source: this });
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
		if (dirConfig.spatial) {
			this.config.spatial = Utility.deepMerge(this.config.spatial || {}, dirConfig.spatial);
		}
		if (dirConfig.visual) {
			this.config.visual = Utility.deepMerge(this.config.visual || {}, dirConfig.visual);
		}
		if (dirConfig.physics) {
			this.config.physics = Utility.deepMerge(this.config.physics || {}, dirConfig.physics);
		}
		if (dirConfig.interaction) {
			this.config.interaction = Utility.deepMerge(this.config.interaction || {}, dirConfig.interaction);
		}
		const colliderRegion = this.getRegionConfig('collider');
		if (colliderRegion) {
			this.collider = {
				...colliderRegion,
				offsetX: colliderRegion.x ?? 0,
				offsetY: colliderRegion.y ?? 0
			};
		}
		this.config.facingDirection = normalizedDir;
		this.config.transformStyle = dirConfig.transformStyle || '';
		this.config.spriteFrameOffset = dirConfig.spriteFrameOffset || null;

		for (const key in dirConfig) {
			if (!['size', 'collider', 'transformStyle', 'spriteFrameOffset', 'spatial', 'visual'].includes(key)) {
				this.config[key] = dirConfig[key];
			}
		}

		if ('facingDirection' in this) {
			this.facingDirection = normalizedDir;
		}

		this.invalidateDepthCache();

		if (this.element) {
			this.element.dataset.renderLayer = this.getRenderLayerKey();
			this.element.style.width = `${this.size.width}px`;
			this.element.style.height = `${this.size.height}px`;
			['n', 's', 'e', 'w'].forEach(d => this.element.classList.remove(`facing-${d}`));
			this.element.classList.add(`facing-${normalizedDir.toLowerCase()}`);
			const spriteEl = this.element.querySelector('.sprite');
			if (spriteEl) {
				const frameSize = this.getVisualFrameSize();
				if (frameSize) {
					const offsetOverride = this.getConfig('spriteFrameOffset');
					const offsetX = offsetOverride?.offsetX ?? frameSize.offsetX;
					const offsetY = offsetOverride?.offsetY ?? frameSize.offsetY;
					spriteEl.style.width = `${frameSize.width}px`;
					spriteEl.style.height = `${frameSize.height}px`;
					spriteEl.style.left = `${-offsetX}px`;
					spriteEl.style.top = `${-offsetY}px`;
				}

				this._spriteElement = spriteEl;
				this.captureSpriteBaseStyles();
				this.setBaseSpriteTransform(dirConfig.transformStyle || '');
			}

			const interactiveEl = this.element.querySelector('.interactive-hitbox');
			if (interactiveEl) {
				const interactionRegion = this.getLocalRegionRect('interaction');
				if (interactionRegion) {
					interactiveEl.style.width = `${interactionRegion.width}px`;
					interactiveEl.style.height = `${interactionRegion.height}px`;
					interactiveEl.style.left = `${interactionRegion.x}px`;
					interactiveEl.style.top = `${interactionRegion.y}px`;
				}
			}
		}

		if (this._dropTargetEl) {
			this._dropTargetEl.style.width = `${this.size.width}px`;
			this._dropTargetEl.style.height = `${this.size.height}px`;
		}

		this._createSurfaceSlotElements();
		this.syncRenderLayer();
		this.updatePosition();
	}

	_rotateDuringDrag() {
		this.input._rotateDuringDrag();
	}

	showDropTarget() {
		this.input.showDropTarget();
	}

	hideDropTarget() {
		this.input.hideDropTarget();
	}

	getDropValidationBounds(x = this.posX, y = this.posY) {
		return this.input.getDropValidationBounds(x, y);
	}

	checkDropValidity(x, y) {
		return this.input.checkDropValidity(x, y);
	}

	// ── Position / render state ───────────────────────────────────────────────

	// Called at the end of update() — deferred DOM write happens in MapRenderer.flush()
	markPositionDirty() {
		if (this.posX !== this._prevRenderX || this.posY !== this._prevRenderY) {
			this.renderState.posX = this.posX;
			this.renderState.posY = this.posY;
			this.renderState.sortY = this.getSortY();
			this.renderState.zIndex = this.getRenderZIndex();
			this.renderState.dirty = true;
		}
	}

	// One-shot imperative move (drag snap, teleport, init). Flushes to DOM immediately.
	updatePosition() {
		if (!this.element) return;
		this.renderState.posX = this.posX;
		this.renderState.posY = this.posY;
		this.renderState.sortY = this.getSortY();
		this.renderState.zIndex = this.getRenderZIndex();
		this.element.style.left = `${this.posX}px`;
		this.element.style.top = `${this.posY}px`;
		if (this.renderState.zIndex) this.element.style.zIndex = this.renderState.zIndex;
		this._prevRenderX = this.posX;
		this._prevRenderY = this.posY;
		this.element.dataset.sortY = `${Math.round(this.getSortY() * 100) / 100}`;
		this.computeShadowVisual();
		this.parent?.renderer?.applyShadowState?.(this);
		this.renderState.dirty = false;
	}

	snapToGrid() {
		const gridSize = this.getConfig('gridSize', 32);
		this.posX = Math.round(this.posX / gridSize) * gridSize;
		this.posY = Math.round(this.posY / gridSize) * gridSize;
		this.updatePosition();
	}

	// ── Render ────────────────────────────────────────────────────────────────

	bindAffordanceTooltip() {
		if (!this.element) return;
		const tooltip = TooltipSystem.getInstance();
		this.element.addEventListener('mouseenter', () => {
			if (!this.areInteractionHintsEnabled()) return;
			const activeMyte = this.activeMyte;
			const sidebar = this.container?.ui?.actionSidebarManager;
			const available = activeMyte ? ActionManager.getAvailableActions(this, activeMyte) : [];
			const action = activeMyte
				? sidebar?.getMajorAction?.(this, activeMyte, available)
				: null;
			const actionLabel = action
				? (sidebar?.getActionLabel?.(action, this) ?? action.label)
				: this.getFallbackAffordanceTooltipAction(activeMyte);
			tooltip.show({
				anchor: this.element,
				content: this.createAffordanceTooltipContent(actionLabel)
			});
		});
		this.element.addEventListener('mouseleave', () => {
			if (tooltip.isVisibleFor(this.element)) tooltip.hide();
		});
	}

	areInteractionHintsEnabled() {
		return this.core?.user?.preferences?.interactionHintsEnabled !== false;
	}

	getAffordanceTooltipTitle() {
		return this.getDisplayName();
	}

	getFallbackAffordanceTooltipAction(_activeMyte) {
		const actionId = this.getMajorActionPreferenceIds()[0];
		if (!actionId) return null;
		return ActionManager.getActionPresentation(actionId, this).label
			?? ActionManager.getMetadata(actionId)?.label
			?? null;
	}

	createAffordanceTooltipContent(actionLabel) {
		const content = document.createElement('div');
		const title = document.createElement('strong');
		title.className = 'ui-tooltip__title';
		title.textContent = this.getAffordanceTooltipTitle();

		content.append(title);
		if (actionLabel) {
			const action = document.createElement('span');
			action.className = 'ui-tooltip__body';
			action.textContent = actionLabel;
			content.append(action);
		}
		return content;
	}

	render(container, parent) {
		const divElement = document.createElement('div');
		divElement.classList.add('map-object', this.variant);
		divElement.dataset.objectType = this.type;
		divElement.dataset.objectId = this.id || '';
		divElement.dataset.renderLayer = this.getRenderLayerKey();

		if (this.getActionConfig?.('use_surface_slot')) {
			divElement.classList.add('has-surface-slot');
		}

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
			const interactionRegion = this.getLocalRegionRect('interaction');
			if (interactionRegion) {
				const interactiveElement = document.createElement('div');
				interactiveElement.classList.add('interactive-hitbox');
				interactiveElement.style.width = `${interactionRegion.width}px`;
				interactiveElement.style.height = `${interactionRegion.height}px`;
				interactiveElement.style.top = `${interactionRegion.y}px`;
				interactiveElement.style.left = `${interactionRegion.x}px`;
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
		divElement.dataset.sortY = `${Math.round(this.getSortY() * 100) / 100}`;

		if (this.shouldRenderShadow()) {
			this.shadowElement = document.createElement('div');
			this.shadowElement.className = 'ground-shadow';
			divElement.appendChild(this.shadowElement);
		}

		const renderType = this.getVisualRenderType();
		if (renderType === 'split') {
			this.renderSplitObject(divElement);
		} else {
			this.renderSingleObject(divElement);
		}

		this.element = divElement;
		this.bindAffordanceTooltip();
		this._spriteElement = null;
		container.appendChild(divElement);
		this.captureSpriteBaseStyles();
		this.setBaseSpriteTransform(this.getConfig('transformStyle', ''));
		this.computeShadowVisual();
		this.parent?.renderer?.applyShadowState?.(this);
		this.initializeInputComponents();
		this._initSelectDragHandler();
		this._createSurfaceSlotElements();
		return divElement;
	}

	_createSurfaceSlotElements() {
		if (!this.element) return;
		this.element.querySelectorAll('.map-object-slot').forEach(el => el.remove());
		this.slotElements = new Map();

		if (!this.getActionConfig?.('use_surface_slot')) return;

		const cOffX = this.collider?.offsetX ?? 0;
		const cOffY = this.collider?.offsetY ?? 0;
		const cw    = this.collider?.width  ?? this.size.width;
		const ch    = this.collider?.height ?? this.size.height;

		const slots = this.getActionSlotDefinitions('use_surface_slot');

		// Determine primary split axis from slot positions
		const useXAxis = slots.every(s => s.restPosition?.xFactor != null);
		const factors = slots.map(s => useXAxis
			? (s.restPosition?.xFactor ?? 0.5)
			: (s.restPosition?.yFactor ?? 0.5)
		);
		// Sort slots by their axis factor to build non-overlapping boundary zones
		const sorted = slots.map((slot, i) => ({ slot, factor: factors[i] }))
			.sort((a, b) => a.factor - b.factor);

		// Build zone boundaries: 0 … midpoint … midpoint … 1
		const boundaries = [0];
		for (let i = 0; i < sorted.length - 1; i++) {
			boundaries.push((sorted[i].factor + sorted[i + 1].factor) / 2);
		}
		boundaries.push(1);

		sorted.forEach(({ slot }, i) => {
			const lo = boundaries[i];
			const hi = boundaries[i + 1];
			let left, top, width, height;
			if (useXAxis) {
				left   = cOffX + cw * lo;
				top    = cOffY;
				width  = cw * (hi - lo);
				height = ch;
			} else {
				left   = cOffX;
				top    = cOffY + ch * lo;
				width  = cw;
				height = ch * (hi - lo);
			}
			const el = document.createElement('div');
			el.classList.add('map-object-slot');
			el.dataset.slotId = slot.id;
			el.style.cssText = `position:absolute;left:${left}px;top:${top}px;width:${width}px;height:${height}px;pointer-events:none;`;
			this.element.appendChild(el);
			this.slotElements.set(slot.id, el);
		});
	}

	computeShadowVisual() {
		if (!this.shadowElement) return;

		let nextShadowState = { visible: false };
		if (!this.isPickedUp) {
			const config = this.getShadowConfig();
			if (config) {
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

				nextShadowState = {
					visible: true,
					width,
					height,
					left,
					top,
					opacity,
					scale,
					color: config.color || 'rgba(0, 0, 0, 0.35)',
					blur: config.blur ?? 2
				};
			}
		}

		if (!this._shadowStateEquals(nextShadowState)) {
			this.renderState.shadow = nextShadowState;
			this.renderState.dirty = true;
		}
	}

	renderSplitObject(container) {
		const div = document.createElement('div');
		div.classList.add('sprite');
		const spritePrefix = this.getConfig('splitSpritePrefix', this.variant);
		['back', 'front'].forEach(part => {
			const partDiv = document.createElement('div');
			partDiv.classList.add(part);
			partDiv.style.backgroundImage = `url('images/MapObjects/${spritePrefix}_${part}.png')`;
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

		const spriteSheet = this.getVisualSpriteSheet();
		if (spriteSheet.url) {
			div.style.backgroundImage = `url(${spriteSheet.url})`;
		}

		const frameSize = this.getVisualFrameSize();
		if (frameSize) {
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
		this.container?.attachments?.detachAllChildren?.(this);
		this.container?.attachments?.detach?.(this);
		this.input.dispose();
		if (this.element) {
			this.element.remove();
			this.element = null;
		}
		this._spriteElement = null;
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

	runDebugDirectInteraction(parent = this.container ?? this.parent) {
		return false;
	}

	handleDoubleClick(event) {
		const fn = this.getConfig('doubleClickAction');
		if (typeof fn === 'function') {
			fn(this, event);
			return;
		}

		if (this.runMajorSidebarInteraction()) return;

		const debugOverlay = this.container?.ui?.debugOverlay;
		if (debugOverlay?.isDirectWorldInteractionEnabled?.()) {
			this.selectInUi();
			if (this.runDebugDirectInteraction(this.container ?? this.parent)) {
				return;
			}
		}

		const myte = this.activeMyte;
		if (!myte?.queue) {
			return;
		}

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
		if (typeof fn === 'function') {
			fn(this, event);
		} else {
			this.handleDoubleClick(event);
		}
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
		this.input.enableDragging();
	}

	disableDragging() { this.input.disableDragging(); }

	enableRubbing() {
		this.input.enableRubbing();
	}

	disableRubbing() { this.input.disableRubbing(); }

	// ── Game-loop hooks ───────────────────────────────────────────────────────

	// Fixed-rate simulation (20 Hz). No DOM writes. Override in subclasses for AI/physics.
	tickUpdate(tickDelta) {
		const now = SimClock.now();
		for (const [id, time] of this.interactionState.interactionTimes) {
			if (now - time >= this.interactionState.cooldown) {
				this.interactionState.activeInteractions.delete(id);
				this.interactionState.interactionTimes.delete(id);
			}
		}

		// Regrow picked flowers once the deadline passes (clears the visual class)
		if (this._deflowerClearAt != null && SimClock.now() >= this._deflowerClearAt) {
			this.clearDeflowered();
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
		this.computeShadowVisual();
		this.markPositionDirty();
	}
}

applyEntityMixin(MapObject);
