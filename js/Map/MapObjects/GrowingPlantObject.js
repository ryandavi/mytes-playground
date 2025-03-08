class GrowingPlantMapObject extends AnimatedMapObject {
    constructor(type, variant, posX, posY, config, options = {}) {
        super(type, variant, posX, posY, config);
        
        // Growth state
        this.growthStage = config.defaultStage || 'seed';
        this.growthProgress = 0;
        this.lastGrowthUpdate = Date.now();
        
        // Watering state
        this.isWatered = false;
        this.wateredBoostTimeRemaining = 0;
        
        // Growth configuration
        this.baseGrowthTime = config.growthConfig?.baseGrowthTime || 300000; // 5 minutes default
        this.currentSeason = 'summer'; // Should be synced with game time
        
        // Optimization flags
        this.fullyGrown = false;
        this.growthTimeMultiplier = 0.8 + (Math.random() * 0.4); // ±20% growth time
        this.growthRate = this.calculateGrowthRate();

        // Cache growth stages to avoid recreating array
        this.stages = ['seed', 'sprout', 'growing', 'mature'];
    }

    calculateGrowthRate() {
        if (this.fullyGrown) return 0;

        const seasonMultiplier = this.config.growthConfig?.seasonMultiplier?.[this.currentSeason] || 1;
        const waterBoostMultiplier = this.isWatered ? (this.config.growthConfig?.waterBoostMultiplier || 2) : 1;
        
        return this.baseGrowthTime * seasonMultiplier * waterBoostMultiplier * this.growthTimeMultiplier;
    }

    water(boostDuration = 30000) {
        if (this.isWatered || this.fullyGrown) {
            return false;
        }
        
        this.isWatered = true;
        this.wateredBoostTimeRemaining = boostDuration;
        this.growthRate = this.calculateGrowthRate();
        
        if (this.element) {
            this.element.classList.add('watered');
            this.playAnimation('watering');
        }
        
        return true;
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
                this.element?.classList.remove('watered');
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

        this.growthStage = this.stages[currentIndex + 1];
        this.growthProgress = 0;
        
        // Generate new random growth time multiplier for next stage
        this.growthTimeMultiplier = 0.8 + (Math.random() * 0.4);
        this.growthRate = this.calculateGrowthRate();
        
        // Update visuals
        if (this.element) {
            this.stages.forEach(stage => this.element.classList.remove(stage));
            this.element.classList.add(this.growthStage);
            this.playAnimation(this.growthStage);
        }
        
        // Check if this is the final stage
        if (this.growthStage === 'mature') {
            this.fullyGrown = true;
        }

        this.onGrowthStageComplete(this.growthStage);
    }

    onGrowthStageComplete(stage) {
        if (stage === 'mature' && this.config.growthConfig?.harvestable) {
            // Spawn harvest items
        }
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

class BreedingFlowerMapObject extends GrowingPlantMapObject {
    constructor(type, variant, posX, posY, config, options = {}) {
        super(type, variant, posX, posY, config);
        
        // State flags
        this.pollinationState = 'ready';
        this.lastBreedingAttempt = 0;
        this.breedingCooldown = 5000; // 5 seconds between breeding attempts
        
        // Cache DOM elements
        this.colorOverlay = null;
        
        // Initialize genetics if config exists
        this.genes = config.geneticConfig ? this.initializeGenes(config.geneticConfig) : null;
        
        // Cache breeding config values
        this.pollinationRadius = config.breedingConfig?.pollinationRadius || 0;
        this.pollinationChance = config.breedingConfig?.pollinationChance || 0;
        this.mutationChance = config.breedingConfig?.mutationChance || 0;
    }

    initializeGenes(geneticConfig) {
        if (!geneticConfig?.genes) return null;
        
        const genes = {};
        Object.entries(geneticConfig.genes).forEach(([trait, possibilities]) => {
            genes[trait] = possibilities[Math.floor(Math.random() * possibilities.length)];
        });
        return genes;
    }

    getBreedingPartners() {
        if (!this.pollinationRadius || !this.parent?.mapArea) return [];
        
        return this.parent.mapArea.getObjectsInRadius(this.posX, this.posY, this.pollinationRadius)
            .filter(obj => obj instanceof BreedingFlowerMapObject && 
                         obj !== this && 
                         obj.growthStage === 'mature');
    }

    attemptBreeding() {
        const now = Date.now();
        if (this.pollinationState !== 'ready' || 
            !this.genes ||
            this.growthStage !== 'mature' ||
            now - this.lastBreedingAttempt < this.breedingCooldown) return;

        this.lastBreedingAttempt = now;
        
        const partners = this.getBreedingPartners();
        if (!partners.length) return;

        partners.forEach(partner => {
            if (Math.random() < this.pollinationChance) {
                this.breed(partner);
                this.pollinationState = 'pollinating';
                this.playAnimation('pollinating', () => {
                    this.pollinationState = 'ready';
                    this.playAnimation(this.growthStage);
                });
            }
        });
    }

    breed(partner) {
        if (!this.genes || !partner.genes) return;

        const childGenes = this.createChildGenes(partner);
        const spawnPoint = this.findSpawnPoint();
        
        if (spawnPoint && this.parent?.mapArea) {
            const newPlant = new this.constructor(
                this.type,
                this.variant,
                spawnPoint.x,
                spawnPoint.y,
                {
                    ...this.config,
                    initialGenes: childGenes
                }
            );
            this.parent.mapArea.addObject(newPlant);
        }
    }

    createChildGenes(partner) {
        const childGenes = {};
        const traitInheritance = this.config.breedingConfig?.traitInheritance || {};
        const geneticConfig = this.config.geneticConfig;

        Object.keys(this.genes).forEach(trait => {
            const inheritanceChance = traitInheritance[trait] || 0.5;
            
            if (Math.random() < this.mutationChance) {
                const possibilities = geneticConfig.genes[trait];
                childGenes[trait] = possibilities[Math.floor(Math.random() * possibilities.length)];
            } else {
                childGenes[trait] = Math.random() < inheritanceChance ? 
                    this.genes[trait] : partner.genes[trait];
            }
        });

        return childGenes;
    }

    findSpawnPoint() {
        const radius = 50;
        const attempts = 8;
        const angleStep = (Math.PI * 2) / attempts;
        
        for (let i = 0; i < attempts; i++) {
            const x = this.posX + Math.cos(angleStep * i) * radius;
            const y = this.posY + Math.sin(angleStep * i) * radius;
            
            if (!this.parent?.mapArea) continue;
            
            const nearby = this.parent.mapArea.getObjectsInRadius(x, y, 20);
            if (nearby.length === 0) {
                return { x, y };
            }
        }
        return null;
    }

    updateAppearance() {
        if (!this.element || !this.genes) return;

        if (!this.colorOverlay) {
            this.colorOverlay = document.createElement('div');
            this.colorOverlay.className = 'color-overlay';
            this.element.appendChild(this.colorOverlay);
        }

        // Apply genetic traits
        const scale = this.genes.size === 'small' ? 0.8 : 
                     this.genes.size === 'large' ? 1.2 : 1;

        this.colorOverlay.style.backgroundColor = this.genes.petalColor;
        this.element.setAttribute('data-pattern', this.genes.pattern);
        this.element.style.transform = `scale(${scale})`;
    }

    update(parent) {
        super.update(parent);
        if (!this.fullyGrown) return;
        
        this.attemptBreeding();
        
        // Apply seasonal effects once per update if config exists
        const seasonConfig = this.config.seasonalConfig?.[this.currentSeason];
        if (seasonConfig) {
            this.growthRate *= seasonConfig.growthRate;
            this.pollinationChance = this.config.breedingConfig.pollinationChance * 
                                   seasonConfig.pollinationChance;
        }
    }
}

class NightBloomMapObject extends BreedingFlowerMapObject {
    constructor(type, variant, posX, posY, config, options = {}) {
        super(type, variant, posX, posY, config);
        
        this.bloomState = 'closed';
        this.lastTimeCheck = 0;
        this.timeCheckInterval = 1000; // Check time every second
        
        // Cache time values
        const [openHour] = config.dayNightConfig?.openTime.split(':').map(Number) || [18];
        const [closeHour] = config.dayNightConfig?.closeTime.split(':').map(Number) || [6];
        this.openHour = openHour;
        this.closeHour = closeHour;
        
        this.updateDayNightState();
    }

    updateDayNightState() {
        const now = Date.now();
        if (now - this.lastTimeCheck < this.timeCheckInterval) return;
        this.lastTimeCheck = now;

        const currentHour = new Date().getHours();
        const shouldBeOpen = currentHour >= this.openHour || currentHour < this.closeHour;
        
        if (shouldBeOpen && this.bloomState === 'closed') {
            this.open();
        } else if (!shouldBeOpen && this.bloomState === 'open') {
            this.close();
        }
    }

    open() {
        if (this.growthStage !== 'mature' || this.bloomState === 'opening') return;
        
        this.bloomState = 'opening';
        this.playAnimation('opening', () => {
            this.bloomState = 'open';
            this.playAnimation('open');
            this.element?.classList.add('glowing');
        });
    }

    close() {
        if (this.growthStage !== 'mature' || this.bloomState === 'closing') return;
        
        this.bloomState = 'closing';
        this.element?.classList.remove('glowing');
        this.playAnimation('closing', () => {
            this.bloomState = 'closed';
            this.playAnimation('closed');
        });
    }

    update(parent) {
        super.update(parent);
        if (this.fullyGrown) {
            this.updateDayNightState();
        }
    }
}

class CropPlantMapObject extends GrowingPlantMapObject {
    constructor(type, variant, posX, posY, config, options = {}) {
        super(type, variant, posX, posY, config);
        
        this.harvestable = false;
        this.quality = 1;
        
        // Cache harvest config values
        const harvestConfig = config.harvestConfig || {};
        this.harvestableStage = harvestConfig.harvestableStage || 'mature';
        this.canRegrow = harvestConfig.regrowth || false;
        this.minYield = harvestConfig.yield?.min || 1;
        this.maxYield = harvestConfig.yield?.max || 1;
        this.qualityChance = harvestConfig.yield?.qualityChance || 0;

        console.log(config, options);


    }

    onGrowthStageComplete(stage) {
        if (stage === this.harvestableStage) {
            this.harvestable = true;
            if (Math.random() < this.qualityChance) {
                this.quality++;
            }
        }
    }

    harvest() {
        if (!this.harvestable) return null;

        const amount = Math.floor(
            Math.random() * (this.maxYield - this.minYield + 1) + this.minYield
        );

        const harvest = {
            type: this.type,
            variant: this.variant,
            quantity: amount,
            quality: this.quality
        };

        if (this.canRegrow) {
            this.growthStage = 'growing';
            this.growthProgress = 0;
            this.harvestable = false;
            this.quality = 1;
            this.playAnimation('harvest', () => {
                this.playAnimation(this.growthStage);
            });
        } else {
            this.remove();
        }

        return harvest;
    }

    press(parent) {
        if (!parent?.activeMyte) return false;

        if (parent.activeMyte) {
            parent.ui.setSelected(this);
        }

        const myte = parent.activeMyte;
        const distance = Math.hypot(this.posX - myte.posX, this.posY - myte.posY);

        // log the current stage
        console.log(this.growthStage);

        if (distance <= this.config.interactionRadius) {
            if (this.harvestable) {
                const harvest = this.harvest();
                if (harvest && parent.inventory) {
                    parent.inventory.addItem(harvest.type, harvest.quantity, harvest.variant);
                    myte.stats.updateMood(5);
                }
                return true;
            } else {
                return this.water();
            }
        }else{
            myte.setTarget(this.posX, this.posY);
        }

        return false;
    }

    render(container, parent) {
        const element = super.render(container, parent);
        element.classList.add('crop-plant');
        return element;
    }
}