class WallRenderer {
    resolveFinishOverride(x, y, face, roomId = undefined, half = null) {
        const buildDocument = this.previewDocument || this.gameMap?.buildDocument;
        return buildDocument && (half === 0 || half === 1)
            ? buildDocument.level().atoms.get(BuildKeys.atom(x, y, face, half))?.finishId || null
            : null;
    }

    getPaintSpans(cell) {
        const cache = this.previewCache || this.gameMap?.buildTransaction?.cache;
        const spans = cache?.geometry?.paintSpans?.get(BuildKeys.cell(cell.x, cell.y)) || [];
        const topology = cache ? { ...cache.topology, walls: cache.geometry } : null;
        if (!cache || !topology) return [];
        return spans.map(span => {
            const { atom, classification } = WallFaceResolver.visibleSurface(
                { x: cell.x, y: cell.y, kind: span.kind, half: span.half },
                cache.grid,
                topology,
                cache.geometry
            );
            if (classification.kind === 'buried') return null;
            const roomId = classification.kind === 'room' ? classification.roomId : null;
            return {
                ...span,
                face: atom.face,
                half: atom.half,
                axis: span.kind === 'horizontal-band' ? 'horizontal' : 'vertical',
                roomId,
                finishId: this.resolveSurfaceFinishId(cell, atom.face, roomId, atom.half)
            };
        }).filter(Boolean);
    }

    resolveSurfaceFinishId(cell, face, roomId, half = null) {
        const explicit = this.resolveFinishOverride(cell.x, cell.y, face, roomId ?? null, half);
        if (explicit) return explicit;
        const document = this.previewDocument || this.gameMap?.buildDocument;
        const roomFinish = roomId ? document?.level?.().rooms.get(roomId)?.wallFinishId : null;
        const exterior = !roomId && cell.buildingId
            ? document?.buildings?.get(cell.buildingId)?.exteriorFinishId
            : null;
        return roomFinish || exterior || this.wallData.defaults.finishId;
    }

    generatePieces() {
        const cache = this.previewCache || this.gameMap?.buildTransaction?.cache;
        const geometry = cache?.geometry || WallGeometry.compute(this.cells, {
            cellSize: this.cellSize,
            constructions: this.registry.constructions
        });
        return geometry.pieces.map(source => ({
            ...source,
            cells: source.cells.map(key => ({
                ...this.cells.get(key),
                mask: geometry.masks.get(key) || 0
            })),
            element: null,
            faces: null,
            cutStates: this.createCutStates(source.cells.length)
        }));
    }

    isPaintable(piece) {
        return (piece?.cells ?? []).some(cell =>
            this.getCellSurfaces(cell).some(surface => surface.axis === 'horizontal')
        );
    }

    getCellSurfaces(cell) {
        if (!cell) return [];
        const mask = Number.isFinite(cell.mask) ? cell.mask : this.computeMask(cell);
        const built = Number.isFinite(cell.mask) ? cell : { ...cell, mask };
        return this.getPaintSpans(built).map(span => ({
            cell: built,
            face: span.face,
            half: span.half,
            from: span.from,
            to: span.to,
            axis: span.axis,
            roomId: span.roomId ?? null,
            finishId: span.finishId
        }));
    }

    surfaceAtOffset(piece, offsetX) {
        const construction = this.registry.getConstruction(piece?.constructionId);
        if (!construction || !(offsetX >= 0)) return null;
        const index = Math.floor(offsetX / construction.cellSize);
        const cell = piece.cells[index];
        if (!cell) return null;
        const local = offsetX - (index * construction.cellSize);
        const covering = this.getCellSurfaces(cell).filter(surface =>
            surface.axis === 'horizontal' && local >= surface.from && local < surface.to
        );
        return covering[covering.length - 1] || null;
    }

    getPaintStretchSurfaces(surface) {
        if (!surface?.cell) return [];
        const collected = new Map();
        const take = cell => {
            const matches = this.getCellSurfaces(cell).filter(entry => entry.roomId === surface.roomId);
            // Keyed on the span, not the face: an exterior half follows the face
            // opposite it, so one face can own both halves of a cell and keying
            // on the name alone would drop one of them from the outline.
            for (const match of matches) collected.set(`${cell.x},${cell.y},${match.from},${match.to}`, match);
            return matches.length > 0;
        };
        if (!take(surface.cell)) return [];

        for (const direction of [-1, 1]) {
            // A cell the walk passes with nothing facing this room contributes
            // nothing and still lets the walk through: that is the far side of
            // a shared wall, or the stretch of run belonging to the room next
            // door, and the wall carries on past it.
            let cell = surface.cell;
            for (;;) {
                const next = this.stepAlongRun(cell, surface.axis, direction);
                if (!next) break;
                take(next);
                cell = next;
            }
        }
        return [...collected.values()];
    }

    stepAlongRun(cell, axis, direction) {
        const horizontal = axis === 'horizontal';
        const mask = Number.isFinite(cell.mask) ? cell.mask : this.computeMask(cell);
        const forward = horizontal
            ? (direction > 0 ? WallBuilder.MASK_EAST : WallBuilder.MASK_WEST)
            : (direction > 0 ? WallBuilder.MASK_SOUTH : WallBuilder.MASK_NORTH);
        if (!(mask & forward)) return null;
        return this.cells.get(
            `${cell.x + (horizontal ? direction : 0)},${cell.y + (horizontal ? 0 : direction)}`
        ) || null;
    }

    getSurfaceRects(surfaces) {
        const rects = [];
        for (const surface of surfaces) {
            const piece = this.findPieceForCell(surface.cell.x, surface.cell.y);
            const element = piece?.element;
            const construction = this.registry.getConstruction(piece?.constructionId);
            if (!element || element.hidden || !construction) continue;
            const index = piece.cells.findIndex(cell => cell.x === surface.cell.x && cell.y === surface.cell.y);
            if (index < 0) continue;
            rects.push({
                left: element.offsetLeft + (index * construction.cellSize) + surface.from,
                top: element.offsetTop,
                width: surface.to - surface.from,
                height: element.offsetHeight,
                zIndex: (Number(element.style.zIndex) || 0) + 1
            });
        }
        return WallBuilder.mergeRects(rects);
    }

    static mergeRects(rects) {
        const groups = [];
        for (const rect of rects) {
            const bounds = {
                left: rect.left, top: rect.top,
                right: rect.left + rect.width, bottom: rect.top + rect.height,
                zIndex: rect.zIndex
            };
            // Absorb every group this rectangle reaches, so two groups joined by
            // a late arrival end up as one and not as two overlapping outlines.
            for (let index = groups.length - 1; index >= 0; index--) {
                if (!WallBuilder.rectsTouch(groups[index], bounds)) continue;
                const [merged] = groups.splice(index, 1);
                bounds.left = Math.min(bounds.left, merged.left);
                bounds.top = Math.min(bounds.top, merged.top);
                bounds.right = Math.max(bounds.right, merged.right);
                bounds.bottom = Math.max(bounds.bottom, merged.bottom);
                bounds.zIndex = Math.max(bounds.zIndex, merged.zIndex);
            }
            groups.push(bounds);
        }
        return groups.map(group => ({
            left: group.left,
            top: group.top,
            width: group.right - group.left,
            height: group.bottom - group.top,
            zIndex: group.zIndex
        }));
    }

    static rectsTouch(a, b) {
        const slack = 0.5;
        return a.left <= b.right + slack && b.left <= a.right + slack &&
            a.top <= b.bottom + slack && b.top <= a.bottom + slack;
    }

    rebuild() {
        this.rebuilds++;
        for (const decoration of this.decorations) {
            this.gameMap.container?.attachments?.detach?.(decoration);
            decoration.dispose();
        }
        this.decorations = [];
        for (const piece of this.pieces) piece.element?.remove();
        this.pieces = this.generatePieces();
        this._pieceByCell = new Map(this.pieces.flatMap(piece =>
            piece.cells.map(cell => [`${cell.x},${cell.y}`, piece])
        ));
        // Run membership is derived from the piece graph that was just thrown
        // away; keeping the old answers would raise wall on pieces that no
        // longer exist and miss the ones that replaced them.
        this._runPieceIds.clear();
        for (const piece of this.pieces) this.createPiece(piece);
        this.createAuthoredAttachments(this.wallData.attachments || []);
        this.rebindFixtureObjects();
        this.enforceNodeBudget();
        // Geometry changed, so there is no animation to preserve: settle the
        // height field immediately instead of sweeping every wall down again.
        this.evaluateCutaway(true);
        this.invalidateFlatTiles();
    }

    invalidate(dirtyCells = [], { geometryChanged = true, recordsChanged = null } = {}) {
        if (!geometryChanged) {
            if (recordsChanged && Object.values(recordsChanged).some(Boolean)) {
                this.syncBuildDocumentRecords();
                if (recordsChanged.openings) {
                    this.reindexOpenings();
                    for (const key of dirtyCells) {
                        const { x, y } = BuildKeys.parseCell(key);
                        const piece = this.findPieceForCell(x, y);
                        if (!piece) continue;
                        const index = piece.cells.findIndex(cell => BuildKeys.cell(cell.x, cell.y) === key);
                        if (index >= 0 && this.cells.has(key)) piece.cells[index] = {
                            ...this.cells.get(key),
                            mask: piece.cells[index].mask,
                            faces: piece.cells[index].faces
                        };
                    }
                }
            }
            const pieces = new Set(dirtyCells.map(key => {
                const { x, y } = BuildKeys.parseCell(key);
                return this.findPieceForCell(x, y);
            }).filter(Boolean));
            for (const piece of pieces) this.renderPiece(piece);
            if (recordsChanged?.fixtures) this.rebindFixtureObjects();
            if (pieces.size) this.invalidateFlatTiles();
            return pieces.size;
        }
        // Geometry changed: the walls are rebuilt from the document, and so is
        // everything hanging on them. Undo of a move replays the records back
        // to where they were, but a door is also a map object standing at a
        // position of its own — without this the walls travelled home and left
        // their doors, windows and paintings behind at the far end.
        this.syncBuildDocumentRecords();
        this.reindexOpenings();
        this.rebuild();
        this.rebindOpeningObjects(this.openings.map(opening => opening.id));
        this.rebindFixtureObjects();
        return this.pieces.length;
    }

    createPiece(piece) {
        const canvas = document.createElement('canvas');
        canvas.className = 'wall-piece';
        canvas.dataset.wallPieceId = piece.id;
        canvas.dataset.wallMasks = piece.cells.map(cell => cell.mask).join(',');
        const opening = piece.cells.find(cell => cell.opening)?.opening;
        if (opening) canvas.dataset.wallOpening = opening.type;
        canvas.style.left = `${piece.x * this.cellSize}px`;
        canvas.style.zIndex = String(this.gameMap.getDepthZIndex(piece.baseline));
        this.layer.appendChild(canvas);
        piece.element = canvas;
        piece.faces = Object.fromEntries(WallMaterialRegistry.DIRECTIONS.map(direction => [
            direction,
            new WallFaceSurface(this, piece, direction)
        ]));
    }

    renderPiece(piece) {
        this.piecesRedrawn++;
        const canvas = piece.element;

        // 'hidden' is purely a view mode — collision, line of sight and room
        // topology stay exactly as they are, only the art stops drawing.
        if (this.presentation === 'hidden') {
            canvas.hidden = true;
            piece.hitRegions = [];
            this.propagateCutLine(piece, { mode: 'hidden', states: [] });
            return;
        }
        canvas.hidden = false;

        const construction = this.registry.getConstruction(piece.constructionId);
        const plan = this.getRenderPlan(piece, construction);

        // Every frame band is the same height and is anchored on the cell's
        // south edge, so the canvas never resizes and rendering is a straight
        // blit per cell — no height arithmetic anywhere in the draw path.
        canvas.width = piece.cells.length * construction.cellSize;
        canvas.height = construction.frameHeight;
        canvas.style.width = `${canvas.width}px`;
        canvas.style.height = `${canvas.height}px`;
        canvas.style.top = `${piece.baseline - 1 - construction.baselineRow}px`;
        canvas.dataset.wallMode = plan.mode;
        // Read back as well as drawn: the paint tool alpha-tests this canvas on
        // every pointer move to find the wall under the cursor. Context options
        // are fixed at creation, so the flag has to be set by whoever asks
        // first — which is always this, since nothing can be sampled before it
        // has been drawn.
        const context = canvas.getContext('2d');
        context.imageSmoothingEnabled = false;

        piece.cells.forEach((cell, index) => {
            const x = index * construction.cellSize;
            this.drawWallFrame(context, piece, cell, x, plan.states[index], construction);
            this.applyOpeningAperture(context, cell, x, construction);
        });

        this.publishHitRegions(piece, plan, construction);

        this.propagateCutLine(piece, plan);
    }

    publishHitRegions(piece, plan, construction) {
        piece.hitRegions = [];
        if (plan.mode === 'hidden') return piece.hitRegions;
        const baseline = construction.baselineRow + 1;
        piece.cells.forEach((cell, index) => {
            const state = plan.states[index];
            for (const surface of this.getCellSurfaces(cell)) {
                const fullHalf = state === 'rampDown' ? surface.half === 0
                    : state === 'rampUp' ? surface.half === 1
                        : state === 'full';
                const height = fullHalf ? construction.height : construction.stubHeight;
                const vertical = WallBuilder.isVerticalMask(cell.mask);
                const capDepth = construction.thickness * (!fullHalf && vertical ? 2 : 1);
                piece.hitRegions.push({
                    left: (index * construction.cellSize) + surface.from,
                    right: (index * construction.cellSize) + surface.to,
                    top: Math.max(0, baseline - height - capDepth - 1),
                    bottom: vertical ? construction.frameHeight : baseline,
                    surface,
                    holes: this.hitHolesForCell(cell, index, construction)
                });
            }
        });
        return piece.hitRegions;
    }

    hitHolesForCell(cell, index, construction) {
        const opening = cell.opening;
        if (!opening) return [];
        const openingHeight = Utility.clamp(Number(opening.openingHeight) || 0, 0, construction.height);
        const sillHeight = Utility.clamp(Number(opening.sillHeight) || 0, 0, construction.height - openingHeight);
        const insets = this.getApertureInsets(opening);
        const bottom = construction.baselineRow + 1 - sillHeight - insets.bottom;
        const top = bottom - (openingHeight - insets.bottom - insets.top);
        const horizontal = opening.axis !== 'vertical';
        const left = (index * construction.cellSize) + (horizontal && opening.isStart ? insets.left : 0);
        const right = ((index + 1) * construction.cellSize) - (horizontal && opening.isEnd ? insets.right : 0);
        return right > left && bottom > top ? [{
            left,
            right,
            top,
            bottom: sillHeight > 0 ? bottom : construction.frameHeight
        }] : [];
    }

    hitTestPiece(piece, offsetX, offsetY) {
        return WallHitTest.hit(piece, offsetX, offsetY);
    }

    getStateHeight(state, construction) {
        return state === 'full' ? construction.height : construction.stubHeight;
    }

    renderMask(cell, state, construction) {
        let mask = cell.mask;
        const stateHeight = this.getStateHeight(state, construction);
        for (const direction of WallBuilder.DIRECTIONS) {
            if ((mask & direction.bit) === 0) continue;
            const neighbour = this.cells.get(`${cell.x + direction.dx},${cell.y + direction.dy}`);
            const opening = neighbour?.opening;
            if (!opening) continue;
            const sill = Number(opening.sillHeight) || 0;
            const openingHeight = Number(opening.openingHeight) || 0;
            if (sill <= 0 && openingHeight >= stateHeight) mask &= ~direction.bit;
        }
        return mask;
    }

    drawWallFrame(context, piece, cell, x, state, construction) {
        const frame = this.registry.getFrame(piece.constructionId, state);
        if (!frame) return;
        const mask = this.renderMask(cell, state, construction);
        const sourceX = construction.maskMap[mask] * construction.cellSize;
        context.drawImage(
            frame,
            sourceX, 0, construction.cellSize, construction.frameHeight,
            x, 0, construction.cellSize, construction.frameHeight
        );

        // The wall's top stays the construction's own colour in every state —
        // it is the one surface that reads as structure rather than surface,
        // and keeping it unpainted is what makes a run of caps read as one
        // continuous line around a room.
        //
        // Which slice of a cell the paint covers, and how the finish resolves at
        // a free end, is baked into the overlay by mask (see paintRegion), so
        // the renderer just lays the whole column down. The overlay indexes by
        // mask, not by maskMap: it answers a question about neighbours, where
        // the frame answers one about which art to reuse.
        const overlayX = mask * construction.cellSize;
        for (const span of this.getPaintSpans(cell, mask, construction)) {
            const overlay = this.registry.getFinishOverlay(piece.constructionId, span.finishId, state);
            if (!overlay || span.to <= span.from) continue;
            context.save();
            context.beginPath();
            context.rect(x + span.from, 0, span.to - span.from, construction.frameHeight);
            context.clip();
            context.drawImage(
                overlay,
                overlayX, 0, construction.cellSize, construction.frameHeight,
                x, 0, construction.cellSize, construction.frameHeight
            );
            context.restore();
        }
    }

    findPieceForCell(cellX, cellY) {
        return this._pieceByCell.get(`${cellX},${cellY}`) || null;
    }

    findPieceById(pieceId) {
        return this.pieces.find(piece => piece.id === pieceId) || null;
    }

    getLightBlockers() {
        const revision = this.gameMap?.buildTransaction?.revision || 0;
        if (this._lightBlockerCache?.revision === revision) return this._lightBlockerCache.blockers;
        const blockers = [...this.cells.values()]
            .filter(cell => !cell.opening && cell.blocksLineOfSight !== false)
            .map(cell => {
                const construction = this.registry.getConstruction(cell.constructionId);
                const inset = (this.cellSize - (construction?.thickness || this.cellSize)) / 2;
                const mask = this.computeMask(cell);
                const horizontal = WallBuilder.isHorizontalMask(mask);
                const vertical = WallBuilder.isVerticalMask(mask);
                const left = (cell.x * this.cellSize) + (horizontal ? 0 : inset);
                const right = ((cell.x + 1) * this.cellSize) - (horizontal ? 0 : inset);
                const top = (cell.y * this.cellSize) + (vertical ? 0 : inset);
                const bottom = ((cell.y + 1) * this.cellSize) - (vertical ? 0 : inset);
                return {
                    type: 'rect',
                    left, top, right, bottom,
                    width: right - left,
                    height: bottom - top
                };
            });
        this._lightBlockerCache = { revision, blockers };
        return blockers;
    }

    async createFlatOverlay() {
        this.disposeFlatOverlay();
        if (!this.atlas) return null;
        const layer = this.gameMap.layers.groundDecor || this.gameMap.layers.background;
        if (!layer) return null;

        const canvas = document.createElement('canvas');
        canvas.className = 'wall-tile-overlay';
        canvas.width = this.gameMap.dimensions.width;
        canvas.height = this.gameMap.dimensions.height;
        canvas.style.cssText = [
            'position:absolute', 'left:0', 'top:0',
            `width:${this.gameMap.dimensions.width}px`,
            `height:${this.gameMap.dimensions.height}px`,
            'pointer-events:none'
        ].join(';');
        layer.appendChild(canvas);
        this.flatCanvas = canvas;

        await this.atlas.loadImage(this.gameMap.core?.resourceManager || null);
        this._flatDirty = true;
        this.syncFlatOverlay();
        return canvas;
    }

    invalidateFlatTiles() {
        this._flatDirty = true;
        // Only the mode that shows this pays for redrawing it; every other mode
        // just carries the dirty flag until it is switched into.
        if (this.presentation === 'hidden') this.redrawFlatTiles();
    }

    syncFlatOverlay() {
        if (!this.flatCanvas) return;
        const visible = this.presentation === 'hidden';
        this.flatCanvas.hidden = !visible;
        if (visible) this.redrawFlatTiles();
    }

    redrawFlatTiles() {
        if (!this.flatCanvas || !this.atlas?.image || !this._flatDirty) return;
        const ctx = this.flatCanvas.getContext('2d');
        ctx.clearRect(0, 0, this.flatCanvas.width, this.flatCanvas.height);
        for (const cell of this.cells.values()) {
            this.atlas.drawCell(
                ctx,
                this.computeMask(cell),
                cell.x * this.cellSize,
                cell.y * this.cellSize
            );
        }
        this._flatDirty = false;
    }

    disposeFlatOverlay() {
        this.flatCanvas?.remove();
        this.flatCanvas = null;
    }

    enforceNodeBudget() {
        const nodes = this.pieces.length + this.decorations.length;
        this.generatedNodeCount = nodes;
        if (nodes > SiteConfig.wallSystem.maxGeneratedNodes) {
            throw new Error(`WallBuilder generated ${nodes} nodes; budget is ${SiteConfig.wallSystem.maxGeneratedNodes}`);
        }
    }
}
