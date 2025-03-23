class ContainerManager {
    constructor(elementId, core) {
        this.core = core;
        this.mytes = [];

        this.element = document.getElementById(elementId);
        this.containerWrapper = this.element.closest('.container-wrapper');
        this.canvas = this.element.querySelector('.canvas');

        this.activeMyte = null;
        this.camera = null;

        // Systems and managers
        this.ui = new UserInterface(this);
        this.inputHandler = new ContainerInputManager(this);
        this.timeManager = new GameTime();  // Add time manager here

        // map
        this.gameMap;


        // inventory
        this.inventory = new Inventory(this, document.getElementById('inventory'));
        this.inventory.loadItems(this.core.user.items);

        this.transitionManager = new MapTransitionManager(this);

        this.settings = {
            limitMap: true,
            defaultMyteCamera: CAMERA_FOLLOW_MODES.CHARACTER
        }

    }
    // Update the init method in ContainerManager.js to set isInitialLoad flag
    async init() {
        try {
            console.log('[ContainerManager] Initializing');

            if (this.settings.limitMap) {
                this.element.classList.add('noScroll');
            }

            // Check for required DOM elements
            if (!this.element) {
                throw new Error('Container element is missing');
            }

            if (!this.canvas) {
                throw new Error('Canvas element is missing');
            }

            // Update loading status
            if (this.core && this.core.loadingManager) {
                this.core.loadingManager.setMessage("Initializing game environment...");
                this.core.loadingManager.updateStageProgress('container', 0.1);
            }

            // Initialize camera
            console.log('[ContainerManager] Initializing camera');
            this.camera = new Camera(this, this.canvas, this.element);

            // Ensure the input handler is initialized
            if (!this.inputHandler) {
                console.log('[ContainerManager] Initializing input handler');
                this.inputHandler = new ContainerInputManager(this);
            }


            // Set up inventory
            console.log('[ContainerManager] Initializing inventory');
            const inventoryElement = document.getElementById('inventory');
            if (!inventoryElement) {
                console.warn('[ContainerManager] Inventory element not found, creating placeholder');
                // Create placeholder if not found to prevent errors
                const placeholder = document.createElement('div');
                placeholder.id = 'inventory';
                document.body.appendChild(placeholder);
                this.inventory = new Inventory(this, placeholder);
            } else {
                this.inventory = new Inventory(this, inventoryElement);
            }

            this.inventory.loadItems(this.core.user?.items || []);

            if (this.core.user) {
                this.core.user.setInventory(this.inventory);
            }

            // Update loading progress
            if (this.core && this.core.loadingManager) {
                this.core.loadingManager.setMessage("Initializing Mytes...");
                this.core.loadingManager.updateStageProgress('container', 0.8);
            }

            // Set up mytes
            console.log('[ContainerManager] Setting up Mytes');
            this.setupMytes();





            // Initialize transition manager
            if (!this.transitionManager) {
                console.log('[ContainerManager] Initializing transition manager');
                this.transitionManager = new MapTransitionManager(this);
            }

            // Check if core exists
            if (!this.core) {
                throw new Error('Core reference is missing');
            }




            // Ensure the core has a mapLoader
            if (!this.core.mapLoader) {
                console.log("[ContainerManager] Creating a new GameMapLoader for core");
                this.core.mapLoader = new GameMapLoader(this.core);

                // Initialize the mapLoader if needed
                if (typeof this.core.mapLoader.init === 'function') {
                    await this.core.mapLoader.init();
                }
            }

            // Update loading progress
            if (this.core && this.core.loadingManager) {
                this.core.loadingManager.setMessage("Loading initial map...");
                this.core.loadingManager.updateStageProgress('container', 0.5);
            }

            console.log('[ContainerManager] Starting initial map transition');

            // Get the right map ID
            // Use the default or a dev map if configured
            const initialMapId = this.core.config?.initialMap || 'House';

            // Log to see what map we're trying to load
            console.log(`[ContainerManager] Loading initial map: ${initialMapId}`);

            // Load the initial map through the transition manager
            // Explicitly set isInitialLoad to true
            const initialMapLoaded = await this.transitionManager.startTransition({
                targetMap: initialMapId,
                targetSpawnPoint: 'default',
                message: `Welcome to ${initialMapId}!`,
                preserveCamera: true,
                isInitialLoad: true
            });

            if (!initialMapLoaded) {
                throw new Error(`Failed to load initial map: ${initialMapId}`);
            }

            console.log('[ContainerManager] Initial map loaded successfully');

            // Initialize UI
            console.log('[ContainerManager] Initializing UI');
            if (this.ui) {
                this.ui.init();
            } else {
                console.warn('[ContainerManager] UI not defined');
            }

            // Final loading update
            if (this.core && this.core.loadingManager) {
                this.core.loadingManager.updateStageProgress('container', 1.0);

                // Check if other systems are ready before completing
                if (this.core.loadingManager.stages.resources.progress >= 0.95 &&
                    this.core.loadingManager.stages.core.progress >= 0.95) {
                    this.core.loadingManager.completeLoading();
                }
            }

            console.log('[ContainerManager] Initialization completed successfully');
            return true;
        } catch (error) {
            console.error("[ContainerManager] Error initializing container:", error);

            // Show error in loading screen
            if (this.core && this.core.loadingManager) {
                this.core.loadingManager.setMessage("Error: " + error.message);
            }

            return false;
        }
    }

    // Update the loadMap method to explicitly set isInitialLoad to false
    async loadMap(mapId, options = {}) {
        return this.transitionManager.startTransition({
            targetMap: mapId,
            targetSpawnPoint: options.spawnPoint || 'default',
            duration: options.duration || 1000,
            message: options.message || `Traveling to ${mapId}...`,
            preserveCamera: options.preserveCamera !== false,
            isInitialLoad: false // Explicitly set to false for normal transitions
        });
    }


    // Input state accessors that delegate to inputHandler
    getLocalMouse(element = null) {
        return this.inputHandler.getLocalMouse(element);
    }

    getContainerMouse(element = null) {
        return this.inputHandler.getContainerMouse(element);
    }

    getPressDuration() {
        return this.inputHandler.getPressDuration();
    }

    isMousePressed() {
        return this.inputHandler.isPressed();
    }

    // Mouse position for compatibility with existing code
    get mousePosX() {
        return this.inputHandler.getMousePosition().x;
    }

    get mousePosY() {
        return this.inputHandler.getMousePosition().y;
    }

    // Activity tracking delegates to inputHandler
    set_last_active() {
        this.inputHandler.setLastActive();
    }

    updateUserActivity() {
        const statusChanged = this.inputHandler.checkInactive(this.core.config.inactiveTimeout);
        if (statusChanged) {
            console.log(`User is ${this.inputHandler.isUserActive() ? 'active' : 'inactive'}`);
        }
    }

    // Container-specific utility methods
    getZIndex(y, height) {
        let maxHeight = this.getMaxDimensions().height;
        return Math.floor(((y + height) / Math.max(maxHeight, 1)) * 100);
    }

    getMaxDimensions() {
        const container = this.getContainerRect();
        const canvas = this.getCanvasRect();

        return {
            width: this.camera?.isScrollable.x ? canvas.width : container.width,
            height: this.camera?.isScrollable.y ? canvas.height : container.height
        };
    }

    isMouseInContainer() {
        const mousePos = this.inputHandler.getMousePosition();
        return Utility.isIntersecting(
            mousePos.x,
            mousePos.y,
            this.getContainerRect()
        );
    }

    drawTargetDot() {
        const mouse = this.getLocalMouse();
        var cursorElement = this.element.querySelector('.cursor-dot');
        cursorElement.style.left = mouse.x + 'px';
        cursorElement.style.top = mouse.y + 'px';
    }

    getOffset(el) {
        let rect = el.getBoundingClientRect();
        var _x = window.scrollX;
        var _y = window.scrollY;

        while (el && !isNaN(el.offsetLeft) && !isNaN(el.offsetTop)) {
            _x += el.offsetLeft - el.scrollLeft;
            _y += el.offsetTop - el.scrollTop;
            el = el.offsetParent;
        }

        return {
            top: _y,
            left: _x,
            x: _x,
            y: _y,
            width: rect.width,
            height: rect.height,
            right: _x + rect.width,
            bottom: _y + rect.height
        };
    }

    getRect(z) {
        let rect = z.getBoundingClientRect();
        var left = rect.left + window.scrollX;
        var top = rect.top + window.scrollY;
        var width = rect.width;
        var height = rect.height;

        return {
            x: left,
            y: top,
            left: left,
            top: top,
            right: left + width,
            bottom: top + height,
            width: width,
            height: height,
        };
    }

    getCanvasRect() {
        let rect = this.getRect(this.canvas);
        var dimensions = Utility.findLargestChildDimensions(this.canvas);

        return {
            left: rect.left,
            top: rect.top,
            width: dimensions.width,
            height: dimensions.height
        };
    }

    getVisibleElements() {
        const allElements = document.getElementsByTagName('*');
        const visibleElements = [];
        const containerRect = this.getContainerRect();
        const canvasRect = this.getCanvasRect();

        for (let element of allElements) {
            if (this.canvas.contains(element)) {
                const elementRect = element.getBoundingClientRect();
                const relativeLeft = elementRect.left - canvasRect.left + this.camera.posX;
                const relativeTop = elementRect.top - canvasRect.top + this.camera.posY;

                if (
                    relativeLeft + elementRect.width > 0 &&
                    relativeLeft < containerRect.width &&
                    relativeTop + elementRect.height > 0 &&
                    relativeTop < containerRect.height
                ) {
                    continue;
                }
            }
            visibleElements.push(element);
        }

        return visibleElements;
    }

    getContainerRect() {
        return this.getRect(this.element);
    }

    getLocalOffset(el) {
        let rect = this.getOffset(el);
        let container = this.getContainerRect();

        rect.y -= container.top;
        rect.x -= container.left;

        return {
            x: rect.x,
            y: rect.y,
            left: rect.x,
            top: rect.y,
            right: rect.x + rect.width,
            bottom: rect.y + rect.height,
            width: rect.width,
            height: rect.height
        };
    }

    // Myte management methods
    setupMytes() {
        this.element.querySelectorAll('.myteWrapper').forEach(container => {
            const wrapper = container; // container.querySelector('.myteWrapper');
            const wrapperId = wrapper.id;
            const idNumber = wrapperId.split('-')[1];

            let myte = new Myte(idNumber, this, wrapper.querySelector('.interactive-myte'));
            myte.init();
            this.mytes.push(myte);
        });
    }

    setNextMyteAsActive(previous) {
        let next = null;

        if (this.mytes.length > 1) {
            for (let i = 0; i < this.mytes.length; i++) {
                let myte = this.mytes[i];
                if (myte != previous && myte.isActive) {
                    next = myte;
                    break;
                }
            }
        }

        if (next === null) {
            this.camera.setMode(CAMERA_FOLLOW_MODES.CURSOR_EDGE);
        }

        this.setActiveMyte(next);
    }

    // Add to ContainerManager class
    checkCollision(entityA, entityB) {
        // Handle different collider types
        if (entityA.collider?.type === 'circle' && entityB.collider?.type === 'circle') {
            return this.checkCircleCollision(entityA, entityB);
        } else if (entityA.collider?.type === 'circle' || entityB.collider?.type === 'circle') {
            return this.checkCircleBoxCollision(
                entityA.collider?.type === 'circle' ? entityA : entityB,
                entityA.collider?.type === 'circle' ? entityB : entityA
            );
        } else {
            // Default to box collision
            return this.checkBoxCollision(entityA, entityB);
        }
    }

    handleCollision(entityA, entityB) {
        // Notify both entities of the collision
        if (entityA.onCollision) entityA.onCollision(entityB);
        if (entityB.onCollision) entityB.onCollision(entityA);

        // Emit event for other systems
        this.core.eventManager.emit('collision', {
            entityA,
            entityB
        });
    }

    getColliderBounds(entity) {
        return {
            left: entity.posX + (entity.collider?.offsetX || 0),
            top: entity.posY + (entity.collider?.offsetY || 0),
            right: entity.posX + (entity.collider?.offsetX || 0) + (entity.collider?.width || entity.size.width),
            bottom: entity.posY + (entity.collider?.offsetY || 0) + (entity.collider?.height || entity.size.height)
        };
    }


    // Box-to-box collision check
    checkBoxCollision(entityA, entityB) {
        const boundsA = this.getColliderBounds(entityA);
        const boundsB = this.getColliderBounds(entityB);

        return !(
            boundsA.right < boundsB.left ||
            boundsA.left > boundsB.right ||
            boundsA.bottom < boundsB.top ||
            boundsA.top > boundsB.bottom
        );
    }

    // Circle-to-circle collision check
    checkCircleCollision(entityA, entityB) {
        // Get circle centers
        const centerA = {
            x: entityA.posX + (entityA.collider.offsetX || 0) + (entityA.collider.width / 2),
            y: entityA.posY + (entityA.collider.offsetY || 0) + (entityA.collider.width / 2)
        };

        const centerB = {
            x: entityB.posX + (entityB.collider.offsetX || 0) + (entityB.collider.width / 2),
            y: entityB.posY + (entityB.collider.offsetY || 0) + (entityB.collider.width / 2)
        };

        // Get radii
        const radiusA = entityA.collider.width / 2;
        const radiusB = entityB.collider.width / 2;

        // Check distance between centers versus sum of radii
        const dx = centerA.x - centerB.x;
        const dy = centerA.y - centerB.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        return distance < (radiusA + radiusB);
    }

    // Circle-to-box collision check
    checkCircleBoxCollision(circleEntity, boxEntity) {
        // Get circle center and radius
        const center = {
            x: circleEntity.posX + (circleEntity.collider.offsetX || 0) + (circleEntity.collider.width / 2),
            y: circleEntity.posY + (circleEntity.collider.offsetY || 0) + (circleEntity.collider.width / 2)
        };
        const radius = circleEntity.collider.width / 2;

        // Get box bounds
        const box = this.getColliderBounds(boxEntity);

        // Find closest point on box to circle center
        const closestX = Math.max(box.left, Math.min(center.x, box.right));
        const closestY = Math.max(box.top, Math.min(center.y, box.bottom));

        // Calculate distance between closest point and circle center
        const dx = closestX - center.x;
        const dy = closestY - center.y;
        const distanceSquared = dx * dx + dy * dy;

        return distanceSquared <= (radius * radius);
    }

    // Add to checkBoxCollision
    checkBoxCollision(entityA, entityB, options = {}) {
        const boundsA = this.getColliderBounds(entityA);
        const boundsB = this.getColliderBounds(entityB);

        // Basic collision check
        const isColliding = !(
            boundsA.right < boundsB.left ||
            boundsA.left > boundsB.right ||
            boundsA.bottom < boundsB.top ||
            boundsA.top > boundsB.bottom
        );

        // Handle one-way platforms
        if (isColliding && entityB.config?.oneWayPlatform) {
            // Only collide if entityA is above entityB and moving downward
            const isAbove = entityA.posY + entityA.size.height <= entityB.posY + 5; // Small tolerance
            const isMovingDown = entityA.velocity > 0;

            return isAbove && isMovingDown;
        }

        return isColliding;
    }


    // Add to checkBoxCollision
    checkBoxCollision(entityA, entityB, options = {}) {
        const boundsA = this.getColliderBounds(entityA);
        const boundsB = this.getColliderBounds(entityB);

        // Basic collision check
        const isColliding = !(
            boundsA.right < boundsB.left ||
            boundsA.left > boundsB.right ||
            boundsA.bottom < boundsB.top ||
            boundsA.top > boundsB.bottom
        );

        // Handle one-way platforms
        if (isColliding && entityB.config?.oneWayPlatform) {
            // Only collide if entityA is above entityB and moving downward
            const isAbove = entityA.posY + entityA.size.height <= entityB.posY + 5; // Small tolerance
            const isMovingDown = entityA.velocity > 0;

            return isAbove && isMovingDown;
        }

        return isColliding;
    }






    setActiveMyte(myte) {
        if (this.activeMyte && myte !== null) {
            this.activeMyte.duplicate.classList.remove('active');
        }

        this.activeMyte = myte;

        this.camera.setMode(this.settings.defaultMyteCamera);


        if (myte !== null) {
            myte.duplicate.classList.add('active');
            myte.setStartTime();
            this.ui.updateHud();
        }

        // Set other mytes to free roam
        this.mytes.forEach(m => {
            if (m != this.activeMyte) {
                m.setMode(MOVE_TYPES.FREEROAM);
            }
        });

        if (myte && !myte.isActive) {
            myte.start();
        }

        // Update mytes list
        const listContainer = document.getElementById('all_mytes');
        listContainer.querySelectorAll('.myte-thumbnail').forEach(thumbnail => {
            thumbnail.classList.remove('active');
        });

        if (myte) {
            listContainer.querySelector(`[data-myte-id="${myte.id}"]`).classList.add('active');
        }

        // Update UI
        this.ui.debugMenu.updateButtons();
        this.ui.setSelected(null);
    }

    update(deltaTime) {
        this.drawTargetDot();
        this.updateUserActivity();

        this.timeManager.update(deltaTime);  // Add time manager update

        // Update components
        this.mytes.forEach(myte => {
            if (myte.isActive) {
                myte.update(deltaTime);
            }
        });

        if (this.camera) this.camera.update();
        if (this.ui) this.ui.update();
        if (this.gameMap) this.gameMap.update();
    }

    tickUpdate(tickDelta) {
    }



    dispose() {
        this.mytes.forEach(myte => myte.dispose());
        this.mytes = [];
        this.activeMyte = null;

        if (this.camera) {
            this.camera.dispose();
            this.camera = null;
        }

        if (this.ui) {
            this.ui.dispose();
            this.ui = null;
        }

        if (this.gameMap) {
            this.gameMap.dispose();
            this.gameMap = null;
        }

        if (this.inputHandler) {
            this.inputHandler.dispose();
            this.inputHandler = null;
        }

        if (this.transitionManager) {
            this.transitionManager.dispose();
            this.transitionManager = null;
        }



    }
}