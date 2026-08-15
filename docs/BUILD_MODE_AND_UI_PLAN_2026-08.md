# Build Mode & UI Restructure Plan — 2026-08

Sims-style split of the game into **Play mode** and **Build mode**, plus a sidebar
declutter: the sidebar becomes tools-only, settings collapse into one tabbed panel,
and the world map / event log move to corner overlays.

This doc is written to be delegated. Each workstream (W1–W8) is self-contained,
lists the exact files to touch, and states acceptance criteria. Suggested owners
are at the end. Read AGENTS.md first — especially: new JS files must be added to
`scripts/script-manifest.json`, all events go through the `EVENTS` registry
(`js/Engine/EventNames.js` or wherever the registry lives — grep `EVENTS.`), and
CSS is edited in SCSS source then compiled
(`npx sass css/style.scss css/style.css --no-source-map`).

---

## Current state (verified 2026-08-15)

**Sidebar** (`#hand-controls` in `index.html`, managed by
`js/UI/Container/ToolManager.js`): three tool radios (Select `s`, Drag `d`, Pet `p`)
plus **eight** toggle buttons: `settings-toggle`, `sound-toggle`, `view-toggle`,
`customize-toggle`, `build-toggle`, `log-toggle`, `world-map-toggle`, `debug-toggle`.
Each opens a `ModalWindow` subclass (`js/UI/Core/ModalWindow.js`), all registered
in `SiteConfig.ui.panels` and rendered by `js/UI/Core/PanelRegistry.js`.

**Tab infrastructure already exists**: `PanelRegistry.renderTabs()` +
`js/UI/Core/TabController.js`, used by `MyteInfoPanel` and `UserProfilePanel`.
Reuse this — do not invent a new tab system.

**Tool modes** (`UIToolModes` in `js/UI/Core/UIComponent.js`): SELECT, DRAG, PET,
CUSTOMIZE, BUILD. CUSTOMIZE/BUILD are already exclusive tool modes that force
walls up via `ToolManager.applyToolModeState()` →
`wallBuilder.setPresentationOverride('up')`.

**Pause**: `GameTime.pause()` exists (stops the game clock only). There is **no**
simulation pause — `Core.startUpdateLoop()` always runs `tickUpdate` +
`container.update`. Building pause is new work (W1).

**Furniture moving**: `MapObject.canBeDragged()` (`js/Map/MapObjects/MapObject.js:1175`)
gates dragging; storing to inventory is `ActionSidebarManager.getInventoryStorageState()`
+ drag-to-inventory in `js/Map/MapObjects/MapObjectInputController.js`; placement
from inventory is `Inventory.beginPlacement()` (`js/User/Inventory.js:470`).

**Rotation already exists**: hold-drag an object and press `R`
(`MapObjectInputController.js:73-81`), gated on the object having
`directionConfigs` and `SiteConfig.objects.canRotate`.

**Walls**: `js/Map/Walls/WallBuilder.js` keeps `baseCells` (current) and
`authoredBaseCells` (map-authored); user edits serialize as deltas. Edits flow
through `WallBuildPanel.commitCells()` → `builder.applyWallCellChanges(changes)`,
which already snapshots `previousCells` for rollback-on-error — a natural hook
for undo. **No collision validation exists** — you can currently wall over
objects and mytes.

**Wall presentation modes** (up/down/cutaway/hidden) live only inside the View
panel (`.wall-presentation-controls` in `index.html`, wired in
`js/UI/Panels/ViewPanel.js`).

**Keyboard**: `ContainerInputManager.setupKeyboardShortcuts()`
(`js/Container/ContainerInputManager.js:135`) reads tool shortcuts from
`ToolManager.toolConfig` and hard-binds `m` → sound mute. **`m` must be
reassigned** before the world map can take it.

---

## W1 — GameMode system + build-mode pause (foundation; do first)

Everything else keys off this.

### 1a. `GameModeManager`

New file `js/Engine/GameModeManager.js` (add to script manifest). Small class,
owned by the container (instantiate in `ContainerManager` next to `ui`):

- `mode`: `'play' | 'build'`; `isBuild()`, `isPlay()`, `setMode(mode)`.
- On change: set `document.body.dataset.gameMode` and
  `containerWrapper.dataset.gameMode` (CSS drives all show/hide from these —
  avoid scattering JS visibility toggles), emit `EVENTS.GAME_MODE_CHANGED`
  (add to the event registry) with `{ mode, previous }`.
- Entering build: clear selection (`ui.setSelected(null)`), switch tool to
  SELECT, pause simulation (1b), remember the camera follow mode and switch to
  Pan (`follow-mode-btn` mode 3) so the map doesn't drift while building.
- Leaving build: cancel any in-flight wall drag / placement
  (`wallBuildPanel.cancelDrag()`, `inventory.cancelPlacement()`), close build
  panels, clear undo history (W7), resume simulation, restore camera follow
  mode, force one `worldState.captureMap` + `user._scheduleSave()`.

Toggle UI: a single prominent **Build** button in the sidebar (replaces the two
current wall buttons as the entry point), plus keyboard `b`. Style it like a
mode switch, not a panel toggle (aesthetic: chunky Win98 pressed/raised state).

### 1b. Simulation pause

Do **not** stop the RAF loop — rendering, camera, particles, and UI must stay
live so building feels responsive. Pause the *simulation* layers:

- Add `Core.simulationPaused` (boolean) with `setSimulationPaused(flag)`.
- In `Core._updateFrame` (`js/Engine/Core.js:482`): when paused, skip
  `SimClock.advance(deltaTime)` and the `tickUpdate` drain loop entirely
  (SimClock freezing is what makes cooldown/state-aging code safe for free —
  that's its documented contract).
- `container.update(deltaTime)` still runs (camera, UI, cursor), but the
  implementer must audit `ContainerManager.update` and gate the sim-ish calls
  (myte per-frame movement/animation, map object `update`, weather/ambient
  spawners) behind `!core.simulationPaused`. Presentation-only updates (wall
  cutaway, HUD, tooltips, selection) keep running. Deliverable of this task
  includes a short list in the PR description of exactly which sub-updates were
  gated vs left running.
- Also call `gameTime.pause()` / `resume()` so the clock and time-of-day overlay
  freeze visibly.
- Edge case: a myte mid-action (eating, carrying) simply freezes; the action
  resumes on unpause because everything runs on SimClock. Verify one such case
  in the harness (`/verify`).
- Show a persistent "Build Mode — simulation paused" chip (reuse ToastSystem
  styling or a fixed HUD chip) so the frozen world reads as intentional.

### Acceptance

- `b` toggles modes; mytes freeze mid-walk and resume cleanly; clock stops.
- No console errors after 60s idle in build mode; leaving build mode saves.

---

## W2 — Sidebar declutter: tabbed Options panel + corner overlays

### 2a. One tabbed Options panel (settings + sound + view + debug)

Merge `SettingsPanel`, `SoundPanel`, `ViewPanel`, `DebugPanel` into a single
**Options** window using the existing `PanelRegistry` tabs + `TabController`
pattern (copy `MyteInfoPanel`'s wiring):

- In `SiteConfig.ui.panels`, give `game-settings-panel` a `tabs` config:
  `General`, `Sound`, `View`, `Debug` (Debug `hidden: true` unless
  `document.body.classList.contains('debug')` — same trick as
  `myte-info-tab-debug`).
- In `index.html`, move the existing panel content blocks
  (`#sound-settings-panel`, `#view-panel`, `#game-debug-panel` contents) into
  `game-settings-panel` as `[data-tab-panel]` sections. Keep the existing
  element IDs intact — the panel classes bind by ID and should not need logic
  rewrites, only their `ModalWindow` shells removed.
- The four panel classes stay as controllers of their sections (they mostly
  wire inputs); only one of them (or a thin new `OptionsPanel`) extends
  `ModalWindow` and owns open/close + the `TabController`. `UserInterface.init`
  keeps constructing all four, passing them the shared modal.
- Sidebar loses `settings-toggle`, `sound-toggle`, `view-toggle`,
  `debug-toggle`; one **Options** (gear) button remains. Sound mute becomes a
  checkbox/tab affordance plus keyboard shortcut (see 2b). Debug toggle can
  also stay on backtick/keyboard only.
- Wall presentation buttons move OUT of the View tab into build/customize UI
  (W5); leave a copy in View if it's genuinely useful during play (cutaway
  preference is a play-mode setting — keep the cursor-follow checkbox there).

### 2b. World map → `M` key + bottom-left overlay

- Reassign mute: `ContainerInputManager.js:152` currently binds `m` →
  `soundPanel.toggleSounds()`. Move mute to `n` (or F-key style; document in
  Options tooltip) and bind `m` → `worldMapPanel.toggle()`.
- Remove `world-map-toggle` from the sidebar. Add a fixed overlay bottom-left
  of the game viewport (sibling of `#hand-controls`, inside the container
  wrapper so fullscreen keeps it): a button showing a small map icon + the
  current map's display name via `container.getMapDisplayName(gameMap.id)`.
  Clicking opens the World Map panel; tooltip "World Map (M)".
- Update the name on the map-change event (grep the registry for the event
  `MapTransitionManager` emits — subscribe, don't poll).

### 2c. Event log → bottom-right overlay

- Remove `log-toggle` from sidebar; add bottom-right chip that opens
  `GameLogManager`'s panel. Give it an unread-count badge: `GameLogManager`
  already buffers entries; increment a counter on entries appended while the
  panel is closed, clear on open. Keep it clear of `#action-controls`
  (the right sidebar) — bottom-right corner of the *viewport*, and hide the
  chip while the action sidebar is open if they collide at small widths.

### Resulting sidebar

Play mode: Select / Drag / Pet radios + Build (mode switch) + Options.
Build mode: the build toolset (W3) replaces the play tools. Everything else
lives in corners or inside Options.

### Acceptance

- Sidebar shows ≤5 controls in play mode. Options panel tabs keyboard-navigate
  (arrows/Home/End — free from TabController). `M` opens map; mute still
  reachable. Map-name overlay updates after walking through a portal.

---

## W3 — Build mode owns building *and* decorating

### 3a. Build-mode toolset

While `data-game-mode="build"`, the sidebar radio group swaps (CSS shows a
second radio group; same `#hand-controls` markup pattern) to:

- **Move/Place** (furniture: drag, place from inventory, store to inventory)
- **Walls** (existing BUILD tool → `WallBuildPanel`)
- **Surfaces** (existing CUSTOMIZE tool → `SurfaceCustomizePanel`)
- **Undo / Redo** buttons (W7)
- **Exit Build** (or the Build mode-switch button in pressed state)

`customize-toggle` and `build-toggle` become build-mode-only: pure CSS —
`body:not([data-game-mode="build"]) #customize-toggle, ... { display: none; }`.
Also guard in JS: `ToolManager.setToolMode` rejects BUILD/CUSTOMIZE unless
`gameMode.isBuild()` (belt and suspenders; keyboard shortcuts bypass CSS).

### 3b. Restrict decorating to build mode

Single chokepoints, all gated on `gameMode.isBuild()`:

- `MapObject.canBeDragged()` (`MapObject.js:1175`): return false for
  furniture-style drags in play mode. Careful: the Drag tool also drags
  *mytes*, and some objects are gameplay-pickupable (`canPickUp` gesture,
  carryable items). Rule: **objects with an ItemRegistry mapping /
  `draggable` config = build-mode only; mytes and gameplay pickups
  unaffected.** Play-mode Drag tool remains for mytes.
- `ActionSidebarManager.getInventoryStorageState()`: return null in play mode
  (hides "Store in Inventory"), and the drag-to-inventory path in
  `MapObjectInputController.onDragEnd` refuses store drops in play mode.
- `Inventory.activateItemElement` / `beginPlacement`: placing world objects
  (`primaryAction === 'place'`) prompts "Enter Build Mode?" toast or just
  switches modes automatically (recommend: auto-enter build mode with a toast —
  fewer dead-ends). Feeding/using items on mytes stays play-mode.

### Acceptance

- In play mode: no furniture drag, no store button, placing an item flips to
  build mode. In build mode: all three work; mytes are frozen so nothing walks
  through your build.

---

## W4 — Wall placement validation (no building through things)

Validate in **`WallBuilder.applyWallCellChanges`** (authoritative, protects
every caller) and pre-flight in **`WallBuildPanel`** (live feedback).

- New method `WallBuilder.getCellObstruction(x, y)` → `null | { reason, entity }`:
  - **Map objects**: query `gameMap.gridSystem` (`js/Map/Grid/GameMapGrid.js`)
    for objects whose footprint overlaps the cell rect
    (`RectUtils`). Blocking rule: any object with a physical footprint —
    reuse `_blocksMovement` plus non-blocking decor that still occupies the
    cell visually. Exception: wall-mounted fixtures and openings (doors/
    windows) are *supposed* to coexist with walls; skip objects attached via
    the wall socket system (`sockets.occupantsOf('opening')`).
  - **Creatures**: iterate `container.mytes` (and NPC/ambient
    `MovingMapObject`s) and rect-test their body against the cell. Mytes are
    frozen in build mode (W1), so a one-shot check at commit is sufficient —
    no need for continuous re-validation.
- `applyWallCellChanges`: filter/throw on obstructed **add** cells (removals
  are always geometrically safe — but see W6 locks). Prefer *filter + report*
  over throw: return `{ applied, rejected }` so the panel can toast
  "2 cells blocked by Fountain".
- `WallBuildPanel.renderGhosts`: obstructed cells get `is-invalid` ghost class
  (red, existing `is-remove` pattern shows how); `commitCells` skips them.
- Also validate the **remove** direction's knock-on: removing a cell under a
  mounted fixture/opening should either be refused or cascade-remove the
  fixture back to inventory — check what `reindexOpenings()` currently does
  with orphaned openings and make the behavior deliberate (recommend: refuse
  with toast "Remove the door first").

### Acceptance

- Dragging a wall line across a fountain shows red ghosts on its cells and
  builds only the clear ones. Cannot entomb a myte. Cannot orphan a door.

---

## W5 — Expose wall height/visibility in build & customize modes

Problem: customize mode force-locks walls **up**
(`ToolManager.applyToolModeState`), so in a small room you can't see or click
the floor behind the south wall.

- Replace the hard override with a user-selectable one: add a compact
  segmented control (Up / Cutaway / Down / Hidden) directly into
  `SurfaceCustomizePanel` and `WallBuildPanel` (shared partial — put the
  markup in both panels in `index.html`, one small controller mixin or helper
  in `js/UI/Panels/`). It drives the same API the View panel uses
  (`wall-mode-btn` handlers in `ViewPanel.js` — extract the call into a shared
  method on `wallBuilder`, e.g. `setUserPresentationMode(mode)`).
- Default on entering customize/build: **Cutaway** (best of both — you can see
  floors and still pick walls). Selection persists per session.
- Keep floors clickable when walls are down/cutaway: verify `.floor-surface`
  hit-testing isn't blocked by lowered wall elements (pointer-events on
  `.wall-piece` when in down/hidden state).
- Remember and restore the play-mode presentation on mode exit (already the
  pattern: `setPresentationOverride(null)`).

### Acceptance

- In a 2×2 room you can switch to Down/Cutaway inside the customize panel and
  click the enclosed floor. Exiting restores the previous view setting.

---

## W6 — Protected walls, surfaces, and objects

Data-driven locks, enforced at the same chokepoints as W4:

- **Wall cells**: optional `locked: true` on authored cells in map wall data
  (`wallData.cells` entries; `WallBuilder` constructor at
  `WallBuilder.js:243` copies these into `authoredBaseCells` — preserve the
  flag through `setWallCell`'s spread). `applyWallCellChanges` rejects changes
  (add *or* remove *or* repaint) touching locked cells.
- **Surfaces**: `SurfaceCustomizer.apply()` filters requests hitting locked
  wall faces; rooms get `properties.finishLocked: true` (authored in Tiled →
  room region properties) blocking floor repaints.
- **Objects**: a map-level lock **already exists** — map property
  `lockFurniture: true` via `GameMap.getAuthoredObjectConfigOverrides`
  (`js/Map/GameMap.js:342`) strips storability from authored furniture on
  world maps. Extend, don't duplicate: add a per-instance override
  (`locked: true` in the object's Tiled properties) flowing through the same
  method, and have build-mode gates (`canBeDragged`,
  `getInventoryStorageState`) respect it.
- **Per-map policy**: map property `buildPolicy`:
  - `'full'` — home map default: everything editable except explicit locks.
  - `'limited'` — only cells/rooms explicitly marked `buildable` (inverted
    default; lets shared/world maps open a small plot).
  - `'none'` — Build button disabled on this map (grey with tooltip
    "You can't build here"). This is the default for maps that declare nothing,
    which keeps every existing map safe until opted in.
- UI: locked target under cursor in build/customize mode shows a lock cursor
  (`CursorManager`) and a padlock badge in the surface panel target line
  ("Wall, south face — Kitchen 🔒"). One toast explains the first time per
  session.
- Since exact policy is undecided, implement the *mechanism* + the three
  policies, wire home map = `full`, everything else = `none`. Tuning is data
  edits later, no code.

### Acceptance

- A locked authored wall refuses removal/repaint with feedback; a `none` map
  greys out the Build button; home map unaffected.

---

## W7 — Undo / Redo (build sessions only)

Command stack, not snapshots — the three edit families all have cheap inverses:

- New `js/Engine/BuildHistory.js` (manifest!): `push(command)`, `undo()`,
  `redo()`, `clear()`, cap 50, each command `{ label, undo(), redo() }`.
  Emits `EVENTS.BUILD_HISTORY_CHANGED` so the toolbar buttons can
  enable/disable and show "Undo: Place Wall (3 cells)" tooltips.
- **Wall edits**: `WallBuildPanel.commitCells` already computes `changes`; the
  inverse is the prior per-cell state — capture
  `builder.baseCells.get(key)` clones for affected keys *before* applying
  (exactly what `applyWallCellChanges`'s internal `previousCells` rollback
  does; expose it — have `applyWallCellChanges` return the inverse change list
  instead of keeping it private).
- **Surface paints**: in `SurfaceCustomizePanel`, before `customizer.apply()`,
  record current finish ids for every request target
  (`getCurrentFinishId`-style resolution per request); inverse = apply those.
- **Object placement/move/rotate/store**: record in
  `MapObjectInputController.onDragStart` (`_dragOriginX/Y/Direction` already
  exist) and push on drop; place-from-inventory inverse = store back;
  store-to-inventory inverse = re-place at prior position. Route these pushes
  through the container's `buildHistory` only when `gameMode.isBuild()`.
- All undo/redo paths call the same commit plumbing
  (`worldState.captureMap`, `_scheduleSave`) so persistence stays consistent.
- Keys: `Ctrl+Z` / `Ctrl+Y` (+`Ctrl+Shift+Z`), registered in
  `ContainerInputManager.setupKeyboardShortcuts`, active only in build mode.
  Buttons live in the build toolset (W3a).
- `clear()` on exiting build mode and on map change (cross-map undo is a trap:
  the target map may have been recaptured).

### Acceptance

- Build wall → paint it → place chair → 3×Ctrl+Z returns to start state and
  3×Ctrl+Y replays it; save/reload reflects whatever state was current.

---

## W8 — Rotation in build mode

Mostly exists; make it discoverable and mouse-usable:

- Keep: `R` while dragging rotates (`MapObjectInputController.js:73`).
- Add: public `MapObject.rotateToNextDirection()` wrapping the internal
  `_rotateDuringDrag` step logic so rotation no longer requires an active drag.
- Selection-driven: in build mode, selecting a rotatable object (has
  `directionConfigs` + `SiteConfig.objects.canRotate`) adds a **Rotate**
  entry to its sidebar interactions (`getSidebarInteractions` pattern —
  `ActionSidebarManager` already renders these) and binds `R` /
  `,`/`.` (counter/clockwise) while selected.
- Rotation must re-validate placement (footprint may change shape):
  reuse `clampPlacementPosition` / grid overlap check; refuse with a shake
  animation if the rotated footprint collides.
- Push each rotation onto BuildHistory (W7).

---

## W9 — Edge-case rules ("can I do that?") matrix

These are the fringe interactions every workstream must honor. Centralize them:
a `BuildRules` helper (can live on the container or as static methods next to
`GameModeManager`) that answers `canRemoveWallCell(cell)`,
`canStoreObject(object)`, `canPlaceAt(object, x, y)`, each returning
`{ allowed, reason }` — the UI shows `reason` as tooltip/toast, and W4/W6/W7
call the same functions so validation, locks, and undo never disagree.

**Walls**
- **Wall carrying something → not removable.** A cell hosting an opening
  (door/window, via `sockets.occupantsOf('opening')` /
  `reindexOpenings()` bookkeeping) or a mounted fixture (shelf, picture —
  `authoredFixtures` + user fixtures) refuses removal: "Remove the door
  first." Same for repaint-with-construction-change if the new construction
  can't host the fixture (thinner wall, lower `heightCells` than the fixture's
  mount height).
- **Lowering wall height** below a mounted fixture's position → refuse, same
  message.
- **Removing a wall that splits/merges rooms**: allowed, but the room
  recompute (`RoomEnclosureDetector`) may merge two rooms with different floor
  finishes. Rule: the surviving (larger) room's finish wins; the repaint is
  part of the same undo command so Ctrl+Z restores both wall and finishes.
- **Last wall of a room**: fine — room dissolves, floor finish reverts to map
  default; again bundled into the undo command.
- **Wall under an authored (map-baked) attachment** (`wallData.attachments`):
  treat as locked (W6) — these have no inventory representation to return.

**Objects**
- **Object in use → not storable/movable.** Already partially enforced
  (`isInUse()` in `canBeDragged` / storage state); mytes are frozen in build
  mode, so "in use" persists — surface the reason ("Peanut is sitting on it")
  instead of a dead button.
- **Object with things on it** (surface sockets holding items, chest with
  contents): moving carries its occupants with it (AttachmentSystem transform
  propagation should already do this — verify); **storing** requires the
  surface be empty, or auto-drops occupants in place. Recommend: refuse with
  "Empty it first" — simplest and predictable.
- **Placement overlap**: placing/rotating may not overlap walls, other
  blocking objects, or frozen creatures — same obstruction query as W4, one
  shared footprint test.
- **Growing plants / stateful objects** (crops mid-growth, lit fires): moving
  is fine (state travels with the instance); storing resets state — warn once
  ("Storing will reset its growth. Store anyway?" — this is the one place a
  confirm is worth it).
- **Doors/windows placement**: only onto existing wall cells with sufficient
  run length (`getOpeningPlacementCandidates` already computes candidates);
  ghost preview red when hovering non-wall cells.

**Rooms & world**
- **Don't wall off portals**: cells occupied by a map portal/transition zone
  are permanently obstructed (add to `getCellObstruction`). Also refuse
  enclosing a portal so it becomes unreachable? Cheap version: portal cells +
  their immediate approach cell are unbuildable; full reachability analysis is
  overkill for v1.
- **Home slots** (`myte-slot` drop targets): their cells are unbuildable —
  a myte must always be able to reach its bed.
- **Fully sealed rooms**: allowed to build (the user may be mid-construction),
  but on build-mode exit the walkability pass (consideration 1 below) reports
  "Kitchen has no door" as a warning toast rather than blocking.
- **Lighting/regions**: wall and finish changes already emit
  `WALL_GEOMETRY_CHANGED` — confirm room lighting, `RegionManager` occupancy,
  and the pathfinding grid all rebuild from that one event, including on
  undo/redo (which must go through the same emit path, never mutate silently).

---

## W10 — Keyboard map & build-feel polish

### Full keyboard map (build mode unless noted)

| Key | Action | Notes |
|---|---|---|
| `b` | Toggle build mode | play+build; W1 |
| `1` / `2` / `3` | Move / Walls / Surfaces tool | Sims-style tool row; digits are free |
| `Esc` | Cancel drag → close panel → exit build | layered; W-other #2 |
| `Ctrl+Z` / `Ctrl+Y` | Undo / Redo | W7 |
| `R` or `,` / `.` | Rotate selected/dragged object | W8 |
| `Delete` | Store selected object to inventory | same path as the Store button, so W9 rules apply |
| `Home` / `End` | Cycle wall presentation up ↔ cutaway ↔ down ↔ hidden | binds to the W5 segmented control; Sims muscle memory |
| `Shift` (held, wall drag) | Rectangle outline | exists |
| `Ctrl` (held, object drag) | Snap to grid cells | free-drag stays default since placement is pixel-based today |
| `Alt`+click (Surfaces tool) | Eyedropper: sample the clicked wall/floor finish into the palette selection | cheap to implement — `resolveFaceFinishId` / `floorFinishId` already answer it |
| Arrow keys | Nudge selected object 1px (`Shift`+arrows = 1 cell) | when nothing selected, pan camera instead |
| `WASD` | Pan camera | both modes; ignore when typing in an input |
| `m` | World map | play+build; W2b |

Register all of these in `ContainerInputManager.setupKeyboardShortcuts` (one
place), each gated on mode, and add a small "?" keyboard legend to the build
toolbar tooltip or Options → General.

### Feel improvements (each small, mostly independent)

1. **Grid overlay**: faint tile grid over the map while Walls tool is active
   (a single repeating-gradient CSS layer sized from
   `gridSystem.config.cellSize` — no per-cell DOM). Objects tool shows it only
   while `Ctrl`-snapping.
2. **Neutral lighting in build mode**: force the time-of-day/gloom overlays to
   flat daylight while building so finishes read true (the Sims trick).
   `MapEnvironmentManager` already has presentation toggles — add a
   `lightingOverride` entered/exited with the mode. Restore on exit.
3. **Placement ghost for furniture**: walls have ghosts; objects don't. While
   dragging/placing, tint the object green/red from the same
   `BuildRules.canPlaceAt` query (W9), and refuse drops on red with a
   shake + error sound instead of silently clamping.
4. **Live measurements**: while wall-dragging, a small floating label at the
   cursor with cell count ("6 cells" / "4×3"); `FloatingLabel` component
   already exists.
5. **Sound pass**: distinct one-shots for wall place (thunk), wall remove
   (crumble), paint apply (roller), object place (drop), undo/redo (whoosh),
   rejected action (dull thud). Route through `SoundManager` presets; the
   click-sound plumbing in `UserInterface.handleControlClickSound` shows the
   pattern.
6. **Undo toasts**: `ToastSystem` one-liner on undo/redo ("Undid: Place Wall
   (6 cells)") using the W7 command labels — makes the stack legible.
7. **Camera on entry**: slight zoom-out + center on the player's home area
   when entering build mode (smooth, reuse View panel's fit/center logic);
   restore prior camera on exit (already in W1).
9. **Double-click swatch = whole room**: single click paints the clicked
   scope as today; double-click applies room scope without touching the radio
   (the scope machinery exists in `buildRequests`).
10. **Build catalog (later, bigger)**: a docked build-mode panel merging
    placeable inventory items and shop purchases into one browsable catalog —
    the Sims catalog feel. Out of scope for this pass; the W3 chokepoints and
    shop/ItemRegistry make it a clean follow-up.

---

## Other considerations (call out during implementation)

1. **Enclosure aftermath**: building walls can strand a myte or sever a path
   between portals. On leaving build mode, run a walkability pass: any myte on
   a now-unwalkable/enclosed cell gets nudged to the nearest walkable cell
   (pathfinder BFS). Consider a soft warning toast if a portal became
   unreachable. `RoomEnclosureDetector` (recent commit) likely already
   recomputes rooms on `WALL_GEOMETRY_CHANGED` — verify grid + region rebuild
   both fire on undo/redo too.
2. **Escape key layering** in build mode, in order: cancel active drag/ghost →
   close open build panel → exit build mode. `ModalWindow.handleKeyDown` and
   the panels' own Escape handlers must not double-fire (they currently each
   listen globally).
3. **Autosave cadence**: per-commit `captureMap` + `_scheduleSave` is fine, but
   with undo in play, consider capturing on build-exit plus a debounce, not
   every keystroke of a 40-cell drag.
4. **Shop / economy**: Sims build mode implies costs. Out of scope now, but
   route all placement through the W3b chokepoints so a price check can slot
   in later without re-plumbing.
5. **Touch**: wall drag + shift-rectangle has no touch modifier; the operation
   radio (add/remove) pattern is fine, but add a "rectangle" toggle in the
   wall panel rather than relying on Shift.
6. **Tutorial hooks**: first entry to build mode should show a short tutorial
   toast series (tutorials toggle exists in settings).
7. **Performance**: wall rebuilds are full `rebuild()` calls; a 40-cell drag
   commit is one rebuild (good). Undo/redo should batch the same way (one
   `applyWallCellChanges` per command, never per-cell).
8. **Aesthetic**: build toolbar and overlays follow the Win98/XP language —
   raised bevels, `--button-mid`, no gradients (AGENTS.md).
9. **Verification**: use the `/verify` skill (headless browser) for: mode
   toggle, pause/resume myte mid-action, wall-through-object rejection,
   undo chain, locked-cell refusal, `M`/`b`/`Ctrl+Z` bindings.

---

## Phasing & suggested delegation

| Phase | Work | Owner suggestion |
|---|---|---|
| 1 | W1 GameModeManager + pause | Opus/Fable — touches Core loop; subtle |
| 2 | W2 Options tab merge + corner overlays | Codex — mechanical DOM/config moves, big diff |
| 3 | W3 mode-gated tools & decorating | Codex, after W1 lands |
| 4 | W4 wall validation + W5 presentation control | Opus — geometry/grid care |
| 5 | W6 locks (mechanism + default policy) | Codex — chokepoints defined by W4 |
| 6 | W7 undo/redo | Opus — cross-system inverses |
| 7 | W8 rotation polish + considerations list | Codex |

W10's keystrokes land with the workstream that owns each feature (tool digits
with W3, Home/End with W5, Delete with W3b); the feel items 1–9 are a polish
phase after 4, item 10 (catalog) is explicitly future work.

W9 (`BuildRules`) is not a phase of its own: its helper lands with W4 and every
later phase adds its rules there instead of inlining checks.

Phases 2 and 1 are independent and can run in parallel. Everything after
depends on W1; W6/W7 depend on W4's chokepoints existing.
