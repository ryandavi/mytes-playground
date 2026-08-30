/**
 * CellDragBuildPanel — the shared machinery behind every "drag over the grid to
 * build a run of cells" tool. WallBuildPanel and FenceBuildPanel are both this
 * window wearing a different builder.
 *
 * It owns the parts that are the same whatever is being laid down: the pointer
 * plumbing on the canvas, turning a pointer into a grid cell, walking a drag
 * out into a line or a rectangle, the ghost cells and the measurement label,
 * the Add/Remove segment with its Ctrl-invert, the run-sound pacing, and the
 * hover crosshair that answers "can I build here?".
 *
 * A subclass supplies the tool's identity (`toolMode`, `bodyClass`), its
 * builder (`getBuilder`), the two questions the ghosts ask of a cell
 * (`checkCell`, `cellWouldChange`), and what a release actually does
 * (`commitCells`). Anything a single tool needs on top of the plain drag —
 * the Wall tool's grab-a-run-and-move-it handle — hangs off the
 * `*SpecialGesture` / `renderSpecialHover` / `clearSpecial` hooks, which are
 * no-ops here.
 */
class CellDragBuildPanel extends ModalWindow {
    constructor(parent, buildConfig = {}) {
        super(parent, {
            id: buildConfig.id,
            closeOnOutsideClick: false,
            position: 'top-right',
            draggable: true,
            closeButtonSelector: '.modal-close-btn'
        });
        this.buildConfig = buildConfig;
        this.drag = null;
        this.hoverCell = null;
        this.hoverOperation = null;
        this.hoverEvent = null;
        this.runSound = new BuildRunSound(this);
        this.ghostElements = [];
        this.measureLabel = null;
        this.boundPointerDown = this.handlePointerDown.bind(this);
        this.boundPointerMove = this.handlePointerMove.bind(this);
        this.boundPointerUp = this.handlePointerUp.bind(this);
        this.boundPointerLeave = this.clearHover.bind(this);
        this.init();
        this.operationSegment = new SegmentControl(
            this.modalElement?.querySelector(buildConfig.operationSegmentSelector) || null,
            { value: 'add', onChange: () => this.renderHoverGhost() }
        );
        this.rectangleToggle = buildConfig.rectangleToggleSelector
            ? this.modalElement?.querySelector(buildConfig.rectangleToggleSelector) || null
            : null;
        this.canvas?.addEventListener('pointerdown', this.boundPointerDown, true);
        this.canvas?.addEventListener('pointerleave', this.boundPointerLeave);
        document.addEventListener('pointermove', this.boundPointerMove, true);
        document.addEventListener('pointerup', this.boundPointerUp, true);
        document.addEventListener('pointercancel', this.boundPointerUp, true);
    }

    // ── Tool identity (subclass supplies via buildConfig) ─────────────────────

    get toolMode() { return this.buildConfig.toolMode; }
    get bodyClass() { return this.buildConfig.bodyClass; }

    // `parent` is the UserInterface; its parent is the container. ModalWindow
    // already claims `this.container`, so the container is reached the long way
    // round here — the same convention the other build panels follow.
    get build() { return this.parent?.parent || null; }
    get canvas() { return this.build?.canvas || null; }
    get gameMap() { return this.build?.gameMap || null; }
    get rules() { return this.build?.buildRules || null; }

    // ── Subclass hooks ───────────────────────────────────────────────────────

    // The builder this tool drives. Null on a map that has no such system.
    getBuilder() { return null; }

    // Pre-flight of the rules the commit enforces, so a blocked cell reads red
    // under the cursor instead of silently vanishing on release.
    checkCell(_cell, _operation = this.getOperation()) { return BuildRules.ALLOWED; }

    // Allowed is not the same as "would do something": laying over what is
    // already there is permitted and changes nothing.
    cellWouldChange(_map, _cell, _removing) { return true; }

    // Keep the run. Returns truthy on a change that happened.
    commitCells(_map, _cells, _operation) { return false; }

    // Extra gestures a single tool layers on top of the plain drag. Each
    // returns true to say "I have taken this event, stop here".
    tryBeginSpecialGesture(_cell, _event) { return false; }
    updateSpecialGesture(_event) { return false; }
    finishSpecialGesture(_event) { return false; }
    renderSpecialHover(_cell, _operation) { return false; }
    clearSpecial() {}

    // ── Mode / window ────────────────────────────────────────────────────────

    handleToolModeChanged(mode) {
        const active = mode === this.toolMode;
        if (this.bodyClass) document.body.classList.toggle(this.bodyClass, active);
        if (active) {
            this.open();
        } else {
            this.cancelDrag();
            this.clearHover();
            super.close();
        }
    }

    // Closing the window is putting the tool down, so it hands back to whatever
    // the current mode's default tool is — Select once build mode has been left.
    close() {
        if (this.parent.isTool(this.toolMode) &&
            this.parent.changeToolMode(this.parent.toolManager.getDefaultToolFor())) {
            return;
        }
        super.close();
    }

    // ── Operation / rectangle ────────────────────────────────────────────────

    getOperation() {
        return this.operationSegment?.value || 'add';
    }

    /**
     * The operation this gesture is actually performing. Ctrl held inverts the
     * panel's tool for the length of the drag without touching the segment —
     * the Sims' knock-a-wall-down modifier — so the common "lay a run, fix one
     * cell, carry on" loop never costs two trips to the panel.
     */
    resolveOperation(event = null) {
        if (event?.ctrlKey === true) return this.getOperation() === 'remove' ? 'add' : 'remove';
        return this.getOperation();
    }

    // Shift is unavailable on touch, so the panel carries the same switch.
    isRectangleMode(event = null) {
        return event?.shiftKey === true || this.rectangleToggle?.checked === true;
    }

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

    // ── Pointer ──────────────────────────────────────────────────────────────

    handlePointerDown(event) {
        if (!this.parent.isTool(this.toolMode) || event.button !== 0) return;
        const cell = this.pointerToCell(event);
        if (!cell || !this.getBuilder()) return;
        event.preventDefault();
        event.stopPropagation();
        this.runSound.reset();

        if (this.tryBeginSpecialGesture(cell, event)) return;

        const operation = this.resolveOperation(event);
        this.drag = {
            pointerId: event.pointerId,
            map: this.gameMap,
            start: cell,
            end: cell,
            rectangle: this.isRectangleMode(event),
            operation,
            soundedCells: 0
        };
        this.hoverCell = null;
        this.hoverOperation = null;
        this.renderGhosts(this.getDragCells(), event);
    }

    handlePointerMove(event) {
        if (!this.drag) {
            this.renderHoverGhost(event);
            return;
        }
        if (event.pointerId !== this.drag.pointerId) return;
        const cell = this.pointerToCell(event);
        if (!cell) return;
        event.preventDefault();
        event.stopPropagation();
        this.drag.end = cell;
        if (this.updateSpecialGesture(event)) return;
        this.drag.rectangle = this.isRectangleMode(event);
        this.drag.operation = this.resolveOperation(event);
        this.renderGhosts(this.getDragCells(), event);
    }

    handlePointerUp(event) {
        if (!this.drag || event.pointerId !== this.drag.pointerId) return;
        event.preventDefault();
        event.stopPropagation();
        if (this.finishSpecialGesture(event)) return;
        const cells = this.getDragCells();
        const map = this.drag.map;
        const operation = this.drag.operation;
        this.cancelDrag();
        this.commitCells(map, cells, operation);
    }

    getDragCells() {
        if (!this.drag) return [];
        const { start, end, rectangle } = this.drag;
        const minX = Math.min(start.x, end.x);
        const maxX = Math.max(start.x, end.x);
        const minY = Math.min(start.y, end.y);
        const maxY = Math.max(start.y, end.y);
        const keys = new Set();
        if (rectangle) {
            for (let x = minX; x <= maxX; x += 1) {
                keys.add(`${x},${minY}`);
                keys.add(`${x},${maxY}`);
            }
            for (let y = minY; y <= maxY; y += 1) {
                keys.add(`${minX},${y}`);
                keys.add(`${maxX},${y}`);
            }
        } else if (Math.abs(end.x - start.x) >= Math.abs(end.y - start.y)) {
            for (let x = minX; x <= maxX; x += 1) keys.add(`${x},${start.y}`);
        } else {
            for (let y = minY; y <= maxY; y += 1) keys.add(`${start.x},${y}`);
        }
        return [...keys].map(key => {
            const [x, y] = key.split(',').map(Number);
            return { x, y };
        });
    }

    // ── Hover crosshair ──────────────────────────────────────────────────────

    /**
     * A single ghost cell under the cursor before any drag starts, in the
     * colour of what a click would do and struck through when it would be
     * refused. This is the answer to "can I build here?" — a cursor swap alone
     * cannot say *which* cell it means on a grid this size.
     */
    renderHoverGhost(event = null) {
        if (event) this.hoverEvent = event;
        const source = event || this.hoverEvent;
        if (!this.parent.isTool(this.toolMode) || !source) return;
        if (!this.canvas?.contains(source.target)) {
            this.clearHover();
            return;
        }
        const cell = this.pointerToCell(source);
        if (!cell) {
            this.clearHover();
            return;
        }
        // pointermove fires far faster than the cursor crosses a cell, and every
        // repeat would rebuild the ghost element for the same square.
        const operation = this.resolveOperation(source);
        if (this.hoverCell?.x === cell.x && this.hoverCell?.y === cell.y &&
            this.hoverOperation === operation) {
            return;
        }
        this.hoverCell = cell;
        this.hoverOperation = operation;

        if (this.renderSpecialHover(cell, operation)) return;

        this.renderGhosts([cell], null, operation);
        this.parent.setBuildCursor(this.cursorFor(cell, operation));
    }

    /**
     * Allowed is not the same as "would do something" — laying over what is
     * already there is permitted and changes nothing, and the ghost already
     * says so by going dotted. The cursor says the same thing by going plain: a
     * crosshair over a square where a click is a no-op is the tool promising
     * work it will not do.
     */
    cursorFor(cell, operation) {
        if (!this.checkCell(cell, operation).allowed) return 'refused';
        return this.cellWouldChange(this.gameMap, cell, operation === 'remove') ? 'ready' : null;
    }

    // A run of cells drawn as one quiet outline (used by a special hover).
    renderRunGhost(cells) {
        this.clearGhosts();
        const layer = this.gameMap?.layers?.objects;
        const cellSize = this.gameMap?.gridSystem?.config?.cellSize;
        if (!layer || !cellSize) return;
        for (const cell of cells) {
            const ghost = document.createElement('div');
            ghost.className = 'build-ghost-cell is-run';
            ghost.style.left = `${cell.x * cellSize}px`;
            ghost.style.top = `${cell.y * cellSize}px`;
            ghost.style.width = `${cellSize}px`;
            ghost.style.height = `${cellSize}px`;
            layer.appendChild(ghost);
            this.ghostElements.push(ghost);
        }
    }

    clearHover() {
        if (this.drag) return;
        this.hoverCell = null;
        this.hoverOperation = null;
        this.hoverEvent = null;
        this.clearGhosts();
        this.clearSpecial();
        this.parent.setBuildCursor(null);
    }

    // ── Ghosts / measurement ─────────────────────────────────────────────────

    renderGhosts(cells, event = null, operationOverride = null) {
        this.clearGhosts();
        const map = this.drag?.map || this.gameMap;
        const layer = map?.layers?.objects;
        const cellSize = map?.gridSystem?.config?.cellSize;
        if (!layer || !cellSize) return;
        const operation = operationOverride || this.drag?.operation || this.getOperation();
        const removing = operation === 'remove';
        let effective = 0;
        for (const cell of cells) {
            const allowed = this.checkCell(cell, operation).allowed;
            const changes = allowed && this.cellWouldChange(map, cell, removing);
            if (changes) effective += 1;
            const ghost = document.createElement('div');
            ghost.className = `build-ghost-cell${removing ? ' is-remove' : ''}` +
                `${allowed ? '' : ' is-invalid'}${allowed && !changes ? ' is-inert' : ''}`;
            ghost.style.left = `${cell.x * cellSize}px`;
            ghost.style.top = `${cell.y * cellSize}px`;
            ghost.style.width = `${cellSize}px`;
            ghost.style.height = `${cellSize}px`;
            layer.appendChild(ghost);
            this.ghostElements.push(ghost);
        }
        if (this.drag) this.tickRunSound(effective, removing);
        this.renderMeasurement(effective, event);
    }

    /**
     * One knock the moment each cell joins the run, not a burst when the drag
     * ends. The pacing rules live in BuildRunSound, shared with every other
     * drag-to-build tool.
     */
    tickRunSound(count, removing) {
        if (!this.drag) return;
        this.drag.soundedCells = count;
        this.runSound.advance(count, { descending: removing });
    }

    renderMeasurement(count, event) {
        if (!event || count <= 0 || !this.drag) {
            this.clearMeasurement();
            return;
        }
        if (!this.measureLabel) {
            this.measureLabel = document.createElement('div');
            this.measureLabel.className = 'build-measure-label';
            document.body.appendChild(this.measureLabel);
        }
        const { start, end, rectangle } = this.drag;
        const width = Math.abs(end.x - start.x) + 1;
        const height = Math.abs(end.y - start.y) + 1;
        this.measureLabel.textContent = rectangle ? `${width}×${height}` : `${count} cells`;
        this.measureLabel.style.left = `${event.clientX + 16}px`;
        this.measureLabel.style.top = `${event.clientY + 16}px`;
    }

    clearMeasurement() {
        this.measureLabel?.remove();
        this.measureLabel = null;
    }

    clearGhosts() {
        for (const element of this.ghostElements) element.remove();
        this.ghostElements = [];
        this.clearMeasurement();
    }

    cancelDrag() {
        const wasDragging = this.drag !== null;
        this.clearGhosts();
        this.drag = null;
        return wasDragging;
    }

    // ── Commit helpers (shared by every subclass's commitCells) ───────────────

    afterCommit(map) {
        map?.container?.worldState?.captureMap?.(map);
        map?.core?.user?._scheduleSave?.();
    }

    pushHistory(entry) {
        this.build?.buildHistory?.push(entry);
    }

    reportRejections(rejected = [], title = 'Build') {
        if (!rejected || rejected.length === 0) return;
        const reason = rejected[0].reason || 'Some cells are blocked.';
        this.parent.showMessage(
            rejected.length === 1 ? reason : `${rejected.length} cells blocked — ${reason}`,
            'warning',
            title
        );
    }

    playSound(soundId, options = {}) {
        if (soundId) this.build?.core?.soundManager?.playWhenReady?.(soundId, options);
    }

    // ── Lifecycle ────────────────────────────────────────────────────────────

    dispose() {
        this.cancelDrag();
        this.clearHover();
        this.operationSegment?.dispose();
        this.operationSegment = null;
        this.canvas?.removeEventListener('pointerleave', this.boundPointerLeave);
        this.canvas?.removeEventListener('pointerdown', this.boundPointerDown, true);
        document.removeEventListener('pointermove', this.boundPointerMove, true);
        document.removeEventListener('pointerup', this.boundPointerUp, true);
        document.removeEventListener('pointercancel', this.boundPointerUp, true);
        if (this.bodyClass) document.body.classList.remove(this.bodyClass);
        this.parent?.setBuildCursor(null);
        super.dispose();
    }
}
