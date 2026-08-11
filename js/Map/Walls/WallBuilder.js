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

    // Hidden once the cut line passes below the decoration's own top, rather
    // than whenever its piece happens to be stubbed.
    applyWallCut(cutY = this._cutY) {
        this._cutY = cutY;
        this.element.hidden = Number.isFinite(cutY) && cutY > this.posY;
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

class WallBuilder {
    static MASK_HORIZONTAL = 2 | 8;
    static MASK_VERTICAL = 1 | 4;
    static MASK_STRAIGHT_H = 10;

    static DIRECTIONS = Object.freeze([
        Object.freeze({ name: 'north', dx: 0, dy: -1, bit: 1 }),
        Object.freeze({ name: 'east', dx: 1, dy: 0, bit: 2 }),
        Object.freeze({ name: 'south', dx: 0, dy: 1, bit: 4 }),
        Object.freeze({ name: 'west', dx: -1, dy: 0, bit: 8 })
    ]);

    static isHorizontalMask(mask) {
        return (mask & WallBuilder.MASK_HORIZONTAL) !== 0;
    }

    static isVerticalMask(mask) {
        return (mask & WallBuilder.MASK_VERTICAL) !== 0;
    }

    static isStraightHorizontal(mask) {
        return mask === WallBuilder.MASK_STRAIGHT_H;
    }

    static isEndCapMask(mask) {
        return WallBuilder.isHorizontalMask(mask) &&
            !WallBuilder.isVerticalMask(mask) &&
            !WallBuilder.isStraightHorizontal(mask);
    }

    constructor(gameMap, wallData, registry) {
        this.gameMap = gameMap;
        this.wallData = wallData;
        this.registry = registry;
        this.cellSize = gameMap.gridSystem?.config?.cellSize || 32;
        this.layer = gameMap.layers.objects;
        this.cells = new Map();
        this.baseCells = new Map();
        this.openingKeys = new Set();
        this.openingByCell = new Map();
        this.authoredOpenings = (wallData.openings || []).map(opening => Utility.deepClone(opening));
        this.openings = Utility.deepClone(this.authoredOpenings);
        this.openingSlots = new Map();
        this.authoredFixtures = Utility.deepClone(wallData.fixtures || []);
        this.fixtures = Utility.deepClone(this.authoredFixtures);
        this.pieces = [];
        this._pieceByCell = new Map();
        this.authoredFaceOverrides = Utility.deepClone(wallData.faceOverrides || []);
        this.faceOverrides = Utility.deepClone(this.authoredFaceOverrides);
        this.decorations = [];
        this.presentation = SiteConfig.wallSystem.defaultPresentation;
        this._movingOpeningIds = new Set();
        this._movingObjects = new Map();
        this._movingRevealPieceIds = new Map();
        this._activeCutawayKey = null;
        this._cutawayRoomIds = new Set();
        this._pendingCutawayKey = null;
        this._pendingCutawaySince = 0;
        this._lastEvaluateAt = 0;
        this._subjectSignature = null;
        this._unsubscribers = [];
    }

    async initialize() {
        for (const source of this.wallData.cells || []) {
            const key = `${source.x},${source.y}`;
            this.baseCells.set(key, { ...source, opening: null });
        }
        this.normalizeOpeningFootprints();
        this.authoredOpenings = Utility.deepClone(this.openings);
        this.reindexOpenings();
        for (const [key, cell] of this.cells) {
            if (!this.baseCells.has(key)) this.baseCells.set(key, { ...cell, opening: null });
        }
        this.reindexOpenings();
        this.commitCutawayRoom(true);
        this.rebuild();
        this.bindOpeningObjects();
        this.bindFixtureObjects();
        this.createAuthoredAttachments(this.wallData.attachments || []);
        const events = this.gameMap.eventManager;
        if (events) {
            this._unsubscribers.push(events.on(EVENTS.CONTAINER_ACTIVE_MYTE_CHANGED, () => this.commitCutawayRoom(true)));
            this._unsubscribers.push(events.on(EVENTS.WALL_GEOMETRY_CHANGED, payload => {
                if (payload?.builder === this) return;
                if (!payload?.mapId || payload.mapId === this.gameMap.id) this.rebuild();
            }));
        }
        return this;
    }

    normalizeOpeningFootprints() {
        for (const opening of this.openings) {
            const object = this.gameMap.getObjectById?.(opening.id);
            if (!object || !opening.cells?.length) continue;
            const axis = this.getOpeningAxis(object);
            const count = Math.max(1, Math.round(
                (axis === 'horizontal' ? object.size.width : object.size.height) / this.cellSize
            ));
            const startX = Math.min(...opening.cells.map(cell => cell[0]));
            const startY = Math.min(...opening.cells.map(cell => cell[1]));
            opening.axis = axis;
            opening.cells = Array.from({ length: count }, (_, index) => [
                startX + (axis === 'horizontal' ? index : 0),
                startY + (axis === 'vertical' ? index : 0)
            ]);
        }
    }

    reindexOpenings() {
        this.openingKeys.clear();
        this.openingByCell.clear();
        this.cells = new Map([...this.baseCells].map(([key, cell]) => [key, { ...cell, opening: null }]));
        for (const opening of this.openings) {
            const cells = opening.cells || [];
            for (let index = 0; index < cells.length; index++) {
                const [x, y] = cells[index];
                const key = `${x},${y}`;
                this.openingKeys.add(key);
                this.openingByCell.set(key, {
                    ...opening,
                    isStart: index === 0,
                    isEnd: index === cells.length - 1
                });
            }
        }
        for (const opening of this.openings) this.bridgeOpeningGap(opening);
        for (const [key, opening] of this.openingByCell) {
            const cell = this.cells.get(key);
            if (cell) cell.opening = opening;
        }
        this.syncGridWallState();
    }

    syncGridWallState() {
        const gridSystem = this.gameMap.gridSystem;
        if (!gridSystem?.grid) return;
        for (const cell of this.baseCells.values()) {
            const gridCell = gridSystem.grid[cell.x]?.[cell.y];
            if (!gridCell) continue;
            const opening = this.openingByCell.get(`${cell.x},${cell.y}`);
            gridCell.tileWalkable = opening?.type === 'door';
            gridCell.wallBlocksLineOfSight = opening
                ? opening.blocksLineOfSight === true
                : cell.blocksLineOfSight !== false;
            gridCell.walkable = gridCell.tileWalkable && gridCell.objectWalkable;
        }
        gridSystem.invalidatePathfinderCaches?.();
    }

    bridgeOpeningGap(opening) {
        const openingCells = opening.cells || [];
        if (openingCells.length === 0 || openingCells.every(([x, y]) => this.cells.has(`${x},${y}`))) return;
        const { ordered, before, bridgeable } = this._resolveOpeningBridge(
            openingCells,
            opening.axis,
            this.cells
        );
        const existing = ordered.map(([x, y]) => this.cells.get(`${x},${y}`)).find(Boolean);
        if (!existing && !bridgeable) return;
        const template = existing || before;

        for (const [x, y] of ordered) {
            const key = `${x},${y}`;
            if (this.cells.has(key)) continue;
            this.cells.set(key, {
                ...this.wallData.defaults,
                constructionId: template.constructionId,
                finishId: template.finishId,
                heightCells: template.heightCells,
                connectGroup: template.connectGroup,
                x,
                y,
                opening: this.openingByCell.get(key)
            });
        }
    }

    computeMask(cell) {
        let mask = 0;
        for (const direction of WallBuilder.DIRECTIONS) {
            const neighbor = this.cells.get(`${cell.x + direction.dx},${cell.y + direction.dy}`);
            if (neighbor && neighbor.connectGroup === cell.connectGroup) mask |= direction.bit;
        }
        return mask;
    }

    _resolveOpeningBridge(cells, axis, source) {
        const horizontal = axis === 'horizontal';
        const ordered = [...cells].sort((a, b) => horizontal ? a[0] - b[0] : a[1] - b[1]);
        const [startX, startY] = ordered[0];
        const [endX, endY] = ordered[ordered.length - 1];
        const before = source.get(`${startX - (horizontal ? 1 : 0)},${startY - (horizontal ? 0 : 1)}`);
        const after = source.get(`${endX + (horizontal ? 1 : 0)},${endY + (horizontal ? 0 : 1)}`);
        return {
            ordered,
            before,
            after,
            bridgeable: !!before && !!after && before.connectGroup === after.connectGroup
        };
    }

    assignFaces(cell) {
        const centerX = (cell.x + 0.5) * this.cellSize;
        const centerY = (cell.y + 0.5) * this.cellSize;
        const faces = {};
        for (const direction of WallBuilder.DIRECTIONS) {
            const rooms = this.gameMap.regionManager?.regionsAt(
                centerX + direction.dx * this.cellSize,
                centerY + direction.dy * this.cellSize,
                'room'
            ) || [];
            const room = rooms[0] || null;
            faces[direction.name] = {
                roomId: room?.id || null,
                exterior: !room,
                materialId: this.resolveFinishOverride(cell.x, cell.y, direction.name) ||
                    room?.properties?.wallFinishId || cell.finishId
            };
        }
        return faces;
    }

    resolveFinishOverride(x, y, face) {
        const match = [...this.faceOverrides].reverse().find(record => {
            if (record.face !== face) return false;
            const x0 = Math.min(record.cells.from[0], record.cells.to[0]);
            const x1 = Math.max(record.cells.from[0], record.cells.to[0]);
            const y0 = Math.min(record.cells.from[1], record.cells.to[1]);
            const y1 = Math.max(record.cells.from[1], record.cells.to[1]);
            return x >= x0 && x <= x1 && y >= y0 && y <= y1;
        });
        return match?.finishId || null;
    }

    canMergeHorizontal(left, right) {
        if (!left || !right || !WallBuilder.isStraightHorizontal(left.mask) ||
            !WallBuilder.isStraightHorizontal(right.mask) || left.y !== right.y) return false;
        if (right.x !== left.x + 1 || left.constructionId !== right.constructionId || left.heightCells !== right.heightCells) return false;
        return WallMaterialRegistry.DIRECTIONS.every(direction =>
            left.faces[direction].materialId === right.faces[direction].materialId &&
            left.faces[direction].roomId === right.faces[direction].roomId
        );
    }

    // Per-side paint. The one-sided-corner inheritance only makes sense for the
    // face the camera actually sees head-on, so it stays on the south face.
    resolveFaceFinishId(cell, face) {
        const explicit = this.resolveFinishOverride(cell.x, cell.y, face);
        if (explicit) return explicit;
        if (face === 'south') {
            const hasEast = (cell.mask & 2) !== 0;
            const hasWest = (cell.mask & 8) !== 0;
            if (hasEast !== hasWest) {
                const neighbor = this.cells.get(`${cell.x + (hasEast ? 1 : -1)},${cell.y}`);
                if (neighbor) return this.assignFaces(neighbor).south.materialId;
            }
        }
        return cell.faces[face].materialId;
    }

    generatePieces() {
        const cells = [...this.cells.values()]
            .map(cell => ({ ...cell, mask: this.computeMask(cell), faces: this.assignFaces(cell) }))
            .sort((a, b) => a.y - b.y || a.x - b.x);
        const pieces = [];
        for (let index = 0; index < cells.length; index++) {
            const first = cells[index];
            const run = [first];
            while (this.canMergeHorizontal(run[run.length - 1], cells[index + 1])) {
                run.push(cells[++index]);
            }
            const construction = this.registry.getConstruction(first.constructionId);
            if (!construction) throw new Error(`Unknown wall construction "${first.constructionId}"`);
            // The wall's thickness is centered on its cell, so its foot — the
            // line everything sorts and hangs off — is the footprint's south
            // edge, not the cell's.
            const baseline = ((first.y + 0.5) * this.cellSize) + (construction.thickness / 2);
            pieces.push({
                id: `wall-${first.x}-${first.y}-${run.length}`,
                x: first.x,
                y: first.y,
                baseline,
                height: construction.height,
                cells: run,
                constructionId: first.constructionId,
                element: null,
                faces: null,
                cutStates: this.createCutStates(run.length)
            });
        }
        return pieces;
    }

    rebuild() {
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
        for (const piece of this.pieces) this.createPiece(piece);
        this.createAuthoredAttachments(this.wallData.attachments || []);
        this.rebindFixtureObjects();
        this.enforceNodeBudget();
        // Geometry changed, so there is no animation to preserve: settle the
        // height field immediately instead of sweeping every wall down again.
        this.evaluateCutaway(true);
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

    // ── Cutaway state machine ────────────────────────────────────────────────
    //
    // Cutaway is a per-cell state, never an interpolated height: a cell is
    // either standing or lowered, and the frames that join the two are authored
    // sprites, the same way a fence picks a connection frame from its neighbor
    // mask. `desired` is what occlusion wants right now, `cut` is what
    // hysteresis has committed to and what actually draws.

    createCutStates(cellCount) {
        return Array.from({ length: cellCount }, () => ({ desired: false, cut: false, since: 0 }));
    }

    /**
     * A cell can be cut when it is part of a straight horizontal run and the
     * subject is on its north side.
     *
     * Where the map author has laid out rooms, "north side" means the room
     * topology test the binary cutaway used: the cell's north face must border
     * the committed cutaway room and its south face something else, so a wall
     * only drops for the room you are actually standing in. Outside any
     * authored room there is no topology to reason about, and requiring one
     * would mean walls never cut at all on maps that are not built from rooms —
     * so there, occluding the subject is reason enough.
     */
    isCutawayBoundaryCell(cell, subjectRoomIds) {
        if (!WallBuilder.isHorizontalMask(cell.mask) || WallBuilder.isVerticalMask(cell.mask)) return false;
        if (subjectRoomIds.size === 0) return true;
        return this._cutawayRoomIds.has(cell.faces.north.roomId) &&
            subjectRoomIds.has(cell.faces.north.roomId) &&
            cell.faces.south.roomId !== cell.faces.north.roomId;
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

    // Subject bounds + room membership resolved once per evaluation instead of
    // once per piece — regionsAt() is far too costly to run per wall.
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

    // Memoized per sim-tick: resolving the cursor subject forces a DOM hit-test
    // (isMouseInContainer → elementFromPoint), and one evaluation pass asks for
    // it several times — subjects, signature, and room ids all start here.
    getCursorCutawaySubject() {
        const now = SimClock.now();
        if (this._cursorSubjectAt === now) return this._cursorSubject;
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
        return (this.gameMap.regionManager?.regionsAt(point.x, point.y, 'room') || [])
            .map(room => room.id);
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

    // Is this world point inside one of the piece's own wall cells?
    containsPoint(piece, x, y) {
        const cellX = Math.floor(x / this.cellSize);
        const cellY = Math.floor(y / this.cellSize);
        return piece.cells.some(cell => cell.x === cellX && cell.y === cellY);
    }

    // Which cells of this piece the subjects actually stand behind.
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

    // Recomputes what every cell *wants*; hysteresis decides when that becomes
    // the drawn state (see advancePiece). `immediate` commits at once and is
    // used after a rebuild, where there is no previous state worth debouncing.
    refreshCutawayTargets(immediate = false) {
        const now = SimClock.now();
        const subjects = this.getCutawayEvaluationSubjects();
        for (const piece of this.pieces) {
            const construction = this.registry.getConstruction(piece.constructionId);
            if (!construction) continue;
            const cut = this.computeCutCells(piece, construction, subjects);
            piece.cutStates.forEach((state, index) => {
                if (cut[index] !== state.desired) {
                    state.desired = cut[index];
                    state.since = now;
                }
                if (immediate) state.cut = cut[index];
            });
        }
        this._lastEvaluateAt = now;
        this._subjectSignature = this.getSubjectSignature();
    }

    // Cell-granular signature: re-evaluating occlusion only when a subject
    // changes cell is what keeps this off the per-frame path (fixes the stale
    // overlap while walking, without paying for it every frame).
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
        const now = SimClock.now();
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

    // Hysteresis only — a cell flips outright once its wanted state has held
    // long enough. Lowering is quick so the wall gets out of the way; raising
    // waits longer so walking along a wall does not strobe it.
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

    renderPiece(piece) {
        const canvas = piece.element;

        // 'hidden' is purely a view mode — collision, line of sight and room
        // topology stay exactly as they are, only the art stops drawing.
        if (this.presentation === 'hidden') {
            canvas.hidden = true;
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
        const context = canvas.getContext('2d');
        context.imageSmoothingEnabled = false;

        piece.cells.forEach((cell, index) => {
            const x = index * construction.cellSize;
            this.drawWallFrame(context, piece, cell, x, plan.states[index], construction);
            this.applyOpeningAperture(context, cell, x, construction);
        });

        this.propagateCutLine(piece, plan);
    }

    // How far the wall still stands in a given state. Transition frames slope
    // across their own cell, so anything asking "how low does this go" gets the
    // lowered end — a decoration over a transition hides with the cut.
    getStateHeight(state, construction) {
        return state === 'full' ? construction.height : construction.stubHeight;
    }

    // One frame per cell — the whole cutaway is a sprite swap.
    /**
     * The mask to DRAW a cell with, which is not always its connectivity mask.
     *
     * Where an opening removes the whole of a neighbour at this height, the wall
     * genuinely ends at this cell — so it is drawn as a free end, rounded and
     * capped, instead of being sliced off square by the aperture next door. That
     * end art already exists: it is the mask with the arm toward the opening
     * dropped, so nothing new is authored and nothing is drawn outside the cell
     * (which is what would have overlapped the door).
     *
     * A doorway does NOT do this at full height: 128 of 160 leaves a lintel, the
     * wall carries on overhead, and rounding the arm off would cut the wall in
     * half. Lowered to a 28px stub the same doorway removes the neighbour
     * completely, and then the end is real. Connectivity, collision and line of
     * sight are untouched — this only decides which frame gets blitted.
     */
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
        const overlay = this.registry.getFinishOverlay(
            piece.constructionId, this.resolveFaceFinishId(cell, 'south'), state
        );
        if (!overlay) return;
        const overlayX = mask * construction.cellSize;
        context.drawImage(
            overlay,
            overlayX, 0, construction.cellSize, construction.frameHeight,
            x, 0, construction.cellSize, construction.frameHeight
        );
    }

    // Grows a lowered run outward until it covers whole openings. Halving a
    // door looks like a rendering bug; taking the whole thing down reads as a
    // deliberate cutaway.
    expandCutOverOpenings(piece, cut) {
        const spans = new Map();
        piece.cells.forEach((cell, index) => {
            if (!cell.opening) return;
            const id = String(cell.opening.id);
            const span = spans.get(id) || { from: index, to: index, cut: false };
            span.from = Math.min(span.from, index);
            span.to = Math.max(span.to, index);
            span.cut = span.cut || cut[index];
            spans.set(id, span);
        });
        for (const span of spans.values()) {
            if (!span.cut) continue;
            // One cell of slack either side, because the cells next to a
            // lowered run become transition tiles — without the slack the
            // transition lands on the opening itself and a door ends up
            // straddling a step.
            const from = Math.max(0, span.from - 1);
            const to = Math.min(cut.length - 1, span.to + 1);
            for (let index = from; index <= to; index++) cut[index] = true;
        }
    }

    // Would lowering this cell put a transition tile under an opening?
    hasOpening(piece, index) {
        return !!piece.cells[index]?.opening;
    }

    /**
     * Per-cell frame states for this piece. `up`/`down`/moving-opening force a
     * uniform state; in cutaway the committed per-cell flags pick `full` or
     * `stub`, and every standing cell that touches a lowered one becomes the
     * authored transition frame that joins them.
     */
    getRenderPlan(piece, construction) {
        const count = piece.cells.length;
        const cut = this.getResolvedCutStates(piece, count);

        const states = (cut || new Array(count).fill(false)).map((isCut, index) => {
            if (isCut) return 'stub';
            // The authored ramp art is a straight horizontal wall. Applying it
            // to a corner or junction would erase its vertical arm, so those
            // structural cells remain full while the neighboring run handles
            // the height change.
            if (!WallBuilder.isStraightHorizontal(piece.cells[index]?.mask)) return 'full';
            const nextCut = cut && (index + 1 < count
                ? cut[index + 1]
                : this.getNeighborCutState(piece, index, 1));
            const previousCut = cut && (index > 0
                ? cut[index - 1]
                : this.getNeighborCutState(piece, index, -1));
            if (nextCut) return 'rampDown';
            if (previousCut) return 'rampUp';
            return 'full';
        });
        return {
            mode: states.every(state => state === 'full') ? 'full'
                : states.every(state => state === 'stub') ? 'stub'
                : 'cut',
            states
        };
    }

    getResolvedCutStates(piece, count = piece.cells.length) {
        // "Walls Down" is an explicit global presentation, not an occlusion
        // cutaway. Every wall shape must use its stub frame; the transition and
        // structural-anchor rules below intentionally keep some cells standing
        // and therefore apply only to cutaway mode.
        if (this.presentation === 'down') return new Array(count).fill(true);

        const raw = this.getRawCutStates(piece, count);
        if (!raw || !piece.cells.every(cell => this.isHorizontalOnlyCell(cell))) return raw;

        // Cutaway height belongs to the structural run, not to its render
        // pieces. Resolve the whole horizontal chain at once so a paint/room
        // seam cannot independently create a second transition beside the
        // first one.
        const chain = this.getHorizontalCellChain(piece.cells[0]);
        const rawByPiece = new Map();
        const cut = chain.map(cell => {
            const host = this.findPieceForCell(cell.x, cell.y);
            if (!host) return false;
            if (!rawByPiece.has(host)) {
                rawByPiece.set(host, this.getRawCutStates(host, host.cells.length));
            }
            const index = host.cells.findIndex(candidate => candidate.x === cell.x && candidate.y === cell.y);
            return rawByPiece.get(host)?.[index] === true;
        });

        // Straight endpoints abutting vertical structure remain standing. Pure
        // end caps keep their requested state: a cap can belong to a long stub
        // run as long as that run eventually reaches one valid transition.
        this.resolveHorizontalBoundary(chain, cut, 0);
        this.resolveHorizontalBoundary(chain, cut, cut.length - 1);

        // Opposing transitions may not touch. This most often happens when a
        // two-cell raised preview straddles a paint seam: extend the standing
        // island by one cell on both sides, leaving a full-height plateau
        // between the stepped transition tiles.
        for (let index = 0; index < cut.length;) {
            if (cut[index]) {
                index++;
                continue;
            }
            const from = index;
            while (index < cut.length && !cut[index]) index++;
            const to = index - 1;
            const bounded = from > 0 && index < cut.length && cut[from - 1] && cut[index];
            const length = to - from + 1;
            if (bounded && length === 1) {
                cut[from] = true;
            } else if (bounded && length === 2) {
                cut[from - 1] = false;
                cut[index] = false;
            }
        }

        // A completely lowered freestanding run has no transition at all. Keep
        // one end anchored at full height, leaving the opposite end cap free to
        // remain a stub. This is the minimum standing area that gives the whole
        // lowered run somewhere logical to return to full height.
        this.ensureHorizontalChainAnchor(chain, cut);

        // A full-height cap cannot itself use the straight transition artwork.
        // Reserve its inward straight neighbor for that transition whenever the
        // run beyond it is lowered.
        this.reserveTransitionBesideFullCap(chain, cut, 0, 1);
        this.reserveTransitionBesideFullCap(chain, cut, cut.length - 1, -1);

        const resolvedByCell = new Map(chain.map((cell, index) => [`${cell.x},${cell.y}`, cut[index]]));
        return piece.cells.map(cell => resolvedByCell.get(`${cell.x},${cell.y}`) === true);
    }

    getRawCutStates(piece, count = piece.cells.length) {
        const cut = this.getBaseCutStates(piece, count);
        if (cut) {
            // Never cut through half a door or window: an opening is one
            // object, so the lowered run swallows all of its cells or none.
            this.expandCutOverOpenings(piece, cut);
            // Keep the complete object span lowered while it moves. The padded
            // cells push any transition away from the art instead of drawing a
            // height change through a painting or window.
            this.lowerBehindMovingObjects(piece, cut);
            // Vertical arms, corners, and junctions remain tall. Pure horizontal
            // end caps are resolved with their neighboring cells afterward so
            // they can lower when there is room for a valid transition.
            for (let index = 0; index < count; index++) {
                const mask = piece.cells[index]?.mask ?? 0;
                if (WallBuilder.isVerticalMask(mask) || !WallBuilder.isHorizontalMask(mask)) cut[index] = false;
            }
        }
        return cut;
    }

    isHorizontalOnlyCell(cell) {
        if (!cell) return false;
        const mask = cell?.mask ?? this.computeMask(cell);
        return WallBuilder.isHorizontalMask(mask) && !WallBuilder.isVerticalMask(mask);
    }

    resolveHorizontalBoundary(chain, cut, boundaryIndex) {
        const boundary = chain[boundaryIndex];
        if (!boundary) return;
        if (!WallBuilder.isEndCapMask(this.computeMask(boundary))) {
            // This horizontal sequence terminates at a corner, junction, or
            // other structural boundary outside the sequence. Its boundary
            // straight cell must stand so it can transition into the stub run.
            if (!boundary.opening) cut[boundaryIndex] = false;
        }
    }

    ensureHorizontalChainAnchor(chain, cut) {
        if (cut.length === 0 || cut.some(isCut => !isCut)) return;
        const anchorIndex = cut.length - 1;
        const transitionIndex = anchorIndex - 1;
        const anchor = chain[anchorIndex];
        const transition = chain[transitionIndex];
        if (!anchor || anchor.opening || !transition || transition.opening ||
            !WallBuilder.isStraightHorizontal(this.computeMask(transition))) {
            cut.fill(false);
            return;
        }
        cut[anchorIndex] = false;
        cut[transitionIndex] = false;
    }

    reserveTransitionBesideFullCap(chain, cut, capIndex, inwardDirection) {
        const cap = chain[capIndex];
        if (!cap || cut[capIndex] || !WallBuilder.isEndCapMask(this.computeMask(cap))) return;
        const transitionIndex = capIndex + inwardDirection;
        const transition = chain[transitionIndex];
        if (transition && WallBuilder.isStraightHorizontal(this.computeMask(transition)) && !transition.opening) {
            cut[transitionIndex] = false;
        }
    }

    getHorizontalCellChain(seed) {
        if (!seed || !this.isHorizontalOnlyCell(seed)) return [];
        // `piece.cells` are render-time clones with a cached mask, while
        // `this.cells` contains the canonical authored cells. Compute the mask
        // for canonical neighbors instead of expecting that cache to exist.
        const compatible = cell => this.isHorizontalOnlyCell(cell) &&
            cell.connectGroup === seed.connectGroup &&
            cell.constructionId === seed.constructionId &&
            cell.heightCells === seed.heightCells;
        let left = seed.x;
        while (compatible(this.cells.get(`${left - 1},${seed.y}`))) left--;
        const chain = [];
        for (let x = left;; x++) {
            const cell = this.cells.get(`${x},${seed.y}`);
            if (!compatible(cell)) break;
            chain.push(cell);
        }
        return chain;
    }

    getNeighborCutState(piece, index, direction) {
        const cell = piece.cells[index];
        if (!cell) return false;
        const neighborPiece = this.findPieceForCell(cell.x + direction, cell.y);
        if (!neighborPiece || neighborPiece === piece) return false;
        const neighborIndex = neighborPiece.cells.findIndex(neighbor =>
            neighbor.x === cell.x + direction && neighbor.y === cell.y
        );
        if (neighborIndex < 0) return false;
        return this.getResolvedCutStates(neighborPiece)?.[neighborIndex] === true;
    }

    /**
     * Which cells this piece wants lowered before transitions are worked out.
     * `null` means "nothing is lowered and nothing can be" — the `up` mode,
     * where even a drag should not open a window.
     */
    getBaseCutStates(piece, count) {
        if (this.presentation === 'down') return new Array(count).fill(true);
        if (this.presentation !== 'cutaway') return null;
        return piece.cutStates.map(state => state.cut);
    }

    // A finish or room-face change splits the render canvases, but it remains
    // one straight construction. That visual seam must not behave like a
    // structural corner whose endpoint stays tall.
    continuesAcrossPieceBoundary(piece, index, direction) {
        const cell = piece.cells[index];
        if (!cell || !WallBuilder.isStraightHorizontal(cell.mask)) return false;
        const neighbor = this.cells.get(`${cell.x + direction},${cell.y}`);
        if (!neighbor || neighbor.connectGroup !== cell.connectGroup ||
            neighbor.constructionId !== cell.constructionId ||
            neighbor.heightCells !== cell.heightCells) return false;
        return WallBuilder.isStraightHorizontal(this.computeMask(neighbor));
    }

    // Only the candidate host wall cuts away. Wall faces overlap vertically,
    // so comparing the dragged object's x-range against every piece would lower
    // unrelated wall rows that happen to sit above or below the cursor.
    lowerBehindMovingObjects(piece, cut) {
        if (this._movingObjects.size === 0) return;
        const padding = Math.max(0, SiteConfig.wallSystem.cutawayPaddingCells) * this.cellSize;
        const left = piece.x * this.cellSize;
        for (const object of this._movingObjects.values()) {
            const spans = this.getMovingObjectRevealSpans(object)
                .filter(span => span.piece === piece);
            if (spans.length === 0) continue;
            for (let index = 0; index < cut.length; index++) {
                const cellLeft = left + (index * this.cellSize);
                if (spans.some(span =>
                    cellLeft + this.cellSize > span.left - padding &&
                    cellLeft < span.right + padding
                )) cut[index] = true;
            }
        }
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

    /**
     * How far the hole is pulled in from the opening's declared footprint, per
     * side. An opening's footprint is its grid extent, but its sprite may carry
     * a transparent margin around the frame — clear the whole footprint and you
     * see a gap of missing wall around it. The inset must therefore be at least
     * the art's margin; erring large is free, because the sprite covers it.
     */
    getApertureInsets(opening) {
        const object = this.gameMap.getObjectById?.(opening.id);
        const configured = object?.getConfig?.('wallOpeningConfig.apertureInset') ??
            SiteConfig.wallSystem.apertureInsetPx;
        const uniform = Number.isFinite(configured) ? configured : 0;
        const insets = {
            top: uniform, right: uniform, bottom: uniform, left: uniform,
            ...(Number.isFinite(configured) ? {} : configured || {})
        };
        // An opening that reaches the floor has no bottom frame to tuck under,
        // and any inset there leaves a sliver of wall inside the doorway.
        if (!(Number(opening.sillHeight) > 0)) insets.bottom = 0;
        return insets;
    }

    /**
     * The aperture is a hole straight through the wall. Clearing where no wall
     * is drawn does nothing, so a lowered cell simply loses its door along with
     * the rest of the wall and needs no special case — but it has to be cleared
     * over the WHOLE depth the art occupies, which reaches past the baseline.
     *
     * Side insets apply only at the ends of the opening, never between its
     * cells, so a multi-cell window still reads as one hole.
     */
    applyOpeningAperture(context, cell, x, construction) {
        const opening = cell.opening;
        if (!opening) return;
        const openingHeight = Utility.clamp(Number(opening.openingHeight) || 0, 0, construction.height);
        const sillHeight = Utility.clamp(Number(opening.sillHeight) || 0, 0, construction.height - openingHeight);
        const insets = this.getApertureInsets(opening);

        const bottom = construction.baselineRow + 1 - sillHeight - insets.bottom;
        const height = openingHeight - insets.bottom - insets.top;
        if (height <= 0) return;

        const horizontal = opening.axis !== 'vertical';
        const left = x + (horizontal && opening.isStart ? insets.left : 0);
        const right = x + construction.cellSize - (horizontal && opening.isEnd ? insets.right : 0);
        if (right <= left) return;

        // A wall running SOUTH draws past its own baseline, down into the next
        // cell's footprint. An opening that reaches the floor passes through
        // that stretch as well, so the hole runs to the bottom of the frame
        // rather than stopping at the baseline — otherwise a doorway in a
        // north-south wall leaves a sliver of wall hanging under each of its
        // cells. A sill keeps the baseline, because the wall below a window is
        // solid and that stretch is part of it.
        const top = bottom - height;
        const depth = (sillHeight > 0 ? bottom : construction.frameHeight) - top;
        if (depth <= 0) return;
        context.clearRect(left, top, right - left, depth);
    }

    // World Y of the wall top over [x0, x1), taking the lowest point in that
    // span — a child straddling a transition frame follows the lowered side.
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

        const now = SimClock.now();
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
        this.gameMap.syncWallTileOverlay?.();
        this.evaluateCutaway(true);
        this.gameMap.eventManager?.emit(EVENTS.WALL_PRESENTATION_CHANGED, { mapId: this.gameMap.id, mode });
        return true;
    }

    setFaceFinish(record) {
        if (!record || !this.registry.getFinish(record.finishId) ||
            !WallMaterialRegistry.DIRECTIONS.includes(record.face) ||
            !record.cells?.from || !record.cells?.to) return false;
        this.faceOverrides.push({
            mapId: this.gameMap.id,
            axis: record.axis || (record.cells.from[1] === record.cells.to[1] ? 'horizontal' : 'vertical'),
            cells: { from: [...record.cells.from], to: [...record.cells.to] },
            face: record.face,
            finishId: record.finishId
        });
        this.rebuild();
        return true;
    }

    setWallCell(x, y, data = null) {
        const key = `${x},${y}`;
        if (data === null) this.baseCells.delete(key);
        else this.baseCells.set(key, {
            ...this.wallData.defaults,
            ...data,
            x,
            y,
            constructionId: data.constructionId || this.wallData.defaults.constructionId,
            finishId: data.finishId || this.wallData.defaults.finishId,
            heightCells: data.heightCells || this.wallData.defaults.heightCells,
            connectGroup: data.connectGroup || this.wallData.defaults.connectGroup
        });
        this.reindexOpenings();
        this.rebuild();
        this.gameMap.eventManager?.emit(EVENTS.WALL_GEOMETRY_CHANGED, { mapId: this.gameMap.id, x, y, builder: this });
    }

    findPieceForCell(cellX, cellY) {
        return this._pieceByCell.get(`${cellX},${cellY}`) || null;
    }

    getOpeningAxis(object) {
        const facing = object.getConfig?.('facingDirection', object.facingDirection);
        if (facing === 'E' || facing === 'W') return 'vertical';
        if (facing === 'N' || facing === 'S') return 'horizontal';
        return object.size.width >= object.size.height ? 'horizontal' : 'vertical';
    }

    // How far the wall's foot sits above the cell's south edge, because the
    // thickness is centered on the cell rather than flush with it.
    getFootInset(constructionId = this.wallData.defaults?.constructionId) {
        const construction = this.registry.getConstruction(constructionId);
        return construction ? (this.cellSize - construction.thickness) / 2 : 0;
    }

    getDefaultOpeningHeight(type) {
        const defaults = SiteConfig.wallSystem.defaultOpeningHeightPx || {};
        return Number(defaults[type]) || Number(defaults.door) || 0;
    }

    getOpeningObjectOffset(object, opening = null) {
        const wallOpening = object?.getConfig?.('wallOpeningConfig', {}) || {};
        const offset = object?.getConfig?.('wallOpeningConfig.placementOffset', {}) || {};
        const type = String(object?.type || '').toLowerCase();
        const openingHeight = Number(opening?.openingHeight ?? wallOpening.openingHeight) ||
            this.getDefaultOpeningHeight(type);
        const sillHeight = Number(opening?.sillHeight ?? wallOpening.sillHeight) || 0;
        return {
            x: Number(offset.x) || 0,
            // Openings hang off the wall's foot, not the cell's south edge, so
            // they ride the centered baseline with the wall around them.
            y: (type === 'window'
                ? this.cellSize - openingHeight - sillHeight
                : Number(offset.y) || 0) - this.getFootInset()
        };
    }

    getOpeningSillHeights(object) {
        const wallOpening = object?.getConfig?.('wallOpeningConfig', {}) || {};
        const defaultSill = Math.max(0, Number(wallOpening.sillHeight) || 0);
        if (String(object?.type || '').toLowerCase() !== 'window' ||
            this.getOpeningAxis(object) !== 'horizontal' ||
            wallOpening.adjustableSillHeight !== true) return [defaultSill];

        const min = Math.max(0, Number(wallOpening.minSillHeight) || 0);
        const max = Math.max(min, Number(wallOpening.maxSillHeight) || min);
        const step = Math.max(1, Number(wallOpening.sillHeightStep) || this.cellSize);
        const heights = [];
        for (let sill = min; sill <= max; sill += step) heights.push(sill);
        if (!heights.includes(defaultSill)) heights.push(defaultSill);
        return heights;
    }

    getOpeningPlacementCandidates(object, x = object.posX, y = object.posY) {
        const axis = this.getOpeningAxis(object);
        const count = Math.max(1, Math.round((axis === 'horizontal' ? object.size.width : object.size.height) / this.cellSize));
        const wallOpening = object?.getConfig?.('wallOpeningConfig', {}) || {};
        const openingHeight = Number(wallOpening.openingHeight) ||
            this.getDefaultOpeningHeight(String(object?.type || '').toLowerCase());

        return this.getOpeningSillHeights(object).map(sillHeight => {
            const offset = this.getOpeningObjectOffset(object, { openingHeight, sillHeight });
            const x0 = Math.round((x - offset.x) / this.cellSize);
            const y0 = Math.round((y - offset.y) / this.cellSize);
            const position = {
                x: x0 * this.cellSize + offset.x,
                y: y0 * this.cellSize + offset.y
            };
            return {
                axis,
                openingHeight,
                sillHeight,
                position,
                cells: Array.from({ length: count }, (_, index) => [
                    x0 + (axis === 'horizontal' ? index : 0),
                    y0 + (axis === 'vertical' ? index : 0)
                ]),
                distance: Math.hypot(position.x - x, position.y - y)
            };
        }).sort((left, right) => left.distance - right.distance);
    }

    getOpeningCellsForObject(object, x = object.posX, y = object.posY) {
        const placement = this.resolveOpeningPlacement(object, x, y);
        return placement?.cells || this.getOpeningPlacementCandidates(object, x, y)[0]?.cells || [];
    }

    getOpeningBounds(opening) {
        const xs = opening.cells.map(cell => cell[0]);
        const ys = opening.cells.map(cell => cell[1]);
        return {
            x: Math.min(...xs) * this.cellSize,
            y: Math.min(...ys) * this.cellSize,
            width: (Math.max(...xs) - Math.min(...xs) + 1) * this.cellSize,
            height: (Math.max(...ys) - Math.min(...ys) + 1) * this.cellSize
        };
    }

    getOpeningRenderZIndex(object, x = object.posX, y = object.posY) {
        const bounds = this.getOpeningPlacementBounds(object, x, y);
        if (!bounds) return null;
        return this.gameMap.getDepthZIndex(bounds.y + bounds.height) + 1;
    }

    getOpeningPlacementBounds(object, x = object.posX, y = object.posY) {
        const placement = this.resolveOpeningPlacement(object, x, y);
        return placement ? this.getOpeningBounds(placement) : null;
    }

    canBridgeOpeningCells(cells, axis) {
        if (cells.every(([x, y]) => this.baseCells.has(`${x},${y}`))) return true;
        return this._resolveOpeningBridge(cells, axis, this.baseCells).bridgeable;
    }

    /**
     * An opening needs a straight run to sit in. A cell that also carries a
     * perpendicular arm — a corner, a tee, a junction — is where two walls
     * meet, and a door or window dropped there would hang over the wall coming
     * in from the side.
     */
    isOpeningCellCompatible(mask, axis) {
        return axis === 'horizontal'
            ? WallBuilder.isHorizontalMask(mask) && !WallBuilder.isVerticalMask(mask)
            : WallBuilder.isVerticalMask(mask) && !WallBuilder.isHorizontalMask(mask);
    }

    isOpeningPlacementValid(object, placement) {
        if (!placement || !this.canBridgeOpeningCells(placement.cells, placement.axis)) return false;
        const cellsAreValid = placement.cells.every(([cellX, cellY]) => {
            const occupied = this.openingByCell.get(`${cellX},${cellY}`);
            if (occupied && String(occupied.id) !== String(object.id)) return false;
            const cell = this.baseCells.get(`${cellX},${cellY}`);
            if (!cell) return true;
            return this.isOpeningCellCompatible(this.computeMask(cell), placement.axis);
        });
        if (!cellsAreValid || placement.axis !== 'horizontal') return cellsAreValid;

        const openingBounds = this.getOpeningFaceBounds(placement);
        return !this.fixtures.some(record => {
            if (String(record.id) === String(object.id)) return false;
            const fixture = this.gameMap.getObjectById?.(record.id);
            if (!fixture) return false;
            return this.rectsOverlap(openingBounds, {
                left: fixture.posX,
                right: fixture.posX + fixture.size.width,
                top: fixture.posY,
                bottom: fixture.posY + fixture.size.height
            });
        });
    }

    getOpeningFaceBounds(opening) {
        const footprint = this.getOpeningBounds(opening);
        const baseline = footprint.y + this.cellSize - this.getFootInset();
        const bottom = baseline - (Number(opening.sillHeight) || 0);
        return {
            left: footprint.x,
            right: footprint.x + footprint.width,
            top: bottom - (Number(opening.openingHeight) || 0),
            bottom
        };
    }

    rectsOverlap(left, right) {
        return left.right > right.left && left.left < right.right &&
            left.bottom > right.top && left.top < right.bottom;
    }

    resolveOpeningPlacement(object, x = object.posX, y = object.posY) {
        return this.getOpeningPlacementCandidates(object, x, y)
            .find(placement => this.isOpeningPlacementValid(object, placement)) || null;
    }

    canPlaceOpeningObject(object, x = object.posX, y = object.posY) {
        return this.resolveOpeningPlacement(object, x, y) !== null;
    }

    createOpeningRecord(object, placement = this.resolveOpeningPlacement(object)) {
        if (!placement) return null;
        const type = String(object.type).toLowerCase();
        return {
            id: String(object.id),
            type,
            cells: placement.cells,
            axis: placement.axis,
            openingHeight: placement.openingHeight,
            sillHeight: type === 'window' ? placement.sillHeight : 0,
            continuesTopTrim: object.getConfig?.('wallOpeningConfig.continuesTopTrim', false) === true,
            blocksLineOfSight: false
        };
    }

    attachOpeningObject(object, opening) {
        const slot = new WallOpeningSlot(this, opening, object);
        const offset = this.getOpeningObjectOffset(object, opening);
        object.posX = slot.posX + offset.x;
        object.posY = slot.posY + offset.y;
        object.updatePosition?.();
        this.gameMap.gridSystem?.updateObjectPosition?.(object);
        const attachment = this.gameMap.container?.attachments?.attach(slot, object, 'opening', {
            inheritFacing: false,
            collision: 'inherit',
            zBias: 1
        });
        if (!attachment) return false;
        this.openingSlots.set(String(opening.id), slot);
        object._wallOpeningSlotId = String(opening.id);
        const [cellX, cellY] = opening.cells?.[0] || [];
        const piece = this.findPieceForCell(cellX, cellY);
        if (piece) slot.setCutLine(piece);
        return true;
    }

    bindOpeningObjects() {
        for (const opening of this.openings) {
            const object = this.gameMap.getObjectById?.(opening.id);
            if (object) this.attachOpeningObject(object, opening);
        }
    }

    beginOpeningMove(object) {
        const id = String(object.id);
        this._movingOpeningIds.add(id);
        this._movingObjects.set(id, object);
        this._movingRevealPieceIds.set(id, new Set(
            this.getMovingObjectRevealSpans(object).map(span => span.piece.id)
        ));
        this.gameMap.container?.attachments?.detach?.(object);
        this.openings = this.openings.filter(opening => String(opening.id) !== id);
        this.openingSlots.delete(id);
        this.reindexOpenings();
        this.rebuild();
    }

    finishOpeningMove(object) {
        const id = String(object.id);
        const placement = this.resolveOpeningPlacement(object);
        if (!placement) {
            this._movingOpeningIds.delete(id);
            this._movingObjects.delete(id);
            this._movingRevealPieceIds.delete(id);
            this.evaluateCutaway(true);
            return false;
        }
        object.posX = placement.position.x;
        object.posY = placement.position.y;
        object.updatePosition?.();
        const opening = this.createOpeningRecord(object, placement);
        this.openings.push(opening);
        this.reindexOpenings();
        this.rebuild();
        const attached = this.attachOpeningObject(object, opening);
        this._movingOpeningIds.delete(id);
        this._movingObjects.delete(id);
        this._movingRevealPieceIds.delete(id);
        this.evaluateCutaway(true);
        if (attached && object.type === 'DOOR') this.gameMap.buildDoorRoomTopology?.();
        return attached;
    }

    // The object is not coming back to this wall — release the move state and
    // let the walls settle without it.
    cancelOpeningMove(object) {
        const id = String(object.id);
        this._movingOpeningIds.delete(id);
        this._movingObjects.delete(id);
        this._movingRevealPieceIds.delete(id);
        this.evaluateCutaway(true);
    }

    cancelFixtureMove(object) {
        const id = String(object.id);
        this._movingObjects.delete(id);
        this._movingRevealPieceIds.delete(id);
        this.evaluateCutaway(true);
    }

    createAuthoredAttachments(records) {
        for (const record of records) {
            if (this.decorations.some(decoration => decoration.id === record.id)) continue;
			const [cellX, cellY] = record.cells?.from || [record.cellX, record.cellY];
            const piece = this.findPieceForCell(cellX, cellY);
            const surface = piece?.faces?.[record.face];
            if (!surface) continue;
            const decoration = new WallDecoration(this, record);
			const localU = Number(record.u) <= 1
				? Utility.clamp(Number(record.u), 0, 1) * this.cellSize
				: Utility.clamp(Number(record.u), 0, this.cellSize);
			const surfaceU = ((cellX - piece.x) * this.cellSize) + localU;
            const attachment = this.gameMap.container?.attachments?.attach(
                surface,
                decoration,
                record.socketId || 'surface',
                {
                    surfacePoint: { u: surfaceU, v: record.v },
                    surfaceWidth: record.width,
                    inheritFacing: false,
                    zBias: 1
                }
            );
            if (!attachment) {
                decoration.dispose();
                continue;
            }
            decoration.wallAttachmentRecord = { ...record };
            this.decorations.push(decoration);
        }
    }

    // Blockers follow the centered footprint, not the whole cell: sight lines
    // graze past a wall's ends the way the art says they should.
    // ── Wall fixtures ────────────────────────────────────────────────────────
    //
    // A fixture hangs on a wall face rather than cutting through it, so unlike
    // an opening it has no cell footprint: it snaps to a point on a face, free
    // along the wall and up and down it, but never off it.

    /**
     * The wall face under a point. Faces are 160px tall but rows are 32px
     * apart, so a point sits inside several pieces' bands at once — the one
     * that matters is the frontmost, the same one that would be drawn over the
     * others. Taking the first match instead hangs the fixture on a wall rows
     * behind, which then clamps it to that wall's foot: the "always low, and
     * sometimes through the floor" symptom.
     */
    getFixtureFaceForPoint(x, y) {
        const construction = this.registry.getConstruction(this.wallData.defaults?.constructionId);
        if (!construction) return null;
        let best = null;
        for (const piece of this.pieces) {
            // Only a straight horizontal run presents a face to this camera.
            if (!piece.cells.every(cell => this.isHorizontalOnlyCell(cell))) continue;
            const left = piece.x * this.cellSize;
            const right = left + (piece.cells.length * this.cellSize);
            const top = piece.baseline - construction.height;
            if (x < left || x > right || y < top || y > piece.baseline) continue;
            if (best && piece.baseline <= best.piece.baseline) continue;
            best = { piece, surface: piece.faces?.south, left, right, top, construction };
        }
        return best;
    }

    /**
     * Snaps a dropped fixture onto the wall face under it, keeping the whole
     * sprite on the wall.
     * @returns {{piece: object, position: {x: number, y: number}, u: number, v: number}|null}
     */
    getFixturePlacementCandidate(object, x = object.posX, y = object.posY) {
        const width = object.size?.width || 0;
        const height = object.size?.height || 0;
        const face = this.getFixtureFaceForPoint(x + (width / 2), y + (height / 2));
        if (!face) return null;

        const positionX = Utility.clamp(x, face.left, face.right - width);
        const positionY = Utility.clamp(y, face.top, face.piece.baseline - height);
        return {
            piece: face.piece,
            surface: face.surface,
            construction: face.construction,
            position: { x: positionX, y: positionY },
            u: positionX - face.left + (width / 2),
            v: (positionY - face.top + (height / 2)) / Math.max(1, face.construction.height)
        };
    }

    resolveFixturePlacement(object, x = object.posX, y = object.posY) {
        const placement = this.getFixturePlacementCandidate(object, x, y);
        if (!placement || this.overlapsWallFaceObstacle(
            placement.piece,
            placement.construction || this.registry.getConstruction(placement.piece.constructionId),
            object,
            placement.position.x,
            placement.position.y
        )) return null;
        return placement;
    }

    canPlaceFixtureObject(object, x = object.posX, y = object.posY) {
        return this.resolveFixturePlacement(object, x, y) !== null;
    }

    /**
     * Everything already mounted on this stretch of wall, as world rects: the
     * openings cut into it and the other fixtures hanging on it. Two things
     * cannot occupy the same patch of wall, so a painting may not cover a
     * window, a door, or another painting.
     */
    getWallFaceObstacles(piece, construction, excludeId) {
        const obstacles = [];
        for (const cell of piece.cells) {
            const opening = cell.opening;
            if (!opening || String(opening.id) === String(excludeId)) continue;
            const openingHeight = Utility.clamp(Number(opening.openingHeight) || 0, 0, construction.height);
            const sillHeight = Utility.clamp(Number(opening.sillHeight) || 0, 0, construction.height - openingHeight);
            const bottom = piece.baseline - sillHeight;
            obstacles.push({
                left: cell.x * this.cellSize,
                right: (cell.x + 1) * this.cellSize,
                top: bottom - openingHeight,
                bottom
            });
        }
        for (const record of this.fixtures) {
            if (String(record.id) === String(excludeId)) continue;
            const other = this.gameMap.getObjectById?.(record.id);
            if (!other) continue;
            obstacles.push({
                left: other.posX,
                right: other.posX + other.size.width,
                top: other.posY,
                bottom: other.posY + other.size.height
            });
        }
        return obstacles;
    }

    overlapsWallFaceObstacle(piece, construction, object, x, y) {
        const right = x + object.size.width;
        const bottom = y + object.size.height;
        const bounds = { left: x, right, top: y, bottom };
        return this.getWallFaceObstacles(piece, construction, object.id).some(area =>
            this.rectsOverlap(bounds, area)
        );
    }

    createFixtureRecord(object, placement = this.resolveFixturePlacement(object)) {
        if (!placement) return null;
        const [cellX, cellY] = [placement.piece.x, placement.piece.y];
        return {
            id: String(object.id),
            mapId: this.gameMap.id,
            cells: { from: [cellX, cellY], to: [cellX, cellY] },
            face: 'south',
            socketId: 'surface',
            u: placement.u,
            v: placement.v,
            width: object.size.width,
            height: object.size.height
        };
    }

    attachFixtureObject(object, record) {
        const [cellX, cellY] = record.cells?.from || [record.cellX, record.cellY];
        const piece = this.findPieceForCell(cellX, cellY);
        const surface = piece?.faces?.[record.face || 'south'];
        const construction = this.registry.getConstruction(piece?.constructionId);
        if (!surface || !construction) return false;

        const localU = Number(record.u) <= 1
            ? Utility.clamp(Number(record.u), 0, 1) * this.cellSize
            : Number(record.u);
        const u = ((cellX - piece.x) * this.cellSize) + localU;

        // Place it before attaching, the way an opening is placed into its
        // slot: the socket keeps it there afterwards, but the authored u/v is
        // what decides where on the wall it actually hangs.
        const faceTop = piece.baseline - construction.height;
        object.posX = (piece.x * this.cellSize) + u - (object.size.width / 2);
        object.posY = faceTop + (Utility.clamp(Number(record.v) || 0, 0, 1) * construction.height) -
            (object.size.height / 2);
        object.updatePosition?.();

        const attachment = this.gameMap.container?.attachments?.attach(
            surface, object, record.socketId || 'surface',
            {
                surfacePoint: { u, v: record.v },
                surfaceWidth: object.size.width,
                inheritFacing: false,
                zBias: 1
            }
        );
        return !!attachment;
    }

    bindFixtureObjects() {
        for (const record of this.fixtures) {
            const object = this.gameMap.getObjectById?.(record.id);
            if (object) this.attachFixtureObject(object, record);
        }
    }

    // rebuild() recreates every piece and its face surfaces, but a fixture
    // stays attached to the surface from the previous build — it stops
    // receiving cut-line updates and keeps the old piece graph alive. Only
    // fixtures that are currently attached are re-anchored; first-time
    // binding stays with bindFixtureObjects() so initialize() ordering holds.
    rebindFixtureObjects() {
        const attachments = this.gameMap.container?.attachments;
        if (!attachments) return;
        for (const record of this.fixtures) {
            const object = this.gameMap.getObjectById?.(record.id);
            if (object && attachments.getAttachment(object)) {
                this.attachFixtureObject(object, record);
            }
        }
    }

    beginFixtureMove(object) {
        const id = String(object.id);
        this._movingObjects.set(id, object);
        this._movingRevealPieceIds.set(id, new Set(
            this.getMovingObjectRevealSpans(object).map(span => span.piece.id)
        ));
        this.gameMap.container?.attachments?.detach?.(object);
        this.fixtures = this.fixtures.filter(record => String(record.id) !== id);
        this.evaluateCutaway(true);
    }

    finishFixtureMove(object) {
        const id = String(object.id);
        this._movingObjects.delete(id);
        this._movingRevealPieceIds.delete(id);
        const record = this.createFixtureRecord(object);
        if (!record) {
            this.evaluateCutaway(true);
            return false;
        }
        const placement = this.resolveFixturePlacement(object);
        object.posX = placement.position.x;
        object.posY = placement.position.y;
        object.updatePosition?.();
        this.fixtures.push(record);
        const attached = this.attachFixtureObject(object, record);
        this.evaluateCutaway(true);
        return attached;
    }

    getLightBlockers() {
        return [...this.cells.values()]
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
    }

    serializeState() {
        return {
            version: 6,
            presentation: this.presentation,
            faceOverrides: this.faceOverrides.map(record => Utility.deepClone(record)),
            attachments: this.decorations.map(decoration => Utility.deepClone(decoration.wallAttachmentRecord)),
            fixtures: this.fixtures.map(record => Utility.deepClone(record)),
            openings: this.openings.map(opening => Utility.deepClone(opening))
        };
    }

    restoreState(state = {}) {
        const savedOverrides = state.version >= 3 && Array.isArray(state.faceOverrides)
            ? Utility.deepClone(state.faceOverrides)
            : [];
        const savedGeometry = new Set(savedOverrides.map(record => this.getFaceOverrideGeometryKey(record)));
        this.faceOverrides = [
            ...this.authoredFaceOverrides.filter(record => !savedGeometry.has(this.getFaceOverrideGeometryKey(record))),
            ...savedOverrides
        ];
        if (Array.isArray(state.attachments)) this.wallData.attachments = Utility.deepClone(state.attachments);
        for (const slot of this.openingSlots.values()) {
            for (const object of slot.sockets.occupantsOf('opening')) {
                this.gameMap.container?.attachments?.detach?.(object);
            }
        }
        this.openingSlots.clear();
        this.openings = state.version >= 4 && Array.isArray(state.openings)
            ? Utility.deepClone(state.openings)
            : Utility.deepClone(this.authoredOpenings);
        for (const record of this.fixtures) {
            this.gameMap.container?.attachments?.detach?.(this.gameMap.getObjectById?.(record.id));
        }
        this.fixtures = state.version >= 5 && Array.isArray(state.fixtures)
            ? Utility.deepClone(state.fixtures)
            : Utility.deepClone(this.authoredFixtures);
		if (state.version === 5) {
			for (const record of this.fixtures) {
				const [cellX, cellY] = record.cells?.from || [record.cellX, record.cellY];
				const piece = this.findPieceForCell(cellX, cellY);
				const construction = this.registry.getConstruction(piece?.constructionId);
				const fixtureHeight = Number(record.height) ||
					Number(this.gameMap.getObjectById?.(record.id)?.size?.height) || 0;
				if (!construction?.height || !fixtureHeight) continue;
				record.v = Utility.clamp(
					(Number(record.v) || 0) + (fixtureHeight / (2 * construction.height)),
					0,
					1
				);
			}
		}
        this.normalizeOpeningFootprints();
        this.reindexOpenings();
        this.rebuild();
        this.bindOpeningObjects();
        this.bindFixtureObjects();
        this.setPresentationMode(state.version >= 2 && SiteConfig.wallSystem.presentationModes.includes(state.presentation)
            ? state.presentation
            : SiteConfig.wallSystem.defaultPresentation);
    }

    getFaceOverrideGeometryKey(record) {
        return `${record.face}:${record.cells?.from?.join(',')}:${record.cells?.to?.join(',')}`;
    }

    enforceNodeBudget() {
        const nodes = this.pieces.length + this.decorations.length;
        this.generatedNodeCount = nodes;
        if (nodes > SiteConfig.wallSystem.maxGeneratedNodes) {
            throw new Error(`WallBuilder generated ${nodes} nodes; budget is ${SiteConfig.wallSystem.maxGeneratedNodes}`);
        }
    }

    dispose() {
        for (const unsubscribe of this._unsubscribers) unsubscribe();
        this._unsubscribers = [];
        for (const slot of this.openingSlots.values()) {
            for (const object of slot.sockets.occupantsOf('opening')) {
                this.gameMap.container?.attachments?.detach?.(object);
            }
        }
        for (const decoration of this.decorations) {
            this.gameMap.container?.attachments?.detach?.(decoration);
            decoration.dispose();
        }
        for (const piece of this.pieces) piece.element?.remove();
        this.decorations = [];
        this.pieces = [];
        this._pieceByCell.clear();
        this.cells.clear();
        this.baseCells.clear();
        this.openingSlots.clear();
    }
}
