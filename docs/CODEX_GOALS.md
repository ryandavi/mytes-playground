# Codex Goals — July 2026 Audit Follow-up

Paste each block into Codex as a `/goal`. Suggested order: Goal 3 → Goal 2 → Goal 1 → Goal 4 → Goal 5.

Already done in the main session (do NOT redo): `_approachInfo`/`_approachWarn` gating in MoveActions.js; deletion of `js/Myte/MyteCommand.js` + `js/User/UserSettings.js`; `safeAreaRadius ?? literal` removal in MyteStats.js; particle culled-count moved into `renderer.flush`.

---

## Goal 1 — Unify the script manifest

```
/goal Unify the duplicated script lists in index.html and index.php behind one generated manifest.

Context: c:\xampp\htdocs\genes\chat\neko. Vanilla JS project, no bundler; load order is the dependency system. index.html and index.php each contain an identical, hand-maintained list of ~123 <script src="js/..."> tags. index.php appends ?v=<?= $v ?> to each src for cache busting; index.html has bare paths.

Changes:
1. Create scripts/script-manifest.json: an ordered JSON array of the js/ script paths, extracted exactly from the current index.php order (treat index.php as canonical). Include the Tone.js CDN entry as the first item with a "cdn": true flag.
2. Create scripts/build-manifest.js (Node, no dependencies): reads the manifest and rewrites the script block in BOTH index.html and index.php between marker comments <!-- SCRIPTS:BEGIN --> and <!-- SCRIPTS:END -->. For index.php emit src="...?v=<?= $v ?>"; for index.html emit bare src. Insert the marker comments around the existing blocks as part of this change. Fail with a nonzero exit and a clear message if markers are missing or the manifest references a file that does not exist on disk.
3. Add npm script "build:scripts": "node scripts/build-manifest.js" to package.json.
4. Run it and verify: git diff of index.html and index.php shows only the marker comments added — zero script reordering, zero entries added or removed.
5. Extend the build script to also verify every .js file under js/ is present in the manifest, so dead files and missing registrations are caught (fail listing the unreferenced files). js/Myte/MyteCommand.js and js/User/UserSettings.js have already been deleted; there should be zero exceptions.

Constraints: do not change load order. Do not touch anything outside the script blocks in the two entry files. PHP short echo tags must be emitted literally into index.php.

Acceptance: both entry files load the game identically before/after; build script is idempotent (second run produces no diff); validation fails if a js file is missing from the manifest.
```

---

## Goal 2 — Finish the clone/merge consolidation

```
/goal Consolidate all deepMerge implementations onto a single Utility.deepMerge, and remove the duplicated math/data helpers in ParticleSystem.js.

Context: c:\xampp\htdocs\genes\chat\neko, branch new-ai-system. A consolidation pass already moved cloneValue/isPlainObject/normalizeId/preventCache into js/Utility/Utility.js — build on it, don't revert it. Utility.deepClone and Utility.isPlainObject exist. deepMerge still has six implementations: ActionDefinitionRegistry.deepMerge, MyteDefinitionRegistry deepMerge (js/Myte/MyteDefinitions.js), MapEnvironmentManager.deepMerge, one in MapObjectFactory.js, one in MapObject.js, and ParticleDataUtils.merge in js/Effects/ParticleSystem.js.

Step 1 — semantics table first: read all six and produce a short table (in the commit description) of their differences: array handling (replace vs clone vs concat), undefined-override handling, null handling, non-plain-object handling. Do not write the unified function until this table exists.

Step 2 — implement Utility.deepMerge(base, override) with these canonical semantics unless the table reveals a live conflict: arrays → override replaces base, result deep-cloned; override === undefined → deep-cloned base; base or override not a plain object → deep-cloned override (or base when override undefined); plain objects → recursive key-union merge. Document the semantics in a comment block on the function.

Step 3 — migrate callers one file at a time. For each call site, verify against the table that behavior is preserved; where a local implementation differs in a way that matters, note it and preserve observable behavior. KEEP MyteDefinitionRegistry.deepMerge as a public delegating alias — editor/js/EditorStore.js calls it by name for runtime-parity merge semantics (see comment at EditorStore.js:4); its behavior must not change.
CAUTION: ActionDefinitionRegistry.getDefinitionSync caches deepFreeze(deepMerge(...)) results — frozen output must still work (Utility.deepMerge must return fresh objects, never shared references into base/override).

Step 4 — ParticleSystem.js: replace ParticleMath.clamp/lerp/inverseLerp/wrap bodies with delegation to Utility (keep the ParticleMath names as local aliases for hot-path brevity), and replace ParticleDataUtils.clone/isPlainObject with Utility delegation. ParticleDataUtils.merge migrates to Utility.deepMerge only if the semantics table says it's equivalent; otherwise leave it and note why.

Acceptance: game boots with no console errors; mytes queue and complete actions (action metadata merging is on this path); map environment presets and atmosphere transitions render; particles render; editor still merges records identically (open editor/, inspect a myte record with overrides, confirm base/override badges unchanged). npm run validate:content passes. No remaining method named deepMerge/cloneValue outside Utility except the MyteDefinitionRegistry alias.
```

---

## Goal 3 — Fail-loud map loading + console hygiene

```
/goal Remove load-failure masking in GameMap, relocate the pathfinding dev harness, and sweep console output behind the debug gate.

Context: c:\xampp\htdocs\genes\chat\neko, branch new-ai-system. Vanilla JS game; Utility.isDebugEnabled(), Utility.logDebug and Utility.warnDebug are the debug-gated logging path.

Changes:
1. js/Map/GameMap.js: remove the alternative-TMX-path probing in initialize (the loop trying alternate paths around line 266). A failed map load must reject/throw with the attempted path in the message. Keep createDefaultMap ONLY for the explicit initial-boot case: add an options.allowFallback flag threaded from the initial ContainerManager.init load; all other call sites (~3 falling through to createDefaultMap) must surface the error instead — use the existing ToastSystem (Core.instance.toastManager) to show "Failed to load map <id>" and keep the current map active where one exists (a map-transition failure must not black-screen).
2. js/Map/GameMap.js: move testPathfinding() out of GameMap — relocate its body to js/UI/Panels/DebugPanel.js as a debug action (follow how existing debug actions there are registered); delete the GameMap method.
3. Console hygiene sweep across js/ (NOT editor/): for each console.log/console.warn call, classify: (a) real failure/error path → leave as console.error or console.warn, (b) developer diagnostics → convert to Utility.logDebug/Utility.warnDebug, (c) commented-out or trivially useless → delete. Do not touch console.error calls. Keep the singleton warning in Core.js. List every conversion in the commit message grouped by file. Roughly 160 call sites across ~45 files; use judgment — error paths in registries/loaders should stay loud.

Constraints: no behavior changes outside error surfacing and logging. Time sources: any new timing uses SimClock.now() for gameplay, wall-clock only for UI.

Acceptance: game boots clean with zero console output in non-debug mode until an actual error occurs; ?debug=1 restores diagnostics; loading a nonexistent map id shows a toast and does not silently create a default butterfly map; initial boot with valid data unchanged; npm run validate:content passes.
```

---

## Goal 4 — AI candidate scoring to SiteConfig

```
/goal Move MyteAI candidate scoring constants into SiteConfig.ai.candidates so AI balancing is data-driven.

Context: c:\xampp\htdocs\genes\chat\neko, branch new-ai-system. js/Myte/MyteAI.js candidate builder methods (roughly lines 370-900) compute scores from inline literals, e.g. `let score = 14 + (context.drives.eatDrive * 72) + Math.max(0, 160 - distance) * 0.1;` and `if (context.drives.eatDrive > 0.75) score += 18;`. js/Engine/Config/SiteConfig.js is the declared single source of truth for simulation tuning (see AGENTS.md).

Changes:
1. Inventory every numeric literal in the candidate builder methods in MyteAI.js: base scores, drive weights, distance falloffs and ranges, threshold values, conditional bonuses, commitment times, amplitude/duration/radius constants. Skip literals that are structural (array indices, 0/1 identity values, unit conversions).
2. Add SiteConfig.ai.candidates as one block, one sub-object per candidate type (eat, rest, safety, social, play, explore, inspect, ...following the actual builder names), with descriptive key names (base, driveWeight, urgentThreshold, urgentBonus, distanceFalloffRange, distanceFalloffRate, modeBonus, commitmentMs, ...). Preserve every current value exactly.
3. In each builder, read the config once at the top (const cfg = SiteConfig.ai.candidates.eat;) and use cfg.* in the formulas. Formula structure stays identical — this is value relocation, not rebalancing.
4. Where the same concept repeats across candidates (e.g. mode bonus, distance falloff), use the same key names for consistency, but keep per-candidate values separate (no shared magic defaults).
5. Add a brief comment block above SiteConfig.ai.candidates explaining the scoring model: candidates are scored per think, highest wins, typical range 0-100, commitmentMs prevents thrash.

Constraints: zero behavior change — every value identical before/after. Do not add a fallback `?? literal` after any config read (AGENTS.md forbids duplicate inline defaults; SiteConfig is the single source). Do not restructure the builders themselves.

Acceptance: game boots; mytes still eat when hungry, rest when tired, socialize (observe a few minutes of autonomous behavior with 2+ mytes); diff of MyteAI.js shows only literal→cfg substitutions and the config reads; every removed literal appears exactly once in SiteConfig.ai.candidates.
```

---

## Goal 5 — MapObject de-accretion (boundaries pre-drawn)

```
/goal Extract two self-contained subsystems out of js/Map/MapObjects/MapObject.js (2,170 lines) into composed controller classes, and move two generic string helpers to Utility. Boundaries are pre-decided — do not re-litigate them.

Context: c:\xampp\htdocs\genes\chat\neko, branch new-ai-system. MapObject is the base class for ~30 subclasses under js/Map/MapObjects/. The established precedent for this split is js/Myte/Input/ — Myte keeps input choreography in separate handler classes; MapObject currently inlines all of it. New files must be added to BOTH index.html and index.php script lists (or scripts/script-manifest.json + npm run build:scripts, if Goal 1 has landed), ordered before MapObject.js dependents — place them right before MapObject.js.

Extraction 1 — ActionSlotLedger (new file js/Map/MapObjects/ActionSlotLedger.js):
Move the action-slot occupancy subsystem: getActionSlotDefinitions, getActionOccupant, getActionSlotOccupants, getActionSlotOccupant, isActionSlotOccupied, getAvailableActionSlots, isActionOccupied, claimActionSlot, claimActionOccupancy, releaseActionOccupancy, releaseActionSlot, isInUse (MapObject.js ~lines 524-605 and 962-1140), plus the occupancy state they own. Composition, not inheritance: MapObject constructs this.actionSlots = new ActionSlotLedger(this) and keeps thin one-line delegating methods with the SAME public signatures (actions, ActionManager, and AI call these on the object — the external API must not change). The ledger reads config via this.object.getConfig/getActionConfig.

Extraction 2 — MapObjectInputController (new file js/Map/MapObjects/MapObjectInputController.js):
Move the input wiring and drag choreography: initializeInputComponents, initClickComponent, initDragComponent, initRubbingComponent, _initSelectDragHandler, _restoreToolModeAfterDrag, startDrag, startDragAtPosition, _rotateDuringDrag, showDropTarget, hideDropTarget, getDropValidationBounds, checkDropValidity, enableDragging/disableDragging, enableRubbing/disableRubbing (MapObject.js ~lines 1141-1500, 1600-1717, 2123-2140). MapObject constructs this.input = new MapObjectInputController(this) and keeps thin delegates only for methods called externally (search callers first; enableDragging/disableDragging and startDrag are called from outside; the init* methods are likely internal-only and need no delegate).
CRITICAL subclass-hook constraint: gesture/behavior hooks that subclasses override — handleSingleClick, handleDoubleClick, handleLongPress, handleMovedEvent, handleRubProgress, handleRubEvent, handleRubOverdone, canBeDragged, canStartSelectModeDrag, canShowSelectPointer, canBePickedUpBy, pickup, drop — STAY on MapObject. The controller invokes them via this.object.handleSingleClick() etc., so every subclass override keeps working. Grep all subclasses for overrides of the moved methods before moving anything; if a subclass overrides a method you planned to move (e.g. a custom startDrag), keep that method on MapObject as a delegating seam and note it.

Extraction 3 — string helpers to Utility:
Move humanizeLabelToken and formatDisplayQuantity (MapObject.js lines 210-230) to js/Utility/Utility.js as static methods (Utility.humanizeLabel, Utility.formatQuantityRange). Keep one-line delegating instance methods on MapObject (TreasureChestMapObject and getDisplayName call them via this.*) — the delegation preserves the subclass API at near-zero cost.

Do NOT move: sidebar row methods (getSidebarStatusRows/_getSidebarStatusRows/getSidebarDetailRows — polymorphic view-model contract, stays), deflowered state (deliberately placed, see its comment), light-source config accessors, collider math, depth/z-index, render methods, the Entity mixin application.

Lifecycle: both new controllers need dispose hooks called from MapObject.remove() — move the input-component teardown currently in remove() into MapObjectInputController.dispose(), and any occupancy cleanup into ActionSlotLedger.clear(). Every event subscription made in the controllers must be cleaned up there.

Acceptance: node --check passes on all touched files; game boots with no console errors; drag a chest and a ball (drop targets + tool-mode restore work); rub a rubbable object; two mytes can claim different slots on one object and a third is refused when full (drinking at the fountain exercises this); TreasureChest sidebar shows humanized loot labels with quantity ranges; MapObject.js drops below ~1,400 lines; no subclass file needed changes beyond (at most) renamed internal calls — if a subclass required edits, explain why in the commit message.
```
