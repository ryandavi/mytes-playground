// Curiously inspect an object from multiple angles
class InspectAction extends PositionableAction {
    static metadata = {
        id: 'inspect',
        label: 'Inspect',
        category: 'interactions',
        priority: 2,
        isMovementAction: true,
        isInterruptible: true,
        defaultDuration: 3000,
        description: 'Curiously inspect an object from different angles',
        requiresTarget: true,
        affectsMood: true,
        moodEffect: 2,
        defaultOptions: {
            pointDuration: 500,
            numPoints: 4,
            expressionType: 'curious',
            expressionDuration: 300
        }
    };

    static canPerform(selected, active) {
        return active && selected instanceof MapObject && !active.queue.isCarrying();
    }

    constructor(myte, options) {
        super(myte, {
            ...InspectAction.metadata.defaultOptions,
            duration: InspectAction.metadata.defaultDuration,
            ...options
        });
        this.inspectPoints = [];
        this.currentPoint  = 0;
        this.pointTimer    = this.pointDuration;
    }

    start() {
        super.start();
        this.inspectPoints = this._generateInspectPoints();
    }

    _generateInspectPoints() {
        const targetRect = this.getRect(this.target);
        const myteRect   = this.myte.getRect();
        const points     = [];

        for (let i = 0; i < this.numPoints; i++) {
            const horizontal = i % 2 === 0 ? 'left' : 'right';
            const vertical   = i < this.numPoints / 2 ? 'top' : 'bottom';
            points.push(this.calculatePosition(myteRect, targetRect, horizontal, {
                gap:   15,
                align: vertical === 'top' ? 'top-edge' : 'bottom-edge'
            }));
        }
        return points;
    }

    update() {
        this.pointTimer -= 16;
        if (this.pointTimer <= 0) {
            this.currentPoint = (this.currentPoint + 1) % this.inspectPoints.length;
            this.pointTimer   = this.pointDuration;
        }

        const point = this.inspectPoints[this.currentPoint];
        this.myte.setTarget(point.x, point.y);
        this.myte.moveTowardsTarget();

        this.currentDuration--;
        return this.currentDuration <= 0;
    }
}

// Eat a consumable object — approaches it, removes it on completion
class EatElementAction extends GoToObjectAction {
    static metadata = {
        id: 'eat_element',
        label: 'Eat',
        category: 'interactions',
        priority: 2,
        isMovementAction: false,
        isInterruptible: false,
        defaultDuration: 0,
        description: 'Consume an edible object',
        requiresTarget: true,
        affectsMood: true,
        moodEffect: 5,
        defaultOptions: {
            targetPosition: { vertical: 'bottom', insideHorizontal: false, insideVertical: true }
        }
    };

    static canPerform(selected, active) {
        return active && selected instanceof MapObject && !active.queue.isCarrying();
    }

    complete() {
        super.complete();
        this.target?.remove?.();
    }
}

// Open a TreasureChestMapObject — queued by the chest's press() or directly
class OpenChestAction extends GoToObjectAction {
    static metadata = {
        id: 'open_chest',
        label: 'Open Chest',
        category: 'interactions',
        priority: 3,
        isMovementAction: true,
        isInterruptible: true,
        defaultDuration: 0,
        description: 'Approach and open a treasure chest',
        requiresTarget: true,
        affectsMood: true,
        moodEffect: 10,
        defaultOptions: {
            // Overridden: chest defines its own approach mode ('side')
        }
    };

    static canPerform(selected, active) {
        return active &&
               selected?.constructor?.name === 'TreasureChestMapObject' &&
               selected.state === 'closed' &&
               !active.queue.isCarrying();
    }

    static getRequiredOptions(selected, active) {
        return { target: selected };
    }

    complete() {
        super.complete();
        if (this.target?.open) {
            this.target.open(this.myte.parent);
        }
        this.myte.queue.addExpression('excited', 300, 2);
    }
}

// Smell a flower — approach from the side, lean in
class SmellFlowerAction extends GoToObjectAction {
    static metadata = {
        id: 'smell_flower',
        label: 'Smell Flower',
        category: 'interactions',
        priority: 2,
        isMovementAction: true,
        isInterruptible: true,
        defaultDuration: 0,
        description: 'Approach and smell a flower',
        requiresTarget: true,
        affectsMood: true,
        moodEffect: 6,
        defaultOptions: {}
    };

    static canPerform(selected, active) {
        const name = selected?.constructor?.name ?? '';
        const isFlower = name.includes('Flower') || name.includes('Plant') || name.includes('Bloom');
        return active && isFlower && !active.queue.isCarrying();
    }

    static getRequiredOptions(selected, active) {
        return { target: selected };
    }

    complete() {
        super.complete();
        // Placeholder for 'smell' animation when available
        this.myte.queue.addExpression('heart', 400, 1);
        this.myte.queue.addIdle(60);
    }
}

// Drink from a FountainMapObject — approach adjacent, lean in
class DrinkFromFountainAction extends GoToObjectAction {
    static metadata = {
        id: 'drink_fountain',
        label: 'Drink',
        category: 'interactions',
        priority: 2,
        isMovementAction: true,
        isInterruptible: true,
        defaultDuration: 0,
        description: 'Drink from a fountain',
        requiresTarget: true,
        affectsMood: true,
        moodEffect: 5,
        defaultOptions: {}
    };

    static canPerform(selected, active) {
        return active &&
               selected?.constructor?.name === 'FountainMapObject' &&
               !active.queue.isCarrying();
    }

    static getRequiredOptions(selected, active) {
        return { target: selected };
    }

    complete() {
        super.complete();
        this.myte.queue.addIdle(80);
    }
}

// Water a CropPlantMapObject
class WaterPlantAction extends GoToObjectAction {
    static metadata = {
        id: 'water_plant',
        label: 'Water Plant',
        category: 'interactions',
        priority: 2,
        isMovementAction: true,
        isInterruptible: true,
        defaultDuration: 0,
        description: 'Water a crop plant',
        requiresTarget: true,
        affectsMood: true,
        moodEffect: 4,
        defaultOptions: {}
    };

    static canPerform(selected, active) {
        return active &&
               selected?.constructor?.name === 'CropPlantMapObject' &&
               !active.queue.isCarrying();
    }

    static getRequiredOptions(selected, active) {
        return { target: selected };
    }

    complete() {
        super.complete();
        if (this.target?.water) {
            this.target.water();
        }
        this.myte.queue.addIdle(40);
    }
}

// Harvest a CropPlantMapObject
class HarvestAction extends GoToObjectAction {
    static metadata = {
        id: 'harvest',
        label: 'Harvest',
        category: 'interactions',
        priority: 2,
        isMovementAction: true,
        isInterruptible: true,
        defaultDuration: 0,
        description: 'Harvest a ready crop',
        requiresTarget: true,
        affectsMood: true,
        moodEffect: 8,
        defaultOptions: {}
    };

    static canPerform(selected, active) {
        return active &&
               selected?.constructor?.name === 'CropPlantMapObject' &&
               selected.isReadyToHarvest?.() &&
               !active.queue.isCarrying();
    }

    static getRequiredOptions(selected, active) {
        return { target: selected };
    }

    complete() {
        super.complete();
        if (this.target?.harvest) {
            this.target.harvest(this.myte);
        }
        this.myte.queue.addExpression('excited', 300, 1);
    }
}
