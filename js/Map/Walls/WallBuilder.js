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
                area: { xFactor: [0, 1], yFactor: [1, 0] }
            }
        });
    }

    setPresentation(height, hidden) {
        this.posY = this.piece.baseline - height;
        this.size.height = height;
        const socket = this.sockets.socketsConfig.surface;
        socket.surfaceLength = this.size.width;
        for (const child of this.builder.gameMap.container?.attachments?.childrenOf?.(this) || []) {
            child.setWallVisibility?.(!hidden);
        }
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
    }

    setTarget() {}
    setSpritePosition() {}

    setWallVisibility(visible) {
        this.element.hidden = !visible;
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
}

class WallBuilder {
    static DIRECTIONS = Object.freeze([
        Object.freeze({ name: 'north', dx: 0, dy: -1, bit: 1 }),
        Object.freeze({ name: 'east', dx: 1, dy: 0, bit: 2 }),
        Object.freeze({ name: 'south', dx: 0, dy: 1, bit: 4 }),
        Object.freeze({ name: 'west', dx: -1, dy: 0, bit: 8 })
    ]);

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
        this.pieces = [];
        this.authoredFaceOverrides = Utility.deepClone(wallData.faceOverrides || []);
        this.faceOverrides = Utility.deepClone(this.authoredFaceOverrides);
        this.decorations = [];
        this.presentation = SiteConfig.wallSystem.defaultPresentation;
        this._movingOpeningIds = new Set();
        this._activeCutawayKey = null;
        this._cutawayRoomIds = new Set();
        this._pendingCutawayKey = null;
        this._pendingCutawaySince = 0;
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
        this.createAuthoredAttachments(this.wallData.attachments || []);
        const events = this.gameMap.eventManager;
        if (events) {
            this._unsubscribers.push(events.on('container:active_myte_changed', () => this.commitCutawayRoom(true)));
            this._unsubscribers.push(events.on('wall:geometry_changed', payload => {
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
        const horizontal = opening.axis === 'horizontal';
        const ordered = [...openingCells].sort((a, b) => horizontal ? a[0] - b[0] : a[1] - b[1]);
        const [startX, startY] = ordered[0];
        const [endX, endY] = ordered[ordered.length - 1];
        const before = this.cells.get(`${startX - (horizontal ? 1 : 0)},${startY - (horizontal ? 0 : 1)}`);
        const after = this.cells.get(`${endX + (horizontal ? 1 : 0)},${endY + (horizontal ? 0 : 1)}`);
        const existing = ordered.map(([x, y]) => this.cells.get(`${x},${y}`)).find(Boolean);
        if (!existing && (!before || !after || before.connectGroup !== after.connectGroup)) return;
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
        if (!left || !right || left.mask !== 10 || right.mask !== 10 || left.y !== right.y) return false;
        if (right.x !== left.x + 1 || left.constructionId !== right.constructionId || left.heightCells !== right.heightCells) return false;
        return WallMaterialRegistry.DIRECTIONS.every(direction =>
            left.faces[direction].materialId === right.faces[direction].materialId &&
            left.faces[direction].roomId === right.faces[direction].roomId
        );
    }

    resolveVisibleFinishId(cell) {
        const explicit = this.resolveFinishOverride(cell.x, cell.y, 'south');
        if (explicit) return explicit;
        const hasEast = (cell.mask & 2) !== 0;
        const hasWest = (cell.mask & 8) !== 0;
        if (hasEast !== hasWest) {
            const neighbor = this.cells.get(`${cell.x + (hasEast ? 1 : -1)},${cell.y}`);
            if (neighbor) return this.assignFaces(neighbor).south.materialId;
        }
        return cell.faces.south.materialId;
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
            const baseline = (first.y + 1) * this.cellSize;
            pieces.push({
                id: `wall-${first.x}-${first.y}-${run.length}`,
                x: first.x,
                y: first.y,
                baseline,
                height: construction.height,
                cells: run,
                constructionId: first.constructionId,
                element: null,
                faces: null
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
        for (const piece of this.pieces) this.createPiece(piece);
        this.createAuthoredAttachments(this.wallData.attachments || []);
        this.enforceNodeBudget();
        this.evaluateCutaway();
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
        this.renderPiece(piece);
    }

    getPieceMode(piece) {
        if (this._movingOpeningIds.size > 0) return 'full';
        if (this.presentation === 'down') return 'stub';
        if (this.presentation !== 'cutaway') return 'full';
        const isFrontBoundary = this.getCutawaySubjects().some(subject =>
            this.isFrontBoundaryForSubject(piece, subject)
        );
        return isFrontBoundary ? 'stub' : 'full';
    }

    isFrontBoundaryForSubject(piece, subject) {
        const point = this.getCutawayPoint(subject);
        if (!point) return false;
        const collider = subject.collider || {};
        const subjectLeft = subject.posX + (collider.offsetX || 0);
        const subjectRight = subjectLeft + (collider.width || subject.size?.width || 0);
        const pieceLeft = piece.x * this.cellSize;
        const pieceRight = pieceLeft + (piece.cells.length * this.cellSize);
        const overlapsSubject = subjectRight > pieceLeft && subjectLeft < pieceRight;
        if (!overlapsSubject) return false;

        const subjectRoomIds = new Set(this.getCutawayRoomIds(subject));
        return piece.cells.some(cell =>
            (cell.mask & 10) !== 0 && (cell.mask & 5) === 0 &&
            point.y < piece.baseline &&
            this._cutawayRoomIds.has(cell.faces.north.roomId) &&
            subjectRoomIds.has(cell.faces.north.roomId) &&
            cell.faces.south.roomId !== cell.faces.north.roomId
        );
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

    getCursorCutawaySubject() {
        const container = this.gameMap.container;
        if (SiteConfig.wallSystem.cursorCutawayEnabled !== true ||
            container?.isMouseInContainer?.() !== true) return null;

        const point = container.inputHandler?.getMouseWorldPosition?.();
        if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return null;
        return {
            posX: point.x - 0.5,
            posY: point.y - 0.5,
            size: { width: 1, height: 1 }
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

    renderPiece(piece) {
        const canvas = piece.element;

        // 'hidden' is purely a view mode — collision, line of sight and room
        // topology stay exactly as they are, only the art stops drawing.
        if (this.presentation === 'hidden') {
            canvas.hidden = true;
            for (const surface of Object.values(piece.faces)) surface.setPresentation(0, true);
            return;
        }
        canvas.hidden = false;

        const construction = this.registry.getConstruction(piece.constructionId);
        const constructionImage = this.registry.getConstructionImage(piece.constructionId);
        const mode = this.getPieceMode(piece);
        const height = mode === 'stub' ? construction.stubHeight : construction.height;
        const band = construction.bands[mode];
        canvas.width = piece.cells.length * construction.cellSize;
        canvas.height = height;
        canvas.style.width = `${canvas.width}px`;
        canvas.style.height = `${height}px`;
        canvas.style.top = `${piece.baseline - height}px`;
        canvas.dataset.wallMode = mode;
        const context = canvas.getContext('2d');
        context.imageSmoothingEnabled = false;

        piece.cells.forEach((cell, index) => {
            const destinationX = index * construction.cellSize;
            const column = construction.maskMap[cell.mask];
            context.drawImage(
                constructionImage,
                column * construction.cellSize,
                band.baseY,
                construction.cellSize,
                height,
                destinationX,
                0,
                construction.cellSize,
                height
            );
            if ((cell.mask & 10) !== 0 || cell.mask === 0) {
                const finishId = this.resolveVisibleFinishId(cell);
                const finish = this.registry.getFinish(finishId);
                const finishImage = this.registry.getFinishImage(finishId);
                const finishColumn = finish?.maskMap?.[cell.mask];
                const finishBand = finish?.bands?.[mode];
                if (finishImage && Number.isInteger(finishColumn) && finishBand) {
                    context.drawImage(
                        finishImage,
                        finishColumn * construction.cellSize, finishBand.baseY,
                        construction.cellSize, height,
                        destinationX, 0, construction.cellSize, height
                    );
                }
            }
            this.applyOpeningAperture(context, cell, destinationX, mode, construction);
        });

        const collapsed = mode === 'stub' && this.presentation === 'cutaway';
        for (const [direction, surface] of Object.entries(piece.faces)) {
            const hidden = collapsed && piece.cells.some(cell => cell.faces[direction].roomId);
            surface.setPresentation(height, hidden);
        }
    }

    applyOpeningAperture(context, cell, destinationX, mode, construction) {
        const opening = cell.opening;
        if (!opening) return;
        const renderedHeight = mode === 'stub' ? construction.stubHeight : construction.height;
        const openingHeight = Utility.clamp(Number(opening.openingHeight) || 0, 0, construction.height);
        const sillHeight = Utility.clamp(Number(opening.sillHeight) || 0, 0, construction.height - openingHeight);
        const apertureBottom = construction.height - sillHeight;
        const apertureTop = apertureBottom - openingHeight;
        const visibleTop = construction.height - renderedHeight;
        const clippedTop = Math.max(apertureTop, visibleTop);
        const clippedBottom = Math.min(apertureBottom, construction.height);
        if (clippedBottom <= clippedTop) return;

        const localTop = clippedTop - visibleTop;
        const localBottom = clippedBottom - visibleTop;
        context.clearRect(destinationX, localTop, construction.cellSize, localBottom - localTop);
    }

    evaluateCutaway() {
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
        this.evaluateCutaway();
        this.gameMap.eventManager?.emit('wall:presentation_changed', { mapId: this.gameMap.id, mode });
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
        this.gameMap.eventManager?.emit('wall:geometry_changed', { mapId: this.gameMap.id, x, y, builder: this });
    }

    findPieceForCell(cellX, cellY) {
        return this.pieces.find(piece => piece.cells.some(cell => cell.x === cellX && cell.y === cellY)) || null;
    }

    getOpeningAxis(object) {
        const facing = object.getConfig?.('facingDirection', object.facingDirection);
        if (facing === 'E' || facing === 'W') return 'vertical';
        if (facing === 'N' || facing === 'S') return 'horizontal';
        return object.size.width >= object.size.height ? 'horizontal' : 'vertical';
    }

    getOpeningObjectOffset(object, opening = null) {
        const wallOpening = object?.getConfig?.('wallOpeningConfig', {}) || {};
        const offset = object?.getConfig?.('wallOpeningConfig.placementOffset', {}) || {};
        const type = String(object?.type || '').toLowerCase();
        const openingHeight = Number(opening?.openingHeight ?? wallOpening.openingHeight) ||
            (type === 'window' ? 64 : 128);
        const sillHeight = Number(opening?.sillHeight ?? wallOpening.sillHeight) || 0;
        return {
            x: Number(offset.x) || 0,
            y: type === 'window'
                ? this.cellSize - openingHeight - sillHeight
                : Number(offset.y) || 0
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
            (String(object?.type || '').toLowerCase() === 'window' ? 64 : 128);

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
        const horizontal = axis === 'horizontal';
        const ordered = [...cells].sort((a, b) => horizontal ? a[0] - b[0] : a[1] - b[1]);
        const [startX, startY] = ordered[0];
        const [endX, endY] = ordered[ordered.length - 1];
        const before = this.baseCells.get(`${startX - (horizontal ? 1 : 0)},${startY - (horizontal ? 0 : 1)}`);
        const after = this.baseCells.get(`${endX + (horizontal ? 1 : 0)},${endY + (horizontal ? 0 : 1)}`);
        return !!before && !!after && before.connectGroup === after.connectGroup;
    }

    isOpeningPlacementValid(object, placement) {
        if (!placement || !this.canBridgeOpeningCells(placement.cells, placement.axis)) return false;
        return placement.cells.every(([cellX, cellY]) => {
            const occupied = this.openingByCell.get(`${cellX},${cellY}`);
            if (occupied && String(occupied.id) !== String(object.id)) return false;
            const cell = this.baseCells.get(`${cellX},${cellY}`);
            if (!cell) return true;
            const mask = this.computeMask(cell);
            return placement.axis === 'horizontal' ? (mask & 10) !== 0 : (mask & 5) !== 0;
        });
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
            this.evaluateCutaway();
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
        this.evaluateCutaway();
        if (attached && object.type === 'DOOR') this.gameMap.buildDoorRoomTopology?.();
        return attached;
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

    getLightBlockers() {
        return [...this.cells.values()]
            .filter(cell => !cell.opening && cell.blocksLineOfSight !== false)
            .map(cell => ({
                type: 'rect',
                left: cell.x * this.cellSize,
                top: cell.y * this.cellSize,
                right: (cell.x + 1) * this.cellSize,
                bottom: (cell.y + 1) * this.cellSize,
                width: this.cellSize,
                height: this.cellSize
            }));
    }

    serializeState() {
        return {
            version: 4,
            presentation: this.presentation,
            faceOverrides: this.faceOverrides.map(record => Utility.deepClone(record)),
            attachments: this.decorations.map(decoration => Utility.deepClone(decoration.wallAttachmentRecord)),
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
        this.normalizeOpeningFootprints();
        this.reindexOpenings();
        this.rebuild();
        this.bindOpeningObjects();
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
        this.cells.clear();
        this.baseCells.clear();
        this.openingSlots.clear();
    }
}
