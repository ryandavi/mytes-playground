# Neko — Agent & Coding Standards

## Project Overview

**Neko** is a browser-based virtual pet simulator. Players own and interact with creatures called **Mytes** — little pet viruses that live on your computer. Mytes have autonomous AI, stats, and behaviors. They inhabit interactive 2D tile maps and can interact with world objects (fountains, chests, plants, etc.), items, and each other.

**Stack:** Vanilla JS (ES6 classes, no framework), PHP (cache-busting entry point), SCSS → CSS, Tone.js (audio), Tiled (.tmx maps).

**Entry point:** `index.html` — loads the generated `js/bundle.js`, whose order comes from `scripts/script-manifest.json`.

No AI attributions. No being including on git commits.

---

## UI Aesthetic

The UI is a love letter to personal computing from **Windows 98 through Windows XP**. Think system trays, raised button borders, the Luna color palette, chunky pixel-adjacent UI, and the warmth of tan/beige surfaces. Early computing UI, not modern flat design.

The original *Neko* (the cat that chases your cursor) was an early inspiration, but Mytes has grown into its own thing. Mytes are framed as viruses — charming, mischievous digital organisms living inside your machine.

**Key aesthetic signals:**
- Warm off-white / tan surfaces (`--button-mid: #ece9d8`, `--surface-app`)
- Blue title bar accent (`--header-mid: #0166fb`, `--header-dark: #0631d6`)
- Raised/inset beveled borders — use `--border-width: 5px` for the characteristic chunky look
- Pixel-level shadow offsets (`--shadow: drop-shadow(5px 5px 0 ...)`)
- Near-black text (`--black: rgb(25, 24, 20)`)
- Minimal radius — `--radius-xs: 1px` to `--radius-sm: 4px` is the range, not rounded cards
- No gradients. No blur. No glassmorphism. No drop shadows as decoration.
- Functional iconography — small, clear, system-icon-style glyphs

---

## Project Architecture

### Directory Layout

```
neko/
├── js/
│   ├── Engine/         # Core game loop, audio, events, registries, config
│   ├── Myte/           # Creature class, AI, stats, movement, actions, queue
│   │   └── Queue/      # Action system — ActionManager, ActionRegistry, Actions/
│   ├── Map/            # World state, rendering, camera, pathfinding, map objects
│   ├── UI/             # All interface components and managers
│   ├── Input/          # InputSystem, click/drag/rub components
│   ├── User/           # Player profile, inventory, settings
│   ├── Effects/        # ParticleSystem
│   ├── Container/      # ContainerManager (owns mytes + world), input handling
│   └── Utility/        # Shared helpers, rect utils
├── css/                # SCSS source + compiled CSS output
├── data/               # JSON — actions, items, buffs, zones, species, maps
├── images/             # Sprites, tilesets, cursors, icons
├── docs/               # Planning documents
├── scripts/            # Build/validation scripts
└── tiled/              # Tiled map editor source files
```

### Key Systems

| System | Main Files |
|---|---|
| Game loop | `js/Engine/Core.js` |
| App config (infra) | `js/Engine/Config/AppConfig.js` |
| Sim config (tuning) | `js/Engine/Config/SiteConfig.js` |
| Events | `js/Engine/EventManager.js` |
| Myte creature | `js/Myte/Myte.js`, `MyteAI.js`, `MyteStats.js` |
| Action queue | `js/Myte/Queue/MyteQueue.js`, `ActionManager.js`, `Actions/` |
| Map & objects | `js/Map/GameMap.js`, `MapObjects/` |
| Pathfinding | `js/Map/Grid/AStarPathfinder.js`, `GameMapGrid.js` |
| Camera | `js/Map/Camera.js` |
| Input | `js/Input/InputSystem.js` |
| UI | `js/UI/UserInterface.js`, components under `js/UI/` |
| Audio | `js/Engine/SoundManager.js`, `Audio/` |
| Registries | `ItemRegistry.js`, `BuffRegistry.js`, `ActionDefinitionRegistry.js` |

### Config Files (single source of truth for all tunable values)

**`js/Engine/Config/AppConfig.js`** — infrastructure: engine tick rate (20Hz), DOM IDs, file paths, loading stage weights, audio boot defaults.

**`js/Engine/Config/SiteConfig.js`** — all simulation tuning: stat decay/regen rates, AI decision timing and radii, camera behavior, inventory, interaction gesture timings, game clock, zone effects. Always look here before hard-coding a number anywhere.

### Data Files (`data/`)

- `metadata/actions.json` — all action definitions (priority, effects, AI weights, traits)
- `metadata/items.json` — item catalog
- `metadata/buffs.json` — status effects
- `metadata/zones.json` — world zone definitions
- `mytes/species.json` — species registry
- `mytes/snail.json`, `worm.json` — per-species definitions (physics, sprites, animations, behaviors)
- `mytes/myte.json` — base myte definition template
- `maps/*.tmx` — Tiled map files (Outside, House, Forest, FieldTest)
- `map-objects/types.json` — map object type definitions with physics, interaction, rendering

### Design Tokens (`css/core/_tokens.scss`)

All design values are CSS custom properties. Never hard-code values that exist here.

**Spacing:** `--space-2xs` (2px) → `--space-3xl` (24px). Semantic aliases: `--padding`, `--gap`, `--padding-outer`.

**Radius:** `--radius-xs` (1px), `--radius-sm` (4px), `--radius-md` (8px), `--radius-round` (999px). Aliases: `--border-radius`, `--border-radius-outer`, `--border-radius-inner`.

**Surfaces:** `--surface-app`, `--surface-window`, `--surface-ui-raised`, `--surface-ui-inset`, `--surface-tooltip` (#ffffe1), `--surface-stage`.

**Accent colors:** `--header-light/mid/dark` (blue title bar), `--color-danger`, `--state-info/success/warning/error-accent`.

**Text:** `--text-base`, `--text-muted`, `--text-subtle`, `--text-on-accent`.

**Motion:** `--motion-instant` through `--motion-slower`, `--ease-ui`, `--ease-emphasis`.

**Z-index:** `--z-cursor`, `--z-overlay`, `--z-toast`, `--z-drag`, `--z-loading`, `--z-debug`.

**Sizes:** `--size-shell-width` (635px), `--size-stage-height` (500px), `--size-sidebar-width` (250px), `--size-myte` (192px), `--size-item` (48px).

### Architectural Patterns

- **Singleton** — `Core`, `InputSystem`, `EventManager`
- **Component / Mixin** — `Entity` base with pluggable controllers
- **Registry** — `ActionManager`, `ItemRegistry`, `BuffRegistry`, `MyteDefinitionRegistry`
- **State Machine** — Myte behavior states via `StateMachine.js`
- **Action Queue** — Sequential actions queued and executed by `ActionManager`
- **Observer** — `EventManager` for decoupled system communication
- **Data-driven** — behavior defined in JSON (`data/`) and config (`AppConfig`/`SiteConfig`), not hard-coded logic

---

## Coding Standards

### General

- **Clean, readable code.** Clarity over cleverness.
- **Single source of truth.** One canonical place for every piece of data or logic. No duplication.
- **Reuse first.** Before writing new code, check if an existing utility, base class, registry, or helper already covers the need.
- **Consistent data structures.** Use established patterns — if similar data exists elsewhere, match its shape.
- **Data-driven.** Logic should read from config and data files, not repeat constants inline. Tunable values belong in `SiteConfig.js` or the appropriate JSON file.
- **Constants over magic values.** Use named constants, config keys, or registry IDs everywhere. No bare strings or numbers for IDs, action types, item categories, etc.
- **Forward thinking.** Design with extensibility in mind. New systems should compose cleanly with existing patterns (registries, queues, components). Avoid architectural dead ends.
- **No unnecessary comments.** Only comment when the *why* is non-obvious — a hidden constraint, a subtle invariant, a workaround. Don't describe what the code does.

### CSS / SCSS

- **SCSS source only.** Never edit `.css` files directly. All changes go in the SCSS source files under `css/`.
- **Compile command:** `npx sass css/style.scss css/style.css --no-source-map`
- **Nested structure mirrors HTML hierarchy.** SCSS nesting should reflect the DOM structure it styles.
- **CSS custom properties, not SCSS variables.** Use `var(--token)` from `_tokens.scss` for all design values. SCSS variables are for build-time concerns only.
- **Generic classes do the heavy lifting.** Design reusable utility/component classes first. Add specific overrides only when a generic truly can't cover the case.
- **Work within the design system.** Before adding new styles, check `css/core/_tokens.scss` and existing components. Reuse tokens and classes. If new styles are close enough to existing ones, they should share a rule.
- **Identify reuse opportunities.** If something looks like another thing, it should use the same styles. Consistent design is good design.
- **No AI design tropes.** No gratuitous gradients, glow effects, glassmorphism, or generic "modern UI" patterns. Stay true to the Windows 98–XP aesthetic.

### JavaScript

- **No framework.** Vanilla ES6 classes and modules loaded via `<script>` tags.
- **Follow established patterns.** New systems should match the architecture of adjacent systems (registry, component, queue entry, etc.).
- **Data-driven where possible.** Behavior defined in JSON (`data/`) and config rather than hard-coded logic.
- **Constants and config, not magic values.** All tunable numbers live in `SiteConfig.js`. All IDs and string keys are registered constants or data-file keys.
- **Avoid broad side effects.** Methods should do one thing. Mutations to shared state should be intentional and explicit.
- **Time sources.** Use `SimClock.now()` for all gameplay timing — cooldowns, state aging, regrowth, physics timers — it pauses when the tab is hidden. Wall-clock (`Date.now()` / `performance.now()`) is only for input gestures, UI/loading timing, audio scheduling, and cache-busting URLs. Never compare timestamps from different clocks.

---

## Build

```bash
# Compile SCSS
npx sass css/style.scss css/style.css --no-source-map

# Rebuild the browser bundle after JS changes
node scripts/build-manifest.js

# Watch SCSS
npm run sass:watch

# Validate content data
npm run validate:content
```

## Browser Support Baseline

Modern evergreen browsers only (Chrome/Edge/Firefox/Safari, last ~2 years). The codebase freely uses optional chaining, nullish coalescing, class fields, and `ResizeObserver` — effectively **ES2021+**. Do not add polyfills, transpilation, or compatibility workarounds for anything older; compatibility beyond this baseline is not promised and "fixes" for it will be reverted.
