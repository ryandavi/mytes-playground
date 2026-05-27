// GateMapObject — an openable/closeable section of fence.
// Inherits open/close animation state-machine from ToggleableDirectionalAnimatedMapObject.
// Notifies adjacent FenceMapObjects on placement so their connection sprites update.
// The gate itself does not use the bitmask frame selection — its sprite is driven
// by the open/close animation defined in types.json.

class GateMapObject extends ConnectableToggleableDirectionalAnimatedMapObject {
    static FENCE_DIRECTIONS = [
        { dx:  0, dy: -1 },  // N
        { dx:  1, dy:  0 },  // E
        { dx:  0, dy:  1 },  // S
        { dx: -1, dy:  0 },  // W
    ];

    getBaseCssClass() { return 'gate'; }

    // ── Grid helpers ──────────────────────────────────────────────────────────

    _cellSize() {
        return this.gameMap?.gridSystem?.config?.cellSize ?? 32;
    }

    _gridPos() {
        const cs = this._cellSize();
        const offsetX = this.collider?.offsetX || 0;
        const offsetY = this.collider?.offsetY || 0;
        return {
            x: Math.floor((this.posX + offsetX) / cs),
            y: Math.floor((this.posY + offsetY) / cs),
        };
    }

    // ── Neighbor notification ─────────────────────────────────────────────────

    // After this gate enters the grid, adjacent fences need to see it and
    // update their connection sprites to include this tile.
    _notifyFenceNeighbors() {
        const gs = this.gameMap?.gridSystem;
        if (!gs) return;

        const { x: gx, y: gy } = this._gridPos();

        for (const { dx, dy } of GateMapObject.FENCE_DIRECTIONS) {
            const cell = gs.grid[gx + dx]?.[gy + dy];
            if (!cell) continue;
            for (const obj of cell.objects) {
                if (obj !== this && typeof obj.refreshConnectionSprite === 'function') {
                    obj.refreshConnectionSprite();
                }
            }
        }
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    render(container, parent) {
        const element = super.render(container, parent);
        // At this point the gate is in the grid — tell adjacent fences to update.
        this._notifyFenceNeighbors();
        return element;
    }

    // ── Interaction ───────────────────────────────────────────────────────────

    press(interactor) {
        if (this.isAnimating) return false;

        const myte = this.activeMyte;
        const action = () => this.toggle({ triggeredBy: 'manual', actor: myte });

        if (!myte?.queue) {
            action();
            return true;
        }

        if (this.isInInteractionRange(myte, this.getInteractionRadius())) {
            action();
            return true;
        }

        myte.queue.add('go_to_object', {
            target: this,
            onComplete: action,
            queueVerb: this.isOpen ? 'Close Gate' : 'Open Gate',
            userInitiated: true,
        });
        return true;
    }
}
