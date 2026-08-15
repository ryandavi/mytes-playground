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
            },
            [UIToolModes.MOVE]: {
                id: 'move-toggle',
                label: 'Move',
                cursor: 'grab',
                shortcut: '1',
                buildOnly: true
            },
            [UIToolModes.BUILD]: {
                id: 'build-toggle',
                label: 'Walls',
                cursor: 'crosshair',
                shortcut: '2',
                buildOnly: true
            },
            [UIToolModes.CUSTOMIZE]: {
                id: 'customize-toggle',
                label: 'Paint',
                cursor: 'pointer',
                shortcut: '3',
                buildOnly: true
            }
        };
    }

    get gameMode() {
        return this.parent.parent?.gameMode || null;
    }

    isBuildTool(mode) {
        return this.toolConfig[mode]?.buildOnly === true;
    }

    // The tool each mode falls back to when it is entered or when a tool is
    // refused.
    getDefaultToolFor(gameMode = this.gameMode?.mode) {
        return gameMode === GAME_MODES.BUILD ? UIToolModes.MOVE : UIToolModes.SELECT;
    }

    applyToolModeState(mode) {
        document.body.dataset.toolMode = mode;
        this.parent.containerWrapper?.setAttribute('data-tool-mode', mode);
        this.syncToolButtons(mode);
    }

    syncToolButtons(mode) {
        this.handControls?.querySelectorAll('.tool-btn[data-tool-mode]').forEach(button => {
            const active = button.dataset.toolMode === mode;
            button.classList.toggle('active', active);
            button.setAttribute('aria-pressed', String(active));
        });
    }

    init() {
        this.initializeHandControls();
    }

    initializeHandControls() {
        if (!this.handControls) {
            console.error('Hand controls element not found');
            return;
        }

        const modeByRadioId = Object.fromEntries(
            Object.entries(this.toolConfig).map(([mode, config]) => [config.id, mode])
        );

        this.handControls.querySelectorAll('input[type="radio"]').forEach(input => {
            const mode = modeByRadioId[input.id];
            if (!mode) return;

            const handleChange = () => this.setToolMode(mode);
            input.addEventListener('change', handleChange);
            this.listenerCleanup.push(() => input.removeEventListener('change', handleChange));

            // Right-click picks a tool too, so the mouse never has to travel to
            // the sidebar mid-gesture.
            const forceSelect = (event) => {
                event.preventDefault();
                input.checked = true;
                input.dispatchEvent(new Event('change'));
                return false;
            };
            input.addEventListener('contextmenu', forceSelect);
            this.listenerCleanup.push(() => input.removeEventListener('contextmenu', forceSelect));

            const label = this.handControls.querySelector(`label[for="${input.id}"]`);
            if (label) {
                label.addEventListener('contextmenu', forceSelect);
                this.listenerCleanup.push(() => label.removeEventListener('contextmenu', forceSelect));
            }
        });

        this.handControls.querySelectorAll('.tool-btn[data-tool-mode]').forEach(button => {
            const handleClick = (event) => {
                event.preventDefault();
                event.stopPropagation();
                this.setToolMode(button.dataset.toolMode);
            };
            button.addEventListener('click', handleClick);
            this.listenerCleanup.push(() => button.removeEventListener('click', handleClick));
        });

        this.setToolMode(UIToolModes.SELECT);
        this.applyToolModeState(this.currentToolMode);
    }

    /**
     * Build tools exist only inside Build mode. CSS hides their buttons, but a
     * keyboard shortcut bypasses CSS — this is the gate that actually holds.
     */
    canUseTool(mode) {
        if (!this.toolConfig[mode]) return false;
        return this.isBuildTool(mode) === (this.gameMode?.isBuild() === true);
    }

    setToolMode(mode) {
        if (!this.canUseTool(mode)) return;

        if (this.currentToolMode === mode) {
            this.applyToolModeState(mode);
            return;
        }

        this.parent.playSound('hover');

        this.currentToolMode = mode;
        this.applyToolModeState(mode);

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
        if (!this.canUseTool(mode)) return false;

        const element = document.getElementById(toolConfig.id);
        if (!element) {
            Utility.warnDebug(`Could not find control for tool: ${toolConfig.id}`);
            return false;
        }

        if (element.type === 'radio') {
            element.checked = true;
            element.dispatchEvent(new Event('change'));
            this.currentToolMode = mode;
            this.applyToolModeState(mode);
            return true;
        }

        this.setToolMode(mode);
        return true;
    }

    // Called by the mode switch: drop whatever tool the previous mode owned.
    handleGameModeChanged(gameMode) {
        const fallback = this.getDefaultToolFor(gameMode);
        if (!this.canUseTool(this.currentToolMode) || this.currentToolMode === fallback) {
            this.currentToolMode = fallback;
            this.applyToolModeState(fallback);
            this.parent.onToolModeChanged(fallback);
            return;
        }
        this.changeToolMode(fallback);
    }

    dispose() {
        this.listenerCleanup.forEach(cleanup => cleanup());
        this.listenerCleanup = [];
    }
}
