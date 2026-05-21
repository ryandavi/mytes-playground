// GameMapLoader with improved error handling
class GameMapLoader {
    constructor(core) {
        this.core = core;
        this.maps = new Map();
        this.currentMap = null;
        this.mapDisplayNames = new Map();
        this.mapDisplayNamePromises = new Map();
        console.log(`[GameMapLoader] Initialized`);
    }

    normalizeMapId(mapId) {
        return String(mapId || '').replace(/\.tmx$/i, '');
    }

    humanizeMapId(mapId) {
        const normalized = this.normalizeMapId(mapId);
        return normalized
            .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
            .replace(/[_-]+/g, ' ')
            .trim() || 'Unknown';
    }

    getCachedMapDisplayName(mapId) {
        const normalized = this.normalizeMapId(mapId);
        return this.mapDisplayNames.get(normalized) || null;
    }

    async getMapDisplayName(mapId) {
        const normalized = this.normalizeMapId(mapId);
        if (!normalized) {
            return 'Unknown';
        }

        const cached = this.getCachedMapDisplayName(normalized);
        if (cached) {
            return cached;
        }

        if (this.mapDisplayNamePromises.has(normalized)) {
            return this.mapDisplayNamePromises.get(normalized);
        }

        const promise = (async () => {
            const fallback = this.humanizeMapId(normalized);
            const paths = [
                `data/spritesheets/${normalized}.tmx`,
                `data/maps/${normalized}.tmx`,
                `assets/maps/${normalized}.tmx`,
                `${normalized}.tmx`
            ];

            for (const path of paths) {
                try {
                    const response = await fetch(path);
                    if (!response.ok) continue;

                    const xmlText = await response.text();
                    const xml = new DOMParser().parseFromString(xmlText, 'application/xml');
                    const propertyNode = xml.querySelector('map > properties > property[name="displayName"]');
                    const displayName = propertyNode?.getAttribute('value')?.trim();

                    if (displayName) {
                        this.mapDisplayNames.set(normalized, displayName);
                        return displayName;
                    }
                } catch (error) {
                    console.warn(`[GameMapLoader] Could not resolve display name for ${normalized} from ${path}:`, error);
                }
            }

            return fallback;
        })();

        this.mapDisplayNamePromises.set(normalized, promise);

        try {
            const displayName = await promise;
            if (displayName) {
                this.mapDisplayNames.set(normalized, displayName);
            }
            return displayName || this.humanizeMapId(normalized);
        } finally {
            this.mapDisplayNamePromises.delete(normalized);
        }
    }

    getRandomTransitionTip() {
        const tips = [
            'You can long-press a queue badge in the top-left to cancel it.',
            'Free-roaming mytes can be tapped again to bring them back into follow mode.',
            'Dragging a myte onto its slot sends it home.',
            'Different maps can have their own zones for resting, wandering, and social behavior.',
            'Double-click the map to queue an A* move for your active myte.'
        ];

        return tips[Math.floor(Math.random() * tips.length)];
    }

    updateTransitionOverlay(progress, message = null) {
        const loadingManager = this.core?.loadingManager;
        if (!loadingManager) return;

        loadingManager.setManualProgress(progress);

        if (message) {
            loadingManager.setMessage(message);
        }
    }

    // Optional initialization method
    async init() {
        console.log(`[GameMapLoader] Init called`);
        return true;
    }

    // Update the loadMap method in GameMapLoader.js to pass the isInitialLoad flag
    async loadMap(mapId, container, options = {}) {
        try {
            console.log(`[GameMapLoader] Loading map: ${mapId}`);

            // Check if container is valid
            if (!container) {
                throw new Error('Container is null or undefined');
            }

            if (!container.canvas) {
                throw new Error('Container canvas is null or undefined');
            }

            // Create map instance
            console.log(`[GameMapLoader] Creating new GameMap instance`);
            const map = new GameMap(container);

            // Initialize with TMX file, passing along initialization options
            console.log(`[GameMapLoader] Initializing map with id: ${mapId}`);
            const success = await map.initialize(mapId, {
                isInitialLoad: options.isInitialLoad || false
            });

            if (!success) {
                console.error(`[GameMapLoader] Failed to initialize map: ${mapId}`);
                return null;
            }

            this.currentMap = map;
            if (map?.displayName) {
                this.mapDisplayNames.set(this.normalizeMapId(mapId), map.displayName);
            }
            console.log(`[GameMapLoader] Map ${mapId} loaded successfully`);
            return map;
        } catch (error) {
            console.error(`[GameMapLoader] Error loading map ${mapId}:`, error);
            return null;
        }
    }

    async loadMapWithTransition(mapId, container, options = {}) {
        const previousMap = this.currentMap;

        try {
            const map = await this.loadMap(mapId, container, {
                isInitialLoad: options.isInitialLoad || false
            });

            if (!map) {
                throw new Error(`Failed to load map: ${mapId}`);
            }

            if (previousMap) {
                previousMap.dispose();
            }

            this.currentMap = map;
            return map;
        } catch (error) {
            console.error(`Error loading map ${mapId}:`, error);
            this.currentMap = previousMap;
            return null;
        }
    }
}
