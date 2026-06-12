
/**
 * Component to handle rubbing/petting gestures
 */
class RubbingComponent extends InputComponent {
  /**
   * Get default options for this component
   * @returns {Object} Default options
   */
  getDefaultOptions() {
    const rubbing = SiteConfig.interaction.rubbing;
    return {
      ...super.getDefaultOptions(),
      minRubs: rubbing.minRubs,                       // Minimum rubs needed for a valid interaction
      maxRubs: rubbing.maxRubsObject,                 // Maximum effective rubs
      rubbingThreshold: rubbing.rubbingThreshold,     // Minimum velocity for a valid rub
      minTimeBetweenRubs: rubbing.minTimeBetweenRubs, // Cooldown between rub sessions (ms)
      directionThreshold: rubbing.directionThreshold, // Pixels needed to determine direction
      hapticEnabled: true,       // Whether to use haptic feedback
      hapticDuration: rubbing.hapticDuration,         // Duration of haptic feedback (ms)

      // Callbacks
      onRubProgress: null,       // Called during rubbing with progress
      onRubComplete: null,       // Called when rubbing sequence completes
      onRubOverdone: null,       // Called when rubbing too much
      onRubStart: null,          // Called when rubbing starts
      canRub: null               // Function to check if rubbing is allowed
    };
  }
  
  /**
   * Initialize the component
   */
  initialize() {
    super.initialize();
    
    // Rubbing state
    this.isRubbing = false;
    this.lastRubTime = 0;
    this.rubCounter = 0;
    this.totalRubDistance = 0;
    this.lastPosition = { x: 0, y: 0 };
    this.lastTimestamp = 0;
    this.lastRubDirection = null;
    this.consecutiveSameDirection = 0;
    this.touchId = null;
    
    // Add touch-action CSS style
    if (this.element) {
      this.originalTouchAction = this.element.style.touchAction;
    }
  }
  
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
   * Handle start of interaction
   * @param {Object} event Input system event
   */
  handleStart = (event) => {
    if (!this.active) return;
    
    // Check if rubbing is allowed
    if (this.options.canRub && !this.options.canRub(event)) {
      return;
    }
    
    // Don't start if we're in cooldown
    if (!this.canRub()) {
      return;
    }
    
    // For touch events, store the touch ID
    if (event.touchId !== undefined) {
      this.touchId = event.touchId;
    } else {
      this.touchId = null;
    }
    
    // Make sure the interaction is within our element
    if (this.element) {
      const rect = this.element.getBoundingClientRect();
      const localPos = {
        x: event.position.x - rect.left - window.scrollX,
        y: event.position.y - rect.top - window.scrollY
      };
      const isInside = localPos.x >= 0 && localPos.y >= 0 &&
                      localPos.x < rect.width &&
                      localPos.y < rect.height;

      if (!isInside) return;
      
      // Set touch-action to none for smoother rubbing on touch devices
      this.element.style.touchAction = 'none';
    }
    
    // Initialize rubbing state
    this.isRubbing = true;
    this.lastPosition = { ...event.position };
    this.lastTimestamp = Date.now();
    this.totalRubDistance = 0;
    this.rubCounter = 0;
    this.lastRubDirection = null;
    this.consecutiveSameDirection = 0;
    
    // Call start callback
    if (this.options.onRubStart) {
      this.options.onRubStart({
        position: event.position,
        isTouchEvent: event.isTouchEvent
      });
    }
  }
  
  /**
   * Handle movement during rubbing
   * @param {Object} event Input system event
   */
  handleMove = (event) => {
    if (!this.active || !this.isRubbing) return;
    
    // For touch events, check if it's the right touch
    if (event.touchId !== undefined && event.touchId !== this.touchId) {
      return;
    }
    
    // Calculate movement
    const deltaX = event.position.x - this.lastPosition.x;
    const deltaY = event.position.y - this.lastPosition.y;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    const deltaTime = Date.now() - this.lastTimestamp;
    const velocity = deltaTime > 0 ? distance / deltaTime : 0;
    
    // Determine rub direction
    if (distance > this.options.directionThreshold) {
      const direction = Math.abs(deltaX) > Math.abs(deltaY)
        ? (deltaX > 0 ? 'right' : 'left')
        : (deltaY > 0 ? 'down' : 'up');
      
      if (direction === this.lastRubDirection) {
        this.consecutiveSameDirection++;
      } else {
        this.lastRubDirection = direction;
        this.consecutiveSameDirection = 1;
      }
    }
    
    // Check if this is a valid rubbing motion
    if (velocity > this.options.rubbingThreshold) {
      this.totalRubDistance += distance;
      
      // Count as a rub if we've moved enough in the same direction
      if (this.consecutiveSameDirection >= 2) {
        this.rubCounter++;
        this.consecutiveSameDirection = 0;
        
        // Provide haptic feedback
        if (this.options.hapticEnabled) {
          this.provideHapticFeedback();
        }
        
        // Call progress callback
        if (this.options.onRubProgress) {
          this.options.onRubProgress({
            count: this.rubCounter,
            distance: this.totalRubDistance,
            isOverdone: this.rubCounter > this.options.maxRubs,
            direction: this.lastRubDirection
          });
        }
      }
    }
    
    // Update state
    this.lastPosition = { ...event.position };
    this.lastTimestamp = Date.now();
  }
  
  /**
   * Handle end of rubbing
   * @param {Object} event Input system event
   */
  handleEnd = (event) => {
    if (!this.active || !this.isRubbing) return;
    
    // For touch events, check if it's the right touch
    if (event.touchId !== undefined && event.touchId !== this.touchId) {
      return;
    }
    
    // Reset element style
    if (this.element) {
      this.element.style.touchAction = this.originalTouchAction || '';
    }
    
    // If we had valid rubs, start the cooldown
    if (this.rubCounter >= this.options.minRubs) {
      this.lastRubTime = Date.now();
      
      if (this.rubCounter <= this.options.maxRubs) {
        // Good number of rubs
        if (this.options.onRubComplete) {
          this.options.onRubComplete({
            count: this.rubCounter,
            distance: this.totalRubDistance,
            direction: this.lastRubDirection
          });
        }
      } else {
        // Too much rubbing
        if (this.options.onRubOverdone) {
          this.options.onRubOverdone({
            count: this.rubCounter,
            distance: this.totalRubDistance,
            direction: this.lastRubDirection
          });
        }
      }
    }
    
    // Reset state
    this.isRubbing = false;
    this.touchId = null;
  }
  
  /**
   * Provide haptic feedback
   */
  provideHapticFeedback() {
    if ('vibrate' in navigator) {
      navigator.vibrate(this.options.hapticDuration);
    }
  }
  
  /**
   * Check if rubbing is allowed based on cooldown
   * @returns {boolean}
   */
  canRub() {
    return Date.now() - this.lastRubTime >= this.options.minTimeBetweenRubs;
  }
  
  /**
   * Get time remaining until rubbing is allowed again
   * @returns {number} Time in milliseconds
   */
  getCooldownTimeRemaining() {
    const elapsed = Date.now() - this.lastRubTime;
    const remaining = this.options.minTimeBetweenRubs - elapsed;
    return Math.max(0, remaining);
  }
  
  /**
   * Clean up resources
   */
  destroy() {
    // Reset element style if needed
    if (this.element) {
      this.element.style.touchAction = this.originalTouchAction || '';
    }
    
    super.destroy();
  }
}
