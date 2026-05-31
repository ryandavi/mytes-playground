# Environment Lighting Handoff For Claude

## Context

This project has an in-progress map environment / time-of-day system with:

- a map-sized atmosphere layer inside the map canvas
- a `lighting-overlay` that is clipped to the visible map canvas
- local light masking for night / interiors
- sunrise / sunset work that is currently not behaving correctly

The user is unhappy with the current sunrise/sunset result and wants the system repaired, not incrementally hand-waved.

## User Intent

The desired visual model is simple:

- daytime: no darkness overlay
- sunset: a wide atmospheric band moves across the map and brings darkness with it
- night: blue-tinged darkness fills the map
- sunrise: the same idea in reverse, where the map stays dark first, then the sunrise band moves across and brings daylight back

The user also wants this direction to eventually be configurable.

## Current Broken Behavior

Latest reported issues:

- sunset now looks like a sunrise
- around `9:00 PM` the map is still very bright
- around `9:30 PM` it snaps to dark
- sunrise previously snapped brighter before the orange band arrived
- the moving band has also had issues with banding / striping / looking too narrow or harsh

## Key Files

- [js/Map/MapEnvironmentManager.js](/c:/xampp/htdocs/genes/chat/neko/js/Map/MapEnvironmentManager.js)
- [data/metadata/environment-presets.json](/c:/xampp/htdocs/genes/chat/neko/data/metadata/environment-presets.json)
- [css/features/_map.scss](/c:/xampp/htdocs/genes/chat/neko/css/features/_map.scss)

## Current Architecture

### 1. Overlay placement

`lighting-overlay` is currently appended to the container root, but its bounds are clipped to the visible canvas intersection.

Important methods:

- `ensureLightingOverlay()`
- `getViewportBounds()`
- `syncLightingOverlayBounds()`

This part is in a better place now than earlier. The user specifically confirmed:

- overlay is now only on the canvas

### 2. Time driving

The environment manager now derives sun-cycle behavior from clock minutes rather than relying on `GameTime.timeOfDay` strings.

Important methods:

- `resolveSunCycleState()`
- `resolveLightingPeriodState()`
- `getMinutesFromTimeData()`

`getMinutesFromTimeData()` was changed to use fractional game time via `totalElapsedSeconds`, so movement should not be limited to whole-minute stepping.

### 3. Render split

There are two main render paths:

- atmosphere DOM layers in the map canvas
- lighting canvases in `lighting-overlay`

Important render methods:

- `renderAtmosphere()`
- `renderLighting()`
- `drawAmbientDarkness()`
- `drawSunCycleColorBand()`
- `getSunBandMetrics()`

### 4. Current blend setup

In `_map.scss`, `lighting-overlay__color` is currently:

```scss
mix-blend-mode: normal;
```

This was changed from `screen` because `screen` was making the sweep look streaky / blown out and was fighting the light-mask look.

## Likely Root Problem

The current sunrise/sunset implementation has become too tangled because it is combining:

- a moving color band
- a moving darkness edge
- special sunrise vs sunset branch behavior
- offscreen travel values
- independent atmosphere tint logic

The end result is that the "day side" and "night side" of the sweep are getting inverted or decoupled in some cases.

The latest symptom strongly suggests the sunset darkness edge is currently reversed or delayed too aggressively:

- bright too long
- then abrupt transition near the end of the sunset window

## Strong Recommendation

Do not keep layering more special-case fixes onto the current branch behavior.

Instead, simplify sunrise/sunset into one directional sweep model:

### Single Sweep Model

For both sunrise and sunset:

1. Define a travel direction vector.
2. Define which side of the band is the "day side".
3. Define one wide band with color stops.
4. Derive darkness from the same band progression, not a separate late fade.

That means the visible effect should always be:

- `sunset`: day -> warm band -> cool dusk -> night
- `sunrise`: night -> cool dawn -> warm band -> day

The crucial part is that daylight and darkness should be attached to the same moving sweep, not run as two loosely coordinated systems.

## Suggested Repair Plan

### Option A: Repair Current Code

If continuing from current code, the likely safest fix path is:

1. Keep overlay sizing as-is.
2. Keep local lights and room lighting as-is.
3. Rebuild only the sunrise/sunset sweep logic.
4. Remove special-case sunrise/sunset darkness gradient branches that are fighting each other.
5. Make `drawAmbientDarkness()` use a single generic directional ramp controlled by:
   - normalized direction vector
   - progress
   - sweep width
   - daylight side
6. Make `drawSunCycleColorBand()` use the same geometry and same progression.
7. Make atmosphere DOM tint minimal during sunrise/sunset, or disable it entirely during those windows so the canvas sweep remains the dominant effect.

### Option B: Replace The Sunrise/Sunset Layer Entirely

If repair work keeps fighting the current structure, replace the sun-cycle pass with:

- one dedicated "sun sweep" canvas pass
- one dedicated darkness mask pass

Both should share the exact same band geometry.

That is probably the cleanest long-term model.

## Recommended Config Shape

Do not keep this limited to `startX` / `endX` forever.

Recommended future config:

```json
{
  "sunset": {
    "direction": { "x": 1, "y": 0 },
    "daySide": "behind",
    "span": 1.8,
    "start": "18:00",
    "end": "21:30",
    "stops": []
  },
  "sunrise": {
    "direction": { "x": -1, "y": 0 },
    "daySide": "behind",
    "span": 1.8,
    "start": "04:30",
    "end": "07:30",
    "stops": []
  }
}
```

This would make these experiments easy:

- left -> right
- right -> left
- north -> south
- south -> north

For now, horizontal is probably the right default for this game.

## Current Preset Notes

Current presets live in:

- [data/metadata/environment-presets.json](/c:/xampp/htdocs/genes/chat/neko/data/metadata/environment-presets.json)

Notable current values:

- outdoor `sunrise.startX = 2.15`, `endX = -1.15`
- outdoor `sunset.startX = -1.15`, `endX = 2.15`
- `lighting.colorResolutionScale = 1` was added so the color sweep can render at higher fidelity than the darkness mask

These values may be fine once the sweep logic is correct, but right now they are not trustworthy indicators of good behavior because the core sweep logic is still wrong.

## What Seems Stable

These pieces are probably worth preserving:

- `lighting-overlay` clipped to the canvas
- local light masks revealing the real world instead of adding a white wash
- room-shaped interior fill approach
- `environment-presets.json` as the single source of truth instead of giant embedded defaults

## What Should Probably Be Revisited

- `drawAmbientDarkness()` special-case sunrise/sunset logic
- how much atmosphere DOM tint is still active during sun transitions
- whether the sun-color sweep and the darkness sweep should be drawn on separate canvases or just share one well-defined geometry model

## Acceptance Criteria

The user will likely consider this fixed if:

1. At the start of sunrise, the map is still dark.
2. The sunrise band itself brings the transition to daylight.
3. At the start of sunset, the map is still fully daylit.
4. The sunset band itself brings the transition to darkness.
5. There is no abrupt snap near the end of either window.
6. The band feels wide and atmospheric, not narrow or stripy.
7. The effect works on different map sizes without feeling stretched.

## Validation Cases

Test these by forcing time if possible:

- `04:30`
- `05:30`
- `06:00`
- `07:00`
- `18:00`
- `19:00`
- `20:00`
- `21:00`
- `21:30`

Specifically confirm:

- sunrise starts dark
- sunset starts bright
- no late hard snap to dark
- no early snap to light

## Quick Summary For Claude

The environment system mostly works except for the sunrise/sunset sweep logic. Overlay sizing is okay now. Local light masking is in a better state. The broken area is that sunrise/sunset darkness and color are not being driven as one coherent moving front. The next successful implementation should unify color band + darkness edge under one directional sweep model and stop relying on separate special-case branching that can invert the day/night side.
