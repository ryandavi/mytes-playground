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

    setupDebugControls() {
        if (!this.modalElement) return;

        // Follow goal button
        document.getElementById("cycleFollowGoal").addEventListener("click", () => {
            const activeMyte = this.parent.parent.activeMyte;
            if (activeMyte.isActive) {
                let next = Utility.getNextKey(activeMyte.followGoal, MOVE_FOLLOW_TYPES);
                activeMyte.setFollowMode(next);
            }
        });

        // Goal cycle button
        document.getElementById("cycleGoal").addEventListener("click", () => {
            const activeMyte = this.parent.parent.activeMyte;
            if (activeMyte.isActive) {
                let next = Utility.getNextKey(activeMyte.goal, MOVE_TYPES);
                activeMyte.setMode(next);
            }
        });

        // Skip queue button
        document.getElementById("skipQueue").addEventListener("click", () => {
            const activeMyte = this.parent.parent.activeMyte;
            if (activeMyte.isActive) {
                activeMyte.queue.removeCurrentAction();
                activeMyte.unset_target();
            }
        });

        // Camera cycle button
        document.getElementById("cycleCamera").addEventListener("click", () => {
            let camera = this.parent.parent.camera;
            let next = Utility.getNextKey(camera.followMode, CAMERA_FOLLOW_MODES);
            camera.setMode(next);
        });
        this.updateCycleCamera(document.getElementById("cycleCamera"));

        // Debug toggle
        document.getElementById('toggleDebug').addEventListener("click", (event) => {
            document.body.classList.toggle('debug');
            this.updateDebug(event.target);
        });

        // Container limit toggle
        document.getElementById('cycleContainerLimit').addEventListener("click", (event) => {
            this.parent.parent.settings.limitMap = !this.parent.parent.settings.limitMap;
            this.updateContainerLimit(event.target);
        });

        this.updateContainerLimit(document.getElementById('cycleContainerLimit'));
    }

    updateFollowMode(button) {
        let modeKey = this.parent.parent.activeMyte ? Utility.get_key_by_value(MOVE_FOLLOW_TYPES, this.parent.parent.activeMyte.followGoal) : "None";
        button.innerText = "Follow Mode: " + modeKey;
    }

    updateGoal(button) {
        let modeKey = this.parent.parent.activeMyte ? Utility.get_key_by_value(MOVE_TYPES, this.parent.parent.activeMyte.goal) : "None";
        button.innerText = "Goal: " + modeKey;
    }

    updateDebug(button) {
        button.innerText = "Debug: " + (document.body.classList.contains('debug') ? "ON" : "OFF");
    }

    updateContainerLimit(button) {
        if (this.parent.parent.settings.limitMap) {
            this.parent.parent.camera.isScrollable.x = true;
            this.parent.parent.camera.isScrollable.y = true;
            this.parent.parent.element.closest('.container').classList.add('noScroll');
            this.parent.parent.camera.reset();
        } else {
            this.parent.parent.camera.isScrollable.x = false;
            this.parent.parent.camera.isScrollable.y = false;
            this.parent.parent.element.closest('.container').classList.remove('noScroll');
        }

        button.innerText = "Limit: " + (this.parent.parent.settings.limitMap ? "ON" : "OFF");
    }

    updateCycleCamera(button) {
        let modeKey = Utility.get_key_by_value(CAMERA_FOLLOW_MODES, this.parent.parent.camera.followMode);
        button.innerText = "Camera: " + modeKey;
    }

    enableButtons() {
        this.isActive = true;
        document.querySelectorAll('#controls button.myte').forEach(button => {
            button.disabled = false;
        });
    }

    disableButtons() {
        this.isActive = false;
        document.querySelectorAll('#controls button.myte').forEach(button => {
            button.disabled = true;
        });
    }

    updateButtons() {
        this.updateFollowMode(document.getElementById("cycleFollowGoal"));
        this.updateGoal(document.getElementById("cycleGoal"));
        this.updateDebug(document.getElementById('toggleDebug'));
        this.updateCycleCamera(document.getElementById("cycleCamera"));
        this.updateContainerLimit(document.getElementById('cycleContainerLimit'));
    }

    // Override the open method to load current debug before opening
    open() {
        super.open();
    }
}