const SHOP_PURCHASE_RESULTS = Object.freeze({
    PURCHASED: 'purchase',
    INSUFFICIENT_FUNDS: 'insufficientFunds',
    INVENTORY_FULL: 'inventoryFull',
    SOLD_OUT: 'soldOut'
});

class ShopRegistry {
    static shops = new Map();
    static stock = new Map();
    static preloaded = false;
    static preloadPromise = null;

    static normalizeId(value) {
        return Utility.normalizeId(value);
    }

    static async preload() {
        if (this.preloaded) return true;
        if (this.preloadPromise) return this.preloadPromise;

        this.preloadPromise = fetch(Utility.preventCache(AppConfig.content.shopsPath))
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Failed to load shop metadata: ${response.status} ${response.statusText}`);
                }
                return response.json();
            })
            .then(data => {
                this.loadFromData(data);
                this.preloaded = true;
                return true;
            })
            .catch(error => {
                console.error('[ShopRegistry] Failed to preload shop metadata:', error);
                return false;
            });

        return this.preloadPromise;
    }

    static loadFromData(data = {}) {
        this.shops.clear();
        this.stock.clear();

        (data.shops || []).forEach(rawShop => {
            const id = this.normalizeId(rawShop.id);
            if (!id) return;

            const items = (rawShop.items || []).map(rawEntry => {
                const itemId = ItemRegistry.resolveIdSync(rawEntry.itemId);
                const item = ItemRegistry.getItemSync(itemId);
                if (!item) {
                    throw new Error(`Shop "${id}" references unknown item "${rawEntry.itemId}".`);
                }

                return Object.freeze({
                    itemId,
                    price: Math.max(0, Math.round(Number(rawEntry.price) || 0)),
                    stock: Math.max(0, Math.round(Number(rawEntry.stock) || 0))
                });
            });

            const shop = Object.freeze({
                ...rawShop,
                id,
                currency: rawShop.currency || 'coins',
                shopkeeper: Object.freeze({ ...(rawShop.shopkeeper || {}) }),
                dialogue: Object.freeze({ ...(rawShop.dialogue || {}) }),
                items: Object.freeze(items)
            });

            this.shops.set(id, shop);
            this.stock.set(id, new Map(items.map(entry => [entry.itemId, entry.stock])));
        });
    }

    static getShop(rawId) {
        return this.shops.get(this.normalizeId(rawId)) || null;
    }

    static getStock(shopId, itemId) {
        return this.stock.get(this.normalizeId(shopId))?.get(ItemRegistry.resolveIdSync(itemId)) ?? 0;
    }

    static purchase(shopId, itemId, user, inventory) {
        const shop = this.getShop(shopId);
        const canonicalItemId = ItemRegistry.resolveIdSync(itemId);
        const entry = shop?.items.find(candidate => candidate.itemId === canonicalItemId);
        const item = ItemRegistry.getItemSync(canonicalItemId);
        const stock = shop ? this.getStock(shop.id, canonicalItemId) : 0;

        if (!shop || !entry || !item || stock <= 0) {
            return { ok: false, reason: SHOP_PURCHASE_RESULTS.SOLD_OUT, shop, entry, item, stock };
        }

        if ((Number(user?.currency?.[shop.currency]) || 0) < entry.price) {
            return { ok: false, reason: SHOP_PURCHASE_RESULTS.INSUFFICIENT_FUNDS, shop, entry, item, stock };
        }

        if (!inventory?.canAddItem?.(canonicalItemId, 1)) {
            return { ok: false, reason: SHOP_PURCHASE_RESULTS.INVENTORY_FULL, shop, entry, item, stock };
        }

        const added = inventory.addItem(item.name, 1, item.type, item.description, item.id);
        if (!added) {
            return { ok: false, reason: SHOP_PURCHASE_RESULTS.INVENTORY_FULL, shop, entry, item, stock };
        }

        user.spendCurrency(shop.currency, entry.price);
        const nextStock = stock - 1;
        this.stock.get(shop.id).set(canonicalItemId, nextStock);
        return {
            ok: true,
            reason: SHOP_PURCHASE_RESULTS.PURCHASED,
            shop,
            entry,
            item,
            stock: nextStock
        };
    }

    static formatDialogue(template, values = {}) {
        return String(template || '').replace(/\{(\w+)\}/g, (match, key) => (
            Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match
        ));
    }

    static chooseDialogue(dialogue, previousIndex = -1) {
        const choices = Array.isArray(dialogue) ? dialogue : [dialogue];
        const available = choices.filter(choice => typeof choice === 'string' && choice.trim());
        if (available.length === 0) return { text: '', index: -1 };
        if (available.length === 1) return { text: available[0], index: 0 };

        let index = Math.floor(Math.random() * available.length);
        if (index === previousIndex) index = (index + 1) % available.length;
        return { text: available[index], index };
    }
}
