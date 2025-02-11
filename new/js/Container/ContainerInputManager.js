class ContainerInputManager extends BaseInputHandler {
    constructor(containerManager) {
        super({
            owner: containerManager,
            element: containerManager.element,
            shortcuts: {
                's': () => this.setToolMode('SELECT'),
                'd': () => this.setToolMode('DRAG'),
                'p': () => this.setToolMode('PET'),
                'escape': () => this.handleEscape()
            }
        });

        this.container = containerManager;
    }

    handleClick(event) {
        super.handleClick(event);

        // Handle element click for active Myte
        if (this.container.activeMyte && 
            this.container.activeMyte.isActive && 
            this.container.ui.isTool(UIToolModes.SELECT) &&
            Utility.isNotIgnored(event.target) && 
            Utility.isClickableElement(event.target)) {
            this.container.ui.setSelected(event.target);
        }
    }

    handleEscape() {
        this.container.ui.setSelected(null);
        
        if (this.container.activeMyte?.queue.isCarrying()) {
            this.container.activeMyte.queue.addPutDownMyte();
        }
    }

    setToolMode(mode) {
        const toolMappings = {
            'SELECT': 'hand-select',
            'DRAG': 'hand-drag',
            'PET': 'hand-pet'
        };

        const radioInput = document.getElementById(toolMappings[mode]);
        if (radioInput) {
            radioInput.checked = true;
            radioInput.dispatchEvent(new Event('change'));
        }
    }
    
    // Get mouse position relative to container with camera offset
    getLocalMouse(element = null) {
        const mousePos = this.getMousePosition();
        const containerRect = this.container.getContainerRect();
        const cameraOffset = this.container.camera ? {
            x: this.container.camera.posX,
            y: this.container.camera.posY
        } : { x: 0, y: 0 };

        return {
            x: mousePos.x - containerRect.left - 
               (element ? (element.getRect().width / 2) : 0) - 
               cameraOffset.x,
            y: mousePos.y - containerRect.top - 
               (element ? (element.getRect().height / 2) : 0) - 
               cameraOffset.y
        };
    }

    // Get mouse position relative to container without camera offset
    getContainerMouse(element = null) {
        const mousePos = this.getMousePosition();
        const containerRect = this.container.getContainerRect();
        return {
            x: mousePos.x - (element ? (element.getRect().width / 2) : 0) - containerRect.left,
            y: mousePos.y - (element ? (element.getRect().height / 2) : 0) - containerRect.top
        };
    }








}