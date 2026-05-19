
class MyteSpeech {
	constructor(soundManager) {
		// Store reference to the parent SoundManager
		this.soundManager = soundManager;

		// Initialize phoneme mapping
		this.initPhonemeSystem();



		// Active speech tracking
		this.activeSpeech = null;
	}

	initPhonemeSystem() {
		// Create a consolidated phoneme data structure
		const phonemeData = {
			// Single vowels
			'a': { phoneme: 'ah', pitch: 0, duration: 3 },
			'e': { phoneme: 'eh', pitch: 2, duration: 2.5 },
			'i': { phoneme: 'ee', pitch: 4, duration: 2.5 },
			'o': { phoneme: 'oh', pitch: -2, duration: 3 },
			'u': { phoneme: 'oo', pitch: -4, duration: 3 },
			'y': { phoneme: 'ih', pitch: 3, duration: 2 },
			
			// Vowel combinations
			'ai': { phoneme: 'ay', pitch: 1, duration: 3.5 },
			'ay': { phoneme: 'ay', pitch: 1, duration: 3.5 },
			'ea': { phoneme: 'ee', pitch: 4, duration: 2.5 },
			'ee': { phoneme: 'ee', pitch: 4, duration: 2.5 },
			'ie': { phoneme: 'eye', pitch: 3, duration: 3.5 },
			'oa': { phoneme: 'oh', pitch: -2, duration: 3 },
			'oo': { phoneme: 'oo', pitch: -4, duration: 3 },
			'ou': { phoneme: 'ow', pitch: -1, duration: 3.5 },
			'ow': { phoneme: 'ow', pitch: -1, duration: 3.5 },
			'ue': { phoneme: 'oo', pitch: -4, duration: 3 },
			'ui': { phoneme: ['oo', 'ee'], pitch: -1, duration: 3 },
			'ey': { phoneme: 'ay', pitch: 1, duration: 3.5 },
			'ae': { phoneme: 'ay', pitch: 1, duration: 3.5 },
			'au': { phoneme: 'aw', pitch: -3, duration: 3 },
			'aw': { phoneme: 'aw', pitch: -3, duration: 3 },
			'eu': { phoneme: 'yu', pitch: -1, duration: 3 },
			'ew': { phoneme: 'yu', pitch: -1, duration: 3 },
			'ei': { phoneme: 'ay', pitch: 1, duration: 3.5 },
			'oi': { phoneme: 'oy', pitch: -2, duration: 3.5 },
			'oy': { phoneme: 'oy', pitch: -2, duration: 3.5 },
			
			// Consonants
			'b': { phoneme: 'b', pitch: -3, duration: 1 },
			'c': { phoneme: 'k', pitch: 0, duration: 1 },
			'd': { phoneme: 'd', pitch: -1, duration: 1 },
			'f': { phoneme: 'f', pitch: 2, duration: 1.5 },
			'g': { phoneme: 'g', pitch: -4, duration: 1 },
			'h': { phoneme: 'h', pitch: 0, duration: 1.5 },
			'j': { phoneme: 'j', pitch: 1, duration: 1.5 },
			'k': { phoneme: 'k', pitch: 0, duration: 1 },
			'l': { phoneme: 'l', pitch: 2, duration: 2 },
			'm': { phoneme: 'm', pitch: -2, duration: 2 },
			'n': { phoneme: 'n', pitch: -1, duration: 1.5 },
			'p': { phoneme: 'p', pitch: 0, duration: 1 },
			'q': { phoneme: 'kw', pitch: -1, duration: 2 },
			'r': { phoneme: 'r', pitch: 1, duration: 1.5 },
			's': { phoneme: 's', pitch: 3, duration: 2 },
			't': { phoneme: 't', pitch: 2, duration: 1 },
			'v': { phoneme: 'v', pitch: -1, duration: 1.5 },
			'w': { phoneme: 'w', pitch: -2, duration: 2 },
			'x': { phoneme: ['k', 's'], pitch: 1, duration: 2 },
			'z': { phoneme: 'z', pitch: 1, duration: 2 },
			
			// Consonant combinations
			'th': { phoneme: 'th', pitch: 1, duration: 1.5 },
			'sh': { phoneme: 'sh', pitch: 2, duration: 2 },
			'ch': { phoneme: 'ch', pitch: 0, duration: 1.5 },
			'wh': { phoneme: ['w', 'h'], pitch: -1, duration: 2.5 },
			'ph': { phoneme: 'f', pitch: 2, duration: 1.5 },
			'gh': { phoneme: 'g', pitch: -4, duration: 1 },
			'ng': { phoneme: 'ng', pitch: -3, duration: 2 },
			'kn': { phoneme: 'n', pitch: -1, duration: 1.5 },
			'wr': { phoneme: 'r', pitch: 1, duration: 1.5 },
			'tch': { phoneme: 'ch', pitch: 0, duration: 1.5 },
			'dg': { phoneme: 'j', pitch: 1, duration: 1.5 },
			'ck': { phoneme: 'k', pitch: 0, duration: 1 },
			'ps': { phoneme: 's', pitch: 3, duration: 2 },
			'mn': { phoneme: 'm', pitch: -2, duration: 2 },
			'gn': { phoneme: 'n', pitch: -1, duration: 1.5 },
			'qu': { phoneme: ['k', 'w'], pitch: -1, duration: 2 },
			'sc': { phoneme: 's', pitch: 3, duration: 2 },
			'zh': { phoneme: 'zh', pitch: 0, duration: 2 },
			
			// Common English word endings
			'ing': { phoneme: ['ih', 'ng'], pitch: 0, duration: 3 },
			'ed': { phoneme: 'd', pitch: -1, duration: 1 },
			'er': { phoneme: 'er', pitch: 0, duration: 2 },
			'le': { phoneme: 'ul', pitch: -2, duration: 2 },
			'es': { phoneme: 'z', pitch: 1, duration: 1.5 },
			'tion': { phoneme: ['sh', 'un'], pitch: 1, duration: 3 },
			'sion': { phoneme: ['zh', 'un'], pitch: 0, duration: 3 }
		};
	
		// Extract the data into separate maps for different purposes
		this.phonemeMap = {};
		this.phonemePitches = {};
		this.phonemeDurations = {};
	
		// Process each entry in the phoneme data
		Object.entries(phonemeData).forEach(([text, data]) => {
			// Set up phoneme mapping
			this.phonemeMap[text] = Array.isArray(data.phoneme) ? data.phoneme : [data.phoneme];
			
			// Set up phoneme pitch mapping
			if (Array.isArray(data.phoneme)) {
				data.phoneme.forEach(p => {
					this.phonemePitches[p] = data.pitch;
				});
			} else {
				this.phonemePitches[data.phoneme] = data.pitch;
			}
			
			// Set up phoneme duration mapping
			if (Array.isArray(data.phoneme)) {
				data.phoneme.forEach(p => {
					this.phonemeDurations[p] = data.duration / data.phoneme.length; // Split duration
				});
			} else {
				this.phonemeDurations[data.phoneme] = data.duration;
			}
		});
	}


	applyEffect(note, phoneme, wordPosition, wordLength) {
		// "bouncy" pitch pattern
		const bounceFactor = 2; // Controls how "bouncy" the pitch is
		const bouncyPitch = Math.sin(wordPosition * Math.PI) * bounceFactor;
		
		// "stair step" pitch pattern between words
		const stepPitch = -1 * (wordPosition / wordLength);
		
		// Combine effects and apply to base note
		const pitchOffset = bouncyPitch + stepPitch;
		return Tone.Frequency(note).transpose(pitchOffset).toNote();
	}


	/**
	 * Create a character voice profile
	 * @param {string} characterId - Unique character identifier
	 * @param {Object} options - Voice configuration options
	 */
	createVoice(characterId, options = {}) {
		this.soundManager.speciesVoices[characterId] = {
			synthType: options.synthType || "Synth",
			baseNote: options.baseNote || "C4",
			settings: options.settings || {
				oscillator: { type: options.waveform || "triangle" },
				envelope: {
					attack: options.attack || 0.01,
					decay: options.decay || 0.1,
					sustain: options.sustain || 0.2,
					release: options.release || 0.2
				}
			},
			volume: options.volume || 0.5
		};

		return this.soundManager.speciesVoices[characterId];
	}

	/**
	 * Convert text to phoneme sequences
	 * @param {string} text - Input text
	 * @returns {Array} Array of phonemes
	 */
	textToPhonemes(text) {
		// Convert to lowercase
		text = text.toLowerCase();

		const phonemes = [];
		let i = 0;

		// Process character by character, looking for phoneme matches
		while (i < text.length) {
			let matched = false;

			// Try two-character combinations first
			if (i < text.length - 1) {
				const combo = text.substr(i, 2);
				if (this.phonemeMap[combo]) {
					phonemes.push(...this.phonemeMap[combo]);
					i += 2;
					matched = true;
				}
			}

			// If no combo match, try single character
			if (!matched) {
				const char = text[i];
				if (this.phonemeMap[char]) {
					phonemes.push(...this.phonemeMap[char]);
				} else {
					// For unrecognized characters, just use the character itself
					phonemes.push(char);
				}
				i++;
			}
		}

		return phonemes;
	}

	/**
	 * Get the appropriate note for a phoneme
	 * @param {string} phoneme - The phoneme
	 * @param {string} baseNote - Base note
	 * @param {number} pitchMultiplier - Pitch adjustment
	 * @returns {string} The note to play
	 */
	getPhonemeNote(phoneme, baseNote, pitchMultiplier = 1) {
		// Get pitch offset for phoneme or default to 0
		const semitones = (this.phonemePitches[phoneme] || 0) * pitchMultiplier;

		// Return transposed note
		return Tone.Frequency(baseNote).transpose(semitones).toNote();
	}

	/**
	 * Get appropriate duration for a phoneme
	 * @param {string} phoneme - The phoneme
	 * @param {number} baseSpeed - Base duration unit
	 * @returns {number} The duration in seconds
	 */
	getPhonemeDuration(phoneme, baseSpeed) {
		// Get duration multiplier for phoneme or default to 1.5
		const multiplier = this.phonemeDurations[phoneme] || 1.5;
		return baseSpeed * multiplier;
	}

	/**
	 * Speak text using phoneme-based synthesis
	 * @param {string} text - Text to speak
	 * @param {Object} options - Speech options
	 * @returns {number} Total speech duration
	 */
	speak(text, options = {}) {
		if (!this.soundManager.initialized || !this.soundManager.soundEnabled) return 0;

		// Default options
		const settings = {
			character: options.character || "default",
			speed: options.speed || 1,
			pitch: options.pitch || 1,
			volume: options.volume || 0.75,
			variation: options.variation || 0.1,
			punctuationPauses: options.punctuationPauses !== false,
			emphasizeWords: options.emphasizeWords !== false,
			stopExisting: options.stopExisting !== false
		};

		// Stop any existing speech if requested
		if (settings.stopExisting && this.activeSpeech) {
			if (this.activeSpeech.synth && typeof this.activeSpeech.synth.dispose === 'function') {
				this.activeSpeech.synth.dispose();
			}
			if (this.activeSpeech.timeout) {
				clearTimeout(this.activeSpeech.timeout);
			}
		}

		// Get voice profile
		const voiceProfile = this.soundManager.speciesVoices[options?.species] || this.soundManager.speciesVoices.default;
		const baseSynthType = voiceProfile.synthType || "Synth";
		const baseNote = voiceProfile.baseNote || "C4";


		// Create temporary synth for speech
		let synth;
		switch (baseSynthType) {
			case "FM":
				synth = new Tone.FMSynth(voiceProfile.settings).toDestination();
				break;
			case "AM":
				synth = new Tone.AMSynth(voiceProfile.settings).toDestination();
				break;
			default:
				synth = new Tone.Synth(voiceProfile.settings).toDestination();
		}

		// Set volume using SoundManager's volume system
		synth.volume.value = Tone.gainToDb(settings.volume * this.soundManager.volume.sfx);

		// Break text into words and convert to phonemes
		const words = text.split(/\s+/);
		let time = Tone.now();
		const baseSpeed = 0.05 / settings.speed; // Base duration per phoneme

		// Schedule each word
		for (let i = 0; i < words.length; i++) {
			const word = words[i];

			// Extract any trailing punctuation
			const punctuationMatch = word.match(/([.,!?;:]+)$/);
			const punctuation = punctuationMatch ? punctuationMatch[1] : '';
			const cleanWord = word.replace(/[.,!?;:]+$/, '');

			// Get phonemes for this word
			const phonemes = this.textToPhonemes(cleanWord);

			// Word emphasis (pitch changes throughout the word)
			const wordEmphasis = settings.emphasizeWords ?
				(i % 2 === 0 ? 1 : 0.9) * settings.pitch : settings.pitch;

			// Schedule each phoneme in the word
			for (let j = 0; j < phonemes.length; j++) {
				const phoneme = phonemes[j];

				// Calculate phoneme position in word for pitch curve
				const positionInWord = j / phonemes.length;
				let pitchMultiplier = wordEmphasis;

				// Apply pitch curve (rise at beginning, fall at end)
				if (settings.emphasizeWords && phonemes.length > 1) {
					// Create a slight arc in pitch across the word
					pitchMultiplier *= 1 + (0.2 * Math.sin((positionInWord - 0.5) * Math.PI));
				}

				// Add randomness for natural sound
				const randomVariation = (Math.random() * 2 - 1) * settings.variation;
				pitchMultiplier *= (1 + randomVariation);


				const duration = this.getPhonemeDuration(phoneme, baseSpeed);
				const basePhonemeNote = this.getPhonemeNote(phoneme, baseNote, pitchMultiplier);
				const acNote = this.applyEffect(basePhonemeNote, phoneme, j/phonemes.length, phonemes.length);

				const randomDelay = Math.random() > 0.7 ? baseSpeed * 0.5 : 0;
				const actualDuration = duration * 0.8;

				synth.triggerAttackRelease(acNote, actualDuration, time);
				time += duration + randomDelay;


			}

			// Add pause after the word
			time += baseSpeed * 2;

			// Handle punctuation pauses
			if (punctuation && settings.punctuationPauses) {
				// Longer pauses for different punctuation
				if (punctuation.includes('.') || punctuation.includes('!') || punctuation.includes('?')) {
					time += baseSpeed * 8; // Full stop
				} else if (punctuation.includes(',') || punctuation.includes(';')) {
					time += baseSpeed * 5; // Comma pause
				} else {
					time += baseSpeed * 3; // Other punctuation
				}
			}
		}

		// Calculate total speech duration
		const totalDuration = time - Tone.now();

		// Dispose synth after speech is complete
		const timeout = setTimeout(() => {
			synth.dispose();
			// Remove from active speech tracking
			if (this.activeSpeech && this.activeSpeech.synth === synth) {
				this.activeSpeech = null;
			}
		}, totalDuration * 1000 + 1000); // Add buffer time

		// Save reference to active speech
		this.activeSpeech = {
			synth: synth,
			timeout: timeout,
			endTime: time
		};

		return totalDuration; // Return the total duration
	}

	/**
	 * Speak with emotion modifiers
	 * @param {string} text - Text to speak
	 * @param {string} emotion - Emotion name
	 * @param {Object} options - Additional options
	 * @returns {number} Total speech duration
	 */
	speakWithEmotion(text, emotion = "neutral", options = {}) {
		// Emotion settings
		const emotions = {
			happy: {
				pitch: 1.2,
				speed: 1.3,
				variation: 0.15
			},
			sad: {
				pitch: 0.8,
				speed: 0.7,
				variation: 0.05
			},
			angry: {
				pitch: 1.1,
				speed: 1.5,
				variation: 0.25
			},
			sleepy: {
				pitch: 0.7,
				speed: 0.6,
				variation: 0.05
			},
			excited: {
				pitch: 1.3,
				speed: 1.4,
				variation: 0.2
			},
			neutral: {
				pitch: 1.0,
				speed: 1.0,
				variation: 0.1
			}
		};

		// Get emotion settings or default to neutral
		const emotionSettings = emotions[emotion] || emotions.neutral;

		// Merge emotion settings with provided options
		const mergedOptions = {
			...options,
			pitch: (options.pitch || 1) * emotionSettings.pitch,
			speed: (options.speed || 1) * emotionSettings.speed,
			variation: (options.variation || 0.1) * emotionSettings.variation
		};

		// Speak with emotion settings
		return this.speak(text, mergedOptions);
	}

	/**
	 * Display dialogue with synchronized text bubble
	 * @param {string} text - Text to speak
	 * @param {Object} options - Dialog options
	 * @param {Function} onTextUpdate - Callback for text updates
	 * @returns {number} Total duration
	 */
	showDialog(text, options = {}, onTextUpdate = null) {
		// Default options
		const settings = {
			...options,
			textSpeed: options.textSpeed || 1, // Text display speed
			characterName: options.characterName || '',
			textDelay: options.textDelay || 0.07, // Seconds per character for text display
			maxLineLength: options.maxLineLength || 40,
		};

		// Break into lines if needed (simple word wrapping)
		const lines = this.wrapTextToLines(text, settings.maxLineLength);

		// Start speaking
		const totalDuration = this.speak(text, settings);

		// Call text bubble callback if provided
		if (typeof onTextUpdate === 'function') {
			// Calculate character reveal timing
			const effectiveDelay = settings.textDelay / settings.textSpeed;
			let charIndex = 0;
			let dialogTimer = null;

			// Create a looping function to gradually reveal text
			const revealText = () => {
				if (charIndex <= text.length) {
					// Calculate which line and position we're at
					let currentLineIndex = 0;
					let charsCount = 0;

					for (let i = 0; i < lines.length; i++) {
						if (charsCount + lines[i].length >= charIndex) {
							currentLineIndex = i;
							break;
						}
						charsCount += lines[i].length + 1; // +1 for the newline
					}

					// Call callback with current text state
					onTextUpdate({
						text: text.substring(0, charIndex),
						lines: lines.map((line, i) =>
							i < currentLineIndex ? line :
								i === currentLineIndex ? line.substring(0, charIndex - charsCount) : ''
						),
						isComplete: charIndex === text.length,
						charIndex: charIndex,
						characterName: settings.characterName
					});

					charIndex++;
					dialogTimer = setTimeout(revealText, effectiveDelay * 1000);
				} else {
					// Text is fully revealed
					dialogTimer = setTimeout(() => {
						onTextUpdate({
							text: text,
							lines: lines,
							isComplete: true,
							charIndex: text.length,
							characterName: settings.characterName,
							isFinal: true
						});
						dialogTimer = null;
					}, 1000); // Keep text visible for a second after completion
				}
			};

			// Start the text reveal process
			revealText();

			// Store the dialog timer with the active speech for cleanup
			if (this.activeSpeech) {
				this.activeSpeech.dialogTimer = dialogTimer;
			}
		}

		return totalDuration;
	}

	/**
	 * Wrap text into lines of appropriate length
	 * @param {string} text - Text to wrap
	 * @param {number} maxLineLength - Maximum characters per line
	 * @returns {Array} Array of line strings
	 */
	wrapTextToLines(text, maxLineLength) {
		const words = text.split(' ');
		const lines = [];
		let currentLine = '';

		words.forEach(word => {
			if (currentLine.length + word.length + 1 > maxLineLength) {
				lines.push(currentLine);
				currentLine = word;
			} else {
				currentLine += (currentLine ? ' ' : '') + word;
			}
		});

		if (currentLine) {
			lines.push(currentLine);
		}

		return lines;
	}

	/**
	 * Stop any currently playing speech
	 */
	stopSpeech() {
		if (this.activeSpeech) {
			if (this.activeSpeech.synth) {
				this.activeSpeech.synth.dispose();
			}

			if (this.activeSpeech.timeout) {
				clearTimeout(this.activeSpeech.timeout);
			}

			if (this.activeSpeech.dialogTimer) {
				clearTimeout(this.activeSpeech.dialogTimer);
			}

			this.activeSpeech = null;
		}
	}

	/**
	 * Clean up and dispose resources
	 */
	dispose() {
		this.stopSpeech();
		this.soundManager.speciesVoices = {};
	}
}