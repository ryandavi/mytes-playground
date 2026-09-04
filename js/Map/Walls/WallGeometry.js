class WallGeometry {
    static MASK_NORTH = 1;
    static MASK_EAST = 2;
    static MASK_SOUTH = 4;
    static MASK_WEST = 8;
    static MASK_HORIZONTAL = WallGeometry.MASK_EAST | WallGeometry.MASK_WEST;
    static MASK_VERTICAL = WallGeometry.MASK_NORTH | WallGeometry.MASK_SOUTH;

    static DIRECTIONS = Object.freeze([
        Object.freeze({ name: 'north', dx: 0, dy: -1, bit: WallGeometry.MASK_NORTH }),
        Object.freeze({ name: 'east', dx: 1, dy: 0, bit: WallGeometry.MASK_EAST }),
        Object.freeze({ name: 'south', dx: 0, dy: 1, bit: WallGeometry.MASK_SOUTH }),
        Object.freeze({ name: 'west', dx: -1, dy: 0, bit: WallGeometry.MASK_WEST })
    ]);

    static compute(walls, options = {}) {
        if (Number.isFinite(options)) options = { revision: options };
        const cells = WallGeometry.normalizeWalls(walls);
        const masks = new Map();
        for (const [key, cell] of cells) masks.set(key, WallGeometry.maskFor(cell, cells));
        const runs = WallGeometry.buildRuns(cells, masks);
        return Object.freeze({
            cells,
            masks,
            thresholds: WallGeometry.findThresholds(cells, masks),
            runs,
            pieces: WallGeometry.buildPieces(cells, masks, options),
            paintSpans: WallGeometry.buildPaintSpans(cells, masks, options),
            revision: Number(options.revision) || 0
        });
    }

    static normalizeWalls(walls) {
        const cells = new Map();
        const entries = walls instanceof Map ? walls.entries() : Object.entries(walls || {});
        for (const [key, record] of entries) {
            const parsed = record && Number.isInteger(record.x) && Number.isInteger(record.y)
                ? { x: record.x, y: record.y }
                : BuildKeys.parseCell(key);
            cells.set(BuildKeys.cell(parsed.x, parsed.y), Object.freeze({ ...record, ...parsed }));
        }
        return cells;
    }

    static maskFor(cell, cells) {
        let mask = 0;
        for (const direction of WallGeometry.DIRECTIONS) {
            const neighbour = cells.get(BuildKeys.cell(cell.x + direction.dx, cell.y + direction.dy));
            if (neighbour && WallGeometry.connects(cell, neighbour)) mask |= direction.bit;
        }
        return mask;
    }

    static connects(a, b) {
        return (a.connectGroup ?? 'wall') === (b.connectGroup ?? 'wall');
    }

    /**
     * The fences a wall cell puts between its own four blocks.
     *
     * A cell fences the axis it runs along, so a floor either side stops on the
     * centreline instead of leaking through. An END CAP — a lone post, or the
     * last cell of a run, with at most one connection — fences BOTH axes: the
     * wall stops there, and without the second fence a floor flows into the cap
     * cell lengthwise from the room beyond the end, fills it, and shows past
     * the rounded art as a part-tile hanging off the end of the wall.
     */
    static fencesForMask(mask) {
        const cap = WallGeometry.connectionCount(mask) <= 1;
        return Object.freeze({
            horizontal: cap || (mask & WallGeometry.MASK_HORIZONTAL) !== 0,
            vertical: cap || (mask & WallGeometry.MASK_VERTICAL) !== 0
        });
    }

    static buildRuns(cells, masks) {
        const runs = [];
        const axes = [
            { axis: 'horizontal', backward: WallGeometry.MASK_WEST, forward: WallGeometry.MASK_EAST, dx: 1, dy: 0 },
            { axis: 'vertical', backward: WallGeometry.MASK_NORTH, forward: WallGeometry.MASK_SOUTH, dx: 0, dy: 1 }
        ];
        const sorted = [...cells.values()].sort((a, b) => a.y - b.y || a.x - b.x);
        for (const config of axes) for (const cell of sorted) {
            const mask = masks.get(BuildKeys.cell(cell.x, cell.y)) || 0;
            if (!(mask & config.forward) || (mask & config.backward)) continue;
            const runCells = [BuildKeys.cell(cell.x, cell.y)];
            let cursor = cell;
            while ((masks.get(BuildKeys.cell(cursor.x, cursor.y)) || 0) & config.forward) {
                cursor = cells.get(BuildKeys.cell(cursor.x + config.dx, cursor.y + config.dy));
                if (!cursor) break;
                runCells.push(BuildKeys.cell(cursor.x, cursor.y));
            }
            runs.push(Object.freeze({
                id: `${config.axis}:${runCells[0]}:${runCells[runCells.length - 1]}`,
                axis: config.axis,
                cells: Object.freeze(runCells)
            }));
        }
        const connected = new Set(runs.flatMap(run => run.cells));
        for (const cell of sorted) {
            const key = BuildKeys.cell(cell.x, cell.y);
            if (!connected.has(key) && (masks.get(key) || 0) === 0) {
                runs.push(Object.freeze({ id: `point:${key}`, axis: 'point', cells: Object.freeze([key]) }));
            }
        }
        return Object.freeze(runs);
    }

    static buildPieces(cells, masks, options) {
        const cellSize = Number(options.cellSize) || 32;
        const sorted = [...cells.values()].sort((a, b) => a.y - b.y || a.x - b.x);
        const pieces = [];
        for (let index = 0; index < sorted.length; index++) {
            const first = sorted[index];
            const pieceCells = [BuildKeys.cell(first.x, first.y)];
            while (WallGeometry.canMergePiece(sorted[index], sorted[index + 1], masks)) {
                const next = sorted[++index];
                pieceCells.push(BuildKeys.cell(next.x, next.y));
            }
            const construction = WallGeometry.constructionFor(first, options);
            const thickness = Number(construction.thickness) || cellSize;
            pieces.push(Object.freeze({
                id: `wall-${first.x}-${first.y}-${pieceCells.length}`,
                x: first.x,
                y: first.y,
                baseline: ((first.y + 0.5) * cellSize) + (thickness / 2),
                height: Number(construction.height) || (Number(first.heightCells) || 1) * cellSize,
                constructionId: first.constructionId,
                cells: Object.freeze(pieceCells)
            }));
        }
        return Object.freeze(pieces);
    }

    static canMergePiece(left, right, masks) {
        if (!left || !right || right.y !== left.y || right.x !== left.x + 1) return false;
        if (left.constructionId !== right.constructionId || left.heightCells !== right.heightCells) return false;
        const leftMask = masks.get(BuildKeys.cell(left.x, left.y)) || 0;
        const rightMask = masks.get(BuildKeys.cell(right.x, right.y)) || 0;
        return (leftMask & WallGeometry.MASK_EAST) !== 0 && (rightMask & WallGeometry.MASK_WEST) !== 0;
    }

    static buildPaintSpans(cells, masks, options) {
        return new Map([...cells].map(([key, cell]) => {
            const mask = masks.get(key) || 0;
            const construction = WallGeometry.constructionFor(cell, options);
            return [key, Object.freeze(WallGeometry.paintSpansForCell(cell, mask, construction, options))];
        }));
    }

    static paintSpansForCell(cell, mask, construction = {}, options = {}) {
        const cellSize = Number(construction.cellSize) || Number(options.cellSize) || 32;
        const thickness = Number(construction.thickness) || cellSize;
        const inset = (cellSize - thickness) / 2;
        const middle = cellSize / 2;
        const east = (mask & WallGeometry.MASK_EAST) !== 0;
        const west = (mask & WallGeometry.MASK_WEST) !== 0;
        const vertical = (mask & WallGeometry.MASK_VERTICAL) !== 0;
        const band = (from, to, half) => WallGeometry.span(cell, 'horizontal-band', half, from, to);
        const post = (from, to, kind) => WallGeometry.span(cell, kind, null, from, to);
        if (!east && !west) {
            if (mask === 0) return [band(0, middle, 0), band(middle, cellSize, 1)];
            return [post(inset, middle, 'post-west'), post(middle, cellSize - inset, 'post-east')];
        }
        if (!vertical || (east !== west && WallGeometry.inheritsVerticalFace(mask))) {
            return [band(0, middle, 0), band(middle, cellSize, 1)];
        }
        const spans = [];
        if (west && inset > 0) spans.push(band(0, inset, 0));
        spans.push(post(inset, middle, 'post-west'), post(middle, cellSize - inset, 'post-east'));
        if (east && inset > 0) spans.push(band(cellSize - inset, cellSize, 1));
        return spans.filter(span => span.to > span.from);
    }

    static span(cell, kind, half, from, to) {
        const candidates = kind === 'horizontal-band'
            ? [BuildKeys.atom(cell.x, cell.y, 'south', half), BuildKeys.atom(cell.x, cell.y, 'north', half)]
            : kind === 'post-west'
                ? [BuildKeys.atom(cell.x, cell.y, 'west', 1), BuildKeys.atom(cell.x, cell.y, 'west', 0)]
                : [BuildKeys.atom(cell.x, cell.y, 'east', 1), BuildKeys.atom(cell.x, cell.y, 'east', 0)];
        return Object.freeze({ kind, half, from, to, candidates: Object.freeze(candidates) });
    }

    static constructionFor(cell, options) {
        const source = options.constructions;
        return source?.get?.(cell.constructionId) || source?.[cell.constructionId] || options.defaultConstruction || {};
    }

    static inheritsVerticalFace(mask) {
        return ((mask & WallGeometry.MASK_NORTH) !== 0) !== ((mask & WallGeometry.MASK_SOUTH) !== 0);
    }

    static findThresholds(cells, masks) {
        const thresholds = new Set();
        if (cells.size === 0) return thresholds;
        const bounds = WallGeometry.bounds(cells);
        for (let y = bounds.minY; y <= bounds.maxY; y++) {
            for (let x = bounds.minX; x <= bounds.maxX; x++) {
                const key = BuildKeys.cell(x, y);
                if (cells.has(key)) continue;
                if (WallGeometry.isThresholdAxis(x, y, 'horizontal', cells, masks) ||
                    WallGeometry.isThresholdAxis(x, y, 'vertical', cells, masks)) thresholds.add(key);
            }
        }
        return thresholds;
    }

    static isThresholdAxis(x, y, axis, cells, masks) {
        const horizontal = axis === 'horizontal';
        const before = cells.get(BuildKeys.cell(x - (horizontal ? 1 : 0), y - (horizontal ? 0 : 1)));
        const after = cells.get(BuildKeys.cell(x + (horizontal ? 1 : 0), y + (horizontal ? 0 : 1)));
        if (!before || !after || !WallGeometry.connects(before, after)) return false;
        const beforeMask = masks.get(BuildKeys.cell(before.x, before.y)) || 0;
        const afterMask = masks.get(BuildKeys.cell(after.x, after.y)) || 0;
        const beforeOutward = horizontal ? WallGeometry.MASK_WEST : WallGeometry.MASK_NORTH;
        const afterOutward = horizontal ? WallGeometry.MASK_EAST : WallGeometry.MASK_SOUTH;
        return WallGeometry.pointsOutward(beforeMask, beforeOutward) &&
            WallGeometry.pointsOutward(afterMask, afterOutward);
    }

    static pointsOutward(mask, outwardBit) {
        return (mask & outwardBit) !== 0 || WallGeometry.connectionCount(mask) === 1;
    }

    static connectionCount(mask) {
        let count = 0;
        for (const direction of WallGeometry.DIRECTIONS) if ((mask & direction.bit) !== 0) count++;
        return count;
    }

    static bounds(cells) {
        const values = [...cells.values()];
        return values.reduce((bounds, cell) => ({
            minX: Math.min(bounds.minX, cell.x), maxX: Math.max(bounds.maxX, cell.x),
            minY: Math.min(bounds.minY, cell.y), maxY: Math.max(bounds.maxY, cell.y)
        }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
    }
}
