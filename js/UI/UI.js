// Constants and enums
const UIToolModes = {
    SELECT: 'select',
    DRAG: 'drag',
    PET: 'pet'
};

class UIComponent {
    constructor(parent) {
        this.parent = parent;
    }

    init() {
        // Base initialization
    }

    update() {
        // Base update method
    }
}

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

        // Apply base styles
        this.cursorElement.style.position = 'fixed';
        this.cursorElement.style.pointerEvents = 'none';
        this.cursorElement.style.zIndex = '9999';
        this.cursorElement.style.willChange = 'transform';  // Optimize for animations
        this.cursorElement.style.transformOrigin = 'center center';
        
        // Hide native cursor if configured
        if (this.config.hideNativeCursor) {
            document.body.style.cursor = 'none';
        }
        
        // Add base class
        this.cursorElement.classList.add('custom-cursor');
        this.isSetup = true;
    }
    
    setupEventListeners() {
        if (this.listenersAttached) return;

        const input = InputSystem.getInstance();
        const throttledMove = this.throttle((data) => {
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
        this.cursorElement.style.opacity = '0';
    }
    
    showCursor() {
        if (!this.config.enabled) return;
        this.isVisible = true;
        this.cursorElement.style.opacity = '1';
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
    
    throttle(func, limit) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }
    
    destroy() {
        // Unsubscribe from InputSystem
        this._inputUnsubs?.forEach(s => s.unsubscribe());
        this._inputUnsubs = null;

        // Clean up remaining direct DOM listeners
        if (this.boundHandlers) {
            document.removeEventListener('mouseleave', this.boundHandlers.mouseLeave);
            document.removeEventListener('mouseenter', this.boundHandlers.mouseEnter);
            document.removeEventListener('focusin',    this.boundHandlers.focusIn);
            this.boundHandlers = null;
        }
        this.listenersAttached = false;
        
        // Stop animations
        this.stopAnimation();
        
        // Restore default cursor
        document.body.style.cursor = '';
        this.isSetup = false;
    }
}

class ToolManager extends UIComponent {
    constructor(parent) {
        super(parent);
        this.currentToolMode = UIToolModes.SELECT;
        this.handControls = this.parent.containerWrapper.querySelector('#hand-controls');
        this.listenerCleanup = [];
        
        this.toolConfig = {
            [UIToolModes.SELECT]: {
                id: 'hand-select',
                icon: 'pointer-icon',
                label: 'Select',
                cursor: 'pointer',
                shortcut: 's'
            },
            [UIToolModes.DRAG]: {
                id: 'hand-drag',
                icon: 'move-icon',
                label: 'Drag',
                cursor: 'grab',
                shortcut: 'd'
            },
            [UIToolModes.PET]: {
                id: 'hand-pet',
                icon: 'pet-icon',
                label: 'Pet',
                cursor: 'pointer',
                shortcut: 'p'
            }
        };
    }

    applyToolModeState(mode) {
        document.body.dataset.toolMode = mode;
        this.parent.containerWrapper?.setAttribute('data-tool-mode', mode);
    }

    init() {
        this.initializeHandControls();
    }

    initializeHandControls() {
        if (!this.handControls) {
            console.error('Hand controls element not found');
            return;
        }

        // Add event listeners to all radio inputs in hand-controls
        const radioInputs = this.handControls.querySelectorAll('input[type="radio"]');

        radioInputs.forEach(input => {
            // Existing change event listener
            const handleChange = (event) => {
                const toolId = event.target.id;

                // Map the tool ID to the corresponding mode
                switch (toolId) {
                    case 'hand-select':
                        this.setToolMode(UIToolModes.SELECT);
                        break;
                    case 'hand-drag':
                        this.setToolMode(UIToolModes.DRAG);
                        break;
                    case 'hand-pet':
                        this.setToolMode(UIToolModes.PET);
                        break;
                }
            };
            input.addEventListener('change', handleChange);
            this.listenerCleanup.push(() => input.removeEventListener('change', handleChange));

            // Add context menu (right-click) event listener to the input itself
            const handleInputContextMenu = (event) => {
                event.preventDefault();
                input.checked = true;
                input.dispatchEvent(new Event('change'));
                return false;
            };
            input.addEventListener('contextmenu', handleInputContextMenu);
            this.listenerCleanup.push(() => input.removeEventListener('contextmenu', handleInputContextMenu));

            // Also add to the label if it exists
            const label = this.handControls.querySelector(`label[for="${input.id}"]`);
            if (label) {
                const handleLabelContextMenu = (event) => {
                    event.preventDefault();
                    input.checked = true;
                    input.dispatchEvent(new Event('change'));
                    return false;
                };
                label.addEventListener('contextmenu', handleLabelContextMenu);
                this.listenerCleanup.push(() => label.removeEventListener('contextmenu', handleLabelContextMenu));
            }
        });

        // Set initial mode
        this.setToolMode(UIToolModes.SELECT);
        this.applyToolModeState(this.currentToolMode);
    }

    setToolMode(mode) {
        if (this.currentToolMode === mode) {
            this.applyToolModeState(mode);
            return;
        }

        this.parent.playSound('hover');

        // Set mode
        this.currentToolMode = mode;
        this.applyToolModeState(mode);

        // Notify parent UI of tool change
        this.parent.onToolModeChanged(mode);
    }

    isTool(mode) {
        return this.currentToolMode === mode;
    }

    changeToolMode(mode) {
        const toolConfig = this.toolConfig[mode];

        if (!toolConfig || !toolConfig.id) {
            console.warn(`Invalid tool mode: ${mode}`);
            return false;
        }

        const radioButton = document.getElementById(toolConfig.id);

        if (radioButton) {
            // Check the radio button
            radioButton.checked = true;

            // Dispatch a change event to trigger any listeners
            radioButton.dispatchEvent(new Event('change'));

            // Update current tool mode
            this.currentToolMode = mode;
            this.applyToolModeState(mode);

            return true;
        }

        console.warn(`Could not find radio button for tool: ${toolConfig.id}`);
        return false;
    }

    destroy() {
        this.listenerCleanup.forEach(cleanup => cleanup());
        this.listenerCleanup = [];
    }
}

class SelectionManager extends UIComponent {
    constructor(parent) {
        super(parent);
        this.selectedObject = null;
    }


    setSelected(obj) {
        const deselect = (object) => {
            if (!object) return; // Check if object exists
            
            if (object instanceof Myte) {
                if (object.duplicate) object.duplicate.classList.remove('is-selected');
            } else if (object instanceof MapObject) {
                if (object.element) object.element.classList.remove('is-selected');
            } else if (object) {
                object.classList.remove('is-selected');
            }
        };

        const select = (object) => {
            if (!object) return; // Check if object exists
            
            if (object instanceof Myte) {
                if (object.duplicate) object.duplicate.classList.add('is-selected');
            } else if (object instanceof MapObject) {
                if (object.element) object.element.classList.add('is-selected');
            } else if (object) {
                object.classList.add('is-selected');
            }
        };

        // Deselect current object
        if (this.selectedObject) deselect(this.selectedObject);

        // Toggle selection
        this.selectedObject = this.selectedObject === obj ? null : obj;

        // Select new object
        if (this.selectedObject) select(this.selectedObject);

        // Notify parent UI of selection change
        this.parent.onSelectionChanged(this.selectedObject);
    }

    getSelectedObject() {
        return this.selectedObject;
    }
}

class QueueTargetManager extends UIComponent {
    constructor(parent) {
        super(parent);
        this.currentTarget = null;
    }

    getHighlightElement(target) {
        if (!target) return null;

        if (target instanceof Myte) {
            return target.duplicate || null;
        }

        if (target instanceof MapObject) {
            return target.element || null;
        }

        if (target instanceof Element) {
            return target;
        }

        return null;
    }

    clearTarget(target = this.currentTarget) {
        const element = this.getHighlightElement(target);
        element?.classList?.remove('is-queue-target');
    }

    setTarget(target) {
        if (this.currentTarget === target) {
            return;
        }

        this.clearTarget(this.currentTarget);
        this.currentTarget = target || null;

        const element = this.getHighlightElement(this.currentTarget);
        element?.classList?.add('is-queue-target');
    }

    update() {
        const activeMyte = this.parent.getActiveMyte();
        const currentAction = activeMyte?.queue?.getCurrentAction?.() || null;
        const target = currentAction?.target ||
            (
                activeMyte?.goal === MOVE_TYPES.GOHOME &&
                !activeMyte?.isAtHomePosition?.(1)
                    ? activeMyte.getHomeSlotElement?.() ?? null
                    : null
            );
        const highlightElement = this.getHighlightElement(target);

        if (!highlightElement || target?.active === false) {
            this.setTarget(null);
            return;
        }

        this.setTarget(target);
    }

    dispose() {
        this.clearTarget();
        this.currentTarget = null;
    }
}

class ActionSidebarManager extends UIComponent {
    constructor(parent) {
        super(parent);
        this.actionControls = this.parent.containerWrapper.querySelector('#action-controls');
        this.currentSelectedObject = null;
        this.lastInfoRefreshAt = 0;
        this.infoRefreshInterval = 250;
        this._otherInfoCache = null;
        this._otherInfoRowMap = new Map();
        this._lastAvailableActionsKey = null;
    }

    // Helper method to get category titles
    getCategoryTitle(category) {
        const titles = {
            movement: 'Movement',
            state: 'State',
            interactions: 'Interactions',
            play: 'Play',
            reactive: 'Reactive',
            carrying: 'Active Actions'
        };
        return titles[category] || category;
    }

    getNeedDisplayOrder() {
        return ['rest', 'social', 'enrichment', 'play', 'comfort', 'home'];
    }

    getMeterState(percent) {
        if (percent <= 15) return 'critical';
        if (percent <= 35) return 'low';
        if (percent <= 65) return 'okay';
        if (percent <= 85) return 'good';
        return 'full';
    }

    humanizeLabel(value, { uppercase = false } = {}) {
        const text = String(value || '')
            .replace(/MapObject$/i, '')
            .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
            .split(/[_\s-]+/)
            .filter(Boolean)
            .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
            .join(' ');

        return uppercase ? text.toUpperCase() : text;
    }

    prettifyAiToken(token) {
        return this.humanizeLabel(String(token || '').replace(/[_-]+/g, ' '));
    }

    getAiDecisionDisplay(label) {
        const segments = String(label || '')
            .split(':')
            .filter(Boolean)
            .map(segment => this.prettifyAiToken(segment))
            .filter((segment, index, items) => segment && segment !== items[index - 1]);

        return {
            primary: segments[0] ?? 'Idle',
            details: segments.slice(1)
        };
    }

    getMyteTypeLabel(myte) {
        return this.humanizeLabel(myte?.species || 'Myte', { uppercase: true });
    }

    getMapObjectTypeLabel(mapObject) {
        if (!mapObject) {
            return 'OBJECT';
        }

        const configured = mapObject.getConfig?.('sidebarTypeLabel', null);
        if (configured) {
            return this.humanizeLabel(configured, { uppercase: true });
        }

        const rawType = mapObject.type ||
            mapObject.constructor?.name?.replace(/MapObject$/i, '') ||
            'Object';
        return this.humanizeLabel(rawType, { uppercase: true });
    }

    getSlotMyte(slotElement) {
        return this.parent.parent.mytes?.find?.(myte => myte.dropTarget === slotElement) ?? null;
    }

    getTargetTypeLabel(selectedObject, activeMyte) {
        if (selectedObject instanceof Myte) {
            return this.getMyteTypeLabel(selectedObject);
        }

        if (selectedObject instanceof MapObject) {
            return this.getMapObjectTypeLabel(selectedObject);
        }

        if (selectedObject instanceof DroppedMapItem) {
            const itemDef = ItemRegistry.getItemSync?.(selectedObject.variant);
            return this.humanizeLabel(itemDef?.type || 'Item', { uppercase: true });
        }

        if (selectedObject?.classList?.contains('myte-slot')) {
            return 'SLOT';
        }

        if (selectedObject === activeMyte) {
            return this.getMyteTypeLabel(activeMyte);
        }

        return 'ELEMENT';
    }

    getMyteBehaviorLabel(myte) {
        const goalKey = myte?.getMoveType?.(myte.goal) || '';
        const labels = {
            FOLLOW: 'Following',
            FREEROAM: 'Free Roam',
            GRAVITY: 'Gravity',
            GOHOME: 'Going Home',
            QUEUE_ONLY: 'Queued'
        };

        return labels[goalKey] || this.humanizeLabel(goalKey || 'Unknown');
    }

    getMyteBehaviorDetail(myte) {
        const goalKey = myte?.getMoveType?.(myte.goal) || '';
        if (goalKey === 'FOLLOW') {
            return {
                label: 'Follow Style',
                value: this.humanizeLabel(myte?.getMoveFollowType?.(myte.followGoal) || 'Normal')
            };
        }

        if (goalKey === 'FREEROAM') {
            return {
                label: 'Autonomy',
                value: this.humanizeLabel(myte?.getMoveAutonomyType?.(myte.autonomyGoal) || 'Interact')
            };
        }

        return null;
    }

    getMyteActivityLabel(myte) {
        const currentAction = myte?.queue?.getCurrentAction?.() ?? null;
        if (currentAction) {
            return currentAction.getQueueTitle?.() ||
                currentAction.constructor?.metadata?.label ||
                currentAction.constructor?.name?.replace(/Action$/, '') ||
                'Busy';
        }

        const goalKey = myte?.getMoveType?.(myte.goal) || '';
        if (goalKey === 'GOHOME') {
            return 'Returning Home';
        }

        if (goalKey === 'FOLLOW') {
            return 'Following Cursor';
        }

        return 'Idle';
    }

    getSlotStateLabel(myte) {
        if (!myte) {
            return 'Empty';
        }

        if (!myte.isActive) {
            return 'At Home';
        }

        if (myte.goal === MOVE_TYPES.FREEROAM) {
            return 'Free Roam';
        }

        if (myte.goal === MOVE_TYPES.GOHOME) {
            return 'Returning';
        }

        return 'Deployed';
    }

    getSelectionPositionInfo(selectedObject) {
        if (typeof selectedObject?.posX === 'number' && typeof selectedObject?.posY === 'number') {
            return {
                posX: selectedObject.posX,
                posY: selectedObject.posY
            };
        }

        if (selectedObject?.classList?.contains('myte-slot')) {
            const slotMyte = this.getSlotMyte(selectedObject);
            const home = slotMyte?.getHomePosition?.();
            if (home && Number.isFinite(home.x) && Number.isFinite(home.y)) {
                return {
                    posX: home.x,
                    posY: home.y
                };
            }
        }

        return null;
    }

    getActionLabel(action, selectedObject) {
        if (!action) {
            return '';
        }

        if (selectedObject?.constructor?.name === 'CropPlantMapObject' && action.id === 'harvest') {
            return 'Harvest Crop';
        }

        if (selectedObject instanceof PortalMapObject && action.id === 'interact_object') {
            return 'Use Portal';
        }

        if (selectedObject instanceof DoorMapObject && action.id === 'interact_object') {
            return `${selectedObject.isOpen ? 'Close' : 'Open'} Door`;
        }

        if (selectedObject?.type?.toUpperCase?.() === 'GATE' && action.id === 'interact_object') {
            return `${selectedObject.isOpen ? 'Close' : 'Open'} Gate`;
        }

        if (selectedObject?.getConfig?.('interactionType') === 'light' && action.id === 'interact_object') {
            const objectLabel = selectedObject.getDisplayName?.() || selectedObject.type || 'Light';
            const isEnabled = selectedObject.isEnabled?.();
            return `${isEnabled ? 'Turn Off' : 'Turn On'} ${objectLabel}`;
        }

        return action.label;
    }

    getMajorAction(selectedObject, activeMyte, availableActions = []) {
        if (!selectedObject || !activeMyte || selectedObject === activeMyte) {
            return null;
        }

        if (typeof selectedObject.getMajorAction === 'function') {
            return selectedObject.getMajorAction(activeMyte, availableActions);
        }

        const skip = new Set(['go_to_object', 'follow_object', 'inspect', 'deep_inspect']);
        return availableActions.find(action => !skip.has(action.id)) ?? null;
    }

    getCurrentActionContext(selectedObject, activeMyte) {
        const currentAction = activeMyte?.queue?.getCurrentAction?.() ?? null;
        const currentActionId = currentAction?.constructor?.metadata?.id ?? '';
        const currentTarget = currentAction?.target ?? null;
        return {
            currentAction,
            currentActionId,
            currentTarget,
            isDoingAction: !!activeMyte?.queue?.isDoingAction,
            matchesSelection: !!selectedObject && currentTarget === selectedObject
        };
    }

    createActionButton(action, selectedObject, activeMyte, { prominent = false } = {}) {
        const button = document.createElement('button');
        button.textContent = this.getActionLabel(action, selectedObject);
        const actionContext = this.getCurrentActionContext(selectedObject, activeMyte);
        const titleParts = [];
        if (action.description) {
            titleParts.push(action.description);
        }

        const isCurrentSelectionAction =
            actionContext.isDoingAction &&
            actionContext.matchesSelection &&
            actionContext.currentActionId === action.id;

        if (isCurrentSelectionAction) {
            button.disabled = true;
            button.classList.add('is-in-progress');
            titleParts.push('Action in progress');
        }
        if (titleParts.length) {
            button.title = titleParts.join('\n');
        }
        if (prominent) {
            button.classList.add('primary-action');
        }

        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();

            if (action.id === 'carry_putdown') {
                activeMyte.queue.addPutDownMyte();
                this.updateActions(selectedObject);
                return;
            }

            if (action.id === 'drop_item') {
                activeMyte.queue.addDropHeldItem();
                this.updateActions(selectedObject);
                return;
            }

            const options = ActionManager.getActionOptions(
                action.id,
                selectedObject,
                activeMyte
            );

            if (options) {
                const payload = {
                    ...options,
                    userInitiated: true
                };
                const shouldInterrupt =
                    prominent ||
                    activeMyte?.goal === MOVE_TYPES.FREEROAM ||
                    activeMyte?.queue?.hasUserInitiatedAction?.();

                if (shouldInterrupt) {
                    activeMyte.queue.interrupt(action.id, payload);
                } else {
                    activeMyte.queue.add(action.id, payload);
                }
                this.updateActions(selectedObject);
            }
        });

        return button;
    }

    emptyActionList() {
        const actionGroups = this.actionControls.querySelector('.action-groups');
        actionGroups.innerHTML = '';
        this.actionControls.classList.remove('is-visible');

        // empty other info
        this.actionControls.querySelector('.other-info').innerHTML = '';
        this.actionControls.querySelector('.other-info').classList.remove('is-visible');


    }

    update() {
        const activeMyte = this.parent.getActiveMyte();
        if (!this.currentSelectedObject) {
            return;
        }

        if (this.currentSelectedObject instanceof MapObject &&
            (this.currentSelectedObject.active === false || !this.currentSelectedObject.element)) {
            this.parent.selectionManager.setSelected(null);
            return;
        }

        if (this.currentSelectedObject instanceof DroppedMapItem &&
            (this.currentSelectedObject.collected || !this.currentSelectedObject.active)) {
            this.parent.selectionManager.setSelected(null);
            return;
        }

        const availableKey = this._buildAvailableActionsKey(this.currentSelectedObject, activeMyte);
        if (availableKey !== this._lastAvailableActionsKey) {
            this._lastAvailableActionsKey = availableKey;
            this.updateActionList(this.currentSelectedObject);
        }

        const now = performance.now();
        if (now - this.lastInfoRefreshAt < this.infoRefreshInterval) {
            return;
        }

        this.lastInfoRefreshAt = now;
        this.renderOtherInfo(this.currentSelectedObject);
    }

    _buildAvailableActionsKey(selectedObject, activeMyte) {
        if (!selectedObject) return '';
        if (selectedObject instanceof DroppedMapItem) {
            return `dropped:${selectedObject.variant}|collected=${selectedObject.collected}|busy=${activeMyte?.queue?.count() ?? 0}`;
        }
        const availableActions = ActionManager.getAvailableActions(selectedObject, activeMyte);
        const actionContext = this.getCurrentActionContext(selectedObject, activeMyte);
        const busyCount = activeMyte?.queue?.count() ?? 0;
        const subjectId = selectedObject?.id ?? selectedObject?.constructor?.name ?? 'selected';
        const targetId = actionContext.currentTarget?.id ?? actionContext.currentTarget?.constructor?.name ?? '';
        return `${subjectId}|busy=${busyCount}|current=${actionContext.currentActionId}|target=${targetId}|phase=${actionContext.currentAction?.phase ?? ''}|actions=${availableActions.map(a => a.id).join(',')}`;
    }

    appendInfoRow(container, label, value, className = 'state-info') {
        const info = document.createElement('div');
        info.classList.add(className);
        info.innerHTML = `${label}: ${value}`;
        container.append(info);
        return info;
    }

    getNeedFulfillmentLabel(percent) {
        if (percent <= 15) return 'Critical';
        if (percent <= 35) return 'Low';
        if (percent <= 65) return 'Okay';
        if (percent <= 85) return 'Good';
        return 'Full';
    }

    appendNeedMeter(container, label, percent, tone) {
        const wrapper = document.createElement('div');
        wrapper.classList.add('state-info', 'need-info');

        const heading = document.createElement('div');
        heading.classList.add('need-label');
        heading.textContent = `${label}: ${percent}% ${tone}`;

        const meter = document.createElement('progress');
        meter.classList.add('need-meter');
        meter.max = 100;
        meter.value = percent;
        meter.style.width = '100%';

        wrapper.append(heading, meter);
        container.append(wrapper);
    }

    appendSectionHeader(rows, key, title, className = 'info-section-title') {
        rows.push({
            label: `__header_${key}`,
            value: title,
            className
        });
    }

    appendInfoRows(rows, entries = [], defaultClassName = 'state-info') {
        entries.forEach(({ label, value, type, meta, className }) => {
            if (value == null || value === '') return;
            rows.push({
                label,
                value,
                type,
                meta,
                className: className ?? defaultClassName
            });
        });
    }

    getObjectStateRows(selectedObject) {
        const rows = [];
        const statusRows = [];

        if (selectedObject instanceof DoorMapObject) {
            statusRows.push({ label: 'State', value: selectedObject.isOpen ? 'Open' : 'Closed' });
        }

        this.appendInfoRows(statusRows, selectedObject.getSidebarStatusRows?.() ?? []);

        if (statusRows.length) {
            this.appendSectionHeader(rows, 'status', 'Status');
            rows.push(...statusRows);
        }

        const detailsRows = [];
        this.appendInfoRows(detailsRows, selectedObject.getSidebarDetailRows?.() ?? []);
        if (detailsRows.length) {
            this.appendSectionHeader(rows, 'details', 'Details');
            rows.push(...detailsRows);
        }

        return rows;
    }

    _buildOtherInfoRows(selectedObject) {
        const rows = [];
        const gridSystem = this.parent.parent.gameMap?.gridSystem;
        const positionInfo = this.getSelectionPositionInfo(selectedObject);
        const hasPosition = !!positionInfo;
        const gridCoords = hasPosition ? (gridSystem?.worldToGrid(positionInfo.posX, positionInfo.posY) ?? { x: 0, y: 0 }) : null;
        const debugMode = document.body.classList.contains('debug');

        const activeMyte = this.parent.getActiveMyte();
        const actionContext = this.getCurrentActionContext(selectedObject, activeMyte);

        if (hasPosition) {
            this.appendSectionHeader(rows, 'location', 'Location');
            this.appendInfoRows(rows, [
                { label: 'Coords', value: `[${gridCoords.x}, ${gridCoords.y}]`, className: 'position-info' },
                { label: 'World', value: debugMode ? `(${positionInfo.posX.toFixed(0)}, ${positionInfo.posY.toFixed(0)})` : null, className: 'position-info' }
            ]);
        }

        if (actionContext.matchesSelection && actionContext.currentAction) {
            this.appendSectionHeader(rows, 'current_action', 'Current Action');
            this.appendInfoRows(rows, [
                { label: 'Action', value: actionContext.currentAction.getQueueTitle?.() ?? actionContext.currentAction.constructor?.metadata?.label ?? actionContext.currentAction.constructor?.name ?? 'Action' },
                { label: 'Phase', value: actionContext.currentAction.phase ?? null }
            ]);
        }

        if (selectedObject instanceof Myte) {
            const snapshot = selectedObject.ai?.getNeedsSnapshot?.({ live: true });
            if (snapshot) {
                const vitals = snapshot.vitals ?? {};
                const behaviorDetail = this.getMyteBehaviorDetail(selectedObject);
                this.appendSectionHeader(rows, 'status', 'Status');
                this.appendInfoRows(rows, [
                    { label: 'Mood', value: `${selectedObject.stats.getMoodStatus()} (${vitals.mood ?? 0}%)` },
                    { label: 'Behavior', value: this.getMyteBehaviorLabel(selectedObject) },
                    { label: behaviorDetail?.label, value: behaviorDetail?.value },
                    { label: 'Activity', value: this.getMyteActivityLabel(selectedObject) }
                ]);
                rows.push({ label: '__header_needs', value: 'Vitals', className: 'needs-title' });
                rows.push({
                    label: 'vital_energy',
                    value: vitals.energy ?? 0,
                    meta: { label: 'Energy', id: 'energy' },
                    type: 'meter',
                    cacheValue: `energy:${vitals.energy ?? 0}`
                });

                const needsById = new Map((snapshot.needs || []).map(need => [need.id, need]));
                this.getNeedDisplayOrder().forEach(needId => {
                    const need = needsById.get(needId);
                    if (!need) return;

                    const pct = Math.max(0, 100 - need.percent);
                    rows.push({
                        label: `need_${need.id}`,
                        value: pct,
                        meta: { label: need.label, id: need.id },
                        type: 'meter',
                        cacheValue: `${need.id}:${pct}`
                    });
                });

                if (snapshot.lastDecisionLabel) {
                    this.appendSectionHeader(rows, 'ai', 'AI');
                    rows.push({
                        label: 'Last AI Choice',
                        value: snapshot.lastDecisionLabel,
                        type: 'ai-choice',
                        className: 'ai-choice-info',
                        cacheValue: snapshot.lastDecisionLabel
                    });
                }
            }
        }

        if (selectedObject?.classList?.contains('myte-slot')) {
            const slotMyte = this.getSlotMyte(selectedObject);
            this.appendSectionHeader(rows, 'status', 'Status');
            this.appendInfoRows(rows, [
                { label: 'Myte', value: slotMyte?.name ?? null },
                { label: 'State', value: this.getSlotStateLabel(slotMyte) }
            ]);
        }

        if (selectedObject instanceof MapObject) {
            rows.push(...this.getObjectStateRows(selectedObject));
        }

        const debugInfo = debugMode ? (selectedObject.getSelectionDebugInfo?.() || []) : [];
        if (debugInfo.length) {
            this.appendSectionHeader(rows, 'debug', 'Debug');
            debugInfo.forEach(({ label, value }) => rows.push({ label, value: String(value) }));
        }

        return rows;
    }

    renderOtherInfo(selectedObject) {
        const otherInfo = this.actionControls.querySelector('.other-info');
        if (!otherInfo) return;

        if (!selectedObject) {
            if (otherInfo.classList.contains('is-visible')) {
                otherInfo.innerHTML = '';
                otherInfo.classList.remove('is-visible');
                this._otherInfoCache = null;
                this._otherInfoRowMap.clear();
            }
            return;
        }

        const rows = this._buildOtherInfoRows(selectedObject);
        const cacheKey = rows.map(r => `${r.label}=${r.cacheValue ?? r.value}`).join('|');

        if (cacheKey === this._otherInfoCache) return;
        this._otherInfoCache = cacheKey;

        const prevRowMap = this._otherInfoRowMap;
        const newRowMap = new Map();
        const fragment = document.createDocumentFragment();

        for (const row of rows) {
            const strVal = String(row.value);
            let el = prevRowMap.get(row.label);

            if (row.type === 'meter') {
                if (!el) {
                    el = document.createElement('div');
                    el.classList.add('state-info', 'need-info');
                    const heading = document.createElement('div');
                    heading.classList.add('need-label');
                    const meter = document.createElement('progress');
                    meter.classList.add('need-meter');
                    meter.max = 100;
                    meter.style.width = '100%';
                    el.append(heading, meter);
                }
                const heading = el.querySelector('.need-label');
                const meter = el.querySelector('progress');
                const pct = row.value;
                const text = `${row.meta.label}: ${pct}%`;
                if (heading.textContent !== text) heading.textContent = text;
                if (meter.value !== pct) meter.value = pct;
                el.dataset.state = this.getMeterState(pct);
                el.dataset.metricId = row.meta.id ?? '';
            } else if (row.type === 'ai-choice') {
                if (!el) {
                    el = document.createElement('div');
                    el.classList.add('state-info', 'ai-choice-info');
                    if (row.className) el.classList.add(row.className);

                    const label = document.createElement('div');
                    label.classList.add('ai-choice-label');
                    label.textContent = row.label;

                    const body = document.createElement('div');
                    body.classList.add('ai-choice-body');
                    el.append(label, body);
                }

                const body = el.querySelector('.ai-choice-body');
                const decision = this.getAiDecisionDisplay(row.value);
                const decisionKey = `${decision.primary}|${decision.details.join('|')}`;

                if (body && body.dataset.decisionKey !== decisionKey) {
                    body.innerHTML = '';

                    const primaryChip = document.createElement('span');
                    primaryChip.classList.add('ai-choice-chip', 'primary');
                    primaryChip.textContent = decision.primary;
                    body.appendChild(primaryChip);

                    decision.details.forEach(detail => {
                        const chip = document.createElement('span');
                        chip.classList.add('ai-choice-chip');
                        chip.textContent = detail;
                        body.appendChild(chip);
                    });

                    body.dataset.decisionKey = decisionKey;
                }
            } else if (row.label.startsWith('__header_')) {
                if (!el) {
                    el = document.createElement('div');
                    el.classList.add('state-info');
                    if (row.className) el.classList.add(row.className);
                }
                if (el.textContent !== strVal) el.textContent = strVal;
            } else {
                if (!el) {
                    el = document.createElement('div');
                    el.classList.add('state-info');
                    if (row.className) el.classList.add(row.className);
                    el.innerHTML = `${row.label}: <span></span>`;
                }
                const span = el.querySelector('span');
                if (span && span.textContent !== strVal) span.textContent = strVal;
            }

            newRowMap.set(row.label, el);
            fragment.appendChild(el);
        }

        otherInfo.innerHTML = '';
        otherInfo.appendChild(fragment);
        otherInfo.classList.add('is-visible');
        this._otherInfoRowMap = newRowMap;
    }

    updateActions(selectedObject) {
        const selectedInfo = this.actionControls.querySelector('.selected-info');
        if (!selectedInfo) return;

        const interactionType = selectedInfo.querySelector('.interaction-type .type');
        const targetType = selectedInfo.querySelector('.target-info .type');
        const targetName = selectedInfo.querySelector('.target-info .name');
        const activeMyte = this.parent.getActiveMyte();
        this.currentSelectedObject = selectedObject;
        this.lastInfoRefreshAt = 0;
        this._otherInfoCache = null;
        this._otherInfoRowMap.clear();
        this._lastAvailableActionsKey = null;


        // Remove all state classes first
        selectedInfo.classList.remove('self-selected', 'myte-interaction', 'map-interaction', 'element-interaction');
        this.emptyActionList();

        if (selectedObject) {
            this.renderOtherInfo(selectedObject);

            // Determine interaction type based on selected object
            if (selectedObject === this.parent.getActiveMyte()) {
                interactionType.textContent = "Selected Self";
                selectedInfo.classList.add('self-selected');
                targetType.textContent = this.getTargetTypeLabel(selectedObject, activeMyte);
                targetName.textContent = selectedObject.name;
            } else {
                interactionType.textContent = "Interacting with";

                // Set target type and name based on object type
                if (selectedObject instanceof Myte) {
                    selectedInfo.classList.add('myte-interaction');
                    targetType.textContent = this.getTargetTypeLabel(selectedObject, activeMyte);
                    targetName.textContent = selectedObject.name;
                } else if (selectedObject instanceof MapObject) {
                    selectedInfo.classList.add('map-interaction');
                    targetType.textContent = this.getTargetTypeLabel(selectedObject, activeMyte);
                    targetName.textContent = selectedObject.getDisplayName?.() || selectedObject.type;
                } else if (selectedObject instanceof DroppedMapItem) {
                    selectedInfo.classList.add('element-interaction');
                    targetType.textContent = this.getTargetTypeLabel(selectedObject, activeMyte);
                    const itemDef = ItemRegistry.getItemSync?.(selectedObject.variant);
                    targetName.textContent = itemDef?.name || selectedObject.variant || 'Item';
                } else if (selectedObject?.classList?.contains('myte-slot')) {
                    selectedInfo.classList.add('map-interaction');
                    targetType.textContent = this.getTargetTypeLabel(selectedObject, activeMyte);
                    targetName.textContent = selectedObject.querySelector('.myte-home-label .name')?.textContent?.trim()
                        || selectedObject.id
                        || 'Home Slot';
                } else if (selectedObject instanceof Element) {
                    selectedInfo.classList.add('element-interaction');
                    targetType.textContent = "Element";
                    targetName.textContent = selectedObject.tagName;
                } else {
                    selectedInfo.classList.add('element-interaction');
                    targetType.textContent = "Element";
                    targetName.textContent = selectedObject.tagName;
                }
            }

            selectedInfo.classList.add('is-visible');
            this.updateActionList(selectedObject);
        } else {
            // default
            interactionType.textContent = "Not Selected";
            targetType.textContent = "-";
            targetName.textContent = "None";
            selectedInfo.classList.remove('is-visible');
        }
    }

    _createDroppedItemPickupButton(selectedObject, activeMyte) {
        const button = document.createElement('button');
        button.textContent = 'Pick Up';
        button.classList.add('primary-action');
        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();

            if (!activeMyte || selectedObject.collected) return;
            const myteCenter = {
                x: activeMyte.posX + (activeMyte.size.width / 2),
                y: activeMyte.posY + (activeMyte.size.height / 2)
            };
            const itemCenter = {
                x: selectedObject.posX + (selectedObject.size.width / 2),
                y: selectedObject.posY + (selectedObject.size.height / 2)
            };
            const dist = Math.hypot(itemCenter.x - myteCenter.x, itemCenter.y - myteCenter.y);
            if (dist < selectedObject.minimumCollectDistance) {
                selectedObject.collect(activeMyte);
            } else {
                activeMyte.queue.interrupt('astar_move', {
                    waypoints: [{ x: itemCenter.x, y: itemCenter.y }],
                    userInitiated: true
                });
            }
        });
        return button;
    }

    updateActionList(selectedObject) {
        const actionGroups = this.actionControls.querySelector('.action-groups');
        const previousScrollTop = actionGroups.scrollTop;
        actionGroups.innerHTML = '';
        const activeMyte = this.parent.getActiveMyte();

        if (selectedObject instanceof DroppedMapItem) {
            if (activeMyte && !selectedObject.collected) {
                const groupEl = document.createElement('div');
                groupEl.className = 'action-group major-action';
                const ul = document.createElement('ul');
                const li = document.createElement('li');
                li.appendChild(this._createDroppedItemPickupButton(selectedObject, activeMyte));
                ul.appendChild(li);
                groupEl.appendChild(ul);
                actionGroups.appendChild(groupEl);
                this.actionControls.classList.add('is-visible');
            }
            actionGroups.scrollTop = previousScrollTop;
            return;
        }

        if (selectedObject?.classList?.contains('myte-slot')) {
            const slotMyte = this.parent.parent.mytes?.find?.(m => m.dropTarget === selectedObject);
            if (slotMyte && slotMyte === activeMyte && !slotMyte.isAtHomePosition?.(1)) {
                const groupEl = document.createElement('div');
                groupEl.className = 'action-group major-action';
                const ul = document.createElement('ul');
                const li = document.createElement('li');
                const btn = document.createElement('button');
                btn.textContent = 'Go Home';
                btn.addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    slotMyte.clearHomeSlotHold?.();
                    slotMyte.queue.clear();
                    slotMyte.setMode(MOVE_TYPES.GOHOME);
                });
                li.appendChild(btn);
                ul.appendChild(li);
                groupEl.appendChild(ul);
                actionGroups.appendChild(groupEl);
                this.actionControls.classList.add('is-visible');
            }
            actionGroups.scrollTop = previousScrollTop;
            return;
        }

        const availableActions = ActionManager.getAvailableActions(selectedObject, activeMyte);
        const majorAction = this.getMajorAction(selectedObject, activeMyte, availableActions);
        const groupedActions = availableActions
            .filter(action => action.id !== majorAction?.id)
            .reduce((groups, action) => {
                const cat = action.category;
                if (!groups[cat]) groups[cat] = [];
                groups[cat].push(action);
                return groups;
            }, {});

        if (majorAction) {
            const majorActionElement = document.createElement('div');
            majorActionElement.className = 'action-group major-action';

            const actionList = document.createElement('ul');
            const li = document.createElement('li');
            li.appendChild(this.createActionButton(majorAction, selectedObject, activeMyte, {
                prominent: true
            }));
            actionList.appendChild(li);
            majorActionElement.appendChild(actionList);
            actionGroups.appendChild(majorActionElement);
        }

        // Create elements for each group
        Object.entries(groupedActions).forEach(([category, actions]) => {
            const groupElement = document.createElement('div');
            groupElement.className = `action-group ${category}`;

            // Add title
            const title = document.createElement('h3');
            title.textContent = this.getCategoryTitle(category);
            groupElement.appendChild(title);

            // Add actions
            const actionList = document.createElement('ul');
            actions.forEach(action => {
                const li = document.createElement('li');
                li.appendChild(this.createActionButton(action, selectedObject, activeMyte));
                actionList.appendChild(li);
            });

            groupElement.appendChild(actionList);
            actionGroups.appendChild(groupElement);
        });

        // Self-selected myte: show Go Home button
        if (selectedObject === activeMyte && activeMyte && !activeMyte.isAtHomePosition?.(1)) {
            const groupEl = document.createElement('div');
            groupEl.className = 'action-group movement';
            const h3 = document.createElement('h3');
            h3.textContent = 'Movement';
            const ul = document.createElement('ul');
            const li = document.createElement('li');
            const btn = document.createElement('button');
            btn.textContent = 'Go Home';
            btn.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                activeMyte.clearHomeSlotHold?.();
                activeMyte.queue.clear();
                activeMyte.setMode(MOVE_TYPES.GOHOME);
            });
            li.appendChild(btn);
            ul.appendChild(li);
            groupEl.appendChild(h3);
            groupEl.appendChild(ul);
            actionGroups.appendChild(groupEl);
        }

        if (actionGroups.children.length > 0) {
            this.actionControls.classList.add('is-visible');
        }

        actionGroups.scrollTop = previousScrollTop;
    }
}

class MyteListManager extends UIComponent {
    constructor(parent) {
        super(parent);
        this.myteListContainer = document.getElementById('all_mytes');
    }

    init() {
        this.initMytesList();
    }

    createThumbnail(myte) {
        const thumbnail = document.createElement('div');
        thumbnail.classList.add('myte-thumbnail');
        thumbnail.classList.add('button');

        thumbnail.setAttribute('data-myte-id', myte.id);
        thumbnail.setAttribute('data-myte-species', myte.species);

        // Create sprite container
        const spriteContainer = document.createElement('div');
        spriteContainer.className = 'myte-sprite';
        spriteContainer.setAttribute('data-myte-species', myte.species);

        // Create sprite inner
        const spriteInner = document.createElement('div');
        spriteInner.className = 'myte-sprite-inner';
        spriteContainer.appendChild(spriteInner);

        // Create name element
        const name = document.createElement('span');
        name.className = 'myte-name';
        name.textContent = myte.name;

        const details = document.createElement('div');
        details.className = 'myte-details';
        details.appendChild(name);

        const state = document.createElement('span');
        state.className = 'myte-state';
        details.appendChild(state);

        // Build thumbnail
        thumbnail.appendChild(spriteContainer);
        thumbnail.appendChild(details);

        // Add click handler
        thumbnail.addEventListener('click', () => {
            if (myte === this.parent.getActiveMyte()) {
                this.parent.parent.deactivateActiveMyte?.(myte);
                return;
            }

            this.parent.setActiveMyte(myte);
        });

        this.applyThumbnailState(thumbnail, myte);

        return thumbnail;
    }

    getMyteStateLabel(myte) {
        if (!myte?.isActive) {
            return 'Inactive';
        }

        if (myte === this.parent.getActiveMyte()) {
            return 'Following';
        }

        if (myte.goal === MOVE_TYPES.FREEROAM) {
            return 'Free Roam';
        }

        return 'Deployed';
    }

    applyThumbnailState(thumbnail, myte) {
        if (!thumbnail || !myte) return;

        const isActiveMyte = myte === this.parent.getActiveMyte();
        const isFreeRoam = myte.isActive && myte.goal === MOVE_TYPES.FREEROAM;
        const isInSlot = !myte.isActive;
        const stateLabel = this.getMyteStateLabel(myte);

        thumbnail.classList.toggle('active', isActiveMyte);
        thumbnail.classList.toggle('deployed', myte.isActive);
        thumbnail.classList.toggle('free-roam', isFreeRoam);
        thumbnail.classList.toggle('in-slot', isInSlot);
        thumbnail.dataset.myteState = stateLabel;
        thumbnail.querySelector('.myte-state').textContent = stateLabel;
        thumbnail.title = `${myte.name}: ${stateLabel}`;
    }

    initMytesList() {
        if (!this.myteListContainer) {
            console.error('Myte list container not found');
            return;
        }

        // Clear existing content
        this.myteListContainer.innerHTML = '';

        // Add thumbnails
        const mytes = this.parent.getMytes();
        if (mytes && mytes.length > 0) {
            mytes.forEach(myte => {
                this.myteListContainer.appendChild(this.createThumbnail(myte));
            });
        } else {
            // No Mytes
            const emptyState = document.createElement('div');
            emptyState.className = 'empty';
            emptyState.textContent = 'No Mytes found';
            this.myteListContainer.appendChild(emptyState);
        }
    }

    updateMytesList(activeMyte) {
        if (!this.myteListContainer) return;

        const mytesById = new Map((this.parent.getMytes() || []).map(myte => [String(myte.id), myte]));

        this.myteListContainer.querySelectorAll('.myte-thumbnail').forEach(thumbnail => {
            const myte = mytesById.get(thumbnail.dataset.myteId);
            if (!myte) return;

            this.applyThumbnailState(thumbnail, myte);
        });
    }
}

class HUDManager extends UIComponent {
    constructor(parent) {
        super(parent);
        this.hudElement = document.querySelector('#hud-active-pet');
        this.nameElement = this.hudElement?.querySelector('.name') || null;
        this.moodElement = this.hudElement?.querySelector('.mood') || null;
        this.energyElement = this.hudElement?.querySelector('.energy') || null;
        this.currentMoodEffect = null;
        this.lastRenderedState = {
            visible: false,
            myteId: null,
            name: null,
            mood: null,
            energy: null,
            moodEffect: null
        };
    }

    getEnergyLabel(ratio) {
        if (ratio <= 0.1) return 'Critical';
        if (ratio <= 0.3) return 'Low';
        if (ratio <= 0.55) return 'Okay';
        if (ratio <= 0.8) return 'Good';
        return 'Full';
    }

    update() {
        if (!this.hudElement) return;
        
        const activeMyte = this.parent.getActiveMyte();

        if (!activeMyte) {
            if (this.lastRenderedState.visible) {
                this.hudElement.classList.remove('is-visible');
                this.lastRenderedState.visible = false;
            }
            return;
        }

        if (!this.lastRenderedState.visible) {
            this.hudElement.classList.add('is-visible');
            this.lastRenderedState.visible = true;
        }

        const mood = activeMyte.stats.getMoodStatus();
        const energyRatio = activeMyte.stats.getEnergyRatio();
        const energy = `${this.getEnergyLabel(energyRatio)} ${Math.round(energyRatio * 100)}%`;
        const currentAction = activeMyte.queue.getCurrentAction();
        const actionMetadata = currentAction?.constructor?.metadata;
        const moodEffectText = actionMetadata?.affectsMood
            ? `Mood ${actionMetadata.moodEffect > 0 ? '+' : ''}${actionMetadata.moodEffect}`
            : null;

        if (this.lastRenderedState.myteId !== activeMyte.id || this.lastRenderedState.name !== activeMyte.name) {
            this.nameElement.textContent = activeMyte.name;
            this.lastRenderedState.myteId = activeMyte.id;
            this.lastRenderedState.name = activeMyte.name;
        }

        if (this.lastRenderedState.mood !== mood) {
            this.moodElement.textContent = mood;
            this.lastRenderedState.mood = mood;
        }

        if (this.lastRenderedState.energy !== energy) {
            this.energyElement.textContent = energy;
            this.lastRenderedState.energy = energy;
        }

        if (this.lastRenderedState.moodEffect !== moodEffectText) {
            this.currentMoodEffect?.remove();
            this.currentMoodEffect = null;

            if (moodEffectText) {
                const moodEffect = document.createElement('div');
                moodEffect.className = 'mood-effect';
                moodEffect.textContent = moodEffectText;
                this.hudElement.appendChild(moodEffect);
                this.currentMoodEffect = moodEffect;
            }

            this.lastRenderedState.moodEffect = moodEffectText;
        }
    }
}

class OffscreenMyteIndicatorManager extends UIComponent {
    constructor(parent) {
        super(parent);
        this.overlay = null;
        this.markers = new Map();
        this.edgePadding = 14;
        this.preferredGap = 18;
    }

    init() {
        const containerElement = this.parent.parent?.element;
        if (!containerElement) return;

        this.overlay = document.createElement('div');
        this.overlay.className = 'myte-offscreen-indicators';
        this.overlay.setAttribute('aria-hidden', 'true');
        containerElement.appendChild(this.overlay);
    }

    getMarker(myte) {
        const markerId = String(myte?.id ?? '');
        if (!markerId || !this.overlay) return null;

        if (!this.markers.has(markerId)) {
            const marker = document.createElement('div');
            marker.className = 'myte-offscreen-indicator is-hidden';
            marker.dataset.myteId = markerId;
            this.overlay.appendChild(marker);
            this.markers.set(markerId, marker);
        }

        return this.markers.get(markerId);
    }

    hideMarker(marker) {
        if (!marker) return;
        marker.classList.add('is-hidden');
    }

    hideAllMarkers() {
        this.markers.forEach(marker => this.hideMarker(marker));
    }

    isBoundsVisible(bounds, viewportWidth, viewportHeight) {
        return !(
            bounds.right < 0 ||
            bounds.left > viewportWidth ||
            bounds.bottom < 0 ||
            bounds.top > viewportHeight
        );
    }

    clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    getViewportWorldBounds(camera, viewportWidth, viewportHeight) {
        const safeZoom = Number.isFinite(camera?.zoomLevel) && camera.zoomLevel > 0
            ? camera.zoomLevel
            : 1;
        const left = Number.isFinite(camera?.posX) ? -camera.posX : 0;
        const top = Number.isFinite(camera?.posY) ? -camera.posY : 0;
        const width = viewportWidth / safeZoom;
        const height = viewportHeight / safeZoom;

        return {
            left,
            top,
            right: left + width,
            bottom: top + height,
            width,
            height
        };
    }

    projectWorldPointToViewport(point, viewportBounds, viewportWidth, viewportHeight) {
        const normalizedX = viewportBounds.width > 0
            ? (point.x - viewportBounds.left) / viewportBounds.width
            : 0.5;
        const normalizedY = viewportBounds.height > 0
            ? (point.y - viewportBounds.top) / viewportBounds.height
            : 0.5;

        return {
            x: normalizedX * viewportWidth,
            y: normalizedY * viewportHeight
        };
    }

    isPointInsideViewport(point, viewportBounds) {
        return (
            point.x >= viewportBounds.left &&
            point.x <= viewportBounds.right &&
            point.y >= viewportBounds.top &&
            point.y <= viewportBounds.bottom
        );
    }

    getMarkerEdge(x, y, viewportWidth, viewportHeight) {
        const touchesTop = y <= this.edgePadding;
        const touchesBottom = y >= viewportHeight - this.edgePadding;
        const touchesLeft = x <= this.edgePadding;
        const touchesRight = x >= viewportWidth - this.edgePadding;

        if (touchesTop && touchesLeft) return 'top-left';
        if (touchesTop && touchesRight) return 'top-right';
        if (touchesBottom && touchesLeft) return 'bottom-left';
        if (touchesBottom && touchesRight) return 'bottom-right';
        if (touchesTop) return 'top';
        if (touchesBottom) return 'bottom';
        if (touchesLeft) return 'left';
        if (touchesRight) return 'right';
        return 'inside';
    }

    resolveEdgeOverlap(markers, axis, min, max) {
        if (!Array.isArray(markers) || markers.length <= 1) return;

        markers.sort((a, b) => a[axis] - b[axis]);

        const availableSpace = Math.max(0, max - min);
        const gap = Math.max(
            0,
            Math.min(
                this.preferredGap,
                markers.length > 1 ? availableSpace / (markers.length - 1) : this.preferredGap
            )
        );

        let nextPosition = min;
        markers.forEach(marker => {
            marker[axis] = Math.max(marker[axis], nextPosition);
            nextPosition = marker[axis] + gap;
        });

        markers[markers.length - 1][axis] = Math.min(markers[markers.length - 1][axis], max);

        for (let i = markers.length - 2; i >= 0; i -= 1) {
            markers[i][axis] = Math.min(markers[i][axis], markers[i + 1][axis] - gap);
        }

        for (let i = 0; i < markers.length; i += 1) {
            markers[i][axis] = this.clamp(markers[i][axis], min, max);
        }

        for (let i = 1; i < markers.length; i += 1) {
            markers[i][axis] = Math.max(markers[i][axis], markers[i - 1][axis] + gap);
            markers[i][axis] = this.clamp(markers[i][axis], min, max);
        }
    }

    updateMarker(markerData, activeMyte) {
        const marker = this.getMarker(markerData.myte);
        if (!marker) return;

        marker.classList.remove('is-hidden');
        marker.classList.toggle('active-myte', markerData.myte === activeMyte);
        marker.dataset.edge = markerData.edge;
        marker.title = markerData.myte?.name || 'Myte';
        marker.style.left = `${Math.round(markerData.x)}px`;
        marker.style.top = `${Math.round(markerData.y)}px`;
    }

    update() {
        if (!this.overlay) return;

        const container = this.parent.parent;
        const viewport = container?.getContainerRect?.();
        const camera = container?.camera;

        if (!camera || !viewport?.width || !viewport?.height) {
            this.hideAllMarkers();
            return;
        }

        const viewportWidth = viewport.width;
        const viewportHeight = viewport.height;
        const viewportBounds = this.getViewportWorldBounds(camera, viewportWidth, viewportHeight);
        const activeMyte = this.parent.getActiveMyte();
        const markerData = [];
        const visibleMarkerIds = new Set();

        (this.parent.getMytes() || []).forEach(myte => {
            const marker = this.getMarker(myte);

            if (!myte?.isActive) {
                this.hideMarker(marker);
                return;
            }

            const worldCenter = {
                x: (Number.isFinite(myte.posX) ? myte.posX : 0) + ((myte.size?.width || 0) / 2),
                y: (Number.isFinite(myte.posY) ? myte.posY : 0) + ((myte.size?.height || 0) / 2)
            };

            if (this.isPointInsideViewport(worldCenter, viewportBounds)) {
                this.hideMarker(marker);
                return;
            }

            const projectedCenter = this.projectWorldPointToViewport(
                worldCenter,
                viewportBounds,
                viewportWidth,
                viewportHeight
            );

            let x = this.clamp(projectedCenter.x, this.edgePadding, viewportWidth - this.edgePadding);
            let y = this.clamp(projectedCenter.y, this.edgePadding, viewportHeight - this.edgePadding);
            const edge = this.getMarkerEdge(x, y, viewportWidth, viewportHeight);

            visibleMarkerIds.add(String(myte.id));
            markerData.push({ myte, edge, x, y });
        });

        markerData.forEach(marker => this.updateMarker(marker, activeMyte));

        this.markers.forEach((marker, markerId) => {
            if (!visibleMarkerIds.has(markerId)) {
                this.hideMarker(marker);
            }
        });
    }

    dispose() {
        this.markers.forEach(marker => marker.remove());
        this.markers.clear();
        this.overlay?.remove();
        this.overlay = null;
    }
}

class ScreenManager extends UIComponent {
    constructor(parent) {
        super(parent);
        this.headerElement = this.parent.containerWrapper.querySelector('.header');
        this.fullscreenButton = this.parent.containerWrapper.querySelector('.fullscreen-btn');
        this.listenerCleanup = [];
    }

    init() {
        this.initializeButtons();
    }

    initializeButtons() {
        if (this.fullscreenButton) {
            this.handleFullscreenClick = () => {
                this.toggleFullscreen();
            };
            this.fullscreenButton.addEventListener("click", this.handleFullscreenClick);
            this.listenerCleanup.push(() => this.fullscreenButton?.removeEventListener('click', this.handleFullscreenClick));
        }
    }

    toggleFullscreen() {
        const camera = this.parent.parent.camera;
        const anchor = camera?.getViewportCenterAnchor ? camera.getViewportCenterAnchor() : null;

        // toggle class on container
        this.parent.containerWrapper.classList.toggle('is-fullscreen');
        if (this.fullscreenButton) {
            this.fullscreenButton.classList.toggle('active');
        }

        if (camera && anchor) {
            requestAnimationFrame(() => {
                camera.zoomTo(camera.zoomLevel, { anchor, immediate: true });
            });
        }
    }

    destroy() {
        this.listenerCleanup.forEach(cleanup => cleanup());
        this.listenerCleanup = [];
    }
}


class UserInterface {
    constructor(parent) {
        this.parent = parent;
        this.containerWrapper = parent.containerWrapper;
        this.debug = new DebugUI(parent);
        this.isActive = false;

        // Initialize all UI components
        this.toolManager = new ToolManager(this);
        this.selectionManager = new SelectionManager(this);
        this.queueTargetManager = new QueueTargetManager(this);
        this.actionSidebarManager = new ActionSidebarManager(this);
        this.myteListManager = new MyteListManager(this);
        this.hudManager = new HUDManager(this);
        this.offscreenMyteIndicatorManager = new OffscreenMyteIndicatorManager(this);
        this.screenManager = new ScreenManager(this);
        this.cursorManager = new CursorManager(this);
        this.compactQueueUI = new QueueUI(parent, {
            element: document.getElementById('myte_queue_overlay'),
            mode: 'compact',
            allowControls: false,
            maxItems: 5
        });
    }

    init() {
        // Initialize all components
        this.toolManager.init();
        this.selectionManager.init();
        this.actionSidebarManager.init();
        this.myteListManager.init();
        this.hudManager.init();
        this.offscreenMyteIndicatorManager.init();
        this.screenManager.init();

        // Initialize additional menus
        this.soundMenu = new SoundMenu(this);
        this.settingsMenu = new SettingsMenu(this);
        this.viewMenu = new ViewMenu(this);
        this.debugMenu = new DebugMenu(this);
    }

    // Methods for component communication
    onToolModeChanged(mode) {
        // Clear selection when tool mode changes
        this.selectionManager.setSelected(null);
        
        // Notify action manager to update UI
        this.actionSidebarManager.updateActions(null);
    }

    onSelectionChanged(selectedObject) {
        // Update action panel based on selection
        this.actionSidebarManager.updateActions(selectedObject);
    }

    // Proxy methods to parent for components to use
    getMytes() {
        return this.parent.mytes;
    }

    getActiveMyte() {
        return this.parent.activeMyte;
    }

    setActiveMyte(myte) {
        this.parent.setActiveMyte(myte);
        this.myteListManager.updateMytesList(myte);
        this.hudManager.update();
        this.viewMenu?.updateButtonStates();
    }

    playSound(sound) {
        this.parent.core.soundManager.playUISound(sound);
    }

    // Public methods
    setSelected(obj) {
        this.selectionManager.setSelected(obj);
    }

    setToolMode(mode) {
        this.toolManager.setToolMode(mode);
    }

    isTool(mode) {
        return this.toolManager.isTool(mode);
    }

    changeToolMode(mode) {
        return this.toolManager.changeToolMode(mode);
    }

    // Update method called every frame
    update() {
        this.debug.update();
        this.cursorManager.update();
        this.queueTargetManager.update();
        this.actionSidebarManager.update();
        this.hudManager.update();
        this.offscreenMyteIndicatorManager.update();
        this.compactQueueUI?.update?.();
    }

    dispose() {
        this.debug?.dispose?.();
        this.debug = null;
        this.debugMenu?.dispose?.();
        this.debugMenu = null;
        this.settingsMenu?.dispose?.();
        this.settingsMenu = null;
        this.soundMenu?.dispose?.();
        this.soundMenu = null;
        this.viewMenu?.dispose?.();
        this.viewMenu = null;

        this.screenManager?.destroy?.();
        this.toolManager?.destroy?.();
        this.cursorManager?.destroy?.();
        this.queueTargetManager?.dispose?.();
        this.offscreenMyteIndicatorManager?.dispose?.();

        this.screenManager = null;
        this.toolManager = null;
        this.cursorManager = null;
        this.queueTargetManager = null;
        this.offscreenMyteIndicatorManager = null;
        this.compactQueueUI?.dispose?.();
        this.compactQueueUI = null;
    }
}
