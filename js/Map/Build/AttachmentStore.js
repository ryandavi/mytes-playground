class AttachmentStore extends BuildRecordStore {
    keyOf(record) {
        if (record?.id == null) throw new Error('Build attachments require an id');
        return String(record.id);
    }

    normalize(record, key) {
        const normalized = StoreDelta.clone(record || {});
        normalized.id = String(record?.id ?? key);
        return normalized;
    }

    translateCells(cellKeys, dx, dy) {
        const selected = new Set(cellKeys || []);
        const inside = point => Array.isArray(point) && selected.has(BuildKeys.cell(point[0], point[1]));
        let changed = 0;
        for (const [key, record] of this.entries()) {
            const footprint = Array.isArray(record.cells) ? record.cells : null;
            const from = footprint ? null : record.cells?.from;
            const to = footprint ? null : record.cells?.to || from;
            const moves = footprint
                ? footprint.length > 0 && footprint.every(inside)
                : inside(from) && inside(to);
            if (!moves) continue;
            const cells = footprint
                ? footprint.map(([x, y]) => [x + dx, y + dy])
                : { from: [from[0] + dx, from[1] + dy], to: [to[0] + dx, to[1] + dy] };
            this.set(key, { ...record, cells });
            changed++;
        }
        return changed;
    }
}
