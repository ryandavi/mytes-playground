const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = path.resolve(__dirname, '..');
const sources = [
    'js/Map/Build/BuildKeys.js', 'js/Map/Build/StoreDelta.js', 'js/Map/Build/BuildRecordStore.js',
    'js/Map/Build/BuildingPlanStore.js', 'js/Map/Build/RoomPlanStore.js', 'js/Map/Build/WallCellStore.js',
    'js/Map/Build/WallSurfaceAtomStore.js', 'js/Map/Build/AttachmentStore.js', 'js/Map/Build/BuildDocument.js',
    'js/Utility/RectUtils.js', 'js/Map/Regions/SpatialRegion.js', 'js/Map/Regions/RegionManager.js',
    'js/Map/Walls/WallGeometry.js', 'js/Map/Floors/FloorOwnershipResolver.js',
    'js/Map/Regions/RoomTopology.js', 'js/Map/Regions/RoomRegionProjection.js', 'js/Map/Build/BuildTransaction.js'
];
const context = vm.createContext({ console, Map, Set, Object, Array, Number, String, Math, JSON, Error });
for (const source of sources) vm.runInContext(fs.readFileSync(path.join(repoRoot, source), 'utf8'), context, { filename: source });
const core = vm.runInContext('({ StoreDelta, BuildDocument, BuildTransaction, RegionManager })', context);

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function same(a, b, message) {
    assert(core.StoreDelta.stableStringify(a) === core.StoreDelta.stableStringify(b), message);
}

function authoredDocument() {
    const walls = [];
    for (let x = 0; x < 5; x++) {
        walls.push({ x, y: 0, constructionId: 'basic', heightCells: 5, connectGroup: 'wall', buildingId: 'house' });
        walls.push({ x, y: 4, constructionId: 'basic', heightCells: 5, connectGroup: 'wall', buildingId: 'house' });
    }
    for (let y = 1; y < 4; y++) {
        walls.push({ x: 0, y, constructionId: 'basic', heightCells: 5, connectGroup: 'wall', buildingId: 'house' });
        walls.push({ x: 4, y, constructionId: 'basic', heightCells: 5, connectGroup: 'wall', buildingId: 'house' });
    }
    return new core.BuildDocument({
        buildings: [{ id: 'house', displayName: 'House' }],
        levels: { level_ground: {
            walls,
            rooms: [{ id: 'living', buildingId: 'house', displayName: 'Living', origin: 'authored',
                seedCells: ['1,1', '2,1', '3,1', '1,2', '2,2', '3,2', '1,3', '2,3', '3,3'] }]
        } }
    });
}

function testAtomicCommitUndoRedo() {
    const document = authoredDocument();
    const events = [];
    const invalidations = { walls: [], floors: [], grids: [] };
    const regionManager = new core.RegionManager(null, { cellSize: 32 });
    const transaction = new core.BuildTransaction({
        document, width: 5, height: 5, regionManager,
        eventManager: { emit(name, event) { events.push({ name, event }); } },
        renderers: {
            walls: { invalidate(cells) { invalidations.walls.push(cells); } },
            floors: {
                setOwnershipGrid(grid) { invalidations.grids.push(grid); },
                invalidate(blocks) { invalidations.floors.push(blocks); return 2; }
            }
        }
    });
    const original = document.captureStores();
    const committed = transaction.run('Remove wall', (draft, level) => level.walls.delete('2,4'));
    assert(committed.committed && transaction.revision === 1, 'one edit commits one revision');
    assert(events.length === 1 && events[0].name === 'build:committed', 'one edit emits one committed event');
    same(transaction.stats(), {
        transactions: 1, wallRebuilds: 1, ownershipSolves: 1, topologyRebuilds: 1,
        floorChunksRedrawn: 2, wallPiecesRedrawn: 0, hitTests: 0, imageDataReads: 0
    }, 'one edit performs one derived rebuild each');
    assert(invalidations.walls[0].includes('2,4') && invalidations.floors[0].length > 0, 'commit reports structural and ownership dirtiness');
    assert(invalidations.grids[0] === committed.grid, 'renderer receives the committed ownership grid before invalidation');
    const edited = document.captureStores();
    assert(transaction.undo(), 'undo is available');
    same(document.captureStores(), original, 'undo replays the exact inverse store delta');
    assert(transaction.redo(), 'redo is available');
    same(document.captureStores(), edited, 'redo replays the exact forward store delta');
    assert(regionManager.get('room', 'living'), 'each commit refreshes the room projection');
    assert(regionManager.get('room', 'living').shape.cells.size > 1,
        'canonical string cell keys survive SpatialRegion projection');
    assert(Number.isFinite(regionManager.get('room', 'living').bounds.x),
        'projected room bounds remain finite');
}

function testFinishAndAtomDirtiness() {
    const document = authoredDocument();
    const transaction = new core.BuildTransaction({ document, width: 5, height: 5 });
    transaction.initialize();
    const before = document.captureStores();
    const finishDraft = new core.BuildDocument(before);
    finishDraft.level().rooms.set('living', { ...finishDraft.level().rooms.get('living'), floorFinishId: 'tile' });
    const finishDirty = core.BuildTransaction.dirty(
        before, finishDraft.captureStores(), transaction.cache.grid, transaction.cache.grid
    );
    assert(finishDirty.blocks.length === transaction.cache.grid.blocksOf('living').length,
        'floor finish changes dirty every owned block in the room');

    const atomDraft = new core.BuildDocument(before);
    atomDraft.level().atoms.set('0,0/south/0', { x: 0, y: 0, face: 'south', half: 0, finishId: 'blue' });
    const atomDirty = core.BuildTransaction.dirty(
        before, atomDraft.captureStores(), transaction.cache.grid, transaction.cache.grid
    );
    assert(atomDirty.cells.includes('0,0') && atomDirty.blocks.length === 0,
        'wall paint dirties wall rendering without repainting floors');

    const wallFinishDraft = new core.BuildDocument(before);
    wallFinishDraft.level().rooms.set('living', {
        ...wallFinishDraft.level().rooms.get('living'), wallFinishId: 'blue'
    });
    const wallFinishDirty = core.BuildTransaction.dirty(
        before, wallFinishDraft.captureStores(), transaction.cache.grid, transaction.cache.grid
    );
    assert(wallFinishDirty.blocks.length === 0,
        'room wall finishes do not masquerade as floor finish changes');

    const openingDraft = new core.BuildDocument(before);
    openingDraft.level().openings.set('door', { id: 'door', cells: [[2, 0]], axis: 'horizontal' });
    const openingDirty = core.BuildTransaction.dirty(
        before, openingDraft.captureStores(), transaction.cache.grid, transaction.cache.grid
    );
    assert(openingDirty.cells.includes('2,0') && openingDirty.recordsChanged.openings,
        'opening edits dirty their exact wall cells');
    assert(!openingDirty.geometryChanged, 'opening apertures do not rebuild structural pieces');
}

function testRejectAndPreviewAreIsolated() {
    const document = authoredDocument();
    const original = document.captureStores();
    const rejected = new core.BuildTransaction({ document, width: 5, height: 5, validate: () => ({ allowed: false, reason: 'No' }) });
    let threw = false;
    try {
        rejected.run('Rejected', (draft, level) => level.walls.delete('0,0'));
    } catch (error) {
        threw = error.message === 'No';
    }
    assert(threw, 'whole proposed edit is rejected atomically');
    same(document.captureStores(), original, 'rejection never mutates live stores');
    same(rejected.stats(), {
        transactions: 0, wallRebuilds: 0, ownershipSolves: 0, topologyRebuilds: 0,
        floorChunksRedrawn: 0, wallPiecesRedrawn: 0, hitTests: 0, imageDataReads: 0
    }, 'rejection performs no derivation');

    const transaction = new core.BuildTransaction({ document, width: 5, height: 5 });
    const preview = transaction.preview((draft, level) => level.walls.delete('2,4'));
    assert(preview.grid && preview.topology, 'preview derives from scratch stores');
    same(document.captureStores(), original, 'preview never mutates live stores');
    assert(transaction.revision === 0 && transaction.undoStack.length === 0, 'preview creates no revision or history');
    assert(transaction.stats().wallRebuilds === 0, 'preview does not count as a committed rebuild');
}

function testSharedHistoryUsesExactDeltas() {
    const document = authoredDocument();
    const commands = [];
    const transaction = new core.BuildTransaction({
        document, width: 5, height: 5,
        history: { push(command) { commands.push(command); return true; } }
    });
    transaction.initialize();
    const original = document.captureStores();
    transaction.run('Paint atom', (_draft, level) => level.atoms.set('0,0/south/0', {
        x: 0, y: 0, face: 'south', half: 0, finishId: 'blue'
    }));
    const edited = document.captureStores();
    assert(commands.length === 1, 'a committed edit creates one shared history command');
    assert(transaction.undoStack.length === 0, 'shared history is the only chronological stack');
    commands[0].undo();
    same(document.captureStores(), original, 'shared undo removes an atom that was previously absent');
    commands[0].redo();
    same(document.captureStores(), edited, 'shared redo replays the exact forward delta');
    assert(commands.length === 1, 'history replay does not create duplicate commands');
}

testAtomicCommitUndoRedo();
testRejectAndPreviewAreIsolated();
testFinishAndAtomDirtiness();
testSharedHistoryUsesExactDeltas();
console.log('Build transaction tests passed: atomic commit, rebuild budget, dirty sets, preview, undo, redo.');
