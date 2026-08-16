/**
 * BuildSettingToggle — a checkbox both build panels carry for one piece of
 * build state.
 *
 * The state lives on the container, not on a panel: whichever panel is open
 * writes it, the other reads it back when it opens, and the keyboard drives the
 * same setter. Two panels holding two copies of "show the grid" is how they end
 * up disagreeing.
 */
class BuildSettingToggle {
    /**
     * @param {object} panel   the owning panel
     * @param {Element} root   the panel element to search
     * @param {object} config  { selector, setting, setter }
     */
    constructor(panel, root, config) {
        this.panel = panel;
        this.config = config;
        this.element = root?.querySelector(config.selector) || null;
        this.handleChange = () => this.container?.[config.setter]?.(this.element.checked);
        this.element?.addEventListener('change', this.handleChange);
    }

    get container() {
        return this.panel?.parent?.parent || null;
    }

    sync() {
        if (this.element) {
            this.element.checked = this.container?.settings?.[this.config.setting] !== false;
        }
    }

    dispose() {
        this.element?.removeEventListener('change', this.handleChange);
        this.element = null;
        this.panel = null;
    }
}

/** The grid overlay. Also driven by the `G` key. */
class BuildGridToggle extends BuildSettingToggle {
    constructor(panel, root) {
        super(panel, root, {
            selector: '.build-grid-toggle',
            setting: 'buildGrid',
            setter: 'setBuildGridEnabled'
        });
    }
}

/** Whether dragged objects land on grid cells. `Ctrl` inverts it per drag. */
class BuildSnapToggle extends BuildSettingToggle {
    constructor(panel, root) {
        super(panel, root, {
            selector: '.build-snap-toggle',
            setting: 'buildSnap',
            setter: 'setBuildSnapEnabled'
        });
    }
}
