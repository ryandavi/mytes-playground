// Minimal deterministic 8-bit RGBA PNG writer, shared by the surface-art
// generators. Deterministic matters: the sheets are committed art, so a
// regeneration that changes bytes without changing pixels shows up as a diff
// and buries a real change in the noise.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

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

/** A writable RGBA surface with the two primitives the generators need. */
function image(width, height) {
    const pixels = Buffer.alloc(width * height * 4);
    const set = (x, y, color) => {
        if (x < 0 || y < 0 || x >= width || y >= height) return;
        const offset = ((y * width) + x) * 4;
        color.forEach((value, index) => { pixels[offset + index] = value; });
    };
    const rect = (x, y, w, h, color) => {
        for (let py = y; py < y + h; py++) for (let px = x; px < x + w; px++) set(px, py, color);
    };
    return { pixels, rect, set, width, height };
}

function writePng(targetPath, width, height, pixels) {
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
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, png);
}

module.exports = { image, writePng };
