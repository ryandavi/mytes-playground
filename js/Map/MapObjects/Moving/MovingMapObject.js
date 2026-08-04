// MovingMapObject composes animation + movement directly from MapObject.
// Avoiding AnimatedMapObject in the chain keeps the hierarchy one level flatter.
class MovingMapObject extends withAnimation(MapObject) {
	constructor(parent, type, variant, posX, posY, config = {}, options = {}) {
		super(parent, type, variant, posX, posY, config, options);

		this.velocity = { x: 0, y: 0 };
		this.movementBody = new MovementBody(this);
		this.speed = this.getConfig('speed', 2);
		this.maxSpeed = this.getConfig('maxSpeed', 5);
		this.acceleration = this.getConfig('acceleration', 0.1);
		this.friction = this.getConfig('friction', 0.98);
		this.resolveMovementCollisions = this.getConfig('physics.resolveMovementCollisions', false);

		this.isMoving = false;
		this.targetX = posX;
		this.targetY = posY;
		this.reachedTarget = true;
		this.pathIndex = 0;

		this.bounds = this._defaultBounds();
	}

	// ── Bounds ────────────────────────────────────────────────────────────────

	_defaultBounds() {
		return { left: 0, right: 500, top: 0, bottom: 500 };
	}

	updateBounds(parent) {
		if (!parent?.getMaxDimensions) return;
		const { width, height } = parent.getMaxDimensions();
		this.bounds = { left: 0, right: width, top: 0, bottom: height };
	}

	// ── Movement ──────────────────────────────────────────────────────────────

	// Clamps to bounds and reverses velocity on impact. No DOM write.
	setPosition(x, y) {
		const oldX = this.posX;
		const oldY = this.posY;
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

		if ((newX !== oldX || newY !== oldY) && this.gameMap?.gridSystem) {
			this.gameMap.gridSystem.updateObjectPosition(this, oldX, oldY);
		}
	}

	handleBoundaryCollision(direction) {
		if (direction === 'horizontal') {
			this.velocity.x *= -1;
			this.velocity.y += (Math.random() - 0.5) * this.speed;
		} else {
			this.velocity.y *= -1;
			this.velocity.x += (Math.random() - 0.5) * this.speed;
		}
		const fn = this.getConfig('onBoundaryCollision');
		if (typeof fn === 'function') fn(this, direction);
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
			this.stopMoving();
			this.reachedTarget = true;
			const fn = this.getConfig('onTargetReached');
			if (typeof fn === 'function') fn(this, { x: targetX, y: targetY });
		}
	}

	stopMoving() {
		this.velocity.x = 0;
		this.velocity.y = 0;
		this.isMoving = false;
	}

	setTarget(x, y) {
		this.targetX = x;
		this.targetY = y;
		this.reachedTarget = false;
	}

	isAtTarget(threshold = 1) {
		const dx = this.targetX - this.posX;
		const dy = this.targetY - this.posY;
		return Math.sqrt(dx * dx + dy * dy) <= threshold;
	}

	getMovementDirection() {
		return this.isMoving ? this.movementBody.getDirection(this.velocity, 0.1) : null;
	}

	// ── Game-loop hooks ───────────────────────────────────────────────────────

	// Physics integration at fixed rate. Subclasses call super then add AI.
	tickUpdate(tickDelta) {
		super.tickUpdate(tickDelta);

		if (this.isMoving) {
			const nextX = this.posX + this.velocity.x;
			const nextY = this.posY + this.velocity.y;
			if (this.resolveMovementCollisions) {
				const resolved = this.movementBody.resolveMove(nextX, nextY);
				this.velocity.x = resolved.vx;
				this.velocity.y = resolved.vy;
				if (resolved.moved) this.setPosition(resolved.x, resolved.y);
			} else {
				this.setPosition(nextX, nextY);
			}
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

	update(deltaTime) {
		super.update(deltaTime);
	}

	render(container, parent) {
		const element = super.render(container, parent);
		this.updateBounds(parent);
		element.classList.add('moving-object');
		return element;
	}
}
