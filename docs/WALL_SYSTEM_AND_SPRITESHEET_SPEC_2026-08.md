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

### 3.1.1 Layer convention

The loader is permissive on purpose — it finds wall cells by tileset marker and Wang-set membership, so walls work from any layer, under any name, with no properties at all. That permissiveness is a loading rule, not an authoring one. Maps drifted under it: two test maps kept their walls on a layer named `Collider`, and `Outside` had a `Walls` layer that declared nothing and so silently inherited `SiteConfig`'s plaster defaults. Nothing broke; it just stopped being possible to tell from the map file what the walls were made of.

The convention, enforced by `node scripts/validate-maps.js`:

1. **Wall tiles get their own layer.** Never mixed in with colliders or floors. This is the one rule with teeth: `WallTiledExporter` rewrites a wall layer in full, so a foreign tile on that layer only survives because the exporter goes looking for it and carries it across. The validator reports mixing as an error; everything else is a warning.
2. **The layer is named `Walls`**, or `Walls <construction>` when a map genuinely needs more than one.
3. **It declares all four material properties explicitly** — `wallConstructionId`, `wallFinishId`, `wallHeightCells`, `wallConnectGroup` — plus `blocksLineOfSight`, even where the value matches the default. Inheriting silently is how `Outside` ended up plastered.
4. **It sits last among the tile layers**, after the floors, so Tiled's stacking previews what the game draws.
5. **Per-room paint belongs on the Room object**, not on a second wall layer. A room's `wallFinishId` (see `House.tmx`) repaints every face bordering it. Split the layer only when the *construction*, *height* or *connect group* differ — splitting on finish alone produces layers that duplicate what the room graph already says.

Material lives on the layer because it cannot live on the tile: tile properties belong to the tileset, so every cell painted with a given Wang tile would be forced to share them. The layer is the only place in a `.tmx` where per-cell material can vary, which is why the exporter groups cells by material tuple and emits one layer per group.

### 3.1.2 Rooms and zones are one rectangle

A **room volume** (`Rooms` group, object named `Room`, carrying `roomId`) is the spatial unit: lighting, floor and wall finishes, the room graph, room naming. A **zone** is a gameplay affordance — the `rest`/`play`/`food`/`social` type the AI seeks out.

In every map these described the same rectangle, authored twice, and the two copies drifted: House's kitchen zone sat one pixel off its own kitchen room, because room bounds are snapped to the grid on load and zone bounds are not. Its Zone objects also carried `floorFinishId`/`wallFinishId` that nothing ever read — those are only consulted on room volumes.

A room volume that declares **`zoneType`** now emits the gameplay zone as well, from the one rectangle:

```xml
<object id="126" name="Room" x="32" y="32" width="448" height="416">
 <properties>
  <property name="roomId" value="zone_kitchen"/>
  <property name="displayName" value="Kitchen"/>
  <property name="zoneType" value="food"/>
  <property name="floorFinishId" value="floor_tile_check"/>
 </properties>
</object>
```

**Rooms and zones are independent.** All four combinations are legal and all four are in use:

| | has a zone | no zone |
|---|---|---|
| **has a room** | `Room` + `zoneType` — House's bedroom, kitchen, playroom, chatroom | `Room` alone — House's hallway, DoorTest's two rooms, RegionTest's L room |
| **no room** | `Zone` alone — Forest's clearing, Outside's lake and chatroom | neither — FieldTest |

A room with no `zoneType` is a space with lighting and finishes that a Myte has no reason to seek out; a hallway is passed through, not visited. A standalone `Zone` is a gameplay affordance in open air — giving Forest's clearing a room volume would invent a lighting volume where none belongs. Merge the two only when one rectangle genuinely describes both, which is precisely the case that used to be authored twice.

`zoneType` is the property name in both forms. Standalone `Zone` objects also still accept the older `type` spelling. When a room emits a zone the two share an id — they are the same space, and one identity is what stops the halves drifting apart again.

`LIGHTVOLUME` is still accepted as an object name but is a lighting-era spelling of `Room`; the shipped maps have been renamed.

**Zone types come in two categories**, both catalogued in `data/metadata/zones.json` and both authored the same way:

- **`stat`** — `rest`, `play`, `food`, `social`, `danger`, `boost`. Applies its `effects` block to a Myte standing inside, per tick.
- **`ambient`** — `water_lake`, `water_river`. A spatial tag with no effect on a Myte at all; other systems query it by type. The water zones tell the audio system it is standing by a lake rather than a river, which the fallback tile scan cannot distinguish. They carry no `effects` key, so the per-tick apply path short-circuits.

`node scripts/validate-maps.js` fails on a `zoneType` that is not in the catalogue. An unregistered type is not a crash — the zone loads, and can still be found by type — it simply does nothing, which is what makes a typo there expensive to spot.

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

The cleared rectangle must span the whole depth the art occupies, not just down to the baseline. A wall running **south** draws past its own baseline into the next cell footprint, and an opening that reaches the floor passes through that stretch too — clearing only to the baseline leaves a sliver of wall hanging under every cell of a doorway in a north-south wall. An opening with a sill keeps the baseline, because the wall beneath a window is solid.

Where an opening removes the whole of a neighbouring cell at the height being drawn, the wall genuinely **ends** there, so it is drawn as a free end rather than sliced off square: `renderMask` drops the arm pointing into the opening and the existing free-end frame does the rest. No jamb sprite is authored, and nothing is drawn outside the cell — an end cap added alongside the cut would have overlapped the door.

This is height-dependent, and that is the point. A 128px doorway in a 160px wall leaves a lintel, so at full height the arm stays and the wall carries on overhead; lowered to a 28px stub the same doorway removes the neighbour completely and the end is real. It is render-only: connectivity, collision and line of sight all still use the cell's own mask.

### 3.3 Authored wall fixtures

Wall objects are authored on an object layer, not painted visually above the wall tiles. Tiled's top-down canvas identifies the host wall cell; semantic properties identify the position on the vertical face.

- Set the object name/type to a registered wall-object type such as `Painting`, `Window`, or `Door`.
- Place its object rectangle over the wall footprint cells it belongs to. Do not compensate for the runtime wall's projected height by moving the object north in Tiled.
- A painting uses `face=south`, pixel distance `u` along the host wall run, normalized vertical center `v` from `0` at the face top to `1` at the wall foot, and its inventory/map-object `variant`.
- A door or window rectangle covers its complete wall-cell footprint. `openingHeight`, `sillHeight`, `continuesTopTrim`, direction/variant, and `wallOpening=true` describe its aperture.
- A future registered fixture type may use `wallFixture=true`; it follows the same `face`/`u`/`v` contract.

The loader resolves the owning generated wall from these semantic values. Tiled therefore previews the footprint and object identity, while the runtime/debug view is authoritative for the projected face height and final art alignment.

### 3.4 Round-tripping in-game walls back to Tiled

Walls only ever flowed one way. Tiled painted them, the loader reduced them to cells, and anything built in Build Mode lived as a delta in the player's save that the map file knew nothing about.

`WallTiledExporter` closes the loop. In Build Mode on a local host, **To Tiled** writes the walls currently standing on the map back into the `.tmx` it was loaded from.

- It **patches, never regenerates**: the document is parsed, the wall layers and wall objects are replaced, and every other layer, object, property and attribute is returned untouched. Regenerating from what the runtime models would discard every hand-authored floor layer on the first export.
- Which layers are wall layers is **not a heuristic** — every authored cell records `sourceLayerId`, so the set is exact.
- Objects are **updated in place** by id, so authored properties the wall system never reads (variant, custom flags) survive. Records with no element are appended using the map's `nextobjectid`; elements whose record is gone are removed.
- The **mask ↔ Wang tile mapping is a bijection** over masks 1–15. The `Wall` set is `type="edge"`, so wangid slots 0/2/4/6 are N/E/S/W and line up with the mask bits in §4. Mask 0 — an isolated cell with no wall neighbour — has no Wang tile and cannot have one; it is written with `SiteConfig.wallSystem.wangIsolatedFallbackMask` and reported as a warning. Tiled cannot paint one either.
- **Bridged cells are not written.** A doorway is usually drawn as a gap in the tile layer with the door object supplying the aperture; the runtime then bridges that gap with cells of its own to keep the run structurally connected. Those carry `bridged: true` and are skipped, so the author's gap survives. The bridge is rebuilt from the opening on the next load either way.
- **Masks are computed within the exported set**, not from the runtime cells — otherwise the wall beside a doorway would be written as connected and Tiled would preview a wall running on into empty space. The runtime never reads the tile back; it recomputes the mask from cell adjacency on load.
- **Authored rectangles are never resized.** An object's rectangle is art — a window is drawn elevated, a painting is the size of its picture — and the runtime models cells plus `u`/`v`, not art. Where the footprint derived from the rectangle disagrees with the runtime's, the export warns and leaves the rectangle alone.
- Writes go through `editor/api/save-map.php`, which is local-only, allowlisted to existing maps in `data/maps`, guarded by a SHA-256 check against the bytes the client patched, backed up under `data/maps/_backup/`, and written atomically. A map edited in Tiled since load returns `409 conflict` rather than overwriting it.
- On success the **save is re-baselined**: the builder's authored baseline moves to match the file, so `serializeCellDeltas` goes empty and no stale `removed: true` can resurrect to delete a wall that was just authored.

Exporting twice in a row is byte-identical: the second run is a no-op.

The same mask→tile mapping drives the `hidden` presentation, which now draws live from the wall cells rather than from a PNG baked at load. The baked version was a photograph of the map file: walls built in game never appeared in it, and walls torn down in game went on being drawn forever.

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

The render canvas includes configurable per-side breathing room from `SiteConfig.mapRendering.canvasPaddingCells`, initially one 32 px cell on every side. When walls are enabled, the north inset additionally includes the tallest wall construction used by the map. Layers begin at the left/top inset, so walls on row zero remain inside the canvas. Gameplay coordinates, grid bounds, rooms, pathfinding, and authored object positions remain unchanged; camera, pointer, lighting, culling, particle, and offscreen-indicator projections translate through the render insets. Debug mode extends a distinct dashed guide grid through this render-only padding without representing those guide cells as walkable map space.

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

Superseded by schema v3. A finish no longer carries per-mask frames: the construction's silhouette is the only copy of the wall's geometry, and the registry derives a paint mask from it as "every opaque pixel that is not `capColor`", then clips the finish to that. A finish that had to match the construction pixel-for-pixel across 16 masks × 2 bands cost 32 authored frames per paint; it now costs three columns, plus two optional ones.

A finish authors **`cellSize`-wide, `frameHeight`-tall columns** on the shared `paintSheet` — `west`, `body`, `east`, plus optional `westStop`/`eastStop` — each drawn at `y = 0`, so a swatch row is a frame row and nothing extrapolates a region the artist did not draw (including the stretch below the baseline, where a wall carries on south).

The `body` column tiles along a run. An **end column** takes over on its half of a cell wherever the wall's silhouette genuinely runs out. End columns are not about the rounded outline — the mask already enforces that — they are where the finish states how *its own horizontal structure* resolves at a free end: a skirting returns around the foot, a dado tapers, a plain paint does nothing. The engine must not infer this; a bottom band is not necessarily a skirting. An end column must match the body pixel-for-pixel away from its free edge, since a cell can terminate on one side and continue on the other.

Pure vertical cells stay unpainted because vertical walls use construction color. Where one horizontal arm meets a wall running **south** out of the same cell, that south wall occupies the armless half, so paint stops at the post and two room finishes meet on neutral ground.

That stop applies only to a south arm. A **north** arm sits behind the face and interrupts nothing, so a cell with one horizontal arm and no south arm is an ordinary free end: paint runs out to the silhouette's own rounded edge. Those are the building's front corners — treating them as posts left the band inset by a full wall thickness, short of the corner it should wrap.

At a stop the silhouette does not end — it rounds **downward** into the south wall, by the same `4 2 1 1` a free end climbs. The free-end columns are therefore the wrong art in both directions: they curve up where the geometry curves down. The finish uses `westStop`/`eastStop`, authored against that dive (read unclamped off the E+S and S+W elbows) and at the position they are used, so they need no shifting. A finish that omits them falls back to `body`, which leaves the band flat and strands construction colour between it and the foot. `paintRegion` reports each side as a `{column, offset}` pair, or `null` where the finish carries on into the next cell.

Five columns per finish, then: `body`, two that curve up for free ends, two that curve down for stops.

**Transparency rule (finish columns).** A finish column is opaque from row 0 down to *that column's own foot*, and transparent everywhere else. Two consequences, both of which have been got wrong:

- A column with no wall in it — the nine pixels west of a `west` column's free edge, everything east of an `east` column's — stays **empty**. Do not fill it on the grounds that the paint mask clips it anyway.
- Nothing is drawn **below** the foot. That stretch belongs to the cell south of this one, which paints its own face over it.

Runtime clipping hides a violation of either rule, so it survives testing and surfaces later as a stray edge — when the art is hand-authored, reused at an offset, or drawn somewhere the mask happens not to cover. `generate-wall-sprites.js` encodes this: `footProfile` returns `-1` for a column with no wall, and `paintColumn` skips it.

**These invariants are enforced, not just described.** `validate-content-data.js` decodes the paint sheet and the construction sheet and asserts, per pixel column: that a finish column's foot matches the silhouette it is authored against (`west`←mask 2, `body`←10, `east`←8, `westStop`←6, `eastStop`←12 — the same pairing the generator uses); that a column with no wall in it is empty; that the declared `palette.band` colour is the bottom-most pixel, so the band follows the foot wherever it curves; and that an end column matches `body` wherever their feet agree, so it cannot step mid-run. Each of those is a bug that shipped at least once, and every one of them is invisible at runtime because the paint mask clips the evidence.

A finish with no art of its own declares `template` plus `color`, and inherits the template's columns recolored by exact-match palette substitution. Slots named in `palette` map through `color`/`baseboard`/`accent`; unnamed slots keep the template's per-channel offset from its own body tone, so patterns hold their contrast. This exists so a color-only paint is not the one finish that cannot resolve at an end.

A paint color or wallpaper pattern is a finish material, not a new construction sheet. Runtime customization remains a face `materialId` swap.

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

- Horizontal/front-facing wall runs use their stub band. Vertical/side boundary walls remain full height so the room keeps a stable dollhouse silhouette.
- The horizontal cell beside a tall structural end, corner, height change, or side wall uses the authored one-cell stepped transition between full height and the stub. The stepped profile is intentional pixel art and must not be replaced by a diagonal slope. The side-wall cell itself does not cut away.
- A pure horizontal end cap may join a lowered run of any length. It does not need its own adjacent transition; the run only needs one valid transition somewhere before it meets full-height structure. A completely lowered freestanding run retains one full-height anchor and transition, allowing the opposite end cap to remain a stub.
- A transition is valid only when its lowered edge directly touches a stub and its raised edge touches a full-height cell. Paint and room-face seams do not create structural cutaway boundaries, neighboring canvases commit from one height-field snapshot, and two transition tiles must never sit directly beside one another.
- While a wall object is placed or dragged, its complete candidate span plus cutaway padding stays stubbed. Transitions are pushed outside that protected span so they never draw behind a painting, window, or other wall object.
- A finish/material seam is not a structural end. Cutaway state and ramps continue across separate render pieces at that seam, with each piece retaining its own finish; changing wall color never creates an abrupt height step.
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
- A mounted map object keeps its canonical wall-face position while presentation changes; cutaway visibility must never resize its logical attachment surface or move it for a frame.
- While a wall object is being moved, only its candidate host cells temporarily rise. Completing or cancelling placement restores the selected presentation.
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

Runtime build state is version 8 and persists explicit paint on physical
half-face atoms:

```jsonc
{
  "x": 4,
  "y": 8,
  "face": "south",
  "half": 0,
  "finishId": "wallpaper_blue_flower"
}
```

The canonical key is `x,y/face/half`. Atom identity survives run merging,
splitting, and regeneration because render pieces are derived and have no
persistent identity. An explicit atom finish wins over the adjacent room's
`wallFinishId`, then the building's `exteriorFinishId`, then the construction
default. Whole-room and whole-building paint update those defaults and remove
the explicit atoms they supersede.

`BuildDocument` owns level-scoped wall, atom, room, opening, fixture, and
attachment stores and serializes generic deltas over the authored Tiled
baseline. `WallTiledExporter` reads those stores; it converts atoms back to
`WallFinishOverride` objects only as a Tiled interchange format. Payloads from
version 7 or earlier are reset to the authored baseline rather than migrated.
Moved walls translate their atoms and attachment records in the same build
transaction, so sockets, cutouts, and paint remain aligned after reload.

## 9. Wall attachments

Every generated face exposes a surface socket through the existing `SocketSet`/`AttachmentSystem` contract:

- `surfacePoint.u` is distance along the face.
- `surfacePoint.v` is normalized height on the face.
- The attached object reserves a `u0..u1` interval based on its width.
- Overlapping intervals are rejected.
- Doors/windows pre-reserve their opening intervals.
- Attachment serialization uses the map cell range, face, socket id, and child id—not a transient run id.
- Paintings, openings, shelves, and similar wall objects sort one depth step in front of their owning wall. Dragged wall objects use the shared dragged-object layer and remain visible even when cutaway is disabled.

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
- Tall side walls blend into lowered horizontal walls with one-cell ramps, including where adjacent render pieces use different face finishes.
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
