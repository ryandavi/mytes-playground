class BuildSelection {
    static KINDS = Object.freeze(['building', 'room', 'wall', 'atom', 'object']);

    constructor() {
        this.value = null;
        this.listeners = new Set();
    }

    get current() {
        return this.value ? StoreDelta.clone(this.value) : null;
    }

    set(selection) {
        if (!selection) return this.clear();
        if (!BuildSelection.KINDS.includes(selection.kind) || selection.id == null) {
            throw new Error('Invalid build selection');
        }
        const next = StoreDelta.clone(selection);
        if (JSON.stringify(next) === JSON.stringify(this.value)) return false;
        this.value = next;
        this.emit();
        return true;
    }

    clear() {
        if (!this.value) return false;
        this.value = null;
        this.emit();
        return true;
    }

    subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    emit() {
        const value = this.current;
        for (const listener of this.listeners) listener(value);
    }
}
