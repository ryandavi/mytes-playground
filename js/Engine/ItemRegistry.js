class ItemRegistry {
    static itemSheetUrl = 'images/items/items.png';
    static defaultSpriteSize = { width: 32, height: 32 };
    static items = new Map();
    static aliases = new Map();
    static preloaded = false;
    static preloadPromise = null;

    static normalizeId(value) {
        return String(value || '')
            .trim()
            .toLowerCase()
            .replace(/\s+/g, '_');
    }

    static async preload() {
        if (this.preloaded) return true;
        if (this.preloadPromise) return this.preloadPromise;

        this.preloadPromise = fetch('data/metadata/items.json')
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Failed to load item metadata: ${response.status} ${response.statusText}`);
                }
                return response.json();
            })
            .then(data => {
                this.loadFromData(data);
                this.preloaded = true;
                return true;
            })
            .catch(error => {
                console.error('[ItemRegistry] Failed to preload item metadata:', error);
                return false;
            });

        return this.preloadPromise;
    }

    static loadFromData(data = {}) {
        this.items.clear();
        this.aliases.clear();

        const spriteSheet = data.visual?.spriteSheet || {};
        if (spriteSheet.url) {
            this.itemSheetUrl = spriteSheet.url;
        }

        if (spriteSheet.frameSize) {
            this.defaultSpriteSize = {
                width: Number(spriteSheet.frameSize.width) || this.defaultSpriteSize.width,
                height: Number(spriteSheet.frameSize.height) || this.defaultSpriteSize.height
            };
        }

        (data.items || []).forEach(item => this.registerItem(item));
    }

    static registerItem(item = {}) {
        const id = this.normalizeId(item.id);
        if (!id) return;

        const itemSpriteSheet = item.visual?.spriteSheet || {};
        const itemSprite = item.visual?.sprite || null;
        let sprite = null;
        if (itemSprite) {
            const spriteFrameSize = itemSpriteSheet.frameSize || {};
            const w = Number(itemSprite.width) || Number(spriteFrameSize.width) || this.defaultSpriteSize.width;
            const h = Number(itemSprite.height) || Number(spriteFrameSize.height) || this.defaultSpriteSize.height;
            const x = ('col' in itemSprite)
                ? -(Number(itemSprite.col) * w)
                : (Number(itemSprite.x) || 0);
            const y = ('row' in itemSprite)
                ? -(Number(itemSprite.row) * h)
                : (Number(itemSprite.y) || 0);
            sprite = { x, y, width: w, height: h };
        }

        const normalized = {
            ...item,
            id,
            aliases: Array.isArray(item.aliases)
                ? item.aliases.map(alias => this.normalizeId(alias)).filter(Boolean)
                : [],
            displayName: item.displayName || id,
            name: item.displayName || id,
            type: String(item.type || 'item').toLowerCase(),
            description: item.description || '',
            droppable: item.capabilities?.droppable === true,
            visual: {
                ...(item.visual || {}),
                sprite: itemSprite,
                spriteSheet: {
                    ...itemSpriteSheet
                }
            },
            sprite,
            spriteSheetUrl: itemSpriteSheet.url || this.itemSheetUrl
        };

        this.items.set(id, normalized);
        this.aliases.set(id, id);

        normalized.aliases.forEach(alias => {
            this.aliases.set(alias, id);
        });
    }

    static resolveIdSync(rawId) {
        const normalized = this.normalizeId(rawId);
        if (!normalized) return null;
        return this.aliases.get(normalized) || normalized;
    }

    static getItemSync(rawId) {
        const id = this.resolveIdSync(rawId);
        return id ? (this.items.get(id) || null) : null;
    }

    static buildInventoryItem(rawItem = {}) {
        const requestedVariant = rawItem.variant || rawItem.id || rawItem.name;
        const definition = this.getItemSync(requestedVariant);
        const canonicalVariant = definition?.id || this.resolveIdSync(requestedVariant) || this.normalizeId(requestedVariant);

        // Registry type wins over saved type — it is the source of truth for what an item IS.
        const type = definition?.type || rawItem.type || 'item';

        return {
            name: definition?.name || rawItem.name || canonicalVariant,
            quantity: Number(rawItem.quantity) || 1,
            type: String(type),
            variant: canonicalVariant,
            description: definition?.description || rawItem.description || ''
        };
    }

    static applySpriteStyles(element, rawId) {
        if (!element) return false;

        const item = this.getItemSync(rawId);
        if (!item?.sprite) {
            return false;
        }

        element.style.setProperty('--item-sprite-width', `${item.sprite.width}px`);
        element.style.setProperty('--item-sprite-height', `${item.sprite.height}px`);
        element.style.setProperty('--item-sprite-x', `${item.sprite.x}px`);
        element.style.setProperty('--item-sprite-y', `${item.sprite.y}px`);
        element.style.backgroundImage = `url('${item.spriteSheetUrl || this.itemSheetUrl}')`;
        return true;
    }
}
