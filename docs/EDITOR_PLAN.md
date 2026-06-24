# Content Editor Plan

**Date:** 2026-06-19 (originally 2026-05-24)
**Status:** In Progress — Phases 0–4 complete. All eight domains are writable (Mytes, Map Objects, Items, Actions, Buffs, Zones, Environment Presets). Phase 5 (geometry completion + slot editing) is next.
**Scope:** Mytes, map objects, items, actions, buffs, zones, environment presets, map-object slot geometry, geometry, animation/state preview, future "edit everything" foundation

## Goal

Build a separate in-repo editor app that:

- lives in its own folder and UI flow
- reuses as much existing runtime code, styling, and rendering as possible
- makes data editing feel fast, visual, and low-friction
- supports previewing states, animations, geometry, and behavior before saving
- grows into a general-purpose editor for game definitions instead of a one-off tool

This should feel like part of the same product, not an admin afterthought.

## Short Answer

Yes, we should make a separate folder for editing data.

Recommended shape:

- `editor/` for the editor app
- shared runtime logic stays under existing `js/`, `css/`, `data/`
- optional PHP save endpoints under `editor/api/`

We should reuse:

- current design tokens and window styles from `css/core/_tokens.scss` and `css/components/_window-ui.scss`
- current map/object rendering code
- `ItemRegistry`
- `MyteDefinitionRegistry`
- `MapObjectFactory`
- `SpriteAnimator` (the canonical animation ticker, at `js/Engine/SpriteAnimator.js`)
- `StateMachine` and `StateController` for state preview
- debug collider overlay ideas already in `DebugUI`

We should not make "edit `.js` files directly" the primary long-term strategy. For editable domains, the source of truth should become structured data files. Direct JS rewriting can exist only as a temporary bridge if needed.

## What Exists Today

### Already data-driven and canonical

All of the following canonical data files exist and are runtime-authoritative:

- `data/mytes/myte.json` — base Myte definition with movement, physics, capabilities, spatial anchors, AI config, stats, audio, and visual sections
- `data/mytes/snail.json` — species override with full `spatial.anchors`, `spatial.regions`, `spatial.directions`, and `visual.spriteSets`
- `data/mytes/worm.json` — sparse species override (only differences from base are stored)
- `data/mytes/species.json` — species catalog with `defaultSpeciesId`, `enabled`, `essential`, `sortOrder`
- `data/metadata/items.json` — item catalog with top-level `visual.spriteSheet` (shared atlas) and per-item `visual.sprite {col, row}`
- `data/metadata/actions.json` — action definitions at schemaVersion 2 with `queue`, `traits`, `effects`, `ai`, and `purposeOverrides` sections
- `data/metadata/buffs.json` — buff/debuff definitions with `triggers`, `effects`, `onApply`, and `kind` classification
- `data/metadata/zones.json` — zone type definitions with stat effect rates
- `data/metadata/environment-presets.json` — atmosphere and lighting preset configs at schemaVersion 2
- `data/map-objects/base.json` — base map object config with all shared defaults
- `data/map-objects/types.json` — per-type overrides including slots, AI affordances, action configs, and visual settings

### Still code-driven

- Object behavior/class wiring lives in `js/Map/MapObjectFactory.js`
- Action behavior/queue execution lives in JS queue/action classes; canonical action metadata now lives in `data/metadata/actions.json`

### Useful existing pieces we can build on

- `MapObject` already renders colliders, interactive hit areas, and slot surfaces
- `DebugUI` already draws collider overlays and slot markers
- `ModalWindow`, `ScreenManager`, and the current shell/window CSS already give us a native-looking UI system
- `SpriteAnimator` at `js/Engine/SpriteAnimator.js` handles frame-by-frame animation ticking with `[col, row]`, `[col, row, durationMs]`, or plain column index frame formats
- `StateMachine` is split into `StateController` (pure state logic with `addStateListener`) and `StateMachine` (drives animator + DOM), making it hookable from preview code without reimplementing state logic
- `ActionDefinitionRegistry` already loads `actions.json` and provides sync lookup by id

## Product Direction

The editor should be a dedicated app for authoring definitions, not a debug panel with extra buttons.

Recommended entry points:

- `editor/index.php` as the main editor shell
- `editor/preview.php` only if we want isolated preview windows later

Why PHP is a good fit here:

- you already use PHP in this stack
- PHP can read/write JSON safely
- PHP can create backups, validate payloads, and prevent malformed saves
- we can keep the main game static-ish while giving the editor a proper persistence layer

## Core Principle

Separate **authoring data** from **runtime classes**.

That means:

- classes stay in JS
- editable values move into JSON schemas
- the editor changes JSON
- runtime loaders merge JSON into the existing classes/factories

This keeps the editor stable even when behavior code evolves.

To stay maintainable, there must be one authored source of truth for every editable value.

That means:

- do not keep the same authored value in both JS and JSON
- runtime should load authored values from the same files the editor writes
- the editor should preview through the same loaders the game uses
- compatibility should be protected by schemas, adapters, and validation, not manual discipline

Consistency rule:

- the same concept should use the same authored path across domains
- not every domain needs every section, but shared concepts should not get different names just because they live in different files
- for example, sprite-sheet and sprite presentation data should live under `visual` whether the record is a Myte, map object, or item

## Inheritance Policy

Inherited data should stay sparse and clean.

Canonical rule:

- child definition files store overrides only
- if a child value is the same as its parent, it should not be written into the child file
- if a child field is removed, the effective value should come from the parent automatically
- the editor should show the effective merged value and the inherited parent value for reference
- the editor should also show where a value comes from, such as `base` or `species override`

This means the authored child JSON stays minimal, while the editor can still be informative.

Recommended save behavior for inherited fields:

- if a user changes a field back to the same value as its parent, the override should be removed on save
- do not serialize duplicated parent values just because the user touched the field
- inherited reference values belong in the editor UI, not in the child JSON
- the inspector should show the inherited parent value inline for reference without writing it into the child record

## Schema-Driven Editor

The editor should not be hardcoded around today's exact field list.

Recommended approach:

- field layout and validation come from schema definitions
- inheritance and source-of-value display come from schema-aware data adapters
- previews use runtime loaders/renderers, not duplicated editor-only logic
- special domains can still have custom panels, but they should sit on top of shared schema-driven forms

If we add a new field later:

- update the canonical schema
- update the loader/adapter
- update any domain-specific preview or custom control only if needed

Practical implication:

- the editor should be schema-driven, not a giant hardcoded list of today's fields
- shared concepts like `spatial` and `visual` should render automatically from schema metadata
- custom controls should exist only where the experience needs something more visual, like geometry and animation editing

That keeps structure changes manageable instead of forcing us to rewrite the editor every time data grows.

## Why Not Edit JS Directly

Direct JS editing is possible, but it is the wrong default for this project.

Problems with direct JS editing:

- fragile string replacement
- comments/formatting loss
- higher chance of corrupting files
- hard to validate before save
- hard to reorder nested arrays/objects safely
- difficult to distinguish behavior code from authoring data
- future editor features become much more expensive

Recommended policy:

- JSON is the canonical editable source for content definitions
- JS remains the canonical source for behavior and class registration
- if we need a transition period, use import/export adapters instead of raw text editing

## Recommended Architecture

## 1. Folder Structure

```text
editor/
  index.php
  api/
    bootstrap.php
    load.php
    save.php
    validate.php
    assets.php
  js/
    EditorApp.js
    EditorStore.js
    EditorRouter.js
    EditorSchemaRegistry.js
    adapters/
      MyteEditorAdapter.js
      ItemEditorAdapter.js
      MapObjectEditorAdapter.js
      ActionEditorAdapter.js
    preview/
      PreviewSandbox.js
      PreviewMyte.js
      PreviewMapObject.js
    panels/
      InspectorPanel.js
      AssetBrowserPanel.js
      StatePreviewPanel.js
      GeometryPanel.js
      AnimationTimelinePanel.js
      ValidationPanel.js
      ChangeSummaryPanel.js
  css/
    editor.css
```

Shared code should stay where it already lives when possible.

## 2. Shared Runtime Reuse

The editor should reuse existing code in two ways:

- reuse real runtime loaders and renderers for preview
- reuse visual tokens/components for the UI shell

Reuse targets:

- `js/Engine/ItemRegistry.js`
- `js/Myte/MyteDefinitions.js`
- `js/Map/MapObjectFactory.js`
- `js/Engine/SpriteAnimator.js` — canonical frame ticker; replaces the older AnimationController for Myte and any sprite animation preview
- `js/Myte/StateMachine.js` — `StateController.addStateListener()` lets the editor observe state transitions without reimplementing state logic
- `js/Map/MapObjects/MapObject.js`
- `js/Utility/RectUtils.js`
- `js/UI/ModalWindow.js`
- `js/Myte/Queue/ActionDefinitionRegistry.js`
- existing `window-panel`, `app-shell`, and token CSS

Do not duplicate object rendering logic in the editor if the game already knows how to render the thing.

## 3. Editor Data Layers

The editor should operate on three layers:

1. Source files
   JSON files and transitional adapters for code-backed configs.

2. Normalized editor model
   A schema-shaped object the forms work against.

3. Runtime preview model
   The exact structure needed to feed preview renderers.

This lets us keep the forms clean even if runtime structures are messy.

## Canonical Data Strategy

For maintainability, each domain should have exactly one canonical authored format:

- Mytes: JSON (`data/mytes/myte.json` + species files)
- Species catalog: JSON (`data/mytes/species.json`)
- Items: JSON (`data/metadata/items.json`)
- Actions: JSON definitions (`data/metadata/actions.json`) plus JS implementations
- Buffs: JSON (`data/metadata/buffs.json`)
- Zones: JSON (`data/metadata/zones.json`)
- Environment presets: JSON (`data/metadata/environment-presets.json`)
- Map objects: JSON definitions (`data/map-objects/base.json` + `types.json`) plus JS behavior classes
- Future map editor placements: map files plus shared object definition references

If a value is editable, it should come from the canonical authored file, not from duplicated constants elsewhere.

## Phase 1 Canonical Files (All Now Exist)

All canonical data files are in place:

- `data/mytes/*.json`
- `data/mytes/species.json`
- `data/metadata/items.json`
- `data/metadata/actions.json`
- `data/metadata/buffs.json`
- `data/metadata/zones.json`
- `data/metadata/environment-presets.json`
- `data/map-objects/base.json`
- `data/map-objects/types.json`

## Species Registry

Implemented. The actual shape includes two additions beyond the original plan:

```json
{
  "schemaVersion": 1,
  "defaultSpeciesId": "snail",
  "species": [
    {
      "id": "snail",
      "definitionFile": "snail.json",
      "label": "Snail",
      "enabled": true,
      "essential": true,
      "sortOrder": 10
    },
    {
      "id": "worm",
      "definitionFile": "worm.json",
      "label": "Worm",
      "enabled": true,
      "essential": false,
      "sortOrder": 20
    }
  ]
}
```

Fields added beyond the original plan:

- `defaultSpeciesId` — which species to load when no saved preference exists
- `essential` — whether the species can be disabled in the editor without breaking the game

`MyteDefinitionRegistry` loads from this catalog.

## Map Object Migration Strategy

Map objects use canonical JSON definition files plus JS behavior classes. The migration is complete through Step C.

### Step A ✓

JSON format exists for map object definitions with:

- base config in `data/map-objects/base.json`
- type and variant configs in `data/map-objects/types.json`
- `visual.defaultState`, `visual.states[]`, `visual.animates`, `visual.fps`, `visual.renderType`
- `interaction`, `physics`, `actionConfigs`, `ai.affordances`, slot data in `slotsByFacing`
- `soundEffects`, `lighting`, `approachConfig`, `variantConfigs`

Note: map object visual uses `visual.defaultState`, `visual.states`, and `visual.fps` rather than `spriteSets`. The rendering path differs from Myte sprite animation — map objects use CSS class/state-based rendering, not SpriteAnimator frame ticking. The editor will need separate handling for map object animation authoring vs. Myte animation authoring.

### Step B ✓

`MapObjectFactory` initializes from JSON-loaded configs.

### Step C ✓

Editable values are in JSON; class registrations remain in JS.

### Step D ✓

Behavior classes like `DoorMapObject`, `PortalMapObject`, `LightMapObject`, `AmbientCreatureMapObject` remain in JS.

### Step E

Remove legacy JS-authored config sources from load path once canonical data is fully trusted.

## Action System Strategy

Actions use **definition + implementation**, implemented at schemaVersion 2.

The actual schema is richer than originally planned. Each action definition has:

- `id`, `label`, `icon`, `description`
- `category`, `tags[]`
- `queue` — `priority`, `isInterruptible`, `isMovementAction`, `defaultDuration`, `energyCostMultiplier`, `requiresTarget`, `implementationClass`, `options`
- `traits` — `exertion`, `novelty`, `soothing`, `risk`, `repeatMode`
- `effects` — stat deltas applied on completion (`fun`, `energy`, `comfort`, `social`, `hunger`, `mood`, `health`)
- `ai` — `category`, `soothing`, `exertion`, `accomplishment`, `commitmentMs`, `scoreDrivers[]`
- `purposeOverrides` — per-purpose `ai` overrides (used when the same action has different AI scoring for different object contexts, e.g. `interact_object` for `start_music` vs `light_on` vs `socialize`)

`scoreDrivers` entries reference context paths like `"drives.exploreDrive"`, `"novelty"`, `"preferences.music"`, etc. with a numeric `weight`.

The editor should expose all of these fields and warn when a definition exists with no JS implementation or vice versa.

## Editor UX

## Main Screens

Recommended top-level sections:

- Mytes
- Map Objects
- Items
- Actions
- Buffs
- Zones
- Environment Presets
- Assets
- Validation

Each section should use the same page pattern:

- left rail for type/species/object list
- center preview workspace
- right inspector for values
- bottom optional timeline/errors/history tray

## Editing Flow

Every editor should support:

- browse
- duplicate
- create new
- rename safely
- reorder
- compare with base/default
- preview before save
- preview unsaved staged changes
- explicit `Save` to persist to disk
- explicit `Revert` or `Discard Changes`
- validate before save
- save with backup

Recommended save behavior:

- field edits update the preview immediately as you type
- nothing writes to disk until the user explicitly chooses `Save`
- unsaved state should always be visible

## Preview Requirements

The preview is the heart of the tool. It should be first-class, not an afterthought.

For Mytes:

- switch species
- switch direction
- preview any sprite set/state
- preview sprite sheet source and visual filter (CSS filter string stored in `visual.spriteSheet.filter`)
- scrub frame sequences using `SpriteAnimator`
- preview named anchors and named regions
- preview collider/select/hit geometry
- preview idle vs moving vs expression states
- hook into `StateMachine.addStateListener()` rather than reimplementing state logic

For Map Objects:

- switch type and variant
- switch facing direction
- preview state transitions
- preview animated sprite sequences
- preview shadow placement, opacity, scale, and offsets
- preview collider, interaction area, selection area, hit area, and pickup area
- preview select box and hit box
- preview slot regions and slot rest points (stored in `slotsByFacing`)
- preview light radius and offsets where relevant
- preview walkable vs blocking footprint

For Items:

- preview sprite atlas cell (shared atlas at `visual.spriteSheet.url`, per-item `visual.sprite {col, row}`)
- preview inventory icon scale/crop
- preview slot compatibility
- preview dropped-world representation if needed

## Geometry Editing

Geometry editing should prioritize exact numeric editing in the inspector, with live preview updates as values change.

Editable geometry concepts:

- `size`
- `spatial.regions.collider`
- `spatial.regions.interaction`
- `spatial.regions.hit`
- `spatial.regions.select`
- `spatial.regions.pickup`
- slot bounds
- slot anchor points
- approach positions
- light radius/origin

Each region has a `type` discriminator (`"box"` currently; reserve for future `"circle"` or `"polygon"` support). The editor should render and persist this field.

Recommended interaction model:

- type exact numbers in inspector
- update the preview immediately as each value changes
- support keyboard nudging for fine adjustment
- optionally support drag rectangles and resize handles as a secondary helper, not the primary source of truth
- toggle overlays independently

Important: restore `hitbox` and `selectbox` as explicit schema concepts, even if runtime currently uses mainly `collider` and interaction-region geometry.

Recommended rule:

- inspector numbers are authoritative
- direct-manipulation tools, if present, simply write back into those same numeric fields

Recommended naming and semantics:

- `collider`
  Used for physical blocking, pathing, overlap checks, and world collision.
- `interaction`
  Used for "can I interact with this thing" pointer or proximity targeting.
- `select`
  Used for click/touch selection in the UI.
- `hit`
  Used for taking hits from attacks, hazards, projectiles, or damage effects.
- `pickup`
  Used for grab/pickup targeting when pickup should be more specific than general selection.

Recommended migration:

- authored data should use `spatial.regions.interaction`
- runtime loaders may normalize that into older internal fields until every consumer is fully migrated

## Spatial Anchors And Regions

Implemented. The shared `spatial` schema is live in both `myte.json` and species files.

The actual implemented shape for a species file:

```json
{
  "spatial": {
    "anchors": {
      "carry.item": {
        "x": 96,
        "y": 80,
        "itemAnchorX": 0.5,
        "itemAnchorY": 1
      },
      "mouth.item": {
        "x": 96,
        "y": 112,
        "itemAnchorX": 0.5,
        "itemAnchorY": 0.5
      }
    },
    "regions": {
      "collider": {
        "type": "box",
        "x": 48,
        "y": 115,
        "width": 96,
        "height": 58
      },
      "select": {
        "type": "box",
        "x": 8,
        "y": 8,
        "width": 176,
        "height": 176
      },
      "interaction": {
        "type": "box",
        "x": 8,
        "y": 8,
        "width": 176,
        "height": 176
      },
      "hit": {
        "type": "box",
        "x": 32,
        "y": 80,
        "width": 128,
        "height": 100
      }
    },
    "directions": {
      "N": {
        "anchors": {
          "carry.item": { "x": 96, "y": 72 },
          "mouth.item": { "x": 96, "y": 92 }
        }
      },
      "E": {
        "anchors": {
          "carry.item": { "x": 118, "y": 78 },
          "mouth.item": { "x": 126, "y": 108 }
        }
      }
    }
  }
}
```

Important notes on the actual implementation:

- regions each have a `type` field (`"box"`) — this is the discriminator for future non-box region types; the editor must read and preserve it
- anchors can have extra fields beyond `x`/`y` (e.g. `itemAnchorX`, `itemAnchorY` for item attachment alignment)
- direction overrides in `spatial.directions` only need to contain what actually differs; unspecified anchors/regions inherit from the base

The `pickup` region is not yet present in species files — adding it is still pending.

Why this structure:

- one system covers Mytes and map objects
- easy to preview
- easy to validate
- future features can add new named anchors without changing the schema philosophy
- direction overrides are explicit instead of scattered across special-case fields
- base inheritance keeps authoring smaller and less repetitive

## Animation Editing

For any animation/state editor, support:

- reorder frames
- duplicate frame
- remove frame
- change duration/frame delay (per-frame via the `[col, row, durationMs]` triplet, or base rate via `fps`)
- set loop on/off
- set per-animation loop behavior explicitly
- assign preview state
- play/pause/step (drive via `SpriteAnimator.update(deltaTime)`)
- reorder states
- rename state
- mark default state
- edit sprite-sheet source (`visual.spriteSheet.url`), frame size (`visual.frameSize`), and animation membership under `visual.spriteSets`
- preview one-shot animations versus looping idle states clearly

Frame data format (in `visual.spriteSets`):

- `[col, row]` — standard frame at column/row in the sheet
- `[col, row, durationMs]` — frame with per-frame timing override
- plain integer — single-row sheet shorthand (column index only)

`SpriteAnimator` handles all three. The editor timeline should read and write `[col, row, durationMs]` when per-frame timing is needed, and strip the third element when it matches the base rate.

State naming best practice:

- keep one consistent field for startup state: `visual.defaultState`
- keep actual state ids semantic, such as `closed`, `opened`, `idle`, `seed`, `off`, or `active`
- do not rename meaningful gameplay states to a generic `default` label just for cross-object consistency
- use `default` only when an object truly has a generic unnamed state and no better semantic label

Why:

- `defaultState` answers which state the object starts in
- the state id answers what real gameplay or visual mode the object is in
- semantic state ids are clearer for runtime, editor UX, debugging, and future content work

## Domain-Specific Plans

## Myte Editor

Should edit:

- base definition vs species override
- display name/id
- movement values
- collider geometry
- physics values
- capabilities
- AI defaults and ranges (`ai.thinkInterval`, `ai.wanderRadius`, `ai.safeAreaRadius`, `ai.driveWeights`, `ai.preferences`)
- stats and decay/regeneration values
- mood definitions
- visual frame size (`visual.frameSize`)
- sprite sheet metadata (`visual.spriteSheet.url`, `visual.spriteSheet.filter`)
- sprite sets (`visual.spriteSets`) — keyed animation frame arrays
- named anchors and named regions
- expression aliases
- audio locomotion config (`audio.locomotion.footsteps`, `audio.locomotion.animationSpeedScale`)

Important UX:

- show merged final definition and override-only view
- make inherited values obvious
- allow "reset to base"

## Map Object Editor

Should edit:

- base type properties
- per-variant overrides (`variantConfigs`)
- per-direction overrides
- render type (`visual.renderType`: `"single"`, `"split"`, etc.)
- visual states (`visual.defaultState`, `visual.states[]`, `visual.animates`, `visual.fps`)
- shadow config
- collision and interaction geometry
- named anchors and named regions
- action config (`actionConfigs` per action id)
- sound config (`soundEffects`)
- light/shadow config (`lighting`)
- surface slot definitions (`slotsByFacing` — keyed by facing direction, each an array of slot objects with `id`, `restPosition`, `restFacing`, `approachConfig`)
- AI affordances (`ai.affordances[]` with `actionId` and `purpose`)
- approach config
- regrowth/respawn/toggle behavior parameters

Note: map object `visual` structure differs from Myte visual. Map objects do not use `spriteSets`; they use `visual.defaultState` / `visual.states[]` for CSS class-based state rendering. Keep these as separate authoring concepts even though both live under `visual`.

Important UX:

- show type, variant, and direction inheritance clearly
- avoid giant raw JSON textarea editing as the default
- allow quick cloning from an existing variant or direction

## Item Editor

Should edit:

- id
- aliases
- type
- `capabilities.droppable` flag
- description
- sprite atlas position (`visual.sprite.col`, `visual.sprite.row`)
- sprite dimensions if we ever support non-standard item sizes
- future item behavior metadata
- slot compatibility tags

The shared sprite atlas is configured at the top level of `items.json` under `visual.spriteSheet` (url and frameSize) and should be editable there, not per-item.

## Action Editor

Should edit:

- action definition metadata
- categories and tags
- labels/descriptions/icon
- `queue` settings (priority, duration, interruptibility, implementation class name)
- `traits` (exertion, novelty, soothing, risk, repeatMode)
- `effects` (stat delta values)
- `ai` values (category, soothing, exertion, accomplishment, commitmentMs, scoreDrivers)
- `purposeOverrides` — per-purpose AI overrides (show as named variants within the action)

The editor should warn if a definition exists with no JS implementation, or a JS implementation exists with no definition.

## Buff Editor

Should edit:

- id, label, icon, description
- kind (`"buff"` or `"debuff"`)
- category, priority
- `durationMs`, `reapplyCooldownMs`
- `cancellable`, `stackMode`
- `onApply` — instant stat boosts applied on activation
- `effects.movement.speedMultiplier`
- `effects.stats` — multiplier and per-ms fields
- `triggers` — condition-based (`status.conditions`), action-complete-based (`actionComplete.actionIds`, `actionComplete.categories`), or event-based (`event.names`)

Buffs are a new editable domain not in the original plan. They are already runtime-authoritative through `data/metadata/buffs.json`.

## Zone Editor

Should edit:

- id, label
- `effects` — per-stat passive tick rates

Zones are simple. The editor UX can be a lightweight list editor without a preview canvas.

## Environment Preset Editor

Should edit:

- preset id
- `atmosphere` — nightColor, nightOpacityMax, vignette settings, sunrise/sunset gradient stops
- `lighting` — darknessColor, darknessOpacityMax, resolution scales, shadow strength, dither settings, roomDefaults

This domain has rich nested config (gradient stop arrays, lighting params). The editor should show live previews of the atmosphere gradient band and the lighting darkness blend, not just raw number fields. Currently at schemaVersion 2.

## Map Object Slot Editing

Slot editing should focus on map object slots for now, especially things like beds, couches, and other rest/use surfaces.

This should be part of the Map Object Editor, not a separate top-level editor in the first version.

Actual slot structure in `types.json` (under `slotsByFacing`):

```json
{
  "slotsByFacing": {
    "S": [
      {
        "id": "left_seat",
        "restPosition": { "xFactor": 0.35, "yFactor": 0.5 },
        "restFacing": "S",
        "approachConfig": {
          "allowedSides": ["bottom"],
          "preferredSide": "bottom",
          "gap": 10,
          "align": "left-edge",
          "alignTo": "collider",
          "myteAlignTo": "collider"
        }
      }
    ]
  }
}
```

Recommended slot concepts to expose in the editor:

- slot id
- rest position (xFactor/yFactor relative to object bounds)
- rest facing direction
- occupancy rules
- allowed actions
- approach config (sides, gap, align, alignTo)

## Save Strategy

## Recommended Save Modes

### 1. Draft mode

Editor changes live only in memory or localStorage until explicitly saved.

### 2. File save mode

Persist to JSON via PHP endpoints.

### 3. Backup mode

Before overwriting a file, create timestamped backups.

Example:

- `data/mytes/snail.json`
- `data/mytes/_backup/snail.2026-06-04T14-18-32.json`

## Validation Before Save

All saves should run:

- schema validation
- required field validation
- duplicate id checks
- missing asset checks
- broken alias/reference checks
- range validation
- reserved-name validation

If validation fails, save should be blocked unless we explicitly support force-save for advanced users.

## Suggested PHP Responsibilities

- load file
- save file
- backup file
- list available definitions/assets
- validate payload
- sanitize paths
- reject writes outside approved directories

Do not let the client submit arbitrary file paths.

## Compatibility Plan

As the game evolves, editor compatibility should be enforced by architecture, not memory.

Recommended protections:

### 1. Shared loaders

- the editor preview must use the same loaders/normalizers as runtime
- avoid separate parsing rules in editor-only code

### 2. Schema registry

- define schemas for each editable domain
- include `schemaVersion`
- validate on load and save

### 3. Adapters at boundaries

- if runtime preview needs normalized computed data, produce it from canonical authored data
- do not leak duplicate authored shapes into the canonical data

### 4. Contract tests

- add smoke tests that load all item/myte/map object definitions
- add preview tests for a small set of representative species/types/variants
- fail fast if a runtime refactor breaks editor assumptions

### 5. Change discipline

When we add a new editable field, the change should happen in this order:

1. update canonical schema
2. update loader/adapter
3. update runtime consumer
4. update editor inspector/preview
5. update validation/tests

If we follow this pattern, the editor stays in sync because both systems evolve around the same data contract.

## Preparing The System Before Building The Editor

These are the highest-value prep changes to make first.

### 1. Choose canonical authored files ✓

- Mytes, Items, Actions, Buffs, Zones, Environment Presets, Map Objects all have canonical JSON files
- all runtime load paths use these files

### 2. Formalize geometry concepts (partial)

- `collider`, `interaction`, `hit`, `select` regions are live in species files
- `pickup` region is not yet present — still pending
- explicit `hitbox` and `selectbox` as standalone top-level authored concepts are not yet formalized

### 3. Add a shared spatial schema ✓

- `spatial.anchors` and `spatial.regions` are live
- per-direction overrides are live in `spatial.directions`
- anchor extra fields (itemAnchorX, itemAnchorY) are in place for carry attachment alignment
- map object types do not yet have `spatial.regions` — that migration is still pending

### 3.5. Bring domain parity to authored visuals (partial)

- Mytes use `visual.spriteSets` with `[col, row]` frame arrays ✓
- Map objects use `visual.defaultState` / `visual.states[]` with CSS-class-based rendering — different model, not directly comparable ✓
- Items use `visual.spriteSheet` at catalog level + `visual.sprite {col, row}` per item ✓
- `visual.spriteSheet.filter` used by Mytes for CSS filter overrides per species ✓

### 4. Add stable ids and references ✓

All domains have stable `id` fields. Action, item, buff, and zone ids are used as cross-references in buff triggers and AI affordances.

### 5. Add schema versioning ✓

All files have `schemaVersion`. Enforcement at load time is not yet wired — that is still pending.

### 6. Remove legacy load paths

- runtime should load only canonical authored data files once all loaders are confirmed stable
- older JS-authored config sources should be removed from the load path

### 7. Separate authored config from behavior code ✓ (substantially done)

- editable numbers and metadata are in JSON
- behavior classes and algorithms remain in JS

### 6.5. Add validation so compatibility is enforced automatically

- add repo-level content validation for Mytes, items, actions, map objects, buffs
- validate ids, references, canonical file presence, and action implementation parity
- run validation during migration work and before editor changes so drift is caught immediately

## Future Map Editor Relationship

Map placement will stay in another tool for now, which is a good scope boundary.

For the future in-house map editor, the plan should be:

- map placements remain their own domain
- map editor references the same canonical map object definitions used by runtime and the content editor
- the future map editor preview should render actual map objects in place, not placeholders

## Edge Cases

These are the things the plan must handle up front.

## Data Modeling Edge Cases

- inherited values from base myte/type/direction being overwritten accidentally
- removing an override should restore inheritance, not write `null` unless intentional
- arrays that are ordered semantically, like animation frames or state priority
- ids renamed while other files still reference them (buff triggers reference action ids; affordances reference action ids)
- aliases colliding across items/actions/species/variants
- variant-level and direction-level geometry fighting each other
- objects with behavior code that expects a config shape the editor must preserve
- direction overrides accidentally shadowing inherited anchors/regions unnecessarily
- `purposeOverrides` in actions that reference purpose strings used in affordance configs — renaming a purpose must update all references

## Runtime Preview Edge Cases

- assets missing or moved
- sprite sheet dimensions not matching frame coordinates
- previewing a state that does not exist for the current direction
- previewing behaviors that need a map context, time context, or active myte
- map objects that depend on specialized classes for behavior
- lighting/particle effects that need a scene wrapper
- `SpriteAnimator` preview requires calling `.update(deltaTime)` in a loop; the editor must drive this with requestAnimationFrame

## Save/Workflow Edge Cases

- two browser tabs editing the same file
- malformed JSON already on disk
- partial save where one file writes and another fails
- unsaved changes when switching records
- save conflicts after external file edits
- localStorage draft format versioning
- saving one changed id without updating all references

## Migration Edge Cases

- stale action metadata drifting away from current queue/action implementations
- existing maps referencing object types/variants that get renamed
- selection, hit, and pickup regions need to stay semantically distinct in every consuming runtime path
- objects that need separate interaction, selection, hit, or pickup regions instead of one overloaded area
- buff trigger `actionIds` that reference removed or renamed actions

## Technical Constraints

- project intentionally uses global classes and script tags, not modules
- editor should follow that pattern unless the wider architecture changes
- editor should avoid reimplementing runtime logic in PHP
- editor UI should compile through the existing SCSS pipeline where possible

## Design System Rules

The editor should inherit the current visual language.

Use:

- existing tokens from `css/core/_tokens.scss`
- `window-panel` structure
- `app-shell` layout ideas
- existing button, sidebar, overlay, and panel styles

Add:

- editor-specific panels/tabs/inspector styles in a dedicated SCSS/CSS file
- geometry overlay colors with a clear legend
- pleasant spacing and motion, not a sterile form wall

The editor should feel like a workshop, not a spreadsheet.

## Phased Rollout

## Phase 0: Foundation ✓ COMPLETE

- `data/mytes/species.json` ✓
- sparse base/species Myte JSON inheritance ✓
- item catalog parity under `data/metadata/items.json` with canonical `visual` data ✓
- canonical `data/map-objects/base.json` ✓
- canonical `data/map-objects/types.json` ✓
- runtime loading from the canonical map object JSON files ✓
- shared runtime normalization path so map object authored data can use `visual` structure ✓
- canonical `data/metadata/actions.json` (schemaVersion 2) ✓
- runtime action metadata loading through `js/Myte/Queue/ActionDefinitionRegistry.js` ✓
- canonical `data/metadata/buffs.json` ✓
- canonical `data/metadata/zones.json` ✓
- canonical `data/metadata/environment-presets.json` (schemaVersion 2) ✓
- `SpriteAnimator` at `js/Engine/SpriteAnimator.js` ✓
- `StateController` split from `StateMachine` with `addStateListener` hook ✓
- `spatial.anchors`, `spatial.regions`, `spatial.directions` live in Myte species files ✓

Still pending from the prep phase:

- `pickup` region formalization
- load-time schema version enforcement
- map object `spatial.regions` migration (currently only Mytes have it)
- content validation suite

## Phase 1: Read-Only Preview Explorer ✓ COMPLETE

Built:

- `editor/index.php` — app shell; `<base href="../">` for project-root-relative asset/API paths; hash routing with JS only (no `<a href="#...">`)
- `editor/js/EditorRouter.js` — hash-based router parsing `#/<domainId>/<recordId>`, `navigate()`, `emit()`
- `editor/js/EditorApi.js` — `EditorApi.load/save/validate/assets` over `editor/api/*.php`; `EditorApiError` with `status/code/extra`
- `editor/js/EditorDocument.js` — writable file wrapper: `setAt/deleteAt/getAt` path arrays, `isDirty`, `revert`, `markSaved`; `deleteAt` prunes empty parent objects; `deepEqual` for dirty tracking
- `editor/js/EditorStore.js` — loads all domains; `deepMerge` delegates to `MyteDefinitionRegistry.deepMerge`; layered record model (base + override + merged); sparse edit removes override when value matches base; `rebuildMyteRecords`, `rebuildItemRecords` after revert
- `editor/js/panels/ListRailPanel.js` — filterable record list with active state
- `editor/js/panels/InspectorPanel.js` — schema-tree renderer; typed inputs (boolean/number/array/string); override badge with per-field reset-to-base for layered records; `isLeaf` treats primitive-element arrays as leaves
- `editor/js/preview/PreviewControls.js` — shared stage/controls/legend builders; `EditorOverlayColors` palette; `makeBoxOverlay`, `makeMarkerOverlay`, `makeRadiusOverlay`
- `editor/js/preview/MytePreview.js` — SpriteAnimator-driven sprite preview; play/pause/step; zoom; spatial region and anchor overlays; direction-aware via `MyteDefinitionRegistry.getSpatialValue`; `refresh()` preserves playback/zoom state
- `editor/js/preview/MapObjectPreview.js` — read-only map object preview; variant/facing/state selectors; region overlays (canonical `spatial.regions` + legacy path fallback); slot rest-point markers; light-radius circle
- `editor/js/preview/ItemPreview.js` — magnified atlas cell + full atlas with active-cell highlight; click atlas to navigate to item by `(col, row)`
- `editor/js/preview/SummaryPreview.js` — summary card fallback for non-visual domains (actions, buffs, zones, environment presets)
- `editor/js/EditorApp.js` — top-level: tab bar, header Save/Revert, rail New/Duplicate/Delete, findings bar; conflict-resolution prompt on 409; `beforeunload` guard when dirty

## Phase 2: Writable JSON Domains ✓ COMPLETE

Built (in addition to the Phase 1 infrastructure above):

- Full item editor: create/duplicate/delete items; edit all fields including `visual.sprite {col, row}`; catalog-level `visual.spriteSheet` editable as the `_catalog` record
- Full Myte editor: edit base definition or species override; sparse override saves; inherited values shown with badge + reset-to-base; base edits propagate to all species merged views
- Species catalog loading from `data/mytes/species.json` — only enabled species loaded; sorted by `sortOrder`
- PHP persistence layer — all five endpoints implemented per `docs/EDITOR_API_SPEC.md`:
  - `editor/api/bootstrap.php` — file registry, request/response helpers, domain validation, backup, atomic write
  - `editor/api/load.php` — returns file content + `mtime` for conflict detection
  - `editor/api/save.php` — conflict check (mtime), validation gate, timestamped backup (max 20), atomic 2-space-indent write
  - `editor/api/validate.php` — validate-only endpoint; returns `findings[]` with `level/path/message`
  - `editor/api/assets.php` — lists image assets for sprite pickers
- Findings bar in editor UI for validation errors and save warnings
- Save conflict flow: 409 triggers a confirm prompt; user can force-overwrite (creates backup first)

## Phase 3: Map Object Editor Layer ✓ COMPLETE

Built:

- `EditorStore.loadMapObjects` refactored to call `rebuildMapObjectRecords` (same pattern as mytes); `writable: true`
- `rebuildMapObjectRecords(domain)` — builds layered records with `basePath: [typeId]`, `base: baseLayer`, `override: typesDoc.content[typeId]`
- `recomputeLayeredRecords` extended to handle `'map-objects'` domain
- `rebuildDomain` dispatches to `rebuildMapObjectRecords` for `'map-objects'`
- `MapObjectPreview.refresh(record)` re-derives `variants` and `facings` before re-mounting so controls stay correct after inspector edits
- Inspector shows `editable` mode; sparse override semantics apply (value equal to base removes override)
- Save/Revert work identically to Mytes; `map-objects.types` is in the PHP file registry

## Phase 4: Actions, Buffs, Zones, and Environment Presets ✓ COMPLETE

Built:

- `EditorStore.loadMetadataList` refactored to accept `{ writable }` option and build proper `basePath` per record:
  - Array domains (`actions`, `buffs`, `zones`): `basePath: [listKey, index]`; `supportsItemOps: true`
  - Object domain (`environment-presets`): `basePath: ['presets', key]`; `supportsItemOps: false`
- `rebuildMetadataRecords(domain)` — re-derives all records from document content; called after add/duplicate/delete
- `addMetadataEntry(domain)` — creates a new entry with `DEFAULT_ENTRIES` scaffold + unique id
- `duplicateMetadataEntry(domain, recordId)` — clones entry with unique id
- `deleteMetadataEntry(domain, recordId)` — splices entry and rebuilds
- `uniqueMetadataId(list, candidate)` — generates a non-colliding id
- `syncRecordIdentity` generalized: updates `record.id` for any non-layered record when `id` is edited
- `rebuildDomain` dispatches to `rebuildMetadataRecords` for domains with `listKey`
- `EditorApp.createItem/duplicateItem/deleteItem` dispatch to metadata ops for non-items domains
- All six metadata domains are now writable; inspect/edit/save/revert works like items
- Slot editing inside Map Object Editor is still pending (Phase 5 scope)

## Phase 5: Geometry/Interaction Completion

- formalize `hitbox` and `selectbox`
- formalize `pickup` region
- formalize shared `anchors` and `regions` for map object types
- support direct manipulation tools
- support slot bounds editing
- support side-by-side compare and reset-to-default flows

## Phase 6: "Edit Everything" Expansion

Potential future domains:

- zones and environment presets (already have canonical files, low-complexity editor)
- particles
- sounds and cue metadata
- light presets
- map placements/instances
- dialogue definitions
- AI tuning presets

## Recommended First Deliverable

The best first slice is not "everything."

Best first deliverable:

- separate `editor/` app shell
- shared look-and-feel with current game
- read-only preview for Mytes and Map Objects
- writable Items editor
- writable Myte editor
- geometry overlays in preview

Why this first:

- highest value
- lowest migration risk
- proves the architecture
- gives immediate payoff without solving map-object migration on day one

## Decisions I Recommend We Lock In

1. The editor is a separate app under `editor/`, not a modal inside the main game.
2. PHP handles save/load/backup validation for editable files.
3. JSON becomes the canonical content source for editable domains.
4. JS remains the canonical source for behavior implementations and class registration.
5. Map object authored definitions live in canonical JSON, not JS config tables.
6. Geometry editing is inspector-first: exact numeric fields update preview live.
7. Saving is explicit: live preview plus explicit `Save` to disk.
8. `hitbox`, `selectbox`, and `pickupbox` become explicit editable geometry concepts.
9. `spatial.regions.interaction` is the canonical authored interaction region.
10. A shared `anchors` and `regions` schema becomes the spatial source of truth.
11. Direction overrides inherit from base unless explicitly overridden.
12. ID renames should update references automatically through the tool.
13. Preview quality is a priority feature, not a later polish pass.
14. `SpriteAnimator` is the canonical animation runtime for Myte preview; map object animation uses CSS-class-based states, not SpriteAnimator.
15. Map object `visual` and Myte `visual` share the `visual` key name but have structurally different contents — the editor must not conflate them.

## Open Questions For Later Implementation

- do we want the built-in anchor vocabulary to be enforced strictly, or recommended with support for custom names
- for `pickupbox`, should pickup also require a matching named anchor like `anchors.pickup.primary`, or is the region enough by itself
- which current runtime systems should consume `selectbox` first: selection only, hover highlighting too, or both
- should the environment preset editor show a live canvas preview of the atmosphere gradient, or is a numeric editor sufficient for the first version
- buff `purposeOverrides` do not exist yet — should buffs ever support per-context variations the way actions do

## Bottom Line

This is worth doing, and the current codebase is already close enough to support it. The data foundation is complete — all canonical JSON files exist and are runtime-authoritative. The editor work can now begin at Phase 1 (app shell + read-only preview) without any further data migration blocking it.

If we do that, we can get an editor that covers Mytes, map objects, items, actions, buffs, zones, slots, collider geometry, state previews, and future content systems without making the project harder to maintain.
