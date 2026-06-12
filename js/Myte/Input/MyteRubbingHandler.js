class MyteRubbingHandler extends MyteBaseHandler {
	constructor(myte) {
		super(myte);
		this.element = myte.sprite;

		this.isRubbing = false;
		this.lastX = 0;
		this.lastY = 0;
		this.lastTimestamp = 0;
		this.lastRubTimestamp = 0;
		this.rubCounter = 0;
		this.totalRubDistance = 0;
		this.lastRubDirection = null;
		this.consecutiveSameDirection = 0;

		this.config = {
			minRubs: 3,
			maxRubs: 25,
			rubbingThreshold: 2,
			minTimeBetweenRubs: 5000,
			directionThreshold: 10,
			moodBoostPerRub: 5,
			moodPenaltyOverrub: -2,
			validRubTimeout: 1000,
			hapticDuration: 50,
		};

		this._initListeners();
	}

	_initListeners() {
		this._on(this.element, 'mousedown',  this._onStart.bind(this));
		this._on(document,    'mousemove',   this._onMove.bind(this));
		this._on(document,    'mouseup',     this._onEnd.bind(this));
		this._on(this.element, 'touchstart', this._onStart.bind(this), { passive: true });
		this._on(document,    'touchmove',   this._onMove.bind(this),  { passive: true });
		this._on(document,    'touchend',    this._onEnd.bind(this),   { passive: true });
	}

	_onStart(event) {
		if (!this.myte.parent.ui.isTool(UIToolModes.PET)) return;
		if (!this._canRub()) return;

		this.isRubbing = true;
		const { clientX, clientY } = this._getCoords(event);
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

	_onMove(event) {
		if (!this.isRubbing) return;

		const { clientX, clientY } = this._getCoords(event);
		const rect = this.element.getBoundingClientRect();
		const currentX = clientX - rect.left;
		const currentY = clientY - rect.top;

		const deltaX = currentX - this.lastX;
		const deltaY = currentY - this.lastY;
		const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
		const deltaTime = Date.now() - this.lastTimestamp;
		const velocity = distance / deltaTime;

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

		if (velocity > this.config.rubbingThreshold) {
			this.totalRubDistance += distance;
			if (this.consecutiveSameDirection >= 2) {
				this.rubCounter++;
				this.consecutiveSameDirection = 0;
				this._hapticFeedback();
			}
		}

		this.lastX = currentX;
		this.lastY = currentY;
		this.lastTimestamp = Date.now();
	}

	_onEnd() {
		if (!this.isRubbing) return;
		this.isRubbing = false;

		if (this.rubCounter >= this.config.minRubs) {
			this.lastRubTimestamp = Date.now();

			this.myte.queue.interrupt('expression', {
				actionType: this.rubCounter <= this.config.maxRubs ? 'happy' : 'dizzy'
			});
			this._updateMood();
		}

		this.rubCounter = 0;
		this.totalRubDistance = 0;
		this.consecutiveSameDirection = 0;
		this.lastRubDirection = null;
		this.element.style.touchAction = '';
	}

	_updateMood() {
		this.myte.buffs?.applyBuff?.(
			this.rubCounter <= this.config.maxRubs
				? 'petted'
				: 'overstimulated',
			{
				source: 'petting',
				payload: {
					rubCount: this.rubCounter
				}
			}
		);
	}

	_hapticFeedback() {
		if ('vibrate' in navigator) {
			navigator.vibrate(this.config.hapticDuration);
		}
	}

	_canRub() {
		return Date.now() - this.lastRubTimestamp >= this.config.minTimeBetweenRubs;
	}

	_getCoords(event) {
		if (event.touches) {
			return { clientX: event.touches[0].clientX, clientY: event.touches[0].clientY };
		}
		return { clientX: event.clientX, clientY: event.clientY };
	}

	dispose() {
		this.element.style.touchAction = '';
		super.dispose();
	}
}
