class BuildingPlanStore extends BuildRecordStore {
    keyOf(record) {
        if (!record?.id) throw new Error('Building plans require an id');
        return String(record.id);
    }

    normalize(record, key) {
        const id = String(record?.id || key || '');
        if (!id) throw new Error('Building plans require an id');
        const displayName = String(record.displayName || record.authoredDisplayName || id);
        return {
            id,
            displayName,
            authoredDisplayName: String(record.authoredDisplayName || displayName),
            buildingType: record.buildingType ? String(record.buildingType) : null,
            exteriorFinishId: record.exteriorFinishId || null,
            properties: StoreDelta.clone(record.properties || {})
        };
    }
}
