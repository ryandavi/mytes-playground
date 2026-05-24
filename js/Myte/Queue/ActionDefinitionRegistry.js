class ActionDefinitionRegistry {
    static definitions = new Map();
    static preloadPromise = null;
    static preloaded = false;

    static normalizeActionId(value) {
        return String(value || '')
            .trim()
            .toLowerCase()
            .replace(/\s+/g, '_');
    }

    static async preload() {
        if (this.preloaded) return true;
        if (this.preloadPromise) return this.preloadPromise;

        this.preloadPromise = fetch('data/metadata/actions.json')
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

    static loadFromData(data = {}) {
        this.definitions.clear();

        const entries = Array.isArray(data.actions)
            ? data.actions
            : Object.values(data.actions || {});

        entries.forEach(definition => this.registerDefinition(definition));
    }

    static registerDefinition(definition = {}) {
        const normalized = this.normalizeDefinition(definition);
        if (!normalized) return;
        this.definitions.set(normalized.id, normalized);
    }

    static normalizeDefinition(definition = {}) {
        const id = this.normalizeActionId(definition.id || definition.actionId);
        if (!id) return null;

        return {
            id,
            label: definition.label || id,
            category: definition.category || 'basic',
            priority: Number.isFinite(Number(definition.priority)) ? Number(definition.priority) : 0,
            isMovementAction: definition.isMovementAction === true,
            isInterruptible: definition.isInterruptible === true,
            defaultDuration: Number.isFinite(Number(definition.defaultDuration)) ? Number(definition.defaultDuration) : 0,
            description: definition.description || '',
            requiresTarget: definition.requiresTarget === true,
            affectsMood: definition.affectsMood === true,
            moodEffect: Number.isFinite(Number(definition.moodEffect)) ? Number(definition.moodEffect) : undefined,
            implementationClass: definition.implementationClass || '',
            defaultOptions: this.cloneValue(definition.defaultOptions || {})
        };
    }

    static getDefinitionSync(actionId, fallbackDefinition = null) {
        const normalizedId = this.normalizeActionId(actionId);
        const definition = this.definitions.get(normalizedId);
        if (!definition && !fallbackDefinition) {
            return null;
        }

        return this.deepMerge(fallbackDefinition || {}, definition || {});
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
