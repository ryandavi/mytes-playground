class QueueTargetManager extends UIComponent {
    constructor(parent) {
        super(parent);
        this.currentTarget = null;
        this._lastUpdate = 0;
    }

    getHighlightElement(target) {
        if (!target) return null;

        if (target instanceof Myte) {
            return target.duplicate || null;
        }

        if (target instanceof MapObject) {
            return target.element || null;
        }

        if (target instanceof Element) {
            return target;
        }

        return null;
    }

    clearTarget(target = this.currentTarget) {
        const element = this.getHighlightElement(target);
        element?.classList?.remove('is-queue-target');
    }

    setTarget(target) {
        if (this.currentTarget === target) {
            return;
        }

        this.clearTarget(this.currentTarget);
        this.currentTarget = target || null;

        const element = this.getHighlightElement(this.currentTarget);
        element?.classList?.add('is-queue-target');
    }

    update() {
        const now = performance.now();
        if (now - this._lastUpdate < 100) return; // ~10fps
        this._lastUpdate = now;

        const activeMyte = this.parent.getActiveMyte();
        let target = null;

        if (activeMyte?.goal === MOVE_TYPES.GOHOME && !activeMyte?.isAtHomePosition?.(1)) {
            target = activeMyte.getHomeSlotElement?.() ?? null;
        } else {
            target = activeMyte?.queue?.getCurrentAction?.()?.target ?? null;
        }

        const highlightElement = this.getHighlightElement(target);

        if (!highlightElement || target?.active === false) {
            this.setTarget(null);
            return;
        }

        this.setTarget(target);
    }

    dispose() {
        this.clearTarget();
        this.currentTarget = null;
    }
}
