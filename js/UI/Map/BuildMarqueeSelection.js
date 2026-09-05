class BuildMarqueeSelection extends UIComponent {
    constructor(parent) {
        super(parent);
        this.drag = null;
        this.selectedWallCells = [];
        this.marquee = null;
        this.wallHighlights = [];
        this.roomHighlight = null;
        this.boundDown = this.onPointerDown.bind(this);
        this.boundMove = this.onPointerMove.bind(this);
        this.boundUp = this.onPointerUp.bind(this);
        this.boundClick = this.onClick.bind(this);
        this.swallowClick = false;
        this.emptyPress = null;
        this.armTimer = null;
        this.structureDrag = null;
        this.selectionKind = null;
        this.selectionRoomIds = [];
        this.actionBar = null;
        this.preferredScope = 'cell';
        this.selectionAnchor = null;
    }

    init() {
        this.container?.canvas?.addEventListener('pointerdown', this.boundDown, true);
        document.addEventListener('pointermove', this.boundMove, true);
        document.addEventListener('pointerup', this.boundUp, true);
        document.addEventListener('pointercancel', this.boundUp, true);
        this.container?.canvas?.addEventListener('click', this.boundClick, true);
    }

    isActive() {
        return this.container?.gameMode?.isBuild() === true &&
            this.parent?.isTool?.(UIToolModes.MOVE);
    }

    onPointerDown(event) {
        if (!this.isActive() || event.button !== 0 || event.target?.closest?.(InputComponent.UI_SELECTOR)) return;
        if (this.container?.camera?._spacePanActive) return;
        if (event.target?.closest?.('.map-object, .myte-slot, .world-myte, .interactive-myte')) return;
        const cell = this.pointerCell(event);
        const builder = this.container?.gameMap?.wallBuilder;
        if (cell && builder?.baseCells.has(`${cell.x},${cell.y}`)) {
            event.preventDefault();
            event.stopPropagation();
            const selected = this.selectedWallCells.some(entry => entry.x === cell.x && entry.y === cell.y);
            const scope = event.detail >= 2 ? 'run' : this.preferredScope;
            if (!selected || event.shiftKey) this.selectWallAt(cell, scope, event.shiftKey, { remember: event.detail >= 2 });
            this.structureDrag = {
                pointerId: event.pointerId,
                start: cell,
                end: cell,
                moved: false,
                cells: this.getSelectedWallCells()
            };
            return;
        }
        if (cell && event.shiftKey !== true && event.pointerType === 'touch') {
            const room = builder?.roomAtOpenCell(cell.x, cell.y);
            const component = room && this.buildingComponentForRoom(room.id);
            if (component) {
                event.preventDefault();
                event.stopPropagation();
                this.selectBuilding(component);
                this.preferredScope = 'building';
                this.swallowClick = true;
                return;
            }
        }
        if (event.pointerType !== 'touch' && event.shiftKey !== true) {
            this.emptyPress = {
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                cell
            };
            return;
        }
        this.clearVisuals();
        this.drag = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            endX: event.clientX,
            endY: event.clientY,
            additive: event.shiftKey === true,
            pending: event.pointerType === 'touch'
        };
        if (this.drag.pending) {
            this.armTimer = window.setTimeout(
                () => this.armTouchMarquee(),
                SiteConfig.interaction.gestures.longPressDelay
            );
            return;
        }
        this.createMarquee();
        event.preventDefault();
        event.stopPropagation();
    }

    createMarquee() {
        this.marquee = document.createElement('div');
        this.marquee.className = 'build-selection-marquee';
        document.body.appendChild(this.marquee);
        this.renderMarquee();
    }

    armTouchMarquee() {
        if (!this.drag?.pending) return;
        this.drag.pending = false;
        this.armTimer = null;
        this.container?.camera?.cancelTouchPanForSelection?.();
        this.createMarquee();
    }

    onPointerMove(event) {
        if (this.structureDrag?.pointerId === event.pointerId) {
            const cell = this.pointerCell(event);
            if (!cell) return;
            this.structureDrag.end = cell;
            this.structureDrag.moved ||= cell.x !== this.structureDrag.start.x || cell.y !== this.structureDrag.start.y;
            if (this.structureDrag.moved) this.renderTranslatedHighlights(
                cell.x - this.structureDrag.start.x,
                cell.y - this.structureDrag.start.y
            );
            event.preventDefault();
            return;
        }
        if (this.emptyPress?.pointerId === event.pointerId) {
            const distance = Math.hypot(
                event.clientX - this.emptyPress.startX,
                event.clientY - this.emptyPress.startY
            );
            if (distance > SiteConfig.interaction.gestures.clickMoveThreshold) this.emptyPress = null;
        }
        if (!this.drag || event.pointerId !== this.drag.pointerId) return;
        if (this.drag.pending) {
            const distance = Math.hypot(event.clientX - this.drag.startX, event.clientY - this.drag.startY);
            if (distance > SiteConfig.interaction.gestures.clickMoveThreshold) this.cancelDrag();
            return;
        }
        this.drag.endX = event.clientX;
        this.drag.endY = event.clientY;
        this.renderMarquee();
        event.preventDefault();
    }

    onPointerUp(event) {
        if (this.structureDrag?.pointerId === event.pointerId) {
            const drag = this.structureDrag;
            this.structureDrag = null;
            if (drag.moved) {
                const dx = drag.end.x - drag.start.x;
                const dy = drag.end.y - drag.start.y;
                this.moveWallSelection(dx, dy);
            } else {
                this.renderWallHighlights();
            }
            this.swallowClick = true;
            event.preventDefault();
            event.stopPropagation();
            return;
        }
        if (this.emptyPress?.pointerId === event.pointerId) {
            const cell = this.emptyPress.cell;
            this.emptyPress = null;
            // Floors are selectable in their own right. A click on one used to
            // jump straight to the whole building, which is a strange answer to
            // "what did I just click" and left no way to reach the room itself.
            // It reads like the wall scopes now: one click is the thing, two is
            // what it belongs to.
            const room = cell && this.container?.gameMap?.wallBuilder?.roomAtOpenCell(cell.x, cell.y);
            const component = room && event.detail >= 2 ? this.buildingComponentForRoom(room.id) : null;
            if (component) {
                this.selectBuilding(component);
                this.preferredScope = 'building';
            } else if (room) {
                this.selectRoom(room.id, cell);
            } else {
                this.parent.selectionManager.setSelection([]);
                this.clearSelection();
            }
            this.swallowClick = true;
        }
        if (!this.drag || event.pointerId !== this.drag.pointerId) return;
        if (this.drag.pending) {
            this.cancelDrag();
            this.parent.selectionManager.setSelection([]);
            this.clearSelection();
            return;
        }
        this.drag.endX = event.clientX;
        this.drag.endY = event.clientY;
        const rect = this.dragRect();
        const additive = this.drag.additive === true;
        this.drag = null;
        this.marquee?.remove();
        this.marquee = null;
        this.selectWithin(rect, additive);
        this.swallowClick = true;
        event.preventDefault();
        event.stopPropagation();
    }

    onClick(event) {
        if (!this.swallowClick) return;
        this.swallowClick = false;
        event.preventDefault();
        event.stopPropagation();
    }

    dragRect() {
        const { startX, startY, endX, endY } = this.drag;
        const left = Math.min(startX, endX);
        const top = Math.min(startY, endY);
        return { left, top, right: Math.max(startX, endX), bottom: Math.max(startY, endY), width: Math.abs(endX - startX), height: Math.abs(endY - startY) };
    }

    renderMarquee() {
        const rect = this.dragRect();
        Object.assign(this.marquee.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
    }

    intersects(a, b) {
        return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
    }

    selectWithin(rect, additive = false) {
        const objects = (this.container?.gameMap?.objects || []).filter(object =>
            object.active !== false && object.element && this.intersects(rect, object.element.getBoundingClientRect())
        );
        const selectedObjects = additive
            ? [...this.parent.selectionManager.getSelectedObjects(), ...objects]
            : objects;
        this.parent.selectionManager.setSelection(selectedObjects);
        const wallCells = this.wallCellsWithin(rect);
        this.selectedWallCells = additive
            ? this.mergeWallCells(this.selectedWallCells, wallCells)
            : wallCells;
        this.selectionKind = this.selectedWallCells.length ? 'area' : null;
        this.selectionRoomIds = [];
        this.selectionAnchor = this.selectedWallCells[0] ? { ...this.selectedWallCells[0] } : null;
        this.renderWallHighlights();
        this.parent.actionSidebarManager?.updateActions?.(
            selectedObjects.length === 1 && this.selectedWallCells.length === 0 ? selectedObjects[0] : null
        );
    }

    mergeWallCells(current, added) {
        const byKey = new Map([...current, ...added].map(cell => [`${cell.x},${cell.y}`, cell]));
        return [...byKey.values()];
    }

    wallCellsWithin(rect) {
        const builder = this.container?.gameMap?.wallBuilder;
        const input = this.container?.inputHandler;
        if (!builder || !input) return [];
        const from = input.screenToWorldCoordinates(rect.left, rect.top);
        const to = input.screenToWorldCoordinates(rect.right, rect.bottom);
        return [...builder.baseCells.values()].filter(cell => {
            const left = cell.x * builder.cellSize;
            const top = cell.y * builder.cellSize;
            return left < to.x && left + builder.cellSize > from.x && top < to.y && top + builder.cellSize > from.y;
        }).map(cell => ({ x: cell.x, y: cell.y }));
    }

    renderWallHighlights() {
        this.wallHighlights.forEach(element => element.remove());
        this.wallHighlights = [];
        const builder = this.container?.gameMap?.wallBuilder;
        const layer = this.container?.gameMap?.layers?.objects;
        if (!builder || !layer) return;
        for (const cell of this.selectedWallCells) {
            const element = document.createElement('div');
            element.className = 'build-selection-cell';
            Object.assign(element.style, {
                left: `${cell.x * builder.cellSize}px`,
                top: `${cell.y * builder.cellSize}px`,
                width: `${builder.cellSize}px`,
                height: `${builder.cellSize}px`
            });
            layer.appendChild(element);
            this.wallHighlights.push(element);
        }
        this.renderActionBar();
    }

    renderActionBar() {
        this.actionBar?.remove();
        this.actionBar = null;
        if (this.selectionKind === 'room') return this.renderRoomActionBar();
        if (this.selectedWallCells.length === 0 || this.wallHighlights.length === 0) return;
        const bar = document.createElement('div');
        bar.className = 'stage-bar build-selection-actions ignore';
        bar.setAttribute('role', 'toolbar');
        bar.setAttribute('aria-label', 'Structural selection');
        const summary = this.selectionSummary();
        const inspector = document.createElement('div');
        inspector.className = 'build-selection-actions__inspector';
        const title = this.selectionKind === 'building'
            ? this.createBuildingNameInput(summary.title)
            : document.createElement('strong');
        if (this.selectionKind !== 'building') title.textContent = summary.title;
        const details = document.createElement('span');
        details.textContent = summary.details;
        inspector.append(title, details);
        const controls = document.createElement('div');
        controls.className = 'build-selection-actions__controls';
        const scopes = document.createElement('div');
        scopes.className = 'segment-control build-selection-actions__scopes';
        scopes.setAttribute('role', 'group');
        scopes.setAttribute('aria-label', 'Selection scope');
        for (const [scope, label, buttonTitle] of [
            ['cell', 'Segment', 'Select one wall segment'],
            ['run', 'Run', 'Select the straight wall run'],
            ['building', 'Building', 'Select every wall and room in this connected building']
        ]) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'segment-btn';
            button.textContent = label;
            button.title = buttonTitle;
            const active = this.preferredScope === scope;
            button.classList.toggle('active', active);
            button.setAttribute('aria-pressed', String(active));
            button.addEventListener('click', () => this.changeSelectionScope(scope));
            scopes.appendChild(button);
        }
        const actions = document.createElement('div');
        actions.className = 'stage-bar__group build-selection-actions__operations';
        const operationSpecs = [
            ['Duplicate', 'Place a structural copy beside this selection', () => this.duplicateSelection()],
            ['Demolish', 'Remove the selected structure', () => this.confirmDemolition(), 'is-danger']
        ];
        if (this.selectionKind === 'building') operationSpecs.splice(1, 0,
            ['Separate', 'Make disconnected parts separate named buildings', () => this.separateBuilding()],
            ['Merge', 'Merge selected buildings into the anchored building', () => this.mergeSelectedBuildings()]
        );
        for (const [label, titleText, action, className] of operationSpecs) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'stage-bar__action';
            button.textContent = label;
            button.title = titleText;
            if (className) button.classList.add(className);
            button.addEventListener('click', action);
            actions.appendChild(button);
        }
        const hint = document.createElement('span');
        hint.className = 'build-selection-actions__hint';
        hint.textContent = 'Drag to move';
        controls.append(scopes, actions, hint);
        bar.append(inspector, controls);
        this.container?.element?.appendChild(bar);
        this.actionBar = bar;
    }

    renderRoomActionBar() {
        const roomId = this.selectionRoomIds[0];
        const room = this.container?.gameMap?.regionManager?.get('room', roomId);
        if (!room) return;
        const bar = document.createElement('div');
        bar.className = 'stage-bar build-selection-actions ignore';
        bar.setAttribute('role', 'toolbar');
        bar.setAttribute('aria-label', 'Room selection');
        const inspector = document.createElement('div');
        inspector.className = 'build-selection-actions__inspector';
        const title = document.createElement('strong');
        title.textContent = room.properties?.displayName || room.id;
        const details = document.createElement('span');
        const tiles = room.shape?.cells?.size ?? 0;
        details.textContent = `Room · ${tiles} tile${tiles === 1 ? '' : 's'}`;
        inspector.append(title, details);
        const actions = document.createElement('div');
        actions.className = 'stage-bar__group build-selection-actions__operations';
        const ui = this.parent;
        for (const [label, titleText, action] of [
            ['Paint floor', 'Choose the finish for this floor',
                () => ui.surfaceCustomizePanel?.openRoomSurface(roomId, 'floor')],
            ['Paint walls', 'Choose the finish of the walls facing this room',
                () => ui.surfaceCustomizePanel?.openRoomSurface(roomId, 'wall')],
            ['Edit area', 'Redraw which tiles belong to this room',
                () => ui.roomPanel?.select?.(roomId) ?? false],
            ['Building', 'Select the whole building this room belongs to', () => {
                const component = this.buildingComponentForRoom(roomId);
                if (component) return this.selectBuilding(component);
                ui.showMessage?.('This room is not part of a building yet.', 'info', 'Select');
                return false;
            }]
        ]) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'stage-bar__action';
            button.textContent = label;
            button.title = titleText;
            button.addEventListener('click', action);
            actions.appendChild(button);
        }
        const controls = document.createElement('div');
        controls.className = 'build-selection-actions__controls';
        controls.append(actions);
        bar.append(inspector, controls);
        this.container?.element?.appendChild(bar);
        this.actionBar = bar;
    }

    selectionSummary() {
        const count = this.selectedWallCells.length;
        if (!count) return { title: 'Nothing selected', details: '' };
        const xs = this.selectedWallCells.map(cell => cell.x);
        const ys = this.selectedWallCells.map(cell => cell.y);
        const width = Math.max(...xs) - Math.min(...xs) + 1;
        const height = Math.max(...ys) - Math.min(...ys) + 1;
        const rooms = this.selectionRoomIds.length;
        const scope = this.selectionKind === 'building'
            ? this.buildingName() || 'Building'
            : ({ cell: 'Wall segment', run: 'Wall run', area: 'Area' }[this.selectionKind] || 'Structure');
        const roomText = rooms ? ` · ${rooms} room${rooms === 1 ? '' : 's'}` : '';
        return {
            title: scope,
            details: `${count} wall cell${count === 1 ? '' : 's'} · ${width}×${height}${roomText}`
        };
    }

    createBuildingNameInput(placeholder) {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'build-selection-actions__name';
        input.value = this.buildingName() || '';
        input.placeholder = placeholder;
        input.maxLength = 24;
        input.autocomplete = 'off';
        input.spellcheck = false;
        input.setAttribute('aria-label', 'Building name');
        input.addEventListener('pointerdown', event => event.stopPropagation());
        input.addEventListener('keydown', event => {
            if (event.key === 'Enter') input.blur();
        });
        input.addEventListener('change', () => this.renameBuilding(input.value.trim() || null));
        return input;
    }

    selectedRooms() {
        const regions = this.container?.gameMap?.regionManager;
        return this.selectionRoomIds.map(roomId => regions?.get('room', roomId)).filter(Boolean);
    }

    buildingName() {
        const map = this.container?.gameMap;
        const buildingId = this.selectedBuildingIds()[0] || this.selectedRooms()
            .map(room => map?.buildDocument?.level?.().rooms.get(room.id)?.buildingId)
            .find(Boolean);
        const planName = buildingId ? map?.buildDocument?.buildings.get(buildingId)?.displayName : null;
        if (planName) return planName;
        return this.selectedRooms()
            .map(room => room.properties?.buildingName)
            .find(name => typeof name === 'string' && name.trim()) ?? null;
    }

    selectedBuildingIds() {
        const walls = this.container?.gameMap?.buildDocument?.level?.().walls;
        return [...new Set(this.selectedWallCells.map(cell =>
            walls?.get(BuildKeys.cell(cell.x, cell.y))?.buildingId
        ).filter(Boolean))];
    }

    mergeSelectedBuildings() {
        const map = this.container?.gameMap;
        const build = map?.buildTransaction;
        const ids = this.selectedBuildingIds();
        if (!build || ids.length < 2) {
            this.parent.showMessage?.('Select walls from at least two buildings to merge them.', 'info', 'Buildings');
            return false;
        }
        const anchorId = this.selectionAnchor
            ? map.buildDocument.level().walls.get(BuildKeys.cell(this.selectionAnchor.x, this.selectionAnchor.y))?.buildingId
            : null;
        const survivorId = ids.includes(anchorId) ? anchorId : ids[0];
        const merged = new Set(ids);
        const committed = build.run(`Merge Buildings into ${map.buildDocument.buildings.get(survivorId)?.displayName || survivorId}`,
            (draft, level) => {
                for (const [key, wall] of level.walls.entries()) if (merged.has(wall.buildingId)) {
                    level.walls.set(key, { ...wall, buildingId: survivorId });
                }
                for (const [id, room] of level.rooms.entries()) if (merged.has(room.buildingId)) {
                    level.rooms.set(id, { ...room, buildingId: survivorId });
                }
                for (const id of ids) if (id !== survivorId) draft.buildings.delete(id);
            }).committed;
        if (!committed) return false;
        this.selectBuilding(this.buildingComponent(survivorId), false, this.selectionAnchor);
        return true;
    }

    separateBuilding() {
        const map = this.container?.gameMap;
        const build = map?.buildTransaction;
        const buildingId = this.selectedBuildingIds()[0];
        const level = map?.buildDocument?.level?.();
        const plan = buildingId ? map.buildDocument.buildings.get(buildingId) : null;
        if (!build || !level || !plan) return false;
        const remaining = new Set(level.walls.entries()
            .filter(([, wall]) => wall.buildingId === buildingId)
            .map(([key]) => key));
        const components = [];
        while (remaining.size) {
            const first = remaining.values().next().value;
            remaining.delete(first);
            const cells = [first];
            for (let index = 0; index < cells.length; index++) {
                const { x, y } = BuildKeys.parseCell(cells[index]);
                for (const key of [BuildKeys.cell(x - 1, y), BuildKeys.cell(x + 1, y),
                    BuildKeys.cell(x, y - 1), BuildKeys.cell(x, y + 1)]) {
                    if (!remaining.delete(key)) continue;
                    cells.push(key);
                }
            }
            components.push(cells.sort());
        }
        if (components.length < 2) {
            this.parent.showMessage?.('This building is already one connected structure.', 'info', 'Buildings');
            return false;
        }
        const anchorKey = this.selectionAnchor ? BuildKeys.cell(this.selectionAnchor.x, this.selectionAnchor.y) : null;
        components.sort((left, right) => Number(right.includes(anchorKey)) - Number(left.includes(anchorKey)) ||
            right.length - left.length || left[0].localeCompare(right[0]));
        const ids = [buildingId];
        for (let index = 1; index < components.length; index++) {
            for (let suffix = index + 1; ; suffix++) {
                const candidate = `${buildingId}_part_${suffix}`;
                if (map.buildDocument.buildings.has(candidate) || ids.includes(candidate)) continue;
                ids[index] = candidate;
                break;
            }
        }
        const distanceTo = (seed, component) => {
            const point = BuildKeys.parseCell(seed);
            return component.reduce((best, key) => {
                const wall = BuildKeys.parseCell(key);
                return Math.min(best, Math.abs(point.x - wall.x) + Math.abs(point.y - wall.y));
            }, Infinity);
        };
        const committed = build.run(`Separate ${plan.displayName}`, (draft, draftLevel) => {
            for (let index = 1; index < components.length; index++) draft.buildings.set(ids[index], {
                ...plan,
                id: ids[index],
                displayName: `${plan.displayName} ${index + 1}`,
                authoredDisplayName: `${plan.authoredDisplayName || plan.displayName} ${index + 1}`
            });
            components.forEach((component, index) => component.forEach(key => {
                const wall = draftLevel.walls.get(key);
                draftLevel.walls.set(key, { ...wall, buildingId: ids[index] });
            }));
            for (const [roomId, room] of draftLevel.rooms.entries()) {
                if (room.buildingId !== buildingId || room.seedCells.length === 0) continue;
                const index = components.map(component => Math.min(...room.seedCells.map(seed => distanceTo(seed, component))))
                    .reduce((best, value, candidate, values) => value < values[best] ? candidate : best, 0);
                draftLevel.rooms.set(roomId, { ...room, buildingId: ids[index] });
            }
        }).committed;
        if (!committed) return false;
        this.selectBuilding(this.buildingComponent(buildingId), false, this.selectionAnchor);
        return true;
    }

    renameBuilding(name) {
        const map = this.container?.gameMap;
        const build = map?.buildTransaction;
        const buildingId = this.selectedBuildingIds()[0] || this.selectedRooms()
            .map(room => build?.document?.level(build.levelId).rooms.get(room.id)?.buildingId)
            .find(Boolean);
        const building = buildingId ? build?.document?.buildings.get(buildingId) : null;
        if (!build || !building) return false;
        const displayName = name || building.authoredDisplayName || building.id;
        if (displayName === building.displayName) return false;
        const committed = build.run(name ? `Name Building ${name}` : 'Clear Building Name', draft => {
            draft.buildings.set(buildingId, { ...building, displayName });
        }).committed;
        if (committed) {
            this.container?.worldState?.captureMap?.(map);
            this.container?.core?.user?._scheduleSave?.();
        }
        return committed;
    }

    getSelectedWallCells() {
        return [...this.selectedWallCells];
    }

    roomSeedAssignments() {
        const rooms = this.container?.gameMap?.buildDocument?.level?.().rooms.values() || [];
        return new Map(rooms.flatMap(room => room.seedCells.map(key => [key, room.id])));
    }

    buildingComponent(buildingId) {
        if (!buildingId) return null;
        const map = this.container?.gameMap;
        const level = map?.buildDocument?.level?.();
        if (!level || !map.buildDocument.buildings.has(buildingId)) return null;
        const wallKeys = new Set(level.walls.entries()
            .filter(([, wall]) => wall.buildingId === buildingId)
            .map(([key]) => key));
        const touchesWall = record => {
            if (Array.isArray(record.cells)) {
                return record.cells.some(([x, y]) => wallKeys.has(BuildKeys.cell(x, y)));
            }
            const from = record.cells?.from;
            const to = record.cells?.to || from;
            if (!from || !to) return false;
            for (let y = Math.min(from[1], to[1]); y <= Math.max(from[1], to[1]); y++) {
                for (let x = Math.min(from[0], to[0]); x <= Math.max(from[0], to[0]); x++) {
                    if (wallKeys.has(BuildKeys.cell(x, y))) return true;
                }
            }
            return false;
        };
        const objectIds = new Set(['openings', 'fixtures', 'attachments'].flatMap(name =>
            level[name].values().filter(touchesWall).map(record => String(record.id))
        ));
        return {
            id: buildingId,
            buildingId,
            cellKeys: wallKeys,
            roomIds: new Set(level.rooms.values()
                .filter(room => room.buildingId === buildingId)
                .map(room => room.id)),
            objectIds
        };
    }

    buildingComponentForRoom(roomId) {
        const buildingId = this.container?.gameMap?.buildDocument?.level?.().rooms.get(roomId)?.buildingId;
        return this.buildingComponent(buildingId);
    }

    buildingComponentAtCell(cell) {
        const buildingId = this.container?.gameMap?.buildDocument?.level?.().walls
            .get(BuildKeys.cell(cell.x, cell.y))?.buildingId;
        return this.buildingComponent(buildingId);
    }

    pointerCell(event) {
        const map = this.container?.gameMap;
        const world = this.container?.inputHandler?.screenToWorldCoordinates?.(event.clientX, event.clientY);
        if (!map?.gridSystem || !world) return null;
        const cell = map.gridSystem.worldToGrid(world.x, world.y);
        return cell.x >= 0 && cell.y >= 0 && cell.x < map.gridSystem.gridWidth && cell.y < map.gridSystem.gridHeight
            ? cell : null;
    }

    selectWallAt(cell, scope = this.preferredScope, additive = false, { remember = false } = {}) {
        const builder = this.container?.gameMap?.wallBuilder;
        if (!builder?.baseCells.has(`${cell.x},${cell.y}`)) return false;
        let cells = [{ x: cell.x, y: cell.y }];
        if (scope === 'run') cells = this.resolveRun(cell);
        if (scope === 'building') {
            const component = this.buildingComponentAtCell(cell);
            if (component) {
                if (remember) this.preferredScope = scope;
                return this.selectBuilding(component, additive, cell);
            }
            // Silently collapsing to one segment reads as a broken scope
            // button. The wall is real, it just has no building plan to expand
            // into, and the Inspector is where one is given to it.
            this.parent.showMessage?.(
                'These walls are not part of a building yet — assign them under Unassigned walls in the Build Inspector.',
                'info', 'Select'
            );
        }
        if (remember) this.preferredScope = scope;
        this.selectedWallCells = additive ? this.mergeWallCells(this.selectedWallCells, cells) : cells;
        this.selectionKind = scope;
        this.selectionRoomIds = [];
        this.selectionAnchor = { x: cell.x, y: cell.y };
        this.parent.selectionManager.setSelection([]);
        this.parent.buildSelection?.set({
            kind: 'wall',
            id: BuildKeys.cell(cell.x, cell.y),
            details: { Scope: scope, Cells: this.selectedWallCells.length }
        });
        this.renderWallHighlights();
        return true;
    }

    resolveRun(cell) {
        const panel = this.parent?.wallBuildPanel;
        const direct = panel?.resolveRun?.(cell);
        if (direct?.cells?.length) return direct.cells;
        return [[-1, 0], [1, 0], [0, -1], [0, 1]]
            .map(([dx, dy]) => panel?.resolveRun?.({ x: cell.x + dx, y: cell.y + dy }))
            .filter(run => run?.cells?.some(entry => entry.x === cell.x && entry.y === cell.y))
            .sort((left, right) => right.cells.length - left.cells.length ||
                left.cells[0].y - right.cells[0].y || left.cells[0].x - right.cells[0].x)[0]?.cells ??
            [{ x: cell.x, y: cell.y }];
    }

    selectBuilding(component, additive = false, anchor = null) {
        if (!component) return false;
        const cells = [...component.cellKeys].map(key => {
            const [x, y] = key.split(',').map(Number);
            return { x, y };
        });
        this.selectedWallCells = additive ? this.mergeWallCells(this.selectedWallCells, cells) : cells;
        this.selectionKind = 'building';
        this.selectionRoomIds = additive
            ? [...new Set([...this.selectionRoomIds, ...component.roomIds])]
            : [...component.roomIds];
        this.selectionAnchor = anchor ? { x: anchor.x, y: anchor.y } : (cells[0] ? { ...cells[0] } : null);
        const objects = [...(component.objectIds || [])]
            .map(id => this.container?.gameMap?.getObjectById?.(id))
            .filter(Boolean);
        this.parent.selectionManager.setSelection(additive
            ? [...this.parent.selectionManager.getSelectedObjects(), ...objects]
            : objects);
        this.parent.buildSelection?.set({ kind: 'building', id: component.buildingId || component.id });
        this.renderWallHighlights();
        return true;
    }

    /**
     * A room as a selection in its own right: no wall cells, its floor tinted
     * through its own mask, and the Inspector's room properties - rename, area,
     * both paints, which building it belongs to - one tab away.
     */
    selectRoom(roomId, anchor = null) {
        const map = this.container?.gameMap;
        const room = map?.regionManager?.get('room', roomId);
        if (!room) return false;
        this.clearVisuals();
        this.selectedWallCells = [];
        this.selectionKind = 'room';
        this.selectionRoomIds = [roomId];
        this.selectionAnchor = anchor ? { x: anchor.x, y: anchor.y } : null;
        this.parent.selectionManager.setSelection([]);
        this.parent.buildSelection?.set({ kind: 'room', id: roomId });
        this.roomHighlight = map.floorBuilder?.createRoomOverlay?.(room, {
            className: 'build-selection-room',
            fill: BuildMarqueeSelection.roomFill()
        }) ?? null;
        this.renderActionBar();
        return true;
    }

    static roomFill() {
        const accent = getComputedStyle(document.documentElement)
            .getPropertyValue('--state-info-accent').trim();
        const parts = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(accent);
        const [r, g, b] = parts
            ? [parseInt(parts[1], 16), parseInt(parts[2], 16), parseInt(parts[3], 16)]
            : [66, 133, 244];
        return `rgba(${r}, ${g}, ${b}, 0.26)`;
    }

    expandSelection(scope, { remember = false } = {}) {
        const first = this.selectedWallCells[0];
        if (!first) return false;
        return this.selectWallAt(first, scope, false, { remember });
    }

    changeSelectionScope(scope) {
        if (!['cell', 'run', 'building'].includes(scope)) return false;
        this.preferredScope = scope;
        if (scope === this.selectionKind) {
            this.renderActionBar();
            return true;
        }
        const anchor = this.selectionAnchor ?? this.selectedWallCells[0];
        if (!anchor) return false;
        if (scope === 'building' || scope === 'cell') return this.selectWallAt(anchor, scope);
        const run = this.resolveBestRun();
        if (!run) {
            this.parent.showMessage?.('No connected wall run could be resolved from this selection.', 'info', 'Select');
            this.renderActionBar();
            return false;
        }
        this.selectedWallCells = run.cells;
        this.selectionKind = 'run';
        this.selectionRoomIds = [];
        this.selectionAnchor = run.cells.some(cell => cell.x === anchor.x && cell.y === anchor.y)
            ? { x: anchor.x, y: anchor.y }
            : { ...run.cells[0] };
        this.parent.selectionManager.setSelection([]);
        this.renderWallHighlights();
        return true;
    }

    resolveBestRun() {
        const panel = this.parent?.wallBuildPanel;
        const selectedKeys = new Set(this.selectedWallCells.map(cell => `${cell.x},${cell.y}`));
        const anchor = this.selectionAnchor ?? this.selectedWallCells[0];
        const probes = new Map();
        for (const cell of [anchor, ...this.selectedWallCells].filter(Boolean)) {
            for (const [dx, dy] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]) {
                const probe = { x: cell.x + dx, y: cell.y + dy };
                probes.set(`${probe.x},${probe.y}`, probe);
            }
        }
        const runs = new Map();
        for (const probe of probes.values()) {
            const run = panel?.resolveRun?.(probe);
            if (!run?.cells?.length) continue;
            const key = run.cells.map(cell => `${cell.x},${cell.y}`).sort().join('|');
            runs.set(key, run);
        }
        const overlap = run => run.cells.filter(cell => selectedKeys.has(`${cell.x},${cell.y}`)).length;
        const containsAnchor = run => run.cells.some(cell => cell.x === anchor?.x && cell.y === anchor?.y) ? 1 : 0;
        return [...runs.values()].sort((left, right) =>
            overlap(right) - overlap(left) ||
            containsAnchor(right) - containsAnchor(left) ||
            right.cells.length - left.cells.length ||
            left.cells[0].y - right.cells[0].y || left.cells[0].x - right.cells[0].x
        )[0] ?? null;
    }

    renderTranslatedHighlights(dx, dy) {
        const original = this.selectedWallCells;
        this.selectedWallCells = original.map(cell => ({ x: cell.x + dx, y: cell.y + dy }));
        this.renderWallHighlights();
        this.selectedWallCells = original;
    }

    sweptCellKeys(dx, dy) {
        const keys = new Set();
        for (const cell of this.selectedWallCells) {
            const targetX = cell.x + dx;
            const targetY = cell.y + dy;
            for (let x = Math.min(cell.x, targetX); x <= Math.max(cell.x, targetX); x += 1) {
                for (let y = Math.min(cell.y, targetY); y <= Math.max(cell.y, targetY); y += 1) {
                    keys.add(`${x},${y}`);
                }
            }
        }
        return keys;
    }

    assignmentChangesForMove(assignments, dx, dy) {
        if (!assignments) return [];
        const roomIds = new Set(this.selectionRoomIds);
        if (this.selectionKind !== 'building' || roomIds.size === 0) {
            return [...this.sweptCellKeys(dx, dy)]
                .filter(key => assignments.cells.has(key))
                .map(key => {
                    const [x, y] = key.split(',').map(Number);
                    return { x, y, roomId: null };
                });
        }

        const moved = [...assignments.cells].filter(([, roomId]) => roomIds.has(roomId));
        const final = new Map();
        for (const [key] of moved) {
            const [x, y] = key.split(',').map(Number);
            final.set(key, { x, y, roomId: null });
        }
        for (const [key, roomId] of moved) {
            const [x, y] = key.split(',').map(Number);
            const target = { x: x + dx, y: y + dy, roomId };
            final.set(`${target.x},${target.y}`, target);
        }
        return [...final.values()];
    }

    moveWallSelection(dx, dy) {
        if ((!dx && !dy) || this.selectedWallCells.length === 0) return false;
        const map = this.container?.gameMap;
        const builder = map?.wallBuilder;
        const grid = map?.gridSystem;
        if (!builder || !grid || !map.buildTransaction) return false;
        const sourceKeys = new Set(this.selectedWallCells.map(cell => BuildKeys.cell(cell.x, cell.y)));
        const targets = this.selectedWallCells.map(cell => ({ x: cell.x + dx, y: cell.y + dy }));
        const invalid = targets.some(cell => cell.x < 0 || cell.y < 0 ||
            cell.x >= grid.gridWidth || cell.y >= grid.gridHeight ||
            (builder.baseCells.has(BuildKeys.cell(cell.x, cell.y)) &&
                !sourceKeys.has(BuildKeys.cell(cell.x, cell.y))));
        if (invalid) {
            this.parent.showMessage?.('The selection stayed where it was — something is in the way.', 'warning', 'Select');
            this.renderWallHighlights();
            return false;
        }
        const removals = this.selectedWallCells
            .filter(cell => !targets.some(target => target.x === cell.x && target.y === cell.y))
            .map(cell => ({ ...cell, data: null }));
        const additions = targets
            .filter(cell => !sourceKeys.has(BuildKeys.cell(cell.x, cell.y)))
            .map(cell => {
                const source = this.selectedWallCells[targets.indexOf(cell)];
                return { ...cell, data: Utility.deepClone(builder.baseCells.get(BuildKeys.cell(source.x, source.y)) || {}) };
            });
        const contentMove = { cells: sourceKeys, dx, dy };
        const assignmentChanges = this.assignmentChangesForMove({ cells: this.roomSeedAssignments() }, dx, dy);
        const result = builder.applyWallCellChanges([...removals, ...additions], {
            atomic: true,
            contentMove,
            roomChanges: assignmentChanges,
            label: `Move ${this.selectionKind === 'building' ? 'Building' : 'Walls'} (${this.selectedWallCells.length} cells)`
        });
        if (!result?.applied?.length) {
            this.parent.showMessage?.('The selection stayed where it was.', 'warning', 'Select');
            this.renderWallHighlights();
            return false;
        }
        this.selectedWallCells = targets;
        if (this.selectionAnchor) {
            this.selectionAnchor = { x: this.selectionAnchor.x + dx, y: this.selectionAnchor.y + dy };
        }
        this.renderWallHighlights();
        return true;
    }

    duplicateSelection() {
        const map = this.container?.gameMap;
        const builder = map?.wallBuilder;
        const grid = map?.gridSystem;
        if (!builder || !grid || !map.buildTransaction || this.selectedWallCells.length === 0) return false;
        const xs = this.selectedWallCells.map(cell => cell.x);
        const ys = this.selectedWallCells.map(cell => cell.y);
        const width = Math.max(...xs) - Math.min(...xs) + 1;
        const height = Math.max(...ys) - Math.min(...ys) + 1;
        const candidates = [[width + 1, 0], [0, height + 1], [-(width + 1), 0], [0, -(height + 1)]];
        const offset = candidates.find(([dx, dy]) => this.canDuplicateAt(dx, dy));
        if (!offset) {
            this.parent.showMessage?.('There is not enough clear space beside this selection.', 'warning', 'Duplicate');
            return false;
        }
        return this.duplicateSelectionTransaction(offset[0], offset[1]);
    }

    duplicateSelectionTransaction(dx, dy) {
        const map = this.container.gameMap;
        const builder = map.wallBuilder;
        const document = map.buildDocument;
        const level = document.level();
        const takenRoomIds = new Set(level.rooms.keys());
        const mintRoomId = () => {
            for (let index = 1; ; index++) {
                const id = `${RoomPanel.PAINTED_PREFIX}${index}`;
                if (!takenRoomIds.has(id)) {
                    takenRoomIds.add(id);
                    return id;
                }
            }
        };
        const sourceBuildingId = this.selectionKind === 'building'
            ? this.selectedWallCells.map(cell => level.walls.get(BuildKeys.cell(cell.x, cell.y))?.buildingId).find(Boolean)
            : null;
        let copiedBuildingId = sourceBuildingId;
        const buildingCopies = [];
        if (sourceBuildingId) {
            const source = document.buildings.get(sourceBuildingId);
            for (let index = 1; ; index++) {
                const candidate = `${sourceBuildingId}_copy${index === 1 ? '' : `_${index}`}`;
                if (document.buildings.has(candidate)) continue;
                copiedBuildingId = candidate;
                buildingCopies.push({
                    ...source,
                    id: candidate,
                    displayName: `${source.displayName || source.id} copy`,
                    authoredDisplayName: `${source.authoredDisplayName || source.displayName || source.id} copy`
                });
                break;
            }
        }
        const roomIdMap = new Map(this.selectionRoomIds.map(id => [id, mintRoomId()]));
        const roomCopies = [...roomIdMap].map(([sourceId, id]) => {
            const source = level.rooms.get(sourceId);
            return source ? {
                ...source,
                id,
                buildingId: source.buildingId === sourceBuildingId ? copiedBuildingId : source.buildingId,
                displayName: `${source.displayName || source.id} copy`,
                authoredDisplayName: `${source.authoredDisplayName || source.displayName || source.id} copy`,
                origin: 'painted',
                seedCells: source.seedCells.map(key => {
                    const cell = BuildKeys.parseCell(key);
                    return BuildKeys.cell(cell.x + dx, cell.y + dy);
                })
            } : null;
        }).filter(Boolean);
        const additions = this.selectedWallCells.map(cell => {
            const source = level.walls.get(BuildKeys.cell(cell.x, cell.y));
            return {
                x: cell.x + dx,
                y: cell.y + dy,
                data: {
                    ...source,
                    buildingId: source.buildingId === sourceBuildingId ? copiedBuildingId : source.buildingId
                }
            };
        });
        const atomExtensions = this.selectedWallCells.map(cell => ({
            targets: [{ x: cell.x + dx, y: cell.y + dy }],
            atoms: level.atoms.atomsOfCell(cell.x, cell.y)
        }));
        const label = `Duplicate ${this.selectionKind === 'building' ? 'Building' : 'Walls'} (${additions.length} cells)`;
        const result = builder.applyWallCellChanges(additions, {
            atomic: true,
            buildingCopies,
            roomCopies,
            atomExtensions,
            label
        });
        if (!result?.applied?.length) return false;
        this.selectedWallCells = additions.map(({ x, y }) => ({ x, y }));
        this.selectionRoomIds = [...roomIdMap.values()];
        if (this.selectionAnchor) this.selectionAnchor = {
            x: this.selectionAnchor.x + dx,
            y: this.selectionAnchor.y + dy
        };
        this.renderWallHighlights();
        this.parent.showMessage?.('Placed a copy beside the selection. Wall-mounted objects stay with the original.', 'success', 'Duplicate');
        return true;
    }



    canDuplicateAt(dx, dy) {
        const map = this.container?.gameMap;
        const builder = map?.wallBuilder;
        const grid = map?.gridSystem;
        const rules = this.container?.buildRules;
        return this.selectedWallCells.every(cell => {
            const x = cell.x + dx;
            const y = cell.y + dy;
            return x >= 0 && y >= 0 && x < grid.gridWidth && y < grid.gridHeight &&
                !builder.baseCells.has(`${x},${y}`) &&
                (rules?.canBuildWallCell(x, y)?.allowed ?? true);
        });
    }

    confirmDemolition() {
        const count = this.selectedWallCells.length;
        if (!count) return false;
        const rooms = this.selectionRoomIds.length;
        const title = this.selectionKind === 'building'
            ? this.buildingName() || 'this building'
            : 'the selected structure';
        const objects = this.parent.selectionManager.getSelectedObjects();
        const objectNames = objects.slice(0, 4).map(object => object.getDisplayName?.() || object.type).join(', ');
        const details = [
            `${count} wall cell${count === 1 ? '' : 's'} will be removed.`,
            rooms ? `${rooms} room${rooms === 1 ? '' : 's'} and their floor assignments will be removed.` : null,
            objects.length ? `${objects.length} attached object${objects.length === 1 ? '' : 's'} will stay on the map and protect their wall cells${objectNames ? `: ${objectNames}${objects.length > 4 ? ', …' : ''}` : '.'}` : null,
            'Ctrl+Z restores the change.'
        ].filter(Boolean).join('\n');
        if (!window.confirm(`Demolish ${title}?\n\n${details}`)) return false;
        return this.storeSelection();
    }

    storeSelection() {
        const inventory = this.container?.inventory;
        const objects = this.parent.selectionManager.getSelectedObjects();
        const map = this.container?.gameMap;
        const builder = map?.wallBuilder;
        if (!builder || !map.buildTransaction) return false;
        const level = map.buildDocument.level();
        const attachedIds = new Set(['openings', 'fixtures', 'attachments'].flatMap(name =>
            level[name].values().map(record => String(record.id))
        ));
        const protectedObjects = objects.filter(object => attachedIds.has(String(object.id)));
        const unstored = [
            ...protectedObjects,
            ...objects.filter(object => !attachedIds.has(String(object.id)) && inventory?.storeMapObject?.(object) !== true)
        ];
        const wallCells = [...this.selectedWallCells];
        const removalCells = this.selectionKind === 'run'
            ? this.parent?.wallBuildPanel?.includeOrphanedBranches?.(builder, wallCells) ?? wallCells
            : wallCells;
        const roomIds = new Set(this.selectionRoomIds);
        const buildingIds = this.selectionKind === 'building'
            ? this.selectedBuildingIds()
            : [];
        const wallResult = removalCells.length
            ? builder.applyWallCellChanges(removalCells.map(cell => ({ ...cell, data: null })), {
                deleteRoomIds: this.selectionKind === 'building' ? [...roomIds] : [],
                deleteBuildingIds: buildingIds,
                atomic: this.selectionKind === 'building',
                label: `${this.selectionKind === 'building' ? 'Demolish Building' : 'Remove Wall'} (${removalCells.length} cells)`
            })
            : null;
        this.parent.selectionManager.setSelection(unstored);
        if (unstored.length) this.parent.showMessage?.(
            `${unstored.length} attached object${unstored.length === 1 ? '' : 's'} remain on the map.`,
            'warning', 'Selection'
        );
        if (wallResult?.rejected?.length) this.parent.showMessage?.(
            `${wallResult.rejected.length} protected wall cell${wallResult.rejected.length === 1 ? '' : 's'} could not be removed.`,
            'warning', 'Selection'
        );
        if (!wallResult?.applied?.length) return false;
        this.selectedWallCells = [];
        this.clearVisuals();
        return true;
    }

    clearVisuals() {
        this.marquee?.remove();
        this.marquee = null;
        this.roomHighlight?.remove();
        this.roomHighlight = null;
        this.wallHighlights.forEach(element => element.remove());
        this.wallHighlights = [];
        this.actionBar?.remove();
        this.actionBar = null;
    }

    clearSelection() {
        this.selectedWallCells = [];
        this.selectionKind = null;
        this.selectionRoomIds = [];
        this.selectionAnchor = null;
        this.parent.buildSelection?.clear();
        this.clearVisuals();
    }

    cancelDrag() {
        if (!this.drag && !this.emptyPress && !this.structureDrag) return false;
        window.clearTimeout(this.armTimer);
        this.armTimer = null;
        this.drag = null;
        this.emptyPress = null;
        this.structureDrag = null;
        this.marquee?.remove();
        this.marquee = null;
        this.swallowClick = false;
        return true;
    }

    dispose() {
        this.container?.canvas?.removeEventListener('pointerdown', this.boundDown, true);
        document.removeEventListener('pointermove', this.boundMove, true);
        document.removeEventListener('pointerup', this.boundUp, true);
        document.removeEventListener('pointercancel', this.boundUp, true);
        this.container?.canvas?.removeEventListener('click', this.boundClick, true);
        this.clearVisuals();
        window.clearTimeout(this.armTimer);
        super.dispose();
    }
}
