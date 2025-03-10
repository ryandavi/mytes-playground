/**
 * Input manager for the container, handling global inputs and delegating to specific objects
 */
class ContainerInputManager {
    /**
     * Create a new ContainerInputManager
     * @param {ContainerManager} containerManager The parent container manager
     */
    constructor(containerManager) {
      this.container = containerManager;
      this.inputSystem = InputSystem.getInstance();
      
      // Set up keyboard shortcuts
      this.setupKeyboardShortcuts();
      
      // Set up click handling
      this.setupClickHandling();
      
      // Setup scroll handling
      this.setupScrollHandling();
      
      // Track inactivity
      this.inactivityTimeout = 60000; // 1 minute
      this.inactivityCheckInterval = setInterval(() => {
        this.checkInactivity();
      }, 10000); // Check every 10 seconds
    }

    checkInactive(){
        return false;
    }
    
    /**
     * Set up keyboard shortcuts
     */
    setupKeyboardShortcuts() {
      // Tool shortcuts
      Object.entries(this.container.ui.toolConfig).forEach(([mode, config]) => {
        if (config.shortcut) {
          this.inputSystem.on('keyboard.down', (event) => {
            if (event.key === config.shortcut.toLowerCase()) {
              this.container.ui.changeToolMode(mode);
            }
          });
        }
      });
      
      // Sound toggle
      this.inputSystem.on('keyboard.down', (event) => {
        if (event.key === 'm') {
          this.container.ui.sound.toggleSounds();
        }
      });
      
      // Escape key
      this.inputSystem.on('keyboard.down', (event) => {
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
            this.container.ui.setSelected(element);
          }
        }
      });
    }
    
    /**
     * Set up scroll handling
     */
    setupScrollHandling() {
      this.inputSystem.on('scroll', (event) => {
        // Update camera if needed
        if (this.container.camera) {
          this.container.camera.handleScroll(event);
        }
      });
    }
    
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
    
    /**
     * Get mouse position in local container coordinates
     * @param {Object} element Optional element for offset
     * @returns {Object} Local coordinates {x, y}
     */
    getLocalMouse(element = null) {
      const mousePos = this.inputSystem.getMousePosition();
      const containerRect = this.container.getContainerRect();
      const cameraOffset = this.container.camera ? {
        x: this.container.camera.posX,
        y: this.container.camera.posY
      } : { x: 0, y: 0 };
      
      return {
        x: mousePos.x - containerRect.left - 
           (element ? (element.getRect().width / 2) : 0) - 
           cameraOffset.x,
        y: mousePos.y - containerRect.top - 
           (element ? (element.getRect().height / 2) : 0) - 
           cameraOffset.y
      };
    }
    
    /**
     * Check if mouse is within container
     * @returns {boolean}
     */
    isMouseInContainer() {
      const mousePos = this.inputSystem.getMousePosition();
      const containerRect = this.container.getContainerRect();
      
      return (
        mousePos.x >= containerRect.left &&
        mousePos.x <= containerRect.right &&
        mousePos.y >= containerRect.top &&
        mousePos.y <= containerRect.bottom
      );
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
 * These methods should be added to the ContainerInputManager class
 */

/**
 * Get mouse position relative to the container, ignoring camera offset
 * @param {Object} element Optional element for offset
 * @returns {Object} Container-relative coordinates {x, y}
 */
getContainerMouse(element = null) {
    const mousePos = this.inputSystem.getMousePosition();
    const containerRect = this.container.getContainerRect();
    
    return {
      x: mousePos.x - containerRect.left - 
         (element ? (element.getRect().width / 2) : 0),
      y: mousePos.y - containerRect.top - 
         (element ? (element.getRect().height / 2) : 0)
    };
  }
  
  /**
   * Get mouse position in global/page coordinates
   * @returns {Object} Mouse position {x, y}
   */
  getGlobalMouse() {
    return this.inputSystem.getMousePosition();
  }
  
  /**
   * Get offset position relative to a specific element
   * @param {HTMLElement} element Element to get offset against
   * @returns {Object} Element-relative coordinates {x, y}
   */
  getElementMouse(element) {
    const mousePos = this.inputSystem.getMousePosition();
    const rect = element.getBoundingClientRect();
    
    return {
      x: mousePos.x - rect.left - window.scrollX,
      y: mousePos.y - rect.top - window.scrollY
    };
  }
  
  /**
   * Get mouse position in local coordinates with camera offset
   * Similar to getLocalMouse but with customizable offset behavior
   * @param {Object} options Configuration options
   * @returns {Object} Adjusted coordinates {x, y}
   */
  getAdjustedMouse(options = {}) {
    const mousePos = this.inputSystem.getMousePosition();
    const containerRect = this.container.getContainerRect();
    
    // Default options
    const opts = {
      includeCamera: true,
      elementOffset: null,
      additionalOffset: { x: 0, y: 0 },
      ...options
    };
    
    // Calculate camera offset
    const cameraOffset = (opts.includeCamera && this.container.camera) ? {
      x: this.container.camera.posX,
      y: this.container.camera.posY
    } : { x: 0, y: 0 };
    
    // Calculate element offset
    const elementOffset = opts.elementOffset ? {
      x: opts.elementOffset.getRect().width / 2,
      y: opts.elementOffset.getRect().height / 2
    } : { x: 0, y: 0 };
    
    return {
      x: mousePos.x - containerRect.left - elementOffset.x - 
         cameraOffset.x - opts.additionalOffset.x,
      y: mousePos.y - containerRect.top - elementOffset.y - 
         cameraOffset.y - opts.additionalOffset.y
    };
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
    const mousePos = this.inputSystem.getMousePosition();
    return this.isPointInElement(mousePos.x, mousePos.y, element);
  }
  
  /**
   * Get the current press state
   * @returns {boolean} Whether mouse/touch is currently pressed
   */
  isPressed() {
    return this.inputSystem.isMouseButtonPressed();
  }


    /**
     * Check for user inactivity
     */
    checkInactivity() {
      const wasActive = this.inputSystem.isUserActive();
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
    
    /**
     * Clean up resources
     */
    destroy() {
      if (this.inactivityCheckInterval) {
        clearInterval(this.inactivityCheckInterval);
        this.inactivityCheckInterval = null;
      }
    }
  }
