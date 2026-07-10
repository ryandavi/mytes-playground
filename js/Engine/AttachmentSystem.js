// SocketSet + AttachmentSystem — spatial parent/child: sockets, surfaces,
// occupancy, and the single per-frame transform-propagation pass.
//
// STATUS: INTERFACE SKELETON (audit task T6, docs/ARCHITECTURE_AUDIT_2026-07.md
// §Attachment and Socket Architecture; socket data schema in docs/SOCKET_SCHEMA.md).
// The API below is FROZEN — implement the bodies, do not change signatures or
// semantics without Fable sign-off. Methods throw until implemented.
//
// DECISIONS (closing audit soft points):
//   - ActionSlotLedger is ABSORBED: SocketSet replaces it entirely (occupancy
//     keys by socketId, not actionId). No compat layer — pre-release, data
//     migrates destructively (T6b).
//   - Update order: ContainerManager updates mytes → GameMap.update runs
//     object updates → AttachmentSystem.update() runs LAST, before
//     MapRenderer.flush. Attached children therefore never lag their parent.
//   - Actions choreograph (approach/settle/dismount, stat effects); the
//     attachment owns world position while attached. Bob and similar idle
//     motion write attachment.localOffset, never entity.posX/posY directly.

// One furniture/mount/wall face's socket collection. Constructed by
// MapObject (and later Myte, for hold/accessory anchors) from the entity's
// `sockets` config (see docs/SOCKET_SCHEMA.md for the data format).
class SocketSet {
	constructor(owner, socketsConfig) {
		this.owner = owner;
		this.socketsConfig = socketsConfig && typeof socketsConfig === 'object' ? socketsConfig : {};
		this._occupants = new Map();
	}

	_getFacing() {
		const configuredFacing = this.owner?.getConfig?.('facingDirection', null);
		return configuredFacing ?? this.owner?.facingDirection ?? this.owner?.direction ?? 'S';
	}

	_matchesCandidate(socket, candidate) {
		const accepts = Array.isArray(socket.accepts) && socket.accepts.length > 0
			? socket.accepts
			: ['myte'];
		const kind = candidate?.kind ?? (candidate?.constructor?.name === 'Myte' ? 'myte' : 'object');
		return accepts.includes(kind) || accepts.some(capability => candidate?.capabilities?.[capability]);
	}

	_claim(socketId, candidate) {
		if (!this.hasCapacity(socketId, candidate)) return false;
		let occupants = this._occupants.get(socketId);
		if (!occupants) {
			occupants = new Set();
			this._occupants.set(socketId, occupants);
		}
		occupants.add(candidate);
		return true;
	}

	_release(socketId, candidate) {
		const occupants = this._occupants.get(socketId);
		if (!occupants || !occupants.delete(candidate)) return false;
		if (occupants.size === 0) this._occupants.delete(socketId);
		return true;
	}

	// Resolved socket definition for the owner's CURRENT facing (byFacing
	// applied), or null. Resolved shape:
	// { id, kind: 'seat'|'sleep'|'hold'|'surface'|'mount',
	//   position|area, facing, accepts, capacity, approach, zBias, collision }
	get(socketId) {
		const socket = this.socketsConfig?.[socketId];
		if (!socket || typeof socket !== 'object') return null;

		const override = socket.byFacing?.[this._getFacing()];
		if (override === null) return null;
		const resolved = Utility.deepMerge({}, socket);
		delete resolved.byFacing;
		if (override && typeof override === 'object') {
			Object.assign(resolved, Utility.deepMerge(resolved, override));
		}
		return {
			id: socketId,
			kind: resolved.kind,
			accepts: ['myte'],
			capacity: 1,
			zBias: 2,
			collision: 'disabled',
			...resolved
		};
	}

	// All resolved sockets, optionally filtered by kind.
	list(kind = null) {
		return Object.keys(this.socketsConfig)
			.map(socketId => this.get(socketId))
			.filter(socket => socket && (!kind || socket.kind === kind));
	}

	// World-space anchor for a socket. For 'surface' kind, surfacePoint {u,v}
	// (0..1 within the area) is required. Accounts for owner position, size,
	// and facing. Pure — no side effects; safe for AI scoring and approach
	// planning (replaces SurfaceSlotAction.getSurfaceRestPosition math).
	resolveWorldPosition(socketId, surfacePoint = null) {
		const socket = this.get(socketId);
		if (!socket) return null;

		const ownerX = Number(this.owner?.posX);
		const ownerY = Number(this.owner?.posY);
		const width = Number(this.owner?.size?.width);
		const height = Number(this.owner?.size?.height);
		if (![ownerX, ownerY, width, height].every(Number.isFinite)) return null;

		if (socket.kind === 'surface') {
			const point = surfacePoint && typeof surfacePoint === 'object' ? surfacePoint : null;
			if (!point || !Array.isArray(socket.area?.xFactor) || !Array.isArray(socket.area?.yFactor)) return null;
			const u = Utility.clamp(Number(point.u), 0, 1);
			const v = Utility.clamp(Number(point.v), 0, 1);
			const [minX, maxX] = socket.area.xFactor;
			const [minY, maxY] = socket.area.yFactor;
			return {
				x: ownerX + width * (Number(minX) + ((Number(maxX) - Number(minX)) * u)),
				y: ownerY + height * (Number(minY) + ((Number(maxY) - Number(minY)) * v))
			};
		}

		const position = socket.position;
		if (!position || typeof position !== 'object') return null;
		return {
			x: ownerX + width * (Number(position.xFactor) || 0) + (Number(position.offsetX) || 0),
			y: ownerY + height * (Number(position.yFactor) || 0) + (Number(position.offsetY) || 0)
		};
	}

	// Occupancy (replaces ActionSlotLedger). Occupants are entities.
	occupantsOf(socketId) {
		return [...(this._occupants.get(socketId) ?? [])];
	}

	hasCapacity(socketId, candidate = null) {
		const socket = this.get(socketId);
		if (!socket || (candidate && !this._matchesCandidate(socket, candidate))) return false;
		const occupants = this._occupants.get(socketId) ?? new Set();
		return occupants.has(candidate) || occupants.size < Math.max(1, Number(socket.capacity) || 1);
	}

	// Sockets with room for `candidate` (accepts + capacity checks), for AI
	// slot selection (replaces getAvailableActionSlots).
	availableFor(candidate, kind = null) {
		return this.list(kind).filter(socket =>
			this._matchesCandidate(socket, candidate) && this.hasCapacity(socket.id, candidate)
		);
	}
}

class AttachmentSystem {
	constructor(registry, relationships) {
		this.registry = registry;
		this.relationships = relationships;
		this._byChild = new Map();
		this._childrenByParent = new Map();
	}

	_getRelationType(socket) {
		if (socket.kind === 'hold') return 'carrying';
		if (socket.kind === 'mount') return 'riding';
		return 'occupying';
	}

	_setChildPosition(child, x, y) {
		if (!Number.isFinite(x) || !Number.isFinite(y)) return;
		const previousX = child.posX;
		const previousY = child.posY;
		child.setPosition?.(x, y);
		child.setTarget?.(x, y);
		child.setSpritePosition?.(x, y);
		if (child.renderState) {
			child.renderState.posX = x;
			child.renderState.posY = y;
			child.renderState.dirty = true;
		}
		if (Math.abs((previousX ?? x) - x) >= 1 || Math.abs((previousY ?? y) - y) >= 1) {
			child.gameMap?.gridSystem?.updateObjectPosition?.(child, previousX, previousY);
		}
	}

	_getParentSortY(parent) {
		if (!parent) return 0;
		const sortY = parent.getSortY?.();
		if (Number.isFinite(sortY)) return sortY;
		return Number(parent?.posY) || 0;
	}

	_getParentRenderZIndex(parent) {
		if (!parent) return 0;

		const directZIndex = parent.getRenderZIndex?.();
		if (Number.isFinite(directZIndex)) return directZIndex;

		const rendererZIndex = parent.renderer?.getZIndex?.(parent.posY);
		if (Number.isFinite(rendererZIndex)) return rendererZIndex;

		const mapDepthZIndex = parent.parent?.getDepthZIndex?.(
			this._getParentSortY(parent),
			parent.getDepthPriority?.() ?? 0
		);
		return Number.isFinite(mapDepthZIndex) ? mapDepthZIndex : 0;
	}

	_wouldCreateCycle(parent, child) {
		for (let current = parent; current; current = this._byChild.get(current)?.parent) {
			if (current === child) return true;
		}
		return false;
	}

	// Attaches child to parent at a socket. Claims capacity, writes the
	// semantic relation ('occupying' for seat/sleep/surface, 'carrying' for
	// hold, 'riding' for mount), stores the child's pre-attach position,
	// applies the socket's collision mode, and rejects cycles (walks the
	// parent chain). Returns the Attachment record or null on refusal.
	//
	// options: { surfacePoint {u,v}, localOffset {x,y}, inheritFacing, mode:
	//   'rigid'|'anim', zBias, collision: 'disabled'|'inherit' } — all
	//   defaulted from the socket definition.
	attach(parent, child, socketId, options = {}) {
		if (!parent || !child || parent === child || this._wouldCreateCycle(parent, child)) return null;
		const sockets = parent.sockets;
		const socket = sockets?.get?.(socketId);
		if (!socket || !sockets.hasCapacity(socketId, child)) return null;

		const existing = this.getAttachment(child);
		if (existing && (existing.parent !== parent || existing.socketId !== socketId)) {
			this.detach(child);
		}
		if (!sockets._claim(socketId, child)) return null;

		const attachment = existing ?? {
			parent,
			child,
			socketId,
			previousPosition: { x: child.posX, y: child.posY },
			previousCollision: child.checkForCollisions
		};
		Object.assign(attachment, {
			parent,
			child,
			socketId,
			surfacePoint: options.surfacePoint ?? attachment.surfacePoint ?? null,
			localOffset: { x: 0, y: 0, ...(options.localOffset ?? attachment.localOffset) },
			inheritFacing: options.inheritFacing ?? attachment.inheritFacing ?? true,
			mode: options.mode ?? attachment.mode ?? 'rigid',
			zBias: options.zBias ?? socket.zBias ?? 2,
			collision: options.collision ?? socket.collision ?? 'disabled',
			relationType: this._getRelationType(socket)
		});

		if (attachment.collision === 'disabled') child.checkForCollisions = false;
		this._byChild.set(child, attachment);
		let children = this._childrenByParent.get(parent);
		if (!children) {
			children = new Set();
			this._childrenByParent.set(parent, children);
		}
		children.add(child);
		this.relationships?.set?.(attachment.relationType, parent, child);
		return attachment;
	}

	// Detaches child: releases capacity, clears the semantic relation,
	// restores collision, places the child at options.exitPosition (or its
	// socket's exit, or nearest valid cell), optionally seeds child velocity
	// from the parent's last frame delta (options.inheritVelocity).
	detach(child, options = {}) {
		const attachment = this._byChild.get(child);
		if (!attachment) return false;

		attachment.parent?.sockets?._release?.(attachment.socketId, child);
		this.relationships?.clear?.(attachment.relationType, attachment.parent, child);
		if (attachment.collision === 'disabled') {
			child.checkForCollisions = attachment.previousCollision;
		}

		this._byChild.delete(child);
		const siblings = this._childrenByParent.get(attachment.parent);
		siblings?.delete(child);
		if (siblings?.size === 0) this._childrenByParent.delete(attachment.parent);

		const exit = options.exitPosition;
		if (exit && Number.isFinite(exit.x) && Number.isFinite(exit.y)) {
			this._setChildPosition(child, exit.x, exit.y);
		}
		child._attachmentRenderZIndex = null;
		return true;
	}

	// THE parent-despawn hook — called from WorldRegistry.remove(parent).
	// Detaches every child to the nearest valid position. One code path for
	// audit scenario 11.
	detachAllChildren(parent, options = {}) {
		let detached = 0;
		for (const child of [...(this._childrenByParent.get(parent) ?? [])]) {
			if (this.detach(child, options)) detached++;
		}
		return detached;
	}

	getAttachment(child) {
		return this._byChild.get(child) ?? null;
	}

	childrenOf(parent) {
		return [...(this._childrenByParent.get(parent) ?? [])];
	}

	// The single per-frame pass (see update-order decision above): for every
	// attachment, child world pos = parent pos + socket anchor (+ localOffset);
	// facing applied if inheritFacing; renderState marked dirty; child sortY =
	// parent sortY + zBias. 'anim'-mode attachments (settle/dismount tweens
	// driven by actions) are skipped here — the action owns the tween, then
	// flips mode to 'rigid'.
	update() {
		for (const attachment of this._byChild.values()) {
			if (attachment.mode !== 'rigid') continue;
			const socket = attachment.parent?.sockets?.get?.(attachment.socketId);
			const anchor = attachment.parent?.sockets?.resolveWorldPosition?.(
				attachment.socketId,
				attachment.surfacePoint
			);
			if (!socket || !anchor) continue;
			const childWidth = Number(attachment.child?.size?.width) || 0;
			const childHeight = Number(attachment.child?.size?.height) || 0;
			const isHeldItem = socket.kind === 'hold' && attachment.child?.kind !== 'myte';
			const childAnchorX = 0.5;
			const childAnchorY = isHeldItem ? 1 : 0.5;
			this._setChildPosition(
				attachment.child,
				anchor.x - (childWidth * childAnchorX) + (attachment.localOffset?.x ?? 0),
				anchor.y - (childHeight * childAnchorY) + (attachment.localOffset?.y ?? 0)
			);
			if (attachment.inheritFacing && socket.facing) {
				attachment.child.setDirection?.(socket.facing);
			}
			const parentSortY = this._getParentSortY(attachment.parent);
			const parentZ = this._getParentRenderZIndex(attachment.parent);
			attachment.child._attachmentRenderZIndex = parentZ + attachment.zBias;
			if (attachment.child.renderState) {
				attachment.child.renderState.sortY = parentSortY + attachment.zBias;
				attachment.child.renderState.zIndex = attachment.child._attachmentRenderZIndex;
				attachment.child.renderState.dirty = true;
			}
			attachment.child.renderer?.setZIndex?.(attachment.child.posY);
		}
	}

	// [{ parentId, childId, socketId, surfacePoint, localOffset }] — restore()
	// resolves ids, re-claims capacity, drops unresolvable records placing the
	// child at its own saved position.
	serialize() {
		return [...this._byChild.values()]
			.filter(attachment => attachment.parent?.worldId && attachment.child?.worldId)
			.map(attachment => ({
				parentId: attachment.parent.worldId,
				childId: attachment.child.worldId,
				socketId: attachment.socketId,
				surfacePoint: attachment.surfacePoint,
				localOffset: { ...attachment.localOffset }
			}));
	}

	restore(records) {
		let restored = 0;
		for (const record of records ?? []) {
			const parent = this.registry?.byId?.(record.parentId);
			const child = this.registry?.byId?.(record.childId);
			if (parent && child && this.attach(parent, child, record.socketId, record)) restored++;
		}
		return restored;
	}
}
