class WallCutaway extends WallCutawayPlan {
    createCutStates(cellCount) {
        return Array.from({ length: cellCount }, () => ({ desired: false, cut: false, since: 0 }));
    }

    isCutawayBoundaryCell(cell, subjectRoomIds) {
        if (!WallBuilder.isHorizontalMask(cell.mask) || WallBuilder.isVerticalMask(cell.mask)) return false;
        if (subjectRoomIds.size === 0) return true;
        const northRoomId = this.getFaceRoomIdAt(cell.x, cell.y, 'north');
        const southRoomId = this.getFaceRoomIdAt(cell.x, cell.y, 'south');
        return this._cutawayRoomIds.has(northRoomId) &&
            subjectRoomIds.has(northRoomId) &&
            southRoomId !== northRoomId;
    }

    getSubjectBounds(subject) {
        const collider = subject.collider || {};
        const left = subject.posX + (collider.offsetX || 0);
        const top = subject.posY + (collider.offsetY || 0);
        return {
            left,
            right: left + (collider.width || subject.size?.width || 0),
            footY: top + (collider.height || subject.size?.height || 0)
        };
    }

    getCutawayEvaluationSubjects() {
        if (this.presentation !== 'cutaway' || this._movingOpeningIds.size > 0) return [];
        return this.getCutawaySubjects().map(subject => ({
            bounds: this.getSubjectBounds(subject),
            roomIds: new Set(this.getCutawayRoomIds(subject)),
            isCursor: subject.isCursor === true
        }));
    }

    getCutawaySubjects() {
        const subjects = [];
        const myte = this.gameMap.activeMyte ||
            this.gameMap.container?.mytes?.find(candidate => candidate.isActive);
        if (myte) subjects.push(myte);

        const cursor = this.getCursorCutawaySubject();
        if (cursor) subjects.push(cursor);
        return subjects;
    }

    static presentationNow() {
        return performance.now();
    }

    getCursorCutawaySubject() {
        const now = WallBuilder.presentationNow();
        if (now - this._cursorSubjectAt < WallBuilder.CURSOR_SUBJECT_TTL_MS) return this._cursorSubject;
        this._cursorSubjectAt = now;
        this._cursorSubject = this.resolveCursorCutawaySubject();
        return this._cursorSubject;
    }

    resolveCursorCutawaySubject() {
        const container = this.gameMap.container;
        // Player-facing toggle: some people want walls reacting to the cursor,
        // some find it noisy. SiteConfig only supplies the starting value.
        const enabled = container?.settings?.wallCursorCutaway ??
            SiteConfig.wallSystem.cursorCutawayEnabled;
        if (enabled !== true || container?.isMouseInContainer?.() !== true) return null;

        const point = container.inputHandler?.getMouseWorldPosition?.();
        if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return null;
        return {
            posX: point.x - 0.5,
            posY: point.y - 0.5,
            size: { width: 1, height: 1 },
            isCursor: true
        };
    }

    getCutawayPoint(subject) {
        if (!subject) return null;
        const collider = subject.collider || {};
        return {
            x: subject.posX + (collider.offsetX || 0) + ((collider.width || subject.size?.width || 0) / 2),
            y: subject.posY + (collider.offsetY || 0) + ((collider.height || subject.size?.height || 0) / 2)
        };
    }

    getCutawayRoomIds(subject) {
        const point = this.getCutawayPoint(subject);
        if (!point) return [];
        return this.expandToOpenSpace(
            this.gameMap.regionManager?.regionsAt(point.x, point.y, 'room') || []
        ).map(room => room.id);
    }

    expandToOpenSpace(rooms) {
        const spaces = new Set(rooms.map(room => room.properties?.openSpaceId).filter(Boolean));
        if (spaces.size === 0) return rooms;
        const expanded = new Set(rooms);
        for (const room of this.gameMap.regionManager?.all('room') || []) {
            if (spaces.has(room.properties?.openSpaceId)) expanded.add(room);
        }
        return [...expanded];
    }

    getCurrentCutawayRoomIds() {
        return [...new Set(this.getCutawaySubjects().flatMap(subject =>
            this.getCutawayRoomIds(subject)
        ))].sort();
    }

    commitCutawayRoom(render = false) {
        const roomIds = this.getCurrentCutawayRoomIds();
        this._cutawayRoomIds = new Set(roomIds);
        this._activeCutawayKey = roomIds.length > 0 ? `rooms:${roomIds.join(',')}` : 'rooms:none';
        this._pendingCutawayKey = null;
        if (render) this.evaluateCutaway();
    }

    containsPoint(piece, x, y) {
        const cellX = Math.floor(x / this.cellSize);
        const cellY = Math.floor(y / this.cellSize);
        return piece.cells.some(cell => cell.x === cellX && cell.y === cellY);
    }

    computeCutCells(piece, construction, subjects) {
        const config = SiteConfig.wallSystem;
        const cut = new Array(piece.cells.length).fill(false);
        if (subjects.length === 0) return cut;

        const pieceLeft = piece.x * this.cellSize;
        const padding = Math.max(0, config.cutawayPaddingCells) * this.cellSize;

        for (const { bounds, roomIds, isCursor } of subjects) {
            // Pointing at a wall is not a reason to erase it — you are usually
            // looking at what is mounted on it. The cursor only lowers walls it
            // is standing beyond.
            if (isCursor && this.containsPoint(piece, bounds.left, bounds.footY)) continue;
            // In front of the subject, and close enough that a full-height wall
            // would actually cover it on screen. Distant front walls stay up.
            if (piece.baseline <= bounds.footY) continue;
            if (piece.baseline - bounds.footY >= construction.height + config.occlusionMarginPx) continue;

            const left = bounds.left - padding;
            const right = bounds.right + padding;
            for (let index = 0; index < cut.length; index++) {
                if (cut[index] || !this.isCutawayBoundaryCell(piece.cells[index], roomIds)) continue;
                const cellLeft = pieceLeft + (index * this.cellSize);
                if (cellLeft + this.cellSize > left && cellLeft < right) cut[index] = true;
            }
        }
        return cut;
    }

    refreshCutawayTargets(immediate = false) {
        const now = WallBuilder.presentationNow();
        const subjects = this.getCutawayEvaluationSubjects();
        for (const piece of this.pieces) {
            const construction = this.registry.getConstruction(piece.constructionId);
            if (!construction) continue;
            const cut = this.computeCutCells(piece, construction, subjects);
            const standing = this.getForcedStandingCells(piece, cut.length);
            piece.cutStates.forEach((state, index) => {
                if (standing[index]) cut[index] = false;
                if (cut[index] !== state.desired) {
                    state.desired = cut[index];
                    state.since = now;
                }
                // Holding a cell up because of what is mounted on it is not an
                // occlusion change, so it does not wait out the raise delay —
                // the wall is already standing on screen by then anyway.
                if (immediate || standing[index]) state.cut = cut[index];
            });
        }
        this._lastEvaluateAt = now;
        this._subjectSignature = this.getSubjectSignature();
    }

    getSubjectSignature() {
        return this.getCutawaySubjects().map(subject => {
            const bounds = this.getSubjectBounds(subject);
            return [bounds.left, bounds.right, bounds.footY]
                .map(value => Math.floor(value / this.cellSize)).join(':');
        }).join('|');
    }

    tick() {
        if (this.presentation !== 'cutaway' || this.pieces.length === 0) return;
        const config = SiteConfig.wallSystem;
        const now = WallBuilder.presentationNow();
        // One throttled poll covers both the room commit and the occlusion
        // signature — each resolves the cursor subject, which forces a DOM
        // hit-test, so neither may run per-frame. The window advances even
        // when nothing changed; otherwise the signature check itself becomes
        // the per-frame cost the throttle exists to prevent.
        if (now - this._lastEvaluateAt >= config.cutawayEvaluateThrottleMs) {
            this._lastEvaluateAt = now;
            this.updateActiveRoom();
            if (this.getSubjectSignature() !== this._subjectSignature) {
                this.refreshCutawayTargets();
            }
        }
        // Commit every cell before drawing any piece. A room/material boundary
        // can split one structural run across canvases; drawing the first dirty
        // canvas while its neighbor still has yesterday's state leaves an
        // orphan transition behind. A changed height field therefore redraws
        // the complete set from one coherent snapshot.
        let dirty = false;
        for (const piece of this.pieces) {
            if (this.advancePiece(piece, now)) dirty = true;
        }
        if (dirty) {
            for (const piece of this.pieces) this.renderPiece(piece);
        }
    }

    advancePiece(piece, now) {
        const config = SiteConfig.wallSystem;
        let dirty = false;
        for (const state of piece.cutStates) {
            if (state.desired === state.cut) continue;
            const delay = state.desired ? config.cutawayLowerDelayMs : config.cutawayRaiseDelayMs;
            if (now - state.since < delay) continue;
            state.cut = state.desired;
            dirty = true;
        }
        return dirty;
    }

    getMovingSpansForRun(piece) {
        if (this._movingObjects.size === 0) return [];
        const run = this.getRunPieceIds(piece);
        const spans = [];
        for (const object of this._movingObjects.values()) {
            spans.push(...this.getMovingObjectRevealSpans(object).filter(span => run.has(span.piece.id)));
        }
        return spans;
    }

    getMountedSpansForRun(piece) {
        const run = this.getRunPieceIds(piece);
        const spans = [];

        for (const record of this.fixtures) {
            if (this._movingObjects.has(String(record.id))) continue;
            const object = this.gameMap.getObjectById?.(record.id);
            // Located by where the fixture actually hangs, never by the cell
            // recorded when it was placed: a later re-split of the run leaves
            // that cell pointing at a different piece, and the raise then
            // landed on a wall the painting is nowhere near.
            const span = object ? this.getFixtureSpan(object) : null;
            if (span && run.has(span.piece.id)) spans.push(span);
        }

        // Openings count too — a window is as much "something on this wall" as
        // a painting is. Doors are excluded by default: a cutaway is usually
        // looking into a room through the wall its door is in, and a standing
        // column at every door leaves nothing to cut.
        const keep = SiteConfig.wallSystem.cutawayKeepStandingOpenings || [];
        if (keep.length > 0) {
            for (const opening of this.openings) {
                if (!keep.includes(opening.type)) continue;
                if (this._movingOpeningIds.has(String(opening.id))) continue;
                const [cellX, cellY] = opening.cells?.[0] || [];
                const host = this.findPieceForCell(cellX, cellY);
                if (!host || !run.has(host.id)) continue;
                const bounds = this.getOpeningBounds(opening);
                spans.push({ piece: host, left: bounds.x, right: bounds.x + bounds.width });
            }
        }
        return spans;
    }

    getFixtureSpan(object) {
        const placement = this.getFixturePlacementCandidate(object);
        return placement ? {
            piece: placement.piece,
            left: placement.position.x,
            right: placement.position.x + object.size.width
        } : null;
    }

    getRunPieceIds(piece) {
        const cached = this._runPieceIds.get(piece.id);
        if (cached) return cached;
        const ids = new Set([piece.id]);
        for (const cell of this.getHorizontalCellChain(piece.cells[0])) {
            const host = this.findPieceForCell(cell.x, cell.y);
            if (host) ids.add(host.id);
        }
        this._runPieceIds.set(piece.id, ids);
        return ids;
    }

    getForcedStandingCells(piece, count = piece.cells.length) {
        const standing = new Array(count).fill(false);
        this.raiseSpans(piece, standing, this.getMovingSpansForRun(piece), true);
        if (this.presentation === 'cutaway') {
            this.raiseSpans(piece, standing, this.getMountedSpansForRun(piece), true);
        }
        return standing;
    }

    raiseSpans(piece, cut, spans, value = false) {
        if (spans.length === 0) return;
        const padding = Math.max(0, SiteConfig.wallSystem.cutawayPaddingCells) * this.cellSize;
        const left = piece.x * this.cellSize;
        for (let index = 0; index < cut.length; index++) {
            const cellLeft = left + (index * this.cellSize);
            if (spans.some(span =>
                cellLeft + this.cellSize > span.left - padding &&
                cellLeft < span.right + padding
            )) cut[index] = value;
        }
    }

    hasMovingObjectSpans(piece) {
        return this.getMovingSpansForRun(piece).length > 0;
    }

    getMovingObjectRevealSpans(object) {
        if (object.getConfig?.('wallFixture', false) === true) {
            const placement = this.getFixturePlacementCandidate(object);
            return placement ? [{
                piece: placement.piece,
                left: placement.position.x,
                right: placement.position.x + object.size.width
            }] : [];
        }

        if (!object.getConfig?.('wallOpeningConfig', null)) return [];
        // Adjustable-sill windows produce several candidates. The nearest one
        // can point at the row above or below even after placement has snapped
        // to a valid wall, so select the candidate whose cells actually form a
        // compatible host run. Deliberately ignore object overlap here: an
        // invalid red preview still needs its wall raised for useful feedback.
        const placement = this.getOpeningPlacementCandidates(object).find(candidate =>
            this.canBridgeOpeningCells(candidate.cells, candidate.axis) &&
            candidate.cells.every(([cellX, cellY]) => {
                const cell = this.baseCells.get(`${cellX},${cellY}`);
                return !cell || this.isOpeningCellCompatible(
                    this.computeMask(cell), candidate.axis
                );
            })
        );
        if (!placement) return [];

        const spans = new Map();
        for (const [cellX, cellY] of placement.cells) {
            const hostPiece = this.findPieceForCell(cellX, cellY);
            if (!hostPiece) continue;
            const cellLeft = cellX * this.cellSize;
            const current = spans.get(hostPiece) || {
                piece: hostPiece,
                left: cellLeft,
                right: cellLeft + this.cellSize
            };
            current.left = Math.min(current.left, cellLeft);
            current.right = Math.max(current.right, cellLeft + this.cellSize);
            spans.set(hostPiece, current);
        }
        return [...spans.values()];
    }

    refreshMovingObjectReveal(object) {
        const id = String(object.id);
        if (!this._movingObjects.has(id)) return false;
        const previous = this._movingRevealPieceIds.get(id) || new Set();
        const next = new Set(this.getMovingObjectRevealSpans(object).map(span => span.piece.id));
        this._movingRevealPieceIds.set(id, next);
        const affected = new Set([...previous, ...next]);
        const renderIds = new Set(affected);
        for (const piece of this.pieces) {
            if (!affected.has(piece.id)) continue;
            for (const cell of piece.cells) {
                for (const chainCell of this.getHorizontalCellChain(cell)) {
                    const host = this.findPieceForCell(chainCell.x, chainCell.y);
                    if (host) renderIds.add(host.id);
                }
            }
        }
        for (const piece of this.pieces) {
            if (renderIds.has(piece.id)) this.renderPiece(piece);
        }
        return true;
    }

    beginPlacementPreview(object) {
        const id = String(object.id);
        this._movingObjects.set(id, object);
        this._movingRevealPieceIds.set(id, new Set(
            this.getMovingObjectRevealSpans(object).map(span => span.piece.id)
        ));
        this.evaluateCutaway(true);
    }

    endPlacementPreview(object) {
        const id = String(object?.id);
        if (!this._movingObjects.delete(id)) return false;
        this._movingRevealPieceIds.delete(id);
        this.evaluateCutaway(true);
        return true;
    }

    getCutYOver(piece, x0, x1) {
        const plan = piece.renderPlan;
        const construction = this.registry.getConstruction(piece.constructionId);
        if (!plan || !construction) return piece.baseline - piece.height;
        if (plan.mode === 'hidden') return piece.baseline;
        if (plan.mode !== 'cut') return piece.baseline - this.getStateHeight(plan.mode, construction);

        const left = piece.x * this.cellSize;
        const first = Utility.clamp(Math.floor((x0 - left) / this.cellSize), 0, plan.states.length - 1);
        const last = Utility.clamp(Math.ceil((x1 - left) / this.cellSize) - 1, first, plan.states.length - 1);
        let lowest = construction.height;
        for (let index = first; index <= last; index++) {
            lowest = Math.min(lowest, this.getStateHeight(plan.states[index], construction));
        }
        return piece.baseline - lowest;
    }

    propagateCutLine(piece, plan) {
        piece.renderPlan = plan;
        const construction = this.registry.getConstruction(piece.constructionId);
        const height = plan.mode === 'hidden' || !construction
            ? 0
            : this.getStateHeight(plan.mode === 'cut' ? 'full' : plan.mode, construction);
        for (const surface of Object.values(piece.faces)) surface.setCutLine(height);
        for (const cell of piece.cells) {
            if (!cell.opening) continue;
            this.openingSlots.get(String(cell.opening.id))?.setCutLine(piece);
        }
    }

    evaluateCutaway(immediate = false) {
        this.refreshCutawayTargets(immediate);
        for (const piece of this.pieces) this.renderPiece(piece);
    }

    updateActiveRoom() {
        if (this.presentation !== 'cutaway') return;
        const roomIds = this.getCurrentCutawayRoomIds();
        const cutawayKey = roomIds.length > 0 ? `rooms:${roomIds.join(',')}` : 'rooms:none';
        if (cutawayKey === this._activeCutawayKey) {
            this._pendingCutawayKey = null;
            return;
        }

        const now = WallBuilder.presentationNow();
        if (cutawayKey !== this._pendingCutawayKey) {
            this._pendingCutawayKey = cutawayKey;
            this._pendingCutawaySince = now;
            return;
        }
        if (now - this._pendingCutawaySince < SiteConfig.wallSystem.cutawayDebounceMs) return;

        this._activeCutawayKey = cutawayKey;
        this._cutawayRoomIds = new Set(roomIds);
        this._pendingCutawayKey = null;
        this.evaluateCutaway();
    }

    setPresentationMode(mode) {
        if (!SiteConfig.wallSystem.presentationModes.includes(mode)) return false;
        this.presentation = mode;
        this.commitCutawayRoom(false);
        this.gameMap.parent?.canvas?.setAttribute('data-wall-mode', mode);
        this.syncFlatOverlay();
        this.evaluateCutaway(true);
        this.gameMap.eventManager?.emit(EVENTS.WALL_PRESENTATION_CHANGED, { mapId: this.gameMap.id, mode });
        return true;
    }

    setPresentationOverride(mode = null) {
        if (mode === null) {
            if (this._presentationOverride === null) return false;
            const restore = this._presentationOverride;
            this._presentationOverride = null;
            return this.setPresentationMode(restore);
        }
        if (this._presentationOverride !== null) return false;
        this._presentationOverride = this.presentation;
        return this.setPresentationMode(mode);
    }

    setUserPresentationMode(mode) {
        // The override slot holds the play-mode presentation to come back to;
        // picking a mode while building must not overwrite it, or leaving build
        // mode would "restore" the build-mode choice.
        return this.setPresentationMode(mode);
    }

    setBuildPresentation(mode = SiteConfig.buildMode.defaultPresentation) {
        if (this._presentationOverride === null) this._presentationOverride = this.presentation;
        return this.setPresentationMode(mode);
    }

    clearBuildPresentation() {
        return this.setPresentationOverride(null);
    }
}

