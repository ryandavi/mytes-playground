
class MyteAnimation {
    constructor(myte) {
        this.myte = myte;
        this.currentState = "idle";
        this.frameIndex = 0;
        this.frameTime = 0;
        this.sprites = new Map();
        
        this.loadSprites();
    }

    loadSprites() {
        // Load sprite configurations
        this.sprites.set("idle", {
            frames: [[0, 0], [1, 0]],
            frameDuration: 200
        });
        
        // Add more sprite configurations...
    }

    update(deltaTime) {
        const currentAnim = this.sprites.get(this.currentState);
        if (!currentAnim) return;

        this.frameTime += deltaTime;
        if (this.frameTime >= currentAnim.frameDuration) {
            this.frameTime = 0;
            this.frameIndex = (this.frameIndex + 1) % currentAnim.frames.length;
            this.updateSprite();
        }
    }

    updateSprite() {
        const currentAnim = this.sprites.get(this.currentState);
        const frame = currentAnim.frames[this.frameIndex];
        this.myte.sprite.style.backgroundPosition = 
            `${-frame[0] * this.myte.width}px ${-frame[1] * this.myte.height}px`;
    }

    setState(state) {
        if (this.currentState !== state && this.sprites.has(state)) {
            this.currentState = state;
            this.frameIndex = 0;
            this.frameTime = 0;
            this.updateSprite();
        }
    }
}