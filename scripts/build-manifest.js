const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const repoRoot = path.resolve(__dirname, '..');
const manifestPath = path.join(__dirname, 'script-manifest.json');
const targetFiles = ['index.html'];
const markerStart = '<!-- SCRIPTS:BEGIN -->';
const markerEnd = '<!-- SCRIPTS:END -->';
const bundlePath = path.join(repoRoot, 'js', 'bundle.js');

function readJson(filePath) {
	return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function normalizePath(filePath) {
	return filePath.replace(/\\/g, '/');
}

function collectJsFiles(dirPath) {
	const files = [];
	for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
		const fullPath = path.join(dirPath, entry.name);
		if (entry.isDirectory()) {
			files.push(...collectJsFiles(fullPath));
			continue;
		}

		if (entry.isFile() && entry.name.endsWith('.js')) {
			const relativePath = normalizePath(path.relative(repoRoot, fullPath));
			if (relativePath === 'js/bundle.js') {
				continue;
			}
			files.push(relativePath);
		}
	}
	return files;
}

function validateManifest(manifest) {
	if (!Array.isArray(manifest) || manifest.length === 0) {
		throw new Error('scripts/script-manifest.json must contain a non-empty array.');
	}

	const localManifestEntries = [];
	const seenSources = new Set();

	manifest.forEach((entry, index) => {
		if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
			throw new Error(`Manifest entry ${index + 1} must be an object.`);
		}

		if (typeof entry.src !== 'string' || entry.src.length === 0) {
			throw new Error(`Manifest entry ${index + 1} is missing a valid "src".`);
		}

		if (seenSources.has(entry.src)) {
			throw new Error(`Duplicate manifest entry: ${entry.src}`);
		}
		seenSources.add(entry.src);

		if (entry.commentLine !== undefined && typeof entry.commentLine !== 'string') {
			throw new Error(`Manifest entry ${index + 1} has a non-string "commentLine".`);
		}

		if (entry.blankLineBefore !== undefined && entry.blankLineBefore !== true) {
			throw new Error(`Manifest entry ${index + 1} has an invalid "blankLineBefore" value.`);
		}

		if (
			entry.phpLineEnding !== undefined &&
			entry.phpLineEnding !== 'lf' &&
			entry.phpLineEnding !== 'crlf'
		) {
			throw new Error(`Manifest entry ${index + 1} has an invalid "phpLineEnding" value.`);
		}

		if (entry.cdn === true) {
			return;
		}

		const normalizedSource = normalizePath(entry.src);
		const resolvedPath = path.join(repoRoot, normalizedSource);
		if (!fs.existsSync(resolvedPath)) {
			throw new Error(`Manifest references a missing file: ${normalizedSource}`);
		}
		localManifestEntries.push(normalizedSource);
	});

	const jsFiles = collectJsFiles(path.join(repoRoot, 'js')).sort();
	const manifestSet = new Set(localManifestEntries);
	const unreferencedFiles = jsFiles.filter((filePath) => !manifestSet.has(filePath));
	if (unreferencedFiles.length > 0) {
		throw new Error(
			[
				'The following js/ files are not present in scripts/script-manifest.json:',
				...unreferencedFiles.map((filePath) => `- ${filePath}`),
			].join('\n')
		);
	}
}

function buildEntryBlock(manifest, defaultEol, bundleVersion) {
	const cdnEntry = manifest.find((entry) => entry.cdn === true);
	const lines = [];

	if (cdnEntry) {
		lines.push(`\t<script src="${cdnEntry.src}" defer></script>`);
	}

    lines.push(`\t<script src="js/bundle.js?v=${bundleVersion}"></script>`);

	return lines.join(defaultEol) + defaultEol;
}

function rewriteScriptBlock(filePath, manifest, bundleVersion) {
	const absolutePath = path.join(repoRoot, filePath);
	const source = fs.readFileSync(absolutePath, 'utf8');
	const original = source.replace(/\r\n?/g, '\n');
    const nextContent = rewriteScriptBlockContent(original, manifest, bundleVersion).replace(/\n/g, '\r\n');

	if (nextContent !== source) {
		fs.writeFileSync(absolutePath, nextContent, 'utf8');
	}
}

function rewriteScriptBlockContent(original, manifest, bundleVersion) {
	const eol = original.includes('\r\n') ? '\r\n' : '\n';
	const blockPattern = new RegExp(
		`(^[\\t ]*${escapeRegExp(markerStart)}[\\t ]*$)([\\s\\S]*?)(^[\\t ]*${escapeRegExp(markerEnd)}[\\t ]*$)`,
		'm'
	);

	if (!blockPattern.test(original)) {
		throw new Error(`Missing ${markerStart} / ${markerEnd} markers in HTML entry file.`);
	}

    const generatedBlock = buildEntryBlock(manifest, eol, bundleVersion);
	return original.replace(blockPattern, `$1${eol}${generatedBlock}$3`);
}

function writeBundle(manifest) {
	const segments = [];
	for (const entry of manifest) {
		if (entry.cdn === true) continue;
		const sourcePath = path.join(repoRoot, normalizePath(entry.src));
		const source = fs.readFileSync(sourcePath, 'utf8');
		segments.push(`/* -- ${normalizePath(entry.src)} -- */\n${source}`);
	}

    const bundle = `${segments.join(';\n')}\n`;
    fs.writeFileSync(bundlePath, bundle, 'utf8');
    return crypto.createHash('sha256').update(bundle).digest('hex').slice(0, 12);
}

function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function main() {
	const manifest = readJson(manifestPath);
	validateManifest(manifest);
    const bundleVersion = writeBundle(manifest);
    targetFiles.forEach((filePath) => rewriteScriptBlock(filePath, manifest, bundleVersion));
}

try {
	main();
} catch (error) {
	console.error(error.message);
	process.exit(1);
}
