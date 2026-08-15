/**
 * OptionsPanel — the one settings window.
 *
 * Owns the shared Options modal and its tab strip. The four controllers that
 * used to each have a window (Settings, Sound, View, Debug) are now
 * PanelSections of this one, so the sidebar carries a single gear instead of
 * four buttons.
 */
class OptionsPanel extends ModalWindow {
    static DEFAULT_TAB = 'general';

    constructor(parent) {
        super(parent, {
            id: 'game-settings-panel',
            buttonId: 'options-toggle',
            closeOnOutsideClick: false,
            position: 'top-right',
            draggable: true,
            closeButtonSelector: '.modal-close-btn'
        });

        this.activeTab = OptionsPanel.DEFAULT_TAB;
        this.init();

        this.setupTabs({
            element: this.modalElement?.querySelector('.options-tabs'),
            getTabId: (tab) => tab.dataset.optionsTab,
            panelRoot: this.modalElement,
            onChange: (tabId) => this.selectTab(tabId)
        });
        this.syncTabs(this.activeTab);
    }

    buttonLeftClick(event) {
        event.preventDefault();
        event.stopPropagation();
        this.toggle();
        return false;
    }

    buttonRightClick(event) {
        this.buttonLeftClick(event);
    }

    selectTab(tabId) {
        this.activeTab = tabId;
        this.syncTabs(tabId);
        this.getSection(tabId)?.onSectionShown?.();
    }

    getSection(tabId) {
        return {
            general: this.parent?.settingsPanel,
            sound: this.parent?.soundPanel,
            view: this.parent?.viewPanel,
            debug: this.parent?.debugPanel
        }[tabId] || null;
    }

    openTab(tabId) {
        if (tabId) this.selectTab(tabId);
        this.open();
    }

    toggleTab(tabId) {
        if (this.isVisible && (!tabId || this.activeTab === tabId)) {
            this.close();
            return;
        }
        this.openTab(tabId);
    }

    open() {
        super.open();
        this.getSection(this.activeTab)?.onSectionShown?.();
    }
}
