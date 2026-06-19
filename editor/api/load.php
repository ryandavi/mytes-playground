<?php
require_once __DIR__ . '/bootstrap.php';

editor_require_method('GET');

$fileId = trim($_GET['file'] ?? '');
if ($fileId === '') {
    editor_fail(400, 'bad_request', 'Missing required query parameter: file.');
}

$resolved = editor_resolve_file($fileId);
$absolute = $resolved['absolute'];

if (!file_exists($absolute)) {
    editor_fail(404, 'unknown_file', "File not found on disk: {$resolved['relative']}");
}

$content = editor_read_json($absolute);

editor_json_response(200, [
    'ok'      => true,
    'file'    => $resolved['id'],
    'path'    => $resolved['relative'],
    'mtime'   => filemtime($absolute),
    'content' => $content,
]);
