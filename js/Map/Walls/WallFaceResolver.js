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

    static visibleAtom(slice, grid, topology = {}) {
        const x = slice.x;
        const y = slice.y;
        const half = slice.half;
        if (slice.kind === 'horizontal-band') {
            const south = { x, y, face: 'south', half };
            const north = { x, y, face: 'north', half };
            const southClass = WallFaceResolver.classify(south, grid, topology);
            const northClass = WallFaceResolver.classify(north, grid, topology);
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
                const atom = WallFaceResolver.visibleAtom({ x, y, kind: span.kind, half: span.half }, grid, topology);
                const classification = WallFaceResolver.classify(atom, grid, topology);
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
