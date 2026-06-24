# Editor PHP API — Implementation Spec

**Date:** 2026-06-19
**Parent plan:** `docs/EDITOR_PLAN.md` (Save Strategy + Suggested PHP Responsibilities sections)
**Target:** PHP 8.x on XAMPP (Windows host, forward slashes in code). No frameworks, no Composer.
**Status:** Phase 2 complete. PHP API and JS client architecture are implemented. Phase 3 (writable Map Objects) is next.

## Context

The content editor frontend lives at `editor/index.php`. The page has `<base href="../">`, so all API calls and asset paths resolve from the project root.

Phases 1 and 2 are complete. The PHP persistence layer under `editor/api/` is live. The JavaScript client layer (see below) is also complete. Phase 3 will make Map Objects writable using the same patterns.

## PHP API Deliverables ✓ COMPLETE

These files are implemented:

```text
editor/api/
  bootstrap.php   # shared: file registry, helpers, guards (no direct HTTP entry)
  load.php        # GET  — return one canonical file + metadata
  save.php        # POST — validate, backup, atomically write one canonical file
  validate.php    # POST — run validation only, return findings
  assets.php      # GET  — list image assets for sprite pickers
```

## Hard Rules

1. **The client never supplies a file path.** Files are addressed by registry id only. Any path-like input (`/`, `\`, `..`, `.php`) in a file id is rejected with HTTP 400.
2. All responses are JSON with `Content-Type: application/json; charset=utf-8`.
3. Writes are atomic: write to a temp file in the same directory, then `rename()` over the target.
4. Every successful save creates a timestamped backup of the previous file content first.
5. `bootstrap.php` must `exit` early if accessed directly (check `basename($_SERVER['SCRIPT_FILENAME'])`).
6. No PHP warnings/notices may leak into output — set a JSON error handler.

## File Registry (in bootstrap.php)

```php
const EDITOR_FILES = [
    'mytes.base'            => 'data/mytes/myte.json',
    'mytes.species-catalog' => 'data/mytes/species.json',
    // species definition files are registered dynamically: any id of the form
    // 'mytes.species.<speciesId>' maps to data/mytes/<speciesId>.json ONLY if
    // <speciesId> matches /^[a-z][a-z0-9_-]*$/ AND appears in species.json's
    // species[].definitionFile list (load species.json server-side to check).
    'map-objects.base'      => 'data/map-objects/base.json',
    'map-objects.types'     => 'data/map-objects/types.json',
    'items'                 => 'data/metadata/items.json',
    'actions'               => 'data/metadata/actions.json',
    'buffs'                 => 'data/metadata/buffs.json',
    'zones'                 => 'data/metadata/zones.json',
    'environment-presets'   => 'data/metadata/environment-presets.json',
];
```

Resolve to absolute paths with `realpath(__DIR__ . '/../../' . $relativePath)` and verify the result is inside the project root (`realpath(__DIR__ . '/../../')`). Reject otherwise.

## Shared Helpers (bootstrap.php)

- `editor_json_response(int $status, array $payload): never` — sets status code + header, echoes JSON (`JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE`), exits.
- `editor_fail(int $status, string $code, string $message, array $extra = []): never` — error envelope (shape below).
- `editor_resolve_file(string $fileId): array` — returns `['id' => ..., 'relative' => ..., 'absolute' => ...]` or fails 400/404.
- `editor_read_json(string $absolutePath): array` — reads + `json_decode(..., true)`; fails 500 with code `malformed_json` if undecodable (include `json_last_error_msg()`).
- `editor_request_body(): array` — reads `php://input`, requires valid JSON object, fails 400 otherwise. Enforce a 2 MB size cap (413 if over).
- `editor_require_method(string $method): void` — 405 with `Allow` header on mismatch.

### Response envelopes

Success: `{ "ok": true, ...payload }`
Error:   `{ "ok": false, "error": { "code": "<machine_code>", "message": "<human text>" }, ...extra }`

Machine codes used below: `bad_request`, `unknown_file`, `malformed_json`, `validation_failed`, `conflict`, `write_failed`, `method_not_allowed`, `payload_too_large`.

## load.php

`GET editor/api/load.php?file=<fileId>`

Response 200:

```json
{
  "ok": true,
  "file": "items",
  "path": "data/metadata/items.json",
  "mtime": 1765500000,
  "content": { }
}
```

`mtime` is the file's modification unix time — the client echoes it back on save for conflict detection. 404 + `unknown_file` for unregistered ids.

## save.php

`POST editor/api/save.php` with body:

```json
{
  "file": "items",
  "baseMtime": 1765500000,
  "content": { },
  "force": false
}
```

Pipeline (in order, stop at first failure):

1. Method/body guards.
2. Resolve file id.
3. **Conflict check:** if the target exists and `filemtime() !== baseMtime`, fail 409 `conflict` with current `mtime` in extras — unless `force === true`. (`baseMtime` may be `null` only when the file does not exist yet; missing `baseMtime` on an existing file is a 400.)
4. **Validate** `content` with the same rules as validate.php. On findings with level `error`, fail 422 `validation_failed` with the findings array (shape below). `force` does **not** bypass validation errors — it only bypasses the mtime conflict check.
5. **Backup:** if the target exists, copy it to `<dir>/_backup/<basename>.<YYYY-MM-DDTHH-mm-ss>.json` (create `_backup/` as needed). After writing, prune oldest backups beyond the 20 most recent for that basename.
6. **Write atomically:** encode with `JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE`, then post-process the pretty-printed string to use **2-space indentation** (PHP emits 4 spaces; do a regex replace on leading indent groups) and ensure a trailing newline. Write to `<target>.tmp.<random>` in the same directory, `rename()` over the target. On any I/O failure, clean up the temp file and fail 500 `write_failed`.
7. Respond 200 with new `mtime`, `path`, `backup` (relative backup path or `null`), and `warnings` (non-error validation findings).

## validate.php

`POST editor/api/validate.php` with body `{ "file": "<fileId>", "content": { ... } }`.
Always responds 200 (validation findings are data, not transport errors):

```json
{ "ok": true, "file": "items", "findings": [
    { "level": "error", "path": "items[3].id", "message": "Duplicate id \"apple\"." }
] }
```

`level` is `"error"` or `"warning"`. `path` is a human-readable JSON path string.

### Validation rules (shared function in bootstrap.php, keyed by file id)

Generic (all files):
- root must be a JSON object → error
- `schemaVersion` must be present and a positive integer → error
- if the file exists on disk and the incoming `schemaVersion` is **lower** than the on-disk one → error

Per-domain (match on file id; species files use the `mytes.species.*` rules):

- **items**: `items` must be an array; every entry needs non-empty string `id` (pattern `/^[a-z][a-z0-9_]*$/`); ids unique across `id` + all `aliases`; every entry needs `visual.sprite` with integer `col`/`row` ≥ 0; catalog-level `visual.spriteSheet.url` non-empty string; duplicate `(col,row)` cells → warning.
- **actions**: `actions` array; unique ids; each action requires `queue` object with string `implementationClass` (warning if missing); `effects` values must be numbers; `purposeOverrides` keys must be non-empty strings.
- **buffs**: `buffs` array; unique ids; `kind` must be `"buff"` or `"debuff"`; `triggers.actionComplete.actionIds`, if present, must be an array of strings (cross-file reference checks are a warning: load actions.json and warn on unknown action ids).
- **zones**: `zones` array; unique ids; `effects` values numbers.
- **environment-presets**: `presets` array; unique ids.
- **mytes.base / mytes.species.***: if `spatial.regions` present, every region needs `type` (currently `"box"`), numeric `x`, `y`, `width` > 0, `height` > 0 → error; unknown region `type` → warning; `visual.spriteSets`, if present, must be an object whose values are arrays.
- **mytes.species-catalog**: `species` array; unique ids; `definitionFile` must match `/^[a-z][a-z0-9_-]*\.json$/`; `defaultSpeciesId` must reference a listed, enabled species.
- **map-objects.base / map-objects.types**: for types — every value (except `schemaVersion`) must be an object; warn when `slotsByFacing` slot entries lack `id` or `restPosition`; error when `visual.states` is present but not an array or `visual.defaultState` is not in `visual.states`.

Keep each rule small; collect all findings rather than stopping at the first.

## assets.php

`GET editor/api/assets.php?dir=<key>` where `<key>` is one of a fixed allowlist (again: ids, not paths):

```php
const EDITOR_ASSET_DIRS = [
    'items'       => 'images/items',
    'map-objects' => 'images/MapObjects',
    'mytes'       => 'images',          // sprite sheets live in images/<species>/
];
```

Recursively list (max depth 2) files with extensions `png|webp|gif|svg`, returning project-root-relative paths sorted alphabetically:

```json
{ "ok": true, "dir": "items", "assets": ["images/items/items.png"] }
```

Unknown key → 404 `unknown_file`. No file contents, no metadata beyond the path list.

## Non-Goals (do not build)

- No authentication (local dev tool).
- No write endpoints for assets/images.
- No PHP-side merge/inheritance logic — clients send complete authored file content; PHP validates and persists only.
- No deletion endpoint.

## Acceptance Checks ✓ VERIFIED

Manual curl checks (XAMPP docroot `c:/xampp/htdocs`, project at `/genes/chat/neko/`):

1. `curl "http://localhost/genes/chat/neko/editor/api/load.php?file=items"` → `ok:true` with content + mtime.
2. `load.php?file=../user` → 400, no file read.
3. `validate.php` with a duplicated item id → finding `level:error`.
4. Full save round-trip: load items → save unchanged content with correct `baseMtime` → 200, `_backup/items.<timestamp>.json` exists, target file still parses, diff shows only formatting normalization at most.
5. Save with stale `baseMtime` → 409 with current mtime; same request with `force:true` → 200.
6. Saved JSON files use 2-space indent and end with a newline.
7. `assets.php?dir=items` lists `images/items/items.png`.

`data/**/_backup/` is in `.gitignore`.

---

## JavaScript Client Architecture ✓ COMPLETE

This section documents the JS layer built in Phases 1–2. All files live under `editor/js/` and load as plain global-class scripts (no modules) after the shared runtime scripts in `editor/index.php`.

### Load order (editor/index.php)

```text
Shared runtime (game scripts — never fork):
  js/Engine/Config/AppConfig.js
  js/Engine/Config/SiteConfig.js
  js/Utility/Utility.js
  js/Engine/SpriteAnimator.js
  js/Myte/MyteDefinitions.js          ← provides MyteDefinitionRegistry (deepMerge, getSpatialValue, getSpriteSheetConfig)

Editor layer:
  editor/js/EditorApi.js
  editor/js/EditorDocument.js
  editor/js/EditorStore.js
  editor/js/EditorRouter.js
  editor/js/panels/ListRailPanel.js
  editor/js/panels/InspectorPanel.js
  editor/js/preview/PreviewControls.js
  editor/js/preview/MytePreview.js
  editor/js/preview/MapObjectPreview.js
  editor/js/preview/ItemPreview.js
  editor/js/preview/SummaryPreview.js
  editor/js/EditorApp.js              ← entry point, instantiated on DOMContentLoaded
```

### EditorApi

Thin `fetch` wrapper for the PHP endpoints. Throws `EditorApiError(status, code, message, extra)` on any non-`ok` response.

```js
EditorApi.load(fileId)                          // GET  load.php?file=<fileId>&v=<cache-bust>
EditorApi.save(fileId, content, baseMtime, force) // POST save.php
EditorApi.validate(fileId, content)              // POST validate.php
EditorApi.assets(dirKey)                         // GET  assets.php?dir=<key>
```

`save()` passes `baseMtime` for conflict detection; `force=true` bypasses the mtime check but not validation errors.

### EditorDocument

Writable wrapper for one canonical file. Constructed from a `load.php` payload.

Key contract:

- `content` — live working copy (mutated in place by `setAt/deleteAt`)
- `savedContent` — snapshot at load time or last `markSaved(mtime)`; `isDirty` compares them via `deepEqual`
- `revert()` restores `content` from `savedContent`
- `markSaved(mtime)` snapshots `content → savedContent` and updates the mtime
- `setAt(path, value)` / `deleteAt(path, value)` — path is `string|number[]`; `deleteAt` prunes empty `{}` parents upward to prevent hollow shells in sparse files
- `static getAtPath(root, path)` — used by EditorStore to read base values for override comparison
- `static deepEqual(a, b)` — structural equality used for dirty checking and sparse-override decisions

### EditorStore

Loads all domains and owns writable records. Constructed once; `loadAll()` called by `EditorApp.init()`.

**Domain shape:**

```js
{
  id: string,           // e.g. 'mytes', 'items', 'map-objects', 'actions'
  label: string,
  previewType: string,  // 'myte' | 'mapObject' | 'item' | 'summary'
  writable: boolean,
  supportsItemOps: boolean,  // true for items (New/Duplicate/Delete)
  schemaVersion: number|null,
  sourceFile: string,
  records: Record[],
  meta: object          // domain-level data (items: { visual: catalogVisual })
}
```

**Record shape:**

```js
{
  id: string,
  label: string,
  hint: string,         // secondary label in the rail (type, category, 'essential', etc.)
  fileId: string,       // which EditorDocument this record belongs to
  basePath: (string|number)[],  // path within the document to this record's data
  base: object|null,    // for layered records: the parent layer (e.g. myte.json content)
  override: object|null, // for layered records: this record's own document slice
  merged: object,       // effective combined value (what the inspector and preview use)
  layered: boolean,     // true if override/base inheritance applies
  sourceFile: string
}
```

**Layered records** (Mytes, Map Objects): edits go to `doc.setAt([...basePath, ...path], value)`. If the new value equals the base value at that path, `deleteAt` is called instead to remove the override (sparse principle). `applyEdit` returns `{ source: 'override'|'base', effectiveValue }` so the inspector can update badges live.

**Non-layered records** (Items): edits go directly to `doc.setAt([...basePath, ...path], value)`.

Key methods:

```js
store.loadAll()                          // → Promise; sets store.domains
store.getDomain(domainId)                // → domain or null
store.getRecord(domainId, recordId)      // → record or null
store.applyEdit(domain, record, path, value)  // → { source, effectiveValue }
store.resetOverride(domain, record, path)     // removes override at path
store.rebuildDomain(domainId)                 // re-derives records from docs (used after revert)
store.dirtyDocuments(domain?)                 // → EditorDocument[] that are dirty
store.isDomainDirty(domain)                   // → boolean
// Items only:
store.addItem(domain)                    // → new id
store.duplicateItem(domain, recordId)    // → new id
store.deleteItem(domain, recordId)
```

**Domain loaders:**

| Domain | Documents loaded | Writable | supportsItemOps |
|--------|-----------------|---------|----------------|
| mytes | `mytes.base`, `mytes.species-catalog`, `mytes.species.<id>` per enabled species | true | false |
| map-objects | `map-objects.base`, `map-objects.types` | false | false |
| items | `items` | true | true |
| actions | `actions` | false | false |
| buffs | `buffs` | false | false |
| zones | `zones` | false | false |
| environment-presets | `environment-presets` | false | false |

### EditorRouter

Hash routing: `#/<domainId>/<recordId>`. Navigation always assigns `location.hash` from JS — never `<a href="#...">` since `<base href="../">` would resolve fragments against the project root and navigate away.

```js
router.start()                     // wires hashchange + emits initial route
router.navigate(domainId, recordId?) // sets location.hash
router.parse()                     // → { domainId, recordId } from current hash
router.emit()                      // fires onChange with parsed current route
```

`EditorApp.renderRoute` corrects the hash to the canonical form via `history.replaceState` using an absolute `URL` object (not a relative path, because `<base href>` would mangle it).

### EditorApp

Top-level controller. One instance per page load.

Responsibilities:

- Calls `store.loadAll()`, hides the loading overlay on success
- Builds tab bar, header Save/Revert buttons, rail New/Duplicate/Delete buttons, findings bar
- `renderRoute(domainId, recordId)` — resolves domain/record, updates tabs/rail/inspector/preview/status
- `handleEdit(domain, record, path, value)` — delegates to `store.applyEdit`, refreshes preview, updates dirty UI; syncs rail label when `id`/`label` edited
- `handleReset(domain, record, path)` — removes override, refreshes inspector + preview
- `saveCurrentDomain()` — iterates dirty documents, calls `saveDocument(doc)` per file; shows findings on `validation_failed`; updates UI
- `saveDocument(doc)` — calls `EditorApi.save`; on 409 `conflict` prompts user for force-overwrite
- `revertCurrentDomain()` — confirms, calls `doc.revert()` + `store.rebuildDomain`, re-renders
- `updateDirtyUI()` — enables/disables Save/Revert; marks dirty tabs with `is-dirty`; shows "● Unsaved changes" in status bar
- `beforeunload` guard fires when any document is dirty

### InspectorPanel

Renders the `record.merged` object as a collapsible tree. Editable when `domain.writable`. For layered records, each leaf shows a badge (`base` / `override`) with a reset button for overridden values.

Leaf detection: primitive values and arrays whose elements are all primitives or primitive-element arrays (frame lists, tag arrays) render inline rather than as sub-trees.

Input types: `boolean → checkbox`, `number → <input type=number step=any>`, `array → JSON text input`, `string → text input`. Number inputs emit on `input` (live); array inputs emit on `change` (blur).

Badge resolution: walks `record.override` along `path`; any defined value at any depth → `override`, otherwise → `base`.

### Preview classes

All previews implement `{ mount(), refresh(record), destroy() }`.

**`MytePreview`** — drives `SpriteAnimator` over `visual.spriteSets`. Controls: sprite-set select, play/pause/step, zoom. Spatial overlays (regions + anchors) use `MyteDefinitionRegistry.getSpatialValue(definition, 'regions'|'anchors', id, direction)` for direction-aware resolution. `refresh()` preserves playback/zoom/overlay state and only calls `animator.setFrames` when frame data actually changed.

**`MapObjectPreview`** — read-only. Variant and facing selectors; variant config merged with `EditorStore.mergeLayers`. Region resolution: `spatial.regions.<id>` first, then legacy key paths (`physics.collider`, `interactionRegion`, `selectbox`, `hitbox`, `pickupbox`). Slot rest-point markers from `slotsByFacing[facing]`. Light radius circle from `lighting.radius`.

**`ItemPreview`** — magnified (5×) atlas cell + full atlas view. Click on atlas cell navigates to that item if it matches a record's `(col, row)`. Catalog record (`_catalog`) shows atlas only.

**`SummaryPreview`** — summary card for non-visual domains. Shows icon, label, description, category/kind/tags chips, and a key-value grid of scalar fields.

**`PreviewControls`** — shared builders. `EditorOverlayColors` palette:

| Key | Color |
|-----|-------|
| `collider` | `#e2574c` |
| `interaction` | `#4285f4` |
| `select` | `#34a853` |
| `hit` | `#c542f4` |
| `pickup` | `#00b5c9` |
| `anchor` | `#f4b400` |
| `slot` | `#ff7b00` |
| `light` | `#f4b400` |
| `shadow` | `#555555` |

---

## Phase 3: Writable Map Objects

### Goal

Make the Map Objects domain writable. Both `map-objects.base` and `map-objects.types` are already loadable and mergeable via the existing PHP API. Phase 3 adds write support for the types file and wires the inspector for map object records.

### What stays the same

- PHP API is complete — no new endpoints needed.
- `bootstrap.php` validation already handles `map-objects.base` and `map-objects.types`.
- `MapObjectPreview` is already built (read-only).
- `EditorStore.loadMapObjects` already loads both files and produces layered records.

### Changes required

**EditorStore:**

- Set `writable: true` on the map-objects domain.
- `applyEdit` for map-objects records must write to the correct path inside `map-objects.types`. Each record's `basePath` is already `[typeId]`, so `doc.setAt([typeId, ...path], value)` is correct for type-level fields.
- `recomputeLayeredRecords` currently handles mytes only; extend it to also recompute map-object records when the base file is edited.
- Add `rebuildMapObjectRecords(domain)` for use after revert, mirroring `rebuildMyteRecords`.
- `rebuildDomain` must call `rebuildMapObjectRecords` for `'map-objects'`.

**Variant and direction editing (Phase 3 scope):**

Map objects have a two-level override structure: `base → type → variant`. The editor should let users edit the type layer (the main record) and individual variant configs stored under `variantConfigs[variantId]`. Approach:

- The type record's `basePath` is `[typeId]`.
- Variant sub-records are synthetic: `basePath` is `[typeId, 'variantConfigs', variantId]`, `base` is the merged type, `override` is `variantConfigs[variantId]`.
- Editing a variant field writes to `[typeId, 'variantConfigs', variantId, ...path]`.
- Variant sub-records should be accessible from the MapObjectPreview variant selector, not as top-level rail entries (variant count would balloon the list).

Implementation note: the `MapObjectPreview` variant selector already handles variant merging via `EditorStore.mergeLayers(baseConfig, variantConfig)`. When writable, selecting a variant should open the variant's sub-record in the inspector alongside the preview.

**InspectorPanel:** no changes needed — it already handles layered records generically.

**EditorApp:**

- `createItem` / `duplicateItem` / `deleteItem` must be extended (or a separate `supportsTypeOps` flag added) to support adding/removing type entries from `map-objects.types`. Types use object keys, not arrays, so the helpers differ from items.
- For Phase 3, `supportsItemOps` can remain false; New/Duplicate/Delete for map-object types is Phase 5 scope.

**MapObjectPreview writable enhancements (Phase 3):**

- When the domain becomes writable, `refresh(record)` needs to pick up changes to `size`, `visual`, `slotsByFacing`, region configs, and lighting as the inspector edits them.
- The preview already calls `refresh(record)` from `EditorApp.refreshPreview` on every edit — no wiring change needed.
- Consider adding a `spatial.regions` inspector mode to the map object preview that mirrors the Myte overlay system. Currently map objects use legacy keys; Phase 3 is a good time to enforce the canonical `spatial.regions` structure in the inspector while keeping the legacy lookup in `MapObjectPreview.resolveRegion` as a fallback for old data.

### Validation additions for Phase 3

Add to `editor_validate_map_objects_types` in `bootstrap.php`:

- Warn when `variantConfigs` entry ids appear in the list but `visual.states` does not include the variant id as a valid state — likely an orphaned variant.
- Error when `actionConfigs` keys reference action ids that don't exist in `data/metadata/actions.json` (load actions.json server-side, same pattern as buffs validate against actions).
- Warn when `ai.affordances[].actionId` references an unknown action id.

### Save behavior

No changes to the save pipeline. `map-objects.types` is already in `EDITOR_FILES` in `bootstrap.php`. The client sends the full file content; PHP validates, backs up, and writes atomically.

The `map-objects.base` file should remain read-only in the editor for now — base defaults rarely change and editing them has wide impact. Mark it writable only in Phase 5 once the inspector has proper diff/compare tooling.

### Phase 3 acceptance checks

1. Select a map-object type → inspector shows fields as editable inputs.
2. Edit `size.width` on a type → preview redraws at the new size immediately.
3. Edit a field that matches the base value → override is removed (sparse save).
4. Save → `data/map-objects/types.json` is updated; `_backup/types.<timestamp>.json` exists.
5. Revert → changes discarded; inspector shows base-inherited values again.
6. Edit a variant config field → saves to `variantConfigs[variantId].<field>` in the types file.
