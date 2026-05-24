class AnimationController {
    constructor(host, config) {
        this.host = host;
        this.config = config;

        this.framePosition = 0;
        this.currentAnimation = null;
        this.frameDelay = config.frameDelay || 100;
        this._elapsed = 0;

        // DOM elements
        this.element = null;
        this.sprite = null;

        // Pause flag
        this.paused = false;
    }

    play(animationName, onComplete) {
        const animation = this.config.animations?.[animationName];
        if (!animation) return;

        // Don't restart the same animation
        if (this.currentAnimation?.name === animationName) return;

        this.currentAnimation = {
            name: animationName,
            frames: animation.frames,
            loop: animation.loop ?? true,
            onComplete: onComplete
        };

        this.framePosition = 0;
        this._elapsed = 0;

        // Show first frame immediately
        this.updateFrame();

        // Single-frame animations resolve instantly
        if (this.currentAnimation.frames.length === 1) {
            if (onComplete) onComplete();
            if (!this.currentAnimation.loop) this.currentAnimation = null;
        }
    }

    // deltaTime is now passed from the game loop — no wall-clock polling
    update(deltaTime) {
        if (!this.currentAnimation || this.paused) return;
        if (this.currentAnimation.frames.length <= 1) return;

        this._elapsed += deltaTime;
        if (this._elapsed >= this.frameDelay) {
            // Consume one or more frame intervals (handles very slow frames gracefully)
            this._elapsed -= this.frameDelay;
            if (this._elapsed >= this.frameDelay) this._elapsed = 0; // avoid runaway catch-up

            this.framePosition = (this.framePosition + 1) % this.currentAnimation.frames.length;

            // Write bg-position into renderState instead of directly to DOM
            this._computeFramePosition();

            if (this.framePosition === 0) {
                // Snapshot before calling onComplete — the callback may start a new animation
                // (or a single-frame non-looping one that nulls currentAnimation inside play()),
                // which would make reading .loop on the original reference crash.
                const anim = this.currentAnimation;
                if (anim.onComplete) anim.onComplete();
                if (this.currentAnimation === anim && !anim.loop) this.currentAnimation = null;
            }
        }
    }

    // Computes the CSS background-position string and stores it on the host's renderState.
    // DOM writes happen in MapRenderer.flush(), not here.
    _computeFramePosition() {
        if (!this.currentAnimation) return;

        let { frameWidth, frameHeight = frameWidth, scale = 1 } = this.config;

        const frameSize = this.host.getVisualFrameSize?.();
        if (frameSize) {
            frameWidth = frameSize.width;
            frameHeight = frameSize.height;
        }

        const frame = this.currentAnimation.frames[this.framePosition];
        let bgPos;

        if (Array.isArray(frame)) {
            const [x, y] = frame;
            bgPos = `${-x * frameWidth * scale}px ${-y * frameHeight * scale}px`;
        } else {
            bgPos = `${-frame * frameWidth * scale}px 0px`;
        }

        // Write into renderState for batched flushing
        if (this.host.renderState) {
            this.host.renderState.bgPosition = bgPos;
            this.host.renderState.dirty = true;
        } else if (this.sprite) {
            // Fallback for objects that don't use renderState yet
            this.sprite.style.backgroundPosition = bgPos;
        }
    }

    // Called once during initial animation switch to show the correct frame immediately.
    // Writes directly to DOM since this happens outside the normal update/render cycle.
    updateFrame() {
        if (!this.element || !this.currentAnimation) return;

        let { frameWidth, frameHeight = frameWidth, scale = 1 } = this.config;

        const frameSize = this.host.getVisualFrameSize?.();
        if (frameSize) {
            frameWidth = frameSize.width;
            frameHeight = frameSize.height;
        }

        const frame = this.currentAnimation.frames[this.framePosition];
        let bgPos;

        if (Array.isArray(frame)) {
            const [x, y] = frame;
            bgPos = `${-x * frameWidth * scale}px ${-y * frameHeight * scale}px`;
        } else {
            bgPos = `${-frame * frameWidth * scale}px 0px`;
        }

        if (this.host.renderState) {
            this.host.renderState.bgPosition = bgPos;
            this.host.renderState.dirty = true;
        } else if (this.sprite) {
            this.sprite.style.backgroundPosition = bgPos;
        }
    }

    setup(element) {
        this.element = element;
        this.sprite = element.querySelector('.sprite') || this.element;
    }
}
