class PortalMapObject extends InteractiveMapObject {
    constructor(parent, type, variant, posX, posY, config = {}, options = {}) {
        super(parent, type, variant, posX, posY, config, options);

        this.targetMap = options.targetMap ?? this.getConfig('targetMap', null);
        this.targetSpawnPoint = options.targetSpawnPoint ?? this.getConfig('targetSpawnPoint', null);
        this.targetPortalId = options.targetPortalId ?? this.getConfig('targetPortalId', null);
        this.portalId = String(
            options.portalId ??
            this.getConfig('portalId', options.id ?? `${type}_${variant}_${posX}_${posY}`)
        );
        this.isActive = options.isActive ?? this.getConfig('isActive', true);
        this.activationRadius = options.activationRadius ?? this.getConfig('activationRadius', 75);
        this.transitionDuration = options.transitionDuration ?? this.getConfig('transitionDuration', 1000);

        this.isAnimating = false;
        this.particleSystem = null;
        this.usesFallbackVisual = false;

        this.applyFallbackPortalVisualConfig();

        this.initializePortalEffects();
    }

    applyFallbackPortalVisualConfig() {
        const spriteSheetUrl = this.getVisualSpriteSheet()?.url || '';
        if (!spriteSheetUrl) {
            this.usesFallbackVisual = true;
            return;
        }

        if (!spriteSheetUrl.includes('portal.png')) {
            return;
        }

        if (this.config?.visual?.spriteSheet) {
            this.config.visual.spriteSheet.url = '';
        }

        if (this.config?.spriteConfig?.spriteSheet) {
            this.config.spriteConfig.spriteSheet.url = '';
        }

        this.usesFallbackVisual = true;
    }

    getApproachActionId() {
        return 'go_to_object';
    }

    getApproachMode() {
        return 'center';
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
        return (myte.portalCooldownUntil || 0) <= SimClock.now();
    }

    getPortalReferenceId() {
        return String(this.portalId || this.id || '');
    }

    getResolvedTargetMapId() {
        if (this.targetMap) {
            return this.targetMap;
        }

        if (this.targetPortalId || this.targetSpawnPoint) {
            return this.gameMap?.id || null;
        }

        return null;
    }

    hasTransitionDestination() {
        return !!(this.targetMap || this.targetSpawnPoint || this.targetPortalId);
    }

    getTransitionRect(alignTo = 'sprite') {
        if (alignTo === 'collider' && this.collider) {
            return {
                x: this.posX + (this.collider.offsetX || 0),
                y: this.posY + (this.collider.offsetY || 0),
                width: this.collider.width || this.size.width,
                height: this.collider.height || this.size.height
            };
        }

        return {
            x: this.posX,
            y: this.posY,
            width: this.size.width,
            height: this.size.height
        };
    }

    getPortalCenter(alignTo = 'sprite') {
        const rect = this.getTransitionRect(alignTo);
        return {
            x: rect.x + rect.width / 2,
            y: rect.y + rect.height / 2
        };
    }

    getCenteredPositionFor(myte, alignTo = 'sprite') {
        const center = this.getPortalCenter(alignTo);
        return {
            x: center.x - ((myte?.size?.width || 0) / 2),
            y: center.y - ((myte?.size?.height || 0) / 2)
        };
    }

    getExitPositionFor(myte) {
        return this.getCenteredPositionFor(myte, this.getConfig('transitionAlignTo', 'sprite'));
    }

    initializePortalEffects() {
        if (this.gameMap?.particleSystem && this.getConfig('particleEffects', true)) {
            const particleConfig = this.getConfig('particleConfig', {});
            const effectName = particleConfig.particleEffect || 'GLOW';

            this.particleSystem = this.gameMap.particleSystem.addEffect(this, effectName, {
                ...particleConfig,
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

    playPortalSound(type) {
        const soundEffect = this.getConfig(`soundEffects.${type}`);
        if (soundEffect && this.gameMap?.soundManager) {
            this.gameMap.soundManager.play(soundEffect);
        }
    }

    press(parent) {
        if (!this.active || this.isAnimating || !this.isActive || !this.hasTransitionDestination()) return false;

        const myte = this.activeMyte;
        if (!myte || !this.canTransitionMyte(myte)) return false;

        return this.runInteractionWhenInRange(() => {
            this.beginTransition(myte);
        }, myte);
    }

    runDebugDirectInteraction() {
        if (!this.active || this.isAnimating || !this.isActive || !this.hasTransitionDestination()) {
            return false;
        }

        this.selectInUi?.();
        this.beginTransition(null);
        return true;
    }

    checkProximityActivation(myte) {
        if (!this.isActive || !myte || !this.hasTransitionDestination() || this.isAnimating || !this.canTransitionMyte(myte)) return;

        if (this.isInInteractionRange(myte, this.activationRadius)) {
            this.beginTransition(myte);
        }
    }

    beginTransition(myte) {
        const targetMapId = this.getResolvedTargetMapId();
        if (this.isAnimating || !this.isActive || !targetMapId) return;

        this.isAnimating = true;
        this.isActive = false;
        if (myte) {
            myte.portalCooldownUntil = SimClock.now() + this.transitionDuration + this.getPortalCooldownDuration();
        }

        this.playPortalSound('depart');

        if (this.hasAnimation('activate')) {
            this.playAnimation('activate');
        }

        const container = this.container;
        const transitionCopy = this.getPortalTransitionCopy();

        if (container.transitionManager) {
            container.transitionManager.startTransition({
                targetMap: targetMapId,
                targetSpawnPoint: this.targetSpawnPoint,
                targetPortalId: this.targetPortalId,
                sourceMapId: this.gameMap?.id ?? null,
                sourcePortalId: this.getPortalReferenceId(),
                duration: this.transitionDuration,
                message: transitionCopy.message,
                transitionTitle: transitionCopy.title,
                transitionDescription: transitionCopy.description,
                myte,
                sourcePortal: this,
                onComplete: () => {
                    this.isAnimating = false;
                    this.isActive = true;
                }
            });
            return;
        }

        container.loadMap(targetMapId).then(() => {
            this.isAnimating = false;
            this.isActive = true;

            if (myte && container.gameMap) {
                const portalPosition = this.targetPortalId
                    ? container.gameMap.objects.find(obj =>
                        obj instanceof PortalMapObject &&
                        obj.getPortalReferenceId?.() === String(this.targetPortalId)
                    )?.getCenteredPositionFor?.(myte)
                    : null;
                const spawnPoint = this.targetSpawnPoint
                    ? container.gameMap.getSpawnPoint(this.targetSpawnPoint)
                    : container.gameMap.getSpawnPoint('myte');
                const position = portalPosition || spawnPoint;

                if (position) {
                    myte.setPosition(position.x, position.y);
                    myte.setTarget(position.x, position.y);
                    myte.setSpritePosition(position.x, position.y);
                }
            }
        });
    }

    getPortalWindowTitle() {
        return this.getDisplayName();
    }

    getDisplayName() {
        if (this.targetMap) {
            const mapLoader = this.core?.mapLoader;
            return mapLoader?.getCachedMapDisplayName?.(this.targetMap) ||
                mapLoader?.humanizeMapId?.(this.targetMap) ||
                String(this.targetMap);
        }

        const explicitName = this.getConfig('label', null);
        if (typeof explicitName === 'string' && explicitName.trim()) {
            return explicitName.trim();
        }

        const fallback = super.getDisplayName?.();
        if (fallback && fallback !== 'Default') {
            return fallback;
        }

        return 'Portal';
    }

    getPortalTransitionMessage() {
        return `Traveling to ${this.getPortalWindowTitle()}...`;
    }

    getPortalTransitionDescription() {
        return this.targetMap
            ? `Traveling to ${this.getPortalWindowTitle()}...`
            : 'Traveling...';
    }

    getPortalTransitionCopy() {
        return {
            title: this.getPortalWindowTitle(),
            message: this.getPortalTransitionMessage(),
            description: this.getPortalTransitionDescription()
        };
    }

    updatePortalStateClasses() {
        if (!this.element) return;
        this.element.classList.toggle('active', this.isActive);
        this.element.classList.toggle('inactive', !this.isActive);
    }

    syncPortalWindowTitle() {
        const titleElement = this.element?.querySelector('.portal-window .portal-panel__title');
        if (!titleElement) return;

        const nextTitle = this.getPortalWindowTitle();
        if (titleElement.textContent !== nextTitle) {
            titleElement.textContent = nextTitle;
        }
        titleElement.title = nextTitle;
    }

    updatePortalDom({ refreshTitle = false } = {}) {
        if (!this.element) return;

        this.element.classList.add('portal');
        this.updatePortalStateClasses();
        this.ensurePortalWindow();
        this.syncPortalWindowTitle();

        if (this.targetMap) {
            this.element.dataset.targetMap = this.targetMap;
        } else {
            delete this.element.dataset.targetMap;
        }

        if (refreshTitle) {
            this.refreshPortalWindowTitle();
        }
    }

    ensurePortalWindow() {
        if (!this.element || this.element.querySelector('.portal-window')) return;

        const portal = document.createElement('div');
        portal.className = 'portal-window';

        const title = document.createElement('div');
        title.className = 'portal-panel__title';
        title.textContent = this.getPortalWindowTitle();
        title.title = this.getPortalWindowTitle();

        const content = document.createElement('div');
        content.className = 'content portal-panel__content';
        const portalWindowBackground = this.getConfig('portalWindowBackground', '');
        if (portalWindowBackground) {
            content.style.backgroundImage = `url(${portalWindowBackground})`;
        } else {
            // content.style.backgroundImage = 'radial-gradient(circle at center, rgba(255,255,255,0.35), rgba(138,43,226,0.65) 45%, rgba(75,0,130,0.92) 100%)';
        }

        portal.appendChild(title);
        portal.appendChild(content);
        this.element.appendChild(portal);
        this.refreshPortalWindowTitle();
    }

    refreshPortalWindowTitle() {
        this.syncPortalWindowTitle();

        if (!this.targetMap || !this.core?.mapLoader?.getMapDisplayName) {
            return;
        }

        this.core.mapLoader.getMapDisplayName(this.targetMap).then(displayName => {
            if (!displayName) return;

            const liveTitleElement = this.element?.querySelector('.portal-window .portal-panel__title');
            if (!liveTitleElement) return;

            liveTitleElement.textContent = displayName;
            liveTitleElement.title = displayName;
        }).catch(error => {
            Utility.warnDebug(`[PortalMapObject] Failed to refresh portal title for ${this.targetMap}:`, error);
        });
    }

    render(container, parent) {
        const element = super.render(container, parent);

        if (this.usesFallbackVisual) {
            const spriteElement = element.querySelector('.sprite');
            if (spriteElement) {
                // spriteElement.style.backgroundImage = 'radial-gradient(circle at center, rgba(255,255,255,0.6) 0%, rgba(173,216,230,0.55) 20%, rgba(138,43,226,0.9) 55%, rgba(75,0,130,0.95) 100%)';
                // spriteElement.style.borderRadius = '50%';
                // spriteElement.style.boxShadow = '0 0 28px rgba(138, 43, 226, 0.55), inset 0 0 18px rgba(255,255,255,0.28)';
            }
        }

        this.updatePortalDom({ refreshTitle: true });

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
        this.updatePortalDom();

        if (this.particleSystem?.setEnabled) {
            this.particleSystem.setEnabled(this.isActive);
        } else if (this.particleSystem) {
            this.particleSystem.active = this.isActive;
        }
    }

    remove() {
        if (this.particleSystem) {
            if (typeof this.particleSystem.destroy === 'function') {
                this.particleSystem.destroy();
            } else {
                this.particleSystem.active = false;
            }
            this.particleSystem = null;
        }

        super.remove();
    }

    wake() {
        super.wake();
        this.updatePortalDom();
    }
}
