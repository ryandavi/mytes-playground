const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

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

function validateSocketApproach(socket, label) {
    if (socket?.approach === undefined) return;
    if (!isPlainObject(socket.approach)) {
        fail(`${label}.approach must be a plain object.`);
        return;
    }

    const validSides = new Set(['top', 'right', 'bottom', 'left', 'center']);
    const allowedSides = socket.approach.allowedSides;
    if (!Array.isArray(allowedSides) || allowedSides.length === 0 ||
        allowedSides.some(side => !validSides.has(side))) {
        fail(`${label}.approach.allowedSides must contain valid approach sides.`);
    }

    const preferredSide = socket.approach.preferredSide;
    if (preferredSide != null && !validSides.has(preferredSide)) {
        fail(`${label}.approach.preferredSide must be null or a valid approach side.`);
    }
}

function validateSpatialRegions(spatial, label) {
    if (spatial === undefined) return;
    if (!isPlainObject(spatial)) {
        fail(`${label}.spatial must be a plain object.`);
        return;
    }
    if (spatial.regions === undefined) return;
    if (!isPlainObject(spatial.regions)) {
        fail(`${label}.spatial.regions must be a plain object.`);
        return;
    }

    Object.entries(spatial.regions).forEach(([regionId, region]) => {
        const regionLabel = `${label}.spatial.regions.${regionId || '<empty>'}`;
        if (!regionId.trim()) {
            fail(`${label}.spatial.regions contains an empty region id.`);
        }
        if (!isPlainObject(region)) {
            fail(`${regionLabel} must be a plain object.`);
            return;
        }
        if (region.type !== undefined && region.type !== 'box') {
            fail(`${regionLabel}.type must be "box".`);
        }
        for (const key of ['x', 'y', 'width', 'height']) {
            if (region[key] !== undefined && !Number.isFinite(region[key])) {
                fail(`${regionLabel}.${key} must be a finite number.`);
            }
        }
        for (const key of ['width', 'height']) {
            if (Number.isFinite(region[key]) && region[key] <= 0) {
                fail(`${regionLabel}.${key} must be greater than zero.`);
            }
        }
    });
}

function validateNoLegacySatietyKeys(value, label) {
    if (!isPlainObject(value)) return;

    for (const key of ['hunger', 'hungerDelta', 'hungerBoost', 'hungerDecayRate']) {
        if (Object.hasOwn(value, key)) {
            fail(`${label} uses legacy "${key}"; use the canonical satiety key.`);
        }
    }

    Object.entries(value).forEach(([key, child]) => {
        if (isPlainObject(child)) {
            validateNoLegacySatietyKeys(child, `${label}.${key}`);
        }
    });
}

function validateMyteSockets(definition, label) {
    if (definition?.sockets === undefined) return;
    if (!isPlainObject(definition.sockets)) {
        fail(`${label} has non-object sockets.`);
        return;
    }

    const socketKinds = new Set(['seat', 'sleep', 'hold', 'surface', 'mount']);
    Object.entries(definition.sockets).forEach(([socketId, socket]) => {
        const socketLabel = `${label} socket "${socketId}"`;
        if (!isPlainObject(socket) || !socketKinds.has(socket.kind)) {
            fail(`${socketLabel} has an invalid kind.`);
            return;
        }
        if (socket.kind !== 'surface' &&
            (!isPlainObject(socket.position) ||
                !Number.isFinite(Number(socket.position.xFactor)) ||
                !Number.isFinite(Number(socket.position.yFactor)))) {
            fail(`${socketLabel} point sockets require numeric x/y position factors.`);
        }
    });
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

    validateNoLegacySatietyKeys(baseDefinition.stats, 'Base Myte stats');
    validateMyteSockets(baseDefinition, 'Base Myte definition');

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

        validateNoLegacySatietyKeys(definition.stats, `Myte species "${id}" stats`);
        validateMyteSockets(definition, `Myte species "${id}"`);

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
    const mapObjectCatalog = readJson('data/map-objects/types.json') || {};
    const mapObjectTypes = new Set(Object.keys(mapObjectCatalog).map(type => String(type).toUpperCase()));
    const primaryActions = new Set(['feed', 'use', 'place', 'inspect']);
    const worldModes = new Set(['dropped_item', 'map_object']);
    ensureUniqueIds(items, 'data/metadata/items.json items', entry => normalizeId(entry.id));

    const claimedIds = new Map();
    items.forEach((item) => {
        const itemId = normalizeId(item.id);
        claimedIds.set(itemId, `item id "${itemId}"`);
    });

    items.forEach((item) => {
        const itemId = normalizeId(item.id);
        const stackLimit = item.inventory?.stackLimit;
        if (stackLimit !== undefined && (!Number.isInteger(stackLimit) || stackLimit < 1)) {
            fail(`Item "${itemId}" inventory.stackLimit must be a positive integer.`);
        }
        const primaryAction = item.inventory?.primaryAction;
        if (primaryAction !== undefined && !primaryActions.has(primaryAction)) {
            fail(`Item "${itemId}" has unknown inventory.primaryAction "${primaryAction}".`);
        }
        const worldMode = item.world?.mode;
        if (worldMode !== undefined && !worldModes.has(worldMode)) {
            fail(`Item "${itemId}" has unknown world.mode "${worldMode}".`);
        }
        if (worldMode === 'map_object') {
            const objectType = String(item.world?.objectType || '').toUpperCase();
            if (!mapObjectTypes.has(objectType)) {
                fail(`Item "${itemId}" references unknown map object type "${item.world?.objectType}".`);
            }
            if (!normalizeId(item.world?.variant)) {
                fail(`Item "${itemId}" with world.mode "map_object" requires world.variant.`);
            }
        }
        if (item.use?.target === 'myte' && !isPlainObject(item.use.effects)) {
            fail(`Item "${itemId}" targeting a Myte requires use.effects.`);
        }
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

function validateShops() {
    const itemCatalog = readJson('data/metadata/items.json');
    const shopCatalog = readJson('data/metadata/shops.json');
    if (!itemCatalog || !shopCatalog) return;

    const itemIds = new Set((itemCatalog.items || []).map(item => normalizeId(item.id)));
    const shops = Array.isArray(shopCatalog.shops) ? shopCatalog.shops : [];
    const requiredDialogue = ['welcome', 'purchase', 'insufficientFunds', 'inventoryFull', 'soldOut'];
    ensureUniqueIds(shops, 'data/metadata/shops.json shops', shop => normalizeId(shop.id));

    shops.forEach(shop => {
        const shopId = normalizeId(shop.id);
        if (!isPlainObject(shop.shopkeeper) || !String(shop.shopkeeper.name || '').trim()) {
            fail(`Shop "${shopId}" requires a shopkeeper name.`);
        }
        if (!isPlainObject(shop.dialogue)) {
            fail(`Shop "${shopId}" requires a dialogue object.`);
        } else {
            requiredDialogue.forEach(key => {
                const value = shop.dialogue[key];
                const valid = typeof value === 'string'
                    ? value.trim().length > 0
                    : Array.isArray(value) && value.length > 0 &&
                        value.every(entry => typeof entry === 'string' && entry.trim().length > 0);
                if (!valid) {
                    fail(`Shop "${shopId}" is missing dialogue "${key}".`);
                }
            });
        }

        const entries = Array.isArray(shop.items) ? shop.items : [];
        ensureUniqueIds(entries, `Shop "${shopId}" items`, entry => normalizeId(entry.itemId));
        entries.forEach(entry => {
            const itemId = normalizeId(entry.itemId);
            if (!itemIds.has(itemId)) {
                fail(`Shop "${shopId}" references unknown item "${entry.itemId}".`);
            }
            if (!Number.isInteger(entry.price) || entry.price < 0) {
                fail(`Shop "${shopId}" item "${itemId}" requires a non-negative integer price.`);
            }
            if (!Number.isInteger(entry.stock) || entry.stock < 0) {
                fail(`Shop "${shopId}" item "${itemId}" requires a non-negative integer stock.`);
            }
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

        validateNoLegacySatietyKeys(action.effects, `Action "${actionId}" effects`);
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
    const socketKinds = new Set(['seat', 'sleep', 'hold', 'surface', 'mount']);
    ensureUniqueIds(typeEntries, 'data/map-objects/types.json types', ([typeId]) => normalizeTypeId(typeId));
    validateSpatialRegions(baseConfig.spatial, 'Map object base config');

    typeEntries.forEach(([typeId, config]) => {
        validateSpatialRegions(config.spatial, `Map object type "${typeId}"`);
        validateNoLegacySatietyKeys(config.effects, `Map object type "${typeId}" effects`);
        Object.entries(config.variantConfigs ?? {}).forEach(([variantId, variantConfig]) => {
            validateNoLegacySatietyKeys(variantConfig?.effects, `Map object type "${typeId}" variant "${variantId}" effects`);
        });
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

        if (config.sockets !== undefined) {
            if (!isPlainObject(config.sockets)) {
                fail(`Map object type "${typeId}" has non-object sockets.`);
            } else {
                Object.entries(config.sockets).forEach(([socketId, socket]) => {
                    const label = `Map object type "${typeId}" socket "${socketId}"`;
                    if (!isPlainObject(socket) || !socketKinds.has(socket.kind)) {
                        fail(`${label} has an invalid kind.`);
                        return;
                    }
                    if (socket.kind === 'surface') {
                        if (!Array.isArray(socket.area?.xFactor) || !Array.isArray(socket.area?.yFactor) ||
                            socket.area.xFactor.length !== 2 || socket.area.yFactor.length !== 2) {
                            fail(`${label} surface sockets require two-factor x/y areas.`);
                        }
                    } else if (!isPlainObject(socket.position) ||
                        !Number.isFinite(Number(socket.position.xFactor)) ||
                        !Number.isFinite(Number(socket.position.yFactor))) {
                        fail(`${label} point sockets require numeric x/y position factors.`);
                    }
                    if (socket.accepts !== undefined &&
                        (!Array.isArray(socket.accepts) || socket.accepts.some(value => typeof value !== 'string'))) {
                        fail(`${label}.accepts must be an array of strings.`);
                    }
                    if (socket.capacity !== undefined && (!Number.isInteger(socket.capacity) || socket.capacity < 1)) {
                        fail(`${label}.capacity must be a positive integer.`);
                    }
                    if (socket.byFacing !== undefined) {
                        if (!isPlainObject(socket.byFacing)) {
                            fail(`${label}.byFacing must be a plain object.`);
                        } else {
                            Object.entries(socket.byFacing).forEach(([facing, override]) => {
                                if (!['N', 'S', 'E', 'W'].includes(facing) ||
                                    (override !== null && !isPlainObject(override))) {
                                    fail(`${label}.byFacing has invalid "${facing}" override.`);
                                }
                            });
                        }
                    }
                    validateSocketApproach(socket, label);
                });

                const surfaceConfig = config.actionConfigs?.use_surface_slot;
                const legacySlotKeys = [
                    'slots', 'slotsByFacing', 'mytePosition', 'myteFacing', 'exclusive',
                    'entryGap', 'exitGap', 'exitSearchRadius', 'returnToEntry',
                    'stuckCompletionDistance', 'maxFinalAdjustmentDistance'
                ];
                legacySlotKeys.forEach(key => {
                    if (surfaceConfig && Object.hasOwn(surfaceConfig, key)) {
                        fail(`Map object type "${typeId}" uses sockets but retains legacy use_surface_slot.${key}.`);
                    }
                });
            }
        }

        const hasDirectionalSockets = Object.values(config.variantConfigs ?? {}).some(variant =>
            Object.values(variant?.directionConfigs ?? {}).some(direction => direction?.sockets)
        );
        Object.entries(config.variantConfigs ?? {}).forEach(([variantId, variant]) => {
            validateSpatialRegions(variant?.spatial, `Map object type "${typeId}" variant "${variantId}"`);
            Object.entries(variant?.directionConfigs ?? {}).forEach(([facing, direction]) => {
                validateSpatialRegions(
                    direction?.spatial,
                    `Map object type "${typeId}" variant "${variantId}" facing "${facing}"`
                );
                if (Object.hasOwn(direction ?? {}, 'mytePosition') || Object.hasOwn(direction ?? {}, 'myteFacing')) {
                    fail(`Map object type "${typeId}" variant "${variantId}" facing "${facing}" retains legacy myte rest fields.`);
                }
                if (direction?.sockets === undefined) return;
                if (!isPlainObject(direction.sockets)) {
                    fail(`Map object type "${typeId}" variant "${variantId}" facing "${facing}" has non-object sockets.`);
                    return;
                }
                Object.entries(direction.sockets).forEach(([socketId, socket]) => {
                    const label = `Map object type "${typeId}" variant "${variantId}" facing "${facing}" socket "${socketId}"`;
                    if (!isPlainObject(socket) || !socketKinds.has(socket.kind)) {
                        fail(`${label} has an invalid kind.`);
                    } else if (socket.kind !== 'surface' &&
                        (!isPlainObject(socket.position) ||
                            !Number.isFinite(Number(socket.position.xFactor)) ||
                            !Number.isFinite(Number(socket.position.yFactor)))) {
                        fail(`${label} point sockets require numeric x/y position factors.`);
                    }
                    validateSocketApproach(socket, label);
                });
            });
        });

        if (typeId === 'BED') {
            const expectedSidesByFacing = {
                S: ['left', 'right'],
                N: ['left', 'right'],
                E: ['top', 'bottom'],
                W: ['top', 'bottom']
            };
            Object.entries(config.variantConfigs ?? {}).forEach(([variantId, variant]) => {
                Object.entries(expectedSidesByFacing).forEach(([facing, expectedSides]) => {
                    const actualSides = variant.directionConfigs?.[facing]?.sockets?.sleep?.approach?.allowedSides;
                    if (!Array.isArray(actualSides) || actualSides.join(',') !== expectedSides.join(',')) {
                        fail(`BED variant "${variantId}" facing "${facing}" must approach from its lateral sides.`);
                    }
                });
            });
        }

        if (hasDirectionalSockets) {
            const surfaceConfig = config.actionConfigs?.use_surface_slot;
            const legacySlotKeys = [
                'slots', 'slotsByFacing', 'mytePosition', 'myteFacing', 'exclusive',
                'entryGap', 'exitGap', 'exitSearchRadius', 'returnToEntry',
                'stuckCompletionDistance', 'maxFinalAdjustmentDistance'
            ];
            legacySlotKeys.forEach(key => {
                if (surfaceConfig && Object.hasOwn(surfaceConfig, key)) {
                    fail(`Map object type "${typeId}" uses directional sockets but retains legacy use_surface_slot.${key}.`);
                }
            });
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

function validateZones() {
    const zoneCatalog = readJson('data/metadata/zones.json');
    if (!zoneCatalog) return;

    (zoneCatalog.zones ?? []).forEach((zone) => {
        validateNoLegacySatietyKeys(zone?.effects, `Zone "${zone?.id ?? 'unknown'}" effects`);
    });
}

function validateAudioPresets() {
    const presets = readJson('data/metadata/audio-presets.json');
    if (!isPlainObject(presets) || Object.keys(presets).length === 0) {
        fail('data/metadata/audio-presets.json must contain at least one preset.');
        return;
    }

    const visitReferences = (value, nodeIds, label) => {
        if (Array.isArray(value)) {
            value.forEach((entry, index) => visitReferences(entry, nodeIds, `${label}[${index}]`));
            return;
        }
        if (!isPlainObject(value)) return;
        if (value.$node && !nodeIds.has(value.$node)) {
            fail(`${label} references unknown audio node "${value.$node}".`);
        }
        Object.entries(value).forEach(([key, entry]) => visitReferences(entry, nodeIds, `${label}.${key}`));
    };

    Object.entries(presets).forEach(([presetId, preset]) => {
        const label = `Audio preset "${presetId}"`;
        if (!isPlainObject(preset)) {
            fail(`${label} must be a plain object.`);
            return;
        }
        if (typeof preset.type !== 'string') fail(`${label}.type must be a string.`);
        if (preset.factory === 'footstep') {
            if (!isPlainObject(preset.options)) fail(`${label}.options must be a plain object.`);
            return;
        }
        if (preset.factory !== 'graph' || !Array.isArray(preset.graph?.nodes)) {
            fail(`${label} must use a graph or footstep factory.`);
            return;
        }

        const nodeIds = new Set();
        preset.graph.nodes.forEach((node, index) => {
            if (!isPlainObject(node) || typeof node.id !== 'string' || typeof node.type !== 'string') {
                fail(`${label}.graph.nodes[${index}] requires string id and type.`);
                return;
            }
            if (nodeIds.has(node.id)) fail(`${label} duplicates node id "${node.id}".`);
            nodeIds.add(node.id);
        });
        preset.graph.nodes.forEach((node, index) => {
            (node.connections ?? []).forEach(targetId => {
                if (!nodeIds.has(targetId)) {
                    fail(`${label}.graph.nodes[${index}] connects to unknown node "${targetId}".`);
                }
            });
            visitReferences(node.args, nodeIds, `${label}.graph.nodes[${index}].args`);
        });
        visitReferences(preset.output, nodeIds, `${label}.output`);
    });
}

function validateRegionFixture() {
	const fixturePath = 'data/maps/RegionTest.tmx';
	if (!exists(fixturePath)) {
		fail(`${fixturePath} is required as the authored irregular-room acceptance fixture.`);
		return;
	}

	const source = readText(fixturePath);
	const match = source.match(/<property\s+name="tilemask"\s+value="([^"]+)"\s*\/>/i);
	if (!match) {
		fail(`${fixturePath} must author a compact tilemask property.`);
		return;
	}

	const rows = match[1].split(/[\/;\r\n]+/).map(row => row.trim()).filter(Boolean);
	const occupied = new Set();
	rows.forEach((row, y) => [...row].forEach((value, x) => {
		if (value === '1' || value === '#') occupied.add(`${x},${y}`);
	}));
	if (!occupied.has('0,0') || !occupied.has('2,0') || !occupied.has('0,2')) {
		fail(`${fixturePath} tilemask must include both arms of the L-shaped room.`);
	}
	if (occupied.has('1,1')) {
		fail(`${fixturePath} tilemask concave corner must remain outside the room.`);
	}
}

function validateInteriorRooms() {
    const mapsDir = path.join(repoRoot, 'data/maps');
    for (const fileName of fs.readdirSync(mapsDir).filter(name => name.endsWith('.tmx'))) {
        const source = fs.readFileSync(path.join(mapsDir, fileName), 'utf8');
        const location = source.match(/<property\s+name="location"\s+value="([^"]+)"\s*\/>/i)?.[1]?.toLowerCase();
        if (!['interior', 'inside', 'house'].includes(location)) continue;
        // `Room` is the current spelling; `LIGHTVOLUME` is the lighting-era one
        // the loader still accepts, so both count as authoring a room volume.
        const authorsRoom = /<object\b[^>]*\bname="(?:ROOM|LIGHTVOLUME)"/i.test(source) ||
            /<property\s+name="(?:lightingKind|kind)"\s+value="room"\s*\/>/i.test(source);
        if (!authorsRoom) warn(`data/maps/${fileName} is interior but authors no room volumes.`);
    }
}

// Wall fixtures ship twice on purpose: the wall registry indexes the atlas with
// a `piece` rect, while the same art as a MAP OBJECT goes through the ordinary
// sprite pipeline, which reads a file per variant and sets no background
// position. `generate-wall-sprites.js` emits both from one buffer, so they
// cannot drift on their own — but hand-editing one and not the other is exactly
// how a spritesheet gets out of step, so the two are compared here.
function decodePng(relPath) {
    const buffer = fs.readFileSync(path.join(repoRoot, relPath));
    let offset = 8;
    let width = 0;
    let height = 0;
    let depth = 0;
    let colorType = 0;
    const parts = [];
    while (offset + 8 <= buffer.length) {
        const length = buffer.readUInt32BE(offset);
        const type = buffer.toString('ascii', offset + 4, offset + 8);
        const data = buffer.subarray(offset + 8, offset + 8 + length);
        if (type === 'IHDR') {
            width = data.readUInt32BE(0);
            height = data.readUInt32BE(4);
            depth = data[8];
            colorType = data[9];
        }
        if (type === 'IDAT') parts.push(data);
        offset += 12 + length;
    }
    if (depth !== 8 || colorType !== 6) return null;   // only the 8-bit RGBA the generator writes
    const raw = zlib.inflateSync(Buffer.concat(parts));
    const stride = width * 4;
    const pixels = Buffer.alloc(height * stride);
    for (let y = 0; y < height; y++) {
        const filter = raw[y * (stride + 1)];
        const line = raw.subarray((y * (stride + 1)) + 1, (y + 1) * (stride + 1));
        for (let x = 0; x < stride; x++) {
            const a = x >= 4 ? pixels[(y * stride) + x - 4] : 0;
            const b = y > 0 ? pixels[((y - 1) * stride) + x] : 0;
            const c = (x >= 4 && y > 0) ? pixels[((y - 1) * stride) + x - 4] : 0;
            let value = line[x];
            if (filter === 1) value += a;
            else if (filter === 2) value += b;
            else if (filter === 3) value += (a + b) >> 1;
            else if (filter === 4) {
                const p = a + b - c;
                const pa = Math.abs(p - a);
                const pb = Math.abs(p - b);
                const pc = Math.abs(p - c);
                value += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
            }
            pixels[(y * stride) + x] = value & 255;
        }
    }
    return { width, height, pixels };
}

// The finish sheet is hand-editable art holding load-bearing geometry, and every
// way it can go wrong is invisible until it reaches a wall: a band that stops
// following the foot, a column filled where it should be transparent, an end
// that no longer tiles into the body. Runtime clipping hides most of it, so the
// invariants are asserted here against the authored pixels.
// Floor finishes. Much less to police than walls — a floor tile has no
// silhouette to agree with — but the recolour contract still bites: every pixel
// must be one of the declared palette tones, or a template floor keeps stray
// pixels at the TEMPLATE's colour and the borrowed floor comes out speckled
// with someone else's palette.
function validateFloorMaterials() {
    const filePath = 'data/map-objects/floor-materials.json';
    if (!exists(filePath)) return;
    const data = readJson(filePath);
    if (!isPlainObject(data) || data.schemaVersion !== 1) {
        fail(`${filePath} must use schemaVersion 1.`);
        return;
    }
    if (data.tileSheet && !exists(data.tileSheet)) {
        fail(`${filePath} references missing ${data.tileSheet}.`);
        return;
    }
    const size = Number(data.tileSize) || 32;
    const sheet = data.tileSheet ? decodePng(data.tileSheet) : null;
    if (sheet && sheet.height !== size) {
        fail(`${data.tileSheet} is ${sheet.height}px tall; floor tiles must be ${size}px square.`);
    }

    for (const [id, finish] of Object.entries(data.finishes || {})) {
        const indexed = Number.isInteger(finish.tile);
        if (indexed === (typeof finish.template === 'string')) {
            fail(`${filePath} finish "${id}" needs exactly one of "tile" or "template".`);
            continue;
        }
        if (finish.palette && Object.values(finish.palette).some(c => !/^#[0-9a-f]{6}$/i.test(c))) {
            fail(`${filePath} finish "${id}" palette slots must be #rrggbb.`);
        }
        if (typeof finish.template === 'string') {
            const template = data.finishes?.[finish.template];
            if (!template?.palette?.body) {
                fail(`${filePath} finish "${id}" templates on "${finish.template}", which needs a palette with a "body" slot.`);
            }
            if (!/^#[0-9a-f]{3,8}$/i.test(finish.color || '')) {
                fail(`${filePath} finish "${id}" templates on "${finish.template}" and must declare a "color".`);
            }
            continue;
        }
        if (!sheet) continue;
        if ((finish.tile + 1) * size > sheet.width) {
            fail(`${data.tileSheet} has no tile ${finish.tile} for finish "${id}".`);
            continue;
        }
        // A palette is only needed to be BORROWED from. A hand-drawn tile that
        // no template points at can use any colours it likes, so the tone check
        // only runs once the finish opts in by declaring one. The opacity check
        // always runs: a hole shows the map's own ground through the room.
        const declared = isPlainObject(finish.palette) && Object.keys(finish.palette).length > 0;
        const borrowedBy = Object.entries(data.finishes)
            .filter(([, other]) => other.template === id)
            .map(([otherId]) => otherId);
        if (!declared && borrowedBy.length) {
            fail(`${filePath} finish "${id}" is used as a template by ${borrowedBy.join(', ')}, ` +
                'so it must declare the palette they recolour through.');
        }
        const tones = Object.values(finish.palette || {}).map(c =>
            [1, 3, 5].map(i => parseInt(c.substr(i, 2), 16)));
        let undeclared = 0;
        let transparent = 0;
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const i = (((y * sheet.width) + (finish.tile * size) + x) * 4);
                if (sheet.pixels[i + 3] !== 255) { transparent++; continue; }
                if (!declared) continue;
                const known = tones.some(t => [0, 1, 2].every(k => sheet.pixels[i + k] === t[k]));
                if (!known) undeclared++;
            }
        }
        if (transparent) {
            fail(`${data.tileSheet} tile ${finish.tile} ("${id}") has ${transparent} non-opaque pixels; ` +
                "a floor tile must be solid or the map's own ground shows through the room.");
        }
        if (undeclared) {
            fail(`${data.tileSheet} tile ${finish.tile} ("${id}") uses ${undeclared} pixels that are not in its ` +
                'declared palette. Every tone must be declared or a template borrowing this tile keeps ' +
                "them at this finish's colour.");
        }
    }
}

function validateRoofMaterials() {
    const filePath = 'data/map-objects/roof-materials.json';
    if (!exists(filePath)) return;
    const data = readJson(filePath);
    if (!isPlainObject(data) || data.schemaVersion !== 1 || !isPlainObject(data.finishes)) {
        fail(`${filePath} must use schemaVersion 1 and declare finishes.`);
        return;
    }
    const size = Number(data.tileSize) || 32;
    const colors = data.colors || {};
    for (const [id, color] of Object.entries(colors)) {
        if (!/^#[0-9a-f]{6}$/i.test(color)) fail(`${filePath} colour "${id}" must be #rrggbb.`);
    }
    for (const [id, finish] of Object.entries(data.finishes)) {
        if (!!finish.sheet === (typeof finish.template === 'string')) {
            fail(`${filePath} finish "${id}" needs exactly one of "sheet" or "template".`);
        }
        if (finish.sheet) {
            if (!exists(finish.sheet)) {
                fail(`${filePath} references missing ${finish.sheet}.`);
                continue;
            }
            const sheet = decodePng(finish.sheet);
            if (sheet && (sheet.width !== size * 16 || sheet.height !== size * 13)) {
                fail(`${finish.sheet} must be a 16x13 atlas of ${size}px roof tiles.`);
            }
            const required = ['body', 'line', 'shade', 'light', 'edge'];
            if (required.some(slot => !/^#[0-9a-f]{6}$/i.test(finish.palette?.[slot] || ''))) {
                fail(`${filePath} finish "${id}" must declare the five #rrggbb palette slots.`);
            }
        } else if (!data.finishes[finish.template]?.sheet) {
            fail(`${filePath} finish "${id}" templates on unknown direct finish "${finish.template}".`);
        }
        for (const swatch of finish.swatches || []) if (!colors[swatch]) {
            fail(`${filePath} finish "${id}" references unknown colour "${swatch}".`);
        }
    }
    const styles = new Set(['flat', 'hip', 'gable']);
    for (const fileName of fs.readdirSync('data/maps').filter(name => name.endsWith('.tmx'))) {
        const source = readText(`data/maps/${fileName}`);
        for (const match of source.matchAll(/<property\s+name="roofStyle"\s+value="([^"]+)"/gi)) {
            if (!styles.has(match[1])) fail(`${fileName} uses unknown roof style "${match[1]}".`);
        }
        for (const match of source.matchAll(/<property\s+name="roofFinishId"\s+value="([^"]+)"/gi)) {
            if (!data.finishes[match[1]]) fail(`${fileName} uses unknown roof material "${match[1]}".`);
        }
    }
}

function validateWallPaintSheet(data) {
    const construction = Object.values(data.constructions || {})[0];
    if (!data.paintSheet || !exists(data.paintSheet) || !construction) return;
    const sheet = decodePng(data.paintSheet);
    if (!sheet) return;

    const cell = construction.cellSize;
    if (sheet.height !== construction.frameHeight) {
        fail(`${data.paintSheet} is ${sheet.height}px tall; finish columns must be frameHeight ` +
            `(${construction.frameHeight}) so a swatch row is a frame row.`);
        return;
    }

    const alphaAt = (x, y) => sheet.pixels[(((y * sheet.width) + x) * 4) + 3];
    const samePixel = (ax, ay, bx, by) => {
        const a = (((ay * sheet.width) + ax) * 4);
        const b = (((by * sheet.width) + bx) * 4);
        return [0, 1, 2, 3].every(k => sheet.pixels[a + k] === sheet.pixels[b + k]);
    };
    // The opaque run of one pixel column, plus whether it is broken.
    const runOf = (index, x) => {
        const px = (index * cell) + x;
        let first = -1;
        let last = -1;
        let broken = false;
        for (let y = 0; y < sheet.height; y++) {
            if (!alphaAt(px, y)) continue;
            if (first < 0) first = y;
            else if (y !== last + 1) broken = true;
            last = y;
        }
        return { first, last, broken };
    };

    // Each finish column is authored against one mask's silhouette — the same
    // pairing generate-wall-sprites.js uses. Reading it back off the
    // construction art keeps the wall's geometry in exactly one place.
    const SOURCE_MASK = { west: 2, body: 10, east: 8, westStop: 6, eastStop: 12 };
    const constructionArt = decodePng(construction.sheet);
    // The same rule WallMaterialRegistry.buildPaintMask applies: the cap is
    // always structure, and `unpaintableColors` names any other colour the art
    // keeps for itself — an outline, typically. Both sides have to agree, or the
    // validator checks the paint against a silhouette the renderer will not use.
    const reservedColors = [construction.capColor, ...(construction.unpaintableColors || [])]
        .filter(Boolean)
        .map(hex => [1, 3, 5].map(i => parseInt(hex.substr(i, 2), 16)));
    // `paintable` is what the finish must cover: opaque, minus the reserved
    // colours. `opaque` is the wall's outer edge, reserved colours included.
    // With no outline the two are the same profile, which is why one used to do.
    const silhouetteFor = (mask, includeReserved) => {
        if (!constructionArt || !Number.isInteger(construction.maskMap?.[mask])) return null;
        const baseY = construction.bands?.full?.baseY || 0;
        const column = construction.maskMap[mask] * cell;
        const profile = [];
        for (let x = 0; x < cell; x++) {
            let foot = -1;
            for (let y = 0; y < construction.frameHeight; y++) {
                const i = ((((baseY + y) * constructionArt.width) + column + x) * 4);
                if (constructionArt.pixels[i + 3] === 0) continue;
                const reserved = reservedColors.some(c =>
                    [0, 1, 2].every(k => constructionArt.pixels[i + k] === c[k]));
                // The cap is the wall's top, never its foot — it must not extend
                // the outer edge the paint is measured against.
                const isCap = [0, 1, 2].every(k => constructionArt.pixels[i + k] === reservedColors[0][k]);
                if (!reserved || (includeReserved && !isCap)) foot = y;
            }
            profile.push(foot);
        }
        return profile;
    };
    const silhouettes = Object.fromEntries(
        Object.entries(SOURCE_MASK).map(([name, mask]) => [name, silhouetteFor(mask, false)])
    );
    const outerSilhouettes = Object.fromEntries(
        Object.entries(SOURCE_MASK).map(([name, mask]) => [name, silhouetteFor(mask, true)])
    );

    const names = ['west', 'body', 'east', 'westStop', 'eastStop'];
    for (const [id, finish] of Object.entries(data.finishes || {})) {
        if (!isPlainObject(finish.swatch)) continue;

        const columns = {};
        for (const name of names) {
            const index = finish.swatch[name];
            if (!Number.isInteger(index)) continue;
            if ((index + 1) * cell > sheet.width) {
                fail(`${data.paintSheet} has no column ${index} for finish "${id}" (${name}).`);
                continue;
            }
            columns[name] = index;
        }

        const band = /^#[0-9a-f]{6}$/i.test(finish.palette?.band || '')
            ? [1, 3, 5].map(i => parseInt(finish.palette.band.substr(i, 2), 16))
            : null;

        for (const [name, index] of Object.entries(columns)) {
            const expected = silhouettes[name];
            const outer = outerSilhouettes[name];
            for (let x = 0; x < cell; x++) {
                const { first, last, broken } = runOf(index, x);
                const want = expected ? expected[x] : last;
                // Paint may end anywhere between the paintable foot and the
                // wall's outer foot: short of the first leaves bare wall, past
                // the second spills into the cell below. Between them it lands
                // on reserved pixels and the mask clips it away.
                const wantMax = outer ? Math.max(outer[x], want) : want;
                if (first < 0) {
                    if (want >= 0) {
                        fail(`${data.paintSheet} finish "${id}" column "${name}" x=${x} is empty, but the ` +
                            `construction has wall there down to row ${want}.`);
                        break;
                    }
                    continue;
                }
                if (want < 0) {
                    fail(`${data.paintSheet} finish "${id}" column "${name}" x=${x} is painted, but the ` +
                        'construction has no wall in that column. It must be transparent — do not fill it ' +
                        'because the paint mask clips it anyway.');
                    break;
                }
                if (first !== 0 || broken) {
                    fail(`${data.paintSheet} finish "${id}" column "${name}" x=${x} is not a single run ` +
                        'from row 0 to its foot. A finish column is opaque from row 0 down to that ' +
                        "column's own foot and transparent everywhere else.");
                    break;
                }
                if (last < want || last > wantMax) {
                    fail(`${data.paintSheet} finish "${id}" column "${name}" x=${x} ends at row ${last}, but ` +
                        `the silhouette it is authored against reaches row ${want}` +
                        (wantMax !== want ? ` (outer edge row ${wantMax})` : '') + '. ' +
                        (last < want ? 'Paint stops short of the foot.' : 'Paint runs past the foot into the cell below.'));
                    break;
                }
                // The band is what makes a foot read as a foot, so it has to END
                // on one. This is the check that catches a band left flat while
                // the silhouette curves away from it.
                if (band && last === want) {
                    const foot = (((last * sheet.width) + (index * cell) + x) * 4);
                    if (![0, 1, 2].every(k => sheet.pixels[foot + k] === band[k])) {
                        fail(`${data.paintSheet} finish "${id}" column "${name}" x=${x} does not end on its ` +
                            'declared band colour; the band must sit on the foot, following it wherever it curves.');
                        break;
                    }
                }
            }
        }

        // An end column is drawn over the body on its own half of a cell, so
        // anywhere its foot matches the body's it must BE the body — otherwise
        // the overwrite shows up as a step in the middle of a run.
        const halves = { west: [0, Math.floor(cell / 2)], east: [Math.ceil(cell / 2), cell] };
        for (const [name, [from, to]] of Object.entries(halves)) {
            if (!(name in columns) || !('body' in columns)) continue;
            for (let x = from; x < to; x++) {
                const end = runOf(columns[name], x);
                const body = runOf(columns.body, x);
                if (end.first < 0 || end.last !== body.last) continue;   // geometry differs: end art is the point
                const matches = Array.from({ length: sheet.height }, (unused, y) =>
                    samePixel((columns[name] * cell) + x, y, (columns.body * cell) + x, y)).every(Boolean);
                if (!matches) {
                    fail(`${data.paintSheet} finish "${id}" column "${name}" x=${x} differs from "body" where ` +
                        'their feet agree. An end column must match the body away from its free edge or it ' +
                        'steps mid-run.');
                    break;
                }
            }
        }
    }
}

function validateWallFixtureCopies(data) {
    const filePath = 'data/map-objects/wall-materials.json';
    // Any map-object type may carry a wall fixture, so collect them all rather
    // than reaching for PAINTING by name.
    const types = readJson('data/map-objects/types.json') || {};
    const standalone = new Map();
    for (const type of Object.values(types)) {
        for (const config of Object.values(type?.variantConfigs || {})) {
            const url = config?.visual?.spriteSheet?.url;
            if (config?.wallFixtureId && url) standalone.set(config.wallFixtureId, url);
        }
    }

    for (const [id, fixture] of Object.entries(data.fixtures || {})) {
        const copy = standalone.get(id);
        if (!copy || !fixture.sheet || !fixture.piece) continue;
        if (!exists(copy)) {
            fail(`${filePath} fixture "${id}" has no standalone sprite at ${copy}.`);
            continue;
        }
        const atlas = decodePng(fixture.sheet);
        const single = decodePng(copy);
        if (!atlas || !single) continue;
        if (single.width !== fixture.piece.w || single.height !== fixture.piece.h) {
            fail(`${copy} is ${single.width}x${single.height} but fixture "${id}" declares ${fixture.piece.w}x${fixture.piece.h}.`);
            continue;
        }
        let differs = 0;
        for (let y = 0; y < single.height; y++) {
            for (let x = 0; x < single.width * 4; x++) {
                const from = (((fixture.piece.y + y) * atlas.width) + fixture.piece.x) * 4;
                if (atlas.pixels[from + x] !== single.pixels[(y * single.width * 4) + x]) differs++;
            }
        }
        if (differs) {
            fail(`${copy} no longer matches fixture "${id}" in ${fixture.sheet} (${differs} bytes differ). ` +
                'Re-run scripts/generate-wall-sprites.js so both copies come from one source.');
        }
    }
}

function validateWallMaterials() {
    const filePath = 'data/map-objects/wall-materials.json';
    const data = readJson(filePath);
    if (!isPlainObject(data) || data.schemaVersion !== 3) {
        fail(`${filePath} must use schemaVersion 3.`);
        return;
    }
    // Only the two authored bands ship as art; transitions and paint masks are
    // derived from them at load (see WallMaterialRegistry).
    const authoredBands = ['full', 'stub'];
    for (const [id, construction] of Object.entries(data.constructions || {})) {
        if (!Array.isArray(construction.maskMap) || construction.maskMap.length !== 16 ||
            construction.maskMap.some(column => !Number.isInteger(column) || column < 0 || column > 15)) {
            fail(`${filePath} construction "${id}" must map every neighbor mask 0-15.`);
        }
        for (const state of ['rampDown', 'rampUp']) {
            if (!Number.isInteger(construction.transitionColumns?.[state])) {
                fail(`${filePath} construction "${id}" is missing the "${state}" transition column.`);
            }
        }
        for (const band of authoredBands) {
            if (!Number.isFinite(construction.bands?.[band]?.baseY)) {
                fail(`${filePath} construction "${id}" is missing the "${band}" band.`);
            }
        }
        if (!/^#[0-9a-f]{6}$/i.test(construction.capColor || '')) {
            fail(`${filePath} construction "${id}" needs a capColor so paint masks can be derived.`);
        }
        if (construction.unpaintableColors !== undefined) {
            if (!Array.isArray(construction.unpaintableColors) ||
                construction.unpaintableColors.some(hex => !/^#[0-9a-f]{6}$/i.test(hex || ''))) {
                fail(`${filePath} construction "${id}" unpaintableColors must be an array of #rrggbb colours.`);
            }
        }
        if (construction.debugSheet && !exists(construction.debugSheet)) {
            fail(`${filePath} references missing ${construction.debugSheet}.`);
        }
        if (!Number.isFinite(construction.frameHeight) ||
            !Number.isFinite(construction.baselineRow) ||
            construction.baselineRow >= construction.frameHeight) {
            fail(`${filePath} construction "${id}" requires frameHeight and a baselineRow inside it.`);
        }
        if (construction.height !== 160 || construction.stubHeight !== 28 || construction.cellSize !== 32) {
            fail(`${filePath} prototype construction "${id}" must be 32x160 with a 28px stub.`);
        }
        if (!Number.isFinite(construction.thickness) || construction.thickness <= 0) {
            fail(`${filePath} construction "${id}" requires a positive thickness.`);
        }
        if (construction.debugMaskColors || construction.debugMaskLabels) {
            fail(`${filePath} construction "${id}" still uses v2 debug keys; move them into "debug".`);
        }
        const debug = construction.debug;
        if (debug && (!Array.isArray(debug.maskLabels) || debug.maskLabels.length !== 16)) {
            fail(`${filePath} construction "${id}" debug block must label all 16 masks.`);
        }
        if (!exists(construction.sheet)) fail(`${filePath} references missing ${construction.sheet}.`);
    }
    // A finish authors three columns — west end, body, east end — so its own
    // structure decides how it resolves where the wall runs out. A bare integer
    // still means "body only", and a colour-only finish templates on one that
    // has art rather than inventing flat bands of its own.
    const swatchColumns = ['west', 'body', 'east'];
    // Optional: art for where the finish stops against a post while the wall
    // itself runs on. Falls back to the body column when a finish omits it.
    const stopColumns = ['westStop', 'eastStop'];
    for (const [id, finish] of Object.entries(data.finishes || {})) {
        const columnSet = isPlainObject(finish.swatch) &&
            swatchColumns.every(name => Number.isInteger(finish.swatch[name]));
        if (isPlainObject(finish.swatch) && !columnSet) {
            fail(`${filePath} finish "${id}" swatch must index all of ${swatchColumns.join(', ')}.`);
        }
        if (columnSet && stopColumns.some(name => name in finish.swatch &&
            !Number.isInteger(finish.swatch[name]))) {
            fail(`${filePath} finish "${id}" stop columns must be column indices.`);
        }
        const indexed = Number.isInteger(finish.swatch) || columnSet;
        const hasSwatch = indexed || (typeof finish.swatch === 'string' && finish.swatch.length > 0);
        if (hasSwatch === (typeof finish.template === 'string')) {
            fail(`${filePath} finish "${id}" needs exactly one of "swatch" or "template".`);
        }
        if (typeof finish.swatch === 'string' && !exists(finish.swatch)) {
            fail(`${filePath} references missing ${finish.swatch}.`);
        }
        if (indexed && !data.paintSheet) {
            fail(`${filePath} finish "${id}" indexes a paint sheet, but none is declared.`);
        }
        if (finish.palette && Object.values(finish.palette).some(color => !/^#[0-9a-f]{6}$/i.test(color))) {
            fail(`${filePath} finish "${id}" palette slots must be #rrggbb.`);
        }
        if (typeof finish.template === 'string') {
            const template = data.finishes?.[finish.template];
            if (!template?.palette?.body) {
                fail(`${filePath} finish "${id}" templates on "${finish.template}", which needs a palette with a "body" slot.`);
            }
            if (!/^#[0-9a-f]{3,8}$/i.test(finish.color || '')) {
                fail(`${filePath} finish "${id}" templates on "${finish.template}" and must declare a "color".`);
            }
        }
        if (finish.sheet || finish.maskMap || finish.bands) {
            fail(`${filePath} finish "${id}" still uses the v2 per-mask sheet form.`);
        }
    }
    if (data.paintSheet && !exists(data.paintSheet)) {
        fail(`${filePath} references missing ${data.paintSheet}.`);
    }

    validateWallPaintSheet(data);
    validateWallFixtureCopies(data);

    const house = readText('data/maps/House.tmx');
    const wallTileset = readText('data/tilesets/walls3.tsx');
    if (!/name="wallTileset"[^>]+value="true"/i.test(wallTileset)) {
        fail('The authored wall tileset requires wallTileset=true.');
    }
    if (!/<wangset name="Wall"/i.test(wallTileset)) {
        fail('The authored wall tileset requires the canonical Wall Wang set.');
    }
    for (const property of ['wallConstructionId', 'wallFinishId', 'wallHeightCells', 'wallConnectGroup', 'blocksLineOfSight']) {
        if (!new RegExp(`name="${property}"`, 'i').test(house)) fail(`House.tmx wall defaults require ${property}.`);
    }
    // Wall fixtures are real map objects now, authored like any other object.
    if (!/name="Painting"/i.test(house)) fail('House.tmx requires its painting wall fixtures.');
    if (!/displayName" value="Bedroom"[\s\S]+wallFinishId" value="wallpaper_blue_flower"/i.test(house)) {
        fail('House.tmx Bedroom requires its room-level wallpaper finish example.');
    }
}

function run() {
    validateNoLegacyFiles();
    validateMytes();
    validateItems();
    validateShops();
    validateActions();
    validateMapObjects();
    validateZones();
    validateAudioPresets();
	validateRegionFixture();
    validateInteriorRooms();
    validateWallMaterials();
    validateFloorMaterials();
    validateRoofMaterials();

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
