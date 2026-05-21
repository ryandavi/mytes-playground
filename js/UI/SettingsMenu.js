class SettingsMenu extends ModalWindow {
    constructor(parent) {
        super(parent, {
            id: 'game-settings-panel',
            buttonId: 'settings-toggle',
            closeOnOutsideClick: false,
            // position: 'center',
            position: 'top-right',
            draggable: true,  // Make this modal draggable
            closeButtonSelector: '.modal-close-btn'
        });
        
        this.settings = {
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
        
        this.init();
        this.setupSettingsControls();
    }

    buttonLeftClick(e){
        e.preventDefault();
        e.stopPropagation();
        this.toggle(); // Use the toggle method inherited from ModalWindow
        return false;
    }

    buttonRightClick(e){
        this.buttonLeftClick(e);
    }
    
    setupSettingsControls() {
        if (!this.modalElement) return;
        
        // Setup graphics settings
        this.setupGraphicsSettings();
        
        // Setup gameplay settings
        this.setupGameplaySettings();
        
        // Setup misc settings
        this.setupMiscSettings();

        
        // Setup save button
        const saveButton = this.modalElement.querySelector('#save-settings');
        if (saveButton) {
            saveButton.onclick = () => {
                this.saveSettings();
                this.close();
            };
        }
    }
    
    setupGraphicsSettings() {
        // Quality dropdown
        const qualitySelect = this.modalElement.querySelector('#graphics-quality');
        if (qualitySelect) {
            qualitySelect.value = this.settings.graphics.quality;
            qualitySelect.onchange = () => {
                this.settings.graphics.quality = qualitySelect.value;
                this.applyGraphicsSettings();
            };
        }
        
        // Effects toggle
        const effectsToggle = this.modalElement.querySelector('#effects-toggle');
        if (effectsToggle) {
            effectsToggle.checked = this.settings.graphics.effects;
            effectsToggle.onchange = () => {
                this.settings.graphics.effects = effectsToggle.checked;
                this.applyGraphicsSettings();
            };
        }
        
        // Animations toggle
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
    
    applyGraphicsSettings() {
        // No renderer target exists yet — placeholder for future graphics service.
    }
    
    saveSettings() {
        // Save settings to local storage or server
        console.log('Saving settings:', this.settings);
        
        try {
            localStorage.setItem('gameSettings', JSON.stringify(this.settings));
            this.playSound('success');
        } catch (error) {
            console.error('Failed to save settings:', error);
            this.playSound('error');
        }
    }
    
    loadSettings() {
        // Load settings from local storage or server
        try {
            const savedSettings = localStorage.getItem('gameSettings');
            if (savedSettings) {
                this.settings = JSON.parse(savedSettings);
                console.log('Loaded settings:', this.settings);
                return true;
            }
        } catch (error) {
            console.error('Failed to load settings:', error);
        }
        return false;
    }
    
    // Override the open method to load current settings before opening
    open() {
        this.loadSettings();
        super.open();
    }
}