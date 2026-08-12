/**
 * Placement behaviour for objects that hang on a wall's face — paintings and
 * anything else mounted flat against a wall rather than cut through it.
 *
 * The counterpart to `withWallOpeningPlacement`: an opening occupies wall cells
 * and interrupts the wall, a fixture occupies none and merely rides on it. So
 * where an opening snaps to a cell footprint, a fixture snaps to a point on a
 * face — free along the wall, free up and down it, but never off it.
 */
const withWallFixturePlacement = BaseClass => class extends BaseClass {
    getWallBuilder() {
        return this.gameMap?.wallBuilder || null;
    }

    getRenderZIndex() {
        if (Number.isFinite(this._attachmentRenderZIndex)) return super.getRenderZIndex();
        const placement = this.getWallBuilder()?.resolveFixturePlacement(this, this.posX, this.posY);
        return placement
            ? this.gameMap.getDepthZIndex(placement.piece.baseline) + 1
            : super.getRenderZIndex();
    }

    // A fixture is mounted on a wall, not standing on the floor: it occupies no
    // grid cell and must never take part in collision or pathfinding.
    getGridOccupancyBounds() {
        return null;
    }

    getCullingBounds(x = this.posX, y = this.posY) {
        return { x, y, width: this.size.width, height: this.size.height };
    }

    clampPlacementPosition(x, y) {
        return this.getWallBuilder()?.resolveFixturePlacement(this, x, y)?.position || { x, y };
    }

    checkDropValidity(x, y) {
        return this.getWallBuilder()?.canPlaceFixtureObject(this, x, y) === true;
    }

    restoreInvalidDropToOrigin() {
        return true;
    }

    onPlacementDragStart() {
        this.getWallBuilder()?.beginFixtureMove(this);
    }

    onPlacementDragMove() {
        this.getWallBuilder()?.refreshMovingObjectReveal(this);
    }

    onPlacementDragEnd() {
        return this.getWallBuilder()?.finishFixtureMove(this) === true;
    }

    // Dropped into the inventory rather than back onto a wall.
    onPlacementStored() {
        this.getWallBuilder()?.cancelFixtureMove(this);
    }

    // Presentation contract with the wall behind it: the SAME rule the authored
    // decorations use, so the two paths cannot drift apart again. The record,
    // the socket attachment and the authored u/v are untouched - only what is
    // drawn changes.
    applyWallCut(cutY) {
        WallBuilder.applyFixtureCut(this.element, cutY, this.posY, this.size?.height ?? 0);
    }
};

class WallFixtureMapObject extends withWallFixturePlacement(MapObject) {
    getBaseCssClass() {
        return 'wall-fixture';
    }
}
