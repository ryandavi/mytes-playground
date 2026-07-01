
// Shared entity capabilities and pathfinding mixin.
// Apply to any class with: applyEntityMixin(MyClass)
// Both Myte and NpcMapObject use this so the logic lives in one place.

const EntityDefaults = {
	capabilities() {
		return {
			canSwim: false,
			followsPaths: true,
			canOpenDoors: false,
			canWade: true,
			fireResistance: false
		};
	},

	pathfindingOptions() {
		return {};
	}
};

const EntityMethods = {

	// Returns the map's shared AStarPathfinder. All pathfinding goes through
	// one instance per map — no per-entity copies needed.
	get pathfinder() {
		return this.parent?.gameMap?.gridSystem?.pathfinder ?? null;
	},

	normalizeRegionId(regionId = 'collider') {
		switch (String(regionId || '').trim().toLowerCase()) {
			case 'interaction': return 'interaction';
			case 'select': return 'select';
			case 'hit': return 'hit';
			case 'pickup': return 'pickup';
			case 'collider':
			default: return 'collider';
		}
	},

	getHitRect() {
		return this.getRegionRect('hit') || this.getRegionRect('collider');
	},

	getCenterPoint(regionId = 'collider') {
		const rect = this.getRegionRect?.(regionId) || this.getRegionRect?.('collider');
		if (rect) {
			return {
				x: rect.left + (rect.width / 2),
				y: rect.top + (rect.height / 2)
			};
		}
		return {
			x: this.posX + (this.collider?.offsetX ?? 0) + ((this.collider?.width ?? this.size?.width ?? 0) / 2),
			y: this.posY + (this.collider?.offsetY ?? 0) + ((this.collider?.height ?? this.size?.height ?? 0) / 2)
		};
	},

	// Returns true when this entity is allowed to auto-open the given collider.
	// axis: 'x' | 'y' | undefined — when provided, doors must be perpendicular to the movement axis.
	// E/W doors (tall, vertical) block X movement; N/S doors (wide, horizontal) block Y movement.
	canAutoOpenCollider(collider, axis) {
		const dbg = window._doorDebug;
		if (!collider || !this.capabilities?.canOpenDoors) {
			if (dbg && collider && ['DOOR','GATE'].includes(collider.type)) console.log(`[canAutoOpenCollider] FAIL: canOpenDoors=${this.capabilities?.canOpenDoors}`);
			return false;
		}
		if (!['DOOR', 'GATE'].includes(collider.type)) return false;
		if (typeof collider.open !== 'function' || collider.isOpen) {
			if (dbg) console.log(`[canAutoOpenCollider] FAIL: isOpen=${collider.isOpen} hasOpen=${typeof collider.open === 'function'}`);
			return false;
		}

		if (axis && collider.facingDirection) {
			const verticalDoors = ['E', 'W']; // tall doors — block X movement
			const horizontalDoors = ['N', 'S']; // wide doors — block Y movement
			if (axis === 'x' && !verticalDoors.includes(collider.facingDirection)) {
				if (dbg) console.log(`[canAutoOpenCollider] FAIL: axis=x but door facing=${collider.facingDirection} (need E/W)`);
				return false;
			}
			if (axis === 'y' && !horizontalDoors.includes(collider.facingDirection)) {
				if (dbg) console.log(`[canAutoOpenCollider] FAIL: axis=y but door facing=${collider.facingDirection} (need N/S)`);
				return false;
			}
		}

		if (typeof collider.canAutoOpenFor === 'function' && !collider.canAutoOpenFor(this, axis)) {
			return false;
		}

		return true;
	},

	// Tries to open the collider. Returns true if the door was opened.
	tryOpenCollider(collider, axis) {
		if (!this.canAutoOpenCollider(collider, axis)) return false;
		return collider.open({
			triggeredBy: 'auto',
			actor: this,
			axis
		}) !== false;
	},

	// Euclidean distance to another entity (posX / posY duck-typed).
	getDistanceTo(other) {
		if (!other) return Infinity;
		return Math.hypot(this.posX - other.posX, this.posY - other.posY);
	},

	// Euclidean distance to an arbitrary world point.
	getDistanceToPoint(x, y) {
		return Math.hypot(this.posX - x, this.posY - y);
	}

};

function applyEntityMixin(cls) {
	Object.defineProperties(cls.prototype, Object.getOwnPropertyDescriptors(EntityMethods));
}
