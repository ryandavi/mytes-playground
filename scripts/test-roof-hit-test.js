const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const context = vm.createContext({ console, Map, Set, Object, Array, Number, String, Math, JSON });
for (const source of ['js/Map/Build/BuildKeys.js', 'js/Map/Roofs/RoofHitTest.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, source), 'utf8'), context, { filename: source });
}
const { RoofHitTest } = vm.runInContext('({ RoofHitTest })', context);
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const section = (buildingId, zIndex, cells, hidden = false) => ({
    plan: { id: `${buildingId}@level_ground`, buildingId },
    geometry: { key: '1,1', bounds: { left: 1, top: 1 }, cells: new Set(cells) },
    canvas: { hidden }, left: 32, top: 32, width: 64, height: 64, zIndex
});
const renderer = {
    cellSize: 32,
    sections: new Map([
        ['low', section('low', 10, ['1,1'])],
        ['high', section('high', 20, ['1,1'])],
        ['hidden', section('hidden', 30, ['1,1'], true)]
    ]),
    isPresentationVisible: () => true
};
const hitTest = new RoofHitTest(renderer);
assert(hitTest.atMapPoint(40, 40)?.buildingId === 'high', 'highest visible roof wins overlap');
assert(hitTest.atMapPoint(72, 72) === null, 'covered rectangle holes do not hit');
renderer.isPresentationVisible = () => false;
assert(hitTest.atMapPoint(40, 40) === null, 'hidden presentation has no roof target');

console.log('Roof hit-test tests passed: depth, holes, hidden sections, presentation.');
