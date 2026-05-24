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
        return 'Inspect';
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
        return 'Inspect Oddly';
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
        defaultOptions: {
            interactionAnimationDuration: 32,
            postActionIdleDuration: 24
        }
    };

    static canPerform(selected, active) {
        if (!active || !(selected instanceof MapObject) || active.queue.isCarrying()) {
            return false;
        }

        const interactionType = selected.getConfig?.('interactionType');
        if (interactionType === 'teleport') {
            return !!selected.hasTransitionDestination?.() &&
                selected.active !== false &&
                selected.isActive !== false;
        }

        return interactionType === 'dance' || interactionType === 'light' || interactionType === 'toggle';
    }

    static getRequiredOptions(selected) {
        const options = { target: selected };
        if (selected instanceof PortalMapObject) {
            options.interactionAnimationDuration = 0;
            options.postActionIdleDuration = 0;
        }
        return options;
    }

    constructor(myte, options) {
        super(myte, { ...InteractObjectAction.metadata.defaultOptions, ...options });
        this.phase = 'approach';
        this.animationTimer = 0;
    }

    update() {
        if (this.phase === 'approach') {
            const arrived = super.update();
            if (!arrived) return false;
            this.phase = 'interact';
            this.animationTimer = this.interactionAnimationDuration;
            this.faceTarget();
            return false;
        }

        if (this.phase === 'interact') {
            this.faceTarget();
            this.animationTimer--;
            return this.animationTimer <= 0;
        }

        return true;
    }

    complete() {
        this.faceTarget();
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
            this.myte.queue.addIdle(Math.max(35, this.postActionIdleDuration || 0));
        } else if (this.postActionIdleDuration > 0) {
            this.myte.queue.addIdle(this.postActionIdleDuration);
        }
    }
}

class SurfaceSlotAction extends GoToObjectAction {
    static metadata = {
        id: 'use_surface_slot',
        label: 'Use Surface',
        category: 'interactions',
        priority: 2,
        isMovementAction: true,
        isInterruptible: true,
        defaultDuration: 5000,
        description: 'Use a slotted surface and settle into position',
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
            settleDuration: 260,
            dismountDuration: 220,
            entryGap: 10,
            exitGap: 16,
            exitSearchRadius: 20,
            returnToEntry: true,
            stuckCompletionDistance: 14,
            finalApproachSkipDistance: 24,
            maxFinalAdjustmentDistance: 20,
            approachConfig: null
        }
    };

    static canPerform(selected, active) {
        return active &&
            selected instanceof MapObject &&
            !!selected.getActionConfig?.('use_surface_slot') &&
            !active.queue.isCarrying() &&
            !selected.isActionOccupied?.('use_surface_slot', active);
    }

    static getRequiredOptions(selected) {
        return { target: selected };
    }

    getQueueTitle() {
        return this.getTargetActionConfig().label || super.getQueueTitle();
    }

    constructor(myte, options) {
        const target = options?.target ?? null;
        const targetActionConfig = target?.getActionConfig?.('use_surface_slot', {}) ?? {};
        const duration = SurfaceSlotAction.resolveDuration(target, targetActionConfig, options?.duration);
        const approachConfig = options?.approachConfig ??
            targetActionConfig.approachConfig ??
            SurfaceSlotAction.buildDefaultApproachConfig(
                target,
                targetActionConfig,
                options?.entryGap ?? targetActionConfig.entryGap
            );

        super(myte, {
            ...SurfaceSlotAction.metadata.defaultOptions,
            ...targetActionConfig,
            ...options,
            duration,
            approachConfig
        });

        this.phase = 'approach';
        this.bobPhase = 0;
        this.baseY = myte.posY;
        this.baseRestPosition = { x: myte.posX, y: myte.posY };
        this._benefitsApplied = false;
        this._blocked = false;
        this._finishedPlacement = false;
        this._reserved = false;
        this._entryPosition = null;
        this._entrySide = null;
        this._transition = null;
        this._previousCollisionSetting = myte.checkForCollisions;
        this._restingWithCollisionDisabled = false;
        this._selectedSlot = null;
        this._selectedSlotId = null;
    }

    static resolveDuration(target, targetActionConfig = {}, explicitDuration = null) {
        const rawDuration = explicitDuration ??
            targetActionConfig.duration ??
            target?.getConfig?.('restDuration', SurfaceSlotAction.metadata.defaultDuration) ??
            SurfaceSlotAction.metadata.defaultDuration;
        const duration = Number(rawDuration);
        return Number.isFinite(duration) && duration > 0
            ? duration
            : SurfaceSlotAction.metadata.defaultDuration;
    }

    static getRestFacing(target, targetActionConfig = {}) {
        return targetActionConfig.restFacing ??
            targetActionConfig.facing ??
            target?.getConfig?.('myteFacing') ??
            target?.getConfig?.('facingDirection') ??
            'S';
    }

    static buildDefaultApproachConfig(target, targetActionConfig = {}, gap = 10) {
        const facing = SurfaceSlotAction.getRestFacing(target, targetActionConfig);
        const normalizedGap = Number.isFinite(Number(gap)) ? Number(gap) : 10;
        const allowedSides = facing === 'E' || facing === 'W'
            ? ['top', 'bottom']
            : ['left', 'right'];

        return {
            allowedSides,
            preferredSide: null,
            gap: normalizedGap,
            align: 'center',
            alignTo: 'collider',
            myteAlignTo: 'collider'
        };
    }

    start() {
        if (!this.resolveAndClaimSlot()) {
            this._blocked = true;
            this.clearDebugPath();
            return;
        }

        super.start();
        this.currentDuration = this.duration;
    }

    update(deltaTime = 16.667) {
        const dt = Number.isFinite(deltaTime) && deltaTime > 0 ? deltaTime : 16.667;
        if (this._blocked) {
            return true;
        }

        if (this.phase === 'approach') {
            const arrived = super.update(dt);
            if (!arrived) {
                return false;
            }

            this.clearDebugPath();
            this._entryPosition = { x: this.myte.posX, y: this.myte.posY };
            this._entrySide = this.getNearestSideForPosition(this._entryPosition);
            this.applyRestFacing();
            this.beginTransition(
                'settle',
                this._entryPosition,
                this.getSurfaceRestPosition(),
                this.settleDuration
            );
            return false;
        }

        if (this.phase === 'settle' || this.phase === 'dismount') {
            return this.updateTransition(dt);
        }

        if (this.phase !== 'rest') {
            return true;
        }

        this.bobPhase += (dt / 16.667) * this.bobSpeed;
        const bobY = this.baseRestPosition.y + Math.sin(this.bobPhase) * this.bobHeight;
        this.setMyteWorldPosition(this.baseRestPosition.x, bobY);

        const restUntilFull = this.getTargetActionConfig().restUntilFull ?? false;
        if (restUntilFull) {
            // Stay resting until energy is fully restored; AI can still interrupt
            if (this.myte.stats.energy < this.myte.stats.maxEnergy) {
                return false;
            }
        } else {
            this.currentDuration -= dt;
            if (this.currentDuration > 0) {
                return false;
            }
        }

        this.beginTransition(
            'dismount',
            { x: this.myte.posX, y: this.myte.posY },
            this.getSurfaceExitPosition(),
            this.dismountDuration
        );
        return false;
    }

    complete() {
        this.finishSurfacePlacement({ snapToExit: this.phase !== 'done' });
        super.complete();
    }

    interrupt() {
        this.finishSurfacePlacement({ snapToExit: true });
        super.interrupt();
    }

    getTargetActionConfig() {
        return this.target?.getActionConfig?.('use_surface_slot', {}) ?? {};
    }

    getConfiguredSlots() {
        const configured = this.target?.getActionSlotDefinitions?.('use_surface_slot') ?? [];
        if (configured.length > 0) {
            return configured;
        }

        return [{
            id: 'default',
            restPosition: this.getTargetActionConfig().restPosition ?? this.target?.getConfig?.('mytePosition', {}) ?? {},
            restFacing: SurfaceSlotAction.getRestFacing(this.target, this.getTargetActionConfig())
        }];
    }

    hasExplicitTargetSlots() {
        return (this.target?.getActionSlotDefinitions?.('use_surface_slot')?.length ?? 0) > 0;
    }

    getSlotDefinition(slotId = this._selectedSlotId) {
        if (!slotId) {
            return this._selectedSlot;
        }

        return this.getConfiguredSlots().find(slot => slot.id === slotId) ?? null;
    }

    getSlotRestFacing(slot = this._selectedSlot) {
        return slot?.restFacing ??
            slot?.facing ??
            SurfaceSlotAction.getRestFacing(this.target, this.getTargetActionConfig());
    }

    buildSlotApproachConfig(slot) {
        if (slot?.approachConfig) {
            return slot.approachConfig;
        }

        const facing = this.getSlotRestFacing(slot);
        const gap = slot?.entryGap ?? this.entryGap;
        const baseConfig = SurfaceSlotAction.buildDefaultApproachConfig(
            this.target,
            {
                ...this.getTargetActionConfig(),
                restFacing: facing
            },
            gap
        );

        if (slot?.approachAlign) {
            baseConfig.align = slot.approachAlign;
        }

        if (slot?.allowedSides) {
            baseConfig.allowedSides = slot.allowedSides;
        }

        if (slot?.preferredSide) {
            baseConfig.preferredSide = slot.preferredSide;
        }

        return baseConfig;
    }

    evaluateSlot(slot) {
        const approachConfig = this._normalizeConfig(this.buildSlotApproachConfig(slot));
        const targetRect = this.getTargetRect(this.target, approachConfig.alignTo);
        if (!targetRect) {
            return null;
        }

        const myteApproachRect = this.getMyteApproachRect(approachConfig.myteAlignTo);
        const candidates = this.getCandidatePositions(targetRect, myteApproachRect, approachConfig);
        if (!candidates.length) {
            return null;
        }

        const path = this.findBestPath(candidates);
        if (!path) {
            return null;
        }

        return {
            slot,
            approachConfig,
            path,
            score: path.score + this.toFiniteNumber(slot?.priority, 0)
        };
    }

    chooseBestAvailableSlot() {
        const availableSlots = this.hasExplicitTargetSlots()
            ? (this.target?.getAvailableActionSlots?.('use_surface_slot', this.myte) ?? [])
            : this.getConfiguredSlots();
        if (availableSlots.length === 0) {
            return null;
        }

        let best = null;
        for (const slot of availableSlots) {
            const evaluated = this.evaluateSlot(slot);
            if (!evaluated) {
                continue;
            }

            if (!best || evaluated.score < best.score) {
                best = evaluated;
            }
        }

        return best ?? {
            slot: availableSlots[0],
            approachConfig: this._normalizeConfig(this.buildSlotApproachConfig(availableSlots[0]))
        };
    }

    applySelectedSlot(slot, approachConfig = null) {
        this._selectedSlot = slot ?? null;
        this._selectedSlotId = slot?.id ?? null;

        if (!slot) {
            return;
        }

        const selectedApproachConfig = approachConfig ?? this._normalizeConfig(this.buildSlotApproachConfig(slot));
        this.approachConfig = selectedApproachConfig;
        this.returnToEntry = slot?.returnToEntry ?? this.getTargetActionConfig().returnToEntry ?? this.returnToEntry;

        const slotDuration = this.toFiniteNumber(slot?.duration, null);
        if (slotDuration != null) {
            this.duration = slotDuration;
        }
    }

    resolveAndClaimSlot() {
        for (let attempt = 0; attempt < 3; attempt++) {
            const selection = this.chooseBestAvailableSlot();
            if (!selection?.slot) {
                return false;
            }

            this.applySelectedSlot(selection.slot, selection.approachConfig);
            const claimed = this.hasExplicitTargetSlots()
                ? this.target?.claimActionSlot?.('use_surface_slot', this._selectedSlotId, this.myte)
                : this.target?.claimActionOccupancy?.('use_surface_slot', this.myte);
            if (claimed !== false) {
                this._reserved = true;
                return true;
            }
        }

        return false;
    }

    toFiniteNumber(value, fallback) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    setMyteWorldPosition(x, y) {
        this.myte.setPosition(x, y);
        this.myte.setTarget(x, y);
        this.myte.setSpritePosition(x, y);
    }

    beginTransition(phase, from, to, duration) {
        const safeFrom = {
            x: this.toFiniteNumber(from?.x, this.myte.posX),
            y: this.toFiniteNumber(from?.y, this.myte.posY)
        };
        const safeTo = {
            x: this.toFiniteNumber(to?.x, safeFrom.x),
            y: this.toFiniteNumber(to?.y, safeFrom.y)
        };

        if (phase === 'settle') {
            this._previousCollisionSetting = this.myte.checkForCollisions;
            this.myte.checkForCollisions = false;
            this._restingWithCollisionDisabled = true;
            this.baseRestPosition = { ...safeTo };

            if (!this._benefitsApplied) {
                this._benefitsApplied = true;
                this.myte.stats.restoreEnergy(this.energyRestore);
                this.myte.stats.heal(this.healthRestore);
                this.myte.stats.updateComfort(this.comfortBoost);
                this.myte.stats.updateMood(this.moodBoost);
            }
        }

        this.phase = phase;
        this._transition = {
            from: safeFrom,
            to: safeTo,
            elapsed: 0,
            duration: Math.max(1, this.toFiniteNumber(duration, 1))
        };

        this.setMyteWorldPosition(safeFrom.x, safeFrom.y);
    }

    updateTransition(deltaTime) {
        if (!this._transition) {
            return false;
        }

        this._transition.elapsed += deltaTime;
        const progress = Math.min(1, this._transition.elapsed / this._transition.duration);
        const eased = progress * progress * (3 - (2 * progress));
        const x = this._transition.from.x + ((this._transition.to.x - this._transition.from.x) * eased);
        const y = this._transition.from.y + ((this._transition.to.y - this._transition.from.y) * eased);
        this.setMyteWorldPosition(x, y);

        if (progress < 1) {
            return false;
        }

        this.setMyteWorldPosition(this._transition.to.x, this._transition.to.y);

        if (this.phase === 'settle') {
            this.phase = 'rest';
            this.baseY = this._transition.to.y;
            this.baseRestPosition = { ...this._transition.to };
            this.currentDuration = this.duration;
            this._transition = null;
            return false;
        }

        if (this.phase === 'dismount') {
            this.phase = 'done';
            this._transition = null;
            this.finishSurfacePlacement({ snapToExit: false });
            return true;
        }

        this._transition = null;
        return false;
    }

    applyRestFacing() {
        const facing = this.getSlotRestFacing(this._selectedSlot);
        if (facing) {
            this.myte.setDirection(facing);
        } else {
            this.faceTarget();
        }
    }

    resolveTargetSlotPosition(positionConfig = {}, fallbackXFactor = 0.5, fallbackYFactor = 0.5) {
        const slot = positionConfig && typeof positionConfig === 'object' ? positionConfig : {};
        const xFactor = this.toFiniteNumber(slot.xFactor, fallbackXFactor);
        const yFactor = this.toFiniteNumber(slot.yFactor, fallbackYFactor);
        const offsetX = this.toFiniteNumber(slot.offsetX, 0);
        const offsetY = this.toFiniteNumber(slot.offsetY, 0);

        return {
            x: this.target.posX + (this.target.size.width * xFactor) - (this.myte.size.width / 2) + offsetX,
            y: this.target.posY + (this.target.size.height * yFactor) - (this.myte.size.height / 2) + offsetY
        };
    }

    getSurfaceRestPosition() {
        const actionConfig = this.getTargetActionConfig();
        const slot = this.getSlotDefinition();
        return this.resolveTargetSlotPosition(
            slot?.restPosition ?? actionConfig.restPosition ?? this.target?.getConfig?.('mytePosition', {}) ?? {},
            this.target?.getConfig?.('mytePosition.xFactor', 0.5) ?? 0.5,
            this.target?.getConfig?.('mytePosition.yFactor', 0.5) ?? 0.5
        );
    }

    getNearestSideForPosition(position) {
        const targetRect = this.getTargetRect(this.target, 'collider');
        if (!targetRect || !position) {
            return null;
        }

        const centerX = position.x + (this.myte.size.width / 2);
        const centerY = position.y + (this.myte.size.height / 2);
        const distances = [
            { side: 'left', value: Math.abs(centerX - targetRect.x) },
            { side: 'right', value: Math.abs(centerX - (targetRect.x + targetRect.width)) },
            { side: 'top', value: Math.abs(centerY - targetRect.y) },
            { side: 'bottom', value: Math.abs(centerY - (targetRect.y + targetRect.height)) }
        ];

        distances.sort((a, b) => a.value - b.value);
        return distances[0]?.side ?? null;
    }

    finishSurfacePlacement({ snapToExit = true } = {}) {
        if (this._finishedPlacement) return;

        this._finishedPlacement = true;
        this.clearDebugPath();

        if (this._blocked) {
            return;
        }

        if (this._restingWithCollisionDisabled) {
            this.myte.checkForCollisions = this._previousCollisionSetting;
            this._restingWithCollisionDisabled = false;
        }

        if (snapToExit) {
            const exitPosition = this.getSurfaceExitPosition();
            this.setMyteWorldPosition(exitPosition.x, exitPosition.y);
        }

        this.myte.physicsController?.reset?.();
        if (this._reserved) {
            if (this._selectedSlotId && this.hasExplicitTargetSlots()) {
                this.target?.releaseActionSlot?.('use_surface_slot', this._selectedSlotId, this.myte);
            } else {
                this.target?.releaseActionOccupancy?.('use_surface_slot', this.myte);
            }
            this._reserved = false;
        }
    }

    getExitCandidates(targetRect, myteRect) {
        const configuredApproach = this.approachConfig ??
            this.getTargetActionConfig().approachConfig ??
            SurfaceSlotAction.buildDefaultApproachConfig(this.target, this.getTargetActionConfig(), this.entryGap);
        const normalizedApproach = this._normalizeConfig(configuredApproach);
        const candidateSides = this._getAllowedSides(normalizedApproach, targetRect).filter(side => side !== 'center');
        const orderedSides = [
            this._entrySide,
            ...candidateSides
        ].filter((side, index, list) => side && list.indexOf(side) === index);

        return orderedSides.map(side => this.calculatePosition(myteRect, targetRect, side, {
            gap: this.toFiniteNumber(this.exitGap, 16),
            align: 'center'
        }));
    }

    getSurfaceExitPosition() {
        const gridSystem = this.myte.parent?.gameMap?.gridSystem;
        const exitSearchRadius = this.toFiniteNumber(this.exitSearchRadius, 20);
        const actionConfig = this.getTargetActionConfig();
        const slot = this.getSlotDefinition();

        if (slot?.exitPosition || actionConfig.exitPosition) {
            const desired = this.resolveTargetSlotPosition(slot?.exitPosition ?? actionConfig.exitPosition, 0.5, 0.5);
            const safe = gridSystem?.findNearestValidPositionForEntity?.(this.myte, desired.x, desired.y, exitSearchRadius) ?? desired;
            if (safe && this.myte.canMoveToPosition?.(safe.x, safe.y)) {
                return safe;
            }
        }

        if (this.returnToEntry !== false && this._entryPosition) {
            const safeEntry = gridSystem?.findNearestValidPositionForEntity?.(
                this.myte,
                this._entryPosition.x,
                this._entryPosition.y,
                exitSearchRadius
            ) ?? this._entryPosition;
            if (safeEntry && this.myte.canMoveToPosition?.(safeEntry.x, safeEntry.y)) {
                return safeEntry;
            }
        }

        const fallback = this.myte.parent?.gameMap?.gridSystem?.findNearestValidPositionForEntity?.(
            this.myte,
            this._entryPosition?.x ?? this.myte.posX,
            this._entryPosition?.y ?? this.baseY,
            exitSearchRadius
        ) ?? { x: this.myte.posX, y: this.baseY };

        if (!this.target) {
            return fallback;
        }

        const targetRect = this.getTargetRect(this.target, 'collider');
        const myteRect = this.myte.getRect();
        if (!targetRect || !myteRect) {
            return fallback;
        }

        for (const candidate of this.getExitCandidates(targetRect, myteRect)) {
            const safe = gridSystem?.findNearestValidPositionForEntity?.(
                this.myte,
                candidate.x,
                candidate.y,
                exitSearchRadius
            ) ?? candidate;
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
            stuckCompletionDistance: 10,
            repeat: 1,
            postNudgeIdleDuration: 20
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

        const remainingRepeats = Math.max(0, (Number(this.repeat) || 1) - 1);
        if (remainingRepeats > 0 && this.target?.active) {
            const idleDuration = Math.max(0, Number(this.postNudgeIdleDuration) || 0);
            if (idleDuration > 0) {
                this.myte.queue.add('idle', { duration: idleDuration });
            }

            this.myte.queue.add('nudge_ball', {
                target: this.target,
                repeat: remainingRepeats,
                postNudgeIdleDuration: this.postNudgeIdleDuration,
                userInitiated: this.userInitiated
            });
        }
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
        if (!active || !(selected instanceof MapObject) || active.queue.isCarrying()) {
            return false;
        }

        const interactionType = selected.getConfig?.('interactionType');
        return (selected.type?.toUpperCase?.() === 'FOOD' ||
            selected.getConfig?.('consumable', false) === true ||
            interactionType === 'consume') &&
            selected.active !== false;
    }

    complete() {
        super.complete();
        if (!EatElementAction.canPerform(this.target, this.myte)) {
            return;
        }

        // Apply nutritional benefits when the eating animation finishes
        const energyRestore = this.target.getConfig?.('energyRestore', SiteConfig.food.energyRestore) ?? SiteConfig.food.energyRestore;
        const moodBoost     = this.target.getConfig?.('moodBoost',     SiteConfig.food.moodBoost)     ?? SiteConfig.food.moodBoost;
        const healthRestore = this.target.getConfig?.('healthRestore', SiteConfig.food.healthRestore) ?? SiteConfig.food.healthRestore;

        if (energyRestore > 0) this.myte.stats.restoreEnergy(energyRestore);
        if (moodBoost     > 0) this.myte.stats.updateMood(moodBoost);
        if (healthRestore > 0) this.myte.stats.heal(healthRestore);

        this.myte.queue.addExpression('heart', 300, 1);
        this.target?.remove?.();
    }
}

// Open a TreasureChestMapObject — approach, animate "prying open", then chest opens and drops items
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
            openAnimationDuration: 40,
            receiveIdleDuration: 60
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

    constructor(myte, options) {
        super(myte, { ...OpenChestAction.metadata.defaultOptions, ...options });
        this.phase = 'approach';
        this.animationTimer = 0;
    }

    update() {
        if (this.phase === 'approach') {
            const arrived = super.update();
            if (!arrived) return false;
            this.phase = 'open';
            this.animationTimer = this.openAnimationDuration;
            this.faceTarget();
            return false;
        }

        if (this.phase === 'open') {
            this.faceTarget();
            this.animationTimer--;
            return this.animationTimer <= 0;
        }

        return true;
    }

    complete() {
        this.faceTarget();
        super.complete();
        this.target?.open?.(this.myte.parent);
        this.myte.queue.addExpression('excited', 300, 2);
        if (this.receiveIdleDuration > 0) {
            this.myte.queue.addIdle(this.receiveIdleDuration);
        }
    }
}

// Close a TreasureChestMapObject — queued by double-clicking an open chest
class CloseChestAction extends GoToObjectAction {
    static metadata = {
        id: 'close_chest',
        label: 'Close Chest',
        category: 'interactions',
        priority: 3,
        isMovementAction: true,
        isInterruptible: true,
        defaultDuration: 0,
        description: 'Approach and close a treasure chest',
        requiresTarget: true,
        affectsMood: false,
        defaultOptions: {
            closeAnimationDuration: 28,
            postActionIdleDuration: 20
        }
    };

    static canPerform(selected, active) {
        return active &&
               selected?.constructor?.name === 'TreasureChestMapObject' &&
               selected.state === 'opened' &&
               selected.canClose === true &&
               !active.queue.isCarrying();
    }

    static getRequiredOptions(selected, active) {
        return { target: selected };
    }

    constructor(myte, options) {
        super(myte, { ...CloseChestAction.metadata.defaultOptions, ...options });
        this.phase = 'approach';
        this.animationTimer = 0;
    }

    update() {
        if (this.phase === 'approach') {
            const arrived = super.update();
            if (!arrived) return false;
            this.phase = 'close';
            this.animationTimer = this.closeAnimationDuration;
            this.faceTarget();
            return false;
        }

        if (this.phase === 'close') {
            this.faceTarget();
            this.animationTimer--;
            return this.animationTimer <= 0;
        }

        return true;
    }

    complete() {
        this.faceTarget();
        super.complete();
        this.target?.close?.(this.myte.parent);
        if (this.postActionIdleDuration > 0) {
            this.myte.queue.addIdle(this.postActionIdleDuration);
        }
    }
}

// Pick a flower — animates a pick, drops the flower item on the ground, marks plant as deflowered
class PickFlowerAction extends GoToObjectAction {
    static metadata = {
        id: 'pick_flower',
        label: 'Pick Flower',
        category: 'interactions',
        priority: 2,
        isMovementAction: true,
        isInterruptible: true,
        defaultDuration: 0,
        description: 'Pick a flower from a plant',
        requiresTarget: true,
        affectsMood: true,
        moodEffect: 4,
        defaultOptions: {
            pickAnimationDuration: 45,
            approachConfig: 'adjacent'
        }
    };

    static _isFlower(obj) {
        if (!obj) return false;
        if (typeof obj.isSidebarFlowerObject === 'function') {
            return obj.isSidebarFlowerObject();
        }

        const name = obj?.constructor?.name ?? '';
        if (name.includes('Flower') || name.includes('Bloom')) return true;
        const type = obj?.type?.toUpperCase?.();
        return type === 'FLOWER' || type === 'GRASS';
    }

    static canPerform(selected, active) {
        if (!active || !PickFlowerAction._isFlower(selected) || active.queue.isCarrying()) return false;
        return selected.getConfig?.('deflowered', false) !== true;
    }

    static getRequiredOptions(selected) {
        return { target: selected };
    }

    constructor(myte, options) {
        super(myte, { ...PickFlowerAction.metadata.defaultOptions, ...options });
        this.phase = 'approach';
        this.animationTimer = 0;
    }

    update() {
        if (this.phase === 'approach') {
            const arrived = super.update();
            if (!arrived) return false;
            this.phase = 'pick';
            this.animationTimer = this.pickAnimationDuration;
            this.faceTarget();
            return false;
        }

        if (this.phase === 'pick') {
            this.faceTarget();
            this.animationTimer--;
            return this.animationTimer <= 0;
        }

        return true;
    }

    interrupt() {
        this._interrupted = true;
        super.interrupt();
    }

    cancel() {
        this._interrupted = true;
        super.cancel?.();
    }

    complete() {
        if (this._interrupted) return;
        this.faceTarget();
        super.complete();
        this._dropFlowerItem();
        this.target?.setDeflowered?.();
        this.target?.playConfiguredSound?.('pick');
        this.myte.queue.addExpression('heart', 300, 1);
        this.myte.queue.addIdle(40);
    }

    _dropFlowerItem() {
        const gameMap = this.target?.gameMap ?? this.myte?.parent?.gameMap;
        const foregroundLayer = gameMap?.layers?.objects;
        if (!foregroundLayer) return;

        const variant = this.target?.variant ?? 'flower';
        const spawnX  = (this.target?.posX ?? this.myte.posX) + (this.target?.size?.width ?? 32) / 2;
        const spawnY  = (this.target?.posY ?? this.myte.posY) + (this.target?.size?.height ?? 32) / 2;

        const itemDef = ItemRegistry.getItemSync(variant);
        const itemType = itemDef?.type?.toUpperCase() || 'FLOWER';

        const dropped = new DroppedMapItem(gameMap, itemType, variant, spawnX, spawnY);
        dropped.quantity = 1;
        dropped.inventoryType = itemType;
        dropped.inventoryVariant = itemDef?.id || variant;
        dropped.inventoryName = itemDef?.name ?? this.target?.getDisplayName?.() ?? 'Flower';
        dropped.description = itemDef?.description || '';
        const angle = -Math.PI / 2 + (Math.random() - 0.5) * (Math.PI / 3);
        dropped.velocityX = Math.cos(angle) * 3;
        dropped.velocityY = Math.sin(angle) * 3;
        dropped.velocityZ = 4 + Math.random() * 2;

        if (dropped.shadowElement) foregroundLayer.appendChild(dropped.shadowElement);
        foregroundLayer.appendChild(dropped.element);
        if (!gameMap?.droppedItems?.includes(dropped)) {
            gameMap?.droppedItems?.push(dropped);
        }
    }
}

// Trample a flower — stomps through it, negative mood
class TrampleFlowerAction extends GoToObjectAction {
    static metadata = {
        id: 'trample_flower',
        label: 'Trample',
        category: 'interactions',
        priority: 2,
        isMovementAction: true,
        isInterruptible: true,
        defaultDuration: 0,
        description: 'Trample a flower',
        requiresTarget: true,
        affectsMood: true,
        moodEffect: -3,
        defaultOptions: {
            approachConfig: 'adjacent',
            trampleAnimationDuration: 22,
            postActionIdleDuration: 20
        }
    };

    static canPerform(selected, active) {
        return active && PickFlowerAction._isFlower(selected) && !active.queue.isCarrying();
    }

    static getRequiredOptions(selected) {
        return { target: selected };
    }

    constructor(myte, options) {
        super(myte, { ...TrampleFlowerAction.metadata.defaultOptions, ...options });
        this.phase = 'approach';
        this.animationTimer = 0;
    }

    update() {
        if (this.phase === 'approach') {
            const arrived = super.update();
            if (!arrived) return false;
            this.phase = 'trample';
            this.animationTimer = this.trampleAnimationDuration;
            this.faceTarget();
            return false;
        }

        if (this.phase === 'trample') {
            this.faceTarget();
            this.animationTimer--;
            return this.animationTimer <= 0;
        }

        return true;
    }

    complete() {
        this.faceTarget();
        super.complete();
        this.target?.playConfiguredSound?.('trample');
        this.target?.remove?.();
        this.myte.queue.addExpression('surprise', 200, 1);
        if (this.postActionIdleDuration > 0) {
            this.myte.queue.addIdle(this.postActionIdleDuration);
        }
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
        defaultOptions: {
            approachConfig: 'adjacent'
        }
    };

    static canPerform(selected, active) {
        return active && PickFlowerAction._isFlower(selected) && !active.queue.isCarrying();
    }

    static getRequiredOptions(selected, active) {
        return { target: selected };
    }

    complete() {
        this.faceTarget();
        super.complete();
        this.myte.queue.addExpression('heart', 400, 1);
        this.myte.queue.addIdle(60);
    }
}

// Drink from a FountainMapObject — approach adjacent, drink
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
        this.faceTarget();
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
        defaultOptions: {
            waterAnimationDuration: 36,
            postActionIdleDuration: 40
        }
    };

    static canPerform(selected, active) {
        return active &&
               selected?.constructor?.name === 'CropPlantMapObject' &&
               (typeof selected.canWater !== 'function' || selected.canWater()) &&
               !active.queue.isCarrying();
    }

    static getRequiredOptions(selected, active) {
        return { target: selected };
    }

    constructor(myte, options) {
        super(myte, { ...WaterPlantAction.metadata.defaultOptions, ...options });
        this.phase = 'approach';
        this.animationTimer = 0;
    }

    update() {
        if (this.phase === 'approach') {
            const arrived = super.update();
            if (!arrived) return false;
            this.phase = 'water';
            this.animationTimer = this.waterAnimationDuration;
            this.faceTarget();
            return false;
        }

        if (this.phase === 'water') {
            this.faceTarget();
            this.animationTimer--;
            return this.animationTimer <= 0;
        }

        return true;
    }

    complete() {
        this.faceTarget();
        super.complete();
        if (this.target?.water) {
            this.target.water();
        }
        if (this.postActionIdleDuration > 0) {
            this.myte.queue.addIdle(this.postActionIdleDuration);
        }
    }
}

// Harvest a CropPlantMapObject — approach, animate, then harvest drops to ground
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
        defaultOptions: {
            harvestAnimationDuration: 50,
            postActionIdleDuration: 45
        }
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

    constructor(myte, options) {
        super(myte, { ...HarvestAction.metadata.defaultOptions, ...options });
        this.phase = 'approach';
        this.animationTimer = 0;
    }

    getQueueTitle() {
        return 'Harvest Crop';
    }

    update() {
        if (this.phase === 'approach') {
            const arrived = super.update();
            if (!arrived) return false;
            this.phase = 'harvest';
            this.animationTimer = this.harvestAnimationDuration;
            this.faceTarget();
            return false;
        }

        if (this.phase === 'harvest') {
            this.faceTarget();
            this.animationTimer--;
            return this.animationTimer <= 0;
        }

        return true;
    }

    complete() {
        this.faceTarget();
        super.complete();
        if (typeof this.target?.performHarvest === 'function') {
            this.target.performHarvest(this.myte.parent, this.myte);
        } else if (this.target?.harvest) {
            this.target.harvest(this.myte);
        }
        this.myte.queue.addExpression('excited', 300, 1);
        if (this.postActionIdleDuration > 0) {
            this.myte.queue.addIdle(this.postActionIdleDuration);
        }
    }
}
