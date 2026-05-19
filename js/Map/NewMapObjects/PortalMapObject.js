class PortalMapObject extends RangeInteractiveAnimatedMapObject {
    constructor(parent, type, variant, posX, posY, config = {}, options = {}) {
        super(parent, type, variant, posX, posY, config, options);

        this.targetMap = options.targetMap || null;
        this.targetSpawnPoint = options.targetSpawnPoint || 'default';
        this.isActive = options.isActive !== undefined ? options.isActive : true;
        this.activationRadius = options.activationRadius || 75;
        this.transitionDuration = options.transitionDuration || 1000;

        this.isAnimating = false;
        this.particleSystem = null;

        this.initializePortalEffects();
    }

    getInteractionRadius() {
        return this.activationRadius;
    }

    getPortalCooldownDuration() {
        return this.getConfig('portalCooldownDuration', 1500);
    }

    canTransitionMyte(myte) {
        if (!myte) return false;
        if (myte.isDragging) return false;
        return (myte.portalCooldownUntil || 0) <= Date.now();
    }

    getExitPositionFor(myte) {
        const myteWidth = myte?.size?.width || 0;
        const myteHeight = myte?.size?.height || 0;
        const exitOffset = Math.max(this.activationRadius + 16, this.size.height + 8);

        return {
            x: this.posX + (this.size.width / 2) - (myteWidth / 2),
            y: this.posY + exitOffset - (myteHeight / 2)
        };
    }

    initializePortalEffects() {
        if (this.gameMap?.particleSystem && this.getConfig('particleEffects', true)) {
            this.particleSystem = this.gameMap.particleSystem.addEffect(this, 'GLOW', {
                colors: [
                    this.getConfig('particleStartColor', '#8A2BE2'),
                    this.getConfig('particleEndColor', '#4B0082')
                ],
                count: this.isActive ? 1 : 0,
                randomizePosition: true,
                randomizeFactor: 20
            });
        }
    }

    press(parent) {
        if (!this.active || this.isAnimating || !this.isActive || !this.targetMap) return false;

        const myte = this.activeMyte;
        if (!myte || !this.canTransitionMyte(myte)) return false;

        return this.runInteractionWhenInRange(() => {
            this.beginTransition(myte);
        }, myte);
    }

    checkProximityActivation(myte) {
        if (!this.isActive || !myte || !this.targetMap || this.isAnimating || !this.canTransitionMyte(myte)) return;

        if (this.isInInteractionRange(myte, this.activationRadius)) {
            this.beginTransition(myte);
        }
    }

    beginTransition(myte) {
        if (this.isAnimating || !this.isActive || !this.targetMap) return;

        this.isAnimating = true;
        this.isActive = false;
        if (myte) {
            myte.portalCooldownUntil = Date.now() + this.transitionDuration + this.getPortalCooldownDuration();
        }

        if (this.hasAnimation('activate')) {
            this.playAnimation('activate');
        }

        const container = this.container;

        if (container.transitionManager) {
            container.transitionManager.startTransition({
                targetMap: this.targetMap,
                targetSpawnPoint: this.targetSpawnPoint,
                sourceMapId: this.gameMap?.id ?? null,
                duration: this.transitionDuration,
                myte,
                sourcePortal: this,
                onComplete: () => {
                    this.isAnimating = false;
                    this.isActive = true;
                }
            });
            return;
        }

        container.loadMap(this.targetMap).then(() => {
            this.isAnimating = false;
            this.isActive = true;

            if (myte && container.gameMap) {
                const spawnPoint = container.gameMap.getSpawnPoint(this.targetSpawnPoint);
                myte.setPosition(spawnPoint.x, spawnPoint.y);
            }
        });
    }

    updatePortalStateClasses() {
        if (!this.element) return;
        this.element.classList.toggle('active', this.isActive);
        this.element.classList.toggle('inactive', !this.isActive);
    }

    ensurePortalWindow() {
        if (!this.element || this.element.querySelector('.portal-window')) return;

        const portal = document.createElement('div');
        portal.className = 'portal-window';

        const title = document.createElement('div');
        title.className = 'title';
        title.innerHTML = '&nbsp;';

        const content = document.createElement('div');
        content.className = 'content';
        content.style.backgroundImage = `url(${this.getConfig('portalWindowBackground', 'red.gif')})`;

        portal.appendChild(title);
        portal.appendChild(content);
        this.element.appendChild(portal);
    }

    render(container, parent) {
        const element = super.render(container, parent);
        element.classList.add('portal');

        this.updatePortalStateClasses();
        this.ensurePortalWindow();

        if (this.targetMap) {
            element.dataset.targetMap = this.targetMap;
        }

        return element;
    }

    tickUpdate(tickDelta) {
        super.tickUpdate(tickDelta);

        if (this.isActive && !this.getConfig('interactionOnly', false) && this.activeMyte) {
            this.checkProximityActivation(this.activeMyte);
        }
    }

    update(deltaTime) {
        super.update(deltaTime);
        this.updatePortalStateClasses();

        if (this.particleSystem?.options) {
            this.particleSystem.options.count = this.isActive ? 1 : 0;
        }
    }

    remove() {
        if (this.particleSystem) {
            this.particleSystem.active = false;
            this.particleSystem = null;
        }

        super.remove();
    }
}
