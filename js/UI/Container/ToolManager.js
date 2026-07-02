class ToolManager extends UIComponent {
    constructor(parent) {
        super(parent);
        this.currentToolMode = UIToolModes.SELECT;
        this.handControls = this.parent.containerWrapper.querySelector('#hand-controls');
        this.listenerCleanup = [];

        this.toolConfig = {
            [UIToolModes.SELECT]: {
                id: 'hand-select',
                icon: 'pointer-icon',
                label: 'Select',
                cursor: 'pointer',
                shortcut: 's'
            },
            [UIToolModes.DRAG]: {
                id: 'hand-drag',
                icon: 'move-icon',
                label: 'Drag',
                cursor: 'grab',
                shortcut: 'd'
            },
            [UIToolModes.PET]: {
                id: 'hand-pet',
                icon: 'pet-icon',
                label: 'Pet',
                cursor: 'pointer',
                shortcut: 'p'
            }
        };
    }

    applyToolModeState(mode) {
        document.body.dataset.toolMode = mode;
        this.parent.containerWrapper?.setAttribute('data-tool-mode', mode);
    }

    init() {
        this.initializeHandControls();
    }

    initializeHandControls() {
        if (!this.handControls) {
            console.error('Hand controls element not found');
            return;
        }

        // Add event listeners to all radio inputs in hand-controls
        const radioInputs = this.handControls.querySelectorAll('input[type="radio"]');

        radioInputs.forEach(input => {
            // Existing change event listener
            const handleChange = (event) => {
                const toolId = event.target.id;

                // Map the tool ID to the corresponding mode
                switch (toolId) {
                    case 'hand-select':
                        this.setToolMode(UIToolModes.SELECT);
                        break;
                    case 'hand-drag':
                        this.setToolMode(UIToolModes.DRAG);
                        break;
                    case 'hand-pet':
                        this.setToolMode(UIToolModes.PET);
                        break;
                }
            };
            input.addEventListener('change', handleChange);
            this.listenerCleanup.push(() => input.removeEventListener('change', handleChange));

            // Add context menu (right-click) event listener to the input itself
            const handleInputContextMenu = (event) => {
                event.preventDefault();
                input.checked = true;
                input.dispatchEvent(new Event('change'));
                return false;
            };
            input.addEventListener('contextmenu', handleInputContextMenu);
            this.listenerCleanup.push(() => input.removeEventListener('contextmenu', handleInputContextMenu));

            // Also add to the label if it exists
            const label = this.handControls.querySelector(`label[for="${input.id}"]`);
            if (label) {
                const handleLabelContextMenu = (event) => {
                    event.preventDefault();
                    input.checked = true;
                    input.dispatchEvent(new Event('change'));
                    return false;
                };
                label.addEventListener('contextmenu', handleLabelContextMenu);
                this.listenerCleanup.push(() => label.removeEventListener('contextmenu', handleLabelContextMenu));
            }
        });

        // Set initial mode
        this.setToolMode(UIToolModes.SELECT);
        this.applyToolModeState(this.currentToolMode);
    }

    setToolMode(mode) {
        if (this.currentToolMode === mode) {
            this.applyToolModeState(mode);
            return;
        }

        this.parent.playSound('hover');

        // Set mode
        this.currentToolMode = mode;
        this.applyToolModeState(mode);

        // Notify parent UI of tool change
        this.parent.onToolModeChanged(mode);
    }

    isTool(mode) {
        return this.currentToolMode === mode;
    }

    changeToolMode(mode) {
        const toolConfig = this.toolConfig[mode];

        if (!toolConfig || !toolConfig.id) {
            Utility.warnDebug(`Invalid tool mode: ${mode}`);
            return false;
        }

        const radioButton = document.getElementById(toolConfig.id);

        if (radioButton) {
            // Check the radio button
            radioButton.checked = true;

            // Dispatch a change event to trigger any listeners
            radioButton.dispatchEvent(new Event('change'));

            // Update current tool mode
            this.currentToolMode = mode;
            this.applyToolModeState(mode);

            return true;
        }

        Utility.warnDebug(`Could not find radio button for tool: ${toolConfig.id}`);
        return false;
    }

    dispose() {
        this.listenerCleanup.forEach(cleanup => cleanup());
        this.listenerCleanup = [];
    }
}
