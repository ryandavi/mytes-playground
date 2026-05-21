class LightMapObject extends BinaryStateAnimatedMapObject {
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
            const moodBoostAmount = this.getConfig('moodBoostAmount', 5);
            this.activeMyte.stats.updateMood(moodBoostAmount);
        }
    }

    render(container, parent) {
        const element = super.render(container, parent);
        element.classList.add('light-object');
        return element;
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
        this.moodBoostRadius = this.getConfig('moodBoostRadius', 180);
        this.moodBoostAmount = this.getConfig('moodBoostAmount', 0.15);
        this.boostCooldown = this.getConfig('boostCooldown', 1200);
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
            this.activeMyte.stats.updateMood(this.getConfig('startMoodBoostAmount', 4));
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

    applyMoodBoost(myte) {
        const now = performance.now();
        const lastBoost = this.lastBoostTimes.get(myte.id) || 0;

        if (now - lastBoost >= this.boostCooldown) {
            myte.stats.updateMood(this.moodBoostAmount);
            this.lastBoostTimes.set(myte.id, now);

            if (Math.random() < 0.12) {
                myte.queue.addExpression('happy');
            }
        }
    }

    checkNearbyMytes() {
        if (!this.isPlayingState || !this.mytes.length) return;

        this.mytes.forEach(myte => {
            if (!myte?.isActive) return;

            if (this.getDistanceTo(myte) <= this.moodBoostRadius) {
                this.applyMoodBoost(myte);
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
