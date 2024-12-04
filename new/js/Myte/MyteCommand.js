// Add to MyteInteraction.js
class CommandSystem {
    constructor(myte) {
        this.myte = myte;
        this.commandButtons = null;
        
        // Define command configurations
        this.commandConfigs = {
            'kiss': {
                icon: '💋',
                action: (targetMyte) => {
                    const activeMyte = this.myte.parent.activeMyte;
                    if (!activeMyte) return;
                    activeMyte.queue.addInteraction(targetMyte, 'kiss');
                }
            },
            'dance': {
                icon: '💃',
                action: (targetMyte) => {
                    const activeMyte = this.myte.parent.activeMyte;
                    targetMyte.queue.addExpression('dance', 2000);
                    if (activeMyte) {
                        activeMyte.queue.addExpression('dance', 2000);
                    }
                }
            },
            'carry': {
                icon: '🤲',
                action: (targetMyte) => {
                    const activeMyte = this.myte.parent.activeMyte;
                    if (!activeMyte || activeMyte.interactionSystem.carriedEntity) return;
					activeMyte.queue.addInteraction(targetMyte, 'pickup');
                }
            },
            'follow': {
                icon: '👣',
                action: (targetMyte) => {
                    const activeMyte = this.myte.parent.activeMyte;
                    if (!activeMyte) return;
					activeMyte.queue.addFollowObject(targetMyte);
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
            button.innerHTML = `${config.icon} ${commandName}`;
            button.className = 'command-button';
            this.commandButtons.appendChild(button);
        });
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
                }
            });
        }
    }

    updateCommandsVisibility() {
        if (!this.commandButtons) return;
        const shouldShow = this.myte.isActive && !this.myte.isActiveMyte;
        this.commandButtons.style.display = shouldShow ? 'flex' : 'none';
    }
}