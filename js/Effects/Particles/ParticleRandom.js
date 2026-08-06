class ParticleRandom {
    constructor(randomFn = Math.random) {
        this.randomFn = typeof randomFn === 'function' ? randomFn : Math.random;
    }

    value() {
        return this.randomFn();
    }

    range(min, max) {
        if (!Number.isFinite(min) && !Number.isFinite(max)) return 0;
        if (!Number.isFinite(max)) return min;
        if (!Number.isFinite(min)) return max;
        return min + (max - min) * this.value();
    }

    centered(amount) {
        if (!Number.isFinite(amount) || amount === 0) return 0;
        return (this.value() - 0.5) * amount * 2;
    }

    pick(list, fallback = null) {
        if (!Array.isArray(list) || list.length === 0) return fallback;
        return list[Math.floor(this.value() * list.length)] ?? fallback;
    }
}
