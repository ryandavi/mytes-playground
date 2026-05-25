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
        this.moodDecayRate = statConfig.moodDecayRate ?? SiteConfig.stats.moodDecayRate;
        this.currentMood = 'neutral';
        this.moodTimeout = null;

        // Energy system
        this.minEnergy = 0;
        this.maxEnergy = 100;
        this.energy = Math.max(this.minEnergy, Math.min(this.maxEnergy, statConfig.energy ?? SiteConfig.myte.initialStats.energy));
        this.energyDecayRate = statConfig.energyDecayRate ?? SiteConfig.stats.energyDecayRate;
        this.energyRegenRate = statConfig.energyRegenRate ?? SiteConfig.stats.energyRegenRate;
        // Rate used while actively resting on a bed/couch (per ms); multiplied by the object's restEnergyRegenMultiplier
        this.bedRestEnergyRegenRate = statConfig.bedRestEnergyRegenRate ?? SiteConfig.stats.bedRestEnergyRegenRate;
        // Rate used while parked in home slot (per ms)
        this.homeSlotEnergyRegenRate = statConfig.homeSlotEnergyRegenRate ?? SiteConfig.stats.homeSlotEnergyRegenRate;
        this.homeSlotMoodDecayMultiplier = statConfig.homeSlotMoodDecayMultiplier ?? SiteConfig.stats.homeSlotMoodDecayMultiplier;
        this.homeSlotBehaviorRateMultiplier = statConfig.homeSlotBehaviorRateMultiplier ?? SiteConfig.stats.homeSlotBehaviorRateMultiplier;
        this.homeSlotComfortBoostRate = statConfig.homeSlotComfortBoostRate ?? SiteConfig.stats.homeSlotComfortBoostRate;
        this.homeSlotConfidenceBoostRate = statConfig.homeSlotConfidenceBoostRate ?? SiteConfig.stats.homeSlotConfidenceBoostRate;
        this.fullChargeAnnounceCooldown = statConfig.fullChargeAnnounceCooldown ?? SiteConfig.stats.fullChargeAnnounceCooldown;
        this.fullChargeResetThreshold = statConfig.fullChargeResetThreshold ?? SiteConfig.stats.fullChargeResetThreshold;
        this.lastFullChargeAnnouncementAt = 0;
        this.hasAnnouncedFullCharge = this.energy >= this.maxEnergy;

        // Behavioral drives
        this.minBoredom = 0;
        this.maxBoredom = 100;
        this.boredom = Math.max(this.minBoredom, Math.min(this.maxBoredom, statConfig.boredom ?? SiteConfig.myte.initialStats.boredom));

        this.minComfort = 0;
        this.maxComfort = 100;
        this.comfort = Math.max(this.minComfort, Math.min(this.maxComfort, statConfig.comfort ?? SiteConfig.myte.initialStats.comfort));

        this.minConfidence = 0;
        this.maxConfidence = 100;
        this.confidence = Math.max(this.minConfidence, Math.min(this.maxConfidence, statConfig.confidence ?? SiteConfig.myte.initialStats.confidence));

        this.batteryLevel = -1;
        this._slotBatteryLevel = -1;
        this.batteryVisible = false;
        this.batteryHideTimeout = null;
        this.chargingClassTimeout = null;
        this.batteryThresholds = SiteConfig.myte.thresholds.batteryLevels.map(t => ({ ...t }));

        this.isRapidCharging = false;
        this._lastRapidCharging = false;
        this.rapidChargingThreshold = SiteConfig.myte.thresholds.rapidCharging;
        this.exhaustionRecoveryThreshold = statConfig.exhaustionRecoveryThreshold ?? SiteConfig.stats.exhaustionRecoveryThreshold;
        this.isExhausted = false;
        this.lastEnergyChange = 0;
        this.lastBatterySound = null;
        this.soundCooldown = SiteConfig.myte.cooldowns.sound;
        this.lastSoundTime = {};
        this.needSignalCooldown = statConfig.needSignalCooldown ?? SiteConfig.stats.needSignalCooldown;
        this.lastNeedSignalTimes = {};
        this.behaviorDriveRate = statConfig.behaviorDriveRate ?? SiteConfig.stats.behaviorDriveRate;
        this.noteBehaviorScale = statConfig.noteBehaviorScale ?? 0.55;
        this.moodSyncRate = statConfig.moodSyncRate ?? 0.00016;


        const traitConfig = statConfig.traits || {};
        this.traits = {
            neediness: this.resolveTraitValue(traitConfig.neediness),
            activity:  this.resolveTraitValue(traitConfig.activity),
            curiosity: this.resolveTraitValue(traitConfig.curiosity)
        };

        this.lastInteractionTime = 0;
        this.interactionCooldown = SiteConfig.myte.cooldowns.interaction;

        this.moods = statConfig.moods ?? SiteConfig.myte.moods;

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

    getEffectAmount(effectSource, keys = []) {
        if (!effectSource || typeof effectSource !== 'object') {
            return 0;
        }

        for (const key of keys) {
            const value = effectSource[key];
            if (Number.isFinite(value)) {
                return value;
            }
        }

        return 0;
    }

    normalizeStatEffects(effectSource = {}, { scale = 1, deltaTime = null } = {}) {
        const normalizedScale = Number.isFinite(scale) ? scale : 1;
        const timeScale = Number.isFinite(deltaTime) ? deltaTime : 1;
        const totalScale = normalizedScale * timeScale;

        const funAmount = this.getEffectAmount(effectSource, ['fun', 'funDelta', 'funBoost']);
        const boredomAmount = this.getEffectAmount(effectSource, ['boredom', 'boredomDelta', 'boredomBoost']);

        return {
            energy: this.getEffectAmount(effectSource, ['energy', 'energyDelta', 'energyRestore', 'energyBoost']) * totalScale,
            health: this.getEffectAmount(effectSource, ['health', 'healthDelta', 'healthRestore', 'healthBoost']) * totalScale,
            mood: this.getEffectAmount(effectSource, ['mood', 'moodDelta', 'moodBoost']) * totalScale,
            boredom: (boredomAmount - funAmount) * totalScale,
            comfort: this.getEffectAmount(effectSource, ['comfort', 'comfortDelta', 'comfortBoost']) * totalScale,
            confidence: this.getEffectAmount(effectSource, ['confidence', 'confidenceDelta', 'confidenceBoost']) * totalScale
        };
    }

    applyStatEffects(effectSource = {}, options = {}) {
        const deltas = this.normalizeStatEffects(effectSource, options);

        if (deltas.energy > 0) {
            this.restoreEnergy(deltas.energy);
        } else if (deltas.energy < 0) {
            this.useEnergy(-deltas.energy);
        }

        if (deltas.health > 0) {
            this.heal(deltas.health);
        } else if (deltas.health < 0) {
            this.applyDamage(-deltas.health);
        }

        if (deltas.mood !== 0) this.updateMood(deltas.mood);
        if (deltas.boredom !== 0) this.updateBoredom(deltas.boredom);
        if (deltas.comfort !== 0) this.updateComfort(deltas.comfort);
        if (deltas.confidence !== 0) this.updateConfidence(deltas.confidence);

        return deltas;
    }

    applyStatEffectsPerMs(effectSource = {}, deltaTime, options = {}) {
        return this.applyStatEffects(effectSource, {
            ...options,
            deltaTime
        });
    }

    scaleNeedReward(amount, needLevel) {
        if (!Number.isFinite(amount) || amount === 0) {
            return 0;
        }

        if (amount > 0) {
            return amount * (1 + (Utility.clamp(needLevel, 0, 1) * SiteConfig.stats.activityRewards.missingNeedMultiplier));
        }

        return amount;
    }

    getActivityRewardProfile(category = 'default') {
        return SiteConfig.stats.activityRewards.categories[category] ??
            SiteConfig.stats.activityRewards.categories.default;
    }

    resolveActivityMetadata(activityInstance) {
        return activityInstance?.constructor?.metadata ?? activityInstance ?? {};
    }

    applyActivityEffects(activityInstance, { scale = 1 } = {}) {
        const metadata = this.resolveActivityMetadata(activityInstance);
        const category = metadata.category ?? 'default';
        const rewardProfile = this.getActivityRewardProfile(category);
        const rewardScale = Number.isFinite(scale)
            ? Math.max(0, scale)
            : 1;

        let moodDelta = this.scaleNeedReward(
            (rewardProfile.mood ?? 0) * rewardScale,
            1 - this.getMoodRatio()
        );
        if (metadata.affectsMood && Number.isFinite(metadata.moodEffect)) {
            moodDelta += this.scaleNeedReward(
                metadata.moodEffect * SiteConfig.stats.activityRewards.moodEffectMultiplier * rewardScale,
                1 - this.getMoodRatio()
            );
        }

        const boredomDelta = this.scaleNeedReward(
            (rewardProfile.boredom ?? 0) * rewardScale,
            this.getBoredomRatio()
        );
        const comfortDelta = this.scaleNeedReward(
            (rewardProfile.comfort ?? 0) * rewardScale,
            1 - this.getComfortRatio()
        );
        const confidenceDelta = this.scaleNeedReward(
            (rewardProfile.confidence ?? 0) * rewardScale,
            1 - this.getConfidenceRatio()
        );

        this.applyStatEffects({
            mood: moodDelta,
            boredom: boredomDelta,
            comfort: comfortDelta,
            confidence: confidenceDelta
        });
    }

    applyActionCompletionEffects(actionInstance) {
        this.applyActivityEffects(actionInstance);
    }

    handleMoodEffects() {
        if (this.mood <= SiteConfig.myte.thresholds.moodLow) {
            if (Math.random() < 0.1) {
                this.setMood('sad');
            }
        } else if (this.mood >= SiteConfig.myte.thresholds.moodHigh) {
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

    getBuffMultiplier(path) {
        return this.myte.buffs?.getEffectValue?.(path, 1) ?? 1;
    }

    getBuffFlat(path) {
        return this.myte.buffs?.getEffectValue?.(path, 0) ?? 0;
    }

    applyContinuousBuffStatEffects(deltaTime) {
        this.applyStatEffectsPerMs({
            energy: this.getBuffFlat('stats.energyPerMs'),
            health: this.getBuffFlat('stats.healthPerMs'),
            mood: this.getBuffFlat('stats.moodPerMs'),
            boredom: this.getBuffFlat('stats.boredomPerMs'),
            fun: this.getBuffFlat('stats.funPerMs'),
            comfort: this.getBuffFlat('stats.comfortPerMs'),
            confidence: this.getBuffFlat('stats.confidencePerMs')
        }, deltaTime);
    }

    getSpeed() {
        let speedMultiplier = 1;

        // Activity trait affects speed
        speedMultiplier *= (1 + (this.traits.activity / 200)); // -100 to 100 becomes 0.5 to 1.5
        speedMultiplier *= this.getBuffMultiplier('movement.speedMultiplier');

        return (this.speed + this.getBuffFlat('movement.speedFlat')) * speedMultiplier;
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

    // Resolve the bed-rest regen rate, factoring in the quality of the surface
    _getBedRestRate() {
        const action = this.getCurrentAction();
        const actionConfig = action?.target?.getActionConfig?.('use_surface_slot', {}) ?? {};
        const benefit = actionConfig.benefit ?? 'energy';
        if (benefit !== 'energy') {
            return this.energyRegenRate;
        }
        const multiplier = action?.target?.getConfig?.('restEnergyRegenMultiplier', 1.0) ?? 1.0;
        return this.bedRestEnergyRegenRate * multiplier;
    }

    regenerateEnergy(delta, rate = null) {
        const effectiveRate = (rate ?? this.energyRegenRate) * this.getBuffMultiplier('stats.energyRegenMultiplier');
        const previousEnergy = this.energy;
        if (this.energy < this.maxEnergy) {
            // Store the energy change for rapid charging detection
            const energyBefore = this.energy;

            this.energy = Math.min(this.maxEnergy, this.energy + (effectiveRate * delta));
            
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

        // Free-roam should immediately head home instead of selecting another activity.
        this.myte.ai?.handleEnergyDepleted?.();

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
    
        this.myte.buffs?.emitEvent?.('full_charge', {
            energy: this.energy
        });
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
        this.isExhausted = true;
    }

    clearExhaustionEffects() {
        if (!this.isExhausted) {
            return;
        }

        this.isExhausted = false;

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

    applyBatteryLevelClasses(batteryElement, currentThresholdIndex, batteryStatus) {
        if (!batteryElement) return;

        this.batteryThresholds.forEach(threshold => {
            batteryElement.classList.remove(threshold.name);
        });

        batteryElement.classList.add(batteryStatus);
        batteryElement.setAttribute('data-level', currentThresholdIndex);
    }

    syncSlotBatteryDisplay(currentThresholdIndex, batteryStatus) {
        const slotBattery = this.myte.slotBattery;
        if (!slotBattery) return;

        this.applyBatteryLevelClasses(slotBattery, currentThresholdIndex, batteryStatus);
        slotBattery.classList.add('is-visible', 'slot-battery');
        slotBattery.classList.remove('blinking', 'critical-pulse', 'charging', 'rapid-charging');
    }

    // Update battery display based on current energy
    updateBatteryDisplay() {
        if (!this.myte.battery && !this.myte.slotBattery) return;

        // Calculate what battery level should be shown
        const currentThresholdIndex = this.getThresholdIndex(this.energy);
        const batteryStatus = this.batteryThresholds[currentThresholdIndex].name;

        // Only update if the level has changed
        if (currentThresholdIndex !== this.batteryLevel) {
            // Play appropriate sound once
            this.playBatterySound(currentThresholdIndex);

            this.batteryLevel = currentThresholdIndex;
            if (this.myte.battery) {
                this.applyBatteryLevelClasses(this.myte.battery, currentThresholdIndex, batteryStatus);
                this.showBattery();
                this.handleBatteryVisibility();
            }
        }

        // Slot battery tracks independently so it initializes correctly when first shown
        if (currentThresholdIndex !== this._slotBatteryLevel) {
            this._slotBatteryLevel = currentThresholdIndex;
            this.syncSlotBatteryDisplay(currentThresholdIndex, batteryStatus);
        }

        // Only toggle rapid-charging class when the state actually changes
        if (this.isRapidCharging !== this._lastRapidCharging) {
            this._lastRapidCharging = this.isRapidCharging;
            if (this.myte.battery) {
                this.myte.battery.classList.toggle('rapid-charging', this.isRapidCharging);
            }
        }
    }

    playBatterySound(currentThresholdIndex) {
        if (!this.myte.isActive) {
            return;
        }

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
        this.myte.battery.classList.add('is-visible');
    }

    // Hide the battery icon
    hideBattery() {
        if (!this.myte.battery) return;
        this.batteryVisible = false;
        this.myte.battery.classList.remove('is-visible');
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

            this.batteryHideTimeout = this.setManagedTimeout(() => {
                this.myte.battery.classList.remove('blinking');
                this.batteryHideTimeout = null;
            }, SiteConfig.myte.cooldowns.batteryHideLow);
        }
        // Medium energy - show continuously
        else if (batteryStatus === 'medium') {
            this.showBattery();

            this.batteryHideTimeout = this.setManagedTimeout(() => {
                this.hideBattery();
                this.batteryHideTimeout = null;
            }, SiteConfig.myte.cooldowns.batteryHideMedium);
        }
        // Full energy - show temporarily then hide
        else if (batteryStatus === 'full') {
            this.showBattery();

            this.batteryHideTimeout = this.setManagedTimeout(() => {
                this.hideBattery();
                this.batteryHideTimeout = null;
            }, SiteConfig.myte.cooldowns.batteryHideFull);
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

    getCurrentAction() {
        return this.myte.queue.getCurrentAction?.() ?? null;
    }

    getCurrentActionMetadata() {
        return this.getCurrentAction()?.constructor?.metadata ?? {};
    }

    isRestingAction(actionId = this.getCurrentActionId()) {
        return actionId === 'sleep' ||
            actionId === 'simple_sleep' ||
            actionId === 'use_surface_slot';
    }

    getEnergyActivityMultiplier() {
        const metadata = this.getCurrentActionMetadata();
        const actionId = metadata.id ?? this.getCurrentActionId();

        if (this.isRestingAction(actionId)) return 0;

        if (Number.isFinite(metadata.energyCostMultiplier)) {
            return metadata.energyCostMultiplier;
        }

        const category = metadata.category ?? '';
        const categoryFallbacks = {
            play: 1.6,
            reactive: 1.45,
            carrying: 1.3,
            movement: 1.2,
            social: 1.05,
            interactions: 0.95
        };
        return categoryFallbacks[category] ?? 1;
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
        const isResting = actionId === 'sleep' || actionId === 'simple_sleep' || actionId === 'use_surface_slot';
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
        const rateScale = this.behaviorDriveRate * this.getBuffMultiplier('stats.behaviorDriveMultiplier');
        const liveMoodRates = SiteConfig.stats.activityRewards.liveMoodRates;

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
        const moodBlend = (moodTarget - this.mood) *
            (this.moodSyncRate * this.getBuffMultiplier('stats.moodSyncMultiplier')) *
            deltaTime;
        let activityMoodDelta = 0;
        if (isPlayful) {
            activityMoodDelta += liveMoodRates.play;
        } else if (isSocial) {
            activityMoodDelta += liveMoodRates.social;
        } else if (isStimulating || isResting) {
            activityMoodDelta += liveMoodRates.stimulating;
        } else if (isPurposefulMovement) {
            activityMoodDelta += liveMoodRates.movement;
        } else if (isIdle) {
            activityMoodDelta += liveMoodRates.idle;
        }

        this.updateMood(moodBlend + (activityMoodDelta * deltaTime * rateScale));
    }

    maybeSignalNeeds() {
        const dialogue = this.myte.dialogue;
        if (!dialogue || !this.myte.queue.isEmpty() || this.myte.isDragging) {
            return;
        }

        const lastAiDecisionAge = Date.now() - (this.myte.ai?.lastDecisionTime ?? 0);
        const isBoredEnoughToComplain =
            this.boredom >= SiteConfig.myte.needSignals.boredomHigh &&
            this.mood <= SiteConfig.myte.needSignals.boredomMoodCap &&
            lastAiDecisionAge >= SiteConfig.myte.needSignals.boredomDecisionAge;

        const signals = [
            {
                id: 'energy_low',
                condition: this.energy <= SiteConfig.myte.needSignals.energyLow,
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
                condition: this.comfort <= SiteConfig.myte.needSignals.comfortLow,
                text: 'cozy?',
                style: 'thought',
                expression: 'peek'
            },
            {
                id: 'mood_low',
                condition: this.mood <= SiteConfig.myte.needSignals.moodLow,
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
        this.updateMood(-this.moodDecayRate * deltaTime * this.getBuffMultiplier('stats.moodDecayMultiplier'));

        if (this.myte.isMoving()) {
            this.useEnergy(
                this.energyDecayRate *
                deltaTime *
                this.getEnergyActivityMultiplier() *
                this.getBuffMultiplier('stats.energyDecayMultiplier')
            );
        } else if (this.isRestingAction()) {
            // Bed/couch rest — slow, quality-dependent regen handled here.
            // SurfaceSlotAction also drives the "rest until full" loop condition.
            this.regenerateEnergy(deltaTime, this._getBedRestRate());
        } else {
            this.regenerateEnergy(deltaTime);
        }

        this.applyContinuousBuffStatEffects(deltaTime);
        this.updateBehaviorDrives(deltaTime);
        this.updateHealth(SiteConfig.stats.healthRegenRate * deltaTime);
        this.maybeSignalNeeds();
        this.updateBatteryDisplay();
    }

    updateInHomeSlot(deltaTime) {
        this.updateMood(
            -this.moodDecayRate *
            deltaTime *
            this.homeSlotMoodDecayMultiplier *
            this.getBuffMultiplier('stats.moodDecayMultiplier')
        );
        this.regenerateEnergy(deltaTime, this.homeSlotEnergyRegenRate);
        this.applyContinuousBuffStatEffects(deltaTime);
        this.updateBehaviorDrives(deltaTime * this.homeSlotBehaviorRateMultiplier);
        this.updateComfort(this.homeSlotComfortBoostRate * deltaTime);
        this.updateConfidence(this.homeSlotConfidenceBoostRate * deltaTime);
        this.updateHealth(SiteConfig.stats.healthRegenRate * 1.5 * deltaTime);
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
