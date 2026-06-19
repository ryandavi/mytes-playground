// Loads all canonical content domains and owns the writable working copies.
// Every file loads through the PHP API (editor/api/load.php) so the store has
// the mtime needed for save-conflict detection. Merging reuses
// MyteDefinitionRegistry.deepMerge so editor merge semantics can never drift
// from runtime merge semantics.
//
// Phase 2 writable domains: mytes (base + species overrides) and items.
// Records carry { fileId, basePath } mapping them into their document, and
// layered records edit sparsely: setting a field back to its inherited base
// value removes the override instead of serializing a duplicate.
class EditorStore {
    constructor() {
        this.domains = [];
        this.domainsById = new Map();
        this.documents = new Map();
    }

    static mergeLayers(baseValue, overrideValue) {
        return MyteDefinitionRegistry.deepMerge(baseValue, overrideValue);
    }

    getDomain(domainId) {
        return this.domainsById.get(domainId) || null;
    }

    getRecord(domainId, recordId) {
        const domain = this.getDomain(domainId);
        if (!domain) return null;
        return domain.records.find(record => record.id === recordId) || null;
    }

    async loadDocument(fileId) {
        const payload = await EditorApi.load(fileId);
        const doc = new EditorDocument(fileId, payload);
        this.documents.set(fileId, doc);
        return doc;
    }

    async loadAll() {
        const [mytes, mapObjects, items, actions, buffs, zones, environmentPresets] = await Promise.all([
            this.loadMytes(),
            this.loadMapObjects(),
            this.loadItems(),
            this.loadMetadataList('actions', 'Actions', 'actions'),
            this.loadMetadataList('buffs', 'Buffs', 'buffs'),
            this.loadMetadataList('zones', 'Zones', 'zones'),
            this.loadMetadataList('environment-presets', 'Environment', 'presets')
        ]);

        this.domains = [mytes, mapObjects, items, actions, buffs, zones, environmentPresets];
        this.domainsById = new Map(this.domains.map(domain => [domain.id, domain]));
        return this.domains;
    }

    // ── Mytes ────────────────────────────────────────────────────────────────

    async loadMytes() {
        const [catalogDoc, baseDoc] = await Promise.all([
            this.loadDocument('mytes.species-catalog'),
            this.loadDocument('mytes.base')
        ]);

        const speciesEntries = (catalogDoc.content.species || [])
            .filter(entry => entry.enabled !== false)
            .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id.localeCompare(b.id));

        await Promise.all(speciesEntries.map(entry => this.loadDocument(`mytes.species.${entry.id}`)));

        const domain = {
            id: 'mytes',
            label: 'Mytes',
            previewType: 'myte',
            writable: true,
            schemaVersion: baseDoc.content.schemaVersion ?? null,
            sourceFile: 'data/mytes/*.json',
            speciesEntries,
            records: []
        };
        this.rebuildMyteRecords(domain);
        return domain;
    }

    rebuildMyteRecords(domain) {
        const baseDoc = this.documents.get('mytes.base');

        const records = [{
            id: '_base',
            label: 'Base Myte',
            hint: 'base',
            fileId: 'mytes.base',
            basePath: [],
            base: null,
            override: null,
            merged: baseDoc.content,
            layered: false,
            sourceFile: baseDoc.path
        }];

        domain.speciesEntries.forEach(entry => {
            const fileId = `mytes.species.${entry.id}`;
            const doc = this.documents.get(fileId);
            if (!doc) return;
            records.push({
                id: entry.id,
                label: entry.label || entry.id,
                hint: entry.essential ? 'essential' : '',
                fileId,
                basePath: [],
                base: baseDoc.content,
                override: doc.content,
                merged: EditorStore.mergeLayers(baseDoc.content, doc.content),
                layered: true,
                sourceFile: doc.path
            });
        });

        domain.records = records;
    }

    // ── Map objects (read-only until Phase 3) ────────────────────────────────

    async loadMapObjects() {
        const [baseDoc, typesDoc] = await Promise.all([
            this.loadDocument('map-objects.base'),
            this.loadDocument('map-objects.types')
        ]);

        const baseLayer = { ...baseDoc.content };
        delete baseLayer.schemaVersion;

        const records = Object.entries(typesDoc.content)
            .filter(([key]) => key !== 'schemaVersion')
            .map(([typeId, typeConfig]) => ({
                id: typeId,
                label: typeId,
                hint: typeConfig.category || '',
                fileId: 'map-objects.types',
                basePath: [typeId],
                base: baseLayer,
                override: typeConfig,
                merged: EditorStore.mergeLayers(baseLayer, typeConfig),
                layered: true,
                sourceFile: typesDoc.path
            }));

        return {
            id: 'map-objects',
            label: 'Map Objects',
            previewType: 'mapObject',
            writable: false,
            schemaVersion: typesDoc.content.schemaVersion ?? null,
            sourceFile: typesDoc.path,
            records
        };
    }

    // ── Items ────────────────────────────────────────────────────────────────

    async loadItems() {
        const doc = await this.loadDocument('items');

        const domain = {
            id: 'items',
            label: 'Items',
            previewType: 'item',
            writable: true,
            supportsItemOps: true,
            schemaVersion: doc.content.schemaVersion ?? null,
            sourceFile: doc.path,
            meta: { visual: doc.content.visual || {} },
            records: []
        };
        this.rebuildItemRecords(domain);
        return domain;
    }

    rebuildItemRecords(domain) {
        const doc = this.documents.get('items');
        domain.meta = { visual: doc.content.visual || {} };

        const records = [{
            id: '_catalog',
            label: 'Atlas / Catalog',
            hint: 'shared',
            fileId: 'items',
            basePath: ['visual'],
            base: null,
            override: null,
            merged: doc.content.visual,
            layered: false,
            sourceFile: doc.path
        }];

        (doc.content.items || []).forEach((item, index) => {
            records.push({
                id: item.id,
                label: item.label || item.id,
                hint: item.type || '',
                fileId: 'items',
                basePath: ['items', index],
                base: null,
                override: null,
                merged: item,
                layered: false,
                sourceFile: doc.path
            });
        });

        domain.records = records;
    }

    addItem(domain) {
        const doc = this.documents.get('items');
        const id = this.uniqueItemId(doc, 'new_item');
        doc.content.items.push({
            id,
            label: 'New Item',
            type: 'misc',
            capabilities: { droppable: true },
            visual: { sprite: { col: 0, row: 0 } },
            description: ''
        });
        this.rebuildItemRecords(domain);
        return id;
    }

    duplicateItem(domain, recordId) {
        const doc = this.documents.get('items');
        const index = doc.content.items.findIndex(item => item.id === recordId);
        if (index === -1) return null;

        const copy = Utility.deepClone(doc.content.items[index]);
        copy.id = this.uniqueItemId(doc, `${copy.id}_copy`);
        delete copy.aliases;
        doc.content.items.splice(index + 1, 0, copy);
        this.rebuildItemRecords(domain);
        return copy.id;
    }

    deleteItem(domain, recordId) {
        const doc = this.documents.get('items');
        const index = doc.content.items.findIndex(item => item.id === recordId);
        if (index === -1) return;
        doc.content.items.splice(index, 1);
        this.rebuildItemRecords(domain);
    }

    uniqueItemId(doc, candidate) {
        const taken = new Set();
        (doc.content.items || []).forEach(item => {
            taken.add(item.id);
            (item.aliases || []).forEach(alias => taken.add(alias));
        });
        if (!taken.has(candidate)) return candidate;
        let counter = 2;
        while (taken.has(`${candidate}_${counter}`)) counter++;
        return `${candidate}_${counter}`;
    }

    // ── Read-only metadata lists ─────────────────────────────────────────────

    async loadMetadataList(fileId, label, listKey) {
        const doc = await this.loadDocument(fileId);
        const listValue = doc.content[listKey];

        // Some catalogs store the list as an array, others as an object keyed
        // by id (e.g. environment-presets); normalize both.
        const entries = Array.isArray(listValue)
            ? listValue.map((entry, index) => ({ key: entry?.id || String(index), entry }))
            : Object.entries(listValue || {}).map(([key, entry]) => ({ key: entry?.id || key, entry }));

        const records = entries.map(({ key, entry }) => ({
            id: key,
            label: entry?.label || key,
            hint: entry?.category || entry?.kind || '',
            fileId,
            basePath: null,
            base: null,
            override: null,
            merged: entry,
            layered: false,
            sourceFile: doc.path
        }));

        return {
            id: fileId,
            label,
            previewType: 'summary',
            writable: false,
            schemaVersion: doc.content.schemaVersion ?? null,
            sourceFile: doc.path,
            records
        };
    }

    // ── Editing ──────────────────────────────────────────────────────────────

    applyEdit(domain, record, path, value) {
        const doc = this.documents.get(record.fileId);
        const fullPath = [...record.basePath, ...path];

        if (record.layered) {
            const baseValue = EditorDocument.getAtPath(record.base, path);
            if (baseValue !== undefined && EditorDocument.deepEqual(value, baseValue)) {
                doc.deleteAt(fullPath);
            } else {
                doc.setAt(fullPath, value);
            }
            this.recomputeLayeredRecords(domain);
        } else {
            doc.setAt(fullPath, value);
            this.syncRecordIdentity(domain, record, path, value);
        }

        return {
            source: this.sourceAt(record, path),
            effectiveValue: EditorDocument.getAtPath(
                this.getRecord(domain.id, record.id)?.merged ?? record.merged,
                path
            )
        };
    }

    resetOverride(domain, record, path) {
        const doc = this.documents.get(record.fileId);
        doc.deleteAt([...record.basePath, ...path]);
        this.recomputeLayeredRecords(domain);
    }

    sourceAt(record, path) {
        if (!record.layered) return null;
        return EditorDocument.getAtPath(record.override, path) !== undefined ? 'override' : 'base';
    }

    // Editing the base myte changes the inherited layer of every species, so
    // merged views recompute domain-wide.
    recomputeLayeredRecords(domain) {
        if (domain.id !== 'mytes') return;
        domain.records.forEach(record => {
            if (record.layered) {
                record.merged = EditorStore.mergeLayers(record.base, record.override);
            }
        });
    }

    syncRecordIdentity(domain, record, path, value) {
        if (path.length !== 1) return;
        if (path[0] === 'id' && typeof value === 'string' && record.basePath?.[0] === 'items') {
            record.id = value;
        }
        if (path[0] === 'label' && typeof value === 'string') {
            record.label = value;
        }
    }

    // After a revert the documents hold fresh content objects, so records must
    // re-derive their layer references.
    rebuildDomain(domainId) {
        const domain = this.getDomain(domainId);
        if (!domain) return;
        if (domain.id === 'mytes') this.rebuildMyteRecords(domain);
        if (domain.id === 'items') this.rebuildItemRecords(domain);
    }

    // ── Dirty tracking / persistence ─────────────────────────────────────────

    domainFileIds(domain) {
        return [...new Set(domain.records.map(record => record.fileId).filter(Boolean))];
    }

    dirtyDocuments(domain = null) {
        const fileIds = domain ? this.domainFileIds(domain) : [...this.documents.keys()];
        return fileIds
            .map(fileId => this.documents.get(fileId))
            .filter(doc => doc && doc.isDirty);
    }

    isDomainDirty(domain) {
        return this.dirtyDocuments(domain).length > 0;
    }
}
