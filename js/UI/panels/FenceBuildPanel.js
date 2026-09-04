/**
 * FenceBuildPanel — the Fence tool. The same drag-a-run gesture as the Wall
 * tool (see CellDragBuildPanel) but it lays FenceMapObjects onto the map a cell
 * at a time through FenceBuilder rather than editing wall tiles.
 *
 * On top of the shared machinery it carries a style picker: the FENCE variants
 * as a segment, plus Alt-click to sample the fence already under the cursor.
 * Removed pieces go back to the inventory.
 */
class FenceBuildPanel extends CellDragBuildPanel {
    constructor(parent) {
        super(parent, {
            id: 'fence-build-panel',
            toolMode: UIToolModes.FENCE,
            bodyClass: 'fence-build-mode',
            operationSegmentSelector: '.fence-build-operation-segment',
            rectangleToggleSelector: '#fence-build-rectangle'
        });
        this.variantSegment = new SegmentControl(
            this.modalElement?.querySelector('.fence-build-variant-segment') || null,
            { value: FenceBuilder.DEFAULT_VARIANT }
        );
        this.gateGroup = this.modalElement?.querySelector('.fence-build-gates') || null;
        this.gatePalette = this.modalElement?.querySelector('.fence-gate-palette') || null;
        this.modalElement?.querySelectorAll('[data-structure-tool]').forEach(button =>
            button.addEventListener('click', () => this.parent.changeToolMode(
                button.dataset.structureTool === 'fence' ? UIToolModes.FENCE : UIToolModes.WALL
            ))
        );
    }

    get variant() {
        return this.variantSegment?.value || FenceBuilder.DEFAULT_VARIANT;
    }

    getBuilder() {
        return this.gameMap?.fenceBuilder || null;
    }

    handleToolModeChanged(mode) {
        super.handleToolModeChanged(mode);
        if (mode === this.toolMode) this.renderOwnedGates();
    }

    renderOwnedGates() {
        if (!this.gateGroup || !this.gatePalette) return;
        const inventory = this.build?.inventory;
        const gates = (inventory?.items ?? []).filter(item =>
            ItemRegistry.getItemSync(item.variant || item.name)?.world?.objectType === FenceBuilder.GATE_TYPE);
        this.gateGroup.hidden = gates.length === 0;
        this.gatePalette.replaceChildren(...gates.map(item => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'panel-action fence-gate-choice';
            button.textContent = `${item.name} ×${item.quantity}`;
            button.title = 'Place this gate into a fence';
            button.addEventListener('click', () => inventory.activateItemElement(item.element));
            return button;
        }));
    }

    // Alt-click samples the fence under the cursor rather than starting a drag —
    // the same "pick" the Ground and Surface tools carry.
    tryBeginSpecialGesture(cell, event) {
        if (event.altKey !== true) return false;
        const fence = this.getBuilder()?.fenceAt(cell.x, cell.y);
        if (fence?.variant && this.variantSegment?.select(fence.variant)) {
            this.parent.showMessage(`Matched ${fence.name || 'fence'}.`, 'info', 'Fence');
        }
        return true;
    }

    checkCell(cell, operation = this.getOperation()) {
        const builder = this.getBuilder();
        if (!builder) return BuildRules.deny('This map has no fence system.');
        return builder.checkCell(cell, operation === 'remove' ? 'remove' : 'add');
    }

    cellWouldChange(map, cell, removing) {
        const has = !!map?.fenceBuilder?.fenceAt(cell.x, cell.y);
        return removing ? has : !has;
    }

    commitCells(map, cells, operation = this.getOperation()) {
        const builder = map?.fenceBuilder;
        if (!builder) {
            this.parent.showMessage("This map has no fence system.", 'warning', 'Fence');
            return false;
        }
        const removing = operation === 'remove';

        const targets = [];
        const rejected = [];
        for (const cell of cells) {
            const verdict = builder.checkCell(cell, removing ? 'remove' : 'add');
            if (!verdict.allowed) {
                rejected.push({ reason: verdict.reason });
                continue;
            }
            if (this.cellWouldChange(map, cell, removing)) targets.push(cell);
        }
        this.reportRejections(rejected, 'Fence');
        if (targets.length === 0) {
            if (rejected.length) this.playSound(SiteConfig.buildMode.sounds.rejected);
            return false;
        }

        return removing
            ? this.commitRemoval(map, builder, targets)
            : this.commitPlacement(map, builder, targets);
    }

    commitPlacement(map, builder, targets) {
        const variant = this.variant;
        const { placed, rejected } = builder.placeCells(targets.map(cell => ({ ...cell, variant })));
        this.reportRejections(rejected, 'Fence');
        if (placed.length === 0) {
            this.playSound(SiteConfig.buildMode.sounds.rejected);
            return false;
        }

        const entries = placed.map(({ x, y, variant: v }) => ({ x, y, variant: v }));
        const coords = placed.map(({ x, y }) => ({ x, y }));
        this.pushHistory({
            label: `Place Fence (${placed.length} piece${placed.length === 1 ? '' : 's'})`,
            undo: () => builder.removeCells(coords, { toInventory: false }),
            redo: () => builder.placeCells(entries)
        });
        this.playSound(SiteConfig.buildMode.sounds.objectPlace);
        this.afterCommit(map);
        return true;
    }

    commitRemoval(map, builder, targets) {
        const { removed, rejected } = builder.removeCells(
            targets.map(({ x, y }) => ({ x, y })),
            { toInventory: true }
        );
        this.reportRejections(rejected, 'Fence');
        if (removed.length === 0) {
            this.playSound(SiteConfig.buildMode.sounds.rejected);
            return false;
        }

        const entries = removed.map(({ x, y, variant }) => ({ x, y, variant }));
        const coords = removed.map(({ x, y }) => ({ x, y }));
        this.pushHistory({
            label: `Remove Fence (${removed.length} piece${removed.length === 1 ? '' : 's'})`,
            // The pieces went to the inventory; undo takes them back out as it
            // rebuilds them so the count does not drift.
            undo: () => {
                builder.placeCells(entries);
                for (const { variant } of entries) this.build?.inventory?.removeItem?.(variant);
            },
            redo: () => builder.removeCells(coords, { toInventory: true })
        });
        this.playSound(SiteConfig.buildMode.sounds.objectPlace);
        this.afterCommit(map);
        return true;
    }

    dispose() {
        this.variantSegment?.dispose();
        this.variantSegment = null;
        super.dispose();
    }
}
