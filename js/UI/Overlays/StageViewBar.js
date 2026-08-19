/**
 * StageViewBar — the controls docked along the bottom of the stage: how the
 * walls are drawn and how fast the world is running, plus the grid and snap
 * switches while building.
 *
 * These used to live inside the Wall and Surface panels, one copy each, plus a
 * third copy of the wall presentation buttons in Options → View. Three copies
 * of a control is three chances to disagree, and all three were behind
 * something you had to open first — so choosing how to look at the map cost a
 * trip to a menu, in a game where looking at the map is the whole activity.
 *
 * They are grouped by what they are about rather than by who wired them: the
 * view controls sit beside the map name, because both answer "what am I looking
 * at", and the speed sits beside the event log, because both are about the
 * world running. That is why this owns two roots and not one.
 *
 * Nothing here holds state of its own: presentation lives on the wall builder,
 * grid and snap on the container's settings, speed on Core. The bar is a view
 * of those and re-reads them whenever they announce a change — including
 * changes made by the keyboard or by build mode itself.
 */
class StageViewBar extends UIComponent {
    // Pause is a state rather than a speed, so it is a value the segment can
    // hold but never a multiplier. See `applySpeed`.
    static PAUSE = 'pause';

    constructor(parent) {
        super(parent);
        this.wallView = null;
        this.gridToggle = null;
        this.snapToggle = null;
        this.speed = null;
        this.exportButton = null;
    }

    get gameMode() {
        return this.container?.gameMode || null;
    }

    get core() {
        return this.container?.core || null;
    }

    init() {
        // Scoped to the container wrapper rather than to one bar element: the
        // controls are docked in two places and the wrapper is what they have
        // in common. Each control still finds itself by its own class.
        const root = this.parent.containerWrapper;
        if (!root) return;

        // The same classes the build panels used to construct — this is a
        // second mounting point, not a second implementation.
        this.wallView = this.track(new WallViewControl(this, root.querySelector('.wall-view-controls')));
        this.gridToggle = this.track(new BuildGridToggle(this, root));
        this.snapToggle = this.track(new BuildSnapToggle(this, root));
        this.speed = this.track(new SegmentControl(
            root.querySelector('.stage-speed-control'),
            { onChange: (value) => this.applySpeed(value) }
        ));

        // A shortcut to the Debug panel's own export, to hand while you are
        // actually laying the walls it writes out. One action, two ways in.
        this.exportButton = root.querySelector('#stage-export-tiled');
        this.bindClick(this.exportButton, () => this.parent.exportMapToTiled(this.exportButton));

        const events = this.container?.eventManager;
        this.track(
            // Presentation can be changed by Home/End, by build mode's entry
            // environment, or by the builder rebuilding on a new map — all of
            // which land here rather than being pushed by whoever moved it.
            events?.on?.(EVENTS.WALL_PRESENTATION_CHANGED, () => this.sync()),
            events?.on?.(EVENTS.WALL_READY, () => this.sync()),
            events?.on?.(EVENTS.MAP_CHANGED, () => this.sync()),
            events?.on?.(EVENTS.GAME_MODE_CHANGED, () => this.sync()),
            events?.on?.(EVENTS.SIMULATION_RATE_CHANGED, () => this.syncSpeed())
        );

        this.sync();
    }

    /**
     * Pause is a state, not a speed — see `Core.setSimulationSpeed`. Leaving
     * the multiplier alone while paused is what lets the button that paused the
     * world put it back at the speed it was running.
     */
    applySpeed(value) {
        const core = this.core;
        if (!core) return;
        if (value === StageViewBar.PAUSE) {
            core.setSimulationPaused(true);
            return;
        }
        core.setSimulationSpeed(Number(value));
        core.setSimulationPaused(false);
    }

    sync() {
        this.wallView?.sync();
        this.gridToggle?.sync();
        this.snapToggle?.sync();
        this.syncSpeed();
        if (this.exportButton) {
            this.exportButton.disabled =
                typeof WallTiledExporter === 'undefined' ||
                !WallTiledExporter.isAvailable(this.container?.gameMap);
        }
    }

    syncSpeed() {
        if (!this.speed) return;
        const rate = this.core?.getSimulationRate?.() ?? { paused: false, speed: 1 };
        this.speed.value = rate.paused ? StageViewBar.PAUSE : String(rate.speed);
    }

    dispose() {
        super.dispose();
        this.wallView = null;
        this.gridToggle = null;
        this.snapToggle = null;
        this.speed = null;
        this.exportButton = null;
    }
}
