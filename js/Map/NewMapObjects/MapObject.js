// Base configuration for all map objects
const BASE_CONFIG = {
	// Core properties
	renderPriority: 1,
	scale: 1,
	size: {
		width: 64,
		height: 64
	},

	// Physics properties
	walkable: false,
	collision: false,

	direction: DIRECTION.SOUTH,


	// Interactive properties
	interactive: true,
	interactionType: null,
	interactionRadius: 100,
	interactionCooldown: 5000,
	draggable: false,
	rubbable: false,

	canInspect: true,
	canPickUp: false,

	interactionSide: null, // null = any side, DIRECTION.NORTH, DIRECTION.SOUTH, DIRECTION.EAST, DIRECTION.WEST

	// Render properties
	renderType: 'single', // single, split, animated, sprite

	// State properties
	canToggle: false,
	default: 'default',
	states: ['default'],

	// Animation properties
	animates: false,
	frameDelay: 100,

	// Effect properties
	particleEffects: false,
	lightEmission: false,
	soundEffects: false,

	// Gameplay properties
	lootable: false,
	consumable: false,
	storable: false,

	// Persistence properties
	saveable: false,
	respawns: false,
	respawnTime: 300000 // 5 minutes
};

// Type-specific configurations
const TYPE_CONFIGS = {
	// Static nature objects
	GRASS: {
		category: 'nature',
		variants: ['grass_1', 'grass_2', 'grass_3'],
		renderType: 'split',
		walkable: true,
		animation: "sway"
	},

	FLOWER: {
		category: 'nature',
		variants: ['flower_red', 'flower_yellow', 'flower_blue'],
		walkable: true,
		interactionType: 'mood_boost',
		moodBoostAmount: 5
	},

	// Interactive items
	MUSIC_BOX: {
		category: 'item',
		variants: ['music_box'],
		collision: true,
		renderPriority: 2,
		interactionType: 'dance',
		interactionRadius: 150,
		animates: true
	},

	FOOD: {
		category: 'item',
		variants: ['apple', 'turnip', 'acorn'],
		walkable: true,
		interactionType: 'consume',
		interactionRadius: 50,
		consumable: true
	},

	// Containers
	TREASURE_CHEST: {
		category: 'container',
		variants: ['wooden_chest', 'golden_chest'],
		collision: true,
		canClose: true,
		renderType: 'sprite',
		renderPriority: 2,
		interactionType: 'open',
		size: {
			width: 32,
			height: 32,
		},
		scale: 2,
		spriteConfig: {
			default: 'closed',
			spriteSheet: {
				url: "images/chest_spritesheet.png",
				size: {
					width: 192,
					height: 32,
				}
			},

			animations: {
				closed: { frames: [[0, 0]], loop: true },
				opening: { frames: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]], loop: false },
				closing: { frames: [[4, 0], [3, 0], [2, 0], [1, 0], [0, 0]], loop: false },
				opened: { frames: [[4, 0]], loop: true }
			}
		}
	},

	// Interactive structures
	FOUNTAIN: {
		category: 'interactive',
		variants: ['stone', 'marble'],
		renderType: 'animated',
		collision: true,
		renderPriority: 2,
		interactionType: 'mood_boost',
		interactionRadius: 150,
		default: 'on',
		moodBoostRadius: 150,
		moodBoostAmount: 0.1,
		boostCooldown: 1000,
		spriteConfig: {
			animations: {
				idle: { frames: [[0, 0], [1, 0], [2, 0], [3, 0]], loop: true },
				off: { frames: [[0, 0]], loop: false },
				turnOn: { frames: [[0, 0], [1, 0], [2, 0], [3, 0]], loop: false },
				turnOff: { frames: [[3, 0], [2, 0], [1, 0], [0, 0]], loop: false },
				splash: { frames: [[4, 0], [5, 0], [6, 0], [7, 0]], loop: true }
			}
		}
	},

	LANTERN: {
		category: 'interactive',
		variants: ['paper', 'crystal'],
		renderType: 'animated',
		walkable: true,
		renderPriority: 2,
		interactionType: 'light',
		default: 'off',
		spriteConfig: {
			animations: {
				idle: { frames: [[0, 0], [1, 0], [2, 0], [1, 0]], loop: true },
				off: { frames: [[0, 0]], loop: false },
				turnOn: { frames: [[0, 0], [1, 0], [2, 0]], loop: false },
				turnOff: { frames: [[2, 0], [1, 0], [0, 0]], loop: false },
				flicker: { frames: [[3, 0], [4, 0], [5, 0], [4, 0], [3, 0]], loop: false }
			}
		}
	},

	// Plants
	GROWING_PLANT: {
		category: 'plant',
		renderType: 'animated',
		walkable: true,
		renderPriority: 2,
		interactionType: 'tend',
		default: 'seed',

		// Growth mechanics
		growthConfig: {
			baseGrowthTime: 300000, // 5 minutes per stage
			waterBoostMultiplier: 1.5, // Growth speed multiplier when watered
			seasonMultiplier: {
				spring: 1.5,
				summer: 1.0,
				autumn: 0.7,
				winter: 0.3
			}
		},

		spriteConfig: {
			frameWidth: 32,
			scale: 2,
			animations: {
				seed: { frames: [[0, 0]], loop: false },
				sprout: { frames: [[1, 0], [2, 0]], loop: true },
				growing: { frames: [[3, 0], [4, 0]], loop: true },
				mature: { frames: [[5, 0], [6, 0]], loop: true },
				watering: { frames: [[7, 0], [8, 0], [9, 0], [10, 0]], loop: false }
			}
		}
	},

	CROP: {
		baseType: 'GROWING_PLANT',
		category: 'crop',
		variants: ['tomato', 'carrot', 'wheat', 'berry'],
		interactionType: 'tend',
		renderType: 'animated',
		renderPriority: 2,
		default: 'seed',
		animation: "sway",
		size: { width: 64, height: 128 },

		collider: {
			offsetX: 16,
			offsetY: 84,
			width: 32,
			height: 32
		},

		// Growth mechanics
		growthConfig: {
			baseGrowthTime: 3000, // 5 minutes per stage
			waterBoostMultiplier: 1.5,
			seasonMultiplier: {
				spring: 1.5,
				summer: 1.0,
				autumn: 0.7,
				winter: 0.3
			}
		},

		harvestConfig: {
			harvestableStage: 'mature',
			regrowth: true,
			regrowthTime: 180000, // 3 minutes to regrow
			yield: {
				min: 1,
				max: 3,
				qualityChance: 0.1
			}
		},

		spriteConfig: {
			default: 'seed',
			spriteSheet: {
				url: "images/MapObjects/crop_corn.png",
				size: {
					width: 256,
					height: 128,
				}
			},
			animations: {
				seed: { frames: [[0, 0]], loop: false },
				sprout: { frames: [[1, 0]], loop: true },
				growing: { frames: [[2, 0]], loop: true },
				flowering: { frames: [[3, 0]], loop: true },
				mature: { frames: [[3, 0]], loop: true },
				harvest: { frames: [[3, 0]], loop: false }
			}
		}
	},

	BREEDING_FLOWER: {
		baseType: 'GROWING_PLANT',
		variants: ['rose', 'tulip', 'lily', 'orchid'],
		category: 'breeding-flower',
		interactionType: 'tend',
		default: 'seed',

		geneticConfig: {
			genes: {
				petalColor: ['red', 'yellow', 'blue', 'white', 'purple'],
				petalCount: [4, 5, 6, 8],
				size: ['small', 'medium', 'large'],
				pattern: ['solid', 'striped', 'spotted', 'gradient']
			},
			dominanceRules: {
				petalColor: {
					red: ['white', 'yellow'],
					blue: ['white'],
					purple: ['red', 'white']
				}
			}
		},

		breedingConfig: {
			pollinationRadius: 150,
			pollinationChance: 0.2,
			mutationChance: 0.1,
			traitInheritance: {
				petalColor: 0.7,
				size: 0.5,
				pattern: 0.3
			}
		},

		seasonalConfig: {
			spring: {
				growthRate: 1.5,
				bloomDuration: 1.2,
				pollinationChance: 1.3
			},
			summer: {
				growthRate: 1.0,
				bloomDuration: 1.0,
				pollinationChance: 1.0
			},
			autumn: {
				growthRate: 0.7,
				bloomDuration: 0.8,
				pollinationChance: 0.6
			},
			winter: {
				growthRate: 0.3,
				bloomDuration: 0.5,
				pollinationChance: 0.2
			}
		},

		spriteConfig: {
			scale: 2,
			animations: {
				seed: { frames: [[0, 0]], loop: false },
				sprout: { frames: [[1, 0], [2, 0]], loop: true },
				bud: { frames: [[3, 0], [4, 0], [5, 0], [4, 0]], loop: true },
				bloom: { frames: [[6, 0], [7, 0], [8, 0], [7, 0]], loop: true },
				pollinating: { frames: [[9, 0], [10, 0], [11, 0], [10, 0], [9, 0]], loop: false },
				wilting: { frames: [[12, 0], [13, 0], [14, 0]], loop: false },
				dormant: { frames: [[15, 0]], loop: false }
			}
		}
	},

	NIGHT_BLOOM: {
		baseType: 'BREEDING_FLOWER',
		variants: ['blue_moon', 'evening_star', 'night_whisper'],
		default: 'closed',

		dayNightConfig: {
			openTime: '18:00',
			closeTime: '06:00',
			transitionDuration: 3000,
			glowIntensity: 0.6,
			moonlightBoost: 1.2
		},

		spriteConfig: {
			scale: 2,
			animations: {
				closed: { frames: [[0, 0]], loop: false },
				opening: { frames: [[0, 0], [1, 0], [2, 0], [3, 0]], loop: false },
				open: { frames: [[3, 0], [4, 0], [5, 0], [4, 0]], loop: true },
				closing: { frames: [[3, 0], [2, 0], [1, 0], [0, 0]], loop: false },
				// Growth stages
				seed: { frames: [[8, 0]], loop: false },
				sprout: { frames: [[9, 0], [10, 0]], loop: true },
				growing: { frames: [[11, 0], [12, 0]], loop: true },
				mature: { frames: [[0, 0]], loop: true }
			}
		}
	},

	// Moving objects  
	BALL: {
		category: 'moving',
		variants: ['red_ball', 'blue_ball'],
		renderType: 'sprite',
		walkable: true,
		draggable: true,
		renderPriority: 2,
		speed: 3,
		friction: 0.98,
		triggerRadius: 96, // 192/2
		pushForce: 5,
		debug: false,
		animation: "sway",
		spriteConfig: {
			spriteSheet: {
				url: "images/MapObjects/ball.gif",
				size: {
					width: 384,
					height: 256
				}
			},
			animations: {
				"idle": { frames: [[0, 0]], loop: true },
				"rotateX": { frames: [[0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1]], loop: true },
				"rotateY": { frames: [[0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [5, 2]], loop: true },
				"rotateZ": { frames: [[0, 3], [1, 3], [2, 3], [3, 3], [4, 3], [5, 3]], loop: true },
				"rotateX_reverse": { frames: [[5, 1], [4, 1], [3, 1], [2, 1], [1, 1], [0, 1]], loop: true },
				"rotateY_reverse": { frames: [[5, 2], [4, 2], [3, 2], [2, 2], [1, 2], [0, 2]], loop: true },
				"rotateZ_reverse": { frames: [[5, 3], [4, 3], [3, 3], [2, 3], [1, 3], [0, 3]], loop: true }
			},
			default: "idle"
		}
	},

	PATROL_GUARD: {
		category: 'moving',
		variants: ['guard'],
		renderType: 'animated',
		collision: true,
		renderPriority: 2,
		speed: 2,
		waitTime: 1000,
		detectionRadius: 150,
		canPursue: true,
		pursuitDuration: 5000,

		spriteConfig: {
			animations: {
				S: { frames: [[0, 0], [1, 0], [2, 0], [3, 0]], loop: true },
				N: { frames: [[0, 1], [1, 1], [2, 1], [3, 1]], loop: true },
				E: { frames: [[0, 2], [1, 2], [2, 2], [3, 2]], loop: true },
				W: { frames: [[0, 3], [1, 3], [2, 3], [3, 3]], loop: true },
				idle: { frames: [[0, 4], [1, 4]], loop: true },
				alert: { frames: [[0, 5], [1, 5], [2, 5]], loop: false },
				pursuit_S: { frames: [[0, 6], [1, 6], [2, 6], [3, 6]], loop: true },
				pursuit_N: { frames: [[0, 7], [1, 7], [2, 7], [3, 7]], loop: true },
				pursuit_E: { frames: [[0, 8], [1, 8], [2, 8], [3, 8]], loop: true },
				pursuit_W: { frames: [[0, 9], [1, 9], [2, 9], [3, 9]], loop: true }
			}
		}
	},

	BUTTERFLY: {
		category: 'moving',
		variants: ['blue_butterfly', 'yellow_butterfly', 'small'],
		renderType: 'animated',
		walkable: true,
		renderPriority: 3,
		speed: 1.5,
		wanderRadius: 100,
		bobAmplitude: 15,
		bobFrequency: 0.05,
		flutterChance: 0.01,
		idleChance: 0.001,

		size: {
			width: 100,
			height: 100
		},


		spriteConfig: {
			spriteSheet: {
				url: "images/MapObjects/butterfly.gif",
				size: {
					width: 500,
					height: 400
				}
			},
			animations: {
				// Direction animations with 2D frames [x, y]
				"E": { frames: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]], loop: true }, // right
				"W": { frames: [[0, 1], [1, 1], [2, 1], [3, 1], [4, 1]], loop: true }, // left
				"N": { frames: [[0, 2], [1, 2], [2, 2], [3, 2], [4, 2]], loop: true }, // up
				"S": { frames: [[0, 3], [1, 3], [2, 3], [3, 3], [4, 3]], loop: true }, // down
				// Idle animation
				"idle": { frames: [[1, 3]], loop: true },
				// Flutter animation
				"flutter": { frames: [[2, 3], [1, 3], [0, 3], [1, 3]], loop: true }
			},
			default: "idle"
		},

		variantConfigs: {
			small: {
				size: {
					width: 50,
					height: 50
				},
				bobAmplitude: 10,
				bobFrequency: 0.07,
				speed: 1.2,
				spriteConfig: {
					spriteSheet: {
						url: "images/MapObjects/butterfly_small.gif",
						size: {
							width: 250,
							height: 200,
						}
					}
				}
			}
		}
	},





	// Updated DOOR config with direction-specific configurations
	DOOR: {
		category: 'interactive',
		variants: ['wooden_door', 'metal_door', 'fancy_door'],
		renderType: 'sprite',
		collision: true,
		renderPriority: 2,
		interactionType: 'toggle',
		interactionRadius: 100,
		canToggle: true,
		default: 'closed',

		canInspect: true,

		// Base configurations
		spriteConfig: {
			default: 'closed',
			spriteSheet: {
				url: "images/MapObjects/door.png",
				size: {
					width: 800,
					height: 256
				},
				frameSize: {
					width: 32 * 5,
					height: 32 * 8,
					offsetX: 32 * 4,
					offsetY: 32 * 5
				}
			},
			animations: {
				closed: { frames: [[0, 0]], loop: false },
				opening: { frames: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]], loop: false },
				open: { frames: [[4, 0]], loop: true },
				closing: { frames: [[4, 0], [3, 0], [2, 0], [1, 0], [0, 0]], loop: false }
			}
		},

		// Direction-specific configurations
		directionConfigs: {
			// East-facing door (opens to the right)
			E: {
				size: { width: 32, height: 96 },
				collider: {
					width: 32,
					height: 96,
					offsetX: 0,
					offsetY: 0
				},
				interactiveCollider: {
					width: 64,
					height: 128,
					offsetX: -32,
					offsetY: -16
				},
				transformStyle: '' // No transform needed
			},

			// West-facing door (opens to the left)
			W: {
				size: { width: 32, height: 96 },
				collider: {
					width: 32,
					height: 96,
					offsetX: 0,
					offsetY: 0
				},
				interactiveCollider: {
					width: 64,
					height: 128,
					offsetX: 0,
					offsetY: -16
				},
				transformStyle: 'scaleX(-1)' // Flip horizontally
			},

			// South-facing door (horizontal, opens downward)
			S: {
				size: { width: 96, height: 32 },
				collider: {
					width: 96,
					height: 32,
					offsetX: 0,
					offsetY: 0
				},
				interactiveCollider: {
					width: 128,
					height: 64,
					offsetX: -16,
					offsetY: -32
				},
				transformStyle: 'rotate(90deg)' // Rotate 90 degrees
			},

			// North-facing door (horizontal, opens upward)
			N: {
				size: { width: 96, height: 32 },
				collider: {
					width: 96,
					height: 32,
					offsetX: 0,
					offsetY: 0
				},
				interactiveCollider: {
					width: 128,
					height: 64,
					offsetX: -16,
					offsetY: 0
				},
				transformStyle: 'rotate(-90deg)' // Rotate -90 degrees
			},

			// Aliases for common terms in the game
			Horizontal: 'S', // Map Horizontal to South
			Vertical: 'E',   // Map Vertical to East
			Right: 'E',
			Left: 'W',
			Up: 'N',
			Down: 'S'
		},

		// Variant-specific configurations
		variantConfigs: {
			wooden_door: {
				// Any wooden door specific settings
			},
			metal_door: {
				spriteConfig: {
					spriteSheet: {
						url: "images/MapObjects/metal_door.png"
					}
				}
			}
		}
	},

	// Updated BED config with direction-specific configurations
	BED: {
		category: 'static',
		variants: ['bed', 'large_bed', 'bunk_bed'],
		renderType: 'sprite',
		collision: true,
		draggable: true,
		interactionType: 'rest',
		restDuration: 5000,
		restHealAmount: 10,
		restMoodBoost: 15,

		// Base sprite configuration
		spriteConfig: {
			spriteSheet: {
				url: "images/MapObjects/bed_default.png",
				size: {
					width: 128,
					height: 256
				}
			}
		},

		// Direction-specific configurations
		directionConfigs: {
			// South-facing bed (default)
			S: {
				size: { width: 128, height: 256 },
				collider: {
					width: 112,
					height: 240,
					offsetX: 8,
					offsetY: 8
				},
				interactiveCollider: {
					width: 192,
					height: 64,
					offsetX: -32,
					offsetY: 256
				},
				transformStyle: '', // No transform
				mytePosition: { xFactor: 0.5, yFactor: 0.75 }, // Position for sleeping myte
				myteFacing: 'S'
			},

			// North-facing bed
			N: {
				size: { width: 128, height: 256 },
				collider: {
					width: 112,
					height: 240,
					offsetX: 8,
					offsetY: 8
				},
				interactiveCollider: {
					width: 192,
					height: 64,
					offsetX: -32,
					offsetY: -64
				},
				transformStyle: 'scaleY(-1)', // Flip vertically
				mytePosition: { xFactor: 0.5, yFactor: 0.25 },
				myteFacing: 'N'
			},

			// East-facing bed
			E: {
				size: { width: 256, height: 128 },
				collider: {
					width: 240,
					height: 112,
					offsetX: 8,
					offsetY: 8
				},
				interactiveCollider: {
					width: 64,
					height: 192,
					offsetX: 256,
					offsetY: -32
				},
				transformStyle: 'rotate(90deg)', // Rotate 90 degrees
				mytePosition: { xFactor: 0.75, yFactor: 0.5 },
				myteFacing: 'E'
			},

			// West-facing bed
			W: {
				size: { width: 256, height: 128 },
				collider: {
					width: 240,
					height: 112,
					offsetX: 8,
					offsetY: 8
				},
				interactiveCollider: {
					width: 64,
					height: 192,
					offsetX: -64,
					offsetY: -32
				},
				transformStyle: 'rotate(-90deg)', // Rotate -90 degrees
				mytePosition: { xFactor: 0.25, yFactor: 0.5 },
				myteFacing: 'W'
			}
		},

		// Variant-specific configurations
		variantConfigs: {
			bed: {
				// Standard bed-specific settings
			},
			large_bed: {
				size: { width: 192, height: 256 },
				// Add size adjustments for each direction
				directionConfigs: {
					E: { size: { width: 256, height: 192 } },
					W: { size: { width: 256, height: 192 } }
				}
			},
			bunk_bed: {
				spriteConfig: {
					spriteSheet: {
						url: "images/MapObjects/bunk_bed.png"
					}
				}
			}
		}
	},




	PORTAL: {
		category: 'interactive',
		variants: ['blue_portal', 'red_portal', 'ancient_portal', 'magic_circle'],
		renderType: 'sprite',
		collision: false,
		walkable: true,
		renderPriority: 2,
		interactionType: 'teleport',
		interactionRadius: 150,
		canToggle: true,
		default: 'active',
		particleEffects: true,
		lightEmission: true,
		canInspect: false,
		size: {
			width: 128,
			height: 128
		},

		// Collider slightly smaller than visual
		collider: {
			width: 64,
			height: 64,
			offsetX: 32, // Center the collider
			offsetY: 32
		},

		// Interactive area larger than visual
		interactiveCollider: {
			width: 196,
			height: 196,
			offsetX: -32, // Extend beyond visual
			offsetY: -32
		},

		spriteConfig: {
			default: 'idle',
			spriteSheet: {
				url: "images/MapObjects/portal.png",
				size: {
					width: 1024, // 8 frames x 128px
					height: 512  // 4 animations x 128px
				}
			},
			animations: {
				idle: { frames: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [7, 0]], loop: true, frameRate: 10 },
				activate: { frames: [[0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1]], loop: false, frameRate: 15 },
				active: { frames: [[0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [7, 2]], loop: true, frameRate: 12 },
				deactivate: { frames: [[0, 3], [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [7, 3]], loop: false, frameRate: 15 }
			}
		},

		// Particle system configuration
		particleConfig: {
			particleEffect: 'GLOW',
			orbitalMotion: true,
			orbitalSpeed: 0.02,
			pulseEffect: true,
			pulseFrequency: 0.05
		},

		// Variant-specific configurations
		variantConfigs: {
			blue_portal: {
				particleEffect: 'GLOW',
				particleStartColor: '#00BFFF',
				particleEndColor: '#0000FF'
			},
			red_portal: {
				particleEffect: 'GLOW',
				particleStartColor: '#FF4500',
				particleEndColor: '#8B0000'
			},
			ancient_portal: {
				particleEffect: 'SPARKLE',
				particleStartColor: '#DAA520',
				particleEndColor: '#8B4513'
			},
			magic_circle: {
				size: {
					width: 192,
					height: 192
				},
				particleEffect: 'SPARKLE_SPRITE',
				particleStartColor: '#9932CC',
				particleEndColor: '#4B0082',
				spriteConfig: {
					url: "images/MapObjects/magic_circle.png"
				}
			}
		}
	},








	FENCE: {
		category: 'structure',
		variants: ['wooden_fence', 'stone_fence', 'iron_fence', 'garden_fence'],
		renderType: 'sprite',
		collision: true,
		renderPriority: 2,
		walkable: false,
		interactive: false,

		// Default size for horizontal fence sections
		size: {
			width: 64,
			height: 32
		},

		// Basic collision properties
		collider: {
			width: 64,
			height: 16,
			offsetX: 0,
			offsetY: 0
		},

		// Direction-specific configurations
		directionConfigs: {
			// Horizontal fence (East-West)
			E: {
				size: { width: 64, height: 32 },
				collider: {
					width: 64,
					height: 16,
					offsetX: 0,
					offsetY: 8
				},
				transformStyle: '' // No transform needed
			},

			// Vertical fence (North-South)
			N: {
				size: { width: 32, height: 64 },
				collider: {
					width: 16,
					height: 64,
					offsetX: 8,
					offsetY: 0
				},
				transformStyle: 'rotate(-90deg)' // Rotate for vertical orientation
			},

			// Corner pieces
			NE: { // Northeast corner
				size: { width: 32, height: 32 },
				collider: {
					width: 24,
					height: 24,
					offsetX: 4,
					offsetY: 4
				},
				transformStyle: ''
			},

			NW: { // Northwest corner
				size: { width: 32, height: 32 },
				collider: {
					width: 24,
					height: 24,
					offsetX: 4,
					offsetY: 4
				},
				transformStyle: 'scaleX(-1)'
			},

			SE: { // Southeast corner
				size: { width: 32, height: 32 },
				collider: {
					width: 24,
					height: 24,
					offsetX: 4,
					offsetY: 4
				},
				transformStyle: 'scaleY(-1)'
			},

			SW: { // Southwest corner
				size: { width: 32, height: 32 },
				collider: {
					width: 24,
					height: 24,
					offsetX: 4,
					offsetY: 4
				},
				transformStyle: 'rotate(180deg)'
			},

			// Aliases
			Horizontal: 'E',
			Vertical: 'N'
		},

		// Sprite configuration
		spriteConfig: {
			spriteSheet: {
				url: "images/MapObjects/fence_wooden.png",
				size: {
					width: 192, // 3 variants * 64px width
					height: 256  // Different fence pieces (straight, corners, etc)
				}
			}
		},

		// Variant-specific configurations
		variantConfigs: {
			wooden_fence: {
				// Wooden fence is the default
			},
			stone_fence: {
				spriteConfig: {
					spriteSheet: {
						url: "images/MapObjects/fence_stone.png"
					}
				}
			},
			iron_fence: {
				spriteConfig: {
					spriteSheet: {
						url: "images/MapObjects/fence_iron.png"
					}
				}
			},
			garden_fence: {
				spriteConfig: {
					spriteSheet: {
						url: "images/MapObjects/fence_garden.png"
					}
				},
				size: { width: 64, height: 48 } // Garden fence might be taller
			}
		}
	},

	GATE: {
		category: 'interactive',
		variants: ['wooden_gate', 'stone_gate', 'iron_gate', 'garden_gate'],
		renderType: 'sprite',
		collision: true,
		renderPriority: 2,
		interactionType: 'toggle',
		interactionRadius: 80,
		canToggle: true,
		default: 'closed',

		// Default size for horizontal gates
		size: {
			width: 64,
			height: 32
		},

		// Direction-specific configurations
		directionConfigs: {
			// East-facing gate (horizontal, opens to the right)
			E: {
				size: { width: 64, height: 32 },
				collider: {
					width: 64,
					height: 16,
					offsetX: 0,
					offsetY: 8
				},
				interactiveCollider: {
					width: 96,
					height: 64,
					offsetX: -16,
					offsetY: -16
				},
				transformStyle: '' // No transform needed
			},

			// West-facing gate (horizontal, opens to the left)
			W: {
				size: { width: 64, height: 32 },
				collider: {
					width: 64,
					height: 16,
					offsetX: 0,
					offsetY: 8
				},
				interactiveCollider: {
					width: 96,
					height: 64,
					offsetX: -16,
					offsetY: -16
				},
				transformStyle: 'scaleX(-1)' // Flip horizontally
			},

			// North-facing gate (vertical, opens upward)
			N: {
				size: { width: 32, height: 64 },
				collider: {
					width: 16,
					height: 64,
					offsetX: 8,
					offsetY: 0
				},
				interactiveCollider: {
					width: 64,
					height: 96,
					offsetX: -16,
					offsetY: -16
				},
				transformStyle: 'rotate(-90deg)' // Rotate -90 degrees
			},

			// South-facing gate (vertical, opens downward)
			S: {
				size: { width: 32, height: 64 },
				collider: {
					width: 16,
					height: 64,
					offsetX: 8,
					offsetY: 0
				},
				interactiveCollider: {
					width: 64,
					height: 96,
					offsetX: -16,
					offsetY: -16
				},
				transformStyle: 'rotate(90deg)' // Rotate 90 degrees
			},

			// Aliases
			Horizontal: 'E',
			Vertical: 'N'
		},

		// Sprite configuration
		spriteConfig: {
			default: 'closed',
			spriteSheet: {
				url: "images/MapObjects/gate_wooden.png",
				size: {
					width: 320, // 5 frames * 64px
					height: 128  // 4 directions (or animations)
				}
			},
			animations: {
				closed: { frames: [[0, 0]], loop: false },
				opening: { frames: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]], loop: false },
				open: { frames: [[4, 0]], loop: true },
				closing: { frames: [[4, 0], [3, 0], [2, 0], [1, 0], [0, 0]], loop: false }
			}
		},

		// Variant-specific configurations
		variantConfigs: {
			wooden_gate: {
				// Wooden gate is the default
			},
			stone_gate: {
				spriteConfig: {
					spriteSheet: {
						url: "images/MapObjects/gate_stone.png"
					}
				}
			},
			iron_gate: {
				spriteConfig: {
					spriteSheet: {
						url: "images/MapObjects/gate_iron.png"
					}
				}
			},
			garden_gate: {
				spriteConfig: {
					spriteSheet: {
						url: "images/MapObjects/gate_garden.png"
					}
				},
				size: { width: 64, height: 48 } // Garden gate might be taller
			}
		}
	}



};

class MapObject {
	static nextObjectId = 1;

	constructor(parent, type, variant, posX, posY, config = {}) {
		// Store base identity properties
		this.id = config.id ?? `${type.toLowerCase()}_${MapObject.nextObjectId++}`;
		this.type = type;
		this.variant = variant;
		this.posX = posX;
		this.posY = posY;
		this.posZ = 0;

		// Store config reference (already processed by factory)
		this.config = config;

		// Core state
		this.active = true;
		this.element = null;
		this.parent = parent;
		this.map = parent || null;
		this.container = parent?.parent || null;
		this.core = this.container?.core || null;

		// Set up size based on config
		this.size = {
			width: this.getConfig('size.width', 64) * this.getConfig('scale', 1),
			height: this.getConfig('size.height', 64) * this.getConfig('scale', 1)
		};

		// Set up collider
		this.collider = this.initializeCollider();

		// Set up interaction state
		this.interactionState = {
			lastInteractionTime: 0,
			cooldown: this.getConfig('interactionCooldown', 5000),
			activeInteractions: new Set(),
			// Maps myte id → timestamp of last interaction (replaces setTimeout)
			interactionTimes: new Map()
		};

		// Initialize components when element is available
		this.inputComponents = {};

		// Track if the object is currently being dragged
		this.isDragging = false;

		// Render state: simulation writes here, MapRenderer reads and flushes to DOM.
		// Nothing outside MapRenderer should write to the DOM directly.
		this.renderState = {
			posX: posX,
			posY: posY,
			zIndex: 0,
			bgPosition: null,
			visible: true,
			dirty: true     // true = needs a DOM flush
		};
		// Previous render position used for dirty-checking
		this._prevRenderX = -1;
		this._prevRenderY = -1;

		// Sleep/wake: objects outside the culling zone skip tick and update.
		// GridSystem.updateCulling() calls wake()/sleep() on transitions.
		this.sleeping = false;
	}

	get gameMap() {
		return this.map;
	}

	get activeMyte() {
		return this.container?.activeMyte || this.map?.activeMyte || null;
	}

	get mytes() {
		return this.map?.mytes || this.container?.mytes || [];
	}

	getInteractionRadius(defaultValue = 100) {
		return this.getConfig('interactionRadius', defaultValue);
	}

	getDistanceTo(target) {
		if (!target) return Infinity;
		return Math.hypot(this.posX - target.posX, this.posY - target.posY);
	}

	isInInteractionRange(target, radius = this.getInteractionRadius()) {
		return this.getDistanceTo(target) <= radius;
	}

	selectInUi() {
		this.container?.ui?.setSelected?.(this);
	}

	// Called by GridSystem when this object enters the active viewport
	wake() {
		if (!this.sleeping) return;
		this.sleeping = false;
		this.renderState.dirty = true; // force a full re-render after waking
		if (this.animation) this.animation.paused = false;
	}

	// Called by GridSystem when this object leaves the active viewport
	sleep() {
		if (this.sleeping) return;
		this.sleeping = true;
		if (this.animation) this.animation.paused = true;
	}

	// Clean config access with defaults
	getConfig(path, defaultValue = null) {
		const keys = path.split('.');
		let current = this.config;

		for (const key of keys) {
			if (current === undefined || current === null || !current.hasOwnProperty(key)) {
				return defaultValue;
			}
			current = current[key];
		}

		return current !== undefined ? current : defaultValue;
	}

	static processDirectionConfig(baseConfig, direction) {
		// Create a deep copy of the config to avoid modifying the original
		const config = JSON.parse(JSON.stringify(baseConfig));

		// Check if we have direction configurations
		if (!config.directionConfigs) return config;

		// Normalize the direction
		let normalizedDirection = MapObject.normalizeFacingDirection(direction, config.directionConfigs);

		// If we don't have config for this direction, return the base config
		if (!config.directionConfigs[normalizedDirection]) return config;

		// Get the direction config
		const dirConfig = config.directionConfigs[normalizedDirection];

		// Apply direction-specific properties to the base config
		if (dirConfig.size) {
			config.size = dirConfig.size;
		}

		if (dirConfig.collider) {
			config.collider = dirConfig.collider;
		}

		if (dirConfig.interactiveCollider) {
			config.interactiveCollider = dirConfig.interactiveCollider;
		}

		// Store the direction and transform info
		config.facingDirection = normalizedDirection;
		config.transformStyle = dirConfig.transformStyle || '';

		// Copy any other direction-specific properties
		for (const key in dirConfig) {
			if (!['size', 'collider', 'interactiveCollider', 'transformStyle'].includes(key)) {
				config[key] = dirConfig[key];
			}
		}

		return config;
	}

	static normalizeFacingDirection(direction, directionConfigs = {}) {
		// If it's already a standard direction, return it
		if (['N', 'S', 'E', 'W'].includes(direction)) {
			return direction;
		}

		// Check if we have direction configs with this as an alias
		if (directionConfigs[direction] && typeof directionConfigs[direction] === 'string') {
			return directionConfigs[direction];
		}

		// Common direction mappings
		const dirMap = {
			'up': 'N', 'north': 'N', 'u': 'N', 'n': 'N',
			'right': 'E', 'east': 'E', 'r': 'E', 'e': 'E',
			'down': 'S', 'south': 'S', 'd': 'S', 's': 'S',
			'left': 'W', 'west': 'W', 'l': 'W', 'w': 'W',
			'horizontal': 'S',
			'vertical': 'E'
		};

		// Convert to lowercase for case-insensitive matching
		const dir = direction.toLowerCase();
		return dirMap[dir] || 'S'; // Default to South if not recognized
	}

	normalizeFacingDirection(direction) {
		return MapObject.normalizeFacingDirection(direction, this.getConfig('directionConfigs', {}));
	}
	// Clean collider initialization
	initializeCollider() {
		// If we have a predefined collider, use it
		if (this.config.collider) return this.config.collider;

		// Otherwise create a default collider
		return {
			type: 'box',
			width: this.size.width * 0.8,
			height: this.size.height * 0.8,
			offsetX: this.size.width * 0.1,
			offsetY: this.size.height * 0.1
		};
	}

	// Initialize components after parent and element are available
	initializeInputComponents() {
		if (!this.element || !this.parent) return;

		// Initialize common components based on config flags
		if (this.getConfig('interactive', true)) {
			this.initClickComponent();
		}

		if (this.getConfig('draggable', false)) {
			this.initDragComponent();
		}

		if (this.getConfig('rubbable', false)) {
			this.initRubbingComponent();
		}

		// Set up all initialized components
		Object.values(this.inputComponents).forEach(component => {
			if (!component.element) {
				component.element = this.element;
			}
			component.initialize();
		});
	}

	// Initialize the click component
	initClickComponent() {
		// Don't create duplicate components
		if (this.inputComponents.click) return;

		this.inputComponents.click = new ClickComponent(this, {
			element: this.element,
			enabled: true,
			canClick: () => this.active,
			onClick: (event) => {
				this.press(this.parent);
			},
			onDoubleClick: (event) => {
				if (this.getConfig('doubleClickAction')) {
					this.handleDoubleClick(event);
				}
			},
			onLongPress: (event) => {
				if (this.getConfig('draggable') && this.parent?.ui?.isTool(UIToolModes.SELECT)) {
					this.parent?.ui?.setTool(UIToolModes.DRAG);
					this.startDrag();
				} else {
					this.handleLongPress(event);
				}
			}
		});
	}

	// Initialize drag component
	initDragComponent() {
		if (this.inputComponents.drag) return;

		this.inputComponents.drag = new DragComponent(this, {
			element: this.element,
			enabled: true,
			autoActivate: false,
			canDrag: () => this.active && this.canBeDragged(),
			dragThreshold: 3,
			dragTimeThreshold: 0,
			preventDefaultsForDrag: true,
			onDragStart: (event) => {
				this.isDragging = true;
				this.element.classList.add('dragging');
				if (this.parent?.ui) {
					this.parent.ui.setSelected(this);
				}
			},
			onDragMove: (event) => {
				const containerRect = this.parent.getContainerRect();
				const relativeX = event.position.x - containerRect.left;
				const relativeY = event.position.y - containerRect.top;
				const cameraOffsetX = this.parent.camera ? this.parent.camera.posX : 0;
				const cameraOffsetY = this.parent.camera ? this.parent.camera.posY : 0;

				this.posX = relativeX - (this.size.width / 2) - cameraOffsetX;
				this.posY = relativeY - (this.size.height / 2) - cameraOffsetY;

				this.updatePosition();

				// Highlight potential drop location
				this.showDropTarget();


			},
			onDragEnd: (event) => {
				this.isDragging = false;
				this.element.classList.remove('dragging');
				this.hideDropTarget();

				if (this.getConfig('snapToGrid', false)) {
					this.snapToGrid();
				}

				this.handleMovedEvent();
			}
		});
	}

	showDropTarget() {
		const gridSystem = this.parent?.gameMap?.gridSystem;
		if (!gridSystem) return;

		// Create the indicator once and reuse it for the entire drag session
		if (!this._dropTargetEl) {
			this._dropTargetEl = document.createElement('div');
			this._dropTargetEl.className = 'drop-target debug';
			this._dropTargetEl.style.width  = `${this.size.width}px`;
			this._dropTargetEl.style.height = `${this.size.height}px`;
			this.parent.gameMap.layers.debug.appendChild(this._dropTargetEl);
		}

		const snappedPos = gridSystem.snapToGridOptimal(
			this.posX, this.posY,
			this.size.width, this.size.height,
			gridSystem.config.cellSize
		);

		this._dropTargetEl.style.left = `${snappedPos.x}px`;
		this._dropTargetEl.style.top  = `${snappedPos.y}px`;

		const isValid = this.checkDropValidity(snappedPos.x, snappedPos.y);
		this._dropTargetEl.classList.toggle('valid-drop',   isValid);
		this._dropTargetEl.classList.toggle('invalid-drop', !isValid);
		this._dropTargetEl.style.display = '';
	}

	hideDropTarget() {
		if (this._dropTargetEl) {
			this._dropTargetEl.style.display = 'none';
		}
	}

	// Add this helper method to check drop validity
	checkDropValidity(x, y) {
		// Get grid system
		const gridSystem = this.parent.gameMap.gridSystem;
		if (!gridSystem) return true;

		// Convert to grid coordinates
		const startGridX = Math.floor(x / gridSystem.config.cellSize);
		const startGridY = Math.floor(y / gridSystem.config.cellSize);
		const endGridX = Math.ceil((x + this.size.width) / gridSystem.config.cellSize);
		const endGridY = Math.ceil((y + this.size.height) / gridSystem.config.cellSize);

		// Check each cell
		for (let gridX = startGridX; gridX < endGridX; gridX++) {
			for (let gridY = startGridY; gridY < endGridY; gridY++) {
				// Skip out of bounds cells
				if (gridX < 0 || gridX >= gridSystem.gridWidth ||
					gridY < 0 || gridY >= gridSystem.gridHeight) {
					return false;
				}

				// Check if cell is walkable (no collision)
				if (!gridSystem.grid[gridX][gridY].walkable) {
					// Skip checking our own position
					let hasOtherObjects = false;
					gridSystem.grid[gridX][gridY].objects.forEach(obj => {
						if (obj !== this && !obj.config.walkable) {
							hasOtherObjects = true;
						}
					});

					if (hasOtherObjects) return false;
				}
			}
		}

		return true;
	}

	// Initialize rubbing component
	initRubbingComponent() {
		if (this.inputComponents.rubbing) return;

		this.inputComponents.rubbing = new RubbingComponent(this, {
			element: this.element,
			enabled: true,
			canRub: () => this.active && this.parent?.ui?.isTool(UIToolModes.PET),
			minRubs: 3,
			maxRubs: 15,
			directionThreshold: 10,
			minTimeBetweenRubs: this.getConfig('rubCooldown', 5000),
			onRubStart: () => {
				this.element.classList.add('being-rubbed');
			},
			onRubProgress: (event) => {
				if (this.getConfig('rubFeedback')) {
					this.handleRubProgress(event.count);
				}
			},
			onRubComplete: (event) => {
				this.element.classList.remove('being-rubbed');
				if (this.getConfig('onRub')) {
					this.handleRubEvent(event.count);
				}
			},
			onRubOverdone: (event) => {
				this.element.classList.remove('being-rubbed');
				if (this.getConfig('onRubOverdone')) {
					this.handleRubOverdone(event.count);
				}
			}
		});
	}

	// Mark renderState dirty when simulation position changes.
	// DOM writes are deferred to MapRenderer.flush() at end of frame.
	markPositionDirty() {
		if (this.posX !== this._prevRenderX || this.posY !== this._prevRenderY) {
			this.renderState.posX = this.posX;
			this.renderState.posY = this.posY;
			if (this.parent && this.parent.getZIndex) {
				this.renderState.zIndex = this.parent.getZIndex(this.posY, this.size.height);
			}
			this.renderState.dirty = true;
		}
	}

	// Legacy path: still works for one-shot moves (drag snap, teleport, init).
	// Prefer markPositionDirty() inside update loops.
	updatePosition() {
		if (!this.element) return;

		this.renderState.posX = this.posX;
		this.renderState.posY = this.posY;
		if (this.parent && this.parent.getZIndex) {
			this.renderState.zIndex = this.parent.getZIndex(this.posY, this.size.height);
		}
		this.renderState.dirty = true;

		// Flush immediately for one-shot callers (drag, init) so they don't
		// have to wait for the next render pass.
		if (this.element) {
			this.element.style.left = `${this.posX}px`;
			this.element.style.top  = `${this.posY}px`;
			if (this.renderState.zIndex) {
				this.element.style.zIndex = this.renderState.zIndex;
			}
			this._prevRenderX = this.posX;
			this._prevRenderY = this.posY;
			this.renderState.dirty = false;
		}
	}

	// Check if this object can be dragged
	canBeDragged() {
		if (!this.getConfig('draggable', false)) return false;

		const isDragMode = this.parent?.ui?.isTool(UIToolModes.DRAG);
		const isSelectedInSelectMode =
			this.parent?.ui?.isTool(UIToolModes.SELECT) &&
			this.parent?.ui?.selectedObject === this;

		return isDragMode || isSelectedInSelectMode;
	}

	// Programmatically start dragging this object
	startDrag() {
		if (!this.canBeDragged() || !this.inputComponents.drag) return;
		this.inputComponents.drag.startDragAtCurrentPosition();
	}

	// Intersection check for collision detection
	intersects(other) {
		return this.posX < other.posX + other.size.width &&
			this.posX + this.size.width > other.posX &&
			this.posY < other.posY + other.size.height &&
			this.posY + this.size.height > other.posY;
	}

	// Check if a point is inside this object
	containsPoint(x, y) {
		return x >= this.posX &&
			x <= this.posX + this.size.width &&
			y >= this.posY &&
			y <= this.posY + this.size.height;
	}

	canInteract(myte) {
		if (!this.getConfig('interactionType')) return false;

		// Use performance.now() + the interactionTimes map instead of setTimeout closures.
		// Expiry is checked in tickUpdate() — no allocations per call.
		if (this.interactionState.activeInteractions.has(myte.id)) return false;

		const timeSinceLastInteraction = performance.now() - this.interactionState.lastInteractionTime;
		if (timeSinceLastInteraction < this.interactionState.cooldown) return false;

		return true;
	}

	interact(myte) {
		if (!this.canInteract(myte)) return false;

		const now = performance.now();
		this.interactionState.lastInteractionTime = now;
		this.interactionState.activeInteractions.add(myte.id);
		this.interactionState.interactionTimes.set(myte.id, now);

		const interactionType = this.getConfig('interactionType');
		switch (interactionType) {
			case 'mood_boost':
				myte.stats.updateMood(this.getConfig('moodBoostAmount', 10));
				myte.queue.addExpression('happy');
				break;
			case 'dance':
				myte.queue.addExpression('dance');
				break;
			case 'consume':
				if (this.getConfig('consumable', false)) {
					this.remove();
				}
				break;
			default: {
				const onInteract = this.getConfig('onInteract');
				if (typeof onInteract === 'function') onInteract(myte, this);
			}
		}

		// No setTimeout — expiry is handled in MapObject.tickUpdate() via interactionTimes
		return true;
	}

	// Render the object to the container
	render(container, parent) {
		const divElement = document.createElement('div');
		divElement.classList.add('mapObject', this.variant);

		// Add data attributes
		divElement.dataset.objectType = this.type;
		divElement.dataset.objectId = this.id || '';

		// Add feature-specific classes
		if (this.getConfig('draggable', false)) {
			divElement.classList.add('draggable');
			divElement.style.touchAction = 'none';
		}

		if (this.getConfig('rubbable', false)) {
			divElement.classList.add('rubbable');
		}

		if (this.getConfig('category', false) == "interactive") {
			divElement.classList.add('interactive');

			if (this.getConfig('interactiveCollider')) {
				let interactiveElement = document.createElement('div');
				interactiveElement.classList.add('interactive-collider');

				// set width, height, top left
				interactiveElement.style.width = `${this.getConfig('interactiveCollider.width')}px`;
				interactiveElement.style.height = `${this.getConfig('interactiveCollider.height')}px`;
				interactiveElement.style.top = `${this.getConfig('interactiveCollider.offsetY')}px`;
				interactiveElement.style.left = `${this.getConfig('interactiveCollider.offsetX')}px`;

				divElement.appendChild(interactiveElement);
			}
		}

		// Set position and size
		Object.assign(divElement.style, {
			left: `${this.posX}px`,
			top: `${this.posY}px`,
			width: `${this.size.width}px`,
			height: `${this.size.height}px`,
			zIndex: parent.getZIndex(this.posY, this.size.height)
		});

		// Render based on type
		const renderType = this.getConfig('renderType', 'single');
		if (renderType === 'split') {
			this.renderSplitObject(divElement);
		} else {
			this.renderSingleObject(divElement);
		}

		this.element = divElement;
		container.appendChild(divElement);

		// Initialize input components after element is created
		this.initializeInputComponents();

		return divElement;
	}

	// Render a split object (with back and front parts)
	renderSplitObject(container) {
		const div = document.createElement('div');
		div.classList.add("sprite");

		['back', 'front'].forEach(part => {
			const part_div = document.createElement('div');
			part_div.classList.add(part);
			part_div.style.backgroundImage = `url('images/MapObjects/${this.variant}_${part}.png')`;
			part_div.style.backgroundSize = 'cover';

			// Apply animation if configured
			if (part === 'front' && this.getConfig('animation') === "sway") {
				part_div.classList.add("sway");
				const randomDelay = Math.random() * 5;
				part_div.style.animationDelay = `-${randomDelay}s`;
			}
			div.appendChild(part_div);
		});

		container.appendChild(div);
	}

	// Render a single object
	renderSingleObject(container) {
		const div = document.createElement('div');
		div.classList.add("sprite");


		// spritesheet info
		if (this.getConfig('spriteConfig.spriteSheet.url')) {
			div.style.backgroundImage = `url(${this.getConfig('spriteConfig.spriteSheet.url')})`;

			let size = {
				width: this.getConfig('spriteConfig.spriteSheet.size.width') / this.getConfig('size.width') * 100,
				height: this.getConfig('spriteConfig.spriteSheet.size.height') / this.getConfig('size.height') * 100
			};

			// div.style.backgroundSize = `${size.width}% ${size.height}%`;
		}

		// offsetting sprite
		if (this.getConfig('spriteConfig.spriteSheet.frameSize')) {
			div.style.width = `${this.getConfig('spriteConfig.spriteSheet.frameSize.width')}px`;
			div.style.height = `${this.getConfig('spriteConfig.spriteSheet.frameSize.height')}px`;


			div.style.left = `${-this.getConfig('spriteConfig.spriteSheet.frameSize.offsetX')}px`;
			div.style.top = `${-this.getConfig('spriteConfig.spriteSheet.frameSize.offsetY')}px`;

		}


		if (this.getConfig('animation') === "sway") {
			div.classList.add("sway");
			const randomDelay = Math.random() * 5;
			div.style.animationDelay = `-${randomDelay}s`;
		}

		container.appendChild(div);
	}

	// Handle click/press on this object
	press(parent) {

		if (!this.active) return false;

		if (this.activeMyte) {

			if(this.getConfig('canInspect')){
				this.selectInUi();
			}
			
			// Trigger any onClick handler from config
			/*
			const onClick = this.getConfig('onClick');
			if (typeof onClick === 'function') {
				console.log("ON CLICK");
				onClick(this, this.parent);
			}
			*/

			return true;
		}
		return false;
	}

	// Handle selection state
	select() {
		if (!this.element) return;
		this.element.classList.add('selected-object');
	}

	// Handle deselection
	unselect() {
		if (!this.element) return;
		this.element.classList.remove('selected-object');
	}

	remove() {
		Object.values(this.inputComponents).forEach(component => component.destroy());
		this.inputComponents = {};

		// Remove cached drop target indicator
		if (this._dropTargetEl) {
			this._dropTargetEl.remove();
			this._dropTargetEl = null;
		}

		if (this.element) {
			this.element.remove();
			this.element = null;
		}

		this.active = false;
	}

	// Snap object to grid
	snapToGrid() {
		const gridSize = this.getConfig('gridSize', 32);
		this.posX = Math.round(this.posX / gridSize) * gridSize;
		this.posY = Math.round(this.posY / gridSize) * gridSize;
		this.updatePosition();
	}

	// Event handlers
	handleDoubleClick(event) {
		const doubleClickAction = this.getConfig('doubleClickAction');
		if (typeof doubleClickAction === 'function') {
			doubleClickAction(this, event);
		}
	}

	handleLongPress(event) {
		const longPressAction = this.getConfig('longPressAction');
		if (typeof longPressAction === 'function') {
			longPressAction(this, event);
		}
	}

	handleMovedEvent() {
		const onMove = this.getConfig('onMove');
		if (typeof onMove === 'function') {
			onMove(this);
		}

		// Update grid position if using a grid system
		if (this.parent?.gameMap?.gridSystem) {
			this.parent.gameMap.gridSystem.updateObjectPosition(this);
		}
	}

	handleRubProgress(count) {
		const rubFeedback = this.getConfig('rubFeedback');
		if (typeof rubFeedback === 'function') {
			rubFeedback(this, count);
		}
	}

	handleRubEvent(intensity) {
		const onRub = this.getConfig('onRub');
		if (typeof onRub === 'function') {
			onRub(this, intensity);
		}
	}

	handleRubOverdone(intensity) {
		const onRubOverdone = this.getConfig('onRubOverdone');
		if (typeof onRubOverdone === 'function') {
			onRubOverdone(this, intensity);
		}
	}

	// Component control methods
	enableDragging() {
		if (!this.getConfig('draggable', false)) {
			this.config.draggable = true;
		}

		if (this.inputComponents.drag) {
			this.inputComponents.drag.enable();
		} else {
			this.initDragComponent();
		}
	}

	disableDragging() {
		if (this.inputComponents.drag) {
			this.inputComponents.drag.disable();
		}
	}

	enableRubbing() {
		if (!this.getConfig('rubbable', false)) {
			this.config.rubbable = true;
		}

		if (this.inputComponents.rubbing) {
			this.inputComponents.rubbing.enable();
		} else {
			this.initRubbingComponent();
		}
	}

	disableRubbing() {
		if (this.inputComponents.rubbing) {
			this.inputComponents.rubbing.disable();
		}
	}

	// Per-tick gameplay update (20 Hz fixed). Subclasses override this for AI, state, cooldowns.
	// Must not touch the DOM.
	tickUpdate(tickDelta) {
		// Expire interaction cooldowns without allocating closures
		const now = performance.now();
		for (const [id, time] of this.interactionState.interactionTimes) {
			if (now - time >= this.interactionState.cooldown) {
				this.interactionState.activeInteractions.delete(id);
				this.interactionState.interactionTimes.delete(id);
			}
		}
	}

	// Per-frame visual update (variable rate). Subclasses override for animation.
	// Must not change simulation state.
	update(deltaTime) {
		// Update input components that need per-frame processing
		Object.values(this.inputComponents).forEach(component => {
			if (component.isActive()) {
				component.update(deltaTime);
			}
		});

		// Custom update logic from config
		const updateFn = this.getConfig('update');
		if (typeof updateFn === 'function') {
			updateFn(this, deltaTime);
		}

		// Mark render dirty if simulation moved this object
		this.markPositionDirty();
	}
}
