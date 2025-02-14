class MyteCore {
    constructor() {
        if (MyteCore.instance) {
            return MyteCore.instance;
        }
        MyteCore.instance = this;

        // User management
        this.user = null;
        this.defaultUserDataPath = 'data/user/Ryan.json'; // Path to default user data
        
        // System configuration
        this.config = {
            fps: 8,
            frameInterval: 1000 / 8,

            // Logic/physics update rate (20 ticks per second like Minecraft)
            tickRate: 20,
            tickInterval: 1000 / 20, // 50ms between ticks
            
            // Default animation frame rate
            defaultAnimationFPS: 8,
            defaultFrameInterval: 1000 / 8,
            
            // Performance monitoring
            targetFPS: 60,
            fpsUpdateInterval: 1000, // Update FPS counter every second
            
            // Other config...
            inactiveTimeout: 8000,
            defaultState: "idle",
            defaultMode: MOVE_TYPES.FOLLOW,
            defaultFollowMode: MOVE_FOLLOW_TYPES.NORMAL
        };
        
        // Core systems
        this.containers = new Map();
        this.eventManager = new EventManager(this);
        this.resourceManager = new ResourceManager();
        
        // Timing state
        this.lastTickTime = 0;
        this.lastFrameTime = 0;
        this.tickAccumulator = 0;
        this.isInitialized = false;

        // Performance monitoring
        this.frameCount = 0;
        this.lastFPSUpdate = 0;
        this.currentFPS = 0;


    }

    async init() {
        try {
            // Load essential resources first
            await this.resourceManager.preloadEssentialResources();
            
            // Initialize user system
            await this.initializeUser();
            
            // Initialize containers
            const container = await this.createContainer('container-1');
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

            // Start update loop
            this.isInitialized = true;
            this.startUpdateLoop();
            
        } catch (error) {
            console.error('Failed to initialize MyteCore:', error);
            throw error;
        }
    }

    async initializeUser() {
        // Create new user instance
        this.user = new User(this);

        try {
            // Try to load saved user data from localStorage first
            const savedUserId = localStorage.getItem('lastUserId');
            if (savedUserId) {
                const success = await this.loadUserData(savedUserId);
                if (success) {
                    console.log('Loaded saved user data');
                    return;
                }
            }

            // If no saved data, load default user data from JSON
            const success = await this.user.loadUserDataFromFile(this.defaultUserDataPath);
            if (!success) {
                console.warn('Failed to load default user data, using empty user');
                // Set some basic default values
                this.user.login('Guest' + Math.floor(Math.random() * 1000), 'guest_' + Date.now());
            }
        } catch (error) {
            console.error('Error initializing user:', error);
            // Create a basic guest user as fallback
            this.user.login('Guest' + Math.floor(Math.random() * 1000), 'guest_' + Date.now());
        }
    }

    async loadUserData(userId) {
        try {
            // Try to load user-specific data file first
            const success = await this.user.loadUserDataFromFile(`user_${userId}.json`);
            if (success) {
                return true;
            }

            // If that fails, try localStorage
            const savedData = localStorage.getItem(`user_${userId}`);
            if (savedData) {
                const userData = JSON.parse(savedData);
                this.user.login(userData.username, userData.userId);
                return true;
            }

            return false;
        } catch (error) {
            console.error('Error loading user data:', error);
            return false;
        }
    }

    async createContainer(elementId) {
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


    updateFPSCounter(timestamp) {
        this.frameCount++;

        if (timestamp - this.lastFPSUpdate >= this.config.fpsUpdateInterval) {
            this.currentFPS = Math.round(
                (this.frameCount * 1000) / (timestamp - this.lastFPSUpdate)
            );
            
            // Optionally adjust visual quality based on performance
            this.adjustPerformance();

            // Reset counters
            this.frameCount = 0;
            this.lastFPSUpdate = timestamp;
        }
    }

    adjustPerformance() {
        // If FPS is consistently low, we could:
        // 1. Reduce particle effects
        // 2. Simplify animations
        // 3. Reduce visual effects
        if (this.currentFPS < 30) {
            // Example: Reduce animation complexity
            this.config.defaultAnimationFPS = 6;
        } else {
            // Restore default settings
            this.config.defaultAnimationFPS = 8;
        }
    }

    startUpdateLoop() {
        const updateFrame = (timestamp) => {
            if (!this.isInitialized) return;

            // Calculate time since last frame
            const deltaTime = timestamp - this.lastFrameTime;
            // this.lastFrameTime = timestamp;

            // Update FPS counter
            this.updateFPSCounter(timestamp);

            // Accumulate time for fixed update steps
            this.tickAccumulator += deltaTime;


            // Run fixed update steps
            while (this.tickAccumulator >= this.config.tickInterval) {
                this.tickUpdate(this.config.tickInterval);
                this.tickAccumulator -= this.config.tickInterval;
            }

            // Run variable-rate updates
            this.update(deltaTime);


            // Update last frame time
            if (deltaTime >= this.config.frameInterval) {
                this.lastFrameTime = timestamp;
            }

            
            // Request next frame
            requestAnimationFrame(updateFrame);
        };

        // Start the update loop
        requestAnimationFrame(updateFrame);
    }


    tickUpdate(tickDelta) {
        // Update physics, AI, and other logic that needs fixed time steps
        this.containers.forEach(container => {
            container.tickUpdate(tickDelta);
        });

        // Update user stats
        if (this.user) {
            this.user.updatePlayTime(tickDelta);
        }
    }

    update(deltaTime) {
        // Update animations and visual elements
        this.containers.forEach(container => {
            container.update(deltaTime);
        });
    }


    dispose() {
        // Save user data before disposing
        if (this.user) {
            this.user.saveUserData();
        }

        this.isInitialized = false;
        this.containers.forEach((container, id) => {
            this.removeContainer(id);
        });
        this.eventManager = null;
        this.resourceManager = null;
        this.user = null;
        MyteCore.instance = null;
    }
}

// Initialize the application when the window loads
window.addEventListener('load', async () => {
    try {
        const core = new MyteCore();
        await core.init();
    } catch (error) {
        console.error('Failed to initialize application:', error);
    }
});