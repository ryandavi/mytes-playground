# Editor PHP API — Implementation Spec

**Date:** 2026-06-12
**Parent plan:** `docs/EDITOR_PLAN.md` (Save Strategy + Suggested PHP Responsibilities sections)
**Target:** PHP 8.x on XAMPP (Windows host, forward slashes in code). No frameworks, no Composer.

## Context

The content editor frontend lives at `editor/index.php` (Phase 1, read-only, already built). This spec covers the persistence layer it will use in Phase 2: PHP endpoints under `editor/api/` that load, validate, back up, and save the canonical JSON content files.

The frontend is plain JS using `fetch`. The page has `<base href="../">`, so it will call the endpoints as `editor/api/<name>.php` relative to the project root.

## Deliverables

Create exactly these files:

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

## Acceptance Checks

Manual curl checks that must pass (XAMPP docroot `c:/xampp/htdocs`, project at `/genes/chat/neko/`):

1. `curl "http://localhost/genes/chat/neko/editor/api/load.php?file=items"` → `ok:true` with content + mtime.
2. `load.php?file=../user` → 400, no file read.
3. `validate.php` with a duplicated item id → finding `level:error`.
4. Full save round-trip: load items → save unchanged content with correct `baseMtime` → 200, `_backup/items.<timestamp>.json` exists, target file still parses, diff shows only formatting normalization at most.
5. Save with stale `baseMtime` → 409 with current mtime; same request with `force:true` → 200.
6. Saved JSON files use 2-space indent and end with a newline.
7. `assets.php?dir=items` lists `images/items/items.png`.

Also add `data/**/_backup/` to `.gitignore`.
