// ─────────────────────────────────────────────────────────────────────────────
// RouteTravelManager — anyone walking across the world to somewhere else.
//
// A journey is a sequence of legs along a WorldGraph route: on each leg the
// traveller is *in* `route[legIndex]` and heading for `route[legIndex + 1]`,
// crossing it by walking from the portal it came in by to the portal it is
// leaving through. It is genuinely somewhere the whole time, which is what
// makes meeting it in transit possible:
//
//   • Whenever the leg's map is the one being played, the traveller is deployed
//     on it and walks to the portal it is heading for. Follow the route and you
//     will meet it crossing.
//   • On any other map it simulates as a timer, because only one map is loaded.
//     The timer is the real walk measured off the map file — how far apart the
//     two portals are, divided by how fast the traveller moves — so crossing a
//     map off-screen takes as long as crossing it on-screen.
//
// Two kinds of journey, sharing all of the above:
//
//   • Simulated — the traveller is not with the player. This manager deploys and
//     withdraws it as the played map changes, and steps it to the next leg
//     itself when it reaches the exit portal (or when the timer says it did).
//   • Escorted — the traveller *is* the player's active myte, so the portals do
//     the transitions for real. Nothing is deployed or withdrawn; the manager
//     just keeps pointing it at the next portal and follows along, re-routing if
//     the player wanders off through a different one.
//
// Subclasses supply what it means for their kind of traveller to be put on a
// map, taken off it, and told to walk somewhere. Mytes do this through their
// action queue and home slots; an NPC on a daily schedule would do the same
// through whatever moves it. The route, the legs, the timing and the portal
// bookkeeping are the same problem for both and live here.
// ─────────────────────────────────────────────────────────────────────────────

const ROUTE_TRAVEL_RESULTS = Object.freeze({
    STARTED: 'started',
    ALREADY_HERE: 'alreadyHere',
    ALREADY_TRAVELLING: 'alreadyTravelling',
    UNREACHABLE: 'unreachable',
    TOO_FAR: 'tooFar'
});

const ROUTE_TRAVEL_DIRECTIONS = Object.freeze({
    VISIT: 'visit',
    RETURN: 'return'
});

class RouteTravelManager {
    constructor(container) {
        this.container = container;
        this.journeys = new Map();
    }

    get config() {
        return SiteConfig.world.travel;
    }

    get currentMapId() {
        return this.container?.gameMap?.id ?? null;
    }

    isTravelling(traveller) {
        return this.journeys.has(traveller);
    }

    getJourney(traveller) {
        return this.journeys.get(traveller) ?? null;
    }

    getDirection(traveller) {
        return this.getJourney(traveller)?.direction ?? null;
    }

    isEscorting(traveller) {
        return this.getJourney(traveller)?.escorted === true;
    }

    // Travelling out of the player's hands, as opposed to an escort — which is
    // the player walking it somewhere and leaves it entirely theirs.
    isTravellingAlone(traveller) {
        const journey = this.getJourney(traveller);
        return !!journey && !journey.escorted;
    }

    // The map a traveller is currently crossing.
    getCurrentLegMapId(traveller) {
        const journey = this.getJourney(traveller);
        return journey ? journey.route[journey.legIndex] : null;
    }

    getDestination(traveller) {
        return this.getJourney(traveller)?.destination ?? null;
    }

    // ── Journey lifecycle ────────────────────────────────────────────────────

    startJourney(traveller, origin, destination, options = {}) {
        const {
            direction = ROUTE_TRAVEL_DIRECTIONS.VISIT,
            escorted = false,
            maxDistance = this.config.maxDistance
        } = options;

        if (!traveller || !origin || !destination) {
            return { ok: false, reason: ROUTE_TRAVEL_RESULTS.UNREACHABLE, origin, destination, direction };
        }

        if (this.isTravelling(traveller)) {
            return {
                ok: false,
                reason: ROUTE_TRAVEL_RESULTS.ALREADY_TRAVELLING,
                journey: this.getJourney(traveller),
                direction
            };
        }

        if (origin === destination) {
            return { ok: false, reason: ROUTE_TRAVEL_RESULTS.ALREADY_HERE, origin, destination, direction };
        }

        const route = WorldGraph.getRoute(origin, destination);
        if (!route) {
            return { ok: false, reason: ROUTE_TRAVEL_RESULTS.UNREACHABLE, origin, destination, direction };
        }

        const distance = route.length - 1;
        if (Number.isFinite(maxDistance) && distance > maxDistance) {
            return { ok: false, reason: ROUTE_TRAVEL_RESULTS.TOO_FAR, origin, destination, route, distance, direction };
        }

        const now = SimClock.now();
        const legs = this.measureRoute(traveller, route);
        const journey = {
            traveller,
            origin,
            destination,
            route,
            legs,
            distance,
            direction,
            escorted,
            legIndex: 0,
            // SimClock: travel is gameplay time and must pause with the tab.
            startedAt: now,
            legStartedAt: now,
            duration: legs.reduce((total, leg) => total + leg.duration, 0),
            elapsedBeforeLeg: 0,
            lastProgressAt: now,
            isOnStage: false,
            // Where it had got to when the player last walked out on it.
            stagePosition: null
        };

        this.journeys.set(traveller, journey);
        this.onJourneyStarted(journey);
        this.syncPresence(journey);
        this.startLeg(journey);

        return {
            ok: true,
            reason: ROUTE_TRAVEL_RESULTS.STARTED,
            journey, origin, destination, route, distance, direction
        };
    }

    // How long each map on the route actually takes to walk across, measured off
    // the map files so it holds for maps that are not loaded. Falls back to the
    // flat per-map duration only when a map's geometry says nothing useful.
    measureRoute(traveller, route) {
        const speed = Math.max(this.getTravellerSpeed(traveller), 0.001);
        const minimum = this.config.minLegDuration ?? 0;

        return route.slice(0, -1).map((mapId, index) => {
            const distance = WorldGraph.getCrossingDistance(mapId, route[index - 1] ?? null, route[index + 1]);
            const duration = distance > 0
                ? Math.max(distance / speed, minimum)
                : this.config.durationPerMap;
            return { mapId, from: route[index - 1] ?? null, to: route[index + 1], distance, duration };
        });
    }

    getLeg(journey) {
        return journey.legs[journey.legIndex] ?? null;
    }

    getLegDuration(journey) {
        return this.getLeg(journey)?.duration ?? this.config.durationPerMap;
    }

    cancelTravel(traveller, { keepDeployed = false } = {}) {
        const journey = this.journeys.get(traveller);
        if (!journey) return false;

        this.journeys.delete(traveller);
        if (!keepDeployed) this.withdrawFromMap(journey);
        this.onJourneyAbandoned(journey, { keepDeployed });
        this.refreshUi();
        return true;
    }

    getProgress(traveller) {
        const journey = this.getJourney(traveller);
        if (!journey || journey.duration <= 0) return 1;
        const elapsed = journey.elapsedBeforeLeg + (SimClock.now() - journey.legStartedAt);
        return Utility.clamp(elapsed / journey.duration, 0, 1);
    }

    getRemainingTime(traveller) {
        const journey = this.getJourney(traveller);
        if (!journey) return 0;
        return Math.max(0, journey.duration * (1 - this.getProgress(traveller)));
    }

    // ── Ticking ──────────────────────────────────────────────────────────────

    tickUpdate() {
        if (this.journeys.size === 0) return;

        const now = SimClock.now();
        // Snapshot: completing a journey mutates the map being iterated.
        [...this.journeys.values()].forEach(journey => {
            if (this.shouldAbandon(journey)) {
                this.cancelTravel(journey.traveller, { keepDeployed: true });
                return;
            }

            if (journey.escorted) {
                this.tickEscortedJourney(journey, now);
                return;
            }

            this.syncPresence(journey);

            if (this.hasFinishedLeg(journey, now)) {
                this.advanceLeg(journey, now);
                return;
            }

            // It stopped for some reason — a cleared queue, a shove, a nap that
            // ended. It is on its way somewhere, so send it on again.
            if (journey.isOnStage && this.isIdle(journey.traveller)) {
                this.walkToExitPortal(journey);
            }

            this.emitProgress(journey, now);
        });
    }

    // The player is walking the route themselves, so the portals move them for
    // real: a leg ends when the map they are standing in becomes the next one.
    tickEscortedJourney(journey, now) {
        const currentMapId = this.currentMapId;
        if (!currentMapId) return;

        if (currentMapId === journey.destination) {
            this.completeJourney(journey);
            return;
        }

        if (currentMapId !== journey.route[journey.legIndex]) {
            const legIndex = journey.route.indexOf(currentMapId);
            if (legIndex >= 0) {
                // Straight on to the next map of the route.
                journey.elapsedBeforeLeg += now - journey.legStartedAt;
                journey.legIndex = legIndex;
                journey.legStartedAt = now;
                this.startLeg(journey);
            } else if (!this.rerouteFrom(journey, currentMapId, now)) {
                // Off the map graph entirely — nothing sensible left to escort.
                this.cancelTravel(journey.traveller, { keepDeployed: true });
            }
            return;
        }

        // Only nudge an idle traveller: an escorted myte is still the player's,
        // and their orders come first.
        if (this.isIdle(journey.traveller)) {
            this.walkToExitPortal(journey);
        }

        this.emitProgress(journey, now);
    }

    // The player took a different portal. Keep the destination, redraw the route
    // from wherever they have ended up.
    rerouteFrom(journey, mapId, now) {
        const route = WorldGraph.getRoute(mapId, journey.destination);
        if (!route) return false;

        journey.route = route;
        journey.legs = this.measureRoute(journey.traveller, route);
        journey.distance = route.length - 1;
        journey.legIndex = 0;
        journey.legStartedAt = now;
        journey.elapsedBeforeLeg = 0;
        journey.duration = journey.legs.reduce((total, leg) => total + leg.duration, 0);
        journey.stagePosition = null;
        this.startLeg(journey);
        return true;
    }

    // A leg is done when the traveller is actually standing at the portal it was
    // walking to. Off-stage it cannot be watched, so the measured crossing time
    // stands in for the walk; on-stage the timer is only a backstop for a
    // traveller that has somehow been stopped from getting there.
    hasFinishedLeg(journey, now) {
        if (journey.isOnStage) {
            if (this.hasReachedExitPortal(journey)) return true;
            return now - journey.legStartedAt >= this.getLegDuration(journey) * 3;
        }

        return now - journey.legStartedAt >= this.getLegDuration(journey);
    }

    hasReachedExitPortal(journey) {
        const traveller = journey.traveller;
        const portal = this.findExitPortal(journey);
        if (!portal) return false;

        const center = portal.getPortalCenter?.() ?? { x: portal.posX, y: portal.posY };
        const position = this.getTravellerCenter(traveller);
        const radius = portal.getInteractionRadius?.() ?? this.config.portalArrivalRadius ?? 48;
        return Math.hypot(center.x - position.x, center.y - position.y) <= radius;
    }

    // One map crossed: step through the portal into the next map on the route.
    advanceLeg(journey, now) {
        this.withdrawFromMap(journey);

        journey.elapsedBeforeLeg += now - journey.legStartedAt;
        journey.legIndex++;
        journey.legStartedAt = now;

        if (journey.legIndex >= journey.route.length - 1) {
            this.completeJourney(journey);
            return;
        }

        this.syncPresence(journey);
        this.startLeg(journey);
        this.refreshUi();
    }

    startLeg(journey) {
        this.onLegStarted(journey);
        if (journey.escorted || journey.isOnStage) this.walkToExitPortal(journey);
    }

    completeJourney(journey) {
        this.journeys.delete(journey.traveller);
        this.onJourneyArrived(journey);
    }

    emitProgress(journey, now) {
        if (now - journey.lastProgressAt < this.config.progressInterval) return;
        journey.lastProgressAt = now;
        this.emit(EVENTS.TRAVEL_PROGRESS, {
            journey,
            progress: this.getProgress(journey.traveller)
        });
    }

    // ── Presence ─────────────────────────────────────────────────────────────

    // Deploy or withdraw the traveller so that it is on screen exactly when the
    // player is standing in the map it is crossing. Escorted travellers are the
    // player's own and are never moved on or off by this.
    syncPresence(journey) {
        if (journey.escorted) return;

        const shouldBeOnStage = this.getCurrentLegMapId(journey.traveller) === this.currentMapId;
        if (shouldBeOnStage === journey.isOnStage) return;

        if (shouldBeOnStage) {
            this.placeOnStage(journey);
        } else {
            this.withdrawFromMap(journey);
        }
    }

    placeOnStage(journey) {
        if (!this.container?.gameMap) return;
        if (!this.deployTraveller(journey)) return;

        // Coming back to a leg already in progress: resume where it had got to.
        // Re-placing it at the entrance every time the player looks in would
        // mean it never appears to get anywhere.
        const resumed = journey.stagePosition?.legIndex === journey.legIndex
            ? journey.stagePosition
            : null;

        if (resumed) {
            this.moveTravellerTo(journey.traveller, resumed.x, resumed.y);
        } else {
            this.placeArrivingFrom(journey.traveller, journey.route[journey.legIndex - 1] ?? null);
            this.settleIntoLeg(journey);
        }

        journey.isOnStage = true;
        this.walkToExitPortal(journey);
    }

    getLegProgress(journey) {
        const duration = this.getLegDuration(journey);
        if (duration <= 0) return 1;
        return Utility.clamp((SimClock.now() - journey.legStartedAt) / duration, 0, 1);
    }

    // Walking in on a traveller that is halfway across a map should find it
    // halfway across, not standing at the door it came in by. Placing it at the
    // entrance is what made travellers look like they pop into a map at the
    // moment you arrive — they had been crossing it for a while by then.
    settleIntoLeg(journey) {
        const progress = this.getLegProgress(journey);
        const portal = this.findExitPortal(journey);
        if (!portal || progress <= 0.05) return;

        const traveller = journey.traveller;
        const from = this.getTravellerCenter(traveller);
        const to = portal.getPortalCenter?.() ?? { x: portal.posX, y: portal.posY };

        let x = from.x + (to.x - from.x) * progress - (traveller.size?.width ?? 0) / 2;
        let y = from.y + (to.y - from.y) * progress - (traveller.size?.height ?? 0) / 2;

        // Partway along the straight line may be inside a wall; the grid knows
        // where a body that size can actually stand.
        const valid = this.container?.gameMap?.gridSystem?.findNearestValidPositionForEntity?.(traveller, x, y, 12);
        if (valid) {
            x = valid.x;
            y = valid.y;
        }

        this.moveTravellerTo(traveller, x, y);
    }

    // Owns `isOnStage` so no caller can leave the flag disagreeing with the DOM.
    // An escorted traveller is never taken off the map by us: it is the one the
    // player is playing, and it leaves maps the way they do, through portals.
    withdrawFromMap(journey) {
        if (journey.escorted || !journey.isOnStage) return;

        const traveller = journey.traveller;
        const position = this.getTravellerPosition(traveller);
        journey.stagePosition = { x: position.x, y: position.y, legIndex: journey.legIndex };
        journey.isOnStage = false;
        this.undeployTraveller(journey);
    }

    // Send it toward the portal that leads to the next map on its route, so a
    // player watching sees it cross rather than idle.
    walkToExitPortal(journey) {
        const portal = this.findExitPortal(journey);
        if (portal) this.walkToPortal(journey, portal);
    }

    // Walking to a portal and going through it are different things, and only
    // the traveller the player is with does the second one. Overridable for
    // exactly that reason.
    walkToPortal(journey, portal) {
        const center = portal.getPortalCenter?.() ?? {
            x: portal.posX + (portal.size?.width ?? 0) / 2,
            y: portal.posY + (portal.size?.height ?? 0) / 2
        };
        this.walkTo(journey.traveller, center);
    }

    findExitPortal(journey) {
        const nextMapId = journey.route[journey.legIndex + 1];
        if (!nextMapId || this.currentMapId !== journey.route[journey.legIndex]) return null;

        return (this.container?.gameMap?.objects ?? []).find(object =>
            object instanceof PortalMapObject && object.getResolvedTargetMapId?.() === nextMapId
        ) ?? null;
    }

    dispose() {
        this.journeys.clear();
        this.container = null;
    }

    // ── Hooks ────────────────────────────────────────────────────────────────
    // What it means for this kind of traveller to walk, to be put on a map, and
    // to get where it was going. Everything above is the same for all of them.

    // Map pixels per millisecond.
    getTravellerSpeed(traveller) {
        return (traveller?.speed ?? 1) / 16.667;
    }

    getTravellerPosition(traveller) {
        return { x: traveller?.posX ?? 0, y: traveller?.posY ?? 0 };
    }

    getTravellerCenter(traveller) {
        const position = this.getTravellerPosition(traveller);
        return {
            x: position.x + (traveller?.size?.width ?? 0) / 2,
            y: position.y + (traveller?.size?.height ?? 0) / 2
        };
    }

    // Whether the traveller has stopped and needs sending on again.
    isIdle(_traveller) {
        return false;
    }

    // Something happened that means this journey should stop being managed —
    // the player picked the traveller up, say. Ends the journey where it stands.
    shouldAbandon(_journey) {
        return false;
    }

    moveTravellerTo(traveller, x, y) {
        traveller?.setPosition?.(x, y);
        traveller?.setTarget?.(x, y);
        traveller?.setSpritePosition?.(x, y);
    }

    // Put the traveller down on the map being played. Returns false if it can't
    // be deployed right now, and the journey carries on off-screen instead.
    deployTraveller(_journey) {
        return false;
    }

    undeployTraveller(_journey) {}

    placeArrivingFrom(_traveller, _sourceMapId) {}

    walkTo(_traveller, _point) {}

    onJourneyStarted(_journey) {}
    onLegStarted(_journey) {}
    onJourneyArrived(_journey) {}
    onJourneyAbandoned(_journey, _options) {}

    refreshUi() {}

    emit(_name, _detail) {}
}
