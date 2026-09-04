/**
 * BuildHistory — undo/redo for a build session.
 *
 * A command stack, not snapshots: wall edits, surface paints and object moves
 * all have cheap inverses, and every inverse goes back through the same commit
 * plumbing the original edit used. Build consumers observe the committed
 * transaction, never an intermediate mutation.
 *
 * The stack is session-scoped. It is cleared on entering and leaving build mode
 * and on map change — undoing across a map boundary would target geometry the
 * world state has already recaptured.
 */
class BuildHistory {
    constructor(container) {
        this.container = container;
        this.undoStack = [];
        this.redoStack = [];
        this.limit = SiteConfig.buildMode.historyLimit;
        this._applying = false;
    }

    get canUndo() {
        return this.undoStack.length > 0;
    }

    get canRedo() {
        return this.redoStack.length > 0;
    }

    peekUndoLabel() {
        return this.undoStack[this.undoStack.length - 1]?.label ?? null;
    }

    peekRedoLabel() {
        return this.redoStack[this.redoStack.length - 1]?.label ?? null;
    }

    /**
     * Record a completed edit. `command` is `{ label, undo(), redo() }` — the
     * edit itself has already happened, so redo() is what replays it.
     */
    push(command) {
        // A command pushed while undo/redo is running is that operation's own
        // echo, not a new edit.
        if (this._applying || !command?.undo || !command?.redo) return false;
        if (!this.container?.gameMode?.isBuild()) return false;

        this.undoStack.push(command);
        if (this.undoStack.length > this.limit) this.undoStack.shift();
        this.redoStack.length = 0;
        this.emitChanged();
        return true;
    }

    undo() {
        return this._run(this.undoStack, this.redoStack, 'undo', 'Undid');
    }

    redo() {
        return this._run(this.redoStack, this.undoStack, 'redo', 'Redid');
    }

    _run(from, to, method, verb) {
        const command = from.pop();
        if (!command) return false;

        this._applying = true;
        try {
            command[method]();
        } catch (error) {
            console.error('[BuildHistory] command failed:', error);
            this._applying = false;
            this.clear();
            return false;
        }
        this._applying = false;

        to.push(command);
        this.commit();
        this.emitChanged();
        this.container?.core?.soundManager?.playWhenReady?.(SiteConfig.buildMode.sounds.history);
        if (command.label) {
            this.container?.ui?.showMessage?.(`${verb}: ${command.label}`, 'info', 'Build Mode');
        }
        return true;
    }

    // Every path that changes the map persists the same way.
    commit() {
        const gameMap = this.container?.gameMap;
        if (!gameMap) return;
        this.container?.worldState?.captureMap?.(gameMap);
        this.container?.core?.user?._scheduleSave?.();
    }

    clear() {
        if (this.undoStack.length === 0 && this.redoStack.length === 0) return;
        this.undoStack.length = 0;
        this.redoStack.length = 0;
        this.emitChanged();
    }

    emitChanged() {
        this.container?.eventManager?.emit(EVENTS.BUILD_HISTORY_CHANGED, {
            canUndo: this.canUndo,
            canRedo: this.canRedo,
            undoLabel: this.peekUndoLabel(),
            redoLabel: this.peekRedoLabel()
        });
    }

    dispose() {
        this.undoStack.length = 0;
        this.redoStack.length = 0;
        this.container = null;
    }
}
