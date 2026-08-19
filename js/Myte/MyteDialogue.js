class MyteDialogue {
    // The bubble shapes, and the modifiers that recolour one without changing
    // its shape. Both are cleared before each message, so the list is the one
    // place that has to know what a bubble can wear.
    static STYLES = ['arrow', 'thought', 'emoji', 'alert', 'question', 'whisper'];
    static MODIFIERS = ['is-refusal'];

    constructor(myte) {
        // Main dialogue element
        this.dialogue = myte.duplicate.querySelector('.dialogue');
        if (!this.dialogue) {
            throw new Error('Dialogue element not found');
        }

        // Text span element inside dialogue
        this.textElement = this.dialogue.querySelector('.text');
        if (!this.textElement) {
            throw new Error('Text element not found in dialogue');
        }

        // Queue for managing multiple dialogue messages
        this.messageQueue = [];
        this.isDisplaying = false;
        this.isDestroyed = false;
        this.pendingTimeouts = new Set();
        this._lastAnswer = new Map();

        // Default settings
        this.settings = {
            baseDisplayTime: 3000,    // Base time in ms to display text
            timePerCharacter: 50,     // Additional ms per character
            maxDisplayTime: 8000,     // Maximum display time in ms
            transitionDuration: 500,   // Duration of fade transition in ms
            delayBetweenMessages: 250
        };

        // Bind event handlers
        this.handleClick = this.handleClick.bind(this);
        this.dialogue.addEventListener('click', this.handleClick);

        // Add transition end listener
        this.handleTransitionEnd = this.handleTransitionEnd.bind(this);
        this.dialogue.addEventListener('transitionend', this.handleTransitionEnd);

    }

    // Show a new dialogue message
    showMessage(text, style = 'arrow') {
        // Add message to queue with style
        this.messageQueue.push({ text, style });

        if (!this.isDisplaying) {
            this.displayNextMessage();
        }
    }

    // A wordless bubble: `name` is a sprite symbol, not text to read.
    showIcon(name, style = 'thought', modifier = null) {
        this.messageQueue.push({ text: '', icon: name, style, modifier });

        if (!this.isDisplaying) {
            this.displayNextMessage();
        }
    }

    // "I would rather not." The bubble carries the icon of whatever was asked
    // for, struck through — so it reads as a refusal of *that*, not a generic
    // complaint. An action with no icon of its own still gets an answer; a
    // silent refusal reads as a broken button.
    showRefusal(icon) {
        const symbol = Utility.isIconName(icon) ? icon : SiteConfig.myte.bubbles.fallbackIcon;
        if (!this._isNewAnswer('refusal', symbol)) return false;

        this.showIcon(symbol, 'thought', 'is-refusal');
        return true;
    }

    // The other half of the same conversation: "yes, going to do that." No
    // fallback icon here — an acknowledgement nobody can read is just noise,
    // and unlike a refusal its absence says nothing wrong.
    showIntent(icon) {
        if (!Utility.isIconName(icon)) return false;
        if (!this._isNewAnswer('intent', icon)) return false;

        this.showIcon(icon, 'thought');
        return true;
    }

    // Mashing a button is one question, so it gets one answer. Keyed by kind as
    // well as icon: refusing a bed and then agreeing to it are different
    // answers, and the second should not be swallowed by the first.
    _isNewAnswer(kind, icon) {
        const key = `${kind}:${icon}`;
        const now = SimClock.now();
        if ((now - (this._lastAnswer.get(key) ?? -Infinity)) < SiteConfig.myte.bubbles.answerIntervalMs) {
            return false;
        }

        this._lastAnswer.set(key, now);
        return true;
    }

    // Display the next message in the queue
    async displayNextMessage() {
        if (this.isDestroyed || this.messageQueue.length === 0 || this.isDisplaying) {
            return;
        }


        const { text, icon, style, modifier } = this.messageQueue.shift();
        this.isDisplaying = true;

        this.dialogue.classList.remove(...MyteDialogue.STYLES, ...MyteDialogue.MODIFIERS);
        this.dialogue.classList.add(style);
        if (MyteDialogue.MODIFIERS.includes(modifier)) this.dialogue.classList.add(modifier);

        // Update text and show dialogue
        Utility.renderIconLabel(this.textElement, icon, text);
        await this.wait(50); // Small delay before showing
        this.dialogue.classList.add('is-visible');

        // Calculate display duration based on text length
        const duration = this.calculateDisplayDuration(text);



        try {
            await this.wait(duration);
            await this.fadeOut();

            // Check if there are more messages to display
            if (this.messageQueue.length > 0) {
                await this.wait(this.settings.delayBetweenMessages); // Small delay between messages
                this.displayNextMessage();
            }
        } catch (error) {
            console.error('Error displaying message:', error);
        }



    }

    // Calculate how long to display the text based on length
    calculateDisplayDuration(text) {
        const duration = this.settings.baseDisplayTime +
            (text.length * this.settings.timePerCharacter);
        return Math.min(duration, this.settings.maxDisplayTime);
    }

    // Handle clicks on the dialogue
    handleClick() {
        if (this.isDisplaying) {
            this.skipCurrentMessage();
        }
    }

    // Skip the current message
    async skipCurrentMessage() {
        await this.fadeOut();

        if (this.messageQueue.length > 0) {
            await this.wait(this.settings.delayBetweenMessages);
            this.displayNextMessage();
        }
    }

    async clear() {
        await this.fadeOut();
        this.messageQueue = [];
    }

    // Handle transition end events
    handleTransitionEnd(event) {
        // Only handle transition end for the dialogue element itself
        if (event.target === this.dialogue && !this.dialogue.classList.contains('is-visible')) {
            this.isDisplaying = false;
        }
    }

    // Fade out animation
    async fadeOut() {
        return new Promise(resolve => {
            if (this.isDestroyed) {
                resolve();
                return;
            }

            // Remove visible class to trigger fade out
            this.dialogue.classList.remove('is-visible');

            // Wait for transition duration before resolving
            const timeoutId = setTimeout(() => {
                this.pendingTimeouts.delete(timeoutId);
                resolve();
            }, this.settings.transitionDuration);
            this.pendingTimeouts.add(timeoutId);
        });
    }

    // Clear all pending messages
    clearQueue() {
        this.messageQueue = [];
    }

    // Update settings
    updateSettings(newSettings) {
        this.settings = {
            ...this.settings,
            ...newSettings
        };
    }

    // Utility method for creating promises
    wait(ms) {
        return new Promise(resolve => {
            const timeoutId = setTimeout(() => {
                this.pendingTimeouts.delete(timeoutId);
                resolve();
            }, ms);
            this.pendingTimeouts.add(timeoutId);
        });
    }

    // Clean up event listeners
    dispose() {
        this.isDestroyed = true;
        this.pendingTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
        this.pendingTimeouts.clear();
        this.dialogue.removeEventListener('click', this.handleClick);
        this.dialogue.removeEventListener('transitionend', this.handleTransitionEnd);
    }
}
