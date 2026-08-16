const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const jsRoot = path.join(repoRoot, 'js');
const allowed = [
    /^Engine\/(Core|LoadingManager|ResourceManager|SimClock|SoundManager)\.js$/,
    /^Input\//,
    // The camera is presentation, not simulation: edge scrolling has to keep
    // panning at a real-world rate while build mode holds SimClock stopped.
    /^Map\/Camera\.js$/,
    // Same reasoning for the wall cutaway: it is presentation, and it has to
    // keep tracking the cursor while build mode holds SimClock stopped.
    /^Map\/Walls\/WallBuilder\.js$/,
    // The Tiled exporter is a dev tool talking to a file on disk: its Date.now()
    // is a cache-buster on a fetch, which has to be wall-clock to work at all.
    /^Map\/Walls\/WallTiledExporter\.js$/,
    /^Map\/Grid\/AStarPathfinder\.js$/,
    /^Map\/MapEnvironmentManager\.js$/,
    /^Map\/MapObjects\/(DroppedMapItem|MapObjectInputController)\.js$/,
    /^Map\/MapObjects\/Moving\/BallMapObject\.js$/,
    /^Map\/MapTransitionManager\.js$/,
    /^Map\/WorldState\.js$/,
    /^Myte\/(FootstepController|MyteRenderer)\.js$/,
    /^Myte\/Input\//,
    /^UI\//,
	// Save timestamps and welcome-back elapsed time are persistence/UI wall-clock data.
	/^User\/User\.js$/,
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
