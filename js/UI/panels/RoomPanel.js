/**
 * RoomPanel — the rooms on this map, and the tool for changing them.
 *
 * These started as two things: a Room tool with a palette, and a Rooms list with
 * the names and sizes. Two panels, two buttons, and the same six rooms listed
 * twice — and picking a colour to paint with in one of them told you nothing
 * about which room on the map you had picked, which the other one would happily
 * have shown you. They were one thing all along.
 *
 * So: one row per room, and the row is everything. It is the name, the size, the
 * type, the swatch, the thing you hover to find it on the map, and the brush you
 * paint with. Selecting a room lights it up; painting puts floor into the room
 * that is lit up. There is nothing to learn beyond "click the room, then paint".
 *
 * Painting is how every change to a room's shape is made, because it is the only
 * gesture with an obvious meaning:
 *
 *   split   pick New Room, paint half of one
 *   merge   pick a room, paint the one next door with it
 *   grow    pick a room, paint the squares beside it
 *   undo it all   pick Reset, and the walls decide again
 */
class RoomPanel extends ModalWindow {
    // Twelve hues a person can name, evenly spaced round the wheel.
    static HUES = Object.freeze([8, 32, 52, 84, 140, 168, 194, 218, 250, 280, 310, 336]);

    constructor(parent) {
        super(parent, {
            id: 'room-panel',
            closeOnOutsideClick: false,
            position: 'top-right',
            draggable: true,
            closeButtonSelector: '.modal-close-btn'
        });
        this.drag = null;
        this.hoverKey = null;
        this.hoverEvent = null;
        // The room a stroke paints into: a room id, 'new', or null for Reset.
        this.selected = null;
        this.ghostElements = [];
        this.roomTints = [];
        this.highlight = null;
        this.boundPointerDown = this.handlePointerDown.bind(this);
        this.boundPointerMove = this.handlePointerMove.bind(this);
        this.boundPointerUp = this.handlePointerUp.bind(this);
        this.boundPointerLeave = this.clearHover.bind(this);
        this.boundRefresh = () => this.refresh();
        this.init();
        this.listElement = this.modalElement?.querySelector('.room-panel-list') || null;
        this.scrollContainer = this.modalElement?.querySelector('.window-panel__content') || null;
        this.newButton = this.modalElement?.querySelector('#room-new') || null;
        this.resetButton = this.modalElement?.querySelector('#room-reset') || null;
        this.newButton?.addEventListener('click', () => this.select('new'));
        this.resetButton?.addEventListener('click', () => this.confirmReset());
        this.parent?.parent?.canvas?.addEventListener('pointerdown', this.boundPointerDown, true);
        this.parent?.parent?.canvas?.addEventListener('pointerleave', this.boundPointerLeave);
        document.addEventListener('pointermove', this.boundPointerMove, true);
        document.addEventListener('pointerup', this.boundPointerUp, true);
        document.addEventListener('pointercancel', this.boundPointerUp, true);
        this._unsubscribers = [
            this.parent?.parent?.eventManager?.on(EVENTS.ROOMS_CHANGED, this.boundRefresh),
            this.parent?.parent?.eventManager?.on(EVENTS.SURFACE_FINISH_CHANGED, this.boundRefresh)
        ].filter(Boolean);
    }

    get gameMap() {
        return this.parent?.parent?.gameMap || null;
    }

    get assignments() {
        return this.gameMap?.roomAssignments || null;
    }

    get cellSize() {
        return this.gameMap?.gridSystem?.config?.cellSize || 32;
    }

    handleToolModeChanged(mode) {
        const active = mode === UIToolModes.ROOM;
        document.body.classList.toggle('room-build-mode', active);
        if (active) {
            this.open();
            this.refresh();
        } else {
            this.cancelDrag();
            this.clearHover();
            this.clearRoomTints();
            this.clearHighlight();
            super.close();
        }
    }

    close() {
        if (this.parent.isTool(UIToolModes.ROOM) &&
            this.parent.changeToolMode(this.parent.toolManager.getDefaultToolFor())) {
            return;
        }
        super.close();
    }

    // Escape is layered by ContainerInputManager; see WallBuildPanel.
    handleKeyDown() {}

    refresh() {
        this.renderRooms();
        this.renderRoomTints();
        this.renderHighlight();
    }

    // ── The rooms ────────────────────────────────────────────────────────────

    /**
     * Biggest first. Not alphabetically: a fresh map's rooms are all called
     * "Room n", so alphabetical is arbitrary, while by size the space you are
     * standing in is near the top and the cupboard you just walled off is near
     * the bottom — which is the order you think about them in.
     */
    rooms() {
        const cellSize = this.cellSize;
        return (this.gameMap?.regionManager?.all('room') ?? [])
            .map(room => ({ room, cells: Math.round(room.areaInCells(cellSize)) }))
            .sort((a, b) => b.cells - a.cells || a.room.id.localeCompare(b.room.id));
    }

    /**
     * Rebuilds the list, putting the reader back where they were.
     *
     * A rebuild replaces every row, and takes the scroll position and the
     * focused field with it — so renaming the sixth room threw the panel back to
     * the top and pulled the cursor out of the box mid-word. The scroll offset
     * and the focused field are restored afterwards, and the two things that
     * happen most (picking a room, renaming one) no longer rebuild at all: see
     * markSelection and syncRow.
     */
    renderRooms() {
        if (!this.listElement || !this.isVisible) return;
        const scroll = this.scrollContainer?.scrollTop ?? 0;
        const active = document.activeElement;
        const focusedRoom = active?.closest?.('.room-row')?.dataset.roomId ?? null;
        const focusedField = focusedRoom
            ? [...active.classList].find(name => name.startsWith('room-row__'))
            : null;

        this.listElement.replaceChildren(...this.rooms().map(entry => this.createRow(entry)));
        this.markSelection({ reveal: false });

        if (focusedRoom && focusedField) {
            this.listElement
                .querySelector(`.room-row[data-room-id="${focusedRoom}"] .${focusedField}`)
                ?.focus();
        }
        if (this.scrollContainer) this.scrollContainer.scrollTop = scroll;
    }

    /**
     * Moves the selected marker without rebuilding anything.
     *
     * Picking a room is the most frequent thing that happens here, and
     * re-rendering five rows of inputs to move one outline is both wasteful and
     * the thing that used to steal focus.
     *
     * `reveal` scrolls the selected row into view, which is right when the
     * selection moved and wrong when the list merely redrew underneath it —
     * that is the jump to the top the panel used to do while you were typing.
     */
    markSelection({ reveal = true } = {}) {
        for (const row of this.listElement?.querySelectorAll('.room-row') ?? []) {
            row.classList.toggle('active', row.dataset.roomId === this.selected);
        }
        this.newButton?.classList.toggle('active', this.selected === 'new');
        this.resetButton?.classList.toggle('active', this.selected === null);
        if (reveal) {
            this.listElement?.querySelector('.room-row.active')?.scrollIntoView({ block: 'nearest' });
        }
    }

    /**
     * Writes one room's values back into its own row.
     *
     * Renaming a room changes that room and nothing else, so rebuilding the
     * whole list for it is how you end up at the top with the cursor gone.
     */
    syncRow(roomId) {
        const row = this.listElement?.querySelector(`.room-row[data-room-id="${roomId}"]`);
        const room = this.gameMap?.regionManager?.get('room', roomId);
        if (!row || !room) return;
        const name = row.querySelector('.room-row__name');
        const type = row.querySelector('.room-row__type');
        if (name) {
            // Not while they are still in it: writing the stored value back
            // under the cursor is how a rename undoes itself as you type.
            if (document.activeElement !== name) name.value = room.properties?.playerName ?? '';
            name.placeholder = room.properties?.authoredDisplayName ??
                room.properties?.displayName ?? room.id;
        }
        if (type) type.value = room.properties?.roomType ?? SiteConfig.rooms.defaultType;
    }

    /**
     * Two lines, not one. Name, type and size on a single row left the name
     * three characters wide and the type reading "Unas" — a panel that shows
     * you the first four letters of everything is a panel you cannot use.
     */
    createRow({ room, cells }) {
        const row = document.createElement('div');
        row.className = 'room-row';
        row.dataset.roomId = room.id;
        row.classList.toggle('active', this.selected === room.id);

        const swatch = document.createElement('span');
        swatch.className = 'room-row__chip';
        swatch.style.backgroundColor = RoomPanel.roomColour(room.id, 0.9);

        const name = document.createElement('input');
        name.type = 'text';
        name.className = 'room-row__name';
        name.value = room.properties?.playerName ?? '';
        name.placeholder = room.properties?.authoredDisplayName ?? room.properties?.displayName ?? room.id;
        name.maxLength = 24;
        name.autocomplete = 'off';
        name.spellcheck = false;
        name.setAttribute('aria-label', `Name for ${this.label(room)}`);
        name.addEventListener('change', () => this.commitRoom(room.id, { name: name.value.trim() || null }, 'Rename Room'));
        name.addEventListener('keydown', event => {
            if (event.key === 'Enter') name.blur();
        });
        // Typing a name is not choosing a brush, and having the row select
        // itself under the cursor would move the paint target mid-word.
        name.addEventListener('pointerdown', event => event.stopPropagation());

        const type = document.createElement('select');
        type.className = 'room-row__type';
        type.setAttribute('aria-label', `Type for ${this.label(room)}`);
        type.replaceChildren(...SiteConfig.rooms.types.map(entry => {
            const option = document.createElement('option');
            option.value = entry.id;
            option.textContent = entry.label;
            return option;
        }));
        type.value = room.properties?.roomType ?? SiteConfig.rooms.defaultType;
        type.addEventListener('change', () => this.commitRoom(room.id, { type: type.value }, 'Change Room Type'));
        type.addEventListener('pointerdown', event => event.stopPropagation());

        const size = document.createElement('span');
        size.className = 'room-row__size';
        size.textContent = `${cells} tiles`;

        const meta = document.createElement('div');
        meta.className = 'room-row__meta';
        meta.append(type, size);

        // On every room, not only the ones somebody painted. A room the walls
        // enclose still stops being its own room the moment its floor belongs
        // to the room next door, and that is what deleting one means here — the
        // only sense in which any of them can go without knocking a wall down.
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'room-row__delete';
        remove.textContent = '✕';
        remove.title = `Delete ${this.label(room)}`;
        remove.setAttribute('aria-label', `Delete ${this.label(room)}`);
        remove.addEventListener('pointerdown', event => event.stopPropagation());
        remove.addEventListener('click', () => this.confirmDissolve(room.id));
        meta.append(remove);

        const body = document.createElement('div');
        body.className = 'room-row__body';
        body.append(name, meta);

        row.append(swatch, body);
        row.addEventListener('pointerdown', () => this.select(room.id));
        row.addEventListener('pointerenter', () => this.renderHighlight(room.id));
        row.addEventListener('pointerleave', () => this.renderHighlight());
        return row;
    }

    label(room) {
        return room?.properties?.displayName || room?.id || 'Room';
    }

    /**
     * Deleting a room asks first, and says where the floor is going — "delete"
     * reads like the floor disappears, and it does not: it joins the room next
     * door, or goes back to whatever the walls enclose if there is no next door.
     */
    confirmDissolve(roomId) {
        const room = this.gameMap?.regionManager?.get('room', roomId);
        const cells = this.roomCells(roomId);
        if (!room || cells.length === 0) {
            this.parent.showMessage('That room has no floor left to give away.', 'info', 'Rooms');
            return false;
        }
        const heir = this.largestNeighbour(roomId, cells);
        if (!window.confirm(
            `Delete ${this.label(room)}?\n\n` +
            `Its ${cells.length} tile${cells.length === 1 ? '' : 's'} ` +
            `${heir ? `join ${this.label(heir)}` : 'go back to whatever the walls enclose'}. ` +
            'Nothing standing on the floor moves. Ctrl+Z undoes this.'
        )) return false;

        if (this.selected === roomId) this.selected = heir?.id ?? null;
        return this.commitCells(cells, heir?.id ?? null);
    }

    /**
     * Reset throws away every room boundary the player has painted, so it asks
     * first and says how much it is about to undo.
     *
     * It is a button that acts, not a brush you then have to use: picking an
     * eraser and painting with it would be a second, quieter way to lose the
     * same work, with no moment where anything warned you.
     */
    confirmReset() {
        const painted = this.assignments?.size ?? 0;
        if (painted === 0) {
            this.parent.showMessage('No room has been painted yet.', 'info', 'Rooms');
            return false;
        }
        if (!window.confirm(
            'Reset every room boundary you have painted?\n\n' +
            `${painted} tile${painted === 1 ? '' : 's'} go back to whatever the walls enclose, ` +
            'and rooms you made by painting will be gone. Ctrl+Z undoes this.'
        )) return false;

        const cells = [...(this.assignments?.cells.keys() ?? [])].map(key => {
            const [x, y] = key.split(',').map(Number);
            return { x, y };
        });
        this.selected = null;
        return this.commitCells(cells, null);
    }

    /** Every cell currently in a room, painted or inherited from the walls. */
    roomCells(roomId) {
        const shape = this.gameMap?.regionManager?.get('room', roomId)?.shape;
        if (shape?.kind !== 'tilemask') return [];
        return [...shape.cells].map(key => {
            const [x, y] = key.split(',').map(Number);
            return { x, y };
        });
    }

    /**
     * The room that inherits a deleted one's floor: whichever shares the most
     * border with it.
     *
     * Most border, not nearest centre — an L-shaped room can have its middle
     * further away than a room it barely touches, and the one you expect the
     * floor to join is the one it actually runs alongside.
     * @returns {SpatialRegion|null}
     */
    largestNeighbour(roomId, cells) {
        const size = this.cellSize;
        const walls = this.gameMap?.wallBuilder?.cells;
        const own = new Set(cells.map(cell => `${cell.x},${cell.y}`));
        const shared = new Map();
        for (const cell of cells) {
            for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
                const x = cell.x + dx;
                const y = cell.y + dy;
                if (own.has(`${x},${y}`) || walls?.has(`${x},${y}`)) continue;
                const neighbour = this.gameMap?.regionManager?.innermostAt(
                    (x + 0.5) * size, (y + 0.5) * size, 'room', size
                );
                if (!neighbour || neighbour.id === roomId) continue;
                shared.set(neighbour, (shared.get(neighbour) || 0) + 1);
            }
        }
        return [...shared.entries()].reduce((best, entry) =>
            !best || entry[1] > best[1] ? entry : best, null)?.[0] ?? null;
    }

    select(value) {
        this.selected = value;
        this.markSelection();
        this.renderHighlight();
    }

    /**
     * A stable colour per room id, so a room reads the same on the floor, in its
     * row and under the cursor.
     *
     * Off a fixed wheel of well-separated hues rather than `hash % 360`. Room ids
     * on one map share a prefix — zone_kitchen, zone_bedroom, zone_hallway — so
     * their hashes land close together and the modulo handed three of five rooms
     * the same magenta. Telling rooms apart by colour is the entire interface
     * here, so the colours have to actually differ.
     */
    static roomColour(roomId, alpha) {
        if (!roomId) return `rgba(120, 120, 120, ${alpha})`;
        let hash = 0;
        for (let index = 0; index < roomId.length; index++) {
            hash = ((hash * 31) + roomId.charCodeAt(index)) | 0;
        }
        hash = Math.abs(hash);
        const hue = RoomPanel.HUES[hash % RoomPanel.HUES.length];
        // A second axis so two rooms that collide on hue still differ, without
        // going so pale or so dark that the floor underneath stops reading.
        const lightness = [46, 58, 68][Math.floor(hash / RoomPanel.HUES.length) % 3];
        return `hsla(${hue}, 68%, ${lightness}%, ${alpha})`;
    }

    // ── Seeing them ──────────────────────────────────────────────────────────

    /**
     * Every room tinted its own colour, through the floor's own ownership so a
     * tint stops exactly where its room's floor does. Room membership is
     * invisible in a house with no walls between the rooms; this is what turns
     * "did that work?" into something answered by looking.
     */
    renderRoomTints() {
        this.clearRoomTints();
        const map = this.gameMap;
        if (!map?.floorBuilder || !this.parent.isTool(UIToolModes.ROOM)) return;
        for (const room of map.regionManager?.all('room') ?? []) {
            const overlay = map.floorBuilder.createRoomOverlay(room, {
                className: 'room-tint',
                fill: RoomPanel.roomColour(room.id, 0.26),
                outline: RoomPanel.roomColour(room.id, 0.95)
            });
            if (overlay) this.roomTints.push(overlay);
        }
    }

    /**
     * The one room being worked on, lit brighter than the rest.
     *
     * Hovering a row shows that room; otherwise the selected one stays lit. The
     * tints alone answer "how many rooms" and "where do they stop"; this answers
     * "which one am I about to paint with", which was the thing the palette
     * could never say.
     */
    renderHighlight(roomId = this.selected) {
        this.clearHighlight();
        const target = roomId && roomId !== 'new' ? roomId : null;
        const room = target ? this.gameMap?.regionManager?.get('room', target) : null;
        if (!room) return;
        this.highlight = this.gameMap?.floorBuilder?.createRoomOverlay(room, {
            className: 'room-highlight',
            fill: RoomPanel.roomColour(room.id, 0.45),
            outline: '#ffffff'
        }) ?? null;
    }

    clearRoomTints() {
        for (const element of this.roomTints) element.remove();
        this.roomTints = [];
    }

    clearHighlight() {
        this.highlight?.remove();
        this.highlight = null;
    }

    // ── Painting ─────────────────────────────────────────────────────────────

    pointerToCell(event) {
        const map = this.gameMap;
        const world = map?.container?.inputHandler?.screenToWorldCoordinates?.(event.clientX, event.clientY);
        if (!world || !map?.gridSystem) return null;
        const cell = map.gridSystem.worldToGrid(world.x, world.y);
        if (cell.x < 0 || cell.y < 0 || cell.x >= map.gridSystem.gridWidth || cell.y >= map.gridSystem.gridHeight) {
            return null;
        }
        // Masonry is not floor and cannot be in a room. Refusing here is what
        // keeps a stroke across a doorway from painting the door.
        if (map.wallBuilder?.cells?.has(`${cell.x},${cell.y}`)) return null;
        return cell;
    }

    /** The room a stroke paints into. 'new' is minted once per stroke, not per cell. */
    resolveStrokeRoomId() {
        if (this.selected !== 'new') return this.selected;
        return this.assignments?.mintRoomId() ?? null;
    }

    handlePointerDown(event) {
        if (!this.parent.isTool(UIToolModes.ROOM) || event.button !== 0) return;
        const cell = this.pointerToCell(event);
        if (!cell || !this.assignments) return;
        event.preventDefault();
        event.stopPropagation();
        this.drag = {
            pointerId: event.pointerId,
            roomId: this.resolveStrokeRoomId(),
            cells: new Map(),
            moved: false
        };
        this.paintCell(cell);
        this.hoverKey = null;
    }

    handlePointerMove(event) {
        if (!this.drag) {
            this.renderHoverGhost(event);
            return;
        }
        if (event.pointerId !== this.drag.pointerId) return;
        const cell = this.pointerToCell(event);
        event.preventDefault();
        event.stopPropagation();
        if (!cell) return;
        if (!this.drag.cells.has(`${cell.x},${cell.y}`)) this.drag.moved = true;
        this.paintCell(cell);
    }

    paintCell(cell) {
        const key = `${cell.x},${cell.y}`;
        if (this.drag.cells.has(key)) return;
        this.drag.cells.set(key, cell);
        this.renderGhosts([...this.drag.cells.values()], this.drag.roomId);
    }

    handlePointerUp(event) {
        if (!this.drag || event.pointerId !== this.drag.pointerId) return;
        event.preventDefault();
        event.stopPropagation();
        const { cells, roomId, moved } = this.drag;
        this.cancelDrag();
        // A click with no drag is a bucket fill: the square you clicked and
        // everything of the same room it joins up with. That is what a click on
        // a flat colour means everywhere else.
        const painted = moved ? [...cells.values()] : this.floodFrom([...cells.values()][0]);
        if (this.commitCells(painted, roomId) && roomId) {
            // Whatever you just painted into is what you are working on. Without
            // this, painting with New Room left the brush on "New Room" and the
            // next stroke made a second one — which is exactly the "why did that
            // make another room?" that made this tool confusing.
            this.selected = roomId;
        }
    }

    /**
     * The area a bucket click covers: every cell reachable from the one clicked
     * without crossing a wall or leaving the room it is currently in.
     *
     * Bounded by the room, not only by the walls, so clicking one half of a
     * split open-plan space repaints that half rather than swallowing the room
     * next door — which would make the bucket useless for the layout this tool
     * exists for.
     */
    floodFrom(start) {
        const map = this.gameMap;
        if (!start || !map) return [];
        const size = this.cellSize;
        const roomAt = (x, y) => map.regionManager?.innermostAt(
            (x + 0.5) * size, (y + 0.5) * size, 'room', size
        )?.id ?? null;
        const target = roomAt(start.x, start.y);
        const walls = map.wallBuilder?.cells;
        const width = map.gridSystem?.gridWidth || 0;
        const height = map.gridSystem?.gridHeight || 0;

        const seen = new Set([`${start.x},${start.y}`]);
        const queue = [start];
        const found = [];
        for (let index = 0; index < queue.length; index++) {
            const cell = queue[index];
            found.push(cell);
            for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
                const x = cell.x + dx;
                const y = cell.y + dy;
                const key = `${x},${y}`;
                if (x < 0 || y < 0 || x >= width || y >= height || seen.has(key)) continue;
                if (walls?.has(key) || roomAt(x, y) !== target) continue;
                seen.add(key);
                queue.push({ x, y });
            }
        }
        return found;
    }

    renderHoverGhost(event = null) {
        if (event) this.hoverEvent = event;
        const source = event || this.hoverEvent;
        if (!this.parent.isTool(UIToolModes.ROOM) || !source) return;
        if (!this.parent.parent?.canvas?.contains(source.target)) {
            this.clearHover();
            return;
        }
        const cell = this.pointerToCell(source);
        if (!cell) {
            this.clearHover();
            return;
        }
        const key = `${cell.x},${cell.y}`;
        if (this.hoverKey === key) return;
        this.hoverKey = key;
        // The whole area a click would take, not one square: a bucket that shows
        // you one tile is a bucket you have to guess at.
        this.renderGhosts(this.floodFrom(cell), this.selected);
    }

    clearHover() {
        if (this.drag) return;
        this.hoverKey = null;
        this.hoverEvent = null;
        this.clearGhosts();
    }

    renderGhosts(cells, roomId) {
        this.clearGhosts();
        const layer = this.gameMap?.layers?.objects;
        const size = this.cellSize;
        if (!layer) return;
        const fill = roomId && roomId !== 'new' ? RoomPanel.roomColour(roomId, 0.6) : null;
        for (const cell of cells) {
            const ghost = document.createElement('div');
            ghost.className = `room-paint-ghost${roomId ? '' : ' is-reset'}${roomId === 'new' ? ' is-new' : ''}`;
            Object.assign(ghost.style, {
                left: `${cell.x * size}px`,
                top: `${cell.y * size}px`,
                width: `${size}px`,
                height: `${size}px`
            });
            if (fill) ghost.style.backgroundColor = fill;
            layer.appendChild(ghost);
            this.ghostElements.push(ghost);
        }
    }

    clearGhosts() {
        for (const element of this.ghostElements) element.remove();
        this.ghostElements = [];
    }

    cancelDrag() {
        const wasDragging = this.drag !== null;
        this.clearGhosts();
        this.drag = null;
        return wasDragging;
    }

    commitCells(cells, roomId) {
        const assignments = this.assignments;
        if (!assignments || !cells?.length) return false;
        const result = assignments.applyChanges(cells.map(cell => ({ ...cell, roomId })));
        if (!result || result.applied.length === 0) {
            this.playSound(SiteConfig.buildMode.sounds.rejected);
            return false;
        }

        const forward = result.applied.map(change => ({ ...change }));
        const backward = result.inverse.map(change => ({ ...change }));
        const count = result.applied.length;
        this.parent.parent?.buildHistory?.push({
            label: `${roomId ? 'Paint' : 'Reset'} Room (${count} tile${count === 1 ? '' : 's'})`,
            undo: () => assignments.applyChanges(backward.map(change => ({ ...change }))),
            redo: () => assignments.applyChanges(forward.map(change => ({ ...change })))
        });

        this.playSound(SiteConfig.buildMode.sounds.paint);
        this.gameMap?.container?.worldState?.captureMap?.(this.gameMap);
        this.gameMap?.core?.user?._scheduleSave?.();
        return true;
    }

    /**
     * A room's name and type. The same edit the panel's own inputs make, through
     * the same history stack — and the only place either is edited now that the
     * Surface panel has stopped carrying them. Painting a wall and naming the
     * room you painted it in are two different jobs, and the panel that owns the
     * rooms should own their names.
     */
    commitRoom(roomId, patch, label) {
        const region = this.gameMap?.regionManager?.get('room', roomId);
        if (!region) return false;
        const previous = {
            name: region.properties?.playerName ?? null,
            type: region.properties?.roomType ?? SiteConfig.rooms.defaultType
        };
        const next = { ...previous, ...patch };
        if (next.name === previous.name && next.type === previous.type) return false;

        const apply = (state) => {
            const target = this.gameMap?.regionManager?.get('room', roomId);
            if (!target) return false;
            target.properties = {
                ...target.properties,
                playerName: state.name,
                roomType: state.type,
                displayName: state.name
                    ?? target.properties.authoredDisplayName
                    ?? target.properties.displayName
            };
            this.gameMap.container?.worldState?.captureMap?.(this.gameMap);
            this.gameMap.core?.user?._scheduleSave?.();
            this.syncRow(roomId);
            return true;
        };

        if (!apply(next)) return false;
        this.parent.parent?.buildHistory?.push({
            label,
            undo: () => apply(previous),
            redo: () => apply(next)
        });
        return true;
    }

    playSound(soundId, options = {}) {
        if (soundId) this.parent.parent?.core?.soundManager?.playWhenReady?.(soundId, options);
    }

    dispose() {
        this.cancelDrag();
        this.clearHover();
        this.clearRoomTints();
        this.clearHighlight();
        for (const unsubscribe of this._unsubscribers ?? []) unsubscribe();
        this._unsubscribers = [];
        this.parent?.parent?.canvas?.removeEventListener('pointerdown', this.boundPointerDown, true);
        this.parent?.parent?.canvas?.removeEventListener('pointerleave', this.boundPointerLeave);
        document.removeEventListener('pointermove', this.boundPointerMove, true);
        document.removeEventListener('pointerup', this.boundPointerUp, true);
        document.removeEventListener('pointercancel', this.boundPointerUp, true);
        document.body.classList.remove('room-build-mode');
        super.dispose();
    }
}
