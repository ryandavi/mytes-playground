# Build Surface Model Refactor Plan — September 2026

**Status:** in progress, revised 2026-09-03, amended 2026-09-04 (§13a)
**Scope:** build-mode structure, wall paint, floor ownership, room/building identity, persistence, undo, module boundaries, render budget
**Supersedes:** room-scoped wall-face overrides; corrective multi-pass floor bleed; auto-room delete-and-recreate; `WallBuilder` as the home of everything wall-shaped
**Keeps:** wall art, the cutaway state machine, openings/fixtures behaviour, Tiled as the authoring path, the Win98–XP UI language
**Builds on:** `BUILD_MODE_UX_AND_ROOFING_PLAN_2026-08.md` §4 (building topology seams), `WALL_IMPROVEMENT_PLAN_2026-08.md` (cutaway v2), `FLOOR_FINISHES_2026-08.md`

## 0. How to read this document

Sections 1–5 are the model. Section 6 is the module map the code must end up in. Section 7 is the render budget. Sections 8–10 cover UI, forward seams and persistence. Section 11 is verification, and section 12 is the work-package breakdown with owners. Section 13 lists the questions this revision has already answered so reviewers do not reopen them, and section 14 records the answers Ryan gave on 2026-09-03.

The rule that generated every decision here: **persist intent, derive everything else, and derive it once from one lattice.**

## 1. Decision

A wall tile is structural geometry, not one paint surface, and a floor tile is not one owner.

Both systems resolve on the same **half-cell block lattice** (2×2 blocks per map cell). Where two rooms meet inside one wall tile, the visible wall face splits at the half-tile line and each half is independently paintable. Floor ownership is resolved on the same lattice, so wall paint and floor ownership always agree about where a room boundary passes through a tile. In the reference case, the finish boundary follows the marked vertical line: the left half belongs to the left wall section and the right half to the right.

The lattice is the *only* place topology enters either system. Wall face ownership is a lookup on the floor ownership grid, not a separate walk through masks.

## 2. Why the current model must be replaced

**Paint identity is transient.** Paint persists against a cell range, a face, and a derived room ID (`faceOverrides`). Rooms are removed and recreated on every wall change (`RoomEnclosureDetector.detect`), so a valid structural edit can change the identity attached to an unchanged painted wall. The record is present but stops matching, which reads as lost paint. `adoptLegacyFaceOverrideRooms`, `promoteLegacyRoomPaint`, `retargetFaceOverrides`, `captureMovePaintExtensions` and `restoreRooms` all exist to repair that mismatch after the fact.

**Floor ownership is a stack of repairs.** `FloorBuilder.computeOwnership` seeds from `innermostAt`, then `splitOpenWallGaps`, then `fillWallBoundOpenSpaces`, then a bleed round mixing `claimWallBlock` (face-based), `claimBlock` (geometric), terminal/corner exceptions and `settleClaim`. Each later pass corrects an approximation of an earlier one. Every new corner rule can disturb a case another pass previously fixed. The last commit added 527 lines here and is described as "still buggy".

**Wall face resolution duplicates the floor question.** `assignFaces`, `findFaceRoom`, `resolveBandFace`, `preferredHorizontalRoomSide`, `resolveRunBandSurface`, `resolveBandSurface`, `bandNeighbourRoom` and `claimWallBlock` are eight answers to "which room is beside this bit of wall". They disagree at junctions, which is exactly where the bugs live.

**One class owns everything.** `WallBuilder.js` is 3,945 lines: structure, masks, faces, paint resolution, piece generation, canvas rendering, the cutaway state machine, openings, fixtures, placement validation, moves, persistence and the flat overlay. Nothing in it is unit-testable because everything reaches through `gameMap`. Any refactor that does not split it will be re-absorbed by it.

**One gesture rebuilds several times.** A wall stroke runs `setWallCell → rebuild`, then `WALL_GEOMETRY_CHANGED → detect → refreshRoomFaces → rebuild → floorBuilder.build → restoreRooms → setRoomFinish → lighting → ROOMS_CHANGED → BuildingTopology.rebuild → panels`. That is at least two full wall rebuilds and one full floor rebuild per gesture, and the intermediate states are observable by every listener.

These are five forms of one architectural issue: transient topology is used as persistent identity, and the derivation is spread across passes and classes instead of being one function.

## 3. Invariants

### 3.1 Wall paint

- Section paint belongs to a physical wall-face **atom**, never to a room ID.
- A horizontal face (`north`/`south`) has two atoms per cell: half `0` (west) and half `1` (east).
- A vertical face (`west`/`east`) has two atoms per cell: half `0` (north) and half `1` (south).
- A room boundary may split the paint within one structural cell.
- Joining or separating wall runs changes selection grouping only. Atom identity and paint are untouched.
- Removing a wall deletes atoms only for the removed cells.
- Moving a wall translates its atoms with it.
- Extending a wall by pulling creates atoms for the new cells and copies finishes from the anchored end's atoms, face for face. Drawing a new wall never inherits atom paint; room and building **defaults** (§4.5) supply its colour.
- Both faces of a horizontal wall are persisted and paintable even though only one is visible at full height (§4.10).

### 3.2 Floors

- Every block has at most one owner. Ownership is a single pure function of (wall snapshot, seed cells, priorities, reach).
- A room reaches `reach` blocks (default 1, i.e. half a cell) beyond its seed cells, in every direction, through open ground and under masonry alike, and stops at a wall's centreline.
- Two regions that meet divide blocks at the shared half-tile boundary. Straight reach beats diagonal reach; then explicit priority; never draw order.
- Walls conceal floor; they do not own it. There is no second ownership system for wall cells.
- Doorways, gaps, end caps, T junctions, crossings, incomplete enclosures and corridors all use the same resolver. Special topology enters only as *inputs* (fences, thresholds), never as post-passes.

### 3.3 Rooms

- `RoomPlan` is stable authored intent: id, name, room type, seed cells, floor finish, default wall finish, parent building. It is the floor region. There is no separate "floor region" record.
- `RoomTopology` is derived: enclosure, indoor/outdoor, adjacency, open spaces, exterior loops, cutaway membership, labels.
- Topology may *propose* seed cells for unowned ground (§4.9). It never reassigns cells a plan already owns, never deletes a plan, and never changes a plan's finishes or names.
- The `RegionManager` `'room'` layer becomes a projection of plans plus topology, so lighting, AI, zones and the cutaway keep their current API.

### 3.4 Buildings and hierarchy

- `BuildingPlan` is a stable, named parent. Connectivity is a diagnostic; the plan is the identity.
- Every wall cell carries `buildingId`; every indoor room plan carries `buildingId`. Fences never do.
- Drawing from an existing building inherits its id; an isolated structure creates a new plan. Joining two named buildings is an explicit merge with the selected building as survivor; undo restores both. Splitting geometry never splits the plan; **Separate building** is a command.
- Hallways are rooms. Outdoor areas are plans under the Site, not under a building, unless assigned.
- Names are persisted properties and are always visible in the build UI.

### 3.5 History

- One gesture, one transaction, one undo entry, one rebuild of each derived structure, one committed event.
- Undo and redo replay stored forward/inverse **store deltas**. They never infer the previous state from the new topology.
- Paint, structure, room-cell and building edits share one chronological stack.

### 3.6 Code structure

- Resolvers are pure: plain data in, plain data out, no `gameMap`, no DOM, no `SiteConfig` reads (config is passed in). They load in Node.
- No file over 800 lines; no pure resolver over 300.
- Persistent stores are the only mutable state. Everything else is a cache keyed by a revision number.
- Nothing new lands in `WallBuilder.js`. Work on it is extraction and deletion only.

### 3.7 Performance

Per build gesture: ≤1 wall geometry rebuild, ≤1 ownership solve, ≤1 topology rebuild, floor repaint limited to dirty chunks, wall repaint limited to dirty pieces. Per pointer move: zero `getImageData` calls. Cutaway tick cost unchanged. `__build.stats()` reports the counters (§7.6).

## 4. Data model

### 4.1 Stores and level scoping

Five persistent stores, all keyed by plain strings, all serialised as a delta over the authored baseline (§10):

| Store | Key | Record |
|---|---|---|
| `BuildingPlanStore` | `buildingId` | §4.2 |
| `RoomPlanStore` | `roomId` | §4.3 |
| `WallCellStore` | `x,y` | §4.4 |
| `WallSurfaceAtomStore` | `x,y/face/half` | §4.5 |
| attachments (openings, fixtures, decorations) | record id | §4.6 |

Levels are handled by **scoping the stores**, not by putting `levelId` into every key:

```js
document.levels = {
    level_ground: { walls, atoms, rooms, openings, fixtures, attachments }
};
document.buildings = { ... };   // buildings span levels
```

`level_ground` is the only level created, and no level UI is shown. This gives roofs, ceilings, stairs and stacked rooms a home without paying for `levelId` in every key, comparison and fixture today. Map-space coordinates stay two-dimensional inside a level; conversion to render height belongs to the level and construction data.

Address helpers live in one file, `BuildKeys`, and nothing else formats or parses keys:

```js
BuildKeys.cell(x, y)                 // 'x,y'
BuildKeys.block(bx, by)              // 'bx,by'
BuildKeys.atom(x, y, face, half)     // 'x,y/south/0'
BuildKeys.parseAtom(key)
BuildKeys.blocksOfCell(x, y)         // the four block coords
BuildKeys.lookBlock(x, y, face, half) // the block an atom faces (§4.8)
```

### 4.2 Building plans

```js
{
    id,
    displayName,
    authoredDisplayName,
    exteriorFinishId,      // default for exterior atoms with no explicit paint
    properties
}
```

Wall membership has one source of truth: `WallCell.buildingId`. Room membership: `RoomPlan.buildingId`. Both are indexed at runtime; neither list is duplicated in the save. The Site is the implicit root and owns outdoor areas, fences, terrain and unassigned objects.

### 4.3 Room plans

```js
{
    id,
    buildingId,            // null for outdoor areas
    displayName,
    authoredDisplayName,
    roomType,
    origin: 'authored' | 'detected' | 'painted',
    seedCells: ['x,y', ...],
    floorFinishId,
    wallFinishId,          // default for atoms facing this room
    priority,              // optional explicit tie-break; default derived (§4.7)
    properties             // lighting etc., unchanged
}
```

`seedCells` are full cells the plan stands on outright. They come from three sources and are stored identically: the authored Tiled rectangle (minus walls and thresholds), player painting (`RoomPanel`, today's `RoomAssignments`), and topology proposals for newly enclosed unowned ground. `RoomAssignments` is deleted; its cells become `seedCells` of the plan they named.

A plan can have zero seed cells (walled over, painted away). It stays in the store, appears in the Navigator with a warning, and painting cells back brings it back. Nothing deletes a plan except the player.

### 4.4 Structural walls

```js
{ x, y, constructionId, heightCells, connectGroup, buildingId, bridged?, opening? }
```

`WallCell.finishId` is removed; the construction's default finish comes from the registry and per-face colour from atoms and defaults. Masks, runs, pieces, thresholds, cutaway runs and labels are derived by `WallGeometry` from a snapshot of this store.

### 4.5 Atomic wall surfaces

```js
{ x, y, face: 'north'|'south'|'west'|'east', half: 0|1, finishId }
```

Key: `x,y/face/half`. Room IDs are deliberately absent. Only atoms with an explicit `finishId` are stored; unpainted atoms do not exist as records.

**Finish resolution for an atom**, in order:

1. the atom's explicit `finishId`;
2. the facing plan's `wallFinishId` (interior) or the owning building's `exteriorFinishId` (exterior);
3. the construction's default finish.

Step 2 is what keeps "new walls in a green room come up green" without any inheritance machinery, and it follows the *room*, which is what the player means by painting a room. Step 1 is what makes accents physical, which is what the player means by painting a section.

**Paint scopes are commands over stores**, resolved at click time and not stored as rules:

| Scope | Writes |
|---|---|
| Section | the atoms in the current contiguous visible section |
| Room (whole interior) | `RoomPlan.wallFinishId`; deletes explicit atoms facing that plan |
| Space (open-plan) | Room, for every plan in the open space |
| Exterior (building) | `BuildingPlan.exteriorFinishId`; deletes explicit exterior atoms of that building |

Renderers may batch adjacent atoms with equal resolved finish into one draw. Batches are caches.

### 4.6 Attachments

Openings, fixtures and decorations key on the same face address as atoms: `{ cells, face, u, v }` for fixtures, `{ cells, axis }` for openings. A move translates atoms and attachments in one step (`translateWallContents` already does this; it becomes a transaction step). This is the seam roofs and trim will use.

### 4.7 Floor ownership resolver

`FloorOwnershipResolver.solve(input) → FloorOwnershipGrid` is one pure function. It replaces `computeOwnership`, `splitOpenWallGaps`, `fillWallBoundOpenSpaces`, `claimWallBlock`, `claimBlock`, `settleClaim`, the terminal/corner sets, and `RoomEnclosureDetector.pickAuthoredRoom` as used by floors.

**Input**

```js
{
    width, height,                        // cells
    walls: Map<'x,y', { mask }>,          // from WallGeometry; openings are wall cells
    expandCells: ['x,y', ...],            // extra cells expansion may enter: geometry.thresholds
    plans: [{ id, seedCells, priority }], // seed cells never include wall cells
    reachBlocks: 1                        // SiteConfig.floorSystem.edgeBleedCells * 2
}
```

**Output**

```js
{
    owner: Uint16Array | Array<string|null>,  // 2W × 2H, plan index or null
    revision,
    blocksOf(planId), ownerAt(bx, by), ownerOfCell(x, y) /* majority */
}
```

**Algorithm**

1. **Seed.** For every plan, every seed cell's four blocks are owned at distance 0. Seeds are disjoint by construction (a cell has one owner in the store), so no conflict is possible here.
2. **Fences.** Each wall cell contributes internal fences derived from its mask:
   - a horizontal fence (separating its north pair from its south pair) if the mask has `W` or `E`, or the mask is 0;
   - a vertical fence (separating its west pair from its east pair) if the mask has `N` or `S`, or the mask is 0.
   A straight run has one fence; corners, T's, crossings and lone posts have two. Fences exist only *inside* a cell. Steps between cells are always open.
3. **Passability.** A straight step between adjacent blocks is passable unless both blocks lie in the same cell on opposite sides of one of that cell's fences. A diagonal step is passable only if both of its straight legs are passable (no corner cutting).
4. **Expansion.** For `round = 1 .. reachBlocks`: every unowned block that is passable-adjacent to a block owned in the previous round **and lies in a wall cell or an `expandCells` cell** is claimed. Expansion exists to bury a floor under the masonry that encloses it, not to grow the room, so a block on open ground is never claimed: a painted floor ends exactly on the cells the player painted. All claims in a round are computed against the previous round's grid, so iteration order cannot matter. When several plans reach one block in the same round:
   - a claimant reaching by a straight step beats one reaching diagonally;
   - then the higher `priority` wins; the default priority is smaller seed area first, then lower id.
5. **Done.** Emit one immutable grid. There is no step 6.

**Why this covers every accumulated special case**

- *Floor tucks under masonry to the centreline.* A wall cell's near pair is passable from the room; its far pair is behind the fence. That is exactly half a cell.
- *Two rooms across a wall never leak.* The fence is between them.
- *T junctions and crossings.* Two fences make four quadrants, each reachable only from its own side. Nothing needs to inspect faces.
- *End caps and gaps.* An end cap keeps its fence across the full cell, so the floor edge stays straight past the end of the wall rather than stepping sideways. A gap cell is open and is resolved by expansion from both sides, meeting at the centre.
- *Doorways with an opening record.* The opening's cell is a wall cell with the same fences. Both floors meet under the door on its centreline.
- *Removing a perimeter wall.* The vacated cell is open with no seed, and expansion does not enter open ground, so the floor edge stays on the seeded cells. The player extends the room by painting it, which is the same gesture that made it.
- *Open-plan boundaries.* Two seeded plans with no wall between them touch at seed edges; there is nothing to contest.
- *Outside corners of two rooms meeting corner to corner.* Straight-beats-diagonal decides the shared quarter, which was the 2026-08-16 fix, now a rule instead of a mask subtraction.

**Thresholds.** Thresholds are the one open-ground exception, passed in as `expandCells` so a doorway gap is floored from both sides instead of showing bare ground. A *threshold* is an open cell lying in the line of a wall: both of its neighbours along one axis are wall cells, and each is either connected outward along that axis or is a single-connection end cap. Seeds of `origin: 'authored'` or `'detected'` skip threshold cells so a doorway drawn as a gap splits at its centre rather than belonging wholesale to whichever rectangle covered it. A `painted` seed on a threshold is kept: the player said so. `WallGeometry.thresholds(snapshot)` computes them; the resolver only consumes seed lists.

**Size.** House is 30×30 cells, Outside 30×40: 3,600–4,800 blocks. One round over that is well under a millisecond. Even `reachBlocks: 4` is trivial.

### 4.8 Wall face adjacency is an ownership lookup

The room beside a wall atom is the owner of the block that atom looks at:

```text
lookBlock(x, y, 'south', 0) = (2x,     2y + 2)   // below the cell's SW block
lookBlock(x, y, 'south', 1) = (2x + 1, 2y + 2)
lookBlock(x, y, 'north', h) = (2x + h, 2y - 1)
lookBlock(x, y, 'west',  h) = (2x - 1, 2y + h)
lookBlock(x, y, 'east',  h) = (2x + 2, 2y + h)
```

`WallFaceResolver.classify(atom, grid, topology)` returns one of:

- `{ kind: 'room', roomId }` — the look block is owned;
- `{ kind: 'exterior', loopId }` — the look block is unowned and its cell is open ground reachable from outside (loop from `RoomTopology.openSpaces`);
- `{ kind: 'buried' }` — the look block is unowned and inside a wall cell (double walls, wall interiors). Buried atoms are not paintable and not rendered.

This single rule replaces the eight functions listed in §2. The junction case that took `resolveBandSurface` falls out for free: at a T whose stem points south, the south face's west atom looks at the stem cell's north-west block, which the fence rule handed to the west room. The band west of the post gets the west room's paint with no special case.

Exterior atoms group into paint sections by `loopId`, which is how the Exterior scope stops at a courtyard.

### 4.9 Derived topology

`RoomTopology.compute(snapshot) → topology` consumes the wall snapshot, openings, and plan seed cells. It produces enclosed components, the outside/courtyard open spaces, indoor/outdoor per plan, adjacency through openings, ordered exterior shell loops per building, roofable footprints, exposed wall-top edges, and cutaway membership. It replaces `RoomEnclosureDetector` and `BuildingTopology`.

**Plan matching, the one place topology writes intent.** Inside a transaction, after walls change and before ownership is solved:

1. Seed cells that became wall cells are removed from their plan.
2. Every enclosed component is matched to the plans whose seeds it contains.
3. Enclosed cells owned by no plan are **proposed**: if the component contains exactly one plan, they join it; if it contains several, each unowned cell joins the plan with the nearest seed (straight distance, then priority); if it contains none, a new `origin: 'detected'` plan is created, parented to the building owning most of its enclosing wall cells, named `Room N`, and inheriting finishes and lighting from the plan that previously owned the majority of those cells if any (dividing a room does not redecorate it).
4. Cells a plan already owns are never moved. Merging two rooms by removing a wall leaves both plans with their cells and the Navigator shows them as one open space; the player paints one into the other if they want one room.
5. Unenclosed painted cells stay with their plan and the plan is marked outdoor (`Area`).

Every proposal is a store delta inside the transaction, so undo restores it exactly.

**Projection.** `RoomRegionProjection` publishes one `SpatialRegion` per plan into the `'room'` layer with a tilemask shape equal to the plan's resolved cells (`grid.cellsOf(planId)`), and copies `indoor`, `openSpaceId` and `displayName` into `properties`. Lighting, zones, AI membership, `buildDoorRoomTopology` and the cutaway keep working against the region API unchanged. The projection is rebuilt once per transaction and is not persisted.

### 4.10 Visible-face presentation policy

Only one face of a horizontal wall is drawn at full height, and one slice per post. Which atom a slice shows is a **presentation** decision in `WallFaceResolver.visibleAtom(slice, grid)`, never persisted:

| Rendered slice (from `getPaintSpans`) | Candidate atoms | Rule |
|---|---|---|
| Horizontal band, west part | `south/0`, `north/0` | the one facing a room if only one does; if both do, the room with the shallower straight depth from this cell (today's `preferredHorizontalRoomSide`, as a pure function over the grid); if neither, `south` |
| Horizontal band, east part | `south/1`, `north/1` | same |
| Post west half | `west/1`, `west/0` | the south half if it faces a room, else the north half |
| Post east half | `east/1`, `east/0` | same |

**Corner bands inherit their run.** A corner cell's band is buried on the room side by the arm turning away from the run, so classified on its own it becomes a half-cell exterior section at each end of every wall — a 16px paint target sitting inside a run it is visually part of, refusing the colour the rest of the wall takes. `WallFaceResolver.surfaceOf(slice, grid, topology)` is the single entry point for both rendering and paint grouping: it returns the visible atom together with the surface the slice paints as, and a horizontal band that is buried on one side takes the surface of its neighbour along the run rather than falling back to the exterior. The paint still stores on the atom that is not buried, so nothing needs a new address. Callers must use `surfaceOf`, never `visibleAtom` + `classify` in sequence, or the nub comes back.

The hidden atom's paint is never lost; it is stored and will be shown by any future presentation that reveals it (walls-down view, a per-room interior view).

The depth rule is kept deliberately. "South always wins" is what the camera physically sees, but it makes a room's own front wall wear the neighbour's colour, which is the complaint that produced the rule in the first place. As a pure function over the grid (count consecutive owned blocks straight north and south of the cell) it is ten lines, deterministic, and covered by the `hallway-front-wall` fixture.

## 5. Edit transaction pipeline

One coordinator for every build-mode mutation, including undo and redo:

```text
BuildTransaction.run(label, edit)
  1. snapshot the affected store records
  2. validate the whole proposed edit (BuildRules); atomic reject if any part fails
  3. apply store mutations: walls, atoms, room seeds, building fields, attachments
  4. WallGeometry.compute(walls)                  → masks, runs, thresholds
  5. RoomTopology.proposeSeeds(...)               → more store deltas (§4.9)
  6. FloorOwnershipResolver.solve(...)            → grid
  7. RoomTopology.compute(...)                    → components, loops, open spaces
  8. RoomRegionProjection.sync(...)               → 'room' regions
  9. renderers: WallRenderer.invalidate(dirtyCells), FloorRenderer.invalidate(dirtyBlocks)
 10. emit one BUILD_COMMITTED { label, deltas, dirty, revision }
 11. push { forward, inverse } deltas to BuildHistory
```

Steps 4–8 are pure computations over snapshots; step 9 is the only DOM work. Consumers that today listen to `WALL_GEOMETRY_CHANGED`, `ROOM_ASSIGNMENTS_CHANGED`, `ROOMS_CHANGED`, `BUILDING_TOPOLOGY_CHANGED` and `SURFACE_FINISH_CHANGED` migrate to `BUILD_COMMITTED`. The old events are emitted once from step 10 while consumers are still being ported, and are removed in WP8.

Preview (hover paint, move ghost) runs steps 4–9 on a **scratch copy** of the stores and discards it. No preview writes to a live store and no preview creates history.

## 6. Module map

Target layout. Line budgets are hard limits enforced by review.

```text
js/Map/Build/
  BuildKeys.js                 address helpers                                   ≤ 120   pure
  BuildingPlanStore.js         CRUD + delta serialisation                        ≤ 200
  RoomPlanStore.js             CRUD + seed editing + delta serialisation         ≤ 300
  WallCellStore.js             CRUD + buildingId inheritance + delta             ≤ 250
  WallSurfaceAtomStore.js      CRUD + translate/extend + delta                   ≤ 200
  StoreDelta.js                diff/apply/invert for any keyed store             ≤ 150   pure
  BuildDocument.js             authored baseline + level scoping + version       ≤ 300
  BuildTransaction.js          the pipeline in §5, preview scratch, stats        ≤ 350

js/Map/Regions/
  RoomTopology.js              enclosure, matching, open spaces, shells          ≤ 500   compute() pure
  RoomRegionProjection.js      plans+grid → SpatialRegion 'room' layer           ≤ 150

js/Map/Floors/
  FloorOwnershipResolver.js    §4.7                                              ≤ 250   pure
  FloorRenderer.js             chunked canvases, dirty tracking, overlays        ≤ 400

js/Map/Walls/
  WallGeometry.js              masks, runs, pieces, thresholds, paint spans      ≤ 400   pure
  WallFaceResolver.js          §4.8 + §4.10 + section grouping                   ≤ 250   pure
  WallRenderer.js              piece canvases, frames, dirty pieces, flat overlay ≤ 600
  WallCutaway.js               subjects, state machine, hysteresis (unchanged)   ≤ 500
  WallOpenings.js              slots, bridging, placement, binding               ≤ 600
  WallFixtures.js              fixture placement, binding, obstacles             ≤ 400
  WallHitTest.js               pointer → atom / piece / opening (geometric)      ≤ 200   pure
  WallBuilder.js               façade wiring the above for GameMap              ≤ 300
```

Deleted at the end: `RoomAssignments.js`, `RoomEnclosureDetector.js`, `BuildingTopology.js`, `FloorBuilder.js`, the face-override half of `WallBuilder.js`, `SurfaceCustomizer.previewState` snapshots.

Dependency direction is strict: `Build/*` stores know nothing of renderers; pure modules import only `BuildKeys`; renderers import geometry and resolvers; UI imports `BuildTransaction` and read-only stores. `WallBuilder` keeps the public surface other systems already call (`cells`, `getCellObstruction`, `getLightBlockers`, `setPresentationMode`, `tick`, `rectOverlapsWall`, the opening/fixture placement API) and forwards.

## 7. Rendering and performance

### 7.1 Floors: chunked canvases from the grid

Today: one canvas per room, all rebuilt on any change, each room re-tiling the map pattern. Replace with **chunk canvases** (8×8 cells = 256×256 px at cell 32) under the background layer. A chunk draws, for each finish present in it, the union of its blocks as one clipped pattern fill anchored to world coordinates. After a transaction only chunks intersecting `dirtyBlocks` redraw. Room highlight overlays keep drawing from `grid.blocksOf(planId)` as today, in a separate overlay canvas per chunk or one map-sized overlay (overlays are rare and transient).

Pattern alignment stays world-anchored so two rooms sharing a finish line up across a doorway.

### 7.2 Walls: structural pieces, per-atom paint, dirty pieces

- A piece is a maximal straight horizontal run of equal `constructionId`, `heightCells` and `y` **regardless of paint**. Paint no longer splits pieces (`canMergeHorizontal` drops the faces test). Fewer canvases; no more orphaned transition frames when a run is split across canvases by a colour seam.
- `drawWallFrame` stays blit-only: frame blit plus one clipped overlay blit per span. Overlay images stay cached per `(construction, finish, state)` in the registry.
- A piece re-renders when any of its cells is in the transaction's dirty set, when its resolved paint changes, or when its cut states change. Cutaway redraws only pieces whose states changed plus their run neighbours, not every piece.
- Per-row `z-index` from baseline is unchanged.

### 7.3 Hit-testing without pixel reads

`SurfaceCustomizePanel.isOpaqueAt` alpha-tests wall canvases on every pointer move, which forces `willReadFrequently` and a `getImageData` per move. Replace with `WallHitTest`: `WallRenderer` publishes, per piece, the projected rectangles of every rendered span with their atom addresses (already computed by `getPaintSpans`/`getRenderPlan`). Pointer → row of pieces by baseline → span rectangle → atom. Rounded caps get a 2 px tolerance instead of pixel-perfect edges. This also delivers "every atom-sized target gets a larger hit region" from the UI spec for free.

### 7.4 Derived caches by revision

`BuildTransaction` bumps one `revision` per commit. Lighting, pathfinding wall occupancy, `getLightBlockers`, door-room topology and the cutaway subject cache memoise by revision instead of subscribing to several events. A consumer asks `build.revision` and recomputes when it moved.

### 7.5 Preview cost

Hover paint preview today mutates `faceOverrides` and rebuilds all walls, then reverts and rebuilds again. With scratch-store previews (§5) a hover re-renders only the pieces containing the previewed atoms.

### 7.6 Counters

`__build.stats()` returns `{ transactions, wallRebuilds, ownershipSolves, topologyRebuilds, floorChunksRedrawn, wallPiecesRedrawn, hitTests, imageDataReads }` since load. The browser suite asserts the §3.7 budget on every gesture it drives.

## 8. Build-mode UI

The earlier draft proposed a three-column workspace. The stage is ~585 px wide and the sidebar 250 px; a left rail plus a right inspector does not fit and would break the Win98–XP shell. The replan keeps the same *capabilities* inside the layout that exists.

### 8.1 Where things live

- **Tool rail:** the existing hand-controls, reduced to `Select`, `Structure`, `Rooms`, `Paint`, `Ground`. Move folds into Select (drag and wall-pull handles). Walls and Fences fold into Structure with a tab.
- **Inspector:** one sidebar panel with tabs `Navigator`, `Properties`, `Palette`. The tab shown follows the tool and the selection. Existing `WallBuildPanel`, `RoomPanel`, `SurfaceCustomizePanel`, `TerrainPaintPanel` and `BuildMarqueeSelection` become tool controllers that issue transactions and render into Inspector tabs; their private selection models are replaced by one `BuildSelection` (`{ kind: 'building'|'room'|'wall'|'atom'|'object', id }`).
- **Stage dock row:** stays as is (`StageViewBar`: walls presentation, grid/snap, speed) plus Undo/Redo.
- **On-map handles:** unchanged.

### 8.2 Navigator

```text
Site
├─ Building: Main House
│  ├─ Room: Living Room
│  ├─ Room: Hallway
│  └─ Room: Bedroom
├─ Building: Garden Shed
│  └─ Room: Shed Interior
├─ Areas
│  └─ Area: Patio
└─ Unassigned walls (3 runs)
```

Reads the plan stores directly. Clicking a building selects its walls, rooms, openings and attached objects; clicking a room selects its seed cells and facing atoms. Inline rename edits the persisted name. Derived states (Open, Disconnected, No entrance, Empty) are badges. The map and the tree select the same `BuildSelection`. Level rows exist in the model and are hidden.

### 8.3 Context rules

- Selecting an atom shows construction, resolved finish and its source (atom / room default / building default / construction), owning building, and the adjacent room label.
- On the half-tile split case, the two halves are two targets; the hover preview shows exactly the half that will change.
- Selecting a room exposes Paint floor, Paint interior walls, Edit area, Move to building.
- Selecting a building exposes Rename, Move, Duplicate, Separate, Merge, Demolish; destructive actions list affected rooms and objects first.

### 8.4 Keyboard

`1`–`5` tools, `Ctrl+Z`/`Ctrl+Y`, `Esc` cancels gesture → clears selection → exits build, `Alt` samples. Unchanged from the earlier plan.

## 9. Forward-compatible seams

Included because omitting them forces another persistence rewrite. None authorises roof art, ceilings, stories, stairs or a level selector now.

- **Levels:** stores are level-scoped (§4.1). A second level is a second key, not a schema change.
- **Roofs:** a future `RoofPlan` is a child of `BuildingPlan` targeting one level; `RoofGeometry` derives from `RoomTopology` shell loops (outer and courtyard) and is never stored. Roof finish is a surface material separate from shape.
- **Wall tops:** constructions expose height, thickness and top edge through registry data; roofs attach to derived edges, never to sprite pixels or piece IDs. Mixed heights are legal inputs.
- **Shell consumers:** exterior paint, roofable footprint, weather shelter, daylight, ambient audio, whole-building selection and future façade systems all read `RoomTopology`; none walks walls itself.
- **Registries and capabilities:** new construction and surface types register; tools dispatch through capabilities, not `if (roof)` chains. The Inspector renders registered entity editors.
- **Transactions are typed and extensible** so later roof or level deltas share the same history.

## 10. Persistence and migration

### 10.1 Document

Saves stay a delta over the authored map, as today, but the delta is generic:

```js
{
    version: 8,
    buildings: StoreDelta,
    levels: {
        level_ground: {
            walls: StoreDelta, atoms: StoreDelta, rooms: StoreDelta,
            openings: StoreDelta, fixtures: StoreDelta, attachments: StoreDelta
        }
    },
    presentation
}
// StoreDelta = { set: { key: record }, removed: [key] }
```

`GameMapLoader` builds the **authored baseline** in the same store shapes: wall cells from the tile layer, authored openings/fixtures/attachments, `RoomPlan`s from `Room` objects (`roomId`, `displayName`, `roomType`, `floorFinishId`, `wallFinishId`, seed cells from the rectangle minus walls and thresholds, `origin: 'authored'`), `BuildingPlan`s from repeated `buildingName` properties. `StoreDelta.diff(authored, current)` produces the save; `apply` restores it. No system writes its own bespoke delta.

`WallTiledExporter` exports from the stores (walls, atoms as face overrides for the tile layer's benefit, rooms as `Room` objects with seed rectangles where rectangular). The Tiled layer convention and validator are unchanged.

### 10.2 No migration

Decided 2026-09-03: player build edits saved under version ≤ 7 are **discarded**, not migrated. On loading an older payload, `BuildDocument` drops the map's build delta, keeps everything else in the user save (roster, inventory, objects, terrain), shows one toast ("Build edits were reset for the new build system"), and writes v8 on the next save. The authored Tiled map is the baseline, so nothing authored is lost.

There is no `BuildMigration.js`, no legacy folder, and no shadow comparison. The old face-override, `RoomAssignments`, `floors`/`roomWalls`/`roomEdits` snapshot fields are read by nothing and removed from `WorldState.captureMap` in WP8.

## 11. Verification

### 11.1 ASCII fixtures (the contract with delegates)

Every topology case is a text fixture in `tests/build/fixtures/*.fixture`. Delegates add cases; nobody argues about behaviour in prose.

```text
name: doorway-gap-between-two-rooms
reach: 1
map:
  ##########
  #AAAA#BBB#
  #AAAA.BBB#
  #AAAA#BBB#
  ##########
expect:   # 2W × 2H blocks; '.' = unowned
  ....................
  .AAAAAAAAAABBBBBBBB.
  .AAAAAAAAAABBBBBBBB.
  .AAAAAAAAAABBBBBBBB.
  .AAAAAAAAAABBBBBBBB.
  .AAAAAAAAAABBBBBBBB.
  .AAAAAAAAAABBBBBBBB.
  .AAAAAAAAAABBBBBBBB.
  .AAAAAAAAAABBBBBBBB.
  ....................
```

Worked through §4.7: each room's floor runs one block under its perimeter walls (rows 1 and 8, columns 1 and 18), the divider's two end caps split west/east at their centreline, the threshold cell splits at the same line, and the two blocks under the T junction above the gap go to the side each quadrant opens onto. The outer wall's far pairs stay unowned.

Legend: `#` wall, letter = seed cell of that plan, `.` open unassigned, `D` wall cell with an opening. An optional `origin: A=painted` line marks a plan's seeds as `painted` when threshold behaviour matters; the default is `authored`. Optional sections: `faces:` expectations per atom (`3,1/south/0 = A`), `visible:` expectations per slice, `thresholds:` cell list, `components:` expected enclosures and open spaces.

The harness (`node scripts/test-build-model.js`) loads the pure modules in manifest order with `vm`, runs every fixture, and automatically runs each one mirrored horizontally, vertically, and rotated through four orientations (letters and expectations transformed with it). A fixture fails if any block differs, if any block has two owners, or if the resolver's output differs across two runs with shuffled input order.

Required fixtures (from the cases that regressed): closed rectangle, L room, open corridor, deleted perimeter wall, two rooms across a doorway with an opening, two rooms across a gap, terminal caps, T junction, four-room crossing, incomplete divider, corner-to-corner rooms, double wall, courtyard, wall pull with painted end, wall removal beside painted stubs, the red-line half-tile split.

### 11.2 Property tests

Random sequences of wall add/remove/move and room paint over a 12×12 map assert: no block has two owners; unchanged atom keys keep finishes; removed cells' atoms are gone; topology is idempotent; undo-then-redo yields byte-equal store deltas; the number of rebuilds per transaction equals the §3.7 budget.

### 11.3 Browser verification

Drive the real tools with the `verify` skill (headless Playwright, console and page errors collected on every run):

- Section, Room, Space, Exterior scopes paint exactly what the hover previewed.
- Navigator and canvas selection stay in sync; rename, merge, separate, duplicate, demolish, save/reload, undo, redo.
- Walls up, down, cutaway and hidden all render, and cutaway behaviour is unchanged frame for frame on the House map.
- `__build.stats()` after each driven gesture meets the budget; `imageDataReads` stays at 0 during pointer sweeps.
- Screenshot comparison at native zoom for every fixture map and for House in all four presentations.

### 11.4 Reference cases

**The red-line screenshot** (fixture `red-line-split`). A horizontal wall runs east–west along the top of a blue-tiled room. Above it, on the left, is a sage room; above it, on the right, a brick-floored corridor. A vertical wall between the sage room and the corridor comes down and meets the horizontal wall in one tile. The red line is that tile's centreline, continued down through the blue room's floor. Required result: the visible band of that one tile is sage west of the line and blue-room paint east of it (`south/0` faces the sage room's side, `south/1` faces the blue room), and the floor boundary between sage and blue runs straight along the same line through the wall and beyond it. Under §4.7 the tile is a T (two fences); under §4.8 its two south-face atoms look at different owners. No special case is involved.

- The marked tile is half sage and half blue at the exact red line.
- Removing the connecting wall leaves both painted stubs unchanged.
- Pulling a painted wall in each direction moves existing paint and paints only the extended cells.
- Removing a perimeter wall exposes a half-tile floor edge.
- Two floors meeting keep one straight boundary through wall ends and openings.
- An incomplete enclosure never borrows a distant room's floor or paint.
- Names survive walls opening, disconnecting, reconnecting and re-enclosing.
- Merging two buildings uses the chosen survivor; undo restores both.

## 12. Work packages and ownership

Fable owns the decisions where a wrong call poisons everything downstream: the fixture contract, the pure core, and the transaction. Everything else is delegated (Codex / Opus / Sonnet) against fixtures and budgets. Every package: lands on `wall-system`, updates this document's §13 with decisions made, rebuilds `js/bundle.js`, adds new files to `scripts/script-manifest.json` by hand, passes its own fixtures, and passes the existing build-mode browser suite before the next package starts. No package may leave two production sources of truth.

| WP | Owner | Delivers | Gate |
|---|---|---|---|
| **0 Fixtures & harness** | Fable | fixture format, `scripts/test-build-model.js`, expected grids for the required cases (captured from today's `__surfaces.audit` where today is right, hand-corrected where it is wrong and reviewed with Ryan) | harness runs; every fixture has a reviewed expectation |
| **1 Pure core** | Fable | `BuildKeys`, `WallGeometry` (extracted from `WallBuilder`), `FloorOwnershipResolver`, `WallFaceResolver`; no production wiring | all fixtures green in Node, in all 8 orientations |
| **2 Stores & document** | Delegate | five stores, `StoreDelta`, `BuildDocument`, `GameMapLoader` authored baseline, old-payload reset path (§10.2) | round-trip tests: authored → edit → diff → apply → byte-equal stores; a v7 save loads clean with one toast |
| **3 Transaction & topology** | Fable | `BuildTransaction`, `RoomTopology` with plan matching, `RoomRegionProjection`; floors cut over to the resolver in production; old floor passes deleted | one rebuild per gesture measured; floor reference cases pass in browser |
| **4 Atomic paint** | Delegate | atoms render through `WallFaceResolver`; scopes become commands; extension/move rules; `WallHitTest`; face-override runtime deleted | red-line case, stub case, pull case pass; `imageDataReads` = 0 |
| **5 WallBuilder split** | Delegate | mechanical extraction into `WallRenderer`, `WallCutaway`, `WallOpenings`, `WallFixtures`; façade ≤ 300 lines | screenshot parity on House in all four presentations; no behaviour change |
| **6 Floor renderer** | Delegate | chunked `FloorRenderer`, dirty tracking, overlays, `__build.stats()` | budget assertions in the browser suite |
| **7 Build UI** | Delegate | tool consolidation, Inspector tabs, Navigator, `BuildSelection`, keyboard map | UI acceptance list in §8 driven headlessly |
| **8 Cutover** | Delegate | v8 live, old events and old snapshot fields removed, Tiled exporter on stores, docs updated (`WALL_SYSTEM_AND_SPRITESHEET_SPEC` §8, `FLOOR_FINISHES` §5–6) | fresh save and reload render identically; property tests green |

Recommended first slice: WP0 and WP1 together, in one sitting, before any production code moves. If the resolver in §4.7 cannot reproduce a reviewed fixture, the model is wrong and it is cheap to find out here.

## 13. Decisions resolved in this revision

Reviewers should not reopen these without a fixture that breaks them.

- **Half-cell atoms are sufficient** for every current wall mask, because every rendered span from `getPaintSpans` lies inside one half of one face (bands split at the post; posts split at the centreline). §4.10 maps each slice to its atoms.
- **Room plan and floor region are one record.** A second store with a shared id would be two names for one thing.
- **Room and building default finishes stay** as the fallback layer beneath atoms (§4.5). Materialising "Whole interior" into atoms alone would make new walls in a painted room come up plaster. Whole-room paint sets the default and clears that room's explicit atoms, which is what `setRoomWallFinish` already does.
- **Wall-face adjacency is an ownership lookup**, not a mask walk (§4.8). This is the single biggest deletion and the reason junction bugs stop recurring.
- **Ownership is one fenced expansion**, not seeding plus passes (§4.7). Thresholds are the only topology-derived input beyond fences.
- **Levels scope the stores** rather than appearing in every key (§4.1).
- **Merging enclosures never merges plans**; the player paints to merge (§4.9). Splitting an enclosure creates a plan that inherits decoration.
- **The UI keeps the current shell** (§8): sidebar inspector, hand-controls rail, stage dock row. No three-column workspace.
- **Pieces merge on structure only**; paint is drawn per atom inside a piece (§7.2).
- **Hit-testing is geometric** (§7.3).
- **Previews use scratch stores**, never live mutation plus revert (§5).

## 13a. Amendments 2026-09-04 (playtest, landed)

Two behaviours Ryan hit in build mode were wrong in the model, not just in the code. Both are fixed in the pure core and in this document; the fixtures below are the contract.

1. **Floor expansion never enters open ground** (§4.7 step 4). Painting a floor drew the painted cells plus a half-tile skirt all round, so adjusting a room tile by tile meant dragging a rectangle over half-tiles that looked like floor and were not, and the result never matched the gesture. Expansion is now restricted to wall cells and `expandCells` (thresholds). Fixtures `corner-to-corner`, `l-room`, `open-boundary`, `open-corridor` and `red-line-split` were re-expected against this; `deleted-perimeter-wall`, `threshold-gap` and `doorway-gap-between-two-rooms` are unchanged, which is the check that the wall tuck and the doorway split survived. New fixture `post-corner-contest` keeps the straight-beats-diagonal tie-break covered, which `corner-to-corner` no longer exercises now that nothing is contested on open ground.

2. **Corner bands inherit their run** (§4.10). Each end of a wall run broke off as its own 16px exterior paint target that would not take the run's colour. `WallFaceResolver.surfaceOf` is now the single entry point for the visible atom and its surface; `WallRenderer.getPaintSpans` and `WallFaceResolver.sections` both go through it. Covered by the eighth geometry contract in `scripts/test-build-model.js`.

Both live in WP1 code, so WP4's atomic paint should consume `surfaceOf` rather than reconstructing the pair.

### The governing rule these amendments serve

**Editing a wall must never move a floor.** Every complaint above is one system silently rewriting what the player drew with another tool. Two further amendments follow from stating it:

3. **The half-tile inset was tried, measured on a real save, and removed.** Ryan asked for a floor to stop half a tile inside the cells he painted. Implemented as a per-cell rule (`insetOpenBoundaries`) it produced *ragged* edges, because the floor then lands in three different places along one straight edge depending on what happens to sit beside each cell. Measured on his Sandbox save, `room_painted_1`'s right edge ran:

```
y6–y9   x=36.5   (bare ground beyond → pulled in)
y10–y15 x=37     (room_painted_2 beyond → flush)
y16–y18 x=36.5   (bare ground again → pulled in)
```

Both variants fail. Insetting only against unowned ground gives the steps above. Insetting against neighbouring plans as well makes each edge uniform but puts a full cell of bare terrain at every room-to-room junction, which is worse and was rejected on sight. **A uniform inset is not reachable per cell**: the three cases (bare ground, neighbouring plan, wall) must agree on one line, and the wall case is fixed at the wall's centreline, which lies *outside* the room's boundary cell rather than inside it. Making them agree requires the wall to occupy the room's own boundary cell — a change to what a room's footprint means, not a resolver tweak.

The inset is gone. Floor edges sit on cell boundaries, uniformly, as they did before.

4. **A painted footprint is never grown by proposal** (§4.9 step 3). Drawing a wall one tile outside a painted floor handed the whole enclosed ring to that floor — 12 painted cells became 30 seeds. `RoomTopology.proposeSeeds` now only lets `authored`/`detected` plans absorb unowned enclosed cells; where the only plan present is `painted`, the remaining cells stay bare until the player paints them. Walls-first ("draw four walls, get a room") is untouched, since that enclosure has no plan in it at all and still creates a `detected` one.

5. **A threshold is never seeded** (§4.7). The live `derive` path passed raw `seedCells` straight to the resolver, so whichever plan's rectangle happened to cover a doorway gap took the whole opening and wore its floor across to the far side. `BuildTransaction.seedsOffThresholds` drops threshold cells from every plan's seeds before solving, and `proposeSeeds` never proposes one, so both floors reach in and meet on the centreline. **This removes the painted exception closed on 2026-09-03** (§14 item 3): Ryan's call on 2026-09-04 is that painting across a doorway says which floor goes there, not that one room now owns the opening. Fixture `painted-across-a-doorway`.

6. **Owned cells are visible while building.** A floor stopping on the centreline is right, but it means the painted edge is half a tile inside the cells the room owns, and "is this cell mine?" is the question you ask constantly while nudging a room's edges. `BuildFootprintOverlay` outlines each plan's owned cells on the background layer (cell-aligned at inset 0, one colour per plan, edges only), behind a **Rooms** toggle in the stage bar next to Grid and Snap, off by default. It redraws on `BUILD_COMMITTED`, which is exactly when ownership can move.

7. **`edgeBleedCells` is gone.** Removed from `SiteConfig.floorSystem`; `FloorRenderer.CENTRELINE_BLOCKS` states the one correct value. `FLOOR_FINISHES_2026-08.md` §5 updated.

**Verified, not changed:** a rename survives a wall edit, and dividing a room does not redecorate it (`testRenamesSurviveWallEdits`). Walling through a room leaves one plan spanning both halves rather than inventing a room — the floor does not move, which is the rule working. Vertical wall runs ending a cell short at corners is also correct and not a defect: a corner cell's visible face is the horizontal band it already shares with that run, so it can only carry one colour.

8. **Two floors meet flush; only unowned ground causes an inset.** Briefly, the inset was made to fire at plan-to-plan boundaries as well. That is wrong: it put a full cell of bare terrain at every junction between two rooms, which is visible and ugly at a doorway between a corridor and a room. Reverted. The rule now reads: a plan's edge is pulled to the centreline where it meets **unowned** ground, and meets flush where it meets another plan. This keeps the margin around a floor painted on bare ground *and* keeps two rooms touching where they join. Fixture `two-floors-meeting-open`.

9. **A floor enters a wall across its length, never from its end.** `canStep` applied a wall cell's fences only to moves *inside* that cell, so entering one from a neighbouring cell was always allowed. A room sitting past the end of a wall therefore flowed into the end-cap cell lengthwise and filled it, and the cap's rounded art does not cover a whole cell — so a part-tile of floor hung off the end of every unfinished wall. `FloorOwnershipResolver.canEnterWall` now allows entry only perpendicular to the run (a lone post, having no length, still takes floor from every side). `WallGeometry.fencesForMask` additionally gives an end cap a fence on both axes, which is what §4.7 always claimed it did. Verified on Ryan's own save: all 10 end caps went from flooded to clean, and all 24 fixtures still match. Fixture `wall-cap-not-entered-lengthwise`.

### OPEN DEFECT — drawing a wall beside a floor still moves it half a cell

A floor's edge sits on its boundary cell, and drawing a wall on the next cell out moves it to that wall's centreline — half a cell — because the tuck fires for any adjacent wall, enclosing or not. Nothing local separates a wall that bounds a room from a stub stood beside it: they occupy identical cells relative to the floor. Rules tried and rejected against fixtures: *enclosure* ("the plan's cell is in a component that does not touch the map edge") breaks ten fixtures, since every room at the map edge stops tucking under its own walls; *separation* ("the wall divides two open components") fails `red-line-split`, where you can walk around the wall yet the tuck is correct and reviewed. Most likely this needs intent recorded when the wall is drawn — the wall knowing which room it bounds — rather than geometry recovered afterwards.

## 13b. Where this stands (assessed 2026-09-04)

| WP | State | Evidence |
|---|---|---|
| 0 Fixtures & harness | **done** | 22 fixtures × 8 orientations, 8 geometry contracts, 100 property cases |
| 1 Pure core | **done** | `BuildKeys`, `WallGeometry`, `FloorOwnershipResolver`, `WallFaceResolver` |
| 2 Stores & document | **done** | five stores, `StoreDelta`, `BuildDocument`; v8 round trip and v7 reset green |
| 3 Transaction & topology | **done** | `BuildTransaction`, `RoomTopology`, `RoomRegionProjection`; `FloorBuilder`, `RoomAssignments`, `RoomEnclosureDetector`, `BuildingTopology` all deleted |
| 4 Atomic paint | **done** | atoms render through `WallFaceResolver`; `WallHitTest` tested. `faceOverrides` survives only as the Tiled ingest path in `TileMapLoader`, which is authoring, not a second runtime |
| 5 WallBuilder split | **done** | `WallBuilder` is 153 lines; `WallRenderer`/`WallCutaway`/`WallOpenings`/`WallFixtures` split out |
| 6 Floor renderer | **done** | chunked `FloorRenderer`, dirty tracking, overlays, `window.__build.stats()` |
| 7 Build UI | **part** | `BuildInspector` and `BuildSelection` exist. No Navigator. Tools are not consolidated — `WallBuildPanel`, `FenceBuildPanel`, `CellDragBuildPanel`, `TerrainPaintPanel`, `SurfaceCustomizePanel`, `RoomPanel` all still separate. Keyboard map not done |
| 8 Cutover | **part** | old events are gone (no `WALL_GEOMETRY_CHANGED` / `ROOM_ASSIGNMENTS_CHANGED` / `BUILDING_TOPOLOGY_CHANGED` / `SURFACE_FINISH_CHANGED` anywhere). Remaining: the doc sweep (`WALL_SYSTEM_AND_SPRITESHEET_SPEC` §8), and confirming the Tiled exporter reads stores |

**So: WP0–WP6 are done and WP7 is the bulk of what is left** — Navigator, tool consolidation, keyboard map — followed by WP8's cleanup. Two known loose ends outside the WP list: `FloorRenderer.computeOwnership` is a second, region-seeded ownership path that only `SurfaceDebug` still reaches, and reaching it *overwrites* the live grid as a side effect — it should go (§15: no second production ownership engine). And `WallGeometry.findThresholds` only recognises single-cell gaps, so a two-cell-wide doorway is not a threshold and does not split.

**Consequence for `edgeBleedCells`.** With expansion confined to wall and threshold cells, `0.5` is no longer a tuning value but the definition of the centreline. Any other value tucks past the wall's far face or stops short of it. It should be treated as fixed, and WP6 should consider removing the setting rather than exposing a number with one correct answer.

## 14. Questions closed 2026-09-03

Ryan's direction: do whatever gives the best result; migration is unnecessary; legacy need not be preserved.

1. **Visible band when both sides are rooms:** the depth rule, as a pure function (§4.10).
2. **Old saves:** reset, no migration, no legacy folder (§10.2).
3. **Thresholds:** a gap cell in the line of a wall splits at its centre unless the player painted it (§4.7).
4. **Reference screenshot:** described as the `red-line-split` fixture in §11.4; WP0 encodes it as the first fixture.

Nothing remains open. WP0 and WP1 can start.

## 15. Deliberate non-goals

- No change to wall construction art, thickness, rounded silhouettes, transition frames or cutaway presentation.
- No change to collision, pathfinding, opening placement rules or fixture placement rules beyond consuming atom addresses.
- No ECS. Stores are plain keyed maps; entities stay classes.
- No persistent render-piece IDs.
- No building-per-connected-component. Connectivity is a diagnostic.
- No roof art, roof generation, ceilings, stories, stairs, foundations or level selector.
- No disabled placeholder Roof/Level controls in the shipping UI.
- No second production ownership or paint engine at any point after WP3 and WP4 respectively. No legacy copy of the old engines is kept for any purpose.
- No save migration. Old build deltas are dropped (§10.2).
