/**
 * withFencePostPlacement — placement behaviour for a thing that drops into a
 * fence line: a gate.
 *
 * The counterpart to the wall-opening mixin. A gate snaps to the fence grid,
 * may land on a cell that already holds a fence (that fence is the thing it
 * replaces), and on release hands off to FenceBuilder.settlePost to pull the
 * replaced fence into the inventory and re-point the neighbours.
 *
 * Undo of the drag itself is the ordinary map-object move command; the fence it
 * displaced is restored by settlePost's own history entry sitting under it.
 */
const withFencePostPlacement = BaseClass => class extends BaseClass {
    get fenceBuilder() {
        return this.gameMap?.fenceBuilder || null;
    }

    _fenceCell(x = this.posX, y = this.posY) {
        return this.fenceBuilder?.cellForObject(this, x, y) || null;
    }

    clampPlacementPosition(x, y) {
        const builder = this.fenceBuilder;
        if (!builder) return { x, y };
        const cell = builder.cellForObject(this, x, y);
        return builder.worldPosForObject(this, cell.x, cell.y);
    }

    getGridOccupancyBounds(x = this.posX, y = this.posY) {
        const builder = this.fenceBuilder;
        if (!builder) {
            return super.getGridOccupancyBounds?.(x, y) ?? null;
        }
        const cs = builder.cellSize;
        const cell = builder.cellForObject(this, x, y);
        return { x: cell.x * cs, y: cell.y * cs, width: cs, height: cs };
    }

    checkDropValidity(x, y) {
        const builder = this.fenceBuilder;
        if (!builder) return super.checkDropValidity ? super.checkDropValidity(x, y) : true;
        const cell = builder.cellForObject(this, x, y);
        return builder.canHostPost(cell.x, cell.y, this) === true;
    }

    restoreInvalidDropToOrigin() {
        return true;
    }

    // Also the inventory placement path: Inventory.placeInventoryItem creates
    // the object and then trusts onPlacementDragEnd's verdict, without a
    // clampPlacementPosition or checkDropValidity call of its own.
    onPlacementDragEnd() {
        const builder = this.fenceBuilder;
        if (!builder) return super.onPlacementDragEnd ? super.onPlacementDragEnd() : true;

        const snapped = this.clampPlacementPosition(this.posX, this.posY);
        this.posX = snapped.x;
        this.posY = snapped.y;
        this.updatePosition?.();

        const cell = builder.cellForObject(this);
        if (!builder.canHostPost(cell.x, cell.y, this)) return false;
        builder.settlePost(this, cell);
        return true;
    }

    // Whatever route it leaves by, the fences it was connecting need to redraw.
    remove() {
        this._notifyFenceNeighbors?.();
        super.remove();
    }
};
