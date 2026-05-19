// MovingMapObject extends AnimatedMapObject so subclasses (PatrolGuard, etc.)
// get animation capabilities alongside physics/movement helpers.
class MovingMapObject extends AnimatedMapObject {
	constructor(parent, type, variant, posX, posY, config = {}, options = {}) {
		super(parent, type, variant, posX, posY, config, options);

		this.velocity = { x: 0, y: 0 };
		this.speed = this.getConfig('speed', 2);
		this.maxSpeed = this.getConfig('maxSpeed', 5);
		this.acceleration = this.getConfig('acceleration', 0.1);
		this.friction = this.getConfig('friction', 0.98);

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
		if (!this.isMoving || (Math.abs(this.velocity.x) < 0.1 && Math.abs(this.velocity.y) < 0.1)) {
			return null;
		}
		if (Math.abs(this.velocity.x) > Math.abs(this.velocity.y)) {
			return this.velocity.x > 0 ? 'E' : 'W';
		}
		return this.velocity.y > 0 ? 'S' : 'N';
	}

	// ── Game-loop hooks ───────────────────────────────────────────────────────

	// Physics integration at fixed rate. Subclasses call super then add AI.
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
