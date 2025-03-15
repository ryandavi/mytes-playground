// Zone types enum
const ZONE_TYPES = {
    REST: 'rest',
    PLAY: 'play',
    FOOD: 'food',
    SOCIAL: 'social',
    DANGER: 'danger',
    BOOST: 'boost'
};

// Add these constants at the top of your file
const ZONE_THRESHOLD = {
    TOUCHING: 'touching',  // Myte is just touching the zone (default)
    HALFWAY: 'halfway',    // Myte is at least halfway in the zone
    FULLY: 'fully'         // Myte is fully inside the zone
};

class Zone {
    constructor(data) {
        this.id = data.id;
        this.type = data.type;
        this.bounds = data.bounds;
        this.properties = {
            // Default properties
            active: true,
            visible: false,
            strength: 1.0,
            cooldown: 0,
            threshold: ZONE_THRESHOLD.HALFWAY, // Default threshold
            ...data.properties
        };
        
        // Track Mytes in the zone
        this.mytesInZone = new Set();
        
        // Visual element if zone is visible
        this.element = null;
        if (this.properties.visible) {
            this.createVisualElement();
        }
    }

    createVisualElement() {
        this.element = document.createElement('div');
        this.element.className = `zone ${this.type}-zone`;
        Object.assign(this.element.style, {
            position: 'absolute',
            left: `${this.bounds.x}px`,
            top: `${this.bounds.y}px`,
            width: `${this.bounds.width}px`,
            height: `${this.bounds.height}px`,
            pointerEvents: 'none'
        });

		// Add a new element with the type as the text and class name
		const newElement = document.createElement('span');
		newElement.className = "name";
		newElement.textContent = this.type;
		this.element.appendChild(newElement);


    }

    // Add this method to your Zone class
    getIntersectionLevel(myteRect) {
        // Calculate intersection area
        const overlapLeft = Math.max(this.bounds.x, myteRect.left);
        const overlapRight = Math.min(this.bounds.x + this.bounds.width, myteRect.right);
        const overlapTop = Math.max(this.bounds.y, myteRect.top);
        const overlapBottom = Math.min(this.bounds.y + this.bounds.height, myteRect.bottom);
        
        if (overlapLeft >= overlapRight || overlapTop >= overlapBottom) {
            return null; // No intersection
        }
        
        const intersectionArea = (overlapRight - overlapLeft) * (overlapBottom - overlapTop);
        const myteArea = myteRect.width * myteRect.height;
        const intersectionRatio = intersectionArea / myteArea;
        
        if (intersectionRatio >= 0.95) { // Using 0.95 instead of 1.0 for floating-point tolerance
            return ZONE_THRESHOLD.FULLY;
        } else if (intersectionRatio >= 0.5) {
            return ZONE_THRESHOLD.HALFWAY;
        } else {
            return ZONE_THRESHOLD.TOUCHING;
        }
    }

    getMyteRect(myte) {
        // Get Myte's collision box
        return {
            left: myte.posX,
            top: myte.posY,
            right: myte.posX + myte.size.width,
            bottom: myte.posY + myte.size.height,
            width: myte.size.width,
            height: myte.size.height
        };
    }

    // Check if a Myte has entered or left the zone
    update(myte) {
        const myteRect = this.getMyteRect(myte);
        const intersectionLevel = this.getIntersectionLevel(myteRect);
        
        // Check if the myte meets the threshold requirement for this zone
        const meetsThreshold = this.doesMeetThreshold(intersectionLevel);
        const wasInZone = this.mytesInZone.has(myte.id);
        
        if (meetsThreshold && !wasInZone) {
            // Myte just entered the zone and meets threshold
            this.onMyteEnter(myte);
            this.mytesInZone.add(myte.id);
        } else if (!meetsThreshold && wasInZone) {
            // Myte no longer meets threshold
            this.onMyteExit(myte);
            this.mytesInZone.delete(myte.id);
        } else if (meetsThreshold) {
            // Myte stays in zone and still meets threshold
            this.onMyteStay(myte);
        }
    }

    doesMeetThreshold(intersectionLevel) {
        if (intersectionLevel === null) {
            return false; // Not intersecting at all
        }
        
        switch (this.properties.threshold) {
            case ZONE_THRESHOLD.FULLY:
                return intersectionLevel === ZONE_THRESHOLD.FULLY;
                
            case ZONE_THRESHOLD.HALFWAY:
                return intersectionLevel === ZONE_THRESHOLD.HALFWAY || 
                       intersectionLevel === ZONE_THRESHOLD.FULLY;
                       
            case ZONE_THRESHOLD.TOUCHING:
            default:
                return true; // Any intersection is fine for TOUCHING threshold
        }
    }

    onMyteEnter(myte) {

        
        switch (this.type) {
            case ZONE_TYPES.REST:
                this.applyRestZoneEffects(myte);
                break;
            case ZONE_TYPES.PLAY:
                this.applyPlayZoneEffects(myte);
                break;
            case ZONE_TYPES.FOOD:
                this.applyFoodZoneEffects(myte);
                break;
            case ZONE_TYPES.SOCIAL:
                this.applySocialZoneEffects(myte);
                break;
            case ZONE_TYPES.DANGER:
                this.applyDangerZoneEffects(myte);
                break;
            case ZONE_TYPES.BOOST:
                this.applyBoostZoneEffects(myte);
                break;
        }
    }

    onMyteExit(myte) {
        // Reset any temporary effects
        switch (this.type) {
            case ZONE_TYPES.REST:
                myte.queue.clear();
                break;
            case ZONE_TYPES.DANGER:
                // Stop running away
                if (myte.goal === MOVE_TYPES.FREEROAM) {
                    myte.setMode(myte.previousGoal);
                }
                break;
        }
    }

    onMyteStay(myte) {
        // Continue applying effects while Myte remains in zone
        switch (this.type) {
            case ZONE_TYPES.REST:
                this.applyContinuousRestEffects(myte);
                break;
            case ZONE_TYPES.BOOST:
                this.applyContinuousBoostEffects(myte);
                break;
        }
    }

    // Zone-specific effect implementations
    applyRestZoneEffects(myte) {
        // Make Myte more likely to rest/sleep
        if (Math.random() < 0.3 && myte.queue.isEmpty()) {
            myte.queue.addSleep(3000);
        }
        
        // Increase mood recovery
        myte.moodDecayRate *= 0.5;
    }

    applyContinuousRestEffects(myte) {
        // Slowly recover mood while in rest zone
        myte.stats.updateMood(0.1 * this.properties.strength);
    }

    applyPlayZoneEffects(myte) {
        
        // Make Myte more playful
        if (Math.random() < 0.2 && myte.queue.isEmpty()) {
            console.log("IN PLAY ZONE");
            const actions = ['dance', 'spin', 'jump'];
            const randomAction = actions[Math.floor(Math.random() * actions.length)];
            myte.queue.add(randomAction);
        }
    }

    applyFoodZoneEffects(myte) {
        // Increase chance of food spawning near Myte
        if (Math.random() < 0.1) {
            const offset = {
                x: (Math.random() - 0.5) * 100,
                y: (Math.random() - 0.5) * 100
            };
            myte.parent.mapArea.addObject(
                'FOOD',
                'apple',
                myte.posX + offset.x,
                myte.posY + offset.y
            );
        }
    }

    applySocialZoneEffects(myte) {
        // Make Mytes more likely to interact with each other
        const nearbyMytes = Array.from(this.mytesInZone)
            .map(id => myte.parent.mytes.find(m => m.id === id))
            .filter(m => m && m !== myte);

        if (nearbyMytes.length > 0 && Math.random() < 0.2) {
            const randomMyte = nearbyMytes[Math.floor(Math.random() * nearbyMytes.length)];
            myte.queue.addShowAffection(randomMyte);
        }
    }

    applyDangerZoneEffects(myte) {
        // Make Myte run away from the center of the danger zone
        const centerX = this.bounds.x + this.bounds.width / 2;
        const centerY = this.bounds.y + this.bounds.height / 2;
        
        myte.queue.clear();
        const angle = Math.atan2(myte.posY - centerY, myte.posX - centerX);
        const safeDistance = 200;
        const safeX = myte.posX + Math.cos(angle) * safeDistance;
        const safeY = myte.posY + Math.sin(angle) * safeDistance;
        
        myte.setTarget(safeX, safeY);
        myte.stats.updateMood(-5); // Decrease mood in danger zone
    }

    applyBoostZoneEffects(myte) {
        // Generic boost zone that can be configured via properties
        if (this.properties.moodBoost) {
            myte.stats.updateMood(this.properties.moodBoost * this.properties.strength);
        }
        if (this.properties.speedBoost) {
            myte.speed *= (1 + this.properties.speedBoost * this.properties.strength);
        }
    }

    applyContinuousBoostEffects(myte) {
        // Continue applying any boost effects
        if (this.properties.continuousMoodBoost) {
            myte.stats.updateMood(this.properties.continuousMoodBoost * this.properties.strength);
        }
    }
}

// ZoneManager class to handle multiple zones
class ZoneManager {
    constructor(map) {
        this.map = map;
        this.zones = new Map();
    }

    addZone(zoneData) {
        const zone = new Zone(zoneData);
        this.zones.set(zone.id, zone);
        
        if (zone.element) {
            this.map.layers.background.appendChild(zone.element);
        }
        
        return zone;
    }

    removeZone(zoneId) {
        const zone = this.zones.get(zoneId);
        if (zone) {
            if (zone.element) {
                zone.element.remove();
            }
            this.zones.delete(zoneId);
        }
    }

    update(myte) {
        this.zones.forEach(zone => {
            if (zone.properties.active) {
                zone.update(myte);
            }
        });
    }
}