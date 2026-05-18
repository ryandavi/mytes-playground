class LightMapObject extends AnimatedMapObject {
    constructor(parent, type, variant, posX, posY, config = {}, options = {}) {
        super(parent, type, variant, posX, posY, config, options);
        this.state = this.getConfig('default', 'off');
    }

    getNextAction() {
        return {
            method: this.toggleLight.bind(this),
            allowed: true
        };
    }

    handleInteraction(parent, action) {
        const myte = this.activeMyte;
        if (!myte) return false;

        if (this.isInInteractionRange(myte)) {
            this.playAnimation('flicker', () => action.method(parent));
            return true;
        }

        myte.queue.add('go_to_object', {
            target: this,
            onComplete: () => this.playAnimation('flicker', () => action.method(parent))
        });
        return true;
    }

    press(parent) {
        if (!this.active || !this.activeMyte) return false;

        const action = this.getNextAction();
        return this.handleInteraction(parent, action);
    }

    toggleLight(parent) {
        const newState = this.state === 'off' ? 'on' : 'off';
        const animationSequence = this.getAnimationSequence(newState);

        // Update state
        this.state = newState;
        this.updateElementState();
        
        // Play animation sequence
        const [firstAnim, secondAnim] = animationSequence;
        this.playAnimation(firstAnim, () => {
            this.playAnimation(secondAnim);
        });

        // Apply effects
        this.applyEffects(parent);
    }
    
    getAnimationSequence(state) {
        const sequences = {
            'off': ['turnOn', 'idle'],
            'on': ['turnOff', 'off']
        };
        return sequences[state] || ['idle', 'idle'];
    }
    
    updateElementState() {
        if (this.element) {
            this.element.setAttribute('data-state', this.state);
        }
    }
    
    applyEffects(parent) {
        // Apply mood boost effect when turned on
        if (this.state === 'on' && this.activeMyte) {
            const moodBoostAmount = this.getConfig('moodBoostAmount', 5);
            this.activeMyte.stats.updateMood(moodBoostAmount);
        }
    }

    render(container, parent) {
        const element = super.render(container, parent);
        element.classList.add('light-object');
        element.setAttribute('data-state', this.state);
        return element;
    }
}
