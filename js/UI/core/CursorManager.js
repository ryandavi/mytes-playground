class CursorManager extends UIComponent {

    constructor(parent, options = {}) {
        super(parent);

        // Default configuration
        this.config = {
            enabled: false,
            elementId: 'customCursor',
            basePath: 'assets/cursors/',
            useCSS: true,
            hideNativeCursor: true,
            clickAnimationDuration: 200,
            throttleDelay: 10,  // ms to throttle mousemove events
            accessibility: {
                respectReducedMotion: true,
                showNativeCursorForScreenReaders: true
            },
            ...options
        };

        // Cursor element
        this.cursorElement = document.getElementById(this.config.elementId);

        if (!this.cursorElement) {
            console.error(`Cursor element with ID "${this.config.elementId}" not found.`);
            this.config.enabled = false;
            return;
        }

        // Cache for performance
        this.position = { x: 0, y: 0 };
        this.isVisible = true;
        this.lastUpdateTime = 0;

        // Available cursor types with sprite data and metadata
        this.cursorTypes = {
            POINTER: {
                file: 'pointer.png',
                cssClass: 'cursor-pointer',
                sprites: [[0, 0]],
                offset: { x: 0, y: 0 }  // Custom offsets for better positioning
            },
            GRAB: {
                file: 'grab.png',
                cssClass: 'cursor-grab',
                sprites: [[0, 0]],
                offset: { x: 0, y: 0 }
            },
            GRABBING: {
                file: 'grabbing.png',
                cssClass: 'cursor-grabbing',
                sprites: [[288, 32]],
                offset: { x: -10, y: -10 }  // Adjust offset for grabbing position
            },
            ARROW_UP: {
                file: 'arrow_up.png',
                cssClass: 'cursor-arrow-up',
                sprites: [[0, 0]],
                offset: { x: 0, y: 0 }
            },
            ARROW_DOWN: {
                file: 'arrow_down.png',
                cssClass: 'cursor-arrow-down',
                sprites: [[0, 0]],
                offset: { x: 0, y: 0 }
            },
            ARROW_LEFT: {
                file: 'arrow_left.png',
                cssClass: 'cursor-arrow-left',
                sprites: [[0, 0]],
                offset: { x: 0, y: 0 }
            },
            ARROW_RIGHT: {
                file: 'arrow_right.png',
                cssClass: 'cursor-arrow-right',
                sprites: [[0, 0]],
                offset: { x: 0, y: 0 }
            },
            MOVE: {
                file: 'move.png',
                cssClass: 'cursor-move',
                sprites: [[0, 0]],
                offset: { x: 0, y: 0 }
            },
            NO: {
                file: 'no.png',
                cssClass: 'cursor-no',
                sprites: [[0, 0]],
                offset: { x: 0, y: 0 }
            }
        };

        // Cursor animations
        this.animations = {
            GRAB_TO_GRABBING: {
                frames: [
                    [160, 32],
                    [192, 32],
                    [224, 32],
                    [256, 32],
                    [288, 32]
                ],
                nextState: 'GRABBING',
                duration: 150,  // ms for animation
                cssClass: 'cursor-grab-to-grabbing'
            },
            GRABBING_TO_GRAB: {
                frames: [
                    [288, 32],
                    [256, 32],
                    [224, 32],
                    [192, 32],
                    [160, 32]
                ],
                nextState: 'GRAB',
                duration: 150,
                cssClass: 'cursor-grabbing-to-grab'
            }
        };

        this.currentState = null;
        this.currentAnimation = null;
        this.animationTimer = null;
        this.listenersAttached = false;
        this.boundHandlers = null;
        this.isSetup = false;

        // Initialize
        this.init();
    }

    init() {
        if (!this.config.enabled) return;

        // Apply base styling
        this.setupCursorElement();

        // Set initial cursor type (default)
        this.setCursor(CURSOR.POINTER);

        // Set up event listeners
        this.setupEventListeners();

        // Check for reduced motion preference if configured
        if (this.config.accessibility.respectReducedMotion) {
            this.checkReducedMotion();
        }
    }

    setupCursorElement() {
        if (this.isSetup) return;

        // Structural styles are in CSS (.custom-cursor); only JS-specific setup here.
        this.cursorElement.classList.add('custom-cursor');

        if (this.config.hideNativeCursor) {
            document.body.style.cursor = 'none';
        }

        this.isSetup = true;
    }

    setupEventListeners() {
        if (this.listenersAttached) return;

        const input = InputSystem.getInstance();
        const throttledMove = Utility.throttle((data) => {
            if (!this.config.enabled) return;
            this.position.x = data.position.clientX;
            this.position.y = data.position.clientY;
            this.updateCursorPosition();
            if (!this.isVisible) this.showCursor();
        }, this.config.throttleDelay);

        this._inputUnsubs = [
            input.on('mouse.move', throttledMove),
            input.on('mouse.down', () => this.handleMouseDown()),
            input.on('mouse.up',   () => this.handleMouseUp()),
        ];

        // mouseleave/mouseenter/focusin are not in InputSystem — keep as direct DOM listeners
        this.boundHandlers = {
            mouseLeave: this.hideCursor.bind(this),
            mouseEnter: this.showCursor.bind(this),
            focusIn: (event) => {
                if (this.config.accessibility.showNativeCursorForScreenReaders &&
                    event.target.tabIndex >= 0) {
                    event.target.style.cursor = 'auto';
                }
            }
        };
        document.addEventListener('mouseleave', this.boundHandlers.mouseLeave);
        document.addEventListener('mouseenter', this.boundHandlers.mouseEnter);
        document.addEventListener('focusin',    this.boundHandlers.focusIn);
        this.listenersAttached = true;
    }

    handleMouseDown() {
        if (!this.config.enabled) return;

        this.cursorElement.classList.add('clicking');

        // If we're in GRAB state, transition to GRABBING
        if (this.currentState === CURSOR.GRAB) {
            this.playAnimation('GRAB_TO_GRABBING');
        }
    }

    handleMouseUp() {
        if (!this.config.enabled) return;

        this.cursorElement.classList.remove('clicking');

        // If we're in GRABBING state, transition back to GRAB
        if (this.currentState === CURSOR.GRABBING) {
            this.playAnimation('GRABBING_TO_GRAB');
        }
    }

    updateCursorPosition() {
        if (!this.cursorElement) return;

        // Get current cursor type for potential offsets
        const cursorType = this.cursorTypes[this.currentState];
        const offsetX = cursorType?.offset?.x || 0;
        const offsetY = cursorType?.offset?.y || 0;

        // Use transform instead of left/top for better performance
        this.cursorElement.style.transform = `translate3d(${this.position.x + offsetX}px, ${this.position.y + offsetY}px, 0)`;
    }

    setCursor(cursorType) {
        if (!this.config.enabled || !this.cursorElement) return;

        // Stop any current animation
        this.stopAnimation();

        this.currentState = cursorType;
        const cursor = this.cursorTypes[cursorType];

        if (!cursor) {
            console.error(`Invalid cursor type: ${cursorType}`);
            return;
        }

        // Remove all cursor classes
        Object.values(this.cursorTypes).forEach(type => {
            if (type.cssClass) {
                this.cursorElement.classList.remove(type.cssClass);
            }
        });

        // Apply new cursor class if using CSS
        if (this.config.useCSS && cursor.cssClass) {
            this.cursorElement.classList.add(cursor.cssClass);
        } else {
            // Use image otherwise
            const filePath = `${this.config.basePath}${cursor.file}`;
            this.cursorElement.style.backgroundImage = `url('${filePath}')`;
        }

        // Update position to apply any new offsets
        this.updateCursorPosition();
    }

    playAnimation(animationName) {
        if (!this.config.enabled) return;

        const animation = this.animations[animationName];
        if (!animation) {
            console.error(`Animation not found: ${animationName}`);
            return;
        }

        // Clear any existing animation
        this.stopAnimation();

        // Set current animation
        this.currentAnimation = animationName;

        if (this.config.useCSS && animation.cssClass) {
            // Use CSS animation
            this.cursorElement.classList.add(animation.cssClass);

            // Set timer to handle state after animation
            this.animationTimer = setTimeout(() => {
                this.cursorElement.classList.remove(animation.cssClass);
                if (animation.nextState) {
                    this.setCursor(CURSOR[animation.nextState]);
                }
                this.currentAnimation = null;
            }, animation.duration);
        } else {
            // Use JavaScript animation (frame-by-frame)
            let frameIndex = 0;
            const frameTime = animation.duration / animation.frames.length;

            const advanceFrame = () => {
                if (frameIndex >= animation.frames.length) {
                    // Animation complete
                    if (animation.nextState) {
                        this.setCursor(CURSOR[animation.nextState]);
                    }
                    this.currentAnimation = null;
                    return;
                }

                const frame = animation.frames[frameIndex];
                this.cursorElement.style.backgroundPosition = `-${frame[0]}px -${frame[1]}px`;

                frameIndex++;
                this.animationTimer = setTimeout(advanceFrame, frameTime);
            };

            // Start animation
            advanceFrame();
        }
    }

    stopAnimation() {
        if (this.animationTimer) {
            clearTimeout(this.animationTimer);
            this.animationTimer = null;
        }

        if (this.currentAnimation) {
            const animation = this.animations[this.currentAnimation];
            if (animation && animation.cssClass) {
                this.cursorElement.classList.remove(animation.cssClass);
            }
            this.currentAnimation = null;
        }
    }

    hideCursor() {
        if (!this.config.enabled) return;
        this.isVisible = false;
        this.cursorElement.classList.add('is-hidden');
    }

    showCursor() {
        if (!this.config.enabled) return;
        this.isVisible = true;
        this.cursorElement.classList.remove('is-hidden');
    }

    enable() {
        if (this.config.enabled) return;

        this.config.enabled = true;
        this.setupCursorElement();
        if (!this.listenersAttached) {
            this.setupEventListeners();
        }

        if (this.config.hideNativeCursor) {
            document.body.style.cursor = 'none';
        }

        this.showCursor();
        this.setCursor(this.currentState || CURSOR.POINTER);
    }

    disable() {
        if (!this.config.enabled) return;

        this.config.enabled = false;
        this.hideCursor();

        // Restore native cursor
        document.body.style.cursor = '';
    }

    toggle() {
        if (this.config.enabled) {
            this.disable();
        } else {
            this.enable();
        }
        return this.config.enabled;
    }

    checkReducedMotion() {
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        if (prefersReducedMotion) {
            // Disable animations for users who prefer reduced motion
            Object.keys(this.animations).forEach(animKey => {
                this.animations[animKey].duration = 0;
            });
        }
    }

    update() {
        if (!this.config.enabled) return;

        const isClicking = this.parent.isClicking;
        const hasClickingClass = this.cursorElement.classList.contains('clicking');

        // Update clicking state if needed
        if (isClicking && !hasClickingClass) {
            this.handleMouseDown();
        } else if (!isClicking && hasClickingClass) {
            this.handleMouseUp();
        }
    }

    dispose() {
        this._inputUnsubs?.forEach(s => s.unsubscribe());
        this._inputUnsubs = null;

        if (this.boundHandlers) {
            document.removeEventListener('mouseleave', this.boundHandlers.mouseLeave);
            document.removeEventListener('mouseenter', this.boundHandlers.mouseEnter);
            document.removeEventListener('focusin',    this.boundHandlers.focusIn);
            this.boundHandlers = null;
        }
        this.listenersAttached = false;
        this.stopAnimation();
        document.body.style.cursor = '';
        this.isSetup = false;
    }
}
