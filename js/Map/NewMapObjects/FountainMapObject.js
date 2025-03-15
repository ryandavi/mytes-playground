class FountainMapObject extends AnimatedMapObject {
    constructor(type, variant, posX, posY, config = {}, options = {}) {
        super(type, variant, posX, posY, config, options);
        
        // State
        this.state = this.getConfig('default', 'on');

        // Fountain configuration
        this.moodBoostRadius = this.getConfig('moodBoostRadius', 150);
        this.moodBoostAmount = this.getConfig('moodBoostAmount', 0.1);
        this.boostCooldown = this.getConfig('boostCooldown', 1000);

        // Boost tracking with Map for better performance
        this.lastBoostTimes = new Map();
    }

    getNextAction() {
        return {
            method: this.toggle.bind(this),
            allowed: true
        };
    }

    handleInteraction(parent, action) {
        const myte = parent.activeMyte;
        const distance = this.getDistanceFromMyte(myte);
        const interactionRadius = this.getConfig('interactionRadius', 100);

        if (distance <= interactionRadius) {
            action.method(parent);
            return true;
        }

        myte.queue.add('go_to_object', {
            target: this,
            onComplete: () => action.method(parent)
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

    toggle(parent) {
        const newState = this.state === 'on' ? 'off' : 'on';
        const animationSequence = this.getAnimationSequence(newState);

        // Update state
        this.state = newState;
        this.updateElementState();
        
        // Play animation sequence
        const [firstAnim, secondAnim] = animationSequence;
        this.playAnimation(firstAnim, () => {
            this.playAnimation(secondAnim);
        });
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

    applyMoodBoost(myte) {
        const now = Date.now();
        const lastBoost = this.lastBoostTimes.get(myte.id) || 0;

        if (now - lastBoost >= this.boostCooldown) {
            myte.stats.updateMood(this.moodBoostAmount);
            this.lastBoostTimes.set(myte.id, now);

            // Occasional happiness expression
            if (Math.random() < 0.1) {
                myte.queue.addExpression('happy');
            }
        }
    }

    checkNearbyMytes(parent) {
        if (this.state !== 'on' || !parent.mytes) return;

        parent.mytes.forEach(myte => {
            if (!myte.isActive) return;

            const distance = Math.hypot(
                this.posX - myte.posX,
                this.posY - myte.posY
            );

            if (distance <= this.moodBoostRadius) {
                this.applyMoodBoost(myte);
            }
        });
    }

    render(container, parent) {
        const element = super.render(container, parent);
        element.classList.add('fountain');
        element.setAttribute('data-state', this.state);
        return element;
    }

    update(parent) {
        super.update(parent);
        this.checkNearbyMytes(parent);
    }
}