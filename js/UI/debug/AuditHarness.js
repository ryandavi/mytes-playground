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
	_activeAutoplay: null,

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
		for (const item of gameMap?.droppedItems ?? []) {
			if (!item.worldId || registry.byId(item.worldId) !== item) {
				issues.push(`dropped item ${item.id} not registered`);
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
				const entityA = registry.byId(pair.a);
				const entityB = registry.byId(pair.b);
				if (entityA && entityA.active === false) issues.push(`relation ${pair.type}: inactive a=${pair.a}`);
				if (entityB && entityB.active === false) issues.push(`relation ${pair.type}: inactive b=${pair.b}`);
			}

			for (const obj of gameMap?.objects ?? []) {
				const relatedCarrier = container.relationships.get('carriedBy', obj);
				if (obj.isPickedUp && !relatedCarrier) {
					issues.push(`picked-up object ${obj.id} missing carriedBy relation`);
				}
				if (!obj.isPickedUp && relatedCarrier) {
					issues.push(`object ${obj.id} has carriedBy relation while not picked up`);
				}
				if (obj.carrier && relatedCarrier !== obj.carrier) {
					issues.push(`object ${obj.id} carrier field mismatches carriedBy relation`);
				}
			}
		}

		// 7. Attachments, socket occupancy, and their semantic relations agree.
		if (container.attachments) {
			for (const record of container.attachments.serialize()) {
				const parent = registry.byId(record.parentId);
				const child = registry.byId(record.childId);
				if (!parent) issues.push(`attachment ${record.socketId}: dangling parent=${record.parentId}`);
				if (!child) issues.push(`attachment ${record.socketId}: dangling child=${record.childId}`);
				if (!parent || !child) continue;

				const attachment = container.attachments.getAttachment(child);
				if (attachment?.parent !== parent || attachment?.socketId !== record.socketId) {
					issues.push(`attachment ${record.childId}: lookup disagrees with serialized record`);
				}
				const socket = parent.sockets?.get?.(record.socketId);
				if (!socket) {
					issues.push(`attachment ${record.childId}: missing socket ${record.socketId}`);
					continue;
				}
				if (!parent.sockets.occupantsOf(record.socketId).includes(child)) {
					issues.push(`attachment ${record.childId}: absent from socket ${record.socketId} occupancy`);
				}
				const relationType = socket.kind === 'hold'
					? 'carrying'
					: socket.kind === 'mount' ? 'riding' : 'occupying';
				if (!container.relationships?.has?.(relationType, parent, child)) {
					issues.push(`attachment ${record.childId}: missing ${relationType} relation`);
				}
			}

			for (const parent of registry.all()) {
				for (const socket of parent.sockets?.list?.() ?? []) {
					for (const child of parent.sockets.occupantsOf(socket.id)) {
						if (!child.worldId || registry.byId(child.worldId) !== child) {
							issues.push(`socket ${parent.worldId}:${socket.id} contains unregistered occupant`);
							continue;
						}
						const attachment = container.attachments.getAttachment(child);
						if (attachment?.parent !== parent || attachment?.socketId !== socket.id) {
							const action = child.queue?.getCurrentAction?.();
							const isReservedApproach = action?._reserved === true &&
								action.target === parent &&
								action._selectedSlotId === socket.id &&
								(action.phase === 'approach' || action.phase === 'settle');
							if (!isReservedApproach) {
								issues.push(`socket ${parent.worldId}:${socket.id} occupant ${child.worldId} lacks matching attachment`);
							}
						}
					}
				}
			}
		}

		return issues;
	},

	// ── Shared: save any dump as a JSON file ─────────────────────────────────
	// Runs the game's normal autonomous AI while sampling invariants on
	// simulation time. Hidden tabs do not consume the requested duration.
	// Returns a controller immediately; await controller.promise for the report.
	autoplay({ durationMs = 5 * 60 * 1000, sampleIntervalMs = 5000 } = {}) {
		if (this._activeAutoplay) {
			throw new Error('[AuditHarness] An autoplay run is already active');
		}
		if (!Number.isFinite(durationMs) || durationMs <= 0) {
			throw new Error('[AuditHarness] durationMs must be a positive finite number');
		}
		if (!Number.isFinite(sampleIntervalMs) || sampleIntervalMs <= 0) {
			throw new Error('[AuditHarness] sampleIntervalMs must be a positive finite number');
		}

		const container = this._container();
		const samples = [];
		let elapsedMs = 0;
		let lastSimTime = SimClock.now();
		let nextSampleAt = 0;
		let frameHandle = null;
		let resolveReport;
		let controller;
		const promise = new Promise(resolve => { resolveReport = resolve; });

		const sample = () => {
			let issues;
			try {
				issues = this.invariants();
			} catch (error) {
				issues = [`invariant sweep threw: ${error?.message ?? String(error)}`];
			}
			samples.push({
				elapsedMs: Math.round(elapsedMs),
				simTime: Math.round(SimClock.now()),
				issues,
				registry: container.worldRegistry?.stats?.() ?? null
			});
		};

		const finish = reason => {
			if (this._activeAutoplay !== controller) return null;
			if (frameHandle !== null) cancelAnimationFrame(frameHandle);
			if (samples.at(-1)?.elapsedMs !== Math.round(elapsedMs)) sample();
			const issueSamples = samples.filter(entry => entry.issues.length > 0);
			const report = {
				reason,
				passed: reason === 'completed' && issueSamples.length === 0,
				durationMs: Math.round(elapsedMs),
				requestedDurationMs: durationMs,
				sampleIntervalMs,
				sampleCount: samples.length,
				issueSampleCount: issueSamples.length,
				uniqueIssues: [...new Set(issueSamples.flatMap(entry => entry.issues))],
				samples
			};
			this._activeAutoplay = null;
			resolveReport(report);
			return report;
		};

		const tick = () => {
			const now = SimClock.now();
			if (now >= lastSimTime) elapsedMs += now - lastSimTime;
			lastSimTime = now;

			if (elapsedMs >= nextSampleAt) {
				sample();
				nextSampleAt = elapsedMs + sampleIntervalMs;
			}
			if (elapsedMs >= durationMs) {
				finish('completed');
				return;
			}
			frameHandle = requestAnimationFrame(tick);
		};

		controller = {
			promise,
			stop: () => finish('stopped'),
			get samples() { return samples; }
		};
		this._activeAutoplay = controller;
		sample();
		nextSampleAt = sampleIntervalMs;
		frameHandle = requestAnimationFrame(tick);
		return controller;
	},

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
window.__invariants = () => AuditHarness.invariants();
