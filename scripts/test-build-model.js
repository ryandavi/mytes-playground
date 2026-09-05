const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = path.resolve(__dirname, '..');
const fixtureRoot = path.join(repoRoot, 'tests', 'build', 'fixtures');
const sourceFiles = [
    'js/Map/Build/BuildKeys.js',
    'js/Map/Build/StoreDelta.js',
    'js/Map/Build/BuildRecordStore.js',
    'js/Map/Build/WallSurfaceAtomStore.js',
    'js/Map/Walls/WallGeometry.js',
    'js/Map/Floors/FloorOwnershipResolver.js',
    'js/Map/Walls/WallSurfaceRuns.js',
    'js/Map/Walls/WallFaceResolver.js'
];

function loadCore() {
    const context = vm.createContext({ console, Map, Set, Object, Array, Number, String, Math, Error });
    for (const relative of sourceFiles) {
        vm.runInContext(fs.readFileSync(path.join(repoRoot, relative), 'utf8'), context, { filename: relative });
    }
    return vm.runInContext('({ BuildKeys, WallSurfaceAtomStore, WallGeometry, FloorOwnershipResolver, WallFaceResolver, WallSurfaceRuns })', context);
}

function parseFixture(filePath) {
    const lines = fs.readFileSync(filePath, 'utf8').replace(/\r/g, '').split('\n');
    const fixture = { name: path.basename(filePath), reach: 1, map: [], expect: [], thresholds: [], faces: [], visible: [], atoms: [], atomOps: [], expectAtoms: [], origins: {} };
    let section = null;
    for (const raw of lines) {
        const line = raw.replace(/\s+$/, '');
        if (!line || line.trimStart().startsWith('//')) continue;
        const header = /^(name|reach):\s*(.*)$/.exec(line);
        if (header) {
            fixture[header[1]] = header[1] === 'reach' ? Number(header[2]) : header[2];
            section = null;
            continue;
        }
        const sectionMatch = /^(map|expect|thresholds|faces|visible|atoms|atom-ops|expect-atoms|origin):\s*(.*)$/.exec(line);
        if (sectionMatch) {
            section = sectionMatch[1];
            if (sectionMatch[2]) parseSectionLine(fixture, section, sectionMatch[2].trim());
            continue;
        }
        if (!section) throw new Error(`${filePath}: value outside a section: ${line}`);
        parseSectionLine(fixture, section, line.trim());
    }
    if (!fixture.map.length || !fixture.expect.length) throw new Error(`${filePath}: map and expect are required`);
    rectangular(fixture.map, `${filePath} map`);
    rectangular(fixture.expect, `${filePath} expect`);
    if (fixture.expect.length !== fixture.map.length * 2 || fixture.expect[0].length !== fixture.map[0].length * 2) {
        throw new Error(`${filePath}: expect must be a 2W x 2H block grid`);
    }
    return fixture;
}

function parseSectionLine(fixture, section, value) {
    if (section === 'map' || section === 'expect') fixture[section].push(value);
    if (section === 'thresholds') fixture.thresholds.push(...value.split(/\s+/).filter(Boolean));
    if (section === 'faces') {
        const match = /^(\S+)\s*=\s*([A-Za-z.]|exterior|buried)$/.exec(value);
        if (!match) throw new Error(`Invalid face expectation: ${value}`);
        fixture.faces.push({ key: match[1], owner: match[2] });
    }
    if (section === 'visible') {
        const match = /^(-?\d+,-?\d+)\/(horizontal-band|post-west|post-east)\/([01])\s*=\s*(\S+)$/.exec(value);
        if (!match) throw new Error(`Invalid visible expectation: ${value}`);
        fixture.visible.push({ cell: match[1], kind: match[2], half: Number(match[3]), atomKey: match[4] });
    }
    if (section === 'atoms' || section === 'expect-atoms') {
        const match = /^(\S+)\s*=\s*(\S+)$/.exec(value);
        if (!match) throw new Error(`Invalid atom expectation: ${value}`);
        fixture[section === 'atoms' ? 'atoms' : 'expectAtoms'].push({ key: match[1], finishId: match[2] });
    }
    if (section === 'atom-ops') fixture.atomOps.push(value);
    if (section === 'origin') {
        const match = /^([A-Za-z])\s*=\s*(authored|detected|painted)$/.exec(value);
        if (!match) throw new Error(`Invalid origin: ${value}`);
        fixture.origins[match[1]] = match[2];
    }
}

function rectangular(rows, label) {
    if (rows.some(row => row.length !== rows[0].length)) throw new Error(`${label} is not rectangular`);
}

function buildInput(fixture, core, reverse = false) {
    const walls = [];
    const planSeeds = new Map();
    fixture.map.forEach((row, y) => [...row].forEach((value, x) => {
        if (value === '#' || value === 'D') walls.push([core.BuildKeys.cell(x, y), { x, y, connectGroup: 'wall', opening: value === 'D' }]);
        if (/^[A-Za-z]$/.test(value) && value !== 'D') {
            if (!planSeeds.has(value)) planSeeds.set(value, []);
            planSeeds.get(value).push(core.BuildKeys.cell(x, y));
        }
    }));
    if (reverse) walls.reverse();
    const geometry = core.WallGeometry.compute(new Map(walls));
    let plans = [...planSeeds.entries()].map(([id, seedCells]) => ({
        id,
        // Thresholds are dropped from every seed list, painted included: an
        // opening belongs to both sides and is settled by expansion.
        seedCells: seedCells.filter(key => !geometry.thresholds.has(key))
    }));
    if (reverse) plans = plans.reverse().map(plan => ({ ...plan, seedCells: [...plan.seedCells].reverse() }));
    return {
        geometry,
        plans,
        resolverInput: {
            width: fixture.map[0].length,
            height: fixture.map.length,
            walls: new Map([...geometry.cells].map(([key, cell]) => [key, { ...cell, mask: geometry.masks.get(key) }])),
            expandCells: [...geometry.thresholds],
            plans,
            reachBlocks: fixture.reach
        }
    };
}

function ownerRows(grid) {
    const rows = [];
    for (let by = 0; by < grid.blockHeight; by++) {
        let row = '';
        for (let bx = 0; bx < grid.blockWidth; bx++) row += grid.ownerAt(bx, by) || '.';
        rows.push(row);
    }
    return rows;
}

function assertEqual(actual, expected, message) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`${message}\nexpected: ${JSON.stringify(expected)}\nactual:   ${JSON.stringify(actual)}`);
    }
}

function runFixture(fixture, core, label) {
    const built = buildInput(fixture, core);
    const grid = core.FloorOwnershipResolver.solve(built.resolverInput);
    assertEqual(ownerRows(grid), fixture.expect, `${fixture.name} (${label}) ownership`);
    assertEqual([...built.geometry.thresholds].sort(), [...fixture.thresholds].sort(), `${fixture.name} (${label}) thresholds`);

    const shuffled = buildInput(fixture, core, true);
    const shuffledRows = ownerRows(core.FloorOwnershipResolver.solve(shuffled.resolverInput));
    assertEqual(shuffledRows, fixture.expect, `${fixture.name} (${label}) shuffled ownership`);

    for (const expected of fixture.faces) {
        const atom = core.BuildKeys.parseAtom(expected.key);
        const classification = core.WallFaceResolver.classify(atom, grid, { walls: built.geometry });
        const actual = classification.kind === 'room' ? classification.roomId : classification.kind;
        assertEqual(actual, expected.owner, `${fixture.name} (${label}) face ${expected.key}`);
    }
    if (label === 'rotate0') for (const expected of fixture.visible) {
        const { x, y } = core.BuildKeys.parseCell(expected.cell);
        const atom = core.WallFaceResolver.visibleAtom({ x, y, kind: expected.kind, half: expected.half }, grid, {
            walls: built.geometry
        });
        assertEqual(core.BuildKeys.atom(atom.x, atom.y, atom.face, atom.half), expected.atomKey,
            `${fixture.name} visible ${expected.cell}/${expected.kind}/${expected.half}`);
    }
    if (label === 'rotate0' && fixture.atoms.length) {
        const atoms = new core.WallSurfaceAtomStore(fixture.atoms.map(expected => ({
            ...core.BuildKeys.parseAtom(expected.key), finishId: expected.finishId
        })));
        for (const operation of fixture.atomOps) {
            const parts = operation.split(/\s+/);
            if (parts[0] === 'copy') {
                const from = core.BuildKeys.parseCell(parts[1]);
                const to = core.BuildKeys.parseCell(parts[2]);
                atoms.copyCell(from.x, from.y, to.x, to.y);
            } else if (parts[0] === 'delete') {
                const cell = core.BuildKeys.parseCell(parts[1]);
                atoms.deleteCell(cell.x, cell.y);
            } else if (parts[0] === 'translate') {
                const dx = Number(parts[1]);
                const dy = Number(parts[2]);
                atoms.translateCells(parts.slice(3), dx, dy);
            } else {
                throw new Error(`Unknown atom operation: ${operation}`);
            }
        }
        assertEqual(atoms.entries().map(([key, atom]) => ({ key, finishId: atom.finishId })), fixture.expectAtoms,
            `${fixture.name} atom operations`);
    }
}

function transformRows(rows, transform) {
    let result = rows.map(row => [...row]);
    if (transform.mirror) result = result.map(row => [...row].reverse());
    for (let turn = 0; turn < transform.turns; turn++) {
        const height = result.length;
        const width = result[0].length;
        result = Array.from({ length: width }, (_, y) =>
            Array.from({ length: height }, (_, x) => result[height - 1 - x][y]));
    }
    return result.map(row => row.join(''));
}

function transformPoint(x, y, width, height, transform) {
    if (transform.mirror) x = width - 1 - x;
    for (let turn = 0; turn < transform.turns; turn++) {
        [x, y] = [height - 1 - y, x];
        [width, height] = [height, width];
    }
    return { x, y, width, height };
}

function transformVector(dx, dy, transform) {
    if (transform.mirror) dx = -dx;
    for (let turn = 0; turn < transform.turns; turn++) [dx, dy] = [-dy, dx];
    return { dx, dy };
}

function transformFace(face, half, transform) {
    const normals = { north: [0, -1], east: [1, 0], south: [0, 1], west: [-1, 0] };
    const tangent = (face === 'north' || face === 'south') ? [half === 0 ? -1 : 1, 0] : [0, half === 0 ? -1 : 1];
    const normal = transformVector(...normals[face], transform);
    const offset = transformVector(...tangent, transform);
    const nextFace = Object.entries(normals).find(([, vector]) => vector[0] === normal.dx && vector[1] === normal.dy)[0];
    const nextHalf = (nextFace === 'north' || nextFace === 'south') ? Number(offset.dx > 0) : Number(offset.dy > 0);
    return { face: nextFace, half: nextHalf };
}

function transformedFixture(fixture, transform, core) {
    const width = fixture.map[0].length;
    const height = fixture.map.length;
    return {
        ...fixture,
        map: transformRows(fixture.map, transform),
        expect: transformRows(fixture.expect, transform),
        thresholds: fixture.thresholds.map(key => {
            const point = core.BuildKeys.parseCell(key);
            const next = transformPoint(point.x, point.y, width, height, transform);
            return core.BuildKeys.cell(next.x, next.y);
        }),
        faces: fixture.faces.map(expected => {
            const atom = core.BuildKeys.parseAtom(expected.key);
            const point = transformPoint(atom.x, atom.y, width, height, transform);
            const next = transformFace(atom.face, atom.half, transform);
            return { key: core.BuildKeys.atom(point.x, point.y, next.face, next.half), owner: expected.owner };
        })
    };
}

function runPropertyCases(core) {
    let state = 0x5eed1234;
    const random = () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 0x100000000;
    };
    const cases = 100;
    for (let run = 0; run < cases; run++) {
        const width = 12;
        const height = 12;
        const walls = new Map();
        const seeds = { A: [], B: [], C: [] };
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
            const key = core.BuildKeys.cell(x, y);
            if (random() < 0.18) {
                walls.set(key, { x, y, connectGroup: random() < 0.9 ? 'wall' : 'other' });
                continue;
            }
            const roll = random();
            if (roll < 0.12) seeds.A.push(key);
            else if (roll < 0.24) seeds.B.push(key);
            else if (roll < 0.36) seeds.C.push(key);
        }
        const geometry = core.WallGeometry.compute(walls, run);
        const plans = Object.entries(seeds).map(([id, seedCells], index) => ({ id, seedCells, priority: index - 1 }));
        const input = {
            width, height, reachBlocks: run % 3, revision: run,
            walls: new Map([...geometry.cells].map(([key, cell]) => [key, { ...cell, mask: geometry.masks.get(key) }])),
            plans
        };
        const first = core.FloorOwnershipResolver.solve(input);
        const reversed = core.FloorOwnershipResolver.solve({
            ...input,
            walls: new Map([...input.walls].reverse()),
            plans: [...plans].reverse().map(plan => ({ ...plan, seedCells: [...plan.seedCells].reverse() }))
        });
        assertEqual(first.owner, reversed.owner, `property case ${run} is input-order independent`);
        assertEqual(first.owner, core.FloorOwnershipResolver.solve(input).owner, `property case ${run} is repeatable`);
        for (const plan of plans) for (const key of plan.seedCells) {
            const { x, y } = core.BuildKeys.parseCell(key);
            for (const [bx, by] of core.BuildKeys.blocksOfCell(x, y)) {
                assertEqual(first.ownerAt(bx, by), plan.id, `property case ${run} preserves seed ${key}`);
            }
        }
        const repeatedGeometry = core.WallGeometry.compute(geometry.cells, run);
        assertEqual([...geometry.masks], [...repeatedGeometry.masks], `property case ${run} geometry is idempotent`);
        assertEqual([...geometry.thresholds].sort(), [...repeatedGeometry.thresholds].sort(), `property case ${run} thresholds are idempotent`);
    }
    return cases;
}

function runGeometryContracts(core) {
    const make = rows => {
        const walls = new Map();
        rows.forEach((row, y) => [...row].forEach((value, x) => {
            if (value !== '#') return;
            walls.set(core.BuildKeys.cell(x, y), {
                x, y, constructionId: 'basic', heightCells: 5, connectGroup: 'wall', finishId: x % 2 ? 'blue' : 'green'
            });
        }));
        return core.WallGeometry.compute(walls, {
            cellSize: 32,
            constructions: { basic: { cellSize: 32, thickness: 14, height: 160 } }
        });
    };

    const horizontal = make(['###']);
    assertEqual(horizontal.runs.map(run => [run.axis, run.cells]), [['horizontal', ['0,0', '1,0', '2,0']]],
        'horizontal run extraction');
    assertEqual(horizontal.pieces.map(piece => piece.cells), [['0,0', '1,0', '2,0']],
        'structural pieces merge regardless of finish');
    assertEqual(horizontal.paintSpans.get('1,0').map(span => [span.kind, span.half, span.from, span.to]),
        [['horizontal-band', 0, 0, 16], ['horizontal-band', 1, 16, 32]], 'horizontal atom spans');

    const crossing = make(['.#.', '###', '.#.']);
    assertEqual(crossing.runs.map(run => run.axis).sort(), ['horizontal', 'vertical'], 'crossing belongs to two structural runs');
    assertEqual(crossing.paintSpans.get('1,1').map(span => span.kind),
        ['horizontal-band', 'post-west', 'post-east', 'horizontal-band'], 'crossing exposes band and post slices');
    assertEqual(crossing.paintSpans.get('1,1')[0].candidates,
        ['1,1/south/0', '1,1/north/0'], 'band candidates are physical half-cell atoms');

    const divider = make(['...', '###', '...']);
    const grid = core.FloorOwnershipResolver.solve({
        width: 3,
        height: 3,
        walls: new Map([...divider.cells].map(([key, cell]) => [key, { ...cell, mask: divider.masks.get(key) }])),
        plans: [
            { id: 'A', seedCells: ['0,0', '1,0', '2,0'] },
            { id: 'B', seedCells: ['0,2', '1,2', '2,2'] }
        ],
        reachBlocks: 1
    });
    const sections = core.WallFaceResolver.sections(divider, grid, { walls: divider });
    assertEqual(sections.length, 1, 'equal visible atoms form one contiguous section');
    assertEqual(sections[0].atoms,
        ['0,1/south/0', '0,1/south/1', '1,1/south/0', '1,1/south/1', '2,1/south/0', '2,1/south/1'],
        'section grouping returns the physical atoms it will paint');

    const corner = make(['...', '###', '..#']);
    const cornerGrid = {
        ownerAt: (bx, by) => by >= 4 && bx < 4 ? 'A' : null,
        blocksOf: roomId => roomId === 'A' ? [[0, 4], [1, 4], [2, 4], [3, 4]] : []
    };
    const cornerSections = core.WallFaceResolver.sections(corner, cornerGrid, { walls: corner });
    const cornerBand = cornerSections.find(section => section.surface.roomId === 'A');
    assertEqual(cornerBand.spans.filter(span => span.kind === 'horizontal-band').length, 6,
        'a returning corner stays in its visible wall section');
    assertEqual(cornerBand.atoms.includes('2,1/north/1'), true,
        'corner paint is stored on the visible non-buried atom');
    assertEqual(core.WallFaceResolver.classifyPaintAtom(
        { x: 2, y: 1, face: 'north', half: 1 }, cornerGrid, { walls: corner }, corner
    ).roomId, 'A', 'corner atom keeps its inherited room classification for paint commands');

    const terminal = make(['...', '###', '...']);
    const terminalGrid = {
        ownerAt: (bx, by) => by >= 4 && bx >= 2 ? 'A' : null,
        blocksOf: roomId => roomId === 'A' ? [[2, 4], [3, 4], [4, 4], [5, 4]] : []
    };
    // Revised 2026-09-05 with the face rule: a half that fronts outside on both
    // sides IS outside, and takes the building's finish. Reaching over it for a
    // room further along the run dressed the last cell of a wall in a colour
    // nothing beside it was wearing.
    const terminalSections = core.WallFaceResolver.sections(terminal, terminalGrid, { walls: terminal });
    const terminalBand = terminalSections.find(section => section.surface.roomId === 'A');
    assertEqual(terminalBand.spans.filter(span => span.kind === 'horizontal-band').length, 4,
        'the room section stops where the room does');
    assertEqual(terminalSections.find(section => section.surface.kind === 'exterior').atoms,
        ['0,1/south/0', '0,1/south/1'],
        'the length of wall past the room is one exterior section');

    // A run between two returning walls: the middle faces outside, and both end
    // halves are buried on both sides. They take the run's surface rather than
    // whichever face happens to be open, or one wall reads as three.
    const bay = make(['#.#', '###', '#.#']);
    const bayGrid = {
        ownerAt: (bx, by) => by < 2 && bx >= 2 && bx < 4 ? 'A' : null,
        blocksOf: roomId => roomId === 'A' ? [[2, 0], [3, 0], [2, 1], [3, 1]] : []
    };
    const bayBands = core.WallFaceResolver.sections(bay, bayGrid, { walls: bay })
        .filter(section => section.spans.some(span => span.kind === 'horizontal-band'));
    assertEqual(bayBands.length, 1, 'a run between two returning walls is one section');
    assertEqual(bayBands[0].surface.kind, 'exterior', 'the run keeps the surface its middle faces');
    assertEqual(bayBands[0].atoms, ['0,1/south/1', '1,1/south/0', '1,1/south/1', '2,1/south/0'],
        'both buried end halves paint with the run');

    // An arm that ends in the middle of a run has no sides at the cell where it
    // ends: those faces are inside the run's own masonry. The cell belongs to
    // the run, and the arm's posts start on the far side of it. Revised
    // 2026-09-05 — it used to hand that cell to the arm, which cut a post out
    // of the run and left a sliver of the arm's rooms standing in the middle of
    // a wall no one could paint in one stretch.
    const tee = make(['###', '.#.', '.#.']);
    const teeGrid = {
        ownerAt: (bx, by) => bx <= 2 && by >= 2 ? 'A' : null,
        blocksOf: roomId => roomId === 'A' ? [[0, 2], [1, 2], [2, 2]] : []
    };
    const teeSections = core.WallFaceResolver.sections(tee, teeGrid, { walls: tee });
    assertEqual(teeSections.filter(section => section.spans.some(span => span.kind.startsWith('post-')))
        .map(section => section.atoms), [
        ['1,1/west/1', '1,2/west/1'],
        ['1,1/east/0', '1,2/east/0']
    ], 'an arm hanging off a run starts below the junction, not at it');
    assertEqual(teeSections.filter(section => section.spans.some(span => span.kind === 'horizontal-band'))
        .map(section => section.atoms), [
        ['0,0/south/0', '0,0/south/1', '1,0/south/0'],
        ['1,0/north/1', '2,0/south/0', '2,0/south/1']
    ], 'the junction cell is band, and each half joins the run on its own side');

    // A vertical run passing straight through a junction can have a different
    // surface above and below it. The sliver at the junction goes with the half
    // the camera sees, the same call the bands make.
    const cross = make(['.#.', '###', '.#.']);
    const crossGrid = {
        ownerAt: (bx, by) => bx <= 1 && by <= 2 ? 'A' : null,
        blocksOf: roomId => roomId === 'A' ? [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2], [1, 2]] : []
    };
    const crossWest = core.WallFaceResolver.sections(cross, crossGrid, { walls: cross })
        .filter(section => section.spans.some(span => span.kind === 'post-west'));
    assertEqual(crossWest.map(section => section.atoms), [['1,0/west/1'], ['1,1/west/0', '1,2/west/0']],
        'a junction post takes the southern half of its run');

    return 15;
}

function main() {
    const core = loadCore();
    const files = fs.readdirSync(fixtureRoot).filter(name => name.endsWith('.fixture')).sort();
    if (!files.length) throw new Error('No build-model fixtures found');
    const transforms = [];
    for (const mirror of [false, true]) for (let turns = 0; turns < 4; turns++) transforms.push({ mirror, turns });
    let runs = 0;
    for (const file of files) {
        const fixture = parseFixture(path.join(fixtureRoot, file));
        for (const transform of transforms) {
            const transformed = transformedFixture(fixture, transform, core);
            runFixture(transformed, core, `${transform.mirror ? 'mirror+' : ''}rotate${transform.turns * 90}`);
            runs++;
        }
    }
    const geometryContracts = runGeometryContracts(core);
    const propertyCases = runPropertyCases(core);
    console.log(`Build-model tests passed: ${files.length} fixtures, ${runs} orientations, ${geometryContracts} geometry contracts, ${propertyCases} property cases.`);
}

main();
