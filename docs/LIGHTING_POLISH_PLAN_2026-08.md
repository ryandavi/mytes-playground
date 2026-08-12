# Lighting Polish & Customize UX — August 2026 Plan (v2 follow-up)

> **Reconciled status 2026-08-11: implemented and headless-verified.** F-P1, F-P2 and G10–G14 all landed. House at noon: gloom Bedroom 0.35 / Playroom 0.325 / Hallway 0.219 / Kitchen 0.104 / Chatroom 0.087; removing every window returns Kitchen 0.299 and Chatroom 0.290. House at 01:00: lift Bedroom 0.209 / Playroom 0.209 / Hallway 0.333 / Kitchen 0.384 / Chatroom 0.393, and the chatroom lamp lifts the kitchen across their open boundary (0.333 → 0.384) while the walled bedroom stays at 0.209. Walls-up vs walls-down interior cells AND room light values are byte-identical. Art mask opaque fraction: House 1.00, Outside 0.98, DoorTest 0.77. Zero console errors on all three maps.
>
> Two rulings were refined during implementation and are recorded in place: §1.3 (the located cause was tuning, not a probe or region failure) and §2.1 (spill is one hop from a snapshot, never a cascade).

Owner report 2026-08-11: interior lighting reads wrong (walls-up ring, walls-down inversion, one unlit room), lighting is not clipped to artwork, the Customize/Build UI is below design-system bar, and fixture presentation in stub mode is unresolved. This doc is the design of record. Fable keeps the light-region geometry and the open-room ruling; everything else is written as dispatch blocks (numbering continues `CODEX_GOALS_2026-08.md`: G10–G14).

---

## Part 1 — Diagnosis (from code, 2026-08-11)

Read before touching anything; these are located root causes, not guesses.

### 1.1 Walls-up "unlit ring" around floors and walls — geometry, not tuning

`MapEnvironmentManager.buildRoomLightRegion()` (js/Map/MapEnvironmentManager.js:1359) builds each room's hard light region as:

- the **authored room rect** (`room.bounds`), even when the region has a tilemask/polygon shape, plus
- face bands for **horizontal wall pieces only**, and only those within one cell of the room's north/south bounds edge.

Consequences, all matching the report:

1. **Vertical wall pieces (east/west) get no band at all** — left/right walls of a room never receive room light. "On the walls it's mostly left and right."
2. **Authored rects don't coincide with wall inner edges.** House.tmx rooms are hand-drawn rects (Kitchen is `y=31 h=417` — off by one vs its neighbors' `32/416`). Any gap between rect edge and wall face is an unlit strip; any overlap spills light onto the wall footprint.
3. **The floor fill is not subtracted from the wall footprint**, so the floor rect paints light over the construction plaster strip; conversely the band top (`getCutYOver`) to `baseline` math leaves the plaster band itself outside both floor and face rects in some piece states.

**Implemented (F-P1), revised after owner review 2026-08-11:** the first cut gave each room its own bands and drew them straight onto the canvas, which was wrong twice over. A wall's standing face is 160px of art drawn *over the floor of the room behind it*, so those pixels were painted by both rooms and came out double-dark — a heavy band along every wall. And bands were found by orthogonal adjacency only, so corner cells, which touch their room only diagonally, got nothing.

The model now: every wall cell is owned by **exactly one** room — the room in FRONT (south, or to the side), which is the only one that can see the face; the room behind stops at its own interior. Adjacency is resolved diagonally as well as orthogonally. All rooms then composite into **one layer per pass** in painter order (north to south, the map's own depth rule), erase-then-draw, so every pixel carries exactly one room's value and a feathered edge blends the two instead of stacking them. Verified: zero coverage gaps across House.

Also: the feather is now an *outward* distance rather than an inward one clamped to half the rect, so the authored numbers overshot — `roomDefaults.feather` 40 → 24 (indoors) / 28 → 20 (outside) and `openWallFeatherScale` 1.6 → 1.0, which is what turned walls-down into soft blobs.

Interior = the room's wall-free cells, seeded from the region shape and grown a bounded `roomInteriorGrowCells` (2) through wall-free unclaimed cells so a rect authored short of its wall still reaches the wall face; one face band per bordering wall cell in **all four** orientations, clipped by `getCutYOver`; the plaster strip belongs to the band, never the floor fill. Cached against a geometry + cut-state signature.

**Fix direction (F-P1, Fable):** stop deriving the light region from authored rects. Derive it from the same geometry everything else already trusts:

- Interior area = the room region's **tilemask cells** (authored rooms should get tilemasks from enclosure geometry; auto-detected rooms already have them). Fall back to rect only when no wall system exists.
- Wall light bands = **for every wall cell adjacent to an interior cell**, a band on the room-facing face, horizontal *and* vertical, height clipped by the piece's current cut state (`getCutYOver` for horizontal; the vertical-piece equivalent needs adding).
- The footprint/plaster strip belongs to the **wall band**, not the floor fill — floor mask stops at the wall face line.
- Build once per geometry/cut-state change and cache (the signature already tracks `wallCuts`); per-frame work stays screen-space transform only.

### 1.2 Walls-down "bright edges, dark center" — feather direction is inverted

With walls down, `useSoftRoomEdges` swaps the hard region for `drawFeatheredRectColor`/`drawFeatheredRectAlpha` (js/Map/MapEnvironmentManager.js:1860–1913). Those feather **inward**: full strength in the rect center, fading to zero at the rect edge. For the *gloom* pass (darkness painted INTO the room) that means darkness is weakest at room edges and full in the middle — exactly the reported "lit around the edges, darker as you go in". The night *lift* pass has the mirrored defect: a dark ring just inside room edges at night.

**Implemented (F-P1):** each room rasterises to one alpha **stencil** — solid across the whole interior, feathered only outward past the boundary by concentric rings — shared by the lift, gloom, room-colour and window-glow passes. The inward-feather helpers (`drawFeatheredRectAlpha/Color`, `drawFeatherBands`) are gone.

**Fix direction (F-P1, same pass):** darkness/light values must be **constant across the interior** and fade only *outward past* the room boundary. Feather = draw the full-alpha region at true bounds, then gradient bands extending `feather` px **beyond** the boundary. Walls-up and walls-down then produce identical interior values (the F-L3 invariant, currently violated) and differ only in edge treatment.

### 1.3 Top-right room (Chatroom) unlit — DIAGNOSED (2026-08-11)

**Located cause: none of candidates 1–4. The room probe, the region and the room-scope config were all correct; the model resolved the chatroom to literally zero lighting.** The headless dump (`describeLighting()`, G10) reads at noon:

- Its window (`opening 122`, 4 cells) resolves `sideA: null / sideB: zone_chatroom` — a correct exterior window — and 4 × `daylightPerCell` 0.22 = 0.88, clamped to `daylightMax` 0.85. That leaves gloom = 0.35 × (1 − 0.85) = 0.0525.
- Its lamp then subtracts a daytime contribution of 0.12 × 0.64 × 0.78 = 0.0599 > 0.0525, taking gloom to exactly **0**. With `lift` also 0 in daylight the room received no lighting treatment at all — flat, indistinguishable from outdoors. That is the "unlit" report.

Fix (in the model, not per-map): `lighting.window.gloomFloor` (0.25) — the share of a room's own `daylightGloom` that windows, lamps and spill can never remove, because indoors is dimmer than outdoors even at noon with the curtains open. Chatroom now sits at its floor, 0.0875, and glooms to 0.29 with its window taken away.

A second finding from the same dump, kept because it changes what the map *is*: House has **no wall at all** between Kitchen and Chatroom (16 open adjacent cells across x=480). They were never two rooms — which is precisely the §2.1 case, and F-P2 now couples them at spill 0.85.

The original candidate list, kept for the record:

Chatroom (House.tmx object 127, x480–928 y32–448) shares the spill/window path with rooms that work. Candidates, in check order (G10 includes the probes):

1. `rebuildWindowLighting()` room probe (js/Map/MapEnvironmentManager.js:613–626) resolving `null`/wrong room at the chatroom's window (probe point lands on a wall cell or outside the rect's off-by-one edge).
2. The room region being shadowed or replaced by an auto-detected enclosure (`RoomEnclosureDetector` skips components intersecting authored rooms — but only if the authored rect actually covers the component's cells).
3. The chatroom lamp's `roomId` resolution (`collectAllLights`, js/Map/MapEnvironmentManager.js:1190) pointing at a zone id instead of the room region id.
4. Room-scope config: chatroom has no authored `daylightGloom`, so it should inherit preset default 0.35 — if it renders bright at noon with no window, the region itself isn't in `getLightingRooms()`.

### 1.4 Lighting is not clipped to visible artwork

**Implemented (G11):** `getMapArtMask()` builds a half-resolution, alpha-thresholded mask of the composited background plus wall art (including the overhang strip above the map) plus painted room floors, rebuilt on map/background/wall-geometry change and applied as one `destination-in` composite at the end of both passes. The extent rect stays as the cheap outer bound.


`getMapExtentClipRect()` (js/Map/MapEnvironmentManager.js:1165) clips to the **map-dimensions rectangle** (+ wall overhang). That was the §1.3 ruling in `CUSTOMIZE_AND_LIGHTING_PLAN_2026-08.md` — rect only. The owner's expectation is stricter: no darkness over transparent tiles / areas without artwork. That requires a per-pixel **alpha mask of the map art**, not a rect. Ruling updated: see §2.3.

### 1.5 Customize/Build UI gaps (js/UI/Panels/SurfaceCustomizePanel.js, WallBuildPanel.js, index.html:295–338, css/components/_window-ui.scss:239–360)

- **Hardcoded wall face:** `handleStagePointerDown` always sets `face: 'south'` (SurfaceCustomizePanel.js:76). North-facing walls are unpaintable and the click can repaint the wrong face.
- **No current-finish indication:** swatches never mark which finish the clicked surface already has.
- **No mode affordance:** entering Customize mode changes only the cursor; nothing tells you to click a surface, and paintable surfaces aren't highlighted. The panel doesn't even open until you click one (`open()` only in `handleStagePointerDown`) — reported as "nothing happens at first".
- **Floors:** clicking depends on `.floor-surface` elements carrying `dataset.roomId` and receiving pointer events under `body.customize-mode`; reported broken — verify hit-testing and the `regionManager.get('room', id)` id match (zone ids vs room ids again).
- **Design system:** the panels use raw inset/outset borders and ad-hoc spacing rather than the settings-panel patterns (`.settings-group`, `.setting-hint`, shared mixins in _window-ui.scss). Fieldsets are fine and stay; the visual language should match Settings.
- **Build discoverability:** Build mode exists (`#build-toggle` toolbar button + drag/Shift-drag) but is evidently not findable. Toolbar icon/tooltip/labeling pass needed; the panels currently reuse folder/list icons (index.html:299, 322).

### 1.6 Fixtures on stubbed walls

Corrected diagnosis (owner, 08-11): fixtures do **not** slide. Two fixture paths behave differently:

- **Authored decorations** hide already — `WallDecoration.applyWallCut` (js/Map/Walls/WallBuilder.js:104) sets `element.hidden` once the cut line passes below the decoration's own top.
- **Placed fixture map objects** hold their canonical full-wall Y and stay fully visible — `applyWallCut()` in js/Map/MapObjects/Barrier/WallFixturePlacement.js:68 is a deliberate no-op ("lowering the wall must not delete it").

So a painting keeps hanging where it hung while the wall behind it drops to a 28px stub, leaving the art in mid-air over the floor — the reported "floating" look. (WallBuilder.js:151 is the *opening* slot; doors and windows genuinely do follow the wall down.)

---

## Part 2 — Rulings

### 2.1 Rooms with no wall between them (owner question)

> **Implementation note (2026-08-11):** with an open boundary carrying spill 0.85, the old in-place spill pass compounded down chains — House's windowless, lampless hallway came out *brighter at night* than the room with the lamp in it (0.718 vs 0.595), and the result depended on opening order. The spill pass now reads every opening from a **snapshot** of the pre-spill values: light reaches the room next door, not three rooms down a chain, and the answer is order-independent.


Two authored rooms sharing an open edge (no wall cells along the boundary) are **one light space**. Model it without merging regions:

- After geometry changes, compute **light-zone connectivity**: rooms whose shared boundary has open (wall-free) cell runs are joined by an **implicit opening** with `spillFactor` scaled by open-run length (full open edge → ~0.85, a 1-cell gap → ~0.3, same curve as window `daylightPerCell`). Feed these into the existing spill pass in `deriveRoomLightingState` — no new rendering concept.
- Regions stay separate (floors, stats, membership all still want distinct rooms); only light couples strongly.
- A lamp near the open edge therefore lifts both rooms — the strong-spill answer to "does it affect the other room": yes, proportionally to how open the boundary is. Radial lamp cutouts already cross boundaries since they're room-agnostic.
- The unassigned hallway strip in House (x352–608, south half) should become an authored or detected room so it participates; today it's no-man's-land.

### 2.2 Fixtures in stub/down presentation (Sims question)

Ruling: **fade out, don't hang in the air.** When a fixture's host piece renders `stub` (cutaway) or presentation is `down`, the fixture fades to hidden (~150ms opacity transition, `pointer-events: none` while faded); it returns when the piece stands. Wall-mounted things exist on the vertical surface — with the surface gone, drawing them at their standing Y reads as ground clutter, which is what the "floating" report is. Presentation only: the record, socket attachment and authored u/v are untouched.

Implementation notes:

- **One shared helper** for `WallDecoration` and `WallFixtureMapObject` so the authored and placed paths can't drift apart again. Rule is the existing decoration rule: hidden once `cutY > posY`.
- **Reachability guard:** a faded fixture must never become an invisible drag target or unreachable in Build/Customize mode. Dragging already stands the wall (`refreshMovingObjectReveal`); entering Build mode should force full presentation for the same reason.
- **Config flag (implemented)** `wallSystem.fixtureCutBehavior: 'hide' | 'clip' | 'keep'`, default `'hide'`. `'keep'` is today's no-op behaviour, kept testable. `'clip'` clip-paths the fixture at the cut line so only the wall-backed part draws — honest, but at a 28px stub it leaves a sliver of frame, so it is not the default. (Supersedes the earlier `'hide' | 'slide'` flag; nothing ever slid.)
- Partial coverage stays **binary** under `'hide'` — most fixtures are taller than the remaining stub band, so clipping buys little.

### 2.3 Lighting clip (supersedes CUSTOMIZE_AND_LIGHTING_PLAN §1.3)

The darkness/lighting canvases clip to the **map art's alpha**, not just the map rect: build a low-res offscreen alpha mask of the composited map background (+wall overhang strip) once per map load / background change, threshold alpha > 0, and apply with one `destination-in` draw at the end of the darkness pass (color pass too). The rect clip stays as the cheap outer bound. Mask lives in world space; per-frame cost is one composite. Atmosphere tint (`map-environment-fill`, multiply) stays canvas-wide as before.

---

## Part 3 — Fable block

**F-P1 — Room light-region geometry v2 (§1.1 + §1.2).** One pass, because the region builder and the feather model must change together. Deliverables: tilemask-derived interior masks; four-orientation wall face bands clipped by cut state; plaster strip owned by wall bands; outward feather; walls-up/down byte-identical interior light values (re-run the F-L3 headless check). This is the only feel-sensitive math; nothing here is delegated.

**F-P2 — Light-zone connectivity ruling implementation (§2.1)** — small, sits directly on the spill pass; Fable implements the connectivity scan + implicit openings, then G-blocks consume it. (If F-P1 verification eats the session, F-P2 is written as a spec tight enough to demote to a G-block.)

---

## Part 4 — Dispatch blocks (Codex / lesser model)

### G10 — Chatroom lighting diagnosis + fix
Instrument, don't guess. Add a temporary debug dump (behind `SiteConfig.debug`) printing per-room `lift/gloom/windowDaylight` and each opening's resolved `sideA/sideB`; run headless House at noon and at night. Fix the located cause (§1.3 candidates 1–4 in order). Includes the Kitchen `y=31/h=417` TMX normalization (snap authored room rects to the cell grid on load with a console warn). Acceptance: chatroom glooms at noon with its window removed, brightens with the window, lifts at night with its lamp; other three rooms unchanged.

### G11 — Artwork alpha clip (§2.3)
Build/cache the map-art alpha mask; composite `destination-in` on both lighting canvases; invalidate on background/geometry change. Acceptance: darkness never covers transparent tiles or render-inset padding; House/Outside/DoorTest visually verified; no measurable frame cost at idle (signature short-circuit still holds).

**G11 corrections (owner review 2026-08-11, second pass).** The first mask was opaque over 100% of its own bounds on House — it clipped nothing at all. Three causes, all now fixed:

1. It filled every room's **light rects** into the mask. That is circular: the mask exists to bound the light regions, so painting the regions into it guaranteed the darkness could never be clipped by it, and pushed opacity out past the art at the map edges.
2. Wall pieces were filled as **solid boxes** instead of drawn. A wall frame is transparent above its cap and a doorway is a hole cleared straight through it, so boxes handed back exactly the pixels the mask exists to exclude.
3. Openings were then filled using `getOpeningBounds`, which is the opening's **cell footprint at ground level** — but the door or window hangs up in the wall frame where the hole actually is. The object's own rect is what fills the hole.

Mask now traces real alpha only: baked background, wall piece canvases, floor surfaces, opening objects. Opaque fraction House 1.000 → 0.966, Outside 0.979 → 0.971, DoorTest 0.770 → 0.765; the only transparent islands left above the ground line are the genuine sky margins around the wall tops.

**Third pass (owner review 2026-08-11).** Four more, all located from measurements rather than screenshots:

1. **Diagonal adjacency ran before orthogonal.** Every north-south wall found a room diagonally "south" of it, so a wall dividing two rooms side by side belonged entirely to whichever was tested first (west). That painted a stripe of the neighbour's darkness down the far room's edge - the "left wall column doesn't have anything". Orthogonal neighbours now decide the structure; the diagonal search is a last resort for a cell that touches no room squarely, i.e. a true corner.
2. **A wall dividing two rooms side by side has no room "in front" of it.** It is now split on its centreline, the rule the floors already meet on, so each room owns its own half.
3. **The art mask did not follow a cutaway.** It was keyed on `presentation` only, so lowering pieces left the mask holding the uncut wall's shape and the darkness kept clipping to art that was no longer drawn. It is now keyed on the per-piece render plan, same as the lighting signature. Verified: mask opacity 0.967 walls-up → 0.858 walls-down.
4. To afford that, the rebuild had to get cheap: the background image is cached, and the binarising `getImageData` pass is gone in favour of the art's own alpha (a half-transparent edge pixel should take half the darkness, not all or none). `artMaskAlphaThreshold` retired.

**Tuning (owner call).** Windowless rooms sat at 4x the gloom of windowed ones at noon (0.35 vs a 0.0875 floor), reading as shadow rather than as indoors. `roomDefaults.daylightGloom` 0.35 → 0.24 (outside 0.3 → 0.22) and `window.gloomFloor` 0.25 → 0.55 compress that to 0.132–0.24, a 1.8x spread.

**Fourth pass — the containment ruling (owner, 2026-08-11). This supersedes the wall-band model in F-P1 §1.1.**

Every earlier version derived a room's light region from the wall ART: a standing wall draws 192px of frame reaching up over the floor of whatever is behind it, and the region followed it. That is why a room's darkness kept sitting over its neighbour, no matter how the ownership was arranged — the darkness was tracking the artwork instead of the enclosure.

Ruling: **a room's darkness is its enclosed footprint and nothing outside it.** The region is the room's interior cells plus the wall CELLS that enclose it — never the wall art's height. A wall cell between two rooms splits on its centreline; quadrants make that fall out for free and cover corners at the same time, and a perimeter wall's outward quadrants fall back to the one room it borders so no half-tiles are chewed out of the edge.

Consequence, accepted: wall art standing above a cell is tinted by whatever room's floor is behind it, because that is the floor those pixels occupy. Exterior wall faces therefore take no room darkness at all.

Retired by this: the four-orientation face bands, `getCutYOver`-derived band tops, `WallBuilder.getArtTopOver`, and the band-vs-art alignment gate. The new gate is **containment**: no room's rects may cover any cell belonging to another room's interior. Verified 0 spills and 0 coverage gaps across House at noon/night, walls up and down.

**Fifth pass — the paint/plaster ruling (owner, 2026-08-11). This is the settled model; it supersedes both the F-P1 wall bands and the fourth-pass containment ruling.**

A wall is TWO surfaces stacked in one cell, and they belong to different owners:

- The **painted face** — the vertical wall you look at, drawn in the frame above the cell. It carries the paint of the room in FRONT of it (to the south), so that room lights it, including where the frame reaches over the floor behind. Containment was wrong to withhold this: it left every wall face unlit, most visibly the exterior walls along the top of the map.
- The **construction plaster** — the wall's own cell, its footprint and cap. Bare structure belonging to no room. It takes **no** room darkness and reads as an undarkened seam between rooms (owner confirmed: keep it fully undarkened, not partly).

Deriving the region from the whole wall put a room's darkness over its neighbour's floor as a slab; deriving it from the enclosure alone left the faces unlit. Splitting the wall into its two surfaces resolves both.

Two riders:

- **A lowered wall's cell is floor.** The plaster is only excluded because it covers the floor; stub or hide the wall and that footprint is revealed floor again, so the cell lights like any other tile. Without this, walls-down left an unlit column exactly where the floor came back.
- **A north-south wall goes whole to the room on its WEST** (owner ruling), so the boundary lands on the column's right edge instead of splitting it and showing each room a half-tile of the other's darkness. Verified on House walls-down: playroom covers cols 0..11, hallway 12..18, bedroom 19..29.

The containment gate is retired with the ruling that produced it — the painted face is now *meant* to reach over the floor behind. Live gates: zero coverage gaps, walls-up/down interior equality, and the mask following the cut.

**Sixth pass — the wall anatomy, measured (2026-08-11).** The paint/plaster split was right but placed from constants, and the constants were wrong. Measured off the finish overlay and construction frame directly (`plaster_wall`, straight horizontal mask):

| band | frame rows | world |
|---|---|---|
| top cap (plaster, unpainted) | 9–22 | `[baseline - height - thickness, baseline - height]` |
| painted face | 23–182 | `[baseline - height, baseline]` |
| below the baseline | — | nothing drawn |

So `getCutYOver` already returns the **paint top** exactly; the `getArtTopOver` helper I had added was including the 14px cap — the very strip that must not be darkened. It is deleted again.

Corrections that follow:

- The paint runs DOWN to the baseline, so it already covers the wall's footprint on screen. There is no "north floor strip" inside the cell; the only floor the cell still shows is the sliver **below** the baseline, which is the south room's. That sliver was the "half tile without lighting where wall and floor meet".
- The **top cap sits above the paint, inside the room behind**, so that room's floor darkness ran straight over it. Plaster is now collected into `_plasterRects` and punched out of the composed field with one `destination-out` pass — it belongs to no room, so it is subtracted rather than assigned.
- A **north-south wall has no painted face at all** (`paintRegion` returns null: "construction, not a painted face"). It contributes only the floor strip either side of its `thickness`-wide footprint, and the footprint itself is plaster. This supersedes the fifth-pass "west room takes the whole column" ruling, which was an approximation of the same thing: each room now stops exactly at the plaster edge.
- A wall with no room to its south (the building's front) gets no paint band and no strip below it, so there is no darkness in front of it.

Verified per strip on House: vertical divider → west strip west room, plaster centre **nobody**, east strip east room; front wall → nothing below or on the plaster.

**Seventh pass — owner's annotated map (2026-08-11).** Two classes marked, both located and fixed:

*Magenta — lit but must not be.* The building's front wall. Its art band (`[paintTop - thickness, baseline]`, world y 777–951 on House) is drawn over the floor of the room BEHIND it, and that room's floor rect was lighting it. There is no room to the south of a front wall, so nobody looks at that face — it is an exterior surface. The whole art band is now punched back out. Top caps were the same story: the cap punch only ran when a south room existed, so front-wall and end-cap caps were left lit. It now runs for every horizontal wall cell (28 unpunched caps → 0).

*Red — unlit but must be lit.* North-south wall columns. Slicing them into a 9px floor strip either side of the footprint left most of the tile dark, which is the "half the tile is getting filled only". Seen edge-on a north-south wall is one narrow column of construction with no cap standing over anything, so it takes the room's light **whole** — west owns it where both sides are rooms, otherwise the single adjacent room does. Verified: playroom covers cols 0..11, bedroom 19..29, kitchen 0..14, chatroom 15..29.

Net rule: **wall art is punched out of every room's floor, then given back only to the room that looks at it.** Horizontal caps never come back; a horizontal paint band comes back to the room on its south; a north-south column is lit whole.

### G12 — Customize panel UX + design-system pass (§1.5)
- Resolve clicked face from click Y vs piece baseline (or piece cell `faces` data) instead of hardcoded `'south'`; paint the face you clicked.
- Mark the surface's current finish in the palette (`aria-pressed` + visible selected style); show target name in the panel ("Painting: Bedroom floor" / "Wall — south face").
- On entering Customize mode: open the panel immediately in its empty state with instruction copy, and add a hover outline on paintable surfaces (`body.customize-mode .wall-piece:hover, .floor-surface:hover`).
- Fix floor painting: verify `.floor-surface` elements exist, carry the region's room id, and are hit-testable in customize mode; align id namespace with region ids.
- Restyle both panels with the settings-panel vocabulary (tokens, `.setting-hint`, shared mixins) — SCSS sources only, then `npx sass css/style.scss css/style.css --no-source-map`.
- Proper toolbar icons + tooltips for Customize and Build (both currently reuse unrelated icons).
Acceptance: browser-verified flow — enter mode, guidance visible, hover previews, click paints correct face/floor, current finish marked, Escape exits clean.

### G13 — Fixture stub fade (§2.2)
Implement `wallSystem.fixtureCutBehavior` (§2.2's naming, which supersedes `fixtureStubBehavior`/`'slide'`) with default `'hide'`: fade fixture elements when their host cell run renders stub/down, restore on full; no layout thrash (opacity only); persists nothing. Acceptance: cutaway walk-behind fades the painting out and back; walls-down hides all fixtures; `'slide'` flag restores today's behavior.

### G14 — Light-zone consumers + hallway room (§2.1, after F-P2)
Author the House hallway room volume; verify implicit-opening spill headlessly (lamp at open boundary lifts both rooms; walled boundary with a door still uses door spill only). Acceptance numbers captured in the verify script like F-L1's.

---

## Sequencing

1. **F-P1** (Fable) — unblocks honest visuals; G10 diagnosis can run in parallel (different code paths).
2. **G10, G11, G12, G13** — independent of each other, dispatch in parallel after F-P1 merges (G12/G13 touch presentation that F-P1 doesn't).
3. **F-P2 → G14** last; spill changes are meaningless until the region geometry is trustworthy.

Verification standard: every block re-runs the F-L1 headless acceptance (`/verify` harness) plus its own checks; walls-up vs walls-down interior equality is a regression gate from now on.
