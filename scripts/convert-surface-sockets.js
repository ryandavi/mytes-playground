const fs = require('fs');
const path = require('path');

const filePath = path.resolve(__dirname, '../data/map-objects/types.json');
const catalog = JSON.parse(fs.readFileSync(filePath, 'utf8'));

function defaultApproach(facing, gap) {
    const sideByFacing = { N: 'top', S: 'bottom', E: 'right', W: 'left' };
    return {
        allowedSides: [sideByFacing[facing] ?? 'bottom'],
        preferredSide: null,
        gap,
        align: 'center',
        alignTo: 'collider',
        myteAlignTo: 'collider'
    };
}

function convertBed(bed) {
    const action = bed?.actionConfigs?.use_surface_slot;
    if (!action) throw new Error('BED.use_surface_slot configuration is required.');

    const exit = {
        returnToEntry: action.returnToEntry !== false,
        gap: action.exitGap,
        searchRadius: action.exitSearchRadius
    };
    let convertedDirections = 0;

    for (const variant of Object.values(bed.variantConfigs ?? {})) {
        for (const [facing, direction] of Object.entries(variant.directionConfigs ?? {})) {
            if (!direction.mytePosition) continue;
            direction.sockets = {
                sleep: {
                    kind: 'sleep',
                    position: direction.mytePosition,
                    facing: direction.myteFacing ?? facing,
                    accepts: ['myte'],
                    capacity: 1,
                    zBias: 2,
                    collision: 'disabled',
                    approach: defaultApproach(direction.myteFacing ?? facing, action.entryGap),
                    entryGap: action.entryGap,
                    exit
                }
            };
            delete direction.mytePosition;
            delete direction.myteFacing;
            convertedDirections++;
        }
    }

    if (!convertedDirections && !Object.values(bed.variantConfigs ?? {}).some(variant =>
        Object.values(variant.directionConfigs ?? {}).some(direction => direction.sockets?.sleep)
    )) {
        throw new Error('BED conversion found no direction-specific rest positions.');
    }

    for (const key of [
        'exclusive', 'entryGap', 'exitGap', 'exitSearchRadius', 'returnToEntry',
        'stuckCompletionDistance', 'maxFinalAdjustmentDistance', 'slots', 'slotsByFacing',
        'mytePosition', 'myteFacing'
    ]) {
        delete action[key];
    }
}

convertBed(catalog.BED);

if (process.argv.includes('--write')) {
    fs.writeFileSync(filePath, `${JSON.stringify(catalog, null, 2)}\n`);
    console.log('Converted BED surface positions to per-facing sleep sockets.');
} else {
    console.log('BED socket conversion is valid. Run with --write to apply it.');
}
