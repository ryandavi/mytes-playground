class RoomEnclosureDetector {
    constructor(gameMap) {
        this.gameMap = gameMap;
        this._timer = null;
        this._unsubscribers = [];
        this.subscribe();
    }

    subscribe() {
        const events = this.gameMap?.eventManager;
        if (!events) return;

        const scheduleForMap = payload => {
            if (!payload?.mapId || payload.mapId === this.gameMap?.id) this.schedule();
        };
        this._unsubscribers.push(events.on(EVENTS.WALL_READY, scheduleForMap));
        this._unsubscribers.push(events.on(EVENTS.WALL_GEOMETRY_CHANGED, scheduleForMap));
        // Painting a cell into a room changes which room it is in without
        // changing a single wall, so it has to drive the same recompute —
        // otherwise the paint does nothing until you next touch masonry.
        this._unsubscribers.push(events.on(EVENTS.ROOM_ASSIGNMENTS_CHANGED, scheduleForMap));
    }

    schedule() {
        if (SiteConfig.rooms?.autoDetect !== true || this._timer !== null) return;
        this._timer = setTimeout(() => {
            this._timer = null;
            this.detect();
        }, 0);
    }

    detect() {
        const wallBuilder = this.gameMap?.wallBuilder;
        const grid = this.gameMap?.gridSystem;
        const regionManager = this.gameMap?.regionManager;
        if (!wallBuilder || !grid || !regionManager) return [];

        const width = Number(grid.gridWidth) || 0;
        const height = Number(grid.gridHeight) || 0;
        if (width <= 0 || height <= 0) return [];

        // Paint under a wall means nothing, and left in place it would spring
        // back the day that wall came down.
        this.gameMap.roomAssignments?.prune({ emit: false });

        const wallKeys = new Set([
            ...wallBuilder.baseCells.keys(),
            ...wallBuilder.openingByCell.keys()
        ]);
        const keyOf = (x, y) => `${x},${y}`;
        const isOpen = (x, y) => x >= 0 && y >= 0 && x < width && y < height && !wallKeys.has(keyOf(x, y));
        const neighbors = (x, y) => [
            [x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]
        ];

        const exterior = new Set();
        const exteriorQueue = [];
        const enqueueExterior = (x, y) => {
            const key = keyOf(x, y);
            if (!isOpen(x, y) || exterior.has(key)) return;
            exterior.add(key);
            exteriorQueue.push([x, y]);
        };

        for (let x = 0; x < width; x++) {
            enqueueExterior(x, 0);
            enqueueExterior(x, height - 1);
        }
        for (let y = 0; y < height; y++) {
            enqueueExterior(0, y);
            enqueueExterior(width - 1, y);
        }
        for (let index = 0; index < exteriorQueue.length; index++) {
            const [x, y] = exteriorQueue[index];
            for (const [nextX, nextY] of neighbors(x, y)) enqueueExterior(nextX, nextY);
        }

        const authoredRooms = regionManager.all('room').filter(room => room.properties?.autoDetected !== true);
        const minArea = Math.max(1, Number(SiteConfig.rooms?.minAreaCells) || 1);
        const cellSize = Number(grid.config?.cellSize) || 32;

        const components = this.floodComponents(isOpen, exterior, width, height);
        const enclosed = components.filter(component => component.length >= minArea);

        // Which room every open cell is in, in two passes: what the walls say,
        // then what the player said. The second overrules the first, and only
        // where they actually painted — everywhere else the building decides,
        // which is what keeps this from becoming a map you have to colour in
        // before it works.
        const claims = this.claimComponents(enclosed, authoredRooms, cellSize);
        const owners = this.assignByEnclosure(enclosed, claims, cellSize);
        // Read before anything is re-shaped: a painted room inherits from
        // whatever its cells belonged to a moment ago, and re-cutting the rooms
        // first would leave it inheriting from nobody.
        const previousOwner = (cellX, cellY) => regionManager.innermostAt(
            (cellX + 0.5) * cellSize, (cellY + 0.5) * cellSize, 'room', cellSize
        );
        // What the walls decided, kept before the paint goes over it: a room
        // whose cells are ALL outside it is a room nothing encloses, and that
        // is how an outdoor one is recognised further down.
        const enclosedKeys = new Set(owners.keys());
        const painted = new Map();
        for (const [key, roomId] of this.gameMap.roomAssignments?.cells ?? []) {
            const [cellX, cellY] = key.split(',').map(Number);
            // Only masonry and the edge of the map are refused now. Painted
            // cells used to need a roof over them as well — anything the fill
            // called exterior was dropped on the floor here, so painting a
            // patio, a fenced yard, or the three tiles inside a shed too small
            // to count as a room played the paint sound, wrote an undo entry,
            // and then quietly did nothing at all. A room is what the player
            // says it is; the walls are only the default.
            if (!isOpen(cellX, cellY)) continue;
            if (!painted.has(roomId)) painted.set(roomId, previousOwner(cellX, cellY));
            owners.set(key, roomId);
        }

        const cellsByRoom = new Map();
        for (const [key, roomId] of owners) {
            if (!cellsByRoom.has(roomId)) cellsByRoom.set(roomId, []);
            cellsByRoom.get(roomId).push(key.split(',').map(Number));
        }

        for (const existing of regionManager.all('room')) {
            if (existing.properties?.autoDetected === true) regionManager.remove(existing);
        }

        const lighting = Utility.deepClone(this.gameMap.environmentManager?.getRoomDefaults?.() || {});
        const added = [];
        for (const [roomId, cells] of cellsByRoom) {
            const shape = { kind: 'tilemask', cells, cellSize };
            const authored = authoredRooms.find(room => room.id === roomId);
            if (authored) {
                // The rectangle in the map file says WHICH room this is and
                // carries its name and finishes. Where it is comes from the
                // walls, so that moving one takes the room with it.
                authored.shape = SpatialRegion.normalizeShape(shape);
                authored.bounds = authored.shape.bounds;
                continue;
            }
            const parent = painted.get(roomId) ?? this.roomDividedBy(cells, cellSize);
            const number = added.length + 1;
            // Nothing enclosing any of it: an outdoor room. It is still a room
            // — it has a floor, a name, a type, and a place in the list — but
            // it is not somewhere you are inside, so it takes no interior
            // gloom and a Myte standing in it is still out of doors. Called an
            // Area rather than a Room so the list says which kind it is
            // without anybody having to explain the difference.
            const indoor = cells.some(([cellX, cellY]) => enclosedKeys.has(`${cellX},${cellY}`));
            const placeholder = indoor ? `Room ${number}` : `Area ${number}`;
            added.push(regionManager.add(new SpatialRegion({
                id: roomId,
                layer: 'room',
                shape,
                properties: {
                    // A placeholder until the player names it; numbered so two
                    // new rooms are at least tellable apart.
                    displayName: placeholder,
                    authoredDisplayName: placeholder,
                    indoor,
                    autoDetected: true,
                    // Dividing a room does not redecorate it. A new room with no
                    // finishes came up in bare plaster with the map's own ground
                    // showing through, so splitting a space you had already
                    // decorated undid the decorating — and the seam where the
                    // new room met the old one was the first thing you saw.
                    // Inheriting means a new room looks like it was always
                    // there, and repainting it is a choice rather than a repair.
                    wallFinishId: parent?.properties?.wallFinishId ?? null,
                    floorFinishId: parent?.properties?.floorFinishId ?? null,
                    lighting: Utility.deepClone(parent?.properties?.lighting ?? lighting)
                },
                source: this
            })));
        }

        // An authored room whose ground has ALL been taken — walled over, or
        // painted into the room next door — is emptied rather than left holding
        // the shape it used to have.
        //
        // Leaving it was the bug that made the whole tool look broken: paint the
        // Chatroom into the Kitchen and the Kitchen grew to 370 tiles, but the
        // Chatroom went on claiming the same 185 it always had. Being the
        // smaller of the two overlapping rooms, it then won every innermostAt on
        // that floor — so the floor, the wall faces and the panel all still said
        // Chatroom, and the paint appeared to do nothing at all.
        //
        // It keeps its id, its name and its finishes, because it is still a room
        // in the map file and painting tiles back into it must bring it back.
        for (const room of authoredRooms) {
            if (cellsByRoom.has(room.id)) continue;
            room.shape = SpatialRegion.normalizeShape({ kind: 'tilemask', cells: [], cellSize });
            room.bounds = room.shape.bounds;
        }

        this.assignOpenSpaces(components, cellSize);

        for (const myte of this.gameMap.mytes || []) {
            regionManager.updateMembership(myte, { layers: ['room'], force: true });
        }
        // Before the floors and the walls are rebuilt: both read room ids, and
        // the room set has only just changed under them.
        this.gameMap.wallBuilder?.refreshRoomFaces?.();
        this.gameMap.floorBuilder?.build();
        this.gameMap.container?.worldState?.restoreRooms?.(this.gameMap);
        this.gameMap.buildDoorRoomTopology();
        this.gameMap.environmentManager?.rebuildWindowLighting();
        if (this.gameMap.environmentManager) {
            this.gameMap.environmentManager._lightingSignature = '';
            this.gameMap.environmentManager.renderLighting(true);
        }

        // Last, once every consumer above has caught up: the room set is what
        // the build tools draw, and telling them earlier would have them paint
        // rooms whose floors did not exist yet.
        this.gameMap.eventManager?.emit(EVENTS.ROOMS_CHANGED, {
            mapId: this.gameMap.id,
            rooms: this.gameMap.regionManager?.all('room') ?? []
        });

        return added;
    }

    /**
     * Every enclosed area of open floor, as a list of cells.
     *
     * Seeding `visited` with the exterior is what keeps the outdoors from
     * coming back as a room: it is one place, and it is decided first.
     * @returns {Array<Array<[number, number]>>}
     */
    floodComponents(isOpen, exterior, width, height) {
        const visited = new Set(exterior);
        const components = [];
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                if (!isOpen(x, y) || visited.has(`${x},${y}`)) continue;
                const component = [];
                const queue = [[x, y]];
                visited.add(`${x},${y}`);
                for (let index = 0; index < queue.length; index++) {
                    const [cellX, cellY] = queue[index];
                    component.push([cellX, cellY]);
                    for (const [nextX, nextY] of [
                        [cellX - 1, cellY], [cellX + 1, cellY], [cellX, cellY - 1], [cellX, cellY + 1]
                    ]) {
                        const nextKey = `${nextX},${nextY}`;
                        if (!isOpen(nextX, nextY) || visited.has(nextKey)) continue;
                        visited.add(nextKey);
                        queue.push([nextX, nextY]);
                    }
                }
                components.push(component);
            }
        }
        return components;
    }

    /**
     * Which authored rooms live in which enclosed area.
     *
     * Each authored room is matched to the ONE component holding most of it.
     * Everything else is a space the player made, including a space made
     * *inside* an authored one: walling off a corner of the Kitchen used to
     * produce a component that merely intersected the Kitchen and was thrown
     * away on that basis, so the new room could never be selected or given a
     * floor of its own.
     *
     * A component can be claimed by more than one room, and that is not a
     * mistake — two authored rooms opening onto each other with nothing between
     * them is one space and two rooms, which is the whole open-plan case.
     * @returns {Map<Array, Array<SpatialRegion>>} component -> rooms in it
     */
    claimComponents(components, authoredRooms, cellSize) {
        const claims = new Map();
        for (const room of authoredRooms) {
            const authored = RoomEnclosureDetector.authoredGeometry(room);
            let best = null;
            let bestCount = 0;
            for (const component of components) {
                const count = component.reduce((total, [cellX, cellY]) => total + (
                    RoomEnclosureDetector.shapeContains(authored.shape, authored.bounds,
                        (cellX + 0.5) * cellSize, (cellY + 0.5) * cellSize) ? 1 : 0), 0);
                if (count > bestCount) {
                    bestCount = count;
                    best = component;
                }
            }
            if (!best) continue;
            if (!claims.has(best)) claims.set(best, []);
            claims.get(best).push(room);
        }
        return claims;
    }

    /**
     * Which room every open cell belongs to, before the player has their say.
     *
     * A room authored in Tiled is a rectangle, and a rectangle stops being the
     * truth the moment anybody builds. Move a wall one cell and the rectangle
     * stays where it was: the column of floor the room just gained belongs to no
     * room at all, so it takes its finish from whichever neighbour bleeds
     * furthest and comes out seamed down the middle. Wall off a corner and the
     * rectangle still covers the new room's walls from the outside.
     *
     * Taking the shape from the enclosure instead makes "a room is what its
     * walls enclose" true rather than nearly true, and every system downstream —
     * floors, wall faces, lighting, the cutaway — already asks the room where it
     * is. The authored rectangle keeps doing the one job it is good at: saying
     * WHICH room this is, and carrying the name and finishes the player gave it.
     *
     * Where several rooms share one space the cells are split between them by
     * the rectangles, because that is the only statement of intent available —
     * and a cell inside none of them goes to the nearest, so an open-plan space
     * is covered completely however the rectangles were drawn.
     */
    assignByEnclosure(components, claims, cellSize) {
        const owners = new Map();
        let unclaimed = 0;
        for (const component of components) {
            const rooms = claims.get(component);
            if (!rooms) {
                // Nobody's room yet — a space the player has just enclosed. It
                // gets an id here so the pass that materialises rooms treats it
                // exactly like every other one.
                const id = `room_auto_${++unclaimed}`;
                for (const [cellX, cellY] of component) owners.set(`${cellX},${cellY}`, id);
                continue;
            }
            const authored = rooms.map(room => ({ room, ...RoomEnclosureDetector.authoredGeometry(room) }));
            for (const [cellX, cellY] of component) {
                const owner = RoomEnclosureDetector.pickAuthoredRoom(
                    authored, (cellX + 0.5) * cellSize, (cellY + 0.5) * cellSize, cellSize
                );
                if (owner) owners.set(`${cellX},${cellY}`, owner.id);
            }
        }
        return owners;
    }

    /**
     * Which of the rooms sharing a space owns one cell: the smallest whose
     * authored rectangle holds it, or failing that the nearest one.
     *
     * Nearest by rectangle, not by centre — a long room and a square one meeting
     * in an L both reach the corner between them, and comparing centres would
     * hand it to whichever happened to be more compact.
     */
    static pickAuthoredRoom(authored, x, y, cellSize) {
        const inside = authored
            .filter(entry => RoomEnclosureDetector.shapeContains(entry.shape, entry.bounds, x, y))
            .reduce((smallest, entry) => !smallest ||
                RoomEnclosureDetector.shapeArea(entry, cellSize) <
                RoomEnclosureDetector.shapeArea(smallest, cellSize) ? entry : smallest, null);
        if (inside) return inside.room;

        let nearest = null;
        let bestDistance = Infinity;
        for (const entry of authored) {
            const bounds = entry.bounds;
            const dx = Math.max(bounds.x - x, 0, x - (bounds.x + bounds.width));
            const dy = Math.max(bounds.y - y, 0, y - (bounds.y + bounds.height));
            const distance = (dx * dx) + (dy * dy);
            if (distance < bestDistance) {
                bestDistance = distance;
                nearest = entry;
            }
        }
        return nearest?.room ?? null;
    }

    /**
     * The shape a room was AUTHORED with, kept apart from the shape it is
     * currently wearing.
     *
     * Every pass re-cuts a room to the ground its walls enclose, which is what
     * makes rooms follow the building. Claiming has to work off the original
     * rectangle instead, or the room can only ever shrink: give its floor away
     * and its derived shape becomes empty, an empty shape contains nothing,
     * and it can never match a component again — so "reset to walls" handed the
     * ground to a brand new room instead of back to the one it came from.
     */
    static authoredGeometry(room) {
        room.authoredShape ??= room.shape;
        return { shape: room.authoredShape, bounds: room.authoredShape.bounds };
    }

    static shapeContains(shape, bounds, x, y) {
        if (shape?.kind === 'tilemask') {
            const size = shape.cellSize || 32;
            return shape.cells.has(`${Math.floor(x / size)},${Math.floor(y / size)}`);
        }
        return x >= bounds.x && x <= bounds.x + bounds.width &&
            y >= bounds.y && y <= bounds.y + bounds.height;
    }

    static shapeArea(entry, cellSize) {
        if (entry.shape?.kind === 'tilemask') return entry.shape.cells.size;
        return (entry.bounds.width * entry.bounds.height) / (cellSize * cellSize);
    }

    /**
     * The room a newly enclosed area was taken out of, if it was taken out of
     * one — the space whose ground these cells stood on a moment ago.
     *
     * Innermost, and decided by where the new cells actually are rather than by
     * bounds containment: partition a room that is itself inside another and
     * the new room should take after its immediate parent, not the outermost
     * one it happens to sit within. A room built across the line where two
     * spaces meet belongs to neither cleanly, so the one holding most of it
     * wins — the same "most of it" rule claimComponents matches on.
     * @returns {SpatialRegion|null}
     */
    roomDividedBy(cells, cellSize) {
        const tally = new Map();
        for (const [cellX, cellY] of cells) {
            const room = this.gameMap.regionManager?.innermostAt(
                (cellX + 0.5) * cellSize, (cellY + 0.5) * cellSize, 'room', cellSize
            );
            if (room) tally.set(room, (tally.get(room) || 0) + 1);
        }
        return [...tally.entries()].reduce((best, entry) =>
            !best || entry[1] > best[1] ? entry : best, null)?.[0] ?? null;
    }

    /**
     * Stamps every room with the id of the enclosed area it belongs to.
     *
     * Two rooms only share one when nothing walls them apart — the fill treats
     * wall cells AND openings as solid, so a doorway between two rooms keeps
     * them separate, while a half-height divider or a wall that stops short
     * leaves them as one space. That is the distinction the cutaway needs: a
     * wall bounding one open area belongs to all of it, so standing anywhere
     * inside lowers the whole run rather than the half whose far side happens
     * to be the room you are standing in.
     */
    assignOpenSpaces(components, cellSize) {
        const rooms = this.gameMap?.regionManager?.all('room') || [];
        for (const room of rooms) room.properties.openSpaceId = null;
        components.forEach((cells, index) => {
            const id = `open_${index + 1}`;
            for (const room of rooms) {
                if (room.properties.openSpaceId) continue;
                const inside = cells.some(([cellX, cellY]) =>
                    room.contains((cellX + 0.5) * cellSize, (cellY + 0.5) * cellSize));
                if (inside) room.properties.openSpaceId = id;
            }
        });
        return rooms;
    }

    dispose() {
        if (this._timer !== null) clearTimeout(this._timer);
        this._timer = null;
        this._unsubscribers.forEach(unsubscribe => unsubscribe());
        this._unsubscribers = [];
        this.gameMap = null;
    }
}
