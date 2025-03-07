class MyteClickHandler {
	constructor(myte) {
		this.myte = myte;

		// Configuration
		this.config = {
			doubleClickTimeout: 300,
			longPressTimeout: 500,
			dragThreshold: 20, // Distance in pixels before considering it a drag
			dragTimeThreshold: 300, // Time in ms before considering it a drag

			maxYForPickup: 300,
			maxXForPickup: 300

		};

		// State tracking
		this.lastClickTime = 0;
		this.longPressTimer = null;
		this.isPressed = false;
		this.dragStartX = 0;
		this.dragStartY = 0;
		this.dragStartTime = 0;
		this.isDragging = false;
		this.previousMode = null; // Store previous mode when auto-switching

		// Bind methods
		this.handleClick = this.handleClick.bind(this);
		this.handleDoubleClick = this.handleDoubleClick.bind(this);
		this.handleLongPress = this.handleLongPress.bind(this);
		this.handlePressStart = this.handlePressStart.bind(this);
		this.handlePressEnd = this.handlePressEnd.bind(this);
		this.handleRightClick = this.handleRightClick.bind(this);
		this.handleMouseMove = this.handleMouseMove.bind(this);

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
			if (this.myte.isActive && !this.isDragging) {
				this.handleActiveMyteClick(event);
			}
		});

		// Double click events
		this.myte.duplicate.addEventListener('mousedown', this.handlePressStart);
		document.addEventListener('mouseup', this.handlePressEnd);
		document.addEventListener('mousemove', this.handleMouseMove);

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
		if (!this.myte.isActiveMyte) return;

		this.isPressed = true;
		this.dragStartX = event.clientX;
		this.dragStartY = event.clientY;
		this.dragStartTime = Date.now();
		this.isDragging = false;

		this.longPressTimer = setTimeout(() => {
			if (this.isPressed) {
				this.handleLongPress(event);
			}
		}, this.config.longPressTimeout);
	}

	handleMouseMove(event) {

		if (!this.isPressed || !this.myte.isActiveMyte || this.myte.isDragging) return;



		// Only check for auto-drag if in SELECT mode
		if (!this.myte.parent.ui.isTool(UIToolModes.SELECT)) return;

		const dx = event.clientX - this.dragStartX;
		const dy = event.clientY - this.dragStartY;
		const distance = Math.sqrt(dx * dx + dy * dy);
		const timeElapsed = Date.now() - this.dragStartTime;

		// If dragged far enough and long enough, switch to drag mode
		if (
			distance > this.config.dragThreshold &&
			timeElapsed > this.config.dragTimeThreshold && 
			!this.isDragging &&
			(event.clientY < this.dragStartY && 
			this.dragStartY-event.clientY > this.config.dragThreshold && 
			this.dragStartY-event.clientY < this.config.maxYForPickup &&
			Math.abs(this.dragStartX-event.clientX) < this.config.maxXForPickup)
		) {



			this.isDragging = true;

			// Auto-switch to drag mode
			this.previousMode = UIToolModes.SELECT;
			this.switchToDragMode();

			// Stop the long press timer
			if (this.longPressTimer) {
				clearTimeout(this.longPressTimer);
				this.longPressTimer = null;
			}
		}
	}

	switchToDragMode() {
		// Store the current UI mode
		this.previousMode = UIToolModes.SELECT;

		// change tool
		this.myte.parent.ui.changeToolMode(UIToolModes.DRAG);

		// Make sure this Myte is the active one
		if (!this.myte.isActiveMyte) {
			this.myte.parent.setActiveMyte(this.myte);
		}

		// Start the drag after a small timeout to allow UI to update
		setTimeout(() => {
			// Directly call the handleStart method on touchHandler
			if (this.myte.inputHandler.touchHandler) {
				this.myte.inputHandler.touchHandler.handleStart({
					preventDefault: () => { },
					clientX: this.dragStartX,
					clientY: this.dragStartY,
					type: 'mousedown'
				});
			}
		}, 10);

	}




	handlePressEnd(event) {
		if (!this.isPressed) return;

		this.isPressed = false;
		this.isDragging = false;

		// If we auto-switched to drag mode, switch back to previous mode
		if (this.previousMode && this.myte.parent.ui.isTool(UIToolModes.DRAG)) {
			// Wait a short delay to ensure the drop action completes
			setTimeout(() => {
				this.myte.parent.ui.changeToolMode(this.previousMode);
				this.previousMode = null;
			}, 100);
		}

		if (this.longPressTimer) {
			clearTimeout(this.longPressTimer);
			this.longPressTimer = null;
		}
	}

	handleLongPress(event) {
		if (this.myte.isActiveMyte) {
			// Optional: Add some visual feedback for long press
			this.myte.queue.addExpression('surprised');
		}
	}

	dispose() {
		// Clean up event listeners
		this.myte.element.removeEventListener('click', this.handleInactiveMyteClick);
		this.myte.duplicate.removeEventListener('click', this.handleActiveMyteClick);
		this.myte.duplicate.removeEventListener('mousedown', this.handlePressStart);
		document.removeEventListener('mouseup', this.handlePressEnd);
		document.removeEventListener('mousemove', this.handleMouseMove);
		this.myte.dropTarget.removeEventListener('click', this.handleHomeClick);

		if (this.longPressTimer) {
			clearTimeout(this.longPressTimer);
		}
	}
}