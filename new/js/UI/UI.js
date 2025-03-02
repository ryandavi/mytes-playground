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


class WindowDragHandler extends DragHandler {
    constructor(windowElement) {
        super({
            element: windowElement,
            onDragStart: () => {
                windowElement.classList.add('dragging');
            },
            onDragUpdate: (position) => {

                // Apply new position
                windowElement.style.left = `${position.x}px`;
                windowElement.style.top = `${position.y}px`;
                
                // Temporarily remove the transform during drag
                windowElement.style.transform = 'none';
            },
            onDragEnd: () => {
                windowElement.classList.remove('dragging');
            }
        });

        this.windowElement = windowElement;
        this.initialRect = null;
        this.mouseOffsetX = 0;
        this.mouseOffsetY = 0;
        this.initialLeft = 0;
        this.initialTop = 0;
    }
}

class UserInterface {
    constructor(parent) {
        this.parent = parent;
        this.debug = new Debug(parent);
        this.isActive = false;

        this.selectedObject = null;

        // this.handControlDragHandler = new WindowDragHandler(this.parent.containerWrapper.querySelector('#hand-controls'));

        // this.actionControlDragHandler = new WindowDragHandler(this.parent.containerWrapper.querySelector('.sidebar'));

        // Tool mode handling
        this.currentToolMode = UIToolModes.SELECT;
        this.handControls = this.parent.containerWrapper.querySelector('#hand-controls');
        this.actionControls = this.parent.containerWrapper.querySelector('#action-controls');

        // Initialize cursor manager
        // this.cursorManager = new CursorManager(parent);
    }

    init() {
        // Initialize hand controls
        this.initializeHandControls();

        // Original button initialization
        this.initializeButtons();

        // Initialize active mytes
        this.initActiveMytes();
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

	createThumbnail(myte) {
        const thumbnail = document.createElement('div');
        thumbnail.classList.add('myte-thumbnail');

		if(myte === this.activeMyte){
			thumbnail.classList.add('active');
		}
		
		thumbnail.setAttribute('data-myte-id', myte.id);
        
        // Create sprite container
        const spriteContainer = document.createElement('div');
        spriteContainer.className = 'myte-sprite';
        
        const spriteInner = document.createElement('div');
        spriteInner.className = 'myte-sprite-inner';
        spriteContainer.appendChild(spriteInner);

        // Create name element
        const name = document.createElement('span');
        name.className = 'myte-name';
        name.textContent = myte.name;

        // Build thumbnail
        thumbnail.appendChild(spriteContainer);
        thumbnail.appendChild(name);


        // Add click handler
        thumbnail.addEventListener('click', () => {
            if (myte !== this.activeMyte) {
                this.parent.setActiveMyte(myte);
            }
        });

        return thumbnail;
    }

    initActiveMytes() {
		// find #all_mytes
		const listContainer = document.getElementById('all_mytes');

        // Add thumbnails
        if (this.parent.mytes && this.parent.mytes.length > 0) {
            this.parent.mytes.forEach(myte => {
                listContainer.appendChild(this.createThumbnail(myte));
            });
        } else {
            // No Mytes
            const emptyState = document.createElement('div');
			emptyState.className = 'empty';
            emptyState.textContent = 'No Mytes found';
            listContainer.appendChild(emptyState);
        }

    }

    // Update HUD to show mood from metadata
    updateHud() {
        const activePet = document.querySelector('#hud-active-pet');
        const activeMyte = this.parent.activeMyte;

        if (!activeMyte) {
            activePet.classList.remove('visible');
            return;
        }

        if (!activePet.classList.contains('visible')) {
            activePet.classList.add('visible');
        }

        activePet.querySelector('.name').textContent = activeMyte.name;
        activePet.querySelector('.mood').textContent = activeMyte.stats.getMoodStatus();
        activePet.querySelector('.energy').textContent = 'Full';

        // Add stats from current action if any
        const currentAction = activeMyte.queue.getCurrentAction();
        if (currentAction) {
            const actionMetadata = currentAction.constructor.metadata;
            if (actionMetadata.affectsMood) {
                const moodEffect = document.createElement('div');
                moodEffect.className = 'mood-effect';
                moodEffect.textContent = `Mood ${actionMetadata.moodEffect > 0 ? '+' : ''}${actionMetadata.moodEffect}`;
                activePet.appendChild(moodEffect);
            }
        }
    }

    setSelected(obj) {
        const deselect = (object) => {
            if (object instanceof Myte){
                object.duplicate.classList.remove('selected');
            }else if (object instanceof MapObject){
                object.element.classList.remove('selected');
            }else{
                object.classList.remove('selected');
            }
        };
    
        const select = (object) => {
            if (object instanceof Myte){
                object.duplicate.classList.add('selected');
            }else if (object instanceof MapObject){
                 object.element.classList.add('selected');
            } else {
                object.classList.add('selected');
            }
        };
    
        // Deselect current object
        if (this.selectedObject) deselect(this.selectedObject);
    
        // Toggle selection
        this.selectedObject = this.selectedObject === obj ? null : obj;
    
        // Select new object
        if (this.selectedObject) select(this.selectedObject);
    
        this.updateActions();
    }

    setToolMode(mode) {
        if (this.currentToolMode === mode) return;

        // Set mode
        this.currentToolMode = mode;

        // update action list
        this.updateActions();
        
        // unset selected
        this.setSelected(null);
    }

    isTool(mode){
        return this.currentToolMode === mode;
    }


    emptyActionList(){
        const listElement = this.actionControls.querySelector('.action-list');    
        listElement.innerHTML = '';
        this.actionControls.classList.remove('visible');
    }


    // Helper method to get category titles
    getCategoryTitle(category) {
        const titles = {
            movement: 'Movement',
            state: 'State',
            interactions: 'Interactions',
            play: 'Play',
            reactive: 'Reactive',
            carrying: 'Active Actions'
        };
        return titles[category] || category;
    }

updateActions() {


    const selectedInfo = this.actionControls.querySelector('.selected-info');
    if (!selectedInfo) return;

    const interactionType = selectedInfo.querySelector('.interaction-type .type');
    const targetType = selectedInfo.querySelector('.target-info .type');
    const targetName = selectedInfo.querySelector('.target-info .name');

    // Remove all state classes first
    selectedInfo.classList.remove('self-selected', 'myte-interaction', 'map-interaction', 'element-interaction');
    this.emptyActionList();

    if (this.selectedObject) {
        // Determine interaction type based on selected object
        if (this.selectedObject === this.parent.activeMyte) {
            interactionType.textContent = "Selected Self";
            selectedInfo.classList.add('self-selected');
            targetType.textContent = "Myte";
            targetName.textContent = this.selectedObject.name;
        } else {
            interactionType.textContent = "Interacting with";
            
            // Set target type and name based on object type
            if (this.selectedObject instanceof Myte) {
                selectedInfo.classList.add('myte-interaction');
                targetType.textContent = "Myte";
                targetName.textContent = this.selectedObject.name;
            } else if (this.selectedObject instanceof MapObject) {
                selectedInfo.classList.add('map-interaction');
                targetType.textContent = "Object";
                targetName.textContent = this.selectedObject.type;
            } else if (this.selectedObject instanceof Element) {
                selectedInfo.classList.add('element-interaction');
                targetType.textContent = "Element";
                targetName.textContent = this.selectedObject.tagName;
            } else {
                selectedInfo.classList.add('element-interaction');
                targetType.textContent = "Element";
                targetName.textContent = this.selectedObject.tagName;
            }
        }

        selectedInfo.classList.add('visible');
        this.updateActionList();
    } else {
        interactionType.textContent = "Not Selected";
        targetType.textContent = "-";
        targetName.textContent = "None";
        selectedInfo.classList.remove('visible');
    }


}

    emptyActionList() {
        const actionGroups = this.actionControls.querySelector('.action-groups');
        actionGroups.innerHTML = '';
        this.actionControls.classList.remove('visible');
    }

    updateActionList() {
        const actionGroups = this.actionControls.querySelector('.action-groups');
        const activeMyte = this.parent.activeMyte;
    
        // Get actions grouped by category from ActionManager
        const groupedActions = ActionManager.getActionsByCategory(this.selectedObject, activeMyte);
    
        // Create elements for each group
        Object.entries(groupedActions).forEach(([category, actions]) => {
            const groupElement = document.createElement('div');
            groupElement.className = `action-group ${category}`;
    
            const title = document.createElement('h3');
            title.textContent = this.getCategoryTitle(category);
            groupElement.appendChild(title);
    
            const actionList = document.createElement('ul');
            actions.forEach(action => {
                const li = document.createElement('li');
                const button = document.createElement('button');
                button.textContent = action.label;
                if (action.description) {
                    button.title = action.description;
                }
        
                // click event for actions
                button.addEventListener('click', () => {
                    const options = ActionManager.getActionRequirements(
                        action.id, 
                        this.selectedObject, 
                        activeMyte
                    );

                    console.log(options);
                    
                    if (options) {
                        activeMyte.queue.add(action.id, options);
                        // this.updateActions();
                    }
                });
        
                li.appendChild(button);
                actionList.appendChild(li);
            });
    
            groupElement.appendChild(actionList);
            actionGroups.appendChild(groupElement);
        });
    
        if (actionGroups.children.length > 0) {
            this.actionControls.classList.add('visible');
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
                    myte.stats.updateMood(10);
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