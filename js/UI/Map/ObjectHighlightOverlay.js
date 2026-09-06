/**
 * The selection outline for the one map object actually selected in Build
 * mode — a piece of furniture, a fence post, a dropped item.
 *
 * `SelectionManager` also toggles an `is-selected` class straight onto the
 * object's own element, which is enough when nothing else in its art layer
 * happens to paint over it, but nothing stops another object's sprite from
 * doing exactly that (see GameMap#frontLayer). This draws a second, reliable
 * outline in the front layer instead of replacing that one — belt and
 * suspenders, and zero risk to whatever else `is-selected` hooks into.
 *
 * Positioned from the object's own posX/posY/size — the same numbers its own
 * element is placed with — rather than measuring the DOM, so a drag in
 * progress keeps the box glued to the object for free: `sync()` just re-reads
 * those fields, no camera/zoom math involved since this lives in the same
 * map-pixel coordinate space the object's own element does.
 */
class ObjectHighlightOverlay {
    constructor(gameMap) {
        this.gameMap = gameMap;
        this.element = null;
        this.target = null;
    }

    set(object) {
        if (this.target === object) return;
        this.target = object || null;
        if (!this.target) {
            this.element?.remove();
            this.element = null;
            return;
        }
        const layer = this.gameMap?.frontLayer;
        if (!layer) return;
        if (!this.element?.isConnected) {
            const el = document.createElement('div');
            el.className = 'build-object-highlight ignore';
            el.setAttribute('aria-hidden', 'true');
            el.style.position = 'absolute';
            layer.appendChild(el);
            this.element = el;
        }
        this.sync();
    }

    // Cheap enough to call every Build-mode tick (see BuildModeUI#update):
    // one element, no measurement, just copying the object's own numbers.
    sync() {
        if (!this.target || !this.element) return;
        const size = this.target.size || {};
        Object.assign(this.element.style, {
            left: `${this.target.posX ?? 0}px`,
            top: `${this.target.posY ?? 0}px`,
            width: `${size.width || 0}px`,
            height: `${size.height || 0}px`
        });
    }

    dispose() {
        this.element?.remove();
        this.element = null;
        this.target = null;
        this.gameMap = null;
    }
}
