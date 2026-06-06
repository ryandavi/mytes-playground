// SoundManager.js - Handles all game audio using Tone.js synthesis
class SoundManager {
	constructor(parent, options = {}) {

		this.parent = parent;
		// Check if we have browser audio support

		if (typeof Tone == "undefined") {
			console.warn("Tone.js is not loaded");
			return;
		}

		this.hasAudioSupport = 'AudioContext' in window || 'webkitAudioContext' in window;
		if (!this.hasAudioSupport) {
			console.warn('Audio is not supported in this browser');
			return;
		}

		// Core properties
		this.initialized = false;
		this.soundEnabled = options.soundEnabled !== false;
		this.musicEnabled = options.musicEnabled !== false;
		this.ambientEnabled = options.ambientEnabled !== false;
		this.footstepsEnabled = options.footstepsEnabled !== false;
		this.volume = {
			master: options.masterVolume ?? 1,
			sfx: options.sfxVolume ?? 0.82,
			footsteps: options.footstepsVolume ?? 0.72,
			music: options.musicVolume ?? 0.28,
			ui: options.uiVolume ?? 0.72,
			ambient: options.ambientVolume ?? 0.42
		};
		this.categoryMix = {
			music: 0.88,
			ambient: 0.82,
			ui: 1.08,
			notifications: 0.98,
			entities: 0.9,
			world: 0.84,
			machines: 0.8,
			footsteps: 1.12,
			sfx: 0.92
		};

		this.criticalSounds = [
			"ui_click", "ui_select", "ball_hit",
		];

		this.speech = null;

		// Sound generators
		this.synths = new Map();
		this.loops = new Map();
		this.currentMusicSynth = null;
		this.currentMusicPart = null;
		this.currentMusicLayers = [];
		this._musicStartTimer = null;
		this.boundTimeManager = null;
		this._handleTimeHourChange = null;
		this.musicFadeTime = options.musicFadeTime || 2;

		// Add these properties to the constructor
		this.lastPlayTimes = new Map();
		this.minTimeBetweenSounds = 50; // ms
		this.triggeredSounds = new Set(); // Keep track of currently triggered sounds



		// Species sound profiles - defines which instrument/synth to use for each species
		this.defaultSpeciesVoices = createDefaultSpeciesVoices();
		this.speciesVoices = this._cloneVoiceData(this.defaultSpeciesVoices);

		// Sound definitions using Tone.js synthesis
		this.synthPresets = createAudioPresetLibrary(this);

		// Current map audio context — updated on each map load via setMapContext()
		this._mapContext = { location: 'outside', ambientOverride: null, musicOverride: null };

		// Ambient sound IDs driven by proximity (water tiles / zones) — managed separately
		// from the schedule so syncAmbientForHour never accidentally stops them
		this._proximitySounds = new Set();
	}

	createFootstepPreset({
		note = "E2",
		noiseType = "pink",
		filterFrequency = 1400,
		thumpVolume = 0.8,
		textureVolume = 0.4
	} = {}) {
		const thump = new Tone.MembraneSynth({
			pitchDecay: 0.015,
			octaves: 1.2,
			oscillator: { type: "sine" },
			envelope: {
				attack: 0.001,
				decay: 0.08,
				sustain: 0,
				release: 0.04
			}
		}).toDestination();
		const texture = new Tone.NoiseSynth({
			noise: { type: noiseType },
			envelope: {
				attack: 0.001,
				decay: 0.055,
				sustain: 0,
				release: 0.035
			}
		});
		const filter = new Tone.Filter({
			frequency: filterFrequency,
			type: "lowpass",
			rolloff: -24
		}).toDestination();
		texture.connect(filter);

		return {
			synth: { thump, texture, filter },
			volume: 0.98,
			trigger: ({ sound, effectiveVolume, options, manager }) => {
				const pitchScale = options.pitchScale ?? (1 + manager.getCenteredVariation(0.03));
				const playedNote = manager.applyPitchToNote(note, pitchScale);
				const now = Tone.now();
				sound.synth.thump.triggerAttackRelease(playedNote, "64n", now, effectiveVolume * thumpVolume);
				sound.synth.texture.triggerAttackRelease("64n", now + 0.004, effectiveVolume * textureVolume);
			}
		};
	}

	getCenteredVariation(range = 0) {
		if (!range) return 0;
		const centered = ((Math.random() + Math.random() + Math.random()) / 3) - 0.5;
		return centered * 2 * range;
	}

	applyPitchToNote(note, pitchScale = 1) {
		if (!note || !Number.isFinite(pitchScale) || pitchScale <= 0 || pitchScale === 1) {
			return note;
		}

		try {
			const semitoneOffset = 12 * Math.log2(pitchScale);
			return Tone.Frequency(note).transpose(semitoneOffset).toNote();
		} catch (_error) {
			return note;
		}
	}

	resolveSoundCategory(id, preset = null) {
		return AudioCategoryRules.resolve(id, preset || this.synthPresets[id] || {});
	}

	isCategoryEnabled(category) {
		return AudioCategoryRules.isEnabled(this, category);
	}

	getCategoryVolume(category) {
		const baseVolume = AudioCategoryRules.getVolume(this, category);
		return baseVolume * (this.categoryMix[category] ?? 1);
	}

	bindTimeManager(timeManager) {
		if (this.boundTimeManager === timeManager) {
			return;
		}

		if (this.boundTimeManager && this._handleTimeHourChange) {
			this.boundTimeManager.unsubscribe?.('hour', this._handleTimeHourChange);
		}

		this.boundTimeManager = timeManager || null;
		this._handleTimeHourChange = null;

		if (!this.boundTimeManager) {
			return;
		}

		this._handleTimeHourChange = (timeData = {}) => {
			const scheduledMusicId = this._getMusicForHour(timeData.hour);
			if (this.initialized && this.musicEnabled && scheduledMusicId && scheduledMusicId !== this.currentMusicSynth) {
				this.startMusic(scheduledMusicId);
			}

			if (this.initialized && this.soundEnabled) {
				this.syncAmbientForHour(timeData.hour);
			}
		};

		this.boundTimeManager.subscribe?.('hour', this._handleTimeHourChange);
	}

	resolvePlaybackModifiers(preset, soundCategory, options = {}) {
		const variation = preset?.variation || {};
		const defaultPitchRange = {
			entities: 0.018,
			notifications: 0.012,
			world: 0.012,
			machines: 0.01,
			footsteps: 0,
			ui: 0,
			ambient: 0,
			music: 0,
			sfx: 0.01
		}[soundCategory] ?? 0;
		const pitchRange = variation.pitchRange ?? defaultPitchRange;
		const pitchScale = options.pitchScale ?? (pitchRange > 0 ? 1 + this.getCenteredVariation(pitchRange) : 1);
		const volumeSteps = Array.isArray(variation.volumeSteps) ? variation.volumeSteps : null;
		const volumeMultiplier = options.volumeMultiplier ??
			(volumeSteps && volumeSteps.length ? Utility.randomChoice(volumeSteps) : 1);

		return {
			pitchScale,
			volumeMultiplier
		};
	}

	playFootstep(surfaceTag = 'ground', options = {}) {
		if (!this.initialized || !this.isCategoryEnabled('footsteps')) return;

		const normalizedSurface = String(surfaceTag || 'ground').toLowerCase();
		const surfacePools = {
			grass: ['footstep_grass_1', 'footstep_grass_2'],
			path: ['footstep_path_1', 'footstep_path_2'],
			floor: ['footstep_floor_1', 'footstep_floor_2'],
			sand: ['footstep_sand_1', 'footstep_sand_2'],
			mud: ['footstep_mud_1', 'footstep_mud_2'],
			water: ['footstep_water_1', 'footstep_water_2'],
			ground: ['footstep_ground_1', 'footstep_ground_2'],
			default: ['footstep_ground_1', 'footstep_ground_2']
		};
		const variants = surfacePools[normalizedSurface] || surfacePools.default;
		const variantIndex = options.foot === 'left' ? 0 : 1;
		const soundId = variants[variantIndex % variants.length];
		const speedNormalized = Utility.clamp(options.speedNormalized ?? 1, 0.65, 1.35);
		const pitchScale = options.pitchScale ?? (1 + this.getCenteredVariation(0.03));
		this.play(soundId, {
			volume: (options.volume !== undefined ? options.volume : 1) * (speedNormalized >= 1 ? 1.02 : 0.96),
			pitchScale
		});
	}

	playFootstepPreview() {
		this.playFootstep('grass', {
			foot: 'left',
			volume: 0.95,
			speedNormalized: 1
		});
	}

	stopCategorySounds(category) {
		this.synths.forEach((_sound, id) => {
			if (this.resolveSoundCategory(id) === category) {
				this.stop(id);
			}
		});
	}

	disposeSoundResources(sound) {
		if (!sound || typeof sound !== 'object') return;
		if (sound.synth) this.disposeSynthElements(sound.synth);
		if (sound.pad) this.disposeSynthElements(sound.pad);
	}

	disposeSynthElements(target) {
		if (!target || typeof target !== 'object') return;

		if (typeof target.dispose === 'function') {
			target.dispose();
			return;
		}

		if (target.noise && typeof target.noise.dispose === 'function') {
			target.noise.dispose();
		}

		Object.values(target).forEach((value) => {
			if (value && typeof value === 'object' && value !== target.noise) {
				this.disposeSynthElements(value);
			}
		});
	}

	_cloneVoiceData(data) {
		if (typeof structuredClone === 'function') {
			return structuredClone(data);
		}

		return JSON.parse(JSON.stringify(data));
	}

	registerVoice(characterId, profile = {}) {
		if (!characterId) {
			console.warn('registerVoice called without a characterId');
			return this.getVoice('default');
		}

		const fallbackVoice = this.getVoice('default') || {
			synthType: 'Synth',
			baseNote: 'C4',
			settings: {
				oscillator: { type: 'triangle' },
				envelope: {
					attack: 0.01,
					decay: 0.1,
					sustain: 0.2,
					release: 0.2
				}
			},
			volume: 0.5
		};

		const normalizedVoice = {
			synthType: profile.synthType || fallbackVoice.synthType,
			baseNote: profile.baseNote || fallbackVoice.baseNote,
			settings: profile.settings
				? this._cloneVoiceData(profile.settings)
				: {
					oscillator: {
						type: profile.waveform || fallbackVoice.settings?.oscillator?.type || 'triangle'
					},
					envelope: {
						attack: profile.attack ?? fallbackVoice.settings?.envelope?.attack ?? 0.01,
						decay: profile.decay ?? fallbackVoice.settings?.envelope?.decay ?? 0.1,
						sustain: profile.sustain ?? fallbackVoice.settings?.envelope?.sustain ?? 0.2,
						release: profile.release ?? fallbackVoice.settings?.envelope?.release ?? 0.2
					}
				},
			volume: profile.volume ?? fallbackVoice.volume ?? 0.5
		};

		if (profile.notePattern) {
			normalizedVoice.notePattern = [...profile.notePattern];
		}

		if (profile.speedMultiplier !== undefined) {
			normalizedVoice.speedMultiplier = profile.speedMultiplier;
		}

		if (profile.modifiers) {
			normalizedVoice.modifiers = this._cloneVoiceData(profile.modifiers);
		}

		this.speciesVoices[characterId] = normalizedVoice;
		return normalizedVoice;
	}

	getVoice(characterId) {
		if (!characterId) {
			return this.speciesVoices.default ?? null;
		}

		return this.speciesVoices[characterId] ?? this.speciesVoices.default ?? null;
	}

	clearVoices(preserveDefaults = true) {
		this.speciesVoices = preserveDefaults
			? this._cloneVoiceData(this.defaultSpeciesVoices)
			: {};
	}

	_getCurrentHour() {
		const firstContainer = this.parent?.getFirstContainer?.();
		const timeData = firstContainer?.timeManager?.getTimeData?.();
		return Number.isFinite(timeData?.hour) ? timeData.hour : null;
	}

	_getMusicForHour(hour) {
		if (this._mapContext?.musicOverride) return this._mapContext.musicOverride;
		return AudioScheduleProfiles.getMusicForHour(hour, this._mapContext?.location);
	}

	_getAmbientForHour(hour) {
		if (this._mapContext?.ambientOverride?.length) return [...this._mapContext.ambientOverride];
		return AudioScheduleProfiles.getAmbientForHour(hour, this._mapContext?.location);
	}

	init() {
		if (this.initialized) return Promise.resolve();

		// Prevent multiple init attempts in rapid succession
		if (this.initAttempted) {
			return new Promise((resolve) => {
				setTimeout(() => {
					if (this.initialized) {
						resolve();
					} else {
						this.initAttempted = false;
						this.init().then(resolve);
					}
				}, 500);
			});
		}

		this.initAttempted = true;

		return Tone.start()
			.then(() => {
				this.initialized = true;

				// Set up master volume
				Tone.Destination.volume.value = Tone.gainToDb(this.volume.master);

				// Reverb for environmental object sounds only (doors, chests, etc.)
				// Kept narrow so footsteps, myte, and UI sounds bypass it.
				this.reverb = new Tone.Reverb({
					decay: 0.8,
					wet: 0.12
				}).toDestination();

				// Preload with a delay to prevent rapid initializations
				setTimeout(() => {
					this.preloadSounds();
				}, 100);

				this.speech = new MyteSpeech(this);

				return Promise.resolve();
			})
			.catch(err => {
				console.error('Failed to initialize audio engine:', err);
				this.initialized = false;
				this.initAttempted = false;
			});

	}

	preloadSounds() {
		this.criticalSounds.forEach(id => {
			if (this.synthPresets[id]) {
				this.createSynth(id);
			}
		});

		return Promise.resolve();
	}

	createSynth(id) {


		if (!this.initialized) return null;
		const preset = this.synthPresets[id];

		if (!preset) return null;

		// Clean up any previous synth with this ID first
		if (this.synths.has(id)) {
			const oldSound = this.synths.get(id);

			// Only dispose for non-currently-playing synths
			if (!this.loops.has(id)) {
				try {
					this.disposeSoundResources(oldSound);
				} catch (err) {
					console.warn('Error disposing old synth:', err);
				}
				this.synths.delete(id);
			}
		}



		const sound = preset.create();

		// Store the base volume for later volume adjustments

		if (sound.volume != null) {
			sound.baseVolume = sound.volume;
		} else if (preset.baseVolume != null) {
			sound.baseVolume = preset.baseVolume;
		} else if (sound.synth && sound.synth.volume) {
			// Extract current volume from dB
			const volumeDb = sound.synth.volume.value;
			sound.baseVolume = Tone.dbToGain(volumeDb);
		} else {
			sound.baseVolume = 1;
		}

		// Reverb only on environmental world/machine sounds — not footsteps, UI, or entity sounds
		// because those fire too frequently for the convolution cost to be justified.
		const synthCategory = this.resolveSoundCategory(id, preset);
		if (['world', 'machines'].includes(synthCategory) && sound.synth && typeof sound.synth.connect === 'function') {
			sound.synth.connect(this.reverb);
		}

		this.synths.set(id, sound);
		return sound;
	}

	play(id, options = {}) {
		const preset = this.synthPresets[id];
		if (!preset) {
			console.error(`Sound not found: ${id}`);
			return;
		}

		const soundCategory = this.resolveSoundCategory(id, preset);
		if (!this.initialized || !this.isCategoryEnabled(soundCategory)) return;

		// Prevent rapid triggering of the same sound
		const now = Date.now();
		const lastPlayed = this.lastPlayTimes.get(id) || 0;
		if (now - lastPlayed < this.minTimeBetweenSounds) {
			return;
		}
		this.lastPlayTimes.set(id, now);

		// Create or get synth
		const sound = this.synths.get(id) || this.createSynth(id);
		if (!sound) return;

		const categoryVolume = this.getCategoryVolume(soundCategory);
		const requestedVolume = options.volume !== undefined ? options.volume : 1;
		const playback = this.resolvePlaybackModifiers(preset, soundCategory, options);
		const effectiveVolume = requestedVolume * playback.volumeMultiplier * categoryVolume * sound.baseVolume;
		const schedulingPadding = 0.002;
		const getSafeScheduleTime = (offsetSeconds = 0) => {
			const baseNow = Tone.now();
			const reservedStart = Number.isFinite(sound._nextTriggerTime)
				? sound._nextTriggerTime + schedulingPadding
				: baseNow;
			return Math.max(baseNow, reservedStart) + offsetSeconds;
		};
		const reserveScheduleUntil = (timeSeconds) => {
			if (Number.isFinite(timeSeconds)) {
				sound._nextTriggerTime = timeSeconds;
			}
		};

		try {
			if (typeof sound.trigger === 'function') {
				sound.trigger({
					sound,
					effectiveVolume,
					options: {
						...options,
						pitchScale: playback.pitchScale,
						volumeMultiplier: playback.volumeMultiplier
					},
					manager: this
				});
				return sound;
			}

			if (sound.notes) {
				// Play multiple notes in sequence with safety checks
				const notes = sound.notes;
				const durations = sound.durations || notes.map(() => "8n");
				const pitchScale = playback.pitchScale;

				let time = getSafeScheduleTime();
				for (let i = 0; i < notes.length; i++) {
					// Add a small increment to time to prevent timing conflicts
					time += i * 0.05;
					sound.synth.triggerAttackRelease(
						this.applyPitchToNote(notes[i], pitchScale),
						durations[i],
						time,
						effectiveVolume // Use calculated volume
					);
					time += Tone.Time(durations[i]).toSeconds();
				}
				reserveScheduleUntil(time);
			} else if (sound.note) {
				// Play single note
				const startTime = getSafeScheduleTime();
				sound.synth.triggerAttackRelease(
					this.applyPitchToNote(sound.note, playback.pitchScale),
					sound.duration || "8n",
					startTime,
					effectiveVolume // Use calculated volume
				);
				reserveScheduleUntil(startTime + Tone.Time(sound.duration || "8n").toSeconds());
			} else if (sound.duration) {
				// For noise synths with no note
				const startTime = getSafeScheduleTime();
				sound.synth.triggerAttackRelease(
					sound.duration,
					startTime,
					effectiveVolume // Use calculated volume
				);
				reserveScheduleUntil(startTime + Tone.Time(sound.duration).toSeconds());
			}
		} catch (error) {
			console.warn(`Error playing sound ${id}:`, error.message);
		}

		return sound;
	}

	stop(id) {
		const sound = this.synths.get(id);
		if (!sound) return;

		// Different stop method depending on synth type
		if (sound.synth?.noise) {
			// For noise-based synths
			sound.synth.noise.stop();
		} else if (typeof sound.synth?.triggerRelease === 'function') {
			// For envelope-based synths
			sound.synth.triggerRelease();
		} else if (sound.loop && this.loops.has(id)) {
			// For looping patterns
			const loop = this.loops.get(id);
			loop.stop();
			loop.dispose();
			this.loops.delete(id);
		} else if (sound.synth && typeof sound.synth === 'object') {
			Object.values(sound.synth).forEach((element) => {
				if (!element || typeof element !== 'object') return;
				if (typeof element.triggerRelease === 'function') {
					element.triggerRelease();
				} else if (element.noise && typeof element.noise.stop === 'function') {
					element.noise.stop();
				}
			});
		}
	}


	startMusic(id, options = {}) {
		if (!this.initialized || !this.isCategoryEnabled('music')) return;

		if (this._musicStartTimer) {
			clearTimeout(this._musicStartTimer);
			this._musicStartTimer = null;
		}

		// Store the ID we're trying to play to prevent race conditions
		this._pendingMusicId = id;

		// If same music is already playing, just adjust volume if needed
		if (this.currentMusicPart && this.currentMusicSynth === id) {
			const sound = this.synths.get(id);
			if (sound?.synth?.volume?.rampTo) {
				sound.synth.volume.rampTo(Tone.gainToDb(0.5 * this.getCategoryVolume('music')), 0.1);
			}
			if (sound?.pad?.volume?.rampTo) {
				sound.pad.volume.rampTo(Tone.gainToDb(0.3 * this.getCategoryVolume('music')), 0.1);
			}
			return;
		}

		// Stop current music before scheduling a replacement on the shared transport.
		if (this.currentMusicPart || this.currentMusicLayers.length) {
			this.stopMusic();
		}

		// Wait a small amount of time to prevent timing conflicts
		this._musicStartTimer = setTimeout(() => {
			// Verify we still want to play this music (might have been changed/cancelled)
			if (this._pendingMusicId !== id || !this.isCategoryEnabled('music')) {
				this._musicStartTimer = null;
				return;
			}
			this._pendingMusicId = null;
			this._musicStartTimer = null;

			try {
				// Create music synth and pattern
				const sound = this.synths.get(id) || this.createSynth(id);
				if (!sound || !sound.pattern) return;

				// Set tempo if specified
				if (sound.tempo) {
					Tone.Transport.bpm.value = sound.tempo;
				}

				sound.synth.volume.value = Tone.gainToDb(0.5 * this.getCategoryVolume('music'));

				// Create sequence with a small delay
				const sequence = new Tone.Part((time, note) => {
					sound.synth.triggerAttackRelease(
						note.note,
						note.duration,
						time,
						options.velocity || 0.8
					);
				}, sound.pattern);

				sequence.loop = sound.loop;
				sequence.loopEnd = `${Math.ceil(sound.pattern.length / 4)}m`;

				// Start AFTER a delay to avoid timing conflicts
				sequence.start("+0.5");

				this.currentMusicLayers = [];
				if (sound.pad && Array.isArray(sound.padPattern) && sound.padPattern.length) {
					sound.pad.volume.value = Tone.gainToDb(0.3 * this.getCategoryVolume('music'));
					const padSequence = new Tone.Part((time, note) => {
						sound.pad.triggerAttackRelease(
							note.note,
							note.duration,
							time,
							options.velocity || 0.55
						);
					}, sound.padPattern);
					padSequence.loop = sound.loop;
					padSequence.loopEnd = sequence.loopEnd;
					padSequence.start("+0.5");
					this.currentMusicLayers.push(padSequence);
				}



				// Keep track of current music
				this.currentMusicSynth = id;
				this.currentMusicPart = sequence;

				// Start transport if not already started
				if (Tone.Transport.state !== "started") {
					Tone.Transport.start();
				}
			} catch (error) {
				console.warn(`Error playing music ${id}:`, error.message);
			}
		}, 300); // Increased delay
	}


	stopMusic() {
		if (this._musicStartTimer) {
			clearTimeout(this._musicStartTimer);
			this._musicStartTimer = null;
		}

		// Save the current music ID before stopping
		if (this.currentMusicSynth) {
			this._lastMusicId = this.currentMusicSynth;
		}

		const currentSound = this.currentMusicSynth ? this.synths.get(this.currentMusicSynth) : null;

		// Stop current music part
		if (this.currentMusicPart) {
			try {
				this.currentMusicPart.stop();
				this.currentMusicPart.dispose();
			} catch (err) {
				console.warn("Error stopping music part:", err);
			}
			this.currentMusicPart = null;
		}
		this.currentMusicLayers.forEach((layer) => {
			try {
				layer.stop();
				layer.dispose();
			} catch (err) {
				console.warn("Error stopping music layer:", err);
			}
		});
		this.currentMusicLayers = [];

		// Release any currently ringing notes so they do not smear across restarts.
		if (currentSound?.synth && typeof currentSound.synth.releaseAll === 'function') {
			try {
				currentSound.synth.releaseAll();
			} catch (err) {
				console.warn("Error releasing music synth voices:", err);
			}
		}
		if (currentSound?.pad && typeof currentSound.pad.releaseAll === 'function') {
			try {
				currentSound.pad.releaseAll();
			} catch (err) {
				console.warn("Error releasing music pad voices:", err);
			}
		}

		// Clear current synth reference
		this.currentMusicSynth = null;

		// Only pause transport if music is disabled AND no ambient loops are active
		if (!this.musicEnabled && Tone.Transport.state === "started" &&
			this.loops.size === 0) {
			Tone.Transport.pause();
		}
	}

	// Add this method to SoundManager class
	restartMusic() {

		// Skip if not initialized
		if (!this.initialized) {
			this.init().then(() => {
				this.restartMusic();
			}).catch(err => console.error('Failed to initialize audio:', err));
			return;
		}

		// Only proceed if music is enabled and we're initialized
		if (!this.musicEnabled || !this.initialized) return;


		const scheduledMusicId = this._getMusicForHour(this._getCurrentHour());
		if (scheduledMusicId) {
			this.startMusic(scheduledMusicId);
			return;
		}

		if (this._lastMusicId) {
			this.startMusic(this._lastMusicId);
		}
	}

	// Add this method to SoundManager class
	restartAmbient() {

		// Skip if not initialized
		if (!this.initialized) {
			this.init().then(() => {
				this.restartAmbient();
			}).catch(err => console.error('Failed to initialize audio:', err));
			return;
		}

		// Only proceed if sound is enabled and we're initialized
		if (!this.soundEnabled || !this.initialized) return;


		this.syncAmbientForHour(this._getCurrentHour());
	}

	syncAmbientForHour(hour = this._getCurrentHour()) {
		const targetAmbientIds = new Set(this._getAmbientForHour(hour));
		const proximityIds = this._proximitySounds;

		// Iterate synths (not loops) — noise-based ambient sounds are tracked in synths but
		// never added to loops (only pattern-based Tone.Part sounds use loops).
		// Checking loops alone would leave noise sounds running forever on map transition.
		this.synths.forEach((_sound, id) => {
			const preset = this.synthPresets[id];
			if (preset?.type === 'ambient' && !targetAmbientIds.has(id) && !proximityIds.has(id)) {
				this.fadeOutAndStop(id, 1.1);
			}
		});

		targetAmbientIds.forEach((soundId) => {
			this.playAmbient(soundId);
		});
	}

	// Called by GameMap on load or map transition to update the ambient/music context.
	// Triggers an immediate re-sync so the change is heard without waiting for the next hour tick.
	setMapContext(context = {}) {
		const prev = this._mapContext || {};
		this._mapContext = {
			location:        context.location        ?? 'outside',
			ambientOverride: context.ambientOverride ?? null,
			musicOverride:   context.musicOverride   ?? null
		};

		if (!this.initialized) return;

		if (this.soundEnabled) {
			this.syncAmbientForHour();
		}

		if (this.musicEnabled) {
			const newMusic = this._getMusicForHour(this._getCurrentHour());
			if (newMusic && newMusic !== this.currentMusicSynth) {
				this.startMusic(newMusic);
			}
		}
	}

	// Called by the GameMap proximity poller with a Map<soundId, volumeMultiplier 0–1>.
	// Volume scales with distance — 1.0 when on top of water, fading to 0 at range edge.
	// Accepts a plain Set for callers that just need binary on/off (treated as volume 1.0).
	setProximitySounds(sounds) {
		const next = sounds instanceof Map
			? sounds
			: new Map([...(sounds || [])].map(id => [id, 1.0]));

		if (!this.initialized || !this.soundEnabled) {
			this._proximitySounds = new Set(next.keys());
			return;
		}

		// Fade out sounds that left range
		this._proximitySounds.forEach(id => {
			if (!next.has(id)) this.fadeOutAndStop(id, 1.5);
		});

		// Start or re-volume sounds in range
		next.forEach((volumeMultiplier, id) => {
			const sound = this.synths.get(id);
			if (sound) sound.proximityMultiplier = volumeMultiplier;
			this.playAmbient(id, { volume: volumeMultiplier });
		});

		this._proximitySounds = new Set(next.keys());
	}

	// Stop only sound effects without affecting music
	stopAllSoundEffects() {
		// Stop all synths except for music
		this.synths.forEach((sound, id) => {
			const preset = this.synthPresets[id];
			if (preset && preset.type !== "music") {
				this.stop(id);
			}
		});

		// Clear ambient loops
		this.loops.forEach((loop, id) => {
			const preset = this.synthPresets[id];
			if (preset && preset.type !== "music") {
				if (loop && typeof loop.stop === 'function') {
					loop.stop();
				}
				if (loop && typeof loop.dispose === 'function') {
					loop.dispose();
				}
				this.loops.delete(id);
			}
		});
	}


	startAllSounds() {
		// Restart music and ambient sounds separately
		this.restartMusic();
		this.restartAmbient();
	}

	// Stop all sounds completely (both music and sound effects)
	stopAllSounds() {
		// Stop music
		this.stopMusic();

		// Stop all other synths
		this.synths.forEach((sound, id) => {
			this.stop(id);
		});

		// Clear all loops
		this.loops.forEach((loop) => {
			if (loop && typeof loop.stop === 'function') {
				loop.stop();
			}
			if (loop && typeof loop.dispose === 'function') {
				loop.dispose();
			}
		});
		this.loops.clear();

		// Extra safeguard for Tone.js
		try {
			if (Tone.Transport.state === "started") {
				Tone.Transport.pause();
				Tone.Transport.cancel();
			}
		} catch (e) {
			console.warn("Error stopping Transport:", e);
		}
	}

















	playAmbient(id, options = {}) {
		if (!this.initialized || !this.isCategoryEnabled('ambient')) return;

		// Get the preset first
		const preset = this.synthPresets[id];
		if (!preset || preset.type !== "ambient") return;

		const sound = this.synths.get(id) || this.createSynth(id);
		if (!sound) return;

		// Calculate the actual volume to use
		const baseVolume = sound.baseVolume || preset.baseVolume || 1;
		const categoryVolume = this.getCategoryVolume('ambient');
		const effectiveVolume = (options.volume !== undefined ? options.volume : 1) *
			categoryVolume *
			baseVolume;

		// Start noise-based DSP nodes lazily — do NOT auto-start them in create().
		// This prevents the audio worklet from running 24/7 even at -Infinity volume.
		if (sound.synth?.noise && sound.synth.noise.state !== 'started') {
			sound.synth.noise.start();
		}
		if (sound.synth?.autoFilter && sound.synth.autoFilter.state !== 'started') {
			sound.synth.autoFilter.start();
		}

		// If already playing, just adjust volume
		if (this.loops.has(id)) {
			const existingSound = this.synths.get(id);
			if (existingSound) {
				// Apply fade-in for volume change
				// Get current volume (or use a default)
				const currentVolume = existingSound.currentVolume || 0.5;

				// Apply fade-in for volume change
				this.fadeAmbientSound(existingSound, currentVolume, effectiveVolume, 1.0);
				return existingSound;
			}
		}

		// Start with zero volume and fade in
		if (sound.synth) {
			if (sound.synth.volume) {
				sound.synth.volume.value = -Infinity; // Start silent
			} else if (sound.synth.noise && sound.synth.noise.volume) {
				sound.synth.noise.volume.value = -Infinity;
			}
		}

		// For pattern-based ambient sounds (like birds)
		if (sound.pattern) {
			// Add loopInterval option to control frequency
			const loopInterval = options.loopInterval || sound.loopInterval || 30;

			const sequence = new Tone.Part((time, note) => {
				sound.synth.triggerAttackRelease(
					note.note,
					note.duration,
					time,  // Use the time from callback
					options.velocity || 0.7
				);
			}, sound.pattern);

			sequence.loop = true;
			sequence.loopEnd = `${loopInterval}s`;

			// Start with a small offset from now
			sequence.start("+0.1");

			// Store for later stopping
			this.loops.set(id, sequence);

			// Start transport if needed
			if (Tone.Transport.state !== "started") {
				Tone.Transport.start();
			}
		}

		// Apply fade-in
		this.fadeAmbientSound(sound, 0, effectiveVolume, 1.5);

		return sound;
	}


	fadeOutAndStop(id, duration = 1.0) {
		const sound = this.synths.get(id);
		if (!sound) return;

		// Fade out the volume
		this.fadeAmbientSound(sound, sound.currentVolume || 0.3, 0, duration, () => {
			// Stop and dispose the Tone.Part loop
			if (this.loops.has(id)) {
				const loop = this.loops.get(id);
				if (loop) {
					try { loop.stop(); loop.dispose(); } catch (_) {}
					this.loops.delete(id);
				}
			}

			// Stop and fully dispose the synth so the audio worklet thread is freed.
			// Remove from synths map so playAmbient recreates cleanly next time.
			this.synths.delete(id);
			try {
				this.disposeSoundResources(sound);
			} catch (_) {}
		});
	}


	fadeAmbientSound(sound, startVolume, endVolume, duration = 1.0, onComplete = null) {
		if (!sound || !sound.synth) return;

		// Store current volume for later reference
		sound.currentVolume = endVolume;

		// If startVolume is undefined, try to get current volume
		if (startVolume === undefined) {
			if (sound.synth.volume) {
				// Try to get current volume from synth
				startVolume = Tone.dbToGain(sound.synth.volume.value);
			} else {
				// Default to a low value to ensure smooth fade
				startVolume = 0.01;
			}
		}

		try {
			// Handle different synth types
			if (sound.synth.volume) {
				// Convert to dB for Tone.js
				const startDB = startVolume <= 0 ? -Infinity : Tone.gainToDb(startVolume);
				const endDB = endVolume <= 0 ? -Infinity : Tone.gainToDb(endVolume);

				// Start at initial volume
				sound.synth.volume.value = startDB;

				// Perform the ramp
				if (endVolume > 0) {
					sound.synth.volume.linearRampTo(endDB, duration);
				}
			} else if (sound.synth.noise && sound.synth.noise.volume) {
				// Handle noise-based synths
				const startDB = startVolume <= 0 ? -Infinity : Tone.gainToDb(startVolume);
				const endDB = endVolume <= 0 ? -Infinity : Tone.gainToDb(endVolume);

				sound.synth.noise.volume.value = startDB;

				// Perform the ramp
				if (endVolume > 0) {
					sound.synth.noise.volume.linearRampTo(endDB, duration);
				}
			} else if (sound.synth instanceof Object) {
				// Handle complex synths with multiple components
				Object.values(sound.synth).forEach(component => {
					if (component && component.volume) {
						const startDB = startVolume <= 0 ? -Infinity : Tone.gainToDb(startVolume);
						const endDB = endVolume <= 0 ? -Infinity : Tone.gainToDb(endVolume);

						component.volume.value = startDB;

						if (endVolume > 0) {
							component.volume.linearRampTo(endDB, duration);
						}
					}
				});
			}

			// Execute callback after fade completes
			if (onComplete) {
				setTimeout(onComplete, duration * 1000);
			}
		} catch (err) {
			console.warn("Error during volume fade:", err);
			// Fallback to immediate volume change
			this.updateSynthVolume(sound.synth, endVolume);
			if (onComplete) onComplete();
		}
	}















	updateSynthVolume(synth, volume, visited = new WeakSet()) {
		if (!synth) return;
		if (typeof synth === 'object') {
			if (visited.has(synth)) return;
			visited.add(synth);
		}

		// Safety check - ensure volume is a valid number
		if (isNaN(volume) || volume < 0) {
			console.warn("Invalid volume value:", volume);
			volume = 0; // Default to silence rather than causing errors
		}

		// Handle Tone.js volume parameter
		if (typeof synth.volume !== 'undefined') {
			try {
				// Use rampTo for smooth transitions
				if (typeof synth.volume.rampTo === 'function') {
					synth.volume.rampTo(Tone.gainToDb(volume), 0.1);
				} else {
					synth.volume.value = Tone.gainToDb(volume);
				}
			} catch (e) {
				console.warn("Error updating synth volume:", e);
				// Fallback to direct value setting
				try {
					synth.volume.value = Tone.gainToDb(Math.max(0, volume));
				} catch (err) {
					// Last resort - ignore if even this fails
				}
			}
		}
		// Handle nested synth objects like noise synths
		else if (synth.noise && synth.noise.volume) {
			if (typeof synth.noise.volume.rampTo === 'function') {
				synth.noise.volume.rampTo(Tone.gainToDb(volume), 0.1);
			} else {
				synth.noise.volume.value = Tone.gainToDb(volume);
			}
		}
		// Handle other elements in complex synths
		else if (synth instanceof Object) {
			// Recursively update all potential synth elements
			Object.values(synth).forEach(element => {
				if (element && typeof element === 'object') {
					this.updateSynthVolume(element, volume, visited);
				}
			});
		}
	}

	updateAllVolumes() {
		// Use a small delay to prevent audio glitches
		setTimeout(() => {
			try {
				// Update current music if playing
				if (this.currentMusicPart && this.currentMusicSynth) {
					const sound = this.synths.get(this.currentMusicSynth);
					if (sound && sound.synth) {
						const musicVolume = this.getCategoryVolume('music');
						// Smooth transition to avoid clicks
						sound.synth.volume.rampTo(Tone.gainToDb(musicVolume), 0.1);
						if (sound.pad?.volume?.rampTo) {
							sound.pad.volume.rampTo(Tone.gainToDb(musicVolume * 0.3), 0.1);
						}
					}
				}

				// Update all active synths based on their category
				this.synths.forEach((sound, id) => {
					if (!sound.synth) return;

					const preset = this.synthPresets[id];
					if (!preset) return;

					const categoryVolume = this.getCategoryVolume(this.resolveSoundCategory(id, preset));
					const proximityMultiplier = sound.proximityMultiplier ?? 1;
					const finalVolume = categoryVolume * proximityMultiplier * (sound.baseVolume || 1);

					// Skip if volume hasn't changed — avoids interrupting ongoing fades (e.g. wind
					// ramps when an unrelated slider like footsteps triggers updateAllVolumes)
					if (Math.abs(finalVolume - (sound.currentVolume ?? -1)) < 0.005) return;

					this.updateSynthVolume(sound.synth, finalVolume);
					sound.currentVolume = finalVolume;
				});
			} catch (err) {
				console.warn("Error updating volumes:", err);
			}
		}, 20);
	}

	setMasterVolume(level) {
		this.volume.master = Math.max(0, Math.min(1, level));
		Tone.Destination.volume.value = Tone.gainToDb(this.volume.master);
		this.updateAllVolumes(); // Apply to all active sounds
	}

	setCategoryVolume(category, level) {
		if (category in this.volume) {
			this.volume[category] = Math.max(0, Math.min(1, level));
			this.updateAllVolumes(); // Apply to all active sounds
		}
	}














	toggle() {
		this.soundEnabled = !this.soundEnabled;
		this.musicEnabled = !this.musicEnabled;
		if (this.soundEnabled) {
			this.startAllSounds();
		} else {
			this.stopAllSounds();
		}
	}







	speakAnimalText(text, options) {
		return this.speech.speak(text, options);
	}

	speakAnimalWithEmotion(text, emotion, options) {
		return this.speech.speakWithEmotion(text, emotion, options);
	}

	showAnimalDialog(text, options, callback) {
		return this.speech.showDialog(text, options, callback);
	}

	playObjectSound(objectType, action) {
		const soundId = `obj_${objectType.toLowerCase()}_${action.toLowerCase()}`;
		const fallbackId = `obj_${objectType.toLowerCase()}`;

		if (this.synthPresets[soundId]) {
			this.play(soundId);
		} else if (this.synthPresets[fallbackId]) {
			this.play(fallbackId);
		}
	}

	playMyteSound(action, options = {}) {
		const normalizedAction = String(action || '').toLowerCase();
		const soundId = normalizedAction.startsWith('myte_') ? normalizedAction : `myte_${normalizedAction}`;

		// Prevent rapid UI sound triggering
		const now = Date.now();
		const lastPlayed = this.lastPlayTimes.get('myte_any') || 0;
		if (now - lastPlayed < this.minTimeBetweenSounds * 2) {
			return;
		}
		this.lastPlayTimes.set('myte_any', now);

		if (this.synthPresets[soundId]) {
			try {
				this.play(soundId, options);
			} catch (error) {
				console.warn(`Error playing Myte sound ${soundId}:`, error.message);
			}
		}
	}

	playUISound(action) {
		const soundId = `ui_${action.toLowerCase()}`;

		// Prevent rapid UI sound triggering
		const now = Date.now();
		const lastPlayed = this.lastPlayTimes.get('ui_any') || 0;
		if (now - lastPlayed < this.minTimeBetweenSounds * 2) {
			return;
		}
		this.lastPlayTimes.set('ui_any', now);

		if (this.synthPresets[soundId]) {
			try {
				this.play(soundId);
			} catch (error) {
				console.warn(`Error playing UI sound ${soundId}:`, error.message);
			}
		}
	}

	dispose() {
		if (this.boundTimeManager && this._handleTimeHourChange) {
			this.boundTimeManager.unsubscribe?.('hour', this._handleTimeHourChange);
		}
		this.boundTimeManager = null;
		this._handleTimeHourChange = null;

		// Stop all sounds
		this.synths.forEach((sound, id) => {
			this.stop(id);

			// Dispose synthesizers
			this.disposeSoundResources(sound);
		});

		// Stop and dispose all loops
		this.loops.forEach(loop => {
			loop.stop();
			loop.dispose();
		});

		// Stop music
		this.stopMusic();

		// Dispose effects
		if (this.reverb) this.reverb.dispose();

		// Clear collections
		this.synths.clear();
		this.loops.clear();

		if (this.speech) {
			this.speech.dispose();
			this.speech = null;
		}

		this.initialized = false;
	}
}
