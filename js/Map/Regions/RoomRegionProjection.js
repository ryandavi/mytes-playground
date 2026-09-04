class RoomRegionProjection {
    static records(plans, grid, topology, cellSize = 32) {
        const values = plans?.values instanceof Function ? plans.values() : plans || [];
        return [...values].map(plan => {
            const state = topology.planStates.get(String(plan.id)) || {};
            return {
                id: String(plan.id),
                layer: 'room',
                shape: {
                    kind: 'tilemask',
                    cells: grid.cellsOf(String(plan.id)),
                    cellSize
                },
                properties: {
                    ...StoreDelta.clone(plan.properties || {}),
                    buildingId: plan.buildingId ?? null,
                    displayName: plan.displayName,
                    authoredDisplayName: plan.authoredDisplayName,
                    roomType: plan.roomType ?? null,
                    origin: plan.origin,
                    floorFinishId: plan.floorFinishId ?? null,
                    wallFinishId: plan.wallFinishId ?? null,
                    indoor: state.indoor === true,
                    openSpaceId: state.openSpaceId ?? null
                },
                source: plan
            };
        }).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    }

    static sync(regionManager, plans, grid, topology, cellSize = 32) {
        if (!regionManager) return [];
        for (const region of regionManager.all('room')) regionManager.remove(region);
        return RoomRegionProjection.records(plans, grid, topology, cellSize).map(record =>
            regionManager.add(new SpatialRegion(record))
        );
    }
}
