class BuildDocument {
    static VERSION = 8;
    static DEFAULT_LEVEL_ID = 'level_ground';
    static LEVEL_STORES = Object.freeze(['walls', 'atoms', 'rooms', 'openings', 'fixtures', 'attachments']);

    constructor(authored = {}) {
        this.buildings = new BuildingPlanStore(authored.buildings || []);
        this.levels = {};
        const levels = authored.levels || { [BuildDocument.DEFAULT_LEVEL_ID]: authored };
        for (const [levelId, level] of Object.entries(levels)) this.levels[levelId] = this.createLevel(level);
        if (!this.levels[BuildDocument.DEFAULT_LEVEL_ID]) this.levels[BuildDocument.DEFAULT_LEVEL_ID] = this.createLevel({});
        this.authored = this.captureStores();
    }

    static fromMapData(mapData = {}) {
        const walls = BuildDocument.collectWallCells(mapData.walls || {});
        const wallGeometry = WallGeometry.compute(new Map(walls.map(cell => [BuildKeys.cell(cell.x, cell.y), cell])));
        const buildingData = BuildDocument.collectBuildings(mapData, walls);
        const defaultBuildingId = BuildDocument.slug(`${mapData.id || 'map'}_building`);
        const fallbackBuildingId = buildingData.find(building => building.id === defaultBuildingId)?.id ||
            (buildingData.length === 1 ? buildingData[0].id : null);
        const rooms = BuildDocument.collectRooms(mapData, wallGeometry, fallbackBuildingId);
        BuildDocument.applyAuthoredAssignments(
            rooms, mapData.walls?.roomAssignments || {}, fallbackBuildingId, wallGeometry
        );
        return new BuildDocument({
            buildings: buildingData,
            levels: {
                [BuildDocument.DEFAULT_LEVEL_ID]: {
                    walls: walls.map(cell => ({
                        x: cell.x,
                        y: cell.y,
                        constructionId: cell.constructionId || mapData.walls?.defaults?.constructionId,
                        heightCells: Number(cell.heightCells) || Number(mapData.walls?.defaults?.heightCells) || 1,
                        connectGroup: cell.connectGroup || mapData.walls?.defaults?.connectGroup,
                        buildingId: BuildDocument.buildingIdFor(cell, buildingData, fallbackBuildingId),
                        ...(cell.bridged === true ? { bridged: true } : {})
                    })),
                    atoms: BuildDocument.collectAtoms(mapData.walls?.faceOverrides || []),
                    rooms,
                    openings: mapData.walls?.openings || [],
                    fixtures: mapData.walls?.fixtures || [],
                    attachments: mapData.walls?.attachments || []
                }
            }
        });
    }

    static collectWallCells(wallData) {
        const defaults = wallData.defaults || {};
        const cells = new Map((wallData.cells || []).map(cell => [BuildKeys.cell(cell.x, cell.y), { ...cell }]));
        for (const opening of wallData.openings || []) for (const point of opening.cells || []) {
            const [x, y] = Array.isArray(point) ? point : [point?.x, point?.y];
            if (!Number.isInteger(x) || !Number.isInteger(y)) continue;
            const key = BuildKeys.cell(x, y);
            if (!cells.has(key)) cells.set(key, { ...defaults, x, y, bridged: true });
        }
        return [...cells.values()];
    }

    createLevel(level = {}) {
        return {
            walls: new WallCellStore(level.walls || []),
            atoms: new WallSurfaceAtomStore(level.atoms || []),
            rooms: new RoomPlanStore(level.rooms || []),
            openings: new AttachmentStore(level.openings || []),
            fixtures: new AttachmentStore(level.fixtures || []),
            attachments: new AttachmentStore(level.attachments || [])
        };
    }

    level(levelId = BuildDocument.DEFAULT_LEVEL_ID) {
        const level = this.levels[levelId];
        if (!level) throw new Error(`Unknown build level: ${levelId}`);
        return level;
    }

    captureStores() {
        return {
            buildings: this.buildings.snapshot(),
            levels: Object.fromEntries(Object.entries(this.levels).map(([levelId, level]) => [levelId,
                Object.fromEntries(BuildDocument.LEVEL_STORES.map(name => [name, level[name].snapshot()]))
            ]))
        };
    }

    serialize() {
        return {
            version: BuildDocument.VERSION,
            buildings: StoreDelta.diff(this.authored.buildings, this.buildings),
            levels: Object.fromEntries(Object.entries(this.levels).map(([levelId, level]) => [levelId,
                Object.fromEntries(BuildDocument.LEVEL_STORES.map(name => [
                    name, StoreDelta.diff(this.authored.levels[levelId]?.[name], level[name])
                ]))
            ])),
            presentation: StoreDelta.clone(this.presentation || {})
        };
    }

    restore(payload, options = {}) {
        this.reset();
        if (!payload) return { restored: false, reset: false };
        if (Number(payload.version) <= 7) {
            options.onLegacyReset?.('Build edits were reset for the new build system');
            return { restored: false, reset: true };
        }
        if (Number(payload.version) !== BuildDocument.VERSION) {
            throw new Error(`Unsupported build document version: ${payload.version}`);
        }
        this.buildings.applyDelta(payload.buildings);
        for (const [levelId, levelDelta] of Object.entries(payload.levels || {})) {
            if (!this.levels[levelId]) this.levels[levelId] = this.createLevel({});
            for (const name of BuildDocument.LEVEL_STORES) this.levels[levelId][name].applyDelta(levelDelta[name]);
        }
        this.presentation = StoreDelta.clone(payload.presentation || {});
        return { restored: true, reset: false };
    }

    reset() {
        this.buildings.replace(this.authored.buildings);
        for (const levelId of Object.keys(this.levels)) {
            if (!this.authored.levels[levelId]) delete this.levels[levelId];
        }
        for (const [levelId, stores] of Object.entries(this.authored.levels)) {
            if (!this.levels[levelId]) this.levels[levelId] = this.createLevel({});
            for (const name of BuildDocument.LEVEL_STORES) this.levels[levelId][name].replace(stores[name]);
        }
        this.presentation = {};
    }

    replaceCurrent(snapshot) {
        this.buildings.replace(snapshot.buildings || {});
        for (const levelId of Object.keys(this.levels)) {
            if (!snapshot.levels?.[levelId]) delete this.levels[levelId];
        }
        for (const [levelId, stores] of Object.entries(snapshot.levels || {})) {
            if (!this.levels[levelId]) this.levels[levelId] = this.createLevel({});
            for (const name of BuildDocument.LEVEL_STORES) this.levels[levelId][name].replace(stores[name] || {});
        }
        return this;
    }

    static collectBuildings(mapData, walls) {
        const names = new Map();
        const add = (id, displayName) => {
            const normalizedId = BuildDocument.slug(id || displayName);
            if (normalizedId) names.set(normalizedId, String(displayName || id));
        };
        for (const wall of walls) if (wall.buildingId || wall.buildingName) add(wall.buildingId || wall.buildingName, wall.buildingName || wall.buildingId);
        for (const room of mapData.environment?.rooms || []) {
            const props = room.properties || {};
            if (props.buildingId || props.buildingName) add(props.buildingId || props.buildingName, props.buildingName || props.buildingId);
        }
        if (walls.some(wall => !wall.buildingId && !wall.buildingName)) {
            add(mapData.properties?.buildingId || `${mapData.id || 'map'}_building`,
                mapData.properties?.buildingName || mapData.displayName || mapData.name || 'Building');
        }
        return [...names].map(([id, displayName]) => ({
            id,
            displayName,
            authoredDisplayName: displayName,
            exteriorFinishId: mapData.properties?.exteriorWallFinishId || null,
            properties: {}
        }));
    }

    static collectRooms(mapData, geometry, fallbackBuildingId) {
        const cellSize = Number(mapData.tileWidth) || 32;
        return (mapData.environment?.rooms || []).map(source => {
            const props = source.properties || {};
            const id = String(source.id || props.roomId || BuildDocument.slug(source.displayName));
            return {
                id,
                buildingId: props.buildingId ? BuildDocument.slug(props.buildingId) :
                    props.buildingName ? BuildDocument.slug(props.buildingName) : fallbackBuildingId,
                displayName: source.displayName || props.displayName || id,
                authoredDisplayName: source.displayName || props.displayName || id,
                roomType: props.roomType || props.zoneType || null,
                origin: 'authored',
                seedCells: BuildDocument.seedCellsForRoom(source, cellSize)
                    .filter(key => !geometry.cells.has(key) && !geometry.thresholds.has(key)),
                floorFinishId: props.floorFinishId || null,
                wallFinishId: props.wallFinishId || null,
                priority: Number.isFinite(props.priority) ? props.priority : null,
                properties: StoreDelta.clone(props)
            };
        });
    }

    static seedCellsForRoom(room, cellSize) {
        if (Array.isArray(room.tilemask?.cells)) return RoomPlanStore.normalizeSeeds(room.tilemask.cells);
        const bounds = room.bounds || {};
        const x0 = Math.floor((Number(bounds.x) || 0) / cellSize);
        const y0 = Math.floor((Number(bounds.y) || 0) / cellSize);
        const x1 = Math.ceil(((Number(bounds.x) || 0) + (Number(bounds.width) || 0)) / cellSize) - 1;
        const y1 = Math.ceil(((Number(bounds.y) || 0) + (Number(bounds.height) || 0)) / cellSize) - 1;
        const polygon = Array.isArray(room.polygon) ? room.polygon.map(point => ({
            x: (Number(bounds.x) || 0) + (Number(point.x) || 0),
            y: (Number(bounds.y) || 0) + (Number(point.y) || 0)
        })) : null;
        const cells = [];
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
            const px = (x + 0.5) * cellSize;
            const py = (y + 0.5) * cellSize;
            if (!polygon || BuildDocument.pointInPolygon(px, py, polygon)) cells.push(BuildKeys.cell(x, y));
        }
        return cells;
    }

    static applyAuthoredAssignments(rooms, assignments, fallbackBuildingId, geometry) {
        for (const [key, roomIdValue] of Object.entries(assignments)) {
            if (geometry.cells.has(key) || geometry.thresholds.has(key)) continue;
            const roomId = String(roomIdValue);
            let room = rooms.find(candidate => candidate.id === roomId);
            if (!room) {
                room = { id: roomId, buildingId: fallbackBuildingId, displayName: roomId,
                    authoredDisplayName: roomId, roomType: null, origin: 'authored', seedCells: [],
                    floorFinishId: null, wallFinishId: null, priority: null, properties: {} };
                rooms.push(room);
            }
            for (const candidate of rooms) candidate.seedCells = candidate.seedCells.filter(existing => existing !== key);
            room.seedCells.push(key);
        }
    }

    static collectAtoms(overrides) {
        const atoms = new Map();
        for (const override of overrides) {
            const from = override.cells?.from || [0, 0];
            const to = override.cells?.to || from;
            for (let y = Math.min(from[1], to[1]); y <= Math.max(from[1], to[1]); y++) {
                for (let x = Math.min(from[0], to[0]); x <= Math.max(from[0], to[0]); x++) {
                    for (const half of override.halves?.length ? override.halves : [0, 1]) {
                        const atom = { x, y, face: override.face, half, finishId: override.finishId };
                        atoms.set(BuildKeys.atom(x, y, override.face, half), atom);
                    }
                }
            }
        }
        return atoms;
    }

    static buildingIdFor(record, buildings, fallback) {
        const requested = record.buildingId || record.buildingName;
        if (!requested) return fallback;
        const id = BuildDocument.slug(requested);
        return buildings.some(building => building.id === id) ? id : fallback;
    }

    static slug(value) {
        return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
    }

    static pointInPolygon(x, y, points) {
        let inside = false;
        for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
            const a = points[i];
            const b = points[j];
            if (((a.y > y) !== (b.y > y)) && x < ((b.x - a.x) * (y - a.y)) / ((b.y - a.y) || Number.EPSILON) + a.x) inside = !inside;
        }
        return inside;
    }
}
