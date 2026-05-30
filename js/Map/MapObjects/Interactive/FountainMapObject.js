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

    getAiAffordances(context = {}, actor = null) {
        const affordances = super.getAiAffordances(context, actor).filter(a => a.actionId !== 'inspect');
        affordances.push({ actionId: 'drink_fountain', purpose: 'soothe' });

        if (this.canBeInspectedByAi()) {
            affordances.push({ actionId: 'inspect', purpose: 'inspect' });
        }

        return affordances;
    }
}
