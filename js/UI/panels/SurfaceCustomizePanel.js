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
        // Two independent outlines over the same geometry: what the pointer is
        // on, and what a click already chose. See `setOverlay`.
        this.hover = { elements: [], key: null, className: 'paint-hover' };
        this.selection = { elements: [], key: null, className: 'paint-selection' };
        this.boundStagePointerDown = this.handleStagePointerDown.bind(this);
        this.boundStagePointerMove = this.handleStagePointerMove.bind(this);
        this.init();
        this.paletteElement = this.modalElement?.querySelector('.surface-palette');
        this.scopeElement = this.modalElement?.querySelector('.surface-scope');
        this.scopeTitle = this.modalElement?.querySelector('.surface-scope-title');
        this.emptyElement = this.modalElement?.querySelector('.surface-customize-empty');
        this.finishGroup = this.modalElement?.querySelector('.surface-finish-group');
        this.finishTitle = this.modalElement?.querySelector('.surface-finish-title');
        this.targetElement = this.modalElement?.querySelector('.surface-target');
        this.targetRoomElement = this.modalElement?.querySelector('.surface-target__room');
        this.targetSurfaceElement = this.modalElement?.querySelector('.surface-target__surface');
        this.targetRoomLink = this.modalElement?.querySelector('.surface-target__room-link');
        this.targetRoomLink?.addEventListener('click', () => this.openTargetRoom());
        this.targetSampleButton = this.modalElement?.querySelector('.surface-target__sample');
        this.targetSampleButton?.addEventListener('click', () => {
            if (this.target) this.holdFinish(this.getCurrentFinishId(), this.target.surface);
        });
        // What the eyedropper is holding, if anything: { finishId, surface }.
        this.held = null;
        this.heldGroup = this.modalElement?.querySelector('.surface-held-group');
        this.heldSample = this.modalElement?.querySelector('.surface-held__sample');
        this.heldName = this.modalElement?.querySelector('.surface-held__name');
        this.modalElement?.querySelector('.surface-held__drop')
            ?.addEventListener('click', () => this.dropFinish());
        this.scope = new SegmentControl(this.scopeElement, {
            value: 'stretch',
            onChange: () => {
                this.redrawOverlays();
                this.renderPalette();
            }
        });
        this.paletteElement?.addEventListener('pointerleave', () => this.revertPreview());
        this.boundStagePointerLeave = () => {
            this.setOverlay(this.hover, null);
            this.parent.setBuildCursor(null);
        };
        this.parent?.parent?.canvas?.addEventListener('pointerdown', this.boundStagePointerDown, true);
        this.parent?.parent?.canvas?.addEventListener('pointermove', this.boundStagePointerMove, true);
        this.parent?.parent?.canvas?.addEventListener('pointerleave', this.boundStagePointerLeave);
        // Both outlines are absolutely positioned over wall pieces the builder
        // throws away and rebuilds — when a wall is painted, when it changes
        // height, when the presentation is lowered. Redrawing from the stored
        // target is what keeps the selection on the wall it belongs to instead
        // of leaving a rectangle hanging in the air.
        const events = this.parent?.parent?.eventManager;
        this.overlayUnsubscribers = [
            events?.on?.(EVENTS.WALL_GEOMETRY_CHANGED, () => this.redrawOverlays()),
            events?.on?.(EVENTS.WALL_PRESENTATION_CHANGED, () => this.redrawOverlays()),
            events?.on?.(EVENTS.SURFACE_FINISH_CHANGED, () => this.redrawOverlays())
        ];
    }

    get gameMap() {
        return this.parent?.parent?.gameMap || null;
    }

    handleToolModeChanged(mode) {
        const active = mode === UIToolModes.SURFACE;
        document.body.classList.toggle('customize-mode', active);
        this.parent.setBuildCursor(null);
        this.dropFinish();
        this.buttonElement?.classList.toggle('active', active);
        this.revertPreview();
        this.setOverlay(this.hover, null);
        this.setTarget(null);
        this.renderPalette();
        // The panel opens with the mode, not with the first click: entering a
        // mode that says nothing and shows nothing reads as "nothing happened".
        if (active) {
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

    get rules() {
        return this.parent?.parent?.buildRules || null;
    }

    /**
     * Tints exactly the surfaces a click would repaint.
     *
     * The overlay is keyed on the SURFACE under the pointer, not the piece: one
     * wall piece can show two rooms' paint at once — a corner post is split
     * down the middle — so crossing that seam is a new target even though the
     * piece has not changed.
     */
    handleStagePointerMove(event) {
        if (!this.parent.isTool(UIToolModes.SURFACE)) return;
        const target = this.resolveTarget(event);
        this.setOverlay(this.hover, target);
        // Surface is the one build tool where "is there anything here" is a real
        // question — most of a wall is air, and a vertical run is not a paint
        // target at all. Saying so under the cursor is cheaper than clicking to
        // find out.
        this.parent.setBuildCursor(
            !target ? null : (this.checkTarget(target).allowed ? 'ready' : 'refused')
        );
    }

    /**
     * The hover tint and the selection outline are the same geometry drawn from
     * the same kind of target — a run of wall, or a room's floor — so they are
     * one renderer with two slots and two class names. Only the styling
     * differs: hover says "this is what you would get", selection says "this is
     * what you are editing", and both are on screen at once while you move
     * around a room you have already picked.
     */
    setOverlay(slot, target, { force = false } = {}) {
        const key = SurfaceCustomizePanel.targetKey(target);
        if (key === slot.key && !force) return;

        this.clearOverlay(slot);
        if (!target) return;
        slot.elements = target.surface === 'wall'
            ? this.createWallOverlay(target.wallSurface, slot.className)
            : [this.createFloorOverlay(target.room, slot.className)].filter(Boolean);
        slot.key = slot.elements.length > 0 ? key : null;
    }

    static targetKey(target) {
        if (!target) return null;
        return target.surface === 'wall'
            ? `wall:${target.wallSurface.cell.x},${target.wallSurface.cell.y},` +
                `${target.wallSurface.from}-${target.wallSurface.to}`
            : `floor:${target.room.id}`;
    }

    /**
     * One outline per run of adjacent surfaces. A stretch that ends in half a
     * corner post is not a rectangle, and a box drawn round it offered paint on
     * the other half — the half belonging to the room next door.
     */
    createWallOverlay(surface, className) {
        const builder = this.gameMap?.wallBuilder;
        const rects = builder?.getSurfaceRects(this.resolveWallScopeSurfaces(surface)) || [];
        return rects.map(rect => {
            const element = document.createElement('div');
            element.className = `surface-paint-overlay ${className}`;
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

    // Through the floor's own mask, not as a box over it — the two surfaces are
    // the same kind of selection and should not look like two different
    // features. A canvas cannot take a CSS border, so the outline the wall gets
    // from its class reads here as a heavier tint.
    createFloorOverlay(room, className) {
        return this.gameMap?.floorBuilder?.createRoomOverlay(room, {
            className: `surface-paint-overlay ${className}`,
            fill: SurfaceCustomizePanel.overlayFill(className)
        }) ?? null;
    }

    // A concrete rgba(), never color-mix(): this string is assigned to a canvas
    // 2D context's fillStyle (see FloorBuilder.createRoomOverlay), and Safari's
    // canvas colour parser rejects color-mix() — the assignment is silently
    // dropped, fillStyle stays at its default opaque black, and the whole room's
    // floor overlay paints black. `color-mix(in srgb, C p%, transparent)` is
    // just C at alpha p%, so the rgba() below is the same colour everywhere.
    static overlayFill(className) {
        const accent = getComputedStyle(document.documentElement)
            .getPropertyValue('--state-info-accent').trim();
        const parts = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(accent);
        const [r, g, b] = parts
            ? [parseInt(parts[1], 16), parseInt(parts[2], 16), parseInt(parts[3], 16)]
            : [66, 133, 244];
        return `rgba(${r}, ${g}, ${b}, ${className === 'paint-selection' ? 0.34 : 0.22})`;
    }

    /**
     * What the pointer is over: a paintable wall, else the room it stands in.
     *
     * Walls are resolved from the element because their art rises above the
     * cell they occupy — the cursor on a visible wall is nowhere near that
     * wall's own tile. Floors are the opposite: resolved from world
     * coordinates, because the floor canvas is a bounding box with bleed, so
     * hit-testing it would claim ground belonging to the room next door.
     */
    resolveTarget(event) {
        const piece = this.resolveWallPiece(event);
        if (piece) {
            // Which surface of the piece, not merely which piece: a corner post
            // shows two rooms' paint at once, split down the middle, so the
            // pixel under the cursor is what decides.
            const surface = this.gameMap?.wallBuilder?.surfaceAtOffset(piece, event.offsetX);
            if (surface) return { surface: 'wall', wallSurface: surface, piece };
        }
        const room = this.resolveRoomAt(event);
        return room ? { surface: 'floor', room } : null;
    }

    /**
     * The wall piece under the pointer, if it is one that can be painted.
     *
     * A piece's element is the bounding box of art that leans back off the cell
     * it stands on, so with the walls lowered most of that box is transparent
     * air hanging over the floor behind it — and the box, not the art, was
     * catching every click. The alpha test asks whether the pointer is on the
     * wall you can actually see; anywhere else falls through to the floor.
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

    clearOverlay(slot) {
        for (const element of slot.elements) element.remove();
        slot.elements = [];
        slot.key = null;
    }

    /**
     * What is selected, and the outline that says so. The panel names the room
     * and the face, but a name is not an answer to "which of these four walls
     * am I about to paint" — the outline is, and until there was one the only
     * mark on the map was the hover tint, which is under your cursor and
     * therefore never on the thing you picked a moment ago.
     */
    setTarget(target) {
        this.target = target;
        this.setOverlay(this.selection, target);
    }

    /** Open Surface with one of a room's surfaces already in hand. */
    openRoomSurface(roomId, surface = 'floor') {
        const room = this.gameMap?.regionManager?.get('room', roomId);
        if (!room || !this.parent?.changeToolMode(UIToolModes.SURFACE)) return false;
        let target = { surface: 'floor', room };
        if (surface === 'wall') {
            const builder = this.gameMap?.wallBuilder;
            let wallSurface = null;
            for (const cell of builder?.cells?.values?.() ?? []) {
                wallSurface = builder.getCellSurfaces(cell).find(entry =>
                    entry.axis === 'horizontal' && entry.roomId === roomId
                );
                if (wallSurface) break;
            }
            if (!wallSurface) {
                this.parent.showMessage('This room has no wall surface to finish yet.', 'info', 'Surfaces');
                return false;
            }
            target = {
                surface: 'wall',
                wallSurface,
                piece: builder.findPieceForCell(wallSurface.cell.x, wallSurface.cell.y)
            };
        }
        this.setTarget(target);
        this.renderPalette();
        this.open();
        return true;
    }

    // The elements were parented to art that has since been rebuilt, so both
    // slots are drawn again from scratch rather than moved.
    redrawOverlays() {
        if (!this.parent.isTool(UIToolModes.SURFACE)) return;
        this.setOverlay(this.selection, this.target, { force: true });
        this.setOverlay(this.hover, null);
    }

    handleStagePointerDown(event) {
        if (!this.parent.isTool(UIToolModes.SURFACE)) return;
        // Resolved before the event is claimed: a vertical run is not a paint
        // target, so clicking one has to fall through to whatever is under it
        // rather than being swallowed into a no-op.
        const target = this.resolveTarget(event);
        if (!target) {
            // "Not that one" — the same answer clicking bare map gives a
            // selected object (see ContainerInputManager.setupClickHandling).
            // The click still falls through unclaimed; only the selection goes.
            this.clearTargetFromStageClick(event);
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        this.setTarget(target);
        // Alt-click takes the finish that is already here, to put on something
        // else. It used to say "Picked up wallpaper blue flower" and then hold
        // nothing at all - the sample went into a message and the only way to
        // use it was to find that same swatch in the list by hand. Now the
        // panel actually holds it, and says what to do with it.
        if (event.altKey) {
            this.renderPalette();
            this.holdFinish(this.getCurrentFinishId(), target.surface);
            return;
        }
        // Holding one: this click is the second half of the eyedropper.
        if (this.held) {
            this.renderPalette();
            this.paintWithHeld();
            return;
        }
        this.renderPalette();
        this.open();
    }

    /**
     * Clicking nothing paintable drops the selection — but only when the click
     * was on the world. The listener sits on the canvas in capture, so panel
     * chrome drawn over the stage would otherwise deselect the very surface the
     * player is reaching into the panel to repaint.
     *
     * What is held in hand survives: the eyedropper is a separate piece of
     * state with its own way out (the Drop button, Escape), and losing a sample
     * because of a stray click is the annoying half of a one-shot tool.
     */
    clearTargetFromStageClick(event) {
        if (!this.target) return;
        const element = event.target;
        if (element instanceof Element && element.closest(InputComponent.UI_SELECTOR)) return;

        this.setTarget(null);
        this.renderPalette();
    }

    // -- The eyedropper -------------------------------------------------------

    /**
     * Take the finish off a surface and keep it, so the next click can put it
     * somewhere else.
     *
     * It stays in hand across several clicks rather than firing once: "make
     * these four walls match that one" is the whole reason to sample anything,
     * and a one-shot would mean alt-clicking the same wall four times over.
     * There is always a way out on screen and on Escape, which is what keeps
     * holding something from being a mode you can get stuck in.
     */
    holdFinish(finishId, surface) {
        if (!finishId || !surface) return false;
        this.held = { finishId, surface };
        this.renderHeld();
        this.parent.showMessage(
            `Holding ${this.finishLabel(finishId, surface)}. Click a ${surface === 'floor' ? 'floor' : 'wall'} to paint it.`,
            'info', 'Eyedropper'
        );
        return true;
    }

    /** @returns {boolean} Whether anything was actually being held. */
    dropFinish() {
        if (!this.held) return false;
        this.held = null;
        this.renderHeld();
        return true;
    }

    /**
     * A floor finish does not go on a wall, and the two registries do not even
     * list the same names - so the mismatch is worth saying out loud rather
     * than painting something surprising or quietly doing nothing.
     */
    paintWithHeld() {
        if (!this.held || !this.target) return false;
        if (this.target.surface !== this.held.surface) {
            this.parent.showMessage(
                `That is a ${this.held.surface} finish - it only goes on ${this.held.surface}s.`,
                'warning', 'Eyedropper'
            );
            return false;
        }
        return this.applyFinish(this.held.finishId);
    }

    finishLabel(finishId, surface) {
        const finishes = this.gameMap?.surfaceCustomizer?.listFinishes(surface) || [];
        const finish = finishes.find(entry => entry.id === finishId);
        return finish?.displayName || finish?.name || String(finishId).replaceAll('_', ' ');
    }

    renderHeld() {
        document.body.classList.toggle('surface-holding', !!this.held);
        if (this.heldGroup) this.heldGroup.hidden = !this.held;
        if (!this.held) return;
        if (this.heldName) this.heldName.textContent = this.finishLabel(this.held.finishId, this.held.surface);
        const context = this.heldSample?.getContext?.('2d');
        if (!context) return;
        context.clearRect(0, 0, this.heldSample.width, this.heldSample.height);
        const source = this.getFinishSample(this.held.finishId, this.held.surface);
        if (!source) return;
        context.imageSmoothingEnabled = false;
        context.drawImage(source, 0, 0, source.width, source.height, 0, 0, this.heldSample.width, this.heldSample.height);
    }

    // Whether the current target may actually be repainted; the answer is
    // shown on the target line and disables the palette.
    checkTarget(target = this.target) {
        if (!target) return BuildRules.deny('Nothing selected.');
        return target.surface === 'floor'
            ? this.rules?.canPaintRoomFloor(target.room) ?? BuildRules.ALLOWED
            : this.rules?.canPaintWallFace(target.wallSurface.cell) ?? BuildRules.ALLOWED;
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

    // The room the current target belongs to, or null out in the corridor of
    // wall that belongs to nothing.
    targetRoom() {
        if (!this.target) return null;
        if (this.target.surface === 'floor') return this.target.room;
        const roomId = this.target.wallSurface.roomId;
        return roomId ? this.gameMap?.regionManager?.get('room', roomId) : null;
    }

    /**
     * Two tools, one room, and no way across.
     *
     * Surface answers "what is this made of" and Rooms answers "what is this" —
     * a floor's finish belongs to the room, so the room named on this line is
     * very often the thing you actually wanted to rename or resize. Rather than
     * grow a second copy of the room controls in here, the room name is a way
     * to get to the panel that owns them, with the room already picked.
     */
    openTargetRoom() {
        const room = this.targetRoom();
        if (!room) return;
        const rooms = this.parent?.roomPanel;
        if (!this.parent?.changeToolMode(UIToolModes.ROOM)) return;
        rooms?.select?.(room.id);
    }


    renderTarget() {
        const { room, surface, locked } = this.describeTarget();
        if (this.targetRoomElement) this.targetRoomElement.textContent = room;
        if (this.targetSurfaceElement) this.targetSurfaceElement.textContent = surface;
        const targetRoom = this.targetRoom();
        if (this.targetRoomLink) {
            this.targetRoomLink.hidden = !targetRoom;
            if (targetRoom) {
                this.targetRoomLink.setAttribute('aria-label', `Open ${this.roomName(targetRoom)} in Room Areas`);
            }
        }
        if (this.targetSampleButton) this.targetSampleButton.hidden = !this.target || !this.getCurrentFinishId();
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

    getOpenSpaceRooms(surface = this.target?.wallSurface) {
        const room = surface?.roomId
            ? this.gameMap?.regionManager?.get('room', surface.roomId)
            : null;
        const openSpaceId = room?.properties?.openSpaceId;
        if (!openSpaceId) return room ? [room] : [];
        return (this.gameMap?.regionManager?.all('room') || []).filter(entry =>
            entry.properties?.openSpaceId === openSpaceId
        );
    }

    resolveWallScopeSurfaces(surface = this.target?.wallSurface, scope = this.getWallScope()) {
        const builder = this.gameMap?.wallBuilder;
        if (!builder || !surface) return [];
        if (scope === 'room' && surface.roomId) {
            return [...builder.cells.values()].flatMap(cell =>
                builder.getCellSurfaces(cell).filter(entry => entry.roomId === surface.roomId));
        }
        if (scope === 'space' && surface.roomId) {
            const roomIds = new Set(this.getOpenSpaceRooms(surface).map(room => room.id));
            return [...builder.cells.values()].flatMap(cell =>
                builder.getCellSurfaces(cell).filter(entry => roomIds.has(entry.roomId)));
        }
        if (scope === 'exterior' && !surface.roomId) {
            const topology = this.gameMap?.buildingTopology;
            const component = topology?.getComponentAtWallFace(surface.cell);
            const loopId = topology?.getExteriorLoopAtSurface(surface);
            return component && loopId !== null
                ? topology.getExteriorSurfaces(component.id).filter(entry =>
                    this.rules?.canPaintWallFace(entry.cell).allowed !== false)
                : [];
        }
        return builder.getPaintStretchSurfaces(surface);
    }

    buildRequests(finishId, scopeOverride = null) {
        if (!this.target) return [];
        if (this.target.surface === 'floor') {
            return [{ surface: 'floor', roomId: this.target.room.id, finishId }];
        }

        const builder = this.gameMap.wallBuilder;
        const surface = this.target.wallSurface;

        const scope = scopeOverride || this.getWallScope();
        if (scope === 'exterior') {
            return this.resolveWallScopeSurfaces(surface, scope).map(entry => ({
                surface: 'wall',
                face: entry.face,
                axis: entry.axis,
                cells: { from: [entry.cell.x, entry.cell.y], to: [entry.cell.x, entry.cell.y] },
                roomId: null,
                finishId
            }));
        }

        if (scope === 'space') {
            return this.getOpenSpaceRooms(surface).map(room => ({
                surface: 'wall',
                roomId: room.id,
                finishId
            }));
        }

        if (scope !== 'room') {
            // Exactly the surfaces the overlay outlined: same call, same room
            // test, same stopping rule. Deriving the painted set separately
            // from the previewed one is what let a click outline one wall and
            // repaint another.
            return builder.getPaintStretchSurfaces(surface).map(entry => ({
                surface: 'wall',
                face: entry.face,
                axis: entry.axis,
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
        const scopeHidden = this.target?.surface !== 'wall';
        this.scopeElement.hidden = scopeHidden;
        if (this.scopeTitle) this.scopeTitle.hidden = scopeHidden;
        this.renderScopeChoices();
        this.emptyElement.hidden = !!this.target;
        // An empty Finish heading over an empty box reads as something that
        // failed to load. With nothing picked there is no finish to choose, so
        // the whole group stands down and the panel is just its prompt.
        if (this.finishGroup) this.finishGroup.hidden = !this.target;
        if (this.finishTitle && this.target) {
            this.finishTitle.textContent = this.target.surface === 'floor' ? 'Floor finish' : 'Wall finish';
        }
        if (!this.target) return;

        const verdict = this.checkTarget();
        this.paletteElement.classList.toggle('is-locked', !verdict.allowed);
        document.body.classList.toggle('build-target-locked', !verdict.allowed);
        if (!verdict.allowed) {
            // Persistent: this is not help you can decline, it is the reason the
            // palette below it is empty.
            this.paletteElement.appendChild(
                HintNotes.create(verdict.reason, { variant: 'persistent' })
            );
            this.warnLockedOnce(verdict.reason);
            return;
        }


        const customizer = this.gameMap?.surfaceCustomizer;
        const finishes = customizer?.listFinishes(this.target.surface) || [];
        if (this.target.surface === 'floor') {
            finishes.unshift({ id: null, displayName: 'None', empty: true });
        }
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
            sample.classList.toggle('is-empty', finish.empty === true);
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
                    customizer.preview(this.buildRequests(finish.id || null));
                }, 150);
            });
            button.addEventListener('pointerleave', () => clearTimeout(this.hoverTimer));
            // Choosing from the list is choosing a different finish, which is
            // the plainest way of saying you are done with the one in hand.
            button.addEventListener('click', () => {
                this.dropFinish();
                this.applyFinish(finish.id || null);
            });
            // Double-click paints the whole room without touching the scope
            // radio - the scope machinery already understands the request.
            button.addEventListener('dblclick', () => this.applyFinish(finish.id || null, 'room'));
            this.paletteElement.appendChild(button);
        }
    }

    renderScopeChoices() {
        if (!this.scopeElement) return;
        const wall = this.target?.surface === 'wall' ? this.target.wallSurface : null;
        const roomButton = this.scopeElement.querySelector('[data-value="room"]');
        const spaceButton = this.scopeElement.querySelector('[data-value="space"]');
        const exteriorButton = this.scopeElement.querySelector('[data-value="exterior"]');
        const topology = this.gameMap?.buildingTopology;
        const openSpaceRooms = wall?.roomId ? this.getOpenSpaceRooms(wall) : [];
        const spaceAvailable = openSpaceRooms.length > 1;
        const exteriorAvailable = !!wall && !wall.roomId &&
            !!topology?.getComponentAtWallFace(wall.cell) &&
            topology.getExteriorLoopAtSurface(wall) !== null;
        if (roomButton) roomButton.hidden = !wall?.roomId;
        if (spaceButton) spaceButton.hidden = !spaceAvailable;
        if (exteriorButton) exteriorButton.hidden = !exteriorAvailable;
        const allowed = wall?.roomId ? ['stretch', 'room', ...(spaceAvailable ? ['space'] : [])] :
            exteriorAvailable ? ['stretch', 'exterior'] : ['stretch'];
        if (!allowed.includes(this.getWallScope())) this.scope?.select?.('stretch');
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
            const { cell, face, from, to } = this.target.wallSurface;
            const builder = this.gameMap?.wallBuilder;
            this.target.piece = builder?.findPieceForCell(cell.x, cell.y) || this.target.piece;
            // The cell object is rebuilt too, and the stale one still carries
            // the finish from before the paint — which the palette would go on
            // showing as the current colour. Found by the slice it covers, not
            // by its face name: a junction draws up to four of them and two can
            // answer to the same face.
            const surfaces = builder?.getCellSurfaces(builder.cells.get(`${cell.x},${cell.y}`)) || [];
            this.target.wallSurface = surfaces.find(entry => entry.from === from && entry.to === to) ||
                surfaces.find(entry => entry.face === face) || this.target.wallSurface;
        }
        this.redrawOverlays();
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

    getFinishSample(finishId, surface = this.target?.surface) {
        if (surface === 'floor') return this.gameMap.floorMaterialRegistry?.getTile(finishId);
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
        this.clearOverlay(this.hover);
        this.clearOverlay(this.selection);
        this.overlayUnsubscribers?.forEach(unsubscribe => unsubscribe?.());
        this.overlayUnsubscribers = [];
        document.body.classList.remove('build-target-locked');
        this.parent?.setBuildCursor(null);
        this.scope?.dispose();
        this.scope = null;
        this.parent?.parent?.canvas?.removeEventListener('pointerdown', this.boundStagePointerDown, true);
        this.parent?.parent?.canvas?.removeEventListener('pointermove', this.boundStagePointerMove, true);
        this.parent?.parent?.canvas?.removeEventListener('pointerleave', this.boundStagePointerLeave);
        document.body.classList.remove('customize-mode');
        super.dispose();
    }
}
