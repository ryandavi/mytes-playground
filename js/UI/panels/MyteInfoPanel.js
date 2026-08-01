class MyteInfoPanel extends ModalWindow {
    static GENERAL_FIELDS = Object.freeze([
        Object.freeze({ key: 'status', label: 'Status' }),
        Object.freeze({ key: 'species', label: 'Species' }),
        Object.freeze({ key: 'level', label: 'Level' }),
        Object.freeze({ key: 'mood', label: 'Mood' }),
        Object.freeze({ key: 'action', label: 'Current Action' }),
        Object.freeze({ key: 'slot', label: 'Home Slot' }),
        Object.freeze({ key: 'id', label: 'File ID' })
    ]);

    static STAT_FIELDS = Object.freeze([
        Object.freeze({ key: 'health', label: 'Health', minKey: 'minHealth', maxKey: 'maxHealth' }),
        Object.freeze({ key: 'energy', label: 'Energy', minKey: 'minEnergy', maxKey: 'maxEnergy' }),
        Object.freeze({ key: 'fun', label: 'Fun', minKey: 'minFun', maxKey: 'maxFun' }),
        Object.freeze({ key: 'social', label: 'Social', minKey: 'minSocial', maxKey: 'maxSocial' }),
        Object.freeze({ key: 'satiety', label: 'Satiety', minKey: 'minSatiety', maxKey: 'maxSatiety' }),
        Object.freeze({ key: 'comfort', label: 'Comfort', minKey: 'minComfort', maxKey: 'maxComfort' }),
        Object.freeze({
            key: 'confidence',
            label: 'Confidence',
            minKey: 'minConfidence',
            maxKey: 'maxConfidence',
            displayScale: 100
        })
    ]);

    static TRAIT_FIELDS = Object.freeze([
        Object.freeze({ key: 'boldness', label: 'Boldness', lowPole: 'Timid', highPole: 'Reckless' }),
        Object.freeze({ key: 'curiosity', label: 'Curiosity', lowPole: 'Contented', highPole: 'Obsessive' }),
        Object.freeze({ key: 'activity', label: 'Activity', lowPole: 'Lethargic', highPole: 'Frantic' }),
        Object.freeze({ key: 'sociability', label: 'Sociability', lowPole: 'Reclusive', highPole: 'Clingy' })
    ]);

    static DRIVE_LABELS = Object.freeze({
        eatDrive: 'Hunger',
        restDrive: 'Rest',
        playDrive: 'Play',
        socialDrive: 'Social',
        exploreDrive: 'Explore',
        comfortDrive: 'Comfort',
        safetyDrive: 'Safety'
    });

    constructor(parent) {
        super(parent, {
            id: 'myte-info-panel',
            closeOnOutsideClick: false,
            position: 'center',
            draggable: true,
            allowMultipleWindows: true,
            autoInit: false
        });

        this.myte = null;
        this.activeTab = 'general';
        this.debugEditing = false;
        this.renderedMyteId = null;
        this.renderedTab = null;
        this.valueElements = new Map();
        this.lastValues = new Map();
        this.lastSyncAt = 0;
        this.init();
    }

    init() {
        super.init();
        if (!this.modalElement) return;

        this.titleElement = this.modalElement.querySelector('.window-panel__title .text');
        this.portraitElement = this.modalElement.querySelector('.myte-info__portrait');
        this.nameElement = this.modalElement.querySelector('.myte-info__name');
        this.speciesElement = this.modalElement.querySelector('.myte-info__species');
        this.bodyElement = this.modalElement.querySelector('.myte-info__body');
        this.tabsElement = this.modalElement.querySelector('.myte-info__tabs');

        this.setupTabs({
            element: this.tabsElement,
            buttonSelector: '[data-myte-info-tab]',
            getTabId: (tab) => tab.dataset.myteInfoTab,
            onChange: (tabId) => this.setActiveTab(tabId)
        });
    }

    openFor(myte) {
        if (!myte) return;
        const changedMyte = String(this.myte?.id) !== String(myte.id);
        this.myte = myte;
        if (changedMyte) {
            this.renderedMyteId = null;
            this.renderedTab = null;
        }
        this.renderShell();
        this.renderTab();
        this.syncDynamicValues(true);
        if (!this.isVisible) super.open();
    }

    setActiveTab(tabId) {
        const nextTab = tabId === 'debug' && !this.debugEditing ? 'general' : tabId;
        if (!['general', 'needs', 'behavior', 'drives', 'debug'].includes(nextTab)) return;
        if (this.activeTab === nextTab && this.renderedTab === nextTab) return;
        this.activeTab = nextTab;
        this.renderTab();
        this.syncDynamicValues(true);
    }

    setDebugEditing(enabled) {
        const nextValue = enabled === true;
        if (this.debugEditing === nextValue) return;
        this.debugEditing = nextValue;
        if (!this.debugEditing && this.activeTab === 'debug') this.activeTab = 'general';
        this.renderShell();
        this.renderTab();
        this.syncDynamicValues(true);
    }

    isDebugEditing() {
        return this.debugEditing;
    }

    renderShell() {
        if (!this.myte || !this.modalElement) return;

        const myteId = String(this.myte.id);
        if (this.renderedMyteId !== myteId) {
            this.titleElement.textContent = `${this.myte.name}.myte`;
            this.nameElement.textContent = this.myte.name;
            this.speciesElement.textContent = this.getSpeciesLabel();
            this.renderPortrait();
            this.renderedMyteId = myteId;
        }

        this.tabsElement.querySelectorAll('[data-myte-info-tab]').forEach((tab) => {
            const isDebugTab = tab.dataset.myteInfoTab === 'debug';
            tab.hidden = isDebugTab && !this.debugEditing;
        });
        this.syncTabs(this.activeTab);
        const activeTab = this.tabsElement.querySelector(`[data-myte-info-tab="${this.activeTab}"]`);
        if (activeTab?.id) this.bodyElement.setAttribute('aria-labelledby', activeTab.id);
    }

    renderTab() {
        if (!this.myte || !this.bodyElement) return;
        this.renderShell();
        if (this.renderedTab === this.activeTab) return;

        this.valueElements.clear();
        this.lastValues.clear();
        this.bodyElement.dataset.activeTab = this.activeTab;
        this.bodyElement.replaceChildren(this.buildActiveTab());
        this.renderedTab = this.activeTab;
    }

    buildActiveTab() {
        if (this.activeTab === 'needs') return this.buildNeedsTab();
        if (this.activeTab === 'behavior') return this.buildBehaviorTab();
        if (this.activeTab === 'drives') return this.buildDrivesTab();
        if (this.activeTab === 'debug' && this.debugEditing) return this.buildDebugTab();
        return this.buildGeneralTab();
    }

    buildGeneralTab() {
        const rows = this.createRowsContainer();
        MyteInfoPanel.GENERAL_FIELDS.forEach((field) => {
            const value = document.createElement('span');
            value.className = 'myte-info__text-value';
            this.valueElements.set(field.key, value);
            rows.appendChild(this.createInfoRow(field.label, value));
        });
        return rows;
    }

    buildNeedsTab() {
        const rows = this.createRowsContainer();
        MyteInfoPanel.STAT_FIELDS
            .filter((field) => field.key !== 'confidence')
            .forEach((field) => rows.appendChild(this.createInfoRow(
                field.label,
                this.createMeterValue(field.key)
            )));
        return rows;
    }

    buildBehaviorTab() {
        const dashboard = this.createRowsContainer();
        dashboard.classList.add('myte-info__dashboard');

        const status = this.createInfoSection('Current Behavior', 'myte-info__section--status');
        [
            ['behavior:mood', 'Mood'],
            ['behavior:mode', 'Behavior'],
            ['behavior:detail', 'Behavior Detail'],
            ['behavior:activity', 'Activity'],
            ['behavior:decision', 'Last AI Choice']
        ].forEach(([key, label]) => {
            const value = document.createElement('span');
            value.className = 'myte-info__text-value';
            this.valueElements.set(key, value);
            status.body.appendChild(this.createInfoRow(label, value));
        });

        const personality = this.createInfoSection('Personality');
        personality.body.appendChild(this.createInfoRow(
            'Confidence',
            this.createMeterValue('personality:confidence')
        ));
        MyteInfoPanel.TRAIT_FIELDS.forEach((field) => {
            personality.body.appendChild(this.createTraitRow(field));
        });

        dashboard.append(status.section, personality.section);
        return dashboard;
    }

    buildDrivesTab() {
        const page = this.createRowsContainer();
        const summary = document.createElement('p');
        summary.className = 'myte-info__page-description';
        summary.textContent = 'Drives show what the AI currently feels most compelled to do.';
        page.appendChild(summary);

        Object.entries(MyteInfoPanel.DRIVE_LABELS).forEach(([key, label]) => {
            page.appendChild(this.createInfoRow(
                label,
                this.createMeterValue(`drive:${key}`, 'is-urgency')
            ));
        });
        return page;
    }

    createInfoSection(title, className = '') {
        const section = document.createElement('section');
        section.className = `myte-info__section ${className}`.trim();
        const heading = document.createElement('h3');
        heading.className = 'myte-info__section-title';
        heading.textContent = title;
        const body = document.createElement('div');
        body.className = 'myte-info__section-body';
        section.append(heading, body);
        return { section, body };
    }

    createMeterValue(key, className = '') {
        const valueWrap = document.createElement('div');
        valueWrap.className = `myte-info__need-value ${className}`.trim();
        const meter = document.createElement('div');
        meter.className = 'myte-info__meter';
        meter.setAttribute('role', 'progressbar');
        meter.setAttribute('aria-valuemin', '0');
        meter.setAttribute('aria-valuemax', '100');
        const fill = document.createElement('span');
        meter.appendChild(fill);
        const output = document.createElement('output');
        valueWrap.append(meter, output);
        this.valueElements.set(key, { fill, output, meter });
        return valueWrap;
    }

    createTraitRow(field) {
        const valueWrap = document.createElement('div');
        valueWrap.className = 'myte-info__trait-value';
        const low = document.createElement('span');
        low.textContent = field.lowPole;
        const track = document.createElement('span');
        track.className = 'myte-info__trait-track';
		track.setAttribute('role', 'progressbar');
		track.setAttribute('aria-valuemin', '0');
		track.setAttribute('aria-valuemax', '100');
        const marker = document.createElement('span');
        marker.className = 'myte-info__trait-marker';
        track.appendChild(marker);
        const high = document.createElement('span');
        high.textContent = field.highPole;
        valueWrap.append(low, track, high);
        this.valueElements.set(`trait:${field.key}`, { marker, track });
        return this.createInfoRow(field.label, valueWrap);
    }

    buildDebugTab() {
        const editor = this.createRowsContainer();

        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.value = this.myte.name;
        nameInput.maxLength = 30;
        const applyName = document.createElement('button');
        applyName.type = 'button';
        applyName.textContent = 'Apply';
        applyName.addEventListener('click', () => this.renameMyte(nameInput.value));
        const nameControls = document.createElement('div');
        nameControls.className = 'myte-info__name-controls';
        nameControls.append(nameInput, applyName);
        editor.appendChild(this.createInfoRow('Display Name', nameControls));

        MyteInfoPanel.STAT_FIELDS.forEach((field) => {
            const controls = document.createElement('div');
            controls.className = 'myte-info__stat-controls';
            const minus = document.createElement('button');
            minus.type = 'button';
            minus.textContent = '−';
            const output = document.createElement('output');
            const plus = document.createElement('button');
            plus.type = 'button';
            plus.textContent = '+';
            minus.addEventListener('click', () => this.adjustStat(field, -SiteConfig.debug.statStep));
            plus.addEventListener('click', () => this.adjustStat(field, SiteConfig.debug.statStep));
            controls.append(minus, output, plus);
            this.valueElements.set(field.key, output);
            editor.appendChild(this.createInfoRow(field.label, controls));
        });

        return editor;
    }

    createRowsContainer() {
        const rows = document.createElement('div');
        rows.className = 'info-list myte-info__page myte-info__rows';
        rows.setAttribute('role', 'tabpanel');
        rows.setAttribute('aria-label', `${this.activeTab} information`);
        return rows;
    }

    createInfoRow(labelText, valueElement) {
        const row = document.createElement('div');
        row.className = 'info-row myte-info__row';
        const label = document.createElement('span');
        label.className = 'info-row__label myte-info__row-label';
        label.textContent = labelText;
        const value = document.createElement('div');
        value.className = 'info-row__value myte-info__row-value';
        value.appendChild(valueElement);
        row.append(label, value);
        return row;
    }

    getGeneralValues() {
        const action = this.myte.queue?.getCurrentAction?.();
        return {
            status: this.getStatusLabel(),
            species: this.getSpeciesLabel(),
            level: String(this.myte.stats?.level ?? 1),
            mood: this.myte.stats?.getDerivedMood?.() ?? 'Neutral',
            action: action?.constructor?.metadata?.label || action?.constructor?.metadata?.id || 'Idle',
            slot: this.myte.elements?.wrapper?.querySelector?.('.myte-home-label .name')?.textContent || 'None',
            id: String(this.myte.id)
        };
    }

    getStatSnapshot(field) {
        const value = Number(this.myte.stats?.[field.key]) || 0;
        const min = Number(this.myte.stats?.[field.minKey]) || 0;
        const max = Number(this.myte.stats?.[field.maxKey]) || 100;
        const percentage = Math.round(Utility.clamp((value - min) / Math.max(1, max - min), 0, 1) * 100);
        return {
            percentage,
            display: Math.round(value * (field.displayScale || 1))
        };
    }

    syncDynamicValues(force = false) {
        if (!this.myte || !this.isVisible && !force) return;

        if (this.activeTab === 'general') {
            const values = this.getGeneralValues();
            Object.entries(values).forEach(([key, value]) => this.updateTextValue(key, value, force));
        } else if (this.activeTab === 'needs') {
            MyteInfoPanel.STAT_FIELDS.filter((field) => field.key !== 'confidence').forEach((field) => {
                const snapshot = this.getStatSnapshot(field);
                this.updateMeterValue(field.key, snapshot.percentage, force);
            });
        } else if (this.activeTab === 'behavior') {
            this.syncBehaviorValues(force);
        } else if (this.activeTab === 'drives') {
            this.syncDriveValues(force);
        } else if (this.activeTab === 'debug') {
            MyteInfoPanel.STAT_FIELDS.forEach((field) => {
                const snapshot = this.getStatSnapshot(field);
                this.updateTextValue(field.key, String(snapshot.display), force);
            });
        }

        this.lastSyncAt = performance.now();
    }

    syncBehaviorValues(force = false) {
        const snapshot = this.myte.ai?.getNeedsSnapshot?.({ live: true }) ?? {};
        const sidebar = this.parent.actionSidebarManager;
        const detail = sidebar?.getMyteBehaviorDetail?.(this.myte);
        const behaviorValues = {
            'behavior:mood': this.myte.stats?.getDerivedMood?.() ?? 'Neutral',
            'behavior:mode': sidebar?.getMyteBehaviorLabel?.(this.myte) ?? this.getStatusLabel(),
            'behavior:detail': detail?.value ?? 'Standard',
            'behavior:activity': sidebar?.getMyteActivityLabel?.(this.myte) ?? 'Idle',
            'behavior:decision': snapshot.lastDecisionLabel ?? 'No decision yet'
        };
        Object.entries(behaviorValues).forEach(([key, value]) => this.updateTextValue(key, value, force));

        this.updateMeterValue('personality:confidence', snapshot.vitals?.confidence ?? 0, force);
        MyteInfoPanel.TRAIT_FIELDS.forEach((field) => {
            const percentage = Math.round((this.myte.stats?.getTraitNormalized?.(field.key) ?? 0.5) * 100);
            this.updateTraitValue(`trait:${field.key}`, percentage, force);
        });

    }

    syncDriveValues(force = false) {
        const snapshot = this.myte.ai?.getNeedsSnapshot?.({ live: true }) ?? {};
        const needs = new Map((snapshot.needs ?? []).map((need) => [need.id, need.percent ?? 0]));
        Object.keys(MyteInfoPanel.DRIVE_LABELS).forEach((key) => {
            this.updateMeterValue(`drive:${key}`, needs.get(key) ?? 0, force);
        });
    }

    updateMeterValue(key, percentage, force = false) {
        const normalized = Math.round(Utility.clamp(Number(percentage) || 0, 0, 100));
        if (!force && this.lastValues.get(key) === normalized) return;
        const elements = this.valueElements.get(key);
        if (!elements) return;
        elements.fill.style.width = `${normalized}%`;
        elements.output.textContent = `${normalized}%`;
        elements.meter?.setAttribute('aria-valuenow', String(normalized));
        this.lastValues.set(key, normalized);
    }

    updateTraitValue(key, percentage, force = false) {
        const normalized = Math.round(Utility.clamp(Number(percentage) || 0, 0, 100));
        if (!force && this.lastValues.get(key) === normalized) return;
        const elements = this.valueElements.get(key);
        if (!elements) return;
        elements.marker.style.left = `${normalized}%`;
		elements.track.setAttribute('aria-valuenow', String(normalized));
        this.lastValues.set(key, normalized);
    }

    updateTextValue(key, value, force = false) {
        const normalized = String(value);
        if (!force && this.lastValues.get(key) === normalized) return;
        const element = this.valueElements.get(key);
        if (element) element.textContent = normalized;
        this.lastValues.set(key, normalized);
    }

    renderPortrait() {
        this.portraitElement.replaceChildren();
        const sprite = document.createElement('span');
        sprite.className = 'myte-info__portrait-sprite';
        const inner = document.createElement('span');
        inner.className = 'myte-info__portrait-sprite-inner';
        sprite.appendChild(inner);
        this.portraitElement.appendChild(sprite);
        this.parent.myteListManager?.applyThumbnailVisuals?.(sprite, inner, this.myte);
    }

    getSpeciesLabel() {
        return this.myte.definition?.label || this.myte.species || 'Myte';
    }

    getStatusLabel() {
        if (!this.myte.isActive) return 'In Home Slot';
        if (this.myte === this.parent.getActiveMyte()) return 'Following';
        if (this.myte.goal === MOVE_TYPES.FREEROAM) return 'Free Roam';
        return 'Deployed';
    }

    adjustStat(field, displayDelta) {
        const stats = this.myte.stats;
        if (!stats) return;
        const scale = field.displayScale || 1;
        const min = Number(stats[field.minKey]) || 0;
        const max = Number(stats[field.maxKey]) || 100;
        stats[field.key] = Utility.clamp(stats[field.key] + (displayDelta / scale), min, max);
        stats.updateBatteryDisplay?.();
        this.parent.parent.core?.user?._scheduleSave?.();
        this.parent.hudManager?.update?.(true);
        this.syncDynamicValues();
    }

    renameMyte(rawName) {
        const name = String(rawName || '').trim();
        if (!name) return;
        const rosterEntry = MyteRosterSchema.normalizeEntry({
            ...MyteRosterSchema.serializeMyte(this.myte),
            name
        });
        MyteRosterSchema.applyToMyte(this.myte, rosterEntry);
        this.parent.myteListManager?.initMytesList?.();
        this.parent.hudManager?.update?.(true);
        this.parent.parent.core?.user?._scheduleSave?.();
        this.renderedMyteId = null;
        this.renderShell();
    }

    update() {
        if (!this.isVisible) return;
        if (performance.now() - this.lastSyncAt < SiteConfig.ui.hud.updateIntervalMs) return;
        this.syncDynamicValues();
    }

    dispose() {
        super.dispose();
        this.valueElements.clear();
        this.lastValues.clear();
        this.myte = null;
        this.titleElement = null;
        this.portraitElement = null;
        this.nameElement = null;
        this.speciesElement = null;
        this.bodyElement = null;
        this.tabsElement = null;
    }
}
