class MyteInputHandler {
	constructor(myte) {
		this.myte = myte;
		this.touchHandler = new MyteTouchHandler(myte);
		this.rubbingHandler = new MyteRubbingHandler(myte);
		this.clickHandler = new MyteClickHandler(myte);
	}
}

class MyteClickHandler {
    constructor(myte) {
        this.myte = myte;
        
        // Configuration
        this.config = {
            doubleClickTimeout: 300,
            longPressTimeout: 500
        };

        // State tracking
        this.lastClickTime = 0;
        this.longPressTimer = null;
        this.isPressed = false;

        // Bind methods
        this.handleClick = this.handleClick.bind(this);
        this.handleDoubleClick = this.handleDoubleClick.bind(this);
        this.handleLongPress = this.handleLongPress.bind(this);
        this.handlePressStart = this.handlePressStart.bind(this);
        this.handlePressEnd = this.handlePressEnd.bind(this);
        this.handleRightClick = this.handleRightClick.bind(this);




        this.initializeEventListeners();
    }

    initializeEventListeners() {
        // Click events for inactive myte
        this.myte.element.addEventListener('click', (event) => {
            if (!this.myte.isActive) {
                this.handleInactiveMyteClick(event);
            }
        });

        // Click events for active myte
        this.myte.duplicate.addEventListener('click', (event) => {
            if (this.myte.isActive) {
                this.handleActiveMyteClick(event);
            }
        });

        // Double click events
        this.myte.duplicate.addEventListener('mousedown', this.handlePressStart);
        document.addEventListener('mouseup', this.handlePressEnd);

        // Home click events
        this.myte.dropTarget.addEventListener('click', (event) => {
            this.handleHomeClick(event);
        });

        this.myte.duplicate.addEventListener('contextmenu', (event) => {
            this.handleRightClick(event);
        });

    }

    handleRightClick(event) {
        event.preventDefault();
        return false;
    }

    handleInactiveMyteClick(event) {
        event.stopPropagation();
        if (!this.myte.isActive) {
            this.myte.start();
            this.myte.parent.setActiveMyte(this.myte);
        }
    }

    handleActiveMyteClick(event) {
        event.stopPropagation();
        
        if (this.myte.parent.ui.isTool(UIToolModes.SELECT)) {

			this.myte.parent.ui.setSelected(this.myte);

            if (this.myte.isActiveMyte) {
                if (this.myte.isActive && !this.myte.isDragging && 
                    this.myte.parent.getPressDuration() < 100) {
                    // Handle click on active myte
                    this.handleClick(event);
                }
            } else {
                // this.myte.parent.setActiveMyte(this.myte);
            }
        }
    }

    handleHomeClick(event) {
        if (this.myte.isActive) {
            // Handle click on myte's home area
            this.myte.queue.clear();
            this.myte.setMode(MOVE_TYPES.GOHOME);
        }
    }

    handleClick(event) {
        const currentTime = Date.now();
        const timeSinceLastClick = currentTime - this.lastClickTime;

        if (timeSinceLastClick < this.config.doubleClickTimeout) {
            this.handleDoubleClick(event);
        }

        this.lastClickTime = currentTime;
    }

    handleDoubleClick(event) {
        // Handle double click behavior
        // For example, make the myte do a special animation
        this.myte.queue.addExpression('surprise');
        this.myte.queue.addExpression('dance');
    }

    handlePressStart(event) {
        this.isPressed = true;
        this.longPressTimer = setTimeout(() => {
            if (this.isPressed) {
                this.handleLongPress(event);
            }
        }, this.config.longPressTimeout);
    }

    handlePressEnd() {
        this.isPressed = false;
        if (this.longPressTimer) {
            clearTimeout(this.longPressTimer);
            this.longPressTimer = null;
        }
    }

    handleLongPress(event) {

        if (this.myte.isActiveMyte) {
            // this.myte.queue.addExpression('idle');
        }
    }

    dispose() {
        // Clean up event listeners
        this.myte.element.removeEventListener('click', this.handleInactiveMyteClick);
        this.myte.duplicate.removeEventListener('click', this.handleActiveMyteClick);
        this.myte.duplicate.removeEventListener('mousedown', this.handlePressStart);
        document.removeEventListener('mouseup', this.handlePressEnd);
        this.myte.dropTarget.removeEventListener('click', this.handleHomeClick);

        if (this.longPressTimer) {
            clearTimeout(this.longPressTimer);
        }
    }
}


class MyteTouchHandler extends DragHandler {
    constructor(myte) {
        super({
            element: myte.sprite,
            parent: myte,
            canDrag: () => {
                return myte.parent.ui.isTool(UIToolModes.DRAG) && 
                       myte.isActive && 
                       myte.canDrag();
            },
            onDragStart: () => {
                myte.isDragging = true;
                myte.parent.camera.setMode(CAMERA_FOLLOW_MODES.CHARACTER);
                myte.reset();
                myte.targetDot.classList.add('hidden');
                myte.duplicate.classList.add('dragging');
                myte.dropTarget.classList.add("valid-drop-target");
            },
            onDragUpdate: (position) => {
                const containerRect = myte.parent.getContainerRect();
                const newX = (position.x - myte.parent.camera.posX) - containerRect.left - (192/2);
                const newY = (position.y - myte.parent.camera.posY) - containerRect.top - (192/2);

                // Move myte
                myte.setTarget(newX, newY, myte.limitTocontainer);
                myte.setPosition(newX, newY, myte.limitTocontainer);
                myte.setSpritePosition(newX, newY, myte.limitTocontainer);

                // Update drop target
                const dropTargetRect = myte.parent.getRect(myte.dropTarget);
                if (Utility.is_coord_touching_element(position.x, position.y, dropTargetRect)) {
                    myte.dropTarget.classList.add("on-target");
                } else {
                    myte.dropTarget.classList.remove("on-target");
                }
            },
            onDragEnd: () => {
                myte.queue.clear();
                myte.parent.camera.setToPreviousMode();
                if (myte.goal == MOVE_TYPES.GOHOME) {
                    myte.setMode(myte.previousGoal);
                }
                myte.isDragging = false;
                myte.duplicate.classList.remove('dragging');

                // Check if dropped on target
                if (myte.dropTarget.classList.contains("on-target")) {
                    myte.stop();
                }

                // Reset drop target states
                myte.dropTarget.classList.remove('valid-drop-target', 'on-target');
                myte.targetDot.classList.remove('hidden');
            }
        });

        this.myte = myte;
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
			directionThreshold: 20,   // Pixels needed to determine direction
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