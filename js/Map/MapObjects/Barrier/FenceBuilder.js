/**
 * FenceBuilder — the map-object side of the Fence tool.
 *
 * Walls are tiles edited through WallBuilder; fences are ordinary
 * FenceMapObjects that happen to be laid down a cell at a time. So this is a
 * thin helper, not a second WallBuilder: it turns "the cell at (x, y)" into a
 * placed/removed FenceMapObject, answers whether a cell is clear enough to take
 * one, and keeps the neighbours' connection sprites honest. Persistence is the
 * normal WorldState object path (FenceMapObject.serializeState), so nothing
 * here writes to the save.
 *
 * The panel↔builder contract is deliberately the same shape WallBuildPanel /
 * CellDragBuildPanel expect: `checkCell(cell, op)` returns a BuildRules verdict,
 * `placeCells` / `removeCells` do the work and hand back enough to build undo.
 */
class FenceBuilder {
    static FENCE_TYPE = 'FENCE';
    static GATE_TYPE = 'GATE';
    static DEFAULT_VARIANT = 'wooden_fence';

    static NEIGHBOURS = [
        { dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }
    ];

    constructor(gameMap) {
        this.gameMap = gameMap;
    }

    get grid() {
        return this.gameMap?.gridSystem || null;
    }

    get cellSize() {
        return this.grid?.config?.cellSize ?? 32;
    }

    get inventory() {
        return this.gameMap?.container?.inventory || null;
    }

    // ── Grid <-> world ───────────────────────────────────────────────────────

    _colliderFor(type) {
        const region = MapObjectFactory.getTypeConfig(type)?.spatial?.regions?.collider;
        const cs = this.cellSize;
        return {
            offsetX: region?.x ?? region?.offsetX ?? 0,
            offsetY: region?.y ?? region?.offsetY ?? cs,
            width: region?.width ?? cs,
            height: region?.height ?? cs
        };
    }

    /**
     * A position for a fresh object of `type` such that its collider box fills
     * grid cell (gx, gy): centred across the cell, and sitting on the cell's
     * bottom edge so a tall gate lines its foot up with the fence beside it.
     */
    worldPosForObject(type, gx, gy) {
        const cs = this.cellSize;
        const c = typeof type === 'string' ? this._colliderFor(type) : {
            offsetX: type.collider?.offsetX ?? 0,
            offsetY: type.collider?.offsetY ?? 0,
            width: type.collider?.width ?? type.size?.width ?? cs,
            height: type.collider?.height ?? type.size?.height ?? cs
        };
        return {
            x: (gx * cs) + ((cs - c.width) / 2) - c.offsetX,
            y: ((gy + 1) * cs) - c.height - c.offsetY
        };
    }

    worldPosForCell(gx, gy) {
        return this.worldPosForObject(FenceBuilder.FENCE_TYPE, gx, gy);
    }

    cellForObject(object, x = object.posX, y = object.posY) {
        const cs = this.cellSize;
        const offX = object.collider?.offsetX ?? 0;
        const offY = object.collider?.offsetY ?? 0;
        const w = object.collider?.width ?? object.size?.width ?? cs;
        const h = object.collider?.height ?? object.size?.height ?? cs;
        return {
            x: Math.floor((x + offX + w / 2) / cs),
            y: Math.floor((y + offY + h / 2) / cs)
        };
    }

    // ── Queries ──────────────────────────────────────────────────────────────

    _cell(x, y) {
        return this.grid?.grid?.[x]?.[y] || null;
    }

    _postOfType(x, y, type) {
        const cell = this._cell(x, y);
        if (!cell) return null;
        for (const entry of cell.objects ?? []) {
            if (entry?.type === type && entry.active !== false) return entry;
        }
        return null;
    }

    fenceAt(x, y) {
        return this._postOfType(x, y, FenceBuilder.FENCE_TYPE);
    }

    gateAt(x, y) {
        return this._postOfType(x, y, FenceBuilder.GATE_TYPE);
    }

    /**
     * What, if anything, is standing in this cell that a fence cannot share it
     * with. Existing fences and gates are fine (laying over them is a no-op or a
     * gate swap); anything else solid — furniture, an NPC, a myte — is not.
     * @returns {string|null} the blocker's name, or null when the cell is clear
     */
    cellBlockerName(x, y, ignore = null) {
        const cell = this._cell(x, y);
        if (!cell) return 'the edge of the map';
        for (const entry of cell.objects ?? []) {
            if (entry === ignore || entry?.active === false) continue;
            if (entry?.type === FenceBuilder.FENCE_TYPE || entry?.type === FenceBuilder.GATE_TYPE) continue;
            // A myte (or any entity) indexes itself in the grid with no config
            // to ask — treat it as a hard blocker.
            if (typeof entry?.getConfig !== 'function') return entry?.name || 'a creature';
            if (entry.getConfig('visual.overlappable', false)) continue;
            return entry.name || entry.getDisplayName?.() || 'something';
        }
        return null;
    }

    /**
     * The pre-flight the panel draws its ghosts from. Same verdict shape the
     * wall rules use.
     */
    checkCell(cell, operation = 'add') {
        const { x, y } = cell;
        const grid = this.grid;
        if (!grid) return BuildRules.deny('This map has no fence system.');
        if (x < 0 || y < 0 || x >= grid.gridWidth || y >= grid.gridHeight) {
            return BuildRules.deny('That is off the map.');
        }

        if (operation === 'remove') {
            return this.fenceAt(x, y)
                ? BuildRules.ALLOWED
                : BuildRules.deny('There is no fence here.');
        }

        // Adding over a post that already stands here is allowed and does
        // nothing — the ghost shows it inert rather than refused.
        if (this.fenceAt(x, y) || this.gateAt(x, y)) return BuildRules.ALLOWED;

        if (this._cell(x, y)?.tileWalkable === false) {
            return BuildRules.deny('Nothing can stand there.');
        }
        if (this.gameMap.wallBuilder?.cells?.has(`${x},${y}`)) {
            return BuildRules.deny('A wall is in the way.');
        }
        const blocker = this.cellBlockerName(x, y);
        if (blocker) {
            return BuildRules.deny(`${blocker.charAt(0).toUpperCase()}${blocker.slice(1)} is in the way.`);
        }
        return BuildRules.ALLOWED;
    }

    /**
     * Whether a dragged post (a gate looking for a fence to replace, say) may
     * settle in this cell. Looser than `checkCell('add')` on one point: a fence
     * already here is not a blocker, it is the thing being replaced.
     */
    canHostPost(x, y, object) {
        const grid = this.grid;
        if (!grid || x < 0 || y < 0 || x >= grid.gridWidth || y >= grid.gridHeight) return false;
        if (this._cell(x, y)?.tileWalkable === false) return false;
        if (this.gameMap.wallBuilder?.cells?.has(`${x},${y}`)) return false;
        if (this.gateAt(x, y) && this.gateAt(x, y) !== object) return false;
        return this.cellBlockerName(x, y, object) === null;
    }

    // ── Mutations ────────────────────────────────────────────────────────────

    /**
     * @param {Array<{x,y,variant}>} entries
     * @returns {{placed: Array<{x,y,variant,id}>, rejected: Array<{x,y,reason}>}}
     */
    placeCells(entries) {
        const map = this.gameMap;
        const placed = [];
        const rejected = [];
        const touched = new Set();

        for (const { x, y, variant } of entries) {
            if (this.fenceAt(x, y)) continue;                       // already there
            const pos = this.worldPosForCell(x, y);
            const object = map.addObject(FenceBuilder.FENCE_TYPE, variant || FenceBuilder.DEFAULT_VARIANT, pos.x, pos.y);
            if (!object) {
                rejected.push({ x, y, reason: 'A fence could not be placed there.' });
                continue;
            }
            // render() sets the sprite's z-index inline but leaves renderState
            // untouched, so the first MapRenderer.flush() (renderState still
            // dirty, zIndex still 0) would stamp it back to 0 and drop the fence
            // behind neighbouring walls until something moved it. The furniture
            // drop path avoids this by flushing position on placement — do the
            // same here.
            object.updatePosition?.();
            placed.push({ x, y, variant: object.variant, id: String(object.id) });
            touched.add(`${x},${y}`);
        }

        this._afterMutation(touched);
        return { placed, rejected };
    }

    /**
     * @param {Array<{x,y}>} coords
     * @param {{toInventory?: boolean}} options
     * @returns {{removed: Array<{x,y,variant}>, rejected: Array<{x,y,reason}>}}
     */
    removeCells(coords, { toInventory = false } = {}) {
        const map = this.gameMap;
        const removed = [];
        const rejected = [];
        const touched = new Set();

        for (const { x, y } of coords) {
            const fence = this.fenceAt(x, y);
            if (!fence) {
                rejected.push({ x, y, reason: 'There is no fence here.' });
                continue;
            }
            const variant = fence.variant;
            if (toInventory && !this._store(fence)) {
                rejected.push({ x, y, reason: 'There is not enough inventory space.' });
                continue;
            }
            if (!toInventory) fence.remove();
            removed.push({ x, y, variant });
            touched.add(`${x},${y}`);
        }

        if (touched.size) map.removeInactiveObjects?.();
        this._afterMutation(touched);
        return { removed, rejected };
    }

    /**
     * A dragged gate has come to rest. If it landed on a fence, that fence is
     * replaced — pulled into the inventory, its neighbours re-pointed at the
     * gate. The fence side is recorded on its own history entry; the gate's own
     * move is the map-object drag system's to undo.
     */
    settlePost(object, cell = this.cellForObject(object)) {
        const fence = this.fenceAt(cell.x, cell.y);
        if (fence && fence !== object) {
            const variant = fence.variant;
            if (!this._store(fence)) fence.remove();
            this.gameMap.removeInactiveObjects?.();
            this._recordSwap(cell, variant);
        }
        this._afterMutation(new Set([`${cell.x},${cell.y}`]));
        object._notifyFenceNeighbors?.();
        return true;
    }

    _recordSwap(cell, variant) {
        const history = this.gameMap?.container?.buildHistory;
        if (!history) return;
        history.push({
            label: 'Replace Fence with Gate',
            undo: () => {
                this.placeCells([{ x: cell.x, y: cell.y, variant }]);
                this.inventory?.removeItem?.(variant);
            },
            redo: () => {
                this.removeCells([{ x: cell.x, y: cell.y }], { toInventory: true });
            }
        });
    }

    _store(object) {
        const inventory = this.inventory;
        if (inventory?.storeMapObject) return inventory.storeMapObject(object) === true;
        return false;
    }

    // ── Neighbour upkeep ─────────────────────────────────────────────────────

    _afterMutation(touchedKeys) {
        if (!touchedKeys || touchedKeys.size === 0) return;
        this.refreshNeighbours(touchedKeys);
    }

    refreshNeighbours(touchedKeys) {
        for (const key of touchedKeys) {
            const [x, y] = key.split(',').map(Number);
            for (const { dx, dy } of FenceBuilder.NEIGHBOURS) {
                const cell = this._cell(x + dx, y + dy);
                if (!cell) continue;
                for (const entry of cell.objects ?? []) {
                    entry.refreshConnectionSprite?.();
                }
            }
        }
    }

    dispose() {
        this.gameMap = null;
    }
}
