class WallFaceResolver {
    static classify(atom, grid, topology = {}) {
        const [bx, by] = BuildKeys.lookBlock(atom.x, atom.y, atom.face, atom.half);
        const roomId = grid.ownerAt(bx, by);
        if (roomId !== null) return Object.freeze({ kind: 'room', roomId });
        const cellX = Math.floor(bx / 2);
        const cellY = Math.floor(by / 2);
        if (WallFaceResolver.isWallCell(cellX, cellY, topology)) return Object.freeze({ kind: 'buried' });
        return Object.freeze({ kind: 'exterior', loopId: WallFaceResolver.loopAt(bx, by, topology) ?? 'outside' });
    }

    /**
     * Which atom a slice shows.
     *
     * With a room on one side only, the visible face is the south one — the
     * camera is south of the wall, so what you are looking at is the inside of
     * a room's back wall and the OUTSIDE of its front wall. Showing the room's
     * atom on a front wall meant a building's outward faces were never
     * presented, and what is never presented can be neither clicked nor
     * painted: there was no way to reach a house's own exterior at all.
     *
     * With a room on both sides there is no outside involved and the depth rule
     * below decides, which is what stops a shared wall wearing the neighbour's
     * colour. A buried face is never shown; `visibleSurface` swaps it out.
     */
    static visibleAtom(slice, grid, topology = {}) {
        const x = slice.x;
        const y = slice.y;
        const half = slice.half;
        if (slice.kind === 'horizontal-band') {
            const south = { x, y, face: 'south', half };
            const north = { x, y, face: 'north', half };
            const southClass = WallFaceResolver.classify(south, grid, topology);
            const northClass = WallFaceResolver.classify(north, grid, topology);
            if (southClass.kind === 'exterior' && northClass.kind === 'room') return Object.freeze(south);
            if (northClass.kind === 'room' && southClass.kind !== 'room') return Object.freeze(north);
            if (southClass.kind === 'room' && northClass.kind !== 'room') return Object.freeze(south);
            if (southClass.kind === 'room' && northClass.kind === 'room' && southClass.roomId !== northClass.roomId) {
                const northDepth = WallFaceResolver.depthFromAtom(north, northClass.roomId, grid);
                const southDepth = WallFaceResolver.depthFromAtom(south, southClass.roomId, grid);
                if (northDepth !== southDepth) return Object.freeze(northDepth < southDepth ? north : south);
                const northArea = grid.blocksOf(northClass.roomId).length;
                const southArea = grid.blocksOf(southClass.roomId).length;
                if (northArea !== southArea) return Object.freeze(northArea < southArea ? north : south);
            }
            return Object.freeze(south);
        }
        if (slice.kind === 'post-west' || slice.kind === 'post-east') {
            const face = slice.kind === 'post-west' ? 'west' : 'east';
            const south = { x, y, face, half: 1 };
            return Object.freeze(WallFaceResolver.classify(south, grid, topology).kind === 'room'
                ? south : { x, y, face, half: 0 });
        }
        throw new Error(`Unknown wall slice kind: ${slice.kind}`);
    }

    /**
     * Resolves both the physical atom that receives paint and the surface the
     * visible slice belongs to. At a corner the face toward the room can look
     * straight into the returning arm of the wall. The opposite atom is the
     * one actually visible, but semantically it continues the room-facing run.
     */
    static visibleSurface(slice, grid, topology = {}, geometry = null) {
        let atom = WallFaceResolver.visibleAtom(slice, grid, topology);
        let classification = WallFaceResolver.classify(atom, grid, topology);
        if (slice.kind !== 'horizontal-band') {
            return Object.freeze({
                atom,
                classification: WallSurfaceRuns.postSurface(slice, grid, topology, geometry) || classification
            });
        }

        const candidates = ['south', 'north'].map(face => {
            const candidate = { x: slice.x, y: slice.y, face, half: slice.half };
            return { atom: candidate, classification: WallFaceResolver.classify(candidate, grid, topology) };
        });
        const hasBuriedFace = candidates.some(candidate => candidate.classification.kind === 'buried');
        if (classification.kind === 'buried') {
            const visible = candidates.find(candidate => candidate.classification.kind !== 'buried');
            if (visible) ({ atom, classification } = visible);
        }
        // A half with masonry behind it is a stub of a longer run — the returning
        // arm of a corner or a T — and it belongs to whatever that run belongs
        // to. Its own faces cannot say: one is buried, so the only classification
        // left is whichever side happens to be open, which at a corner is the
        // room even when the run itself faces outside. That is how one wall came
        // to wear two surfaces, interior at both ends and exterior in the middle,
        // and why a paint stretch broke off at every junction.
        //
        // A free end has no buried face and keeps its own answer when it has one;
        // it inherits only when it has nothing to say for itself — and outside
        // counts as an answer there too. A wall that runs on past the corner of
        // a room fronts nothing but outside, and reaching over its exterior
        // neighbour for a room further along dressed the last cell of a run in a
        // colour nothing beside it was wearing.
        const terminalBand = geometry && WallFaceResolver.isTerminalBand(slice, geometry);
        const inheritable = hasBuriedFace || (terminalBand && classification.kind !== 'room');
        if (!geometry || !inheritable) {
            return Object.freeze({ atom: Object.freeze(atom), classification });
        }

        // A buried half is buried by an arm leaving its own cell, and the arm is
        // the seam: the west half continues the run west, the east half
        // continues it east, and they are allowed to differ — that is two
        // surfaces meeting on the post between them. Asking both ways and
        // giving up when they disagree is what left the half beside an arm
        // wearing the face behind it while the wall it continues went on
        // without it. A free end has no arm and no seam, so it still needs both
        // sides to agree.
        const inherited = WallSurfaceRuns.neighbouringRunSurface(
            slice, grid, topology, geometry, { preferSide: hasBuriedFace }
        );
        return Object.freeze({
            atom: Object.freeze(atom),
            classification: inherited || classification
        });
    }

    static classifyPaintAtom(atom, grid, topology = {}, geometry = null) {
        if (geometry) {
            const key = BuildKeys.atom(atom.x, atom.y, atom.face, atom.half);
            const spans = geometry.paintSpans?.get(BuildKeys.cell(atom.x, atom.y)) || [];
            for (const span of spans) {
                const resolved = WallFaceResolver.visibleSurface(
                    { x: atom.x, y: atom.y, kind: span.kind, half: span.half },
                    grid,
                    topology,
                    geometry
                );
                if (BuildKeys.atom(
                    resolved.atom.x, resolved.atom.y, resolved.atom.face, resolved.atom.half
                ) === key) return resolved.classification;
            }
        }
        return WallFaceResolver.classify(atom, grid, topology);
    }

    static isTerminalBand(slice, geometry) {
        const mask = geometry.masks?.get(BuildKeys.cell(slice.x, slice.y)) || 0;
        const horizontalConnections = Number((mask & WallGeometry.MASK_WEST) !== 0) +
            Number((mask & WallGeometry.MASK_EAST) !== 0);
        const verticalConnections = Number((mask & WallGeometry.MASK_NORTH) !== 0) +
            Number((mask & WallGeometry.MASK_SOUTH) !== 0);
        return horizontalConnections === 1 && verticalConnections === 0;
    }

    static depthFromAtom(atom, roomId, grid) {
        const [bx, by] = BuildKeys.lookBlock(atom.x, atom.y, atom.face, atom.half);
        const dx = atom.face === 'west' ? -1 : atom.face === 'east' ? 1 : 0;
        const dy = atom.face === 'north' ? -1 : atom.face === 'south' ? 1 : 0;
        let depth = 0;
        for (let x = bx, y = by; grid.ownerAt(x, y) === roomId; x += dx, y += dy) depth++;
        return depth;
    }

    static sections(geometry, grid, topology = {}) {
        const nodes = [];
        for (const [cellKey, spans] of geometry.paintSpans || []) {
            const { x, y } = BuildKeys.parseCell(cellKey);
            for (const span of spans) {
                const { atom, classification } = WallFaceResolver.visibleSurface(
                    { x, y, kind: span.kind, half: span.half }, grid, topology, geometry
                );
                if (classification.kind === 'buried') continue;
                const surface = classification.kind === 'room'
                    ? `room:${classification.roomId}` : `exterior:${classification.loopId ?? 'outside'}`;
                const coordinate = span.kind === 'horizontal-band'
                    ? `h:${y}:${(2 * x) + span.half}`
                    : `v:${span.kind}:${x}:${y}`;
                nodes.push({ atom, classification, surface, coordinate, span, x, y });
            }
        }
        const byCoordinate = new Map(nodes.map(node => [node.coordinate, node]));
        const visited = new Set();
        const sections = [];
        for (const start of nodes) {
            if (visited.has(start.coordinate)) continue;
            const queue = [start];
            const members = [];
            visited.add(start.coordinate);
            while (queue.length) {
                const node = queue.shift();
                members.push(node);
                for (const key of WallFaceResolver.sectionNeighbours(node)) {
                    const next = byCoordinate.get(key);
                    if (!next || next.surface !== start.surface || visited.has(key)) continue;
                    visited.add(key);
                    queue.push(next);
                }
            }
            const atomKeys = [...new Set(members.map(node => BuildKeys.atom(
                node.atom.x, node.atom.y, node.atom.face, node.atom.half
            )))].sort();
            sections.push(Object.freeze({
                id: `${start.surface}/${members[0].coordinate}`,
                surface: start.classification,
                atoms: Object.freeze(atomKeys),
                spans: Object.freeze(members.map(node => Object.freeze({ cell: BuildKeys.cell(node.x, node.y), ...node.span })))
            }));
        }
        return Object.freeze(sections);
    }

    static sectionNeighbours(node) {
        if (node.span.kind === 'horizontal-band') {
            const unit = (2 * node.x) + node.span.half;
            return [`h:${node.y}:${unit - 1}`, `h:${node.y}:${unit + 1}`];
        }
        return [
            `v:${node.span.kind}:${node.x}:${node.y - 1}`,
            `v:${node.span.kind}:${node.x}:${node.y + 1}`
        ];
    }

    static isWallCell(x, y, topology) {
        if (typeof topology.isWallCell === 'function') return topology.isWallCell(x, y);
        const walls = topology.walls?.cells || topology.walls;
        return walls instanceof Map ? walls.has(BuildKeys.cell(x, y)) : !!walls?.[BuildKeys.cell(x, y)];
    }

    static loopAt(bx, by, topology) {
        if (typeof topology.loopAtBlock === 'function') return topology.loopAtBlock(bx, by) ?? null;
        if (typeof topology.openSpaceAtBlock === 'function') return topology.openSpaceAtBlock(bx, by)?.loopId ?? null;
        return topology.loopByBlock?.get?.(BuildKeys.block(bx, by)) ?? null;
    }
}
