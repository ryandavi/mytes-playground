class WallBuildPanel extends ModalWindow {
    constructor(parent) {
        super(parent, {
            id: 'wall-build-panel',
            buttonId: 'build-toggle',
            closeOnOutsideClick: false,
            position: 'top-right',
            draggable: true,
            closeButtonSelector: '.modal-close-btn'
        });
        this.drag = null;
        this.ghostElements = [];
        this.boundPointerDown = this.handlePointerDown.bind(this);
        this.boundPointerMove = this.handlePointerMove.bind(this);
        this.boundPointerUp = this.handlePointerUp.bind(this);
        this.init();
        this.parent?.parent?.canvas?.addEventListener('pointerdown', this.boundPointerDown, true);
        document.addEventListener('pointermove', this.boundPointerMove, true);
        document.addEventListener('pointerup', this.boundPointerUp, true);
        document.addEventListener('pointercancel', this.boundPointerUp, true);
    }

    get gameMap() {
        return this.parent?.parent?.gameMap || null;
    }

    buttonLeftClick(event) {
        event.preventDefault();
        event.stopPropagation();
        if (this.parent.isTool(UIToolModes.BUILD)) {
            this.parent.changeToolMode(UIToolModes.SELECT);
        } else {
            this.parent.toolManager.setToolMode(UIToolModes.BUILD);
        }
        return false;
    }

    handleToolModeChanged(mode) {
        const active = mode === UIToolModes.BUILD;
        document.body.classList.toggle('wall-build-mode', active);
        this.buttonElement?.classList.toggle('active', active);
        if (active) {
            this.open();
        } else {
            this.cancelDrag();
            super.close();
        }
    }

    close() {
        if (this.parent.isTool(UIToolModes.BUILD)) {
            this.parent.changeToolMode(UIToolModes.SELECT);
            return;
        }
        super.close();
    }

    handleKeyDown(event) {
        if (event.key !== 'Escape' || !this.parent.isTool(UIToolModes.BUILD)) return;
        event.preventDefault();
        this.parent.changeToolMode(UIToolModes.SELECT);
    }

    getOperation() {
        return this.modalElement?.querySelector('input[name="wall-build-operation"]:checked')?.value || 'add';
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
            rectangle: event.shiftKey === true
        };
        this.renderGhosts(this.getDragCells());
    }

    handlePointerMove(event) {
        if (!this.drag || event.pointerId !== this.drag.pointerId) return;
        const cell = this.pointerToCell(event);
        if (!cell) return;
        event.preventDefault();
        event.stopPropagation();
        this.drag.end = cell;
        this.drag.rectangle = event.shiftKey === true;
        this.renderGhosts(this.getDragCells());
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

    renderGhosts(cells) {
        this.clearGhosts();
        const map = this.drag?.map;
        const layer = map?.layers?.objects;
        const cellSize = map?.gridSystem?.config?.cellSize;
        if (!layer || !cellSize) return;
        const removing = this.getOperation() === 'remove';
        for (const cell of cells) {
            const ghost = document.createElement('div');
            ghost.className = `wall-build-ghost-cell${removing ? ' is-remove' : ''}`;
            ghost.style.left = `${cell.x * cellSize}px`;
            ghost.style.top = `${cell.y * cellSize}px`;
            ghost.style.width = `${cellSize}px`;
            ghost.style.height = `${cellSize}px`;
            layer.appendChild(ghost);
            this.ghostElements.push(ghost);
        }
    }

    commitCells(map, cells, operation = this.getOperation()) {
        const builder = map?.wallBuilder;
        if (!builder || cells.length === 0) return false;
        const changes = cells
            .filter(cell => operation === 'remove'
                ? builder.baseCells.has(`${cell.x},${cell.y}`)
                : !builder.baseCells.has(`${cell.x},${cell.y}`))
            .map(cell => ({ ...cell, data: operation === 'remove' ? null : {} }));
        if (changes.length === 0) return false;
        try {
            builder.applyWallCellChanges(changes);
            map.container?.worldState?.captureMap?.(map);
            map.core?.user?._scheduleSave?.();
            return true;
        } catch (error) {
            if (/node|budget|generated/i.test(error?.message || '')) {
                this.parent.showMessage("This map can't hold more walls.", 'warning', 'Wall limit reached');
                return false;
            }
            throw error;
        }
    }

    clearGhosts() {
        for (const element of this.ghostElements) element.remove();
        this.ghostElements = [];
    }

    cancelDrag() {
        this.clearGhosts();
        this.drag = null;
    }

    dispose() {
        this.cancelDrag();
        this.parent?.parent?.canvas?.removeEventListener('pointerdown', this.boundPointerDown, true);
        document.removeEventListener('pointermove', this.boundPointerMove, true);
        document.removeEventListener('pointerup', this.boundPointerUp, true);
        document.removeEventListener('pointercancel', this.boundPointerUp, true);
        document.body.classList.remove('wall-build-mode');
        super.dispose();
    }
}
