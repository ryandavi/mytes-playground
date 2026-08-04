
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
//   terrainCostMultipliers (obj) — per-terrain cost overrides              {}
//   pathfindingOptions (obj)  — extra raw options forwarded to A*          {}
// ─────────────────────────────────────────────────────────────────────────────

class NpcMapObject extends MovingMapObject {
	get aggroTarget() {
		const relationships = this.container?.relationships;
		if (relationships) return relationships.get('targeting', this) ?? null;
		return this._aggroTarget ?? null;
	}

	set aggroTarget(target) {
		const relationships = this.container?.relationships;
		const previous = relationships?.get?.('targeting', this) ?? this._aggroTarget ?? null;
		this._aggroTarget = target ?? null;

		if (!relationships) return;

		if (previous && previous !== target) {
			relationships.clear('targeting', this, previous);
		}

		if (target) {
			relationships.set('targeting', this, target);
			return;
		}

		relationships.clear('targeting', this);
	}

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

		this.pathfindingOptions = {
			likedTerrain:              this.getConfig('likedTerrain', []),
			dislikedTerrain:           this.getConfig('dislikedTerrain', []),
			terrainCostMultipliers:    this.getConfig('terrainCostMultipliers', {}),
			...this.getConfig('pathfindingOptions', {})
		};

		// ── AI state ──────────────────────────────────────────────────────────
		this._aggroTarget = null;
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
		this.wanderHeading  = Math.random() * Math.PI * 2;
		this.wanderStepMin  = this.getConfig('wanderStepMin', this.wanderRadius * 0.35);
		this.wanderStepMax  = this.getConfig('wanderStepMax', this.wanderRadius * 0.7);
		this.wanderTurnMax  = this.getConfig('wanderTurnMaxDegrees', 75) * (Math.PI / 180);

		this.chaseStopDistance = this.getConfig('chaseStopDistance', 12);
		this.chaseResumeDistance = this.getConfig('chaseResumeDistance', 28);
		this._holdingChaseDistance = false;

		// ── Stuck detection (door opening / path recovery) ────────────────────
		// The counter itself lives on the shared MovementBody; only the previous
		// sample position is NPC state.
		this._prevPosX   = posX;
		this._prevPosY   = posY;

		// ── Locomotion style ──────────────────────────────────────────────────
		// Purely data-driven: `movement.style: "hop"` in types.json makes a monster
		// travel in leaps instead of gliding. No AI changes, no subclass.
		this.hopMotion = this.getConfig('movement.style') === 'hop'
			? new HopMotion(this, this.getConfig('movement.hop', {}))
			: null;

		// DOM element for the alert status indicator (! / !!)
		this.alertIndicator = null;
		this.nameplateElement = null;
	}

	// Always simulate even when outside the camera viewport.
	shouldSimulateOffScreen() { return true; }

	// ── Render ────────────────────────────────────────────────────────────────

	render(container, parent) {
		const element = super.render(container, parent);
		const entityCategory = this.type === 'NPC' ? 'npc' : 'monster';
		element.classList.add(`${entityCategory}-entity`, `npc-${this.aiState}`);
		if (this.type === 'NPC' && this.getConfig('identityPlate.enabled', false)) {
			this.renderIdentityPlate(element);
		}

		return element;
	}

	getIdentity() {
		const shop = ShopRegistry.getShop(this.getConfig('shopId', null));
		return {
			name: this.getConfig('name', null) || shop?.shopkeeper?.name || this.getDisplayName(),
			role: this.getConfig('functionLabel', null) || (shop ? 'Shop' : this.getConfig('role', null))
		};
	}

	renderIdentityPlate(element) {
		const identity = this.getIdentity();
		const plate = document.createElement('div');
		plate.className = 'npc-nameplate';

		const name = document.createElement('span');
		name.className = 'npc-nameplate__name';
		name.textContent = identity.name;
		plate.appendChild(name);

		if (identity.role) {
			const role = document.createElement('span');
			role.className = 'npc-nameplate__role';
			role.textContent = identity.role;
			plate.appendChild(role);
		}

		element.appendChild(plate);
		this.nameplateElement = plate;
	}

	handleDoubleClick(event) {
		if (this.openConfiguredShop()) return;
		super.handleDoubleClick(event);
	}

	handleLongPress(event) {
		if (this.openConfiguredShop()) return;
		super.handleLongPress(event);
	}

	openConfiguredShop() {
		const shopId = this.getConfig('shopId', null);
		if (!shopId) return false;
		this.container?.ui?.shopPanel?.openFor(this, shopId);
		return true;
	}

	// ── Pathfinding helpers ───────────────────────────────────────────────────

	// Runs A* from current position to (targetCenterX, targetCenterY).
	// Converts the returned centre-coords path to top-left coords that
	// MovingMapObject's setTarget / moveToward expect.
	// Returns true when a valid path was found.
	_computePath(targetCenterX, targetCenterY) {
		if (!this.pathfinder) return false;

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
		if (!this.capabilities.canOpenDoors) return;
		const gridSystem = this.parent?.gridSystem;
		if (!gridSystem) return;
		const colliders = gridSystem.getPotentialColliders(this);
		for (const c of colliders) {
			if (this.tryOpenCollider(c)) break;
		}
	}

	// Detects when the NPC hasn't moved despite trying to, then attempts to
	// open a blocking door and optionally recomputes the path.
	_checkStuck() {
		// Detection is shared (MovementBody.trackStuck); the response below —
		// open the blocking door, then repath — is NPC-specific and stays here.
		const moved = Math.hypot(this.posX - this._prevPosX, this.posY - this._prevPosY);
		const tripped = this.movementBody.trackStuck('npc', this.isMoving, moved, {
			minDistance: 0.5,
			threshold: 6
		});

		this._prevPosX = this.posX;
		this._prevPosY = this.posY;
		if (!tripped) return;

		this._tryOpenNearbyDoors();

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

	// ── Target detection ──────────────────────────────────────────────────────

	// Returns the closest active myte within aggroRadius, or null.
	_detectTargets() {
		return this.parent?.worldQuery?.nearest?.({
			x: this.posX,
			y: this.posY,
			radius: this.aggroRadius,
			kind: WORLD_ENTITY_KINDS.MYTE,
			measureFrom: 'pos',
			excludeDragging: false
		}) ?? null;
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

		if (this.currentPath && this.pathIndex < this.currentPath.length) {
			this._advanceAlongPath();
			return;
		}

		// Continue broadly forward with gentle turns. Choosing every destination
		// independently around home made short routes alternate across the spawn
		// point, which read as mechanical back-and-forth pacing.
		this.wanderTimer += tickDelta;
		if (this.wanderTimer >= this.wanderInterval && !this.isMoving) {
			this.wanderTimer = 0;
			this._chooseWanderPath();
		}
	}

	_chooseWanderPath() {
		const homeDistance = Math.hypot(this.posX - this.homeX, this.posY - this.homeY);
		if (homeDistance >= this.wanderRadius * 0.8) {
			this.wanderHeading = Math.atan2(this.homeY - this.posY, this.homeX - this.posX) +
				((Math.random() - 0.5) * this.wanderTurnMax);
		} else {
			this.wanderHeading += (Math.random() - 0.5) * this.wanderTurnMax * 2;
		}

		const step = this.wanderStepMin + Math.random() * Math.max(0, this.wanderStepMax - this.wanderStepMin);
		let wx = this.posX + Math.cos(this.wanderHeading) * step;
		let wy = this.posY + Math.sin(this.wanderHeading) * step;
		const fromHomeX = wx - this.homeX;
		const fromHomeY = wy - this.homeY;
		const fromHomeDistance = Math.hypot(fromHomeX, fromHomeY);
		if (fromHomeDistance > this.wanderRadius) {
			wx = this.homeX + (fromHomeX / fromHomeDistance) * this.wanderRadius;
			wy = this.homeY + (fromHomeY / fromHomeDistance) * this.wanderRadius;
		}

		if (!this._computePath(wx + this.size.width / 2, wy + this.size.height / 2)) {
			this.setTarget(wx, wy);
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

		const colliderGap = RectUtils.getRectGap(
			RectUtils.getEntityColliderBounds(this),
			RectUtils.getEntityColliderBounds(this.aggroTarget)
		);
		if (this._holdingChaseDistance && colliderGap < this.chaseResumeDistance) {
			this.currentPath = null;
			this.stopMoving();
			this.reachedTarget = true;
			return;
		}
		this._holdingChaseDistance = colliderGap <= this.chaseStopDistance;
		if (this._holdingChaseDistance) {
			this.currentPath = null;
			this.stopMoving();
			this.reachedTarget = true;
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

		// Hoppers travel in leaps: the AI above still decides the heading, this only
		// gates when that velocity may apply. Sits between AI and physics so nothing
		// else needs to know about it.
		this._applyHopMotion(tickDelta);

		// Physics / velocity application (MovingMapObject → AnimatedMapObject → MapObject).
		super.tickUpdate(tickDelta);
	}

	_applyHopMotion(tickDelta) {
		if (!this.hopMotion?.enabled) return;

		const speed = Math.hypot(this.velocity.x, this.velocity.y);
		const wantsToMove = this.isMoving && speed > 0.01;
		const throttle = this.hopMotion.update(tickDelta, wantsToMove);

		if (throttle !== 1) {
			// Grounded: hold position but keep the heading, so the next leap
			// continues toward the same waypoint rather than re-deciding from rest.
			this.velocity.x *= throttle;
			this.velocity.y *= throttle;
			return;
		}

		// Airborne: rescale to the configured leap distance so the creature covers
		// deliberate ground per hop instead of skating along at walking speed.
		const leapSpeed = this.hopMotion.getLeapSpeed(tickDelta);
		if (leapSpeed && speed > 0.0001) {
			const remainingX = this.targetX - this.posX;
			const remainingY = this.targetY - this.posY;
			const remainingDistance = Math.hypot(remainingX, remainingY);
			if (remainingDistance <= leapSpeed) {
				this.velocity.x = remainingX;
				this.velocity.y = remainingY;
				if (remainingDistance <= 0.01) {
					this.stopMoving();
					this.reachedTarget = true;
				}
			} else {
				this.velocity.x = (this.velocity.x / speed) * leapSpeed;
				this.velocity.y = (this.velocity.y / speed) * leapSpeed;
			}
		}
	}

	// ── Hop animation states ──────────────────────────────────────────────────
	// Each falls back to art that exists, so a hopper without jump/fall frames
	// simply keeps its directional/idle animation rather than blanking out.

	_hopAnimation(key) {
		return this.hopMotion?.config?.animations?.[key] ?? null;
	}

	onHopStart() {
		this.playFirstAvailableAnimation?.(this._hopAnimation('jump'), this.getMovementDirection?.(), 'idle');
	}

	onHopApex() {
		this.playFirstAvailableAnimation?.(this._hopAnimation('fall'), this.getMovementDirection?.(), 'idle');
	}

	onHopLand() {
		this.playFirstAvailableAnimation?.(this._hopAnimation('land'), 'idle');
	}

	update(deltaTime) {
		super.update(deltaTime);
		if (this.hopMotion) {
			this.setSpriteVerticalLift(this.posZ);
			this.computeShadowVisual();
		}
		this.nameplateElement?.style.setProperty('--npc-lift', `${Math.max(0, this.posZ || 0)}px`);
	}

	// ── Cleanup ───────────────────────────────────────────────────────────────

	remove() {
		if (this.alertIndicator) {
			this.alertIndicator.remove();
			this.alertIndicator = null;
		}
		this.nameplateElement = null;
		super.remove();
	}
}

// Apply the shared entity mixin: initPathfinder, tryOpenCollider, getDistanceTo, etc.
applyEntityMixin(NpcMapObject);
