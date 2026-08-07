class FountainMapObject extends withAura(ToggleableMapObject) {
    getApproachMode() {
        return 'adjacent';
    }

    isAuraActive() {
        return this.isEnabled();
    }

    getAuraExpression() {
        return 'happy';
    }

    getAuraExpressionChance() {
        return 0.1;
    }

    press(parent) {
        if (!this.active) return false;
        return this.runInteractionWhenInRange(() => this.toggleState());
    }

    render(container, parent) {
        const element = super.render(container, parent);
        element.classList.add('fountain');
        return element;
    }

}
