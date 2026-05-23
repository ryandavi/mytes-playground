class ScreenManager extends UIComponent {
    constructor(parent) {
        super(parent);
        this.headerElement = this.parent.containerWrapper.querySelector('.header');
        this.fullscreenButton = this.parent.containerWrapper.querySelector('.fullscreen-btn');
        this.listenerCleanup = [];
    }

    init() {
        this.initializeButtons();
    }

    initializeButtons() {
        if (this.fullscreenButton) {
            this.handleFullscreenClick = () => {
                this.toggleFullscreen();
            };
            this.fullscreenButton.addEventListener("click", this.handleFullscreenClick);
            this.listenerCleanup.push(() => this.fullscreenButton?.removeEventListener('click', this.handleFullscreenClick));
        }
    }

    toggleFullscreen() {
        const camera = this.parent.parent.camera;
        const anchor = camera?.getViewportCenterAnchor ? camera.getViewportCenterAnchor() : null;

        // toggle class on container
        this.parent.containerWrapper.classList.toggle('is-fullscreen');
        if (this.fullscreenButton) {
            this.fullscreenButton.classList.toggle('active');
        }

        if (camera && anchor) {
            requestAnimationFrame(() => {
                camera.zoomTo(camera.zoomLevel, { anchor, immediate: true });
            });
        }
    }

    dispose() {
        this.listenerCleanup.forEach(cleanup => cleanup());
        this.listenerCleanup = [];
    }
}
