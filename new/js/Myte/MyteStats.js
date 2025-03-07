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
        this.energy = 75;
        this.minEnergy = 0;
        this.maxEnergy = 100;
        this.energyDecayRate = 0.001;
        this.energyRegenRate = 0.005;

        // Battery display properties
        this.batteryLevel = -1; // -1 so we show the battery at the start
        this.batteryVisible = false; // Whether battery is currently displayed
        this.batteryHideTimeout = null; // Timeout for hiding full battery

        // Define battery thresholds with names and percentages
        this.batteryThresholds = [
            { name: 'empty', threshold: 0 },
            { name: 'low', threshold: 1 },
            { name: 'medium', threshold: 34 },
            { name: 'full', threshold: 67 } // minimal threshold
        ];

        // Initialize battery display
        this.updateBatteryDisplay();

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

    // Energy & Battery Management

    // Show a recharging animation when energy is rapidly increasing
    showBatteryRecharging() {
        if (!this.myte.battery) return;

        // Add charging class to show the animation
        this.myte.battery.classList.add('charging');

        // Show the battery regardless of level
        this.showBattery();

        // Remove the charging class after 3 seconds
        setTimeout(() => {
            this.myte.battery.classList.remove('charging');
            // Recheck visibility rules
            this.handleBatteryVisibility();
        }, 3000);
    }

    // Add visual feedback when energy is critically low
    showCriticalEnergyWarning() {
        // Add expressions and dialogue to warn about low energy
        if (this.energy < 10 && Math.random() < 0.1) {
            // Maybe show dialogue
            if (Math.random() < 0.3) {

                /*
                const messages = [
                    "Tired...",
                    "Need rest...",
                    "Low energy...",
                    "*yawn*"
                ];
                const randomMessage = messages[Math.floor(Math.random() * messages.length)];
                if (this.myte.dialogue) {
                    this.myte.dialogue.showMessage(randomMessage, 2000);
                }
                    */
            }
        }
    }

    useEnergy(amount) {
        const previousEnergy = this.energy;
        this.energy = Math.max(0, this.energy - amount);

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

        // Check for critical energy warning
        if (this.energy < 15) {
            this.showCriticalEnergyWarning();
        }

        return this.energy > 0;
    }

regenerateEnergy(delta) {
    const previousEnergy = this.energy;
    if (this.energy < this.maxEnergy) {
        this.energy = Math.min(this.maxEnergy, this.energy + (this.energyRegenRate * delta));

        // If energy crosses a threshold, update the display
        const previousThresholdIndex = this.getThresholdIndex(previousEnergy);
        const currentThresholdIndex = this.getThresholdIndex(this.energy);
        
        if (currentThresholdIndex > previousThresholdIndex) {
            // Battery level improved to a higher threshold - show charging animation
            if (this.myte.battery) {
                this.myte.battery.classList.add('charging');
                this.showBattery();
                
                // Remove the charging class after 2 seconds
                setTimeout(() => {
                    this.myte.battery.classList.remove('charging');
                    // Recheck visibility rules after animation ends
                    this.handleBatteryVisibility();
                }, 2000);
            }
            
            this.updateBatteryDisplay();
        } else if (previousThresholdIndex !== currentThresholdIndex) {
            // Other threshold changes
            this.updateBatteryDisplay();
        }

        // If energy just reached full, show full animation
        if (previousEnergy < this.maxEnergy && this.energy >= this.maxEnergy) {
            this.onEnergyFull();
        }
    }
}

    // Handle when energy is completely depleted
    onEnergyDepleted() {
        // Show empty battery with critical pulse
        if (this.myte.battery) {
            this.myte.battery.classList.add('critical-pulse');
            this.showBattery();
        }

        // Slow down the myte
        this.applyExhaustionEffects();

        // Show tired expression
        this.myte.queue.addExpression('tired');

        // Show dialogue
        /*
        if (this.myte.dialogue) {
            this.myte.dialogue.showMessage("Exhausted...", 3000);
        }
        */
    }

    // Handle when energy is filled to maximum
    onEnergyFull() {
        // Show full battery with charging effect
        if (this.myte.battery) {
            this.myte.battery.classList.add('charging');
            this.myte.battery.classList.remove('critical-pulse');
            this.showBattery();

            // Remove charging effect after a moment
            setTimeout(() => {
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
        setTimeout(() => {
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

            // Hide after 3 seconds
            this.batteryHideTimeout = setTimeout(() => {
                this.myte.battery.classList.remove('blinking');
                this.batteryHideTimeout = null;
            }, 5000);

        }
        // Medium energy - show continuously
        else if (batteryStatus === 'medium') {
            this.showBattery();

            // Hide after 6 seconds
            this.batteryHideTimeout = setTimeout(() => {
                this.hideBattery();
                this.batteryHideTimeout = null;
            }, 6000);

        }
        // Full energy - show temporarily then hide
        else if (batteryStatus === 'full') {
            this.showBattery();

            // Hide after 3 seconds
            this.batteryHideTimeout = setTimeout(() => {
                this.hideBattery();
                this.batteryHideTimeout = null;
            }, 3000);
        }
    }

    // Update function called each frame
    update(deltaTime) {
        // Natural mood decay
        this.updateMood(-this.moodDecayRate * deltaTime);

        if (this.myte.is_moving()) {
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
}