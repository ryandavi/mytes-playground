// GameMapLoader with improved error handling
class GameMapLoader {
    constructor(core) {
        this.core = core;
        this.maps = new Map();
        this.currentMap = null;
        this.mapDisplayNames = new Map();
        this.mapDisplayNamePromises = new Map();
        Utility.logDebug(`[GameMapLoader] Initialized`);
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
                `data/maps/${normalized}.tmx`,
                `data/spritesheets/${normalized}.tmx`,
                `assets/maps/${normalized}.tmx`,
                `${normalized}.tmx`
            ];

            for (const path of paths) {
                try {
                    const response = await fetch(path);
                    if (!response.ok) continue;

                    const xml = new DOMParser().parseFromString(await response.text(), 'text/xml');
                    const propertyNode = xml.querySelector('map > properties > property[name="displayName"]');
                    const displayName = propertyNode?.getAttribute('value')?.trim();

                    if (displayName) {
                        this.mapDisplayNames.set(normalized, displayName);
                        return displayName;
                    }
                } catch (error) {
                    Utility.warnDebug(`[GameMapLoader] Could not resolve display name for ${normalized} from ${path}:`, error);
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
            'Double-click the map to queue an A* move for your active myte.',
            'With no active myte, double-click a portal to open its destination.'
        ];

        return Utility.randomChoice(tips);
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
        Utility.logDebug(`[GameMapLoader] Init called`);
        return true;
    }

    // Update the loadMap method in GameMapLoader.js to pass the isInitialLoad flag
    async loadMap(mapId, container, options = {}) {
        let map = null;
        try {
            Utility.logDebug(`[GameMapLoader] Loading map: ${mapId}`);

            // Check if container is valid
            if (!container) {
                throw new Error('Container is null or undefined');
            }

            if (!container.canvas) {
                throw new Error('Container canvas is null or undefined');
            }

            // Create map instance
            Utility.logDebug(`[GameMapLoader] Creating new GameMap instance`);
            map = new GameMap(container);

            // Initialize with TMX file, passing along initialization options
            Utility.logDebug(`[GameMapLoader] Initializing map with id: ${mapId}`);
            await map.initialize(mapId, {
                isInitialLoad: options.isInitialLoad || false,
                allowFallback: options.allowFallback === true
            });

            this.currentMap = map;
            if (map?.displayName) {
                this.mapDisplayNames.set(this.normalizeMapId(mapId), map.displayName);
            }
            Utility.logDebug(`[GameMapLoader] Map ${mapId} loaded successfully`);
            return map;
        } catch (error) {
            map?.dispose?.();
            throw error;
        }
    }

    async loadMapWithTransition(mapId, container, options = {}) {
        const previousMap = this.currentMap ?? container?.gameMap ?? null;

        try {
            const map = await this.loadMap(mapId, container, {
                isInitialLoad: options.isInitialLoad || false,
                allowFallback: options.allowFallback === true
            });

            if (previousMap) {
                previousMap.dispose();
            }

            this.currentMap = map;
            return map;
        } catch (error) {
            this.currentMap = previousMap;
            throw error;
        }
    }
}
