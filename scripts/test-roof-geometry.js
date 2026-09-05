const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = path.resolve(__dirname, '..');
const context = vm.createContext({ console, Map, Set, Object, Array, Number, String, Math, JSON, Error, Infinity });
for (const source of ['js/Map/Build/BuildKeys.js', 'js/Map/Roofs/RoofGeometry.js']) {
    vm.runInContext(fs.readFileSync(path.join(repoRoot, source), 'utf8'), context, { filename: source });
}
const { RoofGeometry } = vm.runInContext('({ RoofGeometry })', context);
const fixtureDir = path.join(repoRoot, 'tests/build/fixtures/roofs');
const partSymbols = { flat: 'F', slope: 's', hip: 'h', ridge: 'r', 'ridge-end': 'e', peak: 'p', valley: 'v', 'gable-end': 'g' };

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function parseFixture(file) {
    const lines = fs.readFileSync(file, 'utf8').replace(/\r/g, '').trimEnd().split('\n');
    const data = {};
    let section = null;
    for (const line of lines) {
        if (/^(map|parts):$/.test(line)) {
            section = line.slice(0, -1);
            data[section] = [];
        } else if (section && !line.includes(':')) {
            data[section].push(line);
        } else {
            section = null;
            const split = line.indexOf(':');
            data[line.slice(0, split)] = line.slice(split + 1).trim();
        }
    }
    return data;
}

function geometryFor(fixture, cellsOverride = null) {
    const cells = cellsOverride || new Set();
    const walls = new Map();
    fixture.map.forEach((row, y) => [...row].forEach((symbol, x) => {
        if (!'#AB'.includes(symbol)) return;
        cells.add(`${x},${y}`);
        if (symbol === 'A' || symbol === 'B') walls.set(`${x},${y}`, {
            x, y, constructionId: 'wall', heightCells: symbol === 'A' ? 3 : 5
        });
    }));
    const topology = { roofableFootprint: () => cells, roofableByBuilding: new Map([['building', cells]]) };
    return RoofGeometry.compute({
        width: fixture.map[0].length,
        height: fixture.map.length,
        walls,
        topology,
        roofPlan: {
            buildingId: 'building',
            style: fixture.style,
            ridgeAxis: fixture.ridgeAxis || 'auto',
            overhangCells: Number(fixture.overhang) || 0,
            excludedCells: fixture.excluded ? fixture.excluded.split(/\s+/) : []
        },
        config: { cellSize: 32 }
    });
}

function renderedParts(geometry, width, height) {
    const parts = new Map(geometry.sections.flatMap(section => [...section.parts]));
    return Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) =>
        partSymbols[parts.get(`${x},${y}`)?.part] || '.'
    ).join(''));
}

const fixtures = fs.readdirSync(fixtureDir).filter(name => name.endsWith('.fixture')).sort();
for (const name of fixtures) {
    const fixture = parseFixture(path.join(fixtureDir, name));
    const geometry = geometryFor(fixture);
    assert(geometry.sections.length === Number(fixture.sections || 1), `${fixture.name}: section count`);
    assert(JSON.stringify(renderedParts(geometry, fixture.map[0].length, fixture.map.length)) === JSON.stringify(fixture.parts),
        `${fixture.name}: part grid`);
    const mixed = geometry.sections.some(section => section.mixedHeights);
    assert(mixed === (fixture.mixed === 'true'), `${fixture.name}: mixed height warning`);
    for (const section of geometry.sections) {
        assert(section.cells.size === section.parts.size, `${fixture.name}: every cell has one part`);
    }
}

function transformed(cells, width, height, turns, mirror) {
    let points = [...cells].map(key => key.split(',').map(Number));
    let w = width;
    let h = height;
    if (mirror) points = points.map(([x, y]) => [w - 1 - x, y]);
    for (let turn = 0; turn < turns; turn++) {
        points = points.map(([x, y]) => [h - 1 - y, x]);
        [w, h] = [h, w];
    }
    return { cells: new Set(points.map(([x, y]) => `${x},${y}`)), width: w, height: h };
}

const lFixture = parseFixture(path.join(fixtureDir, 'l-shape.fixture'));
const baseCells = new Set();
lFixture.map.forEach((row, y) => [...row].forEach((symbol, x) => symbol === '#' && baseCells.add(`${x},${y}`)));
const baseCounts = countParts(geometryFor(lFixture));
for (const mirror of [false, true]) for (let turns = 0; turns < 4; turns++) {
    const variant = transformed(baseCells, lFixture.map[0].length, lFixture.map.length, turns, mirror);
    const topology = { roofableFootprint: () => variant.cells, roofableByBuilding: new Map([['building', variant.cells]]) };
    const geometry = RoofGeometry.compute({
        width: variant.width, height: variant.height, topology,
        roofPlan: { buildingId: 'building', style: 'hip' }
    });
    assert(JSON.stringify(countParts(geometry)) === JSON.stringify(baseCounts), `l-shape orientation ${mirror}/${turns}`);
}

function countParts(geometry) {
    const counts = {};
    for (const section of geometry.sections) for (const part of section.parts.values()) {
        counts[part.part] = (counts[part.part] || 0) + 1;
    }
    return Object.fromEntries(Object.entries(counts).sort());
}

const first = new Set(['1,1']);
const second = new Set(['3,1']);
const blocked = RoofGeometry.compute({
    width: 5, height: 3,
    topology: {
        roofableFootprint: id => id === 'first' ? first : second,
        roofableByBuilding: new Map([['first', first], ['second', second]])
    },
    roofPlan: { buildingId: 'first', style: 'flat', overhangCells: 1 }
});
assert(!blocked.sections[0].cells.has('3,1'), 'overhang never covers another building');
const holed = RoofGeometry.compute({
    width: 5, height: 5,
    topology: { roofableFootprint: () => new Set(['2,2', '2,3']), roofableByBuilding: new Map([['first', ['2,2', '2,3']]]) },
    roofPlan: { buildingId: 'first', style: 'flat', overhangCells: 1, excludedCells: ['2,2'] }
});
assert(!holed.sections.some(section => section.cells.has('2,2')),
    'excluded cells stay excluded after overhang dilation');

let seed = 0x9e3779b9;
const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 0x100000000);
for (let sample = 0; sample < 100; sample++) {
    const cells = new Set(['5,5']);
    for (let step = 0; step < 30; step++) {
        const keys = [...cells];
        const [x, y] = keys[Math.floor(random() * keys.length)].split(',').map(Number);
        const direction = RoofGeometry.DIRECTIONS[Math.floor(random() * 4)];
        const nx = x + direction.dx;
        const ny = y + direction.dy;
        if (nx >= 0 && ny >= 0 && nx < 12 && ny < 12) cells.add(`${nx},${ny}`);
    }
    const shuffled = [...cells].sort(() => random() - 0.5);
    const topology = { roofableFootprint: () => shuffled, roofableByBuilding: new Map([['building', shuffled]]) };
    const input = { width: 12, height: 12, topology, roofPlan: { buildingId: 'building', style: 'hip' } };
    const one = RoofGeometry.compute(input);
    const two = RoofGeometry.compute(input);
    assert(one.sections.reduce((sum, section) => sum + section.parts.size, 0) === cells.size,
        `property ${sample}: every covered cell classified once`);
    assert(JSON.stringify([...one.sections].map(section => [...section.parts])) ===
        JSON.stringify([...two.sections].map(section => [...section.parts])), `property ${sample}: deterministic`);
}

console.log(`Roof geometry tests passed: ${fixtures.length} fixtures, 8 orientations, 100 property cases.`);
