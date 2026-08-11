class Notify {
    constructor(container) {
        this.container = container;
    }

    send(level, message, { title = null, channel = 'toast', myte = null } = {}) {
        if (!message) return false;
        if (channel === 'bubble' && myte?.dialogue?.showMessage) {
            myte.dialogue.showMessage(message);
            return true;
        }
        if (channel === 'log') {
            this.container?.core?.eventManager?.emit?.(EVENTS.GAME_LOG, { level, message, title });
            return true;
        }
        const toast = this.container?.core?.toastManager;
        const method = typeof toast?.[level] === 'function' ? level : 'info';
        toast?.[method]?.(message, title ?? undefined);
        return !!toast;
    }

    info(message, options) { return this.send('info', message, options); }
    warn(message, options) { return this.send('warning', message, options); }
    error(message, options) { return this.send('error', message, options); }
}
