/**
 * MapObjectSelectDragManager — central routing for select-mode drag gestures.
 *
 * Instead of installing three document-level listeners per draggable map object
 * (which fans every pointer event through N per-object hit checks), this manager
 * installs ONE set of document listeners and routes events to the registered
 * handler for the specific element that was hit.
 *
 * MapObject._initSelectDragHandler() calls register() instead of adding its own
 * document listeners. Cleanup (from MapObject.remove()) calls the returned
 * unregister function.
 */
class MapObjectSelectDragManager {
    static instance = null;

    static getInstance() {
        if (!MapObjectSelectDragManager.instance) {
            MapObjectSelectDragManager.instance = new MapObjectSelectDragManager();
        }
        return MapObjectSelectDragManager.instance;
    }

    constructor() {
        // element → { onDown, onMove, onUp }
        this._handlers = new Map();
        // The handler that owns the current press gesture
        this._activeEntry = null;

        this._onMouseDown = this._onMouseDown.bind(this);
        this._onMouseMove = this._onMouseMove.bind(this);
        this._onMouseUp = this._onMouseUp.bind(this);

        document.addEventListener('mousedown', this._onMouseDown);
        document.addEventListener('mousemove', this._onMouseMove);
        document.addEventListener('mouseup', this._onMouseUp);
    }

    /**
     * Register drag handlers for a map-object element.
     * @param {Element} element  The root .map-object element
     * @param {Function} onDown
     * @param {Function} onMove
     * @param {Function} onUp
     * @returns {Function}  Call to unregister
     */
    register(element, onDown, onMove, onUp) {
        this._handlers.set(element, { onDown, onMove, onUp });
        return () => this.unregister(element);
    }

    unregister(element) {
        this._handlers.delete(element);
        if (this._activeEntry?.element === element) {
            this._activeEntry = null;
        }
    }

    _onMouseDown(event) {
        const targetEl = event.target instanceof Element
            ? event.target.closest('.map-object')
            : null;
        if (!targetEl) return;

        const entry = this._handlers.get(targetEl);
        if (!entry) return;

        this._activeEntry = { element: targetEl, ...entry };
        entry.onDown(event);
    }

    _onMouseMove(event) {
        // Only the object that captured the press gets move events.
        this._activeEntry?.onMove(event);
    }

    _onMouseUp(event) {
        if (this._activeEntry) {
            this._activeEntry.onUp(event);
            this._activeEntry = null;
        }
    }

    dispose() {
        document.removeEventListener('mousedown', this._onMouseDown);
        document.removeEventListener('mousemove', this._onMouseMove);
        document.removeEventListener('mouseup', this._onMouseUp);
        this._handlers.clear();
        this._activeEntry = null;
        MapObjectSelectDragManager.instance = null;
    }
}
