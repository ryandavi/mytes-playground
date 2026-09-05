class BuildInspector extends ModalWindow {
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
            node.append(button);
            const rooms = level.rooms.values().filter(room => room.buildingId === building.id);
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
        button.textContent = label;
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
        const adjacency = this.parent?.parent?.gameMap?.buildTransaction?.cache?.topology?.adjacency || [];
        return adjacency.some(edge => edge.roomA === room.id || edge.roomB === room.id) ? null : 'No entrance';
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
            root.append(this.propertyHeading(plan.displayName, 'Building'));
            root.append(this.nameEditor(plan.displayName, value => this.parent.buildMarqueeSelection.renameBuilding(value)));
            root.append(this.actionRow([
                ['Move', () => this.beginBuildingMove()],
                ['Duplicate', () => this.parent.buildMarqueeSelection.duplicateSelection()],
                ['Separate', () => this.parent.buildMarqueeSelection.separateBuilding()],
                ['Merge', () => this.parent.buildMarqueeSelection.mergeSelectedBuildings()],
                ['Demolish', () => this.parent.buildMarqueeSelection.confirmDemolition(), 'is-danger']
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
            root.append(this.roomBuildingEditor(room));
            root.append(this.actionRow([
                ['Edit area', () => this.openTool(UIToolModes.ROOM, room.id)],
                ['Paint floor', () => this.parent.surfaceCustomizePanel.openRoomSurface(room.id, 'floor')],
                ['Paint walls', () => this.parent.surfaceCustomizePanel.openRoomSurface(room.id, 'wall')]
            ]));
            return;
        }
        if (selection.kind === 'atom') {
            const details = this.atomDetails(selection.id, map);
            if (!details) return root.append(BuildInspector.message('This wall surface no longer exists.'));
            root.append(this.propertyHeading(details.Surface, 'Wall surface'));
            delete details.Surface;
            root.append(this.detailsList(details));
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

    beginBuildingMove() {
        this.parent.showMessage?.('Drag the selected building on the map to move it.', 'info', 'Move Building');
        return true;
    }

    roomBuildingEditor(room) {
        const label = document.createElement('label');
        label.className = 'setting-item setting-item--stacked';
        const title = document.createElement('span');
        title.textContent = 'Move to building';
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
        select.value = room.buildingId || '';
        select.addEventListener('change', () => {
            map?.buildTransaction?.run(`Move ${room.displayName}`, (_draft, level) => {
                const current = level.rooms.get(room.id);
                if (current) level.rooms.set(room.id, { ...current, buildingId: select.value || null });
            });
        });
        label.append(title, select);
        return label;
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
        return {
            Surface: `${face} half ${half + 1}`,
            Construction: wall.constructionId,
            Finish: finishId,
            Source: source,
            Building: building?.displayName || 'Unassigned',
            'Adjacent room': room?.displayName || 'Exterior'
        };
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
        for (const [label, action, className] of actions) {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = label;
            if (className) button.classList.add(className);
            button.addEventListener('click', action);
            row.append(button);
        }
        return row;
    }

    openTool(mode, roomId = null) {
        if (roomId) this.parent.roomPanel.selected = roomId;
        return this.parent.changeToolMode(mode);
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
