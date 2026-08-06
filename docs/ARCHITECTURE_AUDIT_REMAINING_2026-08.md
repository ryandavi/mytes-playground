# Remaining Architecture Work — August 2026

**Source:** `docs/ARCHITECTURE_AUDIT_2026-07.md` and its addenda  
**Reconciled against:** the current working tree on 2026-08-05  
**Purpose:** a clean execution list containing only work that is still open, without the July audit's completed implementation history.

## Executive summary

The foundation work is substantially complete. World registration and queries, relationship cleanup, sockets and attachments, data-driven capabilities and affordances, shared movement plumbing, spatial regions, authored room semantics, follower trails, pathfinder final-pass work, stat retuning, persistence hardening, and the five-minute invariant autoplay have all landed.

The remaining architecture-critical sequence is:

1. Build the wall prototype and its render modes (**T10 / roadmap Phase 11**).
2. Add persistent wall customization and wall-face attachments (**T11 / roadmap Phase 12**).
3. Complete wall-aware schema validation and the formal browser regression gate (**T12 / Phase 14**).
4. Run the long-session performance and heap protocols (**Phase 13**).
5. Complete the editor PHP security review before any public hosting.

Walls are therefore the next implementation milestone, not an exploratory future item. `SpatialRegion`, room membership, door-room topology, `SocketSet`, and `AttachmentSystem` already provide their prerequisites.

## 1. Architecture-critical implementation

### 1.1 T10 — WallBuilder, WallRun, and render modes

**Status:** not started. The expected files `js/Map/Walls/WallBuilder.js` and `js/Map/Walls/WallRun.js` do not exist.

Implement the wall architecture specified in the July audit:

- Author wall bases in a Tiled wall layer, starting with House.
- Merge contiguous compatible wall cells into render-only `WallRun` segments; do not create a ticking interactive entity per tile.
- Compose each run from repeatable body/top/cap pieces and keep collision in grid data.
- Mark wall cells for the existing line-of-sight system.
- Add **walls up**, **walls down**, and **cutaway** display modes to the View panel.
- Re-evaluate cutaway on active-Myte room changes or meaningful camera movement, not every frame.
- Keep collision, room membership, and line of sight unchanged when only the visual mode changes.

**Dependencies already landed:** room regions, `currentRoomId`, door-room topology, grid collision, LOS checks, depth sorting, and View-panel infrastructure.

**External decision/input still needed:** confirm the first wall material asset. The audit permits a placeholder for the prototype, but the repeatable strip/cap/top layout must be settled before production art is authored.

**Acceptance gate:**

- House renders three-tile-high wall runs.
- Walls-down retains identical collision.
- Cutaway reveals the active Myte indoors.
- Pathfinding and LOS respect walls.
- Grid state is byte-identical across visual mode switches.
- Run count stays within roughly twice the room-perimeter estimate.
- The largest map maintains 60 fps and stays within the DOM budget established before implementation.

### 1.2 T11 — Wall customization and wall-face attachments

**Status:** blocked on T10; not started. `data/map-objects/wall-materials.json` does not exist.

Implement:

- `wall-materials.json` using the common sprite-sheet cell layout from the audit.
- Independent per-face material ids for interior/exterior faces.
- Stable wall-run ids and `wallCustomizations` overrides that survive regeneration.
- Map-scoped serialization of paint/wallpaper/custom material state.
- Face surface sockets with interval reservation.
- Painting attachment through the existing `AttachmentSystem`.
- Window gaps that split run segments and clear LOS blocking for their cells.
- Cutaway behavior that hides attached wall decorations with their owning segment.
- Editor support for the new schema in the same change set.

**Acceptance gate:** paint survives map reload and wall regeneration; a painting attaches through the generic attachment API, survives mode switches, and hides in cutaway; overlapping face placements are rejected; window gaps affect rendering and LOS without corrupting room topology.

### 1.3 Phase 9 conversion closure audit

**Status:** no explicit completion ledger exists for the roadmap's “map-object conversion sweep.” Most enabling work landed through T6 and T7, so this should be a focused closure audit, not a new subsystem.

Confirm that remaining object-specific occupancy and interaction state is expressed through sockets, capabilities, affordances, and relationships where appropriate. In particular, review chest occupancy, fountain drink approaches, bed sleep sockets, and any legacy surface-slot branches. Delete only code proven superseded by the shared systems.

**Acceptance gate:** a new sittable and a new edible type are discoverable from data alone; no type-name branch is needed in Myte AI; couch/bed/chest/fountain behavior remains unchanged.

## 2. Region and attachment follow-through

### 2.1 Author a real irregular-room fixture

`SpatialRegion` supports `tilemask`, but no map currently authors a tilemask room. Add an L-shaped room fixture and verify `contains()` at its concave corner. This closes architectural acceptance criterion 7 with real map data rather than unit-level capability alone.

### 2.2 Attached-child room inheritance

The audit's mounted-entity scenario requires attached children to inherit room membership from their parent and skip redundant scans while attached. Current `Entity.currentRooms` reads only the entity's own RegionManager membership and does not consult `AttachmentSystem.getAttachment(child)`.

Add parent membership inheritance for attached children, then restore independent membership on detach. Verify a carried/seated Myte crosses a room boundary with its parent and reports the same `currentRoomId` without a second region scan.

### 2.3 Deferred enclosure and zone choices

- Auto flood-fill room/enclosure generation remains deferred until after the wall system; it must emit the same `SpatialRegion` schema as authored rooms.
- Whether ambient creatures receive zone effects remains a gameplay/data decision. The mechanism exists; opt in per creature type only after deciding desired behavior.

## 3. Validation, regression, and performance gates

### 3.1 Finish T12 / Phase 14 after walls land

Current coverage already includes capabilities, sockets, spatial-region shapes, registry/relationship/attachment invariants, and a clean five-minute autoplay recording. Remaining work is:

- Extend `scripts/validate-content-data.js` for wall materials, run ids, face overrides, gaps, and customization records.
- Extend invariant checks for WallRun ids, face intervals, attachment ownership, and regeneration cleanup.
- Add wall-mode grid/LOS equality assertions.
- Run the full manual browser smoke matrix, especially drag, rub, long-press, surface-slot actions, carry, door opening, map transitions, wall modes, and editor save/reload.
- Keep editor schema handling in lockstep with every new wall field.

### 3.2 Phase 13 performance and heap protocol

The formal profile/heap gate remains open even though the five-minute invariant autoplay is green.

Run and record:

- A pre-wall DOM node count and an explicit wall DOM budget.
- A 60-second DevTools trace on the busiest map with all creatures active: no long task over 50 ms, no layout thrash, and flat style-recalculation behavior.
- A 30-minute autoplay with ten map transitions and three heap snapshots.
- Detached-DOM, listener, timer, registry, relationship, attachment, and socket-occupancy diffs after forced GC.
- Affordance-evaluation allocation/GC pressure under load.

**Acceptance gate:** heap is flat after despawn/transition cycles and there is no listener or timer growth.

## 4. Player-experience work still open

These are not wall prerequisites, but the July audit explicitly leaves them unfinished:

1. **Mobile action sidebar treatment.** The current narrow-screen overlay is documented in SCSS as provisional. Design and implement a reachable, dismissible drawer or bottom-sheet treatment that fits the Windows 98–XP visual language.
2. **Contrast check.** Reduced motion is complete, but small text and muted text on tan surfaces still need a measured contrast review and corrections through design tokens.
3. **Welcome-back moment.** Persistence is hardened, but returning after time away has no acknowledgement or summary. Define what elapsed time and stat changes should be communicated without punishing absence.

## 5. Public-hosting hard gate

### Editor PHP security review

This remains the only hard pre-public gate called out by the July audit. Review `editor/api/bootstrap.php`, `load.php`, `save.php`, `validate.php`, and `assets.php` for path traversal, arbitrary file access/write, extension and MIME validation, request-size limits, malformed JSON handling, authentication/authorization assumptions, CSRF exposure, error disclosure, and safe response headers.

Do not expose the editor publicly until this review is complete and its findings are fixed and regression-tested.

## 6. Explicitly deferred feature work

The audit describes these as future capabilities, not unfinished foundations. Keep them out of the wall milestone unless the product roadmap promotes them:

- Hats/accessories using `accessory.head` sockets and equip UI.
- Car/train-style mounts and generic moving-platform riders.
- Database-backed world customization; keep map-scoped JSON/localStorage until customizable rooms require server storage.
- Automatic RoomBuilder flood fill after wall runs are stable.
- Static pathfinding clearance fields, an optional follow-up optimization beyond the completed T16 pass.
- Image-format conversion for large spritesheets, best batched with new species or wall art.

## 7. Work that is already closed

Do not reopen these while executing the remaining list:

- Phases 1–8: cleanup/config, registry, WorldQuery, relationships, sockets/attachments, capability migration, and MovementBody.
- T9's region primitive and authored room semantics, aside from the explicit fixtures/follow-through above.
- T14 production bundle work.
- T15 follower trail and forced-door acceptance fixture.
- T16 pathfinder final pass and its packed per-search validation key follow-up.
- T17 stat bugs, retuning, recovering state, and simulation assertions.
- Action-unavailability reason contract and the graphics/notifications/tutorial settings wiring.
- Reduced motion, first-run hints, touch target sizing, horizontal-overflow fixes, persistence quarantine/backup/export/import, and runtime error visibility.
- Current capability/socket/region validation and five-minute registry invariant autoplay.

## Recommended execution order

1. Establish wall art placeholder and pre-wall DOM/performance baselines.
2. Implement T10 on House and pass wall-mode/LOS/pathfinding acceptance.
3. Add the irregular-room and attached-child membership fixtures while wall/room integration is fresh.
4. Implement T11 customization, face sockets, painting, windows, persistence, and editor parity.
5. Run the Phase 9 conversion closure audit.
6. Extend T12 validation and run the full Phase 14 browser matrix.
7. Run Phase 13 trace and heap protocols.
8. Complete mobile/contrast/welcome-back UX work.
9. Complete the editor PHP security review before public hosting.
