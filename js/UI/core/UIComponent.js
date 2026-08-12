const UIToolModes = {
    SELECT: 'select',
    DRAG: 'drag',
    PET: 'pet',
    CUSTOMIZE: 'customize',
    BUILD: 'build'
};

class UIComponent {
    constructor(parent) {
        this.parent = parent;
    }

    init() {}

    update() {}

    dispose() {}
}
