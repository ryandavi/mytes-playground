// AuditHarness — console tooling that records current behavior as JSON so the
// refactor phases (docs/ARCHITECTURE_AUDIT_2026-07.md) have mechanical
// before/after acceptance instead of opinions.
//
// Usage from DevTools console:
//   __audit.dumpDepth()                     // T2 acceptance — depth/z for every object + myte
//   __audit.dumpAffordances()               // T7 acceptance — affordances for every map object
//   const rec = __audit.recordCandidates(); // T4 acceptance — AI candidate stream
//   ...let mytes roam...
//   rec.stop(); __audit.download('candidates', rec.entries);
//   __audit.download('depth-before', __audit.dumpDepth());
//
// Workflow: dump BEFORE a migration task starts, commit the JSON under
// docs/audit-baselines/, dump again after, diff. Zero diff = accepted.

const AuditHarness = {

	_container() {
		const container = MyteCore.instance?.getFirstContainer?.();
		if (!container) throw new Error('[AuditHarness] Game not initialized');
		return container;
	},

	// ── T2: depth/z snapshot ─────────────────────────────────────────────────
	// One row per object and per active myte, sorted by id for stable diffs.
	dumpDepth() {
		const container = this._container();
		const rows = [];

		for (const obj of container.gameMap?.objects ?? []) {
			rows.push({
				id: String(obj.id),
				type: obj.type,
				variant: obj.variant ?? null,
				sortY: Math.round(obj.getSortY() * 100) / 100,
				depthOffset: Math.round(obj.resolveDepthOffset() * 100) / 100,
				depthPriority: obj.getDepthPriority?.() ?? 0,
				zIndex: obj.getRenderZIndex(),
				renderLayer: obj.getRenderLayerKey?.() ?? 'objects'
			});
		}

		for (const myte of container.mytes ?? []) {
			if (!myte.renderer) continue;
			rows.push({
				id: `myte_${myte.id}`,
				type: 'MYTE',
				variant: myte.species,
				sortY: Math.round(myte.renderer.getSortY() * 100) / 100,
				depthOffset: Math.round(myte.renderer.resolveDepthOffset() * 100) / 100,
				depthPriority: myte.renderer.getDepthPriority?.() ?? 0,
				zIndex: myte.renderer.getZIndex(myte.posY),
				renderLayer: 'myte'
			});
		}

		rows.sort((a, b) => a.id.localeCompare(b.id));
		return rows;
	},

	// ── T7: affordance snapshot ──────────────────────────────────────────────
	// Fixed synthetic context so output is deterministic regardless of live
	// stats. Actor defaults to null (no carrying/occupancy exclusions from a
	// live myte leaking into the recording).
	syntheticAffordanceContext() {
		return {
			energy: 0.5,
			fun: 0.5,
			curiosity: 0.8,
			getNoveltyScore: () => 0.6
		};
	},

	dumpAffordances(actor = null, context = this.syntheticAffordanceContext()) {
		const container = this._container();
		const rows = [];

		for (const obj of container.gameMap?.objects ?? []) {
			if (typeof obj.getAiAffordances !== 'function') continue;
			rows.push({
				id: String(obj.id),
				type: obj.type,
				variant: obj.variant ?? null,
				affordances: obj.getAiAffordances(context, actor)
					.map(a => `${a.actionId}:${a.purpose ?? ''}${a.chain ? ':chain' : ''}`)
					.sort()
			});
		}

		rows.sort((a, b) => a.id.localeCompare(b.id));
		return rows;
	},

	// ── T4: AI candidate stream recorder ─────────────────────────────────────
	// Wraps planNextAction on every myte (or one), capturing the context and
	// candidate snapshots MyteAI already maintains. stop() restores the
	// original methods.
	recordCandidates(target = null) {
		const container = this._container();
		const mytes = target ? [target] : (container.mytes ?? []);
		const entries = [];
		const restorers = [];

		for (const myte of mytes) {
			if (!myte.ai) continue;
			const original = myte.ai.planNextAction.bind(myte.ai);
			myte.ai.planNextAction = () => {
				original();
				entries.push({
					t: Math.round(SimClock.now()),
					myte: myte.id,
					decision: myte.ai.lastDecisionLabel,
					context: myte.ai.lastContextSnapshot,
					candidates: myte.ai.lastCandidateSnapshot
				});
			};
			restorers.push(() => { myte.ai.planNextAction = original; });
		}

		return {
			entries,
			stop() { restorers.forEach(fn => fn()); }
		};
	},

	// ── Invariant sweeper ────────────────────────────────────────────────────
	// Cross-checks the world registry, grid index, and relationships against
	// the population arrays. Returns [] when clean; run after despawn cycles,
	// map transitions, and at the end of any registry/relationship task.
	invariants() {
		const container = this._container();
		const issues = [];
		const registry = container.worldRegistry;
		const gameMap = container.gameMap;

		if (!registry) return ['worldRegistry missing on container'];

		// 1. Registry counts match population arrays.
		const stats = registry.stats();
		if (stats.myte !== (container.mytes?.length ?? 0)) {
			issues.push(`registry mytes=${stats.myte} vs container.mytes=${container.mytes?.length}`);
		}
		if (stats.object !== (gameMap?.objects?.length ?? 0)) {
			issues.push(`registry objects=${stats.object} vs gameMap.objects=${gameMap?.objects?.length}`);
		}
		if (stats.item !== (gameMap?.droppedItems?.length ?? 0)) {
			issues.push(`registry items=${stats.item} vs droppedItems=${gameMap?.droppedItems?.length}`);
		}

		// 2. Every registered entity resolves back to itself by worldId.
		for (const entity of registry.all()) {
			if (registry.byId(entity.worldId) !== entity) {
				issues.push(`byId round-trip failed for ${entity.worldId}`);
			}
		}

		// 3. Population members are registered.
		for (const myte of container.mytes ?? []) {
			if (!myte.worldId || registry.byId(myte.worldId) !== myte) {
				issues.push(`myte ${myte.id} not registered`);
			}
		}
		for (const obj of gameMap?.objects ?? []) {
			if (!obj.worldId || registry.byId(obj.worldId) !== obj) {
				issues.push(`object ${obj.id} (${obj.type}) not registered`);
			}
		}

		// 4. Deployed mytes are grid-indexed in the CURRENT gridSystem
		//    (self-healing runs at 8 fps — a mismatch right after a map
		//    transition resolves within ~125 ms; re-run before trusting it).
		for (const myte of container.mytes ?? []) {
			if (myte.isActive && gameMap?.gridSystem && myte._gridRegistered !== gameMap.gridSystem) {
				issues.push(`deployed myte ${myte.id} not registered in current gridSystem (may resolve within 125ms)`);
			}
			if (!myte.isActive && myte._gridRegistered) {
				issues.push(`inactive myte ${myte.id} still grid-registered`);
			}
		}

		// 5. Mytes never poison walkability or collider lists.
		for (const myte of container.mytes ?? []) {
			if (!myte.isActive || !gameMap?.gridSystem) continue;
			const colliders = gameMap.gridSystem.getPotentialCollidersForArea(
				myte.posX, myte.posY, myte.size.width, myte.size.height
			);
			if (colliders.includes(myte)) {
				issues.push(`myte ${myte.id} appears as a collider`);
			}
		}

		// 6. Relationship endpoints are registered entities.
		if (container.relationships) {
			for (const pair of container.relationships.serialize()) {
				if (!registry.byId(pair.a)) issues.push(`relation ${pair.type}: dangling a=${pair.a}`);
				if (!registry.byId(pair.b)) issues.push(`relation ${pair.type}: dangling b=${pair.b}`);
			}
		}

		return issues;
	},

	// ── Shared: save any dump as a JSON file ─────────────────────────────────
	download(name, data) {
		const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${name}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
		a.click();
		URL.revokeObjectURL(url);
	}
};

window.__audit = AuditHarness;
