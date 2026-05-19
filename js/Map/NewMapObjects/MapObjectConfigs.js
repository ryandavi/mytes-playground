// Base configuration for all map objects
const BASE_CONFIG = {
	renderPriority: 1,
	scale: 1,
	size: {
		width: 64,
		height: 64
	},

	walkable: false,
	collision: false,

	direction: DIRECTION.SOUTH,

	interactive: true,
	interactionType: null,
	interactionRadius: 100,
	interactionCooldown: 5000,
	draggable: false,
	rubbable: false,

	canInspect: true,
	canPickUp: false,

	// null = any side, DIRECTION.NORTH, DIRECTION.SOUTH, DIRECTION.EAST, DIRECTION.WEST
	interactionSide: null,

	// single, split, animated, sprite
	renderType: 'single',

	canToggle: false,
	default: 'default',
	states: ['default'],

	animates: false,
	frameDelay: 100,

	particleEffects: false,
	lightEmission: false,
	soundEffects: false,

	lootable: false,
	consumable: false,
	storable: false,

	saveable: false,
	respawns: false,
	respawnTime: 300000 // 5 minutes
};

// Type-specific configurations — one entry per object type.
// Add new types here; the factory and registry handle the rest.
const TYPE_CONFIGS = {

	// ── Nature ────────────────────────────────────────────────────────────────

	GRASS: {
		category: 'nature',
		variants: ['grass_1', 'grass_2', 'grass_3'],
		renderType: 'split',
		walkable: true,
		animation: 'sway'
	},

	FLOWER: {
		category: 'nature',
		variants: ['flower_red', 'flower_yellow', 'flower_blue'],
		walkable: true,
		interactionType: 'mood_boost',
		moodBoostAmount: 5
	},

	// ── Items ─────────────────────────────────────────────────────────────────

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

	// ── Containers ────────────────────────────────────────────────────────────

	TREASURE_CHEST: {
		category: 'container',
		variants: ['wooden_chest', 'golden_chest'],
		collision: true,
		canClose: true,
		renderType: 'sprite',
		renderPriority: 2,
		interactionType: 'open',
		size: { width: 32, height: 32 },
		scale: 2,
		collider: { width: 56, height: 24, offsetX: 4, offsetY: 36 },
		interactiveCollider: { width: 88, height: 88, offsetX: -12, offsetY: -12 },
		spriteConfig: {
			default: 'closed',
			spriteSheet: {
				url: 'images/chest_spritesheet.png',
				size: { width: 192, height: 32 }
			},
			animations: {
				closed:  { frames: [[0, 0]], loop: true },
				opening: { frames: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]], loop: false },
				closing: { frames: [[4, 0], [3, 0], [2, 0], [1, 0], [0, 0]], loop: false },
				opened:  { frames: [[4, 0]], loop: true }
			}
		},
		soundEffects: {
			open: 'obj_chest_open',
			close: 'obj_chest_close',
			drop: 'ui_drop_item'
		}
	},

	// ── Interactive structures ────────────────────────────────────────────────

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
		soundEffects: {
			on: 'obj_fountain_on',
			off: 'obj_fountain_off'
		},
		spriteConfig: {
			animations: {
				idle:    { frames: [[0, 0], [1, 0], [2, 0], [3, 0]], loop: true },
				off:     { frames: [[0, 0]], loop: false },
				turnOn:  { frames: [[0, 0], [1, 0], [2, 0], [3, 0]], loop: false },
				turnOff: { frames: [[3, 0], [2, 0], [1, 0], [0, 0]], loop: false },
				splash:  { frames: [[4, 0], [5, 0], [6, 0], [7, 0]], loop: true }
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
		soundEffects: {
			on: 'obj_lantern_on',
			off: 'obj_lantern_off'
		},
		spriteConfig: {
			animations: {
				idle:    { frames: [[0, 0], [1, 0], [2, 0], [1, 0]], loop: true },
				off:     { frames: [[0, 0]], loop: false },
				turnOn:  { frames: [[0, 0], [1, 0], [2, 0]], loop: false },
				turnOff: { frames: [[2, 0], [1, 0], [0, 0]], loop: false },
				flicker: { frames: [[3, 0], [4, 0], [5, 0], [4, 0], [3, 0]], loop: false }
			}
		}
	},

	// ── Plants ────────────────────────────────────────────────────────────────

	GROWING_PLANT: {
		category: 'plant',
		renderType: 'animated',
		walkable: true,
		renderPriority: 2,
		interactionType: 'tend',
		default: 'seed',
		growthConfig: {
			baseGrowthTime: 300000, // 5 minutes per stage
			waterBoostMultiplier: 1.5,
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
				seed:     { frames: [[0, 0]], loop: false },
				sprout:   { frames: [[1, 0], [2, 0]], loop: true },
				growing:  { frames: [[3, 0], [4, 0]], loop: true },
				mature:   { frames: [[5, 0], [6, 0]], loop: true },
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
		animation: 'sway',
		size: { width: 64, height: 128 },
		collider: {
			offsetX: 16,
			offsetY: 84,
			width: 32,
			height: 32
		},
		growthConfig: {
			baseGrowthTime: 3000,
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
			regrowthTime: 180000, // 3 minutes
			yield: { min: 1, max: 3, qualityChance: 0.1 }
		},
		spriteConfig: {
			default: 'seed',
			spriteSheet: {
				url: 'images/MapObjects/crop_corn.png',
				size: { width: 256, height: 128 }
			},
			animations: {
				seed:      { frames: [[0, 0]], loop: false },
				sprout:    { frames: [[1, 0]], loop: true },
				growing:   { frames: [[2, 0]], loop: true },
				flowering: { frames: [[3, 0]], loop: true },
				mature:    { frames: [[3, 0]], loop: true },
				harvest:   { frames: [[3, 0]], loop: false }
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
					red:    ['white', 'yellow'],
					blue:   ['white'],
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
			spring: { growthRate: 1.5, bloomDuration: 1.2, pollinationChance: 1.3 },
			summer: { growthRate: 1.0, bloomDuration: 1.0, pollinationChance: 1.0 },
			autumn: { growthRate: 0.7, bloomDuration: 0.8, pollinationChance: 0.6 },
			winter: { growthRate: 0.3, bloomDuration: 0.5, pollinationChance: 0.2 }
		},
		spriteConfig: {
			scale: 2,
			animations: {
				seed:        { frames: [[0, 0]], loop: false },
				sprout:      { frames: [[1, 0], [2, 0]], loop: true },
				bud:         { frames: [[3, 0], [4, 0], [5, 0], [4, 0]], loop: true },
				bloom:       { frames: [[6, 0], [7, 0], [8, 0], [7, 0]], loop: true },
				pollinating: { frames: [[9, 0], [10, 0], [11, 0], [10, 0], [9, 0]], loop: false },
				wilting:     { frames: [[12, 0], [13, 0], [14, 0]], loop: false },
				dormant:     { frames: [[15, 0]], loop: false }
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
				closed:  { frames: [[0, 0]], loop: false },
				opening: { frames: [[0, 0], [1, 0], [2, 0], [3, 0]], loop: false },
				open:    { frames: [[3, 0], [4, 0], [5, 0], [4, 0]], loop: true },
				closing: { frames: [[3, 0], [2, 0], [1, 0], [0, 0]], loop: false },
				seed:    { frames: [[8, 0]], loop: false },
				sprout:  { frames: [[9, 0], [10, 0]], loop: true },
				growing: { frames: [[11, 0], [12, 0]], loop: true },
				mature:  { frames: [[0, 0]], loop: true }
			}
		}
	},

	// ── Moving objects ────────────────────────────────────────────────────────

	BALL: {
		category: 'moving',
		variants: ['red_ball', 'blue_ball'],
		renderType: 'sprite',
		walkable: true,
		draggable: true,
		renderPriority: 2,
		speed: 5,
		friction: 0.94,
		settleFriction: 0.82,
		stopThreshold: 0.18,
		settleThreshold: 1.2,
		minAnimationSpeed: 0.2,
		minAnimationFrameDelay: 45,
		maxAnimationFrameDelay: 120,
		triggerRadius: 96,
		pushForce: 6,
		debug: false,
		animation: 'sway',
		spriteConfig: {
			spriteSheet: {
				url: 'images/MapObjects/ball.gif',
				size: { width: 384, height: 256 }
			},
			animations: {
				idle:           { frames: [[0, 0]], loop: true },
				rotateX:        { frames: [[0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1]], loop: true },
				rotateY:        { frames: [[0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [5, 2]], loop: true },
				rotateZ:        { frames: [[0, 3], [1, 3], [2, 3], [3, 3], [4, 3], [5, 3]], loop: true },
				rotateX_reverse: { frames: [[5, 1], [4, 1], [3, 1], [2, 1], [1, 1], [0, 1]], loop: true },
				rotateY_reverse: { frames: [[5, 2], [4, 2], [3, 2], [2, 2], [1, 2], [0, 2]], loop: true },
				rotateZ_reverse: { frames: [[5, 3], [4, 3], [3, 3], [2, 3], [1, 3], [0, 3]], loop: true }
			},
			default: 'idle'
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
				S:         { frames: [[0, 0], [1, 0], [2, 0], [3, 0]], loop: true },
				N:         { frames: [[0, 1], [1, 1], [2, 1], [3, 1]], loop: true },
				E:         { frames: [[0, 2], [1, 2], [2, 2], [3, 2]], loop: true },
				W:         { frames: [[0, 3], [1, 3], [2, 3], [3, 3]], loop: true },
				idle:      { frames: [[0, 4], [1, 4]], loop: true },
				alert:     { frames: [[0, 5], [1, 5], [2, 5]], loop: false },
				pursuit_S: { frames: [[0, 6], [1, 6], [2, 6], [3, 6]], loop: true },
				pursuit_N: { frames: [[0, 7], [1, 7], [2, 7], [3, 7]], loop: true },
				pursuit_E: { frames: [[0, 8], [1, 8], [2, 8], [3, 8]], loop: true },
				pursuit_W: { frames: [[0, 9], [1, 9], [2, 9], [3, 9]], loop: true }
			}
		}
	},

	// ── NPC entity (A* pathfinding, aggro AI) ────────────────────────────────────

	NPC: {
		category: 'moving',
		variants: ['slime', 'ghost', 'goblin'],
		renderType: 'animated',
		collision: false,   // does not block other objects
		renderPriority: 2,
		speed: 1.5,
		aggroRadius: 220,
		chaseRadius: 450,
		alertDuration: 800,
		pathRefreshInterval: 900,
		wanderRadius: 120,
		wanderInterval: 3500,
		pathWaypointThreshold: 20,
		capabilities: {
			can_open_doors: false,
			can_wade: false,
			can_swim: false,
			follows_paths: true,
			fire_resistance: false
		},
		size: { width: 64, height: 64 },
		spriteConfig: {
			spriteSheet: {
				url: 'images/MapObjects/npc_slime.gif',
				size: { width: 256, height: 128 }
			},
			animations: {
				idle: { frames: [[0, 0], [1, 0]], loop: true },
				S:    { frames: [[0, 0], [1, 0], [2, 0], [3, 0]], loop: true },
				N:    { frames: [[0, 1], [1, 1], [2, 1], [3, 1]], loop: true },
				E:    { frames: [[0, 0], [1, 0], [2, 0], [3, 0]], loop: true },
				W:    { frames: [[0, 1], [1, 1], [2, 1], [3, 1]], loop: true }
			},
			default: 'idle'
		},
		variantConfigs: {
			ghost: {
				speed: 2,
				aggroRadius: 300,
				capabilities: { can_swim: true, can_wade: true }
			},
			goblin: {
				speed: 2.5,
				capabilities: { can_open_doors: true, can_wade: true }
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
		bobAmplitude: 10,
		bobFrequency: 0.05,
		flutterChance: 0.01,
		idleChance: 0.001,
		hoverHeight: 18,
		hoverVariance: 8,
		flowerSeekChance: 0.003,
		flowerSearchRadius: 320,
		flowerRestDurationMin: 2200,
		flowerRestDurationMax: 5200,
		size: { width: 100, height: 100 },
		collider: { width: 24, height: 14, offsetX: 38, offsetY: 72 },
		shadow: {
			enabled: true,
			widthRatio: 0.28,
			heightRatio: 0.1,
			anchorX: 0.5,
			anchorY: 0.88,
			maxOpacity: 0.24,
			minOpacity: 0.08,
			minScale: 0.7,
			blur: 2
		},
		spriteConfig: {
			spriteSheet: {
				url: 'images/MapObjects/butterfly.gif',
				size: { width: 500, height: 400 }
			},
			animations: {
				E:       { frames: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]], loop: true },
				W:       { frames: [[0, 1], [1, 1], [2, 1], [3, 1], [4, 1]], loop: true },
				N:       { frames: [[0, 2], [1, 2], [2, 2], [3, 2], [4, 2]], loop: true },
				S:       { frames: [[0, 3], [1, 3], [2, 3], [3, 3], [4, 3]], loop: true },
				idle:    { frames: [[1, 3]], loop: true },
				flutter: { frames: [[2, 3], [1, 3], [0, 3], [1, 3]], loop: true }
			},
			default: 'idle'
		},
		variantConfigs: {
			small: {
				size: { width: 50, height: 50 },
				bobAmplitude: 7,
				bobFrequency: 0.07,
				speed: 1.2,
				hoverHeight: 12,
				hoverVariance: 5,
				collider: { width: 14, height: 8, offsetX: 18, offsetY: 36 },
				spriteConfig: {
					spriteSheet: {
						url: 'images/MapObjects/butterfly_small.gif',
						size: { width: 250, height: 200 }
					}
				}
			}
		}
	},

	// ── Directional structures ────────────────────────────────────────────────

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
		soundEffects: {
			open: 'obj_door_open',
			close: 'obj_door_close'
		},
		spriteConfig: {
			default: 'closed',
			spriteSheet: {
				url: 'images/MapObjects/door.png',
				size: { width: 800, height: 256 },
				frameSize: {
					width: 32 * 5,
					height: 32 * 8,
					offsetX: 32 * 4,
					offsetY: 32 * 5
				}
			},
			animations: {
				closed:  { frames: [[0, 0]], loop: false },
				opening: { frames: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]], loop: false },
				open:    { frames: [[4, 0]], loop: true },
				closing: { frames: [[4, 0], [3, 0], [2, 0], [1, 0], [0, 0]], loop: false }
			}
		},
		directionConfigs: {
			E: {
				size: { width: 32, height: 96 },
				collider: { width: 32, height: 96, offsetX: 0, offsetY: 0 },
				interactiveCollider: { width: 64, height: 128, offsetX: -32, offsetY: -16 },
				transformStyle: ''
			},
			W: {
				size: { width: 32, height: 96 },
				collider: { width: 32, height: 96, offsetX: 0, offsetY: 0 },
				interactiveCollider: { width: 64, height: 128, offsetX: 0, offsetY: -16 },
				transformStyle: 'scaleX(-1)',
				spriteFrameOffset: { offsetX: 0, offsetY: 160 }
			},
			S: {
				size: { width: 96, height: 32 },
				collider: { width: 96, height: 32, offsetX: 0, offsetY: 0 },
				interactiveCollider: { width: 128, height: 64, offsetX: -16, offsetY: -32 },
				transformStyle: 'rotate(90deg)'
			},
			N: {
				size: { width: 96, height: 32 },
				collider: { width: 96, height: 32, offsetX: 0, offsetY: 0 },
				interactiveCollider: { width: 128, height: 64, offsetX: -16, offsetY: 0 },
				transformStyle: 'rotate(-90deg)'
			},
			Horizontal: 'S',
			Vertical: 'E',
			Right: 'E',
			Left: 'W',
			Up: 'N',
			Down: 'S'
		},
		variantConfigs: {
			wooden_door: {},
			metal_door: {
				spriteConfig: {
					spriteSheet: { url: 'images/MapObjects/metal_door.png' }
				}
			}
		}
	},

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
		spriteConfig: {
			spriteSheet: {
				url: 'images/MapObjects/bed_default.png',
				size: { width: 128, height: 256 }
			}
		},
		directionConfigs: {
			S: {
				size: { width: 128, height: 256 },
				collider: { width: 112, height: 240, offsetX: 8, offsetY: 8 },
				interactiveCollider: { width: 192, height: 64, offsetX: -32, offsetY: 256 },
				transformStyle: '',
				mytePosition: { xFactor: 0.5, yFactor: 0.75 },
				myteFacing: 'S'
			},
			N: {
				size: { width: 128, height: 256 },
				collider: { width: 112, height: 240, offsetX: 8, offsetY: 8 },
				interactiveCollider: { width: 192, height: 64, offsetX: -32, offsetY: -64 },
				transformStyle: 'scaleY(-1)',
				mytePosition: { xFactor: 0.5, yFactor: 0.25 },
				myteFacing: 'N'
			},
			E: {
				size: { width: 256, height: 128 },
				collider: { width: 240, height: 112, offsetX: 8, offsetY: 8 },
				interactiveCollider: { width: 64, height: 192, offsetX: 256, offsetY: -32 },
				transformStyle: 'rotate(90deg)',
				mytePosition: { xFactor: 0.75, yFactor: 0.5 },
				myteFacing: 'E'
			},
			W: {
				size: { width: 256, height: 128 },
				collider: { width: 240, height: 112, offsetX: 8, offsetY: 8 },
				interactiveCollider: { width: 64, height: 192, offsetX: -64, offsetY: -32 },
				transformStyle: 'rotate(-90deg)',
				mytePosition: { xFactor: 0.25, yFactor: 0.5 },
				myteFacing: 'W'
			}
		},
		variantConfigs: {
			bed: {},
			large_bed: {
				size: { width: 192, height: 256 },
				directionConfigs: {
					E: { size: { width: 256, height: 192 } },
					W: { size: { width: 256, height: 192 } }
				}
			},
			bunk_bed: {
				spriteConfig: {
					spriteSheet: { url: 'images/MapObjects/bunk_bed.png' }
				}
			}
		}
	},

	// ── Travel ────────────────────────────────────────────────────────────────

	PORTAL: {
		category: 'interactive',
		variants: ['blue_portal', 'red_portal', 'ancient_portal', 'magic_circle'],
		renderType: 'sprite',
		collision: false,
		walkable: true,
		renderPriority: 2,
		interactionType: 'teleport',
		interactionOnly: true,
		interactionRadius: 150,
		canToggle: true,
		default: 'active',
		particleEffects: true,
		lightEmission: true,
		canInspect: false,
		size: { width: 128, height: 128 },
		collider: { width: 64, height: 64, offsetX: 32, offsetY: 32 },
		interactiveCollider: { width: 196, height: 196, offsetX: -32, offsetY: -32 },
		spriteConfig: {
			default: 'idle',
			spriteSheet: {
				url: 'images/MapObjects/portal.png',
				size: { width: 1024, height: 512 }
			},
			animations: {
				idle:       { frames: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [7, 0]], loop: true,  frameRate: 10 },
				activate:   { frames: [[0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1]], loop: false, frameRate: 15 },
				active:     { frames: [[0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [7, 2]], loop: true,  frameRate: 12 },
				deactivate: { frames: [[0, 3], [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [7, 3]], loop: false, frameRate: 15 }
			}
		},
		particleConfig: {
			particleEffect: 'GLOW',
			orbitalMotion: true,
			orbitalSpeed: 0.02,
			pulseEffect: true,
			pulseFrequency: 0.05
		},
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
				size: { width: 192, height: 192 },
				particleEffect: 'SPARKLE_SPRITE',
				particleStartColor: '#9932CC',
				particleEndColor: '#4B0082',
				spriteConfig: { url: 'images/MapObjects/magic_circle.png' }
			}
		}
	},

	// ── Structures ────────────────────────────────────────────────────────────

	FENCE: {
		category: 'structure',
		variants: ['wooden_fence', 'stone_fence', 'iron_fence', 'garden_fence'],
		renderType: 'sprite',
		collision: true,
		renderPriority: 2,
		walkable: false,
		interactive: false,
		size: { width: 64, height: 32 },
		collider: { width: 64, height: 16, offsetX: 0, offsetY: 0 },
		directionConfigs: {
			E: {
				size: { width: 64, height: 32 },
				collider: { width: 64, height: 16, offsetX: 0, offsetY: 8 },
				transformStyle: ''
			},
			N: {
				size: { width: 32, height: 64 },
				collider: { width: 16, height: 64, offsetX: 8, offsetY: 0 },
				transformStyle: 'rotate(-90deg)'
			},
			NE: {
				size: { width: 32, height: 32 },
				collider: { width: 24, height: 24, offsetX: 4, offsetY: 4 },
				transformStyle: ''
			},
			NW: {
				size: { width: 32, height: 32 },
				collider: { width: 24, height: 24, offsetX: 4, offsetY: 4 },
				transformStyle: 'scaleX(-1)'
			},
			SE: {
				size: { width: 32, height: 32 },
				collider: { width: 24, height: 24, offsetX: 4, offsetY: 4 },
				transformStyle: 'scaleY(-1)'
			},
			SW: {
				size: { width: 32, height: 32 },
				collider: { width: 24, height: 24, offsetX: 4, offsetY: 4 },
				transformStyle: 'rotate(180deg)'
			},
			Horizontal: 'E',
			Vertical: 'N'
		},
		spriteConfig: {
			spriteSheet: {
				url: 'images/MapObjects/fence_wooden.png',
				size: { width: 192, height: 256 }
			}
		},
		variantConfigs: {
			wooden_fence: {},
			stone_fence: {
				spriteConfig: { spriteSheet: { url: 'images/MapObjects/fence_stone.png' } }
			},
			iron_fence: {
				spriteConfig: { spriteSheet: { url: 'images/MapObjects/fence_iron.png' } }
			},
			garden_fence: {
				spriteConfig: { spriteSheet: { url: 'images/MapObjects/fence_garden.png' } },
				size: { width: 64, height: 48 }
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
		size: { width: 64, height: 32 },
		soundEffects: {
			open: 'obj_gate_open',
			close: 'obj_gate_close'
		},
		directionConfigs: {
			E: {
				size: { width: 64, height: 32 },
				collider: { width: 64, height: 16, offsetX: 0, offsetY: 8 },
				interactiveCollider: { width: 96, height: 64, offsetX: -16, offsetY: -16 },
				transformStyle: ''
			},
			W: {
				size: { width: 64, height: 32 },
				collider: { width: 64, height: 16, offsetX: 0, offsetY: 8 },
				interactiveCollider: { width: 96, height: 64, offsetX: -16, offsetY: -16 },
				transformStyle: 'scaleX(-1)'
			},
			N: {
				size: { width: 32, height: 64 },
				collider: { width: 16, height: 64, offsetX: 8, offsetY: 0 },
				interactiveCollider: { width: 64, height: 96, offsetX: -16, offsetY: -16 },
				transformStyle: 'rotate(-90deg)'
			},
			S: {
				size: { width: 32, height: 64 },
				collider: { width: 16, height: 64, offsetX: 8, offsetY: 0 },
				interactiveCollider: { width: 64, height: 96, offsetX: -16, offsetY: -16 },
				transformStyle: 'rotate(90deg)'
			},
			Horizontal: 'E',
			Vertical: 'N'
		},
		spriteConfig: {
			default: 'closed',
			spriteSheet: {
				url: 'images/MapObjects/gate_wooden.png',
				size: { width: 320, height: 128 }
			},
			animations: {
				closed:  { frames: [[0, 0]], loop: false },
				opening: { frames: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]], loop: false },
				open:    { frames: [[4, 0]], loop: true },
				closing: { frames: [[4, 0], [3, 0], [2, 0], [1, 0], [0, 0]], loop: false }
			}
		},
		variantConfigs: {
			wooden_gate: {},
			stone_gate: {
				spriteConfig: { spriteSheet: { url: 'images/MapObjects/gate_stone.png' } }
			},
			iron_gate: {
				spriteConfig: { spriteSheet: { url: 'images/MapObjects/gate_iron.png' } }
			},
			garden_gate: {
				spriteConfig: { spriteSheet: { url: 'images/MapObjects/gate_garden.png' } },
				size: { width: 64, height: 48 }
			}
		}
	}

};
