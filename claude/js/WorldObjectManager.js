class WorldObject {
    constructor(type, position, size = { width: 64, height: 64 }) {
        this.type = type;
        this.position = position;
        this.size = size;
        this.element = null;
        this.isActive = true;
        this.isSelected = false;
    }

    intersects(other) {
        return this.position.x < other.position.x + other.size.width &&
               this.position.x + this.size.width > other.position.x &&
               this.position.y < other.position.y + other.size.height &&
               this.position.y + this.size.height > other.position.y;
    }

    select() {
        this.isSelected = true;
        this.element?.classList.add('selected-object');
    }

    unselect() {
        this.isSelected = false;
        this.element?.classList.remove('selected-object');
    }

    remove() {
        this.element?.remove();
        this.isActive = false;
    }

    render(container, manager) {
        const element = document.createElement('div');
        element.classList.add('mapObject', this.type);

        // Create interaction area
        const interactArea = document.createElement('div');
        interactArea.classList.add('interact');
        interactArea.addEventListener('click', () => this.onInteract(manager));
        element.appendChild(interactArea);

        // Set position and size
        Object.assign(element.style, {
            left: `${this.position.x}px`,
            top: `${this.position.y}px`,
            width: `${this.size.width}px`,
            height: `${this.size.height}px`
        });

        // Handle different object types
        if (this.type.includes('grass')) {
            this.renderGrassObject(element, manager);
        } else {
            this.renderItemObject(element, manager);
        }

        this.element = element;
        return element;
    }

    renderGrassObject(element, manager) {
        ['back', 'front'].forEach(part => {
            const layer = document.createElement('div');
            layer.classList.add(part);
            layer.style.backgroundImage = `url('images/MapObjects/${this.type}_${part}.png')`;
            layer.style.backgroundSize = 'cover';

            if (part === 'front') {
                const randomDelay = Math.random() * 5;
                layer.style.animationDelay = `${randomDelay}s`;
                layer.style.zIndex = manager.container.getZIndex(this.position.y, this.size.height);
            }

            element.appendChild(layer);
        });
    }

    renderItemObject(element, manager) {
        const item = document.createElement('div');
        item.classList.add('item', this.type);
        item.style.zIndex = manager.container.getZIndex(this.position.y, this.size.height);
        element.appendChild(item);
    }

    onInteract(manager) {
        const activeMyte = manager.container.activeMyte;
        if (activeMyte && this.isActive) {
            this.select();
            activeMyte.queue.addMoveToElement(this.element, 300, this);
        }
    }
}

class WorldObjectManager {
    constructor(container) {
        this.container = container;
        this.objects = [];
        this.foregroundLayer = null;
        this.objectTypes = {
            GRASS: ["grass_1", "grass_2", "grass_3"],
            FOOD: ["apple", "turnip", "acorn"]
        };
    }

    init() {
        this.foregroundLayer = this.container.canvas.querySelector('.layer.foreground');
        if (!this.foregroundLayer) return;

        // Initialize with random objects
        this.addRandomObjects(150);
        this.renderAllObjects();
    }

    addRandomObjects(count) {
        const maxX = this.foregroundLayer.clientWidth;
        const maxY = this.foregroundLayer.clientHeight;

        for (let i = 0; i < count; i++) {
            const type = this.getRandomObjectType();
            const position = {
                x: Math.random() * (maxX - 64),
                y: Math.random() * (maxY - 64)
            };

            this.createObject(type, position);
        }
    }

    createObject(type, position, size) {
        const object = new WorldObject(type, position, size);
        this.objects.push(object);
        return object;
    }

    removeObject(object) {
        const index = this.objects.indexOf(object);
        if (index !== -1) {
            object.remove();
            this.objects.splice(index, 1);
        }
    }

    renderAllObjects() {
        const fragment = document.createDocumentFragment();
        this.objects.forEach(object => {
            if (object.isActive) {
                object.render(fragment, this);
            }
        });
        this.foregroundLayer.appendChild(fragment);
    }

    addItemFromInventory(itemType, position, sourceElement) {
        // Calculate drop position relative to container
        const containerRect = this.container.element.getBoundingClientRect();
        const adjustedPosition = {
            x: position.x - containerRect.left,
            y: position.y - containerRect.top
        };

        // Create and add the new object
        const object = this.createObject(itemType, adjustedPosition);
        object.render(this.foregroundLayer, this);

        // Update inventory
        const inventory = this.container.inventory;
        if (inventory) {
            inventory.removeItem(sourceElement);
        }
    }

    getRandomObjectType() {
        const types = this.objectTypes.GRASS;
        return types[Math.floor(Math.random() * types.length)];
    }

    getNearbyObjects(position, radius) {
        return this.objects.filter(object => {
            if (!object.isActive) return false;

            const dx = object.position.x - position.x;
            const dy = object.position.y - position.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            return distance <= radius;
        });
    }

    getInteractableObjects(position, radius) {
        return this.getNearbyObjects(position, radius)
            .filter(object => object.isActive && !object.isSelected);
    }

    update() {
        // Update objects that need continuous updates
        this.objects.forEach(object => {
            if (object.isActive && object.update) {
                object.update();
            }
        });

        // Clean up inactive objects periodically
        this.cleanupInactiveObjects();
    }

    cleanupInactiveObjects() {
        this.objects = this.objects.filter(object => {
            if (!object.isActive) {
                object.remove();
                return false;
            }
            return true;
        });
    }

    // Utility methods
    isPositionValid(position) {
        if (!this.foregroundLayer) return false;

        return position.x >= 0 &&
               position.y >= 0 &&
               position.x <= this.foregroundLayer.clientWidth - 64 &&
               position.y <= this.foregroundLayer.clientHeight - 64;
    }

    findRandomValidPosition() {
        const maxAttempts = 50;
        let attempts = 0;

        while (attempts < maxAttempts) {
            const position = {
                x: Math.random() * (this.foregroundLayer.clientWidth - 64),
                y: Math.random() * (this.foregroundLayer.clientHeight - 64)
            };

            // Check if position is valid and not too close to other objects
            const nearbyObjects = this.getNearbyObjects(position, 64);
            if (nearbyObjects.length === 0 && this.isPositionValid(position)) {
                return position;
            }

            attempts++;
        }

        return null;
    }

    serialize() {
        return this.objects.map(object => ({
            type: object.type,
            position: { x: object.position.x, y: object.position.y },
            size: { width: object.size.width, height: object.size.height },
            isActive: object.isActive
        }));
    }

    deserialize(data) {
        this.objects = [];
        data.forEach(objectData => {
            if (objectData.isActive) {
                this.createObject(
                    objectData.type,
                    objectData.position,
                    objectData.size
                );
            }
        });
        this.renderAllObjects();
    }
}