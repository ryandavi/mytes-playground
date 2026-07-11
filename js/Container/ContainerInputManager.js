class ContainerInputManager {
  /**
   * Create a new ContainerInputManager
   * @param {ContainerManager} containerManager The parent container manager
   */
  constructor(containerManager) {
    this.container = containerManager;
    this.inputSystem = InputSystem.getInstance();
    this.subscriptions = [];
    this.interactionConfig = SiteConfig.interaction;

    // Track input state
    this.isEnabled = true;
    this.inactivityTimeout = SiteConfig.myte.inactiveTimeout;
    this.longTapTimer = null;
    this.longTapStartX = 0;
    this.longTapStartY = 0;
    this.longTapEligibleTarget = false;

    // Set up event handlers
    this.setupKeyboardShortcuts();
    this.setupClickHandling();
    this.setupLongTapHandling();

    // Track inactivity
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
    Utility.logDebug('Input manager disabled');
    this.clearLongTapTimer();

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
    Utility.logDebug('Input manager enabled');

    // Remove visual indicator if you added one
    document.body.classList.remove('inputs-disabled');

    // Reset last active time when re-enabling
    this.setLastActive();
    this.container?.handleUserActive?.();
  }

  //==================================================
  // ACTIVITY TRACKING METHODS
  //==================================================
  
  /**
   * Set the last active time to now
   * This is used to track user activity
   */
  setLastActive() {
    this.inputSystem.recordActivity?.();
  }

  /**
   * Check if the user has been inactive for the specified duration
   * @param {number} timeout The timeout in milliseconds
   * @returns {boolean} Whether the user's status has changed
   */
  checkInactive(timeout = this.inactivityTimeout) {
    if (!this.isEnabled) {
      return false;
    }

    if (Number.isFinite(timeout) && timeout > 0) {
      this.inactivityTimeout = timeout;
    }

    return this.inputSystem.checkInactivity(this.inactivityTimeout);
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
    if (!this.isEnabled) {
      return;
    }

    const wasActive = this.inputSystem.isUserActive();
    this.inputSystem.checkInactivity(this.inactivityTimeout);
    const isActive = this.inputSystem.isUserActive();

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
    const toolConfig = this.container.ui?.toolManager?.toolConfig || this.container.ui?.toolConfig || {};

    Object.entries(toolConfig).forEach(([mode, config]) => {
      if (config && config.shortcut) {
        this.subscribe('keyboard.down', (event) => {
          if (!this.isEnabled) return; // Ignore when disabled
          if (event.key === config.shortcut.toLowerCase()) {
            this.container.ui.changeToolMode(mode);
          }
        });
      }
    });

    // Sound toggle
    this.subscribe('keyboard.down', (event) => {
      if (!this.isEnabled) return; // Ignore when disabled
      if (event.key === 'm') {
        // Add null check for sound panel
        this.container.ui?.soundPanel?.toggleSounds?.();
      }
    });

    // Escape key
    this.subscribe('keyboard.down', (event) => {
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
    this.subscribe('mouse.click', (event) => {
      if (!this.isEnabled) return;
      if (event.originalEvent && event.originalEvent.defaultPrevented) return;

      // Handle element click for active Myte
      if (this.container.activeMyte &&
        this.container.activeMyte.isActive &&
        this.container.ui.isTool(UIToolModes.SELECT)) {

        const element = event.originalEvent?.target;
        if (element && this.isClickableElement(element)) {
          // this.container.ui.setSelected(element);
        }
      }
    });

    // Double-click on the map → A* move active myte to clicked world position.
    // Uses native dblclick (separate DOM event) so it fires reliably even when
    // individual click events are stopped by child elements (e.g. myte overlay).
    this.subscribe('mouse.dblclick', (event) => {
      if (!this.isEnabled) { Utility.logDebug('[dblclick] blocked: ContainerInputManager disabled'); return; }
      if (event.originalEvent && event.originalEvent.defaultPrevented) { Utility.logDebug('[dblclick] blocked: defaultPrevented'); return; }
      const target = event.originalEvent?.target;
      Utility.logDebug('[dblclick] target:', target?.className || target?.tagName);
      if (!this.canStartWorldGestureFromTarget(target)) { Utility.logDebug('[dblclick] blocked: non-world target'); return; }
      this._tryAStarToClick(event.position.x, event.position.y);
    });
  }

  /**
   * Set up long-press on mobile to A* move the active myte
   */
  setupLongTapHandling() {
    const worldGestureConfig = this.interactionConfig?.world ?? {};
    const longPressDelay = worldGestureConfig.longPressMoveDelay ?? 500;
    const cancelDistance = worldGestureConfig.longPressMoveCancelDistance ?? 10;

    this.subscribe('touch.start', (event) => {
      if (!this.isEnabled) return;
      this.clearLongTapTimer();
      this.longTapEligibleTarget = this.canStartWorldGestureFromTarget(event.originalEvent?.target);
      if (!this.longTapEligibleTarget) {
        return;
      }
      this.longTapStartX = event.position.x;
      this.longTapStartY = event.position.y;
      this.longTapTimer = setTimeout(() => {
        this.longTapTimer = null;
        this._tryAStarToClick(this.longTapStartX, this.longTapStartY);
      }, longPressDelay);
    });

    this.subscribe('touch.move', (event) => {
      if (!this.longTapTimer || !this.longTapEligibleTarget) return;
      if (Math.abs(event.position.x - this.longTapStartX) > cancelDistance ||
          Math.abs(event.position.y - this.longTapStartY) > cancelDistance) {
        this.clearLongTapTimer();
      }
    });

    this.subscribe('touch.end', () => this.clearLongTapTimer());
  }

  /**
   * A* move the active myte to a screen-space coordinate
   */
  _tryAStarToClick(screenX, screenY) {
    const myte = this.container.activeMyte;
    if (!myte?.isActive || !myte.pathfinder || myte.queue.isCarrying()) {
      Utility.logDebug('[astar] blocked: isActive=%s pathfinder=%s carrying=%s', myte?.isActive, !!myte?.pathfinder, myte?.queue.isCarrying());
      return;
    }
    if (!this.container.ui?.isTool(UIToolModes.SELECT)) {
      Utility.logDebug('[astar] blocked: tool is not SELECT, current tool:', this.container.ui?.currentTool);
      return;
    }
    const world = this.screenToWorldCoordinates(screenX, screenY);
    Utility.logDebug('[astar] queuing astar-move to world', world);
    // Clear first so the old action's _onDone fires before we place the new marker,
    // preventing the old callback from erasing the new marker.
    myte.queue.clear();
    this._showDestinationMarker(world.x, world.y);
    myte.queue.add('astar-move', {
      target: { x: world.x, y: world.y },
      pathfindingOptions: { exactEndMode: 'if-reachable' },
      userInitiated: true,
      _onDone: () => this._clearDestinationMarker()
    });
  }

  _showDestinationMarker(worldX, worldY) {
    this._clearDestinationMarker();
    const layer = this.container.canvas?.querySelector('.layer.effects');
    if (!layer) return;

    const marker = document.createElement('div');
    marker.className = 'destination-marker';
    marker.style.left = `${worldX}px`;
    marker.style.top = `${worldY}px`;

    const dot = document.createElement('div');
    dot.className = 'dot';
    const ring1 = document.createElement('div');
    ring1.className = 'ring';
    const ring2 = document.createElement('div');
    ring2.className = 'ring';
    marker.append(dot, ring1, ring2);

    layer.appendChild(marker);
    this._destinationMarker = marker;
  }

  _clearDestinationMarker() {
    if (this._destinationMarker) {
      this._destinationMarker.remove();
      this._destinationMarker = null;
    }
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

  canStartWorldGestureFromTarget(target) {
    if (!(target instanceof Element)) {
      return false;
    }

    if (!this.container.canvas?.contains?.(target)) {
      return false;
    }

    const blockedSelector = [
      '.world-myte',
      '.map-object',
      '.myte-slot',
      '.interactive-hitbox',
      '.map-object-slot',
      'button',
      'input',
      'textarea',
      'select',
      'option',
      'label',
      'a',
      '[role=\"button\"]'
    ].join(', ');

    return !target.closest(blockedSelector);
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
    const zoomLevel = this.container.camera?.zoomLevel;
    return Number.isFinite(zoomLevel) && zoomLevel > 0 ? zoomLevel : 1;
  }

  getCameraOffset(includeCamera = true) {
    if (!includeCamera || !this.container.camera) {
      return { x: 0, y: 0 };
    }

    return {
      x: Number.isFinite(this.container.camera.posX) ? this.container.camera.posX : 0,
      y: Number.isFinite(this.container.camera.posY) ? this.container.camera.posY : 0
    };
  }

  pageToContainerCoordinates(x, y) {
    const containerRect = this.container.getContainerRect();
    const zoomLevel = this.getZoomLevel();
    const safeX = Number.isFinite(x) ? x : containerRect.left;
    const safeY = Number.isFinite(y) ? y : containerRect.top;
    const safeLeft = Number.isFinite(containerRect.left) ? containerRect.left : 0;
    const safeTop = Number.isFinite(containerRect.top) ? containerRect.top : 0;

    return {
      x: (safeX - safeLeft) / zoomLevel,
      y: (safeY - safeTop) / zoomLevel
    };
  }

  containerToPageCoordinates(x, y) {
    const containerRect = this.container.getContainerRect();
    const zoomLevel = this.getZoomLevel();
    const safeX = Number.isFinite(x) ? x : 0;
    const safeY = Number.isFinite(y) ? y : 0;
    const safeLeft = Number.isFinite(containerRect.left) ? containerRect.left : 0;
    const safeTop = Number.isFinite(containerRect.top) ? containerRect.top : 0;

    return {
      x: safeX * zoomLevel + safeLeft,
      y: safeY * zoomLevel + safeTop
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
    const safeZoomLevel = Number.isFinite(zoomLevel) && zoomLevel > 0 ? zoomLevel : 1;

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
        x: rect.width / (2 * safeZoomLevel),
        y: rect.height / (2 * safeZoomLevel)
      };
    }

    if (typeof element.getBoundingClientRect === 'function') {
      const rect = element.getBoundingClientRect();
      return {
        x: rect.width / (2 * safeZoomLevel),
        y: rect.height / (2 * safeZoomLevel)
      };
    }

    return { x: 0, y: 0 };
  }

  screenDeltaToWorldDelta(x, y) {
    const zoomLevel = this.getZoomLevel();
    return {
      x: (Number.isFinite(x) ? x : 0) / zoomLevel,
      y: (Number.isFinite(y) ? y : 0) / zoomLevel
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

  isMouseInContainer() {
    return this.container?.isMouseInContainer?.() ?? false;
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

  subscribe(eventName, handler) {
    const subscription = this.inputSystem.on(eventName, handler);
    this.subscriptions.push(subscription);
    return subscription;
  }

  clearLongTapTimer() {
    if (this.longTapTimer) {
      clearTimeout(this.longTapTimer);
      this.longTapTimer = null;
    }
    this.longTapEligibleTarget = false;
  }
  
  /**
   * Clean up resources
   */
  dispose() {
    this.clearLongTapTimer();
    document.body.classList.remove('inputs-disabled');

    if (this.inactivityCheckInterval) {
      clearInterval(this.inactivityCheckInterval);
      this.inactivityCheckInterval = null;
    }

    this.subscriptions.forEach(subscription => subscription?.unsubscribe?.());
    this.subscriptions = [];
  }
}
