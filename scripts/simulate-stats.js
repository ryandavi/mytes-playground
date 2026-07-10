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
    context.ActionDefinitionRegistry = { getDefinitionSync: () => null };
    context.MOVE_TYPES = { FOLLOW: 'follow' };
    context.Utility = vm.runInContext('Utility', context);
    context.SimClock = vm.runInContext('SimClock', context);
    context.SiteConfig = vm.runInContext('SiteConfig', context);
    context.MyteStats = vm.runInContext('MyteStats', context);

    return context;
}

function getDefaultSpeciesDefinition() {
    const speciesCatalog = readJson('data/mytes/species.json');
    const defaultSpeciesId = String(speciesCatalog.defaultSpeciesId || '').trim().toLowerCase();
    const entry = (speciesCatalog.species || []).find((species) =>
        String(species.id || species.speciesId || '').trim().toLowerCase() === defaultSpeciesId
    );
    const relPath = `data/mytes/${entry?.definitionFile || `${defaultSpeciesId || 'snail'}.json`}`;
    return readJson(relPath);
}

function createMyteStub(definition, { active = true, moving = false } = {}) {
    const myte = {
        id: 'sim-myte',
        definition,
        isActive: active,
        isDragging: false,
        goal: null,
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
            getCurrentAction() { return null; },
            isEmpty() { return true; },
            addToFront() {},
            interrupt() {}
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
        isMoving() { return moving; },
        getHomePosition() { return { x: 0, y: 0 }; },
        getDistanceToPoint(x, y) { return Math.hypot(this.posX - x, this.posY - y); }
    };

    myte.parent = { mytes: [myte] };
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

function simulate(stats, runtime, durationMs, updateFn) {
    const rows = [{ time: 0, ...getSnapshot(stats) }];
    const boundaryHits = new Map();
    let elapsedMs = 0;
    let nextSampleMs = sampleIntervalMs;
    let previous = getSnapshot(stats);

    while (elapsedMs < durationMs) {
        const delta = Math.min(stepMs, durationMs - elapsedMs);
        updateFn(delta);
        runtime.SimClock.advance(delta);
        elapsedMs += delta;

        const current = getSnapshot(stats);
        recordBounds(boundaryHits, previous, current, stats, elapsedMs);
        previous = current;

        if (elapsedMs >= nextSampleMs || elapsedMs === durationMs) {
            rows.push({ time: elapsedMs, ...current });
            nextSampleMs += sampleIntervalMs;
        }
    }

    return { rows, boundaryHits };
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

    const home = createStats(runtime, definition, { active: false, moving: false });
    const homeResult = simulate(home.stats, runtime, 8 * 60 * 60 * 1000, (delta) => home.stats.updateInHomeSlot(delta));

    const active = createStats(runtime, definition, { active: true, moving: false });
    const activeResult = simulate(active.stats, runtime, 2 * 60 * 60 * 1000, (delta) => active.stats.update(delta));

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
        renderTable('1 Sim-Hour Deployed Then Sleep Effect Applied', sleepRows),
        '',
        renderSummary('Sleep Effect', sleepHits)
    ];

    console.log(sections.join('\n'));
}

main();
