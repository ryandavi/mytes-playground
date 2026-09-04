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

    static solve(input) {
        const width = FloorOwnershipResolver.dimension(input?.width, 'width');
        const height = FloorOwnershipResolver.dimension(input?.height, 'height');
        const blockWidth = width * 2;
        const blockHeight = height * 2;
        const reachBlocks = Math.max(0, Math.floor(Number(input?.reachBlocks) || 0));
        const walls = FloorOwnershipResolver.normalizeWallMasks(input?.walls);
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

        for (let round = 0; round < reachBlocks; round++) {
            const previous = owners;
            const next = previous.slice();
            for (let by = 0; by < blockHeight; by++) {
                for (let bx = 0; bx < blockWidth; bx++) {
                    const targetIndex = by * blockWidth + bx;
                    if (previous[targetIndex] !== null) continue;
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
