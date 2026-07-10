class ScreenManager extends UIComponent {
    constructor(parent) {
        super(parent);
        this.headerElement = this.parent.containerWrapper.querySelector('.header');
        this.fullscreenButton = this.parent.containerWrapper.querySelector('.fullscreen-btn');
        this.userTextElement = this.headerElement?.querySelector('.user .username') || null;
        this.listenerCleanup = [];
    }

    init() {
        this.initializeButtons();
        this.initializeHeaderState();
    }

    static STORAGE_KEY = 'neko_fullscreen';

    initializeButtons() {
        if (this.fullscreenButton) {
            this.handleFullscreenClick = () => {
                this.toggleFullscreen();
            };
            this.fullscreenButton.addEventListener("click", this.handleFullscreenClick);
            this.listenerCleanup.push(() => this.fullscreenButton?.removeEventListener('click', this.handleFullscreenClick));
        }

        if (localStorage.getItem(ScreenManager.STORAGE_KEY) === '1') {
            this.parent.containerWrapper.classList.add('is-fullscreen');
            this.fullscreenButton?.classList.add('active');
            const camera = this.parent.parent.camera;
            if (camera) {
                requestAnimationFrame(() => {
                    const anchor = camera.getViewportCenterAnchor?.();
                    camera.zoomTo(camera.zoomLevel, { anchor, immediate: true });
                });
            }
        }
    }

    toggleFullscreen() {
        const camera = this.parent.parent.camera;
        const anchor = camera?.getViewportCenterAnchor ? camera.getViewportCenterAnchor() : null;

        const isNowFullscreen = this.parent.containerWrapper.classList.toggle('is-fullscreen');
        this.fullscreenButton?.classList.toggle('active', isNowFullscreen);
        localStorage.setItem(ScreenManager.STORAGE_KEY, isNowFullscreen ? '1' : '0');

        if (camera && anchor) {
            requestAnimationFrame(() => {
                camera.zoomTo(camera.zoomLevel, { anchor, immediate: true });
            });
        }
    }

    initializeHeaderState() {
        const user = this.parent.parent?.core?.user;

        if (this.userTextElement) {
            this.userTextElement.textContent = user?.username || 'Guest';
        }
    }

    dispose() {
        this.listenerCleanup.forEach(cleanup => cleanup());
        this.listenerCleanup = [];
    }
}
