class ShopPanel extends WorldModal {
    constructor(parent) {
        super(parent, {
            id: 'world-shop-panel',
            title: 'Shop',
            icon: '🛒',
            closeOnBackdrop: true,
            draggable: true
        });
        this.shop = null;
        this.shopkeeper = null;
        this.itemRows = new Map();
        this.lastDialogueChoices = new Map();
    }

    openFor(shopkeeper, shopId) {
        const shop = ShopRegistry.getShop(shopId);
        if (!shop) {
            console.warn(`[ShopPanel] Unknown shop "${shopId}".`);
            return;
        }

        this.shopkeeper = shopkeeper || null;
        this.shop = shop;
        this.setTitle(shop.name);
        this.renderShop();
        this.setDialogue('welcome');
        super.open();
    }

    renderShop() {
        this.itemRows.clear();
        const content = document.createElement('div');
        content.className = 'shop-panel';

        const shopkeeper = document.createElement('div');
        shopkeeper.className = 'shop-panel__shopkeeper';
        const identity = document.createElement('div');
        identity.className = 'shop-panel__identity';
        const name = document.createElement('strong');
        name.textContent = this.shop.shopkeeper.name || 'Shopkeeper';
        const title = document.createElement('span');
        title.textContent = this.shop.shopkeeper.title || '';
        identity.append(name, title);
        this.dialogueElement = document.createElement('p');
        this.dialogueElement.className = 'shop-panel__dialogue';
        this.dialogueElement.setAttribute('aria-live', 'polite');
        shopkeeper.append(identity, this.dialogueElement);

        const itemList = document.createElement('div');
        itemList.className = 'shop-panel__items';
        if (this.shop.items.length === 0) {
            const emptyState = document.createElement('div');
            emptyState.className = 'window-empty-state';
            emptyState.textContent = 'Nothing is for sale right now. Check back later.';
            itemList.appendChild(emptyState);
        } else {
            this.shop.items.forEach(entry => itemList.appendChild(this.buildItemRow(entry)));
        }

        content.append(shopkeeper, itemList);
        this.setContent(content);
    }

    buildItemRow(entry) {
        const item = ItemRegistry.getItemSync(entry.itemId);
        const row = document.createElement('article');
        row.className = 'shop-item';
        row.dataset.itemId = item.id;

        const image = document.createElement('span');
        image.className = `shop-item__image item ${item.type} ${item.id}`;
        image.setAttribute('role', 'img');
        image.setAttribute('aria-label', item.name);
        ItemRegistry.applySpriteStyles(image, item.id);

        const details = document.createElement('div');
        details.className = 'shop-item__details';
        const heading = document.createElement('div');
        heading.className = 'shop-item__heading';
        const name = document.createElement('strong');
        name.className = 'shop-item__name';
        name.textContent = item.name;
        const stock = document.createElement('span');
        stock.className = 'shop-item__stock';
        heading.append(name, stock);
        const description = document.createElement('span');
        description.className = 'shop-item__description';
        description.textContent = item.description;
        details.append(heading, description);

        const purchase = document.createElement('div');
        purchase.className = 'shop-item__purchase';
        const button = document.createElement('button');
        button.type = 'button';
        button.addEventListener('click', () => this.purchase(entry.itemId));
        purchase.appendChild(button);
        row.append(image, details, purchase);

        this.itemRows.set(item.id, { stock, button, entry });
        this.syncStock(entry.itemId);
        return row;
    }

    purchase(itemId) {
        if (!this.shop) return;
        const container = this.parent.parent;
        const result = ShopRegistry.purchase(
            this.shop.id,
            itemId,
            container.core?.user,
            container.inventory
        );
        this.syncStock(itemId);
        this.setDialogue(result.reason, result);
    }

    setDialogue(reason, result = {}) {
        if (!this.dialogueElement || !this.shop) return;
        const item = result.item || ItemRegistry.getItemSync(result.entry?.itemId);
        const previousIndex = this.lastDialogueChoices.get(reason) ?? -1;
        const choice = ShopRegistry.chooseDialogue(
            this.shop.dialogue[reason] || this.shop.dialogue.welcome,
            previousIndex
        );
        this.lastDialogueChoices.set(reason, choice.index);
        this.dialogueElement.textContent = ShopRegistry.formatDialogue(
            choice.text,
            {
                item: item?.name || 'that item',
                price: result.entry?.price ?? 0,
                stock: result.stock ?? 0
            }
        );
    }

    syncStock(itemId) {
        const controls = this.itemRows.get(ItemRegistry.resolveIdSync(itemId));
        if (!controls || !this.shop) return;
        const stock = ShopRegistry.getStock(this.shop.id, itemId);
        const stockText = stock > 0 ? `× ${stock}` : 'Sold out';
        if (controls.stock.textContent !== stockText) controls.stock.textContent = stockText;
        controls.button.disabled = stock <= 0;
        controls.button.textContent = stock > 0
            ? `Buy 1× for ${Utility.formatCurrency(this.shop.currency, controls.entry.price)}`
            : 'Sold out';
    }

    close() {
        super.close();
        this.shopkeeper = null;
    }

    dispose() {
        this.itemRows.clear();
        this.lastDialogueChoices.clear();
        this.shop = null;
        this.shopkeeper = null;
        super.dispose();
    }
}
