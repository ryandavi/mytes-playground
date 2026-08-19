/**
 * Core input system that tracks and manages all input states globally.
 * Implemented as a singleton to be accessed from anywhere in the application.
 */
class InputSystem {
	static TEXT_ENTRY_TYPES = new Set([
	  'text', 'search', 'url', 'tel', 'email', 'password', 'number',
	  'date', 'datetime-local', 'month', 'week', 'time'
	]);

	static instance;
	
	/**
	 * Get the singleton instance of InputSystem
	 * @returns {InputSystem}
	 */
	static getInstance() {
	  if (!InputSystem.instance) {
		InputSystem.instance = new InputSystem();
	  }
	  return InputSystem.instance;
	}
	
	constructor() {
	  // Input state
	  this.state = {
		// Mouse state
		mouse: {
		  x: 0,
		  y: 0,
		  clientX: 0,
		  clientY: 0,
		  pressed: false,
		  button: null,
		  pressStartTime: 0,
		  lastClickTime: 0,
		},
		
		// Keyboard state
		keyboard: {
		  pressedKeys: new Set(),
		  lastKeyTime: 0,
		},
		
		// Touch state (for multi-touch)
		touches: new Map(),
		activeTouchId: null,
		
		// Scroll state
		scroll: {
		  x: window.scrollX,
		  y: window.scrollY,
		  deltaX: 0,
		  deltaY: 0,
		},
		
		// System state
		lastUpdateTime: Date.now(),
		isActive: true, // User activity tracking
		lastActivityTime: Date.now(),
	  };
	  
	  // Event listeners dictionary
	  this.listeners = {
		mouse: {
		  move: [],
		  down: [],
		  up: [],
		  click: [],
		  contextmenu: [],
		},
		touch: {
		  start: [],
		  move: [],
		  end: [],
		},
		keyboard: {
		  down: [],
		  up: [],
		},
		scroll: [],
		drag: [],
		activity: [],
	  };
	  
	  // Bind methods
	  this.boundHandlers = {
		mouseMove: this.handleMouseMove.bind(this),
		mouseDown: this.handleMouseDown.bind(this),
		mouseUp: this.handleMouseUp.bind(this),
		click: this.handleClick.bind(this),
		dblclick: this.handleDoubleClick.bind(this),
		contextMenu: this.handleContextMenu.bind(this),
		touchStart: this.handleTouchStart.bind(this),
		touchMove: this.handleTouchMove.bind(this),
		touchEnd: this.handleTouchEnd.bind(this),
		keyDown: this.handleKeyDown.bind(this),
		keyUp: this.handleKeyUp.bind(this),
		scroll: this.handleScroll.bind(this),
	  };
	  
	  // Initialize
	  this.initEventListeners();
	}
	
	/**
	 * Set up all event listeners on the document
	 */
	initEventListeners() {
	  // Mouse events
	  document.addEventListener('mousemove', this.boundHandlers.mouseMove, { passive: true });
	  document.addEventListener('mousedown', this.boundHandlers.mouseDown);
	  document.addEventListener('mouseup', this.boundHandlers.mouseUp);
	  document.addEventListener('click', this.boundHandlers.click);
	  document.addEventListener('dblclick', this.boundHandlers.dblclick);
	  document.addEventListener('contextmenu', this.boundHandlers.contextMenu);
	  
	  // Touch events (with passive for better performance where possible)
	  document.addEventListener('touchstart', this.boundHandlers.touchStart, { passive: true });
	  document.addEventListener('touchmove', this.boundHandlers.touchMove, { passive: true });
	  document.addEventListener('touchend', this.boundHandlers.touchEnd);
	  document.addEventListener('touchcancel', this.boundHandlers.touchEnd);
	  
	  // Keyboard events
	  document.addEventListener('keydown', this.boundHandlers.keyDown);
	  document.addEventListener('keyup', this.boundHandlers.keyUp);
	  
	  // Scroll events
	  window.addEventListener('scroll', this.boundHandlers.scroll, { passive: true });
	}
	
	/**
	 * Tear down all event listeners
	 */
	dispose() {
	  // Mouse events
	  document.removeEventListener('mousemove', this.boundHandlers.mouseMove);
	  document.removeEventListener('mousedown', this.boundHandlers.mouseDown);
	  document.removeEventListener('mouseup', this.boundHandlers.mouseUp);
	  document.removeEventListener('click', this.boundHandlers.click);
	  document.removeEventListener('dblclick', this.boundHandlers.dblclick);
	  document.removeEventListener('contextmenu', this.boundHandlers.contextMenu);
	  
	  // Touch events
	  document.removeEventListener('touchstart', this.boundHandlers.touchStart);
	  document.removeEventListener('touchmove', this.boundHandlers.touchMove);
	  document.removeEventListener('touchend', this.boundHandlers.touchEnd);
	  document.removeEventListener('touchcancel', this.boundHandlers.touchEnd);
	  
	  // Keyboard events
	  document.removeEventListener('keydown', this.boundHandlers.keyDown);
	  document.removeEventListener('keyup', this.boundHandlers.keyUp);
	  
	  // Scroll events
	  window.removeEventListener('scroll', this.boundHandlers.scroll);
	  
	  // Clear the instance
	  InputSystem.instance = null;
	}
	
	// ================================================
	// Event handlers
	// ================================================
	
	/**
	 * Handle mouse movement events
	 * @param {MouseEvent} event 
	 */
	handleMouseMove(event) {
	  // Update mouse position
	  this.state.mouse.x = event.pageX;
	  this.state.mouse.y = event.pageY;
	  this.state.mouse.clientX = event.clientX;
	  this.state.mouse.clientY = event.clientY;
	  
	  // Record activity
	  this.recordActivity();
	  
	  // Notify listeners
	  this.notifyListeners('mouse.move', { 
		originalEvent: event,
		position: { 
		  x: this.state.mouse.x, 
		  y: this.state.mouse.y,
		  clientX: this.state.mouse.clientX,
		  clientY: this.state.mouse.clientY
		},
		button: this.state.mouse.button,
		isPressed: this.state.mouse.pressed
	  });
	  
	  // If mouse is pressed, also notify drag listeners
	  if (this.state.mouse.pressed) {
		this.notifyListeners('drag', {
		  originalEvent: event,
		  position: { 
			x: this.state.mouse.x, 
			y: this.state.mouse.y,
			clientX: this.state.mouse.clientX,
			clientY: this.state.mouse.clientY
		  },
		  button: this.state.mouse.button,
		  pressStartTime: this.state.mouse.pressStartTime,
		  duration: Date.now() - this.state.mouse.pressStartTime
		});
	  }
	}
	
	/**
	 * Handle mouse down events
	 * @param {MouseEvent} event 
	 */
	handleMouseDown(event) {
	  this.state.mouse.x = event.pageX;
	  this.state.mouse.y = event.pageY;
	  this.state.mouse.clientX = event.clientX;
	  this.state.mouse.clientY = event.clientY;

	  // Update mouse state
	  this.state.mouse.pressed = true;
	  this.state.mouse.button = event.button;
	  this.state.mouse.pressStartTime = Date.now();
	  
	  // Record activity
	  this.recordActivity();
	  
	  // Notify listeners
	  this.notifyListeners('mouse.down', {
		originalEvent: event,
		position: { 
		  x: this.state.mouse.x, 
		  y: this.state.mouse.y,
		  clientX: this.state.mouse.clientX,
		  clientY: this.state.mouse.clientY
		},
		button: this.state.mouse.button
	  });
	}
	
	/**
	 * Handle mouse up events
	 * @param {MouseEvent} event 
	 */
	handleMouseUp(event) {
		// Update mouse position even if out of viewport
		this.state.mouse.x = event.pageX;
		this.state.mouse.y = event.pageY;
		this.state.mouse.clientX = event.clientX;
		this.state.mouse.clientY = event.clientY;
	  
		// Only notify if we were pressed or if any component is dragging
		if (this.state.mouse.pressed || this.isDragging) {
		  // Calculate press duration
		  const pressDuration = Date.now() - this.state.mouse.pressStartTime;
		  
		  // Notify listeners
		  this.notifyListeners('mouse.up', {
			originalEvent: event,
			position: { 
			  x: this.state.mouse.x, 
			  y: this.state.mouse.y,
			  clientX: this.state.mouse.clientX,
			  clientY: this.state.mouse.clientY
			},
			button: this.state.mouse.button,
			duration: pressDuration
		  });
		}
		
		// Update mouse state
		this.state.mouse.pressed = false;
		this.state.mouse.button = null;
		this.isDragging = false;
		this._dragOwner = null; // Release exclusive drag claim
		
		// Record activity
		this.recordActivity();
	  }
	  
	  /**
	   * Track dragging state globally (add this property to InputSystem)
	   */
	  get isDragging() {
		return this._isDragging || false;
	  }

	  set isDragging(value) {
		this._isDragging = value;
	  }

	/**
	 * Claim exclusive drag ownership for this press cycle.
	 * Returns true if the claim succeeded, false if another owner already holds it.
	 * @param {Object} owner The DragComponent (or any object) claiming the drag
	 * @returns {boolean}
	 */
	claimDrag(owner) {
		if (this._dragOwner && this._dragOwner !== owner) return false;
		this._dragOwner = owner;
		return true;
	}

	/**
	 * Release the exclusive drag claim.
	 * @param {Object} owner Must match the current owner to release
	 */
	releaseDrag(owner) {
		if (this._dragOwner === owner) {
			this._dragOwner = null;
		}
	}

	/**
	 * Whether any component currently owns the drag for this press.
	 * @returns {boolean}
	 */
	get hasDragOwner() {
		return !!this._dragOwner;
	}

	getGestureConfig() {
		return SiteConfig?.interaction?.gestures ?? {};
	}
	
	/**
	 * Handle click events
	 * @param {MouseEvent} event 
	 */
	handleClick(event) {
	  this.state.mouse.x = event.pageX;
	  this.state.mouse.y = event.pageY;
	  this.state.mouse.clientX = event.clientX;
	  this.state.mouse.clientY = event.clientY;

	  const gestureConfig = this.getGestureConfig();
	  const doubleClickInterval = gestureConfig.doubleClickInterval ?? 300;
	  const now = Date.now();
	  const timeSinceLastClick = now - this.state.mouse.lastClickTime;
	  const isDoubleClick = timeSinceLastClick < doubleClickInterval;
	  
	  // Update state
	  this.state.mouse.lastClickTime = now;
	  
	  // Notify listeners
	  this.notifyListeners('mouse.click', {
		originalEvent: event,
		position: { 
		  x: this.state.mouse.x, 
		  y: this.state.mouse.y,
		  clientX: this.state.mouse.clientX,
		  clientY: this.state.mouse.clientY
		},
		button: event.button,
		isDoubleClick: isDoubleClick,
		timeSinceLastClick: timeSinceLastClick
	  });
	  
	  // Record activity
	  this.recordActivity();
	}
	
	/**
	 * Handle native dblclick events.
	 * Fired as a separate DOM event so it bubbles independently of stopPropagation
	 * on individual click events — this is the reliable path for map double-click navigation.
	 * @param {MouseEvent} event
	 */
	handleDoubleClick(event) {
	  Utility.logDebug('[InputSystem] native dblclick on:', event.target?.className || event.target?.tagName, 'pageX/Y:', event.pageX, event.pageY);
	  this.notifyListeners('mouse.dblclick', {
		originalEvent: event,
		position: {
		  x: event.pageX,
		  y: event.pageY,
		  clientX: event.clientX,
		  clientY: event.clientY
		},
		button: event.button,
	  });
	  this.recordActivity();
	}

	/**
	 * Handle context menu events
	 * @param {MouseEvent} event
	 */
	handleContextMenu(event) {
	  this.notifyListeners('mouse.contextmenu', {
		originalEvent: event,
		position: { 
		  x: this.state.mouse.x, 
		  y: this.state.mouse.y,
		  clientX: this.state.mouse.clientX,
		  clientY: this.state.mouse.clientY
		}
	  });
	  
	  // Record activity
	  this.recordActivity();
	}
	
	/**
	 * Handle touch start events
	 * @param {TouchEvent} event 
	 */
	handleTouchStart(event) {
	  // Handle first touch if no active touch
	  if (this.state.activeTouchId == null && event.touches.length > 0) {
		const touch = event.touches[0];
		this.state.activeTouchId = touch.identifier;
		
		// Update touch position
		this.state.mouse.x = touch.pageX;
		this.state.mouse.y = touch.pageY;
		this.state.mouse.clientX = touch.clientX;
		this.state.mouse.clientY = touch.clientY;
		this.state.mouse.pressed = true;
		this.state.mouse.pressStartTime = Date.now();
		
		// Store all touches in the map
		for (let i = 0; i < event.touches.length; i++) {
		  const t = event.touches[i];
		  this.state.touches.set(t.identifier, {
			id: t.identifier,
			x: t.pageX,
			y: t.pageY,
			clientX: t.clientX,
			clientY: t.clientY,
			startTime: Date.now()
		  });
		}
		
		// Notify listeners
		this.notifyListeners('touch.start', {
		  originalEvent: event,
		  position: { 
			x: touch.pageX, 
			y: touch.pageY,
			clientX: touch.clientX,
			clientY: touch.clientY
		  },
		  touchId: touch.identifier,
		  allTouches: Array.from(this.state.touches.values())
		});
		
		// Also trigger mouse down for compatibility
		this.notifyListeners('mouse.down', {
		  originalEvent: event,
		  position: { 
			x: touch.pageX, 
			y: touch.pageY,
			clientX: touch.clientX,
			clientY: touch.clientY
		  },
		  button: 0, // Left button for touch
		  isTouchEvent: true
		});
	  }
	  
	  // Record activity
	  this.recordActivity();
	}
	
	/**
	 * Handle touch move events
	 * @param {TouchEvent} event 
	 */
	handleTouchMove(event) {
	  // Find our active touch
	  for (let i = 0; i < event.touches.length; i++) {
		const touch = event.touches[i];
		
		// Update the touch in our map
		if (this.state.touches.has(touch.identifier)) {
		  const touchData = this.state.touches.get(touch.identifier);
		  touchData.x = touch.pageX;
		  touchData.y = touch.pageY;
		  touchData.clientX = touch.clientX;
		  touchData.clientY = touch.clientY;
		  this.state.touches.set(touch.identifier, touchData);
		}
		
		// If this is our active touch, update mouse position and notify
		if (touch.identifier === this.state.activeTouchId) {
		  // Update mouse position
		  this.state.mouse.x = touch.pageX;
		  this.state.mouse.y = touch.pageY;
		  this.state.mouse.clientX = touch.clientX;
		  this.state.mouse.clientY = touch.clientY;
		  
		  // Notify touch listeners
		  this.notifyListeners('touch.move', {
			originalEvent: event,
			position: { 
			  x: touch.pageX, 
			  y: touch.pageY,
			  clientX: touch.clientX,
			  clientY: touch.clientY
			},
			touchId: touch.identifier,
			allTouches: Array.from(this.state.touches.values())
		  });
		  
		  // Also notify mouse move listeners for compatibility
		  this.notifyListeners('mouse.move', {
			originalEvent: event,
			position: { 
			  x: touch.pageX, 
			  y: touch.pageY,
			  clientX: touch.clientX,
			  clientY: touch.clientY
			},
			button: 0, // Left button for touch
			isPressed: true,
			isTouchEvent: true
		  });
		  
		  // Also notify drag listeners
		  this.notifyListeners('drag', {
			originalEvent: event,
			position: { 
			  x: touch.pageX, 
			  y: touch.pageY,
			  clientX: touch.clientX,
			  clientY: touch.clientY
			},
			button: 0, // Left button for touch
			pressStartTime: this.state.mouse.pressStartTime,
			duration: Date.now() - this.state.mouse.pressStartTime,
			isTouchEvent: true
		  });
		}
	  }
	  
	  // Record activity
	  this.recordActivity();
	}
	
	/**
	 * Handle touch end events
	 * @param {TouchEvent} event 
	 */
	handleTouchEnd(event) {
	  const gestureConfig = this.getGestureConfig();
	  const tapMaxDuration = gestureConfig.tapMaxDuration ?? 300;
	  const doubleClickInterval = gestureConfig.doubleClickInterval ?? 300;
	  let activeTouch = null;
	  
	  // Find our active touch in the changed touches list
	  for (let i = 0; i < event.changedTouches.length; i++) {
		const touch = event.changedTouches[i];
		
		// Remove this touch from our map
		if (this.state.touches.has(touch.identifier)) {
		  const touchData = this.state.touches.get(touch.identifier);
		  this.state.touches.delete(touch.identifier);
		  
		  // If this was our active touch, process it
		  if (touch.identifier === this.state.activeTouchId) {
			activeTouch = touch;
			
			// Set position for the final events
			this.state.mouse.x = touch.pageX;
			this.state.mouse.y = touch.pageY;
			this.state.mouse.clientX = touch.clientX;
			this.state.mouse.clientY = touch.clientY;
			
			// Calculate duration
			const touchDuration = Date.now() - this.state.mouse.pressStartTime;
			
			// Notify touch end listeners
			this.notifyListeners('touch.end', {
			  originalEvent: event,
			  position: { 
				x: touch.pageX, 
				y: touch.pageY,
				clientX: touch.clientX,
				clientY: touch.clientY
			  },
			  touchId: touch.identifier,
			  duration: touchDuration,
			  allTouches: Array.from(this.state.touches.values())
			});
			
			// Notify mouse up listeners for compatibility
			this.notifyListeners('mouse.up', {
			  originalEvent: event,
			  position: { 
				x: touch.pageX, 
				y: touch.pageY,
				clientX: touch.clientX,
				clientY: touch.clientY
			  },
			  button: 0, // Left button for touch
			  duration: touchDuration,
			  isTouchEvent: true
			});
			
			// If this was a short tap, also trigger a click
			if (touchDuration < tapMaxDuration) {
			  const now = Date.now();
			  const timeSinceLastClick = now - this.state.mouse.lastClickTime;
			  const isDoubleClick = timeSinceLastClick < doubleClickInterval;
			  
			  // Update click time
			  this.state.mouse.lastClickTime = now;
			  
			  // Notify click listeners
			  this.notifyListeners('mouse.click', {
				originalEvent: event,
				position: { 
				  x: touch.pageX, 
				  y: touch.pageY,
				  clientX: touch.clientX,
				  clientY: touch.clientY
				},
				button: 0, // Left button for touch
				isTouchEvent: true,
				isDoubleClick: isDoubleClick,
				timeSinceLastClick: timeSinceLastClick
			  });
			}
		  }
		}
	  }
	  
	  // Reset active touch if it was removed
	  if (activeTouch) {
		this.state.activeTouchId = null;
		this.state.mouse.pressed = false;
		this._dragOwner = null; // Release exclusive drag claim
		
		// Find new active touch if any remain
		if (this.state.touches.size > 0) {
		  const newActive = this.state.touches.values().next().value;
		  this.state.activeTouchId = newActive.id;
		  this.state.mouse.x = newActive.x;
		  this.state.mouse.y = newActive.y;
		  this.state.mouse.clientX = newActive.clientX;
		  this.state.mouse.clientY = newActive.clientY;
		  this.state.mouse.pressed = true;
		}
	  }
	  
	  // Record activity
	  this.recordActivity();
	}
	
	/**
	 * Handle keyboard down events
	 * @param {KeyboardEvent} event 
	 */
	handleKeyDown(event) {
	  // Skip if editing inputs or contentEditable - except Escape, which is
	  // never a typing key. "Get me out of this field" and "get me out of this
	  // panel" are the same gesture to the person pressing it, so it has to
	  // reach the one place that decides what Escape means (see
	  // ContainerInputManager.handleEscape) rather than being swallowed here.
	  if (event.key !== 'Escape' && this.isEditingText(event.target)) {
		return;
	  }
	  
	  // Update keyboard state
	  const key = event.key.toLowerCase();
	  this.state.keyboard.pressedKeys.add(key);
	  this.state.keyboard.lastKeyTime = Date.now();
	  
	  // Notify listeners
	  this.notifyListeners('keyboard.down', {
		originalEvent: event,
		key: key,
		code: event.code,
		shift: event.shiftKey,
		ctrl: event.ctrlKey,
		alt: event.altKey,
		meta: event.metaKey
	  });
	  
	  // Record activity
	  this.recordActivity();
	}
	
	/**
	 * Handle keyboard up events
	 * @param {KeyboardEvent} event 
	 */
	handleKeyUp(event) {
	  // Skip if editing inputs or contentEditable
	  if (this.isEditingText(event.target)) {
		return;
	  }
	  
	  // Update keyboard state
	  const key = event.key.toLowerCase();
	  this.state.keyboard.pressedKeys.delete(key);
	  
	  // Notify listeners
	  this.notifyListeners('keyboard.up', {
		originalEvent: event,
		key: key,
		code: event.code,
		shift: event.shiftKey,
		ctrl: event.ctrlKey,
		alt: event.altKey,
		meta: event.metaKey
	  });
	  
	  // Record activity
	  this.recordActivity();
	}
	
	/**
	 * Handle scroll events
	 * @param {Event} event 
	 */
	handleScroll(event) {
	  // Calculate scroll deltas
	  const deltaX = window.scrollX - this.state.scroll.x;
	  const deltaY = window.scrollY - this.state.scroll.y;
	  
	  // Update scroll state
	  this.state.scroll.x = window.scrollX;
	  this.state.scroll.y = window.scrollY;
	  this.state.scroll.deltaX = deltaX;
	  this.state.scroll.deltaY = deltaY;
	  
	  // Notify listeners
	  this.notifyListeners('scroll', {
		originalEvent: event,
		position: { x: window.scrollX, y: window.scrollY },
		delta: { x: deltaX, y: deltaY }
	  });
	  
	  // Record activity
	  this.recordActivity();
	}
	
	/**
	 * Check if the target element is for text editing
	 * @param {HTMLElement} target
	 * @returns {boolean}
	 */
	/**
	 * Whether keystrokes belong to the page rather than to the game.
	 *
	 * Only text ENTRY counts. A checkbox, a radio and a range are all <input>
	 * too, and treating them as text meant every keyboard shortcut died the
	 * moment the player ticked a box in a panel and stayed dead until they
	 * clicked somewhere else — which is how "G does nothing" happens right
	 * after using the Show grid checkbox.
	 */
	isEditingText(target) {
	  if (!target) return false;
	  if (target.isContentEditable || target.tagName === 'TEXTAREA') return true;
	  if (target.tagName !== 'INPUT') return false;
	  return InputSystem.TEXT_ENTRY_TYPES.has(String(target.type || 'text').toLowerCase());
	}
	
	/**
	 * Record user activity to track idle state
	 */
	recordActivity() {
	  const now = Date.now();
	  this.state.lastActivityTime = now;
	  
	  // If we were inactive, notify listeners about the state change
	  if (!this.state.isActive) {
		this.state.isActive = true;
		this.notifyListeners('activity', {
		  active: true,
		  lastActivityTime: now
		});
	  }
	}
	
	/**
	 * Check if the user has been inactive for the given duration
	 * @param {number} timeout Inactivity timeout in milliseconds
	 * @returns {boolean} Whether activity state changed
	 */
	checkInactivity(timeout = 60000) {
	  const now = Date.now();
	  const inactive = now - this.state.lastActivityTime > timeout;
	  
	  // If state changed, notify listeners
	  if (inactive !== !this.state.isActive) {
		this.state.isActive = !inactive;
		this.notifyListeners('activity', {
		  active: this.state.isActive,
		  lastActivityTime: this.state.lastActivityTime
		});
		return true;
	  }
	  
	  return false;
	}
	
	// ================================================
	// Public API for event subscriptions
	// ================================================
	
	/**
	 * Subscribe to an input event
	 * @param {string} eventType Event type path (e.g. 'mouse.move', 'keyboard.down')
	 * @param {Function} callback Function to call when event occurs
	 * @param {Object} options Optional configuration
	 * @returns {Object} Subscription handle with unsubscribe method
	 */
	on(eventType, callback, options = {}) {
		// console.log(`Subscribing to event: ${eventType}`, options);
	  const path = eventType.split('.');
	  let target = this.listeners;
	  
	  // Navigate to the right event type list
	  for (let i = 0; i < path.length - 1; i++) {
		if (!target[path[i]]) {
		  target[path[i]] = {};
		}
		target = target[path[i]];
	  }
	  
	  // Get the final event name
	  const eventName = path[path.length - 1];
	  
	  // Initialize the event list if needed
	  if (!target[eventName]) {
		target[eventName] = [];
	  }
	  
	  // Add the callback to the list
	  const subscription = { callback, options };
	  target[eventName].push(subscription);
	  
	  // Return a handle for unsubscribing
	  return {
		unsubscribe: () => {
		  const index = target[eventName].indexOf(subscription);
		  if (index !== -1) {
			target[eventName].splice(index, 1);
		  }
		}
	  };
	}
	
	/**
	 * Notify all listeners for a given event type
	 * @param {string} eventType Event type path
	 * @param {Object} data Event data
	 */
	notifyListeners(eventType, data) {
	  const path = eventType.split('.');
	  let target = this.listeners;
	  
	  // Navigate to the right event type list
	  for (let i = 0; i < path.length - 1; i++) {
		if (!target[path[i]]) {
		  return; // No listeners for this path
		}
		target = target[path[i]];
	  }
	  
	  // Get the final event name
	  const eventName = path[path.length - 1];
	  
	  // Check if we have listeners
	  if (!target[eventName] || target[eventName].length === 0) {
		return; // No listeners
	  }
	  
	  // Add timestamp to data
	  data.timestamp = Date.now();
	  
	  // Notify all listeners
	  for (const subscription of target[eventName]) {
		try {
		  subscription.callback(data);
		} catch (e) {
		  console.error('Error in input listener:', e);
		}
	  }
	}
	
	// ================================================
	// Public API for state queries
	// ================================================
	
	/**
	 * Get current mouse position
	 * @returns {Object} Mouse position object with x, y, clientX, clientY
	 */
	getMousePosition() {
	  return {
		x: this.state.mouse.x,
		y: this.state.mouse.y,
		clientX: this.state.mouse.clientX,
		clientY: this.state.mouse.clientY
	  };
	}
	
	/**
	 * Check if a mouse button is currently pressed
	 * @param {number} button Button number (0=left, 1=middle, 2=right)
	 * @returns {boolean}
	 */
	isMouseButtonPressed(button = null) {
	  if (button === null) {
		return this.state.mouse.pressed;
	  }
	  return this.state.mouse.pressed && this.state.mouse.button === button;
	}
	
	/**
	 * Check if a key is currently pressed
	 * @param {string} key Key name (lowercase)
	 * @returns {boolean}
	 */
	isKeyPressed(key) {
	  return this.state.keyboard.pressedKeys.has(key.toLowerCase());
	}
	
	/**
	 * Get all currently pressed keys
	 * @returns {Array<string>} Array of pressed key names
	 */
	getPressedKeys() {
	  return Array.from(this.state.keyboard.pressedKeys);
	}
	
	/**
	 * Get current scroll position
	 * @returns {Object} Scroll position with x, y
	 */
	getScrollPosition() {
	  return {
		x: this.state.scroll.x,
		y: this.state.scroll.y
	  };
	}
	
	/**
	 * Calculate the time a button has been pressed
	 * @returns {number} Press duration in milliseconds, or 0 if not pressed
	 */
	getPressDuration() {
	  if (!this.state.mouse.pressed) {
		return 0;
	  }
	  return Date.now() - this.state.mouse.pressStartTime;
	}
	
	/**
	 * Check if the user is currently active (not idle)
	 * @returns {boolean}
	 */
	isUserActive() {
	  return this.state.isActive;
	}
	
	/**
	 * Transform global coordinates to coordinates relative to an element
	 * @param {number} x Global X coordinate
	 * @param {number} y Global Y coordinate
	 * @param {HTMLElement} element Reference element
	 * @returns {Object} Local coordinates {x, y}
	 */
	getLocalCoordinates(x, y, element) {
	  const rect = element.getBoundingClientRect();
	  return {
		x: x - rect.left - window.scrollX,
		y: y - rect.top - window.scrollY
	  };
	}
	
	/**
	 * Check if global coordinates are inside an element
	 * @param {number} x Global X coordinate
	 * @param {number} y Global Y coordinate
	 * @param {HTMLElement} element Element to check against
	 * @returns {boolean}
	 */
	isPointInElement(x, y, element) {
	  const rect = element.getBoundingClientRect();
	  const localX = x - rect.left - window.scrollX;
	  const localY = y - rect.top - window.scrollY;
	  return (
		localX >= 0 && 
		localY >= 0 && 
		localX < rect.width && 
		localY < rect.height
	  );
	}
  }
