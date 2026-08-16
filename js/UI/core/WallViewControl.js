/**
 * WallViewControl — the Up / Cutaway / Down / Hidden segmented control.
 *
 * Build mode used to force walls up, which made the floor behind a south wall
 * unreachable in a small room. The presentation is the player's to pick, in
 * either mode; the control lives on the stage bar so it is one click away
 * while playing as well as while building.
 *
 * The row itself is a plain `SegmentControl` — including the Home/End walk,
 * since the buttons are already authored in order of how much wall you see.
 * What lives here is the part that is about walls: reading the builder's
 * current presentation, and writing a choice back to it.
 */
class WallViewControl {
    constructor(owner, root) {
        this.owner = owner;
        this.root = root || null;
        this.segment = new SegmentControl(
            this.root?.querySelector('.segment-control') || null,
            { onChange: (mode) => this.apply(mode) }
        );
    }

    // Mounted either on a panel (whose own `container` is unset — see
    // ModalWindow) or on a UIComponent, which has one.
    get container() {
        return this.owner?.container ?? this.owner?.parent?.parent ?? null;
    }

    get builder() {
        return this.container?.gameMap?.wallBuilder || null;
    }

    apply(mode) {
        if (!SiteConfig.wallSystem.presentationModes.includes(mode)) return false;
        const container = this.container;
        if (!container) return false;
        container.buildPresentation = mode;
        this.builder?.setUserPresentationMode(mode);
        return true;
    }

    select(mode) {
        return this.segment.select(mode);
    }

    // Home walks toward "more wall", End toward "less" — Sims muscle memory.
    step(direction) {
        return this.segment.step(direction);
    }

    /**
     * The builder is the truth while there is one: it is what build mode's
     * entry environment writes to, and what a freshly loaded map reports. The
     * remembered choice only answers for the gap before a map has walls.
     */
    sync() {
        this.segment.value = this.builder?.presentation ?? this.container?.buildPresentation ?? null;
        this.segment.setDisabled(!this.builder);
        if (this.root) this.root.hidden = SiteConfig.wallSystem?.enabled !== true;
    }

    dispose() {
        this.segment?.dispose();
        this.segment = null;
        this.root = null;
        this.owner = null;
    }
}
