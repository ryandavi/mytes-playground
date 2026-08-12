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

        // Initialize additional menus
        this.soundPanel = new SoundPanel(this);
        this.settingsPanel = new SettingsPanel(this);
        this.surfaceCustomizePanel = new SurfaceCustomizePanel(this);
        this.wallBuildPanel = new WallBuildPanel(this);
        this.viewPanel = new ViewPanel(this);
        this.worldMapPanel = new WorldMapPanel(this);
        this.debugPanel = new DebugPanel(this);
        this.myteInfoPanel = new MyteInfoPanel(this);
        this.userProfilePanel = new UserProfilePanel(this);
        this.shopPanel = new ShopPanel(this);
        this.gameLogManager = new GameLogManager(this);

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
        this.soundPanel?.dispose?.();
        this.soundPanel = null;
        this.soundMenu = null;
        this.viewPanel?.dispose?.();
        this.viewPanel = null;
        this.viewMenu = null;
        this.worldMapPanel?.dispose?.();
        this.worldMapPanel = null;

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
