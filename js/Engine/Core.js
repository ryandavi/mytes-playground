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

        this.config = AppConfig;

        // Core systems
        this.containers = new Map();
        this.gameTime = new GameTime();
        this.eventManager = new EventManager(this);
        this.resourceManager = new ResourceManager();

        this.loadingManager = new LoadingManager(this.config.loading);
        this.boundUnlockAudio = null;
        this.audioUnlockPrompt = null;
        this.boundHandleVisibilityChange = this.handleVisibilityChange.bind(this);

        this.soundManager = new SoundManager(this, {
            soundEnabled:   this.config.sound.enabled,
            musicEnabled:   this.config.sound.musicEnabled,
            ambientEnabled: this.config.sound.ambientEnabled,
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

    applyRuntimeModeFlags() {
        const params = new URLSearchParams(window.location.search);
        document.body.classList.toggle('debug', params.has('debug'));
    }

    /**
     * Toggle the `reduce-motion` body class that css/core/_reduced-motion.scss keys
     * off. Motion is reduced when EITHER the OS asks for it OR the in-game
     * Graphics > Animations toggle is off — the OS request is treated as binding
     * rather than as a default the game may override.
     *
     * @param {boolean} [animationsEnabled] live value from SettingsPanel; falls back
     *                                      to the saved preference when omitted.
     */
    applyMotionPreference(animationsEnabled = undefined) {
        const preferred = animationsEnabled ?? this.user?.preferences?.animationsEnabled;
        const systemPrefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
        document.body.classList.toggle('reduce-motion', preferred === false || systemPrefersReduced);
    }

    /**
     * Push the Settings > Misc > Notifications preference into the toast system.
     * Like `animationsEnabled`, this setting was persisted but consumed nowhere.
     *
     * @param {boolean} [enabled] live value from SettingsPanel; falls back to the
     *                            saved preference when omitted.
     */
    applyNotificationPreference(enabled = undefined) {
        const preferred = enabled ?? this.user?.preferences?.notificationsEnabled;
        this.toastManager?.setNotificationsEnabled?.(preferred !== false);
    }

    /**
     * First-run hints.
     *
     * A UX pass on a cold profile found a brand-new player arrives with no Myte
     * deployed, no active Myte, and **nothing on screen explaining what to do** —
     * the world just sits there. These two toasts are the minimum that makes the
     * first interaction discoverable without instruction.
     *
     * This is also what the long-dangling `tutorialsEnabled` setting was always
     * meant to gate (per the 2026-07-05 audit note), so it finally does something.
     */
    showFirstRunHints() {
        const preferences = this.user?.preferences;
        if (!preferences) return;
        if (preferences.tutorialsEnabled === false) return;
        if (preferences.hasSeenIntro) return;

        this.user.setPreference?.('hasSeenIntro', true);

        this.toastManager?.info?.(
            'Your Mytes are resting in their slots below. Click one to wake it up and send it into the world.',
            'Welcome',
            { duration: 12000 }
        );

        // Second beat, after the first has had time to be read.
        setTimeout(() => {
            this.toastManager?.info?.(
                'Click something in the world to see what your Myte can do with it. Double-click another Myte to take control of it.',
                'Getting Around',
                { duration: 12000 }
            );
        }, 9000);
    }

	showWelcomeBack() {
		const summary = this.user?.returnSummary;
		if (!summary) return;

		const hours = Math.max(1, Math.floor(summary.awayMs / (60 * 60 * 1000)));
		const days = Math.floor(hours / 24);
		const awayLabel = days >= 2
			? `${days} days`
			: hours >= 24
				? 'a day'
				: `${hours} hour${hours === 1 ? '' : 's'}`;

		this.toastManager?.info?.(
			`You were away for ${awayLabel}. Your Mytes are just as you left them—time away never drains their needs.`,
			'Welcome Back',
			{ duration: SiteConfig.ui.welcomeBack.toastDurationMs }
		);
		this.user.returnSummary = null;
	}

    /**
     * Make post-boot runtime errors visible.
     *
     * Boot failures already show the fatal banner, but anything thrown *after*
     * boot only reached the console — so for a player the game just quietly
     * misbehaves. These handlers surface it once, in plain language.
     *
     * Rate-limited and deduplicated: a throw inside the game loop repeats every
     * frame, and 60 toasts a second is worse than silence.
     */
    installGlobalErrorHandlers() {
        if (this._errorHandlersInstalled) return;
        this._errorHandlersInstalled = true;

        this._reportedErrors = new Map();
        const REPEAT_MUTE_MS = 30000;
        const MAX_DISTINCT = 3;

        const report = (label, detail) => {
            const key = `${label}:${detail}`.slice(0, 200);
            const now = Date.now();
            const lastSeen = this._reportedErrors.get(key);
            if (lastSeen && (now - lastSeen) < REPEAT_MUTE_MS) return;
            this._reportedErrors.set(key, now);

            // Stop nagging once several distinct errors have surfaced — at that
            // point the session is already broken and more toasts add nothing.
            if (this._reportedErrors.size > MAX_DISTINCT) return;

            this.toastManager?.error?.(
                'Something went wrong. The game may misbehave — reloading usually fixes it.',
                'Unexpected Error'
            );
        };

        this._onWindowError = (event) => {
            report('error', event?.message ?? String(event?.error ?? 'unknown'));
        };
        this._onUnhandledRejection = (event) => {
            const reason = event?.reason;
            report('rejection', reason?.message ?? String(reason ?? 'unknown'));
        };

        window.addEventListener('error', this._onWindowError);
        window.addEventListener('unhandledrejection', this._onUnhandledRejection);
    }

    removeGlobalErrorHandlers() {
        if (!this._errorHandlersInstalled) return;
        window.removeEventListener('error', this._onWindowError);
        window.removeEventListener('unhandledrejection', this._onUnhandledRejection);
        this._errorHandlersInstalled = false;
    }

    // Re-apply if the OS preference changes mid-session.
    watchMotionPreference() {
        const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
        if (!query?.addEventListener || this._motionPreferenceHandler) return;
        this._motionPreferenceHandler = () => this.applyMotionPreference();
        query.addEventListener('change', this._motionPreferenceHandler);
    }

    async init() {
        try {
            this.applyRuntimeModeFlags();
            PanelRegistry.renderAll();
            this.loadingManager.initialize();

            this.loadingManager.setMessage("Loading audio definitions...");
            const audioDataLoaded = await this.soundManager.loadPresetData();
            if (!audioDataLoaded) {
                throw new Error('Failed to load audio metadata.');
            }

            this.loadingManager.setMessage("Loading item data...");
            const itemDataLoaded = await ItemRegistry.preload();
            if (!itemDataLoaded) {
                throw new Error('Failed to load item metadata.');
            }

            this.loadingManager.setMessage("Loading shop data...");
            const shopDataLoaded = await ShopRegistry.preload();
            if (!shopDataLoaded) {
                throw new Error('Failed to load shop metadata.');
            }

            this.loadingManager.setMessage("Mapping the world...");
            const worldDataLoaded = await WorldGraph.preload();
            if (!worldDataLoaded) {
                throw new Error('Failed to load world metadata.');
            }

            this.loadingManager.setMessage("Loading action data...");
            const actionDataLoaded = await ActionDefinitionRegistry.preload();
            if (!actionDataLoaded) {
                throw new Error('Failed to load action metadata.');
            }
            ActionManager.validateDefinitions();

            this.loadingManager.setMessage("Loading buff data...");
            const buffDataLoaded = await BuffRegistry.preload();
            if (!buffDataLoaded) {
                throw new Error('Failed to load buff metadata.');
            }

            this.loadingManager.setMessage("Loading user data...");
            await this.initializeUser();
            this.applyMotionPreference();
            this.watchMotionPreference();
            // Notification preference is applied once toastManager exists (below) —
            // there is nothing to configure before that.

            this.loadingManager.setMessage("Setting up world...");
            const container = await this.createContainer(this.config.container.primaryId);
            if (!container) throw new Error('Failed to create main container');
            await container.init();
            this.soundManager.bindTimeManager?.(container.timeManager);

            this.loadingManager.setMessage("Initializing audio...");
            this.initializeAudio();
            this.loadingManager.updateStageProgress(LoadingManager.STAGES.CORE, 1);

            this.isInitialized = true;
            this.startUpdateLoop();
            this.loadingManager.updateStageProgress(LoadingManager.STAGES.RESOURCES, 1);
            this.loadingManager.completeLoading();

            this.toastManager = new ToastSystem(document.body);
            this.applyNotificationPreference();
            // Only meaningful once there is a toast system to report through.
            this.installGlobalErrorHandlers();
			this.showWelcomeBack();
            this.showFirstRunHints();

        } catch (error) {
            console.error('Failed to initialize MyteCore:', error);
            this.loadingManager?.setMessage("Error loading game: " + error.message);
            throw error;
        }
    }

    initializeAudio() {
        this.audioUnlockPrompt = new AudioUnlockPrompt(this);
        this.audioUnlockPrompt.init();
        this.setupAudioUnlockListeners();
    }

    /**
     * Single entry point for starting audio — used by both the gesture
     * listeners and the explicit "Enable Sound" button, so the two can never
     * disagree about whether the prompt should still be up.
     */
    async unlockAudio() {
        if (this.soundManager.initialized) return true;

        try {
            await this.soundManager.init();
        } catch (error) {
            console.error('Failed to initialize audio after user interaction:', error);
            return false;
        }

        if (!this.soundManager.initialized) return false;

        this.removeAudioUnlockListeners();
        this.audioUnlockPrompt?.hide();
        setTimeout(() => this.soundManager.startAllSounds(), this.config.sound.unlockDelay);
        return true;
    }

    getFirstContainer() {
        return this.containers.values().next().value ?? null;
    }

    setupAudioUnlockListeners() {
        if (this.boundUnlockAudio) return;

        this.boundUnlockAudio = () => this.unlockAudio();

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
                    Utility.logDebug('Loaded saved user data');
                    return;
                }
            }

            // If no saved data, load default user data from JSON
            const success = await this.user.loadUserDataFromFile(this.config.userData.defaultPath);
            if (!success) {
                console.warn('Failed to load default user data, using empty user');
                // Set some basic default values
                this.user.login('Guest' + Utility.randomInt(0, 999), 'guest_' + Date.now());
                this.rememberLastUserId();
            } else {
                this.rememberLastUserId();
            }
        } catch (error) {
            console.error('Error initializing user:', error);
            // Create a basic guest user as fallback
            this.user.login('Guest' + Utility.randomInt(0, 999), 'guest_' + Date.now());
            this.rememberLastUserId();
        }

        this.user?.applyAudioSettings?.(this.soundManager);
    }

    async loadUserData(userId) {
        try {
            // Prefer the local save because it is synchronous and reflects the latest user state.
            if (this.user.loadUserDataFromStorage(userId)) {
                this.user.applyAudioSettings?.(this.soundManager);
                this.rememberLastUserId(userId);
                return true;
            }
            // Remembered user ids are browser-local runtime saves.
            // Do not probe arbitrary JSON files for generated guest ids.
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
        if (timestamp - this.lastFPSUpdate >= this.config.engine.fpsUpdateInterval) {
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

            // Browsers suspend the AudioContext on backgrounded tabs and do not
            // always resume it with the page, which leaves audio dead with no
            // further gesture coming.
            this.soundManager?.resumeIfSuspended();
            this.audioUnlockPrompt?.refresh();
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

            // Advance simulation clock by the same capped delta so gameplay
            // cooldowns pause when the RAF loop is stopped (e.g. tab hidden).
            SimClock.advance(deltaTime);

            this.updateFPSCounter(timestamp);

            // Accumulate time and drain with fixed-size steps
            this.tickAccumulator += deltaTime;
            while (this.tickAccumulator >= this.config.engine.tickInterval) {
                this.tickUpdate(this.config.engine.tickInterval);
                this.tickAccumulator -= this.config.engine.tickInterval;
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
        this.audioUnlockPrompt?.dispose();
        this.audioUnlockPrompt = null;
        this.removeGlobalErrorHandlers();
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
        this.gameTime?.dispose?.();
        this.gameTime = null;
        TooltipSystem.disposeInstance?.();

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
