class MyteAI {
    constructor(myte) {
        this.myte = myte;

        const aiConfig = myte.definition?.ai || {};
        this.mode = this.resolveMode(aiConfig.defaultMode);
        this.enabled = aiConfig.enabled !== false;

        this.baseThinkInterval = aiConfig.thinkInterval ?? SiteConfig.ai.timing.baseThinkInterval;
        this.minThinkInterval = aiConfig.minThinkInterval ?? SiteConfig.ai.timing.minThinkInterval;
        this.maxThinkInterval = aiConfig.maxThinkInterval ?? SiteConfig.ai.timing.maxThinkInterval;
        this.wanderRadius = aiConfig.wanderRadius ?? SiteConfig.ai.radii.wander;
        this.safeAreaRadius = aiConfig.safeAreaRadius ?? aiConfig.homeRadius ?? SiteConfig.ai.radii.home;
        this.objectSearchRadius = aiConfig.objectSearchRadius ?? SiteConfig.ai.radii.objectSearch;
        this.socialRadius = aiConfig.socialRadius ?? SiteConfig.ai.radii.social;
        this.playRadius = aiConfig.playRadius ?? SiteConfig.ai.radii.play;
        this.homeComfortRadius = aiConfig.homeComfortRadius ?? SiteConfig.ai.radii.homeComfort;

        this.elapsedSinceThink = 0;
        this.lastDecisionLabel = null;
        this.lastDecisionTime = 0;
        this.lastDecisionTargetKey = null;
        this.decisionLockUntil = 0;

        this.recentHistory = [];
        this.objectMemories = new Map();
        this.memoryDuration = aiConfig.memoryDuration ?? SiteConfig.ai.timing.memoryDuration;
        this.targetCooldownDuration = aiConfig.targetCooldownDuration ?? SiteConfig.ai.timing.targetCooldownDuration;
        this.repeatWindow = aiConfig.repeatWindow ?? SiteConfig.ai.timing.repeatWindow;
        this.minCandidateScore = aiConfig.minCandidateScore ?? SiteConfig.ai.scoring.minCandidateScore;

        this.lastContextSnapshot = null;
        this.lastCandidateSnapshot = [];

        this._tickTime = 0;
        this._lastBubblePrefix = null;
        this._lastBubbleTime = -Infinity;
    }

    resolveMode(mode) {
        if (typeof mode === 'number') {
            return mode;
        }

        if (typeof mode === 'string') {
            const normalized = mode.trim().toUpperCase();
            if (Object.prototype.hasOwnProperty.call(MOVE_AUTONOMY_TYPES, normalized)) {
                return MOVE_AUTONOMY_TYPES[normalized];
            }
        }

        return DEFAULT_AUTONOMY_MODE;
    }

    setMode(mode) {
        this.mode = this.resolveMode(mode);
        this.resetThinking();
    }

    resetThinking() {
        this.elapsedSinceThink = 0;
    }

    tickUpdate(tickDelta) {
        this._tickTime++;

        if (!this.canPlan()) {
            this.resetThinking();
            return;
        }

        this.elapsedSinceThink += tickDelta;
        if (this.elapsedSinceThink < this.getThinkInterval()) {
            return;
        }

        this.elapsedSinceThink = 0;
        this.planNextAction();
    }

    canPlan() {
        return this.enabled &&
            this.myte.isActive &&
            this.myte.goal === MOVE_TYPES.FREEROAM &&
            !this.myte.isDragging &&
            SimClock.now() >= this.decisionLockUntil &&
            this.myte.queue.isEmpty();
    }

    setDecisionLock(durationMs = 0) {
        if (!Number.isFinite(durationMs) || durationMs <= 0) {
            return;
        }

        this.decisionLockUntil = Math.max(this.decisionLockUntil, SimClock.now() + durationMs);
    }

    getThinkInterval() {
        const timing = SiteConfig.ai.timing;
        const activity = this.myte.stats?.getTraitNormalized?.('activity') ?? 0.5;
        const funRatio = this.myte.stats?.getFunRatio?.() ?? 0.75;
        const energy = this.myte.stats?.getEnergyRatio?.() ?? 1;
        const activityModifier = timing.activityIntervalBase -
            (activity * timing.activityIntervalWeight) -
            ((1 - funRatio) * timing.boredomIntervalWeight);
        const energyModifier = energy < timing.lowEnergyThreshold
            ? timing.lowEnergyIntervalScale
            : 1;

        return Utility.clamp(
            this.baseThinkInterval * activityModifier * energyModifier,
            this.minThinkInterval,
            this.maxThinkInterval
        );
    }

    handleEnergyDepleted() {
        if (!this.enabled ||
            !this.myte?.isActive ||
            this.myte.goal !== MOVE_TYPES.FREEROAM ||
            this.myte.isDragging) {
            return false;
        }

        return this.executeSafeReturn(this.buildContext());
    }

    reactToOfferedFood(item) {
        // Food offered by the user is directed at the controlled myte; background
        // deployed mytes shouldn't intercept it (they still forage autonomously).
        if (!this.enabled || !this.myte.isActiveMyte || this.myte.isDragging) return false;
        if (this.myte.queue?.isCarrying?.() || this.myte.queue?.hasUserInitiatedAction?.()) return false;
        if (!item?.isUserOfferedFood?.()) return false;

        const eatDrive = 1 - (this.myte.stats?.getSatietyRatio?.() ?? 0.5);
        if (eatDrive < SiteConfig.ai.candidates.eat.minDrive) return false;

        const aiValues = this._getActionAiValues('eat_element');
        return this.enqueueTargetedAction('eat_element', item, {}, {
            label: 'eat:eat_element',
            category: aiValues.category,
            novelty: this.getNoveltyScore(item),
            soothing: aiValues.soothing,
            accomplishment: aiValues.accomplishment
        });
    }

    planNextAction() {
        this.pruneMemory();

        const context = this.buildContext();
        this._applyPerceptionEffects(context);
        const candidates = [
            this.buildSafeReturnCandidate(context),
            this.buildRestCandidate(context),
            this.buildEatCandidate(context),
            this.buildHomeComfortCandidate(context),
            this.buildSocialCandidate(context),
            this.buildPlayCandidate(context),
            this.buildDroppedItemCandidate(context),
            this.buildInteractionCandidate(context),
            this.buildWanderCandidate(context),
            this.buildIdleCandidate(context)
        ]
            .filter(candidate => candidate && candidate.score >= this.minCandidateScore)
            .sort((a, b) => b.score - a.score);

        this.lastContextSnapshot = this.buildDebugContextSnapshot(context);
        this.lastCandidateSnapshot = candidates.slice(0, 5).map(candidate => ({
            label: candidate.label,
            score: Number(candidate.score.toFixed(1))
        }));

        if (candidates.length === 0) {
            return;
        }

        const chosen = this.selectCandidate(candidates);
        chosen.execute();
        this.setDecisionLock(chosen.commitmentMs ?? 0);
        this.showNeedBubble(chosen);

        this.lastDecisionLabel = chosen.label;
        this.lastDecisionTime = SimClock.now();
        this.lastDecisionTargetKey = chosen.targetKey ?? null;
        this.myte.parent?.eventManager?.emit(EVENTS.MYTE_AI_DECISION_CHANGED, { myte: this.myte });
    }

    // Surface the winning drive as a thought bubble so the AI's choices are
    // legible. Repeats of the same drive are throttled; a drive *change* shows
    // immediately.
    showNeedBubble(candidate) {
        const cfg = SiteConfig.ai.needBubbles;
        const prefix = String(candidate.label ?? '').split(':')[0];
        const icon = cfg?.icons?.[prefix];
        if (!icon) return;

        const now = SimClock.now();
		if (prefix === this._lastBubblePrefix && (now - this._lastBubbleTime) < cfg.minIntervalMs) return;

		this._lastBubblePrefix = prefix;
		this._lastBubbleTime = now;
		this.myte.dialogue?.showIcon(icon, 'thought');
	}

    selectCandidate(candidates) {
        const bestScore = candidates[0]?.score ?? 0;
        const shortlist = candidates
            .filter(candidate => candidate.score >= bestScore - SiteConfig.ai.scoring.shortlistScoreWindow)
            .slice(0, 4);

        let chosen = shortlist[0] ?? candidates[0];
        let chosenRoll = -Infinity;

        for (const candidate of shortlist) {
            const { selectionJitterMin, selectionJitterMax } = SiteConfig.ai.scoring;
            const jitter = selectionJitterMin +
                (Math.random() * (selectionJitterMax - selectionJitterMin));
            const roll = candidate.score * jitter;
            if (roll > chosenRoll) {
                chosen = candidate;
                chosenRoll = roll;
            }
        }

        return chosen;
    }

    _buildNeedsSnapshot() {
        const stats = this.myte.stats;
        return {
            stats,
            energy:      stats?.getEnergyRatio?.()               ?? 1,
            health:      stats?.getHealthRatio?.()               ?? 1,
            fun:         stats?.getFunRatio?.()                  ?? 0.5,
            social:      stats?.getSocialRatio?.()               ?? 0.5,
            satiety:     stats?.getSatietyRatio?.()              ?? 0.5,
            comfort:     stats?.getComfortRatio?.()              ?? 0.7,
            confidence:  stats?.getConfidenceRatio?.()           ?? 0.5,
            activity:    stats?.getTraitNormalized?.('activity')    ?? 0.5,
            curiosity:   stats?.getTraitNormalized?.('curiosity')   ?? 0.5,
            sociability: stats?.getTraitNormalized?.('sociability') ?? 0.5,
            boldness:    stats?.getTraitNormalized?.('boldness')    ?? 0.5
        };
    }

    _computeDrives(needs, spatialContext) {
        const { fun, social, satiety, energy, comfort, confidence, activity, curiosity, sociability } = needs;
        const { distanceFromHome, nearbyObjects, isExhausted } = spatialContext;

        const energyModifier             = Math.max(0, energy);
        const exhaustionModifier         = isExhausted ? 2.0 : 1.0;
        const normalizedDistanceFromSafe = Utility.clamp(distanceFromHome / Math.max(this.safeAreaRadius, 1), 0, 1);

        const objectCount    = nearbyObjects?.length ?? 0;
        const unvisitedCount = nearbyObjects
            ? nearbyObjects.filter(obj => !this.objectMemories.has(this.getTargetKey(obj))).length
            : 0;
        const noveltyHunger         = objectCount > 0 ? unvisitedCount / objectCount : curiosity * 0.2;
        const effectiveNoveltyHunger = Math.max(curiosity * 0.2, noveltyHunger);

        const drives = {
            restDrive:    1 - energy,
            eatDrive:     1 - satiety,
            playDrive:    (1 - fun) * Math.max(0.15, curiosity * activity) * energyModifier,
            socialDrive:  ((1 - social) * (0.5 + sociability)) + (0.08 * sociability),
            exploreDrive: curiosity * effectiveNoveltyHunger * confidence * energyModifier,
            comfortDrive: 1 - comfort,
            safetyDrive:  (1 - confidence) * normalizedDistanceFromSafe * exhaustionModifier
        };

        const weights = this.myte?.definition?.ai?.driveWeights ?? {};
        for (const key of Object.keys(drives)) {
            drives[key] = Utility.clamp(drives[key] * (weights[key] ?? 1.0), 0, 1);
        }

        return drives;
    }

    buildContext() {
        const snapshot = this._buildNeedsSnapshot();
        const { stats, energy, health, fun, social, satiety, comfort, confidence, activity, curiosity, sociability } = snapshot;

        const nearbyMytes = this.getNearbyMytes(this.socialRadius);
        const nearbySocialMytes = this.getNearbyMytes(this.socialRadius, 'social');
        const nearbyObjects = this.getNearbyObjects(this.objectSearchRadius);
        const droppedItems = this.getNearbyDroppedItems(this.objectSearchRadius);
        const zoneManager = this.myte.parent?.gameMap?.zoneManager;
        const nearbyZones = zoneManager?.getNearbyZonesForMyte?.(this.myte, SiteConfig.ai.zoneSeeking.searchRadius) ?? [];
        const activeZones = zoneManager?.getActiveZonesForMyte?.(this.myte) ?? [];
        const timeData = this.myte.parent?.timeManager?.getTimeData?.() ?? {};
        const home = this.getHomePosition();
        const distanceFromHome = this.myte.getDistanceToPoint(home.x, home.y);
        const preferences = this.getAIPreferences();
        const nearbyLights = [];
        const nearbyActiveLights = [];
        const nearbyMusicSources = [];
        const nearbyActiveMusicSources = [];
        let hasScaryNearby = false;
        for (const target of nearbyObjects) {
            if (target?.getConfig?.('interaction.type') === 'light') {
                nearbyLights.push(target);
                if (target.isEnabled?.()) nearbyActiveLights.push(target);
            }
            if (target?.isMusicSource?.()) {
                nearbyMusicSources.push(target);
                if (target.isActiveMusicSource?.()) nearbyActiveMusicSources.push(target);
            }
            if ((target?.getAIMetadata?.()?.scaryStrength ?? 0) > 0) {
                hasScaryNearby = true;
            }
        }
        const ambientLightLevel = Utility.clamp(timeData.lightLevel ?? 1, 0, 1);
        const localLightLevel = Utility.clamp(ambientLightLevel + Math.min(nearbyActiveLights.length * 0.28, 0.6), 0, 1);

        const isExhausted = snapshot.stats?.isExhausted === true;
        const drives = this._computeDrives(snapshot, {
            distanceFromHome, nearbyObjects, isExhausted
        });

        const lightNeed = Utility.clamp(
            (0.45 - localLightLevel) / 0.45, 0, 1
        ) * (0.45 + (preferences.light * 0.55));
        const musicNeed = Utility.clamp(
            (preferences.music * 0.46) +
            ((1 - fun) * 0.32) +
            ((1 - (fun * 0.6 + social * 0.4)) * 0.18) -
            (nearbyActiveMusicSources.length > 0 ? 0.42 : 0),
            0, 1
        );

        return {
            stats,
            energy, health, fun, social, satiety, comfort, confidence,
            activity, curiosity, sociability,
            preferences,
            timeOfDay: timeData.timeOfDay ?? 'day',
            ambientLightLevel, localLightLevel,
            lightNeed, musicNeed,
            nearbyLights, nearbyActiveLights,
            nearbyMusicSources, nearbyActiveMusicSources,
            nearbyMytes, nearbySocialMytes, nearbyObjects, droppedItems,
            hasScaryNearby,
            nearbyZones, activeZones,
            activeZoneTypes: activeZones.map(zone => zone.type),
            home, distanceFromHome,
            getNoveltyScore: (target) => this.getNoveltyScore(target),
            drives
        };
    }

    _applyPerceptionEffects(context) {
        if (context.hasScaryNearby) {
            context.stats?.applyConfidenceDelta?.(-0.05);
        }
    }

    buildSafeReturnCandidate(context) {
        const cfg = SiteConfig.ai.candidates.safeReturn;
        if (context.energy > 0) {
            return null;
        }

        return {
            label: 'safe_return:go_home',
            targetKey: 'home',
            commitmentMs: cfg.commitmentMs,
            score: cfg.score,
            execute: () => {
                this.executeSafeReturn(context);
            }
        };
    }

    executeSafeReturn(context) {
        const cfg = SiteConfig.ai.candidates.safeReturn;
        const safeHome = this.findHomeComfortTarget(context?.home ?? this.getHomePosition());
        if (!safeHome) {
            return false;
        }

        const distanceToHome = this.myte.getDistanceToPoint(safeHome.x, safeHome.y);

        if (distanceToHome > cfg.moveThreshold) {
            this.myte.queue.interrupt('astar-move', { target: safeHome });
            this.setDecisionLock(cfg.commitmentMs);
            this.lastDecisionLabel = 'safe_return:go_home';
            this.lastDecisionTime = SimClock.now();
            this.lastDecisionTargetKey = 'home';
            return true;
        }

        this.myte.queue.clear();
        this.enqueueAction('sleep', { duration: cfg.sleepDuration }, {
            label: 'safe_return:sleep',
            category: 'rest',
            novelty: 0,
            soothing: 1,
            accomplishment: cfg.sleepAccomplishment
        });
        this.setDecisionLock(cfg.sleepCommitmentMs);
        this.lastDecisionLabel = 'safe_return:sleep';
        this.lastDecisionTime = SimClock.now();
        this.lastDecisionTargetKey = 'home';
        return true;
    }

    buildEatCandidate(context) {
        const cfg = SiteConfig.ai.candidates.eat;
        const offeredFoodTargets = context.droppedItems.filter(item => item?.isUserOfferedFood?.());
        const edibleObjects = this.getNearbyObjectsWithCapability(this.objectSearchRadius, 'edible');
        const foodTarget = this.findTargetWithAffordance(
            [...offeredFoodTargets, ...edibleObjects, ...context.droppedItems],
            'eat_element',
            context
        );
        if (!foodTarget) {
            return null;
        }

        const isUserOfferedFood = foodTarget?.isUserOfferedFood?.() === true;
        if (context.drives.eatDrive < cfg.minDrive && !isUserOfferedFood) {
            return null;
        }

        const distance = this.myte.getDistanceTo?.(foodTarget) ?? Infinity;
        let score = cfg.base +
            (context.drives.eatDrive * cfg.driveWeight) +
            Math.max(0, cfg.distanceFalloffRange - distance) * cfg.distanceFalloffRate;
        if (context.drives.eatDrive > cfg.urgentThreshold) score += cfg.urgentBonus;
        if (isUserOfferedFood) {
            const age = SimClock.now() - (foodTarget.droppedAt ?? 0);
            score += cfg.offeredBaseBonus +
                Math.max(0, cfg.offeredFreshnessWindowMs - age) * cfg.offeredFreshnessRate;
        }

        const label = 'eat:eat_element';
        const targetKey = this.getTargetKey(foodTarget);
        const aiValues = this._getActionAiValues('eat_element');

        return {
            label,
            targetKey,
            commitmentMs: aiValues.commitmentMs,
            score: this.applyRepeatPenalty(score, label, targetKey),
            execute: () => {
                this.enqueueTargetedAction('eat_element', foodTarget, {}, {
                    label,
                    category: aiValues.category,
                    novelty: this.getNoveltyScore(foodTarget),
                    soothing: aiValues.soothing,
                    accomplishment: aiValues.accomplishment
                });
            }
        };
    }

    getAIPreferences() {
        const preferences = this.myte.definition?.ai?.preferences ?? {};
        return {
            music: Utility.clamp(preferences.music ?? 0.5, 0, 1),
            light: Utility.clamp(preferences.light ?? 0.5, 0, 1),
            harvest: Utility.clamp(preferences.harvest ?? 0.5, 0, 1),
            coziness: Utility.clamp(preferences.coziness ?? 0.5, 0, 1)
        };
    }

    buildRestCandidate(context) {
        const cfg = SiteConfig.ai.candidates.rest;
        if (!context.stats) {
            return null;
        }

        const restThreshold = SiteConfig.stats.restEnergyThreshold;
        if ((context.stats.energy ?? 100) >= restThreshold) {
            return null;
        }

        const nearbySurface = this.findTargetWithAffordance(
            this.getNearbyObjectsWithCapability(this.objectSearchRadius, 'sittable'),
            'use_surface_slot',
            context
        )
            ?? (context.drives.restDrive > cfg.expandedSearchDriveThreshold
                ? this.findTargetWithAffordance(
                    this.getNearbyObjectsWithCapability(
                        this.objectSearchRadius * cfg.expandedSearchRadiusMultiplier,
                        'sittable'
                    ),
                    'use_surface_slot',
                    context
                )
                : null);
        let score = cfg.base +
            (context.drives.restDrive * cfg.driveWeight) +
            (context.drives.comfortDrive * cfg.comfortDriveWeight);
        if (this.mode === MOVE_AUTONOMY_TYPES.REST) score += cfg.modeBonus;
        if (context.distanceFromHome > this.homeComfortRadius) score += context.drives.safetyDrive * cfg.farFromHomeSafetyWeight;
        score += context.preferences.coziness * cfg.cozinessWeight;

        if (score < cfg.minScore) {
            return null;
        }

        const actionId = nearbySurface
            ? 'use_surface_slot'
            : (
                context.energy < cfg.emergencySleepEnergyThreshold || context.health < cfg.emergencySleepHealthThreshold
                    ? 'sleep'
                    : context.energy < cfg.simpleSleepEnergyThreshold
                        ? 'simple_sleep'
                        : 'idle'
            );
        const label = nearbySurface ? 'rest:surface' : `rest:${actionId}`;
        const targetKey = nearbySurface ? this.getTargetKey(nearbySurface) : null;
        const aiValues = this._getActionAiValues(actionId);

        return {
            label,
            targetKey,
            commitmentMs: nearbySurface ? cfg.surfaceCommitmentMs : cfg.fallbackCommitmentMs,
            score: this.applyRepeatPenalty(score, label, targetKey),
            execute: () => {
                if (nearbySurface && actionId === 'use_surface_slot') {
                    this.enqueueTargetedAction('use_surface_slot', nearbySurface, {}, {
                        label,
                        category: aiValues.category,
                        novelty: Math.max(cfg.surfaceNoveltyFloor, this.getNoveltyScore(nearbySurface) * cfg.surfaceNoveltyScale),
                        soothing: aiValues.soothing,
                        accomplishment: aiValues.accomplishment
                    });
                    return;
                }

                this.enqueueAction(actionId, actionId === 'idle' ? { duration: cfg.idleDuration } : {
                    duration: actionId === 'sleep' ? cfg.sleepDuration : cfg.simpleSleepDuration
                }, {
                    label,
                    category: aiValues.category,
                    novelty: cfg.actionNovelty,
                    soothing: aiValues.soothing,
                    accomplishment: aiValues.accomplishment
                });
            }
        };
    }

    buildHomeComfortCandidate(context) {
        const cfg = SiteConfig.ai.candidates.homeComfort;
        if (context.distanceFromHome <= this.homeComfortRadius || context.drives.safetyDrive < cfg.minSafetyDrive) {
            return null;
        }

        let score = cfg.base +
            (context.drives.safetyDrive * cfg.safetyDriveWeight) +
            (context.drives.comfortDrive * cfg.comfortDriveWeight) +
            (context.drives.restDrive * cfg.restDriveWeight);
        if (context.energy < cfg.lowEnergyThreshold) score += cfg.lowEnergyBonus;

        if (score < cfg.minScore) {
            return null;
        }

        return {
            label: 'home_comfort',
            targetKey: 'home',
            commitmentMs: cfg.commitmentMs,
            score: this.applyRepeatPenalty(score, 'home_comfort', 'home'),
            execute: () => {
                const safeHome = this.findHomeComfortTarget(context.home);
                if (safeHome) {
                    this.myte.queue.addAStarMove(safeHome);
                } else {
                    this.enqueueAction('idle', { duration: cfg.fallbackIdleDuration }, {
                        label: 'home_comfort:fallback',
                        category: 'idle',
                        novelty: cfg.fallbackNovelty
                    });
                }
            }
        };
    }

    buildSocialCandidate(context) {
        const cfg = SiteConfig.ai.candidates.social;
        if (!context.stats || context.nearbySocialMytes.length === 0) {
            return null;
        }

        // Phase 3: skip unknown Mytes when confidence is low
        const target = context.nearbySocialMytes.find(myte => {
            if (this.getAffordancesForTarget(myte, context).length === 0) return false;
            const key = this.getTargetKey(myte);
            const isKnown = this.objectMemories.has(key);
            return isKnown || context.confidence >= cfg.knownConfidenceThreshold;
        });
        if (!target) return null;

        let score = cfg.base + (context.drives.socialDrive * cfg.driveWeight);
        if (this.mode === MOVE_AUTONOMY_TYPES.SOCIAL) score += cfg.modeBonus;
        if (context.energy < cfg.lowEnergyThreshold) score -= cfg.lowEnergyPenalty;
        if (context.confidence < cfg.lowConfidenceThreshold) score -= cfg.lowConfidencePenalty;

        if (score < cfg.minScore) {
            return null;
        }
        const wantsPlay = context.drives.playDrive > cfg.playDriveThreshold &&
            context.energy > cfg.playEnergyThreshold &&
            context.drives.playDrive > cfg.secondaryPlayDriveThreshold;
        const preferredActionIds = wantsPlay
            ? ['high_five', 'play_tag']
            : (context.drives.comfortDrive > cfg.comfortDriveThreshold || context.sociability > cfg.sociabilityThreshold
                ? ['kiss', 'show_affection', 'greet']
                : ['high_five', 'greet']);
        const offeredActions = this.getAffordancesForTarget(target, context);
        const actionId = preferredActionIds.find(preferredActionId =>
            offeredActions.some(affordance => affordance.actionId === preferredActionId)
        ) ?? offeredActions[0]?.actionId;
        if (!actionId) return null;
        const label = `social:${actionId}`;
        const aiValues = this._getActionAiValues(actionId);

        return {
            label,
            targetKey: this.getTargetKey(target),
            commitmentMs: aiValues.commitmentMs,
            score: this.applyRepeatPenalty(score, label, this.getTargetKey(target)),
            execute: () => {
                this.enqueueTargetedAction(actionId, target, {}, {
                    label,
                    category: aiValues.category,
                    novelty: Math.max(cfg.noveltyFloor, this.getNoveltyScore(target) * cfg.noveltyScale),
                    social: 1,
                    accomplishment: aiValues.accomplishment,
                    exertion: aiValues.exertion
                });
            }
        };
    }

    buildPlayCandidate(context) {
        const cfg = SiteConfig.ai.candidates.play;
        const energyFloor = cfg.energyFloor;

        // Find any nearby object with play-category affordances — no hardcoded object types
        let targetPlayObj = null;
        let bestAffordance = null;
        for (const obj of context.nearbyObjects) {
            const playAffordances = this.getAffordancesForTarget(obj, context)
                .filter(a => this._getActionAiValues(a.actionId, a).category === 'play');
            if (playAffordances.length === 0) continue;
            targetPlayObj = obj;
            bestAffordance = this._selectAffordanceByExertion(playAffordances, context);
            break;
        }

        const hasPlayObject = targetPlayObj !== null;
        const playNeedFloor = hasPlayObject ? cfg.objectPlayNeedFloor : cfg.noObjectPlayNeedFloor;
        if (context.energy < energyFloor || context.drives.playDrive < playNeedFloor) {
            return null;
        }

        const playMomentum = Utility.clamp(
            (context.drives.playDrive * cfg.momentum.playDriveWeight) +
            (context.activity * cfg.momentum.activityWeight) +
            (context.energy * cfg.momentum.energyWeight),
            0, 1
        );
        let score = cfg.base + (context.drives.playDrive * cfg.driveWeight);
        score += context.activity * cfg.activityWeight;
        score -= context.drives.restDrive * cfg.restDrivePenaltyWeight;

        const funPressure = hasPlayObject && context.fun < cfg.funPressureThreshold
            ? (cfg.funPressureThreshold - context.fun) / cfg.funPressureThreshold
            : 0;
        score += funPressure * cfg.funPressureWeight;

        if (score < cfg.minScore) {
            return null;
        }

        let actionId, target, targetKey;
        if (bestAffordance && targetPlayObj) {
            actionId = bestAffordance.actionId;
            target = targetPlayObj;
            targetKey = this.getTargetKey(targetPlayObj);
        } else {
            const targetAnchor = this.getPlayAnchorTarget(context.nearbyObjects);
            if (targetAnchor && context.activity > cfg.anchorActivityThreshold) {
                actionId = 'run_laps';
                target = targetAnchor;
                targetKey = this.getTargetKey(targetAnchor);
            } else if (context.activity > cfg.zigzagActivityThreshold) {
                actionId = 'zigzag';
                target = null;
                targetKey = null;
            } else {
                actionId = 'circle';
                target = null;
                targetKey = null;
            }
        }

        const repeatPenaltyOptions = hasPlayObject
            ? {
                labelMultiplier: cfg.repeatPenalty.labelMultiplier,
                targetMultiplier: cfg.repeatPenalty.targetMultiplier,
                historyLabelPenaltyScale: cfg.repeatPenalty.historyLabelPenaltyScale,
                historyTargetPenaltyScale: cfg.repeatPenalty.historyTargetPenaltyScale,
                historyWindowMs: Math.min(this.repeatWindow, cfg.repeatPenalty.historyWindowCapMs)
            }
            : null;

        const continuingWithSameToy = targetKey &&
            this.lastDecisionTargetKey === targetKey &&
            this.lastDecisionLabel?.startsWith('play:') &&
            context.fun < cfg.continuingToyFunThreshold;
        if (continuingWithSameToy) score += cfg.continuingToyBonus;

        const label = `play:${actionId}`;
        const aiValues = this._getActionAiValues(actionId, bestAffordance);

        return {
            label,
            targetKey,
            commitmentMs: aiValues.commitmentMs,
            score: this.applyRepeatPenalty(score, label, targetKey, repeatPenaltyOptions),
            execute: () => {
                if (Math.random() < cfg.celebrationExpressionChance) {
                    this.myte.queue.addExpression('excited', cfg.celebrationExpressionDuration, 1);
                }
                if (Math.random() < cfg.jumpChance && context.energy > cfg.jumpEnergyThreshold) {
                    this.myte.queue.addJump();
                }
                this._executePlayAction(actionId, target, bestAffordance, context, playMomentum, funPressure);
            }
        };
    }

    _executePlayAction(actionId, target, affordance, context, playMomentum, funPressure) {
        const cfg = SiteConfig.ai.candidates.play;
        const aiValues = this._getActionAiValues(actionId, affordance);
        const memory = {
            label: `play:${actionId}`,
            category: 'play',
            novelty: target ? this.getNoveltyScore(target) : cfg.fallbackNovelty,
            accomplishment: aiValues.accomplishment,
            exertion: aiValues.exertion
        };

        if (actionId === 'nudge_ball' && target) {
            const baseRepeats = playMomentum > cfg.nudgeBall.highMomentumThreshold
                ? cfg.nudgeBall.highRepeatCount
                : (
                    playMomentum > cfg.nudgeBall.mediumMomentumThreshold
                        ? cfg.nudgeBall.mediumRepeatCount
                        : cfg.nudgeBall.lowRepeatCount
                );
            this.enqueueTargetedAction('nudge_ball', target, {
                repeat: funPressure > cfg.nudgeBall.extraRepeatFunPressureThreshold
                    ? Math.min(baseRepeats + 1, cfg.nudgeBall.maxRepeatCount)
                    : baseRepeats,
                postNudgeIdleDuration: cfg.nudgeBall.postNudgeIdleBaseDuration +
                    Math.round(context.activity * cfg.nudgeBall.postNudgeIdleActivityScale)
            }, memory);
            return;
        }

        if (actionId === 'play_fetch' && target) {
            this.enqueueTargetedAction('play_fetch', target, {
                roundTrips: Math.max(
                    cfg.playFetch.minRoundTrips,
                    Math.min(
                        cfg.playFetch.maxRoundTrips,
                        cfg.playFetch.minRoundTrips + Math.round(
                            (playMomentum * cfg.playFetch.momentumRoundTripWeight) +
                            (context.drives.playDrive * cfg.playFetch.playDriveRoundTripWeight)
                        )
                    )
                ),
                throwStrength: cfg.playFetch.throwStrengthBase +
                    Math.round(context.activity * cfg.playFetch.throwStrengthActivityScale)
            }, memory);
            return;
        }

        if (actionId === 'run_laps' && target) {
            this.enqueueTargetedAction('run_laps', target, {
                repeat: context.activity > cfg.runLaps.highActivityThreshold
                    ? cfg.runLaps.highActivityRepeatCount
                    : cfg.runLaps.normalRepeatCount
            }, memory);
            return;
        }

        if (target) {
            this.enqueueTargetedAction(actionId, target, {}, memory);
            return;
        }

        if (actionId === 'zigzag') {
            const angle = Math.random() * Math.PI * 2;
            this.enqueueAction('zigzag', {
                direction: { x: Math.cos(angle), y: Math.sin(angle) },
                amplitude: cfg.zigzag.amplitudeBase + Math.round(context.activity * cfg.zigzag.amplitudeActivityScale),
                duration: cfg.zigzag.durationBase + Math.round(context.activity * cfg.zigzag.durationActivityScale)
            }, memory);
            return;
        }

        this.enqueueAction('circle', {
            centerX: this.myte.posX,
            centerY: this.myte.posY,
            radius: cfg.circle.radiusBase + Math.round(context.activity * cfg.circle.radiusActivityScale),
            duration: cfg.circle.durationBase + Math.round(context.drives.playDrive * cfg.circle.durationPlayDriveScale)
        }, memory);
    }

    buildInteractionCandidate(context) {
        const cfg = SiteConfig.ai.candidates.interaction;
        if (this.mode === MOVE_AUTONOMY_TYPES.REST) {
            return null;
        }

        let best = null;

        for (const target of context.nearbyObjects) {
            const affordances = this.getAffordancesForTarget(target, context);
            for (const affordance of affordances) {
                const candidate = this.buildAffordanceCandidate(affordance, target, context);
                if (!candidate || (best && candidate.score <= best.score)) {
                    continue;
                }
                best = candidate;
            }
        }

        // If the winning affordance declares chain:true, queue all other nearby objects
        // that offer the same chainable affordance — no hardcoded object type checks.
        if (best?.affordance?.chain) {
            const chainActionId = best.affordance.actionId;
            const primaryKey = best.targetKey;
            const now = SimClock.now();
            const chainTargets = this._sortByDistance(
                context.nearbyObjects.filter(obj => {
                    const key = this.getTargetKey(obj);
                    if (key === primaryKey) return false;
                    if (!this.getAffordancesForTarget(obj, context).some(a => a.actionId === chainActionId && a.chain)) return false;
                    // Skip recently attempted targets (failed approaches re-try endlessly otherwise)
                    const mem = this.objectMemories.get(key);
                    if (mem && (now - mem.lastCompletedAt) < this.targetCooldownDuration) return false;
                    return true;
                })
            );
            if (chainTargets.length > 0) {
                const originalExecute = best.execute;
                best.commitmentMs = (best.commitmentMs ?? cfg.defaultCommitmentMs) +
                    chainTargets.length * cfg.chainCommitmentPerTargetMs;
                best.execute = () => {
                    originalExecute();
                    for (const chainTarget of chainTargets) {
                        const chainAiValues = this._getActionAiValues(chainActionId);
                        this.enqueueTargetedAction(chainActionId, chainTarget, { suppressPostEffects: true }, {
                            label: best.label,
                            category: chainAiValues.category,
                            novelty: this.getNoveltyScore(chainTarget),
                            soothing: chainAiValues.soothing,
                            accomplishment: chainAiValues.accomplishment,
                            exertion: chainAiValues.exertion
                        });
                    }
                };
            }
        }

        return best;
    }

    buildAffordanceCandidate(affordance, target, context) {
        // Phase 3: risk gate — skip if action risk exceeds confidence threshold
        const cfg = SiteConfig.ai.candidates.interaction;
        const actionDef = ActionDefinitionRegistry.getDefinitionSync(affordance.actionId);
        const actionRisk = actionDef?.risk ?? 0;
        if (actionRisk > context.confidence * cfg.riskConfidenceScale) return null;

        const distance = this.myte.getDistanceTo?.(target) ?? Infinity;
        const novelty = this.getNoveltyScore(target);
        const affordancePurpose = affordance.purpose ?? null;
        let score = cfg.base + Math.max(0, cfg.distanceFalloffRange - distance) * cfg.distanceFalloffRate;

        const aiValues = this._getActionAiValues(affordance.actionId, affordance);
        const drivers = aiValues.scoreDrivers ?? cfg.defaultScoreDrivers;
        for (const driver of drivers) {
            const val = driver.context === 'novelty'
                ? novelty
                : this._resolveContextPath(driver.context, context);
            score += val * driver.weight;
        }

        if (this.mode === MOVE_AUTONOMY_TYPES.INTERACT) {
            score += cfg.modeBonus;
        }

        const label = `interaction:${affordance.actionId}${affordancePurpose ? `:${affordancePurpose}` : ''}`;
        const targetKey = this.getTargetKey(target);
        score = this.applyRepeatPenalty(score, label, targetKey);

        if (score < cfg.minScore) {
            return null;
        }

        return {
            label,
            targetKey,
            affordance,
            commitmentMs: actionDef?.ai?.commitmentMs ?? cfg.defaultCommitmentMs,
            score,
            execute: () => {
                this.enqueueTargetedAction(affordance.actionId, target, {}, {
                    label,
                    category: aiValues.category,
                    novelty,
                    soothing: aiValues.soothing,
                    accomplishment: aiValues.accomplishment,
                    exertion: aiValues.exertion
                });
            }
        };
    }

    buildDroppedItemCandidate(context) {
        const cfg = SiteConfig.ai.candidates.droppedItem;
        if (context.droppedItems.length === 0) {
            return null;
        }

        let best = null;
        for (const item of context.droppedItems) {
            if (item.isUserOfferedFood?.()) {
                continue;
            }

            const distance = this.myte.getDistanceTo?.(item) ?? Infinity;
            let score = cfg.base +
                (context.curiosity * cfg.curiosityWeight) +
                (context.drives.exploreDrive * cfg.exploreDriveWeight) +
                Math.max(0, cfg.distanceFalloffRange - distance) * cfg.distanceFalloffRate;

            const age = SimClock.now() - (item.droppedAt ?? 0);
            if (age < cfg.freshnessWindowMs) score += cfg.freshnessBonus * (1 - age / cfg.freshnessWindowMs);

            const isEdible = item.getConfig?.('isEdible') ?? (item.type?.toLowerCase() === 'food');
            if (isEdible && context.drives.eatDrive > cfg.edibleDriveThreshold) {
                score += context.drives.eatDrive * cfg.edibleDriveWeight;
            }

            score = this.applyRepeatPenalty(score, `dropped_item:${item.type}`, `item:${item.id ?? item.variant ?? item.type}`);

            if (!best || score > best.score) {
                best = {
                    label: `dropped_item:${item.type}`,
                    targetKey: `item:${item.id ?? item.variant ?? item.type}`,
                    commitmentMs: cfg.commitmentMs,
                    score,
                    execute: () => {
                        item.allowAutoCollect = true;
                        this.myte.queue.addAStarMove({ x: item.posX, y: item.posY });
                    }
                };
            }
        }

        return best;
    }

    buildWanderCandidate(context) {
        const cfg = SiteConfig.ai.candidates.wander;
        const target = this.findWanderTarget(context);
        if (!target) {
            return null;
        }

        let score = cfg.base +
            (context.activity * cfg.activityWeight) +
            (context.curiosity * cfg.curiosityWeight) +
            (context.drives.playDrive * cfg.playDriveWeight);
        score += context.drives.playDrive * cfg.extraPlayDriveWeight;
        if (this.mode === MOVE_AUTONOMY_TYPES.WANDER) score += cfg.modeBonus;
        if (context.energy < cfg.lowEnergyThreshold) score -= cfg.lowEnergyPenalty;

        return {
            label: 'wander',
            targetKey: 'wander',
            commitmentMs: cfg.commitmentMs,
            score: this.applyRepeatPenalty(score, 'wander', 'wander'),
            execute: () => {
                if (context.energy > cfg.jumpEnergyThreshold && Math.random() < cfg.jumpChance) {
                    this.myte.queue.addJump();
                }

                this.myte.queue.addAStarMove(target);

                if (Math.random() < cfg.pauseChance) {
                    this.enqueueAction('idle', {
                        duration: cfg.pauseDurationBase + Math.round(context.comfort * cfg.pauseDurationComfortScale)
                    }, {
                        label: 'wander:pause',
                        category: 'idle',
                        novelty: cfg.pauseNovelty
                    });
                }
            }
        };
    }

    buildIdleCandidate(context) {
        const cfg = SiteConfig.ai.candidates.idle;
        return {
            label: 'idle',
            targetKey: 'idle',
            commitmentMs: cfg.commitmentMs,
            score: this.applyRepeatPenalty(
                cfg.base +
                ((1 - context.energy) * cfg.energyNeedWeight) +
                (context.drives.comfortDrive * cfg.comfortDriveWeight),
                'idle',
                'idle'
            ),
            execute: () => {
                const roll = Math.random();
                // Ramps from 0 → +0.25 over 6 s of continuous idle time, making a
                // bored/restless myte progressively more likely to express itself.
                const idleBonus = Math.min(
                    this.myte.stateMachine.getStateDuration() / cfg.idleBonusDurationMs,
                    cfg.idleBonusMax
                );
                // Expression chosen by current state so the pause reads as intentional
                if (context.energy < cfg.tiredExpressionEnergyThreshold && roll < cfg.tiredExpressionChance + idleBonus) {
                    this.myte.queue.addExpression('sleep', cfg.tiredExpressionDuration, 1);
                } else if (context.drives.socialDrive > cfg.socialExpressionDriveThreshold && roll < cfg.socialExpressionChance + idleBonus) {
                    this.myte.queue.addExpression('thought', cfg.socialExpressionDuration, 1);
                } else if (context.drives.playDrive > cfg.playExpressionDriveThreshold && roll < cfg.playExpressionChance + idleBonus) {
                    this.myte.queue.addExpression('surprise', cfg.playExpressionDuration, 1);
                }

                // Settle into a brief doze when tired; otherwise hold a proper deliberate pause
                if (context.energy < cfg.simpleSleepEnergyThreshold && Math.random() < cfg.simpleSleepChance) {
                    this.enqueueAction('simple_sleep', { duration: cfg.simpleSleepDuration }, {
                        label: 'idle',
                        category: 'rest',
                        novelty: cfg.actionNovelty,
                        soothing: cfg.actionSoothing
                    });
                } else {
                    this.enqueueAction('idle', {
                        duration: cfg.durationBase + Math.round(context.drives.comfortDrive * cfg.durationComfortScale)
                    }, {
                        label: 'idle',
                        category: 'idle',
                        novelty: cfg.actionNovelty
                    });
                }
            }
        };
    }

    applyRepeatPenalty(score, label, targetKey = null, options = {}) {
        options = (options != null && typeof options === 'object') ? options : {};
        let adjustedScore = score;
        const labelMultiplier = Number.isFinite(options.labelMultiplier)
            ? options.labelMultiplier
            : SiteConfig.ai.scoring.repeatLabelMultiplier;
        const targetMultiplier = Number.isFinite(options.targetMultiplier)
            ? options.targetMultiplier
            : SiteConfig.ai.scoring.repeatTargetMultiplier;
        const historyWindowMs = Number.isFinite(options.historyWindowMs) && options.historyWindowMs > 0
            ? options.historyWindowMs
            : this.repeatWindow;
        const historyLabelPenaltyScale = Number.isFinite(options.historyLabelPenaltyScale)
            ? options.historyLabelPenaltyScale
            : 1;
        const historyTargetPenaltyScale = Number.isFinite(options.historyTargetPenaltyScale)
            ? options.historyTargetPenaltyScale
            : 1;

        if (this.lastDecisionLabel === label) {
            const elapsed = SimClock.now() - this.lastDecisionTime;
            if (elapsed <= SiteConfig.ai.scoring.repeatLabelWindow) {
                adjustedScore *= labelMultiplier;
            }
        }

        if (targetKey && this.lastDecisionTargetKey === targetKey) {
            const elapsed = SimClock.now() - this.lastDecisionTime;
            if (elapsed <= SiteConfig.ai.scoring.repeatTargetWindow) {
                adjustedScore *= targetMultiplier;
            }
        }

        const now = SimClock.now();
        for (const entry of this.recentHistory) {
            const age = now - entry.time;
            if (age > historyWindowMs) {
                continue;
            }

            const ageFactor = 1 - (age / historyWindowMs);
            if (entry.label === label) {
                adjustedScore -= SiteConfig.ai.scoring.historyLabelPenalty * historyLabelPenaltyScale * ageFactor;
            }

            if (targetKey && entry.targetKey === targetKey) {
                adjustedScore -= SiteConfig.ai.scoring.historyTargetPenalty * historyTargetPenaltyScale * ageFactor;
            }
        }

        return adjustedScore;
    }

    enqueueAction(actionId, options = {}, memory = {}) {
        const originalOnComplete = options.onComplete;
        const label = memory.label ?? actionId;

        this.myte.queue.add(actionId, {
            ...options,
            onComplete: () => {
                if (typeof originalOnComplete === 'function') {
                    originalOnComplete();
                }

                this.rememberCompletedAction({
                    actionId,
                    label,
                    targetKey: null,
                    target: null,
                    category: memory.category ?? 'idle',
                    novelty: memory.novelty ?? 0.2,
                    soothing: memory.soothing ?? 0,
                    social: memory.social ?? 0,
                    accomplishment: memory.accomplishment ?? 0,
                    exertion: memory.exertion ?? 0
                });
            }
        });
    }

    enqueueTargetedAction(actionId, target, overrides = {}, memory = {}) {
        const resolvedOptions = ActionManager.getActionOptions(actionId, target, this.myte);
        if (!resolvedOptions) {
            return false;
        }

        const originalOnComplete = resolvedOptions.onComplete;
        const targetKey = this.getTargetKey(target);
        const label = memory.label ?? `${actionId}:${targetKey}`;

        this.myte.queue.add(actionId, {
            ...resolvedOptions,
            ...overrides,
            onComplete: () => {
                if (typeof originalOnComplete === 'function') {
                    originalOnComplete();
                }

                this.rememberCompletedAction({
                    actionId,
                    label,
                    targetKey,
                    target,
                    category: memory.category ?? 'world',
                    novelty: memory.novelty ?? this.getNoveltyScore(target),
                    soothing: memory.soothing ?? 0,
                    social: memory.social ?? 0,
                    accomplishment: memory.accomplishment ?? 0,
                    exertion: memory.exertion ?? 0
                });
            }
        });

        return true;
    }

    rememberCompletedAction(entry) {
        const now = SimClock.now();
        this.recentHistory.push({
            label: entry.label,
            targetKey: entry.targetKey,
            time: now
        });

        if (entry.targetKey) {
            const memory = this.objectMemories.get(entry.targetKey) ?? {
                completedCount: 0,
                lastCompletedAt: 0,
                lastActionId: null
            };
            memory.completedCount++;
            memory.lastCompletedAt = now;
            memory.lastActionId = entry.actionId;
            this.objectMemories.set(entry.targetKey, memory);
        }

        this.myte.stats?.noteBehavior?.({
            category: entry.category,
            novelty: entry.novelty,
            soothing: entry.soothing,
            social: entry.social,
            accomplishment: entry.accomplishment,
            exertion: entry.exertion
        });
        this.myte.stats?.awardExperience?.(entry);

        this.pruneMemory();
    }

    pruneMemory() {
        const now = SimClock.now();
        this.recentHistory = this.recentHistory.filter(entry => now - entry.time <= this.memoryDuration);

        for (const [key, memory] of this.objectMemories.entries()) {
            if (now - (memory.lastCompletedAt ?? 0) > this.memoryDuration) {
                this.objectMemories.delete(key);
            }
        }
    }

    _sortByDistance(items) {
        return items
            .map(item => ({ item, d: this.myte.getDistanceTo(item) }))
            .sort((a, b) => a.d - b.d)
            .map(entry => entry.item);
    }

    getNearbyMytes(radius, capability = null) {
        if (this._nearbyMytesCacheTime !== this._tickTime) {
            this._nearbyMytesCacheTime = this._tickTime;
            this._nearbyMytesCache = new Map();
        }
        const cacheKey = `${radius}|${capability ?? ''}`;
        if (this._nearbyMytesCache.has(cacheKey)) return this._nearbyMytesCache.get(cacheKey);
        const worldQuery = this.myte.parent?.gameMap?.worldQuery;
        const result = worldQuery?.findNearby({
            x: this.myte.posX,
            y: this.myte.posY,
            radius,
            kind: WORLD_ENTITY_KINDS.MYTE,
            capability,
            exclude: this.myte
        }) ?? [];
        this._nearbyMytesCache.set(cacheKey, result);
        return result;
    }

    getNearbyObjectsWithCapability(radius, capability) {
        const worldQuery = this.myte.parent?.gameMap?.worldQuery;
        return worldQuery?.findNearby({
            x: this.myte.posX,
            y: this.myte.posY,
            radius,
            kind: WORLD_ENTITY_KINDS.OBJECT,
            capability
        }) ?? [];
    }

    getNearbyObjects(radius) {
        if (this._nearbyObjectsCache && this._nearbyObjectsRadius === radius &&
            this._nearbyObjectsTime === this._tickTime) {
            return this._nearbyObjectsCache;
        }

        const worldQuery = this.myte.parent?.gameMap?.worldQuery;
        const result = worldQuery?.findNearby({
            x: this.myte.posX,
            y: this.myte.posY,
            radius,
            kind: WORLD_ENTITY_KINDS.OBJECT
        }) ?? [];
        this._nearbyObjectsCache = result;
        this._nearbyObjectsRadius = radius;
        this._nearbyObjectsTime = this._tickTime;
        return result;
    }

    getNearbyDroppedItems(radius) {
        if (this._nearbyItemsCache && this._nearbyItemsRadius === radius &&
            this._nearbyItemsTime === this._tickTime) {
            return this._nearbyItemsCache;
        }
        const worldQuery = this.myte.parent?.gameMap?.worldQuery;
        const result = worldQuery?.findNearby({
            x: this.myte.posX,
            y: this.myte.posY,
            radius,
            kind: WORLD_ENTITY_KINDS.ITEM
        }) ?? [];
        this._nearbyItemsCache = result;
        this._nearbyItemsRadius = radius;
        this._nearbyItemsTime = this._tickTime;
        return result;
    }

    getAffordancesForTarget(target, context) {
        return target?.getAiAffordances?.(context, this.myte) ?? [];
    }

    getPlayAnchorTarget(targets) {
        return targets.find(target =>
            target &&
            target.element &&
            target.getConfig?.('interaction.type') !== 'teleport'
        ) ?? null;
    }

    findTargetWithAffordance(targets, actionId, context, predicate = null) {
        return targets.find(target => this.getAffordancesForTarget(target, context).some(affordance =>
            affordance.actionId === actionId &&
            (typeof predicate !== 'function' || predicate(affordance, target))
        )) ?? null;
    }

    findHomeComfortTarget(home = this.getHomePosition()) {
        const gridSystem = this.myte.parent?.gameMap?.gridSystem;
        return gridSystem?.findNearestValidPositionForEntity?.(
            this.myte,
            home.x,
            home.y,
            SiteConfig.ai.wander.homeTargetSnapRadius
        ) ?? home;
    }

    getWanderBounds(worldBounds) {
        if (!worldBounds) {
            return null;
        }

        const gridSystem = this.myte.parent?.gameMap?.gridSystem;
        const cellSize = gridSystem?.config?.cellSize ?? 32;
        // Keep mytes well away from the map edge — 3 cells minimum so they don't try to
        // path into border colliders or visually hug the wall.
        const paddingX = cellSize * SiteConfig.ai.wander.edgePaddingCells;
        const paddingY = cellSize * SiteConfig.ai.wander.edgePaddingCells;
        const left = worldBounds.left + paddingX;
        const top = worldBounds.top + paddingY;
        const right = worldBounds.right - this.myte.size.width - paddingX;
        const bottom = worldBounds.bottom - this.myte.size.height - paddingY;

        if (right < left || bottom < top) {
            return null;
        }

        return { left, top, right, bottom };
    }

    isWithinWanderBounds(target, bounds) {
        if (!target) {
            return false;
        }

        if (!bounds) {
            return Number.isFinite(target.x) && Number.isFinite(target.y);
        }

        return target.x >= bounds.left &&
            target.x <= bounds.right &&
            target.y >= bounds.top &&
            target.y <= bounds.bottom;
    }

    findWanderTarget(context = null) {
        const worldBounds = this.myte.parent?.getWorldBounds?.();
        if (!worldBounds) {
            return null;
        }

        const localContext = context ?? this.buildContext();
        const gridSystem = this.myte.parent?.gameMap?.gridSystem;
        const wanderBounds = this.getWanderBounds(worldBounds);
        const curiosityWander = this.findCuriosityWanderTarget(localContext);
        if (this.isWithinWanderBounds(curiosityWander, wanderBounds)) {
            return curiosityWander;
        }

        const origin = this.mode === MOVE_AUTONOMY_TYPES.WANDER
            ? { x: this.myte.posX, y: this.myte.posY }
            : localContext.home;
        const wanderConfig = SiteConfig.ai.wander;
        const confidence = localContext?.confidence ?? wanderConfig.defaultConfidence;
        const confidenceRadius = this.safeAreaRadius * (
            wanderConfig.confidenceRadiusBase +
            confidence * wanderConfig.confidenceRadiusWeight
        );
        const maxRadius = this.mode === MOVE_AUTONOMY_TYPES.WANDER
            ? this.wanderRadius
            : confidenceRadius;
        const safeOrigin = gridSystem?.findNearestValidPositionForEntity?.(
            this.myte,
            origin.x,
            origin.y,
            wanderConfig.originSnapRadius
        ) ?? origin;

        const cellSize = gridSystem?.config?.cellSize ?? 32;
        // Minimum distance: 4 cells. Shorter hops look jittery and random.
        const minWanderDist = cellSize * wanderConfig.minDistanceCells;

        for (let attempt = 0; attempt < wanderConfig.targetAttempts; attempt++) {
            const angle = Math.random() * Math.PI * 2;
            const distance = minWanderDist + Math.random() * maxRadius;
            const candidate = {
                x: safeOrigin.x + Math.cos(angle) * distance,
                y: safeOrigin.y + Math.sin(angle) * distance
            };

            if (!this.isWithinWanderBounds(candidate, wanderBounds)) {
                continue;
            }

            // Snap radius of 16 gives a wider berth from collider edges than 8
            const safe = gridSystem?.findNearestValidPositionForEntity?.(
                this.myte,
                candidate.x,
                candidate.y,
                wanderConfig.candidateSnapRadius
            );

            if (safe &&
                this.isWithinWanderBounds(safe, wanderBounds) &&
                this.myte.canMoveToPosition(safe.x, safe.y)) {
                return safe;
            }
        }

        return this.isWithinWanderBounds(safeOrigin, wanderBounds) &&
            this.myte.canMoveToPosition(safeOrigin.x, safeOrigin.y)
            ? safeOrigin
            : null;
    }

    findCuriosityWanderTarget(context) {
        const wanderConfig = SiteConfig.ai.wander;
        if (context.drives.playDrive < wanderConfig.curiosityPlayThreshold &&
            context.curiosity < wanderConfig.curiosityTraitThreshold) {
            return null;
        }

        const interestingTarget = context.nearbyObjects
            .filter(target => target?.canBeInspectedByAi?.())
            .sort((a, b) => this.getNoveltyScore(b) - this.getNoveltyScore(a))[0];

        if (!interestingTarget || this.getNoveltyScore(interestingTarget) < wanderConfig.noveltyThreshold) {
            return null;
        }

        const center = interestingTarget.getCenterPoint?.() ?? {
            x: interestingTarget.posX + ((interestingTarget.size?.width ?? 0) / 2),
            y: interestingTarget.posY + ((interestingTarget.size?.height ?? 0) / 2)
        };

        return this.myte.parent?.gameMap?.gridSystem?.findNearestValidPositionForEntity?.(
            this.myte,
            center.x - (this.myte.size.width / 2),
            center.y - (this.myte.size.height / 2),
            wanderConfig.curiositySnapRadius
        ) ?? null;
    }

    getTargetKey(target) {
        if (!target) return null;
        const stableId = target.worldId ?? target.id;
        if (stableId == null) {
            if (Utility.isDebugEnabled()) {
                throw new Error('[MyteAI] Queryable targets require a stable id.');
            }
            return null;
        }
        return `${target.type ?? target.constructor?.name ?? 'target'}:${stableId}`;
    }

    getNoveltyScore(target) {
        const targetKey = this.getTargetKey(target);
        if (!targetKey) return 0.4;

        const memory = this.objectMemories.get(targetKey);
        if (!memory) return 1;

        const profile = target?.getConfig?.('ai.noveltyProfile') ?? {};
        const cooldownMin = profile.cooldownMin ?? 0;
        const cooldownMultiplier = profile.cooldownMultiplier ?? 1;
        const cooldownDuration = Math.max(cooldownMin, this.targetCooldownDuration * cooldownMultiplier);
        const elapsed = SimClock.now() - (memory.lastCompletedAt ?? 0);
        const recencyFloor = profile.recencyFloor ?? 0.1;
        const recency = elapsed >= cooldownDuration
            ? 1
            : Utility.clamp(elapsed / cooldownDuration, recencyFloor, 1);
        const familiarityPenalty = Math.min(
            memory.completedCount * (profile.familiarityRate ?? 0.08),
            profile.familiarityCap ?? 0.34
        );
        const noveltyBase  = profile.noveltyBase  ?? 0.55;
        const noveltyRange = profile.noveltyRange ?? 0.45;
        const noveltyFloor = profile.noveltyFloor ?? 0.12;

        return Utility.clamp(noveltyBase + (recency * noveltyRange) - familiarityPenalty, noveltyFloor, 1);
    }

    _getActionAiValues(actionId, affordance = null) {
        const cfg = SiteConfig.ai.candidates.interaction;
        const def = ActionDefinitionRegistry.getDefinitionSync(actionId);
        const defAi = def?.ai ?? {};
        const overrideAi = def?.purposeOverrides?.[affordance?.purpose]?.ai ?? {};
        return {
            category:       overrideAi.category       ?? defAi.category       ?? 'world',
            soothing:       overrideAi.soothing        ?? defAi.soothing        ?? 0.1,
            exertion:       overrideAi.exertion        ?? defAi.exertion        ?? 0.1,
            accomplishment: overrideAi.accomplishment  ?? defAi.accomplishment  ?? 0.1,
            commitmentMs:   defAi.commitmentMs ?? cfg.defaultCommitmentMs,
            scoreDrivers:   overrideAi.scoreDrivers ?? defAi.scoreDrivers ?? null
        };
    }

    _resolveContextPath(path, ctx) {
        const parts = path.split('.');
        let value = ctx;
        for (const part of parts) {
            if (value == null || typeof value !== 'object') return 0;
            value = value[part];
        }
        return typeof value === 'number' ? value : 0;
    }

    _selectAffordanceByExertion(affordances, context) {
        if (affordances.length === 1) return affordances[0];
        const targetExertion = context.activity * 0.7 + context.energy * 0.3;
        let best = affordances[0];
        let bestDiff = Math.abs(this._getActionAiValues(best.actionId, best).exertion - targetExertion);
        for (const affordance of affordances) {
            const diff = Math.abs(this._getActionAiValues(affordance.actionId, affordance).exertion - targetExertion);
            if (diff < bestDiff) {
                best = affordance;
                bestDiff = diff;
            }
        }
        return best;
    }

    getHomePosition() {
        return this.myte.getHomePosition();
    }

    buildDebugContextSnapshot(context) {
        return {
            energy:     Number(context.energy.toFixed(2)),
            health:     Number(context.health.toFixed(2)),
            fun:        Number(context.fun.toFixed(2)),
            social:     Number(context.social.toFixed(2)),
            satiety:    Number(context.satiety.toFixed(2)),
            comfort:    Number(context.comfort.toFixed(2)),
            confidence: Number(context.confidence.toFixed(2)),
            localLightLevel: Number(context.localLightLevel.toFixed(2)),
            lightNeed:  Number(context.lightNeed.toFixed(2)),
            musicNeed:  Number(context.musicNeed.toFixed(2)),
            drives: {
                restDrive:    Number(context.drives.restDrive.toFixed(2)),
                eatDrive:     Number(context.drives.eatDrive.toFixed(2)),
                playDrive:    Number(context.drives.playDrive.toFixed(2)),
                socialDrive:  Number(context.drives.socialDrive.toFixed(2)),
                exploreDrive: Number(context.drives.exploreDrive.toFixed(2)),
                comfortDrive: Number(context.drives.comfortDrive.toFixed(2)),
                safetyDrive:  Number(context.drives.safetyDrive.toFixed(2))
            },
            nearbyMytes:  context.nearbyMytes.length,
            nearbyObjects: context.nearbyObjects.length,
            nearbyZones:  context.nearbyZones.length,
            activeZones:  context.activeZoneTypes,
            nearbyActiveMusicSources: context.nearbyActiveMusicSources.length
        };
    }

    getNeedsSnapshot({ live = false } = {}) {
        const snapshot = live
            ? this.buildDebugContextSnapshot(this.buildContext())
            : (this.lastContextSnapshot ?? this.buildDebugContextSnapshot(this.buildContext()));

        const drives = snapshot?.drives ?? {};
        const entries = [
            { id: 'socialDrive',  label: 'Social',   value: drives.socialDrive  ?? 0 },
            { id: 'playDrive',    label: 'Play',      value: drives.playDrive    ?? 0 },
            { id: 'exploreDrive', label: 'Explore',   value: drives.exploreDrive ?? 0 },
            { id: 'comfortDrive', label: 'Comfort',   value: drives.comfortDrive ?? 0 },
            { id: 'safetyDrive',  label: 'Safety',    value: drives.safetyDrive  ?? 0 },
            { id: 'restDrive',    label: 'Rest',      value: drives.restDrive    ?? 0 },
            { id: 'eatDrive',     label: 'Eat',       value: drives.eatDrive     ?? 0 }
        ].map(entry => ({
            ...entry,
            value: Utility.clamp(entry.value, 0, 1),
            percent: Math.round(Utility.clamp(entry.value, 0, 1) * 100)
        }));

        const topNeed = [...entries].sort((a, b) => b.value - a.value)[0] ?? null;

        return {
            needs: entries,
            topNeed,
            vitals: {
                energy:     Math.round((snapshot?.energy     ?? 0) * 100),
                health:     Math.round((snapshot?.health     ?? 0) * 100),
                fun:        Math.round((snapshot?.fun        ?? 0) * 100),
                social:     Math.round((snapshot?.social     ?? 0) * 100),
                satiety:    Math.round((snapshot?.satiety    ?? 0) * 100),
                comfort:    Math.round((snapshot?.comfort    ?? 0) * 100),
                confidence: Math.round((snapshot?.confidence ?? 0) * 100)
            },
            environment: {
                light:     Math.round((snapshot?.localLightLevel ?? 0) * 100),
                lightNeed: Math.round((snapshot?.lightNeed       ?? 0) * 100),
                musicNeed: Math.round((snapshot?.musicNeed       ?? 0) * 100)
            },
            lastDecisionLabel: this.lastDecisionLabel
        };
    }

    getDrivesSnapshot({ live = false } = {}) {
        const snapshot = live
            ? this.buildDebugContextSnapshot(this.buildContext())
            : (this.lastContextSnapshot ?? this.buildDebugContextSnapshot(this.buildContext()));

        const drives = snapshot?.drives ?? {};
        return {
            restDrive:    Utility.clamp(drives.restDrive    ?? 0, 0, 1),
            eatDrive:     Utility.clamp(drives.eatDrive     ?? 0, 0, 1),
            playDrive:    Utility.clamp(drives.playDrive    ?? 0, 0, 1),
            socialDrive:  Utility.clamp(drives.socialDrive  ?? 0, 0, 1),
            exploreDrive: Utility.clamp(drives.exploreDrive ?? 0, 0, 1),
            comfortDrive: Utility.clamp(drives.comfortDrive ?? 0, 0, 1),
            safetyDrive:  Utility.clamp(drives.safetyDrive  ?? 0, 0, 1)
        };
    }

    getPressuresSnapshot({ live = false } = {}) {
        const snapshot = live
            ? this.buildDebugContextSnapshot(this.buildContext())
            : (this.lastContextSnapshot ?? this.buildDebugContextSnapshot(this.buildContext()));

        const drives = snapshot?.drives ?? {};
        const driveValues = Object.values(drives).filter(v => typeof v === 'number');
        const maxPressure = Math.max(...driveValues, 0);
        const dominantDrive = Object.entries(drives)
            .sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

        return {
            drives,
            dominantDrive,
            maxPressure: Utility.clamp(maxPressure, 0, 1),
            isUrgent: maxPressure > 0.75
        };
    }

    getDebugState() {
        return {
            mode: this.mode,
            lastDecisionLabel: this.lastDecisionLabel,
            lastDecisionTime: this.lastDecisionTime,
            context: this.lastContextSnapshot,
            candidates: this.lastCandidateSnapshot
        };
    }
}
