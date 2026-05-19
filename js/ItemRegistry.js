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

        if (data.itemSheet?.url) {
            this.itemSheetUrl = data.itemSheet.url;
        }

        if (data.itemSheet?.spriteSize) {
            this.defaultSpriteSize = {
                width: Number(data.itemSheet.spriteSize.width) || this.defaultSpriteSize.width,
                height: Number(data.itemSheet.spriteSize.height) || this.defaultSpriteSize.height
            };
        }

        (data.items || []).forEach(item => this.registerItem(item));
    }

    static registerItem(item = {}) {
        const id = this.normalizeId(item.id);
        if (!id) return;

        const sprite = item.sprite
            ? {
                x: Number(item.sprite.x) || 0,
                y: Number(item.sprite.y) || 0,
                width: Number(item.sprite.width) || this.defaultSpriteSize.width,
                height: Number(item.sprite.height) || this.defaultSpriteSize.height
            }
            : null;

        const normalized = {
            ...item,
            id,
            aliases: Array.isArray(item.aliases)
                ? item.aliases.map(alias => this.normalizeId(alias)).filter(Boolean)
                : [],
            name: item.name || id,
            type: String(item.type || 'item').toLowerCase(),
            description: item.description || '',
            sprite
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

        return {
            name: rawItem.name || definition?.name || canonicalVariant,
            quantity: Number(rawItem.quantity) || 1,
            type: String(rawItem.type || definition?.type || 'item'),
            variant: canonicalVariant,
            description: rawItem.description || definition?.description || ''
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
        element.style.backgroundImage = `url('${this.itemSheetUrl}')`;
        return true;
    }
}
