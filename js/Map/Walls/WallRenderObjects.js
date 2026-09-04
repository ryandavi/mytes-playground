class WallFaceSurface {
    constructor(builder, piece, direction) {
        this.builder = builder;
        this.piece = piece;
        this.direction = direction;
        this.id = `${piece.id}:${direction}`;
        this.worldId = `wall-face:${builder.gameMap.id}:${this.id}`;
        this.kind = 'wall-face';
        this.posX = piece.x * builder.cellSize;
        this.posY = piece.baseline - piece.height;
        this.size = { width: piece.cells.length * builder.cellSize, height: piece.height };
        this.sockets = new SocketSet(this, {
            surface: {
                kind: 'surface',
                accepts: ['object', 'wall-decoration'],
                capacity: 100,
                collision: 'disabled',
                uMode: 'distance',
                surfaceLength: this.size.width,
                area: { xFactor: [0, 1], yFactor: [0, 1] }
            }
        });
    }

    // One uniform contract for everything mounted on a wall: each child is told
    // the world Y of the wall top over its own span, and decides for itself
    // what that means (hide, clip, …). Presentation only — never collision.
    setCutLine(height) {
        // The socket stays on the canonical full wall. Mutating its geometry
        // here makes the attachment pass recalculate a painting at a different
        // Y for one frame whenever cutaway changes, which reads as flicker.
        this.cutHeight = height;
        for (const child of this.builder.gameMap.container?.attachments?.childrenOf?.(this) || []) {
            child.applyWallCut?.(this.builder.getCutYOver(
                this.piece, child.posX, child.posX + (child.size?.width || 0)
            ));
        }
    }

    // Anything hanging on this face sorts with the wall it hangs on, plus its
    // own bias — without these the attachment system has nothing to inherit
    // from and a decoration ends up behind the wall it is mounted to.
    getSortY() {
        return this.piece.baseline;
    }

    getRenderZIndex() {
        return this.builder.gameMap.getDepthZIndex(this.piece.baseline);
    }
}

class WallDecoration {
    constructor(builder, data) {
        this.builder = builder;
        this.id = data.id;
        this.worldId = `wall-decoration:${builder.gameMap.id}:${data.id}`;
        this.kind = 'wall-decoration';
        this.size = { width: data.width, height: data.height };
        this.posX = 0;
        this.posY = 0;
        this.active = true;
        this.element = document.createElement('div');
        this.element.className = `wall-decoration wall-decoration--${data.fixture}`;
        this.element.dataset.wallAttachmentId = data.id;
        this.element.setAttribute('aria-hidden', 'true');
        this.element.style.width = `${data.width}px`;
        this.element.style.height = `${data.height}px`;
        this.applyFixtureArt(data.fixture);
        this.renderer = {
            setZIndex: () => {
                const zIndex = this._attachmentRenderZIndex;
                if (Number.isFinite(zIndex)) this.element.style.zIndex = String(zIndex);
            }
        };
        builder.layer.appendChild(this.element);
    }

    setPosition(x, y) {
        this.posX = x;
        this.posY = y;
        this.element.style.left = `${Math.round(x)}px`;
        this.element.style.top = `${Math.round(y)}px`;
        // The attachment system places children after the wall has already
        // reported its cut line, so re-answer it now that we know where we are.
        this.applyWallCut();
    }

    setTarget() {}
    setSpritePosition() {}

    // Fixtures that ship art draw it; the rest fall back to the placeholder
    // box the stylesheet gives an unstyled wall decoration.
    applyFixtureArt(fixtureId) {
        const fixture = this.builder.registry.getFixture(fixtureId);
        const image = this.builder.registry.getFixtureImage(fixtureId);
        if (!fixture?.piece || !image?.src) return;
        this.element.classList.add('wall-decoration--art');
        this.element.style.backgroundImage = `url(${image.src})`;
        this.element.style.backgroundPosition = `${-fixture.piece.x}px ${-fixture.piece.y}px`;
    }

    applyWallCut(cutY = this._cutY) {
        this._cutY = cutY;
        WallBuilder.applyFixtureCut(this.element, cutY, this.posY, this.size.height);
    }

    dispose() {
        this.element.remove();
    }
}

class WallOpeningSlot {
    constructor(builder, opening, object) {
        this.builder = builder;
        this.opening = opening;
        this.id = opening.id;
        this.worldId = `wall-opening-slot:${builder.gameMap.id}:${opening.id}`;
        this.kind = 'wall-opening-slot';
        const bounds = builder.getOpeningBounds(opening);
        this.posX = bounds.x;
        this.posY = bounds.y;
        this.size = { width: bounds.width, height: bounds.height };
        const offset = builder.getOpeningObjectOffset(object, opening);
        this.sockets = new SocketSet(this, {
            opening: {
                kind: 'wall-opening',
                accepts: ['object'],
                capacity: 1,
                collision: 'inherit',
                position: {
                    xFactor: 0,
                    yFactor: 0,
                    offsetX: offset.x + (object.size.width / 2),
                    offsetY: offset.y + (object.size.height / 2)
                }
            }
        });
    }

    getSortY() {
        return this.posY + this.size.height;
    }

    getRenderZIndex() {
        return this.builder.gameMap.getDepthZIndex(this.getSortY());
    }

    // Doors and windows are separate map objects, so they only follow the wall
    // down if the wall tells them to — without this they float above the stub.
    setCutLine(piece) {
        const cutY = this.builder.getCutYOver(piece, this.posX, this.posX + this.size.width);
        for (const object of this.sockets.occupantsOf('opening')) object.applyWallCut?.(cutY);
    }
}

