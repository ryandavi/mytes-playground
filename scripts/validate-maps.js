/**
 * validate-maps.js — checks every map in data/maps against the authoring
 * conventions documented in docs/WALL_SYSTEM_AND_SPRITESHEET_SPEC_2026-08.md §3.
 *
 * The loader is deliberately permissive: it finds wall tiles by tileset marker
 * and wang-set membership, so walls work from any layer with any name and no
 * properties at all. That permissiveness is how a map ends up with its walls
 * hiding on a layer called "Collider", silently inheriting whatever
 * SiteConfig's defaults happen to be. Nothing breaks — it just becomes
 * impossible to tell, from the map file, what the walls are made of.
 *
 * Beyond walls it catches the class of slip an audit of House.tmx turned up:
 * objects sitting off the tile grid, and a room volume shadowed by a Zone
 * object describing the same space twice. Both stay invisible until something
 * downstream disagrees — House's kitchen zone sat one pixel off its own room
 * because room bounds are snapped on load and zone bounds are not.
 *
 * Run: node scripts/validate-maps.js
 */

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const mapsDir = path.join(repoRoot, 'data', 'maps');
const tilesetsDir = path.join(repoRoot, 'data', 'tilesets');

const WALL_WANG_SET = 'Wall';
const REQUIRED_PROPERTIES = ['wallConstructionId', 'wallFinishId', 'wallHeightCells', 'wallConnectGroup'];
const CONVENTIONAL_NAME = /^Walls\b/;

// ── Tiny XML readers ─────────────────────────────────────────────────────────
//
// A regex reader rather than a parser dependency: this walks a handful of
// well-formed files Tiled itself wrote, and the build has no XML library.

function readAttribute(tag, name) {
	const match = tag.match(new RegExp(`${name}="([^"]*)"`));
	return match ? match[1] : null;
}

function wallTileIdsFor(tilesetFile) {
	const xml = fs.readFileSync(tilesetFile, 'utf8');
	const isWallTileset = /<property name="wallTileset"[^>]*value="true"/.test(xml);
	if (!isWallTileset) return null;

	const wangSet = xml.match(
		new RegExp(`<wangset name="${WALL_WANG_SET}"[^>]*>([\\s\\S]*?)</wangset>`, 'i')
	);
	if (!wangSet) return null;

	const ids = new Set();
	for (const tag of wangSet[1].match(/<wangtile[^>]*\/>/g) || []) {
		ids.add(Number(readAttribute(tag, 'tileid')));
	}
	return ids;
}

function collectWallGids(mapXml) {
	const gids = new Set();
	for (const tag of mapXml.match(/<tileset[^>]*\/>/g) || []) {
		const source = readAttribute(tag, 'source');
		const firstgid = Number(readAttribute(tag, 'firstgid'));
		if (!source) continue;
		const tileIds = wallTileIdsFor(path.join(tilesetsDir, path.basename(source)));
		if (!tileIds) continue;
		for (const id of tileIds) gids.add(id + firstgid);
	}
	return gids;
}

function parseLayers(mapXml) {
	const layers = [];
	const pattern = /<layer\b([^>]*)>([\s\S]*?)<\/layer>/g;
	let match;
	while ((match = pattern.exec(mapXml)) !== null) {
		const [, attributes, body] = match;
		const csv = body.match(/<data encoding="csv">([\s\S]*?)<\/data>/);
		layers.push({
			name: readAttribute(attributes, 'name'),
			properties: new Set(
				(body.match(/<property name="[^"]*"/g) || []).map(tag => readAttribute(tag, 'name'))
			),
			gids: csv
				? csv[1].split(',').map(value => Number(value.trim()) || 0).filter(Boolean)
				: []
		});
	}
	return layers;
}

// ── Rules ────────────────────────────────────────────────────────────────────

// Point markers are placed at a cell centre on purpose, so grid alignment is
// not a meaningful check for them.
const POINT_MARKERS = new Set(['SPAWN', 'PORTAL']);

function parseObjectGroups(mapXml) {
	const groups = [];
	const pattern = /<objectgroup[^>]*name="([^"]*)"[^>]*>([\s\S]*?)<\/objectgroup>/g;
	let match;
	while ((match = pattern.exec(mapXml)) !== null) {
		const objects = [];
		const objectPattern = /<object id="(\d+)" name="([^"]*)"([^>]*)>([\s\S]*?)<\/object>/g;
		let objectMatch;
		while ((objectMatch = objectPattern.exec(match[2])) !== null) {
			objects.push({
				id: objectMatch[1],
				name: objectMatch[2],
				x: Number(readAttribute(objectMatch[3], 'x')),
				y: Number(readAttribute(objectMatch[3], 'y')),
				properties: Object.fromEntries(
					[...objectMatch[4].matchAll(/<property name="(\w+)"[^>]*value="([^"]*)"/g)]
						.map(property => [property[1], property[2]])
				)
			});
		}
		groups.push({ name: match[1], objects });
	}
	return groups;
}

// Every zone type a map may name, from the catalogue that defines what each one
// does. An unregistered type is not a crash — the zone still exists and can
// still be found by type — it just quietly does nothing, which is precisely
// what makes a typo here expensive to notice.
function knownZoneTypes() {
	const catalog = JSON.parse(fs.readFileSync(path.join(repoRoot, 'data/metadata/zones.json'), 'utf8'));
	return new Set((catalog.zones || []).map(zone => String(zone.id).toLowerCase()));
}

function checkObjects(mapXml, tileSize, zoneTypes) {
	const findings = [];
	const groups = parseObjectGroups(mapXml);
	const roomsByOrigin = new Map();

	for (const group of groups) {
		for (const object of group.objects) {
			const type = object.name.toUpperCase();
			if (!POINT_MARKERS.has(type) && (object.x % tileSize !== 0 || object.y % tileSize !== 0)) {
				findings.push({
					level: 'warning',
					layer: `${group.name}/${object.name}#${object.id}`,
					message: `sits off the ${tileSize}px grid at (${object.x},${object.y})`
				});
			}
			if (type === 'ROOM' || type === 'LIGHTVOLUME') roomsByOrigin.set(`${object.x},${object.y}`, object);

			// `type` is the legacy spelling, and only on a Zone object — on a
			// SPAWN it means something else entirely.
			const zoneType = object.properties.zoneType || (type === 'ZONE' ? object.properties.type : null);
			if (zoneType && !zoneTypes.has(zoneType.toLowerCase())) {
				findings.push({
					level: 'error',
					layer: `${group.name}/${object.name}#${object.id}`,
					message: `declares zoneType="${zoneType}", which is not in data/metadata/zones.json — ` +
						`the zone will load and do nothing`
				});
			}
		}
	}

	// A Zone sharing a room's rectangle is the old two-object form: one space
	// authored twice, free to drift. Fold it in as `zoneType` on the room.
	for (const group of groups) {
		for (const object of group.objects) {
			if (object.name.toUpperCase() !== 'ZONE') continue;
			const room = roomsByOrigin.get(`${object.x},${object.y}`);
			if (!room) continue;
			findings.push({
				level: 'warning',
				layer: `${group.name}/Zone#${object.id}`,
				message: `duplicates the rectangle of room "${room.properties.roomId || room.id}" — ` +
					`move it onto that room as zoneType="${object.properties.type || '?'}"`
			});
		}
	}
	return findings;
}

function checkMap(mapFile, zoneTypes) {
	const xml = fs.readFileSync(mapFile, 'utf8');
	const wallGids = collectWallGids(xml);
	const tileSize = Number(readAttribute(xml.match(/<map[^>]*>/)[0], 'tilewidth')) || 32;
	const findings = checkObjects(xml, tileSize, zoneTypes);
	if (wallGids.size === 0) return findings;

	for (const layer of parseLayers(xml)) {
		const wall = layer.gids.filter(gid => wallGids.has(gid));
		if (wall.length === 0) continue;
		const foreign = layer.gids.filter(gid => !wallGids.has(gid));

		// Mixed layers are the only finding that can cost data: the exporter
		// rewrites a wall layer in full, and it can only carry foreign tiles
		// across because it goes looking for them.
		if (foreign.length > 0) {
			findings.push({
				level: 'error',
				layer: layer.name,
				message: `mixes ${wall.length} wall tiles with ${foreign.length} non-wall tiles — give the walls their own layer`
			});
		}
		if (!CONVENTIONAL_NAME.test(layer.name || '')) {
			findings.push({
				level: 'warning',
				layer: layer.name,
				message: `holds ${wall.length} wall tiles but is not named "Walls"`
			});
		}
		const missing = REQUIRED_PROPERTIES.filter(property => !layer.properties.has(property));
		if (missing.length > 0) {
			findings.push({
				level: 'warning',
				layer: layer.name,
				message: `does not declare ${missing.join(', ')} — the walls silently inherit SiteConfig defaults`
			});
		}
	}
	return findings;
}

// ── Report ───────────────────────────────────────────────────────────────────

let errors = 0;
let warnings = 0;

const zoneTypes = knownZoneTypes();

for (const file of fs.readdirSync(mapsDir).filter(name => name.endsWith('.tmx'))) {
	const findings = checkMap(path.join(mapsDir, file), zoneTypes);
	if (findings.length === 0) continue;
	console.log(`\n${file}`);
	for (const finding of findings) {
		console.log(`  ${finding.level === 'error' ? 'ERROR  ' : 'warning'}  layer "${finding.layer}" ${finding.message}`);
		if (finding.level === 'error') errors++;
		else warnings++;
	}
}

console.log(
	errors + warnings === 0
		? '\nAll maps follow the authoring conventions.'
		: `\n${errors} error(s), ${warnings} warning(s).`
);
process.exit(errors > 0 ? 1 : 0);
