class SurfaceCustomizePanel extends ModalWindow {
    constructor(parent) {
        super(parent, {
            id: 'customize-panel',
            buttonId: 'customize-toggle',
            closeOnOutsideClick: false,
            position: 'top-right',
            draggable: true,
            closeButtonSelector: '.modal-close-btn'
        });
        this.target = null;
        this.hoverTimer = null;
        this.boundStagePointerDown = this.handleStagePointerDown.bind(this);
        this.init();
        this.paletteElement = this.modalElement?.querySelector('.surface-palette');
        this.scopeElement = this.modalElement?.querySelector('.surface-scope');
        this.emptyElement = this.modalElement?.querySelector('.surface-customize-empty');
        this.targetElement = this.modalElement?.querySelector('.surface-target');
        this.paletteElement?.addEventListener('pointerleave', () => this.revertPreview());
        this.scopeElement?.addEventListener('change', () => this.renderPalette());
        this.parent?.parent?.canvas?.addEventListener('pointerdown', this.boundStagePointerDown, true);
    }

    get gameMap() {
        return this.parent?.parent?.gameMap || null;
    }

    buttonLeftClick(event) {
        event.preventDefault();
        event.stopPropagation();
        if (this.parent.isTool(UIToolModes.CUSTOMIZE)) {
            this.parent.changeToolMode(UIToolModes.SELECT);
        } else {
            this.parent.toolManager.setToolMode(UIToolModes.CUSTOMIZE);
        }
        return false;
    }

    handleToolModeChanged(mode) {
        const active = mode === UIToolModes.CUSTOMIZE;
        document.body.classList.toggle('customize-mode', active);
        this.buttonElement?.classList.toggle('active', active);
        this.revertPreview();
        this.target = null;
        this.renderPalette();
        // The panel opens with the mode, not with the first click: entering a
        // mode that says nothing and shows nothing reads as "nothing happened".
        if (active) this.open();
        else super.close();
    }

    close() {
        if (this.parent.isTool(UIToolModes.CUSTOMIZE)) {
            this.parent.changeToolMode(UIToolModes.SELECT);
            return;
        }
        super.close();
    }

    handleKeyDown(event) {
        if (event.key !== 'Escape' || !this.parent.isTool(UIToolModes.CUSTOMIZE)) return;
        event.preventDefault();
        this.parent.changeToolMode(UIToolModes.SELECT);
    }

    handleStagePointerDown(event) {
        if (!this.parent.isTool(UIToolModes.CUSTOMIZE)) return;
        const wallElement = event.target.closest?.('.wall-piece');
        const floorElement = event.target.closest?.('.floor-surface');
        if (!wallElement && !floorElement) return;
        event.preventDefault();
        event.stopPropagation();

        if (wallElement) {
            const piece = this.gameMap?.wallBuilder?.pieces?.find(candidate =>
                candidate.id === wallElement.dataset.wallPieceId
            );
            if (!piece) return;
            this.target = { surface: 'wall', piece, face: this.resolveWallFace(piece, event) };
        } else {
            const room = this.gameMap?.regionManager?.get('room', floorElement.dataset.roomId);
            if (!room) return;
            this.target = { surface: 'floor', room };
        }
        this.renderPalette();
        this.open();
    }

    /**
     * Which face of the wall the click landed on.
     *
     * A wall's standing art is its SOUTH face - that is the side the camera
     * sees head-on. Its north face is only ever visible as the footprint band
     * across its own cell, which is exactly the split the room light bands use.
     * Hard-coding 'south' left every north-facing wall unpaintable and repainted
     * the wrong side of the one you clicked.
     */
    resolveWallFace(piece, event) {
        const world = this.gameMap?.container?.inputHandler?.screenToWorldCoordinates?.(
            event.clientX,
            event.clientY
        );
        const cellSize = this.gameMap?.wallBuilder?.cellSize || 32;
        if (!world) return 'south';
        return world.y >= (piece.y * cellSize) ? 'north' : 'south';
    }

    describeTarget() {
        if (!this.target) return 'Nothing selected';
        if (this.target.surface === 'floor') {
            const name = this.target.room.properties?.displayName || this.target.room.id;
            return `Floor — ${name}`;
        }
        const roomId = this.target.piece.cells[0]?.faces?.[this.target.face]?.roomId;
        const room = roomId ? this.gameMap?.regionManager?.get('room', roomId) : null;
        const where = room ? ` — ${room.properties?.displayName || room.id}` : ' — outside';
        return `Wall, ${this.target.face} face${where}`;
    }

    // What this surface is already painted with, so the palette can say so.
    getCurrentFinishId() {
        if (!this.target) return null;
        if (this.target.surface === 'floor') {
            return this.target.room.properties?.floorFinishId ||
                SiteConfig.floorSystem?.defaultFinishId ||
                null;
        }
        const cell = this.target.piece.cells[0];
        return cell ? this.gameMap?.wallBuilder?.resolveFaceFinishId(cell, this.target.face) : null;
    }

    getWallScope() {
        return this.modalElement?.querySelector('input[name="surface-wall-scope"]:checked')?.value || 'stretch';
    }

    buildRequests(finishId) {
        if (!this.target) return [];
        if (this.target.surface === 'floor') {
            return [{ surface: 'floor', roomId: this.target.room.id, finishId }];
        }

        const piece = this.target.piece;
        if (this.getWallScope() !== 'room') {
            const first = piece.cells[0];
            const last = piece.cells[piece.cells.length - 1];
            return [{
                surface: 'wall',
                face: this.target.face,
                cells: { from: [first.x, first.y], to: [last.x, last.y] },
                finishId
            }];
        }

        const roomId = piece.cells.find(cell => cell.faces?.[this.target.face]?.roomId)?.faces?.[this.target.face]?.roomId;
        if (!roomId) return [];
        const requests = [];
        for (const wallPiece of this.gameMap.wallBuilder.pieces) {
            for (const cell of wallPiece.cells) {
                for (const face of ['north', 'south']) {
                    if (cell.faces?.[face]?.roomId !== roomId) continue;
                    requests.push({
                        surface: 'wall', face,
                        cells: { from: [cell.x, cell.y], to: [cell.x, cell.y] },
                        finishId
                    });
                }
            }
        }
        return requests;
    }

    renderPalette() {
        if (!this.paletteElement) return;
        this.revertPreview();
        this.paletteElement.replaceChildren();
        if (this.targetElement) this.targetElement.textContent = this.describeTarget();
        this.scopeElement.hidden = this.target?.surface !== 'wall';
        this.emptyElement.hidden = !!this.target;
        if (!this.target) return;

        const customizer = this.gameMap?.surfaceCustomizer;
        const finishes = customizer?.listFinishes(this.target.surface) || [];
        const currentFinishId = this.getCurrentFinishId();
        for (const finish of finishes) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'surface-swatch';
            button.dataset.finishId = finish.id;
            const selected = finish.id === currentFinishId;
            button.setAttribute('aria-pressed', String(selected));
            button.classList.toggle('is-selected', selected);
            const sample = document.createElement('canvas');
            sample.width = 32;
            sample.height = 32;
            sample.setAttribute('aria-hidden', 'true');
            const source = this.getFinishSample(finish.id);
            if (source) {
                const context = sample.getContext('2d');
                context.imageSmoothingEnabled = false;
                context.drawImage(source, 0, 0, source.width, source.height, 0, 0, 32, 32);
            }
            const label = document.createElement('span');
            label.textContent = finish.displayName || finish.name || finish.id.replaceAll('_', ' ');
            button.append(sample, label);
            button.addEventListener('pointerenter', () => {
                clearTimeout(this.hoverTimer);
                this.hoverTimer = setTimeout(() => {
                    customizer.preview(this.buildRequests(finish.id));
                }, 150);
            });
            button.addEventListener('pointerleave', () => clearTimeout(this.hoverTimer));
            button.addEventListener('click', () => {
                clearTimeout(this.hoverTimer);
                customizer.apply(this.buildRequests(finish.id));
                // The piece the target points at is rebuilt by the paint, so
                // re-resolve it before the palette re-reads its finish.
                if (this.target?.surface === 'wall') {
                    const cell = this.target.piece.cells[0];
                    this.target.piece = this.gameMap?.wallBuilder?.findPieceForCell(cell.x, cell.y) || this.target.piece;
                }
                this.renderPalette();
            });
            this.paletteElement.appendChild(button);
        }
    }

    getFinishSample(finishId) {
        if (this.target.surface === 'floor') return this.gameMap.floorMaterialRegistry?.getTile(finishId);
        return this.gameMap.wallMaterialRegistry
            ?.getSwatchColumns(finishId, this.gameMap.wallMaterialRegistry.getConstruction(this.target.piece.constructionId))
            ?.body || null;
    }

    revertPreview() {
        clearTimeout(this.hoverTimer);
        this.hoverTimer = null;
        this.gameMap?.surfaceCustomizer?.revertPreview();
    }

    dispose() {
        this.revertPreview();
        this.parent?.parent?.canvas?.removeEventListener('pointerdown', this.boundStagePointerDown, true);
        document.body.classList.remove('customize-mode');
        super.dispose();
    }
}
