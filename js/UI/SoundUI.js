class SoundUI extends ModalWindow {
    constructor(parent) {
        // Call parent constructor with modal-specific options
        super(parent, {
            id: 'sound-settings-panel',
            buttonId: 'sound-toggle',
            closeOnOutsideClick: true,
            position: 'top-right',
            closeButtonSelector: '.modal-close-btn'
        });
        
        this.categories = [
            'master', 'ambient', 'music', 'ui', 'sfx',
        ];

        this.checkboxes = {
            'soundEffects': {
                "id": 'sound-enabled',
                "property": 'soundEnabled',
            },
            'music': {
                "id": 'music-enabled',
                "property": 'musicEnabled',
            },
        };
        
        // Initialize sound settings
        this.initSoundSettings();
    }

    buttonLeftClick(e){
        e.preventDefault();
        e.stopPropagation();

        // Initialize sound system if needed
        this.toggleSounds();

        return false;
    }

    buttonRightClick(e){
        e.preventDefault();
        e.stopPropagation();
        this.toggle(); // Use the toggle method inherited from ModalWindow
        return false;
    }

    initSoundSettings() {
        // Get reference to the sound manager from Core
        const soundManager = this.getSoundManager();
        if (!soundManager) {
            console.warn('Sound manager not available');
            return;
        }

        // Set initial state based on sound manager
        this.updateMuteButtonState(soundManager);

        // Set up panel controls
        this.setupSoundSettingsControls(soundManager);
    }

    toggleSounds() {
        const soundManager = this.getSoundManager();
        if (!soundManager) return;

        // Toggle both sound and music together
        const wasEnabled = soundManager.soundEnabled || soundManager.musicEnabled;
        soundManager.soundEnabled = !wasEnabled;
        soundManager.musicEnabled = !wasEnabled;

        if (wasEnabled) {
            // We're turning everything OFF
            soundManager.stopAllSounds();
        } else {
            // We're turning everything ON
            // Add a small delay to ensure clean restart
            setTimeout(() => {
                // Play UI sound first as an immediate feedback
                soundManager.playUISound('click');

                // Then restart all ongoing sounds with another small delay
                setTimeout(() => {
                    soundManager.startAllSounds();
                }, 200);
            }, 100);
        }

        // Update UI state
        this.updateUI();
    }

    updateUI() {
        const soundManager = this.getSoundManager();
        if (!soundManager) return;
        
        
        
        // Update mute button state
        if (this.buttonElement) {
            this.buttonElement.classList.toggle('muted', !(soundManager.soundEnabled && soundManager.musicEnabled));
        }

        // Update checkboxes
        const soundCheck = document.getElementById('sound-enabled');
        const musicCheck = document.getElementById('music-enabled');
        if (soundCheck) soundCheck.checked = soundManager.soundEnabled;
        if (musicCheck) musicCheck.checked = soundManager.musicEnabled;
    }

    setupSoundSettingsControls(soundManager) {
        if (!soundManager || !this.modalElement) return;

        // Volume sliders
        // loop through categories
        for (const category of this.categories) {
            this.setupVolumeSlider(`${category}-volume`, soundManager, category);
        }

        // Toggle checkboxes using the checkboxes configuration
        for (const [key, config] of Object.entries(this.checkboxes)) {
            this.setupToggleCheckbox(config.id, soundManager, config.property);
        }
    }

    setupVolumeSlider(id, soundManager, volumeType) {
        const slider = document.getElementById(id);
        if (!slider) return;

        // Set initial value from sound manager
        slider.value = soundManager.volume[volumeType] * 100;

        // Store the timeout to implement debouncing
        let updateTimeout = null;

        // Use direct oninput assignment to avoid duplicate listeners
        slider.oninput = () => {
            const value = slider.value / 100;

            // Debounce the actual audio updates to prevent crackling
            clearTimeout(updateTimeout);
            updateTimeout = setTimeout(() => {

                if (volumeType === 'master') {
                    soundManager.setMasterVolume(value);
                } else {
                    soundManager.setCategoryVolume(volumeType, value);
                }

                // Play test sound only for SFX or UI volume changes
                if (soundManager.soundEnabled) {
                    try {
                        if (volumeType === 'sfx') {
                            soundManager.play('myte_happy', { volume: 0.3 });
                        } else if (volumeType === 'ui') {
                            soundManager.playUISound('hover');
                        }
                    } catch (error) {
                        console.warn('Could not play test sound:', error);
                    }
                }
            }, 50); // 50ms debounce to reduce update frequency
        };

        // Also handle change event for when slider is released
        slider.onchange = () => {
            const value = slider.value / 100;

            // Clear any pending timeout
            clearTimeout(updateTimeout);

            if (volumeType === 'master') {
                soundManager.setMasterVolume(value);
            } else {
                soundManager.setCategoryVolume(volumeType, value);
            }
        };
    }

    setupToggleCheckbox(id, soundManager, property) {
        const checkbox = document.getElementById(id);
        if (!checkbox) return;

        // Set initial state
        checkbox.checked = soundManager[property];

        // Use direct onchange to avoid duplicate listeners
        checkbox.onchange = () => {
            const isChecked = checkbox.checked;

            // Update sound manager state directly
            soundManager[property] = isChecked;

            // Handle the appropriate actions based on the property
            if (property === 'soundEnabled') {
                if (!isChecked) {
                    // Stop all sound effects (but not music)
                    soundManager.stopAllSoundEffects();
                } else {
                    // If turning sound back on, no need for immediate action
                    // Sound effects will play as needed
                    // We could play a test sound to confirm it's working
                    soundManager.play('ui_click');
                    soundManager.restartAmbient();
                }
            } else if (property === 'musicEnabled') {
                if (!isChecked) {
                    // Stop all music
                    soundManager.stopMusic();
                } else {
                    // Restart music based on time of day
                    soundManager.restartMusic();
                }
            }

            // Update mute button state
            this.updateMuteButtonState(soundManager);
        };
    }

    updateMuteButtonState(soundManager) {

        console.log(this.options);
        if (this.buttonElement) {
            // Show muted state if either sound or music is disabled
            const shouldBeMuted = !soundManager.soundEnabled && !soundManager.musicEnabled;
            this.buttonElement.classList.toggle('muted', shouldBeMuted);
        }
    }
    
    // Override the open method to add our custom logic
    open() {
        super.open(); // Call the parent class's open method
        
        this.updateUI();
    }
    
}