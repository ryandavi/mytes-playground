class LightMapObject extends BinaryStateAnimatedMapObject {
    getBuffContextKey() {
        return `light:${this.id ?? `${this.posX},${this.posY}`}:aura`;
    }

    syncAuraBuff(myte, active) {
        myte?.buffs?.syncContextBuff?.(
            this.getBuffContextKey(),
            this.getConfig('auraBuffDefinition', null) ??
            this.getConfig('auraBuffId', 'light_aura'),
            {
                active,
                source: 'aura',
                payload: {
                    objectType: this.type,
                    objectId: this.id
                }
            }
        );
    }

    checkNearbyMytes() {
        const mytes = Array.isArray(this.mytes) ? this.mytes : [];
        if (mytes.length === 0) {
            return;
        }

        const radius = this.getConfig('aura', {}).radius ?? 160;
        mytes.forEach(myte => {
            if (!myte?.isActive) {
                this.syncAuraBuff(myte, false);
                return;
            }

            const inRange = this.isEnabled() && this.getDistanceTo(myte) <= radius;
            this.syncAuraBuff(myte, inRange);
        });
    }

    press(parent) {
        if (!this.active) return false;
        return this.runInteractionWhenInRange(() => {
            this.playAnimation('flicker', () => this.toggleLight(parent));
        });
    }

    toggleLight(parent) {
        this.toggleState({
            afterChange: () => this.applyEffects(parent)
        });
    }
    
    applyEffects(parent) {
        // Apply mood boost effect when turned on
        if (this.isEnabled() && this.activeMyte) {
            this.activeMyte.buffs?.applyBuff?.(
                this.getConfig('interactionBuffDefinition', null) ??
                this.getConfig('interactionBuffId', 'light_switch_delight'),
                {
                    source: 'interaction',
                    payload: {
                        objectType: this.type,
                        objectId: this.id
                    }
                }
            );
        }
    }

    render(container, parent) {
        const element = super.render(container, parent);
        element.classList.add('light-object');
        return element;
    }

    update(deltaTime) {
        super.update(deltaTime);
        this._auraCheckElapsed = (this._auraCheckElapsed ?? 0) + deltaTime;
        if (this._auraCheckElapsed >= this.getConfig('auraCheckInterval', 500)) {
            this._auraCheckElapsed = 0;
            this.checkNearbyMytes();
        }
    }

    getAiAffordances(context = {}, actor = null) {
        const affordances = super.getAiAffordances(context, actor).filter(affordance =>
            !(affordance.actionId === 'interact_object' && affordance.purpose === 'toggle')
        );

        if (!this.isEnabled()) {
            affordances.push({ actionId: 'interact_object', purpose: 'light_on' });
        }

        return affordances;
    }
}

class MusicBoxMapObject extends RangeInteractiveAnimatedMapObject {
    constructor(parent, type, variant, posX, posY, config = {}, options = {}) {
        super(parent, type, variant, posX, posY, config, options);
        this.isPlayingState = options.initialState ?? this.getConfig('defaultPlaying', false);
        const aura = this.getConfig('aura', {});
        this.moodBoostRadius = aura.radius ?? 180;
        this.moodBoostAmount = aura.moodBoost ?? 0.15;
        this.boostCooldown = aura.tickInterval ?? 1200;
        this.lastBoostTimes = new Map();
        this._proximityAccumulator = 0;
        this._proximityInterval = 500;
    }

    press(parent) {
        if (!this.active) return false;
        return this.runInteractionWhenInRange(() => this.togglePlayback(parent));
    }

    togglePlayback(parent) {
        this.isPlayingState = !this.isPlayingState;
        this.updatePlaybackState();

        const soundType = this.isPlayingState ? 'on' : 'off';
        const soundEffect = this.getConfig(`soundEffects.${soundType}`);
        if (soundEffect && this.gameMap?.soundManager) {
            this.gameMap.soundManager.play(soundEffect);
        }

        if (this.isPlayingState && this.activeMyte) {
            this.activeMyte.buffs?.applyBuff?.(
                this.getConfig('startBuffDefinition', null) ??
                this.getConfig('startBuffId', 'music_delight'),
                {
                    source: 'interaction',
                    payload: {
                        objectType: this.type,
                        objectId: this.id
                    }
                }
            );
            this.activeMyte.queue.addExpression('happy', 45, 1);
        }
    }

    updatePlaybackState() {
        if (!this.element) {
            return;
        }

        this.element.setAttribute('data-playing', this.isPlayingState ? 'true' : 'false');
        this.element.classList.toggle('is-playing', this.isPlayingState);
    }

    isMusicSource() {
        return true;
    }

    isActiveMusicSource() {
        return this.isPlayingState;
    }

    syncAuraBuff(myte, active) {
        myte?.buffs?.syncContextBuff?.(
            `music:${this.id ?? `${this.posX},${this.posY}`}:aura`,
            this.getConfig('auraBuffDefinition', null) ??
            this.getConfig('auraBuffId', 'music_aura'),
            {
                active,
                source: 'aura',
                payload: {
                    objectType: this.type,
                    objectId: this.id
                }
            }
        );
    }

    checkNearbyMytes() {
        if (!this.mytes.length) return;

        this.mytes.forEach(myte => {
            if (!myte?.isActive) {
                this.syncAuraBuff(myte, false);
                return;
            }

            const inRange = this.isPlayingState && this.getDistanceTo(myte) <= this.moodBoostRadius;
            this.syncAuraBuff(myte, inRange);

            if (inRange && Math.random() < 0.12) {
                myte.queue.addExpression('happy');
            }
        });
    }

    tickUpdate(tickDelta) {
        super.tickUpdate(tickDelta);

        this._proximityAccumulator += tickDelta;
        if (this._proximityAccumulator >= this._proximityInterval) {
            this._proximityAccumulator = 0;
            this.checkNearbyMytes();
        }
    }

    render(container, parent) {
        const element = super.render(container, parent);
        element.classList.add('music-box');
        this.updatePlaybackState();
        return element;
    }

    getAiAffordances(context = {}, actor = null) {
        const affordances = super.getAiAffordances(context, actor);

        if (!this.isPlayingState) {
            affordances.push({ actionId: 'interact_object', purpose: 'start_music' });
        }

        return affordances.filter((affordance, index, list) => {
            const key = `${affordance.actionId}:${affordance.purpose ?? ''}`;
            return list.findIndex(item => `${item.actionId}:${item.purpose ?? ''}` === key) === index;
        });
    }
}
