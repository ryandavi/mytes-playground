const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const errors = [];
const warnings = [];

function readText(relPath) {
    return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
}

function readJson(relPath) {
    try {
        return JSON.parse(readText(relPath));
    } catch (error) {
        fail(`${relPath}: ${error.message}`);
        return null;
    }
}

function exists(relPath) {
    return fs.existsSync(path.join(repoRoot, relPath));
}

function fail(message) {
    errors.push(message);
}

function warn(message) {
    warnings.push(message);
}

function isPlainObject(value) {
    return value != null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeId(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_');
}

function normalizeTypeId(value) {
    return String(value || '')
        .trim()
        .replace(/\s+/g, '_')
        .toUpperCase();
}

function inferDefaultVisualState(visual = {}) {
    const animations = visual?.animations;
    if (!isPlainObject(animations)) {
        return null;
    }

    const ids = Object.keys(animations);
    if (!ids.length) {
        return null;
    }

    const preferred = ['default', 'idle', 'closed', 'off', 'seed', 'active', 'opened', 'open'];
    for (const id of preferred) {
        if (ids.includes(id)) {
            return id;
        }
    }

    return ids[0] || null;
}

function ensureUniqueIds(entries, domainLabel, getId) {
    const seen = new Map();
    entries.forEach((entry, index) => {
        const rawId = getId(entry, index);
        const id = String(rawId || '').trim();
        if (!id) {
            fail(`${domainLabel}[${index}] is missing an id.`);
            return;
        }
        if (seen.has(id)) {
            fail(`${domainLabel} contains duplicate id "${id}".`);
            return;
        }
        seen.set(id, true);
    });
}

function validateMytes() {
    const baseDefinition = readJson('data/mytes/myte.json');
    const speciesCatalog = readJson('data/mytes/species.json');
    if (!baseDefinition || !speciesCatalog) {
        return;
    }

    const species = Array.isArray(speciesCatalog.species) ? speciesCatalog.species : [];
    ensureUniqueIds(species, 'data/mytes/species.json species', entry => normalizeId(entry.id || entry.speciesId));

    const enabledIds = new Set();
    species.forEach((entry, index) => {
        const id = normalizeId(entry.id || entry.speciesId);
        const definitionFile = String(entry.definitionFile || `${id}.json`).trim();
        const relPath = path.join('data/mytes', definitionFile);

        if (!exists(relPath)) {
            fail(`Myte species "${id}" references missing definition file "${relPath}".`);
            return;
        }

        const definition = readJson(relPath);
        if (!definition) {
            return;
        }

        const definitionId = normalizeId(definition.id || id);
        if (definitionId !== id) {
            fail(`Myte species "${id}" does not match definition id "${definition.id}".`);
        }

        if (entry.enabled !== false) {
            enabledIds.add(id);
        }

        if (index === 0 && !baseDefinition.visual) {
            warn('Base Myte definition has no visual section.');
        }
    });

    const defaultSpeciesId = normalizeId(speciesCatalog.defaultSpeciesId);
    if (!defaultSpeciesId || !enabledIds.has(defaultSpeciesId)) {
        fail(`Default Myte species "${speciesCatalog.defaultSpeciesId}" is not an enabled species.`);
    }
}

function validateItems() {
    const itemCatalog = readJson('data/metadata/items.json');
    if (!itemCatalog) {
        return;
    }

    const items = Array.isArray(itemCatalog.items) ? itemCatalog.items : [];
    ensureUniqueIds(items, 'data/metadata/items.json items', entry => normalizeId(entry.id));

    const claimedIds = new Map();
    items.forEach((item) => {
        const itemId = normalizeId(item.id);
        claimedIds.set(itemId, `item id "${itemId}"`);
    });

    items.forEach((item) => {
        const itemId = normalizeId(item.id);
        const aliases = Array.isArray(item.aliases) ? item.aliases : [];
        aliases.forEach((alias) => {
            const normalizedAlias = normalizeId(alias);
            if (!normalizedAlias) {
                fail(`Item "${itemId}" has an empty alias.`);
                return;
            }

            const existingClaim = claimedIds.get(normalizedAlias);
            if (existingClaim && existingClaim !== `item id "${itemId}"`) {
                fail(`Item alias "${normalizedAlias}" for "${itemId}" collides with ${existingClaim}.`);
                return;
            }

            claimedIds.set(normalizedAlias, `item alias on "${itemId}"`);
        });
    });
}

function getRegisteredActionClasses() {
    const source = readText('js/Myte/Queue/ActionManager.js');
    const match = source.match(/ActionManager\.registerActions\(\[([\s\S]*?)\]\);/);
    if (!match) {
        fail('Could not find ActionManager.registerActions([...]) in js/Myte/Queue/ActionManager.js.');
        return new Set();
    }

    const classNames = new Set();
    const lines = match[1]
        .split(/\r?\n/)
        .map(line => line.replace(/\/\/.*$/, '').trim())
        .filter(Boolean);

    lines.forEach((line) => {
        const cleaned = line.replace(/,$/, '').trim();
        if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(cleaned)) {
            classNames.add(cleaned);
        }
    });

    return classNames;
}

function validateActions() {
    const actionCatalog = readJson('data/metadata/actions.json');
    if (!actionCatalog) {
        return;
    }

    const actions = Array.isArray(actionCatalog.actions) ? actionCatalog.actions : [];
    ensureUniqueIds(actions, 'data/metadata/actions.json actions', entry => normalizeId(entry.id));

    const registeredClasses = getRegisteredActionClasses();
    actions.forEach((action) => {
        const actionId = normalizeId(action.id);
        // Runtime reads this from queue.implementationClass (ActionDefinitionRegistry).
        const className = String(action.queue?.implementationClass || '').trim();
        if (!className) {
            fail(`Action "${actionId}" is missing implementationClass.`);
            return;
        }

        if (!registeredClasses.has(className)) {
            fail(`Action "${actionId}" points to implementationClass "${className}", but it is not registered in ActionManager.registerActions(...).`);
        }
    });
}

function validateMapObjects() {
    const baseConfig = readJson('data/map-objects/base.json');
    const typeConfigs = readJson('data/map-objects/types.json');
    const actionCatalog = readJson('data/metadata/actions.json');
    if (!baseConfig || !typeConfigs || !actionCatalog) {
        return;
    }

    const typeEntries = Object.entries(typeConfigs);
    const validActionIds = new Set(
        (Array.isArray(actionCatalog.actions) ? actionCatalog.actions : [])
            .map(action => normalizeId(action.id))
            .filter(Boolean)
    );
    const affordanceWhenKeys = new Set([
        'capability',
        'isEnabled',
        'isActiveMusicSource',
        'method',
        'notMethod',
        'actorNotCarrying',
        'socketAvailable',
        'contextGate',
        'novelty'
    ]);
    const numericOps = new Set(['gt', 'gte', 'lt', 'lte']);
    ensureUniqueIds(typeEntries, 'data/map-objects/types.json types', ([typeId]) => normalizeTypeId(typeId));

    typeEntries.forEach(([typeId, config]) => {
        const baseType = normalizeTypeId(config.baseType);
        if (baseType && !typeConfigs[baseType]) {
            fail(`Map object type "${typeId}" references missing baseType "${baseType}".`);
        }

        const visual = isPlainObject(config.visual) ? config.visual : null;
        if (visual?.animations && !visual.defaultState && !inferDefaultVisualState(visual)) {
            fail(`Map object type "${typeId}" has animations but no resolvable visual.defaultState.`);
        }

        if (config.capabilities !== undefined && !isPlainObject(config.capabilities)) {
            fail(`Map object type "${typeId}" has non-object capabilities.`);
        }

        const affordances = config.ai?.affordances;
        if (affordances !== undefined && !Array.isArray(affordances)) {
            fail(`Map object type "${typeId}" has ai.affordances that is not an array.`);
        }

        if (Array.isArray(affordances)) {
            affordances.forEach((entry, index) => {
                const label = `Map object type "${typeId}" ai.affordances[${index}]`;

                if (typeof entry === 'string') {
                    if (!validActionIds.has(normalizeId(entry))) {
                        fail(`${label} references unknown action "${entry}".`);
                    }
                    return;
                }

                if (!isPlainObject(entry)) {
                    fail(`${label} must be a string or plain object.`);
                    return;
                }

                if (!validActionIds.has(normalizeId(entry.actionId))) {
                    fail(`${label} references unknown action "${entry.actionId}".`);
                }

                if (entry.purpose !== undefined && typeof entry.purpose !== 'string') {
                    fail(`${label}.purpose must be a string when present.`);
                }

                if (entry.chain !== undefined && typeof entry.chain !== 'boolean') {
                    fail(`${label}.chain must be a boolean when present.`);
                }

                if (entry.when === undefined) {
                    return;
                }

                if (!isPlainObject(entry.when)) {
                    fail(`${label}.when must be a plain object.`);
                    return;
                }

                Object.keys(entry.when).forEach((key) => {
                    if (!affordanceWhenKeys.has(key)) {
                        fail(`${label}.when has unknown clause "${key}".`);
                    }
                });

                if (entry.when.capability !== undefined && typeof entry.when.capability !== 'string') {
                    fail(`${label}.when.capability must be a string.`);
                }

                if (entry.when.isEnabled !== undefined && typeof entry.when.isEnabled !== 'boolean') {
                    fail(`${label}.when.isEnabled must be a boolean.`);
                }

                if (entry.when.isActiveMusicSource !== undefined && typeof entry.when.isActiveMusicSource !== 'boolean') {
                    fail(`${label}.when.isActiveMusicSource must be a boolean.`);
                }

                if (entry.when.method !== undefined && typeof entry.when.method !== 'string') {
                    fail(`${label}.when.method must be a string.`);
                }

                if (entry.when.notMethod !== undefined && typeof entry.when.notMethod !== 'string') {
                    fail(`${label}.when.notMethod must be a string.`);
                }

                if (entry.when.actorNotCarrying !== undefined && entry.when.actorNotCarrying !== true) {
                    fail(`${label}.when.actorNotCarrying must be true when present.`);
                }

                if (entry.when.socketAvailable !== undefined && typeof entry.when.socketAvailable !== 'string') {
                    fail(`${label}.when.socketAvailable must be a string.`);
                }

                ['contextGate', 'novelty'].forEach((gateKey) => {
                    const gate = entry.when[gateKey];
                    if (gate === undefined) return;

                    if (!isPlainObject(gate)) {
                        fail(`${label}.when.${gateKey} must be a plain object.`);
                        return;
                    }

                    if (!numericOps.has(gate.op)) {
                        fail(`${label}.when.${gateKey}.op must be one of gt, gte, lt, lte.`);
                    }

                    if (!Number.isFinite(Number(gate.value))) {
                        fail(`${label}.when.${gateKey}.value must be numeric.`);
                    }

                    if (gateKey === 'contextGate' && typeof gate.path !== 'string') {
                        fail(`${label}.when.contextGate.path must be a string.`);
                    }
                });
            });
        }
    });

    if (!isPlainObject(baseConfig.visual)) {
        warn('data/map-objects/base.json has no visual section.');
    }
}

function validateNoLegacyFiles() {
    const forbiddenFiles = [
        'data/metadata/actions.json.deprecated',
        'js/Map/MapObjects/MapObjectConfigs.js'
    ];

    forbiddenFiles.forEach((relPath) => {
        if (exists(relPath)) {
            fail(`Legacy file still exists: ${relPath}`);
        }
    });
}

function run() {
    validateNoLegacyFiles();
    validateMytes();
    validateItems();
    validateActions();
    validateMapObjects();

    if (warnings.length) {
        console.warn('Warnings:');
        warnings.forEach(message => console.warn(`- ${message}`));
    }

    if (errors.length) {
        console.error('Validation failed:');
        errors.forEach(message => console.error(`- ${message}`));
        process.exitCode = 1;
        return;
    }

    console.log('Content data validation passed.');
}

run();
