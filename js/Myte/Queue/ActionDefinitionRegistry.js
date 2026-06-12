class ActionDefinitionRegistry {
    static definitions = new Map();
    static preloadPromise = null;
    static preloaded = false;

    // Merged-definition caches — definitions are static after preload and callers
    // only read the result, so merge once and hand out a frozen shared object.
    static _noFallbackCache = new Map();
    static _fallbackCache = new Map();

    static normalizeActionId(value) {
        return String(value || '')
            .trim()
            .toLowerCase()
            .replace(/\s+/g, '_');
    }

    static async preload() {
        if (this.preloaded) return true;
        if (this.preloadPromise) return this.preloadPromise;

        this.preloadPromise = fetch(`data/metadata/actions.json?v=${Date.now()}`)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Failed to load action metadata: ${response.status} ${response.statusText}`);
                }
                return response.json();
            })
            .then(data => {
                this.loadFromData(data);
                this.preloaded = true;
                return true;
            })
            .catch(error => {
                console.error('[ActionDefinitionRegistry] Failed to preload action metadata:', error);
                return false;
            });

        return this.preloadPromise;
    }

    static invalidateMergeCaches() {
        this._noFallbackCache.clear();
        this._fallbackCache.clear();
    }

    static loadFromData(data = {}) {
        this.definitions.clear();
        this.invalidateMergeCaches();

        const entries = Array.isArray(data.actions)
            ? data.actions
            : Object.values(data.actions || {});

        entries.forEach(definition => this.registerDefinition(definition));
    }

    static registerDefinition(definition = {}) {
        const normalized = this.normalizeDefinition(definition);
        if (!normalized) return;
        this.definitions.set(normalized.id, normalized);
        this._noFallbackCache.delete(normalized.id);
        this._fallbackCache.delete(normalized.id);
    }

    static normalizeDefinition(definition = {}) {
        const id = this.normalizeActionId(definition.id || definition.actionId);
        if (!id) return null;

        const q = definition.queue ?? {};
        const t = definition.traits ?? {};
        const fx = definition.effects ?? {};
        const num = (v, def = 0) => Number.isFinite(Number(v)) ? Number(v) : def;

        return {
            id,
            label: definition.label || id,
            labelShort: definition.labelShort || '',
            category: definition.category || 'basic',
            priority: num(q.priority),
            isMovementAction: q.isMovementAction !== false,
            isInterruptible: q.isInterruptible !== false,
            defaultDuration: num(q.defaultDuration),
            description: definition.description || '',
            requiresTarget: q.requiresTarget === true,
            icon: definition.icon || '',
            implementationClass: q.implementationClass || '',
            defaultOptions: this.cloneValue(q.options ?? {}),
            energyCostMultiplier: Number.isFinite(Number(q.energyCostMultiplier)) ? Number(q.energyCostMultiplier) : undefined,
            tags: Array.isArray(definition.tags) ? [...definition.tags] : [],
            effects: {
                fun:     num(fx.fun),
                social:  num(fx.social),
                comfort: num(fx.comfort),
                energy:  num(fx.energy),
                satiety: num(fx.satiety ?? fx.hunger),
                mood:    num(fx.mood)
            },
            exertion: num(t.exertion),
            novelty:  num(t.novelty),
            risk:     num(t.risk),
            soothing: num(t.soothing),
            repeatMode: t.repeatMode ?? 'diminishing',
            ai: this._normalizeAiBlock(definition),
            purposeOverrides: this._normalizePurposeOverrides(definition.purposeOverrides)
        };
    }

    static _normalizeAiBlock(source) {
        const ai = source?.ai ?? {};
        const num = (v, def) => Number.isFinite(Number(v)) ? Number(v) : def;
        return {
            category:       ai.category       ?? 'world',
            soothing:       num(ai.soothing,       0.1),
            exertion:       num(ai.exertion,       0.1),
            accomplishment: num(ai.accomplishment, 0.1),
            commitmentMs:   num(ai.commitmentMs,   1200),
            scoreDrivers:   Array.isArray(ai.scoreDrivers) ? this.cloneValue(ai.scoreDrivers) : []
        };
    }

    static _normalizePurposeOverrides(overrides) {
        if (!this.isPlainObject(overrides)) return {};
        const result = {};
        Object.entries(overrides).forEach(([purpose, override]) => {
            if (!this.isPlainObject(override)) return;
            const ai = override?.ai ?? {};
            const num = (v) => Number.isFinite(Number(v)) ? Number(v) : undefined;
            const normalized = {};
            if (ai.category !== undefined)      normalized.category      = ai.category;
            if (ai.soothing !== undefined)      normalized.soothing      = num(ai.soothing);
            if (ai.exertion !== undefined)      normalized.exertion      = num(ai.exertion);
            if (ai.accomplishment !== undefined) normalized.accomplishment = num(ai.accomplishment);
            if (ai.commitmentMs !== undefined)  normalized.commitmentMs  = num(ai.commitmentMs);
            if (Array.isArray(ai.scoreDrivers)) normalized.scoreDrivers  = this.cloneValue(ai.scoreDrivers);
            result[purpose] = { ai: normalized };
        });
        return result;
    }

    static getDefinitionSync(actionId, fallbackDefinition = null) {
        const normalizedId = this.normalizeActionId(actionId);
        const definition = this.definitions.get(normalizedId);
        if (!definition && !fallbackDefinition) {
            return null;
        }

        if (fallbackDefinition == null) {
            let cached = this._noFallbackCache.get(normalizedId);
            if (!cached) {
                cached = this.deepFreeze(this.deepMerge({}, definition));
                this._noFallbackCache.set(normalizedId, cached);
            }
            return cached;
        }

        // Fallbacks are stable objects (ActionManager.fallbackMetadata), so key
        // the cache by their identity; ad-hoc fallback objects simply never hit.
        let byFallback = this._fallbackCache.get(normalizedId);
        if (!byFallback) {
            byFallback = new WeakMap();
            this._fallbackCache.set(normalizedId, byFallback);
        }

        let cached = byFallback.get(fallbackDefinition);
        if (!cached) {
            cached = this.deepFreeze(this.deepMerge(fallbackDefinition, definition || {}));
            byFallback.set(fallbackDefinition, cached);
        }
        return cached;
    }

    static deepFreeze(value) {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            Object.freeze(value);
            Object.values(value).forEach(child => this.deepFreeze(child));
        }
        return value;
    }

    static getActionIds() {
        return Array.from(this.definitions.keys());
    }

    static deepMerge(baseValue, overrideValue) {
        if (Array.isArray(baseValue) || Array.isArray(overrideValue)) {
            return this.cloneValue(overrideValue ?? baseValue);
        }

        if (!this.isPlainObject(baseValue) || !this.isPlainObject(overrideValue)) {
            return this.cloneValue(overrideValue ?? baseValue);
        }

        const merged = {};
        const keys = new Set([
            ...Object.keys(baseValue || {}),
            ...Object.keys(overrideValue || {})
        ]);

        keys.forEach(key => {
            const baseChild = baseValue?.[key];
            const overrideChild = overrideValue?.[key];
            if (overrideChild === undefined) {
                merged[key] = this.cloneValue(baseChild);
                return;
            }
            if (baseChild === undefined) {
                merged[key] = this.cloneValue(overrideChild);
                return;
            }
            merged[key] = this.deepMerge(baseChild, overrideChild);
        });

        return merged;
    }

    static isPlainObject(value) {
        return value != null && typeof value === 'object' && !Array.isArray(value);
    }

    static cloneValue(value) {
        if (Array.isArray(value)) {
            return value.map(entry => this.cloneValue(entry));
        }

        if (this.isPlainObject(value)) {
            const cloned = {};
            Object.entries(value).forEach(([key, childValue]) => {
                cloned[key] = this.cloneValue(childValue);
            });
            return cloned;
        }

        return value;
    }
}
