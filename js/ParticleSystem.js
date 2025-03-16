class Particle {
	constructor(options = {}) {
		// Position
		this.x = options.x || 0;
		this.y = options.y || 0;
		this.z = options.z || 0; // For depth sorting

		// Velocity and physics
		this.vx = options.vx || 0;
		this.vy = options.vy || 0;
		this.gravity = options.gravity || 0;
		this.friction = options.friction || 0.98;
		this.wind = options.wind || 0;

		// Appearance
		this.size = options.size || 5;
		this.sizeStart = this.size;
		this.sizeEnd = options.sizeEnd !== undefined ? options.sizeEnd : this.size;
		this.color = options.color || '#ffffff';
		this.opacity = options.opacity !== undefined ? options.opacity : 1;
		this.opacityStart = this.opacity;
		this.opacityEnd = options.opacityEnd !== undefined ? options.opacityEnd : 0;

		// Animation and sprites
		this.sprite = options.sprite || null;
		this.spriteFrames = options.spriteFrames || null;
		this.currentFrame = 0;
		this.frameDelay = options.frameDelay || 5;
		this.frameCount = 0;
		this.angle = options.angle !== undefined ? options.angle : 0;
		this.rotationSpeed = options.rotationSpeed !== undefined ? options.rotationSpeed : 0;
		this.scaleX = options.scaleX || 1;
		this.scaleY = options.scaleY || 1;
		this.flipped = options.flipped !== undefined ? options.flipped : false;
		this.loop = options.loop !== undefined ? options.loop : true;



		

		// Behavior
		this.behavior = options.behavior || 'default';
		this.behaviorProps = options.behaviorProps || {};

		// Lifespan
		this.life = 100;
		this.lifeMax = options.life || 100;
		this.active = true;

		// References
		this.parent = null;
		this.element = null;
	}

	init(parent) {
		this.parent = parent;
		this.element = document.createElement('div');
		this.element.className = 'particle';

		// Set initial styles
		this.updateStyle();

		// Add to container
		parent.container.appendChild(this.element);

		return this;
	}

	updateStyle() {
		const style = this.element.style;

		// Position
		style.left = `${this.x}px`;
		style.top = `${this.y}px`;
		style.zIndex = Math.floor(this.z);

		// Size and rotation
		style.width = `${this.size}px`;
		style.height = `${this.size}px`;

		// Apply rotation and scale
		const transform = [];
		if (this.angle !== 0) transform.push(`rotate(${this.angle}deg)`);
		if (this.scaleX !== 1 || this.scaleY !== 1) transform.push(`scale(${this.scaleX}, ${this.scaleY})`);
		if (this.flipped) transform.push('scaleX(-1)');
		style.transform = transform.join(' ');

		// Appearance
		style.opacity = this.opacity;

		// Handle sprite-based particles vs. simple particles
		if (this.sprite) {
			if (this.spriteFrames) {
				const frame = this.spriteFrames[this.currentFrame];
				style.backgroundPosition = `-${frame[0] * this.size}px -${frame[1] * this.size}px`;
			}
			style.backgroundImage = `url(${this.sprite})`;
			style.backgroundSize = `${this.size * (this.spriteFrames ? this.spriteFrames.length : 1)}px ${this.size}px`;
		} else {
			style.backgroundColor = this.color;
			style.borderRadius = '50%';
		}
	}

	update() {
		if (!this.active) return false;

		// Update lifespan
		this.life--;
		if (this.life <= 0) {
			this.active = false;
			return false;
		}

		// Calculate life progress (0 = new, 1 = end of life)
		const progress = 1 - (this.life / this.lifeMax);

		// Apply behaviors
		this.applyBehavior();

		// Basic physics
		this.vy += this.gravity;
		this.vx += this.wind;

		this.x += this.vx;
		this.y += this.vy;

		// Apply friction
		this.vx *= this.friction;
		this.vy *= this.friction;

		// Update angle based on rotation speed
		this.angle += this.rotationSpeed;

		// Update size based on start/end sizes
		this.size = this.sizeStart + (this.sizeEnd - this.sizeStart) * progress;

		// Update opacity based on start/end values
		this.opacity = this.opacityStart + (this.opacityEnd - this.opacityStart) * progress;

		// Handle sprite animation if applicable
		if (this.spriteFrames) {
			this.frameCount++;
			if (this.frameCount >= this.frameDelay) {
				this.frameCount = 0;

				//  Check for loop option
				if (this.loop || this.currentFrame < this.spriteFrames.length - 1) {
					this.currentFrame = (this.currentFrame + 1) % this.spriteFrames.length;
				}
				

				
				// this.currentFrame = (this.currentFrame + 1) % this.spriteFrames.length;
			}
		}

		// Update visual style
		this.updateStyle();

		return true;
	}

	applyBehavior() {
		switch (this.behavior) {
			case 'butterfly':
				this.butterflyBehavior();
				break;
			case 'swarm':
				this.swarmBehavior();
				break;
			case 'smoke':
				this.smokeBehavior();
				break;
			case 'firework':
				this.fireworkBehavior();
				break;
			case 'rain':
				this.rainBehavior();
				break;
			case 'snow':
				this.snowBehavior();
				break;
			case 'trail':
				this.trailBehavior();
				break;
			default:
				// Default behavior is just basic physics
				break;
		}
	}

	butterflyBehavior() {
		// Erratic, graceful movement with occasional hover
		if (Math.random() < 0.05) {
			this.vx = (Math.random() - 0.5) * 1.5;
		}
		if (Math.random() < 0.05) {
			this.vy = (Math.random() - 0.5) * 1.5;
		}

		// Occasional fluttering
		if (Math.random() < 0.1) {
			this.rotationSpeed = (Math.random() - 0.5) * 5;
		} else {
			this.rotationSpeed *= 0.95; // Gradually return to normal
		}

		// Containment logic - gently turn around at boundaries
		const props = this.behaviorProps;
		if (props.bounds) {
			const padding = this.size * 2;
			if (this.x < props.bounds.left + padding) this.vx += 0.1;
			if (this.x > props.bounds.right - padding) this.vx -= 0.1;
			if (this.y < props.bounds.top + padding) this.vy += 0.1;
			if (this.y > props.bounds.bottom - padding) this.vy -= 0.1;
		}

		// Occasional wing flapping animation effect
		if (this.spriteFrames) {
			// Handled by the main animation system
		} else {
			// For non-sprite butterflies, simulate wing flapping with scale
			const wingFlapSpeed = 0.2;
			this.scaleX = 0.8 + Math.sin(Date.now() * wingFlapSpeed) * 0.2;
		}
	}

	swarmBehavior() {
		// Get swarm center if available
		const props = this.behaviorProps;
		if (!props.centerX) props.centerX = this.x;
		if (!props.centerY) props.centerY = this.y;

		// Attraction to center
		const dx = props.centerX - this.x;
		const dy = props.centerY - this.y;
		const distance = Math.sqrt(dx * dx + dy * dy);

		// Adjust velocity based on distance from center
		this.vx += (dx / distance) * 0.05;
		this.vy += (dy / distance) * 0.05;

		// Add some randomness
		if (Math.random() < 0.1) {
			this.vx += (Math.random() - 0.5) * 0.5;
			this.vy += (Math.random() - 0.5) * 0.5;
		}

		// Limit speed
		const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
		const maxSpeed = 2;
		if (speed > maxSpeed) {
			this.vx = (this.vx / speed) * maxSpeed;
			this.vy = (this.vy / speed) * maxSpeed;
		}
	}

	smokeBehavior() {
		// Smoke rises and expands
		if (this.y > this.behaviorProps.originY - 200) {
			// When freshly emitted, move more upward
			this.vy -= 0.03;
		} else {
			// When higher up, slow down and dissipate
			this.vy *= 0.98;
		}

		// Expand over lifetime
		const progress = 1 - (this.life / this.lifeMax);
		this.size = this.sizeStart + progress * (this.sizeEnd - this.sizeStart);

		// Add slight rotation
		this.angle += this.rotationSpeed;

		// Gradually spread horizontally
		if (Math.random() < 0.1) {
			this.vx += (Math.random() - 0.5) * 0.2;
		}

		// Wind effect
		this.vx += this.wind;
	}

	fireworkBehavior() {
		const progress = 1 - (this.life / this.lifeMax);

		if (this.behaviorProps.phase === 'rocket') {
			// Trail effect for rising rocket
			if (Math.random() < 0.3 && this.parent) {
				this.parent.addParticle({
					x: this.x,
					y: this.y,
					size: this.size * 0.5,
					sizeEnd: 1,
					vx: (Math.random() - 0.5) * 0.5,
					vy: Math.random() * 1,
					color: '#ffcc00',
					opacity: 0.7,
					opacityEnd: 0,
					life: 10 + Math.random() * 20,
					friction: 0.95
				});
			}
		} else if (this.behaviorProps.phase === 'explosion') {
			// Explosions fade out
			this.opacity = this.opacityStart * (1 - progress);

			// Slightly reduce velocity over time
			this.vx *= 0.99;
			this.vy *= 0.99;

			// Add twinkle effect
			if (Math.random() < 0.1) {
				this.opacity = Math.min(1, this.opacity + 0.3);
			}
		}
	}

	rainBehavior() {
		// Rain falls quickly and splashes at the bottom
		if (this.behaviorProps.bounds &&
			this.y > this.behaviorProps.bounds.bottom - this.size * 2) {

			// Create splash effect
			if (this.parent && !this.behaviorProps.hasSplashed) {
				this.behaviorProps.hasSplashed = true;

				// Add splash particles
				for (let i = 0; i < 3; i++) {
					this.parent.addParticle({
						x: this.x,
						y: this.behaviorProps.bounds.bottom - this.size,
						vx: (Math.random() - 0.5) * 2,
						vy: -Math.random() * 2,
						size: this.size * 0.3,
						sizeEnd: this.size * 0.1,
						color: '#a0c8ff',
						opacity: 0.7,
						opacityEnd: 0,
						life: 10 + Math.random() * 10,
						friction: 0.9
					});
				}

				// End the raindrop's life
				this.life = 1;
			}
		} else {
			// Add slight wind variation
			if (Math.random() < 0.05) {
				this.vx += (Math.random() - 0.5) * 0.2;
			}

			// Streaking effect for speed
			this.scaleY = 1 + Math.abs(this.vy) * 0.2;
		}
	}

	snowBehavior() {
		// Gentle swaying motion
		this.vx += Math.sin(Date.now() * 0.001 + this.y * 0.1) * 0.03;

		// Occasional gust of wind
		if (Math.random() < 0.02) {
			this.vx += (Math.random() - 0.3) * 0.5;
		}

		// Rotate slowly
		this.angle += this.rotationSpeed;

		// Containment logic
		const props = this.behaviorProps;
		if (props.bounds) {
			if (this.y > props.bounds.bottom) {
				// Accumulate at bottom or respawn
				if (props.accumulate && Math.random() < 0.7) {
					this.vy = 0;
					this.vx *= 0.5;
					this.y = props.bounds.bottom;
					// Slowly fade out if accumulating too long
					if (this.life < this.lifeMax * 0.3) {
						this.opacity -= 0.01;
					}
				} else {
					// Respawn at top
					this.y = props.bounds.top;
					this.x = props.bounds.left + Math.random() * (props.bounds.right - props.bounds.left);
					this.life = this.lifeMax;
				}
			}

			// Wrap horizontally
			if (this.x < props.bounds.left) this.x = props.bounds.right;
			if (this.x > props.bounds.right) this.x = props.bounds.left;
		}
	}

	trailBehavior() {
		// Follow emitter if one exists
		if (this.behaviorProps.emitter) {
			const emitter = this.behaviorProps.emitter;
			const dx = emitter.x - this.x;
			const dy = emitter.y - this.y;

			// Move toward emitter but lag behind
			this.vx += dx * 0.01;
			this.vy += dy * 0.01;
		}

		// Fade out
		this.opacity -= 0.01 * this.behaviorProps.fadeSpeed || 1;
	}

	remove() {
		if (this.element && this.element.parentNode) {
			this.element.parentNode.removeChild(this.element);
		}
		this.active = false;
	}
}

class ParticleSystem {
	constructor(parent, options = {}) {
		this.parent = parent;
		this.container = this.parent.layers?.particles || parent.container;

		if (!this.container) {
			console.error('ParticleSystem: Container not found');
			return;
		}

		// Particle management
		this.particles = [];
		this.particlePool = [];
		this.maxParticles = options.maxParticles || 500;
		this.poolSize = options.poolSize || 100;

		// Effects
		this.emitters = [];

		// System state
		this.running = false;
		this.lastUpdate = 0;

		// Initialize particle pool
		this.initPool();
	}

	initPool() {
		for (let i = 0; i < this.poolSize; i++) {
			const particle = new Particle();
			particle.active = false;
			this.particlePool.push(particle);
		}
	}

	getParticleFromPool() {
		// Reuse an inactive particle from the pool if available
		for (let i = 0; i < this.particlePool.length; i++) {
			if (!this.particlePool[i].active) {
				return this.particlePool[i];
			}
		}

		// Create a new particle if pool is empty and we haven't hit max
		if (this.particles.length < this.maxParticles) {
			const particle = new Particle();
			this.particlePool.push(particle);
			return particle;
		}

		// Return the oldest particle if we've hit the max
		return this.particles[0];
	}

	addParticle(options = {}) {
		// Get particle from pool
		const particle = this.getParticleFromPool();

		// Reset particle with new options
		Object.assign(particle, new Particle(options));
		particle.active = true;

		// Initialize the particle
		particle.init(this);

		// Add to active particles (or replace oldest if at max)
		if (this.particles.length >= this.maxParticles) {
			// Remove oldest particle
			const oldest = this.particles.shift();
			oldest.remove();
		}

		this.particles.push(particle);
		return particle;
	}

	// Creates a new emitter that will periodically generate particles
	createEmitter(type, options = {}) {
		const emitter = {
			type,
			options,
			active: true,
			x: options.x || 0,
			y: options.y || 0,
			interval: options.interval || 100,
			lastEmit: 0,
			particles: []
		};

		console.log(`Creating new emitter of type: ${type}`);
		this.emitters.push(emitter);
		return emitter;
	}

	addButterfly(x, y, options = {}) {
		const colors = options.colors || ['#f19cbb', '#ffb347', '#b19cd9', '#77dd77', '#aec6cf'];
		const color = colors[Math.floor(Math.random() * colors.length)];

		// Get bounds for containment
		const bounds = this.getBounds();

		return this.addParticle({
			x,
			y,
			z: 100 + Math.random() * 50, // Higher z-index for butterflies
			vx: (Math.random() - 0.5) * 2,
			vy: (Math.random() - 0.5) * 2,
			size: options.size || 20 + Math.random() * 10,
			color,
			sprite: options.sprite || null,
			spriteFrames: options.spriteFrames || null,
			opacity: 0.9,
			opacityEnd: 0.9,
			life: options.life || 500 + Math.random() * 1000,
			rotationSpeed: (Math.random() - 0.5) * 2,
			gravity: 0,
			friction: 0.98,
			behavior: 'butterfly',
			behaviorProps: {
				bounds
			}
		});
	}

	// Create smoke particles
	addSmoke(x, y, options = {}) {
		const count = options.count || 1;
		const particles = [];

		for (let i = 0; i < count; i++) {
			const greyShade = 180 + Math.floor(Math.random() * 75);
			const color = options.color || `rgba(${greyShade}, ${greyShade}, ${greyShade}, 0.8)`;

			particles.push(this.addParticle({
				x: x + (Math.random() - 0.5) * 10,
				y: y + (Math.random() - 0.5) * 10,
				vx: (Math.random() - 0.5) * 0.5,
				vy: -1 - Math.random() * 0.5,
				size: options.size || 10 + Math.random() * 20,
				sizeEnd: options.sizeEnd || 40 + Math.random() * 30,
				color,
				opacity: options.opacity || 0.7,
				opacityEnd: 0,
				life: options.life || 100 + Math.random() * 100,
				rotationSpeed: (Math.random() - 0.5) * 0.5,
				gravity: -0.05,
				friction: 0.99,
				behavior: 'smoke',
				behaviorProps: {
					originY: y
				},
				sprite: options.sprite || null
			}));
		}

		return particles;
	}

	// Create a firework effect
	addFirework(x, y, options = {}) {
		const endX = options.endX || x;
		const endY = options.endY || y - 300;
		const color = options.color || '#ffcc00';
		const particles = [];

		// Create the rocket
		const rocket = this.addParticle({
			x,
			y,
			vx: (endX - x) * 0.01,
			vy: (endY - y) * 0.01,
			size: options.size || 4,
			color,
			opacity: 1,
			life: 100,
			gravity: 0.05,
			behavior: 'firework',
			behaviorProps: {
				phase: 'rocket'
			},
			sprite: options.rocketSprite || null
		});

		particles.push(rocket);

		// Schedule the explosion
		setTimeout(() => {
			if (!this.running) return;

			// Create the explosion particles
			const explosionColors = options.explosionColors || [
				'#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff', '#ffffff'
			];

			const particleCount = options.particleCount || 100;

			for (let i = 0; i < particleCount; i++) {
				const angle = Math.random() * Math.PI * 2;
				const speed = 2 + Math.random() * 4;
				const explosionColor = explosionColors[Math.floor(Math.random() * explosionColors.length)];

				particles.push(this.addParticle({
					x: rocket.x,
					y: rocket.y,
					vx: Math.cos(angle) * speed,
					vy: Math.sin(angle) * speed,
					size: 2 + Math.random() * 4,
					sizeEnd: 1,
					color: explosionColor,
					opacity: 1,
					opacityEnd: 0,
					life: 50 + Math.random() * 50,
					gravity: 0.1,
					friction: 0.98,
					behavior: 'firework',
					behaviorProps: {
						phase: 'explosion'
					},
					sprite: options.particleSprite || null
				}));
			}

			// Add a sound effect if provided
			if (options.explosionSound && typeof options.playSound === 'function') {
				options.playSound(options.explosionSound);
			}

		}, 1000); // Rocket travels for 1 second before exploding

		return particles;
	}

	// Create a rain effect
	addRain(options = {}) {
		const bounds = this.getBounds();
		const count = options.count || 10;
		const particles = [];

		for (let i = 0; i < count; i++) {
			const x = bounds.left + Math.random() * (bounds.right - bounds.left);
			const y = bounds.top - 20 - Math.random() * 100;

			particles.push(this.addParticle({
				x,
				y,
				vx: options.windSpeed || -1 - Math.random(),
				vy: options.speed || 10 + Math.random() * 5,
				size: options.size || 2 + Math.random() * 3,
				color: options.color || '#a0c8ff',
				opacity: 0.7,
				life: 100 + Math.random() * 100,
				gravity: 0.1,
				behavior: 'rain',
				behaviorProps: {
					bounds,
					hasSplashed: false
				},
				sprite: options.sprite || null
			}));
		}

		return particles;
	}

	// Create a snow effect
	addSnow(options = {}) {
		const bounds = this.getBounds();
		const count = options.count || 10;
		const particles = [];

		for (let i = 0; i < count; i++) {
			const x = bounds.left + Math.random() * (bounds.right - bounds.left);
			const y = bounds.top - 20 - Math.random() * 100;
			const size = options.size || 3 + Math.random() * 5;

			particles.push(this.addParticle({
				x,
				y,
				vx: (Math.random() - 0.5) * 0.5,
				vy: options.speed || 1 + Math.random() * 1.5,
				size,
				sizeEnd: size,
				color: options.color || '#ffffff',
				opacity: 0.8,
				opacityEnd: 0.8,
				life: 500 + Math.random() * 1000,
				rotationSpeed: (Math.random() - 0.5) * 0.5,
				gravity: 0.05,
				friction: 0.98,
				behavior: 'snow',
				behaviorProps: {
					bounds,
					accumulate: options.accumulate || false
				},
				sprite: options.sprite || null
			}));
		}

		return particles;
	}

	// Create a trail effect behind an object
	addTrail(emitter, options = {}) {
		const colors = options.colors || ['#ffcc00', '#ff9900', '#ff6600'];
		const color = colors[Math.floor(Math.random() * colors.length)];

		return this.addParticle({
			x: emitter.x + (Math.random() - 0.5) * (options.spread || 10),
			y: emitter.y + (Math.random() - 0.5) * (options.spread || 10),
			vx: (Math.random() - 0.5) * 0.5,
			vy: (Math.random() - 0.5) * 0.5 - 0.5,
			size: options.size || 5 + Math.random() * 5,
			sizeEnd: options.sizeEnd || 1,
			color,
			opacity: options.opacity || 0.7,
			opacityEnd: 0,
			life: options.life || 30 + Math.random() * 20,
			rotationSpeed: (Math.random() - 0.5) * 0.2,
			gravity: options.gravity || 0,
			friction: 0.98,
			behavior: 'trail',

			behaviorProps: {
				emitter,
				fadeSpeed: options.fadeSpeed || 1
			},
			sprite: options.sprite || null
		});
	}

	// Create particles in a swarm pattern
	addSwarm(x, y, options = {}) {
		const count = options.count || 20;
		const particles = [];
		const colors = options.colors || ['#eeee22', '#ddcc11'];

		for (let i = 0; i < count; i++) {
			const color = colors[Math.floor(Math.random() * colors.length)];
			const angle = Math.random() * Math.PI * 2;
			const distance = Math.random() * 50;

			particles.push(this.addParticle({
				x: x + Math.cos(angle) * distance,
				y: y + Math.sin(angle) * distance,
				vx: (Math.random() - 0.5) * 2,
				vy: (Math.random() - 0.5) * 2,
				size: options.size || 3 + Math.random() * 3,
				color,
				opacity: 0.8,
				life: options.life || 500 + Math.random() * 1000,
				rotationSpeed: (Math.random() - 0.5) * 1,
				gravity: 0,
				friction: 0.95,
				behavior: 'swarm',
				behaviorProps: {
					centerX: x,
					centerY: y
				},
				sprite: options.sprite || null
			}));
		}

		return particles;
	}

	// Update emitters
	updateEmitters(now) {
		if (!this.emitters || this.emitters.length === 0) return;

		for (let i = this.emitters.length - 1; i >= 0; i--) {
			const emitter = this.emitters[i];
			if (!emitter.active) {
				this.emitters.splice(i, 1);
				continue;
			}

			// Update the position if it's a moving target
			if (emitter.type === 'trail' && emitter.options.target && typeof emitter.options.target.update === 'function') {
				emitter.options.target.update();
				emitter.x = emitter.options.target.x || 0;
				emitter.y = emitter.options.target.y || 0;
			}



			// Time to emit new particles?
			if (now - emitter.lastEmit > emitter.interval) {
				emitter.lastEmit = now;


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

	getBounds() {
		const rect = this.container.getBoundingClientRect();
		return {
			left: 0,
			top: 0,
			right: rect.width,
			bottom: rect.height
		};
	}

	update() {
		if (!this.running) return;

		const now = Date.now();
		const deltaTime = now - this.lastUpdate;
		this.lastUpdate = now;

		// Update emitters first
		this.updateEmitters(now);

		// Update particles
		for (let i = this.particles.length - 1; i >= 0; i--) {
			const particle = this.particles[i];
			const active = particle.update();

			if (!active) {
				particle.remove();
				this.particles.splice(i, 1);
			}
		}

		// Schedule next update
		requestAnimationFrame(() => this.update());
	}

	start() {
		if (this.running) return;
		this.running = true;
		this.lastUpdate = Date.now();
		this.update();
	}

	stop() {
		this.running = false;
	}

	clear() {
		// Clear all particles
		for (let i = 0; i < this.particles.length; i++) {
			this.particles[i].remove();
		}
		this.particles = [];

		// Clear all emitters
		this.emitters = [];
	}

	setParticleScale(scale) {
		for (let i = 0; i < this.particles.length; i++) {
			const particle = this.particles[i];
			particle.size *= scale;
			particle.updateStyle();
		}
	}

	dispose() {
		// Stop the animation loop
		this.stop();

		// Clear all particles
		this.clear();

		// Remove references
		this.parent = null;
		this.container = null;
		this.particlePool = [];
	}
}

// Utility class to create sprite sheets for particles
class ParticleSpriteSheet {
	static createButterflySheet(colors = ['#f19cbb', '#ffb347', '#b19cd9', '#77dd77', '#aec6cf']) {
		// Create a canvas for the sprite sheet
		const canvas = document.createElement('canvas');
		const size = 32; // Size of each sprite
		const frames = 8; // Number of animation frames

		canvas.width = size * frames;
		canvas.height = size * colors.length;

		const ctx = canvas.getContext('2d');

		// Draw each butterfly color variation
		colors.forEach((color, colorIndex) => {
			// Draw animation frames
			for (let i = 0; i < frames; i++) {
				const x = i * size;
				const y = colorIndex * size;

				// Calculate wing position based on frame
				const wingPosition = Math.sin(i / frames * Math.PI * 2);

				// Draw body
				ctx.fillStyle = '#333333';
				ctx.beginPath();
				ctx.ellipse(x + size / 2, y + size / 2, size / 8, size / 3, 0, 0, Math.PI * 2);
				ctx.fill();

				// Draw wings
				ctx.fillStyle = color;

				// Left wing
				ctx.beginPath();
				ctx.ellipse(
					x + size / 2 - (size / 4) * Math.abs(wingPosition),
					y + size / 2,
					size / 3,
					size / 2,
					Math.PI / 4 * wingPosition,
					0,
					Math.PI * 2
				);
				ctx.fill();

				// Right wing
				ctx.beginPath();
				ctx.ellipse(
					x + size / 2 + (size / 4) * Math.abs(wingPosition),
					y + size / 2,
					size / 3,
					size / 2,
					-Math.PI / 4 * wingPosition,
					0,
					Math.PI * 2
				);
				ctx.fill();
			}
		});

		// Convert to data URL
		return {
			src: canvas.toDataURL(),
			frames: Array(frames).fill().map((_, i) => [i, 0]),
			size: size
		};
	}

	static createFireworkSheet() {
		// Create a canvas for the sprite sheet
		const canvas = document.createElement('canvas');
		const size = 32; // Size of each sprite
		const frames = 8; // Number of animation frames

		canvas.width = size * frames;
		canvas.height = size * 2; // Two rows: rocket and particle

		const ctx = canvas.getContext('2d');

		// Draw rocket frames
		for (let i = 0; i < frames; i++) {
			const x = i * size;
			const y = 0; // First row for rockets

			// Body
			ctx.fillStyle = '#ffcc00';
			ctx.beginPath();
			ctx.rect(x + size / 2 - 2, y + size / 4, 4, size / 2);
			ctx.fill();

			// Flame (animated)
			const flameSize = 5 + Math.sin(i / frames * Math.PI * 2) * 3;
			ctx.fillStyle = '#ff6600';
			ctx.beginPath();
			ctx.ellipse(x + size / 2, y + size / 2 + 10, 3, flameSize, 0, 0, Math.PI * 2);
			ctx.fill();

			// Head
			ctx.fillStyle = '#cc0000';
			ctx.beginPath();
			ctx.rect(x + size / 2 - 3, y + size / 4 - 5, 6, 5);
			ctx.fill();
		}

		// Draw particle frames (sparkles)
		for (let i = 0; i < frames; i++) {
			const x = i * size;
			const y = size; // Second row for particles

			// Vary sparkle size and opacity
			const sparkleSize = 3 + Math.sin(i / frames * Math.PI * 2) * 2;
			ctx.globalAlpha = 0.7 + Math.sin(i / frames * Math.PI * 2) * 0.3;

			// Draw sparkle (just a circle for simplicity)
			ctx.fillStyle = '#ffffff';
			ctx.beginPath();
			ctx.arc(x + size / 2, y + size / 2, sparkleSize, 0, Math.PI * 2);
			ctx.fill();

			ctx.globalAlpha = 1.0;
		}

		// Convert to data URL
		return {
			src: canvas.toDataURL(),
			rocketFrames: Array(frames).fill().map((_, i) => [i, 0]),
			particleFrames: Array(frames).fill().map((_, i) => [i, 1]),
			size: size
		};
	}

	static createSmokeSheet() {
		// Create a canvas for the sprite sheet
		const canvas = document.createElement('canvas');
		const size = 64; // Size of each sprite
		const frames = 8; // Number of animation frames

		canvas.width = size * frames;
		canvas.height = size;

		const ctx = canvas.getContext('2d');

		// Draw smoke animation frames
		for (let i = 0; i < frames; i++) {
			const x = i * size;
			const phase = i / frames; // 0 to 1

			// Draw smoke puff (more opaque in middle frames, more transparent at start/end)
			const opacity = 0.3 + Math.sin(phase * Math.PI) * 0.5;
			ctx.globalAlpha = opacity;

			const radius = size * 0.3 + size * 0.2 * phase;
			const distortion = 0.2 + 0.8 * phase; // Smoke becomes more distorted as it rises

			// Draw distorted circle for smoke
			ctx.fillStyle = '#dddddd';
			ctx.beginPath();

			// Create irregular shape with noise
			for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 16) {
				const noise = (Math.random() - 0.5) * distortion * radius * 0.3;
				const px = x + size / 2 + Math.cos(angle) * (radius + noise);
				const py = size / 2 + Math.sin(angle) * (radius + noise);

				if (angle === 0) {
					ctx.moveTo(px, py);
				} else {
					ctx.lineTo(px, py);
				}
			}

			ctx.closePath();
			ctx.fill();

			// Draw some internal detail
			ctx.globalAlpha = opacity * 0.3;
			ctx.beginPath();
			ctx.arc(x + size / 2, size / 2, radius * 0.6, 0, Math.PI * 2);
			ctx.fill();

			ctx.globalAlpha = 1.0;
		}

		// Convert to data URL
		return {
			src: canvas.toDataURL(),
			frames: Array(frames).fill().map((_, i) => [i, 0]),
			size: size
		};
	}

	static createRainSheet() {
		// Create a canvas for the sprite sheet
		const canvas = document.createElement('canvas');
		const size = 16; // Size of each sprite
		const frames = 4; // Number of animation frames

		canvas.width = size * frames;
		canvas.height = size * 2; // Two rows: raindrop and splash

		const ctx = canvas.getContext('2d');

		// Draw raindrop frames
		for (let i = 0; i < frames; i++) {
			const x = i * size;
			const y = 0;

			// Draw raindrop (elongated based on speed)
			ctx.fillStyle = '#a0c8ff';
			ctx.beginPath();
			ctx.ellipse(x + size / 2, y + size / 2, size / 8, size / 3, Math.PI / 4, 0, Math.PI * 2);
			ctx.fill();
		}

		// Draw splash frames
		for (let i = 0; i < frames; i++) {
			const x = i * size;
			const y = size;
			const progress = i / (frames - 1); // 0 to 1

			// Splash starts small and gets bigger, then fades out
			const splashSize = progress * size * 0.4;
			const opacity = (progress < 0.5) ? progress * 2 : (1 - progress) * 2;

			ctx.globalAlpha = opacity;
			ctx.fillStyle = '#a0c8ff';

			// Left splash
			ctx.beginPath();
			ctx.arc(x + size / 2 - splashSize, y + size / 2, splashSize, 0, Math.PI * 2);
			ctx.fill();

			// Right splash
			ctx.beginPath();
			ctx.arc(x + size / 2 + splashSize, y + size / 2, splashSize, 0, Math.PI * 2);
			ctx.fill();

			ctx.globalAlpha = 1.0;
		}

		// Convert to data URL
		return {
			src: canvas.toDataURL(),
			rainFrames: Array(frames).fill().map((_, i) => [i, 0]),
			splashFrames: Array(frames).fill().map((_, i) => [i, 1]),
			size: size
		};
	}

	static createSnowSheet() {
		// Create a canvas for the sprite sheet
		const canvas = document.createElement('canvas');
		const size = 24; // Size of each sprite
		const frames = 6; // Number of animation frames

		canvas.width = size * frames;
		canvas.height = size;

		const ctx = canvas.getContext('2d');

		// Draw snowflake animation frames
		for (let i = 0; i < frames; i++) {
			const x = i * size;
			const rotation = (i / frames) * Math.PI * 2;

			// Draw snowflake
			ctx.fillStyle = '#ffffff';
			ctx.save();
			ctx.translate(x + size / 2, size / 2);
			ctx.rotate(rotation);

			// Draw snowflake arms
			for (let arm = 0; arm < 6; arm++) {
				ctx.save();
				ctx.rotate(arm * Math.PI / 3);

				// Main arm
				ctx.fillRect(-1, 0, 2, size * 0.4);

				// Branches
				const branches = 3;
				const branchLength = size * 0.15;
				for (let b = 1; b <= branches; b++) {
					const branchY = (size * 0.4 / (branches + 1)) * b;

					// Left branch
					ctx.fillRect(-1, branchY, -branchLength, 1.5);

					// Right branch
					ctx.fillRect(1, branchY, branchLength, 1.5);
				}
				ctx.restore();
			}

			ctx.restore();
		}

		// Convert to data URL
		return {
			src: canvas.toDataURL(),
			frames: Array(frames).fill().map((_, i) => [i, 0]),
			size: size
		};
	}
}