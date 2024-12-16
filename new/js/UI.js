class CursorManager {
    constructor(parent) {
        this.parent = parent;
        this.cursorElement = document.getElementById('customCursor');

        this.sprites = {
            POINTER: {
                sprites: [
                    [0, 0]
                ]
            },
            GRAB: {
                sprites: [
                    [0, 0]
                ]
            },
            GRAB_TO_GRABBING: {
                sprites: [
                    [160, 32],
                    [192, 32],
                    [224, 32],
                    [256, 32],
                    [288, 32]
                ],
                nextState: 'GRABBING',
            },
            GRABBING_TO_GRAB: {
                sprites: [
                    [160, 32],
                    [192, 32],
                    [224, 32],
                    [256, 32],
                    [288, 32]
                ],
                nextState: 'GRAB',
            },
            GRABBING: {
                sprites: [
                    [288, 32]
                ]
            }
        };

        this.currentState = DEFAULT_CURSOR;
        // this.setCursor(this.currentState);

        document.addEventListener('mousemove', (event) => {
            this.moveCursor(event);
        });

    }

    moveCursor(event) {
        this.cursorElement.style.left = `${event.clientX}px`;
        this.cursorElement.style.top = `${event.clientY}px`;
    }

    setCursor(cursorType) {
        this.currentState = cursorType;
        switch (cursorType) {
            case CURSOR.POINTER:
                this.cursorElement.style.backgroundImage = "url('pointer.png')";
                break;
            case CURSOR.GRAB:
                this.cursorElement.style.backgroundImage = "url('grab.png')";
                break;
            case CURSOR.GRABBING:
                this.cursorElement.style.backgroundImage = "url('grabbing.png')";
                break;
            case CURSOR.ARROW_UP:
                this.cursorElement.style.backgroundImage = "url('arrow_up.png')";
                break;
            case CURSOR.ARROW_DOWN:
                this.cursorElement.style.backgroundImage = "url('arrow_down.png')";
                break;
            case CURSOR.ARROW_LEFT:
                this.cursorElement.style.backgroundImage = "url('arrow_left.png')";
                break;
            case CURSOR.ARROW_RIGHT:
                this.cursorElement.style.backgroundImage = "url('arrow_right.png')";
                break;
            case CURSOR.MOVE:
                this.cursorElement.style.backgroundImage = "url('move.png')";
                break;
            case CURSOR.NO:
                this.cursorElement.style.backgroundImage = "url('no.png')";
                break;
            default:
                console.error("Invalid cursor type.");
        }
    }

    update(){
            
        const isClicking = this.parent.isClicking;
        const hasClickingClass = this.cursorElement.classList.contains('clicking');
    
        if(isClicking && !hasClickingClass) {
            this.cursorElement.classList.add('clicking');
        } else if (!isClicking && hasClickingClass) {
            this.cursorElement.classList.remove('clicking');
        }
    }

}

// State machine for the fetch game stages
const UIToolModes = {
    SELECT: 'select',
    DRAG: 'drag',
    PET: 'pet'
};

class UserInterface {
    constructor(parent) {
        this.parent = parent;
        this.debug = new Debug(parent);
        this.isActive = false;

        // Tool mode handling
        this.currentToolMode = UIToolModes.SELECT;
        this.handControls = this.parent.containerWrapper.querySelector('#hand-controls');

        console.log( this.parent.element);
        
        // Initialize cursor manager
        // this.cursorManager = new CursorManager(parent);
    }

    init() {
        // Initialize hand controls
        this.initializeHandControls();

        // Original button initialization
        this.initializeButtons();
    }

    initializeHandControls() {
        if (!this.handControls) {
            console.error('Hand controls element not found');
            return;
        }

        // Add event listeners to all radio inputs in hand-controls
        const radioInputs = this.handControls.querySelectorAll('input[type="radio"]');
        
        radioInputs.forEach(input => {
            input.addEventListener('change', (event) => {
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
            });
        });

        // Set initial mode
        this.setToolMode(UIToolModes.SELECT);
    }

    setToolMode(mode) {
        if (this.currentToolMode === mode) return;

        this.currentToolMode = mode;
        this.updateMyteBehavior();
    }

    isTool(mode){
        return this.currentToolMode === mode;
    }


    updateMyteBehavior() {
        const activeMyte = this.parent.activeMyte;
        if (!activeMyte) return;

        switch (this.currentToolMode) {
            case UIToolModes.SELECT:
                //activeMyte.checkForCollisions = true;
                break;

            case UIToolModes.DRAG:
                //activeMyte.checkForCollisions = false;
                break;

            case UIToolModes.PET:
                //activeMyte.checkForCollisions = true;
                //this.setupPettingBehavior(activeMyte);
                break;
        }
    }

    setupPettingBehavior(myte) {
        if (myte.duplicate) {
            const newElement = myte.duplicate.cloneNode(true);
            myte.duplicate.parentNode.replaceChild(newElement, myte.duplicate);
            myte.duplicate = newElement;
            
            myte.duplicate.addEventListener('click', () => {
                if (this.currentToolMode === UIToolModes.PET) {
                    myte.queue.addExpression('happy');
                    myte.updateMood(10);
                }
            });
        }
    }

    // Original button initialization method
    initializeButtons() {
        // Follow goal button
        document.getElementById("cycleFollowGoal").addEventListener("click", () => {
            const activeMyte = this.parent.activeMyte;
            if (activeMyte.isActive) {
                let next = Utility.getNextKey(activeMyte.followGoal, MOVE_FOLLOW_TYPES);
                activeMyte.setFollowMode(next);
            }
        });

        // Goal cycle button
        document.getElementById("cycleGoal").addEventListener("click", () => {
            const activeMyte = this.parent.activeMyte;
            if (activeMyte.isActive) {
                let next = Utility.getNextKey(activeMyte.goal, MOVE_TYPES);
                activeMyte.setMode(next);
            }
        });

        // Skip queue button
        document.getElementById("skipQueue").addEventListener("click", () => {
            const activeMyte = this.parent.activeMyte;
            if (activeMyte.isActive) {
                activeMyte.queue.removeCurrentAction();
                activeMyte.unset_target();
            }
        });

        // Camera cycle button
        document.getElementById("cycleCamera").addEventListener("click", () => {
            let camera = this.parent.camera;
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
            if(this.parent.activeMyte) {
                this.parent.activeMyte.limitToContainer = !this.parent.activeMyte.limitToContainer;
            }
            this.updateContainerLimit(event.target);
        });
        this.updateContainerLimit(document.getElementById('cycleContainerLimit'));
    }

    // Keep all your existing update methods
    updateFollowMode(button) {
        let modeKey = this.parent.activeMyte ? Utility.get_key_by_value(MOVE_FOLLOW_TYPES, this.parent.activeMyte.followGoal) : "None";
        button.innerText = "Follow Mode: " + modeKey;
    }

    updateGoal(button) {
        let modeKey = this.parent.activeMyte ? Utility.get_key_by_value(MOVE_TYPES, this.parent.activeMyte.goal) : "None";
        button.innerText = "Goal: " + modeKey;
    }

    updateDebug(button) {
        button.innerText = "Debug: " + (document.body.classList.contains('debug') ? "ON" : "OFF");
    }

    updateContainerLimit(button) {
        if(this.parent.activeMyte) {
            if(this.parent.activeMyte.limitToContainer == false) {
                this.parent.camera.isScrollable.x = false;
                this.parent.camera.isScrollable.y = false;
                this.parent.element.closest('.container').classList.add('noScroll');
                this.parent.camera.reset();
            } else {
                this.parent.camera.isScrollable.x = true;
                this.parent.camera.isScrollable.y = true;
                this.parent.element.closest('.container').classList.remove('noScroll');
            }

            button.innerText = "Limit: " + (this.parent.activeMyte.limitToContainer ? "ON" : "OFF");
        } else {
            button.innerText = "Limit: None";
        }
    }

    updateCycleCamera(button) {
        let modeKey = Utility.get_key_by_value(CAMERA_FOLLOW_MODES, this.parent.camera.followMode);
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

    update() {
        this.debug.update();
        // this.cursorManager.update();
    }
}