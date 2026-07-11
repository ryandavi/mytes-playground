// WorldRegistry — the single index of every simulated thing in the world.
//
// STATUS: IMPLEMENTED (Fable, 2026-07-05 — the T3 kernel). WorldQuery (T4)
// builds on this. API is frozen; changes need Fable sign-off.
//
// ── Contract ────────────────────────────────────────────────────────────────
// Registered entities must satisfy the entity duck-type
// (docs/ARCHITECTURE_AUDIT_2026-07.md §Proposed Entity Model): id, type,
// posX/posY/posZ, size, getRegionRect(), getCenterPoint(), capabilities.
//
// Identity: raw ids are NOT globally unique across kinds (Tiled object ids and
// myte roster ids can both be "3"), so the registry key is
// entity.worldId = "<kind>:<id>", stamped on add(). byId() takes a worldId.
// Serialization of cross-entity references always uses worldId.
//
// Ownership & lifetime:
//   - ONE registry per ContainerManager (spans map transitions; Mytes persist
//     across maps, map objects re-register on every map load).
//   - add() callers: GameMap.add (kind 'object'), GameMap.addDroppedItem
//     (kind 'item'), ContainerManager myte construction (kind 'myte').
//   - remove() callers: GameMap.removeInactiveObjects sweep, dropped-item
//     collection, GameMap.dispose, ContainerManager.dispose. remove() is the
//     future despawn hook for EntityRelationships.clearAllFor and
//     AttachmentSystem.detachAllChildren (T5/T6).
//
// Grid interplay (implemented in GameMapGrid):
//   - contributesToWalkability === false → indexed in cells for spatial
//     queries, but never affects cell walkability or collider lists
//     (mytes, dropped items).
//   - excludeFromCulling === true → never enters GridSystem.activeObjects
//     (mytes: ContainerManager owns their update/visibility).

const WORLD_ENTITY_KINDS = Object.freeze({
	MYTE: 'myte',
	OBJECT: 'object',
	ITEM: 'item'
});

class WorldRegistry {
	static _nextAnonId = 1;
	static _nextScopeId = 1;

	constructor(container) {
		this.container = container;
		this._byId = new Map();     // worldId → entity
		this._byKind = new Map();   // kind → Set<entity>
	}

	getScopedOwnerId(entity, kind) {
		if (!entity || kind === WORLD_ENTITY_KINDS.MYTE) {
			return null;
		}

		const owner = entity.gameMap || entity.parent || null;
		if (!owner) {
			return null;
		}

		if (!owner._worldRegistryScopeId) {
			owner._worldRegistryScopeId = `scope_${WorldRegistry._nextScopeId++}`;
		}

		return owner._worldRegistryScopeId;
	}

	// Registers an entity under the given kind. Stamps entity.kind and
	// entity.worldId. Assigns a fallback id when the entity has none.
	// Throws on unknown kind or duplicate registration.
	add(entity, kind) {
		if (!entity) {
			throw new Error('[WorldRegistry] add() requires an entity');
		}
		if (!Object.values(WORLD_ENTITY_KINDS).includes(kind)) {
			throw new Error(`[WorldRegistry] Unknown entity kind "${kind}"`);
		}

		if (entity.id === undefined || entity.id === null || entity.id === '') {
			entity.id = `anon_${WorldRegistry._nextAnonId++}`;
		}

		const scopedOwnerId = this.getScopedOwnerId(entity, kind);
		const typeToken = kind === WORLD_ENTITY_KINDS.OBJECT && entity.type
			? `:${String(entity.type).toLowerCase()}`
			: '';
		const baseWorldId = scopedOwnerId
			? `${kind}:${scopedOwnerId}${typeToken}:${entity.id}`
			: `${kind}:${entity.id}`;
		let worldId = baseWorldId;
		let existing = this._byId.get(worldId);
		if (existing === entity) {
			throw new Error(`[WorldRegistry] Entity already registered: ${worldId}`);
		}
		if (existing) {
			if (kind === WORLD_ENTITY_KINDS.MYTE) {
				throw new Error(`[WorldRegistry] Duplicate world id: ${worldId}`);
			}

			let suffix = 2;
			while (this._byId.has(worldId)) {
				worldId = `${baseWorldId}:${suffix++}`;
			}
		}

		entity.kind = kind;
		entity.worldId = worldId;
		this._byId.set(worldId, entity);

		let kindSet = this._byKind.get(kind);
		if (!kindSet) {
			kindSet = new Set();
			this._byKind.set(kind, kindSet);
		}
		kindSet.add(entity);
		return entity;
	}

	// Removes an entity. Idempotent — unknown/already-removed entities are a
	// no-op. THE despawn path: clears the entity's attachments and relationships
	// so no other code path has to remember to.
	remove(entity) {
		if (!entity?.worldId) return false;
		if (this._byId.get(entity.worldId) !== entity) return false;

		this.container?.attachments?.detachAllChildren?.(entity);
		this.container?.attachments?.detach?.(entity);
		this.container?.relationships?.clearAllFor?.(entity);

		this._byId.delete(entity.worldId);
		this._byKind.get(entity.kind)?.delete(entity);
		return true;
	}

	byId(worldId) {
		if (worldId === undefined || worldId === null) return null;
		return this._byId.get(String(worldId)) ?? null;
	}

	// Iterable over entities, optionally one kind. Mutation during iteration
	// is NOT supported — snapshot ([...registry.all()]) before adding/removing.
	all(kind = null) {
		if (kind === null) return this._byId.values();
		return this._byKind.get(kind) ?? [];
	}

	count(kind = null) {
		if (kind === null) return this._byId.size;
		return this._byKind.get(kind)?.size ?? 0;
	}

	// For the invariant sweeper: per-kind counts must match the population
	// arrays (container.mytes / gameMap.objects / gameMap.droppedItems).
	stats() {
		const byKind = {};
		for (const kind of Object.values(WORLD_ENTITY_KINDS)) {
			byKind[kind] = this.count(kind);
		}
		return { total: this._byId.size, ...byKind };
	}
}
