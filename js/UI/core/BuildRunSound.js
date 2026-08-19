// ─────────────────────────────────────────────────────────────────────────────
// BuildRunSound — the sound of a build gesture happening under your hand.
//
// Every drag-to-build tool wants the same thing: one short tick as each unit
// joins the run, a pitch that climbs a step per unit and wraps so a long run
// keeps its rhythm, and the ladder running back down when the gesture is taking
// things away. And every one of them has independently got the throttling
// wrong, because the failure is not obvious while you are writing it: a
// per-frame sound call does not overlap, it QUEUES (see SoundManager's
// scheduling reservation), so the audio carries on for seconds after mouseup.
//
// Two rules, and they are why this is one object rather than a copied method:
//
//  - **Sound progress, not frames.** A tick belongs to a unit joining the run,
//    so dragging back over ground you already covered is silent, and a pointer
//    that moves five times inside one cell is one tick.
//  - **Floor the rate anyway.** A flick across the map crosses thirty cells in
//    a moment; that is thirty units of genuine progress and still must not be
//    thirty one-shots. SoundManager caps the backlog as a last line, but a tool
//    that reaches that cap is already making a noise nobody asked for.
// ─────────────────────────────────────────────────────────────────────────────
class BuildRunSound {
    /**
     * @param {object} owner  anything that can reach the sound manager —
     *                        a container, or a UI component with `.parent`
     * @param {object} config { sound, cycle, basePitch, pitchStep, volume, minIntervalMs }
     */
    constructor(owner, config = SiteConfig.buildMode.sounds.run) {
        this.owner = owner;
        this.config = config;
        this.reset();
    }

    get soundManager() {
        return this.owner?.core?.soundManager ||
            this.owner?.parent?.parent?.core?.soundManager ||
            this.owner?.parent?.core?.soundManager ||
            null;
    }

    /** Start a gesture. Safe to call on every press. */
    reset() {
        this.count = 0;
        this.lastTickAt = 0;
        return this;
    }

    /**
     * The run is now `count` units long. Ticks only on growth.
     *
     * @param {number} count       total units the gesture has covered
     * @param {boolean} descending run the pitch ladder down (removing/erasing)
     */
    advance(count, { descending = false } = {}) {
        if (!Number.isFinite(count) || count === this.count) return false;

        const grew = count > this.count;
        this.count = count;
        if (!grew || count <= 0) return false;

        const config = this.config;
        // Wall-clock: this paces audio against the player's hand, not the sim.
        const now = performance.now();
        if (now - this.lastTickAt < config.minIntervalMs) return false;
        this.lastTickAt = now;

        const position = (count - 1) % config.cycle;
        this.soundManager?.playWhenReady?.(config.sound, {
            pitchScale: config.basePitch *
                Math.pow(config.pitchStep, descending ? config.cycle - 1 - position : position),
            volume: config.volume
        });
        return true;
    }
}
