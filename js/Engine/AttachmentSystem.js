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
	}

	// Resolved socket definition for the owner's CURRENT facing (byFacing
	// applied), or null. Resolved shape:
	// { id, kind: 'seat'|'sleep'|'hold'|'surface'|'mount',
	//   position|area, facing, accepts, capacity, approach, zBias, collision }
	get(socketId) {
		throw new Error('SocketSet.get not implemented (audit task T6)');
	}

	// All resolved sockets, optionally filtered by kind.
	list(kind = null) {
		throw new Error('SocketSet.list not implemented (audit task T6)');
	}

	// World-space anchor for a socket. For 'surface' kind, surfacePoint {u,v}
	// (0..1 within the area) is required. Accounts for owner position, size,
	// and facing. Pure — no side effects; safe for AI scoring and approach
	// planning (replaces SurfaceSlotAction.getSurfaceRestPosition math).
	resolveWorldPosition(socketId, surfacePoint = null) {
		throw new Error('SocketSet.resolveWorldPosition not implemented (audit task T6)');
	}

	// Occupancy (replaces ActionSlotLedger). Occupants are entities.
	occupantsOf(socketId) {
		throw new Error('SocketSet.occupantsOf not implemented (audit task T6)');
	}

	hasCapacity(socketId, candidate = null) {
		throw new Error('SocketSet.hasCapacity not implemented (audit task T6)');
	}

	// Sockets with room for `candidate` (accepts + capacity checks), for AI
	// slot selection (replaces getAvailableActionSlots).
	availableFor(candidate, kind = null) {
		throw new Error('SocketSet.availableFor not implemented (audit task T6)');
	}
}

class AttachmentSystem {
	constructor(registry, relationships) {
		this.registry = registry;
		this.relationships = relationships;
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
		throw new Error('AttachmentSystem.attach not implemented (audit task T6)');
	}

	// Detaches child: releases capacity, clears the semantic relation,
	// restores collision, places the child at options.exitPosition (or its
	// socket's exit, or nearest valid cell), optionally seeds child velocity
	// from the parent's last frame delta (options.inheritVelocity).
	detach(child, options = {}) {
		throw new Error('AttachmentSystem.detach not implemented (audit task T6)');
	}

	// THE parent-despawn hook — called from WorldRegistry.remove(parent).
	// Detaches every child to the nearest valid position. One code path for
	// audit scenario 11.
	detachAllChildren(parent, options = {}) {
		throw new Error('AttachmentSystem.detachAllChildren not implemented (audit task T6)');
	}

	getAttachment(child) {
		throw new Error('AttachmentSystem.getAttachment not implemented (audit task T6)');
	}

	childrenOf(parent) {
		throw new Error('AttachmentSystem.childrenOf not implemented (audit task T6)');
	}

	// The single per-frame pass (see update-order decision above): for every
	// attachment, child world pos = parent pos + socket anchor (+ localOffset);
	// facing applied if inheritFacing; renderState marked dirty; child sortY =
	// parent sortY + zBias. 'anim'-mode attachments (settle/dismount tweens
	// driven by actions) are skipped here — the action owns the tween, then
	// flips mode to 'rigid'.
	update() {
		throw new Error('AttachmentSystem.update not implemented (audit task T6)');
	}

	// [{ parentId, childId, socketId, surfacePoint, localOffset }] — restore()
	// resolves ids, re-claims capacity, drops unresolvable records placing the
	// child at its own saved position.
	serialize() {
		throw new Error('AttachmentSystem.serialize not implemented (audit task T6)');
	}

	restore(records) {
		throw new Error('AttachmentSystem.restore not implemented (audit task T6)');
	}
}
