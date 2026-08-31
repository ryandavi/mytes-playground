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
        this.emptyPress = null;
        this.armTimer = null;
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
            this.parent?.isTool?.(UIToolModes.MOVE);
    }

    onPointerDown(event) {
        if (!this.isActive() || event.button !== 0 || event.target?.closest?.(InputComponent.UI_SELECTOR)) return;
        if (this.container?.camera?._spacePanActive) return;
        if (event.target?.closest?.('.map-object, .myte-slot, .world-myte, .interactive-myte')) return;
        if (event.pointerType !== 'touch' && event.shiftKey !== true) {
            this.emptyPress = {
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY
            };
            return;
        }
        this.clearVisuals();
        this.drag = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            endX: event.clientX,
            endY: event.clientY,
            additive: event.shiftKey === true,
            pending: event.pointerType === 'touch'
        };
        if (this.drag.pending) {
            this.armTimer = window.setTimeout(
                () => this.armTouchMarquee(),
                SiteConfig.interaction.gestures.longPressDelay
            );
            return;
        }
        this.createMarquee();
        event.preventDefault();
        event.stopPropagation();
    }

    createMarquee() {
        this.marquee = document.createElement('div');
        this.marquee.className = 'build-selection-marquee';
        document.body.appendChild(this.marquee);
        this.renderMarquee();
    }

    armTouchMarquee() {
        if (!this.drag?.pending) return;
        this.drag.pending = false;
        this.armTimer = null;
        this.container?.camera?.cancelTouchPanForSelection?.();
        this.createMarquee();
    }

    onPointerMove(event) {
        if (this.emptyPress?.pointerId === event.pointerId) {
            const distance = Math.hypot(
                event.clientX - this.emptyPress.startX,
                event.clientY - this.emptyPress.startY
            );
            if (distance > SiteConfig.interaction.gestures.clickMoveThreshold) this.emptyPress = null;
        }
        if (!this.drag || event.pointerId !== this.drag.pointerId) return;
        if (this.drag.pending) {
            const distance = Math.hypot(event.clientX - this.drag.startX, event.clientY - this.drag.startY);
            if (distance > SiteConfig.interaction.gestures.clickMoveThreshold) this.cancelDrag();
            return;
        }
        this.drag.endX = event.clientX;
        this.drag.endY = event.clientY;
        this.renderMarquee();
        event.preventDefault();
    }

    onPointerUp(event) {
        if (this.emptyPress?.pointerId === event.pointerId) {
            this.emptyPress = null;
            this.parent.selectionManager.setSelection([]);
            this.clearSelection();
        }
        if (!this.drag || event.pointerId !== this.drag.pointerId) return;
        if (this.drag.pending) {
            this.cancelDrag();
            this.parent.selectionManager.setSelection([]);
            this.clearSelection();
            return;
        }
        this.drag.endX = event.clientX;
        this.drag.endY = event.clientY;
        const rect = this.dragRect();
        const additive = this.drag.additive === true;
        this.drag = null;
        this.marquee?.remove();
        this.marquee = null;
        this.selectWithin(rect, additive);
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

    selectWithin(rect, additive = false) {
        const objects = (this.container?.gameMap?.objects || []).filter(object =>
            object.active !== false && object.element && this.intersects(rect, object.element.getBoundingClientRect())
        );
        const selectedObjects = additive
            ? [...this.parent.selectionManager.getSelectedObjects(), ...objects]
            : objects;
        this.parent.selectionManager.setSelection(selectedObjects);
        const wallCells = this.wallCellsWithin(rect);
        this.selectedWallCells = additive
            ? this.mergeWallCells(this.selectedWallCells, wallCells)
            : wallCells;
        this.renderWallHighlights();
        this.parent.actionSidebarManager?.updateActions?.(
            selectedObjects.length === 1 && this.selectedWallCells.length === 0 ? selectedObjects[0] : null
        );
    }

    mergeWallCells(current, added) {
        const byKey = new Map([...current, ...added].map(cell => [`${cell.x},${cell.y}`, cell]));
        return [...byKey.values()];
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
        if (!this.drag && !this.emptyPress) return false;
        window.clearTimeout(this.armTimer);
        this.armTimer = null;
        this.drag = null;
        this.emptyPress = null;
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
        window.clearTimeout(this.armTimer);
        super.dispose();
    }
}
