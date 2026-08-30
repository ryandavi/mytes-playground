class SelectionManager extends UIComponent {
    constructor(parent) {
        super(parent);
        this.selectedObject = null;
        this.selectedObjects = [];
    }


    setSelected(obj) {
        this.setSelection(obj ? [obj] : []);
    }

    setSelection(objects = []) {
        const next = [...new Set(objects.filter(Boolean))];
        if (next.length === this.selectedObjects.length && next.every((item, index) => item === this.selectedObjects[index])) return;

        const deselect = (object) => {
            if (!object) return;

            if (object instanceof Myte) {
                object.duplicate?.classList?.remove('is-selected');
                object.element?.classList?.remove('is-selected');
            } else if (object instanceof MapObject) {
                if (object.element) object.element.classList.remove('is-selected');
            } else if (object instanceof DroppedMapItem) {
                if (object.element) object.element.classList.remove('is-selected');
            } else if (object instanceof Element) {
                object.classList.remove('is-selected');
            }
        };

        const select = (object) => {
            if (!object) return;

            if (object instanceof Myte) {
                const myteElement = object.isActive ? object.duplicate : object.element;
                myteElement?.classList?.add('is-selected');
            } else if (object instanceof MapObject) {
                if (object.element) object.element.classList.add('is-selected');
            } else if (object instanceof DroppedMapItem) {
                if (object.element) object.element.classList.add('is-selected');
            } else if (object instanceof Element) {
                object.classList.add('is-selected');
            }
        };

        this.selectedObjects.forEach(deselect);
        this.selectedObjects = next;
        this.selectedObjects.forEach(select);
        this.selectedObject = next.length === 1 ? next[0] : null;

        // Notify parent UI of selection change
        this.parent.onSelectionChanged(this.selectedObject);
    }

    getSelectedObject() {
        return this.selectedObject;
    }

    getSelectedObjects() {
        return [...this.selectedObjects];
    }

    dispose() {
        this.setSelected(null);
        this.selectedObject = null;
        this.selectedObjects = [];
    }
}
