
class BaseMapObject {

    constructor(parent, type, variant, posX, posY) {
        this.type = type;
        this.variant = variant;
        this.posX = posX;
        this.posY = posY;
        this.posZ = 0;

        this.size = {
            width: 24,
            height: 24
        };
    }
}

class DroppedMapItem {
    static storageDragItem = null;

    constructor(parent, type, variant, posX, posY) {
        if (posY === undefined) {
            posY = posX;
            posX = variant;
            variant = type;
            type = parent;
            parent = null;
        }

        // Store base identity properties
        this.parent = parent;
        this.type = type;
        this.variant = ItemRegistry.resolveIdSync(variant) || variant;

        if (!ItemRegistry.getItemSync(this.variant)) {
            console.warn(`[DroppedMapItem] No item registry entry for variant: "${this.variant}". It will render without a sprite.`);
        }
        this.posX = posX;
        this.posY = posY;
        this.posZ = 0;

		// Core state
		this.active = true;
		this.element = null;
        this.spriteElement = null;
        this.shadowElement = null;

        // physics
        this.velocityX = 0;
        this.velocityY = 0;
        this.velocityZ = 6;
        this.gravity = 0.5;
        this.airDrag = 0.86;
        this.bounceCount = 0;
        this.maxBounces = 1;
        this.magnetDelayMs = 0;

        // grounding — shadow stays at the drop position; item bounces upward from there
        this.groundY = posY; // Shadow at the indicator center
        this.grounded = false;
        this.groundedAt = null;

        // SimClock: MyteAI ages items against SimClock.now() — using Date.now() here
        // made every item look "billions of ms fresh" and dominate AI scoring.
        this.droppedAt = SimClock.now();

        // hover
        this.hoverOffset = 0;
        this.hoverSpeed = 0.05;

        // collecting
        this.magnetSpeed = 0.2;
        this.collected = false;
        this.minimumCollectDistance = 192;
        this.quantity = 1;
        this.inventoryType = null;
        this.inventoryVariant = null;
        this.description = '';
        this.userDropSource = null;
        this.offeredToMytes = false;
        this.allowAutoCollect = true;

        this.size = {
            width: 24,
            height: 24
        };

        // Build element first (may update this.size from sprite definition),
        // then build shadow and append it as a child of the container.
        this.element = this.createItemElement();
        this.shadowElement = this.createShadowElement();
        this.element.appendChild(this.shadowElement);
        this._setupClickHandling();
    }

    _setupClickHandling() {
        if (!this.element) return;
        this.element.draggable = false;
        const threshold = SiteConfig.interaction.gestures.clickMoveThreshold;
        let pointerState = null;
        let dragGhost = null;

        const clearStorageDrag = () => {
            this.storageDragActive = false;
            if (DroppedMapItem.storageDragItem === this) DroppedMapItem.storageDragItem = null;
            this.element?.classList.remove('is-being-stored');
            this.parent?.parent?.inventory?.inventoryElement?.classList.remove('is-store-target');
            dragGhost?.remove();
            dragGhost = null;
        };

        const removePointerListeners = () => {
            window.removeEventListener('pointermove', handlePointerMove, true);
            window.removeEventListener('pointerup', handlePointerEnd, true);
            window.removeEventListener('pointercancel', handlePointerEnd, true);
        };

        const beginStorageDrag = () => {
            this.storageDragActive = true;
            DroppedMapItem.storageDragItem = this;
            this.element.classList.add('is-being-stored');
            dragGhost = this.spriteElement?.cloneNode(true) ?? null;
            if (dragGhost) {
                dragGhost.classList.add('dropped-item-storage-ghost');
                document.body.appendChild(dragGhost);
            }
        };

        const updateStorageDrag = (event) => {
            if (dragGhost) {
                dragGhost.style.left = `${event.clientX}px`;
                dragGhost.style.top = `${event.clientY}px`;
            }
            const inventory = this.parent?.parent?.inventory;
            inventory?.inventoryElement?.classList.toggle(
                'is-store-target',
                inventory.isPointInside(event.clientX, event.clientY)
            );
        };

        const handlePointerMove = (event) => {
            if (!pointerState || event.pointerId !== pointerState.pointerId) return;
            const distance = Math.hypot(
                event.clientX - pointerState.startX,
                event.clientY - pointerState.startY
            );
            if (!pointerState.dragging && distance >= threshold) {
                pointerState.dragging = true;
                beginStorageDrag();
            }
            if (!pointerState.dragging) return;
            event.preventDefault();
            event.stopPropagation();
            updateStorageDrag(event);
        };

        const handlePointerEnd = (event) => {
            if (!pointerState || event.pointerId !== pointerState.pointerId) return;
            const wasDragging = pointerState.dragging;
            const inventory = this.parent?.parent?.inventory;
            const shouldStore = wasDragging && inventory?.isPointInside(event.clientX, event.clientY);
            pointerState = null;
            removePointerListeners();
            clearStorageDrag();

            event.stopPropagation();
            if (wasDragging) {
                event.preventDefault();
                if (shouldStore) inventory.storeDroppedItem(this);
                return;
            }

            if (this.active && !this.collected) {
                this.parent?.parent?.ui?.setSelected?.(this);
            }
        };

        this.element.addEventListener('pointerdown', (event) => {
            if (event.button !== 0 || !this.active || this.collected) return;
            event.preventDefault();
            event.stopPropagation();
            pointerState = {
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                dragging: false
            };
            window.addEventListener('pointermove', handlePointerMove, true);
            window.addEventListener('pointerup', handlePointerEnd, true);
            window.addEventListener('pointercancel', handlePointerEnd, true);
        });
    }

    serializeState() {
        return {
            type: this.type,
            variant: this.variant,
            posX: this.posX,
            posY: this.posY,
            quantity: this.quantity,
            inventoryType: this.inventoryType,
            inventoryVariant: this.inventoryVariant,
            inventoryName: this.inventoryName,
            description: this.description,
            allowAutoCollect: this.allowAutoCollect,
            userDropSource: this.userDropSource,
            offeredToMytes: this.offeredToMytes
        };
    }

    restoreState(data = {}) {
        this.quantity = Math.max(1, Number(data.quantity) || 1);
        this.inventoryType = data.inventoryType ?? this.inventoryType;
        this.inventoryVariant = data.inventoryVariant ?? this.inventoryVariant;
        this.inventoryName = data.inventoryName ?? this.inventoryName;
        this.description = data.description ?? this.description;
        this.allowAutoCollect = data.allowAutoCollect !== false;
        this.userDropSource = data.userDropSource ?? this.userDropSource;
        this.offeredToMytes = data.offeredToMytes === true;
        this.posX = Number.isFinite(data.posX) ? data.posX : this.posX;
        this.posY = Number.isFinite(data.posY) ? data.posY : this.posY;
        this.groundY = this.posY;
        this._applyPosition(this.element);
    }


    createItemElement() {
        // Outer container — positioned at ground coordinates, never moves vertically
        const container = document.createElement('div');
        container.classList.add('dropped-item');
        container.style.width = `${this.size.width}px`;
        container.style.height = `${this.size.height}px`;

        // Sprite child — visually lifted by posZ via transform
        const sprite = document.createElement('div');
        sprite.classList.add('dropped-item-sprite', this.type.toLowerCase(), this.variant);

        if (ItemRegistry.applySpriteStyles(sprite, this.variant)) {
            const itemDefinition = ItemRegistry.getItemSync(this.variant);
            const spriteWidth = itemDefinition?.sprite?.width || 32;
            const spriteHeight = itemDefinition?.sprite?.height || 32;
            this.size = { width: spriteWidth, height: spriteHeight };
            container.style.width = `${this.size.width}px`;
            container.style.height = `${this.size.height}px`;
            sprite.style.backgroundRepeat = 'no-repeat';
            sprite.style.backgroundPosition = 'var(--item-sprite-x) var(--item-sprite-y)';
            sprite.style.imageRendering = 'pixelated';
        }

        sprite.style.width = `${this.size.width}px`;
        sprite.style.height = `${this.size.height}px`;

        container.appendChild(sprite);
        this.spriteElement = sprite;
        this._applyPosition(container);
        return container;
    }

    createShadowElement() {
        const shadow = document.createElement('div');
        shadow.className = 'dropped-item-shadow';
        this._applyShadowVisuals(shadow, 0);
        return shadow;
    }

    resolveDepthOffset() {
        return EntityMethods.resolveDepthOffsetValue(null, this.size.height / 2, null, this.size.height);
    }

    getSortY() {
        return EntityMethods.getSortYValue(this.posY, this.posY, this.resolveDepthOffset());
    }

    getDepthPriority() {
        return 25;
    }

    getRenderZIndex() {
        const sortY = this.getSortY();
        return this.parent?.getDepthZIndex
            ? this.parent.getDepthZIndex(sortY, this.getDepthPriority())
            : Math.round(sortY * 100) + this.getDepthPriority();
    }

    _applyPosition(element) {
        element.style.left = `${this.posX - this.size.width / 2}px`;
        element.style.top  = `${this.posY - this.size.height / 2}px`;
        element.style.zIndex = this.getRenderZIndex();
        // dataset.sortY is a devtools inspection aid only
        if (document.body.classList.contains('debug')) {
            EntityMethods.writeSortY(element, this.getSortY());
        }
    }

    _applyVerticalVisuals(lift = 0) {
        if (!this.spriteElement) return;
        this.spriteElement.style.transform = `translateY(${-lift}px)`;
    }

    _applyShadowVisuals(shadow, heightAboveGround) {
        const scale = Math.max(0.35, 1 - heightAboveGround / 80);
        shadow.style.transform = `scaleX(${scale})`;
        shadow.style.opacity   = `${Math.max(0.1, scale * 0.55)}`;
    }

    getRegionRect(regionId = 'collider') {
        const x = this.posX - (this.size.width / 2);
        const y = this.posY - (this.size.height / 2);
        return {
            x,
            y,
            left: x,
            top: y,
            right: x + this.size.width,
            bottom: y + this.size.height,
            width: this.size.width,
            height: this.size.height,
            type: 'box'
        };
    }

    getSelectionRect() {
        return this.getRegionRect('select');
    }

    getPickupRect() {
        return this.getRegionRect('pickup');
    }

    getCenterPoint() {
        const rect = this.getRegionRect('collider');
        return {
            x: rect.left + (rect.width / 2),
            y: rect.top + (rect.height / 2)
        };
    }

    getDisplayName() {
        return this.getInventoryEntryData(this.quantity).name;
    }

    getItemDefinition() {
        return ItemRegistry.getItemSync(this.inventoryVariant || this.inventoryName || this.variant);
    }

    isEdible() {
        const itemDefinition = this.getItemDefinition();
        return String(itemDefinition?.type || this.inventoryType || this.type || '').toUpperCase() === 'FOOD';
    }

    isUserOfferedFood() {
        return this.offeredToMytes === true && this.userDropSource === 'inventory' && this.isEdible();
    }

    isConsumableBy(actor = null) {
        return this.active !== false &&
            !this.collected &&
            this.isUserOfferedFood() &&
            !actor?.queue?.isCarrying?.();
    }

    getAiAffordances(_context = {}, actor = null) {
        if (!this.isConsumableBy(actor)) {
            return [];
        }

        return [{ actionId: 'eat_element', purpose: 'consume' }];
    }

    getConsumableEffects() {
        const definition = this.getItemDefinition();
        return definition?.use?.effects ?? definition?.effects ?? SiteConfig.food.effects;
    }

    getConsumableSaturationMs() {
        const definition = this.getItemDefinition();
        return definition?.use?.saturationMs ?? definition?.saturationMs ?? SiteConfig.food.saturationMs;
    }

    updatePosition() {
        if (!this.element) return;

        const hoverLift = this.grounded ? Math.sin(this.hoverOffset) * 5 : 0;
        const totalLift = this.posZ + hoverLift;

        this._applyPosition(this.element);
        this._applyVerticalVisuals(totalLift);

        if (this.shadowElement) {
            this._applyShadowVisuals(this.shadowElement, Math.max(0, totalLift));
        }
    }

    update(mytes = null, deltaTime = 16.667) {
        if (this.collected || this.storageDragActive) return;

        // Accept a single myte or a list of candidate collectors.
        const candidateMytes = Array.isArray(mytes) ? mytes : (mytes ? [mytes] : []);

        const dt = deltaTime / 16.667;

        if (!this.grounded) {
            this.posX += this.velocityX * dt;
            this.posY += this.velocityY * dt;
            this.posZ += this.velocityZ * dt;
            this.velocityX *= Math.pow(this.airDrag, dt);
            this.velocityY *= Math.pow(this.airDrag, dt);
            this.velocityZ -= this.gravity * dt;

            if (this.posZ <= 0) {
                this.posZ = 0;
                if (this.bounceCount < this.maxBounces) {
                    this.velocityZ = Math.max(0, -this.velocityZ * 0.38);
                    this.velocityX *= 0.82;
                    this.velocityY *= 0.82;
                    this.bounceCount++;
                } else {
                    this.grounded = true;
                    this.groundedAt = SimClock.now();
                    this.velocityX = 0;
                    this.velocityY = 0;
                    this.velocityZ = 0;
                }
            }
        } else if (candidateMytes.length) {
            const canMagnetize = !this.groundedAt || (SimClock.now() - this.groundedAt) >= this.magnetDelayMs;

            if (this.allowAutoCollect !== false && canMagnetize) {
                const center = {
                    x: this.posX + (this.size.width / 2),
                    y: this.posY + (this.size.height / 2)
                };

                // Magnetize toward whichever eligible deployed myte is closest.
                let nearest = null;
                let nearestDistance = Infinity;
                let nearestDelta = null;
                for (const candidate of candidateMytes) {
                    if (!candidate || !candidate.isActive || !candidate.isIndependent?.()) continue;

                    const dx = (candidate.posX + candidate.size.width / 2) - center.x;
                    const dy = (candidate.posY + candidate.size.height / 2) - center.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    if (distance < nearestDistance) {
                        nearestDistance = distance;
                        nearest = candidate;
                        nearestDelta = { dx, dy };
                    }
                }

                if (nearest && nearestDistance < this.minimumCollectDistance) {
                    const magnetStrength = 1 - (nearestDistance / this.minimumCollectDistance);
                    this.posX += nearestDelta.dx * this.magnetSpeed * magnetStrength * dt;
                    this.posY += nearestDelta.dy * this.magnetSpeed * magnetStrength * dt;

                    if (nearestDistance < 20) {
                        this.collect(nearest);
                    }
                }
            }
        }

        if (this.grounded) {
            this.hoverOffset += this.hoverSpeed * dt;
        }

        this.updatePosition();
    }

    collect(myte) {
        if (this.collected) return;
        this.collected = true;
        const owner = this.parent || myte.parent;
        owner?.soundManager?.play?.('ui_pickup_item');

        const quantity = Math.max(1, Number(this.quantity) || 1);
        const inventoryEntry = this.getInventoryEntryData(quantity);

        // Add to inventory or apply effect based on item type
        switch (String(this.type || '').toUpperCase()) {
            case 'COIN':
                owner?.core?.user?.addCurrency?.('coins', quantity);
                break;
            case 'HEALTH':
                myte.stats?.updateHealth(quantity);
                break;
            default:
                owner?.inventory?.addItem?.(
                    inventoryEntry.name,
                    inventoryEntry.quantity,
                    inventoryEntry.type,
                    inventoryEntry.description,
                    inventoryEntry.variant
                );
        }

        if (this.spriteElement) this.spriteElement.classList.add('collected');
        if (this.shadowElement) this.shadowElement.style.display = 'none';

        setTimeout(() => this.remove(), 500);
    }

    getInventoryEntryData(quantity = 1) {
        const rawVariant = this.inventoryVariant || this.inventoryName || this.variant;
        const definition = ItemRegistry.getItemSync(rawVariant);
        const canonicalVariant = definition?.id ||
            ItemRegistry.resolveIdSync(rawVariant) ||
            ItemRegistry.normalizeId(rawVariant);
        const requestedType = String(this.inventoryType || this.type || definition?.type || 'item').toUpperCase();
        const resolvedType = definition?.type && requestedType === 'ITEM'
            ? String(definition.type).toUpperCase()
            : requestedType;

        return {
            name: definition?.name || this.inventoryName || canonicalVariant,
            variant: canonicalVariant,
            type: resolvedType,
            quantity,
            description: definition?.description || this.description || ''
        };
    }

    remove() {
        this.active = false;
        // shadowElement is a child of element — removing element removes it too
        this.element?.parentNode?.removeChild(this.element);
    }

}
