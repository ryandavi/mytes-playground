class AnimatedMapObject extends MapObject {
    constructor(type, variant, posX, posY, config = {}, options = {}) {
        super(type, variant, posX, posY, config);
        
        const animConfig = {
            frameWidth: this.getConfig('spriteConfig.frameWidth', this.getConfig('size.width')),
            frameHeight: this.getConfig('spriteConfig.frameHeight', this.getConfig('size.height')),
            scale: this.getConfig('spriteConfig.scale', this.getConfig('scale')),
            spriteSheet: this.getConfig('spriteConfig.spriteSheet.url', this.getConfig('spriteSheet.url')),
            frameDelay: options.frameDelay || this.getConfig('spriteConfig.frameDelay'),
            animations: this.convertAnimations(this.getConfig('spriteConfig.animations')),
            default: this.getConfig('spriteConfig.default', this.getConfig('default'))
        };

        // Create animation controller
        this.animation = new AnimationController(this, animConfig);
        
        // Animation state
        this.currentAnimation = null;
        this.defaultAnimation = this.getConfig('spriteConfig.default', 'idle');
    }
    
    // Convert animations to unified format if needed
    convertAnimations(animations) {
        if (!animations) return {};
        return animations;
    }
    
    // Play an animation with optional completion callback
    playAnimation(animationName, onComplete) {
        if (!this.animation) return false;
        
        // Track current animation
        this.currentAnimation = animationName;
        
        // Play the animation
        return this.animation.play(animationName, onComplete);
    }
    
    // Update animation state
    updateAnimation() {
        if (!this.animation || this.animation.paused) return;
        this.animation.update();
    }
    
    // Update sprite frame
    updateSpriteFrame() {
        if (!this.animation) return;
        this.animation.updateFrame();
    }
    
    // Pause current animation
    pauseAnimation() {
        if (this.animation) {
            this.animation.paused = true;
        }
    }
    
    // Resume current animation
    resumeAnimation() {
        if (this.animation) {
            this.animation.paused = false;
        }
    }
    
    // Check if animation exists
    hasAnimation(animationName) {
        if (!this.animation || !this.animation.config.animations) return false;
        return !!this.animation.config.animations[animationName];
    }
    
    // Get number of frames for an animation
    getAnimationFrameCount(animationName) {
        if (!this.hasAnimation(animationName)) return 0;
        
        const anim = this.animation.config.animations[animationName];
        return anim.frames?.length || 0;
    }
    
    // Set animation speed
    setAnimationSpeed(frameDelay) {
        if (this.animation) {
            this.animation.frameDelay = frameDelay;
        }
    }
    
    // Override render to set up animation
    render(container, parent) {
        const element = super.render(container, parent);
        
        // Add animated class
        element.classList.add('animated-map-object');
        
        // Set up the animation controller
        if (this.getConfig('renderType') === 'animated' || this.getConfig('renderType') === 'sprite') {
            this.setupAnimation(element);
            
            // Start default animation
            this.playAnimation(this.defaultAnimation);
        }
        
        return element;
    }
    
    // Setup animation with element
    setupAnimation(element) {
        if (!this.animation) return;
        
        // Set up the animation controller with the rendered element
        this.animation.setup(element);
        
        // Apply any custom spritesheet
        const spriteSheet = this.getConfig('spriteConfig.spriteSheet.url');
        if (spriteSheet && this.animation.sprite) {
            // this.animation.sprite.style.backgroundImage = `url(${spriteSheet})`;
        }
    }
    
    // Override update method
    update(deltaTime) {

        super.update(deltaTime);
        
        // Update animation
        this.updateAnimation();
    }
}