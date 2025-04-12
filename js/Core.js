class MyteCore {
    constructor() {
		// Singleton pattern
		if (MyteCore.instance) {
			console.warn("MyteCore instance already exists.");
			return MyteCore.instance;
		}
		MyteCore.instance = this;
		console.log("Initializing MyteCore Singleton...");


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
        this.resourceManager.core = this; // Add reference to core

        // Add Loading Manager
        this.loadingManager = new LoadingManager();

        // Add to your MyteCore constructor:
        this.soundManager = new SoundManager(
            this, {
            soundEnabled: this.config.sound?.enabled !== false,
            musicEnabled: this.config.sound?.musicEnabled !== false,
            // masterVolume: this.config.sound?.masterVolume || 0.7,
            // sfxVolume: this.config.sound?.sfxVolume || 0.1,
            // musicVolume: this.config.sound?.musicVolume || 0.2,
            // uiVolume: this.config.sound?.uiVolume || 0.6
        });

        // Timing state
        this.lastTickTime = 0;
        this.lastFrameTime = 0;
        this.tickAccumulator = 0;
        this.isInitialized = false;

        this.ambientSoundCounter = 0;
        this.ambientSoundUpdateFrequency = 1000; // Update every 200 ticks (10 seconds at 20 ticks/sec)

        // Performance monitoring
        this.frameCount = 0;
        this.lastFPSUpdate = 0;
        this.currentFPS = 0;
    }

    async init() {
        try {
            // Initialize loading screen
            this.loadingManager = new LoadingManager();
            this.loadingManager.initialize();

            // Initialize Toast System
            this.toastManager = new ToastSystem(document.body);
            
            // Show welcome toast on successful initialization
            this.toastManager.info('Game loaded successfully!', 'Welcome');
            this.toastManager.error('Game loaded successfully!', 'Welcome');

            // Load essential resources first
            this.loadingManager.setMessage("Loading essential resources...");
            await this.resourceManager.preloadEssentialResources();
            this.loadingManager.updateStageProgress('resources', 0.3); // Essential resources are ~30% of all resources

            // Initialize user system
            this.loadingManager.setMessage("Loading user data...");
            await this.initializeUser();
            this.loadingManager.updateStageProgress('core', 0.5); // User initialization is ~50% of core setup

            // Initialize containers
            this.loadingManager.setMessage("Setting up game environment...");
            const container = await this.createContainer('container-1');
            if (!container) {
                throw new Error('Failed to create main container');
            }

            // This call starts container initialization
            // The container will manage its own part of the loading progress
            await container.init();
            this.loadingManager.updateStageProgress('core', .75); // Core is now fully initialized

            this.loadingManager.setMessage("Initializing audio...");
            await this.initializeAudio();
            this.loadingManager.updateStageProgress('core', 1);


            // Load remaining resources in the background
            this.loadingManager.setMessage("Loading graphics and audio...");
            this.resourceManager.loadResources()
                .then(() => {
                    console.log('All resources loaded');
                    this.loadingManager.updateStageProgress('resources', 1.0);

                    // Don't mark complete yet - let the container finish first
                    if (this.loadingManager.stages.container.progress >= 0.95) {
                        this.loadingManager.completeLoading();
                    }
                })
                .catch(error => {
                    console.warn('Some resources failed to load:', error);
                    // Still mark resources as complete for UX purposes
                    this.loadingManager.updateStageProgress('resources', 1.0);
                });

            // Start update loop
            this.isInitialized = true;
            this.startUpdateLoop();

        } catch (error) {
            console.error('Failed to initialize MyteCore:', error);
            if (this.loadingManager) {
                this.loadingManager.setMessage("Error loading game: " + error.message);
            }
            throw error;
        }
    }

    // Add this method to your MyteCore class:
    async initializeAudio() {
        try {
            // Just prepare the audio system (actual initialization will happen with user interaction)
            console.log('Audio system prepared, waiting for user interaction');
            this.setupAudioUnlockListeners();
            return true;
        } catch (error) {
            console.warn('Audio preparation failed:', error);
            return false;
        }
    }

    getFirstContainer(){
        let firstEntry = this.containers.entries().next().value;
        let containerManager = firstEntry?.[1];
        return containerManager;

    }

    // Add this method to your MyteCore class:
    setupAudioUnlockListeners() {
        // These events will unlock audio on first user interaction
        const unlockEvents = ['click', 'touchstart', 'keydown'];

        const unlockAudio = async () => {
            if (!this.soundManager.initialized) {
                try {
                    await this.soundManager.init();
                    console.log('Audio unlocked by user interaction');

                    // Add a small delay before playing sounds
                    setTimeout(() => {
                        // Play startup sound
                        //this.soundManager.playUISound('select');

                        // Speak text with the character's voice
                        /* this.soundManager.speakAnimalText("Hi my name is baby!", {
                            species: "bird",
                            speed: 1.6,
                            pitch: 1.3
                        }); */

                        // Add another delay before playing music
                        setTimeout(() => {
                            // Start appropriate background music based on time
                            this.soundManager.startAllSounds();
                            
                            // }
                        }, 300);
                    }, 100);
                } catch (error) {
                    console.error('Failed to initialize audio after user interaction:', error);
                }
            }
        };

        // Add event listeners
        unlockEvents.forEach(event => {
            document.addEventListener(event, unlockAudio);
        });
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

        // Only update ambient sounds occasionally
        this.ambientSoundCounter++;
        if (this.ambientSoundCounter >= this.ambientSoundUpdateFrequency) {
            this.ambientSoundCounter = 0;


            let firstContainer = this.getFirstContainer();
                
            if (this.soundManager?.initialized && firstContainer) {
                const timeData = firstContainer.timeManager.getTimeData();
                // this.soundManager.updateSounds(timeData);
            }

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

        if (this.soundManager) {
            this.soundManager.dispose();
            this.soundManager = null;
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


// --- Global Initialization ---
window.addEventListener('load', async () => {
	console.log("Window loaded event fired. Initializing MyteCore.");
	if (window.MyteCoreInstance) {
		console.warn("MyteCore instance already exists on window load. Skipping initialization.");
		return;
	}
	try {
		const core = new MyteCore();
		window.MyteCoreInstance = core;
		await core.init();
		console.log("MyteCore initialization complete from window.load listener.");
	} catch (error) {
		console.error('FATAL ERROR during application initialization:', error);
        const errorDiv = document.getElementById('fatal-error-display') || document.createElement('div');
        errorDiv.id = 'fatal-error-display';
        errorDiv.setAttribute('style', 'position:fixed; top:0; left:0; width:100%; padding:20px; background-color:#A00; color:white; z-index:10000; font-family:sans-serif; border-bottom: 2px solid red;');
        errorDiv.textContent = 'Fatal Error Initializing Application. Check console (F12). Message: ' + error.message;
        if (!errorDiv.parentNode) { document.body.prepend(errorDiv); }
	}
});
