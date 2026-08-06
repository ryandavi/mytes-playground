class ParticlePool {
    constructor(factory, options = {}) {
        this.factory = factory;
        this.items = [];
        this.totalCreated = 0;
        this.maxSize = Number.isFinite(options.maxSize) ? options.maxSize : Infinity;

        const initialSize = Number.isFinite(options.initialSize) ? options.initialSize : 0;
        for (let i = 0; i < initialSize; i++) {
            const item = this.factory();
            this.items.push(item);
            this.totalCreated++;
        }
    }

    acquire() {
        if (this.items.length > 0) {
            return this.items.pop();
        }

        if (this.totalCreated >= this.maxSize) {
            return null;
        }

        this.totalCreated++;
        return this.factory();
    }

    release(item) {
        if (!item) return;
        this.items.push(item);
    }

    availableCount() {
        return this.items.length;
    }

    clear(disposer = null) {
        if (typeof disposer === 'function') {
            this.items.forEach(disposer);
        }
        this.items = [];
    }
}
