class SettingsPanel extends PanelSection {
    static getDefaultSettings() {
        return {
            graphics: {
                quality: 'medium',
                effects: true,
                animations: true,
                // "Day & Night Lighting" — the global atmosphere tint, ambient
                // darkness and sunset band.
                timeOfDayOverlay: true,
                // "Interior Room Lighting" is opt-in: the per-room gloom pass is
                // not finished, so it stays off until the player asks for it.
                lighting: false,
                lightingDither: true,
                weather: true
            },
            gameplay: {
                tutorials: true,
                interactionHints: true,
                panelHints: true,
                autoSave: true
            },
            misc: {
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
        super(parent, { tab: 'general' });

        this.init();
        this.settings = SettingsPanel.getDefaultSettings();
        this.loadSettings();
        this.setupSettingsControls();
        this.applyGraphicsSettings();
    }

    setupSettingsControls() {
        if (!this.modalElement) return;

        this.setupGraphicsSettings();
        this.setupGameplaySettings();
        this.setupMiscSettings();
        this.setupAutoSave();

        const restoreButton = this.modalElement.querySelector('#restore-defaults');
        if (restoreButton) restoreButton.onclick = () => this.restoreDefaults();
    }

    /**
     * Sound and View persist the moment you touch a control. General used to
     * wait on a Save button, so a setting could be applied to the world and
     * still be gone on reload — and the button had no visible effect otherwise.
     * One listener on the section catches every control, after its own handler
     * has already written to `this.settings`.
     */
    setupAutoSave() {
        if (!this.sectionElement || this._autoSaveBound) return;
        this._autoSaveBound = true;
        this.sectionElement.addEventListener('change', () => this.saveSettings());
    }

    restoreDefaults() {
        this.settings = SettingsPanel.getDefaultSettings();
        this.setupGraphicsSettings();
        this.setupGameplaySettings();
        this.setupMiscSettings();
        this.applyGraphicsSettings();
        this.saveSettings({ announce: true });
        this.parent?.showMessage?.('Settings restored to defaults.', 'success', 'Options');
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

        const lightingToggle = this.modalElement.querySelector('#lighting-toggle');
        if (lightingToggle) {
            lightingToggle.checked = this.settings.graphics.lighting;
            lightingToggle.onchange = () => {
                this.settings.graphics.lighting = lightingToggle.checked;
                this.applyGraphicsSettings();
            };
        }

        const weatherToggle = this.modalElement.querySelector('#weather-toggle');
        const lightingStyleSelect = this.modalElement.querySelector('#lighting-style');
        if (lightingStyleSelect) {
            lightingStyleSelect.value = this.settings.graphics.lightingDither ? 'dithered' : 'smooth';
            lightingStyleSelect.onchange = () => {
                this.settings.graphics.lightingDither = lightingStyleSelect.value === 'dithered';
                this.applyGraphicsSettings();
            };
        }

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

        const interactionHintsToggle = this.modalElement.querySelector('#interaction-hints-toggle');
        if (interactionHintsToggle) {
            interactionHintsToggle.checked = this.settings.gameplay.interactionHints;
            interactionHintsToggle.onchange = () => {
                this.settings.gameplay.interactionHints = interactionHintsToggle.checked;
            };
        }

        // The same preference the ℹ in each panel's title bar drives, so the two
        // controls are two doors into one switch rather than two switches.
        this.panelHintsToggle = this.modalElement.querySelector('#panel-hints-toggle');
        if (this.panelHintsToggle) {
            this.panelHintsToggle.checked = this.settings.gameplay.panelHints;
            this.panelHintsToggle.onchange = () => {
                // Through HintNotes rather than by writing the local copy and
                // waiting for the autosave: the autosave runs after this
                // handler, so applying here would apply the value this checkbox
                // has just replaced.
                this.settings.gameplay.panelHints = this.panelHintsToggle.checked;
                this.parent?.hintNotes?.setEnabled(this.panelHintsToggle.checked);
            };
        }

        const autoSaveToggle = this.modalElement.querySelector('#autosave-toggle');
        if (autoSaveToggle) {
            autoSaveToggle.checked = this.settings.gameplay.autoSave;
            autoSaveToggle.onchange = () => {
                this.settings.gameplay.autoSave = autoSaveToggle.checked;
            };
        }
    }

    /**
     * Pull the panel-hints switch back from the preference after something
     * else flipped it — the ℹ in a panel title bar is the same switch, and a
     * checkbox that disagrees with the thing it controls is worse than no
     * checkbox. Also keeps this panel's own copy of settings honest, so the
     * next save does not write the stale value back.
     */
    syncHintPreference() {
        const enabled = this.getUser()?.preferences?.panelHintsEnabled !== false;
        this.settings.gameplay.panelHints = enabled;
        if (this.panelHintsToggle) this.panelHintsToggle.checked = enabled;
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

    isRoomLightingEnabled() {
        return this.settings?.graphics?.lighting === true;
    }

    isLightingDitherEnabled() {
        return this.settings?.graphics?.lightingDither !== false;
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
                lighting: preferences.lightingEnabled,
                lightingDither: preferences.lightingDitherEnabled,
                weather: preferences.weatherEffectsEnabled
            },
            gameplay: {
                tutorials: preferences.tutorialsEnabled,
                interactionHints: preferences.interactionHintsEnabled,
                panelHints: preferences.panelHintsEnabled,
                autoSave: preferences.autoSaveEnabled
            },
            misc: {
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
            lightingEnabled: normalized.graphics.lighting,
            lightingDitherEnabled: normalized.graphics.lightingDither,
            weatherEffectsEnabled: normalized.graphics.weather,
            tutorialsEnabled: normalized.gameplay.tutorials,
            interactionHintsEnabled: normalized.gameplay.interactionHints,
            panelHintsEnabled: normalized.gameplay.panelHints,
            autoSaveEnabled: normalized.gameplay.autoSave,
            notificationsEnabled: normalized.misc.notifications
        };
    }

    // Silent by default: this now runs on every checkbox tick, and a success
    // chime per tick would be noise. Only a deliberate action announces itself.
    saveSettings({ announce = false } = {}) {
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
            if (!nextPreferences.interactionHintsEnabled) {
                TooltipSystem.getInstance().hide();
            }
            if (announce) this.playSound('success');
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

    onSectionShown() {
        this.loadSettings();
        this.setupSettingsControls();
        this.applyGraphicsSettings();
    }
}
