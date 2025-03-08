class CommandSystem {
    constructor(myte) {
        this.myte = myte;
        this.commandButtons = null;
        
        // Define command configurations
        this.commandConfigs = {
            'kiss': {
                icon: '♥️',  // Using a heart instead of 💋 which might not display correctly
                label: 'Kiss',
                action: (targetMyte) => {
                    const activeMyte = this.myte.parent.activeMyte;
                    if (!activeMyte) return;
                    activeMyte.queue.addJump();
                }
            },
            'dance': {
                icon: '🎵',  // Using musical note instead of 💃 which might not display correctly
                label: 'Dance',
                action: (targetMyte) => {
                    const activeMyte = this.myte.parent.activeMyte;
                    // targetMyte.queue.addSpin();
                    if (activeMyte) {
                        targetMyte.queue.addRunAway(activeMyte);
                    }
                }
            },
            'carry': {
                icon: '👆',  // Using pointer instead of 🤲 which might not display correctly
                label: 'Carry',
                alternateName: 'Put Down',
                action: (targetMyte) => {
                    const activeMyte = this.myte.parent.activeMyte;
                    if (!activeMyte) return;
                    if (targetMyte.queue.isBeingCarried()) {
                        activeMyte.queue.addPutDownMyte(targetMyte);
                    } else {
                        activeMyte.queue.addPickupMyte(targetMyte);
                    }
                }
            },
            'follow': {
                icon: '👉',  // Using pointer instead of 👣 which might not display correctly
                label: 'Follow',
                alternateName: 'Stop Following',
                action: (targetMyte) => {
                    const activeMyte = this.myte.parent.activeMyte;
                    if (!activeMyte) return;
                    if (targetMyte.queue.getCurrentAction()?.action === 'follow_object') {
                        targetMyte.queue.clear();
                    } else {
                        activeMyte.queue.addFollowObject(targetMyte);
                    }
                }
            }
        };
    }

    createCommandButtons() {
        // Clear existing commands
        if (this.commandButtons) {
            this.commandButtons.innerHTML = '';
        } else {
            // Create commands container if it doesn't exist
            this.commandButtons = document.createElement('div');
            this.commandButtons.className = 'commands';
            this.myte.duplicate.querySelector('.inner-wrapper').appendChild(this.commandButtons);
        }

        // Create buttons for each command
        Object.entries(this.commandConfigs).forEach(([commandName, config]) => {
            const button = document.createElement('button');
            button.dataset.command = commandName;
            
            // Set initial button text based on state
            this.updateButtonText(button, commandName);
            
            button.className = 'command-button';
            this.commandButtons.appendChild(button);
        });
    }

    updateButtonText(button, commandName) {
        const config = this.commandConfigs[commandName];
        let label = config.label;

        // Change button text based on state
        if (commandName === 'carry' && this.myte.queue.isBeingCarried()) {
            label = config.alternateName;
        } else if (commandName === 'follow' && 
                  this.myte.queue.getCurrentAction()?.action === 'follow_object') {
            label = config.alternateName;
        }

        button.innerHTML = `${config.icon} ${label}`;
    }

    init() {
        this.commandButtons = this.myte.duplicate.querySelector('.commands');
        this.createCommandButtons();
        this.updateCommandsVisibility();

        // Setup click handlers using event delegation
        if (this.commandButtons) {
            this.commandButtons.addEventListener('click', (e) => {
                const button = e.target.closest('button');
                if (!button) return;

                e.stopPropagation(); // Prevent event bubbling
                const commandName = button.dataset.command;
                if (this.commandConfigs[commandName]) {
                    this.commandConfigs[commandName].action(this.myte);
                    this.updateButtonText(button, commandName);
                }
            });
        }
    }

    updateCommandsVisibility() {
        if (!this.commandButtons) return;
        const shouldShow = this.myte.isActive && !this.myte.isActiveMyte;
        this.commandButtons.style.display = shouldShow ? 'flex' : 'none';

        // Update all button texts
        if (shouldShow) {
            this.commandButtons.querySelectorAll('button').forEach(button => {
                const commandName = button.dataset.command;
                this.updateButtonText(button, commandName);
            });
        }
    }
}