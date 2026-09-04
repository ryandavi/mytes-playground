class WallCellStore extends BuildRecordStore {
    keyOf(record) {
        return BuildKeys.cell(record?.x, record?.y);
    }

    normalize(record, key) {
        const point = Number.isInteger(record?.x) && Number.isInteger(record?.y)
            ? { x: record.x, y: record.y }
            : BuildKeys.parseCell(key);
        if (!record?.constructionId) throw new Error(`Wall cell ${key} requires constructionId`);
        const heightCells = Number(record.heightCells);
        if (!Number.isFinite(heightCells) || heightCells <= 0) throw new Error(`Wall cell ${key} requires a positive heightCells`);
        return {
            x: point.x,
            y: point.y,
            constructionId: String(record.constructionId),
            heightCells,
            connectGroup: String(record.connectGroup || record.constructionId),
            buildingId: record.buildingId == null ? null : String(record.buildingId),
            ...(record.bridged === true ? { bridged: true } : {}),
            ...(record.opening ? { opening: StoreDelta.clone(record.opening) } : {})
        };
    }

    setCell(x, y, record, options = {}) {
        const buildingId = record.buildingId ?? options.inheritBuildingId ?? null;
        return this.set(BuildKeys.cell(x, y), { ...record, x, y, buildingId });
    }
}
