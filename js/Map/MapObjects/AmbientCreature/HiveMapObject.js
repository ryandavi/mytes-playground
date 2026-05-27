class HiveMapObject extends MapObject {
    constructor(parent, type, variant, posX, posY, config = {}, options = {}) {
        super(parent, type, variant, posX, posY, config);
        this.honeyStored = 0;
        this.honeyThreshold = this.getConfig('honeyThreshold', 5);
        this.maxBees = this.getConfig('maxBees', 3);
        this.registeredBees = new Set();
    }

    isFull() {
        return this.registeredBees.size >= this.maxBees;
    }

    registerBee(bee) {
        this.registeredBees.add(bee);
    }

    unregisterBee(bee) {
        this.registeredBees.delete(bee);
    }

    addPollen(payload) {
        if (!payload) return;
        this.honeyStored++;
        if (this.honeyStored >= this.honeyThreshold) {
            this.produceHoney();
            this.honeyStored = 0;
        }
    }

    produceHoney() {
        this.onHoneyProduced?.();
        this.gameMap?.emit?.('hive:honey', { hive: this });
    }

    render(container, parent) {
        const element = super.render(container, parent);
        element.classList.add('hive', 'interactive');
        return element;
    }

    getSelectionDebugInfo() {
        return [
            { label: 'Honey', value: `${this.honeyStored} / ${this.honeyThreshold}` },
            { label: 'Bees', value: `${this.registeredBees.size}` }
        ];
    }
}
