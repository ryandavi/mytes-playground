// Base shared configuration that all object types can use
const BASE_OBJECT_CONFIG = {
    // Rendering
    renderType: 'single',      // single, split, animated, sprite
    renderPriority: 1,        // Z-index priority
    scale: 1,                 // Size multiplier
    size: {                   // Base size before scaling
        width: 64,
        height: 64
    },
    
    // Physics & Collision
    walkable: true,           // Can be walked over
    collision: false,         // Has collision detection
    collisionRadius: 32,      // Collision detection radius
    
    // Interaction
    interactionType: null,    // Type of interaction (mood_boost, dance, consume, etc)
    interactionRadius: 400,   // Distance for interaction
    interactionCooldown: 5000,// Time between interactions
    
    // State
    canToggle: false,        // Can be turned on/off
    default: 'default',      // Default state
    states: ['default'],     // Possible states
    
    // Animation
    animates: false,         // Has animations
    frameRate: 100,          // MS between frames
    
    // Effects
    particleEffects: false,  // Emits particles
    lightEmission: false,    // Emits light
    soundEffects: false,     // Makes sounds
    
    // Gameplay
    lootable: false,        // Can drop items
    consumable: false,      // Can be consumed
    storable: false,        // Can be stored in inventory
    
    // Persistence
    saveable: false,        // State persists between sessions
    respawns: false,        // Respawns after removal
    respawnTime: 300000     // Time until respawn (5 min)
};

// Base configuration for different object types
const MAP_OBJECT_TYPES = {
    // Interactive nature objects
    GRASS: {
        ...BASE_OBJECT_CONFIG,
        category: 'nature',
        variants: ['grass_1', 'grass_2', 'grass_3'],
        renderType: 'split', // Uses separate front/back images
        walkable: true,
        collision: false,
        scale: 1,
        renderPriority: 1
    },
    FLOWER: {
        ...BASE_OBJECT_CONFIG,
        category: 'nature',
        variants: ['flower_red', 'flower_yellow', 'flower_blue'],
        renderType: 'single',
        walkable: true,
        collision: false,
        scale: 1,
        renderPriority: 2,
        interactionType: 'mood_boost',
        interactionRadius: 100
    },

    // Interactive items
    MUSIC_BOX: {
        ...BASE_OBJECT_CONFIG,
        category: 'item',
        variants: ['music_box'],
        renderType: 'single',
        walkable: false,
        collision: true,
        scale: 1,
        renderPriority: 2,
        interactionType: 'dance',
        interactionRadius: 150,
        animates: true
    },

    FOOD: {
        ...BASE_OBJECT_CONFIG,
        category: 'item',
        variants: ['apple', 'turnip', 'acorn'],
        renderType: 'single',
        walkable: true,
        collision: false,
        scale: 1,
        renderPriority: 1,
        interactionType: 'consume',
        interactionRadius: 50,
        consumable: true
    },

    TREASURE_CHEST: {
        ...BASE_OBJECT_CONFIG,
        category: 'container',
        variants: ['wooden_chest', 'golden_chest'],
        walkable: false,
        collision: true,
        canClose: true,

        // render
        renderType: 'sprite',
        renderPriority: 2,
        scale: 1,
        size: { width: 64, height: 64 },

        // interaction
        interactionType: 'open',

        spriteConfig: {
            frameWidth: 32,
            frameHeight: 32,
            scale: 2,
            default: 'closed',
            animations: {
                closed: {
                    loop: true,
                    frames: [0]
                },
                opening: {
                    loop: false,
                    frames: [0, 1, 2, 3, 4]
                },
                closing: {
                    loop: false,
                    frames: [4, 3, 2, 1, 0]
                },
                opened: {
                    loop: true,
                    frames: [4]
                }
            }
        }
    },

    FOUNTAIN: {
        ...BASE_OBJECT_CONFIG,
        category: 'interactive',
        variants: ['stone', 'marble'],
        renderType: 'animated',
        walkable: false,
        collision: true,
        scale: 1,
        renderPriority: 2,
        interactionType: 'mood_boost',
        interactionRadius: 150,
        default: 'on',  // Initial state

        // Fountain-specific settings
        moodBoostRadius: 150,
        moodBoostAmount: 0.1,
        boostCooldown: 1000,

        spriteConfig: {
            frameWidth: 48,
            scale: 2,
            animations: {
                idle: {
                    loop: true,
                    frames: [0, 1, 2, 3]
                },
                off: {
                    loop: false,
                    frames: [0]
                },
                turnOn: {
                    loop: false,
                    frames: [0, 1, 2, 3]
                },
                turnOff: {
                    loop: false,
                    frames: [3, 2, 1, 0]
                },
                splash: {
                    loop: true,
                    frames: [4, 5, 6, 7]
                }
            }
        }
    },

    LANTERN: {
        ...BASE_OBJECT_CONFIG,
        category: 'interactive',
        variants: ['paper', 'crystal'],
        renderType: 'animated',
        walkable: true,
        collision: false,
        scale: 1,
        renderPriority: 2,
        interactionType: 'light',
        interactionRadius: 100,
        default: 'off',  // Initial state

        spriteConfig: {
            frameWidth: 24,
            scale: 2,
            animations: {
                idle: {
                    loop: true,
                    frames: [0, 1, 2, 1]
                },
                off: {
                    loop: false,
                    frames: [0]
                },
                turnOn: {
                    loop: false,
                    frames: [0, 1, 2]
                },
                turnOff: {
                    loop: false,
                    frames: [2, 1, 0]
                },
                flicker: {
                    loop: false,  // Changed to false since it's a transition animation
                    frames: [3, 4, 5, 4, 3]
                }
            }
        }
    },

    // Base configuration for all growing plants
    GROWING_PLANT: {
        ...BASE_OBJECT_CONFIG,
        category: 'plant',
        renderType: 'animated',
        walkable: true,
        collision: false,
        scale: 1,
        renderPriority: 2,
        interactionType: 'tend',
        interactionRadius: 100,
        default: 'seed',




        // Growth mechanics
        growthConfig: {
            baseGrowthTime: 300000, // 5 minutes per stage
            waterBoost: 1.5,        // Growth speed multiplier when watered
            seasonMultiplier: {
                spring: 1.5,
                summer: 1.0,
                autumn: 0.7,
                winter: 0.3
            }
        },

        // Breeding mechanics
        breedingConfig: {
            pollinationRadius: 150,
            pollinationChance: 0.2,
            mutationChance: 0.1,
            traitInheritance: {
                color: 0.7,    // 70% chance to inherit from parent
                size: 0.5,     // 50% chance to inherit from parent
                variant: 0.3   // 30% chance to inherit from parent
            }
        }
    },

    NIGHT_BLOOM: {
        ...BASE_OBJECT_CONFIG,
        variants: ['blue_moon', 'evening_star', 'night_whisper'],
        default: 'closed',
        
        dayNightConfig: {
            openTime: '18:00',    // 6 PM
            closeTime: '06:00',   // 6 AM
            transitionDuration: 3000,  // 3 seconds to open/close
            glowIntensity: 0.6,   // Nighttime glow intensity
            moonlightBoost: 1.2   // Growth boost during full moon
        },

        spriteConfig: {
            frameWidth: 32,
            scale: 2,
            animations: {
                closed: {
                    loop: false,
                    frames: [0]
                },
                opening: {
                    loop: false,
                    frames: [0, 1, 2, 3]
                },
                open: {
                    loop: true,
                    frames: [3, 4, 5, 4]  // Gentle swaying when open
                },
                closing: {
                    loop: false,
                    frames: [3, 2, 1, 0]
                },
                // Growth stages
                seed: { loop: false, frames: [8] },
                sprout: { loop: true, frames: [9, 10] },
                growing: { loop: true, frames: [11, 12] },
                mature: { loop: true, frames: [0] }  // Returns to daily cycle
            }
        }
    },

    CROP_PLANT: {
        ...BASE_OBJECT_CONFIG,
        variants: ['tomato', 'carrot', 'wheat', 'berry'],
        category: 'crop',
        interactionType: 'tend',
        renderType: 'animated',
        walkable: true,
        collision: false,
        scale: 1,
        renderPriority: 2,
        interactionType: 'tend',
        interactionRadius: 100,
        default: 'seed',

        // Growth mechanics
        growthConfig: {
            baseGrowthTime: 3000, // 5 minutes per stage
            waterBoost: 1.5,        // Growth speed multiplier when watered
            seasonMultiplier: {
                spring: 1.5,
                summer: 1.0,
                autumn: 0.7,
                winter: 0.3
            }
        },


        harvestConfig: {
            harvestableStage: 'mature',
            regrowth: true,       // Can regrow after harvest
            regrowthTime: 180000, // 3 minutes to regrow
            yield: {
                min: 1,
                max: 3,
                qualityChance: 0.1  // Chance for higher quality produce
            }
        },

        spriteConfig: {
            frameWidth: 32,
            frameHeight: 32,
            scale: 2,
            default: 'seed',
            animations: {
                // Growth stages
                seed: { 
                    loop: false, 
                    frames: [0] 
                },
                sprout: { 
                    loop: true, 
                    frames: [1] 
                },
                growing: { 
                    loop: true, 
                    frames: [2] 
                },
                flowering: { 
                    loop: true, 
                    frames: [3] 
                },
                mature: { 
                    loop: true, 
                    frames: [4] 
                },
                harvest: { 
                    loop: false, 
                    frames: [4] 
                }
            }
        }
    },

    BREEDING_FLOWER: {
        variants: ['rose', 'tulip', 'lily', 'orchid'],


        category: 'breeding-flower',
        interactionType: 'tend',
        renderType: 'animated',
        walkable: true,
        collision: false,
        scale: 1,
        renderPriority: 2,
        interactionType: 'tend',
        interactionRadius: 100,
        default: 'seed',


        geneticConfig: {
            genes: {
                petalColor: ['red', 'yellow', 'blue', 'white', 'purple'],
                petalCount: [4, 5, 6, 8],
                size: ['small', 'medium', 'large'],
                pattern: ['solid', 'striped', 'spotted', 'gradient']
            },
            dominanceRules: {
                petalColor: {
                    red: ['white', 'yellow'],
                    blue: ['white'],
                    purple: ['red', 'white']
                }
            }
        },

        seasonalConfig: {
            spring: {
                growthRate: 1.5,
                bloomDuration: 1.2,
                pollinationChance: 1.3
            },
            summer: {
                growthRate: 1.0,
                bloomDuration: 1.0,
                pollinationChance: 1.0
            },
            autumn: {
                growthRate: 0.7,
                bloomDuration: 0.8,
                pollinationChance: 0.6
            },
            winter: {
                growthRate: 0.3,
                bloomDuration: 0.5,
                pollinationChance: 0.2
            }
        },

        spriteConfig: {
            frameWidth: 32,
            scale: 2,
            animations: {
                // Base states
                seed: { loop: false, frames: [0] },
                sprout: { loop: true, frames: [1, 2] },
                bud: { loop: true, frames: [3, 4, 5, 4] },
                bloom: { loop: true, frames: [6, 7, 8, 7] },
                pollinating: { loop: false, frames: [9, 10, 11, 10, 9] },
                wilting: { loop: false, frames: [12, 13, 14] },
                dormant: { loop: false, frames: [15] }
            }
        }
    }
};

// Factory for creating specific types of map objects
class MapObjectFactory {
    static create(type, variant, x, y) {
        const config = MAP_OBJECT_TYPES[type];
        if (!config) {
            console.error(`Unknown object type: ${type}`);
            return null;
        }

        console.log(config.category);

        // Create specific type of object based on category
        switch (config.category) {
            case 'nature':
                return new NatureObject(type, variant, x, y, config);
            case 'crop':
                return new CropPlant(type, variant, x, y, config);
            case 'item':
                return new ItemObject(type, variant, x, y, config);
            case 'container':  // Add this case
                return new TreasureChest(type, variant, x, y, config);
            default:
                return new MapObject(type, variant, x, y, config);
        }
    }
}

// Base MapObject class
class MapObject {

    constructor(type, variant, posX, posY, config) {
        this.type = type;
        this.variant = variant;
        this.config = config;
        this.posX = posX;
        this.posY = posY;
        this.direction = DIRECTION.SOUTH;
        this.size = {
            width: 64 * (config.scale || 1),
            height: 64 * (config.scale || 1)
        };
        this.active = true;
        this.element = null;
        this.interactionState = {
            lastInteractionTime: 0,
            cooldown: 5000,
            activeInteractions: new Set()
        };
    }

    intersects(other) {
        return this.posX < other.posX + other.size.width &&
            this.posX + this.size.width > other.posX &&
            this.posY < other.posY + other.size.height &&
            this.posY + this.size.height > other.posY;
    }

    canInteract(myte) {
        if (!this.config.interactionType) return false;

        const timeSinceLastInteraction = Date.now() - this.interactionState.lastInteractionTime;
        if (timeSinceLastInteraction < this.interactionState.cooldown) return false;

        if (this.interactionState.activeInteractions.has(myte.id)) return false;

        return true;
    }

    interact(myte) {
        if (!this.canInteract(myte)) return false;

        this.interactionState.lastInteractionTime = Date.now();
        this.interactionState.activeInteractions.add(myte.id);

        // Handle interaction based on type
        switch (this.config.interactionType) {
            case 'mood_boost':
                myte.mood += 10;
                myte.queue.addExpression('happy');
                break;
            case 'dance':
                myte.queue.addExpression('dance');
                break;
            case 'consume':
                if (this.config.consumable) {
                    this.remove();
                }
                break;
        }

        setTimeout(() => {
            this.interactionState.activeInteractions.delete(myte.id);
        }, this.interactionState.cooldown);

        return true;
    }

    render(container, parent) {
        const divElement = document.createElement('div');
        divElement.classList.add('mapObject', this.variant);

        // Add interaction element if interactive
        if (this.config.interactionType) {
            const interactElement = document.createElement('div');
            interactElement.classList.add('interact');
            interactElement.addEventListener('click', () => this.press(parent));
            divElement.appendChild(interactElement);
        }

        // Set position and size
        Object.assign(divElement.style, {
            left: `${this.posX}px`,
            top: `${this.posY}px`,
            width: `${this.size.width}px`,
            height: `${this.size.height}px`,
            zIndex: parent.getZIndex(this.posY, this.size.height)
        });

        // Render based on type
        if (this.config.renderType === 'split') {
            this.renderSplitObject(divElement);
        } else {
            this.renderSingleObject(divElement);
        }

        this.element = divElement;
        container.appendChild(divElement);
        return divElement;
    }

    renderSplitObject(container) {
        ['back', 'front'].forEach(part => {
            const div = document.createElement('div');
            div.classList.add(part);
            div.style.backgroundImage = `url('../images/MapObjects/${this.variant}_${part}.png')`;
            div.style.backgroundSize = 'cover';

            if (part === 'front') {
                const randomDelay = Math.random() * 5;
                div.style.animationDelay = `${randomDelay}s`;
            }

            container.appendChild(div);
        });
    }

    renderSingleObject(container) {
        const div = document.createElement('div');
        div.classList.add('item', this.variant);
        container.appendChild(div);
    }

    press(parent) {
        if (!this.active) return false;

        if (parent.activeMyte) {
            // this.select();
            // parent.activeMyte.queue.addEatElement(this.element);

            parent.ui.setSelected(this);

            return true;
        }
        return false;
    }

    select() {
        this.element?.classList.add('selected-object');
    }

    unselect() {
        this.element?.classList.remove('selected-object');
    }

    remove() {
        this.element?.remove();
        this.active = false;
    }


    getOffsetRect() {
        // return this.parent.getLocalOffset(this.duplicate);
    }

    update() {

    }

}

class DroppedItem {
    constructor(type, variant, startX, startY) {
        this.type = type;
        this.variant = variant;
        this.posX = startX;
        this.posY = startY;
        this.posZ = 0;

        // physics
        this.velocityX = 0;
        this.velocityY = -5; // Initial upward velocity (negative is up)
        this.velocityZ = 0;
        this.gravity = 0.5;
        this.bounceCount = 0;
        this.maxBounces = 1;

        // grounding
        this.groundY = startY + 32; // Store the ground position
        this.grounded = false;

        // hover
        this.hoverOffset = 0;
        this.hoverSpeed = 0.05;

        // collecting
        this.magnetSpeed = 0.2;
        this.collected = false;
        this.minimumCollectDistance = 192 / 2;

        this.size = {
            width: 24,
            height: 24
        };

        this.element = this.createItemElement();
    }


    createItemElement() {
        const element = document.createElement('div');
        element.classList.add('dropped-item', this.type.toLowerCase(), this.variant);

        // Set size
        element.style.width = `${this.size.width}px`;
        element.style.height = `${this.size.height}px`;

        // Set initial position
        this.updatePosition(element);
        return element;
    }

    updatePosition(element = this.element) {
        if (!element) return;

        // Apply hover effect when grounded
        let displayY = this.posY;
        if (this.grounded) {
            this.hoverOffset += this.hoverSpeed;
            displayY -= Math.sin(this.hoverOffset) * 5;
        }

        // Subtract posZ for height
        displayY -= this.posZ;

        // Set position using top/left
        element.style.left = `${this.posX - (this.size.width / 2)}px`;
        element.style.top = `${displayY - (this.size.height / 2)}px`;
        // element.style.zIndex = parent.getZIndex(displayY, this.size.height)

        // Update z-index based on y position for proper layering
        element.style.zIndex = Math.floor(displayY);
    }

    update(myte = null) {
        if (this.collected) return;

        if (!this.grounded) {
            // Update positions
            this.posX += this.velocityX;

            // Apply gravity to Y velocity
            this.velocityY += this.gravity;
            this.posY += this.velocityY;

            // Check if item has landed at the ground position
            if (this.posY >= this.groundY) {
                this.posY = this.groundY;
                if (this.bounceCount < this.maxBounces) {
                    // Bounce with reduced velocity
                    this.velocityY = -this.velocityY * 0.4;
                    this.velocityX *= 0.8;  // Add some friction
                    this.bounceCount++;
                } else {
                    this.grounded = true;
                    this.velocityX = 0;
                    this.velocityY = 0;
                }
            }
        } else if (myte && myte.parent.activeMyte == myte) {
            // Magnet effect when grounded
            const myteCenter = {
                x: myte.posX + (myte.size.width / 2),
                y: myte.posY + (myte.size.height / 2)
            };

            const center = {
                x: this.posX + (this.size.width / 2),
                y: this.posY + (this.size.height / 2)
            };


            const dx = myteCenter.x - center.x;
            const dy = myteCenter.y - center.y;
            const distance = Math.sqrt(dx * dx + dy * dy);


            // if within collection distance
            if (distance < this.minimumCollectDistance) {
                const magnetStrength = 1 - (distance / this.minimumCollectDistance);
                this.posX += dx * this.magnetSpeed * magnetStrength;
                this.posY += dy * this.magnetSpeed * magnetStrength;

                if (distance < 20) {
                    this.collect(myte);
                }
            }
        }

        // Apply hover effect when grounded
        let displayY = this.posY;
        if (this.grounded) {
            this.hoverOffset += this.hoverSpeed;
            displayY -= Math.sin(this.hoverOffset) * 5;
        }

        // Update element position
        if (this.element) {
            this.element.style.left = `${this.posX}px`;
            this.element.style.top = `${displayY}px`;
        }
    }

    collect(myte) {
        if (this.collected) return;
        this.collected = true;

        // Add to inventory or apply effect based on item type
        switch (this.type) {
            case 'COIN':
                myte.parent.core.user.addCurrency('coins', 1);
                break;
            case 'HEALTH':
                myte.health = Math.min(myte.health + 20, 100);
                break;
            default:
                // Add to inventory
                myte.parent.inventory.addItem(this.variant, 1, this.type);
        }

        // Add collection animation class
        this.element.classList.add('collected');

        // Remove after animation
        setTimeout(() => {
            this.remove();
        }, 500);
    }

    remove() {
        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
    }

}



class AnimatedMapObject extends MapObject {
    constructor(type, variant, posX, posY, config) {
        super(type, variant, posX, posY, config);
        this.currentAnimation = null;
        this.lastFrameTime = 0;
        this.frameIndex = 0;
    }

    playAnimation(animationName, onComplete) {
        const animation = this.config.spriteConfig?.animations?.[animationName];
        if (!animation) return;

        // Don't restart the same animation
        if (this.currentAnimation?.name === animationName) return;

        this.currentAnimation = {
            name: animationName,
            frames: animation.frames,
            loop: animation.loop,
            onComplete: onComplete
        };

        // Set initial frame immediately
        this.frameIndex = animation.frames[0];
        this.updateSpriteFrame();

        // If single frame animation, call onComplete immediately
        if (animation.frames.length === 1) {
            if (onComplete) onComplete();
            // Keep current frame if it's meant to loop
            if (!animation.loop) {
                this.currentAnimation = null;
            }
        } else {
            this.lastFrameTime = Date.now();
        }
    }

    updateAnimation() {
        if (!this.currentAnimation || this.currentAnimation.frames.length === 1) return;

        const now = Date.now();
        if (now - this.lastFrameTime > 100) { // frameDelay hardcoded to 100ms
            const currentFrameIndex = this.currentAnimation.frames.indexOf(this.frameIndex);
            const nextFrameIndex = (currentFrameIndex + 1) % this.currentAnimation.frames.length;

            this.frameIndex = this.currentAnimation.frames[nextFrameIndex];
            this.lastFrameTime = now;
            this.updateSpriteFrame();

            // Handle animation completion
            if (nextFrameIndex === 0) {
                if (this.currentAnimation.onComplete) {
                    this.currentAnimation.onComplete();
                }
                if (!this.currentAnimation.loop) {
                    this.currentAnimation = null;
                }
            }
        }
    }

    updateSpriteFrame() {
        if (!this.element || !this.config.spriteConfig) return;

        const { frameWidth, scale = 1 } = this.config.spriteConfig;
        this.element.style.backgroundPosition = `${-this.frameIndex * frameWidth * scale}px 0px`;
    }

    render(container, parent) {
        const element = super.render(container, parent);

        if (this.config.renderType === 'animated' || this.config.renderType === 'sprite') {
            const { frameWidth, scale = 1 } = this.config.spriteConfig;
            element.style.width = `${frameWidth * scale}px`;
            element.style.height = `${(this.config.spriteConfig.frameHeight || frameWidth) * scale}px`;

            // Start default animation if specified
            const defaultAnimation = this.config.spriteConfig.default ? this.config.spriteConfig.default : 'idle';
            this.playAnimation(defaultAnimation);
        }

        return element;
    }

    update() {
        super.update();
        this.updateAnimation();
    }
}

class TreasureChest extends AnimatedMapObject {
    constructor(type, variant, posX, posY, config) {
        super(type, variant, posX, posY, config);
        this.state = config.spriteConfig.default;
        this.items = [];
        this.droppedItems = [];
        this.canClose = config.canClose || false;
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
                    targetObject: this,
                    onComplete: () => this.open(parent)
                });
                return true;
            }

            myte.queue.add('go_to_object', { targetObject: this });
            return true;
        }
        else if (this.state === 'opened' && this.canClose) {
            if (this.config.interactionRadius === -1) {
                this.close(parent);
                return true;
            }

            if (distance <= this.config.interactionRadius) {
                myte.queue.add('go_to_object', {
                    targetObject: this,
                    onComplete: () => this.close(parent)
                });
                return true;
            }

            myte.queue.add('go_to_object', { targetObject: this });
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

            const droppedItem = new DroppedItem(
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

class LightObject extends AnimatedMapObject {
    constructor(type, variant, posX, posY, config) {
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
            targetObject: this,
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
            parent.activeMyte.updateMood(5);
        }
    }

    render(container, parent) {
        const element = super.render(container, parent);
        element.classList.add('light-object');
        element.setAttribute('data-state', this.state);
        return element;
    }
}

class Fountain extends AnimatedMapObject {
    constructor(type, variant, posX, posY, config) {
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
            targetObject: this,
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
            myte.updateMood(this.moodBoostAmount);
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


// Specific implementations for different categories
class NatureObject extends MapObject {
    constructor(type, variant, posX, posY, config) {
        super(type, variant, posX, posY, config);
        this.growthStage = 0;
        this.maxGrowthStage = 3;
        this.growthTime = 60000; // 1 minute per stage
    }

    startGrowth() {
        this.growthInterval = setInterval(() => {
            this.grow();
        }, this.growthTime);
    }

    grow() {
        if (this.growthStage < this.maxGrowthStage) {
            this.growthStage++;
            this.updateAppearance();
        } else {
            clearInterval(this.growthInterval);
        }
    }

    updateAppearance() {
        // Update visual based on growth stage
        if (this.element) {
            this.element.setAttribute('data-growth-stage', this.growthStage);
        }
    }
}

class ItemObject extends MapObject {
    constructor(type, variant, posX, posY, config) {
        super(type, variant, posX, posY, config);
        this.quantity = 1;
        this.durability = 100;
    }

    consume() {
        if (this.quantity > 1) {
            this.quantity--;
            this.updateDisplay();
            return true;
        } else {
            this.remove();
            return false;
        }
    }

    updateDisplay() {
        if (this.element) {
            this.element.setAttribute('data-quantity', this.quantity);
        }
    }
}

class PortalObject extends MapObject {
    constructor(type, variant, posX, posY, config) {
        super(type, variant, posX, posY, config);
        this.destination = null;
    }
}

// Add this to your development environment
class HotReload {
    static async reloadModule(path) {
        // Remove from cache if exists
        const existingScript = document.querySelector(`script[src*="${path}"]`);
        if (existingScript) {
            existingScript.remove();
        }

        // Create new script with timestamp to bypass cache
        const script = document.createElement('script');
        script.src = `${path}?t=${Date.now()}`;
        script.type = 'module';
        document.head.appendChild(script);

        // Return a promise that resolves when the script loads
        return new Promise((resolve, reject) => {
            script.onload = resolve;
            script.onerror = reject;
        });
    }
}

// Add a keyboard shortcut to reload specific files
document.addEventListener('keydown', async (e) => {
    // Ctrl + R to reload AnimatedMapObject.js
    if (e.ctrlKey && e.key === 'r') {
        e.preventDefault();
        try {
            await HotReload.reloadModule('./AnimatedMapObject.js');
            console.log('Module reloaded successfully');
        } catch (error) {
            console.error('Failed to reload module:', error);
        }
    }
});