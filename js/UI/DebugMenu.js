class DebugMenu extends ModalWindow {
    constructor(parent) {
        super(parent, {
            id: 'game-debug-panel',
            buttonId: 'debug-toggle',
            closeOnOutsideClick: false,
            position: 'top-right',
            draggable: true,
            closeButtonSelector: '.modal-close-btn'
        });

        // Button configuration
        this.buttonConfigs = [


            // Toggle buttons
            {
                id: 'toggleDebug',
                type: 'toggle',
                label: 'Visual Debug: ',
                states: {
                    true: 'ON',
                    false: 'OFF'
                },
                getValue: () => document.body.classList.contains('debug'),
                action: (button, value) => {
                    document.body.classList.toggle('debug');
                    const gridSystem = this.parent?.parent?.gameMap?.gridSystem;
                    if (gridSystem) gridSystem.toggleDebug();
                    this.updateButton('toggleDebug');
                }
            },

            // Cycle buttons
            {
                id: 'cycleFollowGoal',
                type: 'cycle',
                label: 'Follow Mode: ',
                target: {
                    path: ['parent', 'activeMyte'],
                    property: 'followGoal'
                },
                options: MOVE_FOLLOW_TYPES,
                requiresActiveMyte: true,
                // Custom getValue function for complex value retrieval
                getValue: () => {
                    const activeMyte = this.parent.parent.activeMyte;
                    return activeMyte?.isActive ? activeMyte.followGoal : null;
                },
                // Custom format function for display
                format: (value) => {
                    return Utility.getKeyByValue(MOVE_FOLLOW_TYPES, value) || "None";
                },
                action: (button) => {
                    const activeMyte = this.parent.parent.activeMyte;
                    if (activeMyte?.isActive) {
                        // Get current follow goal and directly find the next one
                        const currentFollowGoal = activeMyte.followGoal;
                        const nextFollowGoal = Utility.getNextKey(currentFollowGoal, MOVE_FOLLOW_TYPES);

                        // Set the new follow goal
                        activeMyte.setFollowMode(nextFollowGoal);

                        // Update button text using the consolidated function
                        this.updateButton('cycleFollowGoal');
                    }
                }
            },
            {
                id: 'cycleGoal',
                type: 'cycle',
                label: 'Goal: ',
                target: {
                    path: ['parent', 'activeMyte'],
                    property: 'goal'
                },
                options: MOVE_TYPES,
                requiresActiveMyte: true,
                // Custom getValue function for complex value retrieval
                getValue: () => {
                    const activeMyte = this.parent.parent.activeMyte;
                    return activeMyte?.isActive ? activeMyte.goal : null;
                },
                // Custom format function for display
                format: (value) => {
                    return Utility.getKeyByValue(MOVE_TYPES, value) || "None";
                },
                action: (button) => {
                    const activeMyte = this.parent.parent.activeMyte;
                    if (activeMyte?.isActive) {
                        // Get current goal and directly find the next one
                        const currentGoal = activeMyte.goal;
                        const nextGoal = Utility.getNextKey(currentGoal, MOVE_TYPES);

                        // Set the new goal
                        activeMyte.setMode(nextGoal);

                        // Update button text
                        this.updateButton('cycleGoal');
                    }
                }
            },
            {
                id: 'cycleAutonomyGoal',
                type: 'cycle',
                label: 'AI: ',
                target: {
                    path: ['parent', 'activeMyte'],
                    property: 'autonomyGoal'
                },
                options: MOVE_AUTONOMY_TYPES,
                requiresActiveMyte: true,
                getValue: () => {
                    const activeMyte = this.parent.parent.activeMyte;
                    return activeMyte?.isActive ? activeMyte.autonomyGoal : null;
                },
                format: (value) => {
                    return Utility.getKeyByValue(MOVE_AUTONOMY_TYPES, value) || "None";
                },
                action: () => {
                    const activeMyte = this.parent.parent.activeMyte;
                    if (activeMyte?.isActive) {
                        const currentGoal = activeMyte.autonomyGoal;
                        const nextGoal = Utility.getNextKey(currentGoal, MOVE_AUTONOMY_TYPES);
                        activeMyte.setAutonomyMode(nextGoal);
                        this.updateButton('cycleAutonomyGoal');
                    }
                }
            },
            {
                id: 'cycleCamera',
                type: 'cycle',
                label: 'Camera: ',
                target: {
                    path: ['parent', 'camera'],
                    property: 'followMode'
                },
                options: CAMERA_FOLLOW_MODES,
                // Custom getValue function
                getValue: () => this.parent.parent.camera.followMode,
                // Custom format function
                format: (value) => Utility.getKeyByValue(CAMERA_FOLLOW_MODES, value) || "None",
                action: (button) => {
                    // Get current mode and directly find the next one
                    const currentMode = this.parent.parent.camera.followMode;
                    const nextMode = Utility.getNextKey(currentMode, CAMERA_FOLLOW_MODES);

                    // Set the new mode
                    this.parent.parent.camera.setMode(nextMode);

                    // Update button text
                    this.updateButton('cycleCamera');
                }
            },


            {
                id: 'cycleContainerLimit',
                type: 'toggle',
                label: 'Limit: ',
                target: {
                    path: ['parent', 'settings'],
                    property: 'limitMap'
                },
                states: {
                    true: 'ON',
                    false: 'OFF'
                },
                // Add explicit getValue function to match other buttons
                getValue: () => this.parent.parent.settings.limitMap,
                action: (button, value) => {
                    // Only toggle if we're not in initialization

                    // Toggle the value
                    this.parent.parent.settings.limitMap = !this.parent.parent.settings.limitMap;

                    // Apply state changes based on the new setting
                    if (this.parent.parent.settings.limitMap) {
                        // limit is on - overflow is hidden
                        this.parent.parent.camera.limitToBounds = true;
                        this.parent.parent.camera.isScrollable.x = true;
                        this.parent.parent.camera.isScrollable.y = true;
                        this.parent.parent.element.closest('.container').classList.add('noScroll');
                    } else {
                        // limit is off
                        this.parent.parent.camera.limitToBounds = false;
                        this.parent.parent.camera.isScrollable.x = false;
                        this.parent.parent.camera.isScrollable.y = false;
                        this.parent.parent.element.closest('.container').classList.remove('noScroll');
                        this.parent.parent.camera.resetView(true);
                    }


                    // Update button text
                    this.updateButton('cycleContainerLimit');
                }
            },

            // Action button
            {
                id: 'skipQueue',
                type: 'action',
                label: 'Skip Queue',
                requiresActiveMyte: true,
                action: () => {
                    const activeMyte = this.parent.parent.activeMyte;
                    if (activeMyte?.isActive) {
                        activeMyte.queue.removeCurrentAction();
                        activeMyte.unsetTarget();
                    }
                }
            },

            // Value button (example)
            {
                id: 'adjustSpeed',
                type: 'value',
                label: 'Speed: ',
                target: {
                    path: ['parent', 'activeMyte', 'stats'],
                    property: 'speed'
                },
                min: 0.5,
                max: 5,
                step: 0.5,
                defaultValue: 1,
                format: (value) => value.toFixed(1) + 'x',
                requiresActiveMyte: true,
                getValue: () => {
                    const activeMyte = this.parent.parent.activeMyte;
                    if (activeMyte?.isActive && activeMyte.stats) {
                        return activeMyte.stats.speed;
                    }
                    return this.defaultValue || 1;
                },
                action: (button, value) => {
                    const activeMyte = this.parent.parent.activeMyte;
                    console.log('Speed action called with value:', value);

                    if (activeMyte?.isActive && typeof value === 'number') {
                        console.log('Current speed before update:', activeMyte.stats.speed);
                        activeMyte.stats.speed = value;
                        console.log('Updated speed to:', activeMyte.stats.speed);

                        // Update the button text
                        this.updateButton('adjustSpeed');
                    }
                }
            },


            // Mood controls
            {
                id: 'setMinMood',
                type: 'action',
                label: 'Min Mood',
                requiresActiveMyte: true,
                action: () => {
                    const activeMyte = this.parent.parent.activeMyte;
                    if (activeMyte?.isActive) {
                        activeMyte.stats.updateMood(-1000);
                    }
                }
            },
            {
                id: 'setMaxMood',
                type: 'action',
                label: 'Max Mood',
                requiresActiveMyte: true,
                action: () => {
                    const activeMyte = this.parent.parent.activeMyte;
                    if (activeMyte?.isActive) {
                        activeMyte.stats.updateMood(1000);
                    }
                }
            },


            // Energy controls
            {
                id: 'setMinEnergy',
                type: 'action',
                label: 'Min Energy',
                requiresActiveMyte: true,
                action: () => {
                    const activeMyte = this.parent.parent.activeMyte;
                    if (activeMyte?.isActive) {
                        activeMyte.stats.useEnergy(1000);
                    }
                }
            },
            {
                id: 'setMaxEnergy',
                type: 'action',
                label: 'Max Energy',
                requiresActiveMyte: true,
                action: () => {
                    const activeMyte = this.parent.parent.activeMyte;
                    if (activeMyte?.isActive) {
                        activeMyte.stats.useEnergy(-1000);
                    }
                }
            },

            // Reset button (example)
            {
                id: 'resetCamera',
                type: 'reset',
                label: 'Reset Camera',
                action: () => {
                    this.parent.parent.camera.reset();
                }
            }
        ];

        this.init();
        this.setupDebugControls();
    }

    buttonLeftClick(e) {
        e.preventDefault();
        e.stopPropagation();
        this.toggle(); // Use the toggle method inherited from ModalWindow
        return false;
    }

    buttonRightClick(e) {
        this.buttonLeftClick(e);
    }

    init() {
        super.init();

        // Create the button container if it doesn't exist
        if (this.modalElement) {
            let buttonContainer = this.modalElement.querySelector('.modal-content');

            // Create buttons from config
            this.createButtons(buttonContainer);
        }
    }

    // Get target object based on path config
    getTargetObject(pathConfig) {
        if (!pathConfig || !pathConfig.path) {
            return null;
        }

        let target = this;
        for (const step of pathConfig.path) {
            if (!target[step]) return null;
            target = target[step];
        }
        return target;
    }

    // Get current value for a button based on its configuration
    getCurrentValue(config) {
        if (config.getValue) {
            return config.getValue();
        }

        if (config.target && config.requiresActiveMyte) {
            const activeMyte = this.parent.parent.activeMyte;
            if (activeMyte?.isActive) {
                // Special case for speed which is in stats
                if (config.target.property === 'speed' && activeMyte.stats) {
                    return activeMyte.stats.speed;
                }
            }
        }

        if (config.target) {
            const target = this.getTargetObject(config.target);
            if (target && config.target.property in target) {
                return target[config.target.property];
            }
        }

        return config.defaultValue || null;
    }

    // Set value for a button based on its configuration
    setValue(config, value) {
        if (config.target) {
            const target = this.getTargetObject(config.target);
            if (target && config.target.property in target) {
                target[config.target.property] = value;
                return true;
            }
        }
        return false;
    }

    // Handle a button click based on its type
    handleButtonClick(config, button) {
        // Just call the action function directly, which now handles everything
        if (config.action) {
            // For toggle buttons, pass the opposite of current value
            if (config.type === 'toggle') {
                const currentValue = this.getCurrentValue(config);
                const newValue = typeof currentValue === 'boolean' ? !currentValue : false;
                config.action(button, newValue);
            } else {
                // For all other buttons, just call the action
                config.action(button);
            }
        }
    }

    // Generic button update function that works with all button types
    updateButton(buttonId) {
        const button = document.getElementById(buttonId);
        if (!button) return;

        // Find the corresponding button config
        const config = this.buttonConfigs.find(cfg => cfg.id === buttonId);
        if (!config) return;

        // Use the updateButtonText method which handles all standard cases
        this.updateButtonText(config, button);
    }

    // Update button text based on its current value
    updateButtonText(config, button) {
        if (!button) return;

        let displayText = config.label || '';
        const currentValue = this.getCurrentValue(config);

        switch (config.type) {
            case 'cycle':
                if (currentValue !== null) {
                    // Use custom format function if available, otherwise use the default logic
                    if (config.format) {
                        displayText += config.format(currentValue);
                    } else if (config.options) {
                        const keyName = Utility.getKeyByValue(config.options, currentValue) || 'None';
                        displayText += keyName;
                    } else {
                        displayText += currentValue || 'None';
                    }
                } else {
                    displayText += 'None';
                }
                break;

            case 'toggle':
                if (config.states && typeof currentValue === 'boolean') {
                    displayText += config.states[currentValue];
                } else {
                    displayText += currentValue ? 'ON' : 'OFF';
                }

                // Add or remove 'active' class based on current value
                if (currentValue) {
                    button.classList.add('active');
                } else {
                    button.classList.remove('active');
                }
                break;

            case 'value':
                if (currentValue !== null) {
                    if (config.format) {
                        displayText += config.format(currentValue);
                    } else {
                        displayText += currentValue;
                    }
                } else if (config.defaultValue !== undefined) {
                    if (config.format) {
                        displayText += config.format(config.defaultValue);
                    } else {
                        displayText += config.defaultValue;
                    }
                }
                break;

            case 'multistate':
                if (currentValue !== null) {
                    displayText += currentValue;
                } else if (config.defaultState) {
                    displayText += config.defaultState;
                }
                break;

            case 'action':
            case 'reset':
                // For action buttons, just use the label
                break;

            default:
                displayText += 'Unknown';
        }

        button.innerText = displayText;
    }

    // Update all button texts
    updateButtons() {
        // Update all buttons based on their configurations
        if (this.buttonConfigs) {
            this.buttonConfigs.forEach(config => {
                this.updateButton(config.id);
            });
        }

        // Update button enabled/disabled state based on active myte
        this.updateButtonsEnabledState();
    }

    // Enable or disable buttons based on whether there's an active Myte
    updateButtonsEnabledState() {
        const hasMyte = this.parent.parent.activeMyte?.isActive === true;

        if (hasMyte) {
            this.enableButtons();
        } else {
            this.disableButtons();
        }
    }

    createButtons(container) {
        // Clear existing buttons
        if (!container) return;
        container.innerHTML = '';

        // Create section for general controls
        const generalSection = document.createElement('div');
        generalSection.className = 'settings-group general-controls';
        const mapSectionTitle = document.createElement('h3');
        mapSectionTitle.innerText = 'Map Controls';
        mapSectionTitle.className = 'settings-group-title';
        generalSection.appendChild(mapSectionTitle);

        // Create section for myte-specific controls
        const myteSection = document.createElement('div');
        myteSection.className = 'settings-group myte-controls';
        const myteSectionTitle = document.createElement('h3');
        myteSectionTitle.innerText = 'Myte Controls';
        myteSectionTitle.className = 'settings-group-title';
        myteSection.appendChild(myteSectionTitle);

        // Create section for stats controls
        const statsSection = document.createElement('div');
        statsSection.className = 'settings-group stats-controls';
        const statsSectionTitle = document.createElement('h3');
        statsSectionTitle.innerText = 'Stats Controls';
        statsSectionTitle.className = 'settings-group-title';
        statsSection.appendChild(statsSectionTitle);

        // Create buttons from config
        if (this.buttonConfigs) {
            this.buttonConfigs.forEach(config => {
                const button = document.createElement('button');
                button.id = config.id;
                button.className = 'debug-button';
                if (config.type) {
                    button.dataset.type = config.type;
                }

                // If button requires active myte, add appropriate class and disable if needed
                if (config.requiresActiveMyte) {
                    button.classList.add('requires-myte');
                    button.disabled = !this.parent.parent.activeMyte?.isActive;
                }

                // Set initial active state for toggle buttons
                if (config.type === 'toggle') {
                    const isActive = this.getCurrentValue(config);
                    if (isActive) {
                        button.classList.add('active');
                    }
                }

                // For value buttons, create a container with + and - buttons
                if (config.type === 'value') {
                    const buttonGroup = document.createElement('div');
                    buttonGroup.className = 'button-group';

                    // Create minus button
                    const minusBtn = document.createElement('button');
                    minusBtn.id = `${config.id}-down`;
                    minusBtn.className = 'value-button minus';
                    minusBtn.innerHTML = '-';
                    if (config.requiresActiveMyte) {
                        minusBtn.classList.add('requires-myte');
                        minusBtn.disabled = !this.parent.parent.activeMyte?.isActive;
                    }
                    buttonGroup.appendChild(minusBtn);

                    // Add the main button
                    buttonGroup.appendChild(button);

                    // Create plus button
                    const plusBtn = document.createElement('button');
                    plusBtn.id = `${config.id}-up`;
                    plusBtn.className = 'value-button plus';
                    plusBtn.innerHTML = '+';
                    if (config.requiresActiveMyte) {
                        plusBtn.classList.add('requires-myte');
                        plusBtn.disabled = !this.parent.parent.activeMyte?.isActive;
                    }
                    buttonGroup.appendChild(plusBtn);

                    // Add to appropriate section
                    if (config.id.startsWith('adjust') && config.requiresActiveMyte) {
                        statsSection.appendChild(buttonGroup);
                    } else if (config.requiresActiveMyte) {
                        myteSection.appendChild(buttonGroup);
                    } else {
                        generalSection.appendChild(buttonGroup);
                    }
                } else {
                    // Add the standard button to appropriate section
                    if (config.id.startsWith('set') && config.requiresActiveMyte) {
                        statsSection.appendChild(button);
                    } else if (config.requiresActiveMyte) {
                        myteSection.appendChild(button);
                    } else {
                        generalSection.appendChild(button);
                    }
                }

                // Set initial text using the updateButton function
                this.updateButton(config.id);
            });
        }

        // Add sections to container if they have children
        if (generalSection.childElementCount > 0) {
            container.appendChild(generalSection);
        }

        if (myteSection.childElementCount > 1) { // > 1 because it includes the title
            container.appendChild(myteSection);
        }

        if (statsSection.childElementCount > 1) { // > 1 because it includes the title
            container.appendChild(statsSection);
        }
    }

    setupDebugControls() {
        if (!this.modalElement) return;

        // Setup all button event listeners based on configuration
        if (this.buttonConfigs) {
            this.buttonConfigs.forEach(config => {
                const button = document.getElementById(config.id);
                if (button) {
                    // Set up event listener
                    button.addEventListener('click', () => {
                        this.handleButtonClick(config, button);
                    });

                    // For value buttons, setup additional controls if needed
                    if (config.type === 'value') {
                        this.setupValueControls(config, button);
                    }
                }
            });
        }


    }

    // Setup controls for value-type buttons (if needed)
    setupValueControls(config, button) {
        const incrementBtn = document.getElementById(`${config.id}-up`);
        const decrementBtn = document.getElementById(`${config.id}-down`);

        if (incrementBtn) {
            incrementBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent triggering the main button
                e.preventDefault(); // Prevent any default behavior

                // Get the current value from the active Myte if it exists
                let currentValue;
                if (config.requiresActiveMyte && this.parent.parent.activeMyte?.isActive) {
                    const activeMyte = this.parent.parent.activeMyte;
                    if (config.target.property === 'speed' && activeMyte.stats) {
                        currentValue = activeMyte.stats.speed;
                        console.log(`Current speed value:`, currentValue);
                    } else {
                        currentValue = config.defaultValue || 0;
                    }
                } else {
                    currentValue = this.getCurrentValue(config) || config.defaultValue || 0;
                }

                const step = config.step || 1;
                const max = config.max || Infinity;
                const newValue = Math.min(currentValue + step, max);

                if (config.action) {
                    config.action(button, newValue);
                } else {
                    this.setValue(config, newValue);
                    this.updateButton(config.id);
                }
            });
        }

        if (decrementBtn) {
            decrementBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent triggering the main button
                e.preventDefault(); // Prevent any default behavior

                // Get the current value from the active Myte if it exists
                let currentValue;
                if (config.requiresActiveMyte && this.parent.parent.activeMyte?.isActive) {
                    const activeMyte = this.parent.parent.activeMyte;
                    if (config.target.property === 'speed' && activeMyte.stats) {
                        currentValue = activeMyte.stats.speed;
                    } else {
                        currentValue = config.defaultValue || 0;
                    }
                } else {
                    currentValue = this.getCurrentValue(config) || config.defaultValue || 0;
                }

                const step = config.step || 1;
                const min = config.min || -Infinity;
                const newValue = Math.max(currentValue - step, min);

                if (config.action) {
                    config.action(button, newValue);
                } else {
                    this.setValue(config, newValue);
                    this.updateButton(config.id);
                }
            });
        }

        // Add a click handler for the main button to reset to default
        if (button && config.defaultValue !== undefined) {
            button.addEventListener('click', (e) => {
                e.stopPropagation();

                if (config.action) {
                    config.action(button, config.defaultValue);
                } else {
                    this.setValue(config, config.defaultValue);
                    this.updateButton(config.id);
                }
            });
        }
    }

    enableButtons() {
        this.isActive = true;
        document.querySelectorAll('.debug-button.requires-myte, .value-button.requires-myte').forEach(button => {
            button.disabled = false;
        });
    }

    disableButtons() {
        this.isActive = false;
        document.querySelectorAll('.debug-button.requires-myte, .value-button.requires-myte').forEach(button => {
            button.disabled = true;
        });
    }

    // Override the open method to update all buttons before opening
    open() {
        this.updateButtons();
        super.open();
    }
}
