function createAudioPresetLibrary(manager) {
	return {
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
					synth.maxPolyphony = 8;

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
							attack: 0.1,
							decay: 0.3,
							sustain: 0.7,
							release: 2.5
						}
					}).toDestination();
					synth.maxPolyphony = 10;

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
					pad.maxPolyphony = 8;
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
					synth.maxPolyphony = 8;

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
				baseVolume: 0.56,
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
					return { synth, note: "C5", duration: "16n" };
				}
			},
			"ui_hover": {
				type: "ui",
				baseVolume: 0.3,
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
					return { synth, note: "E6", duration: "32n" };
				}
			},
			"ui_coin_tick": {
				type: "ui",
				baseVolume: 0.48,
				create: () => {
					const synth = new Tone.FMSynth({
						harmonicity: 5,
						modulationIndex: 7,
						oscillator: { type: "sine" },
						envelope: {
							attack: 0.001,
							decay: 0.075,
							sustain: 0,
							release: 0.04
						},
						modulation: { type: "square" },
						modulationEnvelope: {
							attack: 0.001,
							decay: 0.05,
							sustain: 0,
							release: 0.03
						}
					}).toDestination();
					return { synth, note: "B5", duration: "32n" };
				}
			},
			"ui_coin_chime": {
				type: "ui",
				baseVolume: 0.54,
				create: () => {
					const synth = new Tone.Synth({
						oscillator: { type: "triangle" },
						envelope: {
							attack: 0.002,
							decay: 0.12,
							sustain: 0.05,
							release: 0.14
						}
					}).toDestination();
					return {
						synth,
						notes: ["E5", "B5"],
						durations: ["16n", "16n"]
					};
				}
			},
			"ui_time_chime": {
				type: "ui",
				baseVolume: 0.44,
				create: () => {
					const synth = new Tone.Synth({
						oscillator: { type: "sine" },
						envelope: {
							attack: 0.01,
							decay: 0.18,
							sustain: 0.05,
							release: 0.35
						}
					}).toDestination();
					return {
						synth,
						notes: ["C5", "G5", "C6"],
						durations: ["16n", "16n", "8n"]
					};
				}
			},
			"ui_select": {
				type: "ui",
				baseVolume: 0.5,
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
					return {
						synth,
						notes: ["C5", "G5"],
						durations: ["16n", "8n"]
					};
				}
			},
			"ui_error": {
				type: "ui",
				baseVolume: 0.44,
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
					return {
						synth,
						notes: ["C4", "B3"],
						durations: ["16n", "8n"]
					};
				}
			},


			// Ball hit â€” bouncy thud
			"ball_hit": {
				type: "sfx",
				baseVolume: 0.44,
				variation: { pitchRange: 0.014, volumeSteps: [0.96, 1] },
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
				baseVolume: 0.28,
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
  baseVolume: 0.26,
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
  baseVolume: 0.34,
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
				baseVolume: 0.32,
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
				category: "notifications",
				baseVolume: 0.72,
				create: () => {
				const body = new Tone.Synth({
					oscillator: { type: "triangle" },
					envelope: {
					attack: 0.002,
					decay: 0.09,
					sustain: 0,
					release: 0.08
					}
				}).toDestination();
				const sparkle = new Tone.Synth({
					oscillator: { type: "sine" },
					envelope: {
					attack: 0.001,
					decay: 0.12,
					sustain: 0,
					release: 0.12
					}
				}).toDestination();
				return {
					synth: { body, sparkle },
					volume: 0.9,
					trigger: ({ sound, effectiveVolume, options, manager }) => {
						const pitchScale = options.pitchScale ?? (1 + manager.getCenteredVariation(0.018));
						const firstNote = manager.applyPitchToNote("E5", pitchScale);
						const secondNote = manager.applyPitchToNote("B5", pitchScale * 1.003);
						const thirdNote = manager.applyPitchToNote("E6", pitchScale * 1.006);
						const now = Tone.now();
						sound.synth.body.triggerAttackRelease(firstNote, "64n", now, effectiveVolume * 0.95);
						sound.synth.sparkle.triggerAttackRelease(secondNote, "32n", now + 0.032, effectiveVolume * 0.75);
						sound.synth.sparkle.triggerAttackRelease(thirdNote, "16n", now + 0.072, effectiveVolume * 0.55);
					}
				};
				}
			},
			
			"ui_drag_item": {
				type: "ui",
				baseVolume: 0.2,
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
				// Soft high tick â€” "lifted"
				return { synth, note: "B5", duration: "32n" };
				}
			},

			"ui_drop_item": {
				type: "ui",
				baseVolume: 0.26,
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

			"footstep_grass_1": {
				type: "sfx",
				category: "footsteps",
				create: () => manager.createFootstepPreset({
					note: "E2",
					noiseType: "pink",
					filterFrequency: 1400,
					thumpVolume: 0.85,
					textureVolume: 0.45
				})
			},
			"footstep_grass_2": {
				type: "sfx",
				category: "footsteps",
				create: () => manager.createFootstepPreset({
					note: "F2",
					noiseType: "brown",
					filterFrequency: 1250,
					thumpVolume: 0.82,
					textureVolume: 0.42
				})
			},
			"footstep_path_1": {
				type: "sfx",
				category: "footsteps",
				create: () => manager.createFootstepPreset({
					note: "G2",
					noiseType: "white",
					filterFrequency: 2200,
					thumpVolume: 0.72,
					textureVolume: 0.34
				})
			},
			"footstep_path_2": {
				type: "sfx",
				category: "footsteps",
				create: () => manager.createFootstepPreset({
					note: "A2",
					noiseType: "white",
					filterFrequency: 2400,
					thumpVolume: 0.68,
					textureVolume: 0.32
				})
			},
			"footstep_floor_1": {
				type: "sfx",
				category: "footsteps",
				create: () => manager.createFootstepPreset({
					note: "B2",
					noiseType: "white",
					filterFrequency: 2600,
					thumpVolume: 0.62,
					textureVolume: 0.26
				})
			},
			"footstep_floor_2": {
				type: "sfx",
				category: "footsteps",
				create: () => manager.createFootstepPreset({
					note: "C3",
					noiseType: "white",
					filterFrequency: 2800,
					thumpVolume: 0.6,
					textureVolume: 0.24
				})
			},
			"footstep_ground_1": {
				type: "sfx",
				category: "footsteps",
				create: () => manager.createFootstepPreset({
					note: "D2",
					noiseType: "brown",
					filterFrequency: 1100,
					thumpVolume: 0.82,
					textureVolume: 0.3
				})
			},
			"footstep_ground_2": {
				type: "sfx",
				category: "footsteps",
				create: () => manager.createFootstepPreset({
					note: "E2",
					noiseType: "brown",
					filterFrequency: 1200,
					thumpVolume: 0.8,
					textureVolume: 0.28
				})
			},
			"footstep_sand_1": {
				type: "sfx",
				category: "footsteps",
				create: () => manager.createFootstepPreset({
					note: "C2",
					noiseType: "pink",
					filterFrequency: 950,
					thumpVolume: 0.55,
					textureVolume: 0.55
				})
			},
			"footstep_sand_2": {
				type: "sfx",
				category: "footsteps",
				create: () => manager.createFootstepPreset({
					note: "D2",
					noiseType: "pink",
					filterFrequency: 900,
					thumpVolume: 0.52,
					textureVolume: 0.58
				})
			},
			"footstep_mud_1": {
				type: "sfx",
				category: "footsteps",
				create: () => manager.createFootstepPreset({
					note: "B1",
					noiseType: "brown",
					filterFrequency: 800,
					thumpVolume: 0.72,
					textureVolume: 0.48
				})
			},
			"footstep_mud_2": {
				type: "sfx",
				category: "footsteps",
				create: () => manager.createFootstepPreset({
					note: "C2",
					noiseType: "brown",
					filterFrequency: 760,
					thumpVolume: 0.7,
					textureVolume: 0.5
				})
			},
			"footstep_water_1": {
				type: "sfx",
				category: "footsteps",
				create: () => manager.createFootstepPreset({
					note: "F2",
					noiseType: "pink",
					filterFrequency: 1800,
					thumpVolume: 0.5,
					textureVolume: 0.62
				})
			},
			"footstep_water_2": {
				type: "sfx",
				category: "footsteps",
				create: () => manager.createFootstepPreset({
					note: "G2",
					noiseType: "pink",
					filterFrequency: 1700,
					thumpVolume: 0.48,
					textureVolume: 0.64
				})
			},

			"myte_slot_exit": {
				type: "sfx",
				baseVolume: 0.34,
				variation: { pitchRange: 0.012 },
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
				baseVolume: 0.32,
				variation: { pitchRange: 0.012 },
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
				baseVolume: 0.38,
				variation: { pitchRange: 0.016, volumeSteps: [0.96, 1] },
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
					return {
						synth,
						notes: ["G5", "C6"],
						durations: ["16n", "8n"]
					};
				}
			},
			"myte_sad": {
				type: "sfx",
				baseVolume: 0.34,
				variation: { pitchRange: 0.012 },
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
					return {
						synth,
						notes: ["C4", "A3"],
						durations: ["8n", "8n"]
					};
				}
			},
			"myte_jump": {
				type: "sfx",
				baseVolume: 0.28,
				variation: { pitchRange: 0.014 },
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
					return { synth, note: "G4", duration: "16n" };
				}
			},

			"myte_land": {
				type: "sfx",
				baseVolume: 0.32,
				variation: { pitchRange: 0.01, volumeSteps: [0.94, 1] },
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
					return { synth, note: "C2", duration: "16n" };
				}
			},
			*/

			"myte_eat": {
				type: "sfx",
				baseVolume: 0.24,
				variation: { volumeSteps: [0.92, 1] },
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
					return { synth, duration: "16n" };
				}
			},
			"myte_sleep": {
				type: "sfx",
				baseVolume: 0.16,
				variation: { volumeSteps: [0.95, 1] },
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
					return { synth, duration: "4n" };
				}
			},
			"myte_pickup": {
				type: "sfx",
				baseVolume: 0.32,
				variation: { pitchRange: 0.014 },
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
					return {
						synth,
						notes: ["C4", "E4", "G4"],
						durations: ["32n", "32n", "8n"]
					};
				}
			},
			"myte_putdown": {
				type: "sfx",
				baseVolume: 0.3,
				variation: { pitchRange: 0.012 },
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
				baseVolume: 0.22,
				create: () => {
					// Do NOT call .start() here â€” playAmbient starts them lazily to avoid
					// running the audio worklet 24/7 even when the sound is inactive.
					const noise = new Tone.Noise("brown");
					const autoFilter = new Tone.AutoFilter({
						frequency: 0.1,
						depth: 0.8,
						baseFrequency: 100,
						octaves: 2.5
					});
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
						volume: 0.22
					};
				}
			},
			"env_water": {
				type: "ambient",
				baseVolume: 0.12,
				create: () => {
					const noise = new Tone.Noise("pink");
					const autoFilter = new Tone.AutoFilter({
						frequency: 0.2,
						depth: 0.5,
						baseFrequency: 200,
						octaves: 1.5
					});
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
						volume: 0.12
					};
				}
			},
			"env_birds": {
				type: "ambient",
				baseVolume: 0.14,
				create: () => {
					// Use a lightweight AMSynth instead of PolySynth(FMSynth) â€” bird chirps
					// don't need polyphony and FMSynth is among the most CPU-intensive types.
					const synth = new Tone.AMSynth({
						harmonicity: 8,
						oscillator: { type: "sine" },
						envelope: {
							attack: 0.001,
							decay: 0.08,
							sustain: 0,
							release: 0.08
						},
						modulation: { type: "square" },
						modulationEnvelope: {
							attack: 0.001,
							decay: 0.3,
							sustain: 0,
							release: 0.1
						}
					}).toDestination();

					// Generate random bird chirps periodically
					const pattern = [];
					const birdNotes = ["C7", "D7", "E7", "G7", "A7"];

					for (let i = 0; i < 20; i++) {
						const time = i * 2 + Math.random() * 2;
						const note = Utility.randomChoice(birdNotes);
						pattern.push({ note, time, duration: "32n" });

						// Sometimes add a second note for a trill
						if (Math.random() > 0.5) {
							const trillNote = Utility.randomChoice(birdNotes);
							pattern.push({ note: trillNote, time: time + 0.1, duration: "32n" });
						}
					}

					return {
						synth,
						pattern,
						loop: true,
						loopInterval: 30, // seconds
						volume: 0.14
					};
				}
			},




			"env_cricket": {
				type: "ambient",
				baseVolume: 0.008,
				create: () => {
					// AMSynth is much lighter than FMSynth â€” cricket chirps are short
					// high-frequency pulses that don't need FM's complexity.
					const synth = new Tone.AMSynth({
						harmonicity: 10,
						oscillator: { type: "square" },
						envelope: {
							attack: 0.005,
							decay: 0.04,
							sustain: 0,
							release: 0.01
						},
						modulation: { type: "square" },
						modulationEnvelope: {
							attack: 0.005,
							decay: 0.04,
							sustain: 0,
							release: 0.01
						}
					}).toDestination();

					// Reduced pattern density: 8 groups instead of 20
					const pattern = [];
					for (let i = 0; i < 8; i++) {
						const time = i * 1.5 + Math.random() * 8;
						for (let j = 0; j < 3; j++) {
							pattern.push({
								note: "A7",
								time: time + (j * 0.08),
								duration: "64n"
							});
						}
					}

					return {
						synth,
						pattern,
						loop: true,
						loopInterval: 15
					};
				}
			},

			// Indoor ambient â€” soft, sheltered warmth (no wind)
			"env_indoor_cozy": {
				type: "ambient",
				baseVolume: 0.09,
				create: () => {
					// Very gentle brown noise through a tight low-pass â€” the muffled hum
					// of a quiet room. AutoFilter adds a barely-perceptible slow breath.
					// Uses autoFilter (not Tremolo) so playAmbient starts it lazily.
					const noise = new Tone.Noise("brown");
					const autoFilter = new Tone.AutoFilter({
						frequency: 0.06,
						depth: 0.15,
						baseFrequency: 280,
						octaves: 0.8
					});
					const filter = new Tone.Filter({
						frequency: 320,
						type: "lowpass",
						rolloff: -48
					});
					noise.connect(autoFilter);
					autoFilter.connect(filter);
					filter.toDestination();

					return {
						synth: { noise, autoFilter, filter },
						loop: true,
						volume: 0.09
					};
				}
			},

			// Still-water ambient â€” calm lake or pond surface
			"env_water_lake": {
				type: "ambient",
				baseVolume: 0.55,
				create: () => {
					// Pink noise base with very slow, deep modulation â€” lapping at the shore
					const noise = new Tone.Noise("pink");
					const autoFilter = new Tone.AutoFilter({
						frequency: 0.06,
						depth: 0.55,
						baseFrequency: 180,
						octaves: 1.8
					});
					const filter = new Tone.Filter({
						frequency: 900,
						type: "lowpass",
						rolloff: -24
					});
					noise.connect(autoFilter);
					autoFilter.connect(filter);
					filter.toDestination();

					return {
						synth: { noise, autoFilter, filter },
						loop: true,
						volume: 0.55
					};
				}
			},

			// Flowing-water ambient â€” stream or river with movement
			"env_water_river": {
				type: "ambient",
				baseVolume: 0.18,
				create: () => {
					// Brighter, faster modulation gives the churning energy of moving water
					const noise = new Tone.Noise("pink");
					const autoFilter = new Tone.AutoFilter({
						frequency: 0.28,
						depth: 0.7,
						baseFrequency: 350,
						octaves: 2.2
					});
					const filter = new Tone.Filter({
						frequency: 1600,
						type: "lowpass",
						rolloff: -12
					});
					noise.connect(autoFilter);
					autoFilter.connect(filter);
					filter.toDestination();

					return {
						synth: { noise, autoFilter, filter },
						loop: true,
						volume: 0.18
					};
				}
			},

			// Object Sounds
			"obj_chest_open": {
				type: "sfx",
				baseVolume: 0.32,
				variation: { pitchRange: 0.01 },
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
					return { synth, note: "G3", duration: "8n" };
				}
			},
			"obj_chest_close": {
				type: "sfx",
				baseVolume: 0.26,
				variation: { pitchRange: 0.01, volumeSteps: [0.94, 1] },
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
					return { synth, note: "D3", duration: "8n" };
				}
			},
			"obj_door_open": {
				type: "sfx",
				baseVolume: 0.26,
				variation: { pitchRange: 0.008 },
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
				baseVolume: 0.22,
				variation: { pitchRange: 0.008, volumeSteps: [0.94, 1] },
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
				baseVolume: 0.3,
				variation: { pitchRange: 0.008 },
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
				baseVolume: 0.26,
				variation: { pitchRange: 0.008, volumeSteps: [0.94, 1] },
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
				baseVolume: 0.24,
				variation: { volumeSteps: [0.94, 1] },
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
				baseVolume: 0.2,
				variation: { volumeSteps: [0.94, 1] },
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
				baseVolume: 0.16,
				create: () => {
					const noise = new Tone.Noise("pink");
					const autoFilter = new Tone.AutoFilter({
						frequency: 0.5,
						depth: 0.3,
						baseFrequency: 1500,
						octaves: 1
					});
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
						volume: 0.16
					};
				}
			},
			"obj_lantern": {
				type: "sfx",
				baseVolume: 0.14,
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
					return { synth, note: "E5", duration: "8n" };
				}
			},
			"obj_lantern_on": {
				type: "sfx",
				baseVolume: 0.18,
				variation: { pitchRange: 0.008 },
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
				baseVolume: 0.16,
				variation: { pitchRange: 0.008 },
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
				baseVolume: 0.34,
				variation: { pitchRange: 0.006 },
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
				baseVolume: 0.34,
				variation: { pitchRange: 0.006 },
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
				baseVolume: 0.22,
				variation: { volumeSteps: [0.94, 1] },
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
					return { synth, duration: "16n" };
				}
			},
			"obj_ball_bounce": {
				type: "sfx",
				baseVolume: 0.28,
				variation: { pitchRange: 0.016, volumeSteps: [0.96, 1] },
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
					return { synth, note: "G3", duration: "16n" };
				}
			},
			"obj_butterfly": {
				type: "sfx",
				baseVolume: 0.18,
				variation: { pitchRange: 0.018 },
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
					return {
						synth,
						notes: ["A6", "C7"],
						durations: ["32n", "32n"]
					};
				}
			},
			"obj_butterfly_flutter": {
				type: "sfx",
				category: "ambient",
				baseVolume: 0.2,
				variation: { pitchRange: 0.012, volumeSteps: [0.94, 1] },
				create: () => {
					const synth = new Tone.FMSynth({
						harmonicity: 2.2,
						modulationIndex: 1.4,
						oscillator: { type: "sine" },
						envelope: {
							attack: 0.004,
							decay: 0.08,
							sustain: 0,
							release: 0.06
						},
						modulation: { type: "triangle" },
						modulationEnvelope: {
							attack: 0.001,
							decay: 0.05,
							sustain: 0,
							release: 0.05
						}
					}).toDestination();
					return {
						synth,
						notes: ["E6", "G6"],
						durations: ["64n", "32n"]
					};
				}
			},
			"obj_butterfly_land": {
				type: "sfx",
				category: "ambient",
				baseVolume: 0.16,
				variation: { pitchRange: 0.01 },
				create: () => {
					const synth = new Tone.Synth({
						oscillator: { type: "triangle" },
						envelope: {
							attack: 0.002,
							decay: 0.09,
							sustain: 0,
							release: 0.12
						}
					}).toDestination();
					return {
						synth,
						notes: ["D6", "A5"],
						durations: ["64n", "32n"]
					};
				}
			},
			"obj_flower_pick": {
				type: "sfx",
				baseVolume: 0.24,
				variation: { pitchRange: 0.014 },
				create: () => {
					const synth = new Tone.Synth({
						oscillator: { type: "triangle" },
						envelope: {
							attack: 0.005,
							decay: 0.12,
							sustain: 0,
							release: 0.25
						}
					}).toDestination();
					return {
						synth,
						notes: ["E5", "G5"],
						durations: ["32n", "16n"]
					};
				}
			},
			"obj_flower_rustle": {
				type: "sfx",
				category: "footsteps",
				baseVolume: 0.3,
				variation: { pitchRange: 0.035, volumeSteps: [0.92, 1] },
				create: () => {
					const synth = new Tone.NoiseSynth({
						noise: { type: "pink" },
						envelope: {
							attack: 0.002,
							decay: 0.07,
							sustain: 0,
							release: 0.04
						}
					}).toDestination();
					return { synth, duration: "32n" };
				}
			},
			"obj_flower_trample": {
				type: "sfx",
				baseVolume: 0.18,
				variation: { volumeSteps: [0.94, 1] },
				create: () => {
					const synth = new Tone.NoiseSynth({
						noise: { type: "brown" },
						envelope: {
							attack: 0.001,
							decay: 0.15,
							sustain: 0,
							release: 0.08
						}
					}).toDestination();
					return { synth, duration: "8n" };
				}
			},
			"obj_flower_trample_step": {
				type: "sfx",
				baseVolume: 0.16,
				variation: { volumeSteps: [0.92, 1] },
				create: () => {
					const synth = new Tone.NoiseSynth({
						noise: { type: "brown" },
						envelope: {
							attack: 0.001,
							decay: 0.08,
							sustain: 0,
							release: 0.05
						}
					}).toDestination();
					return { synth, duration: "16n" };
				}
			},
			"obj_crop_tend": {
				type: "sfx",
				baseVolume: 0.18,
				variation: { pitchRange: 0.01, volumeSteps: [0.95, 1] },
				create: () => {
					const body = new Tone.NoiseSynth({
						noise: { type: "pink" },
						envelope: {
							attack: 0.002,
							decay: 0.08,
							sustain: 0,
							release: 0.05
						}
					}).toDestination();
					const pluck = new Tone.Synth({
						oscillator: { type: "triangle" },
						envelope: {
							attack: 0.001,
							decay: 0.06,
							sustain: 0,
							release: 0.08
						}
					}).toDestination();
					return {
						synth: { body, pluck },
						volume: 0.9,
						trigger: ({ sound, effectiveVolume, options, manager }) => {
							const now = Tone.now();
							const pitchScale = options.pitchScale ?? (1 + manager.getCenteredVariation(0.01));
							sound.synth.body.triggerAttackRelease("32n", now, effectiveVolume * 0.7);
							sound.synth.pluck.triggerAttackRelease(
								manager.applyPitchToNote("G5", pitchScale),
								"64n",
								now + 0.02,
								effectiveVolume * 0.28
							);
						}
					};
				}
			}
	};
}
