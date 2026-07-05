# Codebase Audit — Neko / Mytes

**Date:** 2026-06-12
**Scope:** Full runtime audit (~56K lines, 124 JS files) — performance, duplication, expandability, architecture, editor readiness.

> **STATUS 2026-07-01 — this document is now historical.** A follow-up audit verified that nearly every item below is fixed on `new-ai-system` (commit `370d088` landed the last five work packages: script manifest, deepMerge consolidation, fail-loud map loading, AI scoring → SiteConfig.ai.candidates, MapObject split into ActionSlotLedger + MapObjectInputController). All changes were verified in a running browser: clean console-silent boot, autonomous AI behavior, drag/rub gestures, surface-slot occupancy, map-failure toast, editor merge parity.
> Remaining open by choice: SoundManager engine/game file split (organizational, do when next touched); ParticleDataUtils.merge kept separate (different undefined-override semantics, documented in code).
> Exception by decision: Utility XPath + legacy element-finding blocks are **kept** (may be used later).

## Executive Summary

This codebase is in better shape than most solo vanilla-JS game projects of this size. The recent refactors clearly paid off: the batched `js/Map/MapRenderer.js` renderState contract, `js/Engine/SimClock.js`, the unified `js/Engine/SpriteAnimator.js`, data-driven AI affordances, version-cached buff aggregation (`MyteBuffController.getAggregateEffects`), and the registry pattern are all genuinely good architecture. The fixed-tick + variable-render loop in `js/Engine/Core.js` is correct, including visibility handling and spiral-of-death capping.

The real debts are concentrated, not diffuse:

1. **Per-frame DOM measurement** — `getBoundingClientRect` and `document.elementFromPoint` run every frame through several paths.
2. **Per-call deep clone/merge in the action definition registry** — metadata access allocates aggressively, and one UI path triggers it for ~55 actions every frame.
3. **The Myte save/roster schema is defined in four places** with inline default values that drift.
4. **Mytes bypass the batched renderer** that map objects use — two rendering pipelines for one concept.
5. **ContainerManager is becoming a god object** (roster building, DOM construction, save application, collision, rect math, z-index, loading).

None of this requires a rewrite. Most of it is caching, consolidation, and deleting dead code.

---

## Highest Priority Issues

### 1. Actual bug: duplicated method silently drops parameters
`js/Container/ContainerManager.js` (~line 855) defines `getEntityColliderBounds` **twice**. The second definition (`(entity)` only) shadows the first (`(entity, x, y)`), so any caller passing a position gets it silently ignored. Delete the first definition or merge the signatures.

### 2. Per-frame forced layout/hit-testing in the hot path
Every frame, `ContainerManager.update()` → `drawTargetDot()` runs:
- `this.element.querySelector('.cursor-dot')` (every frame, never cached)
- `isMouseInContainer()`, which calls `document.elementFromPoint()` (forces a hit-test) and `getContainerRect()` → uncached `getBoundingClientRect()`.

Separately, `Camera.doCameraLogic()` calls `isMouseInContainer()` and `getContainerRect()` again every frame, and `GridSystem.updateCulling` calls `getContainerRect()` whenever the camera moves. `getCanvasRect()` is already cached and invalidated on resize — **`getContainerRect()` needs the same caching treatment**, and `drawTargetDot` is a debug visual that should be gated behind the `debug` body class. Note: keep the offsetParent-walk measurement strategy (camera CSS transform breaks raw BCR) — the fix is caching, not switching to BCR.

### 3. `ActionDefinitionRegistry.getDefinitionSync` deep-merges + deep-clones on every call
Every access to `ActionClass.metadata` (the getter installed by `ActionManager.attachMetadataGetter`) runs `deepMerge` → `cloneValue` over the full definition tree. This is hit by `MyteQueue.add`, the HUD, AI `_getActionAiValues`, and — worst — `ActionSidebarManager._buildAvailableActionsKey`, which calls `ActionManager.getAvailableActions()` **every frame while anything is selected**: ~55 actions × `canPerform` × full metadata clone × sort, per frame. Definitions are static after preload; memoize the merged result per actionId (and `Object.freeze` it). This single change removes the biggest GC churn source in the project.

### 4. Myte rendering bypasses the MapRenderer contract
The contract documented at the top of `MapRenderer.js` says "Nothing else should write to element.style inside the update loop" — but `MyteRenderer.setSpritePosition` and `applyVerticalVisuals()` write `left/top/zIndex/transform` directly every frame, with no dirty check. `applyVerticalVisuals` writes `style.top` and `style.transform` on **two** roots (world + home slot sprite) every frame even when nothing changed, and `updateTargetDot` writes styles every frame even while the dot has `is-hidden`. Give Mytes a `renderState`, or at minimum add change detection.

### 5. Save/roster schema defined in four places (see Duplication section)

---

## Duplication / Single Source of Truth Problems

### Myte save/roster schema — 4 definitions
- **Write:** `User.serializeUserData` (defaults `100/75/70/80/100` inline)
- **Read/normalize:** `ContainerManager.normalizeRosterEntry`, plus `createFallbackRosterData` and `extractRosterDataFromDom` — each re-stating the same stat defaults
- **Apply:** `ContainerManager.applySavedMyteState` re-implements clamping that `MyteStats` already owns, including the confidence 0–100→0–1 migration.

A single `MyteRosterSchema` module (serialize / normalize / apply, defaults pulled from `SiteConfig.myte.initialStats` — extend it to cover all stats) would collapse all four. The editor will need this module anyway.

### Config defaults duplicated as inline `??` literals
`MyteStats.js` has the pattern `SiteConfig.stats.funDecayRate ?? 0.004` repeated for fun/social/satiety/comfort rates, `safeAreaRadius ?? 320`, `exhaustionThreshold ?? 0.05`, and the whole `funDeltaRates` block. The literal after `??` is a second, drift-prone copy of the config value. Drop the literal fallbacks where a SiteConfig key exists.

### Three deep-clone/merge implementations
- `ParticleDataUtils.clone/merge` (`ParticleSystem.js`)
- `ActionDefinitionRegistry.cloneValue/deepMerge`
- `MapEnvironmentManager.deepClone`

And `ParticleMath.clamp/lerp/inverseLerp/wrap` duplicate `Utility` byte-for-byte. One `Utility.deepClone`/`Utility.deepMerge` should serve all callers (or the duplicates should delegate).

### Rect/offset math — three homes
`ContainerManager.getOffset/getRect/getLocalOffset`, `Utility.getBoundingBoxWithScroll`, and `RectUtils.js`. RectUtils is the right destination — move the measurement helpers there (preserving offsetParent-walk semantics) and have ContainerManager delegate.

### Spatial proximity queries — three implementations
- `MyteAI.getNearbyObjects/getNearbyMytes/getNearbyDroppedItems` — linear scan over **all** map objects, per myte per think
- `GameMap.getObjectsInRadius` — uses the grid system's spatial index (the right one)
- `Myte.getRandomNearbyObject` — another linear scan, with *different* distance semantics (box vs Euclidean)

MyteAI should call `gameMap.getObjectsInRadius()`. Biggest "won't scale with object count" item.

### Two queueing paths for "go to X then do Y"
`MyteQueue.js` has ~11 convenience methods (`addOpenChest`, `addSmellFlower`, `addDrinkFromFountain`, `addWaterPlant`, `addHarvest`, `addShowAffection`, `addGreet`, `addWatch`, `addEatElement`, `addInspect`, `addSpin`) that hand-build `go_to_object + action` sequences. None are called anywhere (only `addDance`, once). The live path is `ActionManager.getActionOptions` + `queue.add`. Delete the dead helpers.

### Stat-effect key aliases
`MyteStats.normalizeStatEffects` accepts `energy | energyDelta | energyRestore | energyBoost` (×7 stats, plus `hunger`/`satiety` legacy). Schema sprawl absorbed at runtime. Before the editor exists, pick canonical key names in the JSON, migrate the data files, keep one legacy alias maximum.

### Misc
- Two files named `BaseInputHandler.js` (`js/Input/` vs `js/Myte/Input/`). Classes differ (`BaseInputHandler` vs `MyteBaseHandler`) so nothing breaks, but rename the file to `MyteBaseHandler.js`.
- `Myte.getDirection` and `Myte.faceTowardsPoint` are the same math twice.
- `Camera` is constructed with three args but its constructor takes two — harmless today, confusing tomorrow.

---

## Performance Risks

| Where | Issue |
|---|---|
| `CompactChipStripUI.update` | Runs unthrottled every frame for both BuffOverlayUI and CompactQueueUI. `getVisibleBuffs()` spread-clones every buff, sorts, builds tooltip arrays per call. HUD throttles to 250ms, QueueTarget to 100ms, chip strips not at all. Add the same throttle. |
| `Myte.getHomePosition` | Resolves through `getLocalOffset` → two offsetParent walks + BCR. Called from AI `buildContext()` every think, GOHOME movement, `ensureFiniteCoordinates` fallbacks. Cache and invalidate when the slot element moves. |
| `MapRenderer.flush` | Writes `dataset.sortY` for every dirty object every frame — only debug tooling reads it. Gate behind debug mode. Same in `MyteRenderer.setZIndex`. |
| `GameMap.noCache = true` | Hardcoded — every map transition cache-busts the TMX fetch. Tie to `Utility.isDebugEnabled()`. |
| `GridSystem.updateCulling` | `activeObjects.size === 0` forces a full culling pass every frame — pathological on an empty/sparse map. Use a "ranOnce" flag instead. |
| `GameMap.getObjectsInRadius` | `Math.sqrt` per object; compare squared distances. Minor, but it's the funnel function. |
| `Date.now()` vs `SimClock` | 91 uses across 29 files. SimClock pauses when the tab is hidden; Date.now doesn't. Gameplay cooldowns using wall-clock will "expire" while the tab is hidden. **Needs per-call-site verification** — input/UI timing legitimately wants wall-clock. |
| `MyteQueue` logging flags | `consoleClearEnabled` calling `console.clear()` per queue op is a footgun if left on. |

Debug systems are generally well-gated, with the exceptions noted: `drawTargetDot`, `dataset.sortY`, per-Myte target dot style writes.

---

## Expandability Risks

1. **ContainerManager owns too much** (1011 lines): roster normalization, slot DOM construction, save-state application, collision delegation, rect math, z-index policy, loading progress. Extract a `MyteRoster` module (data) and keep slot DOM building near MyteRenderer (presentation).
2. **DOM as a source of truth.** `extractRosterDataFromDom` reads roster state from element datasets/styles; `User.serializeUserData` reads `slotLabel` via `querySelector` at save time; home positions derive from live DOM layout. Runtime JS state should be canonical, DOM purely a render target — main blocker for multiplayer/editor serialization.
3. **AI scoring constants are inline.** `MyteAI.js` candidate builders are full of literals (`score = 14 + drives.eatDrive * 72`, thresholds, commitment times). Structure is excellent; move base scores/thresholds to `SiteConfig.ai.candidates.*` so species/editor can tune.
4. **GameMap.initialize fallback maze**: tries 4 alternative TMX paths including nonexistent `assets/maps/`, then builds a default map with a hardcoded BUTTERFLY and aggro NPC slime. Masks real load failures. Fail loudly; keep at most the initial-load default map.
5. **`getConfig('a.b.c')` string-splitting** per call in MapObject — fine today; if object counts grow, resolve hot config paths once in the constructor.

---

## Over-Engineering / Unnecessary Complexity

- **Dead MyteQueue convenience layer** — 11 unused methods.
- **`Utility.js` legacy block**: `findClosestElementToMouse`, `getFilteredElements`, XPath helpers (`getElementXPath` has a latent bug — bare recursive call would throw), `initXPathClick`, `getScrollbarDimensions`. **KEEPING by decision** (may be used later); the XPath recursion bug should still be fixed if ever used.
- **`GameMap.testPathfinding`** — dev harness in the production class; move to DebugPanel or delete.
- **Defensive normalization layers**: `SoundManager.setProximitySounds` accepts Map or Set because `GameMap.dispose` passes a `Set` while `_updateProximitySounds` passes a `Map`. Standardize call sites on Map. Similarly `ensureFiniteCoordinates`/`sanitizeState` run twice per frame per entity — once is enough.

Explicitly **not** over-engineered: the buff system, action metadata fallback chain, SimClock, the AI drive model.

---

## Under-Engineering / Missing Foundations

1. **No shared "entity render state" abstraction.** MapObjects have `renderState`; Mytes, DroppedMapItems, particles each do their own DOM writing.
2. **No cached viewport/container geometry service.** Camera, culling, input, indicators each fetch rects ad hoc.
3. **No time-source policy.** `SimClock.now()` vs `Date.now()` vs `performance.now()` mixed without a documented rule.
4. **Save versioning is thin.** `data_version` exists but no migration table — migrations live inline. Add a `migrations[version]` map before more save fields are added.
5. **Event names are bare strings** (`'myte:started'`, `'container:active_myte_changed'`). A frozen `EVENTS` constant object would catch typos.

---

## Editor Readiness

`docs/EDITOR_PLAN.md` is solid and its data-foundation work is real. Before building the editor itself:

1. **Memoize/freeze registry getters** — the editor will hammer them; per-call deep clones make live preview sluggish and break identity comparisons.
2. **Extract the roster/save schema module** — the editor's Myte inspector needs the same normalize/apply logic.
3. **Un-snap object placement.** `GameMap.addObject` force-snaps to grid; make snapping an option.
4. **Kill the TMX fallback path probing** so editor map-loading errors are real errors.
5. **Make stat-effect key aliases canonical in data first.**
6. **Move remaining hardcoded data paths** (`data/map-objects/*.json` in ContainerManager init, TMX paths in GameMap) to `AppConfig.paths`.

---

## Recommended Refactor Plan

### Quick wins (hours each, no behavior change)
1. Delete the duplicate `getEntityColliderBounds` (ContainerManager).
2. Cache `getContainerRect()` alongside `getCanvasRect()`; invalidate on resize.
3. Gate `drawTargetDot()` and `dataset.sortY` writes behind debug mode; skip `updateTargetDot` when hidden.
4. Memoize merged action definitions in `ActionDefinitionRegistry` (freeze, stable refs).
5. Throttle `CompactChipStripUI.update` to ~150–250ms like HUDManager.
6. Delete dead MyteQueue convenience methods. (Utility legacy block: KEEP.)
7. `GameMap.noCache = Utility.isDebugEnabled()`.
8. Remove inline `?? literal` fallbacks in MyteStats where a SiteConfig key exists.
9. Standardize `setProximitySounds` call sites on `Map`.

### Medium refactors (a day or two each)
1. **Roster/save schema module** — one place for serialize/normalize/apply/defaults; extend `SiteConfig.myte.initialStats` to cover all stats.
2. **Myte rendering change detection** — dirty-flag `applyVerticalVisuals`/`setSpritePosition`/`updateTargetDot` (full renderState migration later).
3. **MyteAI proximity via grid** — replace linear scans with `gameMap.getObjectsInRadius` (keep per-tick caching).
4. **Utility consolidation** — `deepClone`/`deepMerge` in Utility; have ParticleMath/ParticleDataUtils delegate; move ContainerManager rect helpers toward RectUtils.
5. **Cache `getHomePosition()`** with explicit invalidation.
6. **Time-source audit** — classify each `Date.now()`; write the rule into AGENTS.md.

### Larger architectural cleanup (when it starts hurting)
1. Split ContainerManager: `MyteRoster` (data + save), slot DOM building (presentation), ContainerManager as wiring/orchestrator.
2. AI candidate tuning to `SiteConfig.ai.candidates` — opportunistically as candidates get touched.
3. Input stack rationalization (`js/Input/*` vs `js/Myte/Input/*`) — verify overlap first; at minimum rename the second `BaseInputHandler.js`.
4. Event name constants registry.

---

## Files To Inspect First

1. `js/Container/ContainerManager.js` — duplicate method bug, per-frame DOM reads, roster schema ×3
2. `js/Myte/Queue/ActionDefinitionRegistry.js` — per-call deepMerge/clone
3. `js/UI/Container/ActionSidebarManager.js` — per-frame `getAvailableActions`
4. `js/Myte/MyteRenderer.js` — unbatched per-frame style writes
5. `js/User/User.js` — save schema duplication, DOM reads during serialize
6. `js/Myte/Queue/MyteQueue.js` — dead convenience layer
7. `js/Map/GameMap.js` — noCache, fallback maze, testPathfinding, proximity-query duplication
8. `js/Utility/Utility.js` — consolidation target (legacy block kept by decision)
9. `js/Map/MapEnvironmentManager.js` (1,684 lines) and `js/Effects/ParticleSystem.js` (2,322 lines) — audited in Part 2 below
10. `js/Input/InputSystem.js` + `js/Myte/Input/` — audited in Part 2 below

~~Not audited in depth: `AStarPathfinder.js`, `SoundManager.js` internals, individual MapObject subclasses.~~ → See Part 2.

---

# Audit Part 2 — Deferred Areas (2026-06-12)

Deep pass over the areas Part 1 skipped: `AStarPathfinder.js`, `SoundManager.js`, MapObject subclasses, `MapEnvironmentManager.js`, `ParticleSystem.js` internals, and the two input stacks.

> Status: Part 2 fixes applied 2026-06-12 — sound disposal race + fade-to-zero ramp + music gain staging + dead `toggle()` removed; pathfinder per-search cache, heap `nodeMap` removed, static wall counts precomputed; lighting steady-state gate + deduped light scan + cached container rect + atmosphere signature skip; `getObjectById` swap; rubbing gesture config consolidated into `SiteConfig.interaction.rubbing`.
>
> Follow-up 2026-06-12 (second pass): startup centering root-caused (initial map transition never centers — mytes don't exist yet; fixed with explicit `camera.resetView(true)` at end of `ContainerManager.init`). **Date.now()→SimClock audit complete** — converted: portal cooldowns, dropped-item age/magnet timing (fixed a live cross-clock bug where `MyteAI` aged `droppedAt` epoch timestamps against SimClock, giving every dropped item a ~billion-point score boost), physics coyote/jump-buffer, goHome replan throttle, collider recovery cooldown, feed cooldown, `Myte.startTime`, cinematic camera, flower regrowth. Time-source rule documented in AGENTS.md. **Flower picking bug fixed**: `setDeflowered` only existed on `GrowingPlantMapObject` but FLOWER/GRASS map to `FlowerMapObject`/`MapObject` — the optional call silently no-opped, so map flowers were pickable forever. Moved deflowered state to `MapObject` with lazy SimClock regrowth (`isDeflowered()`); all readers unified.
>
> Known latent issue (not fixed, pre-existing pattern): interaction actions' `complete()` runs effects/rewards even when `didAbortApproach()` — aborted approaches still deflower/open/drop. Fix requires a coordinated pass over all GoToObjectAction subclasses.
>
> Follow-up 2026-06-12 (third pass): **MyteRubbingHandler ported onto the shared RubbingComponent** — the duplicate gesture detection is deleted; the handler now only wires myte reactions (expressions + petted/overstimulated buffs). MapObject's rubbing init drops its hardcoded gesture values in favor of the SiteConfig-driven component defaults. **SoundManager `getVolumeParams`** centralizes the volume-param shape sniffing for the fade path (contract-lite; presets needing different handling should extend it there).
>
> **Reassessed after full read:** `MyteClickHandler`/`MyteTouchHandler` are *not* duplicates of ClickComponent/DragComponent — they are bespoke choreography (three element targets: home slot, inactive sprite, world duplicate; upward-drag pickup gesture; tool-mode switching; direct touch-handler driving). Porting them would be a rewrite over a different transport with no dedupe gain and high touch-parity risk. Recommendation downgraded: leave as-is unless gesture bugs force a revisit. The per-myte document-level listeners they attach are cheap (early-return guards) and bounded by roster size.
>
> Still open: SoundManager engine/game file split (purely organizational — do as its own focused change), full per-preset stop/fade contract (extend `getVolumeParams` when preset shapes next change).

## AStarPathfinder.js — solid core, a few sharp edges

The architecture is genuinely good: binary heap open set, LRU validation cache, search timeout + max-step caps, collider-aware validation (`_validatePosition` is the single collision authority), LOS path smoothing with a clearance buffer, terrain costs with per-entity capability multipliers.

1. **Validation cache is effectively useless during normal play.** `GridSystem.updateObjectPosition` calls `invalidatePathfinderCaches()` whenever *any* object moves ≥1px — with ambient creatures (butterflies, birds, balls) always moving, the LRU(200) is wiped almost every tick. That's the *correct* call (cached results vs. moving obstacles would be stale), but it means the persistent cache only ever serves hits within a single `findPath` call — and at 200 entries it thrashes even there (an 8000-step search validates far more positions). **Fix:** per-`findPath` scoped cache (a plain `Map` created at search start, discarded at end); drop or shrink the persistent LRU.
2. **`BinaryHeap.nodeMap` is corrupt by design.** `push()` allows duplicate keys (A* re-pushes improved nodes), and `nodeMap.set(key, index)` gets overwritten while both copies sit in `content` — so `contains()` lies and indices go stale. Nothing currently calls `contains()`, so it's dead maintenance cost on every heap operation. Remove `nodeMap` (or implement real decrease-key).
3. **`_getMovementCost` re-scans neighbors per expansion.** Path-centering and wall-clearance each do a 4-neighbor cell scan per evaluated neighbor — up to ~64 cell reads per expanded node. Both penalties are static per cell (depend only on walkability/terrain) — precompute `wallCount`/`isPathEdge` per cell when the grid changes.
4. **Main-thread budget:** 500ms timeout / 8000 steps hardcoded in `findPath` — worst case is a visible hitch. Make the budget configurable (SiteConfig) and consider time-slicing if maps grow.
5. `_findNearestValidGridPos` silently clamps `maxRadius` to 8 while callers pass 12 — misleading API.
6. Minor: `_getDistance`/`_getDirection` duplicate `Utility.calculateDistance`-family math; `getKey` allocates a string per node op (numeric `y * gridWidth + x` would cut GC churn); `LRUCache`/`BinaryHeap` live in this file — move to `js/Utility/` if anything else ever needs them.

## SoundManager.js — functional, two real bugs, structure fraying

1. **BUG — `fadeOutAndStop` disposal race** (`SoundManager.js` ~line 1060): it schedules `synths.delete(id)` + dispose via `setTimeout(duration*1000)`. If the sound re-enters range during the fade (water-edge proximity flapping — the 500ms poller + linear falloff makes this easy), `playAmbient` reuses the synth from `this.synths`, then the still-pending timer deletes and disposes it mid-play. Needs a cancellable fade token stored on the sound and cleared by `playAmbient`.
2. **BUG — music volume inconsistency:** `startMusic` sets music gain at `0.5 × categoryVolume` (pad `0.3×`), but `updateAllVolumes` ramps the same synth to the full `categoryVolume`. Moving *any* volume slider makes the current music jump ~2× louder than its start level. One constant should own the music gain staging.
3. **`toggle()` blindly inverts `soundEnabled` and `musicEnabled` independently** — if the user has sound on / music off, toggling desyncs both. **Needs verification** of callers before changing.
4. **Duck-typed synth handling is fragile:** `stop()` has 4 shape-sniffing branches, `fadeAmbientSound` 3, `updateSynthVolume` recurses over arbitrary synth objects. Presets should declare a small contract (`stop()`, `setGain()`, or a `kind` field) instead of the manager guessing shapes.
5. Per-call allocations in hot paths: `playFootstep` rebuilds the `surfacePools` object per footstep; `resolvePlaybackModifiers` rebuilds the default-pitch-range table per play. Hoist to statics.
6. Magic gains inline (0.5/0.3 music staging, fade durations, `minTimeBetweenSounds`) → `AppConfig.sound`.
7. Structural: engine concerns (synth lifecycle/fades/volumes) and game concerns (footstep surfaces, schedule sync, myte/UI helpers) share one 1,400-line class. Natural split when next touched; not urgent.

## MapObject subclasses — healthier than expected

The mixin layer (`MapObjectBases.js`) is good: `withAura` throttles via accumulator, `withConnectable` queries the grid, `withItemDrops`/`withPickup` are coherent. `GrowingPlantMapObject` is a model citizen — GameTime subscriptions with cleanup, save/restore, time-skip template method. `AmbientCreatureMapObject` is a clean state machine with subclass hooks.

1. **Linear ID scans where the index exists:** `MapObjectBases.disconnectFromConnectedObjects` and `PortalMapObject` (~line 224) do `gameMap.objects.find(obj => obj.id === id)` — `gameMap.getObjectById()` is a Map lookup and already exists. Trivial fix.
2. `GrowingPlantMapObject.setDeflowered` schedules regrowth with wall-clock `setTimeout` — part of the Date.now()/SimClock family (fires even while tab hidden; lost on map change without persistence).
3. Naming: `growthRate` is actually a *duration* (ms to next stage; `Infinity` = paused). Rename when touched.
4. `DoorMapObject` scans `this.mytes` per tick for doorway checks — fine at 3 mytes, revisit if the roster grows.

## MapEnvironmentManager.js — the biggest remaining per-frame cost

This is now the heaviest steady-state system in the game. `update()` calls `renderLighting(false)` **every frame**, and the work happens *before* its change-detection short-circuit:

1. **Per frame, even when nothing changed:** `getViewportMetrics()` → `syncLightingOverlayBounds()` → `getViewportBounds()` → **two uncached rect measures** (container + canvas via `getElementRect` → `container.getRect` → `getBoundingClientRect`); `collectAllLights()` — a filter+map over **all map objects** with per-light allocations — **runs twice** (once directly at line ~1199, again inside `collectVisibleLights` at ~1200); `deriveRoomLightingState()`; then `buildLightingSignature` — a `JSON.stringify` over view/rooms/lights. Only *after* all that does the signature short-circuit skip the canvas redraw.
2. The signature includes camera x/y at 0.01px precision, so any camera easing forces a full lighting-canvas redraw per frame — intentional (screen-space lighting), but it compounds with (1).
3. `renderAtmosphere` builds its own `JSON.stringify` signature per frame during transitions — exactly when it never matches.

**Recommendations:** dedupe the double `collectAllLights()` call (pass the list in); cache the light list and invalidate on object add/remove/light-toggle (the grid already knows when objects change); route rect measures through ContainerManager's now-cached `getContainerRect`/`getCanvasRect`; replace JSON signatures with cheap numeric field comparisons; and/or throttle lighting to ~15fps — at dusk-transition speeds nobody will see the difference.

## ParticleSystem.js — well-engineered, no action needed

Fixed-tick simulation with interpolated rendering, pooled DOM views with per-property last-written-value change detection, layer containers with frozen z-index table, `willChange` hints. This is the pattern the rest of the rendering should converge on. Only nit: `update()` runs a `reduce()` over all particles per frame purely for the debug culled-count — count it inside `renderer.flush` (which already iterates) instead.

## Input stacks — duplication confirmed

- `js/Input/*`: `InputSystem` singleton + subscription-based `InputComponent` family (`ClickComponent`, `DragComponent`, `RubbingComponent`) — configurable per-instance, reads `SiteConfig.interaction.gestures`, used by map objects.
- `js/Myte/Input/*`: independent per-myte handlers attaching **raw document-level listeners** (each Myte's `MyteRubbingHandler` adds its own `document` mousemove/touchmove/mouseup listeners), with **hardcoded gesture configs that differ from the component versions** — e.g. `maxRubs: 25` vs `RubbingComponent`'s 15, `minTimeBetweenRubs: 5000` hardcoded vs SiteConfig-driven. Two implementations of the same gesture with different rules is exactly the "duplicate source of truth" failure mode.

**Recommendation (medium refactor):** port `MyteRubbingHandler`/`MyteClickHandler`/`MyteTouchHandler` onto `InputComponent` subscriptions so gestures share one implementation and one config; keep the Myte-specific *reactions* (buffs, queue interrupts) as callbacks. Needs behavior-parity testing, especially the touch path. Until then, at minimum move the Myte gesture constants into `SiteConfig.interaction.gestures` so the numbers live in one place.

## Part 2 — Recommended Fix Order

1. **SoundManager `fadeOutAndStop` race** — audible bug, small fix (cancellable fade token).
2. **MapEnvironmentManager per-frame costs** — dedupe `collectAllLights`, cached rects, numeric signatures; biggest steady-state perf win remaining.
3. **SoundManager music volume inconsistency** — one constant for music gain staging.
4. **`getObjectById` for the two linear ID scans** — trivial.
5. **Pathfinder:** per-search validation cache; delete `BinaryHeap.nodeMap`; precompute per-cell wall/path-edge penalties.
6. **Input stack unification** — larger; do gesture-config consolidation first, full port later.
