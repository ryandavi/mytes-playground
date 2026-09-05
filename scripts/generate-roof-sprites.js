// Deterministic 32px roof atlases. Every material sheet has five neutral
// pattern shades followed by semantic overlay rows; runtime colour substitution
// turns the neutral palette into a material swatch without changing the lines.
const path = require('path');
const { image, writePng } = require('./lib/png');

const SIZE = 32;
const COLUMNS = 16;
const ROWS = 13;
const OUTPUT = path.resolve(__dirname, '../images/roofs');
const COLORS = {
    body: [128, 128, 128, 255], line: [72, 72, 72, 255],
    shade: [102, 102, 102, 255], light: [154, 154, 154, 255],
    edge: [45, 45, 45, 255]
};
const MATERIALS = ['shingle_asphalt', 'tile_clay', 'metal_seam'];

const pixel = (sheet, col, row, x, y, color) => sheet.set(col * SIZE + x, row * SIZE + y, color);
const line = (sheet, col, row, x0, y0, x1, y1, color) => {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let step = 0; step <= steps; step++) {
        pixel(sheet, col, row, Math.round(x0 + (x1 - x0) * step / steps),
            Math.round(y0 + (y1 - y0) * step / steps), color);
    }
};

function pattern(sheet, material, shadeRow) {
    const fill = [COLORS.shade, COLORS.body, COLORS.light, [115, 115, 115, 255], [141, 141, 141, 255]][shadeRow];
    sheet.rect(0, shadeRow * SIZE, SIZE, SIZE, fill);
    if (material === 'shingle_asphalt') {
        for (let y = 7; y < SIZE; y += 8) {
            line(sheet, 0, shadeRow, 0, y, 31, y, COLORS.line);
            for (let x = (y % 16 ? 0 : 8); x < SIZE; x += 16) line(sheet, 0, shadeRow, x, y - 7, x, y, COLORS.line);
        }
    } else if (material === 'tile_clay') {
        for (let x = 0; x < SIZE; x += 8) {
            line(sheet, 0, shadeRow, x, 0, x, 31, COLORS.line);
            line(sheet, 0, shadeRow, x + 1, 0, x + 1, 31, COLORS.light);
        }
    } else {
        for (let x = 3; x < SIZE; x += 8) line(sheet, 0, shadeRow, x, 0, x, 31, COLORS.line);
    }
}

function edgeMask(sheet, mask) {
    if (mask & 1) line(sheet, mask, 5, 0, 1, 31, 1, COLORS.edge);
    if (mask & 2) line(sheet, mask, 5, 30, 0, 30, 31, COLORS.edge);
    if (mask & 4) {
        line(sheet, mask, 5, 0, 29, 31, 29, COLORS.edge);
        line(sheet, mask, 5, 0, 30, 31, 30, COLORS.line);
    }
    if (mask & 8) line(sheet, mask, 5, 1, 0, 1, 31, COLORS.edge);
}

function overlays(sheet) {
    for (let mask = 0; mask < 16; mask++) edgeMask(sheet, mask);
    const cardinal = [[16, 0], [31, 16], [16, 31], [0, 16]];
    cardinal.forEach(([x, y], col) => line(sheet, col, 6, 16, 16, x, y, COLORS.line));
    [[0, 0], [31, 0], [31, 31], [0, 31]].forEach(([x, y], col) => line(sheet, col, 7, 16, 16, x, y, COLORS.edge));
    line(sheet, 0, 8, 0, 16, 31, 16, COLORS.edge);
    line(sheet, 1, 8, 16, 0, 16, 31, COLORS.edge);
    cardinal.forEach(([x, y], col) => line(sheet, col, 9, 16, 16, x, y, COLORS.edge));
    sheet.rect(13, 10 * SIZE + 13, 7, 7, COLORS.edge);
    [[0, 0], [31, 0], [31, 31], [0, 31]].forEach(([x, y], col) => {
        line(sheet, col, 11, 16, 16, x, y, COLORS.edge);
        line(sheet, col, 11, 16, 16, 31 - x, y, COLORS.edge);
    });
    cardinal.forEach(([x, y], col) => {
        line(sheet, col, 12, 16, 16, x, y, COLORS.edge);
        line(sheet, col, 12, 14, 16, x, y, COLORS.line);
    });
}

for (const material of MATERIALS) {
    const sheet = image(COLUMNS * SIZE, ROWS * SIZE);
    for (let shade = 0; shade < 5; shade++) pattern(sheet, material, shade);
    overlays(sheet);
    writePng(path.join(OUTPUT, `${material}.png`), sheet.width, sheet.height, sheet.pixels);
}

console.log(`Generated ${MATERIALS.length} roof atlases (${COLUMNS * SIZE}x${ROWS * SIZE}).`);
