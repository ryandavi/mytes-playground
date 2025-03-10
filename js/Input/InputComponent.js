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
	 * Override in subclasses, but always call super.destroy()
	 */
	destroy() {
	  // Clean up all subscriptions
	  this.subscriptions.forEach(sub => sub.unsubscribe());
	  this.subscriptions = [];
	}
  }
