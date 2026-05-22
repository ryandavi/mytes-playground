class DebugUI {
    static PERSIST_KEY = 'neko.debug';

    constructor(parent) {
        this.parent = parent;
        this.debug = document.querySelector('.debug-panel');
        this.cameraEnabled = false;
        this.camera = null;
        this.wasDebugEnabled = false;

        // Per-section drag + collapse state (keyed by sectionKey + 'queue')
        this.debugSectionState = {
            system: { x: null, y: null, open: true },
            myte:   { x: null, y: null, open: true },
            queue:  { x: null, y: null }
        };

        this.overlayState = {
            colliders: true
        };

        this.debugDomRefs = new Map();
        this.debugMenuSetup = false;

        // Drag tracking (shared for debug sections + queue panel)
        this.dragState = null;
        this.handleDebugPointerDown   = this.onDebugPointerDown.bind(this);
        this.handleDebugPointerMove   = this.onDebugPointerMove.bind(this);
        this.handleDebugPointerUp     = this.onDebugPointerUp.bind(this);
        this.handleDebugSummaryClick  = this.onDebugSummaryClick.bind(this);
        this.handleQueuePointerDown   = this.onQueuePointerDown.bind(this);

        this.queueUI = new QueueUI(parent);
        this.lastDebugUpdate = 0;
        this.debugUpdateInterval = 100;
        this.gridBootstrapAttempts = 0;
        this.lastBootstrappedGridSystem = null;

        // Load persisted state and apply
        this._applyPersistedState();
    }

    // ─── persistence helpers ─────────────────────────────────────────────────

    _loadState() {
        try {
            return JSON.parse(localStorage.getItem(DebugUI.PERSIST_KEY) || '{}');
        } catch {
            return {};
        }
    }

    _saveState(patch) {
        try {
            const state = this._loadState();
            Object.assign(state, patch);
            localStorage.setItem(DebugUI.PERSIST_KEY, JSON.stringify(state));
        } catch {}
    }

    _saveSectionState(key) {
        const s = this.debugSectionState[key];
        if (!s) return;
        const state = this._loadState();
        if (!state.sections) state.sections = {};
        state.sections[key] = { x: s.x, y: s.y, open: s.open };
        try { localStorage.setItem(DebugUI.PERSIST_KEY, JSON.stringify(state)); } catch {}
    }

    _saveQueueState() {
        const q = this.debugSectionState.queue;
        const state = this._loadState();
        state.queue = { x: q.x, y: q.y, collapsed: this.queueUI?.isCollapsed ?? false };
        try { localStorage.setItem(DebugUI.PERSIST_KEY, JSON.stringify(state)); } catch {}
    }

    _saveMenuPosition(pos) {
        this._saveState({ menu: { x: Math.round(pos.x), y: Math.round(pos.y) } });
    }

    _saveOverlayState() {
        this._saveState({ overlays: { ...this.overlayState } });
    }

    _saveGridOverlays() {
        const flags = this.parent?.gameMap?.gridSystem?.overlayFlags;
        if (!flags) return;
        const state = this._loadState();
        state.gridOverlays = { ...flags };
        try { localStorage.setItem(DebugUI.PERSIST_KEY, JSON.stringify(state)); } catch {}
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
                }
            }
        }

        // Queue position + collapse
        if (state.queue) {
            const q = this.debugSectionState.queue;
            q.x = state.queue.x ?? null;
            q.y = state.queue.y ?? null;
            if (state.queue.collapsed != null && this.queueUI) {
                this.queueUI.setCollapsed(state.queue.collapsed);
            }
        }

        // Overlay flags
        if (state.overlays) {
            Object.assign(this.overlayState, state.overlays);
        }

        // Apply queue panel position
        this._applyQueuePosition();
    }

    _applyQueuePosition() {
        const queueEl = this.queueUI?.queue;
        if (!queueEl) return;
        const q = this.debugSectionState.queue;
        queueEl.style.right = 'auto';
        queueEl.style.transform = 'none';
        if (q.x != null && q.y != null) {
            queueEl.style.position = 'fixed';
            queueEl.style.left = `${q.x}px`;
            queueEl.style.top  = `${q.y}px`;
        } else {
            // Default: bottom-left
            const def = this._getDefaultQueuePosition();
            q.x = def.x;
            q.y = def.y;
            queueEl.style.position = 'fixed';
            queueEl.style.left = `${def.x}px`;
            queueEl.style.top  = `${def.y}px`;
        }
    }

    _getDefaultQueuePosition() {
        const margin = 10;
        return { x: margin, y: Math.max(margin, window.innerHeight - 300) };
    }

    // ─── debug section DOM ───────────────────────────────────────────────────

    getDebugSections(debugGroups) {
        return [
            {
                key: 'system',
                title: 'Debug – System',
                groups: debugGroups.filter(g => ['System', 'Input', 'Time', 'Map', 'Camera'].includes(g.name))
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

            if (state) {
                if (state.x === null) {
                    const def = this.getDefaultSectionPosition(sectionKey);
                    state.x = def.x;
                    state.y = def.y;
                }
                sectionEl.style.left = `${state.x}px`;
                sectionEl.style.top  = `${state.y}px`;
            }

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
                groupEl.open = true;

                const summary = document.createElement('summary');
                summary.className = 'debug-group-summary';
                summary.textContent = name;
                groupEl.appendChild(summary);

                const table = document.createElement('table');
                table.className = 'debug-table';
                groupEl.appendChild(table);

                refs.bodyEl.appendChild(groupEl);
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
    }

    getDefaultSectionPosition(key) {
        const margin    = 10;
        const panelWidth = 350;
        if (key === 'myte') {
            return { x: Math.max(margin, window.innerWidth - panelWidth - margin), y: 60 };
        }
        return { x: margin, y: 60 };
    }

    // ─── drag: debug sections ────────────────────────────────────────────────

    ensureDebugMenuSetup() {
        if (!this.debug || this.debugMenuSetup) return;

        this.debug.addEventListener('pointerdown', this.handleDebugPointerDown);
        this.debug.addEventListener('click', this.handleDebugSummaryClick, true);
        this.debugMenuSetup = true;

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
        const state      = this.debugSectionState[sectionKey];

        this.dragState = {
            type: 'section',
            sectionKey,
            pointerId:   event.pointerId,
            startX:      event.clientX,
            startY:      event.clientY,
            originLeft:  state?.x ?? section.getBoundingClientRect().left,
            originTop:   state?.y ?? section.getBoundingClientRect().top,
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

        const q = this.debugSectionState.queue;
        const rect = queueEl.getBoundingClientRect();

        this.dragState = {
            type: 'queue',
            pointerId:  event.pointerId,
            startX:     event.clientX,
            startY:     event.clientY,
            originLeft: q.x ?? rect.left,
            originTop:  q.y ?? rect.top,
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

            const maxLeft = Math.max(8, window.innerWidth  - section.offsetWidth  - 8);
            const maxTop  = Math.max(8, window.innerHeight - section.offsetHeight - 8);
            const nextLeft = Math.min(Math.max(8, this.dragState.originLeft + deltaX), maxLeft);
            const nextTop  = Math.min(Math.max(8, this.dragState.originTop  + deltaY), maxTop);

            section.style.left = `${Math.round(nextLeft)}px`;
            section.style.top  = `${Math.round(nextTop)}px`;

            const state = this.debugSectionState[this.dragState.sectionKey];
            if (state) {
                state.x = Math.round(nextLeft);
                state.y = Math.round(nextTop);
            }

        } else if (this.dragState.type === 'queue') {
            const queueEl = this.queueUI?.queue;
            const queueShell = this.queueUI?.panelShell;
            if (!queueEl || !queueShell) return;

            queueShell.classList.add('dragging');

            const maxLeft = Math.max(8, window.innerWidth  - queueEl.offsetWidth  - 8);
            const maxTop  = Math.max(8, window.innerHeight - queueEl.offsetHeight - 8);
            const nextLeft = Math.min(Math.max(8, this.dragState.originLeft + deltaX), maxLeft);
            const nextTop  = Math.min(Math.max(8, this.dragState.originTop  + deltaY), maxTop);

            queueEl.style.left = `${Math.round(nextLeft)}px`;
            queueEl.style.top  = `${Math.round(nextTop)}px`;

            this.debugSectionState.queue.x = Math.round(nextLeft);
            this.debugSectionState.queue.y = Math.round(nextTop);
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
                    messages.push({
                        label: `<span class="badge ${type}">${type}</span> ${zoneId}`,
                        labelClean: `${type} ${zoneId}`,
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
            { label: 'Z-Index',         value: activeMyte.duplicate.style.zIndex },
            { label: 'Queue Items',     value: activeMyte.queue.count() }
        ];
    }

    getMyteStats() {
        const activeMyte = this.parent.activeMyte;
        if (!activeMyte) return [];

        const status = activeMyte.stats.getStatus();
        return [
            { label: 'Mood',        value: `${activeMyte.stats.mood.toFixed(1)} (${activeMyte.stats.getMoodStatus()})` },
            { label: 'Boredom',     value: activeMyte.stats.boredom.toFixed(1) },
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

        const needs = aiState.context?.needs || {};
        const fmt   = v => (v == null ? 'N/A' : Number(v).toFixed(2));

        const candidateRows = (aiState.candidates || [])
            .slice(0, 5)
            .map((candidate, index) => this.formatAiCandidate(candidate, index));

        return [
            { label: 'Decision',     value: aiState.lastDecisionLabel ? this.prettifyAiPath(aiState.lastDecisionLabel) : 'N/A' },
            { label: 'Rest',         value: fmt(needs.rest) },
            { label: 'Social',       value: fmt(needs.social) },
            { label: 'Enrichment',   value: fmt(needs.enrichment) },
            { label: 'Play',         value: fmt(needs.play) },
            { label: 'Comfort',      value: fmt(needs.comfort) },
            { label: 'Light need',   value: fmt(aiState.context?.lightNeed) },
            { label: 'Music need',   value: fmt(aiState.context?.musicNeed) },
            { label: 'Local light',  value: fmt(aiState.context?.localLightLevel) },
            ...candidateRows
        ];
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

    // ─── collider visualization ──────────────────────────────────────────────

    drawDebugColliders() {
        if (!this.parent?.gameMap) return;
        if (!this.parent.gameMap.layers?.debug) return;

        const oldColliders = this.parent.gameMap.layers.debug.querySelectorAll('.debug-collider');
        oldColliders.forEach(c => c.remove());

        if (!this.overlayState.colliders) return;

        if (this.parent.mytes) {
            this.parent.mytes.forEach(myte => {
                if (!myte) return;
                try {
                    const myteCollider = document.createElement('div');
                    myteCollider.classList.add('debug-collider', 'myte-collider');
                    const bounds = myte.parent.getColliderBounds(myte);
                    myteCollider.style.left   = `${bounds.left}px`;
                    myteCollider.style.top    = `${bounds.top}px`;
                    myteCollider.style.width  = `${bounds.right - bounds.left}px`;
                    myteCollider.style.height = `${bounds.bottom - bounds.top}px`;
                    this.parent.gameMap.layers.debug.appendChild(myteCollider);
                } catch {}
            });
        }

        if (!this.parent.gameMap.gridSystem?.activeObjects) return;

        try {
            this.parent.gameMap.gridSystem.activeObjects.forEach(obj => {
                if (!obj) return;
                try {
                    const collider = document.createElement('div');
                    collider.classList.add('debug-collider', 'object-collider');
                    if (obj.config?.walkable) collider.classList.add('walkable-object');

                    const bounds = this.parent.getColliderBounds(obj);
                    collider.style.position = 'absolute';
                    collider.style.left     = `${bounds.left}px`;
                    collider.style.top      = `${bounds.top}px`;
                    collider.style.width    = `${bounds.right - bounds.left}px`;
                    collider.style.height   = `${bounds.bottom - bounds.top}px`;

                    if (obj instanceof Myte) {
                        collider.classList.add('myte-collider');
                    }

                    this.parent.gameMap.layers.debug.appendChild(collider);
                } catch {}
            });
        } catch {}
    }

    // ─── main update ─────────────────────────────────────────────────────────

    updateDebug() {
        const debugGroups = [
            { name: 'System',    messages: this.getSystemMessages() },
            { name: 'Input',     messages: this.getInputMessages() },
            { name: 'Time',      messages: this.getTimeMessages() },
            { name: 'Map',       messages: this.getMapMessages() },
            { name: 'Camera',    messages: this.getCameraMessages() },
            { name: 'Myte',      messages: this.getMyteMessages() },
            { name: 'Myte Stats', messages: this.getMyteStats() },
            { name: 'Myte AI',   messages: this.getMyteAiMessages() }
        ];

        this.drawDebugColliders();
        this.parent.activeMyte?.queue?.getCurrentAction?.()?.refreshDebugVisualization?.();

        for (const { key, title, groups } of this.getDebugSections(debugGroups)) {
            this.reconcileSection(key, title, groups);
        }

        this.ensureDebugMenuSetup();
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
            } catch {}
        }
    }

    dispose() {
        this.clearDebugVisuals();

        if (this.debugMenuSetup && this.debug) {
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

        this.debugMenuSetup = false;
        this.dragState = null;
        this.queueUI?.dispose?.();
        this.queueUI = null;
    }
}
