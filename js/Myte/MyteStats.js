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
        this.fullChargeAnnounceCooldown = statConfig.fullChargeAnnounceCooldown ?? 30000;
        this.fullChargeResetThreshold = statConfig.fullChargeResetThreshold ?? 0.94;
        this.lastFullChargeAnnouncementAt = 0;
        this.hasAnnouncedFullCharge = this.energy >= this.maxEnergy;

        // Behavioral drives
        this.minBoredom = 0;
        this.maxBoredom = 100;
        this.boredom = Math.max(this.minBoredom, Math.min(this.maxBoredom, statConfig.boredom ?? 28));

        this.minComfort = 0;
        this.maxComfort = 100;
        this.comfort = Math.max(this.minComfort, Math.min(this.maxComfort, statConfig.comfort ?? 72));

        this.minConfidence = 0;
        this.maxConfidence = 100;
        this.confidence = Math.max(this.minConfidence, Math.min(this.maxConfidence, statConfig.confidence ?? 58));

        this.batteryLevel = -1;
        this.batteryVisible = false;
        this.batteryHideTimeout = null;
        this.chargingClassTimeout = null;
        this.batteryThresholds = [
            { name: 'empty',  threshold: 0 },
            { name: 'low',    threshold: 30 },
            { name: 'medium', threshold: 60 },
            { name: 'full',   threshold: 90 }
        ];

        this.isRapidCharging = false;
        this.rapidChargingThreshold = 0.01;
        this.exhaustionRecoveryThreshold = statConfig.exhaustionRecoveryThreshold ?? 12;
        this.isExhausted = false;
        this.lastEnergyChange = 0;
        this.lastBatterySound = null;
        this.soundCooldown = 8000;
        this.lastSoundTime = {};
        this.needSignalCooldown = statConfig.needSignalCooldown ?? 45000;
        this.lastNeedSignalTimes = {};
        this.behaviorDriveRate = statConfig.behaviorDriveRate ?? 0.42;
        this.noteBehaviorScale = statConfig.noteBehaviorScale ?? 0.55;
        this.moodSyncRate = statConfig.moodSyncRate ?? 0.00016;


        const traitConfig = statConfig.traits || {};
        this.traits = {
            neediness: this.resolveTraitValue(traitConfig.neediness),
            activity:  this.resolveTraitValue(traitConfig.activity),
            curiosity: this.resolveTraitValue(traitConfig.curiosity)
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

    resolveTraitValue(value) {
        if (Number.isFinite(value)) {
            return Utility.clamp(value, -100, 100);
        }

        return this.generateTraitValue();
    }

    // Mood management
    updateMood(amount) {
        this.mood = Math.max(this.minMood, Math.min(this.maxMood, this.mood + amount));
        this.handleMoodEffects();
    }

    updateBoredom(amount) {
        this.boredom = Math.max(this.minBoredom, Math.min(this.maxBoredom, this.boredom + amount));
    }

    updateComfort(amount) {
        this.comfort = Math.max(this.minComfort, Math.min(this.maxComfort, this.comfort + amount));
    }

    updateConfidence(amount) {
        this.confidence = Math.max(this.minConfidence, Math.min(this.maxConfidence, this.confidence + amount));
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

    getMoodRatio() {
        return this.mood / this.maxMood;
    }

    getEnergyRatio() {
        return this.energy / this.maxEnergy;
    }

    getHealthRatio() {
        return this.health / this.maxHealth;
    }

    getBoredomRatio() {
        return this.boredom / this.maxBoredom;
    }

    getComfortRatio() {
        return this.comfort / this.maxComfort;
    }

    getConfidenceRatio() {
        return this.confidence / this.maxConfidence;
    }

    getTrait(name) {
        return this.traits?.[name] ?? 0;
    }

    getTraitNormalized(name) {
        return (this.getTrait(name) + 100) / 200;
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

    restoreEnergy(amount) {
        const previousEnergy = this.energy;
        this.energy = Math.max(this.minEnergy, Math.min(this.maxEnergy, this.energy + amount));

        if (this.energy > this.exhaustionRecoveryThreshold) {
            this.clearExhaustionEffects();
        }

        const previousThresholdIndex = this.getThresholdIndex(previousEnergy);
        const currentThresholdIndex = this.getThresholdIndex(this.energy);

        if (previousThresholdIndex !== currentThresholdIndex) {
            this.updateBatteryDisplay();
        }

        this.maybeHandleEnergyFull(previousEnergy);

        return this.energy;
    }

    regenerateEnergy(delta) {
        const previousEnergy = this.energy;
        if (this.energy < this.maxEnergy) {
            // Store the energy change for rapid charging detection
            const energyBefore = this.energy;
            
            this.energy = Math.min(this.maxEnergy, this.energy + (this.energyRegenRate * delta));
            
            // Calculate energy change rate
            const energyChange = this.energy - energyBefore;
            this.lastEnergyChange = delta > 0 ? (energyChange / delta) : 0;
            
            // Detect rapid charging
            this.isRapidCharging = this.lastEnergyChange > this.rapidChargingThreshold;
            
            // If rapid charging detected, show visual feedback (formerly showBatteryRecharging)
            if (this.isRapidCharging && this.myte.battery) {
                this.myte.battery.classList.add('charging');
                this.showBattery();
                this.clearManagedTimeout(this.chargingClassTimeout, 'chargingClassTimeout');
            }

            if (this.energy > this.exhaustionRecoveryThreshold) {
                this.clearExhaustionEffects();
            }
    
            // If energy crosses a threshold, update the display
            const previousThresholdIndex = this.getThresholdIndex(previousEnergy);
            const currentThresholdIndex = this.getThresholdIndex(this.energy);
            
            if (previousThresholdIndex !== currentThresholdIndex) {
                this.updateBatteryDisplay();
            }
    
            // If energy just reached full, show full animation
            this.maybeHandleEnergyFull(previousEnergy);
        } else {
            // Not charging when full
            this.isRapidCharging = false;
        }
        
        // If no longer rapid charging, remove the class
        if (!this.isRapidCharging && this.myte.battery && this.myte.battery.classList.contains('charging')) {
            // Keep the animation for a moment before removing
            this.clearManagedTimeout(this.chargingClassTimeout, 'chargingClassTimeout');
            this.chargingClassTimeout = this.setManagedTimeout(() => {
                this.myte.battery.classList.remove('charging');
                this.chargingClassTimeout = null;
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
        const now = Date.now();
        if (this.hasAnnouncedFullCharge &&
            now - this.lastFullChargeAnnouncementAt < this.fullChargeAnnounceCooldown) {
            return;
        }

        this.hasAnnouncedFullCharge = true;
        this.lastFullChargeAnnouncementAt = now;

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
        this.updateMood(2);
    }

    maybeHandleEnergyFull(previousEnergy) {
        if (this.energy <= this.maxEnergy * this.fullChargeResetThreshold) {
            this.hasAnnouncedFullCharge = false;
        }

        if (previousEnergy < this.maxEnergy && this.energy >= this.maxEnergy) {
            this.onEnergyFull();
        }
    }

    // Apply effects when the myte is exhausted
    applyExhaustionEffects() {
        // Myte moves much slower when exhausted
        this.isExhausted = true;
        this.exhaustionSpeedMultiplier = 0.4;
    }

    clearExhaustionEffects() {
        if (!this.isExhausted) {
            return;
        }

        this.isExhausted = false;
        this.exhaustionSpeedMultiplier = 1.0;

        if (this.myte.battery && this.energy > 0) {
            this.myte.battery.classList.remove('critical-pulse');
        }
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
        this.clearManagedTimeout(this.batteryHideTimeout, 'batteryHideTimeout');
    
        const batteryStatus = this.batteryThresholds[this.batteryLevel].name;
    
        // Update blinking class based on battery level
        this.myte.battery.classList.remove('blinking');
        this.myte.battery.classList.remove('critical-pulse');
    
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

    clearManagedTimeout(timeoutId, propertyName = null) {
        if (!timeoutId) {
            if (propertyName) {
                this[propertyName] = null;
            }
            return;
        }

        clearTimeout(timeoutId);
        this.pendingTimeouts.delete(timeoutId);

        if (propertyName) {
            this[propertyName] = null;
        }
    }

    getCurrentActionId() {
        return this.myte.queue.getCurrentAction()?.constructor?.metadata?.id ?? null;
    }

    noteBehavior({
        category = 'idle',
        novelty = 0.4,
        soothing = 0,
        social = 0,
        accomplishment = 0,
        exertion = 0
    } = {}) {
        const normalizedNovelty = Utility.clamp(novelty, 0, 1);
        const normalizedSoothing = Utility.clamp(soothing, 0, 1);
        const normalizedSocial = Utility.clamp(social, 0, 1);
        const normalizedAccomplishment = Utility.clamp(accomplishment, 0, 1);
        const normalizedExertion = Utility.clamp(exertion, 0, 1);

        let boredomDelta = -((normalizedNovelty * 10) + (normalizedSocial * 6) + (normalizedAccomplishment * 5));
        let comfortDelta = (normalizedSoothing * 8) + (category === 'rest' ? 10 : 0) - (normalizedExertion * 3);
        let confidenceDelta = (normalizedAccomplishment * 7) + (normalizedSocial * 4) + (normalizedNovelty * 3);

        if (category === 'play') {
            boredomDelta -= 8;
            confidenceDelta += 2;
        } else if (category === 'social') {
            boredomDelta -= 4;
            comfortDelta += 2;
        } else if (category === 'idle') {
            boredomDelta += 3;
            confidenceDelta -= 1;
        }

        this.updateBoredom(boredomDelta * this.noteBehaviorScale);
        this.updateComfort(comfortDelta * this.noteBehaviorScale);
        this.updateConfidence(confidenceDelta * this.noteBehaviorScale);
    }

    updateBehaviorDrives(deltaTime) {
        const actionId = this.getCurrentActionId();
        const home = this.myte.getHomePosition?.();
        const distanceFromHome = home
            ? this.myte.getDistanceToPoint(home.x, home.y)
            : 0;
        const comfortRadius = this.myte.ai?.homeComfortRadius ?? 140;
        const homeComfort = home
            ? Utility.clamp(1 - (distanceFromHome / Math.max(comfortRadius * 2, 1)), 0, 1)
            : 0.5;

        const isIdle = !actionId || actionId === 'idle';
        const isResting = actionId === 'sleep' || actionId === 'simple_sleep' || actionId === 'rest_on_bed';
        const isStimulating = [
            'inspect',
            'deep_inspect',
            'smell_flower',
            'drink_fountain',
            'water_plant',
            'harvest',
            'interact_object',
            'open_chest',
            'eat_element'
        ].includes(actionId);
        const isPlayful = [
            'run_laps',
            'circle',
            'zigzag',
            'jump',
            'dance',
            'play_tag',
            'play_fetch',
            'nudge_ball'
        ].includes(actionId);
        const isSocial = [
            'show_affection',
            'greet',
            'greet_receive',
            'watch',
            'play_tag'
        ].includes(actionId);
        const isPurposefulMovement = [
            'go_to_object',
            'astar-move',
            'move',
            'follow_object'
        ].includes(actionId);
        const rateScale = this.behaviorDriveRate;

        let boredomDelta = 0;
        if (isResting) {
            boredomDelta -= 0.0022 * deltaTime * rateScale;
        } else if (isStimulating || isPlayful || isSocial) {
            boredomDelta -= 0.0034 * deltaTime * rateScale;
        } else if (isPurposefulMovement) {
            boredomDelta -= 0.0006 * deltaTime * rateScale;
        } else if (isIdle) {
            boredomDelta += 0.0042 * deltaTime * rateScale;
        } else {
            boredomDelta += 0.0008 * deltaTime * rateScale;
        }

        if (this.myte.isMoving() && !isPlayful && !isStimulating && !isSocial) {
            boredomDelta -= 0.0002 * deltaTime * rateScale;
        }

        this.updateBoredom(boredomDelta);

        const comfortTarget = (
            (this.getMoodRatio() * 0.35) +
            (this.getEnergyRatio() * 0.22) +
            (this.getHealthRatio() * 0.13) +
            (homeComfort * 0.3)
        ) * this.maxComfort;
        const comfortBlend = (comfortTarget - this.comfort) * 0.0016 * deltaTime * rateScale;
        this.updateComfort(comfortBlend);

        if (isResting) {
            this.updateComfort(0.0025 * deltaTime * rateScale);
        } else if (distanceFromHome > (comfortRadius * 1.8) && this.energy < 40) {
            this.updateComfort(-0.0018 * deltaTime * rateScale);
        }

        const confidenceTarget = (
            ((this.getMoodRatio() + this.getEnergyRatio() + this.getHealthRatio()) / 3) * 0.72 +
            (homeComfort * 0.28)
        ) * this.maxConfidence;
        const confidenceBlend = (confidenceTarget - this.confidence) * 0.0013 * deltaTime * rateScale;
        this.updateConfidence(confidenceBlend);

        if (isSocial || isPlayful) {
            this.updateConfidence(0.001 * deltaTime * rateScale);
        } else if (this.mood < 25 || this.energy < 18) {
            this.updateConfidence(-0.0011 * deltaTime * rateScale);
        }

        const moodTarget = (
            ((1 - this.getBoredomRatio()) * 0.34) +
            (this.getComfortRatio() * 0.26) +
            (this.getEnergyRatio() * 0.22) +
            (this.getConfidenceRatio() * 0.18)
        ) * this.maxMood;
        const moodBlend = (moodTarget - this.mood) * this.moodSyncRate * deltaTime;
        this.updateMood(moodBlend);
    }

    maybeSignalNeeds() {
        const dialogue = this.myte.dialogue;
        if (!dialogue || !this.myte.queue.isEmpty() || this.myte.isDragging) {
            return;
        }

        const lastAiDecisionAge = Date.now() - (this.myte.ai?.lastDecisionTime ?? 0);
        const isBoredEnoughToComplain =
            this.boredom >= 92 &&
            this.mood <= 68 &&
            lastAiDecisionAge >= 20000;

        const signals = [
            {
                id: 'energy_low',
                condition: this.energy <= 14,
                text: 'sleepy...',
                style: 'thought',
                expression: 'sleep'
            },
            {
                id: 'boredom_high',
                condition: isBoredEnoughToComplain,
                text: 'bored...',
                style: 'thought',
                expression: 'surprise'
            },
            {
                id: 'comfort_low',
                condition: this.comfort <= 24,
                text: 'cozy?',
                style: 'thought',
                expression: 'peek'
            },
            {
                id: 'mood_low',
                condition: this.mood <= 20,
                text: 'sad...',
                style: 'whisper',
                expression: 'peek'
            }
        ];

        const now = Date.now();
        const signal = signals.find(entry => {
            if (!entry.condition) {
                return false;
            }

            const lastTime = this.lastNeedSignalTimes[entry.id] ?? 0;
            return now - lastTime >= this.needSignalCooldown;
        });

        if (!signal) {
            return;
        }

        this.lastNeedSignalTimes[signal.id] = now;
        dialogue.showMessage(signal.text, signal.style);
        if (signal.expression) {
            this.myte.queue.addExpression(signal.expression, 45, 1);
        }
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

        this.updateBehaviorDrives(deltaTime);
        this.maybeSignalNeeds();

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
            drives: {
                boredom: this.boredom,
                comfort: this.comfort,
                confidence: this.confidence
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

        this.clearManagedTimeout(this.batteryHideTimeout, 'batteryHideTimeout');
        this.clearManagedTimeout(this.chargingClassTimeout, 'chargingClassTimeout');

        this.pendingTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
        this.pendingTimeouts.clear();
    }
}
