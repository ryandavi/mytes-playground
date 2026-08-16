/**
 * BuildSettingToggle — a checkbox bound to one piece of build state.
 *
 * The state lives on the container, not on the control: the checkbox writes it
 * through the container's setter, and the keyboard drives that same setter, so
 * the two can never hold different answers. `sync()` is how the control catches
 * up after the keyboard moved it.
 */
class BuildSettingToggle {
    /**
     * @param {object} owner    the panel or component mounting this
     * @param {Element} root    the element to search for the checkbox
     * @param {object} config   { selector, setting, setter }
     */
    constructor(owner, root, config) {
        this.owner = owner;
        this.config = config;
        this.element = root?.querySelector(config.selector) || null;
        this.handleChange = () => this.container?.[config.setter]?.(this.element.checked);
        this.element?.addEventListener('change', this.handleChange);
    }

    // See WallViewControl: panels resolve the container through the UI, a
    // UIComponent has it directly.
    get container() {
        return this.owner?.container ?? this.owner?.parent?.parent ?? null;
    }

    sync() {
        if (this.element) {
            this.element.checked = this.container?.settings?.[this.config.setting] !== false;
        }
    }

    dispose() {
        this.element?.removeEventListener('change', this.handleChange);
        this.element = null;
        this.owner = null;
    }
}

/** The grid overlay. Also driven by the `G` key. */
class BuildGridToggle extends BuildSettingToggle {
    constructor(owner, root) {
        super(owner, root, {
            selector: '.build-grid-toggle',
            setting: 'buildGrid',
            setter: 'setBuildGridEnabled'
        });
    }
}

/** Whether dragged objects land on grid cells. `Ctrl` inverts it per drag. */
class BuildSnapToggle extends BuildSettingToggle {
    constructor(owner, root) {
        super(owner, root, {
            selector: '.build-snap-toggle',
            setting: 'buildSnap',
            setter: 'setBuildSnapEnabled'
        });
    }
}
