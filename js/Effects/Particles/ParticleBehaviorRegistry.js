class ParticleBehaviorRegistry {
    constructor() {
        this.behaviors = new Map();
    }

    register(name, behavior = {}) {
        if (!name) return;
        this.behaviors.set(name, behavior);
    }

    get(name) {
        return this.behaviors.get(name) || null;
    }

    runTick(particle, tickDelta, system) {
        if (!Array.isArray(particle.behaviors)) return;

        for (const behaviorName of particle.behaviors) {
            const behavior = this.behaviors.get(behaviorName);
            if (behavior?.tick) {
                behavior.tick(particle, tickDelta, system);
            }
        }
    }

    runVisual(particle, deltaTime, alpha, system) {
        if (!Array.isArray(particle.behaviors)) return;

        for (const behaviorName of particle.behaviors) {
            const behavior = this.behaviors.get(behaviorName);
            if (behavior?.visual) {
                behavior.visual(particle, deltaTime, alpha, system);
            }
        }
    }
}
