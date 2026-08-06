class MyteStats {
    constructor(myte) {
        this.myte = myte;
        const statConfig = myte.definition?.stats || {};
        const movementConfig = myte.definition?.movement || {};
        const traitConfig = statConfig.traits || {};
        const aiConfig = myte.definition?.ai || {};
        this.pendingTimeouts = new Set();

        // Basic stats
        this.minHealth = 0;
        this.maxHealth = 100;
        this.health = Utility.clamp(statConfig.health ?? 100, this.minHealth, this.maxHealth);
        this.speed = statConfig.speed ?? movementConfig.baseSpeed ?? 1;
        this.level = 1;
        this.experience = 0;

        // Energy system
        this.minEnergy = 0;
        this.maxEnergy = 100;
        this.energy = Utility.clamp(statConfig.energy ?? SiteConfig.myte.initialStats.energy, this.minEnergy, this.maxEnergy);
        this.energyDecayRate = statConfig.energyDecayRate ?? SiteConfig.stats.energyDecayRate;
        this.energyRegenRate = statConfig.energyRegenRate ?? SiteConfig.stats.energyRegenRate;
        this.bedRestEnergyRegenRate = statConfig.bedRestEnergyRegenRate ?? SiteConfig.stats.bedRestEnergyRegenRate;
        this.homeSlotEnergyRegenRate = statConfig.homeSlotEnergyRegenRate ?? SiteConfig.stats.homeSlotEnergyRegenRate;
        this.homeSlotBehaviorRateMultiplier = statConfig.homeSlotBehaviorRateMultiplier ?? SiteConfig.stats.homeSlotBehaviorRateMultiplier;
        this.homeSlotComfortBoostRate = statConfig.homeSlotComfortBoostRate ?? SiteConfig.stats.homeSlotComfortBoostRate;
        this.homeSlotConfidenceBoostRate = statConfig.homeSlotConfidenceBoostRate ?? SiteConfig.stats.homeSlotConfidenceBoostRate;
        this.fullChargeAnnounceCooldown = statConfig.fullChargeAnnounceCooldown ?? SiteConfig.stats.fullChargeAnnounceCooldown;
        this.fullChargeResetThreshold = statConfig.fullChargeResetThreshold ?? SiteConfig.stats.fullChargeResetThreshold;
        this.lastFullChargeAnnouncementAt = 0;
        this.hasAnnouncedFullCharge = this.energy >= this.maxEnergy;

        // Fun (replaces boredom — high fun = engaged, low fun = bored)
        this.minFun = 0;
        this.maxFun = 100;
        this.fun = Utility.clamp(statConfig.fun ?? SiteConfig.myte.initialStats.fun, this.minFun, this.maxFun);
        this.funDecayRate = statConfig.funDecayRate ?? SiteConfig.stats.funDecayRate;

        // Social need
        this.minSocial = 0;
        this.maxSocial = 100;
        this.social = Utility.clamp(statConfig.social ?? SiteConfig.myte.initialStats.social, this.minSocial, this.maxSocial);
        this.socialDecayRate = statConfig.socialDecayRate ?? SiteConfig.stats.socialDecayRate;

        // Satiety (100 = full, 0 = starving)
        this.minSatiety = 0;
        this.maxSatiety = 100;
        this.satiety = Utility.clamp(statConfig.satiety ?? SiteConfig.myte.initialStats.satiety, this.minSatiety, this.maxSatiety);
        this.satietyDecayRate = statConfig.satietyDecayRate ?? SiteConfig.stats.satietyDecayRate;

        // Comfort
        this.minComfort = 0;
        this.maxComfort = 100;
        this.comfort = Utility.clamp(statConfig.comfort ?? SiteConfig.myte.initialStats.comfort, this.minComfort, this.maxComfort);

        // Confidence (0–1)
        const confConfig = statConfig.confidence;
        this.confidence = typeof confConfig === 'object' && confConfig !== null
            ? Utility.clamp(confConfig.default ?? 0.5, 0, 1)
            : Utility.clamp((confConfig ?? 50) / 100, 0, 1);
        this.minConfidence = 0;
        this.maxConfidence = 1;

        // Battery 
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
        this.noteBehaviorScale = statConfig.noteBehaviorScale ?? SiteConfig.stats.noteBehaviorScale;

        // Traits: 0–1 range. curiosity, activity, sociability, boldness.
        this.traits = {
            curiosity:   this.resolveTraitValue(traitConfig.curiosity),
            activity:    this.resolveTraitValue(traitConfig.activity),
            sociability: this.resolveTraitValue(traitConfig.sociability ?? 0.5),
            boldness:    this.resolveTraitValue(traitConfig.boldness ?? 0.5)
        };

        this.safeAreaRadius = aiConfig.safeAreaRadius ?? aiConfig.homeRadius ?? SiteConfig.ai.radii.home;
        this._lastDistanceFromHome = 0;

        this.comfortBlendRate = statConfig.comfortBlendRate ?? SiteConfig.stats.comfortBlendRate;
        this.confidenceBlendRate = statConfig.confidenceBlendRate ?? SiteConfig.stats.confidenceBlendRate;
        this.exhaustionThreshold = statConfig.exhaustionThreshold ?? SiteConfig.stats.exhaustionThreshold;

        const funRateCfg = aiConfig.funDeltaRates ?? {};
        const funRateDefaults = SiteConfig.stats.funDeltaRates;
        this.funDeltaRates = {
            resting:     funRateCfg.resting     ?? funRateDefaults.resting,
            stimulating: funRateCfg.stimulating ?? funRateDefaults.stimulating,
            movement:    funRateCfg.movement    ?? funRateDefaults.movement,
            idle:        funRateCfg.idle        ?? funRateDefaults.idle,
            default:     funRateCfg.default     ?? funRateDefaults.default,
            moving:      funRateCfg.moving      ?? funRateDefaults.moving
        };

        this.lastInteractionTime = 0;
        this.interactionCooldown = SiteConfig.myte.cooldowns.interaction;

        this._statDriveAccum = 0;
        this._statDriveTickInterval = SiteConfig.stats.behaviorDriveTickInterval;
        this._needSignalAccum = 0;
        this._starvationElapsed = 0;
        this._healthDepletionArmed = this.health > this.minHealth;

        // Initialize battery display
        this.updateBatteryDisplay();
    }

    updateHealth(amount) {
        this.health = Utility.clamp(this.health + amount, this.minHealth, this.maxHealth);
        this._rearmHealthDepletionIfRecovered();
    }

    applyDamage(amount) {
        const previousHealth = this.health;
        this.health = Math.max(this.minHealth, this.health - amount);
        if (previousHealth > this.minHealth && this.health <= this.minHealth && this._healthDepletionArmed) {
            this.onHealthDepleted();
        }
    }

    heal(amount) {
        this.health = Utility.clamp(this.health + amount, this.minHealth, this.maxHealth);
        this._rearmHealthDepletionIfRecovered();
    }

    // Trait value resolution: accepts number (0–1) or object {default, min, max}
    resolveTraitValue(config) {
        if (typeof config === 'number') return Utility.clamp(config, 0, 1);
        if (typeof config === 'object' && config !== null) {
            return Utility.clamp(config.default ?? 0.5, config.min ?? 0, config.max ?? 1);
        }
        return 0.5;
    }

    // --- Need update methods ---

    updateFun(amount) {
        this.fun = Utility.clamp(this.fun + amount, this.minFun, this.maxFun);
    }

    updateSocial(amount) {
        this.social = Utility.clamp(this.social + amount, this.minSocial, this.maxSocial);
    }

    updateSatiety(amount) {
        this.satiety = Utility.clamp(this.satiety + amount, this.minSatiety, this.maxSatiety);
    }

    updateComfort(amount) {
        this.comfort = Utility.clamp(this.comfort + amount, this.minComfort, this.maxComfort);
    }

    // --- Confidence ---

    applyConfidenceDelta(delta) {
        const scaled = delta * (0.5 + this.traits.boldness * 0.5);
        this.confidence = Utility.clamp(this.confidence + scaled, this.minConfidence, this.maxConfidence);
    }

    // --- Ratio getters ---

    getFunRatio()        { return this.fun      / this.maxFun; }
    getSocialRatio()     { return this.social   / this.maxSocial; }
    getSatietyRatio()    { return this.satiety  / this.maxSatiety; }
    getComfortRatio()    { return this.comfort  / this.maxComfort; }
    getConfidenceRatio() { return this.confidence; }
    getEnergyRatio()     { return this.energy   / this.maxEnergy; }
    getHealthRatio()     { return this.health   / this.maxHealth; }

    // --- Trait accessors ---

    getTrait(name)      { return this.traits?.[name] ?? 0; }
    getTraitNormalized(name) { return this.getTrait(name); } // traits are already 0–1

    // --- Buff helpers ---

    getBuffMultiplier(path) {
        return this.myte.buffs?.getEffectValue?.(path, 1) ?? 1;
    }

    getBuffFlat(path) {
        return this.myte.buffs?.getEffectValue?.(path, 0) ?? 0;
    }

    // --- Stat effect application ---

    getEffectAmount(effectSource, keys = []) {
        if (!effectSource || typeof effectSource !== 'object') return 0;
        for (const key of keys) {
            const value = effectSource[key];
            if (Number.isFinite(value)) return value;
        }
        return 0;
    }

    normalizeStatEffects(effectSource = {}, { scale = 1, deltaTime = null } = {}) {
        const normalizedScale = Number.isFinite(scale) ? scale : 1;
        const timeScale = Number.isFinite(deltaTime) ? deltaTime : 1;
        const totalScale = normalizedScale * timeScale;
        return {
            energy:  this.getEffectAmount(effectSource, ['energy', 'energyDelta', 'energyRestore', 'energyBoost']) * totalScale,
            health:  this.getEffectAmount(effectSource, ['health',  'healthDelta',  'healthRestore',  'healthBoost'])  * totalScale,
            fun:     this.getEffectAmount(effectSource, ['fun',     'funDelta',     'funBoost'])  * totalScale,
            social:  this.getEffectAmount(effectSource, ['social',  'socialDelta',  'socialBoost']) * totalScale,
            satiety: this.getEffectAmount(effectSource, ['satiety', 'satietyDelta', 'satietyBoost']) * totalScale,
            comfort: this.getEffectAmount(effectSource, ['comfort', 'comfortDelta', 'comfortBoost']) * totalScale,
            confidence: this.getEffectAmount(effectSource, ['confidence', 'confidenceDelta', 'confidenceBoost']) * totalScale
        };
    }

    applyStatEffects(effectSource = {}, options = {}) {
        const deltas = this.normalizeStatEffects(effectSource, options);

        if (deltas.energy > 0) this.restoreEnergy(deltas.energy);
        else if (deltas.energy < 0) this.useEnergy(-deltas.energy);

        if (deltas.health > 0) this.heal(deltas.health);
        else if (deltas.health < 0) this.applyDamage(-deltas.health);

        if (deltas.fun !== 0)     this.updateFun(deltas.fun);
        if (deltas.social !== 0)  this.updateSocial(deltas.social);
        if (deltas.satiety !== 0) this.updateSatiety(deltas.satiety);
        if (deltas.comfort !== 0) this.updateComfort(deltas.comfort);
        if (deltas.confidence !== 0) this.applyConfidenceDelta(deltas.confidence);

        return deltas;
    }

    applyStatEffectsPerMs(effectSource = {}, deltaTime, options = {}) {
        return this.applyStatEffects(effectSource, { ...options, deltaTime });
    }

    // Apply the result of a completed (or failed) action
    applyActionResult(result) {
        const scale = this.noteBehaviorScale;

        if (result.funDelta)     this.updateFun(result.funDelta * scale);
        if (result.socialDelta)  this.updateSocial(result.socialDelta * scale);
        if (result.comfortDelta) this.updateComfort(result.comfortDelta * scale);
        if (result.energyDelta) {
            if (result.energyDelta > 0) this.restoreEnergy(result.energyDelta * scale);
            else this.useEnergy(-result.energyDelta * scale);
        }
        if (result.satietyDelta) this.updateSatiety(result.satietyDelta * scale);

        if (result.failedOutcome) {
            this.applyConfidenceDelta(-0.04);
        } else if (result.safeOutcome) {
            this.applyConfidenceDelta(result.novelty > 3 ? 0.04 : 0.02);
        }

        this.myte.buffs?.checkStatusTriggers?.();
    }

    scaleNeedReward(amount, needLevel) {
        if (!Number.isFinite(amount) || amount === 0) return 0;
        if (amount > 0) {
            return amount * (1 + (Utility.clamp(needLevel, 0, 1) * SiteConfig.stats.activityRewards.missingNeedMultiplier));
        }
        return amount;
    }

    resolveActivityMetadata(activityInstance) {
        return activityInstance?.constructor?.metadata ?? activityInstance ?? {};
    }

    applyContinuousBuffStatEffects(deltaTime) {
        this.applyStatEffectsPerMs({
            energy:   this.getBuffFlat('stats.energyPerMs'),
            health:   this.getBuffFlat('stats.healthPerMs'),
            fun:      this.getBuffFlat('stats.funPerMs'),
            social:   this.getBuffFlat('stats.socialPerMs'),
            satiety:  this.getBuffFlat('stats.satietyPerMs'),
            comfort:  this.getBuffFlat('stats.comfortPerMs'),
            confidence: this.getBuffFlat('stats.confidencePerMs')
        }, deltaTime);
    }

    // --- Derived mood (pure, no side effects) ---

    getDerivedMood() {
        const e    = this.getEnergyRatio();
        const f    = this.getFunRatio();
        const s    = this.getSocialRatio();
        const c    = this.getComfortRatio();
        const conf = this.confidence;
        const far  = this._lastDistanceFromHome > this.safeAreaRadius;

        if (e < 0.15 && f < 0.30) return 'exhausted';
        if (conf < 0.2 && far)    return 'anxious';
        if (s < 0.20 && c < 0.30) return 'lonely';
        if (f < 0.20)             return 'bored';
        if (e < 0.25)             return 'sleepy';
        if (c > 0.80 && e > 0.60) return 'cozy';
        if (f > 0.75 && e > 0.60) return 'playful';
        if (s > 0.80 && c > 0.60) return 'happy';
        if (f > 0.85 && s > 0.70) return 'excited';
        return 'neutral';
    }

    awardExperience({ accomplishment = 0, novelty = 0, exertion = 0 } = {}) {
        const config = SiteConfig.myte.progression;
        const gained = Math.max(0, Math.round(
            config.baseXpPerAction +
            Math.max(0, accomplishment) * config.accomplishmentWeight +
            Math.max(0, novelty) * config.noveltyWeight +
            Math.max(0, exertion) * config.exertionWeight
        ));
        this.experience += gained;
        let threshold = Math.round(config.xpPerLevel * Math.pow(this.level, config.levelExponent));
        while (this.experience >= threshold) {
            this.experience -= threshold;
            this.level++;
            threshold = Math.round(config.xpPerLevel * Math.pow(this.level, config.levelExponent));
            this.myte.parent?.eventManager?.emit?.('myte:level_up', { myte: this.myte, level: this.level });
        }
        return gained;
    }

    _getMoodSpeedMultiplier() {
        switch (this.getDerivedMood()) {
            case 'excited':   return 1.5;
            case 'happy':     return 1.2;
            case 'playful':   return 1.1;
            case 'cozy':      return 0.95;
            case 'bored':     return 0.95;
            case 'sleepy':    return 0.7;
            case 'lonely':    return 0.85;
            case 'exhausted': return 0.65;
            case 'anxious':   return 0.92;
            default:          return 1.0;
        }
    }

    getSpeed() {
        const base = (this.speed + this.getBuffFlat('movement.speedFlat'));
        return base * this.getBuffMultiplier('movement.speedMultiplier') * this._getMoodSpeedMultiplier();
    }

    // --- noteBehavior — still called from MyteAI.rememberCompletedAction ---

    noteBehavior({
        category = 'idle',
        novelty = 0.4,
        soothing = 0,
        social = 0,
        accomplishment = 0,
        exertion = 0
    } = {}) {
        const nn = Utility.clamp(novelty,        0, 1);
        const ns = Utility.clamp(soothing,       0, 1);
        const nc = Utility.clamp(social,         0, 1);
        const na = Utility.clamp(accomplishment, 0, 1);
        const ne = Utility.clamp(exertion,       0, 1);

        let funDelta     = (nn * 10) + (nc * 6) + (na * 5);
        let comfortDelta = (ns * 8) + (category === 'rest' ? 10 : 0) - (ne * 3);
        let socialDelta  = nc * 18;
        let confDelta    = (na * 0.07) + (nc * 0.04) + (nn * 0.03);

        if (category === 'play') {
            funDelta  += 8;
            confDelta += 0.02;
        } else if (category === 'social') {
            funDelta     += 4;
            comfortDelta += 2;
            socialDelta  += 12;
        } else if (category === 'idle') {
            funDelta  -= 3;
            confDelta -= 0.01;
        }

        this.updateFun(funDelta * this.noteBehaviorScale);
        this.updateComfort(comfortDelta * this.noteBehaviorScale);
        this.updateSocial(socialDelta * this.noteBehaviorScale);
        this.applyConfidenceDelta(confDelta);
    }

    // --- Behavior drives (updates fun, social, satiety, comfort per tick) ---

    updateBehaviorDrives(deltaTime, { suppressExhaustionCascade = false } = {}) {
        const actionId = this.getCurrentActionId();
        const def = ActionDefinitionRegistry.getDefinitionSync(actionId ?? '');
        const tags = def?.tags ?? [];

        const home = this.myte.getHomePosition?.();
        const distanceFromHome = home ? this.myte.getDistanceToPoint(home.x, home.y) : 0;
        this._lastDistanceFromHome = distanceFromHome;

        const safeRadius = this.safeAreaRadius;
        const comfortRadius = this.myte.ai?.homeComfortRadius ?? (safeRadius * 0.44);
        const homeComfort = home
            ? Utility.clamp(1 - (distanceFromHome / Math.max(comfortRadius * 2, 1)), 0, 1)
            : 0.5;

        const isIdle            = !actionId || actionId === 'idle';
        const isResting         = this.isRestingAction(actionId);
        const isStimulating     = tags.includes('stimulating');
        const isPlayful         = tags.includes('playful');
        const isSocial          = tags.includes('social');
        const isPurposefulMove  = tags.includes('purposeful_movement');
        const isRestful         = tags.includes('restful');

        const rateScale = this.behaviorDriveRate * this.getBuffMultiplier('stats.behaviorDriveMultiplier');
        const exhaustionPenalty = this._getExhaustionPenalty();
        const cascade = SiteConfig.stats.exhaustionCascade;

        // Fun drain/gain
        let funDelta = 0;
        if (isResting || isRestful) {
            funDelta -= this.funDeltaRates.resting * deltaTime * rateScale;
        } else if (isStimulating || isPlayful || isSocial) {
            funDelta += this.funDeltaRates.stimulating * deltaTime * rateScale;
        } else if (isPurposefulMove) {
            funDelta += this.funDeltaRates.movement * deltaTime * rateScale;
        } else if (isIdle) {
            funDelta -= this.funDeltaRates.idle * deltaTime * rateScale;
        } else {
            funDelta -= this.funDeltaRates.default * deltaTime * rateScale;
        }

        if (this.myte.isMoving() && !isPlayful && !isStimulating && !isSocial) {
            funDelta += this.funDeltaRates.moving * deltaTime * rateScale;
        }

        // Wellbeing ceiling: fun can't stay high when vitals (energy, health, satiety) are depleted.
        // Ceiling scales from wb.funMinCap (all vitals = 0) up to maxFun (all vitals = 100%).
        const wb = SiteConfig.stats.wellbeing;
        const vitalRatio = (this.getEnergyRatio() + this.getHealthRatio() + this.getSatietyRatio()) / 3;
        const funCeiling = Utility.clamp(vitalRatio, wb.funMinCap, 1) * this.maxFun;
        if (this.fun > funCeiling) funDelta -= (this.fun - funCeiling) * wb.ceilingDrainRate * deltaTime;

        // Apply fun decay rate on top of drive adjustments; exhaustion accelerates decay
        const funDecayMult = this.getBuffMultiplier('stats.funDecayMultiplier');
        const funExhaustionScale = suppressExhaustionCascade ? 1 : 1 + cascade.funDecayScale * exhaustionPenalty;
        this.updateFun(-this.funDecayRate * deltaTime * rateScale * funDecayMult * funExhaustionScale + funDelta);

        // Social decay — reduced when alone, partially offset when following the player
        const otherMytes = this.myte.parent?.mytes ?? [];
        const isAlone = otherMytes.filter(m => m !== this.myte && m?.isActive).length === 0;
        const isFollowing = this.myte.goal === MOVE_TYPES.FOLLOW;
        const socialDecayMultiplier = isAlone ? 0.5 : 1;
        const followSocialOffset = isFollowing ? this.socialDecayRate * 0.55 * deltaTime * rateScale : 0;
        const socialExhaustionScale = suppressExhaustionCascade ? 1 : 1 + cascade.socialDecayScale * exhaustionPenalty;
        this.updateSocial(-this.socialDecayRate * deltaTime * rateScale * socialDecayMultiplier * socialExhaustionScale + followSocialOffset);

        // Satiety decay — faster when exhausted (body burns more fuel when running on empty)
        const satietyExhaustionScale = suppressExhaustionCascade ? 1 : 1 + cascade.satietyDecayScale * exhaustionPenalty;
        this.updateSatiety(-this.satietyDecayRate * deltaTime * rateScale * satietyExhaustionScale);

        // Comfort blends toward a target based on wellbeing and home proximity.
        // Energy, health, and satiety are weighted heavily — you can't be comfortable while starving/exhausted/injured.
        const comfortTarget = (
            (this.getFunRatio()    * 0.20) +
            (this.getEnergyRatio() * 0.30) +
            (this.getHealthRatio() * 0.20) +
            (this.getSatietyRatio() * 0.10) +
            (homeComfort           * 0.20)
        ) * this.maxComfort;
        const comfortBlend = (comfortTarget - this.comfort) * this.comfortBlendRate * deltaTime * rateScale;
        this.updateComfort(comfortBlend);

        if (isResting) {
            this.updateComfort(0.0025 * deltaTime * rateScale);
        } else if (distanceFromHome > (comfortRadius * 1.8) && this.energy < 40) {
            this.updateComfort(-0.0018 * deltaTime * rateScale);
        }

        // Confidence passive: blend toward a target based on wellbeing and home proximity.
        // Survival vitals (energy, health, satiety) are the primary drivers — fun is secondary.
        const confTarget = (
            this.getEnergyRatio() * 0.35 +
            this.getHealthRatio() * 0.25 +
            this.getSatietyRatio() * 0.20 +
            this.getFunRatio()    * 0.10 +
            homeComfort           * 0.10
        );
        const confBlend = (confTarget - this.confidence) * this.confidenceBlendRate * deltaTime * rateScale;
        this.applyConfidenceDelta(confBlend);

        if (isSocial || isPlayful) {
            this.applyConfidenceDelta(0.00001 * deltaTime * rateScale);
        } else if (this.getFunRatio() < 0.25 || this.getEnergyRatio() < 0.18) {
            this.applyConfidenceDelta(-0.000011 * deltaTime * rateScale);
        }

        if (exhaustionPenalty > 0 && !suppressExhaustionCascade) {
            this.updateComfort(-cascade.comfortDrainPerMs * exhaustionPenalty * deltaTime * rateScale);
            this.applyConfidenceDelta(-cascade.confidenceDrainPerMs * exhaustionPenalty * deltaTime * rateScale);
        }

        // Comfort ceiling: scales from wb.comfortMinCap (vitals=0) to maxComfort (vitals=100%)
        const comfortCeiling = Utility.clamp(vitalRatio, wb.comfortMinCap, 1) * this.maxComfort;
        if (this.comfort > comfortCeiling) {
            this.updateComfort(-(this.comfort - comfortCeiling) * wb.ceilingDrainRate * deltaTime);
        }

        // Confidence ceiling: scales from wb.confidenceMinCap (vitals=0) to 1.0 (vitals=100%)
        const confidenceCeiling = Utility.clamp(vitalRatio, wb.confidenceMinCap, 1);
        if (this.confidence > confidenceCeiling) {
            this.applyConfidenceDelta(-(this.confidence - confidenceCeiling) * wb.ceilingDrainRate * deltaTime);
        }

        // Starvation: near-zero satiety slowly drains health, separate from exhaustion cascade
        if (this.getSatietyRatio() < wb.starvationThreshold) {
            this._starvationElapsed += deltaTime;
            if (this._starvationElapsed >= wb.starvationGraceMs) {
                const starvationPenalty = 1 - (this.getSatietyRatio() / wb.starvationThreshold);
                this.applyDamage(wb.starvationHealthDrainPerMs * starvationPenalty * deltaTime);
            }
        } else {
            this._starvationElapsed = 0;
        }
    }

    // --- Need signal (player-facing bubble) ---

    maybeSignalNeeds() {
        const dialogue = this.myte.dialogue;
        if (!dialogue || !this.myte.queue.isEmpty() || this.myte.isDragging) return;

        const lastAiDecisionAge = SimClock.now() - (this.myte.ai?.lastDecisionTime ?? 0);
        const isBoredEnoughToComplain =
            this.getFunRatio() <= 0.28 &&
            lastAiDecisionAge >= SiteConfig.myte.needSignals.boredomDecisionAge;

        const signals = [
            {
                id: 'energy_low',
                condition: this.getEnergyRatio() <= (SiteConfig.myte.needSignals.energyLow / 100),
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
                condition: this.getComfortRatio() <= (SiteConfig.myte.needSignals.comfortLow / 100),
                text: 'cozy?',
                style: 'thought',
                expression: 'peek'
            },
            {
                id: 'satiety_low',
                condition: this.getSatietyRatio() <= 0.25,
                text: 'hungry...',
                style: 'thought',
                expression: 'peek'
            }
        ];

        const now = SimClock.now();
        const signal = signals.find(entry => {
            if (!entry.condition) return false;
            const lastTime = this.lastNeedSignalTimes[entry.id] ?? 0;
            return now - lastTime >= this.needSignalCooldown;
        });

        if (!signal) return;

        this.lastNeedSignalTimes[signal.id] = now;
        dialogue.showMessage(signal.text, signal.style);
        if (signal.expression) {
            this.myte.queue.addToFront('expression', { actionType: signal.expression, duration: 45, repeat: 1 });
        }
    }

    // --- Snapshot methods ---

    getNeedsSnapshot() {
        return {
            energy:  { value: this.energy,  max: this.maxEnergy,  ratio: this.getEnergyRatio() },
            satiety: { value: this.satiety, max: this.maxSatiety, ratio: this.getSatietyRatio() },
            fun:     { value: this.fun,     max: this.maxFun,     ratio: this.getFunRatio() },
            social:  { value: this.social,  max: this.maxSocial,  ratio: this.getSocialRatio() },
            comfort: { value: this.comfort, max: this.maxComfort, ratio: this.getComfortRatio() }
        };
    }

    getTraitsSnapshot() {
        const tier = this.confidence < 0.35 ? 'low' : this.confidence >= 0.70 ? 'high' : 'medium';
        return {
            curiosity:   this.traits.curiosity,
            activity:    this.traits.activity,
            sociability: this.traits.sociability,
            boldness:    this.traits.boldness,
            confidence:  { value: this.confidence, tier }
        };
    }

    // --- Energy management ---

    _getTimeOfDayEnergyMultiplier() {
        const hour = GameTime.instance?.getCurrentHour?.() ?? -1;
        if (hour < 0) return 1;
        return (hour >= 20 || hour < 5) ? 1.35 : 1;
    }

    _getBedRestRate() {
        const action = this.getCurrentAction();
        const actionConfig = action?.target?.getActionConfig?.('use_surface_slot', {}) ?? {};
        const benefit = actionConfig.benefit ?? 'energy';
        if (benefit !== 'energy') return this.energyRegenRate;
        const multiplier = action?.target?.getConfig?.('restEnergyRegenMultiplier', 1.0) ?? 1.0;
        return this.bedRestEnergyRegenRate * multiplier;
    }

    useEnergy(amount) {
        const previousEnergy = this.energy;
        this.energy = Utility.clamp(this.energy - amount, this.minEnergy, this.maxEnergy);

        if (previousEnergy > 0 && this.energy <= 0) {
            this.onEnergyDepleted();
        }

        const previousThresholdIndex = this.getThresholdIndex(previousEnergy);
        const currentThresholdIndex  = this.getThresholdIndex(this.energy);

        if (previousThresholdIndex !== currentThresholdIndex) {
            this.updateBatteryDisplay();
        }

        return this.energy > 0;
    }

    restoreEnergy(amount) {
        const previousEnergy = this.energy;
        this.energy = Utility.clamp(this.energy + amount, this.minEnergy, this.maxEnergy);

        if (this.energy > this.exhaustionRecoveryThreshold) {
            this.clearExhaustionEffects();
        }

        const previousThresholdIndex = this.getThresholdIndex(previousEnergy);
        const currentThresholdIndex  = this.getThresholdIndex(this.energy);

        if (previousThresholdIndex !== currentThresholdIndex) {
            this.updateBatteryDisplay();
        }

        this.maybeHandleEnergyFull(previousEnergy);
        return this.energy;
    }

    regenerateEnergy(delta, rate = null) {
        const effectiveRate = (rate ?? this.energyRegenRate) * this.getBuffMultiplier('stats.energyRegenMultiplier');
        const previousEnergy = this.energy;

        if (this.energy < this.maxEnergy) {
            const energyBefore = this.energy;
            this.energy = Utility.clamp(this.energy + (effectiveRate * delta), this.minEnergy, this.maxEnergy);

            const energyChange = this.energy - energyBefore;
            this.lastEnergyChange = delta > 0 ? (energyChange / delta) : 0;
            this.isRapidCharging = this.lastEnergyChange > this.rapidChargingThreshold;

            if (this.isRapidCharging && this.myte.battery) {
                this.clearManagedTimeout(this.batteryHideTimeout, 'batteryHideTimeout');
                this.clearManagedTimeout(this.chargingClassTimeout, 'chargingClassTimeout');
                this.myte.battery.classList.add('charging');
                this.showBattery();
            }

            if (this.energy > this.exhaustionRecoveryThreshold) {
                this.clearExhaustionEffects();
            }

            const previousThresholdIndex = this.getThresholdIndex(previousEnergy);
            const currentThresholdIndex  = this.getThresholdIndex(this.energy);

            if (previousThresholdIndex !== currentThresholdIndex) {
                this.updateBatteryDisplay();
            }

            this.maybeHandleEnergyFull(previousEnergy);
        } else {
            this.isRapidCharging = false;
        }

        if (!this.isRapidCharging && this.myte.battery && this.myte.battery.classList.contains('charging')) {
            this.clearManagedTimeout(this.chargingClassTimeout, 'chargingClassTimeout');
            this.chargingClassTimeout = this.setManagedTimeout(() => {
                this.myte.battery.classList.remove('charging');
                this.chargingClassTimeout = null;
                this.handleBatteryVisibility();
            }, 2000);
        }
    }

    onEnergyDepleted() {
        if (this.myte.battery) {
            this.myte.battery.classList.add('critical-pulse');
            this.showBattery();
        }
        this.playBatterySound(0);
        this.applyExhaustionEffects();
        this.myte.ai?.handleEnergyDepleted?.();
    }

    _rearmHealthDepletionIfRecovered() {
        if (this.health > 20) {
            this._healthDepletionArmed = true;
        }
    }

    onHealthDepleted() {
        this._healthDepletionArmed = false;
        this.myte.queue?.clear?.();
        this.myte.queue?.interrupt?.('expression', { actionType: 'faint' });
        this.myte.buffs?.syncContextBuff?.('health:recovering', 'recovering', { active: true });
        this.myte.setMode?.(MOVE_TYPES.GOHOME);
    }

    onEnergyFull() {
        const now = SimClock.now();
        if (this.hasAnnouncedFullCharge &&
            now - this.lastFullChargeAnnouncementAt < this.fullChargeAnnounceCooldown) {
            return;
        }

        this.hasAnnouncedFullCharge = true;
        this.lastFullChargeAnnouncementAt = now;

        if (this.myte.battery) {
            this.clearManagedTimeout(this.batteryHideTimeout, 'batteryHideTimeout');
            this.myte.battery.classList.add('charging');
            this.myte.battery.classList.remove('critical-pulse');
            this.showBattery();
            this.playBatterySound(this.batteryThresholds.length - 1);
            this.batteryHideTimeout = this.setManagedTimeout(() => {
                this.myte.battery.classList.remove('charging');
                this.hideBattery();
                this.batteryHideTimeout = null;
            }, 2000);
        }

        this.myte.buffs?.emitEvent?.('full_charge', { energy: this.energy });
    }

    maybeHandleEnergyFull(previousEnergy) {
        if (this.energy <= this.maxEnergy * this.fullChargeResetThreshold) {
            this.hasAnnouncedFullCharge = false;
        }
        if (previousEnergy < this.maxEnergy && this.energy >= this.maxEnergy) {
            this.onEnergyFull();
        }
    }

    applyExhaustionEffects()  { this.isExhausted = true; }

    clearExhaustionEffects() {
        if (!this.isExhausted) return;
        this.isExhausted = false;
        if (this.myte.battery && this.energy > 0) {
            this.myte.battery.classList.remove('critical-pulse');
        }
    }

    // --- Battery display ---

    getThresholdIndex(energyValue) {
        const energyPercentage = (energyValue / this.maxEnergy) * 100;
        if (energyValue === 0) return 0;
        for (let i = this.batteryThresholds.length - 1; i > 0; i--) {
            if (energyPercentage >= this.batteryThresholds[i].threshold) return i;
        }
        return 1;
    }

    applyBatteryLevelClasses(batteryElement, currentThresholdIndex, batteryStatus) {
        if (!batteryElement) return;
        this.batteryThresholds.forEach(threshold => batteryElement.classList.remove(threshold.name));
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

    updateBatteryDisplay() {
        if (!this.myte.battery && !this.myte.slotBattery) return;

        const currentThresholdIndex = this.getThresholdIndex(this.energy);
        const batteryStatus = this.batteryThresholds[currentThresholdIndex].name;

        if (currentThresholdIndex !== this.batteryLevel) {
            this.playBatterySound(currentThresholdIndex);
            this.batteryLevel = currentThresholdIndex;
            if (this.myte.battery) {
                this.applyBatteryLevelClasses(this.myte.battery, currentThresholdIndex, batteryStatus);
                this.showBattery();
                this.handleBatteryVisibility();
            }
        }

        if (currentThresholdIndex !== this._slotBatteryLevel) {
            this._slotBatteryLevel = currentThresholdIndex;
            this.syncSlotBatteryDisplay(currentThresholdIndex, batteryStatus);
        }

        if (this.isRapidCharging !== this._lastRapidCharging) {
            this._lastRapidCharging = this.isRapidCharging;
            if (this.myte.battery) {
                this.myte.battery.classList.toggle('rapid-charging', this.isRapidCharging);
            }
        }
    }

    playBatterySound(currentThresholdIndex) {
        if (!this.myte.isActive) return;
        const now = SimClock.now();
        let soundToPlay = null;

        if (this.energy <= 0)                        soundToPlay = 'battery_empty';
        else if (this.energy >= this.maxEnergy)      soundToPlay = 'battery_full';
        else if (this.batteryLevel >= 0 && currentThresholdIndex < this.batteryLevel) soundToPlay = 'battery_depleting';
        else if (this.batteryLevel >= 0 && currentThresholdIndex > this.batteryLevel) soundToPlay = 'battery_charging';

        if (soundToPlay) {
            const lastPlayed = this.lastSoundTime[soundToPlay] || 0;
            if (now - lastPlayed > this.soundCooldown) {
                this.myte.playSound(soundToPlay);
                this.lastSoundTime[soundToPlay] = now;
                this.lastBatterySound = soundToPlay;
            }
        }
    }

    showBattery() {
        if (!this.myte.battery) return;
        this.batteryVisible = true;
        this.myte.battery.classList.add('is-visible');
    }

    hideBattery() {
        if (!this.myte.battery) return;
        this.batteryVisible = false;
        this.myte.battery.classList.remove('is-visible');
    }

    handleBatteryVisibility() {
        if (!this.myte.battery) return;
        this.clearManagedTimeout(this.batteryHideTimeout, 'batteryHideTimeout');

        const level = this.batteryThresholds[this.batteryLevel];

        // Clear all level-based animation classes, then apply the current one
        for (const t of this.batteryThresholds) {
            if (t.animation) this.myte.battery.classList.remove(t.animation);
        }
        if (level.animation) this.myte.battery.classList.add(level.animation);

        if (level.hideDelay != null) {
            this.batteryHideTimeout = this.setManagedTimeout(() => {
                if (level.animation) this.myte.battery.classList.remove(level.animation);
                this.hideBattery();
                this.batteryHideTimeout = null;
            }, level.hideDelay);
        }
        // hideDelay === null → persist (empty/critical state — never auto-hides)
    }

    // --- Timeout management ---

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
            if (propertyName) this[propertyName] = null;
            return;
        }
        clearTimeout(timeoutId);
        this.pendingTimeouts.delete(timeoutId);
        if (propertyName) this[propertyName] = null;
    }

    // --- Action metadata helpers ---

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
        return actionId === 'sleep' || actionId === 'simple_sleep' || actionId === 'use_surface_slot';
    }

    _getExhaustionPenalty() {
        const ratio = this.getEnergyRatio();
        const threshold = SiteConfig.stats.exhaustionPenaltyThreshold;
        return ratio >= threshold ? 0 : 1 - (ratio / threshold);
    }

    getStatConditionEnergyMultiplier() {
        const cfg = SiteConfig.stats;
        const penalty = (1 - this.getSatietyRatio()) * cfg.satietyDrainScale
                      + (1 - this.getHealthRatio()) * cfg.healthDrainScale;
        const bonus = Math.max(0, this.getHealthRatio() - cfg.wellConditionedThreshold) * cfg.wellConditionedBonusScale;
        return 1 + penalty - bonus;
    }

    getEnergyActivityMultiplier() {
        const metadata = this.getCurrentActionMetadata();
        const actionId = metadata.id ?? this.getCurrentActionId();
        if (this.isRestingAction(actionId)) return 0;
        if (Number.isFinite(metadata.energyCostMultiplier)) return metadata.energyCostMultiplier;

        const category = metadata.category ?? '';
        const categoryFallbacks = {
            play: 1.6, reactive: 1.45, carrying: 1.3,
            movement: 1.2, social: 1.05, interactions: 0.95
        };
        return categoryFallbacks[category] ?? 1;
    }

    // --- Interaction timing ---

    canInteract()    { return SimClock.now() - this.lastInteractionTime >= this.interactionCooldown; }
    startInteraction() { this.lastInteractionTime = SimClock.now(); }

    // --- Main update ---

    update(deltaTime) {
        const timeOfDayMultiplier = this._getTimeOfDayEnergyMultiplier();

        const conditionMultiplier = this.getStatConditionEnergyMultiplier();
        const exhaustionPenalty   = this._getExhaustionPenalty();

        if (this.myte.isMoving()) {
            this.useEnergy(
                this.energyDecayRate *
                deltaTime *
                timeOfDayMultiplier *
                this.getEnergyActivityMultiplier() *
                conditionMultiplier *
                this.getBuffMultiplier('stats.energyDecayMultiplier')
            );
        } else if (this.isRestingAction()) {
            this.regenerateEnergy(deltaTime, this._getBedRestRate());
        } else {
            const actionId = this.getCurrentActionId();
            const isIdle = !actionId || actionId === 'idle';
            if (!isIdle) {
                this.useEnergy(
                    this.energyDecayRate *
                    SiteConfig.stats.actionEnergyDrainFactor *
                    deltaTime *
                    timeOfDayMultiplier *
                    this.getEnergyActivityMultiplier() *
                    conditionMultiplier *
                    this.getBuffMultiplier('stats.energyDecayMultiplier')
                );
            }
            // Idle standing is neutral — no regen, no drain.
            // Energy only recovers during explicit rest actions.
        }

        this._statDriveAccum += deltaTime;
        if (this._statDriveAccum >= this._statDriveTickInterval) {
            const dt = this._statDriveAccum;
            this._statDriveAccum = 0;
            this.applyContinuousBuffStatEffects(dt);
            this.updateBehaviorDrives(dt);
        }

        this.updateHealth(SiteConfig.stats.healthRegenRate * deltaTime);
        if (exhaustionPenalty > 0 && !this.isRestingAction()) {
            this.applyDamage(SiteConfig.stats.exhaustionCascade.healthDrainPerMs * exhaustionPenalty * deltaTime);
        }

        this._needSignalAccum += deltaTime;
        if (this._needSignalAccum >= 1000) {
            this._needSignalAccum = 0;
            this.maybeSignalNeeds();
        }
        this.updateBatteryDisplay();
        this.emitUiStateChange();
    }

    updateInHomeSlot(deltaTime) {
        this.regenerateEnergy(deltaTime, this.homeSlotEnergyRegenRate);

        this._statDriveAccum += deltaTime;
        if (this._statDriveAccum >= this._statDriveTickInterval) {
            const dt = this._statDriveAccum;
            this._statDriveAccum = 0;
            this.applyContinuousBuffStatEffects(dt);
            this.updateBehaviorDrives(dt * this.homeSlotBehaviorRateMultiplier, { suppressExhaustionCascade: true });
            const cfg = SiteConfig.stats;
            this.updateFun(cfg.homeSlotFunRestoreRate * dt);
            this.updateSocial(cfg.homeSlotSocialRestoreRate * dt);
            this.updateSatiety(cfg.homeSlotSatietyRestoreRate * dt);
            this.updateComfort(cfg.homeSlotComfortBoostRate * dt);
            this.applyConfidenceDelta(this.homeSlotConfidenceBoostRate * dt);
            this.updateHealth(cfg.homeSlotHealthRegenRate * dt);
        }
        this.updateBatteryDisplay();
        this.emitUiStateChange();
    }

    emitUiStateChange() {
        const stateKey = [
            this.health,
            this.energy,
            this.fun,
            this.social,
            this.satiety,
            this.comfort,
            this.confidence * 100
        ].map(value => Math.round(value)).join('|');
        if (stateKey === this._lastUiStateKey) return;
        this._lastUiStateKey = stateKey;
        this.myte.parent?.eventManager?.emit('myte:stats_changed', { myte: this.myte });
    }

    // --- Status ---

    getPersonalityDescription() {
        const desc = [];
        if (this.traits.sociability > 0.75) desc.push('Clingy');
        else if (this.traits.sociability < 0.25) desc.push('Reclusive');
        if (this.traits.activity > 0.75) desc.push('Frantic');
        else if (this.traits.activity < 0.25) desc.push('Lethargic');
        if (this.traits.curiosity > 0.75) desc.push('Obsessive');
        else if (this.traits.curiosity < 0.25) desc.push('Contented');
        if (this.traits.boldness > 0.75) desc.push('Reckless');
        else if (this.traits.boldness < 0.25) desc.push('Timid');
        return desc.join(' · ') || 'Balanced personality';
    }

    getStatus() {
        return {
            health: this.health,
            mood: this.getDerivedMood(),
            energy: { current: this.energy, max: this.maxEnergy },
            needs: {
                fun:     this.fun,
                social:  this.social,
                satiety: this.satiety,
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
        this.clearManagedTimeout(this.batteryHideTimeout, 'batteryHideTimeout');
        this.clearManagedTimeout(this.chargingClassTimeout, 'chargingClassTimeout');
        this.pendingTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
        this.pendingTimeouts.clear();
    }
}
