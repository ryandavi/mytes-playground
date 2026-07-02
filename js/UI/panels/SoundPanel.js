class SoundPanel extends ModalWindow {
    constructor(parent) {
        super(parent, {
            id: 'sound-settings-panel',
            buttonId: 'sound-toggle',
            closeOnOutsideClick: false,
            draggable: true,
            position: 'top-right',
            closeButtonSelector: '.modal-close-btn'
        });

        this.categories = ['master', 'ui', 'ambient', 'sfx', 'footsteps', 'music'];
        this.volumePreferenceMap = {
            master: 'masterVolume',
            ui: 'uiVolume',
            ambient: 'ambientVolume',
            sfx: 'sfxVolume',
            footsteps: 'footstepsVolume',
            music: 'musicVolume'
        };
        this.checkboxes = {
            soundEnabled: {
                id: 'sound-enabled',
                property: 'soundEnabled',
                preference: 'soundEnabled'
            },
            musicEnabled: {
                id: 'music-enabled',
                property: 'musicEnabled',
                preference: 'musicEnabled'
            },
            ambientEnabled: {
                id: 'ambient-enabled',
                property: 'ambientEnabled',
                preference: 'ambientEnabled'
            },
            footstepsEnabled: {
                id: 'footsteps-enabled',
                property: 'footstepsEnabled',
                preference: 'footstepsEnabled'
            }
        };

        this.init(); // explicit — subclass state is ready before any virtual method call
        this.initSoundSettings();
    }

    buttonLeftClick(e) {
        e.preventDefault();
        e.stopPropagation();
        this.toggleSounds();
        return false;
    }

    buttonRightClick(e) {
        e.preventDefault();
        e.stopPropagation();
        this.toggle();
        return false;
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

        const wasEnabled = soundManager.soundEnabled || soundManager.musicEnabled;
        const nextEnabled = !wasEnabled;

        soundManager.soundEnabled = nextEnabled;
        soundManager.musicEnabled = nextEnabled;
        this.persistPreference('soundEnabled', nextEnabled);
        this.persistPreference('musicEnabled', nextEnabled);

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

        if (this.buttonElement) {
            this.buttonElement.classList.toggle('muted', !(soundManager.soundEnabled || soundManager.musicEnabled));
        }

        this.categories.forEach((category) => {
            const slider = document.getElementById(`${category}-volume`);
            if (slider && soundManager.volume[category] != null) {
                slider.value = Math.round(soundManager.volume[category] * 100);
            }
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
            soundManager.footstepsEnabled = defaults.footstepsEnabled;
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

            if (soundManager.musicEnabled) {
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

            switch (config.property) {
                case 'soundEnabled':
                    if (!isChecked) {
                        soundManager.stopAllSoundEffects();
                    } else {
                        soundManager.play('ui_click');
                        soundManager.restartAmbient();
                    }
                    break;
                case 'musicEnabled':
                    if (!isChecked) {
                        soundManager.stopMusic();
                    } else {
                        soundManager.restartMusic();
                    }
                    break;
                case 'ambientEnabled':
                    if (!isChecked) {
                        soundManager.stopCategorySounds?.('ambient');
                    } else {
                        soundManager.restartAmbient();
                    }
                    break;
                case 'footstepsEnabled':
                    if (!isChecked) {
                        soundManager.stopCategorySounds?.('footsteps');
                    } else {
                        soundManager.playFootstepPreview?.();
                    }
                    break;
                default:
                    break;
            }

            this.updateMuteButtonState(soundManager);
        };
    }

    updateMuteButtonState(soundManager) {
        if (this.buttonElement) {
            const shouldBeMuted = !soundManager.soundEnabled && !soundManager.musicEnabled;
            this.buttonElement.classList.toggle('muted', shouldBeMuted);
        }
    }

    open() {
        super.open();
        this.updateUI();
    }
}
