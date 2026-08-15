class MapEnvironmentManager {
    static EMPTY_PRESET_DATA = Object.freeze({
        schemaVersion: 1,
        presets: {}
    });

    static _presetPromise = null;
    static _presetData = null;

    static async loadPresetData(noCache = false) {
        if (noCache) {
            MapEnvironmentManager._presetData = null;
        }

        if (MapEnvironmentManager._presetData) {
            return MapEnvironmentManager._presetData;
        }

        if (MapEnvironmentManager._presetPromise) {
            return MapEnvironmentManager._presetPromise;
        }

        const url = noCache
            ? Utility.preventCache('data/metadata/environment-presets.json')
            : 'data/metadata/environment-presets.json';

        MapEnvironmentManager._presetPromise = fetch(url)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Environment presets request failed: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                MapEnvironmentManager._presetData = (data && typeof data === 'object')
                    ? data
                    : Utility.deepClone(MapEnvironmentManager.EMPTY_PRESET_DATA);
                return MapEnvironmentManager._presetData;
            })
            .catch(error => {
                console.warn('[MapEnvironmentManager] Failed to load environment presets JSON:', error);
                MapEnvironmentManager._presetData = Utility.deepClone(MapEnvironmentManager.EMPTY_PRESET_DATA);
                return MapEnvironmentManager._presetData;
            })
            .finally(() => {
                MapEnvironmentManager._presetPromise = null;
            });

        return MapEnvironmentManager._presetPromise;
    }

    static parseColor(color, fallback = [0, 0, 0, 0]) {
        if (Array.isArray(color)) {
            const [r, g, b, a = 1] = color;
            return [
                Utility.clamp(Number(r) || 0, 0, 255),
                Utility.clamp(Number(g) || 0, 0, 255),
                Utility.clamp(Number(b) || 0, 0, 255),
                Utility.clamp(Number(a), 0, 1)
            ];
        }

        const value = String(color || '').trim();
        if (!value) {
            return [...fallback];
        }

        const rgbaMatch = value.match(/^rgba?\(([^)]+)\)$/i);
        if (rgbaMatch) {
            const parts = rgbaMatch[1].split(',').map(part => part.trim());
            const r = Utility.clamp(Number(parts[0]) || 0, 0, 255);
            const g = Utility.clamp(Number(parts[1]) || 0, 0, 255);
            const b = Utility.clamp(Number(parts[2]) || 0, 0, 255);
            const a = parts[3] != null ? Utility.clamp(Number(parts[3]), 0, 1) : 1;
            return [r, g, b, a];
        }

        const hex = value.replace('#', '');
        if (hex.length === 6 || hex.length === 8) {
            const hasAlpha = hex.length === 8;
            const offset = hasAlpha ? 2 : 0;
            const alpha = hasAlpha ? parseInt(hex.slice(0, 2), 16) / 255 : 1;
            const r = parseInt(hex.slice(offset + 0, offset + 2), 16);
            const g = parseInt(hex.slice(offset + 2, offset + 4), 16);
            const b = parseInt(hex.slice(offset + 4, offset + 6), 16);
            return [r, g, b, Utility.clamp(alpha, 0, 1)];
        }

        return [...fallback];
    }

    static toRgbaString(color) {
        const [r, g, b, a = 1] = MapEnvironmentManager.parseColor(color);
        return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${Utility.clamp(a, 0, 1)})`;
    }

    static scaleColorAlpha(color, alphaMultiplier = 1) {
        const rgba = MapEnvironmentManager.parseColor(color);
        rgba[3] = Utility.clamp(rgba[3] * alphaMultiplier, 0, 1);
        return rgba;
    }

    constructor(gameMap) {
        this.gameMap = gameMap;
        this.container = gameMap?.parent || null;
        this.canvas = this.container?.canvas || null;
        this.timeManager = this.container?.timeManager || GameTime.instance || null;
        this.mapData = null;
        this.presetData = null;
        this.config = null;

        this.frontLayer = null;
        this.backLayer = null;
        this.frontRoot = null;
        this.backRoot = null;
        this.fillElement = null;
        this.gradientElement = null;
        this.vignetteElement = null;

        this.lightingOverlay = null;
        this.lightingColorCanvas = null;
        this.lightingDarknessCanvas = null;
        this.lightingColorContext = null;
        this.lightingDarknessContext = null;
        this._lightingCanvasScale = 1;
        this._lightingBounds = null;

        this.roomVolumes = [];
        this.lightOpenings = [];

        // Derived from the wall system's openings (F-L2): windows admit
        // daylight into their room and spill light between rooms. Rebuilt on
        // wall:ready and every geometry change — never authored by hand.
        this._windowDaylightByRoom = new Map();
        this._windowSpillOpenings = [];
        // Rooms that share an open, wall-free edge (F-P2): one light space,
        // modelled as an implicit opening rather than by merging regions.
        this._openBoundaryOpenings = [];
        this._openingProbes = [];
        this._lightGeometry = null;
        this._artMask = null;
        this._artMaskPending = null;
        this._wallEventUnsubscribers = [];

        this.currentAtmosphere = null;
        this.targetAtmosphere = null;
        this.atmosphereFrom = null;
        this.atmosphereTransitionMs = 0;
        this.atmosphereTransitionElapsed = 0;
        this.atmosphereTransitionActive = false;
        this._atmosphereSignature = '';
        this._lightingSignature = '';

        this._timeData = this.getTimeData();
        this._subscriptions = [];
        this._isInitialized = false;

        this._boundResize = () => {
            this.syncLightingOverlayBounds(true);
            this.resizeLightingCanvases(null, true);
            this._lightingSignature = '';
            this.renderLighting(true);
        };
    }

    async initialize(mapData = {}) {
        this.mapData = mapData || {};
        this.presetData = await MapEnvironmentManager.loadPresetData(this.gameMap?.noCache === true);
        this.ensureEnvironmentLayers();
        this.ensureLightingOverlay();
        this.config = this.resolveConfig();
        this.roomVolumes = this.buildRoomVolumes();
        this.lightOpenings = this.buildLightOpenings();
        this.registerRoomRegions();
        this.subscribeToWallEvents();
        // Walls build after the environment manager on map load, so this first
        // pass is usually empty — wall:ready delivers the real one.
        this.rebuildWindowLighting();
        this._timeData = this.getTimeData();
        this.currentAtmosphere = this.resolveAtmosphereState(this._timeData);
        this.targetAtmosphere = Utility.deepClone(this.currentAtmosphere);
        this.atmosphereFrom = Utility.deepClone(this.currentAtmosphere);
        this.subscribeToTime();
        window.addEventListener('resize', this._boundResize);
        this.syncLightingOverlayBounds(true);
        this.resizeLightingCanvases(null, true);
        this.renderAtmosphere(true);
        this.renderLighting(true);
        this._isInitialized = true;
    }

    ensureEnvironmentLayers() {
        const canvas = this.canvas;
        if (!canvas) {
            return;
        }

        this.backLayer = canvas.querySelector('.layer.environment-back');
        this.frontLayer = canvas.querySelector('.layer.environment-front');

        if (!this.backLayer) {
            this.backLayer = document.createElement('div');
            this.backLayer.className = 'layer environment-back';
            canvas.appendChild(this.backLayer);
        }

        if (!this.frontLayer) {
            this.frontLayer = document.createElement('div');
            this.frontLayer.className = 'layer environment-front';
            canvas.appendChild(this.frontLayer);
        }

        this.backLayer.querySelectorAll('.map-environment-root').forEach(node => node.remove());
        this.frontLayer.querySelectorAll('.map-environment-root').forEach(node => node.remove());

        this.backRoot = document.createElement('div');
        this.backRoot.className = 'map-environment-root map-environment-root--back';
        this.backLayer.appendChild(this.backRoot);

        this.frontRoot = document.createElement('div');
        this.frontRoot.className = 'map-environment-root map-environment-root--front';
        this.frontLayer.appendChild(this.frontRoot);

        this.fillElement = document.createElement('div');
        this.fillElement.className = 'map-environment-fill';
        this.frontRoot.appendChild(this.fillElement);

        this.gradientElement = document.createElement('div');
        this.gradientElement.className = 'map-environment-gradient';
        this.frontRoot.appendChild(this.gradientElement);

        this.vignetteElement = document.createElement('div');
        this.vignetteElement.className = 'map-environment-vignette';
        this.frontRoot.appendChild(this.vignetteElement);
    }

    ensureLightingOverlay() {
        const root = this.container?.element || null;
        if (!root) {
            return;
        }

        root.querySelectorAll('.lighting-overlay').forEach(node => node.remove());

        this.lightingOverlay = document.createElement('div');
        this.lightingOverlay.className = 'lighting-overlay ignore';
        root.appendChild(this.lightingOverlay);

        this.lightingDarknessCanvas = document.createElement('canvas');
        this.lightingDarknessCanvas.className = 'lighting-overlay__canvas lighting-overlay__darkness';
        this.lightingOverlay.appendChild(this.lightingDarknessCanvas);

        this.lightingColorCanvas = document.createElement('canvas');
        this.lightingColorCanvas.className = 'lighting-overlay__canvas lighting-overlay__color';
        this.lightingOverlay.appendChild(this.lightingColorCanvas);

        this.lightingColorContext = this.lightingColorCanvas.getContext('2d');
        this.lightingDarknessContext = this.lightingDarknessCanvas.getContext('2d');
    }

    getElementRect(element) {
        if (!element) {
            return {
                left: 0,
                top: 0,
                width: 0,
                height: 0,
                right: 0,
                bottom: 0
            };
        }

        if (typeof this.container?.getRect === 'function') {
            return this.container.getRect(element);
        }

        const rect = element.getBoundingClientRect();
        const left = rect.left + window.scrollX;
        const top = rect.top + window.scrollY;
        return {
            left,
            top,
            width: rect.width,
            height: rect.height,
            right: left + rect.width,
            bottom: top + rect.height
        };
    }

    getViewportBounds() {
        const root = this.container?.element || null;
        // Container geometry is cached by ContainerManager (invalidated on resize/
        // fullscreen); only the canvas rect must be measured live because the
        // camera CSS transform moves it every frame.
        const containerRect = typeof this.container?.getContainerRect === 'function'
            ? this.container.getContainerRect()
            : this.getElementRect(root);
        const canvasRect = this.getElementRect(this.canvas);
        const contentLeft = containerRect.left + Number(root?.clientLeft || 0);
        const contentTop = containerRect.top + Number(root?.clientTop || 0);
        const contentWidth = Math.max(0, Number(root?.clientWidth) || 0);
        const contentHeight = Math.max(0, Number(root?.clientHeight) || 0);
        const contentRight = contentLeft + contentWidth;
        const contentBottom = contentTop + contentHeight;
        const canvasLeft = Number.isFinite(canvasRect.left) ? canvasRect.left : contentLeft;
        const canvasTop = Number.isFinite(canvasRect.top) ? canvasRect.top : contentTop;
        const canvasRight = Number.isFinite(canvasRect.right) ? canvasRect.right : (canvasLeft + (canvasRect.width || 0));
        const canvasBottom = Number.isFinite(canvasRect.bottom) ? canvasRect.bottom : (canvasTop + (canvasRect.height || 0));
        const left = Math.max(contentLeft, canvasLeft);
        const top = Math.max(contentTop, canvasTop);
        const right = Math.min(contentRight, canvasRight);
        const bottom = Math.min(contentBottom, canvasBottom);
        const width = Math.max(0, right - left);
        const height = Math.max(0, bottom - top);
        const offsetLeft = Math.max(0, left - contentLeft);
        const offsetTop = Math.max(0, top - contentTop);

        return {
            left,
            top,
            right,
            bottom,
            width,
            height,
            offsetLeft,
            offsetTop,
            containerRect,
            canvasRect
        };
    }

    syncLightingOverlayBounds(force = false) {
        if (!this.lightingOverlay) {
            return null;
        }

        const bounds = this.getViewportBounds();
        const rounded = {
            left: Math.round(bounds.offsetLeft),
            top: Math.round(bounds.offsetTop),
            width: Math.round(bounds.width),
            height: Math.round(bounds.height)
        };
        const previous = this._lightingBounds;
        const changed = force ||
            !previous ||
            previous.left !== rounded.left ||
            previous.top !== rounded.top ||
            previous.width !== rounded.width ||
            previous.height !== rounded.height;

        if (changed) {
            this.lightingOverlay.style.left = `${rounded.left}px`;
            this.lightingOverlay.style.top = `${rounded.top}px`;
            this.lightingOverlay.style.width = `${rounded.width}px`;
            this.lightingOverlay.style.height = `${rounded.height}px`;
            this._lightingBounds = rounded;
        }

        return {
            ...bounds,
            offsetLeft: rounded.left,
            offsetTop: rounded.top,
            width: rounded.width,
            height: rounded.height
        };
    }

    subscribeToTime() {
        if (!this.timeManager?.subscribe) {
            return;
        }

        const events = ['minute', 'dayNight', 'light', 'moonPhase', 'season'];
        events.forEach(eventName => {
            const callback = timeData => {
                this._timeData = timeData || this.getTimeData();
                this.recomputeAtmosphereTarget();
            };
            this.timeManager.subscribe(eventName, callback);
            this._subscriptions.push({ eventName, callback });
        });
    }

    getTimeData() {
        return this.timeManager?.getTimeData?.() || {
            minute: 0,
            hour: 12,
            lightLevel: 1,
            timeOfDay: 'midday',
            moonPhase: 'full',
            season: 'spring',
            dayProgress: 0.5,
            totalElapsedSeconds: 0
        };
    }

    resolveConfig() {
        const mapProps = this.mapData?.properties || {};
        const location = String(this.mapData?.environment?.location || '').toLowerCase();
        const fallbackPresetId = (location === 'interior' || location === 'inside' || location === 'house')
            ? 'indoors-soft'
            : 'outside-default';
        const presetId = String(
            mapProps.environmentPreset ||
            mapProps.environmentProfile ||
            fallbackPresetId
        ).trim();
        const presets = this.presetData?.presets || {};
        const basePreset =
            presets[presetId] ||
            presets[fallbackPresetId] ||
            Object.values(presets)[0] ||
            {};
        const inlineOverrides = mapProps.environmentOverrides && typeof mapProps.environmentOverrides === 'object'
            ? mapProps.environmentOverrides
            : {};

        return Utility.deepMerge(
            Utility.deepClone(basePreset),
            inlineOverrides
        );
    }

    buildRoomVolumes() {
        const authoredRooms = Array.isArray(this.mapData?.environment?.rooms)
            ? this.mapData.environment.rooms
            : [];
        const roomDefaults = this.getRoomDefaults();

        if (authoredRooms.length > 0) {
            return authoredRooms.map(room => this.normalizeRoomVolume(room, roomDefaults)).filter(Boolean);
        }
        return [];
    }

    normalizeRoomVolume(source, defaults = {}) {
        const bounds = source?.bounds || null;
        if (!bounds || !Number.isFinite(bounds.width) || !Number.isFinite(bounds.height) || bounds.width <= 0 || bounds.height <= 0) {
            return null;
        }

        const props = source?.properties || {};
        return {
            id: String(source.id || source.displayName || `room_${Math.round(bounds.x)}_${Math.round(bounds.y)}`)
                .toLowerCase()
                .replace(/[^a-z0-9_-]+/g, '_'),
            displayName: source.displayName || props.displayName || source.id || 'Room',
            bounds: {
                x: Number(bounds.x) || 0,
                y: Number(bounds.y) || 0,
                width: Number(bounds.width) || 0,
                height: Number(bounds.height) || 0
            },
			tilemask: Array.isArray(source.tilemask?.cells)
				? {
					cells: source.tilemask.cells,
					cellSize: Number(source.tilemask.cellSize) || 32
				}
				: null,
            lighting: {
                ambientFloor: Number(props.ambientFloor ?? props.roomAmbientFloor ?? defaults.ambientFloor ?? 0.18),
                ambientCeiling: Number(props.ambientCeiling ?? props.roomAmbientCeiling ?? defaults.ambientCeiling ?? 0.72),
                fillColor: props.fillColor || defaults.fillColor || 'rgba(255, 221, 172, 0.26)',
                shadowColor: props.shadowColor || this.config?.lighting?.darknessColor || 'rgba(18, 18, 28, 1)',
                feather: Number(props.feather ?? props.roomFeather ?? defaults.feather ?? 36),
                mode: String(props.lightingMode || props.roomLightingMode || defaults.mode || 'mixed').toLowerCase(),
                // How dim this room sits in full daylight with no lamps and no
                // windows: 0 = as bright as outside, 1 = night-dark. Reduced by
                // window daylight and by lights (deriveRoomLightingState).
                daylightGloom: Utility.clamp(Number(props.daylightGloom ?? defaults.daylightGloom ?? 0), 0, 1)
            },
            wallFinishId: props.wallFinishId || null,
            floorFinishId: props.floorFinishId || null
        };
    }

    /**
     * Publish the lighting rooms into the shared region store as layer `room`.
     *
     * `roomVolumes` is the authored-input staging list. Runtime consumers read
     * the shared region store, so authored rooms and detected wall enclosures
     * use the same lighting, occupancy, floor, and cutaway paths.
     *
     * Regions keep the authored polygon where one exists (Tiled stores polygon
     * points relative to the object origin, so they are offset back to world
     * space here); the lighting normaliser discards it and uses bounds only.
     */
    registerRoomRegions() {
        const regionManager = this.gameMap?.regionManager;
        if (!regionManager) return;

        for (const existing of regionManager.all('room')) {
            regionManager.remove(existing);
        }

        const authored = Array.isArray(this.mapData?.environment?.rooms)
            ? this.mapData.environment.rooms
            : [];
        const polygonById = new Map();
		const tilemaskById = new Map();
        for (const room of authored) {
			if (Array.isArray(room?.tilemask?.cells) && room.tilemask.cells.length > 0) {
				tilemaskById.set(String(room.id).toLowerCase(), room.tilemask);
			}
            if (!Array.isArray(room?.polygon) || room.polygon.length < 3) continue;
            const originX = Number(room.bounds?.x) || 0;
            const originY = Number(room.bounds?.y) || 0;
            polygonById.set(
                String(room.id).toLowerCase(),
                room.polygon.map(p => ({ x: originX + (Number(p.x) || 0), y: originY + (Number(p.y) || 0) }))
            );
        }

        for (const volume of this.roomVolumes) {
            const polygon = polygonById.get(String(volume.id).toLowerCase());
			const tilemask = tilemaskById.get(String(volume.id).toLowerCase()) ?? volume.tilemask;
            regionManager.add(new SpatialRegion({
                id: volume.id,
                layer: 'room',
                shape: tilemask
					? { kind: 'tilemask', cells: tilemask.cells, cellSize: tilemask.cellSize, bounds: volume.bounds }
					: polygon
						? { kind: 'polygon', points: polygon, bounds: volume.bounds }
						: { kind: 'rect', bounds: volume.bounds },
                properties: {
                    displayName: volume.displayName,
                    indoor: true,
                    wallFinishId: volume.wallFinishId,
                    floorFinishId: volume.floorFinishId,
                    authoredFloorFinishId: volume.floorFinishId,
                    lighting: volume.lighting
                },
                source: volume
            }));
        }
    }

    buildLightOpenings() {
        const authoredOpenings = Array.isArray(this.mapData?.environment?.lightOpenings)
            ? this.mapData.environment.lightOpenings
            : [];

        return authoredOpenings
            .map(opening => {
                const bounds = opening?.bounds || null;
                if (!bounds) {
                    return null;
                }

                const props = opening.properties || {};
                return {
                    id: String(opening.id || `opening_${Math.round(bounds.x)}_${Math.round(bounds.y)}`)
                        .toLowerCase()
                        .replace(/[^a-z0-9_-]+/g, '_'),
                    roomA: String(props.roomA || props.from || '').toLowerCase(),
                    roomB: String(props.roomB || props.to || '').toLowerCase(),
                    spillFactor: Utility.clamp(Number(props.spillFactor ?? props.spill ?? 0.16), 0, 1),
                    bounds: {
                        x: Number(bounds.x) || 0,
                        y: Number(bounds.y) || 0,
                        width: Number(bounds.width) || 0,
                        height: Number(bounds.height) || 0
                    }
                };
            })
            .filter(Boolean);
    }

    getRoomDefaults() {
        return this.config?.lighting?.roomDefaults || {};
    }

    subscribeToWallEvents() {
        const events = this.gameMap?.eventManager;
        if (!events || this._wallEventUnsubscribers.length > 0) return;

        const forThisMap = (payload) => !payload?.mapId || payload.mapId === this.gameMap?.id;
        this._wallEventUnsubscribers.push(events.on(EVENTS.WALL_READY, payload => {
            if (forThisMap(payload)) this.rebuildWindowLighting();
        }));
        this._wallEventUnsubscribers.push(events.on(EVENTS.WALL_GEOMETRY_CHANGED, payload => {
            if (forThisMap(payload)) this.rebuildWindowLighting();
        }));
        // Presentation changes the room-edge feather (walls down soften the
        // light boundary), not the light values themselves.
        this._wallEventUnsubscribers.push(events.on(EVENTS.WALL_PRESENTATION_CHANGED, payload => {
            if (forThisMap(payload)) {
                this._lightingSignature = '';
                this.renderLighting(true);
            }
        }));
    }

    /**
     * Windows come free from the wall system: every wall opening already knows
     * its cells and axis, so each one is probed on both sides the same way door
     * topology is. A window with a room on one side and exterior on the other
     * admits daylight into that room; any opening joining two rooms becomes a
     * spill connection, exactly like an authored lightOpening.
     */
    rebuildWindowLighting() {
        this._windowDaylightByRoom = new Map();
        this._windowSpillOpenings = [];

        const wallBuilder = this.gameMap?.wallBuilder;
        const regionManager = this.gameMap?.regionManager;
        if (!wallBuilder || !regionManager) {
            this._lightingSignature = '';
            return;
        }

        const windowConfig = this.config?.lighting?.window || {};
        const perCell = Number(windowConfig.daylightPerCell ?? 0.22);
        const daylightMax = Utility.clamp(Number(windowConfig.daylightMax ?? 0.85), 0, 1);
        const spillFactor = Utility.clamp(Number(windowConfig.spillFactor ?? 0.16), 0, 1);
        const cellSize = this.gameMap?.gridSystem?.config?.cellSize ?? 32;
        const reach = cellSize * 1.5;

        const roomIdAt = (x, y) => {
            const rooms = regionManager.regionsAt(x, y, 'room') || [];
            return rooms[0] ? String(rooms[0].id).toLowerCase() : null;
        };

        this._openingProbes = [];
        for (const opening of wallBuilder.openings || []) {
            const cells = opening.cells || [];
            if (cells.length === 0) continue;
            const bounds = wallBuilder.getOpeningBounds(opening);
            const cx = bounds.x + (bounds.width / 2);
            const cy = bounds.y + (bounds.height / 2);
            const horizontal = opening.axis !== 'vertical';
            const sideA = roomIdAt(cx + (horizontal ? 0 : -reach), cy + (horizontal ? -reach : 0));
            const sideB = roomIdAt(cx + (horizontal ? 0 : reach), cy + (horizontal ? reach : 0));
            this._openingProbes.push({
                id: opening.id,
                type: opening.type,
                axis: opening.axis || 'horizontal',
                cells: cells.length,
                sideA,
                sideB
            });

            if (sideA && sideB && sideA !== sideB) {
                this._windowSpillOpenings.push({
                    roomA: sideA,
                    roomB: sideB,
                    spillFactor
                });
                continue;
            }

            // Daylight needs sky on the far side, and only a window frames it —
            // an exterior door is opaque until opened, which collision already
            // models; light stays simpler by ignoring it.
            if (opening.type !== 'window') continue;
            const room = sideA || sideB;
            if (!room) continue;
            const current = this._windowDaylightByRoom.get(room) || 0;
            this._windowDaylightByRoom.set(
                room,
                Utility.clamp(current + (perCell * cells.length), 0, daylightMax)
            );
        }

        this.rebuildLightZoneLinks();
        this._lightingSignature = '';
        if (SiteConfig.debug?.lighting === true) console.log('[lighting]', this.describeLighting());
    }

    /**
     * Everything the lighting model resolved for right now, as data.
     *
     * A room that renders wrong looks the same whether its geometry, its room
     * probe or its tuning is at fault; these numbers are the only thing that
     * tells them apart, so they are part of the system rather than a throwaway
     * console snippet.
     */
    describeLighting() {
        const timeData = this.getTimeData();
        const lightingState = this.resolveLightingPeriodState(timeData);
        const allLights = this.collectAllLights();
        const roomState = this.deriveRoomLightingState(allLights, lightingState.darknessFactor);
        const geometry = this.getLightGeometry();

        return {
            minutes: this.getMinutesFromTimeData(timeData),
            darknessFactor: Number(lightingState.darknessFactor.toFixed(3)),
            presentation: this.gameMap?.wallBuilder?.presentation || null,
            rooms: Array.from(roomState.values()).map(entry => ({
                id: entry.room.id,
                displayName: entry.room.displayName,
                lift: Number(entry.lift.toFixed(3)),
                gloom: Number(entry.gloom.toFixed(3)),
                gloomFloor: Number(entry.gloomFloor.toFixed(3)),
                colorAlpha: Number(entry.colorAlpha.toFixed(3)),
                windowDaylight: Number(entry.windowDaylight.toFixed(3)),
                daylightGloom: entry.room.lighting.daylightGloom,
                mode: entry.room.lighting.mode,
                interiorCells: geometry.interiorByRoom.get(entry.room.id)?.size ?? 0,
                rects: geometry.regions.get(entry.room.id)?.rects?.length ?? 0
            })),
            lights: allLights.map(light => ({
                id: light.object?.id ?? null,
                roomId: light.roomId,
                x: Math.round(light.center.x),
                y: Math.round(light.center.y),
                roomFill: light.config.roomFill,
                intensity: light.config.intensity
            })),
            openings: this._openingProbes || [],
            spill: this.getSpillOpenings().map(opening => ({
                id: opening.id ?? null,
                roomA: opening.roomA,
                roomB: opening.roomB,
                openCells: opening.openCells ?? null,
                spillFactor: Number(Number(opening.spillFactor).toFixed(3))
            })),
            windowDaylight: Object.fromEntries(this._windowDaylightByRoom)
        };
    }

    /**
     * Two rooms whose shared boundary has wall-free cell runs are ONE light
     * space (ruling 2.1). They stay separate regions - floors, membership and
     * stats all still want distinct rooms - and couple only through an implicit
     * opening whose spill scales with how open the boundary is, on the same
     * per-cell curve a window's daylight uses.
     */
    rebuildLightZoneLinks() {
        this._openBoundaryOpenings = [];
        if (!this.gameMap?.regionManager) return;

        const config = this.config?.lighting?.openBoundary || {};
        const spillPerCell = Number(config.spillPerCell ?? 0.3);
        const spillMax = Utility.clamp(Number(config.spillMax ?? 0.85), 0, 1);

        const ownerByCell = new Map();
        for (const [roomId, cells] of this.getLightGeometry().interiorByRoom) {
            for (const key of cells) ownerByCell.set(key, roomId);
        }

        const openCellsByPair = new Map();
        for (const [key, roomId] of ownerByCell) {
            const [cellX, cellY] = key.split(',').map(Number);
            for (const direction of WallBuilder.DIRECTIONS) {
                // East and south only: every adjacency is then counted once.
                if (direction.dx < 0 || direction.dy < 0) continue;
                const neighbour = ownerByCell.get(`${cellX + direction.dx},${cellY + direction.dy}`);
                if (!neighbour || neighbour === roomId) continue;
                const pairKey = [roomId, neighbour].sort().join('\u0000');
                openCellsByPair.set(pairKey, (openCellsByPair.get(pairKey) || 0) + 1);
            }
        }

        this._openBoundaryOpenings = [...openCellsByPair].map(([pairKey, openCells]) => {
            const [roomA, roomB] = pairKey.split('\u0000');
            return {
                id: `open_${roomA}__${roomB}`,
                roomA,
                roomB,
                openCells,
                spillFactor: Utility.clamp(spillPerCell * openCells, 0, spillMax)
            };
        });
    }

    // Build mode flattens the world to daylight so finishes read true; the
    // player's own display settings are untouched and come back on exit.
    isAtmosphereOverlayEnabled() {
        return this.lightingOverride !== true &&
            this.gameMap?.getTimeOfDayOverlayEnabledSetting?.() !== false;
    }

    isLightingEnabled() {
        return this.lightingOverride !== true &&
            this.gameMap?.getLightingEnabledSetting?.() !== false;
    }

    refreshDisplaySettings() {
        this._atmosphereSignature = '';
        this._lightingSignature = '';
        this.renderAtmosphere(true);
        this.renderLighting(true);
    }

    recomputeAtmosphereTarget(immediate = false) {
        const nextState = this.resolveAtmosphereState(this._timeData);
        const transitionMs = Math.max(0, Number(nextState.transitionMs || this.config?.atmosphere?.defaultTransitionMs || 0));

        if (immediate || !this.currentAtmosphere) {
            this.currentAtmosphere = Utility.deepClone(nextState);
            this.targetAtmosphere = Utility.deepClone(nextState);
            this.atmosphereFrom = Utility.deepClone(nextState);
            this.atmosphereTransitionMs = 0;
            this.atmosphereTransitionElapsed = 0;
            this.atmosphereTransitionActive = false;
            this.renderAtmosphere(true);
            this.renderLighting(true);
            return;
        }

        this.atmosphereFrom = Utility.deepClone(this.currentAtmosphere);
        this.targetAtmosphere = Utility.deepClone(nextState);
        this.atmosphereTransitionMs = transitionMs;
        this.atmosphereTransitionElapsed = 0;
        this.atmosphereTransitionActive = transitionMs > 0;

        if (!this.atmosphereTransitionActive) {
            this.currentAtmosphere = Utility.deepClone(nextState);
            this.renderAtmosphere(true);
            this.renderLighting(true);
        }
    }

    resolveAtmosphereState(timeData = {}) {
        const atmosphere = this.config?.atmosphere || {};
        const cycleState = this.resolveSunCycleState(timeData, atmosphere);
        const defaultGradientStops = [
            { position: 0.0, color: 'rgba(0, 0, 0, 0)' },
            { position: 0.25, color: 'rgba(0, 0, 0, 0)' },
            { position: 0.5, color: 'rgba(0, 0, 0, 0)' },
            { position: 0.75, color: 'rgba(0, 0, 0, 0)' },
            { position: 1.0, color: 'rgba(0, 0, 0, 0)' }
        ];

        const bandConfig = cycleState.bandConfig || {};
        const bandStops = (Array.isArray(bandConfig.stops) && bandConfig.stops.length > 0
            ? bandConfig.stops
            : defaultGradientStops
        ).map(stop => ({
            position: Utility.clamp(Number(stop.position ?? 0), 0, 1),
            color: MapEnvironmentManager.parseColor(stop.color || 'rgba(0, 0, 0, 0)')
        }));

        const nightOpacity = Utility.clamp(
            (cycleState.mode === 'night' ? cycleState.nightStrength : 0) * Number(atmosphere.nightOpacityMax ?? 0.76) * 0.18,
            0,
            1
        );
        const nightColor = MapEnvironmentManager.scaleColorAlpha(
            atmosphere.nightColor || 'rgba(14, 34, 84, 1)',
            nightOpacity
        );

        const vignetteOpacity = Utility.clamp(
            (cycleState.mode === 'night' ? cycleState.nightStrength : 0) * Number(atmosphere.vignetteOpacityMax ?? 0.12) * 0.35,
            0,
            1
        );
        const vignetteColor = MapEnvironmentManager.scaleColorAlpha(
            atmosphere.vignetteColor || 'rgba(6, 12, 28, 1)',
            vignetteOpacity
        );

        return {
            transitionMs: Number(atmosphere.transitionMs ?? atmosphere.defaultTransitionMs ?? 0),
            globalBlendMode: atmosphere.nightBlendMode || 'multiply',
            globalColor: nightColor,
            gradientEnabled: cycleState.bandStrength > 0.001 && bandStops.length > 0,
            gradientBlendMode: bandConfig.blendMode || 'screen',
            gradientOpacity: Utility.clamp(
                Number(bandConfig.bandOpacity ?? 0.9) * cycleState.bandStrength,
                0,
                1
            ),
            gradientAngle: Number(bandConfig.angle ?? (cycleState.mode === 'sunrise' ? -100 : 100)),
            gradientOriginX: Utility.lerp(
                Number(bandConfig.startX ?? 0.5),
                Number(bandConfig.endX ?? 0.5),
                cycleState.positionProgress
            ),
            gradientOriginY: Utility.lerp(
                Number(bandConfig.startY ?? bandConfig.originY ?? 0.5),
                Number(bandConfig.endY ?? bandConfig.originY ?? 0.5),
                cycleState.positionProgress
            ),
            gradientSpan: Utility.lerp(
                Math.max(0.5, Number(bandConfig.startSpan ?? bandConfig.span ?? 1.3)),
                Math.max(0.5, Number(bandConfig.endSpan ?? bandConfig.span ?? 1.3)),
                cycleState.positionProgress
            ),
            gradientStops: bandStops,
            vignetteColor,
            vignetteOpacity
        };
    }

    resolveLightingPeriodState(timeData = {}) {
        const lighting = this.config?.lighting || {};
        const atmosphere = this.config?.atmosphere || {};
        const cycleState = this.resolveSunCycleState(timeData, atmosphere);

        return {
            darknessFactor: Utility.clamp(cycleState.nightStrength, 0, 1),
            darknessOpacityMax: Utility.clamp(
                Number(lighting.darknessOpacityMax ?? 0.82),
                0,
                1
            ),
            darknessColor: lighting.darknessColor || atmosphere.nightColor || 'rgba(12, 30, 74, 1)',
            cycleMode: cycleState.mode,
            positionProgress: cycleState.positionProgress || 0,
            bandStrength: cycleState.bandStrength || 0,
            bandConfig: cycleState.bandConfig || null
        };
    }

    // A map further east meets the sun earlier: shifting the local clock
    // forward moves this map into (and out of) the sunrise/sunset windows
    // sooner. Constant per map, clamped — geography as flavor, not simulation.
    getSunCycleOffsetMinutes() {
        const config = SiteConfig.world?.sunCycle;
        const worldX = Number(this.mapData?.properties?.worldX);
        if (!config || !Number.isFinite(worldX)) return 0;
        const max = Math.abs(Number(config.maxOffsetMinutes) || 0);
        return Utility.clamp(worldX * (Number(config.minutesPerWorldX) || 0), -max, max);
    }

    resolveSunCycleState(timeData = {}, atmosphere = {}) {
        const currentMinutes = (this.getMinutesFromTimeData(timeData) + this.getSunCycleOffsetMinutes() + 1440) % 1440;
        const sunriseStart = this.parseTimeToMinutes(atmosphere?.sunrise?.start);
        const sunriseEnd = this.parseTimeToMinutes(atmosphere?.sunrise?.end);
        const sunsetStart = this.parseTimeToMinutes(atmosphere?.sunset?.start);
        const sunsetEnd = this.parseTimeToMinutes(atmosphere?.sunset?.end);

        if (this.isValidRange(sunsetStart, sunsetEnd) && this.isMinutesInRange(currentMinutes, sunsetStart, sunsetEnd)) {
            const progress = this.getRangeProgress(currentMinutes, sunsetStart, sunsetEnd);
            const positionProgress = this.easeInOutSine(progress);
            const nightStrength = this.easeInOutSine(progress);
            const bandStrength = Math.pow(Math.sin(progress * Math.PI), 0.72);
            return {
                mode: 'sunset',
                positionProgress,
                bandStrength,
                nightStrength,
                bandConfig: atmosphere.sunset || {}
            };
        }

        if (this.isValidRange(sunriseStart, sunriseEnd) && this.isMinutesInRange(currentMinutes, sunriseStart, sunriseEnd)) {
            const progress = this.getRangeProgress(currentMinutes, sunriseStart, sunriseEnd);
            const positionProgress = this.easeInOutSine(progress);
            const nightStrength = 1 - this.easeInOutSine(progress);
            const bandStrength = Math.pow(Math.sin(progress * Math.PI), 0.72);
            return {
                mode: 'sunrise',
                positionProgress,
                bandStrength,
                nightStrength,
                bandConfig: atmosphere.sunrise || {}
            };
        }

        const isNightAfterSunset = Number.isFinite(sunsetEnd) && currentMinutes >= sunsetEnd;
        const isNightBeforeSunrise = Number.isFinite(sunriseStart) && currentMinutes < sunriseStart;
        if (isNightAfterSunset || isNightBeforeSunrise) {
            return {
                mode: 'night',
                positionProgress: 1,
                bandStrength: 0,
                nightStrength: 1,
                bandConfig: null
            };
        }

        return {
            mode: 'day',
            positionProgress: 0,
            bandStrength: 0,
            nightStrength: 0,
            bandConfig: null
        };
    }

    isValidRange(startMinutes, endMinutes) {
        return Number.isFinite(startMinutes) && Number.isFinite(endMinutes) && startMinutes !== endMinutes;
    }

    isMinutesInRange(currentMinutes, startMinutes, endMinutes) {
        if (!this.isValidRange(startMinutes, endMinutes)) {
            return false;
        }

        if (startMinutes < endMinutes) {
            return currentMinutes >= startMinutes && currentMinutes < endMinutes;
        }

        return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }

    getRangeProgress(currentMinutes, startMinutes, endMinutes) {
        if (!this.isValidRange(startMinutes, endMinutes)) {
            return 0;
        }

        const span = this.getWrappedMinuteDistance(startMinutes, endMinutes);
        const traveled = this.getWrappedMinuteDistance(startMinutes, currentMinutes);
        return span > 0 ? Utility.clamp(traveled / span, 0, 1) : 0;
    }

    easeOutQuad(t = 0) {
        const clamped = Utility.clamp(t, 0, 1);
        return 1 - ((1 - clamped) * (1 - clamped));
    }

    easeInOutSine(t = 0) {
        const clamped = Utility.clamp(t, 0, 1);
        return -(Math.cos(Math.PI * clamped) - 1) / 2;
    }

    parseTimeToMinutes(value) {
        if (typeof value !== 'string') {
            return null;
        }

        const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
        if (!match) {
            return null;
        }

        const hours = Number(match[1]);
        const minutes = Number(match[2]);
        if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
            return null;
        }

        return ((hours * 60) + minutes + 1440) % 1440;
    }

    getMinutesFromTimeData(timeData = {}) {
        const totalElapsedSeconds = Number(timeData.totalElapsedSeconds);
        const dayDurationInMinutes = Number(this.timeManager?.config?.dayDurationInMinutes);
        if (Number.isFinite(totalElapsedSeconds) && Number.isFinite(dayDurationInMinutes) && dayDurationInMinutes > 0) {
            const gameMinutes = totalElapsedSeconds * (24 / dayDurationInMinutes);
            return ((gameMinutes % 1440) + 1440) % 1440;
        }

        const hour = Number(timeData.hour ?? 0);
        const minute = Number(timeData.minute ?? 0);
        return (((hour * 60) + minute) + 1440) % 1440;
    }

    getWrappedMinuteDistance(fromMinutes, toMinutes) {
        return ((toMinutes - fromMinutes) + 1440) % 1440;
    }

    interpolateAtmosphereState(fromState, toState, t) {
        const lerpColor = (fromColor, toColor) => ([
            Utility.lerp(fromColor[0], toColor[0], t),
            Utility.lerp(fromColor[1], toColor[1], t),
            Utility.lerp(fromColor[2], toColor[2], t),
            Utility.lerp(fromColor[3], toColor[3], t)
        ]);

        const stops = [];
        const fromStops = Array.isArray(fromState.gradientStops) ? fromState.gradientStops : [];
        const toStops = Array.isArray(toState.gradientStops) ? toState.gradientStops : [];
        const stopCount = Math.min(fromStops.length, toStops.length);
        for (let index = 0; index < stopCount; index++) {
            stops.push({
                position: Utility.lerp(fromStops[index].position, toStops[index].position, t),
                color: lerpColor(fromStops[index].color, toStops[index].color)
            });
        }

        return {
            transitionMs: toState.transitionMs,
            globalBlendMode: t < 0.5 ? fromState.globalBlendMode : toState.globalBlendMode,
            globalColor: lerpColor(fromState.globalColor, toState.globalColor),
            gradientEnabled: t < 0.5 ? fromState.gradientEnabled : toState.gradientEnabled,
            gradientBlendMode: t < 0.5 ? fromState.gradientBlendMode : toState.gradientBlendMode,
            gradientOpacity: Utility.lerp(fromState.gradientOpacity, toState.gradientOpacity, t),
            gradientAngle: Utility.lerp(fromState.gradientAngle, toState.gradientAngle, t),
            gradientOriginX: Utility.lerp(fromState.gradientOriginX, toState.gradientOriginX, t),
            gradientOriginY: Utility.lerp(fromState.gradientOriginY, toState.gradientOriginY, t),
            gradientSpan: Utility.lerp(fromState.gradientSpan, toState.gradientSpan, t),
            gradientStops: stops.length > 0 ? stops : Utility.deepClone(toState.gradientStops),
            vignetteColor: lerpColor(fromState.vignetteColor, toState.vignetteColor),
            vignetteOpacity: Utility.lerp(fromState.vignetteOpacity, toState.vignetteOpacity, t)
        };
    }

    update(deltaTime = 16) {
        if (!this._isInitialized) {
            return;
        }

        if (this.atmosphereTransitionActive && this.targetAtmosphere && this.atmosphereFrom) {
            this.atmosphereTransitionElapsed += deltaTime;
            const progress = this.atmosphereTransitionMs > 0
                ? Utility.clamp(this.atmosphereTransitionElapsed / this.atmosphereTransitionMs, 0, 1)
                : 1;
            // Interpolated state differs every frame — force, skipping the signature build
            this.currentAtmosphere = this.interpolateAtmosphereState(this.atmosphereFrom, this.targetAtmosphere, progress);
            this.renderAtmosphere(true);
            if (progress >= 1) {
                this.currentAtmosphere = Utility.deepClone(this.targetAtmosphere);
                this.atmosphereTransitionActive = false;
            }
        }

        this.renderLighting(false);
    }

    buildGradientCss(state) {
        if (!state.gradientEnabled || state.gradientOpacity <= 0 || !Array.isArray(state.gradientStops) || state.gradientStops.length === 0) {
            return 'none';
        }

        const stops = state.gradientStops.map(stop => {
            const color = [...stop.color];
            color[3] = Utility.clamp(color[3] * state.gradientOpacity, 0, 1);
            return `${MapEnvironmentManager.toRgbaString(color)} ${Math.round(Utility.clamp(stop.position, 0, 1) * 100)}%`;
        });

        return `linear-gradient(${state.gradientAngle}deg, ${stops.join(', ')})`;
    }

    buildVignetteCss(state) {
        const color = [...state.vignetteColor];
        color[3] = Utility.clamp(state.vignetteOpacity, 0, 1);
        const outerColor = MapEnvironmentManager.toRgbaString(color);
        return `radial-gradient(circle at 50% 50%, rgba(0, 0, 0, 0) 42%, ${outerColor} 100%)`;
    }

    renderAtmosphere(force = false) {
        if (!this.currentAtmosphere || !this.fillElement || !this.gradientElement || !this.vignetteElement) {
            return;
        }

        if (!this.isAtmosphereOverlayEnabled()) {
            if (this.frontRoot) {
                this.frontRoot.style.display = 'none';
            }
            this._atmosphereSignature = 'disabled';
            return;
        }

        if (this.frontRoot) {
            this.frontRoot.style.display = '';
        }

        const state = this.currentAtmosphere;

        // Only build the (allocation-heavy) signature when change detection is
        // actually wanted — forced calls (transitions write every frame anyway)
        // skip it and invalidate so the next unforced call re-establishes it.
        let signature = null;
        if (!force) {
            signature = JSON.stringify({
                fill: state.globalColor.map(value => Number(value.toFixed(3))),
                fillBlend: state.globalBlendMode,
                gradientEnabled: state.gradientEnabled,
                gradientOpacity: Number(state.gradientOpacity.toFixed(3)),
                gradientAngle: Number(state.gradientAngle.toFixed(2)),
                gradientOriginX: Number(state.gradientOriginX.toFixed(3)),
                gradientOriginY: Number(state.gradientOriginY.toFixed(3)),
                gradientSpan: Number(state.gradientSpan.toFixed(3)),
                stops: state.gradientStops.map(stop => [
                    Number(stop.position.toFixed(3)),
                    ...stop.color.map(value => Number(value.toFixed(3)))
                ]),
                vignette: state.vignetteColor.map(value => Number(value.toFixed(3))),
                vignetteOpacity: Number(state.vignetteOpacity.toFixed(3))
            });

            if (signature === this._atmosphereSignature) {
                return;
            }
        }

        this._atmosphereSignature = signature;
        this.fillElement.style.backgroundColor = MapEnvironmentManager.toRgbaString(state.globalColor);
        this.fillElement.style.mixBlendMode = state.globalBlendMode || 'multiply';

        this.gradientElement.style.backgroundImage = this.buildGradientCss(state);
        this.gradientElement.style.backgroundSize = `${Utility.clamp(state.gradientSpan * 100, 15, 300)}% 100%`;
        this.gradientElement.style.backgroundPosition = `${state.gradientOriginX * 100}% ${state.gradientOriginY * 100}%`;
        this.gradientElement.style.backgroundRepeat = 'no-repeat';
        this.gradientElement.style.mixBlendMode = state.gradientBlendMode || 'screen';
        this.gradientElement.style.opacity = state.gradientEnabled ? '1' : '0';

        this.vignetteElement.style.backgroundImage = this.buildVignetteCss(state);
        this.vignetteElement.style.opacity = `${Utility.clamp(state.vignetteOpacity, 0, 1)}`;
    }

    getViewportMetrics() {
        const bounds = this.syncLightingOverlayBounds();
        const zoom = this.gameMap?.camera?.zoomLevel || 1;
        const cameraX = this.gameMap?.camera?.posX || 0;
        const cameraY = this.gameMap?.camera?.posY || 0;
        const renderOffset = this.gameMap?.getRenderOffset?.() || { x: 0, y: 0 };
        const overscan = Math.max(0, Number(this.config?.lighting?.overscan ?? 64));
        const safeZoom = Math.max(zoom, 0.001);
        const viewportWidth = bounds?.width || 0;
        const viewportHeight = bounds?.height || 0;
        const viewportOffsetLeft = bounds?.offsetLeft || 0;
        const viewportOffsetTop = bounds?.offsetTop || 0;
        return {
            viewportWidth,
            viewportHeight,
            viewportOffsetLeft,
            viewportOffsetTop,
            zoom,
            cameraX,
            cameraY,
            overscan,
            worldLeft: ((viewportOffsetLeft - overscan) / safeZoom) - cameraX - renderOffset.x,
            worldTop: ((viewportOffsetTop - overscan) / safeZoom) - cameraY - renderOffset.y,
            worldRight: ((viewportOffsetLeft + viewportWidth + overscan) / safeZoom) - cameraX - renderOffset.x,
            worldBottom: ((viewportOffsetTop + viewportHeight + overscan) / safeZoom) - cameraY - renderOffset.y
        };
    }

    resizeLightingCanvases(view = null, force = false) {
        if (!this.lightingColorCanvas || !this.lightingDarknessCanvas) {
            return null;
        }

        const nextView = view || this.getViewportMetrics();
        const resolutionScale = Math.max(0.25, Number(this.config?.lighting?.resolutionScale ?? 0.5));
        const colorResolutionScale = Math.max(
            resolutionScale,
            Number(this.config?.lighting?.colorResolutionScale ?? 1)
        );
        const deviceScale = Math.max(1, window.devicePixelRatio || 1);
        const darknessCanvasScale = resolutionScale * deviceScale;
        const colorCanvasScale = colorResolutionScale * deviceScale;

        this._lightingCanvasScale = darknessCanvasScale;

        const resizeCanvas = (canvas, canvasScale) => {
            const targetWidth = Math.max(1, Math.ceil(nextView.viewportWidth * canvasScale));
            const targetHeight = Math.max(1, Math.ceil(nextView.viewportHeight * canvasScale));
            const needsResize = force ||
                canvas.width !== targetWidth ||
                canvas.height !== targetHeight ||
                canvas.style.width !== `${nextView.viewportWidth}px` ||
                canvas.style.height !== `${nextView.viewportHeight}px`;

            if (needsResize) {
                canvas.width = targetWidth;
                canvas.height = targetHeight;
                canvas.style.width = `${nextView.viewportWidth}px`;
                canvas.style.height = `${nextView.viewportHeight}px`;
            }
        };

        resizeCanvas(this.lightingColorCanvas, colorCanvasScale);
        resizeCanvas(this.lightingDarknessCanvas, darknessCanvasScale);

        if (this.lightingColorContext) {
            this.lightingColorContext.setTransform(colorCanvasScale, 0, 0, colorCanvasScale, 0, 0);
        }
        if (this.lightingDarknessContext) {
            this.lightingDarknessContext.setTransform(darknessCanvasScale, 0, 0, darknessCanvasScale, 0, 0);
        }

        return nextView;
    }

    worldToScreenPoint(worldX, worldY, view = this.getViewportMetrics()) {
        const renderOffset = this.gameMap?.getRenderOffset?.() || { x: 0, y: 0 };
        return {
            x: ((worldX + renderOffset.x + view.cameraX) * view.zoom) - view.viewportOffsetLeft,
            y: ((worldY + renderOffset.y + view.cameraY) * view.zoom) - view.viewportOffsetTop
        };
    }

    worldToScreenRect(bounds, view = this.getViewportMetrics()) {
        const topLeft = this.worldToScreenPoint(bounds.x, bounds.y, view);
        return {
            x: topLeft.x,
            y: topLeft.y,
            width: bounds.width * view.zoom,
            height: bounds.height * view.zoom
        };
    }

    // Screen-space rect of the map's drawn extent: the ground itself plus the
    // strip above it that wall art overhangs into. Render-inset padding beyond
    // that is empty page, not world, and must never receive light or darkness.
    getMapExtentClipRect(view) {
        const dimensions = this.gameMap?.dimensions;
        if (!Number.isFinite(dimensions?.width) || !Number.isFinite(dimensions?.height)) {
            return null;
        }
        const overhang = Math.max(0, Number(this.gameMap?.resolveRenderTopOverhang?.() ?? 0));
        return this.worldToScreenRect({
            x: 0,
            y: -overhang,
            width: dimensions.width,
            height: dimensions.height + overhang
        }, view);
    }

    // ── Map-art alpha clip (G11) ─────────────────────────────────────────────
    //
    // The extent rect above is only the cheap outer bound. Night must not sit
    // on transparent tiles either - a map is rarely a full rectangle of art,
    // and darkness over the hole around it reads as a rendering fault, not as
    // night. So the real clip is the alpha of what is actually drawn: the
    // composited background, the wall art standing over it (including the strip
    // it overhangs above the map), and the painted room floors.
    //
    // Built once per map load / background change, at a fraction of world
    // resolution, and applied as ONE destination-in composite at the end of
    // each pass.
    getMapArtSignature() {
        const dimensions = this.gameMap?.dimensions || {};
        return [
            this.gameMap?.id || '',
            Math.round(dimensions.width || 0),
            Math.round(dimensions.height || 0),
            Math.round(this.gameMap?.resolveRenderTopOverhang?.() ?? 0),
            this.gameMap?.layers?.background?.style?.backgroundImage || '',
            this.gameMap?.wallBuilder?.cells?.size ?? 0,
            this.gameMap?.wallBuilder?.presentation || '',
            this.gameMap?.wallBuilder?.pieces?.map(piece => piece.renderPlan?.mode ?? '').join('') ?? '',
            this.gameMap?.floorBuilder?.surfaces?.size ?? 0
        ].join('#');
    }

    // Returns the mask currently available, and schedules a rebuild when the
    // map has moved on. The previous mask keeps drawing meanwhile: dropping it
    // would flash a frame of unclipped darkness over the whole page.
    getMapArtMask() {
        const signature = this.getMapArtSignature();
        if (this._artMask?.signature !== signature && this._artMaskPending !== signature) {
            this._artMaskPending = signature;
            this.buildMapArtMask(signature);
        }
        return this._artMask?.mask || null;
    }

    loadBackgroundImage() {
        const url = String(this.gameMap?.layers?.background?.style?.backgroundImage || '')
            .match(/url\(["']?(.*?)["']?\)/)?.[1];
        if (!url) return Promise.resolve(null);
        if (this._backgroundImage?.url === url) return Promise.resolve(this._backgroundImage.image);
        return new Promise(resolve => {
            const image = new Image();
            image.onload = () => {
                this._backgroundImage = { url, image };
                resolve(image);
            };
            image.onerror = () => resolve(null);
            image.src = url;
        });
    }

    async buildMapArtMask(signature) {
        const dimensions = this.gameMap?.dimensions;
        if (!Number.isFinite(dimensions?.width) || !Number.isFinite(dimensions?.height)) return;

        const image = await this.loadBackgroundImage();
        if (this._artMaskPending !== signature) return;
        // No baked background means nothing to trace: fall back to the extent
        // rect rather than clipping the world away.
        if (!image) {
            this._artMask = { signature, mask: null };
            return;
        }

        const overhang = Math.max(0, Number(this.gameMap?.resolveRenderTopOverhang?.() ?? 0));
        const bounds = {
            x: 0,
            y: -overhang,
            width: dimensions.width,
            height: dimensions.height + overhang
        };
        const scale = Utility.clamp(Number(this.config?.lighting?.artMaskScale ?? 0.5), 0.1, 1);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.ceil(bounds.width * scale));
        canvas.height = Math.max(1, Math.ceil(bounds.height * scale));
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.setTransform(scale, 0, 0, scale, -bounds.x * scale, -bounds.y * scale);
        ctx.drawImage(image, 0, 0, dimensions.width, dimensions.height);

        // Everything painted here must be REAL ART, traced by its own alpha.
        // Wall canvases are drawn, not filled as boxes: the frame is transparent
        // above the cap and a doorway is a hole cleared straight through it, so
        // a box would hand the mask back the very pixels it exists to exclude.
        const cellSize = this.getLightCellSize();
        for (const piece of this.gameMap?.wallBuilder?.pieces || []) {
            const element = piece.element;
            if (!element || element.hidden || !element.width || !element.height) continue;
            ctx.drawImage(element, piece.x * cellSize, Number.parseFloat(element.style.top) || 0);
        }
        // A doorway or window is a hole cleared straight THROUGH the wall art,
        // and the thing filling that hole is the door/window object hanging in
        // it. Without them the mask keeps the hole and the darkness skips over
        // every opening - the pale gaps the owner reported in the wall.
        ctx.fillStyle = '#ffffff';
        for (const opening of this.gameMap?.wallBuilder?.openings || []) {
            // The object's own rect, NOT getOpeningBounds - that returns the
            // opening's cell footprint down at ground level, while the door or
            // window itself hangs up in the wall frame where the hole is.
            const object = this.gameMap.getObjectById?.(opening.id);
            if (!object?.size) continue;
            ctx.fillRect(object.posX, object.posY, object.size.width, object.size.height);
        }

        for (const { canvas: floor } of this.gameMap?.floorBuilder?.surfaces?.values() || []) {
            if (!floor?.width || !floor.height) continue;
            ctx.drawImage(
                floor,
                Number.parseFloat(floor.style.left) || 0,
                Number.parseFloat(floor.style.top) || 0
            );
        }

        this._artMask = { signature, mask: { canvas, bounds } };
        this._lightingSignature = '';
        this.renderLighting(true);
    }

    applyMapArtMask(ctx, view) {
        const mask = this.getMapArtMask();
        if (!mask) return;
        const rect = this.worldToScreenRect(mask.bounds, view);
        ctx.save();
        ctx.globalCompositeOperation = 'destination-in';
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(mask.canvas, rect.x, rect.y, rect.width, rect.height);
        ctx.restore();
    }

    intersectsView(bounds, view = this.getViewportMetrics(), pad = 0) {
        const left = bounds.x;
        const top = bounds.y;
        const right = bounds.x + bounds.width;
        const bottom = bounds.y + bounds.height;
        return right >= view.worldLeft - pad &&
            left <= view.worldRight + pad &&
            bottom >= view.worldTop - pad &&
            top <= view.worldBottom + pad;
    }

    collectAllLights() {
        return (this.gameMap?.objects || [])
            .filter(object => object?.isLightSource?.())
            .map(object => {
                const config = object.getLightSourceConfig?.();
                if (!config) {
                    return null;
                }

                const center = object.getCenterPoint?.('collider') || object.getCenterPoint?.() || {
                    x: object.posX + (object.size?.width ?? 0) / 2,
                    y: object.posY + (object.size?.height ?? 0) / 2
                };
                const room = this.findRoomContainingPoint(center.x, center.y);

                return {
                    object,
                    config,
                    center,
                    roomId: String(object.getConfig?.('lighting.roomId', room?.id || '') || room?.id || '').toLowerCase()
                };
            })
            .filter(Boolean);
    }

    collectVisibleLights(view = this.getViewportMetrics(), allLights = this.collectAllLights()) {
        const lights = allLights
            .filter(light => {
                const radius = Number(light.config?.radius || 0);
                return (
                    light.center.x + radius >= view.worldLeft &&
                    light.center.x - radius <= view.worldRight &&
                    light.center.y + radius >= view.worldTop &&
                    light.center.y - radius <= view.worldBottom
                );
            })
            .sort((a, b) => Number(b.config?.hero === true) - Number(a.config?.hero === true));

        return lights;
    }

    collectVisibleBlockers(view = this.getViewportMetrics()) {
        const objects = this.gameMap?.gridSystem?.activeObjects
            ? Array.from(this.gameMap.gridSystem.activeObjects)
            : (this.gameMap?.objects || []);

        const objectBlockers = objects
            .filter(object => object?.isLightBlocking?.())
            .map(object => object.getLightBlockerGeometry?.())
            .filter(Boolean)
            .filter(geometry => this.intersectsView({
                x: geometry.left,
                y: geometry.top,
                width: geometry.width,
                height: geometry.height
            }, view, 24));
        const wallBlockers = this.gameMap?.wallBuilder?.getLightBlockers?.() || [];
        return objectBlockers.concat(wallBlockers.filter(geometry => this.intersectsView({
            x: geometry.left,
            y: geometry.top,
            width: geometry.width,
            height: geometry.height
        }, view, 24)));
    }

    getLightingRooms() {
        const regions = this.gameMap?.regionManager?.all('room') || [];
        if (regions.length === 0) return this.roomVolumes;

        const defaults = this.getRoomDefaults();
        return regions.map(region => {
            const properties = region.properties || {};
            const normalized = this.normalizeRoomVolume({
                id: region.id,
                displayName: properties.displayName || region.id,
                bounds: region.bounds,
                properties: {
                    ...properties,
                    ...(properties.lighting || {})
                }
            }, defaults);
            if (!normalized) return null;
            normalized.shape = region.shape;
            normalized.region = region;
            return normalized;
        }).filter(Boolean);
    }

    findRoomContainingPoint(worldX, worldY) {
        return this.gameMap?.regionManager?.regionsAt(worldX, worldY, 'room')?.[0] || null;
    }

    deriveRoomLightingState(allLights, darknessFactor) {
        const roomState = new Map();
        const daylight = 1 - Utility.clamp(darknessFactor, 0, 1);

        const windowConfig = this.config?.lighting?.window || {};
        const gloomFloorShare = Utility.clamp(Number(windowConfig.gloomFloor ?? 0.25), 0, 1);

        this.getLightingRooms().forEach(room => {
            const mode = room.lighting.mode || 'mixed';
            const baseFloor = mode === 'local'
                ? 0
                : room.lighting.ambientFloor * darknessFactor;
            const windowDaylight = Utility.clamp(
                this._windowDaylightByRoom.get(String(room.id).toLowerCase()) ?? 0,
                0,
                1
            );
            // Indoors is dimmer than outdoors even at noon with the curtains
            // open: windows and lamps cut a room's gloom down but never right
            // through it. Without this floor a wide-enough window hits
            // daylightMax, a lamp burns off what is left, and the room renders
            // with no interior lighting at all - the reported "unlit" room.
            const gloomFloor = room.lighting.daylightGloom * daylight * gloomFloorShare;
            roomState.set(room.id, {
                room,
                lift: Utility.clamp(baseFloor, 0, room.lighting.ambientCeiling),
                colorAlpha: Utility.clamp(baseFloor * 0.42, 0, 0.42),
                windowDaylight,
                gloomFloor,
                // Daytime interior dimness: the room's own gloom, cut down by
                // its windows. Lights subtract from it below; night hands over
                // to the global darkness as darknessFactor rises.
                gloom: Utility.clamp(
                    room.lighting.daylightGloom * daylight * (1 - windowDaylight),
                    gloomFloor,
                    1
                )
            });
        });

        allLights.forEach(light => {
            if (!light.roomId || !roomState.has(light.roomId)) {
                return;
            }

            const target = roomState.get(light.roomId);
            const mode = target.room.lighting.mode || 'mixed';
            const modeMultiplier = mode === 'filled' ? 1.08 : (mode === 'local' ? 0.42 : 0.78);
            const contribution = Utility.clamp(
                light.config.roomFill * light.config.intensity * darknessFactor * modeMultiplier,
                0,
                target.room.lighting.ambientCeiling
            );
            target.lift = Utility.clamp(target.lift + contribution, 0, target.room.lighting.ambientCeiling);
            target.colorAlpha = Utility.clamp(target.colorAlpha + (contribution * 0.56), 0, 0.52);

            // The same lamp that lifts night darkness burns off daytime gloom.
            const dayContribution = light.config.roomFill * light.config.intensity * daylight * modeMultiplier;
            target.gloom = Utility.clamp(target.gloom - dayContribution, target.gloomFloor, 1);
        });

        // Authored light openings, wall-derived ones and open room boundaries
        // all share one spill pass.
        //
        // Every opening reads from a SNAPSHOT of the pre-spill values, never
        // from what an earlier opening just wrote. Spill is one hop: light
        // reaches the room next door, not three rooms down a chain. Cascading
        // in place also made the result depend on opening order, and with the
        // strong spill an open boundary carries it left the windowless hallway
        // brighter at night than the room with the lamp in it.
        const source = new Map(Array.from(roomState, ([id, entry]) => [id, {
            lift: entry.lift,
            colorAlpha: entry.colorAlpha,
            gloom: entry.gloom
        }]));

        this.getSpillOpenings().forEach(opening => {
            const roomA = roomState.get(opening.roomA);
            const roomB = roomState.get(opening.roomB);
            const fromA = source.get(opening.roomA);
            const fromB = source.get(opening.roomB);
            if (!roomA || !roomB) {
                return;
            }

            const spill = Utility.clamp(opening.spillFactor, 0, 1);
            roomA.lift = Utility.clamp(
                Math.max(roomA.lift, fromA.lift + (fromB.lift * spill)),
                0,
                roomA.room.lighting.ambientCeiling
            );
            roomB.lift = Utility.clamp(
                Math.max(roomB.lift, fromB.lift + (fromA.lift * spill)),
                0,
                roomB.room.lighting.ambientCeiling
            );
            roomA.colorAlpha = Utility.clamp(Math.max(roomA.colorAlpha, fromB.colorAlpha * spill), 0, 0.52);
            roomB.colorAlpha = Utility.clamp(Math.max(roomB.colorAlpha, fromA.colorAlpha * spill), 0, 0.52);
            // A brighter neighbour lightens this room's daytime gloom toward
            // its own, by the spill amount — never the other way around.
            roomA.gloom = Math.max(roomA.gloomFloor, Math.min(roomA.gloom, Utility.lerp(fromA.gloom, fromB.gloom, spill)));
            roomB.gloom = Math.max(roomB.gloomFloor, Math.min(roomB.gloom, Utility.lerp(fromB.gloom, fromA.gloom, spill)));
        });

        return roomState;
    }

    // -- Room light geometry (F-P1) -------------------------------------------
    //
    // A room's light region is derived from the CELL geometry the wall system
    // and the enclosure detector already trust, never from its authored rect:
    // an authored rect can miss the wall face by a cell, and every such gap is
    // an unlit strip on screen. Interior is the room's wall-free cells; the
    // wall footprint and the face standing over it belong to the WALL band, so
    // the floor fill stops at the wall face line and the plaster strip is lit
    // exactly once.
    //
    // The result is world-space rects, cached against a geometry + cut-state
    // signature. Per-frame work is the screen transform and one stencil raster.

    getSpillOpenings() {
        return [...this.lightOpenings, ...this._windowSpillOpenings, ...this._openBoundaryOpenings];
    }

    getLightCellSize() {
        return Number(this.gameMap?.wallBuilder?.cellSize) ||
            Number(this.gameMap?.gridSystem?.config?.cellSize) ||
            32;
    }

    isWallCell(key) {
        const wallBuilder = this.gameMap?.wallBuilder;
        if (!wallBuilder) return false;
        return wallBuilder.cells.has(key) || wallBuilder.openingByCell.has(key);
    }

    isCellInGrid(cellX, cellY) {
        const grid = this.gameMap?.gridSystem;
        const width = Number(grid?.gridWidth) || 0;
        const height = Number(grid?.gridHeight) || 0;
        if (width <= 0 || height <= 0) return true;
        return cellX >= 0 && cellY >= 0 && cellX < width && cellY < height;
    }

    getLightGeometrySignature() {
        const wallBuilder = this.gameMap?.wallBuilder;
        const rooms = this.gameMap?.regionManager?.all('room') || [];
        return [
            rooms.map(room => [
                room.id,
                room.shape?.kind,
                Math.round(room.bounds?.x || 0),
                Math.round(room.bounds?.y || 0),
                Math.round(room.bounds?.width || 0),
                Math.round(room.bounds?.height || 0),
                room.shape?.cells?.size ?? 0
            ].join(',')).join('|'),
            wallBuilder?.presentation || '',
            wallBuilder?.cells?.size ?? 0,
            (wallBuilder?.pieces || []).map(piece =>
                (piece.renderPlan?.states || []).map(state => state[0]).join('') || piece.renderPlan?.mode || ''
            ).join('|')
        ].join('#');
    }

    getLightGeometry() {
        const signature = this.getLightGeometrySignature();
        if (this._lightGeometry?.signature === signature) return this._lightGeometry;

        const interiorByRoom = this.buildRoomInteriorCells();
        this._lightGeometry = {
            signature,
            interiorByRoom,
            regions: this.buildRoomLightRects(interiorByRoom)
        };
        return this._lightGeometry;
    }

    /**
     * Every room's interior cells: the wall-free cells it owns.
     *
     * Seeded from the region's own shape (a tilemask room already is exactly
     * this), then grown outward through wall-free, unclaimed cells so a rect
     * authored a cell short of its wall still reaches the wall face. The growth
     * is bounded - an authored room that genuinely opens onto unowned floor
     * must not swallow the map.
     */
    buildRoomInteriorCells() {
        const regions = this.gameMap?.regionManager?.all('room') || [];
        const cellSize = this.getLightCellSize();
        const claimed = new Map();
        const interiorByRoom = new Map();

        for (const region of regions) {
            const cells = new Set();
            const bounds = region.bounds || {};
            const x0 = Math.floor((bounds.x || 0) / cellSize);
            const y0 = Math.floor((bounds.y || 0) / cellSize);
            const x1 = Math.ceil(((bounds.x || 0) + (bounds.width || 0)) / cellSize) - 1;
            const y1 = Math.ceil(((bounds.y || 0) + (bounds.height || 0)) / cellSize) - 1;
            for (let y = y0; y <= y1; y++) {
                for (let x = x0; x <= x1; x++) {
                    const key = `${x},${y}`;
                    if (!this.isCellInGrid(x, y) || claimed.has(key) || this.isWallCell(key)) continue;
                    if (!region.contains((x + 0.5) * cellSize, (y + 0.5) * cellSize)) continue;
                    cells.add(key);
                    claimed.set(key, region.id);
                }
            }
            interiorByRoom.set(region.id, cells);
        }

        const grow = Math.max(0, Number(this.config?.lighting?.roomInteriorGrowCells ?? 2));
        if (grow === 0) return interiorByRoom;

        for (const region of regions) {
            const cells = interiorByRoom.get(region.id);
            if (!cells || cells.size === 0) continue;
            const bounds = region.bounds || {};
            const minX = Math.floor((bounds.x || 0) / cellSize) - grow;
            const minY = Math.floor((bounds.y || 0) / cellSize) - grow;
            const maxX = Math.ceil(((bounds.x || 0) + (bounds.width || 0)) / cellSize) - 1 + grow;
            const maxY = Math.ceil(((bounds.y || 0) + (bounds.height || 0)) / cellSize) - 1 + grow;
            const queue = [...cells];
            for (let index = 0; index < queue.length; index++) {
                const [cellX, cellY] = queue[index].split(',').map(Number);
                for (const direction of WallBuilder.DIRECTIONS) {
                    const nextX = cellX + direction.dx;
                    const nextY = cellY + direction.dy;
                    const key = `${nextX},${nextY}`;
                    if (nextX < minX || nextX > maxX || nextY < minY || nextY > maxY) continue;
                    if (!this.isCellInGrid(nextX, nextY) || claimed.has(key) || this.isWallCell(key)) continue;
                    claimed.set(key, region.id);
                    cells.add(key);
                    queue.push(key);
                }
            }
        }

        return interiorByRoom;
    }

    /**
     * A room's light region: the surfaces it actually owns, taken from the wall
     * art's own anatomy rather than from its cell.
     *
     * A wall cell is three strips, not one. Its footprint is only `thickness`
     * px wide, centred - so the cell also holds a strip of the FLOOR on each
     * side of it, and those strips belong to the rooms they touch. Between them
     * sits the construction plaster, which belongs to no room and takes no
     * darkness.
     *
     * Above that, an east-west wall carries a PAINTED FACE: rows
     * `[baseline - height, baseline]` of the frame, which is what `getCutYOver`
     * already reports and follows the wall down when it is cut. The paint is
     * the room in FRONT's surface, so that room lights it. (The 14px above the
     * paint is the wall's top cap - construction, unpainted, and excluded with
     * the rest of the plaster.)
     *
     * A NORTH-SOUTH wall has no painted face at all - `paintRegion` returns
     * null for it, "construction, not a painted face" - so it contributes only
     * the two floor strips either side of its footprint.
     */
    buildRoomLightRects(interiorByRoom) {
        const cellSize = this.getLightCellSize();
        const wallBuilder = this.gameMap?.wallBuilder;
        const ownerByCell = new Map();
        for (const [roomId, cells] of interiorByRoom) {
            for (const key of cells) ownerByCell.set(key, roomId);
        }

        const rectsByRoom = new Map(Array.from(interiorByRoom, ([roomId, cells]) =>
            [roomId, this.mergeCellRuns(cells, cellSize)]
        ));
        const push = (roomId, rect) => {
            if (roomId && rect.width > 0 && rect.height > 0) rectsByRoom.get(roomId)?.push(rect);
        };
        // Construction plaster belongs to no room and takes no darkness, so it
        // is punched out of the composed field rather than assigned.
        const plasterRects = [];

        for (const piece of wallBuilder?.pieces || []) {
            const construction = wallBuilder.registry.getConstruction(piece.constructionId);
            if (!construction) continue;
            const thickness = Number(construction.thickness) || 0;
            const inset = (cellSize - thickness) / 2;

            for (const cell of piece.cells) {
                const at = (dx, dy) => ownerByCell.get(`${cell.x + dx},${cell.y + dy}`) || null;
                const left = cell.x * cellSize;
                const top = cell.y * cellSize;

                if (!WallBuilder.isHorizontalMask(cell.mask)) {
                    // Runs north-south. Seen edge-on it is one narrow column of
                    // construction with no cap standing over anything, so it
                    // takes the room's light whole rather than being sliced into
                    // slivers either side of its footprint - which left most of
                    // the tile dark. West owns it where both sides are rooms.
                    push(at(-1, 0) || at(1, 0), { x: left, y: top, width: cellSize, height: cellSize });
                    continue;
                }

                // The paint runs DOWN to the baseline, so it already covers the
                // footprint's screen area; the only floor the cell still shows
                // is the sliver below the baseline, and that is the south
                // room's - the half-tile that was reading as unlit where wall
                // met floor.
                const south = at(0, 1);
                push(south, {
                    x: left,
                    y: piece.baseline,
                    width: cellSize,
                    height: (top + cellSize) - piece.baseline
                });

                if (piece.renderPlan?.mode === 'hidden') continue;
                const paintTop = wallBuilder.getCutYOver(piece, left, left + cellSize);

                // The cap sits ABOVE the paint, inside the room behind, so that
                // room's floor darkness runs straight over it unless it is cut
                // back out. Always - it is construction whoever stands nearby.
                plasterRects.push({ x: left, y: paintTop - thickness, width: cellSize, height: thickness });

                // The painted face is lit by the room that LOOKS at it. With no
                // room to the south there is nobody to look: that face is an
                // exterior surface, so the whole art band comes back out rather
                // than taking the light of the room hidden behind it.
                if (!south) {
                    plasterRects.push({
                        x: left,
                        y: paintTop,
                        width: cellSize,
                        height: piece.baseline - paintTop
                    });
                    continue;
                }
                push(south, { x: left, y: paintTop, width: cellSize, height: piece.baseline - paintTop });
            }
        }

        this._plasterRects = plasterRects;
        const softEdges = this.buildOpenBoundaryEdges(interiorByRoom, ownerByCell, cellSize);
        return new Map(Array.from(rectsByRoom, ([roomId, rects]) => {
            const edges = softEdges.get(roomId) || [];
            return [roomId, {
                rects,
                edges,
                bounds: this.unionRects(rects.concat(edges))
            }];
        }));
    }

    /**
     * The strips along which a room's light should fade out instead of ending.
     *
     * A hard edge is only honest where a wall stands on it. Two rooms sharing an
     * open, wall-free boundary are one light space (ruling 2.1) and stepping
     * between their values mid-floor reads as a seam painted across an empty
     * doorway. Each such edge gets a short ramp reaching INTO the neighbour;
     * the painter-order composite then crossfades the two rather than stacking
     * them.
     */
    buildOpenBoundaryEdges(interiorByRoom, ownerByCell, cellSize) {
        const edgesByRoom = new Map(Array.from(interiorByRoom.keys(), roomId => [roomId, []]));
        const blend = Math.max(0, Number(this.config?.lighting?.openBoundaryBlendPx ?? 24));
        if (blend === 0) return edgesByRoom;

        for (const [roomId, cells] of interiorByRoom) {
            for (const key of cells) {
                const [cellX, cellY] = key.split(',').map(Number);
                const left = cellX * cellSize;
                const top = cellY * cellSize;
                for (const direction of WallBuilder.DIRECTIONS) {
                    const neighbour = ownerByCell.get(`${cellX + direction.dx},${cellY + direction.dy}`);
                    if (!neighbour || neighbour === roomId) continue;
                    edgesByRoom.get(roomId).push(direction.dx !== 0
                        ? {
                            x: direction.dx > 0 ? left + cellSize : left - blend,
                            y: top,
                            width: blend,
                            height: cellSize,
                            axis: 'x',
                            sign: direction.dx
                        }
                        : {
                            x: left,
                            y: direction.dy > 0 ? top + cellSize : top - blend,
                            width: cellSize,
                            height: blend,
                            axis: 'y',
                            sign: direction.dy
                        });
                }
            }
        }
        return edgesByRoom;
    }

    mergeCellRuns(cells, cellSize) {
        const rows = new Map();
        for (const key of cells) {
            const [cellX, cellY] = key.split(',').map(Number);
            if (!rows.has(cellY)) rows.set(cellY, []);
            rows.get(cellY).push(cellX);
        }

        const rects = [];
        for (const [cellY, columns] of rows) {
            columns.sort((a, b) => a - b);
            let start = columns[0];
            let previous = columns[0];
            for (let index = 1; index <= columns.length; index++) {
                if (columns[index] === previous + 1) {
                    previous = columns[index];
                    continue;
                }
                rects.push({
                    x: start * cellSize,
                    y: cellY * cellSize,
                    width: (previous - start + 1) * cellSize,
                    height: cellSize
                });
                start = columns[index];
                previous = columns[index];
            }
        }
        return rects;
    }

    unionRects(rects) {
        if (rects.length === 0) return null;
        let left = Infinity;
        let top = Infinity;
        let right = -Infinity;
        let bottom = -Infinity;
        for (const rect of rects) {
            left = Math.min(left, rect.x);
            top = Math.min(top, rect.y);
            right = Math.max(right, rect.x + rect.width);
            bottom = Math.max(bottom, rect.y + rect.height);
        }
        return { x: left, y: top, width: right - left, height: bottom - top };
    }

    /**
     * The room's region rasterised to an alpha stencil in screen space: solid
     * across the whole interior, fading only OUTWARD past the boundary.
     *
     * The old feather ran inward - full strength at the centre, zero at the
     * edge - which painted daytime gloom as a bright rim around a dark middle,
     * and lifted night darkness into a dark ring just inside every room. The
     * interior value must not depend on the feather at all; that is what makes
     * walls-up and walls-down agree.
     */
    buildRoomLightStencil(room, view, feather = 0) {
        const geometry = this.getLightGeometry().regions.get(room.id);
        const rects = geometry?.rects?.length
            ? geometry.rects
            : (room.bounds ? [room.bounds] : []);
        const worldBounds = geometry?.bounds || room.bounds;
        if (rects.length === 0 || !worldBounds || typeof Path2D === 'undefined') return null;

        const pad = Math.max(0, feather) + 2;
        const screen = this.worldToScreenRect(worldBounds, view);
        const x = Math.floor(screen.x - pad);
        const y = Math.floor(screen.y - pad);
        const width = Math.ceil(screen.width + (pad * 2));
        const height = Math.ceil(screen.height + (pad * 2));
        const limit = Math.max(2048, Math.ceil(Math.max(view.viewportWidth, view.viewportHeight) * 3));
        if (width <= 0 || height <= 0 || width > limit || height > limit) return null;

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        const path = new Path2D();
        for (const rect of rects) {
            const screenRect = this.worldToScreenRect(rect, view);
            path.rect(screenRect.x - x, screenRect.y - y, screenRect.width, screenRect.height);
        }

        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#ffffff';
        for (const edge of geometry?.edges || []) {
            const rect = this.worldToScreenRect(edge, view);
            const localX = rect.x - x;
            const localY = rect.y - y;
            const horizontal = edge.axis === 'x';
            const forward = edge.sign > 0;
            const gradient = ctx.createLinearGradient(
                horizontal ? (forward ? localX : localX + rect.width) : localX,
                horizontal ? localY : (forward ? localY : localY + rect.height),
                horizontal ? (forward ? localX + rect.width : localX) : localX,
                horizontal ? localY : (forward ? localY + rect.height : localY)
            );
            gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
            gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
            ctx.fillStyle = gradient;
            ctx.fillRect(localX, localY, rect.width, rect.height);
        }
        ctx.fillStyle = '#ffffff';
        if (feather > 0) {
            // Concentric outward rings, widest and faintest first. The solid
            // fill afterwards resets the interior to exactly 1, so only the
            // band beyond the boundary carries a gradient.
            const steps = Utility.clamp(Math.round(feather / 4), 3, 10);
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            ctx.globalAlpha = 1 - Math.pow(0.03, 1 / steps);
            for (let step = steps; step >= 1; step--) {
                ctx.lineWidth = (feather * 2 * step) / steps;
                ctx.stroke(path);
            }
            ctx.globalAlpha = 1;
        }
        ctx.fill(path);

        return { canvas, x, y, width, height };
    }

    getRoomFieldCanvas(view) {
        const canvas = this._roomFieldCanvas ||= document.createElement('canvas');
        const width = Math.max(1, Math.ceil(view.viewportWidth));
        const height = Math.max(1, Math.ceil(view.viewportHeight));
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
        }
        return canvas;
    }

    /**
     * Every room's value for one pass composited into a SINGLE layer before it
     * reaches the lighting canvas, in painter order - north to south, the order
     * the map itself sorts by.
     *
     * Room regions overlap on purpose: a wall's standing face is 160px of art
     * drawn over the floor of the room behind it, so those pixels belong to the
     * room in front. Drawing each room straight onto the canvas painted them
     * twice and doubled the darkness into a hard band along every wall.
     * Erasing before drawing gives each pixel exactly one room's value, and
     * across a feathered edge it blends the two rather than stacking them.
     */
    composeRoomField(view, entries) {
        const painted = entries.filter(entry => entry.stencil && entry.rgba[3] > 0.004);
        if (painted.length === 0) return null;

        const canvas = this.getRoomFieldCanvas(view);
        const ctx = canvas.getContext('2d');
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (const { stencil, rgba } of painted) {
            ctx.globalCompositeOperation = 'destination-out';
            ctx.globalAlpha = 1;
            ctx.drawImage(stencil.canvas, stencil.x, stencil.y, stencil.width, stencil.height);
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = Utility.clamp(rgba[3], 0, 1);
            ctx.drawImage(this.tintStencil(stencil, rgba), stencil.x, stencil.y, stencil.width, stencil.height);
        }

        // Construction plaster last: it belongs to no room, so whatever ran over
        // it comes back off.
        ctx.globalCompositeOperation = 'destination-out';
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#000000';
        for (const rect of this._plasterRects || []) {
            const screen = this.worldToScreenRect(rect, view);
            ctx.fillRect(screen.x, screen.y, screen.width, screen.height);
        }
        return canvas;
    }

    drawRoomField(ctx, view, entries, composite = 'source-over') {
        const field = this.composeRoomField(view, entries);
        if (!field) return;
        ctx.save();
        ctx.globalCompositeOperation = composite;
        ctx.globalAlpha = 1;
        ctx.drawImage(field, 0, 0, view.viewportWidth, view.viewportHeight);
        ctx.restore();
    }

    tintStencil(stencil, rgba) {
        const canvas = this._tintCanvas ||= document.createElement('canvas');
        canvas.width = stencil.canvas.width;
        canvas.height = stencil.canvas.height;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(stencil.canvas, 0, 0);
        ctx.globalCompositeOperation = 'source-in';
        ctx.fillStyle = `rgb(${Math.round(rgba[0])}, ${Math.round(rgba[1])}, ${Math.round(rgba[2])})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        return canvas;
    }

    buildLightingSignature(view, lightingState, roomState, visibleLights, blockers) {
        const wallBuilder = this.gameMap?.wallBuilder;
        return JSON.stringify({
            view: [
                Math.round(view.viewportWidth),
                Math.round(view.viewportHeight),
                Math.round(view.viewportOffsetLeft),
                Math.round(view.viewportOffsetTop),
                Number(view.zoom.toFixed(3)),
                Number(view.cameraX.toFixed(2)),
                Number(view.cameraY.toFixed(2))
            ],
            minutes: this.getMinutesFromTimeData(this.getTimeData()),
            cycleMode: lightingState?.cycleMode || '',
            cycleProgress: Number((lightingState?.positionProgress || 0).toFixed(3)),
            bandStrength: Number((lightingState?.bandStrength || 0).toFixed(3)),
            darkness: Number((lightingState?.darknessFactor || 0).toFixed(3)),
            dither: this.gameMap?.getLightingDitherEnabledSetting?.() !== false,
            wallMode: wallBuilder?.presentation || '',
            wallCuts: wallBuilder?.pieces?.map(piece => piece.renderPlan?.mode ?? '').join('') ?? '',
            rooms: Array.from(roomState.values()).map(entry => [
                entry.room.id,
                Number(entry.lift.toFixed(3)),
                Number(entry.colorAlpha.toFixed(3)),
                Number((entry.gloom ?? 0).toFixed(3)),
                Number((entry.windowDaylight ?? 0).toFixed(3))
            ]),
            lights: visibleLights.map(light => [
                light.object?.id || '',
                Number(light.center.x.toFixed(1)),
                Number(light.center.y.toFixed(1)),
                Number(light.config.radius.toFixed(1)),
                Number(light.config.intensity.toFixed(2)),
                light.config.color,
                light.roomId,
                light.config.castsShadows === true
            ]),
            blockers: blockers.map(blocker => [
                Number(blocker.left.toFixed(1)),
                Number(blocker.top.toFixed(1)),
                Number(blocker.width.toFixed(1)),
                Number(blocker.height.toFixed(1))
            ])
        });
    }

    clearLightingCanvases(view) {
        if (this.lightingColorContext) {
            this.lightingColorContext.clearRect(0, 0, view.viewportWidth, view.viewportHeight);
        }
        if (this.lightingDarknessContext) {
            this.lightingDarknessContext.clearRect(0, 0, view.viewportWidth, view.viewportHeight);
        }
    }

    renderLighting(force = false) {
        if (!this.lightingOverlay || !this.lightingColorContext || !this.lightingDarknessContext) {
            return;
        }

        // Steady-state gate — the full pass below measures rects and scans every
        // map object for lights, which is far too heavy to run per frame when
        // nothing can have changed. Viewport geometry only moves with the camera
        // (window resize forces a refresh via _boundResize), and light/room
        // toggles are caught by a low-cadence periodic re-check instead.
        const camera = this.gameMap?.camera;
        const camX = camera?.posX ?? 0;
        const camY = camera?.posY ?? 0;
        const camZoom = camera?.zoomLevel ?? 1;
        const minutes = this.getMinutesFromTimeData(this.getTimeData());
        const now = performance.now();
        const cameraChanged = camX !== this._lastLightingCamX ||
            camY !== this._lastLightingCamY ||
            camZoom !== this._lastLightingCamZoom;
        const refreshDue = now >= (this._nextLightingRefreshAt ?? 0);

        if (!force && !cameraChanged && !refreshDue &&
            minutes === this._lastLightingMinutes &&
            !this.atmosphereTransitionActive) {
            return;
        }

        this._lastLightingCamX = camX;
        this._lastLightingCamY = camY;
        this._lastLightingCamZoom = camZoom;
        this._lastLightingMinutes = minutes;
        this._nextLightingRefreshAt = now + (this.config?.lighting?.idleRefreshMs ?? 150);

        const view = this.getViewportMetrics();
        if (view.viewportWidth <= 0 || view.viewportHeight <= 0) {
            this.lightingOverlay.style.opacity = '0';
            return;
        }

        this.resizeLightingCanvases(view);

        const lightingConfig = this.config?.lighting || {};
        if (lightingConfig.enabled === false || !this.isLightingEnabled()) {
            this.clearLightingCanvases(view);
            this.lightingOverlay.style.opacity = '0';
            return;
        }

        const timeData = this.getTimeData();
        const lightingState = this.resolveLightingPeriodState(timeData);
        const darknessFactor = lightingState.darknessFactor;
        const allLights = this.collectAllLights();
        const visibleLights = this.collectVisibleLights(view, allLights);
        const blockers = this.collectVisibleBlockers(view);
        const roomState = this.deriveRoomLightingState(allLights, darknessFactor);

        const signature = this.buildLightingSignature(view, lightingState, roomState, visibleLights, blockers);
        if (!force && signature === this._lightingSignature && !this.atmosphereTransitionActive) {
            return;
        }

        this._lightingSignature = signature;
        this.clearLightingCanvases(view);

        const darknessOpacity = darknessFactor * lightingState.darknessOpacityMax;
        const darknessColor = MapEnvironmentManager.scaleColorAlpha(
            lightingState.darknessColor,
            darknessOpacity
        );

        const darkCtx = this.lightingDarknessContext;
        const colorCtx = this.lightingColorContext;

        // The lighting canvases are world air: clipped to the map's drawn
        // extent (ground plus the wall-art strip above it) so the transparent
        // render-inset padding around the map never darkens.
        const clipRect = this.getMapExtentClipRect(view);
        const withClip = (ctx, draw) => {
            ctx.save();
            if (clipRect) {
                ctx.beginPath();
                ctx.rect(clipRect.x, clipRect.y, clipRect.width, clipRect.height);
                ctx.clip();
            }
            draw();
            ctx.restore();
        };

        // Walls down or hidden leave no visible edge for a hard light boundary
        // to sit on — soften the room feather so the transition floats.
        const wallPresentation = this.gameMap?.wallBuilder?.presentation;
        const useSoftRoomEdges = wallPresentation === 'down' || wallPresentation === 'hidden';
        const featherScale = useSoftRoomEdges
            ? Math.max(1, Number(lightingConfig.openWallFeatherScale ?? 1))
            : 1;
        // One stencil per room, shared by every pass: the interior alpha is the
        // same whichever pass reads it, which is what keeps gloom, lift and
        // room colour aligned on the exact same boundary.
        // Painter order: a room further south draws later and wins the pixels
        // its walls cover, the same depth rule the map sorts everything else by.
        const orderedRooms = Array.from(roomState.values())
            .filter(entry => this.intersectsView(entry.room.bounds, view, 24))
            .sort((a, b) => (a.room.bounds.y - b.room.bounds.y) || (a.room.bounds.x - b.room.bounds.x));
        const roomStencils = new Map(orderedRooms.map(entry => [
            entry.room.id,
            this.buildRoomLightStencil(
                entry.room,
                view,
                useSoftRoomEdges ? entry.room.lighting.feather * featherScale : 0
            )
        ]));
        const roomField = (toRgba) => orderedRooms.map(entry => ({
            stencil: roomStencils.get(entry.room.id),
            rgba: toRgba(entry)
        }));

        withClip(darkCtx, () => {
            this.drawAmbientDarkness(darkCtx, view, lightingState, darknessColor);

            this.drawRoomField(
                darkCtx,
                view,
                roomField(entry => [0, 0, 0, Utility.clamp(entry.lift, 0, 1)]),
                'destination-out'
            );

            // Daytime interior gloom draws INTO rooms, where night darkness is
            // only ever lifted out of them. Before the light cutouts, so lamps
            // visibly burn holes through it.
            this.drawRoomField(darkCtx, view, roomField(entry =>
                MapEnvironmentManager.scaleColorAlpha(lightingState.darknessColor, entry.gloom)
            ));

            visibleLights.forEach(light => {
                // A lamp must cut whichever darkness covers it: global night
                // darkness or its own room's daytime gloom.
                const roomGloom = light.roomId ? (roomState.get(light.roomId)?.gloom ?? 0) : 0;
                this.drawRadialLightCutout(darkCtx, light, view, Math.max(darknessFactor, roomGloom));
            });

            this.drawLightShadows(darkCtx, visibleLights, blockers, view, darknessFactor);
        });

        withClip(colorCtx, () => {
            colorCtx.globalCompositeOperation = 'source-over';
            this.drawSunCycleColorBand(colorCtx, view, lightingState);

            this.drawRoomField(colorCtx, view, roomField(entry =>
                MapEnvironmentManager.scaleColorAlpha(entry.room.lighting.fillColor, entry.colorAlpha)
            ));

            // Sunset/sunrise pours warm light through exterior windows.
            const windowConfig = lightingConfig.window || {};
            const glowStrength = Number(windowConfig.glowStrength ?? 0);
            if (glowStrength > 0 && lightingState.bandStrength > 0.01) {
                this.drawRoomField(colorCtx, view, roomField(entry =>
                    MapEnvironmentManager.scaleColorAlpha(
                        windowConfig.glowColor || 'rgba(255, 176, 112, 1)',
                        entry.windowDaylight * lightingState.bandStrength * glowStrength
                    )
                ));
            }
        });

        const ditherConfig = lightingConfig.dither || {};
        if (ditherConfig.enabled && this.gameMap?.getLightingDitherEnabledSetting?.() !== false &&
            Number(ditherConfig.pixelSize) >= 1) {
            // Scale pixel size with zoom so the dither pattern has consistent game-world size.
            const effectivePixelSize = Math.max(1, Math.round(
                Number(ditherConfig.pixelSize) * view.zoom
            ));
            this.drawDitherPass(
                darkCtx,
                this.lightingDarknessCanvas,
                effectivePixelSize,
                Number(ditherConfig.levels) || 4
            );
        }

        // Last, so nothing drawn above can paint back outside the artwork.
        this.applyMapArtMask(darkCtx, view);
        this.applyMapArtMask(colorCtx, view);

        const hasVisibleEffect = darknessOpacity > 0.01 ||
            lightingState.bandStrength > 0.01 ||
            Array.from(roomState.values()).some(entry => entry.lift > 0.01 || (entry.gloom ?? 0) > 0.01);
        this.lightingOverlay.style.opacity = hasVisibleEffect ? '1' : '0';
    }

    drawDitherPass(ctx, canvas, pixelSize, levels = 4) {
        if (canvas.width <= 0 || canvas.height <= 0) {
            return;
        }

        const ps = Math.max(1, Math.round(pixelSize));
        const levelCount = Math.max(1, Math.round(levels));
        const w = canvas.width;
        const h = canvas.height;

        const imageData = ctx.getImageData(0, 0, w, h);
        const px = imageData.data;

        // Bayer 4×4 ordered dither matrix
        const B = [
             0, 128,  32, 160,
            192,  64, 224,  96,
             48, 176,  16, 144,
            240, 112, 208,  80
        ];

        for (let y = 0; y < h; y++) {
            const row = (Math.floor(y / ps) & 3) << 2;
            for (let x = 0; x < w; x++) {
                const i = (y * w + x) << 2;
                const a = px[i + 3];
                if (a === 0) continue;
                const col = Math.floor(x / ps) & 3;
                const quantized = (a / 255) * levelCount;
                const base = Math.floor(quantized);
                const fraction = quantized - base;
                const stepped = fraction * 255 > B[row | col] ? base + 1 : base;
                px[i + 3] = Math.round((Math.min(levelCount, stepped) / levelCount) * 255);
            }
        }

        ctx.putImageData(imageData, 0, 0);
    }

    drawAmbientDarkness(ctx, view, lightingState, darknessColor) {
        ctx.globalCompositeOperation = 'source-over';

        if (!lightingState || !darknessColor) {
            return;
        }

        const mode = lightingState.cycleMode;
        if (mode !== 'sunrise' && mode !== 'sunset') {
            ctx.fillStyle = MapEnvironmentManager.toRgbaString(darknessColor);
            ctx.fillRect(0, 0, view.viewportWidth, view.viewportHeight);
            return;
        }

        const bandMetrics = this.getSunBandMetrics(view, lightingState);
        ctx.fillStyle = MapEnvironmentManager.toRgbaString(darknessColor);
        ctx.fillRect(0, 0, view.viewportWidth, view.viewportHeight);

        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        const gradient = ctx.createLinearGradient(bandMetrics.left, 0, bandMetrics.right, 0);
        // Left = night side (keep darkness). Right = day side (erase darkness).
        // Works for both sunset (left→right sweep) and sunrise (right→left sweep) because the
        // preset startX/endX encode the travel direction — the clamped gradient end always
        // corresponds to the correct state when the band is fully off-screen.
        gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
        gradient.addColorStop(0.3, 'rgba(0, 0, 0, 0.06)');
        gradient.addColorStop(0.52, 'rgba(0, 0, 0, 0.28)');
        gradient.addColorStop(0.7, 'rgba(0, 0, 0, 0.66)');
        gradient.addColorStop(0.85, 'rgba(0, 0, 0, 0.92)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 1)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, view.viewportWidth, view.viewportHeight);

        ctx.restore();
    }

    drawSunCycleColorBand(ctx, view, lightingState) {
        if (!this.isAtmosphereOverlayEnabled()) {
            return;
        }

        const bandConfig = lightingState?.bandConfig || null;
        const bandStrength = Utility.clamp(Number(lightingState?.bandStrength ?? 0), 0, 1);
        if (!bandConfig || bandStrength <= 0.001) {
            return;
        }

        const stops = Array.isArray(bandConfig.stops) ? bandConfig.stops : [];
        if (stops.length === 0) {
            return;
        }

        const bandMetrics = this.getSunBandMetrics(view, lightingState);
        const opacityScale = Utility.clamp(Number(bandConfig.bandOpacity ?? 1) * bandStrength, 0, 1);
        const gradient = ctx.createLinearGradient(bandMetrics.left, 0, bandMetrics.right, 0);

        stops.forEach(stop => {
            const color = MapEnvironmentManager.parseColor(stop.color || 'rgba(0, 0, 0, 0)');
            color[3] = Utility.clamp(color[3] * opacityScale, 0, 1);
            gradient.addColorStop(
                Utility.clamp(Number(stop.position ?? 0), 0, 1),
                MapEnvironmentManager.toRgbaString(color)
            );
        });

        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, view.viewportWidth, view.viewportHeight);
        ctx.restore();
    }

    getSunBandMetrics(view, lightingState) {
        const bandConfig = lightingState?.bandConfig || {};
        const progress = Utility.clamp(Number(lightingState?.positionProgress ?? 0), 0, 1);
        const centerXRatio = Utility.lerp(
            Number(bandConfig.startX ?? 0.5),
            Number(bandConfig.endX ?? 0.5),
            progress
        );
        const span = Utility.lerp(
            Math.max(0.25, Number(bandConfig.startSpan ?? bandConfig.span ?? 0.8)),
            Math.max(0.25, Number(bandConfig.endSpan ?? bandConfig.span ?? 0.8)),
            progress
        );
        const centerX = centerXRatio * view.viewportWidth;
        const halfWidth = Math.max(220, view.viewportWidth * span * 0.6);

        return {
            centerX,
            halfWidth,
            left: centerX - halfWidth,
            right: centerX + halfWidth
        };
    }

    drawRadialLightCutout(ctx, light, view, darknessFactor) {
        const screenPoint = this.worldToScreenPoint(light.center.x, light.center.y, view);
        const radius = Math.max(6, light.config.radius * view.zoom);
        const alpha = Utility.clamp(light.config.intensity * darknessFactor, 0, 1);
        const gradient = ctx.createRadialGradient(screenPoint.x, screenPoint.y, 0, screenPoint.x, screenPoint.y, radius);
        gradient.addColorStop(0, `rgba(0, 0, 0, ${alpha})`);
        gradient.addColorStop(0.55, `rgba(0, 0, 0, ${alpha * 0.65})`);
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(screenPoint.x, screenPoint.y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    drawLightShadows(ctx, visibleLights, blockers, view, darknessFactor) {
        const heroLightLimit = Math.max(0, Number(this.config?.lighting?.heroLightLimit ?? 3));
        const shadowStrength = Utility.clamp(Number(this.config?.lighting?.shadowStrength ?? 0.32) * darknessFactor, 0, 1);
        if (shadowStrength <= 0.01 || heroLightLimit === 0 || blockers.length === 0) {
            return;
        }

        const darknessBase = MapEnvironmentManager.parseColor(this.config?.lighting?.darknessColor || 'rgba(18, 18, 28, 1)');
        darknessBase[3] = shadowStrength;
        const shadowColor = MapEnvironmentManager.toRgbaString(darknessBase);
        const heroLights = visibleLights.filter(light => light.config.castsShadows === true).slice(0, heroLightLimit);

        heroLights.forEach(light => {
            const lightScreen = this.worldToScreenPoint(light.center.x, light.center.y, view);
            const lightRadius = Math.max(1, light.config.radius * view.zoom);
            blockers.forEach(blocker => {
                const blockerCenterX = blocker.left + (blocker.width / 2);
                const blockerCenterY = blocker.top + (blocker.height / 2);
                const dx = blockerCenterX - light.center.x;
                const dy = blockerCenterY - light.center.y;
                const distance = Math.hypot(dx, dy);
                if (distance > light.config.radius + Math.max(blocker.width, blocker.height)) {
                    return;
                }

                const shadowEdge = this.getShadowEdgeForBlocker(blocker, light.center);
                if (!shadowEdge) {
                    return;
                }

                const p1 = this.worldToScreenPoint(shadowEdge.p1.x, shadowEdge.p1.y, view);
                const p2 = this.worldToScreenPoint(shadowEdge.p2.x, shadowEdge.p2.y, view);
                const extrudeDistance = lightRadius * 3.2;
                const v1 = this.normalizeVector(p1.x - lightScreen.x, p1.y - lightScreen.y);
                const v2 = this.normalizeVector(p2.x - lightScreen.x, p2.y - lightScreen.y);
                const e1 = { x: p1.x + (v1.x * extrudeDistance), y: p1.y + (v1.y * extrudeDistance) };
                const e2 = { x: p2.x + (v2.x * extrudeDistance), y: p2.y + (v2.y * extrudeDistance) };

                ctx.save();
                ctx.globalCompositeOperation = 'source-over';
                ctx.fillStyle = shadowColor;
                ctx.beginPath();
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.lineTo(e2.x, e2.y);
                ctx.lineTo(e1.x, e1.y);
                ctx.closePath();
                ctx.fill();
                ctx.restore();
            });
        });
    }

    getShadowEdgeForBlocker(blocker, lightCenter) {
        const centerX = blocker.left + (blocker.width / 2);
        const centerY = blocker.top + (blocker.height / 2);
        const dx = centerX - lightCenter.x;
        const dy = centerY - lightCenter.y;

        if (Math.abs(dx) >= Math.abs(dy)) {
            if (dx >= 0) {
                return {
                    p1: { x: blocker.right, y: blocker.top },
                    p2: { x: blocker.right, y: blocker.bottom }
                };
            }

            return {
                p1: { x: blocker.left, y: blocker.top },
                p2: { x: blocker.left, y: blocker.bottom }
            };
        }

        if (dy >= 0) {
            return {
                p1: { x: blocker.left, y: blocker.bottom },
                p2: { x: blocker.right, y: blocker.bottom }
            };
        }

        return {
            p1: { x: blocker.left, y: blocker.top },
            p2: { x: blocker.right, y: blocker.top }
        };
    }

    normalizeVector(x, y) {
        const length = Math.max(0.0001, Math.hypot(x, y));
        return {
            x: x / length,
            y: y / length
        };
    }

    dispose() {
        this._subscriptions.forEach(subscription => {
            this.timeManager?.unsubscribe?.(subscription.eventName, subscription.callback);
        });
        this._subscriptions = [];

        this._wallEventUnsubscribers.forEach(unsubscribe => unsubscribe());
        this._wallEventUnsubscribers = [];
        this._windowDaylightByRoom = new Map();
        this._windowSpillOpenings = [];

        window.removeEventListener('resize', this._boundResize);

        this.lightingOverlay?.remove();
        this.lightingOverlay = null;
        this.lightingColorCanvas = null;
        this.lightingDarknessCanvas = null;
        this.lightingColorContext = null;
        this.lightingDarknessContext = null;
        this._lightingBounds = null;

        this.fillElement?.remove?.();
        this.gradientElement?.remove?.();
        this.vignetteElement?.remove?.();
        this.frontRoot?.remove?.();
        this.backRoot?.remove?.();
        this.frontLayer = null;
        this.backLayer = null;
        this.frontRoot = null;
        this.backRoot = null;
        this.fillElement = null;
        this.gradientElement = null;
        this.vignetteElement = null;

        this.roomVolumes = [];
        this.lightOpenings = [];
        this.config = null;
        this.mapData = null;
        this._isInitialized = false;
    }
}
