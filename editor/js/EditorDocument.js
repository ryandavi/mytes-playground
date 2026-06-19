// One writable canonical file: working copy + saved snapshot for dirty
// tracking and revert, plus path-based value access for the inspector.
// Paths are arrays of keys/indices, e.g. ['items', 3, 'visual', 'sprite', 'col'].
class EditorDocument {
    constructor(fileId, payload) {
        this.fileId = fileId;
        this.path = payload.path;
        this.mtime = payload.mtime;
        this.content = Utility.deepClone(payload.content);
        this.savedContent = Utility.deepClone(payload.content);
    }

    get isDirty() {
        return !EditorDocument.deepEqual(this.content, this.savedContent);
    }

    getAt(path) {
        let node = this.content;
        for (const key of path) {
            if (node == null || typeof node !== 'object') return undefined;
            node = node[key];
        }
        return node;
    }

    setAt(path, value) {
        if (path.length === 0) {
            this.content = value;
            return;
        }
        let node = this.content;
        for (let i = 0; i < path.length - 1; i++) {
            const key = path[i];
            if (node[key] == null || typeof node[key] !== 'object') {
                node[key] = typeof path[i + 1] === 'number' ? [] : {};
            }
            node = node[key];
        }
        node[path.at(-1)] = value;
    }

    // Deletes the value and prunes parent objects left empty, so removing an
    // override restores inheritance without leaving hollow {} shells behind.
    deleteAt(path) {
        if (path.length === 0) return;

        const parents = [];
        let node = this.content;
        for (let i = 0; i < path.length - 1; i++) {
            if (node == null || typeof node !== 'object') return;
            parents.push(node);
            node = node[path[i]];
        }
        if (node == null || typeof node !== 'object') return;

        if (Array.isArray(node)) {
            node.splice(path.at(-1), 1);
        } else {
            delete node[path.at(-1)];
        }

        for (let i = parents.length - 1; i >= 0; i--) {
            const parent = parents[i];
            const child = parent[path[i]];
            if (Utility.isPlainObject(child) && Object.keys(child).length === 0) {
                delete parent[path[i]];
            } else {
                break;
            }
        }
    }

    revert() {
        this.content = Utility.deepClone(this.savedContent);
    }

    markSaved(mtime) {
        this.savedContent = Utility.deepClone(this.content);
        this.mtime = mtime;
    }

    static deepEqual(a, b) {
        if (a === b) return true;
        if (Array.isArray(a) && Array.isArray(b)) {
            return a.length === b.length && a.every((entry, i) => EditorDocument.deepEqual(entry, b[i]));
        }
        if (Utility.isPlainObject(a) && Utility.isPlainObject(b)) {
            const keysA = Object.keys(a);
            const keysB = Object.keys(b);
            return keysA.length === keysB.length &&
                keysA.every(key => EditorDocument.deepEqual(a[key], b[key]));
        }
        return false;
    }

    static getAtPath(root, path) {
        let node = root;
        for (const key of path) {
            if (node == null || typeof node !== 'object') return undefined;
            node = node[key];
        }
        return node;
    }
}
