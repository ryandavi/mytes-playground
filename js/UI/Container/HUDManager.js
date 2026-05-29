class HUDManager extends UIComponent {
    constructor(parent) {
        super(parent);
        this.hudElement = document.querySelector('#hud-active-pet');
        this.nameElement = this.hudElement?.querySelector('.name') || null;
        this.moodElement = this.hudElement?.querySelector('.mood') || null;
        this.energyElement = this.hudElement?.querySelector('.energy') || null;
        this.currentMoodEffect = null;
        this.lastRenderedState = {
            visible: false,
            myteId: null,
            name: null,
            mood: null,
            energy: null,
            moodEffect: null
        };
    }

    getEnergyLabel(ratio) {
        if (ratio <= 0.1) return 'Critical';
        if (ratio <= 0.3) return 'Low';
        if (ratio <= 0.55) return 'Okay';
        if (ratio <= 0.8) return 'Good';
        return 'Full';
    }

    update() {
        if (!this.hudElement) return;

        const activeMyte = this.parent.getActiveMyte();

        if (!activeMyte) {
            if (this.lastRenderedState.visible) {
                this.hudElement.classList.remove('is-visible');
                this.lastRenderedState.visible = false;
            }
            return;
        }

        if (!this.lastRenderedState.visible) {
            this.hudElement.classList.add('is-visible');
            this.lastRenderedState.visible = true;
        }

        const mood = activeMyte.stats.getDerivedMood?.() ?? 'neutral';
        const energyRatio = activeMyte.stats.getEnergyRatio();
        const energy = `${this.getEnergyLabel(energyRatio)} ${Math.round(energyRatio * 100)}%`;
        const currentAction = activeMyte.queue.getCurrentAction();
        const actionMetadata = currentAction?.constructor?.metadata;
        const moodEffectText = actionMetadata?.affectsMood
            ? `Mood ${actionMetadata.moodEffect > 0 ? '+' : ''}${actionMetadata.moodEffect}`
            : null;

        if (this.lastRenderedState.myteId !== activeMyte.id || this.lastRenderedState.name !== activeMyte.name) {
            this.nameElement.textContent = activeMyte.name;
            this.lastRenderedState.myteId = activeMyte.id;
            this.lastRenderedState.name = activeMyte.name;
        }

        if (this.lastRenderedState.mood !== mood) {
            this.moodElement.textContent = mood;
            this.lastRenderedState.mood = mood;
        }

        if (this.lastRenderedState.energy !== energy) {
            this.energyElement.textContent = energy;
            this.lastRenderedState.energy = energy;
        }

        if (this.lastRenderedState.moodEffect !== moodEffectText) {
            this.currentMoodEffect?.remove();
            this.currentMoodEffect = null;

            if (moodEffectText) {
                const moodEffect = document.createElement('div');
                moodEffect.className = 'mood-effect';
                moodEffect.textContent = moodEffectText;
                this.hudElement.appendChild(moodEffect);
                this.currentMoodEffect = moodEffect;
            }

            this.lastRenderedState.moodEffect = moodEffectText;
        }
    }

    dispose() {
        this.hudElement = null;
        this.nameElement = null;
        this.moodElement = null;
        this.currentMoodEffect = null;
    }
}
