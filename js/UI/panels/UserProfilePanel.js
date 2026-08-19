class UserProfilePanel extends ModalWindow {
    constructor(parent) {
        super(parent, {
            id: 'user-profile-panel',
            // The header's name plate is this window's trigger.
            buttonId: 'header-user-button',
            closeOnOutsideClick: false,
            position: 'center',
            draggable: true,
            fullscreen: true,
            allowMultipleWindows: true,
            autoInit: false
        });
        this.activeTab = 'account';
        this.init();
    }

    init() {
        super.init();
        if (!this.modalElement) return;

        this.avatarElement = this.modalElement.querySelector('.user-profile__avatar');
        this.nameElement = this.modalElement.querySelector('.user-profile__name');
        this.idElement = this.modalElement.querySelector('.user-profile__id');
        this.tabsElement = this.modalElement.querySelector('.user-profile__tabs');
        this.bodyElement = this.modalElement.querySelector('.user-profile__body');
        this.setupTabs({
            element: this.tabsElement,
            buttonSelector: '[data-user-profile-tab]',
            getTabId: (tab) => tab.dataset.userProfileTab,
            onChange: (tabId) => this.setActiveTab(tabId)
        });
        this.syncTabs(this.activeTab);
    }

    open() {
        this.render();
        super.open();
    }

    setActiveTab(tabId) {
        if (!['account', 'progress'].includes(tabId)) return;
        this.activeTab = tabId;
        this.renderTab();
    }

    render() {
        const user = this.getUser();
        if (!user || !this.bodyElement) return;

        const username = user.username || 'Guest';
        this.avatarElement.textContent = username.trim().charAt(0).toUpperCase() || 'G';
        this.nameElement.textContent = username;
        this.idElement.textContent = `User ID: ${user.userId || 'default'}`;
        this.renderTab();
        this.syncTabs(this.activeTab);
    }

    renderTab() {
        const user = this.getUser();
        if (!user || !this.bodyElement) return;
        this.bodyElement.dataset.activeTab = this.activeTab;
        this.bodyElement.replaceChildren(
            this.activeTab === 'progress'
                ? this.buildRows(this.getProgressEntries(user))
                : this.buildRows(this.getAccountEntries(user))
        );
    }

    getUser() {
        return this.parent.parent?.core?.user || null;
    }

    getAccountEntries(user) {
        return [
            ['Username', user.username || 'Guest'],
            ['User ID', user.userId || 'default'],
            ['Member since', this.formatDate(user.dateCreated)],
            ['Last login', this.formatDate(user.lastLogin)],
            ['Current map', user.currentMapId || 'Unknown']
        ];
    }

    getProgressEntries(user) {
        const playTime = user.getPlayTimeStats?.() ?? { totalHours: 0, totalMinutes: 0 };
        const inventory = user.inventory?.items ?? user.items ?? [];
        const itemCount = inventory.reduce((total, item) => total + (Number(item.quantity) || 0), 0);
        return [
            ['Play time', `${Utility.formatNumber(playTime.totalHours)}h ${Utility.formatNumber(playTime.totalMinutes)}m`],
            ['Mytes', user.activeMytes?.length ?? 0],
            ['Items', itemCount],
            ['Coins', Utility.formatCurrency('coins', user.currency?.coins ?? 0)],
            ['Gems', user.currency?.gems ?? 0],
            ['Mytes hatched', user.stats?.mytesHatched ?? 0],
            ['Achievements', user.stats?.achievementsUnlocked ?? user.achievements?.size ?? 0]
        ];
    }

    buildRows(entries) {
        const list = document.createElement('dl');
        list.className = 'info-list user-profile__stats';
        entries.forEach(([label, value]) => {
            const row = document.createElement('div');
            row.className = 'info-row user-profile__stat';
            const term = document.createElement('dt');
            term.className = 'info-row__label';
            term.textContent = label;
            const description = document.createElement('dd');
            description.className = 'info-row__value';
            description.textContent = typeof value === 'number'
                ? Utility.formatNumber(value)
                : String(value);
            row.append(term, description);
            list.appendChild(row);
        });
        return list;
    }

    formatDate(value) {
        if (!value) return 'Unknown';
        const date = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(date.getTime())) return 'Unknown';
        return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
    }
}
