const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUTPUT_DIR = path.resolve(__dirname, '../images/walls');
const MATERIALS_PATH = path.resolve(__dirname, '../data/map-objects/wall-materials.json');
const CELL_SIZE = 32;
const FULL_HEIGHT = 160;
const STUB_HEIGHT = 28;
const materialData = JSON.parse(fs.readFileSync(MATERIALS_PATH, 'utf8'));
const MASK_COLORS = materialData.constructions.plaster_wall.debugMaskColors.map(color => [
    parseInt(color.slice(1, 3), 16),
    parseInt(color.slice(3, 5), 16),
    parseInt(color.slice(5, 7), 16),
    255
]);

function crc32(buffer) {
    let crc = 0xffffffff;
    for (const byte of buffer) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
    const name = Buffer.from(type);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
    return Buffer.concat([length, name, data, checksum]);
}

function writePng(fileName, width, height, pixels) {
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0);
    header.writeUInt32BE(height, 4);
    header[8] = 8;
    header[9] = 6;
    const rows = [];
    for (let y = 0; y < height; y++) {
        rows.push(Buffer.from([0]), pixels.subarray(y * width * 4, (y + 1) * width * 4));
    }
    const png = Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        chunk('IHDR', header),
        chunk('IDAT', zlib.deflateSync(Buffer.concat(rows), { level: 9 })),
        chunk('IEND', Buffer.alloc(0))
    ]);
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUTPUT_DIR, fileName), png);
}

function image(width, height) {
    const pixels = Buffer.alloc(width * height * 4);
    const set = (x, y, color) => {
        if (x < 0 || y < 0 || x >= width || y >= height) return;
        const offset = (y * width + x) * 4;
        color.forEach((value, index) => { pixels[offset + index] = value; });
    };
    const rect = (x, y, w, h, color) => {
        for (let py = y; py < y + h; py++) for (let px = x; px < x + w; px++) set(px, py, color);
    };
    return { pixels, rect, set };
}

function horizontalRange(mask) {
    if (mask === 0 || (mask & 10) === 10) return [0, CELL_SIZE];
    if (mask & 2) return [10, CELL_SIZE];
    if (mask & 8) return [0, 22];
    return null;
}

function finishRange(mask) {
    const range = horizontalRange(mask);
    if (!range || (mask & 5) === 0) return range;
    if ((mask & 2) !== 0 && (mask & 8) === 0) return [22, CELL_SIZE];
    if ((mask & 8) !== 0 && (mask & 2) === 0) return [0, 10];
    return range;
}

function drawConstructionFrame(target, frameX, frameY, height, mask) {
    const dark = [118, 109, 88, 255];
    const mid = [225, 220, 201, 255];
    const light = MASK_COLORS[mask];
    const topDepth = height === FULL_HEIGHT ? 7 : 3;
    const occupied = Array.from({ length: height }, () => Array(CELL_SIZE).fill(false));
    const caps = Array.from({ length: height }, () => Array(CELL_SIZE).fill(false));
    const range = horizontalRange(mask);
    if (range) {
        for (let y = 0; y < height; y++) for (let x = range[0]; x < range[1]; x++) occupied[y][x] = true;
        for (let y = 0; y < topDepth; y++) for (let x = range[0]; x < range[1]; x++) caps[y][x] = true;
    }
    if (mask & 5) {
        for (let y = 0; y < height; y++) for (let x = 10; x < 22; x++) occupied[y][x] = true;
        if (!(mask & 1)) {
            for (let y = 0; y < topDepth; y++) for (let x = 10; x < 22; x++) caps[y][x] = true;
        }
    }
    const continuesOutside = (x, y) =>
        (x < 0 && (mask & 8) !== 0) ||
        (x >= CELL_SIZE && (mask & 2) !== 0) ||
        (y < 0 && (mask & 1) !== 0 && x >= 10 && x < 22) ||
        (y >= height && (mask & 4) !== 0 && x >= 10 && x < 22);
    const isOccupied = (x, y) =>
        (x >= 0 && x < CELL_SIZE && y >= 0 && y < height && occupied[y][x]) || continuesOutside(x, y);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < CELL_SIZE; x++) {
            if (!occupied[y][x]) continue;
            const outline = !isOccupied(x - 1, y) || !isOccupied(x + 1, y) ||
                !isOccupied(x, y - 1) || !isOccupied(x, y + 1);
            target.set(frameX + x, frameY + y, outline ? dark : caps[y][x] ? light : mid);
        }
    }
}

function constructionSheet() {
    const target = image(512, FULL_HEIGHT + STUB_HEIGHT);
    for (let mask = 0; mask < 16; mask++) {
        drawConstructionFrame(target, mask * CELL_SIZE, 0, FULL_HEIGHT, mask);
        drawConstructionFrame(target, mask * CELL_SIZE, FULL_HEIGHT, STUB_HEIGHT, mask);
    }
    writePng('construction-plaster.png', 512, FULL_HEIGHT + STUB_HEIGHT, target.pixels);
}

function finishSheet(fileName, wallpaper) {
    const target = image(512, FULL_HEIGHT + STUB_HEIGHT);
    const body = wallpaper ? [176, 202, 224, 255] : [236, 231, 211, 255];
    const baseboard = wallpaper ? [145, 181, 211, 255] : [206, 200, 181, 255];
    for (let mask = 0; mask < 16; mask++) {
        const range = finishRange(mask);
        if (!range) continue;
        const planeStart = range[0] + ((mask & 8) !== 0 ? 0 : 1);
        const planeEnd = range[1] - ((mask & 2) !== 0 ? 0 : 1);
        const planeX = mask * CELL_SIZE + planeStart;
        const planeWidth = planeEnd - planeStart;
        if (planeWidth <= 0) continue;
        target.rect(planeX, 8, planeWidth, FULL_HEIGHT - 9, body);
        if (wallpaper) {
            for (let y = 15; y < FULL_HEIGHT - 4; y += 12) {
                for (let px = planeX + 2; px < planeX + planeWidth; px += 6) {
                    target.rect(px, y, 3, 3, [70, 112, 162, 255]);
                    target.set(px + 1, y - 1, [242, 238, 207, 255]);
                }
            }
        }
        target.rect(planeX, FULL_HEIGHT - 9, planeWidth, 8, baseboard);
        if (!wallpaper) {
            for (let y = 22; y < FULL_HEIGHT - 14; y += 28) {
                target.set(planeX + 7, y, [211, 205, 186, 255]);
                target.set(planeX + 23, y + 9, [242, 238, 220, 255]);
            }
        }
        target.rect(planeX, FULL_HEIGHT + 4, planeWidth, STUB_HEIGHT - 5, body);
    }
    writePng(fileName, 512, FULL_HEIGHT + STUB_HEIGHT, target.pixels);
}

constructionSheet();
finishSheet('finish-plaster-plain.png', false);
finishSheet('finish-wallpaper-blue-flower.png', true);
