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

One canvas per room, inside the background layer — above the baked map image, below ground decor, so objects, mytes and walls all still draw over it.

Two things that are easy to get wrong:

- **The repeat is anchored to the world grid, not the room's corner.** Otherwise two rooms sharing a finish show a seam wherever their bounds happen to start, most visibly across a doorway.
- **A layer child is already in map coordinates.** `.layer` is positioned at `--map-render-inset-*` by CSS and sized to the map, so applying `getRenderOffset()` to a floor shifts it by the reserved strip a second time. This was written wrong once and caught by asserting placement drift against room bounds.

Rooms are rect, polygon **or** tilemask. A tilemask room is not a rectangle, so the fill is clipped to the room's real shape — filling its bounding box would paint over the bordering walls and the corridor outside it.

### Edge bleed

A room's bounds stop one cell short of the wall enclosing it, and that wall covers only its centred `thickness` — so painting the bounds exactly leaves a strip of the map's authored ground showing along every outer edge.

Each room's floor is therefore grown to the CENTRELINE of its boundary cells, putting floor *underneath* the surrounding wall, which then draws over it. This is no longer a setting — `floorSystem.edgeBleedCells` was removed in the September refactor, because half a cell is the wall's centreline by construction and any other value tucks past the wall's outer face or stops short. See `BUILD_SURFACE_MODEL_REFACTOR_PLAN_2026-09.md` §4.7 and §13a.

The default is **half a cell**, because that is the wall's centreline: a wall is `thickness` centred in its own cell, so its middle sits at `(cell - thickness) / 2 + thickness / 2`, which is `cell / 2` whatever the thickness. The floor edge therefore ends buried under the wall. A **full** cell reaches the far side of the wall's cell and spills `(cell - thickness) / 2` px past the wall's outer face onto the exterior, which reads as the floor leaking out of the building.

The grown area is masked by **the room's own shape, minus every other room**. That subtraction is the important half: it stops the bleed spilling across a shared wall into a neighbour that owns its own floor, so room-to-room boundaries render exactly as they did and only the outer edges gain a tile. A polygon room is dilated by stroking its outline with round joins; a tilemask room by growing each cell.

## 6. Runtime

`gameMap.floorBuilder.setRoomFinish(roomId, finishId)` repaints one room, the floor equivalent of swapping a wall finish. Tiles are cached per finish, so a repaint is a cache hit. Passing a falsy id removes the override and restores the authored ground.

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
