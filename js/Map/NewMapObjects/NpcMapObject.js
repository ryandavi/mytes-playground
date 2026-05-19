
// AI states for all NPC entities.
const NPC_STATES = Object.freeze({
	IDLE:   'idle',
	ALERT:  'alert',
	CHASE:  'chase',
	RETURN: 'return'
});

// ─────────────────────────────────────────────────────────────────────────────
// NpcMapObject — a MovingMapObject that navigates with A* and reacts to mytes.
//
// Hierarchy: NpcMapObject → MovingMapObject → AnimatedMapObject → MapObject
// EntityMixin is applied below the class definition, adding:
//   initPathfinder, updatePathfinder, invalidatePathfinderCache,
//   canAutoOpenCollider, tryOpenCollider, getDistanceTo, getDistanceToPoint
//
// Config keys (all optional):
//   aggroRadius        (px)   — detect mytes within this range           [200]
//   chaseRadius        (px)   — give up chase if target escapes this far  [400]
//   alertDuration      (ms)   — pause before starting chase              [1000]
//   pathRefreshInterval(ms)   — how often to recompute path in chase     [1000]
//   wanderRadius       (px)   — idle wander distance from home           [100]
//   wanderInterval     (ms)   — time between idle wander moves           [3000]
//   pathWaypointThreshold(px) — "close enough" to advance waypoint        [16]
//   capabilities       (obj)  — overrides for EntityDefaults.capabilities  {}
//   likedTerrain       (arr)  — terrain types this NPC prefers             []
//   dislikedTerrain    (arr)  — terrain types this NPC avoids              []
//   terrain_cost_multipliers (obj) — per-terrain cost overrides            {}
//   pathfindingOptions (obj)  — extra raw options forwarded to A*          {}
// ─────────────────────────────────────────────────────────────────────────────

class NpcMapObject extends MovingMapObject {
	constructor(parent, type, variant, posX, posY, config = {}, options = {}) {
		super(parent, type, variant, posX, posY, config, options);

		// Spawn position — used as the "home" to return to after losing a target.
		this.homeX = posX;
		this.homeY = posY;

		// Entity capabilities (merged from EntityDefaults + config).
		this.capabilities = {
			...EntityDefaults.capabilities(),
			...this.getConfig('capabilities', {})
		};

		// Pathfinder is created in render() once the gridSystem is ready.
		this.pathfinder = null;
		this.pathfindingOptions = {
			likedTerrain:              this.getConfig('likedTerrain', []),
			dislikedTerrain:           this.getConfig('dislikedTerrain', []),
			terrain_cost_multipliers:  this.getConfig('terrain_cost_multipliers', {}),
			...this.getConfig('pathfindingOptions', {})
		};

		// ── AI state ──────────────────────────────────────────────────────────
		this.aiState     = NPC_STATES.IDLE;
		this.aggroTarget = null;

		this.aggroRadius    = this.getConfig('aggroRadius', 200);
		this.chaseRadius    = this.getConfig('chaseRadius', 400);
		this.alertDuration  = this.getConfig('alertDuration', 1000);
		this.alertTimer     = 0;

		// ── Pathfinding ───────────────────────────────────────────────────────
		this.currentPath    = null;
		this.pathIndex      = 0;
		this.pathRefreshInterval = this.getConfig('pathRefreshInterval', 1000);
		this.pathRefreshTimer    = 0;
		this.pathWaypointThreshold = this.getConfig('pathWaypointThreshold', 16);

		// ── Idle wander ───────────────────────────────────────────────────────
		this.wanderRadius   = this.getConfig('wanderRadius', 100);
		this.wanderInterval = this.getConfig('wanderInterval', 3000);
		this.wanderTimer    = 0;

		// ── Stuck detection (door opening / path recovery) ────────────────────
		this._prevPosX   = posX;
		this._prevPosY   = posY;
		this.stuckFrames = 0;

		// DOM element for the alert status indicator (! / !!)
		this.alertIndicator = null;
	}

	// Always simulate even when outside the camera viewport.
	shouldSimulateOffScreen() { return true; }

	// ── Render ────────────────────────────────────────────────────────────────

	render(container, parent) {
		const element = super.render(container, parent);
		element.classList.add('npc-entity', `npc-${this.aiState}`);

		// Build pathfinder now that the map and gridSystem are guaranteed ready.
		if (this.map?.gridSystem) {
			this.initPathfinder(this.map.gridSystem);
		}

		return element;
	}

	// ── Pathfinding helpers ───────────────────────────────────────────────────

	// Runs A* from current position to (targetCenterX, targetCenterY).
	// Converts the returned centre-coords path to top-left coords that
	// MovingMapObject's setTarget / moveToward expect.
	// Returns true when a valid path was found.
	_computePath(targetCenterX, targetCenterY) {
		if (!this.pathfinder) {
			if (this.map?.gridSystem) this.initPathfinder(this.map.gridSystem);
			if (!this.pathfinder) return false;
		}

		const path = this.pathfinder.findPath(
			this,
			this.posX, this.posY,
			targetCenterX, targetCenterY,
			this.pathfindingOptions
		);

		if (!path || path.length === 0) {
			this.currentPath = null;
			return false;
		}

		// findPath returns entity-centre coordinates; convert to top-left.
		this.currentPath = path.map(wp => ({
			x: wp.x - this.size.width  / 2,
			y: wp.y - this.size.height / 2
		}));

		// Drop the first waypoint if it's essentially where we already are.
		if (this.currentPath.length > 0) {
			const first = this.currentPath[0];
			if (Math.hypot(first.x - this.posX, first.y - this.posY) < 4) {
				this.currentPath.shift();
			}
		}

		this.pathIndex = 0;
		return this.currentPath.length > 0;
	}

	// Steps through the pre-computed path one waypoint at a time.
	// Returns false when the path is exhausted (target reached).
	_advanceAlongPath() {
		if (!this.currentPath || this.pathIndex >= this.currentPath.length) return false;

		const wp   = this.currentPath[this.pathIndex];
		const dist = Math.hypot(wp.x - this.posX, wp.y - this.posY);

		if (dist <= this.pathWaypointThreshold) {
			this.pathIndex++;
			if (this.pathIndex >= this.currentPath.length) {
				this.stopMoving();
				this.reachedTarget = true;
				return false;
			}
		}

		const next = this.currentPath[this.pathIndex];
		this.setTarget(next.x, next.y);
		this.moveToward(next.x, next.y);
		return true;
	}

	// Asks the gridSystem for nearby collidable objects and tries to open any
	// door/gate among them. Called by the stuck detector.
	_tryOpenNearbyDoors() {
		if (!this.capabilities.can_open_doors) return;
		const gridSystem = this.map?.gridSystem;
		if (!gridSystem) return;
		const colliders = gridSystem.getPotentialColliders(this);
		for (const c of colliders) {
			if (this.tryOpenCollider(c)) break;
		}
	}

	// Detects when the NPC hasn't moved despite trying to, then attempts to
	// open a blocking door and optionally recomputes the path.
	_checkStuck() {
		if (!this.isMoving) {
			this._prevPosX = this.posX;
			this._prevPosY = this.posY;
			this.stuckFrames = 0;
			return;
		}

		const moved = Math.hypot(this.posX - this._prevPosX, this.posY - this._prevPosY);
		if (moved < 0.5) {
			this.stuckFrames++;
			if (this.stuckFrames >= 6) {
				this._tryOpenNearbyDoors();
				this.stuckFrames = 0;
				// Recompute path to escape the blockage.
				if (this.aggroTarget && this.aiState === NPC_STATES.CHASE) {
					const cx = this.aggroTarget.posX + (this.aggroTarget.size?.width  || 0) / 2;
					const cy = this.aggroTarget.posY + (this.aggroTarget.size?.height || 0) / 2;
					this._computePath(cx, cy);
				} else if (this.aiState === NPC_STATES.RETURN) {
					this._computePath(
						this.homeX + this.size.width  / 2,
						this.homeY + this.size.height / 2
					);
				}
			}
		} else {
			this.stuckFrames = 0;
		}

		this._prevPosX = this.posX;
		this._prevPosY = this.posY;
	}

	// ── Target detection ──────────────────────────────────────────────────────

	// Returns the closest active myte within aggroRadius, or null.
	_detectTargets() {
		let closest     = null;
		let closestDist = this.aggroRadius;

		for (const myte of this.mytes) {
			if (!myte.isActive) continue;
			const d = this.getDistanceTo(myte);
			if (d < closestDist) {
				closestDist = d;
				closest     = myte;
			}
		}

		return closest;
	}

	// ── State machine ─────────────────────────────────────────────────────────

	_enterState(state) {
		this.aiState = state;

		switch (state) {
			case NPC_STATES.IDLE:
				this.aggroTarget = null;
				this.currentPath = null;
				this.stopMoving();
				this.reachedTarget = true;
				break;

			case NPC_STATES.ALERT:
				this.currentPath = null;
				this.stopMoving();
				this.reachedTarget = true;
				this.alertTimer = 0;
				break;

			case NPC_STATES.CHASE:
				// Set timer at the threshold so path is computed on the very first tick.
				this.pathRefreshTimer = this.pathRefreshInterval;
				break;

			case NPC_STATES.RETURN:
				this._computePath(
					this.homeX + this.size.width  / 2,
					this.homeY + this.size.height / 2
				);
				break;
		}

		this._updateAlertVisual();
	}

	_updateAlertVisual() {
		if (!this.element) return;

		this.element.classList.remove('npc-idle', 'npc-alert', 'npc-chase', 'npc-return');
		this.element.classList.add(`npc-${this.aiState}`);

		if (!this.alertIndicator) {
			this.alertIndicator = document.createElement('div');
			this.alertIndicator.className = 'npc-alert-indicator';
			this.element.appendChild(this.alertIndicator);
		}

		const symbols = { idle: '', alert: '!', chase: '!!', return: '' };
		this.alertIndicator.textContent  = symbols[this.aiState] ?? '';
		this.alertIndicator.style.display = this.aiState === NPC_STATES.IDLE ||
		                                    this.aiState === NPC_STATES.RETURN ? 'none' : '';
	}

	// ── Per-state update methods ──────────────────────────────────────────────

	_updateIdle(tickDelta) {
		const target = this._detectTargets();
		if (target) {
			this.aggroTarget = target;
			this._enterState(NPC_STATES.ALERT);
			return;
		}

		// Periodic wander within home area.
		this.wanderTimer += tickDelta;
		if (this.wanderTimer >= this.wanderInterval && !this.isMoving) {
			this.wanderTimer = 0;
			const wx = this.homeX + (Math.random() - 0.5) * this.wanderRadius * 2;
			const wy = this.homeY + (Math.random() - 0.5) * this.wanderRadius * 2;
			this.setTarget(wx, wy);
			// MovingMapObject's tickUpdate auto-calls moveToward when reachedTarget is false.
			this.reachedTarget = false;
		}
	}

	_updateAlert(tickDelta) {
		if (!this.aggroTarget?.isActive) {
			this._enterState(NPC_STATES.IDLE);
			return;
		}

		this.alertTimer += tickDelta;
		if (this.alertTimer >= this.alertDuration) {
			this._enterState(NPC_STATES.CHASE);
		}
	}

	_updateChase(tickDelta) {
		if (!this.aggroTarget?.isActive) {
			this._enterState(NPC_STATES.RETURN);
			return;
		}

		if (this.getDistanceTo(this.aggroTarget) > this.chaseRadius) {
			this._enterState(NPC_STATES.RETURN);
			return;
		}

		// Periodically refresh the path so we track a moving target.
		this.pathRefreshTimer += tickDelta;
		if (this.pathRefreshTimer >= this.pathRefreshInterval) {
			this.pathRefreshTimer = 0;
			const cx = this.aggroTarget.posX + (this.aggroTarget.size?.width  || 0) / 2;
			const cy = this.aggroTarget.posY + (this.aggroTarget.size?.height || 0) / 2;
			this._computePath(cx, cy);
		}

		this._advanceAlongPath();
	}

	_updateReturn(tickDelta) {
		// Re-check aggro while walking home — re-engage if something comes close.
		const target = this._detectTargets();
		if (target) {
			this.aggroTarget = target;
			this._enterState(NPC_STATES.ALERT);
			return;
		}

		const pathDone = !this.currentPath || this.pathIndex >= this.currentPath.length;
		if (pathDone) {
			this._enterState(NPC_STATES.IDLE);
			return;
		}

		this._advanceAlongPath();
	}

	// ── Game-loop hooks ───────────────────────────────────────────────────────

	tickUpdate(tickDelta) {
		// AI runs first so it can set velocity before MovingMapObject applies it.
		this._checkStuck();

		switch (this.aiState) {
			case NPC_STATES.IDLE:   this._updateIdle(tickDelta);   break;
			case NPC_STATES.ALERT:  this._updateAlert(tickDelta);  break;
			case NPC_STATES.CHASE:  this._updateChase(tickDelta);  break;
			case NPC_STATES.RETURN: this._updateReturn(tickDelta); break;
		}

		// Physics / velocity application (MovingMapObject → AnimatedMapObject → MapObject).
		super.tickUpdate(tickDelta);
	}

	update(deltaTime) {
		super.update(deltaTime);
	}

	// ── Cleanup ───────────────────────────────────────────────────────────────

	remove() {
		if (this.alertIndicator) {
			this.alertIndicator.remove();
			this.alertIndicator = null;
		}
		super.remove();
	}
}

// Apply the shared entity mixin: initPathfinder, tryOpenCollider, getDistanceTo, etc.
applyEntityMixin(NpcMapObject);
