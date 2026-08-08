# Wall System and Spritesheet Contract — August 2026

**Status:** implemented as an experimental feature.
**Applies to:** T10 wall generation/render modes and T11 finishes, persistence, openings, and wall attachments.  
**Implementation maps:** every map containing tiles from the marked tileset's `Wall` Wang set.
**Map grid:** 32 px cells.  
**Prototype wall height:** 160 px (five cells), configurable per construction material and one tile taller than the 128 px door aperture.

This document is the single wall contract. It replaces the older proposal that treated every horizontal and vertical wall as one long repeated strip. The final design keeps the useful run-merging optimization but begins with fence-style, four-neighbor connectivity so Tiled and the running game agree about ends, straights, corners, junctions, and openings.

## 1. Mental model

A wall has four separate concerns:

1. **Authored footprint:** which map cells contain wall bases.
2. **Construction:** the structural top, thickness, posts, caps, corners, and outlines.
3. **Face finish:** paint, wallpaper, plaster, brick facing, or another independently replaceable surface.
4. **Runtime presentation:** walls up, walls down, or room cutaway.

The Tiled map stores wall cells and semantic properties. It does not store authoritative runtime sprite choices. `WallBuilder` computes connectivity when the map loads and produces render-only segments. Collision, line of sight, and room topology remain grid/region data and never depend on whether a wall is currently visible.

Wall finishes are overlays on construction art. Repainting a room changes a face material id; it does not replace wall geometry or collision.

## 2. Coordinate and naming convention

Use cardinal map directions everywhere:

```text
                 N / screen back
                        ↑
              W  ←  wall cell  →  E
                        ↓
                 S / screen front
```

A face name is its outward normal, not the room boundary on which it happens to sit:

- `faces.north` is the surface facing north.
- `faces.south` is the surface facing south.
- `faces.east` is the surface facing east.
- `faces.west` is the surface facing west.

This prevents “inside” and “outside” from becoming ambiguous. For example:

- On the **north/back boundary** of a room, the room is south of the wall. Its interior finish is therefore `faces.south`.
- On the **south/front boundary**, the room is north of the wall. Its interior finish is `faces.north`, while the visible exterior finish is `faces.south`.
- A wall shared by two rooms has two interior faces. It is not an interior/exterior pair.
- A face is exterior only when the cell adjacent to that face belongs to no indoor room.

Face material assignment should be derived from adjacent room membership initially, then overridden by authored/customized face records where present.

## 3. Tiled authoring

### 3.1 Canonical wall tileset

Mark the Tiled tileset with the boolean property `wallTileset=true`. Within that tileset, membership in the Wang set named `Wall` represents one 32 × 32 wall-base cell. The tile layer name is irrelevant: `Walls`, `Collider`, and future layer names all work, and renaming `walls3.tsx` to `walls.tsx` does not change the contract. Carpet, path, grass, and water Wang tiles in the same tileset remain ordinary terrain even when they are colliders.

When `SiteConfig.wallSystem.enabled` is true, only those marked wall cells are semantic input to `WallBuilder` and are omitted from the baked background. When the experimental flag is false, every tile remains a normal legacy tile.

The logical wall tileset may use Tiled Wang/terrain rules so painting feels like the existing fence editor. Tiled may display connected preview tiles, but the loader normalizes them back to wall cells and recomputes the N/E/S/W mask. This keeps runtime edits, doors, windows, and regeneration deterministic.

Optional wall defaults may be set on the map, layer, or individual tile; the most specific value wins:

| Property | Meaning | Default |
|---|---|---:|
| `wallConstructionId` | Structural material/atlas id | `plaster_wall` |
| `wallFinishId` | Initial finish for faces without a more specific assignment | `plaster_plain` |
| `wallHeightCells` | Full wall height | `5` |
| `wallConnectGroup` | Which neighboring constructions may join seamlessly | construction id |
| `blocksLineOfSight` | Marks the wall base in the LOS grid | `true` |

Connectivity depends on `wallConnectGroup`, not paint. Two adjoining plaster walls painted different colors remain structurally connected.

### 3.2 Authored openings

Doors and windows are opening records on the wall footprint:

- A door/window reserves a cell interval and cuts an aperture without breaking structural connectivity.
- Doors and windows are movable map objects, not baked wall decoration.
- Each opening object occupies one `wall-opening` socket with capacity one; picking it up releases the socket and closes the aperture until a valid drop completes.
- A placement is valid only when the object's complete, direction-aware footprint lies on a compatible continuous wall run. Occupied slots and free-floor drops are rejected, and an invalid drop returns to the original slot.
- The prototype window is a 64 × 64 (2 × 2 cell) selectable object. Its wall-slot anchor is offset from its elevated visual bounds so the sprite, selection outline, and transparent aperture coincide.
- Window objects are movement-passable and do not contribute an additional collider; the semantic wall-base cells remain responsible for collision. Their cutout still clears wall LOS.
- Horizontal windows may select a discrete sill height while being moved. The initial prototype supports 0, 32, and 64 px sill levels. The opening record's sill is authoritative for the cutout, object position, placement preview, and persistence.
- A door on a wall keeps its existing object authoritative for collision.
- A door controls grid walkability through its existing object behavior.
- A window gap clears LOS blocking for its declared cells.
- The room graph remains explicit; an opening must not accidentally merge room regions.

Doors and windows are literal transparent rectangles cleared from the composed wall canvas. No separate jamb, outline, glass, or trim sprite is required.

## 4. Neighbor mask

Use the same four-bit input convention as `FenceMapObject`:

| Direction | Bit | Value |
|---|---:|---:|
| North | 0 | 1 |
| East | 1 | 2 |
| South | 2 | 4 |
| West | 3 | 8 |

The raw mask ranges from 0–15 and describes wall-compatible neighboring base cells. It resolves the structural form:

- isolated
- four directional ends
- horizontal and vertical straights
- four corners
- four T-junctions
- cross

Do not assume the fence `maskMap` is correct for walls. Fences currently map 16 inputs onto eight art frames, but walls carry directional face finishes, top thickness, and cutaway stubs. Start with all 16 columns. A later `maskMap` may deduplicate genuinely identical frames after the art proves they are identical. Do not depend on runtime rotation; the engine has four-way facing but no general sprite-rotation contract.

Connectivity is computed once at map load and whenever an editor/runtime wall mutation occurs. It is never recomputed per frame.

## 5. Generated render geometry

Walls are render-only geometry:

- no input controller
- no interaction state
- no autonomous update/tick
- no registration as ordinary interactive map objects
- `pointer-events: none`

`WallBuilder` may merge compatible cells, but depth correctness controls where merging is safe:

- **Horizontal straight centers:** merge into runs and repeat the body/finish along X. Every cell shares the same baseline.
- **Vertical/side walls:** keep per-cell pieces or short depth-safe chunks. A single long vertical DOM element cannot interleave correctly with a Myte walking alongside it.
- **Ends, corners, T-junctions, and crosses:** remain explicit structural pieces.

Each generated piece exposes a stable sort baseline. Full-height art is drawn upward from that baseline. A Myte north of the baseline sorts behind the wall; a Myte south of it sorts in front.

Door and window apertures do not split an otherwise compatible horizontal render run. This keeps cutaway presentation continuous across openings instead of lowering isolated wall fragments.

The render canvas includes configurable per-side breathing room from `SiteConfig.mapRendering.canvasPaddingCells`, initially one 32 px cell on every side. When walls are enabled, the north inset additionally includes the tallest wall construction used by the map. Layers begin at the left/top inset, so walls on row zero remain inside the canvas. Gameplay coordinates, grid bounds, rooms, pathfinding, and authored object positions remain unchanged; camera, pointer, lighting, culling, particle, and offscreen-indicator projections translate through the render insets.

Generated run ids are diagnostic only. Paint and attachments must not persist against them because extending or splitting a wall changes run boundaries.

## 6. Spritesheet contract

### 6.1 Frame size

For the prototype:

```text
cell width       = 32 px
full height (H)  = 160 px
stub height (S)  = 28 px
mask columns     = 16 initially
```

Each structural connection frame is therefore 32 × 160 px: one map cell wide and five cells high.

The frame canvas includes transparent space where necessary. Every frame uses the same baseline and anchor so changing masks never makes a wall jump.

### 6.2 Construction sheet

One construction sheet contains the non-paintable structure: top thickness, posts, caps, corners, junction seams, and outlines.

Canonical initial packing:

```text
width  = 16 masks × 32 px = 512 px

y = 0                  full frames, 16 columns, each 32 × H
y = H                  stub frames, 16 columns, each 32 × S
```

Column index is obtained through the construction definition’s `maskMap`. The initial identity map is `[0, 1, …, 15]`.

The prototype assigns distinct `debugMaskColors` and `debugMaskLabels` entries to every mask column. This intentionally colors exposed structural top pixels so atlas columns and runtime junctions can be identified during the experimental phase. Face finishes still cover the wall body.

Each construction frame is self-contained: fill, cap, and outline pixels live together in its full or stub row. There is no separate outline band. Finish art is responsible for remaining inside the construction outline.

Seam requirements:

- straight-frame left and right edges match pixel-for-pixel
- vertical-frame top and bottom continuation points match
- every frame shares one ground/base line
- caps meet the repeatable body without a color or one-pixel alignment jump
- the top thickness aligns across straights, corners, and junctions
- transparent padding prevents adjacent-atlas bleed

### 6.3 Face-finish sheet

A finish sheet contains only paintable surface pixels. Everything outside the relevant face plane and structural outline is transparent.

Finish sheets use the same 16 mask columns and full/stub rows as construction sheets. This provides explicit isolated, end, corner, T-junction, cross, horizontal, and vertical tiles for every paint or wallpaper material. A finish column must share the construction column's clipped footprint; one-sided corners cannot paint through their empty half.

Pure vertical columns remain transparent because vertical walls use construction color. A one-sided corner or end inherits the visible finish from its connected horizontal neighbor unless that corner has an explicit face override. This carries room wallpaper into the turning tile without projecting wallpaper onto the vertical run.

A paint color or wallpaper pattern is a finish material, not a new construction sheet. Runtime customization remains a face `materialId` swap, while the mask selects the correct corner or junction artwork within that material.

### 6.4 Layer order

Within a generated wall piece:

```text
self-contained construction frame
  → inset north/south finish overlay
    → transparent runtime door/window cutout
      → attached decorations
```

Do not bake paint into the structural mask unless the construction genuinely cannot be separated from its finish.

## 7. Visibility and cutaway rules

The camera is fixed with north at screen-back and south at screen-front.

### Walls up

- Full construction and the visible face finishes render.
- North/back walls show the room-facing south surface.
- South/front walls show the south-facing exterior or adjacent-room surface. Their north-facing interior finish exists in data but is hidden from this camera.
- East/west side walls remain full height.

### Walls down

- Every wall uses its stub band.
- Collision, LOS, openings, room membership, sockets, and attachments remain unchanged.

### Cutaway

- Only the active Myte’s obscuring south/front room-boundary segments collapse to stubs or hide according to the selected presentation.
- The active room is a committed, debounced state. Live membership cannot lower an adjacent room during the transition window.
- A front boundary lowers only while the Myte is both in that room and physically behind the wall baseline.
- The active Myte's collider must overlap that specific segment horizontally; being elsewhere in the same room does not lower an unrelated wall run.
- North/back walls remain full height.
- East/west side walls remain full height and use construction color only; paint and wallpaper are not projected onto their narrow profile.
- The front segment owns its own end caps. A side-wall corner/post remains with the side segment when the front segment cuts away.
- Decorations attached to a hidden/collapsed face hide or reposition with that owning face.
- While a door or window is being moved, every generated wall is temporarily rendered at full height. Completing or cancelling placement restores the selected presentation without hiding the opening object.
- Room/cell transitions must remain stable for 180 ms before changing the cutaway.
- Maps without authored rooms never proximity-hide walls. Cutaway changes only when the active Myte enters or leaves a room.
- Re-evaluate on active-room changes, wall edits, or meaningful camera changes—not every frame.

This side-wall rule intentionally supersedes the July audit’s proposal to hide some east/west segments south of the subject. It produces a more stable dollhouse silhouette. The accepted tradeoff is that a Myte may be partially obscured while close to a side wall; depth-safe side segmentation keeps that occlusion locally correct.

## 8. Materials and persistence

Planned `data/map-objects/wall-materials.json` shape:

```jsonc
{
  "schemaVersion": 2,
  "constructions": {
    "plaster_wall": {
      "sheet": "images/walls/construction-plaster.png",
      "cellSize": 32,
      "height": 160,
      "stubHeight": 28,
      "maskMap": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
    }
  },
  "finishes": {
    "plaster_plain": {
      "sheet": "images/walls/finish-plaster-plain.png",
      "maskMap": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
      "bands": {
        "full": { "baseY": 0 },
        "stub": { "baseY": 160 }
      }
    }
  }
}
```

Exact atlas offsets remain data. Renderer code must not hard-code them.

Persist customization against map geometry and face:

```jsonc
{
  "mapId": "House",
  "axis": "horizontal",
  "cells": { "from": [4, 8], "to": [9, 8] },
  "face": "north",
  "finishId": "wallpaper_blue_flower"
}
```

Cell/range keys survive run merging, splitting, and regeneration. On load, `WallBuilder` intersects overrides with newly generated segments.

Wall-state payload version 4 persists opening records as well as presentation, face finishes, and attachments, so moved doors and windows recreate their sockets and cutouts on reload. Version 3 made room-authored finishes canonical after the prototype's short demonstration overrides; older experimental face overrides are discarded once during migration.

## 9. Wall attachments

Every generated face exposes a surface socket through the existing `SocketSet`/`AttachmentSystem` contract:

- `surfacePoint.u` is distance along the face.
- `surfacePoint.v` is normalized height on the face.
- The attached object reserves a `u0..u1` interval based on its width.
- Overlapping intervals are rejected.
- Doors/windows pre-reserve their opening intervals.
- Attachment serialization uses the map cell range, face, socket id, and child id—not a transient run id.
- Paintings, shelves, and similar objects inherit visibility from the owning face.

No wall-specific attachment API should be introduced.

## 10. DOM and performance budget

The measured pre-wall baseline is recorded in the remaining architecture audit. The initial wall allowance is **no more than 300 additional DOM nodes on FieldTest-sized maps**, including face overlays and attachments. Revisit the budget only with a recorded profile.

Cost controls:

- merge horizontal straight centers
- segment vertical walls only as finely as depth correctness requires
- no per-wall tick/update
- mode changes are container class/data changes plus event-driven cutaway evaluation
- no per-frame connectivity or room-boundary rebuilding
- cull generated pieces using the existing map visibility strategy if large maps require it

## 11. Required implementation order

1. Add wall registry/schema validation and one placeholder construction/finish set.
2. Parse `Wall` Wang-set tiles from the marked wall tileset across all tile layers and compute raw masks.
3. Generate structural pieces and depth-safe horizontal/vertical segments.
4. Mark wall base cells for collision and LOS without coupling either to rendering.
5. Render independent face finishes.
6. Add walls-up, walls-down, and cutaway controls.
7. Add transparent opening cutouts and verify doors/windows.
8. Add cell-range face overrides and persistence.
9. Add face sockets, interval reservations, and a painting fixture.
10. Add editor parity in the same schema-changing commits.

## 12. Acceptance checklist

- Walls are 160 px/five cells high by default, one tile taller than door apertures.
- The canvas reserves the full wall height plus configurable one-cell breathing room around the map without expanding or shifting gameplay bounds.
- Every 0–15 neighbor mask has an intentional structural result.
- Tiled preview and runtime connectivity agree.
- Horizontal seams, vertical continuation, corners, T-junctions, crosses, and cutout edges are pixel-clean.
- Inside/outside/shared-room face assignment follows adjacent room membership.
- North/back interiors and south/front exteriors display as specified.
- Side walls remain visible in cutaway and depth-sort locally correctly.
- Walls-down/cutaway do not change grid bytes, LOS, room membership, or door topology.
- Paint survives map reload and wall regeneration.
- House assigns `wallpaper_blue_flower` to the Bedroom room while neighboring rooms retain `plaster_plain`.
- A painting uses the generic attachment API, rejects overlap, persists, and hides with its face.
- Window gaps affect rendering and LOS without corrupting room topology.
- Doors and windows are movable objects; valid wall drops move the cutout, invalid/off-wall drops return to the original occupied socket, and the result persists.
- Hallways and roomless areas do not lower adjacent rooms, and the 180 ms committed-room debounce prevents one-pixel boundary flicker.
- Generated elements remain within the +300-node wall budget.
- The busiest map maintains the established frame/long-task thresholds.
