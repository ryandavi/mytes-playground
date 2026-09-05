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
        this.modalElement?.querySelectorAll('[data-structure-tool]').forEach(button =>
            button.addEventListener('click', () => this.parent.changeToolMode(
                button.dataset.structureTool === 'fence' ? UIToolModes.FENCE : UIToolModes.WALL
            ))
        );
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
        // The palette is a view of the inventory, so it follows it. Rendering it
        // once when the tool opens meant a door you had just hung was still
        // listed, at the count it had before you hung it.
        this.unsubscribeInventory = this.parent?.parent?.eventManager?.on?.(
            EVENTS.INVENTORY_CHANGED, () => {
                if (this.parent?.isTool?.(this.toolMode)) this.renderOwnedOpenings();
            }
        ) || null;
    }

    getBuilder() {
        return this.gameMap?.wallBuilder || null;
    }

    dispose() {
        this.unsubscribeInventory?.();
        this.unsubscribeInventory = null;
        super.dispose?.();
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
        if (!builder || !map.buildTransaction || cells.length === 0) return false;
        const removing = operation === 'remove';
        const committedCells = removing ? this.includeOrphanedBranches(builder, cells) : cells;
        const template = removing ? null :
            gesture?.wallTemplate || this.resolveExtensionTemplate(builder, gesture?.start, committedCells);
        const changes = committedCells
            .filter(cell => removing
                ? builder.baseCells.has(BuildKeys.cell(cell.x, cell.y))
                : !builder.baseCells.has(BuildKeys.cell(cell.x, cell.y)))
            .map(cell => ({ ...cell, data: removing ? null : Utility.deepClone(template || {}) }));
        if (changes.length === 0) return false;
        let result;
        try {
            result = builder.applyWallCellChanges(changes, {
                label: `${removing ? 'Remove' : 'Place'} Wall (${changes.length} cell${changes.length === 1 ? '' : 's'})`
            });
        } catch (error) {
            if (/node|budget|generated/i.test(error?.message || '')) {
                this.parent.showMessage("This map can't hold more walls.", 'warning', 'Wall limit reached');
                return false;
            }
            throw error;
        }
        this.reportRejections(result?.rejected);
        if (!result?.applied?.length) {
            this.playSound(SiteConfig.buildMode.sounds.rejected);
            return false;
        }
        this.afterCommit(map);
        return true;
    }

    /**
     * Removing a straight run also takes the now-unattached branch left at a
     * former T-junction. It stops at the next supported junction, using the
     * same orphan rule as moving a wall run, so demolition does not leave a
     * painted one-cell-wide peninsula where the junction used to be.
     */
    includeOrphanedBranches(builder, cells) {
        const occupied = cells.filter(cell => builder?.baseCells.has(`${cell.x},${cell.y}`));
        if (occupied.length === 0) return cells;
        const sameX = occupied.every(cell => cell.x === occupied[0].x);
        const sameY = occupied.every(cell => cell.y === occupied[0].y);
        if (sameX === sameY) return cells;
        const run = { cells: occupied, axis: sameY ? 'horizontal' : 'vertical' };
        const gone = new Map();
        const orphans = this.findOrphanedStubs(builder, run, gone, occupied);
        const byKey = new Map([...cells, ...orphans].map(cell => [`${cell.x},${cell.y}`, cell]));
        return [...byKey.values()];
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
        const empty = {
            distance: 0,
            additions: [],
            removals: [],
            roomClaims: [],
            paintExtensions: [],
            movingCells: [],
            wallCells: [],
            moveX: 0,
            moveY: 0
        };
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

        const paintExtensions = [];
        for (const end of [run.cells[0], run.cells[run.cells.length - 1]]) {
            if (!this.endIsAnchored(builder, end, stepX, stepY)) continue;
            const source = builder.baseCells.get(`${end.x},${end.y}`) ?? {};
            const cells = [];
            for (let along = 0; along < span; along++) {
                const cell = { x: end.x + (stepX * along), y: end.y + (stepY * along) };
                take(cell.x, cell.y, source);
                // The original corner stays behind as the first connector cell,
                // but its paint record travels with the moved run. Restore the
                // section there as well as on masonry created between it and
                // the destination. Existing masonry farther along is not part
                // of this growth and must not be repainted.
                if (along === 0 || !builder.baseCells.has(`${cell.x},${cell.y}`)) cells.push(cell);
            }
            if (cells.length > 0) paintExtensions.push({ source: { ...end }, cells });
        }

        const vacated = run.cells.filter(cell => !keep.has(`${cell.x},${cell.y}`));
        const orphans = this.findOrphanedStubs(builder, run, keep, vacated);
        const removals = [...vacated, ...orphans]
            .map(cell => ({ x: cell.x, y: cell.y, data: null }));
        const additions = [...keep.values()]
            .filter(cell => !builder.baseCells.has(`${cell.x},${cell.y}`));
        const claimFace = horizontal
            ? (stepY < 0 ? 'south' : 'north')
            : (stepX < 0 ? 'east' : 'west');
        const roomClaims = run.cells.map(cell => ({
            source: { ...cell },
            roomId: builder.getFaceRoomIdAt(cell.x, cell.y, claimFace)
        }));
        // A run ends on its corner columns. Their literal compass face can
        // belong to the room around the corner, while the straight cells beside
        // them identify the room this wall is actually resizing. Carrying the
        // literal endpoint claim through the swept strip creates a one-cell
        // floor spur from that neighbouring room.
        for (const [index, inward] of [[0, 1], [roomClaims.length - 1, -1]]) {
            const claim = roomClaims[index];
            const cell = builder.cells.get(`${claim?.source.x},${claim?.source.y}`);
            const mask = cell ? builder.computeMask(cell) : 0;
            if (!WallBuilder.isHorizontalMask(mask) || !WallBuilder.isVerticalMask(mask)) continue;
            const neighbour = roomClaims[index + inward];
            if (neighbour) claim.roomId = neighbour.roomId;
        }
        return {
            distance,
            additions,
            removals,
            roomClaims,
            paintExtensions,
            movingCells: run.cells.map(cell => ({ ...cell })),
            wallCells: [...keep.values()].map(({ x, y }) => ({ x, y })),
            moveX: stepX * span,
            moveY: stepY * span
        };
    }

    isSharedRoomBoundary(builder, cell) {
        const raw = builder?.cells?.get(BuildKeys.cell(cell.x, cell.y));
        if (!raw) return false;
        return new Set(builder.getCellSurfaces(raw).map(surface => surface.roomId).filter(Boolean)).size > 1;
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
            cells: new Set(plan.movingCells.map(cell => `${cell.x},${cell.y}`))
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
    roomChangesForMove(map, plan) {
        const final = new Map();
        const stepX = Math.sign(plan.moveX);
        const stepY = Math.sign(plan.moveY);
        const span = Math.max(Math.abs(plan.moveX), Math.abs(plan.moveY));
        for (const claim of plan.roomClaims ?? []) {
            for (let offset = 0; offset < span; offset += 1) {
                const x = claim.source.x + (stepX * offset);
                const y = claim.source.y + (stepY * offset);
                final.set(`${x},${y}`, { x, y, roomId: claim.roomId });
            }
        }
        // Final masonry cannot carry a floor assignment, including retained
        // connector cells at the ends of the moved run.
        for (const cell of plan.wallCells ?? []) {
            final.set(`${cell.x},${cell.y}`, { ...cell, roomId: null });
        }
        return [...final.values()];
    }



    /**
     * The corner's paint, spread over every atom a new cell could show.
     *
     * Growth is seeded from the corner the run pulled away from, and a corner
     * is the worst possible sample of one: at a T it carries a single painted
     * half, on whichever face was left visible once the returning wall buried
     * the other. Copied literally that produced new cells painted on one half
     * and bare on the other — 16px stripes — and, where the corner showed its
     * north face and the new cells show their south, cells painted on a face
     * nobody looks at, which is the same bug reading as no paint at all.
     *
     * Which atom a cell shows cannot be known here: masks and ownership are
     * derived after this mutation, not before it. So a painted face fills its
     * whole axis — both halves, both facings — and the one that ends up in
     * front is right by construction. The hidden atom is a real atom either
     * way, and a later repaint or room default supersedes it.
     */
    static wholeCellAtoms(atoms) {
        const filled = [];
        for (const faces of [['north', 'south'], ['west', 'east']]) {
            const painted = atoms.filter(atom => faces.includes(atom.face));
            if (painted.length === 0) continue;
            for (const face of faces) {
                const own = painted.filter(atom => atom.face === face);
                for (const half of [0, 1]) {
                    filled.push({ ...(own.find(atom => atom.half === half) || own[0] || painted[0]), face, half });
                }
            }
        }
        return filled;
    }

    commitMove(map, plan) {
        const builder = map?.wallBuilder;
        if (!builder || !map.buildTransaction || plan.distance === 0) return false;
        const changes = [...plan.removals, ...plan.additions];
        if (changes.length === 0) return false;
        const contentMove = {
            cells: new Set(plan.movingCells.map(cell => BuildKeys.cell(cell.x, cell.y))),
            dx: plan.moveX,
            dy: plan.moveY
        };
        const roomChanges = this.roomChangesForMove(map, plan);
        const atoms = map.buildDocument.level().atoms;
        const spread = (source, targets) => ({
            targets: targets.map(cell => ({ ...cell })),
            atoms: WallBuildPanel.wholeCellAtoms(atoms.atomsOfCell(source.x, source.y))
        });
        const ends = [plan.movingCells?.[0], plan.movingCells?.at?.(-1)];
        const atomExtensions = [
            ...(plan.paintExtensions || []).map(extension => spread(extension.source, extension.cells)),
            // The run's own ends move as well as grow, and an end is exactly the
            // cell whose mask changes when it lands: a T that was showing its
            // north face arrives as a corner showing its south. Translation is
            // faithful to the face, which is what left the pulled corner bare
            // beside the wall it used to match.
            ...ends.filter(Boolean).map(end =>
                spread(end, [{ x: end.x + plan.moveX, y: end.y + plan.moveY }]))
        ];
        let result;
        try {
            result = builder.applyWallCellChanges(Utility.deepClone(changes), {
                atomic: true,
                contentMove,
                roomChanges,
                atomExtensions,
                label: `Move Wall (${Math.abs(plan.distance)} cell${Math.abs(plan.distance) === 1 ? '' : 's'})`
            });
        } catch (error) {
            if (/node|budget|generated/i.test(error?.message || '')) {
                this.parent.showMessage("This map can't hold more walls.", 'warning', 'Wall limit reached');
                return false;
            }
            throw error;
        }
        if (!result?.applied?.length) {
            this.reportBlockedMove(result?.rejected);
            this.playSound(SiteConfig.buildMode.sounds.rejected);
            return false;
        }
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
