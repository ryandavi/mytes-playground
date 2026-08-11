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

/** Decodes an 8-bit RGBA PNG written by writePng. Returns null for anything else. */
function readPng(targetPath) {
    if (!fs.existsSync(targetPath)) return null;
    const buffer = fs.readFileSync(targetPath);
    let offset = 8;
    let width = 0;
    let height = 0;
    let depth = 0;
    let colorType = 0;
    const parts = [];
    while (offset + 8 <= buffer.length) {
        const length = buffer.readUInt32BE(offset);
        const type = buffer.toString('ascii', offset + 4, offset + 8);
        const data = buffer.subarray(offset + 8, offset + 8 + length);
        if (type === 'IHDR') {
            width = data.readUInt32BE(0);
            height = data.readUInt32BE(4);
            depth = data[8];
            colorType = data[9];
        }
        if (type === 'IDAT') parts.push(data);
        offset += 12 + length;
    }
    if (depth !== 8 || colorType !== 6) return null;
    const raw = zlib.inflateSync(Buffer.concat(parts));
    const stride = width * 4;
    const pixels = Buffer.alloc(height * stride);
    for (let y = 0; y < height; y++) {
        const filter = raw[y * (stride + 1)];
        const line = raw.subarray((y * (stride + 1)) + 1, (y + 1) * (stride + 1));
        for (let x = 0; x < stride; x++) {
            const a = x >= 4 ? pixels[(y * stride) + x - 4] : 0;
            const b = y > 0 ? pixels[((y - 1) * stride) + x] : 0;
            const c = (x >= 4 && y > 0) ? pixels[((y - 1) * stride) + x - 4] : 0;
            let value = line[x];
            if (filter === 1) value += a;
            else if (filter === 2) value += b;
            else if (filter === 3) value += (a + b) >> 1;
            else if (filter === 4) {
                const p = a + b - c;
                const pa = Math.abs(p - a);
                const pb = Math.abs(p - b);
                const pc = Math.abs(p - c);
                value += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
            }
            pixels[(y * stride) + x] = value & 255;
        }
    }
    return { width, height, pixels };
}

module.exports = { image, writePng, readPng };
