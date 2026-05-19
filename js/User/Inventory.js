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
            lastFeedTime: {},
            isDragging: false,
            myteTarget: null,
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
        // Attached to world layer on first drag, not document.body
    }

    // Item Management Methods
    normalizeItemData(itemData = {}) {
        const normalized = ItemRegistry.buildInventoryItem(itemData);
        return {
            ...normalized,
            type: String(normalized.type || '').toUpperCase()
        };
    }

    createItemElement(itemData) {
        const { name, quantity, type, variant, description = '' } = this.normalizeItemData(itemData);
        const itemElement = document.createElement('div');
        const variantClass = ItemRegistry.normalizeId(variant || name);
        itemElement.className = `item ${type.toLowerCase()} ${variantClass}`;
        itemElement.dataset.name = name;
        itemElement.dataset.quantity = quantity;
        itemElement.dataset.type = type;
        itemElement.dataset.variant = variant;
        itemElement.draggable = true;

        ItemRegistry.applySpriteStyles(itemElement, variant);

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
                const normalizedItem = this.normalizeItemData(itemData);
                const itemElement = this.createItemElement(normalizedItem);
                this.inventoryElement.appendChild(itemElement);
                this.items.push({ ...normalizedItem, element: itemElement });
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

        const normalizedItem = this.normalizeItemData({
            name,
            quantity,
            type,
            description,
            variant: name
        });

        const existingItem = this.items.find(item => item.variant === normalizedItem.variant);

        if (existingItem) {
            const newQuantity = Math.min(
                parseInt(existingItem.quantity) + quantity,
                this.config.stackSize
            );
            existingItem.quantity = newQuantity;
            existingItem.element.dataset.quantity = newQuantity;
            this.updateItemDisplay(existingItem);
        } else {
            const itemElement = this.createItemElement(normalizedItem);
            this.inventoryElement.appendChild(itemElement);
            this.items.push({ ...normalizedItem, element: itemElement });
        }

        this.updateInventoryDisplay();
        return true;
    }

    removeItem(nameOrVariant, quantity = 1) {
        const canonicalVariant = ItemRegistry.resolveIdSync(nameOrVariant) || ItemRegistry.normalizeId(nameOrVariant);
        const item = this.items.find(existingItem =>
            existingItem.variant === canonicalVariant || existingItem.name === nameOrVariant
        );
        if (!item) return false;

        const newQuantity = Math.max(0, parseInt(item.quantity) - quantity);

        if (newQuantity === 0) {
            this.inventoryElement.removeChild(item.element);
            this.items = this.items.filter(i => i !== item);
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

        if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', e.target.dataset.name || '');

            // Custom ghost: clone without quantity badge, centered on cursor
            const ghost = e.target.cloneNode(true);
            ghost.removeAttribute('data-quantity');
            ghost.style.position = 'fixed';
            ghost.style.top = '-1000px';
            ghost.style.pointerEvents = 'none';
            document.body.appendChild(ghost);
            // zoom: 2 is applied via CSS, so actual rendered size is 64px
            const ghostSize = 32 * 2;
            e.dataTransfer.setDragImage(ghost, ghostSize / 2, ghostSize / 2);
            requestAnimationFrame(() => ghost.remove());
        }

        // Play lift sound
        this.parent.soundManager?.play('ui_drag_item');

        document.querySelectorAll('.duplicate').forEach(myte => {
            myte.classList.add('droppable');
        });

        // Keep indicator hidden until the first dragover tells us where we are
        this.dropIndicator.style.display = 'none';
        this.state.snappedDropPos = null;
        this.state.dropValid = true;
    }

    handleDragEnd(e) {
        this.state.isDragging = false;
        this.state.draggedItem = null;

        document.querySelectorAll('.container').forEach(container => {
            container.classList.remove('on-target');
        });

        document.querySelectorAll('.duplicate').forEach(myte => {
            myte.classList.remove('droppable', 'on-target');
        });

        this._hideIndicator();

        // Hide drop indicator
        this.dropIndicator.style.display = 'none';
    }

    handleContainerDragOver(e) {
        if (!this.state.isDragging || this.state.myteTarget) return;
        e.preventDefault();
        clearTimeout(this._indicatorHideTimer);
        e.currentTarget.classList.add('on-target');
        this._updateIndicator(e.clientX, e.clientY);
    }

    handleContainerDragLeave(e) {
        e.currentTarget.classList.remove('on-target');
        // Small delay to avoid flicker when moving between child elements
        this._indicatorHideTimer = setTimeout(() => this._hideIndicator(), 60);
    }

    _hideIndicator() {
        this.dropIndicator.style.display = 'none';
        this.dropIndicator.classList.remove('invalid');
        if (this.dropIndicator.parentElement) {
            this.dropIndicator.parentElement.removeChild(this.dropIndicator);
        }
        this.state.snappedDropPos = null;
        this.state.dropValid = true;
    }

    _updateIndicator(clientX, clientY) {
        const layer = this.parent.gameMap?.layers?.objects;
        if (!layer) return;

        if (!this.dropIndicator.parentElement) {
            layer.appendChild(this.dropIndicator);
        }

        const worldPos = this.parent.inputHandler.screenToWorldCoordinates(clientX, clientY);
        const itemSize = this._getDragItemSize();
        const gridSystem = this.parent.gameMap?.gridSystem;
        const map = this.parent.gameMap;

        let snappedX = worldPos.x - itemSize / 2;
        let snappedY = worldPos.y - itemSize / 2;

        if (gridSystem) {
            const s = gridSystem.snapToGrid(snappedX, snappedY, itemSize, itemSize, gridSystem.config.cellSize);
            snappedX = s.x;
            snappedY = s.y;
        }

        this.state.snappedDropPos = { x: snappedX, y: snappedY, size: itemSize };
        this.state.dropValid = this._isDropPositionValid(snappedX, snappedY, itemSize, gridSystem, map);

        this.dropIndicator.style.width  = `${itemSize}px`;
        this.dropIndicator.style.height = `${itemSize}px`;
        this.dropIndicator.style.left   = `${snappedX}px`;
        this.dropIndicator.style.top    = `${snappedY}px`;
        this.dropIndicator.style.display = 'block';
        this.dropIndicator.classList.toggle('invalid', !this.state.dropValid);
    }

    _isDropPositionValid(snappedX, snappedY, itemSize, gridSystem, map) {
        if (!gridSystem || !map) return true;

        // Bounds check
        const mapW = map.dimensions?.width ?? Infinity;
        const mapH = map.dimensions?.height ?? Infinity;
        if (snappedX < 0 || snappedY < 0 || snappedX + itemSize > mapW || snappedY + itemSize > mapH) {
            return false;
        }

        // Check all grid cells the item overlaps
        const cellSize = gridSystem.config.cellSize;
        const startGX = Math.floor(snappedX / cellSize);
        const startGY = Math.floor(snappedY / cellSize);
        const endGX   = Math.floor((snappedX + itemSize - 1) / cellSize);
        const endGY   = Math.floor((snappedY + itemSize - 1) / cellSize);

        for (let gx = startGX; gx <= endGX; gx++) {
            for (let gy = startGY; gy <= endGY; gy++) {
                const cell = gridSystem.grid[gx]?.[gy];
                if (!cell || !cell.walkable) return false;
            }
        }

        return true;
    }

    _getDragItemSize() {
        const type = this.state.draggedItem?.dataset?.type?.toUpperCase();
        // Food items and most inventory items are 32px in world space
        return 32;
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

        const { name, variant, type } = this.state.draggedItem.dataset;

        // Use the exact snapped position the indicator showed, or fall back to cursor
        let posX, posY;
        if (this.state.snappedDropPos) {
            const sz = this.state.snappedDropPos.size ?? 32;
            posX = this.state.snappedDropPos.x + sz / 2;
            posY = this.state.snappedDropPos.y + sz / 2;
        } else {
            const worldPos = this.parent.inputHandler.screenToWorldCoordinates(e.clientX, e.clientY);
            posX = worldPos.x;
            posY = worldPos.y;
        }

        if (this.state.dropValid === false) {
            this._hideIndicator();
            return;
        }

        let success = false;

        // Food items spawn as dropped world items with physics
        if (type?.toUpperCase() === 'FOOD') {
            const itemVariant = variant || name;
            const dropped = this.parent.gameMap.addDroppedItem('FOOD', itemVariant, posX, posY);
            // Store the inventory name so collect() adds back to the correct stack
            if (dropped) dropped.inventoryName = name;
            success = !!dropped;
        } else {
            const resolvedObject = this.resolveDroppedMapObject({ name, type, variant });
            if (!resolvedObject) {
                console.warn(`Inventory item "${name}" is not placeable on the map.`);
                return;
            }
            const object = this.parent.gameMap.addObject(
                resolvedObject.type,
                resolvedObject.variant,
                posX,
                posY
            );
            if (object?.triggerDropBounce) object.triggerDropBounce();
            success = !!object;
        }

        this._hideIndicator();

        if (success) {
            this.removeItem(variant || name);
            this.parent.soundManager?.play('ui_drop_item');
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
        e.stopPropagation();
        this.state.myteTarget = e.currentTarget;
        e.currentTarget.classList.add('on-target');
        // Clear container outline — Myte is the only target
        document.querySelectorAll('.container').forEach(c => c.classList.remove('on-target'));
    }

    handleMyteDragLeave(e) {
        e.currentTarget.classList.remove('on-target');
        this.state.myteTarget = null;
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
            return;
        }

        const itemType = this.state.draggedItem.dataset.type;
        const itemConfig = this.config.itemTypes[itemType];

        if (!itemConfig) return;

        // Apply item effects and remove from inventory
        this.applyItemEffects(myte, itemType, itemConfig);
        this.removeItem(this.state.draggedItem.dataset.variant || this.state.draggedItem.dataset.name);

        // Play type-appropriate sound
        const soundMap = { FOOD: 'myte_eat', TOY: 'myte_happy', MEDICINE: 'myte_happy' };
        this.parent.soundManager?.play(soundMap[itemType] || 'ui_drop_item');

        // Update cooldown
        this.state.lastFeedTime[myte.id] = now;

        myteElement.classList.remove('on-target');
        this.state.myteTarget = null;
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

    resolveDroppedMapObject({ name, type, variant }) {
        const canonicalVariant = this.findCanonicalVariant(variant || name);
        const normalizedType = MapObjectFactory.normalizeType(type);

        if (MapObjectFactory.hasType(normalizedType)) {
            return {
                type: normalizedType,
                variant: canonicalVariant || variant || name
            };
        }

        if (!canonicalVariant) return null;

        const matchedType = MapObjectFactory.getAvailableTypes().find(objectType =>
            MapObjectFactory.getVariantsForType(objectType).includes(canonicalVariant)
        );

        if (!matchedType) return null;

        return {
            type: matchedType,
            variant: canonicalVariant
        };
    }

    findCanonicalVariant(rawVariant) {
        if (!rawVariant) return null;

        const normalizedVariant = String(rawVariant).trim().toLowerCase();
        for (const objectType of MapObjectFactory.getAvailableTypes()) {
            const match = MapObjectFactory.getVariantsForType(objectType).find(
                variant => String(variant).toLowerCase() === normalizedVariant
            );
            if (match) {
                return match;
            }
        }

        return normalizedVariant;
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
