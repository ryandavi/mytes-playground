/**
 * BuildModeUI — the controls that belong to the mode switch itself: the Build
 * chip on the stage, Undo/Redo, and the grid overlay that appears while the
 * Walls tool is active.
 *
 * Everything that is merely shown or hidden by mode is CSS, driven from
 * `data-game-mode`. This owns only the state CSS cannot know: whether building
 * is allowed on this map, and whether there is anything left to undo.
 *
 * The view controls the build panels used to carry — presentation, grid, snap —
 * are not here either: they live on the stage bar, on screen in both modes.
 * See StageViewBar.
 */
class BuildModeUI extends UIComponent {
    constructor(parent) {
        super(parent);
        this.modeButton = null;
        this.undoButton = null;
        this.redoButton = null;
        this.pausedChip = null;
    }

    get gameMode() {
        return this.container?.gameMode || null;
    }

    init() {
        const wrapper = this.parent.containerWrapper;
        this.modeButton = wrapper?.querySelector('#build-mode-chip') || null;
        this.undoButton = wrapper?.querySelector('#build-undo') || null;
        this.redoButton = wrapper?.querySelector('#build-redo') || null;
        this.pausedChip = wrapper?.querySelector('#build-paused-chip') || null;

        this.bindClick(this.modeButton, () => this.gameMode?.toggle());
        // The chip explains the frozen world, so it is also the way out of it —
        // the nearest control to where the player is already looking.
        this.bindClick(this.pausedChip, () => this.gameMode?.setMode(GAME_MODES.PLAY));
        this.bindClick(this.undoButton, () => this.container?.buildHistory?.undo());
        this.bindClick(this.redoButton, () => this.container?.buildHistory?.redo());

        const events = this.container?.eventManager;
        this.track(
            events?.on?.(EVENTS.GAME_MODE_CHANGED, () => this.syncModeState()),
            events?.on?.(EVENTS.MAP_CHANGED, () => this.syncModeState()),
            // Debug's "Build Anywhere" changes what this map allows without
            // changing the mode, and the chip is the thing that has to notice.
            events?.on?.(EVENTS.BUILD_POLICY_CHANGED, () => this.syncModeState()),
            events?.on?.(EVENTS.BUILD_HISTORY_CHANGED, payload => this.syncHistoryState(payload))
        );

        this.gameMode?.applyModeState();
        this.syncModeState();
        this.syncHistoryState();
    }

    syncModeState() {
        const isBuild = this.gameMode?.isBuild() === true;
        const allowed = this.gameMode?.canBuildHere() !== false;

        if (this.modeButton) {
            this.modeButton.setAttribute('aria-pressed', String(isBuild));
            // A map you cannot build on has no way in, so the chip is simply not
            // there — a permanently dead control over the map is worse than an
            // absent one, and the mode's own guard still refuses the B key.
            this.modeButton.hidden = !allowed;
            this.modeButton.title = 'Build Mode (B)';
        }

        this.parent.toolManager?.handleGameModeChanged?.(this.gameMode?.mode);
        this.syncHistoryState();
    }

    syncHistoryState(payload = null) {
        const history = this.container?.buildHistory;
        const canUndo = payload?.canUndo ?? history?.canUndo ?? false;
        const canRedo = payload?.canRedo ?? history?.canRedo ?? false;
        const undoLabel = payload?.undoLabel ?? history?.peekUndoLabel?.() ?? null;
        const redoLabel = payload?.redoLabel ?? history?.peekRedoLabel?.() ?? null;

        if (this.undoButton) {
            this.undoButton.disabled = !canUndo;
            this.undoButton.title = canUndo ? `Undo: ${undoLabel} (Ctrl+Z)` : 'Undo (Ctrl+Z)';
        }
        if (this.redoButton) {
            this.redoButton.disabled = !canRedo;
            this.redoButton.title = canRedo ? `Redo: ${redoLabel} (Ctrl+Y)` : 'Redo (Ctrl+Y)';
        }
    }

    /**
     * A faint tile grid over the map while building. One repeating-gradient
     * layer sized from the grid, never per-cell DOM.
     *
     * The grid used to be tied to the Walls tool, which was a fine default
     * before there was a setting for it — but once there is a "Show grid"
     * switch, tying it to the tool means the switch does nothing at all under
     * the Surface tool. The setting is the answer; Ctrl-snapping still summons
     * the grid regardless, since that is what it is snapping to.
     */
    setGridOverlay(visible) {
        const canvas = this.container?.canvas;
        if (!canvas) return;
        const cellSize = this.container?.gameMap?.gridSystem?.config?.cellSize;
        if (cellSize) canvas.style.setProperty('--build-grid-size', `${cellSize}px`);
        canvas.classList.toggle('show-build-grid', visible === true);
    }

    // Owned-cell outlines. Build mode only, and only when asked for: see
    // BuildFootprintOverlay.
    setFootprintOverlay(visible) {
        this.container?.gameMap?.footprintOverlay?.setVisible(visible === true);
    }

    update() {
        this.setFootprintOverlay(
            this.gameMode?.isBuild() === true &&
            this.container?.settings?.buildFootprints === true
        );
        this.setGridOverlay(
            this.gameMode?.isBuild() === true &&
            (this.container?.settings?.buildGrid !== false ||
                this.container?.inputHandler?.isSnapModifierHeld?.() === true)
        );
    }

    dispose() {
        super.dispose();
        this.setFootprintOverlay(false);
        this.setGridOverlay(false);
        this.modeButton = null;
        this.undoButton = null;
        this.redoButton = null;
        this.pausedChip = null;
    }
}
