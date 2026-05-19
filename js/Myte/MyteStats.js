class MyteStats {
    constructor(myte) {
        this.myte = myte;
        const statConfig = myte.definition?.stats || {};
        const movementConfig = myte.definition?.movement || {};
        this.pendingTimeouts = new Set();

        // Basic stats
        this.minHealth = 0;
        this.maxHealth = 100;
        this.health = Math.max(this.minHealth, Math.min(this.maxHealth, statConfig.health ?? 100));
        this.speed = statConfig.speed ?? movementConfig.baseSpeed ?? 1;
        this.level = 1;
        this.experience = 0;

        // Mood system
        this.minMood = 0;
        this.maxMood = 100;
        this.mood = Math.max(this.minMood, Math.min(this.maxMood, statConfig.mood ?? 100));
        this.moodDecayRate = statConfig.moodDecayRate ?? 0.0005;
        this.currentMood = 'neutral';
        this.moodTimeout = null;

        // Energy system
        this.minEnergy = 0;
        this.maxEnergy = 100;
        this.energy = Math.max(this.minEnergy, Math.min(this.maxEnergy, statConfig.energy ?? 75));
        this.energyDecayRate = statConfig.energyDecayRate ?? 0.0005;
        this.energyRegenRate = statConfig.energyRegenRate ?? 0.005;

        this.batteryLevel = -1;
        this.batteryVisible = false;
        this.batteryHideTimeout = null;
        this.batteryThresholds = [
            { name: 'empty',  threshold: 0 },
            { name: 'low',    threshold: 30 },
            { name: 'medium', threshold: 60 },
            { name: 'full',   threshold: 90 }
        ];

        this.isRapidCharging = false;
        this.rapidChargingThreshold = 0.01;
        this.lastEnergyChange = 0;
        this.lastBatterySound = null;
        this.soundCooldown = 8000;
        this.lastSoundTime = {};


        this.traits = {
            neediness: this.generateTraitValue(),
            activity:  this.generateTraitValue(),
            curiosity: this.generateTraitValue()
        };

        this.lastInteractionTime = 0;
        this.interactionCooldown = 5000;

        this.moods = statConfig.moods ?? {
            happy:   { duration: 10000, speedMultiplier: 1.2, expression: 'happy' },
            sad:     { duration: 15000, speedMultiplier: 0.8, expression: 'sad' },
            excited: { duration: 8000,  speedMultiplier: 1.5, expression: 'excited' },
            sleepy:  { duration: 12000, speedMultiplier: 0.7, expression: 'sleepy' },
            grumpy:  { duration: 10000, speedMultiplier: 0.9, expression: 'grumpy' },
            neutral: { duration: 5000,  speedMultiplier: 1.0, expression: 'neutral' }
        };

        // Initialize battery display
        this.updateBatteryDisplay();

    }

    updateHealth(amount){
        this.health = Math.max(this.minHealth, Math.min(this.maxHealth, this.health + amount));
    }

    // Health management
    applyDamage(amount) {
        this.health = Math.max(this.minHealth, this.health - amount);
        if (this.health <= this.minHealth) {
            this.myte.queue.addExpression('faint');
        }
    }

    heal(amount) {
        this.health = Math.min(this.maxHealth, this.health + amount);
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

        // Set timeout to return to neutral
        this.moodTimeout = this.setManagedTimeout(() => {
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


    getSpeed() {
        let speedMultiplier = this.moods[this.currentMood].speedMultiplier;

        // Energy affects speed
        if (this.energy < 20) speedMultiplier *= 0.7;

        // Exhaustion effect
        if (this.exhaustionSpeedMultiplier) {
            speedMultiplier *= this.exhaustionSpeedMultiplier;
        }

        // Activity trait affects speed
        speedMultiplier *= (1 + (this.traits.activity / 200)); // -100 to 100 becomes 0.5 to 1.5

        return this.speed * speedMultiplier;
    }

    // Interaction timing
    canInteract() {
        return Date.now() - this.lastInteractionTime >= this.interactionCooldown;
    }

    startInteraction() {
        this.lastInteractionTime = Date.now();
    }

    useEnergy(amount) {
        const previousEnergy = this.energy;
        this.energy = Math.max(this.minEnergy, Math.min(this.maxEnergy, this.energy - amount));
    
        // If energy just hit zero, show effects
        if (previousEnergy > 0 && this.energy <= 0) {
            this.onEnergyDepleted();
        }
    
        // If energy crosses a threshold, update the display
        const previousThresholdIndex = this.getThresholdIndex(previousEnergy);
        const currentThresholdIndex = this.getThresholdIndex(this.energy);
    
        if (previousThresholdIndex !== currentThresholdIndex) {
            this.updateBatteryDisplay();
        }

        return this.energy > 0;
    }

    regenerateEnergy(delta) {
        const previousEnergy = this.energy;
        if (this.energy < this.maxEnergy) {
            // Store the energy change for rapid charging detection
            const energyBefore = this.energy;
            
            this.energy = Math.min(this.maxEnergy, this.energy + (this.energyRegenRate * delta));
            
            // Calculate energy change rate
            const energyChange = this.energy - energyBefore;
            this.lastEnergyChange = energyChange / delta;
            
            // Detect rapid charging
            this.isRapidCharging = this.lastEnergyChange > (this.rapidChargingThreshold * delta);
            
            // If rapid charging detected, show visual feedback (formerly showBatteryRecharging)
            if (this.isRapidCharging && this.myte.battery) {
                this.myte.battery.classList.add('charging');
                this.showBattery();
            }
    
            // If energy crosses a threshold, update the display
            const previousThresholdIndex = this.getThresholdIndex(previousEnergy);
            const currentThresholdIndex = this.getThresholdIndex(this.energy);
            
            if (previousThresholdIndex !== currentThresholdIndex) {
                this.updateBatteryDisplay();
            }
    
            // If energy just reached full, show full animation
            if (previousEnergy < this.maxEnergy && this.energy >= this.maxEnergy) {
                this.onEnergyFull();
            }
        } else {
            // Not charging when full
            this.isRapidCharging = false;
        }
        
        // If no longer rapid charging, remove the class
        if (!this.isRapidCharging && this.myte.battery && this.myte.battery.classList.contains('charging')) {
            // Keep the animation for a moment before removing
            this.setManagedTimeout(() => {
                this.myte.battery.classList.remove('charging');
                // Recheck visibility rules after animation ends
                this.handleBatteryVisibility();
            }, 2000);
        }
    }

    // Handle when energy is completely depleted
    onEnergyDepleted() {
        // Show empty battery with critical pulse
        if (this.myte.battery) {
            this.myte.battery.classList.add('critical-pulse');
            this.showBattery();
        }
    
        // Play empty battery sound
        this.playBatterySound(0); // 0 is the empty threshold index
    
        // Slow down the myte
        this.applyExhaustionEffects();

    }

    // Handle when energy is filled to maximum
    onEnergyFull() {
        // Show full battery with charging effect
        if (this.myte.battery) {
            this.myte.battery.classList.add('charging');
            this.myte.battery.classList.remove('critical-pulse');
            this.showBattery();
            
            // Play full battery sound
            this.playBatterySound(this.batteryThresholds.length - 1); // Full threshold index
    
            // Remove charging effect after a moment
            this.setManagedTimeout(() => {
                this.myte.battery.classList.remove('charging');
                this.hideBattery();
            }, 2000);
        }
    
        // Improve mood slightly when fully recharged
        this.updateMood(5);
    }

    // Apply effects when the myte is exhausted
    applyExhaustionEffects() {
        // Myte moves much slower when exhausted
        this.exhaustionSpeedMultiplier = 0.4;

        // Schedule recovery
        this.setManagedTimeout(() => {
            this.exhaustionSpeedMultiplier = 1.0;
            if (this.myte.battery) {
                this.myte.battery.classList.remove('critical-pulse');
            }
        }, 10000); // Effects last for 10 seconds
    }

    // Battery Display Methods
    getThresholdIndex(energyValue) {
        const energyPercentage = (energyValue / this.maxEnergy) * 100;
    
        if (energyValue === 0) return 0; // Empty (index 0) only at exactly 0
    
        for (let i = this.batteryThresholds.length - 1; i > 0; i--) {
            if (energyPercentage >= this.batteryThresholds[i].threshold) {
                return i;
            }
        }
    
        return 1; // If not matched, default to 'low'
    }

    // Update battery display based on current energy
    updateBatteryDisplay() {
        if (!this.myte.battery) return;
    
        // Calculate what battery level should be shown
        const currentThresholdIndex = this.getThresholdIndex(this.energy);
        const batteryStatus = this.batteryThresholds[currentThresholdIndex].name;
    
        // Only update if the level has changed
        if (currentThresholdIndex !== this.batteryLevel) {
            // Play appropriate sound once
            this.playBatterySound(currentThresholdIndex);
            
            this.batteryLevel = currentThresholdIndex;
    
            // Remove all battery level classes
            this.batteryThresholds.forEach(threshold => {
                this.myte.battery.classList.remove(threshold.name);
            });
    
            // Add current level class
            this.myte.battery.classList.add(batteryStatus);
    
            // Update data attribute for position
            this.myte.battery.setAttribute('data-level', currentThresholdIndex);
    
            // Show battery element
            this.showBattery();
    
            // Handle visibility logic based on battery level
            this.handleBatteryVisibility();
        }
        
        // If rapid charging is active, add visual indication
        if (this.isRapidCharging) {
            this.myte.battery.classList.add('rapid-charging');
        } else {
            this.myte.battery.classList.remove('rapid-charging');
        }
    }

    playBatterySound(currentThresholdIndex) {
        const now = Date.now();
        let soundToPlay = null;
        
        // Determine which sound to play
        if (this.energy <= 0) {
            soundToPlay = 'battery_empty';
        } else if (this.energy >= this.maxEnergy) {
            soundToPlay = 'battery_full';
        } else if (this.batteryLevel >= 0 && currentThresholdIndex < this.batteryLevel) {
            soundToPlay = 'battery_depleting';
        } else if (this.batteryLevel >= 0 && currentThresholdIndex > this.batteryLevel) {
            soundToPlay = 'battery_charging';
        }
        
        // Only play if we have a sound and it's not on cooldown
        if (soundToPlay) {
            const lastPlayed = this.lastSoundTime[soundToPlay] || 0;
            if (now - lastPlayed > this.soundCooldown) {
                this.myte.playSound(soundToPlay);
                this.lastSoundTime[soundToPlay] = now;
                this.lastBatterySound = soundToPlay;
            }
        }
    }

    // Show the battery icon
    showBattery() {
        if (!this.myte.battery) return;
        this.batteryVisible = true;
        this.myte.battery.classList.add('visible');
    }

    // Hide the battery icon
    hideBattery() {
        if (!this.myte.battery) return;
        this.batteryVisible = false;
        this.myte.battery.classList.remove('visible');
    }

    // Handle battery visibility based on energy level
    handleBatteryVisibility() {
        // Clear any existing hide timeout
        if (this.batteryHideTimeout) {
            clearTimeout(this.batteryHideTimeout);
            this.batteryHideTimeout = null;
        }
    
        const batteryStatus = this.batteryThresholds[this.batteryLevel].name;
    
        // Update blinking class based on battery level
        this.myte.battery.classList.remove('blinking');
    
        // Energy is depleted or low - show and possibly blink
        if (batteryStatus === 'empty') {
            this.showBattery();
            this.myte.battery.classList.add('critical-pulse');
        }
        else if (batteryStatus === 'low') {
            this.showBattery();
            this.myte.battery.classList.add('blinking');
    
            // Hide after 5 seconds
            this.batteryHideTimeout = this.setManagedTimeout(() => {
                this.myte.battery.classList.remove('blinking');
                this.batteryHideTimeout = null;
            }, 5000);
        }
        // Medium energy - show continuously
        else if (batteryStatus === 'medium') {
            this.showBattery();
    
            // Hide after 6 seconds
            this.batteryHideTimeout = this.setManagedTimeout(() => {
                this.hideBattery();
                this.batteryHideTimeout = null;
            }, 6000);
        }
        // Full energy - show temporarily then hide
        else if (batteryStatus === 'full') {
            this.showBattery();
    
            // Hide after 3 seconds
            this.batteryHideTimeout = this.setManagedTimeout(() => {
                this.hideBattery();
                this.batteryHideTimeout = null;
            }, 3000);
        }
    }

    setManagedTimeout(callback, delay) {
        const timeoutId = setTimeout(() => {
            this.pendingTimeouts.delete(timeoutId);
            callback();
        }, delay);

        this.pendingTimeouts.add(timeoutId);
        return timeoutId;
    }

    // Update function called each frame
    update(deltaTime) {
        // Natural mood decay
        this.updateMood(-this.moodDecayRate * deltaTime);

        if (this.myte.isMoving()) {
            // Energy decay
            this.useEnergy(this.energyDecayRate * deltaTime);
        } else {
            // Energy regeneration
            this.regenerateEnergy(deltaTime);
        }

        // Update battery display
        this.updateBatteryDisplay();
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

    destroy() {
        if (this.moodTimeout) {
            clearTimeout(this.moodTimeout);
            this.moodTimeout = null;
        }

        if (this.batteryHideTimeout) {
            clearTimeout(this.batteryHideTimeout);
            this.batteryHideTimeout = null;
        }

        this.pendingTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
        this.pendingTimeouts.clear();
    }
}
