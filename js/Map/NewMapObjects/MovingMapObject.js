class MovingMapObject extends MapObject {
	constructor(parent, type, variant, posX, posY, config = {}) {
		super(parent, type, variant, posX, posY, config);

		// Movement properties
		this.velocity = { x: 0, y: 0 };
		this.speed = this.getConfig('speed', 2);
		this.maxSpeed = this.getConfig('maxSpeed', 5);
		this.acceleration = this.getConfig('acceleration', 0.1);
		this.friction = this.getConfig('friction', 0.98);

		// Movement state
		this.isMoving = false;
		this.targetX = posX;
		this.targetY = posY;
		this.reachedTarget = true;
		this.pathIndex = 0;

		// Set up boundaries
		this.initializeBoundaries();
	}

	// Set up movement boundaries
	initializeBoundaries() {
		// Default boundaries
		this.bounds = {
			left: 0,
			right: this.getConfig('mapWidth', 500),
			top: 0,
			bottom: this.getConfig('mapHeight', 500)
		};
	}

	// Update boundaries based on parent container
	updateBoundaries(parent) {
		if (!parent) return;

		if (parent.getMaxDimensions) {
			const dimensions = parent.getMaxDimensions();
			this.bounds = {
				left: 0,
				right: dimensions.width,
				top: 0,
				bottom: dimensions.height
			};
		}
	}

	// Set position with boundary checking (simulation only — no DOM write)
	setPosition(x, y) {
		const newX = Math.max(this.bounds.left, Math.min(this.bounds.right - this.size.width, x));
		const newY = Math.max(this.bounds.top, Math.min(this.bounds.bottom - this.size.height, y));

		if (newX <= this.bounds.left || newX >= this.bounds.right - this.size.width) {
			this.handleBoundaryCollision('horizontal');
		}

		if (newY <= this.bounds.top || newY >= this.bounds.bottom - this.size.height) {
			this.handleBoundaryCollision('vertical');
		}

		this.posX = newX;
		this.posY = newY;
		// markPositionDirty() will be called at the end of update()
	}

	// Handle collision with boundaries
	handleBoundaryCollision(direction) {
		if (direction === 'horizontal') {
			this.velocity.x *= -1; // Reverse horizontal direction
			// Add slight vertical variation to avoid getting stuck
			this.velocity.y += (Math.random() - 0.5) * this.speed;
		} else if (direction === 'vertical') {
			this.velocity.y *= -1; // Reverse vertical direction
			// Add slight horizontal variation to avoid getting stuck
			this.velocity.x += (Math.random() - 0.5) * this.speed;
		}

		// Optional: trigger collision event
		const onBoundaryCollision = this.getConfig('onBoundaryCollision');
		if (typeof onBoundaryCollision === 'function') {
			onBoundaryCollision(this, direction);
		}
	}

	// Move toward a target position
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
			this.stopMoving();
			this.reachedTarget = true;

			// Trigger target reached event
			const onTargetReached = this.getConfig('onTargetReached');
			if (typeof onTargetReached === 'function') {
				onTargetReached(this, { x: targetX, y: targetY });
			}
		}
	}

	// Stop movement
	stopMoving() {
		this.velocity.x = 0;
		this.velocity.y = 0;
		this.isMoving = false;
	}

	// Set a new movement target
	setTarget(x, y) {
		this.targetX = x;
		this.targetY = y;
		this.reachedTarget = false;
	}

	// Check if entity is at target
	isAtTarget(threshold = 1) {
		const dx = this.targetX - this.posX;
		const dy = this.targetY - this.posY;
		const distance = Math.sqrt(dx * dx + dy * dy);
		return distance <= threshold;
	}

	// Get direction of movement (for animations)
	getMovementDirection() {
		// Only calculate if moving
		if (!this.isMoving || (Math.abs(this.velocity.x) < 0.1 && Math.abs(this.velocity.y) < 0.1)) {
			return null;
		}

		// Determine primary direction
		if (Math.abs(this.velocity.x) > Math.abs(this.velocity.y)) {
			return this.velocity.x > 0 ? 'E' : 'W';
		} else {
			return this.velocity.y > 0 ? 'S' : 'N';
		}
	}

	// tickUpdate: physics integration at fixed rate
	tickUpdate(tickDelta) {
		super.tickUpdate(tickDelta);

		if (this.isMoving) {
			this.setPosition(
				this.posX + this.velocity.x,
				this.posY + this.velocity.y
			);
		}

		this.velocity.x *= this.friction;
		this.velocity.y *= this.friction;

		if (Math.abs(this.velocity.x) < 0.01 && Math.abs(this.velocity.y) < 0.01) {
			this.stopMoving();
		}

		if (!this.reachedTarget && !this.isMoving) {
			this.moveToward(this.targetX, this.targetY);
		}
	}

	// update: visual only (markPositionDirty handled by base MapObject.update)
	update(deltaTime) {
		super.update(deltaTime);
	}

	// Render - extend parent method
	render(container, parent) {
		const element = super.render(container, parent);

		// Update boundaries based on parent
		this.updateBoundaries(parent);

		// Add moving-specific classes
		element.classList.add('moving-object');

		return element;
	}
}