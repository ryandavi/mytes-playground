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
}
