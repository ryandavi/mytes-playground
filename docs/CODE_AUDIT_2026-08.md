# Code & Experience Audit — Mytes (main game)

**Date:** 2026-08-05
**Scope:** `js/` (146 source files, ~64.7K lines) + `index.html`, `data/`, `scripts/`. The `editor/` tree is **out of scope** as requested.
**Baseline:** branch `new-ai-system`, working tree as of this date (includes uncommitted WorldGraph / ambient-creature / HUD work).
**Method:** direct reading of the hot paths (boot → loop → AI → actions → render → UI), plus mechanical scans for dead methods, duplicated utilities, time-source violations, and manifest/bundle drift.

> **Relationship to prior audits.** `docs/ARCHITECTURE_AUDIT_2026-07.md` and `docs/GAME_DESIGN_AUDIT_2026-07.md` are largely **landed**: `WorldRegistry`/`WorldQuery`, `EntityRelationships`, `AttachmentSystem`/sockets, `SpatialRegion`, the event log, and shared depth math in `EntityMethods` all exist and are in use. This audit does not re-litigate them. What it reports is (a) new defects, (b) *half-finished* migrations where the old path still coexists with the new one, and (c) the UX layer, which has had the least attention.

---

## Executive summary

The engine layer is genuinely good. The fixed-tick loop, the `WorldQuery` broad-phase, the pooled `ParticleSystem`, the data-driven action registry with `purposeOverrides` and `scoreDrivers`, the affordance `when` predicate system, and `WorldGraph`'s discovered-not-declared world model are all above the bar for a hand-rolled vanilla-JS game of this size. **Nothing here needs a rewrite.**

The problems cluster in three places, and they have one shared shape: **a better mechanism was built, but the thing it replaced was never removed.**

1. **Half-migrated single sources of truth.** Carry state is read from *both* `EntityRelationships` and `instanceof` on the current action. Affordances are *both* data-driven (`ai.affordances` + `when`) and hardcoded (`getAiAffordances`). Action labels are *both* config-driven (`getActionConfig().label`) and a hardcoded `if`-chain in the sidebar. Every one of these is a place where two answers can disagree.

2. **The UI layer has no update policy.** Nine UI subsystems tick every RAF frame, each with its own ad-hoc throttle or none. The action sidebar re-evaluates all 58 registered actions **twice per frame**, and its info panel calls `MyteAI.buildContext()` — which performs three spatial queries *and mutates the myte's confidence stat*. Opening a panel changes the simulation.

3. **The player can't see the simulation.** This is the same diagnosis as July, and the event log fixed part of it, but the remaining gaps are now the clearest wins in the codebase: no world persistence (gardens and chests reset every reload), three settings that do nothing, `experience`/`level` still dead, and — in the current working tree — the active Myte's vitals removed from the persistent chrome with nothing replacing them.

**Top 5 by value/effort:**

| # | Item | Type | Effort |
|---|---|---|---|
| 1 | `buildContext()` mutates stats + runs from UI (§1.1) | Bug | ~1h |
| 2 | Kill the per-frame 116× `canPerform` scan (§3.1) | Perf | ~2h |
| 3 | Collapse 7 near-identical interaction actions into one data-driven base (§2.4) | Duplication | ~1d |
| 4 | World state persistence (§4.1) | UX/design | ~2–3d |
| 5 | Finish the relationship migration; delete the `instanceof` fallbacks (§2.1) | SSOT | ~4h |

---

# 1. Correctness — bugs and edge cases

### 1.1 `MyteAI.buildContext()` mutates the simulation, and the UI calls it — **P0**

`js/Myte/MyteAI.js:297-306` applies a confidence penalty as a side effect of *building the context object*:

```js
if (!this._scaryObjectDetectedThisTick) {
    const hasScaryNearby = nearbyObjects.some(...);
    if (hasScaryNearby) {
        this._scaryObjectDetectedThisTick = true;
        snapshot.stats?.applyConfidenceDelta?.(-0.05);
    }
}
```

The `_scaryObjectDetectedThisTick` guard is reset in `tickUpdate()` (`MyteAI.js:68`) — i.e. it is a *per-tick* guard. But three UI callsites reach `buildContext()` outside the tick, via `getNeedsSnapshot({ live: true })`:

- `js/UI/Container/ActionSidebarManager.js:549` — every 250 ms while any Myte is selected
- `js/UI/Panels/MyteInfoPanel.js:387` and `:408` — every 250 ms while the panel is open

**Failure scenario:** select a Myte standing near an object with `ai.scaryStrength > 0`. The sidebar refresh calls `buildContext()`, the tick guard is already consumed or not yet set, and confidence drops an extra 0.05 per refresh — up to 4×/second on top of the intended once-per-tick. The Myte becomes measurably more timid *because a panel is open*. Confidence feeds `exploreDrive`, the social "skip unknown Mytes" gate (`MyteAI.js:575`), and the risk gate (`MyteAI.js:864`), so this changes observable behaviour.

**Fix:** split the pure read from the effect. `buildContext()` becomes side-effect-free; move the scary-object confidence application into `tickUpdate()` (or into a `_applyPerceptionEffects(context)` called only from `planNextAction()`). Then `getNeedsSnapshot` is safe to call from anywhere.

### 1.2 Gameplay timers on the wall clock — **P1**

`AGENTS.md` is explicit: `SimClock.now()` for anything that should pause with the tab. These are gameplay timers still on `performance.now()`:

| Location | What it times | Consequence |
|---|---|---|
| `js/Myte/StateMachine.js:47,81` | `getStateDuration()` | Consumed by `MyteAI.js:1013` for the idle-expression ramp — a hidden tab "ages" idle state |
| `js/Map/MapObjects/Moving/BallMapObject.js:218,306` | `lastPushTime` push cooldown | Ball nudge cooldown expires while paused |
| `js/Myte/Queue/Actions/CarryActions.js:205,222,296,305` | carry duration + replan | Carry completes/replans against paused time |
| `js/Myte/Queue/Actions/MoveActions.js:620,970,1006,1047,1107` | `_lastTargetReplanAt` | Follow/approach replan throttle |
| `js/Map/MapObjects/DroppedMapItem.js:97,100` | long-press detection | *Correct as-is* — input gesture |
| `js/Map/MapObjects/Moving/BallMapObject.js:664` | drag animation | *Correct as-is* — input-driven |

Note `CarryActions.js:205` still uses `performance.now()` despite the D1 cleanup goal specifying deltaTime accumulation — that item did not fully land.

**Fix:** mechanical swap to `SimClock.now()` for the first four rows. Add a lint-style check to `scripts/` that flags `performance.now()`/`Date.now()` outside an allowlist of input/audio/loading/cache files.

### 1.3 `MyteQueue.add()` mutates the caller's options object — **P2**

`js/Myte/Queue/MyteQueue.js:55-57`:

```js
if (options.duration == null) {
    options.duration = ActionClass.metadata.defaultDuration;
}
```

`MyteAI.enqueueTargetedAction` builds `{ ...resolvedOptions, ...overrides }` fresh each call so it's safe today, but `ActionManager.getActionOptions` returns `{ ...metadata.defaultOptions, ... }` — a shallow spread over a shared `defaultOptions` object. Any future callsite that passes a reused literal gets a silently sticky duration. Copy before mutating.

### 1.4 Inconsistent action teardown in `MyteQueue` — **P2**

Three code paths advance the queue (`MyteQueue.js:128-147`, `:160-171`, `:173-185`) with three slightly different teardown rules:

- `update()` completion path guards `complete()` with `if (!currentAction._interrupted)`
- `removeCurrentAction()` calls `interrupt()` **and then** `complete()` unconditionally
- the invalid-target path calls `interrupt()` and never `complete()`

So an action cancelled via `removeCurrentAction()` fires both hooks, and one cancelled by target-invalidation fires neither — meaning `onComplete` (which is where `MyteAI.rememberCompletedAction` lives) runs in one cancellation path and not the other. AI memory is inconsistent depending on *how* an action ended.

**Fix:** one private `_advance({ completed })` used by all three, with a single documented rule (suggested: `complete()` only on natural completion; always `interrupt()` on cancellation).

### 1.5 `getTargetKey` is position-derived for id-less targets — **P2**

`js/Myte/MyteAI.js:1437-1440` falls back to `` `${type}:${posX},${posY}` `` when a target has no `id`. For anything that moves — dropped items being nudged, Mytes — the memory key changes as the target moves, so `objectMemories` accumulates orphan entries and novelty/repeat penalties silently fail to apply. `DroppedMapItem` has an `id`; confirm every queryable entity does, and make the fallback throw in debug rather than inventing an unstable key.

### 1.6 `WorldGraph.discover()` is not re-entrant-safe

`js/Map/WorldGraph.js:55-101` clears `nodes`/`edges`/`geometry` at the top, then awaits. A second `discover()` call (or a `preload()` after a reset) overlapping the first leaves the graph half-built while `getRoute`/`getEntryPoint` are being queried by travel code. `preload()` guards with `preloadPromise`, but `discover()` is public and callable directly. Build into locals and swap in at the end, or guard `discover()` the same way.

---

# 2. Duplication & single sources of truth

### 2.1 Carry state has two sources — **P1**

`js/Myte/Queue/MyteQueue.js:196-235`. Every carry query consults `EntityRelationships` **and then falls back to `instanceof`**:

```js
isCarrying() {
    if (this.getCarryRelationTarget()) return true;
    const action = this.getCurrentAction();
    return action instanceof CarryAction || action instanceof HoldItemAction || action instanceof CarryPickupAction;
}
```

Repeated four times (`isCarrying`, `isCarryingItem`, `isCarryingMyte`, `getHeldItem`), plus `isBeingCarried()` which is *only* `instanceof`. These can disagree: a relationship set without the matching action, or an action running before/after its relationship is established, produces different answers from different callers — and `isCarrying()` gates ~20 `canPerform` checks across the action files.

**Fix:** make the relationship registry authoritative. Actions set/clear the relation in `start()`/`complete()`/`interrupt()`; the queries read only the registry. Delete the `instanceof` branches. This also removes `MyteQueue`'s compile-order dependency on five action classes.

### 2.2 Affordances are half data-driven — **P1**

`MapObject.getConfiguredAiAffordances()` (`js/Map/MapObjects/MapObject.js:781`) already evaluates declarative entries with a `when` predicate. Then `getAiAffordances()` (`:794-820`) appends four **hardcoded** affordances with **inline magic thresholds**:

```js
if (this.isReadyToHarvest?.()) affordances.push({ actionId: 'harvest', purpose: 'harvest', chain: true });
else if (this.canWater?.() && (context.energy ?? 1) > 0.4) ...
if (this.canBeInspectedByAi() && (context.curiosity ?? 0) > 0.78 && (1 - (context.fun ?? 1)) > 0.42 && ...) ...
```

Every one of these is expressible as a `when` clause in `data/map-objects/base.json`. The mechanism exists; it just isn't being used for the four cases that ship in code.

Two more duplications in the same 40 lines:
- The dedupe filter at `MapObject.js:816-819` is byte-identical to `MyteAI.getAffordancesForTarget` at `MyteAI.js:1285-1288`. It runs twice on every affordance list.
- `MapObject.canBeInspectedByAi()` (`:832-836`) is byte-identical to `MyteAI.canInspectTarget()` (`MyteAI.js:1291-1295`).

### 2.3 UI label logic hardcodes what config already expresses — **P1**

`js/UI/Container/ActionSidebarManager.js:207-235`, `getActionLabel()`:

```js
if (selectedObject?.constructor?.name === 'CropPlantMapObject' && action.id === 'harvest') return 'Harvest Crop';
if (selectedObject instanceof PortalMapObject && action.id === 'interact_object') return 'Use Portal';
if (selectedObject instanceof DoorMapObject && action.id === 'interact_object') return `${selectedObject.isOpen ? 'Close' : 'Open'} Door`;
if (selectedObject?.type?.toUpperCase?.() === 'GATE' && ...) ...
if (selectedObject?.getConfig?.('interaction.type') === 'light' && ...) ...
```

Meanwhile `ActionManager.getActionPresentation()` (`ActionManager.js:22-31`) already pulls `label`/`description`/`priority` from `actionConfigs.<id>` in `types.json`. Four of these five cases are static and belong there outright; the two toggle cases (`Open/Close Door`, `Turn On/Off <light>`) need a small addition — a `labelByState` map keyed on a state token the object exposes:

```json
"actionConfigs": { "interact_object": { "labelByState": { "open": "Close Door", "closed": "Open Door" } } }
```

Adding a new toggleable object type currently requires editing `ActionSidebarManager.js`. It shouldn't.

Same file, same problem, four more times: `getCategoryTitle()` (`:14-24`), `getMyteBehaviorLabel()` (`:112-123`), `getSlotStateLabel()` (`:165-183`), and the inline `driveLabels` map (`:600`) are all hardcoded display-string tables in a UI class. These belong in `SiteConfig.ui.labels` or alongside the enums they name.

### 2.4 Seven interaction actions are the same action — **P1, highest line-count win**

`js/Myte/Queue/Actions/ObjectInteractions.js` defines 18 `GoToObjectAction` subclasses. `WaterPlantAction` (`:1494`), `HarvestAction` (`:1565`), `ShakeTreeAction` (`:1645`), `ChopTreeAction` (`:1696`), `RemoveStumpAction` (`:1746`), `PickFlowerAction` (`:1289`) and `TrampleFlowerAction` (`:1383`) implement the **identical** two-phase state machine:

```
constructor:  phase = 'approach'; animationTimer = 0
update:       approach → super.update() → didAbortApproach() → phase = X,
              timer = <duration>, faceTarget(), startInteractionSoundPulse({...})
              phase X → faceTarget(), tickInteractionSoundPulse(), timer -= dt
interrupt/cancel: stopInteractionSoundPulse(); super
complete:     stopInteractionSoundPulse(); faceTarget(); super; <one effect call>; addIdle()
```

They differ only in: the `canPerform` predicate, one duration field, four sound-pulse parameters, and one method call on the target. That's ~500 lines expressing ~40 lines of unique behaviour.

**Fix:** one `TimedInteractionAction extends GoToObjectAction` base, configured from `data/metadata/actions.json`:

```json
"harvest": {
  "requires": { "capability": "harvestable" },
  "phase": { "id": "harvest", "durationKey": "harvestAnimationDuration" },
  "sound": { "ids": ["obj_crop_tend", "obj_crop_harvest"], "intervalMs": 165, "jitterMs": 65, "volume": 0.72 },
  "onComplete": { "call": "harvest" },
  "postIdle": true
}
```

Then adding "milk the cow" is a JSON entry plus a `milkable` capability tag, not a new class.

Two things this also fixes: the predicates currently compare **class names as strings** (`selected?.constructor?.name === 'CropPlantMapObject'` at `:1499`, `:1570`, and elsewhere) which breaks silently on rename and can't express "any waterable thing"; and the same-file `SmellFlowerAction` reaches into `PickFlowerAction._isFlower` (`:1455`) to borrow a predicate — a capability tag removes that coupling.

### 2.5 Three `deepMerge` implementations, four clone paths — **P2**

- `js/Utility/Utility.js:463` — canonical
- `js/Myte/MyteDefinitions.js:194` — own copy (and `editor/js/EditorStore.js:67` depends on *this* one)
- `scripts/simulate-stats.js:101` — own copy (standalone Node script; acceptable, but note the drift risk since it simulates live tuning)
- `js/Map/MapObjects/MapObject.js:586` — `JSON.parse(JSON.stringify(...))` instead of `Utility.deepClone`

`MyteDefinitions.deepMerge` should delegate to `Utility.deepMerge` (keeping the static method as a thin alias so the editor keeps working). This was tracked as "deepMerge ×6" — it's down to 3, worth closing out.

### 2.6 `ParticleSystem` ships a private copy of `Utility` — **P2**

`js/Effects/ParticleSystem.js:6-78` defines `clamp`, `lerp`, `inverseLerp`, `wrap`, `isPlainObject`, `clone`, `merge`, `toFiniteNumber`. Six of those eight already exist in `Utility` (`Utility.js:352,364,369,430,434,442,463`) with the same semantics. Delete the private copies.

### 2.7 `DroppedMapItem` opts out of the shared depth math — **P3**

`MapObject` and `MyteRenderer` both route through `EntityMethods.resolveDepthOffsetValue` / `getSortYValue` (good — this was the July fix). `js/Map/MapObjects/DroppedMapItem.js:146-153` still has its own third implementation. Also, `MapObject` caches `_depthOffset` in `invalidateDepthCache()` while `MyteRenderer.resolveDepthOffset()` (`:143`) recomputes on every call, including twice per render at `:118` and `:130`.

Minor but pervasive: `element.dataset.sortY = \`${Math.round(this.getSortY() * 100) / 100}\`` appears five times across three files. One `EntityMethods.writeSortY(el, y)`.

### 2.8 Four parallel channels for telling the player something — **P2**

`ToastSystem` is reached three different ways: `UserInterface.showMessage()` (`UserInterface.js:138`), `MyteCore.instance?.toastManager?.warning(...)` reached through the global singleton from inside action classes (`MoveActions.js:249,365,458`, `ObjectInteractions.js:227,391`, `Myte.js:206`), and `container.core?.toastManager` (`User.js:228,239,527`, `GameMap.js:657`). Separately, `MyteDialogue.showMessage()` writes in-world bubbles and `MyteStats` emits need signals through it.

There's no policy for which channel a given message uses, and gameplay code reaching `MyteCore.instance` directly is a testability dead end. **Fix:** one `Notify` service on the container (`notify.warn(msg, { title, channel: 'toast' | 'bubble' | 'log' })`), with the channel chosen by message category in `SiteConfig`, not at the callsite.

### 2.9 Duplicated inventory serialization branch — **P3**

`js/User/User.js:88-102`: the `this.inventory ? ... : ...` ternary maps the *same five fields the same way* in both branches. Collapse to `(this.inventory?.items ?? this.items).map(...)`.

---

# 3. Performance

### 3.1 The action sidebar evaluates every action, twice, every frame — **P1**

`ContainerManager.update()` → `UserInterface.update()` (`UserInterface.js:148-158`) runs nine UI subsystems per RAF frame. `ActionSidebarManager.update()` (`:377`) computes `_buildAvailableActionsKey()` **before** its 250 ms throttle (`:401`), and that key calls:

- `ActionManager.getAvailableActions()` → `canPerform` on all **58** registered actions
- `ActionManager.getExplainedUnavailableActions()` → `canPerform` on all 58 **again**, plus `explain()`

That's ~116 `canPerform` invocations per frame — ~7,000/second at 60 fps — each doing `instanceof` chains, `getConfig()` string-path walks, and queue inspections, purely to build a cache-invalidation string that is then thrown away 15 times out of 16.

**Fix, in order of payoff:**
1. Move the key computation *inside* the throttle. One line; cuts the cost 16×.
2. Better: invalidate on events instead of polling. The sidebar only needs to rebuild when selection changes, the active Myte's queue head changes, or a target's state changes — all of which already emit through `EventManager`.
3. Memoize `explainAction` per `(actionId, selected, active, queueGeneration)`.

### 3.2 `getConfig()` is a string-split path walk called 313 times across the codebase — **P2**

`js/Map/MapObjects/MapObject.js:350-361` splits the path on every call and walks the object with `hasOwnProperty`. It's called from render paths, affordance evaluation, and `canPerform` (which, per §3.1, runs thousands of times a second). Cache the split segments in a module-level `Map<string, string[]>`, and cache resolved values per object with invalidation on config change — `invalidateDepthCache()` already establishes the pattern.

### 3.3 `MyteAI` nearby-caches thrash on the second call — **P2**

`getNearbyMytes()` (`MyteAI.js:1212-1233`) caches one result keyed by `(radius, capability, tickTime)`. But `buildContext()` calls it twice in a row with different capabilities (`:274-275`), so the second call always evicts the first — the cache never hits for the pattern that motivated it. Key the cache by `radius|capability` in a small `Map` rather than three scalar fields.

Also `buildContext()` runs four separate `filter` passes over `nearbyObjects` (`:285-288`) plus a fifth in `_computeDrives` and a sixth for the scary check. One pass building all six lists is strictly cheaper and reads better.

### 3.4 Two enormous methods in the render path — **P3**

`ParticleSystem.updateVisual()` spans lines 1229–1618 (~390 lines) and `ParticleRenderer.flushParticle()` spans 345–493 (~148 lines). These are the per-particle per-frame path. They're not obviously *slow*, but nothing that long can be reasoned about or optimised safely. Split by concern (transform / opacity / sprite / colour), and while you're in there: `ParticleSystem.js` holds **12 classes in one 2,327-line file** — it should be a directory.

---

# 4. Player experience

### 4.1 The world has no memory — **P1, biggest single UX win**

`User.serializeUserData()` (`js/User/User.js:87-118`) persists: username, ids, `currentMapId`, inventory, myte roster, preferences, stats, achievements, currency. **Nothing else.** There is no `worldState`, `saveWorld`, or `serializeWorld` anywhere in `js/`.

So on every reload: crops reset, fruit trees un-fruit, bred flowers and their genes/mutations vanish, chests re-lock and re-fill, dropped items disappear, doors re-close, and every `EntityRelationships` bond (which is keyed by live object reference) evaporates.

The gardening system has **genes and mutation** — real emergent depth — and the player can never see a second generation. This is the single largest gap between what the simulation can do and what the player experiences.

**Fix:** a `WorldState` service that snapshots per map: `{ mapId, objects: [{ id, type, state }], droppedItems: [...], savedAt }`, written on map transition and on the existing 2-second save flush, restored in `GameMapLoader` after object construction. Objects opt in with `serializeState()`/`restoreState()` — `GrowingPlantMapObject`, `TreasureChestMapObject`, `DoorMapObject`, and `DroppedMapItem` cover ~90% of the value. Version the payload; discard on schema mismatch rather than migrating.

### 4.2 Three settings that do nothing — **P2**

Verified by searching for every consumer outside `SettingsPanel.js` and `User.js` defaults:

| Setting | Status |
|---|---|
| **Difficulty** (Easy/Normal/Hard/Nightmare) | Persisted as `preferences.difficulty`. **Zero consumers.** |
| **Language** (5 options) | Persisted as `preferences.language`. **Zero consumers**; no i18n layer exists. |
| **Auto-Save** | Persisted as `autoSaveEnabled`. **Zero consumers** — `User.scheduleSave()` autosaves unconditionally every 2 s regardless of the toggle. |
| Graphics Quality | ✅ *Works* — wired to `ParticleSystem.setQualityLevel` (`SettingsPanel.js:264`). |
| Tutorials | ✅ *Works* — gates `showFirstRunHints` (`Core.js:90`). |

A settings panel that lies is worse than a smaller one. Either wire them or remove them. Difficulty is genuinely cheap to wire — it's a multiplier set over `SiteConfig.stats` decay rates, which is exactly the shape `SiteConfig` already has. Auto-Save is a two-line guard. Language should be **deleted** until there's an i18n layer.

### 4.3 The active Myte's state left the persistent chrome — **P1 (regression in the working tree)**

The uncommitted `index.html` change removes `#hud-active-pet` (name / mood / energy) from the header; `HUDManager` now renders only clock, season, and coins. `#hud-active-pet` has no remaining references in `js/` or `css/`, so this was a deliberate removal — but nothing took its place.

The consequence: the active Myte's energy and mood are now visible **only** by selecting it (sidebar) or opening the Myte Info panel. In a game whose core loop is "notice your pet needs something and respond," the pet's needs are no longer ambient. A player who never opens a panel gets no signal until the Myte does something visibly desperate.

**Recommendation:** put it back, but better — the header is the right place for an *always-visible* active-Myte chip: portrait, name, and the two or three bars that actually drive behaviour (energy, satiety, mood), colour-coded, clicking through to the info panel. The Win98/XP system-tray idiom fits this exactly.

### 4.4 The AI's reasoning is computed, formatted, and then hidden

`MyteAI` maintains `lastCandidateSnapshot` — the top 5 scored candidates with scores (`MyteAI.js:163-166`) — and `ActionSidebarManager.getAiDecisionDisplay()` (`:50-61`) is a purpose-built humanizer that turns `play:nudge_ball` into "Play › Nudge Ball". But the sidebar only surfaces the raw `lastDecisionLabel` string (`:614-623`), and `getDrivesSnapshot()` / `getPressuresSnapshot()` (`MyteAI.js:1584`, `:1601`) — two more presentation-ready views — **have no callers at all.**

The most interesting thing in this game is that the Myte has reasons. Show them: "Nia is bored (Play 82%) and heading for the ball." One line in the HUD, sourced from `getPressuresSnapshot().dominantDrive` + `lastDecisionLabel`, using the humanizer that already exists.

### 4.5 `experience` and `level` are still dead

`MyteStats.js:15-16` initialises them, `MyteRosterSchema.js:117-118,166-167` serializes and restores them, and **nothing ever increments or reads them.** Flagged in July, still open. Either wire XP to `rememberCompletedAction` (which already receives `accomplishment`, `novelty`, `exertion` per completed action — the signal is right there) or delete the fields. A save schema carrying a field that has never held a non-default value is a trap for the next person.

### 4.6 Discoverability of world interaction

Two structural issues, both fixable without new art:

- **Affordances are invisible until you click.** The player has no way to know a fountain is drinkable or a tree is shakeable without selecting it and reading the sidebar. `ActionManager.getExplainedUnavailableActions` already produces "why not" reasons — the missing half is a *hover* affordance preview on world objects. `TooltipSystem` exists; `getMajorAction()` (`ActionSidebarManager.js:237`) already computes the headline verb. Wire hover → "Fountain — *Drink*".
- **Unavailable actions explain themselves only in a `title` attribute** (`ActionSidebarManager.js:294`). Native tooltips are slow, untouchable on mobile, and unstyled — they break the Win98 aesthetic besides. Route these through `TooltipSystem` like everything else.

### 4.7 Panels are hand-authored HTML

Eight `.window-panel` blocks are hardcoded in `index.html` (sound, myte info, user profile, settings, game log, world map, view, debug). Adding a panel means editing HTML **and** JS **and** SCSS, and the markup is near-identical each time (header / title / minimize / maximize / close / content / footer). `ModalWindow` already owns the behaviour; give it a declarative panel spec (`{ id, icon, title, tabs, controls }`) and render the chrome from `SiteConfig.ui.panels`. Removes ~200 lines of `index.html` and makes panels a data concern.

### 4.8 Tone.js from a CDN

`index.html:523` loads Tone.js from `cdnjs.cloudflare.com`. For a game framed as "little viruses living inside *your* machine," a hard runtime dependency on a third-party CDN is thematically off and practically fragile (offline dev, CSP, CDN outage → no audio and no error the player understands). Vendor it into `js/vendor/`.

---

# 5. Maintainability

### 5.1 165 unreferenced methods (~7% of 2,340)

Full list in Appendix A. Mechanically derived, so expect a handful of false positives (dynamically dispatched handlers, editor-only entry points). The high-confidence clusters:

| Cluster | Count | Notes |
|---|---|---|
| `ParticleSystem` `addX` façades | 14 | `addSmoke`, `addRain`, `addSnow`, `addSwarm`, `addFirework`, `addButterfly`, `addTrail`, `addBubbles`, `addMotes`, `addEmbers`, `addHealBurst`, `addImpactSpark`, `addParticle`, `setParticleScale` — all superseded by `emit(preset, x, y)` |
| `MyteQueue` `addX` convenience wrappers | 12 | `addCircle`, `addZigzag`, `addSleep`, `addSimpleSleep`, `addFollowMouse`, `addFollowObject`, `addHide`, `addRunAway`, `addPlayTag`, `addPlayFetch`, `addPickupMyte`, `addPickupBall`, `addMoveToElement` — **and they carry hardcoded default durations** (`addDance(2000)`, `addJump(100)`, `addCircle(…, 50, 3000)`) that duplicate and can contradict `metadata.defaultDuration` |
| `ActionManager` static queries | 5 | `enqueue`, `getActionsByCategory`, `getMovementActions`, `getInterruptibleActions`, `getMoodAffectingActions` |
| `MapObject` action-occupancy API | 5 | `claimActionOccupancy`, `releaseActionOccupancy`, `getActionOccupant`, `getActionSlotOccupant(s)` — leftovers from the deleted `ActionSlotLedger`; `AttachmentSystem` owns this now |
| `MyteAI` snapshot variants | 2 | `getDrivesSnapshot`, `getPressuresSnapshot` — see §4.4; these are *worth wiring*, not deleting |
| `ActionSidebarManager` | 3 | `appendNeedMeter`, `getNeedFulfillmentLabel`, `appendInfoRow` — superseded by the row-based renderer |
| `SoundManager` animal-speech | 4 | `speakAnimalText`, `speakAnimalWithEmotion`, `showAnimalDialog`, `playObjectSound` |
| `User` | 4 | `addMyte`, `removeMyte`, `logout`, `unlockAchievement` — note `unlockAchievement` being dead means the achievements map is never written |

**Do not touch** the XPath / element-finding helpers in `Utility.js` (`getElementByXPath`, `getElementXPath`, `initXPathClick`, `findClosestElementToMouse`, `isDescendant`, `shouldIgnoreElement`, `isTopOnlyTag`, `isNotIgnored`, and the viewport predicates). These are deliberately retained.

### 5.2 The bundle is a committed build artifact

`js/bundle.js` (64K lines of concatenated source) is tracked in git and appears in every diff. I ran `node scripts/build-manifest.js` during this audit; it is idempotent and the manifest covers all 146 source files correctly, so tooling is healthy. But every source change produces a second, enormous, mechanically-derived diff in the same commit, which makes review and `git blame` materially worse.

**Recommendation:** gitignore `js/bundle.js`, generate it in a `prepare`/`predev` npm script, and add a pre-commit or CI check that the manifest is in sync. If it must stay tracked for deployment simplicity, at least add `js/bundle.js -diff` to `.gitattributes` so it collapses in diffs.

### 5.3 File sizes

Seven files exceed 1,500 lines. `ParticleSystem.js` (2,327, 12 classes), `MoveActions.js` (1,832, 13 classes), `MapObject.js` (1,805), `ObjectInteractions.js` (1,795, 18 classes), `MapEnvironmentManager.js` (1,742), `AudioPresetLibrary.js` (1,720, data), `AStarPathfinder.js` (1,691). The action files split naturally along the §2.4 refactor; `ParticleSystem` splits along class boundaries; `AudioPresetLibrary` is data and should be JSON in `data/` like every other data table.

### 5.4 Config coverage is good; the exceptions are conspicuous

`SiteConfig.js` (877 lines) is genuinely comprehensive — the AI candidate builders read essentially every threshold from it, which is exemplary. The remaining hardcoded gameplay numbers stand out precisely because they're rare:

- `MapObject.getAiAffordances` thresholds `0.4`, `0.78`, `0.42`, `0.55` (`:799-811`)
- `MyteAI.findCuriosityWanderTarget` thresholds `0.48`, `0.55`, `0.55` (`:1412-1420`)
- `MyteAI.getThinkInterval` coefficients `1.24`, `0.42`, `0.18`, `0.3`, `1.22` (`:105-106`)
- `MyteAI.selectCandidate` jitter `0.9 + random * 0.2` (`:209`)
- `MyteAI.getWanderBounds` / `findWanderTarget` cell multipliers `3`, `4`, `8`, `16`, `18` attempts (`:1326-1396`)
- `MyteQueue` convenience-wrapper durations (§5.1)
- `ActionSidebarManager.infoRefreshInterval = 250` (`:7`) — duplicates `SiteConfig.ui.hud.updateIntervalMs`, which is also 250

---

# 6. Implementation plan

Five phases. Each is independently shippable and ends in a state you'd be happy to leave the branch in. Phases 1–2 are mechanical; 3–5 need design attention.

### Phase 1 — Correctness (~1 day)

1. Split the side effect out of `MyteAI.buildContext()`; move the confidence penalty into `tickUpdate` (§1.1).
2. Swap the four gameplay timer sites to `SimClock.now()` (§1.2); add `scripts/check-time-sources.js` and wire it into `npm run validate:content`.
3. Copy-before-mutate in `MyteQueue.add()` (§1.3).
4. Unify the three queue-advance paths behind `_advance({ completed })` (§1.4).
5. Guard `WorldGraph.discover()` against overlapping calls (§1.6).

*Verify:* `docs/SMOKE_CHECKLIST.md`, plus specifically — open the Myte Info panel next to a scary object for 60 s and confirm confidence tracks the same as with the panel closed.

### Phase 2 — Cheap wins (~1 day)

6. Move `_buildAvailableActionsKey` inside the throttle (§3.1, step 1) — one line, 16× cost reduction.
7. Memoize `getConfig` path splits (§3.2).
8. Fix the `getNearbyMytes` cache key; single-pass `buildContext` filters (§3.3).
9. Delete the ~40 high-confidence dead methods (§5.1), **excluding** the `Utility` XPath block and `MyteAI`'s two snapshot methods.
10. `MyteDefinitions.deepMerge` → delegate to `Utility.deepMerge`; `MapObject:586` → `Utility.deepClone`; strip `ParticleSystem`'s private utils (§2.5, §2.6).
11. `DroppedMapItem` → `EntityMethods`; add `EntityMethods.writeSortY` (§2.7).
12. Delete Language and Difficulty from Settings, or wire Difficulty as a `SiteConfig.stats` multiplier set; make Auto-Save actually gate `scheduleSave` (§4.2).
13. Gitignore `js/bundle.js` + npm `prepare` script (§5.2).

### Phase 3 — Finish the migrations (~3 days)

14. Relationships become the sole carry source; delete the `instanceof` fallbacks in `MyteQueue` (§2.1).
15. Move the four hardcoded affordances into `when` clauses in `base.json`; delete the duplicate dedupe filter and `canInspectTarget` (§2.2).
16. `TimedInteractionAction` base + JSON specs; collapse the seven interaction actions; replace `constructor.name` predicates with capability tags (§2.4). *Largest change in the plan — do it alone, on its own branch.*
17. Move `getActionLabel` / `getCategoryTitle` / `getMyteBehaviorLabel` / `getSlotStateLabel` / `driveLabels` into config; add `labelByState` to `actionConfigs` (§2.3).
18. Introduce the `Notify` service; convert the `MyteCore.instance?.toastManager` reach-throughs (§2.8).

### Phase 4 — Player-facing (~1 week)

19. **World persistence** (§4.1). `serializeState`/`restoreState` on `GrowingPlantMapObject`, `TreasureChestMapObject`, `DoorMapObject`, `DroppedMapItem`; versioned `worldState` block; restore in `GameMapLoader`.
20. Active-Myte chip in the header, always visible (§4.3).
21. Surface the AI's dominant drive + humanized decision in the HUD, using the existing `getPressuresSnapshot` and `getAiDecisionDisplay` (§4.4).
22. Hover affordance preview on world objects via `TooltipSystem` + `getMajorAction`; move unavailable-reason tooltips off the `title` attribute (§4.6).
23. Wire `experience` to `rememberCompletedAction`'s `accomplishment`/`novelty` signal, or delete both fields (§4.5).

### Phase 5 — Structural (~1 week, optional)

24. Event-driven sidebar invalidation, replacing polling entirely (§3.1, step 2).
25. Declarative panel registry; generate `.window-panel` chrome from `SiteConfig.ui.panels` (§4.7).
26. Split `ParticleSystem.js` into `js/Effects/Particles/`; `AudioPresetLibrary.js` → `data/metadata/audio-presets.json` (§5.3).
27. Vendor Tone.js (§4.8).
28. Lift the remaining hardcoded AI/wander constants into `SiteConfig` (§5.4).

---

## Appendix A — Reproducing the scans

```bash
# Unreferenced methods — prints the full 165-entry list (regex-based; expect ~5% false positives)
node scripts/dead-methods.js

# Time-source violations
grep -rn "performance.now()\|Date.now()" js --include=*.js | grep -v bundle.js

# Manifest ↔ disk coverage + bundle freshness (idempotent)
node scripts/build-manifest.js && git status --porcelain js/bundle.js

# Settings with no consumer
grep -rn "difficulty\|language\|autoSaveEnabled" js --include=*.js | grep -v bundle.js
```

## Appendix B — What's healthy (do not "fix" these)

Recorded so a future pass doesn't mistake deliberate design for debt:

- The fixed-tick accumulator + `SimClock` + visibility pause in `Core.js` — correct, leave alone.
- `WorldGraph`'s discovered-not-declared topology. Adding a map is dropping a `.tmx` and pointing a portal at it. Excellent.
- `ActionManager.explainAction`'s three-way contract (bool / `{ok, reason}` / `static explain`) — backwards-compatible and genuinely improves the UI.
- The `scoreDrivers` / `purposeOverrides` mechanism in `actions.json`. AI scoring being data is the right call.
- `EntityMethods` as the shared entity contract, and `MapRenderer`'s batched `renderState`/`flush`.
- The pooled particle architecture (`Pool`, `ViewPool`, preset registry, behavior registry). The file is too big; the design is right.
- The `Utility.js` XPath/element-finding block — retained deliberately.
