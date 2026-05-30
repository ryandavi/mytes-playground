// Config is provided by MapObjectFactory after loading canonical map object data.

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
			cooldown: this.getConfig('interaction.cooldown', 5000),
			activeInteractions: new Set(),
			interactionTimes: new Map()
		};
		this.actionOccupancy = new Map();
		this.actionSlotOccupancy = new Map();

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
			sortY: 0,
			zIndex: 0,
			bgPosition: null,
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
		return String(value || '')
			.trim()
			.split(/[_\s-]+/)
			.filter(Boolean)
			.map(part => part.charAt(0).toUpperCase() + part.slice(1))
			.join(' ');
	}

	formatDisplayQuantity(quantity) {
		if (Array.isArray(quantity) && quantity.length >= 2) {
			return `${quantity[0]}-${quantity[1]}`;
		}

		const numericQuantity = Number(quantity);
		if (Number.isFinite(numericQuantity)) {
			return String(numericQuantity);
		}

		return null;
	}

	getDisplayName() {
		const explicitName = this.getConfig('label', null);
		if (typeof explicitName === 'string' && explicitName.trim()) {
			return explicitName.trim();
		}

		const raw = String(this.variant || this.type || 'Object');
		return this.humanizeLabelToken(raw.toLowerCase());
	}

	isSidebarFlowerObject() {
		const name = this.constructor?.name ?? '';
		return name.includes('Flower') ||
			name.includes('Bloom') ||
			this.type?.toUpperCase?.() === 'GRASS' ||
			this.type?.toUpperCase?.() === 'FLOWER';
	}

	getSidebarStatusRows() {
		const rows = [];
		const interactionType = this.getConfig('interaction.type');
		const deflowered = this.getConfig('deflowered', false) === true;

		if (typeof this.isEnabled === 'function') {
			rows.push({ label: 'Enabled', value: this.isEnabled() ? 'Yes' : 'No' });
		}

		if (this.isMusicSource?.() && typeof this.isActiveMusicSource === 'function') {
			rows.push({ label: 'Music Active', value: this.isActiveMusicSource() ? 'Yes' : 'No' });
		}

		if (this.isSidebarFlowerObject()) {
			rows.push(
				{ label: 'Flower Available', value: deflowered ? 'No' : 'Yes' },
				{ label: 'Flower State', value: deflowered ? 'Deflowered' : null }
			);
		}

		if (this.growthStage != null) {
			rows.push({ label: 'Stage', value: this.growthStage });
		}

		if (typeof this.isReadyToHarvest === 'function') {
			rows.push({ label: 'Ready to Harvest', value: this.isReadyToHarvest() ? 'Yes' : 'No' });
		}

		if (this.isWatered != null) {
			rows.push({ label: 'Watered', value: this.isWatered ? 'Yes' : 'No' });
		}

		if (typeof this.canWater === 'function' && !this.isWatered) {
			rows.push({ label: 'Needs Water', value: this.canWater() ? 'Yes' : 'No' });
		}

		if (this.pollinationState != null) {
			rows.push({ label: 'Pollination', value: this.pollinationState });
		}

		if (typeof this.isEnabled !== 'function' && rows.length === 0 && interactionType) {
			rows.push({ label: 'Interaction', value: interactionType });
		}

		return rows;
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

	getFiniteConfigNumber(path, defaultValue = null) {
		const value = this.getConfig(path, undefined);
		if (value === undefined || value === null || value === '') {
			return defaultValue;
		}

		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : defaultValue;
	}

	getRegionConfig(regionId = 'collider') {
		const normalizedRegionId = this.normalizeRegionId(regionId);
		const canonicalRegion = this.getConfig(`spatial.regions.${normalizedRegionId}`, undefined);
		if (canonicalRegion !== undefined) {
			return canonicalRegion;
		}

		switch (normalizedRegionId) {
			case 'interaction':
				return this.getConfig('interactionRegion', null);
			case 'select':
				return this.getConfig('selectbox', null);
			case 'hit':
				return this.getConfig('hitbox', null);
			case 'pickup':
				return this.getConfig('pickupbox', null);
			case 'collider':
			default:
				return this.getConfig('physics.collider', null);
		}
	}

	getRegionRect(regionId = 'collider') {
		const region = this.getRegionConfig(regionId);
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

	getLocalRegionRect(regionId = 'collider') {
		const region = this.getRegionConfig(regionId);
		if (!region) {
			return null;
		}

		const x = region.x ?? region.offsetX ?? 0;
		const y = region.y ?? region.offsetY ?? 0;
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

	getActionConfig(actionId, defaultValue = null) {
		if (!actionId) {
			return defaultValue;
		}

		return this.getConfig(`actionConfigs.${actionId}`, defaultValue);
	}

	getApproachConfig(actionId = null) {
		const actionConfig = actionId ? this.getActionConfig(actionId, null) : null;
		if (actionConfig && Object.prototype.hasOwnProperty.call(actionConfig, 'approachConfig')) {
			return actionConfig.approachConfig;
		}

		return this.getConfig('approachConfig', null);
	}

	getActionSlotDefinitions(actionId) {
		const actionConfig = this.getActionConfig(actionId, {}) ?? {};
		const facing = this.getConfig('facingDirection', this.facingDirection ?? 'S');
		let slots = [];

		if (Array.isArray(actionConfig.slots)) {
			slots = actionConfig.slots;
		} else if (actionConfig.slotsByFacing && typeof actionConfig.slotsByFacing === 'object') {
			slots = actionConfig.slotsByFacing[facing] ??
				actionConfig.slotsByFacing.default ??
				[];
		}

		if (!Array.isArray(slots) || slots.length === 0) {
			const mytePosition = this.getConfig('mytePosition', null);
			if (!mytePosition) return [];
			return [{
				id: 'default',
				restPosition: mytePosition,
				restFacing: this.getConfig('myteFacing', null) ?? undefined
			}];
		}

		return slots.map((slot, index) => ({
			id: slot?.id ?? `${actionId}_slot_${index}`,
			...slot
		}));
	}

	// ── Direction helpers ─────────────────────────────────────────────────────

	static processDirectionConfig(baseConfig, direction) {
		const config = JSON.parse(JSON.stringify(baseConfig));
		if (!config.directionConfigs) return config;

		const normalizedDirection = MapObject.normalizeFacingDirection(direction, config.directionConfigs);
		const dirConfig = config.directionConfigs[normalizedDirection];
		if (!dirConfig) return config;

		if (dirConfig.size) config.size = dirConfig.size;
		if (dirConfig.interactionRegion) config.interactionRegion = dirConfig.interactionRegion;
		if (dirConfig.physics) {
			config.physics = MapObjectFactory.deepMerge({}, config.physics || {}, dirConfig.physics);
		}
		if (dirConfig.interaction) {
			config.interaction = MapObjectFactory.deepMerge({}, config.interaction || {}, dirConfig.interaction);
		}
		if (dirConfig.spatial) {
			config.spatial = MapObjectFactory.deepMerge({}, config.spatial || {}, dirConfig.spatial);
		}
		if (dirConfig.visual) {
			config.visual = MapObjectFactory.deepMerge({}, config.visual || {}, dirConfig.visual);
		}

		config.facingDirection = normalizedDirection;
		config.transformStyle = dirConfig.transformStyle || '';

		for (const key in dirConfig) {
			if (!['size', 'interactionRegion', 'transformStyle', 'physics', 'interaction', 'spatial', 'visual'].includes(key)) {
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
		if (this.config.physics?.collider) return this.config.physics.collider;
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
		const interactionType = this.getConfig('interaction.type');

		if (this.isReadyToHarvest?.()) {
			affordances.push({ actionId: 'harvest', purpose: 'harvest', chain: true });
		} else if (this.canWater?.() && (context.energy ?? 1) > 0.4) {
			affordances.push({ actionId: 'water_plant', purpose: 'tend', chain: true });
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
		} else if (interactionType === 'social') {
			affordances.push({ actionId: 'interact_object', purpose: 'socialize' });
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

	getFrontDropSpawnPoint({ distance = 18, verticalLift = 0 } = {}) {
		const rect = this.getColliderRectFor(this) ?? {
			left: this.posX,
			top: this.posY,
			right: this.posX + this.size.width,
			bottom: this.posY + this.size.height,
			width: this.size.width,
			height: this.size.height
		};
		const facing = this.getFacingVector();
		const centerX = rect.left + (rect.width / 2);
		const centerY = rect.top + (rect.height / 2);
		const halfDepth = facing.x !== 0
			? (rect.width / 2)
			: (rect.height / 2);
		const frontOffset = halfDepth + distance;

		return {
			x: centerX + (facing.x * frontOffset),
			y: centerY + (facing.y * frontOffset) - verticalLift
		};
	}

	getDefaultItemPopOutMotionOptions() {
		return {
			distance: 0,
			verticalLift: 8,
			forwardTravelDistance: 226,
			forwardSpeed: null,
			forwardVariance: 4,
			spreadDistance: 8,
			spreadSpeed: 0.5,
			spreadIndex: 0,
			spreadCount: 1,
			lateralSpeed: 0.18,
			lateralSpawnDistance: 2,
			lateralBias: null,
			verticalSpeed: 8.2,
			verticalVariance: 2.1,
			airDrag: 0.92
		};
	}

	getItemPopOutSpreadBias(index = 0, count = 1) {
		const resolvedCount = Math.max(1, Math.round(Number(count) || 1));
		if (resolvedCount <= 1) return 0;

		const resolvedIndex = Utility.clamp(
			Math.round(Number(index) || 0),
			0,
			resolvedCount - 1
		);
		const midpoint = (resolvedCount - 1) / 2;
		return (resolvedIndex - midpoint) / Math.max(midpoint, 0.5);
	}

	getItemPopOutMotion({
		distance,
		verticalLift,
		forwardTravelDistance,
		forwardSpeed,
		forwardVariance,
		spreadDistance,
		spreadSpeed,
		spreadIndex,
		spreadCount,
		lateralSpeed,
		lateralSpawnDistance,
		lateralBias = null,
		verticalSpeed,
		verticalVariance,
		airDrag
	} = {}) {
		const defaults = this.getDefaultItemPopOutMotionOptions();
		const forward = this.getFacingVector();
		const lateral = { x: -forward.y, y: forward.x };
		const resolvedDistance = Number.isFinite(Number(distance)) ? Number(distance) : defaults.distance;
		const resolvedVerticalLift = Number.isFinite(Number(verticalLift)) ? Number(verticalLift) : defaults.verticalLift;
		const resolvedForwardTravelDistance = Number.isFinite(Number(forwardTravelDistance))
			? Number(forwardTravelDistance)
			: defaults.forwardTravelDistance;
		const resolvedForwardVariance = Number.isFinite(Number(forwardVariance)) ? Number(forwardVariance) : defaults.forwardVariance;
		const resolvedSpreadDistance = Number.isFinite(Number(spreadDistance))
			? Number(spreadDistance)
			: (
				Number.isFinite(Number(lateralSpawnDistance))
					? Number(lateralSpawnDistance)
					: defaults.spreadDistance
			);
		const resolvedSpreadSpeed = Number.isFinite(Number(spreadSpeed))
			? Number(spreadSpeed)
			: (
				Number.isFinite(Number(lateralSpeed))
					? Number(lateralSpeed)
					: defaults.spreadSpeed
			);
		const resolvedSpreadIndex = Number.isFinite(Number(spreadIndex)) ? Number(spreadIndex) : defaults.spreadIndex;
		const resolvedSpreadCount = Number.isFinite(Number(spreadCount)) ? Number(spreadCount) : defaults.spreadCount;
		const bias = lateralBias !== null && lateralBias !== undefined && Number.isFinite(Number(lateralBias))
			? Utility.clamp(Number(lateralBias), -1, 1)
			: this.getItemPopOutSpreadBias(resolvedSpreadIndex, resolvedSpreadCount);
		const resolvedVerticalSpeed = Number.isFinite(Number(verticalSpeed)) ? Number(verticalSpeed) : defaults.verticalSpeed;
		const resolvedVerticalVariance = Number.isFinite(Number(verticalVariance)) ? Number(verticalVariance) : defaults.verticalVariance;
		const resolvedAirDrag = Number.isFinite(Number(airDrag))
			? Utility.clamp(Number(airDrag), 0, 0.999)
			: defaults.airDrag;
		const spawnPoint = this.getFrontDropSpawnPoint({
			distance: resolvedDistance,
			verticalLift: resolvedVerticalLift
		});
		const effectiveGravity = 0.5;
		const estimatedAirborneFrames = Math.max(
			1,
			Math.round(((resolvedVerticalSpeed + (resolvedVerticalVariance * 0.5)) * 2) / effectiveGravity)
		);
		const dragDistanceFactor = resolvedAirDrag > 0 && resolvedAirDrag < 0.999
			? (1 - Math.pow(resolvedAirDrag, estimatedAirborneFrames)) / (1 - resolvedAirDrag)
			: estimatedAirborneFrames;
		const derivedForwardSpeed = resolvedForwardTravelDistance / Math.max(dragDistanceFactor, 0.001);
		const resolvedForwardSpeed = Number.isFinite(Number(forwardSpeed))
			? Number(forwardSpeed)
			: (Number.isFinite(Number(defaults.forwardSpeed)) ? Number(defaults.forwardSpeed) : derivedForwardSpeed);
		const forwardMagnitude = resolvedForwardSpeed + (Math.random() * resolvedForwardVariance);

		// Rotate the forward vector by a fan angle so multiple items spread in a cone.
		// Half-angle grows with item count so a single item always flies straight forward.
		const fanHalfAngleDeg = resolvedSpreadCount > 1
			? Math.min(60, 15 + (resolvedSpreadCount - 1) * 15)
			: 0;
		const fanAngleRad = bias * fanHalfAngleDeg * (Math.PI / 180);
		const cos_a = Math.cos(fanAngleRad);
		const sin_a = Math.sin(fanAngleRad);
		const rotatedX = forward.x * cos_a - forward.y * sin_a;
		const rotatedY = forward.x * sin_a + forward.y * cos_a;

		return {
			spawnX: spawnPoint.x + (lateral.x * bias * resolvedSpreadDistance),
			spawnY: spawnPoint.y + (lateral.y * bias * resolvedSpreadDistance),
			velocityX: rotatedX * forwardMagnitude,
			velocityY: rotatedY * forwardMagnitude,
			velocityZ: resolvedVerticalSpeed + (Math.random() * resolvedVerticalVariance),
			airDrag: resolvedAirDrag
		};
	}

	getDroppedItemsLayer(parent = null) {
		return this.gameMap?.layers?.objects || parent?.canvas?.querySelector('.layer.foreground') || null;
	}

	createDroppedInventoryItem({
		type = null,
		variant = null,
		quantity = 1,
		inventoryType = null,
		inventoryVariant = null,
		inventoryName = null,
		description = '',
		motion = null,
		motionOptions = {}
	} = {}) {
		const resolvedVariant = ItemRegistry.resolveIdSync(variant) || variant;
		const itemDefinition = ItemRegistry.getItemSync(resolvedVariant);
		const resolvedType = String(
			inventoryType ||
			type ||
			itemDefinition?.type ||
			'ITEM'
		).toUpperCase();
		const resolvedMotion = motion ?? this.getItemPopOutMotion(motionOptions);
		const dropped = new DroppedMapItem(
			this.gameMap,
			resolvedType,
			resolvedVariant,
			resolvedMotion.spawnX,
			resolvedMotion.spawnY
		);

		dropped.quantity = Math.max(1, Number(quantity) || 1);
		dropped.inventoryType = resolvedType;
		dropped.inventoryVariant = inventoryVariant || itemDefinition?.id || resolvedVariant;
		dropped.inventoryName = inventoryName || itemDefinition?.name || dropped.inventoryVariant;
		dropped.description = description || itemDefinition?.description || '';
		dropped.velocityX = resolvedMotion.velocityX ?? 0;
		dropped.velocityY = resolvedMotion.velocityY ?? 0;
		dropped.velocityZ = resolvedMotion.velocityZ ?? 0;
		dropped.airDrag = resolvedMotion.airDrag ?? dropped.airDrag ?? 0.86;

		return dropped;
	}

	spawnDroppedInventoryItem(itemConfig = {}, {
		parent = null,
		layer = null,
		localCollection = null
	} = {}) {
		const foregroundLayer = layer || this.getDroppedItemsLayer(parent);
		if (!foregroundLayer) {
			return null;
		}

		const dropped = this.createDroppedInventoryItem(itemConfig);
		if (!dropped?.element) {
			return null;
		}

		foregroundLayer.appendChild(dropped.element);

		if (Array.isArray(localCollection)) {
			localCollection.push(dropped);
		}
		if (!this.gameMap?.droppedItems?.includes(dropped)) {
			this.gameMap?.droppedItems?.push(dropped);
		}

		return dropped;
	}

	spawnDroppedInventoryItems(itemConfigs = [], {
		parent = null,
		layer = null,
		localCollection = null,
		motionOptions = {}
	} = {}) {
		const entries = Array.isArray(itemConfigs)
			? itemConfigs.filter(Boolean)
			: [itemConfigs].filter(Boolean);
		const totalCount = entries.length;

		return entries.map((itemConfig, index) => this.spawnDroppedInventoryItem({
			...itemConfig,
			motionOptions: {
				...motionOptions,
				...(itemConfig?.motionOptions ?? {}),
				spreadIndex: index,
				spreadCount: totalCount
			}
		}, {
			parent,
			layer,
			localCollection
		})).filter(Boolean);
	}

	pruneDroppedItemCollection(collection = []) {
		if (!Array.isArray(collection)) {
			return [];
		}

		return collection.filter(item => !!item && item.active && !item.collected);
	}

	// Rolls a weighted drop table and returns an array of drop results.
	// dropTable entries: { type, variant, quantity, chance }
	// chance values form a cumulative probability; if omitted, uniform distribution is used.
	_rollDrops(dropTable, minYield, maxYield) {
		if (!dropTable?.length) return [];

		const quantity = Math.floor(Math.random() * (maxYield - minYield + 1)) + minYield;
		const results = [];

		for (let i = 0; i < quantity; i++) {
			const roll = Math.random();
			let cumulative = 0;
			for (const drop of dropTable) {
				cumulative += drop.chance ?? 1 / dropTable.length;
				if (roll <= cumulative) {
					results.push({ type: drop.type, variant: drop.variant, quantity: drop.quantity ?? 1 });
					break;
				}
			}
		}

		return results;
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

	getPickupRange(myte) {
		const explicitRange = this.getConfig('pickupRange', null);
		if (Number.isFinite(explicitRange)) {
			return explicitRange;
		}

		const myteReach = Math.max(myte?.collider?.width ?? 0, myte?.collider?.height ?? 0) * 0.5;
		const pickupRect = this.getPickupRect() || this.getRegionRect('collider');
		const objectReach = Math.max(pickupRect?.width ?? 0, pickupRect?.height ?? 0) * 0.5;
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
		const myteRect = this.getColliderRectFor(myte);
		const pickupRect = this.getPickupRect() || this.getRegionRect('collider');
		if (pickupRect && myteRect) {
			const gapX = Math.max(0, pickupRect.left - myteRect.right, myteRect.left - pickupRect.right);
			const gapY = Math.max(0, pickupRect.top - myteRect.bottom, myteRect.top - pickupRect.bottom);
			if (Math.hypot(gapX, gapY) <= touchThreshold) {
				return true;
			}
		} else if (this.getColliderGapTo(myte) <= touchThreshold) {
			return true;
		}

		const myteCenter = typeof myte.getCenterPoint === 'function'
			? myte.getCenterPoint('collider')
			: {
				x: myte.posX + (myte.collider?.offsetX ?? 0) + ((myte.collider?.width ?? myte.size.width) / 2),
				y: myte.posY + (myte.collider?.offsetY ?? 0) + ((myte.collider?.height ?? myte.size.height) / 2)
			};
		const objectCenter = pickupRect
			? {
				x: pickupRect.left + (pickupRect.width / 2),
				y: pickupRect.top + (pickupRect.height / 2)
			}
			: this.getCenterPoint();
		return Math.hypot(objectCenter.x - myteCenter.x, objectCenter.y - myteCenter.y) <= this.getPickupRange(myte);
	}

	getPickupTargetPoint(myte = null) {
		const pickupRect = this.getPickupRect();
		if (pickupRect) {
			return {
				x: pickupRect.left + (pickupRect.width / 2),
				y: pickupRect.top + (pickupRect.height / 2)
			};
		}

		return this.getCenterPoint();
	}

	getCarriedPosition(carrier) {
		return carrier?.getCarriedItemPosition?.(this.size) || {
			x: this.posX,
			y: this.posY
		};
	}

	resolveDepthOffset() {
		const explicitDepthLine = this.getFiniteConfigNumber('visual.depthLine', null);
		if (Number.isFinite(explicitDepthLine)) {
			return explicitDepthLine;
		}

		const explicitDepthOffset = this.getFiniteConfigNumber('visual.depthOffset', null);
		if (Number.isFinite(explicitDepthOffset)) {
			return explicitDepthOffset;
		}

		const colliderBottom = (this.collider?.offsetY ?? 0) + (this.collider?.height ?? 0);
		if (this.getConfig('physics.collision', false) && colliderBottom > 0) {
			return colliderBottom;
		}

		return this.size.height;
	}

	getSortY(y = this.posY) {
		const resolvedY = Number.isFinite(y) ? y : this.posY;
		return resolvedY + this.resolveDepthOffset();
	}

	getDepthPriority() {
		const explicitPriority = this.getFiniteConfigNumber('visual.depthPriority', null);
		if (Number.isFinite(explicitPriority)) {
			return explicitPriority;
		}

		return this.getFiniteConfigNumber('visual.renderPriority', 0);
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

		if (this.parent?.getDepthZIndex) {
			return this.parent.getDepthZIndex(this.getSortY(), this.getDepthPriority());
		}

		return this.parent?.getZIndex ? this.parent.getZIndex(this.posY, this.resolveDepthOffset(), this.getDepthPriority()) : 0;
	}

	getRenderLayerKey() {
		return this.getConfig('visual.renderLayer', 'objects');
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

	getActionOccupant(actionId) {
		return actionId ? (this.actionOccupancy.get(actionId) ?? null) : null;
	}

	getActionSlotOccupants(actionId) {
		if (!actionId) {
			return null;
		}

		let slotOccupants = this.actionSlotOccupancy.get(actionId);
		if (!slotOccupants) {
			slotOccupants = new Map();
			this.actionSlotOccupancy.set(actionId, slotOccupants);
		}

		return slotOccupants;
	}

	getActionSlotOccupant(actionId, slotId) {
		if (!actionId || !slotId) {
			return null;
		}

		return this.actionSlotOccupancy.get(actionId)?.get(slotId) ?? null;
	}

	isActionSlotOccupied(actionId, slotId, actor = null) {
		const occupant = this.getActionSlotOccupant(actionId, slotId);
		return !!occupant && occupant !== actor;
	}

	getAvailableActionSlots(actionId, actor = null) {
		return this.getActionSlotDefinitions(actionId)
			.filter(slot => !this.isActionSlotOccupied(actionId, slot.id, actor));
	}

	isActionOccupied(actionId, actor = null) {
		const slots = this.getActionSlotDefinitions(actionId);
		if (slots.length > 0) {
			return this.getAvailableActionSlots(actionId, actor).length === 0;
		}

		const occupant = this.getActionOccupant(actionId);
		return !!occupant && occupant !== actor;
	}

	claimActionSlot(actionId, slotId, actor = null) {
		if (!actionId || !slotId) {
			return false;
		}

		const slots = this.getActionSlotDefinitions(actionId);
		if (!slots.some(slot => slot.id === slotId)) {
			return false;
		}

		const occupant = this.getActionSlotOccupant(actionId, slotId);
		if (occupant && occupant !== actor) {
			return false;
		}

		if (actor) {
			this.getActionSlotOccupants(actionId).set(slotId, actor);
		}

		return true;
	}

	claimActionOccupancy(actionId, actor = null) {
		if (!actionId) {
			return true;
		}

		if (this.getActionSlotDefinitions(actionId).length > 0) {
			return !this.isActionOccupied(actionId, actor);
		}

		const actionConfig = this.getActionConfig(actionId, {}) ?? {};
		const exclusive = actionConfig.exclusive !== false;
		const occupant = this.getActionOccupant(actionId);

		if (exclusive && occupant && occupant !== actor) {
			return false;
		}

		if (actor) {
			this.actionOccupancy.set(actionId, actor);
		}

		return true;
	}

	releaseActionOccupancy(actionId, actor = null) {
		if (!actionId) {
			return false;
		}

		if (this.getActionSlotDefinitions(actionId).length > 0) {
			let released = false;
			const slotOccupants = this.actionSlotOccupancy.get(actionId);
			if (!slotOccupants) {
				return false;
			}

			for (const [slotId, occupant] of slotOccupants.entries()) {
				if (!actor || occupant === actor) {
					slotOccupants.delete(slotId);
					released = true;
				}
			}

			if (slotOccupants.size === 0) {
				this.actionSlotOccupancy.delete(actionId);
			}

			return released;
		}

		const occupant = this.getActionOccupant(actionId);
		if (!occupant) {
			return false;
		}

		if (actor && occupant !== actor) {
			return false;
		}

		this.actionOccupancy.delete(actionId);
		return true;
	}

	releaseActionSlot(actionId, slotId, actor = null) {
		if (!actionId || !slotId) {
			return false;
		}

		const slotOccupants = this.actionSlotOccupancy.get(actionId);
		if (!slotOccupants) {
			return false;
		}

		const occupant = slotOccupants.get(slotId);
		if (!occupant) {
			return false;
		}

		if (actor && occupant !== actor) {
			return false;
		}

		slotOccupants.delete(slotId);
		if (slotOccupants.size === 0) {
			this.actionSlotOccupancy.delete(actionId);
		}

		return true;
	}

	isInUse(actionId = null) {
		if (actionId) {
			const slotOccupants = this.actionSlotOccupancy.get(actionId);
			return this.getActionOccupant(actionId) != null || (slotOccupants?.size ?? 0) > 0;
		}

		if (this.actionOccupancy.size > 0) {
			return true;
		}

		for (const slotOccupants of this.actionSlotOccupancy.values()) {
			if ((slotOccupants?.size ?? 0) > 0) {
				return true;
			}
		}

		return false;
	}

	// ── Input components ──────────────────────────────────────────────────────

	initializeInputComponents() {
		if (!this.element || !this.parent) return;

		if (this.getConfig('interaction.interactive', true) || this.canShowSelectPointer()) this.initClickComponent();
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
				if (this.getConfig('directionConfigs', null) && SiteConfig.objects.canRotate) {
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
			// The central manager already confirmed event.target belongs to this.element.
			if (event.button !== 0 || !this.active || this.isDragging || !this.canStartSelectModeDrag()) {
				return;
			}
			const rect = this.element?.getBoundingClientRect?.();
			if (!rect) {
				return;
			}
			const isInside =
				event.clientX >= rect.left &&
				event.clientX <= rect.right &&
				event.clientY >= rect.top &&
				event.clientY <= rect.bottom;
			if (!isInside) {
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

		// Register with the central manager (one document listener set for all objects).
		const unregister = MapObjectSelectDragManager.getInstance().register(
			this.element, onMouseDown, onMouseMove, onMouseUp
		);

		this._selectDragCleanup = () => {
			unregister();
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
		if (dirConfig.spatial) {
			this.config.spatial = MapObjectFactory.deepMerge({}, this.config.spatial || {}, dirConfig.spatial);
		}
		if (dirConfig.visual) {
			this.config.visual = MapObjectFactory.deepMerge({}, this.config.visual || {}, dirConfig.visual);
		}
		if (dirConfig.physics) {
			this.config.physics = MapObjectFactory.deepMerge({}, this.config.physics || {}, dirConfig.physics);
		}
		if (dirConfig.interaction) {
			this.config.interaction = MapObjectFactory.deepMerge({}, this.config.interaction || {}, dirConfig.interaction);
		}
		const colliderRegion = this.getRegionConfig('collider');
		if (colliderRegion) {
			this.collider = {
				...colliderRegion,
				offsetX: colliderRegion.x ?? colliderRegion.offsetX ?? 0,
				offsetY: colliderRegion.y ?? colliderRegion.offsetY ?? 0
			};
		}
		this.config.interactionRegion = dirConfig.interactionRegion || null;

		this.config.facingDirection = normalizedDir;
		this.config.transformStyle = dirConfig.transformStyle || '';
		this.config.spriteFrameOffset = dirConfig.spriteFrameOffset || null;

		for (const key in dirConfig) {
			if (!['size', 'collider', 'interactionRegion', 'transformStyle', 'spriteFrameOffset', 'spatial', 'visual'].includes(key)) {
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
		this.updatePosition();
	}

	_rotateDuringDrag() {
		if (!SiteConfig.objects.canRotate) return;
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
			this.gameMap.layers.objects.appendChild(this._dropTargetEl);
		}

		const snappedPos = this.getConfig('snapToGrid', false)
			? gridSystem.snapToGrid(
				this.posX,
				this.posY,
				this.size.width,
				this.size.height,
				gridSystem.config.cellSize,
				{ useCenter: false }
			)
			: { x: this.posX, y: this.posY };

		// Outer container always uses sprite size (grid-aligned)
		this._dropTargetEl.style.width = `${this.size.width}px`;
		this._dropTargetEl.style.height = `${this.size.height}px`;
		this._dropTargetEl.style.left = `${snappedPos.x}px`;
		this._dropTargetEl.style.top = `${snappedPos.y}px`;

		const isValid = this.checkDropValidity(snappedPos.x, snappedPos.y);
		this._dropTargetEl.classList.toggle('is-drop-valid', isValid);
		this._dropTargetEl.classList.toggle('is-drop-invalid', !isValid);

		// Show collider bounds as inner indicator when collider differs from sprite size
		if (this.collider) {
			if (!this._dropTargetColliderEl) {
				this._dropTargetColliderEl = document.createElement('div');
				this._dropTargetColliderEl.className = 'drop-target-collider';
				this._dropTargetEl.appendChild(this._dropTargetColliderEl);
			}
			this._dropTargetColliderEl.style.left = `${this.collider.offsetX ?? 0}px`;
			this._dropTargetColliderEl.style.top = `${this.collider.offsetY ?? 0}px`;
			this._dropTargetColliderEl.style.width = `${this.collider.width ?? this.size.width}px`;
			this._dropTargetColliderEl.style.height = `${this.collider.height ?? this.size.height}px`;
		}

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

		const thisOverlappable = this.getConfig('visual.overlappable', false);
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
						obj => obj !== this && !obj.getConfig('visual.overlappable', false)
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
		this.renderState.dirty = false;
		this.element.dataset.sortY = `${Math.round(this.getSortY() * 100) / 100}`;
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
		this._spriteElement = null;
		container.appendChild(divElement);
		this.captureSpriteBaseStyles();
		this.setBaseSpriteTransform(this.getConfig('transformStyle', ''));
		this.updateShadowVisual();
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
		Object.values(this.inputComponents).forEach(c => c.destroy());
		this.inputComponents = {};
		this._selectDragCleanup?.();
		if (this._dropTargetEl) {
			this._dropTargetEl.remove();
			this._dropTargetEl = null;
			this._dropTargetColliderEl = null;
		}
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

applyEntityMixin(MapObject);
