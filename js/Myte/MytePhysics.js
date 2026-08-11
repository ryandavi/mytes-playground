class MytePhysics {
	constructor(myte) {
		this.myte = myte;

		// Runtime state
		this.isJumping = false;
		this.isFalling = false;
		this.isOnSolidGround = false;
		this.leftGroundTime = undefined;
		this.jumpBufferTime = undefined;
		this.stuckFrames = 0;
	}

	reset() {
		const m = this.myte;
		m.physics.velocity = 0;
		m.posZ = 0;
		this.isJumping = false;
		this.isFalling = false;
		this.isOnSolidGround = false;
		this.leftGroundTime = undefined;
		this.jumpBufferTime = undefined;
		this.stuckFrames = 0;
	}

	syncGroundState() {
		const m = this.myte;
		const worldBounds = m.parent?.getWorldBounds?.();
		if (!worldBounds) {
			return false;
		}

		const feetY = this.getFeetPosition();
		const worldGrounded = feetY >= worldBounds.bottom - (m.physics.collisionTolerance ?? 5);
		let colliderGrounded = false;

		if (m.parent?.gameMap?.gridSystem) {
			const currentEntity = this.createCollisionEntity(m.posX, m.posY);
			const colliders = m.parent.gameMap.gridSystem.getPotentialColliders(m);
			colliderGrounded = colliders.some(collider =>
				this.isStandingOnCollider(collider) && m.parent?.checkCollision?.(currentEntity, collider)
			);
		}

		this.isOnSolidGround = worldGrounded || colliderGrounded;
		this.isJumping = false;
		this.isFalling = !this.isOnSolidGround;

		if (this.isOnSolidGround) {
			m.physics.velocity = 0;
			this.leftGroundTime = undefined;
		}

		return this.isOnSolidGround;
	}

	isCurrentlyJumping() {
		return this.isJumping || this.isFalling;
	}

	getFeetPosition() {
		const m = this.myte;
		return m.posY + (m.collider?.offsetY || 0) + (m.collider?.height || m.size.height);
	}

	getColliderTopEdge(collider) {
		return collider.posY + (collider.collider?.offsetY || 0);
	}

	isStandingOnCollider(collider) {
		return Math.abs(this.getFeetPosition() - this.getColliderTopEdge(collider)) < 2;
	}

	createCollisionEntity(x, y) {
		const m = this.myte;
		return { posX: x, posY: y, collider: m.collider, size: m.size };
	}

	applyGravity(dt = 16.667) {
		const m = this.myte;
		let v = m.physics.velocity;

		if (this.isOnSolidGround) {
			return 0;
		}

		const dtScale = dt / 16.667;
		const multiplier = v > 0 ? 1.1 : 0.9;
		v += m.physics.gravity * multiplier * dtScale;
		return Math.min(v, m.physics.terminalVelocity);
	}

	checkMovementCollision(newX, newY, colliders) {
		const m = this.myte;
		const result = {
			x: newX, y: newY,
			hitPlatform: false, hitWall: false, hitCeiling: false,
			didLand: false, standingOn: null
		};

		if (!m.collider) {
			console.warn('Myte missing collider, collision detection skipped');
			return result;
		}

		if (!m.checkForCollisions || !colliders || colliders.length === 0) {
			return result;
		}

		const wasJumping = this.isJumping;
		const wasFalling = this.isFalling;

		for (const collider of colliders) {
			if (!collider) continue;

			// Landing when falling
			if (m.physics.velocity > 0) {
				const verticalEntity = this.createCollisionEntity(m.posX, newY);
				if (m.parent?.checkCollision(verticalEntity, collider)) {
					const colliderTop = this.getColliderTopEdge(collider);
					result.y = colliderTop - m.collider.height - m.collider.offsetY;
					result.hitPlatform = true;
					result.standingOn = collider;
					if (wasFalling || wasJumping) result.didLand = true;
					continue;
				}
			}

			// Ceiling when jumping
			if (m.physics.velocity < 0) {
				const ceilingEntity = this.createCollisionEntity(newX, newY);
				if (m.parent?.checkCollision(ceilingEntity, collider)) {
					result.hitCeiling = true;
					const colliderBottom = collider.posY + collider.size.height;
					result.y = colliderBottom - m.collider.offsetY;
					continue;
				}
			}

			// Wall collision with step-up
			if (newX !== m.posX && !result.hitWall) {
				if (!this.isStandingOnCollider(collider)) {
					const horizontalEntity = this.createCollisionEntity(newX, m.posY);
					if (m.parent?.checkCollision(horizontalEntity, collider)) {
						const stepUpY = m.posY - m.physics.stepHeight;
						const stepEntity = this.createCollisionEntity(newX, stepUpY);
						if (this.isOnSolidGround && m.parent && !m.parent.checkCollision(stepEntity, collider)) {
							result.y = stepUpY;
						} else {
							result.hitWall = true;
							result.x = m.posX;
						}
					}
				}
			}
		}

		return result;
	}

	handleTrappedState(newX, newY, isTrapped) {
		const m = this.myte;
		if (!isTrapped) return { x: newX, y: newY };

		if (this.stuckFrames > 5) {
			return { x: m.posX, y: m.posY - m.physics.stepHeight };
		}

		if (Math.abs(newX - m.posX) < 0.1 && Math.abs(newY - m.posY) < 0.1) {
			this.stuckFrames++;
		} else {
			this.stuckFrames = 0;
		}

		return { x: newX, y: newY };
	}

	doJump() {
		const m = this.myte;

		const canJump = this.isOnSolidGround ||
			(this.leftGroundTime && SimClock.now() - this.leftGroundTime < m.physics.coyoteTime);
		const hasBufferedJump = this.jumpBufferTime &&
			SimClock.now() - this.jumpBufferTime < m.physics.jumpBuffer;

		if (!canJump && !hasBufferedJump) {
			this.jumpBufferTime = SimClock.now();
			return false;
		}

		this.jumpBufferTime = undefined;
		this.leftGroundTime = undefined;

		m.physics.velocity = -m.physics.jumpHeight;
		this.isJumping = true;
		this.isFalling = false;
		this.isOnSolidGround = false;

		m.parent?.eventManager?.emit(EVENTS.MYTE_JUMPED, { myte: m });

		const dx = m.targetX - m.posX;
		if (Math.abs(dx) > 10) {
			const jumpBoost = m.stats.getSpeed() * 0.5;
			m.posX += (dx > 0 ? 1 : -1) * jumpBoost;
		}

		return true;
	}

	doLandFromFall() {
		const m = this.myte;
		if (m.physics.velocity >= m.physics.minFallDamageVelocity) {
			m.doTouchDamage();
		}
		this.reset();
		m.parent?.eventManager?.emit(EVENTS.MYTE_LANDED, { myte: m });
	}

	adjustPhysicsForCharacter() {
		const m = this.myte;
		if (!m.stats) return;

		const jumpStat = m.stats.getJumpStat ? m.stats.getJumpStat() : 1.0;
		m.physics.jumpHeight *= jumpStat;

		const agilityStat = m.stats.getAgilityStat ? m.stats.getAgilityStat() : 1.0;
		m.physics.airControl *= agilityStat;
	}

	moveGravity() {
		const m = this.myte;
		const dt = m._dt ?? 16.667;
		const dtScale = dt / 16.667;
		const limitGround = m.parent.getWorldBounds().bottom;
		const limitCeiling = 0;

		const colliderOffsetY = m.collider.offsetY || 0;
		const colliderHeight = m.collider.height;

		const wasJumping = this.isJumping;
		const wasFalling = this.isFalling;
		const wasOnSolidGround = this.isOnSolidGround;

		m.physics.velocity = this.applyGravity(dt);
		let newY = m.posY + m.physics.velocity * dtScale;

		m.updateTargetToFollowMouse(true, true);
		const dx = m.targetX - m.posX;
		const controlFactor = this.isOnSolidGround ? 1.0 : m.physics.airControl;
		// getSpeed() already scales by _dt, so no extra dtScale here.
		const moveDistance = m.stats.getSpeed() * controlFactor;

		let newX = m.posX;
		if (Math.abs(dx) > 0.1) {
			const directionX = dx > 0 ? 1 : -1;
			newX = m.posX + directionX * Math.min(Math.abs(dx), moveDistance);
		}

		const myteTop = newY + colliderOffsetY;
		const myteBottom = myteTop + colliderHeight;
		const isAtCeiling = newY < limitCeiling && m.physics.velocity < 0;
		const isAtGround = myteBottom >= limitGround;

		if (isAtCeiling) {
			newY = limitCeiling;
			m.physics.velocity = 0;
		}

		if (isAtGround) {
			newY = limitGround - colliderHeight - colliderOffsetY;
			if (wasFalling || wasJumping) {
				this.doLandFromFall();
			}
		}

		let potentialColliders = [];
		if (m.parent?.gameMap?.gridSystem) {
			potentialColliders = m.parent.gameMap.gridSystem.getPotentialColliders(m);
		}

		if (potentialColliders.length > 0 &&
			(Math.abs(m.physics.velocity) > 10 || Math.abs(newX - m.posX) > 10)) {
			const midY = m.posY + m.physics.velocity / 2;
			const midResult = this.checkMovementCollision(
				m.posX + (newX - m.posX) / 2,
				midY,
				potentialColliders
			);
			if (midResult.hitCeiling || midResult.hitPlatform) {
				newY = midResult.y;
				newX = midResult.x;
				if (midResult.hitCeiling) m.physics.velocity = 0;
			}
		}

		const collisionResult = this.checkMovementCollision(newX, newY, potentialColliders);
		newX = collisionResult.x;
		newY = collisionResult.y;

		if (collisionResult.hitCeiling) m.physics.velocity = 0;

		if (collisionResult.didLand) {
			this.doLandFromFall();
			this.isOnSolidGround = true;
		}

		const escapeResult = this.handleTrappedState(newX, newY, this.stuckFrames > 0);
		newX = escapeResult.x;
		newY = escapeResult.y;

		const isOnGround = isAtGround || collisionResult.hitPlatform;
		if (isOnGround) {
			this.isJumping = false;
			this.isFalling = false;
			this.isOnSolidGround = true;
			m.physics.velocity = 0;
		} else {
			this.isFalling = m.physics.velocity > 0;
			this.isJumping = m.physics.velocity < 0;
			this.isOnSolidGround = false;

			if (wasOnSolidGround && this.leftGroundTime === undefined) {
				this.leftGroundTime = SimClock.now();
			}
		}

		m.setPosition(newX, newY);
		m.setSpritePosition(newX, newY);

		if (Math.abs(dx) > 0.1) {
			m.setDirection(dx > 0 ? DIRECTION.EAST : DIRECTION.WEST);
		}

		if (this.isOnSolidGround) {
			this.leftGroundTime = undefined;
		}
	}
}
