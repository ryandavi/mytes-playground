/**
 * WallViewControl — the Up / Cutaway / Down / Hidden segmented control shared
 * by the Build and Paint panels.
 *
 * Build mode used to force walls up, which made the floor behind a south wall
 * unreachable in a small room. The presentation is the player's to pick while
 * building; this control is the same one in both panels, and the choice
 * persists on the container for the session.
 */
class WallViewControl {
    // Ordered by how much wall you see, so Home/End reads as one dial rather
    // than a jump through the config's declaration order.
    static ORDER = Object.freeze(['up', 'cutaway', 'down', 'hidden']);

    constructor(panel, root) {
        this.panel = panel;
        this.root = root || null;
        this.buttons = [...(this.root?.querySelectorAll('.wall-view-btn') || [])];
        this.handleClick = this.handleClick.bind(this);
        this.root?.addEventListener('click', this.handleClick);
    }

    get container() {
        return this.panel?.parent?.parent || null;
    }

    get builder() {
        return this.container?.gameMap?.wallBuilder || null;
    }

    handleClick(event) {
        const button = event.target.closest('.wall-view-btn');
        if (!button) return;
        event.preventDefault();
        this.select(button.dataset.wallMode);
    }

    select(mode) {
        if (!SiteConfig.wallSystem.presentationModes.includes(mode)) return false;
        this.container.buildPresentation = mode;
        this.builder?.setUserPresentationMode(mode);
        this.sync();
        return true;
    }

    // Home walks toward "more wall", End toward "less" — Sims muscle memory.
    step(direction) {
        const order = WallViewControl.ORDER;
        const current = order.indexOf(this.container?.buildPresentation ?? order[0]);
        const next = (current + direction + order.length) % order.length;
        this.select(order[next]);
    }

    sync() {
        const active = this.container?.buildPresentation;
        for (const button of this.buttons) {
            const selected = button.dataset.wallMode === active;
            button.classList.toggle('active', selected);
            button.setAttribute('aria-pressed', String(selected));
        }
        if (this.root) this.root.hidden = SiteConfig.wallSystem?.enabled !== true;
    }

    dispose() {
        this.root?.removeEventListener('click', this.handleClick);
        this.root = null;
        this.buttons = [];
        this.panel = null;
    }
}
