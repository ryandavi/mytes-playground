/**
 * BuildRules — the single answer to "can I do that?" in build mode.
 *
 * Validation, locks and undo all ask the same questions here, so they can never
 * disagree. Every answer is `{ allowed, reason }`; the reason is player-facing
 * copy the UI shows as a tooltip or a toast, never an internal code.
 */
class BuildRules {
    static ALLOWED = Object.freeze({ allowed: true, reason: null });

    static deny(reason) {
        return { allowed: false, reason };
    }

    constructor(container) {
        this.container = container;
    }

    get gameMap() {
        return this.container?.gameMap || null;
    }

    get wallBuilder() {
        return this.gameMap?.wallBuilder || null;
    }

    get policy() {
        return this.container?.gameMode?.getPolicy?.() ?? 'none';
    }

    inBuildMode() {
        return this.container?.gameMode?.isBuild() === true;
    }

    // ── Walls ─────────────────────────────────────────────────────────────────

    /**
     * A cell may be built on when nothing physical already stands there and the
     * map's policy opens it. Removal is a separate question — see
     * canRemoveWallCell — because a cell can be perfectly clear and still be
     * holding up a door.
     */
    canBuildWallCell(x, y) {
        const builder = this.wallBuilder;
        if (!builder) return BuildRules.deny('This map has no wall system.');

        const locked = this.getCellLock(x, y);
        if (locked) return locked;

        const obstruction = builder.getCellObstruction(x, y);
        if (obstruction) return BuildRules.deny(obstruction.reason);

        // A painting hanging here has nowhere to go if a wall lands on it.
        // Wall-mounted things are exempt from the obstruction sweep on purpose —
        // an opening or a fixture is SUPPOSED to share a cell with the wall it
        // sits in — but that exemption was reading "this fixture belongs here"
        // as "anything at all may be built here". No clearance: laying wall
        // beside a painting is what a wall is for, only laying it across one is
        // refused.
        const mounted = builder.getCellMounting(x, y);
        if (mounted) return BuildRules.deny(mounted.reason);

        // Not about this cell but its neighbours: a wall butting into the side
        // of a door or window turns that opening's cell into a junction and
        // draws right through it, and the same arm run into a wall carrying a
        // painting splits the run out from under it.
        const junction = builder.getOpeningJunctionConflict(x, y) ||
            builder.getFixtureJunctionConflict(x, y);
        if (junction) return BuildRules.deny(junction.reason);

        return BuildRules.ALLOWED;
    }

    canRemoveWallCell(x, y) {
        const builder = this.wallBuilder;
        if (!builder) return BuildRules.deny('This map has no wall system.');
        if (!builder.baseCells.has(`${x},${y}`)) return BuildRules.deny('There is no wall here.');

        const locked = this.getCellLock(x, y);
        if (locked) return locked;

        // With clearance, unlike building: wall art does not fill its cell edge
        // to edge, so a run that stops exactly where a painting or a window
        // ends leaves it looking like it is hanging off the end of the wall.
        const mounted = builder.getCellMounting(x, y, builder.getMountedClearancePx());
        if (mounted) return BuildRules.deny(mounted.reason);

        return BuildRules.ALLOWED;
    }

    /**
     * Locks that apply to a cell whichever way it is being edited: the authored
     * `locked` flag, map-baked attachments with no inventory representation to
     * return, and the inverted default of the 'limited' policy.
     */
    getCellLock(x, y) {
        const builder = this.wallBuilder;
        const key = `${x},${y}`;

        if (builder.baseCells.get(key)?.locked === true ||
            builder.authoredBaseCells.get(key)?.locked === true) {
            return BuildRules.deny('This wall is part of the building and cannot be changed.');
        }

        if (builder.hasAuthoredAttachmentAt(x, y)) {
            return BuildRules.deny('Something built into this wall is in the way.');
        }

        if (this.policy === 'limited' && !this.isCellBuildable(x, y)) {
            return BuildRules.deny('You can only build on your own plot here.');
        }

        return null;
    }

    // 'limited' inverts the default: only regions explicitly marked buildable
    // are open, which lets a shared map hand out a small plot.
    isCellBuildable(x, y) {
        const cellSize = this.gameMap?.gridSystem?.config?.cellSize || 32;
        const regions = this.gameMap?.regionManager?.regionsAt(
            (x + 0.5) * cellSize,
            (y + 0.5) * cellSize
        ) || [];
        return regions.some(region => region.properties?.buildable === true);
    }

    // ── Terrain ───────────────────────────────────────────────────────────────

    get terrainBuilder() {
        return this.gameMap?.terrainBuilder || null;
    }

    /**
     * Ground is under everything, so nothing standing on a cell can be in the
     * way of painting it — a table does not stop the grass beneath it being
     * grass. The only questions are whether this map has paintable ground at
     * all, and whether the plot is the player's to edit.
     */
    canPaintTerrainCell(x, y) {
        if (!this.terrainBuilder) return BuildRules.deny('This map has no paintable ground.');
        if (this.policy === 'limited' && !this.isCellBuildable(x, y)) {
            return BuildRules.deny('You can only build on your own plot here.');
        }
        return BuildRules.ALLOWED;
    }

    // ── Surfaces ──────────────────────────────────────────────────────────────

    canPaintWallFace(cell) {
        if (!cell) return BuildRules.deny('Nothing selected.');
        const locked = this.getCellLock(cell.x, cell.y);
        if (locked) return locked;
        return BuildRules.ALLOWED;
    }

    canPaintRoomFloor(room) {
        if (!room) return BuildRules.deny('Nothing selected.');
        if (room.properties?.finishLocked === true) {
            return BuildRules.deny('This floor is part of the building and cannot be repainted.');
        }
        if (this.policy === 'limited' && room.properties?.buildable !== true) {
            return BuildRules.deny('You can only decorate your own plot here.');
        }
        return BuildRules.ALLOWED;
    }

    // ── Objects ───────────────────────────────────────────────────────────────

    /**
     * Which inventory items are building rather than playing.
     *
     * Scenery is furnishing a room, so it belongs to Build mode. A ball or an
     * apple is not: those are things you hand to a myte, and they go down
     * wherever you are standing. The line is the item's own type and not how
     * it lands in the world, because a toy is a map object too — reading the
     * world mode instead locked balls behind the mode switch.
     */
    static isBuildOnlyItem(itemDefinition) {
        return String(itemDefinition?.type || '').toLowerCase() === 'furniture';
    }

    /**
     * Why a placement was refused, in the player's words.
     *
     * Shared by the object being dragged around the map and the ghost being
     * dragged out of the inventory: the inventory has no object yet, only a
     * descriptor, and the two were saying different things about the same
     * refusal — the drag from the inventory was saying nothing at all.
     */
    static describePlacementRefusal({ wallFixture = false, wallOpening = false } = {}) {
        if (wallOpening) return 'It has to sit in a straight run of wall, clear of corners.';
        if (wallFixture) return 'It has to hang on a clear patch of wall.';
        return 'It does not fit there.';
    }

    /**
     * Furniture-style editing is build-mode only. Mytes are unaffected — they
     * are not scenery, and they are the one thing in the world that moves
     * itself.
     *
     * A gameplay pickup like a ball is furniture *here* and a toy in Play mode:
     * the two readings never collide, because this only answers while build
     * mode is on, and the play-mode Drag tool still owns the same object the
     * rest of the time. Excluding pickups meant a ball sitting in the middle of
     * a room you were laying out could not be moved out of the way.
     */
    isBuildModeObject(object) {
        if (!(object instanceof MapObject)) return false;
        // Anything the world lets you pick up and put down is scenery to build
        // mode. Storable furniture also has an inventory form and can be packed
        // away; the rest can only be repositioned — `canStoreObject` draws that
        // second line. A couch was draggable in Play and immovable in Build
        // purely because nobody had given it a `storable` flag.
        return object.getConfig?.('draggable', false) === true ||
            object.getConfig?.('storable', false) === true ||
            object.getConfig?.('canPickUp', false) === true ||
            !!ItemRegistry.findItemForWorldObject?.(object);
    }

    canMoveObject(object) {
        if (!object) return BuildRules.deny('Nothing selected.');
        if (object.getConfig?.('locked', false) === true) {
            return BuildRules.deny('This is fixed in place.');
        }
        if (object.isInUse?.() === true) {
            return BuildRules.deny(`${this.describeOccupant(object)} is on it.`);
        }
        return BuildRules.ALLOWED;
    }

    canStoreObject(object) {
        if (!object) return BuildRules.deny('Nothing selected.');
        if (object.getConfig?.('storable', false) === false) {
            return BuildRules.deny('This cannot be picked up.');
        }
        if (!ItemRegistry.findItemForWorldObject?.(object)) {
            return BuildRules.deny('This has no inventory form.');
        }

        const movable = this.canMoveObject(object);
        // A surface holding something can still be pushed around — it carries
        // its occupants — but it cannot be taken apart into the inventory.
        if (!movable.allowed) {
            return object.isInUse?.() === true ? BuildRules.deny('Empty it first.') : movable;
        }
        return BuildRules.ALLOWED;
    }

    // Storing a stateful object throws its state away; moving it does not.
    // The one place a confirm is worth asking for.
    getStoreWarning(object) {
        return object?.getStorageResetWarning?.() ?? null;
    }

    describeOccupant(object) {
        const children = this.container?.attachments?.childrenOf?.(object) || [];
        return children[0]?.name || 'Something';
    }

    /**
     * Shared footprint test for placing, dropping and rotating: the same
     * obstruction query walls use, run the other way round.
     */
    canPlaceAt(object, x = object?.posX, y = object?.posY) {
        if (!object) return BuildRules.deny('Nothing to place.');
        if (!this.gameMap?.gridSystem) return BuildRules.ALLOWED;

        // Wall-mounted things answer for themselves: a painting belongs on a
        // wall, so the floor rules below would refuse every valid position.
        if (this.isWallMounted(object)) {
            const wallOpening = this.wallBuilder?.isWallOpeningObject(object) === true;
            return object.checkDropValidity?.(x, y) === false
                ? BuildRules.deny(BuildRules.describePlacementRefusal({
                    wallOpening,
                    wallFixture: !wallOpening
                }))
                : BuildRules.ALLOWED;
        }

        if (object.checkDropValidity?.(x, y) === false) {
            return BuildRules.deny('Something is already there.');
        }

        const bounds = object.getDropValidationBounds?.(x, y) ??
            { x, y, width: object.size?.width ?? 0, height: object.size?.height ?? 0 };
        if (this.wallBuilder?.rectOverlapsWall(bounds)) return BuildRules.deny('A wall is in the way.');

        return BuildRules.ALLOWED;
    }

    // A fixture or opening occupies no grid cell — that is exactly what makes
    // it wall-mounted rather than floor-standing.
    isWallMounted(object) {
        return object.getGridOccupancyBounds?.() === null ||
            this.wallBuilder?.isWallOpeningObject(object) === true;
    }

    dispose() {
        this.container = null;
    }
}
