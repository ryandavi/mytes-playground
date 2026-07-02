const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const manifestPath = path.join(__dirname, 'script-manifest.json');
const targetFiles = ['index.html', 'index.php'];
const markerStart = '<!-- SCRIPTS:BEGIN -->';
const markerEnd = '<!-- SCRIPTS:END -->';

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
			files.push(normalizePath(path.relative(repoRoot, fullPath)));
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

function rewriteScriptBlock(filePath, manifest) {
	const absolutePath = path.join(repoRoot, filePath);
	const original = fs.readFileSync(absolutePath, 'utf8');
	const eol = original.includes('\r\n') ? '\r\n' : '\n';
	const blockPattern = new RegExp(
		`(^[\\t ]*${escapeRegExp(markerStart)}[\\t ]*$)([\\s\\S]*?)(^[\\t ]*${escapeRegExp(markerEnd)}[\\t ]*$)`,
		'm'
	);

	if (!blockPattern.test(original)) {
		throw new Error(`Missing ${markerStart} / ${markerEnd} markers in ${filePath}.`);
	}

	const generatedBlock = buildBlock(manifest, filePath.endsWith('.php'), eol);
	const nextContent = original.replace(blockPattern, `$1${eol}${generatedBlock}$3`);

	if (nextContent !== original) {
		fs.writeFileSync(absolutePath, nextContent, 'utf8');
	}
}

function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function main() {
	const manifest = readJson(manifestPath);
	validateManifest(manifest);
	targetFiles.forEach((filePath) => rewriteScriptBlock(filePath, manifest));
}

try {
	main();
} catch (error) {
	console.error(error.message);
	process.exit(1);
}
