class WallBuildPanel extends ModalWindow {
    constructor(parent) {
        super(parent, {
            id: 'wall-build-panel',
            closeOnOutsideClick: false,
            position: 'top-right',
            draggable: true,
            closeButtonSelector: '.modal-close-btn'
        });
        this.drag = null;
        this.hoverCell = null;
        this.runSound = new BuildRunSound(this);
        this.ghostElements = [];
        this.measureLabel = null;
        this.boundPointerDown = this.handlePointerDown.bind(this);
        this.boundPointerMove = this.handlePointerMove.bind(this);
        this.boundPointerUp = this.handlePointerUp.bind(this);
        this.boundPointerLeave = this.clearHover.bind(this);
        this.init();
        this.operationSegment = new SegmentControl(
            this.modalElement?.querySelector('.wall-build-operation-segment') || null,
            { value: 'add', onChange: () => this.renderHoverGhost() }
        );
        this.rectangleToggle = this.modalElement?.querySelector('#wall-build-rectangle') || null;
        this.parent?.parent?.canvas?.addEventListener('pointerdown', this.boundPointerDown, true);
        this.parent?.parent?.canvas?.addEventListener('pointerleave', this.boundPointerLeave);
        document.addEventListener('pointermove', this.boundPointerMove, true);
        document.addEventListener('pointerup', this.boundPointerUp, true);
        document.addEventListener('pointercancel', this.boundPointerUp, true);
    }

    get gameMap() {
        return this.parent?.parent?.gameMap || null;
    }

    get rules() {
        return this.parent?.parent?.buildRules || null;
    }

    handleToolModeChanged(mode) {
        const active = mode === UIToolModes.WALL;
        document.body.classList.toggle('wall-build-mode', active);
        if (active) {
            this.open();
        } else {
            this.cancelDrag();
            this.clearHover();
            super.close();
        }
    }

    // Closing the window is putting the tool down, so it hands back to
    // whatever the current mode's default tool is — which is Select once build
    // mode has already been left.
    close() {
        if (this.parent.isTool(UIToolModes.WALL) &&
            this.parent.changeToolMode(this.parent.toolManager.getDefaultToolFor())) {
            return;
        }
        super.close();
    }

    getOperation() {
        return this.operationSegment?.value || 'add';
    }

    /**
     * The operation this gesture is actually performing. Ctrl held inverts the
     * panel's tool for the length of the drag without touching the radio — the
     * Sims' knock-a-wall-down modifier — so the common "lay a run, fix one
     * cell, carry on" loop never costs two trips to the panel.
     */
    resolveOperation(event = null) {
        if (event?.ctrlKey === true) return this.getOperation() === 'remove' ? 'add' : 'remove';
        return this.getOperation();
    }

    // Shift is unavailable on touch, so the panel carries the same switch.
    isRectangleMode(event = null) {
        return event?.shiftKey === true || this.rectangleToggle?.checked === true;
    }

    pointerToCell(event) {
        const map = this.gameMap;
        const world = map?.container?.inputHandler?.screenToWorldCoordinates?.(event.clientX, event.clientY);
        if (!world || !map?.gridSystem) return null;
        const cell = map.gridSystem.worldToGrid(world.x, world.y);
        if (cell.x < 0 || cell.y < 0 || cell.x >= map.gridSystem.gridWidth || cell.y >= map.gridSystem.gridHeight) {
            return null;
        }
        return cell;
    }

    handlePointerDown(event) {
        if (!this.parent.isTool(UIToolModes.WALL) || event.button !== 0) return;
        const cell = this.pointerToCell(event);
        if (!cell || !this.gameMap?.wallBuilder) return;
        event.preventDefault();
        event.stopPropagation();
        this.runSound.reset();
        // A grip standing on the wall, grabbed. No mode to choose first: the
        // handle is only there when there is a wall under the cursor to move,
        // so seeing it IS being told you can move this.
        if (this.handleCell && this.handleCell.x === cell.x && this.handleCell.y === cell.y) {
            const run = this.resolveRun(cell);
            if (run) {
                this.drag = {
                    pointerId: event.pointerId,
                    map: this.gameMap,
                    start: cell,
                    end: cell,
                    operation: 'move',
                    run,
                    // Which of the two gestures this is has not been decided
                    // yet — see resolveGrabbedGesture on the first move.
                    undecided: true,
                    soundedCells: 0
                };
                this.hoverCell = null;
                this.hoverOperation = null;
                this.clearHandle();
                this.renderMovePlan(event);
                return;
            }
        }
        const operation = this.resolveOperation(event);
        this.drag = {
            pointerId: event.pointerId,
            map: this.gameMap,
            start: cell,
            end: cell,
            rectangle: this.isRectangleMode(event),
            operation,
            soundedCells: 0
        };
        this.hoverCell = null;
        this.hoverOperation = null;
        this.renderGhosts(this.getDragCells(), event);
    }

    handlePointerMove(event) {
        if (!this.drag) {
            this.renderHoverGhost(event);
            return;
        }
        if (event.pointerId !== this.drag.pointerId) return;
        const cell = this.pointerToCell(event);
        if (!cell) return;
        event.preventDefault();
        event.stopPropagation();
        this.drag.end = cell;
        if (this.drag.undecided) this.resolveGrabbedGesture(event);
        if (this.drag.operation === 'move') {
            this.renderMovePlan(event);
            return;
        }
        this.drag.rectangle = this.isRectangleMode(event);
        this.drag.operation = this.resolveOperation(event);
        this.renderGhosts(this.getDragCells(), event);
    }

    /**
     * What a drag that started on a grip turns out to be, decided by which way
     * it went.
     *
     * Across the run is a move — the only direction a wall can go, and the only
     * one the move plan reads. Along it is not a move at all: the plan drops
     * that component entirely, so pulling a wall sideways along itself used to
     * be a gesture where you pressed, dragged, released, and nothing whatsoever
     * happened. What people mean by that drag is the ordinary one — lengthen
     * this wall, or take a bite out of it — so it hands back to the draw.
     *
     * Decided once, on the first cell of travel, and then held for the rest of
     * the gesture: a wall that changed its mind about what it was doing halfway
     * through the drag would be worse than either answer.
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
     * A single ghost cell under the cursor before any drag starts, in the
     * colour of what a click would do and struck through when it would be
     * refused. This is the answer to "can I build here?" — a cursor swap alone
     * cannot say *which* cell it means on a grid this size.
     */
    renderHoverGhost(event = null) {
        if (event) this.hoverEvent = event;
        const source = event || this.hoverEvent;
        if (!this.parent.isTool(UIToolModes.WALL) || !source) return;
        if (!this.parent.parent?.canvas?.contains(source.target)) {
            this.clearHover();
            return;
        }
        const cell = this.pointerToCell(source);
        if (!cell) {
            // Off the grid entirely — the grey around the map. A crosshair out
            // here promised a click that does nothing.
            this.clearHover();
            return;
        }
        // pointermove fires far faster than the cursor crosses a cell, and every
        // repeat would rebuild the ghost element for the same square.
        const operation = this.resolveOperation(source);
        if (this.hoverCell?.x === cell.x && this.hoverCell?.y === cell.y &&
            this.hoverOperation === operation) {
            return;
        }
        this.hoverCell = cell;
        this.hoverOperation = operation;

        // A grip means the click moves this run. Asking "may a wall be added
        // here?" of a cell that already holds one answers a question nobody
        // asked - and it answers "no" whenever the run carries a painting or
        // touches a door, which drew a red square under a blue grip. Outline
        // the run instead: it says which wall the grip belongs to, and it says
        // it through a cutaway, where the wall itself is not drawn at all.
        const run = this.renderHandle(cell, operation);
        if (run) {
            this.renderRunGhost(run);
            this.parent.setBuildCursor('grab');
            return;
        }

        this.renderGhosts([cell], null, operation);
        this.parent.setBuildCursor(this.cursorFor(cell, operation));
    }

    /**
     * Allowed is not the same as "would do something" — laying wall over wall is
     * permitted and changes nothing, and the ghost already says so by going
     * dotted. The cursor says the same thing by going plain: a crosshair over a
     * square where a click is a no-op is the tool promising work it will not do.
     */
    cursorFor(cell, operation) {
        if (!this.checkCell(cell, operation).allowed) return 'refused';
        return this.cellWouldChange(this.gameMap, cell, operation === 'remove') ? 'ready' : null;
    }

    // The whole run the grip would pull, drawn as one quiet outline.
    renderRunGhost(run) {
        this.clearGhosts();
        const layer = this.gameMap?.layers?.objects;
        const cellSize = this.gameMap?.gridSystem?.config?.cellSize;
        if (!layer || !cellSize) return;
        for (const cell of run.cells) {
            const ghost = document.createElement('div');
            ghost.className = 'wall-build-ghost-cell is-run';
            ghost.style.left = `${cell.x * cellSize}px`;
            ghost.style.top = `${cell.y * cellSize}px`;
            ghost.style.width = `${cellSize}px`;
            ghost.style.height = `${cellSize}px`;
            layer.appendChild(ghost);
            this.ghostElements.push(ghost);
        }
    }

    clearHover() {
        if (this.drag) return;
        this.hoverCell = null;
        this.hoverOperation = null;
        this.hoverEvent = null;
        this.clearGhosts();
        this.clearHandle();
        this.parent.setBuildCursor(null);
    }

    /**
     * A grip on the wall under the cursor, pointing the way it can be pulled.
     *
     * The alternative was a Move mode in the panel, which meant knowing the mode
     * existed, going to get it, and putting it back. A wall you can drag should
     * look like a wall you can drag — so the handle appears on the run the
     * moment you are over it, and grabbing it is the whole interaction.
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

    handlePointerUp(event) {
        if (!this.drag || event.pointerId !== this.drag.pointerId) return;
        event.preventDefault();
        event.stopPropagation();
        if (this.drag.operation === 'move') {
            const plan = this.getMovePlan();
            const map = this.drag.map;
            this.cancelDrag();
            this.commitMove(map, plan);
            return;
        }
        const cells = this.getDragCells();
        const map = this.drag.map;
        const operation = this.drag.operation;
        this.cancelDrag();
        this.commitCells(map, cells, operation);
    }

    getDragCells() {
        if (!this.drag) return [];
        const { start, end, rectangle } = this.drag;
        const minX = Math.min(start.x, end.x);
        const maxX = Math.max(start.x, end.x);
        const minY = Math.min(start.y, end.y);
        const maxY = Math.max(start.y, end.y);
        const keys = new Set();
        if (rectangle) {
            for (let x = minX; x <= maxX; x += 1) {
                keys.add(`${x},${minY}`);
                keys.add(`${x},${maxY}`);
            }
            for (let y = minY; y <= maxY; y += 1) {
                keys.add(`${minX},${y}`);
                keys.add(`${maxX},${y}`);
            }
        } else if (Math.abs(end.x - start.x) >= Math.abs(end.y - start.y)) {
            for (let x = minX; x <= maxX; x += 1) keys.add(`${x},${start.y}`);
        } else {
            for (let y = minY; y <= maxY; y += 1) keys.add(`${start.x},${y}`);
        }
        return [...keys].map(key => {
            const [x, y] = key.split(',').map(Number);
            return { x, y };
        });
    }

    // -- Moving a run ---------------------------------------------------------

    /**
     * The straight run of wall the given cell belongs to.
     *
     * A wall in a house is almost never one cell, and nobody thinks of it as
     * one — "the kitchen's back wall" is the unit people want to grab. So the
     * run is walked out from the cell along whichever axis it connects on,
     * stopping where the masonry stops.
     *
     * A junction cell is where two runs cross and belongs to both, so it has no
     * single answer and is refused rather than guessed at. Grabbing a corner and
     * watching it take one of its two walls with it is worse than being told to
     * grab somewhere else.
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
                // The run ends AT a corner, not through it: a corner is part of
                // this wall and moves with it, but the wall turning out of it is
                // a different wall and stays where it is.
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
     * Only the perpendicular part of the drag counts — sliding a wall along its
     * own length is not a thing walls do, and letting the pointer's other axis
     * leak in makes a straight pull impossible to perform by hand.
     *
     * `bridges` is what keeps the house shut. Pull a room's back wall out and
     * the two side walls have to grow with it; without that the room springs a
     * gap at each end and stops being a room, which the floors and the lighting
     * both notice immediately. Only ends that were ATTACHED to something grow —
     * a free-standing wall slides cleanly and sprouts nothing.
     * @returns {{distance: number, additions: Array, removals: Array}}
     */
    getMovePlan() {
        const empty = { distance: 0, additions: [], removals: [], moveX: 0, moveY: 0 };
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
        return { distance, additions, removals, moveX: stepX * span, moveY: stepY * span };
    }

    /**
     * The bits of wall the move would leave behind attached to nothing.
     *
     * Pull a room's top wall down into the room and the two side walls now poke
     * up past it into open air. Sometimes that is right — on a side that carries
     * on past the corner it is one long wall and the part above the room is
     * still doing a job. Sometimes it is two stubs standing in a garden, which
     * is not a thing anybody meant to build and is tedious to go and delete.
     *
     * The difference is not which side it is on, it is whether the leftover
     * still connects to anything. So the stubs are found the same way you would
     * find them by eye: start where the wall was, and walk outwards taking off
     * any cell that has nothing left holding it up. A cell with two connections
     * is part of something and stops the walk — which is exactly the long side
     * wall that should stay.
     *
     * Anything with a door, a window or a painting on it is left alone
     * regardless: deleting a wall is undoable, silently deleting what was
     * mounted on it is a nasty surprise.
     * @returns {Array<{x: number, y: number}>}
     */
    findOrphanedStubs(builder, run, keep, vacated) {
        if (vacated.length === 0) return [];
        const gone = new Set(vacated.map(cell => `${cell.x},${cell.y}`));
        const arriving = new Set([...keep.keys()]);
        const orphans = [];

        // Seeded from the sides of the wall that is leaving — a stub can only be
        // orphaned by this move if it was touching it.
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
            if (this.checkCell({ x, y }, 'remove').allowed !== true) continue;
            if (connections(x, y) > 1) continue;            // held up by something
            gone.add(key);
            orphans.push({ x, y });
            // Taking this one away may have orphaned the next one along.
            for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
                queue.push({ x: x + dx, y: y + dy });
            }
        }
        return orphans;
    }

    /**
     * Whether a run's end is anchored to masonry BEHIND it — on the side the
     * wall is moving away from.
     *
     * Which side matters is the whole rule. Pull a wall away from the side wall
     * it joins and that side has to stretch to follow, or the room springs open
     * at the corner. Push it towards one and the side does not stretch, it gets
     * shorter — so nothing is bridged and the leftover above the new corner is
     * left for the orphan walk to take away.
     *
     * A wall that continues BOTH ways is a longer wall passing through, and it
     * is anchored whichever way you push: the part beyond the corner is still
     * doing a job, so the corner has to keep reaching it.
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
                ghost.className = `wall-build-ghost-cell ${className}`;
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
     * One edit, not two. Removing the old run and adding the new one as separate
     * commits would put a hole in the house between them — the room detector,
     * the floors and the lighting all run on the first and would rebuild the
     * world around a wall that is missing for one frame — and it would take two
     * undos to put back.
     */
    commitMove(map, plan) {
        const builder = map?.wallBuilder;
        if (!builder || plan.distance === 0) return false;
        const changes = [...plan.removals, ...plan.additions];
        if (changes.length === 0) return false;

        // Whatever is mounted on the run travels with it: the cells it is
        // leaving, and how far.
        // The cells being VACATED, not the whole run: an end cell that stays
        // put as a bridge is still a wall, and a door hung in one belongs to
        // the wall it is still part of rather than to the piece moving away.
        const contentMove = {
            cells: new Set(plan.removals.map(cell => `${cell.x},${cell.y}`)),
            dx: plan.moveX,
            dy: plan.moveY
        };

        let result;
        try {
            // Atomic: one blocked cell cancels the whole move rather than
            // leaving a wall in two pieces with a door lying between them.
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

        const forward = Utility.deepClone(result.applied);
        const backward = Utility.deepClone(result.inverse);
        const back = WallBuilder.invertContentMove(contentMove);
        const size = Math.abs(plan.distance);
        this.parent.parent?.buildHistory?.push({
            label: `Move Wall (${size} cell${size === 1 ? '' : 's'})`,
            undo: () => builder.applyWallCellChanges(Utility.deepClone(backward),
                { validate: false, contentMove: back }),
            redo: () => builder.applyWallCellChanges(Utility.deepClone(forward),
                { validate: false, contentMove })
        });
        this.playSound(SiteConfig.buildMode.sounds.objectPlace);
        map.container?.worldState?.captureMap?.(map);
        map.core?.user?._scheduleSave?.();
        return true;
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

    renderGhosts(cells, event = null, operationOverride = null) {
        this.clearGhosts();
        const map = this.drag?.map || this.gameMap;
        const layer = map?.layers?.objects;
        const cellSize = map?.gridSystem?.config?.cellSize;
        if (!layer || !cellSize) return;
        const operation = operationOverride || this.drag?.operation || this.getOperation();
        const removing = operation === 'remove';
        let effective = 0;
        for (const cell of cells) {
            const allowed = this.checkCell(cell, operation).allowed;
            // Allowed is not the same as "would do something": adding over a
            // cell that already has a wall is permitted and changes nothing, so
            // counting it knocked for a wall that was already standing there.
            const changes = allowed && this.cellWouldChange(map, cell, removing);
            if (changes) effective += 1;
            const ghost = document.createElement('div');
            ghost.className = `wall-build-ghost-cell${removing ? ' is-remove' : ''}` +
                `${allowed ? '' : ' is-invalid'}${allowed && !changes ? ' is-inert' : ''}`;
            ghost.style.left = `${cell.x * cellSize}px`;
            ghost.style.top = `${cell.y * cellSize}px`;
            ghost.style.width = `${cellSize}px`;
            ghost.style.height = `${cellSize}px`;
            layer.appendChild(ghost);
            this.ghostElements.push(ghost);
        }
        if (this.drag) this.tickRunSound(effective, removing);
        this.renderMeasurement(effective, event);
    }

    // The same test commitCells applies, so the preview, the count and the
    // sound all agree with what the commit will actually do.
    cellWouldChange(map, cell, removing) {
        const occupied = map?.wallBuilder?.baseCells.has(`${cell.x},${cell.y}`) === true;
        return removing ? occupied : !occupied;
    }

    /**
     * One knock the moment each cell joins the run, not a burst when the drag
     * ends — the wall should sound like it is going up under your hand. The
     * pacing rules live in BuildRunSound, shared with every other drag-to-build
     * tool, because getting them subtly wrong is how a gesture ends up still
     * making noise ten seconds after mouseup.
     */
    tickRunSound(count, removing) {
        if (!this.drag) return;
        this.drag.soundedCells = count;
        this.runSound.advance(count, { descending: removing });
    }

    renderMeasurement(count, event) {
        if (!event || count <= 0 || !this.drag) {
            this.clearMeasurement();
            return;
        }
        if (!this.measureLabel) {
            this.measureLabel = document.createElement('div');
            this.measureLabel.className = 'build-measure-label';
            document.body.appendChild(this.measureLabel);
        }
        const { start, end, rectangle } = this.drag;
        const width = Math.abs(end.x - start.x) + 1;
        const height = Math.abs(end.y - start.y) + 1;
        this.measureLabel.textContent = rectangle ? `${width}×${height}` : `${count} cells`;
        this.measureLabel.style.left = `${event.clientX + 16}px`;
        this.measureLabel.style.top = `${event.clientY + 16}px`;
    }

    clearMeasurement() {
        this.measureLabel?.remove();
        this.measureLabel = null;
    }

    commitCells(map, cells, operation = this.getOperation()) {
        const builder = map?.wallBuilder;
        if (!builder || cells.length === 0) return false;
        const removing = operation === 'remove';
        const changes = cells
            .filter(cell => removing
                ? builder.baseCells.has(`${cell.x},${cell.y}`)
                : !builder.baseCells.has(`${cell.x},${cell.y}`))
            .map(cell => ({ ...cell, data: removing ? null : {} }));
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

        this.pushHistory(builder, result, removing);
        map.container?.worldState?.captureMap?.(map);
        map.core?.user?._scheduleSave?.();
        return true;
    }

    pushHistory(builder, result, removing) {
        const label = `${removing ? 'Remove' : 'Place'} Wall (${result.applied.length} cell${result.applied.length === 1 ? '' : 's'})`;
        const forward = Utility.deepClone(result.applied);
        const backward = Utility.deepClone(result.inverse);
        // Undo replays through the same authoritative path, but with validation
        // off: restoring a cell the player already had is by definition legal,
        // and re-running the rules would refuse it whenever the world moved.
        this.parent.parent?.buildHistory?.push({
            label,
            undo: () => builder.applyWallCellChanges(Utility.deepClone(backward), { validate: false }),
            redo: () => builder.applyWallCellChanges(Utility.deepClone(forward), { validate: false })
        });
    }

    // A cancelled move is one message about the move, not one per cell: the
    // player made a single gesture and it did not happen, and thirty lines
    // about individual squares buries that.
    reportBlockedMove(rejected = []) {
        const reason = rejected?.[0]?.reason || 'Something is in the way.';
        this.parent.showMessage(
            `The wall stayed where it was — ${reason.charAt(0).toLowerCase()}${reason.slice(1)}`,
            'warning',
            'Wall'
        );
    }

    reportRejections(rejected = []) {
        if (rejected.length === 0) return;
        const reason = rejected[0].reason || 'Some cells are blocked.';
        this.parent.showMessage(
            rejected.length === 1 ? reason : `${rejected.length} cells blocked — ${reason}`,
            'warning',
            'Build'
        );
    }

    playSound(soundId, options = {}) {
        if (soundId) this.parent.parent?.core?.soundManager?.playWhenReady?.(soundId, options);
    }

    clearGhosts() {
        for (const element of this.ghostElements) element.remove();
        this.ghostElements = [];
        this.clearMeasurement();
    }

    cancelDrag() {
        const wasDragging = this.drag !== null;
        this.clearGhosts();
        this.drag = null;
        return wasDragging;
    }

    dispose() {
        this.cancelDrag();
        this.clearHover();
        this.operationSegment?.dispose();
        this.operationSegment = null;
        this.parent?.parent?.canvas?.removeEventListener('pointerleave', this.boundPointerLeave);
        this.parent?.parent?.canvas?.removeEventListener('pointerdown', this.boundPointerDown, true);
        document.removeEventListener('pointermove', this.boundPointerMove, true);
        document.removeEventListener('pointerup', this.boundPointerUp, true);
        document.removeEventListener('pointercancel', this.boundPointerUp, true);
        document.body.classList.remove('wall-build-mode');
        this.parent?.setBuildCursor(null);
        super.dispose();
    }
}
