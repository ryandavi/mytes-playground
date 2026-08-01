document.querySelectorAll('[data-tab-group]').forEach((group) => {
    const tabsElement = group.querySelector('[role="tablist"]');
    if (!tabsElement) return;

    const controller = new TabController({
        element: tabsElement,
        panelRoot: group,
        getTabId: (tab) => tab.dataset.tab
    }).init();
    const initialTab = tabsElement.querySelector('.is-active') || tabsElement.querySelector('[role="tab"]');
    if (initialTab) controller.sync(initialTab.dataset.tab);
});
