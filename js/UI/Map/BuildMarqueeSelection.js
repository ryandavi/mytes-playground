class BuildMarqueeSelection extends UIComponent {
    constructor(parent) {
        super(parent);
        this.drag = null;
        this.selectedWallCells = [];
        this.marquee = null;
        this.wallHighlights = [];
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
            const component = room && this.container?.gameMap?.buildingTopology?.getComponentForRoom(room.id);
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
            const room = cell && this.container?.gameMap?.wallBuilder?.roomAtOpenCell(cell.x, cell.y);
            const component = room && this.container?.gameMap?.buildingTopology?.getComponentForRoom(room.id);
            if (component) {
                this.selectBuilding(component);
                this.preferredScope = 'building';
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
        for (const [label, titleText, action, className] of [
            ['Duplicate', 'Place a structural copy beside this selection', () => this.duplicateSelection()],
            ['Demolish', 'Remove the selected structure', () => this.confirmDemolition(), 'is-danger']
        ]) {
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
        return this.selectedRooms()
            .map(room => room.properties?.buildingName)
            .find(name => typeof name === 'string' && name.trim()) ?? null;
    }

    renameBuilding(name) {
        const rooms = this.selectedRooms();
        if (rooms.length === 0) return false;
        const previous = rooms.map(room => ({ roomId: room.id, name: room.properties?.buildingName ?? null }));
        if (previous.every(entry => entry.name === name)) return false;
        const apply = values => {
            for (const entry of values) {
                const room = this.container?.gameMap?.regionManager?.get('room', entry.roomId);
                if (room) room.properties.buildingName = entry.name;
            }
            this.container?.gameMap?.eventManager?.emit(EVENTS.ROOMS_CHANGED, {
                mapId: this.container.gameMap.id,
                rooms: this.container.gameMap.regionManager?.all('room') ?? []
            });
        };
        const next = previous.map(entry => ({ ...entry, name }));
        apply(next);
        this.container.buildHistory?.push({
            label: name ? `Name Building ${name}` : 'Clear Building Name',
            undo: () => apply(previous),
            redo: () => apply(next)
        });
        this.container?.worldState?.captureMap?.(this.container.gameMap);
        this.container?.core?.user?._scheduleSave?.();
        return true;
    }

    getSelectedWallCells() {
        return [...this.selectedWallCells];
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
            const component = this.container?.gameMap?.buildingTopology?.getComponentAtWallFace(cell);
            if (component) {
                if (remember) this.preferredScope = scope;
                return this.selectBuilding(component, additive, cell);
            }
        }
        if (remember) this.preferredScope = scope;
        this.selectedWallCells = additive ? this.mergeWallCells(this.selectedWallCells, cells) : cells;
        this.selectionKind = scope;
        this.selectionRoomIds = [];
        this.selectionAnchor = { x: cell.x, y: cell.y };
        this.parent.selectionManager.setSelection([]);
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
        this.selectionRoomIds = [...component.roomIds];
        this.selectionAnchor = anchor ? { x: anchor.x, y: anchor.y } : (cells[0] ? { ...cells[0] } : null);
        this.parent.selectionManager.setSelection([]);
        this.renderWallHighlights();
        return true;
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
        if (!builder || !grid) return false;
        const sourceKeys = new Set(this.selectedWallCells.map(cell => `${cell.x},${cell.y}`));
        const targets = this.selectedWallCells.map(cell => ({ x: cell.x + dx, y: cell.y + dy }));
        const invalid = targets.some(cell => cell.x < 0 || cell.y < 0 || cell.x >= grid.gridWidth || cell.y >= grid.gridHeight ||
            (builder.baseCells.has(`${cell.x},${cell.y}`) && !sourceKeys.has(`${cell.x},${cell.y}`)));
        if (invalid) {
            this.parent.showMessage?.('The selection stayed where it was — something is in the way.', 'warning', 'Select');
            this.renderWallHighlights();
            return false;
        }
        const removals = this.selectedWallCells
            .filter(cell => !targets.some(target => target.x === cell.x && target.y === cell.y))
            .map(cell => ({ ...cell, data: null }));
        const additions = targets
            .filter(cell => !sourceKeys.has(`${cell.x},${cell.y}`))
            .map(cell => {
                const source = this.selectedWallCells[targets.indexOf(cell)];
                return { ...cell, data: Utility.deepClone(builder.baseCells.get(`${source.x},${source.y}`) || {}) };
            });
        const contentMove = { cells: sourceKeys, dx, dy };
        const movedOverrides = builder.faceOverridesWithin(sourceKeys);
        const result = builder.applyWallCellChanges([...removals, ...additions], { atomic: true, contentMove });
        if (!result?.applied?.length) {
            this.parent.showMessage?.('The selection stayed where it was.', 'warning', 'Select');
            this.renderWallHighlights();
            return false;
        }
        const assignments = map.roomAssignments;
        const assignmentChanges = this.assignmentChangesForMove(assignments, dx, dy);
        const assignmentResult = assignments?.applyChanges(assignmentChanges, { emit: false }) ?? { applied: [], inverse: [] };
        map.roomEnclosureDetector?.detect?.();
        builder.retargetFaceOverrides(movedOverrides);
        const forward = Utility.deepClone(result.applied);
        const backward = Utility.deepClone(result.inverse);
        const assignmentForward = Utility.deepClone(assignmentResult.applied);
        const assignmentBackward = Utility.deepClone(assignmentResult.inverse);
        const inverseMove = WallBuilder.invertContentMove(contentMove);
        const replay = (walls, rooms, move) => {
            builder.applyWallCellChanges(Utility.deepClone(walls), { validate: false, contentMove: move });
            assignments?.applyChanges(Utility.deepClone(rooms), { emit: false });
            map.roomEnclosureDetector?.detect?.();
            builder.retargetFaceOverrides(movedOverrides);
        };
        this.container.buildHistory?.push({
            label: `Move ${this.selectionKind === 'building' ? 'Building' : 'Walls'} (${this.selectedWallCells.length} cells)`,
            undo: () => replay(backward, assignmentBackward, inverseMove),
            redo: () => replay(forward, assignmentForward, contentMove)
        });
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
        if (!builder || !grid || this.selectedWallCells.length === 0) return false;
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
        const [dx, dy] = offset;
        const additions = this.selectedWallCells.map(cell => ({
            x: cell.x + dx,
            y: cell.y + dy,
            data: Utility.deepClone(builder.baseCells.get(`${cell.x},${cell.y}`) || {})
        }));
        const result = builder.applyWallCellChanges(additions, { atomic: true });
        if (!result?.applied?.length) return false;

        const takenRoomIds = new Set([
            ...(map.roomAssignments?.roomIds?.() ?? []),
            ...(map.regionManager?.all('room') ?? []).map(room => room.id)
        ]);
        const mintRoomId = () => {
            for (let index = 1; ; index += 1) {
                const id = `${RoomAssignments.PAINTED_PREFIX}${index}`;
                if (takenRoomIds.has(id)) continue;
                takenRoomIds.add(id);
                return id;
            }
        };
        const roomIdMap = new Map(this.selectionRoomIds.map(roomId => [roomId, mintRoomId()]));
        const roomCopies = this.captureRoomCopies(roomIdMap);
        const assignmentChanges = roomCopies.flatMap(copy => copy.cells.map(([x, y]) => ({
            x: x + dx,
            y: y + dy,
            roomId: copy.roomId
        })));
        const roomResult = map.roomAssignments?.applyChanges(assignmentChanges, { emit: false }) ?? { applied: [], inverse: [] };
        map.roomEnclosureDetector?.detect?.();
        this.applyRoomProperties(roomCopies, { asCopy: true });
        const overrideCopies = this.selectedWallCells.flatMap(cell =>
            builder.createFaceOverrideCopies(builder.sampleFaceOverrideTemplate(cell), [
                { x: cell.x + dx, y: cell.y + dy }
            ]).map(record => ({ ...record, roomId: roomIdMap.get(record.roomId) ?? record.roomId }))
        );
        builder.addFaceOverrideCopies(overrideCopies);

        const forward = Utility.deepClone(result.applied);
        const backward = Utility.deepClone(result.inverse);
        const roomForward = Utility.deepClone(roomResult.applied);
        const roomBackward = Utility.deepClone(roomResult.inverse);
        const replay = (walls, rooms, { restore = false } = {}) => {
            builder.applyWallCellChanges(Utility.deepClone(walls), { validate: false });
            map.roomAssignments?.applyChanges(Utility.deepClone(rooms), { emit: false });
            map.roomEnclosureDetector?.detect?.();
            if (restore) {
                this.applyRoomProperties(roomCopies, { asCopy: true });
                builder.addFaceOverrideCopies(overrideCopies);
            }
        };
        this.container.buildHistory?.push({
            label: `Duplicate ${this.selectionKind === 'building' ? 'Building' : 'Walls'} (${additions.length} cells)`,
            undo: () => {
                builder.removeFaceOverrideCopies(overrideCopies);
                replay(backward, roomBackward);
            },
            redo: () => replay(forward, roomForward, { restore: true })
        });
        this.selectedWallCells = additions.map(({ x, y }) => ({ x, y }));
        this.selectionRoomIds = [...roomIdMap.values()].filter(Boolean);
        if (this.selectionAnchor) {
            this.selectionAnchor = { x: this.selectionAnchor.x + dx, y: this.selectionAnchor.y + dy };
        }
        this.renderWallHighlights();
        this.parent.showMessage?.('Placed a copy beside the selection. Wall-mounted objects stay with the original.', 'success', 'Duplicate');
        return true;
    }

    captureRoomCopies(roomIdMap) {
        const map = this.container?.gameMap;
        return [...roomIdMap].map(([sourceRoomId, roomId]) => {
            const room = map?.regionManager?.get('room', sourceRoomId);
            const cells = [...(room?.shape?.cells ?? [])].map(rawCell => {
                if (typeof rawCell === 'string') return rawCell.split(',').map(Number);
                if (Array.isArray(rawCell)) return rawCell;
                return [rawCell?.x, rawCell?.y];
            }).filter(([x, y]) => Number.isInteger(x) && Number.isInteger(y));
            if (cells.length === 0) return null;
            return {
                roomId,
                cells,
                properties: Utility.deepClone(room.properties || {})
            };
        }).filter(Boolean);
    }

    applyRoomProperties(copies, { asCopy = false } = {}) {
        const map = this.container?.gameMap;
        let changed = false;
        for (const copy of copies || []) {
            const room = map?.regionManager?.get('room', copy.roomId);
            if (!room) continue;
            const sourceName = copy.properties.playerName || copy.properties.displayName;
            const sourceBuildingName = copy.properties.buildingName;
            Object.assign(room.properties, copy.properties, {
                playerName: asCopy && sourceName ? `${sourceName} copy` : copy.properties.playerName ?? null,
                displayName: asCopy && sourceName ? `${sourceName} copy` : copy.properties.displayName,
                buildingName: asCopy && sourceBuildingName ? `${sourceBuildingName} copy` : sourceBuildingName ?? null
            });
            changed = true;
        }
        if (changed) {
            map?.floorBuilder?.build?.();
            map?.wallBuilder?.refreshRoomFaces?.();
            map?.eventManager?.emit(EVENTS.ROOMS_CHANGED, { mapId: map.id, rooms: map.regionManager?.all('room') });
        }
        return changed;
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
        const details = [
            `${count} wall cell${count === 1 ? '' : 's'} will be removed.`,
            rooms ? `${rooms} room${rooms === 1 ? '' : 's'} and their floor assignments will be removed.` : null,
            'Wall-mounted openings and fixtures that prevent demolition will be protected.',
            'Ctrl+Z restores the change.'
        ].filter(Boolean).join('\n');
        if (!window.confirm(`Demolish ${title}?\n\n${details}`)) return false;
        return this.storeSelection();
    }

    storeSelection() {
        const inventory = this.container?.inventory;
        const objects = this.parent.selectionManager.getSelectedObjects();
        const wallCells = [...this.selectedWallCells];
        const unstored = objects.filter(object => inventory?.storeMapObject?.(object) !== true);
        const builder = this.container?.gameMap?.wallBuilder;
        const removalCells = this.selectionKind === 'run'
            ? this.parent?.wallBuildPanel?.includeOrphanedBranches?.(builder, wallCells) ?? wallCells
            : wallCells;
        const assignments = this.container?.gameMap?.roomAssignments;
        const roomIds = new Set(this.selectionRoomIds);
        const roomSnapshots = this.captureRoomCopies(new Map(this.selectionRoomIds.map(roomId => [roomId, roomId])));
        const roomChanges = [...(assignments?.cells ?? [])]
            .filter(([, roomId]) => roomIds.has(roomId))
            .map(([key]) => {
                const [x, y] = key.split(',').map(Number);
                return { x, y, roomId: null };
            });
        let roomResult = { applied: [], inverse: [] };
        let wallResult = null;
        if (builder && wallCells.length) {
            wallResult = builder.applyWallCellChanges(removalCells.map(cell => ({ ...cell, data: null })));
        }
        if (wallResult?.applied?.length) {
            roomResult = assignments?.applyChanges(roomChanges, { emit: false }) ?? roomResult;
            this.container?.gameMap?.roomEnclosureDetector?.detect?.();
        }
        this.parent.selectionManager.setSelection(unstored);
        this.selectedWallCells = [];
        this.clearVisuals();
        if (unstored.length) this.parent.showMessage?.(`${unstored.length} object${unstored.length === 1 ? '' : 's'} could not be returned to inventory.`, 'warning', 'Selection');
        if (wallResult?.rejected?.length) {
            this.parent.showMessage?.(`${wallResult.rejected.length} protected wall cell${wallResult.rejected.length === 1 ? '' : 's'} could not be removed.`, 'warning', 'Selection');
        }
        if (wallResult?.applied?.length) {
            const forward = Utility.deepClone(wallResult.applied);
            const backward = Utility.deepClone(wallResult.inverse);
            const selectionKind = this.selectionKind;
            const replay = (walls, rooms, { restoreRooms = false } = {}) => {
                builder.applyWallCellChanges(Utility.deepClone(walls), { validate: false });
                assignments?.applyChanges(Utility.deepClone(rooms), { emit: false });
                this.container?.gameMap?.roomEnclosureDetector?.detect?.();
                if (restoreRooms) this.applyRoomProperties(roomSnapshots);
            };
            this.container.buildHistory?.push({
                label: `${selectionKind === 'building' ? 'Demolish Building' : 'Remove Wall'} (${forward.length} cells)`,
                undo: () => replay(backward, roomResult.inverse, { restoreRooms: true }),
                redo: () => replay(forward, roomResult.applied)
            });
        }
    }

    clearVisuals() {
        this.marquee?.remove();
        this.marquee = null;
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
