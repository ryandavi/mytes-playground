# Map Environment Visual Plan

**Date:** 2026-05-30  
**Status:** Planning  
**Scope:** Day/night tinting, sunset gradients, future weather visuals, map-aware overlay sizing, config-driven tuning

## Goal

Introduce a visual environment system for maps that can handle:

- day/night lighting
- sunset and dawn gradients
- future weather visuals
- per-map tuning
- easy authoring of colors, timing, opacity, blend style, and transitions

This should feel like part of the map renderer, not like a random full-screen UI effect bolted on later.

## Short Answer

Yes, this should be a map overlay layer, but not just a single generic `div` slapped on top of the viewport.

Recommended approach:

- add a dedicated **environment layer system** inside `.canvas`
- size it to the **map dimensions**, not the browser viewport
- let it move and zoom with the map through the existing camera transform
- drive it from `GameTime.getTimeData()`
- configure it through data instead of hardcoded values

For the sunset effect, use a **configurable gradient overlay rendered in world space** so it feels consistent across different map sizes and camera states.

## Why A Map Layer Is Better Than A Screen Overlay

A pure screen overlay would be easy, but it has a few problems:

- it ignores map scale and composition
- it can feel detached from the world when panning or zooming
- gradients can feel arbitrary on large maps and cramped on small maps
- future weather effects become harder to stage cleanly

A map-owned environment layer avoids that because:

- it shares the map's width and height
- it lives inside `.canvas`, which already receives camera transform
- it naturally stays aligned with map content during zoom and pan
- it gives us one place for time-of-day and weather visuals

## Existing Architecture This Fits

The current renderer already gives us the right foundation:

- map DOM is a stack of `.layer` elements inside `.canvas`
- `.canvas` is resized to the loaded map dimensions in `GameMap.applyToGameMap()`
- camera pan/zoom is applied by transforming `.canvas` in `Camera.updateTransform()`
- time state already exists in `GameTime`
- `GameTime.getTimeData()` already exposes:
  - `timeOfDay`
  - `lightLevel`
  - `dayProgress`
  - `season`
  - `moonPhase`

That means we do **not** need a separate rendering model for this.

## Recommended Visual Model

Treat this as one **environment system** with a few visual channels.

Recommended channels:

1. `globalTint`
   A full-map tint used for daylight, dusk, night, moonlight, indoor dimming, etc.

2. `horizonGradient`
   A directional gradient for sunrise/sunset bands crossing the map.

3. `vignette`
   Optional edge darkening or soft focus for late evening/night.

4. `weatherOverlay`
   Fog wash, cloud shadow pass, rain haze, snow glow, etc.

5. `weatherParticles`
   Rain, snow, pollen, ash, drifting dust. This can reuse or cooperate with the existing particle/effects path later.

The important part is that these are all authored as parts of one environment config, even if implementation rolls out in phases.

Important architectural distinction:

- **broad atmosphere** should be map-owned and map-sized
- **dynamic local lighting** should be treated as a separate lighting pass

These belong to the same environment system, but they should not necessarily use the same rendering surface.

## Recommendation On DOM Structure

Keep the concept as one system, but allow multiple DOM children inside it.

Recommended addition to the map layer stack:

```html
<div class="layer background"></div>
<div class="layer ground-decor"></div>
<div class="layer environment-back"></div>
<div class="layer particles"></div>
<div class="layer foreground"></div>
<div class="layer environment-front"></div>
<div class="layer effects"></div>
```

Why two environment layers:

- `environment-back` is useful for atmosphere that should sit behind characters and props
- `environment-front` is useful for tinting the whole world, sunset passes, fog wash, moon wash, etc.

If we want the smallest first step, we can start with just:

- `.layer.environment-front`

and keep the config structured so `environment-back` can be added later without redesigning the data.

## Blend Mode Recommendation

Use blending as an option, not the only mechanism.

Recommended defaults:

- `globalTint`: normal alpha background or `multiply`
- `horizonGradient`: `soft-light`, `screen`, or `normal` depending on art
- `vignette`: normal alpha
- `weatherOverlay`: `screen`, `multiply`, or `overlay` depending on effect

Why not rely on blend mode alone:

- blend modes can behave unpredictably across art styles
- some gradients look better as simple alpha washes
- configurability matters more than one "smart" rule

So each visual channel should support:

- `enabled`
- `opacity`
- `blendMode`
- `colors`
- `transitionMs`

## Local Lights And Masking

When we add actual lights, the right mental model is:

- the world has an **ambient darkness/light level**
- local light sources **carve back into that darkness**
- occluders can **block or shape** that carve-out

That means we should not think of lights as "bright sprites on top."

We should think of them as:

1. a darkened lighting layer
2. masked or subtracted by local light shapes
3. optionally shadowed by blockers

## Recommended Lighting Architecture

Use two related but different paths:

### 1. Atmosphere pass

For:

- day/night tint
- sunset gradients
- moon wash
- fog color
- weather mood

Recommended surface:

- DOM/CSS layer inside `.canvas`
- map-sized
- world-space

### 2. Local lighting pass

For:

- lantern pools
- window glow
- portal light
- night-bloom glow influence
- future shadow casting

Recommended surface:

- dedicated **lighting canvas**
- viewport-sized, not full-map-sized
- samples world positions using camera state

Why split it this way:

- atmosphere changes slowly and benefits from map-wide continuity
- local lights are dynamic and should be cheaper to redraw
- a full-map dynamic light texture would waste memory on large maps

## Why A Viewport Lighting Canvas Is Better

A full-map light mask becomes expensive quickly on big maps.

Example problem:

- a large map-sized offscreen light texture costs memory even when only a small camera region is visible
- redrawing the whole texture every frame is unnecessary

A viewport-sized light canvas is better because:

- it only renders what the player can currently see
- it scales with screen size, not total map size
- it still feels world-aware because light positions are computed from world coordinates and camera transform

So the forward-looking design is:

- keep sunset and atmosphere map-sized
- keep dynamic local lights viewport-sized

## How Light Masking Should Work

Recommended compositing model:

1. start with ambient darkness based on `GameTime.lightLevel`
2. draw soft radial or shaped light masks for active light sources
3. subtract or reduce darkness where those masks land
4. optionally add occlusion shadow wedges from blockers
5. composite the result over the world

For implementation, this is easiest on canvas:

- fill lighting canvas with ambient shadow color
- set compositing so lights erase or reduce darkness
- draw gradients for lights
- then draw optional shadow polygons

This gives us:

- soft lantern pools
- readable night scenes
- proper "light in darkness" feeling

## Reuse Existing Data For Lights

We already have strong hooks to build on:

- `lightEmission` in map object config
- `aura.radius` on light-like objects
- `interaction.type = "light"`
- `physics.blocksLineOfSight = true` on blockers like fences/gates and future walls/props
- `GameTime.lightLevel` for ambient light
- grid/culling systems to limit work to active visible content

Recommended new normalized concept:

```json
{
  "lighting": {
    "emitsLight": true,
    "radius": 180,
    "intensity": 0.85,
    "color": "rgba(255, 210, 130, 1)",
    "falloff": "smooth",
    "castsShadows": true
  }
}
```

That could be resolved from existing fields during migration so we reuse current content instead of rewriting everything immediately.

## Occlusion / Shadow Masking

For forward-thinking shadow behavior, use blocker geometry already implied by the game.

Recommended occluder inputs:

- object collider regions
- object `blocksLineOfSight`
- future wall/roof metadata from maps

Recommended approach:

- only shadow-cast from visible or nearby blockers
- convert blocker bounds into simple line segments
- for each important light, project shadow polygons away from those segments

This does **not** need to be physically perfect.

The goal is:

- readable pools of safety
- believable darkness behind obstacles
- stronger mood at night

## Light Quality Tiers

Not every light should cost the same.

Recommended tiers:

1. `hero`
   Full local light + shadow masking. Use for lanterns near player, portals, dramatic focal lights.

2. `local`
   Soft radial light, no occlusion. Use for common lamps and glowing flowers.

3. `decorative`
   Sprite glow only. No lighting mask contribution.

This lets us spend CPU/GPU budget where it actually matters.

## Sunset And Awe

If we want sunset to feel beautiful, the answer is not "more orange."

The feeling of awe usually comes from:

- strong color contrast
- clear directionality
- restraint
- a sense that the world is changing, not just tinted

Recommended sunset ingredients:

1. **Warm light band + cool shadow world**
   Let the sunset band be gold/coral, but let the rest of the scene drift cooler: blue-violet, dusty plum, deep teal.

2. **A narrower, brighter moment**
   The most magical part of sunset should be a more focused band, not a full-screen wash. Awe comes from contrast and shape.

3. **Slow choreography across periods**
   `magic_hour` should feel different from `sunset`, which should feel different from `dusk`, which should feel different from `gloaming`.

4. **Depth separation**
   Background atmosphere, warm horizon pass, and a softer front tint should not all be the same color.

5. **Reactive world details**
   Lights begin to matter more.
   Night blooms open.
   Water or bright props catch a little warmth.
   The world acknowledges the hour.

6. **Silence and restraint**
   Avoid too many noisy overlays or fast-moving particles. Awe usually needs space.

## Sunset Art Direction Recommendations

Recommended progression:

- `evening`
  Slight warmth, barely noticeable

- `magic_hour`
  Golden directional pass, lifted highlights, calmer shadows

- `sunset`
  Stronger coral band, cooler world outside the band, brief peak beauty

- `dusk`
  Warmth fades, blue-purple settles in, lights start to feel meaningful

- `gloaming`
  Mostly cool world, tiny remnants of warmth, stronger contrast against emissive objects

The emotional trick is:

- the peak warm beauty should be brief enough to feel precious
- the transition into cool night should feel earned, not abrupt

## Make Awe Systemic, Not Just Decorative

The best version is when sunset improves multiple layers at once:

- visuals shift
- ambient audio shifts
- lights feel newly important
- night flora or creatures begin responding
- the player feels a world rhythm, not a filter

That is where "great" comes from.

## Performance And Memory Strategy

This needs to be planned from the start.

Recommended rules:

1. Do not render a full-map dynamic light texture.

2. Use one viewport-sized lighting canvas with overscan margin.

3. Render the lighting canvas at reduced internal resolution:
   - start with `0.5x`
   - optionally drop to `0.33x` for heavier scenes

4. Only rebuild lighting when needed:
   - camera moved enough
   - active light state changed
   - visible blocker set changed
   - ambient light changed materially

5. Interpolate atmosphere cheaply every frame only during transitions.
   Otherwise keep it event-driven from time notifications.

6. Cache static blocker geometry per map.

7. Use active/visible object sets from the existing grid/culling system to gather nearby lights and blockers.

8. Cap hero shadow-casting lights per frame.

## Update Rates

Recommended cadence:

- atmosphere preset resolution:
  - on `GameTime` events
  - per-frame lerp only while transitioning

- local light gathering:
  - every frame only if camera/light movement requires it
  - otherwise reuse previous frame

- occluder rebuild:
  - on map load
  - on relevant object add/remove/move state changes

- expensive shadow projection:
  - only for visible `hero` lights

## Reuse And Shared Ownership

To stay efficient and maintainable:

- `MapEnvironmentManager` should own resolved ambient state
- a future `MapLightingManager` should own local light sources and blockers
- both should read the same time data and map/object config
- light-emitting objects should expose normalized lighting info through methods, not ad hoc DOM checks

Recommended methods:

- `object.isLightSource()`
- `object.getLightSourceConfig()`
- `object.isLightBlocking()`
- `object.getLightBlockerGeometry()`

That way portals, lanterns, glowing flowers, and future windows can all participate without custom branches scattered everywhere.

## How To Make Sunset Gradients Feel Right On Different Map Sizes

This is the key design point.

Do **not** size the sunset gradient against the viewport.

Instead:

- render it inside a map-sized layer
- define its geometry in **normalized map-space**
- convert those normalized values into CSS based on current map width/height

Example:

- `startX: 0.12`
- `endX: 0.88`
- `bandHeight: 0.42`
- `anchorY: 0.28`
- `angle: 12`

Those values mean:

- the gradient spans a percentage of the map
- it reads consistently whether the map is 960px wide or 4000px wide
- the band does not feel stretched just because the map is larger

This should be computed by JS and written as CSS custom properties on the environment element.

## Sunset Direction

Make gradient direction configurable per map or biome.

Examples:

- west-to-east warm band
- diagonal golden band
- low horizon pink-orange wash
- vertical dusk fade for forest maps

Recommended config fields:

- `angle`
- `originX`
- `originY`
- `span`
- `stops`

That gives enough control without needing custom shader logic.

## Data Strategy

Recommended source of truth:

- map-level environment config in authored data

Good first options:

1. TMX map properties
2. a sidecar JSON per map
3. a shared preset registry plus per-map overrides

Best long-term shape:

- shared presets in JSON
- map references preset id
- map can override only what it needs

Recommended files:

- `data/metadata/environment-presets.json`
- optional per-map overrides in TMX properties or `data/maps/<MapId>.environment.json`

## Recommended Config Shape

```json
{
  "schemaVersion": 1,
  "presets": {
    "outside-default": {
      "dayNight": {
        "enabled": true,
        "transitionMs": 1800,
        "lightCurve": {
          "dayMinOpacity": 0,
          "nightMaxOpacity": 0.48,
          "moonlightFloor": 0.12
        },
        "periods": {
          "dawn": {
            "globalTint": {
              "color": "rgba(255, 210, 170, 0.08)",
              "blendMode": "screen"
            }
          },
          "magic_hour": {
            "globalTint": {
              "color": "rgba(255, 196, 120, 0.12)",
              "blendMode": "soft-light"
            },
            "horizonGradient": {
              "enabled": true,
              "angle": 10,
              "originX": 0.1,
              "originY": 0.25,
              "span": 0.8,
              "opacity": 0.65,
              "blendMode": "screen",
              "stops": [
                { "position": 0.0, "color": "rgba(255, 170, 90, 0.00)" },
                { "position": 0.25, "color": "rgba(255, 170, 90, 0.35)" },
                { "position": 0.5, "color": "rgba(255, 120, 110, 0.50)" },
                { "position": 0.8, "color": "rgba(120, 70, 160, 0.18)" },
                { "position": 1.0, "color": "rgba(20, 25, 60, 0.00)" }
              ]
            }
          },
          "sunset": {
            "globalTint": {
              "color": "rgba(160, 95, 130, 0.18)",
              "blendMode": "multiply"
            },
            "horizonGradient": {
              "enabled": true,
              "angle": 14,
              "originX": 0.08,
              "originY": 0.3,
              "span": 0.84,
              "opacity": 0.78,
              "blendMode": "screen"
            }
          },
          "nightfall": {
            "globalTint": {
              "color": "rgba(24, 38, 78, 0.34)",
              "blendMode": "multiply"
            },
            "vignette": {
              "enabled": true,
              "opacity": 0.22,
              "color": "rgba(8, 12, 28, 0.75)"
            }
          }
        }
      },
      "weather": {
        "enabled": true
      }
    }
  }
}
```

## Runtime Ownership

Recommended new runtime pieces:

- `js/Map/MapEnvironmentRenderer.js`
- `js/Map/MapEnvironmentManager.js`

Responsibilities:

`MapEnvironmentManager`

- own resolved environment config for the active map
- subscribe to `GameTime`
- compute current visual state from time period, light level, moonlight, and future weather
- interpolate transitions
- expose one clean render state

`MapEnvironmentRenderer`

- create/update environment DOM nodes
- apply CSS variables and classes
- keep layout sized to current map dimensions
- avoid unnecessary DOM writes

This mirrors the existing `GameMap` + `MapRenderer` split cleanly.

## How It Should Hook Into Time

Use the existing time system instead of polling manually.

Recommended subscriptions:

- `dayNight`
- `light`
- `moonPhase`
- `season`

Why:

- `dayNight` lets us switch named presets like `magic_hour` and `sunset`
- `light` lets us smooth opacity between major phases
- `moonPhase` lets nights feel slightly different
- `season` can later shift palette warmth and fog density

## Smoothing Strategy

Avoid visual snapping when periods change.

Recommended behavior:

- each channel has a `transitionMs`
- manager lerps from previous state to next state
- day/night tint intensity also uses `lightLevel` as a continuous driver

That gives:

- soft sunrise
- readable sunset band
- gradual darkening into night

## Per-Map Tuning

Some maps should not share the same atmosphere.

Examples:

- `House` should probably have much weaker night tint
- `Forest` may want heavier dusk fog and greener shadow color
- future cave/interior maps may ignore horizon gradients entirely

Recommended config structure:

- base preset by environment type
- per-map override

Example:

- `outside-default`
- `forest-clearing`
- `indoors-soft`

## Interiors And Room Fill Lighting

Interiors should not rely only on radial point lights.

If we want light to "fill rooms," the right model is:

- each interior room has an authored **light volume**
- the room has a base ambient level
- active lights can raise the room's ambient fill
- some lights also add local hotspots on top

So for interiors, think in layers:

1. room ambient
2. room fill from active fixtures
3. local accent lights
4. doorway spill between connected rooms

## Do Not Infer Rooms Every Frame

Do not try to discover enclosed rooms from tiles during gameplay.

That would be:

- fragile
- harder to tune
- harder to debug
- more expensive than needed

Instead, rooms should be authored in Tiled as explicit regions.

Good news:

- `House.tmx` already has large interior rectangles in the `Zones` object group
- those can be reused as a temporary first source of room bounds

Long-term, I would prefer a dedicated object group such as:

- `LightVolumes`
- or `Rooms`

so gameplay zones and lighting zones can diverge when needed.

## Recommended Room Data Model

Recommended authored room entry:

```json
{
  "id": "bedroom",
  "type": "room",
  "bounds": { "x": 608, "y": 480, "width": 320, "height": 448 },
  "lighting": {
    "ambientFloor": 0.18,
    "ambientCeiling": 0.7,
    "fillColor": "rgba(255, 218, 170, 1)",
    "shadowColor": "rgba(18, 18, 28, 0.82)",
    "feather": 24,
    "mode": "filled"
  }
}
```

Optional future fields:

- `polygon` instead of rectangle
- `ceilingHeight`
- `windowEdges`
- `doorways`
- `connectedRooms`

## Recommended Interior Lighting Modes

Each room should choose one of three modes:

1. `filled`
   Whole room lifts when lights are on. Best default for bedrooms, kitchens, playrooms.

2. `local`
   Mostly dark room with only local pools. Best for caves, storage rooms, spooky spaces.

3. `mixed`
   Room gets a soft ambient lift, plus brighter pools near fixtures. Best for cozy interiors.

For this game, I think most house rooms should use `mixed`.

That gives:

- readable interiors
- cozy room glow
- still enough shadow contrast for atmosphere

## How Room Fill Should Work

When a room light is active:

- raise the room's ambient floor
- tint the room with the light color
- keep a slightly brighter hotspot near the source

So one lantern in a bedroom does not just create a circle on the floor.
It changes the whole emotional temperature of the room.

Recommended behavior:

- room fill is soft and broad
- local fixture glow is brighter and more focused
- corners stay slightly darker so the room keeps depth

## Doorways And Spill

Rooms should not feel like sealed boxes unless we want them to.

Recommended rule:

- light fill belongs to a room volume
- a small amount of light can spill through open doorways or wide openings

Implementation approach:

- represent doorway/opening regions explicitly
- build a simple room adjacency graph
- allow a percentage of fill contribution into adjacent rooms

Example:

- Bedroom lamp on
- Bedroom gets full fill
- Hall/chatroom gets 15% warm spill through doorway

This will make interiors feel much more believable.

## How To Reuse Existing Map Data

Best path:

### Phase 1

Reuse current `Zones` rectangles in interior maps as provisional room volumes where they match real rooms.

### Phase 2

Add dedicated lighting volumes in Tiled:

- `objectgroup name="Lighting"`
- each object has:
  - `roomId`
  - `lightingMode`
  - `ambientFloor`
  - `fillColor`
  - `feather`

### Phase 3

Add doorway/opening objects:

- `objectgroup name="LightOpenings"`
- each object links room A and room B

This keeps authoring explicit and efficient.

## Relationship Between Room Fill And Local Lights

A room light should be able to contribute in two ways:

1. **room contribution**
   Raises the room fill level

2. **local contribution**
   Adds a nearby hotspot and optional shadowing

Recommended light config additions:

```json
{
  "lighting": {
    "emitsLight": true,
    "radius": 160,
    "intensity": 0.85,
    "color": "rgba(255, 214, 150, 1)",
    "roomFill": 0.42,
    "roomId": "bedroom",
    "castsShadows": true
  }
}
```

That means a bedside lantern can:

- warm the bedroom generally
- still feel brightest near the lantern itself

## Performance Strategy For Interiors

Room fill is much cheaper than many shadow-casting point lights.

That is good for us.

Recommended strategy:

- resolve room fill state from authored room volumes
- only recompute when:
  - light state changes
  - room membership changes
  - relevant doorway/opening state changes
- render room fills as cached masks/regions
- keep local shadowed lights limited to important fixtures

This gives interiors a rich look without needing lots of expensive per-pixel lighting.

## Emotional Recommendation For Interiors

Interiors should feel different from outdoors in a structural way.

Outdoors:

- sky-driven
- broad gradients
- horizon emotion
- shifting atmospheric color

Indoors:

- room-shaped light
- warmth trapped by walls
- cozy falloff
- contrast between rooms

That contrast will make both spaces feel better.

If sunsets are awe, interiors should often be intimacy.

The player should feel:

- awe outside
- safety and warmth inside

## Best Recommendation

For interiors, use **authored room light volumes** with:

- soft room-wide fill
- local fixture hotspots
- optional doorway spill
- optional shadow masking for important lights

That is the most forward-thinking version because it:

- reuses existing zone-like map authoring
- avoids expensive runtime room detection
- scales well
- gives us much better emotional control over indoor spaces

## Weather Compatibility

This system should become the home for weather visuals even if weather logic ships later.

Recommended design rule:

- time of day and weather are separate inputs
- renderer composes them into the same visual stack

Example:

- sunset gradient from time-of-day
- light haze from rain
- darker global tint from storm

That avoids a future rewrite when weather arrives.

## First Implementation Slice

Keep version one small and useful.

### Phase 1

- add `.layer.environment-front`
- add `MapEnvironmentManager`
- add `MapEnvironmentRenderer`
- support:
  - `globalTint`
  - `horizonGradient`
  - `transitionMs`
- drive from `GameTime`
- hardcode one temporary default preset during implementation

### Phase 2

- move preset data into `data/metadata/environment-presets.json`
- support per-map preset selection
- support map overrides
- expose debug controls for testing time periods quickly

### Phase 3

- add `vignette`
- add `environment-back`
- add weather overlay support
- add viewport-sized local lighting canvas
- support soft local light masks without shadows first

### Phase 4

- add blocker-based shadow masking for hero lights
- integrate with future editor tooling so timing, colors, stops, and blend modes are easy to tune

## Recommended CSS Strategy

Use CSS variables on the environment elements instead of rebuilding complex inline style strings every frame.

Examples:

- `--env-global-color`
- `--env-global-opacity`
- `--env-gradient-angle`
- `--env-gradient-origin-x`
- `--env-gradient-origin-y`
- `--env-gradient-stop-1`

Then the renderer only updates variables when the resolved state changes.

## Debug / Authoring Support

This will be much easier to tune if we expose a few controls in the debug UI:

- set time to dawn / noon / magic hour / sunset / night
- toggle environment layer visibility
- show current preset id
- show current resolved period
- show current light level

That will make color tuning dramatically faster.

## Risks To Avoid

1. Full-screen fixed overlay outside `.canvas`
   This will feel detached from the world and will age badly once weather arrives.

2. Hardcoded sunset values in CSS only
   It will be annoying to tune and impossible to vary properly per map.

3. One giant monolithic overlay string
   It will become fragile once we add multiple channels.

4. Snapping between time periods
   Sunset and dusk will feel abrupt instead of alive.

5. Tying gradient dimensions to viewport size
   Large and small maps will read inconsistently.

6. Using the same rendering path for atmosphere and local lights
   That will either waste memory or make lighting too rigid.

7. Letting every emissive object cast full shadows
   Performance will collapse before the scene even looks better.

## Recommended Decisions To Lock In

1. The environment effect lives inside the map canvas, not as a UI overlay.
2. The system is map-sized and therefore camera-aware automatically.
3. Time-of-day and weather share one environment system.
4. Sunset gradients are authored in normalized map space.
5. Blend mode is configurable per channel, not globally forced.
6. Named time periods from `GameTime` are the main preset switch.
7. `lightLevel` is used for smooth interpolation, not just binary day/night.
8. Per-map overrides should exist from the start, even if only lightly used at first.
9. Broad atmosphere and local lights are separate render passes in one shared system.
10. Occlusion should reuse blocker geometry and visible-object culling instead of bespoke scans.
11. Local lighting quality should use tiers so only important lights cast shadows.

## Bottom Line

The best implementation is:

- a dedicated environment layer inside the map
- driven by `GameTime`
- sized to the map
- configurable through data
- built to support both day/night and future weather

So yes, the instinct to add a map layer for weather and time-of-day is the right one.  
I would avoid a plain screen overlay and instead build a small environment rendering system that treats sunset gradients, tint, and future weather as first-class map visuals.
