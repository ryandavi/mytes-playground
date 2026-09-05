class RoomPlanStore extends BuildRecordStore {
    static ORIGINS = Object.freeze(['authored', 'detected', 'painted']);

    // Room kinds briefly had ids of their own before they were folded into the
    // zone vocabulary the AI reads. A save written in between holds one of
    // these, which no dropdown offers and nothing acts on; it is the same room
    // under both names, so it is renamed on the way in rather than kept as a
    // "(custom)" value the player cannot pick again.
    static LEGACY_TYPES = Object.freeze({
        bedroom: 'rest', kitchen: 'food', living: 'social', playroom: 'play'
    });

    keyOf(record) {
        if (!record?.id) throw new Error('Room plans require an id');
        return String(record.id);
    }

    normalize(record, key) {
        const id = String(record?.id || key || '');
        if (!id) throw new Error('Room plans require an id');
        const displayName = String(record.displayName || record.authoredDisplayName || id);
        const origin = RoomPlanStore.ORIGINS.includes(record.origin) ? record.origin : 'authored';
        return {
            id,
            buildingId: record.buildingId == null ? null : String(record.buildingId),
            displayName,
            authoredDisplayName: String(record.authoredDisplayName || displayName),
            roomType: RoomPlanStore.LEGACY_TYPES[record.roomType] || record.roomType || null,
            // An index into the room-colour wheel, when the player has picked
            // one. Null means the automatic colour derived from the id, which
            // is what every room gets until someone disagrees with it.
            colourIndex: Number.isInteger(record.colourIndex) ? record.colourIndex : null,
            origin,
            seedCells: RoomPlanStore.normalizeSeeds(record.seedCells),
            floorFinishId: record.floorFinishId || null,
            wallFinishId: record.wallFinishId || null,
            priority: Number.isFinite(record.priority) ? record.priority : null,
            properties: StoreDelta.clone(record.properties || {})
        };
    }

    ownerOfSeed(cellKey) {
        const { x, y } = BuildKeys.parseCell(cellKey);
        const key = BuildKeys.cell(x, y);
        return this.entries().find(([, room]) => room.seedCells.includes(key))?.[0] || null;
    }

    assignSeed(roomId, cellKey) {
        const targetId = String(roomId);
        if (!this.has(targetId)) throw new Error(`Unknown room plan: ${targetId}`);
        const key = RoomPlanStore.normalizeSeeds([cellKey])[0];
        for (const [id, room] of this.entries()) {
            const seedCells = room.seedCells.filter(existing => existing !== key);
            if (id === targetId) seedCells.push(key);
            if (seedCells.length !== room.seedCells.length || id === targetId) this.set(id, { ...room, seedCells });
        }
        return this.get(targetId);
    }

    removeSeed(roomId, cellKey) {
        const room = this.get(roomId);
        if (!room) return false;
        const key = RoomPlanStore.normalizeSeeds([cellKey])[0];
        const seedCells = room.seedCells.filter(existing => existing !== key);
        if (seedCells.length === room.seedCells.length) return false;
        this.set(room.id, { ...room, seedCells });
        return true;
    }

    static normalizeSeeds(seedCells = []) {
        return [...new Set(seedCells.map(key => {
            if (Array.isArray(key)) return BuildKeys.cell(key[0], key[1]);
            const { x, y } = BuildKeys.parseCell(key);
            return BuildKeys.cell(x, y);
        }))].sort((a, b) => {
            const left = BuildKeys.parseCell(a);
            const right = BuildKeys.parseCell(b);
            return left.y - right.y || left.x - right.x;
        });
    }
}
