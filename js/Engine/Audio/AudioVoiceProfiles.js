function createDefaultSpeciesVoices() {
	return {
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
}
