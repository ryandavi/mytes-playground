class DebugManager {
    constructor(ui) {
        this.ui = ui;
        this.debugMenu = document.querySelector(".debugMenu");
        this.queueMenu = document.querySelector(".queueMenu");
        this.messages = new Map();
    }

    addMessage(key, value) {
        this.messages.set(key, value);
    }

    generateDebugMessage(label, value) {
        return `<div class='debug'>${label}: ${value}</div>`;
    }

    updateDebug() {
        if (!this.debugMenu) return;

        const messages = [
            { label: "User Active", value: this.ui.container.isActive },
            { label: "Local Mouse", value: this.formatVector(this.ui.container.getLocalMousePosition()) },
            { label: "Mouse", value: this.formatVector(this.ui.cursorManager.position) },
            { label: "Cursor", value: this.ui.cursorManager.currentState }
        ];

        const myteMessages = this.getMyteDebugMessages();
        const cameraMessages = this.getCameraDebugMessages();

        this.debugMenu.innerHTML = 
            messages
            .concat(myteMessages)
            .concat(cameraMessages)
            .concat(Array.from(this.messages.entries())
                .map(([label, value]) => ({ label, value })))
            .map(msg => this.generateDebugMessage(msg.label, msg.value))
            .join("");
    }

    getMyteDebugMessages() {
        const activeMyte = this.ui.container.activeMyte;
        if (!activeMyte) return [];

        const movement = activeMyte.movement;
        return [
            { label: "Myte Active", value: activeMyte.isActive },
            { label: "At Target", value: movement.isAtTarget() },
            { label: "Goal", value: this.ui.getKeyByValue(MOVE_TYPES, activeMyte.currentMode) },
            { label: "Previous Goal", value: this.ui.getKeyByValue(MOVE_TYPES, activeMyte.previousMode) },
            { label: "Follow Goal", value: this.ui.getKeyByValue(MOVE_FOLLOW_TYPES, activeMyte.followMode) },
            { label: "Speed", value: movement.speed.toFixed(2) },
            { label: "Moving State", value: movement._isMoving },  // Changed from isMoving() to _isMoving
            { label: "State", value: activeMyte.animation?.currentState || 'none' },
            { label: "Is Transitioning", value: activeMyte.animation?.isTransitioning || false },
            { label: "Direction", value: activeMyte.direction },
            { label: "Is Dragging", value: activeMyte.isDragging },
            { label: "Position", value: this.formatVector(movement.position) },
            { label: "Target", value: this.formatVector(movement.target) },
            { label: "Distance to target", value: movement.getDistanceToTarget().toFixed(2) },
            { label: "Distance from mouse", value: movement.getDistanceFromMouse().toFixed(2) },
            { label: "Falling", value: movement.isFalling },
            { label: "Jumping", value: movement.isJumping },
            { label: "Velocity Y", value: movement.velocity.y.toFixed(3) },
            { label: "Queue Items", value: activeMyte.queue.count() },
            { label: "Z-Index", value: activeMyte.duplicate.style.zIndex }
        ];
    }

    getCameraDebugMessages() {
        const camera = this.ui.container.camera;
        if (!camera) return [];

        return [
            { label: "Camera Position", value: this.formatVector(camera.position) },
            { label: "Camera Target", value: this.formatVector(camera.target) },
            { label: "Camera Mode", value: this.ui.getKeyByValue(CAMERA_FOLLOW_MODES, camera.mode) },
            { label: "Camera Zoom", value: camera.zoomLevel.toFixed(2) }
        ];
    }

    formatVector(vector) {
        if (!vector) return "undefined";
        const x = vector.x?.toFixed(2) ?? "undefined";
        const y = vector.y?.toFixed(2) ?? "undefined";
        return `${x}px, ${y}px`;
    }

    updateQueue() {
        if (!this.queueMenu) return;
        
        const activeMyte = this.ui.container.activeMyte;
        if (!activeMyte || !activeMyte.queue) return;

        const queueMessages = activeMyte.queue.queue.map((item, index) => 
            this.formatQueueItem(item, index)
        );
        
        this.queueMenu.innerHTML = queueMessages.join("");
    }

    formatQueueItem(item, index) {
        const messages = [item.action];

        if (item.element) {
            messages.push(`to ${item.element.tagName}` + 
                (item.target && item.target[0] ? 
                    ` (${this.formatVector(item.target[0])})` : 
                    '') + 
                '<br>'
            );
        }

        if (item.action === "do_expression") {
            messages.push(`- ${item.actionType}`);
        }

        if (item.repeat) {
            messages.push(`- ${item.repeat}x`);
        }

        if (index === 0 && item.currentDuration !== undefined) {
            messages.push(this.formatItemDuration(item));
        }

        if (item.totalTime !== undefined) {
            messages.push(`- ${item.totalTime}ms`);
        }

        return this.generateDebugMessage(`#${index + 1}`, messages.join(" "));
    }

    formatItemDuration(item) {
        if (item.currentDuration === -1) {
            return "in progress";
        }
        const percentage = Math.round(100 - (item.currentDuration / item.duration * 100));
        return `(${percentage}%)`;
    }

    update() {
        if (document.body.classList.contains('debug')) {
            this.updateDebug();
            this.updateQueue();
        }
    }
}