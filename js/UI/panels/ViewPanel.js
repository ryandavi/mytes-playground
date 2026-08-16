class ViewPanel extends PanelSection {
    constructor(parent) {
        super(parent, { tab: 'view' });

        this.init();
        this.setupControls();
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

        const zoomIn = q('#view-zoom-in');
        if (zoomIn) zoomIn.onclick = () => this.getCamera()?.zoomIn({ immediate: true });

        // The readout is the reset — the same "click the number to put it back"
        // the debug panel's speed and time-scale controls use. A separate 1×
        // button was a second control for something the number already says.
        this._zoomLabel = q('#view-zoom-label');
        if (this._zoomLabel) this._zoomLabel.onclick = () => this.getCamera()?.resetZoom(true);

        // Every zoom path emits, so the label follows the wheel and the pinch as
        // well as these buttons.
        this._zoomUnsubscribe = this._getContainer()?.eventManager?.on?.(
            EVENTS.CAMERA_ZOOM_CHANGED, () => this.updateZoomLabel()
        );
        this.updateZoomLabel();

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

        this._wallControls = this.modalElement.querySelector('.wall-presentation-controls');
        if (this._wallControls) this._wallControls.hidden = SiteConfig.wallSystem?.enabled !== true;
        this._wallModeBtns = this.modalElement.querySelectorAll('.wall-mode-btn');
        this._wallModeBtns.forEach(btn => {
            btn.onclick = () => {
                // Same entry point the build panels use, so the two controls
                // can never disagree about what the player picked.
                this._getContainer()?.gameMap?.wallBuilder?.setUserPresentationMode(btn.dataset.value);
                this.updateWallMode();
            };
        });
        this._wallCursorToggle = this.modalElement.querySelector('#view-wall-cursor-toggle');
        if (this._wallCursorToggle) {
            this._wallCursorToggle.checked = this._getContainer()?.settings.wallCursorCutaway ?? true;
            this._wallCursorToggle.onchange = () => {
                const container = this._getContainer();
                if (!container) return;
                container.settings.wallCursorCutaway = this._wallCursorToggle.checked;
                container.gameMap?.wallBuilder?.evaluateCutaway(true);
            };
        }

        const events = this._getContainer()?.eventManager;
          this._wallReadyUnsubscribe = events?.on?.(EVENTS.WALL_READY, payload => this.updateWallMode(payload?.builder)) || null;
    }

    updateButtonStates() {
        const hasActiveMyte = !!this.parent.getActiveMyte();
        if (this._jumpMyte) this._jumpMyte.disabled = !hasActiveMyte;
        if (this._followMytBtn) this._followMytBtn.disabled = !hasActiveMyte;
    }

    dispose() {
        if (this.modalElement) {
            const q = (id) => this.modalElement.querySelector(id);
            ['#view-zoom-out', '#view-zoom-label', '#view-zoom-in',
             '#view-jump-myte', '#view-jump-fit', '#view-reset-camera'].forEach(id => {
                const el = q(id);
                if (el) el.onclick = null;
            });
            this._followModeBtns?.forEach(btn => { btn.onclick = null; });
            this._wallModeBtns?.forEach(btn => { btn.onclick = null; });
        }
        if (this._wallCursorToggle) this._wallCursorToggle.onchange = null;
        this._wallCursorToggle = null;
        if (this._shakeToggle)   this._shakeToggle.onchange = null;
        if (this._inertiaToggle) this._inertiaToggle.onchange = null;
        this._followModeBtns = null;
        this._wallModeBtns = null;
        this._wallReadyUnsubscribe?.();
        this._wallReadyUnsubscribe = null;
        this._shakeToggle    = null;
        this._inertiaToggle  = null;
        this._zoomUnsubscribe?.();
        this._zoomUnsubscribe = null;
        if (this._zoomLabel) this._zoomLabel.onclick = null;
        this._zoomLabel = null;
        super.dispose();
    }

    updateZoomLabel() {
        const camera = this.getCamera();
        const label = this._zoomLabel || this.modalElement?.querySelector('#view-zoom-label');
        if (!label || !camera) return;

        // The target, not the eased current value: the number is a readout of
        // what you asked for, and it should settle the moment you ask.
        const zoom = Number.isFinite(camera.targetZoomLevel) ? camera.targetZoomLevel : camera.zoomLevel;
        label.textContent = `${Math.round(zoom * 100)}%`;
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

      updateWallMode(builderOverride) {
          const builder = arguments.length > 0
              ? builderOverride
              : this._getContainer()?.gameMap?.wallBuilder;
        if (this._wallControls) this._wallControls.hidden = SiteConfig.wallSystem?.enabled !== true;
        this._wallModeBtns?.forEach(btn => {
            btn.classList.toggle('active', builder?.presentation === btn.dataset.value);
            btn.disabled = !builder;
        });
        if (this._wallCursorToggle) {
            this._wallCursorToggle.checked = this._getContainer()?.settings.wallCursorCutaway ?? true;
            this._wallCursorToggle.disabled = !builder;
        }
    }

    onSectionShown() {
        this.updateZoomLabel();
        this.updateFollowMode();
        this.updateButtonStates();
        this.updateWallMode();
    }
}
