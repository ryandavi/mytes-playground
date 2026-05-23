
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

	// Returns true when this entity is allowed to auto-open the given collider.
	// axis: 'x' | 'y' | undefined — when provided, doors must be perpendicular to the movement axis.
	// E/W doors (tall, vertical) block X movement; N/S doors (wide, horizontal) block Y movement.
	canAutoOpenCollider(collider, axis) {
		if (!collider || !this.capabilities?.canOpenDoors) return false;
		if (!['DOOR', 'GATE'].includes(collider.type)) return false;
		if (typeof collider.open !== 'function' || collider.isOpen) return false;

		if (axis && collider.facingDirection) {
			const verticalDoors = ['E', 'W']; // tall doors — block X movement
			const horizontalDoors = ['N', 'S']; // wide doors — block Y movement
			if (axis === 'x' && !verticalDoors.includes(collider.facingDirection)) return false;
			if (axis === 'y' && !horizontalDoors.includes(collider.facingDirection)) return false;
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
