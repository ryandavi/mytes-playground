// withAnimation — composable mixin that adds sprite animation to any MapObject subclass.
// Usage: class Foo extends withAnimation(MapObject) {}
const withAnimation = (BaseClass) => class extends BaseClass {
    constructor(parent, type, variant, posX, posY, config = {}, options = {}) {
        super(parent, type, variant, posX, posY, config, options);

        const animConfig = {
            frameWidth:  this.getVisualFrameWidth(),
            frameHeight: this.getVisualFrameSize()?.height ?? this.getConfig('size.height'),
            scale:       this.getVisualScale(),
            spriteSheet: this.getVisualSpriteSheet().url || this.getConfig('spriteSheet.url'),
            fps:         options.fps ?? this.getConfig('spriteConfig.fps'),
            frameDelay:  options.frameDelay || this.getVisualFrameDelay(),
            animations:  this.getVisualAnimations(),
            default:     this.getDefaultVisualState('idle')
        };

        this.animation = new AnimationController(this, animConfig);
        this.currentAnimation = null;
        this.defaultAnimation = this.getDefaultVisualState('idle');
    }

    playAnimation(animationName, onComplete) {
        if (!this.animation) return false;
        this.currentAnimation = animationName;
        return this.animation.play(animationName, onComplete);
    }

    updateAnimation(deltaTime) {
        if (!this.animation || this.animation.paused) return;
        this.animation.update(deltaTime);
    }

    updateSpriteFrame() {
        this.animation?.updateFrame();
    }

    // While sleeping (culled), the live paused flag must stay true and wake()
    // restores _animationPausedBeforeSleep — so pause/resume during sleep update
    // that snapshot instead. Otherwise an object that stops while off-screen
    // resumes its old animation on wake (e.g. a settled ball spinning in place).
    pauseAnimation() {
        if (!this.animation) return;
        this.animation.paused = true;
        if (this.sleeping) this._animationPausedBeforeSleep = true;
    }

    resumeAnimation() {
        if (!this.animation) return;
        if (this.sleeping) {
            this._animationPausedBeforeSleep = false;
            return;
        }
        this.animation.paused = false;
    }

    hasAnimation(animationName) {
        return !!(this.animation?.config?.animations?.[animationName]);
    }

    getAnimationFrameCount(animationName) {
        if (!this.hasAnimation(animationName)) return 0;
        return this.animation.config.animations[animationName].frames?.length || 0;
    }

    setAnimationSpeed(frameDelay) {
        if (this.animation) this.animation.frameDelay = frameDelay;
    }

    render(container, parent) {
        const element = super.render(container, parent);
        element.classList.add('animated-map-object');

        const renderType = this.getVisualRenderType();
        if (renderType === 'animated' || renderType === 'sprite') {
            this._setupAnimation(element);
            this.playAnimation(this.defaultAnimation);
        }

        return element;
    }

    _setupAnimation(element) {
        this.animation?.setup(element);
    }

    tickUpdate(tickDelta) {
        super.tickUpdate(tickDelta);
    }

    update(deltaTime) {
        super.update(deltaTime);
        this.updateAnimation(deltaTime);
    }
};

// Named class for backward compatibility — concrete objects that already extend
// AnimatedMapObject continue to work unchanged.
class AnimatedMapObject extends withAnimation(MapObject) {}
