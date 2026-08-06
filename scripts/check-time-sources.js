const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const jsRoot = path.join(repoRoot, 'js');
const allowed = [
    /^Engine\/(Core|LoadingManager|ResourceManager|SimClock|SoundManager)\.js$/,
    /^Input\//,
    /^Map\/Grid\/AStarPathfinder\.js$/,
    /^Map\/MapEnvironmentManager\.js$/,
    /^Map\/MapObjects\/(DroppedMapItem|MapObjectInputController)\.js$/,
    /^Map\/MapObjects\/Moving\/BallMapObject\.js$/,
    /^Map\/MapTransitionManager\.js$/,
    /^Map\/WorldState\.js$/,
    /^Myte\/(FootstepController|MyteRenderer)\.js$/,
    /^Myte\/Input\//,
    /^UI\//,
    /^Utility\/Utility\.js$/
];

function walk(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const absolute = path.join(directory, entry.name);
        return entry.isDirectory() ? walk(absolute) : [absolute];
    });
}

const violations = [];
for (const file of walk(jsRoot)) {
    if (!file.endsWith('.js') || file.endsWith(`${path.sep}bundle.js`)) continue;
    const relative = path.relative(jsRoot, file).replaceAll('\\', '/');
    if (allowed.some(pattern => pattern.test(relative))) continue;
    fs.readFileSync(file, 'utf8').split(/\r?\n/).forEach((line, index) => {
        if (/\b(?:performance|Date)\.now\s*\(/.test(line)) {
            violations.push(`${relative}:${index + 1}: ${line.trim()}`);
        }
    });
}

if (violations.length > 0) {
    console.error('Gameplay code must use SimClock.now():');
    violations.forEach(violation => console.error(`  ${violation}`));
    process.exit(1);
}

console.log('Time-source check passed.');
