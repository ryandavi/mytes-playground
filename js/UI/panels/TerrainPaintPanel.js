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
        return Number(this.brushSegment?.value) || 1;
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

    addLayer() {
        const layer = this.builder?.addLayer();
        if (!layer) return;
        this.activeLayerId = layer.id;
        this.renderLayers();
        this.parent.showMessage(`Added ${layer.name}.`, 'info', 'Ground');
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
     * back out of it" loop should not cost two trips to the panel.
     */
    resolveColorIndex(event = null) {
        return event?.altKey === true ? 0 : this.colorIndex;
    }

    handlePointerDown(event) {
        if (!this.parent.isTool(UIToolModes.TERRAIN) || event.button !== 0) return;
        const cell = this.pointerToCell(event);
        if (!cell || !this.builder) return;

        event.preventDefault();
        event.stopPropagation();

        const layer = this.activeLayer({ create: true });
        if (!layer) {
            this.parent.showMessage('This map has no ground to paint.', 'warning', 'Ground');
            return;
        }

        this.stroke = {
            pointerId: event.pointerId,
            preferred: layer,
            colorIndex: this.resolveColorIndex(event),
            // Every corner this stroke moved, oldest first and grouped by the
            // layer it landed on, so the whole drag undoes as one.
            changesByLayer: new Map(),
            painted: new Set(),
            spilled: false
        };
        this.runSound.reset();
        this.paintAt(cell);
        this.renderLayers();
    }

    handlePointerMove(event) {
        if (!this.stroke) {
            if (this.parent.isTool(UIToolModes.TERRAIN)) this.updateCursor(event);
            return;
        }
        if (event.pointerId !== this.stroke.pointerId) return;
        const cell = this.pointerToCell(event);
        if (!cell) return;
        event.preventDefault();
        event.stopPropagation();
        this.paintAt(cell);
    }

    handlePointerUp(event) {
        if (!this.stroke || event.pointerId !== this.stroke.pointerId) return;
        this.commitStroke();
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
        const stroke = this.stroke;
        const builder = this.builder;
        if (!stroke || !builder) return;

        const cells = this.brushCells(cell).filter(candidate => {
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
        this.parent.parent?.buildHistory?.push({
            label: stroke.colorIndex === 0 ? 'Erase Ground' : `Paint ${terrainName}`,
            // Undo walks each layer's changes backwards: two passes over the
            // same corner in one drag leave two entries, and the earlier one
            // holds the colour to go back to.
            undo: () => groups.forEach(({ layer, changes }) =>
                builder.applyCornerChanges(layer, [...changes].reverse(), { direction: 'from' })),
            redo: () => groups.forEach(({ layer, changes }) =>
                builder.applyCornerChanges(layer, changes, { direction: 'to' }))
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
        if (!this.stroke) return false;
        this.commitStroke();
        return true;
    }

    // ── Rendering ────────────────────────────────────────────────────────────

    render() {
        this.renderPalette();
        this.renderLayers();
    }

    renderPalette() {
        if (!this.paletteElement) return;
        this.paletteElement.replaceChildren();

        const atlas = this.activeLayer()?.atlas || this.builder?.defaultAtlas || null;
        const available = !!atlas;
        this.emptyElement?.classList.toggle('is-hidden', available);
        this.paletteElement.classList.toggle('is-hidden', !available);
        if (!atlas) return;

        this.paletteElement.appendChild(this.buildSwatch({
            index: 0,
            name: 'Erase',
            url: null,
            atlas
        }));
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
        button.classList.toggle('terrain-swatch--erase', index === 0);

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
        this.layerListElement.replaceChildren();

        const builder = this.builder;
        const layers = builder?.orderedLayers() || [];
        // Topmost first, which is how the map reads: the last layer drawn is
        // the one you can see.
        for (const layer of [...layers].reverse()) {
            this.layerListElement.appendChild(this.buildLayerRow(layer, layers.length));
        }
    }

    buildLayerRow(layer, count) {
        const row = document.createElement('div');
        row.className = 'terrain-layer-row';
        row.classList.toggle('active', String(layer.id) === String(this.activeLayerId));

        const name = document.createElement('button');
        name.type = 'button';
        name.className = 'terrain-layer-name';
        name.textContent = layer.name;
        name.title = `Paint on ${layer.name} (${layer.atlas.name})`;
        name.addEventListener('click', () => {
            this.activeLayerId = layer.id;
            this.render();
        });

        const controls = document.createElement('div');
        controls.className = 'terrain-layer-controls';
        for (const [delta, label, title] of [[1, '▲', 'Move up'], [-1, '▼', 'Move down']]) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'terrain-layer-move';
            button.textContent = label;
            button.title = title;
            button.disabled = count < 2;
            button.addEventListener('click', () => {
                this.builder?.reorderLayer(layer.id, delta);
                this.renderLayers();
            });
            controls.appendChild(button);
        }

        row.append(name, controls);
        return row;
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
        document.body.classList.remove('terrain-paint-mode');
        super.dispose();
    }
}
