# Task Dispatch — July 2026 Architecture Roadmap

Paste-ready blocks for the currently-unblocked tasks from `docs/ARCHITECTURE_AUDIT_2026-07.md`. Blocks for T3+ get added here **when their dependencies land**, not before. (Previous goals file for the June audit was archived to `docs/OLD/CODEX_GOALS.md`; all its goals shipped.)

> **Status update 2026-07-09:** the uncommitted working tree already implements D1, D2, D3 (bundle mode), D4, most of T4/T16, and parts of T5/T7 — reviewed in detail in the audit doc's *Addendum — 2026-07-09 Working-Tree Review*. **Do not re-dispatch D1–D4.** The live queue is **D5 → D6 → D7** below.
>
> **Model routing update:** implementation tasks now go to **GPT-5.6** (owner has no Fable budget). Wherever this file says Sonnet/Opus/Codex, read GPT-5.6. Fable's review gate is replaced by: run every acceptance harness + `docs/SMOKE_CHECKLIST.md` and report raw results; never change APIs in `js/Engine/{WorldRegistry,WorldQuery,EntityRelationships,AttachmentSystem}.js` or `docs/SOCKET_SCHEMA.md` (frozen specs).

Rules for every task: one branch off `new-ai-system` per task; end by running `docs/SMOKE_CHECKLIST.md` and reporting results; diff is reviewed against the spec before merge.

Dispatch order (historical): D1 and D3/D4 can run in parallel. D2 requires D1 merged **and** depth baselines recorded (see `docs/audit-baselines/README.md`).

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

## Combined run (D5 + D6 in one session)

D5 and D6 may run in a single worker session, in this order:
1. **D5 first**, directly on `new-ai-system` (it repairs the uncommitted tree). When its checks pass, **commit** the working tree (one commit for the in-flight batch + fixes is fine; message should cite the 2026-07-09 addendum).
2. **Then D6** on branch `task/t17-stats` off that commit.
3. Steps that require a live browser (T3 console block, smoke checklist, D6 Step 4 observation): perform them if the environment can run the game (XAMPP serves the repo root; open /index.php); otherwise do NOT silently skip — end the report with a "NEEDS HUMAN BROWSER PASS" checklist enumerating exactly which checks remain, so the owner can run them.

---

## D5 — Working-tree defect fixes (WT-1 … WT-9) — **GPT-5.6** — DISPATCH FIRST

```
In the Neko codebase (read AGENTS.md first; work directly on branch new-ai-system —
this task FIXES the current uncommitted working tree before it gets committed):

Open docs/ARCHITECTURE_AUDIT_2026-07.md and find the section
"Addendum — 2026-07-09 Working-Tree Review & Worker Handoff", subsection
"B. Defects found in the working tree". Implement WT-1 through WT-6 and WT-8
exactly as specified there (each block gives file, line, defect, exact fix, and
acceptance). WT-7 is optional — attempt it only if everything else is green.
Apply the WT-9 minor notes items 1–3.

Summary of the blocks (the audit doc text is authoritative):
  WT-1  add `get container() { return this.parent; }` to Myte — without it every
        myte-side relationship read/write is a silent no-op
  WT-2  NpcMapObject.aggroTarget / AmbientCreatureMapObject.restingTarget getters:
        fall back to the private field ONLY when container.relationships is absent
  WT-3  CarryAction.interrupt() must clearCarryRelation(this.myte, this.target)
  WT-4  add { "actionId": "interact_object", "purpose": "toggle" } ai.affordances
        to DOOR and GATE in data/map-objects/types.json
  WT-5  NpcMapObject._detectTargets: pass excludeDragging: false (parity)
  WT-6  shadow styles: reference-compare renderState.shadow in
        MapRenderer.applyShadowState (skip if obj._appliedShadowState === state);
        delete MapObject.applyShadowVisual and route its call sites through
        this.parent?.renderer?.applyShadowState?.(this)
  WT-8  pathfinder timeoutMs 500 → options.searchTimeoutMs default 50

Then: node --check every touched file; node scripts/validate-content-data.js;
run the T3 console verification block at the bottom of this file in the browser;
run docs/SMOKE_CHECKLIST.md. Report all results verbatim, including the
relationship checks: pick up an item and confirm
c.relationships.get('carrying', c.activeMyte) returns it and __invariants() is [];
carry a myte, drag the carrier to interrupt, confirm no dangling 'carrying' pair.
```

---

## D6 (= audit T17) — Stats bug-fixes + retune — **GPT-5.6** — after D5

```
In the Neko codebase (read AGENTS.md; branch task/t17-stats off new-ai-system):

Open docs/ARCHITECTURE_AUDIT_2026-07.md, section
"Addendum — 2026-07-09 Stats System Audit". Implement the work package
"T17 — Stats retune work package" exactly:

  Step 0: fix ST-1 (satietyDecayRate missing rateScale in MyteStats.js:443),
          ST-2 (canonicalize hunger→satiety across actions.json, types.json,
          BaseActions.buildActionResult, MyteStats.normalizeStatEffects — delete
          the aliases; extend validate-content-data.js to reject legacy keys),
          ST-3 (homeSlotConfidenceBoostRate 0.00055 → 0.0000055).
  Step 1: apply the retune table to SiteConfig.stats and update the load-bearing
          rate comments at SiteConfig.js:14-57 to match the new math.
  Step 2: onHealthDepleted() hook (fires once on the 0-crossing, re-arms above
          health 20) — faint expression, then myte.queue.clear() +
          myte.setMode(MOVE_TYPES.GOHOME) (the GOHOME branch in
          MyteMovementController.update already paths home and docks via
          myte.stop() on arrival); apply a 'recovering' context buff
          (data/metadata/buffs.json, existing context-buff pattern; ~0.7 speed,
          ~5 sim-min) and block re-deploy while it is active (toast on attempt).
          Full spec is in the audit doc's T17 Step 2.
  Step 3: extend scripts/simulate-stats.js into an assertion harness with the
          "deployed + AI care model" scenario; the assertions listed in the audit
          section are the acceptance spec — tune constants until they pass, and
          report any constant you had to move from the proposed value.
  Step 4: 30-minute browser observation per the audit section; report mood
          variety and bubble frequency.

The proposed constants are starting points; the Step-3 sim assertions are the
authoritative spec. Never edit generated files; SCSS only via source files.
Finish with docs/SMOKE_CHECKLIST.md and report results.
```

---

## D7 (= T5/T7 completion) — after D5 verified in browser

Follow "C. Updated work queue" items 4–5 in the 2026-07-09 addendum: `following` relation via FollowObjectAction lifecycle; myte-side social `getAiAffordances`; capability broad-phase in MyteAI candidate builders. Write the dispatch block when D5's browser verification is reported clean.

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
