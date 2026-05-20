# Portal Transitions

## Goals

- Enter portals by aligning the exact center of the myte sprite to the exact center of the portal.
- Arrive on the destination map with the exact center of the myte sprite at the exact center of the destination portal.
- Support multiple portals between the same two maps without guessing.
- Support same-map teleports without reloading the map.

## Current Rules

- Portals now approach with `go_to_object` using `center` alignment.
- Portal arrival prefers the portal sprite center, not the collider edge.
- `targetPortalId` is the preferred way to choose a destination.
- If no explicit destination portal is provided, the transition manager falls back to:
  1. explicit `targetSpawnPoint`
  2. a uniquely linked return portal
  3. map spawn `myte`
  4. map spawn `default`

## Portal Properties

Use these TMX object properties on `Portal` objects:

- `portalId`
  - Stable identifier for this portal on its own map.
  - Recommended for every portal.

- `targetMap`
  - Destination map id.
  - Optional for same-map teleports. If omitted, the current map is used.

- `targetPortalId`
  - Exact destination portal id on the target map.
  - Preferred for all important links.

- `targetSpawnPoint`
  - Named spawn point fallback on the target map.
  - Useful when arrival should not be tied to a destination portal.

- `variant`
  - Visual portal type such as `red_portal`.

## Recommended Patterns

### Two-way portal pair across maps

Map A portal:

- `portalId = a_to_b`
- `targetMap = MapB`
- `targetPortalId = b_to_a`

Map B portal:

- `portalId = b_to_a`
- `targetMap = MapA`
- `targetPortalId = a_to_b`

### Multiple portals to the same map

Always set both `portalId` and `targetPortalId`.

This avoids "first matching portal wins" behavior.

### Same-map teleport

Source portal:

- `portalId = cave_entry`
- `targetPortalId = cave_exit`

Destination portal:

- `portalId = cave_exit`

`targetMap` can be omitted if the teleport stays on the same map.

## Sound Suggestions

Portals now support these default sound hooks:

- `soundEffects.depart`
- `soundEffects.arrive`

Recommended feel:

- `depart`: short magical swell or pulse
- `arrive`: lighter bloom or resolve

## Nice Future Upgrades

- Add portal-specific fade color or message overrides.
- Add optional arrival offset or facing for special portals.
- Add portal debug UI showing `portalId` and `targetPortalId`.
