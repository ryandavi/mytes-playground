/**
 * Outlines the cells each room plan actually owns, while building.
 *
 * A floor deliberately stops on the CENTRELINE of its boundary cell, so what
 * you see painted is half a tile short of the cells the room owns on every open
 * edge. That is the right way for the floor to render — it is where the floor
 * ends up once the perimeter is walled — but it leaves the one question you ask
 * constantly while adjusting a room tile by tile ("is this cell mine?") with no
 * answer on screen. This draws the answer: the owned footprint, per plan, on
 * the grid, so paint edges stop being something you infer from a half-tile.
 *
 * Cell ownership, not blocks: the question is which cells belong to the room,
 * and `grid.ownerOfCell` is the majority answer the rest of the build tools use.
 */
class BuildFootprintOverlay {
    static COLOURS = Object.freeze([
        'rgba(66, 133, 244, 0.85)', 'rgba(219, 68, 55, 0.85)', 'rgba(15, 157, 88, 0.85)',
        'rgba(244, 160, 0, 0.85)', 'rgba(171, 71, 188, 0.85)', 'rgba(0, 172, 193, 0.85)'
    ]);

    constructor(gameMap) {
        this.gameMap = gameMap;
        this.canvas = null;
        this.visible = false;
        this.renders = 0;
    }

    get cellSize() {
        return this.gameMap?.gridSystem?.config?.cellSize || 32;
    }

    setVisible(visible) {
        this.visible = visible === true;
        if (!this.visible) {
            this.canvas?.remove();
            this.canvas = null;
            return;
        }
        this.render();
    }

    // The background layer is already the gameplay rect — the render padding
    // sits outside it — so a canvas at inset 0 here is cell-aligned with no
    // offset arithmetic, the same contract the floor chunks rely on.
    ensureCanvas() {
        const layer = this.gameMap?.layers?.background;
        if (!layer) return null;
        if (this.canvas?.isConnected) return this.canvas;
        const canvas = document.createElement('canvas');
        canvas.className = 'build-footprint-overlay ignore';
        canvas.setAttribute('aria-hidden', 'true');
        Object.assign(canvas.style, {
            position: 'absolute', left: '0', top: '0', pointerEvents: 'none'
        });
        layer.appendChild(canvas);
        this.canvas = canvas;
        return canvas;
    }

    render() {
        if (!this.visible) return 0;
        const grid = this.gameMap?.buildTransaction?.cache?.grid;
        const canvas = grid ? this.ensureCanvas() : null;
        if (!canvas) return 0;
        const cell = this.cellSize;
        const width = this.gameMap.gridSystem?.gridWidth || 0;
        const height = this.gameMap.gridSystem?.gridHeight || 0;
        if (canvas.width !== width * cell || canvas.height !== height * cell) {
            canvas.width = width * cell;
            canvas.height = height * cell;
            canvas.style.width = `${width * cell}px`;
            canvas.style.height = `${height * cell}px`;
        }
        const context = canvas.getContext('2d');
        context.clearRect(0, 0, canvas.width, canvas.height);

        const owners = new Map();
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
            const id = grid.ownerOfCell(x, y);
            if (id === null) continue;
            if (!owners.has(id)) owners.set(id, []);
            owners.get(id).push([x, y]);
        }
        // Only the edges of each footprint are stroked. Outlining every cell
        // would redraw the grid in six colours and say nothing extra: the seam
        // between two rooms is the whole point, and interior lines bury it.
        const index = new Map([...owners.keys()].sort().map((id, order) => [id, order]));
        context.lineWidth = 2;
        context.lineCap = 'square';
        for (const [id, cells] of owners) {
            const owned = new Set(cells.map(([x, y]) => `${x},${y}`));
            context.strokeStyle = BuildFootprintOverlay.COLOURS[
                index.get(id) % BuildFootprintOverlay.COLOURS.length
            ];
            context.beginPath();
            for (const [x, y] of cells) {
                const left = x * cell;
                const top = y * cell;
                if (!owned.has(`${x - 1},${y}`)) { context.moveTo(left, top); context.lineTo(left, top + cell); }
                if (!owned.has(`${x + 1},${y}`)) { context.moveTo(left + cell, top); context.lineTo(left + cell, top + cell); }
                if (!owned.has(`${x},${y - 1}`)) { context.moveTo(left, top); context.lineTo(left + cell, top); }
                if (!owned.has(`${x},${y + 1}`)) { context.moveTo(left, top + cell); context.lineTo(left + cell, top + cell); }
            }
            context.stroke();
        }
        this.renders++;
        return owners.size;
    }

    dispose() {
        this.canvas?.remove();
        this.canvas = null;
        this.gameMap = null;
    }
}
