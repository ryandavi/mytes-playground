class ContainerInputManager {
  /**
   * Create a new ContainerInputManager
   * @param {ContainerManager} containerManager The parent container manager
   */
  constructor(containerManager) {
    this.container = containerManager;
    this.inputSystem = InputSystem.getInstance();

    // Track input state
    this.isEnabled = true;
    this.lastActiveTime = Date.now();

    // Set up event handlers
    this.setupKeyboardShortcuts();
    this.setupClickHandling();
    this.setupScrollHandling();

    // Track inactivity
    this.inactivityTimeout = 60000; // 1 minute
    this.inactivityCheckInterval = setInterval(() => {
      this.checkInactivity();
    }, 10000); // Check every 10 seconds
  }

  //==================================================
  // INPUT ENABLE/DISABLE METHODS
  //==================================================
  
  /**
   * Disable all input handling
   * This is called during map transitions or other moments when input should be ignored
   */
  disable() {
    if (!this.isEnabled) return; // Already disabled

    this.isEnabled = false;
    console.log('Input manager disabled');

    // You might want to add a visual indicator that inputs are disabled
    document.body.classList.add('inputs-disabled');
  }

  /**
   * Re-enable input handling
   * This is called after map transitions or when input should be allowed again
   */
  enable() {
    if (this.isEnabled) return; // Already enabled

    this.isEnabled = true;
    console.log('Input manager enabled');

    // Remove visual indicator if you added one
    document.body.classList.remove('inputs-disabled');

    // Reset last active time when re-enabling
    this.setLastActive();
  }

  //==================================================
  // ACTIVITY TRACKING METHODS
  //==================================================
  
  /**
   * Set the last active time to now
   * This is used to track user activity
   */
  setLastActive() {
    this.lastActiveTime = Date.now();
  }

  /**
   * Check if the user has been inactive for the specified duration
   * @param {number} timeout The timeout in milliseconds
   * @returns {boolean} Whether the user's status has changed
   */
  checkInactive() {
    // Don't call this.checkInactive() as it creates an infinite recursion!
    // Instead, directly implement the functionality without recursion
    const elapsedTime = Date.now() - this.lastActiveTime;
    const isNowActive = elapsedTime < this.inactivityTimeout;
    
    return false; // Always return false for backward compatibility
  }

  /**
   * Check if the user is currently considered active
   * @returns {boolean} Whether the user is active
   */
  isUserActive() {
    const elapsedTime = Date.now() - this.lastActiveTime;
    return elapsedTime < this.inactivityTimeout;
  }

  /**
   * Check for user inactivity and notify container
   */
  checkInactivity() {
    const wasActive = this.isUserActive();
    this.inputSystem.checkInactivity(this.inactivityTimeout);
    const isActive = this.inputSystem.isUserActive();

    // If activity state changed
    if (wasActive !== isActive) {
      if (isActive) {
        // User became active
        this.container.handleUserActive();
      } else {
        // User became inactive
        this.container.handleUserInactive();
      }
    }
  }

  //==================================================
  // EVENT SETUP METHODS
  //==================================================
  
  /**
   * Set up keyboard shortcuts
   */
  setupKeyboardShortcuts() {
    // Tool shortcuts - Add null check for this.container.ui.toolConfig
    const toolConfig = this.container.ui?.toolConfig || {};

    Object.entries(toolConfig).forEach(([mode, config]) => {
      if (config && config.shortcut) {
        this.inputSystem.on('keyboard.down', (event) => {
          if (!this.isEnabled) return; // Ignore when disabled
          if (event.key === config.shortcut.toLowerCase()) {
            this.container.ui.changeToolMode(mode);
          }
        });
      }
    });

    // Sound toggle
    this.inputSystem.on('keyboard.down', (event) => {
      if (!this.isEnabled) return; // Ignore when disabled
      if (event.key === 'm') {
        // Add null check for soundMenu
        this.container.ui?.soundMenu?.toggleSounds?.();
      }
    });

    // Escape key
    this.inputSystem.on('keyboard.down', (event) => {
      if (!this.isEnabled) return; // Ignore when disabled
      if (event.key === 'escape') {
        this.handleEscape();
      }
    });
  }

  /**
   * Set up click handling
   */
  setupClickHandling() {
    // Handle clicks on the container
    this.inputSystem.on('mouse.click', (event) => {
      if (!this.isEnabled) return; // Ignore when disabled

      // Don't handle clicks if they've been handled by a specific element
      if (event.originalEvent && event.originalEvent.defaultPrevented) {
        return;
      }

      // Handle element click for active Myte
      if (this.container.activeMyte &&
        this.container.activeMyte.isActive &&
        this.container.ui.isTool(UIToolModes.SELECT)) {

        // Check if we clicked on a valid element
        const element = event.originalEvent?.target;
        if (element && this.isClickableElement(element)) {
          // this.container.ui.setSelected(element);
        }
      }
    });
  }

  /**
   * Set up scroll handling
   */
  setupScrollHandling() {
    this.inputSystem.on('scroll', (event) => {
      if (!this.isEnabled) return; // Ignore when disabled

      // Update camera if needed
      if (this.container.camera) {
        this.container.camera.handleScroll(event);
      }
    });
  }

  /**
   * Handle escape key
   */
  handleEscape() {
    // Clear selection
    this.container.ui.setSelected(null);

    // Handle carrying state
    if (this.container.activeMyte?.queue.isCarrying()) {
      this.container.activeMyte.queue.addPutDownMyte();
    }
  }

  //==================================================
  // ELEMENT INTERACTION METHODS
  //==================================================
  
  /**
   * Check if an element is clickable
   * @param {HTMLElement} element Element to check
   * @returns {boolean} Whether element is clickable
   */
  isClickableElement(element) {
    // Ignore elements with ignore class
    if (element.classList && element.classList.contains('ignore')) {
      return false;
    }

    // Ignore form controls and links
    const ignoreElements = ['input', 'textarea', 'select', 'button', 'a'];
    if (ignoreElements.includes(element.tagName.toLowerCase())) {
      return false;
    }

    return true;
  }

  /**
   * Check if a point is within an element's bounds
   * @param {number} x X coordinate
   * @param {number} y Y coordinate
   * @param {HTMLElement} element Element to check
   * @returns {boolean} Whether point is within element
   */
  isPointInElement(x, y, element) {
    const rect = element.getBoundingClientRect();
    
    return (
      x >= rect.left &&
      x <= rect.right &&
      y >= rect.top &&
      y <= rect.bottom
    );
  }

  /**
   * Check if the current mouse position is within an element
   * @param {HTMLElement} element Element to check
   * @returns {boolean} Whether mouse is over element
   */
  isMouseOverElement(element) {
    const mousePos = this.getMousePosition();
    return this.isPointInElement(mousePos.x, mousePos.y, element);
  }

  //==================================================
  // COORDINATE TRANSFORMATION METHODS
  //==================================================
  
  /**
   * Convert screen coordinates to world coordinates
   * Core coordinate transformation function
   * @param {number} x X coordinate
   * @param {number} y Y coordinate
   * @param {Object} options Additional options
   * @returns {Object} World coordinates {x, y}
   */
  screenToWorldCoordinates(x, y, options = {}) {
    const containerRect = this.container.getContainerRect();
    const zoomLevel = this.container.camera ? this.container.camera.zoomLevel : 1;
    const cameraOffset = (options.includeCamera !== false && this.container.camera) ? {
      x: this.container.camera.posX,
      y: this.container.camera.posY
    } : { x: 0, y: 0 };
    
    // Calculate element offset
    const elementOffset = options.element ? {
      x: options.element.getRect ? options.element.getRect().width / 2 : 0,
      y: options.element.getRect ? options.element.getRect().height / 2 : 0
    } : { x: 0, y: 0 };
    
    // Calculate additional offset
    const additionalOffset = options.additionalOffset || { x: 0, y: 0 };
    
    return {
      x: (x - containerRect.left) / zoomLevel - elementOffset.x - cameraOffset.x - additionalOffset.x,
      y: (y - containerRect.top) / zoomLevel - elementOffset.y - cameraOffset.y - additionalOffset.y
    };
  }

  /**
   * Convert world coordinates to screen coordinates
   * @param {number} x X coordinate
   * @param {number} y Y coordinate
   * @returns {Object} Screen coordinates {x, y}
   */
  worldToScreenCoordinates(x, y) {
    const containerRect = this.container.getContainerRect();
    const zoomLevel = this.container.camera ? this.container.camera.zoomLevel : 1;
    const cameraOffset = this.container.camera ? {
      x: this.container.camera.posX,
      y: this.container.camera.posY
    } : { x: 0, y: 0 };
    
    return {
      x: (x + cameraOffset.x) * zoomLevel + containerRect.left,
      y: (y + cameraOffset.y) * zoomLevel + containerRect.top
    };
  }

  /**
   * Get mouse position in screen coordinates
   * @returns {Object} Mouse position {x, y}
   */
  getMousePosition() {
    return this.inputSystem.getMousePosition();
  }

  /**
   * Get mouse press duration
   * @returns {number} Duration in ms
   */
  getPressDuration() {
    return this.inputSystem.getPressDuration();
  }

  /**
   * Get the current press state
   * @returns {boolean} Whether mouse/touch is currently pressed
   */
  isPressed() {
    return this.inputSystem.isMouseButtonPressed();
  }

  /**
   * Get offset position relative to a specific element
   * @param {HTMLElement} element Element to get offset against
   * @returns {Object} Element-relative coordinates {x, y}
   */
  getElementMouse(element) {
    const mousePos = this.getMousePosition();
    const rect = element.getBoundingClientRect();
    const zoomLevel = this.container.camera ? this.container.camera.zoomLevel : 1;
  
    return {
      x: (mousePos.x - rect.left - window.scrollX) / zoomLevel,
      y: (mousePos.y - rect.top - window.scrollY) / zoomLevel
    };
  }

  //==================================================
  // COMPATIBILITY METHODS (TO BE PHASED OUT)
  //==================================================
  
  /**
   * @deprecated Use screenToWorldCoordinates instead
   * Get mouse position in local container coordinates
   * @param {Object} element Optional element for offset
   * @returns {Object} Local coordinates {x, y}
   */
  getLocalMouse(element = null) {
    const mousePos = this.getMousePosition();
    return this.screenToWorldCoordinates(mousePos.x, mousePos.y, { element });
  }

  /**
   * @deprecated Use screenToWorldCoordinates instead
   * Get mouse position relative to the container, ignoring camera offset
   * @param {Object} element Optional element for offset
   * @returns {Object} Container-relative coordinates {x, y}
   */
  getContainerMouse(element = null) {
    const mousePos = this.getMousePosition();
    return this.screenToWorldCoordinates(mousePos.x, mousePos.y, { element, includeCamera: false });
  }

  /**
   * @deprecated Use getMousePosition instead
   * Get mouse position in global/page coordinates
   * @returns {Object} Mouse position {x, y}
   */
  getGlobalMouse() {
    return this.getMousePosition();
  }

  /**
   * @deprecated Use screenToWorldCoordinates instead
   * Get mouse position in local coordinates with camera offset
   * Similar to getLocalMouse but with customizable offset behavior
   * @param {Object} options Configuration options
   * @returns {Object} Adjusted coordinates {x, y}
   */
  getAdjustedMouse(options = {}) {
    const mousePos = this.getMousePosition();
    return this.screenToWorldCoordinates(mousePos.x, mousePos.y, {
      element: options.elementOffset,
      includeCamera: options.includeCamera,
      additionalOffset: options.additionalOffset
    });
  }

  /**
   * Clean up resources
   */
  dispose() {
    if (this.inactivityCheckInterval) {
      clearInterval(this.inactivityCheckInterval);
      this.inactivityCheckInterval = null;
    }
  }
}