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

    collider: null,

    // Physics & Collision
    walkable: false,           // Can be walked over
    collision: false,         // Has collision detection
    collisionRadius: 32,      // Collision detection radius
    

    // Interaction
    interactionType: null,    // Type of interaction (mood_boost, dance, consume, etc)
    interactionRadius: 400,   // Distance for interaction
    interactionCooldown: 5000,// Time between interactions
    draggabke: false,

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
        animation: "sway",
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

    CROP: {
        ...BASE_OBJECT_CONFIG,
        variants: ['tomato', 'carrot', 'wheat', 'berry'],
        category: 'crop',
        interactionType: 'tend',
        renderType: 'animated',
        walkable: false,
        collision: false,
        scale: 1,
        renderPriority: 2,
        interactionType: 'tend',
        interactionRadius: 100,
        default: 'seed',

        animation: "sway",

        collider: {
            offsetX: 16,
            offsetY: 84,
            width: 32,
            height: 32
        },


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
            frameWidth: 64,
            frameHeight: 128,
            scale: 1,
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
                    frames: [3]
                },
                harvest: {
                    loop: false,
                    frames: [3]
                }
            }
        }
    },

    BREEDING_FLOWER: {
        ...BASE_OBJECT_CONFIG,
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
    },

    BALL: {
        ...BASE_OBJECT_CONFIG,
        category: 'moving',
        size: {
            width: 64,
            height: 64
        },
        variants: ['red_ball', 'blue_ball'],
        renderType: 'single',
        walkable: true,
        collision: false,
        draggable: true,
        scale: 1,
        renderPriority: 2,
        speed: 3,
        friction: 0.98, // This higher value means the ball will roll much farther before stopping
        triggerRadius: 192 / 2,
        pushForce: 5, // A higher pushForce means the ball will receive a stronger initial push - move further

        // render
        renderType: 'sprite',


        // interaction
        interactionType: 'open',







    },

    PATROL_GUARD: {
        ...BASE_OBJECT_CONFIG,
        category: 'moving',
        variants: ['guard'],
        renderType: 'animated',
        walkable: false,
        collision: true,
        scale: 1,
        renderPriority: 2,
        speed: 2,
        waitTime: 1000
    },

    BUTTERFLY: {
        ...BASE_OBJECT_CONFIG,
        category: 'moving',
        variants: ['blue_butterfly', 'yellow_butterfly'],
        renderType: 'animated',
        walkable: true,
        collision: false,
        renderPriority: 3,
        speed: 1.5,
        wanderRadius: 100,
        flutterAmplitude: 20,
        flutterFrequency: 0.1,

        size: {
            width: 100,
            height: 100
        },


    },

    BED: {
        ...BASE_OBJECT_CONFIG,
        category: 'static',
        variants: ['bed'],
        renderType: 'sprite',
        walkable: false,
        collision: true,
        draggable: true,
        size: {
            width: 128,
            height: 256
        },

    }

};

// Base MapObject class
class MapObject {
    constructor(type, variant, posX, posY, config, options = {}) {
        this.type = type;
        this.variant = variant;
        this.config = config;
        this.posX = posX;
        this.posY = posY;
        this.direction = DIRECTION.SOUTH;
        this.size = {
            width: (config.size.width || 64) * (config.scale || 1),
            height: (config.size.height || 64) * (config.scale || 1)
        };
        

        this.active = true;
        this.element = null;
        this.parent = null;
        this.interactionState = {
            lastInteractionTime: 0,
            cooldown: config.cooldown || 5000,
            activeInteractions: new Set()
        };

        this.collider = config.collider || {
            type: 'box',
            width: this.size.width * 0.8,
            height: this.size.height * 0.8,
            offsetX: this.size.width * 0.1,
            offsetY: this.size.height * .1
        };

        // Input components - only create them if specified in config
        this.inputComponents = {};

        // Store config options
        this.options = options;

        // Track if the object is currently being dragged
        this.isDragging = false;
    }

    // Initialize components after parent and element are available
    initializeInputComponents() {
        if (!this.element || !this.parent) return;

        // Initialize click component - most objects need this
        this.initClickComponent();

        // Initialize drag component if object is draggable
        if (this.config.draggable) {
            this.initDragComponent();
        }

        // Initialize rubbing component if object is rubbable
        if (this.config.rubbable) {
            this.initRubbingComponent();
        }

        // Initialize any components and set their element
        Object.values(this.inputComponents).forEach(component => {
            if (!component.element) {
                component.element = this.element;
            }
            component.initialize();
        });
    }

    // Initialize the click component
    initClickComponent() {
        // Don't create duplicate components
        if (this.inputComponents.click) return;

        this.inputComponents.click = new ClickComponent(this, {
            element: this.element,
            enabled: true,
            canClick: () => this.active,
            onClick: (event) => {
                this.press(this.parent);
            },
            onDoubleClick: (event) => {
                // Optional double-click behavior
                if (this.config.doubleClickAction) {
                    this.handleDoubleClick();
                }
            },
            onLongPress: (event) => {

                console.log(`Long press for ${this.type} ${this.variant}`);
                // Optional long press behavior or start drag
                if (this.config.draggable && this.parent?.ui?.isTool(UIToolModes.SELECT)) {
                    console.log(`Starting drag for ${this.type} ${this.variant}`);

                    this.parent?.ui?.setTool(UIToolModes.DRAG);
                    this.startDrag();
                } else {
                    console.log(`Starting long press for ${this.type} ${this.variant}`);
                    this.handleLongPress();
                }
            }
        });
    }

    // Initialize drag component
    initDragComponent() {
        // Don't create duplicate components
        if (this.inputComponents.drag) return;

        console.log(`Creating drag component for ${this.type} ${this.variant}`);

        this.inputComponents.drag = new DragComponent(this, {
            element: this.element,
            enabled: true,
            autoActivate: false,
            canDrag: () => {
                const canDrag = this.active && this.canBeDragged();
                console.log(`Checking canDrag: ${canDrag}`);
                return canDrag;
            },
            dragThreshold: 3, // Lower threshold to make it easier to drag
            dragTimeThreshold: 0, // No time threshold - start drag as soon as moved
            preventDefaultsForDrag: true,
            onDragStart: (event) => {
                console.log('MapObject: Drag started');
                this.isDragging = true;
                this.element.classList.add('dragging');

                // Set selection in the UI if it exists
                if (this.parent?.ui) {
                    this.parent.ui.setSelected(this);
                }
            },
            onDragMove: (event) => {
                console.log('MapObject: Drag move', event.position);

                // Get container position
                const containerRect = this.parent.getContainerRect();

                // Calculate position relative to container
                const relativeX = event.position.x - containerRect.left;
                const relativeY = event.position.y - containerRect.top;

                // Apply camera offset if using a camera
                const cameraOffsetX = this.parent.camera ? this.parent.camera.posX : 0;
                const cameraOffsetY = this.parent.camera ? this.parent.camera.posY : 0;

                // Calculate final position, centered on the cursor
                this.posX = relativeX - (this.size.width / 2) - cameraOffsetX;
                this.posY = relativeY - (this.size.height / 2) - cameraOffsetY;

                // Update element position
                if (this.element) {
                    this.element.style.left = `${this.posX}px`;
                    this.element.style.top = `${this.posY}px`;
                    this.element.style.zIndex = this.parent.getZIndex(this.posY, this.size.height);
                }
            },
            onDragEnd: (event) => {
                console.log('MapObject: Drag ended');
                this.isDragging = false;
                this.element.classList.remove('dragging');

                // Optional: Snap to grid
                if (this.config.snapToGrid) {
                    this.snapToGrid();
                }

                // Trigger any post-move effects
                if (this.config.onMove) {
                    this.handleMovedEvent();
                }
            }
        });
    }
    // Initialize rubbing component
    initRubbingComponent() {
        // Don't create duplicate components
        if (this.inputComponents.rubbing) return;

        this.inputComponents.rubbing = new RubbingComponent(this, {
            element: this.element,
            enabled: true,
            canRub: () => this.active && this.parent?.ui?.isTool(UIToolModes.PET),
            minRubs: 3,
            maxRubs: 15,
            directionThreshold: 10,
            minTimeBetweenRubs: this.config.rubCooldown || 5000,
            onRubStart: (event) => {
                this.element.classList.add('being-rubbed');
            },
            onRubProgress: (event) => {
                // Optional visual feedback during rubbing
                if (this.config.rubFeedback) {
                    this.handleRubProgress(event.count);
                }
            },
            onRubComplete: (event) => {
                // Handle successful rub interaction
                this.element.classList.remove('being-rubbed');
                if (this.config.onRub) {
                    this.handleRubEvent(event.count);
                }
            },
            onRubOverdone: (event) => {
                // Handle overdone rubbing
                this.element.classList.remove('being-rubbed');
                if (this.config.onRubOverdone) {
                    this.handleRubOverdone(event.count);
                }
            }
        });
    }

    // Check if this object can be dragged
    canBeDragged() {
        // Check if drag is enabled for this object
        if (!this.config.draggable) return false;

        // Check if we're in drag mode or if this is a selected object in SELECT mode
        const isDragMode = this.parent?.ui?.isTool(UIToolModes.DRAG);
        const isSelectedInSelectMode =
            this.parent?.ui?.isTool(UIToolModes.SELECT) &&
            this.parent?.ui?.selectedObject === this;

        return isDragMode || isSelectedInSelectMode;
    }

    // Programmatically start dragging this object
    startDrag() {
        if (!this.config.draggable || !this.canBeDragged()) return;

        // Start dragging at current mouse position
        this.inputComponents.drag.startDragAtCurrentPosition();
    }

    // Intersects check for collision detection
    intersects(other) {
        return this.posX < other.posX + other.size.width &&
            this.posX + this.size.width > other.posX &&
            this.posY < other.posY + other.size.height &&
            this.posY + this.size.height > other.posY;
    }

    // Check if a point is inside this object
    containsPoint(x, y) {
        return x >= this.posX &&
            x <= this.posX + this.size.width &&
            y >= this.posY &&
            y <= this.posY + this.size.height;
    }

    // Check if a Myte can interact with this object
    canInteract(myte) {
        if (!this.config.interactionType) return false;

        // Check cooldown
        const timeSinceLastInteraction = Date.now() - this.interactionState.lastInteractionTime;
        if (timeSinceLastInteraction < this.interactionState.cooldown) return false;

        // Check if myte is already interacting
        if (this.interactionState.activeInteractions.has(myte.id)) return false;

        return true;
    }

    // Handle interaction with a Myte
    interact(myte) {
        if (!this.canInteract(myte)) return false;

        this.interactionState.lastInteractionTime = Date.now();
        this.interactionState.activeInteractions.add(myte.id);

        // Handle interaction based on type
        switch (this.config.interactionType) {
            case 'mood_boost':
                myte.stats.updateMood(10);
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
            default:
                // Handle custom interaction types
                if (typeof this.config.onInteract === 'function') {
                    this.config.onInteract(myte, this);
                }
        }

        // Set timeout to reset interaction state
        setTimeout(() => {
            this.interactionState.activeInteractions.delete(myte.id);
        }, this.interactionState.cooldown);

        return true;
    }

    // Render the object to the container
    render(container, parent) {
        this.parent = parent;

        const divElement = document.createElement('div');
        divElement.classList.add('mapObject', this.variant);

        // Add data attributes for easier querying
        divElement.dataset.objectType = this.type;
        divElement.dataset.objectId = this.id || '';

        // Add draggable class if needed
        if (this.config.draggable) {
            divElement.classList.add('draggable');
            divElement.style.touchAction = 'none';
        }

        // Add rubbable class if needed
        if (this.config.rubbable) {
            divElement.classList.add('rubbable');
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

        // Initialize input components after element is created
        this.initializeInputComponents();

        return divElement;
    }

    // Render a split object (with back and front parts)
    renderSplitObject(container) {

        const div = document.createElement('div');
        div.classList.add("sprite");

        ['back', 'front'].forEach(part => {
            const part_div = document.createElement('div');
            part_div.classList.add(part);
            part_div.style.backgroundImage = `url('images/MapObjects/${this.variant}_${part}.png')`;
            part_div.style.backgroundSize = 'cover';

            // for sway
            if (part === 'front' && this.config?.animation == "sway") {
                part_div.classList.add("sway");
                const randomDelay = Math.random() * 5;
                part_div.style.animationDelay = `${randomDelay}s`;
            }
            div.appendChild(part_div);
        });



        container.appendChild(div);
    }

    // Render a single object
    renderSingleObject(container) {
        // Default implementation or custom rendering logic
        const div = document.createElement('div');
        div.classList.add("sprite");

        if (this.config?.animation == "sway") {
            div.classList.add("sway");
            const randomDelay = Math.random() * 5;
            div.style.animationDelay = `${randomDelay}s`;
        }

        container.appendChild(div);

    }

    // Handle click/press on this object
    press(parent) {
        if (!this.active) return false;

        if (parent.activeMyte) {
            parent.ui.setSelected(this);

            // Trigger any onClick handler from config
            if (this.config.onClick && typeof this.config.onClick === 'function') {
                this.config.onClick(this, parent);
            }

            return true;
        }
        return false;
    }

    // Handle selection state
    select() {
        if (!this.element) return;
        this.element.classList.add('selected-object');
    }

    // Handle deselection
    unselect() {
        if (!this.element) return;
        this.element.classList.remove('selected-object');
    }

    // Remove this object
    remove() {
        // Clean up all input components
        Object.values(this.inputComponents).forEach(component => {
            component.destroy();
        });

        // Clear input components
        this.inputComponents = {};

        // Remove element
        if (this.element) {
            this.element.remove();
            this.element = null;
        }

        this.active = false;
    }

    // Handle collision constraints during dragging
    handleCollisionConstraints() {
        const potentialColliders = this.parent.gameMap.gridSystem.getPotentialColliders(this);
        let hasCollision = false;

        for (const collider of potentialColliders) {
            if (collider !== this && this.parent.checkCollision(this, collider)) {
                hasCollision = true;
                break;
            }
        }

        if (hasCollision) {
            // Implement your collision resolution logic here
            // This is a simple example - you might want more sophisticated handling
            this.posX = this.lastValidX || this.posX;
            this.posY = this.lastValidY || this.posY;
        } else {
            // Store last valid position
            this.lastValidX = this.posX;
            this.lastValidY = this.posY;
        }
    }

    // Snap object to grid
    snapToGrid() {
        const gridSize = this.config.gridSize || 32;
        this.posX = Math.round(this.posX / gridSize) * gridSize;
        this.posY = Math.round(this.posY / gridSize) * gridSize;

        if (this.element) {
            this.element.style.left = `${this.posX}px`;
            this.element.style.top = `${this.posY}px`;
        }
    }

    // Event handlers for different interactions
    handleDoubleClick() {
        if (this.config.doubleClickAction && typeof this.config.doubleClickAction === 'function') {
            this.config.doubleClickAction(this);
        }
    }

    handleLongPress() {
        if (this.config.longPressAction && typeof this.config.longPressAction === 'function') {
            // this.config.longPressAction(this);
        }

        console.log('long press');
    }

    handleMovedEvent() {
        if (this.config.onMove && typeof this.config.onMove === 'function') {
            this.config.onMove(this);
        }

        // Update grid position if using a grid system
        if (this.parent?.gameMap?.gridSystem) {
            this.parent.gameMap.gridSystem.updateObjectPosition(this);
        }
    }

    handleRubProgress(count) {
        if (this.config.rubFeedback && typeof this.config.rubFeedback === 'function') {
            this.config.rubFeedback(this, count);
        }
    }

    handleRubEvent(intensity) {
        if (this.config.onRub && typeof this.config.onRub === 'function') {
            this.config.onRub(this, intensity);
        }
    }

    handleRubOverdone(intensity) {
        if (this.config.onRubOverdone && typeof this.config.onRubOverdone === 'function') {
            this.config.onRubOverdone(this, intensity);
        }
    }

    // Component control methods
    enableDragging() {
        if (!this.config.draggable) {
            this.config.draggable = true;
        }

        if (this.inputComponents.drag) {
            this.inputComponents.drag.enable();
        } else {
            this.initDragComponent();
        }
    }

    disableDragging() {
        if (this.inputComponents.drag) {
            this.inputComponents.drag.disable();
        }
    }

    enableRubbing() {
        if (!this.config.rubbable) {
            this.config.rubbable = true;
        }

        if (this.inputComponents.rubbing) {
            this.inputComponents.rubbing.enable();
        } else {
            this.initRubbingComponent();
        }
    }

    disableRubbing() {
        if (this.inputComponents.rubbing) {
            this.inputComponents.rubbing.disable();
        }
    }

    // Update method called each frame
    update(deltaTime) {
        // Update components that need per-frame updates
        Object.values(this.inputComponents).forEach(component => {
            if (component.isActive()) {
                component.update(deltaTime);
            }
        });

        // Custom update logic from config
        if (this.config.update && typeof this.config.update === 'function') {
            this.config.update(this, deltaTime);
        }
    }
}

class BedMapObject extends MapObject {
    constructor(type, variant, posX, posY, config, options = {}) {
        super(type, variant, posX, posY, config, options);
    }
}

class DroppedMapItem {
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

// Specific implementations for different categories
class NatureMapObject extends MapObject {
    constructor(type, variant, posX, posY, config, options = {}) {
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

class ItemMapObject extends MapObject {
    constructor(type, variant, posX, posY, config, options = {}) {
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

    render(container, parent) {
        // call parent
        super.render(container, parent);

        // add div element with class "item" to this.element
        const div = document.createElement('div');
        div.classList.add('item', this.type, this.variant);
        this.element.appendChild(div);
    }

    updateDisplay() {
        if (this.element) {
            this.element.setAttribute('data-quantity', this.quantity);
        }
    }
}
