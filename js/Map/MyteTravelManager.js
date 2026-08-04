// ─────────────────────────────────────────────────────────────────────────────
// MyteTravelManager — a myte walking across the world to a different map.
//
// The route, the legs and the timing are RouteTravelManager's job; what is here
// is everything that makes the traveller a *myte*: home slots, the active myte,
// the action queue it walks with, and the myte list that reports on it.
//
//   • A summoned myte leaves its home slot the moment the journey starts, so the
//     slot reads empty on its home map — it is not there any more.
//   • Taking control of a traveller mid-route cancels the journey — you caught
//     it, so it stays with you rather than carrying on without you.
//   • Home never moves. A visit ends either by walking back (requestReturn) or
//     by the player putting the myte away on its own map.
//
// An escorted journey is the other way round: the myte is already the one you
// are playing, and the route is walked for real, portal by portal. That is what
// the world map's Travel button does when a myte is out — it plots the way
// rather than teleporting the camera there.
// ─────────────────────────────────────────────────────────────────────────────

const MYTE_TRAVEL_RESULTS = ROUTE_TRAVEL_RESULTS;
const MYTE_TRAVEL_DIRECTIONS = ROUTE_TRAVEL_DIRECTIONS;

class MyteTravelManager extends RouteTravelManager {
    // Whether summoning is even an option, without starting anything — the UI
    // needs this to decide what a myte thumbnail should say and do.
    canTravel(myte) {
        const destination = this.currentMapId;
        const origin = this.whereIs(myte);
        if (!myte || !destination || !origin) return false;
        if (myte.isActive || this.isTravelling(myte)) return false;
        if (origin === destination) return false;
        return WorldGraph.getDistance(origin, destination) <= this.config.maxDistance;
    }

    // Wherever it actually is — the map you left it standing on, not the map it
    // sleeps on. A myte parked two maps away walks from there.
    whereIs(myte) {
        return this.container.getMyteMapId?.(myte) ?? myte?.homeMapId ?? null;
    }

    // Summon a myte from wherever it is to the map being played.
    requestTravel(myte) {
        return this.startJourney(myte, this.whereIs(myte), this.currentMapId, {
            direction: MYTE_TRAVEL_DIRECTIONS.VISIT
        });
    }

    // Send a visiting myte back to its own map, where it settles into its slot.
    requestReturn(myte) {
        return this.startJourney(myte, this.currentMapId, myte?.homeMapId ?? null, {
            direction: MYTE_TRAVEL_DIRECTIONS.RETURN
        });
    }

    // Walk the myte you are playing to another map, through every portal on the
    // way. No distance limit: you are going with it.
    requestEscortedTravel(myte, destination) {
        return this.startJourney(myte, this.currentMapId, destination, {
            direction: MYTE_TRAVEL_DIRECTIONS.VISIT,
            escorted: true,
            maxDistance: Infinity
        });
    }

    // ── Hooks ────────────────────────────────────────────────────────────────

    // `getSpeed` is per animation frame, and legs are measured in milliseconds.
    getTravellerSpeed(myte) {
        return (myte?.stats?.getSpeed?.() ?? myte?.speed ?? 1) / 16.667;
    }

    isIdle(myte) {
        return !!myte?.queue?.isEmpty?.();
    }

    shouldAbandon(journey) {
        const isActiveMyte = this.container.activeMyte === journey.traveller;
        // Grabbing a passing traveller ends the journey — you caught it, so it
        // stays with you. An escort is the mirror image: it lasts exactly as
        // long as the myte is the one you are walking around with.
        return journey.escorted ? !isActiveMyte : isActiveMyte;
    }

    deployTraveller(journey) {
        // Queue-only: it is passing through on business, not free-roaming.
        const started = journey.traveller.startWithOptions({
            goal: MOVE_TYPES.QUEUE_ONLY,
            snapToHome: false
        });
        // Refused (recovering, say) — it keeps crossing off-screen rather than
        // being marked present while invisible.
        if (!started) return false;

        journey.traveller.clearHomeSlotHold?.();
        return true;
    }

    // Pull a deployed myte off the map without sending it to a home slot that
    // isn't here. It has stepped through a portal; it is simply elsewhere now —
    // the same "out there, not here" state a myte you left behind is in.
    undeployTraveller(journey) {
        this.presence?.takeOffMap(journey.traveller);
    }

    // Put a myte down on the map being played, having come from `sourceMapId`.
    // Always lands it somewhere on *this* map: with no arrival to resolve it
    // would otherwise keep the coordinates of the map it just left and walk
    // from wherever that map's portal happened to be.
    placeArrivingFrom(myte, sourceMapId) {
        const map = this.container.gameMap;
        const transitionManager = this.container.transitionManager;

        const arrival = transitionManager?.resolveArrivalFrom(myte, sourceMapId, map);
        if (arrival) {
            transitionManager.placeMyteAtArrival(myte, arrival);
            return;
        }

        // Its own slot is the honest entry point on its own map.
        if (myte.isOnHomeMap) {
            myte.snapToHomePosition?.();
            return;
        }

        const dimensions = map?.dimensions;
        if (!dimensions) return;
        this.moveTravellerTo(
            myte,
            (dimensions.width - (myte.size?.width ?? 0)) / 2,
            (dimensions.height - (myte.size?.height ?? 0)) / 2
        );
    }

    walkTo(myte, point) {
        myte.queue?.interrupt?.('astar-move', { target: { x: point.x, y: point.y } });
    }

    // An escorted myte does not merely walk to the portal, it uses it — through
    // the same approach-then-interact path a double-click takes, so the map
    // really does change under the player. A myte travelling on its own must not
    // do that: it is crossing maps of its own, not taking the player with it.
    walkToPortal(journey, portal) {
        if (!journey.escorted) {
            super.walkToPortal(journey, portal);
            return;
        }

        portal.press?.(this.container);
    }

    onJourneyStarted(journey) {
        const myte = journey.traveller;

        if (journey.escorted) {
            // The route is the myte's orders for the duration; its own movement
            // mode gets it back when it arrives.
            journey.previousGoal = myte.goal;
            journey.isOnStage = true;
            myte.setMode(MOVE_TYPES.QUEUE_ONLY);
        } else {
            // The journey owns the myte from here — the player is no longer
            // driving it. This also makes a later `activeMyte === myte`
            // unambiguous: it can only mean the player grabbed it in transit.
            if (this.container.activeMyte === myte) {
                this.container.deactivateActiveMyte(myte);
            }

            // It has left its slot. The slot reads empty until it walks back.
            this._setSlotOccupied(myte, false);

            if (myte.isActive && this.getCurrentLegMapId(myte) === this.currentMapId) {
                // Already standing on the first leg's map — it simply starts
                // walking rather than being re-placed at an entrance it never
                // used.
                journey.isOnStage = true;
                myte.queue?.clear?.();
                myte.setMode(MOVE_TYPES.QUEUE_ONLY);
            }
        }

        this.refreshUi();
        this.emit('travel_started', { journey });
    }

    onJourneyArrived(journey) {
        const myte = journey.traveller;

        if (journey.escorted) {
            this._restoreEscortedMode(journey);
            this._finish(journey);
            return;
        }

        if (journey.direction === MYTE_TRAVEL_DIRECTIONS.RETURN) {
            this._settleAtHome(myte);
            this._finish(journey);
            return;
        }

        // The player may have moved on while the myte was walking. It carries on
        // from the map it actually reached — restarting from home would send it
        // back through maps it has already crossed, over and over.
        if (this.currentMapId !== journey.destination) {
            const onwards = this.startJourney(myte, journey.destination, this.currentMapId, {
                direction: MYTE_TRAVEL_DIRECTIONS.VISIT
            });
            if (onwards.ok) return;

            // The player is somewhere it can't walk to from here. It gives up on
            // the visit and heads back to its own slot rather than being
            // stranded on a map nobody is loading.
            this._settleAtHome(myte);
            this._finish(journey);
            return;
        }

        // The home slot stays where it is — this is a visit. Skipping the home
        // snap is what keeps the myte from teleporting to a slot on another map.
        myte.startWithOptions({
            goal: DEFAULT_MODE,
            followGoal: myte.followGoal,
            autonomyGoal: myte.autonomyGoal,
            snapToHome: false
        });
        myte.clearHomeSlotHold?.();
        this.placeArrivingFrom(myte, journey.route[journey.route.length - 2] ?? journey.origin);
        // It is here now, not wherever it was parked when you called it.
        this.presence?.forget(myte);

        // Summoning a myte is a request to control it, so it takes over on
        // arrival rather than silently joining the others in follow mode.
        this.container.setActiveMyte(myte);
        this._finish(journey);
    }

    onJourneyAbandoned(journey, { keepDeployed = false } = {}) {
        if (journey.escorted) {
            this._restoreEscortedMode(journey);
            return;
        }

        // Home is the only place a myte can rest, so an abandoned journey ends
        // there rather than leaving it nowhere.
        if (!keepDeployed) this._settleAtHome(journey.traveller);
    }

    refreshUi() {
        this.container?.ui?.myteListManager?.updateMytesList?.(this.container.activeMyte);
    }

    emit(name, detail = {}) {
        this.container?.eventManager?.emit(`myte:${name}`, {
            ...detail,
            myte: detail.journey?.traveller ?? detail.myte ?? null
        });
    }

    // ── Myte housekeeping ────────────────────────────────────────────────────

    get presence() {
        return this.container?.mytePresence ?? null;
    }

    _restoreEscortedMode(journey) {
        const myte = journey.traveller;
        if (!myte.isActive || journey.previousGoal == null) return;
        myte.setMode(journey.previousGoal);
    }

    // Back on its own map: drop into the slot it left. The slot only becomes
    // visible again when the player travels there. It is no longer standing
    // about on any other map, so any memory of that goes with it.
    _settleAtHome(myte) {
        this.presence?.forget(myte);
        myte.invalidateHomePositionCache?.();
        this._setSlotOccupied(myte, true);
        if (myte.isOnHomeMap) myte.snapToHomePosition?.();
    }

    _setSlotOccupied(myte, occupied) {
        this.presence?.setSlotOccupied(myte, occupied);
    }

    _finish(journey) {
        this.container.core?.user?.saveUserData?.();
        this.refreshUi();
        this.emit('travel_arrived', { journey });
    }
}
