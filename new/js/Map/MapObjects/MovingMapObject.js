// Base class for all moving objects
class MovingMapObject extends MapObject {
	constructor(type, variant, posX, posY, config, options = {}) {
		super(type, variant, posX, posY, config);

		// Movement properties
		this.velocity = { x: 0, y: 0 };
		this.speed = config.speed || 2;
		this.maxSpeed = config.maxSpeed || 5;
		this.acceleration = config.acceleration || 0.1;
		this.friction = config.friction || 0.98;

		// Boundaries - temporary
		this.bounds = {
			left: 0,
			right: 500,
			top: 0,
			bottom: 500
		};

		// Movement state
		this.isMoving = false;
		this.targetX = posX;
		this.targetY = posY;
		this.reachedTarget = true;
		this.pathIndex = 0;
	}

	setPosition(x, y) {
		const newX = Math.max(this.bounds.left, Math.min(this.bounds.right - this.size.width, x));
		const newY = Math.max(this.bounds.top, Math.min(this.bounds.bottom - this.size.height, y));

		// Check if we hit a boundary and reverse velocity accordingly
		if (newX <= this.bounds.left || newX >= this.bounds.right - this.size.width) {
			this.velocity.x *= -1; // Reverse horizontal direction
			// Add slight vertical variation to avoid getting stuck in straight lines
			this.velocity.y += (Math.random() - 0.5) * this.speed;
		}
		if (newY <= this.bounds.top || newY >= this.bounds.bottom - this.size.height) {
			this.velocity.y *= -1; // Reverse vertical direction
			// Add slight horizontal variation to avoid getting stuck in straight lines
			this.velocity.x += (Math.random() - 0.5) * this.speed;
		}

		this.posX = newX;
		this.posY = newY;

		if (this.element) {
			this.element.style.left = `${this.posX.toFixed(0)}px`;
			this.element.style.top = `${this.posY.toFixed(0)}px`;
		}
	}

	moveToward(targetX, targetY) {
		const dx = targetX - this.posX;
		const dy = targetY - this.posY;
		const distance = Math.sqrt(dx * dx + dy * dy);

		if (distance > 1) {
			const speed = Math.min(this.speed, distance);
			this.velocity.x = (dx / distance) * speed;
			this.velocity.y = (dy / distance) * speed;
			this.isMoving = true;
			this.reachedTarget = false;
		} else {
			this.velocity.x = 0;
			this.velocity.y = 0;
			this.isMoving = false;
			this.reachedTarget = true;
		}
	}

	update() {
		super.update();

		// Apply movement
		if (this.isMoving) {
			this.setPosition(
				this.posX + this.velocity.x,
				this.posY + this.velocity.y
			);
		}

		// Apply friction
		this.velocity.x *= this.friction;
		this.velocity.y *= this.friction;
	}

}

// A ball that moves when mytes get near it
class BallMapObject extends MovingMapObject {
	constructor(type, variant, posX, posY, config, options = {}) {
		super(type, variant, posX, posY, {
			...config,
			speed: 3,
			friction: 0.95
		});

		this.triggerRadius = config.triggerRadius || 100;
		this.pushForce = config.pushForce || 5;
		this.lastPushTime = 0;
		this.pushCooldown = 1500; // ms
	}

	reactToNearbyCreature(myte) {
		const now = Date.now();


		if (now - this.lastPushTime < this.pushCooldown) return;

		// Calculate distance from center
		const dx = (this.posX + this.size.width / 2) - (myte.posX + myte.size.width / 2); 
		const dy = (this.posY + this.size.height / 2) - (myte.posY + myte.size.height / 2);
		const distance = Math.sqrt(dx * dx + dy * dy);

		if (distance < this.triggerRadius) {

			// Calculate push direction and force
			const pushX = (dx / distance) * this.pushForce;
			const pushY = (dy / distance) * this.pushForce;

			// Apply push force as velocity
			this.velocity.x += pushX;
			this.velocity.y += pushY;

			// Cap velocity at maxSpeed
			const speed = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.y * this.velocity.y);
			if (speed > this.maxSpeed) {
				this.velocity.x = (this.velocity.x / speed) * this.maxSpeed;
				this.velocity.y = (this.velocity.y / speed) * this.maxSpeed;
			}

			this.isMoving = true;
			this.lastPushTime = now;

			// Optional: Make the creature react
			myte.queue.addExpression('happy');
		}
	}

	update(parent) {
		super.update();

		// Check for nearby mytes
		if (parent && parent.mytes) {
			parent.mytes.forEach(myte => {
				if (myte.isActive) {

					this.reactToNearbyCreature(myte);
				}
			});
		}
	}
}

// A patrol guard that moves along a defined path
class PatrolGuardMapObject extends MovingMapObject {
	constructor(type, variant, posX, posY, config, options = {}) {
		super(type, variant, posX, posY, {
			...config,
			speed: 2
		});

		// Validate options
		if ((options.patrolPoints?.length ?? 0) === 0) {
            throw new Error('PatrolGuard requires patrol points');
        }

		this.currentPointIndex = 0;
		this.waitTime = config.waitTime || 1000;
		this.lastWaitTime = 0;
		this.isWaiting = false;

		// Set patrol path
		this.setPatrolPath(options.patrolPoints);

	}

	setPatrolPath(points) {
		this.patrolPoints = points;
		this.currentPointIndex = 0;
		if (points.length > 0) {
			this.targetX = points[0].x;
			this.targetY = points[0].y;
		}
	}

	update() {
		if (this.patrolPoints.length === 0) return;

		const currentTime = Date.now();

		if (this.isWaiting) {
			if (currentTime - this.lastWaitTime >= this.waitTime) {
				this.isWaiting = false;
				this.currentPointIndex = (this.currentPointIndex + 1) % this.patrolPoints.length;
			}
		} else {
			const currentPoint = this.patrolPoints[this.currentPointIndex];

			// Check if current point is outside bounds
			const targetX = Math.max(this.bounds.left, Math.min(this.bounds.right - this.size.width, currentPoint.x));
			const targetY = Math.max(this.bounds.top, Math.min(this.bounds.bottom - this.size.height, currentPoint.y));

			// If point is outside bounds, modify patrol path
			if (targetX !== currentPoint.x || targetY !== currentPoint.y) {
				this.patrolPoints[this.currentPointIndex] = { x: targetX, y: targetY };
			}

			this.moveToward(targetX, targetY);

			if (this.reachedTarget) {
				this.isWaiting = true;
				this.lastWaitTime = currentTime;
			}
		}

		super.update();
	}
}

// A butterfly that moves in a natural, fluttering pattern
class ButterflyMapObject extends MovingMapObject {
	constructor(type, variant, posX, posY, config, options = {}) {
		super(type, variant, posX, posY, {
			...config,
			speed: 1
		});

		// Butterfly-specific movement parameters
		this.wanderRadius = config.wanderRadius || 100;
		this.wanderPoint = { x: posX, y: posY };
		this.flutterAmplitude = config.flutterAmplitude || 20;
		this.flutterFrequency = config.flutterFrequency || 0.1;
		this.time = 0;

		this.boundaryPadding = 20; // Minimum distance from container edges
		this.maxAttempts = 5;

		// State
		this.state = 'wander'; // wander, rest
		this.restDuration = 3000;
		this.lastRestTime = 0;
	}

	update() {
		const currentTime = Date.now();
		this.time += 0.016; // Assuming 60fps

		switch (this.state) {
			case 'wander':
				// Generate new wander point if we've reached the current one
				if (this.reachedTarget) {
					// Try to find a valid wander point within bounds
					let attempts = 0;
					let foundValid = false;

					while (!foundValid && attempts < this.maxAttempts) {
						const angle = Math.random() * Math.PI * 2;
						const newX = this.posX + Math.cos(angle) * this.wanderRadius;
						const newY = this.posY + Math.sin(angle) * this.wanderRadius;

						// Check if point is within bounds with some padding
						if (newX >= this.bounds.left + this.boundaryPadding &&
							newX <= this.bounds.right - this.size.width - this.boundaryPadding &&
							newY >= this.bounds.top + this.boundaryPadding &&
							newY <= this.bounds.bottom - this.size.height - this.boundaryPadding) {

							this.wanderPoint = { x: newX, y: newY };
							foundValid = true;
						}
						attempts++;
					}

					// If no valid point found, move away from bounds
					if (!foundValid) {
						const centerX = (this.bounds.left + this.bounds.right) / 2;
						const centerY = (this.bounds.top + this.bounds.bottom) / 2;
						const angle = Math.atan2(centerY - this.posY, centerX - this.posX);
						this.wanderPoint = {
							x: this.posX + Math.cos(angle) * this.wanderRadius * 0.5,
							y: this.posY + Math.sin(angle) * this.wanderRadius * 0.5
						};
					}

					// Occasionally decide to rest
					if (Math.random() < 0.1) {
						this.state = 'rest';
						this.lastRestTime = currentTime;
						break;
					}
				}


				this.moveToward(
					this.wanderPoint.x,
					this.wanderPoint.y
				);
				break;

			case 'rest':
				// Rest for a while, then go back to wandering
				if (currentTime - this.lastRestTime > this.restDuration) {
					this.state = 'wander';
				}
				break;
		}

		super.update();
	}
}