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

class UIComponent {
    constructor(parent) {
        this.parent = parent;
    }

    init() {}

    update() {}

    dispose() {}
}
