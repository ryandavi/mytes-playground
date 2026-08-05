class ScreenManager extends UIComponent {
    constructor(parent) {
        super(parent);
        this.headerElement = this.parent.containerWrapper.querySelector('.header');
        this.fullscreenButton = this.parent.containerWrapper.querySelector('.fullscreen-btn');
        this.userButtonElement = this.headerElement?.querySelector('.username') || null;
        this.userTextElement = this.userButtonElement?.querySelector('.username__text') || null;
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

        if (this.userTextElement && this.userButtonElement) {
            this.userTextElement.textContent = user?.username || 'Guest';
            this.handleUserClick = () => this.parent.userProfilePanel?.open?.();
            this.userButtonElement.addEventListener('click', this.handleUserClick);
            this.listenerCleanup.push(() => this.userButtonElement?.removeEventListener('click', this.handleUserClick));
        }
    }

    dispose() {
        this.listenerCleanup.forEach(cleanup => cleanup());
        this.listenerCleanup = [];
    }
}
