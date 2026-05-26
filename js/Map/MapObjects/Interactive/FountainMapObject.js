class FountainMapObject extends BinaryStateAnimatedMapObject {
    getBuffContextKey() {
        return `fountain:${this.id ?? `${this.posX},${this.posY}`}:aura`;
    }

    getApproachMode() {
        return 'adjacent';
    }

    constructor(parent, type, variant, posX, posY, config = {}, options = {}) {
        super(parent, type, variant, posX, posY, config, options);
        
        // Fountain configuration
        this.moodBoostRadius = this.getConfig('moodBoostRadius', 150);
        this.moodBoostAmount = this.getConfig('moodBoostAmount', 0.1);
        this.boostCooldown = this.getConfig('boostCooldown', 1000);

        // Boost tracking: myte.id → last boost timestamp (performance.now())
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
    
    syncAuraBuff(myte, active) {
        myte?.buffs?.syncContextBuff?.(
            this.getBuffContextKey(),
            this.getConfig('auraBuffDefinition', null) ??
            this.getConfig('auraBuffId', 'fountain_aura'),
            {
                active,
                source: 'aura',
                payload: {
                    objectType: this.type,
                    objectId: this.id
                }
            }
        );
    }

    checkNearbyMytes() {
        if (!this.mytes.length) return;

        this.mytes.forEach(myte => {
            if (!myte.isActive) {
                this.syncAuraBuff(myte, false);
                return;
            }

            const inRange = this.isEnabled() && this.getDistanceTo(myte) <= this.moodBoostRadius;
            this.syncAuraBuff(myte, inRange);

            if (inRange && Math.random() < 0.1) {
                myte.queue.addExpression('happy');
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

    getAiAffordances(context = {}, actor = null) {
        const affordances = super.getAiAffordances(context, actor).filter(affordance => affordance.actionId !== 'inspect');
        affordances.push({ actionId: 'drink_fountain', purpose: 'soothe' });

        if (this.canBeInspectedByAi()) {
            affordances.push({ actionId: 'inspect', purpose: 'inspect' });
        }

        return affordances;
    }
}
