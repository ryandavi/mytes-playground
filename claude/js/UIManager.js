class UIManager {
    constructor(container) {
        this.container = container;
        this.isActive = false;
        this.debug = new DebugManager(this);
        this.cursorManager = new CursorManager(this);
        this.buttons = new Map();
        this.tooltips = new Map();
    }

    init() {
        this.initializeButtons();
        this.initializeTooltips();
        this.setupEventListeners();
    }

    initializeButtons() {
        // Mode cycling buttons
        this.createButton("cycleFollowGoal", () => {
            if (!this.container.activeMyte?.isActive) return;
            const next = this.getNextValue(
                this.container.activeMyte.followMode,
                MOVE_FOLLOW_TYPES
            );
            this.container.activeMyte.setFollowMode(next);
        });

        this.createButton("cycleGoal", () => {
            if (!this.container.activeMyte?.isActive) return;
            const next = this.getNextValue(
                this.container.activeMyte.currentMode,
                MOVE_TYPES
            );
            this.container.activeMyte.setMode(next);
        });

        this.createButton("skipQueue", () => {
            if (!this.container.activeMyte?.isActive) return;
            this.container.activeMyte.queue.clear();
            this.container.activeMyte.movement.target = { ...this.container.activeMyte.movement.position };
        });

        this.createButton("cycleCamera", () => {
            const next = this.getNextValue(
                this.container.camera.mode,
                CAMERA_FOLLOW_MODES
            );
            this.container.camera.setMode(next);
        });

        this.createButton("toggleDebug", () => {
            document.body.classList.toggle('debug');
            this.updateDebugButton();
        });

        this.createButton("cycleContainerLimit", () => {
            if (!this.container.activeMyte) return;
            this.container.activeMyte.limitToContainer = !this.container.activeMyte.limitToContainer;
            this.updateContainerLimitButton();
            this.updateCameraScrolling();
        });
    }

    createButton(id, clickHandler) {
        const button = document.getElementById(id);
        if (!button) return;

        this.buttons.set(id, {
            element: button,
            clickHandler: clickHandler
        });

        button.addEventListener("click", clickHandler);
    }

    initializeTooltips() {
        document.querySelectorAll('[data-tooltip]').forEach(element => {
            const tooltip = new Tooltip(element);
            this.tooltips.set(element, tooltip);
        });
    }

    setupEventListeners() {
        // Global event listeners
        document.addEventListener('mousemove', this.handleMouseMove.bind(this));
        document.addEventListener('keydown', this.handleKeyPress.bind(this));
    }

    handleMouseMove(event) {
        this.cursorManager.updatePosition(event.clientX, event.clientY);
        this.tooltips.forEach(tooltip => tooltip.update(event));
    }

    handleKeyPress(event) {
        // Handle keyboard shortcuts
        switch (event.key.toLowerCase()) {
            case 'd':
                if (event.ctrlKey) {
                    document.body.classList.toggle('debug');
                    this.updateDebugButton();
                    event.preventDefault();
                }
                break;
            case 'escape':
                if (this.container.activeMyte) {
                    this.container.activeMyte.queue.clear();
                }
                break;
        }
    }

    enableButtons() {
        this.isActive = true;
        this.buttons.forEach(({ element }) => {
            if (element.classList.contains('myte')) {
                element.disabled = false;
            }
        });
    }

    disableButtons() {
        this.isActive = false;
        this.buttons.forEach(({ element }) => {
            if (element.classList.contains('myte')) {
                element.disabled = true;
            }
        });
    }

    updateButtonText(buttonId, text) {
        const button = this.buttons.get(buttonId)?.element;
        if (button) {
            button.textContent = text;
        }
    }

    updateFollowModeButton() {
        const myte = this.container.activeMyte;
        const modeKey = myte ? 
            this.getKeyByValue(MOVE_FOLLOW_TYPES, myte.followMode) : 
            "None";
        this.updateButtonText("cycleFollowGoal", `Follow Mode: ${modeKey}`);
    }

    updateGoalButton() {
        const myte = this.container.activeMyte;
        const modeKey = myte ? 
            this.getKeyByValue(MOVE_TYPES, myte.currentMode) : 
            "None";
        this.updateButtonText("cycleGoal", `Goal: ${modeKey}`);
    }

    updateDebugButton() {
        const isDebug = document.body.classList.contains('debug');
        this.updateButtonText("toggleDebug", `Debug: ${isDebug ? "ON" : "OFF"}`);
    }

    updateCameraButton() {
        const modeKey = this.getKeyByValue(CAMERA_FOLLOW_MODES, this.container.camera.mode);
        this.updateButtonText("cycleCamera", `Camera: ${modeKey}`);
    }

    updateContainerLimitButton() {
        const myte = this.container.activeMyte;
        const text = myte ? 
            `Limit: ${myte.limitToContainer ? "ON" : "OFF"}` : 
            "Limit: None";
        this.updateButtonText("cycleContainerLimit", text);
    }

    updateCameraScrolling() {
        const myte = this.container.activeMyte;
        if (!myte) return;

        const camera = this.container.camera;
        if (myte.limitToContainer) {
            camera.isScrollable.x = true;
            camera.isScrollable.y = true;
            this.container.element.closest('.container').classList.remove('noScroll');
        } else {
            camera.isScrollable.x = false;
            camera.isScrollable.y = false;
            this.container.element.closest('.container').classList.add('noScroll');
            camera.reset();
        }
    }

    update() {
        if (!this.container.activeMyte && this.isActive) {
            this.disableButtons();
        } else if (this.container.activeMyte && !this.isActive) {
            this.enableButtons();
        }

        this.updateAllButtons();
        this.debug.update();
        this.cursorManager.update();
    }

    updateAllButtons() {
        this.updateFollowModeButton();
        this.updateGoalButton();
        this.updateDebugButton();
        this.updateCameraButton();
        this.updateContainerLimitButton();
    }

    // Utility methods
    getNextValue(currentValue, enumObject) {
        const keys = Object.keys(enumObject);
        const currentIndex = keys.findIndex(key => enumObject[key] === currentValue);
        const nextIndex = (currentIndex + 1) % keys.length;
        return enumObject[keys[nextIndex]];
    }

    getKeyByValue(enumObject, value) {
        return Object.keys(enumObject).find(key => enumObject[key] === value) || "None";
    }
}

class Tooltip {
    constructor(element) {
        this.element = element;
        this.tooltip = this.createTooltipElement();
        this.showing = false;
        this.hideTimeout = null;
    }

    createTooltipElement() {
        const tooltip = document.createElement('div');
        tooltip.classList.add('tooltip');
        tooltip.textContent = this.element.dataset.tooltip;
        document.body.appendChild(tooltip);
        return tooltip;
    }

    show(x, y) {
        if (this.hideTimeout) {
            clearTimeout(this.hideTimeout);
        }

        this.tooltip.style.left = `${x}px`;
        this.tooltip.style.top = `${y}px`;
        this.tooltip.classList.add('visible');
        this.showing = true;
    }

    hide() {
        if (this.showing) {
            this.hideTimeout = setTimeout(() => {
                this.tooltip.classList.remove('visible');
                this.showing = false;
            }, 100);
        }
    }

    update(event) {
        const bounds = this.element.getBoundingClientRect();
        const isOver = event.clientX >= bounds.left && 
                      event.clientX <= bounds.right && 
                      event.clientY >= bounds.top && 
                      event.clientY <= bounds.bottom;

        if (isOver) {
            this.show(event.clientX + 10, event.clientY + 10);
        } else {
            this.hide();
        }
    }
}

class CursorManager {
    constructor(ui) {
        this.ui = ui;
        this.currentState = DEFAULT_CURSOR;
        this.element = document.getElementById('customCursor');
        this.position = { x: 0, y: 0 };
        
        document.addEventListener('mousemove', this.updatePosition.bind(this));
    }

    updatePosition(x, y) {
        this.position.x = x;
        this.position.y = y;
        if (this.element) {
            this.element.style.left = `${x}px`;
            this.element.style.top = `${y}px`;
        }
    }

    setCursor(cursorType) {
        this.currentState = cursorType;
        
        if (!this.element) return;

        const cursorMap = {
            [CURSOR.POINTER]: 'pointer.png',
            [CURSOR.GRAB]: 'grab.png',
            [CURSOR.GRABBING]: 'grabbing.png',
            [CURSOR.ARROW_UP]: 'arrow_up.png',
            [CURSOR.ARROW_DOWN]: 'arrow_down.png',
            [CURSOR.ARROW_LEFT]: 'arrow_left.png',
            [CURSOR.ARROW_RIGHT]: 'arrow_right.png',
            [CURSOR.MOVE]: 'move.png',
            [CURSOR.NO]: 'no.png'
        };

        const cursorImage = cursorMap[cursorType];
        if (cursorImage) {
            this.element.style.backgroundImage = `url('cursors/${cursorImage}')`;
        }
    }

    update() {
        if (!this.element) return;

        const isClicking = this.ui.container.core.eventManager.isMouseDown;
        const hasClickingClass = this.element.classList.contains('clicking');

        if (isClicking && !hasClickingClass) {
            this.element.classList.add('clicking');
        } else if (!isClicking && hasClickingClass) {
            this.element.classList.remove('clicking');
        }
    }
}