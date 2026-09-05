class RoofPlanStore extends BuildRecordStore {
    static STYLES = Object.freeze(['flat', 'hip', 'gable']);
    static RIDGE_AXES = Object.freeze(['auto', 'x', 'y']);
    static VISIBILITIES = Object.freeze(['auto', 'shown', 'hidden']);

    static id(buildingId, levelId = 'level_ground') {
        return `${String(buildingId)}@${String(levelId)}`;
    }

    static create(buildingId, defaults = {}, levelId = 'level_ground') {
        return {
            id: RoofPlanStore.id(buildingId, levelId),
            buildingId,
            levelId,
            style: defaults.style || 'flat',
            ridgeAxis: defaults.ridgeAxis || 'auto',
            finishId: defaults.finishId || null,
            colorId: defaults.colorId || null,
            overhangCells: Number(defaults.overhangCells) === 1 ? 1 : 0,
            visibility: defaults.visibility || 'auto',
            excludedCells: [],
            properties: {}
        };
    }

    keyOf(record) {
        return String(record?.id || RoofPlanStore.id(record?.buildingId, record?.levelId || 'level_ground'));
    }

    normalize(record, key) {
        if (!record?.buildingId) throw new Error(`Roof plan ${key} requires buildingId`);
        const levelId = String(record.levelId || 'level_ground');
        const style = RoofPlanStore.STYLES.includes(record.style) ? record.style : 'flat';
        const ridgeAxis = RoofPlanStore.RIDGE_AXES.includes(record.ridgeAxis) ? record.ridgeAxis : 'auto';
        const visibility = RoofPlanStore.VISIBILITIES.includes(record.visibility) ? record.visibility : 'auto';
        return {
            id: String(record.id || RoofPlanStore.id(record.buildingId, levelId)),
            buildingId: String(record.buildingId),
            levelId,
            style,
            ridgeAxis,
            finishId: record.finishId == null ? null : String(record.finishId),
            colorId: record.colorId == null ? null : String(record.colorId),
            overhangCells: Number(record.overhangCells) === 1 ? 1 : 0,
            visibility,
            excludedCells: RoomPlanStore.normalizeSeeds(Array.isArray(record.excludedCells)
                ? record.excludedCells : String(record.excludedCells || '').split(/\s+/).filter(Boolean)),
            properties: StoreDelta.clone(record.properties || {})
        };
    }

    forBuilding(buildingId, levelId = 'level_ground') {
        return this.get(RoofPlanStore.id(buildingId, levelId));
    }
}
