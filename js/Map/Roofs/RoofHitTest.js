class RoofHitTest {
    constructor(renderer) {
        this.renderer = renderer;
    }

    atMapPoint(x, y) {
        if (!this.renderer?.isPresentationVisible()) return null;
        const cellSize = this.renderer.cellSize;
        const records = [...this.renderer.sections.values()].sort((a, b) => b.zIndex - a.zIndex);
        for (const record of records) {
            if (record.canvas.hidden) continue;
            const localX = x - record.left;
            const localY = y - record.top;
            if (localX < 0 || localY < 0 || localX >= record.width || localY >= record.height) continue;
            const cellX = Math.floor(localX / cellSize) + record.geometry.bounds.left;
            const cellY = Math.floor(localY / cellSize) + record.geometry.bounds.top;
            const key = BuildKeys.cell(cellX, cellY);
            if (!record.geometry.cells.has(key)) continue;
            return Object.freeze({
                kind: 'roof', buildingId: record.plan.buildingId,
                roofPlanId: record.plan.id, sectionKey: record.geometry.key, cellKey: key
            });
        }
        return null;
    }
}
