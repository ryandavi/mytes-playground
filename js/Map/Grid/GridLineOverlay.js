/**
 * The tile grid drawn over the map — shared by Build mode's "Show grid" and
 * the debug overlay's own grid flag, so there is exactly one grid on screen
 * no matter which of them (or both) asked for it.
 *
 * Drawn on a real canvas rather than a CSS repeating-gradient: a gradient is
 * resampled as a raster image under the camera's CSS zoom, which moires badly
 * at non-integer scales. Full-length strokes (one pass per grid line, not a
 * strokeRect per cell) avoid doubling up alpha on shared cell edges too.
 *
 * Multiple callers can want the grid visible at once with different styling
 * (debug's faint white vs. build's own color) — `show`/`hide` take a caller id
 * so the last one to (re)show wins the style, and the canvas only disappears
 * once every caller has released it.
 */
class GridLineOverlay {
    constructor(gameMap) {
        this.gameMap = gameMap;
        this.canvas = null;
        this.requests = new Map(); // id -> { color, lineWidth }
    }

    get cellSize() {
        return this.gameMap?.gridSystem?.config?.cellSize || 32;
    }

    show(id, { color = 'rgba(255, 255, 255, 0.3)', lineWidth = 1 } = {}) {
        this.requests.delete(id);
        this.requests.set(id, { color, lineWidth });
        this.render();
    }

    hide(id) {
        if (!this.requests.has(id)) return;
        this.requests.delete(id);
        if (this.requests.size === 0) {
            this.canvas?.remove();
            this.canvas = null;
        } else {
            this.render();
        }
    }

    // Most recently shown/re-shown request wins — Map preserves insertion
    // order, and show() re-inserts on repeat calls to keep itself "latest".
    get activeStyle() {
        let last = null;
        for (const style of this.requests.values()) last = style;
        return last;
    }

    // Mounted on the `.canvas` root itself, at inset 0 (its own top-left is the
    // gameplay origin, same as the old CSS grid's `inset: 0` on `.canvas::after`)
    // — not on one of the `.layer` children, which stack below floor/objects
    // and would bury the grid under opaque floor art. z-index matches that old
    // rule's `--z-overlay` (1200) so the grid still sits above everything,
    // debug's own annotations (z-index 1000) included.
    ensureCanvas() {
        const root = this.gameMap?.parent?.canvas;
        if (!root) return null;
        if (this.canvas?.isConnected) return this.canvas;
        const canvas = document.createElement('canvas');
        canvas.className = 'grid-line-overlay ignore';
        canvas.setAttribute('aria-hidden', 'true');
        Object.assign(canvas.style, {
            position: 'absolute', left: '0', top: '0', zIndex: '1200', pointerEvents: 'none'
        });
        root.appendChild(canvas);
        this.canvas = canvas;
        return canvas;
    }

    render() {
        const style = this.activeStyle;
        if (!style) return;
        const canvas = this.ensureCanvas();
        if (!canvas) return;

        const cell = this.cellSize;
        const width = this.gameMap.gridSystem?.gridWidth || 0;
        const height = this.gameMap.gridSystem?.gridHeight || 0;
        const pxWidth = width * cell;
        const pxHeight = height * cell;
        if (canvas.width !== pxWidth || canvas.height !== pxHeight) {
            canvas.width = pxWidth;
            canvas.height = pxHeight;
            canvas.style.width = `${pxWidth}px`;
            canvas.style.height = `${pxHeight}px`;
        }

        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, pxWidth, pxHeight);
        ctx.strokeStyle = style.color;
        ctx.lineWidth = style.lineWidth;

        ctx.beginPath();
        for (let x = 0; x <= width; x++) {
            const px = x * cell + 0.5;
            ctx.moveTo(px, 0);
            ctx.lineTo(px, pxHeight);
        }
        for (let y = 0; y <= height; y++) {
            const py = y * cell + 0.5;
            ctx.moveTo(0, py);
            ctx.lineTo(pxWidth, py);
        }
        ctx.stroke();
    }

    dispose() {
        this.canvas?.remove();
        this.canvas = null;
        this.requests.clear();
    }
}
