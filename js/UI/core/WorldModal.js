class WorldModal extends ModalWindow {
    constructor(parent, options = {}) {
        const worldOptions = {
            id: null,
            title: '',
            icon: '',
            closeOnBackdrop: true,
            draggable: true,
            ...options
        };

        super(parent, {
            id: worldOptions.id,
            title: worldOptions.title,
            floating: true,
            position: 'center',
            draggable: worldOptions.draggable,
            closeOnOutsideClick: false,
            allowMultipleWindows: true,
            rememberPosition: true,
            autoInit: false
        });

        this.worldOptions = worldOptions;
        this.hasManualPosition = false;
        this.options.dragBoundsElement = () => this.layerElement;
        this.boundSyncBounds = this.syncBounds.bind(this);
        this.build();
        this.init();
    }

    build() {
        const stage = this.parent?.parent?.element;
        if (!stage || !this.worldOptions.id) return;
        this.stageElement = stage;

        this.layerElement = document.createElement('div');
        this.layerElement.className = 'world-modal-layer ignore';
        this.layerElement.id = `${this.worldOptions.id}-layer`;
        this.layerElement.hidden = true;

        this.modalElement = document.createElement('section');
        this.modalElement.className = 'window-panel world-modal';
        this.modalElement.id = this.worldOptions.id;
        this.modalElement.setAttribute('role', 'dialog');
        this.modalElement.setAttribute('aria-modal', 'true');

        const header = document.createElement('header');
        header.className = 'window-panel__header world-modal__header';
        const title = document.createElement('h2');
        title.className = 'window-panel__title world-modal__title';
        this.iconElement = Utility.createIcon('');
        this.titleTextElement = document.createElement('span');
        this.titleTextElement.className = 'text';
        title.append(this.iconElement, this.titleTextElement);

        const controls = document.createElement('div');
        controls.className = 'window-panel__controls';
        const closeButton = document.createElement('button');
        closeButton.className = 'modal-close-btn world-modal__close';
        closeButton.type = 'button';
        closeButton.setAttribute('aria-label', 'Close');
        closeButton.textContent = '×';
        controls.appendChild(closeButton);
        header.append(title, controls);

        this.bodyElement = document.createElement('div');
        this.bodyElement.className = 'window-panel__content world-modal__body';
        this.modalElement.append(header, this.bodyElement);
        this.layerElement.appendChild(this.modalElement);
        document.body.appendChild(this.layerElement);

        this.setTitle(this.worldOptions.title);
        this.setIcon(this.worldOptions.icon);
        this.resizeObserver = typeof ResizeObserver === 'function'
            ? new ResizeObserver(this.boundSyncBounds)
            : null;
        this.resizeObserver?.observe(stage);
        window.addEventListener('resize', this.boundSyncBounds);
        window.addEventListener('scroll', this.boundSyncBounds, { passive: true });

        this.layerElement.addEventListener('pointerdown', event => {
            event.stopPropagation();
            if (this.worldOptions.closeOnBackdrop && event.target === this.layerElement) this.close();
        });
        this.modalElement.addEventListener('click', event => event.stopPropagation());
    }

    setTitle(title) {
        if (this.titleTextElement) this.titleTextElement.textContent = String(title || '');
    }

    // `icon` is a sprite symbol name from the #icon-sprite block in index.html.
    setIcon(icon) {
        if (!this.iconElement) return;
        Utility.setIcon(this.iconElement, icon);
        this.iconElement.hidden = !icon;
    }

    setContent(content) {
        if (!this.bodyElement) return;
        this.bodyElement.replaceChildren();
        if (content) this.bodyElement.appendChild(content);
    }

    syncBounds() {
        if (!this.layerElement || !this.stageElement) return;
        const rect = this.stageElement.getBoundingClientRect();
        this.layerElement.style.left = `${rect.left}px`;
        this.layerElement.style.top = `${rect.top}px`;
        this.layerElement.style.width = `${rect.width}px`;
        this.layerElement.style.height = `${rect.height}px`;
        if (this.isVisible && !this.hasManualPosition) this.centerInStage();
    }

    centerInStage() {
        if (!this.modalElement || !this.stageElement) return;
        const stageRect = this.stageElement.getBoundingClientRect();
        const modalRect = this.modalElement.getBoundingClientRect();
        this.modalElement.classList.remove(
            'position-center',
            'position-top-right',
            'position-top-left',
            'position-bottom-right',
            'position-bottom-left'
        );
        this.modalElement.style.left = `${stageRect.left + ((stageRect.width - modalRect.width) / 2)}px`;
        this.modalElement.style.top = `${stageRect.top + ((stageRect.height - modalRect.height) / 2)}px`;
        this.modalElement.style.transform = '';
    }

    handleDragStart(event) {
        super.handleDragStart(event);
        if (this.isDragging) this.hasManualPosition = true;
    }

    open() {
        if (!this.layerElement || this.isVisible) return;
        const needsInitialPlacement = !this.hasManualPosition && !this.modalElement.style.left;
        if (needsInitialPlacement) this.modalElement.classList.add('is-positioning');
        this.layerElement.hidden = false;
        this.syncBounds();
        if (!this.hasManualPosition) this.centerInStage();
        if (needsInitialPlacement) {
            void this.modalElement.offsetWidth;
            this.modalElement.classList.remove('is-positioning');
        }
        super.open();
        this.modalElement.querySelector('button, [href], input, select, textarea')?.focus();
    }

    close() {
        if (!this.layerElement || !this.isVisible) return;
        super.close();
        this.layerElement.hidden = true;
    }

    dispose() {
        this.resizeObserver?.disconnect();
        window.removeEventListener('resize', this.boundSyncBounds);
        window.removeEventListener('scroll', this.boundSyncBounds);
        super.dispose();
        this.layerElement?.remove();
        this.resizeObserver = null;
        this.stageElement = null;
        this.layerElement = null;
        this.modalElement = null;
        this.titleTextElement = null;
        this.iconElement = null;
        this.bodyElement = null;
    }
}
