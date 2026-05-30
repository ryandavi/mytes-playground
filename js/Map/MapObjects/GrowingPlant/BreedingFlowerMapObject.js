class BreedingFlowerMapObject extends GrowingPlantMapObject {
    constructor(parent, type, variant, posX, posY, config = {}, options = {}) {
        super(parent, type, variant, posX, posY, config, options);
        
        // State flags
        this.pollinationState = 'ready';
        this._breedingElapsed = 0;      // accumulated ms since last attempt
        this.breedingCooldown = this.getConfig('breedingCooldown', 5000);
        
        // Cache DOM elements
        this.colorOverlay = null;
        
        // Initialize genetics if config exists
        this.genes = options.initialGenes ||
            (this.getConfig('geneticConfig') ?
                this.initializeGenes(this.getConfig('geneticConfig')) : null);
        
        // Cache breeding config values
        this.pollinationRadius = this.getConfig('breedingConfig.pollinationRadius', 150);
        this.pollinationChance = this.getConfig('breedingConfig.pollinationChance', 0.2);
        this.mutationChance = this.getConfig('breedingConfig.mutationChance', 0.1);
    }

    initializeGenes(geneticConfig) {
        if (!geneticConfig?.genes) return null;
        
        const genes = {};
        Object.entries(geneticConfig.genes).forEach(([trait, possibilities]) => {
            genes[trait] = possibilities[Math.floor(Math.random() * possibilities.length)];
        });
        return genes;
    }

    receivePollen(payload) {
        if (!payload?.genes || this.pollinationState !== 'ready' || this.growthStage !== 'mature') return;
        if (!this.genes) {
            this.genes = { ...payload.genes };
            return;
        }
        const childGenes = this.createChildGenes({ genes: payload.genes });
        const spawnPoint = this.findSpawnPoint();
        if (spawnPoint && this.gameMap) {
            const newPlant = new this.constructor(
                this.gameMap, this.type, this.variant,
                spawnPoint.x, spawnPoint.y,
                { ...this.config },
                { initialGenes: childGenes }
            );
            this.gameMap.addObject(newPlant);
        }
    }

    getBreedingPartners() {
        if (!this.pollinationRadius || !this.gameMap) return [];
        
        return this.gameMap.getObjectsInRadius(this.posX, this.posY, this.pollinationRadius)
            .filter(obj => obj instanceof BreedingFlowerMapObject && 
                         obj !== this && 
                         obj.growthStage === 'mature');
    }

    // tickDelta is passed from tickUpdate so the cooldown is game-loop-driven
    attemptBreeding(tickDelta) {
        if (this.pollinationState !== 'ready' || !this.genes || this.growthStage !== 'mature') return;

        this._breedingElapsed += tickDelta;
        if (this._breedingElapsed < this.breedingCooldown) return;
        this._breedingElapsed = 0;
        
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
        
        if (spawnPoint && this.gameMap) {
            const newPlant = new this.constructor(
                this.gameMap,
                this.type,
                this.variant,
                spawnPoint.x,
                spawnPoint.y,
                { ...this.config },
                { initialGenes: childGenes }
            );
            this.gameMap.addObject(newPlant);
        }
    }

    createChildGenes(partner) {
        const childGenes = {};
        const traitInheritance = this.getConfig('breedingConfig.traitInheritance', {});
        const geneticConfig = this.getConfig('geneticConfig', {});

        Object.keys(this.genes).forEach(trait => {
            const inheritanceChance = traitInheritance[trait] || 0.5;
            
            if (Math.random() < this.mutationChance) {
                // Mutation: pick a random value
                const possibilities = geneticConfig.genes?.[trait] || [];
                childGenes[trait] = possibilities[Math.floor(Math.random() * possibilities.length)];
            } else {
                // Inheritance: pick from either parent
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
            
            if (!this.gameMap) continue;
            
            const nearby = this.gameMap.getObjectsInRadius(x, y, 20);
            if (nearby.length === 0) {
                return { x, y };
            }
        }
        return null;
    }

    updateAppearance() {
        if (!this.element || !this.genes) return;

        // Create color overlay if needed
        this.ensureColorOverlay();

        // Apply genetic traits
        const scale = this.genes.size === 'small' ? 0.8 : 
                     this.genes.size === 'large' ? 1.2 : 1;

        this.colorOverlay.style.backgroundColor = this.genes.petalColor;
        this.element.setAttribute('data-pattern', this.genes.pattern);
        this.element.style.transform = `scale(${scale})`;
    }
    
    ensureColorOverlay() {
        if (!this.colorOverlay) {
            this.colorOverlay = document.createElement('div');
            this.colorOverlay.className = 'color-overlay';
            this.element.appendChild(this.colorOverlay);
        }
    }

    isFlower() { return true; }

    _getSidebarStatusRows() {
        const rows = [...super._getSidebarStatusRows()];
        if (this.pollinationState != null) rows.push({ label: 'Pollination', value: this.pollinationState });
        return rows;
    }

    onTimeSkip(realMs) {
        super.onTimeSkip(realMs);
        this._breedingElapsed += realMs;
    }

    tickUpdate(tickDelta) {
        super.tickUpdate(tickDelta);
        if (!this.fullyGrown) return;
        this.attemptBreeding(tickDelta);
        this.applySeasonalEffects();
    }

    update(deltaTime) {
        super.update(deltaTime);
    }
    
    applySeasonalEffects() {
        const season = this.getCurrentSeason();
        const seasonConfig = this.getConfig(`seasonalConfig.${season}`);
        const basePollination = this.getConfig('breedingConfig.pollinationChance', 0.2);
        const seasonFactor = seasonConfig?.pollinationChance ?? 1;
        const moonFactor = GameTime.instance?.getMoonGrowthMultiplier?.() ?? 1;
        this.pollinationChance = basePollination * seasonFactor * moonFactor;
    }
    
    render(container, parent) {
        const element = super.render(container, parent);
        
        // Add breeding flower specific class
        element.classList.add('breeding-flower');
        
        // Update genetic appearance
        if (this.genes) {
            this.updateAppearance();
        }
        
        return element;
    }
}
