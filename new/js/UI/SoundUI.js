class SoundUI {
	constructor(parent) {
		this.parent = parent;
		this.container = parent.container;
		this.config = parent.config;

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
		}
	}

	initSoundSettings() {
		// Get reference to the sound manager from Core
		const soundManager = this.parent.parent.core.soundManager;
		if (!soundManager) {
			console.warn('Sound manager not available');
			return;
		}

		// Sound toggle button (should already exist in the DOM)
		const soundToggle = document.getElementById('sound-toggle');
		if (!soundToggle) {
			console.warn('Sound toggle button not found');
			return;
		}

		// Set initial state based on sound manager
		this.updateMuteButtonState(soundManager);

		// Clear any existing listeners
		soundToggle.onclick = null;
		soundToggle.oncontextmenu = null;

		// Add click handler directly (not using addEventListener to avoid duplicates)
		soundToggle.onclick = (e) => {
			e.preventDefault();
			e.stopPropagation();

			// Initialize sound system if needed
			if (!soundManager.initialized) {
				soundManager.init().then(() => {
					this.toggleSounds();
				}).catch(err => console.error('Failed to initialize audio:', err));
			} else {
				this.toggleSounds();
			}

			return false;
		}

		// Add right-click handler
		soundToggle.oncontextmenu = (e) => {
			e.preventDefault();
			e.stopPropagation();
			this.toggleSoundSettings();
			return false;
		};

		// Set up panel controls
		this.setupSoundSettingsControls(soundManager);
	}



	toggleSounds() {
		const soundManager = this.parent.parent.core.soundManager;

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

		const soundManager = this.parent.parent.core.soundManager;
		const soundToggle = document.getElementById('sound-toggle');
		
		// Update mute button state
		soundToggle.classList.toggle('muted', !(soundManager.soundEnabled && soundManager.musicEnabled));

		// Update checkboxes
		const soundCheck = document.getElementById('sound-enabled');
		const musicCheck = document.getElementById('music-enabled');
		if (soundCheck) soundCheck.checked = soundManager.soundEnabled;
		if (musicCheck) musicCheck.checked = soundManager.musicEnabled;
	}



	setupSoundSettingsControls(soundManager) {
		if (!soundManager) return;

		const panel = document.getElementById('sound-settings-panel');
		if (!panel) {
			console.warn('Sound settings panel not found');
			return;
		}

		// Close button
		const closeBtn = panel.querySelector('.close-btn');
		if (closeBtn) {
			closeBtn.onclick = () => {
				panel.classList.remove('visible');
			};
		}

		// Volume sliders
		// loop through categories
		for (const category of this.categories) {
			this.setupVolumeSlider(`${category}-volume`, soundManager, category);
		}

		// Toggle checkboxes using the checkboxes configuration
		for (const [key, config] of Object.entries(this.checkboxes)) {
			this.setupToggleCheckbox(config.id, soundManager, config.property);
		}

		// Close panel when clicking outside (using direct onclick assignment)
		document.onclick = (e) => {
			if (panel.classList.contains('visible') &&
				!panel.contains(e.target) &&
				e.target.id !== 'sound-toggle') {
				panel.classList.remove('visible');
			}
		};
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
					console.log(`Playing test sound for ${volumeType} volume change`);
					try {
						if (volumeType === 'sfx') {
							console.log('soundManager.play("myte_happy", { volume: 0.3 })');
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
		const soundToggle = document.getElementById('sound-toggle');
		if (soundToggle) {
			// Show muted state if either sound or music is disabled
			const shouldBeMuted = !soundManager.soundEnabled && !soundManager.musicEnabled;
			soundToggle.classList.toggle('muted', shouldBeMuted);
		}
	}


	toggleSoundSettings() {
		const panel = document.getElementById('sound-settings-panel');
		if (!panel) return;

		const wasVisible = panel.classList.contains('visible');
		if (wasVisible) {
			panel.classList.remove('visible');
		} else {
			panel.classList.add('visible');
		}

		// Play UI sound when opening
		if (!wasVisible) {
			const soundManager = this.parent.parent.core.soundManager;
			if (soundManager?.soundEnabled && soundManager?.initialized) {
				try {
					soundManager.playUISound('select');
				} catch (error) {
					console.warn('Could not play sound:', error);
				}
			}
		}
	}
}