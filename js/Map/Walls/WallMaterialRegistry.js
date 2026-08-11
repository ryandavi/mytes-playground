// ─────────────────────────────────────────────────────────────────────────────
// WallMaterialRegistry — wall constructions (the built form) and finishes (the
// paint on it), schema v3.
//
// v2 made every finish carry its own 16-mask × (full+stub) sheet whose geometry
// had to match the construction pixel-for-pixel, so one new paint meant 32
// authored frames. v3 inverts that: a finish is a small set of 32px-wide
// tileable columns and the CONSTRUCTION says where paint may land.
//
// A finish authors three columns — west end, body, east end — each a full
// frame-height strip drawn at y=0, so a swatch row is a frame row. The body
// tiles along a run; an end column takes over wherever the wall's silhouette
// terminates. The mask still enforces the rounded outline, so an end column is
// not about the outline: it is where the finish says how its own horizontal
// structure resolves at a free end. Nothing here infers that a bottom band is a
// skirting and bends it around the foot — a band could be a dado or a chair
// rail, so the art decides and the engine only places it.
//
// A finish with no art of its own names a `template` finish and a `color`: its
// columns are the template's, recoloured by exact-match palette substitution
// (the same trick capColor uses below). That way a colour-only paint gets the
// template's ends and pattern instead of being the one finish that can't curve.
//
// The construction sheet holds two bands — the tall wall and the low wall — of
// 16 mask columns each, plus two extra columns holding the transition pieces
// that join a tall run to a low one. Transitions only happen along a straight
// horizontal run, so two tiles cover every case.
//
// Paint masks are not authored: they are derived here at load as "every opaque
// pixel that is not the cap colour", so the wall's geometry exists in exactly
// one place and a finish inherits its rounded silhouette for free.
// ─────────────────────────────────────────────────────────────────────────────
class WallMaterialRegistry {
    static DIRECTIONS = Object.freeze(['north', 'east', 'south', 'west']);
    static AUTHORED_BANDS = Object.freeze(['full', 'stub']);
    static TRANSITIONS = Object.freeze(['rampDown', 'rampUp']);
    static STATES = Object.freeze(['full', 'stub', 'rampDown', 'rampUp']);
    static SWATCH_COLUMNS = Object.freeze(['west', 'body', 'east']);
    // Optional. A stop is where the finish ends against a post while the wall
    // itself carries straight on, so it needs its own art: the free-end columns
    // are drawn against a foot that curves up, and there is no curve here.
    static STOP_COLUMNS = Object.freeze(['westStop', 'eastStop']);
    // Palette slot -> the finish key that overrides it. Slots with no override
    // are carried across as the template's offset from its own body colour.
    static PALETTE_OVERRIDES = Object.freeze({ body: 'color', band: 'baseboard', motif: 'accent' });

    constructor(resourceManager = null) {
        this.resourceManager = resourceManager;
        this.schemaVersion = 0;
        this.constructions = new Map();
        this.finishes = new Map();
        this.fixtures = new Map();
        this.images = new Map();
        this.overlays = new Map();
        this.frames = new Map();
        this.paintMasks = new Map();
        this.swatchColumns = new Map();
    }

    async load(path = SiteConfig.wallSystem.materialsPath) {
        const response = await fetch(path);
        if (!response.ok) throw new Error(`Unable to load wall materials: ${response.status}`);
        const data = await response.json();
        this.validate(data);
        this.schemaVersion = data.schemaVersion;
        this.constructions = new Map(Object.entries(data.constructions));
        this.finishes = new Map(Object.entries(data.finishes));
        this.fixtures = new Map(Object.entries(data.fixtures || {}));
        this.paintSheet = data.paintSheet || null;
        this.overlays.clear();
        this.frames.clear();
        this.paintMasks.clear();
        this.swatchColumns.clear();
        await this.loadImages();
        for (const id of this.constructions.keys()) this.deriveFrames(id);
        return this;
    }

    validate(data) {
        if (data?.schemaVersion === 2) {
            throw new Error(
                'wall-materials.json is schemaVersion 2. Migrate to 3: constructions gain ' +
                'thickness/frameHeight/baselineRow/capColor and just two bands ' +
                '(full, stub); finishes become a swatch or a color.'
            );
        }
        if (!data || data.schemaVersion !== 3) {
            throw new Error('wall-materials.json must use schemaVersion 3');
        }
        if (!data.constructions || !data.finishes) {
            throw new Error('Wall materials require constructions and finishes');
        }

        for (const [id, construction] of Object.entries(data.constructions)) {
            const dimensions = ['cellSize', 'height', 'stubHeight', 'thickness', 'frameHeight', 'baselineRow'];
            if (!construction.sheet || dimensions.some(key => !Number.isFinite(construction[key]))) {
                throw new Error(`Wall construction "${id}" has an invalid sheet or dimensions`);
            }
            if (!/^#[0-9a-f]{6}$/i.test(construction.capColor || '')) {
                throw new Error(`Wall construction "${id}" needs a capColor so paint masks can be derived`);
            }
            for (const state of WallMaterialRegistry.TRANSITIONS) {
                if (!Number.isInteger(construction.transitionColumns?.[state])) {
                    throw new Error(`Wall construction "${id}" is missing the "${state}" transition column`);
                }
            }
            if (construction.baselineRow >= construction.frameHeight) {
                throw new Error(`Wall construction "${id}" baselineRow must sit inside its frame`);
            }
            if (!Array.isArray(construction.maskMap) || construction.maskMap.length !== 16 ||
                construction.maskMap.some(column => !Number.isInteger(column) || column < 0 || column > 15)) {
                throw new Error(`Wall construction "${id}" must intentionally map all 16 masks`);
            }
            for (const band of WallMaterialRegistry.AUTHORED_BANDS) {
                if (!Number.isFinite(construction.bands?.[band]?.baseY)) {
                    throw new Error(`Wall construction "${id}" is missing the "${band}" band`);
                }
            }
            const debug = construction.debug;
            if (debug && (!Array.isArray(debug.maskLabels) || debug.maskLabels.length !== 16)) {
                throw new Error(`Wall construction "${id}" debug block must label all 16 masks`);
            }
        }

        for (const [id, finish] of Object.entries(data.finishes)) {
            const indexed = Number.isInteger(finish.swatch) || WallMaterialRegistry.isColumnSet(finish.swatch);
            const hasSwatch = indexed || (typeof finish.swatch === 'string' && finish.swatch.length > 0);
            if (indexed && !data.paintSheet) {
                throw new Error(`Wall finish "${id}" indexes a paint sheet, but none is declared`);
            }
            if (hasSwatch === (typeof finish.template === 'string')) {
                throw new Error(`Wall finish "${id}" needs exactly one of "swatch" or "template"`);
            }
            for (const key of ['color', 'baseboard', 'accent']) {
                if (finish[key] !== undefined && !/^#[0-9a-f]{3,8}$/i.test(finish[key])) {
                    throw new Error(`Wall finish "${id}" has an invalid ${key} color`);
                }
            }
            if (finish.palette && Object.values(finish.palette).some(color => !/^#[0-9a-f]{6}$/i.test(color))) {
                throw new Error(`Wall finish "${id}" palette slots must be #rrggbb`);
            }
            if (typeof finish.template !== 'string') continue;

            // A template is recoloured by exact pixel match, so it has to name
            // the tones it is made of — a missing slot would silently survive
            // recolouring in the template's own colour.
            const template = data.finishes[finish.template];
            if (!template || !template.palette?.body) {
                throw new Error(
                    `Wall finish "${id}" templates on "${finish.template}", which needs its own swatch and a palette with a "body" slot`
                );
            }
            if (!finish.color) {
                throw new Error(`Wall finish "${id}" templates on "${finish.template}" and must declare a "color"`);
            }
        }

        for (const [id, fixture] of Object.entries(data.fixtures || {})) {
            if (!fixture.sheet) continue;
            if (!fixture.piece || !['x', 'y', 'w', 'h'].every(key => Number.isFinite(fixture.piece[key]))) {
                throw new Error(`Wall fixture "${id}" requires a sheet piece`);
            }
        }
    }

    // The three-column form. A bare integer still means "body only, no authored
    // ends", which is all a flat paint ever needed.
    static isColumnSet(swatch) {
        return !!swatch && typeof swatch === 'object' &&
            WallMaterialRegistry.SWATCH_COLUMNS.every(name => Number.isInteger(swatch[name]));
    }

    async loadImages() {
        const records = [
            ...[...this.constructions].map(([id, value]) => [`wall-construction:${id}`, value.sheet]),
            ...[...this.constructions]
                .filter(([, value]) => value.debugSheet)
                .map(([id, value]) => [`wall-construction-debug:${id}`, value.debugSheet]),
            ...(this.paintSheet ? [['wall-paint-sheet', this.paintSheet]] : []),
            ...[...this.finishes]
                .filter(([, value]) => typeof value.swatch === 'string')
                .map(([id, value]) => [`wall-swatch:${id}`, value.swatch]),
            ...[...this.fixtures]
                .filter(([, value]) => value.sheet)
                .map(([id, value]) => [`wall-fixture:${id}`, value.sheet])
        ];
        await Promise.all(records.map(async ([key, path]) => {
            const image = this.resourceManager
                ? await this.resourceManager.loadSprite(key, path)
                : await new Promise((resolve, reject) => {
                    const candidate = new Image();
                    candidate.onload = () => resolve(candidate);
                    candidate.onerror = () => reject(new Error(`Unable to load ${path}`));
                    candidate.src = path;
                });
            this.images.set(key, image);
        }));
    }

    /**
     * Splices the two authored bands into the four frames the renderer asks
     * for, and reads the paint mask straight out of the art. Called once per
     * construction at load; nothing here runs during rendering.
     */
    deriveFrames(constructionId) {
        const construction = this.getConstruction(constructionId);
        if (!construction) return;
        for (const variant of ['', 'debug']) {
            const sheet = variant
                ? this.images.get(`wall-construction-debug:${constructionId}`)
                : this.getConstructionImage(constructionId);
            if (!sheet) continue;
            for (const state of WallMaterialRegistry.STATES) {
                this.frames.set(
                    `${constructionId}|${state}|${variant}`,
                    this.buildFrame(construction, sheet, state)
                );
            }
        }
        for (const state of WallMaterialRegistry.STATES) {
            this.paintMasks.set(
                `${constructionId}|${state}`,
                this.buildPaintMask(constructionId, construction, state)
            );
        }
    }

    frameCanvas(construction) {
        const canvas = document.createElement('canvas');
        canvas.width = 16 * construction.cellSize;
        canvas.height = construction.frameHeight;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        context.imageSmoothingEnabled = false;
        return { canvas, context };
    }

    /**
     * Lays a state out as 16 mask columns so the renderer can always index by
     * mask. The two heights come from their own bands; a transition is a single
     * authored tile — it only ever appears on a straight horizontal run — that
     * gets repeated across every column.
     */
    buildFrame(construction, sheet, state) {
        const { canvas, context } = this.frameCanvas(construction);
        const cell = construction.cellSize;
        const transition = construction.transitionColumns?.[state];
        for (let column = 0; column < 16; column++) {
            const sourceColumn = Number.isInteger(transition) ? transition : column;
            context.drawImage(
                sheet,
                sourceColumn * cell, construction.bands[Number.isInteger(transition) ? 'full' : state].baseY,
                cell, canvas.height,
                column * cell, 0, cell, canvas.height
            );
        }
        return canvas;
    }

    // Paintable = opaque and not the cap colour. The wall's top is the one
    // surface a finish must never touch, and it is the one colour the art
    // declares, so the mask needs no separate authoring pass.
    buildPaintMask(constructionId, construction, state) {
        const source = this.frames.get(`${constructionId}|${state}|`);
        if (!source) return null;
        const { canvas, context } = this.frameCanvas(construction);
        context.drawImage(source, 0, 0);
        const image = context.getImageData(0, 0, canvas.width, canvas.height);
        const cap = [1, 3, 5].map(index => parseInt(construction.capColor.substr(index, 2), 16));
        const data = image.data;
        for (let index = 0; index < data.length; index += 4) {
            const isCap = data[index] === cap[0] && data[index + 1] === cap[1] && data[index + 2] === cap[2];
            data[index + 3] = (data[index + 3] > 0 && !isCap) ? 255 : 0;
        }
        context.putImageData(image, 0, 0);
        return canvas;
    }

    /**
     * The drawable frame for one cutaway state: 16 mask columns, frame-height.
     * Swaps to the debug sheet — whose caps are tinted per mask — whenever
     * debug mode is on, so a wrong mask is obvious on screen.
     */
    getFrame(constructionId, state) {
        const debug = Utility.isDebugEnabled?.() === true;
        return (debug && this.frames.get(`${constructionId}|${state}|debug`)) ||
            this.frames.get(`${constructionId}|${state}|`) || null;
    }

    /**
     * The composed paint layer for one (construction, finish, state): the
     * finish tiled across all 16 mask columns and clipped to the derived paint
     * mask. Built once per combination and cached — a repaint is a cache miss,
     * not a redraw of anything the artist had to author.
     * @returns {HTMLCanvasElement|null}
     */
    getFinishOverlay(constructionId, finishId, state = 'full') {
        const key = `${constructionId}|${finishId}|${state}`;
        if (this.overlays.has(key)) return this.overlays.get(key);

        const overlay = this.composeFinishOverlay(constructionId, finishId, state);
        this.overlays.set(key, overlay);
        return overlay;
    }

    composeFinishOverlay(constructionId, finishId, state) {
        const construction = this.getConstruction(constructionId);
        const silhouette = this.paintMasks.get(`${constructionId}|${state}`);
        const columns = this.getSwatchColumns(finishId, construction);
        if (!construction || !silhouette || !columns) return null;

        const { canvas, context } = this.frameCanvas(construction);
        const cell = construction.cellSize;

        // Indexed by mask rather than by the construction's maskMap column:
        // where paint may land is a question about a cell's neighbours, and two
        // masks sharing a sheet column need not share the answer.
        for (let mask = 0; mask < 16; mask++) {
            const region = this.paintRegion(mask, construction);
            if (!region) continue;
            const x = mask * cell;
            context.save();
            context.beginPath();
            context.rect(x + region.start, 0, region.end - region.start, canvas.height);
            context.clip();
            context.drawImage(columns.body, x, 0);

            // Each end column owns only its own half, so a cell terminating at
            // both ends gets both treatments instead of the second overwriting
            // the first. An end column matches the body away from its free
            // edge, so the seam at the halfway mark is invisible.
            const middle = Math.round(x + ((region.start + region.end) / 2));
            this.clipColumn(context, columns, x, region.west, x + region.start, middle, canvas.height);
            this.clipColumn(context, columns, x, region.east, middle, x + region.end, canvas.height);
            context.restore();
        }

        context.globalCompositeOperation = 'destination-in';
        context.drawImage(silhouette, 0, 0);
        return canvas;
    }

    // `offset` slides the column so its authored free edge lands on the edge the
    // paint actually stops at, which is not always the one it was drawn for.
    clipColumn(context, columns, x, end, from, to, height) {
        const column = end && (columns[end.column] || columns.body);
        if (!column || to <= from) return;
        context.save();
        context.beginPath();
        context.rect(from, 0, to - from, height);
        context.clip();
        context.drawImage(column, x + end.offset, 0);
        context.restore();
    }

    /**
     * Which slice of a cell the finish covers, and how each end resolves.
     *
     * A cell with no east/west arm shows just the narrow profile of a wall
     * running north-south: construction, not a painted face.
     *
     * Where one horizontal arm meets a wall running SOUTH out of the same cell,
     * that south wall stands in the armless half, so paint stops at the post and
     * two room colours meet on neutral ground. The silhouette does not end there
     * — it rounds DOWNWARD into the south wall, the mirror of a free end — so
     * the finish uses its stop art, which is authored against that dive at the
     * position it is used.
     *
     * A NORTH arm is behind the face and interrupts nothing, so a cell with one
     * horizontal arm and no south arm is an ordinary free end: the paint runs out
     * to the silhouette's own rounded edge, which is exactly what the free-end
     * columns are authored against. Those are the building's front corners, and
     * stopping them at the post left the band inset by a wall thickness.
     * @returns {{start: number, end: number, west: object|null, east: object|null}|null}
     */
    paintRegion(mask, construction) {
        const cell = construction.cellSize;
        const inset = (cell - construction.thickness) / 2;
        const east = (mask & 2) !== 0;
        const west = (mask & 8) !== 0;
        const freeEnd = side => ({ column: side, offset: 0 });
        if (!east && !west) {
            return mask === 0
                ? { start: 0, end: cell, west: freeEnd('west'), east: freeEnd('east') }
                : null;
        }
        if ((mask & 4) !== 0 && east !== west) {
            return east
                ? { start: cell - inset, end: cell, west: { column: 'westStop', offset: 0 }, east: null }
                : { start: 0, end: inset, west: null, east: { column: 'eastStop', offset: 0 } };
        }
        return {
            start: 0, end: cell,
            west: west ? null : freeEnd('west'),
            east: east ? null : freeEnd('east')
        };
    }

    /**
     * A finish's three frame-height columns. Authored art comes straight off the
     * shared sheet; a template finish gets the template's columns recoloured, so
     * a colour-only paint inherits ends and pattern instead of being the one
     * finish that cannot resolve at a free end.
     * @returns {{west: HTMLCanvasElement, body: HTMLCanvasElement, east: HTMLCanvasElement}|null}
     */
    getSwatchColumns(finishId, construction) {
        if (this.swatchColumns.has(finishId)) return this.swatchColumns.get(finishId);
        const columns = this.buildSwatchColumns(finishId, construction);
        this.swatchColumns.set(finishId, columns);
        return columns;
    }

    buildSwatchColumns(finishId, construction) {
        const finish = this.getFinish(finishId);
        if (!finish || !construction) return null;

        if (typeof finish.template === 'string') {
            const template = this.getFinish(finish.template);
            const source = this.getSwatchColumns(finish.template, construction);
            if (!source || !template?.palette) return null;
            const substitutions = FinishPalette.resolve(
                template.palette, finish, WallMaterialRegistry.PALETTE_OVERRIDES
            );
            return Object.fromEntries(Object.entries(source).map(
                ([name, column]) => [name, FinishPalette.recolor(column, substitutions)]
            ));
        }

        const standalone = this.images.get(`wall-swatch:${finishId}`);
        const sheet = standalone || this.images.get('wall-paint-sheet');
        if (!sheet) return null;
        if (standalone || Number.isInteger(finish.swatch)) {
            const column = this.cutColumn(sheet, standalone ? 0 : finish.swatch, construction);
            return { west: column, body: column, east: column };
        }
        const names = [...WallMaterialRegistry.SWATCH_COLUMNS, ...WallMaterialRegistry.STOP_COLUMNS]
            .filter(name => Number.isInteger(finish.swatch[name]));
        return Object.fromEntries(names.map(
            name => [name, this.cutColumn(sheet, finish.swatch[name], construction)]
        ));
    }

    // Columns are frame-height and get drawn at y=0, so a swatch row IS a frame
    // row: no anchoring maths, and nothing to extrapolate below the wall's foot.
    cutColumn(sheet, index, construction) {
        const canvas = document.createElement('canvas');
        canvas.width = construction.cellSize;
        canvas.height = construction.frameHeight;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        context.imageSmoothingEnabled = false;
        context.drawImage(
            sheet,
            index * construction.cellSize, 0, canvas.width, canvas.height,
            0, 0, canvas.width, canvas.height
        );
        return canvas;
    }

    getConstruction(id) {
        return this.constructions.get(id) || null;
    }

    getFinish(id) {
        return this.finishes.get(id) || null;
    }

    getConstructionImage(id) {
        return this.images.get(`wall-construction:${id}`) || null;
    }

    getFixture(id) {
        return this.fixtures.get(id) || null;
    }

    getFixtureImage(id) {
        return this.images.get(`wall-fixture:${id}`) || null;
    }
}
