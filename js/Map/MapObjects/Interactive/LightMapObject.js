class LightMapObject extends withAura(ToggleableMapObject) {
    // isAuraActive() defaults to this.isEnabled() via the mixin — no override needed.

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
        if (this.isEnabled() && this.activeMyte) {
            this.activeMyte.buffs?.applyBuff?.(
                this.getConfig('interactionBuffDefinition', null) ??
                this.getConfig('interactionBuffId', 'light_switch_delight'),
                {
                    source: 'interaction',
                    payload: { objectType: this.type, objectId: this.id }
                }
            );
        }
    }

    render(container, parent) {
        const element = super.render(container, parent);
        element.classList.add('light-object');
        return element;
    }

    getAiAffordances(context = {}, actor = null) {
        return super.getAiAffordances(context, actor).filter(a =>
            !(a.actionId === 'interact_object' && a.purpose === 'toggle')
        );
    }
}

class MusicBoxMapObject extends withAura(InteractiveMapObject) {
    constructor(parent, type, variant, posX, posY, config = {}, options = {}) {
        super(parent, type, variant, posX, posY, config, options);
        this.isPlayingState = options.initialState ?? this.getConfig('defaultPlaying', false);
    }

    isAuraActive() {
        return this.isPlayingState;
    }

    getAuraExpression() {
        return 'happy';
    }

    getAuraExpressionChance() {
        return 0.12;
    }

    press(parent) {
        if (!this.active) return false;
        return this.runInteractionWhenInRange(() => this.togglePlayback(parent));
    }

    togglePlayback(parent) {
        this.isPlayingState = !this.isPlayingState;
        this.updatePlaybackState();
        this.playConfiguredSound(this.isPlayingState ? 'on' : 'off');

        if (this.isPlayingState && this.activeMyte) {
            this.activeMyte.buffs?.applyBuff?.(
                this.getConfig('startBuffDefinition', null) ??
                this.getConfig('startBuffId', 'music_delight'),
                {
                    source: 'interaction',
                    payload: { objectType: this.type, objectId: this.id }
                }
            );
            this.activeMyte.queue.addExpression('happy', 45, 1);
        }
    }

    updatePlaybackState() {
        if (!this.element) return;
        this.element.setAttribute('data-playing', this.isPlayingState ? 'true' : 'false');
        this.element.classList.toggle('is-playing', this.isPlayingState);
    }

    isMusicSource() {
        return true;
    }

    isActiveMusicSource() {
        return this.isPlayingState;
    }

    render(container, parent) {
        const element = super.render(container, parent);
        element.classList.add('music-box');
        this.updatePlaybackState();
        return element;
    }
}
