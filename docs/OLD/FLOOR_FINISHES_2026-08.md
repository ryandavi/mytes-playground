# Floor Finishes — August 2026

**Status:** implemented.
**Applies to:** room-level floor customisation, the floor counterpart to wall face finishes.

## 1. What this is, and what it is not

Maps already draw ground: Tiled tile layers, baked into the map background. That does not change. This adds a **room-level override** — the floor equivalent of repainting a room's walls — so a floor can be swapped at runtime without touching the map.

A room with no `floorFinishId` is skipped entirely and keeps exactly what the map authored. The system is opt-in per room, which is what keeps it from fighting the baked background.

## 2. Why a floor finish is so much smaller than a wall finish

A wall finish needs five columns because a wall **runs out**: it has a silhouette, and the finish has to say how its own horizontal structure resolves at a free end or against a post.

A floor never runs out. It is one tileable tile, repeated. There are no masks, no ends, no clipping to a silhouette, and `FloorMaterialRegistry` derives nothing. Resisting the urge to mirror the wall registry's shape is the point.

What the two **do** share is the borrowing rule, and that lives in one place (`FinishPalette`) rather than being written twice:

- A finish that ships art declares the flat tones it is built from in `palette`.
- A finish with no art names a `template` plus a `color`, and gets the template's pixels with those tones substituted by exact match.
- Slots named in the override map take the finish's own key; every other slot keeps the template's offset from its body tone, so a grain or a seam holds its contrast.

## 3. Data

`data/map-objects/floor-materials.json`, schema v1:

```json
{
  "tileSheet": "images/floors/floors.png",
  "tileSize": 32,
  "finishes": {
    "floor_boards":       { "tile": 0, "palette": { "body": "#d6b88f", "grain": "#c7a87f", "seam": "#b2926a" } },
    "floor_boards_walnut": { "template": "floor_boards", "color": "#8f6b4a" }
  }
}
```

A finish needs **exactly one** of `tile` or `template`.

## 4. Authoring rules for the tile sheet

- **A tile must tile against itself on all four edges.** A room is filled by repeating one tile, so anything reading across a seam — a plank running off the right edge, a grout line — has to arrive back on the opposite edge at the same offset.
- **Every pixel must be one of the declared palette tones.** An undeclared tone survives recolouring at the *template's* colour, so a borrowed floor comes out speckled with someone else's palette.
- **A tile must be fully opaque.** A hole shows the map's own ground through the middle of a room.

The last two are enforced by `validate-content-data.js`; the first is a judgement only the eye can make.

## 5. Rendering

Floors render from the canonical immutable `FloorOwnershipGrid`, which resolves
on a 2×2 half-cell lattice. The background layer holds 8×8-cell chunk canvases,
above the baked map image and below ground decor, objects, mytes, and walls.
Only chunks intersecting changed ownership blocks or changed finishes redraw.

Two things that are easy to get wrong:

- **The repeat is anchored to the world grid, not the room's corner.** Otherwise two rooms sharing a finish show a seam wherever their bounds happen to start, most visibly across a doorway.
- **A layer child is already in map coordinates.** `.layer` is positioned at `--map-render-inset-*` by CSS and sized to the map, so applying `getRenderOffset()` to a floor shifts it by the reserved strip a second time. This was written wrong once and caught by asserting placement drift against room bounds.

Each chunk clips its world-anchored pattern to the blocks owned by that room
plan. Rectangles, polygons, and tilemasks are authoring inputs; the ownership
grid is the only runtime floor shape and can split one map cell between rooms.

### Edge bleed

A room owns every block in its seed cells outright. Fenced expansion may extend
that ownership by `floorSystem.edgeBleedCells` only into wall cells and derived
threshold cells; it never grows over ordinary open ground.

Wall-mask fences stop the expansion on the wall centreline. Corners, junctions,
crossings, terminal caps, doorway openings, and gaps all use this same solve;
there are no corrective bleed or room-subtraction passes.

The default is **half a cell**, because that is the wall's centreline: a wall is `thickness` centred in its own cell, so its middle sits at `(cell - thickness) / 2 + thickness / 2`, which is `cell / 2` whatever the thickness. The floor edge therefore ends buried under the wall. A **full** cell reaches the far side of the wall's cell and spills `(cell - thickness) / 2` px past the wall's outer face onto the exterior, which reads as the floor leaking out of the building.

Every half-cell block has at most one owner. Simultaneous claims resolve by
straight reach, then explicit priority, then stable plan identity, independent
of iteration or draw order. Threshold cells are filtered from plan seeds only
for the solve so floors from both sides meet on the same centreline through an
arbitrary-width doorway.

## 6. Runtime

Floor edits update `RoomPlan.floorFinishId` through `BuildTransaction`. The
transaction derives ownership once, updates the room-region projection, and
invalidates only dirty floor chunks. Tiles remain cached per finish. Passing a
falsy finish restores authored ground wherever that plan owns blocks.

## 7. Adding a floor

The tiles are a real sprite sheet — `images/floors/floors.png` — not runtime-generated art. Only *recolouring* happens at runtime, and only for `template` finishes.

The sheet is **one row of 32x32 tiles**; a finish's `tile` is its column index, counting from 0. To add one:

1. Widen `images/floors/floors.png` by 32px and paint the new tile in the new right-hand column. Keep the height at 32 and the file 8-bit RGBA.
2. Add a finish in `floor-materials.json`: `"my_floor": { "tile": 3 }`.
3. Point a room at it with `floorFinishId`.

`generate-floor-sprites.js` copies through every column past the ones it generates, so hand-drawn tiles survive a regeneration and adding a floor never means editing the script.

`palette` is **optional** and only exists to be borrowed from. Declare it only if a `template` finish should be able to recolour this tile — and then every pixel must be one of the declared tones, or the borrowed copy keeps stray pixels at this tile's colours. A tile nobody borrows can use whatever colours it likes.

## 8. Teardown

Floor surfaces live in the shared background layer, which outlives any one map, so `GameMap` disposes the builder alongside the wall builder on a map change. Without that the previous map's floors stay on screen over the new one.
