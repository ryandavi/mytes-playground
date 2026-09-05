# Customization UI, Build Mode & Lighting v2 — August 2026 Plan

Owner questions answered 2026-08-11; this document is the design of record for the next phase. Companion dispatch blocks: G4–G6 in `CODEX_GOALS_2026-08.md`. Phases marked **[Fable]** are architecture/feel-sensitive and stay with Fable; **[Delegate]** blocks are written to be executable by Codex without rediscovery.

> **Reconciled status 2026-08-11:** The full plan is implemented and verified: Lighting F-L1–F-L3, G4 customization, G5 persistence, G6 authored-room cleanup, G7 blob-backed backgrounds, G8 lighting follow-ups, G9 enclosure detection, and the wall build-mode UI. Remaining work is limited to the separately deferred `editor/` audit and optional visual/feel tuning.

---

## Part 1 — Settled architecture questions

### 1.1 Zones vs regions vs rooms (the ruling)

Three layers, one geometry system:

| Concept | Class | Role |
|---|---|---|
| **Region** | `SpatialRegion` / `RegionManager` | Pure geometry + occupancy. Shapes: rect, polygon, tilemask. Layered (`'room'`, zone layers). No behavior. |
| **Zone** | `GameZone` / `ZoneManager` | Gameplay *behavior* volume — stat effects per ms, enter/stay/leave. Each zone **owns a region** (registers its geometry into RegionManager). |
| **Room** | Region on layer `'room'` | Registered by `MapEnvironmentManager.registerRoomRegions()` from authored Tiled room objects. Carries `properties.lighting`, `wallFinishId`, `floorFinishId`, `doors`, `adjacentRooms`, `indoor: true`. |

**Rule going forward: rooms are regions, never zones.** Zones remain "a place where something happens to a Myte" (recovery, play, water). G6 removed the legacy zone-to-room shim and authored real room volumes in the interior maps. Everything room-shaped (lighting, walls, floors, door topology, occupancy) reads regions; nothing should ever ask ZoneManager "what room am I in".

When Sims-style building lands, player-built enclosures become **runtime-registered room regions** (flood-fill enclosure detection, Part 3) — same store, same consumers, no new concept.

### 1.2 Walls + floors: what should merge

Already shared: `FinishPalette` (template recoloring), the template-finish data pattern, room properties as the finish source, build-after-rooms ordering. Genuinely combinable:

1. **Registry base class — complete.** `SurfaceMaterialRegistry` owns shared load/decode/template/cache plumbing while wall and floor registries retain their distinct schemas and geometry.
2. **One customization API — complete.** `SurfaceCustomizer` provides apply, preview/revert, and finish listing for the toolbar Customize mode.
3. **One persistence home — complete.** WorldState stores changed room floors and WallBuilder v7 stores geometry deltas against the authored TMX baseline.

Keep separate: the builders. WallBuilder and FloorBuilder share almost no logic (masks/cutaway vs clip-paint) — merging them would be abstraction for its own sake.

### 1.3 Lighting overlay extent (clip question)

Today the overlay covers the container∩canvas rect, so darkness/tint also covers the transparent render-inset padding around the map art. **Ruling: the darkness/lighting canvas is world air — clip it to the map's drawn extent** (map dimensions + the wall top-overhang strip, i.e. the same rect `renderInsets` reserves for art), not the whole padded canvas and not the app-stage. The page-background strips going dark reads as a rendering bug, not night. Implementation is cheap: the darkness pass already draws in screen space with world transforms — clamp its fill rect to `worldToScreenRect(mapRect grown by wall overhang)` (part of Fable lighting pass, F-L1). The *atmosphere* tint (`map-environment-fill`, multiply blend) stays canvas-wide — it multiplies over transparency harmlessly and reads as ambience.

### 1.4 Geographic sunset (worldX-aware)

Maps already carry `worldX/worldY` via WorldGraph layout. **Do it, but as a constant per-map minute offset, not solar geometry.** `sunsetOffsetMinutes = worldX * SiteConfig.gameTime.minutesPerWorldUnitX` (suggest ~6 game-min per world unit, clamp ±30), applied when `resolveSunCycleState` parses the sunrise/sunset windows. Walking east, the sun sets a touch earlier next map — evocative, one multiply, zero new state. The global clock stays global; only the *window boundaries* shift. Anything beyond a constant offset (latitude, seasons × longitude) is overcomplication — explicitly out of scope.

---

## Part 2 — Lighting v2 [Fable core, F-L1..F-L3]

> **Resolved in G8:** darkness now uses configurable multi-level dithering at every light level with a persisted Dithered/Smooth player setting. Room lighting uses wall-shaped hard regions while walls are visible and retains soft feathering in down/hidden presentation. Enclosure flood-fill (§3.2 item 3) subsequently landed as G9.
>
> **Status 2026-08-11: F-L1–F-L3 implemented and verified** (headless: House noon gloom Bedroom 0.35 / Kitchen 0.196 / Chatroom ~0 by window+lamp; night hands over to lifts; walls-down light values byte-identical; lighting toggle kills overlay; House offset 0 / Outside +6 min; zero console errors). Skipped by design: progress-keyed band stops — the authored band gradient already carries a full color ramp. Tuning knobs: preset `lighting.roomDefaults.daylightGloom`, `lighting.window.*`, `lighting.openWallFeatherScale`, `SiteConfig.world.sunCycle`.

Design accepted in principle; Fable implements the model, Codex gets no part of the darkness math. All factors in `SiteConfig` / environment presets — feel-tuning must never mean code edits.

**F-L1 — Interior daylight model.** Today darkness exists only at night (`darknessFactor = nightStrength`), and rooms only *lift* it. Add per-room **interior gloom**: an indoor room's darkness is `max(nightDarkness, interiorDaylightGloom × (1 − windowDaylight))`, where `interiorDaylightGloom` comes from the room's lighting config (default ~0.35 — dim, not black) and is reduced by lights (existing `roomFill` path) and by **window daylight** (below). Rendered as the existing feathered room rects, but drawing darkness *into* rooms during day instead of only cutting it out at night. Clip the darkness canvas to the map extent (§1.3) in the same pass.

**F-L2 — Windows as light sources.** Auto-derive `lightOpenings` from the wall system instead of hand-authoring: every wall opening record of type `window` becomes (a) daytime: a directional daylight source into the adjacent interior room — intensity `= (1 − nightStrength) × windowDaylightFactor`, warm during sunrise/sunset band using the existing band color; (b) always: a room-to-room / room-to-exterior spill opening (existing `lightOpenings` spill machinery — `roomA/roomB` resolve from the same probe pattern `buildDoorRoomTopology` uses). Doors with `blocksLineOfSight: false` contribute spill only. Rebuild on `EVENTS.WALL_GEOMETRY_CHANGED`.

**F-L3 — Presentation interplay + polish.** Walls-down/hidden is a *view* mode: gloom and window light stay computed from real topology (the room is still enclosed; you just see over the walls). One nicety: in `down`/`hidden`, scale room-edge feather up slightly so hard darkness edges don't sit on invisible walls. Sunset polish: key the band gradient's stop colors to cycle progress (gold → salmon → violet across the window) rather than one static ramp, and let `gradientAngle` ease across the window (sun position sweeping) — both pure preset-data changes once F-L1 lands, plus the §1.4 worldX offset.

Acceptance for the Fable block: House at noon with no lamps reads dim inside, bright outside; turning on a lamp lights its room; a window wall brightens the room during day and glows warm at sunset; exterior unchanged; walls-down changes nothing about light values; toggling Settings > Lighting off still kills the whole overlay.

---

## Part 3 — Customization UI & build mode

### 3.1 Customize mode (paint) — G4 [Delegate]

> **Complete and browser-verified.** The toolbar mode, surface selection, cached swatches, delayed preview/revert, commit, wall scope, Escape handling, and persistence are live.

Toolbar-entered **Customize mode** (same pattern as existing tool modes; Win-98 aesthetic):

- Click a wall face → sidebar palette panel: finish swatches from `WallMaterialRegistry` (constructions later; finishes first). Click a floor → floor finishes from `FloorMaterialRegistry`. `FinishPalette` makes swatch chips nearly free (recolor a 1-cell sample).
- **Hover = live preview, click = commit.** Preview through `SurfaceCustomizer.preview()` → `setFaceFinish`/`setRoomFinish` with revert-on-leave; both already rebuild fast enough at House scale (99 pieces). Commit persists via WorldState (G5).
- Scope toggles for walls: this run / whole room (walk the room's boundary cells) — room scope resolves cells via region geometry, not new bookkeeping.
- Escape or toolbar click exits; mode sets a body class so the cursor and hit-testing (reuse `MapObjectInputController` hover plumbing) know.

### 3.2 Build mode (Sims-style walls/rooms) — staged, wall part G6-prep [Fable boundary + Delegate execution]

> **Complete and browser-verified.** Straight and Shift-rectangle ghost drags add/remove walls transactionally; room detection and persistence react; a node-budget failure restores the prior geometry and shows the friendly toast.

`setWallCell(x, y, data|null)` already exists and does the hard part (reindex, rebuild, grid/LOS sync, geometry event). Build mode is UI + persistence + room detection:

1. **Drag-a-wall:** grid-snapped click-drag along an axis paints/removes wall cells through `setWallCell`; ghost preview cells before release (reuse the placement-preview visual language from opening moves). Shift-drag rectangle = four walls (a room shell).
2. **Persistence:** wall-state v7 `cells` delta list (add/remove vs authored TMX baseline) — G5 lands this first; build mode depends on it.
3. **Enclosure detection [G9, complete]:** after geometry changes, flood-fill open cells bounded by wall cells + map edge; enclosed areas become/refresh runtime room regions (layer `'room'`, tilemask shape) so lighting, floors, cutaway, membership, and door topology all follow automatically.
4. Node budget: `enforceNodeBudget` already throws past 300 generated nodes — build mode surfaces that as a friendly toast ("This map can't hold more walls") instead of an exception.

No implementation item in this section remains. Construction/finish expansion beyond walls and the existing finish palettes would be a new phase, not unfinished work here.

---

## Part 4 — Remaining audit surface (next sessions)

Audited 2026-08-11: **SoundManager + spatial audio** — two defects fixed (music-volume staging stomped by `updateAllVolumes`; `stop()` leaving pattern loops running); spatial math and node lifecycle otherwise sound. **User/Inventory save round-trip** — two gaps fixed (no save on tab close → pagehide/hidden flush in Core; `syncInventoryFromItems` reimplementing `loadItems` and dropping item names). **ShopPanel/UserProfilePanel** — clean. **TileMapLoader** wall/floor additions — clean; G7 replaced baked-background data URLs with lifecycle-managed blob URLs. `scripts/generate-wall-sprites.js` — clean dev tooling.

Still unaudited, by owner direction deferred: **editor/** (JS side; PHP was hardened 08-06) — revisit when editor work resumes.
