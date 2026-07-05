// WorldQuery — the single spatial/capability query facade.
//
// STATUS: IMPLEMENTED (Fable, 2026-07-05). Call-site migration is task T4 —
// nothing calls this yet, so behavior parity is verified per call site as each
// caller flips over. API frozen; changes need Fable sign-off.
//
// Replaces (T4): MyteAI.getNearbyObjects/getNearbyMytes/getNearbyDroppedItems,
// NpcMapObject._detectTargets, Myte._syncCompanionBuffs scan,
// Myte.getRandomNearbyObject, BirdMapObject.findTarget's broad phase.
//
// ── Semantics (pinned to preserve current behavior exactly) ────────────────
// Broad phase: mytes + objects come from gridSystem.getObjectsInArea over a
// square padded by (radius + WorldQuery.BROAD_PHASE_PAD) — the pad preserves
// MyteAI's collider-inset guarantee. Dropped items are NOT grid-indexed
// (deliberate — the list is tiny) and come from the registry. Virtual tile
// colliders returned by getObjectsInArea have no worldId and are dropped.
//
// Narrow phase distance, measureFrom:
//   'pos'    (default) — hypot(entity.posX - x, entity.posY - y), matching
//              Entity.getDistanceTo / today's MyteAI predicates.
//   'center' — sprite center (posX + size.width/2), matching
//              GameMap.getObjectsInRadius.
//
// Liveness (activeOnly, default true) mirrors today's per-kind predicates:
//   myte   → isActive === true          (MyteAI.getNearbyMytes)
//   item   → active && !collected       (MyteAI.getNearbyDroppedItems)
//   object → active truthy              (MyteAI.getNearbyObjects)

class WorldQuery {
	static BROAD_PHASE_PAD = 64;

	constructor(registry, gameMap) {
		this.registry = registry;
		this.gameMap = gameMap;
	}

	_normalizeKinds(kind) {
		if (kind === null || kind === undefined) {
			return Object.values(WORLD_ENTITY_KINDS);
		}
		return Array.isArray(kind) ? kind : [kind];
	}

	_isAlive(entity) {
		switch (entity.kind) {
			case WORLD_ENTITY_KINDS.MYTE: return entity.isActive === true;
			case WORLD_ENTITY_KINDS.ITEM: return !!entity.active && !entity.collected;
			default: return !!entity.active;
		}
	}

	_distanceTo(entity, x, y, measureFrom) {
		if (measureFrom === 'center') {
			const cx = entity.posX + ((entity.size?.width ?? 0) / 2);
			const cy = entity.posY + ((entity.size?.height ?? 0) / 2);
			return Math.hypot(cx - x, cy - y);
		}
		return Math.hypot(entity.posX - x, entity.posY - y);
	}

	// Broad-phase candidates for the requested kinds. Deduped Set.
	_collectCandidates(x, y, radius, kinds) {
		const candidates = new Set();
		const gridSystem = this.gameMap?.gridSystem;
		const wantsGridKinds = kinds.includes(WORLD_ENTITY_KINDS.MYTE) ||
			kinds.includes(WORLD_ENTITY_KINDS.OBJECT);

		if (gridSystem && wantsGridKinds) {
			const pad = radius + WorldQuery.BROAD_PHASE_PAD;
			for (const entity of gridSystem.getObjectsInArea(x - pad, y - pad, pad * 2, pad * 2)) {
				// Virtual tile colliders and anything unregistered have no worldId.
				if (entity.worldId) candidates.add(entity);
			}
		} else if (!gridSystem && this.registry && wantsGridKinds) {
			for (const kind of kinds) {
				if (kind === WORLD_ENTITY_KINDS.ITEM) continue;
				for (const entity of this.registry.all(kind)) candidates.add(entity);
			}
		}

		if (kinds.includes(WORLD_ENTITY_KINDS.ITEM) && this.registry) {
			for (const entity of this.registry.all(WORLD_ENTITY_KINDS.ITEM)) candidates.add(entity);
		}

		return candidates;
	}

	findNearby(options = {}) {
		const {
			x, y, radius,
			kind = null,
			capability = null,
			filter = null,
			exclude = null,
			measureFrom = 'pos',
			activeOnly = true,
			excludeDragging = true,
			finitePositionsOnly = true,
			sortByDistance = true,
			limit = Infinity
		} = options;

		if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(radius)) {
			throw new Error('[WorldQuery] findNearby requires finite x, y, radius');
		}

		const kinds = this._normalizeKinds(kind);
		const excludeSet = exclude
			? new Set(Array.isArray(exclude) ? exclude : [exclude])
			: null;

		const results = [];
		for (const entity of this._collectCandidates(x, y, radius, kinds)) {
			if (!kinds.includes(entity.kind)) continue;
			if (excludeSet?.has(entity)) continue;
			if (activeOnly && !this._isAlive(entity)) continue;
			if (excludeDragging && entity.isDragging === true) continue;
			if (finitePositionsOnly &&
				(!Number.isFinite(entity.posX) || !Number.isFinite(entity.posY))) continue;
			if (capability && !entity.capabilities?.[capability]) continue;

			const distance = this._distanceTo(entity, x, y, measureFrom);
			if (distance > radius) continue;
			if (filter && !filter(entity)) continue;

			results.push({ entity, distance });
		}

		if (sortByDistance) {
			results.sort((a, b) => a.distance - b.distance);
		}

		const capped = limit === Infinity ? results : results.slice(0, limit);
		return capped.map(entry => entry.entity);
	}

	nearest(options = {}) {
		const matches = this.findNearby({
			...options,
			sortByDistance: true,
			limit: 1
		});
		return matches[0] ?? null;
	}

	// Registry-wide capability lookup (no spatial bound). Use sparingly; if a
	// call site turns hot, add a capability index inside WorldRegistry rather
	// than caching at the caller.
	findByCapability(capability, kind = null) {
		if (!capability || !this.registry) return [];
		const results = [];
		for (const k of this._normalizeKinds(kind)) {
			for (const entity of this.registry.all(k)) {
				if (entity.capabilities?.[capability] && this._isAlive(entity)) {
					results.push(entity);
				}
			}
		}
		return results;
	}
}
