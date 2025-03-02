class MyteStats {
    constructor(myte) {
        this.myte = myte;

        // Basic stats
        this.health = 100;
        this.speed = 1;
        this.level = 1;
        this.experience = 0;

        // Mood system
        this.mood = 100;
        this.minMood = 0;
        this.maxMood = 100;
        this.moodDecayRate = 0.0005;
        this.currentMood = 'neutral';
        this.moodTimeout = null;

        // Energy system
        this.energy = 100;
        this.minEnergy = 0;
        this.maxEnergy = 100;
        this.energyDecayRate = 0.002;
        this.energyRegenRate = 0.001;

        // Personality traits (-100 to 100)
        this.traits = {
            neediness: this.generateTraitValue(),    // How much attention they want
            activity: this.generateTraitValue(),     // How energetic they are
            curiosity: this.generateTraitValue()     // How interested in new things
        };

        // Interaction cooldowns
        this.lastInteractionTime = 0;
        this.interactionCooldown = 5000;

        // Define possible moods and their effects
        this.moods = {
            happy: {
                duration: 10000,
                speedMultiplier: 1.2,
                expression: 'happy'
            },
            sad: {
                duration: 15000,
                speedMultiplier: 0.8,
                expression: 'sad'
            },
            excited: {
                duration: 8000,
                speedMultiplier: 1.5,
                expression: 'excited'
            },
            sleepy: {
                duration: 12000,
                speedMultiplier: 0.7,
                expression: 'sleepy'
            },
            grumpy: {
                duration: 10000,
                speedMultiplier: 0.9,
                expression: 'grumpy'
            },
            neutral: {
                duration: 5000,
                speedMultiplier: 1,
                expression: 'neutral'
            }
        };
    }

    // Generate random trait value between -100 and 100
    generateTraitValue() {
        return Math.floor(Math.random() * 201) - 100;
    }

    // Mood management
    updateMood(amount) {
        this.mood = Math.max(this.minMood, Math.min(this.maxMood, this.mood + amount));
        this.handleMoodEffects();
    }

    handleMoodEffects() {
        if (this.mood <= 20) {
            if (Math.random() < 0.1) {
                this.setMood('sad');
            }
        } else if (this.mood >= 80) {
            if (Math.random() < 0.1) {
                this.setMood('happy');
            }
        }
    }

    setMood(mood) {
        if (!this.moods[mood]) return;

        // Clear any existing mood timeout
        if (this.moodTimeout) {
            clearTimeout(this.moodTimeout);
        }

        this.currentMood = mood;
        
        // Apply mood effects
        if (this.moods[mood].expression) {
            // this.myte.queue.addExpression(this.moods[mood].expression);
        }

        // Set timeout to return to neutral
        this.moodTimeout = setTimeout(() => {
            this.currentMood = 'neutral';
        }, this.moods[mood].duration);
    }

    getMoodStatus() {
        if (this.mood >= 80) return 'very happy';
        if (this.mood >= 60) return 'happy';
        if (this.mood >= 40) return 'neutral';
        if (this.mood >= 20) return 'unhappy';
        return 'very unhappy';
    }

    // Health management
    applyDamage(amount) {
        this.health = Math.max(0, this.health - amount);
        if (this.health <= 0) {
            this.myte.queue.addExpression('faint');
        }
    }

    heal(amount) {
        this.health = Math.min(100, this.health + amount);
    }

    // Energy management
    useEnergy(amount) {
        this.energy = Math.max(0, this.energy - amount);
        return this.energy > 0;
    }

    regenerateEnergy(delta) {
        if (this.energy < this.maxEnergy) {
            this.energy = Math.min(this.maxEnergy, this.energy + (this.energyRegenRate * delta));
        }
    }
    // Speed management
    getSpeed() {
        let speedMultiplier = this.moods[this.currentMood].speedMultiplier;

        // Energy affects speed
        if (this.energy < 20) speedMultiplier *= 0.7;

        // Activity trait affects speed
        speedMultiplier *= (1 + (this.traits.activity / 200)); // -100 to 100 becomes 0.5 to 1.5

        return this.speed * speedMultiplier;
    }

    // Experience and leveling
    addExperience(amount) {
        this.experience += amount;
        this.checkLevelUp();
    }

    checkLevelUp() {
        const experienceNeeded = this.level * 100;
        if (this.experience >= experienceNeeded) {
            this.level++;
            this.experience -= experienceNeeded;
            this.onLevelUp();
        }
    }

    onLevelUp() {
        // Increase stats on level up
        this.maxEnergy += 10;
        this.energy = this.maxEnergy;
        this.speed *= 1.1;
    }

    // Interaction timing
    canInteract() {
        return Date.now() - this.lastInteractionTime >= this.interactionCooldown;
    }

    startInteraction() {
        this.lastInteractionTime = Date.now();
    }

    // Update function called each frame
    update(deltaTime) {
        // Natural mood decay
        this.updateMood(-this.moodDecayRate * deltaTime);

		if(this.myte.is_moving){
			// Energy decay
			this.useEnergy(this.energyDecayRate * deltaTime);
		}else{
			// Energy regeneration
			this.regenerateEnergy(deltaTime);
		}

    }

    // Get personality description
    getPersonalityDescription() {
        let description = [];
        
        if (Math.abs(this.traits.neediness) > 50) {
            description.push(this.traits.neediness > 0 ? "Very needy" : "Very independent");
        }
        if (Math.abs(this.traits.activity) > 50) {
            description.push(this.traits.activity > 0 ? "Energetic" : "Lazy");
        }
        if (Math.abs(this.traits.curiosity) > 50) {
            description.push(this.traits.curiosity > 0 ? "Curious" : "Cautious");
        }

        return description.join(", ") || "Balanced personality";
    }

    // Get full status for UI/debugging
    getStatus() {
        return {
            health: this.health,
            mood: {
                value: this.mood,
                status: this.getMoodStatus(),
                currentMood: this.currentMood
            },
            energy: {
                current: this.energy,
                max: this.maxEnergy
            },
            level: this.level,
            experience: this.experience,
            speed: this.getSpeed(),
            personality: {
                description: this.getPersonalityDescription(),
                traits: this.traits
            }
        };
    }
}