# Wall System Improvement Plan — August 2026

**Status:** F1–F3 implemented 2026-08-10; D1–D4 outstanding. Amends `WALL_SYSTEM_AND_SPRITESHEET_SPEC_2026-08.md`; where the two disagree, this document wins.
**Reference behavior:** The Sims wall cutaway.
**Owners:** Phases marked **[Fable]** are implemented by Fable first. Phases marked **[Delegate]** are handed to another model afterward; each Delegate phase is written to be executable without further context.

---

## Part 1 — Audit of the current system

### What exists (commit d704f4d)

- `js/Map/Walls/WallBuilder.js` — cells → 4-bit mask → merged horizontal pieces; each piece is one `<canvas>` composed from a construction sheet + a finish sheet; openings clear transparent apertures; face sockets host decorations via `AttachmentSystem`; presentation modes `up | down | cutaway | hidden`; wall-state v4 persistence.
- `js/Map/Walls/WallMaterialRegistry.js` + `data/map-objects/wall-materials.json` (schemaVersion 2) — constructions and finishes each require a full 16-mask-column × (full+stub) sheet.
- `scripts/generate-wall-sprites.js` — hand-rolled PNG writer producing the placeholder construction sheet (with debug mask colors baked into top caps) and two finish sheets.

### Findings

| # | Finding | Severity |
|---|---|---|
| A1 | **Cutaway is binary and per-piece.** `getPieceMode()` returns `full` or `stub`; an entire merged run snaps down in one frame. No partial section, no sloped shoulders, no animation. | High — core of the ask |
| A2 | **Cutaway is room-membership + overlap, not occlusion.** `isFrontBoundaryForSubject()` checks room ids and `point.y < piece.baseline` but never whether the full-height wall actually covers the subject on screen. A front wall 6+ cells south of the Myte (which hides nothing) still cuts away. | High |
| A3 | **Stale overlap while walking.** `updateActiveRoom()` ([GameMap.js:1113](../js/Map/GameMap.js#L1113)) early-returns when the committed room key is unchanged, but `isFrontBoundaryForSubject()` depends on the subject's live X overlap. Walking east along a front wall does not re-evaluate which pieces are cut until a room change. Cursor movement inside a room has the same problem. | High (bug) |
| A4 | **Doors/windows do not inherit cutaway.** Only `WallDecoration` implements `setWallVisibility`; opening objects attach to `WallOpeningSlot`, which never propagates presentation. When a piece stubs, the aperture clipping shrinks but the door/window sprite (a separate DOM object) still renders at full height above a 28 px stub. | High (matches user report) |
| A5 | **Decorations are hidden all-or-nothing per face**, keyed to piece mode, not to whether the cut line actually passes below the decoration. | Medium |
| A6 | **Hysteresis exists only for room commits** (180 ms debounce on the room key). Per-section state has none, so A3's fix would introduce flicker without new per-section hysteresis. | Medium |
| A7 | **Every finish requires a full 512×188 mask sheet** whose per-mask plane geometry must match the construction's clipped footprint pixel-for-pixel. Adding one paint means authoring 32 frames. Registry `validate()` enforces this. | High — art cost |
| A8 | **Both wall sides share one visible finish.** Data has four faces per cell, but rendering resolves a single `resolveVisibleFinishId()` (south face) per cell; a wall between two rooms cannot show different paint per side anywhere (including the stub top). | Medium |
| A9 | **Debug mask colors are mandatory** (`debugMaskColors`/`debugMaskLabels` are validation-required and baked into shipped art). | Low |
| A10 | **Sprite geometry is edge-anchored, not centered.** Horizontal frames occupy the full cell; the wall plane sits on the cell's south edge (baseline = `(y+1)*cellSize`). The target design centers the wall's thickness on the cell so sprite frames are symmetric and both faces meet the grid line. | Medium |
| A11 | Solid parts: mask/merge pipeline, opening placement/persistence, face sockets, node budget, grid/LOS decoupling from rendering. **Keep all of it.** | — |

---

## Part 2 — Target design

### 2.1 Cutaway engine v2 (functional)

Replace the per-piece binary mode with a **per-cell cutaway state plus authored transition frames**. The model is the fence: a discrete neighbor state selects a discrete sprite frame. Nothing is interpolated, so the transition always reads the same way instead of sliding through in-between heights.

> **Revised 2026-08-10.** The first implementation used a continuous per-column height field with an eased animation. It looked wrong in motion — the cut line slid and the shoulders sampled arbitrary heights. Replaced with the state machine below; the occlusion test, hysteresis and evaluation cadence carried over unchanged.

**Model.** Every wall piece holds one entry per cell:

- `desired` — whether occlusion wants this cell lowered right now,
- `cut` — what hysteresis has committed to, and what draws,
- `since` — when `desired` last changed.

Rendering derives a frame per cell from the committed flags: a lowered cell draws `stub`, a standing cell draws `full`, and a standing cell draws `rampDown`/`rampUp` only when its lowered edge directly touches a stub and its raised edge touches a full-height cell. A lone standing cell between lowered runs is forced down, while a two-cell standing island expands to leave a full-height plateau; transition tiles can therefore never touch each other.

**Where cutaway applies.** Rooms come from authored Tiled zones (`MapEnvironmentManager.registerRoomRegions`), and where they exist the room topology test below keeps a wall from dropping for a room you are not in. A map with no authored rooms would then never cut anything, which is why the room clauses are skipped when the subject is not inside any room: there, occluding the subject is reason enough. Back walls still never cut — they fail the "in front of the subject" test, not the room test.

**Occlusion test** (camera fixed, north = screen back). A front-boundary cell *occludes* a subject iff all of:

1. Structural: cell is a horizontal-run cell (`(mask & 10) !== 0 && (mask & 5) === 0`), its north face borders a committed cutaway room, its south face borders a different room / exterior (the existing `isFrontBoundaryForSubject` room logic, kept as `isCutawayBoundaryCell`).
2. In front: `piece.baseline > subjectFootY`.
3. **Actually covering:** the full-height wall's screen band `[baseline − fullHeight, baseline]` overlaps the subject's sprite band. Since (2) holds, this reduces to `baseline − subjectFootY < fullHeight + occlusionMarginPx`. This is the piece that makes it occlusion-driven instead of proximity/room-driven — distant front walls stay up.
4. Horizontal: the cell's `[x0, x1)` intersects the subject's collider X-range expanded by `cutawayPaddingCells` (default 1) — the "reveal a little more than the sprite" margin.

Subjects: active Myte + cursor subject (existing `getCutawaySubjects()`).

**Transition frames are two authored tiles.** `rampDown` (tall west, low east) and `rampUp` (mirrored) each live in their own column of the sheet, past the 16 mask columns. The step between the two heights is a straight vertical line — no diagonal, no curve — and its end face is drawn in the cap colour so the dark line along the top of a wall runs unbroken from the tall run, down the step, and along the low run.

They are their own tiles rather than per-mask variants because a transition only ever occurs along a straight horizontal run: two tiles cover every case, where variants would mean another 32 frames. The registry repeats the tile across all 16 column slots when it builds the state, so the renderer still indexes by mask and never special-cases them.

**A lowered run always ends in a valid transition.** Cutaway height is resolved across the structural horizontal chain rather than per paint/room canvas. A pure horizontal end cap may join the stub run as long as that run transitions to full height somewhere; a completely lowered freestanding run retains one anchored end. Every piece in a changed chain is redrawn from the same committed height snapshot so room seams cannot retain orphan transitions.

**A lowered run never bisects an opening.** Before the transition cells are reserved, the run grows outward to cover every cell of any door or window it touches. Halving a door reads as a rendering bug; taking the whole thing down reads as a deliberate cutaway.

**Openings only sit in straight runs.** A cell that also carries a perpendicular arm — a corner, a tee, a junction — is where two walls meet, so a door or window placed there would hang over the wall coming in from the side. `isOpeningCellCompatible` requires `(mask & 10) && !(mask & 5)` for a horizontal opening and the mirror for a vertical one.

**The aperture is inset per side.** An opening's declared size is its footprint, but its sprite may carry a transparent margin around the frame, and clearing the whole footprint then shows a sliver of missing wall around it. The hole shrinks by `wallOpeningConfig.apertureInset` — a number or `{top,right,bottom,left}`, falling back to `SiteConfig.wallSystem.apertureInsetPx`.

The rule for choosing it: **the inset must be at least the art's transparent margin, and erring large is free** — the sprite covers whatever the hole does not. Measured margins today: `window_wood.png` 1 px all round, `window_wood_double.png` 1 px except 2 px at the bottom, the door frames 0. Hence `WINDOW: {top:1,right:1,bottom:3,left:1}` and `DOOR: 0`.

Two structural rules on top: side insets apply only at the *ends* of an opening, never between its cells, so a multi-cell window is one hole; and an opening whose sill is 0 gets **no bottom inset at all**, because it meets the floor and any inset there leaves a sliver of wall standing inside the doorway.

**Dragging a wall object raises the wall around it.** While an opening is being moved, the cells within `cutawayPaddingCells` of it stand back up — transitions and all — so you can see the wall you are placing into even with every wall down. It is the cutaway in reverse and uses the same code path: a base cut state, then overlays, then transition reservation.

**Hysteresis, no animation.**

- Lowering: a cell flips down only after the occlusion condition has held `cutawayLowerDelayMs` (default 80).
- Raising: only after it has been clear for `cutawayRaiseDelayMs` (default 300).
- The flip itself is instant. `tick()` only commits pending flips and re-renders the pieces whose states changed; settled pieces are never redrawn. Room-commit debounce (180 ms) stays as the outer gate.

**Evaluation cadence** (fixes A3): `updateActiveRoom()` keeps its room-commit logic, but occlusion evaluation additionally runs when the subject's occupied cell or the cursor's cell changes, throttled to `cutawayEvaluateThrottleMs` (default 100). Never per-frame geometry rebuilds — only state updates + canvas redraw of affected pieces.

**Inheritance contract** (fixes A4/A5). One uniform API: everything mounted on a wall receives the world-space cut line of its owning cells.

- `WallFaceSurface.setPresentation` is replaced by `setCutLine`, which forwards `applyWallCut(cutY)` to attached children, `cutY` being the wall top over that child's own span (lowest point wins, so a child straddling a transition follows the lowered side).
- `WallDecoration.applyWallCut(cutY)`: hidden when `cutY > decorationTopY` (cut passes below its top). (Clip-based partial reveal is a stretch goal, not required.)
- `WallOpeningSlot` children (doors/windows) get `applyWallCut(cutY)` via `WallOpeningPlacement`, but **keep drawing at full size**. A door is a thing in its own right, not paint on the wall: lowering the wall must not delete the room's exits. The hook stays so a construction whose openings really are wall-height can clip them later. Collision/walkability never changes — presentation only.
- Openings do **not** change the frame choice: apertures are cleared after the frame is drawn, exactly as today, using the cell's own state height.

**Side walls:** keep the current spec rule (east/west runs stay full) as default. Add `SiteConfig.wallSystem.sideWallOcclusion` (default `false`) reserved for a later phase; do not implement now.

**Config additions** (`SiteConfig.wallSystem`): `occlusionMarginPx: 48`, `cutawayPaddingCells: 1`, `cutawayLowerDelayMs: 80`, `cutawayRaiseDelayMs: 300`, `cutawayEvaluateThrottleMs: 100`, `apertureInsetPx: 2`.

`cursorCutawayEnabled` is now only the starting value for `container.settings.wallCursorCutaway`, which the View panel exposes as a checkbox — walls reacting to the cursor is a taste question, not a constant.

### 2.2 Art pipeline v2 (visual)

**Goal: adding a paint = one small tileable swatch PNG + one JSON entry.** No per-mask finish sheets, ever.

**Art language.** Geometry follows the authored tilesets (`images/tilesets/walls3-export.png`, `full_walls.png`): the wall's footprint is a band of `thickness` px **centered on its cell**, every free end is **rounded off**, and there are no outlines — just a darker top cap, as deep as the wall is thick, over a lighter face. Frames are derived from that footprint by morphological rounding, so everything built from it inherits the same soft silhouette, paint masks included.

**Frame layout.** Every band is `frameHeight` tall (`height + cellSize`) and anchored so its bottom row sits on the cell's south edge. `baselineRow` marks the wall's foot inside the frame. One band height for everything means the renderer never does height arithmetic — it picks a frame and blits `cellSize × frameHeight`.

**Two authored bands plus two transition tiles.** The sheet holds the tall wall and the low wall, 16 mask columns each, and two extra columns for the transitions (see 2.1). At load, `WallMaterialRegistry` derives:

- each **state's frame**, laid out as 16 mask columns so the renderer can always index by mask;
- a **paint mask** per state — every opaque pixel that is not `capColor`. The wall's top is the one surface a finish must never touch and the one colour the art declares, so the mask needs no separate authoring pass and cannot drift out of sync with the art.

That is the whole reason there is a `capColor` field: it turns "which pixels are paintable" from a second copy of the geometry into a one-line question about the first copy. Updating the art means editing two rows of one PNG.

**Debug art.** An optional `debugSheet` carries the same two bands with each mask's cap tinted its own colour. The registry swaps to it whenever `Utility.isDebugEnabled()` is true (`?debug=1` or the `debug` body class), so a wrong mask is obvious on screen without shipping tinted caps in the real art. Paint masks are always derived from the neutral sheet.

**The cap is never painted.** A finish covers the face only. Keeping the top the construction's own colour in every state is what makes a run of caps read as one continuous line around a room — including where a lowered horizontal wall meets a standing vertical one. It also means a finish swatch must never be darker than `capColor` at its foot, or the baseboard reads as a second cap.

**Schema v3** (`wall-materials.json`, `schemaVersion: 3`):

```jsonc
{
  "schemaVersion": 3,
  "constructions": {
    "plaster_wall": {
      "sheet":      "images/walls/construction-plaster.png",
      "debugSheet": "images/walls/construction-plaster-debug.png",  // OPTIONAL, mask-tinted caps
      "capColor":   "#cec8b5",               // the one colour a finish may not paint
      "cellSize": 32, "height": 160, "stubHeight": 28,
      "thickness": 14,                       // footprint depth, centered on the cell
      "frameHeight": 192,                    // height of every band
      "baselineRow": 182,                    // the wall's foot inside a frame
      "maskMap": [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15],
      "transitionColumns": { "rampDown": 16, "rampUp": 17 },   // past the 16 mask columns
      "bands": {                             // the only authored art
        "full": { "baseY": 0 },
        "stub": { "baseY": 192 }
      },
      "debug": { "maskLabels": [...] }        // OPTIONAL
    }
  },
  "paintSheet": "images/walls/paints.png",   // one 32px column per swatch finish
  "finishes": {
    "plaster_plain":         { "swatch": 0 },              // column in paintSheet
    "wallpaper_blue_flower": { "swatch": 1 },
    "paint_sage":            { "color": "#9caf88", "baseboard": "#b3c4a1" },     // zero-art procedural paint
    "paint_terracotta":      { "color": "#c98d68", "baseboard": "#dcae8e" }
  },
  "fixtures": { "painting": { "defaultWidth": 20, "defaultHeight": 16 } }
}
```

- **Swatch contract:** one 32 px column of `paintSheet` (or a standalone file — `swatch` accepts a column index or a path), `height` px tall, anchored to the wall's foot, baseboard included. No masks, no frames, no stub art, and **no rounded corners of its own** — the paint mask carries the rounding, so a flat rectangular column comes out correctly rounded on every free end. A finish's foot must never be darker than `capColor` or it reads as a second cap.
- **Procedural finishes:** `color` (+ optional `baseboard`, `accent`) generate a flat swatch at load time. Adding a paint color requires zero image files.
- **Composition** (runtime, cached): per `(constructionId, finishId, state)` build an offscreen canvas once — tile the swatch across 16 columns anchored on `baselineRow`, `destination-in` with the derived paint mask, done. `renderPiece` then draws, per cell, the construction frame for that cell's state → the cached finish overlay for the same state → aperture clears. Cache invalidates only on registry reload.
- **Paint on stubs** comes free from the derived stub mask. Per-side paint on the lowered cap was tried and removed: it broke the continuity of the cap line at corners, which matters more than showing both rooms' colours at once. Rendering shows the south face only (the north face of a front wall is invisible from this camera).
- **Per-side data** already exists (`faces.north/south` per cell + `faceOverrides` with `face`); rendering consumes both. `resolveVisibleFinishId` is split into `resolveFaceFinishId(cell, face)` with the existing one-sided-corner inheritance kept for the south face.

**Centered geometry (A10).** The wall's thickness is centered on its cell, so the visual baseline is `(y + 0.5) * cellSize + thickness / 2` instead of `(y + 1) * cellSize`. Everything reading the baseline follows: piece z-index, `getSortY`, opening offsets (which now hang off the wall's foot), and `getLightBlockers()` (the centered thickness band, not the full cell). Grid collision (whole cell) is unchanged. Baked floors need no change on maps whose walls live on their own Tiled layer — the omission is per layer, so the floor beneath still bakes.

### 2.3 Explicitly superseded spec points

- §6.3 "Finish sheets use the same 16 mask columns…" → replaced by swatch + paint-mask composition.
- §7 binary stub swap → replaced by per-cell cutaway states plus authored `rampDown`/`rampUp` transition frames; the 180 ms room debounce survives as the outer gate.
- Mandatory `debugMaskColors`/`debugMaskLabels` → optional `debug` block.
- Baseline at cell south edge → centered baseline, with the wall's footprint centered on its cell and every free end rounded.

---

## Part 3 — Implementation phases

### Phase F1 [Fable] — Cutaway engine v2 core

Files: `WallBuilder.js`, `GameMap.js`, `SiteConfig.js`.

1. Add per-cell cutaway state to pieces (`cutStates: [{ desired, cut, since }]`).
2. Implement the occlusion test (2.1) as `computeCutCells(piece, construction, subjects)`; keep the existing room-commit logic as the gate.
3. Implement hysteresis timers; hook a `tick()` on WallBuilder called from GameMap's update, no-op when every cell has settled.
4. Rework `renderPiece` to draw one authored frame per cell (`full` / `stub` / `rampDown` / `rampUp`), keeping aperture clears.
5. Throttled re-evaluation on subject/cursor cell change (fixes A3).
6. New SiteConfig keys with the defaults from 2.1.

Acceptance: walking behind a long front wall lowers only the section over the Myte, joined to the standing wall by a transition frame on each side; the lowered section follows the Myte as it walks; walls further south than `fullHeight + margin` never cut; no flicker at boundaries; `down`/`up`/`hidden` modes unchanged; node budget untouched (no new DOM nodes — canvases only redraw).

### Phase F2 [Fable] — Inheritance contract

Files: `WallBuilder.js`, `WallOpeningPlacement.js`, `DoorMapObject.js`, `WindowMapObject.js`, `AttachmentSystem.js` (only if forwarding needs a hook).

1. Replace `setPresentation(height, hidden)` with `setCutLine(cutY)` propagating `applyWallCut(cutY)` to face children (decorations) and opening-slot children (doors/windows).
2. Decorations: hide when the cut passes below their top.
3. Doors/windows: `clip-path` to the wall's current top; hidden at stub. Collision, walkability, LOS untouched.
4. Persisted state unchanged (presentation-only; no version bump needed).

Acceptance: stubbing a wall with a door/window never leaves a floating sprite; restoring the wall restores them; moving an opening still forces walls full (existing `_movingOpeningIds` rule).

### Phase F3 [Fable] — Registry schema v3 + composition pipeline

Files: `WallMaterialRegistry.js`, `WallBuilder.js` (`renderPiece` finish path), `wall-materials.json`.

1. Registry `validate()` for schemaVersion 3 (bands incl. paint masks + capStrip; finishes are `swatch` XOR `color`; `debug` optional). Reject v2 with a clear migration message.
2. Swatch loading + procedural swatch generation; composition cache keyed `(constructionId, finishId, mode)`.
3. `resolveFaceFinishId(cell, face)`; stub-top per-side strips.
4. Hand-write the v3 JSON with the existing three finishes (temporary: keep pointing at current art until D1 regenerates it; the registry accepts a `legacySheet` fallback for exactly one release — delete after D1).

Acceptance: repaint via `setFaceFinish` works per face; a `color`-only finish renders with zero image files; stubs show paint; a two-room shared wall shows each room's color on its stub top strips.

### Implementation notes (F1–F3, shipped 2026-08-10)

Deviations from the plan as written, all deliberate:

- **The cutaway is sprite-state, not interpolated.** The first cut of F1 used a per-column height field with eased animation; it read badly in motion and was replaced with the per-cell state machine in 2.1. `cutawayRampCells`, `cutawaySubColumnPx` and `cutawayAnimPxPerSec` are gone with it, and `tick()` no longer takes a delta.
- **The transition went diagonal → curved → straight step → authored tile.** Each step was a rejection of the previous look. It now ships as two tiles in their own sheet columns, with the step's end face in the cap colour so the top line never breaks.
- **The sheet is two bands and 18 columns.** It briefly grew to ten bands; deriving paint masks at load and confining transitions to two tiles collapsed it to `full` + `stub`, 576×384. Nothing about the wall's geometry exists in more than one place.
- **All swatch finishes share one `paints.png`**, one 32 px column each. `swatch` accepts a column index or a standalone path, so either form works.
- **The art was redone against the authored tilesets** (centered footprint, rounded ends, no outlines, cap depth = thickness) rather than kept as the edge-anchored placeholder. That pulled **A10 / D2's centered baseline forward into F3**, since art and baseline have to move together: `piece.baseline`, the light blockers and the opening offsets are all centered now.
- **Every band is one frame height**, anchored on the cell's south edge, so canvas size is constant, each cell is a single blit, and the aperture is a plain `clearRect`.
- **`capStrip` is gone**, along with the per-side stub-top painting — a painted cap broke the top line at corners, which matters more than showing both rooms' colours at once.
- **Openings are never clipped**; decorations ride the wall down and re-answer the cut line whenever the attachment system moves them.
- `validate-content-data.js` was moved to the v3 rules as part of F3 (D3's item 1 is done); D3 keeps the editor/UI work.

**Pointing at a wall does not lower it.** The cursor subject skips any piece whose own cells contain the pointer — you are usually looking at what is mounted on that wall, and erasing it (and its decorations) under the pointer made fixtures impossible to look at. The cursor still lowers walls it is standing beyond.

**Wall fixtures are real map objects.** `PAINTING` uses `withWallFixturePlacement`, the counterpart to `withWallOpeningPlacement`: an opening occupies wall cells and interrupts the wall, a fixture occupies none and rides on a face. It therefore snaps to a *point* on a face — free along the wall and up and down it, never off it — and takes no part in collision or pathfinding (`getGridOccupancyBounds` returns null).

Paintings, doors and windows are all `storable: true`, so they round-trip through the inventory via `ItemRegistry.findItemForWorldObject`, and a map with `lockFurniture: true` still forces `draggable`/`storable` off — that is the world-room vs authored-room switch, and wall fixtures inherit it for free.

A fixture keeps drawing when its wall lowers, exactly as openings do — it is a thing you own and arrange, not paint on the wall, and you cannot click what you cannot see. `attachFixtureObject` also *places* the object from its authored `u`/`v` before attaching, the way an opening is placed into its slot; without that the socket left it wherever the map author's raw x/y happened to fall.

Wall objects do not overlap: `resolveFixturePlacement` rejects a spot whose rect covers an opening's aperture or another fixture, so a painting cannot be hung over a window, a door, or another painting.

Two traps worth remembering. Wall faces are `height` tall but rows are `cellSize` apart, so a point sits inside **several** pieces' face bands at once — `getFixtureFaceForPoint` must take the frontmost (largest baseline), or a fixture hangs on a wall rows behind and gets clamped to that wall's foot. And an opening's *footprint* is one cell row while its *sprite* stands the full height of the wall, so `getCullingBounds` must cover the sprite; culling on the footprint drops the art while most of it is still on screen.

Storing an object into the inventory mid-drag returns before the placement path runs, so anything that latched state on drag start needs `onPlacementStored` to release it — otherwise a stored window leaves its wall pinned full height forever.

A lowered run pads **one cell past each end of an opening**, because the cells next to a run become transition tiles — without the slack the transition lands on the opening itself and a door or window ends up straddling a step.

Fixture placements persist in wall state (**v5** adds `fixtures`). `WallDecoration` remains for legacy `WallAttachment` authoring; House.tmx now authors `Painting` objects instead.

**Wall fixtures have art.** `fixtures.painting` / `painting_still_life` point at `images/walls/fixtures.png` with a `piece` rect, and `WallDecoration` draws it, tagging itself `--art` so the stylesheet's placeholder box only shows for a fixture with no sheet. `WallFaceSurface` also gained `getSortY`/`getRenderZIndex`: without them the attachment system had nothing to inherit from and every decoration sorted to `z-index: 1`, i.e. behind the wall it was mounted on.

House.tmx carries a live example of each finish form: `plaster_plain` / `wallpaper_blue_flower` from the paint sheet, `paint_sage` (Playroom) and `paint_terracotta` (Chatroom) as image-free procedural colours, plus a second painting on the bedroom's north wall.

Verified in-app via headless Playwright: a piece behind the Myte renders `full rampDown stub … rampUp full` and follows the Myte as it walks; a lowered run ending at a room corner or a door resolves through a transition tile; horizontal end caps can join longer stub runs while retaining one logical transition to full height; paint/room seams never retain orphan or adjacent transitions; dragging a wall object keeps a padded stub span behind it; doors, windows, and fixtures remain in front of the wall at every presentation; both procedural paints render with zero image files; `?debug=1` swaps in mask-tinted caps. Zero console errors in every run.

### Phase D1 [Delegate] — Sprite generation rewrite

**Done.** The generator emits the two authored bands plus two transition tiles with centered, rounded geometry, a mask-tinted debug sheet, and `paints.png`. Four finishes ship: two swatch columns and two procedural colours.

Files: `scripts/generate-wall-sprites.js`, `images/walls/*`.

1. Rewrite the generator to emit the v3 construction sheet for `plaster_wall`: bands `full`, `stub`, `paintFull`, `paintStub`, `paintStubTopN`, `paintStubTopS`, `capStrip` at the baseY values in 2.2; **centered geometry** — horizontal frames' footprint/top-cap centered per `thickness: 12`; debug mask colors moved to a separate `construction-plaster-debug.png` (same layout) referenced only by the optional `debug` block.
2. Paint masks: white where the south face plane is paintable (inset 1 px inside construction outlines, exactly the plane the current `finishRange()` computes), transparent elsewhere. Stub-top masks: the 2–3 px strip along the stub cap on each side of the center line.
3. Emit swatches under `images/walls/paints/`: `plaster-plain.png` and `wallpaper-blue-flower.png` reproducing today's look (body + baseboard + pattern rows), 32×160, baseline-anchored.
4. Add 4 new paints demonstrating cheapness: two procedural (`paint_sage`, `paint_terracotta` — JSON only) and two swatch-based (`wallpaper_stripe_cream`, `brick_red` — one 32×160 PNG each).
5. Update `wall-materials.json` to v3 final (remove `legacySheet`), rerun and commit generated PNGs.

Acceptance: `node scripts/generate-wall-sprites.js` is idempotent; game renders identically-or-better with `legacySheet` removed; all 16 masks seam-clean per the original spec §6.2 checklist.

### Phase D2 [Delegate] — Centered baseline propagation

**Re-scoped:** items 1–3 are done (baseline formula, light blockers, opening offsets; baked floors need no change while walls sit on their own Tiled layer). What remains is item 4 — verifying depth sorting across maps.

Files: `WallBuilder.js` (baseline formula, `getLightBlockers`), `TileMapLoader.js` (baked-floor omission), opening offset math, any `(y + 1) * cellSize` wall assumptions (grep for them).

1. Baseline = `(y + 0.5) * cellSize + thickness / 2` from construction `thickness`.
2. Light blockers shrink to the centered thickness band.
3. Baked floors extend to the wall center line.
4. Verify depth sorting: Myte walking one cell south of a wall sorts in front; one cell north sorts behind; door z-bias still correct.

Acceptance: House.tmx and DoorTest.tmx render with no floating gaps at wall feet, no sorting regressions (compare against `/verify` screenshots before/after).

### Phase D3 [Delegate] — Tooling, editor, validation

Files: `scripts/validate-content-data.js`, `editor/js/EditorStore.js` + paint UI, `js/UI/Panels/ViewPanel.js`, `SettingsPanel.js`.

1. `validate-content-data.js`: v3 schema rules (bands present, swatch files exist, `color` parses, maskMap 16-int, no v2 keys).
2. Editor paint picker lists finishes from the registry (swatch thumbnail = the swatch itself; procedural = color chip); painting writes per-face overrides via existing `setFaceFinish`.
3. ViewPanel/Settings expose the new cutaway tunables read-only or as debug sliders behind the debug flag.

### Phase D4 [Delegate] — Verification pass

1. `/verify` scenarios: (a) Myte walks the House bedroom perimeter — only the obstructing front section cuts, shoulders slope, door clips with the wall; (b) rapid back-and-forth across a room boundary — no flicker (hysteresis); (c) repaint one face of a shared wall — both stub-top strips correct after reload (persistence); (d) walls `down` mode — paint visible on all stubs.
2. Frame budget: confirm no long tasks from animation redraws on FieldTest; confirm node count unchanged.
3. Update `WALL_SYSTEM_AND_SPRITESHEET_SPEC_2026-08.md` sections listed in 2.3 to match shipped behavior, and the acceptance checklist.

### Ordering and handoff

```
F1 → F2 → F3  (Fable, sequential — engine, then contract, then materials)
        └──→  D1 → D2 → D3 → D4  (delegate, sequential; D3 may run parallel to D2)
```

Handoff package for the delegate: this document, `WALL_SYSTEM_AND_SPRITESHEET_SPEC_2026-08.md`, and the F1–F3 diff. The delegate must not change the occlusion/hysteresis logic or the registry validation contract; anything ambiguous in D-phases resolves in favor of this document.
