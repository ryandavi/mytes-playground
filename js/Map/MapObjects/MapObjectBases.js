const withDirectional = (BaseClass) => class extends BaseClass {
    constructor(parent, type, variant, posX, posY, config = {}, options = {}) {
        const direction = options.direction || config.direction || 'S';
        const processedConfig = MapObject.processDirectionConfig(config, direction);
        super(parent, type, variant, posX, posY, processedConfig, options);
        this.facingDirection = processedConfig.facingDirection || direction;
    }

    getBaseCssClass() {
        return null;
    }

    applyDirectionalVisuals(element) {
        const baseClass = this.getBaseCssClass();
        if (baseClass) {
            element.classList.add(baseClass);
        }

        element.classList.add(`facing-${this.facingDirection.toLowerCase()}`);

        const spriteElement = element.querySelector('.sprite');
        const transformStyle = this.getConfig('transformStyle', '');
        if (spriteElement && transformStyle) {
            spriteElement.style.transform = transformStyle;
        }

        if (this.getConfig('debug', false)) {
            const interactionRegion = this.getLocalRegionRect?.('interaction');
            if (!interactionRegion) {
                return element;
            }
            const interactiveZone = document.createElement('div');
            interactiveZone.classList.add('interactive-zone', 'debug-visible');
            interactiveZone.style.width = `${interactionRegion.width}px`;
            interactiveZone.style.height = `${interactionRegion.height}px`;
            interactiveZone.style.left = `${interactionRegion.x}px`;
            interactiveZone.style.top = `${interactionRegion.y}px`;
            element.appendChild(interactiveZone);
        }

        return element;
    }

    render(container, parent) {
        const element = super.render(container, parent);
        return this.applyDirectionalVisuals(element);
    }
};

class DirectionalMapObject extends withDirectional(MapObject) {}

// Uses withAnimation directly rather than the named AnimatedMapObject class,
// removing one level from the inheritance chain.
class DirectionalAnimatedMapObject extends withDirectional(withAnimation(MapObject)) {}

class InteractiveMapObject extends withAnimation(MapObject) {
    getInteractionActor() {
        return this.activeMyte;
    }

    shouldSelectOnPress() {
        return true;
    }

    getApproachActionId() {
        return 'go_to_object';
    }

    // 'side'     — stop at the nearest horizontal side (default)
    // 'adjacent' — stop just outside, no overlap (flowers, fountains)
    // 'center'   — walk into the center (portals)
    // 'front'    — face directly toward the object (doors, NPCs)
    getApproachConfig() {
        return this.getConfig('approachConfig', null);
    }

    getApproachMode() {
        return 'side';
    }

    enqueueApproach(myte, onComplete = null, options = {}) {
        if (!myte?.queue) return false;

        const payload = {
            target: this,
            ...options
        };
        if (onComplete) {
            payload.onComplete = onComplete;
        }

        myte.queue.add(this.getApproachActionId(), payload);
        return true;
    }

    runInteractionWhenInRange(action, myte = this.getInteractionActor(), options = {}) {
        if (!myte || typeof action !== 'function') return false;

        if (this.shouldSelectOnPress()) {
            this.selectInUi();
        }

        const {
            interactionRadius = this.getInteractionRadius(),
            queueIfOutOfRange = true,
            allowUnlimitedRange = interactionRadius === -1,
            queueVerb = null,
            userInitiated = false,
            postActionIdleDuration = 0
        } = options;
        const resolvedQueueVerb = queueVerb || (userInitiated ? this.getBestInteractionAction?.(myte)?.label ?? null : null);

        const wrappedAction = (m) => {
            action(m);
            if (postActionIdleDuration > 0) {
                m.queue?.addIdle(postActionIdleDuration);
            }
        };

        if (allowUnlimitedRange || this.isInInteractionRange(myte, interactionRadius)) {
            wrappedAction(myte);
            return true;
        }

        if (!queueIfOutOfRange) return false;
        return this.enqueueApproach(myte, () => wrappedAction(myte), {
            queueVerb: resolvedQueueVerb,
            userInitiated
        });
    }
}

class StatefulMapObject extends InteractiveMapObject {
    constructor(parent, type, variant, posX, posY, config = {}, options = {}) {
        super(parent, type, variant, posX, posY, config, options);
        this.state = options.initialState ?? this.getDefaultState();
    }

    getDefaultState() {
        return this.getDefaultVisualState('default');
    }

    getStateAttributeName() {
        return 'data-state';
    }

    getAnimationSequence(state) {
        return [state, state];
    }

    updateElementState(value = this.state) {
        if (!this.element) return;
        this.element.setAttribute(this.getStateAttributeName(), value);
    }

    transitionToState(nextState, options = {}) {
        const {
            beforeChange,
            afterChange
        } = options;

        if (typeof beforeChange === 'function') {
            beforeChange(nextState, this.state);
        }

        this.state = nextState;
        this.updateElementState();

        const [firstAnim, secondAnim] = this.getAnimationSequence(nextState);
        this.playAnimation(firstAnim, () => {
            this.playAnimation(secondAnim);
            if (typeof afterChange === 'function') {
                afterChange(nextState);
            }
        });
    }

    render(container, parent) {
        const element = super.render(container, parent);
        this.updateElementState();
        return element;
    }
}

class ToggleableMapObject extends StatefulMapObject {
    getEnabledState() {
        return 'on';
    }

    getDisabledState() {
        return 'off';
    }

    isEnabled() {
        return this.state === this.getEnabledState();
    }

    getAnimationSequence(state) {
        if (state === this.getEnabledState()) {
            return ['turnOn', 'idle'];
        }

        if (state === this.getDisabledState()) {
            return ['turnOff', 'off'];
        }

        return super.getAnimationSequence(state);
    }

    toggleState(options = {}) {
        const nextState = this.isEnabled()
            ? this.getDisabledState()
            : this.getEnabledState();

        const soundType = nextState === this.getEnabledState() ? 'on' : 'off';
        const { beforeChange, ...restOptions } = options;

        this.transitionToState(nextState, {
            ...restOptions,
            beforeChange: (...args) => {
                this.playConfiguredSound(soundType);
                if (typeof beforeChange === 'function') {
                    beforeChange(...args);
                }
            }
        });
        return nextState;
    }
}

class MultiStateMapObject extends StatefulMapObject {
    getDefaultState() {
        return this.getDefaultVisualState(super.getDefaultState());
    }

    getStateClassNames() {
        return [];
    }

    updateElementState(value = this.state) {
        if (!this.element) return;

        const stateClasses = this.getStateClassNames();
        if (stateClasses.length) {
            this.element.classList.remove(...stateClasses);
        }

        this.element.classList.add(value);
    }

    playStateTransition(transitionState, finalState, options = {}) {
        const {
            beforeChange,
            afterChange,
            transitionAnimation = transitionState,
            finalAnimation = finalState
        } = options;

        if (typeof beforeChange === 'function') {
            beforeChange(finalState, this.state, transitionState);
        }

        this.state = transitionState;
        this.updateElementState();

        this.playAnimation(transitionAnimation, () => {
            this.state = finalState;
            this.updateElementState();
            this.playAnimation(finalAnimation);

            if (typeof afterChange === 'function') {
                afterChange(finalState, transitionState);
            }
        });

        return true;
    }
}

class OpenableMapObject extends DirectionalAnimatedMapObject {
    constructor(parent, type, variant, posX, posY, config = {}, options = {}) {
        super(parent, type, variant, posX, posY, config, options);
        this.isOpen = options.isOpen ?? this.getDefaultVisualState('closed') === 'open';
        this.isAnimating = false;
        this.updateCollisionState();
    }

    getToggleEventName() {
        return null;
    }

    getToggleStateClassMap() {
        return {
            open: 'open',
            closed: 'closed'
        };
    }

    getOpenAnimationName() {
        return 'opening';
    }

    getCloseAnimationName() {
        return 'closing';
    }

    getOpenLoopAnimationName() {
        return 'open';
    }

    getClosedLoopAnimationName() {
        return 'closed';
    }

    refreshGridOccupancy() {
        if (!this.gameMap?.gridSystem) return;
        this.gameMap.gridSystem.removeObject(this);
        this.gameMap.gridSystem.addObject(this);
    }

    updateCollisionState() {
        this.config.physics.walkable = this.isOpen;
        this.config.physics.collision = !this.isOpen;
        this.refreshGridOccupancy();
        this.applyOpenStateClasses();
    }

    applyOpenStateClasses() {
        if (!this.element) return;

        const { open, closed } = this.getToggleStateClassMap();
        this.element.classList.toggle(open, this.isOpen);
        this.element.classList.toggle(closed, !this.isOpen);
    }

    emitToggleEvent(state) {
        const eventName = this.getToggleEventName();
        if (!eventName || !this.gameMap?.eventManager) return;

        this.gameMap.eventManager.emit(eventName, {
            object: this,
            state,
            position: { x: this.posX, y: this.posY }
        });
    }

    onOpened(_context = {}) {}

    onClosed(_context = {}) {}

    onOpenStateChanged(_context = {}) {}

    open(openContext = {}) {
        if (this.isOpen || this.isAnimating) return false;

        this.isAnimating = true;
        this.playConfiguredSound('open');
        this.playAnimation(this.getOpenAnimationName(), () => {
            this.isOpen = true;
            this.isAnimating = false;
            this.updateCollisionState();
            this.onOpened(openContext);

            const loopAnimation = this.getOpenLoopAnimationName();
            if (this.hasAnimation(loopAnimation)) {
                this.playAnimation(loopAnimation);
            }

            this.emitToggleEvent('open');
            this.onOpenStateChanged(openContext);
        });

        return true;
    }

    close(closeContext = {}) {
        if (!this.isOpen || this.isAnimating) return false;

        this.isAnimating = true;
        this.playConfiguredSound('close');
        this.playAnimation(this.getCloseAnimationName(), () => {
            this.isOpen = false;
            this.isAnimating = false;
            this.updateCollisionState();
            this.onClosed(closeContext);

            const loopAnimation = this.getClosedLoopAnimationName();
            if (this.hasAnimation(loopAnimation)) {
                this.playAnimation(loopAnimation);
            }

            this.emitToggleEvent('closed');
            this.onOpenStateChanged(closeContext);
        });

        return true;
    }

    toggle(toggleContext = {}) {
        return this.isOpen ? this.close(toggleContext) : this.open(toggleContext);
    }

    press(interactor) {
        if (this.isAnimating) return false;
        this.toggle();
        super.press(interactor);
        return true;
    }

    render(container, parent) {
        const element = super.render(container, parent);
        this.applyOpenStateClasses();
        return element;
    }
}

// Mixin for objects that emit a passive aura affecting nearby mytes.
// Subclasses override isAuraActive(), getAuraExpression(), getAuraExpressionChance().
// Config keys read from types.json: aura.radius, aura.checkInterval, auraBuffId, auraBuffDefinition.
const withAura = (BaseClass) => class extends BaseClass {
    constructor(...args) {
        super(...args);
        this._auraAccumulator = 0;
        this._auraInterval = this.getConfig('aura.checkInterval', SiteConfig.objects.aura.proximityInterval);
    }

    getAuraRadius() {
        return this.getConfig('aura.radius', SiteConfig.objects.aura.defaultRadius);
    }

    getBuffContextKey() {
        return `${this.type.toLowerCase()}:${this.id ?? `${this.posX},${this.posY}`}:aura`;
    }

    // Return false to deactivate the aura without removing the buff.
    isAuraActive() {
        return typeof this.isEnabled === 'function' ? this.isEnabled() : true;
    }

    // Return an expression id to occasionally emit while a myte is in range, or null for none.
    getAuraExpression() {
        return null;
    }

    getAuraExpressionChance() {
        return 0;
    }

    syncAuraBuff(myte, active) {
        myte?.buffs?.syncContextBuff?.(
            this.getBuffContextKey(),
            this.getConfig('auraBuffDefinition', null) ?? this.getConfig('auraBuffId', null),
            {
                active,
                source: 'aura',
                payload: { objectType: this.type, objectId: this.id }
            }
        );
    }

    checkNearbyMytes() {
        const mytes = this.mytes;
        if (!mytes.length) return;

        const auraActive = this.isAuraActive();
        const radius = this.getAuraRadius();
        const expression = this.getAuraExpression();
        const expressionChance = expression ? this.getAuraExpressionChance() : 0;

        mytes.forEach(myte => {
            if (!myte?.isActive) {
                this.syncAuraBuff(myte, false);
                return;
            }

            const inRange = auraActive && this.getDistanceTo(myte) <= radius;
            this.syncAuraBuff(myte, inRange);

            if (inRange && expression && Math.random() < expressionChance) {
                myte.queue.addExpression(expression);
            }
        });
    }

    tickUpdate(tickDelta) {
        super.tickUpdate(tickDelta);
        this._auraAccumulator += tickDelta;
        if (this._auraAccumulator >= this._auraInterval) {
            this._auraAccumulator = 0;
            this.checkNearbyMytes();
        }
    }
};

const withConnectable = (BaseClass) => class extends BaseClass {
    constructor(parent, type, variant, posX, posY, config = {}, options = {}) {
        super(parent, type, variant, posX, posY, config, options);
        this.connectedObjectIds = new Set();

        if (this.getConfig('autoConnect', true)) {
            this.connectToNearbyObjects();
        }
    }

    getConnectableTypes() {
        return ['FENCE', 'GATE'];
    }

    getConnectionRadius() {
        return this.getConfig('connectionRadius', 40);
    }

    canConnectTo(object) {
        return object &&
            object !== this &&
            this.getConnectableTypes().includes(object.type) &&
            object.active;
    }

    getNearbyConnectableObjects() {
        if (!this.gameMap) return [];
        return this.gameMap.getObjectsInRadius(this.posX, this.posY, this.getConnectionRadius())
            .filter(obj => this.canConnectTo(obj));
    }

    connectToObject(object) {
        if (!this.canConnectTo(object)) return false;
        this.connectedObjectIds.add(object.id);
        object.addConnectedObject?.(this.id);
        return true;
    }

    connectToNearbyObjects() {
        this.getNearbyConnectableObjects().forEach(obj => this.connectToObject(obj));
    }

    addConnectedObject(objectId) {
        this.connectedObjectIds.add(objectId);
    }

    removeConnectedObject(objectId) {
        this.connectedObjectIds.delete(objectId);
    }

    disconnectFromConnectedObjects() {
        if (!this.gameMap) return;

        this.connectedObjectIds.forEach(objectId => {
            const object = this.gameMap.getObjectById?.(objectId);
            object?.removeConnectedObject?.(this.id);
        });
    }

    remove() {
        this.disconnectFromConnectedObjects();
        super.remove();
    }
};

class LinkedOpenableMapObject extends withConnectable(OpenableMapObject) {
    getConnectableTypes() {
        return ['FENCE'];
    }
}

// ── withItemDrops ─────────────────────────────────────────────────────────────
// Mixin for objects that spawn DroppedMapItem instances (plants, chests, trees).
// Moved out of MapObject so only declaring classes carry the ~200-line weight.
// Apply: class Foo extends withItemDrops(BaseClass) { ... }
const withItemDrops = (Base) => class extends Base {
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
        const halfDepth = facing.x !== 0 ? (rect.width / 2) : (rect.height / 2);
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
        const resolvedIndex = Utility.clamp(Math.round(Number(index) || 0), 0, resolvedCount - 1);
        const midpoint = (resolvedCount - 1) / 2;
        return (resolvedIndex - midpoint) / Math.max(midpoint, 0.5);
    }

    getItemPopOutMotion({
        distance, verticalLift, forwardTravelDistance, forwardSpeed, forwardVariance,
        spreadDistance, spreadSpeed, spreadIndex, spreadCount, lateralSpeed,
        lateralSpawnDistance, lateralBias = null, verticalSpeed, verticalVariance, airDrag
    } = {}) {
        const defaults = this.getDefaultItemPopOutMotionOptions();
        const forward = this.getFacingVector();
        const lateral = { x: -forward.y, y: forward.x };
        const resolvedDistance = Number.isFinite(Number(distance)) ? Number(distance) : defaults.distance;
        const resolvedVerticalLift = Number.isFinite(Number(verticalLift)) ? Number(verticalLift) : defaults.verticalLift;
        const resolvedForwardTravelDistance = Number.isFinite(Number(forwardTravelDistance)) ? Number(forwardTravelDistance) : defaults.forwardTravelDistance;
        const resolvedForwardVariance = Number.isFinite(Number(forwardVariance)) ? Number(forwardVariance) : defaults.forwardVariance;
        const resolvedSpreadDistance = Number.isFinite(Number(spreadDistance)) ? Number(spreadDistance)
            : (Number.isFinite(Number(lateralSpawnDistance)) ? Number(lateralSpawnDistance) : defaults.spreadDistance);
        const resolvedSpreadSpeed = Number.isFinite(Number(spreadSpeed)) ? Number(spreadSpeed)
            : (Number.isFinite(Number(lateralSpeed)) ? Number(lateralSpeed) : defaults.spreadSpeed);
        const resolvedSpreadIndex = Number.isFinite(Number(spreadIndex)) ? Number(spreadIndex) : defaults.spreadIndex;
        const resolvedSpreadCount = Number.isFinite(Number(spreadCount)) ? Number(spreadCount) : defaults.spreadCount;
        const bias = lateralBias !== null && lateralBias !== undefined && Number.isFinite(Number(lateralBias))
            ? Utility.clamp(Number(lateralBias), -1, 1)
            : this.getItemPopOutSpreadBias(resolvedSpreadIndex, resolvedSpreadCount);
        const resolvedVerticalSpeed = Number.isFinite(Number(verticalSpeed)) ? Number(verticalSpeed) : defaults.verticalSpeed;
        const resolvedVerticalVariance = Number.isFinite(Number(verticalVariance)) ? Number(verticalVariance) : defaults.verticalVariance;
        const resolvedAirDrag = Number.isFinite(Number(airDrag)) ? Utility.clamp(Number(airDrag), 0, 0.999) : defaults.airDrag;
        const spawnPoint = this.getFrontDropSpawnPoint({ distance: resolvedDistance, verticalLift: resolvedVerticalLift });
        const effectiveGravity = 0.5;
        const estimatedAirborneFrames = Math.max(1, Math.round(((resolvedVerticalSpeed + (resolvedVerticalVariance * 0.5)) * 2) / effectiveGravity));
        const dragDistanceFactor = resolvedAirDrag > 0 && resolvedAirDrag < 0.999
            ? (1 - Math.pow(resolvedAirDrag, estimatedAirborneFrames)) / (1 - resolvedAirDrag)
            : estimatedAirborneFrames;
        const derivedForwardSpeed = resolvedForwardTravelDistance / Math.max(dragDistanceFactor, 0.001);
        const resolvedForwardSpeed = Number.isFinite(Number(forwardSpeed)) ? Number(forwardSpeed)
            : (Number.isFinite(Number(defaults.forwardSpeed)) ? Number(defaults.forwardSpeed) : derivedForwardSpeed);
        const forwardMagnitude = resolvedForwardSpeed + (Math.random() * resolvedForwardVariance);

        // Fan spread: half-angle grows with item count so a single item flies straight.
        const fanHalfAngleDeg = resolvedSpreadCount > 1 ? Math.min(60, 15 + (resolvedSpreadCount - 1) * 15) : 0;
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
        type = null, variant = null, quantity = 1, inventoryType = null,
        inventoryVariant = null, inventoryName = null, description = '', motion = null, motionOptions = {}
    } = {}) {
        const resolvedVariant = ItemRegistry.resolveIdSync(variant) || variant;
        const itemDefinition = ItemRegistry.getItemSync(resolvedVariant);
        const resolvedType = String(inventoryType || type || itemDefinition?.type || 'ITEM').toUpperCase();
        const resolvedMotion = motion ?? this.getItemPopOutMotion(motionOptions);
        const dropped = new DroppedMapItem(this.gameMap, resolvedType, resolvedVariant, resolvedMotion.spawnX, resolvedMotion.spawnY);
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

    spawnDroppedInventoryItem(itemConfig = {}, { parent = null, layer = null, localCollection = null } = {}) {
        const foregroundLayer = layer || this.getDroppedItemsLayer(parent);
        if (!foregroundLayer) return null;
        const dropped = this.createDroppedInventoryItem(itemConfig);
        if (!dropped?.element) return null;
        foregroundLayer.appendChild(dropped.element);
        if (Array.isArray(localCollection)) localCollection.push(dropped);
        if (!this.gameMap?.droppedItems?.includes(dropped)) this.gameMap?.droppedItems?.push(dropped);
        return dropped;
    }

    spawnDroppedInventoryItems(itemConfigs = [], { parent = null, layer = null, localCollection = null, motionOptions = {} } = {}) {
        const entries = Array.isArray(itemConfigs) ? itemConfigs.filter(Boolean) : [itemConfigs].filter(Boolean);
        const totalCount = entries.length;
        return entries.map((itemConfig, index) => this.spawnDroppedInventoryItem({
            ...itemConfig,
            motionOptions: { ...motionOptions, ...(itemConfig?.motionOptions ?? {}), spreadIndex: index, spreadCount: totalCount }
        }, { parent, layer, localCollection })).filter(Boolean);
    }

    pruneDroppedItemCollection(collection = []) {
        if (!Array.isArray(collection)) return [];
        return collection.filter(item => !!item && item.active && !item.collected);
    }

    // Rolls a weighted drop table. dropTable entries: { type, variant, quantity, chance }
    _rollDrops(dropTable, minYield, maxYield) {
        if (!dropTable?.length) return [];
        const quantity = Utility.randomInt(minYield, maxYield);
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
};

// ── withPickup ────────────────────────────────────────────────────────
// Mixin for map objects that can be picked up and carried by a Myte.
// Overrides the thin stubs on MapObject with full implementations.
// Apply: class Foo extends withPickup(BaseClass) { ... }
const withPickup = (Base) => class extends Base {
    getPickupRange(myte) {
        const explicitRange = this.getConfig('pickupRange', null);
        if (Number.isFinite(explicitRange)) return explicitRange;
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
            if (Math.hypot(gapX, gapY) <= touchThreshold) return true;
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
            ? { x: pickupRect.left + (pickupRect.width / 2), y: pickupRect.top + (pickupRect.height / 2) }
            : this.getCenterPoint?.() ?? { x: this.posX + this.size.width / 2, y: this.posY + this.size.height / 2 };
        return Math.hypot(objectCenter.x - myteCenter.x, objectCenter.y - myteCenter.y) <= this.getPickupRange(myte);
    }

    getPickupTargetPoint(myte = null) {
        const pickupRect = this.getPickupRect();
        if (pickupRect) return { x: pickupRect.left + (pickupRect.width / 2), y: pickupRect.top + (pickupRect.height / 2) };
        return this.getCenterPoint?.() ?? { x: this.posX + this.size.width / 2, y: this.posY + this.size.height / 2 };
    }

    getCarriedPosition(carrier) {
        return carrier?.getCarriedItemPosition?.(this.size) || { x: this.posX, y: this.posY };
    }

    pickup(myte) {
        if (!this.canBePickedUpBy(myte)) return false;
        this.isPickedUp = true;
        this.carrier = myte;
        this.pendingPickup = false;
        this.container?.relationships?.set?.('carrying', myte, this);
        this.element?.classList.add('picked-up');
        this.syncRenderLayer();
        this.wake();
        this.container?.ui?.setSelected?.(this);
        this.playConfiguredSound?.('pickup');
        return true;
    }

    drop(vx = 0, vy = 0) {
        if (this.carrier) {
            this.container?.relationships?.clear?.('carrying', this.carrier, this);
        }
        this.isPickedUp = false;
        this.carrier = null;
        this.pendingPickup = false;
        this.element?.classList.remove('picked-up');
        this.syncRenderLayer();
        this.gameMap?.gridSystem?.updateObjectPosition(this);
        this.playConfiguredSound?.('drop');
        return { vx, vy };
    }
};

// ── withFlightSounds ───────────────────────────────────────────────────
// Mixin for airborne ambient creatures that play land/flight sounds.
// Reads from `flightSound` config key (set in constructor mergedConfig or types.json):
//   landSound, landVolume, flySound, flyVolumeBase, flyVolumeScale, flyVolumeMin,
//   flyVolumeMax, speedThreshold, cooldownMin, cooldownVariance
// Apply: class Foo extends withFlightSounds(BaseClass) { ... }
const withFlightSounds = (Base) => class extends Base {
    constructor(...args) {
        super(...args);
        const cfg = this.getConfig('flightSound', {});
        this._flightSoundCooldown = (cfg.cooldownMin ?? 300) + Math.random() * (cfg.cooldownVariance ?? 400);
    }

    tickUpdate(tickDelta) {
        const wasRestingOnTarget = this.isRestingOnTarget;
        super.tickUpdate(tickDelta);
        this._updateFlightSound(tickDelta, wasRestingOnTarget);
    }

    _updateFlightSound(tickDelta, wasRestingOnTarget) {
        this._flightSoundCooldown = Math.max(0, this._flightSoundCooldown - tickDelta);
        const cfg = this.getConfig('flightSound', null);
        if (!cfg) return;
        const soundManager = this.gameMap?.soundManager;
        if (!soundManager) return;
        const currentSpeed = Math.hypot(this.velocity?.x ?? 0, this.velocity?.y ?? 0);

        if (!wasRestingOnTarget && this.isRestingOnTarget) {
            if (cfg.landSound) soundManager.play(cfg.landSound, { volume: cfg.landVolume ?? 0.5 });
            return;
        }

        if (!this.isIdle && !this.isRestingOnTarget && currentSpeed > (cfg.speedThreshold ?? 0.18) && this._flightSoundCooldown <= 0 && cfg.flySound) {
            const speedRatio = currentSpeed / Math.max(this.speed, 0.01);
            const volume = Utility.clamp(
                (cfg.flyVolumeBase ?? 0.35) + speedRatio * (cfg.flyVolumeScale ?? 0.13),
                cfg.flyVolumeMin ?? 0.3,
                cfg.flyVolumeMax ?? 0.5
            );
            soundManager.play(cfg.flySound, { volume });
            this._flightSoundCooldown = (cfg.cooldownMin ?? 300) + Math.random() * (cfg.cooldownVariance ?? 400);
        }
    }
};
