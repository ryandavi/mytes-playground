class SettingsPanel extends ModalWindow {
    static getDefaultSettings() {
        return {
            graphics: {
                quality: 'medium',
                effects: true,
                animations: true,
                timeOfDayOverlay: true,
                weather: true
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

        const timeOfDayOverlayToggle = this.modalElement.querySelector('#time-of-day-overlay-toggle');
        if (timeOfDayOverlayToggle) {
            timeOfDayOverlayToggle.checked = this.settings.graphics.timeOfDayOverlay;
            timeOfDayOverlayToggle.onchange = () => {
                this.settings.graphics.timeOfDayOverlay = timeOfDayOverlayToggle.checked;
                this.applyGraphicsSettings();
            };
        }

        const weatherToggle = this.modalElement.querySelector('#weather-toggle');
        if (weatherToggle) {
            weatherToggle.checked = this.settings.graphics.weather;
            weatherToggle.onchange = () => {
                this.settings.graphics.weather = weatherToggle.checked;
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
                // Re-enabling hints should actually show them again, otherwise the
                // toggle reads as broken to anyone who turned it off and back on.
                if (tutorialsToggle.checked) {
                    this.getUser()?.setPreference?.('hasSeenIntro', false);
                }
            };
        }
    }

    // Export/import of the whole save. localStorage is the only copy of a player's
    // Mytes, so a clear-site-data click is otherwise unrecoverable; the exported
    // file also doubles as a bug-report attachment.
    setupSaveDataControls() {
        const exportButton = this.modalElement.querySelector('#export-save');
        if (exportButton) {
            exportButton.onclick = () => this.exportSave();
        }

        const importButton = this.modalElement.querySelector('#import-save');
        const importInput = this.modalElement.querySelector('#import-save-file');
        if (importButton && importInput) {
            importButton.onclick = () => importInput.click();
            importInput.onchange = async () => {
                const file = importInput.files?.[0];
                importInput.value = '';
                if (file) await this.importSave(file);
            };
        }
    }

    exportSave() {
        const user = this.getUser();
        if (!user?.exportUserData) {
            this.parent?.showMessage?.('No save data to export.', 'warning', 'Export');
            return;
        }

        try {
            // Flush pending changes first so the export matches what is on screen.
            user.saveUserData();
            const blob = new Blob([user.exportUserData()], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            const stamp = new Date().toISOString().slice(0, 10);
            link.href = url;
            link.download = `neko-save-${stamp}.json`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
            this.playSound('success');
            this.parent?.showMessage?.('Save exported.', 'success', 'Export');
        } catch (error) {
            console.error('Failed to export save:', error);
            this.playSound('error');
            this.parent?.showMessage?.('Could not export your save.', 'error', 'Export');
        }
    }

    async importSave(file) {
        const user = this.getUser();
        if (!user?.importUserData) return;

        let text;
        try {
            text = await file.text();
        } catch (error) {
            console.error('Failed to read save file:', error);
            this.playSound('error');
            this.parent?.showMessage?.('Could not read that file.', 'error', 'Import');
            return;
        }

        const result = user.importUserData(text);
        if (!result.ok) {
            this.playSound('error');
            this.parent?.showMessage?.(result.error, 'error', 'Import');
            return;
        }

        this.playSound('success');
        // Roster and world are built at boot, so a reload is the honest way to
        // apply an imported save rather than half-swapping live state.
        this.parent?.showMessage?.('Save imported — reloading…', 'success', 'Import');
        setTimeout(() => window.location.reload(), 1200);
    }

    setupMiscSettings() {
        this.setupSaveDataControls();
        const notificationsToggle = this.modalElement.querySelector('#notifications-toggle');
        if (notificationsToggle) {
            notificationsToggle.checked = this.settings.misc.notifications;
            notificationsToggle.onchange = () => {
                this.settings.misc.notifications = notificationsToggle.checked;
                this.getCore()?.applyNotificationPreference?.(notificationsToggle.checked);
            };
        }
    }

    isEffectsEnabled() {
        return this.settings?.graphics?.effects !== false;
    }

    isTimeOfDayOverlayEnabled() {
        return this.settings?.graphics?.timeOfDayOverlay !== false;
    }

    isWeatherEnabled() {
        return this.settings?.graphics?.weather !== false;
    }

    isAnimationsEnabled() {
        return this.settings?.graphics?.animations !== false;
    }

    applyGraphicsSettings() {
        const container = this.parent?.parent || null;
        const particleSystem = container?.gameMap?.particleSystem || null;
        const environmentManager = container?.gameMap?.environmentManager || null;

        if (particleSystem?.setEffectsEnabled) {
            particleSystem.setEffectsEnabled(this.isEffectsEnabled());
        }
        if (particleSystem?.setWeatherEnabled) {
            particleSystem.setWeatherEnabled(this.isWeatherEnabled());
        }
        if (particleSystem?.setQualityLevel) {
            particleSystem.setQualityLevel(this.settings?.graphics?.quality ?? 'medium');
        }
        environmentManager?.refreshDisplaySettings?.();

        // Apply live, before save, so the toggle previews itself like the effects
        // and weather toggles above do.
        this.getCore()?.applyMotionPreference?.(this.isAnimationsEnabled());
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
                animations: preferences.animationsEnabled,
                timeOfDayOverlay: preferences.timeOfDayOverlayEnabled,
                weather: preferences.weatherEffectsEnabled
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
            timeOfDayOverlayEnabled: normalized.graphics.timeOfDayOverlay,
            weatherEffectsEnabled: normalized.graphics.weather,
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
