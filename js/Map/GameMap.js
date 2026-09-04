class GameMap {
    constructor(parent, mapData = null) {
        this.parent = parent;
        this.mapData = mapData || {}; // Default empty object if no data provided

        // Core properties
        this.name = null;
        this.displayName = null;
        this.id = null;
        this.dimensions = null;
        this.renderInsets = { top: 0, right: 0, bottom: 0, left: 0 };
        this.renderDimensions = null;

        // Layer references
        this.layers = {
            background: parent.canvas?.querySelector('.layer.background'),
            groundDecor: parent.canvas?.querySelector('.layer.ground-decor'),
            environmentBack: parent.canvas?.querySelector('.layer.environment-back'),
            objects: parent.canvas?.querySelector('.layer.foreground'),
            environmentFront: parent.canvas?.querySelector('.layer.environment-front'),
            debug: parent.canvas?.querySelector('.layer.debug'),
            particles: parent.canvas?.querySelector('.layer.particles')
        };

        // Systems
        this.zoneManager = null;
        this.gridSystem = null;
        this.particleSystem = null;
        this.environmentManager = null;
        this.buildDocument = null;
        this.buildTransaction = null;
        this.wallBuilder = null;
        this.fenceBuilder = null;
        this.wallMaterialRegistry = null;
        this.floorBuilder = null;
        this.footprintOverlay = null;
        this.floorMaterialRegistry = null;
        this.terrainBuilder = null;
        this.surfaceCustomizer = null;
        this.renderer = new MapRenderer();
        // Handles a missing gridSystem (falls back to registry scans), so safe
        // to construct before the map initializes.
        this.worldQuery = new WorldQuery(parent?.worldRegistry ?? null, this);

        // Map elements
        this.objects = [];
        this.objectsById = new Map();
        this.droppedItems = [];
        // this.zones = new Map();
        this.spawnPoints = new Map();

        // Cache-bust TMX fetches only while debugging — production transitions
        // should reuse the browser cache.
        this.noCache = Utility.isDebugEnabled();

        // Optimization tracking
        this.activeObjectsCount = 0;
        this.updateFrameSkip = 0;

        // Tile map loader
        this.tileMapLoader = null;

        // Flag to track initialization state
        this.initialized = false;
        this.backgroundReadyPromise = Promise.resolve();
        this.generatedObjectUrls = new Set();
    }

    get container() {
        return this.parent;
    }

    get core() {
        return this.parent?.core || null;
    }

    get ui() {
        return this.parent?.ui || null;
    }

    get gameMode() {
        return this.parent?.gameMode || null;
    }

    get buildRules() {
        return this.parent?.buildRules || null;
    }

    get buildHistory() {
        return this.parent?.buildHistory || null;
    }

    get camera() {
        return this.parent?.camera || null;
    }

    get mytes() {
        return this.parent?.mytes || [];
    }

    get activeMyte() {
        return this.parent?.activeMyte || null;
    }

    get inventory() {
        return this.parent?.inventory || null;
    }

    get eventManager() {
        return this.core?.eventManager || null;
    }

    getRenderOffset() {
        return { x: this.renderInsets.left, y: this.renderInsets.top };
    }

    /**
     * Height in px of the reserved strip above the map's top edge — the space
     * where wall art (and later, tall props) is allowed to draw. Lighting and
     * the map-art mask clip to this so night never sits on the empty page
     * beyond it. Reads the applied inset, so it never disagrees with layout.
     */
    resolveRenderTopOverhang() {
        return Math.max(0, Number(this.renderInsets?.top) || 0);
    }

    /**
     * How many cells of blank space to reserve ABOVE the map's top edge, so
     * tall art — walls today, big props later — has somewhere to draw without
     * the world's coordinate origin moving.
     *
     * This is a DELIBERATE, static amount, not a measurement of the tallest
     * object on the map. A giant tree is allowed to clip at the canvas edge;
     * the clipped top still reads as scale. Resolution order:
     *
     *   1. the map's own `cameraTopReserveCells` property (authored in Tiled)
     *   2. a wall's worth of height, if the map can grow walls at all — so
     *      dropping walls onto a map later needs no re-tuning
     *   3. the global top padding (`canvasPaddingCells.top`)
     *
     * It has to be known at map-load time and never change afterwards:
     * `renderInsets.top` also shifts screen<->world conversion, camera follow
     * and the grid overlay, and a value that moved after those had sampled it
     * is what used to put the cursor and the art in different coordinate
     * systems.
     */
    resolveTopReserveCells(mapData = this.mapData) {
        const authored = Number(mapData?.properties?.cameraTopReserveCells);
        if (Number.isFinite(authored) && authored >= 0) return authored;

        const globalTop = Math.max(0, Number(SiteConfig.mapRendering?.canvasPaddingCells?.top) || 0);

        const wallCapable = SiteConfig.wallSystem?.enabled === true &&
            SiteConfig.wallSystem?.extendCanvasForWallHeight === true &&
            !!mapData?.walls;
        if (!wallCapable) return globalTop;

        const wallCells = Number(mapData.properties?.wallHeightCells) ||
            SiteConfig.wallSystem.defaultHeightCells || 0;
        return Math.max(globalTop, wallCells);
    }

    resolveRenderPadding(mapData = this.mapData) {
        const cellSize = this.gridSystem?.config?.cellSize || mapData?.tileHeight || 32;
        const cells = SiteConfig.mapRendering?.canvasPaddingCells || {};
        const topCells = this.resolveTopReserveCells(mapData);
        return Object.fromEntries(['top', 'right', 'bottom', 'left'].map(side => [
            side,
            Math.max(0, Number(side === 'top' ? topCells : cells[side]) || 0) * cellSize
        ]));
    }

    setRenderInsets(insets = {}) {
        this.renderInsets = Object.fromEntries(['top', 'right', 'bottom', 'left'].map(side => [
            side,
            Math.max(0, Number(insets[side]) || 0)
        ]));
        this.renderDimensions = {
            width: this.dimensions.width + this.renderInsets.left + this.renderInsets.right,
            height: this.dimensions.height + this.renderInsets.top + this.renderInsets.bottom
        };
        const canvas = this.parent.canvas;
        for (const [side, value] of Object.entries(this.renderInsets)) {
            canvas.style.setProperty(`--map-render-inset-${side}`, `${value}px`);
        }
        canvas.style.width = `${this.renderDimensions.width}px`;
        canvas.style.height = `${this.renderDimensions.height}px`;
        this.parent.invalidateCanvasRect?.();
    }

    applyRenderInsets(mapData = this.mapData) {
        this.setRenderInsets(this.resolveRenderPadding(mapData));
    }

    /**
     * The top reserve is fixed and authored, so a wall taller than it clips at
     * the canvas edge. That is a legitimate choice, but log it once — in debug
     * — so it is a choice and not a surprise.
     */
    warnIfWallsExceedTopReserve() {
        if (SiteConfig.wallSystem?.extendCanvasForWallHeight !== true) return;
        const cells = [...(this.wallBuilder?.cells?.values?.() || [])];
        if (!cells.length) return;
        const cellSize = this.gridSystem?.config?.cellSize || this.mapData?.tileHeight || 32;
        const registry = this.wallMaterialRegistry;
        // How far the tallest wall's art reaches above row 0 — one on row 0
        // contributes its whole height, one five rows down contributes nothing.
        const tallest = Math.max(0, ...cells.map(cell => {
            const height = Number(registry?.getConstruction?.(cell.constructionId)?.height) ||
                (Math.max(1, Number(cell.heightCells) || SiteConfig.wallSystem.defaultHeightCells) * cellSize);
            return height - ((Number(cell.y) || 0) * cellSize);
        }));
        if (tallest > this.renderInsets.top + 0.5) {
            Utility.warnDebug(
                `[GameMap] Wall art on "${this.id}" reaches ${Math.ceil(tallest)}px above the top edge, ` +
                `but only ${Math.round(this.renderInsets.top)}px is reserved — it will clip. ` +
                `Raise cameraTopReserveCells on this map if that is unwanted.`
            );
        }
    }

    trackGeneratedObjectUrl(url) {
        if (typeof url === 'string' && url.startsWith('blob:')) this.generatedObjectUrls.add(url);
        return url;
    }

    revokeGeneratedObjectUrls() {
        const urls = [...this.generatedObjectUrls];
        this.generatedObjectUrls.clear();
        if (urls.length === 0) return;
        Promise.resolve(this.backgroundReadyPromise)
            .catch(() => {})
            .finally(() => urls.forEach(url => URL.revokeObjectURL(url)));
    }

    get soundManager() {
        return this.core?.soundManager || null;
    }

    getContainerRect() {
        return this.parent?.getContainerRect?.() || {
            left: 0,
            top: 0,
            width: 0,
            height: 0
        };
    }

    getParticleEffectsEnabledSetting() {
        const liveSetting = this.ui?.settingsPanel?.isEffectsEnabled?.();
        if (typeof liveSetting === 'boolean') {
            return liveSetting;
        }

        return this.core?.user?.preferences?.effectsEnabled !== false;
    }

    getTimeOfDayOverlayEnabledSetting() {
        const liveSetting = this.ui?.settingsPanel?.isTimeOfDayOverlayEnabled?.();
        if (typeof liveSetting === 'boolean') {
            return liveSetting;
        }

        return this.core?.user?.preferences?.timeOfDayOverlayEnabled !== false;
    }

    // Interior room lighting only — the global day/night pass rides on
    // getTimeOfDayOverlayEnabledSetting().
    getLightingEnabledSetting() {
        const liveSetting = this.ui?.settingsPanel?.isRoomLightingEnabled?.();
        if (typeof liveSetting === 'boolean') {
            return liveSetting;
        }

        // Opt-in, unlike every other display setting here: an absent or
        // unmigrated preference means off, not on.
        return this.core?.user?.preferences?.lightingEnabled === true;
    }

    getLightingDitherEnabledSetting() {
        const liveSetting = this.ui?.settingsPanel?.isLightingDitherEnabled?.();
        if (typeof liveSetting === 'boolean') {
            return liveSetting;
        }

        return this.core?.user?.preferences?.lightingDitherEnabled !== false;
    }

    getWeatherEffectsEnabledSetting() {
        const liveSetting = this.ui?.settingsPanel?.isWeatherEnabled?.();
        if (typeof liveSetting === 'boolean') {
            return liveSetting;
        }

        return this.core?.user?.preferences?.weatherEffectsEnabled !== false;
    }

    getZIndex(y, height) {
        return this.parent?.getZIndex?.(y, height) ?? 0;
    }

    getDepthZIndex(sortY, priority = 0) {
        return this.parent?.getDepthZIndex?.(sortY, priority) ?? 0;
    }

    getObjectRenderLayer(object) {
        const layerKey = object?.getActiveRenderLayerKey?.() || object?.getRenderLayerKey?.() || 'objects';
        return this.layers[layerKey] || this.layers.objects || this.layers.background || null;
    }

    getMaxDimensions() {
        return this.parent?.getMaxDimensions?.() || this.dimensions || {
            width: 0,
            height: 0
        };
    }

    transitionToMap(mapId, options = {}) {
        return this.parent?.loadMap?.(mapId, options) || null;
    }

    getObjectById(id) {
        if (id === undefined || id === null) return null;
        return this.objectsById.get(String(id)) || null;
    }

    getMyteById(id) {
        if (id === undefined || id === null) return null;
        return this.mytes.find(myte => String(myte.id) === String(id)) || null;
    }

    checkCollision(entityA, entityB) {
        return this.parent?.checkCollision?.(entityA, entityB) ?? false;
    }

    getMapSourcePath(mapId) {
        return mapId.endsWith('.tmx')
            ? `data/maps/${mapId}`
            : `data/maps/${mapId}.tmx`;
    }

    getAuthoredObjectConfigOverrides(type, properties = {}) {
        const overrides = { ...(properties || {}) };
        const typeConfig = MapObjectFactory.getTypeConfig(type);
        if (this.properties?.lockFurniture === true && typeConfig?.storable === true) {
            if (overrides.draggable === undefined) overrides.draggable = false;
            if (overrides.storable === undefined) overrides.storable = false;
        }
        return overrides;
    }

    createMapInitializationError(phase, mapId, attemptedPath, cause) {
        const reason = cause?.message || String(cause || 'Unknown error');
        const error = new Error(`Failed to ${phase} map "${mapId}" from "${attemptedPath}": ${reason}`);
        error.cause = cause;
        return error;
    }


    async initialize(mapId, options = {}) {
        const allowFallback = options.allowFallback === true;
        const mapSourcePath = this.getMapSourcePath(mapId);
        const requestedPath = this.noCache
            ? Utility.preventCache(mapSourcePath)
            : mapSourcePath;

        try {
            Utility.logDebug(`[GameMap] Initializing map: ${mapId}`);

            // Check if the parent and canvas exist
            if (!this.parent) {
                throw new Error('Parent is null or undefined');
            }

            if (!this.parent.canvas) {
                throw new Error('Parent canvas is null or undefined');
            }

            // Initialize particle system first to avoid dependency issues
            Utility.logDebug(`[GameMap] Creating particle system`);
            this.particleSystem = new GameMapParticleSystem(this, {
                effectsEnabled: this.getParticleEffectsEnabledSetting(),
                weatherEnabled: this.getWeatherEffectsEnabledSetting()
            });
            this.particleSystem.start();

            for (const myte of this.mytes || []) {
                if (typeof myte.initParticleEffects === 'function') {
                    myte.initParticleEffects();
                }
            }

            // Initialize tile map loader
            if (!this.tileMapLoader) {
                Utility.logDebug(`[GameMap] Creating new TileMapLoader`);
                this.tileMapLoader = new TileMapLoader(this);
            }

            Utility.logDebug(`[GameMap] Loading TMX from: ${mapSourcePath}`);

            let mapData;
            try {
                mapData = await this.tileMapLoader.loadTileMap(requestedPath);

                if (!mapData) {
                    throw new Error('TMX data is null or undefined');
                }

                Utility.logDebug(`[GameMap] TMX data loaded successfully`);
            } catch (tmxError) {
                throw this.createMapInitializationError('load', mapId, mapSourcePath, tmxError);
            }

            try {
                Utility.logDebug(`[GameMap] Applying TMX data to game map`);
                await this.applyToGameMap(mapData);
                Utility.logDebug(`[GameMap] TMX data applied successfully`);
            } catch (applyError) {
                throw this.createMapInitializationError('initialize', mapId, mapSourcePath, applyError);
            }

            // Reset debug initialization state for GridSystem
            if (this.gridSystem) {
                // Store the current debug mode
                const wasDebugMode = this.gridSystem.debugMode;

                // Reset the initialization flag
                this.gridSystem.debugInitialized = false;

                // If debug mode was on, make sure it gets reinitialized
                if (wasDebugMode) {
                    Utility.logDebug(`[GameMap] Reinitializing GridSystem debug elements`);
                    // Make sure debug mode is off
                    if (this.gridSystem.debugMode) {
                        this.gridSystem.toggleDebug();
                    }

                    // Delay to ensure DOM is ready before reinitializing
                    setTimeout(() => {
                        this.gridSystem.toggleDebug(); // Toggle back on to reinitialize
                    }, 100);
                }
            }

            Utility.logDebug(`[GameMap] Map ${mapId} initialization completed successfully`);
            if (this.gridSystem && document.body.classList.contains('debug') && !this.gridSystem.debugMode) {
                this.gridSystem.toggleDebug();
            }
            this.initialized = true;
            return true;
        } catch (error) {
            this.initialized = false;

            if (allowFallback) {
                try {
                    Utility.warnDebug(`[GameMap] Falling back to default map for initial load of ${mapId}`, error);
                    this.createDefaultMap(mapId);
                    this.initialized = true;
                    return true;
                } catch (fallbackError) {
                    throw this.createMapInitializationError('create fallback', mapId, mapSourcePath, fallbackError);
                }
            }

            throw error;
        }
    }




	async applyToGameMap(mapData) {
		if (!mapData) return;

		// Set dimensions
		this.dimensions = mapData.dimensions;
		this.name = mapData.name;
		this.id = mapData.id;
		this.sourcePath = mapData.sourcePath || null;
		this.displayName = mapData.displayName;
		this.description = mapData.description;
		this.location = mapData.environment.location;
		this.properties = { ...(mapData.properties || {}) };

		this.gridSystem = new GridSystem(this);
		// One geometry store for every area concept: zones, authored rooms, and
		// runtime wall enclosures. Must exist before ZoneManager, which registers
		// each zone's geometry into it.
		this.regionManager = new RegionManager(this, {
			cellSize: this.gridSystem?.config?.cellSize ?? 32
		});
		this.zoneManager = new ZoneManager(this);

		Utility.logDebug('Tile map dimensions:', this.dimensions);

		// Reserve render space above the map for tall art (walls, big props)
		// without moving gameplay coordinates. Fixed and applied once here, so
		// every screen<->world consumer sees the final value from frame one.
		this.applyRenderInsets(mapData);

		// Set background from map
		const bgUrl = await this.tileMapLoader.createMapBackgroundUrl(mapData);
		if (bgUrl) {
			this.trackGeneratedObjectUrl(bgUrl);
			this.setBackground({
				url: bgUrl,
				color: mapData.background?.color || '#f0f0f0'
			});
		} else if (mapData.background) {
			this.setBackground(mapData.background);
		}

		// Generate grid data for the GridSystem
		const gridData = this.tileMapLoader.generateGridData(mapData, {
			cellSize: this.gridSystem?.config?.cellSize || 32,
			collisionLayer: 'Collider'
		});

		// Update the grid system
		if (this.gridSystem) {
			this.gridSystem.updateFromTileGrid(gridData);
		}

		// Add zones
		if (mapData.zones) {
			for (const zoneData of mapData.zones) {
				this.zoneManager.addZone(zoneData);
			}
		}

		// Set spawn points
		if (mapData.spawns) {
			Object.entries(mapData.spawns).forEach(([key, value]) => {
				this.spawnPoints.set(key, value);
			});
		}

        // Add objects
		if (mapData.objects) {
			for (const objData of mapData.objects) {
				const type = objData.type.toUpperCase();
				const typeConfig = MapObjectFactory.getTypeConfig(type);
				const configOverrides = this.getAuthoredObjectConfigOverrides(type, objData.properties);

				// Bottom-align: if the tile placeholder in the map is shorter than the
				// object's JSON-defined height, shift Y up so the bottoms coincide.
				let posY = objData.y;
				if (objData.tileHeight > 0) {
					const jsonHeight = typeConfig?.size?.height;
					if (jsonHeight && jsonHeight !== objData.tileHeight) {
						posY = objData.y + objData.tileHeight - jsonHeight;
					}
				}

				this.addObject(type, objData.variant, objData.x, posY, {
					configOverrides,
					id: objData.id
				});
			}
		}

		// Apply terrain data to pathfinding after objects have been added
		this.applyTerrainToGameMap(mapData);

        this.layers.environmentBack = this.parent.canvas?.querySelector('.layer.environment-back');
        this.layers.environmentFront = this.parent.canvas?.querySelector('.layer.environment-front');
        if (typeof MapEnvironmentManager === 'function') {
            this.environmentManager?.dispose?.();
            this.environmentManager = new MapEnvironmentManager(this);
            await this.environmentManager.initialize(mapData);
        }

		// Terrain before walls: the ground a wall stands on is drawn under it,
		// and the paint tool's grid sync must not be undone by wall cells that
		// have not been laid yet.
		if (SiteConfig.terrainSystem?.enabled === true && mapData.terrain) {
			this.terrainBuilder = new TerrainBuilder(this, mapData.terrain);
			await this.terrainBuilder.build();
			this.eventManager?.emit(EVENTS.TERRAIN_READY, { mapId: this.id, builder: this.terrainBuilder });
		}

		if (SiteConfig.wallSystem?.enabled === true && mapData.walls) {
			this.wallMaterialRegistry = new WallMaterialRegistry(this.core?.resourceManager || null);
			await this.wallMaterialRegistry.load();
			this.buildDocument = BuildDocument.fromMapData(mapData);
			this.wallBuilder = new WallBuilder(this, mapData.walls, this.wallMaterialRegistry);
			this.wallBuilder.baseCells = this.buildDocument.level().walls.records;
			this.wallBuilder.openings = this.buildDocument.level().openings.values();
			this.wallBuilder.fixtures = this.buildDocument.level().fixtures.values();
			this.wallBuilder.normalizeOpeningFootprints();
			this.wallBuilder.pruneOrphanedRecords();
			this.buildDocument.level().openings.replace(this.wallBuilder.openings);
			this.buildDocument.level().fixtures.replace(this.wallBuilder.fixtures);
			if (SiteConfig.floorSystem?.enabled === true) {
				try {
					this.floorMaterialRegistry = new FloorMaterialRegistry(this.parent?.resourceManager ?? null);
					await this.floorMaterialRegistry.load();
					this.floorBuilder = new FloorRenderer(this, this.floorMaterialRegistry);
				} catch (error) {
					Utility.logDebug('Floor system unavailable:', error);
					this.floorBuilder = null;
				}
			}
			this.buildTransaction = new BuildTransaction({
				document: this.buildDocument,
				width: this.gridSystem.gridWidth,
				height: this.gridSystem.gridHeight,
				reachBlocks: this.floorBuilder?.bleedBlocks?.() ?? 1,
				cellSize: this.gridSystem.config.cellSize,
				geometryOptions: {
					cellSize: this.gridSystem.config.cellSize,
					constructions: this.wallMaterialRegistry.constructions
				},
				regionManager: this.regionManager,
				eventManager: this.eventManager,
				history: this.buildHistory,
				renderers: { walls: this.wallBuilder, floors: this.floorBuilder },
				onCommit: event => this.handleBuildCommit(event)
			});
			this.footprintOverlay = new BuildFootprintOverlay(this);
			this.buildTransaction.initialize();
			await this.wallBuilder.initialize();
			// The reserve is fixed, not remeasured here — a value that changed
			// after the camera and input had sampled it was the old coordinate
			// drift. Just flag it in debug if real wall art won't fit.
			this.warnIfWallsExceedTopReserve();
		}
		this.eventManager?.emit(EVENTS.WALL_READY, { mapId: this.id, builder: this.wallBuilder });

		// Fences are ordinary map objects, so the builder is a thin helper the
		// Fence tool drives — available wherever the FENCE type is registered.
		if (typeof FenceBuilder === 'function' && MapObjectFactory.hasType?.('FENCE')) {
			this.fenceBuilder = new FenceBuilder(this);
		}

		// Floors are built after rooms exist (the environment manager registers
		// them) and after walls, so a room's floor lands under the wall art that
		// borders it. A room with no floorFinishId is skipped entirely, leaving
		// the map's own authored tile layers untouched.
		if (this.floorBuilder) {
			this.floorBuilder.setOwnershipGrid(this.buildTransaction.cache.grid);
			this.floorBuilder.build();
			this.eventManager?.emit(EVENTS.FLOOR_READY, { mapId: this.id, builder: this.floorBuilder });
		}
		if (this.wallBuilder || this.floorBuilder) {
			this.surfaceCustomizer = new SurfaceCustomizer(this);
		}

        // Rooms exist by now (the environment manager registers them), and objects
        // are placed, so door topology can be derived.
        this.buildDoorRoomTopology();

		// Notify the sound system of this map's audio context and begin proximity polling
		const sm = this.soundManager;
		if (sm) {
			sm.setMapContext({
				location:        mapData.environment.location,
				ambientOverride: mapData.environment.ambientOverride ?? null,
				musicOverride:   mapData.environment.musicOverride   ?? null
			});
			this._startProximitySoundPolling();
		}
	}

	handleBuildCommit(event) {
		// Ownership is exactly what this overlay draws, so it has to redraw
		// whenever ownership can have moved — which is every commit.
		this.footprintOverlay?.render();
		for (const myte of this.mytes || []) {
			this.regionManager?.updateMembership(myte, { layers: ['room'], force: true });
		}
		this.buildDoorRoomTopology();
		this.environmentManager?.rebuildWindowLighting();
		if (this.environmentManager) {
			this.environmentManager._lightingSignature = '';
			this.environmentManager.renderLighting(true);
		}
	}

	// ── Proximity sound polling ────────────────────────────────────────────────

	_startProximitySoundPolling() {
		this._stopProximitySoundPolling();
		this._proximitySoundInterval = setInterval(() => this._updateProximitySounds(), 500);
	}

	_stopProximitySoundPolling() {
		if (this._proximitySoundInterval != null) {
			clearInterval(this._proximitySoundInterval);
			this._proximitySoundInterval = null;
		}
	}

	_updateProximitySounds() {
		const sm = this.soundManager;
		const listener = sm?.getMapAudioListener?.();
		if (!sm || !listener) return;

		// Map<soundId, volumeMultiplier 0–1> — zones give full 1.0, tiles scale by distance
		const sounds = new Map();

		// The visible map center is the listener for both free camera and character follow.
		// Water zones take priority — they declare lake vs river explicitly and play at full volume.
		if (this.zoneManager) {
			for (const zone of this.zoneManager.getZonesOfType(ZONE_TYPES.WATER_LAKE)) {
				if (zone.region?.contains(listener.x, listener.y)) { sounds.set('env_water_lake', 1.0); break; }
			}
			for (const zone of this.zoneManager.getZonesOfType(ZONE_TYPES.WATER_RIVER)) {
				if (zone.region?.contains(listener.x, listener.y)) { sounds.set('env_water_river', 1.0); break; }
			}
		}

		// Fall back to tile scan — volume scales with proximity (louder as you get closer)
		if (sounds.size === 0 && this.gridSystem) {
			const vol = this._getWaterTileProximity(
				listener.x,
				listener.y,
				SiteConfig.audio.waterProximityRadius
			);
			if (vol > 0) sounds.set('env_water_lake', vol);
		}

		sm.setProximitySounds(sounds);
	}

	/**
	 * Derive which rooms each DOOR/GATE connects, at map load.
	 *
	 * A door sits *in* a wall, so its own centre usually lies in neither room. The
	 * rooms it joins are found by probing outward along both axes from the door's
	 * centre — whichever rooms those probes land in are the ones it connects.
	 *
	 * Doors already toggle grid walkability; this only annotates the topology, so
	 * nothing about movement or collision changes. Stored on the region
	 * (`properties.doors` / `adjacentRooms`) and on the door object (`connectsRooms`).
	 */
	buildDoorRoomTopology() {
		const regionManager = this.regionManager;
		if (!regionManager) return;

		const rooms = regionManager.all('room');
		for (const room of rooms) {
			room.properties.doors = [];
			room.properties.adjacentRooms = [];
		}
		if (rooms.length === 0) return;

		const cellSize = this.gridSystem?.config?.cellSize ?? 32;
		const doors = this.objects.filter(obj => ['DOOR', 'GATE'].includes(obj.type));

		for (const door of doors) {
			const rect = door.getRegionRect?.('collider') ?? {
				x: door.posX, y: door.posY,
				width: door.size?.width ?? 0, height: door.size?.height ?? 0
			};
			const cx = rect.x + (rect.width / 2);
			const cy = rect.y + (rect.height / 2);

			// Probe far enough to clear the wall the door is set into.
			const reach = cellSize * 1.5;
			const probes = [
				{ x: cx, y: cy - reach }, { x: cx, y: cy + reach },
				{ x: cx - reach, y: cy }, { x: cx + reach, y: cy }
			];

			const connected = new Set();
			for (const probe of probes) {
				for (const room of regionManager.regionsAt(probe.x, probe.y, 'room')) {
					connected.add(room);
				}
			}

			const connectedRooms = [...connected];
			door.connectsRooms = connectedRooms.map(room => room.id);

			for (const room of connectedRooms) {
				room.properties.doors.push(door.id);
				for (const other of connectedRooms) {
					if (other !== room && !room.properties.adjacentRooms.includes(other.id)) {
						room.properties.adjacentRooms.push(other.id);
					}
				}
			}
		}
	}

	// Returns the ground-center position of a myte's collider — the best single point
	// for terrain queries (center-X, bottom-Y of the collider, matching actual feet).
	_myteGroundPos(myte) {
		const ox = myte.collider?.offsetX ?? 0;
		const oy = myte.collider?.offsetY ?? 0;
		const cw = myte.collider?.width  ?? myte.size?.width  ?? 0;
		const ch = myte.collider?.height ?? myte.size?.height ?? 0;
		return {
			x: myte.posX + ox + cw / 2,
			y: myte.posY + oy + ch
		};
	}

	// Returns 0 (out of range) to 1 (on top of water) based on closest water tile distance.
	// Uses a linear falloff over the given radius so the sound fades as you walk away.
	_getWaterTileProximity(worldX, worldY, radius) {
		const gs = this.gridSystem;
		if (!gs?.grid) return 0;
		const cs  = gs.config.cellSize;
		const cx  = Math.floor(worldX / cs);
		const cy  = Math.floor(worldY / cs);
		const gr  = Math.ceil(radius / cs);
		const x0  = Math.max(0, cx - gr);
		const x1  = Math.min(gs.gridWidth  - 1, cx + gr);
		const y0  = Math.max(0, cy - gr);
		const y1  = Math.min(gs.gridHeight - 1, cy + gr);
		let closestSq = Infinity;
		for (let gx = x0; gx <= x1; gx++) {
			for (let gy = y0; gy <= y1; gy++) {
				const t = gs.grid[gx]?.[gy]?.terrainType;
				if (t === 'shallow_water' || t === 'deep_water') {
					const dx = (gx - cx) * cs;
					const dy = (gy - cy) * cs;
					const dSq = dx * dx + dy * dy;
					if (dSq < closestSq) closestSq = dSq;
				}
			}
		}
		if (closestSq === Infinity) return 0;
		return Math.max(0, 1 - Math.sqrt(closestSq) / radius);
	}




	applyObjectTerrainModifiers() {
		if (!this.gridSystem) return;

		this.objects.forEach(obj => {
			if (!obj.type) return;
			const terrainType = this.tileMapLoader.terrainModifiers[obj.type.toUpperCase()];
			if (!terrainType) return;

			const cells = this.gridSystem.getObjectCellsForArea(obj.posX, obj.posY, obj.size.width, obj.size.height);
			for (const cell of cells) {
				if (!cell.originalTerrainType) cell.originalTerrainType = cell.terrainType;
				cell.terrainType = terrainType;
				cell.terrainModifier = obj;
			}

			obj.terrainType = terrainType;
		});
	}

	applyTerrainToGameMap(mapData) {
		// Apply terrain data to grid system if it exists
		if (this.gridSystem && this.gridSystem.pathfinder) {
			Utility.logDebug("[TileMapLoader] Applying terrain types to pathfinder");
	
			// Get terrain costs from the pathfinder or use our local copy
			let customTerrainCosts = {};
			
			// Start with our default costs
			Object.assign(customTerrainCosts, GridSystem.terrainCosts);
	
			// Check for custom terrain costs in map properties
			if (mapData.properties) {
				Object.keys(mapData.properties).forEach(key => {
					if (key.startsWith('terrain_cost_')) {
						const terrainType = key.replace('terrain_cost_', '');
						const cost = parseFloat(mapData.properties[key]);
						if (!isNaN(cost)) {
							customTerrainCosts[terrainType] = cost;
						}
					}
				});
			}
	
			// Process objects that modify terrain
			this.applyObjectTerrainModifiers();
			
            this.gridSystem.pathfinder.setTerrainCosts(customTerrainCosts);

            const pathfinderOptions = this.gridSystem.pathfinder.options;
            if (mapData.properties.pathfinderPreferPaths !== undefined) {
                pathfinderOptions.preferPaths = !!mapData.properties.pathfinderPreferPaths;
            }
            if (mapData.properties.pathfinderAvoidDifficultTerrain !== undefined) {
                pathfinderOptions.avoidDifficultTerrain = !!mapData.properties.pathfinderAvoidDifficultTerrain;
            }
            if (mapData.properties.pathfinderAllowDiagonals !== undefined) {
                pathfinderOptions.allowDiagonals = !!mapData.properties.pathfinderAllowDiagonals;
            }
            if (mapData.properties.pathfinderVisualizeSearch !== undefined) {
                pathfinderOptions.visualizeSearch = !!mapData.properties.pathfinderVisualizeSearch;
            }
            if (mapData.properties.pathfinderVisualizeRejectedNodes !== undefined) {
                pathfinderOptions.visualizeRejectedNodes = !!mapData.properties.pathfinderVisualizeRejectedNodes;
            }
            if (mapData.properties.pathfinderMaxVisualizedNodes !== undefined) {
                const maxNodes = Number(mapData.properties.pathfinderMaxVisualizedNodes);
                if (Number.isFinite(maxNodes) && maxNodes > 0) {
                    pathfinderOptions.maxVisualizedNodes = maxNodes;
                }
            }
            if (mapData.properties.pathfinderPathEdgePenaltyFactor !== undefined) {
                const edgePenalty = Number(mapData.properties.pathfinderPathEdgePenaltyFactor);
                if (Number.isFinite(edgePenalty)) {
                    pathfinderOptions.pathEdgePenaltyFactor = edgePenalty;
                }
            }
		}
	}



    // Keep the createDefaultMap method for initial loads
    createDefaultMap(mapId) {
        Utility.logDebug(`[GameMap] Creating default map for ${mapId}`);

        // Set basic properties
        this.name = mapId;
        this.id = mapId;
        this.description = 'Default Map';
        this.location = 'Unknown';

        // Set up dimensions
        this.dimensions = {
            width: 1000,
            height: 1000
        };
        this.applyRenderInsets(this.mapData);

        // Set a background color
        if (this.layers.background) {
            // this.layers.background.style.backgroundColor = '#87CEEB';
        }

        // Add a spawn point
        this.spawnPoints.set('default', { x: 500, y: 500 });
        this.spawnPoints.set('myte', { x: 500, y: 500 });
        this.core?.toastManager?.warning?.(
            'Map failed to load - using empty fallback map',
            'Warning'
        );
    }

    setBackground(background) {
        if (!this.layers.background) return;

        this.backgroundReadyPromise = Promise.resolve();

        if (background.color) {
            // this.layers.background.style.backgroundColor = background.color;
        }

        if (background.url) {
            const bgUrl = background.url;
            this.layers.background.style.backgroundImage = `url(${background.url})`;
            this.layers.background.style.backgroundSize = 'cover';

            this.backgroundReadyPromise = new Promise(resolve => {
                const img = new Image();
                img.onload = () => resolve();
                img.onerror = () => resolve();
                img.src = bgUrl;

                if (typeof img.decode === 'function') {
                    img.decode().then(resolve).catch(() => resolve());
                }
            });
        }
    }

    _waitForAnimationFrame() {
        return new Promise(resolve => requestAnimationFrame(() => resolve()));
    }

    async waitForRevealReady() {
        await Promise.resolve(this.backgroundReadyPromise).catch(() => {});

        const camera = this.parent?.camera || null;

        await this._waitForAnimationFrame();

        if (camera) {
            camera.updateTransform(camera.posX, camera.posY, camera.zoomLevel);
        }

        if (this.gridSystem) {
            if (camera) {
                this.gridSystem.verifyActiveObjects(camera);
                this.gridSystem.updateCulling(camera);
            }

            for (const object of this.gridSystem.activeObjects || []) {
                if (object.update && !object.sleeping) {
                    object.update(0);
                }
            }

            this.renderer.flush(this.gridSystem.activeObjects || []);
        } else {
            for (const object of this.objects) {
                if (object.update) {
                    object.update(0);
                }
            }

            this.renderer.flush(this.objects);
        }

        await this._waitForAnimationFrame();
        await this._waitForAnimationFrame();
    }

    add(object, properties = {}) {
        if (!object) return null;

        // Apply any custom properties
        Object.assign(object, properties);
        if (typeof object.applyRuntimeProperties === 'function') {
            object.applyRuntimeProperties(properties);
        }

        if (!object.parent) {
            object.parent = this;
        }

        if (!object.map) {
            object.map = this;
        }

        if (!object.container) {
            object.container = this.parent;
        }

        if (object.id !== undefined && object.id !== null) {
            this.objectsById.set(String(object.id), object);
        }

        // Add to objects array
        this.objects.push(object);
        this.parent?.worldRegistry?.add(object, 'object');

        // Add to grid system
        if (this.gridSystem) {
            this.gridSystem.addObject(object);
        }

        // Render in the appropriate layer for this object type
        const renderLayer = this.getObjectRenderLayer(object);
        if (renderLayer) {
            object.render(renderLayer, this.parent);
        }

        return object;
    }

    addObject(typeOrObject, variant, x, y, options = {}) {
        if (typeOrObject && typeof typeOrObject === 'object' && variant === undefined) {
            return this.add(typeOrObject);
        }

        try {
            const object = MapObjectFactory.create(typeOrObject, variant, x, y, {
                ...options,
                parent: this
            });

            if (!object) {
                console.error(`Failed to create object of type: ${typeOrObject}, variant: ${variant}`);
                return null;
            }

            // Objects that own their own placement rule — anything mounted on a
            // wall — have already been given the exact position that rule
            // resolved. Snapping that to the cell grid throws away the wall's
            // foot inset and drops the object a cell out, so the placement it
            // was created for no longer validates and the drop is refused.
            const ownsPlacement = typeof object.clampPlacementPosition === 'function';
            if (!ownsPlacement && this.gridSystem && object.getConfig?.('snapToGrid', false) === true) {
                try {
                    const newposition = this.gridSystem.snapToGrid(
                        x, y,
                        object.size.width,
                        object.size.height,
                        this.gridSystem.config.cellSize
                    );

                    object.posX = newposition.x;
                    object.posY = newposition.y;
                } catch (gridError) {
                    Utility.warnDebug(`[GameMap] Error snapping to grid:`, gridError);
                    object.posX = x;
                    object.posY = y;
                }
            }

            return this.add(object, options);
        } catch (error) {
            console.error(`[GameMap] Error in addObject:`, error);
            return null;
        }
    }

    addDroppedItem(type, variant, posX, posY) {
        const item = new DroppedMapItem(this, type, variant, posX, posY);
        if (this.layers.objects && item.element) {
            this.layers.objects.appendChild(item.element);
        }
        this.droppedItems.push(item);
        this.parent?.worldRegistry?.add(item, 'item');
        return item;
    }

    getObjectsInRadius(x, y, radius) {
        // OPTIMIZATION: Use grid system for spatial queries if available
        if (this.gridSystem) {
            const searchArea = {
                x: x - radius,
                y: y - radius,
                width: radius * 2,
                height: radius * 2
            };

            const nearbyObjects = this.gridSystem.getObjectsInArea(
                searchArea.x, searchArea.y,
                searchArea.width, searchArea.height
            );

            // Filter by actual radius (squared compare — no sqrt) and active state
            const radiusSq = radius * radius;
            return nearbyObjects.filter(obj => {
                const dx = obj.posX + obj.size.width / 2 - x;
                const dy = obj.posY + obj.size.height / 2 - y;
                return (dx * dx + dy * dy) <= radiusSq && obj.active;
            });
        }

        // Fallback to direct search if grid system is not available
        const radiusSq = radius * radius;
        return this.objects.filter(obj => {
            const dx = obj.posX + obj.size.width / 2 - x;
            const dy = obj.posY + obj.size.height / 2 - y;
            return (dx * dx + dy * dy) <= radiusSq && obj.active;
        });
    }

    getSpawnPoint(type = 'myte') {
        const spawn = this.spawnPoints.get(type);
        if (Array.isArray(spawn)) {
            // If it's an array of spawn points, choose random one
            return Utility.randomChoice(spawn);
        }
        return spawn || { x: 0, y: 0 };
    }

    getRandomPosition() {
        return {
            x: Math.random() * this.dimensions.width,
            y: Math.random() * this.dimensions.height
        };
    }

    isPositionValid(x, y) {
        // Check boundaries
        if (x < 0 || x > this.dimensions.width ||
            y < 0 || y > this.dimensions.height) {
            return false;
        }

        // OPTIMIZATION: Use grid system for collision check
        if (this.gridSystem) {
            const gridPos = this.gridSystem.worldToGrid(x, y);

            // Check if the grid cell is walkable
            if (gridPos.x >= 0 && gridPos.x < this.gridSystem.gridWidth &&
                gridPos.y >= 0 && gridPos.y < this.gridSystem.gridHeight) {
                return this.gridSystem.grid[gridPos.x][gridPos.y].walkable;
            }
        }

        // Fallback to object-based check
        const nearbyObjects = this.getObjectsInRadius(x, y, 50);
        return !nearbyObjects.some(obj => !obj.config.physics?.walkable);
    }

    removeInactiveObjects() {
        // Find all inactive objects
        const inactiveObjects = this.objects.filter(obj => !obj.active);

        // Remove each from the grid
        if (this.gridSystem) {
            inactiveObjects.forEach(obj => this.gridSystem.removeObject(obj));
        }

        inactiveObjects.forEach(obj => {
            if (obj.id !== undefined && obj.id !== null) {
                this.objectsById.delete(String(obj.id));
            }
            this.parent?.worldRegistry?.remove(obj);
        });

        // Remove from the main array
        this.objects = this.objects.filter(obj => obj.active);
    }

    tickUpdate(tickDelta) {
        for (const object of this.objects) {
            if (!object.tickUpdate) continue;
            // Skip sleeping objects that don't need off-screen simulation (e.g. static props).
            // Autonomous objects (butterflies, guards, balls) return true and always tick.
            if (object.sleeping && !object.shouldSimulateOffScreen?.()) continue;
            object.tickUpdate(tickDelta);
        }

        if (this.particleSystem) {
            this.particleSystem.tickUpdate(tickDelta);
        }
    }

    update(deltaTime) {
        // Build mode freezes what the world does to itself; everything that
        // decides what the player sees carries on.
        const simulate = this.parent?.isSimulationPaused?.() !== true;

        if (this.gridSystem) {
            this.updateFrameSkip = (this.updateFrameSkip + 1) % 15;

            // Full consistency check several times per second so moving objects
            // can re-enter the viewport even if the camera is stationary.
            if (this.updateFrameSkip === 0) {
                this.gridSystem.verifyActiveObjects(this.parent.camera);
            }

            // Update culling (skips work when camera hasn't moved — see GridSystem)
            this.gridSystem.updateCulling(this.parent.camera);
            this.activeObjectsCount = this.gridSystem.activeObjects.size;

            // Animation / visual updates only — no DOM writes here
            if (simulate) {
                for (const object of this.gridSystem.activeObjects) {
                    if (object.update && !object.sleeping) {
                        object.update(deltaTime);
                    }
                }
            }

            this.parent?.attachments?.update?.();
            // Batch-flush all dirty renderStates to the DOM in one pass
            this.renderer.flush(this.gridSystem.activeObjects);
        } else {
            // Fallback when grid system isn't ready
            if (simulate) {
                for (const object of this.objects) {
                    if (object.update) object.update(deltaTime);
                }
            }
            this.parent?.attachments?.update?.();
            this.renderer.flush(this.objects);
            this.activeObjectsCount = this.objects.length;
        }

        // Zone updates for active mytes.
        //
        // Zone effects stay per-frame on purpose: onMyteStay feeds
        // applyStatEffectsPerMs(effects, deltaTime), so throttling this to cell
        // crossings would silently stop per-ms stat accumulation. Room membership
        // below has no such constraint and IS cell-crossing gated — updateMembership
        // returns immediately when the entity has not changed cell.
        if (this.zoneManager && simulate) {
            this.mytes.forEach(myte => {
                if (myte.isActive) this.zoneManager.update(myte, deltaTime);
            });
        }

        if (this.regionManager) {
            this.mytes.forEach(myte => {
                const isAttached = !!this.parent?.attachments?.getAttachment?.(myte);
                if (myte.isActive && !isAttached) {
                    this.regionManager.updateMembership(myte, { layers: ['room'] });
                }
            });
        }

		// Room polling lives inside tick(), throttled with the occlusion checks.
		this.wallBuilder?.tick?.();

        // Update dropped items (physics + magnet collection). Any deployed myte can
        // collect — not just the controlled one — so background mytes that walk over a
        // chest drop actually pick it up.
        if (this.droppedItems.length > 0 && simulate) {
            const deployedMytes = this.mytes?.filter(m => m.isActive) || [];
            this.droppedItems = this.droppedItems.filter(item => {
                if (item.collected) {
                    item.remove();
                    this.parent?.worldRegistry?.remove(item);
                    return false;
                }
                item.update(deployedMytes, deltaTime);
                return true;
            });
        }

        // Periodic cleanup
        if (this.updateFrameSkip === 0) {
            this.removeInactiveObjects();
        }

        if (this.particleSystem) {
            this.particleSystem.update(deltaTime);
        }

        if (this.environmentManager) {
            this.environmentManager.update(deltaTime);
        }

    }

    dispose() {
        // Stop proximity polling and clear any proximity sounds before the new map takes over
        this._stopProximitySoundPolling();
        this.soundManager?.setProximitySounds(new Map());

        // Clean up dropped items (their DOM elements live in the shared layer)
        this.droppedItems.forEach(item => {
            item.remove();
            this.parent?.worldRegistry?.remove(item);
        });
        this.droppedItems = [];

		if (this.surfaceCustomizer) {
			this.surfaceCustomizer.dispose();
			this.surfaceCustomizer = null;
		}

		this.buildTransaction = null;
		this.buildDocument = null;

		if (this.wallBuilder) {
			this.wallBuilder.dispose();
			this.wallBuilder = null;
			this.wallMaterialRegistry = null;
		}
		if (this.fenceBuilder) {
			this.fenceBuilder.dispose();
			this.fenceBuilder = null;
		}
		// Floor and terrain surfaces live in the shared background layer, so they
		// outlive the map that made them unless torn down here with the walls.
		if (this.floorBuilder) {
			this.floorBuilder.dispose();
			this.floorBuilder = null;
			this.floorMaterialRegistry = null;
		}
		if (this.terrainBuilder) {
			this.terrainBuilder.dispose();
			this.terrainBuilder = null;
		}
		const backgroundLayer = this.layers.background;
		const backgroundImage = backgroundLayer?.style?.backgroundImage || '';
		if ([...this.generatedObjectUrls].some(url => backgroundImage.includes(url))) {
			backgroundLayer.style.backgroundImage = '';
		}
		this.revokeGeneratedObjectUrls();

        // Clean up objects
        this.objects.forEach(obj => {
            if (obj.remove) {
                obj.remove();
            }
            this.parent?.worldRegistry?.remove(obj);
        });
        this.objects = [];
        this.objectsById.clear();

        // Clean up zones
        // this.zones.clear();

        // Clean up spawn points
        this.spawnPoints.clear();

        // Clean up tile map loader
        if (this.tileMapLoader) {
            this.tileMapLoader.dispose();
            this.tileMapLoader = null;
        }

        // Clean up particle system
        if (this.particleSystem) {
            this.particleSystem.dispose();
            this.particleSystem = null;
        }

        if (this.environmentManager) {
            this.environmentManager.dispose();
            this.environmentManager = null;
        }

        // Clean up grid system
        if (this.gridSystem) {
            // Ensure grid system cleans up properly
            if (this.gridSystem.dispose) {
                this.gridSystem.dispose();
            }
            this.gridSystem = null;
        }

        if (this.layers && this.layers.debug) {
            // Clear all debug elements
            while (this.layers.debug.firstChild) {
                this.layers.debug.removeChild(this.layers.debug.firstChild);
            }
        }

        // dispose zones
        if (this.zoneManager) {
            this.zoneManager.dispose();
            this.zoneManager = null;
        }

        if (this.regionManager) {
            this.regionManager.clear();
            this.regionManager = null;
        }

        // Clear layer references
        this.layers = {};

        Utility.logDebug("[GameMap] Map disposed successfully");
    }
}
