class RoofGeometry {
    static DIRECTIONS = Object.freeze([
        Object.freeze({ name: 'north', dx: 0, dy: -1 }),
        Object.freeze({ name: 'east', dx: 1, dy: 0 }),
        Object.freeze({ name: 'south', dx: 0, dy: 1 }),
        Object.freeze({ name: 'west', dx: -1, dy: 0 })
    ]);

    static compute(input = {}) {
        const plan = input.roofPlan || {};
        const buildingId = String(plan.buildingId || input.buildingId || '');
        const width = RoofGeometry.dimension(input.width ?? input.config?.width);
        const height = RoofGeometry.dimension(input.height ?? input.config?.height);
        const base = RoofGeometry.coverFor(input.topology, buildingId);
        for (const key of plan.excludedCells || []) base.delete(key);
        const cover = RoofGeometry.dilate(
            base,
            Number(plan.overhangCells) || 0,
            width,
            height,
            RoofGeometry.otherBuildingCells(input.topology, buildingId)
        );
        for (const key of plan.excludedCells || []) cover.delete(key);
        const style = ['flat', 'hip', 'gable'].includes(plan.style) ? plan.style : 'flat';
        const sections = RoofGeometry.components(cover).map(cells =>
            RoofGeometry.section(cells, style, plan, input.walls, input.config || {})
        );
        return Object.freeze({ buildingId, sections: Object.freeze(sections), revision: Number(input.revision) || 0 });
    }

    static dimension(value) {
        const number = Number(value);
        return Number.isInteger(number) && number > 0 ? number : Infinity;
    }

    static coverFor(topology, buildingId) {
        const source = topology?.roofableFootprint?.(buildingId) ??
            topology?.roofableByBuilding?.get?.(buildingId) ?? [];
        return new Set([...source].map(String));
    }

    static otherBuildingCells(topology, buildingId) {
        const result = new Set();
        for (const [id, cells] of topology?.roofableByBuilding || []) {
            if (String(id) === buildingId) continue;
            for (const key of cells) result.add(String(key));
        }
        return result;
    }

    static dilate(source, rounds, width, height, forbidden = new Set()) {
        let cover = new Set(source);
        for (let round = 0; round < Math.max(0, Math.min(1, rounds)); round++) {
            const next = new Set(cover);
            for (const key of cover) {
                const { x, y } = BuildKeys.parseCell(key);
                for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                    const nx = x + dx;
                    const ny = y + dy;
                    const candidate = BuildKeys.cell(nx, ny);
                    if (nx >= 0 && ny >= 0 && nx < width && ny < height && !forbidden.has(candidate)) {
                        next.add(candidate);
                    }
                }
            }
            cover = next;
        }
        return cover;
    }

    static components(cover) {
        const remaining = new Set(cover);
        const sections = [];
        while (remaining.size) {
            const first = RoofGeometry.sorted(remaining)[0];
            remaining.delete(first);
            const cells = [first];
            for (let index = 0; index < cells.length; index++) {
                const { x, y } = BuildKeys.parseCell(cells[index]);
                for (const direction of RoofGeometry.DIRECTIONS) {
                    const key = BuildKeys.cell(x + direction.dx, y + direction.dy);
                    if (!remaining.delete(key)) continue;
                    cells.push(key);
                }
            }
            sections.push(new Set(RoofGeometry.sorted(cells)));
        }
        return sections.sort((a, b) => RoofGeometry.compareKeys(a.values().next().value, b.values().next().value));
    }

    static section(cells, style, plan, walls, config) {
        const bounds = RoofGeometry.bounds(cells);
        const ridgeAxis = style === 'gable' ? RoofGeometry.ridgeAxis(plan.ridgeAxis, bounds) : null;
        const heights = style === 'flat'
            ? new Map([...cells].map(key => [key, 1]))
            : style === 'gable'
                ? RoofGeometry.gableHeights(cells, ridgeAxis)
                : RoofGeometry.hipHeights(cells);
        const parts = new Map(RoofGeometry.sorted(cells).map(key => [key,
            RoofGeometry.classify(key, cells, heights, style, ridgeAxis)
        ]));
        const wallHeights = RoofGeometry.wallHeights(cells, walls, config);
        return Object.freeze({
            key: cells.values().next().value,
            cells,
            heightPx: wallHeights.length ? Math.max(...wallHeights) : Number(config.defaultHeightPx) || 0,
            mixedHeights: new Set(wallHeights).size > 1,
            parts,
            bounds: Object.freeze(bounds),
            ridgeAxis
        });
    }

    static hipHeights(cells) {
        const heights = new Map();
        let frontier = [];
        for (const key of cells) {
            const { x, y } = BuildKeys.parseCell(key);
            if (RoofGeometry.DIRECTIONS.some(d => !cells.has(BuildKeys.cell(x + d.dx, y + d.dy))) ||
                [-1, 1].some(dx => [-1, 1].some(dy => !cells.has(BuildKeys.cell(x + dx, y + dy))))) {
                heights.set(key, 1);
                frontier.push(key);
            }
        }
        let distance = 1;
        while (frontier.length) {
            const next = [];
            for (const key of frontier) {
                const { x, y } = BuildKeys.parseCell(key);
                for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                    const neighbour = BuildKeys.cell(x + dx, y + dy);
                    if (!cells.has(neighbour) || heights.has(neighbour)) continue;
                    heights.set(neighbour, distance + 1);
                    next.push(neighbour);
                }
            }
            frontier = next;
            distance++;
        }
        return heights;
    }

    static gableHeights(cells, ridgeAxis) {
        const heights = new Map();
        const cross = ridgeAxis === 'x'
            ? [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }]
            : [{ dx: -1, dy: 0 }, { dx: 1, dy: 0 }];
        for (const key of cells) {
            const { x, y } = BuildKeys.parseCell(key);
            let distance = 1;
            for (;; distance++) {
                if (cross.some(d => !cells.has(BuildKeys.cell(x + d.dx * distance, y + d.dy * distance)))) break;
            }
            heights.set(key, distance);
        }
        return heights;
    }

    static classify(key, cells, heights, style, ridgeAxis) {
        const { x, y } = BuildKeys.parseCell(key);
        if (style === 'flat') {
            const edgeMask = RoofGeometry.DIRECTIONS.reduce((mask, direction, index) =>
                cells.has(BuildKeys.cell(x + direction.dx, y + direction.dy)) ? mask : mask | (1 << index), 0);
            return Object.freeze({ part: 'flat', facing: null, shade: 'neutral', height: 1, edgeMask });
        }
        if (style === 'gable') {
            const ends = ridgeAxis === 'x'
                ? RoofGeometry.DIRECTIONS.filter(d => d.name === 'east' || d.name === 'west')
                : RoofGeometry.DIRECTIONS.filter(d => d.name === 'north' || d.name === 'south');
            const end = ends.find(d => !cells.has(BuildKeys.cell(x + d.dx, y + d.dy)));
            if (end) return RoofGeometry.part('gable-end', end.name, heights.get(key));
        }
        const own = heights.get(key) || 1;
        const neighbours = RoofGeometry.DIRECTIONS.map(direction => ({
            ...direction,
            value: heights.get(BuildKeys.cell(x + direction.dx, y + direction.dy)) || 0
        }));
        const lower = neighbours.filter(neighbour => neighbour.value < own);
        const higher = neighbours.filter(neighbour => neighbour.value > own);
        if (lower.length === 1) return RoofGeometry.part('slope', lower[0].name, own);
        if (lower.length === 2 && RoofGeometry.adjacent(lower)) {
            return RoofGeometry.part('hip', RoofGeometry.corner(lower), own);
        }
        if (lower.length === 2) {
            return RoofGeometry.part('ridge', lower.some(d => d.name === 'north') ? 'x' : 'y', own);
        }
        if (lower.length === 3) {
            const continuation = neighbours.find(neighbour => !lower.includes(neighbour));
            return RoofGeometry.part('ridge-end', continuation?.name || null, own);
        }
        if (lower.length === 4) return RoofGeometry.part('peak', null, own);
        if (lower.length === 0 && higher.length >= 2) {
            for (let left = 0; left < higher.length; left++) for (let right = left + 1; right < higher.length; right++) {
                const pair = [higher[left], higher[right]];
                if (RoofGeometry.adjacent(pair)) return RoofGeometry.part('valley', RoofGeometry.corner(pair), own);
            }
        }
        const nearest = RoofGeometry.nearestEdge(x, y, cells);
        return RoofGeometry.part('slope', nearest, own);
    }

    static part(part, facing, height) {
        return Object.freeze({ part, facing, shade: RoofGeometry.shade(facing), height });
    }

    static adjacent(directions) {
        if (directions.length !== 2 || !directions[0] || !directions[1]) return false;
        return directions[0].dx !== -directions[1].dx || directions[0].dy !== -directions[1].dy;
    }

    static corner(directions) {
        return ['north', 'south'].find(name => directions.some(d => d.name === name)) + '-' +
            ['east', 'west'].find(name => directions.some(d => d.name === name));
    }

    static nearestEdge(x, y, cells) {
        return RoofGeometry.DIRECTIONS.map((direction, order) => {
            let distance = 1;
            while (cells.has(BuildKeys.cell(x + direction.dx * distance, y + direction.dy * distance))) distance++;
            return { name: direction.name, distance, order };
        }).sort((a, b) => a.distance - b.distance || a.order - b.order)[0].name;
    }

    static shade(facing) {
        if (String(facing).includes('south')) return 'light';
        if (String(facing).includes('north')) return 'dark';
        if (String(facing).includes('east')) return 'mid-light';
        if (String(facing).includes('west')) return 'mid-dark';
        return 'neutral';
    }

    static ridgeAxis(value, bounds) {
        if (value === 'x' || value === 'y') return value;
        return bounds.width >= bounds.height ? 'x' : 'y';
    }

    static wallHeights(cells, walls, config) {
        const source = walls instanceof Map ? walls : new Map(Object.entries(walls || {}));
        const cellSize = Number(config.cellSize) || 32;
        const constructions = config.constructions instanceof Map
            ? config.constructions : new Map(Object.entries(config.constructions || {}));
        return [...cells].map(key => source.get(key)).filter(Boolean).map(wall => {
            const construction = constructions.get(wall.constructionId);
            return Number(construction?.height) || (Number(wall.heightCells) || 1) * cellSize;
        });
    }

    static bounds(cells) {
        const points = [...cells].map(BuildKeys.parseCell);
        const xs = points.map(point => point.x);
        const ys = points.map(point => point.y);
        const left = Math.min(...xs);
        const top = Math.min(...ys);
        const right = Math.max(...xs) + 1;
        const bottom = Math.max(...ys) + 1;
        return { left, top, right, bottom, width: right - left, height: bottom - top };
    }

    static sorted(cells) {
        return [...cells].sort(RoofGeometry.compareKeys);
    }

    static compareKeys(left, right) {
        const a = BuildKeys.parseCell(left);
        const b = BuildKeys.parseCell(right);
        return a.y - b.y || a.x - b.x;
    }
}
