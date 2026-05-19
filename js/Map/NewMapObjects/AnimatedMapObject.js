// withAnimation — composable mixin that adds sprite animation to any MapObject subclass.
// Usage: class Foo extends withAnimation(MapObject) {}
const withAnimation = (BaseClass) => class extends BaseClass {
    constructor(parent, type, variant, posX, posY, config = {}, options = {}) {
        super(parent, type, variant, posX, posY, config, options);

        const animConfig = {
            frameWidth:  this.getConfig('spriteConfig.frameWidth',  this.getConfig('size.width')),
            frameHeight: this.getConfig('spriteConfig.frameHeight', this.getConfig('size.height')),
            scale:       this.getConfig('spriteConfig.scale',       this.getConfig('scale')),
            spriteSheet: this.getConfig('spriteConfig.spriteSheet.url', this.getConfig('spriteSheet.url')),
            frameDelay:  options.frameDelay || this.getConfig('spriteConfig.frameDelay'),
            animations:  this.getConfig('spriteConfig.animations') || {},
            default:     this.getConfig('spriteConfig.default', this.getConfig('default'))
        };

        this.animation = new AnimationController(this, animConfig);
        this.currentAnimation = null;
        this.defaultAnimation = this.getConfig('spriteConfig.default', 'idle');
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

    pauseAnimation() {
        if (this.animation) this.animation.paused = true;
    }

    resumeAnimation() {
        if (this.animation) this.animation.paused = false;
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

        if (this.getConfig('renderType') === 'animated' || this.getConfig('renderType') === 'sprite') {
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
