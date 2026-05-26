class TreeStumpMapObject extends MapObject {
    constructor(parent, type, variant, posX, posY, config = {}, options = {}) {
        super(parent, type, variant, posX, posY, config, options);

        this.removeItemDrops = this.getConfig('removeConfig.drops', []);
        this.minRemoveYield = this.getConfig('removeConfig.yield.min', 1);
        this.maxRemoveYield = this.getConfig('removeConfig.yield.max', 2);
    }

    canRemoveStump() {
        return true;
    }

    removeStump() {
        if (!this.canRemoveStump()) return false;

        this.playAnimation('remove', () => this._finishRemoval());
        this.playConfiguredSound?.('remove');

        return true;
    }

    _finishRemoval() {
        const drops = this._rollDrops(this.removeItemDrops, this.minRemoveYield, this.maxRemoveYield);
        drops.forEach(drop => this.spawnDroppedInventoryItem(drop, { parent: this.container ?? this.parent }));
        this.remove();
    }

    press(parent) {
        const myte = this.activeMyte;
        if (!myte || !this.canRemoveStump()) return false;

        return this.runInteractionWhenInRange(() => this.removeStump(), myte, {
            queueVerb: 'Remove Stump',
            userInitiated: true,
            postActionIdleDuration: 1200
        });
    }

    runDebugDirectInteraction(parent = this.container ?? this.parent) {
        if (!this.active) return false;
        this.selectInUi?.();
        return this.removeStump();
    }

    render(container, parent) {
        const element = super.render(container, parent);
        element.classList.add('tree-stump');
        return element;
    }
}
