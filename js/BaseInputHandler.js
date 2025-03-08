class BaseInputHandler {
    constructor(options = {}) {
        // Component that owns this input handler
        this.owner = options.owner;
        
        // Element to attach events to
        this.element = options.element || document;

        // Input state
        this.inputState = {
            // Mouse position in page coordinates
            mousePosX: 0,
            mousePosY: 0,
            
            // Scroll tracking
            lastScrollX: window.scrollX,
            lastScrollY: window.scrollY,
            
            // Mouse state
            isMousePressed: false,
            pressStartTime: 0,

            // Activity tracking
            lastMovementTime: Date.now(),
            isActive: true
        };

        // Keyboard shortcut configuration
        this.shortcuts = options.shortcuts || {};

        // Bind methods
        this.boundMethods = {
            keydown: this.handleKeyDown.bind(this),
            click: this.handleClick.bind(this),
            mousedown: this.handleMouseDown.bind(this),
            mouseup: this.handleMouseUp.bind(this),
            mousemove: this.handleMouseMove.bind(this),
            touchstart: this.handleTouchStart.bind(this),
            touchmove: this.handleTouchMove.bind(this),
            touchend: this.handleTouchEnd.bind(this),
            contextmenu: this.handleContextMenu.bind(this),
            scroll: this.handleScroll.bind(this),
            drag: this.handleDrag.bind(this)
        };
    }

    init() {
        this.addEventListeners();
    }

    addEventListeners() {
        // Mouse events
        document.addEventListener('click', this.boundMethods.click);
        document.addEventListener('mousedown', this.boundMethods.mousedown);
        document.addEventListener('mouseup', this.boundMethods.mouseup);
        document.addEventListener('mousemove', this.boundMethods.mousemove);
        document.addEventListener('contextmenu', this.boundMethods.contextmenu);
        document.addEventListener('drag', this.boundMethods.drag);

        // Touch events
        document.addEventListener('touchstart', this.boundMethods.touchstart, { passive: true });
        document.addEventListener('touchmove', this.boundMethods.touchmove, { passive: true });
        document.addEventListener('touchend', this.boundMethods.touchend);

        // Keyboard events
        document.addEventListener('keydown', this.boundMethods.keydown);

        // Scroll events
        window.addEventListener('scroll', this.boundMethods.scroll);
    }

    handleKeyDown(event) {
        if (event.target.tagName === 'INPUT' || 
            event.target.tagName === 'TEXTAREA' || 
            event.target.isContentEditable) {
            return;
        }

        const key = event.key.toLowerCase();
        if (this.shortcuts[key]) {
            event.preventDefault();
            this.shortcuts[key](event);
        }
    }

    handleClick(event) {
        this.setLastActive();
    }

    handleMouseDown(event) {
        this.inputState.isMousePressed = true;
        this.inputState.pressStartTime = Date.now();
        this.updateMousePosition(event);
        this.setLastActive();
    }

    handleMouseUp(event) {
        if (this.getPressDuration() > 0) {
            this.inputState.isMousePressed = false;
            this.inputState.pressStartTime = 0;
        }
        this.updateMousePosition(event);
        this.setLastActive();
    }

    handleMouseMove(event) {
        this.updateMousePosition(event);
        this.setLastActive();
    }

    handleDrag(event) {
        this.updateMousePosition(event);
        this.setLastActive();
    }

    handleTouchStart(event) {
        const touch = event.touches[0];
        this.updateMousePosition(touch);
        this.setLastActive();
    }

    handleTouchMove(event) {
        const touch = event.touches[0];
        this.updateMousePosition(touch);
        this.setLastActive();
    }

    handleTouchEnd(event) {
        this.setLastActive();
    }

    handleContextMenu(event) {
        // event.preventDefault();
        //return false;
    }

    handleScroll(event) {
        // Update mouse position based on scroll
        this.inputState.mousePosX += window.scrollX - this.inputState.lastScrollX;
        this.inputState.mousePosY += window.scrollY - this.inputState.lastScrollY;
        
        // Update last scroll position
        this.inputState.lastScrollX = window.scrollX;
        this.inputState.lastScrollY = window.scrollY;
        
        this.setLastActive();
    }

    updateMousePosition(event) {
        const clientX = event.touches ? event.touches[0].clientX : event.clientX;
        const clientY = event.touches ? event.touches[0].clientY : event.clientY;

        this.inputState.mousePosX = clientX + document.body.scrollLeft;
        this.inputState.mousePosY = clientY + document.body.scrollTop;
    }

    getPressDuration() {
        if (this.inputState.isMousePressed) {
            return Date.now() - this.inputState.pressStartTime;
        }
        return 0;
    }

    setLastActive() {
        this.inputState.lastMovementTime = Date.now();
        this.inputState.isActive = true;
    }

    checkInactive(inactiveTimeout) {
        const currentTime = Date.now();
        if (currentTime - this.inputState.lastMovementTime >= inactiveTimeout) {
            if (this.inputState.isActive) {
                this.inputState.isActive = false;
                return true;
            }
        } else if (!this.inputState.isActive) {
            this.inputState.isActive = true;
            return true;
        }
        return false;
    }

    dispose() {
        Object.entries(this.boundMethods).forEach(([event, handler]) => {
            if (event === 'scroll') {
                window.removeEventListener(event, handler);
            } else {
                document.removeEventListener(event, handler);
            }
        });
    }

    // Public getters for input state
    getMousePosition() {
        return {
            x: this.inputState.mousePosX,
            y: this.inputState.mousePosY
        };
    }

    isPressed() {
        return this.inputState.isMousePressed;
    }

    isUserActive() {
        return this.inputState.isActive;
    }
}