class DebugMenu extends ModalWindow {
    constructor(parent) {
        super(parent, {
            id: 'game-debug-panel',
            buttonId: 'debug-toggle',
            closeOnOutsideClick: false,
            position: 'top-right',
            draggable: true,
            closeButtonSelector: '.modal-close-btn'
        });

        // Button configuration
        // section: 'map' | 'myte'
        // subgroup: 'controls' | 'overlays' | 'stats'
        this.buttonConfigs = [

            // ── MAP / OVERLAYS ──────────────────────────────────────────
            {
                id: 'toggleDebug',
                section: 'map',
                subgroup: 'overlays',
                type: 'toggle',
                label: 'Visual Debug: ',
                states: { true: 'ON', false: 'OFF' },
                getValue: () => document.body.classList.contains('debug'),
                action: (button, value) => {
                    document.body.classList.toggle('debug');
                    const gridSystem = this.parent?.parent?.gameMap?.gridSystem;
                    if (gridSystem) gridSystem.toggleDebug();
                    this.updateButton('toggleDebug');
                    this._updateOverlaySubgroupVisibility();
                }
            },
            {
                id: 'overlayGrid',
                section: 'map',
                subgroup: 'overlays',
                type: 'toggle',
                label: 'Grid: ',
                states: { true: 'ON', false: 'OFF' },
                getValue: () => this.parent?.parent?.gameMap?.gridSystem?.overlayFlags?.grid ?? true,
                action: (button, value) => {
                    this.parent?.parent?.gameMap?.gridSystem?.setOverlayFlag('grid', value);
                    this.parent?.debug?._saveGridOverlays();
                    this.updateButton('overlayGrid');
                }
            },
            {
                id: 'overlayCursorTile',
                section: 'map',
                subgroup: 'overlays',
                type: 'toggle',
                label: 'Mouse Tile: ',
                states: { true: 'ON', false: 'OFF' },
                getValue: () => this.parent?.parent?.gameMap?.gridSystem?.overlayFlags?.cursorTile ?? true,
                action: (button, value) => {
                    this.parent?.parent?.gameMap?.gridSystem?.setOverlayFlag('cursorTile', value);
                    this.parent?.debug?._saveGridOverlays();
                    this.updateButton('overlayCursorTile');
                }
            },
            {
                id: 'overlayMyteFrontTile',
                section: 'map',
                subgroup: 'overlays',
                type: 'toggle',
                label: 'Facing Tile: ',
                states: { true: 'ON', false: 'OFF' },
                getValue: () => this.parent?.parent?.gameMap?.gridSystem?.overlayFlags?.myteFrontTile ?? true,
                action: (button, value) => {
                    this.parent?.parent?.gameMap?.gridSystem?.setOverlayFlag('myteFrontTile', value);
                    this.parent?.debug?._saveGridOverlays();
                    this.updateButton('overlayMyteFrontTile');
                }
            },
            {
                id: 'overlayColliders',
                section: 'map',
                subgroup: 'overlays',
                type: 'toggle',
                label: 'Colliders: ',
                states: { true: 'ON', false: 'OFF' },
                getValue: () => this.parent?.debug?.overlayState?.colliders ?? true,
                action: (button, value) => {
                    const debugUI = this.parent?.debug;
                    if (debugUI) {
                        debugUI.overlayState.colliders = value;
                        debugUI._saveOverlayState();
                    }
                    this.updateButton('overlayColliders');
                }
            },

            // ── MAP / CONTROLS ──────────────────────────────────────────
            {
                id: 'cycleCamera',
                section: 'map',
                subgroup: 'controls',
                type: 'cycle',
                label: 'Camera: ',
                target: { path: ['parent', 'camera'], property: 'followMode' },
                options: CAMERA_FOLLOW_MODES,
                getValue: () => this.parent.parent.camera.followMode,
                format: (value) => Utility.getKeyByValue(CAMERA_FOLLOW_MODES, value) || 'None',
                action: (button) => {
                    const currentMode = this.parent.parent.camera.followMode;
                    const nextMode = Utility.getNextKey(currentMode, CAMERA_FOLLOW_MODES);
                    this.parent.parent.camera.setMode(nextMode);
                    this.updateButton('cycleCamera');
                }
            },
            {
                id: 'cycleContainerLimit',
                section: 'map',
                subgroup: 'controls',
                type: 'toggle',
                label: 'Limit: ',
                target: { path: ['parent', 'settings'], property: 'limitMap' },
                states: { true: 'ON', false: 'OFF' },
                getValue: () => this.parent.parent.settings.limitMap,
                action: (button, value) => {
                    this.parent.parent.settings.limitMap = !this.parent.parent.settings.limitMap;

                    if (this.parent.parent.settings.limitMap) {
                        this.parent.parent.camera.limitToBounds = true;
                        this.parent.parent.camera.isScrollable.x = true;
                        this.parent.parent.camera.isScrollable.y = true;
                        this.parent.parent.element.closest('.container').classList.add('noScroll');
                        this.parent.parent.camera.resetView(true);
                    } else {
                        this.parent.parent.camera.limitToBounds = false;
                        this.parent.parent.camera.isScrollable.x = false;
                        this.parent.parent.camera.isScrollable.y = false;
                        this.parent.parent.element.closest('.container').classList.remove('noScroll');
                        this.parent.parent.camera.resetView(true);
                    }

                    this.updateButton('cycleContainerLimit');
                }
            },
            {
                id: 'resetCamera',
                section: 'map',
                subgroup: 'controls',
                type: 'reset',
                label: 'Reset Camera',
                action: () => {
                    this.parent.parent.camera.reset();
                }
            },

            // ── MYTE / CONTROLS ─────────────────────────────────────────
            {
                id: 'cycleFollowGoal',
                section: 'myte',
                subgroup: 'controls',
                type: 'cycle',
                label: 'Follow Mode: ',
                target: { path: ['parent', 'activeMyte'], property: 'followGoal' },
                options: MOVE_FOLLOW_TYPES,
                requiresActiveMyte: true,
                getValue: () => {
                    const activeMyte = this.parent.parent.activeMyte;
                    return activeMyte?.isActive ? activeMyte.followGoal : null;
                },
                format: (value) => Utility.getKeyByValue(MOVE_FOLLOW_TYPES, value) || 'None',
                action: (button) => {
                    const activeMyte = this.parent.parent.activeMyte;
                    if (activeMyte?.isActive) {
                        const nextFollowGoal = Utility.getNextKey(activeMyte.followGoal, MOVE_FOLLOW_TYPES);
                        activeMyte.setFollowMode(nextFollowGoal);
                        this.updateButton('cycleFollowGoal');
                    }
                }
            },
            {
                id: 'cycleGoal',
                section: 'myte',
                subgroup: 'controls',
                type: 'cycle',
                label: 'Goal: ',
                target: { path: ['parent', 'activeMyte'], property: 'goal' },
                options: MOVE_TYPES,
                requiresActiveMyte: true,
                getValue: () => {
                    const activeMyte = this.parent.parent.activeMyte;
                    return activeMyte?.isActive ? activeMyte.goal : null;
                },
                format: (value) => Utility.getKeyByValue(MOVE_TYPES, value) || 'None',
                action: (button) => {
                    const activeMyte = this.parent.parent.activeMyte;
                    if (activeMyte?.isActive) {
                        const nextGoal = Utility.getNextKey(activeMyte.goal, MOVE_TYPES);
                        activeMyte.setMode(nextGoal);
                        this.updateButton('cycleGoal');
                    }
                }
            },
            {
                id: 'cycleAutonomyGoal',
                section: 'myte',
                subgroup: 'controls',
                type: 'cycle',
                label: 'AI: ',
                target: { path: ['parent', 'activeMyte'], property: 'autonomyGoal' },
                options: MOVE_AUTONOMY_TYPES,
                requiresActiveMyte: true,
                getValue: () => {
                    const activeMyte = this.parent.parent.activeMyte;
                    return activeMyte?.isActive ? activeMyte.autonomyGoal : null;
                },
                format: (value) => Utility.getKeyByValue(MOVE_AUTONOMY_TYPES, value) || 'None',
                action: () => {
                    const activeMyte = this.parent.parent.activeMyte;
                    if (activeMyte?.isActive) {
                        const nextGoal = Utility.getNextKey(activeMyte.autonomyGoal, MOVE_AUTONOMY_TYPES);
                        activeMyte.setAutonomyMode(nextGoal);
                        this.updateButton('cycleAutonomyGoal');
                    }
                }
            },
            {
                id: 'skipQueue',
                section: 'myte',
                subgroup: 'controls',
                type: 'action',
                label: 'Skip Queue',
                requiresActiveMyte: true,
                action: () => {
                    const activeMyte = this.parent.parent.activeMyte;
                    if (activeMyte?.isActive) {
                        activeMyte.queue.removeCurrentAction();
                        activeMyte.unsetTarget();
                    }
                }
            },

            // ── MYTE / STATS ─────────────────────────────────────────────
            {
                id: 'adjustSpeed',
                section: 'myte',
                subgroup: 'stats',
                type: 'value',
                label: 'Speed: ',
                target: { path: ['parent', 'activeMyte', 'stats'], property: 'speed' },
                min: 0.5,
                max: 5,
                step: 0.5,
                defaultValue: 1,
                format: (value) => value.toFixed(1) + 'x',
                requiresActiveMyte: true,
                getValue: () => {
                    const activeMyte = this.parent.parent.activeMyte;
                    if (activeMyte?.isActive && activeMyte.stats) return activeMyte.stats.speed;
                    return 1;
                },
                action: (button, value) => {
                    const activeMyte = this.parent.parent.activeMyte;
                    if (activeMyte?.isActive && typeof value === 'number') {
                        activeMyte.stats.speed = value;
                        this.updateButton('adjustSpeed');
                    }
                }
            },
            {
                id: 'setMinMood',
                section: 'myte',
                subgroup: 'stats',
                type: 'action',
                label: 'Min Mood',
                requiresActiveMyte: true,
                action: () => {
                    const activeMyte = this.parent.parent.activeMyte;
                    if (activeMyte?.isActive) activeMyte.stats.updateMood(-1000);
                }
            },
            {
                id: 'setMaxMood',
                section: 'myte',
                subgroup: 'stats',
                type: 'action',
                label: 'Max Mood',
                requiresActiveMyte: true,
                action: () => {
                    const activeMyte = this.parent.parent.activeMyte;
                    if (activeMyte?.isActive) activeMyte.stats.updateMood(1000);
                }
            },
            {
                id: 'setMinEnergy',
                section: 'myte',
                subgroup: 'stats',
                type: 'action',
                label: 'Min Energy',
                requiresActiveMyte: true,
                action: () => {
                    const activeMyte = this.parent.parent.activeMyte;
                    if (activeMyte?.isActive) activeMyte.stats.useEnergy(1000);
                }
            },
            {
                id: 'setMaxEnergy',
                section: 'myte',
                subgroup: 'stats',
                type: 'action',
                label: 'Max Energy',
                requiresActiveMyte: true,
                action: () => {
                    const activeMyte = this.parent.parent.activeMyte;
                    if (activeMyte?.isActive) activeMyte.stats.useEnergy(-1000);
                }
            }
        ];

        this.init();
        this.setupDebugControls();
    }

    buttonLeftClick(e) {
        e.preventDefault();
        e.stopPropagation();
        this.toggle();
        return false;
    }

    buttonRightClick(e) {
        this.buttonLeftClick(e);
    }

    handleDragEnd() {
        super.handleDragEnd();
        // Persist position so it survives reload
        this.parent?.debug?._saveMenuPosition(this.position);
    }

    init() {
        super.init();

        if (this.modalElement) {
            const buttonContainer = this.modalElement.querySelector('.window-panel__content');
            this.createButtons(buttonContainer);
        }

        // Restore saved position
        const saved = this.parent?.debug?._loadState();
        if (saved?.menu && this.modalElement) {
            this.modalElement.style.left = `${saved.menu.x}px`;
            this.modalElement.style.top  = `${saved.menu.y}px`;
            this.modalElement.classList.remove(
                'position-center', 'position-top-right', 'position-top-left',
                'position-bottom-right', 'position-bottom-left'
            );
            if (this.modalElement.style.transform) this.modalElement.style.transform = '';
            this.position = { x: saved.menu.x, y: saved.menu.y };
        }
    }

    // ─── value path helpers ──────────────────────────────────────────────────

    getTargetObject(pathConfig) {
        if (!pathConfig?.path) return null;
        let target = this;
        for (const step of pathConfig.path) {
            if (!target[step]) return null;
            target = target[step];
        }
        return target;
    }

    getCurrentValue(config) {
        if (config.getValue) return config.getValue();

        if (config.target && config.requiresActiveMyte) {
            const activeMyte = this.parent.parent.activeMyte;
            if (activeMyte?.isActive) {
                if (config.target.property === 'speed' && activeMyte.stats) return activeMyte.stats.speed;
            }
        }

        if (config.target) {
            const target = this.getTargetObject(config.target);
            if (target && config.target.property in target) return target[config.target.property];
        }

        return config.defaultValue ?? null;
    }

    setValue(config, value) {
        if (config.target) {
            const target = this.getTargetObject(config.target);
            if (target && config.target.property in target) {
                target[config.target.property] = value;
                return true;
            }
        }
        return false;
    }

    // ─── button interaction ──────────────────────────────────────────────────

    handleButtonClick(config, button) {
        if (config.action) {
            if (config.type === 'toggle') {
                const currentValue = this.getCurrentValue(config);
                const newValue = typeof currentValue === 'boolean' ? !currentValue : false;
                config.action(button, newValue);
            } else {
                config.action(button);
            }
        }
    }

    updateButton(buttonId) {
        const button = document.getElementById(buttonId);
        if (!button) return;
        const config = this.buttonConfigs.find(cfg => cfg.id === buttonId);
        if (!config) return;
        this.updateButtonText(config, button);
    }

    updateButtonText(config, button) {
        if (!button) return;

        let displayText = config.label || '';
        const currentValue = this.getCurrentValue(config);

        switch (config.type) {
            case 'cycle':
                if (currentValue !== null) {
                    displayText += config.format
                        ? config.format(currentValue)
                        : (Utility.getKeyByValue(config.options, currentValue) || 'None');
                } else {
                    displayText += 'None';
                }
                break;

            case 'toggle':
                if (config.states && typeof currentValue === 'boolean') {
                    displayText += config.states[currentValue];
                } else {
                    displayText += currentValue ? 'ON' : 'OFF';
                }
                button.classList.toggle('active', !!currentValue);
                break;

            case 'value':
                const val = currentValue ?? config.defaultValue;
                displayText += val != null
                    ? (config.format ? config.format(val) : val)
                    : '';
                break;

            case 'action':
            case 'reset':
                break;

            default:
                displayText += 'Unknown';
        }

        button.innerText = displayText;
    }

    updateButtons() {
        this.buttonConfigs?.forEach(config => this.updateButton(config.id));
        this.updateButtonsEnabledState();
    }

    updateButtonsEnabledState() {
        const hasMyte = this.parent.parent.activeMyte?.isActive === true;
        if (hasMyte) {
            this.enableButtons();
        } else {
            this.disableButtons();
        }
    }

    // ─── DOM construction ────────────────────────────────────────────────────

    createButtons(container) {
        if (!container || !this.buttonConfigs) return;
        container.innerHTML = '';

        // Build nested section → subgroup → buttons
        const layout = {
            map:  { label: 'Map',  subgroups: { overlays: 'Overlays', controls: 'Controls' } },
            myte: { label: 'Myte', subgroups: { controls: 'Controls', stats: 'Stats' } }
        };

        for (const [sectionKey, sectionDef] of Object.entries(layout)) {
            // Top-level section wrapper
            const sectionEl = document.createElement('div');
            sectionEl.className = `settings-group section-${sectionKey}`;

            const sectionTitle = document.createElement('h3');
            sectionTitle.className = 'settings-group-title';
            sectionTitle.innerText = sectionDef.label;
            sectionEl.appendChild(sectionTitle);

            let sectionHasContent = false;

            for (const [subgroupKey, subgroupLabel] of Object.entries(sectionDef.subgroups)) {
                const configs = this.buttonConfigs.filter(
                    c => c.section === sectionKey && c.subgroup === subgroupKey
                );
                if (!configs.length) continue;

                const subgroupEl = document.createElement('div');
                subgroupEl.className = `settings-subgroup subgroup-${subgroupKey}`;

                const subgroupTitle = document.createElement('h4');
                subgroupTitle.className = 'settings-subgroup-title';
                subgroupTitle.innerText = subgroupLabel;
                subgroupEl.appendChild(subgroupTitle);

                for (const config of configs) {
                    const el = this._buildButtonElement(config);
                    subgroupEl.appendChild(el);
                }

                sectionEl.appendChild(subgroupEl);
                sectionHasContent = true;
            }

            if (sectionHasContent) container.appendChild(sectionEl);
        }

        // Apply overlay subgroup visibility based on current debug state
        this._updateOverlaySubgroupVisibility();
    }

    _buildButtonElement(config) {
        const button = document.createElement('button');
        button.id = config.id;
        button.className = 'debug-button';
        if (config.type) button.dataset.type = config.type;

        if (config.requiresActiveMyte) {
            button.classList.add('requires-myte');
            button.disabled = !this.parent.parent.activeMyte?.isActive;
        }

        if (config.type === 'toggle') {
            button.classList.toggle('active', !!this.getCurrentValue(config));
        }

        if (config.type === 'value') {
            const group = document.createElement('div');
            group.className = 'button-group';

            const minusBtn = document.createElement('button');
            minusBtn.id = `${config.id}-down`;
            minusBtn.className = 'value-button minus';
            minusBtn.innerHTML = '-';
            if (config.requiresActiveMyte) {
                minusBtn.classList.add('requires-myte');
                minusBtn.disabled = !this.parent.parent.activeMyte?.isActive;
            }

            const plusBtn = document.createElement('button');
            plusBtn.id = `${config.id}-up`;
            plusBtn.className = 'value-button plus';
            plusBtn.innerHTML = '+';
            if (config.requiresActiveMyte) {
                plusBtn.classList.add('requires-myte');
                plusBtn.disabled = !this.parent.parent.activeMyte?.isActive;
            }

            group.appendChild(minusBtn);
            group.appendChild(button);
            group.appendChild(plusBtn);

            this.updateButton(config.id);
            return group;
        }

        this.updateButton(config.id);
        return button;
    }

    // Show/hide per-overlay buttons when master debug toggle is off
    _updateOverlaySubgroupVisibility() {
        const debugOn = document.body.classList.contains('debug');
        const overlaySubIds = ['overlayGrid', 'overlayCursorTile', 'overlayMyteFrontTile', 'overlayColliders'];
        overlaySubIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = debugOn ? '' : 'none';
        });
    }

    // ─── event wiring ────────────────────────────────────────────────────────

    setupDebugControls() {
        if (!this.modalElement) return;

        this.buttonConfigs.forEach(config => {
            const button = document.getElementById(config.id);
            if (button) {
                button.addEventListener('click', () => this.handleButtonClick(config, button));
                if (config.type === 'value') this.setupValueControls(config, button);
            }
        });
    }

    setupValueControls(config, button) {
        const incrementBtn = document.getElementById(`${config.id}-up`);
        const decrementBtn = document.getElementById(`${config.id}-down`);

        const getVal = () => {
            if (config.requiresActiveMyte && this.parent.parent.activeMyte?.isActive) {
                const am = this.parent.parent.activeMyte;
                if (config.target.property === 'speed' && am.stats) return am.stats.speed;
            }
            return this.getCurrentValue(config) ?? config.defaultValue ?? 0;
        };

        if (incrementBtn) {
            incrementBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                const newVal = Math.min(getVal() + (config.step || 1), config.max ?? Infinity);
                config.action ? config.action(button, newVal) : (this.setValue(config, newVal), this.updateButton(config.id));
            });
        }

        if (decrementBtn) {
            decrementBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                const newVal = Math.max(getVal() - (config.step || 1), config.min ?? -Infinity);
                config.action ? config.action(button, newVal) : (this.setValue(config, newVal), this.updateButton(config.id));
            });
        }

        if (button && config.defaultValue !== undefined) {
            button.addEventListener('click', (e) => {
                e.stopPropagation();
                config.action ? config.action(button, config.defaultValue) : (this.setValue(config, config.defaultValue), this.updateButton(config.id));
            });
        }
    }

    enableButtons() {
        this.isActive = true;
        document.querySelectorAll('.debug-button.requires-myte, .value-button.requires-myte').forEach(b => b.disabled = false);
    }

    disableButtons() {
        this.isActive = false;
        document.querySelectorAll('.debug-button.requires-myte, .value-button.requires-myte').forEach(b => b.disabled = true);
    }

    open() {
        this.updateButtons();
        this._updateOverlaySubgroupVisibility();
        super.open();
    }
}
