class BuildInspector extends ModalWindow {
    static NEW_BUILDING = '__new_building__';

    constructor(parent) {
        super(parent, {
            id: 'build-inspector-panel',
            title: 'Build Inspector',
            position: 'top-right',
            draggable: false,
            closeOnOutsideClick: false
        });
        this.activeTab = 'navigator';
        this.unsubscribeSelection = null;
        this.unsubscribeBuild = null;
        this.init();
    }

    init() {
        super.init();
        if (!this.modalElement) return;
        this.tabs = [...this.modalElement.querySelectorAll('[data-build-inspector-tab]')];
        this.views = [...this.modalElement.querySelectorAll('[data-build-inspector-view]')];
        for (const tab of this.tabs) tab.addEventListener('click', () => this.showTab(tab.dataset.buildInspectorTab));
        this.unsubscribeSelection = this.parent.buildSelection.subscribe(selection => {
            this.activeTab = selection ? 'properties' : 'navigator';
            this.render();
        });
        this.unsubscribeBuild = this.parent?.parent?.eventManager?.on(EVENTS.BUILD_COMMITTED, () => this.render());
        this.render();
    }

    handleToolModeChanged(mode) {
        if (mode === UIToolModes.MOVE) {
            this.activeTab = this.parent.buildSelection.current ? 'properties' : 'navigator';
            this.open();
            this.render();
        } else {
            super.close();
        }
    }

    showTab(name) {
        if (!['navigator', 'properties', 'palette'].includes(name)) return false;
        this.activeTab = name;
        for (const tab of this.tabs) {
            const selected = tab.dataset.buildInspectorTab === name;
            tab.classList.toggle('active', selected);
            tab.setAttribute('aria-selected', String(selected));
        }
        for (const view of this.views) view.hidden = view.dataset.buildInspectorView !== name;
        return true;
    }

    render() {
        this.renderNavigator();
        this.renderProperties();
        this.renderPalette();
        this.showTab(this.activeTab);
    }

    renderNavigator() {
        const root = this.modalElement?.querySelector('[data-build-inspector-view="navigator"]');
        if (!root) return;
        root.replaceChildren();
        const documentModel = this.parent?.parent?.gameMap?.buildDocument;
        const level = documentModel?.level?.();
        if (!documentModel || !level) {
            root.append(BuildInspector.message('No build plan is available on this map.'));
            return;
        }
        const tree = document.createElement('ul');
        tree.className = 'build-navigator-tree';
        const site = document.createElement('li');
        site.className = 'build-navigator-node build-navigator-node--site';
        const siteLabel = document.createElement('strong');
        siteLabel.textContent = 'Site';
        site.append(siteLabel);
        const children = document.createElement('ul');
        for (const building of documentModel.buildings.values()) {
            const node = document.createElement('li');
            const button = this.nodeButton('building', building.id, `Building: ${building.displayName}`);
            const rooms = level.rooms.values().filter(room => room.buildingId === building.id);
            const walls = level.walls.values().filter(wall => wall.buildingId === building.id).length;
            // What it is made of, at a glance: a building with no walls is a
            // row you would otherwise have to click to understand.
            button.append(BuildInspector.badge(
                `${rooms.length} room${rooms.length === 1 ? '' : 's'} · ${walls} wall${walls === 1 ? '' : 's'}`
            ));
            node.append(button);
            if (rooms.length) {
                const roomList = document.createElement('ul');
                for (const room of rooms) {
                    const roomNode = document.createElement('li');
                    const label = `Room: ${room.displayName}`;
                    const roomButton = this.nodeButton('room', room.id, label);
                    const badge = this.roomBadge(room);
                    if (badge) roomButton.append(BuildInspector.badge(badge));
                    roomNode.append(roomButton);
                    roomList.append(roomNode);
                }
                node.append(roomList);
            }
            children.append(node);
        }
        const outdoor = level.rooms.values().filter(room => !room.buildingId);
        if (outdoor.length) {
            const areas = document.createElement('li');
            const label = document.createElement('strong');
            label.textContent = 'Areas';
            areas.append(label);
            const list = document.createElement('ul');
            for (const room of outdoor) {
                const node = document.createElement('li');
                node.append(this.nodeButton('room', room.id, `Area: ${room.displayName}`));
                list.append(node);
            }
            areas.append(list);
            children.append(areas);
        }
        const unassigned = level.walls.values().filter(wall => !wall.buildingId).length;
        if (unassigned) {
            const node = document.createElement('li');
            const button = this.nodeButton('wall', 'unassigned', `Unassigned walls (${unassigned})`);
            node.append(button);
            children.append(node);
        }
        site.append(children);
        tree.append(site);
        root.append(tree);
    }

    nodeButton(kind, id, label) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'build-navigator-button';
        button.title = label;
        const text = document.createElement('span');
        text.className = 'build-navigator-button__label';
        text.textContent = label;
        button.append(text);
        const current = this.parent.buildSelection.current;
        button.classList.toggle('is-selected', current?.kind === kind && current.id === id);
        button.addEventListener('click', () => this.select(kind, id));
        return button;
    }

    roomBadge(room) {
        if (room.seedCells.length === 0) return 'Empty';
        const state = this.parent?.parent?.gameMap?.buildTransaction?.cache?.topology?.planStates?.get(room.id);
        if ((state?.componentIds?.length || 0) > 1) return 'Disconnected';
        if (!state?.indoor) return 'Open';
        return this.hasEntrance(room.id) ? null : 'No entrance';
    }

    /** The kinds of opening that reach this room: 'door', 'window', … */
    openingTypes(roomId) {
        const topology = this.parent?.parent?.gameMap?.buildTransaction?.cache?.topology;
        return topology?.openingRooms?.get(roomId) || new Set();
    }

    /**
     * A way in — a door of this room's own, or of any room it opens onto.
     *
     * Rooms sharing an enclosure have no wall between them, so the kitchen's
     * front door is the way into the chatroom too. Counting only a room's own
     * doors called half a house sealed, and a door to the outside did not count
     * at all because adjacency records room-to-room pairs.
     */
    hasEntrance(roomId) {
        const topology = this.parent?.parent?.gameMap?.buildTransaction?.cache?.topology;
        const state = topology?.planStates?.get(roomId);
        const shared = (topology?.components || [])
            .filter(component => (state?.componentIds || []).includes(component.id))
            .flatMap(component => component.planIds || []);
        return [roomId, ...shared].some(id => this.openingTypes(id).has('door'));
    }

    /**
     * What this room is missing to be the room it says it is.
     *
     * Structure first — a way in, a window — then whatever its type asks for
     * (SiteConfig.rooms.types[].requires) and what every indoor room asks for.
     * Reported, never enforced: a room with nothing in it is a room you have
     * not finished, not a mistake. Objects are counted where they stand, so a
     * bed carried out of a bedroom takes the badge back with it.
     */
    roomNeeds(room) {
        const plan = this.parent?.parent?.gameMap?.buildDocument?.level?.().rooms.get(room.id);
        const state = this.parent?.parent?.gameMap?.buildTransaction?.cache?.topology?.planStates?.get(room.id);
        if (!plan || state?.indoor !== true) return [];
        const openings = this.openingTypes(room.id);
        const config = SiteConfig.rooms;
        const type = config.types.find(entry => entry.id === (plan.roomType || config.defaultType));
        const wanted = [...(type?.requires || []), ...config.indoorRequires];
        const present = this.objectTypesIn(room);
        return [
            ...(this.hasEntrance(room.id) ? [] : ['No entrance']),
            ...(openings.has('window') ? [] : ['No window']),
            ...wanted.filter(objectType => !present.has(objectType))
                .map(objectType => config.requirementLabels[objectType] || `No ${objectType.toLowerCase()}`)
        ];
    }

    objectTypesIn(room) {
        const map = this.parent?.parent?.gameMap;
        const cellSize = map?.gridSystem?.config?.cellSize || 32;
        const cells = room.shape?.cells;
        const types = new Set();
        for (const object of map?.objects || []) {
            if (object.active === false) continue;
            // Where it stands, not where its art starts: a bed is eight cells
            // of headboard above the square it actually occupies.
            const x = Math.floor((object.posX + ((object.size?.width || 0) / 2)) / cellSize);
            const y = Math.floor((object.posY + (object.size?.height || 0)) / cellSize);
            if (cells?.has?.(`${x},${y}`)) types.add(object.type);
        }
        return types;
    }

    select(kind, id) {
        const marquee = this.parent.buildMarqueeSelection;
        if (kind === 'building') {
            const component = marquee.buildingComponent(id);
            if (component) marquee.selectBuilding(component);
        } else if (kind === 'room') {
            marquee.clearSelection();
            this.parent.roomPanel.select(id);
        } else if (kind === 'wall' && id === 'unassigned') {
            const walls = this.parent.parent.gameMap.buildDocument.level().walls.values()
                .filter(wall => !wall.buildingId).map(({ x, y }) => ({ x, y }));
            marquee.selectedWallCells = walls;
            marquee.selectionKind = 'area';
            marquee.renderWallHighlights();
        }
        this.parent.buildSelection.set({ kind, id });
        this.showTab('properties');
    }

    renderProperties() {
        const root = this.modalElement?.querySelector('[data-build-inspector-view="properties"]');
        if (!root) return;
        root.replaceChildren();
        const selection = this.parent.buildSelection.current;
        if (!selection) {
            root.append(BuildInspector.message('Select a building, room, wall, surface, or object.'));
            return;
        }
        const map = this.parent?.parent?.gameMap;
        const level = map?.buildDocument?.level?.();
        if (selection.kind === 'building') {
            const plan = map.buildDocument.buildings.get(selection.id);
            if (!plan) return root.append(BuildInspector.message('This building no longer exists.'));
            const marquee = this.parent.buildMarqueeSelection;
            root.append(this.propertyHeading(plan.displayName, 'Building'));
            root.append(this.nameEditor(plan.displayName, value => marquee.renameBuilding(value)));
            root.append(this.buildingTypeEditor(plan));
            // An action you cannot take reads better greyed out than as a
            // button that answers with a message when you press it.
            const parts = marquee.buildingComponents(selection.id).length;
            const selectedBuildings = marquee.selectedBuildingIds().length;
            root.append(this.actionRow([
                ['Move', () => this.beginBuildingMove()],
                ['Duplicate', () => marquee.duplicateSelection()],
                ['Separate', () => marquee.separateBuilding(), null,
                    parts > 1 ? null : 'This building is already one connected structure'],
                ['Merge', () => marquee.mergeSelectedBuildings(), null,
                    selectedBuildings > 1 ? null : 'Select walls from another building to merge it in'],
                ['Demolish', () => marquee.confirmDemolition(), 'is-danger']
            ]));
            return;
        }
        if (selection.kind === 'room') {
            const room = level.rooms.get(selection.id);
            if (!room) return root.append(BuildInspector.message('This room no longer exists.'));
            root.append(this.propertyHeading(room.displayName, room.buildingId ? 'Room' : 'Area'));
            root.append(this.nameEditor(room.displayName, value => this.parent.roomPanel.commitRoom(
                room.id, { name: value }, `Rename ${room.displayName}`
            )));
            root.append(this.roomTypeEditor(room));
            root.append(this.roomColourEditor(room));
            root.append(this.roomBuildingEditor(room));
            const region = map.regionManager?.get('room', room.id);
            if (region) root.append(this.needsRow(this.roomNeeds(region)));
            root.append(this.actionRow([
                ['Edit area', () => this.openTool(UIToolModes.ROOM, room.id)],
                ['Paint floor', () => this.parent.surfaceCustomizePanel.openRoomSurface(room.id, 'floor')],
                ['Paint walls', () => this.parent.surfaceCustomizePanel.openRoomSurface(room.id, 'wall')]
            ]));
            return;
        }
        if (selection.kind === 'wall' && selection.id === 'unassigned') {
            const walls = level.walls.values().filter(wall => !wall.buildingId);
            if (walls.length === 0) return root.append(BuildInspector.message('Every wall belongs to a building.'));
            root.append(this.propertyHeading(`${walls.length} wall cells`, 'Unassigned walls'));
            // Walls with no building cannot be selected as one, renamed, merged
            // or roofed. Authored maps can still carry them, so the Navigator
            // node is also where they get adopted.
            root.append(this.buildingPicker('Assign to building', null, buildingId =>
                this.assignWallsToBuilding(walls, buildingId)));
            return;
        }
        if (selection.kind === 'wall') {
            const cells = this.parent.buildMarqueeSelection.selectedWallCells
                .filter(cell => level.walls.has(BuildKeys.cell(cell.x, cell.y)));
            const wall = level.walls.get(selection.id) || (cells[0] &&
                level.walls.get(BuildKeys.cell(cells[0].x, cells[0].y)));
            if (!wall) return root.append(BuildInspector.message('This wall no longer exists.'));
            const scope = cells.length > 1 ? `${cells.length} cells` : selection.id;
            root.append(this.propertyHeading(scope, 'Wall'));
            root.append(this.wallConstructionEditor(wall, cells));
            root.append(this.detailsList({
                // Read-only on purpose: the construction's own art decides how
                // tall a wall stands (160px for plaster). `heightCells` only
                // decides which cells merge into one run and one cutaway chain,
                // so an editor for it would look like a height control and
                // behave like a seam.
                Height: `${wall.heightCells} cell${wall.heightCells === 1 ? '' : 's'}`,
                'Connect group': wall.connectGroup,
                Building: (wall.buildingId && map.buildDocument.buildings.get(wall.buildingId)?.displayName) || 'Unassigned',
                Finish: map.wallBuilder?.resolveSurfaceFinishId({ ...wall }, 'south', null, 0) || '—'
            }));
            root.append(this.actionRow([
                ['Paint', () => this.parent.changeToolMode(UIToolModes.SURFACE)],
                ['Duplicate', () => this.parent.buildMarqueeSelection.duplicateSelection()],
                ['Demolish', () => this.parent.buildMarqueeSelection.confirmDemolition(), 'is-danger']
            ]));
            return;
        }
        if (selection.kind === 'atom') {
            const details = this.atomDetails(selection.id, map);
            if (!details) return root.append(BuildInspector.message('This wall surface no longer exists.'));
            // Named the way Paint names it: whose wall this is, then which face
            // of it. "south half 2" is an address, and nobody points at an
            // address.
            root.append(this.propertyHeading(details.Where, details.Surface));
            delete details.Surface;
            delete details.Where;
            root.append(this.detailsList(details));
            const marquee = this.parent.buildMarqueeSelection;
            const surface = marquee.selectedSurface;
            const paint = this.parent.surfaceCustomizePanel;
            const unavailable = surface ? null : 'Click a wall face to choose one';
            // The same three answers the stage bar gives, in the same words.
            root.append(this.actionRow([
                ['Paint section', () => paint.openWallSurface(surface, 'stretch'), null, unavailable],
                surface?.roomId
                    ? ['Paint the room', () => paint.openWallSurface(surface, 'room'), null, unavailable]
                    : ['Paint outside', () => paint.openWallSurface(surface, 'roomExterior'), null, unavailable],
                ['Select structure', () => surface && marquee.selectWallAt(surface.cell, 'cell'), null, unavailable]
            ]));
            return;
        }
        const details = document.createElement('dl');
        details.className = 'build-inspector-details';
        for (const [label, value] of Object.entries(selection.details || { Type: selection.kind, ID: selection.id })) {
            const term = document.createElement('dt');
            term.textContent = label;
            const description = document.createElement('dd');
            description.textContent = value == null ? '—' : String(value);
            details.append(term, description);
        }
        root.append(details);
    }

    /**
     * What a building is for. Nothing reads it yet — like the room types it
     * mirrors, it exists so behaviour that wants it ("myte sleeps at home",
     * "stock goes to the shed") has one authored vocabulary rather than
     * guessing from names.
     */
    buildingTypeEditor(plan) {
        const label = document.createElement('label');
        label.className = 'setting-item setting-item--stacked';
        const title = document.createElement('span');
        title.textContent = 'Type';
        const select = document.createElement('select');
        select.replaceChildren(...SiteConfig.buildMode.buildingTypes.map(entry => {
            const option = document.createElement('option');
            option.value = entry.id;
            option.textContent = entry.label;
            return option;
        }));
        BuildInspector.selectValue(select, plan.buildingType || SiteConfig.buildMode.defaultBuildingType);
        select.addEventListener('change', () => {
            this.parent?.parent?.gameMap?.buildTransaction?.run(`Set ${plan.displayName} type`, draft => {
                const current = draft.buildings.get(plan.id);
                if (current) draft.buildings.set(plan.id, { ...current, buildingType: select.value });
            });
        });
        label.append(title, select);
        return label;
    }

    roomTypeEditor(room) {
        const label = document.createElement('label');
        label.className = 'setting-item setting-item--stacked';
        const title = document.createElement('span');
        title.textContent = 'Type';
        const select = document.createElement('select');
        select.replaceChildren(...SiteConfig.rooms.types.map(entry => {
            const option = document.createElement('option');
            option.value = entry.id;
            option.textContent = entry.label;
            return option;
        }));
        BuildInspector.selectValue(select, room.roomType || SiteConfig.rooms.defaultType);
        select.addEventListener('change', () => {
            this.parent.roomPanel.commitRoom(room.id, { type: select.value }, `Change ${room.displayName} Type`);
            this.render();
        });
        label.append(title, select);
        return label;
    }

    /**
     * The room's colour, by hand. Automatic is the default and stays available:
     * the derived colour is stable per room id and well spread, and picking one
     * is for the case where two rooms happen to read alike.
     */
    roomColourEditor(room) {
        const wrapper = document.createElement('div');
        wrapper.className = 'setting-item setting-item--stacked';
        // Automatic is not a colour, it is the absence of a choice, so it sits
        // on the label line as a mode rather than in the palette as a
        // thirteenth swatch leaving one orphan on a second row.
        const header = document.createElement('div');
        header.className = 'build-inspector-colours__header';
        const title = document.createElement('span');
        title.textContent = 'Colour';
        const row = document.createElement('div');
        row.className = 'build-inspector-colours';
        const choose = index => this.parent?.parent?.gameMap?.buildTransaction?.run(
            `Colour ${room.displayName}`, (_draft, level) => {
                const current = level.rooms.get(room.id);
                if (current) level.rooms.set(room.id, { ...current, colourIndex: index });
            }
        );
        const swatch = (index, label) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'build-inspector-colour';
            button.title = label;
            button.setAttribute('aria-label', label);
            button.style.background = RoomPanel.roomColour(room.id, 0.95, index);
            const chosen = (room.colourIndex ?? null) === index;
            button.classList.toggle('is-selected', chosen);
            button.setAttribute('aria-pressed', String(chosen));
            button.addEventListener('click', () => {
                choose(index);
                this.render();
            });
            return button;
        };
        const auto = document.createElement('button');
        auto.type = 'button';
        auto.className = 'build-inspector-colour-auto';
        auto.textContent = 'Automatic';
        auto.title = 'Take the colour from the room id, as every room does until you choose';
        const automatic = (room.colourIndex ?? null) === null;
        auto.classList.toggle('is-selected', automatic);
        auto.setAttribute('aria-pressed', String(automatic));
        auto.addEventListener('click', () => {
            choose(null);
            this.render();
        });
        header.append(title, auto);
        RoomPanel.HUES.forEach((hue, index) => row.append(swatch(index, `Colour ${index + 1}`)));
        wrapper.append(header, row);
        return wrapper;
    }

    /**
     * What the selected wall is built of.
     *
     * Construction is the one wall property with real consequences — the art,
     * the thickness, the height it stands to — and it had no control anywhere.
     * Changing it rebuilds those cells' geometry, so it goes through the same
     * transaction a build does and undoes in one step.
     */
    wallConstructionEditor(wall, cells) {
        const registry = this.parent?.parent?.gameMap?.wallMaterialRegistry;
        const label = document.createElement('label');
        label.className = 'setting-item setting-item--stacked';
        const title = document.createElement('span');
        title.textContent = 'Construction';
        const select = document.createElement('select');
        select.replaceChildren(...[...(registry?.constructions?.keys?.() || [])].map(id => {
            const option = document.createElement('option');
            option.value = id;
            option.textContent = id.replaceAll('_', ' ');
            return option;
        }));
        BuildInspector.selectValue(select, wall.constructionId);
        // One construction is all `wall-materials.json` defines today. The
        // control stays, so it is obvious where a second one would appear, but
        // a dropdown you cannot change anything with should say so.
        if (select.options.length < 2) {
            select.disabled = true;
            select.title = 'This map has one wall construction. More are added in data/map-objects/wall-materials.json.';
        }
        select.addEventListener('change', () => {
            this.editWallCells(cells, current => ({
                ...current,
                constructionId: select.value,
                // The connect group follows the construction unless it was
                // authored to something else: two walls join when their groups
                // match, and silently keeping the old one is how a rebuilt wall
                // stops connecting to itself.
                connectGroup: current.connectGroup === current.constructionId ? select.value : current.connectGroup
            }), 'Change wall construction');
        });
        label.append(title, select);
        return label;
    }

    editWallCells(cells, edit, label) {
        const map = this.parent?.parent?.gameMap;
        const keys = cells.map(cell => BuildKeys.cell(cell.x, cell.y));
        const committed = map?.buildTransaction?.run(label, (_draft, level) => {
            for (const key of keys) {
                const current = level.walls.get(key);
                if (current) level.walls.set(key, edit(current));
            }
        });
        // Geometry changed under the pieces the selection outlines.
        this.parent.buildMarqueeSelection.renderWallHighlights();
        this.render();
        return committed;
    }

    needsRow(needs) {
        // Not a `.setting-hint`: that is a two-column grid for an icon and a
        // paragraph, and the second badge in the row was being stretched across
        // the whole 1fr column by it.
        const row = document.createElement('div');
        row.className = 'build-inspector-needs';
        if (needs.length === 0) {
            const done = document.createElement('span');
            done.className = 'build-inspector-needs__done';
            done.textContent = 'Nothing missing.';
            row.append(done);
            return row;
        }
        for (const need of needs) row.append(BuildInspector.badge(need));
        return row;
    }

    beginBuildingMove() {
        return this.parent.buildMarqueeSelection.armMove();
    }

    roomBuildingEditor(room) {
        return this.buildingPicker('Move to building', room.buildingId || '', buildingId => {
            const map = this.parent?.parent?.gameMap;
            map?.buildTransaction?.run(`Move ${room.displayName}`, (draft, level) => {
                const current = level.rooms.get(room.id);
                if (!current) return;
                const target = buildingId === BuildInspector.NEW_BUILDING
                    ? WallStructure.createBuilding(draft)
                    : buildingId || null;
                level.rooms.set(room.id, { ...current, buildingId: target });
            });
        });
    }

    /**
     * The one place a building is made by hand. Nothing else in build mode
     * creates one — walls adopt the building they touch — so without this a
     * map that was authored without walls has no building to move a room into.
     */
    buildingPicker(titleText, value, onChange) {
        const label = document.createElement('label');
        label.className = 'setting-item setting-item--stacked';
        const title = document.createElement('span');
        title.textContent = titleText;
        const select = document.createElement('select');
        const site = document.createElement('option');
        site.value = '';
        site.textContent = 'Site (outdoor area)';
        select.append(site);
        const map = this.parent?.parent?.gameMap;
        for (const building of map?.buildDocument?.buildings?.values?.() || []) {
            const option = document.createElement('option');
            option.value = building.id;
            option.textContent = building.displayName;
            select.append(option);
        }
        const created = document.createElement('option');
        created.value = BuildInspector.NEW_BUILDING;
        created.textContent = 'New building…';
        select.append(created);
        select.value = value ?? '';
        select.addEventListener('change', () => {
            onChange(select.value);
            this.render();
        });
        label.append(title, select);
        return label;
    }

    assignWallsToBuilding(walls, buildingId) {
        const map = this.parent?.parent?.gameMap;
        const keys = walls.map(wall => BuildKeys.cell(wall.x, wall.y));
        return map?.buildTransaction?.run('Assign walls to building', (draft, level) => {
            const target = buildingId === BuildInspector.NEW_BUILDING
                ? WallStructure.createBuilding(draft)
                : buildingId || null;
            for (const key of keys) {
                const wall = level.walls.get(key);
                if (wall) level.walls.set(key, { ...wall, buildingId: target });
            }
        });
    }

    atomDetails(id, map) {
        const match = String(id).match(/^(-?\d+),(-?\d+)\/([^/]+)\/([01])$/);
        if (!match) return null;
        const [, xText, yText, face, halfText] = match;
        const x = Number(xText);
        const y = Number(yText);
        const half = Number(halfText);
        const level = map?.buildDocument?.level?.();
        const wall = level?.walls.get(BuildKeys.cell(x, y));
        if (!wall) return null;
        const surface = map.wallBuilder.getCellSurfaces({
            ...wall,
            mask: map.buildTransaction?.cache?.geometry?.masks?.get(BuildKeys.cell(x, y)) || 0
        }).find(candidate => candidate.face === face && candidate.half === half);
        if (!surface) return null;
        const explicit = level.atoms.get(id)?.finishId || null;
        const room = surface.roomId ? level.rooms.get(surface.roomId) : null;
        const building = wall.buildingId ? map.buildDocument.buildings.get(wall.buildingId) : null;
        const buildingFinish = !room ? building?.exteriorFinishId : null;
        const finishId = explicit || room?.wallFinishId || buildingFinish || map.wallBuilder.wallData.defaults.finishId;
        const source = explicit ? 'Atom override'
            : room?.wallFinishId ? 'Room default'
                : buildingFinish ? 'Building default'
                    : 'Construction default';
        const fronts = surface.roomId ? null : this.frontsRoom(surface);
        return {
            Where: room ? room.displayName : (fronts ? `Outside · ${fronts}` : 'Outside'),
            Surface: SurfaceCustomizePanel.SURFACE_LABELS[face] || `${face} face`,
            Construction: wall.constructionId,
            Finish: finishId,
            Source: source,
            Building: building?.displayName || 'Unassigned',
            Side: room ? 'Interior' : 'Exterior'
        };
    }

    /** The room an exterior face fronts, for naming it the way Paint does. */
    frontsRoom(surface) {
        const panel = this.parent?.surfaceCustomizePanel;
        const roomId = panel?.adjacentRoomId?.(surface);
        const room = roomId ? this.parent?.parent?.gameMap?.regionManager?.get('room', roomId) : null;
        return room?.properties?.displayName || room?.id || null;
    }

    detailsList(values) {
        const details = document.createElement('dl');
        details.className = 'build-inspector-details';
        for (const [label, value] of Object.entries(values)) {
            const term = document.createElement('dt');
            term.textContent = label;
            const description = document.createElement('dd');
            description.textContent = value == null ? '—' : String(value);
            details.append(term, description);
        }
        return details;
    }

    renderPalette() {
        const root = this.modalElement?.querySelector('[data-build-inspector-view="palette"]');
        if (!root) return;
        root.replaceChildren(this.actionRow([
            ['Structure', () => this.openTool(UIToolModes.WALL)],
            ['Rooms', () => this.openTool(UIToolModes.ROOM)],
            ['Paint', () => this.openTool(UIToolModes.SURFACE)],
            ['Ground', () => this.openTool(UIToolModes.TERRAIN)]
        ]));
    }

    propertyHeading(name, kind) {
        const heading = document.createElement('div');
        heading.className = 'build-inspector-heading';
        const title = document.createElement('strong');
        title.textContent = name;
        const type = document.createElement('span');
        type.textContent = kind;
        heading.append(title, type);
        return heading;
    }

    nameEditor(value, commit) {
        const label = document.createElement('label');
        label.className = 'setting-item setting-item--stacked';
        const title = document.createElement('span');
        title.textContent = 'Name';
        const input = document.createElement('input');
        input.type = 'text';
        input.value = value || '';
        input.maxLength = 24;
        input.addEventListener('change', () => commit(input.value.trim()));
        label.append(title, input);
        return label;
    }

    actionRow(actions) {
        const row = document.createElement('div');
        row.className = 'button-row build-inspector-actions';
        for (const [label, action, className, disabledReason] of actions) {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = label;
            if (className) button.classList.add(className);
            // A reason is what disables it: an action that cannot run should
            // look like it, and say why on hover rather than on click.
            if (disabledReason) {
                button.disabled = true;
                button.title = disabledReason;
            } else {
                button.addEventListener('click', action);
            }
            row.append(button);
        }
        return row;
    }

    openTool(mode, roomId = null) {
        if (roomId) this.parent.roomPanel.selected = roomId;
        return this.parent.changeToolMode(mode);
    }

    /**
     * Show what is stored even when the list has never heard of it. A dropdown
     * silently blanking itself is how an authored value gets thrown away by the
     * next person who touches any other field on the panel.
     */
    static selectValue(select, value) {
        if (value && !select.querySelector(`option[value="${CSS.escape(String(value))}"]`)) {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = `${value} (custom)`;
            select.append(option);
        }
        select.value = value;
        return select;
    }

    static badge(text) {
        const badge = document.createElement('span');
        badge.className = 'build-navigator-badge';
        badge.textContent = text;
        return badge;
    }

    static message(text) {
        const message = document.createElement('p');
        message.className = 'setting-hint setting-hint--persistent';
        message.textContent = text;
        return message;
    }

    dispose() {
        this.unsubscribeSelection?.();
        this.unsubscribeBuild?.();
        this.unsubscribeSelection = null;
        this.unsubscribeBuild = null;
        super.dispose();
    }
}
