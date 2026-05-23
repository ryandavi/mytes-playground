class QueueUI {
    constructor(parent, options = {}) {
        this.parent = parent;
        this.mode = options.mode || 'debug';
        this.queue = options.element || document.querySelector('.action-queue-panel');
        this.elements = new Map();
        this.previousValues = new Map();
        this.allowControls = options.allowControls ?? this.mode !== 'compact';
        this.maxItems = Number.isFinite(options.maxItems) ? options.maxItems : Infinity;
        this.holdDelay = Number.isFinite(options.holdDelay) ? options.holdDelay : 550;
        this.panelShell = null;
        this.panelSummary = null;
        this.itemsHost = this.queue;
        this.isCollapsed = false;

        if (this.mode === 'debug' && this.queue) {
            this._buildPanelShell();
        }
    }

    _buildPanelShell() {
        this.panelShell = document.createElement('details');
        this.panelShell.className = 'queue-panel-shell';
        this.panelShell.open = true;

        this.panelSummary = document.createElement('summary');
        this.panelSummary.textContent = 'Debug – Action Queue';

        this.itemsHost = document.createElement('div');
        this.itemsHost.className = 'queue-panel-body';

        this._emptyState = document.createElement('div');
        this._emptyState.className = 'queue-empty-state';
        this._emptyState.textContent = 'No active myte';

        this.panelShell.appendChild(this.panelSummary);
        this.panelShell.appendChild(this.itemsHost);
        this.panelShell.appendChild(this._emptyState);
        this.queue.replaceChildren(this.panelShell);
    }

    setEmptyStateMessage(message) {
        if (this._emptyState) {
            this._emptyState.textContent = message;
        }
    }

    clearItems() {
        this.elements.forEach(el => el.remove());
        this.elements.clear();
        this.previousValues.clear();
    }

    setCollapsed(collapsed) {
        this.isCollapsed = collapsed;
        if (this.panelShell) {
            this.panelShell.open = !collapsed;
        }
    }

    createQueueItem(item) {
        if (this.mode === 'compact') {
            return this.createCompactQueueItem();
        }

        const element = document.createElement('div');
        element.className = 'queue-item';

        const content = document.createElement('div');
        content.className = 'content';

        const number = document.createElement('span');
        number.className = 'number';
        content.appendChild(number);

        const information = document.createElement('div');
        information.className = 'information';

        const title = document.createElement('div');
        title.className = 'title';

        const name = document.createElement('span');
        name.className = 'name';

        let controls = null;
        let skipBtn = null;
        let removeBtn = null;

        if (this.allowControls) {
            controls = document.createElement('div');
            controls.className = 'controls';

            skipBtn = document.createElement('button');
            skipBtn.className = 'skip';
            skipBtn.textContent = '>>';
            skipBtn.title = 'Skip action';

            removeBtn = document.createElement('button');
            removeBtn.className = 'remove';
            removeBtn.textContent = 'X';
            removeBtn.title = 'Remove action';

            skipBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const index = Number(element.dataset.index);
                if (index === 0) {
                    this.parent.activeMyte?.queue?.removeCurrentAction?.();
                }
            });

            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const index = Number(element.dataset.index);
                if (!Number.isFinite(index)) return;
                if (index === 0) {
                    this.parent.activeMyte?.queue?.removeCurrentAction?.();
                } else {
                    this.parent.activeMyte?.queue?.queue?.splice(index, 1);
                }
            });

            controls.appendChild(skipBtn);
            controls.appendChild(removeBtn);
            title.appendChild(controls);
        }

        title.insertBefore(name, title.firstChild);
        information.appendChild(title);

        const description = document.createElement('div');
        description.className = 'description';
        information.appendChild(description);
        content.appendChild(information);

        let progress = null;
        let bar = null;
        if ((item.duration && item.duration > 0) || typeof item.getProgress === 'function') {
            progress = document.createElement('div');
            progress.className = 'progress';
            bar = document.createElement('div');
            bar.className = 'bar';
            progress.appendChild(bar);
            content.appendChild(progress);
        }

        element.appendChild(content);
        element._refs = {
            number,
            name,
            description,
            controls,
            skipBtn,
            removeBtn,
            progress,
            bar,
            status: null
        };

        return element;
    }

    createCompactQueueItem() {
        const element = document.createElement('button');
        element.className = 'queue-item compact';
        element.type = 'button';

        const icon = document.createElement('span');
        icon.className = 'queue-icon';

        const order = document.createElement('span');
        order.className = 'queue-order';

        const tooltip = document.createElement('span');
        tooltip.className = 'queue-tooltip';

        element.appendChild(order);
        element.appendChild(icon);
        element.appendChild(tooltip);
        element._holdTimer = null;
        element._holdTriggered = false;

        const clearHoldTimer = () => {
            if (element._holdTimer) {
                clearTimeout(element._holdTimer);
                element._holdTimer = null;
            }

            if (!element._holdTriggered) {
                element.classList.remove('holding');
            }
        };

        const cancelQueuedAction = () => {
            const index = Number(element.dataset.index);
            if (!Number.isFinite(index)) return;

            const activeMyte = this.parent.activeMyte;
            if (!activeMyte?.queue) return;

            if (index === 0) {
                activeMyte.queue.removeCurrentAction?.();
            } else if (Array.isArray(activeMyte.queue.queue)) {
                activeMyte.queue.queue.splice(index, 1);
            }
        };

        element.addEventListener('pointerdown', (event) => {
            event.preventDefault();
            element._holdTriggered = false;
            clearHoldTimer();
            element.classList.add('holding');
            element._holdTimer = setTimeout(() => {
                element._holdTriggered = true;
                element.classList.remove('holding');
                cancelQueuedAction();
            }, this.holdDelay);
        });

        ['pointerup', 'pointerleave', 'pointercancel', 'lostpointercapture'].forEach(eventName => {
            element.addEventListener(eventName, clearHoldTimer);
        });

        element.addEventListener('click', (event) => {
            if (element._holdTriggered) {
                event.preventDefault();
                event.stopPropagation();
                element._holdTriggered = false;
                return;
            }

            element.classList.toggle('show-tooltip');
            window.setTimeout(() => {
                element.classList.remove('show-tooltip');
            }, 1500);
        });

        element._refs = { icon, order, tooltip };
        return element;
    }

    getTargetIdentifier(target) {
        if (!target) return null;

        if (target.type && target.variant) {
            return `${target.type}-${target.variant}-${target.posX?.toFixed(0) || 0}-${target.posY?.toFixed(0) || 0}`;
        }

        return target.constructor?.name || 'Unknown';
    }

    getQueueTitle(item) {
        return item.getQueueTitle?.() || item.constructor.metadata?.label || item.constructor.name.replace('Action', '');
    }

    getQueueDescription(item) {
        return item.getQueueDescription?.() || '';
    }

    getCompactLabel(item) {
        const title = this.getQueueTitle(item);
        const words = String(title)
            .trim()
            .split(/[^a-zA-Z0-9]+/)
            .filter(Boolean);

        if (words.length === 0) return 'Q';
        if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
        return `${words[0][0]}${words[1][0]}`.toUpperCase();
    }

    updateQueueItem(element, item, index) {
        if (this.mode === 'compact') {
            this.updateCompactQueueItem(element, item, index);
            return;
        }

        const key = `queue-${index}`;
        const refs = element._refs;
        element.dataset.index = String(index);

        const targetId = this.getTargetIdentifier(item.target);
        const simplifiedValue = {
            targetId,
            repeat: item.repeat,
            name: item.constructor.name,
            queueTitle: this.getQueueTitle(item),
            queueDescription: this.getQueueDescription(item),
            isCurrent: index === 0,
            hasProgress: !!(item.duration && item.duration > 0),
            expressionType: item.type || null
        };
        const currentValue = JSON.stringify(simplifiedValue);

        if (this.previousValues.get(key) !== currentValue) {
            element.className = `queue-item ${item.constructor.metadata?.category || ''}${index === 0 ? ' is-current' : ''}`;

            refs.number.textContent = `#${index + 1}`;
            refs.name.textContent = this.getQueueTitle(item);
            refs.description.innerHTML = '';
            refs.status = null;

            const queueDescription = this.getQueueDescription(item);
            if (queueDescription) {
                const detail = document.createElement('span');
                detail.className = 'target';
                detail.textContent = queueDescription;
                refs.description.appendChild(detail);
            }

            if (item.constructor.name === 'ExpressionAction') {
                const type = document.createElement('span');
                type.className = 'target';
                type.textContent = `[${item.type}]`;
                refs.description.appendChild(type);
            }

            if (item.repeat && item.repeat > 1) {
                const repeats = document.createElement('span');
                repeats.className = 'repeats';
                repeats.textContent = `x${item.repeat}`;
                refs.description.appendChild(repeats);
            }

            if (index === 0) {
                const status = document.createElement('span');
                status.className = 'status';
                status.textContent = item.duration && item.duration > 0
                    ? `${this.calculateProgress(item)}%`
                    : 'in progress';
                refs.description.appendChild(status);
                refs.status = status;
            }

            this.previousValues.set(key, currentValue);
        }

        if (this.allowControls && refs.skipBtn) {
            refs.skipBtn.style.display = index === 0 ? 'block' : 'none';
        }

        if (refs.progress) {
            const hasProgress = index === 0 && ((item.duration && item.duration > 0) || typeof item.getProgress === 'function');
            if (hasProgress) {
                refs.progress.style.display = 'block';
                const percentage = this.calculateProgress(item);
                if (refs.bar) refs.bar.style.width = `${percentage}%`;
                if (refs.status) refs.status.textContent = `${percentage}%`;
            } else {
                refs.progress.style.display = 'none';
            }
        }
    }

    updateCompactQueueItem(element, item, index) {
        const refs = element._refs;
        const title = this.getQueueTitle(item);
        const description = this.getQueueDescription(item);
        const tooltipParts = [title];

        if (description) {
            tooltipParts.push(description);
        }

        tooltipParts.push(`Hold to cancel${index === 0 ? ' current action' : ''}.`);

        element.className = `queue-item compact ${item.constructor.metadata?.category || ''}${index === 0 ? ' is-current' : ''}`;
        element.dataset.index = String(index);
        element.dataset.queueTitle = title;
        element.dataset.queueDescription = description;
        element.dataset.queueState = index === 0 ? 'now' : 'next';
        // element.title = `${index === 0 ? 'Now' : `Next ${index}`}: ${title}${description ? ` - ${description}` : ''}`;
        refs.icon.textContent = this.getCompactLabel(item);
        // refs.order.textContent = index === 0 ? 'NOW' : String(index);
        refs.tooltip.textContent = tooltipParts.join(' · ');
    }

    calculateProgress(item) {
        if (typeof item.getProgress === 'function') {
            return Math.round(item.getProgress() * 100);
        }
        if (item.currentDuration === -1) return 0;
        return Math.round(100 - (item.currentDuration / item.duration * 100));
    }

    update() {
        if (!this.queue) return;

        const activeMyte = this.parent.activeMyte;
        const queueItems = activeMyte?.queue?.queue
            ? activeMyte.queue.queue.slice(0, this.maxItems)
            : [];

        this.setEmptyStateMessage(activeMyte ? 'No actions queued' : 'No active myte');
        this.queue.classList.toggle('has-items', queueItems.length > 0);
        if (this._emptyState) this._emptyState.style.display = queueItems.length === 0 ? 'block' : 'none';

        if (!activeMyte) {
            this.clearItems();
            return;
        }

        while (this.elements.size > queueItems.length) {
            const key = `queue-${this.elements.size - 1}`;
            const element = this.elements.get(key);
            element.remove();
            this.elements.delete(key);
            this.previousValues.delete(key);
        }

        queueItems.forEach((item, index) => {
            const key = `queue-${index}`;
            let element = this.elements.get(key);

            if (!element) {
                element = this.createQueueItem(item);
                this.elements.set(key, element);
                this.itemsHost.appendChild(element);
            }

            this.updateQueueItem(element, item, index);
        });
    }

    setControlsEnabled(enabled) {
        this.allowControls = enabled;
        this.update();
    }

    dispose() {
        this.elements.forEach(el => el.remove());
        this.elements.clear();
        this.previousValues.clear();
        this.panelShell?.remove();
        this.panelShell = null;
        this.panelSummary = null;
        this.itemsHost = this.queue;
    }
}
