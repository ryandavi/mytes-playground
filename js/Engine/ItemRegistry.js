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

        let sprite = null;
        if (item.sprite) {
            const w = Number(item.sprite.width) || this.defaultSpriteSize.width;
            const h = Number(item.sprite.height) || this.defaultSpriteSize.height;
            // Accept grid coords { col, row } or raw pixel offsets { x, y }
            const x = ('col' in item.sprite)
                ? -(Number(item.sprite.col) * w)
                : (Number(item.sprite.x) || 0);
            const y = ('row' in item.sprite)
                ? -(Number(item.sprite.row) * h)
                : (Number(item.sprite.y) || 0);
            sprite = { x, y, width: w, height: h };
        }

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
        element.style.backgroundImage = `url('${this.itemSheetUrl}')`;
        return true;
    }
}
