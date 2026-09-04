class StoreDelta {
    static empty() {
        return { set: {}, removed: [] };
    }

    static diff(authored, current) {
        const before = StoreDelta.toMap(authored);
        const after = StoreDelta.toMap(current);
        const set = {};
        const removed = [];
        for (const key of [...before.keys()].sort()) {
            if (!after.has(key)) removed.push(key);
        }
        for (const key of [...after.keys()].sort()) {
            if (!before.has(key) || !StoreDelta.equal(before.get(key), after.get(key))) {
                set[key] = StoreDelta.clone(after.get(key));
            }
        }
        return { set, removed };
    }

    static apply(base, delta = StoreDelta.empty()) {
        const result = new Map([...StoreDelta.toMap(base)].map(([key, value]) => [key, StoreDelta.clone(value)]));
        for (const key of delta.removed || []) result.delete(String(key));
        for (const [key, value] of Object.entries(delta.set || {})) result.set(key, StoreDelta.clone(value));
        return new Map([...result].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
    }

    static invert(before, delta) {
        const source = StoreDelta.toMap(before);
        const inverse = StoreDelta.empty();
        for (const key of Object.keys(delta?.set || {}).sort()) {
            if (source.has(key)) inverse.set[key] = StoreDelta.clone(source.get(key));
            else inverse.removed.push(key);
        }
        for (const key of [...(delta?.removed || [])].map(String).sort()) {
            if (source.has(key)) inverse.set[key] = StoreDelta.clone(source.get(key));
        }
        return inverse;
    }

    static isEmpty(delta) {
        return Object.keys(delta?.set || {}).length === 0 && (delta?.removed || []).length === 0;
    }

    static toMap(value) {
        if (value instanceof Map) return value;
        if (value?.snapshot instanceof Function) return value.snapshot();
        return new Map(Object.entries(value || {}));
    }

    static equal(a, b) {
        return StoreDelta.stableStringify(a) === StoreDelta.stableStringify(b);
    }

    static stableStringify(value) {
        if (Array.isArray(value)) return `[${value.map(entry => StoreDelta.stableStringify(entry)).join(',')}]`;
        if (value && typeof value === 'object') {
            return `{${Object.keys(value).sort().map(key =>
                `${JSON.stringify(key)}:${StoreDelta.stableStringify(value[key])}`
            ).join(',')}}`;
        }
        return JSON.stringify(value);
    }

    static clone(value) {
        if (value === undefined) return undefined;
        return JSON.parse(JSON.stringify(value));
    }
}
