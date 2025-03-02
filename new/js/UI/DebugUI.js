class Debug {
    constructor(parent) {
        this.parent = parent;
        this.debug = document.querySelector(".debugMenu");
        this.cameraEnabled = false;
        this.camera = null;

        this.queueUI = new QueueUI(parent);
    }

    generateDebugGroup(groupName, messages) {
        return `
            <div class='debug-group ${groupName.toLowerCase()}'>
                <h3>${groupName}</h3>
                ${messages.map(item => this.generateDebugMessage(item.label, item.value)).join("")}
            </div>
        `;
    }

    generateDebugMessage(label, value) {
        return `<div class='debug'>${label}: ${value}</div>`;
    }

    getSystemMessages() {
        return [
            { label: "FPS", value: this.parent.core.currentFPS.toFixed(2) },
            { label: "Memory Usage", value: this.getMemoryUsage() },
            { label: "Active Entities", value: this.getActiveEntitiesCount() }
        ];
    }

    getInputMessages() {
        return [
            { label: "User Active", value: this.parent.isActive },
            { label: "Local Mouse", value: `${this.parent.getLocalMouse().x.toFixed(2)}px, ${this.parent.getLocalMouse().y.toFixed(2)}px` },
            { label: "Mouse", value: `${this.parent.mousePosX.toFixed(2)}px, ${this.parent.mousePosY.toFixed(2)}px` },
            { label: "Last Input Time", value: new Date(this.parent.inputHandler?.lastActivityTime).toLocaleTimeString() }
        ];
    }

    getTimeMessages() {
        const timeData = this.parent.timeManager.getTimeData();
        return [
            { label: "Time", value: timeData.formattedTime },
            { label: "Date", value: timeData.formattedDate },
            { label: "Time of Day", value: timeData.timeOfDay },
            { label: "Light Level", value: timeData.lightLevel.toFixed(2) },
            { label: "Moon Phase", value: timeData.moonPhase },
            { label: "Moon Illumination", value: timeData.moonIllumination.toFixed(2) },
            { label: "Moon Growth Multiplier", value: timeData.moonGrowthMultiplier.toFixed(2) }
        ];
    }

    getMapMessages() {
        const messages = [];
        if (this.parent.gameMap) {
            messages.push({ label: "Map Name", value: this.parent.gameMap.name });
            messages.push({ label: "Objects Count", value: this.parent.gameMap.objects.length || 0 });
            messages.push({ label: "Dimensions", value: `${this.parent.gameMap.dimensions.width}x${this.parent.gameMap.dimensions.height}px` });
        }

        if (this.parent.gameMap?.zoneManager && this.parent.gameMap.zoneManager.zones.size > 0) {
            messages.push(...this.getZoneDebugMessages()); // Spread the array into the main messages array
        }



        return messages;
    }

    getZoneDebugMessages() {
        const messages = [];
        const zoneManager = this.parent.gameMap.zoneManager;
        
        // Add total zones count
        messages.push({
            label: "Total Zones",
            value: zoneManager.zones.size
        });
    
        // Add information for each zone
        zoneManager.zones.forEach((zone, zoneId) => {
            const mytesInZone = Array.from(zone.mytesInZone)
                .map(myteId => this.parent.mytes.find(m => m.id === myteId))
                .filter(Boolean)
                .map(myte => myte.name)
                .join(', ');
    
            messages.push({
                label: `Zone${zoneId} (${zone.type})`,
                value: mytesInZone || 'Empty'
            });
        });
    
        return messages;
    }

    getZoneDebugMessages() {
        const messages = [];
        const zoneManager = this.parent.gameMap.zoneManager;
        
        // Add total zones count
        messages.push({
            label: "Total Zones",
            value: zoneManager.zones.size
        });
    
        // Add information for each zone
        zoneManager.zones.forEach((zone, zoneId) => {
            const mytesInZone = Array.from(zone.mytesInZone)
                .map(myteId => this.parent.mytes.find(m => m.id === myteId))
                .filter(Boolean)
                .map(myte => myte.name)
                .join(', ');
    
            messages.push({
                label: `Zone ${zoneId} (${zone.type})`,
                value: mytesInZone || 'Empty'
            });
        });
    
        return messages;
    }

    getCameraMessages() {
        if (!this.cameraEnabled || !this.camera) return [];
        
        return [
            { label: "Camera Position", value: `${this.camera.posX.toFixed(2)}px, ${this.camera.posY.toFixed(2)}px` },
            { label: "Zoom Level", value: this.camera.zoomLevel.toFixed(2) },
            { label: "Follow Mode", value: this.camera.followMode }
        ];
    }

    getMyteMessages() {
        const activeMyte = this.parent.activeMyte;
        if (!activeMyte) return [];



        return [
            // State & Behavior
            { label: "State", value: activeMyte.stateMachine.stateController.currentState },
            { label: "Goal", value: activeMyte.get_move_type(activeMyte.goal) },
            { label: "Previous Goal", value: activeMyte.get_move_type(activeMyte.previousGoal) },
            { label: "Follow Goal", value: activeMyte.get_move_follow_type(activeMyte.followGoal) },
            
            // Status
            { label: "Active", value: activeMyte.isActive },

            // Movement
            { label: "Position", value: `${activeMyte.posX.toFixed(2)}px, ${activeMyte.posY.toFixed(2)}px` },
            { label: "Target", value: `${activeMyte.targetX.toFixed(2)}px, ${activeMyte.targetY.toFixed(2)}px` },
            { label: "Direction", value: activeMyte.direction },
            { label: "Distance to Target", value: activeMyte.distance_from_target },
            { label: "Distance from Mouse", value: activeMyte.distance_from_mouse },
            
            // Physics
            { label: "Falling", value: activeMyte.isFalling },
            { label: "Jumping", value: activeMyte.isJumping },
            { label: "Velocity", value: activeMyte.velocity.toFixed(3) },
            
            // UI & Rendering
            { label: "Z-Index", value: activeMyte.duplicate.style.zIndex },
            { label: "Queue Items", value: activeMyte.queue.count() }
        ];
    }

    getMyteStats(){
        const activeMyte = this.parent.activeMyte;
        if (!activeMyte) return [];

        let status = activeMyte.stats.getStatus();
        return [
            { label: "Mood", value: `${activeMyte.stats.mood.toFixed(1)} (${activeMyte.stats.getMoodStatus()})` },
            { label: "Speed", value: activeMyte.stats.getSpeed() },

            {label: "Health", value: status.health},
            {label: "Energy", value: status.energy.current},
            
            {label: "Level", value: status.level},
            {label: "Experience", value: status.experience},
            {label: "Personality", value: status.personality.description}
        ];


    }

    getActiveEntitiesCount() {
        return this.parent.mytes?.filter(myte => myte.isActive).length || 0;
    }

    getMemoryUsage() {
        if (window.performance && window.performance.memory) {
            const memoryUsage = window.performance.memory.usedJSHeapSize / (1024 * 1024);
            return `${memoryUsage.toFixed(2)} MB`;
        }
        return 'N/A';
    }

    updateDebug() {
        const debugGroups = [
            { name: "System", messages: this.getSystemMessages() },
            { name: "Input", messages: this.getInputMessages() },
            { name: "Time", messages: this.getTimeMessages() },
            { name: "Map", messages: this.getMapMessages() },
            { name: "Camera", messages: this.getCameraMessages() },
            { name: "Myte", messages: this.getMyteMessages() },
            { name: "Myte Stats", messages: this.getMyteStats() }
        ];

        this.debug.innerHTML = debugGroups
            .filter(group => group.messages.length > 0)
            .map(group => this.generateDebugGroup(group.name, group.messages))
            .join("");
    }

    update() {
        if (this.debug) {
            this.updateDebug();
        }

        this.queueUI.update();

    }
}