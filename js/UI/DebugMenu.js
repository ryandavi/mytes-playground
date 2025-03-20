class DebugMenu extends ModalWindow {
    constructor(parent) {
        super(parent, {
            id: 'game-debug-panel',
            buttonId: 'debug-toggle',
            closeOnOutsideClick: false,
            // position: 'center',
            position: 'top-right',
            draggable: true,  // Make this modal draggable
            closeButtonSelector: '.modal-close-btn'
        });
        
        this.debug = {
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
        this.setupdebugControls();
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
    
    setupdebugControls() {
        if (!this.modalElement) return;
        
        // Setup graphics debug
        this.setupGraphicsdebug();
        
        // Setup gameplay debug
        this.setupGameplaydebug();
        
        // Setup misc debug
        this.setupMiscdebug();

        
        // Setup save button
        const saveButton = this.modalElement.querySelector('#save-debug');
        if (saveButton) {
            saveButton.onclick = () => {
                this.savedebug();
                this.close();
            };
        }
    }
    
    setupGraphicsdebug() {
        // Quality dropdown
        const qualitySelect = this.modalElement.querySelector('#graphics-quality');
        if (qualitySelect) {
            qualitySelect.value = this.debug.graphics.quality;
            qualitySelect.onchange = () => {
                this.debug.graphics.quality = qualitySelect.value;
                this.applyGraphicsdebug();
            };
        }
        
        // Effects toggle
        const effectsToggle = this.modalElement.querySelector('#effects-toggle');
        if (effectsToggle) {
            effectsToggle.checked = this.debug.graphics.effects;
            effectsToggle.onchange = () => {
                this.debug.graphics.effects = effectsToggle.checked;
                this.applyGraphicsdebug();
            };
        }
        
        // Animations toggle
        const animationsToggle = this.modalElement.querySelector('#animations-toggle');
        if (animationsToggle) {
            animationsToggle.checked = this.debug.graphics.animations;
            animationsToggle.onchange = () => {
                this.debug.graphics.animations = animationsToggle.checked;
                this.applyGraphicsdebug();
            };
        }
    }
    
    setupGameplaydebug() {
        // Implement gameplay debug controls
        // Similar to setupGraphicsdebug but for gameplay options
    }
    
    setupMiscdebug() {
        // Implement miscellaneous debug controls
        // Similar to setupGraphicsdebug but for misc options
    }
    
    applyGraphicsdebug() {
        // Apply graphics debug to the game
        console.log('Applying graphics debug:', this.debug.graphics);
        
        // Example implementation:
        const gameRenderer = this.parent.renderer;
        if (gameRenderer) {
            gameRenderer.setQuality(this.debug.graphics.quality);
            gameRenderer.setEffectsEnabled(this.debug.graphics.effects);
            gameRenderer.setAnimationsEnabled(this.debug.graphics.animations);
        }
    }
    
    savedebug() {
        // Save debug to local storage or server
        console.log('Saving debug:', this.debug);
        
        try {
            localStorage.setItem('gamedebug', JSON.stringify(this.debug));
            this.playSound('success');
        } catch (error) {
            console.error('Failed to save debug:', error);
            this.playSound('error');
        }
    }
    
    loaddebug() {
        // Load debug from local storage or server
        try {
            const saveddebug = localStorage.getItem('gamedebug');
            if (saveddebug) {
                this.debug = JSON.parse(saveddebug);
                console.log('Loaded debug:', this.debug);
                return true;
            }
        } catch (error) {
            console.error('Failed to load debug:', error);
        }
        return false;
    }
    
    // Override the open method to load current debug before opening
    open() {
        this.loaddebug();
        super.open();
    }
}