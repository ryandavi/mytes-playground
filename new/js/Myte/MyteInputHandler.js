class MyteInputHandler {
	constructor(myte) {
		this.myte = myte;
		this.touchHandler = new MyteTouchHandler(myte);
		this.rubbingDetector = new MyteRubbingHandler(myte);
	}
}


class MyteTouchHandler {
	constructor(myte) {
		this.myte = myte;

		// Touch state tracking
		this.activeTouches = new Map();
		this.touchStartTime = 0;
		this.lastTapTime = 0;
		this.initialTouchPos = null;
		this.lastPinchDistance = 0;
		this.initialPinchDistance = 0;
		this.lastScale = 1;

		// Mobile-specific state
		this.isScrolling = false;
		this.lastScrollY = window.scrollY;
		this.scrollThreshold = 10;
		this.preventScrollTimeout = null;

		// Configuration
		this.config = {
			tapThreshold: 200,
			doubleTapThreshold: 300,
			dragThreshold: 15, // Increased for mobile
			swipeThreshold: 50,
			longPressThreshold: 500,
			minDistanceForCommand: 100,
			pinchThreshold: 0.2, // 20% change in pinch distance
			touchTimeout: 100, // ms to wait before allowing touch events
			scrollLockDelay: 300, // ms to prevent scrolling after touch start
			velocityTrackingInterval: 100, // ms between velocity measurements
			maxTapMovement: 10, // maximum pixel movement allowed for a tap
		};

		// State flags
		this.isDragging = false;
		this.isLongPressing = false;
		this.isPinching = false;
		this.isEnabled = false;
		this.longPressTimer = null;
		this.lastGesture = null;
		this.touchVelocity = { x: 0, y: 0 };
		this.lastTouchMoveTime = 0;

		// Velocity tracking
		this.velocityTracker = {
			positions: [],
			maxPoints: 5,
			lastUpdate: 0
		};

		// Touch surface boundaries
		this.boundaries = {
			top: 0,
			right: window.innerWidth,
			bottom: window.innerHeight,
			left: 0
		};

		// Bind methods
		this.bindMethods();

		// Initialize
		this.initTouchEvents();
		this.enableTouchAfterDelay();
	}

	bindMethods() {
		this.handleTouchStart = this.handleTouchStart.bind(this);
		this.handleTouchMove = this.handleTouchMove.bind(this);
		this.handleTouchEnd = this.handleTouchEnd.bind(this);
		this.handleTouchCancel = this.handleTouchCancel.bind(this);
		this.handleOrientationChange = this.handleOrientationChange.bind(this);
		this.handleResize = this.handleResize.bind(this);
		this.handleScroll = this.handleScroll.bind(this);
	}

	initTouchEvents() {
		const options = {
			passive: false, // Need to be able to preventDefault for certain gestures
			capture: true  // Capture phase to handle events before they bubble
		};

		// Touch events
		this.myte.sprite.addEventListener('touchstart', this.handleTouchStart, options);
		document.addEventListener('touchmove', this.handleTouchMove, options);
		document.addEventListener('touchend', this.handleTouchEnd, options);
		document.addEventListener('touchcancel', this.handleTouchCancel, options);

		// Mobile-specific events
		window.addEventListener('orientationchange', this.handleOrientationChange);
		window.addEventListener('resize', this.handleResize);
		window.addEventListener('scroll', this.handleScroll, { passive: true });

		// Prevent unwanted mobile behaviors
		this.myte.sprite.addEventListener('contextmenu', (e) => e.preventDefault());
		this.myte.sprite.addEventListener('selectstart', (e) => e.preventDefault());
	}

	enableTouchAfterDelay() {
		setTimeout(() => {
			this.isEnabled = true;
			this.updateBoundaries();
		}, this.config.touchTimeout);
	}

	updateBoundaries() {
		const rect = this.myte.parent.getContainerRect();
		this.boundaries = {
			top: rect.top,
			right: rect.right,
			bottom: rect.bottom,
			left: rect.left
		};
	}

	// Add the missing method
	handleTouchCancel(event) {
		// Handle the touch cancel event similarly to touch end
		if (!this.isEnabled) return;

		const touches = Array.from(event.changedTouches);
		touches.forEach(touch => {
			this.activeTouches.delete(touch.identifier);
		});

		// Clean up all ongoing gestures
		this.endAllGestures();

		// Reset scroll prevention
		if (this.preventScrollTimeout) {
			clearTimeout(this.preventScrollTimeout);
			this.preventScrollTimeout = null;
		}
		this.isScrolling = false;
	}

	handleTouchStart(event) {
		if (!this.isEnabled) return;

		// Prevent default only for specific elements where we don't want native behavior
		if (event.target.classList.contains('no-native-touch')) {
			event.preventDefault();
		}

		this.touchStartTime = Date.now();

		// Store touch points
		Array.from(event.changedTouches).forEach(touch => {
			const touchInfo = {
				startX: touch.clientX,
				startY: touch.clientY,
				currentX: touch.clientX,
				currentY: touch.clientY,
				startTime: this.touchStartTime,
				scrollStartY: window.scrollY
			};
			this.activeTouches.set(touch.identifier, touchInfo);
		});

		// Handle multi-touch gestures
		if (this.activeTouches.size === 2) {
			this.handlePinchStart(Array.from(this.activeTouches.values()));
		} else if (this.activeTouches.size === 1) {
			const touch = this.activeTouches.values().next().value;
			this.initialTouchPos = { x: touch.startX, y: touch.startY };
			this.startLongPressDetection();

			// Temporarily prevent scrolling
			this.preventScrollTimeout = setTimeout(() => {
				this.isScrolling = false;
			}, this.config.scrollLockDelay);
		}

		// Reset velocity tracker
		this.velocityTracker.positions = [];
		this.velocityTracker.lastUpdate = Date.now();

		if (this.canStartDrag()) {
			this.prepareDrag();
		}
	}

	handleTouchMove(event) {
		if (!this.isEnabled) return;

		const currentTime = Date.now();
		const touches = Array.from(event.changedTouches);

		// Update touch positions and track velocity
		touches.forEach(touch => {
			const touchInfo = this.activeTouches.get(touch.identifier);
			if (touchInfo) {
				// Calculate velocity
				const deltaTime = currentTime - this.velocityTracker.lastUpdate;
				if (deltaTime >= this.config.velocityTrackingInterval) {
					const deltaX = touch.clientX - touchInfo.currentX;
					const deltaY = touch.clientY - touchInfo.currentY;
					this.touchVelocity = {
						x: deltaX / deltaTime,
						y: deltaY / deltaTime
					};
					this.velocityTracker.lastUpdate = currentTime;
				}

				// Update current position
				touchInfo.currentX = touch.clientX;
				touchInfo.currentY = touch.clientY;
				this.activeTouches.set(touch.identifier, touchInfo);
			}
		});

		// Handle different gesture types
		if (this.activeTouches.size === 2) {
			this.handlePinchMove(Array.from(this.activeTouches.values()));
			event.preventDefault(); // Prevent zooming
		} else if (this.activeTouches.size === 1) {
			const touch = this.activeTouches.values().next().value;
			const deltaY = touch.currentY - touch.startY;

			// Determine if this should be a scroll or drag
			if (!this.isDragging && !this.isScrolling) {
				if (Math.abs(deltaY) > this.config.dragThreshold) {
					this.isScrolling = true;
					return; // Allow native scrolling
				} else if (this.shouldStartDrag(touch)) {
					this.startDragging();
					event.preventDefault();
				}
			}

			if (this.isDragging) {
				this.updateDragPosition(touch);
				event.preventDefault();
			}
		}
	}

	handleTouchEnd(event) {
		if (!this.isEnabled) return;

		const touches = Array.from(event.changedTouches);
		touches.forEach(touch => {
			const touchInfo = this.activeTouches.get(touch.identifier);
			if (touchInfo) {
				const duration = Date.now() - touchInfo.startTime;
				const deltaX = touch.clientX - touchInfo.startX;
				const deltaY = touch.clientY - touchInfo.startY;
				const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

				// Handle different gesture completions
				if (!this.isDragging && !this.isScrolling && distance < this.config.maxTapMovement) {
					if (duration < this.config.tapThreshold) {
						this.handleTap(touch);
					} else if (this.isLongPressing) {
						this.handleLongPressEnd(touch);
					}
				} else if (distance > this.config.swipeThreshold) {
					this.handleSwipe(deltaX, deltaY, duration, this.touchVelocity);
				}

				this.activeTouches.delete(touch.identifier);
			}
		});

		// Clean up
		if (this.activeTouches.size === 0) {
			this.endAllGestures();
		}

		// Reset scroll prevention
		if (this.preventScrollTimeout) {
			clearTimeout(this.preventScrollTimeout);
			this.preventScrollTimeout = null;
		}
		this.isScrolling = false;
	}

	handlePinchStart(touches) {
		if (touches.length !== 2) return;

		const distance = this.getPinchDistance(touches[0], touches[1]);
		this.initialPinchDistance = distance;
		this.lastPinchDistance = distance;
		this.isPinching = true;
	}

	handlePinchMove(touches) {
		if (!this.isPinching || touches.length !== 2) return;

		const currentDistance = this.getPinchDistance(touches[0], touches[1]);
		const scale = currentDistance / this.initialPinchDistance;
		const deltaScale = scale - this.lastScale;

		if (Math.abs(deltaScale) > this.config.pinchThreshold) {
			// Handle pinch zoom
			if (this.myte.parent.camera) {
				this.myte.parent.camera.handlePinch(scale);
			}
			this.lastScale = scale;
		}

		this.lastPinchDistance = currentDistance;
	}

	getPinchDistance(touch1, touch2) {
		const dx = touch1.currentX - touch2.currentX;
		const dy = touch1.currentY - touch2.currentY;
		return Math.sqrt(dx * dx + dy * dy);
	}

	handleOrientationChange() {
		// Wait for orientation change to complete
		setTimeout(() => {
			this.updateBoundaries();
			// Update any orientation-dependent state
			if (this.isDragging) {
				this.adjustDragForOrientation();
			}
		}, 100);
	}

	handleResize() {
		this.updateBoundaries();
	}

	handleScroll(event) {
		this.lastScrollY = window.scrollY;

		// Cancel any active gestures if scrolling occurs
		if (this.isLongPressing) {
			this.cancelLongPress();
		}
	}

	adjustDragForOrientation() {
		if (!this.isDragging) return;

		const touch = this.activeTouches.values().next().value;
		if (touch) {
			// Ensure drag position is valid in new orientation
			this.updateDragPosition(touch);
		}
	}

	endAllGestures() {
		this.endDragging();
		this.cancelLongPress();
		this.isPinching = false;
		this.lastScale = 1;
		this.velocityTracker.positions = [];
	}



	dispose() {
		// Remove all event listeners
		this.myte.sprite.removeEventListener('touchstart', this.handleTouchStart);
		document.removeEventListener('touchmove', this.handleTouchMove);
		document.removeEventListener('touchend', this.handleTouchEnd);
		document.removeEventListener('touchcancel', this.handleTouchCancel);
		window.removeEventListener('orientationchange', this.handleOrientationChange);
		window.removeEventListener('resize', this.handleResize);
		window.removeEventListener('scroll', this.handleScroll);

		// Clear all timers and states
		this.cancelLongPress();
		if (this.preventScrollTimeout) {
			clearTimeout(this.preventScrollTimeout);
		}

		// Reset all state
		this.activeTouches.clear();
		this.isDragging = false;
		this.isLongPressing = false;
		this.isPinching = false;
		this.isEnabled = false;
	}
}

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
			directionThreshold: 30,   // Pixels needed to determine direction
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

			// Add expression based on how good the rub was
			if (this.rubCounter <= this.config.maxRubs) {
				// Good rubs
				console.log('Good rubs');
				this.myte.queue.addExpression('happy');
			} else {
				// Too much rubbing
				console.log('Too much rubbing');
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
			this.myte.updateMood(this.config.moodBoostPerRub);
		} else {
			// Too much rubbing decreases mood
			this.myte.updateMood(this.config.moodPenaltyOverrub);
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