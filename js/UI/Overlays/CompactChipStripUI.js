class CompactChipStripUI extends UIComponent {
    constructor(parent, options = {}) {
        super(parent);
        this.host = options.element || null;
        this.maxItems = Number.isFinite(options.maxItems) ? options.maxItems : Infinity;
        this.holdDelay = Number.isFinite(options.holdDelay) ? options.holdDelay : 550;
        this.tooltipSystem = TooltipSystem.getInstance();
        this.elements = new Map();
        this.lastStructureKey = null;
    }

    getItems() {
        return [];
    }

    getChipConfig() {
        return null;
    }

    cancelItem() {
        return false;
    }

    createChipElement() {
        const element = document.createElement('button');
        element.type = 'button';
        element.className = 'compact-chip';

        const badge = document.createElement('span');
        badge.className = 'compact-chip__badge';

        const label = document.createElement('span');
        label.className = 'compact-chip__label';

        const meter = document.createElement('div');
        meter.className = 'compact-chip__meter';

        const meterFill = document.createElement('div');
        meterFill.className = 'compact-chip__meter-fill';
        meter.appendChild(meterFill);

        element.append(badge, label, meter);
        element._holdTimer = null;
        element._holdTriggered = false;
        element._chipConfig = null;

        const clearHoldTimer = () => {
            if (element._holdTimer) {
                clearTimeout(element._holdTimer);
                element._holdTimer = null;
            }

            if (!element._holdTriggered) {
                element.classList.remove('holding');
            }
        };

        element.addEventListener('pointerdown', (event) => {
            const config = element._chipConfig;
            if (!config?.cancellable) {
                return;
            }

            event.preventDefault();
            element._holdTriggered = false;
            clearHoldTimer();
            this.hideTooltip(element);
            element.classList.add('holding');
            element._holdTimer = setTimeout(() => {
                element._holdTriggered = true;
                element.classList.remove('holding');
                this.cancelItem(config.item, config.index);
            }, this.holdDelay);
        });

        ['pointerup', 'pointerleave', 'pointercancel', 'lostpointercapture'].forEach(eventName => {
            element.addEventListener(eventName, clearHoldTimer);
        });

        element.addEventListener('mouseenter', () => this.showTooltip(element));
        element.addEventListener('mouseleave', () => this.hideTooltip(element));
        element.addEventListener('focus', () => this.showTooltip(element));
        element.addEventListener('blur', () => this.hideTooltip(element));
        element.addEventListener('click', (event) => {
            if (element._holdTriggered) {
                event.preventDefault();
                event.stopPropagation();
                element._holdTriggered = false;
                return;
            }

            this.toggleTooltip(element);
        });

        element._refs = { badge, label, meter, meterFill };
        return element;
    }

    buildTooltipContent(config) {
        const content = document.createElement('div');
        const title = document.createElement('span');
        title.className = 'ui-tooltip__title';
        title.textContent = config.tooltipTitle || config.label || '';
        content.appendChild(title);

        (config.tooltipLines || []).filter(Boolean).forEach(line => {
            const body = document.createElement('span');
            body.className = 'ui-tooltip__body';
            body.textContent = line;
            content.appendChild(body);
        });

        return content;
    }

    showTooltip(element, autoHideMs = 0) {
        const config = element?._chipConfig;
        if (!config || !config.tooltipTitle) {
            return;
        }

        this.tooltipSystem.show({
            anchor: element,
            content: this.buildTooltipContent(config),
            autoHideMs
        });
    }

    hideTooltip(element) {
        if (this.tooltipSystem.isVisibleFor(element)) {
            this.tooltipSystem.hide();
        }
    }

    toggleTooltip(element) {
        const config = element?._chipConfig;
        if (!config || !config.tooltipTitle) {
            return;
        }

        this.tooltipSystem.toggle({
            anchor: element,
            content: this.buildTooltipContent(config),
            autoHideMs: 1600
        });
    }

    updateChipElement(element, config) {
        const refs = element._refs;
        element._chipConfig = config;
        element.className = `compact-chip ${config.className || ''}`.trim();
        element.classList.toggle('is-cancellable', config.cancellable === true);
        element.setAttribute('aria-label', [config.tooltipTitle, ...(config.tooltipLines || [])].filter(Boolean).join(' - '));

        refs.label.textContent = config.shortLabel || '';
        refs.badge.textContent = config.badgeText || '';
        refs.badge.style.display = config.badgeText ? 'inline-flex' : 'none';

        if (config.progressRatio == null) {
            refs.meter.style.display = 'none';
            refs.meterFill.style.width = '0%';
        } else {
            refs.meter.style.display = 'block';
            refs.meterFill.style.width = `${Math.round(Utility.clamp(config.progressRatio, 0, 1) * 100)}%`;
        }
    }

    update() {
        if (!this.host) return;

        const items = (this.getItems() || [])
            .slice(0, this.maxItems)
            .map((item, index) => this.getChipConfig(item, index))
            .filter(Boolean);

        const structureKey = items.map(config => config.key).join('|');
        const structureChanged = structureKey !== this.lastStructureKey;
        this.lastStructureKey = structureKey;

        const liveKeys = new Set(items.map(config => config.key));
        Array.from(this.elements.keys()).forEach(key => {
            if (liveKeys.has(key)) {
                return;
            }

            const element = this.elements.get(key);
            this.hideTooltip(element);
            element?.remove?.();
            this.elements.delete(key);
        });

        if (structureChanged) {
            const fragment = document.createDocumentFragment();
            items.forEach(config => {
                let element = this.elements.get(config.key);
                if (!element) {
                    element = this.createChipElement();
                    this.elements.set(config.key, element);
                }
                this.updateChipElement(element, config);
                fragment.appendChild(element);
            });
            this.host.replaceChildren(fragment);
        } else {
            items.forEach(config => {
                const element = this.elements.get(config.key);
                if (element) {
                    this.updateChipElement(element, config);
                }
            });
        }

        this.host.classList.toggle('has-items', items.length > 0);
    }

    dispose() {
        this.elements.forEach(element => this.hideTooltip(element));
        this.elements.clear();
        this.lastStructureKey = null;
    }
}
