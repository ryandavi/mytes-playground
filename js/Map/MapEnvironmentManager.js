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
                    : MapEnvironmentManager.deepClone(MapEnvironmentManager.EMPTY_PRESET_DATA);
                return MapEnvironmentManager._presetData;
            })
            .catch(error => {
                console.warn('[MapEnvironmentManager] Failed to load environment presets JSON:', error);
                MapEnvironmentManager._presetData = MapEnvironmentManager.deepClone(MapEnvironmentManager.EMPTY_PRESET_DATA);
                return MapEnvironmentManager._presetData;
            })
            .finally(() => {
                MapEnvironmentManager._presetPromise = null;
            });

        return MapEnvironmentManager._presetPromise;
    }

    static deepClone(value) {
        return Utility.deepClone(value);
    }

    static deepMerge(base, extra) {
        if (!extra || typeof extra !== 'object' || Array.isArray(extra)) {
            return extra !== undefined ? extra : base;
        }

        const merged = MapEnvironmentManager.deepClone(base || {});
        Object.entries(extra).forEach(([key, value]) => {
            if (Array.isArray(value)) {
                merged[key] = value.map(entry => MapEnvironmentManager.deepClone(entry));
                return;
            }

            if (value && typeof value === 'object') {
                merged[key] = MapEnvironmentManager.deepMerge(merged[key] || {}, value);
                return;
            }

            merged[key] = value;
        });
        return merged;
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
        this._timeData = this.getTimeData();
        this.currentAtmosphere = this.resolveAtmosphereState(this._timeData);
        this.targetAtmosphere = MapEnvironmentManager.deepClone(this.currentAtmosphere);
        this.atmosphereFrom = MapEnvironmentManager.deepClone(this.currentAtmosphere);
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
        const containerRect = this.getElementRect(root);
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

        return MapEnvironmentManager.deepMerge(
            MapEnvironmentManager.deepClone(basePreset),
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

        const location = String(this.mapData?.environment?.location || '').toLowerCase();
        if (location !== 'interior' && location !== 'inside' && location !== 'house') {
            return [];
        }

        const zones = Array.from(this.gameMap?.zoneManager?.zones?.values?.() || []);
        const roomLikeZones = zones.filter(zone => ['rest', 'play', 'food', 'social'].includes(zone?.type));
        return roomLikeZones.map(zone => this.normalizeRoomVolume({
            id: zone.id,
            displayName: zone.displayName,
            bounds: zone.bounds,
            properties: zone.properties
        }, roomDefaults)).filter(Boolean);
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
            lighting: {
                ambientFloor: Number(props.ambientFloor ?? props.roomAmbientFloor ?? defaults.ambientFloor ?? 0.18),
                ambientCeiling: Number(props.ambientCeiling ?? props.roomAmbientCeiling ?? defaults.ambientCeiling ?? 0.72),
                fillColor: props.fillColor || defaults.fillColor || 'rgba(255, 221, 172, 0.26)',
                shadowColor: props.shadowColor || this.config?.lighting?.darknessColor || 'rgba(18, 18, 28, 1)',
                feather: Number(props.feather ?? props.roomFeather ?? defaults.feather ?? 36),
                mode: String(props.lightingMode || props.roomLightingMode || defaults.mode || 'mixed').toLowerCase()
            }
        };
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

    isAtmosphereOverlayEnabled() {
        return this.gameMap?.getTimeOfDayOverlayEnabledSetting?.() !== false;
    }

    refreshDisplaySettings() {
        this._atmosphereSignature = '';
        this.renderAtmosphere(true);
    }

    recomputeAtmosphereTarget(immediate = false) {
        const nextState = this.resolveAtmosphereState(this._timeData);
        const transitionMs = Math.max(0, Number(nextState.transitionMs || this.config?.atmosphere?.defaultTransitionMs || 0));

        if (immediate || !this.currentAtmosphere) {
            this.currentAtmosphere = MapEnvironmentManager.deepClone(nextState);
            this.targetAtmosphere = MapEnvironmentManager.deepClone(nextState);
            this.atmosphereFrom = MapEnvironmentManager.deepClone(nextState);
            this.atmosphereTransitionMs = 0;
            this.atmosphereTransitionElapsed = 0;
            this.atmosphereTransitionActive = false;
            this.renderAtmosphere(true);
            this.renderLighting(true);
            return;
        }

        this.atmosphereFrom = MapEnvironmentManager.deepClone(this.currentAtmosphere);
        this.targetAtmosphere = MapEnvironmentManager.deepClone(nextState);
        this.atmosphereTransitionMs = transitionMs;
        this.atmosphereTransitionElapsed = 0;
        this.atmosphereTransitionActive = transitionMs > 0;

        if (!this.atmosphereTransitionActive) {
            this.currentAtmosphere = MapEnvironmentManager.deepClone(nextState);
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

    resolveSunCycleState(timeData = {}, atmosphere = {}) {
        const currentMinutes = this.getMinutesFromTimeData(timeData);
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
            gradientStops: stops.length > 0 ? stops : MapEnvironmentManager.deepClone(toState.gradientStops),
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
            this.currentAtmosphere = this.interpolateAtmosphereState(this.atmosphereFrom, this.targetAtmosphere, progress);
            this.renderAtmosphere();
            if (progress >= 1) {
                this.currentAtmosphere = MapEnvironmentManager.deepClone(this.targetAtmosphere);
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
        const signature = JSON.stringify({
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

        if (!force && signature === this._atmosphereSignature) {
            return;
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
            worldLeft: ((viewportOffsetLeft - overscan) / safeZoom) - cameraX,
            worldTop: ((viewportOffsetTop - overscan) / safeZoom) - cameraY,
            worldRight: ((viewportOffsetLeft + viewportWidth + overscan) / safeZoom) - cameraX,
            worldBottom: ((viewportOffsetTop + viewportHeight + overscan) / safeZoom) - cameraY
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
        return {
            x: ((worldX + view.cameraX) * view.zoom) - view.viewportOffsetLeft,
            y: ((worldY + view.cameraY) * view.zoom) - view.viewportOffsetTop
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

    collectVisibleLights(view = this.getViewportMetrics()) {
        const lights = this.collectAllLights()
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

        return objects
            .filter(object => object?.isLightBlocking?.())
            .map(object => object.getLightBlockerGeometry?.())
            .filter(Boolean)
            .filter(geometry => this.intersectsView({
                x: geometry.left,
                y: geometry.top,
                width: geometry.width,
                height: geometry.height
            }, view, 24));
    }

    findRoomContainingPoint(worldX, worldY) {
        return this.roomVolumes.find(room =>
            worldX >= room.bounds.x &&
            worldX <= room.bounds.x + room.bounds.width &&
            worldY >= room.bounds.y &&
            worldY <= room.bounds.y + room.bounds.height
        ) || null;
    }

    deriveRoomLightingState(allLights, darknessFactor) {
        const roomState = new Map();

        this.roomVolumes.forEach(room => {
            const mode = room.lighting.mode || 'mixed';
            const baseFloor = mode === 'local'
                ? 0
                : room.lighting.ambientFloor * darknessFactor;
            roomState.set(room.id, {
                room,
                lift: Utility.clamp(baseFloor, 0, room.lighting.ambientCeiling),
                colorAlpha: Utility.clamp(baseFloor * 0.42, 0, 0.42)
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
        });

        this.lightOpenings.forEach(opening => {
            const roomA = roomState.get(opening.roomA);
            const roomB = roomState.get(opening.roomB);
            if (!roomA || !roomB) {
                return;
            }

            const spill = Utility.clamp(opening.spillFactor, 0, 1);
            const nextA = Utility.clamp(roomA.lift + (roomB.lift * spill), 0, roomA.room.lighting.ambientCeiling);
            const nextB = Utility.clamp(roomB.lift + (roomA.lift * spill), 0, roomB.room.lighting.ambientCeiling);
            roomA.lift = Math.max(roomA.lift, nextA);
            roomB.lift = Math.max(roomB.lift, nextB);
            roomA.colorAlpha = Utility.clamp(Math.max(roomA.colorAlpha, roomB.colorAlpha * spill), 0, 0.52);
            roomB.colorAlpha = Utility.clamp(Math.max(roomB.colorAlpha, roomA.colorAlpha * spill), 0, 0.52);
        });

        return roomState;
    }

    buildLightingSignature(view, lightingState, roomState, visibleLights, blockers) {
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
            rooms: Array.from(roomState.values()).map(entry => [
                entry.room.id,
                Number(entry.lift.toFixed(3)),
                Number(entry.colorAlpha.toFixed(3))
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

        const view = this.getViewportMetrics();
        if (view.viewportWidth <= 0 || view.viewportHeight <= 0) {
            this.lightingOverlay.style.opacity = '0';
            return;
        }

        this.resizeLightingCanvases(view);

        const lightingConfig = this.config?.lighting || {};
        if (lightingConfig.enabled === false) {
            this.clearLightingCanvases(view);
            this.lightingOverlay.style.opacity = '0';
            return;
        }

        const timeData = this.getTimeData();
        const lightingState = this.resolveLightingPeriodState(timeData);
        const darknessFactor = lightingState.darknessFactor;
        const allLights = this.collectAllLights();
        const visibleLights = this.collectVisibleLights(view);
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
        this.drawAmbientDarkness(darkCtx, view, lightingState, darknessColor);

        roomState.forEach(entry => {
            if (entry.lift <= 0.01 || !this.intersectsView(entry.room.bounds, view, 24)) {
                return;
            }
            const screenRect = this.worldToScreenRect(entry.room.bounds, view);
            this.drawFeatheredRectAlpha(
                darkCtx,
                screenRect.x,
                screenRect.y,
                screenRect.width,
                screenRect.height,
                entry.room.lighting.feather,
                Utility.clamp(entry.lift, 0, 1)
            );
        });

        visibleLights.forEach(light => {
            this.drawRadialLightCutout(darkCtx, light, view, darknessFactor);
        });

        this.drawLightShadows(darkCtx, visibleLights, blockers, view, darknessFactor);

        colorCtx.globalCompositeOperation = 'source-over';
        this.drawSunCycleColorBand(colorCtx, view, lightingState);

        roomState.forEach(entry => {
            if (entry.colorAlpha <= 0.01 || !this.intersectsView(entry.room.bounds, view, 24)) {
                return;
            }
            const screenRect = this.worldToScreenRect(entry.room.bounds, view);
            const roomColor = MapEnvironmentManager.scaleColorAlpha(
                entry.room.lighting.fillColor,
                entry.colorAlpha
            );
            this.drawFeatheredRectColor(
                colorCtx,
                screenRect.x,
                screenRect.y,
                screenRect.width,
                screenRect.height,
                entry.room.lighting.feather,
                roomColor
            );
        });

        const ditherConfig = lightingConfig.dither || {};
        if (ditherConfig.enabled && Number(ditherConfig.pixelSize) >= 1) {
            const fillAlpha = Math.round(darknessOpacity * 255);
            // Scale pixel size with zoom so the dither pattern has consistent game-world size.
            const effectivePixelSize = Math.max(1, Math.round(
                Number(ditherConfig.pixelSize) * view.zoom
            ));
            this.drawDitherPass(darkCtx, this.lightingDarknessCanvas, effectivePixelSize, fillAlpha);
        }

        const hasVisibleEffect = darknessOpacity > 0.01 ||
            lightingState.bandStrength > 0.01 ||
            Array.from(roomState.values()).some(entry => entry.lift > 0.01);
        this.lightingOverlay.style.opacity = hasVisibleEffect ? '1' : '0';
    }

    drawDitherPass(ctx, canvas, pixelSize, fillAlpha = 255) {
        if (canvas.width <= 0 || canvas.height <= 0 || fillAlpha < 8) {
            return;
        }

        const ps = Math.max(1, Math.round(pixelSize));
        const w = canvas.width;
        const h = canvas.height;

        // clearMax (65% of fill): below this the area is lit — force to 0 so no smooth gradient
        //   leaks through when zoomed in. Covers light interiors down to ~35% intensity lights.
        // solidMin (fill - 4): at or above this is solid darkness — force to fillAlpha.
        //   Prevents a smooth dark rim from appearing outside the dithered band.
        const clearMax = Math.round(fillAlpha * 0.65);
        const solidMin = Math.max(clearMax + 16, fillAlpha - 4);

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
                if (a <= clearMax) { px[i + 3] = 0; continue; }      // force clear — no smooth halo
                if (a >= solidMin) { px[i + 3] = fillAlpha; continue; } // force solid — no smooth rim
                const col = Math.floor(x / ps) & 3;
                const normalized = Math.round((a - clearMax) / (solidMin - clearMax) * 255);
                px[i + 3] = normalized > B[row | col] ? fillAlpha : 0;
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

    drawFeatheredRectAlpha(ctx, x, y, width, height, feather, alpha) {
        const clampedAlpha = Utility.clamp(alpha, 0, 1);
        if (clampedAlpha <= 0 || width <= 0 || height <= 0) {
            return;
        }

        const f = Math.max(0, Math.min(feather, width / 2, height / 2));
        const innerX = x + f;
        const innerY = y + f;
        const innerWidth = Math.max(0, width - (f * 2));
        const innerHeight = Math.max(0, height - (f * 2));

        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';

        if (innerWidth > 0 && innerHeight > 0) {
            ctx.fillStyle = `rgba(0, 0, 0, ${clampedAlpha})`;
            ctx.fillRect(innerX, innerY, innerWidth, innerHeight);
        }

        if (f > 0) {
            this.drawFeatherBands(ctx, x, y, width, height, f, `rgba(0, 0, 0, ${clampedAlpha})`, true);
        }

        ctx.restore();
    }

    drawFeatheredRectColor(ctx, x, y, width, height, feather, color) {
        if (width <= 0 || height <= 0) {
            return;
        }

        const rgba = MapEnvironmentManager.parseColor(color);
        if (rgba[3] <= 0) {
            return;
        }

        const f = Math.max(0, Math.min(feather, width / 2, height / 2));
        const innerX = x + f;
        const innerY = y + f;
        const innerWidth = Math.max(0, width - (f * 2));
        const innerHeight = Math.max(0, height - (f * 2));

        ctx.save();
        if (innerWidth > 0 && innerHeight > 0) {
            ctx.fillStyle = MapEnvironmentManager.toRgbaString(rgba);
            ctx.fillRect(innerX, innerY, innerWidth, innerHeight);
        }

        if (f > 0) {
            this.drawFeatherBands(ctx, x, y, width, height, f, MapEnvironmentManager.toRgbaString(rgba), false);
        }
        ctx.restore();
    }

    drawFeatherBands(ctx, x, y, width, height, feather, color, destinationOut) {
        const transparent = destinationOut ? 'rgba(0, 0, 0, 0)' : MapEnvironmentManager.toRgbaString([...MapEnvironmentManager.parseColor(color).slice(0, 3), 0]);

        const topGradient = ctx.createLinearGradient(0, y, 0, y + feather);
        topGradient.addColorStop(0, transparent);
        topGradient.addColorStop(1, color);
        ctx.fillStyle = topGradient;
        ctx.fillRect(x + feather, y, Math.max(0, width - (feather * 2)), feather);

        const bottomGradient = ctx.createLinearGradient(0, y + height - feather, 0, y + height);
        bottomGradient.addColorStop(0, color);
        bottomGradient.addColorStop(1, transparent);
        ctx.fillStyle = bottomGradient;
        ctx.fillRect(x + feather, y + height - feather, Math.max(0, width - (feather * 2)), feather);

        const leftGradient = ctx.createLinearGradient(x, 0, x + feather, 0);
        leftGradient.addColorStop(0, transparent);
        leftGradient.addColorStop(1, color);
        ctx.fillStyle = leftGradient;
        ctx.fillRect(x, y + feather, feather, Math.max(0, height - (feather * 2)));

        const rightGradient = ctx.createLinearGradient(x + width - feather, 0, x + width, 0);
        rightGradient.addColorStop(0, color);
        rightGradient.addColorStop(1, transparent);
        ctx.fillStyle = rightGradient;
        ctx.fillRect(x + width - feather, y + feather, feather, Math.max(0, height - (feather * 2)));

        const corners = [
            { cx: x + feather, cy: y + feather, start: Math.PI, end: 1.5 * Math.PI },
            { cx: x + width - feather, cy: y + feather, start: 1.5 * Math.PI, end: 0 },
            { cx: x + feather, cy: y + height - feather, start: 0.5 * Math.PI, end: Math.PI },
            { cx: x + width - feather, cy: y + height - feather, start: 0, end: 0.5 * Math.PI }
        ];

        corners.forEach(corner => {
            const gradient = ctx.createRadialGradient(corner.cx, corner.cy, 0, corner.cx, corner.cy, feather);
            gradient.addColorStop(0, color);
            gradient.addColorStop(1, transparent);
            ctx.beginPath();
            ctx.moveTo(corner.cx, corner.cy);
            ctx.arc(corner.cx, corner.cy, feather, corner.start, corner.end);
            ctx.closePath();
            ctx.fillStyle = gradient;
            ctx.fill();
        });
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
