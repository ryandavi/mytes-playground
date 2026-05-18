class CropPlantMapObject extends GrowingPlantMapObject {
    constructor(parent, type, variant, posX, posY, config = {}, options = {}) {
        super(parent, type, variant, posX, posY, config, options);
        
        // Harvesting state
        this.harvestable = false;
        this.quality = 1;
        
        // Cache harvest config values
        this.harvestableStage = this.getConfig('harvestConfig.harvestableStage', 'mature');
        this.canRegrow = this.getConfig('harvestConfig.regrowth', false);
        this.minYield = this.getConfig('harvestConfig.yield.min', 1);
        this.maxYield = this.getConfig('harvestConfig.yield.max', 1);
        this.qualityChance = this.getConfig('harvestConfig.yield.qualityChance', 0);
    }

    onGrowthStageComplete(stage) {
        // Call parent method
        super.onGrowthStageComplete(stage);
        
        // Check if crop is ready for harvest
        if (stage === this.harvestableStage) {
            this.harvestable = true;
            
            // Chance for higher quality crop
            this.determineQuality();
            
            // Add visual indicator for harvestable state
            this.updateHarvestableVisuals(true);
        }
    }
    
    determineQuality() {
        // Determine crop quality
        if (Math.random() < this.qualityChance) {
            this.quality++;
            
            // Apply quality visual effects
            if (this.element) {
                this.element.setAttribute('data-quality', this.quality);
            }
        }
    }
    
    updateHarvestableVisuals(isHarvestable) {
        if (!this.element) return;
        
        if (isHarvestable) {
            this.element.classList.add('harvestable');
        } else {
            this.element.classList.remove('harvestable');
        }
    }

    harvest() {
        if (!this.harvestable) return null;

        // Calculate harvest amount
        const amount = Math.floor(
            Math.random() * (this.maxYield - this.minYield + 1) + this.minYield
        );

        // Create harvest data
        const harvest = {
            type: this.type,
            variant: this.variant,
            quantity: amount,
            quality: this.quality
        };

        // Handle regrowth or removal
        if (this.canRegrow) {
            this.resetForRegrowth();
        } else {
            this.remove();
        }

        return harvest;
    }
    
    resetForRegrowth() {
        // Reset to growing stage
        this.growthStage = 'growing';
        this.growthProgress = 0;
        this.harvestable = false;
        this.quality = 1;
        
        // Play harvest animation
        this.playAnimation('harvest', () => {
            // Return to growing animation
            this.playAnimation(this.growthStage);
        });
        
        // Update visuals
        this.updateGrowthVisuals();
        this.updateHarvestableVisuals(false);
    }

    press(parent) {
        const myte = this.activeMyte;
        if (!myte) return false;

        return this.runInteractionWhenInRange(() => {
            if (this.harvestable) {
                this.performHarvest(parent, myte);
                return;
            }

            if (this.canWater()) {
                this.water();
            }
        }, myte);
    }
    
    performHarvest(parent, myte) {
        const harvest = this.harvest();
        const inventory = this.gameMap?.inventory || parent?.inventory;

        if (harvest && inventory) {
            inventory.addItem(harvest.variant, harvest.quantity, harvest.type);
            
            // Boost myte mood
            myte.stats.updateMood(5);
            
            // Play harvest animation on myte
            myte.queue.addExpression('happy');
        }
        return true;
    }

    render(container, parent) {
        const element = super.render(container, parent);
        
        // Add crop-specific classes
        element.classList.add('crop-plant');
        
        // Add harvestable class if applicable
        if (this.harvestable) {
            element.classList.add('harvestable');
        }
        
        // Add quality indicator
        if (this.quality > 1) {
            element.setAttribute('data-quality', this.quality);
        }
        
        return element;
    }
}
