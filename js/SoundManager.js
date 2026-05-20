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
		this.volume = {
			master: options.masterVolume || 1,
			sfx: options.sfxVolume || 0.8,
			music: options.musicVolume || 0,
			ui: options.uiVolume || 0.6,
			ambient: options.ambientVolume || 0
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
		this.musicFadeTime = options.musicFadeTime || 2;

		// Add these properties to the constructor
		this.lastPlayTimes = new Map();
		this.minTimeBetweenSounds = 50; // ms
		this.triggeredSounds = new Set(); // Keep track of currently triggered sounds

		// Species sound profiles - defines which instrument/synth to use for each species
		this.defaultSpeciesVoices = {
			"snail": {
				synthType: "FM",  // FMSynth for snails
				settings: {
					harmonicity: 3,
					modulationIndex: 10,
					oscillator: { type: "sine" },
					envelope: {
						attack: 0.1,
						decay: 0.2,
						sustain: 0.2,
						release: 0.3
					},
					modulation: { type: "triangle" },
					modulationEnvelope: {
						attack: 0.1,
						decay: 0.2,
						sustain: 0.3,
						release: 0.1
					}
				},
				baseNote: "G3",  // Base note for this species
				volume: 0.5
			},
			"worm": {
				synthType: "Synth",
				settings: {
					oscillator: { type: "triangle" },
					envelope: {
						attack: 0.03,
						decay: 0.12,
						sustain: 0.15,
						release: 0.22
					}
				},
				baseNote: "D3",
				volume: 0.45
			},
			"butterfly": {
				synthType: "AM",  // AMSynth for butterflies
				settings: {
					harmonicity: 2,
					oscillator: { type: "sine" },
					envelope: {
						attack: 0.01,
						decay: 0.1,
						sustain: 0.2,
						release: 0.4
					},
					modulation: { type: "sine" },
					modulationEnvelope: {
						attack: 0.2,
						decay: 0.1,
						sustain: 0.3,
						release: 0.2
					}
				},
				baseNote: "C5",  // Higher pitched for butterflies
				volume: 0.4
			},
			"frog": { // deep blips
				synthType: "Synth",  // Simple synth for frogs
				settings: {
					oscillator: { type: "sawtooth" },
					envelope: {
						attack: 0.01,
						decay: 0.2,
						sustain: 0.1,
						release: 0.4
					}
				},
				baseNote: "D2",  // Low notes for frogs
				volume: 0.6
			},
			"rabbit": {
				synthType: "PluckSynth",  // Pluck synth for rabbits
				settings: {
					attackNoise: 1,
					dampening: 4000,
					resonance: 0.98,
					release: 1.2
				},
				baseNote: "A4",
				volume: 0.4
			},
			"bird": { // little dots
				synthType: "FM",
				settings: {
					harmonicity: 8,
					modulationIndex: 5,
					oscillator: { type: "sine" },
					envelope: {
						attack: 0.001,
						decay: 0.05,
						sustain: 0.1,
						release: 0.2
					},
					modulation: { type: "triangle" },
					modulationEnvelope: {
						attack: 0.01,
						decay: 0.1,
						sustain: 0.3,
						release: 0.5
					}
				},
				baseNote: "E5",  // High notes for birds
				volume: 0.35
			},

			"hedgehog": {
				synthType: "NoiseSynth",
				settings: {
					noise: { type: "white" },
					envelope: {
						attack: 0.01,
						decay: 0.15,
						sustain: 0.1,
						release: 0.1
					}
				},
				baseNote: "C3",  // Base note (though noise synth doesn't use notes directly)
				volume: 0.3
			},
			"fox": { // shifty
				synthType: "AM",
				settings: {
					harmonicity: 1.5,
					oscillator: { type: "triangle" },
					envelope: {
						attack: 0.05,
						decay: 0.3,
						sustain: 0.4,
						release: 0.8
					},
					modulation: { type: "square" },
					modulationEnvelope: {
						attack: 0.1,
						decay: 0.2,
						sustain: 0.3,
						release: 0.4
					}
				},
				baseNote: "D4",
				volume: 0.5
			},
			"turtle": { // mysterious
				synthType: "FM",
				settings: {
					harmonicity: 1,
					modulationIndex: 3,
					oscillator: { type: "sine" },
					envelope: {
						attack: 0.2,
						decay: 0.5,
						sustain: 0.5,
						release: 1.5
					},
					modulation: { type: "sine" },
					modulationEnvelope: {
						attack: 0.5,
						decay: 0.5,
						sustain: 0.7,
						release: 1
					}
				},
				baseNote: "A2",  // Low, slow notes for turtles
				volume: 0.6
			},
			"bee": {
				synthType: "AMOscillator",
				settings: {
					type: "square",
					modulationType: "sine",
					harmonicity: 10,
					volume: 0.3
				},
				baseNote: "A5",  // High buzzing for bees
				volume: 0.25
			},
			"penguin": {
				synthType: "Synth",
				settings: {
					oscillator: { type: "triangle" },
					envelope: {
						attack: 0.05,
						decay: 0.1,
						sustain: 0.3,
						release: 0.6
					}
				},
				baseNote: "F3",
				volume: 0.5
			},
			"owl": {
				synthType: "DuoSynth",
				settings: {
					vibratoAmount: 0.5,
					vibratoRate: 5,
					harmonicity: 1.5,
					voice0: {
						oscillator: { type: "sine" },
						envelope: {
							attack: 0.01,
							decay: 0.4,
							sustain: 0.2,
							release: 0.7
						}
					},
					voice1: {
						oscillator: { type: "sine" },
						envelope: {
							attack: 0.1,
							decay: 0.2,
							sustain: 0.3,
							release: 0.9
						}
					}
				},
				baseNote: "D3",
				volume: 0.4
			},
			"slime": { // bass
				synthType: "MembraneSynth",
				settings: {
					pitchDecay: 0.05,
					octaves: 4,
					oscillator: { type: "sine" },
					envelope: {
						attack: 0.01,
						decay: 0.4,
						sustain: 0.1,
						release: 1.4,
						attackCurve: "exponential"
					}
				},
				baseNote: "C2",  // Very low notes for slime creatures
				volume: 0.5
			},
			"dragon": {	// strong
				synthType: "FMSynth",
				settings: {
					harmonicity: 3.01,
					modulationIndex: 14,
					oscillator: { type: "sawtooth" },
					envelope: {
						attack: 0.2,
						decay: 0.3,
						sustain: 0.4,
						release: 1.2
					},
					modulation: { type: "square" },
					modulationEnvelope: {
						attack: 0.01,
						decay: 0.5,
						sustain: 0.2,
						release: 0.5
					}
				},
				baseNote: "G2",  // Deep roaring for dragons
				volume: 0.7
			},
			"ghost": { // mysterious and cool
				synthType: "AMSynth",
				settings: {
					harmonicity: 3.5,
					oscillator: { type: "sine" },
					envelope: {
						attack: 0.3,
						decay: 0.5,
						sustain: 0.5,
						release: 1.5
					},
					modulation: { type: "sine" },
					modulationEnvelope: {
						attack: 0.5,
						decay: 0.5,
						sustain: 0.7,
						release: 2
					}
				},
				baseNote: "B3",  // Spooky tone for ghosts
				volume: 0.35
			},
			"blips": {
				synthType: "PolySynth", // For those characteristic blips
				settings: {
					oscillator: { type: "pulse", width: 0.5 },
					envelope: {
						attack: 0.005,
						decay: 0.05,
						sustain: 0.01,
						release: 0.1
					}
				},
				modifiers: {
					// Pitch shifting to create the fast talking effect
					pitchShift: {
						enabled: true,
						pitch: 5,
						windowSize: 0.05,
						delayTime: 0.01
					}
				},
				baseNote: "C5",  // Higher notes for the characteristic blips
				volume: 0.4,
				// Special random note patterns
				notePattern: ["C5", "E5", "G5", "A5", "C6"],
				speedMultiplier: 5 // Very fast notes
			},

			"low": {
				synthType: "Synth",
				settings: {
					oscillator: { type: "square" },
					envelope: {
						attack: 0.01,
						decay: 0.05,
						sustain: 0.01,
						release: 0.1
					}
				},
				baseNote: "A3",  // Lower than villager
				volume: 0.45,
				notePattern: ["A3", "C4", "E4", "G3"],
				speedMultiplier: 4
			},

			"cheerful": {
				synthType: "PolySynth",
				settings: {
					oscillator: { type: "sine" },
					envelope: {
						attack: 0.005,
						decay: 0.04,
						sustain: 0.01,
						release: 0.08
					}
				},
				baseNote: "E5",  // Higher notes for cheerful character
				volume: 0.35,
				notePattern: ["E5", "G5", "B5", "C6", "A5"],
				speedMultiplier: 4.5
			},

			"musician": {
				synthType: "PolySynth",
				settings: {
					oscillator: { type: "sine" },
					envelope: {
						attack: 0.1,
						decay: 0.2,
						sustain: 0.3,
						release: 0.4
					}
				},
				baseNote: "D4",  // More musical character
				volume: 0.5,
				notePattern: ["D4", "F4", "A4", "C5", "B4"],
				speedMultiplier: 2 // Slower for singing style
			},

			"midlow": {
				synthType: "Synth",
				settings: {
					oscillator: { type: "triangle" },
					envelope: {
						attack: 0.02,
						decay: 0.1,
						sustain: 0.05,
						release: 0.2
					}
				},
				baseNote: "G3",  // Mid-low range for owl character
				volume: 0.4,
				notePattern: ["G3", "B3", "D4", "F3", "A3"],
				speedMultiplier: 3.5
			},

			"high": {
				synthType: "PolySynth",
				settings: {
					oscillator: { type: "triangle" },
					envelope: {
						attack: 0.01,
						decay: 0.08,
						sustain: 0.02,
						release: 0.15
					}
				},
				baseNote: "B4",  // Higher range for young owl 
				volume: 0.35,
				notePattern: ["B4", "D5", "F#5", "A5", "E5"],
				speedMultiplier: 4
			},

			"highblip": {
				synthType: "Synth",
				settings: {
					oscillator: { type: "pulse", width: 0.4 },
					envelope: {
						attack: 0.005,
						decay: 0.04,
						sustain: 0.01,
						release: 0.1
					}
				},
				baseNote: "F4",
				volume: 0.4,
				notePattern: ["F4", "A4", "C5", "E5", "D5"],
				speedMultiplier: 4.2
			},

			"sawtooth": {
				synthType: "Synth",
				settings: {
					oscillator: { type: "sawtooth" },
					envelope: {
						attack: 0.02,
						decay: 0.1,
						sustain: 0.05,
						release: 0.2
					}
				},
				baseNote: "C3",  // Lower for sailor
				volume: 0.5,
				notePattern: ["C3", "E3", "G3", "B3", "D4"],
				speedMultiplier: 3
			},

			"gruff": {
				synthType: "Synth",
				settings: {
					oscillator: { type: "square" },
					envelope: {
						attack: 0.01,
						decay: 0.15,
						sustain: 0.1,
						release: 0.1
					}
				},
				baseNote: "D3",  // Gruffer lower register
				volume: 0.6, // Slightly louder
				notePattern: ["D3", "F3", "A3", "C4", "B3"],
				speedMultiplier: 5.5 // Very fast for angry 
			},
			"default": {  // Fallback for any unspecified species
				synthType: "Synth",
				settings: {
					oscillator: { type: "triangle" },
					envelope: {
						attack: 0.01,
						decay: 0.1,
						sustain: 0.2,
						release: 0.2
					}
				},
				baseNote: "C4",
				volume: 0.5
			}
		};
		this.speciesVoices = this._cloneVoiceData(this.defaultSpeciesVoices);

		// Sound definitions using Tone.js synthesis
		this.synthPresets = {
			// Music synths
			"music_main": {
				type: "music",
				create: () => {
					const synth = new Tone.PolySynth(Tone.Synth, {
						oscillator: {
							type: "sine"
						},
						envelope: {
							attack: 0.05,
							decay: 0.2,
							sustain: 0.8,
							release: 1.5
						}
					}).toDestination();
					// // synth.volume.value = Tone.gainToDb(0.4);

					const pattern = [];
					const notes = ["C3", "E3", "G3", "B3", "C4", "B3", "G3", "E3"];
					const times = [0, "0:1", "0:2", "0:3", "1:0", "1:1", "1:2", "1:3"];

					for (let i = 0; i < notes.length; i++) {
						pattern.push({
							note: notes[i],
							time: times[i],
							duration: "4n"
						});
					}

					return {
						synth,
						pattern,
						tempo: 90,
						loop: true
					};
				}
			},

			"music_sunny": {
				"type": "music",
				"create": () => {
					const synth = new Tone.PolySynth(Tone.Synth, {
						oscillator: {
							type: "sine"
						},
						envelope: {
							attack: 0.1, //.4
							decay: 0.3,
							sustain: 0.7,
							release: 2.5
						}
					}).toDestination();
					// // synth.volume.value = Tone.gainToDb(0.1);

					const pattern = [];
					const notes = [
						"C4", "E4", "G4", "C5", "A4", "F4", "D4", "G4",
						"E4", "C4", "F4", "A4", "G4", "B4", "C5", "D5"
					];
					const times = [
						"0:0", "0:1", "0:2", "0:3", "1:0", "1:2", "2:0", "2:3",
						"3:0", "3:1", "3:2", "4:0", "4:2", "5:0", "5:2", "6:0"
					];

					for (let i = 0; i < notes.length; i++) {
						pattern.push({
							note: notes[i],
							time: times[i],
							duration: "4n"
						});
					}

					const pad = new Tone.PolySynth(Tone.Synth, {
						oscillator: {
							type: "sine"
						},
						envelope: {
							attack: 2,
							decay: 3,
							sustain: 0.5,
							release: 4
						}
					}).toDestination();
					pad.volume.value = Tone.gainToDb(0.2);

					const padPattern = [
						{ note: ["C3", "G3", "C4"], time: "0:0", duration: "1m" },
						{ note: ["F3", "A3", "C4"], time: "2:0", duration: "1m" },
						{ note: ["G3", "B3", "D4"], time: "4:0", duration: "1m" },
						{ note: ["C3", "E3", "G3"], time: "6:0", duration: "1m" }
					];

					return {
						synth,
						pad,
						pattern,
						padPattern,
						tempo: 100,
						loop: true
					};
				}
			},



			"music_night": {
				type: "music",
				create: () => {
					const synth = new Tone.PolySynth(Tone.Synth, {
						oscillator: {
							type: "sine"
						},
						envelope: {
							attack: 0.1,
							decay: 0.2,
							sustain: 0.7,
							release: 2
						}
					}).toDestination();
					// // synth.volume.value = Tone.gainToDb(0.35);

					const pattern = [];
					const notes = ["G2", "B2", "D3", "F#3", "G3", "D3", "B2", "G2"];
					const times = [0, "0:2", "1:0", "1:2", "2:0", "2:2", "3:0", "3:2"];
					const durations = ["2n", "2n", "2n", "2n", "2n", "2n", "2n", "2n"];

					for (let i = 0; i < notes.length; i++) {
						pattern.push({
							note: notes[i],
							time: times[i],
							duration: durations[i]
						});
					}

					return {
						synth,
						pattern,
						tempo: 70,
						loop: true
					};
				}
			},

			// UI sounds
			"ui_click": {
				type: "ui",
				create: () => {
					const synth = new Tone.MembraneSynth({
						pitchDecay: 0.05,
						octaves: 4,
						oscillator: { type: "sine" },
						envelope: {
							attack: 0.001,
							decay: 0.1,
							sustain: 0,
							release: 0.1
						}
					}).toDestination();
					// // synth.volume.value = Tone.gainToDb(0.3);
					return { synth, note: "C5", duration: "16n" };
				}
			},
			"ui_hover": {
				type: "ui",
				create: () => {
					const synth = new Tone.FMSynth({
						harmonicity: 8,
						modulationIndex: 2,
						oscillator: { type: "sine" },
						envelope: {
							attack: 0.001,
							decay: 0.1,
							sustain: 0,
							release: 0.1
						},
						modulation: { type: "square" },
						modulationEnvelope: {
							attack: 0.002,
							decay: 0.1,
							sustain: 0,
							release: 0.1
						}
					}).toDestination();
					// synth.volume.value = Tone.gainToDb(0.2);
					return { synth, note: "E6", duration: "32n" };
				}
			},
			"ui_select": {
				type: "ui",
				create: () => {
					const synth = new Tone.Synth({
						oscillator: { type: "triangle" },
						envelope: {
							attack: 0.001,
							decay: 0.1,
							sustain: 0.1,
							release: 0.1
						}
					}).toDestination();
					// synth.volume.value = Tone.gainToDb(0.5);
					return {
						synth,
						notes: ["C5", "G5"],
						durations: ["16n", "8n"]
					};
				}
			},
			"ui_error": {
				type: "ui",
				create: () => {
					const synth = new Tone.AMSynth({
						harmonicity: 3,
						oscillator: { type: "square" },
						envelope: {
							attack: 0.1,
							decay: 0.2,
							sustain: 0.3,
							release: 0.1
						}
					}).toDestination();
					// synth.volume.value = Tone.gainToDb(0.4);
					return {
						synth,
						notes: ["C4", "B3"],
						durations: ["16n", "8n"]
					};
				}
			},


			// Ball hit — bouncy thud
			"ball_hit": {
				type: "sfx",
				create: () => {
					const synth = new Tone.MembraneSynth({
						pitchDecay: 0.06,
						octaves: 2.5,
						oscillator: { type: "sine" },
						envelope: {
							attack: 0.001,
							decay: 0.18,
							sustain: 0,
							release: 0.08
						}
					}).toDestination();
					return { synth, note: "C3", duration: "16n" };
				}
			},

			// UI sounds for battery and item interactions
			"myte_battery_charging": {
				type: "ui",
				create: () => {
				const synth = new Tone.Synth({
					oscillator: { type: "sine" },
					envelope: {
					attack: 0.03,
					decay: 0.2,
					sustain: 0.2,
					release: 0.4
					}
				}).toDestination();
				// Gentle ascending sound
				return {
					synth,
					notes: ["G4", "C5", "E5"],
					durations: ["16n", "16n", "8n"]
				};
				}
			},
			
"myte_battery_depleting": {
  type: "ui",
  create: () => {
    const synth = new Tone.Synth({
      oscillator: { type: "triangle" },
      envelope: {
        attack: 0.01,
        decay: 0.2,
        sustain: 0.1,
        release: 0.3
      }
    }).toDestination();
    // Gentle warning sound - not alarming but noticeable
    return {
      synth,
      notes: ["A4", "F4"],
      durations: ["16n", "8n"]
    };
  }
},


"myte_battery_full": {
  type: "ui",
  create: () => {
    const synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "sine" },
      envelope: {
        attack: 0.02,
        decay: 0.1,
        sustain: 0.2,
        release: 0.4
      }
    }).toDestination();
    // Cheerful completion sound
    return {
      synth,
      notes: ["C5", "E5", "G5", "C6"],
      durations: ["16n", "16n", "16n", "8n"]
    };
  }
},

			"myte_battery_empty": {
				type: "ui",
				create: () => {
				const synth = new Tone.Synth({
					oscillator: { type: "triangle" },
					envelope: {
					attack: 0.01,
					decay: 0.1,
					sustain: 0.05,
					release: 0.3
					}
				}).toDestination();
				// Short descending tone
				return {
					synth,
					notes: ["C4", "G3"],
					durations: ["16n", "8n"]
				};
				}
			},
			
			"ui_pickup_item": {
				type: "ui",
				create: () => {
				const synth = new Tone.Synth({
					oscillator: { type: "sine" },
					envelope: {
					attack: 0.005,
					decay: 0.15,
					sustain: 0,
					release: 0.1
					}
				}).toDestination();
				// Quick cheerful up note
				return {
					synth,
					notes: ["E5", "A5"],
					durations: ["32n", "8n"]
				};
				}
			},
			
			"ui_drag_item": {
				type: "ui",
				create: () => {
				const synth = new Tone.Synth({
					oscillator: { type: "sine" },
					envelope: {
					attack: 0.001,
					decay: 0.06,
					sustain: 0,
					release: 0.08
					}
				}).toDestination();
				// Soft high tick — "lifted"
				return { synth, note: "B5", duration: "32n" };
				}
			},

			"ui_drop_item": {
				type: "ui",
				create: () => {
				const synth = new Tone.Synth({
					oscillator: { type: "triangle" },
					envelope: {
					attack: 0.001,
					decay: 0.1,
					sustain: 0,
					release: 0.2
					}
				}).toDestination();
				// Subtle, soft dropping sound
				return {
					synth,
					notes: ["A5", "E5"],
					durations: ["32n", "8n"]
				};
				}
			},

			"myte_slot_exit": {
				type: "sfx",
				create: () => {
					const synth = new Tone.Synth({
						oscillator: { type: "triangle" },
						envelope: {
							attack: 0.003,
							decay: 0.12,
							sustain: 0.05,
							release: 0.18
						}
					}).toDestination();
					return {
						synth,
						notes: ["D5", "A5", "D6"],
						durations: ["32n", "32n", "16n"]
					};
				}
			},

			"myte_slot_enter": {
				type: "sfx",
				create: () => {
					const synth = new Tone.Synth({
						oscillator: { type: "sine" },
						envelope: {
							attack: 0.002,
							decay: 0.14,
							sustain: 0,
							release: 0.22
						}
					}).toDestination();
					return {
						synth,
						notes: ["G5", "D5"],
						durations: ["32n", "8n"]
					};
				}
			},



			// Myte Sounds
			"myte_happy": {
				type: "sfx",
				create: () => {
					const synth = new Tone.Synth({
						oscillator: { type: "sine" },
						envelope: {
							attack: 0.01,
							decay: 0.1,
							sustain: 0.3,
							release: 0.1
						}
					}).toDestination();
					// synth.volume.value = Tone.gainToDb(0.5);
					return {
						synth,
						notes: ["G5", "C6"],
						durations: ["16n", "8n"]
					};
				}
			},
			"myte_sad": {
				type: "sfx",
				create: () => {
					const synth = new Tone.Synth({
						oscillator: { type: "sine" },
						envelope: {
							attack: 0.01,
							decay: 0.2,
							sustain: 0.2,
							release: 0.4
						}
					}).toDestination();
					// synth.volume.value = Tone.gainToDb(0.4);
					return {
						synth,
						notes: ["C4", "A3"],
						durations: ["8n", "8n"]
					};
				}
			},
			"myte_jump": {
				type: "sfx",
				create: () => {
					const synth = new Tone.Synth({
						oscillator: { type: "sine" },
						envelope: {
							attack: 0.001,
							decay: 0.1,
							sustain: 0,
							release: 0.1
						}
					}).toDestination();
					// synth.volume.value = Tone.gainToDb(0.5);
					return { synth, note: "G4", duration: "16n" };
				}
			},

			"myte_land": {
				type: "sfx",
				create: () => {
					const synth = new Tone.Synth({
						oscillator: { type: "sine" },
						envelope: {
							attack: 0.001,
							decay: 0.1,
							sustain: 0,
							release: 0.1
						}
					}).toDestination();
					// synth.volume.value = Tone.gainToDb(0.5);
					return { synth, note: "G4", duration: "16n" };
				}
			},

			/*
			"myte_land": {
				type: "sfx",
				create: () => {
					const synth = new Tone.MembraneSynth({
						pitchDecay: 0.05,
						octaves: 2,
						oscillator: { type: "sine" },
						envelope: {
							attack: 0.001,
							decay: 0.2,
							sustain: 0,
							release: 0.2
						}
					}).toDestination();
					// synth.volume.value = Tone.gainToDb(0.6);
					return { synth, note: "C2", duration: "16n" };
				}
			},
			*/

			"myte_eat": {
				type: "sfx",
				create: () => {
					const synth = new Tone.NoiseSynth({
						noise: { type: "pink" },
						envelope: {
							attack: 0.001,
							decay: 0.15,
							sustain: 0,
							release: 0.05
						}
					}).toDestination();
					// synth.volume.value = Tone.gainToDb(0.3);
					return { synth, duration: "16n" };
				}
			},
			"myte_sleep": {
				type: "sfx",
				create: () => {
					// Create a breathing sound
					const synth = new Tone.NoiseSynth({
						noise: { type: "pink" },
						envelope: {
							attack: 0.2,
							decay: 0.3,
							sustain: 0.1,
							release: 0.4
						}
					}).toDestination();
					// synth.volume.value = Tone.gainToDb(0.2);
					return { synth, duration: "4n" };
				}
			},
			"myte_pickup": {
				type: "sfx",
				create: () => {
					const synth = new Tone.Synth({
						oscillator: { type: "sine" },
						envelope: {
							attack: 0.001,
							decay: 0.1,
							sustain: 0.1,
							release: 0.1
						}
					}).toDestination();
					// synth.volume.value = Tone.gainToDb(0.5);
					return {
						synth,
						notes: ["C4", "E4", "G4"],
						durations: ["32n", "32n", "8n"]
					};
				}
			},
			"myte_putdown": {
				type: "sfx",
				create: () => {
					const synth = new Tone.Synth({
						oscillator: { type: "sine" },
						envelope: {
							attack: 0.001,
							decay: 0.1,
							sustain: 0.1,
							release: 0.1
						}
					}).toDestination();
					// synth.volume.value = Tone.gainToDb(0.5);
					return {
						synth,
						notes: ["G4", "E4", "C4"],
						durations: ["32n", "32n", "8n"]
					};
				}
			},

			// Environment Sounds
			"env_wind": {
				type: "ambient",
				create: () => {
					const noise = new Tone.Noise("brown").start();
					const autoFilter = new Tone.AutoFilter({
						frequency: 0.1,
						depth: 0.8,
						baseFrequency: 100,
						octaves: 2.5
					}).start();
					const filter = new Tone.Filter({
						frequency: 800,
						type: "lowpass",
						rolloff: -24
					});
					noise.connect(autoFilter);
					autoFilter.connect(filter);
					filter.toDestination();


					return {
						synth: { noise, autoFilter, filter },
						loop: true,
						volume: 1
					};
				}
			},
			"env_water": {
				type: "ambient",
				create: () => {
					const noise = new Tone.Noise("pink").start();
					const autoFilter = new Tone.AutoFilter({
						frequency: 0.2,
						depth: 0.5,
						baseFrequency: 200,
						octaves: 1.5
					}).start();
					const filter = new Tone.Filter({
						frequency: 1000,
						type: "lowpass",
						rolloff: -24
					});
					noise.connect(autoFilter);
					autoFilter.connect(filter);
					filter.toDestination();

					return {
						synth: { noise, autoFilter, filter },
						loop: true,
						volume: 0.2
					};
				}
			},
			"env_birds": {
				type: "ambient",
				create: () => {
					const synth = new Tone.PolySynth(Tone.FMSynth).toDestination();
					synth.set({
						harmonicity: 10,
						modulationIndex: 10,
						oscillator: { type: "sine" },
						envelope: {
							attack: 0.001,
							decay: 0.1,
							sustain: 0.1,
							release: 0.1
						},
						modulation: { type: "square" },
						modulationEnvelope: {
							attack: 0.001,
							decay: 0.5,
							sustain: 0.1,
							release: 0.1
						}
					});
					// synth.volume.value = Tone.gainToDb(0.3);

					// Generate random bird chirps periodically
					const pattern = [];
					const birdNotes = ["C7", "D7", "E7", "G7", "A7"];

					for (let i = 0; i < 20; i++) {
						const time = i * 2 + Math.random() * 2;
						const note = birdNotes[Math.floor(Math.random() * birdNotes.length)];
						pattern.push({ note, time, duration: "32n" });

						// Sometimes add a second note for a trill
						if (Math.random() > 0.5) {
							const trillNote = birdNotes[Math.floor(Math.random() * birdNotes.length)];
							pattern.push({ note: trillNote, time: time + 0.1, duration: "32n" });
						}
					}

					return {
						synth,
						pattern,
						loop: true,
						loopInterval: 30, // seconds
						volume: 0.2
					};
				}
			},




			"env_cricket": {
				type: "ambient",
				baseVolume: 0.01,  // <-- Define base volume here
				create: () => {
					const synth = new Tone.FMSynth({
						harmonicity: 12,
						modulationIndex: 20,
						oscillator: { type: "square" },
						envelope: {
							attack: 0.01,
							decay: 0.05,
							sustain: 0.01,
							release: 0.01
						},
						modulation: { type: "square" },
						modulationEnvelope: {
							attack: 0.01,
							decay: 0.01,
							sustain: 0.5,
							release: 0.01
						}
					}).toDestination();
					synth.volume.value = Tone.gainToDb(0.02);

					// Create cricket chirp sequences

					const pattern = [];
					for (let i = 0; i < 20; i++) {
						const time = i * 0.5 + Math.random() * 10;
						// Groups of chirps
						for (let j = 0; j < 3 + Math.floor(Math.random() * 3); j++) {
							pattern.push({
								note: "A7",
								time: time + (j * 0.08),
								duration: "64n"
							});
						}
					}


					/*
					const pattern = [];
					for (let i = 0; i < 8; i++) {  // Reduced from 20 to 8 groups
						const time = i * 1 + Math.random() * 15;  // Much longer gaps (was i * 0.5)
						// Groups of chirps
						for (let j = 0; j < 3 + Math.floor(Math.random() * 3); j++) {
							pattern.push({
								note: "A7",
								time: time + (j * 0.08),
								duration: "64n"
							});
						}
					}
						*/

					return {
						synth,
						pattern,
						loop: true,
						loopInterval: 15
					};
				}
			},

			// Object Sounds
			"obj_chest_open": {
				type: "sfx",
				create: () => {
					const synth = new Tone.MetalSynth({
						frequency: 200,
						envelope: {
							attack: 0.01,
							decay: 0.3,
							sustain: 0,
							release: 0.6
						},
						harmonicity: 3.1,
						modulationIndex: 32,
						resonance: 4000,
						octaves: 1.5
					}).toDestination();
					// synth.volume.value = Tone.gainToDb(0.4);
					return { synth, note: "G3", duration: "8n" };
				}
			},
			"obj_chest_close": {
				type: "sfx",
				create: () => {
					const synth = new Tone.MetalSynth({
						frequency: 150,
						envelope: {
							attack: 0.01,
							decay: 0.2,
							sustain: 0,
							release: 0.2
						},
						harmonicity: 3.5,
						modulationIndex: 40,
						resonance: 3000,
						octaves: 1
					}).toDestination();
					// synth.volume.value = Tone.gainToDb(0.5);
					return { synth, note: "D3", duration: "8n" };
				}
			},
			"obj_door_open": {
				type: "sfx",
				create: () => {
					const synth = new Tone.MembraneSynth({
						pitchDecay: 0.02,
						octaves: 1.5,
						oscillator: { type: "triangle" },
						envelope: {
							attack: 0.001,
							decay: 0.18,
							sustain: 0,
							release: 0.12
						}
					}).toDestination();
					return {
						synth,
						notes: ["E3", "G3"],
						durations: ["32n", "8n"]
					};
				}
			},
			"obj_door_close": {
				type: "sfx",
				create: () => {
					const synth = new Tone.MembraneSynth({
						pitchDecay: 0.015,
						octaves: 1,
						oscillator: { type: "sine" },
						envelope: {
							attack: 0.001,
							decay: 0.14,
							sustain: 0,
							release: 0.08
						}
					}).toDestination();
					return { synth, note: "C3", duration: "8n" };
				}
			},
			"obj_gate_open": {
				type: "sfx",
				create: () => {
					const synth = new Tone.MetalSynth({
						frequency: 120,
						envelope: {
							attack: 0.01,
							decay: 0.18,
							sustain: 0,
							release: 0.2
						},
						harmonicity: 2.5,
						modulationIndex: 18,
						resonance: 2200,
						octaves: 1
					}).toDestination();
					return { synth, note: "A2", duration: "8n" };
				}
			},
			"obj_gate_close": {
				type: "sfx",
				create: () => {
					const synth = new Tone.MetalSynth({
						frequency: 90,
						envelope: {
							attack: 0.01,
							decay: 0.14,
							sustain: 0,
							release: 0.15
						},
						harmonicity: 2.2,
						modulationIndex: 16,
						resonance: 1800,
						octaves: 0.8
					}).toDestination();
					return { synth, note: "F2", duration: "8n" };
				}
			},
			"obj_fountain_on": {
				type: "sfx",
				create: () => {
					const synth = new Tone.NoiseSynth({
						noise: { type: "pink" },
						envelope: {
							attack: 0.01,
							decay: 0.35,
							sustain: 0,
							release: 0.1
						}
					});
					const filter = new Tone.Filter({
						frequency: 1800,
						type: "bandpass",
						Q: 2
					}).toDestination();
					synth.connect(filter);
					return { synth, duration: "8n" };
				}
			},
			"obj_fountain_off": {
				type: "sfx",
				create: () => {
					const synth = new Tone.NoiseSynth({
						noise: { type: "pink" },
						envelope: {
							attack: 0.001,
							decay: 0.18,
							sustain: 0,
							release: 0.08
						}
					});
					const filter = new Tone.Filter({
						frequency: 900,
						type: "lowpass",
						Q: 1
					}).toDestination();
					synth.connect(filter);
					return { synth, duration: "16n" };
				}
			},
			"obj_fountain": {
				type: "ambient",
				create: () => {
					const noise = new Tone.Noise("pink").start();
					const autoFilter = new Tone.AutoFilter({
						frequency: 0.5,
						depth: 0.3,
						baseFrequency: 1500,
						octaves: 1
					}).start();
					const filter = new Tone.Filter({
						frequency: 2000,
						type: "bandpass",
						Q: 2,
						rolloff: -24
					});
					noise.connect(autoFilter);
					autoFilter.connect(filter);
					filter.toDestination();

					return {
						synth: { noise, autoFilter, filter },
						loop: true,
						volume: 0.3
					};
				}
			},
			"obj_lantern": {
				type: "sfx",
				create: () => {
					const synth = new Tone.AMSynth({
						harmonicity: 2.5,
						oscillator: { type: "sine" },
						envelope: {
							attack: 0.1,
							decay: 0.5,
							sustain: 0.3,
							release: 0.5
						}
					}).toDestination();
					// synth.volume.value = Tone.gainToDb(0.3);
					return { synth, note: "E5", duration: "8n" };
				}
			},
			"obj_lantern_on": {
				type: "sfx",
				create: () => {
					const synth = new Tone.AMSynth({
						harmonicity: 2.5,
						oscillator: { type: "sine" },
						envelope: {
							attack: 0.02,
							decay: 0.24,
							sustain: 0.15,
							release: 0.25
						}
					}).toDestination();
					return {
						synth,
						notes: ["C5", "E5"],
						durations: ["32n", "8n"]
					};
				}
			},
			"obj_lantern_off": {
				type: "sfx",
				create: () => {
					const synth = new Tone.AMSynth({
						harmonicity: 1.8,
						oscillator: { type: "triangle" },
						envelope: {
							attack: 0.001,
							decay: 0.14,
							sustain: 0,
							release: 0.12
						}
					}).toDestination();
					return { synth, note: "B4", duration: "16n" };
				}
			},
			"obj_portal_depart": {
				type: "sfx",
				create: () => {
					const synth = new Tone.AMSynth({
						harmonicity: 2.2,
						oscillator: { type: "sine" },
						envelope: {
							attack: 0.01,
							decay: 0.18,
							sustain: 0.08,
							release: 0.24
						},
						modulation: { type: "triangle" },
						modulationEnvelope: {
							attack: 0.02,
							decay: 0.15,
							sustain: 0.05,
							release: 0.18
						}
					}).toDestination();
					return {
						synth,
						notes: ["E4", "B4", "E5"],
						durations: ["32n", "32n", "16n"]
					};
				}
			},
			"obj_portal_arrive": {
				type: "sfx",
				create: () => {
					const synth = new Tone.AMSynth({
						harmonicity: 1.9,
						oscillator: { type: "triangle" },
						envelope: {
							attack: 0.005,
							decay: 0.22,
							sustain: 0.1,
							release: 0.3
						},
						modulation: { type: "sine" },
						modulationEnvelope: {
							attack: 0.01,
							decay: 0.18,
							sustain: 0.06,
							release: 0.2
						}
					}).toDestination();
					return {
						synth,
						notes: ["B4", "E5", "G5"],
						durations: ["32n", "32n", "8n"]
					};
				}
			},
			"obj_crop_harvest": {
				type: "sfx",
				create: () => {
					const synth = new Tone.NoiseSynth({
						noise: { type: "white" },
						envelope: {
							attack: 0.005,
							decay: 0.1,
							sustain: 0,
							release: 0.1
						}
					}).toDestination();
					const filter = new Tone.Filter(3000, "lowpass").toDestination();
					synth.connect(filter);
					// synth.volume.value = Tone.gainToDb(0.4);
					return { synth, duration: "16n" };
				}
			},
			"obj_ball_bounce": {
				type: "sfx",
				create: () => {
					const synth = new Tone.MembraneSynth({
						pitchDecay: 0.05,
						octaves: 3,
						oscillator: { type: "sine" },
						envelope: {
							attack: 0.001,
							decay: 0.2,
							sustain: 0,
							release: 0.2
						}
					}).toDestination();
					// synth.volume.value = Tone.gainToDb(0.5);
					return { synth, note: "G3", duration: "16n" };
				}
			},
			"obj_butterfly": {
				type: "sfx",
				create: () => {
					const synth = new Tone.AMSynth({
						harmonicity: 2,
						oscillator: { type: "sine" },
						envelope: {
							attack: 0.01,
							decay: 0.1,
							sustain: 0,
							release: 0.1
						}
					}).toDestination();
					// synth.volume.value = Tone.gainToDb(0.2);
					return {
						synth,
						notes: ["A6", "C7"],
						durations: ["32n", "32n"]
					};
				}
			}
		};
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
		if (!Number.isFinite(hour)) {
			return "music_main";
		}

		return hour >= 6 && hour < 19 ? "music_main" : "music_sunny";
	}

	_getAmbientForHour(hour) {
		const ambientTracks = ["env_wind"];

		if (Number.isFinite(hour) && hour >= 7 && hour <= 12) {
			ambientTracks.push("env_birds");
		}

		return ambientTracks;
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

				// Create effects
				this.reverb = new Tone.Reverb({
					decay: 1.5,
					wet: 0.2
				}).toDestination();

				this.delay = new Tone.FeedbackDelay({
					delayTime: 0.25,
					feedback: 0.1,
					wet: 0.1
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
					if (oldSound.synth) {
						// Different cleanup approach based on synth type
						if (oldSound.synth.dispose) {
							oldSound.synth.dispose();
						} else if (oldSound.synth.noise) {
							oldSound.synth.noise.dispose();
						}
					}
				} catch (err) {
					console.warn('Error disposing old synth:', err);
				}
				this.synths.delete(id);
			}
		}



		const sound = preset.create();

		// Store the base volume for later volume adjustments

		if (sound.volume) {
			sound.baseVolume = sound.volume;
		} else if (sound.synth && sound.synth.volume) {
			// Extract current volume from dB
			const volumeDb = sound.synth.volume.value;
			sound.baseVolume = Tone.dbToGain(volumeDb);
		} else {
			sound.baseVolume = 1;
		}

		// Add effects for sfx
		if (preset.type === "sfx" && sound.synth && !(sound.synth instanceof Object)) {
			sound.synth.connect(this.reverb);
		}

		this.synths.set(id, sound);
		return sound;
	}

	play(id, options = {}) {
		if (!this.initialized || !this.soundEnabled) return;

		// Prevent rapid triggering of the same sound
		const now = Date.now();
		const lastPlayed = this.lastPlayTimes.get(id) || 0;
		if (now - lastPlayed < this.minTimeBetweenSounds) {
			return;
		}
		this.lastPlayTimes.set(id, now);

		const preset = this.synthPresets[id];
		if (!preset) {
			console.error(`Sound not found: ${id}`);
			return;
		}

		// Check category enablement
		if ((preset.type === "music" || preset.type === "ambient") && !this.musicEnabled) return;

		// Create or get synth
		const sound = this.synths.get(id) || this.createSynth(id);
		if (!sound) return;

		// Calculate the correct volume based on category
		let categoryVolume = 1;
		switch (preset.type) {
			case "music":
				categoryVolume = this.volume.music;
				break;
			case "ambient":
				categoryVolume = this.volume.ambient;
				break;
			case "ui":
				categoryVolume = this.volume.ui;
				break;
			case "sfx":
				categoryVolume = this.volume.sfx;
				break;
			default:
				categoryVolume = this.volume.sfx;
				break;
		}



		// Apply master volume, category volume, AND base volume
		const effectiveVolume = (options.volume || 1) * this.volume.master * categoryVolume * sound.baseVolume;

		try {
			if (sound.notes) {
				// Play multiple notes in sequence with safety checks
				const notes = sound.notes;
				const durations = sound.durations || notes.map(() => "8n");

				let time = Tone.now();
				for (let i = 0; i < notes.length; i++) {
					// Add a small increment to time to prevent timing conflicts
					time += i * 0.05;
					sound.synth.triggerAttackRelease(
						notes[i],
						durations[i],
						time,
						effectiveVolume // Use calculated volume
					);
					time += Tone.Time(durations[i]).toSeconds();
				}
			} else if (sound.note) {
				// Play single note
				sound.synth.triggerAttackRelease(
					sound.note,
					sound.duration || "8n",
					Tone.now(),
					effectiveVolume // Use calculated volume
				);
			} else if (sound.duration) {
				// For noise synths with no note
				sound.synth.triggerAttackRelease(
					sound.duration,
					Tone.now(),
					effectiveVolume // Use calculated volume
				);
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
		if (sound.synth.noise) {
			// For noise-based synths
			sound.synth.noise.stop();
		} else if (typeof sound.synth.triggerRelease === 'function') {
			// For envelope-based synths
			sound.synth.triggerRelease();
		} else if (sound.loop && this.loops.has(id)) {
			// For looping patterns
			const loop = this.loops.get(id);
			loop.stop();
			loop.dispose();
			this.loops.delete(id);
		}
	}


	startMusic(id, options = {}) {
		if (!this.initialized || !this.musicEnabled) return;

		// Store the ID we're trying to play to prevent race conditions
		this._pendingMusicId = id;

		// If same music is already playing, just adjust volume if needed
		if (this.currentMusicPart && this.currentMusicSynth === id) {
			return;
		}

		// Stop current music
		// this.stopMusic();

		// Wait a small amount of time to prevent timing conflicts
		setTimeout(() => {
			// Verify we still want to play this music (might have been changed/cancelled)
			if (this._pendingMusicId !== id || !this.musicEnabled) return;
			this._pendingMusicId = null;

			try {
				// Create music synth and pattern
				const sound = this.synths.get(id) || this.createSynth(id);
				if (!sound || !sound.pattern) return;

				// Set tempo if specified
				if (sound.tempo) {
					Tone.Transport.bpm.value = sound.tempo;
				}

				sound.synth.volume.value = Tone.gainToDb(0.5 * this.volume.music);

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
		// Save the current music ID before stopping
		if (this.currentMusicSynth) {
			this._lastMusicId = this.currentMusicSynth;
		}

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


		// If we have a previously saved music ID, restart that
		if (this._lastMusicId) {
			this.startMusic(this._lastMusicId);
		} else {
			this.startMusic(this._getMusicForHour(this._getCurrentHour()));
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


		this._getAmbientForHour(this._getCurrentHour()).forEach(soundId => {
			this.playAmbient(soundId);
		});
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
		if (!this.initialized || !this.musicEnabled) return;

		// Get the preset first
		const preset = this.synthPresets[id];
		if (!preset || preset.type !== "ambient") return;

		// Calculate the actual volume to use
		const baseVolume = preset.baseVolume || 1;
		const categoryVolume = this.volume.ambient;
		const effectiveVolume = (options.volume !== undefined ? options.volume : 1) *
			categoryVolume *
			baseVolume *
			this.volume.master;

		// After muting/unmuting, we need to force recreate the sound
		// Check if unmuting was recently done
		//const isJustUnmuted = Date.now() - (this._lastUnmuteTime || 0) < 5000;

		// If sound exists but we just unmuted, force recreate
		/*
		if (this.loops.has(id) && isJustUnmuted) {
			this.fadeOutAndStop(id);
			// Remove existing synth to force recreation
			this.synths.delete(id);
		}
			*/

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

		const sound = this.createSynth(id);
		if (!sound) return;

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
			// After fade completes, actually stop the sound
			if (this.loops.has(id)) {
				const loop = this.loops.get(id);
				if (loop) {
					loop.stop();
					loop.dispose();
					this.loops.delete(id);
				}
			}

			// Stop the synth too if needed
			if (sound.synth) {
				if (sound.synth.noise) {
					sound.synth.noise.stop();
				} else if (typeof sound.synth.releaseAll === 'function') {
					sound.synth.releaseAll();
				}
			}
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















	updateSynthVolume(synth, volume) {
		if (!synth) return;

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
					this.updateSynthVolume(element, volume);
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
						const musicVolume = this.volume.master * this.volume.music;
						// Smooth transition to avoid clicks
						sound.synth.volume.rampTo(Tone.gainToDb(musicVolume), 0.1);
					}
				}

				// Update all active synths based on their category
				// Update all active synths based on their category
				this.synths.forEach((sound, id) => {
					if (!sound.synth) return;

					const preset = this.synthPresets[id];
					if (!preset) return;

					let categoryVolume;
					switch (preset.type) {
						case "music":
							categoryVolume = this.volume.music;
							break;
						case "ambient":
							categoryVolume = this.volume.ambient;
							break;
						case "ui":
							categoryVolume = this.volume.ui;
							break;
						case "sfx":
							categoryVolume = this.volume.sfx;
							break;
						default:
							categoryVolume = this.volume.sfx;
							break;
					}

					const masterVolume = this.volume.master;
					const finalVolume = masterVolume * categoryVolume * (sound.baseVolume || 1);

					this.updateSynthVolume(sound.synth, finalVolume);
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


		const soundId = `myte_${action.toLowerCase()}`;

		// Prevent rapid UI sound triggering
		const now = Date.now();
		const lastPlayed = this.lastPlayTimes.get('myte_any') || 0;
		if (now - lastPlayed < this.minTimeBetweenSounds * 2) {
			return;
		}
		this.lastPlayTimes.set('myte_any', now);

		if (this.synthPresets[soundId]) {
			try {
				this.play(soundId);
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
		// Stop all sounds
		this.synths.forEach((sound, id) => {
			this.stop(id);

			// Dispose synthesizers
			if (sound.synth) {
				if (sound.synth.dispose) {
					sound.synth.dispose();
				} else if (sound.synth.noise) {
					sound.synth.noise.dispose();
					if (sound.synth.autoFilter) sound.synth.autoFilter.dispose();
					if (sound.synth.filter) sound.synth.filter.dispose();
				}
			}
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
		if (this.delay) this.delay.dispose();

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
