class UserInterface {
    constructor(parent) {
        this.parent = parent;
        this.containerWrapper = parent.containerWrapper;
        this.debug = new DebugUI(parent);
        this.isActive = false;

        // Initialize all UI components
        this.toolManager = new ToolManager(this);
        this.selectionManager = new SelectionManager(this);
        this.queueTargetManager = new QueueTargetManager(this);
        this.actionSidebarManager = new ActionSidebarManager(this);
        this.myteListManager = new MyteListManager(this);
        this.hudManager = new HUDManager(this);
        this.offscreenMyteIndicatorManager = new OffscreenMyteIndicatorManager(this);
        this.screenManager = new ScreenManager(this);
        this.cursorManager = new CursorManager(this);
        this.compactQueueUI = new QueueUI(parent, {
            element: document.getElementById('myte_queue_overlay'),
            mode: 'compact',
            allowControls: false,
            maxItems: 5
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
        this.soundMenu = new SoundMenu(this);
        this.settingsMenu = new SettingsMenu(this);
        this.viewMenu = new ViewMenu(this);
        this.debugMenu = new DebugMenu(this);
    }

    // Methods for component communication
    onToolModeChanged(mode) {
        // Clear selection when tool mode changes
        this.selectionManager.setSelected(null);

        // Notify action manager to update UI
        this.actionSidebarManager.updateActions(null);
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
        this.viewMenu?.updateButtonStates();
    }

    playSound(sound) {
        this.parent.core.soundManager.playUISound(sound);
    }

    // Public methods
    setSelected(obj) {
        this.selectionManager.setSelected(obj);
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

    // Update method called every frame
    update() {
        this.debug.update();
        this.cursorManager.update();
        this.queueTargetManager.update();
        this.actionSidebarManager.update();
        this.hudManager.update();
        this.offscreenMyteIndicatorManager.update();
        this.compactQueueUI?.update?.();
    }

    dispose() {
        this.debug?.dispose?.();
        this.debug = null;
        this.debugMenu?.dispose?.();
        this.debugMenu = null;
        this.settingsMenu?.dispose?.();
        this.settingsMenu = null;
        this.soundMenu?.dispose?.();
        this.soundMenu = null;
        this.viewMenu?.dispose?.();
        this.viewMenu = null;

        this.screenManager?.dispose?.();
        this.toolManager?.dispose?.();
        this.cursorManager?.dispose?.();
        this.queueTargetManager?.dispose?.();
        this.offscreenMyteIndicatorManager?.dispose?.();
        this.selectionManager?.dispose?.();
        this.hudManager?.dispose?.();
        this.actionSidebarManager?.dispose?.();
        this.myteListManager?.dispose?.();

        this.screenManager = null;
        this.toolManager = null;
        this.cursorManager = null;
        this.queueTargetManager = null;
        this.offscreenMyteIndicatorManager = null;
        this.selectionManager = null;
        this.hudManager = null;
        this.actionSidebarManager = null;
        this.myteListManager = null;
        this.compactQueueUI?.dispose?.();
        this.compactQueueUI = null;
    }
}
