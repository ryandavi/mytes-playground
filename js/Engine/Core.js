class MyteCore {
    static AUDIO_UNLOCK_EVENTS = ['click', 'touchstart', 'keydown'];
    static USER_DATA_ID_TOKEN = '{userId}';

    constructor() {
		// Singleton pattern
		if (MyteCore.instance) {
			console.warn("MyteCore instance already exists.");
			return MyteCore.instance;
		}
		MyteCore.instance = this;

        this.user = null;

        // System configuration
        this.config = {
            // Logic/physics update rate
            tickRate: 20,
            tickInterval: 1000 / 20,

            // Default animation frame rate for sprites
            defaultAnimationFPS: 8,

            // Performance monitoring
            targetFPS: 60,
            fpsUpdateInterval: 1000,

            // Myte/world settings
            inactiveTimeout: 8000,
            defaultState: "idle",
            defaultMode: MOVE_TYPES.FOLLOW,
            defaultFollowMode: MOVE_FOLLOW_TYPES.NORMAL,

            // User data
            userData: {
                defaultPath: 'data/user/Ryan.json',
                filePathTemplate: `data/user/${MyteCore.USER_DATA_ID_TOKEN}.json`,
                localStorageKeyPrefix: 'user_',
                lastUserIdKey: 'lastUserId',
            },

            // DOM/boot configuration
            primaryContainerId: 'container-1',

            // Loading
            loading: {
                stages: {
                    [LoadingManager.STAGES.CORE]: { weight: 0.45 },
                    [LoadingManager.STAGES.RESOURCES]: { weight: 0.10 },
                    [LoadingManager.STAGES.CONTAINER]: { weight: 0.45 },
                },
            },

            // Audio
            sound: {
                enabled: true,
                musicEnabled: true,
                unlockDelay: 400,
            },
        };

        // Core systems
        this.containers = new Map();
        this.gameTime = new GameTime();
        this.eventManager = new EventManager(this);
        this.resourceManager = new ResourceManager();

        this.loadingManager = new LoadingManager(this.config.loading);
        this.boundUnlockAudio = null;
        this.boundHandleVisibilityChange = this.handleVisibilityChange.bind(this);

        this.soundManager = new SoundManager(this, {
            soundEnabled: this.config.sound.enabled,
            musicEnabled: this.config.sound.musicEnabled,
        });

        // Timing state
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
            this.loadingManager.initialize();

            this.loadingManager.setMessage("Loading item data...");
            await ItemRegistry.preload();

            this.loadingManager.setMessage("Loading action data...");
            const actionDataLoaded = await ActionDefinitionRegistry.preload();
            if (!actionDataLoaded) {
                throw new Error('Failed to load action metadata.');
            }
            ActionManager.validateDefinitions();

            this.loadingManager.setMessage("Loading user data...");
            await this.initializeUser();

            this.loadingManager.setMessage("Setting up world...");
            const container = await this.createContainer(this.config.primaryContainerId);
            if (!container) throw new Error('Failed to create main container');
            await container.init();

            this.loadingManager.setMessage("Initializing audio...");
            this.initializeAudio();
            this.loadingManager.updateStageProgress(LoadingManager.STAGES.CORE, 1);

            this.isInitialized = true;
            this.startUpdateLoop();
            this.loadingManager.updateStageProgress(LoadingManager.STAGES.RESOURCES, 1);
            this.loadingManager.completeLoading();

            this.toastManager = new ToastSystem(document.body);

        } catch (error) {
            console.error('Failed to initialize MyteCore:', error);
            this.loadingManager?.setMessage("Error loading game: " + error.message);
            throw error;
        }
    }

    initializeAudio() {
        this.setupAudioUnlockListeners();
    }

    getFirstContainer() {
        return this.containers.values().next().value ?? null;
    }

    setupAudioUnlockListeners() {
        if (this.boundUnlockAudio) return;

        this.boundUnlockAudio = async () => {
            if (this.soundManager.initialized) return;
            try {
                await this.soundManager.init();
                this.removeAudioUnlockListeners();
                setTimeout(() => this.soundManager.startAllSounds(), this.config.sound.unlockDelay);
            } catch (error) {
                console.error('Failed to initialize audio after user interaction:', error);
            }
        };

        MyteCore.AUDIO_UNLOCK_EVENTS.forEach(event => {
            document.addEventListener(event, this.boundUnlockAudio);
        });
    }

    removeAudioUnlockListeners() {
        if (!this.boundUnlockAudio) return;

        MyteCore.AUDIO_UNLOCK_EVENTS.forEach(event => {
            document.removeEventListener(event, this.boundUnlockAudio);
        });

        this.boundUnlockAudio = null;
    }


    async initializeUser() {
        // Create new user instance
        this.user = new User(this);

        try {
            // Try to load saved user data from localStorage first
            const savedUserId = localStorage.getItem(this.config.userData.lastUserIdKey);
            if (savedUserId) {
                const success = await this.loadUserData(savedUserId);
                if (success) {
                    this.rememberLastUserId();
                    console.log('Loaded saved user data');
                    return;
                }
            }

            // If no saved data, load default user data from JSON
            const success = await this.user.loadUserDataFromFile(this.config.userData.defaultPath);
            if (!success) {
                console.warn('Failed to load default user data, using empty user');
                // Set some basic default values
                this.user.login('Guest' + Math.floor(Math.random() * 1000), 'guest_' + Date.now());
                this.rememberLastUserId();
            } else {
                this.rememberLastUserId();
            }
        } catch (error) {
            console.error('Error initializing user:', error);
            // Create a basic guest user as fallback
            this.user.login('Guest' + Math.floor(Math.random() * 1000), 'guest_' + Date.now());
            this.rememberLastUserId();
        }
    }

    async loadUserData(userId) {
        try {
            // Prefer the local save because it is synchronous and reflects the latest user state.
            if (this.user.loadUserDataFromStorage(userId)) {
                this.rememberLastUserId(userId);
                return true;
            }

            const success = await this.user.loadUserDataFromFile(this.getUserDataFilePath(userId));
            if (success) {
                this.rememberLastUserId();
                return true;
            }

            return false;
        } catch (error) {
            console.error('Error loading user data:', error);
            return false;
        }
    }

    getUserStorageKey(userId) {
        return `${this.config.userData.localStorageKeyPrefix}${userId}`;
    }

    getUserDataFilePath(userId) {
        return this.config.userData.filePathTemplate.replace(MyteCore.USER_DATA_ID_TOKEN, userId);
    }

    rememberLastUserId(userId = this.user?.userId) {
        if (!userId) return;
        localStorage.setItem(this.config.userData.lastUserIdKey, userId);
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
            this.frameCount = 0;
            this.lastFPSUpdate = timestamp;
        }
    }

    handleVisibilityChange() {
        if (document.hidden) {
            // Cancel the pending RAF so no stale callbacks fire while hidden.
            if (this._rafHandle) {
                cancelAnimationFrame(this._rafHandle);
                this._rafHandle = null;
            }
        } else {
            // Reset timing so the first frame after returning doesn't get a huge deltaTime.
            this.tickAccumulator = 0;
            this.lastFrameTime = performance.now();
            // Only restart if the loop is actually dead (guard against double-start).
            if (!this._rafHandle) {
                this._rafHandle = requestAnimationFrame(this._updateFrame);
            }
        }
    }

    startUpdateLoop() {
        document.removeEventListener('visibilitychange', this.boundHandleVisibilityChange);
        document.addEventListener('visibilitychange', this.boundHandleVisibilityChange);

        this._rafHandle = null;

        this._updateFrame = (timestamp) => {
            // Clear handle first — if we bail early, the loop is cleanly stopped.
            this._rafHandle = null;
            if (!this.isInitialized) return;

            // Cap deltaTime to 100ms to prevent spiral-of-death after tab focus loss.
            const deltaTime = Math.min(timestamp - this.lastFrameTime, 100);
            this.lastFrameTime = timestamp;

            this.updateFPSCounter(timestamp);

            // Accumulate time and drain with fixed-size steps
            this.tickAccumulator += deltaTime;
            while (this.tickAccumulator >= this.config.tickInterval) {
                this.tickUpdate(this.config.tickInterval);
                this.tickAccumulator -= this.config.tickInterval;
            }

            // Variable-rate render/animation update
            this.update(deltaTime);

            this._rafHandle = requestAnimationFrame(this._updateFrame);
        };

        this.lastFrameTime = performance.now();
        // Cancel any stale handle before starting (e.g. hot-reload / re-init).
        if (this._rafHandle) cancelAnimationFrame(this._rafHandle);
        this._rafHandle = requestAnimationFrame(this._updateFrame);
    }


    tickUpdate(tickDelta) {
        this.containers.forEach(container => container.tickUpdate(tickDelta));

        if (this.user) {
            this.user.updatePlayTime(tickDelta);
        }
    }

    update(deltaTime) {
        this.containers.forEach(container => container.update(deltaTime));
    }


    dispose() {
        this.isInitialized = false;
        if (this._rafHandle) { cancelAnimationFrame(this._rafHandle); this._rafHandle = null; }

        this.user?.saveUserData();
        this.user = null;

        this.removeAudioUnlockListeners();
        this.soundManager?.dispose();
        this.soundManager = null;
        document.removeEventListener('visibilitychange', this.boundHandleVisibilityChange);

        // Snapshot keys to avoid mutating the Map during iteration
        [...this.containers.keys()].forEach(id => this.removeContainer(id));

        this.toastManager?.dispose?.();
        this.toastManager = null;
        this.loadingManager?.dispose?.();
        this.loadingManager = null;
        this.eventManager?.dispose?.();
        this.eventManager = null;
        this.resourceManager = null;

        InputSystem.instance?.destroy?.();
        MyteCore.instance = null;
    }
}


// --- Global Initialization ---
window.addEventListener('load', async () => {
    if (MyteCore.instance) return; // Already initialized (e.g. hot-reload)
    try {
        await new MyteCore().init();
    } catch (error) {
        console.error('FATAL: application initialization failed:', error);
        const errorDiv = document.getElementById('fatal-error-display') || document.createElement('div');
        errorDiv.id = 'fatal-error-display';
        errorDiv.setAttribute('style', 'position:fixed;top:0;left:0;width:100%;padding:20px;background:#A00;color:#fff;z-index:10000;font-family:sans-serif;border-bottom:2px solid red;');
        errorDiv.textContent = `Fatal error: ${error.message} — open DevTools (F12) for details.`;
        if (!errorDiv.parentNode) document.body.prepend(errorDiv);
    }
});
