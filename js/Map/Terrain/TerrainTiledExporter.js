// ─────────────────────────────────────────────────────────────────────────────
// TerrainTiledExporter — writes painted ground back into the .tmx it came from.
//
// Same contract as WallTiledExporter (see TiledDocument): patch, never
// regenerate. Terrain layers are replaced wholesale — they are this system's to
// own, and their tiles are entirely derived from the corner grid — while every
// other layer, object and attribute is handed back untouched.
//
// ── Layer identity and ordering ──────────────────────────────────────────────
// A layer painted in game is a layer Tiled must be able to open, edit and paint
// on with its own terrain brush. So each one is written as an ordinary CSV tile
// layer carrying `terrainWangSet`, using tiles from the wang set Tiled itself
// authored. Round-trips both ways: paint here, open there, paint there, load
// here.
//
// Order is preserved by position in the document — Tiled draws layers in file
// order — so a layer created in game is inserted at the position its `order`
// says, immediately before the first wall layer if there is one. That keeps the
// stack the same on both sides: ground, terrain, walls.
// ─────────────────────────────────────────────────────────────────────────────
class TerrainTiledExporter {
    constructor(gameMap) {
        this.gameMap = gameMap;
        this.builder = gameMap.terrainBuilder;
        this.warnings = [];
        this.stats = { layers: 0, cells: 0, layersAdded: 0, layersRemoved: 0 };
    }

    static isAvailable(gameMap) {
        return TiledDocument.canSave && (gameMap?.terrainBuilder?.layers?.length ?? 0) > 0;
    }

    static async exportMap(gameMap, { force = false } = {}) {
        return new TerrainTiledExporter(gameMap).run({ force });
    }

    failure(code, message) {
        return { ok: false, code, message, warnings: this.warnings };
    }

    async run({ force = false } = {}) {
        if (!this.builder) return this.failure('no_terrain', 'This map has no painted ground.');
        if (!this.gameMap.sourcePath) {
            return this.failure('no_source', 'This map was not loaded from a .tmx file.');
        }

        const path = this.gameMap.sourcePath;
        let original;
        try {
            original = await TiledDocument.fetchSource(path);
        } catch (error) {
            return this.failure('read_failed', `Could not read ${path}: ${error.message}`);
        }

        const xml = this.patch(original);
        if (!xml) return this.failure('patch_failed', 'The map file could not be patched.');

        const response = await TiledDocument.save({
            mapId: this.gameMap.id,
            xml,
            baseHash: await TiledDocument.hash(original),
            force
        });
        if (!response.ok) return this.failure(response.code, response.message);

        // The corners are authored map data now; replaying the save's deltas on
        // top of them would at best be a no-op.
        this.builder.rebaseline();
        // The file no longer holds the deleted layers, so the save has nothing
        // left to remember about them.
        this.builder.removedLayerIds.clear();
        this.gameMap.container?.worldState?.captureMap?.(this.gameMap);

        return { ok: true, path, backup: response.backup, stats: this.stats, warnings: this.warnings };
    }

    patch(xmlText) {
        const doc = TiledDocument.parse(xmlText);
        if (!doc) return null;
        const mapEl = doc.querySelector('map');
        const width = Number(mapEl.getAttribute('width'));
        const height = Number(mapEl.getAttribute('height'));

        // Deletions first. A layer the player removed has to leave the file, or
        // the next load reads it straight back out of the map and the delete
        // survives only as a note in the save.
        for (const layerId of this.builder.removedLayerIds) {
            const element = [...mapEl.querySelectorAll(':scope > layer')]
                .find(candidate => String(candidate.getAttribute('id')) === String(layerId));
            if (!element) continue;
            element.remove();
            this.stats.layersRemoved++;
        }

        for (const layer of this.builder.orderedLayers()) {
            this.patchLayer(doc, mapEl, layer, width, height);
        }
        return TiledDocument.serialize(doc);
    }

    patchLayer(doc, mapEl, layer, width, height) {
        const existing = [...mapEl.querySelectorAll(':scope > layer')]
            .find(element => String(element.getAttribute('id')) === String(layer.id)) || null;

        const element = existing || this.createLayerElement(doc, mapEl, layer, width, height);
        element.setAttribute('name', layer.name);
        element.setAttribute('width', String(width));
        element.setAttribute('height', String(height));
        // Tiled's own way of saying hidden, so a layer switched off in game
        // opens switched off there too.
        if (layer.visible === false) element.setAttribute('visible', '0');
        else element.removeAttribute('visible');

        // Naming the wang set on the layer is what makes the round-trip
        // unambiguous: the loader reads it back rather than guessing which of
        // the tileset's sets these tiles belong to.
        TiledDocument.writeProperties(doc, element, {
            [SiteConfig.terrainSystem.layerProperty]: { value: layer.atlas.name }
        });

        // Decoration first, painted ground over it — the same order they are
        // drawn in, and the same rule: where the player has painted a cell, the
        // paint is what the file should carry.
        const gids = new Map(layer.foreignTiles);
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const gid = layer.gidForCell(x, y);
                if (!gid) continue;
                gids.set(y * width + x, gid);
                this.stats.cells++;
            }
        }
        this.reportUnpaintableCells(layer, width, height);

        let data = element.querySelector(':scope > data');
        if (!data) {
            data = doc.createElement('data');
            data.setAttribute('encoding', 'csv');
            element.appendChild(data);
        }
        data.setAttribute('encoding', 'csv');
        data.textContent = TiledDocument.toCsv(gids, width, height);
        this.stats.layers++;
    }

    /**
     * A layer invented in game needs a real Tiled id and a place in the
     * document. It goes immediately before the first wall layer — walls draw
     * over ground — or before the first object group when the map has no walls.
     */
    createLayerElement(doc, mapEl, layer, width, height) {
        const element = doc.createElement('layer');
        const id = TiledDocument.takeNextId(mapEl, 'nextlayerid');
        element.setAttribute('id', String(id));

        const wallLayerIds = new Set(
            (this.gameMap.wallBuilder?.wallData?.cells || [])
                .map(cell => cell.sourceLayerId)
                .filter(cellId => cellId !== undefined && cellId !== null)
                .map(String)
        );
        const anchor = [...mapEl.querySelectorAll(':scope > layer')]
            .find(candidate => wallLayerIds.has(String(candidate.getAttribute('id')))) ||
            mapEl.querySelector(':scope > objectgroup');

        if (anchor) mapEl.insertBefore(element, anchor);
        else mapEl.appendChild(element);

        // The layer now has the id the file will know it by, so the runtime
        // stops calling it by the placeholder it invented. Nothing else is
        // keyed by the old id — the terrain draws to one composited canvas.
        layer.id = id;

        this.stats.layersAdded++;
        return element;
    }

    /**
     * Corner arrangements the tileset has no tile for.
     *
     * A corner wang set does not have to author every combination — three
     * terrains meeting at one point needs a tile drawn for that exact meeting,
     * and most tilesets do not have one. Those cells write as empty rather than
     * as something wrong, and the author is told where to look.
     */
    reportUnpaintableCells(layer, width, height) {
        let missing = 0;
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                if (!layer.hasPaintAt(x, y)) continue;
                if (!layer.atlas.hasCorners(layer.cornersForCell(x, y))) missing++;
            }
        }
        if (missing === 0) return;
        this.warnings.push(
            `${missing} cell${missing === 1 ? '' : 's'} on "${layer.name}" ${missing === 1 ? 'has' : 'have'} ` +
            `a corner arrangement the "${layer.atlas.name}" wang set has no tile for — usually three terrains ` +
            `meeting at one point. ${missing === 1 ? 'It was' : 'They were'} left empty.`
        );
    }
}
