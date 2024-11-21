class MyteCore {
    constructor() {
        if (MyteCore.instance) {
            return MyteCore.instance;
        }
        MyteCore.instance = this;
        
        this.config = {
            fps: 8,
            frameInterval: 1000 / 8,
            inactiveTimeout: 8000,
            defaultState: "idle",
            defaultMode: MOVE_TYPES.FOLLOW,
            defaultFollowMode: MOVE_FOLLOW_TYPES.NORMAL
        };
        
        this.containers = new Map();
        this.eventManager = new EventManager(this);
        this.resourceManager = new ResourceManager();
        this.lastFrameTime = 0;
        this.isInitialized = false;
    }

    async init() {
        try {
            // Load essential resources first
            await this.resourceManager.preloadEssentialResources();
            
            // Initialize containers
            const container = this.createContainer('container-1');
            if (!container) {
                throw new Error('Failed to create main container');
            }

            container.init();
            
            // Load remaining resources in the background
            this.resourceManager.loadResources().then(() => {
                console.log('All resources loaded');
            }).catch(error => {
                console.warn('Some resources failed to load:', error);
            });
            

            this.isInitialized = true;
            
        } catch (error) {
            console.error('Failed to initialize MyteCore:', error);
            throw error;
        }
    }

    createContainer(elementId) {
        const element = document.getElementById(elementId);
        if (!element) {
            console.error(`Container element with id '${elementId}' not found`);
            return null;
        }

        const container = new ContainerManager(elementId, this);
        this.containers.set(elementId, container);

        return container;
    }

    getContainer(elementId) {
        return this.containers.get(elementId);
    }

    removeContainer(elementId) {
        const container = this.containers.get(elementId);
        if (container) {
            container.dispose();
            this.containers.delete(elementId);
        }
    }

    update(timestamp) {
        // Update timing
        const deltaTime = timestamp - this.lastFrameTime;
        
        // Update all containers
        this.containers.forEach(container => {
            container.update(deltaTime);
        });

        // Update last frame time
        if(deltaTime >= this.config.frameInterval) {
            this.lastFrameTime = timestamp;
        }
        
        // Request next frame
        if (this.isInitialized) {
            requestAnimationFrame(this.update.bind(this));
        }
    }

    dispose() {
        this.isInitialized = false;
        this.containers.forEach((container, id) => {
            this.removeContainer(id);
        });
        this.eventManager = null;
        this.resourceManager = null;
        MyteCore.instance = null;
    }
}

// Initialize the application when the window loads
window.addEventListener('load', async () => {
    try {
        const core = new MyteCore();
        await core.init();
        
        // Start the update loop
        requestAnimationFrame((timestamp) => {
            core.update(timestamp);
        });
        
    } catch (error) {
        console.error('Failed to initialize application:', error);
    }
});