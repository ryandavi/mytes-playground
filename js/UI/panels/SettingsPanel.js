class SettingsPanel extends ModalWindow {
    static LEGACY_STORAGE_KEY = 'gameSettings';

    static getDefaultSettings() {
        return {
            graphics: {
                quality: 'medium',
                effects: true,
                animations: true
            },
            gameplay: {
                difficulty: 'normal',
                tutorials: true,
                autoSave: true
            },
            misc: {
                language: 'en',
                notifications: true
            }
        };
    }

    static normalizeSettings(settings = {}) {
        const defaults = SettingsPanel.getDefaultSettings();
        return {
            graphics: {
                ...defaults.graphics,
                ...(settings.graphics || {})
            },
            gameplay: {
                ...defaults.gameplay,
                ...(settings.gameplay || {})
            },
            misc: {
                ...defaults.misc,
                ...(settings.misc || {})
            }
        };
    }

    constructor(parent) {
        super(parent, {
            id: 'game-settings-panel',
            buttonId: 'settings-toggle',
            closeOnOutsideClick: false,
            position: 'top-right',
            draggable: true,
            closeButtonSelector: '.modal-close-btn'
        });

        this.init(); // explicit — subclass state is ready before any virtual method call
        this.settings = SettingsPanel.getDefaultSettings();
        this.loadSettings();
        this.setupSettingsControls();
        this.applyGraphicsSettings();
    }

    buttonLeftClick(e) {
        e.preventDefault();
        e.stopPropagation();
        this.toggle();
        return false;
    }

    buttonRightClick(e) {
        this.buttonLeftClick(e);
    }

    setupSettingsControls() {
        if (!this.modalElement) return;

        this.setupGraphicsSettings();
        this.setupGameplaySettings();
        this.setupMiscSettings();

        const saveButton = this.modalElement.querySelector('#save-settings');
        if (saveButton) {
            saveButton.onclick = () => {
                this.saveSettings();
                this.close();
            };
        }
    }

    setupGraphicsSettings() {
        const qualitySelect = this.modalElement.querySelector('#graphics-quality');
        if (qualitySelect) {
            qualitySelect.value = this.settings.graphics.quality;
            qualitySelect.onchange = () => {
                this.settings.graphics.quality = qualitySelect.value;
                this.applyGraphicsSettings();
            };
        }

        const effectsToggle = this.modalElement.querySelector('#effects-toggle');
        if (effectsToggle) {
            effectsToggle.checked = this.settings.graphics.effects;
            effectsToggle.onchange = () => {
                this.settings.graphics.effects = effectsToggle.checked;
                this.applyGraphicsSettings();
            };
        }

        const animationsToggle = this.modalElement.querySelector('#animations-toggle');
        if (animationsToggle) {
            animationsToggle.checked = this.settings.graphics.animations;
            animationsToggle.onchange = () => {
                this.settings.graphics.animations = animationsToggle.checked;
                this.applyGraphicsSettings();
            };
        }
    }

    setupGameplaySettings() {
        const tutorialsToggle = this.modalElement.querySelector('#tutorials-toggle');
        if (tutorialsToggle) {
            tutorialsToggle.checked = this.settings.gameplay.tutorials;
            tutorialsToggle.onchange = () => {
                this.settings.gameplay.tutorials = tutorialsToggle.checked;
            };
        }
    }

    setupMiscSettings() {
        const notificationsToggle = this.modalElement.querySelector('#notifications-toggle');
        if (notificationsToggle) {
            notificationsToggle.checked = this.settings.misc.notifications;
            notificationsToggle.onchange = () => {
                this.settings.misc.notifications = notificationsToggle.checked;
            };
        }
    }

    isEffectsEnabled() {
        return this.settings?.graphics?.effects !== false;
    }

    applyGraphicsSettings() {
        const container = this.parent?.parent || null;
        const particleSystem = container?.gameMap?.particleSystem || null;

        if (particleSystem?.setEffectsEnabled) {
            particleSystem.setEffectsEnabled(this.isEffectsEnabled());
        }
    }

    getCore() {
        let current = this.parent;
        while (current) {
            if (current.core) return current.core;
            current = current.parent;
        }
        return null;
    }

    getUser() {
        return this.getCore()?.user || null;
    }

    static settingsFromPreferences(preferences = {}) {
        return SettingsPanel.normalizeSettings({
            graphics: {
                quality: preferences.graphicsQuality,
                effects: preferences.effectsEnabled,
                animations: preferences.animationsEnabled
            },
            gameplay: {
                difficulty: preferences.difficulty,
                tutorials: preferences.tutorialsEnabled,
                autoSave: preferences.autoSaveEnabled
            },
            misc: {
                language: preferences.language,
                notifications: preferences.notificationsEnabled
            }
        });
    }

    static preferencesFromSettings(settings = {}) {
        const normalized = SettingsPanel.normalizeSettings(settings);
        return {
            graphicsQuality: normalized.graphics.quality,
            effectsEnabled: normalized.graphics.effects,
            animationsEnabled: normalized.graphics.animations,
            difficulty: normalized.gameplay.difficulty,
            tutorialsEnabled: normalized.gameplay.tutorials,
            autoSaveEnabled: normalized.gameplay.autoSave,
            language: normalized.misc.language,
            notificationsEnabled: normalized.misc.notifications
        };
    }

    saveSettings() {
        const user = this.getUser();
        const nextPreferences = SettingsPanel.preferencesFromSettings(this.settings);

        if (!user?.setPreference) {
            console.warn('Failed to save settings: user preferences unavailable.');
            this.playSound('error');
            return;
        }

        try {
            Object.entries(nextPreferences).forEach(([key, value]) => {
                user.setPreference(key, value);
            });
            localStorage.removeItem(SettingsPanel.LEGACY_STORAGE_KEY);
            this.playSound('success');
        } catch (error) {
            console.error('Failed to save settings:', error);
            this.playSound('error');
        }
    }

    loadSettings() {
        const userPreferences = this.getUser()?.preferences;
        if (userPreferences) {
            this.settings = SettingsPanel.settingsFromPreferences(userPreferences);
            return true;
        }

        try {
            const savedSettings = localStorage.getItem(SettingsPanel.LEGACY_STORAGE_KEY);
            if (savedSettings) {
                this.settings = SettingsPanel.normalizeSettings(JSON.parse(savedSettings));
                return true;
            }
        } catch (error) {
            console.error('Failed to load settings:', error);
        }

        this.settings = SettingsPanel.getDefaultSettings();
        return false;
    }

    open() {
        this.loadSettings();
        this.setupSettingsControls();
        this.applyGraphicsSettings();
        super.open();
    }
}
