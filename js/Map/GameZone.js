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
    constructor(data, map) {
        this.map = map;
        this.id = data.id;
        this.type = String(data.type || '').toLowerCase();
        this.bounds = data.bounds;
        this.properties = {
            ...SiteConfig.zones.defaults,
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

    getTypeConfig() {
        return SiteConfig.zones.types[this.type] ?? {};
    }

    getCenterPoint() {
        return {
            x: this.bounds.x + (this.bounds.width / 2),
            y: this.bounds.y + (this.bounds.height / 2)
        };
    }

    getBuffContextKey() {
        return `zone:${this.id ?? this.type}:${this.type}`;
    }

    getDefaultBuffId() {
        switch (this.type) {
            case ZONE_TYPES.REST: return 'zone_rest';
            case ZONE_TYPES.PLAY: return 'zone_play';
            case ZONE_TYPES.SOCIAL: return 'zone_social';
            case ZONE_TYPES.DANGER: return 'zone_danger';
            default: return null;
        }
    }

    getContextBuffDefinition() {
        if (this.properties.buffDefinition) {
            return this.properties.buffDefinition;
        }

        if (this.properties.buffId) {
            return this.properties.buffId;
        }

        const defaultBuffId = this.getDefaultBuffId();
        if (defaultBuffId) {
            return defaultBuffId;
        }

        if (this.type !== ZONE_TYPES.BOOST) {
            return null;
        }

        const strength = this.properties.strength ?? 1;
        const instantEffects = this.properties.effects ?? (
            this.properties.moodBoost != null
                ? { moodBoost: this.properties.moodBoost * strength }
                : {}
        );
        const stayConfig = this.getTypeConfig().stay ?? {};

        return {
            id: `boost_zone_${this.id ?? 'dynamic'}`,
            label: this.properties.buffLabel || 'Boost Zone',
            kind: 'buff',
            category: 'zone',
            priority: 16,
            durationMs: 0,
            cancellable: false,
            icon: this.properties.buffIcon || 'BZ',
            description: this.properties.buffDescription || 'This area is boosting your stats while you stay inside.',
            effects: {
                stats: {
                    moodPerMs: this.properties.moodPerMs ?? stayConfig.moodPerMs ?? 0,
                    boredomPerMs: this.properties.boredomPerMs ?? stayConfig.boredomPerMs ?? 0,
                    funPerMs: this.properties.funPerMs ?? stayConfig.funPerMs ?? 0,
                    comfortPerMs: this.properties.comfortPerMs ?? stayConfig.comfortPerMs ?? 0,
                    confidencePerMs: this.properties.confidencePerMs ?? stayConfig.confidencePerMs ?? 0
                }
            },
            instantEffects
        };
    }

    syncZoneBuff(myte, active = true) {
        myte.buffs?.syncContextBuff?.(
            this.getBuffContextKey(),
            this.getContextBuffDefinition(),
            {
                active,
                source: 'zone',
                payload: {
                    zoneId: this.id,
                    zoneType: this.type
                }
            }
        );
    }

    getDistanceToMyte(myte) {
        if (!myte) return Infinity;
        const center = this.getCenterPoint();
        const myteCenterX = myte.posX + ((myte.size?.width ?? 0) / 2);
        const myteCenterY = myte.posY + ((myte.size?.height ?? 0) / 2);
        return Math.hypot(center.x - myteCenterX, center.y - myteCenterY);
    }

    getTargetPointForMyte(myte) {
        const center = this.getCenterPoint();
        const targetX = center.x - ((myte?.size?.width ?? 0) / 2);
        const targetY = center.y - ((myte?.size?.height ?? 0) / 2);
        return this.map?.gridSystem?.findNearestValidPositionForEntity?.(myte, targetX, targetY, 10) ?? {
            x: targetX,
            y: targetY
        };
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

    containsMyte(myte) {
        return this.doesMeetThreshold(this.getIntersectionLevel(this.getMyteRect(myte)));
    }

    // Check if a Myte has entered or left the zone
    update(myte, deltaTime = 16) {
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
            this.onMyteStay(myte, deltaTime);
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
        this.syncZoneBuff(myte, this.type !== ZONE_TYPES.FOOD);
        
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
        this.syncZoneBuff(myte, false);
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

    onMyteStay(myte, deltaTime) {
        this.syncZoneBuff(myte, this.type !== ZONE_TYPES.FOOD);
        // Continue applying effects while Myte remains in zone
        switch (this.type) {
            case ZONE_TYPES.REST:
                this.applyContinuousRestEffects(myte, deltaTime);
                break;
            case ZONE_TYPES.PLAY:
                this.applyContinuousPlayEffects(myte, deltaTime);
                break;
            case ZONE_TYPES.SOCIAL:
                this.applyContinuousSocialEffects(myte, deltaTime);
                break;
            case ZONE_TYPES.BOOST:
                this.applyContinuousBoostEffects(myte, deltaTime);
                break;
        }
    }

    // Zone-specific effect implementations
    applyRestZoneEffects(myte) {
        // Make Myte more likely to rest/sleep
        if (Math.random() < 0.3 && myte.queue.isEmpty()) {
            myte.queue.addSleep(3000);
        }
    }

    applyContinuousRestEffects(myte, deltaTime) {
        this.applyContinuousStatEffects(myte, deltaTime);
    }

    applyPlayZoneEffects(myte) {
        // Make Myte more playful
        const chance = this.properties.enterActionChance ??
            this.getTypeConfig().enterActionChance ??
            0.2;
        if (Math.random() < chance && myte.queue.isEmpty()) {
            const actions = ['dance', 'spin', 'jump'];
            const randomAction = actions[Math.floor(Math.random() * actions.length)];
            myte.queue.add(randomAction);
        }
    }

    applyContinuousPlayEffects(myte, deltaTime) {
        this.applyContinuousStatEffects(myte, deltaTime);
    }

    applyFoodZoneEffects(myte) {
        // Increase chance of food spawning near Myte
        if (Math.random() < 0.1) {
            const offset = {
                x: (Math.random() - 0.5) * 100,
                y: (Math.random() - 0.5) * 100
            };
            this.map?.addDroppedItem(
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
            .map(id => this.map?.getMyteById(id))
            .filter(m => m && m !== myte);

        if (nearbyMytes.length > 0 && Math.random() < 0.2) {
            const randomMyte = nearbyMytes[Math.floor(Math.random() * nearbyMytes.length)];
            myte.queue.addShowAffection(randomMyte);
        }
    }

    applyContinuousSocialEffects(myte, deltaTime) {
        this.applyContinuousStatEffects(myte, deltaTime);
    }

    applyDangerZoneEffects(myte) {
        const now = Date.now();
        if (!this._dangerShockTimes) this._dangerShockTimes = new Map();
        const lastShock = this._dangerShockTimes.get(myte.id) ?? 0;
        if (now - lastShock > 10000) {
            this._dangerShockTimes.set(myte.id, now);
            myte.stats?.applyStatEffects?.({ moodBoost: -5 });
        }

        const centerX = this.bounds.x + this.bounds.width / 2;
        const centerY = this.bounds.y + this.bounds.height / 2;
        myte.queue.clear();
        const angle = Math.atan2(myte.posY - centerY, myte.posX - centerX);
        const safeDistance = 200;
        myte.setTarget(
            myte.posX + Math.cos(angle) * safeDistance,
            myte.posY + Math.sin(angle) * safeDistance
        );
    }

    applyBoostZoneEffects(myte) {
        this.syncZoneBuff(myte, true);
    }

    applyContinuousBoostEffects(myte, deltaTime) {
        this.applyContinuousStatEffects(myte, deltaTime);
    }

    applyContinuousStatEffects(myte, deltaTime) {
        this.syncZoneBuff(myte, true);
    }

}

// ZoneManager class to handle multiple zones
class ZoneManager {
    constructor(map) {
        this.parent = map;
        this.zones = new Map();
    }

    addZone(zoneData) {
        const zone = new Zone(zoneData, this.parent);
        this.zones.set(zone.id, zone);
        
        if (zone.element) {
            this.parent.layers.background.appendChild(zone.element);
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

    update(myte, deltaTime = 16) {
        this.zones.forEach(zone => {
            if (zone.properties.active) {
                zone.update(myte, deltaTime);
            }
        });
    }

    getActiveZonesForMyte(myte) {
        return Array.from(this.zones.values()).filter(zone =>
            zone?.properties?.active && zone.containsMyte(myte)
        );
    }

    getNearbyZonesForMyte(myte, radius = Infinity) {
        return Array.from(this.zones.values())
            .filter(zone =>
                zone?.properties?.active &&
                zone.getDistanceToMyte(myte) <= radius
            )
            .sort((a, b) => a.getDistanceToMyte(myte) - b.getDistanceToMyte(myte));
    }

    dispose(){

        // loop through zones and remove elements
        this.zones.forEach(zone => {
            if (zone.element) {
                zone.element.remove();
            }
        });

        this.zones = new Map();


        
    }
}
