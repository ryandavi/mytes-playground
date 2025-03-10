
class AnimatedMapObject extends MapObject {
    constructor(type, variant, posX, posY, config, options = {}) {
        super(type, variant, posX, posY, config);
        
        // Create animation configuration from spriteConfig
        const animConfig = {
            frameWidth: config.spriteConfig?.frameWidth,
            frameHeight: config.spriteConfig?.frameHeight,
            scale: config.spriteConfig?.scale || 1,
            frameDelay: options.frameDelay || 100, // 100ms delay by default
            animations: this.convertAnimations(config.spriteConfig?.animations)
        };
        
        // Create animation controller
        this.animation = new AnimationController(this, animConfig);
    }
    
    // Convert animations to the unified format
    convertAnimations(animations) {
        if (!animations) return {};
        
        // If animations are already in the expected format, just return them
        return animations;
    }

    // Delegate animation methods to the controller
    playAnimation(animationName, onComplete) {
        this.animation.play(animationName, onComplete);
    }

    updateAnimation() {
        this.animation.update();
    }

    updateSpriteFrame() {
        this.animation.updateFrame();
    }

    render(container, parent) {
        const element = super.render(container, parent);
        
        // Add type and variant classes
        element.classList.add(this.type.toLowerCase());
        if (this.variant) {
            element.classList.add(this.variant);
        }

        if (this.config.renderType === 'animated' || this.config.renderType === 'sprite') {
            // Set up the animation controller with the rendered element
            this.animation.setup(element);

            // Start default animation if specified
            const defaultAnimation = this.config.spriteConfig?.default || 'idle';
            this.playAnimation(defaultAnimation);
        }

        return element;
    }

    update() {
        super.update();
        if(!this.animation?.paused) this.updateAnimation();
    }
}

class TreasureChestMapObject extends AnimatedMapObject {
    constructor(type, variant, posX, posY, config, options = {}) {
        super(type, variant, posX, posY, config);
        this.state = config.spriteConfig.default;
        this.items = [];
        this.droppedItems = [];
        this.canClose = config.canClose || false;

        this.addItems(options.items || []);
    }

    addItems(items) {
        this.items = items;
    }

    open(parent) {
        if (this.state !== 'closed') return;

        this.state = 'opening';
        this.element.classList.remove('closed');
        this.element.classList.add('opening');

        this.playAnimation('opening', () => {
            this.state = 'opened';
            this.element.classList.remove('opening');
            this.element.classList.add('opened');
            this.playAnimation('opened');
            this.spawnItems(parent);
        });
    }

    close(parent) {
        if (this.state !== 'opened' || !this.canClose) return;

        this.state = 'closing';
        this.element.classList.remove('opened');
        this.element.classList.add('closing');

        this.playAnimation('closing', () => {
            this.state = 'closed';
            this.element.classList.remove('closing');
            this.element.classList.add('closed');
            this.playAnimation('closed');
        });
    }

    press(parent) {
        if (!this.active || !parent.activeMyte) return false;

        const myte = parent.activeMyte;
        const dx = this.posX - myte.posX;
        const dy = this.posY - myte.posY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Handle different states
        if (this.state === 'closed') {
            if (this.config.interactionRadius === -1) {
                this.open(parent);
                return true;
            }

            if (distance <= this.config.interactionRadius) {
                myte.queue.add('go_to_object', {
                    target: this,
                    onComplete: () => this.open(parent)
                });
                return true;
            }

            myte.queue.add('go_to_object', { target: this });
            return true;
        }
        else if (this.state === 'opened' && this.canClose) {
            if (this.config.interactionRadius === -1) {
                this.close(parent);
                return true;
            }

            if (distance <= this.config.interactionRadius) {
                myte.queue.add('go_to_object', {
                    target: this,
                    onComplete: () => this.close(parent)
                });
                return true;
            }

            myte.queue.add('go_to_object', { target: this });
            return true;
        }

        return false;
    }

    spawnItems(parent) {
        if (!this.items.length) return;

        const spawnPoint = {
            x: this.posX + this.size.width / 2,
            y: this.posY + this.size.height / 2
        };

        const spreadAngle = Math.PI / 6;
        const baseVelocity = 5;

        this.items.forEach((item, index) => {
            const angle = this.items.length === 1
                ? -Math.PI / 2
                : -Math.PI / 2 - spreadAngle / 2 + (spreadAngle * index / (this.items.length - 1));

            const droppedItem = new DroppedMapItem(
                item.type,
                item.variant,
                spawnPoint.x,
                spawnPoint.y
            );

            droppedItem.velocityX = Math.cos(angle) * baseVelocity;
            droppedItem.velocityY = Math.sin(angle) * baseVelocity;
            droppedItem.velocityZ = baseVelocity;

            parent.canvas.querySelector('.layer.foreground').appendChild(droppedItem.element);
            this.droppedItems.push(droppedItem);
        });

        // Clear items after spawning
        this.items = [];
    }

    update(parent) {
        super.update();
        this.droppedItems = this.droppedItems.filter(item => {
            if (!item.collected) {
                item.update(parent.activeMyte);
                return true;
            }
            return false;
        });
    }

    render(container, parent) {
        const element = super.render(container, parent);
        element.classList.add('treasure-chest', this.state);
        return element;
    }
}

class LightMapObject extends AnimatedMapObject {
    constructor(type, variant, posX, posY, config, options = {}) {
        super(type, variant, posX, posY, config);
        this.state = config.default || 'off';
    }

    getNextAction() {
        return {
            method: this.toggleLight.bind(this),
            allowed: true
        };
    }

    handleInteraction(parent, action) {
        const myte = parent.activeMyte;
        const distance = Math.hypot(this.posX - myte.posX, this.posY - myte.posY);

        if (distance <= this.config.interactionRadius) {
            this.playAnimation('flicker', () => action.method(parent));
            return true;
        }

        myte.queue.add('go_to_object', {
            target: this,
            onComplete: () => this.playAnimation('flicker', () => action.method(parent))
        });
        return true;
    }

    press(parent) {
        if (!this.active || !parent.activeMyte) return false;

        const action = this.getNextAction();
        return this.handleInteraction(parent, action);
    }

    toggleLight(parent) {
        const newState = this.state === 'off' ? 'on' : 'off';
        const animationSequence = {
            'off': ['turnOn', 'idle'],
            'on': ['turnOff', 'off']
        };

        this.state = newState;
        this.element.setAttribute('data-state', this.state);

        // Play animation sequence
        const [firstAnim, secondAnim] = animationSequence[this.state];
        this.playAnimation(firstAnim, () => {
            this.playAnimation(secondAnim);
        });

        // Apply effects
        if (this.state === 'on' && parent.activeMyte) {
            parent.activeMyte.stats.updateMood(5);
        }
    }

    render(container, parent) {
        const element = super.render(container, parent);
        element.classList.add('light-object');
        element.setAttribute('data-state', this.state);
        return element;
    }
}

class FountainMapObject extends AnimatedMapObject {
    constructor(type, variant, posX, posY, config, options = {}) {
        super(type, variant, posX, posY, config);
        this.state = config.default || 'on';

        // Fountain configuration
        this.moodBoostRadius = config.moodBoostRadius || 150;
        this.moodBoostAmount = config.moodBoostAmount || 0.1;
        this.boostCooldown = config.boostCooldown || 1000;

        // Boost tracking with Map for better performance
        this.lastBoostTimes = new Map();
    }

    getNextAction() {
        return {
            method: this.toggle.bind(this),
            allowed: true
        };
    }

    handleInteraction(parent, action) {
        const myte = parent.activeMyte;
        const distance = Math.hypot(this.posX - myte.posX, this.posY - myte.posY);

        if (distance <= this.config.interactionRadius) {
            action.method(parent);
            return true;
        }

        myte.queue.add('go_to_object', {
            target: this,
            onComplete: () => action.method(parent)
        });
        return true;
    }

    press(parent) {
        if (!this.active || !parent.activeMyte) return false;

        const action = this.getNextAction();
        return this.handleInteraction(parent, action);
    }

    toggle(parent) {
        const newState = this.state === 'on' ? 'off' : 'on';
        const animationSequence = {
            'off': ['turnOn', 'idle'],
            'on': ['turnOff', 'off']
        };

        this.state = newState;
        this.element.setAttribute('data-state', this.state);

        // Play animation sequence
        const [firstAnim, secondAnim] = animationSequence[this.state];
        this.playAnimation(firstAnim, () => {
            this.playAnimation(secondAnim);
        });
    }

    applyMoodBoost(myte) {
        const now = Date.now();
        const lastBoost = this.lastBoostTimes.get(myte.id) || 0;

        if (now - lastBoost >= this.boostCooldown) {
            myte.stats.updateMood(this.moodBoostAmount);
            this.lastBoostTimes.set(myte.id, now);

            // Occasional happiness expression
            if (Math.random() < 0.1) {
                myte.queue.addExpression('happy');
            }
        }
    }

    checkNearbyMytes(parent) {
        if (this.state !== 'on' || !parent.mytes) return;

        parent.mytes.forEach(myte => {
            if (!myte.isActive) return;

            const distance = Math.hypot(
                this.posX - myte.posX,
                this.posY - myte.posY
            );

            if (distance <= this.moodBoostRadius) {
                this.applyMoodBoost(myte);
            }
        });
    }

    render(container, parent) {
        const element = super.render(container, parent);
        element.classList.add('fountain');
        element.setAttribute('data-state', this.state);
        return element;
    }

    update(parent) {
        super.update(parent);
        this.checkNearbyMytes(parent);
    }
}


class ButterflyMapObject extends AnimatedMapObject {
    constructor(type, variant, posX, posY, config, options = {}) {
        // Set up butterfly-specific options
        let butterflyConfig = {...config};
        
        // Configure sprites based on variant
        if (variant === "small") {
            butterflyConfig.spriteConfig = {
                frameWidth: 50,
                frameHeight: 50,
                scale: options.scale || 1,
                spriteSheet: "images/MapObjects/butterfly_small.gif",
                animations: {
                    // Direction animations with 2D frames [x, y]
                    "E": { frames: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]], loop: true }, // right
                    "W": { frames: [[0, 1], [1, 1], [2, 1], [3, 1], [4, 1]], loop: true }, // left
                    "N": { frames: [[0, 2], [1, 2], [2, 2], [3, 2], [4, 2]], loop: true }, // up
                    "S": { frames: [[0, 3], [1, 3], [2, 3], [3, 3], [4, 3]], loop: true }, // down
                    // Idle animation (use down-facing frame)
                    "idle": { frames: [[1, 3]], loop: true },
                    // Flutter animation for idle but fluttering wings
                    "flutter": { frames: [[2, 3], [1, 3], [0, 3], [1, 3]], loop: true }
                },
                default: "idle"
            };
        } else {
            butterflyConfig.spriteConfig = {
                frameWidth: 100,
                frameHeight: 100,
                scale: options.scale || 1,
                spriteSheet: "images/MapObjects/butterfly.gif",
                animations: {
                    // Direction animations with 2D frames [x, y]
                    "E": { frames: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]], loop: true }, // right
                    "W": { frames: [[0, 1], [1, 1], [2, 1], [3, 1], [4, 1]], loop: true }, // left
                    "N": { frames: [[0, 2], [1, 2], [2, 2], [3, 2], [4, 2]], loop: true }, // up
                    "S": { frames: [[0, 3], [1, 3], [2, 3], [3, 3], [4, 3]], loop: true }, // down
                    // Idle animation
                    "idle": { frames: [[1, 3]], loop: true },
                    // Flutter animation
                    "flutter": { frames: [[2, 3], [1, 3], [0, 3], [1, 3]], loop: true }
                },
                default: "idle"
            };
        }
        
        super(type, variant, posX, posY, butterflyConfig, options);
        
        // Movement properties
        this.velocity = { x: 0, y: 0 };
        this.speed = config.speed || 1;
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
        this.bobAmplitude = options.bobAmplitude || 15;
        this.bobFrequency = options.bobFrequency || 0.05;
        
        // Butterfly hover/move state system
        this.stateTimer = Date.now();
        this.hoverDuration = 2000 + Math.random() * 2000;
        this.moveDuration = 2000 + Math.random() * 3000;
        this.isHovering = Math.random() > 0.5;
        
        // Idle state
        this.isIdle = false;
        this.idleTimer = 0;
        this.idleDuration = 0;
        this.idleChance = options.idleChance || 0.001;
        
        // Flutter properties
        this.fluttering = false;
        this.flutterChance = options.flutterChance || 0.01;
        
        // Set initial random velocity
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
        
        this.animation.sprite.style.transform = `translateY(${bobOffset}px)`;
    }
    
    // Butterfly behavior states
    updateBehavior() {
        const currentTime = Date.now();
        
        // Handle idle state
        if (this.isIdle) {
            // Check if idle time is over
            if (currentTime - this.idleTimer > this.idleDuration) {
                this.isIdle = false;
                this.fluttering = false;
                this.stateTimer = currentTime;
                
                // Start moving again with random direction
                const angle = Math.random() * Math.PI * 2;
                this.velocity.x = Math.cos(angle) * this.speed * 0.5;
                this.velocity.y = Math.sin(angle) * this.speed * 0.5;
            } else {
                // Stay idle
                this.velocity.x = 0;
                this.velocity.y = 0;
                
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
                
                return; // Skip the rest of behavior updates
            }
        } else {
            // Random chance to go idle
            if (Math.random() < this.idleChance) {
                this.isIdle = true;
                this.fluttering = false;
                this.idleTimer = currentTime;
                this.idleDuration = 3000 + Math.random() * 5000;
                this.velocity.x = 0;
                this.velocity.y = 0;
                this.playAnimation('idle');
                return;
            }
        }
        
        // Normal hover/move behavior
        const timeInState = currentTime - this.stateTimer;
        
        if (this.isHovering) {
            // Hovering state
            if (timeInState > this.hoverDuration) {
                // Switch to moving
                this.isHovering = false;
                this.stateTimer = currentTime;
                this.moveDuration = 2000 + Math.random() * 3000;
                
                // Choose random direction
                const angle = Math.random() * Math.PI * 2;
                this.velocity.x = Math.cos(angle) * this.speed;
                this.velocity.y = Math.sin(angle) * this.speed;
            } else {
                // Hover with minimal movement
                this.velocity.x = Math.sin(currentTime * 0.001) * this.speed * 0.2;
                this.velocity.y = Math.cos(currentTime * 0.001) * this.speed * 0.2;
            }
        } else {
            // Moving state
            if (timeInState > this.moveDuration) {
                // Switch to hovering
                this.isHovering = true;
                this.stateTimer = currentTime;
                this.hoverDuration = 1000 + Math.random() * 2000;
                
                // Slow down
                this.velocity.x *= 0.3;
                this.velocity.y *= 0.3;
            } else {
                // Occasional direction adjustments
                if (Math.random() < 0.05) {
                    this.velocity.x += (Math.random() - 0.5) * this.speed;
                    this.velocity.y += (Math.random() - 0.5) * this.speed;
                    
                    // Normalize to maintain consistent speed
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
            }
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
            this.posX > this.bounds.right - this.config.spriteConfig.frameWidth) {
            this.velocity.x *= -1;
            this.posX = Math.max(
                this.bounds.left, 
                Math.min(this.bounds.right - this.config.spriteConfig.frameWidth, this.posX)
            );
        }
        
        // Check vertical boundaries
        if (this.posY < this.bounds.top || 
            this.posY > this.bounds.bottom - this.config.spriteConfig.frameHeight) {
            this.velocity.y *= -1;
            this.posY = Math.max(
                this.bounds.top, 
                Math.min(this.bounds.bottom - this.config.spriteConfig.frameHeight, this.posY)
            );
        }
    }
    
    renderSprite(){

    }

    render(container, parent) {
        const element = super.render(container, parent);
        element.classList.add('animated-map-object');
        
        // Explicitly set background image in case it wasn't set by the controller
        this.animation.sprite.style.backgroundImage = `url(${this.config.spriteConfig.spriteSheet})`;

        // Add data attributes for debugging
        element.setAttribute('data-idle', this.isIdle);
        element.setAttribute('data-hovering', this.isHovering);
        element.setAttribute('data-fluttering', this.fluttering);
        element.setAttribute('data-direction', this.direction);
        
        return element;
    }
    
    update(parent) {
        // Update butterfly behavior
        this.updateBehavior();
        
        // Update position based on velocity
        this.posX += this.velocity.x;
        this.posY += this.velocity.y;
        
        // Check boundaries
        this.checkBoundaries();
        
        // Update visual position
        if (this.element) {
            this.element.style.left = `${this.posX}px`;
            this.element.style.top = `${this.posY}px`;
            
            // Update z-index if parent has getZIndex method
            if (parent && parent.getZIndex) {
                const height = this.config.spriteConfig.frameHeight || this.config.spriteConfig.frameWidth;
                this.element.style.zIndex = parent.getZIndex(this.posY, height);
            }
        }
        
        // Update direction based on movement
        this.updateDirection();
        
        // Update animation
        super.update();
        
        // Apply bobbing effect
        this.applyBobbing();
        
        // Update debug attributes
        if (this.element) {
            this.element.setAttribute('data-idle', this.isIdle);
            this.element.setAttribute('data-hovering', this.isHovering);
            this.element.setAttribute('data-fluttering', this.fluttering);
            this.element.setAttribute('data-direction', this.direction);
        }
    }
}


class BallMapObject extends AnimatedMapObject {
    constructor(type, variant, posX, posY, config, options = {}) {
        // Configure ball-specific animation settings
        const ballConfig = {
            ...config,
            spriteConfig: {
                frameWidth: config.size?.width || 64,
                frameHeight: config.size?.height || 64,
                scale: options.scale || 1,
                frameDelay: options.frameDelay || 50, // Faster animation for smoother rotation
                animations: {
                    "idle": { 
                        frames: [[0, 0]], // , [1, 0], [2, 0], [3, 0], [4, 0], [5, 0]
                        loop: true 
                    },
                    "rotateX": { 
                        frames: [[0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1]],
                        loop: true 
                    },
                    "rotateY": { 
                        frames: [[0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [5, 2]],
                        loop: true 
                    },
                    "rotateZ": { 
                        frames: [[0, 3], [1, 3], [2, 3], [3, 3], [4, 3], [5, 3]],
                        loop: true 
                    },
                    "rotateX_reverse": { 
                        frames: [[5, 1], [4, 1], [3, 1], [2, 1], [1, 1], [0, 1]],
                        loop: true 
                    },
                    "rotateY_reverse": { 
                        frames: [[5, 2], [4, 2], [3, 2], [2, 2], [1, 2], [0, 2]],
                        loop: true 
                    },
                    "rotateZ_reverse": { 
                        frames: [[5, 3], [4, 3], [3, 3], [2, 3], [1, 3], [0, 3]],
                        loop: true 
                    }
                },
                default: "idle"
            }
        };



        // Call the AnimatedMapObject constructor
        super(type, variant, posX, posY, ballConfig, options);



        // Physics properties
        this.velocity = { x: 0, y: 0 };
        this.friction = config.friction || 0.95;
        this.maxSpeed = config.speed || 3;
        this.isMoving = false;

        // Interaction properties
        this.pushForce = config.pushForce || 5;
        this.lastPushTime = 0;
        this.pushCooldown = options.pushCooldown || 1500; // ms


        
        // Debug flag
        this.debug = true;
    }


    canBeDragged() {
        // First check the parent class conditions
        if (!super.canBeDragged()) return false;
        
        // Don't allow dragging if the ball is moving
        if (this.isMoving) return false;
        
        return true;
    }

    getColliderCenter() {
        return {
            x: this.posX + this.collider.offsetX,
            y: this.posY + this.collider.offsetY
        };
    }

    getMyteColliderCenter(myte) {
        return {
            x: myte.posX + (myte.collider?.offsetX || myte.size.width / 2),
            y: myte.posY + (myte.collider?.offsetY || myte.size.height / 2)
        };
    }

    reactToNearbyCreature(myte) {

        if (this.isDragging) return;

        const now = Date.now();
        if (now - this.lastPushTime < this.pushCooldown) return;

        if(!myte.is_moving()) return;

        // Check if Myte's collider collides with ball
        let collides = myte.parent.checkCollision(myte, this);

        if (collides) {
            // Calculate push direction and force

            const ballCenter = this.getColliderCenter();
            const myteCenter = this.getMyteColliderCenter(myte);
    
            // Calculate distance between collider centers
            const dx = ballCenter.x - myteCenter.x;
            const dy = ballCenter.y - myteCenter.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            const pushX = (dx / distance) * this.pushForce;
            const pushY = (dy / distance) * this.pushForce;

            // Apply push force as velocity
            this.velocity.x += pushX;
            this.velocity.y += pushY;

            // Cap velocity at maxSpeed
            const speed = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.y * this.velocity.y);
            if (speed > this.maxSpeed) {
                this.velocity.x = (this.velocity.x / speed) * this.maxSpeed;
                this.velocity.y = (this.velocity.y / speed) * this.maxSpeed;
            }

            // Set the appropriate animation based on movement direction
            this.updateBallAnimation();

            this.isMoving = true;
            this.lastPushTime = now;

            // Optional: Make the creature react
            myte.queue.addExpression('happy');
            
            if (this.debug) {
                console.log("Ball pushed! Velocity X:", this.velocity.x.toFixed(2), "Y:", this.velocity.y.toFixed(2));
            }
        }
    }
    
    updateBallAnimation() {
        // Simple approach: choose animation based on primary direction of movement
        const absX = Math.abs(this.velocity.x);
        const absY = Math.abs(this.velocity.y);
        
        // Horizontal movement is primary
        if (absX > absY) {
            // Moving right (positive X) = rotateY_reverse
            // Moving left (negative X) = rotateY
            if(this.animation && this.animation.paused){
                // unpause current animation before getting new one
                this.animation.paused = false;
            }
            const animName = this.velocity.x > 0 ? 'rotateZ_reverse' : 'rotateY';
            this.playAnimation(animName);
            if (this.debug) console.log("Playing horizontal animation:", animName);
        } 
        // Vertical movement is primary
        else {
            // Moving down (positive Y) = rotateX
            // Moving up (negative Y) = rotateX_reverse
            if(this.animation && this.animation.paused){
                // unpause current animation before getting new one
                this.animation.paused = false;
            }
            const animName = this.velocity.y > 0 ? 'rotateX' : 'rotateX_reverse';
            this.playAnimation(animName);
            if (this.debug) console.log("Playing vertical animation:", animName);
        }
    }

    updatePhysics() {
        // Apply physics
        if (this.isMoving) {
            // Store previous position
            const previousX = this.posX;
            const previousY = this.posY;
            
            // Update position based on velocity
            this.posX += this.velocity.x;
            this.posY += this.velocity.y;
            
            // Check boundaries and handle collision
            this.checkBoundaries();
            
            // Apply friction to gradually slow down
            this.velocity.x *= this.friction;
            this.velocity.y *= this.friction;
            
            // Update animation if still moving significantly
            if (Math.abs(this.velocity.x) > 0.1 || Math.abs(this.velocity.y) > 0.1) {
                this.updateBallAnimation();
            }
            // Check if ball has effectively stopped
            else if (Math.abs(this.velocity.x) < 0.3 && Math.abs(this.velocity.y) < 0.3) {
                this.velocity.x = 0;
                this.velocity.y = 0;
                this.isMoving = false;
                
                // Don't switch to idle - just pause the current animation
                if (this.animation) {
                    this.pauseAnimation();
                }
                
                if (this.debug) console.log("Ball stopped, staying on last frame");
            }
            
            // Update element position
            if (this.element) {
                this.element.style.left = `${this.posX}px`;
                this.element.style.top = `${this.posY}px`;
            }
        }
    }
    
    checkBoundaries() {
        // Get container bounds
        const bounds = this.bounds || {
            left: 0,
            top: 0,
            right: window.innerWidth,
            bottom: window.innerHeight
        };
        
        const bounceMultiplier = 0.8; // Reduce velocity slightly on bounce
        
        // Check and handle horizontal boundaries
        if (this.posX < bounds.left) {
            this.posX = bounds.left;
            this.velocity.x = Math.abs(this.velocity.x) * bounceMultiplier;
            // Update animation after bounce
            this.updateBallAnimation();
            if (this.debug) console.log("Bounced left boundary");
        } else if (this.posX + this.size.width > bounds.right) {
            this.posX = bounds.right - this.size.width;
            this.velocity.x = -Math.abs(this.velocity.x) * bounceMultiplier;
            // Update animation after bounce
            this.updateBallAnimation();
            if (this.debug) console.log("Bounced right boundary");
        }
        
        // Check and handle vertical boundaries
        if (this.posY < bounds.top) {
            this.posY = bounds.top;
            this.velocity.y = Math.abs(this.velocity.y) * bounceMultiplier;
            // Update animation after bounce
            this.updateBallAnimation();
            if (this.debug) console.log("Bounced top boundary");
        } else if (this.posY + this.size.height > bounds.bottom) {
            this.posY = bounds.bottom - this.size.height;
            this.velocity.y = -Math.abs(this.velocity.y) * bounceMultiplier;
            // Update animation after bounce
            this.updateBallAnimation();
            if (this.debug) console.log("Bounced bottom boundary");
        }
    }

    // This method is explicitly overridden from the Animation Controller
    // to ensure our ball animation follows physical movement
    playAnimation(animationName, onComplete) {
        if (this.debug) console.log("Ball playAnimation called with:", animationName);
        
        // If we're playing idle but we already have an animation running,
        // skip it to preserve the last animation frame
        if (animationName === 'idle' && this.animation && this.animation.currentAnimation) {
            if (this.debug) console.log("Skipping idle animation to preserve last frame");
            return;
        }
        
        // Call the parent class's animation method
        if (this.animation) {
            this.animation.play(animationName, onComplete);
        }
    }
    
    // Add a pause animation method
    pauseAnimation() {
        if (this.animation) {
            // If the animation controller doesn't have a native pause,
            // we can just hold the current frame by stopping updates
            this.animation.paused = true;
            if (this.debug) console.log("Animation paused at current frame");
        }
    }

    render(container, parent) {
        const element = super.render(container, parent);
        element.classList.add('ball-object');
        element.setAttribute('data-moving', this.isMoving);
        
        // Set up boundaries and other parent-dependent configs
        if (parent) {
            this.setup(parent);
        }
        
        return element;
    }
    
    // Override setup method to ensure we're capturing the map bounds
    setup(parent) {
        if (parent && parent.getMaxDimensions) {
            const mapDimensions = parent.getMaxDimensions();
            this.bounds = {
                left: 0,
                top: 0,
                right: mapDimensions.width,
                bottom: mapDimensions.height
            };
            console.log("Ball boundaries set:", this.bounds);
        }
    }

    update(parent) {
        // Check for nearby mytes first (so we can apply forces before physics)
        if (parent && parent.mytes) {
            parent.mytes.forEach(myte => {
                if (myte.isActive) {
                    this.reactToNearbyCreature(myte);
                }
            });
        }
        
        // Update physics
        this.updatePhysics();
        
        // Update animation through AnimatedMapObject's update method
        super.update(parent);
        
        // Update element attributes for debugging
        if (this.element) {
            this.element.setAttribute('data-moving', this.isMoving);
            this.element.setAttribute('data-velocity-x', this.velocity.x.toFixed(2));
            this.element.setAttribute('data-velocity-y', this.velocity.y.toFixed(2));
            
            // Update z-index if parent has getZIndex method
            if (parent && parent.getZIndex) {
                this.element.style.zIndex = parent.getZIndex(this.posY, this.size.height);
            }
        }
    }
}