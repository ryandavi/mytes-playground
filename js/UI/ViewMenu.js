class ViewMenu extends ModalWindow {
    constructor(parent) {
        super(parent, {
            id: 'view-panel',
            buttonId: 'view-toggle',
            closeOnOutsideClick: false,
            position: 'top-right',
            draggable: true,
            closeButtonSelector: '.modal-close-btn'
        });

        this.init();
        this.setupControls();
    }

    buttonLeftClick(e) {
        e.preventDefault();
        e.stopPropagation();
        this.toggle();
        return false;
    }

    buttonRightClick(e) {
        this.buttonLeftClick(e);
    }

    getCamera() {
        return this.parent.parent.camera;
    }

    setupControls() {
        if (!this.modalElement) return;

        // Zoom buttons
        this.modalElement.querySelector('#view-zoom-out')?.addEventListener('click', () => {
            this.getCamera()?.zoomOut({ immediate: true });
        });
        this.modalElement.querySelector('#view-zoom-reset')?.addEventListener('click', () => {
            this.getCamera()?.resetZoom(true);
            this.updateZoomLabel();
        });
        this.modalElement.querySelector('#view-zoom-in')?.addEventListener('click', () => {
            this.getCamera()?.zoomIn({ immediate: true });
        });

        // Jump / reset buttons
        this.modalElement.querySelector('#view-jump-myte')?.addEventListener('click', () => {
            this.getCamera()?.centerOnActiveMyte(true);
        });
        this.modalElement.querySelector('#view-jump-fit')?.addEventListener('click', () => {
            this.getCamera()?.fitMap('contain', true);
        });
        this.modalElement.querySelector('#view-reset-camera')?.addEventListener('click', () => {
            this.getCamera()?.reset();
        });

        // Follow mode buttons
        this.modalElement.querySelectorAll('.follow-mode-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const mode = parseInt(btn.dataset.mode, 10);
                this.getCamera()?.setMode(mode);
                this.updateFollowMode();
            });
        });
    }

    updateZoomLabel() {
        const camera = this.getCamera();
        const label = this.modalElement?.querySelector('#view-zoom-label');
        if (label && camera) {
            label.textContent = `${Math.round(camera.zoomLevel * 100)}%`;
        }
    }

    updateFollowMode() {
        const camera = this.getCamera();
        if (!camera || !this.modalElement) return;

        const current = camera.followMode;
        this.modalElement.querySelectorAll('.follow-mode-btn').forEach(btn => {
            const mode = parseInt(btn.dataset.mode, 10);
            btn.classList.toggle('active', mode === current);
        });
    }

    open() {
        this.updateZoomLabel();
        this.updateFollowMode();
        super.open();
    }
}
