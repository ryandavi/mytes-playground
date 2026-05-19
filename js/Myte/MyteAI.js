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
        const thinkInterval = this.getThinkInterval();
        if (this.elapsedSinceThink < thinkInterval) {
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
        const candidates = [
            this.buildRestCandidate(),
            this.buildSocialCandidate(),
            this.buildDroppedItemCandidate(),
            this.buildInteractionCandidate(),
            this.buildWanderCandidate(),
            this.buildIdleCandidate()
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

    buildRestCandidate() {
        const stats = this.myte.stats;
        if (!stats) return null;

        const energy = stats.getEnergyRatio();
        const health = stats.getHealthRatio();
        let score = 0;

        if (this.mode === MOVE_AUTONOMY_TYPES.REST) score += 45;
        score += (1 - energy) * 110;
        score += (1 - health) * 35;

        if (score < 28) {
            return null;
        }

        return {
            label: 'rest',
            score: this.applyRepeatPenalty(score, 'rest'),
            execute: () => {
                if (energy < 0.18 || health < 0.3) {
                    this.myte.queue.addSleep(220);
                } else if (energy < 0.35) {
                    this.myte.queue.addSimpleSleep(150);
                } else {
                    this.myte.queue.addIdle(80);
                }

                if (stats.setMood) {
                    stats.setMood('sleepy');
                }
            }
        };
    }

    buildSocialCandidate() {
        const stats = this.myte.stats;
        const nearbyMytes = this.getNearbyMytes(this.socialRadius);
        if (!stats || nearbyMytes.length === 0) {
            return null;
        }

        const neediness = stats.getTraitNormalized('neediness');
        const activity = stats.getTraitNormalized('activity');
        const moodNeed = 1 - stats.getMoodRatio();
        const energy = stats.getEnergyRatio();
        let score = 14 + (neediness * 28) + (moodNeed * 24);

        if (this.mode === MOVE_AUTONOMY_TYPES.SOCIAL) score += 38;
        if (energy < 0.25) score -= 18;

        if (score < 26) {
            return null;
        }

        const target = nearbyMytes[0];
        const actionId = energy > 0.65 && activity > 0.6
            ? 'play_tag'
            : (moodNeed > 0.45 ? 'show_affection' : 'greet');

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

    buildInteractionCandidate() {
        if (this.mode === MOVE_AUTONOMY_TYPES.REST) {
            return null;
        }

        const stats = this.myte.stats;
        const curiosity = stats?.getTraitNormalized?.('curiosity') ?? 0.5;
        const moodNeed = stats ? 1 - stats.getMoodRatio() : 0;
        const nearbyObjects = this.getNearbyObjects(this.objectSearchRadius);

        let best = null;
        for (const target of nearbyObjects) {
            const candidate = this.getBestInteractionForTarget(target, curiosity, moodNeed);
            if (!candidate || (best && candidate.score <= best.score)) {
                continue;
            }
            best = candidate;
        }

        return best;
    }

    getBestInteractionForTarget(target, curiosity, moodNeed) {
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
            let score = 18 + (curiosity * 24) + Math.max(0, 120 - distance) * 0.12;

            switch (action.id) {
                case 'drink_fountain':
                case 'smell_flower':
                    score += moodNeed * 28;
                    break;
                case 'open_chest':
                case 'harvest':
                    score += curiosity * 18;
                    break;
                case 'water_plant':
                case 'inspect':
                    score += 10;
                    break;
                default:
                    break;
            }

            if (this.mode === MOVE_AUTONOMY_TYPES.INTERACT) {
                score += 25;
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

    buildWanderCandidate() {
        const stats = this.myte.stats;
        const activity = stats?.getTraitNormalized?.('activity') ?? 0.5;
        const curiosity = stats?.getTraitNormalized?.('curiosity') ?? 0.5;
        const energy = stats?.getEnergyRatio?.() ?? 1;

        const target = this.findWanderTarget();
        if (!target) {
            return null;
        }

        let score = 16 + (activity * 24) + (curiosity * 10);
        if (this.mode === MOVE_AUTONOMY_TYPES.WANDER) score += 38;
        if (energy < 0.25) score -= 14;

        return {
            label: 'wander',
            score: this.applyRepeatPenalty(score, 'wander'),
            execute: () => {
                if (energy > 0.7 && Math.random() < 0.12) {
                    this.myte.queue.addJump();
                }

                this.myte.queue.add('astar-move', { target });

                if (Math.random() < 0.35) {
                    this.myte.queue.addIdle(35);
                }
            }
        };
    }

    buildIdleCandidate() {
        return {
            label: 'idle',
            score: this.applyRepeatPenalty(8, 'idle'),
            execute: () => {
                if (Math.random() < 0.25) {
                    this.myte.queue.addExpression('surprise', 30, 1);
                }
                this.myte.queue.addIdle(45);
            }
        };
    }

    buildDroppedItemCandidate() {
        const droppedItems = this.myte.parent?.gameMap?.droppedItems;
        if (!droppedItems || droppedItems.length === 0) return null;

        const stats = this.myte.stats;
        const curiosity = stats?.getTraitNormalized?.('curiosity') ?? 0.5;
        const energy = stats?.getEnergyRatio?.() ?? 1;

        let best = null;
        for (const item of droppedItems) {
            if (item.collected || !item.active) continue;

            const distance = this.myte.getDistanceTo?.(item) ?? Infinity;
            if (distance > this.objectSearchRadius) continue;

            let score = 10 + (curiosity * 18) + Math.max(0, 120 - distance) * 0.1;

            // Curiosity boost for recently dropped items (fades over 30s)
            const age = Date.now() - (item.droppedAt ?? 0);
            if (age < 30000) score += 22 * (1 - age / 30000);

            // Hunger-driven boost for food
            if (item.type?.toUpperCase() === 'FOOD' && energy < 0.7) {
                score += (1 - energy) * 50;
            }

            score = this.applyRepeatPenalty(score, `dropped_item:${item.type}`);

            if (!best || score > best.score) {
                best = {
                    label: `dropped_item:${item.type}`,
                    score,
                    execute: () => {
                        this.myte.queue.add('astar-move', {
                            target: { x: item.posX, y: item.posY }
                        });
                    }
                };
            }
        }

        return best;
    }

    applyRepeatPenalty(score, label) {
        if (this.lastDecisionLabel !== label) {
            return score;
        }

        const elapsed = Date.now() - this.lastDecisionTime;
        if (elapsed > 4000) {
            return score;
        }

        return score * 0.7;
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

    findWanderTarget() {
        const worldBounds = this.myte.parent?.getWorldBounds?.();
        if (!worldBounds) {
            return null;
        }

        const home = this.getHomePosition();
        const origin = this.mode === MOVE_AUTONOMY_TYPES.WANDER
            ? { x: this.myte.posX, y: this.myte.posY }
            : home;
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
        const rect = this.myte.parent.getLocalOffset(this.myte.elements.wrapper);
        return {
            x: rect.left,
            y: rect.top
        };
    }
}
