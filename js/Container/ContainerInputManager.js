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
    this.setupLongTapHandling();

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
    this.inputSystem.recordActivity?.();
  }

  /**
   * Check if the user has been inactive for the specified duration
   * @param {number} timeout The timeout in milliseconds
   * @returns {boolean} Whether the user's status has changed
   */
  checkInactive() {
    const didChange = this.inputSystem.checkInactivity(this.inactivityTimeout);
    if (this.inputSystem.isUserActive()) {
      this.lastActiveTime = Date.now();
    }

    return didChange;
  }

  /**
   * Check if the user is currently considered active
   * @returns {boolean} Whether the user is active
   */
  isUserActive() {
    return this.inputSystem.isUserActive();
  }

  /**
   * Check for user inactivity and notify container
   */
  checkInactivity() {
    const wasActive = this.inputSystem.isUserActive();
    this.inputSystem.checkInactivity(this.inactivityTimeout);
    const isActive = this.inputSystem.isUserActive();

    if (isActive) {
      this.lastActiveTime = Date.now();
    }

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

      // Double-click on the map → A* move active myte to clicked world position
      if (event.isDoubleClick) {
        this._tryAStarToClick(event.position.x, event.position.y);
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
   * Set up long-press on mobile to A* move the active myte
   */
  setupLongTapHandling() {
    const LONG_PRESS_MS = 500;
    const MOVE_CANCEL_PX = 10;
    let timer = null;
    let startX = 0;
    let startY = 0;

    this.inputSystem.on('touch.start', (event) => {
      if (!this.isEnabled) return;
      startX = event.position.x;
      startY = event.position.y;
      timer = setTimeout(() => {
        timer = null;
        this._tryAStarToClick(startX, startY);
      }, LONG_PRESS_MS);
    });

    this.inputSystem.on('touch.move', (event) => {
      if (!timer) return;
      if (Math.abs(event.position.x - startX) > MOVE_CANCEL_PX ||
          Math.abs(event.position.y - startY) > MOVE_CANCEL_PX) {
        clearTimeout(timer);
        timer = null;
      }
    });

    this.inputSystem.on('touch.end', () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    });
  }

  /**
   * A* move the active myte to a screen-space coordinate
   */
  _tryAStarToClick(screenX, screenY) {
    const myte = this.container.activeMyte;
    if (!myte?.isActive || !myte.pathfinder || myte.queue.isCarrying()) return;
    if (!this.container.ui?.isTool(UIToolModes.SELECT)) return;
    const world = this.screenToWorldCoordinates(screenX, screenY);
    myte.queue.add('astar-move', { target: { x: world.x, y: world.y } });
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

  getZoomLevel() {
    return this.container.camera?.zoomLevel || 1;
  }

  getCameraOffset(includeCamera = true) {
    if (!includeCamera || !this.container.camera) {
      return { x: 0, y: 0 };
    }

    return {
      x: this.container.camera.posX,
      y: this.container.camera.posY
    };
  }

  pageToContainerCoordinates(x, y) {
    const containerRect = this.container.getContainerRect();
    const zoomLevel = this.getZoomLevel();

    return {
      x: (x - containerRect.left) / zoomLevel,
      y: (y - containerRect.top) / zoomLevel
    };
  }

  containerToPageCoordinates(x, y) {
    const containerRect = this.container.getContainerRect();
    const zoomLevel = this.getZoomLevel();

    return {
      x: x * zoomLevel + containerRect.left,
      y: y * zoomLevel + containerRect.top
    };
  }

  containerToWorldCoordinates(x, y, options = {}) {
    const cameraOffset = this.getCameraOffset(options.includeCamera !== false);
    const elementOffset = this.getElementWorldOffset(options.element);
    const additionalOffset = options.additionalOffset || { x: 0, y: 0 };

    return {
      x: x - elementOffset.x - cameraOffset.x - additionalOffset.x,
      y: y - elementOffset.y - cameraOffset.y - additionalOffset.y
    };
  }

  worldToContainerCoordinates(x, y, options = {}) {
    const cameraOffset = this.getCameraOffset(options.includeCamera !== false);
    const elementOffset = this.getElementWorldOffset(options.element);
    const additionalOffset = options.additionalOffset || { x: 0, y: 0 };

    return {
      x: x + cameraOffset.x + elementOffset.x + additionalOffset.x,
      y: y + cameraOffset.y + elementOffset.y + additionalOffset.y
    };
  }

  getElementWorldOffset(element, zoomLevel = this.getZoomLevel()) {
    if (!element) {
      return { x: 0, y: 0 };
    }

    if (element.size?.width || element.size?.height) {
      return {
        x: (element.size?.width || 0) / 2,
        y: (element.size?.height || 0) / 2
      };
    }

    if (typeof element.getRect === 'function') {
      const rect = element.getRect();
      return {
        x: rect.width / (2 * zoomLevel),
        y: rect.height / (2 * zoomLevel)
      };
    }

    if (typeof element.getBoundingClientRect === 'function') {
      const rect = element.getBoundingClientRect();
      return {
        x: rect.width / (2 * zoomLevel),
        y: rect.height / (2 * zoomLevel)
      };
    }

    return { x: 0, y: 0 };
  }

  screenDeltaToWorldDelta(x, y) {
    const zoomLevel = this.getZoomLevel();
    return {
      x: x / zoomLevel,
      y: y / zoomLevel
    };
  }
  
  /**
   * Convert screen coordinates to world coordinates
   * Core coordinate transformation function
   * @param {number} x X coordinate
   * @param {number} y Y coordinate
   * @param {Object} options Additional options
   * @returns {Object} World coordinates {x, y}
   */
  screenToWorldCoordinates(x, y, options = {}) {
    const containerPoint = this.pageToContainerCoordinates(x, y);
    return this.containerToWorldCoordinates(containerPoint.x, containerPoint.y, options);
  }

  /**
   * Convert world coordinates to screen coordinates
   * @param {number} x X coordinate
   * @param {number} y Y coordinate
   * @returns {Object} Screen coordinates {x, y}
   */
  worldToScreenCoordinates(x, y) {
    const containerPoint = this.worldToContainerCoordinates(x, y);
    return this.containerToPageCoordinates(containerPoint.x, containerPoint.y);
  }

  getMouseWorldPosition(options = {}) {
    const mousePos = this.getMousePosition();
    return this.screenToWorldCoordinates(mousePos.x, mousePos.y, options);
  }

  getMouseContainerPosition(options = {}) {
    const mousePos = this.getMousePosition();
    const containerPoint = this.pageToContainerCoordinates(mousePos.x, mousePos.y);

    if (options.includeCamera === false && !options.element && !options.additionalOffset) {
      return containerPoint;
    }

    return this.containerToWorldCoordinates(containerPoint.x, containerPoint.y, {
      ...options,
      includeCamera: false
    });
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
    return {
      x: this.getMousePosition().x - this.container.getRect(element).left,
      y: this.getMousePosition().y - this.container.getRect(element).top
    };
  }

  //==================================================
  // COMPATIBILITY METHODS (TO BE PHASED OUT)
  //==================================================
  
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
