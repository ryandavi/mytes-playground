class TabController {
    constructor(options = {}) {
        this.element = options.element || null;
        this.buttonSelector = options.buttonSelector || '[role="tab"]';
        this.getTabId = options.getTabId || ((tab) => tab.dataset.tab);
        this.onChange = options.onChange || (() => {});
        this.panelRoot = options.panelRoot || this.element?.parentElement || null;
        this.panelSelector = options.panelSelector || '[role="tabpanel"][data-tab-panel]';
        this.getPanelId = options.getPanelId || ((panel) => panel.dataset.tabPanel);
        this.handleClick = this.handleClick.bind(this);
        this.handleKeyDown = this.handleKeyDown.bind(this);
    }

    init() {
        if (!this.element) return this;
        this.element.addEventListener('click', this.handleClick);
        this.element.addEventListener('keydown', this.handleKeyDown);
        return this;
    }

    getTabs() {
        return [...this.element.querySelectorAll(this.buttonSelector)]
            .filter((tab) => !tab.disabled && !tab.hidden);
    }

    select(tabOrId, focus = false) {
        const tab = typeof tabOrId === 'string'
            ? this.getTabs().find((candidate) => this.getTabId(candidate) === tabOrId)
            : tabOrId;
        if (!tab || tab.disabled || tab.hidden) return;

        const tabId = this.getTabId(tab);
        this.sync(tabId);
        this.onChange(tabId, tab);
        if (focus) tab.focus();
    }

    sync(activeId) {
        this.element.querySelectorAll(this.buttonSelector).forEach((tab) => {
            const isActive = this.getTabId(tab) === activeId;
            tab.classList.toggle('is-active', isActive);
            tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
            tab.tabIndex = isActive ? 0 : -1;
        });

        this.panelRoot?.querySelectorAll(this.panelSelector).forEach((panel) => {
            panel.hidden = this.getPanelId(panel) !== activeId;
        });
    }

    handleClick(event) {
        const tab = event.target.closest(this.buttonSelector);
        if (!tab || !this.element.contains(tab)) return;
        this.select(tab);
    }

    handleKeyDown(event) {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        const tabs = this.getTabs();
        const currentIndex = tabs.indexOf(event.target);
        if (currentIndex < 0 || tabs.length === 0) return;

        event.preventDefault();
        const nextIndex = event.key === 'Home'
            ? 0
            : event.key === 'End'
                ? tabs.length - 1
                : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
        this.select(tabs[nextIndex], true);
    }

    dispose() {
        this.element?.removeEventListener('click', this.handleClick);
        this.element?.removeEventListener('keydown', this.handleKeyDown);
        this.element = null;
        this.panelRoot = null;
    }
}
