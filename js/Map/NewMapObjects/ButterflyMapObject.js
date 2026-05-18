class ButterflyMapObject extends AnimatedMapObject {
    constructor(parent, type, variant, posX, posY, config = {}, options = {}) {

        // Call parent constructor
        super(parent, type, variant, posX, posY, config, options);
        
        // Movement properties
        this.velocity = { x: 0, y: 0 };
        this.speed = this.getConfig('speed', 1);
        this.moveThreshold = options.moveThreshold || 0.025;
        this.direction = "S"; // Default direction
        
        // Boundary checking
        this.bounds = {
            left: 0,
            right: options.mapWidth || 500,
            top: 0,
            bottom: options.mapHeight || 500
        };
        
        // Butterfly-specific bobbing properties
        this.bobPhase = Math.random() * Math.PI * 2;
        this.bobAmplitude = options.bobAmplitude || this.getConfig('bobAmplitude', 15);
        this.bobFrequency = options.bobFrequency || this.getConfig('bobFrequency', 0.05);
        
        // Butterfly hover/move state system — all durations in ms, advanced by tickDelta
        this.stateElapsed = 0;
        this.hoverDuration = 2000 + Math.random() * 2000;
        this.moveDuration  = 2000 + Math.random() * 3000;
        this.isHovering = Math.random() > 0.5;

        // Idle state
        this.isIdle = false;
        this.idleElapsed  = 0;
        this.idleDuration = 0;
        this.idleChance = options.idleChance || this.getConfig('idleChance', 0.001);
        
        // Flutter properties
        this.fluttering = false;
        this.flutterChance = options.flutterChance || this.getConfig('flutterChance', 0.01);
        
        // Set initial random velocity
        this.initializeVelocity();

        this.parent.particleSystem.addParticleMethodsToObject(this);
        this.addEffect("SPARKLE_SPRITE");


    }

    
    // Initialize random velocity
    initializeVelocity() {
        const startAngle = Math.random() * Math.PI * 2;
        this.velocity = {
            x: Math.cos(startAngle) * this.speed,
            y: Math.sin(startAngle) * this.speed
        };
    }
    
    // Apply vertical bobbing motion
    applyBobbing() {
        if (!this.element || this.isIdle) return;
        
        this.bobPhase += this.bobFrequency;
        const bobOffset = Math.sin(this.bobPhase) * this.bobAmplitude;
        
        if (this.animation && this.animation.sprite) {
            this.animation.sprite.style.transform = `translateY(${bobOffset}px)`;
        }
    }
    
    // updateBehavior — called from tickUpdate with elapsed ms since last tick
    updateBehavior(tickDelta) {
        if (this.isIdle) {
            this.idleElapsed += tickDelta;
            if (this.idleElapsed >= this.idleDuration) {
                this.exitIdleState();
            } else {
                this.updateIdleState();
            }
            return;
        }

        // Random chance per tick — scale by tick rate so it feels consistent regardless of Hz
        if (Math.random() < this.idleChance) {
            this.enterIdleState();
            return;
        }

        this.updateHoverMoveBehavior(tickDelta);
    }

    enterIdleState() {
        this.isIdle = true;
        this.fluttering = false;
        this.idleElapsed  = 0;
        this.idleDuration = 3000 + Math.random() * 5000;
        this.velocity.x = 0;
        this.velocity.y = 0;
        this.playAnimation('idle');
    }

    exitIdleState() {
        this.isIdle = false;
        this.fluttering = false;
        this.stateElapsed = 0;

        const angle = Math.random() * Math.PI * 2;
        this.velocity.x = Math.cos(angle) * this.speed * 0.5;
        this.velocity.y = Math.sin(angle) * this.speed * 0.5;
    }
    
    // Update idle state animations
    updateIdleState() {
        // Handle fluttering wings
        if (this.fluttering) {
            // Check if we should stop fluttering
            if (Math.random() < 0.01) {
                this.fluttering = false;
                this.playAnimation('idle');
            }
        } else {
            // Check if we should start fluttering
            if (Math.random() < this.flutterChance) {
                this.fluttering = true;
                this.playAnimation('flutter');
            }
        }
        
        // Reset velocity
        this.velocity.x = 0;
        this.velocity.y = 0;
    }
    
    updateHoverMoveBehavior(tickDelta) {
        this.stateElapsed += tickDelta;

        if (this.isHovering) {
            if (this.stateElapsed >= this.hoverDuration) {
                this.switchToMoving();
            } else {
                this.updateHoveringMotion();
            }
        } else {
            if (this.stateElapsed >= this.moveDuration) {
                this.switchToHovering();
            } else {
                this.updateMovingMotion();
            }
        }
    }

    switchToMoving() {
        this.isHovering = false;
        this.stateElapsed = 0;
        this.moveDuration = 2000 + Math.random() * 3000;
        const angle = Math.random() * Math.PI * 2;
        this.velocity.x = Math.cos(angle) * this.speed;
        this.velocity.y = Math.sin(angle) * this.speed;
    }

    switchToHovering() {
        this.isHovering = true;
        this.stateElapsed = 0;
        this.hoverDuration = 1000 + Math.random() * 2000;
        this.velocity.x *= 0.3;
        this.velocity.y *= 0.3;
    }

    updateHoveringMotion() {
        // Use stateElapsed for oscillation so it's deterministic to game time
        const t = this.stateElapsed * 0.001;
        this.velocity.x = Math.sin(t) * this.speed * 0.2;
        this.velocity.y = Math.cos(t) * this.speed * 0.2;
    }
    
    // Update moving motion
    updateMovingMotion() {
        // Occasional direction adjustments
        if (Math.random() < 0.05) {
            this.velocity.x += (Math.random() - 0.5) * this.speed;
            this.velocity.y += (Math.random() - 0.5) * this.speed;
            
            // Normalize to maintain consistent speed
            this.normalizeVelocity();
        }
    }
    
    // Normalize velocity to maintain consistent speed
    normalizeVelocity() {
        const currentSpeed = Math.sqrt(
            this.velocity.x * this.velocity.x +
            this.velocity.y * this.velocity.y
        );
        
        if (currentSpeed > 0) {
            const targetSpeed = this.speed * (0.8 + Math.random() * 0.4);
            this.velocity.x = (this.velocity.x / currentSpeed) * targetSpeed;
            this.velocity.y = (this.velocity.y / currentSpeed) * targetSpeed;
        }
    }
    
    // Update direction based on movement
    updateDirection() {
        // Only update if we're moving
        if (Math.abs(this.velocity.x) < 0.01 && Math.abs(this.velocity.y) < 0.01) return;
        
        // Find the dominant direction
        if (Math.abs(this.velocity.x) > Math.abs(this.velocity.y)) {
            this.direction = this.velocity.x > 0 ? "E" : "W";
        } else {
            this.direction = this.velocity.y > 0 ? "S" : "N";
        }
        
        // Set the animation based on direction
        if (!this.isIdle) {
            this.playAnimation(this.direction);
        }
    }
    
    // Check and update boundaries
    checkBoundaries() {
        // Check horizontal boundaries
        if (this.posX < this.bounds.left || 
            this.posX > this.bounds.right - this.size.width) {
            this.velocity.x *= -1;
            this.posX = Math.max(
                this.bounds.left, 
                Math.min(this.bounds.right - this.size.width, this.posX)
            );
        }
        
        // Check vertical boundaries
        if (this.posY < this.bounds.top || 
            this.posY > this.bounds.bottom - this.size.height) {
            this.velocity.y *= -1;
            this.posY = Math.max(
                this.bounds.top, 
                Math.min(this.bounds.bottom - this.size.height, this.posY)
            );
        }
    }

    render(container, parent) {
        const element = super.render(container, parent);
        element.classList.add('animated-map-object', 'butterfly');
        
        // Add data attributes for debugging
        element.setAttribute('data-idle', this.isIdle);
        element.setAttribute('data-hovering', this.isHovering);
        element.setAttribute('data-fluttering', this.fluttering);
        element.setAttribute('data-direction', this.direction);
        
        return element;
    }
    
    // tickUpdate: AI, physics, direction state (no DOM)
    tickUpdate(tickDelta) {
        super.tickUpdate(tickDelta);

        this.updateBehavior(tickDelta);

        this.posX += this.velocity.x;
        this.posY += this.velocity.y;
        this.checkBoundaries();
        this.updateDirection();
    }

    // update: visual-only (animation, bobbing, dirty marking)
    update(deltaTime) {
        super.update(deltaTime);    // calls markPositionDirty()
        this.applyBobbing();
    }

    updateDebugAttributes() {
        if (!this.element) return;
        this.element.setAttribute('data-idle', this.isIdle);
        this.element.setAttribute('data-hovering', this.isHovering);
        this.element.setAttribute('data-fluttering', this.fluttering);
        this.element.setAttribute('data-direction', this.direction);
    }
}