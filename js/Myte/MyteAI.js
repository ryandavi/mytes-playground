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
            this.myte.queue.isEmpty();
    }

    getThinkInterval() {
        const activity = this.myte.stats?.getTraitNormalized?.('activity') ?? 0.5;
        const energy = this.myte.stats?.getEnergyRatio?.() ?? 1;
        const activityModifier = 1.2 - (activity * 0.6);
        const energyModifier = energy < 0.3 ? 1.25 : 1;

        return Utility.clamp(
            this.baseThinkInterval * activityModifier * energyModifier,
            this.minThinkInterval,
            this.maxThinkInterval
        );
    }

    planNextAction() {
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
        ].filter(Boolean);

        if (candidates.length === 0) {
            return;
        }

        candidates.sort((a, b) => b.score - a.score);
        const chosen = candidates[0];
        chosen.execute();
        this.lastDecisionLabel = chosen.label;
        this.lastDecisionTime = Date.now();
    }

    buildContext() {
        const stats = this.myte.stats;
        const energy = stats?.getEnergyRatio?.() ?? 1;
        const health = stats?.getHealthRatio?.() ?? 1;
        const mood = stats?.getMoodRatio?.() ?? 1;
        const activity = stats?.getTraitNormalized?.('activity') ?? 0.5;
        const curiosity = stats?.getTraitNormalized?.('curiosity') ?? 0.5;
        const neediness = stats?.getTraitNormalized?.('neediness') ?? 0.5;
        const nearbyMytes = this.getNearbyMytes(this.socialRadius);
        const nearbyObjects = this.getNearbyObjects(this.objectSearchRadius);
        const droppedItems = this.getNearbyDroppedItems(this.objectSearchRadius);
        const home = this.getHomePosition();
        const distanceFromHome = this.myte.getDistanceToPoint(home.x, home.y);
        const moodNeed = 1 - mood;

        return {
            stats,
            energy,
            health,
            mood,
            moodNeed,
            activity,
            curiosity,
            neediness,
            nearbyMytes,
            nearbyObjects,
            droppedItems,
            home,
            distanceFromHome,
            needs: {
                rest: Utility.clamp(((1 - energy) * 0.78) + ((1 - health) * 0.32), 0, 1),
                social: Utility.clamp((neediness * 0.65) + (moodNeed * 0.4), 0, 1),
                enrichment: Utility.clamp((curiosity * 0.7) + (moodNeed * 0.3), 0, 1),
                play: Utility.clamp((activity * 0.6) + (energy * 0.25) + (moodNeed * 0.15), 0, 1),
                home: Utility.clamp(
                    (distanceFromHome - (this.homeRadius * 0.35)) / Math.max(this.homeRadius, 1),
                    0,
                    1
                )
            }
        };
    }

    buildRestCandidate(context) {
        if (!context.stats) {
            return null;
        }

        let score = 16 + (context.needs.rest * 92);
        if (this.mode === MOVE_AUTONOMY_TYPES.REST) score += 38;
        if (context.distanceFromHome > this.homeComfortRadius) score += context.needs.home * 16;

        if (score < 28) {
            return null;
        }

        return {
            label: 'rest',
            score: this.applyRepeatPenalty(score, 'rest'),
            execute: () => {
                if (context.energy < 0.16 || context.health < 0.35) {
                    this.myte.queue.addSleep(220);
                } else if (context.energy < 0.4) {
                    this.myte.queue.addSimpleSleep(160);
                } else {
                    this.myte.queue.addIdle(90);
                }

                context.stats.setMood?.('sleepy');
            }
        };
    }

    buildHomeComfortCandidate(context) {
        if (context.distanceFromHome <= this.homeComfortRadius) {
            return null;
        }

        let score = 8 + (context.needs.home * 44) + (context.needs.rest * 20);
        if (context.energy < 0.35) score += 12;

        if (score < 24) {
            return null;
        }

        return {
            label: 'home_comfort',
            score: this.applyRepeatPenalty(score, 'home_comfort'),
            execute: () => {
                const safeHome = this.findHomeComfortTarget(context.home);
                if (safeHome) {
                    this.myte.queue.addAStarMove(safeHome);
                } else {
                    this.myte.queue.addIdle(60);
                }
            }
        };
    }

    buildSocialCandidate(context) {
        if (!context.stats || context.nearbyMytes.length === 0) {
            return null;
        }

        let score = 14 + (context.needs.social * 54);
        if (this.mode === MOVE_AUTONOMY_TYPES.SOCIAL) score += 36;
        if (context.energy < 0.25) score -= 18;

        if (score < 26) {
            return null;
        }

        const target = context.nearbyMytes[0];
        const wantsPlay = context.needs.play > 0.72 && context.energy > 0.6;
        const actionId = wantsPlay
            ? 'play_tag'
            : (context.moodNeed > 0.45 || context.neediness > 0.62 ? 'show_affection' : 'greet');

        return {
            label: `social:${actionId}`,
            score: this.applyRepeatPenalty(score, `social:${actionId}`),
            execute: () => {
                const options = ActionManager.getActionOptions(actionId, target, this.myte);
                if (options) {
                    this.myte.queue.add(actionId, options);
                } else {
                    this.myte.queue.addWatch(target, 140);
                }
            }
        };
    }

    buildPlayCandidate(context) {
        if (context.energy < 0.35 || context.needs.play < 0.42) {
            return null;
        }

        const target = this.getPlayAnchorTarget(context.nearbyObjects);
        let score = 10 + (context.needs.play * 52);
        score += context.activity * 12;
        score -= context.needs.rest * 18;

        if (score < 24) {
            return null;
        }

        const actionKey = target && context.activity > 0.6
            ? 'run_laps'
            : (context.activity > 0.72 ? 'zigzag' : 'circle');

        return {
            label: `play:${actionKey}`,
            score: this.applyRepeatPenalty(score, `play:${actionKey}`),
            execute: () => {
                if (Math.random() < 0.3) {
                    this.myte.queue.addExpression('excited', 35, 1);
                }

                if (Math.random() < 0.18 && context.energy > 0.7) {
                    this.myte.queue.addJump();
                }

                if (actionKey === 'run_laps' && target) {
                    this.myte.queue.add('run_laps', {
                        target,
                        repeat: context.activity > 0.8 ? 4 : 3
                    });
                    return;
                }

                if (actionKey === 'zigzag') {
                    const angle = Math.random() * Math.PI * 2;
                    this.myte.queue.add('zigzag', {
                        direction: { x: Math.cos(angle), y: Math.sin(angle) },
                        amplitude: 36 + Math.round(context.activity * 48),
                        duration: 90 + Math.round(context.activity * 90)
                    });
                    return;
                }

                this.myte.queue.add('circle', {
                    centerX: this.myte.posX,
                    centerY: this.myte.posY,
                    radius: 32 + Math.round(context.activity * 28),
                    duration: 90 + Math.round(context.needs.play * 90)
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
            const candidate = this.getBestInteractionForTarget(target, context);
            if (!candidate || (best && candidate.score <= best.score)) {
                continue;
            }
            best = candidate;
        }

        return best;
    }

    getBestInteractionForTarget(target, context) {
        const allowedActions = new Set([
            'inspect',
            'open_chest',
            'smell_flower',
            'drink_fountain',
            'water_plant',
            'harvest',
            'eat_element'
        ]);

        const actions = ActionManager
            .getAvailableActions(target, this.myte)
            .filter(action => allowedActions.has(action.id));

        let best = null;
        for (const action of actions) {
            const distance = this.myte.getDistanceTo?.(target) ?? Infinity;
            let score = 14 + (context.needs.enrichment * 48) + Math.max(0, 120 - distance) * 0.12;

            switch (action.id) {
                case 'drink_fountain':
                case 'smell_flower':
                    score += context.moodNeed * 30;
                    break;
                case 'open_chest':
                case 'harvest':
                    score += context.curiosity * 18;
                    break;
                case 'water_plant':
                case 'inspect':
                    score += 8;
                    break;
                case 'eat_element':
                    score += (1 - context.energy) * 20;
                    break;
                default:
                    break;
            }

            if (this.mode === MOVE_AUTONOMY_TYPES.INTERACT) {
                score += 26;
            }

            score = this.applyRepeatPenalty(score, `interaction:${action.id}`);
            if (!best || score > best.score) {
                best = {
                    label: `interaction:${action.id}`,
                    score,
                    execute: () => {
                        const options = ActionManager.getActionOptions(action.id, target, this.myte);
                        if (options) {
                            this.myte.queue.add(action.id, options);
                        }
                    }
                };
            }
        }

        return best;
    }

    buildDroppedItemCandidate(context) {
        if (context.droppedItems.length === 0) {
            return null;
        }

        let best = null;
        for (const item of context.droppedItems) {
            const distance = this.myte.getDistanceTo?.(item) ?? Infinity;
            let score = 8 + (context.curiosity * 18) + Math.max(0, 120 - distance) * 0.1;

            const age = Date.now() - (item.droppedAt ?? 0);
            if (age < 30000) score += 22 * (1 - age / 30000);

            if (item.type?.toUpperCase() === 'FOOD' && context.energy < 0.7) {
                score += (1 - context.energy) * 50;
            }

            score = this.applyRepeatPenalty(score, `dropped_item:${item.type}`);

            if (!best || score > best.score) {
                best = {
                    label: `dropped_item:${item.type}`,
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

        let score = 10 + (context.activity * 18) + (context.curiosity * 16);
        score += context.needs.play * 12;
        if (this.mode === MOVE_AUTONOMY_TYPES.WANDER) score += 38;
        if (context.energy < 0.25) score -= 14;

        return {
            label: 'wander',
            score: this.applyRepeatPenalty(score, 'wander'),
            execute: () => {
                if (context.energy > 0.7 && Math.random() < 0.12) {
                    this.myte.queue.addJump();
                }

                this.myte.queue.addAStarMove(target);

                if (Math.random() < 0.28) {
                    this.myte.queue.addIdle(35);
                }
            }
        };
    }

    buildIdleCandidate(context) {
        return {
            label: 'idle',
            score: this.applyRepeatPenalty(6 + (context.needs.rest * 4), 'idle'),
            execute: () => {
                if (context.curiosity > 0.65 && Math.random() < 0.3) {
                    this.myte.queue.addExpression('surprise', 30, 1);
                }
                this.myte.queue.addIdle(45);
            }
        };
    }

    applyRepeatPenalty(score, label) {
        if (this.lastDecisionLabel !== label) {
            return score;
        }

        const elapsed = Date.now() - this.lastDecisionTime;
        if (elapsed > 5000) {
            return score;
        }

        return score * 0.65;
    }

    getNearbyMytes(radius) {
        return (this.myte.parent?.mytes || [])
            .filter(target =>
                target &&
                target !== this.myte &&
                target.isActive &&
                !target.isDragging &&
                this.myte.getDistanceTo(target) <= radius
            )
            .sort((a, b) => this.myte.getDistanceTo(a) - this.myte.getDistanceTo(b));
    }

    getNearbyObjects(radius) {
        return (this.myte.parent?.gameMap?.objects || [])
            .filter(target =>
                target &&
                target.active &&
                !target.isDragging &&
                Number.isFinite(target.posX) &&
                Number.isFinite(target.posY) &&
                this.myte.getDistanceTo(target) <= radius
            )
            .sort((a, b) => this.myte.getDistanceTo(a) - this.myte.getDistanceTo(b));
    }

    getNearbyDroppedItems(radius) {
        return (this.myte.parent?.gameMap?.droppedItems || [])
            .filter(item =>
                item &&
                item.active &&
                !item.collected &&
                this.myte.getDistanceTo(item) <= radius
            )
            .sort((a, b) => this.myte.getDistanceTo(a) - this.myte.getDistanceTo(b));
    }

    getPlayAnchorTarget(targets) {
        return targets.find(target =>
            target &&
            target.element &&
            target.getConfig?.('interactionType') !== 'teleport'
        ) ?? null;
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

    getHomePosition() {
        return this.myte.getHomePosition();
    }
}
