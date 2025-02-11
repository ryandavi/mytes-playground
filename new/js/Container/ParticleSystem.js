// Particle system for visual effects across the game
class ParticleSystem {
	constructor(parent) {
		this.parent = parent;
		this.particles = new Set();
		this.particleLayer = this.getParticleLayer();

		// Particle configurations for different effects
		this.particleConfigs = {
			FOOD: {
				count: 8,
				lifetime: 1400,
				colors: ['#FFD700', '#FFA500', '#FF6347'],
				size: { min: 4, max: 8 },
				velocity: { min: 2, max: 4 },
				gravity: 0.1,
				spread: 0.5,
				opacity: { start: 1, end: 0 },
				shape: 'circle'
			},
			TOY: {
				count: 12,
				lifetime: 1200,
				colors: ['#FF69B4', '#87CEEB', '#98FB98'],
				size: { min: 3, max: 6 },
				velocity: { min: 1, max: 3 },
				gravity: 0.05,
				spread: 0.8,
				opacity: { start: 0.9, end: 0 },
				shape: 'star'
			},
			MEDICINE: {
				count: 6,
				lifetime: 1000,
				colors: ['#FF0000', '#FF6B6B', '#FFB6B6'],
				size: { min: 4, max: 7 },
				velocity: { min: 1.5, max: 3.5 },
				gravity: 0.15,
				spread: 0.3,
				opacity: { start: 0.8, end: 0 },
				shape: 'cross',
				blendMode: 'screen'
			},
			SPARKLE: {
				count: 15,
				lifetime: 1200,
				colors: ['#FFD700', '#FFFACD', '#FFFFFF'],
				size: { min: 2, max: 5 },
				velocity: { min: 1, max: 2 },
				gravity: -0.02,
				spread: 1,
				opacity: { start: 1, end: 0 },
				shape: 'star',
				blendMode: 'screen'
			},
			SLEEP: {
				count: 3,
				lifetime: 2000,
				colors: ['#87CEEB', '#B0E0E6'],
				size: { min: 8, max: 12 },
				velocity: { min: 0.5, max: 1 },
				gravity: -0.05,
				spread: 0.3,
				opacity: { start: 0.8, end: 0 },
				shape: 'z',
				blendMode: 'normal'
			},
			HAPPY: {
				count: 6,
				lifetime: 1500,
				colors: ['#FFD700', '#FFA500', '#FFFF00'],
				size: { min: 6, max: 10 },
				velocity: { min: 1, max: 2 },
				gravity: -0.08,
				spread: 0.6,
				opacity: { start: 1, end: 0 },
				shape: 'star',
				blendMode: 'screen'
			},
			SAD: {
				count: 4,
				lifetime: 1800,
				colors: ['#4682B4', '#87CEEB'],
				size: { min: 4, max: 8 },
				velocity: { min: 0.5, max: 1 },
				gravity: 0.1,
				spread: 0.3,
				opacity: { start: 0.7, end: 0 },
				shape: 'teardrop',
				blendMode: 'normal'
			},
			ANGRY: {
				count: 8,
				lifetime: 1000,
				colors: ['#FF4500', '#FF6347', '#FF0000'],
				size: { min: 3, max: 6 },
				velocity: { min: 2, max: 4 },
				gravity: -0.1,
				spread: 0.8,
				opacity: { start: 1, end: 0 },
				shape: 'lightning',
				blendMode: 'screen'
			},
			LOVE: {
				count: 5,
				lifetime: 2000,
				colors: ['#FF69B4', '#FF1493', '#FF0066'],
				size: { min: 8, max: 12 },
				velocity: { min: 1, max: 2 },
				gravity: -0.05,
				spread: 0.4,
				opacity: { start: 0.9, end: 0 },
				shape: 'heart',
				blendMode: 'screen'
			},
			CONFUSED: {
				count: 4,
				lifetime: 1600,
				colors: ['#9370DB', '#8A2BE2'],
				size: { min: 6, max: 10 },
				velocity: { min: 0.5, max: 1.5 },
				gravity: -0.03,
				spread: 0.5,
				opacity: { start: 0.8, end: 0 },
				shape: 'question',
				blendMode: 'normal'
			},
			MAGIC: {
				count: 12,
				lifetime: 1400,
				colors: ['#9400D3', '#8A2BE2', '#9370DB'],
				size: { min: 4, max: 8 },
				velocity: { min: 1, max: 3 },
				gravity: -0.08,
				spread: 0.7,
				opacity: { start: 1, end: 0 },
				shape: 'star',
				blendMode: 'screen'
			},
			LEVELUP: {
				count: 20,
				lifetime: 2000,
				colors: ['#FFD700', '#FFA500', '#FFFFFF'],
				size: { min: 5, max: 10 },
				velocity: { min: 2, max: 4 },
				gravity: -0.1,
				spread: 1,
				opacity: { start: 1, end: 0 },
				shape: 'star',
				blendMode: 'screen'
			},
			HEART: {
				count: 5,
				lifetime: 1600,
				colors: ['#FF69B4', '#FF1493', '#DB7093'],
				size: { min: 6, max: 10 },
				velocity: { min: 1, max: 2.5 },
				gravity: -0.05, // Negative gravity makes particles float up
				spread: 0.4,
				opacity: { start: 1, end: 0 },
				shape: 'heart'
			}
		};
	}

	getParticleLayer() {
		let layer = this.parent.canvas.querySelector('.layer.effects');
		if (!layer) {
			layer = document.createElement('div');
			layer.className = 'layer effects';
			this.parent.canvas.appendChild(layer);
		}
		return layer;
	}

	createParticle(x, y, config) {
		const particle = document.createElement('div');
		particle.className = 'particle';

		// Basic setup
		const color = config.colors[Math.floor(Math.random() * config.colors.length)];
		const size = Math.random() * (config.size.max - config.size.min) + config.size.min;

		// Position and style
		particle.style.position = 'absolute';
		particle.style.left = `${x}px`;
		particle.style.top = `${y}px`;
		particle.style.width = `${size}px`;
		particle.style.height = `${size}px`;
		particle.style.backgroundColor = color;
		if (config.blendMode) {
			particle.style.mixBlendMode = config.blendMode;
		}
		particle.style.opacity = config.opacity.start;

		// Set shape-specific styles
		switch (config.shape) {
			case 'circle':
				particle.style.borderRadius = '50%';
				break;
			case 'star':
				particle.style.clipPath = 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)';
				break;
			case 'cross':
				particle.style.transform = 'rotate(45deg)';
				particle.style.borderRadius = '2px';
				break;
			case 'heart':
				particle.style.backgroundColor = 'transparent';
				particle.style.width = `${size}px`;
				particle.style.height = `${size}px`;
				particle.style.position = 'relative';
				particle.style.transform = 'rotate(-45deg)';
				particle.style.background = color;
				particle.style.clipPath = 'path("M12 4.248c-3.148-5.402-12-3.825-12 2.944 0 4.661 5.571 9.427 12 15.808 6.43-6.381 12-11.147 12-15.808 0-6.792-8.875-8.306-12-2.944z")';
				break;
			case 'z':
				particle.style.backgroundColor = 'transparent';
				particle.style.color = color;
				particle.style.fontWeight = 'bold';
				particle.style.fontSize = `${size}px`;
				particle.innerHTML = 'Z';
				break;
			case 'teardrop':
				particle.style.backgroundColor = color;
				particle.style.borderRadius = '50% 0 50% 50%';
				particle.style.transform = 'rotate(45deg)';
				break;
			case 'lightning':
				particle.style.backgroundColor = 'transparent';
				particle.style.width = `${size}px`;
				particle.style.height = `${size * 2}px`;
				particle.style.clipPath = 'polygon(50% 0%, 0% 50%, 50% 50%, 0% 100%, 100% 50%, 50% 50%, 100% 0%)';
				particle.style.backgroundColor = color;
				break;
			case 'question':
				particle.style.backgroundColor = 'transparent';
				particle.style.color = color;
				particle.style.fontWeight = 'bold';
				particle.style.fontSize = `${size}px`;
				particle.innerHTML = '?';
				break;
		}

		// Animation properties
		const angle = Math.random() * Math.PI * 2;
		const velocity = Math.random() * (config.velocity.max - config.velocity.min) + config.velocity.min;
		const spread = config.spread;

		// Store particle properties
		particle.velocity = {
			x: Math.cos(angle) * velocity * spread,
			y: Math.sin(angle) * velocity
		};
		particle.gravity = config.gravity;
		particle.lifetime = config.lifetime;
		particle.opacity = config.opacity;
		particle.startTime = Date.now();

		return particle;
	}

	emit(type, x, y) {
		const config = this.particleConfigs[type];
		if (!config) return;

		for (let i = 0; i < config.count; i++) {
			const particle = this.createParticle(x, y, config);
			this.particleLayer.appendChild(particle);
			this.particles.add(particle);
		}
	}

	update() {
		const now = Date.now();

		this.particles.forEach(particle => {
			const age = now - particle.startTime;

			if (age >= particle.lifetime) {
				particle.remove();
				this.particles.delete(particle);
				return;
			}

			// Update position
			const x = parseFloat(particle.style.left);
			const y = parseFloat(particle.style.top);

			particle.velocity.y += particle.gravity;
			particle.style.left = `${x + particle.velocity.x}px`;
			particle.style.top = `${y + particle.velocity.y}px`;

			// Update opacity
			const progress = age / particle.lifetime;
			const opacity = particle.opacity.start + (particle.opacity.end - particle.opacity.start) * progress;
			particle.style.opacity = opacity;
		});
	}

	dispose() {
		this.particles.forEach(particle => particle.remove());
		this.particles.clear();
		this.particleLayer.remove();
	}
}