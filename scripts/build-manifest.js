const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const manifestPath = path.join(__dirname, 'script-manifest.json');
const targetFiles = ['index.html', 'index.php'];
const bundledTargetFiles = ['index.bundled.html', 'index.bundled.php'];
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

function buildBlock(manifest, isPhp, defaultEol) {
	let block = '';

	for (const entry of manifest) {
		if (entry.blankLineBefore) {
			block += defaultEol;
		}

		if (entry.commentLine) {
			block += `\t${entry.commentLine}${defaultEol}`;
		}

		const src = isPhp && entry.cdn !== true ? `${entry.src}?v=<?= $v ?>` : entry.src;
		const scriptEol =
			isPhp && entry.phpLineEnding === 'lf'
				? '\n'
				: isPhp && entry.phpLineEnding === 'crlf'
					? '\r\n'
					: defaultEol;
		block += `\t<script src="${src}"></script>${scriptEol}`;
	}

	return block;
}

function buildBundledBlock(manifest, isPhp, defaultEol) {
	const cdnEntry = manifest.find((entry) => entry.cdn === true);
	const lines = [];

	if (cdnEntry) {
		lines.push(`\t<script src="${cdnEntry.src}" defer></script>`);
	}

	const bundleSrc = isPhp
		? 'js/bundle.js?v=<?= $v ?>'
		: 'js/bundle.js';
	lines.push(`\t<script src="${bundleSrc}"></script>`);

	return lines.join(defaultEol) + defaultEol;
}

function rewriteScriptBlock(filePath, manifest) {
	const absolutePath = path.join(repoRoot, filePath);
	const original = fs.readFileSync(absolutePath, 'utf8');
	const nextContent = rewriteScriptBlockContent(original, manifest, filePath.endsWith('.php'));

	if (nextContent !== original) {
		fs.writeFileSync(absolutePath, nextContent, 'utf8');
	}
}

function rewriteScriptBlockContent(original, manifest, isPhp, { bundled = false } = {}) {
	const eol = original.includes('\r\n') ? '\r\n' : '\n';
	const blockPattern = new RegExp(
		`(^[\\t ]*${escapeRegExp(markerStart)}[\\t ]*$)([\\s\\S]*?)(^[\\t ]*${escapeRegExp(markerEnd)}[\\t ]*$)`,
		'm'
	);

	if (!blockPattern.test(original)) {
		throw new Error(`Missing ${markerStart} / ${markerEnd} markers in ${isPhp ? 'PHP entry file' : 'HTML entry file'}.`);
	}

	const generatedBlock = bundled
		? buildBundledBlock(manifest, isPhp, eol)
		: buildBlock(manifest, isPhp, eol);
	return original.replace(blockPattern, `$1${eol}${generatedBlock}$3`);
}

function writeBundledEntries(manifest) {
	targetFiles.forEach((sourceFile, index) => {
		const sourcePath = path.join(repoRoot, sourceFile);
		const original = fs.readFileSync(sourcePath, 'utf8');
		const isPhp = sourceFile.endsWith('.php');
		const nextContent = rewriteScriptBlockContent(original, manifest, isPhp, { bundled: true });
		fs.writeFileSync(path.join(repoRoot, bundledTargetFiles[index]), nextContent, 'utf8');
	});
}

function writeBundle(manifest) {
	const segments = [];
	for (const entry of manifest) {
		if (entry.cdn === true) continue;
		const sourcePath = path.join(repoRoot, normalizePath(entry.src));
		const source = fs.readFileSync(sourcePath, 'utf8');
		segments.push(`/* -- ${normalizePath(entry.src)} -- */\n${source}`);
	}

	fs.writeFileSync(bundlePath, `${segments.join(';\n')}\n`, 'utf8');
}

function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function main() {
	const wantsBundle = process.argv.includes('--bundle');
	const manifest = readJson(manifestPath);
	validateManifest(manifest);
	targetFiles.forEach((filePath) => rewriteScriptBlock(filePath, manifest));
	if (wantsBundle) {
		writeBundle(manifest);
		writeBundledEntries(manifest);
	}
}

try {
	main();
} catch (error) {
	console.error(error.message);
	process.exit(1);
}
