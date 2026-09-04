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
    static PAINTED_PREFIX = 'room_painted_';
    static OPERATIONS = Object.freeze({
        SELECT: 'select',
        ADD: 'add',
        REMOVE: 'remove'
    });

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
        // The room a stroke paints into, always a real room id.
        this.selected = null;
        // A room that has been started and not yet painted: {id, name, type}.
        // It has a row in the list and an id of its own from the moment it is
        // made, so that everything about it is visible before it has a floor.
        this.pending = null;
        this.ghostElements = [];
        this.roomTints = [];
        this.perimeterGhosts = [];
        this.highlight = null;
        this.boundPointerDown = this.handlePointerDown.bind(this);
        this.boundPointerMove = this.handlePointerMove.bind(this);
        this.boundPointerUp = this.handlePointerUp.bind(this);
        this.boundPointerLeave = this.clearHover.bind(this);
        this.boundRefresh = () => this.refresh();
        this.init();
        this.listElement = this.modalElement?.querySelector('.room-panel-list') || null;
        this.scrollContainer = this.listElement;
        this.operationSegment = new SegmentControl(
            this.modalElement?.querySelector('.room-build-operation-segment') || null,
            {
                value: RoomPanel.OPERATIONS.SELECT,
                onChange: () => {
                    this.cancelDrag();
                    this.clearHover();
                    this.renderOperation();
                }
            }
        );
        this.rectangleToggle = this.modalElement?.querySelector('#room-build-rectangle') || null;
        this.selectHint = this.modalElement?.querySelector('.room-select-hint') || null;
        this.editHint = this.modalElement?.querySelector('.room-edit-hint') || null;
        this.editOptions = this.modalElement?.querySelector('.room-build-edit-options') || null;
        this.newButton = this.modalElement?.querySelector('#room-new') || null;
        this.resetButton = this.modalElement?.querySelector('#room-reset') || null;
        this.newButton?.addEventListener('click', () => this.startNewRoom());
        this.resetButton?.addEventListener('click', () => this.confirmReset());
        this.parent?.parent?.canvas?.addEventListener('pointerdown', this.boundPointerDown, true);
        this.parent?.parent?.canvas?.addEventListener('pointerleave', this.boundPointerLeave);
        document.addEventListener('pointermove', this.boundPointerMove, true);
        document.addEventListener('pointerup', this.boundPointerUp, true);
        document.addEventListener('pointercancel', this.boundPointerUp, true);
        this._unsubscribers = [
            this.parent?.parent?.eventManager?.on(EVENTS.BUILD_COMMITTED, this.boundRefresh)
        ].filter(Boolean);
    }

    get gameMap() {
        return this.parent?.parent?.gameMap || null;
    }

    get assignments() {
        const plans = this.gameMap?.buildDocument?.level?.().rooms;
        if (!plans) return null;
        const cells = new Map(plans.values().flatMap(room => room.seedCells.map(key => [key, room.id])));
        return {
            cells,
            size: cells.size,
            get: (x, y) => plans.ownerOfSeed(BuildKeys.cell(x, y)),
            roomIds: () => plans.values().filter(room => room.seedCells.length > 0).map(room => room.id),
            mintRoomId: () => this.mintRoomId(),
            applyChanges: (changes, options = {}) => this.applyRoomCellChanges(changes, options)
        };
    }

    mintRoomId() {
        const plans = this.gameMap?.buildDocument?.level?.().rooms;
        const taken = new Set(plans?.keys() ?? []);
        for (let index = 1; ; index++) {
            const id = `${RoomPanel.PAINTED_PREFIX}${index}`;
            if (!taken.has(id)) return id;
        }
    }

    applyRoomCellChanges(changes, options = {}) {
        const transaction = this.gameMap?.buildTransaction;
        const plans = this.gameMap?.buildDocument?.level?.().rooms;
        if (!transaction || !plans || !Array.isArray(changes) || changes.length === 0) return null;
        const applied = [];
        const inverse = [];
        for (const change of changes) {
            if (!Number.isInteger(change?.x) || !Number.isInteger(change?.y)) continue;
            const key = BuildKeys.cell(change.x, change.y);
            const previous = plans.ownerOfSeed(key);
            const next = change.roomId ?? null;
            if (previous === next) continue;
            applied.push({ x: change.x, y: change.y, roomId: next });
            inverse.push({ x: change.x, y: change.y, roomId: previous });
        }
        if (applied.length === 0) return { applied, inverse };
        transaction.run(options.label || 'Edit room cells', (_draft, level) => {
            for (const spec of options.roomSpecs || []) if (!level.rooms.has(spec.id)) {
                level.rooms.set(spec.id, {
                    id: spec.id,
                    buildingId: spec.buildingId ?? null,
                    displayName: spec.name || spec.id,
                    authoredDisplayName: spec.name || spec.id,
                    roomType: spec.type ?? null,
                    origin: 'painted',
                    seedCells: [],
                    floorFinishId: spec.floorFinishId ?? null,
                    wallFinishId: spec.wallFinishId ?? null,
                    properties: {}
                });
            }
            for (const change of applied) {
                const key = BuildKeys.cell(change.x, change.y);
                const previous = level.rooms.ownerOfSeed(key);
                if (previous) level.rooms.removeSeed(previous, key);
                if (!change.roomId) continue;
                if (!level.rooms.has(change.roomId)) {
                    const source = this.gameMap?.regionManager?.get('room', change.roomId);
                    level.rooms.set(change.roomId, {
                        id: change.roomId,
                        buildingId: source?.properties?.buildingId ?? null,
                        displayName: source?.properties?.displayName || change.roomId,
                        authoredDisplayName: source?.properties?.authoredDisplayName || change.roomId,
                        roomType: source?.properties?.roomType ?? null,
                        origin: 'painted',
                        seedCells: [],
                        floorFinishId: source?.properties?.floorFinishId ?? null,
                        wallFinishId: source?.properties?.wallFinishId ?? null,
                        properties: source?.properties || {}
                    });
                }
                level.rooms.assignSeed(change.roomId, key);
            }
        });
        return { applied, inverse };
    }

    get cellSize() {
        return this.gameMap?.gridSystem?.config?.cellSize || 32;
    }

    handleToolModeChanged(mode) {
        const active = mode === UIToolModes.ROOM;
        document.body.classList.toggle('room-build-mode', active);
        if (!active) document.body.classList.remove('room-select-mode');
        if (active) {
            this.open();
            this.renderOperation();
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

    /**
     * Rooms changed under us. Only redraw while the tool that owns those
     * drawings is the one in hand: rooms are recomputed whenever a wall moves,
     * so refreshing unconditionally painted this panel's room outline onto the
     * floor in the middle of a wall drag, in a tool that has nothing to say
     * about rooms.
     */
    refresh() {
        if (!this.parent.isTool(UIToolModes.ROOM)) {
            this.clearRoomTints();
            this.clearHighlight();
            this.clearPerimeterGaps();
            return;
        }
        // Rows can be rebuilt while one of their hover previews is showing.
        // The old row then never receives pointerleave, so retire its preview
        // before drawing the current room state.
        this.clearPerimeterGaps();
        this.settlePending();
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
        const rows = (this.gameMap?.regionManager?.all('room') ?? [])
            .map(room => ({ room, cells: Math.round(room.areaInCells(cellSize)) }))
            .sort((a, b) => b.cells - a.cells || a.room.id.localeCompare(b.room.id));
        // The room being made goes first, not last. It has no floor, so by size
        // it would sort to the bottom of the list — under everything else, in
        // the one moment when it is the only row the player is looking for.
        const pending = this.pendingEntry();
        return pending ? [pending, ...rows] : rows;
    }

    /**
     * The row for a room that has been started and not yet painted.
     *
     * "New room" used to be a mode that lived on a footer button: pressing it
     * changed nothing you could see, and the room itself did not exist until
     * you had already painted it — so the only way to find out whether the
     * button had worked was to paint something and look. A room you have
     * started IS a room. It gets its id, its colour, its name and its place in
     * the list straight away, and holds them until it has a floor to go with
     * them.
     *
     * A stub rather than a SpatialRegion, because a region with no cells in the
     * region manager is a room the whole map can see — floors, lighting, wall
     * faces and the cutaway would all have to learn about a room that is not
     * anywhere yet. The list is the only place this needs to exist.
     */
    pendingEntry() {
        if (!this.pending) return null;
        // It has been painted since: it is a real room now and the map's own
        // copy is the one to show.
        if (this.gameMap?.regionManager?.get('room', this.pending.id)) return null;
        return {
            cells: 0,
            room: {
                id: this.pending.id,
                properties: {
                    displayName: this.pending.name ?? 'New room',
                    authoredDisplayName: 'New room',
                    playerName: this.pending.name,
                    roomType: this.pending.type,
                    indoor: true
                }
            }
        };
    }

    /**
     * Starts a room: mints its id, gives it a row, and puts it in hand.
     *
     * The id is minted now rather than on the first stroke so that the row, the
     * swatch and the ghost tiles under the cursor all agree on the colour
     * before a single square is painted — and so that naming it is something
     * you can do first, the way you would name a folder before filling it.
     */
    startNewRoom() {
        // Pressing it twice does not make two rooms. The one already waiting
        // for a floor is the one you meant, and re-minting would throw away the
        // name you had just typed into it.
        if (this.pendingEntry()) {
            this.select(this.pending.id);
            this.operationSegment?.select(RoomPanel.OPERATIONS.ADD);
            return true;
        }
        const id = this.assignments?.mintRoomId();
        if (!id) return false;
        this.pending = { id, name: null, type: SiteConfig.rooms.defaultType };
        this.selected = id;
        this.operationSegment?.select(RoomPanel.OPERATIONS.ADD);
        this.renderRooms();
        this.markSelection();
        this.renderHighlight();
        return true;
    }

    /**
     * Drops the room being made. Nothing was committed, so there is nothing to
     * undo and nothing to ask about — an unpainted room is a row and an id.
     */
    cancelPending() {
        if (!this.pending) return false;
        this.pending = null;
        this.selected = this.rooms()[0]?.room?.id ?? null;
        this.renderRooms();
        this.markSelection();
        this.renderHighlight();
        return true;
    }

    /**
     * The room being made has been painted, so it is a room like any other now.
     * Whatever was typed into its row while it had no floor is written onto the
     * region itself, and the pending row retires.
     */
    settlePending() {
        const region = this.pending && this.gameMap?.regionManager?.get('room', this.pending.id);
        if (!region) return false;
        const { name, type } = this.pending;
        this.pending = null;
        if (name || type !== SiteConfig.rooms.defaultType) {
            this.commitRoom(region.id, { name: name || null, type }, 'Name Room');
        }
        return true;
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

        const rooms = this.rooms();
        this.listElement.replaceChildren(
            ...(rooms.length ? rooms.map(entry => this.createRow(entry)) : [RoomPanel.emptyState()])
        );
        this.markSelection({ reveal: false });

        if (focusedRoom && focusedField) {
            this.listElement
                .querySelector(`.room-row[data-room-id="${focusedRoom}"] .${focusedField}`)
                ?.focus();
        }
        if (this.scrollContainer) this.scrollContainer.scrollTop = scroll;
    }

    /**
     * What the list says when it has nothing in it.
     *
     * A map with no rooms is not a broken one — it is a map nobody has built in
     * yet, and it is the first thing you see if you open this panel standing
     * outside. An empty box reads as a panel that failed to load; a sentence
     * says which of the two buttons below it to press.
     */
    static emptyState() {
        const empty = document.createElement('p');
        empty.className = 'panel-list__empty room-panel-empty';
        empty.textContent = 'No rooms yet. Wall a space in and it becomes a room on its own, ' +
            'or press New room and paint the floor you want it to cover.';
        return empty;
    }

    /** Put a room in hand, optionally starting a new one for an Add stroke. */
    ensureBrush({ createWhenUnselected = false } = {}) {
        if (this.selected) {
            if (this.selected === this.pending?.id) return this.selected;
            if (this.gameMap?.regionManager?.get('room', this.selected)) return this.selected;
        }
        if (createWhenUnselected) {
            this.selected = null;
            this.startNewRoom();
            return this.selected;
        }
        this.selected = this.rooms()[0]?.room?.id ?? null;
        // No rooms to pick from and none in hand — a map nobody has built in,
        // which is exactly what you are looking at standing outside in a space
        // nothing encloses. Starting one is the only move there is, so the
        // panel makes it instead of refusing the click and waiting to be asked
        // for the one thing it could have done itself.
        if (!this.selected) this.startNewRoom();
        return this.selected;
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
            const active = row.dataset.roomId === this.selected;
            row.classList.toggle('active', active);
            const name = row.querySelector('.room-row__name');
            if (name) name.readOnly = !active;
        }
        this.newButton?.classList.toggle('active', this.selected === this.pending?.id);
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
        row.classList.toggle('is-empty', cells === 0);
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
        name.readOnly = this.selected !== room.id;
        name.setAttribute('aria-label', `Name for ${this.label(room)}`);
        name.addEventListener('change', () => this.commitRoom(room.id, { name: name.value.trim() || null }, 'Rename Room'));
        name.addEventListener('keydown', event => {
            if (event.key === 'Enter') name.blur();
        });
        name.addEventListener('pointerdown', event => {
            if (name.readOnly) this.select(room.id);
            event.stopPropagation();
        });

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
        // Said on the row, because a room nothing encloses looks identical to
        // one that is walled in once it has a floor and a name — and it is not:
        // it takes no interior light, and standing in it you are still outside.
        // The same sentence at every size, nought included: the size slot shares
        // its line with the type dropdown, and a row that swaps in a longer
        // phrase at zero squeezes the dropdown down to nothing. A room with no
        // floor says so by the row it is in — faded swatch, italic count.
        size.textContent = `${cells} tiles`;

        const perimeter = this.perimeterPlan(room);
        const status = document.createElement('span');
        status.className = `room-row__status is-${perimeter.state}`;
        status.textContent = perimeter.label;
        status.title = perimeter.missing.length
            ? `${perimeter.missing.length} exposed perimeter cell${perimeter.missing.length === 1 ? '' : 's'}`
            : 'The room perimeter is closed';

        const meta = document.createElement('div');
        meta.className = 'room-row__meta';
        meta.append(type, size);
        // Outdoors as a mark rather than a word. It has to be said — a room
        // nothing encloses looks exactly like a walled one once it has a floor
        // and a name, and it is lit differently — but "· outdoor" spent a third
        // of a line the type dropdown was already sharing.
        if (room.properties?.indoor === false) {
            const outdoor = document.createElement('span');
            outdoor.className = 'room-row__outdoor';
            outdoor.title = 'Outdoor — nothing encloses this room, so it takes daylight rather than indoor light';
            outdoor.setAttribute('aria-label', 'Outdoor room');
            outdoor.append(Utility.createIcon('sun'));
            meta.append(outdoor);
        }

        // On every room, not only the ones somebody painted. A room the walls
        // enclose still stops being its own room the moment its floor belongs
        // to the room next door, and that is what deleting one means here — the
        // only sense in which any of them can go without knocking a wall down.
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'room-row__action room-row__delete';
        remove.textContent = 'Remove room';
        remove.title = `Remove ${this.label(room)} definition and keep its walls`;
        remove.setAttribute('aria-label', `Remove ${this.label(room)} definition`);
        remove.addEventListener('pointerdown', event => event.stopPropagation());
        remove.addEventListener('click', () => this.confirmDissolve(room.id));
        remove.disabled = !this.canDissolve(room.id);

        const actions = document.createElement('div');
        actions.className = 'room-row__actions';
        const floor = this.roomAction(cells === 0 ? 'Paint floor' : 'Floor',
            cells === 0 ? `Paint the first floor tiles for ${this.label(room)}` : `Edit ${this.label(room)} floor`,
            () => cells === 0 ? this.select(room.id) : this.openSurface(room.id, 'floor'));
        const walls = this.roomAction('Walls', `Edit ${this.label(room)} wall finishes`, () =>
            this.openSurface(room.id, 'wall'));
        walls.disabled = perimeter.present === 0;
        const enclose = this.roomAction(perimeter.action, perimeter.actionTitle, () =>
            this.encloseRoom(room.id));
        enclose.classList.add('room-row__enclose');
        enclose.disabled = perimeter.missing.length === 0;
        const islands = this.roomIslands(room);
        const split = this.roomAction('Split islands',
            islands.length > 1
                ? `Make ${islands.length} disconnected areas into separate rooms`
                : 'This room is one connected area',
            () => this.splitIslands(room.id));
        split.disabled = islands.length < 2;
        const demolition = this.demolitionPlan(room);
        const demolish = this.roomAction('Demolish',
            demolition.removable.length
                ? `Remove ${demolition.removable.length} exterior wall cells with this room`
                : 'This room has no removable exterior walls',
            () => this.confirmDemolish(room.id));
        demolish.classList.add('room-row__demolish');
        demolish.disabled = demolition.removable.length === 0;
        demolish.addEventListener('pointerenter', () => this.renderDemolitionPreview(room.id));
        demolish.addEventListener('pointerleave', () => this.renderPerimeterGaps(room.id));
        actions.append(floor, walls, enclose, split, remove, demolish);

        // One grid, three columns: the swatch keeps a column to itself so the
        // type dropdown on the line below starts where the name does rather
        // than sliding under the colour. Nesting these in wrappers is what let
        // the two lines drift out of alignment in the first place.
        row.append(swatch, name, status, meta, actions);
        row.addEventListener('pointerdown', () => this.select(room.id));
        row.addEventListener('pointerenter', () => {
            this.renderHighlight(room.id);
            this.renderPerimeterGaps(room.id);
        });
        row.addEventListener('pointerleave', () => {
            this.renderHighlight();
            this.clearPerimeterGaps();
        });
        row.addEventListener('dblclick', event => {
            if (!event.target.closest('input, select, button')) this.focusRoom(room);
        });
        return row;
    }

    roomAction(label, title, action) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'room-row__action';
        button.textContent = label;
        button.title = title;
        button.addEventListener('pointerdown', event => event.stopPropagation());
        button.addEventListener('click', event => {
            event.stopPropagation();
            action();
        });
        return button;
    }

    roomIslands(room) {
        if (room?.shape?.kind !== 'tilemask') return [];
        const remaining = new Set(room.shape.cells);
        const islands = [];
        while (remaining.size > 0) {
            const first = remaining.values().next().value;
            remaining.delete(first);
            const island = [first];
            for (let index = 0; index < island.length; index += 1) {
                const [x, y] = island[index].split(',').map(Number);
                for (const key of [`${x - 1},${y}`, `${x + 1},${y}`, `${x},${y - 1}`, `${x},${y + 1}`]) {
                    if (!remaining.delete(key)) continue;
                    island.push(key);
                }
            }
            islands.push(island);
        }
        return islands.sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]));
    }

    splitIslands(roomId) {
        const room = this.gameMap?.regionManager?.get('room', roomId);
        const islands = this.roomIslands(room);
        if (!room || islands.length < 2) return false;

        const baseName = this.label(room);
        const type = room.properties?.roomType ?? SiteConfig.rooms.defaultType;
        const specs = [];
        const changes = [];
        const taken = new Set([
            ...this.assignments.roomIds(),
            ...(this.gameMap?.regionManager?.all('room') ?? []).map(entry => entry.id)
        ]);
        const mintId = () => {
            for (let number = 1; ; number += 1) {
                const candidate = `${RoomPanel.PAINTED_PREFIX}${number}`;
                if (taken.has(candidate)) continue;
                taken.add(candidate);
                return candidate;
            }
        };
        for (let index = 1; index < islands.length; index += 1) {
            const id = mintId();
            const generic = /^(Room|Area) \d+$/.exec(baseName);
            const name = generic ? `${generic[1]} ${index + 1}` : `${baseName} ${index + 1}`;
            specs.push({
                id,
                name,
                type,
                buildingId: room.properties?.buildingId ?? null,
                floorFinishId: room.properties?.floorFinishId ?? null,
                wallFinishId: room.properties?.wallFinishId ?? null
            });
            for (const key of islands[index]) {
                const [x, y] = key.split(',').map(Number);
                changes.push({ x, y, roomId: id });
            }
        }

        const result = this.applySplitChanges(changes, specs);
        if (!result || result.applied.length === 0) return false;
        const forward = Utility.deepClone(result.applied);
        const backward = Utility.deepClone(result.inverse);
        if (!this.gameMap?.buildTransaction) {
            this.parent.parent?.buildHistory?.push({
                label: `Split Room (${islands.length} islands)`,
                undo: () => this.applySplitChanges(backward, []),
                redo: () => this.applySplitChanges(forward, specs)
            });
        }
        this.parent.showMessage(
            `${baseName} was split into ${islands.length} rooms.`, 'success', 'Rooms'
        );
        return true;
    }

    applySplitChanges(changes, specs) {
        const result = this.assignments?.applyChanges(changes, {
            emit: false,
            roomSpecs: specs,
            label: `Split Room (${specs.length + 1} islands)`
        });
        if (!result || result.applied.length === 0) return result;
        this.gameMap?.container?.worldState?.captureMap?.(this.gameMap);
        this.gameMap?.core?.user?._scheduleSave?.();
        return result;
    }

    openSurface(roomId, surface) {
        return this.parent?.surfaceCustomizePanel?.openRoomSurface?.(roomId, surface) ?? false;
    }

    /** The wall-cell ring immediately outside the room's floor mask. */
    perimeterPlan(room) {
        const empty = { missing: [], present: 0, presentCells: [], state: 'open', label: 'Open', action: 'Enclose room', actionTitle: 'Build walls around this room' };
        if (room?.shape?.kind !== 'tilemask' || room.shape.cells.size === 0) return empty;
        const width = this.gameMap?.gridSystem?.gridWidth ?? 0;
        const height = this.gameMap?.gridSystem?.gridHeight ?? 0;
        const walls = this.gameMap?.wallBuilder?.baseCells;
        const boundary = new Map();
        for (const key of room.shape.cells) {
            const [x, y] = key.split(',').map(Number);
            for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
                const nx = x + dx;
                const ny = y + dy;
                const next = `${nx},${ny}`;
                if (room.shape.cells.has(next) || nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
                boundary.set(next, { x: nx, y: ny });
            }
            // Wall corners occupy their own diagonal cell. Add a diagonal only
            // at a convex floor corner, where both adjoining cardinal cells
            // are outside the room. This closes rectangular and stepped outer
            // corners without filling the inside notch of an L-shaped room.
            for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
                if (room.shape.cells.has(`${x + dx},${y}`) ||
                    room.shape.cells.has(`${x},${y + dy}`)) continue;
                const nx = x + dx;
                const ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
                boundary.set(`${nx},${ny}`, { x: nx, y: ny });
            }
        }
        const missing = [];
        const presentCells = [];
        let present = 0;
        for (const cell of boundary.values()) {
            if (walls?.has(`${cell.x},${cell.y}`)) {
                present += 1;
                presentCells.push(cell);
            }
            else missing.push(cell);
        }
        if (missing.length === 0) {
            return { missing, present, presentCells, state: 'enclosed', label: 'Enclosed', action: 'Enclosed', actionTitle: 'Room is enclosed' };
        }
        if (present > 0) {
            return { missing, present, presentCells, state: 'incomplete', label: `Incomplete · ${missing.length}`, action: 'Finish walls', actionTitle: `Fill ${missing.length} missing perimeter cells` };
        }
        return { ...empty, missing };
    }

    /** Exterior walls owned only by this room; shared walls are never included. */
    demolitionPlan(room) {
        const builder = this.gameMap?.wallBuilder;
        const rules = this.parent?.parent?.buildRules;
        const removable = [];
        const blocked = [];
        let shared = 0;
        const sharedKeys = new Set();
        for (const other of this.gameMap?.regionManager?.all('room') ?? []) {
            if (other.id === room?.id) continue;
            for (const cell of this.perimeterPlan(other).presentCells) {
                sharedKeys.add(`${cell.x},${cell.y}`);
            }
        }
        for (const candidate of this.perimeterPlan(room).presentCells) {
            const key = `${candidate.x},${candidate.y}`;
            if (!builder?.cells?.has(key)) continue;
            if (sharedKeys.has(key)) {
                shared += 1;
                continue;
            }
            const verdict = rules?.canRemoveWallCell(candidate.x, candidate.y) ?? BuildRules.ALLOWED;
            if (verdict.allowed) removable.push(candidate);
            else blocked.push({ ...candidate, reason: verdict.reason });
        }
        return { removable, blocked, shared };
    }

    confirmDemolish(roomId) {
        const room = this.gameMap?.regionManager?.get('room', roomId);
        if (!room) return false;
        const plan = this.demolitionPlan(room);
        if (plan.removable.length === 0) {
            this.parent.showMessage('This room has no removable exterior walls.', 'info', 'Rooms');
            return false;
        }
        const details = [
            `${plan.removable.length} exterior wall cell${plan.removable.length === 1 ? '' : 's'} will be removed.`,
            plan.shared ? `${plan.shared} shared wall cell${plan.shared === 1 ? '' : 's'} will stay.` : null,
            plan.blocked.length ? `${plan.blocked.length} locked or occupied wall cell${plan.blocked.length === 1 ? '' : 's'} will stay.` : null,
            'Doors, windows, and fixtures are never removed by this action. Ctrl+Z undoes it.'
        ].filter(Boolean).join('\n');
        if (!window.confirm(`Demolish ${this.label(room)}?\n\n${details}`)) return false;
        return this.demolishRoom(room, plan);
    }

    demolishRoom(room, plan = this.demolitionPlan(room)) {
        // Clicking rebuilds the room row before its demolition button can emit
        // pointerleave, so explicitly remove the striped hover preview.
        this.clearPerimeterGaps();
        const builder = this.gameMap?.wallBuilder;
        const roomCells = this.roomCells(room.id);
        const heir = this.largestNeighbour(room.id, roomCells);
        const usesBuildTransaction = !!this.gameMap?.buildTransaction;
        const roomChanges = roomCells.map(cell => ({ ...cell, roomId: heir?.id ?? null }));
        const wallResult = builder?.applyWallCellChanges(
            plan.removable.map(cell => ({ ...cell, data: null })),
            usesBuildTransaction ? { roomChanges, label: `Demolish ${this.label(room)}` } : {}
        );
        const roomResult = usesBuildTransaction ? { applied: roomChanges, inverse: [] } :
            this.assignments?.applyChanges(roomChanges, { emit: false });
        if ((!wallResult || wallResult.applied.length === 0) &&
            (!roomResult || roomResult.applied.length === 0)) return false;

        const forwardWalls = Utility.deepClone(wallResult?.applied ?? []);
        const backwardWalls = Utility.deepClone(wallResult?.inverse ?? []);
        const forwardRooms = Utility.deepClone(roomResult?.applied ?? []);
        const backwardRooms = Utility.deepClone(roomResult?.inverse ?? []);
        const replay = (walls, rooms) => {
            if (walls.length) builder.applyWallCellChanges(Utility.deepClone(walls), { validate: false });
            if (rooms.length) this.assignments.applyChanges(Utility.deepClone(rooms), { emit: false });
            this.gameMap?.container?.worldState?.captureMap?.(this.gameMap);
            this.gameMap?.core?.user?._scheduleSave?.();
        };
        if (!usesBuildTransaction) {
            this.parent.parent?.buildHistory?.push({
                label: `Demolish ${this.label(room)}`,
                undo: () => replay(backwardWalls, backwardRooms),
                redo: () => replay(forwardWalls, forwardRooms)
            });
        }
        this.gameMap?.container?.worldState?.captureMap?.(this.gameMap);
        this.gameMap?.core?.user?._scheduleSave?.();
        this.parent.showMessage(
            `${wallResult?.applied.length ?? 0} exterior wall cells removed. Shared and occupied walls stayed.`,
            'success', 'Rooms'
        );
        return true;
    }

    renderDemolitionPreview(roomId) {
        this.clearPerimeterGaps();
        const room = this.gameMap?.regionManager?.get('room', roomId);
        const layer = this.gameMap?.layers?.objects;
        if (!room || !layer) return;
        for (const cell of this.demolitionPlan(room).removable) {
            const ghost = document.createElement('div');
            ghost.className = 'build-ghost-cell is-remove room-demolition-preview';
            Object.assign(ghost.style, {
                left: `${cell.x * this.cellSize}px`, top: `${cell.y * this.cellSize}px`,
                width: `${this.cellSize}px`, height: `${this.cellSize}px`
            });
            layer.appendChild(ghost);
            this.perimeterGhosts.push(ghost);
        }
    }

    encloseRoom(roomId) {
        const room = this.gameMap?.regionManager?.get('room', roomId);
        const plan = this.perimeterPlan(room);
        if (!room || plan.missing.length === 0) return false;
        const builder = this.gameMap?.wallBuilder;
        const changes = plan.missing.map(cell => ({ ...cell, data: {} }));
        const result = builder?.applyWallCellChanges(changes);
        if (!result || result.applied.length === 0) {
            const reason = result?.rejected?.[0]?.reason || 'The perimeter is blocked.';
            this.parent.showMessage(`The room was not enclosed — ${reason.toLowerCase()}`, 'warning', 'Rooms');
            return false;
        }
        const forward = Utility.deepClone(result.applied);
        const backward = Utility.deepClone(result.inverse);
        if (!this.gameMap?.buildTransaction) {
            this.parent.parent?.buildHistory?.push({
                label: `Enclose Room (${result.applied.length} wall${result.applied.length === 1 ? '' : 's'})`,
                undo: () => builder.applyWallCellChanges(Utility.deepClone(backward), { validate: false }),
                redo: () => builder.applyWallCellChanges(Utility.deepClone(forward), { validate: false })
            });
        }
        this.playSound(SiteConfig.buildMode.sounds.objectPlace);
        this.gameMap?.container?.worldState?.captureMap?.(this.gameMap);
        this.gameMap?.core?.user?._scheduleSave?.();
        const blocked = result.rejected.length;
        this.parent.showMessage(
            blocked
                ? `${result.applied.length} wall cells built; ${blocked} blocked section${blocked === 1 ? '' : 's'} remain.`
                : `${result.applied.length} wall cells enclosed ${this.label(room)}.`,
            blocked ? 'warning' : 'success',
            'Rooms'
        );
        return true;
    }

    renderPerimeterGaps(roomId) {
        this.clearPerimeterGaps();
        const room = this.gameMap?.regionManager?.get('room', roomId);
        const layer = this.gameMap?.layers?.objects;
        if (!room || !layer) return;
        for (const cell of this.perimeterPlan(room).missing) {
            const ghost = document.createElement('div');
            ghost.className = 'room-perimeter-gap';
            Object.assign(ghost.style, {
                left: `${cell.x * this.cellSize}px`, top: `${cell.y * this.cellSize}px`,
                width: `${this.cellSize}px`, height: `${this.cellSize}px`
            });
            layer.appendChild(ghost);
            this.perimeterGhosts.push(ghost);
        }
    }

    clearPerimeterGaps() {
        for (const element of this.perimeterGhosts) element.remove();
        this.perimeterGhosts = [];
    }

    focusRoom(room) {
        const bounds = room?.bounds;
        if (!bounds) return false;
        this.gameMap?.container?.camera?.focusOn?.({
            posX: bounds.x,
            posY: bounds.y,
            size: { width: bounds.width, height: bounds.height }
        });
        return true;
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
        // A room that has never been painted has no floor to hand anywhere and
        // nothing to undo. It goes when you say so.
        if (roomId === this.pending?.id) return this.cancelPending();
        const room = this.gameMap?.regionManager?.get('room', roomId);
        const cells = this.roomCells(roomId);
        if (!room || cells.length === 0) {
            this.parent.showMessage('That room has no floor left to give away.', 'info', 'Rooms');
            return false;
        }
        const heir = this.largestNeighbour(roomId, cells);
        if (!this.canDissolve(roomId, cells, heir)) {
            this.parent.showMessage(
                'The walls define this room. Demolish its exterior walls or edit the walls directly.',
                'info', 'Rooms'
            );
            return false;
        }
        if (!window.confirm(
            `Remove the ${this.label(room)} definition?\n\n` +
            `Its ${cells.length} tile${cells.length === 1 ? '' : 's'} ` +
            `${heir ? `join ${this.label(heir)}` : 'go back to whatever the walls enclose'}. ` +
            'Its walls and everything attached to them stay. Ctrl+Z undoes this.'
        )) return false;

        if (this.selected === roomId) this.selected = heir?.id ?? null;
        return this.commitCells(cells, heir?.id ?? null);
    }

    canDissolve(roomId, cells = this.roomCells(roomId), heir = this.largestNeighbour(roomId, cells)) {
        const next = heir?.id ?? null;
        return cells.some(cell => this.assignments?.get(cell.x, cell.y) !== next);
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
        const reset = this.commitCells(cells, null);
        // Back to a real brush: reset is something you did, not something you
        // are now holding.
        this.ensureBrush();
        this.markSelection();
        return reset;
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
        // Picking another room gives up the one you started and never painted.
        // Leaving it in the list would leave a room that is not anywhere, and
        // it would still be there tomorrow.
        const dropping = this.pending && value !== this.pending.id;
        this.selected = value;
        if (dropping) {
            this.pending = null;
            this.renderRooms();
        }
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
                // A plain source-over fill now (see .room-tint in
                // _build-mode.scss for why the multiply blend had to go), so the
                // alpha carries the whole tint — raised to the same 0.34 the
                // surface selection overlays use.
                fill: RoomPanel.roomColour(room.id, 0.34),
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
        const target = roomId || null;
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

    // Any square of the map, wall or floor. The cursor has to tell "there is
    // nothing here" from "there is something here and it is not floor", and
    // only this knows the difference.
    cellAt(event) {
        const map = this.gameMap;
        const world = map?.container?.inputHandler?.screenToWorldCoordinates?.(event.clientX, event.clientY);
        if (!world || !map?.gridSystem) return null;
        const cell = map.gridSystem.worldToGrid(world.x, world.y);
        if (cell.x < 0 || cell.y < 0 || cell.x >= map.gridSystem.gridWidth || cell.y >= map.gridSystem.gridHeight) {
            return null;
        }
        return cell;
    }

    pointerToCell(event) {
        const cell = this.cellAt(event);
        if (!cell) return null;
        // Masonry is not floor and cannot be in a room. Refusing here is what
        // keeps a stroke across a doorway from painting the door.
        if (this.gameMap?.wallBuilder?.cells?.has(`${cell.x},${cell.y}`)) return null;
        return cell;
    }

    /** Make the room under this cell the one in hand. */
    roomAtCell(cell) {
        const size = this.cellSize;
        return this.gameMap?.regionManager?.innermostAt(
            (cell.x + 0.5) * size, (cell.y + 0.5) * size, 'room', size
        ) || null;
    }

    pickRoomAt(cell) {
        const room = this.roomAtCell(cell);
        if (!room) {
            this.parent.showMessage('That floor is not in a room yet.', 'info', 'Rooms');
            return false;
        }
        this.select(room.id);
        this.listElement?.querySelector('.room-row.active')?.scrollIntoView({ block: 'nearest' });
        this.parent.showMessage(`Painting with ${this.label(room)}.`, 'info', 'Rooms');
        return true;
    }

    /** The selected room for Add, or null to restore wall-derived ownership. */
    getOperation() {
        return this.operationSegment?.value || RoomPanel.OPERATIONS.SELECT;
    }

    resolveOperation(event = null) {
        const operation = this.getOperation();
        if (operation === RoomPanel.OPERATIONS.SELECT || event?.ctrlKey !== true) return operation;
        return operation === RoomPanel.OPERATIONS.REMOVE
            ? RoomPanel.OPERATIONS.ADD
            : RoomPanel.OPERATIONS.REMOVE;
    }

    resolveStrokeRoomId(event = null) {
        return this.resolveOperation(event) === RoomPanel.OPERATIONS.REMOVE ? null : this.selected;
    }

    renderOperation() {
        const selecting = this.getOperation() === RoomPanel.OPERATIONS.SELECT;
        if (this.selectHint) this.selectHint.hidden = !selecting;
        if (this.editHint) this.editHint.hidden = selecting;
        this.editOptions?.classList.toggle('is-inactive', selecting);
        document.body.classList.toggle(
            'room-select-mode',
            selecting && this.parent.isTool(UIToolModes.ROOM)
        );
    }

    handlePointerDown(event) {
        if (!this.parent.isTool(UIToolModes.ROOM) || event.button !== 0) return;
        const cell = this.pointerToCell(event);
        if (!cell || !this.assignments) return;
        event.preventDefault();
        event.stopPropagation();
        if (this.resolveOperation(event) === RoomPanel.OPERATIONS.SELECT) {
            this.pickRoomAt(cell);
            this.clearHover();
            return;
        }
        // Add with no room selected means starting a room, not silently
        // painting into whichever existing room happens to be first.
        if (this.resolveOperation(event) === RoomPanel.OPERATIONS.ADD &&
            !this.ensureBrush({ createWhenUnselected: true })) {
            this.parent.showMessage('Pick a room to paint with, or make a new one.', 'info', 'Rooms');
            this.playSound(SiteConfig.buildMode.sounds.rejected);
            return;
        }
        // Alt picks up the room under the cursor instead of painting over it —
        // the same eyedropper the Surface tool has, on the same key. Finding a
        // room in the list to paint with meant reading names to work out which
        // row is the floor you are standing on; the floor already knows.
        if (event.altKey) {
            this.pickRoomAt(cell);
            return;
        }
        this.drag = {
            pointerId: event.pointerId,
            roomId: this.resolveStrokeRoomId(event),
            start: cell,
            cells: new Map(),
            moved: false
        };
        this.paintCell(cell);
        this.hoverKey = null;
    }

    // Shift is unavailable on touch, so the panel carries the same switch.
    // Kept identical to the Wall tool's, down to the key: one gesture modifier
    // across build mode, not one per tool.
    isRectangleMode(event = null) {
        return event?.shiftKey === true || this.rectangleToggle?.checked === true;
    }

    /**
     * Every cell in the box from where the stroke started to where it is now.
     *
     * Filled, where the Wall tool's rectangle is an outline — and the two are
     * right for the same reason. A wall rectangle is a room's walls, which are
     * its edge; a floor rectangle is a room's floor, which is all of it.
     */
    rectangleCells(end) {
        const start = this.drag.start;
        const walls = this.gameMap?.wallBuilder?.cells;
        const cells = new Map();
        for (let x = Math.min(start.x, end.x); x <= Math.max(start.x, end.x); x += 1) {
            for (let y = Math.min(start.y, end.y); y <= Math.max(start.y, end.y); y += 1) {
                const key = `${x},${y}`;
                if (walls?.has(key)) continue;      // masonry is not floor
                cells.set(key, { x, y });
            }
        }
        return cells;
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
        this.drag.roomId = this.resolveStrokeRoomId(event);
        // A rectangle is redrawn from the corner every time; a freehand stroke
        // accumulates. Rebuilding a freehand stroke would erase the trail, and
        // accumulating a rectangle would leave every box you passed through.
        if (this.isRectangleMode(event)) {
            if (cell.x !== this.drag.start.x || cell.y !== this.drag.start.y) this.drag.moved = true;
            this.drag.cells = this.rectangleCells(cell);
            this.renderGhosts([...this.drag.cells.values()], this.drag.roomId);
            return;
        }
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
        // The fill declined: the floor under the cursor runs further than a
        // click has any business claiming. Refusing is the whole point — the
        // alternative is one click quietly turning the entire outdoors into a
        // room, which is a great deal of work to undo.
        if (!painted) {
            this.parent.showMessage(
                'That floor runs too far to fill in one click. Drag to paint the area you want.',
                'info', 'Rooms'
            );
            this.playSound(SiteConfig.buildMode.sounds.rejected);
            return;
        }
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
     *
     * And bounded by a cell count, because "the room it is currently in" is a
     * boundary only where there IS a room. Click bare ground — outside the
     * house, or in a space whose walls do not close — and the fill has nothing
     * to stop it: it takes every open square on the map, draws a ghost on each
     * one, and does the whole thing again every time the pointer crosses a
     * cell. That is the lag, and the fill it was computing was never one
     * anybody wanted.
     *
     * Over the limit the answer is no rather than a smaller yes: a fill that
     * stops at four hundred arbitrary squares is worse than no fill at all,
     * because the shape it leaves is one the player then has to find and
     * repair. Dragging is right there, and it says exactly what you meant.
     *
     * @returns {Array<{x: number, y: number}>|null} null if it ran past `limit`
     */
    floodFrom(start, { limit = SiteConfig.rooms?.maxFillCells ?? 400 } = {}) {
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
            if (found.length > limit) return null;
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
            // Over the map but on masonry: there is something here and floor is
            // not it. Off the map there is nothing to answer for at all.
            if (this.cellAt(source)) this.parent.setBuildCursor('refused');
            return;
        }
        if (this.getOperation() === RoomPanel.OPERATIONS.SELECT) {
            this.clearGhosts();
            this.hoverKey = `${cell.x},${cell.y}:select`;
            this.parent.setBuildCursor(this.roomAtCell(cell) ? 'ready' : null);
            return;
        }
        this.parent.setBuildCursor('ready');
        const roomId = this.resolveStrokeRoomId(source);
        const key = `${cell.x},${cell.y}:${roomId ?? 'remove'}`;
        if (this.hoverKey === key) return;
        this.hoverKey = key;
        // The whole area a click would take, not one square: a bucket that shows
        // you one tile is a bucket you have to guess at.
        //
        // Unless the click would take too much, in which case there is no area
        // to show and the square under the cursor is the honest preview — the
        // click itself says why. Drawing the refused fill would mean thousands
        // of tiles to announce that nothing is going to happen.
        const area = this.floodFrom(cell);
        this.parent.setBuildCursor(area ? 'ready' : 'refused');
        this.renderGhosts(area ?? [cell], roomId);
    }

    clearHover() {
        if (this.drag) return;
        this.hoverKey = null;
        this.hoverEvent = null;
        this.clearGhosts();
        this.parent.setBuildCursor(null);
    }

    renderGhosts(cells, roomId) {
        this.clearGhosts();
        const layer = this.gameMap?.layers?.objects;
        const size = this.cellSize;
        if (!layer) return;
        const fill = roomId ? RoomPanel.roomColour(roomId, 0.6) : null;
        // A rectangle dragged across the map is a legitimate thing to want, and
        // one div per square of it is thousands of elements rebuilt at pointer
        // rate. Past this the preview is the area's outline, which for a
        // rectangle is the same picture drawn once.
        if (cells.length > (SiteConfig.rooms?.maxGhostCells ?? 600)) {
            this.renderBulkGhost(cells, roomId, fill);
            return;
        }
        for (const cell of cells) {
            const ghost = document.createElement('div');
            ghost.className = `room-paint-ghost${roomId ? '' : ' is-reset'}${roomId === this.pending?.id ? ' is-new' : ''}`;
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

    /**
     * One box round the lot, for a preview too big to draw square by square.
     * Approximate on purpose: at that size what you need to see is how far the
     * stroke reaches, and the exact squares are the part you already know.
     */
    renderBulkGhost(cells, roomId, fill) {
        const layer = this.gameMap?.layers?.objects;
        const size = this.cellSize;
        if (!layer || !cells.length) return;
        const xs = cells.map(cell => cell.x);
        const ys = cells.map(cell => cell.y);
        const left = Math.min(...xs);
        const top = Math.min(...ys);
        const ghost = document.createElement('div');
        ghost.className = `room-paint-ghost is-bulk${roomId ? '' : ' is-reset'}${roomId === this.pending?.id ? ' is-new' : ''}`;
        Object.assign(ghost.style, {
            left: `${left * size}px`,
            top: `${top * size}px`,
            width: `${(Math.max(...xs) - left + 1) * size}px`,
            height: `${(Math.max(...ys) - top + 1) * size}px`
        });
        if (fill) ghost.style.backgroundColor = fill;
        layer.appendChild(ghost);
        this.ghostElements.push(ghost);
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
        const result = assignments.applyChanges(cells.map(cell => ({ ...cell, roomId })), {
            emit: false,
            label: `${roomId ? 'Paint' : 'Reset'} Room (${cells.length} tiles)`
        });
        // Nothing changed is not a refusal: painting a room over floor that is
        // already in that room is the most ordinary thing to do with a brush,
        // and answering it with an error noise taught people the tool was
        // broken. Silence, the way an inert wall cell is silent.
        if (!result || result.applied.length === 0) return false;

        const forward = result.applied.map(change => ({ ...change }));
        const backward = result.inverse.map(change => ({ ...change }));
        const count = result.applied.length;
        if (!this.gameMap?.buildTransaction) {
            this.parent.parent?.buildHistory?.push({
                label: `${roomId ? 'Paint' : 'Reset'} Room (${count} tile${count === 1 ? '' : 's'})`,
                undo: () => this.replayCellChanges(backward),
                redo: () => this.replayCellChanges(forward)
            });
        }

        this.playSound(SiteConfig.buildMode.sounds.paint);
        this.gameMap?.container?.worldState?.captureMap?.(this.gameMap);
        this.gameMap?.core?.user?._scheduleSave?.();
        return true;
    }

    replayCellChanges(changes) {
        this.cancelDrag();
        this.clearHover();
        this.clearPerimeterGaps();
        this.clearRoomTints();
        this.clearHighlight();
        const result = this.assignments?.applyChanges(
            changes.map(change => ({ ...change })), { emit: false }
        );
        if (!result || result.applied.length === 0) return false;
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
        // A room with no floor yet is not in the region manager: its name and
        // type live on the pending record until it has one, and settlePending
        // writes them across. Nothing to undo — none of it is on the map yet.
        if (roomId === this.pending?.id) {
            this.pending = { ...this.pending, ...patch };
            return true;
        }
        const build = this.gameMap?.buildTransaction;
        const plan = build?.document?.level(build.levelId).rooms.get(roomId);
        if (build && plan) {
            const nextName = Object.hasOwn(patch, 'name') ? patch.name : plan.displayName;
            const nextType = Object.hasOwn(patch, 'type') ? patch.type : plan.roomType;
            return build.run(label, (_draft, level) => level.rooms.set(roomId, {
                ...plan,
                displayName: nextName ?? plan.authoredDisplayName ?? roomId,
                roomType: nextType
            })).committed;
        }
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
        this.clearPerimeterGaps();
        this.operationSegment?.dispose();
        this.operationSegment = null;
        for (const unsubscribe of this._unsubscribers ?? []) unsubscribe();
        this._unsubscribers = [];
        this.parent?.parent?.canvas?.removeEventListener('pointerdown', this.boundPointerDown, true);
        this.parent?.parent?.canvas?.removeEventListener('pointerleave', this.boundPointerLeave);
        document.removeEventListener('pointermove', this.boundPointerMove, true);
        document.removeEventListener('pointerup', this.boundPointerUp, true);
        document.removeEventListener('pointercancel', this.boundPointerUp, true);
        document.body.classList.remove('room-build-mode');
        this.parent?.setBuildCursor(null);
        super.dispose();
    }
}
