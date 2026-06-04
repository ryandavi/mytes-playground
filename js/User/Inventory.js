class Inventory {
    constructor(parent, inventoryElement) {
        this.parent = parent;
        this.inventoryElement = inventoryElement;
        this.items = [];
        this.boundHandlers = {
            dragStart: this.handleDragStart.bind(this),
            dragEnd: this.handleDragEnd.bind(this),
            containerDragOver: this.handleContainerDragOver.bind(this),
            containerDragLeave: this.handleContainerDragLeave.bind(this),
            containerDrop: this.handleContainerDrop.bind(this),
            myteDragOver: this.handleMyteDragOver.bind(this),
            myteDragLeave: this.handleMyteDragLeave.bind(this),
            myteDrop: this.handleMyteDrop.bind(this)
        };
        this.containerElements = [];
        this.boundMyteElements = new WeakSet();
        this.mutationObserver = null;

        // Configuration — tunable values live in SiteConfig.inventory
        this.config = {
            maxItems:    SiteConfig.inventory.maxItems,
            stackSize:   SiteConfig.inventory.stackSize,
            feedCooldown: SiteConfig.inventory.feedCooldown,
            dragOffsetX: 0,
            dragOffsetY: 0,
            itemTypes:   SiteConfig.inventory.itemTypes,
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

    get tooltipSystem() {
        return TooltipSystem.getInstance();
    }

    createTooltipContent(name, description = '') {
        const content = document.createElement('div');

        const title = document.createElement('strong');
        title.className = 'ui-tooltip__title';
        title.textContent = name;
        content.appendChild(title);

        if (description) {
            const body = document.createElement('span');
            body.className = 'ui-tooltip__body';
            body.textContent = description;
            content.appendChild(body);
        }

        return content;
    }

    showItemTooltip(itemElement, autoHideMs = 0) {
        this.tooltipSystem.show({
            anchor: itemElement,
            content: this.createTooltipContent(
                itemElement.dataset.name || '',
                itemElement.dataset.description || ''
            ),
            autoHideMs
        });
    }

    hideItemTooltip(itemElement) {
        if (this.tooltipSystem.isVisibleFor(itemElement)) {
            this.tooltipSystem.hide();
        }
    }

    toggleItemTooltip(itemElement, autoHideMs = 1500) {
        this.tooltipSystem.toggle({
            anchor: itemElement,
            content: this.createTooltipContent(
                itemElement.dataset.name || '',
                itemElement.dataset.description || ''
            ),
            autoHideMs
        });
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
        itemElement.dataset.description = description;
        itemElement.draggable = true;
        itemElement.tabIndex = 0;
        itemElement.setAttribute('aria-label', description ? `${name}. ${description}` : name);

        ItemRegistry.applySpriteStyles(itemElement, variant);

        itemElement.addEventListener('mouseenter', () => this.showItemTooltip(itemElement));
        itemElement.addEventListener('mouseleave', () => this.hideItemTooltip(itemElement));
        itemElement.addEventListener('focus', () => this.showItemTooltip(itemElement));
        itemElement.addEventListener('blur', () => this.hideItemTooltip(itemElement));
        itemElement.addEventListener('click', () => this.toggleItemTooltip(itemElement));

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

    addItem(name, quantity, type, description = '', variantOverride = null) {
        const rawVariant = variantOverride || name;
        if (rawVariant && !ItemRegistry.getItemSync(rawVariant)) {
            console.warn(`[Inventory] Adding item with no registry entry: "${rawVariant}". It will appear without a sprite.`);
        }

        const normalizedItem = this.normalizeItemData({
            name,
            quantity,
            type,
            description,
            variant: variantOverride || name
        });

        let remainingQuantity = Math.max(0, Number(quantity) || 0);
        const matchingStacks = this.items.filter(item => item.variant === normalizedItem.variant);

        matchingStacks.forEach(existingItem => {
            if (remainingQuantity <= 0) return;

            const currentQuantity = Number(existingItem.quantity) || 0;
            const availableSpace = Math.max(0, this.config.stackSize - currentQuantity);
            if (availableSpace <= 0) return;

            const quantityToAdd = Math.min(availableSpace, remainingQuantity);
            existingItem.quantity = currentQuantity + quantityToAdd;
            existingItem.element.dataset.quantity = existingItem.quantity;
            this.updateItemDisplay(existingItem);
            remainingQuantity -= quantityToAdd;
        });

        while (remainingQuantity > 0) {
            if (this.items.length >= this.config.maxItems) {
                console.warn('Inventory is full!');
                this.updateInventoryDisplay();
                return false;
            }

            const stackQuantity = Math.min(this.config.stackSize, remainingQuantity);
            const stackItem = {
                ...normalizedItem,
                quantity: stackQuantity
            };
            const itemElement = this.createItemElement(stackItem);
            this.inventoryElement.appendChild(itemElement);
            this.items.push({ ...stackItem, element: itemElement });
            remainingQuantity -= stackQuantity;
        }

        this.updateInventoryDisplay();
        return remainingQuantity === 0;
    }

    removeItem(nameOrVariant, quantity = 1) {
        const canonicalVariant = ItemRegistry.resolveIdSync(nameOrVariant) || ItemRegistry.normalizeId(nameOrVariant);
        const item = this.items.find(existingItem =>
            existingItem.variant === canonicalVariant || existingItem.name === nameOrVariant
        );
        if (!item) return false;

        const newQuantity = Math.max(0, parseInt(item.quantity) - quantity);

        if (newQuantity === 0) {
            this.hideItemTooltip(item.element);
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
        this.inventoryElement.addEventListener('dragstart', this.boundHandlers.dragStart);
        this.inventoryElement.addEventListener('dragend', this.boundHandlers.dragEnd);

        // Container events
        this.containerElements = Array.from(document.querySelectorAll('.app-stage, .container'));
        this.containerElements.forEach(container => {
            container.addEventListener('dragover', this.boundHandlers.containerDragOver);
            container.addEventListener('dragleave', this.boundHandlers.containerDragLeave);
            container.addEventListener('drop', this.boundHandlers.containerDrop);
        });

        // Add Myte events to existing Mytes
        this.addMyteListeners(document.querySelectorAll('.world-myte'));
    }

    handleDragStart(e) {
        if (!e.target.classList.contains('item')) return;

        this.state.draggedItem = e.target;
        this.state.isDragging = true;
        this.tooltipSystem.hide();

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

        document.querySelectorAll('.world-myte').forEach(myte => {
            myte.classList.add('is-droppable');
        });

        // Keep indicator hidden until the first dragover tells us where we are
        this.dropIndicator.style.display = 'none';
        this.state.snappedDropPos = null;
        this.state.dropValid = true;
    }

    handleDragEnd(e) {
        this.state.isDragging = false;
        this.state.draggedItem = null;

        document.querySelectorAll('.app-stage, .container').forEach(container => {
            container.classList.remove('is-drag-over');
        });

        document.querySelectorAll('.world-myte').forEach(myte => {
            myte.classList.remove('is-droppable', 'is-drag-over', 'is-drop-rejected');
        });

        this._hideIndicator();

        // Hide drop indicator
        this.dropIndicator.style.display = 'none';
    }

    handleContainerDragOver(e) {
        if (!this.state.isDragging || this.state.myteTarget) return;
        e.preventDefault();
        clearTimeout(this._indicatorHideTimer);
        e.currentTarget.classList.add('is-drag-over');
        this._updateIndicator(e.clientX, e.clientY);
    }

    handleContainerDragLeave(e) {
        e.currentTarget.classList.remove('is-drag-over');
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
            const s = gridSystem.snapToGrid(
                snappedX,
                snappedY,
                itemSize,
                itemSize,
                gridSystem.config.cellSize,
                { useCenter: false }
            );
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
        const myteElement = e.target.closest('.world-myte, .duplicate');
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

        // Droppable items (food, crops, picked flowers, etc.) spawn as physics world items.
        // The item registry's droppable flag controls this — map-placeable objects (e.g. music_box)
        // go through resolveDroppedMapObject instead.
        const itemDef = ItemRegistry.getItemSync(variant || name);
        if (itemDef?.droppable) {
            const itemVariant = variant || name;
            const dropped = this.parent.gameMap.addDroppedItem(
                itemDef.type?.toUpperCase() || 'ITEM',
                itemVariant,
                posX,
                posY
            );
            // Store variant so collect() resolves back to the correct registry entry
            if (dropped) {
                dropped.inventoryVariant = itemVariant;
                dropped.inventoryName = name;
                dropped.userDropSource = 'inventory';
                dropped.offeredToMytes = String(itemDef.type || '').toUpperCase() === 'FOOD';
                dropped.allowAutoCollect = dropped.offeredToMytes ? false : dropped.allowAutoCollect;
                if (dropped.offeredToMytes) {
                    this.notifyNearbyMytesOfDroppedFood(dropped);
                }
            }
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
        document.querySelectorAll('.app-stage, .container').forEach(el => el.classList.remove('is-drag-over'));

        if (success) {
            this.removeItem(variant || name);
            this.parent.soundManager?.play('ui_drop_item');
        }
    }

    // Myte Interaction Methods
    addMyteListeners(myteElements) {
        myteElements.forEach(myte => {
            if (!myte || this.boundMyteElements.has(myte)) return;

            myte.addEventListener('dragover', this.boundHandlers.myteDragOver);
            myte.addEventListener('dragleave', this.boundHandlers.myteDragLeave);
            myte.addEventListener('drop', this.boundHandlers.myteDrop);
            this.boundMyteElements.add(myte);
        });
    }

    handleMyteDragOver(e) {
        if (!this.state.isDragging) return;
        e.preventDefault();
        e.stopPropagation();
        this.state.myteTarget = e.currentTarget;
        const itemType = this.state.draggedItem?.dataset.type;
        const isValid = !!this.config.itemTypes[itemType];
        e.currentTarget.classList.toggle('is-drag-over', isValid);
        e.currentTarget.classList.toggle('is-drop-rejected', !isValid);
        document.querySelectorAll('.container').forEach(c => c.classList.remove('is-drag-over'));
    }

    handleMyteDragLeave(e) {
        e.currentTarget.classList.remove('is-drag-over', 'is-drop-rejected');
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
        const draggedItemData = {
            name: this.state.draggedItem.dataset.name,
            variant: this.state.draggedItem.dataset.variant || this.state.draggedItem.dataset.name,
            type: itemType,
            description: this.state.draggedItem.dataset.description || ''
        };

        if (!itemConfig) return;

        this.removeItem(draggedItemData.variant || draggedItemData.name);

        if (itemType === 'FOOD') {
            this.startFeedingSequence(myte, draggedItemData, itemConfig, {
                clientX: e.clientX,
                clientY: e.clientY
            });
        } else {
            this.applyItemEffects(myte, itemType, itemConfig);

            const soundMap = { FOOD: 'myte_eat', TOY: 'myte_happy', MEDICINE: 'myte_happy', FLOWER: 'myte_happy', HEALTH: 'myte_happy' };
            this.parent.soundManager?.play(soundMap[itemType] || 'ui_drop_item');
        }

        // Update cooldown
        this.state.lastFeedTime[myte.id] = now;

        myteElement.classList.remove('is-drag-over', 'is-drop-rejected');
        this.state.myteTarget = null;
    }

    applyItemEffects(myte, itemType, itemConfig) {
        // Clear current actions
        myte.queue.clear();

        this.queueItemExpressions(myte, itemConfig);
        this.applyConfiguredItemEffects(myte, itemConfig, { source: `inventory_${String(itemType || '').toLowerCase()}` });
        this.emitItemParticles(myte, itemType);
    }

    queueItemExpressions(myte, itemConfig) {
        const expressions = Array.isArray(itemConfig?.expressions) ? itemConfig.expressions.filter(Boolean) : [];
        if (expressions.length === 0) return;
        const duration = Math.max(120, (itemConfig.consumeTime || 1000) / expressions.length);
        expressions.forEach(expression => {
            myte.queue.addExpression(expression, duration);
        });
    }

    resolveItemEffects(itemConfig = {}) {
        if (itemConfig.effects && typeof itemConfig.effects === 'object') {
            return itemConfig.effects;
        }

        if (Number.isFinite(itemConfig.moodBoost)) {
            return { fun: itemConfig.moodBoost };
        }

        return {};
    }

    applyConfiguredItemEffects(myte, itemConfig, { source = 'inventory' } = {}) {
        myte.stats.applyStatEffects(this.resolveItemEffects(itemConfig));
        if (itemConfig?.saturationMs) {
            myte.buffs?.applyBuff?.('nourished', { durationMs: itemConfig.saturationMs, source });
        }
    }

    emitItemParticles(myte, itemType, options = {}) {
        const particleSystem = this.parent?.gameMap?.particleSystem || null;
        if (!particleSystem) return;

        const anchorId = options.anchorId || null;
        const position = anchorId
            ? myte.getAnchorWorldPosition?.(anchorId, null, { y: Math.round(myte.size.height * 0.55) })
            : {
                x: myte.posX + myte.size.width / 2,
                y: myte.posY + myte.size.height / 2
            };

        if (typeof particleSystem.spawnBurst === 'function') {
            particleSystem.spawnBurst('SPARKLE', position.x, position.y, {
                count: options.count ?? 6,
                spread: options.spread ?? 18,
                debugLabel: `inventory_${itemType}`
            });
            return;
        }

        particleSystem.emit?.('SPARKLE', position.x, position.y, {
            debugLabel: `inventory_${itemType}`
        });
    }

    startFeedingSequence(myte, itemData, itemConfig, { clientX = null, clientY = null } = {}) {
        const consumeTime = Math.max(400, Number(itemConfig?.consumeTime) || 1000);
        const animationDuration = Math.min(260, Math.max(140, Math.round(consumeTime * 0.3)));

        myte.queue.clear();
        this.queueItemExpressions(myte, {
            ...itemConfig,
            expressions: ['eat'],
            consumeTime
        });

        this.animateItemToMyteMouth(myte, itemData, { clientX, clientY, duration: animationDuration });

        const burstCount = Math.max(2, Math.round(consumeTime / 260));
        for (let index = 0; index < burstCount; index++) {
            const delay = animationDuration + Math.round(((consumeTime - animationDuration) * index) / Math.max(1, burstCount));
            window.setTimeout(() => {
                if (!myte?.active) return;
                this.emitItemParticles(myte, 'FOOD', {
                    anchorId: 'mouth.item',
                    count: 4,
                    spread: 10
                });
            }, delay);
        }

        window.setTimeout(() => {
            if (!myte?.active) return;
            this.applyConfiguredItemEffects(myte, itemConfig, { source: 'inventory_food' });
            this.parent.soundManager?.play('myte_eat');
        }, consumeTime);
    }

    animateItemToMyteMouth(myte, itemData, { clientX = null, clientY = null, duration = 180 } = {}) {
        const layer = this.parent?.gameMap?.layers?.objects;
        if (!layer) return;

        const tempSprite = this.createFeedSprite(itemData, duration);
        if (!tempSprite) return;

        const startWorldPos = (Number.isFinite(clientX) && Number.isFinite(clientY))
            ? this.parent.inputHandler.screenToWorldCoordinates(clientX, clientY)
            : myte.getAnchorWorldPosition?.('mouth.item') || {
                x: myte.posX + myte.size.width / 2,
                y: myte.posY + myte.size.height / 2
            };
        const endPos = myte.getMouthItemPosition?.(tempSprite.size) || {
            x: myte.posX + ((myte.size.width - tempSprite.size.width) / 2),
            y: myte.posY + ((myte.size.height - tempSprite.size.height) / 2)
        };

        tempSprite.element.style.left = `${startWorldPos.x - (tempSprite.size.width / 2)}px`;
        tempSprite.element.style.top = `${startWorldPos.y - (tempSprite.size.height / 2)}px`;
        tempSprite.element.style.zIndex = `${myte.getZIndex?.(myte.posY) ?? 9999}`;
        layer.appendChild(tempSprite.element);

        requestAnimationFrame(() => {
            tempSprite.element.style.left = `${endPos.x}px`;
            tempSprite.element.style.top = `${endPos.y}px`;
            tempSprite.element.style.transform = 'scale(0.82)';
            tempSprite.element.style.opacity = '0.95';
        });

        window.setTimeout(() => {
            tempSprite.element.remove();
        }, duration + 60);
    }

    createFeedSprite(itemData = {}, duration = 180) {
        const variant = itemData.variant || itemData.name;
        const itemDefinition = ItemRegistry.getItemSync(variant);
        const width = itemDefinition?.sprite?.width || 32;
        const height = itemDefinition?.sprite?.height || 32;
        const element = document.createElement('div');
        element.className = `inventory-feed-item ${ItemRegistry.normalizeId(variant)}`;
        const transitionMs = Math.max(120, Number(duration) || 180);
        element.style.position = 'absolute';
        element.style.width = `${width}px`;
        element.style.height = `${height}px`;
        element.style.pointerEvents = 'none';
        element.style.transition = `left ${transitionMs}ms ease-out, top ${transitionMs}ms ease-out, transform ${transitionMs}ms ease-out, opacity ${transitionMs}ms linear`;
        element.style.transformOrigin = 'center center';
        element.style.imageRendering = 'pixelated';
        element.style.backgroundRepeat = 'no-repeat';
        element.style.backgroundPosition = 'var(--item-sprite-x) var(--item-sprite-y)';
        element.style.opacity = '1';

        if (!ItemRegistry.applySpriteStyles(element, variant)) {
            element.style.background = 'rgba(255, 255, 255, 0.85)';
            element.style.borderRadius = '6px';
        }

        return {
            element,
            size: { width, height }
        };
    }

    notifyNearbyMytesOfDroppedFood(droppedItem) {
        if (!droppedItem?.isUserOfferedFood?.()) return;

        const nearbyMytes = (this.parent?.mytes || []).filter(myte =>
            myte?.isActive &&
            myte.goal === MOVE_TYPES.FREEROAM &&
            !myte.isDragging &&
            !myte.queue?.hasUserInitiatedAction?.() &&
            (myte.ai?.objectSearchRadius == null || myte.getDistanceTo?.(droppedItem) <= myte.ai.objectSearchRadius)
        );

        nearbyMytes.forEach((myte) => {
            myte.ai?.resetThinking?.();
            if (myte.ai?.canPlan?.()) {
                myte.ai.planNextAction();
            }
        });
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
        this.mutationObserver = new MutationObserver(mutations => {
            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    if (node.classList?.contains('world-myte') || node.classList?.contains('duplicate')) {
                        this.addMyteListeners([node]);
                    }
                });
            });
        });

        this.mutationObserver.observe(document.body, { childList: true, subtree: true });
    }

    dispose() {
        this.inventoryElement?.removeEventListener('dragstart', this.boundHandlers.dragStart);
        this.inventoryElement?.removeEventListener('dragend', this.boundHandlers.dragEnd);

        this.containerElements.forEach(container => {
            container.removeEventListener('dragover', this.boundHandlers.containerDragOver);
            container.removeEventListener('dragleave', this.boundHandlers.containerDragLeave);
            container.removeEventListener('drop', this.boundHandlers.containerDrop);
        });
        this.containerElements = [];

        document.querySelectorAll('.world-myte').forEach(myte => {
            myte.removeEventListener('dragover', this.boundHandlers.myteDragOver);
            myte.removeEventListener('dragleave', this.boundHandlers.myteDragLeave);
            myte.removeEventListener('drop', this.boundHandlers.myteDrop);
        });

        this.mutationObserver?.disconnect();
        this.mutationObserver = null;
        clearTimeout(this._indicatorHideTimer);

        this.dropIndicator?.remove();
        this.tooltipSystem.hide();
        this.items = [];
        this.state = {};
    }
}
