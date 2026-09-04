# Roofing Plan — September 2026

**Status:** proposed 2026-09-03
**Depends on:** `BUILD_SURFACE_MODEL_REFACTOR_PLAN_2026-09.md` — `BuildingPlan`, `RoomTopology` shell loops and roofable footprints, level-scoped stores, `BuildTransaction`, the `WallGeometry` distance/fence helpers. Roof work cannot start before that plan's WP3 lands; the pure geometry (§4) can be prototyped against fixtures after WP1.
**Carries forward:** `BUILD_MODE_UX_AND_ROOFING_PLAN_2026-08.md` §9 — a roof derives from the real footprint including projections, recesses, concave outlines and courtyards; composable semantic sprite parts; never one triangle over a bounding box.

## 1. Decision

A roof is **derived cover over a building's footprint**, rendered from a small set of modular tile parts, and coloured the same way walls are: a material template plus a colour.

Three things are persisted per building: the roof's *style*, its *material and colour*, and a handful of *intent overrides* (overhang, visibility, excluded cells). Everything else — which cells are covered, where the ridges, hips and valleys fall, which sprite each cell draws, how high the roof sits — is computed from walls and topology inside the build transaction and thrown away on the next one.

## 2. What the camera means for a roof

The world is drawn top-down for ground and head-on for walls: a wall cell's face is a 32×160 px strip standing on the cell's south edge. A roof therefore is a **top-down plane lifted by the wall height**: the covered footprint, translated north on screen by `construction.height` (160 px for five-cell walls). Slopes are not drawn in perspective; they are shaded fills with ridge, hip and eave lines, which is how every 2D Sims-style roof reads.

Consequences the design accepts up front:

- **Depth.** A roof canvas sorts like a wall piece whose baseline is the building's south-most covered row. Anything with a smaller baseline (behind the building) is covered; anything in front is not. A tall object north of the building whose sprite reaches into the roof band is hidden by the roof, which is correct.
- **Overhang.** The covered set is the building's indoor cells plus its enclosing wall cells, optionally dilated by one cell. With no dilation the roof edge lands on the wall cell's outer edge, 9 px past the wall face at thickness 14, which already reads as a small eave.
- **Eave front.** The south edge's front face is visible in this projection, so the south eave draws a thin fascia band. Other edges show only their outline.
- **Mixed wall heights.** A roof section takes the maximum `heightCells` of its walls and flags a warning if they differ. Stepped roofs over mixed heights are deferred.
- **Gable ends.** A gable roof exposes a triangular wall above the east and west walls. In this projection it is drawn as a roof part in the construction's wall colour, not as extra wall geometry.

## 3. Data

### 3.1 RoofPlan (persisted)

```js
{
    id,
    buildingId,
    levelId: 'level_ground',
    style: 'flat' | 'hip' | 'gable',
    ridgeAxis: 'auto' | 'x' | 'y',     // gable only; auto = longer axis of the section
    finishId,                          // roof material, e.g. 'shingle_asphalt'
    colorId,                           // a swatch of that material, or a custom hex
    overhangCells: 0 | 1,
    visibility: 'auto' | 'shown' | 'hidden',
    excludedCells: ['x,y', ...],       // cells the player un-roofed (courtyards, decks)
    properties
}
```

One `RoofPlan` per building per level. Sections are derived, so a building split into two roofed blocks by an open courtyard still has one plan. Per-section overrides are a later addition to the same record (`sections: { [sectionKey]: { style, finishId } }`) and are not built now.

`RoofPlanStore` joins the five stores in `BuildDocument` under `levels.level_ground.roofs`, serialised as a `StoreDelta` like the others. A building without a plan has no roof. Creating a building in build mode creates a default roof plan from `SiteConfig.roofSystem.defaults`; the player can hide or delete it.

### 3.2 RoofGeometry (derived, disposable)

```js
{
    buildingId,
    sections: [{
        key,                    // deterministic: north-west covered cell
        cells: Set<'x,y'>,
        heightPx,               // wall height this section sits on
        mixedHeights: boolean,
        parts: Map<'x,y', { part, facing, shade }>,
        bounds
    }],
    revision
}
```

## 4. Derivation

`RoofGeometry.compute({ walls, topology, roofPlan, config })` is pure and lives in `js/Map/Roofs/RoofGeometry.js` (≤ 300 lines).

1. **Cover set.** For the building: the union of its indoor room plans' resolved cells and its wall cells (`topology.roofableFootprint(buildingId)`), minus `excludedCells`. Courtyards (open spaces not reachable from outside) are *not* covered unless the player paints them in later; a future "cover courtyard" toggle adds them.
2. **Overhang.** Dilate the cover set by `overhangCells` using 8-neighbours, never onto another building's cover.
3. **Sections.** Split the cover set into 4-connected components. Each section's `heightPx` is the maximum construction height among its wall cells.
4. **Height field.** Per section, a Chebyshev distance transform from outside the section (8-connected BFS, distance 0 outside). This is the same expansion primitive as the floor resolver without fences, and it produces exactly the hip-roof height field for any axis-aligned polygon: hips fall on the 45° lines, ridges on the medial axis, valleys at inside corners.
   - `flat`: skip; every cell has height 1.
   - `gable`: run the transform only across the ridge axis (distance to the nearest edge along that axis alone). Cells at the two ends of a ridge whose end faces open air become gable ends.
5. **Part classification.** For each cell, compare its height with its four axial neighbours (outside counts as 0):

   | Lower neighbours | Part | Facing |
   |---|---|---|
   | one | `slope` | that direction |
   | two adjacent | `hip` | the outside corner between them |
   | two opposite | `ridge` | the perpendicular axis |
   | three | `ridge-end` | the open direction |
   | four | `peak` | — |
   | none, but two adjacent *higher* | `valley` | the inside corner |
   | none | `slope` toward the nearest edge (long flat runs on a slope) | — |

   Flat style maps every cell to `flat` with an edge mask (which of N/E/S/W are outside) for the parapet overlay. Gable adds `gable-end` for the end cells, facing east or west.
6. **Shade.** `south` slopes are lightest, `north` darkest, east and west between, hips and valleys blend the two sides they join. Shade is a small enum consumed by the art, not a computed colour.

Determinism: cells and sections are iterated in `y, x` order and the classification reads only the height field, so the output is a pure function of its inputs and the fixture harness can run it in eight orientations like the floor fixtures.

## 5. Styles

Delivered in this order because each adds one part family:

1. **Flat** — one `flat` part with a parapet edge overlay by mask (16 variants, generated). The whole pipeline (plan, geometry, render, visibility, paint, UI, save) ships with this style alone.
2. **Hip** — `slope` ×4, `ridge` ×2, `ridge-end` ×4, `peak`, `hip` ×4, `valley` ×4.
3. **Gable** — adds `gable-end` ×2 and the `ridgeAxis` option.

Later candidates that fit the same part model without redesign: mansard (two-slope shade bands), per-section styles, dormers as fixtures on a slope part, chimneys as roof-mounted attachments using the wall fixture socket pattern.

## 6. Art and colour

### 6.1 Sheet contract

One sheet per **material** in `images/roofs/<material>.png`, 32 px tiles, generated by `scripts/generate-roof-sprites.js` in the manner of `generate-wall-sprites.js`. A material is a repeating pattern (shingle, tile, metal seam, thatch) drawn in a **neutral greyscale palette with named slots** — `body`, `line`, `shade`, `light`, `edge` — so colouring is a palette substitution, exactly like a wall finish's `palette`.

Row layout: one row per part family, one column per facing / mask. Overlays (ridge cap, hip line, valley line, eave outline, fascia, parapet) are separate rows drawn on top of the pattern so a new material only needs to author the pattern tile; the lines are shared.

### 6.2 Colour

Roof finishes are registered in `data/map-objects/roof-materials.json` with the same two forms wall finishes already use:

```js
"shingle_asphalt":      { "pattern": "shingle", "palette": { "body": "#5d5650", "line": "#3f3a36", ... } },
"shingle_terracotta":   { "template": "shingle_asphalt", "color": "#b8623f" }
```

`RoofMaterialRegistry` (≤ 200 lines) composes a tinted part atlas per `(material, colour)` at first use and caches it, as `WallMaterialRegistry.composeFinishOverlay` does. A custom colour from the Inspector's colour control is a `template + color` finish minted at runtime and saved by its hex, so the player is not limited to the shipped swatches.

Shade per part is applied by the generator as fixed lightness offsets on the palette, so a recolour keeps its south/north contrast.

## 7. Rendering and visibility

### 7.1 Canvases

`RoofRenderer` (≤ 400 lines) draws **one canvas per section** in the objects layer, sized to the section bounds plus the fascia band, positioned at `bounds.top * cell - heightPx`, with `z-index = getDepthZIndex(southBaseline)` where `southBaseline` is the section's south-most covered row's wall baseline. Drawing is blit-only from the tinted atlas: one `drawImage` per cell for the pattern part and one per overlay line. A section redraws when its cells, parts, finish or colour change in a transaction; roof canvases are otherwise static.

Budget: a 30×30 map holds at most a handful of sections; each is a few hundred blits on rebuild and zero work per frame.

### 7.2 Visibility

Roofs follow the wall presentation:

| Wall presentation | Roof |
|---|---|
| `up` | shown, subject to `RoofPlan.visibility` |
| `cutaway` | `auto` (below) |
| `down`, `hidden` | hidden |

`auto`: a section hides while the cutaway subject (active Myte, or the pointer in build mode) stands in any room of its building, and shows again when it leaves. It reuses `WallCutaway`'s lower and raise delays and is an instant swap, not a fade, consistent with the no-interpolation rule for walls. Build mode starts with roofs hidden and adds a **Roofs** toggle to `StageViewBar` beside the walls control; leaving build mode restores the play setting.

Hiding a roof never changes collision, topology, ownership, lighting or paint.

### 7.3 Lighting and weather

Indoors is already defined by `RoomTopology`; the roof does not redefine it. Weather shelter and daylight consumers read `topology.roofableFootprint` and the plan's `excludedCells`, not the renderer. No lighting change ships with this plan.

## 8. Paint and UI

- **Paint tool.** Clicking a visible roof targets `{ kind: 'roof', buildingId }`. The palette shows roof materials with their swatches plus a colour control. Section-level paint is not offered until per-section overrides exist. Eyedropper samples material and colour.
- **Inspector (building selected).** A `Roof` group: Style, Material, Colour, Overhang, Visibility, and `Un-roof cells` which enters a small cell-paint gesture writing `excludedCells`. Warnings: mixed wall heights, no indoor rooms (nothing to cover).
- **Transactions.** Every change is a `BuildTransaction` writing `RoofPlanStore`; undo and redo work like every other build edit. Wall edits that change the footprint mark the roof dirty in the same transaction, so a pulled wall re-roofs in one rebuild.
- **Hit-testing.** `RoofRenderer` publishes each section's covered rectangle set to `WallHitTest`'s sibling `RoofHitTest`; no pixel reads.

## 9. Persistence and Tiled

- `RoofPlan` records live in the build document under the level and diff against the authored baseline like every other store.
- Authoring: a Tiled `Room` object may carry `roofStyle`, `roofFinishId`, `roofColorId`, `roofOverhang` on the building's first room, or a `Building` object may carry them once buildings are authored explicitly. `GameMapLoader` turns them into an authored `RoofPlan`; `WallTiledExporter` writes them back. `validate-maps.js` rejects unknown styles and materials.
- Config: `SiteConfig.roofSystem = { enabled, materialsPath, defaults: { style, finishId, colorId, overhangCells, visibility }, hideInBuildMode }`.

## 10. Verification

- **Fixtures.** `tests/build/fixtures/roofs/*.fixture` reuse the ASCII map format; the expectation is a per-cell part grid using one character per part (`^` ridge, `/` `\` hips and valleys with facing rows, `n e s w` slopes, `*` peak, `F` flat, `G` gable end, `.` uncovered). Required cases: rectangle, L, T, U, courtyard, projection, recess, two detached sections, excluded cells, overhang 0 and 1, mixed heights warning, gable on each axis, odd and even widths (ridge on a cell row vs between rows).
- **Property tests.** Random footprints: every covered cell has exactly one part; hip counts equal outside corners, valley counts equal inside corners for hip style; output is identical across eight orientations up to the facing transform.
- **Browser.** Roof appears over House when a myte is outside and hides when it walks in; walls down hides roofs; recolour via Paint and via Inspector both undo; save and reload; screenshot comparison at native zoom for each style over the House footprint.

## 11. Work packages

| WP | Owner | Delivers | Gate |
|---|---|---|---|
| **R0 Geometry** | Fable | `RoofGeometry.compute`, part classification, roof fixtures and harness support | fixtures green in eight orientations |
| **R1 Plan, store, transaction** | Delegate | `RoofPlan`, `RoofPlanStore`, defaults, document/Tiled round-trip, dirty marking from wall edits | round-trip and undo tests |
| **R2 Flat roofs end to end** | Delegate | `RoofMaterialRegistry`, generator with one flat material, `RoofRenderer`, visibility state, StageViewBar toggle | House shows a flat roof; hide/show; screenshots |
| **R3 Hip and gable** | Delegate | remaining part families in the generator, gable ends, `ridgeAxis` | style fixtures rendered and compared |
| **R4 Colour and UI** | Delegate | materials file with three materials and swatches, custom colour, Paint target, Inspector group, un-roof gesture, eyedropper | UI acceptance driven headlessly |
| **R5 Consumers** | Delegate | weather shelter and daylight read the roofable footprint; docs updated | no lighting regressions on House |

R0 needs only `WallGeometry` and a topology stub, so it can run right after the surface plan's WP1. R1 onward waits for WP3 (topology and transactions) and WP7 (Inspector).

## 12. Non-goals

- No perspective slopes, no lighting on roof planes, no shadows cast by roofs.
- No stepped roofs over mixed wall heights, no multi-level roofs, no roof over a second storey.
- No dormers, chimneys, gutters, skylights or roof-mounted objects in this pass. The part model and the fixture socket pattern leave room for them.
- No per-section styles or materials yet; the record shape reserves the field.
- No automatic courtyard cover; excluded cells are the only hole mechanism.
- No roof art authored by hand. Parts are generated from pattern tiles and shared overlays so every material costs one tile.
