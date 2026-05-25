class SettingsPanel extends ModalWindow {
    static STORAGE_KEY = 'gameSettings';

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
            // position: 'center',
            position: 'top-right',
            draggable: true,
            closeButtonSelector: '.modal-close-btn'
        });

        this.settings = SettingsPanel.getDefaultSettings();
        this.loadSettings();

        this.init();
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
        // Implement gameplay settings controls
        // Similar to setupGraphicsSettings but for gameplay options
    }

    setupMiscSettings() {
        // Implement miscellaneous settings controls
        // Similar to setupGraphicsSettings but for misc options
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

    saveSettings() {
        console.log('Saving settings:', this.settings);

        try {
            localStorage.setItem(
                SettingsPanel.STORAGE_KEY,
                JSON.stringify(SettingsPanel.normalizeSettings(this.settings))
            );
            this.playSound('success');
        } catch (error) {
            console.error('Failed to save settings:', error);
            this.playSound('error');
        }
    }

    loadSettings() {
        try {
            const savedSettings = localStorage.getItem(SettingsPanel.STORAGE_KEY);
            if (savedSettings) {
                this.settings = SettingsPanel.normalizeSettings(JSON.parse(savedSettings));
                console.log('Loaded settings:', this.settings);
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
