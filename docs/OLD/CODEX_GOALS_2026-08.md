# Task Dispatch — August 2026 Core Audit

Paste-ready blocks from the 2026-08-11 core audit (session on `wall-system`). Fable already landed the audit's direct fixes in this same pass — **do not redo them**:

- Cutaway polling consolidated: `WallBuilder.tick()` now owns the throttled poll (room commit + occlusion signature share one `cutawayEvaluateThrottleMs` window), the cursor subject is memoized per sim-tick (`getCursorCutawaySubject` caches, `resolveCursorCutawaySubject` computes), and `GameMap.update` no longer calls `updateActiveRoom` directly.
- `SiteConfig.wallSystem.defaultOpeningHeightPx` replaces the duplicated `64/128` literals via `WallBuilder.getDefaultOpeningHeight()`.
- `WallBuilder.rebuild()` calls `rebindFixtureObjects()` so fixtures re-anchor onto the freshly created `WallFaceSurface` instances instead of staying attached to the previous build's surfaces.

Also out of scope here: wall art pipeline phases D1–D4 (live in `WALL_IMPROVEMENT_PLAN_2026-08.md`).

## Reconciled implementation status — 2026-08-11

| Goal | Status | Evidence / next action |
|---|---|---|
| G1 Event registry | **Done** | `js/Engine/Events.js` is present and event call sites use the registry. |
| G2 `dispose()` lifecycle | **Done** | No `destroy()` method calls remain outside the generated bundle. |
| G3 wall mask/bridge cleanup | **Done** | Named mask predicates and the shared opening bridge analysis are present. |
| G4 surface customization | **Done** | Shared registry plumbing, the `SurfaceCustomizer` facade, preview/rollback, wall scopes, and the toolbar palette are implemented and browser-verified. |
| G5 wall/floor persistence | **Done** | Wall state v7 stores authored-baseline `cellDeltas`; changed room floors restore after map transitions; v6 compatibility passed. |
| G6 room authoring cleanup | **Done** | House and DoorTest author room volumes, the zone-to-room fallback is gone, and interior-room validation is present. |
| Lighting F-L1–F-L3 | **Done** | Interior gloom, window daylight/spill, map clipping, presentation feathering, and world-X sun offset are implemented and browser-verified. |
| G7 background blob URLs | **Done** | Baked backgrounds and wall overlays use tracked PNG blob URLs; retired-map URLs are revoked after decode. |
| G8 lighting follow-ups | **Done** | Multi-level dither, persisted Smooth/Dithered option, and wall-shaped hard room regions are implemented and browser-verified. |
| G9 enclosure detection | **Done** | Runtime wall flood-fill rooms now feed regions, lighting, floors, topology, membership, and cutaway; browser acceptance passed. |
| Build-mode UI | **Done** | Axis drag, Shift-rectangle shells, add/remove ghosts, persistence, enclosure refresh, and node-budget rollback/toast are browser-verified. |

All implementation goals in this dispatch are complete. Remaining work is outside this phase: the deferred `editor/` audit listed in the companion plan and optional hands-on visual/feel tuning.

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

> **Status 2026-08-11: complete.** Browser acceptance covered exact preview rollback, committed wall/floor changes, event emission, persistence capture, toolbar entry/exit, and palette rendering with zero console errors.

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

> **Status 2026-08-11: complete.** House transition acceptance preserved a changed floor, an added wall, and an authored-wall removal; wall snapshot v7 deltas and v6 compatibility both passed.

Design: `CUSTOMIZE_AND_LIGHTING_PLAN_2026-08.md` §1.2 item 3. Two gaps in `js/Map/WorldState.js` + `WallBuilder.serializeState`:

1. **Floors are not persisted.** `captureMap` gains `floors`: `{ [roomId]: finishId }` for every room region whose `properties.floorFinishId` differs from its authored value (keep the authored value: snapshot it on `MapEnvironmentManager.registerRoomRegions` as `properties.authoredFloorFinishId`). `restoreMap` applies them through `floorBuilder.setRoomFinish` after the floor builder exists — note ordering: WorldState restore currently runs before/after floors depending on the transition path; verify in `MapTransitionManager` and restore floors from wherever `floor:ready` (`EVENTS.FLOOR_READY`) fires if needed.
2. **Wall geometry edits are not persisted.** `serializeState` → version 7: add `cellDeltas`: cells added vs the authored TMX baseline (`{x, y, constructionId, finishId, heightCells, connectGroup}`) and removed authored cells (`{x, y, removed: true}`). Baseline = `wallData.cells` as loaded (snapshot in `initialize()` before any mutation). `restoreState` v7 applies deltas via the `baseCells` map before `reindexOpenings/rebuild` (NOT via repeated `setWallCell`, which would rebuild N times). v6 saves must still restore (no deltas — fine).

**Constraints.** Deltas, never absolute cell lists — edits to the authored TMX must keep winning for untouched cells. Bump only WallBuilder's version number; WorldState has its own `VERSION`, leave it (additive keys don't break v1).

**Acceptance.** Headless: paint a floor finish + `setWallCell` one new wall cell + remove one authored cell → `captureMap` → reload the map (transition away and back) → floor finish, added cell, and removal all survive; a v6 wall snapshot (fixture/opening state) still restores; authored maps without saves boot identically to today.

---

## G6 — Room authoring cleanup (kill the zone→room shim)

> **Status 2026-08-11: complete.** House retains the same four room IDs/bounds, DoorTest authors both rooms, RegionTest remains authored, the fallback is removed, and content validation passes.

Design: `CUSTOMIZE_AND_LIGHTING_PLAN_2026-08.md` §1.1. `MapEnvironmentManager.buildRoomVolumes()` fabricates rooms from room-like zones (`['rest','play','food','social']`) on interior maps that author no rooms. Rooms are regions now; zones are behavior volumes — the shim is the last place the two concepts blur.

1. Audit which interior maps actually author `environment.rooms` in their TMX (House, RegionTest, any others under `data/maps/`). For any interior map still relying on the shim, author real room objects in the TMX (same bounds the zones had; copy the zone rect, name it, set lighting props as the shim's defaults produced them).
2. Delete the shim branch (the `roomLikeZones` fallback) so `buildRoomVolumes` returns authored rooms or nothing.
3. `npm`-less validation: extend `scripts/validate-content-data.js` with a check that any interior-location map (`environment.location` interior/inside/house) authors at least one room, warning (not failing) otherwise.

**Acceptance.** House lighting/rooms behave identically before/after (same room count, same bounds — dump `regionManager.all('room')` both sides and diff); validator passes; no references to zone types inside MapEnvironmentManager remain.

---

> **Status 2026-08-11 (second pass):** G1–G3 landed by Codex and verified by Fable. G4/G5 independent and parallel; G6 after either.
>
> **Status 2026-08-11 (third pass):** Lighting v2 F-L1–F-L3 shipped by Fable; owner follow-ups dispatched as **G8** (dither option + room-region geometry). **G9** (enclosure flood-fill) reassigned from Fable to Codex by owner direction — after G9 lands, build mode (`CUSTOMIZE_AND_LIGHTING_PLAN_2026-08.md` §3.2, needs G5 too) is also open for dispatch. Suggested order: G8a → G8b → G9 (G8b and G9 both touch the room render loops; do not run them in parallel).
>
> **Headless harness notes (all goals):** app URL is `index.html` (`index.php` is gone); Playwright works but must pass `executablePath` to `%LOCALAPPDATA%/ms-playwright/chromium-1228/chrome-win64/chrome.exe`; boot wait = `MyteCore.instance` container with `mytes.length > 0 && gameMap.initialized`; a cold profile needs `myte.startWithOptions({})` before `setActiveMyte` accepts it; drive the clock with `GameTime.instance.setTime(hour, minute)` then clear `environmentManager._lightingSignature` and `renderLighting(true)`; run `node scripts/...` directly (`npm run` wrappers fail in sandboxes).

## G7 — Map background via blob URL (memory)

> **Status 2026-08-11: complete.** Five House/Outside transitions created 12 map PNG blob URLs, revoked the 10 belonging to retired maps exactly once, and left only the active map's two URLs live. Backgrounds and hidden-mode wall overlays remained visible with zero console errors.

**Problem.** `TileMapLoader.createMapBackgroundUrl` and `createWallTileOverlayUrl` return `canvas.toDataURL('image/png')` — a base64 string of the entire baked map. On a large map that is a multi-megabyte string retained twice (the JS string and the CSS `background-image` value), re-created on every map transition.

**Desired.** Return blob URLs: `await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))` → `URL.createObjectURL(blob)`. Track every URL created for the current map (a small set on GameMap or the loader) and `URL.revokeObjectURL` each in `GameMap.dispose()` — after the layers that reference them are cleared, and never before `waitForRevealReady` has finished decoding (the background `Image` in `setBackground` loads the same URL; revoking early would abort it). The wall tile overlay div in GameMap uses the second URL — same lifecycle.

**Acceptance.** Headless: transition House → Outside → House; both maps render their baked background and the wall overlay still appears in the `hidden` wall mode; no console errors; `performance.memory` (or a heap snapshot) shows no accumulation of detached multi-MB strings across five transitions (spot-check is fine — the structural guarantee is the revoke call in dispose).

---

## G8 — Lighting v2 follow-ups: dither option + room-region geometry

> **Status 2026-08-11: complete.** G8a and G8b landed together. Browser verification on House covered Dithered/Smooth live switching and reload persistence, 4-level night alpha quantization, daytime gloom dithering, hard room-region fills with wall paths, walls-down fallback, HTTP 200, and zero console/page errors. Content and time-source validation passed.

Owner-reported defects in the freshly shipped lighting v2 (`js/Map/MapEnvironmentManager.js`; design context in `CUSTOMIZE_AND_LIGHTING_PLAN_2026-08.md` Part 2). Read `renderLighting`, `deriveRoomLightingState`, `drawDitherPass`, `drawFeatheredRectColor/Alpha`, and `WallBuilder.getCutYOver` before writing anything.

### G8a — Dithering applies to all darkness, and becomes a player option

**Problem.** `drawDitherPass` binarizes the darkness canvas against ONE reference alpha — `fillAlpha = darknessOpacity × 255`, which is the *night* darkness. At noon `darknessOpacity ≈ 0` so the pass skips (`fillAlpha < 8`) and the interior daylight gloom renders smooth; at dusk the gloom's mid-range alphas fall below `clearMax` and get force-cleared. The owner wants the dithered look on interior gloom too — and wants smooth vs dithered to be a player choice.

**Fix, part 1 — N-level ordered dither.** Replace the binary classify (clearMax/solidMin/normalize) with multi-level ordered dithering using the same 4×4 Bayer matrix: quantize each pixel's alpha to `levels` steps (config `lighting.dither.levels`, default 4, add to both presets in `data/metadata/environment-presets.json`):

```js
const q = (a / 255) * levels;             // a = source alpha 0..255
const base = Math.floor(q);
const frac = q - base;
const stepped = frac * 255 > B[row | col] ? base + 1 : base;
px[i + 3] = Math.round((stepped / levels) * 255);
```

Drop the `fillAlpha` parameter entirely — the pass no longer needs a reference; it dithers whatever alpha is present (night darkness, gloom, and their dusk blend all quantize consistently). Keep the `pixelSize`/zoom scaling and the `a === 0` early skip. Call it whenever `dither.enabled` and the player option (below) allow — no longer gated on `darknessOpacity`.

**Fix, part 2 — player option.** Settings > Graphics gets "Lighting style: Dithered / Smooth". Follow the existing lighting-toggle pattern exactly: a `settings.graphics.lightingDither` value + `isLightingDitherEnabled()` on `SettingsPanel` (`js/UI/Panels/SettingsPanel.js` — see `isLightingEnabled` at ~line 270), a `getLightingDitherEnabledSetting()` on GameMap delegating to the panel with `user.preferences.lightingDitherEnabled` fallback (add to `USER_DEFAULT_PREFERENCES` in `js/User/User.js`, default `true`), consumed in `renderLighting` where the dither pass is invoked. The panel change handler must call `environmentManager.refreshDisplaySettings()` (it already clears signatures and re-renders). Include the flag in `buildLightingSignature`.

**Test gotcha.** In headless probes, flip `container.ui.settingsPanel.settings.graphics.*`, NOT `user.preferences.*` — the panel value wins while the panel exists.

### G8b — Room light regions follow wall geometry

**Problem (owner report).** With walls up during the day: (1) a room's gloom rect paints over the wall art of the room in front of it — the wall between rooms A (north) and B (south) rises above B's floor into A's screen rect, so A's gloom darkens B's back wall; (2) inside a room the gloom is feathered *inward* (`drawFeatheredRectColor`), so room edges read light and the center dark — backwards.

**Model.** Every camera-facing wall face is lit by the room it opens into — the room to its **south**. So a room R's light region is:

- R's floor rect (its bounds), **plus**
- the face bands of horizontal wall pieces along R's **north** boundary — R's back wall, rising above R's top edge, **minus**
- the face bands of horizontal wall pieces along R's **south** boundary — R's front wall's visible face belongs to whatever is south of it (the next room paints it via its own "plus"; exterior means nobody paints it).

A face band for piece P over x-span `[sx0, sx1]` is the world rect from `wallBuilder.getCutYOver(P, sx0, sx1)` (top — this already accounts for cutaway stubs, walls-down, hidden) down to `P.baseline`. Find boundary pieces by iterating `wallBuilder.pieces`: horizontal pieces (`p.cells.every(WallBuilder.isHorizontalMask-ish)` — use the piece's cell masks) whose `baseline` is within `cellSize` of the room bound's y and whose x-range overlaps the room's `[x0, x1]`; clamp each band's x-span to the overlap.

**Implementation.** One helper, used by all four room passes (night lift, day gloom, room color fill, window glow):

```js
buildRoomLightRegion(room, view) → { path: Path2D|null, bounds: screenRect }
```

Build the Path2D in screen space (`worldToScreenRect` each rect): add the floor rect and the north bands, then add the south bands — and fill/clip with the `'evenodd'` rule, so the south bands (which lie inside the floor rect) become holes while the north bands (disjoint, above it) stay filled. When there is no `wallBuilder` or no adjacent pieces, return `path: null` and let callers fall back to today's plain rect.

Callers: replace the four `drawFeatheredRect*` room calls in `renderLighting` with: `ctx.save(); ctx.clip(path, 'evenodd');` then fill the region's bounding rect with the flat color/alpha; `ctx.restore()`. **Feather rules change:** in wall presentations `up`/`cutaway`, draw hard-edged (feather 0) — wall art and the dither option carry the transition; in `down`/`hidden`, keep the current soft feathered-rect path (feather × `openWallFeatherScale`, no bands — they'd be stubs anyway). The inward-feather "bright edges" symptom disappears with the hard fill.

`drawFeatheredRectAlpha` (night lift) uses destination-out — clip+`clearRect`-equivalent: inside the clip, fill the bbox with `destination-out` at the lift alpha, same as today's interior fill but region-shaped.

**Signature.** The region depends on wall cut states, so add a cheap wall-state hash to `buildLightingSignature`: `this.gameMap?.wallBuilder?.pieces?.map(p => p.renderPlan?.mode ?? '').join('') ?? ''` plus the presentation (already added as `wallMode`). The 150 ms idle refresh picks up cutaway changes from there.

**Out of scope.** Vertical (east/west) wall faces — side walls keep today's behavior; note any visible seams in the report rather than fixing them.

**Acceptance (headless, House, `GameTime.instance.setTime(12,0)`).** (1) Sample the darkness canvas: a pixel on the face band of the Kitchen's back wall carries the Kitchen's gloom alpha, not the room behind's; a pixel just above a front-wall baseline inside the Bedroom is NOT gloom-painted when that band belongs to the space south of it. (2) Center-vs-edge: floor pixels at a room's center and 4 px inside its boundary have equal alpha (hard fill). (3) Walls-down mode still renders soft feathered rooms, light values unchanged. (4) Dither on/off toggles via the new setting; night look with `levels: 4` is not visibly different from before at `darknessOpacity 0.75` (screenshot compare). (5) Zero console errors; `node scripts/validate-content-data.js` passes.

---

## G9 — Enclosure flood-fill: player-built walls make rooms (reassigned from Fable)

> **Status 2026-08-11: complete.** `RoomEnclosureDetector` debounces wall events, flood-fills exterior/open cells, registers stable tilemask room regions, preserves authored rooms, and refreshes every downstream room consumer. Lighting now reads the shared region store rather than its authored-only staging list. Headless House acceptance passed with zero console/page errors.

The load-bearing piece of build mode (`CUSTOMIZE_AND_LIGHTING_PLAN_2026-08.md` §3.2 item 3), reassigned to Codex by owner direction. Everything downstream already reacts to room regions: lighting gloom/lift, floors, cutaway room topology, door annotations, window daylight.

**New file** `js/Map/Regions/RoomEnclosureDetector.js` (add to `scripts/script-manifest.json` after RegionManager), owned by GameMap (construct after wallBuilder in `applyToGameMap`, dispose in `GameMap.dispose`).

**Trigger.** `EVENTS.WALL_READY` and `EVENTS.WALL_GEOMETRY_CHANGED` for this map (match the subscription pattern in `MapEnvironmentManager.subscribeToWallEvents`). Debounce one macrotask (`queueMicrotask` is too soon; a 0 ms `setTimeout` collapsing repeated geometry events is right) so a drag painting N cells runs one detection.

**Algorithm** (grid-space, `gameMap.gridSystem` dimensions):
1. Wall set = `wallBuilder.baseCells` keys. Opening cells (`wallBuilder.openingByCell`) count as wall — a doorway must not leak "outside" into a room.
2. Flood-fill 4-connected from every border cell of the grid that is not a wall → mark exterior.
3. Remaining non-wall, non-exterior cells → connected components. Discard components smaller than `SiteConfig.rooms.minAreaCells` (add `SiteConfig.rooms = Object.freeze({ autoDetect: true, minAreaCells: 4 })`).
4. For each component: if it intersects ANY authored room region (layer `'room'`, regions whose `source` came from `MapEnvironmentManager`) — skip it entirely; authored geometry stays authoritative. Otherwise register a `SpatialRegion` with `layer: 'room'`, `id: 'room_auto_' + <index by top-left cell order>` (stable across re-detections for identical geometry), `shape: { kind: 'tilemask', cells: [...'x,y' keys], cellSize }`, `properties: { displayName: 'Room', indoor: true, autoDetected: true, lighting: <roomDefaults from environmentManager.getRoomDefaults()> }`.
5. Before registering, remove only regions with `properties.autoDetected === true` — never authored ones.
6. Afterwards, in this order: `gameMap.floorBuilder?.build()`, `gameMap.buildDoorRoomTopology()`, `environmentManager.rebuildWindowLighting()`, and clear `environmentManager._lightingSignature`. WallBuilder's cutaway reads rooms live — no call needed.

**Gotcha.** `MapEnvironmentManager.deriveRoomLightingState` iterates `this.roomVolumes` (its private list), not the region store — auto rooms won't light until that reads regions. Part of this goal: change `deriveRoomLightingState` and the three render loops to iterate `regionManager.all('room')` (each region already carries `properties.lighting`; keep a small adapter so `entry.room.bounds`/`entry.room.lighting` keep their shape). `registerRoomRegions` already publishes authored volumes there, so this unifies the two sources — `roomVolumes` stays only for building/registering.

**Acceptance (headless, House).** (1) `setWallCell` a 4×4 rectangle of walls in open floor → one new `room_auto_*` region whose tilemask is exactly the 2×2 interior; its floor stays unpainted (no `floorFinishId`), it acquires gloom at noon, and its walls cut away when a myte stands in it. (The earlier 4×3/2×1 fixture contradicted `minAreaCells: 4`.) (2) Remove one wall cell → region disappears on the next detection; lighting reverts. (3) Authored rooms (`zone_kitchen` etc.) untouched through both. (4) Map transition House→Outside→House leaves no duplicate regions. (5) Zero console errors.

---

## Backlog (not dispatched — needs owner/Fable decision first)

- **WallBuilder split.** 1,950 lines spanning five concerns (geometry/masks, cutaway state machine, opening placement, fixture placement, persistence). Cohesion is real (everything shares `cells`/`pieces`), so a split needs designed seams — candidate: extract opening+fixture placement/binding into a `WallMountController` that receives the builder. Do not attempt without a written boundary spec.
- **`getResolvedCutStates` chain recursion.** Re-resolves whole horizontal chains per rendered piece (with `getNeighborCutState` recursing into neighbor pieces). Fine at 99 pieces/House; profile before touching, cache per tick only if a bigger map shows cost.
