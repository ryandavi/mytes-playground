/**
 * PanelSection — a controller for one tab inside a shared window.
 *
 * Sound, View and Debug used to each own a window of their own and a sidebar
 * button to open it. They are now tabs of the Options window, but their
 * controllers are unchanged: this gives them the small slice of ModalWindow
 * they actually used (`modalElement`, `open`/`close`/`toggle`, `playSound`)
 * and points open/close at the owning window's tab instead of a window of
 * their own.
 */
class PanelSection {
    constructor(parent, options = {}) {
        this.parent = parent;
        this.options = { tab: null, owner: 'optionsPanel', ...options };
        this.modalElement = null;
        this.sectionElement = null;
        // Sections have no sidebar button of their own; the owner has one.
        this.buttonElement = null;
    }

    get owner() {
        return this.parent?.[this.options.owner] || null;
    }

    get isVisible() {
        return this.owner?.isVisible === true && this.owner?.activeTab === this.options.tab;
    }

    init() {
        this.modalElement = this.owner?.modalElement || null;
        this.sectionElement = this.modalElement?.querySelector(`[data-tab-panel="${this.options.tab}"]`) || null;
        if (!this.modalElement) {
            Utility.warnDebug(`[PanelSection] Options window missing for tab '${this.options.tab}'`);
        }
    }

    open() {
        this.owner?.openTab(this.options.tab);
    }

    close() {
        this.owner?.close();
    }

    toggle() {
        this.owner?.toggleTab(this.options.tab);
    }

    // Called by the owner when this section's tab becomes visible, so a section
    // can refresh values it only reads while on screen.
    onSectionShown() {}

    getSoundManager() {
        return this.parent?.parent?.core?.soundManager || null;
    }

    playSound(soundType) {
        const sounds = SiteConfig.ui.interactionSounds;
        const soundId = soundType === 'open'
            ? sounds.modalOpen
            : soundType === 'close'
                ? sounds.modalClose
                : sounds.click;
        this.getSoundManager()?.playWhenReady?.(soundId);
    }

    setupTabs() {}

    syncTabs() {}

    dispose() {
        this.modalElement = null;
        this.sectionElement = null;
        this.parent = null;
    }
}
