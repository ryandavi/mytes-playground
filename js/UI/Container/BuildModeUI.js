/**
 * BuildModeUI — the sidebar controls that belong to the mode switch itself:
 * the Build button, Undo/Redo, and the grid overlay that appears while the
 * Walls tool is active.
 *
 * Everything that is merely shown or hidden by mode is CSS, driven from
 * `data-game-mode`. This owns only the state CSS cannot know: whether building
 * is allowed on this map, and whether there is anything left to undo.
 */
class BuildModeUI extends UIComponent {
    constructor(parent) {
        super(parent);
        this.modeButton = null;
        this.undoButton = null;
        this.redoButton = null;
        this.unsubscribers = [];
        this.listenerCleanup = [];
    }

    get container() {
        return this.parent.parent;
    }

    get gameMode() {
        return this.container?.gameMode || null;
    }

    init() {
        const wrapper = this.parent.containerWrapper;
        this.modeButton = wrapper?.querySelector('#build-mode-toggle') || null;
        this.undoButton = wrapper?.querySelector('#build-undo') || null;
        this.redoButton = wrapper?.querySelector('#build-redo') || null;
        this.pausedChip = wrapper?.querySelector('#build-paused-chip') || null;

        this.bind(this.modeButton, () => this.gameMode?.toggle());
        // The chip explains the frozen world, so it is also the way out of it —
        // the nearest control to where the player is already looking.
        this.bind(this.pausedChip, () => this.gameMode?.setMode(GAME_MODES.PLAY));
        this.bind(this.undoButton, () => this.container?.buildHistory?.undo());
        this.bind(this.redoButton, () => this.container?.buildHistory?.redo());

        const events = this.container?.eventManager;
        this.unsubscribers.push(
            events?.on?.(EVENTS.GAME_MODE_CHANGED, () => this.syncModeState()),
            events?.on?.(EVENTS.MAP_CHANGED, () => this.syncModeState()),
            events?.on?.(EVENTS.BUILD_HISTORY_CHANGED, payload => this.syncHistoryState(payload))
        );

        this.gameMode?.applyModeState();
        this.syncModeState();
        this.syncHistoryState();
    }

    bind(element, handler) {
        if (!element) return;
        const listener = (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (element.disabled) return;
            handler();
        };
        element.addEventListener('click', listener);
        this.listenerCleanup.push(() => element.removeEventListener('click', listener));
    }

    syncModeState() {
        const isBuild = this.gameMode?.isBuild() === true;
        const allowed = this.gameMode?.canBuildHere() !== false;

        if (this.modeButton) {
            this.modeButton.classList.toggle('active', isBuild);
            this.modeButton.setAttribute('aria-pressed', String(isBuild));
            this.modeButton.disabled = !allowed && !isBuild;
            this.modeButton.title = allowed
                ? (isBuild ? 'Leave Build Mode (B)' : 'Build Mode (B)')
                : "You can't build here";
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
     * A faint tile grid while the Walls tool is up, or while Ctrl-snapping an
     * object. One repeating-gradient layer sized from the grid — never per-cell
     * DOM.
     */
    setGridOverlay(visible) {
        const canvas = this.container?.canvas;
        if (!canvas) return;
        const cellSize = this.container?.gameMap?.gridSystem?.config?.cellSize;
        if (cellSize) canvas.style.setProperty('--build-grid-size', `${cellSize}px`);
        canvas.classList.toggle('show-build-grid', visible === true);
    }

    update() {
        this.setGridOverlay(
            this.gameMode?.isBuild() === true &&
            (this.parent.isTool(UIToolModes.BUILD) || this.container?.inputHandler?.isSnapModifierHeld?.() === true)
        );
    }

    dispose() {
        this.listenerCleanup.forEach(cleanup => cleanup());
        this.listenerCleanup = [];
        this.unsubscribers.forEach(unsubscribe => unsubscribe?.());
        this.unsubscribers = [];
        this.setGridOverlay(false);
        this.modeButton = null;
        this.undoButton = null;
        this.redoButton = null;
        this.pausedChip = null;
    }
}
