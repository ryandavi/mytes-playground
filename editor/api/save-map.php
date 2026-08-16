<?php
/**
 * save-map.php — writes a patched .tmx back to data/maps/.
 *
 * The wall exporter builds the document client-side, because everything it
 * needs to reason about — the wang set, the neighbour masks, the live cells —
 * already lives in the running game. This endpoint's whole job is to put the
 * result on disk safely: allowlist the target, refuse a stale write, keep a
 * backup, and swap the file atomically.
 *
 * Local-only, like the rest of the editor API (see editor_require_local_access
 * in bootstrap.php). This is a development tool; nothing in the shipped game
 * calls it.
 */

require_once __DIR__ . '/bootstrap.php';

editor_require_method('POST');

const EDITOR_MAP_DIR = 'data/maps';

$body     = editor_request_body();
$mapId    = $body['map']      ?? '';
$xml      = $body['xml']      ?? null;
$baseHash = $body['baseHash'] ?? null;
$force    = $body['force']    ?? false;

if (!is_string($mapId) || !preg_match('/^[A-Za-z0-9_-]+$/', $mapId)) {
    editor_fail(400, 'bad_request', 'Map id must be a bare file name with no path separators.');
}
if (!is_string($xml) || trim($xml) === '') {
    editor_fail(400, 'bad_request', 'Missing or invalid field: xml.');
}

// ── Resolve, allowlisted to maps that already exist ──────────────────────────
//
// The exporter patches a map; it never creates one. Requiring the file to be
// there already means a typo'd id cannot litter data/maps with new documents.
$relative = EDITOR_MAP_DIR . '/' . $mapId . '.tmx';
$absolute = realpath(EDITOR_PROJECT_ROOT . '/' . $relative);
if ($absolute === false) {
    editor_fail(404, 'unknown_map', "No such map: \"$mapId\".");
}
$absolute = str_replace('\\', '/', $absolute);
if (!editor_path_is_within($absolute, str_replace('\\', '/', EDITOR_PROJECT_ROOT) . '/' . EDITOR_MAP_DIR)) {
    editor_fail(400, 'bad_request', 'Map id resolves outside the maps directory.');
}

// ── Conflict check ───────────────────────────────────────────────────────────
//
// Hashed rather than mtime-compared: the client already holds the exact bytes
// it patched, and a hash cannot be fooled by a filesystem whose timestamps are
// coarse or by an editor that rewrites a file without changing its size.
$current = file_get_contents($absolute);
if ($current === false) {
    editor_fail(500, 'read_failed', 'Could not read the map file.');
}
if (!$force) {
    if (!is_string($baseHash) || $baseHash === '') {
        editor_fail(400, 'bad_request', 'baseHash is required unless force is set.');
    }
    if (!hash_equals(hash('sha256', $current), strtolower($baseHash))) {
        editor_fail(409, 'conflict', 'The map has changed on disk since it was loaded. Reload the map, or export with force.');
    }
}

// ── Validate — a broken .tmx must never reach the file ───────────────────────
$previous = libxml_use_internal_errors(true);
$document = simplexml_load_string($xml);
$errors   = libxml_get_errors();
libxml_clear_errors();
libxml_use_internal_errors($previous);

if ($document === false) {
    $first = $errors[0]->message ?? 'unknown parse error';
    editor_fail(422, 'invalid_xml', 'The submitted map is not well-formed XML: ' . trim($first));
}
if ($document->getName() !== 'map') {
    editor_fail(422, 'invalid_map', 'The submitted document root is not a <map> element.');
}
if (count($document->layer) === 0) {
    editor_fail(422, 'invalid_map', 'The submitted map has no tile layers, which is never a valid patch result.');
}

// ── Backup, then atomic write ────────────────────────────────────────────────
$backupPath = editor_backup_file($absolute, 'tmx');
editor_atomic_write_text($absolute, $xml);

editor_json_response(200, [
    'ok'     => true,
    'map'    => $mapId,
    'path'   => $relative,
    'backup' => $backupPath,
    'bytes'  => strlen($xml),
]);
