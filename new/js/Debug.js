class Debug {
    constructor(parent) {
        this.parent = parent;
        this.debug = document.querySelector(".debugMenu");
        this.queue = document.querySelector(".queueMenu");
        this.cameraEnabled = false; // Assuming this should be initialized
        this.camera = null; // Initialize camera object if needed
    }

    generateDebugMessage(label, value) {
        return `<div class='debug'>${label}: ${value}</div>`;
    }

    updateDebug() {

        let debugMessages = [
            { label: "User Active", value: this.parent.isActive },
			{ label: "Local Mouse", value: `${this.parent.getLocalMouse().x.toFixed(2)}px, ${this.parent.getLocalMouse().y.toFixed(2)}px` },
            { label: "Mouse", value: `${this.parent.mousePosX.toFixed(2)}px, ${this.parent.mousePosY.toFixed(2)}px` },
            // { label: "Cursor", value: this.parent.userInterface.cursorManager.currentState },
        ];

        let myteMessages = [];
        const activeMyte = this.parent.activeMyte;
        if(activeMyte){
            myteMessages =[
                { label: "Myte Active", value: activeMyte.isActive },
                { label: "Mood", value: `${this.parent.activeMyte.mood.toFixed(1)} (${this.parent.activeMyte.getMoodStatus()})` },
                { label: "At Target", value: activeMyte.is_at_target() },
                { label: "Goal", value: activeMyte.get_move_type(activeMyte.goal) },
                { label: "Previous Goal", value: activeMyte.get_move_type(activeMyte.previousGoal) },
                { label: "Follow Goal", value: activeMyte.get_move_follow_type(activeMyte.followGoal) },
                { label: "Speed", value: activeMyte.get_speed() },
                { label: "Is Moving", value: activeMyte.is_moving() },
                { label: "State", value: activeMyte.stateMachine.stateController.currentState },

                { label: "Transition", value: activeMyte.stateMachine.stateController.isTransitioning },

                
                { label: "Direction", value: activeMyte.direction },
                { label: "Is Dragging", value: activeMyte.isDragging },

                { label: "Pos", value: `${activeMyte.posX.toFixed(2)}px, ${activeMyte.posY.toFixed(2)}px` },
                { label: "Target", value: `${activeMyte.targetX.toFixed(2)}px, ${activeMyte.targetY.toFixed(2)}px` },
                { label: "Distance to target", value: activeMyte.distance_from_target },
                { label: "Distance from mouse", value: activeMyte.distance_from_mouse },
                { label: "Falling", value: activeMyte.isFalling },
                { label: "Jumping", value: activeMyte.isJumping },
                { label: "Velocity", value: activeMyte.velocity.toFixed(3) },
                { label: "Queue Items", value: activeMyte.queue.count() },
                // get zIndex of activeMyte.duplicate
                { label: "ZIndex", value: activeMyte.duplicate.style.zIndex }
            ];
        }

        if (this.cameraEnabled && this.camera) {
            debugMessages.push({ label: "Camera", value: `${this.camera.posX.toFixed(2)}px, ${this.camera.posY.toFixed(2)}px` });
        }

        this.debug.innerHTML = 
            debugMessages
            .concat(myteMessages)
            .map(item => this.generateDebugMessage(item.label, item.value))
            .join("");
    }

    calculateDirection(activeMyte) {
        const dx = activeMyte.targetX - activeMyte.posX;
        const dy = activeMyte.targetY - activeMyte.posY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        return activeMyte.get_direction(dx, dy, distance);
    }

    updateQueue() {
        const queueMessages = this.parent.activeMyte.queue.queue.map((item, index) => this.formatQueueItem(item, index));
        this.queue.innerHTML = queueMessages.join("");
    }

    formatQueueItem(item, index) {
        // Get action type name from constructor
        const actionType = item.constructor.name.replace('Action', '');
        const messages = [actionType];
    
        // Handle element targets
        if (item.options.element) {
            messages.push(`to ${item.options.element.tagName}` + 
                (item.target ? `(${item.target.x.toFixed(2)}px, ${item.target.y.toFixed(2)}px)` : '') + 
                '<br>'
            );
        }
    
        // Handle object targets
        if (item.options.targetObject) {
            messages.push(`to Object (${item.options.targetObject.constructor.name})<br>`);
        }
    
        // Handle expressions
        if (item instanceof ExpressionAction) {
            messages.push(`- ${item.type}`);
        }
    
        // Handle repeats
        if (item.options.repeat) {
            messages.push(`- ${item.options.repeat}x`);
        }
    
        // Handle duration for current action
        if (index === 0 && item.options.current_duration !== undefined) {
            messages.push(this.formatItemDuration(item.options));
        }
    
        // Handle total time
        if (item.options.total_time !== undefined) {
            messages.push(`- ${item.options.total_time}ms`);
        }
    
        return this.generateDebugMessage(`#${index + 1}`, messages.join(" "));
    }
    
    formatItemDuration(options) {
        if (options.current_duration === -1) {
            return "in progress";
        }
        const percentage = Math.round(100 - (options.current_duration / options.duration * 100));
        return `(${percentage}% ${options.current_duration})`;
    }

    update() {

        if (this.debug) {
            this.updateDebug();
        }
        if (this.parent.activeMyte && this.queue) {
            this.updateQueue();
        }
    }
}