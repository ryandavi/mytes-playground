class DebugUI {
    constructor(parent) {
        this.parent = parent;
        this.debug = document.querySelector(".debugMenu");
        this.cameraEnabled = false;
        this.camera = null;
        this.wasDebugEnabled = false;
        this.debugSectionState = {
            system: { x: null, y: null },
            myte: { x: null, y: null }
        };
        this.debugDomRefs = new Map();
        this.debugMenuSetup = false;
        this.dragState = null;
        this.handleDebugPointerDown = this.onDebugPointerDown.bind(this);
        this.handleDebugPointerMove = this.onDebugPointerMove.bind(this);
        this.handleDebugPointerUp = this.onDebugPointerUp.bind(this);
        this.handleDebugSummaryClick = this.onDebugSummaryClick.bind(this);

        this.queueUI = new QueueUI(parent);
        this.lastDebugUpdate = 0;
        this.debugUpdateInterval = 100;
    }

    getDebugSections(debugGroups) {
        return [
            {
                key: 'system',
                title: 'System',
                groups: debugGroups.filter(g => ['System', 'Input', 'Time', 'Map', 'Camera'].includes(g.name))
            },
            {
                key: 'myte',
                title: 'Myte',
                groups: [
                    { name: 'Overview', messages: this.getMyteSummaryMessages() },
                    ...debugGroups.filter(g => ['Myte', 'Myte Stats', 'Myte AI'].includes(g.name))
                ]
            }
        ];
    }

    getMyteSummaryMessages() {
        const mytes = this.parent.mytes || [];
        const active = mytes.filter(m => m?.isActive);
        const inactive = mytes.filter(m => m && !m.isActive);
        const messages = [
            { label: "Total", value: mytes.length },
            { label: "Active", value: active.length },
            { label: "Inactive", value: inactive.length }
        ];
        if (active.length > 0) {
            messages.push({ label: "Selected", value: this.parent.activeMyte?.name || '—' });
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
            sectionEl.open = true;

            const summary = document.createElement('summary');
            summary.textContent = title;
            sectionEl.appendChild(summary);

            const body = document.createElement('div');
            body.className = 'debug-section-body';
            sectionEl.appendChild(body);

            this.debug.appendChild(sectionEl);

            const state = this.debugSectionState[sectionKey];
            if (state) {
                if (state.x === null) {
                    const def = this.getDefaultSectionPosition(sectionKey);
                    state.x = def.x;
                    state.y = def.y;
                }
                sectionEl.style.left = `${state.x}px`;
                sectionEl.style.top = `${state.y}px`;
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
    const labelClean = item.labelClean ?? label;  // Use item's labelClean, not messages
    
    activeLabels.add(label);
    let valueCell = groupRefs.rowMap.get(label);

    if (!valueCell) {
        const tr = document.createElement('tr');
        const labelCell = document.createElement('td');
        labelCell.className = 'debug-label';
        labelCell.innerHTML = label;
        labelCell.title = labelClean;  // Will be labelClean if exists, otherwise label
        tr.appendChild(labelCell);

        valueCell = document.createElement('td');
        valueCell.className = 'debug-value';
        tr.appendChild(valueCell);

        groupRefs.tableEl.appendChild(tr);
        groupRefs.rowMap.set(label, valueCell);
    }

    const str = String(value ?? 'N/A');
    if (valueCell.textContent !== str) {
        valueCell.textContent = str;
    }
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
        const margin = 10;
        const panelWidth = 350;
        if (key === 'myte') {
            return { x: Math.max(margin, window.innerWidth - panelWidth - margin), y: 60 };
        }
        return { x: margin, y: 60 };
    }

    ensureDebugMenuSetup() {
        if (!this.debug || this.debugMenuSetup) {
            return;
        }

        this.debug.addEventListener('pointerdown', this.handleDebugPointerDown);
        // Capture all clicks on section summaries so we can control toggle ourselves
        this.debug.addEventListener('click', this.handleDebugSummaryClick, true);
        this.debugMenuSetup = true;
    }

    onDebugSummaryClick(event) {
        const summary = event.target.closest('.debug-section > summary');
        if (!summary || !this.debug?.contains(summary)) return;
        // Always prevent native <details> toggle on section summaries —
        // we handle it manually in onDebugPointerUp so drag doesn't trigger it.
        event.preventDefault();
    }

    onDebugPointerDown(event) {
        if (event.button !== 0) {
            return;
        }

        const summary = event.target.closest('.debug-section > summary');
        if (!summary || !this.debug?.contains(summary)) {
            return;
        }

        const section = summary.closest('.debug-section[data-section-key]');
        if (!section) return;

        const sectionKey = section.dataset.sectionKey;
        const state = this.debugSectionState[sectionKey];

        this.dragState = {
            sectionKey,
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            originLeft: state?.x ?? section.getBoundingClientRect().left,
            originTop: state?.y ?? section.getBoundingClientRect().top,
            moved: false
        };

        window.addEventListener('pointermove', this.handleDebugPointerMove);
        window.addEventListener('pointerup', this.handleDebugPointerUp);
        window.addEventListener('pointercancel', this.handleDebugPointerUp);
    }

    onDebugPointerMove(event) {
        if (!this.dragState || event.pointerId !== this.dragState.pointerId) {
            return;
        }

        const deltaX = event.clientX - this.dragState.startX;
        const deltaY = event.clientY - this.dragState.startY;

        if (!this.dragState.moved && Math.abs(deltaX) < 4 && Math.abs(deltaY) < 4) {
            return;
        }

        const section = this.debug?.querySelector(`.debug-section[data-section-key="${this.dragState.sectionKey}"]`);
        if (!section) return;

        this.dragState.moved = true;
        section.classList.add('dragging');
        event.preventDefault();

        const maxLeft = Math.max(8, window.innerWidth - section.offsetWidth - 8);
        const maxTop = Math.max(8, window.innerHeight - section.offsetHeight - 8);
        const nextLeft = Math.min(Math.max(8, this.dragState.originLeft + deltaX), maxLeft);
        const nextTop = Math.min(Math.max(8, this.dragState.originTop + deltaY), maxTop);

        section.style.left = `${Math.round(nextLeft)}px`;
        section.style.top = `${Math.round(nextTop)}px`;

        const state = this.debugSectionState[this.dragState.sectionKey];
        if (state) {
            state.x = Math.round(nextLeft);
            state.y = Math.round(nextTop);
        }
    }

    onDebugPointerUp(event) {
        if (!this.dragState || event.pointerId !== this.dragState.pointerId) {
            return;
        }

        const section = this.debug?.querySelector(`.debug-section[data-section-key="${this.dragState.sectionKey}"]`);

        if (this.dragState.moved) {
            section?.classList.remove('dragging');
        } else if (section) {
            // It was a tap/click with no drag — toggle the section
            section.open = !section.open;
        }

        this.dragState = null;
        window.removeEventListener('pointermove', this.handleDebugPointerMove);
        window.removeEventListener('pointerup', this.handleDebugPointerUp);
        window.removeEventListener('pointercancel', this.handleDebugPointerUp);
    }

    getSystemMessages() {
        return [
            { label: "FPS", value: this.parent.core.currentFPS.toFixed(2) },
            { label: "Memory Usage", value: this.getMemoryUsage() },
            { label: "Active Entities", value: this.getActiveEntitiesCount() }
        ];
    }

    getInputMessages() {
        const lastInputTime =
            this.parent.inputHandler?.inputSystem?.state?.lastActivityTime ??
            this.parent.inputHandler?.lastActiveTime ??
            null;

        const localMouse = this.parent.inputHandler.getMouseWorldPosition();
        const localTile = this.pixelToTile(localMouse.x, localMouse.y);
        const mouseTile = this.pixelToTile(this.parent.mousePosX, this.parent.mousePosY);

        return [
            { label: "User Active", value: this.parent.userIsActive },
            { label: "Local Mouse", value: `${localMouse.x.toFixed(2)}px, ${localMouse.y.toFixed(2)}px` },
            { label: "Local Mouse Tile", value: localTile ? `[${localTile.x}, ${localTile.y}]` : 'N/A' },
            { label: "Mouse", value: `${this.parent.mousePosX.toFixed(2)}px, ${this.parent.mousePosY.toFixed(2)}px` },
            { label: "Mouse Tile", value: mouseTile ? `[${mouseTile.x}, ${mouseTile.y}]` : 'N/A' },
            {
                label: "Last Input Time",
                value: Number.isFinite(lastInputTime)
                    ? new Date(lastInputTime).toLocaleTimeString()
                    : 'N/A'
            }
        ];
    }

    getTimeMessages() {
        const timeData = this.parent.timeManager.getTimeData();
        return [
            { label: "Time", value: timeData.formattedTime },
            { label: "Date", value: timeData.formattedDate },
            { label: "Time of Day", value: timeData.timeOfDay },
            { label: "Light Level", value: timeData.lightLevel.toFixed(2) },
            { label: "Moon Phase", value: timeData.moonPhase },
            { label: "Moon Illumination", value: timeData.moonIllumination.toFixed(2) },
            { label: "Moon Growth Multiplier", value: timeData.moonGrowthMultiplier.toFixed(2) }
        ];
    }


getMapMessages() {
    const messages = [];

    if (this.parent && this.parent.gameMap) {
        const gm = this.parent.gameMap;
        messages.push({ label: "Map ID", value: gm.id });
        messages.push({ label: "Map Name", value: gm.displayName || 'Unknown' });

        const cellSize = gm.gridSystem?.config?.cellSize;
        if (cellSize) messages.push({ label: "Tile Size", value: `${cellSize}px` });

        if (gm.dimensions) {
            const { width, height } = gm.dimensions;
            messages.push({ label: "Size", value: `${width} × ${height}px` });
            if (cellSize) {
                messages.push({ label: "Size (tiles)", value: `${Math.floor(width / cellSize)} × ${Math.floor(height / cellSize)}` });
            }
        }

        messages.push({ label: "Objects", value: (gm.objects && gm.objects.length) || 0 });

        if (gm.particleSystem) {
            messages.push({ label: "Particles", value: `${gm.particleSystem.particles?.length || 0}` });
            messages.push({ label: "Particle Emitters", value: `${gm.particleSystem.emitters?.length || 0}` });
        }
    }

    if (this.parent?.gameMap?.zoneManager?.zones?.size > 0) {
        messages.push(...this.getZoneDebugMessages());
    }

    return messages;
}

getZoneDebugMessages() {
    const messages = [];
    
    // Check if zoneManager exists
    if (!this.parent || !this.parent.gameMap || !this.parent.gameMap.zoneManager) {
        return messages;
    }
    
    const zoneManager = this.parent.gameMap.zoneManager;
    
    // Check if zones map exists
    if (!zoneManager.zones) {
        return messages;
    }
    
    try {
        zoneManager.zones.forEach((zone, zoneId) => {
            if (!zone || !zone.mytesInZone) return;

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
    } catch {
        // silently handle errors during transitions
    }

    return messages;
}

    getCameraMessages() {
        if (!this.parent.camera) return [];

        const cam = this.parent.camera;
        const zoom = cam.zoomLevel;
        const vp = this.parent.getContainerRect?.();
        const vpW = vp?.width ?? 0;
        const vpH = vp?.height ?? 0;

        const worldLeft   = -cam.posX;
        const worldTop    = -cam.posY;
        const worldRight  = vpW / zoom - cam.posX;
        const worldBottom = vpH / zoom - cam.posY;

        const tl = this.pixelToTile(worldLeft, worldTop);
        const br = this.pixelToTile(worldRight, worldBottom);
        const visW = tl && br ? br.x - tl.x + 1 : null;
        const visH = tl && br ? br.y - tl.y + 1 : null;

        return [
            { label: "Camera Position", value: `${cam.posX.toFixed(2)}px, ${cam.posY.toFixed(2)}px` },
            { label: "Zoom Level", value: zoom.toFixed(2) },
            { label: "Follow Mode", value: cam.followMode },
            { label: "Viewport Size", value: `${vpW.toFixed(0)}×${vpH.toFixed(0)}px` },
            { label: "Visible World", value: `${worldLeft.toFixed(0)},${worldTop.toFixed(0)} → ${worldRight.toFixed(0)},${worldBottom.toFixed(0)}px` },
            { label: "Visible Tiles", value: tl && br ? `(${tl.x},${tl.y}) → (${br.x},${br.y}) [${visW}×${visH}]` : 'N/A' },
        ];
    }

    getMyteMessages() {
        const activeMyte = this.parent.activeMyte;
        if (!activeMyte) return [];

        const posTile = this.pixelToTile(activeMyte.posX, activeMyte.posY);
        const targetTile = this.pixelToTile(activeMyte.targetX, activeMyte.targetY);

        return [
            // State & Behavior
            { label: "State", value: activeMyte.stateMachine.stateController.currentState },
            { label: "Goal", value: activeMyte.getMoveType(activeMyte.goal) },
            { label: "Previous Goal", value: activeMyte.getMoveType(activeMyte.previousGoal) },
            { label: "Follow Goal", value: activeMyte.getMoveFollowType(activeMyte.followGoal) },
            { label: "AI Goal", value: activeMyte.getMoveAutonomyType(activeMyte.autonomyGoal) },
            
            // Status
            { label: "Active", value: activeMyte.isActive },
            { label: "Deployed", value: activeMyte.isDeployed },
            { label: "In Slot", value: activeMyte.isInSlot },
            { label: "Controlled", value: activeMyte.isActiveMyte },

            // Movement
            { label: "Position", value: `${activeMyte.posX.toFixed(2)}px, ${activeMyte.posY.toFixed(2)}px` },
            { label: "Position Tile", value: posTile ? `[${posTile.x}, ${posTile.y}]` : 'N/A' },
            { label: "Target", value: `${activeMyte.targetX.toFixed(2)}px, ${activeMyte.targetY.toFixed(2)}px` },
            { label: "Target Tile", value: targetTile ? `[${targetTile.x}, ${targetTile.y}]` : 'N/A' },
            { label: "Direction", value: activeMyte.direction },
            { label: "Distance to Target", value: `${activeMyte.distanceFromTarget}px` },
            { label: "Distance from Mouse", value: `${activeMyte.distanceFromMouse}px` },
            
            // Physics
            { label: "Falling", value: activeMyte.isFalling },
            { label: "Jumping", value: activeMyte.isJumping },
            { label: "Velocity", value: activeMyte.physics.velocity.toFixed(3) },
            
            // UI & Rendering
            { label: "Z-Index", value: activeMyte.duplicate.style.zIndex },
            { label: "Queue Items", value: activeMyte.queue.count() }
        ];
    }

    getMyteStats(){
        const activeMyte = this.parent.activeMyte;
        if (!activeMyte) return [];

        let status = activeMyte.stats.getStatus();
        return [
            { label: "Mood", value: `${activeMyte.stats.mood.toFixed(1)} (${activeMyte.stats.getMoodStatus()})` },
            { label: "Boredom", value: activeMyte.stats.boredom.toFixed(1) },
            { label: "Comfort", value: activeMyte.stats.comfort.toFixed(1) },
            { label: "Confidence", value: activeMyte.stats.confidence.toFixed(1) },
            { label: "Speed", value: activeMyte.stats.getSpeed() },

            {label: "Health", value: status.health},
            {label: "Energy", value: status.energy.current.toFixed(1)},
            
            {label: "Level", value: status.level},
            {label: "Experience", value: status.experience},
            {label: "Personality", value: status.personality.description}
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
        const primary = this.prettifyAiToken(segments.shift() || rawLabel);
        const detail = segments.map(segment => this.prettifyAiToken(segment)).join(' / ');

        return {
            label: `#${index + 1} ${primary}`,
            value: detail ? `${detail} · ${Number(candidate?.score ?? 0).toFixed(2)}` : Number(candidate?.score ?? 0).toFixed(2)
        };
    }

    getMyteAiMessages() {
        const activeMyte = this.parent.activeMyte;
        const aiState = activeMyte?.ai?.getDebugState?.();
        if (!activeMyte || !aiState) return [];

        const needs = aiState.context?.needs || {};
        const fmt = v => (v == null ? 'N/A' : Number(v).toFixed(2));

        const candidateRows = (aiState.candidates || [])
            .slice(0, 5)
            .map((candidate, index) => this.formatAiCandidate(candidate, index));

        return [
            { label: "Decision", value: aiState.lastDecisionLabel ? this.prettifyAiPath(aiState.lastDecisionLabel) : 'N/A' },
            { label: "Rest", value: fmt(needs.rest) },
            { label: "Social", value: fmt(needs.social) },
            { label: "Enrichment", value: fmt(needs.enrichment) },
            { label: "Play", value: fmt(needs.play) },
            { label: "Comfort", value: fmt(needs.comfort) },
            { label: "Light need", value: fmt(aiState.context?.lightNeed) },
            { label: "Music need", value: fmt(aiState.context?.musicNeed) },
            { label: "Local light", value: fmt(aiState.context?.localLightLevel) },
            ...candidateRows
        ];
    }

    pixelToTile(px, py) {
        const cellSize = this.parent.gameMap?.gridSystem?.config?.cellSize;
        if (!cellSize) return null;
        return { x: Math.floor(px / cellSize), y: Math.floor(py / cellSize) };
    }

    getActiveEntitiesCount() {
        return this.parent.mytes?.filter(myte => myte.isActive).length || 0;
    }

    getMemoryUsage() {
        if (window.performance && window.performance.memory) {
            const memoryUsage = window.performance.memory.usedJSHeapSize / (1024 * 1024);
            return `${memoryUsage.toFixed(2)} MB`;
        }
        return 'N/A';
    }

// Add defensive checks to drawDebugColliders method
drawDebugColliders() {
    // Check if game map exists
    if (!this.parent || !this.parent.gameMap) return;
    
    // Check if debug layer exists
    if (!this.parent.gameMap.layers || !this.parent.gameMap.layers.debug) return;
    
    // Clear previous collider visuals
    const oldColliders = this.parent.gameMap.layers.debug.querySelectorAll('.debug-collider');
    oldColliders.forEach(c => c.remove());

    // Check if mytes array exists
    if (this.parent.mytes) {
        // Draw myte colliders
        this.parent.mytes.forEach(myte => {
            if (!myte) return; // Skip if myte is null
            
            try {
                const myteCollider = document.createElement('div');
                myteCollider.classList.add('debug-collider', 'myte-collider');
                const bounds = myte.parent.getColliderBounds(myte);
                myteCollider.style.left = `${bounds.left}px`;
                myteCollider.style.top = `${bounds.top}px`;
                myteCollider.style.width = `${bounds.right - bounds.left}px`;
                myteCollider.style.height = `${bounds.bottom - bounds.top}px`;
                this.parent.gameMap.layers.debug.appendChild(myteCollider);
            } catch (error) {
                // Silently handle errors during transitions
            }
        });
    }
    
    // Check if grid system and active objects exist
    if (!this.parent.gameMap.gridSystem || !this.parent.gameMap.gridSystem.activeObjects) return;
    
    // Draw colliders for all visible objects
    try {
        this.parent.gameMap.gridSystem.activeObjects.forEach(obj => {
            if (!obj) return; // Skip if object is null
            
            try {
                const collider = document.createElement('div');
                collider.classList.add('debug-collider', 'object-collider');

                if (obj.config && obj.config.walkable) {
                    collider.classList.add('walkable-object');
                }
                
                const bounds = this.parent.getColliderBounds(obj);
                collider.style.position = 'absolute';
                collider.style.left = `${bounds.left}px`;
                collider.style.top = `${bounds.top}px`;
                collider.style.width = `${bounds.right - bounds.left}px`;
                collider.style.height = `${bounds.bottom - bounds.top}px`;
                
                // Color based on object type
                if (obj instanceof Myte) {
                    collider.classList.add('myte-collider');
                } else {
                    collider.classList.add('object-collider');
                }
                
                this.parent.gameMap.layers.debug.appendChild(collider);
            } catch (error) {
                // Silently handle errors during transitions
            }
        });
    } catch (error) {
        // Silently handle errors during transitions
    }
}


    updateDebug() {
        const debugGroups = [
            { name: "System", messages: this.getSystemMessages() },
            { name: "Input", messages: this.getInputMessages() },
            { name: "Time", messages: this.getTimeMessages() },
            { name: "Map", messages: this.getMapMessages() },
            { name: "Camera", messages: this.getCameraMessages() },
            { name: "Myte", messages: this.getMyteMessages() },
            { name: "Myte Stats", messages: this.getMyteStats() },
            { name: "Myte AI", messages: this.getMyteAiMessages() }
        ];

        this.drawDebugColliders();

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
            debugLayer.querySelectorAll('.debug-collider').forEach(collider => collider.remove());
        }
    }

    update() {
        const debugEnabled = document.body.classList.contains('debug');

        // Check if debug element exists
        if (debugEnabled && this.debug) {
            const now = performance.now();
            if (now - this.lastDebugUpdate < this.debugUpdateInterval) return;
            this.lastDebugUpdate = now;
            try {
                this.updateDebug();
                this.wasDebugEnabled = true;
            } catch (error) {
                // Silently handle errors during transitions
                console.warn('Debug UI update error:', error);
            }
        } else if (this.wasDebugEnabled) {
            this.clearDebugVisuals();
            this.wasDebugEnabled = false;
        }
    
        // Update queue UI with error handling
        if (this.queueUI) {
            try {
                this.queueUI.update();
            } catch (error) {
                // Silently handle errors during transitions
            }
        }
    }

    dispose() {
        this.clearDebugVisuals();
        if (this.debugMenuSetup && this.debug) {
            this.debug.removeEventListener('pointerdown', this.handleDebugPointerDown);
            this.debug.removeEventListener('click', this.handleDebugSummaryClick, true);
        }
        window.removeEventListener('pointermove', this.handleDebugPointerMove);
        window.removeEventListener('pointerup', this.handleDebugPointerUp);
        window.removeEventListener('pointercancel', this.handleDebugPointerUp);
        this.debugMenuSetup = false;
        this.dragState = null;
        this.queueUI?.dispose?.();
        this.queueUI = null;
    }
}
