class ContainerManager {
    constructor(elementId, core) {
        this.core = core;
        this.element = document.getElementById(elementId);
        this.mytes = new Map();
        this.activeMyte = null;
        this.canvas = null;
        this.camera = null;
        this.ui = null;
        this.objects = null;
        this.isActive = true;
        this.lastMovementTime = Date.now();
        
        this.init();
    }

    init() {
        this.initCanvas();
        this.camera = new CameraSystem(this);
        this.ui = new UIManager(this);
        this.objects = new WorldObjectManager(this);
        
        this.initMytes();
        this.camera.init();
        this.ui.init();
        this.objects.init();
    }

    initCanvas() {
        this.canvas = this.element.querySelector('.canvas');
        if (!this.canvas) {
            throw new Error('Canvas element not found');
        }
    }

    initMytes() {
        const myteElements = this.element.querySelectorAll('.myteContainer');
        myteElements.forEach((container, index) => {
            try {
                const wrapper = container.querySelector('.myteWrapper');
                if (!wrapper) {
                    console.warn(`Myte wrapper not found in container ${index}`);
                    return;
                }
                
                const wrapperId = wrapper.id || `myteWrapper-${index}`;
                const idNumber = wrapperId.split('-')[1] || index.toString();
                
                const myteElement = wrapper.querySelector('.interactive-myte');
                if (!myteElement) {
                    console.warn(`Interactive myte element not found in wrapper ${wrapperId}`);
                    return;
                }

                // Ensure the data attribute exists
                if (!myteElement.hasAttribute('data-myte-name')) {
                    const defaultName = `Myte ${idNumber}`;
                    console.warn(`No name found for myte ${idNumber}, using default: ${defaultName}`);
                    myteElement.setAttribute('data-myte-name', defaultName);
                }

                const myte = new Myte(idNumber, this, myteElement);
                this.mytes.set(idNumber, myte);

                // If this is the first myte, make it active
                if (this.mytes.size === 1) {
                    this.setActiveMyte(myte);
                }
                
            } catch (error) {
                console.error(`Failed to initialize myte at index ${index}:`, error);
            }
        });

        if (this.mytes.size === 0) {
            console.warn('No mytes were initialized');
        }
    }

    // Utility methods for positioning and measurements
    getRect(element) {
        const rect = element.getBoundingClientRect();
        return {
            x: rect.left + window.scrollX,
            y: rect.top + window.scrollY,
            left: rect.left + window.scrollX,
            top: rect.top + window.scrollY,
            right: rect.left + rect.width + window.scrollX,
            bottom: rect.top + rect.height + window.scrollY,
            width: rect.width,
            height: rect.height
        };
    }

    getLocalOffset(element) {
        const rect = this.getRect(element);
        const containerRect = this.getRect(this.element);

        return {
            x: rect.x - containerRect.left,
            y: rect.y - containerRect.top,
            left: rect.left - containerRect.left,
            top: rect.top - containerRect.top,
            right: rect.right - containerRect.left,
            bottom: rect.bottom - containerRect.top,
            width: rect.width,
            height: rect.height
        };
    }

    getContainerRect() {
        return this.getRect(this.element);
    }

    getCanvasRect() {
        const rect = this.getRect(this.canvas);
        const dimensions = this.findLargestChildDimensions(this.canvas);
        
        return {
            left: rect.left,
            top: rect.top,
            width: dimensions.width,
            height: dimensions.height
        };
    }

    findLargestChildDimensions(element) {
        const children = element.children;
        let maxWidth = 0;
        let maxHeight = 0;

        for (let child of children) {
            const rect = child.getBoundingClientRect();
            maxWidth = Math.max(maxWidth, rect.width);
            maxHeight = Math.max(maxHeight, rect.height);
        }

        return { width: maxWidth, height: maxHeight };
    }

    getLocalMousePosition() {
        const containerRect = this.getContainerRect();
        const mousePos = this.core.eventManager.mousePosition;
        
        return {
            x: mousePos.x - containerRect.left - (this.camera ? this.camera.position.x : 0),
            y: mousePos.y - containerRect.top - (this.camera ? this.camera.position.y : 0)
        };
    }

    isMouseInBounds() {
        const mousePos = this.core.eventManager.mousePosition;
        const rect = this.getContainerRect();
        
        return mousePos.x >= rect.left && 
               mousePos.x <= rect.right && 
               mousePos.y >= rect.top && 
               mousePos.y <= rect.bottom;
    }

    getZIndex(y, height) {
        const maxHeight = this.getCanvasRect().height;
        return Math.floor(((y + height) / Math.max(maxHeight, 1)) * 100);
    }

    setActiveMyte(myte) {
        if (this.activeMyte === myte) return;
        
        if (this.activeMyte) {
            this.activeMyte.deactivate();
        }
        
        this.activeMyte = myte;
        
        if (myte) {
            myte.activate();
            this.ui.enableButtons();
        } else {
            this.ui.disableButtons();
        }
    }

    update(deltaTime) {
        // Check for user inactivity
        if (Date.now() - this.lastMovementTime > this.core.config.inactiveTimeout) {
            if (this.isActive) {
                this.isActive = false;
                console.log('User is inactive');
            }
        } else if (!this.isActive) {
            this.isActive = true;
            console.log('User is active');
        }

        // Update components
        this.mytes.forEach(myte => {
            if (myte.isActive) {
                myte.update(deltaTime);
            }
        });

        if (this.camera) this.camera.update();
        if (this.ui) this.ui.update();
        if (this.objects) this.objects.update();
    }

    dispose() {
        this.mytes.forEach(myte => {
            myte.dispose();
        });
        this.mytes.clear();
        this.activeMyte = null;
        
        if (this.camera) {
            this.camera.dispose();
            this.camera = null;
        }
        
        if (this.ui) {
            this.ui.dispose();
            this.ui = null;
        }
        
        if (this.objects) {
            this.objects.dispose();
            this.objects = null;
        }
    }
}