class SurfaceCustomizePanel extends ModalWindow {
    static SURFACE_LABELS = Object.freeze({
        north: 'North wall',
        south: 'South wall',
        west: 'West side',
        east: 'East side'
    });

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
        this.highlightElements = [];
        this.highlightKey = null;
        this.boundStagePointerDown = this.handleStagePointerDown.bind(this);
        this.boundStagePointerMove = this.handleStagePointerMove.bind(this);
        this.init();
        this.paletteElement = this.modalElement?.querySelector('.surface-palette');
        this.scopeElement = this.modalElement?.querySelector('.surface-scope');
        this.emptyElement = this.modalElement?.querySelector('.surface-customize-empty');
        this.finishGroup = this.modalElement?.querySelector('.surface-finish-group');
        this.roomFields = [...(this.modalElement?.querySelectorAll('.surface-room-fields') || [])];
        this.roomNameInput = this.modalElement?.querySelector('#surface-room-name');
        this.roomTypeSelect = this.modalElement?.querySelector('#surface-room-type');
        this.buildRoomTypeOptions();
        this.roomNameInput?.addEventListener('change', () => this.commitRoom());
        this.roomTypeSelect?.addEventListener('change', () => this.commitRoom());
        this.targetElement = this.modalElement?.querySelector('.surface-target');
        this.targetRoomElement = this.modalElement?.querySelector('.surface-target__room');
        this.targetSurfaceElement = this.modalElement?.querySelector('.surface-target__surface');
        this.wallView = new WallViewControl(this, this.modalElement?.querySelector('.wall-view-controls'));
        this.scope = new SegmentControl(this.scopeElement, {
            value: 'stretch',
            onChange: () => this.renderPalette()
        });
        this.gridToggle = new BuildGridToggle(this, this.modalElement);
        this.snapToggle = new BuildSnapToggle(this, this.modalElement);
        this.paletteElement?.addEventListener('pointerleave', () => this.revertPreview());
        this.parent?.parent?.canvas?.addEventListener('pointerdown', this.boundStagePointerDown, true);
        this.parent?.parent?.canvas?.addEventListener('pointermove', this.boundStagePointerMove, true);
    }

    get gameMap() {
        return this.parent?.parent?.gameMap || null;
    }

    handleToolModeChanged(mode) {
        const active = mode === UIToolModes.SURFACE;
        document.body.classList.toggle('customize-mode', active);
        this.buttonElement?.classList.toggle('active', active);
        this.revertPreview();
        this.clearHighlight();
        this.target = null;
        this.renderPalette();
        // The panel opens with the mode, not with the first click: entering a
        // mode that says nothing and shows nothing reads as "nothing happened".
        if (active) {
            this.wallView.sync();
            this.gridToggle.sync();
            this.snapToggle.sync();
            this.open();
        } else {
            super.close();
        }
    }

    // See WallBuildPanel.close: hand back to the current mode's default tool.
    close() {
        if (this.parent.isTool(UIToolModes.SURFACE) &&
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

    /**
     * Outlines exactly the surfaces a click would repaint.
     *
     * Keyed on the SURFACE under the pointer, not the piece: one wall piece can
     * show two rooms' paint at once — a corner post is split down the middle —
     * so crossing that seam is a new selection even though the piece has not
     * changed.
     */
    handleStagePointerMove(event) {
        if (!this.parent.isTool(UIToolModes.SURFACE)) return;
        const target = this.resolveTarget(event);
        const key = target
            ? (target.surface === 'wall'
                ? `wall:${target.wallSurface.cell.x},${target.wallSurface.cell.y},${target.wallSurface.face}`
                : `floor:${target.room.id}`)
            : null;
        if (key === this.highlightKey) return;

        this.clearHighlight();
        if (!target) return;
        this.highlightElements = target.surface === 'wall'
            ? this.createWallHighlight(target.wallSurface)
            : [this.createFloorHighlight(target.room)].filter(Boolean);
        this.highlightKey = this.highlightElements.length > 0 ? key : null;
    }

    /**
     * One outline per run of adjacent surfaces. A stretch that ends in half a
     * corner post is not a rectangle, and a box drawn round it offered paint on
     * the other half — the half belonging to the room next door.
     */
    createWallHighlight(surface) {
        const builder = this.gameMap?.wallBuilder;
        const rects = builder?.getSurfaceRects(builder.getPaintStretchSurfaces(surface)) || [];
        return rects.map(rect => {
            const element = document.createElement('div');
            element.className = 'wall-paint-highlight';
            Object.assign(element.style, {
                left: `${rect.left}px`,
                top: `${rect.top}px`,
                width: `${rect.width}px`,
                height: `${rect.height}px`,
                zIndex: String(rect.zIndex)
            });
            builder.layer.appendChild(element);
            return element;
        });
    }

    // Same tint as the wall highlight, through the floor's own mask — the two
    // surfaces are the same kind of selection and should not look like two
    // different features.
    createFloorHighlight(room) {
        return this.gameMap?.floorBuilder?.createRoomOverlay(room, {
            className: 'floor-paint-highlight',
            fill: SurfaceCustomizePanel.highlightFill()
        }) ?? null;
    }

    static highlightFill() {
        const accent = getComputedStyle(document.documentElement)
            .getPropertyValue('--state-info-accent').trim() || '#4285f4';
        return `color-mix(in srgb, ${accent} 22%, transparent)`;
    }

    /**
     * What the pointer is over: a paintable wall, else the room it stands in.
     *
     * Walls are resolved from the element because their art rises above the
     * cell they occupy — the cursor on a visible wall is nowhere near that
     * wall's own tile. Floors are the opposite: resolved from world coordinates,
     * because the floor canvas is a bounding box with bleed, so hit-testing it
     * claimed ground belonging to the room next door.
     */
    resolveTarget(event) {
        const piece = this.resolveWallPiece(event);
        // Which surface, not which piece: the face a click lands on is a
        // property of the slice of art under the pointer, and only the renderer
        // knows which slice that is.
        const wallSurface = piece
            ? this.gameMap?.wallBuilder?.surfaceAtOffset(piece, Math.floor(event.offsetX ?? -1))
            : null;
        if (wallSurface) return { surface: 'wall', piece, wallSurface, face: wallSurface.face };
        const room = this.resolveRoomAt(event);
        return room ? { surface: 'floor', room } : null;
    }

    /**
     * The paintable wall piece under a pointer, or null.
     *
     * A wall's canvas is a full frame band whatever the wall is currently
     * doing, so with the walls lowered most of that box is transparent air
     * hanging over the floor behind it — and the box, not the art, was catching
     * every click. The alpha test asks whether the pointer is on the wall you
     * can actually see; anywhere else falls through to the floor.
     *
     * A north-south run is a target like any other — its post is two painted
     * half-cell surfaces — and the alpha test is what keeps the click honest,
     * since the post is 14px of art in a 32px box.
     */
    resolveWallPiece(event) {
        const element = event?.target?.closest?.('.wall-piece');
        if (!element || !this.isOpaqueAt(element, event)) return null;
        const builder = this.gameMap?.wallBuilder;
        const piece = builder?.findPieceById(element.dataset.wallPieceId);
        return piece && builder.isPaintable(piece) ? piece : null;
    }

    isOpaqueAt(canvas, event) {
        const x = Math.floor(event.offsetX ?? -1);
        const y = Math.floor(event.offsetY ?? -1);
        if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return false;
        try {
            return canvas.getContext('2d').getImageData(x, y, 1, 1).data[3] > 8;
        } catch (_error) {
            // A tainted or zero-sized canvas cannot be sampled; treat the whole
            // box as solid rather than making the wall unselectable.
            return true;
        }
    }

    /**
     * The room under the pointer — the smallest one, when they nest.
     *
     * A room walled off inside another sits inside its parent's bounds, so the
     * first match is the outer room and the inner one would be unreachable.
     * The smallest region containing the point is the one the player means.
     */
    resolveRoomAt(event) {
        const world = this.gameMap?.container?.inputHandler?.screenToWorldCoordinates?.(
            event.clientX,
            event.clientY
        );
        if (!world) return null;
        return this.gameMap?.regionManager?.innermostAt?.(
            world.x,
            world.y,
            'room',
            this.gameMap.gridSystem?.config?.cellSize
        ) ?? null;
    }

    clearHighlight() {
        for (const element of this.highlightElements) element.remove();
        this.highlightElements = [];
        this.highlightKey = null;
    }

    handleStagePointerDown(event) {
        if (!this.parent.isTool(UIToolModes.SURFACE)) return;
        // Resolved before the event is claimed: a vertical run is not a paint
        // target, so clicking one has to fall through to whatever is under it
        // rather than being swallowed into a no-op.
        const target = this.resolveTarget(event);
        if (!target) return;
        event.preventDefault();
        event.stopPropagation();
        this.target = target;
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

    // Whether the current target may actually be repainted; the answer is
    // shown on the target line and disables the palette.
    checkTarget() {
        if (!this.target) return BuildRules.deny('Nothing selected.');
        return this.target.surface === 'floor'
            ? this.rules?.canPaintRoomFloor(this.target.room) ?? BuildRules.ALLOWED
            : this.rules?.canPaintWallFace(this.target.wallSurface.cell) ?? BuildRules.ALLOWED;
    }

    /**
     * Where it is, then what it is — one per line. A single run reading
     * "Wall, south face — Kitchen" buried the room name behind the least
     * interesting part of the answer and wrapped at the panel's width anyway.
     */
    describeTarget() {
        if (!this.target) return { room: 'Nothing selected', surface: '', locked: false };
        const locked = !this.checkTarget().allowed;
        if (this.target.surface === 'floor') {
            return { room: this.roomName(this.target.room), surface: 'Floor', locked };
        }
        const roomId = this.target.wallSurface.roomId;
        const room = roomId ? this.gameMap?.regionManager?.get('room', roomId) : null;
        return {
            room: room ? this.roomName(room) : 'Outside',
            surface: SurfaceCustomizePanel.SURFACE_LABELS[this.target.wallSurface.face] || 'Wall',
            locked
        };
    }

    roomName(room) {
        return room?.properties?.displayName || room?.id || 'Room';
    }

    buildRoomTypeOptions() {
        if (!this.roomTypeSelect) return;
        this.roomTypeSelect.replaceChildren(...SiteConfig.rooms.types.map(type => {
            const option = document.createElement('option');
            option.value = type.id;
            option.textContent = type.label;
            return option;
        }));
    }

    /**
     * A room's name and its type are both just properties on the region.
     *
     * Authored rooms get a name from the map and rooms the player encloses get
     * a numbered placeholder; this is where either becomes something chosen.
     * Type is deliberately separate from name — "Study" is what you call it,
     * `study` is what it is for, and behaviour that wants to reason about rooms
     * ("eat in the kitchen") needs the second, not a parse of the first.
     *
     * Both stored under `player*` keys alongside the authored values, so world
     * state can tell what the player chose from what the map shipped with and
     * persist only the former.
     */
    commitRoom() {
        const room = this.target?.surface === 'floor' ? this.target.room : null;
        if (!room) return false;

        const previous = this.roomState(room);
        const next = {
            name: this.roomNameInput?.value.trim() || null,
            type: this.roomTypeSelect?.value || SiteConfig.rooms.defaultType
        };
        if (next.name === previous.name && next.type === previous.type) return false;

        const apply = (state) => {
            const region = this.gameMap?.regionManager?.get('room', room.id);
            if (!region) return false;
            region.properties = {
                ...region.properties,
                playerName: state.name,
                roomType: state.type,
                displayName: state.name
                    ?? region.properties.authoredDisplayName
                    ?? region.properties.displayName
            };
            this.gameMap.container?.worldState?.captureMap?.(this.gameMap);
            this.gameMap.core?.user?._scheduleSave?.();
            this.syncRoomFields();
            this.renderTarget();
            return true;
        };

        if (!apply(next)) return false;
        this.parent.parent?.buildHistory?.push({
            label: next.type !== previous.type ? 'Change Room Type' : 'Rename Room',
            undo: () => apply(previous),
            redo: () => apply(next)
        });
        return true;
    }

    roomState(room) {
        return {
            name: room?.properties?.playerName ?? null,
            type: room?.properties?.roomType ?? SiteConfig.rooms.defaultType
        };
    }

    syncRoomFields() {
        const room = this.target?.surface === 'floor' ? this.target.room : null;
        for (const field of this.roomFields) field.hidden = !room;
        if (!room) return;
        const state = this.roomState(room);
        if (this.roomNameInput) this.roomNameInput.value = this.roomName(room);
        if (this.roomTypeSelect) this.roomTypeSelect.value = state.type;
    }

    renderTarget() {
        const { room, surface, locked } = this.describeTarget();
        if (this.targetRoomElement) this.targetRoomElement.textContent = room;
        if (this.targetSurfaceElement) this.targetSurfaceElement.textContent = surface;
        this.targetElement?.classList.toggle('is-locked', locked);
        // Nothing picked yet is a placeholder, not a readout — it should not
        // shout the way a real target name does.
        this.targetElement?.classList.toggle('is-empty', !this.target);
    }

    // What this surface is already painted with, so the palette can say so.
    getCurrentFinishId() {
        if (!this.target) return null;
        if (this.target.surface === 'floor') {
            return this.target.room.properties?.floorFinishId ||
                SiteConfig.floorSystem?.defaultFinishId ||
                null;
        }
        const { cell, face } = this.target.wallSurface;
        return cell ? this.gameMap?.wallBuilder?.resolveFaceFinishId(cell, face) : null;
    }

    getWallScope() {
        return this.scope?.value || 'stretch';
    }

    buildRequests(finishId, scopeOverride = null) {
        if (!this.target) return [];
        if (this.target.surface === 'floor') {
            return [{ surface: 'floor', roomId: this.target.room.id, finishId }];
        }

        const builder = this.gameMap.wallBuilder;
        const surface = this.target.wallSurface;

        if ((scopeOverride || this.getWallScope()) !== 'room') {
            // Exactly the surfaces the highlight outlined: same call, same room
            // test, same stopping rule. Deriving the painted set separately
            // from the previewed one is what let a click outline one wall and
            // repaint another.
            return builder.getPaintStretchSurfaces(surface).map(entry => ({
                surface: 'wall',
                face: entry.face,
                cells: { from: [entry.cell.x, entry.cell.y], to: [entry.cell.x, entry.cell.y] },
                roomId: entry.roomId,
                finishId
            }));
        }

        const roomId = surface.roomId;
        if (!roomId) return [];
        // One request, not one per cell per face. A room's wall colour is a
        // property of the room; enumerating cells could only ever paint the
        // faces that existed at the moment you clicked, which is what left
        // corners and side walls behind. See WallBuilder.setRoomWallFinish.
        return [{ surface: 'wall', roomId, finishId }];
    }

    renderPalette() {
        if (!this.paletteElement) return;
        this.revertPreview();
        this.paletteElement.replaceChildren();
        this.renderTarget();
        this.syncRoomFields();
        this.scopeElement.hidden = this.target?.surface !== 'wall';
        this.emptyElement.hidden = !!this.target;
        // An empty Finish heading over an empty box reads as something that
        // failed to load. With nothing picked there is no finish to choose, so
        // the whole group stands down and the panel is just its prompt.
        if (this.finishGroup) this.finishGroup.hidden = !this.target;
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
            sample.width = 22;
            sample.height = 22;
            sample.setAttribute('aria-hidden', 'true');
            const source = this.getFinishSample(finish.id);
            if (source) {
                const context = sample.getContext('2d');
                context.imageSmoothingEnabled = false;
                context.drawImage(source, 0, 0, source.width, source.height, 0, 0, sample.width, sample.height);
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
            const { cell, face } = this.target.wallSurface;
            const builder = this.gameMap?.wallBuilder;
            this.target.piece = builder?.findPieceForCell(cell.x, cell.y) || this.target.piece;
            // The cell object is rebuilt too, and the stale one still carries
            // the finish from before the paint — which the palette would go on
            // showing as the current colour.
            this.target.wallSurface = builder?.getCellSurfaces(builder.cells.get(`${cell.x},${cell.y}`))
                ?.find(entry => entry.face === face) || this.target.wallSurface;
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
            if (request.roomId && !request.cells) {
                const room = this.gameMap?.regionManager?.get('room', request.roomId);
                return { ...request, finishId: room?.properties?.wallFinishId ?? null };
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
        this.clearHighlight();
        this.roomNameInput = null;
        this.roomTypeSelect = null;
        this.roomFields = [];
        document.body.classList.remove('build-target-locked');
        this.wallView?.dispose();
        this.wallView = null;
        this.scope?.dispose();
        this.scope = null;
        this.gridToggle?.dispose();
        this.gridToggle = null;
        this.snapToggle?.dispose();
        this.snapToggle = null;
        this.parent?.parent?.canvas?.removeEventListener('pointerdown', this.boundStagePointerDown, true);
        this.parent?.parent?.canvas?.removeEventListener('pointermove', this.boundStagePointerMove, true);
        document.body.classList.remove('customize-mode');
        super.dispose();
    }
}
