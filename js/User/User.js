const USER_DATA_VERSION = 4;
const USER_DEFAULT_PREFERENCES = Object.freeze({
    soundEnabled: true,
    musicEnabled: true,
    ambientEnabled: true,
    footstepsEnabled: true,
    spatialAudioEnabled: true,
    masterVolume: 1,
    sfxVolume: 0.82,
    footstepsVolume: 0.72,
    musicVolume: 0.28,
    uiVolume: 0.72,
    ambientVolume: 0.42,
    cameraMode: 'follow',
    containerLimit: true,
    theme: 'light',
    graphicsQuality: 'medium',
    effectsEnabled: true,
    animationsEnabled: true,
    timeOfDayOverlayEnabled: true,
    lightingEnabled: true,
    weatherEffectsEnabled: true,
    tutorialsEnabled: true,
    interactionHintsEnabled: true,
    autoSaveEnabled: true,
    notificationsEnabled: true,
    // Set once the first-run hints have been shown, so returning players are not
    // re-onboarded. Turning `tutorialsEnabled` back on resets this (SettingsPanel).
    hasSeenIntro: false
});

class User {
    constructor(core) {
        this.core = core;
        
        // Basic user info
        this.username = null;
        this.userId = null;
        this.lastLogin = null;
        this.dateCreated = null;
		this.lastSavedAt = null;
		this.returnSummary = null;

        // Reference to ContainerManager's inventory instance
        this.inventory = null;
        this.items = [];

        // Game state
        this.activeMytes = [];
        this.savedMytes = [];   // serialized myte state restored on load
        this.currentMapId = null;
        this.worldState = { version: 1, maps: {} };

        // User preferences
        this.preferences = User.getDefaultPreferences();

        // Statistics
        this.stats = {
            totalPlayTime: 0,
            mytesHatched: 0,
            itemsCollected: 0,
            achievementsUnlocked: 0
        };

        // Achievement tracking
        this.achievements = new Map();

        // Currency/Resources
        this.currency = {
            coins: 0,
            gems: 0
        };
        this._saveTimer = null;
        this._lastPlayTimeSaveAt = 0;
    }

    // Connect to existing inventory instance
    setInventory(inventoryInstance) {
        this.inventory = inventoryInstance;
    }

    trackMytes(mytes = []) {
        this.activeMytes = Array.isArray(mytes) ? [...mytes] : [];
    }

    getStorageKey(userId = this.userId) {
        if (!userId) return null;
        return this.core?.getUserStorageKey?.(userId) ?? `user_${userId}`;
    }

    serializeUserData() {
		this.lastSavedAt = new Date().toISOString();
        this.core?.getFirstContainer?.()?.worldState?.captureMap?.(this.core.getFirstContainer().gameMap);
        const trackedMytes = Array.isArray(this.activeMytes) ? this.activeMytes : [];
        const inventoryData = (this.inventory?.items ?? this.items).map(item => ({
                name: item.name,
                quantity: item.quantity,
                type: item.type,
                variant: item.variant,
                description: item.description || ''
            }));

        return {
            data_version: USER_DATA_VERSION,
            username: this.username,
            userId: this.userId,
            lastLogin: this.lastLogin,
            dateCreated: this.dateCreated,
			lastSavedAt: this.lastSavedAt,
            currentMapId: this.currentMapId,
            worldState: this.worldState,
            inventory: inventoryData,
            mytes: trackedMytes.map((myte, index) => MyteRosterSchema.serializeMyte(myte, index)),
            preferences: this.preferences,
            stats: this.stats,
            achievements: Array.from(this.achievements.entries()),
            currency: this.currency
        };
    }

    applyUserData(userData = {}) {
        this.username = userData.username ?? this.username;
        this.userId = userData.userId ?? this.userId;
        this.lastLogin = userData.lastLogin ? new Date(userData.lastLogin) : this.lastLogin;
        this.dateCreated = userData.dateCreated ? new Date(userData.dateCreated) : this.dateCreated;
		this.lastSavedAt = userData.lastSavedAt ?? this.lastSavedAt;
        this.currentMapId = userData.currentMapId ?? this.currentMapId;
        this.worldState = userData.worldState?.version === 1
            ? Utility.deepClone(userData.worldState)
            : { version: 1, maps: {} };

        if (Array.isArray(userData.mytes)) {
            this.savedMytes = userData.mytes.map(m => ({ ...m }));
        }

        if (userData.preferences) {
            this.preferences = User.normalizePreferences({
                ...this.preferences,
                ...userData.preferences
            });
        }

        if (userData.stats) {
            this.stats = {
                ...this.stats,
                ...userData.stats
            };
        }
        this._lastPlayTimeSaveAt = this.stats.totalPlayTime;

        if (userData.achievements) {
            this.achievements = new Map(userData.achievements);
        }

        if (userData.currency) {
            this.currency = {
                ...this.currency,
                ...userData.currency
            };
        }

        if (Array.isArray(userData.inventory)) {
            this.items = userData.inventory.map(item => ({ ...item }));
        }

        this.syncInventoryFromItems();
    }

    syncInventoryFromItems() {
        if (!this.inventory) return;

        while (this.inventory.items.length > 0) {
            this.inventory.items.pop();
        }

        this.items.forEach(item => {
            this.inventory.addItem(
                item.variant || item.name,
                item.quantity,
                item.type,
                item.description || ''
            );
        });
    }

    _migrateUserData(data) {
        const version = data?.data_version ?? 0;
        if (version === USER_DATA_VERSION) return data;

        let migrated = { ...data };

        if (version < 1) {
            // v0 → v1: data_version field added; all other fields are compatible
            migrated.data_version = 1;
        }

        if (migrated.data_version < 2) {
            if (migrated.userId === 'default') {
                migrated.mytes = MyteRosterSchema.createStarterRoster(migrated.mytes);
            }
            migrated.data_version = 2;
        }

        if (migrated.data_version < 3) {
            migrated.worldState = { version: 1, maps: {} };
            migrated.data_version = 3;
        }

		if (migrated.data_version < 4) {
			migrated.lastSavedAt = null;
			migrated.data_version = 4;
		}

        if (migrated.data_version === USER_DATA_VERSION) {
            Utility.logDebug(`[User] Migrated save data from v${version} to v${USER_DATA_VERSION}.`);
            return migrated;
        }

        console.warn(`[User] Save data v${version} could not be migrated to v${USER_DATA_VERSION}, resetting.`);
        return null;
    }

    loadUserDataFromStorage(userId = this.userId) {
        const storageKey = this.getStorageKey(userId);
        if (!storageKey) return false;

        const savedData = localStorage.getItem(storageKey);
        if (!savedData) return false;

        let parsed;
        try {
            parsed = JSON.parse(savedData);
        } catch (e) {
            // Never delete a corrupt save outright — for a pet game that is the
            // player's only copy of their Mytes. Quarantine it, try the rolling
            // backup, and say what happened.
            console.warn('[User] Corrupted save data.', e);
            this._quarantineCorruptSave(storageKey, savedData);

            const recovered = this._loadBackup(storageKey);
            if (recovered) {
                this.core?.toastManager?.warning?.(
                    'Your save was damaged, so the previous backup was loaded instead. Recent progress may be missing.',
                    'Save Recovered'
                );
                const migratedBackup = this._migrateUserData(recovered);
                if (migratedBackup) {
					this.captureReturnSummary(migratedBackup);
                    this.applyUserData(migratedBackup);
                    return true;
                }
            }

            this.core?.toastManager?.error?.(
                'Your save could not be read and no backup was available. A copy of the damaged data was kept.',
                'Save Unreadable'
            );
            return false;
        }

        const migrated = this._migrateUserData(parsed);
        if (!migrated) return false;

		this.captureReturnSummary(migrated);
        this.applyUserData(migrated);
        return true;
    }

	captureReturnSummary(userData) {
		this.returnSummary = null;
		const savedAt = Date.parse(userData?.lastSavedAt);
		if (!Number.isFinite(savedAt)) return;

		const awayMs = Math.max(0, Date.now() - savedAt);
		if (awayMs < SiteConfig.ui.welcomeBack.minAwayMs) return;
		this.returnSummary = { awayMs };
	}

    _backupKey(storageKey) { return `${storageKey}.bak`; }
    _corruptKey(storageKey) { return `${storageKey}.corrupt`; }

    // Keep the damaged blob under a separate key so it can be inspected or
    // hand-recovered later. Best effort: if even this write fails, we are out of
    // storage and there is nothing useful left to do.
    _quarantineCorruptSave(storageKey, rawData) {
        try {
            localStorage.setItem(this._corruptKey(storageKey), rawData);
        } catch (error) {
            console.warn('[User] Could not quarantine corrupt save:', error);
        }
    }

    _loadBackup(storageKey) {
        try {
            const backup = localStorage.getItem(this._backupKey(storageKey));
            return backup ? JSON.parse(backup) : null;
        } catch (error) {
            console.warn('[User] Backup save is unreadable too:', error);
            return null;
        }
    }

    /**
     * Serialize the current user to a portable JSON string — the export half of
     * export/import, and a useful bug-report attachment.
     */
    exportUserData() {
        return JSON.stringify({
            exportedAt: new Date().toISOString(),
            userId: this.userId,
            data: this.serializeUserData()
        }, null, 2);
    }

    /**
     * Replace the current save from an exported blob.
     *
     * Accepts both the wrapped export shape and a bare save, so a file pulled
     * straight out of localStorage also works.
     *
     * @returns {{ ok: boolean, error?: string }}
     */
    importUserData(json) {
        let parsed;
        try {
            parsed = typeof json === 'string' ? JSON.parse(json) : json;
        } catch (error) {
            return { ok: false, error: 'That file is not valid JSON.' };
        }

        const payload = parsed?.data ?? parsed;
        if (!payload || typeof payload !== 'object') {
            return { ok: false, error: 'That file does not contain save data.' };
        }

        const migrated = this._migrateUserData(payload);
        if (!migrated) {
            return { ok: false, error: 'That save is from an unsupported version.' };
        }

        // Snapshot what is about to be replaced, so an accidental import of the
        // wrong file is recoverable.
        const storageKey = this.getStorageKey();
        if (storageKey) {
            const current = localStorage.getItem(storageKey);
            if (current) {
                try {
                    localStorage.setItem(this._backupKey(storageKey), current);
                } catch (error) {
                    console.warn('[User] Could not back up before import:', error);
                }
            }
        }

        this.applyUserData(migrated);
        this.saveUserData();
        return { ok: true };
    }

    // User authentication and profile methods
    login(username, userId) {
        this.username = username;
        this.userId = userId;
        this.lastLogin = new Date();
        this.dateCreated ??= new Date();
        this.loadUserData();
    }

    // Currency management
    setCurrency(type, total) {
        if (!Object.prototype.hasOwnProperty.call(this.currency, type)) return false;

        const nextTotal = Math.max(0, Math.round(Number(total) || 0));
        const previousTotal = this.currency[type];
        const delta = nextTotal - previousTotal;
        if (delta === 0) return true;

        this.currency[type] = nextTotal;
        this._scheduleSave();
        this._emitCurrencyChanged(type, delta);
        return true;
    }

    addCurrency(type, amount) {
        if (!Object.prototype.hasOwnProperty.call(this.currency, type)) return false;
        return this.setCurrency(type, this.currency[type] + Number(amount || 0));
    }

    spendCurrency(type, amount) {
        if (!Object.prototype.hasOwnProperty.call(this.currency, type)) return false;
        const cost = Math.max(0, Number(amount) || 0);
        if (this.currency[type] < cost) return false;
        return this.setCurrency(type, this.currency[type] - cost);
    }

    _emitCurrencyChanged(type, delta) {
        this.core?.eventManager?.emit('user:currency_changed', {
            type,
            delta,
            total: this.currency[type]
        });
    }

    // Preference management
    setPreference(key, value) {
        if (this.preferences.hasOwnProperty(key)) {
            this.preferences[key] = value;
            this._scheduleSave();
            return true;
        }
        return false;
    }

    // Load data from JSON file
    async loadUserDataFromFile(fileName) {
        try {
            const response = await fetch(fileName); // Perform the fetch
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            
            const responseText = await response.text(); // Extract the response text
            const userData = JSON.parse(responseText); // Parse it as JSON
            Utility.logDebug('[User] Loaded user data from file:', userData);

            this.applyUserData(userData);

            return true;
        } catch (error) {

            const inferredPath = new URL(fileName, window.location.href).href;
            Utility.logDebug('Attempting to load file from:', inferredPath);
            console.error('Error reading file:', fileName);
            console.error('Error loading user data:', error);

            return false;
        }
    }

    applyAudioSettings(soundManager) {
        if (!soundManager) return;
        const p = this.preferences;
        soundManager.soundEnabled     = p.soundEnabled;
        soundManager.musicEnabled     = p.musicEnabled;
        soundManager.ambientEnabled   = p.ambientEnabled ?? true;
        soundManager.footstepsEnabled = p.footstepsEnabled;
        soundManager.spatialAudioEnabled = p.spatialAudioEnabled ?? true;
        soundManager.volume.master  = p.masterVolume;
        soundManager.volume.sfx     = p.sfxVolume;
        soundManager.volume.footsteps = p.footstepsVolume;
        soundManager.volume.music   = p.musicVolume;
        soundManager.volume.ui      = p.uiVolume;
        soundManager.volume.ambient = p.ambientVolume;
    }

    resetAudioPreferences() {
        const defaults = User.getDefaultPreferences();
        [
            'soundEnabled',
            'musicEnabled',
            'ambientEnabled',
            'footstepsEnabled',
            'spatialAudioEnabled',
            'masterVolume',
            'sfxVolume',
            'footstepsVolume',
            'musicVolume',
            'uiVolume',
            'ambientVolume'
        ].forEach((key) => {
            this.preferences[key] = defaults[key];
        });
        this._scheduleSave();
        return { ...defaults };
    }

    static getDefaultPreferences() {
        return { ...USER_DEFAULT_PREFERENCES };
    }

    static normalizePreferences(rawPreferences = {}) {
        return {
            ...USER_DEFAULT_PREFERENCES,
            ...(rawPreferences || {})
        };
    }

    // Data persistence
    saveUserData() {
        if (!this.userId) return;

        const storageKey = this.getStorageKey();
        if (!storageKey) return;

        try {
            const serialized = JSON.stringify(this.serializeUserData());

            // Roll the last known-good save into a backup before overwriting, so a
            // corrupt or partial write is recoverable rather than terminal. Only
            // promote a previous value that actually parses — otherwise a bad save
            // would overwrite a good backup.
            const previous = localStorage.getItem(storageKey);
            if (previous && previous !== serialized) {
                try {
                    JSON.parse(previous);
                    localStorage.setItem(this._backupKey(storageKey), previous);
                } catch {
                    // Previous value was already damaged — leave the older backup be.
                }
            }

            localStorage.setItem(storageKey, serialized);

            const lastUserIdKey = this.core?.config?.userData?.lastUserIdKey;
            if (lastUserIdKey) {
                localStorage.setItem(lastUserIdKey, this.userId);
            }
        } catch (error) {
            console.error('[User] Failed to save user data:', error);
            this.core?.toastManager?.warning?.(
                'Could not save - storage full or unavailable',
                'Warning'
            );
        }
    }

    // Debounced save — use this for frequent mutations (myte add/remove, currency, prefs).
    // Flushes at most once per 2 seconds; logout/unload calls saveUserData() directly.
    _scheduleSave() {
        if (this.preferences.autoSaveEnabled === false) return;
        if (this._saveTimer) return;
        this._saveTimer = setTimeout(() => {
            this._saveTimer = null;
            this.saveUserData();
        }, 2000);
    }

    loadUserData() {
        return this.loadUserDataFromStorage(this.userId);
    }

    // Analytics and tracking
    updatePlayTime(deltaTime) {
        this.stats.totalPlayTime += deltaTime;
        if (this.stats.totalPlayTime - this._lastPlayTimeSaveAt >= 300000) {
            this._lastPlayTimeSaveAt = this.stats.totalPlayTime;
            this.saveUserData();
        }
    }

    getPlayTimeStats() {
        return {
            totalHours: Math.floor(this.stats.totalPlayTime / 3600000),
            totalMinutes: Math.floor((this.stats.totalPlayTime % 3600000) / 60000)
        };
    }
}
