const withWallOpeningPlacement = BaseClass => class extends BaseClass {
    getRenderZIndex() {
        if (Number.isFinite(this._attachmentRenderZIndex)) return super.getRenderZIndex();
        return this.gameMap?.wallBuilder?.getOpeningRenderZIndex(this, this.posX, this.posY) ??
            super.getRenderZIndex();
    }

    getGridOccupancyBounds(x = this.posX, y = this.posY) {
        return this.gameMap?.wallBuilder?.getOpeningPlacementBounds(this, x, y) || null;
    }

    /**
     * Culling has to use the sprite, not the footprint. An opening occupies one
     * cell row but its art stands the full height of the wall above it, so
     * culling on the footprint drops the sprite as soon as that thin band
     * leaves the camera — while most of the window is still on screen.
     */
    getCullingBounds(x = this.posX, y = this.posY) {
        const frame = this.getVisualFrameSize?.() || null;
        const width = Math.max(this.size.width, Number(frame?.width) || 0);
        const height = Math.max(this.size.height, Number(frame?.height) || 0);
        const sprite = { x, y: y - (height - this.size.height), width, height };
        const footprint = this.getGridOccupancyBounds(x, y);
        if (!footprint) return sprite;

        const left = Math.min(sprite.x, footprint.x);
        const top = Math.min(sprite.y, footprint.y);
        return {
            x: left,
            y: top,
            width: Math.max(sprite.x + sprite.width, footprint.x + footprint.width) - left,
            height: Math.max(sprite.y + sprite.height, footprint.y + footprint.height) - top
        };
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

    onPlacementDragMove() {
        this.gameMap?.wallBuilder?.refreshMovingObjectReveal(this);
    }

    onPlacementDragEnd() {
        return this.gameMap?.wallBuilder?.finishOpeningMove(this) === true;
    }

    // Dropped into the inventory rather than back onto a wall: the opening is
    // gone for good, so just let go of it.
    onPlacementStored() {
        this.gameMap?.wallBuilder?.cancelOpeningMove(this);
    }

    /**
     * Presentation contract with the wall that hosts this opening.
     *
     * A door or window is a thing in its own right, not decoration painted on
     * the wall, so lowering the wall must not delete it — you still need to see
     * where the room's exits are. It therefore keeps drawing at full size; the
     * hook stays so a construction whose openings really are wall-height can
     * clip them later. Collision, walkability and line of sight are untouched
     * either way.
     */
    applyWallCut() {
        if (this.element) this.element.style.clipPath = '';
    }
};
