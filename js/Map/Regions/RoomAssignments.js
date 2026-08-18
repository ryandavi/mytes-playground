// ─────────────────────────────────────────────────────────────────────────────
// RoomAssignments — the player saying which room a patch of floor belongs to.
//
// Rooms are normally worked out from the walls, and that is right nearly all of
// the time. It has one gap, and it is a shape people actually build: a kitchen
// opening onto a dining room is two rooms with two floors and no wall anywhere
// between them, and a flood fill cannot find a room that nothing encloses.
//
// The first attempt at this drew boundary LINES on the grid seams. It worked and
// nobody could use it: a line is a statement about two rooms at once, it is
// invisible until you tint the rooms, it only ever split — never merged, never
// grew — and the panel needed three paragraphs to explain what a click did.
//
// This stores the obvious thing instead: a cell, and the room it is in. Every
// operation anyone actually wants falls out of painting cells, with no new
// concepts and no modes:
//
//   split    paint half the space as a new room
//   merge    paint one room's floor with the other room
//   grow     paint the cells next door
//   erase    paint them back to nobody, and the walls decide again
//
// An assignment OVERRIDES what the walls say; a cell nobody has painted still
// belongs to whatever encloses it. So the system stays wall-driven by default
// and the player only overrules it where they mean to.
// ─────────────────────────────────────────────────────────────────────────────
class RoomAssignments {
    // Painted rooms need an id of their own from the moment they are painted:
    // they exist because somebody said so, not because a wall enclosed them, so
    // there is nothing to re-derive the id from on the next pass. The prefix
    // keeps them apart from `room_auto_*`, which IS re-derived every time.
    static PAINTED_PREFIX = 'room_painted_';

    constructor(gameMap) {
        this.gameMap = gameMap;
        this.cells = new Map();
    }

    static key(x, y) {
        return `${x},${y}`;
    }

    get size() {
        return this.cells.size;
    }

    get(x, y) {
        return this.cells.get(RoomAssignments.key(x, y)) ?? null;
    }

    roomIds() {
        return [...new Set(this.cells.values())];
    }

    cellsFor(roomId) {
        return [...this.cells].filter(([, id]) => id === roomId).map(([key]) => key);
    }

    /** The next free painted-room id. Numbered so two of them are tellable apart. */
    mintRoomId() {
        const taken = new Set([
            ...this.roomIds(),
            ...(this.gameMap?.regionManager?.all('room') ?? []).map(room => room.id)
        ]);
        for (let index = 1; ; index++) {
            const id = `${RoomAssignments.PAINTED_PREFIX}${index}`;
            if (!taken.has(id)) return id;
        }
    }

    /**
     * The authoritative edit. Mirrors the wall builder's applyWallCellChanges so
     * both build tools report their work the same way and share one undo stack.
     *
     * @param {Array<{x: number, y: number, roomId: string|null}>} changes
     * @returns {{applied: Array, inverse: Array}|null}
     */
    applyChanges(changes, { emit = true } = {}) {
        if (!Array.isArray(changes) || changes.length === 0) return null;
        const applied = [];
        const inverse = [];
        for (const change of changes) {
            if (!Number.isInteger(change?.x) || !Number.isInteger(change?.y)) continue;
            const key = RoomAssignments.key(change.x, change.y);
            const had = this.cells.get(key) ?? null;
            const next = change.roomId ?? null;
            if (had === next) continue;
            if (next === null) this.cells.delete(key);
            else this.cells.set(key, next);
            applied.push({ x: change.x, y: change.y, roomId: next });
            inverse.push({ x: change.x, y: change.y, roomId: had });
        }
        if (applied.length === 0) return { applied, inverse };
        if (emit) this.emitChanged();
        return { applied, inverse };
    }

    /**
     * Drops assignments that have stopped meaning anything — a cell that a wall
     * now stands on, or one pointing at a room that no longer exists.
     *
     * Without this, building over a painted room and knocking the wall down
     * again resurrects a room the player stopped thinking about weeks ago.
     */
    prune({ emit = true } = {}) {
        const walls = this.gameMap?.wallBuilder?.cells;
        const doomed = [...this.cells.keys()].filter(key => walls?.has(key));
        if (doomed.length === 0) return [];
        for (const key of doomed) this.cells.delete(key);
        if (emit) this.emitChanged();
        return doomed;
    }

    emitChanged() {
        this.gameMap?.eventManager?.emit(EVENTS.ROOM_ASSIGNMENTS_CHANGED, {
            mapId: this.gameMap?.id,
            assignments: this
        });
    }

    serializeState() {
        return this.cells.size > 0 ? Object.fromEntries(this.cells) : null;
    }

    restoreState(data, { emit = true } = {}) {
        this.cells = new Map(Object.entries(data || {}));
        if (emit) this.emitChanged();
        return this.cells.size;
    }

    dispose() {
        this.cells.clear();
        this.gameMap = null;
    }
}
