# Task Dispatch — August 2026 Core Audit

Paste-ready blocks from the 2026-08-11 core audit (session on `wall-system`). Fable already landed the audit's direct fixes in this same pass — **do not redo them**:

- Cutaway polling consolidated: `WallBuilder.tick()` now owns the throttled poll (room commit + occlusion signature share one `cutawayEvaluateThrottleMs` window), the cursor subject is memoized per sim-tick (`getCursorCutawaySubject` caches, `resolveCursorCutawaySubject` computes), and `GameMap.update` no longer calls `updateActiveRoom` directly.
- `SiteConfig.wallSystem.defaultOpeningHeightPx` replaces the duplicated `64/128` literals via `WallBuilder.getDefaultOpeningHeight()`.
- `WallBuilder.rebuild()` calls `rebindFixtureObjects()` so fixtures re-anchor onto the freshly created `WallFaceSurface` instances instead of staying attached to the previous build's surfaces.

Also out of scope here: wall art pipeline phases D1–D4 (live in `WALL_IMPROVEMENT_PLAN_2026-08.md`).

Rules for every task: read `AGENTS.md` first; one branch off `wall-system` per task; no behavior changes unless the goal says so; finish with `node scripts/build-manifest.js`, `node scripts/validate-content-data.js`, `node scripts/check-time-sources.js`, and a headless boot check (app must boot with zero console errors); report raw results.

---

## G1 — Event-name registry (constants over bare strings)

**Problem.** ~40 distinct event names flow through `EventManager` as bare string literals, each typed twice or more (`emit('wall:geometry_changed', …)` + matching `on(…)`). A typo on either side fails silently — the handler just never fires. Current namespaces: `myte:*`, `wall:*`, `floor:*`, `plant:*`, `chest:*`, `user:*`, `world:*`, `container:*`, plus bare legacy names (`collision`, `travel_started`, `travel_progress`, `travel_arrived`, `user_activity_changed`).

**Desired architecture.** One frozen constant registry, loaded early in the script manifest (with the other Engine files):

```js
// js/Engine/Events.js
const EVENTS = Object.freeze({
    MYTE_STARTED: 'myte:started',
    MYTE_STOPPED: 'myte:stopped',
    WALL_READY: 'wall:ready',
    WALL_GEOMETRY_CHANGED: 'wall:geometry_changed',
    // … every name currently emitted or subscribed anywhere in js/
});
```

**Steps.**
1. Enumerate every event name: `grep -rhoE "(emit|on|once|off|addHandler|removeHandler)\('([^']+)'" js --include='*.js'` (exclude `bundle.js`, `vendor/`). Include names only ever subscribed (dead subscriptions — list them in the report rather than deleting).
2. Create `js/Engine/Events.js` with the full registry; add it to `scripts/script-manifest.json` before its first consumer, then `node scripts/build-manifest.js`.
3. Replace every string literal at emit/subscribe sites with `EVENTS.*`. Do **not** rename any event's string value — persistence and the editor may listen by name.
4. While in `EventManager`, wrap the per-handler call in `emit()` in try/catch (`console.error` the failure, continue the loop) so one throwing listener can no longer starve the rest of the dispatch. This is the only intended behavior change.

**Acceptance.** Zero quoted event-name literals remain at emit/subscribe call sites (`grep -rE "emit\('|\.on\('" js --include='*.js'` minus bundle/vendor is empty, DOM `addEventListener` excluded); app boots clean; walking a myte behind a House front wall still lowers it; report lists any orphan subscriptions found.

---

## G2 — Lifecycle naming: `destroy()` → `dispose()`

**Problem.** Two teardown conventions coexist. `dispose()` is the dominant one (Core, ContainerManager, GameMap, WallBuilder, SoundManager, …); nine classes use `destroy()` instead: `ParticleEmitter`, `ClickComponent`, `DragComponent`, `InputComponent`, `InputSystem`, `RubbingComponent`, `FloorBuilder`, `MyteDialogue`, `MyteStats`. Call sites must remember which is which (`GameMap.dispose()` calls `this.floorBuilder.destroy()` two lines from `this.wallBuilder.dispose()`).

**Desired.** Every teardown method is `dispose()`. Pure mechanical rename — method definition plus every call site (grep each class name's usages; `InputSystem.instance?.destroy?.()` in Core.js included). No compatibility aliases — pre-release, internal API.

**Acceptance.** `grep -rn "\bdestroy(" js --include='*.js'` (minus bundle/vendor) returns nothing; boot clean; map transition (House → Outside → House) leaves no console errors; particle effects still stop on map change.

---

## G3 — WallBuilder mask predicates + opening-bridge unification

**Problem A.** The 4-bit neighbor mask is tested with raw literals across `WallBuilder`: `(mask & 10) !== 0`, `(mask & 5) !== 0`, `mask !== 10`, `[2, 8].includes(mask)`. The bit meanings (1=N, 2=E, 4=S, 8=W) are only discoverable from `WallBuilder.DIRECTIONS`. A helper (`isHorizontalOnlyCell`) already exists but is bypassed in at least `isCutawayBoundaryCell`, `getRawCutStates`, `getRenderPlan`, `isOpeningCellCompatible`, `getFixtureFaceForPoint`, `getLightBlockers`, `resolveHorizontalBoundary`, `reserveTransitionBesideFullCap`.

**Desired A.** Named mask constants and predicates on `WallBuilder`, used everywhere:

```js
static MASK_HORIZONTAL = 2 | 8;   // E|W arms
static MASK_VERTICAL = 1 | 4;     // N|S arms
static MASK_STRAIGHT_H = 10;      // exactly E+W
static isHorizontalMask(mask) / isVerticalMask(mask) / isStraightHorizontal(mask)
static isEndCapMask(mask)         // replaces [2, 8].includes(mask)
```

Keep `isHorizontalOnlyCell(cell)` delegating to the mask predicate. Semantics must be bit-for-bit identical — this is a readability refactor, not a behavior change.

**Problem B.** Opening-gap bridging logic exists twice: `bridgeOpeningGap()` (mutates `this.cells`) and `canBridgeOpeningCells()` (pure check) each independently compute ordered cells, the before/after neighbor keys, and the connectGroup comparison.

**Desired B.** One private helper returning `{ ordered, before, after, bridgeable }` that both consume. Note the two differ on purpose in one spot: `bridgeOpeningGap` also accepts an `existing` cell inside the span as a template; preserve that.

**Acceptance.** No raw `& 10` / `& 5` / `!== 10` / `[2, 8]` mask literals remain in `WallBuilder.js` outside the constant definitions; boot clean on House; cutaway still works (walk behind a front wall → cells lower; walk away → they raise after ~300 ms); place + move a WINDOW and a DOOR via drag preview — placement validity and the raised-wall preview behave as before; `wall-materials` validation passes.

---

## G4 — Surface customization: shared registry base + Customize paint mode

Design of record: `CUSTOMIZE_AND_LIGHTING_PLAN_2026-08.md` §1.2, §3.1. Read it first.

**G4a — `SurfaceMaterialRegistry` base.** `js/Map/Walls/WallMaterialRegistry.js` and `js/Map/Floors/FloorMaterialRegistry.js` duplicate their plumbing: JSON load + schema check, image fetch/decode, template-finish resolution through `FinishPalette`, recolored-canvas caching. Extract a base class into `js/Map/Surfaces/SurfaceMaterialRegistry.js` (same folder as FinishPalette) holding the shared load/decode/template/cache logic; each registry keeps its own schema validation and sheet-geometry logic. No data-file changes, no behavior changes — walls and floors must render byte-identically (compare a House screenshot before/after).

**G4b — `SurfaceCustomizer` + Customize mode UI.**
1. New `js/Map/Surfaces/SurfaceCustomizer.js`: facade owned by GameMap (constructed when either builder exists) exposing `listFinishes(surface)`, `preview(request)`, `revertPreview()`, `apply(request)` where request is `{ surface: 'wall', face, cells }` or `{ surface: 'floor', roomId }` plus `finishId`. Wall path calls `wallBuilder.setFaceFinish`, floor path `floorBuilder.setRoomFinish`. Preview = apply + remembered undo record; revert restores the prior finish (for walls: remove the pushed faceOverride and rebuild; for floors: re-apply prior finishId). Emit `EVENTS.SURFACE_FINISH_CHANGED` (add to Events.js) on committed apply only.
2. Toolbar Customize mode (follow the existing tool-mode pattern; check CursorManager and the toolbar toggles in `js/UI/`): entering sets `body.customize-mode`; clicking a wall piece canvas or a floor surface opens a sidebar palette panel (reuse ModalWindow/sidebar panel components, Win-98 styling per AGENTS.md — raised borders, `--surface-*` tokens, no gradients). Swatch chips: recolor one construction cell / one floor tile per finish via FinishPalette, cache them. Hover a swatch ≥150 ms → `preview()`; pointer leaves palette → `revertPreview()`; click → `apply()`. Escape or toolbar exits the mode and reverts any live preview.
3. Wall scope toggle: "this stretch" (the clicked piece's cells) vs "whole room" (all wall cells whose north/south face borders the clicked face's room — resolve via each cell's `faces`, already computed on pieces).

**Constraints.** No changes to WallBuilder cutaway/render internals; SCSS in source files + compile; new files added to `scripts/script-manifest.json` by hand + `node scripts/build-manifest.js`. Persistence is G5 — do not invent your own saving here; `apply()` just calls the builders.

**Acceptance.** Headless: enter mode, apply a wall finish to one run and a floor finish to one room via `SurfaceCustomizer.apply` — art changes, zero console errors, cutaway still works, fixtures still hang correctly (rebuild rebinds them). Manual-style probe: preview then revert leaves `faceOverrides`/room properties exactly as before (deep-equal). Boot clean.

---

## G5 — Wall/floor persistence completion (WorldState)

Design: `CUSTOMIZE_AND_LIGHTING_PLAN_2026-08.md` §1.2 item 3. Two gaps in `js/Map/WorldState.js` + `WallBuilder.serializeState`:

1. **Floors are not persisted.** `captureMap` gains `floors`: `{ [roomId]: finishId }` for every room region whose `properties.floorFinishId` differs from its authored value (keep the authored value: snapshot it on `MapEnvironmentManager.registerRoomRegions` as `properties.authoredFloorFinishId`). `restoreMap` applies them through `floorBuilder.setRoomFinish` after the floor builder exists — note ordering: WorldState restore currently runs before/after floors depending on the transition path; verify in `MapTransitionManager` and restore floors from wherever `floor:ready` (`EVENTS.FLOOR_READY`) fires if needed.
2. **Wall geometry edits are not persisted.** `serializeState` → version 7: add `cellDeltas`: cells added vs the authored TMX baseline (`{x, y, constructionId, finishId, heightCells, connectGroup}`) and removed authored cells (`{x, y, removed: true}`). Baseline = `wallData.cells` as loaded (snapshot in `initialize()` before any mutation). `restoreState` v7 applies deltas via the `baseCells` map before `reindexOpenings/rebuild` (NOT via repeated `setWallCell`, which would rebuild N times). v6 saves must still restore (no deltas — fine).

**Constraints.** Deltas, never absolute cell lists — edits to the authored TMX must keep winning for untouched cells. Bump only WallBuilder's version number; WorldState has its own `VERSION`, leave it (additive keys don't break v1).

**Acceptance.** Headless: paint a floor finish + `setWallCell` one new wall cell + remove one authored cell → `captureMap` → reload the map (transition away and back) → floor finish, added cell, and removal all survive; a v6 wall snapshot (fixture/opening state) still restores; authored maps without saves boot identically to today.

---

## G6 — Room authoring cleanup (kill the zone→room shim)

Design: `CUSTOMIZE_AND_LIGHTING_PLAN_2026-08.md` §1.1. `MapEnvironmentManager.buildRoomVolumes()` fabricates rooms from room-like zones (`['rest','play','food','social']`) on interior maps that author no rooms. Rooms are regions now; zones are behavior volumes — the shim is the last place the two concepts blur.

1. Audit which interior maps actually author `environment.rooms` in their TMX (House, RegionTest, any others under `data/maps/`). For any interior map still relying on the shim, author real room objects in the TMX (same bounds the zones had; copy the zone rect, name it, set lighting props as the shim's defaults produced them).
2. Delete the shim branch (the `roomLikeZones` fallback) so `buildRoomVolumes` returns authored rooms or nothing.
3. `npm`-less validation: extend `scripts/validate-content-data.js` with a check that any interior-location map (`environment.location` interior/inside/house) authors at least one room, warning (not failing) otherwise.

**Acceptance.** House lighting/rooms behave identically before/after (same room count, same bounds — dump `regionManager.all('room')` both sides and diff); validator passes; no references to zone types inside MapEnvironmentManager remain.

---

> **Status 2026-08-11 (second pass):** G1–G3 landed by Codex and verified by Fable (acceptance greps clean, headless boot + cutaway + fixture-rebind regression green, zero console errors). G4–G6 above are the next dispatch set; G4 and G5 are independent and can run in parallel, G6 after either. Reserved for Fable (do not attempt): lighting v2 core F-L1..F-L3 and build-mode enclosure detection — see `CUSTOMIZE_AND_LIGHTING_PLAN_2026-08.md`.

## G7 — Map background via blob URL (memory)

**Problem.** `TileMapLoader.createMapBackgroundUrl` and `createWallTileOverlayUrl` return `canvas.toDataURL('image/png')` — a base64 string of the entire baked map. On a large map that is a multi-megabyte string retained twice (the JS string and the CSS `background-image` value), re-created on every map transition.

**Desired.** Return blob URLs: `await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))` → `URL.createObjectURL(blob)`. Track every URL created for the current map (a small set on GameMap or the loader) and `URL.revokeObjectURL` each in `GameMap.dispose()` — after the layers that reference them are cleared, and never before `waitForRevealReady` has finished decoding (the background `Image` in `setBackground` loads the same URL; revoking early would abort it). The wall tile overlay div in GameMap uses the second URL — same lifecycle.

**Acceptance.** Headless: transition House → Outside → House; both maps render their baked background and the wall overlay still appears in the `hidden` wall mode; no console errors; `performance.memory` (or a heap snapshot) shows no accumulation of detached multi-MB strings across five transitions (spot-check is fine — the structural guarantee is the revoke call in dispose).

---

## Backlog (not dispatched — needs owner/Fable decision first)

- **WallBuilder split.** 1,950 lines spanning five concerns (geometry/masks, cutaway state machine, opening placement, fixture placement, persistence). Cohesion is real (everything shares `cells`/`pieces`), so a split needs designed seams — candidate: extract opening+fixture placement/binding into a `WallMountController` that receives the builder. Do not attempt without a written boundary spec.
- **`getResolvedCutStates` chain recursion.** Re-resolves whole horizontal chains per rendered piece (with `getNeighborCutState` recursing into neighbor pieces). Fine at 99 pieces/House; profile before touching, cache per tick only if a bigger map shows cost.
