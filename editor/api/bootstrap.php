<?php
// Guard: this file must only be included, never accessed directly.
if (basename($_SERVER['SCRIPT_FILENAME']) === basename(__FILE__)) {
    http_response_code(403);
    exit('Forbidden');
}

// Route all errors to a JSON response so nothing leaks as HTML.
set_error_handler(function (int $errno, string $errstr, string $errfile, int $errline): bool {
	error_log("Neko editor PHP error: $errstr in $errfile:$errline");
    editor_json_response(500, [
        'ok'    => false,
		'error' => ['code' => 'server_error', 'message' => 'The editor API encountered an internal error.'],
    ]);
});
set_exception_handler(function (Throwable $e): void {
	error_log('Neko editor exception: ' . $e);
    editor_json_response(500, [
        'ok'    => false,
		'error' => ['code' => 'server_error', 'message' => 'The editor API encountered an internal error.'],
    ]);
});

// ── Constants ────────────────────────────────────────────────────────────────

// Root of the project (two levels up from editor/api/).
define('EDITOR_PROJECT_ROOT', realpath(__DIR__ . '/../../'));
const EDITOR_MAX_REQUEST_BYTES = 2 * 1024 * 1024;

const EDITOR_FILES = [
    'mytes.base'            => 'data/mytes/myte.json',
    'mytes.species-catalog' => 'data/mytes/species.json',
    'map-objects.base'      => 'data/map-objects/base.json',
    'map-objects.types'     => 'data/map-objects/types.json',
    'items'                 => 'data/metadata/items.json',
    'actions'               => 'data/metadata/actions.json',
    'buffs'                 => 'data/metadata/buffs.json',
    'zones'                 => 'data/metadata/zones.json',
    'environment-presets'   => 'data/metadata/environment-presets.json',
];

const EDITOR_ASSET_DIRS = [
    'items'       => 'images/items',
    'map-objects' => 'images/MapObjects',
    'mytes'       => 'images',
];

function editor_path_is_within(string $path, string $root): bool
{
	$normalize = static function (string $value): string {
		$value = rtrim(str_replace('\\', '/', $value), '/');
		return DIRECTORY_SEPARATOR === '\\' ? strtolower($value) : $value;
	};
	$path = $normalize($path);
	$root = $normalize($root);
	return $path === $root || str_starts_with($path, $root . '/');
}

function editor_require_local_access(): void
{
	if (PHP_SAPI === 'cli') return;
	$allowRemote = filter_var(getenv('NEKO_EDITOR_ALLOW_REMOTE') ?: 'false', FILTER_VALIDATE_BOOL);
	$authenticatedUser = $_SERVER['REMOTE_USER'] ?? $_SERVER['PHP_AUTH_USER'] ?? '';
	if ($allowRemote && $authenticatedUser !== '') return;

	$address = $_SERVER['REMOTE_ADDR'] ?? '';
	if (!in_array($address, ['127.0.0.1', '::1'], true)) {
		editor_fail(403, 'local_only', 'The editor API is local-only. Configure authentication before enabling remote access.');
	}
}

function editor_require_same_origin(): void
{
	$fetchSite = strtolower($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '');
	if ($fetchSite === 'cross-site') {
		editor_fail(403, 'cross_site_request', 'Cross-site editor requests are not allowed.');
	}

	$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
	if ($origin === '') return;
	$isHttps = (!empty($_SERVER['HTTPS']) && strtolower($_SERVER['HTTPS']) !== 'off');
	$expectedOrigin = ($isHttps ? 'https' : 'http') . '://' . ($_SERVER['HTTP_HOST'] ?? '');
	if ($expectedOrigin === 'http://' || strcasecmp(rtrim($origin, '/'), $expectedOrigin) !== 0) {
		editor_fail(403, 'cross_site_request', 'Cross-site editor requests are not allowed.');
	}
}

// ── Response helpers ─────────────────────────────────────────────────────────

function editor_json_response(int $status, array $payload): never
{
    http_response_code($status);
	header_remove('X-Powered-By');
    header('Content-Type: application/json; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
	header('Cache-Control: no-store');
	header('Content-Security-Policy: default-src \'none\'; frame-ancestors \'none\'');
	header('Referrer-Policy: no-referrer');
	header('X-Frame-Options: DENY');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function editor_fail(int $status, string $code, string $message, array $extra = []): never
{
    editor_json_response($status, array_merge(
        ['ok' => false, 'error' => ['code' => $code, 'message' => $message]],
        $extra
    ));
}

// ── Request helpers ──────────────────────────────────────────────────────────

function editor_require_method(string $method): void
{
    if ($_SERVER['REQUEST_METHOD'] !== strtoupper($method)) {
        header('Allow: ' . strtoupper($method));
        editor_fail(405, 'method_not_allowed', "Method not allowed. Expected $method.");
    }
}

function editor_request_body(): array
{
	editor_require_same_origin();
	$contentType = strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '')[0]));
	if ($contentType !== 'application/json') {
		editor_fail(415, 'unsupported_media_type', 'Content-Type must be application/json.');
	}
	$contentLength = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
	if ($contentLength > EDITOR_MAX_REQUEST_BYTES) {
		editor_fail(413, 'payload_too_large', 'Request body exceeds the 2 MB limit.');
	}
	$raw = file_get_contents('php://input', false, null, 0, EDITOR_MAX_REQUEST_BYTES + 1);
	if ($raw === false || strlen($raw) > EDITOR_MAX_REQUEST_BYTES) {
		editor_fail(413, 'payload_too_large', 'Request body exceeds the 2 MB limit.');
	}
    $data = json_decode($raw, true);
    if (!is_array($data) || array_is_list($data)) {
		$message = json_last_error() === JSON_ERROR_NONE
			? 'Request body must be a JSON object.'
			: 'Request body contains malformed JSON.';
		editor_fail(400, 'bad_request', $message);
    }
    return $data;
}

// ── File resolution ──────────────────────────────────────────────────────────

function editor_resolve_file(string $fileId): array
{
    // Reject path-like characters before any other processing.
    if (preg_match('#[/\\\\]|\.\.|\\.php#i', $fileId)) {
        editor_fail(400, 'bad_request', "Invalid file id: \"$fileId\".");
    }

    $relative = editor_file_registry_lookup($fileId);
    if ($relative === null) {
        editor_fail(404, 'unknown_file', "Unknown file id: \"$fileId\".");
    }

    $absolute = realpath(EDITOR_PROJECT_ROOT . '/' . $relative);

    // Verify path is inside the project root (even for non-existent files we
    // can still validate the canonical form).
    $canonical = EDITOR_PROJECT_ROOT . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $relative);
    $resolvedDir = realpath(dirname($canonical));
    if ($resolvedDir !== false && !editor_path_is_within($resolvedDir, EDITOR_PROJECT_ROOT)) {
        editor_fail(400, 'bad_request', "File id resolves outside the project root.");
    }
    if ($absolute !== false && !editor_path_is_within($absolute, EDITOR_PROJECT_ROOT)) {
        editor_fail(400, 'bad_request', "File id resolves outside the project root.");
    }

    // Normalise to forward slashes for the API response.
    $absoluteNorm = $absolute !== false ? $absolute : $canonical;

    return [
        'id'       => $fileId,
        'relative' => $relative,
        'absolute' => str_replace('\\', '/', $absoluteNorm),
    ];
}

function editor_file_registry_lookup(string $fileId): ?string
{
    if (isset(EDITOR_FILES[$fileId])) {
        return EDITOR_FILES[$fileId];
    }

    // Dynamic species definition: mytes.species.<speciesId>
    if (preg_match('/^mytes\.species\.([a-z][a-z0-9_-]*)$/', $fileId, $m)) {
        $speciesId = $m[1];
        $catalogPath = EDITOR_PROJECT_ROOT . '/data/mytes/species.json';
        if (!file_exists($catalogPath)) {
            return null;
        }
        $catalog = json_decode(file_get_contents($catalogPath), true);
        $allowed  = array_map(
            fn($entry) => pathinfo($entry['definitionFile'] ?? '', PATHINFO_FILENAME),
            $catalog['species'] ?? []
        );
        if (in_array($speciesId, $allowed, true)) {
            return "data/mytes/$speciesId.json";
        }
    }

    return null;
}

// ── JSON file helpers ────────────────────────────────────────────────────────

function editor_read_json(string $absolutePath): array
{
    $raw = file_get_contents($absolutePath);
    if ($raw === false) {
        editor_fail(500, 'read_failed', 'Could not read the requested content file.');
    }
    $data = json_decode($raw, true);
    if ($data === null) {
        editor_fail(500, 'malformed_json', 'The requested content file is not valid JSON.');
    }
    return $data;
}

// ── Validation ───────────────────────────────────────────────────────────────

/**
 * Returns an array of findings: [['level' => 'error'|'warning', 'path' => '...', 'message' => '...']]
 */
function editor_validate(string $fileId, array $content): array
{
    $findings = [];

    // Generic: root object
    if (!is_array($content) || array_is_list($content)) {
        $findings[] = ['level' => 'error', 'path' => '', 'message' => 'Root must be a JSON object.'];
        return $findings; // nothing else makes sense
    }

    // Generic: schemaVersion
    if (!isset($content['schemaVersion']) || !is_int($content['schemaVersion']) || $content['schemaVersion'] < 1) {
        $findings[] = ['level' => 'error', 'path' => 'schemaVersion', 'message' => 'schemaVersion must be a positive integer.'];
    } else {
        $relative = editor_file_registry_lookup($fileId);
        if ($relative !== null) {
            $absoluteOnDisk = realpath(EDITOR_PROJECT_ROOT . '/' . $relative);
            if ($absoluteOnDisk !== false && file_exists($absoluteOnDisk)) {
                $onDisk = json_decode(file_get_contents($absoluteOnDisk), true);
                $diskVersion = $onDisk['schemaVersion'] ?? 0;
                if ($content['schemaVersion'] < $diskVersion) {
                    $findings[] = [
                        'level'   => 'error',
                        'path'    => 'schemaVersion',
                        'message' => "schemaVersion ($content[schemaVersion]) is lower than the on-disk version ($diskVersion).",
                    ];
                }
            }
        }
    }

    // Per-domain rules
    if ($fileId === 'items') {
        $findings = array_merge($findings, editor_validate_items($content));
    } elseif ($fileId === 'actions') {
        $findings = array_merge($findings, editor_validate_actions($content));
    } elseif ($fileId === 'buffs') {
        $findings = array_merge($findings, editor_validate_buffs($content));
    } elseif ($fileId === 'zones') {
        $findings = array_merge($findings, editor_validate_zones($content));
    } elseif ($fileId === 'environment-presets') {
        $findings = array_merge($findings, editor_validate_environment_presets($content));
    } elseif ($fileId === 'mytes.species-catalog') {
        $findings = array_merge($findings, editor_validate_mytes_species_catalog($content));
    } elseif ($fileId === 'mytes.base' || preg_match('/^mytes\.species\./', $fileId)) {
        $findings = array_merge($findings, editor_validate_mytes_definition($content));
    } elseif ($fileId === 'map-objects.base') {
        // base is a flat config object — no list-level rules beyond generic ones
    } elseif ($fileId === 'map-objects.types') {
        $findings = array_merge($findings, editor_validate_map_objects_types($content));
    }

    return $findings;
}

function editor_validate_items(array $content): array
{
    $findings = [];

    if (!isset($content['items']) || !is_array($content['items'])) {
        $findings[] = ['level' => 'error', 'path' => 'items', 'message' => 'items must be an array.'];
        return $findings;
    }

    $spriteSheetUrl = $content['visual']['spriteSheet']['url'] ?? '';
    if (!is_string($spriteSheetUrl) || trim($spriteSheetUrl) === '') {
        $findings[] = ['level' => 'error', 'path' => 'visual.spriteSheet.url', 'message' => 'Catalog-level visual.spriteSheet.url must be a non-empty string.'];
    }

    $seenIds   = [];
    $seenCells = [];
    foreach ($content['items'] as $i => $item) {
        $base = "items[$i]";

        if (!isset($item['id']) || !is_string($item['id']) || !preg_match('/^[a-z][a-z0-9_]*$/', $item['id'])) {
            $findings[] = ['level' => 'error', 'path' => "$base.id", 'message' => 'id must match /^[a-z][a-z0-9_]*/'];
            continue;
        }

        $itemId = $item['id'];
        $allIds = array_merge([$itemId], $item['aliases'] ?? []);
        foreach ($allIds as $alias) {
            if (isset($seenIds[$alias])) {
                $findings[] = ['level' => 'error', 'path' => "$base.id", 'message' => "Duplicate id/alias \"$alias\"."];
            }
            $seenIds[$alias] = $i;
        }

        $sprite = $item['visual']['sprite'] ?? null;
        if (!is_array($sprite) || !isset($sprite['col'], $sprite['row']) ||
            !is_int($sprite['col']) || !is_int($sprite['row']) ||
            $sprite['col'] < 0 || $sprite['row'] < 0) {
            $findings[] = ['level' => 'error', 'path' => "$base.visual.sprite", 'message' => 'visual.sprite must have integer col and row >= 0.'];
        } elseif (isset($seenCells["{$sprite['col']},{$sprite['row']}"])) {
            $prev = $seenCells["{$sprite['col']},{$sprite['row']}"];
            $findings[] = ['level' => 'warning', 'path' => "$base.visual.sprite", 'message' => "Duplicate sprite cell [{$sprite['col']},{$sprite['row']}] also used by items[$prev]."];
        } else {
            $seenCells["{$sprite['col']},{$sprite['row']}"] = $i;
        }
    }

    return $findings;
}

function editor_validate_actions(array $content): array
{
    $findings = [];

    if (!isset($content['actions']) || !is_array($content['actions'])) {
        $findings[] = ['level' => 'error', 'path' => 'actions', 'message' => 'actions must be an array.'];
        return $findings;
    }

    $seenIds = [];
    foreach ($content['actions'] as $i => $action) {
        $base = "actions[$i]";
        $id   = $action['id'] ?? null;

        if (!is_string($id) || trim($id) === '') {
            $findings[] = ['level' => 'error', 'path' => "$base.id", 'message' => 'id must be a non-empty string.'];
        } elseif (isset($seenIds[$id])) {
            $findings[] = ['level' => 'error', 'path' => "$base.id", 'message' => "Duplicate action id \"$id\"."];
        } else {
            $seenIds[$id] = true;
        }

        if (!isset($action['queue']) || !is_array($action['queue'])) {
            $findings[] = ['level' => 'warning', 'path' => "$base.queue", 'message' => 'queue object is missing.'];
        } elseif (!isset($action['queue']['implementationClass']) || !is_string($action['queue']['implementationClass'])) {
            $findings[] = ['level' => 'warning', 'path' => "$base.queue.implementationClass", 'message' => 'queue.implementationClass is missing or not a string.'];
        }

        if (isset($action['effects']) && is_array($action['effects'])) {
            foreach ($action['effects'] as $key => $val) {
                if (!is_int($val) && !is_float($val)) {
                    $findings[] = ['level' => 'error', 'path' => "$base.effects.$key", 'message' => "effects.$key must be a number."];
                }
            }
        }

        if (isset($action['purposeOverrides']) && is_array($action['purposeOverrides'])) {
            foreach ($action['purposeOverrides'] as $key => $_) {
                if (!is_string($key) || trim($key) === '') {
                    $findings[] = ['level' => 'error', 'path' => "$base.purposeOverrides", 'message' => 'purposeOverrides keys must be non-empty strings.'];
                }
            }
        }
    }

    return $findings;
}

function editor_validate_buffs(array $content): array
{
    $findings = [];

    if (!isset($content['buffs']) || !is_array($content['buffs'])) {
        $findings[] = ['level' => 'error', 'path' => 'buffs', 'message' => 'buffs must be an array.'];
        return $findings;
    }

    // Load action ids for cross-reference warning.
    $knownActionIds = [];
    $actionsPath    = realpath(EDITOR_PROJECT_ROOT . '/data/metadata/actions.json');
    if ($actionsPath && file_exists($actionsPath)) {
        $actionsData    = json_decode(file_get_contents($actionsPath), true);
        $knownActionIds = array_column($actionsData['actions'] ?? [], 'id');
    }

    $seenIds = [];
    foreach ($content['buffs'] as $i => $buff) {
        $base = "buffs[$i]";
        $id   = $buff['id'] ?? null;

        if (!is_string($id) || trim($id) === '') {
            $findings[] = ['level' => 'error', 'path' => "$base.id", 'message' => 'id must be a non-empty string.'];
        } elseif (isset($seenIds[$id])) {
            $findings[] = ['level' => 'error', 'path' => "$base.id", 'message' => "Duplicate buff id \"$id\"."];
        } else {
            $seenIds[$id] = true;
        }

        $kind = $buff['kind'] ?? null;
        if ($kind !== 'buff' && $kind !== 'debuff') {
            $findings[] = ['level' => 'error', 'path' => "$base.kind", 'message' => 'kind must be "buff" or "debuff".'];
        }

        $actionIds = $buff['triggers']['actionComplete']['actionIds'] ?? null;
        if ($actionIds !== null) {
            if (!is_array($actionIds)) {
                $findings[] = ['level' => 'error', 'path' => "$base.triggers.actionComplete.actionIds", 'message' => 'actionIds must be an array.'];
            } else {
                foreach ($actionIds as $j => $aId) {
                    if (!is_string($aId)) {
                        $findings[] = ['level' => 'error', 'path' => "$base.triggers.actionComplete.actionIds[$j]", 'message' => 'Action id must be a string.'];
                    } elseif ($knownActionIds && !in_array($aId, $knownActionIds, true)) {
                        $findings[] = ['level' => 'warning', 'path' => "$base.triggers.actionComplete.actionIds[$j]", 'message' => "Unknown action id \"$aId\"."];
                    }
                }
            }
        }
    }

    return $findings;
}

function editor_validate_zones(array $content): array
{
    $findings = [];

    if (!isset($content['zones']) || !is_array($content['zones'])) {
        $findings[] = ['level' => 'error', 'path' => 'zones', 'message' => 'zones must be an array.'];
        return $findings;
    }

    $seenIds = [];
    foreach ($content['zones'] as $i => $zone) {
        $base = "zones[$i]";
        $id   = $zone['id'] ?? null;

        if (!is_string($id) || trim($id) === '') {
            $findings[] = ['level' => 'error', 'path' => "$base.id", 'message' => 'id must be a non-empty string.'];
        } elseif (isset($seenIds[$id])) {
            $findings[] = ['level' => 'error', 'path' => "$base.id", 'message' => "Duplicate zone id \"$id\"."];
        } else {
            $seenIds[$id] = true;
        }

        if (isset($zone['effects']) && is_array($zone['effects'])) {
            foreach ($zone['effects'] as $key => $val) {
                if (!is_int($val) && !is_float($val)) {
                    $findings[] = ['level' => 'error', 'path' => "$base.effects.$key", 'message' => "effects.$key must be a number."];
                }
            }
        }
    }

    return $findings;
}

function editor_validate_environment_presets(array $content): array
{
    $findings = [];

    if (!isset($content['presets']) || !is_array($content['presets'])) {
        $findings[] = ['level' => 'error', 'path' => 'presets', 'message' => 'presets must be an array.'];
        return $findings;
    }

    $seenIds = [];
    foreach ($content['presets'] as $i => $preset) {
        $id = $preset['id'] ?? null;
        if (!is_string($id) || trim($id) === '') {
            $findings[] = ['level' => 'error', 'path' => "presets[$i].id", 'message' => 'id must be a non-empty string.'];
        } elseif (isset($seenIds[$id])) {
            $findings[] = ['level' => 'error', 'path' => "presets[$i].id", 'message' => "Duplicate preset id \"$id\"."];
        } else {
            $seenIds[$id] = true;
        }
    }

    return $findings;
}

function editor_validate_mytes_definition(array $content): array
{
    $findings = [];

    $regions = $content['spatial']['regions'] ?? null;
    if ($regions !== null && is_array($regions)) {
        foreach ($regions as $regionId => $region) {
            $base = "spatial.regions.$regionId";
            if (!is_array($region)) {
                $findings[] = ['level' => 'error', 'path' => $base, 'message' => 'Region must be an object.'];
                continue;
            }
            if (!isset($region['type'])) {
                $findings[] = ['level' => 'error', 'path' => "$base.type", 'message' => 'Region must have a type field.'];
            } elseif ($region['type'] !== 'box') {
                $findings[] = ['level' => 'warning', 'path' => "$base.type", 'message' => "Unknown region type \"{$region['type']}\"."];
            }
            foreach (['x', 'y'] as $coord) {
                if (!isset($region[$coord]) || !is_numeric($region[$coord])) {
                    $findings[] = ['level' => 'error', 'path' => "$base.$coord", 'message' => "$coord must be a number."];
                }
            }
            foreach (['width', 'height'] as $dim) {
                if (!isset($region[$dim]) || !is_numeric($region[$dim]) || $region[$dim] <= 0) {
                    $findings[] = ['level' => 'error', 'path' => "$base.$dim", 'message' => "$dim must be a positive number."];
                }
            }
        }
    }

    $spriteSets = $content['visual']['spriteSets'] ?? null;
    if ($spriteSets !== null) {
        if (!is_array($spriteSets) || array_is_list($spriteSets)) {
            $findings[] = ['level' => 'error', 'path' => 'visual.spriteSets', 'message' => 'visual.spriteSets must be an object.'];
        } else {
            foreach ($spriteSets as $key => $frames) {
                if (!is_array($frames)) {
                    $findings[] = ['level' => 'error', 'path' => "visual.spriteSets.$key", 'message' => 'Sprite set value must be an array.'];
                }
            }
        }
    }

    return $findings;
}

function editor_validate_mytes_species_catalog(array $content): array
{
    $findings = [];

    if (!isset($content['species']) || !is_array($content['species'])) {
        $findings[] = ['level' => 'error', 'path' => 'species', 'message' => 'species must be an array.'];
        return $findings;
    }

    $seenIds  = [];
    $enabledIds = [];
    foreach ($content['species'] as $i => $entry) {
        $base = "species[$i]";
        $id   = $entry['id'] ?? null;

        if (!is_string($id) || trim($id) === '') {
            $findings[] = ['level' => 'error', 'path' => "$base.id", 'message' => 'id must be a non-empty string.'];
        } elseif (isset($seenIds[$id])) {
            $findings[] = ['level' => 'error', 'path' => "$base.id", 'message' => "Duplicate species id \"$id\"."];
        } else {
            $seenIds[$id] = true;
            if (($entry['enabled'] ?? true) !== false) {
                $enabledIds[] = $id;
            }
        }

        $defFile = $entry['definitionFile'] ?? '';
        if (!is_string($defFile) || !preg_match('/^[a-z][a-z0-9_-]*\.json$/', $defFile)) {
            $findings[] = ['level' => 'error', 'path' => "$base.definitionFile", 'message' => 'definitionFile must match /^[a-z][a-z0-9_-]*\\.json$/'];
        }
    }

    $defaultId = $content['defaultSpeciesId'] ?? null;
    if (!is_string($defaultId) || !in_array($defaultId, $enabledIds, true)) {
        $findings[] = ['level' => 'error', 'path' => 'defaultSpeciesId', 'message' => 'defaultSpeciesId must reference a listed, enabled species.'];
    }

    return $findings;
}

function editor_validate_map_objects_types(array $content): array
{
    $findings = [];

    foreach ($content as $typeId => $typeConfig) {
        if ($typeId === 'schemaVersion') {
            continue;
        }
        $base = $typeId;
        if (!is_array($typeConfig) || array_is_list($typeConfig)) {
            $findings[] = ['level' => 'error', 'path' => $base, 'message' => "Type \"$typeId\" must be an object."];
            continue;
        }

        // slotsByFacing slot validation
        if (isset($typeConfig['slotsByFacing']) && is_array($typeConfig['slotsByFacing'])) {
            foreach ($typeConfig['slotsByFacing'] as $facing => $slots) {
                if (!is_array($slots)) continue;
                foreach ($slots as $j => $slot) {
                    $sBase = "$base.slotsByFacing.$facing[$j]";
                    if (!isset($slot['id']) || !is_string($slot['id'])) {
                        $findings[] = ['level' => 'warning', 'path' => "$sBase.id", 'message' => 'Slot is missing an id.'];
                    }
                    if (!isset($slot['restPosition'])) {
                        $findings[] = ['level' => 'warning', 'path' => "$sBase.restPosition", 'message' => 'Slot is missing restPosition.'];
                    }
                }
            }
        }

        // spatial.regions validation
        $regions = $typeConfig['spatial']['regions'] ?? null;
        if ($regions === null) {
            $findings[] = ['level' => 'warning', 'path' => "$base.spatial.regions", 'message' => "Type \"$typeId\" is missing spatial.regions."];
        } elseif (!is_array($regions) || array_is_list($regions)) {
            $findings[] = ['level' => 'error', 'path' => "$base.spatial.regions", 'message' => "spatial.regions must be an object."];
        } else {
            $requiredRegions = ['collider', 'interaction', 'select', 'hit'];
            foreach ($requiredRegions as $rId) {
                if (!array_key_exists($rId, $regions)) {
                    $findings[] = ['level' => 'warning', 'path' => "$base.spatial.regions.$rId", 'message' => "Missing required region \"$rId\"."];
                }
            }
            foreach ($regions as $regionId => $region) {
                $rBase = "$base.spatial.regions.$regionId";
                if ($region === null) continue; // null is allowed (disabled region)
                if (!is_array($region) || array_is_list($region)) {
                    $findings[] = ['level' => 'error', 'path' => $rBase, 'message' => "Region \"$regionId\" must be an object or null."];
                    continue;
                }
                if (!isset($region['type']) || $region['type'] !== 'box') {
                    $findings[] = ['level' => 'warning', 'path' => "$rBase.type", 'message' => "Region \"$regionId\" must have type \"box\"."];
                }
                foreach (['x', 'y', 'width', 'height'] as $coord) {
                    if (!array_key_exists($coord, $region)) {
                        $findings[] = ['level' => 'warning', 'path' => "$rBase.$coord", 'message' => "Region \"$regionId\" is missing \"$coord\"."];
                    } elseif (!is_numeric($region[$coord])) {
                        $findings[] = ['level' => 'error', 'path' => "$rBase.$coord", 'message' => "Region \"$regionId\".$coord must be a number."];
                    }
                }
                if (isset($region['width']) && is_numeric($region['width']) && $region['width'] < 0) {
                    $findings[] = ['level' => 'error', 'path' => "$rBase.width", 'message' => "Region \"$regionId\".width must be >= 0."];
                }
                if (isset($region['height']) && is_numeric($region['height']) && $region['height'] < 0) {
                    $findings[] = ['level' => 'error', 'path' => "$rBase.height", 'message' => "Region \"$regionId\".height must be >= 0."];
                }
            }
        }

        // visual.states / visual.defaultState consistency
        $states       = $typeConfig['visual']['states'] ?? null;
        $defaultState = $typeConfig['visual']['defaultState'] ?? null;
        if ($states !== null) {
            if (!is_array($states)) {
                $findings[] = ['level' => 'error', 'path' => "$base.visual.states", 'message' => 'visual.states must be an array.'];
            } elseif ($defaultState !== null && !in_array($defaultState, $states, true)) {
                $findings[] = ['level' => 'error', 'path' => "$base.visual.defaultState", 'message' => "visual.defaultState \"$defaultState\" is not listed in visual.states."];
            }
        }
    }

    return $findings;
}

// ── Backup helpers ───────────────────────────────────────────────────────────

function editor_backup_file(string $absolutePath): ?string
{
    if (!file_exists($absolutePath)) {
        return null;
    }

    // Normalize separators throughout so the project-root strip always works.
    $absNorm   = str_replace('\\', '/', $absolutePath);
    $dir       = dirname($absNorm);
    $basename  = pathinfo($absNorm, PATHINFO_FILENAME);
    $backupDir = $dir . '/_backup';

    if (!is_dir($backupDir)) {
        if (!mkdir($backupDir, 0755, true)) {
            editor_fail(500, 'write_failed', 'Could not create the backup directory.');
        }
    }

    $timestamp  = date('Y-m-d\TH-i-s');
    $backupPath = $backupDir . "/$basename.$timestamp.json";
    if (!copy($absNorm, $backupPath)) {
        editor_fail(500, 'write_failed', 'Could not create the content backup.');
    }

    // Prune: keep only the 20 most recent backups for this basename.
    $existing = glob($backupDir . "/$basename.*.json");
    if ($existing !== false && count($existing) > 20) {
        sort($existing);
        $toDelete = array_slice($existing, 0, count($existing) - 20);
        foreach ($toDelete as $old) {
            @unlink($old);
        }
    }

    // Return project-root-relative path with forward slashes.
    $projectRoot = str_replace('\\', '/', EDITOR_PROJECT_ROOT);
    return ltrim(substr($backupPath, strlen($projectRoot)), '/');
}

// ── Atomic write ─────────────────────────────────────────────────────────────

function editor_atomic_write(string $absolutePath, array $content): void
{
    $json = json_encode($content, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if ($json === false) {
        editor_fail(500, 'write_failed', 'Could not encode content as JSON.');
    }

    // Convert 4-space indent to 2-space indent.
    $json = preg_replace_callback('/^( {4})+/m', function ($m) {
        $level = strlen($m[0]) / 4;
        return str_repeat('  ', (int)$level);
    }, $json);

    // Ensure trailing newline.
    $json = rtrim($json) . "\n";

    $dir  = dirname($absolutePath);
    $tmp  = $dir . DIRECTORY_SEPARATOR . basename($absolutePath) . '.tmp.' . bin2hex(random_bytes(4));
    if (file_put_contents($tmp, $json) === false) {
        @unlink($tmp);
        editor_fail(500, 'write_failed', 'Could not write the temporary content file.');
    }
    if (!rename($tmp, $absolutePath)) {
        @unlink($tmp);
        editor_fail(500, 'write_failed', 'Could not replace the content file atomically.');
    }
}

editor_require_local_access();
