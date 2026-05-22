class TreasureChestMapObject extends ClassStateAnimatedMapObject {
    constructor(parent, type, variant, posX, posY, config = {}, options = {}) {
        super(parent, type, variant, posX, posY, config, options);
        this.items = [];
        this.droppedItems = [];
        this.canClose = this.getConfig('canClose', false);

        // Add initial items if provided
        this.addItems(options.items || []);
    }

    getStateClassNames() {
        return ['closed', 'opening', 'opened', 'closing'];
    }

    addItems(items) {
        this.items = this.normalizeItems(items);
    }

    humanizeSidebarToken(value) {
        return String(value || '')
            .trim()
            .split(/[_\s-]+/)
            .filter(Boolean)
            .map(part => part.charAt(0).toUpperCase() + part.slice(1))
            .join(' ');
    }

    formatSidebarQuantity(quantity) {
        if (Array.isArray(quantity) && quantity.length >= 2) {
            return `${quantity[0]}-${quantity[1]}`;
        }

        const numericQuantity = Number(quantity);
        if (Number.isFinite(numericQuantity)) {
            return String(numericQuantity);
        }

        return null;
    }

    getChestStateLabel() {
        return this.humanizeSidebarToken(this.state || 'closed');
    }

    hasLoot() {
        return this.normalizeItems(this.items).length > 0;
    }

    getContainedLootSummary(maxEntries = 3) {
        const items = this.normalizeItems(this.items);
        if (!items.length) {
            return 'Empty';
        }

        const summary = items.slice(0, maxEntries).map(item => {
            const itemDefinition = ItemRegistry.getItemSync(item.variant);
            const label = itemDefinition?.name ||
                this.humanizeSidebarToken(item.variant || item.type || 'Loot');
            const quantity = this.formatSidebarQuantity(item.quantity);
            const probability = Number(item.probability);
            const parts = [label];

            if (quantity && quantity !== '1') {
                parts.push(`x${quantity}`);
            }

            if (Number.isFinite(probability) && probability > 0 && probability < 1) {
                parts.push(`(${Math.round(probability * 100)}%)`);
            }

            return parts.join(' ');
        });

        if (items.length > maxEntries) {
            summary.push(`+${items.length - maxEntries} more`);
        }

        return summary.join(', ');
    }

    applyRuntimeProperties(properties = {}) {
        if (Object.prototype.hasOwnProperty.call(properties, 'items')) {
            this.items = this.normalizeItems(properties.items);
        }

        if (Object.prototype.hasOwnProperty.call(properties, 'canClose')) {
            this.canClose = !!properties.canClose;
        }
    }

    normalizeItems(items) {
        if (items == null) return [];

        if (Array.isArray(items)) {
            return items
                .flatMap(item => this.normalizeItems(item))
                .filter(Boolean);
        }

        if (typeof items === 'string') {
            const trimmed = items.trim();
            if (!trimmed) return [];

            if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
                try {
                    return this.normalizeItems(JSON.parse(trimmed));
                } catch (error) {
                    return this.parseItemDefinitionString(trimmed);
                }
            }

            return this.parseItemDefinitionString(trimmed);
        }

        if (typeof items === 'object') {
            if ('type' in items) {
                const normalizedItem = this.normalizeItemDefinition(items);
                return normalizedItem ? [normalizedItem] : [];
            }

            return Object.values(items)
                .flatMap(item => this.normalizeItems(item))
                .filter(Boolean);
        }

        return [];
    }

    parseItemDefinitionString(str) {
        const cleanString = str.trim().replace(/\n/g, '');
        if (!cleanString) return [];

        const itemStrings = cleanString.includes('{')
            ? cleanString.split(/,(?=\s*{)/)
            : [cleanString];

        return itemStrings
            .map(itemStr => {
                const parts = itemStr
                    .replace(/^\[|\]$/g, '')
                    .replace(/[{}]/g, '')
                    .split(',')
                    .map(part => this._sanitizeItemToken(part))
                    .filter(part => part.length > 0);

                if (!parts.length) return null;

                return this.normalizeItemDefinition({
                    type: parts[0],
                    variant: parts[1] ?? 'default',
                    quantity: parts.length > 2 ? parts[2] : undefined,
                    probability: parts.length > 3 ? parts[3] : undefined
                });
            })
            .filter(Boolean);
    }

    normalizeItemDefinition(item) {
        if (!item || typeof item !== 'object' || !item.type) return null;

        const parseRangeValue = (value) => {
            if (Array.isArray(value)) {
                return value.map(Number);
            }

            if (typeof value === 'string' && /^\d+\s*-\s*\d+$/.test(value)) {
                const [min, max] = value.split('-').map(part => Number(part.trim()));
                return [min, max];
            }

            const numericValue = Number(value);
            return Number.isFinite(numericValue) ? numericValue : value;
        };

        const normalizedType = this._sanitizeItemToken(item.type).toUpperCase();
        let variant = this._sanitizeItemToken(item.variant ?? 'default');
        let quantity = parseRangeValue(this._sanitizeItemToken(item.quantity ?? 1));
        const probability = Number(this._sanitizeItemToken(item.probability ?? 1));
        const parsedVariant = parseRangeValue(variant);

        if (!normalizedType) {
            console.warn('[TreasureChestMapObject] Ignoring item with empty type:', item);
            return null;
        }

        // Chest shorthand like {COIN, 100} or {HEALTH, 10} — second slot is the amount, not a variant.
        if ((normalizedType === 'COIN' || normalizedType === 'HEALTH') &&
            (typeof parsedVariant === 'number' || Array.isArray(parsedVariant)) &&
            (item.quantity === undefined || item.quantity === null)) {
            quantity = parsedVariant;
            variant = normalizedType === 'COIN' ? 'coin' : 'health_orb';
        }

        if (typeof variant === 'string') {
            variant = ItemRegistry.resolveIdSync(variant) || variant;
        }

        const resolvedItemDefinition = typeof variant === 'string'
            ? ItemRegistry.getItemSync(variant)
            : null;
        const supportedSpecialTypes = new Set(['COIN', 'HEALTH']);
        const supportedInventoryTypes = new Set(['ITEM', 'FOOD', 'TOY', 'CROP', 'MEDICINE']);
        const normalizedInventoryType = resolvedItemDefinition?.type
            ? String(resolvedItemDefinition.type).toUpperCase()
            : null;

        if (supportedInventoryTypes.has(normalizedType) && !resolvedItemDefinition) {
            console.warn('[TreasureChestMapObject] Ignoring chest item with unknown inventory variant:', item);
            return null;
        }

        if (!supportedSpecialTypes.has(normalizedType) &&
            !supportedInventoryTypes.has(normalizedType) &&
            !MapObjectFactory.hasType(normalizedType)) {
            console.warn('[TreasureChestMapObject] Ignoring chest item with unsupported type:', item);
            return null;
        }

        if (supportedInventoryTypes.has(normalizedType) && normalizedInventoryType) {
            variant = resolvedItemDefinition.id;
        }

        if (!Number.isFinite(probability) || probability <= 0) {
            console.warn('[TreasureChestMapObject] Ignoring chest item with invalid probability:', item);
            return null;
        }

        return {
            type: supportedInventoryTypes.has(normalizedType) && normalizedInventoryType
                ? normalizedInventoryType
                : normalizedType,
            variant,
            quantity,
            probability
        };
    }

    getSidebarStatusRows() {
        return [
            { label: 'State', value: this.getChestStateLabel() },
            ...super.getSidebarStatusRows()
        ];
    }

    getSidebarDetailRows() {
        return [
            { label: 'Contents', value: this.hasLoot() ? 'Has Loot' : 'Empty' },
            ...super.getSidebarDetailRows()
        ];
    }

    _sanitizeItemToken(value) {
        if (value == null) return value;
        if (Array.isArray(value)) {
            return value.map(entry => this._sanitizeItemToken(entry));
        }
        if (typeof value !== 'string') {
            return value;
        }

        const trimmed = value.trim();
        return trimmed.replace(/^['"]+|['"]+$/g, '');
    }

    open(parent) {
        if (this.state !== 'closed') return false;
        this.playConfiguredSound('open');

        return this.playStateTransition('opening', 'opened', {
            afterChange: () => {
                this.spawnItems(parent);
            }
        });
    }

    close(parent) {
        if (this.state !== 'opened' || !this.canClose) return false;
        this.playConfiguredSound('close');
        return this.playStateTransition('closing', 'closed');
    }

    isWithinChestInteractionRange(myte = this.activeMyte) {
        if (!myte) return false;
        return this.getColliderGapTo(myte) <= this.getConfig('interactionTouchThreshold', 12);
    }

    runChestInteraction(action, myte = this.activeMyte, options = {}) {
        if (!this.active || !myte || typeof action !== 'function') return false;

        this.selectInUi?.();

        if (this.isWithinChestInteractionRange(myte)) {
            action(myte);
            return true;
        }

        return this.enqueueApproach(myte, () => {
            if (this.isWithinChestInteractionRange(myte)) {
                action(myte);
            }
        }, options);
    }

    press(parent, actor = this.activeMyte) {
        const myte = actor;
        if (!this.active || !myte) return false;

        if (this.state === 'closed') {
            return this.runChestInteraction(() => {
                this.open(parent);
            }, myte, {
                queueVerb: 'Open Chest',
                userInitiated: true
            });
        }

        if (this.state === 'opened' && this.canClose) {
            return this.runChestInteraction(() => {
                this.close(parent);
            }, myte, {
                queueVerb: 'Close Chest',
                userInitiated: true
            });
        }

        return false;
    }
    
    spawnItems(parent) {
        const itemsToSpawn = this.normalizeItems(this.items);
        if (!itemsToSpawn.length) return;

        const spawnPoint = this.getSpawnPoint();
        const spreadAngle = Math.PI / 6;
        const baseVelocity = 5;
        const foregroundLayer = this.gameMap?.layers?.objects || parent?.canvas?.querySelector('.layer.foreground');

        if (!foregroundLayer) return;

        itemsToSpawn.forEach((item, index) => {
            const angle = this.calculateSpawnAngle(index, itemsToSpawn.length, spreadAngle);
            const droppedItem = this.createDroppedItem(item, spawnPoint, angle, baseVelocity);

            if (!droppedItem?.element) return;

            if (droppedItem.shadowElement) {
                foregroundLayer.appendChild(droppedItem.shadowElement);
            }
            foregroundLayer.appendChild(droppedItem.element);
            this.droppedItems.push(droppedItem);
            if (!this.gameMap?.droppedItems?.includes(droppedItem)) {
                this.gameMap?.droppedItems?.push(droppedItem);
            }
        });

        this.playConfiguredSound('drop');

        this.items = [];
    }
    
    getSpawnPoint() {
        return {
            x: this.posX + this.size.width / 2,
            y: this.posY + this.size.height / 2
        };
    }
    
    calculateSpawnAngle(index, totalItems, spreadAngle) {
        return totalItems === 1
            ? -Math.PI / 2  // Single item goes straight up
            : -Math.PI / 2 - spreadAngle / 2 + (spreadAngle * index / (totalItems - 1));
    }
    
    createDroppedItem(item, spawnPoint, angle, baseVelocity) {
        const resolvedQuantity = Array.isArray(item.quantity)
            ? Math.floor(Math.random() * (item.quantity[1] - item.quantity[0] + 1)) + item.quantity[0]
            : Math.max(1, Number(item.quantity) || 1);
        const droppedItem = new DroppedMapItem(
            this.gameMap,
            item.type,
            item.variant,
            spawnPoint.x,
            spawnPoint.y
        );

        droppedItem.velocityX = Math.cos(angle) * baseVelocity;
        droppedItem.velocityY = Math.sin(angle) * baseVelocity;
        droppedItem.velocityZ = baseVelocity;
        droppedItem.quantity = resolvedQuantity;

        const itemDefinition = ItemRegistry.getItemSync(item.variant);
        if (!itemDefinition) {
            console.warn(`[TreasureChestMapObject] Spawning dropped item with no registry entry: "${item.variant}"`);
        }
        droppedItem.inventoryVariant = itemDefinition?.id || ItemRegistry.resolveIdSync(item.variant) || item.variant;
        droppedItem.inventoryType = itemDefinition?.type
            ? String(itemDefinition.type).toUpperCase()
            : item.type;
        droppedItem.inventoryName = itemDefinition?.name || droppedItem.inventoryVariant;
        droppedItem.description = itemDefinition?.description || '';
        
        return droppedItem;
    }

    update(deltaTime) {
        super.update(deltaTime);
        this.updateDroppedItems();
    }
    
    updateDroppedItems() {
        this.droppedItems = this.droppedItems.filter(item => {
            return !!item && item.active && !item.collected;
        });
    }

    render(container, parent) {
        const element = super.render(container, parent);
        element.classList.add('treasure-chest', this.state);
        return element;
    }





    


    generateItem(itemDef, randomFunc = Math.random) {
        // Check probability
        if (randomFunc() > itemDef.probability) {
          return null; // Item doesn't spawn
        }
        
        // Calculate quantity
        let quantity = itemDef.quantity;
        if (Array.isArray(quantity)) {
          // If quantity is a range, pick a random number within that range
          const [min, max] = quantity;
          quantity = Math.floor(randomFunc() * (max - min + 1)) + min;
        }
        
        // Calculate value (for variants that are ranges)
        let variant = itemDef.variant;
        if (Array.isArray(variant)) {
          // If variant is a range, pick a random number within that range
          const [min, max] = variant;
          variant = Math.floor(randomFunc() * (max - min + 1)) + min;
        }
        
        return {
          type: itemDef.type,
          variant: variant,
          quantity: quantity
        };
      }
      
      openChest(chestDef, seed) {
        const items = [];
        
        // Create a seeded random function if seed is provided
        const randomFunc = seed !== undefined ? Utility.createRandomGenerator(seed) : Math.random;
        
        chestDef.forEach(itemDef => {
          const item = this.generateItem(itemDef, randomFunc);
          if (item) {
            items.push(item);
          }
        });
        
        return items;
      }

      getAiAffordances(context = {}, actor = null) {
        const affordances = super.getAiAffordances(context, actor).filter(affordance => {
          if ((affordance.actionId === 'inspect' || affordance.actionId === 'deep_inspect') &&
              (this.state !== 'closed' || this.items.length === 0)) {
            return false;
          }
          return true;
        });

        if (this.state === 'closed') {
          affordances.push({ actionId: 'open_chest', purpose: 'open' });
        } else if (this.state === 'opened' && this.canClose) {
          affordances.push({ actionId: 'close_chest', purpose: 'close' });
        }

        return affordances;
      }







}
