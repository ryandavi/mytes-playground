class WallBuilder extends WallStructure {
    static OPPOSITE_FACES = Object.freeze({
        north: 'south', south: 'north', west: 'east', east: 'west'
    });

    static MASK_NORTH = WallGeometry.MASK_NORTH;
    static MASK_EAST = WallGeometry.MASK_EAST;
    static MASK_SOUTH = WallGeometry.MASK_SOUTH;
    static MASK_WEST = WallGeometry.MASK_WEST;
    static MASK_HORIZONTAL = WallGeometry.MASK_HORIZONTAL;
    static MASK_VERTICAL = WallGeometry.MASK_VERTICAL;
    static MASK_STRAIGHT_H = WallGeometry.MASK_HORIZONTAL;
    static CURSOR_SUBJECT_TTL_MS = 4;
    static DIRECTIONS = WallGeometry.DIRECTIONS;

    static isHorizontalMask(mask) {
        return (mask & WallBuilder.MASK_HORIZONTAL) !== 0;
    }

    static isVerticalMask(mask) {
        return (mask & WallBuilder.MASK_VERTICAL) !== 0;
    }

    static isStraightHorizontal(mask) {
        return mask === WallBuilder.MASK_STRAIGHT_H;
    }

    static applyFixtureCut(element, cutY, posY, height = 0) {
        if (!element) return;
        const behavior = SiteConfig.wallSystem.fixtureCutBehavior;
        const cut = Number.isFinite(cutY) && cutY > posY;
        element.classList.toggle('is-wall-cut', behavior === 'hide' && cut);
        element.style.clipPath = (behavior === 'clip' && cut && height > 0)
            ? `inset(${Utility.clamp(cutY - posY, 0, height)}px 0 0 0)`
            : '';
    }

    static inheritsHorizontalFace(mask) {
        return ((mask & WallBuilder.MASK_EAST) !== 0) !== ((mask & WallBuilder.MASK_WEST) !== 0);
    }

    static inheritsVerticalFace(mask) {
        return ((mask & WallBuilder.MASK_NORTH) !== 0) !== ((mask & WallBuilder.MASK_SOUTH) !== 0);
    }

    static isEndCapMask(mask) {
        return WallBuilder.isHorizontalMask(mask) &&
            !WallBuilder.isVerticalMask(mask) &&
            !WallBuilder.isStraightHorizontal(mask);
    }

    constructor(gameMap, wallData, registry) {
        super();
        this.gameMap = gameMap;
        this.wallData = wallData;
        this.registry = registry;
        this.atlas = wallData.wangAtlas || null;
        this.cellSize = gameMap.gridSystem?.config?.cellSize || 32;
        this.layer = gameMap.layers.objects;
        this.flatCanvas = null;
        this._flatDirty = true;
        this.cells = new Map();
        this.baseCells = new Map();
        this.openingKeys = new Set();
        this.openingByCell = new Map();
        this.openings = Utility.deepClone(wallData.openings || []);
        this.openingSlots = new Map();
        this.fixtures = Utility.deepClone(wallData.fixtures || []);
        this.pieces = [];
        this._pieceByCell = new Map();
        this.decorations = [];
        this.rebuilds = 0;
        this.piecesRedrawn = 0;
        this.presentation = SiteConfig.wallSystem.defaultPresentation;
        this._movingOpeningIds = new Set();
        this._travellingRecordIds = new Set();
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
        if (!this.gameMap.buildDocument) throw new Error('WallBuilder requires a BuildDocument');
        this.normalizeOpeningFootprints();
        this.pruneOrphanedRecords();
        this.reindexOpenings();
        for (const [key, cell] of this.cells) {
            // A cell the author never painted, standing here only because an
            // opening bridged the gap it was drawn into. It behaves as wall from
            // now on, but it is not authored geometry — the Tiled exporter has
            // to be able to tell the difference, or a doorway the author drew as
            // a gap in the tile layer comes back as solid wall.
            if (!this.baseCells.has(key)) this.baseCells.set(key, { ...cell, opening: null, bridged: true });
        }
        this.reindexOpenings();
        this.commitCutawayRoom(true);
        this.rebuild();
        await this.createFlatOverlay();
        this.bindOpeningObjects();
        this.bindFixtureObjects();
        this.createAuthoredAttachments(this.wallData.attachments || []);
        const events = this.gameMap.eventManager;
        if (events) {
            this._unsubscribers.push(events.on(EVENTS.CONTAINER_ACTIVE_MYTE_CHANGED, () => this.commitCutawayRoom(true)));
        }
        return this;
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
        this.openingSlots.clear();
        this.disposeFlatOverlay();
    }
}
