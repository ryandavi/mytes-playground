class WallSurfaceAtomStore extends BuildRecordStore {
    keyOf(record) {
        return BuildKeys.atom(record?.x, record?.y, record?.face, record?.half);
    }

    normalize(record, key) {
        const address = record && Number.isInteger(record.x)
            ? { x: record.x, y: record.y, face: record.face, half: record.half }
            : BuildKeys.parseAtom(key);
        if (!record?.finishId) throw new Error(`Wall atom ${key} requires an explicit finishId`);
        BuildKeys.atom(address.x, address.y, address.face, address.half);
        return { ...address, finishId: String(record.finishId) };
    }

    atomsOfCell(x, y) {
        const prefix = `${BuildKeys.cell(x, y)}/`;
        return this.entries().filter(([key]) => key.startsWith(prefix)).map(([, atom]) => atom);
    }

    deleteCell(x, y) {
        let changed = false;
        for (const atom of this.atomsOfCell(x, y)) changed = this.delete(this.keyOf(atom)) || changed;
        return changed;
    }

    copyCell(fromX, fromY, toX, toY) {
        for (const atom of this.atomsOfCell(fromX, fromY)) {
            this.set(this.keyOf({ ...atom, x: toX, y: toY }), { ...atom, x: toX, y: toY });
        }
    }

    translateCells(cellKeys, dx, dy) {
        const selected = new Set(cellKeys);
        const moving = this.entries().filter(([, atom]) => selected.has(BuildKeys.cell(atom.x, atom.y)));
        for (const [key] of moving) this.delete(key);
        for (const [, atom] of moving) {
            const moved = { ...atom, x: atom.x + dx, y: atom.y + dy };
            this.set(this.keyOf(moved), moved);
        }
        return moving.length;
    }
}
