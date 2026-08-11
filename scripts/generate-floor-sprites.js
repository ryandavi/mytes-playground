// Placeholder floor art generator.
//
// A floor finish is ONE tileable tile — no masks, no ends, no silhouette. That
// is the whole difference from a wall finish: a wall has to resolve where it
// runs out, a floor never runs out, it just repeats. So the sheet is a plain
// row of tiles and the runtime does nothing but repeat one.
//
// Every tile must tile seamlessly against ITSELF on all four edges, because a
// room is filled by repeating a single tile. Anything that reads across the
// seam — a plank that runs off the right edge, a grout line — has to arrive
// back on the opposite edge at the same offset.
//
// Tones are declared per finish so a colour-only floor can borrow this art and
// recolour it (see FinishPalette): every pixel must be one of the declared
// tones, or recolouring leaves it behind at the template's colour.

const path = require('path');
const { image, writePng } = require('./lib/png');

const OUTPUT = path.resolve(__dirname, '../images/floors/floors.png');
const TILE = 32;

const FLOORS = [
    {
        id: 'floor_boards',
        pattern: 'boards',
        palette: { body: [214, 184, 143, 255], grain: [199, 168, 127, 255], seam: [178, 146, 106, 255] }
    },
    {
        id: 'floor_tile_check',
        pattern: 'check',
        palette: { body: [226, 222, 211, 255], grain: [206, 201, 188, 255], seam: [188, 182, 168, 255] }
    },
    {
        id: 'floor_carpet',
        pattern: 'carpet',
        palette: { body: [168, 158, 178, 255], grain: [178, 169, 187, 255], seam: [156, 146, 167, 255] }
    }
];

function drawTile(target, x0, floor) {
    const { body, grain, seam } = floor.palette;
    target.rect(x0, 0, TILE, TILE, body);

    if (floor.pattern === 'boards') {
        // Two 16px courses. The seam runs the full width so it meets itself on
        // the next tile; the end joint is offset per course so a repeat does
        // not line the joints up into a visible column.
        for (const y of [0, 16]) {
            target.rect(x0, y, TILE, 1, seam);
            const joint = y === 0 ? 8 : 24;
            target.rect(x0 + joint, y, 1, 16, seam);
            for (let gx = 0; gx < TILE; gx += 7) {
                target.set(x0 + ((gx + (y === 0 ? 2 : 5)) % TILE), y + (y === 0 ? 6 : 11), grain);
            }
        }
    } else if (floor.pattern === 'check') {
        // 16px squares, alternating, with grout on the shared edges only — so
        // two abutting tiles produce one grout line, not two.
        target.rect(x0 + 16, 0, 16, 16, grain);
        target.rect(x0, 16, 16, 16, grain);
        target.rect(x0, 0, TILE, 1, seam);
        target.rect(x0, 16, TILE, 1, seam);
        target.rect(x0, 0, 1, TILE, seam);
        target.rect(x0 + 16, 0, 1, TILE, seam);
    } else if (floor.pattern === 'carpet') {
        // Flecks on a fixed lattice, wrapped, so the repeat has no seam and no
        // obvious grid.
        for (let y = 0; y < TILE; y += 4) {
            for (let x = 0; x < TILE; x += 4) {
                const odd = ((x + y) / 4) % 2 === 0;
                target.set(x0 + ((x + (odd ? 1 : 3)) % TILE), (y + (odd ? 2 : 0)) % TILE, odd ? grain : seam);
            }
        }
    }
}

const target = image(FLOORS.length * TILE, TILE);
FLOORS.forEach((floor, index) => drawTile(target, index * TILE, floor));
writePng(OUTPUT, FLOORS.length * TILE, TILE, target.pixels);

const hex = color => '#' + color.slice(0, 3).map(v => v.toString(16).padStart(2, '0')).join('');
console.log(`floors.png ${FLOORS.length * TILE}x${TILE}`);
FLOORS.forEach((floor, index) => {
    const palette = Object.entries(floor.palette).map(([slot, c]) => `"${slot}": "${hex(c)}"`).join(', ');
    console.log(`  ${floor.id}\n    "tile": ${index}\n    "palette": { ${palette} }`);
});
