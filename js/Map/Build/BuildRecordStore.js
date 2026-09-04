class BuildRecordStore {
    constructor(records = []) {
        this.records = new Map();
        this.replace(records);
    }

    get size() { return this.records.size; }

    has(key) { return this.records.has(String(key)); }

    get(key) {
        const value = this.records.get(String(key));
        return value === undefined ? null : StoreDelta.clone(value);
    }

    keys() { return this.records.keys(); }

    values() { return [...this.records.values()].map(StoreDelta.clone); }

    entries() {
        return [...this.records.entries()].map(([key, value]) => [key, StoreDelta.clone(value)]);
    }

    set(key, record) {
        const normalizedKey = String(key);
        const normalized = this.normalize(record, normalizedKey);
        this.records.set(normalizedKey, StoreDelta.clone(normalized));
        return this.get(normalizedKey);
    }

    delete(key) { return this.records.delete(String(key)); }

    clear() { this.records.clear(); }

    replace(records) {
        this.clear();
        const entries = records instanceof Map
            ? records.entries()
            : Array.isArray(records)
                ? records.map(record => [this.keyOf(record), record])
                : Object.entries(records || {});
        for (const [key, record] of entries) this.set(key, record);
        return this;
    }

    snapshot() {
        return new Map(this.entries().sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
    }

    toObject() { return Object.fromEntries(this.entries()); }

    applyDelta(delta) {
        this.replace(StoreDelta.apply(this.records, delta));
        return this;
    }

    diffFrom(authored) { return StoreDelta.diff(authored, this.records); }

    keyOf(record) { return String(record?.id); }

    normalize(record) { return StoreDelta.clone(record || {}); }
}
