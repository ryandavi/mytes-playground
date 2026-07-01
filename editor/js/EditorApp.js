class EditorApp {
    static PREVIEW_CLASSES = {
        myte: MytePreview,
        mapObject: MapObjectPreview,
        item: ItemPreview,
        summary: SummaryPreview
    };

    constructor() {
        this.store = new EditorStore();
        this.router = new EditorRouter((domainId, recordId) => this.renderRoute(domainId, recordId));
        this.activePreview = null;
        this.currentDomainId = null;
    }

    async init() {
        const loadingEl = document.getElementById('editor-loading');

        try {
            await this.store.loadAll();
        } catch (error) {
            loadingEl.textContent = `Failed to load content data: ${error.message}`;
            return;
        }

        this.tabsEl = document.getElementById('editor-tabs');
        this.workspaceEl = document.getElementById('editor-workspace');
        this.workspaceLabelEl = document.getElementById('editor-workspace-label');
        this.crumbEl = document.getElementById('editor-crumb');
        this.statusEl = document.getElementById('editor-status');
        this.statusFileEl = document.getElementById('editor-status-file');
        this.statusSchemaEl = document.getElementById('editor-status-schema');
        this.inspectorModeEl = document.getElementById('editor-inspector-mode');

        this.rail = new ListRailPanel({
            listEl: document.getElementById('editor-rail-list'),
            searchEl: document.getElementById('editor-rail-search'),
            titleEl: document.getElementById('editor-rail-title'),
            countEl: document.getElementById('editor-rail-count'),
            onSelect: recordId => this.router.navigate(this.currentDomainId, recordId)
        });
        this.inspector = new InspectorPanel(document.getElementById('editor-inspector'));
        this.compareActive = false;
        this.baseInspectorEl = document.createElement('div');
        this.baseInspectorEl.id = 'editor-inspector-base';
        this.baseInspectorEl.className = 'editor-inspector editor-inspector--base';
        this.baseInspectorEl.hidden = true;
        document.getElementById('editor-inspector').parentElement.appendChild(this.baseInspectorEl);
        this.baseInspector = new InspectorPanel(this.baseInspectorEl);

        this.buildTabs();
        this.buildHeaderActions();
        this.buildRailActions();
        this.buildFindingsBar();

        window.addEventListener('beforeunload', event => {
            if (this.store.dirtyDocuments().length > 0) {
                event.preventDefault();
            }
        });

        const schemaWarnings = this.store.schemaWarnings();
        if (schemaWarnings.length > 0) {
            this.showFindings(
                schemaWarnings.map(w => ({ level: 'warning', path: w.fileId, message: w.message })),
                'Schema version warnings:'
            );
        }

        this.router.start();
        loadingEl.classList.add('is-hidden');
    }

    // ── Chrome ───────────────────────────────────────────────────────────────

    buildTabs() {
        this.tabsEl.innerHTML = '';
        this.store.domains.forEach(domain => {
            const button = document.createElement('button');
            button.type = 'button';
            button.dataset.domainId = domain.id;
            button.textContent = domain.label;
            button.addEventListener('click', () => this.router.navigate(domain.id));
            this.tabsEl.appendChild(button);
        });
    }

    buildHeaderActions() {
        const actions = document.querySelector('.editor-header__actions');

        this.validateButton = document.createElement('button');
        this.validateButton.type = 'button';
        this.validateButton.className = 'editor-header__button';
        this.validateButton.textContent = 'Validate';
        this.validateButton.addEventListener('click', () => this.validateCurrentDomain());

        this.revertButton = document.createElement('button');
        this.revertButton.type = 'button';
        this.revertButton.className = 'editor-header__button';
        this.revertButton.textContent = 'Revert';
        this.revertButton.disabled = true;
        this.revertButton.addEventListener('click', () => this.revertCurrentDomain());

        this.saveButton = document.createElement('button');
        this.saveButton.type = 'button';
        this.saveButton.className = 'editor-header__button editor-header__button--primary';
        this.saveButton.textContent = 'Save';
        this.saveButton.disabled = true;
        this.saveButton.addEventListener('click', () => this.saveCurrentDomain());

        this.compareButton = document.createElement('button');
        this.compareButton.type = 'button';
        this.compareButton.className = 'editor-header__button';
        this.compareButton.textContent = 'Compare';
        this.compareButton.title = 'Toggle side-by-side base vs override view';
        this.compareButton.addEventListener('click', () => this.toggleCompare());

        actions.prepend(this.saveButton);
        actions.prepend(this.revertButton);
        actions.prepend(this.validateButton);
        actions.prepend(this.compareButton);
    }

    buildRailActions() {
        const search = document.querySelector('.editor-rail__search');
        this.railActionsEl = document.createElement('div');
        this.railActionsEl.className = 'editor-rail__actions';

        const make = (label, title, handler) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = label;
            button.title = title;
            button.addEventListener('click', handler);
            this.railActionsEl.appendChild(button);
        };

        make('New', 'Create a new record', () => this.createItem());
        make('Duplicate', 'Duplicate the selected record', () => this.duplicateItem());
        make('Delete', 'Delete the selected record', () => this.deleteItem());

        search.after(this.railActionsEl);
    }

    buildFindingsBar() {
        this.findingsEl = document.createElement('div');
        this.findingsEl.className = 'editor-findings';
        this.findingsEl.hidden = true;
        this.workspaceEl.parentElement.insertBefore(this.findingsEl, this.workspaceEl);
    }

    showFindings(findings, headline = '') {
        this.findingsEl.innerHTML = '';
        if (!findings || findings.length === 0) {
            this.findingsEl.hidden = true;
            return;
        }

        if (headline) {
            const head = document.createElement('div');
            head.className = 'editor-findings__headline';
            head.textContent = headline;
            this.findingsEl.appendChild(head);
        }

        findings.forEach(finding => {
            const row = document.createElement('div');
            row.className = `editor-findings__row editor-findings__row--${finding.level}`;
            const filePrefix = finding.file ? `[${finding.file}] ` : '';
            row.textContent = `${finding.level === 'error' ? '✕' : '⚠'} ${filePrefix}${finding.path}: ${finding.message}`;
            this.findingsEl.appendChild(row);
        });
        this.findingsEl.hidden = false;
    }

    // ── Routing / rendering ──────────────────────────────────────────────────

    renderRoute(domainId, recordId) {
        const domain = this.store.getDomain(domainId) || this.store.domains[0];
        if (!domain) return;

        const record = this.store.getRecord(domain.id, recordId) || domain.records[0] || null;
        const canonicalHash = `/${encodeURIComponent(domain.id)}${record ? `/${encodeURIComponent(record.id)}` : ''}`;
        if (window.location.hash.replace(/^#/, '') !== canonicalHash) {
            // Absolute URL: replaceState resolves relative URLs against <base href="../">,
            // which would rewrite the address to the project root.
            const url = new URL(window.location.href);
            url.hash = canonicalHash;
            window.history.replaceState(null, '', url);
        }

        const domainChanged = this.currentDomainId !== domain.id;
        this.currentDomainId = domain.id;

        this.tabsEl.querySelectorAll('button').forEach(button => {
            button.classList.toggle('is-active', button.dataset.domainId === domain.id);
        });

        if (domainChanged) {
            this.rail.setDomain(domain, record?.id ?? null);
        } else {
            this.rail.setActive(record?.id ?? null);
        }

        this.railActionsEl.hidden = !domain.supportsItemOps;
        this.showFindings(null);
        this.renderRecord(domain, record);
        this.updateDirtyUI();
    }

    renderRecord(domain, record) {
        if (this.activePreview) {
            this.activePreview.destroy();
            this.activePreview = null;
        }

        this.crumbEl.textContent = record ? `— ${domain.label} / ${record.label}` : `— ${domain.label}`;
        this.workspaceLabelEl.textContent = record ? record.id : '';
        this.statusFileEl.textContent = record?.sourceFile || domain.sourceFile || '';
        this.statusSchemaEl.textContent = domain.schemaVersion != null ? `schema v${domain.schemaVersion}` : '';
        this.inspectorModeEl.textContent = domain.writable ? 'editable' : 'read-only';

        if (!record) {
            this.workspaceEl.innerHTML = '';
            this.inspector.clear(`No records in ${domain.label}.`);
            this.statusEl.textContent = 'Ready';
            return;
        }

        this.inspector.onEdit = (path, value) => this.handleEdit(domain, record, path, value);
        this.inspector.onReset = path => this.handleReset(domain, record, path);
        this.inspector.show(record, { editable: domain.writable });
        this.renderBaseInspector(record);

        const PreviewClass = EditorApp.PREVIEW_CLASSES[domain.previewType] || SummaryPreview;
        this.workspaceEl.innerHTML = '';
        this.activePreview = new PreviewClass(this.workspaceEl, record, {
            domain,
            onNavigate: recordId => this.router.navigate(domain.id, recordId),
            onEdit: domain.writable ? (path, value) => {
                this.handleEdit(domain, record, path, value);
                this.inspector.show(record, { editable: domain.writable });
            } : null
        });
        this.activePreview.mount();

        this.statusEl.textContent = `Viewing ${domain.label} / ${record.id}`;
    }

    refreshPreview(record) {
        if (this.activePreview?.refresh) {
            this.activePreview.refresh(record);
        }
    }

    // ── Compare view ─────────────────────────────────────────────────────────

    toggleCompare() {
        this.compareActive = !this.compareActive;
        this.compareButton.classList.toggle('is-active', this.compareActive);
        this.baseInspectorEl.hidden = !this.compareActive;
        const section = document.getElementById('editor-inspector').closest('.editor-panel');
        section.classList.toggle('editor-inspector--split', this.compareActive);
    }

    renderBaseInspector(record) {
        if (!record || !record.layered || !record.base) {
            this.baseInspector.clear('No base layer for this record.');
            return;
        }
        // Build a synthetic record from the base layer for read-only display
        const baseRecord = { ...record, merged: record.base, layered: false, label: `${record.label} (base)` };
        this.baseInspector.show(baseRecord, { editable: false });
    }

    // ── Editing ──────────────────────────────────────────────────────────────

    handleEdit(domain, record, path, value) {
        const result = this.store.applyEdit(domain, record, path, value);

        if (!record.layered && path.length === 1 && (path[0] === 'id' || path[0] === 'label')) {
            this.rail.renderList();
            this.rail.setActive(record.id);
            this.crumbEl.textContent = `— ${domain.label} / ${record.label}`;
            if (path[0] === 'id') {
                this.workspaceLabelEl.textContent = record.id;
                const url = new URL(window.location.href);
                url.hash = `/${encodeURIComponent(domain.id)}/${encodeURIComponent(record.id)}`;
                window.history.replaceState(null, '', url);
            }
        }

        this.refreshPreview(record);
        this.updateDirtyUI();
        return result;
    }

    handleReset(domain, record, path) {
        this.store.resetOverride(domain, record, path);
        this.inspector.show(record, { editable: domain.writable });
        this.refreshPreview(record);
        this.updateDirtyUI();
    }

    // ── Item operations ──────────────────────────────────────────────────────

    createItem() {
        const domain = this.store.getDomain(this.currentDomainId);
        if (!domain?.supportsItemOps) return;
        const newId = domain.id === 'items'
            ? this.store.addItem(domain)
            : this.store.addMetadataEntry(domain);
        this.rail.setDomain(domain, newId);
        this.router.navigate(domain.id, newId);
        this.updateDirtyUI();
    }

    duplicateItem() {
        const domain = this.store.getDomain(this.currentDomainId);
        if (!domain?.supportsItemOps) return;
        const { recordId } = this.router.parse();
        const newId = domain.id === 'items'
            ? this.store.duplicateItem(domain, recordId)
            : this.store.duplicateMetadataEntry(domain, recordId);
        if (!newId) return;
        this.rail.setDomain(domain, newId);
        this.router.navigate(domain.id, newId);
        this.updateDirtyUI();
    }

    deleteItem() {
        const domain = this.store.getDomain(this.currentDomainId);
        if (!domain?.supportsItemOps) return;
        const { recordId } = this.router.parse();
        const record = this.store.getRecord(domain.id, recordId);
        if (!record || record.id === '_catalog') return;
        if (!window.confirm(`Delete "${record.label}"? This is staged until you Save.`)) return;
        if (domain.id === 'items') {
            this.store.deleteItem(domain, recordId);
        } else {
            this.store.deleteMetadataEntry(domain, recordId);
        }
        this.rail.setDomain(domain, null);
        this.router.navigate(domain.id);
        this.updateDirtyUI();
    }

    // ── Persistence ──────────────────────────────────────────────────────────

    async validateCurrentDomain() {
        const domain = this.store.getDomain(this.currentDomainId);
        if (!domain) return;

        const fileIds = this.store.domainFileIds(domain);
        if (fileIds.length === 0) return;

        this.validateButton.disabled = true;
        this.statusEl.textContent = 'Validating...';

        const allFindings = [];
        for (const fileId of fileIds) {
            const doc = this.store.documents.get(fileId);
            if (!doc) continue;
            try {
                const result = await EditorApi.validate(fileId, doc.content);
                (result.findings || []).forEach(f => allFindings.push({ ...f, file: fileId }));
            } catch (error) {
                allFindings.push({ level: 'error', path: fileId, message: error.message });
            }
        }

        this.validateButton.disabled = false;

        if (allFindings.length === 0) {
            this.showFindings(null);
            this.statusEl.textContent = 'Validation passed — no issues found.';
        } else {
            const errors = allFindings.filter(f => f.level === 'error').length;
            const warnings = allFindings.filter(f => f.level === 'warning').length;
            this.showFindings(allFindings, `Validation: ${errors} error(s), ${warnings} warning(s)`);
            this.statusEl.textContent = `Validation found ${allFindings.length} issue(s).`;
        }
    }

    async saveCurrentDomain() {
        const domain = this.store.getDomain(this.currentDomainId);
        if (!domain) return;

        const dirtyDocs = this.store.dirtyDocuments(domain);
        if (dirtyDocs.length === 0) return;

        this.saveButton.disabled = true;
        this.statusEl.textContent = 'Saving...';
        const warnings = [];

        for (const doc of dirtyDocs) {
            try {
                const result = await this.saveDocument(doc);
                if (result === null) {
                    this.statusEl.textContent = 'Save cancelled.';
                    this.updateDirtyUI();
                    return;
                }
                warnings.push(...(result.warnings || []));
            } catch (error) {
                if (error instanceof EditorApiError && error.code === 'validation_failed') {
                    this.showFindings(error.extra.findings, `Validation failed for ${doc.path} — nothing was saved for this file.`);
                    this.statusEl.textContent = `Save blocked: ${doc.path} failed validation.`;
                } else {
                    this.showFindings(
                        [{ level: 'error', path: doc.path, message: error.message }],
                        'Save failed.'
                    );
                    this.statusEl.textContent = `Save failed: ${error.message}`;
                }
                this.updateDirtyUI();
                return;
            }
        }

        this.showFindings(warnings, warnings.length > 0 ? 'Saved with warnings:' : '');
        this.statusEl.textContent = `Saved ${dirtyDocs.length} file(s).`;
        this.updateDirtyUI();
    }

    // Returns the API result, or null if the user declined the conflict overwrite.
    async saveDocument(doc) {
        try {
            const result = await EditorApi.save(doc.fileId, doc.content, doc.mtime);
            doc.markSaved(result.mtime);
            return result;
        } catch (error) {
            if (error instanceof EditorApiError && error.code === 'conflict') {
                const overwrite = window.confirm(
                    `${doc.path} changed on disk since it was loaded.\n\nOverwrite the on-disk version? (A backup of it will be kept.)`
                );
                if (!overwrite) return null;
                const result = await EditorApi.save(doc.fileId, doc.content, doc.mtime, true);
                doc.markSaved(result.mtime);
                return result;
            }
            throw error;
        }
    }

    revertCurrentDomain() {
        const domain = this.store.getDomain(this.currentDomainId);
        if (!domain) return;

        const dirtyDocs = this.store.dirtyDocuments(domain);
        if (dirtyDocs.length === 0) return;
        if (!window.confirm(`Discard unsaved changes to ${dirtyDocs.map(doc => doc.path).join(', ')}?`)) return;

        dirtyDocs.forEach(doc => doc.revert());
        this.store.rebuildDomain(domain.id);
        this.rail.setDomain(domain, null);
        this.showFindings(null);
        this.router.emit();
        this.updateDirtyUI();
    }

    updateDirtyUI() {
        this.tabsEl.querySelectorAll('button').forEach(button => {
            const domain = this.store.getDomain(button.dataset.domainId);
            button.classList.toggle('is-dirty', domain ? this.store.isDomainDirty(domain) : false);
        });

        const domain = this.store.getDomain(this.currentDomainId);
        const dirtyDocs = domain ? this.store.dirtyDocuments(domain) : [];
        this.saveButton.disabled = dirtyDocs.length === 0;
        this.revertButton.disabled = dirtyDocs.length === 0;

        if (dirtyDocs.length > 0) {
            this.statusEl.textContent = `● Unsaved changes in ${dirtyDocs.map(doc => doc.path).join(', ')}`;
        }
    }
}

window.addEventListener('DOMContentLoaded', () => {
    new EditorApp().init();
});
