class UserInterface {
    constructor(parent) {
        this.parent = parent;
        this.containerWrapper = parent.containerWrapper;
        this.debugOverlay = new DebugOverlayUI(parent);
        this.debug = this.debugOverlay;
        this.isActive = false;
		this.lastSoundHour = null;
		this.boundControlClickSound = this.handleControlClickSound.bind(this);
		this.boundTimeMilestoneSound = this.handleTimeMilestoneSound.bind(this);

        // Initialize all UI components
        this.toolManager = new ToolManager(this);
        this.selectionManager = new SelectionManager(this);
        this.queueTargetManager = new QueueTargetManager(this);
        this.actionSidebarManager = new ActionSidebarManager(this);
        this.myteListManager = new MyteListManager(this);
        this.hudManager = new HUDManager(this);
        this.buffOverlayUI = new BuffOverlayUI(this, {
            element: document.getElementById('myte_buff_overlay')
        });
        this.offscreenMyteIndicatorManager = new OffscreenMyteIndicatorManager(this);
        this.screenManager = new ScreenManager(this);
        this.cursorManager = new CursorManager(this);
        this.compactQueueUI = new CompactQueueUI(this, {
            element: document.getElementById('myte_queue_overlay')
        });
        this.buildModeUI = new BuildModeUI(this);
        this.stageChips = new StageChips(this);
        this.stageViewBar = new StageViewBar(this);
    }

    init() {
        // Initialize all components
        this.toolManager.init();
        this.selectionManager.init();
        this.actionSidebarManager.init();
        this.myteListManager.init();
        this.hudManager.init();
        this.offscreenMyteIndicatorManager.init();
        this.screenManager.init();

        // The Options window owns the shared modal its four tab controllers
        // bind into, so it has to exist before any of them.
        this.optionsPanel = new OptionsPanel(this);
        this.soundPanel = new SoundPanel(this);
        this.settingsPanel = new SettingsPanel(this);
        this.surfaceCustomizePanel = new SurfaceCustomizePanel(this);
        this.wallBuildPanel = new WallBuildPanel(this);
        this.roomPanel = new RoomPanel(this);
        this.viewPanel = new ViewPanel(this);
        this.worldMapPanel = new WorldMapPanel(this);
        this.debugPanel = new DebugPanel(this);
        this.myteInfoPanel = new MyteInfoPanel(this);
        this.userProfilePanel = new UserProfilePanel(this);
        this.shopPanel = new ShopPanel(this);
        this.gameLogManager = new GameLogManager(this);
        this.buildModeUI.init();
        this.stageChips.init();
        this.stageViewBar.init();

		document.addEventListener('click', this.boundControlClickSound);
		const gameTime = this.parent.core?.gameTime;
		this.lastSoundHour = gameTime?.getCurrentHour?.() ?? null;
		gameTime?.subscribe?.('hour', this.boundTimeMilestoneSound);
        this.soundMenu = this.soundPanel;
        this.settingsMenu = this.settingsPanel;
        this.viewMenu = this.viewPanel;
        this.debugMenu = this.debugPanel;
    }

    // Methods for component communication
    onToolModeChanged(mode) {
        // Clear selection when tool mode changes
        this.selectionManager.setSelected(null);

        // Notify action manager to update UI
        this.actionSidebarManager.updateActions(null);
        this.surfaceCustomizePanel?.handleToolModeChanged(mode);
        this.wallBuildPanel?.handleToolModeChanged(mode);
        this.roomPanel?.handleToolModeChanged(mode);
    }

    onSelectionChanged(selectedObject) {
        // Update action panel based on selection
        this.actionSidebarManager.updateActions(selectedObject);
    }

    // Proxy methods to parent for components to use
    getMytes() {
        return this.parent.mytes;
    }

    getActiveMyte() {
        return this.parent.activeMyte;
    }

    setActiveMyte(myte) {
        this.parent.setActiveMyte(myte);
        this.myteListManager.updateMytesList(myte);
        this.hudManager.update();
        this.viewPanel?.updateButtonStates();
    }

    playSound(sound) {
        this.parent.core.soundManager.playUISound(sound);
    }

	handleControlClickSound(event) {
		const control = event.target.closest?.('button, [role="button"]');
		if (!control || !document.body.contains(control)) return;
		if (control.disabled || event.defaultPrevented) return;
		if (control.dataset.modalTrigger === 'true') return;
		if (control.closest('.window-panel__controls, #sound-settings-panel')) return;

		this.parent.core?.soundManager?.playWhenReady?.(SiteConfig.ui.interactionSounds.click);
	}

	handleTimeMilestoneSound(timeData = {}) {
		const hour = Number(timeData.hour);
		if (!Number.isFinite(hour) || hour === this.lastSoundHour) return;
		this.lastSoundHour = hour;

		const sounds = SiteConfig.ui.interactionSounds;
		const cue = sounds.timeMilestones[hour];
		if (!cue) return;
		this.parent.core?.soundManager?.playWhenReady?.(sounds.timeMilestone, cue);
	}

    // Public methods
    setSelected(obj) {
        this.selectionManager.setSelected(obj);
    }

    getSelected() {
        return this.selectionManager.getSelectedObject();
    }

    setToolMode(mode) {
        this.toolManager.setToolMode(mode);
    }

    isTool(mode) {
        return this.toolManager.isTool(mode);
    }

    changeToolMode(mode) {
        return this.toolManager.changeToolMode(mode);
    }

    /**
     * Writes the walls standing on this map back into its .tmx.
     *
     * Deliberately a manual, explicit action rather than something that rides
     * along with the autosave: it edits a source file that Tiled may also have
     * open, and the conflict check can only protect a write the author asked
     * for at a moment they know about.
     *
     * It lives here because two controls offer it — the Debug panel's button
     * and the build bar's shortcut — and neither of them should be the one that
     * knows how it works.
     */
    async exportWallsToTiled(button = null) {
        const gameMap = this.parent?.gameMap;
        const toasts = this.parent?.core?.toastManager;
        if (typeof WallTiledExporter === 'undefined') return;
        if (!WallTiledExporter.isAvailable(gameMap)) {
            toasts?.show?.({
                type: 'warning',
                title: 'Export unavailable',
                content: 'Needs the local editor API and a map whose tileset authors the wall wang set.'
            });
            return;
        }

        // This overwrites a source .tmx on disk — the one authoring path for
        // the map — so it asks first. Nothing else in the debug panel writes
        // outside the save.
        const path = gameMap?.sourcePath || 'the map source';
        if (!window.confirm(
            `Overwrite ${path} with the walls currently standing?

` +
            'This rewrites the Tiled source file. Close the map in Tiled first, ' +
            'and make sure any edits there are saved.'
        )) return;

        if (button) button.disabled = true;
        try {
            const result = await WallTiledExporter.exportMap(gameMap);
            if (!result.ok) {
                toasts?.show?.({
                    type: result.code === 'conflict' ? 'warning' : 'error',
                    title: 'Export failed',
                    content: result.message
                });
                console.warn('[WallTiledExporter]', result.code, result.message);
                return;
            }
            const { cells, layers, objectsAdded, objectsUpdated, objectsRemoved } = result.stats;
            toasts?.show?.({
                type: 'success',
                title: 'Walls exported to Tiled',
                content: `${cells} cells across ${layers} layer${layers === 1 ? '' : 's'} → ${result.path}. ` +
                    `Objects: ${objectsAdded} added, ${objectsUpdated} updated, ${objectsRemoved} removed.`
            });
            for (const warning of result.warnings) {
                toasts?.show?.({ type: 'warning', title: 'Export warning', content: warning });
                console.warn('[WallTiledExporter]', warning);
            }
        } finally {
            if (button) button.disabled = false;
        }
    }

    showMessage(message, type = 'info', title = '') {
        const toastManager = this.parent?.core?.toastManager;
        if (!toastManager || !message) {
            return;
        }

        const method = typeof toastManager[type] === 'function' ? type : 'info';
        toastManager[method](String(message), title || undefined);
    }

    // Update method called every frame
    update() {
        this.debugOverlay.update();
        this.cursorManager.update();
        this.queueTargetManager.update();
        this.hudManager.update();
        this.buffOverlayUI.update();
        this.offscreenMyteIndicatorManager.update();
        this.compactQueueUI?.update?.();
        this.myteInfoPanel?.update?.();
        this.buildModeUI?.update?.();
    }

    get gameMode() {
        return this.parent?.gameMode || null;
    }

    dispose() {
		document.removeEventListener('click', this.boundControlClickSound);
		this.parent.core?.gameTime?.unsubscribe?.('hour', this.boundTimeMilestoneSound);
        this.debugOverlay?.dispose?.();
        this.debugOverlay = null;
        this.debug = null;
        this.debugPanel?.dispose?.();
        this.debugPanel = null;
        this.debugMenu = null;
        this.myteInfoPanel?.dispose?.();
        this.myteInfoPanel = null;
        this.userProfilePanel?.dispose?.();
        this.userProfilePanel = null;
        this.shopPanel?.dispose?.();
        this.shopPanel = null;
        this.settingsPanel?.dispose?.();
        this.settingsPanel = null;
        this.settingsMenu = null;
        this.surfaceCustomizePanel?.dispose?.();
        this.surfaceCustomizePanel = null;
        this.wallBuildPanel?.dispose?.();
        this.wallBuildPanel = null;
        this.roomPanel?.dispose?.();
        this.roomPanel = null;
        this.soundPanel?.dispose?.();
        this.soundPanel = null;
        this.soundMenu = null;
        this.viewPanel?.dispose?.();
        this.viewPanel = null;
        this.viewMenu = null;
        this.worldMapPanel?.dispose?.();
        this.worldMapPanel = null;
        this.optionsPanel?.dispose?.();
        this.optionsPanel = null;
        this.buildModeUI?.dispose?.();
        this.buildModeUI = null;
        this.stageViewBar?.dispose?.();
        this.stageViewBar = null;
        this.stageChips?.dispose?.();
        this.stageChips = null;

        this.screenManager?.dispose?.();
        this.toolManager?.dispose?.();
        this.cursorManager?.dispose?.();
        this.queueTargetManager?.dispose?.();
        this.offscreenMyteIndicatorManager?.dispose?.();
        this.selectionManager?.dispose?.();
        this.hudManager?.dispose?.();
        this.buffOverlayUI?.dispose?.();
        this.actionSidebarManager?.dispose?.();
        this.myteListManager?.dispose?.();

        this.screenManager = null;
        this.toolManager = null;
        this.cursorManager = null;
        this.queueTargetManager = null;
        this.offscreenMyteIndicatorManager = null;
        this.selectionManager = null;
        this.hudManager = null;
        this.buffOverlayUI = null;
        this.actionSidebarManager = null;
        this.myteListManager = null;
        this.compactQueueUI?.dispose?.();
        this.compactQueueUI = null;
		this.boundControlClickSound = null;
		this.boundTimeMilestoneSound = null;
    }
}
