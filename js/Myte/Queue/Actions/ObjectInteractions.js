// Pause beside an object and quietly observe it.
class InspectAction extends GoToObjectAction {
    static metadata = {
        id: 'inspect',
        label: 'Inspect',
        category: 'interactions',
        priority: 2,
        isMovementAction: true,
        isInterruptible: true,
        defaultDuration: 90,
        description: 'Pause beside an object and inspect it naturally',
        requiresTarget: true,
        affectsMood: true,
        moodEffect: 2,
        defaultOptions: {
            expressionType: 'curious',
            expressionDuration: 40,
            lookInterval: 22
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
        this.phase = 'approach';
        this.lookTimer = this.lookInterval;
        this.lookDirection = 1;
        this.baseDirection = null;
    }

    getQueueTitle() {
        const targetLabel = this.getQueueTargetLabel(this.target);
        return targetLabel ? `Inspect ${targetLabel}` : 'Inspect';
    }

    start() {
        super.start();
    }

    update() {
        if (this.phase === 'approach') {
            const arrived = super.update();
            if (!arrived) {
                return false;
            }

            this.phase = 'observe';
            this.currentDuration = this.duration;
            this.baseDirection = this.myte.direction;
            if (this.expressionType) {
                this.myte.queue.addExpression(this.expressionType, this.expressionDuration, 1);
            }
        }

        this.faceTarget();
        this.lookTimer--;

        if (this.lookTimer <= 0) {
            this.lookTimer = this.lookInterval;
            this.lookDirection *= -1;

            if (this.baseDirection === DIRECTION.NORTH || this.baseDirection === DIRECTION.SOUTH) {
                this.myte.setDirection(this.lookDirection > 0 ? DIRECTION.NORTH : DIRECTION.SOUTH);
            } else {
                this.myte.setDirection(this.lookDirection > 0 ? DIRECTION.EAST : DIRECTION.WEST);
            }
        }

        this.currentDuration--;
        return this.currentDuration <= 0;
    }
}

// Rare, more obsessive investigation pattern that circles an object.
class DeepInspectAction extends PositionableAction {
    static metadata = {
        id: 'deep_inspect',
        label: 'Inspect Oddly',
        category: 'interactions',
        priority: 3,
        isMovementAction: true,
        isInterruptible: true,
        defaultDuration: 150,
        description: 'Investigate an object from several odd angles',
        requiresTarget: true,
        affectsMood: true,
        moodEffect: 3,
        defaultOptions: {
            pointDuration: 24,
            numPoints: 3,
            expressionType: 'surprise',
            expressionDuration: 30
        }
    };

    static canPerform(selected, active) {
        return active && selected instanceof MapObject && !active.queue.isCarrying();
    }

    constructor(myte, options) {
        super(myte, {
            ...DeepInspectAction.metadata.defaultOptions,
            duration: DeepInspectAction.metadata.defaultDuration,
            ...options
        });
        this.inspectPoints = [];
        this.currentPoint = 0;
        this.pointTimer = this.pointDuration;
    }

    getQueueTitle() {
        const targetLabel = this.getQueueTargetLabel(this.target);
        return targetLabel ? `Inspect ${targetLabel} Oddly` : 'Inspect Oddly';
    }

    start() {
        super.start();
        this.inspectPoints = this._generateInspectPoints();
        if (this.expressionType) {
            this.myte.queue.addExpression(this.expressionType, this.expressionDuration, 1);
        }
    }

    _generateInspectPoints() {
        const targetRect = this.getRect(this.target);
        const myteRect = this.myte.getRect();
        const points = [];

        for (let i = 0; i < this.numPoints; i++) {
            const horizontal = i % 2 === 0 ? 'left' : 'right';
            const vertical = i < Math.ceil(this.numPoints / 2) ? 'top' : 'bottom';
            points.push(this.calculatePosition(myteRect, targetRect, horizontal, {
                gap: 15,
                align: vertical === 'top' ? 'top-edge' : 'bottom-edge'
            }));
        }

        return points;
    }

    update() {
        this.pointTimer--;
        if (this.pointTimer <= 0) {
            this.currentPoint = (this.currentPoint + 1) % this.inspectPoints.length;
            this.pointTimer = this.pointDuration;
        }

        const point = this.inspectPoints[this.currentPoint];
        this.myte.setTarget(point.x, point.y);
        this.myte.moveTowardsTarget();

        this.currentDuration--;
        return this.currentDuration <= 0;
    }
}

class InteractObjectAction extends GoToObjectAction {
    static metadata = {
        id: 'interact_object',
        label: 'Use',
        category: 'interactions',
        priority: 2,
        isMovementAction: true,
        isInterruptible: true,
        defaultDuration: 0,
        description: 'Approach an object and use its main interaction',
        requiresTarget: true,
        affectsMood: true,
        moodEffect: 4,
        defaultOptions: {}
    };

    static canPerform(selected, active) {
        if (!active || !(selected instanceof MapObject) || active.queue.isCarrying()) {
            return false;
        }

        const interactionType = selected.getConfig?.('interactionType');
        return interactionType === 'dance' || interactionType === 'light' || interactionType === 'toggle';
    }

    static getRequiredOptions(selected) {
        return { target: selected };
    }

    complete() {
        super.complete();

        const hasCustomPress = typeof this.target?.press === 'function' && this.target.press !== MapObject.prototype.press;
        if (hasCustomPress) {
            this.target.press(this.myte.parent);
        } else {
            this.target?.interact?.(this.myte);
        }

        const interactionType = this.target?.getConfig?.('interactionType');
        if (interactionType === 'dance') {
            this.myte.queue.addDance(90);
        } else if (interactionType === 'light') {
            this.myte.queue.addIdle(35);
        }
    }
}

class RestOnBedAction extends GoToObjectAction {
    static metadata = {
        id: 'rest_on_bed',
        label: 'Rest',
        category: 'interactions',
        priority: 2,
        isMovementAction: true,
        isInterruptible: true,
        defaultDuration: 180,
        description: 'Settle onto a bed and rest for a while',
        requiresTarget: true,
        affectsMood: true,
        moodEffect: 7,
        defaultOptions: {
            bobHeight: 3,
            bobSpeed: 0.12,
            energyRestore: 18,
            healthRestore: 5,
            comfortBoost: 14,
            moodBoost: 8,
            approachConfig: {
                allowedSides: ['center'],
                preferredSide: 'center',
                gap: 0,
                align: 'center',
                alignTo: 'sprite'
            }
        }
    };

    static canPerform(selected, active) {
        return active &&
            selected instanceof MapObject &&
            selected.type?.toUpperCase?.() === 'BED' &&
            !active.queue.isCarrying();
    }

    static getRequiredOptions(selected) {
        return { target: selected };
    }

    constructor(myte, options) {
        super(myte, {
            ...RestOnBedAction.metadata.defaultOptions,
            duration: RestOnBedAction.metadata.defaultDuration,
            ...options
        });
        this.phase = 'approach';
        this.bobPhase = 0;
        this.baseY = myte.posY;
        this._benefitsApplied = false;
        this._restingWithCollisionDisabled = false;
    }

    update() {
        if (this.phase === 'approach') {
            const arrived = super.update();
            if (!arrived) {
                return false;
            }

            this.phase = 'rest';
            this.currentDuration = this.duration;
            const bedPosition = this.getBedRestPosition();
            this.myte.setPosition(bedPosition.x, bedPosition.y);
            this.myte.setTarget(bedPosition.x, bedPosition.y);
            this.myte.setSpritePosition(bedPosition.x, bedPosition.y);
            this.baseY = bedPosition.y;
            this.myte.checkForCollisions = false;
            this._restingWithCollisionDisabled = true;

            const facing = this.target?.getConfig?.('myteFacing');
            if (facing) {
                this.myte.setDirection(facing);
            } else {
                this.faceTarget();
            }

            if (!this._benefitsApplied) {
                this._benefitsApplied = true;
                this.myte.stats.restoreEnergy(this.energyRestore);
                this.myte.stats.heal(this.healthRestore);
                this.myte.stats.updateComfort(this.comfortBoost);
                this.myte.stats.updateMood(this.moodBoost);
            }

            this.myte.queue.addExpression('sleep', 45, 3);
        }

        this.bobPhase += this.bobSpeed;
        const bobY = this.baseY + Math.sin(this.bobPhase) * this.bobHeight;
        this.myte.setPosition(null, bobY);
        this.myte.setSpritePosition(null, bobY);

        this.currentDuration--;
        return this.currentDuration <= 0;
    }

    complete() {
        super.complete();
        this.finishRestingPlacement();
    }

    interrupt() {
        super.interrupt();
        this.finishRestingPlacement();
    }

    getBedRestPosition() {
        const targetXFactor = this.target?.getConfig?.('mytePosition.xFactor', 0.5) ?? 0.5;
        const targetYFactor = this.target?.getConfig?.('mytePosition.yFactor', 0.5) ?? 0.5;

        return {
            x: this.target.posX + (this.target.size.width * targetXFactor) - (this.myte.size.width / 2),
            y: this.target.posY + (this.target.size.height * targetYFactor) - (this.myte.size.height / 2)
        };
    }

    finishRestingPlacement() {
        if (this._restingWithCollisionDisabled) {
            this.myte.checkForCollisions = true;
            this._restingWithCollisionDisabled = false;
        }

        const exitPosition = this.getBedExitPosition();
        this.myte.setPosition(exitPosition.x, exitPosition.y);
        this.myte.setTarget(exitPosition.x, exitPosition.y);
        this.myte.setSpritePosition(exitPosition.x, exitPosition.y);
        this.myte.physicsController?.reset?.();
    }

    getBedExitPosition() {
        const fallback = this.myte.parent?.gameMap?.gridSystem?.findNearestValidPositionForEntity?.(
            this.myte,
            this.myte.posX,
            this.baseY,
            20
        ) ?? { x: this.myte.posX, y: this.baseY };

        if (!this.target) {
            return fallback;
        }

        const targetRect = this.getTargetRect(this.target, 'collider');
        const myteRect = this.myte.getRect();
        if (!targetRect || !myteRect) {
            return fallback;
        }

        const facing = this.target?.getConfig?.('myteFacing') ?? 'S';
        const preferredSideByFacing = {
            N: 'top',
            S: 'bottom',
            E: 'right',
            W: 'left'
        };
        const preferred = preferredSideByFacing[facing] ?? 'bottom';
        const sides = [preferred, 'left', 'right', 'top', 'bottom'].filter((side, index, list) => list.indexOf(side) === index);
        const candidates = sides.map(side => this.calculatePosition(myteRect, targetRect, side, {
            gap: 18,
            align: side === 'left' || side === 'right' ? 'center' : 'center'
        }));
        const gridSystem = this.myte.parent?.gameMap?.gridSystem;
        for (const candidate of candidates) {
            const safe = gridSystem?.findNearestValidPositionForEntity?.(this.myte, candidate.x, candidate.y, 20) ?? candidate;
            if (!safe) {
                continue;
            }

            if (this.myte.canMoveToPosition?.(safe.x, safe.y)) {
                return safe;
            }
        }

        return fallback;
    }
}

class NudgeBallAction extends GoToObjectAction {
    static metadata = {
        id: 'nudge_ball',
        label: 'Nudge Ball',
        category: 'interactions',
        priority: 2,
        isMovementAction: true,
        isInterruptible: true,
        defaultDuration: 0,
        description: 'Run into a ball to get it rolling',
        requiresTarget: true,
        affectsMood: true,
        moodEffect: 6,
        defaultOptions: {
            approachConfig: {
                allowedSides: 'any',
                preferredSide: null,
                gap: 10,
                align: 'center',
                alignTo: 'collider'
            },
            allowStuckSuccess: false,
            stuckCompletionDistance: 10
        }
    };

    static canPerform(selected, active) {
        return active &&
            selected instanceof MapObject &&
            selected.type?.toUpperCase?.() === 'BALL' &&
            !active.queue.isCarrying();
    }

    static getRequiredOptions(selected) {
        return { target: selected };
    }

    complete() {
        this.target?.nudgeBy?.(this.myte);
        super.complete();
        this.myte.queue.addExpression('excited', 30, 1);
        this.myte.queue.addIdle(28);
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
