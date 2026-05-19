# Needed Animations

Animations referenced in the action system that need sprites/frames created.

## Myte Animations

| Animation ID | Used By | Description |
|---|---|---|
| `sleep` | `SleepAction`, `SimpleSleepAction` | Eyes closed, gentle bob |
| `excited` | `PlayFetchAction` | Bouncy, tail-wagging excited pose |
| `wave` | `GreetAction`, `GreetReceiveAction` | Raised hand/paw wave toward another Myte |
| `eat` | `EatElementAction` | Nom animation |
| `smell` | `SmellFlowerAction` | Lean forward, sniff |
| `drink` | `DrinkFromFountainAction` | Lean in to water, lap/sip |
| `water_plant` | `WaterPlantAction` | Tilting a watering can / pouring gesture |
| `harvest` | `HarvestAction` | Reach forward, pick from plant |
| `open_chest` | `OpenChestAction` | Crouch + reach, lifting a lid |
| `carry_hold` | `CarryAction`, `HoldBallAction` | Arms-raised overhead carrying pose |
| `carry_walk` | `CarryAction` while moving | Same as carry_hold but with walk cycle |
| `peek` | `HideAction` | Head tilted sideways, one eye visible |
| `celebrate` | Post-action reward moment | Jump + fist pump |
| `startled` | startle reactive (future) | Jump back, eyes wide |

## Expression Overlays (UI layer, not sprites)

These are emote bubbles rendered over the Myte — easier to implement now.

| Expression ID | Used By | Notes |
|---|---|---|
| `heart` | `ShowAffectionAction` | Heart bubble |
| `sleep` (Z's) | `SleepAction`, `SimpleSleepAction` | Floating Z bubble |
| `curious` | `InspectAction` (commented out) | `?` bubble |
| `panic` | `RunAwayAction` | `!!` or exclamation bubble |
| `excited` | Various | Stars / sparkles bubble |
| `wave` | `GreetAction` | Small wave hand bubble |
| `peek` | `HideAction` | Small side-eye icon |

## Notes

- `carry_hold` and `carry_walk` should be directional (4-dir) like the normal walk cycle
- `smell`, `drink`, `water_plant`, `harvest`, `open_chest` all need a facing-direction version since the Myte approaches from a specific side
- Wave should be mirrored (facing left vs right) — if the sprite system supports flipping, one set of frames suffices
- Celebrate could share frames with the existing dance if needed temporarily
