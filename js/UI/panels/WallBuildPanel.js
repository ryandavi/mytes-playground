class WallBuildPanel extends ModalWindow {
    constructor(parent) {
        super(parent, {
            id: 'wall-build-panel',
            closeOnOutsideClick: false,
            position: 'top-right',
            draggable: true,
            closeButtonSelector: '.modal-close-btn'
        });
        this.drag = null;
        this.hoverCell = null;
        this.lastTickAt = 0;
        this.ghostElements = [];
        this.measureLabel = null;
        this.boundPointerDown = this.handlePointerDown.bind(this);
        this.boundPointerMove = this.handlePointerMove.bind(this);
        this.boundPointerUp = this.handlePointerUp.bind(this);
        this.boundPointerLeave = this.clearHover.bind(this);
        this.init();
        this.wallView = new WallViewControl(this, this.modalElement?.querySelector('.wall-view-controls'));
        this.operationSegment = new SegmentControl(
            this.modalElement?.querySelector('.wall-build-operation-segment') || null,
            { value: 'add', onChange: () => this.renderHoverGhost() }
        );
        this.gridToggle = new BuildGridToggle(this, this.modalElement);
        this.snapToggle = new BuildSnapToggle(this, this.modalElement);
        this.rectangleToggle = this.modalElement?.querySelector('#wall-build-rectangle') || null;
        this.parent?.parent?.canvas?.addEventListener('pointerdown', this.boundPointerDown, true);
        this.parent?.parent?.canvas?.addEventListener('pointerleave', this.boundPointerLeave);
        document.addEventListener('pointermove', this.boundPointerMove, true);
        document.addEventListener('pointerup', this.boundPointerUp, true);
        document.addEventListener('pointercancel', this.boundPointerUp, true);
    }

    get gameMap() {
        return this.parent?.parent?.gameMap || null;
    }

    get rules() {
        return this.parent?.parent?.buildRules || null;
    }

    handleToolModeChanged(mode) {
        const active = mode === UIToolModes.WALL;
        document.body.classList.toggle('wall-build-mode', active);
        if (active) {
            this.wallView.sync();
            this.gridToggle.sync();
            this.snapToggle.sync();
            this.open();
        } else {
            this.cancelDrag();
            this.clearHover();
            super.close();
        }
    }

    // Closing the window is putting the tool down, so it hands back to
    // whatever the current mode's default tool is — which is Select once build
    // mode has already been left.
    close() {
        if (this.parent.isTool(UIToolModes.WALL) &&
            this.parent.changeToolMode(this.parent.toolManager.getDefaultToolFor())) {
            return;
        }
        super.close();
    }

    // Escape is layered by ContainerInputManager (cancel drag → close panel →
    // leave build mode); the window's own handler would fire first and skip
    // straight past the drag.
    handleKeyDown() {}

    getOperation() {
        return this.operationSegment?.value || 'add';
    }

    /**
     * The operation this gesture is actually performing. Ctrl held inverts the
     * panel's tool for the length of the drag without touching the radio — the
     * Sims' knock-a-wall-down modifier — so the common "lay a run, fix one
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

    handlePointerDown(event) {
        if (!this.parent.isTool(UIToolModes.WALL) || event.button !== 0) return;
        const cell = this.pointerToCell(event);
        if (!cell || !this.gameMap?.wallBuilder) return;
        event.preventDefault();
        event.stopPropagation();
        this.drag = {
            pointerId: event.pointerId,
            map: this.gameMap,
            start: cell,
            end: cell,
            rectangle: this.isRectangleMode(event),
            operation: this.resolveOperation(event),
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
        this.drag.rectangle = this.isRectangleMode(event);
        this.drag.operation = this.resolveOperation(event);
        this.renderGhosts(this.getDragCells(), event);
    }

    /**
     * A single ghost cell under the cursor before any drag starts, in the
     * colour of what a click would do and struck through when it would be
     * refused. This is the answer to "can I build here?" — a cursor swap alone
     * cannot say *which* cell it means on a grid this size.
     */
    renderHoverGhost(event = null) {
        if (event) this.hoverEvent = event;
        const source = event || this.hoverEvent;
        if (!this.parent.isTool(UIToolModes.WALL) || !source) return;
        if (!this.parent.parent?.canvas?.contains(source.target)) {
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
        this.renderGhosts([cell], null, operation);
        document.body.classList.toggle(
            'wall-build-refused',
            !this.checkCell(cell, operation).allowed
        );
    }

    clearHover() {
        if (this.drag) return;
        this.hoverCell = null;
        this.hoverOperation = null;
        this.hoverEvent = null;
        this.clearGhosts();
        document.body.classList.remove('wall-build-refused');
    }

    handlePointerUp(event) {
        if (!this.drag || event.pointerId !== this.drag.pointerId) return;
        event.preventDefault();
        event.stopPropagation();
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

    // Pre-flight of the same rules applyWallCellChanges enforces, so a blocked
    // cell reads red under the cursor instead of silently vanishing on commit.
    checkCell(cell, operation = this.getOperation()) {
        const rules = this.rules;
        if (!rules) return BuildRules.ALLOWED;
        return operation === 'remove'
            ? rules.canRemoveWallCell(cell.x, cell.y)
            : rules.canBuildWallCell(cell.x, cell.y);
    }

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
            // Allowed is not the same as "would do something": adding over a
            // cell that already has a wall is permitted and changes nothing, so
            // counting it knocked for a wall that was already standing there.
            const changes = allowed && this.cellWouldChange(map, cell, removing);
            if (changes) effective += 1;
            const ghost = document.createElement('div');
            ghost.className = `wall-build-ghost-cell${removing ? ' is-remove' : ''}` +
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

    // The same test commitCells applies, so the preview, the count and the
    // sound all agree with what the commit will actually do.
    cellWouldChange(map, cell, removing) {
        const occupied = map?.wallBuilder?.baseCells.has(`${cell.x},${cell.y}`) === true;
        return removing ? occupied : !occupied;
    }

    /**
     * One knock the moment each cell joins the run, not a burst when the drag
     * ends — the wall should sound like it is going up under your hand. Pitch
     * climbs a step per cell and wraps every `cycle`, so a long wall keeps its
     * rhythm instead of sliding out of the register; removal runs the ladder
     * down. Dragging back over cells you already crossed re-arms them without
     * re-sounding, so only growth is audible.
     */
    tickRunSound(count, removing) {
        if (!this.drag || count === this.drag.soundedCells) return;
        const grew = count > this.drag.soundedCells;
        this.drag.soundedCells = count;
        if (!grew || count <= 0) return;

        const run = SiteConfig.buildMode.sounds.run;
        // Wall-clock: this paces audio against the player's hand, not the sim.
        const now = performance.now();
        if (now - this.lastTickAt < run.minIntervalMs) return;
        this.lastTickAt = now;

        const position = (count - 1) % run.cycle;
        this.playSound(run.sound, {
            pitchScale: run.basePitch *
                Math.pow(run.pitchStep, removing ? run.cycle - 1 - position : position),
            volume: run.volume
        });
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

    commitCells(map, cells, operation = this.getOperation()) {
        const builder = map?.wallBuilder;
        if (!builder || cells.length === 0) return false;
        const removing = operation === 'remove';
        const changes = cells
            .filter(cell => removing
                ? builder.baseCells.has(`${cell.x},${cell.y}`)
                : !builder.baseCells.has(`${cell.x},${cell.y}`))
            .map(cell => ({ ...cell, data: removing ? null : {} }));
        if (changes.length === 0) return false;

        let result;
        try {
            result = builder.applyWallCellChanges(changes);
        } catch (error) {
            if (/node|budget|generated/i.test(error?.message || '')) {
                this.parent.showMessage("This map can't hold more walls.", 'warning', 'Wall limit reached');
                return false;
            }
            throw error;
        }
        if (!result) return false;

        this.reportRejections(result.rejected);
        if (result.applied.length === 0) {
            this.playSound(SiteConfig.buildMode.sounds.rejected);
            return false;
        }

        this.pushHistory(builder, result, removing);
        map.container?.worldState?.captureMap?.(map);
        map.core?.user?._scheduleSave?.();
        return true;
    }

    pushHistory(builder, result, removing) {
        const label = `${removing ? 'Remove' : 'Place'} Wall (${result.applied.length} cell${result.applied.length === 1 ? '' : 's'})`;
        const forward = Utility.deepClone(result.applied);
        const backward = Utility.deepClone(result.inverse);
        // Undo replays through the same authoritative path, but with validation
        // off: restoring a cell the player already had is by definition legal,
        // and re-running the rules would refuse it whenever the world moved.
        this.parent.parent?.buildHistory?.push({
            label,
            undo: () => builder.applyWallCellChanges(Utility.deepClone(backward), { validate: false }),
            redo: () => builder.applyWallCellChanges(Utility.deepClone(forward), { validate: false })
        });
    }

    reportRejections(rejected = []) {
        if (rejected.length === 0) return;
        const reason = rejected[0].reason || 'Some cells are blocked.';
        this.parent.showMessage(
            rejected.length === 1 ? reason : `${rejected.length} cells blocked — ${reason}`,
            'warning',
            'Build'
        );
    }

    playSound(soundId, options = {}) {
        if (soundId) this.parent.parent?.core?.soundManager?.playWhenReady?.(soundId, options);
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

    dispose() {
        this.cancelDrag();
        this.clearHover();
        this.wallView?.dispose();
        this.wallView = null;
        this.operationSegment?.dispose();
        this.operationSegment = null;
        this.gridToggle?.dispose();
        this.gridToggle = null;
        this.snapToggle?.dispose();
        this.snapToggle = null;
        this.parent?.parent?.canvas?.removeEventListener('pointerleave', this.boundPointerLeave);
        this.parent?.parent?.canvas?.removeEventListener('pointerdown', this.boundPointerDown, true);
        document.removeEventListener('pointermove', this.boundPointerMove, true);
        document.removeEventListener('pointerup', this.boundPointerUp, true);
        document.removeEventListener('pointercancel', this.boundPointerUp, true);
        document.body.classList.remove('wall-build-mode', 'wall-build-refused');
        super.dispose();
    }
}
