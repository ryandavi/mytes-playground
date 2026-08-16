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

    applyWallCut(cutY = this._cutY) {
        this._cutY = cutY;
        WallBuilder.applyFixtureCut(this.element, cutY, this.posY, this.size.height);
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
    static OPPOSITE_FACES = Object.freeze({
        north: 'south', south: 'north', west: 'east', east: 'west'
    });

    static MASK_NORTH = 1;
    static MASK_EAST = 2;
    static MASK_SOUTH = 4;
    static MASK_WEST = 8;
    static MASK_HORIZONTAL = 2 | 8;
    static MASK_VERTICAL = 1 | 4;
    static MASK_STRAIGHT_H = 10;

    // Sub-frame: long enough that one evaluation pass hit-tests the cursor once,
    // short enough that the memo can never survive into the next pass.
    static CURSOR_SUBJECT_TTL_MS = 4;

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

    /**
     * One presentation rule for everything hanging on a wall face - authored
     * decoration and placed map object alike.
     *
     * The two drifted apart once already: a lowered wall hid its own authored
     * paintings while the ones the player hung stayed at their standing Y,
     * floating in mid-air over the floor. Hidden once the cut line passes
     * below the fixture's own top, which is the rule the decorations already
     * used - never "whenever the piece is stubbed", or a fixture low on a wall
     * would vanish while the wall behind it is still there.
     */
    static applyFixtureCut(element, cutY, posY, height = 0) {
        if (!element) return;
        const behavior = SiteConfig.wallSystem.fixtureCutBehavior;
        const cut = Number.isFinite(cutY) && cutY > posY;
        element.classList.toggle('is-wall-cut', behavior === 'hide' && cut);
        element.style.clipPath = (behavior === 'clip' && cut && height > 0)
            ? `inset(${Utility.clamp(cutY - posY, 0, height)}px 0 0 0)`
            : '';
    }

    /**
     * Whether a cell's south face is inherited from the run beside it.
     *
     * A cell with exactly one horizontal neighbour is the corner column at the
     * end of that neighbour's run: it has no head-on face of its own to author,
     * so it wears the run's. Cells with a run on both sides, and vertical-only
     * cells, keep what they were given.
     */
    static inheritsHorizontalFace(mask) {
        return ((mask & WallBuilder.MASK_EAST) !== 0) !== ((mask & WallBuilder.MASK_WEST) !== 0);
    }

    // Vertical counterpart of inheritsHorizontalFace: exactly one vertical arm,
    // which is what makes a cell the corner column of a north-south run.
    static inheritsVerticalFace(mask) {
        return ((mask & WallBuilder.MASK_NORTH) !== 0) !== ((mask & WallBuilder.MASK_SOUTH) !== 0);
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
        this.authoredBaseCells = new Map();
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
        this._presentationOverride = null;
        this._activeCutawayKey = null;
        this._runPieceIds = new Map();
        this._cutawayRoomIds = new Set();
        this._pendingCutawayKey = null;
        this._pendingCutawaySince = 0;
        this._lastEvaluateAt = 0;
        this._subjectSignature = null;
        this._cursorSubjectAt = -Infinity;
        this._cursorSubject = null;
        this._unsubscribers = [];
    }

    async initialize() {
        for (const source of this.wallData.cells || []) {
            const key = `${source.x},${source.y}`;
            const cell = { ...source, opening: null };
            this.authoredBaseCells.set(key, Utility.deepClone(cell));
            this.baseCells.set(key, cell);
        }
        this.normalizeOpeningFootprints();
        this.pruneOrphanedRecords();
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

    /**
     * Drops opening and fixture records whose map object is gone.
     *
     * Both kinds of record name an object by id, and the object is the only
     * thing that fills what the record claims: an opening cuts a hole for a
     * window to sit in, a fixture reserves the patch of wall a painting hangs
     * on. Lose the object and the claim outlives it — a hole in the wall with
     * no window in it, which nothing can be placed over because the wall still
     * says something is there. Records like that survive into the save, so this
     * runs on load as well, and repairs a save that already carries one.
     */
    pruneOrphanedRecords() {
        const exists = id => !!this.gameMap.getObjectById?.(id);
        const openings = this.openings.filter(opening => exists(opening.id));
        const fixtures = this.fixtures.filter(record => exists(record.id));
        const changed = openings.length !== this.openings.length ||
            fixtures.length !== this.fixtures.length;
        this.openings = openings;
        this.fixtures = fixtures;
        return changed;
    }

    /**
     * Hands back everything this wall holds on behalf of an object that is
     * leaving the map — stored in the inventory, or discarded because its
     * placement failed. The counterpart to finishOpeningMove/finishFixtureMove:
     * those record the claim, this one releases it.
     */
    releaseObject(object) {
        const id = String(object?.id ?? object);
        this._movingOpeningIds.delete(id);
        this._movingObjects.delete(id);
        this._movingRevealPieceIds.delete(id);

        const fixtureCount = this.fixtures.length;
        this.fixtures = this.fixtures.filter(record => String(record.id) !== id);
        const hadFixture = this.fixtures.length !== fixtureCount;

        const openingCount = this.openings.length;
        this.openings = this.openings.filter(opening => String(opening.id) !== id);
        const hadOpening = this.openings.length !== openingCount;
        if (hadOpening) {
            this.openingSlots.delete(id);
            this.reindexOpenings();
            this.rebuild();
            if (String(object?.type).toUpperCase() === 'DOOR') this.gameMap.buildDoorRoomTopology?.();
        }
        if (hadOpening || hadFixture) this.evaluateCutaway(true);
        return hadOpening || hadFixture;
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

    /**
     * Stamp the wall's collision and sight-blocking onto the grid — and, just
     * as importantly, take it off again.
     *
     * A wall cell is the only writer of `tileWalkable` after load, so the state
     * a cell had BEFORE this stamped it is remembered per cell and handed back
     * when the wall comes down. Without that hand-back a torn-down wall left an
     * invisible collider standing exactly where it had been: Mytes pathed
     * around nothing, sight lines stopped at nothing, and the debug grid drew
     * the ghost of the wall you had just removed.
     *
     * TileMapLoader deliberately no longer stamps wall cells, so the remembered
     * state is the tile layer's own answer rather than this system's previous
     * one — otherwise removing an authored wall would restore "unwalkable".
     */
    syncGridWallState() {
        const gridSystem = this.gameMap.gridSystem;
        if (!gridSystem?.grid) return;
        const previous = this._gridWallBaseline ||= new Map();
        const stamped = new Set();
        let changed = false;

        for (const cell of this.baseCells.values()) {
            const key = `${cell.x},${cell.y}`;
            const gridCell = gridSystem.grid[cell.x]?.[cell.y];
            if (!gridCell) continue;
            if (!previous.has(key)) {
                previous.set(key, {
                    tileWalkable: gridCell.tileWalkable,
                    wallBlocksLineOfSight: gridCell.wallBlocksLineOfSight
                });
                changed = true;
            }
            stamped.add(key);
            const opening = this.openingByCell.get(key);
            gridCell.tileWalkable = opening?.type === 'door';
            gridCell.wallBlocksLineOfSight = opening
                ? opening.blocksLineOfSight === true
                : cell.blocksLineOfSight !== false;
            gridCell.walkable = gridCell.tileWalkable && gridCell.objectWalkable;
        }

        for (const [key, baseline] of previous) {
            if (stamped.has(key)) continue;
            previous.delete(key);
            changed = true;
            const [x, y] = key.split(',').map(Number);
            const gridCell = gridSystem.grid[x]?.[y];
            if (!gridCell) continue;
            gridCell.tileWalkable = baseline.tileWalkable;
            gridCell.wallBlocksLineOfSight = baseline.wallBlocksLineOfSight;
            gridCell.walkable = gridCell.tileWalkable && gridCell.objectWalkable;
        }

        // The pathfinder charges a per-node cost from a wall-adjacency count
        // precomputed at load, on the assumption that tile walkability never
        // moves. Build mode moves it, so the count is recomputed whenever the
        // set of wall cells changes.
        if (changed) {
            gridSystem._computeStaticWallCounts?.();
            // The debug grid is only redrawn when something marks it stale, and
            // wall edits move the very cells it colours.
            if (gridSystem.debugMode) gridSystem._debugDirty = true;
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

    /**
     * Which room each of a cell's four faces looks into.
     *
     * Two rules, and the second one exists because of how authored rooms are
     * shaped. An authored room is a RECTANGLE, and a rectangle drawn around a
     * room contains the wall cells inside it — so asking "which room is at this
     * point" for a point that sits inside a wall answers with the surrounding
     * room, confidently and wrongly. (Auto-detected rooms are tilemasks of open
     * cells and do not do this, which is why the bug only showed on walls built
     * inside an authored room.)
     *
     * That single fact produced everything that looked wrong about a room built
     * inside another one: its corners and its side walls reported the
     * SURROUNDING room, so they wore that room's paint instead of plain
     * plaster, room-scope paint of the new room skipped them entirely, and
     * room-scope paint of the OLD room repainted them — because as far as the
     * face data was concerned, they were the old room's walls.
     */
    assignFaces(cell) {
        const mask = this.computeMask(cell);
        const resolved = {};
        for (const direction of WallBuilder.DIRECTIONS) {
            resolved[direction.name] = this.findFaceRoom(cell, direction, mask);
        }

        // A face whose lookup was blocked by masonry rather than by open ground
        // still has to belong somewhere: the strip a north-south wall draws is
        // painted from its south face, and a corner column is drawn from its
        // own. Give those the innermost room the cell touches at all — a wall
        // belongs to the smallest room it bounds, which is the same rule
        // innermostAt applies to a point. Faces that saw genuinely open ground
        // and found no room are exterior and stay that way.
        const fallback = Object.values(resolved)
            .filter(entry => entry.room)
            .map(entry => entry.room)
            .reduce((smallest, room) => !smallest ||
                room.areaInCells(this.cellSize) < smallest.areaInCells(this.cellSize)
                ? room : smallest, null);

        const faces = {};
        for (const direction of WallBuilder.DIRECTIONS) {
            const entry = resolved[direction.name];
            const room = entry.room || (entry.buried ? fallback : null);
            faces[direction.name] = {
                roomId: room?.id || null,
                exterior: !room,
                materialId: this.resolveFinishOverride(cell.x, cell.y, direction.name, room?.id ?? null) ||
                    room?.properties?.wallFinishId || cell.finishId
            };
        }
        return faces;
    }

    // Innermost, not first: a room walled off inside another sits within its
    // parent's bounds, and a wall of the inner room belongs to the inner room.
    // Null on a cell that is itself a wall — see assignFaces for why that
    // matters more than it sounds.
    roomAtOpenCell(x, y) {
        if (this.cells.has(`${x},${y}`)) return null;
        return this.gameMap.regionManager?.innermostAt(
            (x + 0.5) * this.cellSize,
            (y + 0.5) * this.cellSize,
            'room',
            this.cellSize
        ) || null;
    }

    /**
     * One face's room, plus whether the lookup was buried in a junction.
     *
     * Stepping one cell out is right for a wall in the middle of a run. At the
     * column where two walls meet, that step lands on the wall coming in from
     * the side — so follow the corner instead: an L corner encloses its room
     * diagonally, and the cell between its two arms is inside.
     *
     * `buried` distinguishes "this face is walled in" from "this face looks at
     * open ground that belongs to no room". The first wants a fallback; the
     * second is the outside of the building and must stay exterior.
     */
    findFaceRoom(cell, direction, mask = this.computeMask(cell)) {
        const x = cell.x + direction.dx;
        const y = cell.y + direction.dy;
        if (!this.cells.has(`${x},${y}`)) return { room: this.roomAtOpenCell(x, y), buried: false };

        const armDx = WallBuilder.isVerticalMask(direction.bit) && WallBuilder.inheritsHorizontalFace(mask)
            ? ((mask & WallBuilder.MASK_EAST) !== 0 ? 1 : -1)
            : 0;
        const armDy = WallBuilder.isHorizontalMask(direction.bit) && WallBuilder.inheritsVerticalFace(mask)
            ? ((mask & WallBuilder.MASK_SOUTH) !== 0 ? 1 : -1)
            : 0;
        if (armDx === 0 && armDy === 0) return { room: null, buried: true };

        return { room: this.roomAtOpenCell(x + armDx, y + armDy), buried: true };
    }

    /**
     * The painted finish on one face, if the player put one there.
     *
     * Scoped to the room the paint was applied to. Paint is a statement about a
     * ROOM's wall, not about a patch of masonry: close a new room off against a
     * wall that is already there and that wall's inward face now belongs to the
     * new room, but the override baked on when it belonged to the old one still
     * outranked the new room's finish — so a brand new room came up wearing the
     * surrounding room's colour.
     *
     * Ignoring a mismatched override rather than deleting it is what makes this
     * survive going backwards: knock the new wall down, the face returns to the
     * old room, its override matches again and the old paint comes back. A
     * cleanup pass would have left a bald patch the player never asked for.
     *
     * `roomId` absent means unscoped — authored map data, and anything saved
     * before overrides carried a room. Those still apply everywhere, so no
     * existing map or save changes behaviour until it is repainted.
     */
    resolveFinishOverride(x, y, face, roomId = undefined) {
        const match = [...this.faceOverrides].reverse().find(record => {
            if (record.face !== face) return false;
            if (record.roomId !== undefined && record.roomId !== null &&
                roomId !== undefined && record.roomId !== roomId) return false;
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

    /**
     * The finish on the face band of an east-west wall.
     *
     * Drawn from the south face, because that is the side the camera sees. But
     * a room's OWN front wall looks south into whatever is beyond the room, so
     * reading the south face literally made the near wall of a room wear the
     * colour of the space outside it — a green room with a plaster strip across
     * its front, which is not a wall anyone painted, it is a wall nobody did.
     *
     * A wall belongs to the smallest room it bounds. That is the rule already
     * used for a face buried in a junction and for innermostAt itself, and here
     * it means a room reads as one colour all the way round: the far wall shows
     * it because the room is on its south side, the near wall shows it because
     * the room is the smaller of the two it divides. The bigger space's own
     * outer walls are unaffected — it is the smallest room on both of its faces.
     */
    resolveBandFace(cell) {
        const south = cell.faces?.south;
        const north = cell.faces?.north;
        const rooms = this.gameMap.regionManager;
        const southRoom = south?.roomId ? rooms?.get('room', south.roomId) : null;
        const northRoom = north?.roomId ? rooms?.get('room', north.roomId) : null;

        if (southRoom && northRoom && northRoom !== southRoom &&
            northRoom.areaInCells(this.cellSize) < southRoom.areaInCells(this.cellSize)) return 'north';
        if (!southRoom && northRoom) return 'north';
        return 'south';
    }

    resolveBandFinishId(cell) {
        return this.resolveFaceFinishId(cell, this.resolveBandFace(cell));
    }

    /**
     * Which slices of a cell take which room's paint.
     *
     * A cell is not one surface. A wall running east-west shows a face that
     * looks south, and one finish covers it. A wall running north-south shows
     * its narrow profile, and that profile has TWO sides — the room to its west
     * and the room to its east — which is why painting it with a single finish
     * could never be right, and why leaving it unpainted (what it used to do)
     * was not right either. It is not a separate piece of wall to be painted on
     * its own; it is part of both rooms, half each.
     *
     * A corner column is both at once: the horizontal stub beside the post
     * faces south, and the post itself is split west/east. That is the "partial
     * paint" — one cell, one draw call per slice, each slice reading its own
     * face's room.
     *
     * A cell where walls leave in three or four directions gets both treatments
     * too: the run passing through keeps its south face across the full width,
     * and the post is painted over it, split. The two-tone band is only as wide
     * as the perpendicular wall actually standing there, so it reads as that
     * wall seen end-on — which is what it is.
     */
    getPaintSpans(cell, mask, construction) {
        const region = this.registry.paintRegion(mask, construction);
        if (!region) return [];

        const cellSize = construction.cellSize;
        const span = (from, to, face) => ({
            from, to,
            face: this.resolveOwningFace(cell, face),
            finishId: this.resolveFaceFinishId(cell, this.resolveOwningFace(cell, face))
        });

        // Where a wall runs PAST a post, the post divides the cell: everything
        // west of the middle belongs to the room on the west, everything east
        // to the room on the east — the post's own half AND the band beside it.
        //
        // Resolving that band as one face across the full width is what put the
        // wrong colour on half of every junction. Where a hallway meets a
        // bedroom, the band was answered by whichever of the two rooms happened
        // to be smaller, so the strip beyond the post wore the hallway's paint
        // while the post next to it wore the bedroom's.
        //
        // Where the wall TURNS, it does not divide. The split exists so two
        // rooms can each own their side of one piece of masonry, and a corner
        // is not shared masonry: it is the end of the wall that turns there,
        // drawn as its own rounded cap, with nothing continuing on the far side
        // to own it. Splitting it anyway handed that cap to the room the corner
        // merely stands next to, so the last quarter-tile of a painted wall came
        // out in the neighbour's colour. The whole cell takes the face on the
        // side the wall arrives from, which is the room the corner wraps.
        if (WallBuilder.isVerticalMask(mask)) {
            // A turn, and not merely one arm: a wall running north-south with a
            // spur off one side has exactly one horizontal arm too, and it does
            // divide — it is straight masonry with a room on either side, and
            // handing the whole cell to the spur's side would paint the far
            // room's wall from this one.
            if (WallBuilder.inheritsHorizontalFace(mask) && WallBuilder.inheritsVerticalFace(mask)) {
                return [span(region.start, region.end,
                    (mask & WallBuilder.MASK_EAST) !== 0 ? 'east' : 'west')];
            }
            const middle = cellSize / 2;
            return [span(region.start, middle, 'west'), span(middle, region.end, 'east')];
        }

        if (WallBuilder.isHorizontalMask(mask) || mask === 0) {
            return [span(region.start, region.end, this.resolveBandFace(cell))];
        }
        return [];
    }

    /**
     * Which face a surface actually belongs to.
     *
     * A face with no room behind it is the outside of somebody's wall, and
     * nobody can paint it on its own — so it follows the room on the other side
     * of the same masonry instead of sitting bare. The outside of a building
     * corner is the same wall as the inside of it, and treating it as unowned
     * left a bald half-tile on every corner of the house, on a wall that had
     * just been painted.
     *
     * This is the rule resolveBandFace already applies to a head-on band that
     * looks out of the building; a post is the same wall seen edge-on and wants
     * the same answer.
     */
    resolveOwningFace(cell, face) {
        const opposite = WallBuilder.OPPOSITE_FACES[face];
        if (!opposite || cell.faces?.[face]?.roomId || !cell.faces?.[opposite]?.roomId) return face;
        return opposite;
    }

    /**
     * Per-side paint. The one-sided-corner inheritance only makes sense for the
     * face the camera actually sees head-on, so it stays on the south face.
     *
     * And only while the corner and the run it caps face the SAME room. The
     * inheritance exists because a corner column has no head-on face to author
     * of its own, so it wears its neighbour's — which is right up until the two
     * look into different rooms. Walling a new room off using a wall that is
     * already there is exactly that case: the run beside the new corner still
     * faces the old room, so the corner borrowed the old room's colour and the
     * new room's wall ended in a stripe of the paint it was built to replace.
     * Facing a different room means the corner does have a face to answer for.
     */
    resolveFaceFinishId(cell, face) {
        // Callers hand this both built cells (which carry mask + faces) and raw
        // ones straight out of `this.cells` (which do not) — the paint palette
        // reads the current finish that way. Fill in what is missing rather than
        // throwing on `cell.faces[face]` at the bottom.
        if (!cell.faces || !Number.isFinite(cell.mask)) {
            cell = { ...cell, mask: cell.mask ?? this.computeMask(cell), faces: cell.faces ?? this.assignFaces(cell) };
        }
        const explicit = this.resolveFinishOverride(cell.x, cell.y, face, cell.faces?.[face]?.roomId ?? null);
        if (explicit) return explicit;
        if (face === 'south' && WallBuilder.inheritsHorizontalFace(cell.mask)) {
            const hasEast = (cell.mask & WallBuilder.MASK_EAST) !== 0;
            const neighbor = this.cells.get(`${cell.x + (hasEast ? 1 : -1)},${cell.y}`);
            const inherited = neighbor ? this.assignFaces(neighbor).south : null;
            if (inherited && inherited.roomId === cell.faces.south.roomId) return inherited.materialId;
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

    /**
     * Whether this piece shows anything the player can paint.
     *
     * Asked of the surfaces themselves, because that is the only honest answer.
     * A north-south run used to be refused on the grounds that it presents no
     * face to the camera — true of the old single-finish wall, and false since
     * a post started drawing two half-cell surfaces, west and east, one per
     * room beside it. Those are visibly painted surfaces the tool would not let
     * anyone select, so a room's side walls could never be painted at all: they
     * stayed plaster while every wall around them took the colour, which is the
     * gap running down both edges of a room.
     */
    isPaintable(piece) {
        return (piece?.cells ?? []).some(cell => this.getCellSurfaces(cell).length > 0);
    }

    /**
     * The paintable surfaces of one cell, exactly as the renderer draws them.
     *
     * A cell is not one surface, and which face a surface takes its finish from
     * is a rendering decision (see getPaintSpans): a head-on band reads north or
     * south depending on which room is the smaller one it bounds, and a
     * north-south post is two half-cell surfaces, west and east, belonging to
     * the rooms on either side of it.
     *
     * Selection, stretch growth and paint all read this one list, so what the
     * player points at, what the highlight outlines and what the override lands
     * on cannot disagree. They used to be three separate rules, which is why a
     * click could highlight one wall, paint the corners of it, and change the
     * colour of nothing you could see.
     */
    getCellSurfaces(cell) {
        if (!cell) return [];
        const construction = this.registry.getConstruction(cell.constructionId);
        if (!construction) return [];
        // Raw cells out of `this.cells` carry neither mask nor faces; the stretch
        // walk steps through those, not through built piece cells.
        const built = (cell.faces && Number.isFinite(cell.mask))
            ? cell
            : { ...cell, mask: this.computeMask(cell), faces: this.assignFaces(cell) };
        // Which wall a surface belongs to is a question about its shape, not
        // its face name. A span no wider than the post IS the post, seen
        // edge-on, and grows into a north-south stretch; a span that reaches
        // past the post is the band of an east-west wall, whichever face it
        // takes its colour from. Reading the face name instead made the half of
        // a junction that continues a horizontal run grow downward into the
        // wall hanging off it.
        const post = (construction.cellSize - construction.thickness) / 2;
        return this.getPaintSpans(built, built.mask, construction).map(span => ({
            cell: built,
            face: span.face,
            from: span.from,
            to: span.to,
            axis: (span.from < post - 0.5 || span.to > construction.cellSize - post + 0.5)
                ? 'horizontal' : 'vertical',
            roomId: built.faces[span.face]?.roomId ?? null,
            finishId: span.finishId
        }));
    }

    /**
     * The surface visible at a pixel of a piece's canvas.
     *
     * Spans are drawn in order and overlay each other — a corner column paints
     * its post over the band that runs through it — so the last span covering
     * the pixel is the one the player is actually looking at.
     */
    surfaceAtOffset(piece, offsetX) {
        const construction = this.registry.getConstruction(piece?.constructionId);
        if (!construction || !(offsetX >= 0)) return null;
        const index = Math.floor(offsetX / construction.cellSize);
        const cell = piece.cells[index];
        if (!cell) return null;
        const local = offsetX - (index * construction.cellSize);
        const covering = this.getCellSurfaces(cell).filter(surface => local >= surface.from && local < surface.to);
        return covering[covering.length - 1] || null;
    }

    /**
     * Every surface one paint stroke covers: the run of wall the clicked
     * surface belongs to, plus the room-facing half of the column at each end.
     *
     * Two rules, and both of them are about a stretch being a wall of ONE room:
     *
     * A surface joins the stretch only if it faces the same room as the one
     * clicked. That is what keeps the far side of a shared wall out of it — a
     * room walled off inside another shares masonry with its parent, and paint
     * applied from inside it must stop at the middle of that masonry.
     *
     * And the walk stops at the first cell carrying wall running ACROSS its
     * axis. That corner's room-facing half is part of this wall, so it is
     * included; the run turning away from it is a different wall and is not,
     * even though it faces the same room. Following those turns is what made
     * one click select half the floor plan.
     */
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

        const [stepX, stepY] = surface.axis === 'horizontal' ? [1, 0] : [0, 1];
        for (const direction of [-1, 1]) {
            // The cell clicked may itself be a corner, and that is no reason to
            // stop before starting: a corner belongs to the wall it caps, so
            // clicking it selects that wall. Only the cells the walk REACHES
            // end it, which is what keeps a stretch from turning the corner and
            // running off down the wall hanging there.
            let { x, y } = surface.cell;
            for (;;) {
                x += stepX * direction;
                y += stepY * direction;
                const next = this.cells.get(`${x},${y}`);
                if (!next || !take(next)) break;
                if (this.turnsAcross(next, surface.axis)) break;
            }
        }
        return [...collected.values()];
    }

    // Whether a cell carries wall running across a stretch's own axis — the
    // corner or junction that ends it.
    turnsAcross(cell, axis) {
        const mask = Number.isFinite(cell.mask) ? cell.mask : this.computeMask(cell);
        return axis === 'horizontal'
            ? WallBuilder.isVerticalMask(mask)
            : WallBuilder.isHorizontalMask(mask);
    }

    /**
     * Where a set of surfaces sits on screen, in map coordinates.
     *
     * One rectangle per surface, adjacent ones merged, rather than a single box
     * around the lot: a stretch that ends in a half-cell corner post is not a
     * rectangle, and outlining its bounding box promised paint on the other
     * half of that post — the half belonging to the room next door. Measured
     * off the elements, since only the renderer knows where a construction's
     * frame actually sits.
     */
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

    /**
     * One outline per connected group of surfaces, not one per surface.
     *
     * A stretch is drawn as many overlapping slices: a run contributes a
     * rectangle per cell, a corner contributes both the band through it and the
     * post over that band, and a north-south wall contributes a tall sprite per
     * cell that overlaps the one below it. Outlining each of those separately
     * drew a box inside a box inside a box — half a dozen dashed borders around
     * one wall, which is what made a single stretch look like several.
     *
     * Grouping by "overlaps or touches" and outlining each group's bounds gives
     * one border per thing the player is pointing at, in every direction: the
     * slices of one wall are connected by construction, and two walls that are
     * not part of the same stretch never share a pixel.
     */
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

    // Touching counts as overlapping: adjacent cells of one wall abut exactly,
    // and a hairline gap between two dashed borders is the artefact this whole
    // grouping exists to remove.
    static rectsTouch(a, b) {
        const slack = 0.5;
        return a.left <= b.right + slack && b.left <= a.right + slack &&
            a.top <= b.bottom + slack && b.top <= a.bottom + slack;
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

    /**
     * The cutaway's clock is real time, not simulation time.
     *
     * Cutaway is presentation, like the camera: build mode stops SimClock, and
     * a cutaway reading it froze outright — the throttle window never elapsed,
     * so the evaluation pass stopped running, and the cursor subject memoized
     * at the instant the pause began stayed pinned there. Whichever cell the
     * cursor happened to be lowering when you entered build mode then stayed
     * lowered for the whole session, including across a mode switch back to
     * cutaway.
     */
    static presentationNow() {
        return performance.now();
    }

    // Memoized for one evaluation pass: resolving the cursor subject forces a
    // DOM hit-test (isMouseInContainer → elementFromPoint), and one pass asks
    // for it several times — subjects, signature, and room ids all start here.
    // The window is sub-frame, so the memo never outlives the pass that made it.
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

    /**
     * Rooms that are one open space answer as one room here.
     *
     * A wall only lowers where its far side is a room you are standing in. On
     * a wall shared by two rooms that are open to each other — a divider that
     * stops short, an alcove — that test recognises only the half facing your
     * room, so one continuous wall stepped down halfway along, at the exact
     * seam where its far side changes. The grouping comes from the room
     * enclosure flood fill, which already knows what is walled off from what.
     */
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
        // Read back as well as drawn: the paint tool alpha-tests this canvas on
        // every pointer move to find the wall under the cursor. Context options
        // are fixed at creation, so the flag has to be set by whoever asks
        // first — which is always this, since nothing can be sampled before it
        // has been drawn.
        const context = canvas.getContext('2d', { willReadFrequently: true });
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

    // The mirror of expandCutOverOpenings, for the raised span under a moving
    // object: an opening the span reaches into stands in full.
    expandStandingOverOpenings(piece, cut) {
        const spans = new Map();
        piece.cells.forEach((cell, index) => {
            if (!cell.opening) return;
            const id = String(cell.opening.id);
            const span = spans.get(id) || { from: index, to: index, standing: false };
            span.from = Math.min(span.from, index);
            span.to = Math.max(span.to, index);
            span.standing = span.standing || !cut[index];
            spans.set(id, span);
        });
        for (const span of spans.values()) {
            if (!span.standing) continue;
            for (let index = span.from; index <= span.to; index++) cut[index] = false;
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
        // and therefore apply only to cutaway mode — the one exception is the
        // wall under an object being moved, which stands in every mode and
        // needs those rules to draw the step back down either side of it.
        if (this.presentation === 'down' && !this.hasMovingObjectSpans(piece)) {
            return new Array(count).fill(true);
        }

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

        // Everything from here to the transition tidy-up exists to give a
        // cutaway somewhere sensible to return to full height. "Walls down" has
        // no such need: its one standing island is the span under the moving
        // object, and anchoring the run's ends on top of that just raises wall
        // the player did not ask for.
        const anchorRun = this.presentation !== 'down';

        // Straight endpoints abutting vertical structure remain standing. Pure
        // end caps keep their requested state: a cap can belong to a long stub
        // run as long as that run eventually reaches one valid transition.
        if (anchorRun) {
            this.resolveHorizontalBoundary(chain, cut, 0);
            this.resolveHorizontalBoundary(chain, cut, cut.length - 1);
        }

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
        if (anchorRun) {
            this.ensureHorizontalChainAnchor(chain, cut);

            // A full-height cap cannot itself use the straight transition
            // artwork. Reserve its inward straight neighbor for that transition
            // whenever the run beyond it is lowered.
            this.reserveTransitionBesideFullCap(chain, cut, 0, 1);
            this.reserveTransitionBesideFullCap(chain, cut, cut.length - 1, -1);
        }

        const resolvedByCell = new Map(chain.map((cell, index) => [`${cell.x},${cell.y}`, cut[index]]));
        return piece.cells.map(cell => resolvedByCell.get(`${cell.x},${cell.y}`) === true);
    }

    getRawCutStates(piece, count = piece.cells.length) {
        const cut = this.getBaseCutStates(piece, count);
        if (cut) {
            // Never cut through half a door or window: an opening is one
            // object, so the lowered run swallows all of its cells or none.
            this.expandCutOverOpenings(piece, cut);
            // Stand the wall under whatever is being moved. The padded cells
            // push any transition away from the art instead of drawing a
            // height change through a painting or window.
            // Something being moved keeps its wall up in every mode; something
            // merely hanging there only in cutaway ("walls down" is the player
            // asking for the floor plan, and a column under every painting is
            // not that). Both come from one mask, shared with the desired state.
            const standing = this.getForcedStandingCells(piece, count);
            for (let index = 0; index < count; index++) {
                if (standing[index]) cut[index] = false;
            }
            // ...and take any opening that span reaches into up with it, so a
            // window is never half in a standing wall and half in a stub.
            this.expandStandingOverOpenings(piece, cut);
            // Vertical arms, corners, and junctions remain tall. Pure horizontal
            // end caps are resolved with their neighboring cells afterward so
            // they can lower when there is room for a valid transition.
            //
            // Not in "walls down": there the whole wall is deliberately a stub,
            // and the only thing standing is the span under the object being
            // moved. Applying the structural rules there raises the run's end
            // cap and corner as well, for no reason the player can see.
            if (this.presentation !== 'down') {
                for (let index = 0; index < count; index++) {
                    const mask = piece.cells[index]?.mask ?? 0;
                    if (WallBuilder.isVerticalMask(mask) || !WallBuilder.isHorizontalMask(mask)) cut[index] = false;
                }
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

    /**
     * Spans of a wall that must stand, whatever the presentation says.
     *
     * Two sources, one rule. Something being MOVED needs its host wall up in
     * every mode: you cannot judge where a painting goes against a 28px stub,
     * and a fixture on a lowered wall is hidden outright by the cut rule, so
     * lowering here made the very thing being placed invisible while placing
     * it. Something already MOUNTED needs it up in cutaway: a cutaway exists to
     * see past a wall, and the player's own painting is not what is in the way
     * — lowering the wall under it just deletes decoration from the room.
     *
     * Spans are collected for the whole horizontal RUN, not this render piece.
     * A run splits into several pieces at every finish and room-face seam, so a
     * wall shared by two rooms is at least two pieces; matching by piece left
     * the far side of the seam free to lower, which is how half a wall stayed
     * standing and the painting on it vanished anyway. Spans carry world x, so
     * raiseSpans keeps only what actually reaches this piece — including the
     * padding that spills across a seam.
     */
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

    // Where a fixture hangs, as a span on the piece that actually carries it.
    // The same answer the moving path uses, so a fixture does not shift the
    // wall it belongs to at the moment it is dropped.
    getFixtureSpan(object) {
        const placement = this.getFixturePlacementCandidate(object);
        return placement ? {
            piece: placement.piece,
            left: placement.position.x,
            right: placement.position.x + object.size.width
        } : null;
    }

    // Every render piece belonging to the same structural run as this one.
    // Memoized for the life of a build: getRawCutStates is called once per
    // piece in a run while resolving that run, so recomputing the chain each
    // time is quadratic for no benefit.
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

    /**
     * Which of this piece's cells may not lower, whatever occlusion wants.
     *
     * One answer, asked twice: the renderer applies it so the wall stands the
     * instant something is dropped on it, and refreshCutawayTargets applies it
     * to the desired state so the hysteresis in advancePiece cannot spend the
     * next cutawayRaiseDelayMs asking for a cell the renderer refuses to lower.
     * While those two disagreed, a run split across render pieces could be
     * caught mid-argument — one canvas drawn from the corrected state and its
     * neighbour from the stale one, leaving a step at the seam.
     */
    getForcedStandingCells(piece, count = piece.cells.length) {
        const standing = new Array(count).fill(false);
        this.raiseSpans(piece, standing, this.getMovingSpansForRun(piece), true);
        if (this.presentation === 'cutaway') {
            this.raiseSpans(piece, standing, this.getMountedSpansForRun(piece), true);
        }
        return standing;
    }

    // Stands every cell a span reaches, plus the configured padding either
    // side. The padding is what pushes the height transition clear of the art
    // instead of drawing a step through the middle of a painting.
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

    // Does a wall object being moved hang on this piece? "Walls down" is
    // otherwise a uniform state that never consults the per-cell rules, and it
    // still has to make room for the raised span under the cursor.
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
        this.gameMap.syncWallTileOverlay?.();
        this.evaluateCutaway(true);
        this.gameMap.eventManager?.emit(EVENTS.WALL_PRESENTATION_CHANGED, { mapId: this.gameMap.id, mode });
        return true;
    }

    /**
     * Build and Customize must show every wall and everything mounted on one:
     * a cut-away wall fades its fixtures out, and a fixture you cannot see is
     * a fixture you cannot click. Presentation only - the mode the player chose
     * is restored on the way out.
     */
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

    /**
     * The player-chosen presentation, shared by the View panel and the build /
     * customize panels so all three read the same state.
     */
    setUserPresentationMode(mode) {
        // The override slot holds the play-mode presentation to come back to;
        // picking a mode while building must not overwrite it, or leaving build
        // mode would "restore" the build-mode choice.
        return this.setPresentationMode(mode);
    }

    /**
     * Build and Customize used to force walls up, which made the floor behind a
     * south wall unreachable in a small room. The mode is now the player's to
     * pick — this just seeds it and remembers what play mode was using.
     */
    setBuildPresentation(mode = SiteConfig.buildMode.defaultPresentation) {
        if (this._presentationOverride === null) this._presentationOverride = this.presentation;
        return this.setPresentationMode(mode);
    }

    clearBuildPresentation() {
        return this.setPresentationOverride(null);
    }

    // ── Build validation ──────────────────────────────────────────────────────

    /**
     * What stands in the way of laying a wall on this cell, as player-facing
     * copy. Wall-mounted things are deliberately absent: an opening or a
     * fixture is *supposed* to share its cell with the wall it sits in.
     */
    getCellObstruction(x, y) {
        const cellSize = this.cellSize;
        const rect = { x: x * cellSize, y: y * cellSize, width: cellSize, height: cellSize };

        const gridCell = this.gameMap.gridSystem?.grid?.[x]?.[y];
        for (const object of gridCell?.objects || []) {
            if (this.openingByCell.has(`${x},${y}`) && String(this.openingByCell.get(`${x},${y}`).id) === String(object.id)) continue;
            if (this.isWallMountedObject(object)) continue;
            // Walkability is a pathfinding answer and this is a masonry
            // question. Borrowing it meant anything you could step over — a rug,
            // a flower bed, a crop, a butterfly resting on a tile — was invisible
            // to the wall tool and got built straight through.
            if (object.contributesToWalkability === false) continue;
            return { reason: `${object.getDisplayName?.() || 'Something'} is in the way.`, entity: object };
        }

        if (this.isPortalApproachCell(x, y)) {
            return { reason: 'A way out of the map has to stay reachable.', entity: null };
        }

        if (this.isHomeSlotCell(rect)) {
            return { reason: 'A Myte needs to be able to reach its slot.', entity: null };
        }

        const creature = this.findCreatureInRect(rect);
        if (creature) {
            return { reason: `${creature.name || 'A Myte'} is standing there.`, entity: creature };
        }

        return null;
    }

    /**
     * Whether laying a wall here would drive a perpendicular arm through a door
     * or window standing next to it.
     *
     * isOpeningCellCompatible already states the rule — an opening needs a
     * straight run, because a cell that also carries a perpendicular arm is
     * where two walls meet and the opening would hang over the one coming in
     * from the side. But it was only ever consulted when placing the OPENING.
     * Nothing asked it on the way in from the wall side, and connectivity does
     * not care which edit came first: masks are recomputed from neighbours, so
     * building above or below a window turns that window's own cell into a
     * junction and the new wall draws straight down over the glass. The cell
     * under the window was never edited, which is why the build tool's
     * "would this change anything" filter waved it through.
     *
     * Checked against the mask the cell WOULD have, not the one it has, so the
     * answer is about the wall being built rather than the one already there.
     */
    getOpeningJunctionConflict(x, y) {
        const group = this.baseCells.get(`${x},${y}`)?.connectGroup ||
            this.wallData.defaults.connectGroup;

        for (const direction of WallBuilder.DIRECTIONS) {
            const neighborX = x + direction.dx;
            const neighborY = y + direction.dy;
            const opening = this.openingByCell.get(`${neighborX},${neighborY}`);
            if (!opening) continue;

            const neighbor = this.cells.get(`${neighborX},${neighborY}`);
            if (!neighbor || neighbor.connectGroup !== group) continue;

            // The arm this build would add to the opening's cell, on top of
            // whatever it already connects to.
            const opposite = WallBuilder.DIRECTIONS.find(
                candidate => candidate.dx === -direction.dx && candidate.dy === -direction.dy
            );
            const mask = this.computeMask(neighbor) | opposite.bit;
            if (this.isOpeningCellCompatible(mask, opening.axis)) continue;

            const type = String(opening.type || 'opening').toLowerCase();
            return {
                reason: `A wall here would run through the ${type}.`,
                entity: this.gameMap.getObjectById?.(opening.id)
            };
        }

        return null;
    }

    // Breathing room either side of a mounted span, in px. Configurable
    // because it is a look, not a rule: it exists so a wall does not stop dead
    // at the edge of a picture frame.
    getMountedClearancePx() {
        const value = Number(SiteConfig.wallSystem.mountedClearancePx);
        return Number.isFinite(value) && value > 0 ? value : 0;
    }

    /**
     * Everything mounted on the walls, as a horizontal span on the wall ROW
     * that carries it: `{ row, left, right, kind, reason, entity }`.
     *
     * A row rather than a rect, because a fixture's art hangs on the face —
     * 160px of it, standing rows above the cell it belongs to — so its world
     * `posY` says nothing about which cell holds it up. Its span is measured
     * the same way the cutaway measures it (getFixtureSpan, off the piece the
     * fixture actually hangs on) rather than off the cell recorded at drop
     * time, which a later re-split of the run leaves pointing elsewhere.
     */
    getMountedWallSpans() {
        const cellSize = this.cellSize;
        const spans = [];

        for (const opening of this.openings) {
            const type = String(opening.type || 'opening').toLowerCase();
            const object = this.gameMap.getObjectById?.(opening.id) || null;
            for (const [cellX, cellY] of opening.cells || []) {
                spans.push({
                    kind: 'opening',
                    row: cellY,
                    left: cellX * cellSize,
                    right: (cellX + 1) * cellSize,
                    reason: `Remove the ${type} first.`,
                    entity: object
                });
            }
        }

        for (const record of this.fixtures) {
            const object = this.gameMap.getObjectById?.(record.id);
            const span = object ? this.getFixtureSpan(object) : null;
            if (!span) continue;
            spans.push({
                kind: 'fixture',
                row: span.piece.y,
                left: span.left,
                right: span.right,
                reason: `Take the ${object.getDisplayName?.() || 'fixture'} down first.`,
                entity: object
            });
        }

        return spans;
    }

    /**
     * What this cell is carrying that the edit would orphan. A wall holding a
     * door or a painting refuses to go — those have nowhere to fall back to but
     * a hole in the world — and a wall may not be built across one either.
     *
     * Measured as a span on the row, not by which piece the fixture's recorded
     * cell happens to resolve to. That older test asked "is this fixture on the
     * same run?", which answered yes for every cell of a long wall — so one
     * painting locked a whole run against removal — while a painting overhanging
     * the end of its run into an empty cell answered no, and a wall was built
     * straight over the canvas.
     *
     * @param {number} clearance px of margin either side of the span to count
     *   as occupied. Removal passes the configured clearance so the wall keeps
     *   a shoulder under what it carries; building passes 0, because putting
     *   wall up NEXT to a painting is fine — only covering it is not.
     */
    getCellMounting(x, y, clearance = 0) {
        const left = x * this.cellSize;
        const right = left + this.cellSize;
        for (const span of this.getMountedWallSpans()) {
            if (span.row !== y) continue;
            if (right <= span.left - clearance || left >= span.right + clearance) continue;
            return { reason: span.reason, entity: span.entity };
        }
        return null;
    }

    /**
     * Whether building here would drive an arm into the run a fixture hangs on.
     *
     * The fixture counterpart to getOpeningJunctionConflict, and the same shape
     * of bug: a cell above or below a wall is not that wall's cell, so nothing
     * in the mounting test looks at it — but connectivity does not care which
     * edit came first. The new arm turns the cell under the painting into a
     * junction, that cell stops being part of a straight horizontal run, and
     * the piece carrying the painting splits underneath it. What the player
     * sees is a painting that jumps sideways when a wall is built nowhere near
     * it.
     */
    getFixtureJunctionConflict(x, y) {
        const clearance = this.getMountedClearancePx();
        const left = (x * this.cellSize) - clearance;
        const right = left + this.cellSize + (2 * clearance);
        const group = this.baseCells.get(`${x},${y}`)?.connectGroup ||
            this.wallData.defaults.connectGroup;

        for (const dy of [-1, 1]) {
            const neighbor = this.cells.get(`${x},${y + dy}`);
            if (!neighbor || neighbor.connectGroup !== group) continue;
            for (const span of this.getMountedWallSpans()) {
                if (span.kind !== 'fixture' || span.row !== y + dy) continue;
                if (right <= span.left || left >= span.right) continue;
                return {
                    reason: `A wall here would split the wall the ${
                        span.entity?.getDisplayName?.() || 'fixture'} hangs on.`,
                    entity: span.entity
                };
            }
        }

        return null;
    }

    // Map-baked decoration has no inventory form to return, so the wall under
    // it is locked rather than merely occupied.
    hasAuthoredAttachmentAt(x, y) {
        return (this.wallData.attachments || []).some(record => {
            const [cellX, cellY] = record.cells?.from || [record.cellX, record.cellY];
            return cellX === x && cellY === y;
        });
    }

    isWallMountedObject(object) {
        const id = String(object?.id ?? '');
        return this.openings.some(opening => String(opening.id) === id) ||
            this.fixtures.some(record => String(record.id) === id) ||
            this.isWallOpeningObject(object);
    }

    isWallOpeningObject(object) {
        return !!object?.getConfig?.('wallOpeningConfig', null);
    }

    isPortalApproachCell(x, y) {
        const cellSize = this.cellSize;
        for (const object of this.gameMap.objects || []) {
            if (String(object.type).toUpperCase() !== 'PORTAL') continue;
            const left = Math.floor(object.posX / cellSize) - 1;
            const top = Math.floor(object.posY / cellSize) - 1;
            const right = Math.floor((object.posX + object.size.width) / cellSize) + 1;
            const bottom = Math.floor((object.posY + object.size.height) / cellSize) + 1;
            if (x >= left && x <= right && y >= top && y <= bottom) return true;
        }
        return false;
    }

    isHomeSlotCell(rect) {
        return (this.gameMap.container?.mytes || []).some(myte => {
            const home = myte.getHomePosition?.();
            if (!home) return false;
            return RectUtils.boundsOverlap(rect, {
                x: home.x,
                y: home.y,
                width: myte.size?.width ?? this.cellSize,
                height: myte.size?.height ?? this.cellSize
            });
        });
    }

    findCreatureInRect(rect) {
        const container = this.gameMap.container;
        const candidates = [
            ...(container?.mytes || []).filter(myte => myte.isActive),
            ...(this.gameMap.objects || []).filter(object => object instanceof MovingMapObject)
        ];
        return candidates.find(entity => RectUtils.boundsOverlap(rect, {
            x: entity.posX,
            y: entity.posY,
            width: entity.size?.width ?? 0,
            height: entity.size?.height ?? 0
        })) || null;
    }

    // Shared footprint test for object placement: nothing that is not itself
    // wall-mounted may sit inside a wall's cell.
    rectOverlapsWall(bounds) {
        const cellSize = this.cellSize;
        const startX = Math.floor(bounds.x / cellSize);
        const startY = Math.floor(bounds.y / cellSize);
        const endX = Math.floor((bounds.x + Math.max(1, bounds.width) - 1) / cellSize);
        const endY = Math.floor((bounds.y + Math.max(1, bounds.height) - 1) / cellSize);
        for (let x = startX; x <= endX; x += 1) {
            for (let y = startY; y <= endY; y += 1) {
                if (this.baseCells.has(`${x},${y}`) && !this.openingByCell.has(`${x},${y}`)) return true;
            }
        }
        return false;
    }

    // The room a given face belongs to right now, straight from the built cell
    // so it agrees with whatever assignFaces most recently decided.
    getFaceRoomIdAt(x, y, face) {
        const cell = this.cells.get(`${x},${y}`);
        if (!cell) return null;
        const faces = cell.faces || this.assignFaces(cell);
        return faces?.[face]?.roomId ?? null;
    }

    /**
     * Give overrides saved before they carried a room the room they are sitting
     * on now. Without this an existing save keeps its untagged overrides, which
     * apply unconditionally, and the very bug this fixes survives in every world
     * that already exists. Runs once, after the cells are built and before
     * anything reads a finish.
     */
    adoptLegacyFaceOverrideRooms() {
        for (const record of this.faceOverrides) {
            if (record.roomId !== undefined) continue;
            record.roomId = this.getFaceRoomIdAt(record.cells.from[0], record.cells.from[1], record.face);
        }
    }

    /**
     * Paint every wall of a room, by setting the ROOM's finish.
     *
     * Floors have always worked this way (FloorBuilder.setRoomFinish writes
     * room.properties.floorFinishId) and walls did not: room-scope wall paint
     * enumerated the cells it could see at that moment and wrote one override
     * per cell per face. Anything not in that list stayed unpainted forever —
     * the west and east faces of a north-south wall, the post of a corner
     * column, and every wall built after the paint was applied. That is why the
     * green stopped at the corners no matter how many times it was repainted.
     *
     * A room's colour is a property of the room. assignFaces already falls back
     * to `room.properties.wallFinishId` for every face that belongs to it, so
     * setting it here reaches all four faces of every cell, including cells that
     * do not exist yet.
     *
     * The room's own per-face overrides are dropped, because repainting a room
     * supersedes accents painted onto it. Overrides belonging to OTHER rooms are
     * left alone — they are that room's paint on the other side of a shared wall.
     */
    /**
     * Turn paint applied under the old per-face model into a room wall finish.
     *
     * Room-scope paint used to enumerate cells and write one override each, so
     * a world painted before walls became a room property carries dozens of
     * overrides and a room whose `wallFinishId` is still null. Every face that
     * enumeration could not see — the west and east of a north-south wall, the
     * post of a corner or a junction — therefore stayed bare plaster, and no
     * amount of repainting fixed it because repainting rebuilt the same list.
     *
     * The dominant finish across a room's overrides IS that room's colour, so
     * it is promoted to the room and its overrides dropped. Overrides carrying
     * a different finish are deliberate accents and are kept.
     */
    promoteLegacyRoomPaint() {
        const tally = new Map();
        for (const record of this.faceOverrides) {
            if (!record.roomId) continue;
            const byFinish = tally.get(record.roomId) || new Map();
            byFinish.set(record.finishId, (byFinish.get(record.finishId) || 0) + 1);
            tally.set(record.roomId, byFinish);
        }

        let changed = false;
        for (const [roomId, byFinish] of tally) {
            const room = this.gameMap.regionManager?.get('room', roomId);
            if (!room || room.properties?.wallFinishId) continue;
            const [finishId] = [...byFinish].sort((a, b) => b[1] - a[1])[0] || [];
            if (!finishId || !this.registry.getFinish(finishId)) continue;
            room.properties = { ...room.properties, wallFinishId: finishId };
            this.faceOverrides = this.faceOverrides.filter(
                record => !(record.roomId === roomId && record.finishId === finishId)
            );
            changed = true;
        }
        return changed;
    }

    setRoomWallFinish(roomId, finishId) {
        const room = this.gameMap.regionManager?.get('room', roomId);
        if (!room || (finishId && !this.registry.getFinish(finishId))) return false;
        room.properties = { ...room.properties, wallFinishId: finishId || null };
        this.faceOverrides = this.faceOverrides.filter(record => record.roomId !== roomId);
        this.rebuild();
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
            finishId: record.finishId,
            // Which room this paint was applied to. See resolveFinishOverride:
            // it is what stops the paint following the masonry into a room that
            // was walled off later and never chose this colour.
            roomId: record.roomId ?? this.getFaceRoomIdAt(record.cells.from[0], record.cells.from[1], record.face)
        });
        this.rebuild();
        return true;
    }

    setWallCell(x, y, data = null, options = {}) {
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
        if (options.deferRebuild === true) return;
        this.reindexOpenings();
        this.rebuild();
        if (options.emit !== false) {
            this.gameMap.eventManager?.emit(EVENTS.WALL_GEOMETRY_CHANGED, { mapId: this.gameMap.id, x, y, builder: this });
        }
    }

    /**
     * The authoritative wall edit. Every caller goes through here, so this is
     * where rejection lives: obstructed or locked cells are filtered out and
     * reported rather than thrown, and the per-cell prior state comes back as
     * an inverse change list the undo stack can replay verbatim.
     *
     * @returns {{applied: Array, rejected: Array, inverse: Array}|false}
     */
    applyWallCellChanges(changes = [], options = {}) {
        const normalized = changes.filter(change => Number.isInteger(change?.x) && Number.isInteger(change?.y));
        if (normalized.length === 0) return false;

        const rules = options.validate === false ? null : this.gameMap.container?.buildRules;
        const applied = [];
        const rejected = [];
        for (const change of normalized) {
            const verdict = !rules
                ? BuildRules.ALLOWED
                : (change.data ?? null) === null
                    ? rules.canRemoveWallCell(change.x, change.y)
                    : rules.canBuildWallCell(change.x, change.y);
            if (verdict.allowed) applied.push(change);
            else rejected.push({ ...change, reason: verdict.reason });
        }
        if (applied.length === 0) return { applied, rejected, inverse: [] };

        const inverse = applied.map(({ x, y }) => {
            const previous = this.baseCells.get(`${x},${y}`);
            return { x, y, data: previous ? Utility.deepClone(previous) : null };
        });

        const previousCells = new Map([...this.baseCells].map(([key, cell]) => [key, { ...cell }]));
        try {
            for (const change of applied) {
                this.setWallCell(change.x, change.y, change.data ?? null, { deferRebuild: true });
            }
            this.reindexOpenings();
            this.rebuild();
        } catch (error) {
            this.baseCells = previousCells;
            this.reindexOpenings();
            this.rebuild();
            throw error;
        }
        this.gameMap.eventManager?.emit(EVENTS.WALL_GEOMETRY_CHANGED, {
            mapId: this.gameMap.id,
            cells: applied.map(({ x, y }) => ({ x, y })),
            builder: this
        });
        return { applied, rejected, inverse };
    }

    findPieceForCell(cellX, cellY) {
        return this._pieceByCell.get(`${cellX},${cellY}`) || null;
    }

    /**
     * Re-derive which room each wall face borders, and rebuild if the answer
     * moved.
     *
     * Faces resolve against the region layer, but rooms are recomputed AFTER
     * the geometry change that prompted them — so a wall raised in the same
     * breath as the room it encloses was assigned before that room existed and
     * read as "outside" ever after, which also made it unpaintable. The reverse
     * too: tearing a room down left its walls still pointing at a region that
     * no longer exists, so a stretch of the Kitchen's wall kept selecting as a
     * room that had been deleted.
     *
     * A full rebuild rather than a patch, because face room ids are part of
     * what decides how cells merge into pieces (see canMergeHorizontal) — a run
     * that now borders two different rooms has to become two pieces.
     */
    refreshRoomFaces() {
        const changed = this.pieces.some(piece => piece.cells.some(cell => {
            const faces = this.assignFaces(cell);
            return WallMaterialRegistry.DIRECTIONS.some(direction =>
                cell.faces[direction].roomId !== faces[direction].roomId ||
                cell.faces[direction].materialId !== faces[direction].materialId);
        }));
        if (changed) this.rebuild();
        return changed;
    }

    findPieceById(pieceId) {
        return this.pieces.find(piece => piece.id === pieceId) || null;
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
            // Only what hangs on THIS piece. Faces are 160px tall but rows are
            // 32px apart, so several walls' faces overlap in world space — take
            // every fixture on the map and a painting on the wall in front
            // reserves a band of the wall behind it, where nothing is visible
            // and nothing can be hung.
            const [cellX, cellY] = record.cells?.from || [record.cellX, record.cellY];
            if (this.findPieceForCell(cellX, cellY)?.id !== piece.id) continue;
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

    /**
     * Anchored to the cell the fixture actually hangs over, not to the piece's
     * origin cell, with `u` measured from that cell's left edge (`uPx` says so,
     * since a bare `u` of 0..1 is read as a normalized authored offset).
     *
     * The piece origin moves whenever the run is edited — extend it leftwards
     * and it slides, split it and the recorded cell can end up on the half the
     * fixture is not on — and every read of this record then resolves against
     * the wrong face. The cell under the fixture is the one thing that stays
     * true as long as the fixture does.
     */
    createFixtureRecord(object, placement = this.resolveFixturePlacement(object)) {
        if (!placement) return null;
        const center = placement.position.x + (object.size.width / 2);
        const cellX = Math.floor(center / this.cellSize);
        const cellY = placement.piece.y;
        return {
            id: String(object.id),
            mapId: this.gameMap.id,
            cells: { from: [cellX, cellY], to: [cellX, cellY] },
            face: 'south',
            socketId: 'surface',
            u: center - (cellX * this.cellSize),
            uPx: true,
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

        // `uPx` records say outright that u is pixels from the anchor cell's
        // left edge. Without it the only signal is magnitude, and a fixture
        // centred within a pixel of that edge reads as a normalized 0..1
        // offset and jumps half a cell.
        const localU = record.uPx !== true && Number(record.u) <= 1
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
        // A fixture in hand is never cut. Detaching stops the wall talking to
        // it, so a painting picked up off a lowered wall would otherwise keep
        // the hidden state it had when it was hanging there and be dragged
        // around invisible.
        object.applyWallCut?.(null);
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
            version: 7,
            presentation: this.presentation,
            faceOverrides: this.faceOverrides.map(record => Utility.deepClone(record)),
            attachments: this.decorations.map(decoration => Utility.deepClone(decoration.wallAttachmentRecord)),
            fixtures: this.fixtures.map(record => Utility.deepClone(record)),
            openings: this.openings.map(opening => Utility.deepClone(opening)),
            cellDeltas: this.serializeCellDeltas()
        };
    }

    serializeCellDeltas() {
        const fields = ['constructionId', 'finishId', 'heightCells', 'connectGroup'];
        const deltas = [];
        for (const [key, authored] of this.authoredBaseCells) {
            if (!this.baseCells.has(key)) {
                deltas.push({ x: authored.x, y: authored.y, removed: true });
            }
        }
        for (const [key, cell] of this.baseCells) {
            const authored = this.authoredBaseCells.get(key);
            const changed = !authored || fields.some(field => cell[field] !== authored[field]);
            if (!changed) continue;
            deltas.push(Object.fromEntries([
                ['x', cell.x],
                ['y', cell.y],
                ...fields.map(field => [field, cell[field]])
            ]));
        }
        return deltas.sort((a, b) => a.y - b.y || a.x - b.x);
    }

    restoreState(state = {}) {
        if (state.version >= 7 && Array.isArray(state.cellDeltas)) {
            this.baseCells = new Map([...this.authoredBaseCells].map(([key, cell]) => [
                key,
                Utility.deepClone(cell)
            ]));
            for (const delta of state.cellDeltas) {
                const x = Number(delta.x);
                const y = Number(delta.y);
                if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
                const key = `${x},${y}`;
                if (delta.removed === true) {
                    this.baseCells.delete(key);
                    continue;
                }
                this.baseCells.set(key, {
                    ...this.wallData.defaults,
                    x,
                    y,
                    constructionId: delta.constructionId || this.wallData.defaults.constructionId,
                    finishId: delta.finishId || this.wallData.defaults.finishId,
                    heightCells: delta.heightCells || this.wallData.defaults.heightCells,
                    connectGroup: delta.connectGroup || this.wallData.defaults.connectGroup,
                    opening: null
                });
            }
        }
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
        this.pruneOrphanedRecords();
        this.reindexOpenings();
        this.rebuild();
        // After the first build, so every face knows its room; before anything
        // asks for a finish. Tags overrides saved before they carried one, then
        // folds whole-room paint up into the room itself.
        this.adoptLegacyFaceOverrideRooms();
        if (this.promoteLegacyRoomPaint()) this.rebuild();
        this.bindOpeningObjects();
        this.bindFixtureObjects();
        this.setPresentationMode(state.version >= 2 && SiteConfig.wallSystem.presentationModes.includes(state.presentation)
            ? state.presentation
            : SiteConfig.wallSystem.defaultPresentation);
        this.gameMap.eventManager?.emit(EVENTS.WALL_GEOMETRY_CHANGED, {
            mapId: this.gameMap.id,
            builder: this
        });
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
        this._runPieceIds.clear();
        this.cells.clear();
        this.baseCells.clear();
        this.authoredBaseCells.clear();
        this.openingSlots.clear();
    }
}
