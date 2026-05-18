class DirectionalMapObject extends MapObject {
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

        if (this.getConfig('debug', false) && this.getConfig('interactiveCollider')) {
            const interactiveCollider = this.getConfig('interactiveCollider');
            const interactiveZone = document.createElement('div');
            interactiveZone.classList.add('interactive-zone', 'debug-visible');
            interactiveZone.style.width = `${interactiveCollider.width}px`;
            interactiveZone.style.height = `${interactiveCollider.height}px`;
            interactiveZone.style.left = `${interactiveCollider.offsetX}px`;
            interactiveZone.style.top = `${interactiveCollider.offsetY}px`;
            element.appendChild(interactiveZone);
        }

        return element;
    }

    render(container, parent) {
        const element = super.render(container, parent);
        return this.applyDirectionalVisuals(element);
    }
}

class DirectionalAnimatedMapObject extends AnimatedMapObject {
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

        if (this.getConfig('debug', false) && this.getConfig('interactiveCollider')) {
            const interactiveCollider = this.getConfig('interactiveCollider');
            const interactiveZone = document.createElement('div');
            interactiveZone.classList.add('interactive-zone', 'debug-visible');
            interactiveZone.style.width = `${interactiveCollider.width}px`;
            interactiveZone.style.height = `${interactiveCollider.height}px`;
            interactiveZone.style.left = `${interactiveCollider.offsetX}px`;
            interactiveZone.style.top = `${interactiveCollider.offsetY}px`;
            element.appendChild(interactiveZone);
        }

        return element;
    }

    render(container, parent) {
        const element = super.render(container, parent);
        return this.applyDirectionalVisuals(element);
    }
}

class ToggleableDirectionalAnimatedMapObject extends DirectionalAnimatedMapObject {
    constructor(parent, type, variant, posX, posY, config = {}, options = {}) {
        super(parent, type, variant, posX, posY, config, options);
        this.isOpen = options.isOpen ?? this.getConfig('default', 'closed') === 'open';
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
        this.config.walkable = this.isOpen;
        this.config.collision = !this.isOpen;
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

    playConfiguredSound(type) {
        const soundEffect = this.getConfig(`soundEffects.${type}`);
        if (soundEffect && this.gameMap?.soundManager) {
            this.gameMap.soundManager.play(soundEffect);
        }
    }

    onOpened() {}

    onClosed() {}

    onOpenStateChanged() {}

    open() {
        if (this.isOpen || this.isAnimating) return false;

        this.isAnimating = true;
        this.playAnimation(this.getOpenAnimationName(), () => {
            this.isOpen = true;
            this.isAnimating = false;
            this.updateCollisionState();
            this.onOpened();

            const loopAnimation = this.getOpenLoopAnimationName();
            if (this.hasAnimation(loopAnimation)) {
                this.playAnimation(loopAnimation);
            }

            this.playConfiguredSound('open');
            this.emitToggleEvent('open');
            this.onOpenStateChanged();
        });

        return true;
    }

    close() {
        if (!this.isOpen || this.isAnimating) return false;

        this.isAnimating = true;
        this.playAnimation(this.getCloseAnimationName(), () => {
            this.isOpen = false;
            this.isAnimating = false;
            this.updateCollisionState();
            this.onClosed();

            const loopAnimation = this.getClosedLoopAnimationName();
            if (this.hasAnimation(loopAnimation)) {
                this.playAnimation(loopAnimation);
            }

            this.playConfiguredSound('close');
            this.emitToggleEvent('closed');
            this.onOpenStateChanged();
        });

        return true;
    }

    toggle() {
        return this.isOpen ? this.close() : this.open();
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

const withConnectableBehavior = (BaseClass) => class extends BaseClass {
    constructor(parent, type, variant, posX, posY, config = {}, options = {}) {
        super(parent, type, variant, posX, posY, config, options);
        this.connectedObjectIds = new Set();
        this.connectedFences = this.connectedObjectIds;

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
        if (!this.gameMap?.objects) return [];
        return this.gameMap.objects.filter(obj => this.canConnectTo(obj));
    }

    getDistanceToObjectCenter(object) {
        const myCenterX = this.posX + this.size.width / 2;
        const myCenterY = this.posY + this.size.height / 2;
        const otherCenterX = object.posX + object.size.width / 2;
        const otherCenterY = object.posY + object.size.height / 2;
        return Math.hypot(myCenterX - otherCenterX, myCenterY - otherCenterY);
    }

    connectToObject(object) {
        if (!this.canConnectTo(object)) return false;
        this.connectedObjectIds.add(object.id);

        if (typeof object.addConnectedFence === 'function') {
            object.addConnectedFence(this.id);
        } else if (typeof object.addConnectedObject === 'function') {
            object.addConnectedObject(this.id);
        }

        return true;
    }

    connectToNearbyObjects() {
        const searchRadius = this.getConnectionRadius();
        this.getNearbyConnectableObjects().forEach(object => {
            if (this.getDistanceToObjectCenter(object) <= searchRadius) {
                this.connectToObject(object);
            }
        });
    }

    addConnectedObject(objectId) {
        this.connectedObjectIds.add(objectId);
    }

    addConnectedFence(fenceId) {
        this.addConnectedObject(fenceId);
    }

    removeConnectedObject(objectId) {
        this.connectedObjectIds.delete(objectId);
    }

    removeConnectedFence(fenceId) {
        this.removeConnectedObject(fenceId);
    }

    disconnectFromConnectedObjects() {
        if (!this.gameMap?.objects) return;

        this.connectedObjectIds.forEach(objectId => {
            const object = this.gameMap.objects.find(obj => obj.id === objectId);
            if (!object) return;

            if (typeof object.removeConnectedFence === 'function') {
                object.removeConnectedFence(this.id);
            } else if (typeof object.removeConnectedObject === 'function') {
                object.removeConnectedObject(this.id);
            }
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
