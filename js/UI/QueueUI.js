class QueueUI {
    constructor(parent) {
        this.parent = parent;
        this.queue = document.querySelector(".queueMenu");
        this.elements = new Map();
        this.previousValues = new Map();
        this.allowControls = true;
    }

    createQueueItem(item) {
        const element = document.createElement('div');
        element.className = 'queue-item';
        
        const content = document.createElement('div');
        content.className = 'content';

        // Number
        const number = document.createElement('span');
        number.className = 'number';
		content.appendChild(number);

        // Information section
        const information = document.createElement('div');
        information.className = 'information';

        // Title section with controls
        const title = document.createElement('div');
        title.className = 'title';

        const name = document.createElement('span');
        name.className = 'name';

        if (this.allowControls) {
            const controls = document.createElement('div');
            controls.className = 'controls';
            
            const skipBtn = document.createElement('button');
            skipBtn.className = 'skip';
            skipBtn.innerHTML = '⏭️';
            skipBtn.title = 'Skip action';
            
            const removeBtn = document.createElement('button');
            removeBtn.className = 'remove';
            removeBtn.innerHTML = '✖️';
            removeBtn.title = 'Remove action';
            
            controls.appendChild(skipBtn);
            controls.appendChild(removeBtn);
            title.appendChild(controls);
        }

        title.insertBefore(name, title.firstChild);
        information.appendChild(title);

        // Description section
        const description = document.createElement('div');
        description.className = 'description';
        information.appendChild(description);

		content.appendChild(information);

        // Progress bar
		if(item.duration && item.duration > 0){
			const progress = document.createElement('div');
			progress.className = 'progress';
			const bar = document.createElement('div');
			bar.className = 'bar';
			progress.appendChild(bar);

			content.appendChild(progress);
		}

        
        element.appendChild(content);

        return element;
    }

    // Helper function to safely get an identifier for a target object
    getTargetIdentifier(target) {
        if (!target) return null;
        
        // For map objects, use type and variant
        if (target.type && target.variant) {
            return `${target.type}-${target.variant}-${target.posX?.toFixed(0) || 0}-${target.posY?.toFixed(0) || 0}`;
        }
        
        // For other objects, use a class name or some other identifier
        return target.constructor?.name || 'Unknown';
    }

    updateQueueItem(element, item, index) {
        const key = `queue-${index}`;
        
        // Instead of stringifying the whole item (which may have circular references),
        // create a simple object with just the properties we care about for comparison
        const targetId = this.getTargetIdentifier(item.target);
        const simplifiedValue = {
            targetId: targetId,
            repeat: item.repeat,
            name: item.constructor.name
        };
        const currentValue = JSON.stringify(simplifiedValue);
        
        if (this.previousValues.get(key) !== currentValue) {
            element.className = `queue-item ${item.constructor.metadata?.category || ''}${index === 0 ? ' current' : ''}`;

            const content = element.querySelector('.content');
            const number = content.querySelector('.number');
            const name = content.querySelector('.name');
            const description = content.querySelector('.description');
            
            // Update number
            number.textContent = `#${index + 1}`;

            // Update name
            name.textContent = item.constructor.name.replace('Action', '');

            // Update description
            description.innerHTML = '';

            // Add target information
            if (item.target || item.element) {
                const arrow = document.createElement('span');
                arrow.className = 'arrow';
                arrow.textContent = '→';
                description.appendChild(arrow);

                const target = document.createElement('span');
                target.className = 'target';
                if (item.target) {
                    target.textContent = item.target.constructor.name;
                } else if (item.element) {
                    target.textContent = `${item.element.tagName}${item.target ? ` (${item.target.x?.toFixed(0) || 0}, ${item.target.y?.toFixed(0) || 0})` : ''}`;
                }
                description.appendChild(target);
            }

            // Add expression type
            if (item.constructor.name === 'ExpressionAction') {
                const type = document.createElement('span');
                type.className = 'target';
                type.textContent = `[${item.type}]`;
                description.appendChild(type);
            }

            // Add repeats
            if (item.repeat && item.repeat > 1) {
                const repeats = document.createElement('span');
                repeats.className = 'repeats';
                repeats.textContent = `×${item.repeat}`;
                description.appendChild(repeats);
            }

            // Add status for current action
			if(index == 0){
				const status = document.createElement('span');
				status.className = 'status';
				status.textContent = item.duration && item.duration > 0 ? 
				`${this.calculateProgress(item)}%`:
					'in progress'
				description.appendChild(status);
			}
            
            this.previousValues.set(key, currentValue);
        }

        // Update controls
        if (this.allowControls) {
            const controls = element.querySelector('.controls');
            const skipBtn = controls.querySelector('.skip');
            skipBtn.style.display = index === 0 ? 'block' : 'none';
            
            if (index === 0) {
                skipBtn.onclick = (e) => {
                    e.stopPropagation();
                    this.parent.activeMyte.queue.removeCurrentAction();
                };
            }

            const removeBtn = controls.querySelector('.remove');
            removeBtn.onclick = (e) => {
                e.stopPropagation();
                this.parent.activeMyte.queue.queue.splice(index, 1);
            };
        }

		// Update progress bar
		const progress = element.querySelector('.progress');
		if (progress) {  // Check if progress element exists
			if (index === 0 && item.duration && item.duration > 0) {
				progress.style.display = 'block';
				const bar = progress.querySelector('.bar');
				const percentage = this.calculateProgress(item);
				bar.style.width = `${percentage}%`;
			} else {
				progress.style.display = 'none';
			}
		}
    }

    calculateProgress(item) {
        if (item.current_duration === -1) return 0;
        return Math.round(100 - (item.current_duration / item.duration * 100));
    }

    update() {
        if (!this.parent.activeMyte || !this.queue) {
            // Clear queue if it exists
            if (this.queue) {
                this.queue.innerHTML = '';
                this.elements.clear();
                this.previousValues.clear();
            }
            return;
        }

        const queueItems = this.parent.activeMyte.queue.queue;
        
        // Remove excess elements
        while (this.elements.size > queueItems.length) {
            const key = `queue-${this.elements.size - 1}`;
            const element = this.elements.get(key);
            element.remove();
            this.elements.delete(key);
            this.previousValues.delete(key);
        }

        // Update or create elements for each queue item
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
}