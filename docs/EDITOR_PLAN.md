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

### Recently migrated catalog data

- available Myte species should come from `data/mytes/species.json` rather than hardcoded loader lists

### Still code-driven

- Object behavior/class wiring lives in `js/Map/MapObjectFactory.js`
- Action behavior/queue execution still lives in JS queue/action classes, but canonical action metadata now lives in `data/metadata/actions.json`

### Useful existing pieces we can build on

- `MapObject` already renders colliders, interactive hit areas, and slot surfaces
- `DebugUI` already draws collider overlays and slot markers
- `ModalWindow`, `ScreenManager`, and the current shell/window CSS already give us a native-looking UI system
- legacy `selectbox`/`hitbox` ideas already existed in the project, which confirms they should be restored as proper data concepts rather than ignored

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
- `js/Map/NewMapObjects/AnimationController.js`
- `js/Map/NewMapObjects/MapObject.js`
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
- `data/map-objects/types.json`

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
      "definitionFile": "snail.json",
      "label": "Snail",
      "enabled": true,
      "sortOrder": 10
    },
    {
      "id": "worm",
      "definitionFile": "worm.json",
      "label": "Worm",
      "enabled": true,
      "sortOrder": 20
    }
  ]
}
```

Then `MyteDefinitionRegistry` should load this catalog instead of relying on a hardcoded species list.

## Map Object Migration Strategy

Map objects should use canonical JSON definition files plus JS behavior classes.

Recommended migration:

### Step A

Create a JSON format for map object definitions that mirrors Myte structure where the concepts overlap:

- base config
- type config
- variant config
- direction config
- action config
- slot config
- geometry config
- sprite/animation config
- shared `spatial.anchors` and `spatial.regions`
- shared `visual` section for sprite, animation, and shadow data

### Step B

Teach `MapObjectFactory` to initialize from JSON-loaded configs before maps are created.

### Step C

Keep `MapObjectFactory` class registrations in JS, but move editable values out of JS-authored config tables.

### Step D

Leave special behavior classes like `DoorMapObject`, `PortalMapObject`, `LightMapObject`, `AmbientCreatureMapObject` in JS.

This gives us editable config without weakening the behavior model.

### Step E

Use the JSON files as the runtime source of truth and remove legacy JS-authored config sources from the load path.

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
- preview sprite sheet source and visual filter
- scrub frame sequences
- preview named anchors and named regions
- preview collider/select/hit geometry
- preview idle vs moving vs expression states

For Map Objects:

- switch type and variant
- switch facing direction
- preview state transitions
- preview animated sprite sequences
- preview shadow placement, opacity, scale, and offsets
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
- `spatial.regions.collider`
- `spatial.regions.interaction`
- `spatial.regions.hit`
- `spatial.regions.select`
- `spatial.regions.pickup`
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

- add `spatial.anchors` and `spatial.regions`
- move one-off spatial fields into that shared model
- keep new authored data centered on the shared spatial schema instead of inventing new special-case fields

## Animation Editing

For any animation/state editor, support:

- reorder frames
- duplicate frame
- remove frame
- change duration/frame delay
- set loop on/off
- set per-animation loop behavior explicitly
- assign preview state
- play/pause/step
- reorder states
- rename state
- mark default state
- edit sprite-sheet source, frame size, and animation membership
- preview one-shot animations versus looping idle states clearly

State naming best practice:

- keep one consistent field for startup state: `visual.defaultState`
- keep actual state ids semantic, such as `closed`, `opened`, `idle`, `seed`, `off`, or `active`
- do not rename meaningful gameplay states to a generic `default` label just for cross-object consistency
- use `default` only when an object truly has a generic unnamed state and no better semantic label

Why:

- `defaultState` answers which state the object starts in
- the state id answers what real gameplay or visual mode the object is in
- semantic state ids are clearer for runtime, editor UX, debugging, and future content work

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
- sprite sheet metadata
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
- shadow config
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

### 1. Choose canonical authored files now

- keep Mytes and Items on JSON
- keep map object authored config in `data/map-objects/base.json` and `data/map-objects/types.json`
- revive Actions as JSON definitions plus JS implementations

### 2. Formalize geometry concepts

- add explicit `hitbox`
- add explicit `selectbox`
- add explicit `pickupbox`
- use `spatial.regions.interaction` as the canonical authored name
- make runtime tolerate missing optional regions cleanly

### 3. Add a shared spatial schema

- introduce named `anchors`
- introduce named `regions`
- support per-direction overrides
- keep carry-style attachment data in this system instead of separate per-feature fields

### 3.5. Bring domain parity to authored visuals

- map objects and Mytes should both use a `visual` section as the authored source of truth
- items should also use `visual` for sprite-sheet and icon data
- sprite-sheet metadata, animation definitions, default state, and shadow data should live there
- runtime loaders can normalize authored `visual` data into any older runtime fields still needed internally

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

### 6. Remove legacy load paths once canonical data is in place

- runtime should load only canonical authored data files
- older JS-authored config sources should be removed from the load path, not left as hidden fallbacks
- internal normalization is acceptable only when it is derived from canonical data at load time

### 7. Separate authored config from behavior code everywhere possible

- editable numbers and metadata move to data
- behavior branches and algorithms stay in JS

If we do these first, the editor becomes much simpler and less brittle.

### 6.5. Add validation so compatibility is enforced automatically

- add repo-level content validation for Mytes, items, actions, and map objects
- validate ids, references, canonical file presence, and action implementation parity
- run validation during migration work and before editor changes so drift is caught immediately

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

- stale action metadata drifting away from current queue/action implementations
- existing maps referencing object types/variants that get renamed
- selection, hit, and pickup regions need to stay semantically distinct in every consuming runtime path
- objects that need separate interaction, selection, hit, or pickup regions instead of one overloaded area

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
- keep map object authored config in JSON files loaded before map initialization

Already completed in prep work:

- `data/mytes/species.json`
- sparse base/species Myte JSON inheritance
- item catalog parity under `data/metadata/items.json` with canonical `visual` data
- canonical `data/map-objects/base.json`
- canonical `data/map-objects/types.json`
- runtime loading from the canonical map object JSON files
- shared runtime normalization path so map object authored data can use `spatial` and `visual` structure
- canonical `data/metadata/actions.json`
- runtime action metadata loading through `js/Myte/Queue/ActionDefinitionRegistry.js`

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

## Phase 3: Map Object Editor Layer

- build schema-aware inspector UI on top of canonical map object JSON
- load preview from normalized editor model
- save edited object definitions back to the canonical JSON files
- keep JS class registrations intact

## Phase 4: Actions and Slot System

- extend `data/metadata/actions.json` and validate it against registered implementations
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
5. Map object authored definitions live in canonical JSON, not JS config tables.
6. Geometry editing is inspector-first: exact numeric fields update preview live.
7. Saving is explicit: live preview plus explicit `Save` to disk.
8. `hitbox`, `selectbox`, and `pickupbox` become explicit editable geometry concepts.
9. `spatial.regions.interaction` is the canonical authored interaction region.
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
