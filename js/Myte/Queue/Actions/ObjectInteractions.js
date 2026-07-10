function getInteractionSoundManager(action) {
    return action?.myte?.parent?.soundManager || action?.target?.gameMap?.soundManager || null;
}

function startInteractionSoundPulse(action, config = {}) {
    if (!action) return;
    action._interactionSoundPulse = {
        soundIds: Array.isArray(config.soundIds) ? config.soundIds.slice() : [config.soundId].filter(Boolean),
        intervalMs: Math.max(1, config.intervalMs ?? 167),
        jitterMs: Math.max(0, config.jitterMs ?? 0),
        volume: config.volume ?? 1,
        nextMs: 0,
        index: 0
    };
}

function tickInteractionSoundPulse(action, tickDelta) {
    const pulse = action?._interactionSoundPulse;
    if (!pulse?.soundIds?.length) return;

    if (pulse.nextMs > 0) {
        pulse.nextMs -= tickDelta;
        return;
    }

    const soundId = pulse.soundIds[pulse.index % pulse.soundIds.length];
    pulse.index++;
    pulse.nextMs = pulse.intervalMs + (pulse.jitterMs ? Math.random() * pulse.jitterMs : 0);
    getInteractionSoundManager(action)?.play?.(soundId, { volume: pulse.volume });
}

function stopInteractionSoundPulse(action) {
    if (action) {
        action._interactionSoundPulse = null;
    }
}

// Pause beside an object and quietly observe it.
class InspectAction extends GoToObjectAction {
    static metadata = { id: 'inspect' };

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
    }

    getQueueTitle() {
        return 'Inspect';
    }

    update(tickDelta) {
        if (this.phase === 'approach') {
            const arrived = super.update(tickDelta);
            if (!arrived) return false;
            if (this.didAbortApproach()) return true;

            this.phase = 'observe';
            this.currentDuration = this.duration;
            if (this.expressionType) {
                this.myte.queue.addExpression(this.expressionType, this.expressionDuration, 1);
            }
        }

        this.faceTarget();
        this.currentDuration -= tickDelta;
        return this.currentDuration <= 0;
    }
}

// Rare, more obsessive investigation pattern that circles an object.
// Extends GoToObjectAction so it first approaches the target using the same
// smart pathfinding as InspectAction, then generates walkable inspect points
// only after the myte has arrived.
class DeepInspectAction extends GoToObjectAction {
    static metadata = { id: 'deep_inspect' };

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
        this.phase = 'approach';
    }

    getQueueTitle() {
        return 'Inspect Oddly';
    }

    _generateInspectPoints() {
        const targetRect = this.getTargetRect(this.target, 'sprite');
        const myteRect = this.myte.getRect();
        const gridSystem = this.myte.parent?.gameMap?.gridSystem;
        const points = [];

        for (let i = 0; i < this.numPoints; i++) {
            const horizontal = i % 2 === 0 ? 'left' : 'right';
            const vertical = i < Math.ceil(this.numPoints / 2) ? 'top' : 'bottom';
            const raw = this.calculatePosition(myteRect, targetRect, horizontal, {
                gap: 15,
                align: vertical === 'top' ? 'top-edge' : 'bottom-edge'
            });
            // Snap to nearest valid walkable position so we don't target colliders.
            const safe = gridSystem?.findNearestValidPositionForEntity?.(this.myte, raw.x, raw.y, 24) ?? raw;
            points.push(safe);
        }

        return points;
    }

    update(tickDelta) {
        if (this.phase === 'approach') {
            const arrived = super.update(tickDelta);
            if (!arrived) return false;
            if (this.didAbortApproach()) return true;

            this.phase = 'inspect';
            this.inspectPoints = this._generateInspectPoints();
            this.currentPoint = 0;
            this.pointTimer = this.pointDuration;
            this.currentDuration = this.duration;
            if (this.expressionType) {
                this.myte.queue.addExpression(this.expressionType, this.expressionDuration, 1);
            }
            return false;
        }

        if (!this.inspectPoints.length) return true;

        this.pointTimer -= tickDelta;
        if (this.pointTimer <= 0) {
            this.currentPoint = (this.currentPoint + 1) % this.inspectPoints.length;
            this.pointTimer = this.pointDuration;
        }

        const point = this.inspectPoints[this.currentPoint];
        this.myte.setTarget(point.x, point.y);
        this.myte.moveTowardsTarget();

        this.currentDuration -= tickDelta;
        return this.currentDuration <= 0;
    }
}

class InteractObjectAction extends GoToObjectAction {
    static metadata = { id: 'interact_object' };

    static canPerform(selected, active) {
        if (!active || !(selected instanceof MapObject) || active.queue.isCarrying()) {
            return false;
        }

        const interactionType = selected.getConfig?.('interaction.type');
        if (interactionType === 'teleport') {
            return !!selected.hasTransitionDestination?.() &&
                selected.active !== false &&
                selected.isActive !== false;
        }

        return interactionType === 'dance' || interactionType === 'light' || interactionType === 'toggle' || interactionType === 'social';
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
        super(myte, options);
        this.phase = 'approach';
        this.animationTimer = 0;
    }

    update(tickDelta) {
        if (this.phase === 'approach') {
            const arrived = super.update(tickDelta);
            if (!arrived) return false;
            if (this.didAbortApproach()) return true;
            this.phase = 'interact';
            this.animationTimer = this.interactionAnimationDuration;
            this.faceTarget();
            return false;
        }

        if (this.phase === 'interact') {
            this.faceTarget();
            this.animationTimer -= tickDelta;
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

        const interactionType = this.target?.getConfig?.('interaction.type');
        if (interactionType === 'dance') {
            this.myte.queue.addDance(90);
        } else if (interactionType === 'light') {
            this.myte.queue.addIdle(Math.max(300, this.postActionIdleDuration || 0));
        } else if (interactionType === 'social') {
            const effects = this.target?.getConfig?.('effects', {}) ?? {};
            const socialBoost  = effects.social  ?? 20;
            const comfortBoost = effects.comfort ?? 0;
            this.myte.stats?.updateSocial?.(socialBoost);
            if (comfortBoost > 0) this.myte.stats?.updateComfort?.(comfortBoost);
            this.myte.queue.addExpression('heart', 400, 1);
            this.myte.queue.addIdle(Math.max(600, this.postActionIdleDuration || 0));
        } else if (this.postActionIdleDuration > 0) {
            this.myte.queue.addIdle(this.postActionIdleDuration);
        }
    }
}

class SurfaceSlotAction extends GoToObjectAction {
    static metadata = { id: 'use_surface_slot' };

    static canPerform(selected, active) {
        if (!active ||
            !(selected instanceof MapObject) ||
            !selected.getActionConfig?.('use_surface_slot') ||
            active.queue.isCarrying() ||
            selected.isActionOccupied?.('use_surface_slot', active)) {
            return false;
        }

        const actionConfig = selected.getActionConfig('use_surface_slot', {});
        const benefit = actionConfig.benefit ?? 'energy';
        if (benefit === 'energy') {
            const threshold = SiteConfig.stats.restEnergyThreshold ?? 90;
            if ((active.stats?.energy ?? 0) >= threshold) {
                return false;
            }
        }

        return true;
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
        this._attachment = null;
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
        const facingToSide = { N: 'top', S: 'bottom', E: 'right', W: 'left' };
        const allowedSides = facingToSide[facing] ? [facingToSide[facing]] : ['bottom'];

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

        const config = this.getTargetActionConfig();
        const benefit = config.benefit ?? 'energy';

        if (benefit !== 'energy' && config.randomDuration) {
            if (this.myte.isActive) {
                this.currentDuration = Infinity;
            } else {
                const min = config.minDuration ?? 10000;
                const max = config.maxDuration ?? min + 15000;
                this.currentDuration = min + Math.random() * (max - min);
            }
        } else {
            this.currentDuration = this.duration;
        }
        this._restElapsed = 0;

        if (this.immediate) {
            // Skip the approach walk — jump straight to settle from current position
            this._entryPosition = { x: this.myte.posX, y: this.myte.posY };
            this._entrySide = this.getNearestSideForPosition(this._entryPosition);
            this.applyRestFacing();
            this.beginTransition(
                'settle',
                this._entryPosition,
                this.getSurfaceRestPosition(),
                this.settleDuration
            );
            return;
        }

        super.start();
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

        this._restElapsed = (this._restElapsed ?? 0) + dt;

        this.bobPhase += (dt / 16.667) * this.bobSpeed;
        const bobOffset = Math.sin(this.bobPhase) * this.bobHeight;
        if (this._attachment) {
            this._attachment.localOffset.y = bobOffset;
        } else {
            this.setMyteWorldPosition(this.baseRestPosition.x, this.baseRestPosition.y + bobOffset);
        }

        const actionConfig = this.getTargetActionConfig();
        const benefit = actionConfig.benefit ?? 'energy';
        const minDuration = SiteConfig.stats.minRestDuration ?? 2000;
        const restUntilFull = benefit === 'energy' && (actionConfig.restUntilFull ?? false);

        if (restUntilFull) {
            // Stay resting until energy is fully restored and min duration has elapsed
            if (this.myte.stats.energy < this.myte.stats.maxEnergy || this._restElapsed < minDuration) {
                return false;
            }
        } else {
            this.currentDuration -= dt;
            if (this.currentDuration > 0) {
                return false;
            }
        }

        const exitPosition = this.getSurfaceExitPosition();
        if (this._attachment) {
            this.myte.container?.attachments?.detach?.(this.myte, {
                exitPosition: { x: this.myte.posX, y: this.myte.posY }
            });
            this._attachment = null;
        }
        this.beginTransition(
            'dismount',
            { x: this.myte.posX, y: this.myte.posY },
            exitPosition,
            this.resolveTransitionDuration(
                { x: this.myte.posX, y: this.myte.posY },
                exitPosition,
                this.dismountDuration,
                { minDuration: 80, maxDuration: 420, referenceDistance: 52 }
            )
        );
        return false;
    }

    complete() {
        this.finishSurfacePlacement({ snapToExit: this.phase !== 'done' });
        super.complete();
        const benefit = this.getTargetActionConfig().benefit ?? 'energy';
        if (benefit === 'energy') {
            this.myte.buffs?.emitEvent?.('energy_surface_complete');
        }
    }

    interrupt() {
        const isDragInterrupt = !!this.myte.isDragging;
        if (this.phase === 'rest' || this.phase === 'settle' || isDragInterrupt) {
            this.myte.buffs?.applyBuff?.('disturbed', { source: 'interrupt' });
        }
        this.finishSurfacePlacement({ snapToExit: !isDragInterrupt });
        super.interrupt();
    }

    getTargetActionConfig() {
        return this.target?.getActionConfig?.('use_surface_slot', {}) ?? {};
    }

    getSurfaceStatEffects() {
        return this.getTargetActionConfig().effects ?? {};
    }

    getConfiguredSlots() {
        return this.target?.getActionSlotDefinitions?.('use_surface_slot') ?? [];
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
        const availableSlots = this.target?.getAvailableActionSlots?.('use_surface_slot', this.myte) ?? [];
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
            const claimed = this.target?.claimActionSlot?.('use_surface_slot', this._selectedSlotId, this.myte);
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

    getMyteColliderMetrics() {
        return {
            offsetX: this.toFiniteNumber(this.myte.collider?.offsetX, 0),
            offsetY: this.toFiniteNumber(this.myte.collider?.offsetY, 0),
            width: this.toFiniteNumber(this.myte.collider?.width, this.myte.size.width),
            height: this.toFiniteNumber(this.myte.collider?.height, this.myte.size.height)
        };
    }

    resolveTransitionDuration(from, to, baseDuration, {
        minDuration = 90,
        maxDuration = 420,
        referenceDistance = 64
    } = {}) {
        const base = Math.max(1, this.toFiniteNumber(baseDuration, 1));
        const dx = this.toFiniteNumber(to?.x, 0) - this.toFiniteNumber(from?.x, 0);
        const dy = this.toFiniteNumber(to?.y, 0) - this.toFiniteNumber(from?.y, 0);
        const distance = Math.hypot(dx, dy);
        const distanceScale = Utility.clamp(distance / Math.max(1, referenceDistance), 0.55, 1.9);
        return Math.round(Utility.clamp(base * distanceScale, minDuration, maxDuration));
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
            if (!this.target?.sockets?.get?.(this._selectedSlotId)) {
                this.myte.checkForCollisions = false;
                this._restingWithCollisionDisabled = true;
            }
            this.baseRestPosition = { ...safeTo };

            if (!this._benefitsApplied) {
                this._benefitsApplied = true;
                this.myte.stats.applyStatEffects(this.getSurfaceStatEffects());
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
            this._attachment = this.target?.container?.attachments?.attach?.(
                this.target,
                this.myte,
                this._selectedSlotId,
                { localOffset: { x: 0, y: 0 }, inheritFacing: true }
            ) ?? null;
            if (this.target?.sockets?.get?.(this._selectedSlotId) && !this._attachment) {
                this._blocked = true;
                return true;
            }
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
        const socketPosition = this.target?.sockets?.resolveWorldPosition?.(this._selectedSlotId);
        if (socketPosition) {
            return {
                x: socketPosition.x - (this.myte.size.width / 2),
                y: socketPosition.y - (this.myte.size.height / 2)
            };
        }

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

        const exitPosition = snapToExit ? this.getSurfaceExitPosition() : null;
        if (this._attachment) {
            this.myte.container?.attachments?.detach?.(this.myte, { exitPosition });
            this._attachment = null;
        } else if (this._restingWithCollisionDisabled) {
            this.myte.checkForCollisions = this._previousCollisionSetting;
            this._restingWithCollisionDisabled = false;
        }

        if (snapToExit && exitPosition) {
            this.setMyteWorldPosition(exitPosition.x, exitPosition.y);
        }

        this.myte.physicsController?.reset?.();
        if (this._reserved && !this.target?.sockets?.get?.(this._selectedSlotId)) {
            if (this._selectedSlotId) {
                this.target?.releaseActionSlot?.('use_surface_slot', this._selectedSlotId, this.myte);
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

    getSlotFrontExitPosition(slot, exitSearchRadius) {
        if (!slot?.restPosition || !slot?.approachConfig) return null;
        const targetRect = this.getTargetRect(this.target, 'collider');
        const myteCollider = this.getMyteColliderMetrics();
        if (!targetRect) return null;

        const xFactor = slot.restPosition.xFactor ?? 0.5;
        const yFactor = slot.restPosition.yFactor ?? 0.5;
        const slotCX  = targetRect.x + targetRect.width  * xFactor;
        const slotCY  = targetRect.y + targetRect.height * yFactor;
        const gap     = this.toFiniteNumber(this.exitGap, 16);

        const sides   = Array.isArray(slot.approachConfig.allowedSides)
            ? slot.approachConfig.allowedSides
            : [slot.approachConfig.preferredSide ?? 'bottom'];
        const exitSide = this._entrySide ?? sides[0] ?? 'bottom';

        let x, y;
        switch (exitSide) {
            case 'bottom':
                x = slotCX - myteCollider.offsetX - (myteCollider.width / 2);
                y = targetRect.y + targetRect.height + gap - myteCollider.offsetY;
                break;
            case 'top':
                x = slotCX - myteCollider.offsetX - (myteCollider.width / 2);
                y = targetRect.y - gap - myteCollider.offsetY - myteCollider.height;
                break;
            case 'left':
                x = targetRect.x - gap - myteCollider.offsetX - myteCollider.width;
                y = slotCY - myteCollider.offsetY - (myteCollider.height / 2);
                break;
            case 'right':
                x = targetRect.x + targetRect.width + gap - myteCollider.offsetX;
                y = slotCY - myteCollider.offsetY - (myteCollider.height / 2);
                break;
            default: return null;
        }

        const gridSystem = this.myte.parent?.gameMap?.gridSystem;
        const safe = gridSystem?.findNearestValidPositionForEntity?.(this.myte, x, y, exitSearchRadius) ?? { x, y };
        return (safe && this.myte.canMoveToPosition?.(safe.x, safe.y)) ? safe : null;
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

        // Slots with explicit approach sides exit directly in front of their rest position
        const slotFront = this.getSlotFrontExitPosition(slot, exitSearchRadius);
        if (slotFront) return slotFront;

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
    static metadata = { id: 'nudge_ball' };

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
        this.myte.queue.addExpression('excited', 500, 1);
        this.myte.queue.addIdle(400);

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
    static metadata = { id: 'eat_element' };

    static isConsumableTarget(selected, active) {
        if (!active || active.queue.isCarrying() || selected?.active === false) {
            return false;
        }

        if (selected instanceof DroppedMapItem) {
            return selected.isConsumableBy?.(active) === true;
        }

        if (!(selected instanceof MapObject)) {
            return false;
        }

        const interactionType = selected.getConfig?.('interaction.type');
        return (selected.type?.toUpperCase?.() === 'FOOD' ||
            selected.getConfig?.('consumable', false) === true ||
            interactionType === 'consume');
    }

    static canPerform(selected, active) {
        return this.isConsumableTarget(selected, active);
    }

    complete() {
        super.complete();
        if (!EatElementAction.isConsumableTarget(this.target, this.myte)) {
            return;
        }

        // Apply nutritional benefits when the eating animation finishes
        this.myte.stats.applyStatEffects(
            this.target.getConsumableEffects?.() ??
            this.target.getConfig?.('effects', null) ??
            SiteConfig.food.effects
        );
        const saturationMs =
            this.target.getConsumableSaturationMs?.() ??
            this.target.getConfig?.('saturationMs') ??
            SiteConfig.food.saturationMs;
        this.myte.buffs?.applyBuff?.('nourished', { durationMs: saturationMs, source: 'eat_element' });

        this.myte.queue.addExpression('heart', 300, 1);
        this.target?.remove?.();
    }
}

// Open a TreasureChestMapObject — approach, animate "prying open", then chest opens and drops items
class OpenChestAction extends GoToObjectAction {
    static metadata = { id: 'open_chest' };

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
        super(myte, options);
        this.phase = 'approach';
        this.animationTimer = 0;
    }

    update(tickDelta) {
        if (this.phase === 'approach') {
            const arrived = super.update(tickDelta);
            if (!arrived) return false;
            if (this.didAbortApproach()) return true;
            this.phase = 'open';
            this.animationTimer = this.openAnimationDuration;
            this.faceTarget();
            return false;
        }

        if (this.phase === 'open') {
            this.faceTarget();
            this.animationTimer -= tickDelta;
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
    static metadata = { id: 'close_chest' };

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
        super(myte, options);
        this.phase = 'approach';
        this.animationTimer = 0;
    }

    update(tickDelta) {
        if (this.phase === 'approach') {
            const arrived = super.update(tickDelta);
            if (!arrived) return false;
            if (this.didAbortApproach()) return true;
            this.phase = 'close';
            this.animationTimer = this.closeAnimationDuration;
            this.faceTarget();
            return false;
        }

        if (this.phase === 'close') {
            this.faceTarget();
            this.animationTimer -= tickDelta;
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
    static metadata = { id: 'pick_flower' };

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
        if (typeof selected.bloomState === 'string' && selected.bloomState !== 'open') return false;
        return selected.isDeflowered?.() !== true;
    }

    static getRequiredOptions(selected) {
        return { target: selected };
    }

    constructor(myte, options) {
        super(myte, { ...PickFlowerAction.metadata.defaultOptions, ...options });
        this.phase = 'approach';
        this.animationTimer = 0;
    }

    update(tickDelta) {
        if (this.phase === 'approach') {
            const arrived = super.update(tickDelta);
            if (!arrived) return false;
            if (this.didAbortApproach()) return true;
            this.phase = 'pick';
            this.animationTimer = this.pickAnimationDuration;
            this.faceTarget();
            startInteractionSoundPulse(this, {
                soundIds: ['obj_flower_rustle', 'obj_flower_pick'],
                intervalMs: 180,
                jitterMs: 65,
                volume: 0.78
            });
            return false;
        }

        if (this.phase === 'pick') {
            this.faceTarget();
            tickInteractionSoundPulse(this, tickDelta);
            this.animationTimer -= tickDelta;
            return this.animationTimer <= 0;
        }

        return true;
    }

    interrupt() {
        this._interrupted = true;
        stopInteractionSoundPulse(this);
        super.interrupt();
    }

    cancel() {
        this._interrupted = true;
        stopInteractionSoundPulse(this);
        super.cancel?.();
    }

    complete() {
        if (this._interrupted) return;
        stopInteractionSoundPulse(this);
        this.faceTarget();
        super.complete();
        this._dropFlowerItem();
        this.target?.setDeflowered?.();
        this.target?.playConfiguredSound?.('pick');
        this.myte.queue.addExpression('heart', 300, 1);
        this.myte.queue.addIdle(500);
    }

    _dropFlowerItem() {
        const variant = this.target?.variant ?? 'flower';
        this.target?.spawnDroppedInventoryItem?.({
            type: 'FLOWER',
            variant,
            quantity: 1,
            inventoryName: this.target?.getDisplayName?.() ?? 'Flower'
        });
    }
}

// Trample a flower — stomps through it, negative mood
class TrampleFlowerAction extends GoToObjectAction {
    static metadata = { id: 'trample_flower' };

    static canPerform(selected, active) {
        return active && PickFlowerAction._isFlower(selected) && !active.queue.isCarrying();
    }

    static getRequiredOptions(selected) {
        return { target: selected };
    }

    constructor(myte, options) {
        super(myte, options);
        this.phase = 'approach';
        this.animationTimer = 0;
    }

    update(tickDelta) {
        if (this.phase === 'approach') {
            const arrived = super.update(tickDelta);
            if (!arrived) return false;
            if (this.didAbortApproach()) return true;
            this.phase = 'trample';
            this.animationTimer = this.trampleAnimationDuration;
            this.faceTarget();
            startInteractionSoundPulse(this, {
                soundIds: ['obj_flower_trample_step', 'obj_flower_trample'],
                intervalMs: 100,
                jitterMs: 35,
                volume: 0.72
            });
            return false;
        }

        if (this.phase === 'trample') {
            this.faceTarget();
            tickInteractionSoundPulse(this, tickDelta);
            this.animationTimer -= tickDelta;
            return this.animationTimer <= 0;
        }

        return true;
    }

    interrupt() {
        stopInteractionSoundPulse(this);
        super.interrupt?.();
    }

    cancel() {
        stopInteractionSoundPulse(this);
        super.cancel?.();
    }

    complete() {
        stopInteractionSoundPulse(this);
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
    static metadata = { id: 'smell_flower' };

    static canPerform(selected, active) {
        if (!active || !PickFlowerAction._isFlower(selected) || active.queue.isCarrying()) return false;
        if (typeof selected.bloomState === 'string' && selected.bloomState !== 'open') return false;
        return true;
    }

    static getRequiredOptions(selected, active) {
        return { target: selected };
    }

    complete() {
        this.faceTarget();
        super.complete();
        this.myte.queue.addExpression('heart', 400, 1);
        this.myte.queue.addIdle(800);
    }
}

// Drink from a FountainMapObject — approach adjacent, drink
class DrinkFromFountainAction extends GoToObjectAction {
    static metadata = { id: 'drink_fountain' };

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
        this.myte.queue.addIdle(800);
    }
}

// Water a CropPlantMapObject
class WaterPlantAction extends GoToObjectAction {
    static metadata = { id: 'water_plant' };

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
        super(myte, options);
        this.phase = 'approach';
        this.animationTimer = 0;
    }

    update(tickDelta) {
        if (this.phase === 'approach') {
            const arrived = super.update(tickDelta);
            if (!arrived) return false;
            if (this.didAbortApproach()) return true;
            this.phase = 'water';
            this.animationTimer = this.waterAnimationDuration;
            this.faceTarget();
            startInteractionSoundPulse(this, {
                soundIds: ['obj_crop_tend', 'obj_crop_tend'],
                intervalMs: 150,
                jitterMs: 50,
                volume: 0.64
            });
            return false;
        }

        if (this.phase === 'water') {
            this.faceTarget();
            tickInteractionSoundPulse(this, tickDelta);
            this.animationTimer -= tickDelta;
            return this.animationTimer <= 0;
        }

        return true;
    }

    interrupt() {
        stopInteractionSoundPulse(this);
        super.interrupt?.();
    }

    cancel() {
        stopInteractionSoundPulse(this);
        super.cancel?.();
    }

    complete() {
        stopInteractionSoundPulse(this);
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
    static metadata = { id: 'harvest' };

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
        super(myte, options);
        this.phase = 'approach';
        this.animationTimer = 0;
    }

    getQueueTitle() {
        return 'Harvest Crop';
    }

    update(tickDelta) {
        if (this.phase === 'approach') {
            const arrived = super.update(tickDelta);
            if (!arrived) return false;
            if (this.didAbortApproach()) return true;
            this.phase = 'harvest';
            this.animationTimer = this.harvestAnimationDuration;
            this.faceTarget();
            startInteractionSoundPulse(this, {
                soundIds: ['obj_crop_tend', 'obj_crop_harvest'],
                intervalMs: 165,
                jitterMs: 65,
                volume: 0.72
            });
            return false;
        }

        if (this.phase === 'harvest') {
            this.faceTarget();
            tickInteractionSoundPulse(this, tickDelta);
            this.animationTimer -= tickDelta;
            return this.animationTimer <= 0;
        }

        return true;
    }

    interrupt() {
        stopInteractionSoundPulse(this);
        super.interrupt?.();
    }

    cancel() {
        stopInteractionSoundPulse(this);
        super.cancel?.();
    }

    complete() {
        stopInteractionSoundPulse(this);
        this.faceTarget();
        super.complete();
        if (this.didAbortApproach()) return;
        if (typeof this.target?.performHarvest === 'function') {
            this.target.performHarvest(this.myte.parent, this.myte);
        } else if (this.target?.harvest) {
            this.target.harvest(this.myte);
        }
        if (!this.suppressPostEffects) {
            this.myte.queue.addExpression('excited', 300, 1);
            if (this.postActionIdleDuration > 0) {
                this.myte.queue.addIdle(this.postActionIdleDuration);
            }
        }
    }
}

class ShakeTreeAction extends GoToObjectAction {
    static metadata = { id: 'shake_tree' };

    static canPerform(selected, active) {
        return active &&
               selected instanceof TreeMapObject &&
               (typeof selected.canShake !== 'function' || selected.canShake()) &&
               !active.queue.isCarrying();
    }

    static getRequiredOptions(selected) {
        return { target: selected };
    }

    constructor(myte, options) {
        super(myte, options);
        this.phase = 'approach';
        this.animationTimer = 0;
    }

    update(tickDelta) {
        if (this.phase === 'approach') {
            const arrived = super.update(tickDelta);
            if (!arrived) return false;
            if (this.didAbortApproach()) return true;
            this.phase = 'shake';
            this.animationTimer = this.shakeAnimationDuration ?? 1000;
            this.faceTarget();
            this.target?.shake?.();
            return false;
        }

        if (this.phase === 'shake') {
            this.faceTarget();
            this.animationTimer -= tickDelta;
            return this.animationTimer <= 0;
        }

        return true;
    }

    complete() {
        this.faceTarget();
        super.complete();
        this.myte.queue.addExpression('excited', 300, 1);
        if (this.postActionIdleDuration > 0) {
            this.myte.queue.addIdle(this.postActionIdleDuration);
        }
    }
}

class ChopTreeAction extends GoToObjectAction {
    static metadata = { id: 'chop_tree' };

    static canPerform(selected, active) {
        return active &&
               selected instanceof TreeMapObject &&
               (typeof selected.canChop !== 'function' || selected.canChop()) &&
               !active.queue.isCarrying();
    }

    static getRequiredOptions(selected) {
        return { target: selected };
    }

    constructor(myte, options) {
        super(myte, options);
        this.phase = 'approach';
        this.animationTimer = 0;
    }

    update(tickDelta) {
        if (this.phase === 'approach') {
            const arrived = super.update(tickDelta);
            if (!arrived) return false;
            if (this.didAbortApproach()) return true;
            this.phase = 'chop';
            this.animationTimer = this.chopAnimationDuration ?? 2000;
            this.faceTarget();
            this.target?.chop?.();
            return false;
        }

        if (this.phase === 'chop') {
            this.faceTarget();
            this.animationTimer -= tickDelta;
            return this.animationTimer <= 0;
        }

        return true;
    }

    complete() {
        this.faceTarget();
        super.complete();
        if (this.postActionIdleDuration > 0) {
            this.myte.queue.addIdle(this.postActionIdleDuration);
        }
    }
}

class RemoveStumpAction extends GoToObjectAction {
    static metadata = { id: 'remove_stump' };

    static canPerform(selected, active) {
        return active &&
               selected?.constructor?.name === 'TreeStumpMapObject' &&
               (typeof selected.canRemoveStump !== 'function' || selected.canRemoveStump()) &&
               !active.queue.isCarrying();
    }

    static getRequiredOptions(selected) {
        return { target: selected };
    }

    constructor(myte, options) {
        super(myte, options);
        this.phase = 'approach';
        this.animationTimer = 0;
    }

    update(tickDelta) {
        if (this.phase === 'approach') {
            const arrived = super.update(tickDelta);
            if (!arrived) return false;
            if (this.didAbortApproach()) return true;
            this.phase = 'remove';
            this.animationTimer = this.removeAnimationDuration ?? 1500;
            this.faceTarget();
            this.target?.removeStump?.();
            return false;
        }

        if (this.phase === 'remove') {
            this.faceTarget();
            this.animationTimer -= tickDelta;
            return this.animationTimer <= 0;
        }

        return true;
    }

    complete() {
        this.faceTarget();
        super.complete();
        this.myte.queue.addExpression('excited', 300, 1);
        if (this.postActionIdleDuration > 0) {
            this.myte.queue.addIdle(this.postActionIdleDuration);
        }
    }
}
