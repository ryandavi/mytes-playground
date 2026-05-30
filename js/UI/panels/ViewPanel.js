class ViewPanel extends ModalWindow {
    constructor(parent) {
        super(parent, {
            id: 'view-panel',
            buttonId: 'view-toggle',
            closeOnOutsideClick: false,
            position: 'top-right',
            draggable: true,
            closeButtonSelector: '.modal-close-btn'
        });

        this.init(); // explicit — subclass state is ready before any virtual method call
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

    _getContainer() {
        return this.parent.parent;
    }

    setupControls() {
        if (!this.modalElement) return;

        const q = (id) => this.modalElement.querySelector(id);

        // Zoom buttons
        const zoomOut = q('#view-zoom-out');
        if (zoomOut) zoomOut.onclick = () => this.getCamera()?.zoomOut({ immediate: true });

        const zoomReset = q('#view-zoom-reset');
        if (zoomReset) zoomReset.onclick = () => { this.getCamera()?.resetZoom(true); this.updateZoomLabel(); };

        const zoomIn = q('#view-zoom-in');
        if (zoomIn) zoomIn.onclick = () => this.getCamera()?.zoomIn({ immediate: true });

        // Jump / reset buttons
        this._jumpMyte = q('#view-jump-myte');
        if (this._jumpMyte) this._jumpMyte.onclick = () => this.getCamera()?.centerOnActiveMyte(true);

        const jumpFit = q('#view-jump-fit');
        if (jumpFit) jumpFit.onclick = () => this.getCamera()?.fitMap('contain', true);

        const resetCamera = q('#view-reset-camera');
        if (resetCamera) resetCamera.onclick = () => this.getCamera()?.reset();

        // Camera option toggles
        this._shakeToggle = q('#view-shake-toggle');
        if (this._shakeToggle) {
            this._shakeToggle.checked = this._getContainer()?.settings.cameraShake ?? true;
            this._shakeToggle.onchange = () => {
                const container = this._getContainer();
                if (container) container.settings.cameraShake = this._shakeToggle.checked;
            };
        }

        this._inertiaToggle = q('#view-inertia-toggle');
        if (this._inertiaToggle) {
            this._inertiaToggle.checked = this._getContainer()?.settings.panInertia ?? true;
            this._inertiaToggle.onchange = () => {
                const container = this._getContainer();
                if (container) container.settings.panInertia = this._inertiaToggle.checked;
            };
        }

        // Follow mode buttons — store references for disposal
        this._followModeBtns = this.modalElement.querySelectorAll('.follow-mode-btn');
        this._followModeBtns.forEach(btn => {
            btn.onclick = () => {
                const mode = parseInt(btn.dataset.mode, 10);
                this.getCamera()?.setMode(mode);
                this.updateFollowMode();
            };
        });

        this._followMytBtn = this.modalElement.querySelector('.follow-mode-btn[data-mode="0"]');
    }

    updateButtonStates() {
        const hasActiveMyte = !!this.parent.getActiveMyte();
        if (this._jumpMyte) this._jumpMyte.disabled = !hasActiveMyte;
        if (this._followMytBtn) this._followMytBtn.disabled = !hasActiveMyte;
    }

    dispose() {
        if (this.modalElement) {
            const q = (id) => this.modalElement.querySelector(id);
            ['#view-zoom-out', '#view-zoom-reset', '#view-zoom-in',
             '#view-jump-myte', '#view-jump-fit', '#view-reset-camera'].forEach(id => {
                const el = q(id);
                if (el) el.onclick = null;
            });
            this._followModeBtns?.forEach(btn => { btn.onclick = null; });
        }
        if (this._shakeToggle)   this._shakeToggle.onchange = null;
        if (this._inertiaToggle) this._inertiaToggle.onchange = null;
        this._followModeBtns = null;
        this._shakeToggle    = null;
        this._inertiaToggle  = null;
        super.dispose();
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
        this.updateButtonStates();
        super.open();
    }
}
