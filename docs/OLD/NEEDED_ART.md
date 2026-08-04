# Needed Art Audit

Audit updated: 2026-05-23

This file tracks:

1. Myte animation backlog
2. World/item art still needed or still using placeholder/shared data

Status terms used below:

- `Missing`: code or map data references art that does not exist
- `Shared placeholder`: asset exists, but multiple variants currently point to the same sheet/art
- `Data mismatch`: art may exist, but config/data names or paths do not line up with runtime

## Myte Animations

| Animation ID | Directions | Used By | Notes |
|---|---:|---|---|
| `sleep` | 1-4 | `SleepAction`, `SimpleSleepAction` | Eyes closed, gentle bob |
| `excited` | 1-4 | `PlayFetchAction` | Bouncy, tail-wagging excited pose |
| `wave` | 2-4 | `GreetAction`, `GreetReceiveAction` | Can be mirrored if left/right only |
| `eat` | 1-4 | `EatElementAction` | Nom loop |
| `smell` | 1-4 | `SmellFlowerAction` | Lean forward, sniff |
| `drink` | 1-4 | `DrinkFromFountainAction` | Lean in to water, lap/sip |
| `water_plant` | 1-4 | `WaterPlantAction` | Watering can / pour gesture |
| `harvest` | 1-4 | `HarvestAction` | Reach forward, pick from plant |
| `open_chest` | 1-4 | `OpenChestAction` | Crouch + lift lid |
| `carry_hold` | 4 | `CarryAction`, `HoldBallAction` | Overhead carry pose |
| `carry_walk` | 4 | `CarryAction` while moving | Carrying walk cycle |
| `peek` | 1-2 | `HideAction` | Side-eye / leaning peek |
| `celebrate` | 1-4 | reward moments | Can temporarily borrow dance frames |
| `startled` | 1-4 | future reactive state | Jump back, eyes wide |

## Expression Overlays

These are UI/emote overlays, not body sprites.

| Expression ID | Used By | Notes |
|---|---|---|
| `heart` | `ShowAffectionAction` | Heart bubble |
| `sleep` | `SleepAction`, `SimpleSleepAction` | Floating Z bubble |
| `curious` | `InspectAction` | `?` bubble |
| `panic` | `RunAwayAction` | `!!` bubble |
| `excited` | various | Stars / sparkles bubble |
| `wave` | `GreetAction` | Small wave hand bubble |
| `peek` | `HideAction` | Side-eye icon |

## Current Coverage

These look usable enough for now and are not immediate art blockers:

- Grass split sprites: `grass_1-3_back/front`
- Base chest sheet: `images/chest_spritesheet.png`
- Base ball sheet: `images/MapObjects/ball.gif`
- Butterfly base/small sheets: `butterfly.gif`, `butterfly_small.gif`
- Item sheet entries for `acorn`, `turnip`, `apple`, `cherries`, `music_box`
- House tileset art: `images/MapObjects/house.png`

## Map Object Art Needed Now

These are either already placed in `FieldTest.tmx`, `House.tmx`, `Outside.tmx`, or are referenced by active runtime systems.

| Asset / Variant | Kind | Status | Placed Now | Size | Directions Needed | Animation / States Needed | Notes / Data Suggestion |
|---|---|---|---|---|---:|---|---|
| `flower_red`, `flower_yellow`, `flower_blue` | map object | Missing | Yes | `64x64` | 1 | Static or 2-4 frame idle sway | `FLOWER` has no spritesheet URL. `images/flower.png` exists at repo root but is unused. Either wire a flower sheet or move flowers to split/front-back rendering. |
| `music_box` world object | map object | Shared placeholder | Yes | `64x64` | 1 | Static is fine, but config says `animates: true` | World art exists as `images/MapObjects/music_box.png`, but there is no animation config. Either add 4-6 frames for lid/pendulum motion or mark it non-animated. |
| `wooden_chest`, `golden_chest` | map object | Shared placeholder | Yes | `64x64` render from `32x32` frames scaled x2 | 1 | `closed`, `opening`, `opened`, `closing` | Only one chest sheet is wired. `golden_chest` needs its own look, or a palette-swap row plus `variantConfigs`. |
| `wooden_door` | map object | Usable base | Yes | `32x96` vertical, `96x32` horizontal | 4 runtime facings | 5-frame open/close loop | Current base `door.png` works for the wooden/default door. |
| `metal_door` | map object | Generated placeholder | Yes | `32x96` vertical, `96x32` horizontal | 4 runtime facings | 5-frame open/close loop | `metal_door.png` is now a **palette recolour of `door.png`** (identical 800x256 pixel data, 7-entry palette remapped to cool steel), committed 2026-08-03 to clear the FieldTest 404. Silhouette and all 5 frames are correct; replace with real metal art when convenient. |
| `fancy_door` | map object | Shared placeholder | Yes | `32x96` vertical, `96x32` horizontal | 4 runtime facings | 5-frame open/close loop | No variant override, so it falls back to the wooden sheet. Needs its own art. |
| `bed` | map object | Data mismatch | Yes | `128x256` or rotated to `256x128` | 4 runtime facings | Static is okay | Config expects `images/MapObjects/bed_default.png`, but repo still has legacy `bed.gif`. Wire one canonical file path. |
| `large_bed` | map object | Data mismatch | Yes | `192x256` or `256x192` rotated | 4 runtime facings | Static is okay | Legacy art appears to be `bed_big.png` / `bed_big_long.png`, not the config path. Needs cleanup plus a final chosen sheet. |
| `bunk_bed` | map object | Missing | Not placed yet | likely `128x256` / rotated | 4 runtime facings | Static is okay | Config points to `images/MapObjects/bunk_bed.png`, which is missing. |
| `blue_portal`, `red_portal`, `ancient_portal` | map object | Missing | Yes | `128x128` | 1 | `idle`, `activate`, `active`, `deactivate` | `portal.png` is missing. Good candidate for one base sheet plus color-treated variants. |
| `magic_circle` | map object | Missing | Not placed yet | `192x192` | 1 | `idle`, `activate`, `active`, `deactivate` | Separate silhouette is probably better than recoloring the upright portal. |
| `wooden_fence`, `stone_fence`, `iron_fence`, `garden_fence` | map object | Missing | Yes | `64x32`, `32x64`, corners `32x32` | 6 runtime connection shapes | Static | Runtime supports horizontal, vertical, and four corner states. Minimum art can be one straight piece + one corner piece if mirroring is acceptable. |
| `wooden_gate`, `stone_gate`, `iron_gate`, `garden_gate` | map object | Missing | Yes | `64x32` or `32x64` | 4 runtime facings | `closed`, `opening`, `open`, `closing` | All gate sheets are missing. Minimum can be one master direction plus transforms; two masters would look better. |
| `tomato`, `carrot`, `wheat`, `berry` crops | map object | Shared placeholder | Yes | `64x128` | 1 | `seed`, `sprout`, `growing`, `flowering`, `mature`, `harvest` | All crop variants currently use `crop_corn.png`. Add per-variant sheets via `variantConfigs`. |
| `paper`, `crystal` lanterns | map object | Missing | Yes | `64x64` | 1 | `off`, `turnOn`, `idle`, `turnOff`, `flicker` | Lantern config defines animations but no spritesheet URL at all. |
| `stone`, `marble` fountains | map object | Missing | Yes | `128x128` | 1 | `off`, `turnOn`, `idle`, `turnOff`, `splash` | Fountain config defines animation states but no spritesheet URL at all. |
| `rose`, `tulip`, `lily`, `orchid` breeding flowers | map object | Missing | `rose` placed now | recommend `64x128` | 1 | `seed`, `sprout`, `bud`, `bloom`, `pollinating`, `wilting`, `dormant` | No spritesheet URL is configured. Tiled objects use `64x128`, so final art should probably match that footprint. |
| `blue_moon`, `evening_star`, `night_whisper` night blooms | map object | Missing | `blue_moon` placed now | recommend `64x128` | 1 | `closed`, `opening`, `open`, `closing`, plus growth stages | No spritesheet URL is configured. This likely wants glow-ready night art distinct from normal breeding flowers. |
| `slime`, `ghost`, `goblin` NPCs | map object | Generated placeholder | Yes | `64x64` | 4 | `idle`, walk `N/S/E/W`, alert, chase, **`jump`, `fall`** | `npc_slime.png` (256x128, 8 frames of 64x64) is a **crude procedurally-drawn green blob** committed 2026-08-03 to clear the FieldTest 404; the config URL moved from the never-existing `.gif` to `.png`. It reads as a slime and animates, but is placeholder quality — first candidate for real art. `ghost` and `goblin` still need distinct art instead of sharing slime data. **`jump` and `fall` states are now requested by `HopMotion`** (slimes travel in leaps): `jump` = squash-then-stretch launch, `fall` = stretched descent, each 1–2 frames. Both are optional — the hop falls back to the directional/idle frames when absent, so it works today and simply reads better once drawn. A `land` squash frame can be added and pointed at via `movement.hop.animations.land`. |
| `guard` patrol guard | map object | Missing | Not placed yet | `64x64` | 4 | walk `N/S/E/W`, `idle`, `alert`, pursuit `N/S/E/W` | Config defines a full gameplay sheet, but no spritesheet URL is set. |
| `blue_butterfly`, `yellow_butterfly` | map object | Shared placeholder | Yes | `100x100` | 4 | `N/S/E/W`, `idle`, `flutter` | Both variants currently share the same base butterfly sheet. If they should read as distinct species, they need separate color passes or variant-specific tint classes. |
| `small` butterfly | map object | Covered | Yes | `50x50` | 4 | `N/S/E/W`, `idle`, `flutter` | Small sheet exists and is wired. |
| `blue_ball` | map object | Shared placeholder | Yes | `64x64` | 1 | rolling loops on X/Y/Z plus reverse | `red_ball` and `blue_ball` both point at the same `ball.gif`. Blue either needs a recolor sheet or a tint pass. |
| `FOOD` world object (`apple`, `turnip`, `acorn`) | map object | Data mismatch | Runtime-spawned by zones | should be `32x32` | 1 | Static | `GameZone` spawns `FOOD` map objects, but `FOOD` has no world sprite config. Either reuse `items.png` for map objects or stop spawning `FOOD` objects and spawn `DroppedMapItem` instead. |

## Item Art Needed Now

| Asset / Variant | Kind | Status | Used Now | Size | Directions Needed | Animation / States Needed | Notes / Data Suggestion |
|---|---|---|---|---|---:|---|---|
| `tomato`, `carrot`, `wheat`, `berry` inventory icons | item | Missing | Crop harvest path | `32x32` | 1 | Static | Harvested crops are added to inventory with crop variant names, but there are no item sheet entries or CSS classes for them. |
| `coin` pickup / currency icon | item | Placeholder | Chest / pickup systems | `32x32` | 1 | Static | Current item styling falls back to a plain colored circle instead of sprite art. |
| `health` / potion pickup icon | item | Placeholder | Chest / pickup systems | `32x32` | 1 | Static | Current fallback is a solid green block. |
| equipment placeholder icons like `sword` | item | Placeholder | inventory system supports it | `32x32` | 1 | Static | Current fallback is a solid color. Add real item-sheet entries if equipment is staying in scope. |
| canonical food naming (`apple` vs `red_apple`, `turnip` vs `yellow_turnip`) | item | Data mismatch | Yes | existing `32x32` | 1 | none | Art already exists, but IDs are split across `items.json`, `DroppedMapItem`, inventory CSS, and chest data. Pick one canonical item ID per item and keep aliases only as import compatibility. |

## Non-Object Supporting Art Still Missing

These are not map objects or inventory items, but they are still visible art gaps in the current system.

| Asset | Kind | Status | Used Now | Size | Notes |
|---|---|---|---|---|---|
| `images/MapBackgrounds/bliss.gif` | map background | Missing | `outside.json` | viewport/background sized | Outside map points to a background file that does not exist. |
| portal preview image default `red.gif` | portal UI support art | Missing | Portal window UI | flexible | `PortalMapObject` defaults portal window content to `red.gif`, which is also missing. Either add per-portal preview art or remove the image dependency. |

## Data Cleanup Still Open

- **Item IDs:** `acorn`/`turnip`/`apple`/`cherries` are canonical in `items.json` (aliases exist). Crop items `tomato`, `carrot`, `wheat`, `berry` are still missing item sheet entries and CSS classes entirely.
- **FOOD map objects:** If `FOOD` should appear on the map, point it at `items.png`; otherwise route all food drops through `DroppedMapItem` instead of spawning a blank `MapObject`.
- **Bed files:** Config expects `bed_default.png` / `bunk_bed.png` but repo has legacy `bed.gif` / `bed_big.png`. Pick canonical file names and rename or remap.
- **Missing spritesheet URLs:** `LANTERN`, `FOUNTAIN`, `BREEDING_FLOWER`, `NIGHT_BLOOM`, and `PATROL_GUARD` have no `spriteSheet.url` in `data/map-objects/types.json`. Add URLs once art exists.

## Suggested Production Order

1. Flowers, doors, beds, portals, fences, gates
2. Lanterns, fountains, crops, breeding flowers, night blooms
3. NPC trio, patrol guard, butterfly color variants, blue ball
4. Inventory expansion: crop icons, coin/health/equipment pickups


