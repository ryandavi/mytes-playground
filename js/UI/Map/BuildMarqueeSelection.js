class BuildMarqueeSelection extends UIComponent {
    constructor(parent) {
        super(parent);
        this.drag = null;
        this.selectedWallCells = [];
        this.marquee = null;
        this.wallHighlights = [];
        this.boundDown = this.onPointerDown.bind(this);
        this.boundMove = this.onPointerMove.bind(this);
        this.boundUp = this.onPointerUp.bind(this);
        this.boundClick = this.onClick.bind(this);
        this.swallowClick = false;
    }

    init() {
        this.container?.canvas?.addEventListener('pointerdown', this.boundDown, true);
        document.addEventListener('pointermove', this.boundMove, true);
        document.addEventListener('pointerup', this.boundUp, true);
        document.addEventListener('pointercancel', this.boundUp, true);
        this.container?.canvas?.addEventListener('click', this.boundClick, true);
    }

    isActive() {
        return this.container?.gameMode?.isBuild() === true &&
            this.parent?.isTool?.(UIToolModes.BUILD_SELECT);
    }

    onPointerDown(event) {
        if (!this.isActive() || event.button !== 0 || event.target?.closest?.(InputComponent.UI_SELECTOR)) return;
        this.clearVisuals();
        this.drag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, endX: event.clientX, endY: event.clientY };
        this.marquee = document.createElement('div');
        this.marquee.className = 'build-selection-marquee';
        document.body.appendChild(this.marquee);
        this.renderMarquee();
        event.preventDefault();
        event.stopPropagation();
    }

    onPointerMove(event) {
        if (!this.drag || event.pointerId !== this.drag.pointerId) return;
        this.drag.endX = event.clientX;
        this.drag.endY = event.clientY;
        this.renderMarquee();
        event.preventDefault();
    }

    onPointerUp(event) {
        if (!this.drag || event.pointerId !== this.drag.pointerId) return;
        this.drag.endX = event.clientX;
        this.drag.endY = event.clientY;
        const rect = this.dragRect();
        this.drag = null;
        this.marquee?.remove();
        this.marquee = null;
        this.selectWithin(rect);
        this.swallowClick = true;
        event.preventDefault();
        event.stopPropagation();
    }

    onClick(event) {
        if (!this.swallowClick) return;
        this.swallowClick = false;
        event.preventDefault();
        event.stopPropagation();
    }

    dragRect() {
        const { startX, startY, endX, endY } = this.drag;
        const left = Math.min(startX, endX);
        const top = Math.min(startY, endY);
        return { left, top, right: Math.max(startX, endX), bottom: Math.max(startY, endY), width: Math.abs(endX - startX), height: Math.abs(endY - startY) };
    }

    renderMarquee() {
        const rect = this.dragRect();
        Object.assign(this.marquee.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
    }

    intersects(a, b) {
        return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
    }

    selectWithin(rect) {
        const objects = (this.container?.gameMap?.objects || []).filter(object =>
            object.active !== false && object.element && this.intersects(rect, object.element.getBoundingClientRect())
        );
        this.parent.selectionManager.setSelection(objects);
        this.selectedWallCells = this.wallCellsWithin(rect);
        this.renderWallHighlights();
        this.parent.actionSidebarManager?.updateActions?.(objects.length === 1 && this.selectedWallCells.length === 0 ? objects[0] : null);
    }

    wallCellsWithin(rect) {
        const builder = this.container?.gameMap?.wallBuilder;
        const input = this.container?.inputHandler;
        if (!builder || !input) return [];
        const from = input.screenToWorldCoordinates(rect.left, rect.top);
        const to = input.screenToWorldCoordinates(rect.right, rect.bottom);
        return [...builder.baseCells.values()].filter(cell => {
            const left = cell.x * builder.cellSize;
            const top = cell.y * builder.cellSize;
            return left < to.x && left + builder.cellSize > from.x && top < to.y && top + builder.cellSize > from.y;
        }).map(cell => ({ x: cell.x, y: cell.y }));
    }

    renderWallHighlights() {
        this.wallHighlights.forEach(element => element.remove());
        this.wallHighlights = [];
        const input = this.container?.inputHandler;
        const builder = this.container?.gameMap?.wallBuilder;
        if (!input || !builder) return;
        for (const cell of this.selectedWallCells) {
            const start = input.worldToScreenCoordinates(cell.x * builder.cellSize, cell.y * builder.cellSize);
            const end = input.worldToScreenCoordinates((cell.x + 1) * builder.cellSize, (cell.y + 1) * builder.cellSize);
            const element = document.createElement('div');
            element.className = 'build-selection-cell';
            Object.assign(element.style, { left: `${start.x}px`, top: `${start.y}px`, width: `${end.x - start.x}px`, height: `${end.y - start.y}px` });
            document.body.appendChild(element);
            this.wallHighlights.push(element);
        }
    }

    getSelectedWallCells() {
        return [...this.selectedWallCells];
    }

    storeSelection() {
        const inventory = this.container?.inventory;
        const objects = this.parent.selectionManager.getSelectedObjects();
        const wallCells = [...this.selectedWallCells];
        const unstored = objects.filter(object => inventory?.storeMapObject?.(object) !== true);
        const builder = this.container?.gameMap?.wallBuilder;
        let wallResult = null;
        if (builder && wallCells.length) {
            wallResult = builder.applyWallCellChanges(wallCells.map(cell => ({ ...cell, data: null })));
        }
        this.parent.selectionManager.setSelection(unstored);
        this.selectedWallCells = [];
        this.clearVisuals();
        if (unstored.length) this.parent.showMessage?.(`${unstored.length} object${unstored.length === 1 ? '' : 's'} could not be returned to inventory.`, 'warning', 'Selection');
        if (wallResult?.rejected?.length) {
            this.parent.showMessage?.(`${wallResult.rejected.length} protected wall cell${wallResult.rejected.length === 1 ? '' : 's'} could not be removed.`, 'warning', 'Selection');
        }
        if (wallResult?.applied?.length) {
            const forward = Utility.deepClone(wallResult.applied);
            const backward = Utility.deepClone(wallResult.inverse);
            this.container.buildHistory?.push({
                label: `Remove Wall (${forward.length} cells)`,
                undo: () => builder.applyWallCellChanges(Utility.deepClone(backward), { validate: false }),
                redo: () => builder.applyWallCellChanges(Utility.deepClone(forward), { validate: false })
            });
        }
    }

    clearVisuals() {
        this.marquee?.remove();
        this.marquee = null;
        this.wallHighlights.forEach(element => element.remove());
        this.wallHighlights = [];
    }

    clearSelection() {
        this.selectedWallCells = [];
        this.clearVisuals();
    }

    cancelDrag() {
        if (!this.drag) return false;
        this.drag = null;
        this.marquee?.remove();
        this.marquee = null;
        this.swallowClick = false;
        return true;
    }

    dispose() {
        this.container?.canvas?.removeEventListener('pointerdown', this.boundDown, true);
        document.removeEventListener('pointermove', this.boundMove, true);
        document.removeEventListener('pointerup', this.boundUp, true);
        document.removeEventListener('pointercancel', this.boundUp, true);
        this.container?.canvas?.removeEventListener('click', this.boundClick, true);
        this.clearVisuals();
        super.dispose();
    }
}
