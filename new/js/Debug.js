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
                { label: "State", value: activeMyte.stateMachine.currentState },

                { label: "Transition", value: activeMyte.stateMachine.isTransitioning },

                
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
        const messages = [item.action];

        // target
        if (item.element) {
            messages.push(`to ${item.element.tagName}` + (item.target && item.target[0] ? `(${item.target[0].x.toFixed(2)}px, ${item.target[0].y.toFixed(2)}px)` : '') + `<br>`);
        }

        if (item.targetObject) {
            messages.push(`to Object (${item.targetObject.constructor.name})` + `<br>`);
        }

        // expression
        if (item.action === "do_expression") {
            messages.push(`- ${item.action_type}`);
        }

        // repeat
        if (item.repeat) {
            messages.push(`- ${item.repeat}x`);
        }

        // duration
        if (index === 0 && item.current_duration !== undefined) {
            messages.push(this.formatItemDuration(item));
        }

        if ("total_time" in item) {
            messages.push(`- ${item.total_time}ms`);
        }

        return this.generateDebugMessage(`#${index + 1}`, messages.join(" "));
    }

    formatItemDuration(item) {
        if (item.current_duration === -1) {
            return "in progress";
        }
        const percentage = Math.round(100 - (item.current_duration / item.duration * 100));
        return `(${percentage}%)`;
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