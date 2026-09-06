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
 *
 * Every room draws only its own edge, inset a few pixels into its own cells
 * rather than sitting exactly on the shared cell boundary — the boundary is
 * also where the neighbouring room's edge sits, and two independent colours
 * stroking the same pixels is what used to make corners where three or four
 * rooms meet look misshapen (and, mid-stroke, briefly black). Insetting means
 * a shared wall shows two thin lines with daylight between them instead of
 * one contested one, and it needs no special case for "shared" vs. "outer" —
 * every edge a cell has facing a different owner (a neighbour, or nothing
 * built yet) is drawn the same way, in that room's own colour.
 *
 * Traced as one closed contour per room, not drawn edge-by-edge: earlier
 * versions resolved and stroked each boundary edge independently, which is
 * fine for a plain rectangle but breaks at any corner or T-junction — two
 * edges meeting at a point each keep their own uncropped endpoint instead of
 * sharing one, so the corner either falls short or runs past it, and a
 * concave notch throws in a short perpendicular whisker where its two sides
 * don't quite meet. `traceLoops` walks the cell boundary into an ordered ring
 * of unit edges first (so it is a graph-connected path, not a pile of
 * independent segments), then `insetLoop` merges consecutive same-direction
 * edges into straight runs, resolves each run's wall-centred position once,
 * and places each polygon vertex at the intersection of its two neighbouring
 * runs' lines — the rectilinear-offset equivalent of mitering a corner. Every
 * vertex is shared by construction, so nothing can overshoot or dangle.
 *
 * Mounted in GameMap#frontLayer, not `layers.background` — that sits below
 * furniture and wall art, which buried this outline exactly when it mattered
 * most (rooms with things in them). The front layer draws on top of
 * everything, and shares its coordinate space, so cell math here needs no
 * offset beyond the raw `x * cellSize`.
 */
class BuildFootprintOverlay {
    // How far each edge draws inward from the true cell boundary. Small
    // enough to still read as "this cell's border", large enough that two
    // rooms sharing a wall never touch, whatever the line width.
    static INSET = 3;

    constructor(gameMap) {
        this.gameMap = gameMap;
        this.canvas = null;
        this.labelContainer = null;
        this.labelButtons = new Map(); // roomId -> button
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
            this.labelContainer?.remove();
            this.labelContainer = null;
            this.labelButtons.clear();
            return;
        }
        this.render();
    }

    ensureCanvas() {
        const layer = this.gameMap?.frontLayer;
        if (!layer) return null;
        if (!this.canvas?.isConnected) {
            const canvas = document.createElement('canvas');
            canvas.className = 'build-footprint-overlay ignore';
            canvas.setAttribute('aria-hidden', 'true');
            Object.assign(canvas.style, {
                position: 'absolute', left: '0', top: '0', pointerEvents: 'none'
            });
            layer.appendChild(canvas);
            this.canvas = canvas;
        }
        if (!this.labelContainer?.isConnected) {
            const container = document.createElement('div');
            container.className = 'build-room-labels ignore';
            container.setAttribute('aria-hidden', 'true');
            Object.assign(container.style, {
                position: 'absolute', left: '0', top: '0', width: '100%', height: '100%',
                pointerEvents: 'none'
            });
            layer.appendChild(container);
            this.labelContainer = container;
            this.labelButtons.clear();
        }
        return this.canvas;
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
        const ownerGrid = new Array(width * height).fill(null);
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
            const id = grid.ownerOfCell(x, y);
            if (id === null) continue;
            ownerGrid[y * width + x] = id;
            if (!owners.has(id)) owners.set(id, []);
            owners.get(id).push([x, y]);
        }
        const ownerAt = (x, y) => (x < 0 || y < 0 || x >= width || y >= height) ? null : ownerGrid[y * width + x];

        // A wall record's cell is a full cellSize×cellSize footprint, and the
        // wall itself — whatever its rendered thickness — sits centred inside
        // it (see WallGeometry: a piece's baseline is `(row + 0.5) * cellSize
        // + thickness / 2`, i.e. thickness straddles the row's own centre).
        // So the wall's true centreline, regardless of thickness, is simply
        // the centre of whichever cell holds it — not the cell's edge, which
        // is what this drew before and is why it hugged the outside of the
        // wall instead of running through it.
        const walls = this.gameMap?.buildDocument?.level?.()?.walls;
        const hasWall = (x, y) => (x < 0 || y < 0 || x >= width || y >= height)
            ? false : !!walls?.get?.(BuildKeys.cell(x, y));

        const inset = BuildFootprintOverlay.INSET;
        context.lineWidth = 2;
        context.lineJoin = 'miter';
        for (const [id, cells] of owners) {
            context.strokeStyle = RoomPanel.roomColour(id, 0.85);
            const ownedSet = new Set(cells.map(([x, y]) => `${x},${y}`));
            const loops = BuildFootprintOverlay.traceLoops(ownedSet);
            context.beginPath();
            for (const loop of loops) {
                const polygon = BuildFootprintOverlay.insetLoop(loop, cell, inset, hasWall);
                if (polygon.length < 2) continue;
                context.moveTo(polygon[0][0], polygon[0][1]);
                for (let i = 1; i < polygon.length; i++) context.lineTo(polygon[i][0], polygon[i][1]);
                context.closePath();
            }
            context.stroke();
        }

        this.renderLabels(owners, cell);

        this.renders++;
        return owners.size;
    }

    // Walks a room's owned cells into one or more closed rings of unit
    // boundary edges (grid-vertex coordinates, not yet inset or wall-aware).
    // Standard raster-to-polygon boundary tracing: every owned cell
    // contributes one directed unit edge per side that faces a non-owned
    // neighbour, oriented so each edge's end vertex is exactly one other
    // edge's start vertex — following that chain from any edge always
    // returns to its own start, which is what turns "a pile of independent
    // edges" into "a path that closes." Multiple loops (a room in two
    // pieces, or one with a hole) just means more than one ring comes out.
    static traceLoops(ownedSet) {
        const isOwned = (x, y) => ownedSet.has(`${x},${y}`);
        const edges = [];
        for (const key of ownedSet) {
            const [x, y] = key.split(',').map(Number);
            if (!isOwned(x - 1, y)) edges.push({ from: [x, y + 1], to: [x, y], side: 'L', cx: x, cy: y });
            if (!isOwned(x + 1, y)) edges.push({ from: [x + 1, y], to: [x + 1, y + 1], side: 'R', cx: x, cy: y });
            if (!isOwned(x, y - 1)) edges.push({ from: [x, y], to: [x + 1, y], side: 'T', cx: x, cy: y });
            if (!isOwned(x, y + 1)) edges.push({ from: [x + 1, y + 1], to: [x, y + 1], side: 'B', cx: x, cy: y });
        }
        const byStart = new Map();
        for (const edge of edges) {
            const k = `${edge.from[0]},${edge.from[1]}`;
            if (!byStart.has(k)) byStart.set(k, []);
            byStart.get(k).push(edge);
        }
        const remaining = new Set(edges);
        const loops = [];
        for (const start of edges) {
            if (!remaining.has(start)) continue;
            const loop = [];
            let current = start;
            while (current) {
                loop.push(current);
                remaining.delete(current);
                if (current.to[0] === start.from[0] && current.to[1] === start.from[1]) break;
                const candidates = byStart.get(`${current.to[0]},${current.to[1]}`) || [];
                current = candidates.find(edge => remaining.has(edge)) || null;
            }
            loops.push(loop);
        }
        return loops;
    }

    // Merges a traced loop's unit edges into straight runs, resolves each
    // run's wall-centred, inward-inset line once (see the class docs — a
    // wall's true centreline is the centre of whichever cell holds it, found
    // by checking every cell along the run rather than each one alone so a
    // T-junction's uneven wall-record coverage can't split one straight wall
    // into two different answers), then places one polygon vertex per run at
    // the intersection of it and the run after it. Consecutive runs in a
    // rectilinear ring always alternate horizontal/vertical, so that
    // intersection is just combining each run's own fixed coordinate — the
    // rectilinear-offset equivalent of mitering, and why every corner meets
    // at exactly one shared point instead of two independent endpoints.
    static insetLoop(loop, cell, inset, hasWall) {
        if (!loop.length) return [];
        const runs = [];
        for (const edge of loop) {
            const last = runs[runs.length - 1];
            if (last && last.side === edge.side) {
                last.cells.push([edge.cx, edge.cy]);
            } else {
                runs.push({ side: edge.side, cells: [[edge.cx, edge.cy]] });
            }
        }
        if (runs.length > 1 && runs[0].side === runs[runs.length - 1].side) {
            const last = runs.pop();
            runs[0].cells = [...last.cells, ...runs[0].cells];
        }

        for (const run of runs) {
            const horizontal = run.side === 'T' || run.side === 'B';
            const sign = (run.side === 'T' || run.side === 'L') ? 1 : -1;
            if (horizontal) {
                const y = run.cells[0][1];
                const neighborY = run.side === 'T' ? y - 1 : y + 1;
                const xs = run.cells.map(c => c[0]);
                const minX = Math.min(...xs), maxX = Math.max(...xs);
                const anyWallAt = (coordY) => {
                    for (let x = minX; x <= maxX; x++) if (hasWall(x, coordY)) return true;
                    return false;
                };
                const wallY = anyWallAt(y) ? y : anyWallAt(neighborY) ? neighborY : null;
                const base = wallY !== null ? (wallY + 0.5) * cell : (run.side === 'T' ? y : y + 1) * cell;
                run.axis = 'y';
                run.value = base + sign * inset;
            } else {
                const x = run.cells[0][0];
                const neighborX = run.side === 'L' ? x - 1 : x + 1;
                const ys = run.cells.map(c => c[1]);
                const minY = Math.min(...ys), maxY = Math.max(...ys);
                const anyWallAt = (coordX) => {
                    for (let y = minY; y <= maxY; y++) if (hasWall(coordX, y)) return true;
                    return false;
                };
                const wallX = anyWallAt(x) ? x : anyWallAt(neighborX) ? neighborX : null;
                const base = wallX !== null ? (wallX + 0.5) * cell : (run.side === 'L' ? x : x + 1) * cell;
                run.axis = 'x';
                run.value = base + sign * inset;
            }
        }

        const polygon = [];
        for (let i = 0; i < runs.length; i++) {
            const current = runs[i];
            const next = runs[(i + 1) % runs.length];
            polygon.push(current.axis === 'y' ? [next.value, current.value] : [current.value, next.value]);
        }
        return polygon;
    }

    // One clickable name per room, centred on the cells it owns — opens the
    // same Room panel the Build Inspector's Navigator entry does.
    renderLabels(owners, cell) {
        if (!this.labelContainer) return;
        const level = this.gameMap?.buildDocument?.level?.();
        const seen = new Set();
        for (const [id, cells] of owners) {
            seen.add(id);
            let button = this.labelButtons.get(id);
            if (!button) {
                button = document.createElement('button');
                button.type = 'button';
                button.className = 'build-room-label';
                button.addEventListener('click', event => {
                    event.stopPropagation();
                    this.openRoom(id);
                });
                this.labelContainer.appendChild(button);
                this.labelButtons.set(id, button);
            }
            const room = level?.rooms?.get?.(id);
            button.textContent = room?.displayName || id;
            let sumX = 0, sumY = 0;
            for (const [x, y] of cells) { sumX += x; sumY += y; }
            const centreX = (sumX / cells.length + 0.5) * cell;
            const centreY = (sumY / cells.length + 0.5) * cell;
            button.style.left = `${centreX}px`;
            button.style.top = `${centreY}px`;
        }
        for (const [id, button] of this.labelButtons) {
            if (!seen.has(id)) {
                button.remove();
                this.labelButtons.delete(id);
            }
        }
    }

    openRoom(id) {
        const ui = this.gameMap?.parent?.ui;
        const inspector = ui?.buildInspector;
        if (!inspector) return;
        inspector.open?.();
        inspector.select?.('room', id);
    }

    dispose() {
        this.canvas?.remove();
        this.canvas = null;
        this.labelContainer?.remove();
        this.labelContainer = null;
        this.labelButtons.clear();
        this.gameMap = null;
    }
}
