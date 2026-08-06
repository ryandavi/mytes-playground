const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const sourceRoots = ['js', 'data', 'css'];
const sourceExtensions = new Set(['.js', '.json', '.scss']);
const excludedPaths = new Set([
    path.join(repoRoot, 'js', 'bundle.js')
]);
const mojibakeMarkers = ['\uFFFD', 'Ã', 'Â', 'â'];
const failures = [];

function inspectFile(filePath) {
    if (excludedPaths.has(filePath) || filePath.includes(`${path.sep}vendor${path.sep}`)) return;
    const text = fs.readFileSync(filePath, 'utf8');
    const marker = mojibakeMarkers.find(candidate => text.includes(candidate));
    if (!marker) return;

    const offset = text.indexOf(marker);
    const line = text.slice(0, offset).split(/\r?\n/).length;
    failures.push(`${path.relative(repoRoot, filePath)}:${line} contains mojibake marker ${JSON.stringify(marker)}`);
}

function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            walk(entryPath);
        } else if (sourceExtensions.has(path.extname(entry.name).toLowerCase())) {
            inspectFile(entryPath);
        }
    }
}

sourceRoots.forEach(root => walk(path.join(repoRoot, root)));
inspectFile(path.join(repoRoot, 'index.html'));

if (failures.length) {
    console.error('Text encoding check failed:');
    failures.forEach(failure => console.error(`- ${failure}`));
    process.exitCode = 1;
} else {
    console.log('Text encoding check passed.');
}
