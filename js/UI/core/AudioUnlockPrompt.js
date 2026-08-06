/**
 * Browsers refuse to start an AudioContext until the page has seen a real user
 * gesture, so a freshly loaded world is silent with nothing explaining why.
 * Core already unlocks on the first click/keypress anywhere — this is only the
 * visible affordance for that: it tells the player audio is waiting and gives
 * them something explicit to press. It hides itself the moment audio starts,
 * whichever gesture got there first.
 */
class AudioUnlockPrompt {
    static ELEMENT_ID = 'audio-unlock';
    static BUTTON_ID = 'audio-unlock-button';

    constructor(core) {
        this.core = core;
        this.element = document.getElementById(AudioUnlockPrompt.ELEMENT_ID);
        this.button = document.getElementById(AudioUnlockPrompt.BUTTON_ID);
        this.boundActivate = null;
    }

    init() {
        if (!this.element || !this.button || this.boundActivate) return;

        this.boundActivate = (e) => {
            // The document-level unlock listener also sees this click; awaiting
            // the same promise keeps the two paths from racing on init state.
            e.stopPropagation();
            this.core.unlockAudio();
        };

        this.button.addEventListener('click', this.boundActivate);
        this.refresh();
    }

    /** Shows or hides based on whether audio is actually waiting on a gesture. */
    refresh() {
        this.setVisible(this.shouldPrompt());
    }

    shouldPrompt() {
        const soundManager = this.core?.soundManager;
        if (!soundManager?.hasAudioSupport) return false;
        if (!soundManager.soundEnabled && !soundManager.musicEnabled) return false;
        return !soundManager.initialized;
    }

    setVisible(visible) {
        if (!this.element) return;
        this.element.hidden = !visible;
        this.element.classList.toggle('is-visible', visible);
    }

    hide() {
        this.setVisible(false);
    }

    dispose() {
        if (this.button && this.boundActivate) {
            this.button.removeEventListener('click', this.boundActivate);
        }
        this.boundActivate = null;
        this.hide();
        this.element = null;
        this.button = null;
    }
}
