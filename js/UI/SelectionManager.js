class SelectionManager extends UIComponent {
    constructor(parent) {
        super(parent);
        this.selectedObject = null;
    }


    setSelected(obj) {
        const deselect = (object) => {
            if (!object) return;

            if (object instanceof Myte) {
                if (object.duplicate) object.duplicate.classList.remove('is-selected');
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
                if (object.duplicate) object.duplicate.classList.add('is-selected');
            } else if (object instanceof MapObject) {
                if (object.element) object.element.classList.add('is-selected');
            } else if (object instanceof DroppedMapItem) {
                if (object.element) object.element.classList.add('is-selected');
            } else if (object instanceof Element) {
                object.classList.add('is-selected');
            }
        };

        // Deselect current object
        if (this.selectedObject) deselect(this.selectedObject);

        // Toggle selection
        this.selectedObject = this.selectedObject === obj ? null : obj;

        // Select new object
        if (this.selectedObject) select(this.selectedObject);

        // Notify parent UI of selection change
        this.parent.onSelectionChanged(this.selectedObject);
    }

    getSelectedObject() {
        return this.selectedObject;
    }

    dispose() {
        this.setSelected(null);
        this.selectedObject = null;
    }
}
