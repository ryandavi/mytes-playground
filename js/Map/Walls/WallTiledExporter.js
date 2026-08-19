/**
 * WallTiledExporter — pushes the walls standing in the world back into the
 * .tmx they came from, so a map can be built in game and then kept being
 * edited in Tiled.
 *
 * Walls have only ever flowed one way: Tiled paints wang tiles, the loader
 * reduces them to cells, and anything built in game lives as a delta in the
 * player's save that the map file knows nothing about. This closes the loop.
 *
 * Two rules keep it from being destructive:
 *
 *  - It **patches**, never regenerates. The document is parsed, the wall layers
 *    and wall objects are replaced, and every other layer, object, property and
 *    attribute is handed back untouched. Regenerating a .tmx from what the
 *    runtime happens to model would silently discard every hand-authored floor
 *    layer on the first export.
 *  - It **updates objects in place** where it can. A door in the map file
 *    carries authored properties the wall system never reads — variant, custom
 *    flags, whatever a future system adds. Rewriting the element from the
 *    opening record would drop them, so a matching element keeps its identity
 *    and only its geometry and wall properties are refreshed.
 *
 * Which layers count as wall layers is not a guess: every authored cell records
 * the layer it was painted on, so the set of layer ids to replace is exact.
 */
class WallTiledExporter {
    static WALL_OBJECT_TYPES = Object.freeze(['DOOR', 'WINDOW', 'PAINTING', 'WALLATTACHMENT', 'WALLFINISHOVERRIDE', 'ROOMASSIGNMENT']);

    static MATERIAL_FIELDS = Object.freeze(['constructionId', 'finishId', 'heightCells', 'connectGroup']);

    static LAYER_PROPERTY_NAMES = Object.freeze({
        constructionId: 'wallConstructionId',
        finishId: 'wallFinishId',
        heightCells: 'wallHeightCells',
        connectGroup: 'wallConnectGroup'
    });

    constructor(gameMap) {
        this.gameMap = gameMap;
        this.builder = gameMap.wallBuilder;
        this.atlas = this.builder?.atlas || null;
        this.warnings = [];
    }

    // ── Entry point ──────────────────────────────────────────────────────────

    /**
     * Reads the map file, patches it, writes it back, and re-baselines the
     * save. Returns a report rather than throwing for the ordinary failures a
     * dev tool hits — no atlas, no server, someone else touched the file.
     */
    /**
     * Whether the control that runs this should be offered at all. The save
     * endpoint is a local editor API by design, so anywhere it could not
     * possibly answer, the button is dead rather than misleading.
     */
    static isAvailable(gameMap) {
        return TiledDocument.canSave && !!gameMap?.wallBuilder?.atlas;
    }

    static async exportMap(gameMap, { force = false } = {}) {
        const exporter = new WallTiledExporter(gameMap);
        return exporter.run({ force });
    }

    async run({ force = false } = {}) {
        const blocked = this.checkPreconditions();
        if (blocked) return blocked;

        const path = this.gameMap.sourcePath;
        let original;
        try {
            original = await this.fetchMapSource(path);
        } catch (error) {
            return this.failure('read_failed', `Could not read ${path}: ${error.message}`);
        }

        const xml = this.patch(original);
        if (!xml) return this.failure('patch_failed', 'The map file could not be patched.');

        const response = await this.save({
            xml,
            baseHash: await WallTiledExporter.hash(original),
            force
        });
        if (!response.ok) return response;

        // The cells are authored map data now. Replaying the save's deltas on
        // top of them would at best be a no-op and at worst resurrect a
        // `removed: true` for a wall that has just been written into the file.
        this.rebaseline();

        return {
            ok: true,
            path,
            backup: response.backup,
            stats: this.stats,
            warnings: this.warnings
        };
    }

    checkPreconditions() {
        if (!this.builder) return this.failure('no_walls', 'This map has no wall builder.');
        if (!this.atlas) {
            return this.failure(
                'no_wang_set',
                `No tileset on this map authors the "${SiteConfig.wallSystem.wallWangSetName}" wang set, ` +
                'so there is no tile to write a cell as.'
            );
        }
        if (!this.gameMap.sourcePath) {
            return this.failure('no_source', 'This map was not loaded from a .tmx file.');
        }
        return null;
    }

    failure(code, message) {
        return { ok: false, code, message, warnings: this.warnings };
    }

    // File plumbing is TiledDocument's — see it for the patch-never-regenerate
    // contract every exporter here follows.
    async fetchMapSource(path) {
        return TiledDocument.fetchSource(path);
    }

    static async hash(text) {
        return TiledDocument.hash(text);
    }

    async save({ xml, baseHash, force }) {
        const result = await TiledDocument.save({ mapId: this.gameMap.id, xml, baseHash, force });
        return result.ok ? result : this.failure(result.code, result.message);
    }

    /**
     * Drops the wall half of the save so the builder's authored baseline and
     * the file agree again. Everything else in the snapshot — objects, floors,
     * room edits — is left alone.
     */
    rebaseline() {
        this.builder.authoredBaseCells = new Map(
            [...this.builder.baseCells].map(([key, cell]) => [key, Utility.deepClone(cell)])
        );
        this.builder.authoredOpenings = Utility.deepClone(this.builder.openings);
        this.builder.authoredFixtures = Utility.deepClone(this.builder.fixtures);
        this.builder.authoredFaceOverrides = Utility.deepClone(this.builder.faceOverrides);
        // Re-capturing now that the authored baseline has moved is what empties
        // the deltas: serializeCellDeltas diffs against authoredBaseCells, and
        // those two maps are identical again.
        this.gameMap.container?.worldState?.captureMap?.(this.gameMap);
    }

    // ── Patching ─────────────────────────────────────────────────────────────

    patch(xmlText) {
        const doc = TiledDocument.parse(xmlText);
        if (!doc) return null;
        const mapEl = doc.querySelector('map');

        this.stats = { layers: 0, cells: 0, objectsUpdated: 0, objectsAdded: 0, objectsRemoved: 0 };

        this.patchLayers(doc, mapEl);
        this.patchObjects(doc, mapEl);

        return TiledDocument.serialize(doc);
    }

    /**
     * Wall cells become one tile layer per distinct material tuple.
     *
     * A cell's construction, finish, height and connect group cannot ride on
     * the tile: tile properties belong to the tileset, so every cell drawn with
     * a given wang tile would have to share them. The loader already reads
     * these off the *layer*, which is the only place per-cell variation can
     * live in a .tmx — so cells are grouped by material and each group gets its
     * own layer carrying its own properties. Round-trips through the importer
     * unchanged.
     */
    patchLayers(doc, mapEl) {
        const authoredLayerIds = new Set(
            (this.builder.wallData.cells || [])
                .map(cell => cell.sourceLayerId)
                .filter(id => id !== undefined && id !== null)
                .map(String)
        );
        const existing = [...mapEl.querySelectorAll(':scope > layer')]
            .filter(layer => authoredLayerIds.has(String(layer.getAttribute('id'))));

        // The first existing wall layer is both the template for anything the
        // author set that is not a material, and the insertion point that keeps
        // the walls in their original draw order relative to the floors.
        const template = existing[0] || null;

        // A replaced layer is rewritten wholesale, so anything on it that is
        // not a wall would be destroyed. Nothing in data/maps mixes them today
        // and the authoring convention says not to — but the loader does not
        // enforce that, and losing a map's colliders to a wall export is not a
        // mistake worth leaving available.
        const preserved = this.collectForeignTiles(existing, Number(mapEl.getAttribute('width')));

        const groups = this.groupCellsByMaterial();
        const built = [...groups.values()].map((group, index) => this.buildLayerElement(doc, mapEl, group, {
            template,
            reuseName: groups.size === 1 && template ? template.getAttribute('name') : null,
            // Foreign tiles ride along on the layer that inherits the original's
            // name and position, which is where they already were.
            preserved: index === 0 ? preserved : null,
            index
        }));

        // Insert while the old layers are still attached, then remove them —
        // anchoring on a node that has already been detached would silently
        // append the new layers at the end of the document instead.
        const anchor = template || mapEl.querySelector(':scope > objectgroup');
        for (const layer of built) {
            if (anchor) mapEl.insertBefore(layer, anchor);
            else mapEl.appendChild(layer);
        }
        for (const layer of existing) layer.remove();

        this.stats.layers = built.length;
    }

    groupCellsByMaterial() {
        const defaults = this.builder.wallData.defaults || {};
        const groups = new Map();
        let isolated = 0;

        // A doorway is often drawn as a gap in the tile layer, with the door
        // object providing the aperture — the runtime then bridges that gap with
        // cells of its own so the wall run stays structurally connected. Writing
        // those back would fill the author's gap with solid wall, so only cells
        // the author actually painted (or the player actually built) are
        // exported. Runtime behaviour is unchanged either way: the bridge is
        // rebuilt from the opening on the next load.
        const exported = [...this.builder.baseCells.values()].filter(cell => cell.bridged !== true);
        const bridged = this.builder.baseCells.size - exported.length;

        for (const cell of exported) {
            const material = Object.fromEntries(WallTiledExporter.MATERIAL_FIELDS.map(field => [
                field,
                cell[field] ?? defaults[field]
            ]));
            const key = WallTiledExporter.MATERIAL_FIELDS.map(field => material[field]).join('|');
            if (!groups.has(key)) groups.set(key, { key, material, cells: [] });

            const mask = this.maskWithin(exported, cell);
            if (!this.atlas.hasExactTile(mask)) isolated++;
            groups.get(key).cells.push({ x: cell.x, y: cell.y, gid: this.atlas.gidForMask(mask) });
            this.stats.cells++;
        }
        this.stats.bridgedSkipped = bridged;

        if (isolated > 0) {
            this.warnings.push(
                `${isolated} isolated wall cell${isolated === 1 ? '' : 's'} had no matching wang tile ` +
                `and were written with the fallback tile. An edge wang set cannot describe a cell with ` +
                `no wall neighbours — Tiled cannot paint one either.`
            );
        }
        return groups;
    }

    /**
     * Every non-wall tile sitting on a layer that is about to be replaced,
     * keyed by its index in the layer data so it lands back where it was.
     */
    collectForeignTiles(layers, width) {
        const foreign = new Map();
        for (const layer of layers) {
            const csv = layer.querySelector(':scope > data')?.textContent || '';
            const gids = csv.split(',').map(value => Number(value.trim()) || 0);
            gids.forEach((gid, index) => {
                if (gid === 0) return;
                if (this.atlas.byTileId.has(gid - this.atlas.firstgid)) return;
                foreign.set(index, gid);
            });
        }
        if (foreign.size > 0) {
            this.warnings.push(
                `${foreign.size} non-wall tile${foreign.size === 1 ? '' : 's'} shared a layer with the walls ` +
                `and ${foreign.size === 1 ? 'was' : 'were'} carried over. Move them to their own layer — a wall ` +
                `layer is rewritten in full on every export.`
            );
        }
        return foreign;
    }

    /**
     * The neighbour mask a cell has *within the exported set*, which is not the
     * same as the one it has at runtime.
     *
     * The runtime mask counts bridge cells, so the wall beside a doorway reads
     * as connected. Writing that tile next to a gap in the layer would draw a
     * wall carrying on into empty space in Tiled's preview. The mask the file
     * should carry is the one the author would paint given the tiles that are
     * actually there. The runtime does not care either way — it recomputes the
     * mask from cell adjacency on load and never reads the tile back.
     */
    maskWithin(cells, cell) {
        const byKey = this._exportedByKey ||= new Map(cells.map(entry => [`${entry.x},${entry.y}`, entry]));
        let mask = 0;
        for (const direction of WallBuilder.DIRECTIONS) {
            const neighbor = byKey.get(`${cell.x + direction.dx},${cell.y + direction.dy}`);
            if (neighbor && neighbor.connectGroup === cell.connectGroup) mask |= direction.bit;
        }
        return mask;
    }

    buildLayerElement(doc, mapEl, group, { template, reuseName, preserved, index }) {
        const width = Number(mapEl.getAttribute('width'));
        const height = Number(mapEl.getAttribute('height'));
        const layer = doc.createElement('layer');

        // The layer that inherits the original's name and slot inherits its id
        // too. Allocating a fresh one on every export churns ids and walks
        // `nextlayerid` up for a layer that, to Tiled, never went away.
        const inheritedId = index === 0 ? template?.getAttribute('id') : null;
        layer.setAttribute('id', inheritedId || String(WallTiledExporter.takeNextId(mapEl, 'nextlayerid')));
        layer.setAttribute('name', reuseName || this.layerName(group, index));
        layer.setAttribute('width', String(width));
        layer.setAttribute('height', String(height));
        // Anything the author set on the layer that is not a wall material —
        // opacity, visibility, locked, a custom class — is theirs to keep.
        for (const attribute of template?.attributes || []) {
            if (!['id', 'name', 'width', 'height'].includes(attribute.name)) {
                layer.setAttribute(attribute.name, attribute.value);
            }
        }

        layer.appendChild(this.buildLayerProperties(doc, group, template));

        const data = doc.createElement('data');
        data.setAttribute('encoding', 'csv');
        data.textContent = WallTiledExporter.toCsv(group.cells, width, height, preserved);
        layer.appendChild(data);
        return layer;
    }

    /**
     * Non-material properties on the original wall layer survive — the loader
     * reads `blocksLineOfSight` from there, and a map may carry more.
     */
    buildLayerProperties(doc, group, template) {
        const properties = doc.createElement('properties');
        const materialNames = new Set(Object.values(WallTiledExporter.LAYER_PROPERTY_NAMES));
        const carried = new Map();

        for (const property of template?.querySelectorAll(':scope > properties > property') || []) {
            const name = property.getAttribute('name');
            if (!materialNames.has(name)) carried.set(name, property.cloneNode(true));
        }
        for (const [field, name] of Object.entries(WallTiledExporter.LAYER_PROPERTY_NAMES)) {
            const value = group.material[field];
            if (value === undefined || value === null) continue;
            const property = doc.createElement('property');
            property.setAttribute('name', name);
            if (field === 'heightCells') property.setAttribute('type', 'int');
            property.setAttribute('value', String(value));
            carried.set(name, property);
        }

        // Tiled writes properties alphabetically; matching it keeps the diff to
        // what actually changed instead of a whole reordered block.
        for (const name of [...carried.keys()].sort()) properties.appendChild(carried.get(name));
        return properties;
    }

    layerName(group, index) {
        const { constructionId, finishId } = group.material;
        return index === 0 ? 'Walls' : `Walls ${constructionId}/${finishId}`;
    }

    static toCsv(cells, width, height, preserved = null) {
        const data = new Array(width * height).fill(0);
        // Foreign tiles go down first: where a wall now stands on a cell that
        // used to hold something else, the wall is the truth.
        for (const [index, gid] of preserved || []) data[index] = gid;
        for (const cell of cells) {
            if (cell.x < 0 || cell.y < 0 || cell.x >= width || cell.y >= height) continue;
            data[cell.y * width + cell.x] = cell.gid;
        }
        const rows = [];
        for (let y = 0; y < height; y++) {
            rows.push(data.slice(y * width, (y + 1) * width).join(','));
        }
        return `\n${rows.join(',\n')}\n`;
    }

    // ── Objects ──────────────────────────────────────────────────────────────

    /**
     * Openings, fixtures, attachments and face overrides are Tiled objects.
     * Each record is matched to the element it came from by id and updated in
     * place; records with no element are appended; elements whose record is
     * gone are removed.
     */
    patchObjects(doc, mapEl) {
        const groups = [...mapEl.querySelectorAll(':scope > objectgroup')];
        const elementsById = new Map();
        const wallElements = [];

        for (const group of groups) {
            for (const object of group.querySelectorAll(':scope > object')) {
                if (!WallTiledExporter.isWallObject(object)) continue;
                wallElements.push(object);
                elementsById.set(String(object.getAttribute('id')), object);
            }
        }

        const host = this.resolveObjectHost(doc, mapEl, wallElements, groups);
        const kept = new Set();

        for (const record of this.collectObjectRecords()) {
            const existing = elementsById.get(String(record.id));
            if (existing) {
                this.applyObjectRecord(doc, existing, record, false);
                kept.add(existing);
                this.stats.objectsUpdated++;
                continue;
            }
            const created = doc.createElement('object');
            created.setAttribute('id', String(WallTiledExporter.takeNextId(mapEl, 'nextobjectid')));
            this.applyObjectRecord(doc, created, record, true);
            host.appendChild(created);
            kept.add(created);
            this.stats.objectsAdded++;
        }

        for (const element of wallElements) {
            if (kept.has(element)) continue;
            element.remove();
            this.stats.objectsRemoved++;
        }
    }

    static isWallObject(object) {
        const properties = WallTiledExporter.readProperties(object);
        if (properties.wallOpening === 'true' || properties.wallFixture === 'true') return true;
        const type = String(
            properties.type || object.getAttribute('type') || object.getAttribute('name') || ''
        ).toUpperCase();
        return WallTiledExporter.WALL_OBJECT_TYPES.includes(type);
    }

    static readProperties(element) {
        return Object.fromEntries(
            [...element.querySelectorAll(':scope > properties > property')]
                .map(property => [property.getAttribute('name'), property.getAttribute('value')])
        );
    }

    /** Where a newly built object goes: beside the existing wall objects. */
    resolveObjectHost(doc, mapEl, wallElements, groups) {
        const existingHost = wallElements[0]?.parentNode;
        if (existingHost) return existingHost;
        const named = groups.find(group => (group.getAttribute('name') || '').toLowerCase() === 'objects');
        if (named) return named;
        if (groups.length > 0) return groups[0];

        const group = doc.createElement('objectgroup');
        group.setAttribute('id', String(WallTiledExporter.takeNextId(mapEl, 'nextlayerid')));
        group.setAttribute('name', 'Objects');
        mapEl.appendChild(group);
        return group;
    }

    /**
     * Flattens the builder's four record lists into the one shape the writer
     * needs: a rectangle in map pixels plus the properties the loader reads
     * back off it.
     */
    collectObjectRecords() {
        const tileWidth = this.builder.cellSize;
        const records = [];

        for (const opening of this.builder.openings) {
            const xs = opening.cells.map(cell => cell[0]);
            const ys = opening.cells.map(cell => cell[1]);
            records.push({
                id: opening.id,
                name: opening.type === 'window' ? 'Window' : 'Door',
                x: Math.min(...xs) * tileWidth,
                y: Math.min(...ys) * tileWidth,
                width: (Math.max(...xs) - Math.min(...xs) + 1) * tileWidth,
                height: (Math.max(...ys) - Math.min(...ys) + 1) * tileWidth,
                properties: {
                    wallOpening: { value: 'true', type: 'bool' },
                    openingHeight: { value: opening.openingHeight, type: 'int' },
                    sillHeight: { value: opening.sillHeight || 0, type: 'int' },
                    continuesTopTrim: { value: opening.continuesTopTrim === true, type: 'bool' }
                }
            });
        }

        for (const fixture of this.builder.fixtures) {
            const [cellX, cellY] = fixture.cells?.from || [fixture.cellX, fixture.cellY];
            records.push({
                id: fixture.id,
                name: 'Painting',
                x: cellX * tileWidth,
                y: cellY * tileWidth,
                // A fixture's rectangle is its art, and the runtime does not
                // model art size — `u`/`v` carry the position on the face. The
                // first export rewrote a 36x28 painting to 32x32 for no reason
                // other than that a cell is 32 wide.
                keepSize: true,
                width: tileWidth,
                height: tileWidth,
                properties: {
                    wallFixture: { value: 'true', type: 'bool' },
                    face: { value: fixture.face },
                    socketId: { value: fixture.socketId || 'surface' },
                    u: { value: fixture.u, type: 'float' },
                    v: { value: fixture.v, type: 'float' }
                }
            });
        }

        for (const attachment of this.builder.wallData.attachments || []) {
            const [cellX, cellY] = attachment.cells?.from || [0, 0];
            records.push({
                id: attachment.id,
                name: 'WallAttachment',
                x: cellX * tileWidth,
                y: cellY * tileWidth,
                width: attachment.width || tileWidth,
                height: attachment.height || tileWidth,
                properties: {
                    type: { value: 'WallAttachment' },
                    childId: { value: attachment.childId || attachment.id },
                    face: { value: attachment.face },
                    socketId: { value: attachment.socketId || 'surface' },
                    u: { value: attachment.u, type: 'float' },
                    v: { value: attachment.v, type: 'float' },
                    attachmentWidth: { value: attachment.width, type: 'int' },
                    attachmentHeight: { value: attachment.height, type: 'int' },
                    fixture: { value: attachment.fixture || 'painting' }
                }
            });
        }

        const assignments = this.builder.gameMap?.roomAssignments;
        for (const roomId of (assignments?.roomIds() ?? []).sort()) {
            const cells = assignments.cellsFor(roomId).sort();
            const columns = cells.map(key => Number(key.split(',')[0]));
            const rows = cells.map(key => Number(key.split(',')[1]));
            records.push({
                // Named by the room, so re-exporting an unchanged room rewrites
                // the same object rather than stacking a second one beside it.
                id: `roomassignment:${roomId}`,
                name: 'RoomAssignment',
                x: Math.min(...columns) * tileWidth,
                y: Math.min(...rows) * tileWidth,
                keepSize: true,
                width: (Math.max(...columns) - Math.min(...columns) + 1) * tileWidth,
                height: (Math.max(...rows) - Math.min(...rows) + 1) * tileWidth,
                properties: {
                    type: { value: 'RoomAssignment' },
                    roomId: { value: roomId },
                    // The rectangle above is only where to find it in Tiled. A
                    // room need not be rectangular, so the cells are the truth.
                    cells: { value: cells.join(' ') }
                }
            });
        }

        for (const [index, override] of this.builder.faceOverrides.entries()) {
            const [fromX, fromY] = override.cells.from;
            const [toX, toY] = override.cells.to;
            records.push({
                // Overrides are authored as geometry, not identity — there is
                // no stable id to match on, so they are rewritten wholesale
                // under a deterministic name.
                // Scoped to a room, so the room is part of what makes it
                // unique: two rooms meeting along one wall paint the same
                // cells on the same face, and a name without the room would
                // have collapsed their two records into one.
                id: `wallfinish:${override.face}:${override.roomId ?? ''}:${fromX},${fromY}:${toX},${toY}`,
                name: 'WallFinishOverride',
                x: fromX * tileWidth,
                y: fromY * tileWidth,
                width: (toX - fromX + 1) * tileWidth,
                height: (toY - fromY + 1) * tileWidth,
                properties: {
                    type: { value: 'WallFinishOverride' },
                    face: { value: override.face },
                    finishId: { value: override.finishId },
                    fromX: { value: fromX, type: 'int' },
                    fromY: { value: fromY, type: 'int' },
                    toX: { value: toX, type: 'int' },
                    toY: { value: toY, type: 'int' },
                    // Empty means the outside of the building. Omitted entirely
                    // means hand-authored paint that belongs to no particular
                    // room — see TileMapLoader for why the two cannot merge.
                    ...(override.roomId === undefined
                        ? {}
                        : { roomId: { value: override.roomId ?? '' } })
                }
            });
        }

        return records;
    }

    applyObjectRecord(doc, element, record, isNew) {
        if (isNew) element.setAttribute('name', record.name);
        element.setAttribute('x', String(Math.round(record.x)));
        element.setAttribute('y', String(Math.round(record.y)));
        // Only a brand-new object gets its rectangle from the runtime. See
        // reportFootprintDrift for why an existing one keeps the author's.
        if (isNew) {
            element.setAttribute('width', String(Math.round(record.width)));
            element.setAttribute('height', String(Math.round(record.height)));
        } else {
            this.reportFootprintDrift(element, record);
        }

        let properties = element.querySelector(':scope > properties');
        if (!properties) {
            properties = doc.createElement('properties');
            element.insertBefore(properties, element.firstChild);
        }

        for (const [name, spec] of Object.entries(record.properties)) {
            if (spec.value === undefined || spec.value === null) continue;
            let property = [...properties.querySelectorAll(':scope > property')]
                .find(candidate => candidate.getAttribute('name') === name);
            if (!property) {
                property = doc.createElement('property');
                property.setAttribute('name', name);
                properties.appendChild(property);
            }
            if (spec.type) property.setAttribute('type', spec.type);
            property.setAttribute('value', String(spec.value));
        }
    }

    /**
     * An authored rectangle is art, not footprint, so it is never rewritten.
     *
     * A window is drawn elevated: its rectangle is taller than the cells it
     * occupies, and its wall-slot anchor is offset from those visual bounds
     * (§3.2). A painting's rectangle is the size of the picture. The runtime
     * models neither — it models cells, plus `u`/`v` on a face. An early version
     * of this exporter "corrected" a 36x28 painting to 32x32 and flattened a
     * 64px-tall window to 32, which is the runtime overwriting art it does not
     * own.
     *
     * When the footprint the loader derives from the rectangle disagrees with
     * the one the runtime is using, that is worth knowing — but resolving it is
     * the author's call, so it is reported rather than silently applied. Nothing
     * in the game resizes an opening, so this only fires on a map whose authored
     * rectangle was already ambiguous.
     */
    reportFootprintDrift(element, record) {
        if (record.keepSize === true) return;
        const cell = this.builder.cellSize;
        const cells = size => Math.max(1, Math.ceil(Math.max(Number(size) || 0, cell) / cell));
        const authored = [cells(element.getAttribute('width')), cells(element.getAttribute('height'))];
        const runtime = [cells(record.width), cells(record.height)];
        if (authored[0] === runtime[0] && authored[1] === runtime[1]) return;
        this.warnings.push(
            `${record.name} #${record.id} occupies ${runtime[0]}x${runtime[1]} cells at runtime but its ` +
            `rectangle in the map file describes ${authored[0]}x${authored[1]}. The rectangle was left alone — ` +
            `resize it in Tiled if the runtime footprint is the one you want.`
        );
    }

    // ── Document plumbing ────────────────────────────────────────────────────

    static takeNextId(mapEl, attribute) {
        return TiledDocument.takeNextId(mapEl, attribute);
    }

}
