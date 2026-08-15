class SurfaceCustomizePanel extends ModalWindow {
    constructor(parent) {
        super(parent, {
            id: 'customize-panel',
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
        this.wallView = new WallViewControl(this, this.modalElement?.querySelector('.wall-view-controls'));
        this.paletteElement?.addEventListener('pointerleave', () => this.revertPreview());
        this.scopeElement?.addEventListener('change', () => this.renderPalette());
        this.parent?.parent?.canvas?.addEventListener('pointerdown', this.boundStagePointerDown, true);
    }

    get gameMap() {
        return this.parent?.parent?.gameMap || null;
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
        if (active) {
            this.wallView.sync();
            this.open();
        } else {
            super.close();
        }
    }

    // See WallBuildPanel.close: hand back to the current mode's default tool.
    close() {
        if (this.parent.isTool(UIToolModes.CUSTOMIZE) &&
            this.parent.changeToolMode(this.parent.toolManager.getDefaultToolFor())) {
            return;
        }
        super.close();
    }

    // Escape is layered by ContainerInputManager; see WallBuildPanel.
    handleKeyDown() {}

    get rules() {
        return this.parent?.parent?.buildRules || null;
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
        // Alt-click samples what is already there instead of selecting it to
        // paint - the finish resolvers already answer the question.
        if (event.altKey) {
            const sampled = this.getCurrentFinishId();
            this.renderPalette();
            if (sampled) {
                this.parent.showMessage(`Picked up ${sampled.replaceAll('_', ' ')}.`, 'info', 'Eyedropper');
            }
            return;
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

    // Whether the current target may actually be repainted; the answer is
    // shown on the target line and disables the palette.
    checkTarget() {
        if (!this.target) return BuildRules.deny('Nothing selected.');
        return this.target.surface === 'floor'
            ? this.rules?.canPaintRoomFloor(this.target.room) ?? BuildRules.ALLOWED
            : this.rules?.canPaintWallFace(this.target.piece.cells[0]) ?? BuildRules.ALLOWED;
    }

    describeTarget() {
        if (!this.target) return 'Nothing selected';
        const lock = this.checkTarget().allowed ? '' : ' 🔒';
        if (this.target.surface === 'floor') {
            const name = this.target.room.properties?.displayName || this.target.room.id;
            return `Floor — ${name}${lock}`;
        }
        const roomId = this.target.piece.cells[0]?.faces?.[this.target.face]?.roomId;
        const room = roomId ? this.gameMap?.regionManager?.get('room', roomId) : null;
        const where = room ? ` — ${room.properties?.displayName || room.id}` : ' — outside';
        return `Wall, ${this.target.face} face${where}${lock}`;
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

    buildRequests(finishId, scopeOverride = null) {
        if (!this.target) return [];
        if (this.target.surface === 'floor') {
            return [{ surface: 'floor', roomId: this.target.room.id, finishId }];
        }

        const piece = this.target.piece;
        if ((scopeOverride || this.getWallScope()) !== 'room') {
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

        const verdict = this.checkTarget();
        this.paletteElement.classList.toggle('is-locked', !verdict.allowed);
        document.body.classList.toggle('build-target-locked', !verdict.allowed);
        if (!verdict.allowed) {
            const notice = document.createElement('p');
            notice.className = 'setting-hint';
            notice.textContent = verdict.reason;
            this.paletteElement.appendChild(notice);
            this.warnLockedOnce(verdict.reason);
            return;
        }

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
            button.addEventListener('click', () => this.applyFinish(finish.id));
            // Double-click paints the whole room without touching the scope
            // radio - the scope machinery already understands the request.
            button.addEventListener('dblclick', () => this.applyFinish(finish.id, 'room'));
            this.paletteElement.appendChild(button);
        }
    }

    /**
     * Paint, and record the inverse. The undo of a paint is the set of finish
     * ids the targets carried a moment ago, replayed through the same
     * customizer so persistence and the room lighting rebuild both happen.
     */
    applyFinish(finishId, scopeOverride = null) {
        clearTimeout(this.hoverTimer);
        const customizer = this.gameMap?.surfaceCustomizer;
        if (!customizer) return false;

        const requests = this.buildRequests(finishId, scopeOverride);
        if (requests.length === 0) return false;

        const inverse = this.captureCurrentFinishes(requests);
        if (!customizer.apply(requests)) return false;

        this.parent.parent?.buildHistory?.push({
            label: `Paint ${this.target?.surface === 'floor' ? 'Floor' : 'Wall'}`,
            undo: () => customizer.apply(Utility.deepClone(inverse)),
            redo: () => customizer.apply(Utility.deepClone(requests))
        });
        this.parent.parent?.core?.soundManager?.playWhenReady?.(SiteConfig.buildMode.sounds.paint);

        // The piece the target points at is rebuilt by the paint, so
        // re-resolve it before the palette re-reads its finish.
        if (this.target?.surface === 'wall') {
            const cell = this.target.piece.cells[0];
            this.target.piece = this.gameMap?.wallBuilder?.findPieceForCell(cell.x, cell.y) || this.target.piece;
        }
        this.renderPalette();
        return true;
    }

    captureCurrentFinishes(requests) {
        const builder = this.gameMap?.wallBuilder;
        return requests.map(request => {
            if (request.surface === 'floor') {
                const room = this.gameMap?.regionManager?.get('room', request.roomId);
                return {
                    ...request,
                    finishId: room?.properties?.floorFinishId || SiteConfig.floorSystem?.defaultFinishId || null
                };
            }
            const [cellX, cellY] = request.cells.from;
            const cell = builder?.cells?.get(`${cellX},${cellY}`);
            return {
                ...request,
                finishId: cell ? builder.resolveFaceFinishId(cell, request.face) : request.finishId
            };
        });
    }

    warnLockedOnce(reason) {
        if (this._warnedLocked) return;
        this._warnedLocked = true;
        this.parent.showMessage(reason, 'info', 'Locked');
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
        document.body.classList.remove('build-target-locked');
        this.wallView?.dispose();
        this.wallView = null;
        this.parent?.parent?.canvas?.removeEventListener('pointerdown', this.boundStagePointerDown, true);
        document.body.classList.remove('customize-mode');
        super.dispose();
    }
}
