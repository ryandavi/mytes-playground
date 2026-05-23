/**
 * Component to handle click, double-click, and long press interactions
 */
class ClickComponent extends InputComponent {
  /**
   * Get default options for this component
   * @returns {Object} Default options
   */
  getDefaultOptions() {
    return {
      ...super.getDefaultOptions(),
      doubleClickInterval: 300,      // Max time between clicks for a double click (ms)
      longPressDelay: 500,           // Time to hold for a long press (ms)
      clickMoveThreshold: 10,        // Max distance moved to still count as a click
      preventContextMenu: false,     // Whether to prevent context menu on right click
      stopPropagation: true,         // Whether to stop event propagation
      
      // Callbacks
      onClick: null,                 // Called on click
      onDoubleClick: null,           // Called on double click
      onRightClick: null,            // Called on right click
      onLongPress: null,             // Called on long press
      onPressStart: null,            // Called when press starts
      onPressEnd: null,              // Called when press ends
      canClick: null                 // Function to check if clicking is allowed
    };
  }
  
  /**
   * Initialize the component
   */
  initialize() {
    super.initialize();
    
    // Click state
    this.isPressed = false;
    this.pressStartTime = 0;
    this.pressStartPosition = { x: 0, y: 0 };
    this.lastClickTime = 0;
    this.longPressTimer = null;
    this.touchId = null;
    
    // Add context menu listener if needed
    if (this.options.preventContextMenu && this.element) {
      this.element.addEventListener('contextmenu', this.handleContextMenu);
    }
  }
  
  /**
   * Set up event subscriptions
   */
  setupSubscriptions() {
    // Listen for clicks
    this.subscribe('mouse.down', this.handlePressStart);
    this.subscribe('mouse.up', this.handlePressEnd);
    this.subscribe('mouse.click', this.handleClick);
    
    // Listen for mouse movement during press
    this.subscribe('mouse.move', this.handleMouseMove);
    
    // Listen for touch events
    this.subscribe('touch.start', this.handlePressStart);
    this.subscribe('touch.end', this.handlePressEnd);
    this.subscribe('touch.move', this.handleMouseMove);
  }
  
  /**
   * Handle press start (mousedown/touchstart)
   * @param {Object} event Input system event
   */
  handlePressStart = (event) => {
    if (!this.active) return;
    
    // Check if clicking is allowed
    if (this.options.canClick && !this.options.canClick(event)) {
      return;
    }
    
    // For touch events, store the touch ID
    if (event.touchId !== undefined) {
      this.touchId = event.touchId;
    } else {
      this.touchId = null;
    }
    
    // Check if click is within the element
    if (this.element) {
      const rect = this.element.getBoundingClientRect();
      const localPos = {
        x: event.position.x - rect.left - window.scrollX,
        y: event.position.y - rect.top - window.scrollY
      };
      const isInside = localPos.x >= 0 && localPos.y >= 0 &&
                      localPos.x <= rect.width &&
                      localPos.y <= rect.height;

      if (!isInside) return;
    }

    // Stop propagation if needed
    if (this.options.stopPropagation && event.originalEvent) {
      event.originalEvent.stopPropagation();
    }

    // Store press information
    this.isPressed = true;
    this.pressStartTime = Date.now();
    this.pressStartPosition = { ...event.position };
    
    // Start long press timer
    if (this.options.onLongPress) {
      this.cancelLongPressTimer();
      this.longPressTimer = setTimeout(() => {
        if (this.isPressed) {
          this.handleLongPress(event);
        }
      }, this.options.longPressDelay);
    }
    
    // Call press start callback
    if (this.options.onPressStart) {
      this.options.onPressStart({
        originalEvent: event.originalEvent,
        position: event.position,
        button: event.button,
        isTouchEvent: event.isTouchEvent
      });
    }
  }
  
  /**
   * Handle press end (mouseup/touchend)
   * @param {Object} event Input system event
   */
  handlePressEnd = (event) => {
    if (!this.active || !this.isPressed) return;
    
    // For touch events, check if it's the right touch
    if (event.touchId !== undefined && event.touchId !== this.touchId) {
      return;
    }
    
    // Stop long press timer
    this.cancelLongPressTimer();
    
    // Check if press end is within threshold of press start
    const deltaX = event.position.x - this.pressStartPosition.x;
    const deltaY = event.position.y - this.pressStartPosition.y;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    
    // Reset press state
    const wasPressed = this.isPressed;
    this.isPressed = false;
    this.touchId = null;
    
    // Call press end callback
    if (wasPressed && this.options.onPressEnd) {
      this.options.onPressEnd({
        originalEvent: event.originalEvent,
        position: event.position,
        startPosition: this.pressStartPosition,
        distance: distance,
        duration: Date.now() - this.pressStartTime,
        button: event.button,
        isTouchEvent: event.isTouchEvent
      });
    }
    
    // Stop propagation if needed
    if (this.options.stopPropagation && event.originalEvent) {
      event.originalEvent.stopPropagation();
    }
  }
  
  /**
   * Handle mouse/touch move during press
   * @param {Object} event Input system event
   */
  handleMouseMove = (event) => {
    if (!this.active || !this.isPressed) return;
    
    // For touch events, check if it's the right touch
    if (event.touchId !== undefined && event.touchId !== this.touchId) {
      return;
    }
    
    // Check if moved too far from press start
    const deltaX = event.position.x - this.pressStartPosition.x;
    const deltaY = event.position.y - this.pressStartPosition.y;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    
    if (distance > this.options.clickMoveThreshold) {
      // If moved too far, cancel long press timer
      this.cancelLongPressTimer();
    }
  }
  
  /**
   * Handle click event
   * @param {Object} event Input system event
   */
  handleClick = (event) => {
    if (!this.active) return;
    
    // Check if clicking is allowed
    if (this.options.canClick && !this.options.canClick(event)) {
      return;
    }
    
    // Check if click is within the element
    if (this.element) {
      const rect = this.element.getBoundingClientRect();
      const localPos = {
        x: event.position.x - rect.left - window.scrollX,
        y: event.position.y - rect.top - window.scrollY
      };
      const isInside = localPos.x >= 0 && localPos.y >= 0 &&
                      localPos.x <= rect.width &&
                      localPos.y <= rect.height;

      if (!isInside) return;
    }

    // Stop propagation if needed
    if (this.options.stopPropagation && event.originalEvent) {
      event.originalEvent.stopPropagation();
    }

    // Check if it's a right click
    if (event.button === 2) {
      if (this.options.onRightClick) {
        this.options.onRightClick({
          originalEvent: event.originalEvent,
          position: event.position,
          isTouchEvent: event.isTouchEvent
        });
      }
      return;
    }
    
    // Check if it's a double click
    const now = Date.now();
    const timeSinceLastClick = now - this.lastClickTime;
    const isDoubleClick = timeSinceLastClick < this.options.doubleClickInterval;
    
    // Update last click time
    this.lastClickTime = now;
    
    // Call appropriate callback
    if (isDoubleClick && this.options.onDoubleClick) {
      this.options.onDoubleClick({
        originalEvent: event.originalEvent,
        position: event.position,
        isTouchEvent: event.isTouchEvent
      });
    } else if (this.options.onClick) {
      this.options.onClick({
        originalEvent: event.originalEvent,
        position: event.position,
        isTouchEvent: event.isTouchEvent
      });
    }
  }
  
  /**
   * Handle long press
   * @param {Object} event Input system event
   */
  handleLongPress = (event) => {
    if (!this.active || !this.isPressed) return;
    
    // Call long press callback
    if (this.options.onLongPress) {
      this.options.onLongPress({
        originalEvent: event.originalEvent,
        position: this.pressStartPosition,
        duration: Date.now() - this.pressStartTime,
        isTouchEvent: event.isTouchEvent
      });
    }
  }
  
  /**
   * Handle right-click context menu
   * @param {Event} event DOM event
   */
  handleContextMenu = (event) => {
    if (this.active && this.options.preventContextMenu) {
      event.preventDefault();
      return false;
    }
  }
  
  /**
   * Cancel the long press timer
   */
  cancelLongPressTimer() {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  }
  
  /**
   * Simulate a click at the current mouse position
   */
  simulateClick() {
    const mousePos = this.inputSystem.getMousePosition();
    this.handleClick({
      position: mousePos,
      button: 0,
      isTouchEvent: false,
      originalEvent: null
    });
  }
  
  /**
   * Clean up resources
   */
  destroy() {
    this.cancelLongPressTimer();
    
    // Remove context menu listener if added
    if (this.options.preventContextMenu && this.element) {
      this.element.removeEventListener('contextmenu', this.handleContextMenu);
    }
    
    super.destroy();
  }
}
