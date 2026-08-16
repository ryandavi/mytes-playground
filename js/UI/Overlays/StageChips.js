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
        this.unreadCount = 0;
    }

    init() {
        const wrapper = this.parent.containerWrapper;
        this.mapChip = wrapper?.querySelector('#world-map-chip') || null;
        this.mapLabel = this.mapChip?.querySelector('.text') || null;
        this.logChip = wrapper?.querySelector('#game-log-chip') || null;
        this.logBadge = this.logChip?.querySelector('.stage-chip__badge') || null;

        this.bindClick(this.mapChip, () => this.parent.worldMapPanel?.toggle());
        this.bindClick(this.logChip, () => this.parent.gameLogManager?.toggle());

        this.track(this.container?.eventManager?.on?.(
            EVENTS.MAP_CHANGED, payload => this.setMapName(payload?.displayName)
        ));

        this.setMapName();
    }

    setMapName(displayName = null) {
        if (!this.mapLabel) return;
        const name = displayName ||
            this.container?.getMapDisplayName?.(this.container?.gameMap?.id) ||
            '—';
        this.mapLabel.textContent = name;
        if (this.mapChip) this.mapChip.title = `World Map (M) — ${name}`;
    }

    noteLogEntry() {
        if (this.parent.gameLogManager?.isVisible) return;
        this.unreadCount += 1;
        this.renderBadge();
    }

    clearUnread() {
        if (this.unreadCount === 0) return;
        this.unreadCount = 0;
        this.renderBadge();
    }

    renderBadge() {
        if (!this.logBadge) return;
        this.logBadge.hidden = this.unreadCount === 0;
        this.logBadge.textContent = this.unreadCount > 99 ? '99+' : String(this.unreadCount);
    }

    dispose() {
        super.dispose();
        this.mapChip = null;
        this.mapLabel = null;
        this.logChip = null;
        this.logBadge = null;
    }
}
