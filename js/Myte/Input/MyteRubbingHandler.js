class MyteRubbingHandler {
	constructor(myte) {
		this.myte = myte;
		this.element = myte.sprite;

		// State tracking
		this.isRubbing = false;
		this.lastX = 0;
		this.lastY = 0;
		this.lastTimestamp = 0;
		this.lastRubTimestamp = 0;
		this.rubCounter = 0;
		this.totalRubDistance = 0;
		this.lastRubDirection = null;
		this.consecutiveSameDirection = 0;

		// Configuration
		this.config = {
			minRubs: 3,              // Minimum rubs needed for a valid interaction
			maxRubs: 25,             // Maximum effective rubs
			rubbingThreshold: 2,     // Minimum velocity for a valid rub
			minTimeBetweenRubs: 5000, // Cooldown between rub sessions (ms)
			directionThreshold: 10,   // Pixels needed to determine direction
			moodBoostPerRub: 5,      // How much each rub increases mood
			moodPenaltyOverrub: -2,  // Mood penalty for rubbing too much
			validRubTimeout: 1000,    // Time window for connected rubs (ms)
			hapticDuration: 50,      // Duration of haptic feedback (ms)
		};

		// Bind event handlers with proper context
		this.handleStart = this.handleStart.bind(this);
		this.handleMove = this.handleMove.bind(this);
		this.handleEnd = this.handleEnd.bind(this);

		// Add event listeners for both mouse and touch
		this.initializeEventListeners();
	}

	initializeEventListeners() {
		// Mouse events
		this.element.addEventListener('mousedown', this.handleStart);
		document.addEventListener('mousemove', this.handleMove);
		document.addEventListener('mouseup', this.handleEnd);

		// Touch events - note we're not preventing default on touchstart
		this.element.addEventListener('touchstart', this.handleStart, { passive: true });
		// We need touch-action: none in CSS instead of preventDefault for smooth mobile experience
		document.addEventListener('touchmove', this.handleMove, { passive: true });
		document.addEventListener('touchend', this.handleEnd, { passive: true });
	}

	handleStart(event) {
		// event.preventDefault();

		if(!this.myte.parent.ui.isTool(UIToolModes.PET)) return;

		// Don't start if we're in cooldown
		if (!this.canRub()) return;

		this.isRubbing = true;
		const { clientX, clientY } = this.getEventCoordinates(event);
		const rect = this.element.getBoundingClientRect();

		this.lastX = clientX - rect.left;
		this.lastY = clientY - rect.top;
		this.lastTimestamp = Date.now();
		this.totalRubDistance = 0;
		this.rubCounter = 0;

		if (event.type === 'touchstart') {
			this.element.style.touchAction = 'none';
		}


	}

	handleMove(event) {
		if (!this.isRubbing) return;
		// event.preventDefault();

		const { clientX, clientY } = this.getEventCoordinates(event);
		const rect = this.element.getBoundingClientRect();
		const currentX = clientX - rect.left;
		const currentY = clientY - rect.top;

		// Calculate movement
		const deltaX = currentX - this.lastX;
		const deltaY = currentY - this.lastY;
		const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
		const deltaTime = Date.now() - this.lastTimestamp;
		const velocity = distance / deltaTime;

		// Determine rub direction
		if (distance > this.config.directionThreshold) {
			const direction = Math.abs(deltaX) > Math.abs(deltaY)
				? (deltaX > 0 ? 'right' : 'left')
				: (deltaY > 0 ? 'down' : 'up');

			if (direction === this.lastRubDirection) {
				this.consecutiveSameDirection++;
			} else {
				this.lastRubDirection = direction;
				this.consecutiveSameDirection = 1;
			}
		}

		// Check if this is a valid rubbing motion
		if (velocity > this.config.rubbingThreshold) {
			this.totalRubDistance += distance;

			// Count as a rub if we've moved enough in the same direction
			if (this.consecutiveSameDirection >= 2) {
				this.rubCounter++;
				this.consecutiveSameDirection = 0;
				this.provideHapticFeedback();
			}
		}

		this.lastX = currentX;
		this.lastY = currentY;
		this.lastTimestamp = Date.now();
	}

	handleEnd() {
		if (!this.isRubbing) return;
		this.isRubbing = false;

		// If we had valid rubs, start the cooldown
		if (this.rubCounter >= this.config.minRubs) {
			this.lastRubTimestamp = Date.now();
			this.myte.queue.clear();

			// Add expression based on how good the rub was
			if (this.rubCounter <= this.config.maxRubs) {
				// Good rubs
				this.myte.queue.addExpression('happy');
			} else {
				// Too much rubbing
				this.myte.queue.addExpression('dizzy');
			}

			this.updateMyteMood();
		}

		// Reset tracking variables
		this.rubCounter = 0;
		this.totalRubDistance = 0;
		this.consecutiveSameDirection = 0;
		this.lastRubDirection = null;

		this.element.style.touchAction = '';
	}

	updateMyteMood() {
		if (this.rubCounter <= this.config.maxRubs) {
			// Good rubs increase mood
			this.myte.stats.updateMood(this.config.moodBoostPerRub);
		} else {
			// Too much rubbing decreases mood
			this.myte.stats.updateMood(this.config.moodPenaltyOverrub);
		}
	}

	provideHapticFeedback() {
		if ('vibrate' in navigator) {
			navigator.vibrate(this.config.hapticDuration);
		}
	}

	canRub() {
		return Date.now() - this.lastRubTimestamp >= this.config.minTimeBetweenRubs;
	}

	getEventCoordinates(event) {
		if (event.touches) {
			return {
				clientX: event.touches[0].clientX,
				clientY: event.touches[0].clientY
			};
		}
		return {
			clientX: event.clientX,
			clientY: event.clientY
		};
	}

	dispose() {
		// Clean up event listeners
		this.element.removeEventListener('mousedown', this.handleStart);
		document.removeEventListener('mousemove', this.handleMove);
		document.removeEventListener('mouseup', this.handleEnd);

		this.element.removeEventListener('touchstart', this.handleStart);
		document.removeEventListener('touchmove', this.handleMove);
		document.removeEventListener('touchend', this.handleEnd);

		this.element.style.touchAction = '';
	}
}
