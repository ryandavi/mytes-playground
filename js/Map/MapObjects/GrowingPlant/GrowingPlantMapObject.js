class GrowingPlantMapObject extends withItemDrops(InteractiveMapObject) {
    getApproachMode() {
        return 'adjacent';
    }

    constructor(parent, type, variant, posX, posY, config = {}, options = {}) {
        super(parent, type, variant, posX, posY, config, options);
        
        // Growth state — options.growthStage lets saved data restore the stage
        this.growthStage = options.growthStage || this.getConfig('defaultStage', 'seed');
        this.growthProgress = Number.isFinite(options.growthProgress) ? options.growthProgress : 0;
        this._growthAccumulator = Number.isFinite(options._growthAccumulator) ? options._growthAccumulator : 0;

        // Watering state
        this.isWatered = false;
        this.wateredBoostTimeRemaining = 0;
        
        // Growth configuration
        this.baseGrowthTime = this.getConfig('growthConfig.baseGrowthTime', 300000); // 5 minutes default
        
        // Optimization flags
        this.fullyGrown = false;
        this.growthTimeMultiplier = 0.8 + (Math.random() * 0.4); // ±20% growth time
        this.growthRate = this.calculateGrowthRate();

        // Cache growth stages to avoid recreating array
        this.stages = ['seed', 'sprout', 'growing', 'mature'];

        // Recalculate growth rate whenever the season or moon phase changes.
        this._onSeasonChange = () => { this.growthRate = this.calculateGrowthRate(); };
        GameTime.instance?.subscribe('season', this._onSeasonChange);
        this._onMoonPhaseChange = () => { this.growthRate = this.calculateGrowthRate(); };
        GameTime.instance?.subscribe('moonPhase', this._onMoonPhaseChange);

        // Advance growth (and any subclass state) whenever time is skipped forward.
        this._onTimeSkip = (realMs) => this.onTimeSkip(realMs);
        GameTime.instance?.subscribe('timeSkip', this._onTimeSkip);
    }

    getCurrentSeason() {
        return GameTime.instance?.getCurrentSeason?.() ?? this.getConfig('growthConfig.defaultSeason', 'summer');
    }

    calculateGrowthRate() {
        if (this.fullyGrown) return 0;

        const allowedSeasons = this.getConfig('growthConfig.allowedSeasons', null);
        if (Array.isArray(allowedSeasons) && !allowedSeasons.includes(this.getCurrentSeason())) {
            return Infinity;
        }

        const seasonMultiplier = this.getConfig(`growthConfig.seasonMultiplier.${this.getCurrentSeason()}`, 1);
        const waterBoostMultiplier = this.isWatered ? this.getConfig('growthConfig.waterBoostMultiplier', 2) : 1;
        const moonMultiplier = GameTime.instance?.getMoonGrowthMultiplier?.() ?? 1;

        return this.baseGrowthTime * seasonMultiplier * waterBoostMultiplier * moonMultiplier * this.growthTimeMultiplier;
    }

    water(boostDuration = 30000) {
        if (this.isWatered || this.fullyGrown) {
            return false;
        }
        
        this.isWatered = true;
        this.wateredBoostTimeRemaining = boostDuration;
        this.growthRate = this.calculateGrowthRate();
        
        this.updateWateredState(true);
        this.playAnimation('watering');
        
        return true;
    }
    
    updateWateredState(isWatered) {
        if (!this.element) return;
        
        if (isWatered) {
            this.element.classList.add('watered');
        } else {
            this.element.classList.remove('watered');
        }
    }

    // updateGrowth is called from tickUpdate (fixed delta) and onTimeSkip (large debug delta).
    // Overflow progress carries across stage boundaries so a large delta can advance multiple stages.
    updateGrowth(tickDelta) {
        if (this.fullyGrown) return;

        if (this.isWatered) {
            this.wateredBoostTimeRemaining -= tickDelta;
            if (this.wateredBoostTimeRemaining <= 0) {
                this.isWatered = false;
                this.growthRate = this.calculateGrowthRate();
                this.updateWateredState(false);
            }
        }

        const progressMultiplier = 0.9 + (Math.random() * 0.2);
        this.growthProgress += (tickDelta / this.growthRate) * progressMultiplier;

        while (this.growthProgress >= 1 && !this.fullyGrown) {
            this.growthProgress -= 1;
            this.advanceGrowthStage();
        }

        if (this.fullyGrown) this.growthProgress = 0;
    }

    advanceGrowthStage() {
        const currentIndex = this.stages.indexOf(this.growthStage);
        const isLastStage = currentIndex === this.stages.length - 1;

        if (isLastStage) {
            this.fullyGrown = true;
            return;
        }

        this.growthStage = this.stages[currentIndex + 1];
        // growthProgress carry-over is managed by the while loop in updateGrowth

        this.growthTimeMultiplier = 0.8 + (Math.random() * 0.4);
        this.growthRate = this.calculateGrowthRate();

        this.updateGrowthVisuals();
        this.gameMap?.particleSystem?.burstEffectAtObject(this, 'SPARKLE', { count: 12, spread: 40 });

        if (this.growthStage === 'mature') {
            this.fullyGrown = true;
            this.gameMap?.eventManager?.emit('plant:matured', { plant: this });
        }

        this.onGrowthStageComplete(this.growthStage);
    }

    // Template method — override in subclasses to advance additional time-sensitive state.
    // Always call super.onTimeSkip(realMs) first so growth is updated before subclass logic.
    onTimeSkip(realMs) {
        this.updateGrowth(realMs);
    }
    
    updateGrowthVisuals() {
        if (!this.element) return;
        
        // Remove all stage classes
        this.stages.forEach(stage => this.element.classList.remove(stage));
        
        // Add current stage class
        this.element.classList.add(this.growthStage);
        
        // Update animation
        this.playAnimation(this.growthStage);
    }

    onGrowthStageComplete(stage) {
        if (stage === 'mature' && this.getConfig('growthConfig.harvestable')) {
            // Spawn harvest items if configured
            this.onReadyToHarvest();
        }
    }
    
    onReadyToHarvest() {
        // Override in subclasses to handle harvest
    }

    tickUpdate(tickDelta) {
        super.tickUpdate(tickDelta);
        this.updateGrowth(tickDelta);
    }

    update(deltaTime) {
        super.update(deltaTime);
    }

    render(container, parent) {
        const element = super.render(container, parent);
        element.classList.add('growing-plant', this.growthStage);
        
        if (this.isWatered) {
            element.classList.add('watered');
        }
        
        return element;
    }

    canWater() {
        return !this.isWatered && !this.fullyGrown;
    }

    // setDeflowered/clearDeflowered/isDeflowered are inherited from MapObject —
    // FLOWER/GRASS types use them too, so they live on the shared base.

    _getSidebarStatusRows() {
        const rows = [];
        const deflowered = this.isDeflowered();

        if (this.isFlower()) {
            rows.push({ label: 'Flower Available', value: deflowered ? 'No' : 'Yes' });
            if (deflowered) rows.push({ label: 'Flower State', value: 'Deflowered' });
        }
        if (this.growthStage != null) rows.push({ label: 'Stage', value: this.growthStage });
        if (typeof this.isReadyToHarvest === 'function') rows.push({ label: 'Ready to Harvest', value: this.isReadyToHarvest() ? 'Yes' : 'No' });
        if (this.isWatered != null) rows.push({ label: 'Watered', value: this.isWatered ? 'Yes' : 'No' });
        if (typeof this.canWater === 'function' && !this.isWatered) rows.push({ label: 'Needs Water', value: this.canWater() ? 'Yes' : 'No' });

        return rows;
    }

    getSaveData() {
        return {
            type: this.type,
            variant: this.variant,
            posX: this.posX,
            posY: this.posY,
            growthStage: this.growthStage,
            growthProgress: this.growthProgress,
            _growthAccumulator: this._growthAccumulator
        };
    }

    serializeState() {
        return {
            ...this.getSaveData(),
            isWatered: this.isWatered,
            wateredBoostTimeRemaining: this.wateredBoostTimeRemaining,
            growthTimeMultiplier: this.growthTimeMultiplier,
            genes: this.genes ? Utility.deepClone(this.genes) : undefined,
            pollinationState: this.pollinationState
        };
    }

    restoreState(data = {}) {
        this.restoreFromSaveData(data);
        this.isWatered = data.isWatered === true;
        this.wateredBoostTimeRemaining = Number(data.wateredBoostTimeRemaining) || 0;
        if (Number.isFinite(data.growthTimeMultiplier)) this.growthTimeMultiplier = data.growthTimeMultiplier;
        if (data.genes) this.genes = Utility.deepClone(data.genes);
        if (data.pollinationState) this.pollinationState = data.pollinationState;
        this.growthRate = this.calculateGrowthRate();
        this.updateWateredVisuals?.();
    }

    restoreFromSaveData(data = {}) {
        if (data.growthStage) {
            this.growthStage = data.growthStage;
            this.growthProgress = Number.isFinite(data.growthProgress) ? data.growthProgress : 0;
            this._growthAccumulator = Number.isFinite(data._growthAccumulator) ? data._growthAccumulator : 0;
            this.fullyGrown = this.growthStage === this.stages[this.stages.length - 1];
            this.updateGrowthVisuals();
        }
    }

    remove() {
        if (this._onSeasonChange) {
            GameTime.instance?.unsubscribe('season', this._onSeasonChange);
            this._onSeasonChange = null;
        }
        if (this._onMoonPhaseChange) {
            GameTime.instance?.unsubscribe('moonPhase', this._onMoonPhaseChange);
            this._onMoonPhaseChange = null;
        }
        if (this._onTimeSkip) {
            GameTime.instance?.unsubscribe('timeSkip', this._onTimeSkip);
            this._onTimeSkip = null;
        }
        super.remove();
    }
}

// Composes automatic bend/squash feedback onto decorative foliage and growing crops.
const withTrampleResponse = BaseClass => class extends BaseClass {
    constructor(parent, type, variant, posX, posY, config = {}, options = {}) {
        super(parent, type, variant, posX, posY, config, options);
        this._trampleActorState = new Map();
        this._trampleVisual = null;
        this._trampleVisualActive = false;
        this._trampleRecovering = false;
        this._trampleOverlapping = false;
        this._trampleRecoverUntil = 0;
        this._trampleVisualDirty = false;
    }

    render(container, parent) {
        const element = super.render(container, parent);
        element.classList.add('trample-reactive');
        return element;
    }

    getNearbyTrampleActors() {
        const radius = this.getFiniteConfigNumber('trampleResponse.detectionRadius', 0);
        if (radius <= 0) return [];

        return this.gameMap?.worldQuery?.findNearby({
            x: this.posX + (this.size.width / 2),
            y: this.posY + (this.size.height / 2),
            radius,
            kind: [WORLD_ENTITY_KINDS.MYTE, WORLD_ENTITY_KINDS.OBJECT],
            measureFrom: 'center',
            exclude: this,
            filter: actor => actor.kind === WORLD_ENTITY_KINDS.MYTE ||
                actor.getConfig?.('physics.actorCollision', false)
        }) ?? [];
    }

    triggerTrampleResponse(actor, movementX, movementY) {
        const minimumMovement = this.getFiniteConfigNumber('trampleResponse.minimumMovement', 0);
        const magnitude = Math.hypot(movementX, movementY);
        if (magnitude < minimumMovement) return false;

        let directionX = movementX / magnitude;
        const directionY = movementY / magnitude;
        if (Math.abs(directionX) < 0.15) {
            const actorCenterX = actor.posX + ((actor.size?.width ?? 0) / 2);
            const foliageCenterX = this.posX + (this.size.width / 2);
            directionX = Math.sign(actorCenterX - foliageCenterX) || 1;
        }

        this._trampleVisual = {
            pressDuration: this.getFiniteConfigNumber('trampleResponse.pressDuration', 0),
            recoveryDuration: this.getFiniteConfigNumber('trampleResponse.recoveryDuration', 0),
            bend: -directionX * this.getFiniteConfigNumber('trampleResponse.bendDegrees', 0),
            shiftX: directionX * this.getFiniteConfigNumber('trampleResponse.horizontalShift', 0),
            shiftY: Math.abs(directionY) * this.getFiniteConfigNumber('trampleResponse.verticalShift', 0),
            squash: this.getFiniteConfigNumber('trampleResponse.squashScale', 1),
            stretch: this.getFiniteConfigNumber('trampleResponse.stretchScale', 1)
        };
        this._trampleVisualDirty = true;
        this.playConfiguredSound('step');
        return true;
    }

    tickUpdate(tickDelta) {
        super.tickUpdate(tickDelta);
        if (!this.getConfig('trampleResponse.enabled', false)) return;

        const now = SimClock.now();
        const responseBounds = RectUtils.getEntityColliderBounds(this);
        const seenActors = new Set();
        let hasOverlap = false;

        for (const actor of this.getNearbyTrampleActors()) {
            const actorId = actor.worldId ?? actor.id;
            seenActors.add(actorId);
            const previous = this._trampleActorState.get(actorId);
            const overlapping = RectUtils.boundsOverlap(
                responseBounds,
                RectUtils.getEntityColliderBounds(actor)
            );
            const movementX = previous
                ? actor.posX - previous.x
                : (actor.targetX ?? actor.posX) - actor.posX;
            const movementY = previous
                ? actor.posY - previous.y
                : (actor.targetY ?? actor.posY) - actor.posY;

            let responded = previous?.overlapping && previous.responded === true;
            if (overlapping && !responded) {
                responded = this.triggerTrampleResponse(actor, movementX, movementY);
            }
            hasOverlap = hasOverlap || overlapping;

            this._trampleActorState.set(actorId, {
                x: actor.posX,
                y: actor.posY,
                overlapping,
                responded: overlapping && responded
            });
        }

        for (const actorId of this._trampleActorState.keys()) {
            if (!seenActors.has(actorId)) this._trampleActorState.delete(actorId);
        }

        if (this._trampleOverlapping && !hasOverlap && this._trampleVisual) {
            this._trampleRecoverUntil = now + this._trampleVisual.recoveryDuration;
        }
        this._trampleOverlapping = hasOverlap;
    }

    update(deltaTime) {
        super.update(deltaTime);
        if (!this.element) return;

        const now = SimClock.now();
        const active = !!this._trampleVisual && this._trampleOverlapping;
        const recovering = !!this._trampleVisual && !active && now < this._trampleRecoverUntil;
        if (this._trampleVisualDirty && this._trampleVisual) {
            const visual = this._trampleVisual;
            this.element.style.setProperty('--trample-bend', `${visual.bend}deg`);
            this.element.style.setProperty('--trample-shift-x', `${visual.shiftX}px`);
            this.element.style.setProperty('--trample-shift-y', `${visual.shiftY}px`);
            this.element.style.setProperty('--trample-squash', visual.squash);
            this.element.style.setProperty('--trample-stretch', visual.stretch);
            this.element.style.setProperty('--trample-press-duration', `${visual.pressDuration}ms`);
            this.element.style.setProperty('--trample-recovery-duration', `${visual.recoveryDuration}ms`);
            this._trampleVisualDirty = false;
        }

        if (active !== this._trampleVisualActive) {
            this.element.classList.toggle('is-trampled', active);
            this._trampleVisualActive = active;
        }
        if (recovering !== this._trampleRecovering) {
            this.element.classList.toggle('is-recovering', recovering);
            this._trampleRecovering = recovering;
        }
    }
};

class FoliageMapObject extends withTrampleResponse(withItemDrops(MapObject)) {}

class FlowerMapObject extends FoliageMapObject {}
