# Build Surface Model Refactor Plan — September 2026

**Status:** implemented, verified 2026-09-05
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
- A room reaches `reach` blocks (default 1, i.e. half a cell) beyond its seed cells only under masonry and through threshold cells, and stops at a wall's centreline. It never grows across ordinary open ground.
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

| Scope | Offered on | Writes |
|---|---|---|
| Section | any surface | the atoms in the current contiguous visible section |
| Whole interior | an interior surface | `RoomPlan.wallFinishId`; deletes explicit atoms facing that plan |
| Whole space | an interior surface in a multi-room open space | Whole interior, for every plan in the open space |
| Whole exterior | an exterior surface | the outward atoms of every wall enclosing the room behind this one, visible or not (there is no per-room exterior default to write) |
| Whole building | an exterior surface | `BuildingPlan.exteriorFinishId`; deletes explicit exterior atoms of that building, room-exterior paint included |

Which scopes appear is not a choice the player makes twice: it follows from the face they clicked (§4.10), so an interior surface never offers an exterior scope and vice versa.

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
    expandCells: ['x,y', ...],            // the only open cells expansion may enter: geometry.thresholds
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
   - a horizontal fence (separating its north pair from its south pair) if the mask has `W` or `E`;
   - a vertical fence (separating its west pair from its east pair) if the mask has `N` or `S`;
   - both fences for a lone post or terminal cap.
   A straight run has one fence; corners, T's, crossings and lone posts have two. Fences exist only *inside* a cell. Steps between cells are always open.
3. **Passability.** A straight step between adjacent blocks is passable unless both blocks lie in the same cell on opposite sides of one of that cell's fences. Entry into a terminal cap is also blocked lengthwise along its run, preventing ownership from flooding beyond an unfinished wall end. A diagonal step is passable only if both of its straight legs are passable (no corner cutting).
4. **Expansion.** For `round = 1 .. reachBlocks`: every unowned block that is passable-adjacent to a block owned in the previous round **and lies in a wall cell or an `expandCells` cell** is claimed. Expansion buries a floor under the masonry enclosing it; it does not grow the room. A block on open ground is never claimed, so a floor is exactly the cells it was drawn on — anything else means the player aims at half-tiles that are not really part of the room. All claims in a round are computed against the previous round's grid, so iteration order cannot matter. When several plans reach one block in the same round:
   - a claimant reaching by a straight step beats one reaching diagonally;
   - then the higher `priority` wins; the default priority is smaller seed area first, then lower id.
5. **Done.** Emit one immutable grid. There is no step 6.

**Why this covers every accumulated special case**

- *Floor tucks under masonry to the centreline.* A wall cell's near pair is passable from the room; its far pair is behind the fence. That is exactly half a cell.
- *Two rooms across a wall never leak.* The fence is between them.
- *T junctions and crossings.* Two fences make four quadrants, each reachable only from its own side. Nothing needs to inspect faces.
- *End caps and gaps.* An end cap keeps its fence across the full cell, so the floor edge stays straight past the end of the wall rather than stepping sideways. A gap cell is open and is resolved by expansion from both sides, meeting at the centre.
- *Doorways with an opening record.* The opening's cell is a wall cell with the same fences. Both floors meet under the door on its centreline.
- *Removing a perimeter wall.* The vacated cell is open with no seed, and expansion does not enter open ground, so the floor edge stays on the drawn cells. The player extends the room by drawing it, the same gesture that made it.
- *Open-plan boundaries.* Two seeded plans with no wall between them touch at seed edges; there is nothing to contest.
- *Outside corners of two rooms meeting corner to corner.* Straight-beats-diagonal decides the shared quarter, which was the 2026-08-16 fix, now a rule instead of a mask subtraction.

**Thresholds.** Thresholds are the one open-ground exception, passed in as `expandCells` so a doorway gap is floored from both sides rather than showing bare ground. A *threshold* is an open cell lying in the line of a wall: masonry exists at both ends of the gap along one axis, and each end is either connected outward along that axis or is a single-connection end cap. Seeds of every origin skip threshold cells during the solve so a doorway splits at its centre rather than belonging wholesale to whichever rectangle covered it. Stored seed lists remain untouched. `WallGeometry.thresholds(snapshot)` computes them; the resolver only consumes the filtered plan snapshots.

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
3. Enclosed cells owned by no plan are **proposed**: authored and detected plans may absorb them (one plan directly; several by nearest seed, straight distance, then priority), but a painted plan never grows beyond the cells the player drew. If the component contains no plan, a new `origin: 'detected'` plan is created, parented to the building owning most of its enclosing wall cells, named `Room N`, and inheriting finishes and lighting from the plan that previously owned the majority of those cells if any (dividing a room does not redecorate it).
4. Cells a plan already owns are never moved. Merging two rooms by removing a wall leaves both plans with their cells and the Navigator shows them as one open space; the player paints one into the other if they want one room.
5. Unenclosed painted cells stay with their plan and the plan is marked outdoor (`Area`).

Every proposal is a store delta inside the transaction, so undo restores it exactly.

**Projection.** `RoomRegionProjection` publishes one `SpatialRegion` per plan into the `'room'` layer with a tilemask shape equal to the plan's resolved cells (`grid.cellsOf(planId)`), and copies `indoor`, `openSpaceId` and `displayName` into `properties`. Lighting, zones, AI membership, `buildDoorRoomTopology` and the cutaway keep working against the region API unchanged. The projection is rebuilt once per transaction and is not persisted.

### 4.10 Visible-face presentation policy

Only one face of a horizontal wall is drawn at full height, and one slice per post. Which atom a slice shows is a **presentation** decision in `WallFaceResolver.visibleAtom(slice, grid)`, never persisted:

| Rendered slice (from `getPaintSpans`) | Candidate atoms | Rule |
|---|---|---|
| Horizontal band, west part | `south/0`, `north/0` | `south` when it faces outside and `north` faces a room (see below); else the one facing a room if only one does; if both do, the room with the shallower straight depth from this cell (as a pure function over the grid); if neither, `south` |
| Horizontal band, east part | `south/1`, `north/1` | same |
| Post west half | `west/1`, `west/0` | the south half if it faces a room, else the north half |
| Post east half | `east/1`, `east/0` | same |

The hidden atom's paint is never lost; it is stored and will be shown by any future presentation that reveals it (walls-down view, a per-room interior view).

**Room on one side only: the south atom wins.** Revised 2026-09-05. The first row of the table said "the one facing a room if only one does", which put a room's own paint on the outside of its front wall and left a building's exterior unreachable — on a simple house every band has a room on one side, so the room atom always won, the exterior atom was never presented, and what is never presented can be neither clicked nor painted. There was no way to paint a house's outside at all.

The camera is south of the wall, so the face you are looking at is the south one. With a room on one side only that side is what is shown: the inside of a room's back wall, the OUTSIDE of its front wall. This is not a mode and there is no interior/exterior toggle — which face you get is which wall you clicked. `fixtures/front-wall-exterior` pins both halves of it.

**A corner belongs to its run.** A band half with masonry behind it — the returning arm of a corner or a T — has one buried face, so its own faces cannot say what it is: the only classification left is whichever side happens to be open, which at a corner is the room even when the run itself fronts the outside. `visibleSurface` therefore takes the identity of the nearest band on either side that can answer (`neighbouringRunSurface`), outside included, and only keeps its own when the two sides disagree. Without it a wall wore two surfaces — interior at both ends, exterior in the middle — and a paint stretch broke off at every junction. A free end has no buried face and keeps its own answer when it has one; it inherits only when it has nothing to say for itself, and outside counts as an answer there too — a wall that runs on past the corner of a room fronts nothing but outside, so reaching over its exterior neighbour for a room further along dressed the last cell of a run in a colour nothing beside it was wearing. The `terminal-half` contract was revised for this on 2026-09-05: the room section stops where the room does.

**An arm's sides carry through its junction.** The same argument holds for posts. Where an arm leaves the wall it hangs off, that cell's post faces sit flush against the wall's own masonry: `lookBlock` reads into the arm's cell, and because floor ownership expands under masonry the block answers with whichever room's floor runs up to it. The junction sliver then wears a neighbouring room's finish while the arm below it carries on in another — the unpainted stub at the top of a painted arm. `postSurface` gives a covered post (mask has an arm on that side) the surface of its own vertical run, read south first and then north past any other junction — a run can pass straight through with a room above and the yard below, and the sliver goes with the half the camera sees, which is the same call the bands make.

For the same reason a **buried band half takes the side it is on**: the arm burying it is a seam, so the west half continues the run west and the east half continues it east, and the two are allowed to differ — that is two surfaces meeting on the post between them. Asking both ways and giving up when they disagree left the half beside an arm wearing the face behind it while the wall it continues went on without it. A free end has no arm and no seam, so it still needs both sides to agree. Pinned by the `an arm carries its own sides through the junction it hangs from` and `a junction post takes the southern half of its run` contracts.

The hidden atom is still stored and still painted by the scopes that own it: a room's interior finish is a room-level default, so the interior face of a front wall takes the room's colour without ever being visible, and the same holds for the outward face of a back wall under a building's exterior finish.

Scopes follow from the face, in `SurfaceCustomizePanel`:

| Selected surface | Offered |
|---|---|
| Interior (the face belongs to a room) | Section · Whole interior (that room) · Whole space (when the room is part of a multi-room open space) |
| Exterior | Section · Whole exterior (every outward atom of the walls enclosing the room behind this one, visible or not) · Whole building (the shell loop, stored as `exteriorFinishId`) |

Room-exterior paint is written as atoms, since there is no per-room exterior default; a later whole-building paint supersedes and clears them, as it does any exterior atom.

**Both sides rooms: the depth rule, kept deliberately.** Here "south always wins" would make a room's own front wall wear the neighbour's colour, which is the complaint that produced the rule in the first place — and unlike the exterior case above, no outside is involved, so there is nothing the camera argument settles. As a pure function over the grid (count consecutive owned blocks straight north and south of the cell) it is ten lines, deterministic, and covered by the `hallway-front-wall` fixture.

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
  BuildDirty.js                dirty cells/blocks + consumer invalidation         ≤ 150
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
  WallSurfaceRuns.js           run-inheritance walks for §4.10                   ≤ 200   pure
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

**Buildings are created here, and nowhere else automatically.** A room's *Move to building* select and the *Unassigned walls* row both carry a **New building…** option (`BuildInspector.buildingPicker`), which is the only hand-made building in the product. Everything else adopts: new walls take the building of the structure they touch, then of a room they run alongside, then a fresh one (`WallStructure.resolveBuildingId`), and enclosing an outdoor Area moves that room into the building its new walls made (`adoptRoomIds`). A building left holding neither walls nor rooms is pruned inside the same transaction (`BuildTransaction.pruneEmptyBuildings`), so moving a room out of a building it was alone in does not leave a row behind; undo restores both together.

### 8.3 Context rules

- **One click is the thing, two is what it belongs to.** On a wall: click a segment, double-click the run. On a floor: click selects the *room* — tinted through its own mask, with Paint floor / Paint walls / Edit area / Building on the stage bar and its properties in the Inspector — and double-click selects the whole building. Selecting Building scope on a wall that has no building plan says so instead of quietly collapsing to one cell.
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

## 13a. Findings from playtesting, 2026-09-04

Implemented findings are marked below. Everything here was measured against Ryan's own Sandbox save (three painted rooms with partial walls), not a synthetic fixture.

### How to verify anything in this area

This cost most of the session and is the single most useful finding.

- **Synthetic `tx.run(...)` tests prove nothing here.** Building a plan object by hand and committing it does not exercise the path the player uses.
- **The Room tool paints into the *selected* plan**; it does not create one. Any test that invents a fresh `origin: 'painted'` plan is testing a situation the player never produces.
- **The default House map has zero unowned cells** — all 900 belong to a `zone_*` plan. Any rule conditioned on "neighbouring ground is unowned" is dead on that map and cannot be reproduced there.
- Load a real save instead: `copy(JSON.stringify(localStorage))` from the browser, inject it with Playwright's `addInitScript`, and measure `buildTransaction.cache.grid` — or drive the actual tool buttons (`#tool-room`, `#tool-wall`) after neutralising the headless loading modal and the stage's `visibility: hidden` (see the `verify` skill).

### 0. A floor is exactly the cells it was drawn on — IMPLEMENTED

Expansion claimed any passable-adjacent block, so a room drawn on open ground bled half a tile outward on every side. That put a half-tile skirt around every floor which looked like part of the room and was not, so nudging a room's edge tile by tile never matched the gesture. Expansion is now restricted to wall cells and `expandCells` (thresholds).

Measured on Ryan's Sandbox save, `room_painted_3` (drawn `x44..53, y2..17`): the left edge sits at **43.5** on rows with a wall at x=43 and at **44** on rows of open grass; the right edge at **54** on open rows and **54.5** where the wall at x=54 runs. Exactly the drawn cells, except where the floor runs under a wall.

Five fixtures were re-expected (`corner-to-corner`, `l-room`, `open-boundary`, `open-corridor`, `red-line-split`). Every walled fixture is unchanged, which is the check that the wall tuck and the doorway split survived.

### 0b. A doorway wider than one cell now splits down its centreline — IMPLEMENTED

`WallGeometry.findThresholds` only recognised a **single** open cell in the line of a wall, so a doorway two or more cells long was not a threshold at all. Its cells were seeded by whichever plan was drawn over them, so that plan's floor ran to the far edge of the opening while the same two floors met on the wall's centreline either side of it — the join between two floors visibly jogged half a tile exactly where the wall stopped.

`isThresholdAxis` now walks the run of open cells to the masonry at each end. It cannot mistake a room for a gap: `pointsOutward` already requires the wall at each end to carry on *along* that axis, so a room's own perpendicular walls never qualify however far apart they are.

Paired with it, threshold cells are dropped from every plan's seeds before ownership is solved (`BuildTransaction.seedsOffThresholds`), painted plans included — an opening belongs to both sides. **Stored room definitions are untouched**; only the solve sees the filtered list.

Measured on Ryan's Sandbox save, rooms 4 and 5 either side of the divider at `x=29` (wall present at `y34–36` and `y41–42`, missing at `y37–40`): the seam was `29.5` beside the wall and `30` through the gap, and is now **29.5 on every row**. Fixture `wide-doorway-splits`.

**This supersedes §14 item 3**, which kept a painted seed on a threshold.

### 1. Part-tile of floor hanging off the end of an unfinished wall — **FIXED**

`FloorOwnershipResolver.canStep` applies a wall cell's fences **only to moves inside that cell**; entering a wall cell from a neighbouring cell is always permitted. So a room lying past the end of a wall flows into the end-cap cell *lengthwise* and fills it, and a cap's rounded art does not cover a whole cell — the surplus shows as a part-tile hanging off the wall.

Note this contradicts §4.7, which already claims "an end cap keeps its fence across the full cell". `fencesForMask` does not do that: for a cap mask (one connection) it returns a fence on one axis only.

A fix was written and verified — all 10 end caps on Ryan's save went from flooded to clean with all fixtures still green:
- allow entry into a terminal wall cell only **perpendicular to its run** (a lone post, having no length, still takes floor from every side); and
- give a cap (`connectionCount(mask) <= 1`) a fence on **both** axes.

The fix is now retained and guarded by the rotation/mirroring fixture `unfinished-wall-end`.

### 2. A wall drawn beside a room moves that room's floor half a cell

Measured: a floor's edge sits on its boundary cell; drawing a free-standing wall stub on the next cell out moves it to that wall's centreline. The plan does not grow — `proposeSeeds` is not involved — it is the tuck firing for any adjacent wall, enclosing or not.

**Nothing local distinguishes this from the correct case.** A wall that bounds a room and a stub stood beside it occupy identical cells relative to the floor. Two rules were tried and both fail:
- *enclosure* ("the plan's cell is in an open component that does not touch the map edge") breaks ten fixtures — every room running to the edge of the map stops tucking under its own walls;
- *separation* ("the wall divides two open components") fails `red-line-split`, where you can walk around the wall so it separates nothing, yet the tuck there is correct and reviewed.

The likely answer is intent recorded when the wall is drawn — the wall knowing which room it bounds — rather than geometry recovered afterwards. Unresolved.

### 3. A half-tile inset is not reachable per cell

Ryan asked for a floor to stop half a tile inside the cells he painted, so that walling its perimeter would not shift it. Implemented per cell it produces **ragged** edges, because the floor then lands in three different places along one straight edge. Measured on `room_painted_1`'s right edge:

```
y6–y9    x = 36.5   (bare ground beyond → pulled in)
y10–y15  x = 37     (room_painted_2 beyond → flush)
y16–y18  x = 36.5   (bare ground again → pulled in)
```

Insetting against neighbouring plans as well makes each edge uniform but leaves a full cell of bare terrain at every room-to-room junction, which is worse. For the three cases to agree, the wall would have to occupy the room's **own** boundary cell — a change to what a room's footprint means, not a resolver tweak. Do not re-attempt without that.

### 4. Wall paint breaks off a half-cell section at every corner — IMPLEMENTED

A corner cell's band is buried on the room side by the arm turning away from the run, so classified on its own it becomes an `exterior` section — a 16px paint target at each end of a run that refuses the colour the rest of the wall takes. On the House map a wall run resolved as 19 sections where 17 were correct.

A fix was written and verified: a single entry point returning the visible atom **and** the surface it paints as, where a horizontal band buried on its room side inherits its neighbour's surface along the run, storing paint on the atom that is not buried. Both `WallRenderer.getPaintSpans` and `WallFaceResolver.sections` must go through it or the artefact returns.

### 5. Smaller findings

- **Threshold seeds in the live path — FIXED.** `BuildTransaction.derive` filters threshold cells from every plan snapshot passed to the resolver; stored room definitions remain untouched. Ryan's call on 2026-09-04 was that painted seeds skip them too — painting across a doorway says which floor goes there, not that one room owns the opening. **This supersedes §14 item 3.**
- **Wide thresholds — FIXED.** `WallGeometry.findThresholds` walks across an arbitrary-length gap to the masonry at both ends, so multi-cell doorways split consistently.
- **Painted plans growing into newly enclosed ground — FIXED.** `RoomTopology.proposeSeeds` no longer enlarges an `origin: 'painted'` plan. Authored/detected enclosure filling and wholly new detected rooms retain the plan's original behavior.
- **`FloorRenderer.computeOwnership` was a second, region-seeded ownership engine. — FIXED.** It has been removed. `FloorRenderer` accepts only the canonical grid supplied by `BuildTransaction`, and `SurfaceDebug` reads that same cached grid without mutating renderer state.
- **The build grid is bounded to `.canvas`, which is the padded render area.** The map reserves render padding for tall wall art (160px above, one cell all round), so the grid tiles across space nothing can be placed in — 32×36 cells drawn for a 30×30 map. The debug overlay draws only the real grid, which is why it reads better.
- **Removing a room definition left its empty plan behind. — FIXED.** Room removal now transfers the plan's authored seed cells to its chosen neighbour, deletes the source `RoomPlan` in the same transaction, and remains undoable. A still-enclosed space may immediately receive a fresh detected plan, but the removed zero-tile definition no longer remains as a grey row.
- **Choose was selectable with no room on the map. — FIXED.** The Room Areas panel disables Choose when no projected room owns tiles and switches the active operation to Add.
- **A cutaway ended flat where a wall ran out. — FIXED 2026-09-05.** Ryan's rule: *a lowered window is one or more stub cells with a stepped transition either side of it, or there is no window at all.* Three things were wrong. (1) The August spec let a pure end cap join a lowered run with no transition of its own, so wherever a wall simply stopped the cutaway showed a square end — `resolveHorizontalBoundary` now stands a free end like any other boundary and `reserveTransitionBesideFullCap` hands the step to the cell inside it. **This supersedes the end-cap exception in the wall spec's cutaway rules.** (2) The chain rules were skipped entirely for any render piece that was not wholly horizontal, so a run inside a wrapped wall — every room with corners — fell back to raw states and stepped straight from full height to stub; chains are now resolved per cell, so a piece spanning several of them gets each one resolved. (3) `enforceTransitionBoundaries` is the rule itself: a lowered island whose flanking cells cannot draw the straight ramp frame — a corner, a junction, an end cap, an opening, or the end of the run — is raised back. A wall with only one straight cell between its corners therefore never cuts away, and neither does one whose boundary cell is a door. "Walls down" is untouched: every wall is down there, by definition.

## 13b. Cutover verification, 2026-09-05

- The v8 stores, transaction, ownership resolver, topology projection, atom renderer, chunked floors, geometric wall hit testing, Tiled exporter and shared build history are live. The former room-assignment, enclosure, building-topology and floor engines are deleted from production and the manifest.
- The module budgets in §6 pass. `BuildTransaction` is 264 lines; the four named wall subsystems are within their hard limits; `WallBuilder` is a 141-line facade. `BuildDirty` owns renderer and consumer invalidation so the transaction stays below its limit.
- The Node suite passes 23 fixtures in 184 orientations, 11 geometry contracts, 100 randomized ownership cases, 40 randomized transaction edits, v8 round trips, v7 reset, exact undo/redo and geometric hit-test cases.
- Real House-map browser checks pass Section, Room, three-plan Space, Exterior and Floor preview/apply parity. Each gesture performs one geometry build, one ownership solve and one topology build; previews do not mutate live stores; undo restores the stores exactly.
- Navigator and canvas selection share `BuildSelection`. The Inspector exposes persisted building/room names, room-to-building assignment, atom finish provenance, building attachments and the required building commands. Tool keys `1`–`5`, layered Escape, duplicate, merge, separate, demolish, undo and redo were driven in the browser.
- Fresh saves contain only `build`, `droppedItems`, `mapId`, `objects`, `savedAt` and `terrain`. A v8 save restored byte-identical serialized deltas and stores, and a real page reload preserved room wall/floor finishes, names and building assignment.
- House renders without console or page errors in Up, Cutaway, Down and Hidden presentations at native zoom. Solid wall points resolve atom addresses, opening apertures fall through, and pointer sweeps leave `imageDataReads` at zero.
- Moving and cancelling both an opening and a fixture keeps the live object, renderer cache and canonical attachment store aligned. One completed drag produces one shared-history command with exact undo/redo. Fixture placement now resolves straight spans inside geometry pieces, so endpoint junctions no longer make every House wall reject a returned painting.
- Build commits are the persistence and derived-consumer boundary. Paint-only commits skip door topology and lighting; structural revisions invalidate those consumers once. Content, time-source and text-encoding validation pass.

## 13c. Follow-up fixes, 2026-09-05

Playtesting after the cutover. Each entry is the rule, not the diff; the code carries the reasoning.

**Buildings**

1. **Nothing could create a building.** They came only from authored Tiled data, and `BuildDocument.collectBuildings` invents one only for a map that already has wall tiles — so on a wall-less map everything built was unassigned: "Unassigned walls (N)" in the Navigator, only *Site* in a room's building select, and Building-scope selection collapsing to one segment. Adoption, hand-creation and pruning are described in §8.2. The old fallback — *the first building on the map* — is gone; it silently annexed every shed to the house.

**Rooms**

2. **A renamed room reverted in the Rooms panel.** The row's input read `properties.playerName`, which only the pending-room stub ever writes; a rename writes `displayName` on the plan. The field is derived now — `displayName` when it differs from `authoredDisplayName`, else empty with the authored name as placeholder — so the panel and the Inspector agree.
3. **An enclosed room still offered Finish walls, and built a second ring around the first.** `RoomPanel.perimeterPlan` ringed the room's resolved cells, which include the masonry its floor expands under (§4.7), so the ring landed one cell beyond the walls already there. It rings the room's *open* cells now. `demolitionPlan` runs off the same function and was wrong in the same way.

**Wall surfaces** (§4.10 carries the rules; this is what changed and why)

4. **A room's front wall wore the room's own paint.** The visible-atom table said "the one facing a room if only one does", which made a building's exterior unreachable — never presented, so never clickable or paintable. With a room on one side only the **south** atom wins: the inside of a back wall, the outside of a front wall. Both sides rooms keeps the depth rule. An Interior/Exterior toggle was built first and removed: which face you get is which wall you clicked, not a mode.
5. **Slivers at junctions belonged to nobody.** Three rules, all the same principle — a face that cannot speak for itself takes the surface of the run it belongs to. A buried half takes **its own side** of the arm burying it (the seam is the point; the two sides may differ). A free end takes what its neighbour has, outside included. A covered post takes its vertical run, **south first**. Before these, one wall could wear three surfaces and a paint stretch broke at every junction.
6. **The palette showed plaster over a painted wall.** `getCurrentFinishId` looked the override up without the half; atom paint is keyed on the atom.
7. **Pulling a wall out striped the new cells.** Growth is seeded from the corner the run pulled away from, and a corner carries at most one painted half — on whichever face survived being buried. A painted face now fills its whole axis (both halves, both facings) on the new cells and on the run's moved ends; which atom a cell will show cannot be known at mutation time, since masks and ownership are derived after it.

**Cutaway** — see the entry in §13a.5.

**Module map.** The inheritance walks moved out of `WallFaceResolver` into `WallSurfaceRuns` (§6): with three of them the resolver had grown to 356 lines against a 250 budget. Both are pure, and only the walks moved — `classify`, `visibleAtom`, `visibleSurface`, `classifyPaintAtom` and `sections` stay where callers expect them.

**Suite:** 24 fixtures in 192 orientations, 14 geometry contracts, 100 randomized ownership cases, 40 randomized transaction edits. New: `fixtures/front-wall-exterior`, and contracts for the arm's sides, the junction post, and the run between two returning walls. Revised: `terminal-half`, which asserted that a wall continuing past a room's corner stayed in the room's section — written when exterior faces could be neither seen nor painted. The room's section stops where the room does.

## 14. Questions closed 2026-09-03

Ryan's direction: do whatever gives the best result; migration is unnecessary; legacy need not be preserved.

1. **Visible band when both sides are rooms:** the depth rule, as a pure function (§4.10).
2. **Old saves:** reset, no migration, no legacy folder (§10.2).
3. **Thresholds:** every gap cell in the line of a wall splits at its centre, including cells present in a painted plan's stored seeds (§4.7 and §13a.0b).
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
