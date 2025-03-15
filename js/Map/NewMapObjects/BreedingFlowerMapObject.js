class BreedingFlowerMapObject extends GrowingPlantMapObject {
    constructor(parent, type, variant, posX, posY, config = {}, options = {}) {
        super(parent, type, variant, posX, posY, config, options);
        
        // State flags
        this.pollinationState = 'ready';
        this.lastBreedingAttempt = 0;
        this.breedingCooldown = this.getConfig('breedingCooldown', 5000); // 5 seconds between breeding attempts
        
        // Cache DOM elements
        this.colorOverlay = null;
        
        // Initialize genetics if config exists
        this.genes = this.getConfig('geneticConfig') ? 
                    this.initializeGenes(this.getConfig('geneticConfig')) : null;
        
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

    update(parent) {
        super.update(parent);
        
        // Skip breeding logic if not fully grown
        if (!this.fullyGrown) return;
        
        this.attemptBreeding();
        
        // Apply seasonal effects
        this.applySeasonalEffects();
    }
    
    applySeasonalEffects() {
        // Apply seasonal effects once per update if config exists
        const seasonConfig = this.getConfig(`seasonalConfig.${this.currentSeason}`);
        if (seasonConfig) {
            // Adjust growth rate for season
            this.growthRate *= seasonConfig.growthRate || 1;
            
            // Adjust pollination chance for season
            this.pollinationChance = this.getConfig('breedingConfig.pollinationChance', 0.2) * 
                                   (seasonConfig.pollinationChance || 1);
        }
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