const withDirectionalBehavior = (BaseClass) => class extends BaseClass {
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

class DirectionalMapObject extends withDirectionalBehavior(MapObject) {}

// Uses withAnimation directly rather than the named AnimatedMapObject class,
// removing one level from the inheritance chain.
class DirectionalAnimatedMapObject extends withDirectionalBehavior(withAnimation(MapObject)) {}

class RangeInteractiveAnimatedMapObject extends withAnimation(MapObject) {
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

class StatefulAnimatedMapObject extends RangeInteractiveAnimatedMapObject {
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

class BinaryStateAnimatedMapObject extends StatefulAnimatedMapObject {
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

class ClassStateAnimatedMapObject extends StatefulAnimatedMapObject {
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

class ToggleableDirectionalAnimatedMapObject extends DirectionalAnimatedMapObject {
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
const withAuraBehavior = (BaseClass) => class extends BaseClass {
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

const withConnectableBehavior = (BaseClass) => class extends BaseClass {
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
        if (!this.gameMap?.objects) return;

        this.connectedObjectIds.forEach(objectId => {
            const object = this.gameMap.objects.find(obj => obj.id === objectId);
            object?.removeConnectedObject?.(this.id);
        });
    }

    remove() {
        this.disconnectFromConnectedObjects();
        super.remove();
    }
};

class ConnectableDirectionalMapObject extends withConnectableBehavior(DirectionalMapObject) {
    getConnectableTypes() {
        return ['FENCE', 'GATE'];
    }
}

class ConnectableToggleableDirectionalAnimatedMapObject extends withConnectableBehavior(ToggleableDirectionalAnimatedMapObject) {
    getConnectableTypes() {
        return ['FENCE'];
    }
}
