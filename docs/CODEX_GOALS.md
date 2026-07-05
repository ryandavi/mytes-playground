# Task Dispatch — July 2026 Architecture Roadmap

Paste-ready blocks for the currently-unblocked tasks from `docs/ARCHITECTURE_AUDIT_2026-07.md`. Blocks for T3+ get added here **when their dependencies land**, not before. (Previous goals file for the June audit was archived to `docs/OLD/CODEX_GOALS.md`; all its goals shipped.)

Rules for every task: one branch off `new-ai-system` per task; end by running `docs/SMOKE_CHECKLIST.md` and reporting results; Fable reviews the diff against the spec before merge.

Dispatch order: D1 and D3/D4 can run in parallel. D2 requires D1 merged **and** depth baselines recorded (see `docs/audit-baselines/README.md`).

---

## D1 (= audit T1) — Cleanup bundle — **Sonnet, Claude Code session**

```
In the Neko codebase (read AGENTS.md first; branch task/t1-cleanup off new-ai-system):

1. Move MapObject shadow visuals into the renderState/MapRenderer.flush contract:
   rename updateShadowVisual() to computeShadowVisual() and have it write
   renderState.shadow = { visible, width, height, left, top, opacity, scale, color, blur }
   (only when values changed — compare against the previous shadow state), setting
   renderState.dirty when it changes. MapRenderer.flush/flushOne applies
   renderState.shadow to obj.shadowElement. Keep the immediate write inside
   MapObject.updatePosition() (one-shot path). Callers of updateShadowVisual update
   to the new name.
2. In AmbientCreatureMapObject.updateDebugAttributes(), return early unless
   document.body.classList.contains('debug') (read once per frame via a cached
   static/module flag updated in render or update, not per attribute).
3. In MapObject: switch interactionState timing (canInteract, interact, and the
   cooldown sweep in tickUpdate) from performance.now() to SimClock.now().
4. In js/Myte/Queue/Actions/CarryActions.js: replace the CARRY_OFFSET = 45 constant
   with SiteConfig.myte.carryOffset (add the key with value 45 to SiteConfig.js);
   convert CarryPickupAction and CarryPutdownAction from frame-count durations
   (currentDuration--) to deltaTime-millisecond accumulation with the same
   effective default (100 ms total).
5. In GameMap.createDefaultMap: remove the BUTTERFLY and NPC spawns; keep
   dimensions/spawn points; surface a ToastSystem warning
   "Map failed to load — using empty fallback map".
6. Rename js/Myte/Input/BaseInputHandler.js to MyteBaseHandler.js (file only; the
   class inside is already MyteBaseHandler). Update scripts/script-manifest.json and
   run `npm run build:scripts`.
7. In User.saveUserData (js/User/User.js): wrap the localStorage.setItem calls in
   try/catch; on failure, console.error and show a ToastSystem warning
   "Could not save — storage full or unavailable". Never let a save failure throw
   into callers (it is called from dispose).

Do not change any other behavior. Verify in the browser: shadows on objects and
ambient creatures look identical, bird hover unchanged, myte carry/putdown feels
identical, interaction cooldowns still work. Finish by running
docs/SMOKE_CHECKLIST.md and reporting results.
```

---

## D2 (= audit T2) — Depth caching + dedupe — **Sonnet, Claude Code session**
**Preconditions: D1 merged; `docs/audit-baselines/depth-Outside.json` and `depth-House.json` committed (Ryan records via `window.__audit.dumpDepth()`).**

```
In the Neko codebase (read AGENTS.md; branch task/t2-depth off new-ai-system):

Baselines exist at docs/audit-baselines/depth-*.json (produced by
window.__audit.dumpDepth() from js/UI/Debug/AuditHarness.js). Your acceptance is a
zero diff against them.

1. Cache MapObject depth resolution: compute this._depthOffset, this._depthPriority,
   and this._renderLayerKey once in the constructor using the existing
   resolveDepthOffset/getDepthPriority/getRenderLayerKey logic; make those methods
   return the cached values. Add invalidateDepthCache() and call it from
   applyFacingDirection and anywhere config.spatial, config.visual, or this.collider
   is mutated (grep for those mutations — applyFacingDirection is the main one).
2. Deduplicate the depth implementation: move the shared body of
   resolveDepthOffset/getSortY into EntityMethods in js/Engine/Entity.js,
   parameterized by (depthLine, depthOffset, colliderBottom, sizeHeight). MapObject
   feeds it from config; MyteRenderer feeds it from myte.definition. Delete the
   duplicated code in MyteRenderer.
3. Re-dump depth on Outside and House and diff against the baselines: the diff must
   be empty. Include the diff result in your report.

Finish by running docs/SMOKE_CHECKLIST.md and reporting results.
```

---

## D3 (= audit T14) — Production script bundle — **Codex**

```
/goal Add a zero-dependency production bundle mode to the Neko script build.

Context: c:\xampp\htdocs\genes\chat\neko, branch task/t14-bundle off new-ai-system.
Vanilla JS, no bundler; scripts/script-manifest.json is the ordered source of truth
(~129 entries, first entry is the Tone.js CDN script with "cdn": true);
scripts/build-manifest.js rewrites the script blocks in index.html/index.php between
SCRIPTS:BEGIN/END markers.

Changes:
1. Extend scripts/build-manifest.js with a --bundle flag (npm script
   "build:bundle": "node scripts/build-manifest.js --bundle"). Without the flag,
   behavior is byte-identical to today.
2. --bundle additionally: (a) concatenates every non-CDN manifest entry, in manifest
   order, into js/bundle.js — each file preceded by a "/* ── <src> ── */" comment
   line and joined with ";\n" for statement safety; (b) generates index.bundled.php
   and index.bundled.html as copies of index.php/index.html with the marker block
   replaced by exactly two tags: the Tone.js CDN tag with a defer attribute, and
   <script src="js/bundle.js?v=<?= $v ?>"></script> (bare src for the .html
   variant). Everything outside the marker block is copied verbatim, including the
   PHP header of index.php.
3. Add js/bundle.js, index.bundled.php, and index.bundled.html to .gitignore
   (create the file if the repo has none; check first).
4. Do not touch index.php/index.html dev behavior, and do not add npm dependencies.

Acceptance: `npm run build:scripts` output unchanged (empty git diff on the two dev
entry files); `npm run build:bundle` is idempotent (second run, no changes); opening
index.bundled.php through XAMPP boots the game identically to index.php with a
console free of new errors; browser network tab shows ~3 requests for JS instead of
~129. Report the before/after request counts. Finish by running
docs/SMOKE_CHECKLIST.md against index.bundled.php and reporting results.
```

---

## D4 — Headless stat-balance simulation — **Codex**

```
/goal Create a headless Node simulation of Myte stat decay/regen so balance tuning
has curves instead of vibes.

Context: c:\xampp\htdocs\genes\chat\neko, branch task/sim-stats off new-ai-system.
The stat math lives in js/Myte/MyteStats.js driven entirely by
js/Engine/Config/SiteConfig.js; time comes from js/Engine/SimClock.js; helpers from
js/Utility/Utility.js. These are browser globals (no modules).

Changes:
1. Create scripts/simulate-stats.js (Node, zero dependencies). Load Utility.js,
   SimClock.js, SiteConfig.js, and MyteStats.js into a Node `vm` context with the
   minimal global stubs they need at load/run time (window, document, etc. — read
   the files and stub exactly what is touched; if something needs a stub that feels
   like real behavior, stop and flag it rather than faking it). DO NOT modify any
   game file.
2. Construct MyteStats with a minimal stub myte (read the constructor to see what it
   touches: definition, parent, buffs — stub buff aggregation as neutral). Drive it
   with fixed 50 ms steps, advancing SimClock identically.
3. Simulate and report three scenarios: (a) 8 sim-hours idle in home slot
   (updateInHomeSlot path), (b) 2 sim-hours deployed/active (update path, no action
   effects), (c) 1 sim-hour deployed then a sleep-effect application using the sleep
   action's effects values from data/metadata/actions.json.
4. Output: a markdown table per scenario (stat values at 15-sim-minute intervals)
   printed to stdout, plus a summary listing any stat that reaches 0 or max and the
   sim-time it happened. Add npm script "sim:stats".

Acceptance: `npm run sim:stats` runs clean on Node without a browser and its output
tables change when a SiteConfig.stats decay rate is temporarily doubled (prove it in
your report, then revert). No game files modified.
```

---

## Queued (do NOT dispatch yet)

| Task | Blocked on |
|---|---|
| ~~T3 WorldRegistry impl~~ | **DONE by Fable 2026-07-05** — WorldRegistry implemented; grid passthrough/culling guards in GameMapGrid; myte self-healing grid registration; registry wiring in GameMap/ContainerManager. Included a pathfinder-cache fix: walkable movers no longer invalidate the validation cache on every step. **Needs one browser smoke pass (docs/SMOKE_CHECKLIST.md) + the console check below before T4 dispatch.** |
| T4 WorldQuery **call-site migration** | **WorldQuery itself is implemented** (Fable 2026-07-05, headless-tested; per-kind liveness predicates pinned in its header). Remaining T4 = flipping the callers over (MyteAI.getNearby*, NpcMapObject._detectTargets, Myte._syncCompanionBuffs, getRandomNearbyObject, BirdMapObject broad phase) — blocked on T3 browser verification + candidate baselines. |
| T5 EntityRelationships **call-site migration** | **EntityRelationships itself is implemented** (Fable 2026-07-05, headless-tested: inverse pairing, exclusivity stealing, despawn cleanup via WorldRegistry.remove, serialize/restore). `container.relationships` is constructed and the despawn hook is live (inert until relations are set). Remaining T5 = migrating carry/aggro/rest/follow encodings behind the existing façades — blocked on T3 browser verification. |
| T6 sockets/attachments rollout | T5 + **Fable's couch vertical slice** |
| T6b/T7 data migrations | T6 / T4; specs in docs/SOCKET_SCHEMA.md |
| T12 validation harness + invariant sweeper | sweeper needs T5; the sockets-schema validator part can ship with T6b |

**T3 console verification** (run with a deployed myte, then again after a map transition):

```js
const c = MyteCore.instance.getFirstContainer();
console.log(c.worldRegistry.stats());                      // counts match c.mytes.length / gameMap.objects.length / droppedItems.length
const m = c.activeMyte;
console.log(c.gameMap.gridSystem.getObjectsInArea(m.posX, m.posY, 1, 1).includes(m)); // true within ~125ms of deploy
console.log(c.gameMap.gridSystem.getPotentialCollidersForArea(m.posX, m.posY, 10, 10).includes(m)); // must be false (mytes are never colliders)
// Walkability unchanged: stand a myte on open ground, confirm cells stay walkable in ?debug grid overlay
console.log(__audit.invariants());                        // [] = clean; run again after a map transition and after collecting a dropped item
const wq = c.gameMap.worldQuery;                          // implemented but unmigrated — sanity: returns nearby objects sorted by distance
console.log(wq.findNearby({ x: m.posX, y: m.posY, radius: 300, kind: 'object' }).map(o => o.type));
```
