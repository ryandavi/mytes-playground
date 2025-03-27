class AnimationController {
    constructor(host, config) {
        // Store reference to the host object
        this.host = host;
        
        // Animation configuration
        this.config = config;
        
        // Animation state
        this.framePosition = 0;  // Position in frames array (not the frame itself)
        this.lastFrameTime = 0;
        this.currentAnimation = null;
        
        // Frame rate (default to 10fps or 100ms per frame)
        this.frameDelay = config.frameDelay || 100;
        
        // DOM elements
        this.element = null;
        this.sprite = null;
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
        
        // Reset frame position
        this.framePosition = 0;
        
        // Update visual immediately
        this.updateFrame();
        
        // If single frame animation, call onComplete immediately
        if (this.currentAnimation.frames.length === 1) {
            if (onComplete) onComplete();
            // Keep current frame if it's meant to loop
            if (!this.currentAnimation.loop) {
                this.currentAnimation = null;
            }
        } else {
            this.lastFrameTime = Date.now();
        }
    }
    

    update(deltaTime) {
        if (!this.currentAnimation || this.currentAnimation.frames.length === 1) return;
        
        const now = Date.now();
        if (now - this.lastFrameTime > this.frameDelay) {
            // Increment the position in the frames array
            this.framePosition = (this.framePosition + 1) % this.currentAnimation.frames.length;
            this.lastFrameTime = now;
            
            this.updateFrame();
            
            // Handle animation completion
            if (this.framePosition === 0) {
                if (this.currentAnimation.onComplete) {
                    this.currentAnimation.onComplete();
                }
                if (!this.currentAnimation?.loop) {
                    this.currentAnimation = null;
                }
            }
        }
    }
    

    updateFrame() {
        if (!this.element || !this.currentAnimation) return;
        
        let { frameWidth, frameHeight = frameWidth, scale = 1 } = this.config;

        // for sprites that are larger than the object
        if(this.host.getConfig('spriteConfig.spriteSheet.frameSize')){
            frameWidth = this.host.getConfig('spriteConfig.spriteSheet.frameSize.width');
            frameHeight = this.host.getConfig('spriteConfig.spriteSheet.frameSize.height');
        }

        // Get the current frame (could be a number or an array [x,y])
        const frame = this.currentAnimation.frames[this.framePosition];
        
        if (Array.isArray(frame)) {
            // It's a 2D coordinate [x, y]
            const [x, y] = frame;
            this.sprite.style.backgroundPosition = 
                `${-x * frameWidth * scale}px ${-y * frameHeight * scale}px`;
        } else {
            // It's a 1D index (original format)
            this.sprite.style.backgroundPosition = `${-frame * frameWidth * scale}px 0px`;
        }
    }

    setup(element) {
        this.element = element;

        this.sprite = element.querySelector('.sprite') || this.element;
        
        
        // Set dimensions
        if (this.config.frameWidth && this.config.scale) {
            // this.element.style.width = `${this.config.frameWidth * this.config.scale}px`;
            // const height = this.config.frameHeight || this.config.frameWidth;
            //this.element.style.height = `${height * this.config.scale}px`;
        }
        
        // Set up spritesheet background if provided
        if (this.config.spriteSheet.url) {
            // this.sprite.style.backgroundImage = `url(${this.config.spriteSheet.url})`;
        }
    }
}