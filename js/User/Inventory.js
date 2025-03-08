class Inventory {
    constructor(parent, inventoryElement) {
        this.parent = parent;
        this.inventoryElement = inventoryElement;
        this.items = [];

        // Configuration
        this.config = {
            maxItems: 50,                // Maximum items in inventory
            stackSize: 99,               // Maximum stack size per item
            dragOffsetX: 0,              // Drag offset adjustment
            dragOffsetY: 0,
            feedMoodBoost: 15,          // Mood boost when feeding
            feedCooldown: 2000,         // Cooldown between feeds (ms)
            itemTypes: {
                FOOD: {
                    moodBoost: 15,
                    expressions: ['eat'],
                    consumeTime: 1000
                },
                TOY: {
                    moodBoost: 10,
                    expressions: ['play', 'happy'],
                    consumeTime: 2000
                },
                MEDICINE: {
                    moodBoost: 5,
                    expressions: ['surprised', 'happy'],
                    consumeTime: 1500
                }
            }
        };

        // State tracking
        this.state = {
            draggedItem: null,
            lastFeedTime: {}, // Track last feed time per Myte
            isDragging: false,
            activeDropTargets: new Set()
        };

        // Initialize
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setupMutationObserver();
        this.createDropIndicator();
    }

    createDropIndicator() {
        this.dropIndicator = document.createElement('div');
        this.dropIndicator.className = 'inventory-drop-indicator';
        document.body.appendChild(this.dropIndicator);
    }

    // Item Management Methods
    createItemElement({ name, quantity, type, variant, description = '' }) {
        const itemElement = document.createElement('div');
        itemElement.className = `item ${type.toLowerCase()}`;
        itemElement.dataset.name = name;
        itemElement.dataset.quantity = quantity;
        itemElement.dataset.type = type;
        itemElement.dataset.variant = variant;
        itemElement.draggable = true;

        if (description) {
            itemElement.title = `${name}\n${description}`;
        }

        return itemElement;
    }

    loadItems(itemsArray) {
        // Clear existing items
        this.items = [];
        this.inventoryElement.innerHTML = '';

        // Load new items
        itemsArray.forEach(itemData => {
            try {
                const itemElement = this.createItemElement(itemData);
                this.inventoryElement.appendChild(itemElement);
                this.items.push({ ...itemData, element: itemElement });
            } catch (error) {
                console.error(`Failed to load item: ${itemData.name}`, error);
            }
        });

        this.updateInventoryDisplay();
    }

    addItem(name, quantity, type, description = '') {
        if (this.items.length >= this.config.maxItems) {
            console.warn('Inventory is full!');
            return false;
        }

        const existingItem = this.items.find(item => item.name === name);

        if (existingItem) {
            const newQuantity = Math.min(
                parseInt(existingItem.quantity) + quantity,
                this.config.stackSize
            );
            existingItem.quantity = newQuantity;
            existingItem.element.dataset.quantity = newQuantity;
            this.updateItemDisplay(existingItem);
        } else {
            const newItem = { name, quantity, type, description };
            const itemElement = this.createItemElement(newItem);
            this.inventoryElement.appendChild(itemElement);
            this.items.push({ ...newItem, element: itemElement });
        }

        this.updateInventoryDisplay();
        return true;
    }

    removeItem(name, quantity = 1) {
        const item = this.items.find(item => item.name === name);
        if (!item) return false;

        const newQuantity = Math.max(0, parseInt(item.quantity) - quantity);

        if (newQuantity === 0) {
            this.inventoryElement.removeChild(item.element);
            this.items = this.items.filter(i => i.name !== name);
        } else {
            item.quantity = newQuantity;
            item.element.dataset.quantity = newQuantity;
            this.updateItemDisplay(item);
        }

        this.updateInventoryDisplay();
        return true;
    }

    updateItemDisplay(item) {
        const quantityDisplay = item.element.querySelector('.item-quantity');
        if (quantityDisplay) {
            quantityDisplay.textContent = item.quantity;
        }
    }

    updateInventoryDisplay() {
        this.inventoryElement.classList.toggle('empty', this.items.length === 0);
        this.inventoryElement.classList.toggle('full', this.items.length >= this.config.maxItems);
    }

    // Drag and Drop Event Handlers
    setupEventListeners() {
        // Inventory events
        this.inventoryElement.addEventListener('dragstart', this.handleDragStart.bind(this));
        this.inventoryElement.addEventListener('dragend', this.handleDragEnd.bind(this));

        // Container events
        const containers = Array.from(document.querySelectorAll('.container'));
        containers.forEach(container => {
            container.addEventListener('dragover', this.handleContainerDragOver.bind(this));
            container.addEventListener('dragleave', this.handleContainerDragLeave.bind(this));
            container.addEventListener('drop', this.handleContainerDrop.bind(this));
        });

        // Add Myte events to existing Mytes
        this.addMyteListeners(document.querySelectorAll('.duplicate'));
    }

    handleDragStart(e) {
        if (!e.target.classList.contains('item')) return;

        this.state.draggedItem = e.target;
        this.state.isDragging = true;

        // Store offset for precise dropping
        const rect = e.target.getBoundingClientRect();
        this.config.dragOffsetX = e.clientX - rect.left;
        this.config.dragOffsetY = e.clientY - rect.top;

        // Add visual cues
        document.querySelectorAll('.container').forEach(container => {
            container.classList.add('valid-drop-target');
        });

        document.querySelectorAll('.duplicate').forEach(myte => {
            myte.classList.add('droppable');
        });

        // Show drop indicator
        this.dropIndicator.style.display = 'block';
    }

    handleDragEnd(e) {
        this.state.isDragging = false;
        this.state.draggedItem = null;

        // Remove visual cues
        document.querySelectorAll('.container').forEach(container => {
            container.classList.remove('valid-drop-target', 'on-target');
        });

        document.querySelectorAll('.duplicate').forEach(myte => {
            myte.classList.remove('droppable', 'drag-over');
        });

        // Hide drop indicator
        this.dropIndicator.style.display = 'none';
    }

    handleContainerDragOver(e) {
        if (!this.state.isDragging) return;
        e.preventDefault();
        e.currentTarget.classList.add('on-target');

        // Update drop indicator position
        const mouse = this.parent.getLocalMouse();
        this.updateDropIndicator(mouse.x, mouse.y);
    }

    handleContainerDragLeave(e) {
        e.currentTarget.classList.remove('on-target');
    }

    handleContainerDrop(e) {
        e.preventDefault();
        if (!this.state.draggedItem) return;

        // Check if we dropped on a Myte first
        const myteElement = e.target.closest('.duplicate');
        if (myteElement) {
            // Handle Myte drop separately
            return;
        }

        const container = e.currentTarget;
        const layerForeground = container.querySelector('.layer.foreground');
        if (!layerForeground) return;

        const { name, quantity, variant, type } = this.state.draggedItem.dataset;
        const mouse = this.parent.getLocalMouse();

        // Create object in world
        const object = this.parent.gameMap.addObject(
            type,
            variant,
            mouse.x - this.config.dragOffsetX,
            mouse.y - this.config.dragOffsetY
        );

        if (object) {
            this.removeItem(name);
        }
    }

    // Myte Interaction Methods
    addMyteListeners(myteElements) {
        myteElements.forEach(myte => {
            myte.addEventListener('dragover', this.handleMyteDragOver.bind(this));
            myte.addEventListener('dragleave', this.handleMyteDragLeave.bind(this));
            myte.addEventListener('drop', this.handleMyteDrop.bind(this));
        });
    }

    handleMyteDragOver(e) {
        if (!this.state.isDragging) return;
        e.preventDefault();
        e.currentTarget.classList.add('drag-over');
    }

    handleMyteDragLeave(e) {
        e.currentTarget.classList.remove('drag-over');
    }

    handleMyteDrop(e) {
        e.preventDefault();
        if (!this.state.draggedItem) return;

        const myteElement = e.currentTarget;
        const myte = this.findMyteFromElement(myteElement);

        if (!myte) return;

        // Check feeding cooldown
        const now = Date.now();
        if (now - (this.state.lastFeedTime[myte.id] || 0) < this.config.feedCooldown) {
            console.log('Feeding cooldown active');
            // Return item to inventory since we can't feed now
            return;
        }

        // Get item configuration
        const itemType = this.state.draggedItem.dataset.type;
        const itemConfig = this.config.itemTypes[itemType];

        if (!itemConfig) return;

        // Apply item effects and remove from inventory
        this.applyItemEffects(myte, itemType, itemConfig);
        this.removeItem(this.state.draggedItem.dataset.name);

        // Update cooldown
        this.state.lastFeedTime[myte.id] = now;

        // Remove visual feedback
        myteElement.classList.remove('drag-over');
    }

    applyItemEffects(myte, itemType, itemConfig) {
        // Clear current actions
        myte.queue.clear();

        // Add configured expressions
        itemConfig.expressions.forEach(expression => {
            myte.queue.addExpression(expression, itemConfig.consumeTime / itemConfig.expressions.length);
        });

        // Apply mood boost
        myte.stats.updateMood(itemConfig.moodBoost);

        // Emit particles or other visual effects if system exists
        if (this.parent.particleSystem) {
            this.parent.particleSystem.emit(
                itemType, 
                myte.posX + myte.size.width / 2, 
                myte.posY + myte.size.height / 2
            );
        }
    }

    findMyteFromElement(element) {
        return this.parent.mytes.find(myte => myte.duplicate === element);
    }

    updateDropIndicator(x, y) {
        this.dropIndicator.style.left = `${x}px`;
        this.dropIndicator.style.top = `${y}px`;
    }

    setupMutationObserver() {
        // Observer for new Mytes
        const observer = new MutationObserver(mutations => {
            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    if (node.classList?.contains('duplicate')) {
                        this.addMyteListeners([node]);
                    }
                });
            });
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }

    dispose() {
        // Cleanup
        this.dropIndicator?.remove();
        this.items = [];
        this.state = {};
    }
}