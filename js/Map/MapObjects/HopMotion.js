// ─────────────────────────────────────────────────────────────────────────────
// HopMotion — reusable hop/bounce locomotion for creatures that should travel in
// discrete leaps rather than gliding (slimes, frogs, bunnies, chicks…).
//
// It deliberately does NOT decide *where* to go. Whatever already drives the
// entity — the NPC pathfinder, a patrol route, a wander — keeps setting velocity
// as usual; HopMotion only gates *when* that velocity may apply, scales it so a
// leap covers a deliberate distance, and arcs `posZ` while airborne. A type
// becomes hoppy through config alone, with no AI change and no subclass:
//
//   "movement": { "style": "hop", "hop": { "distance": 26, "height": 16 } }
//
// Creatures that do BOTH (a frog that walks, then leaps) call `setEnabled(false)`
// to fall back to ordinary continuous movement and `setEnabled(true)` to hop
// again — the component is a modifier on locomotion, not a locomotion monopoly.
//
// Pair with `MovementBody` (speed limiting, obstacle resolution, stuck
// detection). The two are independent and compose.
// ─────────────────────────────────────────────────────────────────────────────
class HopMotion {
    static DEFAULTS = Object.freeze({
        // Ground covered by one leap, in px. This is the honest way to keep a
        // hopper from *drifting*: without it, distance is an emergent product of
        // speed and air time and a creature can look like it is skating.
        // Null falls back to whatever velocity the AI set.
        distance: null,
        height: 14,          // px at the top of the arc
        airMs: 340,          // time off the ground per leap
        restMs: 420,         // grounded pause between leaps
        restVarianceMs: 220, // randomised so a group desynchronises
        jumpSound: null,
        landSound: null,
        drop: null,
        // Optional animation states. Missing ones fall back (see NpcMapObject),
        // so configuring these before the art exists is harmless.
        animations: Object.freeze({ jump: 'jump', fall: 'fall', land: null })
    });

    constructor(owner, config = {}) {
        this.owner = owner;
        this.enabled = true;
        this.configure(config);

        this.phase = 'rest';
        this.rising = false;
        this.elapsed = 0;
        this.restDuration = this._rollRestDuration();
        // Start part-way into the first rest so co-spawned creatures do not hop in
        // lockstep.
        this.elapsed = Math.random() * this.restDuration;
    }

    configure(config = {}) {
        const merged = { ...HopMotion.DEFAULTS, ...(config ?? {}) };
        merged.animations = { ...HopMotion.DEFAULTS.animations, ...(config?.animations ?? {}) };
        this.config = merged;
        return this;
    }

    // For creatures that alternate gaits (frogs walk *and* leap). Disabled means
    // "move normally": full throttle, grounded, no arc.
    setEnabled(enabled = true) {
        const next = enabled !== false;
        if (this.enabled === next) return this;
        this.enabled = next;
        if (!next) this.reset();
        return this;
    }

    _rollRestDuration() {
        const { restMs, restVarianceMs } = this.config;
        return Math.max(0, restMs + ((Math.random() - 0.5) * 2 * restVarianceMs));
    }

    isAirborne() {
        return this.enabled && this.phase === 'air';
    }

    isRising() {
        return this.isAirborne() && this.rising;
    }

    // Fraction of the arc completed, 0..1 (0 while grounded).
    getArcProgress() {
        if (this.phase !== 'air') return 0;
        return Math.min(1, this.elapsed / Math.max(1, this.config.airMs));
    }

    /**
     * Per-tick speed that makes one leap cover exactly `distance` px. Returns null
     * when no distance is configured, leaving the AI's velocity untouched.
     */
    getLeapSpeed(tickDelta) {
        const { distance, airMs } = this.config;
        if (!Number.isFinite(distance) || distance <= 0) return null;
        const ticks = Math.max(1, airMs / Math.max(1, tickDelta));
        return distance / ticks;
    }

    /**
     * Advance the hop cycle.
     *
     * @param {number} tickDelta
     * @param {boolean} wantsToMove is the entity trying to travel? A stationary
     *        creature stays grounded rather than hopping on the spot.
     * @returns {number} velocity throttle for this tick: 1 airborne, 0 grounded,
     *          always 1 when disabled. Callers multiply their velocity by it.
     */
    update(tickDelta, wantsToMove) {
        if (!this.enabled) return 1;

        const delta = Number.isFinite(tickDelta) && tickDelta > 0 ? tickDelta : 16.667;
        this.elapsed += delta;

        if (this.phase === 'rest') {
            this.owner.posZ = 0;
            this.rising = false;
            if (!wantsToMove) {
                // Hold at the ready so travel resumes promptly instead of waiting
                // out a fresh full rest.
                this.elapsed = Math.min(this.elapsed, this.restDuration);
                return 0;
            }
            if (this.elapsed < this.restDuration) return 0;

            this.phase = 'air';
            this.elapsed = 0;
            this.rising = true;
            this.owner.onHopStart?.();
            if (this.config.jumpSound) {
                this.owner.gameMap?.soundManager?.play?.(this.config.jumpSound);
            }
            return 1;
        }

        const progress = this.getArcProgress();
        // Simple sine arc: 0 at both ends, peak at mid-flight.
        this.owner.posZ = Math.sin(progress * Math.PI) * this.config.height;

        // Apex crossing drives the jump → fall animation swap.
        if (this.rising && progress >= 0.5) {
            this.rising = false;
            this.owner.onHopApex?.();
        }

        if (progress < 1) return 1;

        this.phase = 'rest';
        this.elapsed = 0;
        this.rising = false;
        this.restDuration = this._rollRestDuration();
        this.owner.posZ = 0;
        this.owner.onHopLand?.();
        if (this.config.landSound) {
            this.owner.gameMap?.soundManager?.play?.(this.config.landSound);
        }
        return 0;
    }

    reset() {
        this.phase = 'rest';
        this.rising = false;
        this.elapsed = 0;
        this.restDuration = this._rollRestDuration();
        if (this.owner) this.owner.posZ = 0;
    }
}
