# Remaining Architecture Work — August 2026

**Reconciled against:** the working tree on 2026-08-06  
**Current owner decision:** wall implementation remains postponed; long-duration performance tests are not required.  
**Detailed wall contract:** [`WALL_SYSTEM_AND_SPRITESHEET_SPEC_2026-08.md`](WALL_SYSTEM_AND_SPRITESHEET_SPEC_2026-08.md)

## Executive summary

All non-wall work previously listed in this document is complete. The only unfinished architecture milestone is the intentionally postponed wall system:

1. T10 — wall generation and walls-up/walls-down/cutaway rendering.
2. T11 — independent face finishes, persistence, openings, and wall attachments.
3. The wall-specific portion of T12 — schema validation and invariants that cannot exist until T10/T11 do.

Long-session trace/heap work has been removed from the completion gate by owner direction. Wall implementation must still receive proportional performance validation when it eventually lands, using the pre-wall DOM baseline below.

## 1. Postponed wall work

### 1.1 T10 — wall generation and render modes

**Status:** postponed; not implemented.

Expected new runtime files remain absent:

- `js/Map/Walls/WallBuilder.js`
- `js/Map/Walls/WallRun.js` or an equivalent render-segment class

Required outcome:

- Author semantic wall-base cells on a Tiled `Walls` layer, starting with House.
- Compute a fence-style N/E/S/W four-bit neighbor mask at map load.
- Resolve all 16 raw masks into isolated/end/straight/corner/T/cross construction pieces.
- Merge horizontal straight centers where safe; keep vertical walls depth-safe through per-cell or short segments.
- Render walls as non-interactive geometry with no per-wall tick.
- Add walls-up, walls-down, and cutaway modes.
- Cut away the obscuring south/front boundary only; north/back and east/west side walls remain full height.
- Keep collision, LOS, rooms, and door topology identical across visual modes.

The old July repeated-strip proposal is no longer authoritative. The complete replacement design, including sprite dimensions and layer packing, is in the dedicated wall specification linked above.

### 1.2 T11 — face finishes, openings, persistence, and attachments

**Status:** blocked on T10; not implemented.

Required outcome:

- Add `data/map-objects/wall-materials.json` with separate construction and finish registries.
- Store material independently on cardinal faces (`north`, `south`, `east`, `west`).
- Derive interior/exterior from the adjacent room; support two interior faces on a room-to-room wall.
- Persist finish overrides against map cell ranges plus face, never generated run ids.
- Model doors/windows as reserved gaps with jambs; window cells clear LOS where declared.
- Expose face surface sockets using the existing attachment system.
- Reserve attachment intervals and reject overlaps.
- Make attached decorations follow their owning face’s cutaway visibility.
- Add editor support in the same schema-changing work.

### 1.3 Wall-specific T12 closure

After T10/T11 land:

- Validate construction/finish sheets, mask maps, face overrides, gaps, and customization records.
- Assert deterministic segment ids for diagnostics while ensuring persistence does not depend on them.
- Add face-interval, attachment-ownership, and regeneration-cleanup invariants.
- Assert byte-identical grid/LOS/room state across wall display modes.
- Run a focused browser matrix for all wall modes, editor save/reload, paint persistence, paintings, doors, and windows.

## 2. Wall art contract at a glance

The detailed specification is authoritative. These are the asset-author essentials:

- Map cell: 32 px.
- Prototype full height: 96 px/three cells.
- Walls are painted as logical one-cell bases in Tiled.
- Structural connection frames begin as 16 columns, one per raw neighbor mask.
- Each full frame canvas is 32 × 96 px.
- Each walls-down stub frame is 32 × 28 px by default.
- Construction art contains tops, caps, corners, junctions, and jamb trim.
- Paint/wallpaper is a transparent directional face overlay, separate from construction.
- Finish sheets provide aligned north/south/east/west full and stub pieces.
- East and west finish pieces remain separate because the two sides may use different materials.
- Horizontal centers may repeat along X; vertical pieces must preserve local depth sorting.
- Exact atlas rectangles live in `wall-materials.json`, never renderer constants.

## 3. Non-wall architecture work completed on 2026-08-06

### 3.1 Phase 9 conversion closure

The remaining chest/fountain/bed sweep is closed:

- BED already uses directional `SocketSet` sleep sockets; no legacy rest-position occupancy ledger remains.
- FOUNTAIN now advertises `capabilities.drinkSource` and its AI affordance is data in `types.json`; `DrinkFromFountainAction` checks the capability rather than the class name.
- TREASURE_CHEST now advertises `capabilities.lootContainer`; open/close actions check that capability rather than constructor names.
- Chest animation/open state is intrinsic object state, not shared occupancy, so converting it into a socket or relationship would be artificial.
- Fountain approach remains the shared adjacent `GoToObjectAction` approach contract; it does not need a reserved seat-like socket.
- New sittable and edible types remain discoverable from data with no MyteAI type branch.

### 3.2 Authored irregular-room fixture

Complete:

- Added `data/maps/RegionTest.tmx` with an authored `tilemask="111/100/100"` L-shaped room.
- `TileMapLoader` parses compact object-local tilemasks into absolute grid cells.
- `MapEnvironmentManager` preserves tilemasks when registering room regions.
- Content validation asserts both arms are present and the concave cell remains outside.
- Browser verification confirmed the runtime shape is `tilemask`, its three arm probes are inside, and the concave-corner probe is outside.

### 3.3 Attached-child room inheritance

Complete:

- `Entity.currentRooms` follows the attachment parent while attached.
- Attaching removes stale independent room membership from reverse occupant sets.
- `GameMap` skips redundant room scans for attached Mytes.
- Detaching forces immediate independent membership recomputation.
- Browser verification moved an attached Myte into and out of the L-shaped room through its parent, confirmed zero independent scans/membership while attached, then confirmed correct room restoration on detach.

## 4. Player-experience work completed on 2026-08-06

### 4.1 Mobile action treatment

The provisional narrow-screen overlay is replaced by a dismissible bottom drawer:

- fixed to the lower viewport at widths up to 960 px
- constrained to 70dvh/scene height
- uses the existing raised Windows-style panel and button treatment
- includes an accessible close button
- closes on Escape
- clears selection on dismiss so selecting a target reopens it predictably

Browser verification at 390 × 844 confirmed fixed positioning, visible controls, a reachable close button, and selection cleanup.

### 4.2 Contrast

The shared text tokens now provide:

- `--text-default` as the canonical alias for `--text-base`
- `--text-muted: #5b5a51`
- `--text-subtle: #49483f`

The muted token measures approximately 5.28:1 against the primary `#ece9d8` application surface, clearing WCAG AA’s 4.5:1 threshold for normal/small text. Disabled-control colors are not used as ordinary informational text.

### 4.3 Welcome-back moment

Save schema version 4 records `lastSavedAt`. Returns after six hours receive a short elapsed-time toast stating that Mytes are unchanged and time away never drains their needs. There is no offline stat decay or absence penalty. The duration threshold and toast duration live in `SiteConfig.ui.welcomeBack`.

Browser reload verification confirmed the two-day message and persistence migration path.

## 5. Editor PHP security gate completed on 2026-08-06

Reviewed and hardened `bootstrap.php`, `load.php`, `save.php`, `validate.php`, and `assets.php`:

- file ids remain allowlisted and canonical paths are checked inside the project root
- Windows path comparisons are normalized safely
- traversal and unknown ids are rejected
- POST endpoints require `application/json`
- malformed JSON and oversized bodies receive explicit 4xx responses
- body length is bounded while reading, not only after allocation
- cross-site POSTs are rejected by fetch metadata/origin checks
- remote access is denied by default
- remote access requires both `NEKO_EDITOR_ALLOW_REMOTE=true` and web-server-authenticated user identity
- internal exceptions are logged server-side and return generic messages without filesystem paths
- JSON responses are no-store, nosniff, frame-denied, no-referrer, and use a restrictive CSP
- asset traversal follows real paths, rejects symlink escapes, validates image MIME, and rejects scripted SVG files
- saves retain conflict detection, validation, backup creation, and atomic replacement

Endpoint checks confirmed 200 for allowlisted reads, 400 for traversal, 415 for non-JSON POSTs, 403 for cross-origin POSTs, and 200 for a same-origin validation request. All PHP files pass `php -l`.

The editor is safe-by-default for public hosting because it remains unavailable remotely unless explicit server authentication is configured. Do not set the remote-enable environment flag without that authentication layer.

## 6. Verification completed

- SCSS compiled from source.
- Browser bundle rebuilt from the manifest.
- `npm run validate:content` passed, including content, time-source, and text-encoding checks.
- App returned HTTP 200 and booted with zero console/page errors.
- Initial House baseline: 882 DOM nodes, 23 objects, two Mytes, clean invariants.
- Toolbar panel controls were present and opened without errors.
- Irregular room, attachment inheritance, mobile drawer, and welcome-back reload checks passed.
- Long-duration performance/heap testing is not required per owner direction and is not an open completion item.

## 7. Explicitly deferred feature work

These remain future features, not unfinished architecture:

- Wall system T10/T11 and post-wall validation described above.
- Automatic room/enclosure flood fill after walls stabilize.
- Hats/accessories and equip UI.
- Cars/trains and generic moving-platform riders.
- Database-backed world customization.
- Static pathfinding clearance fields.
- Ambient-creature zone-effect opt-in, pending gameplay direction.
- Image-format conversion, best batched with new art.

## 8. Next work when walls resume

1. Author the placeholder construction and finish sheets using the dedicated sprite contract.
2. Record the semantic House `Walls` layer.
3. Implement mask calculation and structural rendering before customization.
4. Verify depth behavior, collision, LOS, rooms, and the +300-node wall budget.
5. Add finishes, openings, persistence, attachments, and editor parity.
6. Close wall-specific T12 validation.
