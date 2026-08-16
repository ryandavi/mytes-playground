/**
 * WallViewControl — the Up / Cutaway / Down / Hidden segmented control shared
 * by the Build and Paint panels.
 *
 * Build mode used to force walls up, which made the floor behind a south wall
 * unreachable in a small room. The presentation is the player's to pick while
 * building; this control is the same one in both panels, and the choice
 * persists on the container for the session.
 *
 * The row itself is a plain `SegmentControl`; what lives here is the part that
 * is about walls — the order Home/End walks, and writing the choice through to
 * the builder.
 */
class WallViewControl {
    // Ordered by how much wall you see, so Home/End reads as one dial rather
    // than a jump through the config's declaration order.
    static ORDER = Object.freeze(['up', 'cutaway', 'down', 'hidden']);

    constructor(panel, root) {
        this.panel = panel;
        this.root = root || null;
        this.segment = new SegmentControl(
            this.root?.querySelector('.segment-control') || null,
            { onChange: (mode) => this.apply(mode) }
        );
    }

    get container() {
        return this.panel?.parent?.parent || null;
    }

    get builder() {
        return this.container?.gameMap?.wallBuilder || null;
    }

    apply(mode) {
        if (!SiteConfig.wallSystem.presentationModes.includes(mode)) return false;
        this.container.buildPresentation = mode;
        this.builder?.setUserPresentationMode(mode);
        return true;
    }

    select(mode) {
        return this.segment.select(mode);
    }

    // Home walks toward "more wall", End toward "less" — Sims muscle memory.
    step(direction) {
        const order = WallViewControl.ORDER;
        const current = order.indexOf(this.container?.buildPresentation ?? order[0]);
        return this.select(order[(current + direction + order.length) % order.length]);
    }

    sync() {
        this.segment.value = this.container?.buildPresentation ?? null;
        if (this.root) this.root.hidden = SiteConfig.wallSystem?.enabled !== true;
    }

    dispose() {
        this.segment?.dispose();
        this.segment = null;
        this.root = null;
        this.panel = null;
    }
}
