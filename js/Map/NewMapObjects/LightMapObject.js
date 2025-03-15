class LightMapObject extends AnimatedMapObject {
    constructor(type, variant, posX, posY, config = {}, options = {}) {
        super(type, variant, posX, posY, config, options);
        this.state = this.getConfig('default', 'off');
    }

    getNextAction() {
        return {
            method: this.toggleLight.bind(this),
            allowed: true
        };
    }

    handleInteraction(parent, action) {
        const myte = parent.activeMyte;
        const distance = this.getDistanceFromMyte(myte);
        const interactionRadius = this.getConfig('interactionRadius', 100);

        if (distance <= interactionRadius) {
            this.playAnimation('flicker', () => action.method(parent));
            return true;
        }

        myte.queue.add('go_to_object', {
            target: this,
            onComplete: () => this.playAnimation('flicker', () => action.method(parent))
        });
        return true;
    }
    
    getDistanceFromMyte(myte) {
        return Math.hypot(this.posX - myte.posX, this.posY - myte.posY);
    }

    press(parent) {
        if (!this.active || !parent.activeMyte) return false;

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
        if (this.state === 'on' && parent.activeMyte) {
            const moodBoostAmount = this.getConfig('moodBoostAmount', 5);
            parent.activeMyte.stats.updateMood(moodBoostAmount);
        }
    }

    render(container, parent) {
        const element = super.render(container, parent);
        element.classList.add('light-object');
        element.setAttribute('data-state', this.state);
        return element;
    }
}