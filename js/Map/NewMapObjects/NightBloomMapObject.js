class NightBloomMapObject extends BreedingFlowerMapObject {
    constructor(parent, type, variant, posX, posY, config = {}, options = {}) {
        super(parent, type, variant, posX, posY, config, options);
        
        // Bloom state
        this.bloomState = 'closed';
        this.lastTimeCheck = 0;
        this.timeCheckInterval = 1000; // Check time every second
        
        // Cache time values for better performance
        const [openHour] = this.getConfig('dayNightConfig.openTime', '18:00').split(':').map(Number);
        const [closeHour] = this.getConfig('dayNightConfig.closeTime', '06:00').split(':').map(Number);
        this.openHour = openHour;
        this.closeHour = closeHour;
        
        // Initialize day/night state
        this.updateDayNightState();
    }

    updateDayNightState() {
        const now = Date.now();
        if (now - this.lastTimeCheck < this.timeCheckInterval) return;
        this.lastTimeCheck = now;

        // Get current hour
        const currentHour = new Date().getHours();
        
        // Determine if flower should be open based on time
        const shouldBeOpen = this.shouldBeOpen(currentHour);
        
        // Update bloom state if needed
        if (shouldBeOpen && this.bloomState === 'closed') {
            this.open();
        } else if (!shouldBeOpen && this.bloomState === 'open') {
            this.close();
        }
    }
    
    shouldBeOpen(currentHour) {
        // Handle cases where open time spans across midnight
        if (this.openHour > this.closeHour) {
            // E.g., open at 18:00, close at 06:00
            return currentHour >= this.openHour || currentHour < this.closeHour;
        } else {
            // E.g., open at 06:00, close at 18:00
            return currentHour >= this.openHour && currentHour < this.closeHour;
        }
    }

    open() {
        // Only mature plants can bloom
        if (this.growthStage !== 'mature' || this.bloomState === 'opening') return;
        
        // Start opening animation
        this.bloomState = 'opening';
        this.playAnimation('opening', () => {
            this.bloomState = 'open';
            this.playAnimation('open');
            this.applyGlowEffect(true);
        });
    }

    close() {
        // Only proceed if in correct state
        if (this.growthStage !== 'mature' || this.bloomState === 'closing') return;
        
        // Start closing animation
        this.bloomState = 'closing';
        this.applyGlowEffect(false);
        this.playAnimation('closing', () => {
            this.bloomState = 'closed';
            this.playAnimation('closed');
        });
    }
    
    applyGlowEffect(isGlowing) {
        if (!this.element) return;
        
        if (isGlowing) {
            this.element.classList.add('glowing');
            
            // Apply glow intensity if configured
            const glowIntensity = this.getConfig('dayNightConfig.glowIntensity', 0.6);
            this.element.style.setProperty('--glow-intensity', glowIntensity);
        } else {
            this.element.classList.remove('glowing');
        }
    }

    update(deltaTime) {
        super.update(deltaTime);
        
        // Check day/night cycle for mature plants
        if (this.growthStage === 'mature') {
            this.updateDayNightState();
            
            // Apply moonlight growth boost if configured
            this.applyMoonlightBoost();
        }
    }
    
    applyMoonlightBoost() {
        // Apply moonlight boost during nighttime if configured
        if (this.bloomState === 'open' && this.getConfig('dayNightConfig.moonlightBoost')) {
            const boostFactor = this.getConfig('dayNightConfig.moonlightBoost', 1.2);
            
            // Apply boost to nearby plants if implemented
            if (this.parent?.mapArea) {
                const boostRadius = this.getConfig('dayNightConfig.moonlightBoostRadius', 100);
                const nearbyPlants = this.parent.mapArea.getObjectsInRadius(
                    this.posX, this.posY, boostRadius
                ).filter(obj => obj instanceof GrowingPlantMapObject);
                
                // Apply boosting effect to nearby plants
                nearbyPlants.forEach(plant => {
                    if (plant.growthTimeMultiplier) {
                        plant.growthTimeMultiplier *= boostFactor;
                    }
                });
            }
        }
    }
    
    render(container, parent) {
        const element = super.render(container, parent);
        
        // Add night bloom specific classes
        element.classList.add('night-bloom', this.bloomState);
        
        return element;
    }
}