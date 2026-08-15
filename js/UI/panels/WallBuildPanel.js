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
        this.ghostElements = [];
        this.measureLabel = null;
        this.boundPointerDown = this.handlePointerDown.bind(this);
        this.boundPointerMove = this.handlePointerMove.bind(this);
        this.boundPointerUp = this.handlePointerUp.bind(this);
        this.init();
        this.wallView = new WallViewControl(this, this.modalElement?.querySelector('.wall-view-controls'));
        this.rectangleToggle = this.modalElement?.querySelector('#wall-build-rectangle') || null;
        this.parent?.parent?.canvas?.addEventListener('pointerdown', this.boundPointerDown, true);
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
        const active = mode === UIToolModes.BUILD;
        document.body.classList.toggle('wall-build-mode', active);
        if (active) {
            this.wallView.sync();
            this.open();
        } else {
            this.cancelDrag();
            super.close();
        }
    }

    // Closing the window is putting the tool down, so it hands back to
    // whatever the current mode's default tool is — which is Select once build
    // mode has already been left.
    close() {
        if (this.parent.isTool(UIToolModes.BUILD) &&
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
        return this.modalElement?.querySelector('input[name="wall-build-operation"]:checked')?.value || 'add';
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
        if (!this.parent.isTool(UIToolModes.BUILD) || event.button !== 0) return;
        const cell = this.pointerToCell(event);
        if (!cell || !this.gameMap?.wallBuilder) return;
        event.preventDefault();
        event.stopPropagation();
        this.drag = {
            pointerId: event.pointerId,
            map: this.gameMap,
            start: cell,
            end: cell,
            rectangle: this.isRectangleMode(event)
        };
        this.renderGhosts(this.getDragCells(), event);
    }

    handlePointerMove(event) {
        if (!this.drag || event.pointerId !== this.drag.pointerId) return;
        const cell = this.pointerToCell(event);
        if (!cell) return;
        event.preventDefault();
        event.stopPropagation();
        this.drag.end = cell;
        this.drag.rectangle = this.isRectangleMode(event);
        this.renderGhosts(this.getDragCells(), event);
    }

    handlePointerUp(event) {
        if (!this.drag || event.pointerId !== this.drag.pointerId) return;
        event.preventDefault();
        event.stopPropagation();
        const cells = this.getDragCells();
        const map = this.drag.map;
        const operation = this.getOperation();
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

    renderGhosts(cells, event = null) {
        this.clearGhosts();
        const map = this.drag?.map;
        const layer = map?.layers?.objects;
        const cellSize = map?.gridSystem?.config?.cellSize;
        if (!layer || !cellSize) return;
        const operation = this.getOperation();
        const removing = operation === 'remove';
        let blocked = 0;
        for (const cell of cells) {
            const allowed = this.checkCell(cell, operation).allowed;
            if (!allowed) blocked += 1;
            const ghost = document.createElement('div');
            ghost.className = `wall-build-ghost-cell${removing ? ' is-remove' : ''}${allowed ? '' : ' is-invalid'}`;
            ghost.style.left = `${cell.x * cellSize}px`;
            ghost.style.top = `${cell.y * cellSize}px`;
            ghost.style.width = `${cellSize}px`;
            ghost.style.height = `${cellSize}px`;
            layer.appendChild(ghost);
            this.ghostElements.push(ghost);
        }
        this.renderMeasurement(cells.length - blocked, event);
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
        this.playSound(removing ? SiteConfig.buildMode.sounds.wallRemove : SiteConfig.buildMode.sounds.wallPlace);
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

    playSound(soundId) {
        if (soundId) this.parent.parent?.core?.soundManager?.playWhenReady?.(soundId);
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
        this.wallView?.dispose();
        this.wallView = null;
        this.parent?.parent?.canvas?.removeEventListener('pointerdown', this.boundPointerDown, true);
        document.removeEventListener('pointermove', this.boundPointerMove, true);
        document.removeEventListener('pointerup', this.boundPointerUp, true);
        document.removeEventListener('pointercancel', this.boundPointerUp, true);
        document.body.classList.remove('wall-build-mode');
        super.dispose();
    }
}
