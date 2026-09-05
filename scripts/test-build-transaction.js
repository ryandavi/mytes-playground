const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = path.resolve(__dirname, '..');
const sources = [
    'js/Map/Build/BuildKeys.js', 'js/Map/Build/StoreDelta.js', 'js/Map/Build/BuildRecordStore.js',
    'js/Map/Build/BuildingPlanStore.js', 'js/Map/Build/RoomPlanStore.js', 'js/Map/Build/WallCellStore.js',
    'js/Map/Build/WallSurfaceAtomStore.js', 'js/Map/Build/RoofPlanStore.js', 'js/Map/Build/AttachmentStore.js',
    'js/Map/Build/BuildDocument.js',
    'js/Utility/RectUtils.js', 'js/Map/Regions/SpatialRegion.js', 'js/Map/Regions/RegionManager.js',
    'js/Map/Walls/WallGeometry.js', 'js/Map/Walls/WallSurfaceRuns.js', 'js/Map/Walls/WallFaceResolver.js',
    'js/Map/Roofs/RoofGeometry.js', 'js/Map/Floors/FloorOwnershipResolver.js',
    'js/Map/Regions/RoomTopology.js', 'js/Map/Regions/RoomRegionProjection.js', 'js/Map/Build/BuildDirty.js',
    'js/Map/Build/BuildTransaction.js'
];
const context = vm.createContext({ console, Map, Set, Object, Array, Number, String, Math, JSON, Error });
for (const source of sources) vm.runInContext(fs.readFileSync(path.join(repoRoot, source), 'utf8'), context, { filename: source });
const core = vm.runInContext('({ BuildKeys, StoreDelta, BuildDocument, BuildTransaction, RegionManager })', context);

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
    assert(!finishDirty.ownershipChanged && !finishDirty.roomTopologyChanged && !finishDirty.roomEnvironmentChanged,
        'a finish-only room edit does not invalidate topology or environment consumers');

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
    assert(!wallFinishDirty.roomTopologyChanged && !wallFinishDirty.roomEnvironmentChanged,
        'wall finish changes do not invalidate room consumers');

    const openingDraft = new core.BuildDocument(before);
    openingDraft.level().openings.set('door', { id: 'door', cells: [[2, 0]], axis: 'horizontal' });
    const openingDirty = core.BuildTransaction.dirty(
        before, openingDraft.captureStores(), transaction.cache.grid, transaction.cache.grid
    );
    assert(openingDirty.cells.includes('2,0') && openingDirty.recordsChanged.openings,
        'opening edits dirty their exact wall cells');
    assert(!openingDirty.geometryChanged, 'opening apertures do not rebuild structural pieces');

    const roofDraft = new core.BuildDocument(before);
    roofDraft.level().roofs.set('house@level_ground', {
        id: 'house@level_ground', buildingId: 'house', levelId: 'level_ground', style: 'hip'
    });
    const roofDirty = core.BuildTransaction.dirty(
        before, roofDraft.captureStores(), transaction.cache.grid, transaction.cache.grid
    );
    assert(roofDirty.roofBuildingIds.length === 1 && roofDirty.roofBuildingIds[0] === 'house',
        'roof plan edits dirty their building');

    const structureDraft = new core.BuildDocument(before);
    structureDraft.level().walls.delete('0,0');
    const structureDirty = core.BuildTransaction.dirty(
        before, structureDraft.captureStores(), transaction.cache.grid, transaction.cache.grid
    );
    assert(structureDirty.roofBuildingIds.includes('house'), 'wall edits dirty the owning roof');
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

function testRoomDefinitionRemovalDoesNotLeaveEmptyPlan() {
    const document = authoredDocument();
    const transaction = new core.BuildTransaction({ document, width: 5, height: 5 });
    transaction.initialize();
    const original = document.captureStores();
    const removed = transaction.run('Remove Living', (_draft, level) => level.rooms.delete('living'));
    assert(removed.committed, 'room definition removal commits');
    assert(!document.level().rooms.has('living'), 'removed room plan is deleted instead of retained with zero tiles');
    assert(document.level().rooms.values().every(room => room.seedCells.length > 0),
        'topology replacement never leaves a grey zero-tile plan behind');
    assert(transaction.undo(), 'room definition removal is undoable');
    same(document.captureStores(), original, 'undo restores the exact removed room definition');
}

function testRandomEditSequences() {
    let state = 0x6d2b79f5;
    const random = () => {
        state = Math.imul(state ^ (state >>> 15), state | 1);
        state ^= state + Math.imul(state ^ (state >>> 7), state | 61);
        return ((state ^ (state >>> 14)) >>> 0) / 4294967296;
    };
    const document = authoredDocument();
    document.level().rooms.set('painted', {
        id: 'painted', buildingId: 'house', displayName: 'Painted', origin: 'painted', seedCells: []
    });
    document.authored = document.captureStores();
    const transaction = new core.BuildTransaction({ document, width: 5, height: 5 });
    transaction.initialize();
    const wallRecord = { constructionId: 'basic', heightCells: 5, connectGroup: 'wall', buildingId: 'house' };
    for (let run = 0; run < 40; run++) {
        const before = document.captureStores();
        const beforeStats = transaction.stats();
        const x = Math.floor(random() * 5);
        const y = Math.floor(random() * 5);
        const key = core.BuildKeys.cell(x, y);
        const touchedAtoms = new Set();
        const result = transaction.run(`Property edit ${run}`, (_draft, level) => {
            if (run % 10 === 0) {
                const walls = level.walls.values();
                const source = walls[run % walls.length];
                const target = Array.from({ length: 25 }, (_, index) => ({ x: index % 5, y: Math.floor(index / 5) }))
                    .find(cell => !level.walls.has(core.BuildKeys.cell(cell.x, cell.y)));
                if (source && target) {
                    const sourceKey = core.BuildKeys.cell(source.x, source.y);
                    const targetKey = core.BuildKeys.cell(target.x, target.y);
                    const movingAtoms = level.atoms.atomsOfCell(source.x, source.y);
                    for (const atom of movingAtoms) {
                        touchedAtoms.add(core.BuildKeys.atom(atom.x, atom.y, atom.face, atom.half));
                        touchedAtoms.add(core.BuildKeys.atom(target.x, target.y, atom.face, atom.half));
                    }
                    const owner = level.rooms.ownerOfSeed(targetKey);
                    if (owner) level.rooms.removeSeed(owner, targetKey);
                    level.walls.delete(sourceKey);
                    level.walls.setCell(target.x, target.y, source);
                    level.atoms.translateCells(new Set([sourceKey]), target.x - source.x, target.y - source.y);
                    return;
                }
            }
            const existing = level.walls.get(key);
            if (existing && run % 4 === 0) {
                level.walls.delete(key);
                for (const atom of level.atoms.atomsOfCell(x, y)) {
                    touchedAtoms.add(core.BuildKeys.atom(atom.x, atom.y, atom.face, atom.half));
                }
                level.atoms.deleteCell(x, y);
                return;
            }
            if (existing) {
                const atomKey = core.BuildKeys.atom(x, y, 'south', run % 2);
                touchedAtoms.add(atomKey);
                const current = level.atoms.get(atomKey)?.finishId;
                const finishId = current === 'finish_a' ? 'finish_b' : 'finish_a';
                level.atoms.set(atomKey, { x, y, face: 'south', half: run % 2, finishId });
                return;
            }
            if (run % 3 === 0) {
                const owner = level.rooms.ownerOfSeed(key);
                if (owner) level.rooms.removeSeed(owner, key);
                level.walls.setCell(x, y, wallRecord);
                return;
            }
            level.rooms.assignSeed(level.rooms.ownerOfSeed(key) === 'painted' ? 'living' : 'painted', key);
        });
        assert(result.committed, `property edit ${run} commits`);
        const after = document.captureStores();
        const afterStats = transaction.stats();
        for (const counter of ['transactions', 'wallRebuilds', 'ownershipSolves', 'topologyRebuilds']) {
            assert(afterStats[counter] === beforeStats[counter] + 1,
                `property edit ${run} performs exactly one ${counter}`);
        }
        for (const [atomKey, atom] of before.levels.level_ground.atoms) {
            if (!touchedAtoms.has(atomKey) && after.levels.level_ground.atoms.has(atomKey)) {
                same(after.levels.level_ground.atoms.get(atomKey), atom,
                    `property edit ${run} preserves unchanged atom ${atomKey}`);
            }
        }
        for (const [wallKey] of before.levels.level_ground.walls) {
            if (after.levels.level_ground.walls.has(wallKey)) continue;
            assert(![...after.levels.level_ground.atoms.keys()].some(atomKey => atomKey.startsWith(`${wallKey}/`)),
                `property edit ${run} removes atoms with their wall cell`);
        }
        const first = transaction.derive(document, { proposeSeeds: false, count: false });
        const second = transaction.derive(document, { proposeSeeds: false, count: false });
        same(first.grid.owner, second.grid.owner, `property edit ${run} ownership is idempotent`);
        same(first.topology.components.map(component => [component.id, component.cells, component.planIds]),
            second.topology.components.map(component => [component.id, component.cells, component.planIds]),
            `property edit ${run} topology is idempotent`);
        assert(transaction.undo(), `property edit ${run} can undo`);
        same(document.captureStores(), before, `property edit ${run} undo is byte-equal`);
        assert(transaction.redo(), `property edit ${run} can redo`);
        same(document.captureStores(), after, `property edit ${run} redo is byte-equal`);
    }
}

function testRoofPlanLifecycle() {
    const document = authoredDocument();
    const transaction = new core.BuildTransaction({
        document, width: 5, height: 5,
        roofDefaults: { style: 'flat', finishId: 'shingle', colorId: 'slate', visibility: 'auto' }
    });
    transaction.initialize();
    const before = document.captureStores();
    transaction.run('Create shed', draft => draft.buildings.set('shed', { id: 'shed', displayName: 'Shed' }));
    const roof = document.level().roofs.forBuilding('shed');
    assert(roof?.finishId === 'shingle', 'a new building gets one default roof plan');
    assert(transaction.cache.roofs.get(roof.id)?.sections.length === 0, 'roof geometry derives inside the transaction');
    const created = document.captureStores();
    assert(transaction.undo(), 'roof creation undoes with its building');
    same(document.captureStores(), before, 'roof creation undo is byte-equal');
    assert(transaction.redo(), 'roof creation redoes with its building');
    same(document.captureStores(), created, 'roof creation redo is byte-equal');
    transaction.run('Delete shed', draft => draft.buildings.delete('shed'));
    assert(!document.level().roofs.forBuilding('shed'), 'deleting a building deletes its roof in the same transaction');
}

testAtomicCommitUndoRedo();
testRejectAndPreviewAreIsolated();
testFinishAndAtomDirtiness();
testSharedHistoryUsesExactDeltas();
testRoomDefinitionRemovalDoesNotLeaveEmptyPlan();
testRoofPlanLifecycle();
testRandomEditSequences();
console.log('Build transaction tests passed: atomic commit, rebuild budget, dirty sets, preview, undo, redo, rooms, roofs, 40 property edits.');
