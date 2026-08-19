// ─────────────────────────────────────────────────────────────────────────────
// MyteHomeSlot — where one myte lives, as a thing rather than as a habit.
//
// A myte owns exactly ONE slot. It stands on exactly ONE map (`mapId`) and does
// not follow the myte around; walking to another map leaves the slot behind,
// and moving house is an explicit `moveTo`. Every other map the player visits
// simply has no slot on it, which is the whole of the rule.
//
// That rule was always true, but it was not written down anywhere: the answer
// lived in `myte.homeMapId`, `myte.homeSlotPosition`, the wrapper element's
// inline `left/top`, its parent node, and — on save — a `.myte-home-label .name`
// DOM query. Five places, no owner, and code that needed the answer picked
// whichever one it happened to know about. WallBuilder picked the one that lies
// off the home map and refused to build walls on maps that have no slots at all.
//
// So this class is the owner. The DOM wrapper is its *presentation*: the slot
// tells the element where to be, never the reverse. Nothing else writes the
// wrapper's position.
//
// It is deliberately not a MapObject today. The wrapper is also the myte's
// resting body — sprite, name label, dialogue, battery — so promoting it would
// mean moving Myte's whole idle presentation into the map-object pipeline. What
// this does give is the seam to do that behind: a slot already knows its map,
// its rect and its identity, which is everything a map object would be built
// from.
// ─────────────────────────────────────────────────────────────────────────────
class MyteHomeSlot {
    /**
     * @param {object} owner   the Myte this slot belongs to
     * @param {object} options { id, label, mapId, position }
     */
    constructor(owner, { id = null, label = null, mapId = null, position = null } = {}) {
        this.owner = owner;
        this.id = id || `myte-slot-${owner?.id ?? 'unknown'}`;
        this.label = label || `${owner?.name ?? 'Myte'}'s Slot`;
        this.mapId = mapId || SiteConfig.world.defaultMap;
        // null means "no decision made" — the map's spawn layout gets to place
        // it on every load. A position is a decision, and decisions persist.
        this.position = MyteHomeSlot.normalizePosition(position);
        this._cachedHomePosition = null;
    }

    static normalizePosition(position) {
        if (!position) return null;
        const x = Number(position.x);
        const y = Number(position.y);
        return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
    }

    /** The element that draws this slot, or null before the myte has rendered. */
    get element() {
        return this.owner?.dropTarget || this.owner?.elements?.wrapper || null;
    }

    /**
     * The inner marker, which is the slot's actual footprint — the wrapper is
     * sized by the myte standing in it, the marker is the spot on the floor.
     */
    get footprintElement() {
        const element = this.element;
        return element?.querySelector?.('.myte-home-slot') || element || this.owner?.element || null;
    }

    /** Is this slot standing on `mapId`? The single answer to that question. */
    isOnMap(mapId) {
        if (!mapId || !this.mapId) return true;
        return String(this.mapId) === String(mapId);
    }

    /** Is it standing on the map currently being played? */
    get isOnCurrentMap() {
        return this.isOnMap(this.owner?.parent?.gameMap?.id);
    }

    /** Whether somebody put this slot somewhere on purpose. */
    get isPlaced() {
        return this.position !== null;
    }

    /**
     * Move house. The slot leaves the map it was on entirely — there is never a
     * second one left behind — and forgets its hand-placement unless the caller
     * supplies a new one, so the destination's spawn layout can seat it.
     */
    moveTo(mapId, position = null) {
        this.mapId = mapId || this.mapId;
        this.position = MyteHomeSlot.normalizePosition(position);
        this.invalidate();
        return this;
    }

    /**
     * Put the slot somewhere on this map on purpose. Passing null hands it back
     * to the automatic layout.
     */
    place(position) {
        this.position = MyteHomeSlot.normalizePosition(position);
        this.applyToElement();
        this.invalidate();
        return this.position;
    }

    /**
     * Push the stored position onto the element. This is the only writer of the
     * wrapper's inline position — laying it out from anywhere else is how the
     * element and the model drifted apart in the first place.
     */
    applyToElement() {
        const element = this.element;
        if (!element || !this.position) return false;
        element.style.left = `${this.position.x}px`;
        element.style.top = `${this.position.y}px`;
        this.invalidate();
        return true;
    }

    /**
     * Where the automatic layout has seated the slot, read back off the element
     * — used to place a slot the player has not placed themselves.
     */
    readElementPosition() {
        const element = this.element;
        if (!element) return null;
        const x = Number.parseFloat(element.style.left);
        const y = Number.parseFloat(element.style.top);
        return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
    }

    /** The slot's footprint in map coordinates, or null when it is not on this map. */
    getRect() {
        if (!this.isOnCurrentMap) return null;
        const element = this.footprintElement;
        const offset = element ? this.owner?.parent?.getLocalOffset?.(element) : null;
        if (!offset) return null;
        return {
            x: offset.left, y: offset.top,
            left: offset.left, top: offset.top,
            right: offset.right, bottom: offset.bottom,
            width: offset.width, height: offset.height
        };
    }

    /**
     * Where the myte stands when it is home: the slot's rect, with the myte
     * centred in it.
     *
     * Derived from DOM layout (getLocalOffset walks offsetParents), so it is
     * cached — AI thinking and GOHOME movement read this constantly. Every
     * writer above calls invalidate().
     */
    getStandingPosition() {
        if (this._cachedHomePosition) return this._cachedHomePosition;
        const rect = this.getRect();
        if (!rect) return null;
        const size = this.owner?.size ?? { width: 0, height: 0 };
        this._cachedHomePosition = {
            x: rect.left + ((rect.width - size.width) / 2),
            y: rect.top + ((rect.height - size.height) / 2)
        };
        return this._cachedHomePosition;
    }

    invalidate() {
        this._cachedHomePosition = null;
    }

    /** The save shape. Read from the model, never from the DOM. */
    serialize() {
        return {
            slotId: this.id,
            slotLabel: this.label,
            homeMapId: this.mapId,
            slotX: this.position?.x ?? 0,
            slotY: this.position?.y ?? 0,
            hasSlotPosition: this.isPlaced
        };
    }

    /** Apply a normalized roster entry. The entry is the save; this is the model. */
    applyRosterEntry(entry = {}) {
        if (entry.slotId) this.id = String(entry.slotId);
        if (entry.slotLabel) this.label = String(entry.slotLabel);
        this.mapId = String(entry.homeMapId || this.mapId || SiteConfig.world.defaultMap);
        this.position = entry.hasSlotPosition
            ? MyteHomeSlot.normalizePosition({ x: entry.slotX, y: entry.slotY })
            : null;
        this.invalidate();
        return this;
    }
}
