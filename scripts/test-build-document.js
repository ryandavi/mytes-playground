const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = path.resolve(__dirname, '..');
const sources = [
    'js/Map/Build/BuildKeys.js',
    'js/Map/Build/StoreDelta.js',
    'js/Map/Build/BuildRecordStore.js',
    'js/Map/Build/BuildingPlanStore.js',
    'js/Map/Build/RoomPlanStore.js',
    'js/Map/Build/WallCellStore.js',
    'js/Map/Build/WallSurfaceAtomStore.js',
    'js/Map/Build/AttachmentStore.js',
    'js/Map/Walls/WallGeometry.js',
    'js/Map/Build/BuildDocument.js'
];

const context = vm.createContext({ console, Map, Set, Object, Array, Number, String, Math, JSON, Error });
for (const source of sources) vm.runInContext(fs.readFileSync(path.join(repoRoot, source), 'utf8'), context, { filename: source });
const core = vm.runInContext(`({ BuildKeys, StoreDelta, BuildingPlanStore, RoomPlanStore,
    WallCellStore, WallSurfaceAtomStore, AttachmentStore, BuildDocument })`, context);

function equal(actual, expected, message) {
    if (core.StoreDelta.stableStringify(actual) !== core.StoreDelta.stableStringify(expected)) {
        throw new Error(`${message}\nexpected ${JSON.stringify(expected)}\nactual   ${JSON.stringify(actual)}`);
    }
}

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function sampleMapData() {
    const walls = [];
    for (let x = 0; x < 5; x++) {
        walls.push({ x, y: 0, constructionId: 'wall_basic', finishId: 'plaster', heightCells: 5, connectGroup: 'wall' });
        walls.push({ x, y: 4, constructionId: 'wall_basic', finishId: 'plaster', heightCells: 5, connectGroup: 'wall' });
    }
    for (let y = 1; y < 4; y++) {
        walls.push({ x: 0, y, constructionId: 'wall_basic', finishId: 'plaster', heightCells: 5, connectGroup: 'wall' });
        walls.push({ x: 4, y, constructionId: 'wall_basic', finishId: 'plaster', heightCells: 5, connectGroup: 'wall' });
    }
    return {
        id: 'TestMap',
        displayName: 'Test House',
        tileWidth: 32,
        properties: {},
        environment: {
            location: 'interior',
            rooms: [{
                id: 'living', displayName: 'Living Room',
                bounds: { x: 0, y: 0, width: 160, height: 160 },
                properties: { floorFinishId: 'boards', wallFinishId: 'paint_sage', roomType: 'social' }
            }]
        },
        walls: {
            defaults: { constructionId: 'wall_basic', finishId: 'plaster', heightCells: 5, connectGroup: 'wall' },
            cells: walls,
            faceOverrides: [{ cells: { from: [1, 0], to: [2, 0] }, face: 'south', finishId: 'paint_blue' }],
            roomAssignments: { '2,2': 'living' },
            openings: [{ id: 'door_1', cells: [[2, 0]], axis: 'horizontal' }],
            fixtures: [{ id: 'picture_1', cells: { from: [1, 0], to: [1, 0] }, face: 'south' }],
            attachments: [{ id: 'clock_1', cells: { from: [2, 0], to: [2, 0] }, face: 'south' }]
        }
    };
}

function testStoreDelta() {
    const before = new Map([['a', { value: 1 }], ['b', { value: 2 }]]);
    const after = new Map([['b', { value: 3 }], ['c', { value: 4 }]]);
    const delta = core.StoreDelta.diff(before, after);
    equal(delta, { set: { b: { value: 3 }, c: { value: 4 } }, removed: ['a'] }, 'delta is deterministic');
    equal([...core.StoreDelta.apply(before, delta)], [...after], 'delta applies');
    equal([...core.StoreDelta.apply(after, core.StoreDelta.invert(before, delta))], [...before], 'delta inverts');
}

function testTypedStores() {
    const rooms = new core.RoomPlanStore([
        { id: 'a', displayName: 'A', seedCells: ['0,0'], origin: 'authored' },
        { id: 'b', displayName: 'B', seedCells: ['1,0'], origin: 'painted' }
    ]);
    rooms.assignSeed('b', '0,0');
    assert(rooms.ownerOfSeed('0,0') === 'b', 'assignSeed transfers ownership');
    assert(!rooms.get('a').seedCells.includes('0,0'), 'assignSeed removes the old owner');

    const atoms = new core.WallSurfaceAtomStore([
        { x: 1, y: 1, face: 'south', half: 0, finishId: 'blue' },
        { x: 1, y: 1, face: 'south', half: 1, finishId: 'green' }
    ]);
    atoms.translateCells(['1,1'], 2, -1);
    assert(atoms.has('3,0/south/0') && !atoms.has('1,1/south/0'), 'atom translation preserves physical paint');
    atoms.copyCell(3, 0, 4, 0);
    assert(atoms.get('4,0/south/1').finishId === 'green', 'wall extension copies anchored explicit paint');
    atoms.deleteCell(3, 0);
    assert(!atoms.has('3,0/south/0') && atoms.has('4,0/south/0'), 'wall removal deletes only removed atoms');

    const attachments = new core.AttachmentStore([
        { id: 'door', cells: [[1, 1], [2, 1]], axis: 'horizontal' },
        { id: 'art', cells: { from: [1, 1], to: [1, 1] }, face: 'south' },
        { id: 'straddles', cells: { from: [1, 1], to: [3, 1] }, face: 'south' }
    ]);
    assert(attachments.translateCells(['1,1', '2,1'], 0, 2) === 2,
        'only attachments wholly contained by a wall move translate');
    equal(attachments.get('door').cells, [[1, 3], [2, 3]], 'opening footprints translate with masonry');
    equal(attachments.get('art').cells, { from: [1, 3], to: [1, 3] }, 'fixture addresses translate with masonry');
    equal(attachments.get('straddles').cells, { from: [1, 1], to: [3, 1] }, 'straddling attachments stay put');
}

function testDocumentRoundTrip() {
    const authored = core.BuildDocument.fromMapData(sampleMapData());
    const level = authored.level();
    assert(authored.buildings.size === 1, 'authored walls create one stable building plan');
    assert(level.walls.size === 16, 'authored walls populate the wall store');
    assert(!level.walls.get('0,0').finishId, 'structural wall cells do not persist finishId');
    equal(level.rooms.get('living').seedCells, ['1,1', '2,1', '3,1', '1,2', '2,2', '3,2', '1,3', '2,3', '3,3'],
        'room seeds are authored cells minus walls');
    assert(level.atoms.size === 4, 'legacy authored face ranges expand to half-cell atoms');

    authored.buildings.set('testmap_building', { ...authored.buildings.get('testmap_building'), displayName: 'Renamed' });
    level.rooms.set('living', { ...level.rooms.get('living'), floorFinishId: 'tile' });
    level.walls.delete('4,2');
    level.walls.setCell(5, 2, { constructionId: 'wall_basic', heightCells: 5, connectGroup: 'wall', buildingId: 'testmap_building' });
    level.atoms.set('5,2/west/0', { x: 5, y: 2, face: 'west', half: 0, finishId: 'red' });
    level.attachments.set('new_art', { id: 'new_art', cells: { from: [5, 2], to: [5, 2] }, face: 'west' });
    authored.presentation = { walls: 'cutaway' };

    const payload = authored.serialize();
    assert(payload.version === 8 && payload.levels.level_ground.walls.removed.includes('4,2'), 'v8 payload is a store delta');
    const restored = core.BuildDocument.fromMapData(sampleMapData());
    equal(restored.restore(payload), { restored: true, reset: false }, 'v8 payload restores');
    equal(restored.captureStores(), authored.captureStores(), 'authored -> edit -> diff -> apply is byte-equal');
    equal(restored.serialize(), payload, 'restored document serializes identically');
}

function testLegacyReset() {
    const document = core.BuildDocument.fromMapData(sampleMapData());
    document.level().walls.delete('0,0');
    let messages = 0;
    const result = document.restore({ version: 7, walls: { removed: ['1,0'] } }, {
        onLegacyReset(message) {
            messages++;
            assert(message === 'Build edits were reset for the new build system', 'legacy reset message is stable');
        }
    });
    equal(result, { restored: false, reset: true }, 'v7 build delta is reset');
    assert(messages === 1 && document.level().walls.has('0,0'), 'legacy reset restores authored state and toasts once');
}

function testOpeningGapBecomesStructuralCell() {
    const mapData = sampleMapData();
    mapData.walls.cells = mapData.walls.cells.filter(cell => cell.x !== 2 || cell.y !== 0);
    const document = core.BuildDocument.fromMapData(mapData);
    const bridge = document.level().walls.get('2,0');
    assert(bridge?.bridged === true, 'an opening authored into a tile gap becomes a structural bridge cell');
    assert(bridge.constructionId === mapData.walls.defaults.constructionId,
        'opening bridge inherits the wall defaults');
}

testStoreDelta();
testTypedStores();
testDocumentRoundTrip();
testLegacyReset();
testOpeningGapBecomesStructuralCell();
console.log('Build document tests passed: deltas, typed stores, authored conversion, v8 round trip, v7 reset.');
