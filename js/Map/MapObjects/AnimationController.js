class AnimationController {
    constructor(host, config) {
        this.host = host;
        this.config = config;

        const fps = config.fps
            ?? (config.frameDelay != null ? 1000 / config.frameDelay : null)
            ?? SiteConfig.myte.defaultAnimationFPS;

        this.spriteAnimator = new SpriteAnimator([], { fps });

        this.currentAnimation = null;

        // DOM elements
        this.element = null;
        this.sprite = null;

        this.paused = false;
    }

    play(animationName, onComplete) {
        const animation = this.config.animations?.[animationName];
        if (!animation) return;

        if (this.currentAnimation?.name === animationName) return;

        this.currentAnimation = {
            name: animationName,
            loop: animation.loop ?? true,
            onComplete: onComplete
        };

        this.spriteAnimator.setFrames(animation.frames, {
            fps: animation.fps,
            loop: animation.loop ?? true
        });

        this._applyFrame();

        if (animation.frames.length === 1) {
            if (onComplete) onComplete();
            if (!animation.loop) this.currentAnimation = null;
        }
    }

    update(deltaTime) {
        if (!this.currentAnimation || this.paused) return;
        if (!this.spriteAnimator.update(deltaTime)) return;

        this._applyFrame();

        // Fire onComplete when the animation loops back to 0 or finishes
        const cycled = this.spriteAnimator.frameIndex === 0 || this.spriteAnimator.isComplete;
        if (cycled) {
            const anim = this.currentAnimation;
            if (anim.onComplete) anim.onComplete();
            if (this.currentAnimation === anim && !anim.loop) this.currentAnimation = null;
        }
    }

    // Write the current frame's background-position into renderState (or sprite directly as fallback).
    _applyFrame() {
        if (!this.currentAnimation) return;

        let { frameWidth, frameHeight = frameWidth, scale = 1 } = this.config;

        const frameSize = this.host.getVisualFrameSize?.();
        if (frameSize) {
            frameWidth = frameSize.width;
            frameHeight = frameSize.height;
        }

        const bgPos = this.spriteAnimator.getBackgroundPosition(frameWidth, frameHeight, scale);

        if (this.host.renderState) {
            this.host.renderState.bgPosition = bgPos;
            this.host.renderState.dirty = true;
        } else if (this.sprite) {
            this.sprite.style.backgroundPosition = bgPos;
        }
    }

    // Backward-compat alias — callers that set frameDelay directly still work.
    get frameDelay() { return this.spriteAnimator._baseInterval; }
    set frameDelay(ms) { this.spriteAnimator._baseInterval = ms; }

    setup(element) {
        this.element = element;
        this.sprite = element.querySelector('.sprite') || this.element;
    }
}
