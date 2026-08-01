# Architecture Audit & Forward Plan — Neko / Mytes

> **Implementation status — 2026-07-10:** D5 and D6 are landed on `new-ai-system` (the stats commit was cherry-picked as `40e0776`); the D2 depth fallback regression is fixed in the current working tree. T5/T7 completion is now implemented headlessly: `following` is relationship-backed for `FollowObjectAction`, Mytes advertise guarded social affordances, and social/eat/rest AI discovery uses `WorldQuery` capability broad-phases. T6/T6b are now implemented headlessly: COUCH and BED are destructively converted to sockets, `AttachmentSystem` owns seating, held items, and steady-state Myte carrying, the editor previews socket markers, and `ActionSlotLedger` is deleted. T13 and T15 are also implemented headlessly: paired social actions now synchronize kiss/high-five, and the follow system uses shared breadcrumbs, dead-band hysteresis, and throttled fallback paths. Browser acceptance remains outstanding; see the status ledger in the 2026-07-09 addendum.

**Date:** 2026-07-05
**Auditor:** Claude Fable (architect/planning role)
**Scope:** Entity architecture, rooms/zones, attachments/sockets, relationships, capability AI, walls, memory/performance, data model, refactor roadmap, delegation plan.
**Baseline:** branch `new-ai-system` @ `065dfad`. This audit builds on `docs/CODE_AUDIT.md` (2026-06-12, now historical — its items were verified fixed on 2026-07-01) and does **not** re-litigate closed items.

---

# Executive Summary

The codebase is in good shape for its size (~61K lines JS, 125 scripts). The fixed-tick loop, batched `MapRenderer` contract, grid spatial index, memoized action-definition registry, data-driven affordances, and the `ActionSlotLedger` occupancy system are all healthy foundations. **Nothing here requires a rewrite.** The June audit's performance debts were fixed and verified; this audit found the remaining hot-path issues are small and localized.

The real findings are **structural**, and they cluster around one root cause:

> **The game has three entity populations with three different contracts** — `ContainerManager.mytes`, `GameMap.objects`, and `GameMap.droppedItems` — plus a fourth half-population (lighting "rooms") and scattered pairwise relationship state. Every system that spans them (AI perception, occupancy, carrying, zone effects, depth sorting, the future wall/room system) pays a special-casing tax that grows with each feature.

Top 6 highest-impact moves, in dependency order:

1. **Unified world registry + query service** (`WorldQuery`): one place to iterate/query all simulated things (mytes, map objects, dropped items) by kind, capability, and radius, backed by the existing `GridSystem`. Nearly everything below depends on this.
2. **First-class relationships** (`EntityRelationships`): replace `carrier`/`isPickedUp`/instanceof-current-action/`aggroTarget`/`restingTarget` scatter with one registry that maintains inverse pairs and cleans up on despawn.
3. **Generalize `ActionSlotLedger` into a Socket/Attachment system**: the couch-seat slots (`slotsByFacing`, `restPosition`, occupancy) are already 70 % of a socket system. Extract position math out of `SurfaceSlotAction`, add a real "attached" state, and carried items/riding/wall-mounting all become the same mechanism.
4. **Capability tags + data-driven affordances**: move the hardcoded type checks in `MapObject.getAiAffordances` into `types.json`, and let AI/UI ask `WorldQuery.findNearby({ capability })`.
5. **One `SpatialRegion` model** for zones, lighting rooms, and future rooms/enclosures — three parallel region systems already exist and a fourth (rooms) is planned.
6. **Wall generation at map load** as render-only objects over the existing collision grid, with Sims-style display modes.

The recommendation is a **hybrid entity/component architecture** — *not* a full ECS (§ Entity Architecture Recommendation explains why).

---

# Current Architecture Assessment

Traced from the real execution paths, not filenames.

## Boot & loop

`index.php` loads ~125 scripts in dependency order (manifest-generated via `scripts/build-manifest.js`). `window.load` → `MyteCore.init()` (`js/Engine/Core.js`) preloads registries (items, actions, buffs), user, then one `ContainerManager`. The loop is RAF-driven with a fixed 20 Hz `tickUpdate` (accumulator, spiral-of-death cap, visibility pause) and a variable-rate `update`. `SimClock` advances by the same capped delta, so sim-time pauses with the tab. **This layer is correct and should not be touched.**

## Ownership graph

```
MyteCore
└── ContainerManager (per container; one in practice)
    ├── mytes: Myte[]              ← NOT in GameMap.objects, NOT in the grid index
    ├── activeMyte
    ├── camera, ui, inputHandler, settings
    └── gameMap: GameMap
        ├── objects: MapObject[]   + objectsById: Map
        ├── droppedItems: DroppedMapItem[]   ← third population, own update path
        ├── gridSystem: GridSystem  (spatial index + AStarPathfinder + culling)
        ├── zoneManager: ZoneManager (rect zones)
        ├── environmentManager: MapEnvironmentManager (lighting "rooms", presets, weather)
        ├── particleSystem, renderer: MapRenderer
        └── spawnPoints
```

## The three entity populations

| | Myte | MapObject | DroppedMapItem |
|---|---|---|---|
| Registered in grid index | **No** (only `updateMyteFrontTile` debug) | Yes | **No** |
| Update path | `ContainerManager` → `myte.update/tickUpdate` | `GameMap.update/tickUpdate` (+ sleep/wake culling) | `GameMap.update` filter loop |
| Render path | `MyteRenderer` direct style writes (with change detection) | `renderState` + `MapRenderer.flush` | own element writes |
| Position contract | `posX/posY/posZ`, `targetX/Y`, home slot derived from DOM | `posX/posY/posZ`, `renderState` | `posX/posY` + velocity |
| Regions | `getRegionRect(id, direction)` from species definition | `getRegionRect(id)` from `spatial.regions` config | ad-hoc |
| Depth sort | `MyteRenderer.resolveDepthOffset/getSortY` (duplicate impl) | `MapObject.resolveDepthOffset/getSortY` | own |
| Zone effects | Yes (`ZoneManager.update(myte)`) | **No** | No |

`js/Engine/Entity.js` (`applyEntityMixin`) is the nascent shared contract — applied to `Myte`, `MapObject`, and `NpcMapObject`. It provides distance helpers, region-id normalization, door auto-opening, and pathfinder access. This is the seed the entity unification should grow from.

## Map objects

`MapObjectFactory` merges `data/map-objects/base.json` + `types.json` (31 types) + variant + Tiled properties into `object.config`; `MapObject.getConfig('a.b.c')` reads it via string-split path walking. Class tree (healthy, mixin-based):

```
MapObject ──┬─ withAnimation ──┬─ AnimatedMapObject ─ AmbientCreatureMapObject ─ Bird / Pollinator(Bee/Butterfly) / Hive
            │                  ├─ InteractiveMapObject ─ StatefulMapObject ─ ToggleableMapObject ─ Fountain/Lantern/Chest…
            │                  └─ MovingMapObject ─ Ball, NpcMapObject ─ PatrolGuard
            ├─ withDirectional ─ Directional(Animated)MapObject ─ Door/Fence/Gate/Bed…
            └─ GrowingPlantMapObject ─ Crop/Tree/BreedingFlower/NightBloom…
```

`MapObject` (1,602 lines even after the June split) composes `ActionSlotLedger` (occupancy), `MapObjectInputController` (input), `AnimationController`, and owns render-state, shadow visuals, LOS (Bresenham over grid cells + `physics.blocksLineOfSight`), lighting config, carried state, drag/drop, affordances.

## Actions & occupancy — the strongest existing subsystem

~55 action classes registered in `ActionManager`; canonical definitions in `data/metadata/actions.json` via memoized `ActionDefinitionRegistry`. Actions declare `canPerform(selected, active)`; the queue (`MyteQueue`) runs one at a time with interrupts. `GoToObjectAction` implements a genuine **approach contract** (`approachConfig`: `allowedSides`, `gap`, `align`, `alignTo: collider`, candidate scoring, A*). `SurfaceSlotAction` extends it into a **proto-socket system**: per-facing slot definitions in `types.json` (`slotsByFacing.S[].restPosition{xFactor,yFactor}`, `restFacing`, per-slot `approachConfig`), slot claiming through `ActionSlotLedger`, settle → rest (bob) → dismount phases, collision toggling, disturbed-buff on interrupt. The COUCH type already has two seats per facing — **multi-occupancy furniture already works**.

## Carrying / holding — two parallel mechanisms

- **Myte carries Myte** (`CarryActions.js`): relationship exists only as *which action class is currently at queue[0]* (`isCarrying()` = `instanceof CarryAction…`). Position math: hardcoded `CARRY_OFFSET = 45`, frame-count durations (`currentDuration--`, frame-rate dependent).
- **Myte carries item** (`MapObject.isPickedUp/carrier` + `updateCarriedState()` + `withPickup` mixin): object side holds the authoritative link; Myte side holds it implicitly via `HoldItemAction.target`. Anchor positions come from species definitions (`Myte.getAnchoredItemPosition('carry.item' | 'mouth.item')` — directional, data-driven; good).

Two representations of "X is attached to Y and inherits its position", with different owners, different cleanup paths, and different coordinate math.

## AI — three unrelated brains

- **MyteAI** (1,591 lines): needs → drives → candidate builders → scored shortlist with randomized selection; object memory/novelty; per-tick cached spatial queries **through the grid index** (fixed since June); affordance discovery via `target.getAiAffordances(context, actor)`.
- **NpcMapObject**: 4-state FSM (idle/alert/chase/return), A* paths, own stuck detection, linear scan of `this.mytes` for aggro.
- **AmbientCreatureMapObject**: velocity wander/hover, `findTarget()` overridden per species (birds → grid query for perch objects; pollinators → flowers), own stuck detection (`blockedFrames`/`stuckFrames`), own direction-from-velocity, own path-clear sampling (`isPathToPositionClear`).

Duplicated *infrastructure*: stuck detection ×3, direction-from-velocity ×3 (`Myte._directionFromDelta`, `MovingMapObject.getMovementDirection`, `AmbientCreature.updateDirection`), target-validity checks ×3, movement integration ×3. The *behaviors* are appropriately different; the *plumbing* is not.

## Zones, rooms, environment — three parallel region systems

1. **`Zone`/`ZoneManager`** (`js/Map/GameZone.js`): axis-aligned **rects only**, from Tiled `Zone` objects; typed (rest/play/food/social/danger/boost); per-frame intersection tests per active myte (`GameMap.update` → `zoneManager.update(myte)`); effects via context buffs + per-ms stat effects from `data/metadata/zones.json`. Membership is recomputed every frame; `mytesInZone` Set exists but nothing queries "occupants."
2. **Lighting rooms** (`TileMapLoader.createLightingDataFromObjects` → `mapData.environment.rooms`): Tiled `LIGHTVOLUME` objects with bounds **and optional polygon**, plus `lightOpenings`. Consumed only by `MapEnvironmentManager` for room-darkness/light fill. A second, incompatible region representation that already supports polygons.
3. **Water** detection: zone types `water_lake`/`water_river` **plus** a grid terrain-tile proximity scan fallback (`GameMap._getWaterTileProximity`) — a third way to ask "what area am I in."

Indoor/outdoor is **per map** (`mapData.environment.location`), not per region. There is no room membership, no enclosure detection, no door-room topology.

## Walls

There is no wall system. Maps have a `Collider` tile layer (grid walkability), `Outside.tmx` has a visual `Walls` tile layer baked into the background render, and `Fence`/`Gate`/`Door` are individual barrier objects with health/open states. `physics.blocksLineOfSight` + the Bresenham LOS check are the only "occlusion" concept.

## Rendering

DOM-based world: layers `background → ground-decor → environment-back → particles → controls → foreground(objects) → environment-front → effects → debug` (`index.php:159-206`). Depth = `zIndex` from `getDepthZIndex(sortY, priority)`. Map objects go through the batched dirty-flag `MapRenderer.flush`; Mytes write styles directly but now with per-property change detection (`_lastLeft/_lastTop/_lastZIndex/_lastLift`). Culling: `GridSystem.updateCulling` sleeps off-viewport objects; `shouldSimulateOffScreen()` opts autonomous objects back into ticking.

## Persistence

User + myte roster → localStorage via `MyteRosterSchema` (consolidated in June). **World state is not persisted** — map objects, occupancy, dropped items, and (future) attachments reset on map load. No DB writes from the runtime today.

---

# Major Issues Found

Severity reflects *architectural drag on the stated roadmap* (entities, rooms, attachments, walls), not "the game is broken." No critical runtime defects were found.

## Critical (blocks the roadmap if unaddressed)

### C1. Three entity populations with divergent contracts
**Evidence:** table above; `Myte` absent from `GridSystem` (`GameMap.js:31-33`, `ContainerManager` owns `mytes`); `NpcMapObject._detectTargets` linear-scans `this.mytes` (`NpcMapObject.js:209-223`); `Myte._syncCompanionBuffs` linear-scans `parent.mytes` (`Myte.js:883-893`); zone effects apply only to mytes (`GameMap.js:906-910`); `droppedItems` have a third update/query path (`MyteAI.getNearbyDroppedItems` scans the raw array).
**Why it matters:** every planned feature (creature ↔ furniture interactions, NPC AI seeing objects, riding, room occupancy, wall occlusion) must query "what is near X" across all populations. Today each caller picks one or two populations and duplicates filtering. Birds can't be scared by mytes, NPCs can't path around dropped items, and mytes can't be found by grid queries at all.
**Systems affected:** AI (all three), collision, occupancy, zones, future rooms/walls, debug UI.
**Direction:** unified registry + query facade (see Proposed Entity Model). Mytes register in the grid index like objects do (`updateObjectPosition` on move).
**Migration risk:** Low-medium. Additive — existing arrays stay; the registry wraps them first, then callers migrate one at a time.

### C2. Relationship state is scattered and representation-fragile
**Evidence:** `MyteQueue.isCarrying()` = `getCurrentAction() instanceof CarryAction || HoldItemAction || CarryPickupAction` (`MyteQueue.js:189-200`) — the carrying *relationship* is an emergent property of the queue's head. `MapObject.carrier`/`isPickedUp`/`pendingPickup` (object side), `HoldItemAction.target` (myte side), `NpcMapObject.aggroTarget`, `AmbientCreature.restingTarget`, `ActionSlotLedger` occupant references — six unrelated encodings. Cleanup is manual per site: `HoldItemAction.interrupt/complete → _dropItem`, `PickupItemAction` clears `pendingPickup` in 6 places, `updateTargetRestBehavior` checks `restingTarget.active === false`.
**Why it matters:** the moment a second relationship interacts with a first (a myte riding a mount while holding an item; two mytes on a couch and one gets carried away), instanceof-the-current-action stops working — a queue can only encode one relationship. Stale-reference bugs (despawned target still referenced) are prevented today only by per-site defensive checks.
**Systems affected:** carrying, riding (future), sockets, AI targeting, serialization.
**Direction:** one relationship registry with paired inverses and despawn cleanup (see Entity Relationship Model).
**Migration risk:** Medium. Touches carry/pickup actions and NPC/creature targeting; migrate one relationship type at a time behind the existing query helpers (`isCarrying()` keeps its signature, changes its implementation).

## High

### H1. Three parallel spatial-region systems, and a fourth is planned
**Evidence:** `Zone` (rect-only, buffs), `environment.rooms` (rect+polygon, lighting only), water tile-scan (`GameMap.js:405-473`); `TileMapLoader` parses `Zone` and `LIGHTVOLUME` objects into different structures with different id-sanitization rules (`TileMapLoader.js:447-529`).
**Why it matters:** the requested room/enclosure system would be a *fourth* representation. Region membership ("which room/zone am I in") is answered three different ways with three different costs — per-frame rect tests, lighting-only lookups, and radius tile scans.
**Direction:** one `SpatialRegion` primitive (rect | polygon | tile-mask) + typed layers (zone/room/trigger); lighting rooms become regions with a lighting payload. See Room/Zone plan.
**Migration risk:** Medium. Zone behavior (buffs) must be preserved exactly; lighting manager keeps its own consumer logic and just reads regions from the shared store.

### H2. Affordance discovery hardcodes type logic in the base class
**Evidence:** `MapObject.getAiAffordances` (`MapObject.js:609-655`): `type === 'FOOD'`, `interactionType === 'light' | 'dance' | 'toggle' | 'social'`, harvest/water special cases, curiosity thresholds inline. Meanwhile `ai.affordances` in `types.json` already supports fully data-driven entries (COUCH does this cleanly).
**Why it matters:** adding a new interactable class of behavior means editing the *base class*; the stated goal ("a Myte can discover a new edible entity without hardcoding its type") fails today for anything but the data-driven path. Also this function allocates fresh affordance arrays + dedupe filters on every call, in every AI candidate builder, per think.
**Direction:** capability tags + conditional affordances in data (`ai.affordances[].when: { isEnabled: false }`), base class becomes a pure interpreter. See Capability model.
**Migration risk:** Low-medium — behavior-preserving data migration, verifiable by diffing affordance output per type before/after.

### H3. Occupancy is keyed by actionId, not by physical socket
**Evidence:** `ActionSlotLedger` maps `actionId → slotId → occupant`. A couch's seats belong to `use_surface_slot`; if a `sleep_on_surface` action were added, the same physical seat would have independent, conflicting occupancy books. Slot *positions* are resolved inside `SurfaceSlotAction` (`getSurfaceRestPosition`, `resolveTargetSlotPosition`), so no other system (rendering, AI scoring, UI) can ask "where is seat 2, is it free."
**Why it matters:** sockets are the foundation for sit/sleep/ride/mount/place-on-table; keying them by action makes cross-action exclusivity and future attachment reuse impossible without duplication.
**Direction:** sockets become object-level data (`sockets:` in types.json) that actions *reference*; ledger keys by socketId. See Attachment/Socket Architecture.
**Migration risk:** Medium — data migration for 5 surface-slot types + `SurfaceSlotAction` refactor; occupancy semantics must be preserved.

### H4. Attached/carried position update is fragmented and order-dependent
**Evidence:** `MapObject.updateCarriedState()` runs in the object's `update()` and reads `carrier` position — correct only if the carrier updated first (mytes update in `ContainerManager`, objects in `GameMap.update`; the ordering is incidental). Carried Myte position is set imperatively inside `CarryAction.update` on the *carrier's* queue. Surface-slot position is written by `SurfaceSlotAction` every frame (bob) via `setMyteWorldPosition`.
**Why it matters:** riding a *moving* object (mount scenario — e.g. a future car/train, or an object on a moving platform) has no home today: nothing moves an occupant when the parent moves outside these three bespoke paths. One-frame-lag artifacts and drag/teleport edge cases multiply per new attachment type.
**Direction:** single attachment pass after simulation, before render flush (see Attachment/Socket Architecture).
**Migration risk:** Medium.

## Medium

### M1. Per-frame DOM writes that bypass the renderState contract
**Evidence:** `MapObject.update()` calls `updateShadowVisual()` every frame (`MapObject.js:1597`) which `Object.assign`s 9 style properties whenever a shadow config exists — for ambient creatures `getShadowConfig()` always returns one, so every visible bird/bee writes styles every frame with no change detection. `AmbientCreatureMapObject.update → updateDebugAttributes` writes 5 `data-*` attributes per frame unconditionally (`AmbientCreatureMapObject.js:487-494`). `applySpriteVerticalVisuals` writes `style.left` + transform on every call.
**Why it matters:** exactly the class of scattered style writes `MapRenderer` was built to eliminate; costs scale with creature count.
**Direction:** move shadow + lift into `renderState` (fields: `shadowOpacity/scale`, `lift`) flushed by `MapRenderer` with dirty checks; gate `updateDebugAttributes` behind debug mode.
**Risk:** Low. Pure mechanical; verify shadows/hover visually.

### M2. Depth math re-derives config per object per frame
**Evidence:** `markPositionDirty()` (every moving object, every update) → `getSortY()` → `resolveDepthOffset()` → up to 2× `getFiniteConfigNumber` + `getConfig('physics.collision')`, each string-splitting a path (`MapObject.js:733-767, 1160-1168`); `getRenderZIndex()` adds `getDepthPriority()` (2 more).
**Direction:** resolve `_depthOffset` and `_depthPriority` once in the constructor / on `applyFacingDirection`, invalidate on config change. Same for `getRenderLayerKey`.
**Risk:** Low. One subtlety: subclasses that mutate collider at runtime must invalidate.

### M3. Duplicated movement/stuck/direction plumbing across the three brains
**Evidence:** § AI assessment. Also `MyteRenderer.resolveDepthOffset/getSortY` duplicates `MapObject`'s byte-for-nearly-byte (`MyteRenderer.js:140-164` vs `MapObject.js:733-755`).
**Direction:** extract `MovementBody` (velocity integration, blocked/stuck detection, direction-from-velocity, axis-slide fallback) shared by `MovingMapObject` and `AmbientCreature*`; extract shared depth helpers into `Entity.js` mixin or a `DepthUtils`. Do **not** merge MyteMovementController into this (its follow/orbit/leash modes are Myte-specific and healthy).
**Risk:** Medium — movement feel regressions possible; migrate one class at a time with side-by-side behavior checks.

### M4. Wall-clock time in gameplay paths
**Evidence:** `MapObject.canInteract/interact/tickUpdate` use `performance.now()` for interaction cooldowns (`MapObject.js:879-887, 1575-1581`); `PickupItemAction` stall/replan timers use `performance.now()` (fine — those are real-time UX timeouts) — but the interaction cooldown is a *gameplay* cooldown and should pause with the sim (`SimClock`). The June audit fixed most call sites; these remain.
**Direction:** switch `interactionState` timestamps to `SimClock.now()`.
**Risk:** Low.

### M5. Zone membership recomputed per frame; zones invisible to non-mytes
**Evidence:** `ZoneManager.update` runs full intersection math for every zone × every active myte × every frame (`GameZone.js:195-215`, called from `GameMap.update`); creatures/NPCs get no zone effects.
**Direction:** with the unified registry: update membership on grid-cell crossing (entities already know when they move — `updateObjectPosition`), emit enter/exit events, keep `onStay` per-tick not per-frame. Extend membership to any entity kind that opts in.
**Risk:** Low-medium — buff timing semantics must be preserved (per-ms effects currently scale by frame delta).

## Low

- **L1.** `CARRY_OFFSET = 45` magic number and frame-count durations in `CarryActions.js` (`currentDuration--` per update call → frame-rate dependent). Move to config; use ms.
- **L2.** `GameMap.createDefaultMap` still spawns a BUTTERFLY + aggro NPC slime on initial-load fallback (`GameMap.js:560-605`). Only reachable with `allowFallback: true`, but the debug NPC will confuse someone eventually. Replace with an empty map + visible toast.
- **L3.** `Zone.createVisualElement` builds label DOM for every visible zone even in production; fine, but should be debug-gated like other overlays.
- **L4.** `DroppedMapItem` duplicates simplified physics/magnet logic that overlaps `MovingMapObject`; fold into the entity unification when dropped items become registry entities (Phase 3), not before.
- **L5.** `GameMap.update` rebuilds the `droppedItems` array via `filter` every frame even when nothing changed.
- **L6.** `MapObject.interactionState` allocates 2 Maps + 1 Set per object including purely decorative ones; harmless at ~100s of objects — lazily allocate on first interaction if object counts grow 10×.
- **L7.** Two files named `BaseInputHandler.js` (`js/Input/` vs `js/Myte/Input/`) — carried over from June audit, still true, still only a confusion hazard.

---

# Entity Architecture Recommendation

**Recommendation: Hybrid entity/component architecture — formalize what already exists. Do not adopt a full ECS.**

### Why not full ECS

1. **The performance argument for ECS doesn't apply.** ECS's win is cache-coherent iteration over tens of thousands of homogeneous components. This game renders through the DOM; per-frame cost is dominated by style/layout work, not simulation iteration over ~100–500 objects. Restructuring into component arrays would optimize the cheap 10 % and leave the expensive 90 % untouched.
2. **The migration cost is total.** Every one of the ~55 action classes, three AI brains, input controllers, and the renderer contract assumes `this.target.posX`-style entity objects. A store-based ECS invalidates all of it at once — the opposite of the incremental-migration constraint.
3. **The codebase is already component-ized where it matters.** `Myte` composes 10 controllers; `MapObject` composes `ActionSlotLedger`, `MapObjectInputController`, `AnimationController`, `renderState`. These are components-by-composition with better ergonomics for a solo/AI-agent-maintained vanilla-JS project than systems-iterate-components indirection.
4. **AI-agent maintainability** favors "look at the class, see the behavior" over "trace which systems process which component sets."

### What we take from ECS/Minecraft thinking instead

- **A universal entity identity + registry** (Minecraft: everything in the world is findable and typed).
- **Capability flags/tags decoupled from class** (Minecraft: entity data tags), so queries don't use `instanceof`.
- **Shared universal state** (position, bounds, velocity where applicable) with **optional components** for everything else.
- **Systems that iterate the registry** for the few genuinely cross-cutting passes: attachment transform propagation, region membership, relationship cleanup.

### The rejected middle options

- *Improved inheritance only*: doesn't fix C1/C2 — the problems are cross-population, not intra-hierarchy.
- *Current architecture + targeted refactors only*: viable fallback, but each of sockets/relationships/rooms would then build its own mini-registry; three more parallel systems.

---

# Proposed Entity Model

## The entity contract (formalizing `Entity.js`)

Not a base class swap — a **documented duck-type + the existing mixin, enforced by registration**. Anything registered in the world registry must satisfy:

```js
// ── Universal (required) ──────────────────────────────────────
id           // string, unique per map session ("myte_3", "couch_12")
kind         // 'myte' | 'object' | 'item' | 'effect'   (coarse population)
type         // species / object type ("snail", "COUCH")
posX, posY, posZ
size         // { width, height }
active       // boolean — despawn flag
getRegionRect(regionId)   // 'collider' | 'interaction' | 'select' | 'pickup' | 'hit'
getCenterPoint(regionId)
capabilities // flat tag map: { sittable: true, canOpenDoors: true, edible: true, ... }

// ── Optional components (present when the entity has the trait) ──
velocity     // { x, y } — only movers (MovingMapObject, ambient, dropped items, Myte via controllers)
facing       // 'N'|'S'|'E'|'W' — directional entities
renderState  // MapRenderer contract — anything with an element
collider     // resolved collider box — anything solid
sockets      // SocketSet — furniture, mounts, walls (Phase 6)
relationships// via central registry, not stored on the entity (Phase 5)
ai           // brain object with tickUpdate — autonomous entities
stats/buffs  // Mytes (and later, living objects that opt in)
persistence  // serialize()/applySaved() — anything saved
```

Universal state stays **plain fields** (they already are, on all three populations — the names even match). The work is registration + filling gaps (Mytes into the grid; `kind` field; capability tags on objects), not restructuring.

## `WorldRegistry` + `WorldQuery` (new, small)

```js
class WorldRegistry {
    add(entity) / remove(entity)        // called by GameMap.add, ContainerManager myte setup, addDroppedItem
    byId(id)
    all(kind = null)                    // iterator
}
class WorldQuery {                      // facade over GridSystem + registry
    findNearby({ x, y, radius, kind, capability, filter, sortByDistance, limit })
    findByCapability(capability)        // registry-wide (rare; index if hot)
    occupantsOf(regionOrRoom)           // Phase 10
}
```

Backed by the **existing** `GridSystem` cells (objects already maintain `_gridOccupancyX/Y`; mytes and dropped items start calling `updateObjectPosition` too). `MyteAI.getNearbyObjects/getNearbyMytes/getNearbyDroppedItems`, `NpcMapObject._detectTargets`, `Myte._syncCompanionBuffs`, `BirdMapObject.findTarget` all become `WorldQuery` calls — same semantics, one implementation, and the per-tick caching in MyteAI stays as a caller-side wrapper.

## What should NOT be an entity

- **Tiles/terrain** — stay grid-cell data (`GridSystem.grid`). Never wrap tiles in objects.
- **Particles** — stay in `ParticleSystem` pools.
- **Zones/rooms/regions** — spatial data, not entities (they don't move, tick, or render in-world beyond debug).
- **Generated wall render segments** — render-only objects with `renderState` but *not* registered as interactive entities (see Wall System Plan); the *collision* stays grid data.
- **UI, home slots, buffs, actions** — unchanged.
- **Purely decorative static props** remain plain `MapObject`s — they're already entities in this model at near-zero extra cost (they just have few capabilities).

---

# Map Object / Myte Parity Plan

Target relationships after migration:

| Concern | Single source | Notes |
|---|---|---|
| Position/bounds/regions | Entity contract (exists) | Myte's direction-aware regions are a superset; MapObject's static regions are the base case |
| Spatial indexing | `GridSystem` for **all kinds** | Mytes/items register like objects |
| Proximity/capability query | `WorldQuery` | replaces 6+ bespoke scans |
| Depth sort | one `getSortY/resolveDepthOffset` (Entity mixin), cached | deletes `MyteRenderer` duplicate |
| Render flush | `MapRenderer.flush` for objects **and** Mytes | Myte gains a `renderState`; `MyteRenderer` keeps its extra visuals (battery, dialogue) but position/z go through flush |
| Occupancy/sockets | `SocketSet` + ledger keyed by socket | Phase 6 |
| Relationships | `EntityRelationships` | Phase 5 |
| Movement plumbing | `MovementBody` for map-object movers | Myte keeps `MyteMovementController` (different feature set), but shares stuck/direction helpers |
| AI perception | `WorldQuery` + capability affordances | brains stay species-specific |
| Zone/room membership | region membership system, any kind opts in | creatures finally get zone context |

**Parity non-goals:** Mytes keep their DOM home-slot duality, stats, buffs, queue, and input handling — no attempt to make map objects "little Mytes." A living map object that needs stats later opts into a `stats` component; it does not inherit from Myte.

---

# Room / Zone / Enclosure Plan

## What a zone is today

A rectangle with a type and per-ms stat/buff effects, membership recomputed per frame per myte, no occupant query surface, no polygon support. Conceptually: **a passive stat-effect area**. The rectangular limitation is real but the deeper limitation is that the *region primitive* is fused to the *zone behavior*.

## Recommended representation: one `SpatialRegion` primitive, typed layers

```js
SpatialRegion {
    id, layer,          // layer: 'zone' | 'room' | 'trigger' | 'lighting-opening'
    shape,              // { kind: 'rect', bounds } | { kind: 'polygon', points, bounds } | { kind: 'tilemask', cells, bounds }
    properties,         // layer-specific payload (zone effects, room lighting, …)
    contains(x, y)      // rect: trivial; polygon: raycast with bounds pre-check; tilemask: O(1) set lookup
    intersectionRatio(rect)
}
RegionManager {
    regionsAt(x, y, layer?)         // bounds-first broad phase (few dozen regions/map → linear over bounds is fine; add a cell index only if counts grow)
    membershipFor(entity)           // cached; recomputed on grid-cell crossing, not per frame
}
```

- **Zones** = regions on layer `zone`; `Zone`'s buff/stat logic becomes a *consumer* of enter/exit/stay events. Behavior-preserving.
- **Lighting rooms** = regions on layer `room` with a lighting payload; `MapEnvironmentManager` reads from `RegionManager` instead of its private copy. This kills the parallel system without touching lighting math.
- The API stays concrete because **behavior lives in the layer consumers**, not in the region — this avoids the "vague generic region" trap.

## Rooms and enclosures

**Author rooms in Tiled now (hybrid later).** Reasons: maps are hand-authored; the LIGHTVOLUME workflow already proves the pipeline; flood-fill enclosure detection needs the wall system to exist first (walls define the boundary edges) and is genuinely hard to get right with diagonal gaps and multi-tile doorways. The room schema should be *designed* for auto-generation so a later `RoomBuilder` (flood-fill from wall runs, Phase 11+) can emit the same structures:

```js
Room extends SpatialRegion(layer:'room') {
    // shape: tilemask preferred (flood-fillable, supports irregular rooms exactly)
    doors: [doorObjectId],          // discovered at map load: DOOR/GATE objects whose collider touches the room boundary
    openings: [regionId],           // reuses lightOpenings concept
    adjacentRooms: [roomId],        // derived from shared doors
    properties: { indoor: true, lighting, ambience, … }
}
```

- **Indoor/outdoor:** `entity.currentRoom?.properties.indoor ?? map.location === 'interior'`. Per-map location remains the fallback; rooms refine it.
- **Doors connect rooms:** at map load, for each DOOR/GATE object, find the ≤2 rooms whose tilemask borders its collider; store on both. Door open/close already updates grid walkability (`door_closed` terrain) — room topology just annotates it.
- **Rooms contain zones / zones span rooms:** yes to both — layers are independent; no containment hierarchy is enforced. A "cozy corner" zone can sit inside the bedroom room; a "danger" zone can straddle two rooms.
- **Membership: cached, event-updated.** Entities store `currentRoomId` + `currentZoneIds` (small array), recomputed only when they cross a grid cell boundary (movers already detect this to call `updateObjectPosition`). Queries stay O(1); `RegionManager` keeps reverse occupant sets per region so rooms expose `occupants` for free.
- **Irregular rooms:** tilemask handles any shape a flood fill can produce, including L-shapes and rooms with pillars. Polygons remain for lighting volumes authored as polygons.
- **Future environmental behavior** (shelter, temperature, privacy): payload properties + occupant events give AI and stats everything they need without implementing any of it now (e.g., shelter = `currentRoom?.properties.indoor` — one expression, no new system).

**What not to build:** no room *hierarchy* (buildings = a `building` property tag on rooms, not a container tree), no room-based navmesh (A* on the grid is fine), no per-frame polygon tests (bounds pre-check + cached membership).

---

# Attachment and Socket Architecture

## What already exists (audit)

- **Named sockets with occupancy:** `ActionSlotLedger` + `slotsByFacing` slot definitions (rest position as `xFactor/yFactor` of parent bounds, per-slot facing and approach config). Multi-occupancy works (COUCH: 2 seats × 4 facings).
- **Attachment anchors on Mytes:** species-defined directional anchors (`carry.item`, `mouth.item`) with item-anchor alignment (`getAnchoredItemPosition`).
- **Parent-following:** `MapObject.updateCarriedState` (item follows carrier), `CarryAction` (myte follows carrier), `SurfaceSlotAction` rest phase (myte holds slot position + bob).
- **Missing:** a persistent "attached" state outside a running action; movement inheritance from a *moving* parent; wall-face/continuous-surface placement; unified detach/cleanup.

## Model: sockets (named points) + surfaces (continuous areas), one attachment record

```js
// ── Data (types.json / species json) ─────────────────────────────
"sockets": {
    "seat_left":  { "kind": "seat",   "position": { "xFactor": 0.35, "yFactor": 0.5 }, "facing": "S",
                    "accepts": ["myte"], "capacity": 1, "approach": { …existing approachConfig… },
                    "byFacing": { "E": { "position": {…}, "facing": "E" } } },
    "surface_top":{ "kind": "surface","area": { "xFactor": [0.1, 0.9], "yFactor": [0.05, 0.25] },
                    "accepts": ["item"], "capacity": 4 },
    "carry":      { "kind": "hold",   "anchor": "carry.item" }        // myte-side, resolves via species anchors
}

// ── Runtime ──────────────────────────────────────────────────────
Attachment {
    parentId, childId,
    socketId,                  // named socket — OR —
    surfacePoint,              // { u, v } normalized position on a surface socket (tables, wall faces)
    localOffset,               // px fine-tuning (bob writes here, not to world pos)
    inheritFacing: bool,       // seats: yes; table items: no
    mode: 'rigid' | 'anim',    // rigid = recompute world pos from parent every frame; anim = transition in progress
    collision: 'disabled' | 'inherit',   // occupant collision while attached (seats: disabled — matches SurfaceSlotAction today)
    render: { zBias: +2 }      // depth relative to parent (carried items already use carrier z + 2)
}
AttachmentSystem {
    attach(parent, child, socketId | {surfacePoint})   // claims capacity, creates relationship pair, stores child's own pos
    detach(child, { exitPosition })                    // restores collision, releases socket, clears relationship
    update()                                           // ONE pass per frame: world pos of every attached child =
                                                       //   parentPos + socketPos(facing) + localOffset; marks renderState dirty
}
```

Design answers to the brief's questions:

- **Socket vs surface:** a socket is a *named, discrete* mount (seat, bed spot, rider position, hand); a surface is a *continuous area* socket where the attachment stores its own `{u,v}` (table tops, wall faces). Both are entries in the same `sockets` map, distinguished by `kind`/`area`, sharing capacity + occupancy code. Wall runs expose one surface socket per face with `u` = distance along the run.
- **Capability filtering:** `accepts` lists entity kinds/capability tags; `capacity` covers multi-occupancy (couch seats stay separate sockets for distinct rest positions; a table surface is one socket with capacity N + overlap rejection by attached-item bounds).
- **Position/facing inheritance:** always position (that's what attachment means here); facing only when `inheritFacing` (seats yes, held items no, wall paintings fixed to face normal). **Rotation beyond 4-way facing does not exist in this engine — don't add it.**
- **Velocity inheritance:** implicit — children get position from the parent every frame, so they move at parent velocity with zero extra state. On detach, optionally seed the child's velocity from the parent's last delta (moving mounts/drops).
- **Depth:** child `sortY` = parent `sortY` + `zBias` (carried items already do exactly this via `getRenderZIndex`). Attached children skip independent depth resolution.
- **Collision:** occupant collision disabled while seated (existing `SurfaceSlotAction` behavior, generalized); carried items already skip collision via `isPickedUp`. Pathfinding treats attached entities as non-blocking (their colliders deregister from grid `objectWalkable` while attached — seats sit on the parent's collider anyway).
- **Circular prevention:** `attach` walks the parent chain (≤ handful deep) and rejects cycles.
- **Parent removal:** `MapObject.remove()`/`Myte.dispose()` call `AttachmentSystem.detachAllChildren(this, { exitPosition: nearest valid cell })` — one cleanup path instead of N.
- **Persistence:** attachments serialize as `{ parentId, socketId, childId, surfacePoint }`; re-resolved by id on load; unresolvable → child placed at parent's exit position (or its own saved pos).
- **Actions become choreography, not position owners:** `SurfaceSlotAction` keeps approach/settle/dismount phases and stat effects, but settle ends in `attach(...)` and the rest-phase bob writes `localOffset.y` — the attachment system owns world position. `CarryAction`/`HoldItemAction` likewise. This is what makes "myte sits on couch while couch is dragged" work for free (today `SurfaceSlotAction` leaves the myte floating if the couch moves).

**Can one architecture cover riding/sitting/sleeping/carrying/holding/wearing/wall-mounting?** Yes — they differ only in socket kind, collision mode, and which *action* choreographs entry/exit. Wearing is the only stretch: model it as a `hold`-kind socket (`accessory.head` anchor) if/when accessories render in-world; don't pre-build it.

---

# Entity Relationship Model

## Relationships found in the current code

| Concept | Current encoding | Sites |
|---|---|---|
| carrier ↔ carried item | `obj.carrier` + `obj.isPickedUp` + `HoldItemAction.target` | withPickup, CarryActions |
| carrier ↔ carried myte | queue-head instanceof ×2 sides | CarryActions, MyteQueue |
| occupant ↔ furniture | `ActionSlotLedger` occupant refs | SurfaceSlotAction |
| aggro target | `NpcMapObject.aggroTarget` | NPC FSM |
| rest target | `AmbientCreature.restingTarget` | birds/pollinators |
| follow target | `FollowObjectAction.target` | actions |
| social targets | action `target` options throughout | SocialActions |
| pending claim | `obj.pendingPickup` | PickupItemAction |

## Recommended model

One registry, **paired inverse relations, exclusive-by-type flags**, held centrally (not as entity fields) so despawn cleanup is one pass:

```js
const RELATION_TYPES = {
    carrying:   { inverse: 'carriedBy', exclusive: true,  inverseExclusive: true  },  // one item, one carrier
    occupying:  { inverse: 'occupiedBy', exclusive: true,  inverseExclusive: false }, // myte occupies 1 socket; couch holds many
    riding:     { inverse: 'riddenBy',  exclusive: true,  inverseExclusive: false },
    targeting:  { inverse: 'targetedBy', exclusive: true, inverseExclusive: false }, // aggro/rest/follow — soft, no gameplay lock
    following:  { inverse: 'followedBy', exclusive: true, inverseExclusive: false }
};
class EntityRelationships {
    set(type, a, b)        // enforces exclusivity (auto-clears prior), writes both directions
    clear(type, a, b?)     
    get(type, a)           // → entity | null (exclusive) / array (multi)
    clearAllFor(entity)    // called from remove()/dispose() — the single despawn cleanup
    serialize() / restore(resolveId)
}
```

- **Direct object references, not ids, at runtime** — the codebase is single-map, single-thread; id indirection would ripple through every consumer for no benefit. Ids appear only in `serialize()`. Stale references are prevented by `clearAllFor` in the (now single) despawn path, plus `active` checks stay as belt-and-braces.
- **Parent-child transform relationships are the AttachmentSystem's job** (they carry socket/offset payload); the relationship registry stores the *semantic* pair (`occupying`, `carrying`, `riding`) and the attachment stores the *spatial* payload. `attach()` writes both; `detach()` clears both — callers never touch the registry directly for attachment-backed relations. Non-spatial relations (targeting, following) live only in the registry.
- **Migration is façade-first:** `MyteQueue.isCarrying()` → `relationships.get('carrying', myte) != null`; `obj.carrier` becomes a getter over the registry. Call sites don't change in Phase 5; the encodings do.
- **What stays out:** transient action `options.target` for one-shot actions (greet, inspect) — promoting every momentary target to a registry entry is noise. Rule: it goes in the registry iff *another system* needs to observe it or it must survive the action being interrupted.

---

# Capability and Interaction Model

Three concepts, kept separate on purpose, all already half-present:

1. **Capability** — a passive fact about an entity: `sittable`, `edible`, `rideable`, `waterborne`, `flammable`, `shelter`, `container`, `wallMountable`, `musicSource`. Stored as flat boolean/param tags: `capabilities: { edible: { satiety: 12 } }` in `types.json` / species json, merged the same way `capabilities` already merges on Myte/NPC (`EntityDefaults.capabilities()` pattern). Capabilities are for **queries and filtering** (`findNearby({ capability: 'edible' })`).
2. **Affordance** — a *currently available* action offer: `{ actionId, purpose, when }`. Already exists (`ai.affordances` in types.json + `getAiAffordances`). The fix (H2) is moving the base-class hardcoding into data with a small condition DSL evaluated by the base interpreter:
   ```json
   "ai": { "affordances": [
       { "actionId": "eat_element", "purpose": "consume", "when": { "capability": "edible", "actorNotCarrying": true } },
       { "actionId": "interact_object", "purpose": "light_on", "when": { "isEnabled": false } },
       { "actionId": "harvest", "purpose": "harvest", "when": { "method": "isReadyToHarvest" } }
   ] }
   ```
   `when.method` bridges to subclass predicates so growing plants keep their logic in code. Occupancy filtering stays where it is (`getAiAffordances` already drops occupied actions).
3. **Action** — the executable choreography (existing action classes + `actions.json` definitions). `canPerform` remains the authoritative availability check for both AI and UI (it already is — `ActionManager.getAvailableActions` feeds the sidebar and `getActionOptions` feeds the queue; AI goes affordance → `enqueueTargetedAction` → same queue). **No new action framework is needed.** The sit example: the chair has capability `sittable` (query), affordance `use_surface_slot` (offer), action `SurfaceSlotAction` (execution). 

Gaps to close, beyond H2:

- **`findNearby({ capability })`** on WorldQuery so AI candidate builders stop fetching *all* nearby objects and filtering by affordance one target at a time (`findTargetWithAffordance` currently calls `getAiAffordances` — allocation-heavy — per candidate per think). Broad-phase by capability tag (cheap map lookup), then affordance-check only the survivors.
- **Target invalidation:** already handled at the action level (`isTargetValid` hook in `MyteQueue.update:157`); extend the convention: actions holding a target check `target.active`, occupancy revalidated at `start()` (SurfaceSlotAction already re-claims with 3 attempts). With relationships centralized, `clearAllFor` interrupts dependent actions via a `relationship:cleared` event — that's the missing "chair was deleted mid-approach" path.
- **Static map participation:** static objects are already entities here (they're `MapObject`s in the grid); no special path needed. Room/zone context enters AI queries as filters (`findNearby({ capability: 'sittable', sameRoomAs: myte })`) once membership caching exists.
- **Species-specific behavior stays species-specific:** MyteAI's drive/candidate system, bird flight, NPC FSM are *consumers* of the shared perception layer. Do not build a universal brain.

---

# AI Architecture Plan

**Existing shared infrastructure (keep):** `Entity.js` mixin (distance/door/pathfinder), single shared `AStarPathfinder` per map, grid-backed `getObjectsInArea`, MyteAI's per-tick query caches, data-driven AI scoring (`SiteConfig.ai.candidates.*`), affordance metadata in actions.json (`ai.soothing/exertion/commitmentMs/purposeOverrides`).

**Duplicated infrastructure to consolidate (Phases 4 & 8):**

| Concern | Today | Target |
|---|---|---|
| Proximity perception | MyteAI grid query; NPC linear myte scan; birds/pollinators own grid queries | `WorldQuery.findNearby` everywhere |
| Target selection scoring | MyteAI candidates; birds random-ish pick; NPC nearest | shared `pickTarget(candidates, scoreFn)` helper; scoring stays per-brain |
| Target invalidation | 3 bespoke checks | shared `isValidTarget(t)` (active, not despawned, relationship intact) |
| Stuck detection/recovery | 3 implementations | `MovementBody.stuckCheck()` |
| Path-clear sampling | `AmbientCreature.isPathToPositionClear` + pathfinder validation cache | one helper on GridSystem |

**Performance rules (already mostly followed):** perception on think-intervals (MyteAI) or seek-chances (creatures), never per frame; broad-phase always through the grid; capability tag filter before affordance evaluation; per-tick caches for repeated queries within one think. With ~10s of creatures and 100s of objects, no further spatial structures are warranted — revisit only if entity counts grow past ~2,000.

**Boundaries:** bird flight choreography, pollinator crop-pollination, NPC aggro FSM, and Myte drives remain untouched species logic. The refactor gives them the same *eyes* (WorldQuery), *vocabulary* (capabilities/affordances), and *legs plumbing* (MovementBody), not the same mind.

---

# Wall System Plan

## Constraints discovered

- Walls today = `Collider` tile layer (grid unwalkability) + baked visual tiles; the renderer is DOM-per-object with y-sorted z-index; `blocksLineOfSight` + Bresenham LOS already exist; `environment.rooms`/`lightOpenings` already describe interior volumes for lighting.
- The camera is top-down-ish with vertical sprite fakery (`posZ` lift) — "between camera and subject" reduces to **"south/east of the subject and overlapping the subject's screen region"**, which in a y-sorted world means: wall segments whose `sortY > subject.sortY` and whose footprint is within the occlusion band below/right of the subject's room.

## Architecture

**1. Authoring (Tiled):** a `Walls` object layer (or tile layer with a `wall` tileset class) defining wall *bases* — 1-tile-thick runs. Properties: `material`, `height` (in tiles, default 3), optional `exterior: true`. Doors/windows keep being objects placed on wall tiles.

**2. Map-load generation (`WallBuilder`, new):**
   - Read wall base cells → mark grid cells unwalkable (replaces/augments today's Collider layer for wall tiles) and `blocksLineOfSight`.
   - **Merge collinear adjacent cells into wall runs** (horizontal/vertical spans). One run = one render object + two faces (N/S or E/W). Corner cells belong to both runs, deduped for render by the corner-owner rule (horizontal run wins).
   - Segment runs where DOOR/GATE/window objects overlap → runs get `gaps: [{u0,u1,objectId}]`.
   - Emit `WallRun` records and hand rooms/enclosure data to `RegionManager` (Phase 11+: flood-fill open floor bounded by wall cells + closed doors → candidate room tilemasks, reconciled with authored rooms).

**3. Runtime representation:** `WallRun` is a **render-only object** — it has `renderState`, an element, `getSortY`, and surface sockets per face, but it is *not* an interactive entity (no input controller, no interaction state, no per-run tickUpdate). Collision stays grid data (walls never move). This caps per-wall cost: a 40-tile wall is ~4–8 runs, not 40 objects.

**4. Rendering:** one `div` per run per face-relevant part, using **repeated tile assets** via `background-repeat` on a sized element (fits the DOM renderer; no canvas geometry, no generated sprites needed). Height = `height × tileSize` px drawn *upward* from the base (negative top offset), `sortY` = base line y (bottom edge), so mytes north of a wall render behind it and south render in front — the existing depth system handles this with zero changes. Interior face vs exterior face = two background layers or one element per face where materials differ.

**5. Display modes** (global mode on `GameMap`, applied via a container class + per-run state):
   - **Walls Up:** full height. Nothing special.
   - **Walls Down:** container class `walls-down`; each run element gets `height: baseStub` (CSS class swap, one style write per run per mode change). Collision, rooms, LOS unchanged — only render height.
   - **Cutaway:** per-run evaluation, throttled (on active-myte room change or camera move > threshold, not per frame): hide/shorten runs where **(a)** run belongs to the active myte's current room boundary or any room between it and the screen-south edge, **and (b)** the run's face normal points away from the subject (south walls of the room, and east/west walls south of the subject's y). Exterior walls (`exterior: true`) and north walls stay up. Operate **per run segment** (the pieces between gaps) — per-tile is too granular (visual noise + element count), per-room-boundary too coarse (long shared walls). Transition = CSS height/opacity animation.
   - Room membership from Phase 10 makes "the active myte's room" a cached lookup; without rooms, cutaway can ship in a degraded band mode (hide any run whose footprint is within N px south of the subject and overlapping its x-range) — acceptable for the prototype.

**6. Cost control:** runs not tiles; mode changes are class swaps; cutaway evaluation event-driven; wall elements live in the `objects` layer for correct y-sorting but are `pointer-events: none`.

**7. Interaction with existing systems:** doors already toggle grid walkability + terrain cost; window/painting placement uses face surface sockets (next section); lighting rooms gain real geometry to attach to; `blocksLineOfSight` marking makes the existing Bresenham LOS respect walls for free.

---

# Customizable Walls Plan

Data model (builds directly on the socket/surface architecture):

```js
WallRun {
    id,                       // stable: "wall_{mapId}_{x0}_{y0}_{axis}"  — derived from base tiles, survives regeneration
    axis, cells: [gridCoords], height, material,        // generated
    faces: {
        south: { materialId, socket: { kind:'surface', axis:'u', range:[0,1] } },
        north: { materialId, socket: {…} }
    },
    gaps: [{ u0, u1, objectId, kind: 'door'|'window' }]
}
```

- **Per-face material slots:** yes — interior/exterior and room-vs-room faces differ (Sims wallpaper model). `materialId` references a `wall-materials.json` registry (texture, stub texture, tint); **runs store only the id**, never material data.
- **Customization storage & regeneration survival:** paint/wallpaper/attachments are stored as **overrides keyed by cell-range, not by run id**: `{ mapId, axis, cells:[x,y…] or range, face, materialId }` in a `wallCustomizations` store (map JSON now; DB per-user later — same shape). After `WallBuilder` regenerates runs, overrides re-apply by intersecting cell ranges; a run id change (wall extended/split in the editor) cannot orphan paint.
- **Wall-mounted objects** (paintings, windows, shelves): standard attachments to a face's surface socket with `surfacePoint.u` + width in u-units. Occupancy = interval reservation on the face (`reserve(u0,u1)` — reject overlaps); windows/doors pre-reserve their gap intervals. A painting knows its wall face because its attachment record says so — no coordinate hacks.
- **Windows/doors cut wall space:** they are `gaps` — the run renders around them (split segments), grid cells under doors follow door state, cells under windows stay unwalkable but get `blocksLineOfSight: false` (light and LOS pass through).
- **Damage/seasonal overlays later:** additional layered classes/materials on the face element; the per-face element structure supports compositing without schema change.
- **Editor/user customization path:** the existing `editor/` app edits types.json and maps; wall material picking is an editor feature writing `wallCustomizations` — same data the runtime reads, so user-facing room customization later is a permissions/UI problem, not an architecture problem.

---

# Design Language and UI Consistency

New UI needed by these systems, and what to reuse (per `AGENTS.md` tokens and existing components):

| Need | Reuse |
|---|---|
| Wall-mode toggle (Up / Cutaway / Down) | `ViewPanel` pattern (`js/UI/Panels/ViewPanel.js`) — segmented toggle like existing overlay toggles; icons in system-glyph style |
| Socket/occupancy debug overlay | `DebugOverlayUI` + `GridSystem` debug canvas conventions (`overlayFlags` pattern) |
| Room/zone inspector rows | `getSidebarStatusRows`/`getSidebarDetailRows` contract already on MapObject — add rows, don't add panels |
| Placement/attachment UI (drag painting onto wall) | existing drag pipeline (`DragComponent`, drop-target validation `checkDropValidity`) + `is-drag-over`/`is-droppable` classes |
| Material picker (editor) | editor's `SpriteSetEditor` panel patterns; runtime picker later reuses `ModalWindow` + inventory grid styles |
| Toasts/errors | `ToastSystem` |

Rules: no new one-off panel styles; all spacing/borders from `_tokens.scss` (`--border-width: 5px` bevels, `--radius-xs/sm`, `--surface-*`); no gradients/blur; SCSS source only, compile with `npx sass css/style.scss css/style.css --no-source-map`. Any new component proposal must first show which existing component was considered and why it can't be generalized.

---

# Data Model Plan

| Data | Lives in | Notes |
|---|---|---|
| **Definition data** (object types, sockets, capabilities, affordances, actions, buffs, species, wall materials, zone types) | `data/**/*.json` registries | Single source; editor edits these. Sockets/capabilities extend `types.json`; add `data/map-objects/wall-materials.json` |
| **Authored map data** (tiles, wall bases, zones, room volumes, spawn points, placed objects, doors) | Tiled `.tmx` + object properties | Tiled stays authoring truth; keep property names aligned with runtime keys |
| **Generated map data** (grid cells, wall runs, room tilemasks, door-room topology, region indexes) | Runtime only — built by `TileMapLoader`/`WallBuilder`/`RoomBuilder` at load | Never serialized; must be deterministically re-derivable from authored data |
| **Runtime state** (positions, relationships, attachments, occupancy, AI memory, buff timers) | JS objects / registries | DOM is never a source of truth (June rule, keep enforcing) |
| **Visual/render state** (`renderState`, wall display mode, culling, debug overlays) | Runtime, renderer-owned | Never persisted except user prefs (wall mode default → user preferences) |
| **Persistent player state** (roster via `MyteRosterSchema`, inventory, settings, playtime) | localStorage now; PHP/MySQL later | Same serialized shape for both backends |
| **Persistent world state** (wall customizations, placed furniture, attachments) — *future* | map-scoped JSON now → per-user DB rows later | Schema: keyed by stable ids/cell-ranges (see walls); design serialization now, ship storage later |

Guardrail: **generated data must never be edited in place** (e.g., don't write paint onto a WallRun and save the run) — always store the override and re-derive, or map regeneration silently loses state.

---

# Refactor Roadmap

Order adjusted from the brief to match real dependencies: relationships and attachments need the registry; capability queries need capabilities in data; rooms benefit from region unification; walls need rooms only for full cutaway. Each phase is shippable and behavior-preserving unless stated.

### Phase 1 — Safe cleanup *(no dependencies)*
Fix M1 (shadow/lift into renderState, debug-gate creature attributes), M2 (cache depth offset/priority/layer key), M4 (SimClock for interaction cooldowns), L1 (carry constants → config, ms durations), L2 (empty fallback map), L7 (rename `js/Myte/Input/BaseInputHandler.js` → `MyteBaseHandler.js`).
**Goals:** zero per-frame DOM writes outside `MapRenderer.flush`/`MyteRenderer` change-detected paths; no `performance.now()` in gameplay cooldowns.
**Files:** `MapObject.js`, `MapRenderer.js`, `AmbientCreatureMapObject.js`, `CarryActions.js`, `GameMap.js`, `SiteConfig.js`.
**Risks:** shadow visual regressions. **Acceptance:** shadows/hover/carry visually identical; grep shows no style writes in `update()` paths; game boots console-silent. **Don't touch yet:** entity registration, any API shape.

### Phase 2 — Shared config & single sources of truth *(no dependencies)*
Consolidate the duplicated depth-sort implementation (MyteRenderer ⇄ MapObject) into the Entity mixin; move remaining inline AI/creature literals (`AmbientCreature` idle/hover durations, NPC defaults) to `SiteConfig`/types.json; document the entity contract in `Entity.js` as the canonical duck-type.
**Acceptance:** one `getSortY/resolveDepthOffset` implementation; `Entity.js` header documents the contract. **Don't touch:** movement code.

### Phase 3 — World registry & entity registration *(dep: P2)*
Add `WorldRegistry`; register mytes, objects, dropped items with `kind`; mytes and dropped items start updating the grid index on movement (`updateObjectPosition`). Existing arrays (`mytes`, `objects`, `droppedItems`) remain and stay authoritative for update order.
**Files:** new `js/Engine/WorldRegistry.js`; `ContainerManager.js`, `GameMap.js`, `GameMapGrid.js`, `Myte.js`, `DroppedMapItem.js`.
**Risks:** grid cell churn from mytes (verify culling/collision unaffected — mytes must be excluded from `objectWalkable` computation). **Acceptance:** grid query at a myte's cell returns the myte; long-run session shows no registry growth after despawns. **Don't touch:** callers still use old query paths.

### Phase 4 — WorldQuery migration *(dep: P3)*
Add `WorldQuery.findNearby`; migrate `MyteAI.getNearby*`, `NpcMapObject._detectTargets`, `Myte._syncCompanionBuffs`, `BirdMapObject.findTarget`, `Myte.getRandomNearbyObject` (keep per-tick caches as wrappers).
**Acceptance:** all proximity scans route through WorldQuery (grep `parent.mytes` / `gameMap.objects` filters shows none in AI paths); AI behavior unchanged in observation (same candidates logged for a fixed seed/scenario).

### Phase 5 — Relationship registry *(dep: P3)*
Add `EntityRelationships`; migrate carrying (both kinds), pendingPickup (→ short-lived `claiming` relation or keep as flag — decide by diff size), aggro/rest/follow targets. Facade methods keep signatures.
**Risks:** carry edge cases (drag interrupt, map transition while carrying). **Acceptance:** despawning any entity clears all its relations in one pass (test: remove a carried item mid-carry, remove a chair mid-approach); `isCarrying` truth table unchanged.

### Phase 6 — Socket/Attachment system *(dep: P5)*
`SocketSet` + `AttachmentSystem` + `attach/detach`; migrate `types.json` surface-slot definitions to `sockets` (keep `actionConfigs.use_surface_slot` for durations/effects; slots move); `ActionSlotLedger` re-keys by socketId (or is absorbed); `SurfaceSlotAction` delegates position ownership; carried items switch `updateCarriedState` → attachment pass; carried mytes switch CarryAction position math → attachment.
**Risks:** highest-touch phase — settle/dismount feel, bob, collision toggling, exit positions. **Acceptance:** couch multi-seat unchanged; myte remains seated when couch is dragged; carried item/myte behavior identical; scenario tests §8 nos. 2, 4, 5, 8, 11 pass. **Don't touch:** wall/surface `u,v` sockets (schema supports, nothing uses them yet).

### Phase 7 — Capability & affordance data migration *(dep: P4)*
Capability tags in `types.json`/species; `getAiAffordances` base hardcoding → data with `when` conditions; `WorldQuery` capability filter; AI candidate builders use capability broad-phase.
**Acceptance:** affordance output per type byte-identical before/after (scripted diff across all 31 types × states); a new edible test-type is discoverable by AI with zero JS changes.

### Phase 8 — AI infrastructure consolidation *(dep: P4, P6)*
`MovementBody` extraction (MovingMapObject + AmbientCreature), shared stuck/direction/target-validity helpers, shared `pickTarget`.
**Risks:** movement feel. Migrate Ball → creatures → NPC in that order. **Acceptance:** birds/bees/ball/NPC behavior indistinguishable in 10-minute observation; the three stuck-detection implementations are deleted.

### Phase 9 — Map-object conversion sweep *(dep: P6, P7)*
Re-express remaining special cases through sockets/capabilities/relationships (chest occupancy, fountain drink spots, bed as multi-socket). Delete superseded per-type code.
**Acceptance:** the architectural tests in the Concrete Acceptance Criteria all pass.

### Phase 10 — Region unification & rooms *(dep: P3; independent of P5-9, can run parallel after P4)*
`SpatialRegion` + `RegionManager`; Zone becomes a layer consumer (behavior-preserving); lighting rooms move into RegionManager; membership caching on cell-crossing; entities get `currentRoomId/currentZoneIds`; door-room topology at load; zone effects opt-in for creatures.
**Acceptance:** zone buffs/stat effects identical (before/after stat traces); lighting unchanged; `myte.currentRoom` correct across door transitions; membership updates only on cell crossings (counter assert).

### Phase 11 — Wall system prototype *(dep: P10 for full cutaway; degraded mode possible after P1)*
`WallBuilder` (runs from Tiled wall layer), WallRun render objects, three display modes, cutaway per run segment, `blocksLineOfSight` marking. One map (House) converted.
**Acceptance:** House renders 3-tile walls; walls-down keeps collision; cutaway reveals active myte indoors; LOS/pathfinding respect walls; run count ≤ ~2× room count perimeter estimate; 60 fps maintained with walls on the largest map.

### Phase 12 — Wall customization *(dep: P11, P6)*
`wall-materials.json`, per-face materials, `wallCustomizations` overrides, face surface sockets, window/painting attachment with interval reservation.
**Acceptance:** paint persists across map reload & wall regeneration; painting attaches to a face and survives mode switches (hidden with wall in cutaway); overlapping placements rejected.

### Phase 13 — Performance pass *(dep: all)*
Profile long session (30+ min): registry/relationship/attachment leak check, grid churn from myte registration, wall element counts, GC pressure from affordance evaluation. Fix what profiling shows — no speculative work.
**Acceptance:** heap flat after despawn cycles; no listener/timer growth across 10 map transitions (count assertions in a debug harness).

### Phase 14 — QA & regression *(continuous, formal gate here)*
Scenario suite (§ Concrete Acceptance Criteria) run in browser; `scripts/validate-content-data.js` extended to validate sockets/capabilities/regions schemas; `/verify`-style manual passes for input gestures (drag, rub — per project memory these are fragile).

---

# Delegation Plan

Model routing: **Fable** — architecture decisions, cross-system phases (P5, P6 design, P10 design), review gates. **Opus/Sonnet** — well-scoped in-repo refactors with existing patterns to imitate. **Codex** — mechanical migrations, data transforms, validation scripts, high-volume implementation against a fixed spec.

## Fable pre-delegation checklist (do these BEFORE handing off T3+)

Readiness today: **T1, T2, T14, T12, and the headless balance sim are paste-ready now.** T3–T11 need the following Fable pre-work first — each item exists because a worker would otherwise invent it:

1. ✅ **DONE 2026-07-05 — interface skeletons committed:** `js/Engine/WorldRegistry.js`, `WorldQuery.js`, `EntityRelationships.js`, `AttachmentSystem.js` (SocketSet + AttachmentSystem) exist as frozen APIs — final signatures, contracts and invariants in comments, bodies throwing `not implemented`, registered in the script manifest. Workers implement against these; signature changes need Fable sign-off.
   **Update, same day: Fable implemented the T3 kernel personally** (the "hardest ambiguous work" slice): WorldRegistry is fully implemented (worldId = `kind:id` namespacing — raw Tiled/roster ids collide across kinds); GameMapGrid gained `_isPassthrough`/`_blocksMovement` helpers guarding all nine walkability/collider/culling sites (mytes and items are spatially indexed but never block cells, never appear in collider lists, never enter `activeObjects`); Mytes self-heal their grid registration in the existing 125 ms bookkeeping block (map transitions recreate the GridSystem — the myte re-registers automatically) and deregister on stop/dispose; registry wiring landed in GameMap (add/addDroppedItem/removeInactiveObjects/collect/dispose) and ContainerManager (setupMytes runs once — verified; dispose). Bonus fix: `updateObjectPosition` no longer invalidates the pathfinder validation cache for walkable movers — previously every butterfly step cleared the LRU ~20×/s. Remaining T3 work for a worker: none — needs the browser verification in docs/CODEX_GOALS.md, then T4/T5 unblock.
2. ✅ **DONE 2026-07-05 — recording harness shipped (working code, not a skeleton):** `js/UI/Debug/AuditHarness.js` exposes `window.__audit` with `dumpDepth()` (T2 acceptance), `dumpAffordances()` with a fixed synthetic context (T7 acceptance), `recordCandidates()` (T4 acceptance), and `download()`. Baselines get committed under `docs/audit-baselines/` before each migration task starts. **Remaining human step: boot the game once and run each dumper to confirm they work live.**
3. ✅ **DONE 2026-07-05 — soft decisions closed in `docs/SOCKET_SCHEMA.md`:** frozen `sockets` schema + worked COUCH conversion, exhaustive `when` DSL grammar, and the decisions log (ActionSlotLedger **absorbed**, `pendingPickup` **stays a flag**, occupancy keyed by `(entityId, socketId)`, attachment update order, WallRun id confirmed).
4. **Do the T6 vertical slice personally.** T6 is the highest-risk phase. Fable implements `AttachmentSystem` + converts exactly **one** object (the couch) end-to-end, verifies feel in browser, then delegates the horizontal rollout (remaining types, carry migration, data transform) with the working couch as the reference implementation. Never delegate the first instance of a new pattern. *(Do after T3–T5 land.)*
5. ✅ **DONE 2026-07-05 — `docs/SMOKE_CHECKLIST.md` written.** Every task prompt ends with "run docs/SMOKE_CHECKLIST.md and report results".
6. ✅ **PARTIALLY DONE 2026-07-05 — dispatch file recreated:** fresh `docs/CODEX_GOALS.md` contains paste-ready blocks D1 (=T1, Sonnet), D2 (=T2, Sonnet), D3 (=T14 bundle, Codex), D4 (headless balance sim, Codex), plus the blocked-task queue. Remaining ongoing part: one task = one branch off `new-ai-system`, Fable diff-reviews against spec before merge, browser-verifies phase gates (end of P1, P4, P6, P10, P11), and adds new dispatch blocks only when dependencies land. Baseline-recording convention documented in `docs/audit-baselines/README.md`. Browser baseline (ES2021+, evergreen) written into AGENTS.md.

Resolved decisions these tasks may rely on: hybrid (no ECS); registry wraps existing arrays; direct refs + central registry for relationships; sockets object-level, occupancy by socketId; regions = rect|polygon|tilemask with typed layers; walls = render-only runs over grid collision; rooms authored in Tiled first.

---

### T1 — Phase 1 cleanup bundle — **Sonnet**
**Goal:** eliminate uncontracted per-frame DOM writes; SimClock cooldowns; config-ify carry constants.
**Scope:** exactly items in Phase 1. **Files:** `js/Map/MapObjects/MapObject.js`, `js/Map/MapRenderer.js`, `js/Map/MapObjects/AmbientCreature/AmbientCreatureMapObject.js`, `js/Myte/Queue/Actions/CarryActions.js`, `js/Engine/Config/SiteConfig.js`, `js/Map/GameMap.js`.
**Dependencies:** none. **Risks:** shadow/lift visual regressions.
**Acceptance:** no `style.` writes inside any `update(deltaTime)` except via flush paths; shadows/hover/carry visually identical; console-silent boot.
**Spec prompt:** *"In the Neko codebase (see AGENTS.md): (1) Move MapObject shadow visuals into the renderState/MapRenderer.flush contract: add `renderState.shadow = {opacity, scale, visible}` computed in `updateShadowVisual()` (rename to `computeShadowVisual`), apply styles only in `MapRenderer.flush/flushOne` when changed; keep the imperative path in `updatePosition()`. (2) Gate `AmbientCreatureMapObject.updateDebugAttributes` behind `document.body.classList.contains('debug')`, cached per creature per frame. (3) Change `MapObject.interactionState` timestamps (`canInteract`, `interact`, `tickUpdate` cooldown sweep) from `performance.now()` to `SimClock.now()`. (4) In CarryActions.js: replace `CARRY_OFFSET=45` with `SiteConfig.myte.carryOffset` (add key, value 45); convert CarryPickupAction/CarryPutdownAction frame-count durations (`currentDuration--`) to deltaTime-ms accumulation with the same total default duration (100 ms). (5) In `GameMap.createDefaultMap`, remove the BUTTERFLY and NPC spawns; keep dimensions/spawn points and show a ToastSystem warning 'Map failed to load — empty fallback map created'. Do not change any other behavior; boot the game and verify shadows, bird hover, myte carry, and interaction cooldowns behave identically."*

### T2 — Depth math caching + dedupe — **Sonnet**
**Goal:** M2 + P2 depth consolidation.
**Files:** `MapObject.js`, `MyteRenderer.js`, `js/Engine/Entity.js`.
**Dependencies:** T1 merged. **Risks:** stale cache after `applyFacingDirection` / collider mutation.
**Acceptance:** depth values identical for all 31 types + mytes (write a temp harness logging `getSortY/getRenderZIndex` for every object before/after); one implementation of `resolveDepthOffset`.
**Spec prompt:** *"Cache MapObject depth resolution: compute `this._depthOffset`, `this._depthPriority`, `this._renderLayerKey` in the constructor from the existing resolveDepthOffset/getDepthPriority/getRenderLayerKey logic; make those methods return the cached values; add `invalidateDepthCache()` called from `applyFacingDirection` and anywhere `config.spatial`/`config.visual`/`collider` mutate. Then move the shared body of resolveDepthOffset/getSortY into `EntityMethods` in js/Engine/Entity.js parameterized by (depthLine, depthOffset, colliderBottom, sizeHeight) and have MapObject and MyteRenderer both delegate — MyteRenderer reads from `myte.definition`, MapObject from config. Verify with a debug-console harness that sortY/zIndex are unchanged for every object on Outside and House maps and for mytes."*

### T3 — WorldRegistry + grid registration (Phase 3) — **Opus**
**Goal:** every simulated entity registered and grid-indexed.
**Files:** new `js/Engine/WorldRegistry.js`; `ContainerManager.js`, `GameMap.js`, `js/Map/Grid/GameMapGrid.js`, `Myte.js`, `js/Map/MapObjects/DroppedMapItem.js`; `scripts/script-manifest.json` + rebuild.
**Dependencies:** T2. **Risks:** mytes affecting walkability (must not — add a `contributesToWalkability` flag defaulting false for kind 'myte'/'item'); culling must ignore mytes (they have their own visibility model).
**Acceptance:** `gridSystem.getObjectsInArea` over a myte's position returns it; walkability grids byte-identical before/after; 10 map transitions leak nothing (registry size returns to baseline).
**Spec prompt:** include the entity-contract table from this document §Proposed Entity Model, the flag requirement above, and the acceptance harness description.

### T4 — WorldQuery + AI query migration (Phase 4) — **Opus**
**Goal:** one proximity query implementation.
**Files:** new `js/Engine/WorldQuery.js`; `MyteAI.js`, `NpcMapObject.js`, `Myte.js` (`_syncCompanionBuffs`, `getRandomNearbyObject`), `BirdMapObject.js`.
**Dependencies:** T3. **Risks:** subtle selection-semantics drift (padding, active/dragging filters, sort order) — the spec must pin exact current predicates per call site (they are quoted in this audit).
**Acceptance:** for a fixed scenario, MyteAI's `lastCandidateSnapshot` sequences match pre-migration recordings; NPC aggros at identical distances.

### T5 — EntityRelationships (Phase 5) — **Fable designs API (done in this doc), Opus implements**
**Files:** new `js/Engine/EntityRelationships.js`; `MyteQueue.js`, `CarryActions.js`, `MapObjectBases.js` (withPickup), `NpcMapObject.js`, `AmbientCreatureMapObject.js`, `Myte.js`/`MapObject.js` remove().
**Dependencies:** T3. **Risks:** carry interrupts during drag/map transition.
**Acceptance:** despawn-cleanup tests (remove carried item mid-carry; remove chair mid-approach; map transition while carrying) leave no dangling refs (debug assertion sweep); all existing carry gestures work in browser.

### T6 — Socket/Attachment system (Phase 6) — **Fable leads/reviews; Opus implements runtime; Codex does the types.json data migration**
Split: **T6a (Opus):** `SocketSet`/`AttachmentSystem` + SurfaceSlotAction/Carry migration per §Attachment Architecture. **T6b (Codex):** mechanical `types.json` transform (`actionConfigs.use_surface_slot.slots*` → top-level `sockets` with `byFacing`), plus a validation script asserting the transform is lossless (every old slot reachable as a socket; editor `MapObjectPreview` updated to read both during transition).
**Dependencies:** T5. **Risks:** highest of the plan — settle/dismount feel, collision toggling, exits.
**Acceptance:** §8 scenarios 2, 4, 5, 8, 11; couch-drag-while-seated works; editor still previews slots.

### T7 — Capability/affordance data migration (Phase 7) — **Codex**
**Goal:** H2 — base-class affordance logic → data.
**Files:** `data/map-objects/types.json`, `data/mytes/*.json`, `MapObject.js` (`getAiAffordances` → interpreter), `scripts/validate-content-data.js`, new `js/Engine/WorldQuery.js` capability filter.
**Dependencies:** T4. **Risks:** silent affordance drift.
**Acceptance:** scripted before/after diff of `getAiAffordances(context, actor)` output across all types × representative states is empty; validator rejects unknown capability tags and malformed `when` clauses.
**Spec prompt:** must include the full current hardcoded logic (quote `MapObject.js:609-655`) and the `when` DSL grammar (`capability`, `isEnabled`, `method`, `actorNotCarrying`, `contextGate:{path,op,value}`), and require the diff harness be written **first**.

### T8 — MovementBody consolidation (Phase 8) — **Opus**
**Files:** new `js/Map/MapObjects/MovementBody.js`; `MovingMapObject.js`, `AmbientCreatureMapObject.js`, `BallMapObject.js`, `NpcMapObject.js`.
**Dependencies:** T4. **Risks:** movement feel; do Ball first, then creatures, then NPC, with a manual observation checklist per species.

### T9 — SpatialRegion/RegionManager + rooms (Phase 10) — **Fable designs (done); Opus implements; Codex migrates lighting-room parsing**
**Files:** new `js/Map/Regions/…`; `GameZone.js`, `TileMapLoader.js`, `MapEnvironmentManager.js`, `GameMap.js`, `Myte.js`/`MapObject.js` (membership cache hooks).
**Dependencies:** T3 (membership hooks use movement events). **Risks:** zone buff timing, lighting regressions.
**Acceptance:** stat traces identical; lighting identical; membership-update counters show cell-crossing-only recomputation; `currentRoomId` correct in House.

### T10 — WallBuilder + render modes (Phase 11) — **Fable reviews design against implementation; Codex implements** (well-specified, mechanical-heavy: run merging, element generation, CSS modes)
**Files:** new `js/Map/Walls/WallBuilder.js`, `WallRun.js`; `TileMapLoader.js`, `GameMap.js`, `ViewPanel.js` (mode toggle), SCSS (`css/` via SCSS source only), `data/maps/House.tmx` (wall layer authoring — flag for human/Fable).
**Dependencies:** T9 for full cutaway (degraded band mode acceptable first). **Risks:** depth-sort interactions, performance with many runs.
**Acceptance:** per Phase 11.

### T11 — Wall customization (Phase 12) — **Codex**, after T6 + T10, spec per §Customizable Walls.

### T12 — Validation & regression harness — **Codex, can start anytime**
**Goal:** extend `scripts/validate-content-data.js` for sockets/capabilities/regions; add a debug-mode invariant sweeper (`window.__invariants()`: no relationship pointing at inactive entity, no occupied socket without inverse relation, registry size vs population arrays match) callable from DebugPanel.
**Acceptance:** validator runs in CI-style npm script; sweeper clean after a scripted 5-minute autoplay.

---

# Concrete Acceptance Criteria

Architectural tests (each must be demonstrable in the running game or a debug harness):

1. **New living object reuse:** a new ambient creature type (e.g. FIREFLY) ships with a JSON type entry + a subclass overriding only `findTarget`/flight visuals — no copied movement/stuck/direction code (post-P8).
2. **New sittable without AI edits:** adding `sockets` + `ai.affordances` to a new LOG type in types.json makes mytes autonomously sit on it — zero changes to MyteAI or any action class (post-P6/P7).
3. **Capability discovery:** a new type tagged `capabilities.edible` is found and eaten via `findNearby({capability:'edible'})` with no type-name checks anywhere (post-P7).
4. **Rider without duplicated state:** a mount (e.g. a car-like rideable) accepts an occupant purely via socket + `occupying`/`riding` relations; the myte carries no mount-specific fields (post-P6).
5. **Multi-occupancy:** two mytes sit on the couch simultaneously, in distinct seats, with correct facings; a third is refused (works today; must survive P6).
6. **Painting = generic attachment:** a painting attaches to a wall face using the same `AttachmentSystem.attach` call shape as a table item (post-P12).
7. **Irregular room:** an L-shaped room is represented (tilemask) and `contains()` answers correctly at its concave corner (post-P10).
8. **Efficient room transitions:** a myte crossing three rooms updates `currentRoomId` exactly at boundaries, with membership recomputation only on cell crossings (counter-asserted) (post-P10).
9. **Cutaway integrity:** cutaway mode reveals the active myte indoors while grid walkability, room membership, and LOS blocking are unchanged (assert grid state equality across mode switches) (post-P11).
10. **Paint survives regeneration:** wall paint applied, map reloaded, wall layer re-generated → paint intact (post-P12).
11. **Despawn hygiene:** destroying any entity clears relationships, attachments, socket occupancy, registry, and grid index in one pass — invariant sweeper clean after scripted create/attach/destroy cycles (post-P5/P6).
12. **Long-session stability:** 30-minute autoplay with map transitions: flat heap after GC, zero orphaned listeners/timers (existing dispose paths + registry counters) (P13 gate).
13. **Continuous playability:** after every phase, the manual smoke set passes — boot console-silent, drag/rub gestures, autonomous AI activity, surface-slot sit, carry, door auto-open, map transition, editor loads.

Scenario walkthroughs (§8 of the brief) — how the target architecture answers each; use these as design tests during P6 review:

| # | Scenario | Authoritative position | Key mechanics |
|---|---|---|---|
| 1 | Myte rides a moving mount (planned: car/train, not boats) | Mount | `occupying`+`riding`; rigid attachment to `seat` socket; myte pos derived each frame post-sim; velocity implicit; myte collider deregistered; pathfinding ignores rider; AI suspended into a `riding` action; detach at a stop/exit position; persist `{mountId, socketId}` |
| 2 | Myte sits in chair | Chair (while attached) | as today's SurfaceSlotAction, but position owned by attachment; bob via `localOffset` |
| 3 | Myte sleeps in bed | Bed | same as 2 with `sleep` choreography action + different socket kind/effects |
| 4 | Myte carried by Myte | Carrier | `carrying`; hold-socket at carrier's `carry.item` anchor; carried myte's queue runs `being_carried` (AI paused); detach restores collision + seeds position |
| 5 | Myte holds item | Myte | existing anchors become hold sockets; item renderZ = carrier z + bias (already true) |
| 6 | Myte wears accessory (hats — confirmed future) | Myte | hold-socket variant (`accessory.head` anchors per direction, static, z-order flips when facing N); build after P6 per Addendum §3 |
| 7 | Object on moving platform | Platform | same attachment pass; surface socket with `{u,v}`; proves the pass is generic (no myte involvement) |
| 8 | Multiple mytes on couch | Couch | distinct seat sockets; independent attach/detach; occupancy via socket capacity (works today, preserved) |
| 9 | Painting on wall side | WallRun | face surface socket; interval reservation; renders with the face, hides in cutaway |
| 10 | Window in wall | WallRun | a `gap`, not an attachment: reserves interval, splits render segments, clears LOS-block for its cells |
| 11 | Parent removed with children attached | — | `detachAllChildren` → children placed at nearest valid cell, relations cleared, sockets released — single code path |
| 12 | Mounted entity crosses map regions | Parent | region membership recomputed for parent on cell crossing; attached children inherit `currentRoomId` from parent (skip their own scan while attached) |

---

# Questions / Unknowns

> **Status note:** items 1, 2, and 5 were **resolved by the owner on 2026-07-05** — see the Addendum below, which overrides this section where they conflict. They are kept (struck through) only to show what was assumed during the original audit.

1. ~~**Boats/mounts timeline**~~ — **Resolved:** there will be **no boats**. Car/train-style mounts are plausible later; the riding/socket design applies to them unchanged. Nothing mount-specific is built until a mount type is designed.
2. ~~**Wearables**~~ — **Resolved:** hats/accessories are a confirmed future feature; implement via `accessory.head` anchors after P6 (see Addendum §3). Don't build inventory-equip UI before then.
3. **Wall art direction** — repeated-tile DOM rendering assumes wall tile assets (per material, per face, top/edge caps) will be authored. Confirm asset pipeline before T10; canvas-drawn placeholder acceptable for prototype. Sheet layout is specified in the Addendum.
4. **Room authoring ownership** — assumed you'll author room volumes/wall layers in Tiled for existing maps (House first). Auto-flood-fill is deferred to post-P11.
5. ~~**Multiplayer ambitions**~~ — **Resolved:** no multiplayer planned. Direct-object-reference relationships stand; the cheap future-proofing disciplines in the Addendum apply (ids in serialization, registry mutation funnels). Do not build networking abstractions.
6. **DB persistence of world state** — assumed localStorage/JSON stays the store through this roadmap; MySQL schema comes when user-customizable rooms ship. The serialization shapes are DB-ready.
7. **`pendingPickup`** — kept as a flag vs promoted to a `claiming` relation; decide in T5 by whichever yields the smaller diff (lean: keep the flag).
8. **Creature zone effects** (P10 opt-in) — gameplay question: *should* bees care about danger zones? Architecture supports it; enabling is a per-type data choice.

---

*End of audit. Sections of this document are written to be handed directly to worker models — each Delegation Plan task embeds or references its full spec. Fable retains: P5/P6/P10 API sign-off, T6/T10 design review, and any deviation from the resolved decisions listed at the top of the Delegation Plan.*

---

# Addendum — 2026-07-05 follow-up decisions (owner input)

These resolve several Questions/Unknowns and adjust task scope. Worker models should treat this section as overriding the assumptions above where they conflict.

1. **No data-compatibility constraints.** The game is pre-release with no external users. All data migrations (T6b sockets, T7 capabilities, roster/stat schemas) may be **breaking**: migrate the JSON files in place and delete legacy key aliases (e.g. the `energy|energyDelta|energyRestore|energyBoost` alias absorption in `MyteStats.normalizeStatEffects`) rather than dual-reading. Canonicalize key names *now*, before the editor entrenches them.
2. **Mounts: no boats; cars/trains are plausible.** No design change — a car is a rideable entity with seat sockets; a train is a rideable following a patrol-style route (`PatrolAction` pattern on a MovingMapObject). Scenario 1 mechanics apply unchanged. Nothing to build until a mount type is designed.
3. **Hats/accessories confirmed as a future feature.** The species anchor system (`spatial.anchors` + `MyteDefinitionRegistry.getSpatialAnchor(definition, anchorId, direction)`) is the foundation: add `accessory.head` anchors per direction alongside the existing `carry.item`/`mouth.item`. Rendering: accessory is a child element of the myte sprite root positioned by the anchor, with per-direction offset and z-order (behind the sprite when facing N). Accept a static per-direction anchor first — per-animation-frame head tracking is an authoring burden to defer. Items gain `wearable: { socket: "accessory.head" }` in `items.json`. Fits the P6 hold-socket model; schedule after P6, not before.
4. **Multiplayer: not planned, but keep the cheap disciplines** (§ below). Do **not** build network abstractions, authority flags, or id-indirection at runtime.
5. **Myte↔myte interactions are a priority.** `ActionSync` (two-party barrier used by `GreetAction`/`GreetReceiveAction`), `FollowObjectAction`, and myte-carrying already exist. New work:
   - **T13 — PairedSocialAction base + kiss/high-five (Opus, after P5):** extract the greet pattern (solicit target → busy/refusal check → both approach mirrored facing positions → `ActionSync` barrier → synced expressions → shared cooldown) into a `PairedSocialAction` base; implement `kiss` and `high_five` on it; refusal path plays a disappointed emote on the initiator. Use `following` relationship (P5) for follow. Frame-count durations in SocialActions (`currentDuration--`) convert to ms like T1 does for CarryActions.
   - **Mytes advertise affordances like objects do:** MyteAI's social candidate builder hardcodes myte-target actions; in P7, give `Myte` a `getAiAffordances(context, actor)` (greet/play_tag/show_affection/kiss…, gated by relationship state and busy checks) so social discovery uses the same pipeline as object discovery.

## Multiplayer-insurance disciplines (adopt now, cost ≈ 0)

- DOM is never authoritative state (existing rule — keep enforcing).
- Every entity has a stable string id; **serialization always uses ids** even though runtime uses direct references (already the P5/P6 design).
- All relationship/attachment/occupancy mutations go through the registries — single funnels that a server could validate later.
- Gameplay time from `SimClock` only (T1 finishes this).
- Player *intent* stays separated from *effect* via the action queue (already true) — never mutate sim state directly from UI handlers.

## Wall spritesheet format (answers "how should the wall spritesheet work")

**Mental model (for the asset author):** you do not draw walls. You draw a handful of small, repeatable strips per material, and the renderer tiles/stacks them into a wall of any length via CSS `background-repeat` — a vertical 3-slice: two end **caps** + a **body** that repeats sideways to fill the run, with a thin **top strip** repeated along the top for the wall's thickness. Draw ~5 tiles once and a 2-tile wall and a 40-tile wall both come for free.

One sheet per material. Grid unit = map cell (32 px). `H` = wall height in px, canonically **96** (3 cells); bump to 128 for taller rooms — keep `body`, both caps, the side face and the jamb all at the same `H`. The renderer reads every piece's rectangle from `wall-materials.json`, so exact offsets are data, never hard-coded.

### Pieces (per material)

| Piece | Size | Tiling | Seam rule — what must line up | Used for |
|---|---|---|---|---|
| front `body` | 32 × H | repeat-x | Left edge = right edge, pixel-for-pixel | Middle of every south-facing run |
| front `capL` / `capR` | 32 × H (2 tiles) | none | Outer edge = finished corner; inner edge matches `body` | Run ends, and clean edges where a door/window cuts the wall |
| `top` strip | 32 × 16–32 | repeat-x | Left = right; bottom edge aligns to `body` top | The "thickness" strip seen above the face |
| `stub` (walls-down) | 32 × 24–32 | repeat-x | Left = right; its **own** top edge baked in | Short knee-wall the run collapses to in walls-down mode |
| `side` face | 32 × H | repeat-**y** | Top edge = bottom edge (tiles vertically) | E/W-facing (vertical) runs, seen side-on |
| `jamb` / trim | 32 × H | none | Match `body` height; one clean edge facing the opening | Finished reveal drawn at window/door gap edges |

Height is drawn **upward** from the base (negative `top` offset); `sortY` = the base line, so mytes south of a wall render in front and those north render behind — existing depth system, zero changes.

### Default sheet packing

A clean starting layout (coordinates are top-left, art px; whole sheet **160 × 148** at H=96). Any packing works as long as the coordinates match `wall-materials.json`:

| Region | x | y | w | h |
|---|---|---|---|---|
| front `body` | 0 | 0 | 32 | 96 |
| front `capL` | 32 | 0 | 32 | 96 |
| front `capR` | 64 | 0 | 32 | 96 |
| `side` face | 96 | 0 | 32 | 96 |
| `jamb` | 128 | 0 | 32 | 96 |
| `top` strip | 0 | 96 | 32 | 24 |
| `top` capL / capR | 32 / 64 | 96 | 32 | 24 |
| `stub` body | 0 | 120 | 32 | 28 |
| `stub` capL / capR | 32 / 64 | 120 | 32 | 28 |

### Data structure — `data/map-objects/wall-materials.json`

Field names below are illustrative (the wall renderer lands in Phase 12 / T10); the shape is the contract — every piece is a plain `{x, y, w, h}` rect into the sheet, plus a `repeat` hint. `WallRun.faces.*.materialId` references a key here; runs store only the id, never material data.

```jsonc
{
  "plaster": {
    "sheet":  "walls/plaster.png",
    "cell":   32,
    "height": 96,                                   // H — must match the tall pieces
    "front": {
      "body": { "x": 0,  "y": 0,   "w": 32, "h": 96, "repeat": "x" },
      "capL": { "x": 32, "y": 0,   "w": 32, "h": 96 },
      "capR": { "x": 64, "y": 0,   "w": 32, "h": 96 },
      "top":  { "x": 0,  "y": 96,  "w": 32, "h": 24, "repeat": "x" },
      "stub": { "x": 0,  "y": 120, "w": 32, "h": 28, "repeat": "x" }
    },
    "side": { "body": { "x": 96, "y": 0, "w": 32, "h": 96, "repeat": "y" } },
    "jamb": { "x": 128, "y": 0, "w": 32, "h": 96 }
  }
}
```

### Composition & customization

A `WallRun` element is: one body div (`front.body` repeat-x) + two cap divs + one top-strip div. Mode switches swap which row the body uses (full ↔ `stub`) via a CSS class; cutaway just hides run segments (no art). Interior vs exterior face = a second material sheet (identical layout) — `faces.south.materialId` / `faces.north.materialId` pick independently. Wallpaper/paint = another material sheet reusing the same layout, so runtime customization is purely a `materialId` swap; keep every material's pieces in the same cells so overrides re-apply cleanly after regeneration (see Customizable Walls Plan §"Customization storage & regeneration survival").

**Authoring checklist (one material):** new sheet, transparent bg, everything snapped to the 32 px grid → pick `H` → draw `body` (test L↔R seam) → `capL`/`capR` (finished outer edge) → `top` strip (seamless, bottom aligned to body top) → `stub` (own baked top edge) → `side` face (tiles top-to-bottom) → `jamb` → record every rect into `wall-materials.json`. For an interior look or repaint, duplicate the sheet, restyle, keep the same cells.

## Further-inspection list (areas this audit did not deep-dive)

Ranked by risk-when-touched, for future audit passes:

1. **`editor/api/*.php`** — before anything goes public, a security pass (input validation, path traversal, auth) is mandatory; it was written for local XAMPP use. Do this the moment hosting is considered. *(Candidate for `/security-review` when the time comes.)*
2. **`ParticleSystem.js` (2,307 lines, largest file)** — June audit touched its utils only; pooling/lifecycle internals unreviewed.
3. **`AStarPathfinder.js` (1,500 lines)** — internals unreviewed this pass; specifically verify `validationCache` growth bounds over long sessions (it's cleared on terrain change; confirm it can't grow unbounded on a static map).
4. **Audio stack** (`SoundManager` + 4 Audio/ files, ~4,000 lines) — June's engine/game split still pending "when next touched."
5. **Input/gesture stack** (`InputSystem`, `DragComponent`, rubbing) — fragile per project history; any P6 work that touches drag must include manual gesture regression.
6. **UI managers** (`ActionSidebarManager` 1,071 lines, HUD, panels) — will need a pass when sockets/rooms add UI surface.
7. **`MapTransitionManager` + `Camera`** — transition edge cases (carrying across maps, attachment survival) become relevant at P6; audit then.
8. **No automated behavior tests exist** — T12's invariant sweeper + scripted autoplay is currently the only planned regression net; consider promoting it to a real headless harness (Playwright driving the game with assertions) once P3 lands ids/registries that make world state assertable.

## Browser-efficiency spot-check results (2026-07-05)

Verified clean — no action needed:

- **Pathfinder `validationCache` is an `LRUCache(200)`** and cleared on terrain change — bounded, no leak (item 3 above is resolved).
- **ParticleSystem is fully pooled** (`ParticlePool` + `ParticleRendererPool` with acquire/release/clear) — the deep-dive can wait.
- **All 3 `setInterval` sites have matching `clearInterval`** in their dispose paths (ContainerInputManager, LoadingManager, GameMap proximity polling).
- **Asset weight is a non-issue:** 1.5 MB total images (largest: snail spritesheet 596 KB, house 432 KB); CSS 108 KB.
- **CSS already uses `will-change` and `contain: layout paint`** at the hot spots; keyframe animations are transform/opacity-based (compositor-friendly).
- **No XSS-shaped `innerHTML` usage:** every non-debug `innerHTML` assignment is an `= ''` clear, and ContainerManager/ToastSystem carry explicit "never interpolate user/save data into innerHTML" comments that are being honored.
- **Save schema is versioned:** `User.serializeUserData` writes `data_version` with a v0→v1 migration chain already in place — the pattern to extend for future save changes.

Small gaps found in the same pass (cheap fixes, fold into T1 or a T1b):

- **`User.saveUserData` calls `localStorage.setItem` unwrapped** (`User.js:374`) — quota-exceeded or private-mode exceptions throw mid-save, and it's called from `MyteCore.dispose`, where a throw aborts the rest of cleanup. Wrap in try/catch with a toast on failure.
- **Dangling "Tutorials" toggle:** `SettingsPanel` exposes it and `User` persists `tutorialsEnabled`, but **nothing consumes it** — no tutorial/hint system exists. Either hide the toggle until a hint system ships, or treat it as the flag for the first-run toast sequence when that gets built (UX pass 1).
- **No player-facing pause.** Only `GameTime` pause via DebugPanel exists. A visible pause (freeze `SimClock` advance + input) is table stakes for a pet game where players step away; the loop architecture makes it trivial (gate `tickUpdate`/`SimClock.advance`).
- **No save export/import.** localStorage is the only copy of a player's pets; a clear-site-data click destroys them. A JSON download/upload pair in SettingsPanel is cheap insurance and doubles as a bug-report attachment format.

Remaining browser-efficiency audits, in priority order:

1. **T14 — Production script bundle (Codex, anytime):** 125 individual `<script>` requests is the single biggest cold-load cost. The manifest infrastructure (`scripts/script-manifest.json` + `build-manifest.js`) already knows the exact order — extend it with a `build:bundle` mode that concatenates (and optionally esbuild-minifies) into one file, emitted behind a `?bundled` flag or a prod entry file, keeping the multi-script mode for development. Also: load Tone.js (the CDN entry) `defer`red — audio doesn't initialize until first user gesture anyway. Acceptance: game boots identically from the bundle; cold-load request count drops from ~130 to <10.
2. **DevTools performance-trace protocol (human + Fable, after P6 and after P11):** 60-second recording on the busiest map with all creatures active — assert no long tasks > 50 ms, style-recalc counts flat per frame, no layout thrash from the attachment pass or wall runs. This is the check that the renderState contract *holds under load*, which static review can't prove.
3. **Long-session heap protocol (human, P13 gate):** 3 heap snapshots across a 30-min autoplay with 10 map transitions; diff for detached DOM nodes, listener counts, registry sizes. Pairs with the T12 invariant sweeper.
4. **DOM node budget (before P11):** count nodes on the largest map today and set a budget for the wall system (runs × ~4 elements each) so wall generation has a measurable ceiling instead of a vibe.
5. **Image format pass (whenever convenient):** the 596 KB snail spritesheet as WebP would likely drop ~60-70 %. Only worth batching when new species/wall materials are added.

## UX audit plan

Code review can't judge feel — these need a live session (owner + any model that can drive/screenshot the browser). Structured passes, each ~30 min:

1. **First-five-minutes pass:** loading experience (LoadingManager stage messages), what a brand-new player sees, whether the first myte deployment/interaction is discoverable without instruction. The fatal-error banner and map-failure toast paths should be triggered deliberately once.
2. **Input-feel pass:** drag, rub, double-click, long-press on desktop *and* touch — hit-target sizes vs finger size (myte regions, sidebar buttons), cursor state correctness (`CursorManager`), gesture conflicts (drag vs rub vs camera pan).
3. **Feedback-legibility pass:** for every failed interaction, is there a *reason* shown? (Occupied couch, cooldown, too far, carrying something.) Current code mostly fails silently — inventory of silent-failure points, then route them through `TooltipSystem`/`ToastSystem`. Includes the AI-intent thought-bubble feature (`lastDecisionLabel` → `MyteSpeech`) — the highest charm-per-effort item identified.
4. **Mobile layout pass:** panels, sidebar, and HUD at narrow widths; mobile nav patterns per the established design language.
5. **Comfort/accessibility-lite pass:** there are currently **zero `prefers-reduced-motion` rules** in the CSS — add one that stills sway/bob/particle-heavy effects, and a matching in-game "reduce motion" setting (SettingsPanel already has the toggle patterns). Verify text contrast on tan surfaces at small sizes; verify audio-unlock messaging isn't confusing (sound silently waits for first click).
6. **Session-flow pass:** is saving visible/trustworthy? What does returning after a day feel like (stat decay communication)? Map-transition continuity (carried items, active myte selection).

## Future audit backlog (beyond performance/UX)

Audits worth scheduling as the game matures, none blocking the current roadmap:

1. **Headless balance simulation (Codex, anytime — no browser needed):** `MyteStats` decay/regen math and the AI drive formulas are pure functions of config. A Node script that simulates N hours of stat evolution (idle, active, in-zone) and plots the curves would answer "does a myte starve overnight?" and "are the drives ever saturated?" objectively — currently tuning is vibes-only. Re-run it whenever `SiteConfig.stats`/`ai` change.
2. **Save/persistence hardening audit (pre-public):** quota/private-mode handling (gap above), corruption recovery (bad JSON in localStorage currently?), autosave cadence, the export/import feature, and extending the `data_version` migration discipline to any new persisted shapes (attachments, wall customizations).
3. **Error-visibility audit (pre-public):** boot failures show the fatal banner, but runtime exceptions after boot only hit the console. Decide on a lightweight `window.onerror`/`unhandledrejection` handler → toast + optional logging endpoint before strangers play.
4. ~~**Browser-baseline decision**~~ — **Done 2026-07-05:** ES2021+/evergreen floor written into AGENTS.md (§Browser Support Baseline).
5. **Editor-parity audit (recurring, after each schema-changing phase):** every data-schema change (sockets T6b, capabilities T7, wall materials T12) must land with its editor counterpart or the editor silently corrupts the new keys on save. T6b includes this; make it a standing acceptance item for any task that touches `data/` schemas.
6. **Editor PHP security review (mandatory before any public hosting)** — already item 1 of the further-inspection list; repeated here because it is the only *hard* gate in this backlog.

---

# Addendum — 2026-07-08 Pathfinding & Follow Audit

Final pathfinding audit of `js/Map/Grid/AStarPathfinder.js` and its consumers (`MoveActions.js`, `MyteMovementController.js`, `NpcMapObject.js`). Overall verdict: **mature and well-defended** — binary heap, per-search validation cache, wall-clearance penalty, LOS smoothing with buffer, no diagonal cutting, corner-slip in movement, stuck detection with repath and approach blacklisting. Nothing is broken; findings below are ranked by payoff.

## Performance findings

1. **String keys are the biggest CPU tax.** `getKey()` builds `"x,y"` strings for every node touch, and `_validatePosition` builds a template-string cache key per call. In the hot loop, string hashing/allocation dominates. Fix: integer node keys (`y * gridWidth + x`) and a packed-number validation cache key. Cheap change, typically 2–4× on the search loop.
2. **Static geometry is revalidated per entity per search.** Each neighbor runs the grid-cell loop plus `getPotentialCollidersForArea`, but most blockers never move. Precompute a per-cell **static clearance field** at map load (distance to nearest blocked cell — sibling of the existing `staticWallCount` precompute). "Does a W×H collider fit here" against static geometry becomes one comparison; only dynamic objects need AABB checks. Biggest structural win; also enables "keep a 1-cell safety margin when open space allows" for free.
3. **The 500 ms search timeout runs on the main thread** — worst case is a 500 ms frozen frame. Drop to ~30–50 ms once partial-path-on-failure (below) exists, or time-slice / move to a Worker with an async request queue. `maxSearchSteps: 8000` usually saves us first, but 8000 steps × full collider validation is still tens of ms.
4. Minor: the `fScore` map is write-only (deletable); `_findNearestValidGridPos` iterates the full square to enumerate each ring perimeter (O(r²) per ring — fine at radius 8, fix if radius grows).

## Reachability findings

1. **Return a partial path instead of `null`.** Timeout, max-steps, and exhausted-open-set all currently return `null` and the myte does nothing. Track the closed node with the lowest heuristic during search; on failure, reconstruct the path to it. The myte walks as close as it can get — almost always the right-looking behavior, and it gives the stuck/approach layer something to work with. **This is the single biggest behavioral improvement available.**
2. **`_findNearestValidGridPos` picks the nearest *valid* cell, not the nearest *reachable* one.** A target inside a walled area gets adjusted to a cell on the wrong side of the wall, then the search burns all 8000 steps failing. Partial-path also absorbs this case.
3. Inconsistency: callers pass `searchRadius = 12` but the helper clamps to 8 internally — pick one number.

## Edge-snagging findings

1. **Scale `smoothingBuffer` with movement speed.** 2 px of LOS clearance is enough at low speed; a fast myte overshoots per frame by more and clips corners the smoother approved. Rule: `buffer = max(2, pxPerFrame)`.
2. **Latent LOS tunneling:** `_hasLineOfSight` caps at 20 samples. With `maxSmoothingDistance: 3` segments never get long enough to matter, but `NpcMapObject` and DebugPanel call it too — a >10-cell segment samples sparser than one per cell and can jump a thin obstacle. A grid-traversal (DDA) or swept-AABB check makes LOS exact *and* cheaper.

## Robustness / future

1. **In-flight path invalidation:** the validation cache clears when objects move, but active paths aren't re-validated — a door closing mid-walk is only caught by stuck detection ~45 frames later. Cheap fix: on grid change, mark active paths dirty; walker LOS-checks its next waypoint.
2. **Path caching:** if free-roam mytes route between the same landmarks, cache recent `(startCell, endCell, sizeClass) → path` and re-validate cheaply instead of re-searching.
3. HPA* only if maps grow well past ~200×200; flow fields only for dozens of entities converging on one target. Neither is warranted now.

## Follow behavior design (myte following a myte / moving object)

Do **not** reach for moving-target A* (D* Lite, MT-D*) — at this scale the standard game patterns below are strictly better. Much of the mouse-follow infrastructure in `MyteMovementController` (`MOVE_FOLLOW_TYPES`, follow radii, orbit/leash modes) is reusable: the leader becomes an entity instead of the cursor.

### Core loop: throttled repath + dead-band (jitter immunity)

The follower must **not** react to raw leader position. A leader jittering left/right must produce a stationary follower, not oscillation. Three layers, all required:

1. **Smoothed leader position** — follow an exponential moving average (or the leader's position ~250 ms ago), never the instantaneous position. Jitter averages out before the follower ever sees it.
2. **Deviation-triggered repath** — keep walking the current path; recompute only when the (smoothed) leader has moved > ~1–2 cells from the position the path was computed for, or every 400–500 ms, whichever comes first. Never per-frame.
3. **Arrival radius with hysteresis (dead-band)** — stop when within `followRadius.min`, and do not start moving again until outside `followRadius.max`. The gap between the two radii is what makes the follower stand calmly while the leader fidgets inside it.

### "Are we locked to the back?" — No, and don't be.

A fixed rear-offset target (`leader − facing × distance`) is exactly what breaks under direction jitter: every heading flip teleports the target to the opposite side and the follower orbits pathologically. Two correct options:

- **Default — approach from your own side:** target the nearest point on a circle of radius `followDistance` around the leader, i.e. `target = leader + normalize(follower − leader) × followDistance`. The follower stays on whichever side it already occupies; a leader turning around requires *zero* follower movement. Heading-independent, therefore jitter-immune. This should be the standard follow mode.
- **Optional — rear formation with hysteresis:** if a marching-line aesthetic is wanted, compute "behind" from the *smoothed* heading and only swap sides when the new heading persists > ~1 s. Cosmetic mode, not the default.

### Best structure: breadcrumb trail, A* as fallback

The recommended architecture for follow (and the answer to chains):

- The leader records a **breadcrumb trail** — its last N positions, sampled every ~half cell of actual movement (not per frame, so a stationary/jittering leader adds no crumbs).
- The follower consumes the trail, steering toward the crumb `followDistance` behind the leader's trail-arc-length. Every crumb is a position the leader physically occupied, so the path is *pre-validated* — no A* calls at all while the trail is intact, and followers thread doors single-file naturally.
- Fall back to a real `findPath` only when the follower is **separated** (no crumb within range, e.g. teleport, map transition, or blocked by a newly closed door). Repath throttling from the core loop applies.

### Chains of 5+ followers

Two topologies; pick per group size:

- **Chain (each follows the one ahead)** — simplest, works to ~4–5. Weakness: the **accordion effect** — smoothing lag compounds per link, so the tail lags and rubber-bands. Mitigate with **speed matching**: follower speed scales with gap (slightly faster than leader when gap > desired, slowing to match as it closes) rather than binary move/stop.
- **Shared trail (recommended at 5+)** — all followers consume the *leader's* trail at staggered arc-length distances (`i × spacing`). One trail, one entity ever pathfinding, no compounding lag, and the conga line stays evenly spaced no matter how long. Scales to dozens.
- Either way, add a small **local separation** step (push apart overlapping followers per frame, à la boids separation) instead of letting followers treat each other as A* obstacles — moving entities as hard blockers causes mutual deadlock in corridors.

### Follow work package (T15 — follower system)

Suggested split: **Opus** implements `FollowBehavior` (smoothed target, dead-band, deviation repath, own-side targeting) reusing `MOVE_FOLLOW_TYPES` plumbing; **Codex** implements `BreadcrumbTrail` (ring buffer on the leader, arc-length lookup) once the behavior contract exists. Depends on nothing in the phase plan; pairs naturally with T8 (MovementBody consolidation) so the three brains share one follow implementation.

**Acceptance criteria:**
- Leader oscillating ±3 cells horizontally at 2 Hz → follower inside its dead-band does not move at all.
- Leader reverses direction → follower with own-side targeting takes zero steps if already within `followDistance`.
- 6-myte shared-trail line through a 1-cell-wide door: all arrive, single file, no A* call after the leader's initial path.
- Follower separated by a closed door falls back to `findPath`, and (with partial-path landed) waits at the door rather than idling in place.

### Pathfinding work package (T16 — pathfinder final pass)

Small, low-risk bundle from the findings above, suitable for **Sonnet**: integer node/cache keys; partial-path-on-failure; speed-scaled smoothing buffer; delete write-only `fScore`; align the `searchRadius` clamp. The static clearance field is a follow-up **Opus** task the next time `GameMapGrid`/`GridSystem` is open. Acceptance: pathing behavior unchanged on existing maps (audit-harness recording comparison), search time on the busiest map measurably down, unreachable-target clicks produce walk-toward-and-stop instead of no-op.

---

# Addendum — 2026-07-09 Working-Tree Review & Worker Handoff

**Model routing change (owner decision):** implementation work is delegated to **GPT-5.6** (external worker). Everywhere this document says Codex/Opus/Sonnet for implementation tasks, read GPT-5.6. Fable-reserved review gates cannot currently run (no Fable budget); the substitute discipline is: **every task ends by running the acceptance harness + `docs/SMOKE_CHECKLIST.md` and reporting raw results, and no task may change an API in `js/Engine/WorldRegistry.js`, `WorldQuery.js`, `EntityRelationships.js`, `AttachmentSystem.js`, or `docs/SOCKET_SCHEMA.md` — those are frozen specs.**

## A. What the uncommitted working tree contains (reviewed 2026-07-09)

The working tree on `new-ai-system` holds a large in-flight batch. All changed files pass `node --check`; `node scripts/validate-content-data.js` passes; the `BaseInputHandler.js → MyteBaseHandler.js` rename is byte-identical with all references (manifest, index.html, index.php) updated; `node scripts/build-manifest.js` regenerates cleanly.

| Task | Working-tree status | Notes |
|---|---|---|
| T1 Phase-1 cleanup | **Implemented** | Shadow → `renderState.shadow` + `MapRenderer.applyShadowState`; creature debug attrs gated behind body `.debug` class (cached per sim-tick); interaction cooldowns on `SimClock.now()`; `CARRY_OFFSET` → `SiteConfig.myte.carryOffset` with ms-based durations; empty fallback map + toast (`GameMap.core.toastManager` verified reachable). Defect WT-6 below applies. |
| T2 depth caching/dedupe | **Implemented** | `_depthOffset/_depthPriority/_renderLayerKey` cached; `invalidateDepthCache()` from constructor + `applyFacingDirection` — verified `size`/`collider` only mutate in those two places, and invalidation runs after both mutations. Shared math in `EntityMethods.resolveDepthOffsetValue/getSortYValue`; `MyteRenderer` delegates. Depth baseline diff (`__audit.dumpDepth()`) still needs a browser run. |
| L7 rename | **Done** | Pure rename, references updated. |
| T4 query migration | **Mostly implemented** | `MyteAI.getNearbyMytes/Objects/Items`, `NpcMapObject._detectTargets`, `Myte._syncCompanionBuffs`, `Myte.getRandomNearbyObject`, `PollinatorCreatureMapObject._findNearestFlower` now route through `WorldQuery`. `BirdMapObject.findTarget` **no longer needs migration** — it returns synthetic peck-spot targets, no population scan remains. Parity notes WT-5/WT-9 below. |
| T5 relationships migration | **Partial, with a disabling bug** | `withPickup.pickup/drop` write `carrying`; Carry actions write `carrying`; NPC `aggroTarget` and creature `restingTarget` are relationship-backed getters; `MyteQueue.isCarrying*` reads relation-first; invariant sweeper extended (`window.__invariants()`). **WT-1/WT-2/WT-3 below must land before this is real** — as written, the myte-side writes silently no-op. `following` not yet migrated. |
| T7 affordance data migration | **Partial** | `getAiAffordances` base hardcoding removed; `when`-DSL interpreter (`passesAffordanceWhen`) + validator schema landed; data added for FOOD (edible), light, dance/music, social×2, COUCH/LOG sittable capability. **Toggle gap WT-4**; myte social affordances + capability broad-phase in MyteAI still open. |
| T16 pathfinder pass | **Implemented** | Integer node keys (16+16 packed, sign-safe decode), partial-path-on-failure (all three failure exits; `_reconstructPath` call signature verified correct), speed-scaled smoothing buffer, `fScore` map deleted, `nearestValidSearchRadius` option aligned (clamp removed). WT-7/WT-8 below. |
| T14 bundle | **Implemented** | `build:bundle` concatenates manifest order into `js/bundle.js` + emits `index.bundled.{html,php}` with the CDN (Tone.js) entry `defer`red; outputs gitignored. Needs one boot-from-bundle verification. |
| D4 balance sim | **Implemented and working** | `scripts/simulate-stats.js` runs the real `MyteStats` in a Node VM. Its output drives the Stats Audit addendum below. |
| Extras | Done | `User.saveUserData` try/catch + toast (June gap); AuditHarness carriedBy invariants; validator affordance/capability schema (T12 slice). |

## B. Defects found in the working tree — fix before commit (WT-blocks, paste-ready)

> Worker instructions: apply WT-1 through WT-6 and WT-8 exactly as specified; WT-7 is optional. After all fixes: `node --check` every touched file, `node scripts/validate-content-data.js`, then run the browser console block at the end of `docs/CODEX_GOALS.md` plus `docs/SMOKE_CHECKLIST.md` and report results verbatim.

### WT-1 — `Myte` has no `.container`, so every myte-side relationship call silently no-ops — **critical**
**Evidence:** `MyteQueue.getCarryRelationTarget()` reads `this.myte?.container?.relationships` (`MyteQueue.js:189-191`); `setCarryRelation/clearCarryRelation` in `CarryActions.js:5-22` read `carrier?.container?.relationships`. `Myte` has no `container` property or getter (its ContainerManager is `this.parent`). `MapObject` has one (`MapObject.js:20: this.container = parent?.parent`). Result: myte-carrying-myte relations are never written; the item-side relation written by `withPickup.pickup()` (which works — object's `container` is the ContainerManager) is never *read* by `MyteQueue`, so everything degrades to the old instanceof path and the T5 migration is inert.
**Fix:** add to `Myte` (near the other getters, e.g. after `getOffsetRect()` at `Myte.js:773`):
```js
get container() { return this.parent; }   // ContainerManager — mirrors MapObject.container
```
**Acceptance:** in browser, pick up an item: `c.relationships.get('carrying', c.activeMyte)` returns the item and `__invariants()` is clean; carry a myte: `c.activeMyte.queue.isCarryingMyte()` true via the relation (verify by checking `c.relationships.serialize()` contains the pair).

### WT-2 — Relationship-backed getters fall back to a stale field after despawn cleanup — **defeats the point of T5**
**Evidence:** `NpcMapObject.js:35: get aggroTarget() { return this.container?.relationships?.get?.('targeting', this) ?? this._aggroTarget ?? null; }` and the identical pattern in `AmbientCreatureMapObject.js:5-8` (`restingTarget`). When a target despawns, `WorldRegistry.remove → clearAllFor` clears the relation — but the getter then returns the stale `this._aggroTarget`/`this._restingTarget` object reference. The stale-reference bug C2 was written to prevent comes straight back.
**Fix (both getters):** fall back to the field **only when the relationships registry is unavailable**:
```js
get aggroTarget() {
    const relationships = this.container?.relationships;
    if (relationships) return relationships.get('targeting', this) ?? null;
    return this._aggroTarget ?? null;
}
```
Also update `_aggroTarget`/`_restingTarget` in the setters as today (they remain the no-registry fallback store).
**Acceptance:** aggro an NPC onto a myte, despawn the myte via debug — `npc.aggroTarget` is `null` on the next read (no defensive `.active` check needed); same for a pollinator whose flower is removed mid-rest.

### WT-3 — `CarryAction` never clears its `carrying` relation on interrupt — dangling relation locks the carrier
**Evidence:** `CarryActions.js` — `CarryPickupAction` and `CarryPutdownAction` clear the relation in `interrupt()`/on completion, but `CarryAction` (the steady-state, potentially minutes-long action) has `start()` set with **no** `interrupt()`/`complete()` cleanup. If the carry is interrupted (drag, map transition, higher-priority interrupt), the relation persists; after WT-1 lands, `isCarrying()` is relation-first, so the carrier is permanently "carrying" — it can never eat (`actorNotCarrying` gate), never pick up again, and the AI's carry checks all misfire. Same failure the audit predicted for representation-fragile state, inverted.
**Fix:** add to `CarryAction`:
```js
interrupt() {
    super.interrupt();
    clearCarryRelation(this.myte, this.target);
}
```
(The normal handoff to `CarryPutdownAction` is safe either way: putdown's `start()` re-establishes the relation after any interrupt-ordering, verified in `MyteQueue.interrupt` semantics.)
**Acceptance:** start a myte-carry, drag the carrier to force an interrupt — `c.relationships.serialize()` has no `carrying` pair and `__invariants()` is clean; repeat across a map transition while carrying.

### WT-4 — DOOR and GATE lost their `toggle` affordance in the data migration — T7 parity break
**Evidence:** old `MapObject.getAiAffordances` pushed `{ actionId: 'interact_object', purpose: 'toggle' }` for every `interaction.type === 'toggle'` object. The interaction-type sweep of `types.json` shows exactly two toggle types — DOOR (~line 3967) and GATE (~line 5424) — and neither received an `ai.affordances` entry. T7's acceptance is byte-identical affordance output per type; this diff is non-empty.
**Fix:** add to both DOOR and GATE in `types.json`:
```json
"ai": { "affordances": [ { "actionId": "interact_object", "purpose": "toggle" } ] }
```
(If the owner prefers AI *not* toggling doors/gates — defensible, doors already auto-open via the Entity mixin — record the intentional drop here instead of adding the data. Default: preserve parity, add the entries.)
**Acceptance:** `__audit.dumpAffordances()` diff vs `docs/audit-baselines/` is empty for all 31 types (record the baseline on a pre-migration build first if not already committed).

### WT-5 — `NpcMapObject._detectTargets` silently gained an `isDragging` exclusion
**Evidence:** the old loop filtered only `!myte.isActive`; `WorldQuery.findNearby` defaults `excludeDragging: true`. An NPC now loses/never acquires aggro on a dragged myte — a behavior change smuggled in by defaults, against the T4 rule that specs pin exact predicates.
**Fix:** pass `excludeDragging: false` in the `_detectTargets` query options to preserve current behavior. (Owner may later decide dragged mytes should be untargetable — that's a gameplay decision, not a migration side effect.)
**Acceptance:** NPC aggro range/behavior identical with a dragged myte in radius.

### WT-6 — Shadow styles: duplicated apply implementation + no change detection in the flush path — partial M1 regression
**Evidence:** `MapObject.applyShadowVisual()` (`MapObject.js` ~line 389) and `MapRenderer.applyShadowState()` are byte-identical 9-property `Object.assign` blocks. Worse, `flush/flushOne` call `applyShadowState(obj)` on **every** dirty flush — a moving object with an unchanged shadow (ball rolling, `posZ` static) rewrites 9 style properties every frame, which is the exact per-frame-write class M1 was fixing.
**Fix:** (1) `computeShadowVisual()` already allocates a **new** state object only when something changed — exploit that: in `applyShadowState`, skip when the reference was already applied:
```js
applyShadowState(obj) {
    const shadowElement = obj?.shadowElement;
    const shadowState = obj?.renderState?.shadow;
    if (!shadowElement || obj._appliedShadowState === shadowState) return;
    obj._appliedShadowState = shadowState;
    // …existing style application…
}
```
(2) Delete `MapObject.applyShadowVisual` and have its two call sites (`updatePosition`, `render`) call `this.parent?.renderer?.applyShadowState?.(this)` so there is exactly one implementation.
**Acceptance:** shadows visually identical (creature hover fade, pickup hide); a paused-in-place bird writes zero shadow styles per frame (verify with a counter or DevTools style-recalc profile).

### WT-7 — BigInt validation-cache keys likely cost more than the strings they replaced *(optional, perf)*
**Evidence:** `_getValidationCacheKey` (`AStarPathfinder.js` ~line 135) builds a BigInt from 7 shift/or operations per `_validatePosition` call — the hottest line in a search. The T16 finding targeted *string allocation*; BigInt allocation is typically no cheaper in V8.
**Fix (keep it simple):** inside an active search (`this._activeSearchCache` non-null) the entity and collider are constants — key by packed plain number only: `(colliderWorldX + 0x800000) * 0x1000000 + (colliderWorldY + 0x800000)` (48 bits < 2^53, world px rounded). Keep the BigInt (or the old string) key **only** for the cross-search LRU path where entity/dims vary. Guard: the per-search cache must be (and is) discarded per `findPath` call.
**Acceptance:** identical paths on existing maps (audit-harness recording comparison); measure search time on the busiest map before/after.

### WT-8 — Search timeout still 500 ms — the audit's own follow-through
**Evidence:** `timeoutMs = 500` remains in `findPath`. The 2026-07-08 addendum says to drop it to 30–50 ms *once partial paths exist* — they now do; the worst-case main-thread stall should shrink 10×.
**Fix:** make it an option `searchTimeoutMs: 50` in `this.options` (overridable per call like the other options) and use it in the loop.
**Acceptance:** no behavioral change on normal paths; a deliberately unreachable far target returns a partial path in ≤ ~50 ms (console-time it).

### WT-9 — Minor notes (fix opportunistically, none blocking)
1. `MusicBoxMapObject.getAiAffordances` now just returns `super(...)` — delete the override (`LightMapObject.js:105`).
2. Bird peck-spot **synthetic** targets (`{posX, posY, isPeckSpot: true}`) now flow into the relationship registry via the `restingTarget` setter. Harmless today (they're cleared when the setter nulls, never serialized — no `worldId`), but add a one-line guard in the creature setter: skip `relationships.set` when `!target.worldId`, keeping synthetic spots in `_restingTarget` only.
3. `Myte.getRandomNearbyObject` now throws (via WorldQuery's finite-args check) if `range` is undefined/NaN, where the old filter returned null. Audit all call sites pass a number, or wrap with `Number.isFinite(range) ? … : null`.
4. `AmbientCreatureMapObject` debug-flag cache keys on `SimClock.now()` — while the sim is paused the flag never re-syncs. Cosmetic; acceptable.
5. `getRandomNearbyObject`/`_syncCompanionBuffs`/`getNearbyItems` now inherit `excludeDragging: true` where the old code had no such check — accepted as a benign improvement (do not "fix"); recorded here so the T4 parity ledger is honest.
6. Cross-reference: `buildActionResult` drops the `hunger` key from action definitions — see ST-2 in the Stats Audit below.

## C. Updated work queue for GPT-5.6 (in order)

1. **Browser verification pass — blocking gate.** Run the T3 console block in `docs/CODEX_GOALS.md`, record `__audit.dumpDepth()` / `dumpAffordances()` / candidate baselines, and complete `docs/SMOKE_CHECKLIST.md`. Also verify the D2 depth fallback fix and T17 Step 4 observation. Record results in `docs/audit-baselines/`.
2. **T6/T6b browser review.** Verify couch and bed occupancy, third-seat refusal, drag while seated, hold/carry/drop, dismount/interrupt, editor preview, and map-transition/despawn cleanup. The headless rollout is complete; this is now the regression gate.
3. **T15 browser review / T8.** Verify the shared-trail follow cases, then implement movement-body consolidation.
4. **T9/T10/T11.** Region/room unification, WallBuilder/render modes, then wall customization.
5. **T12/P13/P14.** Complete schema validation and scripted autoplay, run the profile/heap protocols, then execute the full browser regression suite.

### 2026-07-10 implementation and verification ledger

| Work item | Code status | Verification status |
|---|---|---|
| D5 working-tree fixes | Complete | Headless syntax/content validation complete; browser smoke and registry/query baselines pending. |
| D6 / T17 stats retune | Complete | `simulate-stats.js` assertions pass; 30-minute multi-Myte browser observation pending. |
| D2 depth fallback | Complete in working tree | Node behavioral check passes; map depth baseline and visual pass pending. |
| T5 completion | Complete headlessly | Follow start/complete/interrupt now writes/clears `following`; browser despawn scenarios pending. |
| T7 completion | Complete headlessly | Myte social affordances and capability broad-phases are in place; affordance/candidate baseline diff pending. |
| T6/T6b socket and attachment rollout | Complete headlessly | Couch-seat, hold-anchor, and Myte-carry parity tests pass; browser interaction, transition, and editor checks pending. |
| T13 paired social | Complete headlessly | Syntax/content checks pass; synchronized approach, refusal, and expression behavior require browser review. |
| T15 follower system | Complete headlessly | Breadcrumb arc lookup and dead-band checks pass; six-follower/door and closed-door fallback cases require browser review. |
| T12 validation/regression harness | Partial | Content validation now covers capabilities, sockets, and spatial region shapes; the live invariant sweeper covers registry populations, relationships, attachments, socket occupancy, and both parent/child despawn cleanup. `__audit.autoplay()` samples those invariants over a five-minute simulation-time AI run and returns a structured report; completing a clean browser run remains pending. |
| T8 movement consolidation | Partial | The behavior-neutral `MovementBody` math component is loaded before movers; Ball, `MovingMapObject`, and ambient creatures now share speed limiting/direction selection without changing collision, friction, timing, or AI. Collision/stuck/axis-slide migration and browser species observation remain pending. |
| T9, T10, and T11 | Not started | Region/room and wall work remains after T8 and its browser regression gate. |

### 2026-07-10 live browser pass (Codex app)

**Environment:** `index.php` served locally and driven in the Codex in-app browser. The pass covered boot, deploy/free-roam, Outside → House → Outside → FieldTest transitions, live AI observation, House bed/FieldTest couch action discovery, ambient-object population, and `editor/` boot. This is a real browser result, not a headless inference.

| Check | Result | Evidence / follow-up |
|---|---|---|
| Boot/loading | **Pass** | Loading reaches "Ready to play!" and `#loading-screen` gains `is-hidden`. HUD clock/currency and roster render. |
| Deploy + free-roam | **Pass with warnings** | Roster changes from inactive/in-slot to active/deployed; the Myte moves autonomously and emits a need bubble. Repeated `[approach] ... threshold=null` warnings occur during ordinary AI approach checks. |
| Console-silent smoke gate | **Fail** | Wheel input throws `TypeError: this.container.camera.handleScroll is not a function` from `ContainerInputManager.js:301`. The repeated `threshold=null` approach diagnostics also violate the zero-warning gate. |
| Map transitions | **Pass** | Outside → House → Outside → FieldTest completed, loading overlay cleared each time, and each destination populated with its expected object set. No visible duplicate population after returning Outside. |
| Ambient species / T8 observation | **Partial pass** | Outside butterflies and House bird were present with live movement-state attributes; FieldTest populated butterflies/NPCs. A full 10-minute species/ball/NPC comparison was not completed because the console and socket failures already block the gate. |
| House bed socket | **Fail (UI reachability)** | BED data advertises `sittable` and `use_surface_slot`, but selecting the bed exposes only Go To / Inspect / Inspect Oddly. No Rest/Sit action is reachable from the normal sidebar. |
| FieldTest couch socket | **Fail** | COUCH exposes a `Sit` action and renders two `.map-object-slot` markers. Invoking Sit from a Myte at `(224,176)` toward the couch at `(928,448)` emptied the queue without moving or seating the Myte; no toast explained the refusal. Multi-seat, third-seat refusal, drag-while-seated, and dismount cleanup therefore remain blocked. |
| Editor parity | **Pass (boot/schema visibility)** | `editor/` loads without an editor-originated console error, shows all content categories, and displays Myte socket/capability data. Couch/bed marker editing still needs a focused visual edit/save/reload pass after the socket action defect is repaired. |
| T17 observation | **Partial** | During this shorter live run mood remained `happy`; energy moved from 75% to 46% and a sleep bubble appeared. This does not satisfy the specified 30-minute/two-Myte, four-mood measurement. |
| Harness/baselines | **Still pending** | The in-app browser can drive and inspect the rendered app, but its page-evaluation world cannot access the classic-script lexical `MyteCore` or the page-world `window.__audit`. Run the documented console block/downloads in the page's own DevTools (or the project headless Playwright recipe) after the blocking runtime defects are fixed. |

**Gate decision:** browser acceptance is **failed**, not merely outstanding. Fix the missing camera scroll API/call, remove or repair the `threshold=null` approach diagnostics, restore BED action reachability, and diagnose the couch Sit no-op before resuming T8 or treating T5–T7/T12–T15 browser acceptance as green. The deeper attachment cleanup, paired-social, six-follower/door, autoplay, and baseline-diff scenarios remain unverified behind those blockers.

#### Follow-up correction and fixes (same day)

The project headless Playwright workflow was then run in the page's main JavaScript world, with AI disabled via `QUEUE_ONLY`, to remove visible-browser timing ambiguity:

- **Camera/console defects fixed:** removed `ContainerInputManager`'s obsolete window-scroll subscription to nonexistent `Camera.handleScroll()` (Camera already owns canvas wheel zoom), and routed the unconditional final-approach `console.warn`/`console.log` calls through the existing `APPROACH_DEBUG` gate.
- **Couch and bed data/action resolution pass:** `ActionManager.getActionOptions('use_surface_slot', ...)` returns options for both objects when the Myte is eligible; FieldTest exposes couch sockets `seat_a`/`seat_b` and bed socket `sleep`.
- **Couch lifecycle passes in isolation:** the action queues as `use_surface_slot`, approaches the couch, reserves one seat, completes the finite inactive-Myte rest cycle, releases occupancy, and ends with no attachment or invariant leak. The earlier "Sit no-op" conclusion was a false observation made after the action cycle had completed while autonomous queue activity obscured the queue UI.
- **Bed sidebar conclusion narrowed:** the missing Rest button observed in the visible pass was eligibility/state-dependent, not missing action data. Direct action resolution succeeds at low energy. A focused visible active-Myte rest animation check remains useful, but this is no longer considered an architecture blocker.
- **Invariant harness fixed:** a seat is intentionally reserved during `SurfaceSlotAction` approach/settle before the attachment exists. `__audit.invariants()` now recognizes that active reservation instead of reporting a false socket/attachment mismatch. The same scenario finishes with `[]`.
- **Recordings created:** `docs/audit-baselines/depth-FieldTest.json` and `affordances-FieldTest.json`. These are post-migration reference recordings, not proof of a zero diff against a missing pre-migration baseline.

**Revised gate:** the two confirmed console defects are repaired and isolated couch/bed socket resolution is green. Remaining browser work is the multi-Myte/third-seat and drag-interrupt matrix, carry/despawn cleanup, paired social actions, follower door cases, autoplay, Outside/House recordings, and the full T17 observation.

#### Registry/autoplay follow-through

The first 60-second FieldTest autoplay run correctly failed every sample with `registry objects=91 vs gameMap.objects=75`. The extra 16 entries were the complete initial Outside object population. `GameMapLoader.loadMapWithTransition()` only disposed `this.currentMap`; that field is unset when boot installs the initial map through the container path, so the first transition leaked its registry population. The loader now falls back to `container.gameMap` for the previous map.

After the fix, the same run passes all 13 five-second samples: registry remains flat at `{ total: 76, myte: 1, object: 75, item: 0 }`, with zero invariant issues. A subsequent formal five-minute run also passes all 61 samples with the same flat population and zero unique issues. Structured reports are stored as `docs/audit-baselines/autoplay-FieldTest-60s.json` and `autoplay-FieldTest-5m.json`.

Outside, House, and FieldTest depth/affordance recordings now exist. They are current-tree references because no pre-migration recordings were made. Network capture also found two genuine missing FieldTest visual assets (`images/MapObjects/metal_door.png`, `images/MapObjects/npc_slime.gif`) plus the loader's expected failed TMX fallback probes and a headless-only blocked Google Fonts request. The missing visuals remain a content follow-up and keep the broad zero-network-error smoke gate from being fully green.

#### Three-Myte acceptance pass

Per owner direction, the starter roster is now three Mytes (`Myte`, `Worm`, `Snail 2`) through the canonical roster/config path (`SiteConfig.myte.initialRosterCount`). Existing smaller pre-release saves retain their saved entries and are filled to the configured count from the enabled species catalog.

The first isolated multi-seat run exposed a relationship-direction defect: `occupying` was exclusive on the furniture/parent endpoint, so attaching the second sitter removed the first sitter's semantic relationship even though both socket attachments remained. `occupying` and `riding` now allow multiple children per parent while enforcing one parent per child (`exclusive: false`, `inverseExclusive: true`).

The clean rerun verifies:

- registry population exactly `{ total: 78, myte: 3, object: 75, item: 0 }`;
- Mytes 1 and 2 reserve and attach to distinct `seat_a` / `seat_b` couch sockets;
- Myte 3 is refused while both seats are occupied;
- interrupting Myte 1 releases only its seat and attachment while Myte 2 remains seated;
- Myte-to-Myte carry creates `carrying` plus the `carry.myte` attachment, and queue interruption clears both;
- kiss synchronizes `kiss` / `kiss_receive`;
- high-five synchronizes `high_five` / `high_five_receive`;
- every checkpoint and final sweep returns `__audit.invariants() === []`; no page errors occur.

The 30-minute T17 mood/bubble observation is **cancelled by owner direction** and is no longer part of the current browser queue. Remaining browser work is limited to the six-follower/door case and any focused visual/manual feel checks the owner elects to run; the architecture-critical three-Myte socket/carry/social gate is green.

#### Six-Myte follower follow-through

A temporary six-Myte browser profile (the permanent starter roster remains three) verified the shared breadcrumb behavior on FieldTest. The leader plus five followers remained in strict ID order along one trail; all five `following` relations stayed pointed at leader 1; follower A* calls were **zero**; only the leader invoked A* (two calls while resolving a partial reachable destination); final invariants were empty and there were no page errors. Evidence is stored in `docs/audit-baselines/follow-FieldTest-6mytes.json`.

This is a **partial pass** for T15 rather than a claim that the complete doorway criterion passed. FieldTest's door is freestanding, so pathfinding routed above it instead of forcing traversal. Four Mytes crossed the door's x-line and the final two remained correctly spaced in the tail when the leader's partial path ended. An attempted House case did open the door, but the selected destination was unreachable and dominated the result with fallback replanning, so it was rejected as an invalid acceptance scenario. The shared-trail/no-follower-A* contract is green; a purpose-built one-cell forced-door fixture is still required to test the exact doorway criterion mechanically.

---

# Addendum — 2026-07-09 Stats System Audit (design: "will this be fun?")

**Scope:** `js/Myte/MyteStats.js` (1,042 lines), `SiteConfig.stats`, action reward flow (`BaseActions.buildActionResult` → `applyActionResult`, `noteBehavior`), buffs' continuous stat effects, and the drive→AI coupling. **Method:** code reading plus the new headless simulator (`node scripts/simulate-stats.js`), which executes the real `MyteStats` in a Node VM — the numbers below are measured, not estimated, and every claim can be re-verified by re-running the sim.

## Verdict up front

**The architecture is good. The tuning is broken badly enough that, as shipped, the stats system cannot produce fun gameplay.** Everything meaningful happens on a seconds scale in a game whose interaction loop operates on minutes, and the home slot is a total-recovery exploit that makes *not playing* the optimal strategy. The good news: because the whole system is pure config + pure functions (which is *why* the simulator works), this is a tuning-and-two-bug-fixes problem, not a redesign.

## What is architecturally right (keep all of it)

- **Pure, config-driven math** — every rate in `SiteConfig.stats`, deltaTime-scaled, batched at a 100 ms drive tick that is mathematically equivalent to per-frame. This is what made a headless simulator possible in an afternoon.
- **Wellbeing ceilings** (`fun`/`comfort`/`confidence` capped by vitals) — elegant: a starving myte cannot be blissful, enforced as a soft drain rather than a clamp.
- **Derived mood → behavior** (`getDerivedMood` → speed multiplier, AI hints) — the right way to make stats *legible* without more meters.
- **Exhaustion cascade** as a concept (low energy accelerates other decay) — good death-spiral *texture*, currently tuned too hot.
- **Separation of drives (AI pressure) from meters (player-facing)**, and `needSignalCooldown` rate-limiting the bubbles.

## Measured behavior (the sim tables, summarized)

| Scenario | Result |
|---|---|
| **Deployed, idle** | Fun 70→0 in **~20 s**. Satiety 100→0 in **~33 s**. Social 80→0 in **~3–4 min**. Health 100→0 by **~30 min** (starvation drain). Comfort settles at ~33. Terminal state: everything pinned at 0, myte permanently "exhausted/bored," nothing further changes. |
| **Docked in home slot** | Every stat at maximum **before the first 15-min sample**; confidence saturates in **under one second** (see ST-3). |
| **Food economy** | One apple = +30 satiety (FOOD `effects.hunger: 30`, unscaled through `applyStatEffects`). At the deployed decay of 3 satiety/s, **one apple buys ~10 seconds of not being hungry.** |
| **Action economy** | `noteBehaviorScale` 0.45 means a completed play action grants ~+4–8 fun — at 3.4 fun/s decay, **any action pays for roughly 2 seconds of itself.** |

Derivations (all verifiable against `SiteConfig.stats`): effective fun loss while idle = (`funDecayRate` 0.004 + `funDeltaRates.idle` 0.0042) × `behaviorDriveRate` 0.42 ≈ 0.0034/ms. Satiety = `satietyDecayRate` 0.003/ms **with no rate scale** (see ST-1). Social = 0.0016 × 0.42 (× 0.5 alone). Starvation = `wellbeing.starvationHealthDrainPerMs` 0.000085 ramping below 15% satiety, ≈ 5/min at full starvation against 1.5/min passive regen.

## Design failures (why this can't be fun as-is)

1. **Crisis timescale ≠ interaction timescale.** Needs empty in 20–200 seconds; the AI's think loop, pathfinding, approach, and action durations mean one need-servicing cycle takes ~10–30 s. The AI can *only* firefight, the player can never meaningfully help, and meters spend their lives pinned at 0 — a meter that is always empty carries zero information and trains the player to ignore it (learned helplessness). The mood system, which is genuinely nice, is starved of dynamic range: the myte is permanently `exhausted`/`bored`.
2. **The home slot is the dominant strategy.** Docked = everything maxes in minutes with the exhaustion cascade suppressed; deployed = everything collapses. The rational player docks their pets and stops playing. Stakes must exist *in* the world, and recovery must be slow enough that care actions in the world can compete with the dock.
3. **The reward economy is dwarfed by decay** (apple = 10 s, play action = 2 s). Feeding/playing must buy *minutes* or care is Sisyphean.
4. **Zero-health has no consequence and no arc.** At health 0 the myte plays a `faint` expression (`MyteStats.js:131`) and… keeps existing at 0 until it drifts back up. The terminal state is static — no drama, no recovery story, no reason to prevent it. Stakes without consequence are just a red bar.
5. **No return-visit story.** Docked mytes are always at max, so a player returning after a day sees nothing to do. A pet game's core loop is *"they need me"* — some gentle docked/offline drift toward a contented-but-imperfect baseline (e.g., 70s) gives returning players a warm re-entry ritual without punishing absence.

## Stats bugs found while auditing (fix regardless of tuning)

### ST-1 — `satietyDecayRate` skips the `rateScale` every other drive uses
`MyteStats.js:443`: `this.updateSatiety(-this.satietyDecayRate * deltaTime * satietyExhaustionScale)` — no `rateScale` factor, unlike fun (line 430) and social (line 439). Effect: satiety decays at 100% of its configured rate while fun/social run at 42%, and buffs' `behaviorDriveMultiplier` can't touch hunger. Almost certainly an omission (the home-slot comments at `SiteConfig.js:54` assume scaled math). **Fix: multiply by `rateScale` like its siblings, then retune the constant (T17 table).**

### ST-2 — `buildActionResult` silently drops `hunger` effects from action definitions
`BaseActions.js:91` maps `satietyDelta: base.satiety ?? 0`, but action definitions use the `hunger` key (`eat_element` has `"hunger": 20` at `actions.json:248`) — that 20 is lost; eating only nourishes via the *object's* effects going through `applyStatEffects` (which does honor the alias, `MyteStats.js:218`). Per Addendum 2026-07-05 §1 (breaking migrations welcome): **canonicalize on `satiety` — rename the key in `actions.json`, make `buildActionResult` read only `satiety`, and delete the `hunger|hungerDelta|hungerBoost` aliases from `normalizeStatEffects` after migrating `types.json` FOOD effects (`hunger: 30` → `satiety: 30`) and any other `hunger` keys (`grep -rn '"hunger"' data/`).** Extend `validate-content-data.js` to reject the legacy keys.

### ST-3 — `homeSlotConfidenceBoostRate` is ~100× too large for confidence's 0–1 scale
Confidence is 0–1 (`getConfidenceRatio` returns it raw) while other stats are 0–100, and `homeSlotConfidenceBoostRate: 0.00055`/ms fills the whole bar in under a second (the sim shows confidence at max at t≈0). Compare the correctly-scaled `exhaustionCascade.confidenceDrainPerMs: 0.000018`. **Fix: 0.00055 → ~0.0000055** (full bar in ~3 min against the blend). Longer-term (optional, T17 stretch): move confidence to 0–100 like everything else — the mixed scale has now caused a real bug and it complicates every UI/editor touchpoint.

## T17 — Stats retune work package (GPT-5.6, paste-ready)

**Goal:** deployed needs move on a 30–90 minute arc; docked recovery takes ~10–15 minutes and is *not* strictly better than in-world care; care actions buy minutes; health failure has a visible consequence and a recovery arc.

**Step 0 — bugs first:** ST-1, ST-2, ST-3 above.

**Step 1 — retune constants** in `SiteConfig.stats` (starting values; the sim assertions in Step 3 are the real spec — iterate until they pass):

| Key | Now | Proposed | Rationale (effective rate) |
|---|---|---|---|
| `funDecayRate` | 0.004 | **0.0002** | with rateScale ≈ 0.000084/ms → 100 fun ≈ 20 min of pure decay |
| `funDeltaRates` (all six) | 0.0002–0.0042 | **÷10** | keeps context *ratios*; idle boredom ≈ +decay ≈ fun empties in ~10 min if the AI does nothing (AI will act well before that) |
| `satietyDecayRate` | 0.003 | **0.000066** (after ST-1 adds rateScale) | ≈ 0.0000277/ms → 100 satiety ≈ 60 min; an apple (+30) buys ~18 min |
| `socialDecayRate` | 0.0016 | **0.00013** | ≈ 0.0000546/ms → ~30 min (60 alone) |
| `wellbeing.starvationHealthDrainPerMs` | 0.000085 | **0.00003** + add `starvationGraceMs: 120000` (drain starts only after satiety has been < threshold for 2 min continuously) | full starvation → health 100→0 in ~55 min, with warning time |
| `exhaustionCascade.healthDrainPerMs` | 0.00018 | **0.00004** | cascade menaces, doesn't execute |
| `exhaustionCascade.comfortDrainPerMs` | 0.0006 | **0.00015** | proportional |
| `homeSlotEnergyRegenRate` | 0.003 | **0.00025** | 0→100 ≈ 7 min docked |
| `homeSlotFunRestoreRate` | 0.0030 | **0.00012** | net-positive vs new docked decay; full ≈ 15 min |
| `homeSlotSocialRestoreRate` | 0.0008 | **0.00008** | ditto |
| `homeSlotSatietyRestoreRate` | 0.0025 | **0.0001** | ditto |
| `homeSlotComfortBoostRate` | 0.0011 | **0.00025** | |
| `homeSlotConfidenceBoostRate` | 0.00055 | **0.0000055** | ST-3 |
| `homeSlotHealthRegenRate` | 0.00035 | **0.0001** | 0→100 ≈ 17 min docked |
| energy economy (`energyDecayRate`, `bedRestEnergyRegenRate`, etc.) | — | **unchanged for now** | the minute-scale energy/nap loop is the *activity* metabolism and reads well on screen; revisit only if the browser pass shows nap-spam |

Recheck after retuning: the home-slot comments in `SiteConfig.js:47-57` state net-positive margins — recompute and update those comments; they are load-bearing documentation.

**Step 2 — consequence at zero health:** when health hits 0 while deployed: interrupt the queue with the existing `faint` expression, then force-return the myte to its home slot using the **existing GOHOME pathway** — `myte.queue.clear()` then `myte.setMode(MOVE_TYPES.GOHOME)`; `MyteMovementController.update` (the `MOVE_TYPES.GOHOME` branch, `MyteMovementController.js:220-246`) already paths it home and calls `myte.stop()` (= docked) on arrival — and apply a `recovering` context buff via `buffs.syncContextBuff` (define it in `data/metadata/buffs.json` following the existing context-buff entries; effects: `movement.speedMultiplier` ~0.7 plus a small `stats.behaviorDriveMultiplier` reduction, duration ~5 sim-minutes). While the buff is active, block re-deploy (guard in the same place the deploy/start flow checks `isActive`, surfacing a toast). No death. Implement the trigger as an `onHealthDepleted()` hook next to `onEnergyDepleted()` (`MyteStats.js:685`), fired once on the 100→0 crossing with a re-arm threshold (e.g. health back above 20), mirroring how `exhaustionRecoveryThreshold` re-arms exhaustion.

**Step 3 — extend `scripts/simulate-stats.js`** with a `deployed + AI care model` scenario (synthetic care: when satiety < 30 apply +30 after an 8 s delay; when fun < 30 apply the play-action reward after 10 s; when energy < 25 switch to bed-rest regen until 90) and turn the script into an assertion harness (exit non-zero on failure):
- With care: no stat touches 0 across 2 sim-hours; mood (via `getDerivedMood`) is not `exhausted`/`bored` more than 20% of samples.
- Without care: satiety reaches 0 in 45–90 min; health reaches 0 no sooner than 60 min after that grace.
- Docked from the crashed state: full recovery in 8–20 min; confidence takes ≥ 2 min to saturate.
- One apple sustains ≥ 15 min of satiety at the new decay.

**Step 4 — browser pass:** 30-minute observation with 2 deployed mytes: mood cycles through ≥ 4 distinct moods; need bubbles ≤ 1 per 5 min per myte; mytes visibly alternate eat/play/social/rest rather than firefighting one need.

**Files:** `SiteConfig.js`, `MyteStats.js`, `BaseActions.js`, `data/metadata/actions.json`, `data/map-objects/types.json` (hunger→satiety), `scripts/validate-content-data.js`, `scripts/simulate-stats.js`. **Out of scope:** AI drive formulas (`MyteAI` scoring), buff definitions, zone effect values — retune those only if Step 4 observation demands it, as a separate task.
