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
    static _definitions = new Map();

    static loadDefinitions(defsArray) {
        defsArray.forEach(def => Zone._definitions.set(def.id, def));
    }

    constructor(data, map) {
        this.map = map;
        this.id = data.id;
        this.type = String(data.type || '').toLowerCase();
        this.bounds = data.bounds;
        this.properties = {
            ...SiteConfig.zones.defaults,
            ...data.properties
        };
        this.displayName = data.properties?.displayName || this.type;

        // Geometry now lives in the shared region store; Zone keeps only the
        // behaviour (thresholds, buffs, stat effects). `this.bounds` is retained
        // as a read-only convenience for the many existing callers.
        this.region = map?.regionManager?.add(new SpatialRegion({
            id: this.id,
            layer: 'zone',
            shape: { kind: 'rect', bounds: this.bounds },
            properties: this.properties,
            source: this
        })) ?? null;

        // Track Mytes in the zone
        this.mytesInZone = new Set();

        // Visual element if zone is visible
        this.element = null;
        if (this.properties.visible) {
            this.createVisualElement();
        }
    }

    _getZoneDef() {
        return Zone._definitions.get(this.type) ?? null;
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
        if (this.region) return this.region.getCenterPoint();
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
        const onApply = this.properties.effects ?? (
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
            onApply
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

    getIntersectionLevel(myteRect) {
        // Rect regions delegate straight back to RectUtils, so the thresholds
        // below see byte-identical ratios to the pre-region implementation.
        const ratio = this.region
            ? this.region.intersectionRatio(myteRect)
            : RectUtils.getIntersectionRatio(myteRect, this.bounds);
        if (ratio <= 0) return null;
        if (ratio >= 0.95) return ZONE_THRESHOLD.FULLY;
        if (ratio >= 0.5) return ZONE_THRESHOLD.HALFWAY;
        return ZONE_THRESHOLD.TOUCHING;
    }

    getMyteRect(myte) {
        return myte.getWorldRect();
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
            this.map?.regionManager?.setOccupant?.(this.region, myte, true);
        } else if (!meetsThreshold && wasInZone) {
            // Myte no longer meets threshold
            this.onMyteExit(myte);
            this.mytesInZone.delete(myte.id);
            this.map?.regionManager?.setOccupant?.(this.region, myte, false);
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
        // Stat effects are applied passively each tick in onMyteStay
    }

    onMyteExit(myte) {
        // Pass
    }

    onMyteStay(myte, deltaTime) {
        const zoneDef = this._getZoneDef();
        if (!zoneDef?.effects) return;
        myte.stats?.applyStatEffectsPerMs?.(zoneDef.effects, deltaTime);
    }

}

// ZoneManager class to handle multiple zones
class ZoneManager {
    constructor(map) {
        this.parent = map;
        this.zones = new Map();

        if (!Zone._definitions.size) {
            fetch(Utility.preventCache('data/metadata/zones.json'))
                .then(r => r.json())
                .then(data => Zone.loadDefinitions(data.zones ?? []))
                .catch(err => console.error('[ZoneManager] Failed to load zone definitions:', err));
        }
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

    getZonesOfType(type) {
        return Array.from(this.zones.values()).filter(zone => zone.type === type);
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
