class MyteDefinitionRegistry {
    static baseDefinition = null;
    static speciesDefinitions = new Map();
    static loadPromise = null;
    static definitionFiles = ['snail', 'worm'];

    static normalizeSpeciesId(speciesId) {
        return String(speciesId || 'snail').trim().toLowerCase();
    }

    static async preload() {
        if (!this.loadPromise) {
            this.loadPromise = this.loadDefinitions();
        }

        return this.loadPromise;
    }

    static async loadDefinitions() {
        const baseResponse = await fetch('data/mytes/myte.json');
        if (!baseResponse.ok) {
            throw new Error('Failed to load base Myte definition.');
        }

        this.baseDefinition = await baseResponse.json();

        const speciesResponses = await Promise.all(
            this.definitionFiles.map(async (speciesId) => {
                const response = await fetch(`data/mytes/${speciesId}.json`);
                if (!response.ok) {
                    throw new Error(`Failed to load species definition "${speciesId}".`);
                }

                return response.json();
            })
        );

        this.speciesDefinitions.clear();
        speciesResponses.forEach((definition) => {
            const speciesId = this.normalizeSpeciesId(definition.id);
            this.speciesDefinitions.set(speciesId, definition);
        });
    }

    static getSpeciesIds() {
        return [...this.speciesDefinitions.keys()];
    }

    static getSpeciesSync(speciesId = 'snail') {
        const normalizedSpeciesId = this.normalizeSpeciesId(speciesId);
        const fallbackDefinition = this.speciesDefinitions.get('snail');
        const speciesDefinition = this.speciesDefinitions.get(normalizedSpeciesId) || fallbackDefinition;

        if (!this.baseDefinition || !speciesDefinition) {
            throw new Error(`MyteDefinitionRegistry is not ready for species "${normalizedSpeciesId}".`);
        }

        const mergedDefinition = this.deepMerge(this.baseDefinition, speciesDefinition);
        mergedDefinition.id = this.normalizeSpeciesId(mergedDefinition.id || normalizedSpeciesId);
        return mergedDefinition;
    }

    static resolveExpression(expressionId, stateConfig = {}) {
        if (!expressionId) {
            return null;
        }

        const directMatch = stateConfig[expressionId] ? expressionId : null;
        if (directMatch) {
            return directMatch;
        }

        const aliases = this.baseDefinition?.expressions || {};
        const normalized = aliases[expressionId] || null;
        if (normalized && stateConfig[normalized]) {
            return normalized;
        }

        return null;
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

        keys.forEach((key) => {
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
