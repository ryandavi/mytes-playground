class QueueUI {
    constructor(parent) {
        this.parent = parent;
        this.queue = document.querySelector('.queueMenu');
        this.elements = new Map();
        this.previousValues = new Map();
        this.allowControls = true;
    }

    createQueueItem(item) {
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
                if (Number.isFinite(index)) {
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
        if (item.duration && item.duration > 0) {
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

    getTargetIdentifier(target) {
        if (!target) return null;

        if (target.type && target.variant) {
            return `${target.type}-${target.variant}-${target.posX?.toFixed(0) || 0}-${target.posY?.toFixed(0) || 0}`;
        }

        return target.constructor?.name || 'Unknown';
    }

    updateQueueItem(element, item, index) {
        const key = `queue-${index}`;
        const refs = element._refs;
        element.dataset.index = String(index);

        const targetId = this.getTargetIdentifier(item.target);
        const simplifiedValue = {
            targetId,
            repeat: item.repeat,
            name: item.constructor.name,
            isCurrent: index === 0,
            hasProgress: !!(item.duration && item.duration > 0),
            expressionType: item.type || null
        };
        const currentValue = JSON.stringify(simplifiedValue);

        if (this.previousValues.get(key) !== currentValue) {
            element.className = `queue-item ${item.constructor.metadata?.category || ''}${index === 0 ? ' current' : ''}`;

            refs.number.textContent = `#${index + 1}`;
            refs.name.textContent = item.constructor.name.replace('Action', '');
            refs.description.innerHTML = '';
            refs.status = null;

            if (item.target || item.element) {
                const arrow = document.createElement('span');
                arrow.className = 'arrow';
                arrow.textContent = '->';
                refs.description.appendChild(arrow);

                const target = document.createElement('span');
                target.className = 'target';
                if (item.target) {
                    target.textContent = item.target.constructor.name;
                } else if (item.element) {
                    target.textContent = `${item.element.tagName}${item.target ? ` (${item.target.x?.toFixed(0) || 0}, ${item.target.y?.toFixed(0) || 0})` : ''}`;
                }
                refs.description.appendChild(target);
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
            if (index === 0 && item.duration && item.duration > 0) {
                refs.progress.style.display = 'block';
                const percentage = this.calculateProgress(item);
                if (refs.bar) refs.bar.style.width = `${percentage}%`;
                if (refs.status) refs.status.textContent = `${percentage}%`;
            } else {
                refs.progress.style.display = 'none';
            }
        }
    }

    calculateProgress(item) {
        if (item.currentDuration === -1) return 0;
        return Math.round(100 - (item.currentDuration / item.duration * 100));
    }

    update() {
        if (!this.parent.activeMyte || !this.queue) {
            if (this.queue) {
                this.queue.innerHTML = '';
                this.elements.clear();
                this.previousValues.clear();
            }
            return;
        }

        const queueItems = this.parent.activeMyte.queue.queue;

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
                this.queue.appendChild(element);
            }

            this.updateQueueItem(element, item, index);
        });
    }

    setControlsEnabled(enabled) {
        this.allowControls = enabled;
        this.update();
    }

    dispose() {
        this.queue?.replaceChildren();
        this.elements.clear();
        this.previousValues.clear();
    }
}
