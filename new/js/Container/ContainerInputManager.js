class ContainerInputManager extends BaseInputHandler {
    constructor(containerManager) {
        // Create shortcuts using the tool config
        const shortcuts = {};

        console.log(containerManager);
        
        // Add shortcuts from tool config
        Object.entries(containerManager.ui.toolConfig).forEach(([mode, config]) => {
            if (config.shortcut) {
                shortcuts[config.shortcut] = () => containerManager.ui.changeToolMode(mode);
            }
        });
        
        // Add escape shortcut
        shortcuts['escape'] = () => this.handleEscape();
        shortcuts['m'] = () => containerManager.ui.sound.toggleSounds();
        
        super({
            owner: containerManager,
            element: containerManager.element,
            shortcuts: shortcuts
        });

        this.parent = containerManager;
    }



    // Keep all your other methods unchanged
    handleClick(event) {
        super.handleClick(event);

        // Handle element click for active Myte
        if (this.parent.activeMyte && 
            this.parent.activeMyte.isActive && 
            this.parent.ui.isTool(UIToolModes.SELECT) &&
            Utility.isNotIgnored(event.target) && 
            Utility.isClickableElement(event.target)) {
            this.parent.ui.setSelected(event.target);
        }
    }

    handleEscape() {
        this.parent.ui.setSelected(null);
        
        if (this.parent.activeMyte?.queue.isCarrying()) {
            this.parent.activeMyte.queue.addPutDownMyte();
        }
    }
    
    // Keep your existing getLocalMouse and getContainerMouse methods
    getLocalMouse(element = null) {
        const mousePos = this.getMousePosition();
        const containerRect = this.parent.getContainerRect();
        const cameraOffset = this.parent.camera ? {
            x: this.parent.camera.posX,
            y: this.parent.camera.posY
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

    getContainerMouse(element = null) {
        const mousePos = this.getMousePosition();
        const containerRect = this.parent.getContainerRect();
        return {
            x: mousePos.x - (element ? (element.getRect().width / 2) : 0) - containerRect.left,
            y: mousePos.y - (element ? (element.getRect().height / 2) : 0) - containerRect.top
        };
    }
}