class ScreenManager extends UIComponent {
    constructor(parent) {
        super(parent);
        this.headerElement = this.parent.containerWrapper.querySelector('.header');
        this.fullscreenButton = this.parent.containerWrapper.querySelector('.fullscreen-btn');
        this.timeTextElement = this.headerElement?.querySelector('.date-time .username') || null;
        this.userTextElement = this.headerElement?.querySelector('.user .username') || null;
        this.listenerCleanup = [];
        this.timeSubscription = null;
    }

    init() {
        this.initializeButtons();
        this.initializeHeaderState();
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

    initializeHeaderState() {
        const timeManager = this.parent.parent?.timeManager;
        const user = this.parent.parent?.core?.user;

        if (this.userTextElement) {
            this.userTextElement.textContent = user?.username || 'Guest';
        }

        if (timeManager?.subscribe) {
            this.handleTimeUpdate = (timeData = {}) => {
                if (this.timeTextElement) {
                    this.timeTextElement.textContent = timeData.formattedTime || '--:--';
                }

                if (this.headerElement) {
                    this.headerElement.title = timeData.formattedDate || '';
                }
            };

            timeManager.subscribe('minute', this.handleTimeUpdate);
            this.timeSubscription = { timeManager, callback: this.handleTimeUpdate };
        }
    }

    dispose() {
        if (this.timeSubscription) {
            this.timeSubscription.timeManager?.unsubscribe?.('minute', this.timeSubscription.callback);
            this.timeSubscription = null;
        }
        this.listenerCleanup.forEach(cleanup => cleanup());
        this.listenerCleanup = [];
    }
}
