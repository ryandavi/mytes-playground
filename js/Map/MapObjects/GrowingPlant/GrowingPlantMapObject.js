class GrowingPlantMapObject extends RangeInteractiveAnimatedMapObject {
    getApproachMode() {
        return 'adjacent';
    }

    constructor(parent, type, variant, posX, posY, config = {}, options = {}) {
        super(parent, type, variant, posX, posY, config, options);
        
        // Growth state
        this.growthStage = this.getConfig('defaultStage', 'seed');
        this.growthProgress = 0;
        // No longer uses Date.now() — growth is driven by accumulated tickDelta
        this._growthAccumulator = 0;

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

        // Recalculate growth rate whenever the season changes.
        this._onSeasonChange = () => { this.growthRate = this.calculateGrowthRate(); };
        GameTime.instance?.subscribe('season', this._onSeasonChange);

        // Advance growth (and any subclass state) when debug time is skipped.
        this._onTimeSkip = (realMs) => this.onTimeSkip(realMs);
        GameTime.instance?.subscribe('timeSkip', this._onTimeSkip);
    }

    getCurrentSeason() {
        return GameTime.instance?.getCurrentSeason?.() ?? this.getConfig('growthConfig.defaultSeason', 'summer');
    }

    calculateGrowthRate() {
        if (this.fullyGrown) return 0;

        const seasonMultiplier = this.getConfig(`growthConfig.seasonMultiplier.${this.getCurrentSeason()}`, 1);
        const waterBoostMultiplier = this.isWatered ? this.getConfig('growthConfig.waterBoostMultiplier', 2) : 1;
        
        return this.baseGrowthTime * seasonMultiplier * waterBoostMultiplier * this.growthTimeMultiplier;
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

        if (this.growthStage === 'mature') {
            this.fullyGrown = true;
        }

        this.onGrowthStageComplete(this.growthStage);
    }

    // Template method — override in subclasses to advance additional time-sensitive state.
    // Always call super.onTimeSkip(realMs) first.
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

    remove() {
        if (this._onSeasonChange) {
            GameTime.instance?.unsubscribe('season', this._onSeasonChange);
            this._onSeasonChange = null;
        }
        if (this._onTimeSkip) {
            GameTime.instance?.unsubscribe('timeSkip', this._onTimeSkip);
            this._onTimeSkip = null;
        }
        super.remove();
    }
}
