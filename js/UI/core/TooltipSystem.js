class TooltipSystem {
    static disposeInstance() {
        if (!TooltipSystem.instance) {
            return;
        }

        TooltipSystem.instance.dispose();
        TooltipSystem.instance = null;
    }

    static getInstance() {
        if (!TooltipSystem.instance) {
            TooltipSystem.instance = new TooltipSystem();
        }

        return TooltipSystem.instance;
    }

    constructor() {
        this.activeAnchor = null;
        this.hideTimer = null;
        this.offset = 8;

        this.element = document.createElement('div');
        this.element.className = 'ui-tooltip';
        this.element.setAttribute('role', 'tooltip');

        this.contentElement = document.createElement('div');
        this.contentElement.className = 'ui-tooltip__content';
        this.element.appendChild(this.contentElement);

        document.body.appendChild(this.element);

        this.handlePointerDown = this.handlePointerDown.bind(this);
        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.reposition = this.reposition.bind(this);

        document.addEventListener('pointerdown', this.handlePointerDown, true);
        document.addEventListener('keydown', this.handleKeyDown, true);
        window.addEventListener('resize', this.reposition);
        window.addEventListener('scroll', this.reposition, true);

        this._anchorObserver = new MutationObserver(() => {
            if (this.activeAnchor && !document.body.contains(this.activeAnchor)) {
                this.hide();
            }
        });
        this._anchorObserver.observe(document.body, { childList: true, subtree: true });
    }

    isVisibleFor(anchor) {
        return this.activeAnchor === anchor && this.element.classList.contains('is-visible');
    }

    toggle(options = {}) {
        if (this.isVisibleFor(options.anchor)) {
            this.hide();
            return false;
        }

        this.show(options);
        return true;
    }

    show({ anchor, content = null, text = '', autoHideMs = 0, offset = 8 } = {}) {
        if (!anchor) return;

        this.clearHideTimer();
        this.activeAnchor = anchor;
        this.offset = offset;

        this.setContent({ content, text });
        this.element.classList.add('is-visible');
        this.reposition();

        if (autoHideMs > 0) {
            this.hideTimer = window.setTimeout(() => {
                if (this.activeAnchor === anchor) {
                    this.hide();
                }
            }, autoHideMs);
        }
    }

    hide() {
        this.clearHideTimer();
        this.activeAnchor = null;
        this.element.classList.remove('is-visible');
    }

    clearHideTimer() {
        if (this.hideTimer) {
            window.clearTimeout(this.hideTimer);
            this.hideTimer = null;
        }
    }

    setContent({ content = null, text = '' } = {}) {
        this.contentElement.replaceChildren();

        if (content instanceof Node) {
            this.contentElement.appendChild(content);
            return;
        }

        this.contentElement.textContent = text;
    }

    reposition() {
        if (!this.activeAnchor) {
            return;
        }

        if (!document.body.contains(this.activeAnchor)) {
            this.hide();
            return;
        }

        const anchorRect = this.activeAnchor.getBoundingClientRect();
        const viewportWidth = document.documentElement.clientWidth;
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
        const tooltipRect = this.element.getBoundingClientRect();
        const gutter = 8;

        let top = anchorRect.bottom + this.offset;
        if (top + tooltipRect.height > viewportHeight - gutter) {
            const aboveTop = anchorRect.top - tooltipRect.height - this.offset;
            top = aboveTop >= gutter
                ? aboveTop
                : Math.max(gutter, viewportHeight - tooltipRect.height - gutter);
        }

        let left = anchorRect.left + (anchorRect.width - tooltipRect.width) / 2;
        if (left + tooltipRect.width > viewportWidth - gutter) {
            left = viewportWidth - tooltipRect.width - gutter;
        }
        left = Math.max(gutter, left);

        this.element.style.left = `${Math.round(left)}px`;
        this.element.style.top = `${Math.round(top)}px`;
    }

    handlePointerDown(event) {
        if (!this.activeAnchor) return;

        const clickedAnchor = this.activeAnchor.contains(event.target);
        const clickedTooltip = this.element.contains(event.target);
        if (!clickedAnchor && !clickedTooltip) {
            this.hide();
        }
    }

    handleKeyDown(event) {
        if (event.key === 'Escape') {
            this.hide();
        }
    }

    dispose() {
        this.clearHideTimer();
        this.activeAnchor = null;
        document.removeEventListener('pointerdown', this.handlePointerDown, true);
        document.removeEventListener('keydown', this.handleKeyDown, true);
        window.removeEventListener('resize', this.reposition);
        window.removeEventListener('scroll', this.reposition, true);
        this._anchorObserver?.disconnect?.();
        this._anchorObserver = null;
        this.element?.remove?.();
    }
}
