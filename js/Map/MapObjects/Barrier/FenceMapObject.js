// FenceMapObject — auto-connects to adjacent FENCE/GATE tiles.
// Sprite frame is selected by a 4-bit cardinal-direction bitmask (0–15):
//   bit 0 = N, bit 1 = E, bit 2 = S, bit 3 = W
// Variation row is a deterministic hash of the tile's grid position,
// giving each fence tile a stable visual style without storing extra data.

class FenceMapObject extends MapObject {
    static COMPATIBLE_TYPES = ['FENCE', 'GATE'];

    static DIRECTIONS = [
        { dx:  0, dy: -1, bit: 1 },  // N
        { dx:  1, dy:  0, bit: 2 },  // E
        { dx:  0, dy:  1, bit: 4 },  // S
        { dx: -1, dy:  0, bit: 8 },  // W
    ];

    getBaseCssClass() { return 'fence'; }

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

    // ── Connection mask ───────────────────────────────────────────────────────

    // Scans the 4 cardinal grid cells and returns a 4-bit connection mask.
    _computeConnectionMask() {
        const gs = this.gameMap?.gridSystem;
        if (!gs) return 0;

        const { x: gx, y: gy } = this._gridPos();
        let mask = 0;

        for (const { dx, dy, bit } of FenceMapObject.DIRECTIONS) {
            const cell = gs.grid[gx + dx]?.[gy + dy];
            if (!cell) continue;
            const connected = [...cell.objects].some(o =>
                o !== this &&
                o.active !== false &&
                FenceMapObject.COMPATIBLE_TYPES.includes(o.type)
            );
            if (connected) mask |= bit;
        }

        return mask;
    }

    // ── Variation row ─────────────────────────────────────────────────────────

    // Deterministic row index based on tile position so every fence in a line
    // gets a stable, varied appearance without storing per-object data.
    _computeVariationRow() {
        const { x, y } = this._gridPos();
        const n = this.getConfig('numVariations', 1);
        return Math.abs(x * 31 + y * 37) % n;
    }

    // ── Sprite frame ──────────────────────────────────────────────────────────

    // Translates a raw 4-bit connection mask (0–15) to a sprite column.
    // If the type config defines a `maskMap` array (length 16), that array is
    // used as a lookup table — mask index → sprite column.  This lets a fence
    // sheet with fewer than 16 frames share columns for visually identical
    // states (e.g. "N connections invisible" halves the required frame count).
    // Fences without a maskMap use the mask value directly as the column index.
    _resolveFrame(mask) {
        const maskMap = this.getConfig('maskMap', null);
        if (Array.isArray(maskMap) && maskMap.length === 16) {
            return maskMap[mask] ?? mask;
        }
        return mask;
    }

    refreshConnectionSprite() {
        const rawMask = this._computeConnectionMask();
        const col = this._resolveFrame(rawMask);
        const row = this._computeVariationRow();

        // Debug: show computed connections on element
        const dirs = [];
        if (rawMask & 1) dirs.push('N');
        if (rawMask & 2) dirs.push('E');
        if (rawMask & 4) dirs.push('S');
        if (rawMask & 8) dirs.push('W');
        const label = dirs.length ? dirs.join('') : 'none';
        const { x: gx, y: gy } = this._gridPos();
        if (this.element) this.element.dataset.connections = `${label} mask=${rawMask} col=${col} grid=(${gx},${gy})`;

        const frameSize = this.getVisualFrameSize() ?? {};
        const frameW = frameSize.width  ?? this.getVisualFrameWidth() ?? 32;
        const frameH = frameSize.height ?? this.size.height;
        const scale  = this.getVisualScale?.() ?? 1;

        const bgPos = `${-(col * frameW * scale)}px ${-(row * frameH * scale)}px`;

        if (this.renderState) {
            this.renderState.bgPosition = bgPos;
            this.renderState.dirty = true;
        }
        // Write directly to sprite element too so the frame is correct on first
        // paint (renderState is flushed asynchronously by MapRenderer).
        const sprite = this.getSpriteElement?.();
        if (sprite) sprite.style.backgroundPosition = bgPos;
    }

    // ── Neighbor notification ─────────────────────────────────────────────────

    // Tells adjacent fence-compatible objects to recompute their own sprite.
    // Called after this tile is rendered (i.e. after it's in the grid).
    _notifyNeighbors() {
        const gs = this.gameMap?.gridSystem;
        if (!gs) return;

        const { x: gx, y: gy } = this._gridPos();

        for (const { dx, dy } of FenceMapObject.DIRECTIONS) {
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
        // At this point `this` is already registered in the grid (GameMap.add
        // calls gridSystem.addObject before render), so connection detection
        // and neighbor notification are accurate.
        this.refreshConnectionSprite();
        this._notifyNeighbors();
        return element;
    }

    tickUpdate(_delta) {
        // Fences are purely static — no per-tick logic needed.
    }
}
