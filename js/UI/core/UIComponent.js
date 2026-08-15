const UIToolModes = {
    SELECT: 'select',
    DRAG: 'drag',
    PET: 'pet',
    // Build-mode tools. MOVE is the furniture tool: the same drag the play-mode
    // Drag tool performs, but for objects rather than mytes.
    MOVE: 'move',
    CUSTOMIZE: 'customize',
    BUILD: 'build'
};

// Tools that only exist inside Build mode.
const BUILD_TOOL_MODES = Object.freeze([UIToolModes.MOVE, UIToolModes.BUILD, UIToolModes.CUSTOMIZE]);

class UIComponent {
    constructor(parent) {
        this.parent = parent;
    }

    init() {}

    update() {}

    dispose() {}
}
