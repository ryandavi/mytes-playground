/**
 * SimClock — a simulation-time clock that only advances while the game loop
 * is running. Unlike Date.now(), it pauses when the tab is hidden (because
 * Core.js cancels the RAF on visibility change). Gameplay systems should use
 * SimClock.now() for cooldowns and state-aging so they behave deterministically
 * regardless of whether the tab has been hidden.
 *
 * Usage:
 *   SimClock.advance(deltaMs)   // called by Core each frame
 *   SimClock.now()              // returns current simulated ms timestamp
 *   SimClock.reset()            // called when the loop restarts after being hidden
 */
class SimClock {
    static _elapsed = 0;

    /** Advance the clock by the given frame delta (ms). Called by Core each frame. */
    static advance(deltaMs) {
        SimClock._elapsed += deltaMs;
    }

    /** Current simulation time in ms. Use instead of Date.now() for gameplay cooldowns. */
    static now() {
        return SimClock._elapsed;
    }

    /** Reset to zero — call when the game restarts from scratch (not on tab-resume). */
    static reset() {
        SimClock._elapsed = 0;
    }
}
