const withWallOpeningPlacement = BaseClass => class extends BaseClass {
    getRenderZIndex() {
        if (Number.isFinite(this._attachmentRenderZIndex)) return super.getRenderZIndex();
        return this.gameMap?.wallBuilder?.getOpeningRenderZIndex(this, this.posX, this.posY) ??
            super.getRenderZIndex();
    }

    getGridOccupancyBounds(x = this.posX, y = this.posY) {
        return this.gameMap?.wallBuilder?.getOpeningPlacementBounds(this, x, y) || null;
    }

    getCullingBounds(x = this.posX, y = this.posY) {
        return this.getGridOccupancyBounds(x, y);
    }

    clampPlacementPosition(x, y) {
        return this.gameMap?.wallBuilder?.resolveOpeningPlacement(this, x, y)?.position || { x, y };
    }

    checkDropValidity(x, y) {
        return this.gameMap?.wallBuilder?.canPlaceOpeningObject(this, x, y) === true;
    }

    restoreInvalidDropToOrigin() {
        return true;
    }

    onPlacementDragStart() {
        this.gameMap?.wallBuilder?.beginOpeningMove(this);
    }

    onPlacementDragEnd() {
        this.gameMap?.wallBuilder?.finishOpeningMove(this);
    }
};
