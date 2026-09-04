class FloorOwnershipResolver {
    static STEPS = Object.freeze([
        Object.freeze({ dx: -1, dy: 0, straight: true }),
        Object.freeze({ dx: 1, dy: 0, straight: true }),
        Object.freeze({ dx: 0, dy: -1, straight: true }),
        Object.freeze({ dx: 0, dy: 1, straight: true }),
        Object.freeze({ dx: -1, dy: -1, straight: false }),
        Object.freeze({ dx: 1, dy: -1, straight: false }),
        Object.freeze({ dx: -1, dy: 1, straight: false }),
        Object.freeze({ dx: 1, dy: 1, straight: false })
    ]);

    // Which two blocks of a cell each side owns, and the axis the plan has to
    // continue along before that side may be pulled in.
    static SIDES = Object.freeze([
        Object.freeze({ dx: -1, dy: 0, axis: 'x', blocks: Object.freeze([[0, 0], [0, 1]]) }),
        Object.freeze({ dx: 1, dy: 0, axis: 'x', blocks: Object.freeze([[1, 0], [1, 1]]) }),
        Object.freeze({ dx: 0, dy: -1, axis: 'y', blocks: Object.freeze([[0, 0], [1, 0]]) }),
        Object.freeze({ dx: 0, dy: 1, axis: 'y', blocks: Object.freeze([[0, 1], [1, 1]]) })
    ]);

    static solve(input) {
        const width = FloorOwnershipResolver.dimension(input?.width, 'width');
        const height = FloorOwnershipResolver.dimension(input?.height, 'height');
        const blockWidth = width * 2;
        const blockHeight = height * 2;
        const reachBlocks = Math.max(0, Math.floor(Number(input?.reachBlocks) || 0));
        const walls = FloorOwnershipResolver.normalizeWallMasks(input?.walls);
        const expandCells = new Set(input?.expandCells || []);
        const plans = FloorOwnershipResolver.normalizePlans(input?.plans);
        let owners = new Array(blockWidth * blockHeight).fill(null);

        for (const plan of plans) {
            for (const key of plan.seedCells) {
                const { x, y } = BuildKeys.parseCell(key);
                if (x < 0 || y < 0 || x >= width || y >= height || walls.has(key)) continue;
                for (const [bx, by] of BuildKeys.blocksOfCell(x, y)) {
                    const index = by * blockWidth + bx;
                    const current = owners[index];
                    if (current && current !== plan.id) {
                        throw new Error(`Seed cell ${key} belongs to both ${current} and ${plan.id}`);
                    }
                    owners[index] = plan.id;
                }
            }
        }

        FloorOwnershipResolver.insetOpenBoundaries(owners,
            { blockWidth, width, height, plans, walls, expandCells });

        for (let round = 0; round < reachBlocks; round++) {
            const previous = owners;
            const next = previous.slice();
            for (let by = 0; by < blockHeight; by++) {
                for (let bx = 0; bx < blockWidth; bx++) {
                    const targetIndex = by * blockWidth + bx;
                    if (previous[targetIndex] !== null) continue;
                    if (!FloorOwnershipResolver.canExpandInto(bx, by, walls, expandCells)) continue;
                    const claims = new Map();
                    for (const step of FloorOwnershipResolver.STEPS) {
                        const sx = bx - step.dx;
                        const sy = by - step.dy;
                        if (!FloorOwnershipResolver.inBounds(sx, sy, blockWidth, blockHeight)) continue;
                        const owner = previous[sy * blockWidth + sx];
                        if (owner === null || !FloorOwnershipResolver.canStep(sx, sy, bx, by, walls)) continue;
                        const existing = claims.get(owner);
                        if (!existing || (step.straight && !existing.straight)) claims.set(owner, { owner, straight: step.straight });
                    }
                    const winner = [...claims.values()].sort((a, b) =>
                        Number(b.straight) - Number(a.straight) ||
                        FloorOwnershipResolver.comparePlans(plans, a.owner, b.owner)
                    )[0];
                    if (winner) next[targetIndex] = winner.owner;
                }
            }
            owners = next;
        }

        return FloorOwnershipResolver.createGrid({
            width, height, blockWidth, blockHeight, owners,
            revision: Number(input?.revision) || 0,
            planIds: plans.map(plan => plan.id)
        });
    }

    static normalizeWallMasks(walls) {
        const result = new Map();
        const entries = walls instanceof Map ? walls.entries() : Object.entries(walls || {});
        for (const [key, wall] of entries) {
            const cellKey = Number.isInteger(wall?.x) && Number.isInteger(wall?.y)
                ? BuildKeys.cell(wall.x, wall.y) : key;
            result.set(cellKey, Number(wall?.mask) || 0);
        }
        return result;
    }

    static normalizePlans(plans) {
        const seen = new Set();
        return (plans || []).map(plan => {
            const id = String(plan.id);
            if (seen.has(id)) throw new Error(`Duplicate room plan id: ${id}`);
            seen.add(id);
            const seedCells = [...new Set(plan.seedCells || [])].sort();
            return Object.freeze({ id, seedCells, priority: Number(plan.priority) || 0 });
        });
    }

    static comparePlans(plans, aId, bId) {
        const a = plans.find(plan => plan.id === aId);
        const b = plans.find(plan => plan.id === bId);
        return (b.priority - a.priority) ||
            (a.seedCells.length - b.seedCells.length) ||
            a.id.localeCompare(b.id);
    }

    /**
     * Pulls a plan's open edges in to the centreline of their boundary cells.
     *
     * The floor's edge belongs on the centreline of the cell that bounds it,
     * and that has to hold whether the bounding cell is masonry or just the
     * outermost cell the player painted. Without this a painted floor ends on
     * the cell edge, and the moment the player walls that perimeter the wall
     * takes the boundary cell over and the floor jumps half a tile inward —
     * the floor moving because a wall was edited, which it must never do.
     *
     * A side is only pulled in where the plan actually continues along that
     * side's axis, so a single painted tile stays a whole tile and a one-cell
     * corridor keeps its width instead of eroding to nothing.
     */
    static insetOpenBoundaries(owners, context) {
        const { blockWidth, width, height, plans, walls, expandCells } = context;
        const ownerOf = new Map();
        for (const plan of plans) for (const key of plan.seedCells) ownerOf.set(key, plan.id);
        // "Open" is per plan, not global: a neighbouring cell belonging to a
        // DIFFERENT plan is an edge of this plan just as much as bare ground is,
        // so two floors meeting in the open both stop on a centreline. Skipping
        // that case left one seam in the map — the only place a floor ran to a
        // cell edge — while every other edge in the same room stopped halfway.
        //
        // The edge of the map is the end of the world, not ground the player
        // could have painted and chose not to, so a room that runs to it is not
        // pulled in — otherwise the whole outdoors gets a bare half-tile frame.
        const open = (planId, x, y) => {
            if (!FloorOwnershipResolver.inBounds(x, y, width, height)) return false;
            const key = BuildKeys.cell(x, y);
            // Another plan's ground is not an open edge: two floors meet flush.
            // Pulling both back left a cell of bare terrain at every junction.
            if (ownerOf.has(key)) return false;
            if (expandCells.has(key)) return false;
            // A wall the plan will never tuck under is just an obstacle stood
            // next to it, so the plan's edge stays where it was. Without this,
            // drawing a stub beside a floor moved that floor a whole cell: the
            // inset stopped AND the tuck began.
            if (walls.has(key)) return false;
            return true;
        };
        const dropped = [];
        for (const [key, planId] of ownerOf) {
            const { x, y } = BuildKeys.parseCell(key);
            for (const side of FloorOwnershipResolver.SIDES) {
                if (!open(planId, x + side.dx, y + side.dy)) continue;
                if (!FloorOwnershipResolver.continuesAlong(x, y, side.axis, planId, ownerOf)) continue;
                for (const [ox, oy] of side.blocks) {
                    dropped.push((((2 * y) + oy) * blockWidth) + (2 * x) + ox);
                }
            }
        }
        // Collected against the original grid, applied after: eroding in place
        // would let one cell's inset decide the next cell's.
        for (const index of dropped) owners[index] = null;
    }

    static continuesAlong(x, y, axis, planId, ownerOf) {
        const steps = axis === 'x' ? [[-1, 0], [1, 0]] : [[0, -1], [0, 1]];
        return steps.some(([dx, dy]) => ownerOf.get(BuildKeys.cell(x + dx, y + dy)) === planId);
    }

    // Expansion exists to bury a room's floor under the masonry that encloses
    // it, not to grow the room. A block on open ground is never claimed, so the
    // floor a player paints ends exactly on the cells they painted; only wall
    // cells (and the threshold cells a doorway gap leaves in the line of a
    // wall) are reachable beyond the seeds.
    static canExpandInto(bx, by, walls, expandCells) {
        const key = BuildKeys.cell(Math.floor(bx / 2), Math.floor(by / 2));
        return walls.has(key) || expandCells.has(key);
    }

    static canStep(sx, sy, tx, ty, walls) {
        const dx = tx - sx;
        const dy = ty - sy;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1 || (dx === 0 && dy === 0)) return false;
        if (dx !== 0 && dy !== 0) {
            return FloorOwnershipResolver.canStep(sx, sy, tx, sy, walls) &&
                FloorOwnershipResolver.canStep(sx, sy, sx, ty, walls);
        }
        const sourceCellX = Math.floor(sx / 2);
        const sourceCellY = Math.floor(sy / 2);
        const targetCellX = Math.floor(tx / 2);
        const targetCellY = Math.floor(ty / 2);
        if (sourceCellX !== targetCellX || sourceCellY !== targetCellY) return true;
        const mask = walls.get(BuildKeys.cell(sourceCellX, sourceCellY));
        if (mask === undefined) return true;
        const fences = WallGeometry.fencesForMask(mask);
        if (dx !== 0 && fences.vertical) return false;
        if (dy !== 0 && fences.horizontal) return false;
        return true;
    }

    static createGrid(data) {
        const owner = Object.freeze(data.owners.slice());
        const ownerAt = (bx, by) => FloorOwnershipResolver.inBounds(bx, by, data.blockWidth, data.blockHeight)
            ? owner[by * data.blockWidth + bx] : null;
        const blocksOf = planId => {
            const blocks = [];
            for (let by = 0; by < data.blockHeight; by++) {
                for (let bx = 0; bx < data.blockWidth; bx++) if (ownerAt(bx, by) === planId) blocks.push([bx, by]);
            }
            return blocks;
        };
        const ownerOfCell = (x, y) => {
            const counts = new Map();
            for (const [bx, by] of BuildKeys.blocksOfCell(x, y)) {
                const id = ownerAt(bx, by);
                if (id !== null) counts.set(id, (counts.get(id) || 0) + 1);
            }
            return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || null;
        };
        const cellsOf = planId => {
            const cells = [];
            for (let y = 0; y < data.height; y++) for (let x = 0; x < data.width; x++) {
                if (ownerOfCell(x, y) === planId) cells.push(BuildKeys.cell(x, y));
            }
            return cells;
        };
        return Object.freeze({
            width: data.width, height: data.height,
            blockWidth: data.blockWidth, blockHeight: data.blockHeight,
            owner, revision: data.revision, planIds: Object.freeze(data.planIds.slice()),
            ownerAt, blocksOf, ownerOfCell, cellsOf
        });
    }

    static inBounds(x, y, width, height) {
        return x >= 0 && y >= 0 && x < width && y < height;
    }

    static dimension(value, name) {
        if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
        return value;
    }
}
