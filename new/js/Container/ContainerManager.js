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
        this.inputHandler = new ContainerInputManager(this);
        this.ui = new UserInterface(this);
        this.timeManager = new GameTime();  // Add time manager here

        // map
        this.gameMap;
        this.particleSystem = new ParticleSystem(this); // Add this line

        // inventory
        this.inventory = new Inventory(this, document.getElementById('inventory'));
        this.inventory.loadItems(this.core.user.items);
    }



    // ContainerManager.js - Modified init() method
    async init() {
        try {
            // Load map data
            const response = await fetch('data/maps/home.json');
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const mapData = await response.json();



            // Initialize other components that depend on the map
            this.setupMytes();
            this.inputHandler.init();
            this.camera = new Camera(this, this.canvas, this.element);

            // Initialize game map with the loaded data
            this.gameMap = new GameMap(this, mapData);
            await this.gameMap.initialize();

            // Initialize UI and other subsystems
            this.ui.init();

            // Set up inventory
            this.core.user.setInventory(this.inventory);

            return true;
        } catch (error) {
            console.error('Error initializing container:', error);

            return false;
        }
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
        // var dimensions = Utility.findLargestChildDimensions(this.canvas);

        return rect; /* {
            left: rect.left,
            top: rect.top,
            width: dimensions.width,
            height: dimensions.height
        }; */
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
        this.element.querySelectorAll('.myteContainer').forEach(container => {
            const wrapper = container.querySelector('.myteWrapper');
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

    setActiveMyte(myte) {
        if (this.activeMyte && myte !== null) {
            this.activeMyte.duplicate.classList.remove('active');
        }

        this.activeMyte = myte;

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
        this.ui.updateButtons();
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
        if (this.particleSystem) this.particleSystem.update(); // Add this line
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

        if (this.particleSystem) {  // Add these lines
            this.particleSystem.dispose();
            this.particleSystem = null;
        }

    }
}