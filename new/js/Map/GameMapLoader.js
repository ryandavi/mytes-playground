// MapLoader.js
class GameMapLoader {
    constructor() {
        this.maps = new Map();
        this.currentMap = null;
    }

    async loadMapData() {
        try {
            const response = await fetch('../data/maps/maps.json');
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const mapData = await response.json();
            
            // Store maps in the Map object
            Object.entries(mapData.maps).forEach(([id, mapData]) => {
                this.maps.set(id, mapData);
            });

            return true;
        } catch (error) {
            console.error('Error loading map data:', error);
            return false;
        }
    }

    async loadMap(mapId, container) {
        const mapData = this.maps.get(mapId);
        if (!mapData) {
            console.error(`Map ${mapId} not found`);
            return null;
        }

        // Create map instance
        const map = new GameMap(mapData, container);
        await map.initialize();
        
        this.currentMap = map;
        return map;
    }
}