class ActionSidebarManager extends UIComponent {
    constructor(parent) {
        super(parent);
        this.actionControls = this.parent.containerWrapper.querySelector('#action-controls');
        this.currentSelectedObject = null;
        this.lastInfoRefreshAt = 0;
        this.infoRefreshInterval = 250;
        this._otherInfoCache = null;
        this._otherInfoRowMap = new Map();
        this._lastAvailableActionsKey = null;
    }

    getCategoryTitle(category) {
        const titles = {
            movement: 'Movement',
            state: 'State',
            interactions: 'Interactions',
            play: 'Play',
            reactive: 'Reactive',
            carrying: 'Active Actions'
        };
        return titles[category] || category;
    }

    getMeterState(percent) {
        if (percent <= 15) return 'critical';
        if (percent <= 35) return 'low';
        if (percent <= 65) return 'okay';
        if (percent <= 85) return 'good';
        return 'full';
    }

    humanizeLabel(value, { uppercase = false } = {}) {
        const text = String(value || '')
            .replace(/MapObject$/i, '')
            .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
            .split(/[_\s-]+/)
            .filter(Boolean)
            .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
            .join(' ');

        return uppercase ? text.toUpperCase() : text;
    }

    prettifyAiToken(token) {
        return this.humanizeLabel(String(token || '').replace(/[_-]+/g, ' '));
    }

    getAiDecisionDisplay(label) {
        const segments = String(label || '')
            .split(':')
            .filter(Boolean)
            .map(segment => this.prettifyAiToken(segment))
            .filter((segment, index, items) => segment && segment !== items[index - 1]);

        return {
            primary: segments[0] ?? 'Idle',
            details: segments.slice(1)
        };
    }

    getMyteTypeLabel(myte) {
        return this.humanizeLabel(myte?.species || 'Myte', { uppercase: true });
    }

    getMapObjectTypeLabel(mapObject) {
        if (!mapObject) {
            return 'OBJECT';
        }

        const configured = mapObject.getConfig?.('sidebarTypeLabel', null);
        if (configured) {
            return this.humanizeLabel(configured, { uppercase: true });
        }

        const rawType = mapObject.type ||
            mapObject.constructor?.name?.replace(/MapObject$/i, '') ||
            'Object';
        return this.humanizeLabel(rawType, { uppercase: true });
    }

    getSlotMyte(slotElement) {
        return this.parent.parent.mytes?.find?.(myte => myte.dropTarget === slotElement) ?? null;
    }

    getTargetTypeLabel(selectedObject, activeMyte) {
        if (selectedObject instanceof Myte) {
            return this.getMyteTypeLabel(selectedObject);
        }

        if (selectedObject instanceof MapObject) {
            return this.getMapObjectTypeLabel(selectedObject);
        }

        if (selectedObject instanceof DroppedMapItem) {
            const itemDef = ItemRegistry.getItemSync?.(selectedObject.variant);
            return this.humanizeLabel(itemDef?.type || 'Item', { uppercase: true });
        }

        if (selectedObject?.classList?.contains('myte-slot')) {
            return 'SLOT';
        }

        if (selectedObject === activeMyte) {
            return this.getMyteTypeLabel(activeMyte);
        }

        return 'ELEMENT';
    }

    getMyteBehaviorLabel(myte) {
        const goalKey = myte?.getMoveType?.(myte.goal) || '';
        const labels = {
            FOLLOW: 'Following',
            FREEROAM: 'Free Roam',
            GRAVITY: 'Gravity',
            GOHOME: 'Going Home',
            QUEUE_ONLY: 'Queued'
        };

        return labels[goalKey] || this.humanizeLabel(goalKey || 'Unknown');
    }

    getMyteBehaviorDetail(myte) {
        const goalKey = myte?.getMoveType?.(myte.goal) || '';
        if (goalKey === 'FOLLOW') {
            return {
                label: 'Follow Style',
                value: this.humanizeLabel(myte?.getMoveFollowType?.(myte.followGoal) || 'Normal')
            };
        }

        if (goalKey === 'FREEROAM') {
            return {
                label: 'Autonomy',
                value: this.humanizeLabel(myte?.getMoveAutonomyType?.(myte.autonomyGoal) || 'Interact')
            };
        }

        return null;
    }

    getMyteActivityLabel(myte) {
        const currentAction = myte?.queue?.getCurrentAction?.() ?? null;
        if (currentAction) {
            return currentAction.getQueueTitle?.() ||
                currentAction.constructor?.metadata?.label ||
                currentAction.constructor?.name?.replace(/Action$/, '') ||
                'Busy';
        }

        const goalKey = myte?.getMoveType?.(myte.goal) || '';
        if (goalKey === 'GOHOME') {
            return 'Returning Home';
        }

        if (goalKey === 'FOLLOW') {
            return 'Following Cursor';
        }

        return 'Idle';
    }

    getSlotStateLabel(myte) {
        if (!myte) {
            return 'Empty';
        }

        if (!myte.isActive) {
            return 'At Home';
        }

        if (myte.goal === MOVE_TYPES.FREEROAM) {
            return 'Free Roam';
        }

        if (myte.goal === MOVE_TYPES.GOHOME) {
            return 'Returning';
        }

        return 'Deployed';
    }

    getSelectionPositionInfo(selectedObject) {
        if (typeof selectedObject?.posX === 'number' && typeof selectedObject?.posY === 'number') {
            return {
                posX: selectedObject.posX,
                posY: selectedObject.posY
            };
        }

        if (selectedObject?.classList?.contains('myte-slot')) {
            const slotMyte = this.getSlotMyte(selectedObject);
            const home = slotMyte?.getHomePosition?.();
            if (home && Number.isFinite(home.x) && Number.isFinite(home.y)) {
                return {
                    posX: home.x,
                    posY: home.y
                };
            }
        }

        return null;
    }

    getActionLabel(action, selectedObject) {
        if (!action) {
            return '';
        }

        if (selectedObject?.constructor?.name === 'CropPlantMapObject' && action.id === 'harvest') {
            return 'Harvest Crop';
        }

        if (selectedObject instanceof PortalMapObject && action.id === 'interact_object') {
            return 'Use Portal';
        }

        if (selectedObject instanceof DoorMapObject && action.id === 'interact_object') {
            return `${selectedObject.isOpen ? 'Close' : 'Open'} Door`;
        }

        if (selectedObject?.type?.toUpperCase?.() === 'GATE' && action.id === 'interact_object') {
            return `${selectedObject.isOpen ? 'Close' : 'Open'} Gate`;
        }

        if (selectedObject?.getConfig?.('interactionType') === 'light' && action.id === 'interact_object') {
            const objectLabel = selectedObject.getDisplayName?.() || selectedObject.type || 'Light';
            const isEnabled = selectedObject.isEnabled?.();
            return `${isEnabled ? 'Turn Off' : 'Turn On'} ${objectLabel}`;
        }

        return action.label;
    }

    getMajorAction(selectedObject, activeMyte, availableActions = []) {
        if (!selectedObject || !activeMyte || selectedObject === activeMyte) {
            return null;
        }

        if (typeof selectedObject.getMajorAction === 'function') {
            return selectedObject.getMajorAction(activeMyte, availableActions);
        }

        const skip = new Set(['go_to_object', 'follow_object', 'inspect', 'deep_inspect']);
        return availableActions.find(action => !skip.has(action.id)) ?? null;
    }

    isInactiveHomeMyteSelection(selectedObject) {
        return selectedObject instanceof Myte &&
            !selectedObject.isActive &&
            !!selectedObject.dropTarget;
    }

    getCurrentActionContext(selectedObject, activeMyte) {
        const currentAction = activeMyte?.queue?.getCurrentAction?.() ?? null;
        const currentActionId = currentAction?.constructor?.metadata?.id ?? '';
        const currentTarget = currentAction?.target ?? null;
        return {
            currentAction,
            currentActionId,
            currentTarget,
            isDoingAction: !!activeMyte?.queue?.isDoingAction,
            matchesSelection: !!selectedObject && currentTarget === selectedObject
        };
    }

    createActionButton(action, selectedObject, activeMyte, { prominent = false } = {}) {
        const button = document.createElement('button');
        button.textContent = this.getActionLabel(action, selectedObject);
        const actionContext = this.getCurrentActionContext(selectedObject, activeMyte);
        const titleParts = [];
        if (action.description) {
            titleParts.push(action.description);
        }

        const isCurrentSelectionAction =
            actionContext.isDoingAction &&
            actionContext.matchesSelection &&
            actionContext.currentActionId === action.id;

        if (isCurrentSelectionAction) {
            button.disabled = true;
            button.classList.add('is-in-progress');
            titleParts.push('Action in progress');
        }
        if (titleParts.length) {
            button.title = titleParts.join('\n');
        }
        if (prominent) {
            button.classList.add('primary-action');
        }

        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();

            if (action.id === 'carry_putdown') {
                activeMyte.queue.addPutDownMyte();
                this.updateActions(selectedObject);
                return;
            }

            if (action.id === 'drop_item') {
                activeMyte.queue.addDropHeldItem();
                this.updateActions(selectedObject);
                return;
            }

            const options = ActionManager.getActionOptions(
                action.id,
                selectedObject,
                activeMyte
            );

            if (options) {
                const payload = {
                    ...options,
                    userInitiated: true
                };
                activeMyte.queue.interrupt(action.id, payload);
                this.updateActions(selectedObject);
            }
        });

        return button;
    }

    emptyActionList() {
        const actionGroups = this.actionControls.querySelector('.action-groups');
        actionGroups.innerHTML = '';
        this.actionControls.classList.remove('is-visible');

        const otherInfo = this.actionControls.querySelector('.other-info');
        otherInfo.innerHTML = '';
        otherInfo.classList.remove('is-visible');
    }

    update() {
        const activeMyte = this.parent.getActiveMyte();
        if (!this.currentSelectedObject) {
            return;
        }

        if (this.currentSelectedObject instanceof MapObject &&
            (this.currentSelectedObject.active === false || !this.currentSelectedObject.element)) {
            this.parent.selectionManager.setSelected(null);
            return;
        }

        if (this.currentSelectedObject instanceof DroppedMapItem &&
            (this.currentSelectedObject.collected || !this.currentSelectedObject.active)) {
            this.parent.selectionManager.setSelected(null);
            return;
        }

        const availableKey = this._buildAvailableActionsKey(this.currentSelectedObject, activeMyte);
        if (availableKey !== this._lastAvailableActionsKey) {
            this._lastAvailableActionsKey = availableKey;
            this.updateActionList(this.currentSelectedObject);
        }

        const now = performance.now();
        if (now - this.lastInfoRefreshAt < this.infoRefreshInterval) {
            return;
        }

        this.lastInfoRefreshAt = now;
        this.renderOtherInfo(this.currentSelectedObject);
    }

    _buildAvailableActionsKey(selectedObject, activeMyte) {
        if (!selectedObject) return '';
        if (this.isInactiveHomeMyteSelection(selectedObject)) {
            return `inactive-home-myte:${selectedObject.id ?? selectedObject.name ?? 'myte'}`;
        }
        if (selectedObject instanceof DroppedMapItem) {
            return `dropped:${selectedObject.variant}|collected=${selectedObject.collected}|busy=${activeMyte?.queue?.count() ?? 0}`;
        }
        const availableActions = ActionManager.getAvailableActions(selectedObject, activeMyte);
        const actionContext = this.getCurrentActionContext(selectedObject, activeMyte);
        const busyCount = activeMyte?.queue?.count() ?? 0;
        const subjectId = selectedObject?.id ?? selectedObject?.constructor?.name ?? 'selected';
        const targetId = actionContext.currentTarget?.id ?? actionContext.currentTarget?.constructor?.name ?? '';
        return `${subjectId}|busy=${busyCount}|current=${actionContext.currentActionId}|target=${targetId}|phase=${actionContext.currentAction?.phase ?? ''}|actions=${availableActions.map(a => a.id).join(',')}`;
    }

    appendInfoRow(container, label, value, className = 'state-info') {
        const info = document.createElement('div');
        info.classList.add(className);
        const labelSpan = document.createElement('span');
        labelSpan.textContent = label;
        const valueSpan = document.createElement('span');
        valueSpan.textContent = value;
        info.append(labelSpan, ': ', valueSpan);
        container.append(info);
        return info;
    }

    getNeedFulfillmentLabel(percent) {
        if (percent <= 15) return 'Critical';
        if (percent <= 35) return 'Low';
        if (percent <= 65) return 'Okay';
        if (percent <= 85) return 'Good';
        return 'Full';
    }

    appendNeedMeter(container, label, percent, tone) {
        const wrapper = document.createElement('div');
        wrapper.classList.add('state-info', 'need-info');

        const heading = document.createElement('div');
        heading.classList.add('need-label');
        heading.textContent = `${label}: ${percent}% ${tone}`;

        const meter = document.createElement('progress');
        meter.classList.add('need-meter');
        meter.max = 100;
        meter.value = percent;
        meter.style.width = '100%';

        wrapper.append(heading, meter);
        container.append(wrapper);
    }

    appendSectionHeader(rows, key, title, className = 'info-section-title') {
        rows.push({
            label: `__header_${key}`,
            value: title,
            className
        });
    }

    appendInfoRows(rows, entries = [], defaultClassName = 'state-info') {
        entries.forEach(({ label, value, type, meta, className }) => {
            if (value == null || value === '') return;
            rows.push({
                label,
                value,
                type,
                meta,
                className: className ?? defaultClassName
            });
        });
    }

    getObjectStateRows(selectedObject) {
        const rows = [];
        const statusRows = [];

        if (selectedObject instanceof DoorMapObject) {
            statusRows.push({ label: 'State', value: selectedObject.isOpen ? 'Open' : 'Closed' });
        }

        this.appendInfoRows(statusRows, selectedObject.getSidebarStatusRows?.() ?? []);

        if (statusRows.length) {
            this.appendSectionHeader(rows, 'status', 'Status');
            rows.push(...statusRows);
        }

        const detailsRows = [];
        this.appendInfoRows(detailsRows, selectedObject.getSidebarDetailRows?.() ?? []);
        if (detailsRows.length) {
            this.appendSectionHeader(rows, 'details', 'Details');
            rows.push(...detailsRows);
        }

        return rows;
    }

    _buildOtherInfoRows(selectedObject) {
        const rows = [];
        const gridSystem = this.parent.parent.gameMap?.gridSystem;
        const positionInfo = this.getSelectionPositionInfo(selectedObject);
        const hasPosition = !!positionInfo;
        const gridCoords = hasPosition ? (gridSystem?.worldToGrid(positionInfo.posX, positionInfo.posY) ?? { x: 0, y: 0 }) : null;
        const debugMode = document.body.classList.contains('debug');

        const activeMyte = this.parent.getActiveMyte();
        const actionContext = this.getCurrentActionContext(selectedObject, activeMyte);

        if (hasPosition) {
            this.appendSectionHeader(rows, 'location', 'Location');
            this.appendInfoRows(rows, [
                { label: 'Coords', value: `[${gridCoords.x}, ${gridCoords.y}]`, className: 'position-info' },
                { label: 'World', value: debugMode ? `(${positionInfo.posX.toFixed(0)}, ${positionInfo.posY.toFixed(0)})` : null, className: 'position-info' }
            ]);
        }

        if (actionContext.matchesSelection && actionContext.currentAction) {
            this.appendSectionHeader(rows, 'current_action', 'Current Action');
            this.appendInfoRows(rows, [
                { label: 'Action', value: actionContext.currentAction.getQueueTitle?.() ?? actionContext.currentAction.constructor?.metadata?.label ?? actionContext.currentAction.constructor?.name ?? 'Action' },
                { label: 'Phase', value: actionContext.currentAction.phase ?? null }
            ]);
        }

        if (selectedObject instanceof Myte) {
            const snapshot = selectedObject.ai?.getNeedsSnapshot?.({ live: true });
            if (snapshot) {
                const vitals = snapshot.vitals ?? {};
                const behaviorDetail = this.getMyteBehaviorDetail(selectedObject);
                this.appendSectionHeader(rows, 'status', 'Status');
                this.appendInfoRows(rows, [
                    { label: 'Mood', value: `${selectedObject.stats.getMoodStatus()} (${vitals.mood ?? 0}%)` },
                    { label: 'Behavior', value: this.getMyteBehaviorLabel(selectedObject) },
                    { label: behaviorDetail?.label, value: behaviorDetail?.value },
                    { label: 'Activity', value: this.getMyteActivityLabel(selectedObject) }
                ]);
                rows.push({ label: '__header_vitals', value: 'Vitals', className: 'needs-title' });
                [
                    { id: 'energy', label: 'Energy' },
                    { id: 'health', label: 'Health' }
                ].forEach(({ id, label }) => {
                    const value = vitals[id] ?? 0;
                    rows.push({
                        label: `vital_${id}`,
                        value,
                        meta: { label, id },
                        type: 'meter',
                        cacheValue: `${id}:${value}`
                    });
                });

                rows.push({ label: '__header_needs', value: 'Needs', className: 'needs-title' });
                [
                    { id: 'mood', label: 'Mood' },
                    { id: 'fun', label: 'Fun' },
                    { id: 'comfort', label: 'Comfort' },
                    { id: 'confidence', label: 'Confidence' }
                ].forEach(({ id, label }) => {
                    const value = vitals[id] ?? 0;
                    rows.push({
                        label: `vital_${id}`,
                        value,
                        meta: { label, id },
                        type: 'meter',
                        cacheValue: `${id}:${value}`
                    });
                });

                if (snapshot.lastDecisionLabel) {
                    this.appendSectionHeader(rows, 'ai', 'AI');
                    rows.push({
                        label: 'Last AI Choice',
                        value: snapshot.lastDecisionLabel,
                        type: 'ai-choice',
                        className: 'ai-choice-info',
                        cacheValue: snapshot.lastDecisionLabel
                    });
                }
            }
        }

        if (selectedObject?.classList?.contains('myte-slot')) {
            const slotMyte = this.getSlotMyte(selectedObject);
            this.appendSectionHeader(rows, 'status', 'Status');
            this.appendInfoRows(rows, [
                { label: 'Myte', value: slotMyte?.name ?? null },
                { label: 'State', value: this.getSlotStateLabel(slotMyte) }
            ]);
        }

        if (selectedObject instanceof DroppedMapItem) {
            const itemDef = ItemRegistry.getItemSync?.(selectedObject.variant);
            const name = itemDef?.name || selectedObject.variant;
            const description = itemDef?.description || selectedObject.description || null;
            const quantity = selectedObject.quantity ?? 1;
            this.appendSectionHeader(rows, 'item', 'Item');
            this.appendInfoRows(rows, [
                { label: 'Name', value: name },
                { label: 'Quantity', value: quantity > 1 ? String(quantity) : null },
                { label: 'Description', value: description }
            ]);
        }

        if (selectedObject instanceof MapObject) {
            rows.push(...this.getObjectStateRows(selectedObject));
        }

        const debugInfo = debugMode ? (selectedObject.getSelectionDebugInfo?.() || []) : [];
        if (debugInfo.length) {
            this.appendSectionHeader(rows, 'debug', 'Debug');
            debugInfo.forEach(({ label, value }) => rows.push({ label, value: String(value) }));
        }

        return rows;
    }

    renderOtherInfo(selectedObject) {
        const otherInfo = this.actionControls.querySelector('.other-info');
        if (!otherInfo) return;

        if (!selectedObject) {
            if (otherInfo.classList.contains('is-visible')) {
                otherInfo.innerHTML = '';
                otherInfo.classList.remove('is-visible');
                this._otherInfoCache = null;
                this._otherInfoRowMap.clear();
            }
            return;
        }

        const rows = this._buildOtherInfoRows(selectedObject);
        const cacheKey = rows.map(r => `${r.label}=${r.cacheValue ?? r.value}`).join('|');

        if (cacheKey === this._otherInfoCache) return;
        this._otherInfoCache = cacheKey;

        const prevRowMap = this._otherInfoRowMap;
        const newRowMap = new Map();
        const fragment = document.createDocumentFragment();

        for (const row of rows) {
            const strVal = String(row.value);
            let el = prevRowMap.get(row.label);

            if (row.type === 'meter') {
                if (!el) {
                    el = document.createElement('div');
                    el.classList.add('state-info', 'need-info');
                    const heading = document.createElement('div');
                    heading.classList.add('need-label');
                    const meter = document.createElement('progress');
                    meter.classList.add('need-meter');
                    meter.max = 100;
                    meter.style.width = '100%';
                    el.append(heading, meter);
                }
                const heading = el.querySelector('.need-label');
                const meter = el.querySelector('progress');
                const pct = row.value;
                const text = `${row.meta.label}: ${pct}%`;
                if (heading.textContent !== text) heading.textContent = text;
                if (meter.value !== pct) meter.value = pct;
                el.dataset.state = this.getMeterState(pct);
                el.dataset.metricId = row.meta.id ?? '';
            } else if (row.type === 'ai-choice') {
                if (!el) {
                    el = document.createElement('div');
                    el.classList.add('state-info', 'ai-choice-info');
                    if (row.className) el.classList.add(row.className);

                    const label = document.createElement('div');
                    label.classList.add('ai-choice-label');
                    label.textContent = row.label;

                    const body = document.createElement('div');
                    body.classList.add('ai-choice-body');
                    el.append(label, body);
                }

                const body = el.querySelector('.ai-choice-body');
                const decision = this.getAiDecisionDisplay(row.value);
                const decisionKey = `${decision.primary}|${decision.details.join('|')}`;

                if (body && body.dataset.decisionKey !== decisionKey) {
                    body.innerHTML = '';

                    const primaryChip = document.createElement('span');
                    primaryChip.classList.add('ai-choice-chip', 'primary');
                    primaryChip.textContent = decision.primary;
                    body.appendChild(primaryChip);

                    decision.details.forEach(detail => {
                        const chip = document.createElement('span');
                        chip.classList.add('ai-choice-chip');
                        chip.textContent = detail;
                        body.appendChild(chip);
                    });

                    body.dataset.decisionKey = decisionKey;
                }
            } else if (row.label.startsWith('__header_')) {
                if (!el) {
                    el = document.createElement('div');
                    el.classList.add('state-info');
                    if (row.className) el.classList.add(row.className);
                }
                if (el.textContent !== strVal) el.textContent = strVal;
            } else {
                if (!el) {
                    el = document.createElement('div');
                    el.classList.add('state-info');
                    if (row.className) el.classList.add(row.className);
                    const labelNode = document.createElement('span');
                    labelNode.classList.add('row-label');
                    labelNode.textContent = row.label;
                    const valNode = document.createElement('span');
                    valNode.classList.add('row-value');
                    el.append(labelNode, ': ', valNode);
                }
                const span = el.querySelector('.row-value');
                if (span && span.textContent !== strVal) span.textContent = strVal;
            }

            newRowMap.set(row.label, el);
            fragment.appendChild(el);
        }

        otherInfo.innerHTML = '';
        otherInfo.appendChild(fragment);
        otherInfo.classList.add('is-visible');
        this._otherInfoRowMap = newRowMap;
    }

    updateActions(selectedObject) {
        const selectedInfo = this.actionControls.querySelector('.selected-info');
        if (!selectedInfo) return;

        const interactionType = selectedInfo.querySelector('.interaction-type .type');
        const targetType = selectedInfo.querySelector('.target-info .type');
        const targetName = selectedInfo.querySelector('.target-info .name');
        const activeMyte = this.parent.getActiveMyte();
        this.currentSelectedObject = selectedObject;
        this.lastInfoRefreshAt = 0;
        this._otherInfoCache = null;
        this._otherInfoRowMap.clear();
        this._lastAvailableActionsKey = null;

        selectedInfo.classList.remove('self-selected', 'myte-interaction', 'map-interaction', 'element-interaction');
        this.emptyActionList();

        if (selectedObject) {
            this.renderOtherInfo(selectedObject);

            if (selectedObject === this.parent.getActiveMyte()) {
                interactionType.textContent = "Selected Self";
                selectedInfo.classList.add('self-selected');
                targetType.textContent = this.getTargetTypeLabel(selectedObject, activeMyte);
                targetName.textContent = selectedObject.name;
            } else {
                interactionType.textContent = "Interacting with";

                if (selectedObject instanceof Myte) {
                    selectedInfo.classList.add('myte-interaction');
                    targetType.textContent = this.getTargetTypeLabel(selectedObject, activeMyte);
                    targetName.textContent = selectedObject.name;
                } else if (selectedObject instanceof MapObject) {
                    selectedInfo.classList.add('map-interaction');
                    targetType.textContent = this.getTargetTypeLabel(selectedObject, activeMyte);
                    targetName.textContent = selectedObject.getDisplayName?.() || selectedObject.type;
                } else if (selectedObject instanceof DroppedMapItem) {
                    selectedInfo.classList.add('element-interaction');
                    targetType.textContent = this.getTargetTypeLabel(selectedObject, activeMyte);
                    const itemDef = ItemRegistry.getItemSync?.(selectedObject.variant);
                    targetName.textContent = itemDef?.name || selectedObject.variant || 'Item';
                    this.actionControls.classList.add('is-visible');
                } else if (selectedObject?.classList?.contains('myte-slot')) {
                    selectedInfo.classList.add('map-interaction');
                    targetType.textContent = this.getTargetTypeLabel(selectedObject, activeMyte);
                    targetName.textContent = selectedObject.querySelector('.myte-home-label .name')?.textContent?.trim()
                        || selectedObject.id
                        || 'Home Slot';
                } else if (selectedObject instanceof Element) {
                    selectedInfo.classList.add('element-interaction');
                    targetType.textContent = "Element";
                    targetName.textContent = selectedObject.tagName;
                } else {
                    selectedInfo.classList.add('element-interaction');
                    targetType.textContent = "Element";
                    targetName.textContent = selectedObject.tagName;
                }
            }

            selectedInfo.classList.add('is-visible');
            this.updateActionList(selectedObject);
        } else {
            interactionType.textContent = "Not Selected";
            targetType.textContent = "-";
            targetName.textContent = "None";
            selectedInfo.classList.remove('is-visible');
        }
    }

    _createDroppedItemPickupButton(selectedObject, activeMyte) {
        const button = document.createElement('button');
        button.textContent = 'Pick Up';
        button.classList.add('primary-action');
        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();

            if (!activeMyte || selectedObject.collected) return;
            const itemCenter = {
                x: selectedObject.posX + (selectedObject.size.width / 2),
                y: selectedObject.posY + (selectedObject.size.height / 2)
            };
            activeMyte.queue.interrupt('astar-move', {
                target: { x: itemCenter.x, y: itemCenter.y },
                userInitiated: true
            });
        });
        return button;
    }

    _createActivateMyteButton(selectedObject) {
        const button = document.createElement('button');
        button.textContent = 'Activate';
        button.classList.add('primary-action');
        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();

            if (!(selectedObject instanceof Myte) || selectedObject.isActive) return;

            selectedObject.startWithOptions({
                goal: DEFAULT_MODE,
                followGoal: selectedObject.followGoal,
                autonomyGoal: selectedObject.autonomyGoal
            });
            selectedObject.parent?.setActiveMyte?.(selectedObject);
            selectedObject.holdInHomeSlotUntilPointerLeaves?.();
            this.parent.selectionManager?.setSelected?.(selectedObject);
        });
        return button;
    }

    updateActionList(selectedObject) {
        const actionGroups = this.actionControls.querySelector('.action-groups');
        const previousScrollTop = actionGroups.scrollTop;
        actionGroups.innerHTML = '';
        const activeMyte = this.parent.getActiveMyte();

        if (selectedObject instanceof DroppedMapItem) {
            this.actionControls.classList.add('is-visible');
            if (activeMyte && !selectedObject.collected) {
                const groupEl = document.createElement('div');
                groupEl.className = 'action-group major-action';
                const ul = document.createElement('ul');
                const li = document.createElement('li');
                li.appendChild(this._createDroppedItemPickupButton(selectedObject, activeMyte));
                ul.appendChild(li);
                groupEl.appendChild(ul);
                actionGroups.appendChild(groupEl);
            }
            actionGroups.scrollTop = previousScrollTop;
            return;
        }

        if (this.isInactiveHomeMyteSelection(selectedObject)) {
            const groupEl = document.createElement('div');
            groupEl.className = 'action-group major-action';
            const ul = document.createElement('ul');
            const li = document.createElement('li');
            li.appendChild(this._createActivateMyteButton(selectedObject));
            ul.appendChild(li);
            groupEl.appendChild(ul);
            actionGroups.appendChild(groupEl);
            this.actionControls.classList.add('is-visible');
            actionGroups.scrollTop = previousScrollTop;
            return;
        }

        if (selectedObject?.classList?.contains('myte-slot')) {
            const slotMyte = this.parent.parent.mytes?.find?.(m => m.dropTarget === selectedObject);
            if (slotMyte && slotMyte === activeMyte && !slotMyte.isAtHomePosition?.(1)) {
                const groupEl = document.createElement('div');
                groupEl.className = 'action-group major-action';
                const ul = document.createElement('ul');
                const li = document.createElement('li');
                const btn = document.createElement('button');
                btn.textContent = 'Go Home';
                btn.addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    slotMyte.clearHomeSlotHold?.();
                    slotMyte.queue.clear();
                    slotMyte.setMode(MOVE_TYPES.GOHOME);
                });
                li.appendChild(btn);
                ul.appendChild(li);
                groupEl.appendChild(ul);
                actionGroups.appendChild(groupEl);
                this.actionControls.classList.add('is-visible');
            }
            actionGroups.scrollTop = previousScrollTop;
            return;
        }

        const availableActions = ActionManager.getAvailableActions(selectedObject, activeMyte);
        const majorAction = this.getMajorAction(selectedObject, activeMyte, availableActions);
        const groupedActions = availableActions
            .filter(action => action.id !== majorAction?.id)
            .reduce((groups, action) => {
                const cat = action.category;
                if (!groups[cat]) groups[cat] = [];
                groups[cat].push(action);
                return groups;
            }, {});

        if (majorAction) {
            const majorActionElement = document.createElement('div');
            majorActionElement.className = 'action-group major-action';

            const actionList = document.createElement('ul');
            const li = document.createElement('li');
            li.appendChild(this.createActionButton(majorAction, selectedObject, activeMyte, {
                prominent: true
            }));
            actionList.appendChild(li);
            majorActionElement.appendChild(actionList);
            actionGroups.appendChild(majorActionElement);
        }

        Object.entries(groupedActions).forEach(([category, actions]) => {
            const groupElement = document.createElement('div');
            groupElement.className = `action-group ${category}`;

            const title = document.createElement('h3');
            title.textContent = this.getCategoryTitle(category);
            groupElement.appendChild(title);

            const actionList = document.createElement('ul');
            actions.forEach(action => {
                const li = document.createElement('li');
                li.appendChild(this.createActionButton(action, selectedObject, activeMyte));
                actionList.appendChild(li);
            });

            groupElement.appendChild(actionList);
            actionGroups.appendChild(groupElement);
        });

        if (selectedObject === activeMyte && activeMyte && !activeMyte.isAtHomePosition?.(1)) {
            const groupEl = document.createElement('div');
            groupEl.className = 'action-group movement';
            const h3 = document.createElement('h3');
            h3.textContent = 'Movement';
            const ul = document.createElement('ul');
            const li = document.createElement('li');
            const btn = document.createElement('button');
            btn.textContent = 'Go Home';
            btn.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                activeMyte.clearHomeSlotHold?.();
                activeMyte.queue.clear();
                activeMyte.setMode(MOVE_TYPES.GOHOME);
            });
            li.appendChild(btn);
            ul.appendChild(li);
            groupEl.appendChild(h3);
            groupEl.appendChild(ul);
            actionGroups.appendChild(groupEl);
        }

        if (actionGroups.children.length > 0) {
            this.actionControls.classList.add('is-visible');
        }

        actionGroups.scrollTop = previousScrollTop;
    }

    dispose() {
        this.currentSelectedObject = null;
        this._otherInfoCache = null;
        this._otherInfoRowMap.clear();
        this._lastAvailableActionsKey = null;
        this.actionControls = null;
    }
}
