<?php
require_once __DIR__ . '/bootstrap.php';

editor_require_method('GET');

$dirKey = trim($_GET['dir'] ?? '');
if ($dirKey === '') {
    editor_fail(400, 'bad_request', 'Missing required query parameter: dir.');
}

if (!isset(EDITOR_ASSET_DIRS[$dirKey])) {
    editor_fail(404, 'unknown_file', "Unknown asset dir key: \"$dirKey\".");
}

$relativeDir = EDITOR_ASSET_DIRS[$dirKey];
$absoluteDir = realpath(EDITOR_PROJECT_ROOT . '/' . $relativeDir);

if ($absoluteDir === false || !is_dir($absoluteDir)) {
    editor_json_response(200, ['ok' => true, 'dir' => $dirKey, 'assets' => []]);
}

// Guard: resolved dir must be inside project root.
if (strpos($absoluteDir . DIRECTORY_SEPARATOR, EDITOR_PROJECT_ROOT . DIRECTORY_SEPARATOR) !== 0) {
    editor_fail(400, 'bad_request', 'Asset dir resolves outside the project root.');
}

$assets = [];
$extensions = 'png|webp|gif|svg';
editor_scan_dir($absoluteDir, $absoluteDir, 0, 2, $extensions, $assets);
sort($assets);

editor_json_response(200, [
    'ok'     => true,
    'dir'    => $dirKey,
    'assets' => $assets,
]);

function editor_scan_dir(string $baseDir, string $currentDir, int $depth, int $maxDepth, string $extPattern, array &$results): void
{
    if ($depth > $maxDepth) {
        return;
    }

    $entries = scandir($currentDir);
    if ($entries === false) {
        return;
    }

    foreach ($entries as $entry) {
        if ($entry === '.' || $entry === '..') {
            continue;
        }

        $full = $currentDir . DIRECTORY_SEPARATOR . $entry;

        if (is_dir($full)) {
            editor_scan_dir($baseDir, $full, $depth + 1, $maxDepth, $extPattern, $results);
        } elseif (is_file($full)) {
            $ext = strtolower(pathinfo($entry, PATHINFO_EXTENSION));
            if (preg_match('/^(' . $extPattern . ')$/', $ext)) {
                // Return project-root-relative path with forward slashes.
                $relative = substr($full, strlen(EDITOR_PROJECT_ROOT . DIRECTORY_SEPARATOR));
                $results[] = str_replace('\\', '/', $relative);
            }
        }
    }
}
