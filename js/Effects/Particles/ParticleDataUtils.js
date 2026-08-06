class ParticleDataUtils {
    static isPlainObject(value) {
        return Utility.isPlainObject(value);
    }

    static clone(value) {
        return Utility.deepClone(value);
    }

    static merge(base, extra) {
        if (Array.isArray(extra)) {
            return extra.map(entry => ParticleDataUtils.clone(entry));
        }

        if (!ParticleDataUtils.isPlainObject(base) || !ParticleDataUtils.isPlainObject(extra)) {
            return ParticleDataUtils.clone(extra !== undefined ? extra : base);
        }

        const merged = {};
        const keys = new Set([...Object.keys(base), ...Object.keys(extra)]);

        keys.forEach(key => {
            if (!(key in extra)) {
                merged[key] = ParticleDataUtils.clone(base[key]);
                return;
            }

            if (!(key in base)) {
                merged[key] = ParticleDataUtils.clone(extra[key]);
                return;
            }

            const baseValue = base[key];
            const extraValue = extra[key];

            if (ParticleDataUtils.isPlainObject(baseValue) && ParticleDataUtils.isPlainObject(extraValue)) {
                merged[key] = ParticleDataUtils.merge(baseValue, extraValue);
                return;
            }

            if (Array.isArray(extraValue)) {
                merged[key] = extraValue.map(entry => ParticleDataUtils.clone(entry));
                return;
            }

            merged[key] = ParticleDataUtils.clone(extraValue);
        });

        return merged;
    }

    static toFiniteNumber(value, fallback = 0) {
        return Number.isFinite(value) ? value : fallback;
    }
}
