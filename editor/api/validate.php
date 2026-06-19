<?php
require_once __DIR__ . '/bootstrap.php';

editor_require_method('POST');

$body    = editor_request_body();
$fileId  = $body['file']    ?? '';
$content = $body['content'] ?? null;

if (!is_string($fileId) || trim($fileId) === '') {
    editor_fail(400, 'bad_request', 'Missing required field: file.');
}
if (!is_array($content)) {
    editor_fail(400, 'bad_request', 'Missing or invalid field: content must be a JSON object.');
}

// Resolve file id for validation context (no disk access required).
editor_resolve_file($fileId);

$findings = editor_validate($fileId, $content);

editor_json_response(200, [
    'ok'       => true,
    'file'     => $fileId,
    'findings' => $findings,
]);
