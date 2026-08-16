/**
 * Base class for all input components.
 * Provides common functionality for registering and handling input events.
 */
class InputComponent {
	/**
	 * Create a new InputComponent
	 * @param {Object} target The object this component controls
	 * @param {Object} options Configuration options
	 */
	constructor(target, options = {}) {
	  // The object being controlled (e.g., a Myte, MapObject, etc.)
	  this.target = target;
	  
	  // Element related to this component (optional)
	  this.element = options.element || null;
	  
	  // Merge default options with provided options
	  this.options = { ...this.getDefaultOptions(), ...options };
	  
	  // Component state
	  this.active = true;
	  this.subscriptions = [];
	  
	  // Get InputSystem singleton
	  this.inputSystem = InputSystem.getInstance();
	}
	
	/**
	 * Anything drawn over the world that is chrome rather than world: the stage
	 * chips and bars, the tool sidebars, floating panels, the world-modal layer.
	 * `.ignore` is the existing convention for "input does not treat this as
	 * map"; the rest are the containers that were never given the class.
	 */
	static UI_SELECTOR = '.ignore, .window-panel, .sidebar, .hand-controls, .modal, .toast';

	/**
	 * Whether a press belongs to this component.
	 *
	 * These components subscribe to *document-level* mouse events and each used
	 * to answer that question with its own point-in-rect test against its own
	 * element — three copies of the same arithmetic, and none of them looked at
	 * what was actually under the cursor. That is why nothing painted over the
	 * world could block them: a click on a stage chip landed on the chip *and*
	 * on whichever map object happened to lie beneath it.
	 *
	 * The DOM already knows what was clicked, so it is asked first: a press
	 * whose target is UI chrome is not a press on the world, whatever the
	 * rectangles say. The rect test still has the final word, because a
	 * component's element may be a hitbox that is not itself the event target.
	 *
	 * Presses only. A drag that legitimately began on the map must keep
	 * receiving moves when the cursor crosses a bar on its way.
	 */
	claimsPress(event) {
		if (!this.active) return false;

		const target = event?.originalEvent?.target;
		if (target instanceof Element && target.closest(InputComponent.UI_SELECTOR)) {
			return false;
		}

		return this.containsPoint(event);
	}

	/** Whether the event's point falls inside this component's element. */
	containsPoint(event) {
		if (!this.element) return true;

		const rect = this.element.getBoundingClientRect();
		const x = event?.position?.clientX ?? (event?.position?.x - window.scrollX);
		const y = event?.position?.clientY ?? (event?.position?.y - window.scrollY);
		return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
	}

	/**
	 * Get default options for this component
	 * Override in subclasses to provide component-specific defaults
	 * @returns {Object} Default options
	 */
	getDefaultOptions() {
	  return {
		enabled: true,
		priority: 0
	  };
	}
	
	/**
	 * Initialize the component
	 * Override in subclasses, but call super.initialize()
	 */
	initialize() {
	  if (this.options.enabled) {
		this.enable();
	  } else {
		this.disable();
	  }
	  
	  this.setupSubscriptions();
	}
	
	/**
	 * Set up event subscriptions
	 * Override in subclasses to register specific events
	 */
	setupSubscriptions() {
	  // Implement in subclasses
	}
	
	/**
	 * Register an event subscription
	 * @param {string} eventType Event type to subscribe to
	 * @param {Function} callback Callback function
	 * @param {Object} options Subscription options
	 */
	subscribe(eventType, callback, options = {}) {
	  const boundCallback = callback.bind(this);
	  const subscription = this.inputSystem.on(eventType, boundCallback, options);
	  this.subscriptions.push(subscription);
	  return subscription;
	}
	
	/**
	 * Enable this component
	 */
	enable() {
	  this.active = true;
	}
	
	/**
	 * Disable this component
	 */
	disable() {
	  this.active = false;
	}
	
	/**
	 * Toggle enabled state
	 * @returns {boolean} New enabled state
	 */
	toggle() {
	  this.active = !this.active;
	  return this.active;
	}
	
	/**
	 * Check if this component is active
	 * @returns {boolean}
	 */
	isActive() {
	  return this.active;
	}
	
	/**
	 * Override this method for any per-frame updates
	 * @param {number} deltaTime Time since last frame in ms
	 */
	update(deltaTime) {
	  // Default implementation does nothing
	}
	
	/**
	 * Transform global coordinates to local coordinates relative to target element
	 * @param {number} x Global X coordinate
	 * @param {number} y Global Y coordinate
	 * @returns {Object} Local coordinates {x, y}
	 */
	getLocalCoordinates(x, y) {
	  if (!this.element) return { x, y };
	  
	  const rect = this.element.getBoundingClientRect();
	  return {
		x: x - rect.left - window.scrollX,
		y: y - rect.top - window.scrollY
	  };
	}
	
	/**
	 * Clean up all subscriptions and resources
	 * Override in subclasses, but always call super.dispose()
	 */
	dispose() {
	  // Clean up all subscriptions
	  this.subscriptions.forEach(sub => sub.unsubscribe());
	  this.subscriptions = [];
	}
  }
