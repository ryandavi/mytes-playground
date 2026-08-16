// One name per tool, and the same one everywhere: the key here, the value, the
// button's `id` suffix, its `data-tool-mode`, and the label the player reads.
// It used to be none of those — the wall tool was `BUILD`/`build` in code,
// `build-toggle` in markup and "Wall" on screen, while the play tools used a
// `hand-` prefix the build tools did not. Three names for one thing is three
// places to look when it breaks.
const UIToolModes = {
    SELECT: 'select',
    DRAG: 'drag',
    PET: 'pet',
    // Build-mode tools. MOVE is the furniture tool: the same drag the play-mode
    // Drag tool performs, but for objects rather than mytes.
    MOVE: 'move',
    WALL: 'wall',
    SURFACE: 'surface'
};

// Tools that only exist inside Build mode.
const BUILD_TOOL_MODES = Object.freeze([UIToolModes.MOVE, UIToolModes.WALL, UIToolModes.SURFACE]);

/**
 * UIComponent — the base every UI piece hanging off `UserInterface` extends.
 *
 * It owns the two chores each of them used to re-implement: reaching the
 * container, and undoing what `init` wired up. Three components had already
 * grown their own identical `bind()` and matching pairs of cleanup arrays,
 * which is three places for a listener to leak from.
 */
class UIComponent {
    constructor(parent) {
        this.parent = parent;
        this._cleanup = [];
    }

    // `parent` is the UserInterface; its parent is the container.
    get container() {
        return this.parent?.parent ?? null;
    }

    init() {}

    update() {}

    /**
     * A click listener that is torn down with the component. Clicks on a
     * disabled control are swallowed: a `disabled` attribute stops the event in
     * every browser, but these handlers also run for elements disabled by class
     * alone.
     */
    bindClick(element, handler) {
        if (!element) return null;
        const listener = (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (element.disabled) return;
            handler(event);
        };
        element.addEventListener('click', listener);
        return this.track(() => element.removeEventListener('click', listener));
    }

    /** Register anything that must be undone on dispose — an event unsubscribe,
     *  a listener removal, a child control. Accepts the `null` an optional-chained
     *  `events?.on?.()` returns, so callers need no guard. */
    track(...disposables) {
        for (const disposable of disposables) {
            if (typeof disposable === 'function') this._cleanup.push(disposable);
            else if (typeof disposable?.dispose === 'function') this._cleanup.push(() => disposable.dispose());
        }
        return disposables[0] ?? null;
    }

    dispose() {
        // Reverse order: later registrations may depend on earlier ones.
        for (const cleanup of this._cleanup.reverse()) cleanup();
        this._cleanup = [];
    }
}
