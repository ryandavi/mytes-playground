// Base configuration for different object types
const MAP_OBJECT_TYPES = {
    // Interactive nature objects
    GRASS: {
        category: 'nature',
        variants: ['grass_1', 'grass_2', 'grass_3'],
        renderType: 'split', // Uses separate front/back images
        walkable: true,
        collision: false,
        scale: 1,
        renderPriority: 1
    },
    FLOWER: {
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
	/*
    TREE: {
        category: 'nature',
        variants: ['tree_1', 'tree_2'],
        renderType: 'split',
        walkable: false,
        collision: true,
        scale: 2,
        renderPriority: 3
    },
	*/
    // Interactive items
    MUSIC_BOX: {
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

        // Create specific type of object based on category
        switch (config.category) {
            case 'nature':
                return new NatureObject(type, variant, x, y, config);
            case 'item':
                return new ItemObject(type, variant, x, y, config);
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
            this.select();
            parent.activeMyte.queue.addMoveToElement(this.element, 300, this);
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

// Enhanced MapObjects manager class
class MapObjects {
    constructor(parent) {
        this.parent = parent;
        this.objects = [];
        this.objectLayerSelector = '.layer.foreground';
    }

    addObject(type, variant, x, y) {
        const object = MapObjectFactory.create(type, variant, x, y);
        if (object) {
            this.objects.push(object);
            
            // Render immediately if container exists
            const container = this.parent.canvas.querySelector(this.objectLayerSelector);
            if (container) {
                object.render(container, this.parent);
            }
        }
        return object;
    }

    addRandomObjects(count, types = ['GRASS']) {
        const foregroundLayer = this.parent.canvas.querySelector(this.objectLayerSelector);
        if (!foregroundLayer) return;

        const maxX = foregroundLayer.clientWidth;
        const maxY = foregroundLayer.clientHeight;

        for (let i = 0; i < count; i++) {
            // Randomly select type and variant
            const type = types[Math.floor(Math.random() * types.length)];
            const config = MAP_OBJECT_TYPES[type];
            const variant = config.variants[Math.floor(Math.random() * config.variants.length)];
            
            const x = Math.floor(Math.random() * maxX);
            const y = Math.floor(Math.random() * maxY);

            this.addObject(type, variant, x, y);
        }
    }

    getObjectsInRadius(x, y, radius) {
        return this.objects.filter(obj => {
            const dx = obj.posX - x;
            const dy = obj.posY - y;
            return Math.sqrt(dx * dx + dy * dy) <= radius;
        });
    }

    removeInactive() {
        this.objects = this.objects.filter(obj => obj.active);
    }

    init() {
        // Add random nature objects
        this.addRandomObjects(100, ['GRASS']);
        this.addRandomObjects(20, ['FLOWER']);
        // this.addRandomObjects(10, ['TREE']);
        
        // Add some interactive items
        this.addRandomObjects(5, ['MUSIC_BOX']);
        // this.addRandomObjects(15, ['FOOD']);
    }
}