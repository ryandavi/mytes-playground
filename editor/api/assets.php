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
if (!editor_path_is_within($absoluteDir, EDITOR_PROJECT_ROOT)) {
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
		$resolved = realpath($full);
		if ($resolved === false || !editor_path_is_within($resolved, EDITOR_PROJECT_ROOT)) {
			continue;
		}

		if (is_dir($resolved)) {
			editor_scan_dir($baseDir, $resolved, $depth + 1, $maxDepth, $extPattern, $results);
		} elseif (is_file($resolved)) {
            $ext = strtolower(pathinfo($entry, PATHINFO_EXTENSION));
			if (preg_match('/^(' . $extPattern . ')$/', $ext) && editor_is_supported_image($resolved, $ext)) {
                // Return project-root-relative path with forward slashes.
                $relative = substr($full, strlen(EDITOR_PROJECT_ROOT . DIRECTORY_SEPARATOR));
                $results[] = str_replace('\\', '/', $relative);
            }
        }
    }
}

function editor_is_supported_image(string $path, string $extension): bool
{
	if ($extension === 'svg') {
		$head = file_get_contents($path, false, null, 0, 65536);
		return is_string($head) && preg_match('/<svg\b/i', $head) === 1 && preg_match('/<script\b/i', $head) !== 1;
	}

	$finfo = new finfo(FILEINFO_MIME_TYPE);
	$mime = $finfo->file($path);
	$allowed = [
		'png' => ['image/png'],
		'gif' => ['image/gif'],
		'webp' => ['image/webp'],
	];
	return in_array($mime, $allowed[$extension] ?? [], true);
}
