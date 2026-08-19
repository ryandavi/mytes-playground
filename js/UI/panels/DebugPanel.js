class DebugPanel extends PanelSection {
    constructor(parent) {
        super(parent, { tab: 'debug' });

        const buildObjectOverlayToggle = ({ id, label, key, swatchClass, colorLabel, shapeLabel }) => ({
            id,
            section: 'map',
            subgroup: 'overlays',
            type: 'toggle',
            label,
            states: { true: 'ON', false: 'OFF' },
            presentation: 'overlay-detail',
            swatchClass,
            colorLabel,
            shapeLabel,
            getValue: () => this.parent?.debugOverlay?.overlayState?.[key] ?? false,
            action: () => {
                const debugOverlay = this.parent?.debugOverlay;
                if (debugOverlay) {
                    debugOverlay.overlayState[key] = !debugOverlay.overlayState[key];
                    debugOverlay._saveOverlayState();
                }
                this.updateButton(id);
            }
        });

        const buildDirectInteractToggle = () => ({
            id: 'directWorldInteraction',
            section: 'user',
            subgroup: 'modes',
            type: 'toggle',
            label: 'Direct Interact',
            states: { true: 'ON', false: 'OFF' },
            presentation: 'mode-detail',
            detailLabel: 'Immediate object action',
            helperLabel: 'Skips myte walk-up',
            getValue: () => this.parent?.debugOverlay?.isDirectWorldInteractionEnabled?.() ?? false,
            action: () => {
                const debugOverlay = this.parent?.debugOverlay;
                if (!debugOverlay) return;
                debugOverlay.setDirectWorldInteractionEnabled(!debugOverlay.isDirectWorldInteractionEnabled());
                this.updateButton('directWorldInteraction');
            }
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
                    this.parent?.debugOverlay?._saveDebugEnabledState(document.body.classList.contains('debug'));
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
                    this.parent?.debugOverlay?._saveGridOverlays();
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
                    this.parent?.debugOverlay?._saveGridOverlays();
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
                    this.parent?.debugOverlay?._saveGridOverlays();
                    this.updateButton('overlayMyteFrontTile');
                }
            },
            {
                id: 'overlayColliders',
                section: 'map',
                subgroup: 'overlays',
                type: 'toggle',
                label: 'Colliders',
                states: { true: 'ON', false: 'OFF' },
                presentation: 'overlay-detail',
                swatchClass: 'myte-collider',
                colorLabel: 'Green',
                shapeLabel: 'Box',
                getValue: () => this.parent?.debugOverlay?.overlayState?.colliders ?? true,
                action: (button, value) => {
                    const debugOverlay = this.parent?.debugOverlay;
                    if (debugOverlay) {
                        debugOverlay.overlayState.colliders = value;
                        debugOverlay._saveOverlayState();
                    }
                    this.updateButton('overlayColliders');
                }
            },

            // ── MAP / CONTROLS ──────────────────────────────────────────
            buildObjectOverlayToggle({
                id: 'overlayInteractionRegions',
                label: 'Interaction',
                key: 'interaction',
                swatchClass: 'debug-region-interaction',
                colorLabel: 'Blue',
                shapeLabel: 'Box'
            }),
            buildObjectOverlayToggle({
                id: 'overlayHitRegions',
                label: 'Hit',
                key: 'hit',
                swatchClass: 'debug-region-hit',
                colorLabel: 'Orange',
                shapeLabel: 'Box'
            }),
            buildObjectOverlayToggle({
                id: 'overlaySelectRegions',
                label: 'Select',
                key: 'select',
                swatchClass: 'debug-region-select',
                colorLabel: 'Yellow',
                shapeLabel: 'Box'
            }),
            buildObjectOverlayToggle({
                id: 'overlayPickupRegions',
                label: 'Pickup',
                key: 'pickup',
                swatchClass: 'debug-region-pickup',
                colorLabel: 'Violet',
                shapeLabel: 'Box'
            }),
            buildObjectOverlayToggle({
                id: 'overlayAnchors',
                label: 'Anchors',
                key: 'anchors',
                swatchClass: 'debug-anchor',
                colorLabel: 'Cyan',
                shapeLabel: 'Dot'
            }),
            buildDirectInteractToggle(),
            {
                id: 'openShop',
                section: 'user',
                subgroup: 'tools',
                type: 'action',
                label: 'Open Shop',
                action: () => {
                    this.close();
                    this.parent?.shopPanel?.openFor?.(null, 'goblin_goods');
                }
            },
            ...SiteConfig.debug.currencyPresets.map(value => ({
                id: `giveCoins${value}`,
                section: 'user',
                subgroup: 'resources',
                type: 'action',
                label: `+${value} Coins`,
                action: () => this.changeCoins(value)
            })),
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
            {
                id: 'testPathfinding',
                section: 'map',
                subgroup: 'controls',
                type: 'action',
                label: 'Test Path',
                action: () => this.runPathfindingDebug()
            },
            {
                // The stage chip is the player's way in, and it is absent on a
                // map that refuses building — which is exactly the map you want
                // to open the build tools on while testing. This switch reaches
                // the mode without going hunting for the chip.
                id: 'toggleBuildMode',
                section: 'map',
                subgroup: 'controls',
                type: 'toggle',
                label: 'Mode: ',
                states: { true: 'Build', false: 'Play' },
                getValue: () => this.getGameMode()?.isBuild() === true,
                action: () => {
                    const gameMode = this.getGameMode();
                    if (!gameMode) return;
                    // setMode refuses (and says so) on a map whose policy is
                    // 'none'; point at the switch that lifts that rather than
                    // lifting it silently, since its edits save like any other.
                    if (!gameMode.isBuild() && !gameMode.canBuildHere()) {
                        this.parent?.showMessage?.(
                            "This map's build policy is 'none' — turn Anywhere on first.",
                            'warning',
                            'Build Mode'
                        );
                        return;
                    }
                    gameMode.toggle();
                    this.updateButton('toggleBuildMode');
                }
            },
            {
                // Every map, not just the ones that opted in. Deliberately a
                // switch rather than something the debug overlay implies, so
                // the 'limited' and 'none' policies stay testable with the rest
                // of the debug tools on.
                id: 'buildAnywhere',
                section: 'map',
                subgroup: 'controls',
                type: 'toggle',
                label: 'Anywhere: ',
                states: { true: 'ON', false: 'OFF' },
                getValue: () => this.getGameMode()?.buildAnywhere === true,
                action: () => {
                    const gameMode = this.getGameMode();
                    gameMode?.setBuildAnywhere(!gameMode.buildAnywhere);
                    this.updateButton('buildAnywhere');
                }
            },
            {
                // Writes a source .tmx, so it lives here rather than on the
                // build toolbar: it is an authoring action, not something a
                // player does to their house.
                id: 'exportWallsTiled',
                section: 'map',
                subgroup: 'controls',
                type: 'action',
                label: 'Map → Tiled',
                action: (button) => this.parent.exportMapToTiled(button)
            },
            {
                id: 'toggleTimePause',
                section: 'time',
                subgroup: 'controls',
                type: 'toggle',
                label: 'Clock: ',
                states: { true: 'Paused', false: 'Running' },
                getValue: () => this.getTimeManager()?.isPaused ?? false,
                action: () => {
                    const gameTime = this.getTimeManager();
                    if (!gameTime) return;
                    if (gameTime.isPaused) gameTime.resume();
                    else gameTime.pause();
                    this.updateButton('toggleTimePause');
                }
            },
            {
                id: 'timeScale',
                section: 'time',
                subgroup: 'controls',
                type: 'value',
                label: 'Time Speed: ',
                min: 0,
                max: 16,
                step: 0.25,
                defaultValue: 1,
                format: (value) => `${value.toFixed(value < 1 || value % 1 ? 2 : 0)}x`,
                getValue: () => this.getTimeManager()?.timeScale ?? 1,
                action: (_button, value) => {
                    this.getTimeManager()?.setTimeScale?.(value);
                    this.updateButton('timeScale');
                }
            },
            {
                id: 'setDawn',
                section: 'time',
                subgroup: 'presets',
                type: 'action',
                label: 'Set Dawn',
                action: () => this.applyTimePreset(6, 0)
            },
            {
                id: 'setNoon',
                section: 'time',
                subgroup: 'presets',
                type: 'action',
                label: 'Set Noon',
                action: () => this.applyTimePreset(12, 0)
            },
            {
                id: 'setDusk',
                section: 'time',
                subgroup: 'presets',
                type: 'action',
                label: 'Set Dusk',
                action: () => this.applyTimePreset(19, 30)
            },
            {
                id: 'setMidnight',
                section: 'time',
                subgroup: 'presets',
                type: 'action',
                label: 'Set Midnight',
                action: () => this.applyTimePreset(0, 0)
            },
            {
                id: 'skipHour',
                section: 'time',
                subgroup: 'presets',
                type: 'action',
                label: '+1 Hour',
                action: () => this.getTimeManager()?.skipTime?.(1, 0)
            },
            {
                id: 'subtractHour',
                section: 'time',
                subgroup: 'presets',
                type: 'action',
                label: '-1 Hour',
                action: () => {
                    this.getTimeManager()?.skipTime?.(-1, 0);
                    this.updateButton('toggleTimePause');
                }
            },
            {
                id: 'skipDay',
                section: 'time',
                subgroup: 'presets',
                type: 'action',
                label: '+1 Day',
                action: () => this.getTimeManager()?.skipDays?.(1)
            },
            {
                id: 'subtractDay',
                section: 'time',
                subgroup: 'presets',
                type: 'action',
                label: '-1 Day',
                action: () => this.subtractDay()
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
                id: 'openMyteInfo',
                section: 'myte',
                subgroup: 'controls',
                type: 'action',
                label: 'Open Pet Info',
                requiresActiveMyte: true,
                action: () => {
                    const activeMyte = this.parent.parent.activeMyte;
                    if (activeMyte?.isActive) this.parent.myteInfoPanel?.openFor?.(activeMyte);
                }
            },
            {
                id: 'editMyteInfo',
                section: 'myte',
                subgroup: 'controls',
                type: 'toggle',
                label: 'Edit Pet Data: ',
                states: { true: 'ON', false: 'OFF' },
                requiresActiveMyte: true,
                getValue: () => this.parent.myteInfoPanel?.isDebugEditing?.() ?? false,
                action: (button, value) => {
                    this.parent.myteInfoPanel?.setDebugEditing?.(value);
                    this.updateButton('editMyteInfo');
                }
            },
            {
                id: 'queueLog',
                section: 'myte',
                subgroup: 'queue',
                type: 'toggle',
                fullWidth: true,
                label: 'Queue Log: ',
                states: { true: 'ON', false: 'OFF' },
                getValue: () => localStorage.getItem('myteQueueLog') === 'true',
                action: () => {
                    const next = !(localStorage.getItem('myteQueueLog') === 'true');
                    localStorage.setItem('myteQueueLog', String(next));
                    const activeMyte = this.parent.parent.activeMyte;
                    if (activeMyte?.queue) activeMyte.queue.logEnabled = next;
                    this.updateButton('queueLog');
                }
            },
            {
                id: 'queueConsoleClear',
                section: 'myte',
                subgroup: 'queue',
                type: 'toggle',
                fullWidth: true,
                label: 'Queue Clear Console: ',
                states: { true: 'ON', false: 'OFF' },
                getValue: () => localStorage.getItem('myteQueueConsoleClear') === 'true',
                action: () => {
                    const next = !(localStorage.getItem('myteQueueConsoleClear') === 'true');
                    localStorage.setItem('myteQueueConsoleClear', String(next));
                    const activeMyte = this.parent.parent.activeMyte;
                    if (activeMyte?.queue) activeMyte.queue.consoleClearEnabled = next;
                    this.updateButton('queueConsoleClear');
                }
            },
            {
                id: 'queueStrictInterrupt',
                section: 'myte',
                subgroup: 'queue',
                type: 'toggle',
                fullWidth: true,
                label: 'Queue Strict Interrupt: ',
                states: { true: 'ON', false: 'OFF' },
                getValue: () => localStorage.getItem('myteQueueStrictInterrupt') === 'true',
                action: () => {
                    const next = !(localStorage.getItem('myteQueueStrictInterrupt') === 'true');
                    localStorage.setItem('myteQueueStrictInterrupt', String(next));
                    const activeMyte = this.parent.parent.activeMyte;
                    if (activeMyte?.queue) activeMyte.queue.strictInterrupt = next;
                    this.updateButton('queueStrictInterrupt');
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
                id: 'setMinFun',
                section: 'myte',
                subgroup: 'stats',
                type: 'action',
                label: 'Min Fun',
                requiresActiveMyte: true,
                action: () => {
                    const activeMyte = this.parent.parent.activeMyte;
                    if (activeMyte?.isActive) activeMyte.stats.updateFun(-1000);
                }
            },
            {
                id: 'setMaxFun',
                section: 'myte',
                subgroup: 'stats',
                type: 'action',
                label: 'Max Fun',
                requiresActiveMyte: true,
                action: () => {
                    const activeMyte = this.parent.parent.activeMyte;
                    if (activeMyte?.isActive) activeMyte.stats.updateFun(1000);
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
    }

    getTimeManager() {
        return this.parent?.parent?.timeManager || this.parent?.parent?.core?.gameTime || null;
    }

    init() {
        super.init();

        if (this.sectionElement) {
            const buttonContainer = this.sectionElement;
            this.createButtons(buttonContainer);
            this.setupDebugControls();
            this.updateButtonsEnabledState();
        }

        // The mode also changes from the stage chip and the B key, and the
        // panel only refreshes its buttons when its tab is opened.
        const events = this.parent?.parent?.eventManager;
        this._unsubscribeGameMode = events?.on?.(EVENTS.GAME_MODE_CHANGED, () => {
            this.updateButton('toggleBuildMode');
            this.updateButton('buildAnywhere');
        }) ?? null;
    }

    dispose() {
        this._unsubscribeGameMode?.();
        this._unsubscribeGameMode = null;
        super.dispose?.();
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

    applyTimePreset(hour, minute = 0) {
        this.getTimeManager()?.setTime?.(hour, minute);
        this.updateButton('toggleTimePause');
        this.updateButton('timeScale');
    }

    runPathfindingDebug() {
        const container = this.parent?.parent;
        const gameMap = container?.gameMap;
        const pathfinder = gameMap?.gridSystem?.pathfinder;
        if (!gameMap?.initialized || !pathfinder) {
            return null;
        }

        if (!container?.inputHandler?.isMouseInContainer?.()) {
            return null;
        }

        const myte = container.activeMyte || gameMap.mytes?.[0];
        if (!myte?.isActive) {
            return null;
        }

        const { posX: startX, posY: startY } = myte;
        const { x: endX, y: endY } = container.inputHandler.getMouseWorldPosition();
        const { height: entityHeight, width: entityWidth } = myte.size;
        const { collider } = myte;

        pathfinder.setDebugMode(true);
        pathfinder.options.visualizeSearch = false;

        const path = pathfinder.findPath(
            myte,
            startX,
            startY,
            endX,
            endY
        );

        pathfinder.visualizePath(gameMap.layers.debug, path || [], entityWidth, entityHeight, collider);
        return path;
    }

    subtractDay() {
        const tm = this.getTimeManager();
        if (!tm) return;

        const seasons = tm.config.seasons;
        let year = tm.getCurrentYear();
        let season = tm.getCurrentSeason();
        let day = tm.getCurrentDay() + 1; // getCurrentDay is 0-indexed; setDateTime expects 1-indexed
        const hour = tm.getCurrentHour();
        const minute = tm.getCurrentMinute();

        day -= 1;
        if (day < 1) {
            const seasonIdx = seasons.indexOf(season);
            if (seasonIdx > 0) {
                season = seasons[seasonIdx - 1];
            } else {
                year -= 1;
                if (year < 1) return;
                season = seasons[seasons.length - 1];
            }
            day = tm.config.daysPerSeason;
        }

        tm.setDateTime(year, season, day, hour, minute);
        this.updateButton('toggleTimePause');
    }

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

    getToggleStateLabel(config, currentValue) {
        if (config.states && typeof currentValue === 'boolean') {
            return config.states[currentValue];
        }

        return currentValue ? 'ON' : 'OFF';
    }

    setDetailedButtonContent(button, config, currentValue) {
        const title = button.querySelector('.debug-button__title');
        const helper = button.querySelector('.debug-button__helper');
        const state = button.querySelector('.debug-button__state');

        if (title) title.textContent = config.label || '';
        if (helper) {
            helper.textContent = config.helperLabel || config.detailLabel || '';
        }
        if (state) state.textContent = this.getToggleStateLabel(config, !!currentValue);
    }

    updateButtonText(config, button) {
        if (!button) return;

        let displayText = config.label || '';
        const currentValue = this.getCurrentValue(config);

        if (config.presentation === 'overlay-detail' || config.presentation === 'mode-detail') {
            button.classList.toggle('active', !!currentValue);
            this.setDetailedButtonContent(button, config, currentValue);
            return;
        }

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

    getGameMode() {
        return this.parent?.parent?.gameMode || null;
    }

    // ─── DOM construction ────────────────────────────────────────────────────

    createButtons(container) {
        if (!container || !this.buttonConfigs) return;
        container.innerHTML = '';

        // Build nested section → subgroup → buttons
        const layout = {
            map:  { label: 'Map',  subgroups: { overlays: 'Overlays', controls: 'Controls' } },
            time: { label: 'Time', subgroups: { controls: 'Controls', presets: 'Presets' } },
            user: { label: 'User', subgroups: { modes: 'Modes', resources: 'Resources', tools: 'Tools' } },
            myte: { label: 'Myte', subgroups: { controls: 'Controls', stats: 'Stats', queue: 'Queue' } }
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
                const hasInventoryEditor = sectionKey === 'user' && subgroupKey === 'resources';
                if (!configs.length && !hasInventoryEditor) continue;

                const subgroupEl = document.createElement('div');
                subgroupEl.className = `settings-subgroup subgroup-${subgroupKey}`;

                const subgroupTitle = document.createElement('h4');
                subgroupTitle.className = 'settings-subgroup-title';
                subgroupTitle.innerText = subgroupLabel;
                subgroupEl.appendChild(subgroupTitle);

                // The buttons wrap into a row of their own rather than the
                // subgroup itself becoming the row — a heading sharing a flex
                // line with buttons shrinks to the width of its own text, which
                // is why these titles never took a full line.
                if (configs.length) {
                    const row = document.createElement('div');
                    row.className = 'button-row';
                    for (const config of configs) {
                        row.appendChild(this._buildButtonElement(config));
                    }
                    subgroupEl.appendChild(row);
                }

                if (hasInventoryEditor) {
                    subgroupEl.appendChild(this.createInventoryEditor());
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
        button.type = 'button';
        if (config.type) button.dataset.type = config.type;
        if (config.presentation) button.dataset.presentation = config.presentation;
        if (config.fullWidth) button.classList.add('debug-button--full');

        if (config.requiresActiveMyte) {
            button.classList.add('requires-myte');
            button.disabled = !this.parent.parent.activeMyte?.isActive;
        }

        if (config.type === 'toggle') {
            button.classList.toggle('active', !!this.getCurrentValue(config));
        }

        if (config.type === 'value') {
            const group = document.createElement('div');
            group.className = 'value-stepper';
            group.id = `${config.id}-group`;
            group.dataset.controlId = config.id;
            button.classList.add('value-stepper__value');

            const minusBtn = document.createElement('button');
            minusBtn.id = `${config.id}-down`;
            minusBtn.className = 'value-button value-stepper__step minus';
            minusBtn.innerHTML = '−';
            if (config.requiresActiveMyte) {
                minusBtn.classList.add('requires-myte');
                minusBtn.disabled = !this.parent.parent.activeMyte?.isActive;
            }

            const plusBtn = document.createElement('button');
            plusBtn.id = `${config.id}-up`;
            plusBtn.className = 'value-button value-stepper__step plus';
            plusBtn.innerHTML = '+';
            if (config.requiresActiveMyte) {
                plusBtn.classList.add('requires-myte');
                plusBtn.disabled = !this.parent.parent.activeMyte?.isActive;
            }

            group.appendChild(minusBtn);
            group.appendChild(button);
            group.appendChild(plusBtn);

            this.updateButtonText(config, button);
            return group;
        }

        if (config.presentation === 'overlay-detail' || config.presentation === 'mode-detail') {
            button.classList.add('debug-button--detail');

            const content = document.createElement('span');
            content.className = 'debug-button__content';

            if (config.presentation === 'overlay-detail') {
                const swatch = document.createElement('span');
                swatch.className = `debug-button__swatch debug-overlay-swatch ${config.swatchClass || ''}`.trim();
                swatch.setAttribute('aria-hidden', 'true');
                content.appendChild(swatch);
            } else {
                const modeBadge = document.createElement('span');
                modeBadge.className = 'debug-button__mode-badge';
                modeBadge.textContent = 'Mode';
                content.appendChild(modeBadge);
            }

            const text = document.createElement('span');
            text.className = 'debug-button__text';

            const title = document.createElement('span');
            title.className = 'debug-button__title';
            text.appendChild(title);

            const helper = document.createElement('span');
            helper.className = 'debug-button__helper';
            text.appendChild(helper);

            content.appendChild(text);
            button.appendChild(content);

            const state = document.createElement('span');
            state.className = 'debug-button__state';
            button.appendChild(state);
        }

        this.updateButtonText(config, button);
        return button;
    }

    createInventoryEditor() {
        const editor = document.createElement('div');
        editor.className = 'debug-inventory-editor';

        const label = document.createElement('label');
        label.className = 'debug-editor-label';
        label.textContent = 'Inventory';
        label.htmlFor = 'debug-inventory-item';

        const select = document.createElement('select');
        select.id = 'debug-inventory-item';
        select.className = 'debug-inventory-editor__item';
        Array.from(ItemRegistry.items.values())
            .sort((a, b) => a.label.localeCompare(b.label))
            .forEach((item) => {
                const option = document.createElement('option');
                option.value = item.id;
                option.textContent = item.label;
                select.appendChild(option);
            });

        const quantity = document.createElement('input');
        quantity.className = 'debug-inventory-editor__quantity';
        quantity.id = 'debug-inventory-quantity';
        quantity.type = 'number';
        quantity.min = '1';
        quantity.max = String(SiteConfig.inventory.stackSize);
        quantity.value = String(SiteConfig.debug.itemStep);
        quantity.setAttribute('aria-label', 'Item quantity');

        const remove = document.createElement('button');
        remove.type = 'button';
        remove.textContent = 'Remove';
        remove.addEventListener('click', () => this.changeInventoryItem(select.value, -Number(quantity.value)));

        const add = document.createElement('button');
        add.type = 'button';
        add.textContent = 'Add';
        add.addEventListener('click', () => this.changeInventoryItem(select.value, Number(quantity.value)));

        const actions = document.createElement('div');
        actions.className = 'debug-inventory-editor__actions';
        actions.append(remove, add);
        editor.append(label, select, quantity, actions);
        return editor;
    }

    changeCoins(value) {
        const amount = Math.max(0, Math.round(Number(value) || 0));
        if (amount === 0) return false;
        const user = this.parent?.parent?.core?.user;
        return user?.addCurrency?.('coins', amount) ?? false;
    }

    changeInventoryItem(itemId, delta) {
        const inventory = this.parent?.parent?.inventory;
        const item = ItemRegistry.getItemSync(itemId);
        const quantity = Math.max(1, Math.round(Math.abs(Number(delta) || 1)));
        if (!inventory || !item) return false;

        const changed = delta > 0
            ? inventory.addItem(item.name, quantity, item.type, item.description, item.id)
            : inventory.removeItem(item.id, quantity);
        if (changed) {
            this.parent.parent.core?.user?._scheduleSave?.();
            this.parent.showMessage(
                `${delta > 0 ? 'Added' : 'Removed'} ${quantity} ${item.label}`,
                'success',
                'Debug'
            );
        }
        return changed;
    }

    // Show/hide per-overlay buttons when master debug toggle is off
    _updateOverlaySubgroupVisibility() {
        const debugOn = document.body.classList.contains('debug');
        const overlaySubIds = [
            'overlayGrid',
            'overlayCursorTile',
            'overlayMyteFrontTile',
            'overlayColliders',
            'overlayInteractionRegions',
            'overlayHitRegions',
            'overlaySelectRegions',
            'overlayPickupRegions',
            'overlayAnchors'
        ];
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

    onSectionShown() {
        this.updateButtons();
        this._updateOverlaySubgroupVisibility();
    }
}
