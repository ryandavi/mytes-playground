class ScreenManager extends UIComponent {
    constructor(parent) {
        super(parent);
        this.headerElement = this.parent.containerWrapper.querySelector('.header');
        this.fullscreenButton = this.parent.containerWrapper.querySelector('.fullscreen-btn');
        this.userTextElement = this.headerElement?.querySelector('.username .username__text') || null;
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
            this.setFullscreen(true);
        }
    }

    toggleFullscreen() {
        this.setFullscreen(!this.parent.containerWrapper.classList.contains('is-fullscreen'));
    }

    // Re-framing the camera is left to the container's ResizeObserver: the class
    // change is what resizes the stage, and the observer already reacts to that.
    setFullscreen(isFullscreen) {
        this.parent.containerWrapper.classList.toggle('is-fullscreen', isFullscreen);
        this.fullscreenButton?.classList.toggle('active', isFullscreen);
        localStorage.setItem(ScreenManager.STORAGE_KEY, isFullscreen ? '1' : '0');
    }

    initializeHeaderState() {
        const user = this.parent.parent?.core?.user;

        // The name is ours to write; opening the profile is UserProfilePanel's,
        // which claims this button as its trigger and marks it active while the
        // window is open.
        if (this.userTextElement) {
            this.userTextElement.textContent = user?.username || 'Guest';
        }
    }

    dispose() {
        this.listenerCleanup.forEach(cleanup => cleanup());
        this.listenerCleanup = [];
    }
}
