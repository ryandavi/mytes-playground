// Placeholder wall art generator (schema v3).
//
// Geometry follows the authored wall tilesets: the wall's footprint is a band
// of THICKNESS px CENTERED on its cell, not flush to the cell edge, and every
// free end is rounded off — no hard corners, no outlines, just a darker top cap
// over a lighter face. Frames are built from that footprint, so the rounding is
// inherited by everything derived from it, paint masks included.
//
// The sheet holds two bands — the tall wall and the low wall — of 16 mask
// columns each, plus two extra columns holding the transition pieces that join
// a tall run to a low one. Transitions only ever happen along a straight
// horizontal run, so two tiles cover every case instead of a variant per mask.
//
// Paint masks are not authored at all: WallMaterialRegistry derives them from
// the art as "every pixel that is not the cap colour", so the geometry exists
// in exactly one place.
//
// Both bands are FRAME_HEIGHT tall and anchored so their bottom row sits on the
// cell's south edge, which means the renderer never does height math.

const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.resolve(__dirname, '../images/walls');
const CELL_SIZE = 32;
const THICKNESS = 14;                              // wall footprint depth
const INSET = (CELL_SIZE - THICKNESS) / 2;         // 9 — centers it on the cell
const CAP_DEPTH = THICKNESS;                       // the top reads as deep as the wall is thick
const HEIGHT = 160;                                // face height above the baseline
const STUB_HEIGHT = 28;                            // lowered height in a cutaway
const RADIUS = 4;                                  // corner rounding
const FRAME_HEIGHT = HEIGHT + CELL_SIZE;           // one band height, every state
const BASELINE_ROW = FRAME_HEIGHT - 1 - INSET;     // footprint's south edge = the wall's foot
const PAD = RADIUS + 2;

const CAP_COLOR = [206, 200, 181, 255];
const FACE_COLOR = [236, 231, 211, 255];
const WHITE = [255, 255, 255, 255];

const SPLIT = CELL_SIZE / 2;                       // where a transition steps
const RISER = 10;                                  // width of the step's end face (must survive rounding)
const COLUMNS = 18;                                // 16 masks + 2 transitions
const TRANSITION_COLUMNS = { rampDown: 16, rampUp: 17 };
const BAND_ORDER = ['full', 'stub'];
const BANDS = Object.fromEntries(BAND_ORDER.map((name, index) => [name, index * FRAME_HEIGHT]));
const SHEET_HEIGHT = BAND_ORDER.length * FRAME_HEIGHT;

// Kept only so a debug build can tint each mask's cap a different colour, which
// makes a wrong mask obvious at a glance.
const MASK_COLORS = [
    [0, 0, 0], [128, 0, 0], [0, 128, 0], [128, 128, 0],
    [0, 0, 128], [128, 0, 128], [0, 128, 128], [192, 192, 192],
    [128, 128, 128], [255, 0, 0], [0, 255, 0], [255, 255, 0],
    [0, 0, 255], [255, 0, 255], [0, 255, 255], [255, 255, 255]
].map(color => [...color, 255]);

// ── PNG output ───────────────────────────────────────────────────────────────

const { image, writePng: writePngTo } = require('./lib/png');

function writePng(fileName, width, height, pixels) {
    writePngTo(path.join(OUTPUT_DIR, fileName), width, height, pixels);
}

// ── Shape helpers ────────────────────────────────────────────────────────────

// A boolean bitmap on a padded canvas, so a shape can be extended past the cell
// wherever the wall continues into a neighbor: the rounding then happens
// outside the crop and the seam between two cells stays perfectly flush.
function grid(width, height) {
    const cells = new Uint8Array(width * height);
    return {
        width, height, cells,
        get: (x, y) => (x < 0 || y < 0 || x >= width || y >= height ? 0 : cells[(y * width) + x]),
        set: (x, y) => {
            if (x < 0 || y < 0 || x >= width || y >= height) return;
            cells[(y * width) + x] = 1;
        },
        rect(x0, y0, x1, y1) {
            for (let y = Math.max(0, y0); y < Math.min(height, y1); y++) {
                for (let x = Math.max(0, x0); x < Math.min(width, x1); x++) cells[(y * width) + x] = 1;
            }
        }
    };
}

function disc(radius) {
    const offsets = [];
    for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
            if ((dx * dx) + (dy * dy) <= radius * radius) offsets.push([dx, dy]);
        }
    }
    return offsets;
}

// X is edge-extended rather than treated as empty: a wall that continues into
// the next cell reaches the padded border, and rounding it there would pinch
// the seam between two neighboring frames.
function morph(source, offsets, erode) {
    const output = grid(source.width, source.height);
    const clampX = x => Math.max(0, Math.min(source.width - 1, x));
    for (let y = 0; y < source.height; y++) {
        for (let x = 0; x < source.width; x++) {
            let hit = erode;
            for (const [dx, dy] of offsets) {
                const value = source.get(clampX(x + dx), y + dy);
                if (erode ? !value : value) { hit = !erode; break; }
            }
            if (hit) output.set(x, y);
        }
    }
    return output;
}

// Opening rounds convex corners, closing rounds concave ones. Together they
// turn a union of rectangles into the soft shape the authored tilesets use.
function round(source, radius = RADIUS) {
    const offsets = disc(radius);
    const opened = morph(morph(source, offsets, true), offsets, false);
    return morph(morph(opened, offsets, false), offsets, true);
}

// ── Wall geometry ────────────────────────────────────────────────────────────

const connects = (mask, bit) => (mask & bit) !== 0;

// The wall's footprint inside its cell, in padded coordinates. Arms reach the
// cell edge — and on into the padding — only where the wall actually continues.
function footprint(mask) {
    const shape = grid(CELL_SIZE + (PAD * 2), CELL_SIZE + (PAD * 2));
    const near = PAD + INSET;
    const far = PAD + CELL_SIZE - INSET;
    if (connects(mask, 2) || connects(mask, 8)) {
        shape.rect(connects(mask, 8) ? 0 : near, near, connects(mask, 2) ? shape.width : far, far);
    }
    if (connects(mask, 1) || connects(mask, 4)) {
        shape.rect(near, connects(mask, 1) ? 0 : near, far, connects(mask, 4) ? shape.height : far);
    }
    if (mask === 0) shape.rect(near, near, far, far);
    return round(shape);
}

/**
 * Builds one frame: the cap is the footprint raised by the wall's height at
 * that column, and the face hangs from the cap down to the baseline.
 *
 * `face` runs up behind the cap so rounding can never open a seam between the
 * two; `paint` stops at the cap, because a finish is drawn over the frame and
 * must not spill onto the wall's top.
 * @returns {{cap: object, face: object, paint: object}} padded, rounded grids
 */
function frame(mask, dropAt) {
    const shape = footprint(mask);
    const cap = grid(CELL_SIZE + (PAD * 2), FRAME_HEIGHT + (PAD * 2));
    const face = grid(cap.width, cap.height);
    const paint = grid(cap.width, cap.height);

    for (let x = 0; x < shape.width; x++) {
        let top = -1;
        let bottom = -1;
        for (let y = 0; y < shape.height; y++) {
            if (!shape.get(x, y)) continue;
            if (top < 0) top = y;
            bottom = y;
        }
        if (top < 0) continue;

        // Padded footprint rows map onto padded frame rows one to one; the
        // frame is simply taller below them.
        const drop = dropAt(x - PAD);
        for (let y = top; y <= bottom; y++) {
            if (shape.get(x, y)) cap.set(x, y + drop);
        }
        for (let y = top + drop; y <= bottom + HEIGHT; y++) face.set(x, y);
        for (let y = bottom + drop + 1; y <= bottom + HEIGHT; y++) paint.set(x, y);
    }

    // The cap already carries the footprint's rounding; the face is a stack of
    // columns, so only its free ends and its foot still need it.
    return { cap, face: round(face), paint: round(paint) };
}

/**
 * A transition tile: the tall wall on one side of the cell, the low wall on the
 * other, and a straight vertical step between them. The step's end face is
 * drawn in the cap colour so the dark line along the top of a wall runs
 * unbroken from the tall run, down the step, and along the low run.
 */
function transitionFrame(direction) {
    const drop = HEIGHT - STUB_HEIGHT;
    const lowered = direction === 'rampDown'
        ? x => (x >= SPLIT ? drop : 0)
        : x => (x < SPLIT ? drop : 0);
    const built = frame(10, lowered);

    // The end face spans from the top of the tall cap to the bottom of the low
    // cap, so both cap bands terminate into it rather than into thin air.
    const capTop = PAD + INSET;
    const capBottom = PAD + INSET + CAP_DEPTH + drop;
    const from = PAD + (direction === 'rampDown' ? SPLIT : SPLIT - RISER);
    for (let x = from; x < from + RISER; x++) {
        for (let y = capTop; y < capBottom; y++) built.cap.set(x, y);
    }
    return { cap: round(built.cap), face: built.face };
}

// ── Sheet ────────────────────────────────────────────────────────────────────

function blit(target, source, frameX, band, color, filter = null) {
    for (let y = 0; y < FRAME_HEIGHT; y++) {
        for (let x = 0; x < CELL_SIZE; x++) {
            if (!source.get(x + PAD, y + PAD)) continue;
            if (filter && !filter(x, y)) continue;
            target.set(frameX + x, band + y, color);
        }
    }
}

function constructionSheet(fileName, debugCaps) {
    const width = COLUMNS * CELL_SIZE;
    const target = image(width, SHEET_HEIGHT);
    const drops = { full: () => 0, stub: () => HEIGHT - STUB_HEIGHT };
    for (let mask = 0; mask < 16; mask++) {
        const frameX = mask * CELL_SIZE;
        for (const state of BAND_ORDER) {
            const { cap, face } = frame(mask, drops[state]);
            blit(target, face, frameX, BANDS[state], FACE_COLOR);
            blit(target, cap, frameX, BANDS[state], debugCaps ? MASK_COLORS[mask] : CAP_COLOR);
        }
    }
    for (const [direction, column] of Object.entries(TRANSITION_COLUMNS)) {
        const { cap, face } = transitionFrame(direction);
        blit(target, face, column * CELL_SIZE, BANDS.full, FACE_COLOR);
        blit(target, cap, column * CELL_SIZE, BANDS.full, debugCaps ? MASK_COLORS[10] : CAP_COLOR);
    }
    writePng(fileName, width, SHEET_HEIGHT, target.pixels);
}

// ── Finish swatches ──────────────────────────────────────────────────────────
//
// Three columns per finish — west end, body, east end — each a full FRAME_HEIGHT
// column that the registry draws at y=0, so a swatch row IS a frame row and
// nothing downstream does height math or extrapolates a missing region.
//
// The construction's paint mask still enforces the outer silhouette, so the end
// columns are not about the rounded outline: they are where the finish says how
// its own horizontal structure resolves when the wall runs out. A skirting can
// return around the end, a dado can taper, a plain paint can do nothing. The
// engine can't infer that — a bottom band is not necessarily a skirting — so it
// is authored here rather than guessed at composite time.
//
// An end column must tile against the body on its NON-free side: mask 2
// terminates west but carries on east into the next cell, so everything east of
// the rounding has to match the body column pixel for pixel.

const PAINT_COLUMNS = ['west', 'body', 'east', 'westStop', 'eastStop'];
const BAND_HEIGHT = 9;
const WALL_TOP = BASELINE_ROW + 1 - HEIGHT;        // first face row of a full wall

const PAINTS = [
    {
        id: 'plaster_plain',
        pattern: 'speckle',
        palette: {
            body: [236, 231, 211, 255],
            band: [246, 243, 231, 255],
            accent: [221, 215, 196, 255],
            shade: [211, 205, 186, 255],
            light: [242, 238, 220, 255]
        }
    },
    {
        id: 'wallpaper_blue_flower',
        pattern: 'flower',
        palette: {
            body: [176, 202, 224, 255],
            band: [214, 231, 245, 255],
            accent: [161, 186, 209, 255],
            motif: [70, 112, 162, 255],
            light: [242, 238, 207, 255]
        }
    }
];

/**
 * The wall's foot, per pixel column, for one mask — read back off the generated
 * face so the paint is authored against the geometry that actually ships rather
 * than against a second copy of the rounding maths.
 * @returns {number[]} CELL_SIZE frame rows, clamped to the baseline
 */
function footProfile(mask, clamp = true) {
    const { face } = frame(mask, () => 0);
    const profile = [];
    for (let x = 0; x < CELL_SIZE; x++) {
        let foot = -1;
        for (let y = 0; y < FRAME_HEIGHT; y++) if (face.get(x + PAD, y + PAD)) foot = y;
        // -1 means this column has no wall at all. It must stay TRANSPARENT:
        // see the transparency rule in paintColumn.
        if (foot < 0) profile.push(-1);
        else profile.push(clamp ? Math.min(foot, BASELINE_ROW) : foot);
    }
    return profile;
}

/**
 * One finish column. The band sits ON the foot, so where the foot curves up at a
 * free end the band rides up with it and keeps its full height — that is the
 * whole point of authoring ends. Below the foot the wall carries on south into
 * the next cell, so those rows are body: a band belongs at a foot, and that
 * stretch has none.
 */
function paintColumn(target, x0, paint, profile) {
    const bandTop = x => profile[x] - BAND_HEIGHT + 1;
    for (let x = 0; x < CELL_SIZE; x++) {
        // TRANSPARENCY RULE — a finish column is opaque from row 0 down to its
        // own foot and NOWHERE else. Two things follow, and both have been got
        // wrong before:
        //
        //   * a column whose profile is -1 has no wall in it and stays empty.
        //     Do not fill it 'because the mask will clip it anyway'.
        //   * nothing is drawn BELOW the foot. That stretch belongs to the next
        //     cell south, which paints its own face over it.
        //
        // Runtime clipping hides a violation of either rule, so it survives
        // testing and only shows up as a stray edge once art is hand-authored,
        // reused at an offset, or drawn where the mask happens not to cover.
        if (profile[x] < 0) continue;
        const top = bandTop(x);
        target.rect(x0 + x, 0, 1, top, paint.palette.body);
        // Lighter than the body, never darker: the wall's cap is the only dark
        // tone in this art, so a dark band reads as a second cap.
        target.rect(x0 + x, top, 1, BAND_HEIGHT, paint.palette.band);
        // A skirting reads by the shadow line along its top, not by being
        // brighter than the wall — there is only ~20 of headroom to white here,
        // so brightness alone leaves it invisible on a pale exterior. One pixel,
        // darker than the body but well short of the cap, so it stays a line
        // rather than reading as a second cap. It is drawn per column against
        // this column's own band, so it follows every curve the band does.
        if (paint.palette.accent && top > 0) target.set(x0 + x, top - 1, paint.palette.accent);
    }

    // Pattern never crosses into the band, which is why it is plotted per pixel
    // against that column's own band top rather than rectangle-filled.
    const plot = (x, y, color) => {
        if (x >= 0 && x < CELL_SIZE && y >= 0 && y < bandTop(x)) target.set(x0 + x, y, color);
    };
    if (paint.pattern === 'flower') {
        for (let y = WALL_TOP + 15; y < BASELINE_ROW - BAND_HEIGHT - 4; y += 12) {
            for (let x = 2; x < CELL_SIZE; x += 6) {
                for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) {
                    plot(x + dx, y + dy, paint.palette.motif);
                }
                plot(x + 1, y - 1, paint.palette.light);
            }
        }
    } else if (paint.pattern === 'speckle') {
        for (let y = WALL_TOP + 22; y < BASELINE_ROW - BAND_HEIGHT - 6; y += 28) {
            plot(7, y, paint.palette.shade);
            plot(23, y + 9, paint.palette.light);
        }
    }
}

function paintSheet(fileName) {
    const width = PAINTS.length * PAINT_COLUMNS.length * CELL_SIZE;
    const target = image(width, FRAME_HEIGHT);
    // A free west edge is mask 2 (terminates west, runs on east) and a free east
    // edge is its mirror; every mask with that edge free rounds identically, so
    // two profiles cover all of them.
    const profiles = {
        west: footProfile(2),
        body: new Array(CELL_SIZE).fill(BASELINE_ROW),
        east: footProfile(8),
        // Where an arm meets a wall running south, the foot does not rise — it
        // DIVES, by the same 4/2/1/1 the free end climbs, as the silhouette
        // rounds into the south wall. These two are that mirror: read unclamped
        // off the elbows themselves (E+S and S+W) and authored at the position
        // they are used, so they need no shifting.
        westStop: footProfile(6, false),
        eastStop: footProfile(12, false)
    };
    PAINTS.forEach((paint, index) => {
        PAINT_COLUMNS.forEach((column, offset) => {
            paintColumn(target, ((index * PAINT_COLUMNS.length) + offset) * CELL_SIZE, paint, profiles[column]);
        });
    });
    writePng(fileName, width, FRAME_HEIGHT, target.pixels);
    return width;
}

// ── Wall fixtures ────────────────────────────────────────────────────────────
//
// Decorations mounted on a wall face. One row of frames, each the fixture's
// declared size, indexed by the `piece` rect in wall-materials.json.

function fixtureSheet(fileName) {
    const width = 36;
    const height = 28;
    const target = image(width * 2, height);
    const frame = [92, 66, 44, 255];
    const frameLight = [124, 92, 62, 255];
    const mat = [244, 240, 228, 255];
    const skyTop = [168, 200, 226, 255];
    const skyLow = [206, 226, 240, 255];
    const hill = [138, 168, 116, 255];
    const hillFar = [166, 190, 142, 255];
    const sun = [246, 224, 150, 255];
    const canvasColor = [226, 216, 198, 255];

    const framed = (x0, paint) => {
        target.rect(x0, 0, width, height, frame);
        target.rect(x0 + 1, 1, width - 2, 1, frameLight);
        target.rect(x0 + 2, 2, width - 4, height - 4, mat);
        paint(x0 + 3, 3, width - 6, height - 6);
    };

    // Landscape: horizon, far ridge, near ridge, sun.
    framed(0, (x0, y0, w, h) => {
        target.rect(x0, y0, w, h, skyTop);
        target.rect(x0, y0 + Math.round(h * 0.45), w, Math.round(h * 0.2), skyLow);
        target.rect(x0 + w - 9, y0 + 2, 4, 4, sun);
        for (let x = 0; x < w; x++) {
            const far = y0 + Math.round(h * 0.58) + ((x % 9 < 4) ? 0 : 1);
            target.rect(x0 + x, far, 1, y0 + h - far, hillFar);
            const near = y0 + Math.round(h * 0.72) + ((x % 6 < 3) ? 1 : 0);
            target.rect(x0 + x, near, 1, y0 + h - near, hill);
        }
    });

    // Still life: a pot and a sprig, so a room can vary its walls.
    framed(width, (x0, y0, w, h) => {
        target.rect(x0, y0, w, h, canvasColor);
        const potW = Math.round(w * 0.4);
        const potX = x0 + Math.round((w - potW) / 2);
        target.rect(potX, y0 + Math.round(h * 0.45), potW, Math.round(h * 0.5), [176, 122, 96, 255]);
        target.rect(potX - 1, y0 + Math.round(h * 0.45), potW + 2, 2, [196, 142, 114, 255]);
        target.rect(potX + 2, y0 + Math.round(h * 0.18), potW - 4, Math.round(h * 0.28), [150, 176, 128, 255]);
        target.rect(potX + Math.round(potW / 2) - 1, y0 + Math.round(h * 0.1), 2, 4, [120, 150, 100, 255]);
    });
    writePng(fileName, width * 2, height, target.pixels);

    // Also one file per fixture: a wall decoration reads the atlas, but a
    // PAINTING map object goes through the ordinary sprite pipeline, which
    // wants a sheet of its own.
    ['painting.png', 'painting-still-life.png'].forEach((name, index) => {
        const single = image(width, height);
        for (let y = 0; y < height; y++) {
            const from = ((y * width * 2) + (index * width)) * 4;
            single.pixels.set(target.pixels.subarray(from, from + (width * 4)), y * width * 4);
        }
        writePng(path.join('fixtures', name), width, height, single.pixels);
    });
}

constructionSheet('construction-plaster.png', false);
constructionSheet('construction-plaster-debug.png', true);
const paintWidth = paintSheet('paints.png');
fixtureSheet('fixtures.png');

const hex = color => '#' + color.slice(0, 3).map(v => v.toString(16).padStart(2, '0')).join('');

console.log(`construction-plaster.png ${COLUMNS * CELL_SIZE}x${SHEET_HEIGHT} (+ debug variant)`);
console.log(`paints.png ${paintWidth}x${FRAME_HEIGHT}`);
PAINTS.forEach((paint, index) => {
    const base = index * PAINT_COLUMNS.length;
    const columns = PAINT_COLUMNS.map((name, offset) => `"${name}": ${base + offset}`).join(', ');
    const palette = Object.entries(paint.palette).map(([slot, color]) => `"${slot}": "${hex(color)}"`).join(', ');
    console.log(`  ${paint.id}\n    "swatch": { ${columns} }\n    "palette": { ${palette} }`);
});
console.log('fixtures.png 72x28 — 0:painting landscape  1:painting still-life');
console.log(Object.entries(BANDS).map(([name, baseY]) => `  ${name}: ${baseY}`).join('\n'));
console.log(`frameHeight ${FRAME_HEIGHT}  baselineRow ${BASELINE_ROW}  thickness ${THICKNESS}`);
