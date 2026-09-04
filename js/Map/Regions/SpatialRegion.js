// ─────────────────────────────────────────────────────────────────────────────
// SpatialRegion — one geometry primitive for every "area of the map" concept.
//
// Before this, three parallel representations existed: Zone (rect only, buffs),
// environment.rooms (rect + optional polygon, lighting only), and an ad-hoc
// terrain-tile proximity scan for water. Rooms would have been a fourth.
//
// A region owns GEOMETRY and an opaque `properties` payload. It owns no
// behaviour: what a region *means* lives in whichever system consumes its layer
// (Zone applies buffs, MapEnvironmentManager applies lighting). That separation
// is what keeps this from becoming a vague god-object.
// ─────────────────────────────────────────────────────────────────────────────
class SpatialRegion {
    /**
     * @param {object} data
     *   id         unique within its layer
     *   layer      'zone' | 'room' | 'trigger' | 'lighting-opening'
     *   shape      { kind: 'rect', bounds }
     *            | { kind: 'polygon', points, bounds? }
     *            | { kind: 'tilemask', cells, cellSize, bounds? }
     *   properties layer-specific payload, untouched by this class
     */
    constructor(data = {}) {
        this.id = data.id;
        this.layer = data.layer ?? 'zone';
        this.properties = data.properties ?? {};
        this.shape = SpatialRegion.normalizeShape(data.shape);
        this.bounds = this.shape.bounds;
        this.source = data.source ?? null;
    }

    static normalizeShape(shape) {
        if (!shape) return { kind: 'rect', bounds: { x: 0, y: 0, width: 0, height: 0 } };

        if (shape.kind === 'polygon') {
            const points = shape.points ?? [];
            return { kind: 'polygon', points, bounds: shape.bounds ?? SpatialRegion.boundsOfPoints(points) };
        }

        if (shape.kind === 'tilemask') {
            const cellSize = shape.cellSize ?? 32;
            // Store as a Set of packed cell keys so `contains` is O(1).
            const cells = shape.cells instanceof Set
                ? shape.cells
                : new Set((shape.cells ?? []).map(c => typeof c === 'string'
                    ? c
                    : (Array.isArray(c) ? `${c[0]},${c[1]}` : `${c.x},${c.y}`)));
            return {
                kind: 'tilemask',
                cells,
                cellSize,
                bounds: shape.bounds ?? SpatialRegion.boundsOfCells(cells, cellSize)
            };
        }

        return { kind: 'rect', bounds: shape.bounds ?? shape };
    }

    static boundsOfPoints(points) {
        if (!points?.length) return { x: 0, y: 0, width: 0, height: 0 };
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const p of points) {
            minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
            minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
        }
        return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    }

    static boundsOfCells(cells, cellSize) {
        if (!cells?.size) return { x: 0, y: 0, width: 0, height: 0 };
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const key of cells) {
            const [cx, cy] = key.split(',').map(Number);
            minX = Math.min(minX, cx); maxX = Math.max(maxX, cx);
            minY = Math.min(minY, cy); maxY = Math.max(maxY, cy);
        }
        return {
            x: minX * cellSize,
            y: minY * cellSize,
            width: (maxX - minX + 1) * cellSize,
            height: (maxY - minY + 1) * cellSize
        };
    }

    /**
     * Roughly how much ground this covers, in cells.
     *
     * Only ever used to rank overlapping regions against each other, which is
     * why a bounding-box estimate is good enough for rect and polygon: a region
     * walled off inside another is contained by both, and "the smaller one" is
     * the one the player means.
     */
    areaInCells(cellSize = this.shape.cellSize ?? 32) {
        if (this.shape.kind === 'tilemask') return this.shape.cells.size;
        const size = cellSize || 32;
        return (this.bounds.width * this.bounds.height) / (size * size);
    }

    // Bounds test first — cheap rejection before any polygon/tilemask work.
    boundsContain(x, y) {
        const b = this.bounds;
        return x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height;
    }

    contains(x, y) {
        if (!this.boundsContain(x, y)) return false;

        if (this.shape.kind === 'rect') return true;

        if (this.shape.kind === 'tilemask') {
            const cs = this.shape.cellSize;
            return this.shape.cells.has(`${Math.floor(x / cs)},${Math.floor(y / cs)}`);
        }

        // Polygon: even-odd ray cast. Handles concave shapes (L-shaped rooms).
        const pts = this.shape.points;
        let inside = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
            const xi = pts[i].x, yi = pts[i].y;
            const xj = pts[j].x, yj = pts[j].y;
            const intersects = ((yi > y) !== (yj > y)) &&
                (x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi);
            if (intersects) inside = !inside;
        }
        return inside;
    }

    /**
     * Fraction of `rect` that lies inside this region.
     *
     * Rect regions get the exact analytic answer (identical to the pre-existing
     * `RectUtils.getIntersectionRatio`, which Zone thresholds depend on — this
     * must not drift). Non-rect shapes sample instead, since there is no cheap
     * exact answer for arbitrary polygons.
     */
    intersectionRatio(rect) {
        if (this.shape.kind === 'rect') {
            return RectUtils.getIntersectionRatio(rect, this.bounds);
        }

        const samples = 5;
        let hits = 0;
        for (let i = 0; i < samples; i++) {
            for (let j = 0; j < samples; j++) {
                const x = rect.x + (rect.width * ((i + 0.5) / samples));
                const y = rect.y + (rect.height * ((j + 0.5) / samples));
                if (this.contains(x, y)) hits++;
            }
        }
        return hits / (samples * samples);
    }

    getCenterPoint() {
        const b = this.bounds;
        return { x: b.x + (b.width / 2), y: b.y + (b.height / 2) };
    }
}
