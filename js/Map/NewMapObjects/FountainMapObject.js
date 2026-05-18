class FountainMapObject extends BinaryStateAnimatedMapObject {
    constructor(parent, type, variant, posX, posY, config = {}, options = {}) {
        super(parent, type, variant, posX, posY, config, options);
        
        // Fountain configuration
        this.moodBoostRadius = this.getConfig('moodBoostRadius', 150);
        this.moodBoostAmount = this.getConfig('moodBoostAmount', 0.1);
        this.boostCooldown = this.getConfig('boostCooldown', 1000);

        // Boost tracking: myte.id → last boost timestamp (performance.now())
        this.lastBoostTimes = new Map();
        // Only check nearby mytes every 500ms to avoid scanning every tick
        this._proximityAccumulator = 0;
        this._proximityInterval = 500;
    }

    press(parent) {
        if (!this.active) return false;
        return this.runInteractionWhenInRange(() => this.toggle(parent));
    }

    toggle(parent) {
        this.toggleState();
    }
    
    applyMoodBoost(myte) {
        const now = performance.now();
        const lastBoost = this.lastBoostTimes.get(myte.id) || 0;

        if (now - lastBoost >= this.boostCooldown) {
            myte.stats.updateMood(this.moodBoostAmount);
            this.lastBoostTimes.set(myte.id, now);

            // Occasional happiness expression
            if (Math.random() < 0.1) {
                myte.queue.addExpression('happy');
            }
        }
    }

    checkNearbyMytes() {
        if (!this.isEnabled() || !this.mytes.length) return;

        this.mytes.forEach(myte => {
            if (!myte.isActive) return;

            if (this.getDistanceTo(myte) <= this.moodBoostRadius) {
                this.applyMoodBoost(myte);
            }
        });
    }

    render(container, parent) {
        const element = super.render(container, parent);
        element.classList.add('fountain');
        return element;
    }

    tickUpdate(tickDelta) {
        super.tickUpdate(tickDelta);

        this._proximityAccumulator += tickDelta;
        if (this._proximityAccumulator >= this._proximityInterval) {
            this._proximityAccumulator = 0;
            this.checkNearbyMytes();
        }
    }

    update(deltaTime) {
        super.update(deltaTime);
    }
}
