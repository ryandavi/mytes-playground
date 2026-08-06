class Particle {
    constructor(id) {
        this.id = id;
        this.reset();
    }

    reset() {
        this.active = false;
        this.system = null;
        this.sourceEmitter = null;
        this.config = null;
        this.behaviors = [];
        this.behaviorData = {};

        this.x = 0;
        this.y = 0;
        this.z = 0;
        this.prevX = 0;
        this.prevY = 0;
        this.prevSize = 0;
        this.prevOpacity = 1;
        this.prevRotation = 0;
        this.prevScaleX = 1;
        this.prevScaleY = 1;

        this.vx = 0;
        this.vy = 0;
        this.gravity = 0;
        this.wind = 0;
        this.friction = 0.98;

        this.lifeMs = 500;
        this.ageMs = 0;
        this.visualAgeMs = 0;

        this.sizeStart = 4;
        this.sizeEnd = 4;
        this.size = 4;
        this.opacityStart = 1;
        this.opacityEnd = 1;
        this.opacity = 1;
        this.rotation = 0;
        this.rotationSpeed = 0;
        this.scaleX = 1;
        this.scaleY = 1;
        this.baseScaleX = 1;
        this.baseScaleY = 1;

        this.color = '#ffffff';
        this.useSprite = false;
        this.spriteUrl = null;
        this.spriteAnimator = null;
        this.spriteFrameWidth = 1;
        this.spriteFrameHeight = 1;
        this.spriteSheetColumns = 1;
        this.spriteSheetRows = 1;

        this.renderX = 0;
        this.renderY = 0;
        this.renderWidth = 0;
        this.renderHeight = 0;
        this.renderOpacity = 1;
        this.renderRotation = 0;
        this.renderScaleX = 1;
        this.renderScaleY = 1;
        this.renderColor = '';
        this.renderVisible = true;
        this.renderVisibility = '';
        this.renderLayer = 'default';
        this.renderZIndex = 0;
        this.renderBackgroundPosition = '';
        this.renderBackgroundSize = '';
        this.renderBorderRadius = '50%';
        this.renderBlendMode = '';
        this.renderClassName = 'particle';
    }

    activate(system, config, spawnState = {}) {
        this.reset();

        this.active = true;
        this.system = system;
        this.sourceEmitter = spawnState.emitter || null;
        this.config = config;
        this.behaviors = Array.isArray(config.behaviors) ? config.behaviors.slice() : [];
        this.behaviorData = ParticleDataUtils.clone(config.behaviorData || {});

        this.x = spawnState.x;
        this.y = spawnState.y;
        this.z = spawnState.z;
        this.prevX = this.x;
        this.prevY = this.y;

        this.vx = spawnState.vx;
        this.vy = spawnState.vy;
        this.gravity = config.gravity;
        this.wind = config.wind;
        this.friction = config.friction;

        this.lifeMs = spawnState.lifeMs;
        this.ageMs = 0;
        this.visualAgeMs = 0;

        this.sizeStart = spawnState.size;
        this.sizeEnd = spawnState.sizeEnd;
        this.size = this.sizeStart;
        this.prevSize = this.size;

        this.opacityStart = spawnState.opacity;
        this.opacityEnd = spawnState.opacityEnd;
        this.opacity = this.opacityStart;
        this.prevOpacity = this.opacity;

        this.rotation = spawnState.rotation;
        this.rotationSpeed = spawnState.rotationSpeed;
        this.prevRotation = this.rotation;

        this.baseScaleX = spawnState.scaleX;
        this.baseScaleY = spawnState.scaleY;
        this.scaleX = this.baseScaleX;
        this.scaleY = this.baseScaleY;
        this.prevScaleX = this.scaleX;
        this.prevScaleY = this.scaleY;

        this.color = spawnState.color;
        this.useSprite = config.useSprite;
        this.spriteUrl = config.sprite;
        this.spriteFrameWidth = config.spriteFrameWidth;
        this.spriteFrameHeight = config.spriteFrameHeight;
        this.spriteSheetColumns = 1;
        this.spriteSheetRows = 1;

        if (config.useSprite && config.spriteFrames?.length) {
            this.spriteAnimator = new SpriteAnimator(config.spriteFrames.slice(), {
                fps: config.fps,
                frameDuration: config.frameDuration,
                loop: config.loop !== false
            });
        } else {
            this.spriteAnimator = null;
        }

        if (this.spriteAnimator && config.spriteFrames?.length) {
            const frameBounds = config.spriteFrames.reduce((bounds, frame) => ({
                maxX: Math.max(bounds.maxX, frame[0]),
                maxY: Math.max(bounds.maxY, frame[1])
            }), { maxX: 0, maxY: 0 });

            this.spriteSheetColumns = frameBounds.maxX + 1;
            this.spriteSheetRows = frameBounds.maxY + 1;
        }

        if (config.orbitalMotion) {
            this.behaviorData.orbit = {
                angle: spawnState.orbitAngle,
                radius: spawnState.orbitRadius,
                speed: config.orbitalSpeed,
                anchorTracker: spawnState.anchorTracker || this.sourceEmitter?.tracker || null
            };
        }

        this.renderLayer = config.renderLayer;
        this.renderBlendMode = config.blendMode || '';
        this.renderClassName = ['particle', config.className].filter(Boolean).join(' ');
        this.renderBorderRadius = config.borderRadius || '50%';
    }

    get lifeProgress() {
        return ParticleMath.clamp(this.ageMs / Math.max(this.lifeMs, 1), 0, 1);
    }

    beginTick() {
        this.prevX = this.x;
        this.prevY = this.y;
        this.prevSize = this.size;
        this.prevOpacity = this.opacity;
        this.prevRotation = this.rotation;
        this.prevScaleX = this.scaleX;
        this.prevScaleY = this.scaleY;
    }

    tickUpdate(tickDelta, system) {
        if (!this.active) return false;

        this.beginTick();
        this.ageMs += tickDelta;

        if (this.ageMs >= this.lifeMs) {
            system.handleParticleDeath(this);
            return false;
        }

        system.behaviors.runTick(this, tickDelta, system);
        system.applyBoundsBehavior(this);

        return this.active;
    }

    advanceSprite(deltaTime) {
        this.spriteAnimator?.update(deltaTime);
    }

    updateVisual(deltaTime, alpha, system) {
        this.advanceSprite(deltaTime);
        system.behaviors.runVisual(this, deltaTime, alpha, system);

        const clampedAlpha = ParticleMath.clamp(alpha, 0, 1);
        this.renderX = ParticleMath.lerp(this.prevX, this.x, clampedAlpha);
        this.renderY = ParticleMath.lerp(this.prevY, this.y, clampedAlpha);
        this.renderWidth = ParticleMath.lerp(this.prevSize, this.size, clampedAlpha);
        this.renderHeight = this.renderWidth;
        this.renderOpacity = ParticleMath.lerp(this.prevOpacity, this.opacity, clampedAlpha);
        this.renderRotation = ParticleMath.lerp(this.prevRotation, this.rotation, clampedAlpha);
        this.renderScaleX = ParticleMath.lerp(this.prevScaleX, this.scaleX, clampedAlpha);
        this.renderScaleY = ParticleMath.lerp(this.prevScaleY, this.scaleY, clampedAlpha);
        this.renderColor = this.color;
        this.renderZIndex = this.z + (this.config?.zIndexOffset || 0);
        this.renderLayer = this.config?.renderLayer || 'default';
        this.renderVisible = this.active && (this.config?.renderOffscreen || system.isPointVisible(this.renderX, this.renderY, this.config?.cullMargin || 0));
        this.renderVisibility = this.renderVisible ? '' : 'hidden';

        if (this.useSprite && this.spriteAnimator) {
            const [frameX, frameY] = this.spriteAnimator.currentFrame ?? [0, 0];
            this.renderBackgroundPosition = `${-frameX * this.spriteFrameWidth}px ${-frameY * this.spriteFrameHeight}px`;
            this.renderBackgroundSize = `${this.spriteSheetColumns * this.spriteFrameWidth}px ${this.spriteSheetRows * this.spriteFrameHeight}px`;
        } else {
            this.renderBackgroundPosition = '';
            this.renderBackgroundSize = '';
        }
    }
}
