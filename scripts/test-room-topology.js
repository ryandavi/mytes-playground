const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = path.resolve(__dirname, '..');
const sources = [
    'js/Map/Build/BuildKeys.js',
    'js/Map/Build/StoreDelta.js',
    'js/Map/Build/BuildRecordStore.js',
    'js/Map/Build/RoomPlanStore.js',
    'js/Utility/RectUtils.js',
    'js/Map/Regions/SpatialRegion.js',
    'js/Map/Regions/RegionManager.js',
    'js/Map/Walls/WallGeometry.js',
    'js/Map/Floors/FloorOwnershipResolver.js',
    'js/Map/Regions/RoomTopology.js',
    'js/Map/Regions/RoomRegionProjection.js'
];
const context = vm.createContext({ console, Map, Set, Object, Array, Number, String, Math, JSON, Error });
for (const source of sources) vm.runInContext(fs.readFileSync(path.join(repoRoot, source), 'utf8'), context, { filename: source });
const core = vm.runInContext(`({ BuildKeys, StoreDelta, WallGeometry, FloorOwnershipResolver,
    RoomTopology, RoomRegionProjection, RegionManager })`, context);

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function wallsFrom(rows, buildingId = 'house') {
    const walls = new Map();
    rows.forEach((row, y) => [...row].forEach((value, x) => {
        if (value !== '#') return;
        walls.set(core.BuildKeys.cell(x, y), {
            x, y, constructionId: 'basic', heightCells: 5, connectGroup: 'wall', buildingId
        });
    }));
    return walls;
}

function ownership(width, height, geometry, plans) {
    return core.FloorOwnershipResolver.solve({
        width, height, plans, reachBlocks: 1,
        walls: new Map([...geometry.cells].map(([key, cell]) => [key, { ...cell, mask: geometry.masks.get(key) }]))
    });
}

function testProposalAndProjectionData() {
    const rows = ['#####', '#...#', '#...#', '#...#', '#####'];
    const geometry = core.WallGeometry.compute(wallsFrom(rows));
    const proposal = core.RoomTopology.proposeSeeds({
        width: 5, height: 5, geometry,
        plans: [{ id: 'living', buildingId: 'house', displayName: 'Living', origin: 'authored', seedCells: ['1,1'],
            floorFinishId: 'boards', wallFinishId: 'sage', properties: {} }]
    });
    assert(proposal.plans[0].seedCells.length === 9, 'one plan adopts unowned cells in its enclosure');
    const grid = ownership(5, 5, geometry, proposal.plans);
    const topology = core.RoomTopology.compute({ width: 5, height: 5, geometry, plans: proposal.plans, grid, revision: 4 });
    assert(topology.planStates.get('living').indoor === true, 'enclosed plan is indoor');
    assert(topology.roofableFootprint('house').size === 25, 'roofable footprint includes interior and enclosing walls');
    assert(topology.exposedWallTopEdges('house').length === 20, 'shell exposes the outer building edge');
    const regionManager = new core.RegionManager(null, { cellSize: 32 });
    const regions = core.RoomRegionProjection.sync(regionManager, proposal.plans, grid, topology, 32);
    assert(regions.length === 1 && regions[0].shape.kind === 'tilemask', 'projection publishes one tilemask region per plan');
    assert(regions[0].properties.indoor === true && regions[0].properties.displayName === 'Living',
        'projection carries derived state and persisted identity');
}

function testSplitCreatesStablePlan() {
    const beforeGeometry = core.WallGeometry.compute(wallsFrom(['#####', '#...#', '#...#', '#...#', '#####']));
    const oldPlans = [{ id: 'living', buildingId: 'house', displayName: 'Living', origin: 'authored',
        seedCells: ['1,1', '2,1', '3,1', '1,2', '2,2', '3,2', '1,3', '2,3', '3,3'],
        floorFinishId: 'boards', wallFinishId: 'sage', properties: { lighting: 'warm' } }];
    const previousGrid = ownership(5, 5, beforeGeometry, oldPlans);
    const afterWalls = wallsFrom(['#####', '#.#.#', '#.#.#', '#.#.#', '#####']);
    const afterGeometry = core.WallGeometry.compute(afterWalls);
    const proposal = core.RoomTopology.proposeSeeds({
        width: 5, height: 5, geometry: afterGeometry,
        plans: [{ ...oldPlans[0], seedCells: ['1,1', '1,2', '1,3'] }], previousGrid
    });
    assert(proposal.createdIds.length === 1, 'splitting an enclosure proposes one new room plan');
    const created = proposal.plans.find(plan => proposal.createdIds.includes(plan.id));
    assert(created.seedCells.join(' ') === '3,1 3,2 3,3', 'new room owns only the newly enclosed side');
    assert(created.floorFinishId === 'boards' && created.properties.lighting === 'warm', 'split room inherits decoration');
    assert(created.buildingId === 'house', 'new room inherits the majority enclosing building');
}

function testOpeningAdjacency() {
    const rows = ['#####', '#.#.#', '#.#.#', '#.#.#', '#####'];
    const geometry = core.WallGeometry.compute(wallsFrom(rows));
    const plans = [
        { id: 'A', buildingId: 'house', seedCells: ['1,1', '1,2', '1,3'] },
        { id: 'B', buildingId: 'house', seedCells: ['3,1', '3,2', '3,3'] }
    ];
    const grid = ownership(5, 5, geometry, plans);
    const topology = core.RoomTopology.compute({
        width: 5, height: 5, geometry, plans, grid,
        openings: [{ id: 'door', axis: 'vertical', cells: [[2, 2]] }]
    });
    assert(topology.adjacency.length === 1 && topology.adjacency[0].roomA === 'A' && topology.adjacency[0].roomB === 'B',
        'opening adjacency is derived from ownership beside the opening');
}

// Walling around a painted floor must not repaint the ground it encloses. An
// authored plan in the same situation still fills its enclosure, which is what
// makes "draw four walls, get a room" work.
function testPaintedFootprintIsNotGrown() {
    const rows = ['######', '#....#', '#....#', '#....#', '######'];
    const geometry = core.WallGeometry.compute(wallsFrom(rows));
    const painted = { id: 'patch', buildingId: 'house', displayName: 'Patch', origin: 'painted',
        seedCells: ['2,2'], floorFinishId: 'tile', wallFinishId: null, properties: {} };
    const proposal = core.RoomTopology.proposeSeeds({ width: 6, height: 5, geometry, plans: [painted] });
    assert(proposal.plans.length === 1, 'no room is invented around a painted footprint');
    assert(proposal.plans[0].seedCells.length === 1, 'a painted plan keeps exactly the cells it was painted on');
    assert(proposal.createdIds.length === 0, 'enclosing a painted floor creates nothing');

    const authored = { ...painted, id: 'room', origin: 'authored' };
    const grown = core.RoomTopology.proposeSeeds({ width: 6, height: 5, geometry, plans: [authored] });
    assert(grown.plans[0].seedCells.length === 12, 'an authored plan still fills its enclosure');
}

// Editing a wall must not cost the player a name they typed. Splitting an
// enclosure renames nothing that already existed: the plan that kept its seeds
// keeps its name, and only the genuinely new half gets an invented one.
function testRenamesSurviveWallEdits() {
    const named = { id: 'den', buildingId: 'house', displayName: "Ryan's Den",
        authoredDisplayName: "Ryan's Den", origin: 'authored', seedCells: ['1,1'],
        floorFinishId: 'boards', wallFinishId: 'sage', properties: {} };
    const open = core.WallGeometry.compute(wallsFrom(['#####', '#...#', '#...#', '#...#', '#####']));
    const before = core.RoomTopology.proposeSeeds({ width: 5, height: 5, geometry: open, plans: [named] });
    assert(before.plans[0].displayName === "Ryan's Den", 'a rename survives the first proposal');

    // Now divide it with a wall across the middle.
    const split = core.WallGeometry.compute(wallsFrom(['#####', '#...#', '#####', '#...#', '#####']));
    const after = core.RoomTopology.proposeSeeds({ width: 5, height: 5, geometry: split, plans: before.plans });
    const den = after.plans.find(plan => plan.id === 'den');
    assert(den.displayName === "Ryan's Den", 'the surviving plan keeps the name the player typed');
    // A plan already owning both halves keeps both: the wall divided the space,
    // not the room, so no floor moves and no room is invented behind the
    // player's back. testSplitCreatesStablePlan covers the other case, where
    // the far side is genuinely unowned and does become its own plan.
    assert(after.createdIds.length === 0, 'walling through a room invents no room');
    assert(den.seedCells.length === 6, 'both halves stay with the plan that owned them');
    assert(den.floorFinishId === 'boards' && den.wallFinishId === 'sage',
        'dividing a room does not redecorate it');
}

testProposalAndProjectionData();
testRenamesSurviveWallEdits();
testPaintedFootprintIsNotGrown();
testSplitCreatesStablePlan();
testOpeningAdjacency();
console.log('Room topology tests passed: proposals, painted footprints, renames, split inheritance, footprints, shell edges, opening adjacency.');
