// EntityRelationships — central registry of semantic entity↔entity relations.
//
// STATUS: IMPLEMENTED (Fable, 2026-07-05). Call-site migration is task T5 —
// nothing sets relations yet; the carry/aggro/rest façades flip over in T5.
// API frozen; changes need Fable sign-off.
//
// ── Design (per audit §Entity Relationship Model) ──────────────────────────
// - Relations live HERE, not as fields on entities. Runtime uses direct object
//   references; worldIds appear only in serialize().
// - set() writes forward and inverse atomically; clear() removes both.
// - Exclusivity: setting an exclusive relation auto-clears the previous pair
//   (callers that want to forbid replacement check has() first, as today's
//   canPerform guards already do). inverseExclusive guards the other side
//   (an item can have only one carrier).
// - Spatial payload (sockets, offsets) lives in AttachmentSystem; attach()/
//   detach() write the matching semantic relation here. 'occupying'/'carrying'/
//   'riding' flow through AttachmentSystem; 'targeting'/'following' are set
//   directly.
// - WorldRegistry.remove() calls clearAllFor() — the single despawn path.
//   Each cleared pair emits 'relationship:cleared' on the core EventManager so
//   dependent actions can interrupt.
//
// DECISION (audit Q7): pendingPickup stays a plain flag; it is NOT a relation.

const RELATION_TYPES = Object.freeze({
	carrying:  Object.freeze({ inverse: 'carriedBy',  exclusive: true, inverseExclusive: true  }),
	occupying: Object.freeze({ inverse: 'occupiedBy', exclusive: false, inverseExclusive: true  }),
	riding:    Object.freeze({ inverse: 'riddenBy',   exclusive: false, inverseExclusive: true  }),
	targeting: Object.freeze({ inverse: 'targetedBy', exclusive: true, inverseExclusive: false }),
	following: Object.freeze({ inverse: 'followedBy', exclusive: true, inverseExclusive: false })
});

// name → { forwardType, isForward } for both directions.
const RELATION_NAMES = (() => {
	const names = {};
	for (const [type, def] of Object.entries(RELATION_TYPES)) {
		names[type] = { forwardType: type, isForward: true };
		names[def.inverse] = { forwardType: type, isForward: false };
	}
	return Object.freeze(names);
})();

class EntityRelationships {
	constructor(registry) {
		this.registry = registry;
		// forwardType → Map<entityA, Set<entityB>> (forward direction only;
		// inverse lookups walk the same maps via _inverseLookup).
		this._forward = new Map();
		for (const type of Object.keys(RELATION_TYPES)) {
			this._forward.set(type, new Map());
		}
	}

	_emitCleared(type, a, b) {
		this.registry?.container?.core?.eventManager?.emit?.(EVENTS.RELATIONSHIP_CLEARED, {
			type, a, b
		});
	}

	// Establishes type between a → b (and inverse b → a).
	set(type, a, b) {
		const def = RELATION_TYPES[type];
		if (!def) throw new Error(`[EntityRelationships] Unknown relation type "${type}"`);
		if (!a || !b) throw new Error(`[EntityRelationships] set(${type}) requires two entities`);
		if (a === b) throw new Error(`[EntityRelationships] set(${type}) — entity cannot relate to itself`);

		const typeMap = this._forward.get(type);

		if (def.exclusive) {
			// a may hold only one forward relation of this type.
			const existing = typeMap.get(a);
			if (existing) {
				for (const prev of [...existing]) {
					if (prev !== b) this.clear(type, a, prev);
				}
			}
		}

		if (def.inverseExclusive) {
			// b may be the target of only one relation of this type.
			for (const [holder, targets] of typeMap) {
				if (holder !== a && targets.has(b)) {
					this.clear(type, holder, b);
				}
			}
		}

		let targets = typeMap.get(a);
		if (!targets) {
			targets = new Set();
			typeMap.set(a, targets);
		}
		targets.add(b);
		return true;
	}

	// Clears a → b (and its inverse). With b omitted, clears all of a's
	// forward relations of this type. Idempotent; returns count cleared.
	clear(type, a, b = null) {
		const def = RELATION_TYPES[type];
		if (!def) throw new Error(`[EntityRelationships] Unknown relation type "${type}"`);
		const typeMap = this._forward.get(type);
		const targets = typeMap.get(a);
		if (!targets) return 0;

		let cleared = 0;
		const toClear = b ? (targets.has(b) ? [b] : []) : [...targets];
		for (const target of toClear) {
			targets.delete(target);
			cleared++;
			this._emitCleared(type, a, target);
		}
		if (targets.size === 0) typeMap.delete(a);
		return cleared;
	}

	_inverseLookup(forwardType, entity) {
		const holders = [];
		for (const [holder, targets] of this._forward.get(forwardType)) {
			if (targets.has(entity)) holders.push(holder);
		}
		return holders;
	}

	// Lookup by relation name — forward ('carrying') or inverse ('carriedBy').
	// Exclusive directions return entity|null; multi-valued return an array.
	get(name, entity) {
		const resolved = RELATION_NAMES[name];
		if (!resolved) throw new Error(`[EntityRelationships] Unknown relation name "${name}"`);
		const def = RELATION_TYPES[resolved.forwardType];

		if (resolved.isForward) {
			const targets = this._forward.get(resolved.forwardType).get(entity);
			if (def.exclusive) {
				return targets?.values().next().value ?? null;
			}
			return targets ? [...targets] : [];
		}

		const holders = this._inverseLookup(resolved.forwardType, entity);
		if (def.inverseExclusive) {
			return holders[0] ?? null;
		}
		return holders;
	}

	has(name, a, b = null) {
		const value = this.get(name, a);
		if (value === null) return false;
		if (Array.isArray(value)) {
			return b ? value.includes(b) : value.length > 0;
		}
		return b ? value === b : true;
	}

	// THE despawn hook — called from WorldRegistry.remove(). Clears every
	// relation (both directions) involving the entity.
	clearAllFor(entity) {
		if (!entity) return 0;
		let cleared = 0;
		for (const type of Object.keys(RELATION_TYPES)) {
			cleared += this.clear(type, entity);
			for (const holder of this._inverseLookup(type, entity)) {
				cleared += this.clear(type, holder, entity);
			}
		}
		return cleared;
	}

	// Forward relations only (inverses are re-derived), by worldId.
	serialize() {
		const pairs = [];
		for (const [type, typeMap] of this._forward) {
			for (const [a, targets] of typeMap) {
				for (const b of targets) {
					if (a.worldId && b.worldId) {
						pairs.push({ type, a: a.worldId, b: b.worldId });
					}
				}
			}
		}
		return pairs;
	}

	// Resolves worldIds via the registry; silently drops pairs whose entities
	// no longer exist.
	restore(pairs = []) {
		let restored = 0;
		for (const pair of pairs) {
			const a = this.registry?.byId(pair.a);
			const b = this.registry?.byId(pair.b);
			if (a && b && RELATION_TYPES[pair.type]) {
				this.set(pair.type, a, b);
				restored++;
			}
		}
		return restored;
	}

	// All relations involving an entity, for the invariant sweeper and the
	// selection sidebar.
	debugRelationsFor(entity) {
		const rows = [];
		for (const type of Object.keys(RELATION_TYPES)) {
			const targets = this._forward.get(type).get(entity);
			if (targets) {
				for (const b of targets) rows.push({ type, direction: 'forward', other: b });
			}
			for (const holder of this._inverseLookup(type, entity)) {
				rows.push({ type, direction: 'inverse', other: holder });
			}
		}
		return rows;
	}
}
