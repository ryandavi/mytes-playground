// Enhanced GameMapParticleSystem class to support directional particle emission
class GameMapParticleSystem extends ParticleSystem {
	constructor(map) {
		super(map);
		this.map = map;
		this.myteEffects = new Map(); // Store effects by Myte ID
	}

	// Create a position tracker that adapts based on Myte direction
	createMyteTracker(myte, options = {}) {
		// Get directional offsets based on options or use defaults
		const offsets = options.offsets || {
			[DIRECTION.NORTH]: { x: 0, y: 0 },   // Emit from behind when moving up
			[DIRECTION.SOUTH]: { x: 0, y: 0 },    // Emit from behind when moving down
			[DIRECTION.EAST]: { x: 0, y: 0 },    // Emit from behind when moving right
			[DIRECTION.WEST]: { x: 0, y: 0 },     // Emit from behind when moving left
			// Default offset used when no direction matches
			default: { x: 0, y: 0 }
		};

		// Add specific emission points for different sprites if needed
		return {
			x: myte.posX,
			y: myte.posY,
			// This gets called by the emitter during updates
			update: function () {
				if (!myte || typeof myte.posX !== 'number' || typeof myte.posY !== 'number') {
					return;
				}

				// Get the appropriate offsets based on species/sprite
				let directionOffsets = offsets;

				// Get current offset based on direction
				const offset = directionOffsets[myte.direction] || directionOffsets.default;

				// For stationary Mytes, you could use a different approach
				const isStationary = !myte.is_moving();

				// Base position - centered on the Myte
				this.x = myte.posX; // + (myte.size.width / 2);
				this.y = myte.posY; // + (myte.size.height / 2);

				// Apply directional offset if moving
				if (!isStationary) {
					this.x += offset.x;
					this.y += offset.y;
				} else if (options.stationaryOffset) {
					// Apply stationary offset if defined
					this.x += options.stationaryOffset.x;
					this.y += options.stationaryOffset.y;
				}

				// Apply any additional custom offsets from options
				if (options.additionalOffset) {
					this.x += options.additionalOffset.x;
					this.y += options.additionalOffset.y;
				}
			}
		};
	}

	// Add a new effect type to a Myte
	attachToMyte(myte, effectType = 'trail', options = {}) {
		if (!myte || !myte.id) {
			console.warn('Cannot attach particles: Invalid Myte object');
			return null;
		}

		// Remove any existing effects for this Myte + effect type
		this.detachFromMyte(myte, effectType);

		// Create a position tracker with all the options
		const tracker = this.createMyteTracker(myte, options);

		// Default options by effect type
		const defaultOptions = this.getDefaultOptionsForEffect(effectType);

		// Merge defaults with provided options
		const mergedOptions = { ...defaultOptions, ...options, target: tracker };

		// Create the emitter
		const emitter = this.createEmitter(effectType, mergedOptions);

		// Store reference to this effect
		if (!this.myteEffects.has(myte.id)) {
			this.myteEffects.set(myte.id, new Map());
		}
		this.myteEffects.get(myte.id).set(effectType, emitter);

		return emitter;
	}

	// Remove a specific effect from a Myte
	detachFromMyte(myte, effectType) {
		if (!myte || !myte.id) return;

		if (this.myteEffects.has(myte.id)) {
			const effects = this.myteEffects.get(myte.id);

			if (effectType && effects.has(effectType)) {
				// Deactivate the specific emitter
				const emitter = effects.get(effectType);
				emitter.active = false;
				effects.delete(effectType);
			} else if (!effectType) {
				// Deactivate all emitters for this Myte
				effects.forEach(emitter => emitter.active = false);
				this.myteEffects.delete(myte.id);
			}
		}
	}

	// Remove all effects from a Myte
	detachAllFromMyte(myte) {
		this.detachFromMyte(myte);
	}

	// Get default options for different effect types
	getDefaultOptionsForEffect(effectType) {
		switch (effectType) {
			case 'trail':
				return {
					interval: 50,
					colors: ['#ffcc00', '#ff9900'],
					size: 8,
					sizeEnd: 2,
					life: 30,
					fadeSpeed: 1
				};

			case 'dust':
				return {
					interval: 100,
					colors: ['#e0e0e0', '#d0d0d0', '#c0c0c0'],
					size: 5,
					sizeEnd: 8,
					opacity: 0.7,
					opacityEnd: 0,
					life: 40,
					fadeSpeed: 0.8,
					gravity: -0.01, // Very slight upward drift
					friction: 0.99
				};

			case 'emotion':
				return {
					interval: 500,
					count: 1,
					colors: ['#ff5555'],
					size: 15,
					life: 80,
					offsetY: -30 // Float above the Myte's head
				};

			case 'aura':
				return {
					interval: 100,
					colors: ['#7788ff', '#aabbff'],
					size: 10,
					sizeEnd: 5,
					life: 40,
					fadeSpeed: 0.8,
					spread: 20
				};

			case 'sparkle':
				return {
					interval: 200,
					colors: ['#ffffff', '#ffff99'],
					size: 5,
					sizeEnd: 1,
					life: 50,
					fadeSpeed: 1.2,
					spread: 15
				};

			default:
				return {};
		}
	}

	// Create dust trail emitter - emits only when moving
	createDustEmitter(myte, options = {}) {
		if (!myte || !myte.id) {
			console.warn('Cannot create dust emitter: Invalid Myte object');
			return null;
		}

		// Remove any existing dust effects for this Myte
		this.detachFromMyte(myte, 'dust');

		const defaultOptions = this.getDefaultOptionsForEffect('dust');
		const mergedOptions = { ...defaultOptions, ...options };

		const tracker = this.createMyteTracker(myte, {
			// Position dust at feet level
			offsets: {
				// North (moving up): Position at bottom center of collider
				[DIRECTION.NORTH]: { 
				  x: myte.collider.offsetX + myte.collider.width/2, 
				  y: myte.collider.offsetY + myte.collider.height 
				},
				
				// South (moving down): Position at top center of collider
				[DIRECTION.SOUTH]: { 
				  x: myte.collider.offsetX + myte.collider.width/2, 
				  y: myte.collider.offsetY 
				},
				
				// East (moving right): Position at center left of collider
				[DIRECTION.EAST]: { 
				  x: myte.collider.offsetX, 
				  y: myte.collider.offsetY + myte.collider.height/2
				},
				
				// West (moving left): Position at center right of collider
				[DIRECTION.WEST]: { 
				  x: myte.collider.offsetX + myte.collider.width, 
				  y: myte.collider.offsetY + myte.collider.height/2 
				},
				
				// Default offset (centered at bottom of collider)
				default: { 
				  x: myte.collider.offsetX + myte.collider.width/2, 
				  y: myte.collider.offsetY + myte.collider.height 
				}
			  },
			...options
		});

		// Create a custom emitter that only emits particles when the Myte is moving
		const emitter = {
			type: 'dust',
			options: mergedOptions,
			active: true,
			x: myte.posX,
			y: myte.posY,
			interval: mergedOptions.interval,
			lastEmit: 0,
			particles: [],
			lastX: myte.posX,
			lastY: myte.posY,
			update: (now) => {
				// Update position from tracker
				tracker.update();
				emitter.x = tracker.x;
				emitter.y = tracker.y;

				// Calculate movement distance
				const dx = emitter.x - emitter.lastX;
				const dy = emitter.y - emitter.lastY;
				const distance = Math.sqrt(dx * dx + dy * dy);

				// Only emit if the Myte has moved a minimum distance
				if (distance > 2 && now - emitter.lastEmit >= emitter.interval) {
					emitter.lastEmit = now;

					// Create dust particles at the current position
					for (let i = 0; i < (mergedOptions.count || 1); i++) {
						const dustColor = mergedOptions.colors[Math.floor(Math.random() * mergedOptions.colors.length)];

						const particle = this.addParticle({
							x: emitter.x + (Math.random() - 0.5) * 10,
							y: emitter.y + (Math.random() - 0.5) * 5,
							vx: (Math.random() - 0.5) * 0.5,
							vy: (Math.random() - 0.5) * 0.3 - 0.2,
							size: mergedOptions.size + (Math.random() - 0.5) * 2,
							sizeEnd: mergedOptions.sizeEnd + (Math.random() - 0.5) * 3,
							color: dustColor,
							opacity: mergedOptions.opacity,
							opacityEnd: 0,
							life: mergedOptions.life + (Math.random() - 0.5) * 10,
							rotationSpeed: (Math.random() - 0.5) * 0.2,
							gravity: mergedOptions.gravity,
							friction: mergedOptions.friction
						});

						emitter.particles.push(particle);
					}

					// Update the last position
					emitter.lastX = emitter.x;
					emitter.lastY = emitter.y;
				}
			}
		};

		// Store reference and return
		if (!this.myteEffects.has(myte.id)) {
			this.myteEffects.set(myte.id, new Map());
		}
		this.myteEffects.get(myte.id).set('dust', emitter);

		// Add to emitters array
		this.emitters.push(emitter);

		return emitter;
	}

	// Create a slime trail for snail Mytes
	createSlimeTrail(myte, options = {}) {
		return this.createDustEmitter(myte, {
			colors: ['#a0e8c8', '#80d0b0'],  // Greenish slime colors
			size: 3,
			sizeEnd: 4,
			opacity: 0.7,
			life: 60,                        // Stays longer
			friction: 0.999,                 // Barely moves once placed
			gravity: 0,                      // No drift upward
			count: 1,                        // Just one particle at a time
			...options
		});
	}

	// Create footprint-style trail
	createFootprintTrail(myte, options = {}) {
		const footprintOptions = {
			colors: ['#555555', '#444444'],  // Dark footprint colors
			size: 4,
			sizeEnd: 4,                      // No expansion
			opacity: 0.4,
			opacityEnd: 0,
			life: 120,                       // Long lasting
			friction: 1,                     // No movement once placed
			gravity: 0,                      // No gravity
			interval: 300,                   // Spaced out footprints
			...options
		};

		// Add footprint-specific offsets depending on direction
		const tracker = this.createMyteTracker(myte, {
			offsets: {
				[DIRECTION.NORTH]: [
					{ x: -8, y: 0 },  // Left foot
					{ x: 8, y: 0 }    // Right foot
				],
				[DIRECTION.SOUTH]: [
					{ x: -8, y: 0 },
					{ x: 8, y: 0 }
				],
				[DIRECTION.EAST]: [
					{ x: 0, y: -8 },
					{ x: 0, y: 8 }
				],
				[DIRECTION.WEST]: [
					{ x: 0, y: -8 },
					{ x: 0, y: 8 }
				],
				// Default to horizontal footprints
				default: [
					{ x: -8, y: 0 },
					{ x: 8, y: 0 }
				]
			}
		});

		// Create a custom emitter that alternates between left and right footprints
		const emitter = {
			type: 'footprints',
			options: footprintOptions,
			active: true,
			x: myte.posX,
			y: myte.posY,
			interval: footprintOptions.interval,
			lastEmit: 0,
			particles: [],
			lastX: myte.posX,
			lastY: myte.posY,
			footStep: 0,  // 0 = left, 1 = right
			update: (now) => {
				// Update position from tracker
				tracker.update();
				emitter.x = tracker.x;
				emitter.y = tracker.y;

				// Calculate movement distance
				const dx = emitter.x - emitter.lastX;
				const dy = emitter.y - emitter.lastY;
				const distance = Math.sqrt(dx * dx + dy * dy);

				// Only emit if the Myte has moved a minimum distance
				if (distance > 10 && now - emitter.lastEmit >= emitter.interval) {
					emitter.lastEmit = now;

					// Get direction-specific footprint offsets
					const offsets = tracker.offsets[myte.direction] || tracker.offsets.default;
					const offset = offsets[emitter.footStep];

					// Create a footprint particle
					const dustColor = footprintOptions.colors[Math.floor(Math.random() * footprintOptions.colors.length)];

					const particle = this.addParticle({
						x: emitter.x + offset.x,
						y: emitter.y + offset.y,
						vx: 0,
						vy: 0,
						size: footprintOptions.size,
						sizeEnd: footprintOptions.sizeEnd,
						color: dustColor,
						opacity: footprintOptions.opacity,
						opacityEnd: footprintOptions.opacityEnd,
						life: footprintOptions.life,
						rotationSpeed: 0,
						gravity: footprintOptions.gravity,
						friction: footprintOptions.friction
					});

					emitter.particles.push(particle);

					// Alternate footsteps
					emitter.footStep = (emitter.footStep + 1) % 2;

					// Update the last position
					emitter.lastX = emitter.x;
					emitter.lastY = emitter.y;
				}
			}
		};

		// Store reference and return
		if (!this.myteEffects.has(myte.id)) {
			this.myteEffects.set(myte.id, new Map());
		}
		this.myteEffects.get(myte.id).set('footprints', emitter);

		// Add to emitters array
		this.emitters.push(emitter);

		return emitter;
	}

	// Override updateEmitters to handle custom emitters
	updateEmitters(now) {
		if (!this.emitters || this.emitters.length === 0) return;

		for (let i = this.emitters.length - 1; i >= 0; i--) {
			const emitter = this.emitters[i];
			if (!emitter.active) {
				this.emitters.splice(i, 1);
				continue;
			}

			// Check if this is a custom emitter with an update function
			if (typeof emitter.update === 'function') {
				emitter.update(now);
			}
			// Otherwise, handle standard emitters as before
			else if (now - emitter.lastEmit > emitter.interval) {
				emitter.lastEmit = now;

				// Update the position if it's a moving target
				if (emitter.options && emitter.options.target && typeof emitter.options.target.update === 'function') {
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

	// Override the dispose method to clean up Myte effects
	dispose() {
		// Clear all Myte effects
		this.myteEffects.forEach(effects => {
			effects.forEach(emitter => emitter.active = false);
		});
		this.myteEffects.clear();

		// Call parent dispose method
		super.dispose();
	}
}
