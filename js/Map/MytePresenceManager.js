// ─────────────────────────────────────────────────────────────────────────────
// MytePresenceManager — where each myte is, and whether that is here.
//
// Only one map is loaded at a time, but mytes exist on all of them. Three states
// cover it: in its home slot, deployed on the map being played, or *parked* —
// deployed on some other map, waiting for you to come back to it.
//
// Parking is what makes portals behave. A myte follows you through a portal only
// if it is the one that walked into it; anyone else you had out stays on the map
// you left, standing where you left them, and is put back exactly there when you
// return. Without it every deployed myte teleported along with the camera.
//
// The DOM side of "off the map" lives here too, because a parked myte, a myte
// crossing a map it hasn't reached yet, and a myte visiting somewhere you are
// not all need the same thing: hidden, not ticking, and not pretending to be
// tucked up in a home slot it is nowhere near.
// ─────────────────────────────────────────────────────────────────────────────

class MytePresenceManager {
    constructor(container) {
        this.container = container;
        this.parked = new Map();
    }

    // ── Where is it? ─────────────────────────────────────────────────────────

    // The map a myte is standing on, or null when it is in its slot at home.
    getMapId(myte) {
        const travelling = this.container?.travelManager?.getCurrentLegMapId?.(myte);
        if (travelling) return travelling;
        if (this.parked.has(myte)) return this.parked.get(myte).mapId;
        if (myte?.isActive) return this.container?.gameMap?.id ?? null;
        return null;
    }

    isParked(myte) {
        return this.parked.has(myte);
    }

    forget(myte) {
        return this.parked.delete(myte);
    }

    clear() {
        this.parked.clear();
    }

    // ── Being on and off the map ─────────────────────────────────────────────

    // Whether the home slot renders as holding this myte. `startWithOptions` and
    // `stop` normally own these classes, but a myte that is out on a map the
    // player isn't looking at belongs to neither.
    setSlotOccupied(myte, occupied) {
        myte?.element?.classList.toggle('is-deactivated', !occupied);
        myte?.elements?.wrapper?.classList.toggle('empty', !occupied);
    }

    // Take a myte off the loaded map without sending it home: it is still out
    // there, just not here. `stop()` would snap it into a slot that may be on a
    // different map entirely.
    takeOffMap(myte) {
        if (!myte) return;

        if (this.container.activeMyte === myte) {
            this.container.deactivateActiveMyte(myte);
        }

        myte.queue?.clear?.();
        myte.clearHomeSlotHold?.();
        myte.cancelInactivityFreeRoam?.();
        myte.isActive = false;
        myte.duplicate?.classList.add('is-deactivated');
        this.setSlotOccupied(myte, false);
    }

    // ── Parking ──────────────────────────────────────────────────────────────

    // Leaving `mapId`: everyone out except `traveller` stays behind on it.
    // Travellers are left alone — the travel manager is already accounting for
    // where they are, leg by leg.
    parkOthers(mapId, traveller = null) {
        if (!mapId) return;

        this.container.mytes?.forEach(myte => {
            if (myte === traveller || !myte.isActive) return;
            if (this.container.travelManager?.isTravelling(myte)) return;
            this.park(myte, mapId);
        });
    }

    park(myte, mapId) {
        this.parked.set(myte, {
            mapId,
            x: myte.posX,
            y: myte.posY,
            goal: myte.goal,
            followGoal: myte.followGoal,
            autonomyGoal: myte.autonomyGoal
        });
        this.takeOffMap(myte);
    }

    // Arriving on `mapId`: put back everyone who was left standing on it.
    restoreOn(mapId) {
        if (!mapId) return;

        [...this.parked.entries()].forEach(([myte, parked]) => {
            if (parked.mapId !== mapId) return;
            this.parked.delete(myte);

            // Refused (recovering, say) — it stays off the map rather than being
            // put back in a state it can't be in.
            const restored = myte.startWithOptions({
                goal: parked.goal,
                followGoal: parked.followGoal,
                autonomyGoal: parked.autonomyGoal,
                snapToHome: false
            });
            if (!restored) return;

            myte.clearHomeSlotHold?.();
            myte.setPosition(parked.x, parked.y);
            myte.setTarget(parked.x, parked.y);
            myte.setSpritePosition(parked.x, parked.y);
        });
    }

    dispose() {
        this.parked.clear();
        this.container = null;
    }
}
