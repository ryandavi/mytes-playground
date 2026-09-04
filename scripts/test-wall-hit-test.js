const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.resolve(__dirname, '../js/Map/Walls/WallHitTest.js'), 'utf8');
const context = vm.createContext({ Object, Array, Number, Math });
vm.runInContext(source, context, { filename: 'WallHitTest.js' });
const WallHitTest = vm.runInContext('WallHitTest', context);

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

const back = { id: 'back', left: 0, right: 32, top: 20, bottom: 192, holes: [] };
const front = { id: 'front', left: 8, right: 24, top: 150, bottom: 192,
    holes: [{ left: 12, right: 20, top: 160, bottom: 192 }] };
const piece = { element: { hidden: false }, hitRegions: [back, front] };

assert(WallHitTest.hit(piece, 10, 170).id === 'front', 'the last rendered span wins');
assert(WallHitTest.hit(piece, 16, 170).id === 'back', 'an opening falls through to art behind it');
assert(WallHitTest.hit(piece, -1, 30).id === 'back', 'rounded-edge tolerance expands the target');
assert(WallHitTest.hit(piece, -3, 30) === null, 'points beyond tolerance miss');
piece.element.hidden = true;
assert(WallHitTest.hit(piece, 10, 170) === null, 'hidden walls cannot be hit');

console.log('Wall hit-test tests passed: z-order, openings, tolerance, hidden mode.');
