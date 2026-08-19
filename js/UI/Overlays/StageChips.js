/**
 * StageChips — the two corner overlays that replaced sidebar buttons.
 *
 * Bottom-left names the map you are on and opens the world map; bottom-right
 * opens the event log and carries an unread count. Both live inside the
 * container wrapper so fullscreen keeps them.
 */
class StageChips extends UIComponent {
    constructor(parent) {
        super(parent);
        this.mapChip = null;
        this.mapLabel = null;
        this.logChip = null;
        this.logBadge = null;
    }

    init() {
        const wrapper = this.parent.containerWrapper;
        this.mapChip = wrapper?.querySelector('#world-map-chip') || null;
        this.mapLabel = this.mapChip?.querySelector('.text') || null;
        this.logChip = wrapper?.querySelector('#game-log-chip') || null;
        this.logBadge = this.logChip?.querySelector('.stage-chip__badge') || null;

        // Neither chip is bound here: each is its window's `buttonId`, so
        // ModalWindow opens it, closes it, and marks it `.active` while it is
        // open. One control cannot be wired two ways.

        this.track(this.container?.eventManager?.on?.(
            EVENTS.MAP_CHANGED, payload => this.setMapName(payload?.displayName)
        ));

        this.setMapName();
        this.parent.gameLogManager?.syncUnread();
    }

    setMapName(displayName = null) {
        if (!this.mapLabel) return;
        const name = displayName ||
            this.container?.getMapDisplayName?.(this.container?.gameMap?.id) ||
            '—';
        this.mapLabel.textContent = name;
        if (this.mapChip) this.mapChip.title = `World Map (M) — ${name}`;
    }

    /**
     * Show an unread count on the log chip. The chip keeps no count of its own —
     * the log owns which entries are unread, and tells the chip what to draw, so
     * the badge and the bold entries inside the window can never disagree.
     */
    renderBadge(count = 0) {
        if (!this.logBadge) return;
        this.logBadge.hidden = count === 0;
        this.logBadge.textContent = count > 99 ? '99+' : String(count);
    }

    dispose() {
        super.dispose();
        this.mapChip = null;
        this.mapLabel = null;
        this.logChip = null;
        this.logBadge = null;
    }
}
