// ─────────────────────────────────────────────────────────────────────────────
// TerrainPaintPanel — the Ground tool: pick a terrain, drag over the map.
//
// The brush sets the four corners of every cell it touches (see TerrainAtlas
// for why corners rather than tiles), which is why the blends between grass and
// water appear without anybody choosing a transition tile. One drag is one undo
// step, so laying a path is a single mistake to take back rather than forty.
//
// Layers are here rather than hidden because ground stacks: a dirt path over
// grass is two layers, in that order, exactly as it would be in Tiled. The list
// is the map file's layer order, and moving a layer in it moves it in the file.
// ─────────────────────────────────────────────────────────────────────────────
class TerrainPaintPanel extends ModalWindow {
    /**
     * What a click does. Erase is a tool rather than a swatch because it is a
     * different intent, not a different terrain — and having it sit in the
     * palette meant the panel could not answer "what am I painting with" and
     * "am I adding or taking away" at the same time. Alt still inverts the
     * brush to Erase for the length of a stroke, which is the shortcut you
     * reach for mid-gesture.
     */
    static TOOLS = Object.freeze({
        PAINT: 'paint',
        FILL: 'fill',
        ERASE: 'erase',
        PICK: 'pick'
    });

    /** Layer thumbnail edge, in px. Matches the palette's swatch sample. */
    static THUMBNAIL_SIZE = 40;

    constructor(parent) {
        super(parent, {
            id: 'terrain-paint-panel',
            closeOnOutsideClick: false,
            position: 'top-right',
            draggable: true,
            closeButtonSelector: '.modal-close-btn'
        });

        this.colorIndex = 1;
        this.activeLayerId = null;
        this.tool = TerrainPaintPanel.TOOLS.PAINT;
        this.stroke = null;
        // Shared with the Wall tool: one tick per cell that actually changed,
        // floored by wall clock. See BuildRunSound for why this is not a
        // per-frame play() call.
        this.runSound = new BuildRunSound(this);

        this.boundPointerDown = this.handlePointerDown.bind(this);
        this.boundPointerMove = this.handlePointerMove.bind(this);
        this.boundPointerUp = this.handlePointerUp.bind(this);
        this.init();

        this.paletteElement = this.modalElement?.querySelector('.terrain-palette');
        this.layerListElement = this.modalElement?.querySelector('.terrain-layer-list');
        this.emptyElement = this.modalElement?.querySelector('.terrain-empty');
        this.brushSegment = new SegmentControl(
            this.modalElement?.querySelector('.terrain-brush-segment') || null,
            { value: String(SiteConfig.terrainSystem.defaultBrushSize) }
        );
        this.toolSegment = new SegmentControl(
            this.modalElement?.querySelector('.terrain-tool-segment') || null,
            {
                value: TerrainPaintPanel.TOOLS.PAINT,
                onChange: value => {
                    this.tool = value;
                    this.renderTool();
                }
            }
        );
        this.rectangleToggle = this.modalElement?.querySelector('#terrain-rectangle') || null;
        this.wangSetSelect = this.modalElement?.querySelector('.terrain-wang-set') || null;
        this.modalElement?.querySelector('.terrain-layer-add')
            ?.addEventListener('click', () => this.addLayer());

        this.parent?.parent?.canvas?.addEventListener('pointerdown', this.boundPointerDown, true);
        document.addEventListener('pointermove', this.boundPointerMove, true);
        document.addEventListener('pointerup', this.boundPointerUp, true);
        document.addEventListener('pointercancel', this.boundPointerUp, true);

        this.unsubscribers = [
            this.parent?.parent?.eventManager?.on?.(
                EVENTS.TERRAIN_LAYERS_CHANGED, () => this.renderLayers()
            ),
            this.parent?.parent?.eventManager?.on?.(
                EVENTS.TERRAIN_READY, () => this.render()
            )
        ];
    }

    get gameMap() {
        return this.parent?.parent?.gameMap || null;
    }

    get builder() {
        return this.gameMap?.terrainBuilder || null;
    }

    get rules() {
        return this.parent?.parent?.buildRules || null;
    }

    get brushSize() {
        // A bucket fills a region; a size would be describing the wrong thing.
        if (this.tool === TerrainPaintPanel.TOOLS.FILL) return 1;
        return Number(this.brushSegment?.value) || 1;
    }

    get isErasing() {
        return this.tool === TerrainPaintPanel.TOOLS.ERASE;
    }

    // Shift is unavailable on touch, so the panel carries the same switch —
    // the wall tool's bargain, and for the same gesture.
    isRectangleMode(event = null) {
        if (this.tool === TerrainPaintPanel.TOOLS.FILL) return false;
        return event?.shiftKey === true || this.rectangleToggle?.checked === true;
    }

    /** Every cell in the box between two corners. */
    static rectangleCells(start, end) {
        const cells = [];
        for (let y = Math.min(start.y, end.y); y <= Math.max(start.y, end.y); y++) {
            for (let x = Math.min(start.x, end.x); x <= Math.max(start.x, end.x); x++) {
                cells.push({ x, y });
            }
        }
        return cells;
    }

    handleToolModeChanged(mode) {
        const active = mode === UIToolModes.TERRAIN;
        document.body.classList.toggle('terrain-paint-mode', active);
        this.cancelStroke();
        this.parent.setBuildCursor(null);
        if (active) {
            this.render();
            this.open();
        } else {
            super.close();
        }
    }

    // See WallBuildPanel.close: putting the tool down hands back to the mode's
    // default tool.
    close() {
        if (this.parent.isTool(UIToolModes.TERRAIN) &&
            this.parent.changeToolMode(this.parent.toolManager.getDefaultToolFor())) {
            return;
        }
        super.close();
    }

    // ── The layer being painted ──────────────────────────────────────────────

    /**
     * The layer strokes land on. A map that has terrain tiles but no layer yet
     * gets one made on demand rather than refusing the first stroke — building
     * in game is the point, and needing a trip through Tiled to start would
     * defeat it.
     */
    activeLayer({ create = false } = {}) {
        const builder = this.builder;
        if (!builder) return null;

        const existing = builder.getLayer(this.activeLayerId) || builder.orderedLayers()[0] || null;
        if (existing) {
            this.activeLayerId = existing.id;
            return existing;
        }
        if (!create) return null;

        const created = builder.addLayer();
        this.activeLayerId = created?.id ?? null;
        return created;
    }

    /**
     * A new layer, painted with the set the picker names. The picker only
     * appears when the map's tilesets author more than one corner set — a
     * choice with one option is not a choice, it is furniture.
     */
    addLayer() {
        const builder = this.builder;
        const layer = builder?.addLayer({ wangSetName: this.wangSetSelect?.value || null });
        if (!layer) return;

        this.activeLayerId = layer.id;
        this.parent.parent?.buildHistory?.push({
            label: `Add ${layer.name}`,
            undo: () => { builder.removeLayer(layer.id); this.renderLayers(); },
            redo: () => { builder.restoreLayer(layer); this.renderLayers(); }
        });
        this.renderLayers();
        this.persist();
        this.parent.showMessage(`Added ${layer.name}.`, 'info', 'Ground');
    }

    renderWangSets() {
        const select = this.wangSetSelect;
        const names = [...(this.builder?.atlases.keys() ?? [])];
        if (!select) return;

        select.replaceChildren(...names.map(name => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            return option;
        }));
        select.value = this.activeLayer()?.atlas.name || names[0] || '';
        // `[hidden]`, not a class: `.setting-item:has(> label)` sets
        // `display: grid`, which beats any class rule that is not also more
        // specific — the panel's own convention, see _window-ui.
        const row = select.closest('.setting-item');
        if (row) row.hidden = names.length < 2;
    }

    // ── Painting ─────────────────────────────────────────────────────────────

    pointerToCell(event) {
        const map = this.gameMap;
        const world = map?.container?.inputHandler?.screenToWorldCoordinates?.(event.clientX, event.clientY);
        if (!world || !map?.gridSystem) return null;
        const cell = map.gridSystem.worldToGrid(world.x, world.y);
        if (cell.x < 0 || cell.y < 0 || cell.x >= map.gridSystem.gridWidth || cell.y >= map.gridSystem.gridHeight) {
            return null;
        }
        return cell;
    }

    /** The cells one press covers: a square brush centred on the cursor. */
    brushCells(cell) {
        const size = this.brushSize;
        const half = Math.floor((size - 1) / 2);
        const cells = [];
        for (let dy = 0; dy < size; dy++) {
            for (let dx = 0; dx < size; dx++) {
                cells.push({ x: cell.x - half + dx, y: cell.y - half + dy });
            }
        }
        return cells;
    }

    /**
     * Alt inverts the brush into an eraser for the length of a stroke, the same
     * way Ctrl inverts the wall tool — the common "paint a path, take a bite
     * back out of it" loop should not cost two trips to the panel. Held while
     * already erasing, it inverts back to paint.
     */
    resolveColorIndex(event = null) {
        const inverted = event?.altKey === true;
        if (this.isErasing) return inverted ? this.colorIndex : 0;
        return inverted ? 0 : this.colorIndex;
    }

    handlePointerDown(event) {
        if (!this.parent.isTool(UIToolModes.TERRAIN) || event.button !== 0) return;
        const cell = this.pointerToCell(event);
        if (!cell || !this.builder) return;

        event.preventDefault();
        event.stopPropagation();

        // The picker never edits anything, so it takes the click before a
        // stroke is opened and never needs an undo entry.
        if (this.tool === TerrainPaintPanel.TOOLS.PICK) {
            this.pickAt(cell);
            return;
        }

        const layer = this.activeLayer({ create: true });
        if (!layer) {
            this.parent.showMessage('This map has no ground to paint.', 'warning', 'Ground');
            return;
        }

        this.stroke = {
            pointerId: event.pointerId,
            preferred: layer,
            // Which layers existed before this gesture, so undoing a stroke that
            // had to invent one takes the layer away with it. Leaving an empty
            // layer behind after an undo is the panel disagreeing with the map
            // about what just happened.
            layersBefore: new Set(this.builder.layers),
            colorIndex: this.resolveColorIndex(event),
            // Every corner this stroke moved, oldest first and grouped by the
            // layer it landed on, so the whole drag undoes as one.
            changesByLayer: new Map(),
            painted: new Set(),
            spilled: false,
            // A rectangle is decided on release, so the press only remembers
            // where the box started.
            rectangle: this.isRectangleMode(event),
            start: cell,
            end: cell
        };
        this.runSound.reset();
        if (this.stroke.rectangle) return;
        if (this.tool === TerrainPaintPanel.TOOLS.FILL) this.fillAt(cell);
        else this.paintAt(cell);
        this.renderLayers();
    }

    /**
     * Take what is under the cursor: the terrain, and the layer it is on.
     *
     * This is the answer to "which layer is that pond on" — the question the
     * layer list cannot answer by itself, because a list of names says nothing
     * about where on the map each one is. Clicking the thing you can see is a
     * shorter route than reading the list and guessing.
     */
    pickAt(cell) {
        const sample = this.builder?.sampleAt(cell.x, cell.y);
        if (!sample) {
            this.parent.showMessage('Nothing painted there.', 'info', 'Ground');
            return false;
        }
        this.colorIndex = sample.colorIndex;
        this.selectLayer(sample.layer.id);
        this.parent.showMessage(
            `${sample.layer.atlas.colorAt(sample.colorIndex)?.name || 'Ground'} on ${sample.layer.name}.`,
            'info', 'Ground'
        );
        return true;
    }

    /**
     * Flood the region the click lands in. One click, one undo step — the whole
     * point of a bucket is that it is a single decision.
     */
    fillAt(cell) {
        const stroke = this.stroke;
        const builder = this.builder;
        if (!stroke || !builder) return;

        const region = builder.fillRegion(stroke.preferred, cell.x, cell.y);
        const allowed = region.filter(candidate => {
            const rule = this.rules?.canPaintTerrainCell(candidate.x, candidate.y);
            if (rule && rule.allowed === false) {
                this.reportRefusal(rule.reason);
                return false;
            }
            stroke.painted.add(`${candidate.x},${candidate.y}`);
            return true;
        });
        if (allowed.length === 0) return;

        const layer = builder.resolveLayerFor(allowed, stroke.colorIndex, stroke.preferred);
        if (!layer) return;

        const changes = builder.paint(layer, allowed, stroke.colorIndex);
        if (!changes) return;

        if (!stroke.changesByLayer.has(layer)) stroke.changesByLayer.set(layer, []);
        stroke.changesByLayer.get(layer).push(...changes);
        if (layer !== stroke.preferred) stroke.spilled = true;
        // One tick for the bucket, not one per cell it reached.
        this.runSound.advance(1, { descending: stroke.colorIndex === 0 });
    }

    handlePointerMove(event) {
        if (!this.stroke) {
            if (this.parent.isTool(UIToolModes.TERRAIN)) this.updateCursor(event);
            return;
        }
        if (event.pointerId !== this.stroke.pointerId) return;
        // The bucket already did its work on the press; dragging it would fill
        // a fresh region under every pixel the pointer crossed.
        if (this.tool === TerrainPaintPanel.TOOLS.FILL) return;
        const cell = this.pointerToCell(event);
        if (!cell) return;
        event.preventDefault();
        event.stopPropagation();

        this.stroke.end = cell;
        this.stroke.rectangle = this.isRectangleMode(event);
        // A rectangle paints nothing until it is let go: the box is not a box
        // until you know where it ends, and painting the drag as you went would
        // leave a smeared line under a shape you never asked for.
        if (this.stroke.rectangle) {
            this.renderRectanglePreview();
            return;
        }
        this.paintAt(cell);
    }

    handlePointerUp(event) {
        if (!this.stroke || event.pointerId !== this.stroke.pointerId) return;
        if (this.stroke.rectangle) {
            const cells = TerrainPaintPanel.rectangleCells(this.stroke.start, this.stroke.end);
            for (const cell of cells) this.paintCells([cell]);
            this.clearRectanglePreview();
        }
        this.commitStroke();
        this.renderLayers();
    }

    renderRectanglePreview() {
        const { start, end } = this.stroke;
        if (!this.preview) {
            this.preview = document.createElement('div');
            this.preview.className = 'terrain-rect-preview';
            this.gameMap?.layers?.controls?.appendChild(this.preview);
        }
        const size = this.gameMap?.gridSystem?.config?.cellSize ?? 32;
        Object.assign(this.preview.style, {
            left: `${Math.min(start.x, end.x) * size}px`,
            top: `${Math.min(start.y, end.y) * size}px`,
            width: `${(Math.abs(end.x - start.x) + 1) * size}px`,
            height: `${(Math.abs(end.y - start.y) + 1) * size}px`
        });
    }

    clearRectanglePreview() {
        this.preview?.remove();
        this.preview = null;
    }

    updateCursor(event) {
        const cell = this.pointerToCell(event);
        if (!cell || !this.builder) {
            this.parent.setBuildCursor(null);
            return;
        }
        const allowed = this.rules?.canPaintTerrainCell(cell.x, cell.y)?.allowed !== false;
        this.parent.setBuildCursor(allowed ? 'ready' : 'refused');
    }

    paintAt(cell) {
        this.paintCells(this.brushCells(cell));
    }

    paintCells(brushCells) {
        const stroke = this.stroke;
        const builder = this.builder;
        if (!stroke || !builder) return;

        const cells = brushCells.filter(candidate => {
            const key = `${candidate.x},${candidate.y}`;
            if (stroke.painted.has(key)) return false;
            const allowed = this.rules?.canPaintTerrainCell(candidate.x, candidate.y);
            if (allowed && allowed.allowed === false) {
                this.reportRefusal(allowed.reason);
                return false;
            }
            stroke.painted.add(key);
            return true;
        });
        if (cells.length === 0) return;

        // Resolved per brush position, not once per stroke: a drag that leaves
        // the grass and crosses a pond needs the pond's layer for the part that
        // is over it, and one layer for the whole gesture cannot give it that.
        const layer = builder.resolveLayerFor(cells, stroke.colorIndex, stroke.preferred);
        if (!layer) return;

        const changes = builder.paint(layer, cells, stroke.colorIndex);
        if (!changes) return;

        if (!stroke.changesByLayer.has(layer)) stroke.changesByLayer.set(layer, []);
        stroke.changesByLayer.get(layer).push(...changes);
        if (layer !== stroke.preferred) stroke.spilled = true;
        // The run is the cells the brush has actually changed, not the number
        // of pointer events — a pointer that jitters inside one cell is one
        // tick, and crossing back over painted ground is silent.
        this.runSound.advance(stroke.painted.size, { descending: stroke.colorIndex === 0 });
    }

    reportRefusal(reason) {
        if (!reason || reason === this._lastRefusal) return;
        this._lastRefusal = reason;
        this.parent.showMessage(reason, 'warning', 'Ground');
    }

    /**
     * One stroke, one undo step. The corner changes are replayed backwards
     * through the same apply path the brush used, so the canvas, the grid and
     * every listener see an undo exactly as they saw the paint.
     */
    commitStroke() {
        const stroke = this.stroke;
        this.stroke = null;
        this._lastRefusal = null;
        if (!stroke || stroke.changesByLayer.size === 0) return;

        const builder = this.builder;
        const groups = [...stroke.changesByLayer]
            .map(([layer, changes]) => ({ layer, changes: changes.map(change => ({ ...change })) }))
            .filter(group => group.changes.length > 0);
        if (groups.length === 0) return;

        const terrainName = groups[0].layer.atlas.colorAt(stroke.colorIndex)?.name || 'Ground';
        const created = builder.layers.filter(layer => !stroke.layersBefore?.has(layer));
        this.parent.parent?.buildHistory?.push({
            label: stroke.colorIndex === 0 ? 'Erase Ground' : `Paint ${terrainName}`,
            // Undo walks each layer's changes backwards: two passes over the
            // same corner in one drag leave two entries, and the earlier one
            // holds the colour to go back to. Layers the stroke had to invent
            // go last, once the paint that justified them is gone.
            undo: () => {
                groups.forEach(({ layer, changes }) =>
                    builder.applyCornerChanges(layer, [...changes].reverse(), { direction: 'from' }));
                created.forEach(layer => builder.removeLayer(layer.id));
                this.renderLayers();
            },
            redo: () => {
                created.forEach(layer => builder.restoreLayer(layer));
                groups.forEach(({ layer, changes }) =>
                    builder.applyCornerChanges(layer, changes, { direction: 'to' }));
                this.renderLayers();
            }
        });

        if (stroke.spilled) {
            // Said once per stroke, because the tool just made a structural
            // decision on the player's behalf and a layer appearing in the list
            // with no explanation is a mystery.
            const landed = groups[groups.length - 1].layer;
            this.activeLayerId = landed.id;
            this.renderLayers();
            this.parent.showMessage(
                `${terrainName} went onto ${landed.name} — it can't blend into what was already there.`,
                'info', 'Ground'
            );
        }

        const map = this.gameMap;
        map?.container?.worldState?.captureMap?.(map);
        map?.core?.user?._scheduleSave?.();
    }

    cancelStroke() {
        this.clearRectanglePreview();
        if (!this.stroke) return false;
        this.commitStroke();
        return true;
    }

    // ── Rendering ────────────────────────────────────────────────────────────

    render() {
        this.renderTool();
        this.renderPalette();
        this.renderWangSets();
        this.renderLayers();
    }

    /**
     * The palette is about which terrain; the tool is about what happens to it.
     * Picking and erasing do not read a terrain, so the palette steps back
     * rather than sitting there implying a choice nothing is listening to.
     */
    renderTool() {
        const usesColor = this.tool === TerrainPaintPanel.TOOLS.PAINT ||
            this.tool === TerrainPaintPanel.TOOLS.FILL;
        this.paletteElement?.classList.toggle('is-inactive', !usesColor);
        this.modalElement?.querySelector('.terrain-brush-row')
            ?.classList.toggle('is-inactive', this.tool !== TerrainPaintPanel.TOOLS.PAINT);
        this.parent.setBuildCursor(null);
    }

    renderPalette() {
        if (!this.paletteElement) return;
        this.paletteElement.replaceChildren();

        const atlas = this.activeLayer()?.atlas || this.builder?.defaultAtlas || null;
        const available = !!atlas;
        this.emptyElement?.classList.toggle('is-hidden', available);
        this.paletteElement.classList.toggle('is-hidden', !available);
        if (!atlas) return;

        // No Erase swatch: erasing is a tool, not a terrain. See TOOLS.
        for (const color of atlas.colors) {
            this.paletteElement.appendChild(this.buildSwatch({
                index: color.index,
                name: color.name,
                url: atlas.swatchUrl(atlas.solidTileIdForColor(color.index)),
                color: color.color,
                atlas
            }));
        }
    }

    buildSwatch({ index, name, url, color = null }) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'terrain-swatch';
        button.dataset.colorIndex = String(index);
        button.title = name;
        button.setAttribute('aria-pressed', String(index === this.colorIndex));
        button.classList.toggle('is-selected', index === this.colorIndex);

        const sample = document.createElement('span');
        sample.className = 'terrain-swatch__sample';
        // The tile itself where the tileset image has loaded, the wang colour
        // as a fallback — a swatch that is a flat block of the editor's colour
        // is still a truthful answer to "which terrain is this".
        if (url) sample.style.backgroundImage = `url(${url})`;
        else if (color) sample.style.backgroundColor = color;

        const label = document.createElement('span');
        label.className = 'terrain-swatch__name';
        label.textContent = name;

        button.append(sample, label);
        button.addEventListener('click', () => {
            this.colorIndex = index;
            this.renderPalette();
        });
        return button;
    }

    renderLayers() {
        if (!this.layerListElement) return;

        // A rename in progress must survive the redraw the rename itself
        // triggers, or the field loses focus on the first keystroke that
        // commits.
        const active = document.activeElement;
        const focusedLayer = active?.closest?.('.terrain-layer-row')?.dataset.layerId ?? null;

        const builder = this.builder;
        const layers = builder?.orderedLayers() || [];
        this.layerListElement.replaceChildren(
            // Topmost first, which is how the map reads: the last layer drawn is
            // the one you can see.
            ...(layers.length
                ? [...layers].reverse().map(layer => this.buildLayerRow(layer, layers.length))
                : [TerrainPaintPanel.emptyLayerState()])
        );

        if (focusedLayer) {
            this.layerListElement
                .querySelector(`.terrain-layer-row[data-layer-id="${focusedLayer}"] .terrain-layer-name`)
                ?.focus();
        }
    }

    static emptyLayerState() {
        const empty = document.createElement('p');
        empty.className = 'panel-list__empty terrain-layer-empty';
        empty.textContent = 'No ground layers yet. Paint anywhere and the first one is made for you.';
        return empty;
    }

    buildLayerRow(layer, count) {
        const row = document.createElement('div');
        row.className = 'panel-row panel-row--lead terrain-layer-row';
        row.dataset.layerId = String(layer.id);
        row.classList.toggle('active', String(layer.id) === String(this.activeLayerId));
        row.classList.toggle('is-hidden-layer', layer.visible === false);
        // Selecting the layer is the row's job; the controls inside it stop the
        // press so typing a name or pressing delete does not also move the brush.
        row.addEventListener('pointerdown', () => this.selectLayer(layer.id));

        const name = document.createElement('input');
        name.type = 'text';
        name.className = 'panel-row__name terrain-layer-name';
        name.value = layer.name;
        name.maxLength = 32;
        name.autocomplete = 'off';
        name.spellcheck = false;
        name.setAttribute('aria-label', `Name for ${layer.name}`);
        name.addEventListener('change', () => this.commitRename(layer.id, name.value));
        name.addEventListener('keydown', event => {
            if (event.key === 'Enter') name.blur();
        });
        name.addEventListener('pointerdown', event => event.stopPropagation());
        name.addEventListener('focus', () => this.selectLayer(layer.id));

        // Ahead of the chip, not off with the controls at the far end: it says
        // whether you are looking at this layer at all, which is the first thing
        // about a row rather than an action you take on it.
        const visible = layer.visible !== false;
        const visibility = this.buildRowButton({
            label: visible ? '\u25C9' : '\u25CB',
            title: visible ? `Hide ${layer.name}` : `Show ${layer.name}`,
            className: 'terrain-layer-visible',
            onClick: () => {
                this.builder?.setLayerVisible(layer.id, !visible);
                this.renderLayers();
                this.persist();
            }
        });

        const controls = document.createElement('div');
        controls.className = 'panel-row__controls';

        for (const [delta, label, title] of [[1, '\u25B2', 'Move up'], [-1, '\u25BC', 'Move down']]) {
            controls.appendChild(this.buildRowButton({
                label,
                title,
                className: 'terrain-layer-move',
                disabled: count < 2,
                onClick: () => {
                    this.builder?.reorderLayer(layer.id, delta);
                    this.renderLayers();
                    this.persist();
                }
            }));
        }

        controls.appendChild(this.buildRowButton({
            label: '\u2715',
            title: `Delete ${layer.name}`,
            className: 'panel-row__delete terrain-layer-delete',
            onClick: () => this.deleteLayer(layer.id)
        }));

        row.append(visibility, this.buildLayerThumbnail(layer), name, controls);
        return row;
    }

    buildRowButton({ label, title, className, disabled = false, onClick }) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `panel-row__btn ${className}`;
        button.textContent = label;
        button.title = title;
        button.setAttribute('aria-label', title);
        button.disabled = disabled;
        button.addEventListener('pointerdown', event => event.stopPropagation());
        button.addEventListener('click', onClick);
        return button;
    }

    /**
     * The layer's chip: the actual tile art of whatever terrain it is mostly
     * made of.
     *
     * It was a shrunken render of the layer, which was clever and useless — a
     * pond four cells across on a 64-cell map is two pixels, so every chip
     * looked like an empty square. What you want from a list is "which one is
     * the water", and the tile itself answers that at a glance, in exactly the
     * art the palette above uses. Tiled at swatch scale so it reads as a
     * material rather than as one lonely tile.
     */
    buildLayerThumbnail(layer) {
        const chip = document.createElement('span');
        chip.className = 'panel-row__chip terrain-layer-thumb';

        const colorIndex = layer.dominantColorIndex();
        const color = layer.atlas.colorAt(colorIndex);
        const url = colorIndex > 0 ? layer.atlas.swatchUrlForColor(colorIndex) : null;

        if (url) chip.style.backgroundImage = `url(${url})`;
        // The wang set's editor colour as a fallback, and nothing at all for an
        // empty layer — a chip showing a terrain the layer does not have would
        // be worse than a blank one.
        else if (color?.color) chip.style.backgroundColor = color.color;
        else chip.classList.add('is-empty');

        chip.title = color ? `${color.name} — ${layer.atlas.name}` : `Empty — ${layer.atlas.name}`;
        return chip;
    }

    /**
     * Make a layer the one being painted, and say so on the map as well as in
     * the list - a highlight over the layer's own art, because "which layer is
     * selected" is a question about the map, not about the panel.
     */
    selectLayer(layerId) {
        if (String(layerId) === String(this.activeLayerId)) return false;
        this.activeLayerId = layerId;
        this.renderLayers();
        this.flashLayer(layerId);
        return true;
    }

    flashLayer(layerId) {
        this.builder?.highlightLayer(layerId);
    }

    commitRename(layerId, value) {
        const builder = this.builder;
        const previous = builder?.renameLayer(layerId, value);
        if (!previous) {
            this.renderLayers();
            return false;
        }
        const next = builder.getLayer(layerId)?.name;
        this.parent.parent?.buildHistory?.push({
            label: 'Rename Ground Layer',
            undo: () => { builder.renameLayer(layerId, previous); this.renderLayers(); },
            redo: () => { builder.renameLayer(layerId, next); this.renderLayers(); }
        });
        this.renderLayers();
        this.persist();
        return true;
    }

    /**
     * Delete a layer, with the paint on it.
     *
     * No confirm: it is one undo away, and the undo puts the layer back whole -
     * the same bargain every other build edit offers. A dialog for something
     * this reversible is a dialog people learn to dismiss without reading.
     */
    deleteLayer(layerId) {
        const builder = this.builder;
        const layer = builder?.removeLayer(layerId);
        if (!layer) return false;

        if (String(this.activeLayerId) === String(layerId)) {
            this.activeLayerId = builder.orderedLayers().at(-1)?.id ?? null;
        }
        this.parent.parent?.buildHistory?.push({
            label: `Delete ${layer.name}`,
            undo: () => { builder.restoreLayer(layer); this.renderLayers(); },
            redo: () => { builder.removeLayer(layer.id); this.renderLayers(); }
        });
        this.render();
        this.persist();
        this.parent.showMessage(`Deleted ${layer.name}.`, 'info', 'Ground');
        return true;
    }

    persist() {
        const map = this.gameMap;
        map?.container?.worldState?.captureMap?.(map);
        map?.core?.user?._scheduleSave?.();
    }

    dispose() {
        this.cancelStroke();
        this.parent?.parent?.canvas?.removeEventListener('pointerdown', this.boundPointerDown, true);
        document.removeEventListener('pointermove', this.boundPointerMove, true);
        document.removeEventListener('pointerup', this.boundPointerUp, true);
        document.removeEventListener('pointercancel', this.boundPointerUp, true);
        this.unsubscribers?.forEach(unsubscribe => unsubscribe?.());
        this.brushSegment?.dispose();
        this.brushSegment = null;
        this.toolSegment?.dispose();
        this.toolSegment = null;
        document.body.classList.remove('terrain-paint-mode');
        super.dispose();
    }
}
