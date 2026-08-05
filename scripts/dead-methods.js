// Reports class methods in js/ that nothing appears to reference.
//
// Regex-based, so it is a lead generator, not a verdict: methods dispatched
// dynamically (event handler tables, string-keyed lookups) and entry points used
// only by editor/ will show up as false positives. Verify before deleting.
//
//   node scripts/dead-methods.js

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const sourceRoot = path.join(repoRoot, 'js');

// Control-flow keywords and array callbacks that the method-definition regex
// would otherwise pick up as declarations.
const NOT_METHODS = new Set([
	'if', 'for', 'while', 'switch', 'catch', 'function', 'return',
	'constructor', 'get', 'set', 'new', 'typeof', 'else', 'do',
	'forEach', 'map', 'filter'
]);

function collectSources(dir) {
	const files = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...collectSources(fullPath));
		} else if (entry.name.endsWith('.js') && entry.name !== 'bundle.js') {
			files.push(fullPath);
		}
	}
	return files;
}

const sources = collectSources(sourceRoot).map(file => ({
	file: path.relative(repoRoot, file).split(path.sep).join('/'),
	text: fs.readFileSync(file, 'utf8')
}));

const corpus = sources.map(source => source.text).join('\n');

// Indented `name(args) {` — class body methods, not top-level functions.
const DEFINITION = /^\s{1,8}(?:static\s+)?(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(([^)\n]*)\)\s*\{/gm;

const definitions = new Map();
for (const { file, text } of sources) {
	DEFINITION.lastIndex = 0;
	let match;
	while ((match = DEFINITION.exec(text))) {
		const name = match[1];
		if (NOT_METHODS.has(name)) continue;
		const line = text.slice(0, match.index).split('\n').length;
		if (!definitions.has(name)) definitions.set(name, []);
		definitions.get(name).push(`${file}:${line}`);
	}
}

const unreferenced = [];
for (const [name, locations] of definitions) {
	// A reference is the name preceded by a property access, an index, or a
	// string quote — which excludes the declaration site itself.
	const referenced = new RegExp('[.\\[\'"`]' + name.replace(/\$/g, '\\$') + '\\b').test(corpus);
	if (!referenced) unreferenced.push({ name, locations });
}

unreferenced.sort((a, b) => a.name.localeCompare(b.name));
for (const { name, locations } of unreferenced) {
	console.log(name.padEnd(38) + locations.join(', '));
}
console.log(`\n${unreferenced.length} unreferenced of ${definitions.size} method names across ${sources.length} files.`);
