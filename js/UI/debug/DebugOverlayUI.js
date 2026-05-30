class DebugOverlayUI {
    static PERSIST_KEY = 'neko.debug';
    static FLOATING_MARGIN = 8;
    static MIN_VISIBLE_WIDTH = 120;
    static MIN_VISIBLE_HEIGHT = 40;

    constructor(parent) {
        this.parent = parent;
        this.debug = document.querySelector('.debug-panel');
        this.cameraEnabled = false;
        this.camera = null;
        this.wasDebugEnabled = false;

        // Per-section drag + collapse state (keyed by sectionKey + 'queue')
        this.debugSectionState = {
            system:   { x: null, y: null, open: true, groups: {} },
            myte:     { x: null, y: null, open: true, groups: {} },
            overlays: { x: null, y: null, open: true, groups: {} },
            queue:    { x: null, y: null }
        };
        this._initializeFloatingStateMetadata();

        this.overlayState = {
            colliders:   true,
            interaction: false,
            hit:         false,
            select:      false,
            pickup:      false,
            anchors:     false
        };
        this.directWorldInteractionEnabled = false;

        this.debugDomRefs = new Map();
        this.debugOverlaySetup = false;

        // Drag tracking (shared for debug sections + queue panel)
        this.dragState = null;
        this.handleDebugPointerDown   = this.onDebugPointerDown.bind(this);
        this.handleDebugPointerMove   = this.onDebugPointerMove.bind(this);
        this.handleDebugPointerUp     = this.onDebugPointerUp.bind(this);
        this.handleDebugSummaryClick  = this.onDebugSummaryClick.bind(this);
        this.handleQueuePointerDown   = this.onQueuePointerDown.bind(this);
        this.handleWindowResize       = this.onWindowResize.bind(this);

        this.queueUI = new QueueUI(parent);
        this.lastDebugUpdate = 0;
        this.debugUpdateInterval = 100;
        this.gridBootstrapAttempts = 0;
        this.lastBootstrappedGridSystem = null;

        this._mountFloatingPanels();

        // Load persisted state and apply
        this._applyPersistedState();
        window.addEventListener('resize', this.handleWindowResize);
    }

    // ─── persistence helpers ─────────────────────────────────────────────────

    _mountFloatingPanels() {
        const queueEl = this.queueUI?.queue;
        if (!this.debug || !queueEl || queueEl.parentElement === this.debug) return;
        this.debug.appendChild(queueEl);
    }

    _initializeFloatingStateMetadata() {
        Object.values(this.debugSectionState).forEach(state => {
            if (!state || typeof state !== 'object') return;
            state.groups ??= {};
            state._hasSavedPosition = false;
            state._hasSavedOpen = false;
            state._hasSavedCollapsed = false;
            state._responsiveStateResolved = false;
        });
    }

    _loadState() {
        try {
            return JSON.parse(localStorage.getItem(DebugOverlayUI.PERSIST_KEY) || '{}');
        } catch {
            return {};
        }
    }

    _saveState(patch) {
        try {
            const state = this._loadState();
            Object.assign(state, patch);
            localStorage.setItem(DebugOverlayUI.PERSIST_KEY, JSON.stringify(state));
        } catch {}
    }

    _saveSectionState(key) {
        const s = this.debugSectionState[key];
        if (!s) return;
        const state = this._loadState();
        if (!state.sections) state.sections = {};
        state.sections[key] = {
            x: s.x,
            y: s.y,
            open: s.open,
            groups: { ...(s.groups || {}) }
        };
        try { localStorage.setItem(DebugOverlayUI.PERSIST_KEY, JSON.stringify(state)); } catch {}
    }

    _saveQueueState() {
        const q = this.debugSectionState.queue;
        const state = this._loadState();
        state.queue = { x: q.x, y: q.y, collapsed: this.queueUI?.isCollapsed ?? false };
        try { localStorage.setItem(DebugOverlayUI.PERSIST_KEY, JSON.stringify(state)); } catch {}
    }

    _saveOverlayState() {
        this._saveState({ overlays: { ...this.overlayState } });
    }

    _saveDebugEnabledState(enabled = document.body.classList.contains('debug')) {
        this._saveState({ debugEnabled: !!enabled });
    }

    setDirectWorldInteractionEnabled(enabled) {
        this.directWorldInteractionEnabled = !!enabled;
        this._saveState({
            interactionModes: {
                directWorldInteraction: this.directWorldInteractionEnabled
            }
        });
        this.parent?.ui?.debugPanel?.updateButton?.('directWorldInteraction');
    }

    isDirectWorldInteractionEnabled() {
        return this.directWorldInteractionEnabled;
    }

    getEnabledOverlayDebugLabels() {
        const labels = [];
        if (this.overlayState.colliders) labels.push('Colliders');
        if (this.overlayState.interaction) labels.push('Interaction');
        if (this.overlayState.hit) labels.push('Hit');
        if (this.overlayState.select) labels.push('Select');
        if (this.overlayState.pickup) labels.push('Pickup');
        if (this.overlayState.anchors) labels.push('Anchors');
        return labels;
    }

    _saveGridOverlays() {
        const flags = this.parent?.gameMap?.gridSystem?.overlayFlags;
        if (!flags) return;
        const state = this._loadState();
        state.gridOverlays = { ...flags };
        try { localStorage.setItem(DebugOverlayUI.PERSIST_KEY, JSON.stringify(state)); } catch {}
    }

    _applyGridOverlays(gridSystem) {
        const state = this._loadState();
        if (!state.gridOverlays) return;
        for (const [key, value] of Object.entries(state.gridOverlays)) {
            gridSystem.setOverlayFlag(key, value);
        }
    }

    _applyPersistedState() {
        const state = this._loadState();

        // Debug sections
        if (state.sections) {
            for (const [key, saved] of Object.entries(state.sections)) {
                if (this.debugSectionState[key]) {
                    this.debugSectionState[key].x    = saved.x    ?? null;
                    this.debugSectionState[key].y    = saved.y    ?? null;
                    this.debugSectionState[key].open = saved.open ?? true;
                    this.debugSectionState[key].groups =
                        saved.groups && typeof saved.groups === 'object'
                            ? { ...saved.groups }
                            : {};
                    this.debugSectionState[key]._hasSavedPosition =
                        Number.isFinite(saved.x) && Number.isFinite(saved.y);
                    this.debugSectionState[key]._hasSavedOpen =
                        typeof saved.open === 'boolean';
                    this.debugSectionState[key]._responsiveStateResolved =
                        this.debugSectionState[key]._hasSavedOpen;
                }
            }
        }

        // Queue position + collapse
        if (state.queue) {
            const q = this.debugSectionState.queue;
            q.x = state.queue.x ?? null;
            q.y = state.queue.y ?? null;
            q._hasSavedPosition = Number.isFinite(state.queue.x) && Number.isFinite(state.queue.y);
            q._hasSavedCollapsed = typeof state.queue.collapsed === 'boolean';
            q._responsiveStateResolved = q._hasSavedCollapsed;
            if (state.queue.collapsed != null && this.queueUI) {
                this.queueUI.setCollapsed(state.queue.collapsed);
            }
        }

        // Overlay flags
        if (state.overlays) {
            Object.assign(this.overlayState, state.overlays);
        }

        if (state.interactionModes) {
            this.directWorldInteractionEnabled = !!state.interactionModes.directWorldInteraction;
        }

        // Restore visual debug body class
        if (typeof state.debugEnabled === 'boolean') {
            document.body.classList.toggle('debug', state.debugEnabled);
        }

        this._mountFloatingPanels();

        // Apply queue panel position
        this._applyQueuePosition();
    }

    _applyQueuePosition() {
        const queueEl = this.queueUI?.queue;
        if (!queueEl) return;
        const q = this.debugSectionState.queue;
        this._mountFloatingPanels();
        queueEl.style.right = 'auto';
        queueEl.style.bottom = 'auto';
        queueEl.style.transform = 'none';
        queueEl.style.position = 'absolute';
        this._applyFloatingPosition(queueEl, q, () => this._getDefaultQueuePosition(), {
            handle: this.queueUI?.panelSummary
        });
    }

    _getDefaultQueuePosition() {
        const margin = DebugOverlayUI.FLOATING_MARGIN;
        return { x: margin, y: Math.max(margin, window.innerHeight - 300) };
    }

    _getStoredFloatingPosition(state, getDefaultPosition) {
        if (state && Number.isFinite(state.x) && Number.isFinite(state.y)) {
            return { x: state.x, y: state.y };
        }

        const fallback = getDefaultPosition();
        if (state) {
            state.x = Math.round(fallback.x);
            state.y = Math.round(fallback.y);
        }

        return fallback;
    }

    _getFloatingConstraintOptions(handle = null) {
        const handleHeight = handle ? Math.ceil(handle.getBoundingClientRect().height || 0) : 0;
        return {
            margin: DebugOverlayUI.FLOATING_MARGIN,
            minVisibleWidth: DebugOverlayUI.MIN_VISIBLE_WIDTH,
            minVisibleHeight: Math.max(DebugOverlayUI.MIN_VISIBLE_HEIGHT, handleHeight || 0)
        };
    }

    _getFloatingBounds(element, options = {}) {
        const margin = options.margin ?? DebugOverlayUI.FLOATING_MARGIN;
        const rect = element.getBoundingClientRect();
        const width = Math.max(0, rect.width || element.offsetWidth || 0);
        const height = Math.max(0, rect.height || element.offsetHeight || 0);
        const maxVisibleWidth = Math.max(24, window.innerWidth - (margin * 2));
        const maxVisibleHeight = Math.max(24, window.innerHeight - (margin * 2));
        const minVisibleWidth = Math.min(options.minVisibleWidth ?? DebugOverlayUI.MIN_VISIBLE_WIDTH, width || maxVisibleWidth, maxVisibleWidth);
        const minVisibleHeight = Math.min(options.minVisibleHeight ?? DebugOverlayUI.MIN_VISIBLE_HEIGHT, height || maxVisibleHeight, maxVisibleHeight);
        const minLeft = Math.round(margin + minVisibleWidth - width);
        const maxLeft = Math.round(window.innerWidth - margin - minVisibleWidth);
        const minTop = margin;
        const maxTop = Math.round(window.innerHeight - margin - minVisibleHeight);

        return {
            minLeft: Math.min(minLeft, maxLeft),
            maxLeft: Math.max(minLeft, maxLeft),
            minTop: Math.min(minTop, maxTop),
            maxTop: Math.max(minTop, maxTop)
        };
    }

    _clampFloatingPosition(element, position, options = {}) {
        const bounds = this._getFloatingBounds(element, options);
        return {
            x: Math.min(Math.max(position.x, bounds.minLeft), bounds.maxLeft),
            y: Math.min(Math.max(position.y, bounds.minTop), bounds.maxTop)
        };
    }

    _applyFloatingPosition(element, state, getDefaultPosition, options = {}) {
        if (!element) return null;

        const rawPosition = this._getStoredFloatingPosition(state, getDefaultPosition);
        const safePosition = this._clampFloatingPosition(
            element,
            rawPosition,
            this._getFloatingConstraintOptions(options.handle)
        );

        element.style.left = `${Math.round(safePosition.x)}px`;
        element.style.top = `${Math.round(safePosition.y)}px`;

        return safePosition;
    }

    _applySectionPosition(sectionKey) {
        const refs = this.debugDomRefs.get(sectionKey);
        const state = this.debugSectionState[sectionKey];
        if (!refs?.sectionEl || !state) return;

        const handle = refs.sectionEl.querySelector(':scope > summary');
        this._applyFloatingPosition(refs.sectionEl, state, () => this.getDefaultSectionPosition(sectionKey), {
            handle
        });
    }

    _shouldStartCollapsed(element, handle = null) {
        if (!element) return false;

        const margin = DebugOverlayUI.FLOATING_MARGIN * 2;
        const viewportWidth = Math.max(200, window.innerWidth - margin);
        const viewportHeight = Math.max(160, window.innerHeight - margin);
        const handleHeight = Math.ceil(handle?.getBoundingClientRect?.().height || 0);
        const rect = element.getBoundingClientRect();
        const fullWidth = Math.max(rect.width || 0, element.scrollWidth || 0);
        const fullHeight = Math.max(rect.height || 0, element.scrollHeight || 0);

        return fullWidth > viewportWidth || fullHeight > Math.max(handleHeight + 48, viewportHeight);
    }

    _maybeApplyResponsiveSectionState(sectionKey) {
        const refs = this.debugDomRefs.get(sectionKey);
        const state = this.debugSectionState[sectionKey];
        if (!refs?.sectionEl || !state || state._responsiveStateResolved) return;

        const handle = refs.sectionEl.querySelector(':scope > summary');
        const shouldCollapse = this._shouldStartCollapsed(refs.sectionEl, handle);
        refs.sectionEl.open = !shouldCollapse;
        state.open = refs.sectionEl.open;
        state._responsiveStateResolved = true;
    }

    _maybeApplyResponsiveQueueState() {
        const queueEl = this.queueUI?.queue;
        const queueState = this.debugSectionState.queue;
        if (!queueEl || !queueState || queueState._responsiveStateResolved) return;

        const shouldCollapse = this._shouldStartCollapsed(queueEl, this.queueUI?.panelSummary);
        this.queueUI?.setCollapsed?.(shouldCollapse);
        queueState._responsiveStateResolved = true;
        this._applyQueuePosition();
    }

    _refreshFloatingPositions() {
        this.debugDomRefs.forEach((refs, sectionKey) => {
            if (refs?.sectionEl) {
                this._applySectionPosition(sectionKey);
            }
        });

        this._applyQueuePosition();
    }

    onWindowResize() {
        this._refreshFloatingPositions();
    }

    // ─── debug section DOM ───────────────────────────────────────────────────

    getDebugSections(debugGroups) {
        return [
            {
                key: 'system',
                title: 'Debug – System',
                groups: debugGroups.filter(g => ['System', 'Input', 'Time', 'Map', 'Camera', 'Sound'].includes(g.name))
            },
            {
                key: 'myte',
                title: 'Debug – Myte',
                groups: [
                    { name: 'Overview', messages: this.getMyteSummaryMessages() },
                    ...debugGroups.filter(g => ['Myte', 'Myte Stats', 'Myte AI'].includes(g.name))
                ]
            }
        ];
    }

    getMyteSummaryMessages() {
        const mytes  = this.parent.mytes || [];
        const active = mytes.filter(m => m?.isActive);
        const inactive = mytes.filter(m => m && !m.isActive);
        const messages = [
            { label: 'Total',    value: mytes.length },
            { label: 'Active',   value: active.length },
            { label: 'Inactive', value: inactive.length }
        ];
        if (active.length > 0) {
            messages.push({ label: 'Selected', value: this.parent.activeMyte?.name || '—' });
        }
        return messages;
    }

    groupCssClass(groupName) {
        return groupName.toLowerCase().replace(/\s+/g, '-');
    }

    reconcileSection(sectionKey, title, groupsData) {
        if (!this.debug) return;

        let refs = this.debugDomRefs.get(sectionKey);
        if (!refs) {
            const sectionEl = document.createElement('details');
            sectionEl.className = `debug-section ${sectionKey}`;
            sectionEl.dataset.sectionKey = sectionKey;

            const state = this.debugSectionState[sectionKey];
            sectionEl.open = state?.open ?? true;

            const summary = document.createElement('summary');
            summary.textContent = title;
            sectionEl.appendChild(summary);

            const body = document.createElement('div');
            body.className = 'debug-section-body';
            sectionEl.appendChild(body);

            this.debug.appendChild(sectionEl);

            refs = { sectionEl, bodyEl: body, groupMap: new Map() };
            this.debugDomRefs.set(sectionKey, refs);
        }

        const activeGroups = new Set();

        for (const { name, messages } of groupsData) {
            const hasData = messages.length > 0;
            let groupRefs = refs.groupMap.get(name);

            if (!groupRefs) {
                const groupEl = document.createElement('details');
                groupEl.className = `debug-group ${this.groupCssClass(name)}`;
                groupEl.open = refs.sectionEl
                    ? (this.debugSectionState[sectionKey]?.groups?.[name] ?? true)
                    : true;

                const summary = document.createElement('summary');
                summary.className = 'debug-group-summary';
                summary.textContent = name;
                groupEl.appendChild(summary);

                const table = document.createElement('table');
                table.className = 'debug-table';
                groupEl.appendChild(table);

                refs.bodyEl.appendChild(groupEl);
                groupEl.addEventListener('toggle', () => {
                    const sectionState = this.debugSectionState[sectionKey];
                    if (!sectionState) return;
                    sectionState.groups ??= {};
                    sectionState.groups[name] = groupEl.open;
                    this._saveSectionState(sectionKey);
                });
                groupRefs = { groupEl, tableEl: table, rowMap: new Map() };
                refs.groupMap.set(name, groupRefs);
            }

            groupRefs.groupEl.style.display = hasData ? '' : 'none';
            if (!hasData) continue;

            activeGroups.add(name);
            const activeLabels = new Set();

            for (const item of messages) {
                const { label, value } = item;
                const labelClean = item.labelClean ?? label;

                activeLabels.add(label);
                let valueCell = groupRefs.rowMap.get(label);

                if (!valueCell) {
                    const tr = document.createElement('tr');
                    const labelCell = document.createElement('td');
                    labelCell.className = 'debug-label';
                    labelCell.innerHTML = label;
                    labelCell.title = labelClean;
                    tr.appendChild(labelCell);

                    valueCell = document.createElement('td');
                    valueCell.className = 'debug-value';
                    tr.appendChild(valueCell);

                    groupRefs.tableEl.appendChild(tr);
                    groupRefs.rowMap.set(label, valueCell);
                }

                const str = String(value ?? 'N/A');
                if (valueCell.textContent !== str) valueCell.textContent = str;
            }

            for (const [label, valueCell] of groupRefs.rowMap) {
                if (!activeLabels.has(label)) {
                    valueCell.closest('tr')?.remove();
                    groupRefs.rowMap.delete(label);
                }
            }
        }

        this._maybeApplyResponsiveSectionState(sectionKey);
        this._applySectionPosition(sectionKey);
    }

    getDefaultSectionPosition(key) {
        const margin    = DebugOverlayUI.FLOATING_MARGIN;
        const panelWidth = 350;
        if (key === 'myte') {
            return { x: Math.max(margin, window.innerWidth - panelWidth - margin), y: 60 };
        }
        if (key === 'overlays') {
            return { x: margin, y: 320 };
        }
        return { x: margin, y: 60 };
    }

    // ─── drag: debug sections ────────────────────────────────────────────────

    ensureDebugOverlaySetup() {
        if (!this.debug || this.debugOverlaySetup) return;

        this._mountFloatingPanels();
        this.debug.addEventListener('pointerdown', this.handleDebugPointerDown);
        this.debug.addEventListener('click', this.handleDebugSummaryClick, true);
        this.debugOverlaySetup = true;

        // Wire up queue panel dragging once
        const queueEl = this.queueUI?.queue;
        const summary = this.queueUI?.panelSummary;
        if (queueEl && summary) {
            summary.addEventListener('click', this.handleDebugSummaryClick, true);
            summary.addEventListener('pointerdown', this.handleQueuePointerDown);
        }
    }

    onDebugSummaryClick(event) {
        const summary = event.target.closest('.debug-section > summary, .queue-panel-shell > summary');
        const isDebugSummary = summary && this.debug?.contains(summary);
        const isQueueSummary = summary === this.queueUI?.panelSummary;
        if (!summary || (!isDebugSummary && !isQueueSummary)) return;
        event.preventDefault();
    }

    onDebugPointerDown(event) {
        if (event.button !== 0) return;

        const summary = event.target.closest('.debug-section > summary');
        if (!summary || !this.debug?.contains(summary)) return;

        const section    = summary.closest('.debug-section[data-section-key]');
        if (!section) return;

        const sectionKey = section.dataset.sectionKey;
        const rect = section.getBoundingClientRect();

        this.dragState = {
            type: 'section',
            sectionKey,
            pointerId:   event.pointerId,
            startX:      event.clientX,
            startY:      event.clientY,
            originLeft:  rect.left,
            originTop:   rect.top,
            moved: false
        };

        window.addEventListener('pointermove', this.handleDebugPointerMove);
        window.addEventListener('pointerup',   this.handleDebugPointerUp);
        window.addEventListener('pointercancel', this.handleDebugPointerUp);
    }

    // ─── drag: queue panel ───────────────────────────────────────────────────

    onQueuePointerDown(event) {
        if (event.button !== 0) return;

        const queueEl = this.queueUI?.queue;
        if (!queueEl) return;

        const rect = queueEl.getBoundingClientRect();

        this.dragState = {
            type: 'queue',
            pointerId:  event.pointerId,
            startX:     event.clientX,
            startY:     event.clientY,
            originLeft: rect.left,
            originTop:  rect.top,
            moved: false
        };

        window.addEventListener('pointermove', this.handleDebugPointerMove);
        window.addEventListener('pointerup',   this.handleDebugPointerUp);
        window.addEventListener('pointercancel', this.handleDebugPointerUp);

        event.preventDefault();
    }

    // ─── drag: shared move / up ──────────────────────────────────────────────

    onDebugPointerMove(event) {
        if (!this.dragState || event.pointerId !== this.dragState.pointerId) return;

        const deltaX = event.clientX - this.dragState.startX;
        const deltaY = event.clientY - this.dragState.startY;

        if (!this.dragState.moved && Math.abs(deltaX) < 4 && Math.abs(deltaY) < 4) return;

        this.dragState.moved = true;
        event.preventDefault();

        if (this.dragState.type === 'section') {
            const section = this.debug?.querySelector(
                `.debug-section[data-section-key="${this.dragState.sectionKey}"]`
            );
            if (!section) return;

            section.classList.add('dragging');

            const handle = section.querySelector(':scope > summary');
            const nextPosition = this._clampFloatingPosition(
                section,
                {
                    x: this.dragState.originLeft + deltaX,
                    y: this.dragState.originTop + deltaY
                },
                this._getFloatingConstraintOptions(handle)
            );

            section.style.left = `${Math.round(nextPosition.x)}px`;
            section.style.top  = `${Math.round(nextPosition.y)}px`;

            const state = this.debugSectionState[this.dragState.sectionKey];
            if (state) {
                state.x = Math.round(nextPosition.x);
                state.y = Math.round(nextPosition.y);
            }

        } else if (this.dragState.type === 'queue') {
            const queueEl = this.queueUI?.queue;
            const queueShell = this.queueUI?.panelShell;
            if (!queueEl || !queueShell) return;

            queueShell.classList.add('dragging');

            const nextPosition = this._clampFloatingPosition(
                queueEl,
                {
                    x: this.dragState.originLeft + deltaX,
                    y: this.dragState.originTop + deltaY
                },
                this._getFloatingConstraintOptions(this.queueUI?.panelSummary)
            );

            queueEl.style.left = `${Math.round(nextPosition.x)}px`;
            queueEl.style.top  = `${Math.round(nextPosition.y)}px`;

            this.debugSectionState.queue.x = Math.round(nextPosition.x);
            this.debugSectionState.queue.y = Math.round(nextPosition.y);
        }
    }

    onDebugPointerUp(event) {
        if (!this.dragState || event.pointerId !== this.dragState.pointerId) return;

        const moved = this.dragState.moved;

        if (this.dragState.type === 'section') {
            const section = this.debug?.querySelector(
                `.debug-section[data-section-key="${this.dragState.sectionKey}"]`
            );
            if (moved) {
                section?.classList.remove('dragging');
                this._saveSectionState(this.dragState.sectionKey);
            } else if (section) {
                section.open = !section.open;
                const state = this.debugSectionState[this.dragState.sectionKey];
                if (state) state.open = section.open;
                this._saveSectionState(this.dragState.sectionKey);
            }
        } else if (this.dragState.type === 'queue') {
            const queueShell = this.queueUI?.panelShell;
            queueShell?.classList.remove('dragging');
            if (moved) {
                this._saveQueueState();
            } else {
                this.queueUI?.setCollapsed(!this.queueUI?.isCollapsed);
                this._saveQueueState();
            }
        }

        this.dragState = null;
        window.removeEventListener('pointermove', this.handleDebugPointerMove);
        window.removeEventListener('pointerup',   this.handleDebugPointerUp);
        window.removeEventListener('pointercancel', this.handleDebugPointerUp);
    }

    // ─── debug data ──────────────────────────────────────────────────────────

    getSystemMessages() {
        return [
            { label: 'FPS',              value: this.parent.core.currentFPS.toFixed(2) },
            { label: 'Memory Usage',     value: this.getMemoryUsage() },
            { label: 'Active Entities',  value: this.getActiveEntitiesCount() }
        ];
    }

    getInputMessages() {
        const lastInputTime =
            this.parent.inputHandler?.inputSystem?.state?.lastActivityTime ??
            this.parent.inputHandler?.lastActiveTime ??
            null;

        const localMouse = this.parent.inputHandler.getMouseWorldPosition();
        const localTile  = this.pixelToTile(localMouse.x, localMouse.y);
        const mouseTile  = this.pixelToTile(this.parent.mousePosX, this.parent.mousePosY);

        return [
            { label: 'User Active',     value: this.parent.userIsActive },
            { label: 'Direct Interact', value: this.directWorldInteractionEnabled ? 'On' : 'Off' },
            { label: 'Local Mouse',     value: `${localMouse.x.toFixed(2)}px, ${localMouse.y.toFixed(2)}px` },
            { label: 'Local Mouse Tile', value: localTile ? `[${localTile.x}, ${localTile.y}]` : 'N/A' },
            { label: 'Mouse',           value: `${this.parent.mousePosX.toFixed(2)}px, ${this.parent.mousePosY.toFixed(2)}px` },
            { label: 'Mouse Tile',      value: mouseTile ? `[${mouseTile.x}, ${mouseTile.y}]` : 'N/A' },
            {
                label: 'Last Input Time',
                value: Number.isFinite(lastInputTime)
                    ? new Date(lastInputTime).toLocaleTimeString()
                    : 'N/A'
            }
        ];
    }

    getTimeMessages() {
        const timeData = this.parent.timeManager.getTimeData();
        return [
            { label: 'Time',                    value: timeData.formattedTime },
            { label: 'Date',                    value: timeData.formattedDate },
            { label: 'Time of Day',             value: timeData.timeOfDay },
            { label: 'Light Level',             value: timeData.lightLevel.toFixed(2) },
            { label: 'Moon Phase',              value: timeData.moonPhase },
            { label: 'Moon Illumination',       value: timeData.moonIllumination.toFixed(2) },
            { label: 'Moon Growth Multiplier',  value: timeData.moonGrowthMultiplier.toFixed(2) }
        ];
    }

    getMapMessages() {
        const messages = [];

        if (this.parent?.gameMap) {
            const gm = this.parent.gameMap;
            messages.push({ label: 'Map ID',   value: gm.id });
            messages.push({ label: 'Map Name', value: gm.displayName || 'Unknown' });

            const cellSize = gm.gridSystem?.config?.cellSize;
            if (cellSize) messages.push({ label: 'Tile Size', value: `${cellSize}px` });

            if (gm.dimensions) {
                const { width, height } = gm.dimensions;
                messages.push({ label: 'Size', value: `${width} × ${height}px` });
                if (cellSize) {
                    messages.push({ label: 'Size (tiles)', value: `${Math.floor(width / cellSize)} × ${Math.floor(height / cellSize)}` });
                }
            }

            messages.push({ label: 'Objects', value: gm.objects?.length || 0 });
            messages.push({ label: 'Visual Debug', value: document.body.classList.contains('debug') ? 'On' : 'Off' });

            const enabledOverlays = this.getEnabledOverlayDebugLabels();
            messages.push({
                label: 'Active Overlays',
                value: enabledOverlays.length > 0 ? enabledOverlays.join(', ') : 'None'
            });

            const cullingStats = gm.gridSystem?.getCullingDebugStats?.();
            if (cullingStats) {
                messages.push({ label: 'Visible Cells',  value: cullingStats.visibleCells });
                messages.push({ label: 'Active Objects', value: cullingStats.activeObjects });
                messages.push({ label: 'Total Cells',    value: cullingStats.totalCells });
                messages.push({ label: 'Culling Ratio',  value: `${cullingStats.cullingRatio}%` });
            }

            if (gm.particleSystem) {
                const particleStats = gm.particleSystem.getDebugStats?.() || null;
                if (particleStats) {
                    messages.push({ label: 'Particle Effects',  value: particleStats.effectsEnabled ? 'On' : 'Off' });
                    messages.push({ label: 'Particles',         value: `${particleStats.activeParticles} active / ${particleStats.pooledParticles} pooled` });
                    messages.push({ label: 'Particle Emitters', value: `${particleStats.activeEmitters}` });
                    messages.push({ label: 'Particle Bindings', value: `${particleStats.objectBindings || 0}` });
                    messages.push({ label: 'Particle Culling',  value: `${particleStats.culledThisFrame} culled` });
                } else {
                    messages.push({ label: 'Particles',         value: `${gm.particleSystem.particles?.length || 0}` });
                    messages.push({ label: 'Particle Emitters', value: `${gm.particleSystem.emitters?.length || 0}` });
                }
            }
        }

        if (this.parent?.gameMap?.zoneManager?.zones?.size > 0) {
            messages.push(...this.getZoneDebugMessages());
        }

        return messages;
    }

    getZoneDebugMessages() {
        const messages = [];
        const zoneManager = this.parent?.gameMap?.zoneManager;
        if (!zoneManager?.zones) return messages;

        try {
            zoneManager.zones.forEach((zone, zoneId) => {
                if (!zone?.mytesInZone) return;
                try {
                    const names = Array.from(zone.mytesInZone)
                        .map(id => this.parent.mytes?.find(m => m && m.id === id))
                        .filter(Boolean)
                        .map(m => m.name)
                        .join(', ');
                    const type = zone.type || 'zone';
                    const displayName = zone.displayName || type;
                    messages.push({
                        label: `<span class="badge ${type}">${displayName}</span> ${zoneId}`,
                        labelClean: `${displayName} ${zoneId}`,
                        value: names || '—'
                    });
                } catch {
                    messages.push({ label: `Zone ${zoneId}`, value: 'Error' });
                }
            });
        } catch {}

        return messages;
    }

    getCameraMessages() {
        if (!this.parent.camera) return [];

        const cam  = this.parent.camera;
        const zoom = cam.zoomLevel;
        const vp   = this.parent.getContainerRect?.();
        const vpW  = vp?.width  ?? 0;
        const vpH  = vp?.height ?? 0;

        const worldLeft   = -cam.posX;
        const worldTop    = -cam.posY;
        const worldRight  = vpW / zoom - cam.posX;
        const worldBottom = vpH / zoom - cam.posY;

        const tl   = this.pixelToTile(worldLeft, worldTop);
        const br   = this.pixelToTile(worldRight, worldBottom);
        const visW = tl && br ? br.x - tl.x + 1 : null;
        const visH = tl && br ? br.y - tl.y + 1 : null;

        return [
            { label: 'Camera Position', value: `${cam.posX.toFixed(2)}px, ${cam.posY.toFixed(2)}px` },
            { label: 'Zoom Level',      value: zoom.toFixed(2) },
            { label: 'Follow Mode',     value: cam.followMode },
            { label: 'Viewport Size',   value: `${vpW.toFixed(0)}×${vpH.toFixed(0)}px` },
            { label: 'Visible World',   value: `${worldLeft.toFixed(0)},${worldTop.toFixed(0)} → ${worldRight.toFixed(0)},${worldBottom.toFixed(0)}px` },
            { label: 'Visible Tiles',   value: tl && br ? `(${tl.x},${tl.y}) → (${br.x},${br.y}) [${visW}×${visH}]` : 'N/A' }
        ];
    }

    getMyteMessages() {
        const activeMyte = this.parent.activeMyte;
        if (!activeMyte) return [];

        const posTile    = this.pixelToTile(activeMyte.posX, activeMyte.posY);
        const targetTile = this.pixelToTile(activeMyte.targetX, activeMyte.targetY);

        return [
            { label: 'State',           value: activeMyte.stateMachine.stateController.currentState },
            { label: 'Goal',            value: activeMyte.getMoveType(activeMyte.goal) },
            { label: 'Previous Goal',   value: activeMyte.getMoveType(activeMyte.previousGoal) },
            { label: 'Follow Goal',     value: activeMyte.getMoveFollowType(activeMyte.followGoal) },
            { label: 'AI Goal',         value: activeMyte.getMoveAutonomyType(activeMyte.autonomyGoal) },
            { label: 'Active',          value: activeMyte.isActive },
            { label: 'Deployed',        value: activeMyte.isDeployed },
            { label: 'In Slot',         value: activeMyte.isInSlot },
            { label: 'Controlled',      value: activeMyte.isActiveMyte },
            { label: 'Position',        value: `${activeMyte.posX.toFixed(2)}px, ${activeMyte.posY.toFixed(2)}px` },
            { label: 'Position Tile',   value: posTile ? `[${posTile.x}, ${posTile.y}]` : 'N/A' },
            { label: 'Target',          value: `${activeMyte.targetX.toFixed(2)}px, ${activeMyte.targetY.toFixed(2)}px` },
            { label: 'Target Tile',     value: targetTile ? `[${targetTile.x}, ${targetTile.y}]` : 'N/A' },
            { label: 'Direction',       value: activeMyte.direction },
            { label: 'Distance to Target', value: `${activeMyte.distanceFromTarget}px` },
            { label: 'Distance from Mouse', value: `${activeMyte.distanceFromMouse}px` },
            { label: 'Falling',         value: activeMyte.isFalling },
            { label: 'Jumping',         value: activeMyte.isJumping },
            { label: 'Velocity',        value: activeMyte.physics.velocity.toFixed(3) },
            { label: 'Sort Y',          value: Number.isFinite(activeMyte.renderer?.getSortY?.()) ? `${activeMyte.renderer.getSortY().toFixed(2)}px` : 'N/A' },
            { label: 'Z-Index',         value: activeMyte.duplicate.style.zIndex },
            { label: 'Queue Items',     value: activeMyte.queue.count() }
        ];
    }

    getMyteStats() {
        const activeMyte = this.parent.activeMyte;
        if (!activeMyte) return [];

        const status = activeMyte.stats.getStatus();
        return [
            { label: 'Mood',        value: activeMyte.stats.getDerivedMood() },
            { label: 'Fun',         value: activeMyte.stats.fun.toFixed(1) },
            { label: 'Social',      value: activeMyte.stats.social.toFixed(1) },
            { label: 'Hunger',      value: activeMyte.stats.hunger.toFixed(1) },
            { label: 'Comfort',     value: activeMyte.stats.comfort.toFixed(1) },
            { label: 'Confidence',  value: activeMyte.stats.confidence.toFixed(1) },
            { label: 'Speed',       value: activeMyte.stats.getSpeed() },
            { label: 'Health',      value: status.health },
            { label: 'Energy',      value: status.energy.current.toFixed(1) },
            { label: 'Level',       value: status.level },
            { label: 'Experience',  value: status.experience },
            { label: 'Personality', value: status.personality.description }
        ];
    }

    prettifyAiToken(token) {
        return String(token || '')
            .replace(/[_-]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .replace(/\b\w/g, char => char.toUpperCase());
    }

    prettifyAiPath(path) {
        return String(path || '')
            .split(':')
            .filter(Boolean)
            .map(segment => this.prettifyAiToken(segment))
            .join(' / ');
    }

    formatAiCandidate(candidate, index) {
        const rawLabel = String(candidate?.label || 'candidate');
        const segments = rawLabel.split(':').filter(Boolean);
        const primary  = this.prettifyAiToken(segments.shift() || rawLabel);
        const detail   = segments.map(segment => this.prettifyAiToken(segment)).join(' / ');
        return {
            label: `#${index + 1} ${primary}`,
            value: detail ? `${detail} · ${Number(candidate?.score ?? 0).toFixed(2)}` : Number(candidate?.score ?? 0).toFixed(2)
        };
    }

    getMyteAiMessages() {
        const activeMyte = this.parent.activeMyte;
        const aiState    = activeMyte?.ai?.getDebugState?.();
        if (!activeMyte || !aiState) return [];

        const drives = aiState.context?.drives || {};
        const fmt    = v => (v == null ? 'N/A' : Number(v).toFixed(2));

        const candidateRows = (aiState.candidates || [])
            .slice(0, 5)
            .map((candidate, index) => this.formatAiCandidate(candidate, index));

        return [
            { label: 'Decision',    value: aiState.lastDecisionLabel ? this.prettifyAiPath(aiState.lastDecisionLabel) : 'N/A' },
            { label: 'Rest',        value: fmt(drives.restDrive) },
            { label: 'Eat',         value: fmt(drives.eatDrive) },
            { label: 'Play',        value: fmt(drives.playDrive) },
            { label: 'Social',      value: fmt(drives.socialDrive) },
            { label: 'Explore',     value: fmt(drives.exploreDrive) },
            { label: 'Comfort',     value: fmt(drives.comfortDrive) },
            { label: 'Safety',      value: fmt(drives.safetyDrive) },
            { label: 'Light need',  value: fmt(aiState.context?.lightNeed) },
            { label: 'Music need',  value: fmt(aiState.context?.musicNeed) },
            { label: 'Local light', value: fmt(aiState.context?.localLightLevel) },
            ...candidateRows
        ];
    }

    getSoundMessages() {
        const sm = this.parent.core?.soundManager;
        if (!sm) return [{ label: 'Audio', value: 'SoundManager unavailable' }];

        const messages = [];

        if (!sm.initialized) {
            messages.push({ label: 'Audio', value: 'Not initialized' });
            return messages;
        }

        // Global state
        messages.push({ label: 'Sound',   value: sm.soundEnabled   ? 'On' : 'Off' });
        messages.push({ label: 'Music',   value: sm.musicEnabled   ? 'On' : 'Off' });
        messages.push({ label: 'Ambient', value: sm.ambientEnabled ? 'On' : 'Off' });

        // Map context
        const ctx = sm._mapContext;
        if (ctx) {
            messages.push({ label: 'Location', value: ctx.location ?? '—' });
            if (ctx.musicOverride)   messages.push({ label: 'Music Override',   value: ctx.musicOverride });
            if (ctx.ambientOverride?.length) {
                messages.push({ label: 'Ambient Override', value: ctx.ambientOverride.join(', ') });
            }
        }

        // Active music track
        messages.push({ label: 'Music Track', value: sm.currentMusicSynth ?? '—' });

        // Active ambient sounds — check synths not loops; noise-based ambient sounds
        // (wind, indoor, water) are in synths only; only pattern-based (birds, crickets) use loops
        const ambientLoops = [];
        sm.synths.forEach((_sound, id) => {
            const preset = sm.synthPresets[id];
            if (preset?.type === 'ambient' && !(sm._proximitySounds?.has(id))) {
                ambientLoops.push(id);
            }
        });
        messages.push({
            label: 'Ambient Loops',
            value: ambientLoops.length ? ambientLoops.join(', ') : '—'
        });

        // Proximity sounds — shown with their current volume so distance-fade is visible
        const proxIds = sm._proximitySounds ? [...sm._proximitySounds] : [];
        if (proxIds.length) {
            proxIds.forEach(id => {
                const sound = sm.synths.get(id);
                const vol = sound?.currentVolume != null
                    ? ` (${(sound.currentVolume * 100).toFixed(0)}%)`
                    : '';
                messages.push({ label: `Proximity: ${id}`, value: `active${vol}` });
            });
        } else {
            messages.push({ label: 'Proximity', value: '—' });
        }

        // Active SFX/machine loops (non-ambient, non-music — e.g. fountains)
        const machineLoops = [];
        sm.loops.forEach((_loop, id) => {
            const preset = sm.synthPresets[id];
            if (preset && preset.type !== 'ambient' && preset.type !== 'music') {
                machineLoops.push(id);
            }
        });
        if (machineLoops.length) {
            messages.push({ label: 'Object Loops', value: machineLoops.join(', ') });
        }

        // Proximity diagnostics — directly inspect the grid near the myte so we can
        // confirm whether water cells are present even when the sound isn't triggering
        const gm = this.parent.gameMap;
        const myte = this.parent.activeMyte;
        if (gm && myte) {
            const gs = gm.gridSystem;
            if (gs?.grid) {
                const cs  = gs.config.cellSize;
                // Use collider ground-center, matching what proximity scan uses
                const ox  = myte.collider?.offsetX ?? 0;
                const oy  = myte.collider?.offsetY ?? 0;
                const cw  = myte.collider?.width  ?? myte.size?.width  ?? 0;
                const ch  = myte.collider?.height ?? myte.size?.height ?? 0;
                const cx  = Math.floor((myte.posX + ox + cw / 2) / cs);
                const cy  = Math.floor((myte.posY + oy + ch)     / cs);
                const RADIUS = 192;
                const gr  = Math.ceil(RADIUS / cs);
                const terrainCounts = {};
                for (let gx = Math.max(0, cx - gr); gx <= Math.min(gs.gridWidth - 1, cx + gr); gx++) {
                    for (let gy = Math.max(0, cy - gr); gy <= Math.min(gs.gridHeight - 1, cy + gr); gy++) {
                        const t = gs.grid[gx]?.[gy]?.terrainType;
                        if (t && t !== 'ground') terrainCounts[t] = (terrainCounts[t] || 0) + 1;
                    }
                }
                const nearby = Object.entries(terrainCounts).map(([t, n]) => `${t}×${n}`).join(', ');
                messages.push({ label: 'Nearby Terrain', value: nearby || 'ground only' });
                messages.push({ label: 'Myte Grid', value: `[${cx}, ${cy}]` });
            } else {
                messages.push({ label: 'Nearby Terrain', value: 'no grid' });
            }
        }

        return messages;
    }

    // ─── utility ─────────────────────────────────────────────────────────────

    pixelToTile(px, py) {
        const cellSize = this.parent.gameMap?.gridSystem?.config?.cellSize;
        if (!cellSize) return null;
        return { x: Math.floor(px / cellSize), y: Math.floor(py / cellSize) };
    }

    getActiveEntitiesCount() {
        return this.parent.mytes?.filter(myte => myte.isActive).length || 0;
    }

    getMemoryUsage() {
        if (window.performance?.memory) {
            return `${(window.performance.memory.usedJSHeapSize / (1024 * 1024)).toFixed(2)} MB`;
        }
        return 'N/A';
    }

    // ─── collider / region visualization ────────────────────────────────────

    _appendRegionBox(layer, bounds, ...cssClasses) {
        if (!bounds) return;
        const el = document.createElement('div');
        el.classList.add('debug-collider', ...cssClasses);
        el.style.position = 'absolute';
        el.style.left   = `${bounds.left}px`;
        el.style.top    = `${bounds.top}px`;
        el.style.width  = `${bounds.right !== undefined ? bounds.right - bounds.left : bounds.width}px`;
        el.style.height = `${bounds.bottom !== undefined ? bounds.bottom - bounds.top : bounds.height}px`;
        layer.appendChild(el);
    }

    _appendAnchorDot(layer, x, y, label) {
        const r = 4;
        const el = document.createElement('div');
        el.classList.add('debug-collider', 'debug-anchor');
        el.style.position = 'absolute';
        el.style.left  = `${x - r}px`;
        el.style.top   = `${y - r}px`;
        el.title = label ?? '';
        layer.appendChild(el);
    }

    drawDebugColliders() {
        if (!this.parent?.gameMap) return;
        if (!this.parent.gameMap.layers?.debug) return;

        const layer = this.parent.gameMap.layers.debug;
        layer.querySelectorAll('.debug-collider').forEach(c => c.remove());

        const anyEnabled = Object.values(this.overlayState).some(Boolean);
        if (!anyEnabled) return;

        const mytes   = this.parent.mytes ?? [];
        const objects = [...(this.parent.gameMap.gridSystem?.activeObjects ?? [])];

        mytes.forEach(myte => {
            if (!myte) return;
            // Skip mytes in their home slot — their coordinates are relative to the slot
            // element, not the map, so debug boxes would render at the wrong position.
            if (!myte.isActive) return;
            try {
                if (this.overlayState.colliders) {
                    this._appendRegionBox(layer, myte.parent.getEntityColliderBounds(myte), 'myte-collider');
                }
                if (this.overlayState.interaction) {
                    const rect = myte.getRegionRect?.('interaction');
                    if (!rect && !myte._debugRegionWarned) {
                        myte._debugRegionWarned = true;
                        console.warn('[DebugUI] myte interaction region is null. species:', myte.species,
                            '| spatial.regions:', myte.definition?.spatial?.regions,
                            '| posX:', myte.posX, 'posY:', myte.posY);
                    }
                    this._appendRegionBox(layer, rect, 'debug-region-interaction');
                }
                if (this.overlayState.hit) {
                    this._appendRegionBox(layer, myte.getRegionRect?.('hit'), 'debug-region-hit');
                }
                if (this.overlayState.select) {
                    this._appendRegionBox(layer, myte.getRegionRect?.('select'), 'debug-region-select');
                }
                if (this.overlayState.pickup) {
                    this._appendRegionBox(layer, myte.getRegionRect?.('pickup'), 'debug-region-pickup');
                }
                if (this.overlayState.anchors) {
                    const anchors = myte.definition?.spatial?.anchors ?? {};
                    Object.entries(anchors).forEach(([id, anchor]) => {
                        if (!anchor) return;
                        this._appendAnchorDot(layer, myte.posX + (anchor.x ?? 0), myte.posY + (anchor.y ?? 0), id);
                    });
                }
            } catch (e) {
                console.error('[DebugUI] myte collider draw error:', e);
            }
        });

        try {
            objects.forEach(obj => {
                if (!obj || obj instanceof Myte) return;
                try {
                    if (this.overlayState.colliders) {
                        const bounds = this.parent.getEntityColliderBounds(obj);
                        const css = ['object-collider', ...(obj.config?.physics?.walkable ? ['walkable-object'] : [])];
                        this._appendRegionBox(layer, bounds, ...css);

                        const slotConfig = obj.getActionConfig?.('use_surface_slot');
                        if (slotConfig) {
                            (obj.getActionSlotDefinitions?.('use_surface_slot') ?? []).forEach(slot => {
                                if (!slot?.restPosition) return;
                                const cb = this.parent.getEntityColliderBounds(obj);
                                const sx = cb.left + (cb.right - cb.left) * (slot.restPosition.xFactor ?? 0.5);
                                const sy = cb.top  + (cb.bottom - cb.top) * (slot.restPosition.yFactor ?? 0.5);
                                const dot = document.createElement('div');
                                dot.classList.add('debug-collider', 'slot-marker');
                                dot.style.position = 'absolute';
                                dot.style.left   = `${sx - 4}px`;
                                dot.style.top    = `${sy - 4}px`;
                                dot.style.width  = '8px';
                                dot.style.height = '8px';
                                layer.appendChild(dot);
                            });
                        }
                    }
                    if (this.overlayState.interaction) {
                        this._appendRegionBox(layer, obj.getRegionRect?.('interaction'), 'debug-region-interaction');
                    }
                    if (this.overlayState.hit) {
                        this._appendRegionBox(layer, obj.getRegionRect?.('hit'), 'debug-region-hit');
                    }
                    if (this.overlayState.select) {
                        this._appendRegionBox(layer, obj.getRegionRect?.('select'), 'debug-region-select');
                    }
                    if (this.overlayState.pickup) {
                        this._appendRegionBox(layer, obj.getRegionRect?.('pickup'), 'debug-region-pickup');
                    }
                } catch {}
            });
        } catch {}
    }

    reconcileOverlayControls() {
        if (!this.debug) return;

        let refs = this.debugDomRefs.get('overlays');
        if (!refs) {
            const sectionEl = document.createElement('details');
            sectionEl.className = 'debug-section overlays';
            sectionEl.dataset.sectionKey = 'overlays';
            const state = this.debugSectionState.overlays;
            sectionEl.open = state?.open ?? true;

            const summary = document.createElement('summary');
            summary.textContent = 'Debug – Overlays';
            sectionEl.appendChild(summary);

            const body = document.createElement('div');
            body.className = 'debug-section-body debug-overlay-controls';

            const defs = [
                { key: 'colliders',   label: 'Colliders',    css: 'myte-collider'           },
                { key: 'interaction', label: 'Interaction',   css: 'debug-region-interaction' },
                { key: 'hit',         label: 'Hit',           css: 'debug-region-hit'         },
                { key: 'select',      label: 'Select',        css: 'debug-region-select'      },
                { key: 'pickup',      label: 'Pickup',        css: 'debug-region-pickup'      },
                { key: 'anchors',     label: 'Anchors',       css: 'debug-anchor'             }
            ];

            const controlMap = new Map();
            for (const { key, label, css } of defs) {
                const row = document.createElement('label');
                row.className = 'debug-overlay-row';

                const swatch = document.createElement('span');
                swatch.className = `debug-overlay-swatch debug-collider ${css}`;
                row.appendChild(swatch);

                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.checked = this.overlayState[key] ?? false;
                cb.addEventListener('change', () => {
                    this.overlayState[key] = cb.checked;
                    this._saveOverlayState();
                });
                row.appendChild(cb);
                row.append(` ${label}`);
                body.appendChild(row);
                controlMap.set(key, {
                    input: cb,
                    getValue: () => this.overlayState[key] ?? false
                });
            }

            const directInteractRow = document.createElement('label');
            directInteractRow.className = 'debug-overlay-row';

            const directInteractSwatch = document.createElement('span');
            directInteractSwatch.className = 'debug-overlay-swatch';
            directInteractRow.appendChild(directInteractSwatch);

            const directInteractInput = document.createElement('input');
            directInteractInput.type = 'checkbox';
            directInteractInput.checked = this.isDirectWorldInteractionEnabled();
            directInteractInput.addEventListener('change', () => {
                this.setDirectWorldInteractionEnabled(directInteractInput.checked);
            });
            directInteractRow.appendChild(directInteractInput);
            directInteractRow.append(' Direct Interact');
            body.appendChild(directInteractRow);
            controlMap.set('directWorldInteraction', {
                input: directInteractInput,
                getValue: () => this.isDirectWorldInteractionEnabled()
            });

            sectionEl.appendChild(body);
            this.debug.appendChild(sectionEl);
            refs = { sectionEl, controlMap };
            this.debugDomRefs.set('overlays', refs);
        }

        for (const { input, getValue } of refs.controlMap.values()) {
            const current = !!getValue();
            if (input.checked !== current) input.checked = current;
        }

        this._maybeApplyResponsiveSectionState('overlays');
        this._applySectionPosition('overlays');
    }

    // ─── main update ─────────────────────────────────────────────────────────

    updateDebug() {
        const debugGroups = [
            { name: 'System',    messages: this.getSystemMessages() },
            { name: 'Input',     messages: this.getInputMessages() },
            { name: 'Time',      messages: this.getTimeMessages() },
            { name: 'Map',       messages: this.getMapMessages() },
            { name: 'Camera',    messages: this.getCameraMessages() },
            { name: 'Sound',     messages: this.getSoundMessages() },
            { name: 'Myte',      messages: this.getMyteMessages() },
            { name: 'Myte Stats', messages: this.getMyteStats() },
            { name: 'Myte AI',   messages: this.getMyteAiMessages() }
        ];

        this.parent.activeMyte?.queue?.getCurrentAction?.()?.refreshDebugVisualization?.();

        for (const { key, title, groups } of this.getDebugSections(debugGroups)) {
            this.reconcileSection(key, title, groups);
        }

        this.ensureDebugOverlaySetup();
    }

    clearDebugVisuals() {
        if (this.debug) {
            this.debugDomRefs.forEach(refs => refs.sectionEl?.remove());
            this.debugDomRefs.clear();
        }

        const debugLayer = this.parent?.gameMap?.layers?.debug;
        if (debugLayer) {
            debugLayer.querySelectorAll('.debug-collider, .pathfinder-node').forEach(node => node.remove());
        }
    }

    update() {
        const debugEnabled = document.body.classList.contains('debug');
        const gridSystem   = this.parent?.gameMap?.gridSystem;
        const camera = this.parent?.camera;

        if (gridSystem !== this.lastBootstrappedGridSystem) {
            this.lastBootstrappedGridSystem = gridSystem;
            this.gridBootstrapAttempts = 0;
        }

        if (debugEnabled && gridSystem && !gridSystem.debugMode) {
            gridSystem.toggleDebug();
            this._applyGridOverlays(gridSystem);
        }

        if (!debugEnabled) {
            this.gridBootstrapAttempts = 0;
        } else if (
            gridSystem &&
            camera &&
            gridSystem.debugMode &&
            this.gridBootstrapAttempts < 3
        ) {
            const canvasVisibility = this.parent?.canvas
                ? window.getComputedStyle(this.parent.canvas).visibility
                : 'visible';

            if (canvasVisibility !== 'hidden') {
                gridSystem.forceDebugRefresh?.(camera);
                this.gridBootstrapAttempts += 1;
            }
        }

        if (debugEnabled && this.debug) {
            // Overlay boxes run every frame so they track moving entities without lag
            this.drawDebugColliders();

            const now = performance.now();
            if (now - this.lastDebugUpdate < this.debugUpdateInterval) return;
            this.lastDebugUpdate = now;
            try {
                this.updateDebug();
                this.wasDebugEnabled = true;
            } catch (error) {
                console.warn('Debug UI update error:', error);
            }
        } else if (this.wasDebugEnabled) {
            this.clearDebugVisuals();
            this.wasDebugEnabled = false;
        }

        if (this.queueUI) {
            try {
                this.queueUI.update();
                this._maybeApplyResponsiveQueueState();
            } catch {}
        }
    }

    dispose() {
        this.clearDebugVisuals();

        if (this.debugOverlaySetup && this.debug) {
            this.debug.removeEventListener('pointerdown', this.handleDebugPointerDown);
            this.debug.removeEventListener('click', this.handleDebugSummaryClick, true);
        }

        const summary = this.queueUI?.panelSummary;
        if (summary) {
            summary.removeEventListener('click', this.handleDebugSummaryClick, true);
            summary.removeEventListener('pointerdown', this.handleQueuePointerDown);
        }

        window.removeEventListener('pointermove', this.handleDebugPointerMove);
        window.removeEventListener('pointerup',   this.handleDebugPointerUp);
        window.removeEventListener('pointercancel', this.handleDebugPointerUp);
        window.removeEventListener('resize', this.handleWindowResize);

        this.debugOverlaySetup = false;
        this.dragState = null;
        this.queueUI?.dispose?.();
        this.queueUI = null;
    }
}
