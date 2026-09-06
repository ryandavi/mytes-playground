/**
 * SurfaceRunGrouper — the stretch of wall a click selects, and the room or
 * loop a wall half belongs to.
 *
 * The owner of a wall half is the owner of the block directly behind its NEAR
 * face — the one the camera is on, `south` for a horizontal band and the open
 * cheek for a post. Not `visibleSurface`'s depth-rule winner: on a wall shared
 * by two rooms the camera sees one side, and that side is the one a click means
 * and the one whose finish should show. `nearClass` is that lookup; a half
 * whose near face is masonry answers `buried` and is nobody's to paint.
 *
 * A run is a straight stretch of wall along one axis. It never turns a corner —
 * a corner is a new wall piece, a new run. Two grains:
 *
 *   'segment'  the clicked span out to the next junction each way (a cell where
 *              another wall tees or crosses in). The piece between joints.
 *   'run'      the clicked span end to end along its straight piece, through
 *              every junction, until the wall turns, ends, or the near-side
 *              owner changes. Openings never stop it.
 *
 * Wrapping a whole room's or building's walls is not a run; that is the room /
 * building scope, which enumerates every half whose near side names it.
 *
 * Pure: geometry, the ownership grid and topology in; a list of spans out.
 */
class SurfaceRunGrouper {
    static AXES = Object.freeze({
        'horizontal-band': 'horizontal',
        'post-west': 'vertical',
        'post-east': 'vertical'
    });

    /** The face on the side the camera is on for this span kind. */
    static nearFace(kind) {
        if (kind === 'horizontal-band') return 'south';
        return kind === 'post-west' ? 'west' : 'east';
    }

    /** A span carries its cell as `.cell` (grouper) or flat `.x/.y` (a slice). */
    static cellOf(span) {
        return span.cell ? span.cell : span;
    }

    /**
     * The atom a near-side paint lands on. Bands split west/east by `half`;
     * posts split north/south and the camera meets the south (`half: 1`) one.
     */
    static nearAtom(span) {
        const cell = SurfaceRunGrouper.cellOf(span);
        return {
            x: cell.x,
            y: cell.y,
            face: SurfaceRunGrouper.nearFace(span.kind),
            half: span.kind === 'horizontal-band' ? span.half : 1
        };
    }

    /**
     * The block behind this half's near (camera) face — `south` for a band, the
     * open cheek for a post. `buried` when that face is masonry.
     */
    static nearClass(span, grid, topology) {
        const cell = SurfaceRunGrouper.cellOf(span);
        const face = SurfaceRunGrouper.nearFace(span.kind);
        const halves = span.kind === 'horizontal-band' ? [span.half] : [1, 0];
        let last = null;
        for (const half of halves) {
            last = WallFaceResolver.classify({ x: cell.x, y: cell.y, face, half }, grid, topology);
            if (last.kind !== 'buried') return last;
        }
        return last;
    }

    /**
     * Who a half belongs to: its near-side owner, or — when the near face is
     * masonry (a returning-corner sliver, a covered post) — whatever run
     * `visibleSurface` says it continues, so the corner does not go blank.
     */
    static ownerClass(span, grid, topology, geometry) {
        const near = SurfaceRunGrouper.nearClass(span, grid, topology);
        if (near.kind !== 'buried' || !geometry) return near;
        const cell = SurfaceRunGrouper.cellOf(span);
        return WallFaceResolver.visibleSurface(
            { x: cell.x, y: cell.y, kind: span.kind, half: span.half }, grid, topology, geometry
        ).classification;
    }

    static classKey(classification) {
        if (!classification || classification.kind === 'buried') return 'buried';
        return classification.kind === 'room'
            ? `room:${classification.roomId}`
            : `exterior:${classification.loopId ?? 'outside'}`;
    }

    static spanId(span) {
        return span.kind === 'horizontal-band'
            ? `${span.cell.x},${span.cell.y}/h/${span.half}`
            : `${span.cell.x},${span.cell.y}/${span.kind}`;
    }

    static spansAt(geometry, x, y) {
        const raw = geometry.paintSpans?.get(BuildKeys.cell(x, y)) || [];
        return raw.map(span => ({
            cell: { x, y }, kind: span.kind, half: span.half, from: span.from, to: span.to
        }));
    }

    static maskAt(geometry, x, y) {
        return geometry.masks?.get(BuildKeys.cell(x, y)) || 0;
    }

    /** A cell where a wall crosses the run's axis — a T, a cross, a corner. */
    static isJunction(geometry, x, y, axis) {
        const crossBits = axis === 'horizontal'
            ? (WallGeometry.MASK_NORTH | WallGeometry.MASK_SOUTH)
            : (WallGeometry.MASK_WEST | WallGeometry.MASK_EAST);
        return (SurfaceRunGrouper.maskAt(geometry, x, y) & crossBits) !== 0;
    }

    /**
     * @param {'segment'|'run'|'shell'} mode
     *   'segment' the clicked span out to the next junction each way.
     *   'run'     the whole straight piece, through junctions, until it turns.
     *   'shell'   every half on the same loop/room, corners and all — the walk
     *             follows masonry in both axes, so a returning-corner sliver is
     *             not left behind.
     * @returns {{ id, kind, roomId, loopId, spans }} or `null` when the click
     * landed on a buried half — there is nothing selectable there.
     */
    static group(startSpan, { geometry, grid, topology }, mode = 'run') {
        if (!startSpan?.cell || !geometry) return null;
        const startClass = SurfaceRunGrouper.ownerClass(startSpan, grid, topology, geometry);
        const wantKey = SurfaceRunGrouper.classKey(startClass);
        if (wantKey === 'buried') return null;

        const axis = SurfaceRunGrouper.AXES[startSpan.kind];
        const matches = span => (mode === 'shell' || SurfaceRunGrouper.AXES[span.kind] === axis)
            && SurfaceRunGrouper.classKey(SurfaceRunGrouper.ownerClass(span, grid, topology, geometry)) === wantKey;

        const seen = new Set();
        const members = [];
        const consider = span => {
            const id = SurfaceRunGrouper.spanId(span);
            if (seen.has(id) || !matches(span)) return;
            seen.add(id);
            members.push(span);
        };

        if (mode === 'shell') {
            // Flood the connected masonry in both axes; keep every half whose
            // near side names the same loop or room.
            const cellSeen = new Set([BuildKeys.cell(startSpan.cell.x, startSpan.cell.y)]);
            const queue = [[startSpan.cell.x, startSpan.cell.y]];
            while (queue.length) {
                const [x, y] = queue.shift();
                for (const span of SurfaceRunGrouper.spansAt(geometry, x, y)) consider(span);
                const m = SurfaceRunGrouper.maskAt(geometry, x, y);
                for (const [dx, dy, bit] of [
                    [0, -1, WallGeometry.MASK_NORTH], [1, 0, WallGeometry.MASK_EAST],
                    [0, 1, WallGeometry.MASK_SOUTH], [-1, 0, WallGeometry.MASK_WEST]
                ]) {
                    if (!(m & bit)) continue;
                    const key = BuildKeys.cell(x + dx, y + dy);
                    if (cellSeen.has(key)) continue;
                    cellSeen.add(key);
                    queue.push([x + dx, y + dy]);
                }
            }
        } else {
            // The clicked cell's own same-axis spans.
            for (const span of SurfaceRunGrouper.spansAt(geometry, startSpan.cell.x, startSpan.cell.y)) consider(span);

            // Straight along the axis each way. A cell with nothing matching —
            // the far side of a shared wall — still passes the walk on; a
            // masonry gap stops it, and in 'segment' grain so does the first
            // junction.
            const steps = axis === 'horizontal'
                ? [[-1, 0, WallGeometry.MASK_WEST], [1, 0, WallGeometry.MASK_EAST]]
                : [[0, -1, WallGeometry.MASK_NORTH], [0, 1, WallGeometry.MASK_SOUTH]];
            for (const [dx, dy, bit] of steps) {
                let x = startSpan.cell.x;
                let y = startSpan.cell.y;
                while (SurfaceRunGrouper.maskAt(geometry, x, y) & bit) {
                    x += dx;
                    y += dy;
                    const here = SurfaceRunGrouper.spansAt(geometry, x, y);
                    if (!here.length) break;
                    for (const span of here) consider(span);
                    if (mode === 'segment' && SurfaceRunGrouper.isJunction(geometry, x, y, axis)) break;
                }
            }
        }

        return {
            id: `${wantKey}/${axis}/${SurfaceRunGrouper.spanId(startSpan)}`,
            kind: startClass.kind,
            roomId: startClass.kind === 'room' ? startClass.roomId : null,
            loopId: startClass.kind === 'exterior' ? (startClass.loopId ?? 'outside') : null,
            spans: members.length ? members : [startSpan]
        };
    }

    /** The face opposite the near one — south↔north, west↔east. */
    static farFace(kind) {
        return { south: 'north', west: 'east', east: 'west' }[SurfaceRunGrouper.nearFace(kind)];
    }

    static farClassAt(x, y, kind, half, grid, topology) {
        const halves = kind === 'horizontal-band' ? [half] : [1, 0];
        let last = null;
        for (const h of halves) {
            last = WallFaceResolver.classify({ x, y, face: SurfaceRunGrouper.farFace(kind), half: h }, grid, topology);
            if (last.kind !== 'buried') return last;
        }
        return last;
    }

    /**
     * The room an exterior half fronts — the block behind its far face. A corner
     * sliver's far face is masonry, so it takes the room its straight run
     * fronts, read to the nearest half on either side that can say.
     */
    static spanAdjacentRoom(span, grid, topology, geometry) {
        const cell = SurfaceRunGrouper.cellOf(span);
        const own = SurfaceRunGrouper.farClassAt(cell.x, cell.y, span.kind, span.half, grid, topology);
        if (own && own.kind === 'room') return own.roomId;
        if (own && own.kind === 'exterior') return null;

        const axis = SurfaceRunGrouper.AXES[span.kind];
        const steps = axis === 'horizontal'
            ? [[-1, 0, WallGeometry.MASK_WEST], [1, 0, WallGeometry.MASK_EAST]]
            : [[0, -1, WallGeometry.MASK_NORTH], [0, 1, WallGeometry.MASK_SOUTH]];
        for (const [dx, dy, bit] of steps) {
            let x = cell.x;
            let y = cell.y;
            while (SurfaceRunGrouper.maskAt(geometry, x, y) & bit) {
                x += dx;
                y += dy;
                for (const next of SurfaceRunGrouper.spansAt(geometry, x, y)) {
                    if (SurfaceRunGrouper.AXES[next.kind] !== axis) continue;
                    const c = SurfaceRunGrouper.farClassAt(x, y, next.kind, next.half, grid, topology);
                    if (c && c.kind === 'room') return c.roomId;
                    if (c && c.kind === 'exterior') return null;
                }
            }
        }
        return null;
    }
}
