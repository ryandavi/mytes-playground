const fs = require('fs');
const path = require('path');

const filePath = path.resolve(__dirname, '../data/map-objects/types.json');
const catalog = JSON.parse(fs.readFileSync(filePath, 'utf8'));
const couch = catalog.COUCH;
const actionConfig = couch?.actionConfigs?.use_surface_slot;

if (!couch || !actionConfig) {
    throw new Error('COUCH.use_surface_slot configuration is required for the socket conversion.');
}

if (!couch.sockets) {
    const slotsByFacing = actionConfig.slotsByFacing;
    const southSlots = slotsByFacing?.S;
    if (!Array.isArray(southSlots) || southSlots.length !== 2) {
        throw new Error('COUCH conversion expects exactly two south-facing seats.');
    }

    couch.sockets = Object.fromEntries(southSlots.map((southSlot, index) => {
        const socket = {
            kind: 'seat',
            position: southSlot.restPosition,
            facing: southSlot.restFacing,
            accepts: ['myte'],
            capacity: 1,
            zBias: 2,
            collision: 'disabled',
            approach: southSlot.approachConfig,
            entryGap: actionConfig.entryGap,
            exit: {
                returnToEntry: actionConfig.returnToEntry !== false,
                gap: actionConfig.exitGap,
                searchRadius: actionConfig.exitSearchRadius
            },
            byFacing: {}
        };

        for (const facing of ['N', 'E', 'W']) {
            const slot = slotsByFacing?.[facing]?.[index];
            if (!slot) {
                socket.byFacing[facing] = null;
                continue;
            }
            socket.byFacing[facing] = {
                position: slot.restPosition,
                facing: slot.restFacing,
                approach: slot.approachConfig
            };
        }

        return [`seat_${index === 0 ? 'a' : 'b'}`, socket];
    }));

    for (const key of [
        'exclusive', 'entryGap', 'exitGap', 'exitSearchRadius', 'returnToEntry',
        'stuckCompletionDistance', 'maxFinalAdjustmentDistance', 'slots', 'slotsByFacing',
        'mytePosition', 'myteFacing'
    ]) {
        delete actionConfig[key];
    }
}

if (process.argv.includes('--write')) {
    fs.writeFileSync(filePath, `${JSON.stringify(catalog, null, 2)}\n`);
    console.log('Converted COUCH surface slots to sockets.');
} else {
    console.log('COUCH socket conversion is valid. Run with --write to apply it.');
}
