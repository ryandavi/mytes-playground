/**
 * WallSurfaceRuns — which surface a wall half belongs to when its own faces
 * cannot say.
 *
 * A half with masonry behind it, a free end, the side of an arm where it leaves
 * the wall it hangs off: each is part of a run, and the run is what it wears.
 * These walks answer "what is the nearest half along this run that can name a
 * surface", with the tie-breaks §4.10 sets out — the side of the seam for a
 * buried band, south first for a post. Pure: geometry, the ownership grid and
 * topology in, a classification out.
 */
class WallSurfaceRuns {
    /**
     * A post is the side of a wall running north-south, and where a horizontal
     * arm leaves the same cell that side is flush against the arm's masonry.
     * `lookBlock` reads into the arm's own cell, and floor ownership expands
     * under masonry, so the block answers with the room whose floor runs up to
     * it — a junction sliver wearing the neighbouring room's finish while the
     * wall it is plainly part of carries on below it in another. That is the
     * unpainted stub at the top of a painted arm.
     *
     * A covered post takes the surface of the run it belongs to instead, read
     * north and south past any other junction, which cannot speak either.
     */
    static postSurface(slice, grid, topology, geometry) {
        const side = slice.kind === 'post-west' ? WallGeometry.MASK_WEST
            : slice.kind === 'post-east' ? WallGeometry.MASK_EAST : 0;
        const covered = side && (WallSurfaceRuns.maskAt(slice.x, slice.y, geometry) & side) !== 0;
        if (!geometry || !covered) return null;
        // South first. A vertical run can pass straight through the junction
        // with a different surface on each side of it — a room above, the yard
        // below — and the sliver belongs to the half the camera is looking at,
        // which is the same call the bands make.
        return WallSurfaceRuns.postSurfaceTowards(slice, grid, topology, geometry, side, 1) ??
            WallSurfaceRuns.postSurfaceTowards(slice, grid, topology, geometry, side, -1);
    }

    static postSurfaceTowards(slice, grid, topology, geometry, side, direction) {
        const limit = Math.max(1, (geometry.cells?.size || 1));
        for (let distance = 1; distance <= limit; distance++) {
            const y = slice.y + (distance * direction);
            if (!WallSurfaceRuns.verticalCellsConnected(slice.y, y, slice.x, geometry)) return null;
            // Another junction, covered on the same side: it cannot speak either.
            if ((WallSurfaceRuns.maskAt(slice.x, y, geometry) & side) !== 0) continue;
            const spans = geometry.paintSpans?.get(BuildKeys.cell(slice.x, y)) || [];
            if (!spans.some(span => span.kind === slice.kind)) continue;
            const neighbourSlice = { x: slice.x, y, kind: slice.kind, half: slice.half };
            const neighbourAtom = WallFaceResolver.visibleAtom(neighbourSlice, grid, topology);
            const neighbourClass = WallFaceResolver.classify(neighbourAtom, grid, topology);
            if (neighbourClass.kind === 'buried') continue;
            return neighbourClass;
        }
        return null;
    }

    static maskAt(x, y, geometry) {
        return geometry?.masks?.get(BuildKeys.cell(x, y)) || 0;
    }

    static verticalCellsConnected(fromY, toY, x, geometry) {
        const direction = Math.sign(toY - fromY);
        for (let y = fromY; y !== toY; y += direction) {
            const mask = WallSurfaceRuns.maskAt(x, y, geometry);
            const next = WallSurfaceRuns.maskAt(x, y + direction, geometry);
            const forward = direction > 0 ? WallGeometry.MASK_SOUTH : WallGeometry.MASK_NORTH;
            const back = direction > 0 ? WallGeometry.MASK_NORTH : WallGeometry.MASK_SOUTH;
            if (!(mask & forward) || !(next & back)) return false;
        }
        return true;
    }

    /**
     * What the run through this half is showing, read from the nearest band on
     * either side that can answer. Outside counts as an answer: a wall that
     * fronts the outside carries on being that wall through its own corners.
     * Two different answers means the run genuinely changes surface here, and
     * the caller keeps what it had.
     */
    static neighbouringRunSurface(slice, grid, topology, geometry, { preferSide = false } = {}) {
        if (preferSide) {
            const own = slice.half === 0 ? -1 : 1;
            return WallSurfaceRuns.runSurfaceTowards(slice, grid, topology, geometry, own) ??
                WallSurfaceRuns.runSurfaceTowards(slice, grid, topology, geometry, -own);
        }
        const limit = Math.max(1, (geometry.cells?.size || 1) * 2);
        for (let distance = 1; distance <= limit; distance++) {
            const surfaces = new Map();
            for (const direction of [-1, 1]) {
                const found = WallSurfaceRuns.runSurfaceAt(slice, grid, topology, geometry, direction, distance);
                if (found) surfaces.set(WallSurfaceRuns.surfaceKey(found), found);
            }
            if (surfaces.size === 1) return surfaces.values().next().value;
            if (surfaces.size > 1) return null;
        }
        return null;
    }

    /** The first band along the run in one direction that can name a surface. */
    static runSurfaceTowards(slice, grid, topology, geometry, direction) {
        const limit = Math.max(1, (geometry.cells?.size || 1) * 2);
        for (let distance = 1; distance <= limit; distance++) {
            const found = WallSurfaceRuns.runSurfaceAt(slice, grid, topology, geometry, direction, distance);
            if (found) return found;
        }
        return null;
    }

    static runSurfaceAt(slice, grid, topology, geometry, direction, distance) {
        const startUnit = (2 * slice.x) + slice.half;
        const unit = startUnit + (distance * direction);
        if (!WallSurfaceRuns.horizontalUnitsConnected(startUnit, unit, slice.y, geometry)) return null;
        const x = Math.floor(unit / 2);
        const half = ((unit % 2) + 2) % 2;
        const spans = geometry.paintSpans?.get(BuildKeys.cell(x, slice.y)) || [];
        if (!spans.some(span => span.kind === 'horizontal-band' && span.half === half)) return null;
        const neighbourSlice = { x, y: slice.y, kind: 'horizontal-band', half };
        const neighbourAtom = WallFaceResolver.visibleAtom(neighbourSlice, grid, topology);
        const neighbourClass = WallFaceResolver.classify(neighbourAtom, grid, topology);
        return neighbourClass.kind === 'buried' ? null : neighbourClass;
    }

    static surfaceKey(classification) {
        return classification.kind === 'room'
            ? `room:${classification.roomId}`
            : `${classification.kind}:${classification.loopId ?? 'outside'}`;
    }

    static horizontalUnitsConnected(fromUnit, toUnit, y, geometry) {
        const direction = Math.sign(toUnit - fromUnit);
        for (let unit = fromUnit; unit !== toUnit; unit += direction) {
            const next = unit + direction;
            const x = Math.floor(unit / 2);
            const nextX = Math.floor(next / 2);
            if (x === nextX) continue;
            const leftX = Math.min(x, nextX);
            const leftMask = geometry.masks?.get(BuildKeys.cell(leftX, y)) || 0;
            const rightMask = geometry.masks?.get(BuildKeys.cell(leftX + 1, y)) || 0;
            if (!(leftMask & WallGeometry.MASK_EAST) || !(rightMask & WallGeometry.MASK_WEST)) return false;
        }
        return true;
    }
}
