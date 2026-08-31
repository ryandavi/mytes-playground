/**
 * WallBuildPanel — the Wall tool. A drag-to-build-cells tool (see
 * CellDragBuildPanel for the shared line/rectangle/ghost/sound machinery) plus
 * one thing only walls do: hover a run you already have to grab its handle and
 * pull the whole wall across the room, or drag along it to lengthen it.
 */
class WallBuildPanel extends CellDragBuildPanel {
    constructor(parent) {
        super(parent, {
            id: 'wall-build-panel',
            toolMode: UIToolModes.WALL,
            bodyClass: 'wall-build-mode',
            operationSegmentSelector: '.wall-build-operation-segment',
            rectangleToggleSelector: '#wall-build-rectangle'
        });
        this.handleElement = null;
        this.handleCell = null;
        this.roomFloorButton = this.modalElement?.querySelector('#wall-room-floor') || null;
        this.roomAreasButton = this.modalElement?.querySelector('#wall-room-areas') || null;
        this.roomActions = this.modalElement?.querySelector('.wall-room-actions') || null;
        this.roomActionsTitle = this.modalElement?.querySelector('.wall-room-actions__title') || null;
        this.openingGroup = this.modalElement?.querySelector('.wall-build-openings') || null;
        this.openingPalette = this.modalElement?.querySelector('.wall-opening-palette') || null;
        this.contextRoomId = null;
        this.roomFloorButton?.addEventListener('click', () => {
            if (this.contextRoomId) {
                this.parent?.surfaceCustomizePanel?.openRoomSurface?.(this.contextRoomId, 'floor');
            }
        });
        this.roomAreasButton?.addEventListener('click', () => {
            const roomId = this.contextRoomId;
            if (!this.parent?.changeToolMode(UIToolModes.ROOM)) return;
            if (roomId) this.parent?.roomPanel?.select?.(roomId);
        });
    }

    getBuilder() {
        return this.gameMap?.wallBuilder || null;
    }

    handleToolModeChanged(mode) {
        const active = mode === this.toolMode;
        super.handleToolModeChanged(mode);
        if (active) this.renderOwnedOpenings();
        if (!active) this.selectContextRoom(null);
    }

    renderOwnedOpenings() {
        if (!this.openingGroup || !this.openingPalette) return;
        const inventory = this.build?.inventory;
        const openings = (inventory?.items ?? []).filter(item => {
            const type = ItemRegistry.getItemSync(item.variant || item.name)?.world?.objectType;
            return type === 'DOOR' || type === 'WINDOW';
        });
        this.openingGroup.hidden = openings.length === 0;
        this.openingPalette.replaceChildren(...openings.map(item => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'panel-action wall-opening-choice';
            button.textContent = `${item.name} ×${item.quantity}`;
            button.title = 'Place this opening into a wall';
            button.addEventListener('click', () => inventory.activateItemElement(item.element));
            return button;
        }));
    }

    handlePointerDown(event) {
        if (this.parent.isTool(this.toolMode) && event.button === 0) {
            this.selectContextRoom(this.pointerToCell(event));
        }
        super.handlePointerDown(event);
    }

    // Pre-flight of the same rules applyWallCellChanges enforces, so a blocked
    // cell reads red under the cursor instead of silently vanishing on commit.
    checkCell(cell, operation = this.getOperation()) {
        const rules = this.rules;
        if (!rules) return BuildRules.ALLOWED;
        return operation === 'remove'
            ? rules.canRemoveWallCell(cell.x, cell.y)
            : rules.canBuildWallCell(cell.x, cell.y);
    }

    // The same test commitCells applies, so the preview, the count and the
    // sound all agree with what the commit will actually do.
    cellWouldChange(map, cell, removing) {
        const occupied = map?.wallBuilder?.baseCells.has(`${cell.x},${cell.y}`) === true;
        return removing ? occupied : !occupied;
    }

    commitCells(map, cells, operation = this.getOperation(), gesture = null) {
        const builder = map?.wallBuilder;
        if (!builder || cells.length === 0) return false;
        const removing = operation === 'remove';
        const template = operation === 'remove' ? null :
            gesture?.wallTemplate || this.resolveExtensionTemplate(builder, gesture?.start, cells);
        const faceTemplate = operation === 'remove' ? [] :
            builder.sampleFaceOverrideTemplate(gesture?.start);
        const changes = cells
            .filter(cell => removing
                ? builder.baseCells.has(`${cell.x},${cell.y}`)
                : !builder.baseCells.has(`${cell.x},${cell.y}`))
            .map(cell => ({ ...cell, data: removing ? null : Utility.deepClone(template || {}) }));
        if (changes.length === 0) return false;

        let result;
        try {
            result = builder.applyWallCellChanges(changes);
        } catch (error) {
            if (/node|budget|generated/i.test(error?.message || '')) {
                this.parent.showMessage("This map can't hold more walls.", 'warning', 'Wall limit reached');
                return false;
            }
            throw error;
        }
        if (!result) return false;

        this.reportRejections(result.rejected);
        if (result.applied.length === 0) {
            this.playSound(SiteConfig.buildMode.sounds.rejected);
            return false;
        }

        const copiedOverrides = builder.createFaceOverrideCopies(
            faceTemplate,
            result.applied.filter(change => change.data !== null)
        );
        builder.addFaceOverrideCopies(copiedOverrides);

        this.pushWallHistory(builder, result, removing, copiedOverrides);
        this.afterCommit(map);
        return true;
    }

    resolveExtensionTemplate(builder, start, cells = []) {
        if (!builder) return null;
        const direct = start ? builder.sampleCellTemplate(start) : null;
        if (direct) return direct;
        const candidates = start ? [[-1, 0], [1, 0], [0, -1], [0, 1]] : [];
        for (const [dx, dy] of candidates) {
            const sampled = builder.sampleCellTemplate(start.x + dx, start.y + dy);
            if (sampled) return sampled;
        }
        for (const cell of cells) {
            const sampled = builder.sampleCellTemplate(cell);
            if (sampled) return sampled;
        }
        return null;
    }

    pushWallHistory(builder, result, removing, copiedOverrides = []) {
        const label = `${removing ? 'Remove' : 'Place'} Wall (${result.applied.length} cell${result.applied.length === 1 ? '' : 's'})`;
        const forward = Utility.deepClone(result.applied);
        const backward = Utility.deepClone(result.inverse);
        // Undo replays through the same authoritative path, but with validation
        // off: restoring a cell the player already had is by definition legal,
        // and re-running the rules would refuse it whenever the world moved.
        this.pushHistory({
            label,
            undo: () => {
                builder.removeFaceOverrideCopies(copiedOverrides);
                builder.applyWallCellChanges(Utility.deepClone(backward), { validate: false });
            },
            redo: () => {
                builder.applyWallCellChanges(Utility.deepClone(forward), { validate: false });
                builder.addFaceOverrideCopies(copiedOverrides);
            }
        });
    }

    // ── Grab-a-run-and-move-it (the wall-only gesture) ────────────────────────

    tryBeginSpecialGesture(cell, event) {
        // A grip standing on the wall, grabbed. No mode to choose first: the
        // handle is only there when there is a wall under the cursor to move,
        // so seeing it IS being told you can move this.
        if (!this.handleCell || this.handleCell.x !== cell.x || this.handleCell.y !== cell.y) return false;
        const run = this.resolveRun(cell);
        if (!run) return false;
        const builder = this.gameMap?.wallBuilder;
        this.drag = {
            pointerId: event.pointerId,
            map: this.gameMap,
            start: cell,
            end: cell,
            operation: 'move',
            run,
            wallTemplate: builder.sampleCellTemplate(cell),
            // Which of the two gestures this is has not been decided yet — see
            // resolveGrabbedGesture on the first move.
            undecided: true,
            soundedCells: 0
        };
        this.hoverCell = null;
        this.hoverOperation = null;
        this.clearHandle();
        this.renderMovePlan(event);
        return true;
    }

    updateSpecialGesture(event) {
        if (!this.drag) return false;
        if (this.drag.undecided) this.resolveGrabbedGesture(event);
        if (this.drag.operation === 'move') {
            this.renderMovePlan(event);
            return true;
        }
        return false;
    }

    finishSpecialGesture(event) {
        if (this.drag?.operation !== 'move') return false;
        const plan = this.getMovePlan();
        const map = this.drag.map;
        this.cancelDrag();
        this.commitMove(map, plan);
        return true;
    }

    /**
     * A grip means the click moves this run. Asking "may a wall be added here?"
     * of a cell that already holds one answers a question nobody asked — so
     * outline the run instead: it says which wall the grip belongs to.
     */
    renderSpecialHover(cell, operation) {
        const run = this.renderHandle(cell, operation);
        if (!run) return false;
        this.renderRunGhost(run.cells);
        this.parent.setBuildCursor('grab');
        return true;
    }

    clearSpecial() {
        this.clearHandle();
    }

    selectContextRoom(cell) {
        const builder = this.gameMap?.wallBuilder;
        const wallCell = cell ? builder?.cells?.get(`${cell.x},${cell.y}`) : null;
        const roomId = wallCell
            ? builder.getCellSurfaces(wallCell).find(surface => surface.roomId)?.roomId ?? null
            : null;
        this.contextRoomId = roomId;
        if (!this.roomFloorButton) return;
        const room = roomId ? this.gameMap?.regionManager?.get('room', roomId) : null;
        if (this.roomActions) this.roomActions.hidden = !room;
        if (this.roomActionsTitle) {
            this.roomActionsTitle.textContent = room?.properties?.displayName || room?.id || 'Selected room';
        }
        return !!roomId;
    }

    /**
     * What a drag that started on a grip turns out to be, decided by which way
     * it went.
     *
     * Across the run is a move — the only direction a wall can go. Along it is
     * not a move at all: the plan drops that component entirely, so it hands
     * back to the ordinary draw (lengthen this wall, or take a bite out of it).
     *
     * Decided once, on the first cell of travel, and then held for the rest of
     * the gesture.
     */
    resolveGrabbedGesture(event) {
        const { start, end, run } = this.drag;
        const alongX = run.axis === 'horizontal';
        const along = Math.abs(alongX ? end.x - start.x : end.y - start.y);
        const across = Math.abs(alongX ? end.y - start.y : end.x - start.x);
        if (along === 0 && across === 0) return;

        this.drag.undecided = false;
        if (across >= along) return;                        // a move, as grabbed

        this.drag.operation = this.resolveOperation(event);
        this.drag.rectangle = this.isRectangleMode(event);
        delete this.drag.run;
    }

    /**
     * A grip on the wall under the cursor, pointing the way it can be pulled.
     *
     * @returns {Object|null} The run the grip belongs to, or null when there
     *                        is nothing here to grab.
     */
    renderHandle(cell, operation) {
        this.clearHandle();
        if (operation !== 'add') return null;               // removing, not moving
        const run = this.resolveRun(cell);
        const layer = this.gameMap?.layers?.objects;
        const cellSize = this.gameMap?.gridSystem?.config?.cellSize;
        if (!run || !layer || !cellSize) return null;

        const handle = document.createElement('div');
        handle.className = `wall-move-handle is-${run.axis}`;
        handle.style.left = `${cell.x * cellSize}px`;
        handle.style.top = `${cell.y * cellSize}px`;
        handle.style.width = `${cellSize}px`;
        handle.style.height = `${cellSize}px`;
        layer.appendChild(handle);
        this.handleElement = handle;
        this.handleCell = { x: cell.x, y: cell.y };
        return run;
    }

    clearHandle() {
        this.handleElement?.remove();
        this.handleElement = null;
        this.handleCell = null;
    }

    /**
     * The straight run of wall the given cell belongs to.
     *
     * A junction cell is where two runs cross and belongs to both, so it has no
     * single answer and is refused rather than guessed at.
     * @returns {{cells: Array<{x: number, y: number}>, axis: string}|null}
     */
    resolveRun(cell) {
        const builder = this.gameMap?.wallBuilder;
        const raw = builder?.cells.get(`${cell.x},${cell.y}`);
        if (!raw) return null;
        const mask = builder.computeMask(raw);
        const horizontal = WallBuilder.isHorizontalMask(mask);
        const vertical = WallBuilder.isVerticalMask(mask);
        if (horizontal === vertical) return null;          // junction, or a lone post

        const axis = horizontal ? 'horizontal' : 'vertical';
        const step = horizontal ? [1, 0] : [0, 1];
        const cells = [{ x: cell.x, y: cell.y }];
        for (const direction of [-1, 1]) {
            let x = cell.x;
            let y = cell.y;
            for (;;) {
                x += step[0] * direction;
                y += step[1] * direction;
                const next = builder.cells.get(`${x},${y}`);
                if (!next) break;
                const nextMask = builder.computeMask(next);
                // The run ends AT a corner, not through it.
                cells.push({ x, y });
                if (WallBuilder.isHorizontalMask(nextMask) === WallBuilder.isVerticalMask(nextMask)) break;
            }
        }
        cells.sort((a, b) => a.y - b.y || a.x - b.x);
        return { cells, axis };
    }

    /**
     * Where the grabbed run would end up, and what it costs to put it there.
     *
     * Only the perpendicular part of the drag counts. `bridges` is what keeps
     * the house shut — pull a room's back wall out and the two side walls have
     * to grow with it. Only ends that were ATTACHED to something grow.
     * @returns {{distance: number, additions: Array, removals: Array}}
     */
    getMovePlan() {
        const empty = { distance: 0, additions: [], removals: [], retainedShared: [], moveX: 0, moveY: 0 };
        const run = this.drag?.run;
        const builder = this.drag?.map?.wallBuilder;
        if (!run || !builder) return empty;

        const horizontal = run.axis === 'horizontal';
        const distance = horizontal
            ? this.drag.end.y - this.drag.start.y
            : this.drag.end.x - this.drag.start.x;
        if (distance === 0) return empty;
        const stepX = horizontal ? 0 : Math.sign(distance);
        const stepY = horizontal ? Math.sign(distance) : 0;
        const span = Math.abs(distance);

        const keep = new Map();
        const take = (x, y, source) => {
            const key = `${x},${y}`;
            if (!keep.has(key)) keep.set(key, { x, y, data: Utility.deepClone(source) });
        };

        for (const cell of run.cells) {
            const source = builder.baseCells.get(`${cell.x},${cell.y}`) ?? {};
            take(cell.x + (stepX * span), cell.y + (stepY * span), source);
        }

        const retainedShared = [];
        for (const cell of run.cells) {
            if (!this.isSharedRoomBoundary(builder, cell)) continue;
            const source = builder.baseCells.get(`${cell.x},${cell.y}`) ?? {};
            take(cell.x, cell.y, source);
            retainedShared.push({
                source: { x: cell.x, y: cell.y },
                target: { x: cell.x + (stepX * span), y: cell.y + (stepY * span) }
            });
        }

        for (const end of [run.cells[0], run.cells[run.cells.length - 1]]) {
            if (!this.endIsAnchored(builder, end, stepX, stepY)) continue;
            const source = builder.baseCells.get(`${end.x},${end.y}`) ?? {};
            for (let along = 0; along < span; along++) {
                take(end.x + (stepX * along), end.y + (stepY * along), source);
            }
        }

        const vacated = run.cells.filter(cell => !keep.has(`${cell.x},${cell.y}`));
        const orphans = this.findOrphanedStubs(builder, run, keep, vacated);
        const removals = [...vacated, ...orphans]
            .map(cell => ({ x: cell.x, y: cell.y, data: null }));
        const additions = [...keep.values()]
            .filter(cell => !builder.baseCells.has(`${cell.x},${cell.y}`));
        return { distance, additions, removals, retainedShared, moveX: stepX * span, moveY: stepY * span };
    }

    isSharedRoomBoundary(builder, cell) {
        const raw = builder?.cells?.get(`${cell.x},${cell.y}`);
        if (!raw) return false;
        const faces = builder.assignFaces(raw);
        return new Set(Object.values(faces).map(face => face.roomId).filter(Boolean)).size > 1;
    }

    /**
     * The bits of wall the move would leave behind attached to nothing.
     *
     * Start where the wall was, and walk outwards taking off any cell that has
     * nothing left holding it up. A cell with two connections is part of
     * something and stops the walk.
     *
     * Anything with a door, a window or a painting on it is left alone.
     * @returns {Array<{x: number, y: number}>}
     */
    findOrphanedStubs(builder, run, keep, vacated) {
        if (vacated.length === 0) return [];
        const gone = new Set(vacated.map(cell => `${cell.x},${cell.y}`));
        const arriving = new Set([...keep.keys()]);
        const orphans = [];

        const queue = [];
        const perpendicular = run.axis === 'horizontal' ? [[0, -1], [0, 1]] : [[-1, 0], [1, 0]];
        for (const cell of vacated) {
            for (const [dx, dy] of perpendicular) queue.push({ x: cell.x + dx, y: cell.y + dy });
        }

        const connections = (x, y) => [[-1, 0], [1, 0], [0, -1], [0, 1]].filter(([dx, dy]) => {
            const key = `${x + dx},${y + dy}`;
            if (gone.has(key)) return false;                // about to be nothing
            return arriving.has(key) || builder.baseCells.has(key);
        }).length;

        for (let index = 0; index < queue.length; index++) {
            const { x, y } = queue[index];
            const key = `${x},${y}`;
            if (gone.has(key) || arriving.has(key) || !builder.baseCells.has(key)) continue;
            if (this.isSharedRoomBoundary(builder, { x, y })) continue;
            if (this.checkCell({ x, y }, 'remove').allowed !== true) continue;
            if (connections(x, y) > 1) continue;            // held up by something
            gone.add(key);
            orphans.push({ x, y });
            for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
                queue.push({ x: x + dx, y: y + dy });
            }
        }
        return orphans;
    }

    /**
     * Whether a run's end is anchored to masonry BEHIND it — on the side the
     * wall is moving away from.
     */
    endIsAnchored(builder, end, stepX, stepY) {
        return builder.cells.has(`${end.x - Math.sign(stepX)},${end.y - Math.sign(stepY)}`);
    }

    renderMovePlan(event = null) {
        const plan = this.getMovePlan();
        this.clearGhosts();
        const map = this.drag?.map;
        const layer = map?.layers?.objects;
        const cellSize = map?.gridSystem?.config?.cellSize;
        if (!layer || !cellSize) return;

        const draw = (cells, className) => {
            for (const cell of cells) {
                const ghost = document.createElement('div');
                ghost.className = `build-ghost-cell ${className}`;
                ghost.style.left = `${cell.x * cellSize}px`;
                ghost.style.top = `${cell.y * cellSize}px`;
                ghost.style.width = `${cellSize}px`;
                ghost.style.height = `${cellSize}px`;
                layer.appendChild(ghost);
                this.ghostElements.push(ghost);
            }
        };
        // Previewed under the same exemption the commit will use, so a wall
        // with a door in it does not draw itself red for being in its own way.
        const builder = map.wallBuilder;
        const travelling = builder.getTravellingRecordIds({
            cells: new Set(plan.removals.map(cell => `${cell.x},${cell.y}`))
        });
        const allowed = builder.withTravellingRecords(travelling, () =>
            plan.additions.map(cell => this.checkCell(cell, 'add').allowed));

        draw(plan.removals, 'is-remove');
        draw(plan.additions.filter((_, index) => allowed[index]), 'is-move');
        draw(plan.additions.filter((_, index) => !allowed[index]), 'is-invalid');

        if (event && plan.distance !== 0) {
            if (!this.measureLabel) {
                this.measureLabel = document.createElement('div');
                this.measureLabel.className = 'build-measure-label';
                document.body.appendChild(this.measureLabel);
            }
            const size = Math.abs(plan.distance);
            this.measureLabel.textContent = `${size} cell${size === 1 ? '' : 's'}`;
            this.measureLabel.style.left = `${event.clientX + 16}px`;
            this.measureLabel.style.top = `${event.clientY + 16}px`;
        } else {
            this.clearMeasurement();
        }
    }

    /**
     * One edit, not two. Removing the old run and adding the new one as
     * separate commits would put a hole in the house between them.
     */
    commitMove(map, plan) {
        const builder = map?.wallBuilder;
        if (!builder || plan.distance === 0) return false;
        const changes = [...plan.removals, ...plan.additions];
        if (changes.length === 0) return false;

        const contentMove = {
            cells: new Set(plan.removals.map(cell => `${cell.x},${cell.y}`)),
            dx: plan.moveX,
            dy: plan.moveY
        };

        let result;
        try {
            result = builder.applyWallCellChanges(Utility.deepClone(changes), { atomic: true, contentMove });
        } catch (error) {
            if (/node|budget|generated/i.test(error?.message || '')) {
                this.parent.showMessage("This map can't hold more walls.", 'warning', 'Wall limit reached');
                return false;
            }
            throw error;
        }
        if (!result || result.applied.length === 0) {
            this.reportBlockedMove(result?.rejected);
            this.playSound(SiteConfig.buildMode.sounds.rejected);
            return false;
        }

        const sharedOverrideCopies = (plan.retainedShared ?? []).flatMap(({ source, target }) =>
            builder.createFaceOverrideCopies(builder.sampleFaceOverrideTemplate(source), [target]));
        builder.addFaceOverrideCopies(sharedOverrideCopies);

        const forward = Utility.deepClone(result.applied);
        const backward = Utility.deepClone(result.inverse);
        const back = WallBuilder.invertContentMove(contentMove);
        const size = Math.abs(plan.distance);
        this.pushHistory({
            label: `Move Wall (${size} cell${size === 1 ? '' : 's'})`,
            undo: () => {
                builder.removeFaceOverrideCopies(sharedOverrideCopies);
                builder.applyWallCellChanges(Utility.deepClone(backward),
                    { validate: false, contentMove: back });
            },
            redo: () => {
                builder.applyWallCellChanges(Utility.deepClone(forward),
                    { validate: false, contentMove });
                builder.addFaceOverrideCopies(sharedOverrideCopies);
            }
        });
        this.playSound(SiteConfig.buildMode.sounds.objectPlace);
        this.afterCommit(map);
        return true;
    }

    // A cancelled move is one message about the move, not one per cell.
    reportBlockedMove(rejected = []) {
        const reason = rejected?.[0]?.reason || 'Something is in the way.';
        this.parent.showMessage(
            `The wall stayed where it was — ${reason.charAt(0).toLowerCase()}${reason.slice(1)}`,
            'warning',
            'Wall'
        );
    }

    dispose() {
        this.clearHandle();
        super.dispose();
    }
}
