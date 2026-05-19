class DebugUI {
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
        const lastInputTime =
            this.parent.inputHandler?.inputSystem?.state?.lastActivityTime ??
            this.parent.inputHandler?.lastActiveTime ??
            null;

        return [
            { label: "User Active", value: this.parent.isActive },
            { label: "Local Mouse", value: `${this.parent.inputHandler.getMouseWorldPosition().x.toFixed(2)}px, ${this.parent.inputHandler.getMouseWorldPosition().y.toFixed(2)}px` },
            { label: "Mouse", value: `${this.parent.mousePosX.toFixed(2)}px, ${this.parent.mousePosY.toFixed(2)}px` },
            {
                label: "Last Input Time",
                value: Number.isFinite(lastInputTime)
                    ? new Date(lastInputTime).toLocaleTimeString()
                    : 'N/A'
            }
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


// Add defensive checks to getMapMessages
getMapMessages() {
    const messages = [];
    
    // Check if gameMap exists
    if (this.parent && this.parent.gameMap) {
        messages.push({ label: "Map ID", value: this.parent.gameMap.id });
        messages.push({ label: "Map Name", value: this.parent.gameMap.displayName || 'Unknown' });
        messages.push({ label: "Objects Count", value: (this.parent.gameMap.objects && this.parent.gameMap.objects.length) || 0 });
        
        // Check if dimensions exist
        if (this.parent.gameMap.dimensions) {
            messages.push({ label: "Dimensions", value: `${this.parent.gameMap.dimensions.width}x${this.parent.gameMap.dimensions.height}px` });
        }
        
        // Check if particleSystem exists
        if (this.parent.gameMap.particleSystem) {
            messages.push({ label: "Particles", value: `${this.parent.gameMap.particleSystem.particles?.length || 0}` });
            messages.push({ label: "Particle Emitters", value: `${this.parent.gameMap.particleSystem.emitters?.length || 0}` });
        }
    }

    // Check if zoneManager exists and has zones
    if (this.parent && this.parent.gameMap && this.parent.gameMap.zoneManager && 
        this.parent.gameMap.zoneManager.zones && this.parent.gameMap.zoneManager.zones.size > 0) {
        messages.push(...this.getZoneDebugMessages());
    }

    return messages;
}

getZoneDebugMessages() {
    const messages = [];
    
    // Check if zoneManager exists
    if (!this.parent || !this.parent.gameMap || !this.parent.gameMap.zoneManager) {
        return messages;
    }
    
    const zoneManager = this.parent.gameMap.zoneManager;
    
    // Check if zones map exists
    if (!zoneManager.zones) {
        return messages;
    }
    
    // Add total zones count
    messages.push({
        label: "Total Zones",
        value: zoneManager.zones.size
    });

    // Add information for each zone
    try {
        zoneManager.zones.forEach((zone, zoneId) => {
            // Skip if zone is invalid
            if (!zone || !zone.mytesInZone) return;
            
            try {
                const mytesInZone = Array.from(zone.mytesInZone)
                    .map(myteId => this.parent.mytes?.find(m => m && m.id === myteId))
                    .filter(Boolean)
                    .map(myte => myte.name)
                    .join(', ');
            
                messages.push({
                    label: `Zone ${zoneId} (${zone.type || 'Unknown'})`,
                    value: mytesInZone || 'Empty'
                });
            } catch (error) {
                // Silently handle errors during transitions
                messages.push({
                    label: `Zone ${zoneId}`,
                    value: 'Error'
                });
            }
        });
    } catch (error) {
        // Silently handle errors during transitions
    }

    return messages;
}

    getCameraMessages() {
        if (!this.parent.camera) return [];
        
        return [
            { label: "Camera Position", value: `${this.parent.camera.posX.toFixed(2)}px, ${this.parent.camera.posY.toFixed(2)}px` },
            { label: "Zoom Level", value: this.parent.camera.zoomLevel.toFixed(2) },
            { label: "Follow Mode", value: this.parent.camera.followMode }
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
            { label: "Velocity", value: activeMyte.physics.velocity.toFixed(3) },
            
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

// Add defensive checks to drawDebugColliders method
drawDebugColliders() {
    // Check if game map exists
    if (!this.parent || !this.parent.gameMap) return;
    
    // Check if debug layer exists
    if (!this.parent.gameMap.layers || !this.parent.gameMap.layers.debug) return;
    
    // Clear previous collider visuals
    const oldColliders = this.parent.gameMap.layers.debug.querySelectorAll('.debug-collider');
    oldColliders.forEach(c => c.remove());

    // Check if mytes array exists
    if (this.parent.mytes) {
        // Draw myte colliders
        this.parent.mytes.forEach(myte => {
            if (!myte) return; // Skip if myte is null
            
            try {
                const myteCollider = document.createElement('div');
                myteCollider.classList.add('debug-collider', 'myte-collider');
                const bounds = myte.parent.getColliderBounds(myte);
                myteCollider.style.left = `${bounds.left}px`;
                myteCollider.style.top = `${bounds.top}px`;
                myteCollider.style.width = `${bounds.right - bounds.left}px`;
                myteCollider.style.height = `${bounds.bottom - bounds.top}px`;
                this.parent.gameMap.layers.debug.appendChild(myteCollider);
            } catch (error) {
                // Silently handle errors during transitions
            }
        });
    }
    
    // Check if grid system and active objects exist
    if (!this.parent.gameMap.gridSystem || !this.parent.gameMap.gridSystem.activeObjects) return;
    
    // Draw colliders for all visible objects
    try {
        this.parent.gameMap.gridSystem.activeObjects.forEach(obj => {
            if (!obj) return; // Skip if object is null
            
            try {
                const collider = document.createElement('div');
                collider.classList.add('debug-collider', 'object-collider');

                if (obj.config && obj.config.walkable) {
                    collider.classList.add('walkable-object');
                }
                
                const bounds = this.parent.getColliderBounds(obj);
                collider.style.position = 'absolute';
                collider.style.left = `${bounds.left}px`;
                collider.style.top = `${bounds.top}px`;
                collider.style.width = `${bounds.right - bounds.left}px`;
                collider.style.height = `${bounds.bottom - bounds.top}px`;
                
                // Color based on object type
                if (obj instanceof Myte) {
                    collider.classList.add('myte-collider');
                } else {
                    collider.classList.add('object-collider');
                }
                
                this.parent.gameMap.layers.debug.appendChild(collider);
            } catch (error) {
                // Silently handle errors during transitions
            }
        });
    } catch (error) {
        // Silently handle errors during transitions
    }
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

        this.drawDebugColliders();

        this.debug.innerHTML = debugGroups
            .filter(group => group.messages.length > 0)
            .map(group => this.generateDebugGroup(group.name, group.messages))
            .join("");
    }

    update() {
        // Check if debug element exists
        if (this.debug) {
            try {
                this.updateDebug();
            } catch (error) {
                // Silently handle errors during transitions
                console.warn('Debug UI update error:', error);
            }
        }
    
        // Update queue UI with error handling
        if (this.queueUI) {
            try {
                this.queueUI.update();
            } catch (error) {
                // Silently handle errors during transitions
            }
        }
    }
}
