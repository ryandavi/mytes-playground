class SoundPanel extends PanelSection {
    constructor(parent) {
        super(parent, { tab: 'sound' });

        // One row per category: a slider and the switch that silences it. The
        // separate "Sound Effects" / "Background Music" / "Footsteps" tick
        // boxes this replaced drove exactly these flags, so keeping both would
        // have put two controls for one setting in the same panel.
        this.categories = ['master', 'music', 'ambient', 'sfx', 'footsteps', 'ui'];
        this.volumePreferenceMap = {
            master: 'masterVolume',
            ui: 'uiVolume',
            ambient: 'ambientVolume',
            sfx: 'sfxVolume',
            footsteps: 'footstepsVolume',
            music: 'musicVolume'
        };
        // Spatial audio is not a volume and not a mute -- it changes how sounds
        // are placed -- so it stays a tick box of its own.
        this.checkboxes = {
            spatialAudioEnabled: {
                id: 'spatial-audio-enabled',
                property: 'spatialAudioEnabled',
                preference: 'spatialAudioEnabled'
            }
        };

        this.init(); // explicit — subclass state is ready before any virtual method call
        this.setupMuteButton();
        this.initSoundSettings();
    }

    /**
     * The sidebar mute key. Sound is the one setting worth reaching without
     * opening a window, so it keeps a control of its own beside the tools —
     * the same master switch the N shortcut and the Master slider's mute drive.
     */
    setupMuteButton() {
        this.buttonElement = this.parent?.containerWrapper?.querySelector('#sound-mute-toggle') || null;
        if (!this.buttonElement) return;
        this.handleMuteClick = (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.toggleSounds();
        };
        this.buttonElement.addEventListener('click', this.handleMuteClick);
    }

    initSoundSettings() {
        const soundManager = this.getSoundManager();
        if (!soundManager) {
            Utility.warnDebug('Sound manager not available');
            return;
        }

        this.updateMuteButtonState(soundManager);
        this.setupSoundSettingsControls(soundManager);
        this.updateUI();
    }

    getCore() {
        let current = this.parent;
        while (current) {
            if (current.core) return current.core;
            current = current.parent;
        }
        return null;
    }

    getUser() {
        return this.getCore()?.user || null;
    }

    persistPreference(key, value) {
        this.getUser()?.setPreference?.(key, value);
    }

    toggleSounds() {
        const soundManager = this.getSoundManager();
        if (!soundManager) return;

        const wasEnabled = soundManager.soundEnabled;
        const nextEnabled = !wasEnabled;

        soundManager.soundEnabled = nextEnabled;
        this.persistPreference('soundEnabled', nextEnabled);

        if (wasEnabled) {
            soundManager.stopAllSounds();
        } else {
            setTimeout(() => {
                soundManager.playUISound('click');
                setTimeout(() => {
                    soundManager.startAllSounds();
                }, 200);
            }, 100);
        }

        this.updateUI();
    }

    updateUI() {
        const soundManager = this.getSoundManager();
        if (!soundManager) return;

        this.updateMuteButtonState(soundManager);

        // Muting while audio is still locked should retire the unlock prompt,
        // and un-muting should bring it back if the gate is still closed.
        this.getCore()?.audioUnlockPrompt?.refresh();

        this.categories.forEach((category) => {
            const slider = document.getElementById(`${category}-volume`);
            if (slider && soundManager.volume[category] != null) {
                slider.value = Math.round(soundManager.volume[category] * 100);
            }
            this.updateMuteToggleState(category, soundManager);
        });

        Object.values(this.checkboxes).forEach(({ id, property }) => {
            const checkbox = document.getElementById(id);
            if (checkbox) {
                checkbox.checked = Boolean(soundManager[property]);
            }
        });
    }

    setupSoundSettingsControls(soundManager) {
        if (!soundManager || !this.modalElement) return;

        for (const category of this.categories) {
            this.setupVolumeSlider(`${category}-volume`, soundManager, category);
            this.setupMuteToggle(category, soundManager);
        }

        Object.values(this.checkboxes).forEach((config) => {
            this.setupToggleCheckbox(config, soundManager);
        });

        this.setupResetButton(soundManager);
    }

    setupVolumeSlider(id, soundManager, volumeType) {
        const slider = document.getElementById(id);
        if (!slider) return;

        slider.value = Math.round((soundManager.volume[volumeType] ?? 0) * 100);

        let updateTimeout = null;
        const applyValue = (value) => {
            if (volumeType === 'master') {
                soundManager.setMasterVolume(value);
            } else {
                soundManager.setCategoryVolume(volumeType, value);
            }

            const preferenceKey = this.volumePreferenceMap[volumeType];
            if (preferenceKey) {
                this.persistPreference(preferenceKey, value);
            }
        };

        slider.oninput = () => {
            const value = slider.value / 100;
            clearTimeout(updateTimeout);
            updateTimeout = setTimeout(() => {
                applyValue(value);
                this.playVolumePreview(volumeType, soundManager);
            }, 50);
        };

        slider.onchange = () => {
            const value = slider.value / 100;
            clearTimeout(updateTimeout);
            applyValue(value);
        };
    }

    /**
     * The switch beside a slider. It silences the category rather than dragging
     * the slider to zero, so the level you chose is still there when you turn
     * it back on -- and it is the same flag the playback rules read, so a muted
     * category cannot leak a sound through some other path.
     */
    setupMuteToggle(category, soundManager) {
        const button = document.getElementById(`${category}-mute`);
        if (!button) return;

        button.onclick = () => {
            if (category === 'master') {
                this.toggleSounds();
                return;
            }

            const flag = AudioCategoryRules.MUTE_FLAGS[category];
            if (!flag) return;

            const nextEnabled = !soundManager[flag];
            soundManager[flag] = nextEnabled;
            this.persistPreference(flag, nextEnabled);
            this.applyCategoryPlayback(category, nextEnabled, soundManager);
            this.updateMuteToggleState(category, soundManager);
        };
    }

    // Silencing a category has to stop what is already playing in it; turning
    // it back on has to start whatever should be running now.
    applyCategoryPlayback(category, enabled, soundManager) {
        switch (category) {
            case 'music':
                if (enabled) soundManager.restartMusic?.();
                else soundManager.stopMusic?.();
                break;
            case 'ambient':
                if (enabled) soundManager.restartAmbient?.();
                else soundManager.stopCategorySounds?.('ambient');
                break;
            case 'footsteps':
                if (enabled) soundManager.playFootstepPreview?.();
                else soundManager.stopCategorySounds?.('footsteps');
                break;
            case 'sfx':
                if (enabled) soundManager.playUISound?.('click');
                else soundManager.stopAllSoundEffects?.();
                break;
            default:
                break;
        }
    }

    updateMuteToggleState(category, soundManager) {
        const button = document.getElementById(`${category}-mute`);
        if (!button) return;

        const flag = AudioCategoryRules.MUTE_FLAGS[category];
        // Every category also goes silent when the master is off, and the icon
        // should say so rather than claiming a sound is playing.
        const muted = !soundManager.soundEnabled || (flag ? !soundManager[flag] : false);
        const label = button.dataset.muteCategory || category;

        button.classList.toggle('is-muted', muted);
        button.closest('.setting-item')?.classList.toggle('is-muted', muted);
        button.setAttribute('aria-pressed', String(muted));
        button.title = muted ? `Unmute ${label}` : `Mute ${label}`;
        button.querySelector('use')
            ?.setAttribute('href', muted ? '#icon-sound-off' : '#icon-sound-on');
    }

    playVolumePreview(volumeType, soundManager) {
        if (!soundManager.soundEnabled) return;

        try {
            if (volumeType === 'sfx') {
                soundManager.play('myte_happy', { volume: 0.25 });
            } else if (volumeType === 'ui') {
                soundManager.playUISound('hover');
            } else if (volumeType === 'footsteps') {
                soundManager.playFootstepPreview?.();
            }
        } catch (error) {
            Utility.warnDebug('Could not play test sound:', error);
        }
    }

    setupResetButton(soundManager) {
        const resetButton = document.getElementById('sound-reset-defaults');
        if (!resetButton) return;

        resetButton.onclick = () => {
            const user = this.getUser();
            const defaults = user?.resetAudioPreferences?.();
            if (!defaults) {
                return;
            }

            soundManager.soundEnabled = defaults.soundEnabled;
            soundManager.musicEnabled = defaults.musicEnabled;
            soundManager.ambientEnabled = defaults.ambientEnabled;
            soundManager.sfxEnabled = defaults.sfxEnabled;
            soundManager.uiEnabled = defaults.uiEnabled;
            soundManager.footstepsEnabled = defaults.footstepsEnabled;
            soundManager.spatialAudioEnabled = defaults.spatialAudioEnabled;
            soundManager.setMasterVolume(defaults.masterVolume);
            soundManager.setCategoryVolume('sfx', defaults.sfxVolume);
            soundManager.setCategoryVolume('footsteps', defaults.footstepsVolume);
            soundManager.setCategoryVolume('music', defaults.musicVolume);
            soundManager.setCategoryVolume('ui', defaults.uiVolume);
            soundManager.setCategoryVolume('ambient', defaults.ambientVolume);

            if (soundManager.soundEnabled) {
                soundManager.restartAmbient?.();
                soundManager.playUISound('select');
            } else {
                soundManager.stopAllSoundEffects?.();
            }

            if (soundManager.soundEnabled && soundManager.musicEnabled) {
                soundManager.restartMusic?.();
            } else {
                soundManager.stopMusic?.();
            }

            this.updateUI();
            this.updateMuteButtonState(soundManager);
        };
    }

    setupToggleCheckbox(config, soundManager) {
        const checkbox = document.getElementById(config.id);
        if (!checkbox) return;

        checkbox.checked = Boolean(soundManager[config.property]);
        checkbox.onchange = () => {
            const isChecked = checkbox.checked;
            soundManager[config.property] = isChecked;
            if (config.preference) {
                this.persistPreference(config.preference, isChecked);
            }

            this.updateMuteButtonState(soundManager);
        };
    }

    updateMuteButtonState(soundManager) {
        if (!this.buttonElement) return;
        const muted = !soundManager.soundEnabled;
        this.buttonElement.classList.toggle('muted', muted);
        this.buttonElement.setAttribute('aria-pressed', String(muted));
        this.buttonElement.title = muted ? 'Unmute (N)' : 'Mute (N)';
        this.buttonElement.querySelector('use')
            ?.setAttribute('href', muted ? '#icon-sound-off' : '#icon-sound-on');
    }

    dispose() {
        if (this.buttonElement && this.handleMuteClick) {
            this.buttonElement.removeEventListener('click', this.handleMuteClick);
        }
        this.handleMuteClick = null;
        this.buttonElement = null;
        super.dispose();
    }

    onSectionShown() {
        this.updateUI();
    }
}
