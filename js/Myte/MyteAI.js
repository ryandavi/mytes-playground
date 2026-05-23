class MyteAI {
    constructor(myte) {
        this.myte = myte;

        const aiConfig = myte.definition?.ai || {};
        this.mode = this.resolveMode(aiConfig.defaultMode);
        this.enabled = aiConfig.enabled !== false;

        this.baseThinkInterval = aiConfig.thinkInterval ?? 900;
        this.minThinkInterval = aiConfig.minThinkInterval ?? 450;
        this.maxThinkInterval = aiConfig.maxThinkInterval ?? 1800;
        this.wanderRadius = aiConfig.wanderRadius ?? 220;
        this.homeRadius = aiConfig.homeRadius ?? 320;
        this.objectSearchRadius = aiConfig.objectSearchRadius ?? 280;
        this.socialRadius = aiConfig.socialRadius ?? 240;
        this.playRadius = aiConfig.playRadius ?? 220;
        this.homeComfortRadius = aiConfig.homeComfortRadius ?? 140;

        this.elapsedSinceThink = 0;
        this.lastDecisionLabel = null;
        this.lastDecisionTime = 0;
        this.lastDecisionTargetKey = null;
        this.decisionLockUntil = 0;

        this.recentHistory = [];
        this.objectMemories = new Map();
        this.memoryDuration = aiConfig.memoryDuration ?? 120000;
        this.targetCooldownDuration = aiConfig.targetCooldownDuration ?? 30000;
        this.repeatWindow = aiConfig.repeatWindow ?? 90000;
        this.minCandidateScore = aiConfig.minCandidateScore ?? 12;

        this.lastContextSnapshot = null;
        this.lastCandidateSnapshot = [];

        this._tickTime = 0;
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
            Date.now() >= this.decisionLockUntil &&
            this.myte.queue.isEmpty();
    }

    setDecisionLock(durationMs = 0) {
        if (!Number.isFinite(durationMs) || durationMs <= 0) {
            return;
        }

        this.decisionLockUntil = Math.max(this.decisionLockUntil, Date.now() + durationMs);
    }

    getThinkInterval() {
        const activity = this.myte.stats?.getTraitNormalized?.('activity') ?? 0.5;
        const boredom = this.myte.stats?.getBoredomRatio?.() ?? 0.25;
        const energy = this.myte.stats?.getEnergyRatio?.() ?? 1;
        const activityModifier = 1.24 - (activity * 0.42) - (boredom * 0.18);
        const energyModifier = energy < 0.3 ? 1.22 : 1;

        return Utility.clamp(
            this.baseThinkInterval * activityModifier * energyModifier,
            this.minThinkInterval,
            this.maxThinkInterval
        );
    }

    planNextAction() {
        this.pruneMemory();

        const context = this.buildContext();
        const candidates = [
            this.buildRestCandidate(context),
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

        this.lastDecisionLabel = chosen.label;
        this.lastDecisionTime = Date.now();
        this.lastDecisionTargetKey = chosen.targetKey ?? null;
    }

    selectCandidate(candidates) {
        const bestScore = candidates[0]?.score ?? 0;
        const shortlist = candidates
            .filter(candidate => candidate.score >= bestScore - 12)
            .slice(0, 4);

        let chosen = shortlist[0] ?? candidates[0];
        let chosenRoll = -Infinity;

        for (const candidate of shortlist) {
            const roll = candidate.score * (0.9 + (Math.random() * 0.2));
            if (roll > chosenRoll) {
                chosen = candidate;
                chosenRoll = roll;
            }
        }

        return chosen;
    }

    buildContext() {
        const stats = this.myte.stats;
        const energy = stats?.getEnergyRatio?.() ?? 1;
        const health = stats?.getHealthRatio?.() ?? 1;
        const mood = stats?.getMoodRatio?.() ?? 1;
        const boredom = stats?.getBoredomRatio?.() ?? 0.25;
        const comfort = stats?.getComfortRatio?.() ?? 0.7;
        const confidence = stats?.getConfidenceRatio?.() ?? 0.55;
        const activity = stats?.getTraitNormalized?.('activity') ?? 0.5;
        const curiosity = stats?.getTraitNormalized?.('curiosity') ?? 0.5;
        const neediness = stats?.getTraitNormalized?.('neediness') ?? 0.5;
        const nearbyMytes = this.getNearbyMytes(this.socialRadius);
        const nearbyObjects = this.getNearbyObjects(this.objectSearchRadius);
        const droppedItems = this.getNearbyDroppedItems(this.objectSearchRadius);
        const timeData = this.myte.parent?.timeManager?.getTimeData?.() ?? {};
        const home = this.getHomePosition();
        const distanceFromHome = this.myte.getDistanceToPoint(home.x, home.y);
        const preferences = this.getAIPreferences();
        const nearbyLights = nearbyObjects.filter(target => target?.getConfig?.('interactionType') === 'light');
        const nearbyActiveLights = nearbyLights.filter(target => target?.isEnabled?.());
        const nearbyMusicSources = nearbyObjects.filter(target => target?.isMusicSource?.());
        const nearbyActiveMusicSources = nearbyMusicSources.filter(target => target?.isActiveMusicSource?.());
        const ambientLightLevel = Utility.clamp(timeData.lightLevel ?? 1, 0, 1);
        const localLightLevel = Utility.clamp(ambientLightLevel + Math.min(nearbyActiveLights.length * 0.28, 0.6), 0, 1);
        const moodNeed = 1 - mood;
        const comfortNeed = 1 - comfort;
        const lightNeed = Utility.clamp((0.45 - localLightLevel) / 0.45, 0, 1) * (0.45 + (preferences.light * 0.55));
        const musicNeed = Utility.clamp(
            (preferences.music * 0.46) +
            (boredom * 0.32) +
            (moodNeed * 0.18) -
            (nearbyActiveMusicSources.length > 0 ? 0.42 : 0),
            0,
            1
        );
        const homeNeed = Utility.clamp(
            (distanceFromHome - (this.homeRadius * 0.55)) / Math.max(this.homeRadius * 1.35, 1),
            0,
            1
        );
        const restNeed = Utility.clamp(
            ((1 - energy) * 0.72) + ((1 - health) * 0.24) + (comfortNeed * 0.14),
            0,
            1
        );

        return {
            stats,
            energy,
            health,
            mood,
            moodNeed,
            boredom,
            comfort,
            comfortNeed,
            confidence,
            activity,
            curiosity,
            neediness,
            preferences,
            timeOfDay: timeData.timeOfDay ?? 'day',
            ambientLightLevel,
            localLightLevel,
            lightNeed,
            musicNeed,
            nearbyLights,
            nearbyActiveLights,
            nearbyMusicSources,
            nearbyActiveMusicSources,
            nearbyMytes,
            nearbyObjects,
            droppedItems,
            home,
            distanceFromHome,
            getNoveltyScore: (target) => this.getNoveltyScore(target),
            needs: {
                rest: restNeed,
                social: Utility.clamp((neediness * 0.44) + (moodNeed * 0.22) + (boredom * 0.34), 0, 1),
                enrichment: Utility.clamp((curiosity * 0.42) + (boredom * 0.44) + (comfortNeed * 0.14), 0, 1),
                play: Utility.clamp((activity * 0.42) + (energy * 0.2) + (boredom * 0.38) - (restNeed * 0.24), 0, 1),
                comfort: Utility.clamp((comfortNeed * 0.52) + (homeNeed * 0.24) + (lightNeed * 0.24), 0, 1),
                home: homeNeed
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
        if (!context.stats) {
            return null;
        }

        const nearbyBed = this.findTargetWithAffordance(context.nearbyObjects, 'rest_on_bed', context);
        let score = 16 + (context.needs.rest * 84) + (context.needs.comfort * 18);
        if (this.mode === MOVE_AUTONOMY_TYPES.REST) score += 36;
        if (context.distanceFromHome > this.homeComfortRadius) score += context.needs.home * 14;
        score += context.preferences.coziness * 10;

        if (score < 28) {
            return null;
        }

        const actionId = nearbyBed
            ? 'rest_on_bed'
            : (context.energy < 0.18 || context.health < 0.4 ? 'sleep' : context.energy < 0.44 ? 'simple_sleep' : 'idle');
        const label = nearbyBed ? 'rest:bed' : `rest:${actionId}`;
        const targetKey = nearbyBed ? this.getTargetKey(nearbyBed) : null;

        return {
            label,
            targetKey,
            commitmentMs: nearbyBed ? 2400 : 1600,
            score: this.applyRepeatPenalty(score, label, targetKey),
            execute: () => {
                if (nearbyBed && actionId === 'rest_on_bed') {
                    this.enqueueTargetedAction('rest_on_bed', nearbyBed, {}, {
                        label,
                        category: 'rest',
                        novelty: Math.max(0.2, this.getNoveltyScore(nearbyBed) * 0.4),
                        soothing: 1,
                        accomplishment: 0.2
                    });
                    return;
                }

                this.enqueueAction(actionId, actionId === 'idle' ? { duration: 90 } : {
                    duration: actionId === 'sleep' ? 220 : 160
                }, {
                    label,
                    category: 'rest',
                    novelty: 0.15,
                    soothing: 0.85,
                    accomplishment: 0.1
                });
                context.stats.setMood?.('sleepy');
            }
        };
    }

    buildHomeComfortCandidate(context) {
        if (context.distanceFromHome <= this.homeComfortRadius || context.needs.home < 0.12) {
            return null;
        }

        let score = 8 + (context.needs.home * 42) + (context.needs.comfort * 22) + (context.needs.rest * 10);
        if (context.energy < 0.35) score += 10;

        if (score < 24) {
            return null;
        }

        return {
            label: 'home_comfort',
            targetKey: 'home',
            commitmentMs: 1800,
            score: this.applyRepeatPenalty(score, 'home_comfort', 'home'),
            execute: () => {
                const safeHome = this.findHomeComfortTarget(context.home);
                if (safeHome) {
                    this.myte.queue.addAStarMove(safeHome);
                } else {
                    this.enqueueAction('idle', { duration: 50 }, {
                        label: 'home_comfort:fallback',
                        category: 'idle',
                        novelty: 0.1
                    });
                }
            }
        };
    }

    buildSocialCandidate(context) {
        if (!context.stats || context.nearbyMytes.length === 0) {
            return null;
        }

        let score = 14 + (context.needs.social * 52);
        if (this.mode === MOVE_AUTONOMY_TYPES.SOCIAL) score += 34;
        if (context.energy < 0.25) score -= 18;
        if (context.confidence < 0.3) score -= 6;

        if (score < 26) {
            return null;
        }

        const target = context.nearbyMytes[0];
        const wantsPlay = context.needs.play > 0.74 && context.energy > 0.6 && context.boredom > 0.35;
        const actionId = wantsPlay
            ? 'play_tag'
            : (context.moodNeed > 0.42 || context.neediness > 0.62 ? 'show_affection' : 'greet');
        const label = `social:${actionId}`;

        return {
            label,
            targetKey: this.getTargetKey(target),
            commitmentMs: actionId === 'play_tag' ? 2600 : 1800,
            score: this.applyRepeatPenalty(score, label, this.getTargetKey(target)),
            execute: () => {
                this.enqueueTargetedAction(actionId, target, {}, {
                    label,
                    category: 'social',
                    novelty: Math.max(0.2, this.getNoveltyScore(target) * 0.45),
                    social: 1,
                    accomplishment: actionId === 'play_tag' ? 0.65 : 0.45,
                    exertion: actionId === 'play_tag' ? 0.5 : 0.1
                });
            }
        };
    }

    buildPlayCandidate(context) {
        if (context.energy < 0.35 || context.needs.play < 0.4) {
            return null;
        }

        const targetBall = this.findTargetWithAffordance(context.nearbyObjects, 'nudge_ball', context);
        const targetAnchor = targetBall ?? this.getPlayAnchorTarget(context.nearbyObjects);
        const playMomentum = Utility.clamp(
            (context.needs.play * 0.5) +
            (context.activity * 0.28) +
            (context.energy * 0.22),
            0,
            1
        );
        let score = 10 + (context.needs.play * 54) + (context.boredom * 10);
        score += context.activity * 12;
        score -= context.needs.rest * 18;

        if (score < 24) {
            return null;
        }

        const actionId = targetBall
            ? (context.activity > 0.72 && context.boredom > 0.5 && context.energy > 0.58 ? 'play_fetch' : 'nudge_ball')
            : (targetAnchor && context.activity > 0.68
                ? 'run_laps'
                : (context.activity > 0.74 ? 'zigzag' : 'circle'));
        const targetKey = targetBall ? this.getTargetKey(targetBall) : (targetAnchor ? this.getTargetKey(targetAnchor) : null);

        return {
            label: `play:${actionId}`,
            targetKey,
            commitmentMs: actionId === 'play_fetch' ? 3200 : 2200,
            score: this.applyRepeatPenalty(score, `play:${actionId}`, targetKey),
            execute: () => {
                if (Math.random() < 0.3) {
                    this.myte.queue.addExpression('excited', 35, 1);
                }

                if (Math.random() < 0.16 && context.energy > 0.7) {
                    this.myte.queue.addJump();
                }

                if (actionId === 'nudge_ball' && targetBall) {
                    this.enqueueTargetedAction('nudge_ball', targetBall, {
                        repeat: playMomentum > 0.9 ? 3 : (playMomentum > 0.72 ? 2 : 1),
                        postNudgeIdleDuration: 18 + Math.round(context.activity * 16)
                    }, {
                        label: 'play:nudge_ball',
                        category: 'play',
                        novelty: this.getNoveltyScore(targetBall),
                        accomplishment: 0.5,
                        exertion: 0.55
                    });
                    return;
                }

                if (actionId === 'play_fetch' && targetBall) {
                    this.enqueueTargetedAction('play_fetch', targetBall, {
                        roundTrips: Math.max(1, Math.min(4, 1 + Math.round((playMomentum * 2.4) + (context.boredom * 0.8)))),
                        throwStrength: 8 + Math.round(context.activity * 6)
                    }, {
                        label: 'play:play_fetch',
                        category: 'play',
                        novelty: this.getNoveltyScore(targetBall),
                        accomplishment: 0.65,
                        exertion: 0.78
                    });
                    return;
                }

                if (actionId === 'run_laps' && targetAnchor) {
                    this.enqueueTargetedAction('run_laps', targetAnchor, {
                        repeat: context.activity > 0.8 ? 4 : 3
                    }, {
                        label: 'play:run_laps',
                        category: 'play',
                        novelty: targetAnchor ? this.getNoveltyScore(targetAnchor) * 0.7 : 0.35,
                        accomplishment: 0.45,
                        exertion: 0.65
                    });
                    return;
                }

                if (actionId === 'zigzag') {
                    const angle = Math.random() * Math.PI * 2;
                    this.enqueueAction('zigzag', {
                        direction: { x: Math.cos(angle), y: Math.sin(angle) },
                        amplitude: 36 + Math.round(context.activity * 48),
                        duration: 90 + Math.round(context.activity * 90)
                    }, {
                        label: 'play:zigzag',
                        category: 'play',
                        novelty: 0.4,
                        accomplishment: 0.35,
                        exertion: 0.7
                    });
                    return;
                }

                this.enqueueAction('circle', {
                    centerX: this.myte.posX,
                    centerY: this.myte.posY,
                    radius: 32 + Math.round(context.activity * 28),
                    duration: 90 + Math.round(context.needs.play * 90)
                }, {
                    label: 'play:circle',
                    category: 'play',
                    novelty: 0.3,
                    accomplishment: 0.25,
                    exertion: 0.5
                });
            }
        };
    }

    buildInteractionCandidate(context) {
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

        return best;
    }

    buildAffordanceCandidate(affordance, target, context) {
        const distance = this.myte.getDistanceTo?.(target) ?? Infinity;
        const novelty = this.getNoveltyScore(target);
        const interactionType = target.getConfig?.('interactionType');
        const affordancePurpose = affordance.purpose ?? null;
        let score = 6 + Math.max(0, 140 - distance) * 0.12;

        switch (affordance.actionId) {
            case 'rest_on_bed':
                score += (context.needs.rest * 32) + (context.needs.comfort * 24) + (context.preferences.coziness * 12);
                score -= context.boredom * 6;
                break;
            case 'inspect':
                score += (context.needs.enrichment * 24) + (novelty * 18) + (context.curiosity * 10);
                score -= context.needs.rest * 9;
                break;
            case 'deep_inspect':
                score += (novelty * 24) + (context.curiosity * 18) + (context.boredom * 14);
                score -= context.needs.rest * 12;
                break;
            case 'smell_flower':
            case 'drink_fountain':
                score += (context.needs.comfort * 28) + (context.moodNeed * 22) + (context.curiosity * 8);
                break;
            case 'open_chest':
                score += (context.needs.enrichment * 24) + (context.curiosity * 18) + (context.confidence * 10);
                break;
            case 'water_plant':
                score += (context.needs.enrichment * 18) + (context.curiosity * 12) + (context.confidence * 10);
                break;
            case 'harvest':
                score += (context.needs.enrichment * 20) + (context.curiosity * 16) + (context.confidence * 12) + (context.preferences.harvest * 18);
                break;
            case 'eat_element':
                score += ((1 - context.energy) * 34) + (context.needs.comfort * 8);
                break;
            case 'interact_object':
                if (affordancePurpose === 'start_music') {
                    score += (context.musicNeed * 42) + (context.preferences.music * 20) + (context.needs.play * 10);
                } else if (affordancePurpose === 'light_on') {
                    score += (context.lightNeed * 46) + (context.preferences.light * 16) + (context.needs.comfort * 12);
                } else if (interactionType === 'dance') {
                    score += (context.needs.play * 26) + (context.activity * 14) + (context.boredom * 10);
                } else if (interactionType === 'light') {
                    score += (context.needs.comfort * 22) + (context.moodNeed * 14);
                } else {
                    score += (context.curiosity * 14) + (context.confidence * 10);
                }
                break;
            default:
                score += (context.needs.enrichment * 16) + (novelty * 10);
                break;
        }

        if (this.mode === MOVE_AUTONOMY_TYPES.INTERACT) {
            score += 24;
        }

        const label = `interaction:${affordance.actionId}${affordancePurpose ? `:${affordancePurpose}` : ''}`;
        const targetKey = this.getTargetKey(target);
        score = this.applyRepeatPenalty(score, label, targetKey);

        if (score < 20) {
            return null;
        }

        return {
            label,
            targetKey,
            commitmentMs: affordance.actionId === 'inspect'
                ? 1400
                : affordance.actionId === 'deep_inspect'
                    ? 1900
                    : affordance.actionId === 'nudge_ball'
                        ? 1800
                        : 1200,
            score,
            execute: () => {
                this.enqueueTargetedAction(affordance.actionId, target, {}, {
                    label,
                    category: this.getBehaviorCategoryForAction(affordance.actionId, interactionType, affordance),
                    novelty,
                    soothing: this.getSoothingValueForAction(affordance.actionId, interactionType, affordance),
                    accomplishment: this.getAccomplishmentValueForAction(affordance.actionId, affordance),
                    exertion: this.getExertionValueForAction(affordance.actionId, affordance)
                });
            }
        };
    }

    buildDroppedItemCandidate(context) {
        if (context.droppedItems.length === 0) {
            return null;
        }

        let best = null;
        for (const item of context.droppedItems) {
            const distance = this.myte.getDistanceTo?.(item) ?? Infinity;
            let score = 8 + (context.curiosity * 16) + (context.boredom * 8) + Math.max(0, 120 - distance) * 0.1;

            const age = Date.now() - (item.droppedAt ?? 0);
            if (age < 30000) score += 22 * (1 - age / 30000);

            if (item.type?.toUpperCase() === 'FOOD' && context.energy < 0.7) {
                score += (1 - context.energy) * 48;
            }

            score = this.applyRepeatPenalty(score, `dropped_item:${item.type}`, `item:${item.id ?? item.variant ?? item.type}`);

            if (!best || score > best.score) {
                best = {
                    label: `dropped_item:${item.type}`,
                    targetKey: `item:${item.id ?? item.variant ?? item.type}`,
                    commitmentMs: 1800,
                    score,
                    execute: () => {
                        this.myte.queue.addAStarMove({ x: item.posX, y: item.posY });
                    }
                };
            }
        }

        return best;
    }

    buildWanderCandidate(context) {
        const target = this.findWanderTarget(context);
        if (!target) {
            return null;
        }

        let score = 10 + (context.activity * 16) + (context.curiosity * 12) + (context.boredom * 14);
        score += context.needs.play * 10;
        if (this.mode === MOVE_AUTONOMY_TYPES.WANDER) score += 38;
        if (context.energy < 0.25) score -= 14;

        return {
            label: 'wander',
            targetKey: 'wander',
            commitmentMs: 2400,
            score: this.applyRepeatPenalty(score, 'wander', 'wander'),
            execute: () => {
                if (context.energy > 0.72 && Math.random() < 0.12) {
                    this.myte.queue.addJump();
                }

                this.myte.queue.addAStarMove(target);

                if (Math.random() < 0.45) {
                    this.enqueueAction('idle', { duration: 45 + Math.round(context.comfort * 35) }, {
                        label: 'wander:pause',
                        category: 'idle',
                        novelty: 0.18
                    });
                }
            }
        };
    }

    buildIdleCandidate(context) {
        return {
            label: 'idle',
            targetKey: 'idle',
            commitmentMs: 900,
            score: this.applyRepeatPenalty(7 + (context.needs.rest * 3) + (context.needs.comfort * 2), 'idle', 'idle'),
            execute: () => {
                if (context.boredom > 0.68 && Math.random() < 0.22) {
                    this.myte.queue.addExpression('surprise', 30, 1);
                }

                this.enqueueAction('idle', { duration: 45 }, {
                    label: 'idle',
                    category: 'idle',
                    novelty: 0.05
                });
            }
        };
    }

    applyRepeatPenalty(score, label, targetKey = null) {
        let adjustedScore = score;

        if (this.lastDecisionLabel === label) {
            const elapsed = Date.now() - this.lastDecisionTime;
            if (elapsed <= 6000) {
                adjustedScore *= 0.68;
            }
        }

        if (targetKey && this.lastDecisionTargetKey === targetKey) {
            const elapsed = Date.now() - this.lastDecisionTime;
            if (elapsed <= 12000) {
                adjustedScore *= 0.74;
            }
        }

        const now = Date.now();
        for (const entry of this.recentHistory) {
            const age = now - entry.time;
            if (age > this.repeatWindow) {
                continue;
            }

            const ageFactor = 1 - (age / this.repeatWindow);
            if (entry.label === label) {
                adjustedScore -= 12 * ageFactor;
            }

            if (targetKey && entry.targetKey === targetKey) {
                adjustedScore -= 18 * ageFactor;
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
        const now = Date.now();
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

        this.pruneMemory();
    }

    pruneMemory() {
        const now = Date.now();
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

    getNearbyMytes(radius) {
        if (this._nearbyMytesCache && this._nearbyMytesRadius === radius &&
            this._nearbyMytesTime === this._tickTime) {
            return this._nearbyMytesCache;
        }
        const result = this._sortByDistance(
            (this.myte.parent?.mytes || []).filter(target =>
                target && target !== this.myte && target.isActive &&
                !target.isDragging && this.myte.getDistanceTo(target) <= radius
            )
        );
        this._nearbyMytesCache = result;
        this._nearbyMytesRadius = radius;
        this._nearbyMytesTime = this._tickTime;
        return result;
    }

    getNearbyObjects(radius) {
        if (this._nearbyObjectsCache && this._nearbyObjectsRadius === radius &&
            this._nearbyObjectsTime === this._tickTime) {
            return this._nearbyObjectsCache;
        }
        const result = this._sortByDistance(
            (this.myte.parent?.gameMap?.objects || []).filter(target =>
                target && target.active && !target.isDragging &&
                Number.isFinite(target.posX) && Number.isFinite(target.posY) &&
                this.myte.getDistanceTo(target) <= radius
            )
        );
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
        const result = this._sortByDistance(
            (this.myte.parent?.gameMap?.droppedItems || []).filter(item =>
                item && item.active && !item.collected &&
                this.myte.getDistanceTo(item) <= radius
            )
        );
        this._nearbyItemsCache = result;
        this._nearbyItemsRadius = radius;
        this._nearbyItemsTime = this._tickTime;
        return result;
    }

    getAffordancesForTarget(target, context) {
        const affordances = target?.getAiAffordances?.(context, this.myte) ?? [];
        return affordances.filter((affordance, index, list) => {
            const key = `${affordance.actionId}:${affordance.purpose ?? ''}`;
            return list.findIndex(item => `${item.actionId}:${item.purpose ?? ''}` === key) === index;
        });
    }

    canInspectTarget(target) {
        return target?.getConfig?.('canInspect', true) !== false &&
            target?.getConfig?.('interactionType') !== 'teleport' &&
            target?.type?.toUpperCase?.() !== 'PORTAL';
    }

    getPlayAnchorTarget(targets) {
        return targets.find(target =>
            target &&
            target.element &&
            target.getConfig?.('interactionType') !== 'teleport'
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
        return gridSystem?.findNearestValidPositionForEntity?.(this.myte, home.x, home.y, 10) ?? home;
    }

    findWanderTarget(context = null) {
        const worldBounds = this.myte.parent?.getWorldBounds?.();
        if (!worldBounds) {
            return null;
        }

        const localContext = context ?? this.buildContext();
        const curiosityWander = this.findCuriosityWanderTarget(localContext);
        if (curiosityWander) {
            return curiosityWander;
        }

        const origin = this.mode === MOVE_AUTONOMY_TYPES.WANDER
            ? { x: this.myte.posX, y: this.myte.posY }
            : localContext.home;
        const maxRadius = this.mode === MOVE_AUTONOMY_TYPES.WANDER
            ? this.wanderRadius
            : this.homeRadius;

        for (let attempt = 0; attempt < 12; attempt++) {
            const angle = Math.random() * Math.PI * 2;
            const distance = 48 + Math.random() * maxRadius;
            const desiredX = origin.x + Math.cos(angle) * distance;
            const desiredY = origin.y + Math.sin(angle) * distance;
            const x = Utility.clamp(desiredX, worldBounds.left, worldBounds.right - this.myte.size.width);
            const y = Utility.clamp(desiredY, worldBounds.top, worldBounds.bottom - this.myte.size.height);
            const safe = this.myte.parent?.gameMap?.gridSystem?.findNearestValidPositionForEntity?.(this.myte, x, y, 8);

            if (safe && this.myte.canMoveToPosition(safe.x, safe.y)) {
                return safe;
            }
        }

        return null;
    }

    findCuriosityWanderTarget(context) {
        if (context.boredom < 0.48 && context.curiosity < 0.55) {
            return null;
        }

        const interestingTarget = context.nearbyObjects
            .filter(target => this.canInspectTarget(target))
            .sort((a, b) => this.getNoveltyScore(b) - this.getNoveltyScore(a))[0];

        if (!interestingTarget || this.getNoveltyScore(interestingTarget) < 0.55) {
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
            10
        ) ?? null;
    }

    getTargetKey(target) {
        if (!target) return null;
        return `${target.type ?? target.constructor?.name ?? 'target'}:${target.id ?? `${target.posX},${target.posY}`}`;
    }

    getNoveltyScore(target) {
        const targetKey = this.getTargetKey(target);
        if (!targetKey) {
            return 0.4;
        }

        const memory = this.objectMemories.get(targetKey);
        if (!memory) {
            return 1;
        }

        const elapsed = Date.now() - (memory.lastCompletedAt ?? 0);
        const recency = elapsed >= this.targetCooldownDuration
            ? 1
            : Utility.clamp(elapsed / this.targetCooldownDuration, 0.1, 1);
        const familiarityPenalty = Math.min(memory.completedCount * 0.08, 0.34);

        return Utility.clamp(0.55 + (recency * 0.45) - familiarityPenalty, 0.12, 1);
    }

    getBehaviorCategoryForAction(actionId, interactionType = null, affordance = null) {
        if (actionId === 'play_fetch') return 'play';
        if (actionId === 'rest_on_bed') return 'rest';
        if (actionId === 'nudge_ball') return 'play';
        if (actionId === 'inspect' || actionId === 'deep_inspect' || actionId === 'open_chest' || actionId === 'harvest' || actionId === 'water_plant') {
            return 'world';
        }
        if (actionId === 'smell_flower' || actionId === 'drink_fountain') return 'rest';
        if (actionId === 'interact_object' && affordance?.purpose === 'start_music') return 'play';
        if (actionId === 'interact_object' && affordance?.purpose === 'light_on') return 'rest';
        if (actionId === 'interact_object' && interactionType === 'dance') return 'play';
        if (actionId === 'interact_object' && interactionType === 'light') return 'rest';
        if (actionId === 'eat_element') return 'rest';
        return 'world';
    }

    getSoothingValueForAction(actionId, interactionType = null, affordance = null) {
        if (actionId === 'rest_on_bed') return 1;
        if (actionId === 'smell_flower' || actionId === 'drink_fountain') return 0.85;
        if (actionId === 'eat_element') return 0.55;
        if (actionId === 'interact_object' && affordance?.purpose === 'start_music') return 0.45;
        if (actionId === 'interact_object' && affordance?.purpose === 'light_on') return 0.6;
        if (actionId === 'interact_object' && interactionType === 'light') return 0.55;
        return 0.1;
    }

    getAccomplishmentValueForAction(actionId, affordance = null) {
        switch (actionId) {
            case 'open_chest':
            case 'harvest':
                return 0.7;
            case 'water_plant':
            case 'nudge_ball':
                return 0.45;
            case 'play_fetch':
                return 0.6;
            case 'rest_on_bed':
                return 0.25;
            case 'inspect':
            case 'deep_inspect':
                return 0.2;
            case 'interact_object':
                if (affordance?.purpose === 'start_music') return 0.55;
                if (affordance?.purpose === 'light_on') return 0.42;
                return 0.35;
            default:
                return 0.35;
        }
    }

    getExertionValueForAction(actionId, affordance = null) {
        switch (actionId) {
            case 'rest_on_bed':
                return 0;
            case 'nudge_ball':
                return 0.55;
            case 'play_fetch':
                return 0.78;
            case 'harvest':
            case 'water_plant':
                return 0.25;
            case 'deep_inspect':
                return 0.18;
            case 'interact_object':
                if (affordance?.purpose === 'start_music') return 0.18;
                if (affordance?.purpose === 'light_on') return 0.08;
                return 0.1;
            default:
                return 0.1;
        }
    }

    getHomePosition() {
        return this.myte.getHomePosition();
    }

    buildDebugContextSnapshot(context) {
        return {
            energy: Number(context.energy.toFixed(2)),
            mood: Number(context.mood.toFixed(2)),
            boredom: Number(context.boredom.toFixed(2)),
            comfort: Number(context.comfort.toFixed(2)),
            confidence: Number(context.confidence.toFixed(2)),
            localLightLevel: Number(context.localLightLevel.toFixed(2)),
            lightNeed: Number(context.lightNeed.toFixed(2)),
            musicNeed: Number(context.musicNeed.toFixed(2)),
            needs: {
                rest: Number(context.needs.rest.toFixed(2)),
                social: Number(context.needs.social.toFixed(2)),
                enrichment: Number(context.needs.enrichment.toFixed(2)),
                play: Number(context.needs.play.toFixed(2)),
                comfort: Number(context.needs.comfort.toFixed(2)),
                home: Number(context.needs.home.toFixed(2))
            },
            nearbyMytes: context.nearbyMytes.length,
            nearbyObjects: context.nearbyObjects.length,
            nearbyActiveMusicSources: context.nearbyActiveMusicSources.length
        };
    }

    getNeedsSnapshot({ live = false } = {}) {
        const snapshot = live
            ? this.buildDebugContextSnapshot(this.buildContext())
            : (this.lastContextSnapshot ?? this.buildDebugContextSnapshot(this.buildContext()));

        const needs = snapshot?.needs ?? {};
        const entries = [
            { id: 'rest', label: 'Rest', value: needs.rest ?? 0 },
            { id: 'social', label: 'Social', value: needs.social ?? 0 },
            { id: 'enrichment', label: 'Enrichment', value: needs.enrichment ?? 0 },
            { id: 'play', label: 'Play', value: needs.play ?? 0 },
            { id: 'comfort', label: 'Comfort', value: needs.comfort ?? 0 },
            { id: 'home', label: 'Home', value: needs.home ?? 0 }
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
                energy: Math.round((snapshot?.energy ?? 0) * 100),
                mood: Math.round((snapshot?.mood ?? 0) * 100),
                fun: Math.round((1 - (snapshot?.boredom ?? 0)) * 100),
                comfort: Math.round((snapshot?.comfort ?? 0) * 100),
                confidence: Math.round((snapshot?.confidence ?? 0) * 100)
            },
            environment: {
                light: Math.round((snapshot?.localLightLevel ?? 0) * 100),
                lightNeed: Math.round((snapshot?.lightNeed ?? 0) * 100),
                musicNeed: Math.round((snapshot?.musicNeed ?? 0) * 100)
            },
            lastDecisionLabel: this.lastDecisionLabel
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
