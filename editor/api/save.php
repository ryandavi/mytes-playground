<?php
require_once __DIR__ . '/bootstrap.php';

editor_require_method('POST');

$body      = editor_request_body();
$fileId    = $body['file']      ?? '';
$baseMtime = $body['baseMtime'] ?? null;
$content   = $body['content']   ?? null;
$force     = $body['force']     ?? false;

if (!is_string($fileId) || trim($fileId) === '') {
    editor_fail(400, 'bad_request', 'Missing required field: file.');
}
if (!is_array($content) || array_is_list($content)) {
    editor_fail(400, 'bad_request', 'Missing or invalid field: content must be a JSON object.');
}

$resolved = editor_resolve_file($fileId);
$absolute = $resolved['absolute'];

// ── Conflict check ───────────────────────────────────────────────────────────
if (file_exists($absolute)) {
    if ($baseMtime === null) {
        editor_fail(400, 'bad_request', 'baseMtime is required when the file already exists.');
    }
    $currentMtime = filemtime($absolute);
    if (!$force && $currentMtime !== (int)$baseMtime) {
        editor_fail(409, 'conflict', 'File has been modified since it was loaded.', ['mtime' => $currentMtime]);
    }
}

// ── Validate — force does NOT bypass validation errors ───────────────────────
$findings = editor_validate($fileId, $content);
$errors   = array_filter($findings, fn($f) => $f['level'] === 'error');
if (count($errors) > 0) {
    editor_fail(422, 'validation_failed', 'Content failed validation.', ['findings' => array_values($findings)]);
}
$warnings = array_values(array_filter($findings, fn($f) => $f['level'] === 'warning'));

// ── Backup ───────────────────────────────────────────────────────────────────
$backupPath = editor_backup_file($absolute);

// ── Atomic write ─────────────────────────────────────────────────────────────
editor_atomic_write($absolute, $content);

editor_json_response(200, [
    'ok'       => true,
    'file'     => $resolved['id'],
    'path'     => $resolved['relative'],
    'mtime'    => filemtime($absolute),
    'backup'   => $backupPath,
    'warnings' => $warnings,
]);
