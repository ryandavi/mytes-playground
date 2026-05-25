class UserSettings {
    constructor(user, soundManager) {
        this.user = user;
        this.soundManager = soundManager;
    }

    get(key) {
        return this.user.preferences[key];
    }

    set(key, value) {
        if (!this.user.setPreference(key, value)) return false;
        this._applyAudio();
        return true;
    }

    // Push all current preferences to SoundManager. Call after user data loads.
    apply() {
        this._applyAudio();
    }

    _applyAudio() {
        this.user.applyAudioSettings(this.soundManager);
    }
}
