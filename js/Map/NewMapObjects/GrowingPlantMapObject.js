class GrowingPlantMapObject extends AnimatedMapObject {
    constructor(type, variant, posX, posY, config = {}, options = {}) {
        super(type, variant, posX, posY, config, options);
        
        // Growth state
        this.growthStage = this.getConfig('defaultStage', 'seed');
        this.growthProgress = 0;
        this.lastGrowthUpdate = Date.now();
        
        // Watering state
        this.isWatered = false;
        this.wateredBoostTimeRemaining = 0;
        
        // Growth configuration
        this.baseGrowthTime = this.getConfig('growthConfig.baseGrowthTime', 300000); // 5 minutes default
        this.currentSeason = this.getConfig('currentSeason', 'summer'); // Should be synced with game time
        
        // Optimization flags
        this.fullyGrown = false;
        this.growthTimeMultiplier = 0.8 + (Math.random() * 0.4); // ±20% growth time
        this.growthRate = this.calculateGrowthRate();

        // Cache growth stages to avoid recreating array
        this.stages = ['seed', 'sprout', 'growing', 'mature'];
    }

    calculateGrowthRate() {
        if (this.fullyGrown) return 0;

        const seasonMultiplier = this.getConfig(`growthConfig.seasonMultiplier.${this.currentSeason}`, 1);
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

    updateGrowth() {
        // Skip growth updates if fully grown
        if (this.fullyGrown) return;

        const now = Date.now();
        const elapsed = now - this.lastGrowthUpdate;
        this.lastGrowthUpdate = now;

        // Update watered state
        if (this.isWatered) {
            this.wateredBoostTimeRemaining -= elapsed;
            if (this.wateredBoostTimeRemaining <= 0) {
                this.isWatered = false;
                this.growthRate = this.calculateGrowthRate();
                this.updateWateredState(false);
            }
        }

        // Add small random variations to growth progress (±10%)
        const progressMultiplier = 0.9 + (Math.random() * 0.2);
        this.growthProgress += (elapsed / this.growthRate) * progressMultiplier;
        
        // Check for stage advancement
        if (this.growthProgress >= 1) {
            this.advanceGrowthStage();
        }
    }

    advanceGrowthStage() {
        const currentIndex = this.stages.indexOf(this.growthStage);
        const isLastStage = currentIndex === this.stages.length - 1;
        
        if (isLastStage) {
            this.fullyGrown = true;
            return;
        }

        // Advance to next stage
        this.growthStage = this.stages[currentIndex + 1];
        this.growthProgress = 0;
        
        // Generate new random growth time multiplier for next stage
        this.growthTimeMultiplier = 0.8 + (Math.random() * 0.4);
        this.growthRate = this.calculateGrowthRate();
        
        // Update visuals
        this.updateGrowthVisuals();
        
        // Check if this is the final stage
        if (this.growthStage === 'mature') {
            this.fullyGrown = true;
        }

        this.onGrowthStageComplete(this.growthStage);
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

    update(parent) {
        super.update(parent);
        this.updateGrowth();
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
}