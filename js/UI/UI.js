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

        this.boundHandlers = {
            mouseMove: this.throttle((event) => {
                this.handleMouseMove(event);
            }, this.config.throttleDelay),
            mouseDown: this.handleMouseDown.bind(this),
            mouseUp: this.handleMouseUp.bind(this),
            mouseLeave: this.hideCursor.bind(this),
            mouseEnter: this.showCursor.bind(this),
            focusIn: (event) => {
                // Show native cursor on focusable elements for accessibility
                if (this.config.accessibility.showNativeCursorForScreenReaders && 
                    event.target.tabIndex >= 0) {
                    event.target.style.cursor = 'auto';
                }
            }
        };

        // Use throttled mousemove for performance
        document.addEventListener('mousemove', this.boundHandlers.mouseMove);
        
        // Track mouse state
        document.addEventListener('mousedown', this.boundHandlers.mouseDown);
        document.addEventListener('mouseup', this.boundHandlers.mouseUp);
        
        // Handle visibility
        document.addEventListener('mouseleave', this.boundHandlers.mouseLeave);
        document.addEventListener('mouseenter', this.boundHandlers.mouseEnter);
        
        // Handle focus for accessibility
        document.addEventListener('focusin', this.boundHandlers.focusIn);
        this.listenersAttached = true;
    }

    handleMouseMove(event) {
        if (!this.config.enabled) return;
        
        this.position.x = event.clientX;
        this.position.y = event.clientY;
        
        this.updateCursorPosition();
        
        // Make sure cursor is visible when mouse moves
        if (!this.isVisible) {
            this.showCursor();
        }
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
        // Clean up event listeners
        if (this.boundHandlers) {
            document.removeEventListener('mousemove', this.boundHandlers.mouseMove);
            document.removeEventListener('mousedown', this.boundHandlers.mouseDown);
            document.removeEventListener('mouseup', this.boundHandlers.mouseUp);
            document.removeEventListener('mouseleave', this.boundHandlers.mouseLeave);
            document.removeEventListener('mouseenter', this.boundHandlers.mouseEnter);
            document.removeEventListener('focusin', this.boundHandlers.focusIn);
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
                if (object.duplicate) object.duplicate.classList.remove('selected');
            } else if (object instanceof MapObject) {
                if (object.element) object.element.classList.remove('selected');
            } else if (object) {
                object.classList.remove('selected');
            }
        };

        const select = (object) => {
            if (!object) return; // Check if object exists
            
            if (object instanceof Myte) {
                if (object.duplicate) object.duplicate.classList.add('selected');
            } else if (object instanceof MapObject) {
                if (object.element) object.element.classList.add('selected');
            } else if (object) {
                object.classList.add('selected');
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

class ActionSidebarManager extends UIComponent {
    constructor(parent) {
        super(parent);
        this.actionControls = this.parent.containerWrapper.querySelector('#action-controls');
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

    emptyActionList() {
        const actionGroups = this.actionControls.querySelector('.action-groups');
        actionGroups.innerHTML = '';
        this.actionControls.classList.remove('visible');

        // empty other info
        this.actionControls.querySelector('.other-info').innerHTML = '';
        this.actionControls.querySelector('.other-info').classList.remove('visible');


    }

    updateActions(selectedObject) {
        const selectedInfo = this.actionControls.querySelector('.selected-info');
        if (!selectedInfo) return;

        const interactionType = selectedInfo.querySelector('.interaction-type .type');
        const targetType = selectedInfo.querySelector('.target-info .type');
        const targetName = selectedInfo.querySelector('.target-info .name');

        const otherInfo = this.actionControls.querySelector('.other-info');


        // Remove all state classes first
        selectedInfo.classList.remove('self-selected', 'myte-interaction', 'map-interaction', 'element-interaction');
        this.emptyActionList();

        if (selectedObject) {

            // make div in otherInfo
            const positionInfo = document.createElement('div');
            positionInfo.classList.add('position-info');

            // convert to grid coordinates
            let gridCoords = this.parent.parent.gameMap.gridSystem.worldToGrid(selectedObject.posX, selectedObject.posY);

            // add position info
            positionInfo.innerHTML =`Coords: [${gridCoords.x}, ${gridCoords.y}]`;
            positionInfo.innerHTML += `<br>World: (${selectedObject.posX.toFixed(0)}, ${selectedObject.posY.toFixed(0)})`;
            otherInfo.append(positionInfo);

            // add state info
            if(selectedObject instanceof DoorMapObject) {
                const stateInfo = document.createElement('div');
                stateInfo.classList.add('state-info');
                stateInfo.innerHTML = `State: ${selectedObject.isOpen ? 'Open' : 'Closed'}`;
                otherInfo.append(stateInfo);
            }

            const debugInfo = selectedObject.getSelectionDebugInfo?.() || [];
            debugInfo.forEach(({ label, value }) => {
                const info = document.createElement('div');
                info.classList.add('state-info');
                info.innerHTML = `${label}: ${value}`;
                otherInfo.append(info);
            });

            // make visible
            otherInfo.classList.add('visible');

            // Determine interaction type based on selected object
            if (selectedObject === this.parent.getActiveMyte()) {
                interactionType.textContent = "Selected Self";
                selectedInfo.classList.add('self-selected');
                targetType.textContent = "Myte";
                targetName.textContent = selectedObject.name;
            } else {
                interactionType.textContent = "Interacting with";

                // Set target type and name based on object type
                if (selectedObject instanceof Myte) {
                    selectedInfo.classList.add('myte-interaction');
                    targetType.textContent = "Myte";
                    targetName.textContent = selectedObject.name;
                } else if (selectedObject instanceof MapObject) {
                    selectedInfo.classList.add('map-interaction');
                    targetType.textContent = "Object";
                    targetName.textContent = selectedObject.type;
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

            selectedInfo.classList.add('visible');
            this.updateActionList(selectedObject);
        } else {
            // default
            interactionType.textContent = "Not Selected";
            targetType.textContent = "-";
            targetName.textContent = "None";
            selectedInfo.classList.remove('visible');
        }
    }

    updateActionList(selectedObject) {
        const actionGroups = this.actionControls.querySelector('.action-groups');
        const activeMyte = this.parent.getActiveMyte();

        // Get actions grouped by category from global ActionManager
        const groupedActions = ActionManager.getActionsByCategory(selectedObject, activeMyte);

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
                const button = document.createElement('button');
                button.textContent = action.label;
                if (action.description) {
                    button.title = action.description;
                }

                // click event for actions
                button.addEventListener('click', () => {
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
                        activeMyte.queue.add(action.id, options);
                        this.updateActions(selectedObject);
                    }
                });

                li.appendChild(button);
                actionList.appendChild(li);
            });

            groupElement.appendChild(actionList);
            actionGroups.appendChild(groupElement);
        });

        if (actionGroups.children.length > 0) {
            this.actionControls.classList.add('visible');
        }
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

        if (myte === this.parent.getActiveMyte()) {
            thumbnail.classList.add('active');
        }

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

        // Build thumbnail
        thumbnail.appendChild(spriteContainer);
        thumbnail.appendChild(name);

        // Add click handler
        thumbnail.addEventListener('click', () => {
            if (myte !== this.parent.getActiveMyte()) {
                this.parent.setActiveMyte(myte);
            }
        });

        return thumbnail;
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
        // Update mytes list
        if (!this.myteListContainer) return;

        // remove active
        this.myteListContainer.querySelectorAll('.myte-thumbnail').forEach(thumbnail => {
            thumbnail.classList.remove('active');
        });

        // set current as active
        if (activeMyte) {
            const activeThumb = this.myteListContainer.querySelector(`[data-myte-id="${activeMyte.id}"]`);
            if (activeThumb) {
                activeThumb.classList.add('active');
            }
        }
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

    update() {
        if (!this.hudElement) return;
        
        const activeMyte = this.parent.getActiveMyte();

        if (!activeMyte) {
            if (this.lastRenderedState.visible) {
                this.hudElement.classList.remove('visible');
                this.lastRenderedState.visible = false;
            }
            return;
        }

        if (!this.lastRenderedState.visible) {
            this.hudElement.classList.add('visible');
            this.lastRenderedState.visible = true;
        }

        const mood = activeMyte.stats.getMoodStatus();
        const energy = 'Full';
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

class ScreenManager extends UIComponent {
    constructor(parent) {
        super(parent);
        this.headerElement = this.parent.containerWrapper.querySelector('.header');
        this.fullscreenButton = this.parent.containerWrapper.querySelector('.fullscreen-btn');
        this.cameraControls = null;
        this.listenerCleanup = [];
    }

    init() {
        this.initializeCameraControls();
        this.initializeButtons();
    }

    initializeCameraControls() {
        if (!this.headerElement || this.cameraControls) return;

        this.cameraControls = document.createElement('div');
        this.cameraControls.className = 'camera-controls';

        const controlConfigs = [
            { label: '-', title: 'Zoom out', action: () => this.parent.parent.camera?.zoomOut({ immediate: true }) },
            { label: '1x', title: 'Reset zoom', action: () => this.parent.parent.camera?.resetZoom(true) },
            { label: 'Me', title: 'Center on active myte', action: () => this.parent.parent.camera?.centerOnActiveMyte(true) },
            { label: 'Fit', title: 'Fit entire map', action: () => this.parent.parent.camera?.fitMap('contain', true) },
            { label: '+', title: 'Zoom in', action: () => this.parent.parent.camera?.zoomIn({ immediate: true }) }
        ];

        controlConfigs.forEach(config => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'camera-control-btn';
            button.textContent = config.label;
            button.title = config.title;
            button.setAttribute('aria-label', config.title);
            const handleClick = () => {
                config.action();
            };
            button.addEventListener('click', handleClick);
            this.listenerCleanup.push(() => button.removeEventListener('click', handleClick));
            this.cameraControls.appendChild(button);
        });

        if (this.fullscreenButton) {
            this.headerElement.insertBefore(this.cameraControls, this.fullscreenButton);
        } else {
            this.headerElement.appendChild(this.cameraControls);
        }
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
        this.parent.containerWrapper.classList.toggle('fullscreen');
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
        this.cameraControls?.remove();
        this.cameraControls = null;
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
        this.actionSidebarManager = new ActionSidebarManager(this);
        this.myteListManager = new MyteListManager(this);
        this.hudManager = new HUDManager(this);
        this.screenManager = new ScreenManager(this);
        this.cursorManager = new CursorManager(this);
    }

    init() {
        // Initialize all components
        this.toolManager.init();
        this.selectionManager.init();
        this.actionSidebarManager.init();
        this.myteListManager.init();
        this.hudManager.init();
        this.screenManager.init();

        // Initialize additional menus
        this.soundMenu = new SoundMenu(this);
        this.settingsMenu = new SettingsMenu(this);
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
        this.hudManager.update();
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

        this.screenManager?.destroy?.();
        this.toolManager?.destroy?.();
        this.cursorManager?.destroy?.();

        this.screenManager = null;
        this.toolManager = null;
        this.cursorManager = null;
    }
}
