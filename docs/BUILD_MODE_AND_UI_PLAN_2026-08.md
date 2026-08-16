# Build Mode & UI Restructure Plan — 2026-08

> **Status: implemented 2026-08-15.** W1–W10 all landed in one pass. New files:
> `js/Engine/GameModeManager.js`, `BuildRules.js`, `BuildHistory.js`,
> `js/UI/Core/PanelSection.js`, `js/UI/Panels/OptionsPanel.js`,
> `js/UI/Panels/WallViewControl.js`, `js/UI/Container/BuildModeUI.js`,
> `js/UI/Overlays/StageChips.js`, `css/components/_build-mode.scss`.
> Deferred on purpose: the build catalog (W10 item 10) and shop/economy pricing.
> Rotation ships behind the existing `SiteConfig.objects.canRotate` flag, which
> is still `false` until rotated art exists.
>
> **Follow-up pass, 2026-08-15 (same day).** The two W-items left open landed,
> along with a UI consistency pass:
> - **W10 `Ctrl` snap** — held during an object drag, snaps to grid cells via
>   `MapObjectInputController.applySnapModifier`, reusing the same top-left
>   `gridSystem.snapToGrid` the inventory placement path uses. The grid overlay
>   was already wired to `isSnapModifierHeld`; only the snap itself was missing.
> - **W9 floor finishes on merge** — investigated rather than assumed. Authored
>   (map-baked) rooms are never merged by `RoomEnclosureDetector`, so removing a
>   wall cannot change their finishes; on the House map, where every room is
>   authored, this is a non-issue exactly as suspected. **Auto-detected** rooms
>   are a different story: they are torn down and rebuilt with positional ids on
>   every `WALL_GEOMETRY_CHANGED`, and their finishes live only in the world-state
>   snapshot. `BuildHistory.commit` recaptured that snapshot *before* the pending
>   recompute ran, so the merged-away room's finish was pruned and undo brought
>   the room back bare. Fixed at the source instead of in the wall command:
>   `WorldState.captureMap` now merges into the stored `floors` map rather than
>   replacing it, so a room's finish outlives the room and `restoreFloors` puts
>   it back when the room returns. This covers redo and reload too, which a
>   command-local inverse would not have.
>   Note the surviving finish is the **topmost-leftmost** room's, not the largest
>   — auto-room ids are assigned by scan order, and that is the rule the id
>   scheme actually implements.
> - **Camera is Pan in build mode after all** (reversing the deviation below).
>   `ToolManager.claimsMapDrag()` marks the tools that own the left-button drag
>   (Walls, Paint) and `Camera.startDrag` asks before grabbing; object drags
>   already borrowed the camera through `beginTemporaryCursorFollow`. Restored on
>   exit by the existing `_restore` block.
> - **`Ctrl` held with the Walls tool inverts add/remove** for the length of the
>   drag, without touching the panel radio (`WallBuildPanel.resolveOperation`).
> - **Paint highlight covers the whole repainted stretch.** A run's south face
>   carries onto the single-neighbour corner column at each end
>   (`resolveFaceFinishId`), so the outline is driven from
>   `WallBuilder.getPaintStretchPieces` rather than `:hover`. Vertical-only walls
>   are excluded — they show none of that face.
> - **Panels share one grouping ladder**: `h3.settings-group-title` →
>   `h4.settings-subgroup-title` → `.setting-item`. The Walls and Paint panels
>   dropped their sunken fieldsets, checkboxes and radios became one shared
>   control (a radio was inheriting the text-field rule and stretching to 70% of
>   the panel), and General's dead Save button was replaced by auto-save plus a
>   working Restore Defaults.
> - **Build mode hides what it cannot run**: the queue/buff overlays, every
>   myte-directed sidebar action, and switching the active myte. What stays is
>   Store and Rotate.
> - A sidebar **mute** key returned, paired with Options as a gapless square
>   segment — the same shape Undo/Redo now use.
>
> **Build panel pass, 2026-08-15.** The Walls and Paint windows were carrying
> seven type sizes, five stacked radio rows and four paragraphs of instructions
> between them. Cut to two groups each:
> - New `js/UI/Core/SegmentControl.js` — pick-one-of-a-few on a single line.
>   `WallViewControl` is now a thin wall-specific layer over it, and the Walls
>   tool (Add/Remove) and Paint scope (This stretch/Whole room) use it instead of
>   radio stacks. `.wall-mode-segment` became the generic `.segment-control`.
> - Type collapsed to three sizes, tokenised: `--text-size-title` for group
>   headings, `--text-size-body` for anything you act on, `--text-size-meta` for
>   everything that only explains it. A fourth size is a sign the panel needs
>   fewer things in it.
> - `.setting-key` is drawn as a key cap (raised, lipped) rather than a flat
>   inset chip that read as a code span, and is `<kbd>` in the markup.
> - The Walls panel's "How" group is gone; its one surviving line lives under
>   the tool it describes. Options → Keyboard is the reference.
> - Finish swatches are one column: names are phrases, and half a tool window's
>   width broke them mid-word.
> - The panel is capped at the stage height, so the finish list absorbs the
>   shortfall and scrolls rather than pushing the View controls off the bottom.
> - **Wall cursor feedback**: a live single-cell ghost under the cursor before
>   any drag, in the colour of what a click would do, plus `cursor: cell` /
>   `not-allowed`. A cursor swap alone cannot say *which* cell it means.
> - **Grid is now the player's to turn off** — `container.settings.buildGrid`,
>   one setter, a `BuildGridToggle` checkbox in both panels and the `G` key.
> - **Vertical runs are no longer paint targets.** A wall's standing art is its
>   south face; a vertical run is seen edge-on and has none, so offering it was
>   offering a click that changes nothing. Corners still count — they carry the
>   horizontal run's face across.
> - **One outline, not three.** The highlight was per-piece, so a run plus its
>   two corner columns drew three boxes for one repaint. `getPaintStretchBounds`
>   returns the union box and the panel draws a single `.wall-paint-highlight`.
> - **Wall runs sound like runs**: one knock per cell, climbing a step each time
>   and wrapping every `cycle` (`SiteConfig.buildMode.sounds.run`), descending on
>   removal. `wallRemove` moved off `ui_error` — pulling a wall down is not a
>   refusal.
>
> **Second build panel pass, 2026-08-15.**
> - **The Paint tool is now the Surfaces tool.** "Paint" implied walls; it does
>   floors too. Renamed in the tool row, the panel title, the tutorial and the
>   keyboard legend. `UIToolModes.CUSTOMIZE` is unchanged — the rename is what
>   the player reads, not what the code calls it.
> - **Two tiers instead of a flat stack.** Group titles carry a hairline rule;
>   the View group — identical in both panels, and never the reason you opened
>   one — is `.settings-group--secondary`: pushed to the bottom, above a
>   divider, with a quiet uppercase heading at meta size.
> - **Wall run sound is per cell as the drag crosses it**, not a burst on
>   commit. `tickRunSound` fires on growth only, so dragging back over cells you
>   already crossed re-arms them silently, and blocked cells never tick. The
>   drag paces the sound, so `stepMs`/`maxSteps` are gone from the config.
> - **The Finish group stands down when nothing is selected** — an empty
>   heading over an empty box read as something that had failed to load.
> - **"Selected surface"** as the group title, so the readout under it has a
>   subject. Swatches sized to sit inside their rows rather than against them.
> - **Floors are resolved from world coordinates, not from the floor canvas.**
>   That canvas is a bounding box plus edge bleed, which is why the highlight
>   was a rectangle around rooms that are not rectangles, why overlapping boxes
>   meant only one room could ever be hovered, and why a room with no finish
>   (and so no canvas) could not be selected at all. `regionsAt` answers exactly,
>   and `FloorBuilder.createRoomOverlay` paints the highlight to the room's own
>   shape via the same `fillShape` the floors use. Walls stay element-hit-tested:
>   their art rises above the cell they occupy, so where you see a wall is not
>   where it is.
>
> **Still open, deliberately.** Splitting Surfaces into separate Wall and Floor
> tools was considered and not done: the real friction is that it is
> select-surface-then-pick-finish, two clicks per surface with a palette that
> re-renders under you. Splitting the tool does not fix that; carrying an active
> finish and clicking surfaces to apply it (a paint bucket) does, and that is a
> bigger change than this pass.
>
> **Third build panel pass, 2026-08-15.**
> - **Wall sounds are per operation.** `ui_drop_item` and `ui_pickup_item` are
>   nowhere near each other in level, so one shared volume made pulling a wall
>   down shout over laying one; `sounds.run` now carries `add` and `remove`
>   voices, sharing only the ladder length. Removal sits at a third of add.
> - **A knock now means a wall changed.** `canBuildWallCell` permits adding over
>   a cell that already holds a wall — legal, but it does nothing — so dragging
>   along an existing run knocked for every cell without building anything.
>   `cellWouldChange` applies the same test `commitCells` does, and the ghost,
>   the cell count and the sound now all agree with what the commit will do.
>   Cells that are legal but inert draw as a dotted outline: neither blue nor
>   red, because they are not part of the edit.
> - **Rooms can be named.** They always were regions with a `displayName`
>   property; what was missing was any way for the player to set one, so every
>   room they enclosed was called "Room". The Surfaces panel grows a name field
>   when a floor is selected. Stored as `playerName` next to `displayName` so
>   world state can tell "the player called this the Study" from "the map author
>   called this the Kitchen" and only persist the former; `authoredDisplayName`
>   is what an undo falls back to. Renames go through BuildHistory like every
>   other edit, and `WorldState.restoreFloors` became `restoreRooms` since it
>   now re-applies both the finish and the name after every room recompute.
>   Auto-detected rooms are numbered ("Room 1", "Room 2") rather than all
>   sharing one placeholder.
> - Underlines under group titles are gone — nothing else in the app uses them.
>   The hierarchy is carried by the secondary group alone, behind the same
>   divider the window footers use.
> - The finish palette is a `surface-inset` well, since it scrolls; its rows
>   dropped the 5px button bevel (a list row is not a button) and their
>   min-height, which was fighting the content.
> - The target readout is two lines — room, then surface — with no em dash. The
>   room is what you are looking for; the surface is which part of it.
> - The build panels are no longer capped at the stage height. They float beside
>   the stage rather than over it, and the finish list is what was paying for
>   the difference.
>
> **Fourth build panel pass, 2026-08-15.** The tools are **Wall** and
> **Surface**, singular, so the pair reads as one row.
> - **A room inside a room is now a room.** The detector discarded any enclosure
>   that merely *intersected* an authored room, so walling off a corner of the
>   Kitchen produced a component that was thrown away on that basis — the new
>   space could never be selected, named, or given a floor. `unclaimedComponents`
>   instead matches each authored room to the ONE component holding most of it;
>   that component *is* the room, and everything else is a space the player
>   made. Verified: a 5×5 walled off inside the Kitchen becomes `room_auto_1`.
> - **Innermost region wins.** `SpatialRegion.areaInCells` +
>   `RegionManager.innermostAt` — a nested room sits inside its parent's bounds,
>   so the first match is always the outer one. Lives on the region layer rather
>   than in the panel, because everything that asks "which room is this?" wants
>   the same answer.
> - **Walls are hit-tested by pixel, not by box.** A wall's canvas is a full
>   frame band whatever the wall is currently doing, so with the walls lowered
>   most of it is transparent air hanging over the floor behind — and the box
>   was catching every click, which is why a floor under a wall could not be
>   selected. An alpha test at the pointer falls through to the floor.
> - **Floor highlight goes through `buildMask`**, the same mask the floor itself
>   is painted with, so it picks up the edge bleed that runs floor under the
>   enclosing wall and the midline split with a neighbouring room. Filling the
>   bare shape stopped a cell short of every wall. Both highlights are now the
>   same translucent accent — one kind of selection, one look.
> - **Wall tick is one short sound both ways.** Two presets read as two events
>   and `ui_drop_item`'s tail is longer than the gap between cells, so a fast
>   drag stacked into a drone. Now `ui_click`, rising as cells join and falling
>   as they come out, with `minIntervalMs` so a flick across the map cannot fire
>   thirty one-shots into the same 200ms.
> - **Room type shipped.** `SiteConfig.rooms.types` is the authored vocabulary;
>   the Surface panel carries a name field and a type select when a floor is
>   selected, both folded into one undoable command and persisted as `roomEdits`
>   (`{ name, type }`) with the same merge-on-capture treatment the finishes get.
>   Nothing reads `roomType` yet — it exists so behaviour that wants to ("eat in
>   the kitchen", "this room has no bed") has one key to read instead of parsing
>   display names. Not to be confused with **zones**
>   (`data/metadata/zones.json`), which are stat-effect areas on their own layer.
> - Panel styling returned to the design system: swatches use the standard
>   border width, the secondary group is position only (no rule, no restyled
>   heading), and the finish list has a definite height so the panel does not
>   change size when you pick a different surface.
>
> **Fifth pass, 2026-08-15 — the nesting bugs.** Building a room inside a room
> exposed four faults, all downstream of one thing: wall faces and room regions
> disagreeing about what exists.
> - **Wall faces are re-derived after the room set changes.** Faces resolve
>   against the region layer, but rooms are recomputed AFTER the geometry change
>   that prompts them — so a wall raised in the same breath as the room it
>   encloses was assigned before that room existed and read "Outside" forever,
>   which also made it unpaintable. The reverse too: tearing a room down left
>   its walls still pointing at a region that no longer existed, so a stretch of
>   the Kitchen's wall kept selecting as a deleted room. `refreshRoomFaces` runs
>   from the detector and rebuilds when any answer moved — a full rebuild,
>   because face room ids decide how cells merge into pieces.
> - **`assignFaces` uses `innermostAt`**, so a wall of the inner room belongs to
>   the inner room rather than to its parent.
> - **An enclosing room no longer carves its child's edge bleed away.**
>   `buildMask` erases every other room's cells from a room's mask; for a nested
>   room that erased the very bleed that runs its floor under its own walls, so
>   the new room stopped a cell short of every wall. `encloses` makes the parent
>   yield: the child carves the parent, not the other way round. A room built
>   inside another therefore gets genuinely separate flooring, with the parent
>   holed out beneath it.
> - **A checkbox is not text entry.** `isEditingText` treated every `<input>` as
>   a text field, so ticking any box in any panel killed every keyboard shortcut
>   until the player clicked elsewhere — which is why `G` "stopped working"
>   right after using the Show grid checkbox. Now only real text-entry types
>   swallow keys.
> - **The grid follows its setting, not the tool.** It was tied to the Walls
>   tool, a fine default before there was a setting — but once both panels carry
>   a "Show grid" checkbox, tying it to the tool means the checkbox does nothing
>   at all under Surface. Ctrl-snapping still summons the grid regardless, since
>   that is what it is snapping to.
> - Form fields: one padding for `select` and `input` alike, and the room name
>   and type sit label-beside-control so two fields cost two lines instead of
>   four — which is what was pushing the View controls out of the window.
> - The Wall panel's hint moved directly under the Add/Remove segment, since
>   what it explains is inverting that segment.
>
> **Sixth pass, 2026-08-15 — one shape for a labelled row.** Putting the room
> name and type label-beside-control fixed that panel and made it the only place
> in the app laid out that way, which is worse than the problem it solved. Now
> every `.setting-item` holding a direct `> label` is a two-column grid: name on
> the left, control filling the rest. That is the two Options dropdowns, the six
> Sound sliders and the two room fields — the complete set. Checkbox rows keep
> the order reversed (the box leads, because that is where the eye checks
> state); their label lives inside `.checkbox-wrapper`, so `> label` passes them
> by.
>
> Selected with `:has(> label)` rather than a modifier class, so a labelled row
> added later gets the layout without anyone having to remember a class name —
> the only kind of consistency that actually holds. First use of `:has` in the
> codebase; it is well inside the evergreen baseline. The rule needs an explicit
> `&[hidden] { display: none }` beside it, since `display: grid` otherwise beats
> the UA rule and un-hides rows a panel means to keep back. `.setting-item.dropdown`
> is gone — it existed to stack a label, and nothing stacks any more.

> **Deviations from the plan as written**, all found in review:
> - ~~Build-mode camera is **Locked**, not Pan.~~ Reverted to Pan in the
>   follow-up pass above, once the tools that own the map drag learned to say so.
> - Overlapping objects both offered themselves for a drag and the claim was
>   first-come, so the rug under a bed could win. `canDrag` now also requires the
>   object to be the topmost one under the pointer.
> - Build access can't hang on a new `.tmx` property: browsers cache map files
>   outside debug mode, so a client with an older `House.tmx` would find its own
>   house permanently unbuildable. `SiteConfig.world.defaultMap` is `full` in
>   code; the map property is an override.
> - The Debug tab is always visible (the sidebar's debug button always was).
> - The paused chip is top-centre and is also the way out of build mode.
> - Leaving the map mid-build ends the build session first, and double-click
>   travel is refused while building.
>
> **Sub-updates gated by the pause** (W1b deliverable): SimClock, the fixed-rate
> tick drain (myte AI/stats/actions, map object `tickUpdate`, particles, game
> clock), per-frame myte `update`/`updateInactive`, map object `update`, zone
> effects and dropped-item physics. **Left running:** camera, cursor, UI,
> tooltips, selection, grid culling, the DOM render flush, attachment transforms,
> wall cutaway evaluation, room membership and the atmosphere overlay.

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
