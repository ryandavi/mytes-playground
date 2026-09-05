# Build Mode UX and Building Foundations — 2026-08

## Scope

This is the implementation brief for the next build-mode pass.

**Do not implement roofs in this pass.** Build the wall, room, paint, fence, and shared building foundations so roofs and more complex buildings can be added later without replacing today's work.

The interface should teach through names, icons, hover previews, cursor feedback, and visible results. Persistent prose is a fallback, not the primary design.

## Product decisions

- Keep toolbar names short: **Select, Move, Wall, Fence, Paint, Ground**.
- Rename **Surface** to **Paint** everywhere visible to the player. Internal class and mode names do not need a risky mechanical rename.
- Remove **Room** from the primary build toolbar. The current tool edits logical room ownership; it does not construct what players understand as a room.
- Walls remain distinct from fences. They share interaction code, but walls define buildings and rooms while fences define outdoor barriers.
- Gate choices live inside **Fence**. Door and window placement belongs in the **Wall** workflow when those inventory flows are expanded.
- Closing a wall enclosure creates/recalculates rooms automatically. Manual logical room editing remains available as the advanced **Room Areas** panel/action.
- Extending an existing wall matches that wall by default.
- A clicked wall face is the unit of paint selection. Never silently paint both sides.
- Add an explicit building concept now only where it has immediate value, chiefly connected exterior paint and stable topology. Do not build roof UI, roof rendering, or speculative roof data.

## 1. Player-facing tool structure

Keep the current compact toolbar rather than introducing long compound names or deep menus:

| Tool | Meaning |
|---|---|
| Select | Select one or several built objects. |
| Move | Move furniture and other movable objects. |
| Wall | Draw, extend, move, remove, or outline structural walls. Closed outlines form rooms. |
| Fence | Draw barriers, select their style, and place compatible gates. |
| Paint | Change visible wall and floor finishes. It can later accept other paintable kinds without changing its name. |
| Ground | Paint terrain and manage terrain layers. |

Use subtle grouping in the toolbar layout if space allows:

- **Build:** Wall, Fence
- **Decorate:** Paint, Ground

These group labels may be visually compact or accessible-only. Do not rename tools to “Walls & Rooms” or “Fences & Gates.”

### Room Areas access

The existing Room feature should remain because logical regions are useful for open-plan labels, porches, lighting zones, and authored exceptions. Reframe it as advanced editing:

- Remove its permanent toolbar button and number shortcut.
- Add **Room areas…** to the selected room's contextual actions/properties.
- Keep direct navigation from Paint when a room is selected.
- Rename the panel title to **Room Areas**.
- In this panel, use **Choose, Add, Remove** for logical area operations.
- Make it clear through the tile overlay and cursor that this edits floor ownership, not walls.

The ordinary workflow must not require this panel. Wall enclosure detection remains authoritative for ordinary rooms.

## 2. Wall behavior

### Closed enclosures

The Wall tool owns the normal “make a room” workflow:

- Drawing a closed boundary triggers enclosure detection and room reconciliation.
- Rectangle mode creates four wall runs and the enclosed room in one gesture.
- Extending, moving, or removing walls reconciles affected rooms after the geometry commit.
- Existing room identity, name, floor finish, wall finish, and lighting should survive topology edits where overlap makes the intended match unambiguous.
- A split inherits from its prior room; a merge keeps the dominant room and preserves the other room's data for undo.
- All geometry and reconciliation changes are one undoable user action.

Do not create a second room-detection path in the panel. The enclosure detector and room-assignment systems are the single source of truth.

### Match on extension

Pulling or lengthening an existing wall means “continue this wall.” New cells inherit:

- construction/material family;
- wall height;
- connection group;
- compatible structural metadata;
- exterior face finish from the endpoint;
- deliberate per-section face overrides from the run;
- the room's wall finish for any face owned by an enclosed room.

Resolution order:

1. An explicit wall style the player selected for this gesture.
2. The grabbed run or endpoint where the gesture began.
3. A compatible adjacent wall at the starting endpoint.
4. Room or building defaults.
5. Global defaults.

Sample once when the gesture starts. Crossing another wall during the drag must not change the sampled style.

Moving a run preserves its existing cell and face data. Extending a run uses the sampled template for only the newly created cells. Undo restores both geometry and metadata.

If there is a wall style control, show **Match** as its compact default state when starting from an existing wall. Otherwise, communicate matching through the ghost preview and omit extra text.

### Shared line-building code

Wall and Fence should continue to share the line, rectangle, ghost, cursor, sound, rejection, and drag lifecycle in `CellDragBuildPanel`. Extract new shared behavior only when both tools actually need it.

Keep these differences behind their builders/panels:

- structural enclosure and room reconciliation: Wall only;
- room/exterior face ownership: Wall only;
- inventory return and barrier variants: Fence only;
- gates: Fence-compatible opening/object placement;
- doors and windows: Wall-compatible opening/object placement.

Do not make one universal barrier model that branches on many type flags. Reuse gestures and placement contracts while keeping semantic builders separate.

## 3. Paint behavior

### Naming and panel text

Change visible copy:

- Toolbar: **Paint**
- Panel title: **Paint**
- Empty prompt: **Choose a wall or floor.**
- Dynamic palette heading: **Wall finish** or **Floor finish**

Remove long persistent instructions about hover, double-click, Alt, and Escape from the main path. Retain shortcuts in control titles, accessible labels, and a compact help affordance if needed.

Make sampling discoverable with a small eyedropper button/action. Alt-click may remain as the shortcut, not the only way to discover the feature.

### Wall scopes

Replace the current labels:

- **This stretch** → **Section**
- **Whole room** → **Room**

Add **Exterior** after connected building components are available.

Definitions:

- **Section:** connected visible face in one direction, owned by the same room or exterior region, stopping at corners and paint/ownership seams.
- **Room:** every interior wall face owned by the selected room. It does not cross into another logical room, even if there is no dividing wall.
- **Exterior:** every outside-facing wall surface in the selected connected building component. It does not paint interior faces, a detached building, or an enclosed courtyard loop selected separately.

Only show relevant scopes:

- floor: no scope switch;
- interior wall: Section, Room;
- exterior wall: Section, Exterior;
- wall between two rooms: pointer side determines the room and face;
- outside face with no resolved building: Section only.

Never use **All sides**. It could mean both faces of one wall, one room's boundary, or a whole building.

### Preview is the explanation

The hover overlay must tint exactly what a click will change:

- Section follows its visible run.
- Room wraps every owned interior face.
- Exterior wraps corners across the connected outside shell, including currently occluded faces.

Changing scope updates the hover and selection overlay immediately. Scope and commit must consume the same resolved target set; do not calculate preview and mutation separately.

The current side-wall split is intentional. A north-south wall may visibly contain two half-width surfaces belonging to different spaces. Preserve per-face hit testing and ownership.

## 4. Buildings: foundation only

Introduce a small read-only topology concept that can be reused by Exterior paint and future systems.

### Definition

A **building component** is a connected component of structural wall cells associated with at least one enclosed room. It has:

- a deterministic runtime component key;
- structural wall cells;
- member room IDs;
- outer exterior-face loops;
- inner exterior-face loops such as courtyards;
- a footprint derived from enclosed room cells;
- bounds and topology revision.

Open door/window records do not disconnect a building. Touching only at a diagonal does not connect two buildings. Fences never join buildings.

Do not persist generated component membership as authoritative state. Derive it from wall geometry and room enclosure. Persist only stable player-authored intent when a future feature needs it.

### Single source of truth

Create one topology service owned by the map/build environment, rather than separate “connected wall” walks in Paint, lighting, future roofs, and selection.

Suggested API shape (names may adapt to nearby conventions):

```js
buildingTopology.rebuild(changedCells)
buildingTopology.getComponentAtWallFace(cell, face)
buildingTopology.getComponentForRoom(roomId)
buildingTopology.getExteriorSurfaces(componentId, loopId = null)
buildingTopology.getFootprint(componentId)
buildingTopology.getRevision()
```

Requirements:

- rebuild after authoritative wall geometry/room reconciliation events;
- cache results by topology revision;
- expose plain data, not DOM or paint-specific objects;
- use canonical cell/edge keys shared with wall geometry utilities;
- emit one topology-changed event containing affected old/new component IDs;
- remain usable by headless simulation code;
- avoid inventing roof planes, stories, or façade concepts now.

Exterior Paint is the first consumer. Later consumers may include lighting, weather shelter, camera cutaway, whole-building selection, ambient audio, and roofing.

### Future-building invariants

Preserve these seams while implementing current work:

- Rooms and buildings are not the same: one building can contain many rooms.
- A building can have concave L/T/U footprints, projections, recesses, and courtyards.
- Detached structures are different components.
- Exterior faces are loops, not one bounding rectangle.
- Wall tops should eventually expose semantic attachment geometry through the existing attachment/socket pattern; do not bake roof offsets into wall sprites now.
- Construction, finish, and trim-like overlays should remain separable concepts. Do not multiply atlas entries for every color combination.
- Generated topology comes from walls and room footprints. Future features store overrides and player intent, not duplicated generated geometry.

These are constraints on today's interfaces, not tasks to implement roofing.

## 5. Fence and openings workflow

Keep **Fence** as the toolbar name and panel title.

Near-term:

- Keep fence styles in the Fence panel.
- Add a compact Gates section populated from compatible owned inventory.
- Selecting a gate changes the map preview to valid fence insertion cells.
- Dropping a gate replaces the fence piece through the existing barrier placement rules.
- Removing it returns owned content consistently with current inventory semantics.

Reuse the existing fixture/opening placement contract where it is genuinely compatible, but keep wall openings and fence gates registered by target kind. Compatibility belongs in definitions/registries, not hard-coded UI lists.

The same pattern should later let the Wall panel expose owned Doors and Windows without making either word part of the toolbar label.

## 6. Other high-value improvements

Include these when they fit the existing systems without derailing the core pass:

1. Make eyedropper visible in Paint while retaining Alt-click.
2. Allow replacing a selected wall/fence run's style without rebuilding it.
3. Add Duplicate for selected movable objects where inventory/cost rules are defined.
4. Add rotate/flip affordances only for objects that declare supported transforms.
5. Use a contextual Delete action rather than adding a permanent Bulldoze tool.
6. Show inventory/cost impact in build ghosts where the underlying builders already know it.
7. Preserve room identity and finishes through wall edits and undo.
8. Make multi-selection property editing use the same registered property definitions as single selection.

Do not add speculative tools without their underlying game rule. In particular, defer stories, stairs, foundations, roof controls, whole-building movement, and unreachable-room validation until their system requirements are decided.

## 7. Implementation order

Complete and verify each block before the next. Reuse current registries, builders, config, history, and events before adding abstractions.

### A. Copy and navigation

- Rename visible Surface copy to Paint.
- Rename scopes to Section and Room.
- Shorten the empty-state copy.
- Remove Room from the primary toolbar and shortcut sequence.
- Rename the panel Room Areas and keep contextual navigation to it.
- Ensure tool shortcuts and titles remain consistent after the removal.

### B. Wall extension inheritance

- Add a canonical wall-cell template/sample method to `WallBuilder`.
- Use it for handle extension and endpoint-started extension.
- Preserve metadata through moves and undo/redo.
- Make previews render from the same sampled template as commits.

### C. Room reconciliation

- Confirm every wall add/remove/move path invokes the existing authoritative enclosure reconciliation once.
- Preserve room data by overlap through split/merge.
- Keep the full gesture atomic in build history.
- Ensure rectangle walls produce the expected enclosed room without manual Room Areas work.

### D. Building topology

- Add the shared derived topology service and event.
- Cover disconnected structures, multi-room buildings, concave footprints, courtyards, diagonal contact, and openings in tests.
- Do not add roof rendering or roof-specific records.

### E. Exterior paint

- Add Exterior only for resolvable outside faces.
- Use topology-service exterior loops for preview and commit.
- Persist through the existing surface/world-state path.
- Verify detached buildings and courtyard loops remain independent.

### F. Fence integration

- Expose compatible owned gates in Fence if inventory/definitions provide them.
- Share placement validation and preview conventions with wall fixtures/openings where appropriate.
- Keep gates absent or disabled cleanly when none are owned.

### G. Focused polish

- Add the visible Paint eyedropper.
- Evaluate replace-style and contextual Delete against existing selection/history contracts.
- Remove redundant instructional copy only after preview and cursor feedback fully communicate the action.

## 8. Acceptance criteria

- The toolbar uses short names and no `&` labels.
- A new player can build a rectangular room using Wall without opening Room Areas.
- Extending a styled wall produces a visually matching extension and retains metadata through undo/redo.
- Clicking one side of a shared wall never paints the other side.
- Section, Room, and Exterior previews exactly match committed results.
- Room does not paint a neighboring logical room merely because no wall divides them.
- Exterior paints one connected building shell, not detached structures or interior faces.
- Complex concave buildings and courtyards are represented as topology loops, not bounding boxes.
- Fence and Wall reuse interaction machinery without sharing incorrect structural semantics.
- No roof UI, roof art, roof generation, or roof persistence is introduced.
- New tunable values live in `SiteConfig`; IDs and definitions live in registries/data; no duplicate geometry or scope walkers are introduced.
- SCSS changes use existing tokens and sources; JS changes are bundled; content validation and browser verification pass.

## 9. Deferred building direction

Future exploration may include richer building identity, façades, trim, shelter, stories, foundations, roof generation, camera cutaway, weather interaction, and whole-building operations. The topology and wall-face work above should make those possible, but none should be guessed into the current UI or persistence model.

When roofing is eventually designed, it must derive from actual contiguous room/building footprints—including projections, recesses, concave outlines, and courtyards—and use composable semantic sprite parts. It must never treat a custom building as one triangle over a bounding box. That is the only roofing requirement carried by this pass.
