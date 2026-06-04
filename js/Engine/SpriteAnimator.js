class SpriteAnimator {
    // frames: array of [col, row] | [col, row, durationMs] | plain column index (single-row sheet)
    // options: { fps, frameDuration, loop, speedScale }
    //   fps / frameDuration: base rate. frameDuration (ms) takes priority over fps if both provided.
    //   Per-frame durationMs embedded in frame data always wins over the base rate.
    //   speedScale: >1 = faster, <1 = slower. Applied to every frame interval.
    constructor(frames = [], options = {}) {
        this._frames = frames;
        this._loop = options.loop ?? true;
        this._speedScale = Math.max(0.01, options.speedScale ?? 1);
        this._baseInterval = options.frameDuration != null
            ? options.frameDuration
            : 1000 / (options.fps ?? SiteConfig.myte.defaultAnimationFPS);
        this._frameIndex = 0;
        this._elapsed = 0;
        this._complete = false;
    }

    get frameIndex() { return this._frameIndex; }
    get frameCount() { return this._frames.length; }
    get isComplete() { return this._complete; }
    get currentFrame() { return this._frames[this._frameIndex] ?? null; }

    // Switch to a new sequence and reset. options: { fps, frameDuration, loop }
    setFrames(frames, options = {}) {
        this._frames = frames;
        if (options.fps != null) this._baseInterval = 1000 / options.fps;
        if (options.frameDuration != null) this._baseInterval = options.frameDuration;
        if (options.loop != null) this._loop = options.loop;
        this.reset();
    }

    setSpeedScale(scale) {
        this._speedScale = Math.max(0.01, scale);
    }

    reset() {
        this._frameIndex = 0;
        this._elapsed = 0;
        this._complete = false;
    }

    _getFrameInterval() {
        const frame = this._frames[this._frameIndex];
        const perFrame = Array.isArray(frame) && frame[2] != null ? frame[2] : null;
        return (perFrame ?? this._baseInterval) / this._speedScale;
    }

    // Advance by deltaTime ms.
    // Returns true when the frame index changes, or on the tick a non-looping animation completes.
    // After returning true, check isComplete to distinguish completion from a normal frame advance.
    update(deltaTime) {
        if (this._complete || this._frames.length <= 1) return false;

        this._elapsed += deltaTime;
        const interval = this._getFrameInterval();
        if (this._elapsed < interval) return false;

        this._elapsed -= interval;
        if (this._elapsed >= interval) this._elapsed = 0; // clamp runaway catch-up

        const next = this._frameIndex + 1;
        if (next >= this._frames.length) {
            if (this._loop) {
                this._frameIndex = 0;
            } else {
                this._complete = true; // hold on last frame
            }
        } else {
            this._frameIndex = next;
        }
        return true;
    }

    // CSS background-position string for the current frame.
    getBackgroundPosition(frameW, frameH = frameW, scale = 1) {
        const frame = this._frames[this._frameIndex];
        if (frame == null) return '0px 0px';
        const col = Array.isArray(frame) ? frame[0] : frame;
        const row = Array.isArray(frame) ? (frame[1] ?? 0) : 0;
        return `${-col * frameW * scale}px ${-row * frameH * scale}px`;
    }
}
