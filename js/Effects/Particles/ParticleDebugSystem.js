class ParticleDebugSystem {
    constructor(system) {
        this.system = system;
        this.stats = {
            effectsEnabled: true,
            activeParticles: 0,
            pooledParticles: 0,
            activeEmitters: 0,
            boundRenderers: 0,
            spawnedThisTick: 0,
            recycledThisTick: 0,
            culledThisFrame: 0,
            domWritesThisFrame: 0
        };
    }

    beginTick() {
        this.stats.spawnedThisTick = 0;
        this.stats.recycledThisTick = 0;
    }

    recordSpawn() {
        this.stats.spawnedThisTick++;
    }

    recordRecycle() {
        this.stats.recycledThisTick++;
    }

    setFrameCulledCount(count) {
        this.stats.culledThisFrame = count;
    }

    sync() {
        this.stats.effectsEnabled = this.system.effectsEnabled !== false;
        this.stats.activeParticles = this.system.particles.length;
        this.stats.pooledParticles = this.system.particlePool.availableCount();
        this.stats.activeEmitters = this.system.emitters.length;
        this.stats.boundRenderers = this.system.renderer.stats.boundViews;
        this.stats.domWritesThisFrame = this.system.renderer.stats.domWrites;
    }

    snapshot() {
        this.sync();
        return { ...this.stats };
    }
}
