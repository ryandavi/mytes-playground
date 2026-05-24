
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

        this.droppedAt = Date.now();

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

        this.size = {
            width: 24,
            height: 24
        };

        this.shadowElement = this.createShadowElement();
        this.element = this.createItemElement();
        this._setupClickHandling();
    }

    _setupClickHandling() {
        if (!this.element) return;
        let pressStartTime = 0;
        this.element.addEventListener('pointerdown', () => { pressStartTime = Date.now(); });
        this.element.addEventListener('pointerup', (e) => {
            if (e.button !== 0) return;
            if (Date.now() - pressStartTime > 400) return; // ignore long press
            const container = this.parent?.parent;
            container?.ui?.setSelected?.(this);
        });
    }


    createItemElement() {
        const element = document.createElement('div');
        element.classList.add('dropped-item', this.type.toLowerCase(), this.variant);

        if (ItemRegistry.applySpriteStyles(element, this.variant)) {
            const itemDefinition = ItemRegistry.getItemSync(this.variant);
            const spriteWidth = itemDefinition?.sprite?.width || 32;
            const spriteHeight = itemDefinition?.sprite?.height || 32;
            this.size = { width: spriteWidth, height: spriteHeight };
            element.style.backgroundRepeat = 'no-repeat';
            element.style.backgroundPosition = 'var(--item-sprite-x) var(--item-sprite-y)';
            element.style.imageRendering = 'pixelated';
        }

        element.style.width = `${this.size.width}px`;
        element.style.height = `${this.size.height}px`;

        this._applyPosition(element, this.posY);
        return element;
    }

    createShadowElement() {
        const shadow = document.createElement('div');
        shadow.className = 'dropped-item-shadow';
        this._applyShadowPosition(shadow, 0);
        return shadow;
    }

    _applyPosition(element, displayY) {
        element.style.left = `${this.posX - this.size.width / 2}px`;
        element.style.top  = `${displayY - this.size.height / 2}px`;
        const sortY = this.posY;
        const zIndex = this.parent?.getDepthZIndex
            ? this.parent.getDepthZIndex(sortY, 25)
            : Math.round(sortY * 100) + 25;
        element.style.zIndex = zIndex;
        element.dataset.sortY = `${Math.round(sortY * 100) / 100}`;
    }

    _applyShadowPosition(shadow, heightAboveGround) {
        const scale = Math.max(0.35, 1 - heightAboveGround / 80);
        shadow.style.left   = `${this.posX - 12}px`;
        shadow.style.top    = `${this.posY - 2}px`;
        shadow.style.transform = `scaleX(${scale})`;
        shadow.style.opacity   = `${Math.max(0.1, scale * 0.55)}`;
    }

    updatePosition() {
        if (!this.element) return;

        let displayY = this.posY;
        if (this.grounded) {
            displayY -= Math.sin(this.hoverOffset) * 5;
        }
        displayY -= this.posZ;

        this._applyPosition(this.element, displayY);

        if (this.shadowElement) {
            this._applyShadowPosition(this.shadowElement, Math.max(0, this.posZ));
        }
    }

    update(myte = null, deltaTime = 16.667) {
        if (this.collected) return;

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
                    this.groundedAt = Date.now();
                    this.velocityX = 0;
                    this.velocityY = 0;
                    this.velocityZ = 0;
                }
            }
        } else if (myte) {
            const activeMyte = this.parent?.activeMyte || myte.parent?.activeMyte;
            if (activeMyte === myte) {
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
                const canMagnetize = !this.groundedAt || (Date.now() - this.groundedAt) >= this.magnetDelayMs;

                if (canMagnetize && myte.isIndependent() && distance < this.minimumCollectDistance) {
                    const magnetStrength = 1 - (distance / this.minimumCollectDistance);
                    this.posX += dx * this.magnetSpeed * magnetStrength * dt;
                    this.posY += dy * this.magnetSpeed * magnetStrength * dt;

                    if (distance < 20) {
                        this.collect(myte);
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

        this.element.classList.add('collected');
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
        this.element?.parentNode?.removeChild(this.element);
        this.shadowElement?.parentNode?.removeChild(this.shadowElement);
    }

}
