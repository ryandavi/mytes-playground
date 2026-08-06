class ActionSidebarManager extends UIComponent {
    constructor(parent) {
        super(parent);
        this.actionControls = this.parent.containerWrapper.querySelector('#action-controls');
        this.currentSelectedObject = null;
        this._otherInfoCache = null;
        this._otherInfoStructureKey = null;
        this._otherInfoRowMap = new Map();
        this._eventUnsubscribers = [];
        this._refreshQueued = false;
    }

    init() {
        const eventManager = this.parent.parent.eventManager;
        if (!eventManager) return;

        const invalidateActions = ({ myte = null, object = null } = {}) => {
            const activeMyte = this.parent.getActiveMyte();
            if (myte && myte !== activeMyte && myte !== this.currentSelectedObject) return;
            if (object && object !== this.currentSelectedObject) return;
            this.queueRefresh(true);
        };
        const invalidateDetails = ({ myte = null } = {}) => {
            if (myte && myte !== this.currentSelectedObject) return;
            this.queueRefresh(false);
        };

        ['myte:queue_changed', 'myte:mode_changed', 'myte:started', 'myte:stopped',
            'container:active_myte_changed', 'myte:stats_changed', 'world:action_availability_changed',
            'chest:opened', 'plant:matured', 'plant:pollinated', 'plant:mutated']
            .forEach(event => this._eventUnsubscribers.push(eventManager.on(event, invalidateActions)));
        ['myte:ai_decision_changed']
            .forEach(event => this._eventUnsubscribers.push(eventManager.on(event, invalidateDetails)));
    }

    queueRefresh(actionsChanged) {
        this._refreshActions = this._refreshActions || actionsChanged;
        if (this._refreshQueued) return;
        this._refreshQueued = true;
        queueMicrotask(() => {
            this._refreshQueued = false;
            const selected = this.currentSelectedObject;
            if (!selected) return;
            if ((selected instanceof MapObject && (selected.active === false || !selected.element)) ||
                (selected instanceof DroppedMapItem && (selected.collected || !selected.active))) {
                this.parent.selectionManager.setSelected(null);
                return;
            }
            if (this._refreshActions) this.updateActionList(selected);
            this._refreshActions = false;
            this.renderOtherInfo(selected);
        });
    }

    getCategoryTitle(category) {
        const titles = SiteConfig.ui.labels.actionCategories;
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
        const labels = SiteConfig.ui.labels.myteBehaviors;

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
        const labels = SiteConfig.ui.labels.slotStates;
        if (!myte) return labels.empty;
        if (!myte.isActive) return labels.home;
        if (myte.goal === MOVE_TYPES.FREEROAM) return labels.freeroam;
        if (myte.goal === MOVE_TYPES.GOHOME) return labels.returning;
        return labels.deployed;
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
        return action?.label ?? '';
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

        // Unavailable-but-explained: visible, disabled, and it says why on hover.
        if (action.unavailableReason) {
            button.disabled = true;
            button.classList.add('is-unavailable');
            button.setAttribute('aria-disabled', 'true');
            titleParts.push(action.unavailableReason);
        }
        if (titleParts.length) {
            this.bindTooltip(button, titleParts.join(' - '));
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

            const directInteractEnabled = this.parent?.debugOverlay?.isDirectWorldInteractionEnabled?.();
            const canRunDirectInteraction =
                directInteractEnabled &&
                selectedObject &&
                typeof selectedObject.runDebugDirectInteraction === 'function' &&
                action.category !== 'movement' &&
                !['inspect', 'deep_inspect'].includes(action.id);

            if (canRunDirectInteraction) {
                const handled = selectedObject.runDebugDirectInteraction(
                    selectedObject.container ?? this.parent.parent
                );
                if (handled) {
                    this.updateActions(selectedObject);
                    return;
                }
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
            } else {
                // The button was rendered, so the player expects something to happen.
                // Options resolve to null when the action's requirements stopped being
                // met between render and click; refresh the list and say so rather
                // than swallowing the click.
                this.parent?.showMessage?.(
                    `${activeMyte.name} can't do that right now.`,
                    'warning',
                    action.label || 'Unavailable'
                );
                this.updateActions(selectedObject);
            }
        });

        return button;
    }

    bindTooltip(element, text) {
        if (!element || !text) return;
        const tooltip = TooltipSystem.getInstance();
        element.setAttribute('aria-label', text);
        element.addEventListener('mouseenter', () => tooltip.show({ anchor: element, text }));
        element.addEventListener('mouseleave', () => {
            if (tooltip.isVisibleFor(element)) tooltip.hide();
        });
        element.addEventListener('focus', () => tooltip.show({ anchor: element, text }));
        element.addEventListener('blur', () => {
            if (tooltip.isVisibleFor(element)) tooltip.hide();
        });
    }

    emptyActionList() {
        const actionGroups = this.actionControls.querySelector('.action-groups');
        actionGroups.innerHTML = '';
        this.actionControls.classList.remove('is-visible');

        const otherInfo = this.actionControls.querySelector('.other-info');
        otherInfo.innerHTML = '';
        otherInfo.classList.remove('is-visible');
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
                    { label: 'Mood', value: selectedObject.stats.getDerivedMood?.() ?? 'neutral' },
                    { label: 'Behavior', value: this.getMyteBehaviorLabel(selectedObject) },
                    { label: behaviorDetail?.label, value: behaviorDetail?.value },
                    { label: 'Activity', value: this.getMyteActivityLabel(selectedObject) }
                ]);
                rows.push({ label: '__header_vitals', value: 'Vitals', className: 'needs-title' });
                [
                    { id: 'energy', label: 'Energy' },
                    { id: 'health', label: 'Health' },
                    { id: 'satiety', label: 'Fullness' }
                ].forEach(({ id, label }) => {
                    const value = vitals[id] ?? 0;
                    rows.push({ label: `vital_${id}`, value, meta: { label, id }, type: 'meter', cacheValue: `${id}:${value}` });
                });

                rows.push({ label: '__header_wellbeing', value: 'Wellbeing', className: 'needs-title' });
                [
                    { id: 'fun',     label: 'Fun' },
                    { id: 'social',  label: 'Social' },
                    { id: 'comfort', label: 'Comfort' }
                ].forEach(({ id, label }) => {
                    const value = vitals[id] ?? 0;
                    rows.push({ label: `vital_${id}`, value, meta: { label, id }, type: 'meter', cacheValue: `${id}:${value}` });
                });

                rows.push({ label: '__header_personality', value: 'Personality', className: 'needs-title' });
                const confidenceValue = vitals.confidence ?? 0;
                rows.push({
                    label: 'vital_confidence',
                    value: confidenceValue,
                    meta: { label: 'Confidence', id: 'confidence', neutral: true },
                    type: 'meter',
                    cacheValue: `confidence:${confidenceValue}`
                });
                [
                    { id: 'boldness',    label: 'Boldness',    lowPole: 'Timid',     highPole: 'Reckless' },
                    { id: 'curiosity',   label: 'Curiosity',   lowPole: 'Contented', highPole: 'Obsessive' },
                    { id: 'activity',    label: 'Activity',    lowPole: 'Lethargic', highPole: 'Frantic' },
                    { id: 'sociability', label: 'Sociability', lowPole: 'Reclusive', highPole: 'Clingy' }
                ].forEach(({ id, label, lowPole, highPole }) => {
                    const value = Math.round((selectedObject.stats?.getTraitNormalized?.(id) ?? 0.5) * 100);
                    rows.push({ label: `trait_${id}`, value, meta: { label, id, lowPole, highPole }, type: 'trait-pole', cacheValue: `${id}:${value}` });
                });

                if (Array.isArray(snapshot.needs) && snapshot.needs.length) {
                    const driveLabels = SiteConfig.ui.labels.drives;
                    rows.push({ label: '__header_urgency', value: 'Urgency', className: 'needs-title' });
                    snapshot.needs.forEach(({ id, percent }) => {
                        const label = driveLabels[id] ?? id;
                        rows.push({
                            label: `drive_${id}`,
                            value: percent ?? 0,
                            meta: { label, id, urgency: true },
                            type: 'meter',
                            cacheValue: `${id}:${percent ?? 0}`
                        });
                    });
                }

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
                this._otherInfoStructureKey = null;
                this._otherInfoRowMap.clear();
            }
            return;
        }

        const rows = this._buildOtherInfoRows(selectedObject);
        const cacheKey = rows.map(r => `${r.label}=${r.cacheValue ?? r.value}`).join('|');
        const structureKey = rows.map(r => `${r.label}:${r.type ?? 'text'}:${r.className ?? ''}`).join('|');

        if (cacheKey === this._otherInfoCache) return;
        this._otherInfoCache = cacheKey;
        const structureChanged = structureKey !== this._otherInfoStructureKey;
        this._otherInfoStructureKey = structureKey;

        const prevRowMap = this._otherInfoRowMap;
        const newRowMap = new Map();

        if (structureChanged) {
            otherInfo.innerHTML = '';
        }

        for (const row of rows) {
            const strVal = String(row.value);
            let el = prevRowMap.get(row.label);

            if (row.type === 'meter') {
                if (!el) {
                    el = document.createElement('div');
                    el.classList.add('state-info', 'need-info');
                    const heading = document.createElement('div');
                    heading.classList.add('need-label');
                    const meter = document.createElement('div');
                    meter.classList.add('need-meter');
                    meter.setAttribute('role', 'progressbar');
                    meter.setAttribute('aria-valuemin', '0');
                    meter.setAttribute('aria-valuemax', '100');
                    const fill = document.createElement('div');
                    fill.classList.add('need-meter-fill');
                    meter.append(fill);
                    el.append(heading, meter);
                }
                const heading = el.querySelector('.need-label');
                const meter = el.querySelector('.need-meter');
                const fill = el.querySelector('.need-meter-fill');
                const pct = row.value;
                const text = `${row.meta.label}: ${pct}%`;
                if (heading.textContent !== text) heading.textContent = text;
                const width = `${Utility.clamp(pct, 0, 100)}%`;
                if (fill.style.width !== width) fill.style.width = width;
                meter.setAttribute('aria-valuenow', String(pct));
                if (row.meta?.urgency) {
                    el.dataset.state = this.getMeterState(100 - pct);
                } else if (row.meta?.neutral) {
                    delete el.dataset.state;
                    el.classList.add('neutral-meter');
                } else {
                    el.dataset.state = this.getMeterState(pct);
                }
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
            } else if (row.type === 'trait-pole') {
                if (!el) {
                    el = document.createElement('div');
                    el.classList.add('state-info', 'trait-info');
                    const name = document.createElement('div');
                    name.classList.add('trait-name');
                    const poleRow = document.createElement('div');
                    poleRow.classList.add('trait-pole-row');
                    const lowLabel = document.createElement('span');
                    lowLabel.classList.add('pole-label', 'pole-low');
                    lowLabel.textContent = row.meta.lowPole;
                    const track = document.createElement('div');
                    track.classList.add('pole-track');
                    const marker = document.createElement('div');
                    marker.classList.add('pole-marker');
                    track.append(marker);
                    const highLabel = document.createElement('span');
                    highLabel.classList.add('pole-label', 'pole-high');
                    highLabel.textContent = row.meta.highPole;
                    poleRow.append(lowLabel, track, highLabel);
                    el.append(name, poleRow);
                }
                const name = el.querySelector('.trait-name');
                const marker = el.querySelector('.pole-marker');
                const pct = row.value;
                if (name.textContent !== row.meta.label) name.textContent = row.meta.label;
                const leftPct = `${Utility.clamp(pct, 0, 100)}%`;
                if (marker.style.left !== leftPct) marker.style.left = leftPct;
                el.dataset.metricId = row.meta.id ?? '';
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
            if (structureChanged) {
                otherInfo.appendChild(el);
            }
        }

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
        this._otherInfoCache = null;
        this._otherInfoStructureKey = null;
        this._otherInfoRowMap.clear();

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
        const isFoodOffering = selectedObject?.isUserOfferedFood?.() === true;
        button.textContent = isFoodOffering ? 'Eat' : 'Pick Up';
        button.classList.add('primary-action');
        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();

            if (!activeMyte || selectedObject.collected) return;

            if (isFoodOffering) {
                activeMyte.queue.interrupt('eat_element', {
                    target: selectedObject,
                    userInitiated: true
                });
                return;
            }

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

    createSidebarInteractionButton(interaction, { prominent = false } = {}) {
        const button = document.createElement('button');
        button.textContent = interaction.label;
        if (prominent) button.classList.add('primary-action');
        if (interaction.description) button.title = interaction.description;
        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            interaction.run?.();
        });
        return button;
    }

    renderMajorSidebarInteraction(actionGroups, interaction) {
        if (!interaction) return false;

        const groupElement = document.createElement('div');
        groupElement.className = 'action-group major-action';
        const actionList = document.createElement('ul');
        const li = document.createElement('li');
        li.appendChild(this.createSidebarInteractionButton(interaction, { prominent: true }));
        actionList.appendChild(li);
        groupElement.appendChild(actionList);
        actionGroups.appendChild(groupElement);
        return true;
    }

    // Direct UI interactions work with no active myte, since they are the player
    // acting rather than a queued creature action.
    renderSidebarInteractions(actionGroups, interactions) {
        if (interactions.length === 0) return false;

        const groupElement = document.createElement('div');
        groupElement.className = 'action-group interactions';

        const title = document.createElement('h3');
        title.textContent = this.getCategoryTitle('interactions');
        groupElement.appendChild(title);

        const actionList = document.createElement('ul');
        interactions.forEach(interaction => {
            const li = document.createElement('li');
            li.appendChild(this.createSidebarInteractionButton(interaction));
            actionList.appendChild(li);
        });

        groupElement.appendChild(actionList);
        actionGroups.appendChild(groupElement);
        return true;
    }

    // "Home" means two different things depending on where the myte is: walk back
    // to its slot on this map, or walk back across the world to its own map.
    renderGoHomeAction(actionGroups, myte) {
        const container = this.parent.parent;
        const isVisiting = myte.isVisiting;
        if (!isVisiting && myte.isAtHomePosition?.(1)) return;

        const button = document.createElement('button');
        button.textContent = isVisiting
            ? `Send Home to ${container.getMapDisplayName(myte.homeMapId)}`
            : 'Go Home';
        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();

            if (isVisiting) {
                container.sendMyteHome(myte);
                return;
            }

            myte.clearHomeSlotHold?.();
            myte.queue.clear();
            myte.setMode(MOVE_TYPES.GOHOME);
        });

        const groupElement = document.createElement('div');
        groupElement.className = 'action-group movement';
        const title = document.createElement('h3');
        title.textContent = 'Movement';
        const actionList = document.createElement('ul');
        const li = document.createElement('li');
        li.appendChild(button);
        actionList.appendChild(li);
        groupElement.append(title, actionList);
        actionGroups.appendChild(groupElement);
    }

    updateActionList(selectedObject) {
        const actionGroups = this.actionControls.querySelector('.action-groups');
        const previousScrollTop = actionGroups.scrollTop;
        actionGroups.innerHTML = '';
        const activeMyte = this.parent.getActiveMyte();

        const sidebarInteractions = selectedObject?.getSidebarInteractions?.() ?? [];
        const majorSidebarInteraction = sidebarInteractions.find(interaction => interaction.major === true) ?? null;
        this.renderMajorSidebarInteraction(actionGroups, majorSidebarInteraction);
        this.renderSidebarInteractions(
            actionGroups,
            sidebarInteractions.filter(interaction => interaction !== majorSidebarInteraction)
        );

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
        const majorAction = majorSidebarInteraction
            ? null
            : this.getMajorAction(selectedObject, activeMyte, availableActions);

        // Actions that are unavailable *and* can say why are shown disabled with the
        // reason, instead of vanishing. Actions with no reason stay hidden — they are
        // simply irrelevant to this selection.
        const blockedActions = ActionManager.getExplainedUnavailableActions(selectedObject, activeMyte);

        const groupedActions = [...availableActions, ...blockedActions]
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

        if (selectedObject === activeMyte && activeMyte) {
            this.renderGoHomeAction(actionGroups, activeMyte);
        }

        if (actionGroups.children.length > 0) {
            this.actionControls.classList.add('is-visible');
        }

        actionGroups.scrollTop = previousScrollTop;
    }

    dispose() {
        this._eventUnsubscribers.forEach(unsubscribe => unsubscribe());
        this._eventUnsubscribers = [];
        this.currentSelectedObject = null;
        this._otherInfoCache = null;
        this._otherInfoRowMap.clear();
        this.actionControls = null;
    }
}
