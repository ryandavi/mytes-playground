const fs = require('fs');
const path = require('path');

const dataDir = path.resolve(__dirname, '../data/mytes');
const species = JSON.parse(fs.readFileSync(path.join(dataDir, 'species.json'), 'utf8')).species ?? [];
const files = ['myte.json', ...species.map(entry => entry.definitionFile)];

for (const fileName of files) {
    const filePath = path.join(dataDir, fileName);
    const definition = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const anchor = definition.spatial?.anchors?.['carry.item'];
    if (!anchor) continue;

    const size = definition.size ?? { width: 192, height: 192 };
    const toPosition = value => ({
        xFactor: value.x / size.width,
        yFactor: value.y / size.height
    });
    const socket = definition.sockets?.['carry.item'] ?? {
        kind: 'hold',
        position: toPosition(anchor),
        accepts: ['object', 'item'],
        capacity: 1,
        zBias: 2,
        collision: 'disabled',
        byFacing: {}
    };

    for (const [facing, direction] of Object.entries(definition.spatial?.directions ?? {})) {
        const directionalAnchor = direction.anchors?.['carry.item'];
        if (directionalAnchor) {
            socket.byFacing[facing] = { position: toPosition({ ...anchor, ...directionalAnchor }) };
        }
    }

    definition.sockets = { ...(definition.sockets ?? {}), 'carry.item': socket };
    if (fileName === 'myte.json' && !definition.sockets['carry.myte']) {
        definition.sockets['carry.myte'] = {
            kind: 'hold',
            position: { xFactor: 0.5, yFactor: 0.265625 },
            accepts: ['myte'],
            capacity: 1,
            zBias: 2,
            collision: 'disabled'
        };
    }
    if (process.argv.includes('--write')) {
        fs.writeFileSync(filePath, `${JSON.stringify(definition, null, 2)}\n`);
    }
}

console.log(process.argv.includes('--write')
    ? 'Converted Myte carry anchors to hold sockets.'
    : 'Myte hold socket conversion is valid. Run with --write to apply it.');
