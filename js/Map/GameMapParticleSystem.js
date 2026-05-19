const PARTICLE_CONFIG = {
	// Base configurations for different effect types
	SPARKLE: {
	  type: 'sparkle',
	  interval: 200,
	  colors: ['#ffffff', '#ffff99'],
	  size: 5,
	  sizeEnd: 1,
	  life: 50,
	  opacity: 0.9,
	  opacityEnd: 0,
	  count: 1,
	  randomizePosition: true,
	  randomizeFactor: 15,
	  speed: 0.8,
	  gravity: -0.01,
	  friction: 0.95
	},
	
	SPARKLE_SPRITE: {
	  type: 'sparkle',
	  useSprite: true,
	  sprite: 'images/particles/sparkle_2.gif',
	  spriteFrames: [
		[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [7, 0], [8, 0], [9,0]
	  ],
	  size: 16,
	  sizeEnd: 16,
	  life: 40,
	  count: 1,
	  interval: 300,
	  frameDelay: 3
	},
	
	TRAIL: {
	  type: 'trail',
	  interval: 50,
	  colors: ['#ffcc00', '#ff9900', '#ff6600'],
	  size: 8,
	  sizeEnd: 2,
	  life: 30,
	  count: 2,
	  emitWhenMoving: true,
	  movementThreshold: 0.2
	},
	
	DUST: {
	  type: 'dust',
	  interval: 100,
	  colors: ['#e0e0e0', '#d0d0d0', '#c0c0c0'],
	  size: 5,
	  sizeEnd: 8,
	  life: 40,
	  count: 2,
	  gravity: -0.01,
	  friction: 0.99,
	  emitWhenMoving: true,
	  movementThreshold: 0.5,
	  randomizePosition: true,
	  randomizeFactor: 10
	},

	DUST_SPRITE: {
		type: 'dust',
		interval: 100,
		colors: ['#e0e0e0', '#d0d0d0', '#c0c0c0'],
		size: 5,
		sizeEnd: 8,
		life: 40,
		count: 2,
		gravity: -0.01,
		friction: 0.99,
		emitWhenMoving: true,
		movementThreshold: 0.5,
		randomizePosition: true,
		randomizeFactor: 10,

		useSprite: true,
		sprite: 'images/particles/dust-spritesheet.png',
		spriteFrames: [
		  [0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [7, 0]
		],
		size: 32,
		sizeEnd: 32,

	  },

	  LANDING_DUST: {
		type: 'dust',
		useSprite: true,
		sprite: 'images/particles/dust-spritesheet.png',
		spriteFrames: [
		  [0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [7, 0]
		],
		size: 32,
		sizeEnd: 32,
		count: 16,          // More particles for impact
		life: 40,          // How long particles last
		emitWhenMoving: false,  // Important! Don't trail
		// randomizePosition: true,
		randomizeFactor: 15,    // Spread particles more
		positionAtFeet: true,   // Position at feet
	  },
	
	EMOTION: {
	  type: 'emotion',
	  interval: 500,
	  count: 1,
	  colors: ['#ff5555'],
	  size: 15,
	  sizeEnd: 8,
	  life: 80,
	  offsetY: -30,
	  gravity: -0.05
	},
	
	AURA: {
	  type: 'aura',
	  interval: 100,
	  colors: ['#7788ff', '#aabbff'],
	  size: 10,
	  sizeEnd: 5,
	  life: 40,
	  opacity: 0.6,
	  spread: 20,
	  randomizePosition: true,
	  randomizeFactor: 15
	},
	
	GLOW: {
	  type: 'glow',
	  interval: 100,
	  colors: ['#ffffcc', '#ffff88', '#ffff44'],
	  size: 8,
	  sizeEnd: 4,
	  life: 60,
	  opacity: 0.5,
	  randomizeFactor: 20,
	  orbitalMotion: true,
	  orbitalSpeed: 0.02,
	  pulseEffect: true,
	  pulseFrequency: 0.05,
	  gravity: 0,
	  friction: 1.0
	},
	
	SLIME: {
	  type: 'slime',
	  interval: 80,
	  colors: ['#a0e8c8', '#80d0b0'],
	  size: 3,
	  sizeEnd: 4,
	  opacity: 0.7,
	  opacityEnd: 0.1,
	  life: 60,
	  count: 1,
	  friction: 0.999,
	  emitWhenMoving: true,
	  movementThreshold: 0.1
	},
	
	RAIN: {
	  type: 'rain',
	  interval: 100,
	  colors: ['#a0c8ff'],
	  size: 3,
	  sizeEnd: 2,
	  life: 100,
	  count: 10,
	  gravity: 0.1,
	  windSpeed: -1,
	  speed: 10
	},
	
	SNOW: {
	  type: 'snow',
	  interval: 200,
	  colors: ['#ffffff'],
	  size: 4,
	  life: 500,
	  count: 10,
	  gravity: 0.05,
	  speed: 1,
	  accumulate: false
	},
	
	FIREWORK: {
	  type: 'firework',
	  interval: 1000,
	  colors: ['#ffcc00'],
	  explosionColors: [
		'#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff', '#ffffff'
	  ],
	  size: 4,
	  life: 100,
	  particleCount: 100,
	  gravity: 0.05
	},
	
	SMOKE: {
	  type: 'smoke',
	  interval: 200,
	  colors: ['#bbbbbb', '#aaaaaa', '#999999'],
	  size: 15,
	  sizeEnd: 40,
	  life: 100,
	  count: 1,
	  gravity: -0.05
	},

		
	SMOKE_SPRITE: {
		type: 'smoke',
		interval: 200,
		colors: ['#bbbbbb', '#aaaaaa', '#999999'],
		size: 15,
		sizeEnd: 40,
		life: 100,
		count: 1,
		gravity: -0.05,

		useSprite: true,
		sprite: 'images/particles/smoke-spritesheet.png',
		spriteFrames: [
			[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [7, 0]
		],
		size: 64,
		sizeEnd: 64,



	  },


	
	SWARM: {
	  type: 'swarm',
	  interval: 300,
	  colors: ['#eeee22', '#ddcc11'],
	  size: 3,
	  sizeEnd: 2,
	  life: 500,
	  count: 20
	}
  };

class GameMapParticleSystem extends ParticleSystem {
	constructor(map) {
		super(map);
		this.map = map;
		this.objectEffects = new Map(); // Store effects by object ID
	}

	// Generic method to create object tracker for any type of object
	createObjectTracker(object, options = {}) {

		// Create a definite variable to reference
		const trackerOptions = JSON.parse(JSON.stringify(options));

		
		const tracker = {
			x: object.posX + (object.size?.width || 0) / 2,
			y: object.posY + (object.size?.height || 0) / 2,
			lastX: object.posX + (object.size?.width || 0) / 2,
			lastY: object.posY + (object.size?.height || 0) / 2,
			// Store options directly on the tracker object
			_options: trackerOptions,
			
			update: function() {
				if (!object) return;
				

				this.lastX = this.x;
				this.lastY = this.y;
				
				// Position at center of object by default
				this.x = object.posX + (object.size?.width || 0) / 2;
				this.y = object.posY + (object.size?.height || 0) / 2;
				
				// Apply any offsets
				if (this._options.offsetX) this.x += this._options.offsetX;
				if (this._options.offsetY) this.y += this._options.offsetY;
				
				// Position at feet if specified
				if (this._options.positionAtFeet) {
					console.log('Positioning at feet:', object.posY, object.size?.height);
					this.y = object.posY + (object.collider?.height + object.collider?.offsetY || 0);
				}
				
				// Add randomization if specified
				if (this._options.randomizePosition) {
					const randomFactor = this._options.randomizeFactor || 10;
					this.x += (Math.random() - 0.5) * randomFactor;
					this.y += (Math.random() - 0.5) * randomFactor;
				}
			}
		};
		
		return tracker;
	}

	// Directional tracker for objects with direction and movement properties
	createDirectionalTracker(object, options = {}) {
		// For collider-aware positioning
		let defaultOffsets;

		// If the object has a collider, create intelligent default offsets
		if (object.collider) {
			defaultOffsets = {
				// North (moving up): Position at bottom center of collider
				[DIRECTION.NORTH]: {
					x: object.collider.offsetX + object.collider.width / 2,
					y: object.collider.offsetY + object.collider.height
				},

				// South (moving down): Position at top center of collider
				[DIRECTION.SOUTH]: {
					x: object.collider.offsetX + object.collider.width / 2,
					y: object.collider.offsetY
				},

				// East (moving right): Position at center left of collider
				[DIRECTION.EAST]: {
					x: object.collider.offsetX,
					y: object.collider.offsetY + object.collider.height / 2
				},

				// West (moving left): Position at center right of collider
				[DIRECTION.WEST]: {
					x: object.collider.offsetX + object.collider.width,
					y: object.collider.offsetY + object.collider.height / 2
				},

				// Default offset (centered at bottom of collider)
				default: {
					x: object.collider.offsetX + object.collider.width / 2,
					y: object.collider.offsetY + object.collider.height
				}
			};
		} else {
			// Simple default offsets for objects without colliders
			defaultOffsets = {
				[DIRECTION.NORTH]: { x: 0, y: 0 },
				[DIRECTION.SOUTH]: { x: 0, y: 0 },
				[DIRECTION.EAST]: { x: 0, y: 0 },
				[DIRECTION.WEST]: { x: 0, y: 0 },
				default: { x: 0, y: 0 }
			};
		}

		// Get directional offsets based on options or use defaults
		const offsets = options.offsets || defaultOffsets;

		return {
			x: object.posX,
			y: object.posY,
			lastX: object.posX,
			lastY: object.posY,
			// This gets called by the emitter during updates
			update: function () {
				if (!object) return;

				this.lastX = this.x;
				this.lastY = this.y;

				// Get current offset based on direction
				const offset = offsets[object.direction] || offsets.default;

				// Base position - at the object's position (not centered)
				this.x = object.posX;
				this.y = object.posY;

				// Apply directional offset if moving
				const isStationary = object.isMoving ? !object.isMoving() : false;

				if (!isStationary) {
					this.x += offset.x;
					this.y += offset.y;
				} else if (options.stationaryOffset) {
					// Apply stationary offset if defined
					this.x += options.stationaryOffset.x;
					this.y += options.stationaryOffset.y;
				} else {
					// Apply default offset when stationary
					this.x += offsets.default.x;
					this.y += offsets.default.y;
				}

				// Apply any additional custom offsets from options
				if (options.additionalOffset) {
					this.x += options.additionalOffset.x;
					this.y += options.additionalOffset.y;
				}

				// Add randomization if specified
				if (options.randomizePosition) {
					const randomFactor = options.randomizeFactor || 10;
					this.x += (Math.random() - 0.5) * randomFactor;
					this.y += (Math.random() - 0.5) * randomFactor;
				}
			}
		};
	}

	// Main method to create particle effects for any object using the configuration
	addEffect(object, effectType, customOptions = {}) {
		// Skip if no valid object
		if (!object || typeof object.posX === 'undefined' || typeof object.posY === 'undefined') {
			console.warn('Cannot attach particles: Invalid object');
			return null;
		}


		// Auto-generate an ID if the object doesn't have one
		const objectId = object.id || ('obj_' + Math.random().toString(36).substr(2, 9));

		// Look up the effect config by name in PARTICLE_CONFIG
		let baseConfig = null;

		if (typeof effectType === 'string') {
			// Try direct lookup in PARTICLE_CONFIG 
			baseConfig = PARTICLE_CONFIG[effectType];

			if (!baseConfig) {
				// Try finding by type match (lowercase comparison)
				const matchingConfig = Object.values(PARTICLE_CONFIG).find(config =>
					config.type === effectType.toLowerCase()
				);

				if (matchingConfig) {
					baseConfig = matchingConfig;
				}
			}
		} else if (typeof effectType === 'object') {
			// If it's an object, use it directly as the config
			baseConfig = effectType;
			effectType = baseConfig.type || 'custom';
		}

		// If still no valid config, create a minimal default
		if (!baseConfig) {
			baseConfig = {
				type: (typeof effectType === 'string') ? effectType.toLowerCase() : 'custom',
				interval: 100,
				life: 50,
				colors: ['#ffffff'],
				size: 5,
				sizeEnd: 1,
				count: 1
			};
		}

		// Get the actual effect type from the config
		const actualEffectType = baseConfig.type || 'custom';

		// Remove any existing effect of this type if it exists
		this.detachEffectFromObject(object, objectId, actualEffectType);

		// Merge the base config with custom options
		const mergedOptions = { ...baseConfig, ...customOptions };



		// Create a position tracker for this object
		const tracker = this.createObjectTracker(object, mergedOptions);


		// Create the emitter based on the configuration
		const emitter = this.createConfiguredEmitter(tracker, actualEffectType, mergedOptions);

		// Store reference to this effect in our tracking Map
		if (!this.objectEffects.has(objectId)) {
			this.objectEffects.set(objectId, new Map());
		}
		this.objectEffects.get(objectId).set(actualEffectType, emitter);

		// Also store on the object if requested
		if (mergedOptions.storeReference) {
			if (!object.particleEmitters) {
				object.particleEmitters = {};
			}
			object.particleEmitters[actualEffectType] = emitter;
		}

		return emitter;
	}

	// Create an emitter based on the provided configuration
	createConfiguredEmitter(tracker, effectType, options) {
		// Define the base emitter structure
		const emitter = {
			type: effectType,
			options: options,
			active: true,
			x: tracker.x,
			y: tracker.y,
			interval: options.interval || 100,
			lastEmit: 0,
			particles: [],
			lastX: tracker.x,
			lastY: tracker.y
		};

		// Add appropriate update behavior based on effect type
		if (effectType === 'glow') {
			this.addGlowBehavior(emitter, tracker, options);
		}
		else if (effectType === 'trail' || effectType === 'dust') {
			this.addMovementBasedBehavior(emitter, tracker, options);
		}
		else {
			this.addStandardBehavior(emitter, tracker, options);
		}

		// Add to emitters array
		this.emitters.push(emitter);

		return emitter;
	}

	// Add standard particle emission behavior
	addStandardBehavior(emitter, tracker, options) {
		emitter.update = (now) => {
			// Update position from tracker
			tracker.update();
			emitter.x = tracker.x;
			emitter.y = tracker.y;

			// Time to emit?
			if (now - emitter.lastEmit >= emitter.interval) {
				emitter.lastEmit = now;

				// Create particles
				for (let i = 0; i < options.count; i++) {
					const color = options.colors && options.colors.length > 0
						? options.colors[Math.floor(Math.random() * options.colors.length)]
						: '#ffffff';
					const angle = Math.random() * Math.PI * 2;
					const speed = options.speed || 0.5;

					// Create with sprite if specified
					if (options.useSprite && options.sprite) {
						this.addParticle({
							x: emitter.x,
							y: emitter.y,
							vx: Math.cos(angle) * speed,
							vy: Math.sin(angle) * speed,
							size: options.size,
							sizeEnd: options.sizeEnd,
							opacity: options.opacity || 0.8,
							opacityEnd: options.opacityEnd || 0,
							life: options.life + Math.random() * 20,
							sprite: options.sprite,
							spriteFrames: options.spriteFrames,
							frameDelay: options.frameDelay || 5,
							gravity: options.gravity || 0,
							friction: options.friction || 0.98,
							loop: options.loop || true
						});

					} else {
						// Standard colored particle
						this.addParticle({
							x: emitter.x,
							y: emitter.y,
							vx: Math.cos(angle) * speed,
							vy: Math.sin(angle) * speed,
							size: options.size * (0.8 + Math.random() * 0.4),
							sizeEnd: options.sizeEnd,
							color: color,
							opacity: options.opacity || 0.8,
							opacityEnd: options.opacityEnd || 0,
							life: options.life + Math.random() * 20,
							rotationSpeed: (Math.random() - 0.5) * 0.5,
							gravity: options.gravity || 0,
							friction: options.friction || 0.98
						});
					}
				}
			}
		};
	}

	// For effects that depend on object movement (dust, trails)
	addMovementBasedBehavior(emitter, tracker, options) {
		emitter.update = (now) => {
			// Update position from tracker
			tracker.update();
			
			// Calculate movement distance
			const dx = tracker.x - tracker.lastX;
			const dy = tracker.y - tracker.lastY;
			const distance = Math.sqrt(dx * dx + dy * dy);
	
			// Update emitter position
			emitter.x = tracker.x;
			emitter.y = tracker.y;
	
			// Check if we should emit particles
			const shouldEmit = !options.emitWhenMoving || 
							  distance > (options.movementThreshold || 0.5);
	
			// For one-time emission, only emit once then deactivate
			if (options.oneTimeEmission && !emitter.hasEmitted) {
				// Force emission regardless of movement
				if (now - emitter.lastEmit >= emitter.interval) {
					emitter.lastEmit = now;
					
					// Create particles (same as original code)
					for (let i = 0; i < options.count; i++) {
						const color = options.colors && options.colors.length > 0 
							? options.colors[Math.floor(Math.random() * options.colors.length)] 
							: '#ffffff';
						
						// Create particle with same properties as before
						this.addParticle({
							x: emitter.x + (Math.random() - 0.5) * (options.randomizeFactor || 10),
							y: emitter.y + (Math.random() - 0.5) * (options.randomizeFactor || 10),
							vx: (Math.random() - 0.5) * 0.5,
							vy: (Math.random() - 0.5) * 0.3 - 0.2,
							size: options.size + (Math.random() - 0.5) * 2,
							sizeEnd: options.sizeEnd + (Math.random() - 0.5) * 2,
							color: color,
							opacity: options.opacity || 0.7,
							opacityEnd: options.opacityEnd || 0,
							life: options.life + (Math.random() - 0.5) * 10,
							rotationSpeed: (Math.random() - 0.5) * 0.2,
							gravity: options.gravity || 0,
							friction: options.friction || 0.98,
							sprite: options.sprite,
							spriteFrames: options.spriteFrames,
							frameDelay: options.frameDelay,
							loop: options.loop
						});

					}
					
					// Mark as emitted and deactivate for one-time emissions
					emitter.hasEmitted = true;
					
					// Delay deactivation slightly to ensure particles are processed
					setTimeout(() => {
						emitter.active = false;
					}, 100);
				}
			} 
			// Regular emission for continuous emitters (original behavior)
			else if (shouldEmit && now - emitter.lastEmit >= emitter.interval) {
				// Original emission code here...
			}
	
			// Update last position
			tracker.lastX = tracker.x;
			tracker.lastY = tracker.y;
		};
	}

	// For glow effect with orbital behavior
	addGlowBehavior(emitter, tracker, options) {
		emitter.orbPhase = 0;
		emitter.pulsePhase = 0;

		emitter.update = (now) => {
			// Update position from tracker
			tracker.update();
			emitter.x = tracker.x;
			emitter.y = tracker.y;

			// Update orbital and pulse phases
			emitter.orbPhase += options.orbitalSpeed || 0.02;
			emitter.pulsePhase += options.pulseFrequency || 0.05;

			// Time to emit?
			if (now - emitter.lastEmit >= emitter.interval) {
				emitter.lastEmit = now;

				// Create particles with orbital behavior
				for (let i = 0; i < options.count; i++) {
					const color = options.colors[Math.floor(Math.random() * options.colors.length)];
					const angle = Math.random() * Math.PI * 2;
					const distance = 20 * (0.8 + Math.random() * 0.4);  // Default size if object size unavailable

					// Calculate initial position based on orbit
					const px = emitter.x + Math.cos(angle) * distance;
					const py = emitter.y + Math.sin(angle) * distance;

					const particle = this.addParticle({
						x: px,
						y: py,
						vx: 0,
						vy: 0,
						size: options.size * (0.8 + Math.random() * 0.4),
						sizeEnd: options.sizeEnd,
						color: color,
						opacity: options.opacity || 0.5,
						opacityEnd: options.opacityEnd || 0,
						life: options.life + Math.random() * 20,
						rotationSpeed: (Math.random() - 0.5) * 0.2,
						gravity: 0,
						friction: 1.0
					});

					// Add orbital behavior to particle
					if (options.orbitalMotion) {
						// Store orbital info for this particle
						particle.orbitData = {
							center: { x: emitter.x, y: emitter.y },
							angle: angle,
							distance: distance,
							speed: 0.01 + Math.random() * 0.02,
							pulseAmount: 0.2 + Math.random() * 0.3
						};

						// Override particle update to add orbital motion
						const originalUpdate = particle.update;
						particle.update = function () {
							// Call original update first
							const active = originalUpdate.call(this);
							if (!active) return false;

							// Update the center position as object moves
							this.orbitData.center.x = tracker.x;
							this.orbitData.center.y = tracker.y;

							// Apply orbital motion
							this.orbitData.angle += this.orbitData.speed;
							this.x = this.orbitData.center.x + Math.cos(this.orbitData.angle) * this.orbitData.distance;
							this.y = this.orbitData.center.y + Math.sin(this.orbitData.angle) * this.orbitData.distance;

							// Apply pulse effect if enabled
							if (options.pulseEffect) {
								const pulseScale = 1 + Math.sin(emitter.pulsePhase) * this.orbitData.pulseAmount;
								this.size = (options.size + (options.sizeEnd - options.size) *
									(1 - this.life / this.lifeMax)) * pulseScale;
							}

							return true;
						};
					}
				}
			}
		};
	}

	// Helper method to detach effects from an object
	detachEffectFromObject(object, objectId, effectType) {
		// Detach from objectEffects tracking
		if (this.objectEffects.has(objectId)) {
			const effects = this.objectEffects.get(objectId);

			if (effectType && effects.has(effectType)) {
				// Deactivate the specific emitter
				const emitter = effects.get(effectType);
				emitter.active = false;
				effects.delete(effectType);
			} else if (!effectType) {
				// Deactivate all emitters for this object
				effects.forEach(emitter => emitter.active = false);
				this.objectEffects.delete(objectId);
			}
		}

		// Also clean up from object.particleEmitters if it exists
		if (object && object.particleEmitters) {
			if (effectType && object.particleEmitters[effectType]) {
				object.particleEmitters[effectType].active = false;
				delete object.particleEmitters[effectType];
			} else if (!effectType) {
				Object.values(object.particleEmitters).forEach(emitter => {
					if (emitter) emitter.active = false;
				});
				object.particleEmitters = {};
			}
		}
	}

	// Add methods to objects to make particle management easier
	addParticleMethodsToObject(object) {
		if (!object) return;

		// Initialize the particleEmitters property if it doesn't exist
		if (!object.particleEmitters) {
			object.particleEmitters = {};
		}

		// Add the main addEffect method
		object.addEffect = (effectType, options = {}) => {
			return this.addEffect(object, effectType, {
				...options,
				storeReference: true
			});
		};

		// Remove a specific effect
		object.removeEffect = (effectType) => {
			if (!object.particleEmitters || !object.particleEmitters[effectType]) return;

			object.particleEmitters[effectType].active = false;
			delete object.particleEmitters[effectType];
		};

		// Remove all effects
		object.removeAllEffects = () => {
			if (!object.particleEmitters) return;

			Object.values(object.particleEmitters).forEach(emitter => {
				if (emitter) emitter.active = false;
			});

			object.particleEmitters = {};
		};

		// Check if an effect exists
		object.hasEffect = (effectType) => {
			return object.particleEmitters &&
				object.particleEmitters[effectType] &&
				object.particleEmitters[effectType].active;
		};
	}

	// Override updateEmitters to handle custom emitters with update methods
	updateEmitters(now) {
		if (!this.emitters || this.emitters.length === 0) return;

		for (let i = this.emitters.length - 1; i >= 0; i--) {
			const emitter = this.emitters[i];
			if (!emitter.active) {
				this.emitters.splice(i, 1);
				continue;
			}

			// Call the custom update function for our emitters
			if (typeof emitter.update === 'function') {
				emitter.update(now);
			}
			// Use standard emitter update for base ParticleSystem emitters
			else if (now - emitter.lastEmit > emitter.interval) {
				emitter.lastEmit = now;

				// Update position if it's a moving target
				if (emitter.options && emitter.options.target &&
					typeof emitter.options.target.update === 'function') {
					emitter.options.target.update();
					emitter.x = emitter.options.target.x || 0;
					emitter.y = emitter.options.target.y || 0;
				}

				// Create particles based on emitter type
				switch (emitter.type) {
					case 'trail':
						this.addTrail(emitter.options.target, emitter.options);
						break;
					case 'rain':
						this.addRain(emitter.options);
						break;
					case 'snow':
						this.addSnow(emitter.options);
						break;
					case 'smoke':
						this.addSmoke(emitter.options.x, emitter.options.y, emitter.options);
						break;
					case 'butterfly':
						this.addButterfly(emitter.options.x, emitter.options.y, emitter.options);
						break;
					case 'firework':
						this.addFirework(emitter.options.x, emitter.options.y, emitter.options);
						break;
					case 'swarm':
						this.addSwarm(emitter.options.x, emitter.options.y, emitter.options);
						break;
				}
			}
		}
	}

	// Override the dispose method to clean up all effects
	dispose() {
		// Clear all object effects
		this.objectEffects.forEach(effects => {
			effects.forEach(emitter => emitter.active = false);
		});
		this.objectEffects.clear();

		// Call parent dispose method
		super.dispose();
	}
}