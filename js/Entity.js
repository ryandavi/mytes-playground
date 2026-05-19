
// Shared entity capabilities and pathfinding mixin.
// Apply to any class with: applyEntityMixin(MyClass)
// Both Myte and NpcMapObject use this so the logic lives in one place.

const EntityDefaults = {
	capabilities() {
		return {
			can_swim: false,
			follows_paths: true,
			can_open_doors: false,
			can_wade: true,
			fire_resistance: false
		};
	},

	pathfindingOptions() {
		return {};
	}
};

const EntityMethods = {

	// Creates (or recreates) the AStarPathfinder for this entity.
	// Call this once the gridSystem is available.
	initPathfinder(gridSystem) {
		if (!gridSystem) return;
		if (this.pathfinder) this.pathfinder.dispose?.();
		this.pathfinder = new AStarPathfinder(gridSystem);
	},

	// Replaces the pathfinder when the map changes.
	updatePathfinder(gridSystem) {
		this.initPathfinder(gridSystem);
	},

	// Clears the position-validation cache so stale walkability data
	// doesn't persist after a door opens or a blocker moves.
	invalidatePathfinderCache() {
		this.pathfinder?.validationCache?.clear();
	},

	// Returns true when this entity is allowed to auto-open the given collider.
	canAutoOpenCollider(collider) {
		return !!(
			collider &&
			this.capabilities?.can_open_doors &&
			['DOOR', 'GATE'].includes(collider.type) &&
			typeof collider.open === 'function' &&
			!collider.isOpen
		);
	},

	// Tries to open the collider. Returns true if the door was opened.
	tryOpenCollider(collider) {
		if (!this.canAutoOpenCollider(collider)) return false;
		return collider.open() !== false;
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
	Object.assign(cls.prototype, EntityMethods);
}
