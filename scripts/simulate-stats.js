const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = path.resolve(__dirname, '..');
const stepMs = 50;
const sampleIntervalMs = 15 * 60 * 1000;
const trackedStats = [
    ['health', 'Health'],
    ['energy', 'Energy'],
    ['fun', 'Fun'],
    ['social', 'Social'],
    ['satiety', 'Satiety'],
    ['comfort', 'Comfort'],
    ['confidence', 'Confidence']
];

function readText(relPath) {
    return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
}

function readJson(relPath) {
    return JSON.parse(readText(relPath));
}

function createRuntime() {
    const actionDefinitions = readJson('data/metadata/actions.json').actions || [];
    const actionsById = new Map(actionDefinitions.map(action => [action.id, action]));
    const context = {
        console,
        Math,
        Date,
        JSON,
        Number,
        String,
        Boolean,
        Array,
        Object,
        Map,
        Set,
        WeakMap,
        WeakSet,
        Promise,
        performance: { now: () => 0 },
        window: {},
        document: {
            body: { classList: { contains: () => false } },
            createElement: () => ({
                classList: { add() {}, remove() {}, toggle() {} },
                setAttribute() {},
                style: {}
            }),
            getElementById: () => null,
            querySelector: () => null
        },
        navigator: { userAgent: 'node' },
        requestAnimationFrame: (cb) => setTimeout(cb, 0),
        cancelAnimationFrame: (id) => clearTimeout(id),
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval
    };

    context.window = context;
    vm.createContext(context);

    for (const relPath of [
        'js/Utility/Utility.js',
        'js/Engine/SimClock.js',
        'js/Engine/Config/SiteConfig.js',
        'js/Myte/MyteStats.js'
    ]) {
        vm.runInContext(readText(relPath), context, { filename: relPath });
    }

    context.GameTime = { instance: { getCurrentHour: () => 12 } };
    context.ActionDefinitionRegistry = {
        getDefinitionSync: (actionId) => actionsById.get(actionId) ?? null
    };
    context.MOVE_TYPES = { FOLLOW: 'follow' };
    context.Utility = vm.runInContext('Utility', context);
    context.SimClock = vm.runInContext('SimClock', context);
    context.SiteConfig = vm.runInContext('SiteConfig', context);
    context.MyteStats = vm.runInContext('MyteStats', context);

    return context;
}

function getDefaultSpeciesDefinition() {
    const baseDefinition = readJson('data/mytes/myte.json');
    const speciesCatalog = readJson('data/mytes/species.json');
    const defaultSpeciesId = String(speciesCatalog.defaultSpeciesId || '').trim().toLowerCase();
    const entry = (speciesCatalog.species || []).find((species) =>
        String(species.id || species.speciesId || '').trim().toLowerCase() === defaultSpeciesId
    );
    const relPath = `data/mytes/${entry?.definitionFile || `${defaultSpeciesId || 'snail'}.json`}`;
    return deepMerge(baseDefinition, readJson(relPath));
}

function deepMerge(base, override) {
    if (!base || typeof base !== 'object') return override;
    if (!override || typeof override !== 'object') return override ?? base;
    if (Array.isArray(base) || Array.isArray(override)) return override;

    const merged = { ...base };
    for (const [key, value] of Object.entries(override)) {
        merged[key] = deepMerge(base[key], value);
    }
    return merged;
}

function createMyteStub(definition, { active = true, moving = false } = {}) {
    const simulationState = { moving, actionId: null };
    const myte = {
        id: 'sim-myte',
        definition,
        isActive: active,
        isDragging: false,
        goal: null,
        healthDepletionCount: 0,
        posX: 0,
        posY: 0,
        size: { width: 192, height: 192 },
        collider: { offsetX: 0, offsetY: 0, width: 64, height: 64 },
        parent: null,
        ai: {
            homeComfortRadius: definition?.ai?.safeAreaRadius ?? 100,
            lastDecisionTime: 0,
            handleEnergyDepleted() {}
        },
        queue: {
            getCurrentAction() {
                return simulationState.actionId
                    ? { constructor: { metadata: { id: simulationState.actionId } } }
                    : null;
            },
            isEmpty() { return true; },
            addToFront() {},
            interrupt() {},
            clear() {}
        },
        buffs: {
            getEffectValue(_path, fallback) { return fallback; },
            checkStatusTriggers() {},
            emitEvent() {}
        },
        dialogue: null,
        battery: null,
        slotBattery: null,
        playSound() {},
        isMoving() { return simulationState.moving; },
        setMode() { this.healthDepletionCount++; },
        getHomePosition() { return { x: 0, y: 0 }; },
        getDistanceToPoint(x, y) { return Math.hypot(this.posX - x, this.posY - y); }
    };

    myte.parent = { mytes: [myte] };
    myte.simulationState = simulationState;
    return myte;
}

function createStats(runtime, definition, options) {
    runtime.SimClock.reset();
    const myte = createMyteStub(definition, options);
    return { myte, stats: new runtime.MyteStats(myte) };
}

function getSnapshot(stats) {
    return {
        health: stats.health,
        energy: stats.energy,
        fun: stats.fun,
        social: stats.social,
        satiety: stats.satiety,
        comfort: stats.comfort,
        confidence: stats.confidence
    };
}

function getBounds(stats, key) {
    switch (key) {
        case 'health': return [stats.minHealth, stats.maxHealth];
        case 'energy': return [stats.minEnergy, stats.maxEnergy];
        case 'fun': return [stats.minFun, stats.maxFun];
        case 'social': return [stats.minSocial, stats.maxSocial];
        case 'satiety': return [stats.minSatiety, stats.maxSatiety];
        case 'comfort': return [stats.minComfort, stats.maxComfort];
        case 'confidence': return [stats.minConfidence, stats.maxConfidence];
        default: return [0, 0];
    }
}

function formatClock(ms) {
    const totalMinutes = Math.floor(ms / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}h ${String(minutes).padStart(2, '0')}m`;
}

function formatValue(key, value) {
    if (key === 'confidence') {
        return value.toFixed(3);
    }
    return value.toFixed(2);
}

function recordBounds(boundaryHits, previous, current, stats, elapsedMs) {
    for (const [key, label] of trackedStats) {
        const [min, max] = getBounds(stats, key);
        const hitMin = current[key] <= min && previous[key] > min;
        const hitMax = current[key] >= max && previous[key] < max;
        if (!boundaryHits.has(key) && (hitMin || hitMax)) {
            boundaryHits.set(key, `${label} reached ${hitMin ? 'min' : 'max'} at ${formatClock(elapsedMs)}`);
        }
    }
}

function simulate(stats, runtime, durationMs, updateFn, beforeStep = null) {
    const rows = [{ time: 0, ...getSnapshot(stats) }];
    const boundaryHits = new Map();
    let elapsedMs = 0;
    let nextSampleMs = sampleIntervalMs;
    let previous = getSnapshot(stats);
    const boundaryTimes = new Map();
    const moods = [];
    const minHits = new Set();
    let healthDepletionAt = null;

    while (elapsedMs < durationMs) {
        const delta = Math.min(stepMs, durationMs - elapsedMs);
        beforeStep?.({ elapsedMs, delta, stats });
        updateFn(delta);
        runtime.SimClock.advance(delta);
        elapsedMs += delta;

        const current = getSnapshot(stats);
        if (healthDepletionAt === null && stats.myte.healthDepletionCount > 0) {
            healthDepletionAt = elapsedMs;
        }
        for (const [key] of trackedStats) {
            if (current[key] <= getBounds(stats, key)[0]) minHits.add(key);
        }
        recordBounds(boundaryHits, previous, current, stats, elapsedMs);
        for (const [key] of trackedStats) {
            if (!boundaryTimes.has(key) && current[key] <= getBounds(stats, key)[0] && previous[key] > getBounds(stats, key)[0]) {
                boundaryTimes.set(key, elapsedMs);
            }
        }
        previous = current;

        if (elapsedMs >= nextSampleMs || elapsedMs === durationMs) {
            rows.push({ time: elapsedMs, ...current });
            moods.push(stats.getDerivedMood());
            nextSampleMs += sampleIntervalMs;
        }
    }

    return { rows, boundaryHits, boundaryTimes, moods, minHits, healthDepletionAt };
}

function simulateCareModel(stats, myte, runtime, durationMs, playAction) {
    const pending = { food: null, play: null, social: null };
    let restingForEnergy = false;
    return simulate(stats, runtime, durationMs, (delta) => stats.update(delta), ({ elapsedMs }) => {
        const state = myte.simulationState;
        if (stats.energy < 25) restingForEnergy = true;
        if (restingForEnergy && stats.energy >= 90) restingForEnergy = false;
        state.actionId = restingForEnergy ? 'sleep' : null;

        if (stats.satiety < 30 && pending.food === null) pending.food = elapsedMs + 8000;
        if (stats.fun < 30 && pending.play === null) pending.play = elapsedMs + 10000;
        if (stats.social < 30 && pending.social === null) pending.social = elapsedMs + 10000;

        if (pending.food !== null && elapsedMs >= pending.food) {
            stats.applyStatEffects({ satiety: 30 });
            pending.food = null;
        }
        if (pending.play !== null && elapsedMs >= pending.play) {
            stats.applyActionResult({
                funDelta: playAction?.effects?.fun ?? 8,
                socialDelta: playAction?.effects?.social ?? 0,
                energyDelta: playAction?.effects?.energy ?? 0,
                comfortDelta: playAction?.effects?.comfort ?? 0,
                satietyDelta: playAction?.effects?.satiety ?? 0,
                safeOutcome: true,
                failedOutcome: false,
                novelty: playAction?.traits?.novelty ?? 0
            });
            pending.play = null;
        }
        if (pending.social !== null && elapsedMs >= pending.social) {
            stats.applyActionResult({ socialDelta: 18, safeOutcome: true, failedOutcome: false });
            pending.social = null;
        }
    });
}

function findFullRecoveryTime(stats, runtime, maxDurationMs) {
    let elapsedMs = 0;
    let confidenceSaturatedAt = null;
    while (elapsedMs < maxDurationMs) {
        stats.updateInHomeSlot(stepMs);
        runtime.SimClock.advance(stepMs);
        elapsedMs += stepMs;
        if (confidenceSaturatedAt === null && stats.confidence >= stats.maxConfidence) {
            confidenceSaturatedAt = elapsedMs;
        }
        if (trackedStats.every(([key]) => stats[key] >= getBounds(stats, key)[1])) {
            return { elapsedMs, confidenceSaturatedAt };
        }
    }
    return { elapsedMs: null, confidenceSaturatedAt };
}

function findAppleSustainTime(stats, runtime) {
    stats.satiety = 0;
    stats.applyStatEffects({ satiety: 30 });
    let elapsedMs = 0;
    while (stats.satiety > 0 && elapsedMs < 2 * 60 * 60 * 1000) {
        stats.update(stepMs);
        runtime.SimClock.advance(stepMs);
        elapsedMs += stepMs;
    }
    return elapsedMs;
}

function assertSimulation(condition, message, failures) {
    if (!condition) failures.push(message);
}

function renderTable(title, rows) {
    const headers = ['Time', ...trackedStats.map(([, label]) => label)];
    const divider = headers.map(() => '---');
    const lines = [`### ${title}`, '', `| ${headers.join(' | ')} |`, `| ${divider.join(' | ')} |`];

    for (const row of rows) {
        lines.push(
            `| ${formatClock(row.time)} | ${trackedStats.map(([key]) => formatValue(key, row[key])).join(' | ')} |`
        );
    }

    return lines.join('\n');
}

function renderSummary(title, boundaryHits) {
    const lines = [`#### ${title} Summary`];
    if (boundaryHits.size === 0) {
        lines.push('', '- No tracked stat reached a min or max bound.');
        return lines.join('\n');
    }

    lines.push('');
    for (const message of boundaryHits.values()) {
        lines.push(`- ${message}`);
    }
    return lines.join('\n');
}

function main() {
    const runtime = createRuntime();
    const definition = getDefaultSpeciesDefinition();
    const actionCatalog = readJson('data/metadata/actions.json');
    const sleepAction = (actionCatalog.actions || []).find((action) => action.id === 'sleep');
    const playAction = (actionCatalog.actions || []).find((action) => action.id === 'play_fetch');

    const home = createStats(runtime, definition, { active: false, moving: false });
    const homeResult = simulate(home.stats, runtime, 8 * 60 * 60 * 1000, (delta) => home.stats.updateInHomeSlot(delta));

    const active = createStats(runtime, definition, { active: true, moving: false });
    const activeResult = simulate(active.stats, runtime, 2 * 60 * 60 * 1000, (delta) => active.stats.update(delta));

    const care = createStats(runtime, definition, { active: true, moving: false });
    const careResult = simulateCareModel(care.stats, care.myte, runtime, 2 * 60 * 60 * 1000, playAction);

    const sleepBoost = createStats(runtime, definition, { active: true, moving: false });
    const preSleep = simulate(sleepBoost.stats, runtime, 60 * 60 * 1000, (delta) => sleepBoost.stats.update(delta));
    sleepBoost.stats.applyStatEffects(sleepAction?.effects || {});
    const sleepRows = [...preSleep.rows, { time: preSleep.rows.at(-1)?.time ?? 0, ...getSnapshot(sleepBoost.stats) }];
    const sleepHits = new Map(preSleep.boundaryHits);
    recordBounds(
        sleepHits,
        preSleep.rows.at(-1) || getSnapshot(sleepBoost.stats),
        getSnapshot(sleepBoost.stats),
        sleepBoost.stats,
        preSleep.rows.at(-1)?.time ?? 0
    );

    const noCare = createStats(runtime, definition, { active: true, moving: false });
    const noCareResult = simulate(noCare.stats, runtime, 9 * 60 * 60 * 1000, (delta) => noCare.stats.update(delta));
    const crashed = createStats(runtime, definition, { active: false, moving: false });
    Object.assign(crashed.stats, {
        health: 0,
        energy: 0,
        fun: 0,
        social: 0,
        satiety: 0,
        comfort: 0,
        confidence: 0
    });
    const recovery = findFullRecoveryTime(crashed.stats, runtime, 25 * 60 * 1000);
    const apple = createStats(runtime, definition, { active: true, moving: false });
    const appleSustainMs = findAppleSustainTime(apple.stats, runtime);

    const failures = [];
    const careHasZero = careResult.minHits.size > 0;
    const badMoodSamples = careResult.moods.filter(mood => mood === 'exhausted' || mood === 'bored').length;
    const badMoodRatio = careResult.moods.length ? badMoodSamples / careResult.moods.length : 1;
    const satietyDepletedAt = noCareResult.boundaryTimes.get('satiety');
    const healthDepletedAt = noCareResult.healthDepletionAt;
    const starvationGraceMs = runtime.SiteConfig.stats.wellbeing.starvationGraceMs;

    assertSimulation(!careHasZero, 'Care model allowed a stat to reach zero.', failures);
    assertSimulation(badMoodRatio <= 0.2, 'Care model spent more than 20% of samples exhausted or bored.', failures);
    assertSimulation(satietyDepletedAt >= 45 * 60 * 1000 && satietyDepletedAt <= 90 * 60 * 1000,
        'No-care satiety did not deplete within the 45–90 minute target.', failures);
    assertSimulation(healthDepletedAt === undefined || healthDepletedAt - satietyDepletedAt >= starvationGraceMs + 60 * 60 * 1000,
        'No-care health depleted before the starvation grace plus 60 minutes.', failures);
    assertSimulation(recovery.elapsedMs !== null && recovery.elapsedMs >= 8 * 60 * 1000 && recovery.elapsedMs <= 20 * 60 * 1000,
        'Docked crash recovery did not complete within 8–20 minutes.', failures);
    assertSimulation((recovery.confidenceSaturatedAt ?? 0) >= 2 * 60 * 1000,
        'Confidence saturated in under two minutes.', failures);
    assertSimulation(appleSustainMs >= 15 * 60 * 1000,
        'One apple sustained satiety for less than 15 minutes.', failures);

    const sections = [
        '# Myte Stat Simulation',
        '',
        renderTable('8 Sim-Hours Idle In Home Slot', homeResult.rows),
        '',
        renderSummary('Idle In Home Slot', homeResult.boundaryHits),
        '',
        renderTable('2 Sim-Hours Deployed / Active', activeResult.rows),
        '',
        renderSummary('Deployed / Active', activeResult.boundaryHits),
        '',
        renderTable('2 Sim-Hours Deployed With AI Care Model', careResult.rows),
        '',
        renderSummary('AI Care Model', careResult.boundaryHits),
        '',
        renderTable('1 Sim-Hour Deployed Then Sleep Effect Applied', sleepRows),
        '',
        renderSummary('Sleep Effect', sleepHits),
        '',
        '## Assertions',
        '',
        `- Care model zero-stat check: ${careHasZero ? 'FAIL' : 'PASS'}`,
        `- Care model exhausted/bored samples: ${(badMoodRatio * 100).toFixed(1)}% (≤ 20% required)`,
        `- No-care satiety depletion: ${satietyDepletedAt == null ? 'not reached' : formatClock(satietyDepletedAt)}`,
        `- No-care health depletion: ${healthDepletedAt == null ? 'not reached in 9 sim-hours' : formatClock(healthDepletedAt)}`,
        `- Docked crash recovery: ${recovery.elapsedMs == null ? 'not complete in 25 sim-minutes' : formatClock(recovery.elapsedMs)}`,
        `- Confidence saturation: ${recovery.confidenceSaturatedAt == null ? 'not reached' : formatClock(recovery.confidenceSaturatedAt)}`,
        `- One apple sustains satiety: ${formatClock(appleSustainMs)}`,
        ...(failures.length ? ['', '### Assertion failures', '', ...failures.map(message => `- ${message}`)] : ['', '- All T17 simulation assertions passed.'])
    ];

    console.log(sections.join('\n'));
    if (failures.length) process.exitCode = 1;
}

main();
