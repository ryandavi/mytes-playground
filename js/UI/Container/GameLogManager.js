// Event log window ("Mytes Messenger"). Pure consumer of EventManager emissions —
// game systems never call the log directly; they emit, this renders.
class GameLogManager extends ModalWindow {
    static MAX_ENTRIES = 200;
    static STORED_ENTRIES = 50;
    static STORAGE_KEY = 'myteGameLog';
    // Sprite symbol used when a log template declares no icon of its own.
    static DEFAULT_ICON = 'star';

    constructor(parent) {
        super(parent, {
            id: 'game-log-panel',
            closeOnOutsideClick: false,
            position: 'bottom-right',
            draggable: true,
            fullscreen: true,
            closeButtonSelector: '.modal-close-btn'
        });

        this.templates = new Map();
        this.templateDefaults = {};
        this.entries = [];
        this.pendingEvents = [];
        this.activeFilter = null;
        this.lastEmitTimes = new Map();

        // Payload → { templateId, values, entity } per event. A null return skips
        // the event; a null token value drops the entry (template expected data
        // the payload didn't have).
        this.formatters = {
            [EVENTS.MYTE_ACTION_COMPLETED]: (payload) => ({
                templateId: `action:${payload.actionId}`,
                values: {
                    myte: payload.myte?.name ?? null,
                    target: this.getEntityLabel(payload.target)
                },
                entity: payload.myte
            }),
            [EVENTS.CHEST_OPENED]: (payload) => ({
                templateId: EVENTS.CHEST_OPENED,
                values: { items: this.formatItemList(payload.items) },
                entity: payload.chest
            }),
            [EVENTS.PLANT_MATURED]: (payload) => ({
                templateId: EVENTS.PLANT_MATURED,
                values: { plant: this.getEntityLabel(payload.plant) },
                entity: payload.plant
            }),
            [EVENTS.PLANT_MUTATED]: (payload) => ({
                templateId: EVENTS.PLANT_MUTATED,
                values: { plant: this.getEntityLabel(payload.plant) },
                entity: payload.plant
            }),
            [EVENTS.PLANT_POLLINATED]: (payload) => ({
                templateId: EVENTS.PLANT_POLLINATED,
                values: { plant: this.getEntityLabel(payload.plant) },
                entity: payload.plant
            }),
            [EVENTS.USER_CURRENCY_CHANGED]: (payload) => {
                if (payload.type !== 'coins' || payload.delta <= 0) return null;
                return {
                    templateId: EVENTS.USER_CURRENCY_CHANGED,
                    values: {
                        coins: Utility.formatCurrency('coins', payload.delta),
                        total: Utility.formatCurrency('coins', payload.total)
                    },
                    entity: null
                };
            }
        };

        this.init(); // explicit — subclass state is ready before any virtual method call
        this.listElement = this.modalElement?.querySelector('.game-log-list') ?? null;
        this.emptyElement = this.modalElement?.querySelector('.game-log-empty') ?? null;
        this.filtersElement = this.modalElement?.querySelector('.game-log-filters') ?? null;
		this.setupTabs({
			element: this.filtersElement,
			buttonSelector: '.game-log-filter',
			getTabId: (tab) => tab.dataset.gameLogFilter,
			onChange: (tabId) => this.setFilter(tabId === 'all' ? null : tabId)
		});

        this.restoreEntries();
        this.syncEmptyState();
        this.subscribe();
        this.loadTemplates();
    }

    open() {
        this.parent.stageChips?.clearUnread();
        super.open();
    }

    _getContainer() {
        return this.parent.parent;
    }

    subscribe() {
        const eventManager = this._getContainer()?.core?.eventManager;
        if (!eventManager) return;
        for (const eventName of Object.keys(this.formatters)) {
            eventManager.on(eventName, (payload) => this.handleEvent(eventName, payload));
        }
    }

    async loadTemplates() {
        try {
            const response = await fetch(Utility.preventCache('data/metadata/log-events.json'));
            const data = await response.json();
            this.templateDefaults = data.defaults ?? {};
            for (const entry of data.events ?? []) {
                this.templates.set(entry.id, entry);
            }
        } catch (error) {
            console.error('[GameLogManager] Failed to load log-events.json', error);
            return;
        }

        this.buildFilterChips();

        const buffered = this.pendingEvents;
        this.pendingEvents = [];
        for (const { eventName, payload } of buffered) {
            this.handleEvent(eventName, payload);
        }
    }

    handleEvent(eventName, payload) {
        if (this.templates.size === 0) {
            // Templates still loading — buffer a bounded backlog.
            if (this.pendingEvents.length < 40) this.pendingEvents.push({ eventName, payload });
            return;
        }

        const formatted = this.formatters[eventName]?.(payload);
        if (!formatted) return;

        const template = this.templates.get(formatted.templateId);
        if (!template) return;

        if (this.isOnCooldown(formatted, template)) return;

        let missingValue = false;
        const text = template.template.replace(/\{(\w+)\}/g, (match, key) => {
            const value = formatted.values[key];
            if (value == null) missingValue = true;
            return value ?? match;
        });
        if (missingValue) return;

        this.addEntry({
            text,
            icon: template.icon ?? GameLogManager.DEFAULT_ICON,
            category: template.category ?? 'system',
            rarity: template.rarity ?? null,
            time: this.getGameTimeStamp(),
            entityId: formatted.entity?.id ?? null
        });

        if (template.rarity === 'notable') {
            this._getContainer()?.core?.toastManager?.info(text, 'Event Log');
        }
    }

    isOnCooldown(formatted, template) {
        const cooldown = template.cooldownMs ?? this.templateDefaults.cooldownMs ?? 0;
        if (cooldown <= 0) return false;

        const key = `${formatted.templateId}:${formatted.entity?.id ?? ''}`;
        const now = SimClock.now();
        const last = this.lastEmitTimes.get(key) ?? -Infinity;
        if (now - last < cooldown) return true;

        this.lastEmitTimes.set(key, now);
        return false;
    }

    addEntry(entry) {
        this.entries.push(entry);
        this.parent.stageChips?.noteLogEntry();
        if (this.entries.length > GameLogManager.MAX_ENTRIES) {
            this.entries.shift();
            this.listElement?.firstElementChild?.remove();
        }
        this.renderEntry(entry);
        this.persistEntries();
    }


    renderEntry(entry) {
        if (!this.listElement) return;

        const stickToBottom = this.isScrolledToBottom();

        const item = document.createElement('li');
        item.className = 'game-log-entry';
        item.dataset.category = entry.category;
        if (entry.rarity) item.classList.add(`rarity-${entry.rarity}`);
        if (this.activeFilter && entry.category !== this.activeFilter) item.classList.add('is-hidden');

        const time = document.createElement('span');
        time.className = 'time';
        time.textContent = entry.time;

        const icon = document.createElement('span');
        icon.className = 'icon';
        Utility.renderIconLabel(icon, entry.icon);

        const text = document.createElement('span');
        text.className = 'text';
        text.textContent = entry.text;

        item.append(time, icon, text);

        if (entry.entityId) {
            item.classList.add('is-clickable');
            item.addEventListener('click', () => this.focusEntity(entry.entityId));
        }

        this.listElement.appendChild(item);
        this.syncEmptyState();
        if (stickToBottom) this.listElement.scrollTop = this.listElement.scrollHeight;
    }

    isScrolledToBottom() {
        const list = this.listElement;
        if (!list) return false;
        return list.scrollTop + list.clientHeight >= list.scrollHeight - 12;
    }

    focusEntity(entityId) {
        const container = this._getContainer();
        const entity = container?.mytes?.find?.((myte) => myte.id === entityId)
            ?? container?.gameMap?.getObjectById?.(entityId)
            ?? null;
        if (!entity || entity.active === false) return;
        container?.camera?.focusOn?.(entity);
    }

    buildFilterChips() {
        if (!this.filtersElement) return;
        this.filtersElement.innerHTML = '';

        const categories = [...new Set([...this.templates.values()].map((entry) => entry.category ?? 'system'))];
        const chips = [{ id: null, label: 'All' }, ...categories.map((id) => ({ id, label: id }))];

        for (const chip of chips) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'game-log-filter';
            button.textContent = chip.label;
			button.setAttribute('role', 'tab');
			button.dataset.gameLogFilter = chip.id ?? 'all';
            this.filtersElement.appendChild(button);
        }
		this.syncTabs(this.activeFilter ?? 'all');
    }

    setFilter(category) {
        this.activeFilter = category;
		this.syncTabs(category ?? 'all');
        this.listElement?.querySelectorAll('.game-log-entry').forEach((item) => {
            item.classList.toggle('is-hidden', category !== null && item.dataset.category !== category);
        });
        this.syncEmptyState();
        if (this.listElement) this.listElement.scrollTop = this.listElement.scrollHeight;
    }

    syncEmptyState() {
        if (!this.emptyElement || !this.listElement) return;
        const hasVisibleEntry = [...this.listElement.children]
            .some((entry) => !entry.classList.contains('is-hidden'));
        this.emptyElement.hidden = hasVisibleEntry;
        this.markFirstVisibleEntry();
    }

    /**
     * Entries are separated by a rule on their top edge, which the topmost one
     * must not draw. CSS cannot ask whether the sibling above is filtered out,
     * so the list says which entry is currently first.
     */
    markFirstVisibleEntry() {
        if (!this.listElement) return;
        let seen = false;
        for (const entry of this.listElement.children) {
            const visible = !entry.classList.contains('is-hidden');
            entry.classList.toggle('is-first-visible', visible && !seen);
            if (visible) seen = true;
        }
    }

    getGameTimeStamp() {
        return this._getContainer()?.core?.gameTime?.getFormattedTime?.() ?? '';
    }

    getEntityLabel(entity) {
        if (!entity) return null;
        return entity.name
            ?? entity.getConfig?.('label')
            ?? entity.variant
            ?? (entity.type ? String(entity.type).toLowerCase().replace(/_/g, ' ') : null);
    }

    formatItemList(items = []) {
        const labels = items.map((item) => {
            const name = String(item.variant ?? item.type ?? 'item').replace(/_/g, ' ');
            return item.quantity > 1 ? `${item.quantity}× ${name}` : name;
        });
        if (labels.length === 0) return null;
        if (labels.length === 1) return labels[0];
        return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
    }

    persistEntries() {
        try {
            const stored = this.entries.slice(-GameLogManager.STORED_ENTRIES).map((entry) => ({
                text: entry.text,
                icon: entry.icon,
                category: entry.category,
                rarity: entry.rarity,
                time: entry.time,
                entityId: entry.entityId
            }));
            localStorage.setItem(GameLogManager.STORAGE_KEY, JSON.stringify(stored));
        } catch (error) {
            // Storage full/unavailable — the log keeps working in memory.
        }
    }

    restoreEntries() {
        let stored = null;
        try {
            stored = JSON.parse(localStorage.getItem(GameLogManager.STORAGE_KEY) ?? 'null');
        } catch (error) {
            return;
        }
        if (!Array.isArray(stored)) return;

        for (const entry of stored) {
            if (!entry?.text) continue;
            this.entries.push(entry);
            this.renderEntry(entry);
        }
        if (this.listElement) this.listElement.scrollTop = this.listElement.scrollHeight;
    }
}
