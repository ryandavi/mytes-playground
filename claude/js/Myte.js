class Myte {
    constructor(id, container, element) {
        this.id = id;
        this.container = container;
        this.element = element;
        
        // Get name from data attribute (support both formats)
        this.name = element.dataset.myteName || element.dataset.myteName || 
                    element.getAttribute('data-myte-name') || `Myte ${id}`;
        
        this.isActive = false;
        this.isDragging = false;
        
        // Core properties
        this.width = 192;
        this.height = 192;
        this.followRadius = {
            min: this.width / 2,
            max: this.width * 2
        };

        // Initialize subsystems
        this.movement = new MyteMovement(this);
        this.animation = new MyteAnimation(this);
        this.ai = new MyteAI(this);
        this.queue = new MyteQueue(this);

        // State
        this.currentMode = this.container.core.config.defaultMode;
        this.previousMode = this.currentMode;
        this.followMode = this.container.core.config.defaultFollowMode;
        this.direction = DIRECTION.SOUTH;
        this.limitToContainer = false;
        
        // Elements
        this.duplicate = null;
        this.sprite = null;
        this.collider = null;
        this.targetIndicator = null;
        this.dropTarget = null;
        
        this.initializeElements();
    }

    initializeElements() {
        // Clone the original element for the active version
        this.duplicate = this.element.cloneNode(true);
        this.duplicate.classList.add("freemode", "duplicate");
        this.duplicate.id = `duplicate-${this.id}`;
        this.element.parentNode.insertBefore(this.duplicate, this.element.nextSibling);

        // Get references to important elements
        this.sprite = this.duplicate.querySelector('.sprite');
        this.collider = this.duplicate.querySelector('.collidebox');
        this.nameElement = this.duplicate.querySelector('.name');
        this.dropTarget = this.element.closest(".myteWrapper");

        // Create target indicator
        this.createTargetIndicator();

        // Initial setup
        this.element.classList.add("deactivated");
        this.duplicate.classList.add("deactivated");
        
        // Set initial position
        const rect = this.container.getLocalOffset(this.element);
        this.movement.position.x = rect.x;
        this.movement.position.y = rect.y;
        this.movement.target = { ...this.movement.position };
        this.updateSpritePosition();

        // Initialize event listeners
        this.initializeEventListeners();
    }

    createTargetIndicator() {
        this.targetIndicator = document.createElement('div');
        this.targetIndicator.className = 'ignore dot target debug hidden';
        this.targetIndicator.id = `target-dot-${this.id}`;
        this.targetIndicator.dataset.name = this.name;
        
        const controlsLayer = this.container.canvas.querySelector('.layer.controls');
        if (controlsLayer) {
            controlsLayer.appendChild(this.targetIndicator);
        }
    }

    initializeEventListeners() {
        // Click handlers for original element
        this.element.addEventListener("click", (e) => {
            e.stopPropagation();
            if (!this.isActive) {
                this.activate();
                this.container.setActiveMyte(this);
            }
        });

        // Click handlers for duplicate
        this.duplicate.addEventListener("click", (e) => {
            e.stopPropagation();
            if (!this.isActive) {
                this.container.setActiveMyte(this);
            } else if (!this.isDragging && this.container.core.eventManager.pressDuration < 100) {
                this.setMode(MOVE_TYPES.GOHOME);
            }
        });

        // Drag handlers
        this.duplicate.addEventListener("mousedown", this.handleDragStart.bind(this));
        
        // Home click handler
        this.dropTarget.addEventListener("click", () => {
            if (this.isActive) {
                this.setMode(MOVE_TYPES.GOHOME);
            }
        });
    }

    activate() {
        this.isActive = true;
        this.element.classList.add("deactivated");
        this.duplicate.classList.remove("deactivated");
        this.targetIndicator.classList.remove("hidden");
        this.element.closest('.myteContainer').classList.add('empty');
        
        this.setMode(this.currentMode);
        this.setFollowMode(this.followMode);
    }

    deactivate() {
        this.isActive = false;
        this.element.classList.remove("deactivated");
        this.duplicate.classList.add("deactivated");
        this.targetIndicator.classList.add("hidden");
        this.element.closest('.myteContainer').classList.remove('empty');
        
        this.queue.clear();
        this.isDragging = false;
    }

    setMode(mode) {
        if (mode === this.currentMode) return;
        
        this.previousMode = this.currentMode;
        this.currentMode = mode;
        this.queue.clear();
        
        switch (mode) {
            case MOVE_TYPES.FOLLOW:
                this.movement.target = { ...this.movement.position };
                break;
            case MOVE_TYPES.FREEROAM:
                this.ai.decideFreeRoamAction();
                break;
            case MOVE_TYPES.GOHOME:
                const homeRect = this.container.getLocalOffset(this.element);
                this.movement.target = { x: homeRect.x, y: homeRect.y };
                break;
        }
    }

    setFollowMode(mode) {
        this.followMode = mode;
    }

    handleDragStart(e) {
        if (!this.isActive || this.isDragging) return;
        
        this.isDragging = true;
        this.container.camera.setMode(CAMERA_FOLLOW_MODES.CHARACTER);
        
        const initialMousePos = this.container.getLocalMousePosition();
        const offsetX = initialMousePos.x - this.movement.position.x;
        const offsetY = initialMousePos.y - this.movement.position.y;

        const handleDrag = (e) => {
            const mousePos = this.container.getLocalMousePosition();
            this.movement.position.x = mousePos.x - offsetX;
            this.movement.position.y = mousePos.y - offsetY;
            this.updateSpritePosition();
        };

        const handleDragEnd = () => {
            this.isDragging = false;
            this.container.camera.restorePreviousMode();
            document.removeEventListener('mousemove', handleDrag);
            document.removeEventListener('mouseup', handleDragEnd);
            
            // Check if dropped on home
            if (this.isOverDropTarget()) {
                this.deactivate();
            }
        };

        document.addEventListener('mousemove', handleDrag);
        document.addEventListener('mouseup', handleDragEnd);
        
        this.targetIndicator.classList.add('hidden');
        e.preventDefault();
    }

    isOverDropTarget() {
        const dropTargetRect = this.container.getLocalOffset(this.dropTarget);
        const mousePos = this.container.getLocalMousePosition();
        
        return mousePos.x >= dropTargetRect.x && 
               mousePos.x <= dropTargetRect.x + dropTargetRect.width &&
               mousePos.y >= dropTargetRect.y && 
               mousePos.y <= dropTargetRect.y + dropTargetRect.height;
    }

    updateSpritePosition() {
        const x = this.movement.position.x;
        const y = this.movement.position.y;
        
        // Apply position limits if needed
        let limitedX = x;
        let limitedY = y;
        
        if (this.limitToContainer) {
            const containerRect = this.container.getContainerRect();
            limitedX = Math.max(0, Math.min(x, containerRect.width - this.width));
            limitedY = Math.max(0, Math.min(y, containerRect.height - this.height));
        }

        this.duplicate.style.left = `${limitedX}px`;
        this.duplicate.style.top = `${limitedY}px`;
        
        // Update z-index based on vertical position
        this.duplicate.style.zIndex = this.container.getZIndex(limitedY, this.height);

        // Update target indicator
        if (!this.isDragging && this.targetIndicator) {
            this.targetIndicator.style.left = `${this.movement.target.x + this.width / 2}px`;
            this.targetIndicator.style.top = `${this.movement.target.y + this.height / 2}px`;
        }
    }

    getRect() {
        return this.container.getRect(this.duplicate);
    }

    update(deltaTime) {
        if (!this.isActive) return;

        // Update subsystems
        this.movement.update(deltaTime);
        this.animation.update(deltaTime);
        this.ai.update(deltaTime);
        
        // Process queue if not dragging
        if (!this.isDragging && !this.queue.isEmpty()) {
            this.queue.update(deltaTime);
        }
    }

    dispose() {
        // Clean up elements
        this.targetIndicator?.remove();
        this.duplicate?.remove();
        
        // Clean up references
        this.movement = null;
        this.animation = null;
        this.ai = null;
        this.queue = null;
    }
}