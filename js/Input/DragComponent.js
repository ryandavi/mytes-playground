class DragComponent extends InputComponent {

	getDefaultOptions() {
		return {
			...super.getDefaultOptions(),
			dragThreshold: 5,                // Minimum pixels moved to start drag
			dragTimeThreshold: 100,          // Minimum time in ms before a drag starts
			preventDefaultsForDrag: true,    // Whether to prevent default touch behavior during drag
			autoActivate: false,             // Whether to start dragging automatically on mousedown/touch
			inertia: false,                  // Whether to enable inertia after drag
			inertiaDeceleration: 0.95,       // Deceleration factor for inertia
			maxInertiaSpeed: 20,             // Maximum inertia speed
			limitToElement: null,            // Element to limit dragging within
			limitToViewport: false,          // Whether to limit dragging within viewport
			touchAction: 'none',             // CSS touch-action property during drag
			dragOriginX: 0.5,                // Origin point for drag (0.5 = center)
			dragOriginY: 0.5,                // Origin point for drag (0.5 = center)
			velocityWindow: 100,             // ms of position history used to compute throw velocity on release

			// Callbacks
			canDrag: null,                   // Function to check if dragging is allowed
			onDragStart: null,               // Called when drag starts
			onDragMove: null,                // Called during drag
			onDragEnd: null                  // Called when drag ends
		};
	}

	initialize() {
		super.initialize();

		// Dragging state
		this.isDragging = false;
		this.dragStartPosition = { x: 0, y: 0 };
		this.currentPosition = { x: 0, y: 0 };
		this.dragStartTime = 0;
		this.lastPosition = { x: 0, y: 0 };
		this.velocity = { x: 0, y: 0 };
		this.positionHistory = [];
		this.touchId = null;
		this.mouseDownReceived = false; // Track if mousedown was received
		this.grabOffset = { x: 0, y: 0 };

		// For inertia animation
		this.inertiaAnimationId = null;

		// Debug: Add window-level handler for mouseup to ensure we catch all mouseup events
		window.addEventListener('mouseup', this.windowMouseUpHandler);
		window.addEventListener('touchend', this.windowTouchEndHandler);
	}

	/**
	 * Global handler for mouseup to ensure we catch all mouseup events
	 */
	windowMouseUpHandler = (event) => {
		if (this.isDragging) {
			this.handleEnd({
				position: {
					x: event.pageX || 0,
					y: event.pageY || 0,
					clientX: event.clientX || 0,
					clientY: event.clientY || 0
				},
				originalEvent: event
			});
		}
	};

	/**
	 * Global handler for touchend to ensure we catch all touch end events
	 */
	windowTouchEndHandler = (event) => {
		if (this.isDragging && event.changedTouches) {
			for (let i = 0; i < event.changedTouches.length; i++) {
				const touch = event.changedTouches[i];
				if (touch.identifier === this.touchId) {
					this.handleEnd({
						position: {
							x: touch.pageX || 0,
							y: touch.pageY || 0,
							clientX: touch.clientX || 0,
							clientY: touch.clientY || 0
						},
						touchId: touch.identifier,
						originalEvent: event
					});
					break;
				}
			}
		}
	};

	/**
	 * Set up event subscriptions
	 */
	setupSubscriptions() {
		// Mouse events
		this.subscribe('mouse.down', this.handleStart);
		this.subscribe('mouse.move', this.handleMove);
		this.subscribe('mouse.up', this.handleEnd);

		// Touch events
		this.subscribe('touch.start', this.handleStart);
		this.subscribe('touch.move', this.handleMove);
		this.subscribe('touch.end', this.handleEnd);
	}

	/**
	 * Handle drag start (mousedown/touchstart)
	 */
	handleStart = (event) => {
		// Check if we can drag
		if (this.options.canDrag && !this.options.canDrag(event)) {
			return;
		}

		// Not on this element, or not on the world at all — see claimsPress.
		if (!this.claimsPress(event)) return;

		// Store starting information
		this.dragStartPosition = { ...event.position };
		this.currentPosition = { ...event.position };
		this.lastPosition = { ...event.position };
		this.dragStartTime = Date.now();
		this.velocity = { x: 0, y: 0 };
		this.mouseDownReceived = true; // Flag that we received mousedown

		// For touch events, store the touch identifier
		if (event.touchId !== undefined) {
			this.touchId = event.touchId;
		} else {
			this.touchId = null;
		}

		// If auto-activate is enabled, start dragging immediately
		if (this.options.autoActivate) {
			this.startDrag(event);
		}
	}

	/**
	 * Handle drag move
	 */
	handleMove = (event) => {
		if (!this.active) return;

		// If we haven't received a mousedown yet, ignore move events
		if (!this.mouseDownReceived) {
			return;
		}

		// If we haven't started dragging yet, check if we should
		if (!this.isDragging) {
			// For touch events, make sure it's the right touch
			if (event.touchId !== undefined && event.touchId !== this.touchId) {
				return;
			}

			// Check if we've moved enough to start dragging
			const deltaX = event.position.x - this.dragStartPosition.x;
			const deltaY = event.position.y - this.dragStartPosition.y;
			const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
			const timeElapsed = Date.now() - this.dragStartTime;

			// Start dragging if we've moved enough and enough time has passed
			if (distance >= this.options.dragThreshold &&
				timeElapsed >= this.options.dragTimeThreshold) {
				this.startDrag(event);
			}

			// If we're not dragging yet, don't continue processing the move
			if (!this.isDragging) {
				return;
			}
		}

		// For touch events, make sure it's the right touch
		if (event.touchId !== undefined && event.touchId !== this.touchId) {
			return;
		}

		// Calculate velocity
		const now = Date.now();
		const dt = (now - this.dragStartTime) / 1000; // in seconds

		if (dt > 0) {
			this.velocity = {
				x: (event.position.x - this.currentPosition.x) / dt,
				y: (event.position.y - this.currentPosition.y) / dt
			};
		}

		// Store current position
		this.lastPosition = { ...this.currentPosition };
		this.currentPosition = { ...event.position };
		this.dragStartTime = now;

		// Track position history for throw velocity
		this.positionHistory.push({ x: event.position.x, y: event.position.y, t: now });
		const cutoff = now - this.options.velocityWindow;
		while (this.positionHistory.length > 1 && this.positionHistory[0].t < cutoff) {
			this.positionHistory.shift();
		}

		// Apply movement constraints
		const constrainedPosition = this.constrainPosition(this.currentPosition);

		// Call move callback
		if (this.options.onDragMove) {
			this.options.onDragMove({
				originalEvent: event.originalEvent,
				position: constrainedPosition,
				startPosition: this.dragStartPosition,
				delta: {
					x: constrainedPosition.x - this.dragStartPosition.x,
					y: constrainedPosition.y - this.dragStartPosition.y
				},
				velocity: this.velocity
			});
		}

	}

	/**
	 * Handle drag end
	 */
	handleEnd = (event) => {
		if (!this.active) return;


		// Reset mousedown tracking regardless of whether we were dragging
		this.mouseDownReceived = false;

		// If we weren't dragging, nothing else to do
		if (!this.isDragging) return;

		// For touch events, make sure it's the right touch
		if (event.touchId !== undefined && event.touchId !== this.touchId) {
			return;
		}

		// Apply movement constraints
		const constrainedPosition = this.constrainPosition(this.currentPosition);

		// Call end callback
		if (this.options.onDragEnd) {
			this.options.onDragEnd({
				originalEvent: event.originalEvent,
				position: constrainedPosition,
				startPosition: this.dragStartPosition,
				delta: {
					x: constrainedPosition.x - this.dragStartPosition.x,
					y: constrainedPosition.y - this.dragStartPosition.y
				},
				velocity: this._computeThrowVelocity()
			});
		}
		this.positionHistory = [];

		// Reset state
		this.isDragging = false;
		this.touchId = null;
		this.inputSystem.releaseDrag(this);

		// Reset element style if we modified it
		if (this.element && this.options.touchAction) {
			this.element.style.touchAction = '';
		}

		// Start inertia if enabled
		if (this.options.inertia) {
			this.startInertia();
		}
	}

	/**
	 * Start the drag operation
	 */
	startDrag(event) {
		// Only one entity may drag at a time per press cycle
		if (!this.inputSystem.claimDrag(this)) return;

		this.isDragging = true;
		this.positionHistory = [];

		// Set touch-action CSS for better touch handling
		if (this.element && this.options.touchAction) {
			this.element.style.touchAction = this.options.touchAction;
		}

		// Apply drag origin offset
		if (this.element) {
			const rect = this.element.getBoundingClientRect();
			const startClientX = this.dragStartPosition.clientX ?? event.position.clientX;
			const startClientY = this.dragStartPosition.clientY ?? event.position.clientY;
			this.grabOffset = {
				x: startClientX - rect.left,
				y: startClientY - rect.top
			};
			this.dragOffset = {
				x: this.grabOffset.x - (rect.width * this.options.dragOriginX),
				y: this.grabOffset.y - (rect.height * this.options.dragOriginY)
			};
		} else {
			this.grabOffset = { x: 0, y: 0 };
			this.dragOffset = { x: 0, y: 0 };
		}

		// Call start callback
		if (this.options.onDragStart) {
			this.options.onDragStart({
				originalEvent: event.originalEvent,
				position: this.dragStartPosition,
				offset: this.dragOffset,
				grabOffset: this.grabOffset
			});
		}
	}

	/**
	 * Constrain a position to limits if set
	 * @param {Object} position Position to constrain
	 * @returns {Object} Constrained position
	 */
	constrainPosition(position) {
		// Create a copy of the position
		const constrained = { ...position };

		// Apply limit to element
		if (this.options.limitToElement && this.element) {
			const rect = this.options.limitToElement.getBoundingClientRect();
			const elemRect = this.element.getBoundingClientRect();

			constrained.x = Math.max(
				rect.left + this.dragOffset.x,
				Math.min(rect.right - elemRect.width + this.dragOffset.x, constrained.x)
			);

			constrained.y = Math.max(
				rect.top + this.dragOffset.y,
				Math.min(rect.bottom - elemRect.height + this.dragOffset.y, constrained.y)
			);
		}

		// Apply limit to viewport
		if (this.options.limitToViewport && this.element) {
			const elemRect = this.element.getBoundingClientRect();

			constrained.x = Math.max(
				this.dragOffset.x,
				Math.min(window.innerWidth - elemRect.width + this.dragOffset.x, constrained.x)
			);

			constrained.y = Math.max(
				this.dragOffset.y,
				Math.min(window.innerHeight - elemRect.height + this.dragOffset.y, constrained.y)
			);
		}

		return constrained;
	}

	/**
	 * Start inertia animation
	 */
	startInertia() {
		if (!this.options.inertia) return;

		// Cancel any existing inertia
		this.cancelInertia();

		// Limit initial velocity
		const speed = Math.sqrt(
			this.velocity.x * this.velocity.x +
			this.velocity.y * this.velocity.y
		);

		if (speed <= 0) return;

		if (speed > this.options.maxInertiaSpeed) {
			const scale = this.options.maxInertiaSpeed / speed;
			this.velocity.x *= scale;
			this.velocity.y *= scale;
		}

		// Start animation
		this.inertiaAnimationId = requestAnimationFrame(this.updateInertia);
	}

	/**
	 * Update inertia animation
	 */
	updateInertia = () => {
		// Calculate new position
		const newPosition = {
			x: this.currentPosition.x + this.velocity.x,
			y: this.currentPosition.y + this.velocity.y
		};

		// Apply constraints
		const constrainedPosition = this.constrainPosition(newPosition);

		// Update current position
		this.currentPosition = constrainedPosition;

		// Call move callback
		if (this.options.onDragMove) {
			this.options.onDragMove({
				position: constrainedPosition,
				startPosition: this.dragStartPosition,
				delta: {
					x: constrainedPosition.x - this.dragStartPosition.x,
					y: constrainedPosition.y - this.dragStartPosition.y
				},
				velocity: this.velocity,
				inertia: true
			});
		}

		// Apply deceleration
		this.velocity.x *= this.options.inertiaDeceleration;
		this.velocity.y *= this.options.inertiaDeceleration;

		// Stop if velocity is very low
		const speed = Math.sqrt(
			this.velocity.x * this.velocity.x +
			this.velocity.y * this.velocity.y
		);

		if (speed < 0.1) {
			this.cancelInertia();

			// Call end callback
			if (this.options.onDragEnd) {
				this.options.onDragEnd({
					position: constrainedPosition,
					startPosition: this.dragStartPosition,
					delta: {
						x: constrainedPosition.x - this.dragStartPosition.x,
						y: constrainedPosition.y - this.dragStartPosition.y
					},
					velocity: { x: 0, y: 0 },
					inertia: true
				});
			}

			return;
		}

		// Continue animation
		this.inertiaAnimationId = requestAnimationFrame(this.updateInertia);
	}

	/**
	 * Cancel inertia animation
	 */
	cancelInertia() {
		if (this.inertiaAnimationId) {
			cancelAnimationFrame(this.inertiaAnimationId);
			this.inertiaAnimationId = null;
		}
	}

	/**
	 * Manually start a drag operation at the current mouse position
	 */
	startDragAtCurrentPosition() {
		const mousePos = this.inputSystem.getMousePosition();
		this.startDragAtPosition(mousePos);
	}

	/**
	 * Manually start a drag operation at an explicit screen position
	 * @param {Object} position Position object with x/y and optional clientX/clientY
	 */
	startDragAtPosition(position = {}) {
		const normalizedPosition = {
			x: position.x ?? position.clientX ?? 0,
			y: position.y ?? position.clientY ?? 0,
			clientX: position.clientX ?? position.x ?? 0,
			clientY: position.clientY ?? position.y ?? 0
		};
		this.handleStart({
			position: normalizedPosition,
			originalEvent: null
		});
		this.startDrag({
			position: normalizedPosition,
			originalEvent: null
		});
	}

	/**
	 * Stop the current drag operation (can be called externally)
	 */
	stopDrag() {
		if (this.isDragging) {
			const mousePos = this.inputSystem.getMousePosition();
			this.handleEnd({
				position: mousePos,
				originalEvent: null
			});
		}
	}

	/**
	 * Compute throw velocity from recent position history.
	 * Uses the oldest sample within velocityWindow ms to get a stable average,
	 * avoiding the stale-last-frame problem when the user releases mid-movement.
	 */
	_computeThrowVelocity() {
		const history = this.positionHistory;
		if (history.length < 2) return { ...this.velocity };
		const oldest = history[0];
		const newest = history[history.length - 1];
		const dt = (newest.t - oldest.t) / 1000;
		if (dt <= 0) return { ...this.velocity };
		return {
			x: (newest.x - oldest.x) / dt,
			y: (newest.y - oldest.y) / dt
		};
	}

	/**
	 * Clean up resources
	 */
	dispose() {
		this.cancelInertia();

		// Remove global handlers
		window.removeEventListener('mouseup', this.windowMouseUpHandler);
		window.removeEventListener('touchend', this.windowTouchEndHandler);

		// Reset element style if needed
		if (this.element && this.options.touchAction) {
			this.element.style.touchAction = '';
		}

		super.dispose();
	}
}
