# Content Editor Plan

**Date:** 2026-05-24  
**Status:** Planning  
**Scope:** Mytes, map objects, items, actions, map-object slot geometry, geometry, animation/state preview, future "edit everything" foundation

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
- `AnimationController`
- debug collider overlay ideas already in `DebugUI`

We should not make "edit `.js` files directly" the primary long-term strategy. For editable domains, the source of truth should become structured data files. Direct JS rewriting can exist only as a temporary bridge if needed.

## What Exists Today

### Already data-driven

- Items are loaded from `data/metadata/items.json` via `js/Engine/ItemRegistry.js`
- Mytes are loaded from `data/mytes/myte.json` plus species files like `data/mytes/snail.json` via `js/Myte/MyteDefinitions.js`

### Semi-hardcoded lists that should become data-driven

- available Myte species are still declared in `MyteDefinitionRegistry.definitionFiles`

### Still code-driven

- Map object definitions live in `js/Map/NewMapObjects/MapObjectConfigs.js`
- Object behavior/class wiring lives in `js/Map/MapObjectFactory.js`
- Actions data exists only as `data/metadata/actions.json.deprecated`; runtime behavior is now code-based in queue/action classes

### Useful existing pieces we can build on

- `MapObject` already renders colliders, interactive hit areas, and slot surfaces
- `DebugUI` already draws collider overlays and slot markers
- `ModalWindow`, `ScreenManager`, and the current shell/window CSS already give us a native-looking UI system
- `index.html` still contains old `selectbox`/`hitbox` remnants, which suggests those concepts should be restored as proper data concepts rather than ignored

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
- `js/Map/NewMapObjects/AnimationController.js`
- `js/Map/NewMapObjects/MapObject.js`
- `js/Utility/RectUtils.js`
- `js/UI/ModalWindow.js`
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

- Mytes: JSON
- Species catalog: JSON
- Items: JSON
- Actions: JSON definitions plus JS implementations
- Map objects: JSON definitions plus JS behavior classes
- Future map editor placements: map files plus shared object definition references

If a value is editable, it should come from the canonical authored file, not from duplicated constants elsewhere.

## Phase 1 Canonical Files

Start with the domains that are already closest to being editable:

- `data/mytes/*.json`
- `data/metadata/items.json`

Then add:

- `data/mytes/species.json`
- `data/metadata/actions.json`
- `data/map-objects/base.json`
- `data/map-objects/types/*.json`

## Species Registry

Yes, we should add a `species.json`.

Recommended purpose:

- define which species exist
- define display order
- define which species file to load
- optionally define editor grouping, status, and preview thumbnail metadata

Recommended shape:

```json
{
  "schemaVersion": 1,
  "species": [
    {
      "id": "snail",
      "definition": "data/mytes/snail.json",
      "label": "Snail",
      "enabled": true,
      "sortOrder": 10
    },
    {
      "id": "worm",
      "definition": "data/mytes/worm.json",
      "label": "Worm",
      "enabled": true,
      "sortOrder": 20
    }
  ]
}
```

Then `MyteDefinitionRegistry` should load this catalog instead of keeping a hardcoded `definitionFiles` array.

## Map Object Migration Strategy

Map objects are the hardest part because definitions are currently mixed into `MapObjectConfigs.js`.

Recommended migration:

### Step A

Create a JSON format for map object definitions that mirrors the current config structure:

- base config
- type config
- variant config
- direction config
- action config
- slot config
- geometry config
- sprite/animation config

### Step B

Teach `MapObjectFactory` to initialize from JSON-loaded configs instead of only globals.

### Step C

Keep `MapObjectFactory` class registrations in JS, but move editable values out of `MapObjectConfigs.js`.

### Step D

Leave special behavior classes like `DoorMapObject`, `PortalMapObject`, `LightMapObject`, `AmbientCreatureMapObject` in JS.

This gives us editable config without weakening the behavior model.

### Step E

Once the JSON loader is stable, shrink `MapObjectConfigs.js` into either:

- a compatibility bridge during migration, or
- a fully removed legacy file

The end goal is that runtime and editor both read the same map object definition files.

## Action System Strategy

Actions should probably become **definition + implementation**:

- definition data in JSON
- executable behavior in JS

For example:

- label
- category
- priority
- cooldown
- energy cost
- targeting rules
- preview metadata
- parameter schema

stay in JSON.

Behavior like queue execution, pathing, reactions, and side effects stays in JS.

## Editor UX

## Main Screens

Recommended top-level sections:

- Mytes
- Map Objects
- Items
- Actions
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
- scrub frame sequences
- preview named anchors and named regions
- preview collider/select/hit geometry
- preview idle vs moving vs expression states

For Map Objects:

- switch type and variant
- switch facing direction
- preview state transitions
- preview animated sprite sequences
- preview collider, interaction area, selection area, hit area, and pickup area
- preview select box and hit box
- preview slot regions and slot rest points
- preview light radius and offsets where relevant
- preview walkable vs blocking footprint

For Items:

- preview sprite atlas cell
- preview inventory icon scale/crop
- preview slot compatibility
- preview dropped-world representation if needed

## Geometry Editing

Geometry editing should prioritize exact numeric editing in the inspector, with live preview updates as values change.

Editable geometry concepts:

- `size`
- `collider`
- `interactionRegion`
- `hitbox`
- `selectbox`
- `pickupbox`
- slot bounds
- slot anchor points
- approach positions
- light radius/origin

Recommended interaction model:

- type exact numbers in inspector
- update the preview immediately as each value changes
- support keyboard nudging for fine adjustment
- optionally support drag rectangles and resize handles as a secondary helper, not the primary source of truth
- toggle overlays independently

Important: restore `hitbox` and `selectbox` as explicit schema concepts, even if runtime currently uses mainly `collider` and `interactiveCollider`.

Recommended rule:

- inspector numbers are authoritative
- direct-manipulation tools, if present, simply write back into those same numeric fields

Recommended naming and semantics:

- `collider`
  Used for physical blocking, pathing, overlap checks, and world collision.
- `interactionRegion`
  Used for "can I interact with this thing" pointer or proximity targeting.
  This is the current role most closely matching `interactiveCollider`.
- `selectbox`
  Used for click/touch selection in the UI.
- `hitbox`
  Used for taking hits from attacks, hazards, projectiles, or damage effects.
- `pickupbox`
  Used for grab/pickup targeting when pickup should be more specific than general selection.

Recommended migration:

- keep reading `interactiveCollider` temporarily
- normalize it internally to `interactionRegion`
- migrate authored data to the new naming before editor work starts

## Spatial Anchors And Regions

We should not solve this separately for carry points, eyes, head, shell, dialogue, and future attachments.

Use one general spatial schema with two families:

- `anchors` for named points
- `regions` for named areas

This gives us one future-proof system instead of many one-off fields.

Recommended concepts:

- `anchors.head`
- `anchors.eyes.left`
- `anchors.eyes.right`
- `anchors.shell.center`
- `anchors.carry.item`
- `anchors.dialogue`
- `anchors.selection.focus`
- `anchors.pickup.primary`
- `anchors.fx.sparkle`
- `anchors.custom.*`
- `regions.collider`
- `regions.interaction`
- `regions.hit`
- `regions.select`
- `regions.pickup`
- `regions.slot.*`

Direction-specific overrides should be built in from the start, and unspecified direction values should inherit from base automatically.

Recommended shape:

```json
{
  "spatial": {
    "anchors": {
      "carry.item": {
        "x": 96,
        "y": 24
      },
      "head": {
        "x": 92,
        "y": 52
      },
      "shell.center": {
        "x": 70,
        "y": 92
      }
    },
    "regions": {
      "collider": {
        "x": 48,
        "y": 115,
        "width": 96,
        "height": 58
      },
      "select": {
        "x": 30,
        "y": 40,
        "width": 132,
        "height": 120
      }
    },
    "directions": {
      "E": {
        "anchors": {
          "carry.item": { "x": 108, "y": 30 },
          "head": { "x": 118, "y": 68 }
        }
      },
      "W": {
        "anchors": {
          "carry.item": { "x": 82, "y": 30 },
          "head": { "x": 74, "y": 68 }
        }
      }
    }
  }
}
```

Why this structure:

- one system covers Mytes and map objects
- easy to preview
- easy to validate
- future features can add new named anchors without changing the schema philosophy
- direction overrides are explicit instead of scattered across special-case fields
- base inheritance keeps authoring smaller and less repetitive

Recommended migration path:

- keep existing `carryOffsets` working temporarily
- add `spatial.anchors` and `spatial.regions`
- adapt runtime to derive old carry behavior from the new anchor model
- gradually retire old one-off fields

## Animation Editing

For any animation/state editor, support:

- reorder frames
- duplicate frame
- remove frame
- change duration/frame delay
- set loop on/off
- assign preview state
- play/pause/step
- reorder states
- rename state
- mark default state

If possible, frame editing should use the existing sprite-sheet logic rather than inventing a new rendering path.

## Domain-Specific Plans

## Myte Editor

Should edit:

- base definition vs species override
- display name/id
- movement values
- collider geometry
- physics values
- capabilities
- AI defaults and ranges
- stats and decay/regeneration values
- mood definitions
- visual frame size
- sprite sets
- named anchors and named regions
- expression aliases

Important UX:

- show merged final definition and override-only view
- make inherited values obvious
- allow "reset to base"

## Map Object Editor

Should edit:

- base type properties
- per-variant overrides
- per-direction overrides
- render type
- sprite sheets and states
- animation sequences
- collision and interaction geometry
- named anchors and named regions
- action config
- sound config
- light/shadow config
- surface slot definitions
- AI affordances metadata
- regrowth/respawn/toggle behavior parameters

Important UX:

- show type, variant, and direction inheritance clearly
- avoid giant raw JSON textarea editing as the default
- allow quick cloning from an existing variant or direction

## Item Editor

Should edit:

- id
- aliases
- type
- droppable flag
- description
- sprite atlas position
- sprite dimensions if we ever support non-standard item sizes
- future item behavior metadata
- slot compatibility tags

## Action Editor

Should edit:

- action definition metadata
- categories
- labels/descriptions
- targeting rules
- cooldowns/costs
- data parameters used by implementations
- affordance metadata used by objects or AI

The editor should warn if a definition exists with no JS implementation, or a JS implementation exists with no definition.

## Map Object Slot Editing

Slot editing should focus on map object slots for now, especially things like beds, couches, and other rest/use surfaces.

This should be part of the Map Object Editor, not a separate top-level editor in the first version.

Recommended slot concepts:

- slot id
- slot region
- rest position
- facing override
- occupancy rules
- allowed actions
- approach config

This keeps the immediate scope aligned with the slot use cases you actually care about.

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
- `data/mytes/_backup/snail.2026-05-24T14-18-32.json`

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

- if runtime needs an older shape, use an adapter layer
- do not leak temporary legacy shapes into the canonical data

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

### 1. Choose canonical authored files now

- keep Mytes and Items on JSON
- migrate map object authored config out of `MapObjectConfigs.js`
- revive Actions as JSON definitions plus JS implementations

### 2. Formalize geometry concepts

- add explicit `hitbox`
- add explicit `selectbox`
- add explicit `pickupbox`
- rename authored `interactiveCollider` to `interactionRegion`
- keep a temporary runtime adapter for old `interactiveCollider`
- make runtime tolerate missing optional regions cleanly

### 3. Add a shared spatial schema

- introduce named `anchors`
- introduce named `regions`
- support per-direction overrides
- plan to migrate `carryOffsets` into this system

### 4. Add stable ids and references

- species ids
- action ids
- item ids
- map object type ids
- variant ids
- slot ids

Renames should be deliberate migrations, not casual text edits.

### 5. Add schema versioning and validation

- per-domain `schemaVersion`
- load-time warnings
- save-time validation
- migration hooks if formats change later

### 6. Add compatibility loaders before removing legacy fields

- keep old fields working briefly through adapters
- only remove them after the new source of truth is proven

### 7. Separate authored config from behavior code everywhere possible

- editable numbers and metadata move to data
- behavior branches and algorithms stay in JS

If we do these first, the editor becomes much simpler and less brittle.

## Future Map Editor Relationship

You said map placement will stay in another tool for now, which is a good scope boundary.

For the future in-house map editor, the plan should be:

- map placements remain their own domain
- map editor references the same canonical map object definitions used by runtime and the content editor
- the future map editor preview should render actual map objects in place, not placeholders

That solves the visualization problem you called out without mixing map placement into the first editor milestone.

## Edge Cases

These are the things the plan must handle up front.

## Data Modeling Edge Cases

- inherited values from base myte/type/direction being overwritten accidentally
- removing an override should restore inheritance, not write `null` unless intentional
- arrays that are ordered semantically, like animation frames or state priority
- ids renamed while other files still reference them
- aliases colliding across items/actions/species/variants
- variant-level and direction-level geometry fighting each other
- objects with behavior code that expects a config shape the editor must preserve
- direction overrides accidentally shadowing inherited anchors/regions unnecessarily

## Runtime Preview Edge Cases

- assets missing or moved
- sprite sheet dimensions not matching frame coordinates
- previewing a state that does not exist for the current direction
- previewing behaviors that need a map context, time context, or active myte
- map objects that depend on specialized classes for behavior
- lighting/particle effects that need a scene wrapper

## Save/Workflow Edge Cases

- two browser tabs editing the same file
- malformed JSON already on disk
- partial save where one file writes and another fails
- unsaved changes when switching records
- save conflicts after external file edits
- localStorage draft format versioning
- saving one changed id without updating all references

## Migration Edge Cases

- current game still expecting `MapObjectConfigs.js`
- old `actions.json.deprecated` not matching current action runtime
- existing maps referencing object types/variants that get renamed
- old `selectbox`/`hitbox` concepts not yet wired everywhere in runtime
- objects that currently use `interactiveCollider` but should also expose separate interaction, selection, hit, or pickup regions

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

## Phase 0: Foundation

- create `editor/` app shell
- create shared editor store/router/panel structure
- reuse tokens and panel styles
- implement read-only loaders for mytes/items/map object configs
- add `data/mytes/species.json`

## Phase 1: Read-Only Preview Explorer

- browse mytes/items/map object types
- live preview states, directions, and geometry
- no saving yet

This de-risks the preview layer before write support.

## Phase 2: Writable JSON Domains

- full item editor
- full myte editor
- species catalog loading from `species.json`
- PHP save/backup/validation pipeline

## Phase 3: Map Object Data Migration

- define JSON schema for map objects
- create import adapter from `MapObjectConfigs.js`
- load preview from normalized editor model
- save new/edited object definitions as JSON
- keep JS class registrations intact

## Phase 4: Actions and Slot System

- define `actions.json`
- add map-object slot editing inside the Map Object Editor
- add validation for slot ids, regions, and rest points

## Phase 5: Geometry/Interaction Completion

- formalize `hitbox` and `selectbox`
- formalize shared `anchors` and `regions`
- support direct manipulation tools
- support slot bounds editing
- support side-by-side compare and reset-to-default flows

## Phase 6: "Edit Everything" Expansion

Potential future domains:

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
5. Map object definitions get migrated out of `MapObjectConfigs.js` in phases.
6. Geometry editing is inspector-first: exact numeric fields update preview live.
7. Saving is explicit: live preview plus explicit `Save` to disk.
8. `hitbox`, `selectbox`, and `pickupbox` become explicit editable geometry concepts.
9. `interactiveCollider` should be migrated to a clearer authored name: `interactionRegion`.
10. A shared `anchors` and `regions` schema becomes the spatial source of truth.
11. Direction overrides inherit from base unless explicitly overridden.
12. ID renames should update references automatically through the tool.
13. Preview quality is a priority feature, not a later polish pass.

## Open Questions For Later Implementation

None right now beyond normal implementation details. The higher-risk structural questions have been decided above so we can prep the data model first.

## Questions To Answer Before Implementation

- do we want the built-in anchor vocabulary to be enforced strictly, or recommended with support for custom names
- for `pickupbox`, should pickup also require a matching named anchor like `anchors.pickup.primary`, or is the region enough by itself
- which current runtime systems should consume `selectbox` first: selection only, hover highlighting too, or both

## Bottom Line

This is worth doing, and the current codebase is already close enough to support it if we treat it as:

- a separate editor app
- a shared runtime preview system
- a gradual migration from config-in-JS to config-in-JSON

If we do that, we can get an editor that covers Mytes, map objects, items, actions, slots, collider geometry, state previews, and future content systems without making the project harder to maintain.
