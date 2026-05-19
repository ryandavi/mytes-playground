class DragHandler {
    constructor(options = {}) {
        // Element to attach drag handlers to
        this.element = options.element;
        
        // Parent component/manager that owns this handler
        this.parent = options.parent;
        
        // Drag validation callback
        this.canDrag = options.canDrag || (() => true);
        
        // Drag update callback
        this.onDragUpdate = options.onDragUpdate || (() => {});
        
        // Drag start callback
        this.onDragStart = options.onDragStart || (() => {});
        
        // Drag end callback
        this.onDragEnd = options.onDragEnd || (() => {});

        // State tracking
        this.isDragging = false;
        this.initialTouchPos = { x: 0, y: 0 };
        this.lastTouchPos = { x: 0, y: 0 };
        this.dragVelocity = { x: 0, y: 0 };
        this.dragStartTime = 0;
        
        // Configuration
        this.config = {
            dragThreshold: options.dragThreshold || 10, // Minimum pixels moved to start drag
            inertiaDeceleration: options.inertiaDeceleration || 0.95, // Deceleration factor for inertia
            maxInertiaSpeed: options.maxInertiaSpeed || 20, // Maximum inertia speed
            touchTimeout: options.touchTimeout || 300, // ms to distinguish tap from drag
            preventScrollThreshold: options.preventScrollThreshold || 10 // Pixels moved before preventing scroll
        };

        // Touch tracking
        this.touchId = null;
        this.preventScroll = false;
        this.moveThreshold = false;
        
        // Performance optimization
        this.rafId = null;
        this.boundHandleStart = this.handleStart.bind(this);
        this.boundHandleMove = this.handleMove.bind(this);
        this.boundHandleEnd = this.handleEnd.bind(this);

        this.initializeEventListeners();
    }

    initializeEventListeners() {
        if (!this.element) return;

        // Mouse events
        this.element.addEventListener('mousedown', this.boundHandleStart, { passive: false });

        // Touch events
        this.element.addEventListener('touchstart', this.boundHandleStart, { passive: false });
        
        // Add touch-action CSS for better mobile scrolling
        this.element.style.touchAction = 'none';
    }

    handleStart = (event) => {
        // Check if dragging is allowed
        if (!this.canDrag()) return;

        event.preventDefault();

        const pos = this.getEventPosition(event);
        if (!pos) return;

        // Store initial touch/click position
        this.initialTouchPos = { ...pos };
        this.lastTouchPos = { ...pos };
        this.dragStartTime = Date.now();
        this.moveThreshold = false;
        this.preventScroll = false;

        // Store touch identifier for multi-touch support
        if (event.type === 'touchstart') {
            this.touchId = event.touches[0].identifier;
        }

        // Add drag listeners
        window.addEventListener('mousemove', this.boundHandleMove);
        window.addEventListener('touchmove', this.boundHandleMove, { passive: false });
        window.addEventListener('mouseup', this.boundHandleEnd);
        window.addEventListener('touchend', this.boundHandleEnd);
        window.addEventListener('touchcancel', this.boundHandleEnd);

        // Initialize drag state
        this.initializeDrag();
    }

    initializeDrag() {
        this.isDragging = true;
        this.onDragStart();
    }

    getEventPosition(event) {
        if (event.touches) {
            const touch = event.type === 'touchend'
                ? event.changedTouches[0]
                : event.touches[0];
            return { x: touch.clientX, y: touch.clientY };
        }
        return { x: event.clientX, y: event.clientY };
    }

    updateDragPosition = () => {
        this.rafId = null;
        
        // Calculate new position
        const position = {
            x: this.lastTouchPos.x + window.scrollX,
            y: this.lastTouchPos.y + window.scrollY,
            velocity: this.dragVelocity
        };

        // Call the update callback
        this.onDragUpdate(position);
    }

    handleMove = (event) => {
        if (!this.isDragging) return;

        const pos = this.getEventPosition(event);
        if (!pos || (event.type === 'touchmove' && !this.isCorrectTouch(event))) return;

        // Check if we should prevent scrolling
        if (!this.moveThreshold) {
            const deltaX = Math.abs(pos.x - this.initialTouchPos.x);
            const deltaY = Math.abs(pos.y - this.initialTouchPos.y);
            
            if (deltaX > this.config.preventScrollThreshold || 
                deltaY > this.config.preventScrollThreshold) {
                this.moveThreshold = true;
                this.preventScroll = deltaX > deltaY;
            }
        }

        // Only prevent default for touch events
        if (this.preventScroll && event.type === 'touchmove') {
            event.preventDefault();
        }

        // Calculate velocity
        const now = Date.now();
        const dt = now - this.dragStartTime;
        this.dragVelocity = {
            x: (pos.x - this.lastTouchPos.x) / dt,
            y: (pos.y - this.lastTouchPos.y) / dt
        };

        // Update positions
        this.lastTouchPos = pos;
        this.dragStartTime = now;

        // Use RequestAnimationFrame for smooth updates
        if (!this.rafId) {
            this.rafId = requestAnimationFrame(this.updateDragPosition);
        }
    }

    handleEnd = (event) => {
        if (!this.isDragging) return;
        if (event.type === 'touchend' && !this.isCorrectTouch(event)) return;
        
        this.finalizeDrag();
        this.cleanup();
    }

    isCorrectTouch(event) {
        const touches = event.type === 'touchend' ? event.changedTouches : event.touches;
        for (let i = 0; i < touches.length; i++) {
            if (touches[i].identifier === this.touchId) return true;
        }
        return false;
    }

    finalizeDrag() {
        this.isDragging = false;
        this.onDragEnd();
    }

    cleanup() {
        // Remove event listeners
        window.removeEventListener('mousemove', this.boundHandleMove);
        window.removeEventListener('touchmove', this.boundHandleMove);
        window.removeEventListener('mouseup', this.boundHandleEnd);
        window.removeEventListener('touchend', this.boundHandleEnd);
        window.removeEventListener('touchcancel', this.boundHandleEnd);

        // Cancel any pending animation frame
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }

        // Reset state
        this.isDragging = false;
        this.touchId = null;
        this.preventScroll = false;
        this.moveThreshold = false;
    }

    dispose() {
        this.cleanup();
        if (this.element) {
            this.element.removeEventListener('mousedown', this.boundHandleStart);
            this.element.removeEventListener('touchstart', this.boundHandleStart);
            this.element.style.touchAction = '';
        }
    }
}
