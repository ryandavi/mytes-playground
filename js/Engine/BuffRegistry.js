class BuffRegistry {
    static buffs = new Map();
    static preloadPromise = null;
    static preloaded = false;

    static normalizeBuffId(value) {
        return String(value || '')
            .trim()
            .toLowerCase()
            .replace(/\s+/g, '_');
    }

    static async preload() {
        if (this.preloaded) return true;
        if (this.preloadPromise) return this.preloadPromise;

        this.preloadPromise = fetch('data/metadata/buffs.json')
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Failed to load buff metadata: ${response.status} ${response.statusText}`);
                }
                return response.json();
            })
            .then(data => {
                this.loadFromData(data);
                this.preloaded = true;
                return true;
            })
            .catch(error => {
                console.error('[BuffRegistry] Failed to preload buff metadata:', error);
                return false;
            });

        return this.preloadPromise;
    }

    static loadFromData(data = {}) {
        this.buffs.clear();

        const entries = Array.isArray(data.buffs)
            ? data.buffs
            : Object.values(data.buffs || {});

        entries.forEach(definition => this.registerBuff(definition));
    }

    static registerBuff(definition = {}) {
        const normalized = this.normalizeDefinition(definition);
        if (!normalized) return;
        this.buffs.set(normalized.id, normalized);
    }

    static normalizeDefinition(definition = {}) {
        const id = this.normalizeBuffId(definition.id || definition.buffId);
        if (!id) return null;

        return {
            id,
            label: definition.label || id,
            kind: definition.kind === 'debuff' ? 'debuff' : 'buff',
            category: definition.category || 'general',
            priority: Number.isFinite(Number(definition.priority)) ? Number(definition.priority) : 0,
            durationMs: Math.max(0, Number(definition.durationMs) || 0),
            reapplyCooldownMs: Math.max(0, Number(definition.reapplyCooldownMs) || 0),
            cancellable: definition.cancellable === true,
            stackMode: definition.stackMode || 'refresh',
            maxStacks: Math.max(1, Number(definition.maxStacks) || 1),
            refreshOnReapply: definition.refreshOnReapply !== false,
            icon: definition.icon || '',
            description: definition.description || '',
            tooltip: definition.tooltip || '',
            hidden: definition.hidden === true,
            effects: this.cloneValue(definition.effects || {}),
            instantEffects: this.cloneValue(definition.instantEffects || {}),
            triggers: this.cloneValue(definition.triggers || {})
        };
    }

    static getBuffSync(buffId) {
        const normalizedId = this.normalizeBuffId(buffId);
        return normalizedId ? (this.buffs.get(normalizedId) || null) : null;
    }

    static getStatusDefinitions() {
        return Array.from(this.buffs.values()).filter(definition => definition.triggers?.status);
    }

    static getBuffsForTrigger(triggerType, payload = {}) {
        return Array.from(this.buffs.values()).filter(definition => {
            const trigger = definition.triggers?.[triggerType];
            if (!trigger) return false;

            switch (triggerType) {
                case 'actionComplete':
                    return this.matchesActionCompleteTrigger(trigger, payload);
                case 'itemConsumed':
                    return this.matchesItemConsumedTrigger(trigger, payload);
                case 'event':
                    return this.matchesEventTrigger(trigger, payload);
                default:
                    return false;
            }
        });
    }

    static matchesActionCompleteTrigger(trigger = {}, payload = {}) {
        const actionId = this.normalizeBuffId(payload.actionId);
        const category = String(payload.category || '').toLowerCase();

        const hasActionIds = Array.isArray(trigger.actionIds) && trigger.actionIds.length > 0;
        const hasCategories = Array.isArray(trigger.categories) && trigger.categories.length > 0;

        if (!hasActionIds && !hasCategories) return true;

        // When both are specified, either match qualifies (OR logic).
        // When only one is specified, it must match.
        if (hasActionIds) {
            const actionIds = trigger.actionIds.map(id => this.normalizeBuffId(id));
            if (actionIds.includes(actionId)) return true;
        }

        if (hasCategories) {
            const categories = trigger.categories.map(value => String(value || '').toLowerCase());
            if (categories.includes(category)) return true;
        }

        return false;
    }

    static matchesItemConsumedTrigger(trigger = {}, payload = {}) {
        const type = String(payload.type || '').toLowerCase();
        const variant = this.normalizeBuffId(payload.variant);

        if (Array.isArray(trigger.types) && trigger.types.length > 0) {
            const types = trigger.types.map(value => String(value || '').toLowerCase());
            if (!types.includes(type)) {
                return false;
            }
        }

        if (Array.isArray(trigger.variants) && trigger.variants.length > 0) {
            const variants = trigger.variants.map(value => this.normalizeBuffId(value));
            if (!variants.includes(variant)) {
                return false;
            }
        }

        return true;
    }

    static matchesEventTrigger(trigger = {}, payload = {}) {
        const eventName = this.normalizeBuffId(payload.name);

        if (Array.isArray(trigger.names) && trigger.names.length > 0) {
            const names = trigger.names.map(value => this.normalizeBuffId(value));
            if (!names.includes(eventName)) {
                return false;
            }
        }

        return true;
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
