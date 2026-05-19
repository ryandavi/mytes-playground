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
        this.userIsActive = true;

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
            this.camera.limitToBounds = this.settings.limitMap;

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

            // Set up mytes
            console.log('[ContainerManager] Setting up Mytes');
            await this.setupMytes();



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

    get mapArea() {
        return this.gameMap;
    }

    get soundManager() {
        return this.core?.soundManager || null;
    }

    get eventManager() {
        return this.core?.eventManager || null;
    }


    // Input state accessors that delegate to inputHandler
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
    setLastActive() {
        this.inputHandler.setLastActive();
    }

    updateUserActivity() {
        const statusChanged = this.inputHandler.checkInactive(this.core.config.inactiveTimeout);
        if (statusChanged) {
            if (this.inputHandler.isUserActive()) {
                this.handleUserActive();
            } else {
                this.handleUserInactive();
            }
        }
    }

    handleUserActive() {
        if (this.userIsActive) return;
        this.userIsActive = true;
        this.element?.classList.remove('user-inactive');
        this.eventManager?.emit?.('user_activity_changed', { active: true });
    }

    handleUserInactive() {
        if (!this.userIsActive) return;
        this.userIsActive = false;
        this.element?.classList.add('user-inactive');
        this.eventManager?.emit?.('user_activity_changed', { active: false });
    }

    // Container-specific utility methods
    getZIndex(y, height) {
        let maxHeight = this.getMaxDimensions().height;
        // Consider zoom in this calculation if needed
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
        if (!Utility.isIntersecting(
            mousePos.x,
            mousePos.y,
            this.getContainerRect()
        )) {
            return false;
        }

        const mouseState = this.inputHandler?.inputSystem?.state?.mouse;
        const clientX = mouseState?.clientX ?? (mousePos.x - window.scrollX);
        const clientY = mouseState?.clientY ?? (mousePos.y - window.scrollY);
        const hoveredElement = document.elementFromPoint(clientX, clientY);

        if (!hoveredElement || !this.element.contains(hoveredElement)) {
            return false;
        }

        if (!this.camera || !this.inputHandler) {
            return true;
        }

        const world = this.inputHandler.screenToWorldCoordinates(mousePos.x, mousePos.y);
        const canvasRect = this.getCanvasRect();

        return world.x >= 0 &&
            world.y >= 0 &&
            world.x <= canvasRect.width &&
            world.y <= canvasRect.height;
    }

    drawTargetDot() {
        const cursorElement = this.element.querySelector('.cursor-dot');
        if (!cursorElement) return;

        // This debug dot represents the raw screen-space pointer position.
        // Keep it visible alongside the world-space goal/grid markers, but only
        // while the pointer is actually over the container.
        if (!this.isMouseInContainer()) {
            cursorElement.classList.add('hidden');
            return;
        }

        cursorElement.classList.remove('hidden');

        const world = this.inputHandler.getMouseWorldPosition();
        cursorElement.style.left = world.x + 'px';
        cursorElement.style.top = world.y + 'px';
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
        const configuredWidth = Number.isFinite(this.gameMap?.dimensions?.width)
            ? this.gameMap.dimensions.width
            : Number.parseFloat(this.canvas.style.width);
        const configuredHeight = Number.isFinite(this.gameMap?.dimensions?.height)
            ? this.gameMap.dimensions.height
            : Number.parseFloat(this.canvas.style.height);

        const fallbackWidth = Math.max(
            this.canvas.scrollWidth || 0,
            this.canvas.clientWidth || 0,
            ...Array.from(this.canvas.children || []).map(child =>
                Math.max(child.scrollWidth || 0, child.offsetWidth || 0)
            )
        );
        const fallbackHeight = Math.max(
            this.canvas.scrollHeight || 0,
            this.canvas.clientHeight || 0,
            ...Array.from(this.canvas.children || []).map(child =>
                Math.max(child.scrollHeight || 0, child.offsetHeight || 0)
            )
        );

        const contentWidth = Number.isFinite(configuredWidth) && configuredWidth > 0
            ? configuredWidth
            : fallbackWidth;
        const contentHeight = Number.isFinite(configuredHeight) && configuredHeight > 0
            ? configuredHeight
            : fallbackHeight;

        return {
            left: rect.left,
            top: rect.top,
            width: contentWidth,
            height: contentHeight
        };
    }

    getWorldBounds() {
        const canvasRect = this.getCanvasRect();
        return {
            left: 0,
            top: 0,
            right: canvasRect.width,
            bottom: canvasRect.height,
            width: canvasRect.width,
            height: canvasRect.height
        };
    }

    getEntityBoundsAt(entity, x = 0, y = 0, options = {}) {
        const useCollider = options.useCollider !== false && !!entity?.collider;
        const collider = entity?.collider || {};
        const rect = options.rect || entity?.getOffsetRect?.() || entity?.getRect?.() || entity?.size || {
            width: 0,
            height: 0
        };

        const offsetX = useCollider ? (collider.offsetX ?? 0) : 0;
        const offsetY = useCollider ? (collider.offsetY ?? 0) : 0;
        const width = useCollider ? (collider.width ?? rect.width ?? 0) : (rect.width ?? entity?.size?.width ?? 0);
        const height = useCollider ? (collider.height ?? rect.height ?? 0) : (rect.height ?? entity?.size?.height ?? 0);

        return {
            left: x + offsetX,
            top: y + offsetY,
            right: x + offsetX + width,
            bottom: y + offsetY + height,
            width,
            height,
            offsetX,
            offsetY
        };
    }

    clampEntityPosition(entity, x = 0, y = 0, options = {}) {
        const worldBounds = options.bounds || this.getWorldBounds();
        const entityBounds = this.getEntityBoundsAt(entity, x, y, options);

        return {
            x: Math.max(
                worldBounds.left - entityBounds.offsetX,
                Math.min(x, worldBounds.right - entityBounds.offsetX - entityBounds.width)
            ),
            y: Math.max(
                worldBounds.top - entityBounds.offsetY,
                Math.min(y, worldBounds.bottom - entityBounds.offsetY - entityBounds.height)
            )
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
    async setupMytes() {
        const wrappers = this.element.querySelectorAll('.myteWrapper');

        if (wrappers.length === 0) {
            throw new Error("No Myte elements found.");
        }

        await MyteDefinitionRegistry.preload();
        
        wrappers.forEach(container => {
            const wrapper = container;
            const wrapperId = wrapper.id;
            const idNumber = wrapperId.split('-')[1];
            const interactiveElement = wrapper.querySelector('.interactive-myte');
            const speciesId = interactiveElement?.dataset?.myteSpecies || wrapper.dataset?.myteSpecies || 'snail';
            const definition = MyteDefinitionRegistry.getSpeciesSync(speciesId);
        
            // create myte
            let myte = new Myte(idNumber, this, interactiveElement, definition);
            myte.init();
            this.mytes.push(myte);
        });



        // set spawn position for first


        const myteSpawn = this.gameMap.spawnPoints.get("myte");

        if (this.mytes.length > 0 && myteSpawn) {
            this.mytes[0].setWrapperPosition(myteSpawn.x, myteSpawn.y);
        }
        



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

        this.setActiveMyte(next);
    }

    checkCollision(entityA, entityB) {
        return this.checkBoxCollision(entityA, entityB);
    }

    handleCollision(entityA, entityB) {
        if (entityA.onCollision) entityA.onCollision(entityB);
        if (entityB.onCollision) entityB.onCollision(entityA);
        this.core.eventManager.emit('collision', { entityA, entityB });
    }

    getColliderBounds(entity) {
        return {
            left: entity.posX + (entity.collider?.offsetX || 0),
            top: entity.posY + (entity.collider?.offsetY || 0),
            right: entity.posX + (entity.collider?.offsetX || 0) + (entity.collider?.width || entity.size.width),
            bottom: entity.posY + (entity.collider?.offsetY || 0) + (entity.collider?.height || entity.size.height)
        };
    }

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

        //  add active if myte isnt null
        if (myte !== null) {
            myte.duplicate.classList.add('active');
            myte.setStartTime();
            this.ui.hudManager.update();
        }

        // Set other mytes to free roam
        this.mytes.forEach(m => {
            if (m != this.activeMyte) {
                m.setMode(MOVE_TYPES.FREEROAM);
            }
        });

        // start it if it's not active
        if (myte && !myte.isActive) {
            myte.start();
        }

        this.ui.myteListManager.updateMytesList(myte);
        this.ui.debugMenu.updateButtons();
        this.ui.setSelected(null);

        this.eventManager?.emit('container:active_myte_changed', { myte });
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
        if (this.gameMap) this.gameMap.update(deltaTime);
    }

    tickUpdate(tickDelta) {
        // Fixed-rate gameplay logic for all systems
        if (this.gameMap) this.gameMap.tickUpdate(tickDelta);

        this.mytes.forEach(myte => {
            if (myte.isActive && myte.tickUpdate) {
                myte.tickUpdate(tickDelta);
            }
        });

        if (this.timeManager) this.timeManager.tickUpdate?.(tickDelta);
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
