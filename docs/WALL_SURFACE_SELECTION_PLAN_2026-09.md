# Wall Surface Selection & Run Grouping — September 2026

**Status:** implemented 2026-09-06 (see §9 for what shipped vs. proposed)
**Scope:** how a wall click resolves to a set of paint atoms — Section scope, hover preview, and Select's run/segment escalation. Classification of a single wall half (§4.8/§4.10 of the Build Surface Model plan) is **kept**; this plan changes only how halves are *grouped* into a paintable unit and drawn as an outline.
**Supersedes:** `WallRenderer.getPaintStretchSurfaces` as an independent axis walk; `WallBuilder.mergeRects` merging by geometric touch; the parts of `WallSurfaceRuns` that let a run *rewrite* a half's classification.
**Builds on:** `BUILD_SURFACE_MODEL_REFACTOR_PLAN_2026-09.md` §4.8 (ownership lookup), §4.10 (visible-face policy), §11 (fixtures).
**Keeps:** `WallFaceResolver.classify`, `visibleAtom`, the depth rule for two-room walls, atom storage, all floor ownership.

## 0. How to read this

§1 is the decision. §2 is why the current code produces the reported bugs, case by case. §3 is the model. §4 is the algorithm. §5 is the module map. §6 is fixtures. §7 is verification. §8 is questions for Ryan.

The rule that generated every decision here: **a paint target is "the wall this room can see from where I clicked, as far as it physically runs" — not "the atoms whose camera-visible face happens to name this room".**

## 1. Decision

There is **one** grouping function. Section scope, hover preview and Select's run step all call it. It takes the clicked atom and returns an ordered set of atoms plus the rectangles that outline them.

Grouping is **relative to the clicked room** (or the clicked exterior loop), not to `visibleAtom`. Which face the camera shows when both faces are painted is a rendering concern and stops here being one.

A run **turns corners**. If the clicked room's frontage continues onto a perpendicular wall — a post whose facing block is the same room — the run continues onto it. A run stops only at a real edge: a different room or loop on the near side, a physical gap in the masonry, or (Select only, not paint) a building boundary.

`WallSurfaceRuns` keeps exactly one job: telling a *buried but visible* band half which side of its seam it is on (west half → run west, east half → run east). It no longer walks for "the nearest band that can answer" and never overrides a half that classified cleanly.

## 2. Why the current code fails on complex rooms

All five reported cases trace to two mechanisms.

### 2.1 `getPaintStretchSurfaces` is a second, weaker grouping

[`WallRenderer.getPaintStretchSurfaces`](../js/Map/Walls/WallRenderer.js) does not call `WallFaceResolver.sections`. It re-implements grouping as:

- keep only spans where `entry.roomId === surface.roomId`, where `roomId` is whatever [`getPaintSpans`](../js/Map/Walls/WallRenderer.js) got from `visibleSurface().classification`;
- walk **one axis** (`stepAlongRun`), the axis of the clicked span, following the connectivity mask bit;
- pass *through* any cell with nothing facing this room and keep going.

Consequences:

| Reported case | Mechanism |
|---|---|
| `wall-15-26-24` reads as "two rooms"; three overlay rects that should be one wall | The vertical post at x≈816 is on the other axis. `stepAlongRun` never turns onto it, so it is a different selection `mergeRects` is never handed. |
| `wall-33-30-14`: two abutting horizontal rects (1056+176 = 1232) never merge | Same row, zero gap — `rectsTouch` *would* merge them if they were in one set. They are not, because `visibleAtom`'s depth/area tie-break ([`WallFaceResolver.visibleAtom`](../js/Map/Walls/WallFaceResolver.js), the `northDepth`/`southDepth`/`blocksOf` branch) flips the *visible* face partway along the shared Room1/Room4 wall, so one physical frontage splits into a "faces Room1" span set and a "faces Room4" span set. |
| interior stretch + exterior stretch merge into one box | `getPaintStretchSurfaces` walks through non-facing cells; `mergeRects` then unions any two rects that touch, taking `Math.max` of their z-index and ignoring classification entirely. |

### 2.2 `sections()` groups on the camera-visible atom, and floods across corners

[`WallFaceResolver.sections`](../js/Map/Walls/WallFaceResolver.js) keys each node on `visibleSurface`'s classification and floods along `sectionNeighbours`. Two problems on dense maps:

- **Camera-visible, not click-relative.** On a shared wall the depth rule can make room B's face the visible one for part of room A's frontage. `sections()` then reports that stretch as `room:B`. Correct for "what colour shows"; wrong for "what does clicking room A's wall select".
- **Run-inheritance instability.** `neighbouringRunSurface` / `postSurface` / the terminal-band rule (§4.10) were tuned on the House map — the plan itself records "19 sections where 17 were correct". At a cross (`mask 15`) or T (`mask 11`) — both present in `wall-15-26-24`'s mask list — the inherited answer can differ cell-to-cell, so the flood splits one frontage or unions two rooms into one "whole interior" via the vertical connector between their rows.

## 3. Model

### 3.1 Two questions, told apart

| Question | Answered by | Drives |
|---|---|---|
| What colour does this half **show**? | `visibleSurface` → `visibleAtom` + depth rule + seam rule | rendering, the stored atom a paint writes to |
| What does a **click** here **select**? | `SurfaceRunGrouper` (this plan) | Section scope, hover outline, Select run/segment |

`visibleSurface` is unchanged. `SurfaceRunGrouper` is new and pure.

### 3.2 Near side vs visible side

Every paintable band span has two candidate atoms (`span.candidates`, already `['x,y/south/h','x,y/north/h']`). The **near side** is the face on the side of the wall the camera is on — `south` for a horizontal band, the open side for a post. The click always comes from the near side (you cannot click a face pointing away from the camera).

Grouping classifies by the **near-side look block**: `WallFaceResolver.classify(nearAtom, grid, topology)`. This is the same pure lookup as §4.8, just always on the near atom rather than the depth-rule winner. Result is `room:<id>`, `exterior:<loopId>`, or `buried`.

### 3.3 Run

A run is the connected set of paintable spans reachable from the clicked span by:

1. **Along axis.** Step to the adjacent cell across a set mask bit (`MASK_EAST`/`WEST` for a band, `MASK_NORTH`/`SOUTH` for a post). The stepped-to cell contributes its spans of the same axis whose near-side class equals the start class. A cell with no such span is still passed *through* (the far side of a shared wall) — but only if it is masonry with the axis bit set both ways; a gap ends the run.
2. **Turn corners.** At any cell on the run whose mask has a perpendicular bit, look at the perpendicular span (post ↔ band). If its near-side class equals the run's class, add it and recurse the walk from there on the new axis. This is what makes "paint this room's wall" wrap the room.
3. **Stop** at: a different `room:`/`exterior:` class on the near side, a masonry gap, an opening span (paint runs break at doorways; Select runs do not — see §4.3), or the grid edge.

Exterior runs group by `loopId` so a courtyard wall and the outer shell are never one run (§4.8 line 280 of the model plan).

### 3.4 Outline

`getSurfaceRects` receives the run's spans **tagged with the run id**. `mergeRects` groups by run id first, then unions touching rects *within* a group. Two runs that abut (interior meeting exterior at a corner) stay two outlines. The z-index of every outline rect is a single constant well above any wall piece (§4.4), so an outline is never occluded by a taller wall drawn later.

## 4. Algorithm

### 4.1 `SurfaceRunGrouper.run(clickedSpan, geometry, grid, topology, { crossOpenings })`

```
start = nearClass(clickedSpan)              // room:id | exterior:loopId ; never buried
if start is buried: return null             // a buried visible half is not a click target
seen = set(); queue = [clickedSpan]; members = []
while queue:
  span = queue.pop(); if span in seen: continue; seen.add(span); members.push(span)
  for next in axisNeighbours(span) ++ cornerNeighbours(span):
    if next in seen: continue
    if next is an opening span and not crossOpenings: continue
    if nearClass(next) != start: continue
    queue.push(next)
return { id: runId(start, members[0]), class: start, atoms: nearAtoms(members), spans: members }
```

- `axisNeighbours` uses `stepAlongRun`'s mask logic, kept, but the pass-through cell must be solid masonry, not merely "nothing faces me".
- `cornerNeighbours` reads `geometry.paintSpans` of the same cell for the perpendicular `kind`, plus the diagonal turn where a post's run continues as a band in the next cell.
- `nearAtoms` returns the near-side atom of each member. Paint commands write here; this replaces the `entry.roomId` filter in [`SurfaceCustomizePanel.buildRequests`](../js/UI/panels/SurfaceCustomizePanel.js).

### 4.2 `WallFaceResolver.sections` rewritten on top of it

`sections()` becomes: for every paintable span not yet assigned, call `SurfaceRunGrouper.run` with `crossOpenings: true` and collect the result. Same output shape (`id`, `surface`, `atoms`, `spans`). The corner and terminal fixtures (§6) keep passing because near-side class already gives the right answer for them; the run-inheritance walk is deleted.

### 4.3 Select vs paint

- **Paint / hover** call the grouper with `crossOpenings: false`. A doorway ends the stretch, matching what the eye reads as one wall between openings.
- **Select** ([`BuildMarqueeSelection.selectSurface`](../js/UI/Map/BuildMarqueeSelection.js)) calls it with `crossOpenings: true` for the run step, and escalates segment → run → building as today. "Building" is still every exterior loop span of the `buildingId`, unchanged.

### 4.4 `mergeRects` and z-index

- `getSurfaceRects(spans)` — `spans` carry `runId`. Bucket by `runId`, run the existing absorb loop per bucket.
- Outline z-index: drop `(pieceZ || 0) + 1`. Use one constant from CSS. Add to [`_window-ui.scss`](../css/components/_window-ui.scss) `.surface-paint-overlay { z-index: 2147480000; }` (below `__surfaces.overlay`'s 2_000_000_00… keep them ordered) and delete the per-rect `zIndex` write, or keep the field but set it to the constant.

### 4.5 `WallSurfaceRuns` trimmed

Keep `horizontalUnitsConnected`, `verticalCellsConnected`, `maskAt`, and a single `seamSide(slice)` returning west/east for a buried-but-visible band. Delete `neighbouringRunSurface`, `runSurfaceTowards`, `runSurfaceAt`, `postSurface`, `postSurfaceTowards`. `visibleSurface` calls `seamSide` only for the `hasBuriedFace` band case and otherwise returns `classify(visibleAtom)` directly.

## 5. Module map

| File | Change | Budget |
|---|---|---|
| `js/Map/Walls/SurfaceRunGrouper.js` | **new**, pure: the walk in §4.1 | ≤ 220 |
| `js/Map/Walls/WallFaceResolver.js` | `sections` delegates to grouper; drop inherited-classification path | ≤ 200 |
| `js/Map/Walls/WallSurfaceRuns.js` | trim to connectivity helpers + `seamSide` | ≤ 90 |
| `js/Map/Walls/WallRenderer.js` | delete `getPaintStretchSurfaces` + `stepAlongRun` bespoke filter; `getSurfaceRects` takes tagged spans; `mergeRects` buckets by run id | −60 net |
| `js/UI/panels/SurfaceCustomizePanel.js` | `resolveWallScopeSurfaces` / `buildRequests` `stretch` path → grouper output | ~0 |
| `js/UI/Map/BuildMarqueeSelection.js` | `selectSurface` → grouper with `crossOpenings: true` | ~0 |
| `css/components/_window-ui.scss` | fixed outline z-index | +1 line |
| `js/UI/panels/BuildInspector*` (Navigator) | room colour swatch beside name, reusing `SurfaceDebug.roomColor` | small |

Nothing new in `WallBuilder.js`.

## 6. Fixtures

`scripts/test-build-model.js` drives `WallFaceResolver.sections`; extend it with a `runs:` assertion block or reuse `sections`. Add `.fixture` files:

- **shared-wall-full-frontage** — two rooms A (large) and B (small) sharing one horizontal wall; the depth rule makes B's face visible for part of it. A click on A's side returns **one** run spanning A's whole frontage; a click on B's side returns B's shorter frontage. (The `wall-33-30-14` bug.)
- **run-turns-corner** — L-shaped room; a click on one leg's inner face returns both legs as one run. (The three-rects-should-be-one bug.)
- **interior-abuts-exterior** — a wall that is a room's back wall for part of its length and the building's outside past the corner; a click on the interior part returns only the interior run, and its outline does not merge with the exterior run even though the rects touch.
- **two-rooms-not-whole-interior** — two rooms stacked, sharing a wall, each with its own outer walls; a Whole-interior click in room A never reaches room B's atoms. (The "3 counting as whole interior" bug.)
- **doorway-breaks-paint-not-select** — one wall with a central opening; paint stretch returns one side, Select run returns both.

Re-expect existing fixtures where near-side class differs from the old inherited answer: check `corner-to-corner`, `t-junction`, `four-room-crossing`, `terminal-caps`, `unfinished-wall-end`, and the in-file `bay` / `tee` / `cross` cases in `test-build-model.js`. Expectation: near-side class reproduces all of them (corner stays with its room, terminal stops where the room does, arm posts start below the junction). If any genuinely needs inheritance, that is a §8 question, not a silent re-add.

## 7. Verification

1. `npm run test:build` green, including the new fixtures.
2. `verify` skill on the **House** and **Sandbox** maps:
   - Section hover outline === the atoms Section paint writes, every wall, no exceptions.
   - Click each side of a shared wall: run covers that room's full frontage, stops at its ends.
   - L / U / bay rooms: one Section click outlines the whole wrapped wall.
   - Interior click never outlines an exterior stretch and vice versa; abutting runs render as two outlines.
   - No outline is occluded by a taller wall piece.
   - `__surfaces.overlay()` unchanged (it reads `getCellSurfaces`, i.e. `visibleSurface`, which this plan does not touch).
3. `__build.stats()` counters unchanged — grouping is read-only, no extra rebuilds.

## 8. Questions for Ryan

1. **Doorways break a paint stretch** (§4.3) — confirmed intent, or should Section paint run straight through an opening like Select does?
2. **Corner turning is unconditional** for same-room frontage. On a room with an interior partial wall (a peninsula), a Section click on the main wall would also select the peninsula's matching face. Acceptable, or should turning stop at the first corner (one bend max)?
3. **Whole exterior** currently means "every outward atom of the walls enclosing the room behind this one" (model plan §4.5). With loop-scoped runs, should the wall Section escalate exterior → **loop** (the whole courtyard side or the whole outer shell) before → building?
4. **Navigator swatch** — reuse the hashed `SurfaceDebug.roomColor` hue, or does a room already carry an authored colour I should show instead?

## 9. What shipped 2026-09-06

Delivered:

- `js/Map/Walls/SurfaceRunGrouper.js` — the pure grouper (§4.1). BFS over near-side–matching spans, corner-turning through junctions whose own near face points elsewhere (`crossSpans`), pass-through along the axis.
- `WallRenderer.getPaintStretchSurfaces` rewritten to delegate to it; `stepAlongRun` deleted. Signature unchanged, so all four callers (Section scope, hover, Select run, `__surfaces.stretch`) get the new behaviour for free.
- `getSurfaceRects` / `mergeRects` group by `runId`; `WallRenderer.OVERLAY_Z_INDEX = 1_000_000` replaces `pieceZ + 1`, with a matching `z-index` in `_window-ui.scss`.
- Navigator room + area rows carry a hashed identity swatch (`BuildInspector.roomSwatchColor`, same hash as `SurfaceDebug.roomColor`).
- `scripts/test-build-model.js` — 4 run-grouper cases (shared-wall full frontage, run stops at class change, exterior run past a room, L-room corner turn). Browser sweep: House (334 surfaces) + Sandbox (611 surfaces), every stretch single-`runId`, every clicked surface inside its own run, zero console errors.

Deviated from the proposal:

- **`WallFaceResolver.sections()` and `WallSurfaceRuns` left intact.** `sections()` turned out to be test-only — nothing in the app calls it — so collapsing it into the grouper bought no runtime benefit and would have regressed the `bay` / `corner` / `tee` fixtures, which encode buried-corner *rendering* inheritance (`visibleSurface`'s job, not selection's). The grouper is a parallel, selection-only path; `visibleSurface` still decides which atom a paint writes to and what colour shows.
- **Near-side classification falls back to the far face when the near one is buried** (`nearClass` tries `south` then `north` for a band). Without it, building-corner cells whose visible face is `north` produced an empty stretch. Still near-side-*preferring*: the far face only wins when the near face is masonry.
- **`runId` is keyed on the start span**, so clicking two spans of one physical run yields two id strings for the same span set. Fine — merge-grouping only needs consistency within a single `getSurfaceRects` call, and hover vs. selection overlays were never merged with each other anyway.
- **Openings are not yet a run boundary** (§8 Q1 unresolved). `crossOpenings` was not built; runs cross doorways exactly as before.
- Corner-turning is unconditional (§8 Q2 unresolved) — a peninsula's matching face joins a main-wall run. Accepted for now.

## 10. Revision — same day, after first playtest

First cut over-reached and mis-scoped. Fixes:

- **"Section" was selecting the whole interior.** The grouper turned corners in every mode. It no longer turns corners at all — a run is one straight piece along one axis ("same z-index = same extent", Ryan). Corner wrapping is the room/building scope's job, not a run's.
- **Two grains, two buttons.** `data-value="segment"` **Segment** — out to the next junction each way. `data-value="stretch"` **Section** — the whole straight run, through every junction, until the wall turns or the near-side owner changes. Openings never stop either. `SurfaceRunGrouper.group(span, ctx, 'segment'|'run')`.
- **"Whole interior" was painting the neighbour's side of shared walls.** Root cause was never selection — it was `getPaintSpans` taking ownership from `visibleSurface` (the depth-rule winner), so a wall shared by rooms A and B could report B's id on the face that fronts A. Ownership now comes from `SurfaceRunGrouper.ownerClass`: the block behind the **near (camera) face**, falling back to `visibleSurface`'s run-inheritance only when that face is masonry (a returning-corner sliver). Same lookup in `WallFaceResolver.classifyPaintAtom`. `visibleAtom` — which physical atom renders and stores explicit paint — is untouched. Browser check: on Sandbox, every room now owns only faces whose camera side is genuinely its own (was 6–21 wrong per room on the two most tangled).
- **Navigator swatch** uses `RoomPanel.roomColour(id)` — the room's actual colour (floor tint / room list), hand-picked hue or id-derived — not a fresh hash.
- **Doorways do not break a stretch.** Confirmed; `crossOpenings` stays unbuilt.

§8 Q3 (exterior → loop escalation) dropped — not pursuing.

## 11. Revision — Whole exterior missed the corners

"Section" reached the returning-corner slivers where a wall turns; "Whole exterior" / "Whole building" did not, and the slivers could not be selected on their own either.

Cause: those two scopes ran their own enumeration (`roomExteriorAtoms` walked only `north`/`south` faces and required the inner face to be a room, so a sliver whose inner face is masonry was dropped; `exteriorSurfaces` filtered `getCellSurfaces` per cell with no run awareness).

- New `SurfaceRunGrouper.group(span, ctx, 'shell')` — floods the connected masonry in **both** axes, keeping every half whose near side names the same exterior loop. Corners, vertical side walls and buried slivers all come along.
- New `SurfaceRunGrouper.spanAdjacentRoom` — the room an exterior half fronts, read past a buried far face to the nearest half on its run that can say. This is how a sliver knows which room's outside it is.
- `WallRenderer.getShellSurfaces(surface, { roomId? })` wraps it: no `roomId` → the whole loop ("Whole building"); with one → the length of that room's own outside wall ("Whole exterior"). Both share `spansToSurfaces` with the run path.
- `SurfaceCustomizePanel` `roomExterior` / `exterior` scopes (overlay + requests) now call `getShellSurfaces`. `roomExteriorAtoms`, `atomSurfaces`, `exteriorSurfaces` deleted.

Browser check (House, Sandbox): the shell now includes the vertical side walls (56 / 35 post entries) and every "Section" run is a subset of it. Still open: the report that the corner half-tiles can't be *clicked* individually — needs the specific cell; `__surfaces.cell(x, y)` on one will show whether a hit region is published there.
