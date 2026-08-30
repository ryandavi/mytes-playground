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
            myteDrop: this.handleMyteDrop.bind(this),
            inventoryDragOver: this.handleInventoryDragOver.bind(this),
            inventoryDragLeave: this.handleInventoryDragLeave.bind(this),
            inventoryDrop: this.handleInventoryDrop.bind(this),
            placementPointerMove: this.handlePlacementPointerMove.bind(this),
            placementPointerDown: this.handlePlacementPointerDown.bind(this),
            placementKeyDown: this.handlePlacementKeyDown.bind(this)
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
            chestTarget: null,
            activeDropTargets: new Set(),
            placementItem: null,
            placementDescriptor: null,
            wallPlacementPreview: null
        };

        // Initialize
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setupMutationObserver();
        this.createDropIndicator();
        this.setupOverflowScroll();
    }

    /**
     * The bar is a single row (see _inventory.scss) that scrolls sideways once
     * it outgrows the shell, with no scrollbar to grab: the row is one icon tall
     * and a horizontal bar under it would cost the map more height than the
     * items do.
     *
     * So the two things a scrollbar was doing are done here instead — the wheel
     * drives the axis it would have driven, and the ends fade while there is
     * more row on that side.
     */
    setupOverflowScroll() {
        this.notice = document.createElement('span');
        this.notice.className = 'inventory-grid__notice';
        this.inventoryElement.appendChild(this.notice);

        this.boundHandlers.inventoryWheel = (event) => {
            if (event.deltaY === 0 || event.shiftKey) return;
            const { scrollLeft, scrollWidth, clientWidth } = this.inventoryElement;
            if (scrollWidth <= clientWidth) return;
            // Only claim the gesture while there is somewhere to go on this
            // axis, so the page keeps its wheel at either end of the row.
            const delta = event.deltaY;
            if ((delta < 0 && scrollLeft <= 0) ||
                (delta > 0 && scrollLeft >= scrollWidth - clientWidth - 1)) return;
            event.preventDefault();
            this.inventoryElement.scrollLeft += delta;
        };
        this.boundHandlers.inventoryScroll = () => this.updateOverflowState();

        this.inventoryElement.addEventListener('wheel', this.boundHandlers.inventoryWheel, { passive: false });
        this.inventoryElement.addEventListener('scroll', this.boundHandlers.inventoryScroll, { passive: true });
        this._overflowObserver = typeof ResizeObserver === 'function'
            ? new ResizeObserver(() => this.updateOverflowState())
            : null;
        this._overflowObserver?.observe(this.inventoryElement);
    }

    updateOverflowState() {
        const bar = this.inventoryElement;
        if (!bar) return;
        const overflow = bar.scrollWidth - bar.clientWidth;
        bar.classList.toggle('can-scroll-start', overflow > 1 && bar.scrollLeft > 1);
        bar.classList.toggle('can-scroll-end', overflow > 1 && bar.scrollLeft < overflow - 1);
    }

    createDropIndicator() {
        this.dropIndicator = document.createElement('div');
        this.dropIndicator.className = 'drop-target inventory-drop-indicator';
        this.dropPreview = document.createElement('div');
        this.dropPreview.className = 'inventory-placement-preview';
        this.dropTargetCollider = document.createElement('div');
        this.dropTargetCollider.className = 'drop-target-collider';
        this.dropIndicator.append(this.dropPreview, this.dropTargetCollider);
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

    createTooltipContent(name, description = '', definition = null) {
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

        const effects = definition?.use?.effects || {};
        const effectLabels = { satiety: 'Fullness', energy: 'Energy', fun: 'Fun', health: 'Health', comfort: 'Comfort' };
        const effectSummary = Object.entries(effects)
            .filter(([, value]) => Number.isFinite(value) && value !== 0)
            .map(([stat, value]) => `${effectLabels[stat] || stat} ${value > 0 ? '+' : ''}${value}`)
            .join(' · ');
        if (effectSummary) {
            const details = document.createElement('span');
            details.className = 'ui-tooltip__body inventory-item-effects';
            details.textContent = effectSummary;
            content.appendChild(details);
        }

        const action = definition?.inventory?.primaryAction;
        if (action) {
            const hint = document.createElement('span');
            hint.className = 'ui-tooltip__body inventory-item-hint';
            hint.textContent = `Double-click to ${action}.`;
            content.appendChild(hint);
        }

        return content;
    }

    showItemTooltip(itemElement, autoHideMs = 0) {
        this.tooltipSystem.show({
            anchor: itemElement,
            content: this.createTooltipContent(
                itemElement.dataset.name || '',
                itemElement.dataset.description || '',
                ItemRegistry.getItemSync(itemElement.dataset.variant || itemElement.dataset.name)
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
                itemElement.dataset.description || '',
                ItemRegistry.getItemSync(itemElement.dataset.variant || itemElement.dataset.name)
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
        itemElement.addEventListener('click', () => {
            this.hideItemTooltip(itemElement);
            this.parent?.ui?.setSelected?.(itemElement);
        });
        itemElement.addEventListener('dblclick', (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.activateItemElement(itemElement);
        });
        itemElement.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            this.activateItemElement(itemElement);
        });

        return itemElement;
    }

    loadItems(itemsArray) {
        this.items = [];
        this.inventoryElement.innerHTML = '';

        itemsArray.forEach(itemData => {
            try {
                const normalizedItem = this.normalizeItemData(itemData);
                this.addItem(
                    normalizedItem.name,
                    normalizedItem.quantity,
                    normalizedItem.type,
                    normalizedItem.description,
                    normalizedItem.variant
                );
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
        const stackSize = ItemRegistry.getStackLimit(normalizedItem.variant, this.config.stackSize);
        const matchingStacks = this.items.filter(item => item.variant === normalizedItem.variant);

        matchingStacks.forEach(existingItem => {
            if (remainingQuantity <= 0) return;

            const currentQuantity = Number(existingItem.quantity) || 0;
            const availableSpace = Math.max(0, stackSize - currentQuantity);
            if (availableSpace <= 0) return;

            const quantityToAdd = Math.min(availableSpace, remainingQuantity);
            existingItem.quantity = currentQuantity + quantityToAdd;
            existingItem.element.dataset.quantity = existingItem.quantity;
            this.updateItemDisplay(existingItem);
            remainingQuantity -= quantityToAdd;
        });

        while (remainingQuantity > 0) {
            if (this.items.length >= this.config.maxItems) {
                Utility.warnDebug('Inventory is full!');
                this.updateInventoryDisplay();
                return false;
            }

            const stackQuantity = Math.min(stackSize, remainingQuantity);
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

    getAvailableCapacity(nameOrVariant) {
        const canonicalVariant = ItemRegistry.resolveIdSync(nameOrVariant) || ItemRegistry.normalizeId(nameOrVariant);
        const stackSize = ItemRegistry.getStackLimit(canonicalVariant, this.config.stackSize);
        const stackCapacity = this.items
            .filter(item => item.variant === canonicalVariant)
            .reduce((total, item) => total + Math.max(0, stackSize - (Number(item.quantity) || 0)), 0);
        const emptySlotCapacity = Math.max(0, this.config.maxItems - this.items.length) * stackSize;
        return stackCapacity + emptySlotCapacity;
    }

    canAddItem(nameOrVariant, quantity = 1) {
        return this.getAvailableCapacity(nameOrVariant) >= Math.max(0, Number(quantity) || 0);
    }

    removeItem(nameOrVariant, quantity = 1) {
        const canonicalVariant = ItemRegistry.resolveIdSync(nameOrVariant) || ItemRegistry.normalizeId(nameOrVariant);
        const matchingItems = this.items.filter(existingItem =>
            existingItem.variant === canonicalVariant || existingItem.name === nameOrVariant
        );
        if (matchingItems.length === 0) return false;

        let remainingQuantity = Math.max(0, Number(quantity) || 0);
        let removedQuantity = 0;
        matchingItems.forEach((item) => {
            if (remainingQuantity <= 0) return;

            const currentQuantity = Number(item.quantity) || 0;
            const quantityToRemove = Math.min(currentQuantity, remainingQuantity);
            const newQuantity = currentQuantity - quantityToRemove;
            remainingQuantity -= quantityToRemove;
            removedQuantity += quantityToRemove;

            if (newQuantity === 0) {
                this.hideItemTooltip(item.element);
                if (this.parent?.ui?.selectionManager?.getSelectedObject?.() === item.element) {
                    this.parent.ui.setSelected(null);
                }
                item.element.remove();
                this.items = this.items.filter(existingItem => existingItem !== item);
                return;
            }

            item.quantity = newQuantity;
            item.element.dataset.quantity = newQuantity;
            this.updateItemDisplay(item);
            if (this.parent?.ui?.selectionManager?.getSelectedObject?.() === item.element) {
                this.parent.ui.actionSidebarManager?.updateActions?.(item.element);
            }
        });

        this.updateInventoryDisplay();
        return removedQuantity > 0;
    }

    // Newest stack of a variant — where a freshly added item landed.
    getStackElement(nameOrVariant) {
        const canonicalVariant = ItemRegistry.resolveIdSync(nameOrVariant) || ItemRegistry.normalizeId(nameOrVariant);
        const matches = this.items.filter(item => item.variant === canonicalVariant);
        return matches[matches.length - 1]?.element ?? null;
    }

    // Cosmetic only — the item is already in `this.items` by the time this runs.
    // `sourceElement` is where the item came from on screen (a shop row sprite);
    // omit it to just flash the slot.
    playAcquisition(nameOrVariant, sourceElement = null) {
        const targetElement = this.getStackElement(nameOrVariant);
        if (!targetElement) return;

        if (!sourceElement) {
            this.flashItem(targetElement);
            return;
        }

        this.flyItemTo(sourceElement, targetElement, () => this.flashItem(targetElement));
    }

    flashItem(itemElement) {
        if (!itemElement) return;
        itemElement.classList.remove('is-acquired');
        // Restart the animation: without a reflow the class re-add is coalesced
        // away and a second purchase of the same stack shows nothing.
        void itemElement.offsetWidth;
        itemElement.classList.add('is-acquired');
        itemElement.addEventListener(
            'animationend',
            () => itemElement.classList.remove('is-acquired'),
            { once: true }
        );
    }

    flyItemTo(sourceElement, targetElement, onArrival) {
        const from = sourceElement.getBoundingClientRect();
        const to = targetElement.getBoundingClientRect();
        if (!from.width || !to.width) {
            onArrival?.();
            return;
        }

        // Clone rather than rebuild: item sprites are spritesheet frames sized by
        // per-element custom properties and a `zoom`, none of which survive being
        // copied onto a plain div.
        const sprite = sourceElement.cloneNode(true);
        sprite.removeAttribute('id');
        sprite.removeAttribute('draggable');
        sprite.removeAttribute('tabindex');

        const ghost = document.createElement('div');
        ghost.className = 'item-acquisition-ghost';
        ghost.style.left = `${from.left + (from.width / 2)}px`;
        ghost.style.top = `${from.top + (from.height / 2)}px`;
        ghost.style.setProperty('--fly-x', `${(to.left + (to.width / 2)) - (from.left + (from.width / 2))}px`);
        ghost.style.setProperty('--fly-y', `${(to.top + (to.height / 2)) - (from.top + (from.height / 2))}px`);
        ghost.appendChild(sprite);
        document.body.appendChild(ghost);

        ghost.addEventListener('animationend', () => {
            ghost.remove();
            onArrival?.();
        }, { once: true });
    }

    updateItemDisplay(item) {
        const quantityDisplay = item.element.querySelector('.item-quantity');
        if (quantityDisplay) {
            quantityDisplay.textContent = item.quantity;
        }
    }

    updateInventoryDisplay() {
        const isEmpty = this.items.length === 0;
        const isFull = this.items.length >= this.config.maxItems;
        this.inventoryElement.classList.toggle('is-empty', isEmpty);
        this.inventoryElement.classList.toggle('is-full', isFull);
        if (this.notice) {
            this.notice.textContent = isEmpty ? 'Empty Inventory' : (isFull ? 'Inventory Full' : '');
        }
        // A slot added or removed changes what is reachable off the ends.
        this.updateOverflowState();
    }

    activateItemElement(itemElement) {
        const definition = ItemRegistry.getItemSync(itemElement?.dataset.variant || itemElement?.dataset.name);
        if (!definition) return false;

        const primaryAction = definition.inventory?.primaryAction ||
            (definition.use?.target === 'myte' ? 'use' : null);

        if (primaryAction === 'place') {
            return this.beginPlacement(itemElement);
        }

        if (primaryAction === 'feed' || primaryAction === 'use') {
            const myte = this.parent?.activeMyte;
            if (!myte?.isActive) {
                this.parent?.ui?.showMessage?.(`Select an active Myte to use ${definition.label}.`, 'warning', 'Inventory');
                return false;
            }
            return this.useItemOnMyte(itemElement, myte, definition);
        }

        this.showItemTooltip(itemElement, 2200);
        return false;
    }

    getConfiguredItemUse(definition, itemType) {
        const typeDefaults = this.config.itemTypes[itemType] || {};
        const use = definition?.use || {};
        return {
            ...typeDefaults,
            ...use,
            effects: use.effects || typeDefaults.effects || {},
            expressions: use.expressions || typeDefaults.expressions || []
        };
    }

    useItemOnMyte(itemElement, myte, definition = null, pointer = {}) {
        if (!itemElement || !myte) return false;

        const now = SimClock.now();
        if (now - (this.state.lastFeedTime[myte.id] ?? -Infinity) < this.config.feedCooldown) {
            // The myte is right under the cursor and "not yet" is the whole
            // message, so it answers for itself rather than through a toast in
            // the corner. The toast still covers a myte with no bubble to show.
            if (!myte.dialogue?.showRefusal?.('bowl')) {
                this.parent?.ui?.showMessage?.(`${myte.name || 'This Myte'} needs a moment before another item.`, 'warning', 'Inventory');
            }
            return false;
        }

        const itemType = String(itemElement.dataset.type || '').toUpperCase();
        const itemDefinition = definition || ItemRegistry.getItemSync(itemElement.dataset.variant || itemElement.dataset.name);
        const itemConfig = this.getConfiguredItemUse(itemDefinition, itemType);
        if (itemDefinition?.inventory?.primaryAction === 'place' && itemDefinition?.use?.target !== 'myte') {
            return false;
        }
        if (!itemDefinition?.use?.target && !this.config.itemTypes[itemType]) return false;

        const itemData = {
            name: itemElement.dataset.name,
            variant: itemElement.dataset.variant || itemElement.dataset.name,
            type: itemType,
            description: itemElement.dataset.description || ''
        };

        if (!this.removeItem(itemData.variant || itemData.name)) return false;

        if (itemConfig.action === 'feed' || itemType === 'FOOD') {
            this.startFeedingSequence(myte, itemData, itemConfig, pointer);
        } else {
            this.applyItemEffects(myte, itemType, itemConfig);
            this.parent.soundManager?.play(itemConfig.sound || 'myte_happy');
        }

        this.state.lastFeedTime[myte.id] = now;
        return true;
    }

    beginPlacement(itemElement) {
        if (!itemElement || !ItemRegistry.getItemSync(itemElement.dataset.variant || itemElement.dataset.name)?.world) {
            return false;
        }

        // Each item belongs to a mode (see getItemMode). Rather than refuse and
        // leave the player at a dead end, switch modes for them and say so —
        // both ways round, so a ball put down while building drops you back into
        // the world it is going to roll around in.
        const gameMode = this.parent?.gameMode;
        const wantedMode = this.getItemMode(itemElement);
        if (gameMode && gameMode.mode !== wantedMode) {
            if (!gameMode.setMode(wantedMode)) return false;
            this.parent?.ui?.showMessage?.(
                `Switched to ${this.getModeLabel(wantedMode)} to place this.`,
                'info',
                this.getModeLabel(wantedMode)
            );
        }

        this.cancelPlacement();
        this.state.placementItem = itemElement;
        this.state.draggedItem = itemElement;
        this.state.placementDescriptor = this.getPlacementDescriptor(itemElement);
        itemElement.classList.add('is-placing');
        this.inventoryElement.classList.add('is-placing-item');
        this.parent?.ui?.showMessage?.('Click the map to place it. Press Esc to cancel.', 'info', 'Placement');
        return true;
    }

    cancelPlacement() {
        this.state.placementItem?.classList.remove('is-placing');
        this.inventoryElement.classList.remove('is-placing-item');
        if (!this.state.isDragging) this.state.draggedItem = null;
        this.state.placementItem = null;
        this.state.placementDescriptor = null;
        this._hideIndicator();
    }

    handlePlacementPointerMove(event) {
        if (!this.state.placementItem) return;
        const target = document.elementFromPoint(event.clientX, event.clientY);
        if (target?.closest?.('.app-stage, .container')) {
            this._updateIndicator(event.clientX, event.clientY);
        } else {
            this._hideIndicator();
        }
    }

    handlePlacementPointerDown(event) {
        if (!this.state.placementItem) return;
        if (event.button === 2) {
            event.preventDefault();
            this.cancelPlacement();
            return;
        }
        if (event.button !== 0 || !event.target.closest?.('.app-stage, .container')) return;
        if (event.target.closest?.('.world-myte, .interactableObject, .dropped-item')) return;

        event.preventDefault();
        event.stopPropagation();
        this._updateIndicator(event.clientX, event.clientY);
        if (this.state.dropValid === false) return;

        const itemElement = this.state.placementItem;
        const worldPos = this.state.snappedDropPos
            ? this.getPlacementPosition(this.state.snappedDropPos)
            : this.parent.inputHandler.screenToWorldCoordinates(event.clientX, event.clientY);
        const placed = this.placeInventoryItem(itemElement, worldPos.x, worldPos.y);
        if (placed) this.cancelPlacement();
    }

    handlePlacementKeyDown(event) {
        if (event.key === 'Escape' && this.state.placementItem) {
            event.preventDefault();
            this.cancelPlacement();
        }
    }

    // Drag and Drop Event Handlers
    setupEventListeners() {
        // Inventory events
        this.inventoryElement.addEventListener('dragstart', this.boundHandlers.dragStart);
        this.inventoryElement.addEventListener('dragend', this.boundHandlers.dragEnd);
        this.inventoryElement.addEventListener('dragover', this.boundHandlers.inventoryDragOver);
        this.inventoryElement.addEventListener('dragleave', this.boundHandlers.inventoryDragLeave);
        this.inventoryElement.addEventListener('drop', this.boundHandlers.inventoryDrop);
        document.addEventListener('pointermove', this.boundHandlers.placementPointerMove);
        document.addEventListener('pointerdown', this.boundHandlers.placementPointerDown, true);
        document.addEventListener('keydown', this.boundHandlers.placementKeyDown);

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

        // Each mode places its own kind, both ways round: no furniture into a
        // world you are playing, no toys into a world you have frozen. Refusing
        // the drag before it starts is the honest answer — letting it run and
        // rejecting the drop teaches the player nothing. A double-click still
        // places either kind, switching modes for you.
        const wantedMode = this.getItemMode(e.target);
        const currentMode = this.parent?.gameMode?.mode;
        if (currentMode && wantedMode !== currentMode) {
            e.preventDefault();
            const label = ItemRegistry.getItemSync(
                e.target.dataset.variant || e.target.dataset.name
            )?.label || e.target.dataset.name || 'That';
            this.parent?.ui?.showMessage?.(
                `${label} is placed in ${this.getModeLabel(wantedMode)} (B).`,
                'info',
                this.getModeLabel(wantedMode)
            );
            return;
        }

        this.state.draggedItem = e.target;
        this.state.isDragging = true;
        this.state.placementDescriptor = this.getPlacementDescriptor(e.target);
		// The camera is NOT borrowed here. A dragstart fires while the pointer
		// is still over the inventory, and the borrow follows the cursor from
		// the moment it opens — so the view slid off toward whichever edge the
		// panel sits against before the drag ever reached the map. The first
		// dragover on the stage opens it instead, with a real position.
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

    handleDragEnd() {
        this.endDragState();
    }

    /**
     * Tear down an inventory drag. Safe to call twice.
     *
     * Not driven by `dragend` alone, because `dragend` fires at the source
     * element and the source element does not always survive the drop: placing
     * the last of a stack removes its slot from the inventory, and a dragend on
     * a detached node has no ancestors to bubble through, so the listener on the
     * inventory never hears it. The drag then never ended — `isDragging` stayed
     * true and the camera's borrow stayed open, so it kept calling syncToCursor
     * and the drop indicator followed the pointer around the map forever. Every
     * drop path calls this itself, and `dragend` still covers the drags that end
     * without one.
     */
    endDragState() {
        // Only a real HTML5 drag, which always sets this. Click-to-place also
        // parks an element in `draggedItem`, and that flow ends through
        // cancelPlacement — clearing it from here would cancel it mid-placement.
        if (!this.state.isDragging) return;
		this.parent.camera?.endTemporaryCursorFollow?.(this);
        this._setChestTarget(null);
        this.state.isDragging = false;
        this.state.draggedItem = null;
        this.state.placementDescriptor = null;

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

    handleInventoryDragOver(event) {
        const droppedItem = typeof DroppedMapItem !== 'undefined' ? DroppedMapItem.storageDragItem : null;
        if (!droppedItem) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        this.inventoryElement.classList.add('is-store-target');
    }

    handleInventoryDragLeave(event) {
        if (event.relatedTarget && this.inventoryElement.contains(event.relatedTarget)) return;
        this.inventoryElement.classList.remove('is-store-target');
    }

    handleInventoryDrop(event) {
        const droppedItem = typeof DroppedMapItem !== 'undefined' ? DroppedMapItem.storageDragItem : null;
        if (!droppedItem) return;
        event.preventDefault();
        event.stopPropagation();
        this.inventoryElement.classList.remove('is-store-target');
        this.storeDroppedItem(droppedItem);
    }

    storeDroppedItem(droppedItem) {
        if (!droppedItem?.active || droppedItem.collected) return false;
        const entry = droppedItem.getInventoryEntryData?.(droppedItem.quantity || 1);
        if (!entry || !this.canAddItem(entry.variant, entry.quantity)) {
            this.parent?.ui?.showMessage?.('There is not enough inventory space.', 'warning', 'Inventory Full');
            return false;
        }

        if (!this.addItem(entry.name, entry.quantity, entry.type, entry.description, entry.variant)) return false;
        this.playAcquisition(entry.variant);
        droppedItem.collected = true;
        droppedItem.remove?.();
        this.parent?.ui?.setSelected?.(null);
        this.parent.soundManager?.play('ui_pickup_item');
        return true;
    }

    storeMapObject(object) {
        const itemDef = ItemRegistry.findItemForWorldObject(object);
        if (!itemDef || object.isInUse?.()) return false;
        if (!this.canAddItem(itemDef.id, 1)) {
            this.parent?.ui?.showMessage?.('There is not enough inventory space.', 'warning', 'Inventory Full');
            return false;
        }

        if (!this.addItem(itemDef.label, 1, itemDef.type, itemDef.description, itemDef.id)) return false;
        this.playAcquisition(itemDef.id);
        object.remove?.();
        this.parent?.ui?.setSelected?.(null);
        this.parent.soundManager?.play('ui_pickup_item');
        return true;
    }

    /**
     * The stage edge this panel sits against, for the camera to stop scrolling
     * toward while something is being dragged in or out of it — see
     * Camera.beginTemporaryCursorFollow.
     *
     * Measured rather than hardcoded as 'bottom': the inventory has moved
     * around the shell before, and an edge written down here would go stale
     * silently and read exactly like the bug it was added to fix. A panel drawn
     * OVER the map has no edge of its own and blocks nothing.
     */
    getStageEdge() {
        const panel = this.inventoryElement && this.parent?.getRect?.(this.inventoryElement);
        const stage = this.parent?.getContainerRect?.();
        if (!panel || !stage) return null;

        const gaps = {
            bottom: panel.top - stage.bottom,
            top: stage.top - panel.bottom,
            right: panel.left - stage.right,
            left: stage.left - panel.right
        };
        return Object.entries(gaps)
            .filter(([, gap]) => gap > -1)
            .sort(([, left], [, right]) => left - right)[0]?.[0] ?? null;
    }

    // What that edge means to a camera borrow, in the shape it wants.
    getBlockedDragEdges() {
        const edge = this.getStageEdge();
        return edge ? [edge] : null;
    }

    isPointInside(clientX, clientY) {
        const rect = this.inventoryElement?.getBoundingClientRect?.();
        return !!rect && clientX >= rect.left && clientX <= rect.right &&
            clientY >= rect.top && clientY <= rect.bottom;
    }

    handleContainerDragOver(e) {
        if (!this.state.isDragging || this.state.myteTarget) return;
        e.preventDefault();
		this.parent.camera?.beginTemporaryCursorFollow?.(this, {
			blockedEdges: this.getBlockedDragEdges()
		});
		this.parent.camera?.updateTemporaryCursorFollow?.(this, e.clientX, e.clientY);
        clearTimeout(this._indicatorHideTimer);
        e.currentTarget.classList.add('is-drag-over');

        // A container under the cursor is a place to put things, not a place to
        // stand something on the floor — so it takes the drop and the placement
        // indicator gets out of the way.
        if (this._setChestTarget(this._findChestTarget(e.target))) {
            this._hideIndicator();
            return;
        }

        this._updateIndicator(e.clientX, e.clientY);
    }

    /**
     * The chest under the pointer, if it can take what is being dragged. Storable
     * furniture is excluded: dragging a lantern onto a chest means "put the
     * lantern down there", not "post the lantern into the chest".
     */
    _findChestTarget(target) {
        if (!this.state.draggedItem) return null;

        const element = target?.closest?.('.treasure-chest');
        if (!element?.dataset?.objectId) return null;

        const { name, variant } = this.state.draggedItem.dataset;
        if (ItemRegistry.getItemSync(variant || name)?.world?.mode === 'map_object') return null;

        const chest = this.parent.gameMap?.getObjectById?.(element.dataset.objectId);
        return chest?.canAcceptDeposit?.() === true ? chest : null;
    }

    _setChestTarget(chest) {
        if (this.state.chestTarget === chest) return !!chest;

        this.state.chestTarget?.element?.classList.remove('is-drag-over');
        this.state.chestTarget = chest;
        chest?.element?.classList.add('is-drag-over');
        return !!chest;
    }

    _depositIntoChest(chest) {
        const { name, variant, type } = this.state.draggedItem.dataset;
        const itemVariant = variant || name;

        if (!chest.depositItem({ variant: itemVariant, type })) {
            const reason = chest.getDepositRefusal?.() ||
                `${ItemRegistry.getItemSync(itemVariant)?.label || name} does not fit in there.`;
            this.parent?.ui?.showMessage?.(reason, 'warning', 'Chest');
            return false;
        }

        if (!this.removeItem(itemVariant)) return false;

        this.parent.soundManager?.play('ui_drop_item');
        this.parent?.ui?.showMessage?.(
            `Put ${ItemRegistry.getItemSync(itemVariant)?.label || name} in the chest.`,
            'info',
            'Chest'
        );
        return true;
    }

    handleContainerDragLeave(e) {
        e.currentTarget.classList.remove('is-drag-over');
        this._setChestTarget(null);
		const bounds = e.currentTarget.getBoundingClientRect();
		if (e.clientX < bounds.left || e.clientX > bounds.right ||
			e.clientY < bounds.top || e.clientY > bounds.bottom) {
			this.parent.camera?.endTemporaryCursorFollow?.(this);
		}
        // Small delay to avoid flicker when moving between child elements
        this._indicatorHideTimer = setTimeout(() => this._hideIndicator(), 60);
    }

    _hideIndicator() {
		this._endWallPlacementPreview();
        this.dropIndicator.style.display = 'none';
        this.dropIndicator.classList.remove('is-drop-valid', 'is-drop-invalid');
        if (this.dropIndicator.parentElement) {
            this.dropIndicator.parentElement.removeChild(this.dropIndicator);
        }
        this.state.snappedDropPos = null;
        this.state.dropValid = true;
    }

    // The camera calls this on the owner of its borrow after an edge-scroll
    // step, so the drop indicator tracks the world rather than freezing on the
    // screen while the map slides under it.
    syncToCursor(clientX, clientY) {
        if (!this.state.isDragging || this.state.chestTarget) return;
        this._updateIndicator(clientX, clientY);
    }

    _updateIndicator(clientX, clientY) {
        const layer = this.parent.gameMap?.layers?.objects;
        if (!layer) return;

        if (!this.dropIndicator.parentElement) {
            layer.appendChild(this.dropIndicator);
        }

        const worldPos = this.parent.inputHandler.screenToWorldCoordinates(clientX, clientY);
        const descriptor = this.state.placementDescriptor || this.getPlacementDescriptor();
        const { width, height } = descriptor;
        const gridSystem = this.parent.gameMap?.gridSystem;
        const map = this.parent.gameMap;

        let snappedX = worldPos.x - width / 2;
        let snappedY = worldPos.y - height / 2;
		const wallPreview = this._syncWallPlacementPreview(descriptor, snappedX, snappedY);

        if (gridSystem && descriptor.snapToGrid) {
            const s = gridSystem.snapToGrid(
                snappedX,
                snappedY,
                width,
                height,
                gridSystem.config.cellSize,
                { useCenter: false }
            );
            snappedX = s.x;
            snappedY = s.y;
        }

        let wallPlacement = null;
        if (descriptor.wallFixture) {
            wallPlacement = map?.wallBuilder?.resolveFixturePlacement?.(
				wallPreview,
				snappedX,
				snappedY
			) || null;
			if (wallPlacement) {
				snappedX = wallPlacement.position.x;
				snappedY = wallPlacement.position.y;
			}
		} else if (descriptor.wallOpening) {
			wallPlacement = map?.wallBuilder?.resolveOpeningPlacement?.(
				wallPreview,
				snappedX,
				snappedY
			) || null;
			if (wallPlacement) {
				snappedX = wallPlacement.position.x;
				snappedY = wallPlacement.position.y;
			}
		}
		if (wallPreview) {
			wallPreview.posX = snappedX;
			wallPreview.posY = snappedY;
			map?.wallBuilder?.refreshMovingObjectReveal?.(wallPreview);
		}

        this.state.snappedDropPos = { x: snappedX, y: snappedY, width, height, descriptor };
        this.state.dropValid = descriptor.wallFixture || descriptor.wallOpening
			? wallPlacement !== null
			: this._isDropPositionValid(snappedX, snappedY, descriptor, gridSystem, map);

        this.dropIndicator.style.width  = `${width}px`;
        this.dropIndicator.style.height = `${height}px`;
		this.dropIndicator.style.left   = `${snappedX}px`;
		this.dropIndicator.style.top    = `${snappedY}px`;
		this.updateDropIndicatorDepth(descriptor, wallPreview, wallPlacement, snappedX, snappedY, map);
        this.updatePlacementPreview(descriptor);
        this.dropIndicator.style.display = 'block';
        this.dropIndicator.classList.toggle('is-drop-valid', this.state.dropValid);
        this.dropIndicator.classList.toggle('is-drop-invalid', !this.state.dropValid);
    }

	/**
	 * A wall preview belongs immediately above the wall it will be attached to.
	 * Derive that depth from the resolved host instead of relying on a fixed UI
	 * z-index: world depth grows with map Y, so any fixed value eventually loses.
	 */
	updateDropIndicatorDepth(descriptor, preview, placement, x, y, map) {
		if (!descriptor?.wallFixture && !descriptor?.wallOpening) {
			this.dropIndicator.style.removeProperty('z-index');
			return;
		}

		let zIndex = null;
		if (descriptor.wallOpening) {
			zIndex = map?.wallBuilder?.getOpeningRenderZIndex?.(preview, x, y);
		} else if (placement?.piece) {
			zIndex = map?.getDepthZIndex?.(placement.piece.baseline) + 1;
		}
		if (Number.isFinite(zIndex)) this.dropIndicator.style.zIndex = String(zIndex);
		else this.dropIndicator.style.removeProperty('z-index');
	}

    _isDropPositionValid(snappedX, snappedY, descriptor, gridSystem, map) {
        if (!gridSystem || !map) return true;

        const collider = descriptor.collider || {};
        const bounds = {
            x: snappedX + (collider.x ?? 0),
            y: snappedY + (collider.y ?? 0),
            width: collider.width ?? descriptor.width,
            height: collider.height ?? descriptor.height
        };
        const mapW = map.dimensions?.width ?? Infinity;
        const mapH = map.dimensions?.height ?? Infinity;
        if (bounds.x < 0 || bounds.y < 0 || bounds.x + bounds.width > mapW || bounds.y + bounds.height > mapH) {
            return false;
        }

        const cellSize = gridSystem.config.cellSize;
        const startGX = Math.floor(bounds.x / cellSize);
        const startGY = Math.floor(bounds.y / cellSize);
        const endGX   = Math.floor((bounds.x + bounds.width - 1) / cellSize);
        const endGY   = Math.floor((bounds.y + bounds.height - 1) / cellSize);

        for (let gx = startGX; gx <= endGX; gx++) {
            for (let gy = startGY; gy <= endGY; gy++) {
                const cell = gridSystem.grid[gx]?.[gy];
                if (!cell || (cell.tileWalkable ?? cell.walkable) === false) return false;
                if (!descriptor.overlappable) {
                    const hasBlocker = [...(cell.objects || [])].some(object =>
                        object.getConfig?.('visual.overlappable', false) !== true
                    );
                    if (hasBlocker) return false;
                }
            }
        }

        return true;
    }

    // Scenery, as opposed to something you play with. One rule, asked in every
    // place an item can reach the map: drag, double-click placement, and the
    // slot's own appearance.
    isBuildOnly(itemElement) {
        return BuildRules.isBuildOnlyItem(
            ItemRegistry.getItemSync(itemElement?.dataset?.variant || itemElement?.dataset?.name)
        );
    }

    /**
     * The mode an item is placed in. Each mode places its own kind and only its
     * own kind: furnishing a room is building, and a ball you put down for a
     * myte to chase is playing — in a frozen world nothing would chase it.
     */
    getItemMode(itemElement) {
        return this.isBuildOnly(itemElement) ? GAME_MODES.BUILD : GAME_MODES.PLAY;
    }

    getModeLabel(mode) {
        return mode === GAME_MODES.BUILD ? 'Build Mode' : 'Play Mode';
    }

    getPlacementDescriptor(itemElement = this.state.draggedItem) {
        const itemDef = ItemRegistry.getItemSync(itemElement?.dataset?.variant || itemElement?.dataset?.name);
        const world = itemDef?.world || {};
        if (world.mode !== 'map_object') {
            const imageUrl = itemDef?.visual?.image?.url || null;
            const sprite = itemDef?.sprite || null;
            return {
                mode: world.mode || 'dropped_item',
                width: 32,
                height: 32,
                anchor: 'center',
                collider: null,
                overlappable: true,
                previewImage: imageUrl || (sprite ? itemDef.spriteSheetUrl : null),
                previewFit: imageUrl ? 'contain' : 'sprite-frame',
                previewBackgroundPosition: sprite ? `${sprite.x}px ${sprite.y}px` : 'center',
                previewFrame: sprite ? { width: sprite.width, height: sprite.height, left: 0, top: 0 } : null
            };
        }

        let config = MapObjectFactory.mergeConfigs(world.objectType, world.variant || itemDef.id, {
            configOverrides: { inventoryItemId: itemDef.id }
        });
        if (config.directionConfigs) {
            config = MapObject.processDirectionConfig(config, config.direction || 'S');
        }
        const scale = Number(config.scale) || 1;
        const width = (Number(config.size?.width) || 64) * scale;
        const height = (Number(config.size?.height) || 64) * scale;
        const colliderRegion = config.spatial?.regions?.collider;
        const spriteSheet = config.visual?.spriteSheet || config.spriteConfig?.spriteSheet || {};
        const frameSize = spriteSheet.frameSize || config.spriteConfig?.spriteSheet?.frameSize || null;

        return {
            mode: 'map_object',
            width,
            height,
            anchor: 'top-left',
			snapToGrid: config.snapToGrid === true,
			wallFixture: config.wallFixture === true,
			wallOpening: !!config.wallOpeningConfig,
			wallObjectType: world.objectType,
			wallVariant: world.variant || itemDef.id,
			config,
            collider: colliderRegion ? {
                x: (colliderRegion.x ?? colliderRegion.offsetX ?? 0) * scale,
                y: (colliderRegion.y ?? colliderRegion.offsetY ?? 0) * scale,
                width: (colliderRegion.width ?? config.size?.width ?? 64) * scale,
                height: (colliderRegion.height ?? config.size?.height ?? 64) * scale
            } : null,
            overlappable: config.visual?.overlappable === true,
            previewImage: spriteSheet.url || itemDef.visual?.image?.url || null,
            previewFit: 'world-sprite',
            previewBackgroundPosition: '0 0',
            previewTransform: config.transformStyle || '',
            previewFrame: frameSize ? {
                width: Number(frameSize.width) || width,
                height: Number(frameSize.height) || height,
                left: -(Number(config.spriteFrameOffset?.offsetX ?? frameSize.offsetX) || 0),
                top: -(Number(config.spriteFrameOffset?.offsetY ?? frameSize.offsetY) || 0)
            } : null
        };
    }

	_syncWallPlacementPreview(descriptor, x, y) {
		if (!descriptor?.wallFixture && !descriptor?.wallOpening) {
			this._endWallPlacementPreview();
			return null;
		}

		let preview = this.state.wallPlacementPreview;
		if (!preview) {
			const config = descriptor.config || {};
			preview = {
				id: 'inventory-wall-placement-preview',
				type: String(descriptor.wallObjectType || '').toUpperCase(),
				variant: descriptor.wallVariant,
				size: { width: descriptor.width, height: descriptor.height },
				posX: x,
				posY: y,
				getConfig: (path, defaultValue = null) => {
					let current = config;
					for (const key of String(path || '').split('.')) {
						if (current === undefined || current === null ||
							!Object.prototype.hasOwnProperty.call(current, key)) return defaultValue;
						current = current[key];
					}
					return current !== undefined ? current : defaultValue;
				}
			};
			this.state.wallPlacementPreview = preview;
			this.parent.gameMap?.wallBuilder?.beginPlacementPreview?.(preview);
		} else {
			preview.posX = x;
			preview.posY = y;
		}
		return preview;
	}

	_endWallPlacementPreview() {
		const preview = this.state.wallPlacementPreview;
		if (!preview) return;
		this.parent.gameMap?.wallBuilder?.endPlacementPreview?.(preview);
		this.state.wallPlacementPreview = null;
	}

    updatePlacementPreview(descriptor) {
        const hasPreview = !!descriptor.previewImage;
        this.dropPreview.style.display = '';
        this.dropPreview.classList.toggle('is-placeholder', !hasPreview);
        this.dropPreview.textContent = hasPreview ? '' : '?';
        this.dropPreview.style.backgroundImage = hasPreview ? `url('${descriptor.previewImage}')` : '';
        this.dropPreview.style.transform = hasPreview ? descriptor.previewTransform : '';
        this.dropPreview.style.backgroundPosition = hasPreview ? (descriptor.previewBackgroundPosition || '0 0') : '';
        this.dropPreview.style.backgroundRepeat = hasPreview ? 'no-repeat' : '';
        this.dropPreview.style.backgroundSize = descriptor.previewFit === 'contain' ? 'contain' : '';
		if (hasPreview) {
			const previewImage = descriptor.previewImage;
			Utility.monitorImageAsset(previewImage, () => {
				if (this.state.placementDescriptor?.previewImage !== previewImage) return;
				this.dropPreview.style.backgroundImage = 'none';
				this.dropPreview.classList.add('is-placeholder');
				this.dropPreview.textContent = '?';
			});
		}
        this.dropPreview.style.width = descriptor.previewFrame ? `${descriptor.previewFrame.width}px` : '';
        this.dropPreview.style.height = descriptor.previewFrame ? `${descriptor.previewFrame.height}px` : '';
        this.dropPreview.style.left = descriptor.previewFrame ? `${descriptor.previewFrame.left}px` : '';
        this.dropPreview.style.top = descriptor.previewFrame ? `${descriptor.previewFrame.top}px` : '';

        const collider = descriptor.collider;
        this.dropTargetCollider.style.display = collider ? '' : 'none';
        if (!collider) return;
        this.dropTargetCollider.style.left = `${collider.x}px`;
        this.dropTargetCollider.style.top = `${collider.y}px`;
        this.dropTargetCollider.style.width = `${collider.width}px`;
        this.dropTargetCollider.style.height = `${collider.height}px`;
    }

    getPlacementPosition(snappedPlacement) {
        if (snappedPlacement.descriptor?.anchor === 'top-left') {
            return { x: snappedPlacement.x, y: snappedPlacement.y };
        }
        return {
            x: snappedPlacement.x + snappedPlacement.width / 2,
            y: snappedPlacement.y + snappedPlacement.height / 2
        };
    }

    handleContainerDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        if (!this.state.draggedItem) return;
        try {
            this._handleContainerDrop(e);
        } finally {
            // Whatever the drop decided, the drag is over — see endDragState.
            this.endDragState();
        }
    }

    _handleContainerDrop(e) {
        // Check if we dropped on a Myte first
        const myteElement = e.target.closest('.world-myte, .duplicate');
        if (myteElement) {
            // Handle Myte drop separately
            return;
        }

        // Dropping onto a chest puts the item inside it rather than on the floor
        // in front of it.
        const chest = this.state.chestTarget || this._findChestTarget(e.target);
        if (chest) {
            this._depositIntoChest(chest);
            this._setChestTarget(null);
            this._hideIndicator();
            document.querySelectorAll('.app-stage, .container').forEach(el => el.classList.remove('is-drag-over'));
            return;
        }

        const container = e.currentTarget;
        const layerForeground = container.querySelector('.layer.foreground');
        if (!layerForeground) return;

        // Use the exact snapped position the indicator showed, or fall back to cursor
        let posX, posY;
        if (this.state.snappedDropPos) {
            const placementPos = this.getPlacementPosition(this.state.snappedDropPos);
            posX = placementPos.x;
            posY = placementPos.y;
        } else {
            const worldPos = this.parent.inputHandler.screenToWorldCoordinates(e.clientX, e.clientY);
            posX = worldPos.x;
            posY = worldPos.y;
        }

        // A refused drop said nothing at all: the ghost went red, the item went
        // back in the bar, and a painting dropped anywhere but a wall looked
        // like a bug. The reason is the same copy BuildRules gives a refused
        // drag on the map.
        if (this.state.dropValid === false) {
            const descriptor = this.state.snappedDropPos?.descriptor || this.state.placementDescriptor;
            this.parent?.ui?.showMessage?.(
                BuildRules.describePlacementRefusal(descriptor || {}),
                'warning',
                'Placement'
            );
            this._hideIndicator();
            return;
        }

        const success = this.placeInventoryItem(this.state.draggedItem, posX, posY);

        this._hideIndicator();
        document.querySelectorAll('.app-stage, .container').forEach(el => el.classList.remove('is-drag-over'));

        if (success) this.parent.soundManager?.play('ui_drop_item');
    }

    placeInventoryItem(itemElement, posX, posY) {
        if (!itemElement) return false;
        const { name, variant, type } = itemElement.dataset;
        const itemDef = ItemRegistry.getItemSync(variant || name);
        const world = itemDef?.world || {};
        let placed = null;

        if (world.mode === 'dropped_item' || itemDef?.droppable) {
            const itemVariant = variant || name;
            placed = this.parent.gameMap.addDroppedItem(
                itemDef.type?.toUpperCase() || 'ITEM',
                itemVariant,
                posX,
                posY
            );
            if (placed) {
                placed.inventoryVariant = itemVariant;
                placed.inventoryName = name;
                placed.inventoryType = type;
                placed.userDropSource = 'inventory';
                placed.offeredToMytes = world.offeredToMytes === true || String(itemDef.type || '').toUpperCase() === 'FOOD';
                placed.allowAutoCollect = placed.offeredToMytes ? false : placed.allowAutoCollect;
                if (placed.offeredToMytes) this.notifyNearbyMytesOfDroppedFood(placed);
            }
        } else if (world.mode === 'map_object') {
            placed = this.parent.gameMap.addObject(
                world.objectType,
                world.variant || itemDef.id,
                posX,
                posY,
                { configOverrides: { inventoryItemId: itemDef.id } }
            );
			if (placed?.onPlacementDragEnd && placed.onPlacementDragEnd() !== true) {
				placed.remove?.();
				placed = null;
			}
			if (placed?.triggerDropBounce) placed.triggerDropBounce();
        } else {
            const resolvedObject = this.resolveDroppedMapObject({ name, type, variant });
            if (resolvedObject) {
                placed = this.parent.gameMap.addObject(resolvedObject.type, resolvedObject.variant, posX, posY);
            }
        }

        if (!placed) {
            this.parent?.ui?.showMessage?.(`${itemDef?.label || name} cannot be placed here.`, 'warning', 'Inventory');
            return false;
        }

        if (!this.removeItem(variant || name)) {
            placed.remove?.();
            return false;
        }
        return true;
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
        const definition = ItemRegistry.getItemSync(
            this.state.draggedItem?.dataset.variant || this.state.draggedItem?.dataset.name
        );
        const isValid = definition?.inventory?.primaryAction === 'place'
            ? definition?.use?.target === 'myte'
            : !!(definition?.use?.target === 'myte' || this.config.itemTypes[itemType]);
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

        const definition = ItemRegistry.getItemSync(
            this.state.draggedItem.dataset.variant || this.state.draggedItem.dataset.name
        );
        this.useItemOnMyte(this.state.draggedItem, myte, definition, {
            clientX: e.clientX,
            clientY: e.clientY
        });

        myteElement.classList.remove('is-drag-over', 'is-drop-rejected');
        this.state.myteTarget = null;
        this.endDragState();
    }

    applyItemEffects(myte, itemType, itemConfig) {
        this.queueItemExpressions(myte, itemConfig, { interruptFirst: true });
        this.applyConfiguredItemEffects(myte, itemConfig, { source: `inventory_${String(itemType || '').toLowerCase()}` });
        this.emitItemParticles(myte, itemType);
    }

    queueItemExpressions(myte, itemConfig, { interruptFirst = false } = {}) {
        const expressions = Array.isArray(itemConfig?.expressions) ? itemConfig.expressions.filter(Boolean) : [];
        if (expressions.length === 0) return;
        const duration = Math.max(120, (itemConfig.consumeTime || 1000) / expressions.length);
        expressions.forEach((expression, i) => {
            if (interruptFirst && i === 0) {
                myte.queue.interrupt('expression', { actionType: expression, duration });
            } else {
                myte.queue.addExpression(expression, duration);
            }
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
        (Array.isArray(itemConfig?.buffs) ? itemConfig.buffs : []).forEach(buff => {
            if (!buff?.id) return;
            myte.buffs?.applyBuff?.(buff.id, {
                durationMs: buff.durationMs,
                source
            });
        });
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

        this.queueItemExpressions(myte, {
            ...itemConfig,
            expressions: ['eat'],
            consumeTime
        }, { interruptFirst: true });

        this.animateItemToMyteMouth(myte, itemData, { clientX, clientY, duration: animationDuration });

        const burstCount = Math.max(2, Math.round(consumeTime / 260));
        for (let index = 0; index < burstCount; index++) {
            const delay = animationDuration + Math.round(((consumeTime - animationDuration) * index) / Math.max(1, burstCount));
            window.setTimeout(() => {
                if (!myte?.isActive) return;
                this.emitItemParticles(myte, 'FOOD', {
                    anchorId: 'mouth.item',
                    count: 4,
                    spread: 10
                });
            }, delay);
        }

        window.setTimeout(() => {
            if (!myte?.isActive) return;
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
            !myte.isDragging &&
            !myte.queue?.hasUserInitiatedAction?.() &&
            (myte.ai?.objectSearchRadius == null || myte.getDistanceTo?.(droppedItem) <= myte.ai.objectSearchRadius)
        );

        const activeMyte = this.parent?.activeMyte;
        if (nearbyMytes.includes(activeMyte) && activeMyte.ai?.reactToOfferedFood?.(droppedItem)) {
            return;
        }

        droppedItem.offeredToMytes = false;
        droppedItem.allowAutoCollect = false;
        nearbyMytes.forEach(myte => myte.ai?.resetThinking?.());
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
        this.inventoryElement?.removeEventListener('dragover', this.boundHandlers.inventoryDragOver);
        this.inventoryElement?.removeEventListener('dragleave', this.boundHandlers.inventoryDragLeave);
        this.inventoryElement?.removeEventListener('drop', this.boundHandlers.inventoryDrop);
        document.removeEventListener('pointermove', this.boundHandlers.placementPointerMove);
        document.removeEventListener('pointerdown', this.boundHandlers.placementPointerDown, true);
        document.removeEventListener('keydown', this.boundHandlers.placementKeyDown);

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

        this.inventoryElement?.removeEventListener('wheel', this.boundHandlers.inventoryWheel);
        this.inventoryElement?.removeEventListener('scroll', this.boundHandlers.inventoryScroll);
        this._overflowObserver?.disconnect();
        this._overflowObserver = null;
        this.notice?.remove();
        this.notice = null;

        this.mutationObserver?.disconnect();
        this.mutationObserver = null;
        clearTimeout(this._indicatorHideTimer);
        this.cancelPlacement();

        this.dropIndicator?.remove();
        this.tooltipSystem.hide();
        this.items = [];
        this.state = {};
    }
}
