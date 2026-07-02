class MyteDefinitionRegistry {
    static baseDefinition = null;
    static speciesDefinitions = new Map();
    static speciesCatalog = [];
    static loadPromise = null;
    static defaultSpeciesId = 'snail';

    static normalizeSpeciesId(speciesId) {
        return String(speciesId || this.defaultSpeciesId || 'snail').trim().toLowerCase();
    }

    static normalizeSpeciesCatalogEntry(entry = {}) {
        const id = this.normalizeSpeciesId(entry.id || entry.speciesId);
        if (!id) return null;

        const parsedSortOrder = Number(entry.sortOrder);
        return {
            ...entry,
            id,
            definitionFile: String(entry.definitionFile || `${id}.json`).trim(),
            label: entry.label || id,
            enabled: entry.enabled !== false,
            essential: entry.essential === true,
            sortOrder: Number.isFinite(parsedSortOrder) ? parsedSortOrder : 0
        };
    }

    static async preload() {
        if (!this.loadPromise) {
            this.loadPromise = this.loadDefinitions();
        }

        return this.loadPromise;
    }

    static async loadDefinitions() {
        const [baseResponse, speciesCatalogResponse] = await Promise.all([
            fetch(Utility.preventCache('data/mytes/myte.json')),
            fetch(Utility.preventCache('data/mytes/species.json'))
        ]);

        if (!baseResponse.ok) {
            throw new Error('Failed to load base Myte definition.');
        }
        if (!speciesCatalogResponse.ok) {
            throw new Error('Failed to load Myte species catalog.');
        }

        this.baseDefinition = await baseResponse.json();
        const speciesCatalogData = await speciesCatalogResponse.json();
        const speciesEntries = (speciesCatalogData.species || [])
            .map(entry => this.normalizeSpeciesCatalogEntry(entry))
            .filter(Boolean)
            .filter(entry => entry.enabled)
            .sort((a, b) => {
                if (a.sortOrder !== b.sortOrder) {
                    return a.sortOrder - b.sortOrder;
                }
                return a.id.localeCompare(b.id);
            });

        if (speciesEntries.length === 0) {
            throw new Error('No enabled Myte species were found in data/mytes/species.json.');
        }

        this.speciesCatalog = speciesEntries.map(entry => Utility.deepClone(entry));
        this.defaultSpeciesId = this.normalizeSpeciesId(
            speciesCatalogData.defaultSpeciesId || speciesEntries[0].id
        );

        const speciesResponses = await Promise.all(
            speciesEntries.map(async (entry) => {
                const response = await fetch(`data/mytes/${entry.definitionFile}`);
                if (!response.ok) {
                    throw new Error(`Failed to load species definition "${entry.id}".`);
                }

                return {
                    entry,
                    definition: await response.json()
                };
            })
        );

        this.speciesDefinitions.clear();
        speciesResponses.forEach(({ entry, definition }) => {
            const speciesId = this.normalizeSpeciesId(definition.id || entry.id);
            this.speciesDefinitions.set(entry.id, {
                ...definition,
                id: speciesId
            });
        });
    }

    static getSpeciesIds() {
        return this.speciesCatalog.map(entry => entry.id);
    }

    static getSpeciesCatalogSync() {
        return Utility.deepClone(this.speciesCatalog);
    }

    static getSpeciesLayersSync(speciesId = this.defaultSpeciesId) {
        const resolvedSpeciesId = this.resolveSpeciesId(speciesId);
        const speciesDefinition = this.speciesDefinitions.get(resolvedSpeciesId);
        if (!this.baseDefinition || !speciesDefinition) {
            throw new Error(`MyteDefinitionRegistry is not ready for species "${resolvedSpeciesId}".`);
        }

        return {
            baseDefinition: Utility.deepClone(this.baseDefinition),
            speciesDefinition: Utility.deepClone(speciesDefinition),
            mergedDefinition: this.getSpeciesSync(resolvedSpeciesId)
        };
    }

    static resolveSpeciesId(speciesId = this.defaultSpeciesId) {
        const normalizedSpeciesId = this.normalizeSpeciesId(speciesId);
        if (this.speciesDefinitions.has(normalizedSpeciesId)) {
            return normalizedSpeciesId;
        }

        if (this.speciesDefinitions.has(this.defaultSpeciesId)) {
            return this.defaultSpeciesId;
        }

        return this.speciesDefinitions.keys().next().value || this.defaultSpeciesId;
    }

    static getSpeciesSync(speciesId = this.defaultSpeciesId) {
        const resolvedSpeciesId = this.resolveSpeciesId(speciesId);
        const speciesDefinition = this.speciesDefinitions.get(resolvedSpeciesId);

        if (!this.baseDefinition || !speciesDefinition) {
            throw new Error(`MyteDefinitionRegistry is not ready for species "${resolvedSpeciesId}".`);
        }

        const mergedDefinition = this.deepMerge(this.baseDefinition, speciesDefinition);
        mergedDefinition.id = this.normalizeSpeciesId(mergedDefinition.id || resolvedSpeciesId);
        return mergedDefinition;
    }

    static resolveExpression(expressionId, stateConfig = {}, definition = null) {
        if (!expressionId) {
            return null;
        }

        const directMatch = stateConfig[expressionId] ? expressionId : null;
        if (directMatch) {
            return directMatch;
        }

        const aliases = (definition ?? this.baseDefinition)?.expressions || {};
        const normalized = aliases[expressionId] || null;
        if (normalized && stateConfig[normalized]) {
            return normalized;
        }

        return null;
    }

    static getSpatialRegion(definition, regionId, direction = null) {
        return this.getSpatialValue(definition, 'regions', regionId, direction);
    }

    static getSpatialAnchor(definition, anchorId, direction = null) {
        return this.getSpatialValue(definition, 'anchors', anchorId, direction);
    }

    static getSpatialValue(definition, section, valueId, direction = null) {
        const baseValue = definition?.spatial?.[section]?.[valueId];
        if (!direction) {
            return baseValue == null ? null : Utility.deepClone(baseValue);
        }

        const normalizedDirection = String(direction || '').trim().toUpperCase();
        const directionalValue = definition?.spatial?.directions?.[normalizedDirection]?.[section]?.[valueId];
        if (baseValue == null && directionalValue == null) {
            return null;
        }

        return this.deepMerge(baseValue, directionalValue);
    }

    static getSpriteSheetConfig(definition) {
        const spriteSheet = definition?.visual?.spriteSheet || {};
        return {
            url: spriteSheet.url || '',
            filter: spriteSheet.filter || 'none'
        };
    }

    // Public alias kept for editor/runtime parity; EditorStore calls this by name.
    static deepMerge(baseValue, overrideValue) {
        return Utility.deepMerge(baseValue, overrideValue);
    }

}
