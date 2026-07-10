class MyteBuffController {
    static STATUS_SYNC_INTERVAL_MS = 200;

    constructor(myte) {
        this.myte = myte;
        this.activeBuffs = new Map();
        this.contextBuffs = new Map();
        this._version = 0;
        this._cachedEffectsVersion = -1;
        this._cachedEffects = {};
        this._statusSyncElapsed = 0;
        this._nextInstanceId = 1;
        this._buffLastApplied = new Map(); // buffId → timestamp of last successful application
    }

    update(deltaTime) {
        if (!this.myte?.stats) {
            return;
        }

        this._statusSyncElapsed += deltaTime;
        if (this._statusSyncElapsed >= MyteBuffController.STATUS_SYNC_INTERVAL_MS) {
            this._statusSyncElapsed = 0;
            this.syncStatusBuffs();
        }

        let expiredAny = false;
        for (const buff of this.activeBuffs.values()) {
            if (buff.durationMs <= 0) {
                continue;
            }

            buff.remainingMs = Math.max(0, buff.remainingMs - deltaTime);
            if (buff.remainingMs <= 0) {
                expiredAny = true;
            }
        }

        if (expiredAny) {
            for (const buff of Array.from(this.activeBuffs.values())) {
                if (buff.durationMs > 0 && buff.remainingMs <= 0) {
                    this.activeBuffs.delete(buff.instanceId);
                    this.myte.parent?.eventManager?.emit('myte:buff_expired', { myte: this.myte, buffId: buff.id, reason: 'expired' });
                }
            }
            this.bumpVersion();
        }
    }

    bumpVersion() {
        this._version++;
        this._cachedEffectsVersion = -1;
    }

    getVersion() {
        return this._version;
    }

    resolveBuffDefinition(buffIdOrDefinition) {
        if (typeof buffIdOrDefinition === 'string') {
            return BuffRegistry.getBuffSync(buffIdOrDefinition);
        }

        if (buffIdOrDefinition && typeof buffIdOrDefinition === 'object') {
            return BuffRegistry.normalizeDefinition(buffIdOrDefinition);
        }

        return null;
    }

    _isOnCooldown(definition) {
        const cooldown = definition?.reapplyCooldownMs;
        if (!cooldown || cooldown <= 0) return false;
        return SimClock.now() - (this._buffLastApplied.get(definition.id) ?? 0) < cooldown;
    }

    _recordApplied(definition) {
        this._buffLastApplied.set(definition.id, SimClock.now());
    }

    applyInstantEffects(definition) {
        if (!definition?.onApply || !this.myte?.stats?.applyStatEffects) {
            return;
        }

        this.myte.stats.applyStatEffects(definition.onApply);
    }

    _applyExcludes(definition) {
        if (!definition?.excludes?.length) return false;
        let removed = false;
        for (const excludedId of definition.excludes) {
            const excluded = this.findBuffById(excludedId);
            if (!excluded) continue;
            this.contextBuffs.forEach((instanceId, key) => {
                if (instanceId === excluded.instanceId) this.contextBuffs.delete(key);
            });
            this.activeBuffs.delete(excluded.instanceId);
            removed = true;
        }
        return removed;
    }

    applyBuff(buffIdOrDefinition, options = {}) {
        const definition = this.resolveBuffDefinition(buffIdOrDefinition);
        if (!definition) {
            return null;
        }

        const existing = this.findBuffById(definition.id);

        // Cooldown gate: don't refresh timer or re-fire instant effects if too soon
        if (this._isOnCooldown(definition)) {
            return existing;
        }

        const source = options.source || 'manual';

        if (existing) {
            if (definition.stackMode === 'replace') {
                this.activeBuffs.delete(existing.instanceId);
            } else {
                if (definition.stackMode === 'stack') {
                    existing.stacks = Math.min(definition.maxStacks, existing.stacks + 1);
                    this.applyInstantEffects(definition);
                } else {
                    existing.stacks = Math.min(existing.stacks, definition.maxStacks);
                }
                if (definition.refreshOnReapply && definition.durationMs > 0) {
                    existing.remainingMs = definition.durationMs;
                }
                existing.source = source;
                this._applyExcludes(definition);
                this._recordApplied(definition);
                this.bumpVersion();
                return existing;
            }
        }

        const buff = {
            instanceId: `buff-${this._nextInstanceId++}`,
            id: definition.id,
            definition,
            source,
            stacks: 1,
            durationMs: Math.max(0, Number(options.durationMs) || definition.durationMs || 0),
            remainingMs: Math.max(0, Number(options.durationMs) || definition.durationMs || 0),
            appliedAt: SimClock.now(),
            payload: options.payload || null,
            contextKeys: new Set()
        };

        if (typeof options.contextKey === 'string' && options.contextKey) {
            buff.contextKeys.add(options.contextKey);
        }

        this.activeBuffs.set(buff.instanceId, buff);
        this.applyInstantEffects(definition);
        this._recordApplied(definition);
        if (this._applyExcludes(definition)) {
            // bumpVersion called below covers both the new buff and removed excludes
        }
        this.bumpVersion();
        this.myte.parent?.eventManager?.emit('myte:buff_gained', { myte: this.myte, buffId: buff.id });
        return buff;
    }

    applyBuffById(buffId, options = {}) {
        return this.applyBuff(buffId, options);
    }

    removeContextKeyReference(instanceId, contextKey) {
        const buff = this.activeBuffs.get(instanceId);
        if (!buff?.contextKeys) {
            return false;
        }

        buff.contextKeys.delete(contextKey);
        if (buff.contextKeys.size > 0) {
            return false;
        }

        this.activeBuffs.delete(instanceId);
        return true;
    }

    removeContextBuff(contextKey) {
        const key = String(contextKey || '');
        if (!key) {
            return false;
        }

        const instanceId = this.contextBuffs.get(key);
        if (!instanceId) {
            return false;
        }

        this.contextBuffs.delete(key);
        const removed = this.removeContextKeyReference(instanceId, key);
        if (removed) {
            this.bumpVersion();
        }
        return removed;
    }

    syncContextBuff(contextKey, buffIdOrDefinition, {
        active = true,
        source = 'context',
        payload = null,
        durationMs = null
    } = {}) {
        const key = String(contextKey || '');
        if (!key) {
            return null;
        }

        if (!active) {
            this.removeContextBuff(key);
            return null;
        }

        const definition = this.resolveBuffDefinition(buffIdOrDefinition);
        if (!definition) {
            this.removeContextBuff(key);
            return null;
        }

        const mappedInstanceId = this.contextBuffs.get(key);
        const mappedBuff = mappedInstanceId ? this.activeBuffs.get(mappedInstanceId) : null;
        if (mappedBuff?.id === definition.id) {
            mappedBuff.payload = payload;
            mappedBuff.source = source;
            if (Number.isFinite(durationMs) && durationMs > 0) {
                mappedBuff.durationMs = durationMs;
                mappedBuff.remainingMs = durationMs;
            }
            return mappedBuff;
        }

        if (mappedInstanceId) {
            this.removeContextBuff(key);
        }

        const sharedBuff = Array.from(this.activeBuffs.values()).find(buff =>
            buff.id === definition.id &&
            (buff.source === source || buff.contextKeys?.size > 0)
        );

        if (sharedBuff) {
            sharedBuff.contextKeys.add(key);
            sharedBuff.payload = payload;
            sharedBuff.source = source;
            if (Number.isFinite(durationMs) && durationMs > 0) {
                sharedBuff.durationMs = durationMs;
                sharedBuff.remainingMs = durationMs;
            }
            this.contextBuffs.set(key, sharedBuff.instanceId);
            return sharedBuff;
        }

        const buff = this.applyBuff(definition, {
            source,
            payload,
            durationMs,
            contextKey: key
        });

        if (buff) {
            this.contextBuffs.set(key, buff.instanceId);
        }

        return buff;
    }

    removeBuff(instanceId, { reason = 'manual' } = {}) {
        const buff = this.activeBuffs.get(instanceId);
        if (!buff) {
            return false;
        }

        if (!this.canCancelBuff(buff) && reason === 'manual') {
            return false;
        }

        this.contextBuffs.forEach((mappedInstanceId, key) => {
            if (mappedInstanceId === instanceId) {
                this.contextBuffs.delete(key);
            }
        });
        this.activeBuffs.delete(instanceId);
        this.bumpVersion();
        this.myte.parent?.eventManager?.emit('myte:buff_expired', { myte: this.myte, buffId: buff.id, reason });
        return true;
    }

    clear() {
        if (this.activeBuffs.size === 0) {
            return;
        }

        this.activeBuffs.clear();
        this.contextBuffs.clear();
        this.bumpVersion();
    }

    canCancelBuff(buff) {
        return buff?.definition?.cancellable === true && buff?.source !== 'status';
    }

    findBuffById(buffId) {
        const normalizedId = BuffRegistry.normalizeBuffId(buffId);
        return Array.from(this.activeBuffs.values()).find(buff => buff.id === normalizedId) ?? null;
    }

    resolveActionMetadata(actionOrMetadata) {
        return actionOrMetadata?.constructor?.metadata ?? actionOrMetadata ?? {};
    }

    handleActionLike(actionOrMetadata, payload = {}) {
        const metadata = this.resolveActionMetadata(actionOrMetadata);
        if (!metadata.id && !metadata.category) {
            return;
        }

        this.trigger('actionComplete', {
            ...payload,
            actionId: metadata.id,
            category: metadata.category,
            action: payload.action ?? actionOrMetadata
        });
    }

    handleActionComplete(action) {
        this.handleActionLike(action);
    }

    handleItemConsumed(payload = {}) {
        this.trigger('itemConsumed', payload);
    }

    emitEvent(name, payload = {}) {
        this.trigger('event', { ...payload, name });
    }

    trigger(triggerType, payload = {}) {
        const definitions = BuffRegistry.getBuffsForTrigger(triggerType, payload);
        definitions.forEach(definition => {
            this.applyBuffById(definition.id, {
                source: triggerType,
                payload
            });
        });
    }

    syncStatusBuffs() {
        const definitions = BuffRegistry.getStatusDefinitions();
        let changed = false;

        definitions.forEach(definition => {
            const active = this.findBuffById(definition.id);
            const shouldApply = this.matchesStatusDefinition(definition);

            if (shouldApply && !active) {
                this.applyBuffById(definition.id, { source: 'status' });
                return;
            }

            if (!shouldApply && active?.source === 'status') {
                this.activeBuffs.delete(active.instanceId);
                changed = true;
            }
        });

        if (changed) {
            this.bumpVersion();
        }
    }

    matchesStatusDefinition(definition) {
        const trigger = definition?.triggers?.status;
        if (!trigger) {
            return false;
        }

        const conditions = Array.isArray(trigger.conditions) ? trigger.conditions : [];
        const anyConditions = Array.isArray(trigger.anyConditions) ? trigger.anyConditions : [];

        if (conditions.some(condition => !this.matchesCondition(condition))) {
            return false;
        }

        if (anyConditions.length > 0 && !anyConditions.some(condition => this.matchesCondition(condition))) {
            return false;
        }

        return conditions.length > 0 || anyConditions.length > 0;
    }

    matchesCondition(condition = {}) {
        const value = this.resolveConditionValue(condition.stat);
        if (condition.eq !== undefined && value !== condition.eq) return false;
        if (condition.ne !== undefined && value === condition.ne) return false;
        if (condition.gt !== undefined && !(value > condition.gt)) return false;
        if (condition.gte !== undefined && !(value >= condition.gte)) return false;
        if (condition.lt !== undefined && !(value < condition.lt)) return false;
        if (condition.lte !== undefined && !(value <= condition.lte)) return false;
        if (Array.isArray(condition.oneOf) && !condition.oneOf.includes(value)) return false;
        return true;
    }

    resolveConditionValue(statName) {
        const stats = this.myte.stats;
        switch (statName) {
            case 'energy':    return stats?.energy    ?? 0;
            case 'health':    return stats?.health    ?? 0;
            case 'fun':       return stats?.fun       ?? 0;
            case 'social':    return stats?.social    ?? 0;
            case 'satiety':   return stats?.satiety   ?? 0;
            case 'comfort':   return stats?.comfort   ?? 0;
            case 'confidence': return stats?.confidence ?? 0;
            case 'energyRatio':    return stats?.getEnergyRatio?.()    ?? 0;
            case 'healthRatio':    return stats?.getHealthRatio?.()    ?? 0;
            case 'funRatio':       return stats?.getFunRatio?.()       ?? 0;
            case 'socialRatio':    return stats?.getSocialRatio?.()    ?? 0;
            case 'satietyRatio':   return stats?.getSatietyRatio?.()   ?? 0;
            case 'comfortRatio':   return stats?.getComfortRatio?.()   ?? 0;
            case 'confidenceRatio': return stats?.getConfidenceRatio?.() ?? 0;
            case 'currentMood': return stats?.getDerivedMood?.() ?? 'neutral';
            case 'currentActionId': return stats?.getCurrentActionId?.() ?? null;
            case 'isActive': return this.myte.isActive === true;
            default:
                return 0;
        }
    }

    getAggregateEffects() {
        if (this._cachedEffectsVersion === this._version) {
            return this._cachedEffects;
        }

        const aggregate = {};
        this.activeBuffs.forEach(buff => {
            this.mergeEffectTree(aggregate, buff.definition.effects, buff.stacks);
        });

        this._cachedEffects = aggregate;
        this._cachedEffectsVersion = this._version;
        return aggregate;
    }

    mergeEffectTree(target, source, stacks = 1) {
        if (!source || typeof source !== 'object') {
            return;
        }

        Object.entries(source).forEach(([key, value]) => {
            if (value != null && typeof value === 'object' && !Array.isArray(value)) {
                target[key] = target[key] || {};
                this.mergeEffectTree(target[key], value, stacks);
                return;
            }

            if (!Number.isFinite(value)) {
                return;
            }

            if (key.endsWith('Multiplier')) {
                const baseValue = Number.isFinite(target[key]) ? target[key] : 1;
                target[key] = baseValue * Math.pow(value, stacks);
            } else {
                const baseValue = Number.isFinite(target[key]) ? target[key] : 0;
                target[key] = baseValue + (value * stacks);
            }
        });
    }

    getEffectValue(path, fallbackValue = 0) {
        const value = path.split('.').reduce((current, segment) => current?.[segment], this.getAggregateEffects());
        return value == null ? fallbackValue : value;
    }

    getVisibleBuffs() {
        return Array.from(this.activeBuffs.values())
            .filter(buff => buff.definition.hidden !== true)
            .sort((a, b) => {
                if (a.definition.priority !== b.definition.priority) {
                    return b.definition.priority - a.definition.priority;
                }

                if (a.definition.kind !== b.definition.kind) {
                    return a.definition.kind === 'debuff' ? -1 : 1;
                }

                return a.appliedAt - b.appliedAt;
            })
            .map(buff => ({
                ...buff,
                label: buff.definition.label,
                kind: buff.definition.kind,
                category: buff.definition.category,
                icon: buff.definition.icon,
                description: buff.definition.description,
                tooltip: buff.definition.tooltip,
                cancellable: this.canCancelBuff(buff),
                progressRatio: buff.durationMs > 0
                    ? Utility.clamp(buff.remainingMs / Math.max(buff.durationMs, 1), 0, 1)
                    : null,
                remainingLabel: buff.durationMs > 0
                    ? this.formatRemainingMs(buff.remainingMs)
                    : 'Ongoing'
            }));
    }

    formatRemainingMs(ms) {
        const seconds = Math.max(0, Math.ceil(ms / 1000));
        if (seconds >= 60) {
            const minutes = Math.floor(seconds / 60);
            const remSeconds = seconds % 60;
            return remSeconds > 0 ? `${minutes}m ${remSeconds}s` : `${minutes}m`;
        }
        return `${seconds}s`;
    }
}
