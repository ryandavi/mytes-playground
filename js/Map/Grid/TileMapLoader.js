// TileMapLoader.js - A class to load and parse Tiled TMX and TSX files with terrain support
class TileMapLoader {
	constructor(parent) {
		this.parent = parent;
		this.tilesets = new Map(); // Store loaded tilesets
		this.maps = new Map(); // Store loaded maps
		this.currentMapData = null; // Track current map data


		// Default terrain mapping
		this.terrainMapping = {
			// Map Tiled property names to our terrain type names
			'road': 'path',
			'path': 'path',
			'floor': 'floor',
			'carpet': 'floor',
			'grass': 'grass',
			'tall_grass': 'grass',
			'sand': 'sand',
			'mud': 'mud',
			'snow': 'mud',
			'water': 'shallow_water',
			'deep_water': 'deep_water',
			'shallow_water': 'shallow_water'
		};

		// Terrain modifiers for objects
		this.terrainModifiers = {
			'TREE': 'grass',
			'BUSH': 'grass',
			'FLOWER': 'grass',
			'ROCK': 'ground',
			'WATER_PLANT': 'shallow_water',
			'POND': 'shallow_water',
			'SAND_PILE': 'sand'
		};
	}

	async _fetchXml(path) {
		const response = await fetch(path);
		if (!response.ok) throw new Error(`Failed to load ${path}: ${response.status}`);
		return new DOMParser().parseFromString(await response.text(), 'text/xml');
	}

	async _loadTilesetImages(tilesets) {
		const images = new Map();
		for (const tileset of tilesets) {
			if (!tileset.imageSource) continue;
			let img = this.parent.parent?.resourceManager?.getSprite(tileset.name);
			if (!img) {
				img = await new Promise(resolve => {
					const image = new Image();
					image.onload = () => resolve(image);
					image.onerror = () => resolve(null);
					image.src = tileset.imageSource;
				});
				if (img && this.parent.parent?.resourceManager) {
					this.parent.parent.resourceManager.sprites.set(tileset.name, img);
				}
			}
			if (img) images.set(tileset.name, img);
		}
		return images;
	}

	_renderLayerToCanvas(ctx, layer, tilesetImages, tilesets, mapWidth, tileWidth, tileHeight, skippedIndices = null, onlyIndices = null) {
		if (layer.opacity <= 0) return;
		ctx.globalAlpha = layer.opacity;
		layer.data.forEach((gid, index) => {
			if (gid === 0 || skippedIndices?.has(index)) return;
			if (onlyIndices && !onlyIndices.has(index)) return;
			const x = (index % mapWidth) * tileWidth;
			const y = Math.floor(index / mapWidth) * tileHeight;
			const tileset = this.findTilesetForGid(gid, tilesets);
			if (!tileset) return;
			const img = tilesetImages.get(tileset.name);
			if (!img) return;
			const localId = gid - tileset.firstgid;
			const tilesetX = (localId % tileset.columns) * tileWidth;
			const tilesetY = Math.floor(localId / tileset.columns) * tileHeight;
			ctx.drawImage(img, tilesetX, tilesetY, tileWidth, tileHeight, x, y, tileWidth, tileHeight);
		});
		ctx.globalAlpha = 1;
	}

	async loadTileMap(mapPath) {
		try {
			const xmlDoc = await this._fetchXml(mapPath);

			// Basic map info
			const mapEl = xmlDoc.querySelector('map');
			if (!mapEl) throw new Error('Invalid TMX file: missing map element');

			let id = mapPath.split('/').pop().split('?')[0].replace('.tmx', '');


			const mapData = {
				id: id,
				name: mapEl.getAttribute('name') || id,
				width: parseInt(mapEl.getAttribute('width')),
				height: parseInt(mapEl.getAttribute('height')),
				tileWidth: parseInt(mapEl.getAttribute('tilewidth')),
				tileHeight: parseInt(mapEl.getAttribute('tileheight')),
				layers: [],
				tilesets: [],
				objects: [],
				properties: this.parseProperties(mapEl.querySelector('properties')),
				dimensions: {
					width: parseInt(mapEl.getAttribute('width')) * parseInt(mapEl.getAttribute('tilewidth')),
					height: parseInt(mapEl.getAttribute('height')) * parseInt(mapEl.getAttribute('tileheight'))
				},
				environment: {
					location: 'interior', // Default, can be overridden by properties
					rooms: [],
					lightOpenings: []
				},
				spawns: {
					myte: { x: 100, y: 100 }, // Default spawn points
					items: []
				},
				zones: []
			};

			// Parse map properties to override defaults
			if (mapData.properties) {
				// 'location' is the canonical TMX property; 'environment' is a legacy alias
				if (mapData.properties.location) {
					mapData.environment.location = mapData.properties.location;
				} else if (mapData.properties.environment) {
					mapData.environment.location = mapData.properties.environment;
				}

				// Optional per-map ambient override — comma-separated sound IDs
				if (mapData.properties.ambientSounds) {
					mapData.environment.ambientOverride = String(mapData.properties.ambientSounds)
						.split(',').map(s => s.trim()).filter(Boolean);
				}

				// Optional per-map music override — single sound ID
				if (mapData.properties.music) {
					mapData.environment.musicOverride = String(mapData.properties.music).trim();
				}

				if (mapData.properties.description) {
					mapData.description = mapData.properties.description;
				}

				if (mapData.properties.displayName) {
					mapData.displayName = mapData.properties.displayName;
					mapData.hi = true;
				}
			}

			// Load tilesets
			const tilesetElements = xmlDoc.querySelectorAll('tileset');
			for (const tilesetEl of tilesetElements) {
				const source = tilesetEl.getAttribute('source');
				const firstgid = parseInt(tilesetEl.getAttribute('firstgid'));

				if (source) {
					// External tileset
					const tilesetPath = this.resolveTilesetPath(mapPath, source);
					const tileset = await this.loadTileset(tilesetPath, firstgid);
					mapData.tilesets.push(tileset);
				} else {
					// Embedded tileset - use the same loader with the element data
					const tileset = await this.loadTileset(null, firstgid, tilesetEl);
					mapData.tilesets.push(tileset);
				}
			}

			// Parse layers
			const layerElements = xmlDoc.querySelectorAll('layer');
			for (const layerEl of layerElements) {
				const layer = await this.parseLayer(layerEl, mapData);
				mapData.layers.push(layer);
			}

			// Parse object groups
			const objectGroupElements = xmlDoc.querySelectorAll('objectgroup');
			for (const groupEl of objectGroupElements) {
				const objects = this.parseObjectGroup(groupEl, mapData);
				mapData.objects.push(...objects);
			}

			this.createLightingDataFromObjects(mapData);

			// Create zones from object groups with specific names
			this.createZonesFromObjects(mapData);

			// Create spawns from objects with specific names
			this.createSpawnsFromObjects(mapData);
			this.extractWallData(mapData);
			

			// Extract terrain types from map data
			const terrainTypes = this.extractTerrainTypes(mapData);
			mapData.terrainTypes = terrainTypes;

			// Convert to our game map format
			const gameMapData = this.convertToGameMapFormat(mapData);

			// Save current map data for later reference
			this.currentMapData = gameMapData;

			// Cache the map
			this.maps.set(mapData.id, gameMapData);

			return gameMapData;
		} catch (error) {
			console.error('Error loading Tile map:', error);
			throw error;
		}
	}



	async loadTileset(tilesetPath, firstgid, tilesetEl = null) {
		// Check if we've already loaded this external tileset
		if (tilesetPath && this.tilesets.has(tilesetPath)) {
			const existingTileset = this.tilesets.get(tilesetPath);
			return {
				...existingTileset,
				firstgid
			};
		}
	
		try {
			let tilesetData;
	
			if (tilesetPath) {
				tilesetData = (await this._fetchXml(tilesetPath)).querySelector('tileset');
			} else {
				// Embedded tileset - use the provided element
				tilesetData = tilesetEl;
			}
	
			if (!tilesetData) throw new Error('Invalid tileset data');
	
			// Basic tileset info
			const tileset = {
				name: tilesetData.getAttribute('name'),
				source: tilesetPath,
				properties: this.parseProperties(tilesetData.querySelector(':scope > properties')),
				tileWidth: parseInt(tilesetData.getAttribute('tilewidth')),
				tileHeight: parseInt(tilesetData.getAttribute('tileheight')),
				tileCount: parseInt(tilesetData.getAttribute('tilecount')),
				columns: parseInt(tilesetData.getAttribute('columns')),
				firstgid,
				wallTileIds: new Set(),
				tiles: {},
				imageSource: '',
				imageWidth: 0,
				imageHeight: 0
			};
			const wallWangSetName = String(SiteConfig.wallSystem.wallWangSetName || 'Wall').toLowerCase();
			for (const wangSet of tilesetData.querySelectorAll('wangset')) {
				if (String(wangSet.getAttribute('name') || '').toLowerCase() !== wallWangSetName) continue;
				for (const wangTile of wangSet.querySelectorAll('wangtile')) {
					const tileId = Number(wangTile.getAttribute('tileid'));
					if (Number.isInteger(tileId)) tileset.wallTileIds.add(tileId);
				}
			}
	
			// Parse tileset image
			const imageEl = tilesetData.querySelector('image');
			if (imageEl) {
				tileset.imageSource = tilesetPath ?
					this.resolveTilesetPath(tilesetPath, imageEl.getAttribute('source')) :
					imageEl.getAttribute('source');
				tileset.imageWidth = parseInt(imageEl.getAttribute('width'));
				tileset.imageHeight = parseInt(imageEl.getAttribute('height'));
			}
	
			// Parse individual tile properties
			const tileElements = tilesetData.querySelectorAll('tile');
			
			for (const tileEl of tileElements) {
				const id = parseInt(tileEl.getAttribute('id'));
				const propsEl = tileEl.querySelector('properties');
				const props = this.parseProperties(propsEl);
				
				tileset.tiles[id] = {
					id,
					properties: props
				};
			}
	
			// Cache the tileset if it's external
			if (tilesetPath) {
				this.tilesets.set(tilesetPath, tileset);
			}
	
			return tileset;
		} catch (error) {
			console.error('Error loading tileset:', error);
			throw error;
		}
	}

	async parseLayer(layerEl, mapData) {
		const name = layerEl.getAttribute('name');
		const width = parseInt(layerEl.getAttribute('width'));
		const height = parseInt(layerEl.getAttribute('height'));
		const visible = layerEl.getAttribute('visible') !== '0';
		const opacity = parseFloat(layerEl.getAttribute('opacity') || '1');

		const layer = {
			id: Number(layerEl.getAttribute('id')) || null,
			name,
			width,
			height,
			visible,
			opacity,
			properties: this.parseProperties(layerEl.querySelector('properties')),
			data: []
		};

		// Parse layer data
		const dataEl = layerEl.querySelector('data');
		if (!dataEl) throw new Error(`Layer ${name} has no data element`);

		const encoding = dataEl.getAttribute('encoding');
		if (encoding === 'csv') {
			// Parse CSV data
			const csvData = dataEl.textContent.trim();
			layer.data = csvData.split(',').map(value => parseInt(value.trim()));
		} else {
			// Parse XML data
			const tileElements = dataEl.querySelectorAll('tile');
			layer.data = Array.from(tileElements).map(tileEl => parseInt(tileEl.getAttribute('gid')));
		}

		return layer;
	}

	extractWallData(mapData) {
		if (SiteConfig.wallSystem?.enabled !== true) {
			mapData.walls = null;
			return;
		}

		const defaults = {
			constructionId: mapData.properties?.wallConstructionId || SiteConfig.wallSystem.defaultConstructionId,
			finishId: mapData.properties?.wallFinishId || SiteConfig.wallSystem.defaultFinishId,
			heightCells: Number(mapData.properties?.wallHeightCells) || SiteConfig.wallSystem.defaultHeightCells,
			connectGroup: mapData.properties?.wallConnectGroup || mapData.properties?.wallConstructionId || SiteConfig.wallSystem.defaultConstructionId,
			blocksLineOfSight: mapData.properties?.blocksLineOfSight !== false
		};
		const cells = [];
		mapData.layers.forEach(layer => {
			const layerProperties = layer.properties || {};
			const layerDefaults = {
				constructionId: layerProperties.wallConstructionId || defaults.constructionId,
				finishId: layerProperties.wallFinishId || defaults.finishId,
				heightCells: Number(layerProperties.wallHeightCells) || defaults.heightCells,
				connectGroup: layerProperties.wallConnectGroup || layerProperties.wallConstructionId || defaults.connectGroup,
				blocksLineOfSight: layerProperties.blocksLineOfSight ?? defaults.blocksLineOfSight
			};
			layer.data.forEach((gid, index) => {
				if (!gid) return;
				const tileset = this.findTilesetForGid(gid, mapData.tilesets);
				const tileProperties = tileset?.tiles?.[gid - tileset.firstgid]?.properties || {};
				const localTileId = gid - tileset.firstgid;
				const marker = SiteConfig.wallSystem.wallTilesetProperty;
				const isWallTile = tileProperties.wall === true || tileset.wallTileIds?.has(localTileId);
				if (tileset?.properties?.[marker] !== true || !isWallTile) return;
				cells.push({
					x: index % mapData.width,
					y: Math.floor(index / mapData.width),
					gid,
					sourceLayerId: layer.id,
					sourceLayerName: layer.name,
					sourceIndex: index,
					constructionId: tileProperties.wallConstructionId || layerDefaults.constructionId,
					finishId: tileProperties.wallFinishId || layerDefaults.finishId,
					heightCells: Number(tileProperties.wallHeightCells) || layerDefaults.heightCells,
					connectGroup: tileProperties.wallConnectGroup || layerDefaults.connectGroup,
					blocksLineOfSight: tileProperties.blocksLineOfSight ?? layerDefaults.blocksLineOfSight
				});
			});
		});
		if (cells.length === 0) {
			mapData.walls = null;
			return;
		}

		const openings = [];
		const attachments = [];
		const fixtures = [];
		const faceOverrides = [];
		mapData.objects = mapData.objects.filter(object => {
			const type = String(object.properties?.type || object.name || object.type || '').toUpperCase();
			if (type === 'WALLFINISHOVERRIDE') {
				const fromX = Number(object.properties?.fromX ?? Math.floor(object.x / mapData.tileWidth));
				const fromY = Number(object.properties?.fromY ?? Math.floor(object.y / mapData.tileHeight));
				const toX = Number(object.properties?.toX ?? Math.ceil((object.x + object.width) / mapData.tileWidth) - 1);
				const toY = Number(object.properties?.toY ?? Math.ceil((object.y + object.height) / mapData.tileHeight) - 1);
				faceOverrides.push({
					mapId: mapData.id,
					axis: fromY === toY ? 'horizontal' : 'vertical',
					cells: { from: [fromX, fromY], to: [toX, toY] },
					face: String(object.properties?.face || 'south').toLowerCase(),
					finishId: object.properties?.finishId || defaults.finishId
				});
				return false;
			}
			if (type === 'WALLATTACHMENT') {
				const childId = String(object.properties?.childId || object.id);
				const cellX = Math.floor(object.x / mapData.tileWidth);
				const cellY = Math.floor(object.y / mapData.tileHeight);
				attachments.push({
					id: childId,
					childId,
					mapId: mapData.id,
					cells: { from: [cellX, cellY], to: [cellX, cellY] },
					face: String(object.properties?.face || 'south').toLowerCase(),
					socketId: object.properties?.socketId || 'surface',
					u: Number(object.properties?.u ?? 0.5),
					v: Number(object.properties?.v ?? 0.5),
					width: Number(object.properties?.attachmentWidth || object.width || mapData.tileWidth),
					height: Number(object.properties?.attachmentHeight || object.height || mapData.tileHeight),
					fixture: object.properties?.fixture || 'painting'
				});
				return false;
			}

			// A wall fixture hangs on a face and cuts nothing, so unlike an
			// opening it records a point rather than a cell footprint — and
			// unlike a WallAttachment it stays in the object list, because it
			// becomes a real, draggable map object.
			if (type === 'PAINTING' || object.properties?.wallFixture === true) {
				const cellX = Math.floor(object.x / mapData.tileWidth);
				const cellY = Math.floor(object.y / mapData.tileHeight);
				fixtures.push({
					id: String(object.id),
					mapId: mapData.id,
					cells: { from: [cellX, cellY], to: [cellX, cellY] },
					face: String(object.properties?.face || 'south').toLowerCase(),
					socketId: object.properties?.socketId || 'surface',
					u: Number(object.properties?.u ?? (object.x - (cellX * mapData.tileWidth))),
					v: Number(object.properties?.v ?? 0.35)
				});
				return true;
			}

			if (type === 'DOOR' || type === 'WINDOW' || object.properties?.wallOpening === true) {
				const x0 = Math.floor(object.x / mapData.tileWidth);
				const y0 = Math.floor(object.y / mapData.tileHeight);
				const x1 = Math.max(x0, Math.ceil((object.x + Math.max(object.width, mapData.tileWidth)) / mapData.tileWidth) - 1);
				const y1 = Math.max(y0, Math.ceil((object.y + Math.max(object.height, mapData.tileHeight)) / mapData.tileHeight) - 1);
				const openingCells = [];
				for (let x = x0; x <= x1; x++) {
					for (let y = y0; y <= y1; y++) openingCells.push([x, y]);
				}
				openings.push({
					id: String(object.id),
					type: type === 'WINDOW' ? 'window' : 'door',
					cells: openingCells,
					axis: object.width >= object.height ? 'horizontal' : 'vertical',
					openingHeight: Number(object.properties?.openingHeight) || (type === 'WINDOW' ? 64 : 128),
					sillHeight: type === 'WINDOW' ? Number(object.properties?.sillHeight ?? 32) : 0,
					continuesTopTrim: object.properties?.continuesTopTrim === true,
					blocksLineOfSight: false
				});
			}
			return true;
		});

		mapData.walls = { defaults, cells, openings, fixtures, attachments, faceOverrides };
	}

	getWallIndicesForLayer(walls, layer) {
		if (!walls?.cells?.length) return null;
		const indices = walls.cells
			.filter(cell => cell.sourceLayerId === layer.id)
			.map(cell => cell.sourceIndex);
		return indices.length > 0 ? new Set(indices) : null;
	}

	parseObjectGroup(groupEl, mapData) {
		const name = groupEl.getAttribute('name');
		const visible = groupEl.getAttribute('visible') !== '0';
		const opacity = parseFloat(groupEl.getAttribute('opacity') || '1');
		const color = groupEl.getAttribute('color');

		const group = {
			name,
			visible,
			opacity,
			color,
			properties: this.parseProperties(groupEl.querySelector('properties')),
			objects: []
		};

		// Parse objects
		const objectElements = groupEl.querySelectorAll('object');
		for (const objectEl of objectElements) {
			const id = parseInt(objectEl.getAttribute('id'));
			const x = parseFloat(objectEl.getAttribute('x'));
			const y = parseFloat(objectEl.getAttribute('y'));
			const width = parseFloat(objectEl.getAttribute('width') || '0');
			const height = parseFloat(objectEl.getAttribute('height') || '0');
			const type = objectEl.getAttribute('type') || '';
			const name = objectEl.getAttribute('name') || '';
			const gid = parseInt(objectEl.getAttribute('gid') || '0');
			const rotation = parseFloat(objectEl.getAttribute('rotation') || '0');

			const objectProperties = this.parseProperties(objectEl.querySelector('properties'));
			const inheritedObjectProperties = {};
			['draggable', 'storable'].forEach(propertyName => {
				if (group.properties?.[propertyName] !== undefined) {
					inheritedObjectProperties[propertyName] = group.properties[propertyName];
				}
			});
			const object = {
				id,
				x,
				y,
				width,
				height,
				type,
				name,
				groupName: group.name,
				gid,
				rotation,
				visible: objectEl.getAttribute('visible') !== '0',
				properties: {
					...inheritedObjectProperties,
					...(objectProperties || {})
				}
			};

			// Parse polygon/polyline if present
			const polygonEl = objectEl.querySelector('polygon');
			const polylineEl = objectEl.querySelector('polyline');

			if (polygonEl) {
				object.polygon = this.parsePoints(polygonEl.getAttribute('points'));
			} else if (polylineEl) {
				object.polyline = this.parsePoints(polylineEl.getAttribute('points'));
			}

			group.objects.push(object);
		}

		return group.objects;
	}

	parseProperties(propertiesEl) {
		if (!propertiesEl) return null;
	
		const properties = {};
		const propertyElements = propertiesEl.querySelectorAll('property');
	
		for (const propEl of propertyElements) {
			const name_unformatted = propEl.getAttribute('name');
			const name = name_unformatted.charAt(0).toLowerCase() + name_unformatted.slice(1);
			const type = propEl.getAttribute('type') || 'string';
			const valueAttr = propEl.getAttribute('value');
	
			let value;
	
			if (valueAttr !== null) {
				value = valueAttr;
			} else {
				value = propEl.textContent;
			}
	
			// Convert value based on type
			switch (type) {
				case 'bool':
					value = value === 'true';
					break;
				case 'int':
					value = parseInt(value);
					break;
				case 'float':
					value = parseFloat(value);
					break;
				case 'color':
					// Convert from #AARRGGBB to #RRGGBB format if needed
					if (value.length === 9) {
						value = '#' + value.substring(3);
					}
					break;
				// Other types (string, file) are kept as is
			}
	
			properties[name] = value;
		}
	
		return Object.keys(properties).length > 0 ? properties : null;
	}

	parsePoints(pointsStr) {
		if (!pointsStr) return [];

		return pointsStr.split(' ').map(point => {
			const [x, y] = point.split(',');
			return {
				x: parseFloat(x),
				y: parseFloat(y)
			};
		});
	}

	resolveTilesetPath(mapPath, tilesetPath) {
		// Get the directory of the map file
		const mapDir = mapPath.substring(0, mapPath.lastIndexOf('/') + 1);
		// Resolve the tileset path
		return mapDir + tilesetPath;
	}

	createZonesFromObjects(mapData) {
		mapData.objects = mapData.objects.filter(obj => {
			if (obj.name.toUpperCase() !== 'ZONE' || !obj.properties) return true;

			const type = (obj.properties.type || 'REST').toUpperCase();
			const displayName = obj.properties.displayName || obj.properties.type || `zone_${obj.id}`;
			const id = `zone_${displayName.toLowerCase().replace(/[^a-zA-Z0-9]/g, '_')}`;

			mapData.zones.push({
				id,
				type,
				bounds: { x: obj.x, y: obj.y, width: obj.width, height: obj.height },
				properties: {
					visible: obj.properties.visible !== false,
					strength: obj.properties.strength || 1.0,
					...obj.properties
				}
			});

			return false;
		});
	}

	createLightingDataFromObjects(mapData) {
		mapData.environment.rooms = Array.isArray(mapData.environment.rooms)
			? mapData.environment.rooms
			: [];
		mapData.environment.lightOpenings = Array.isArray(mapData.environment.lightOpenings)
			? mapData.environment.lightOpenings
			: [];

		mapData.objects = mapData.objects.filter(obj => {
			const objName = String(obj.name || '').toUpperCase();
			const groupName = String(obj.groupName || '').toUpperCase();
			const lightingKind = String(obj.properties?.lightingKind || obj.properties?.kind || '').toLowerCase();
			const roomId = obj.properties?.roomId || obj.properties?.id || null;
			const displayName = obj.properties?.displayName || obj.name || roomId || `room_${obj.id}`;

			const isRoomVolume =
				objName === 'LIGHTVOLUME' ||
				lightingKind === 'room' ||
				(groupName === 'LIGHTING' && !!roomId);
			if (isRoomVolume) {
				const cellSize = Number(obj.properties?.cellSize) || mapData.tileWidth || 32;
				const tilemask = this.parseTilemask(
					obj.properties?.tilemask,
					obj.x,
					obj.y,
					cellSize
				);
				mapData.environment.rooms.push({
					id: String(roomId || displayName).toLowerCase().replace(/[^a-z0-9_-]+/g, '_'),
					displayName,
					bounds: this.snapRoomBoundsToGrid(obj, cellSize, displayName),
					polygon: Array.isArray(obj.polygon) ? obj.polygon : null,
					tilemask: tilemask ? { cells: tilemask, cellSize } : null,
					properties: {
						...obj.properties
					}
				});
				return false;
			}

			const isLightOpening =
				objName === 'LIGHTOPENING' ||
				lightingKind === 'opening';
			if (isLightOpening) {
				mapData.environment.lightOpenings.push({
					id: String(obj.properties?.id || `opening_${obj.id}`).toLowerCase().replace(/[^a-z0-9_-]+/g, '_'),
					bounds: {
						x: obj.x,
						y: obj.y,
						width: obj.width,
						height: obj.height
					},
					polygon: Array.isArray(obj.polygon) ? obj.polygon : null,
					properties: {
						...obj.properties
					}
				});
				return false;
			}

			return true;
		});
	}

	/**
	 * Rooms are drawn on the grid in Tiled, so a bound landing off it is a slip
	 * of the hand - and an off-grid room edge lands mid-cell, where it leaves a
	 * strip of floor that belongs to no room and therefore never lights. Snap
	 * and say so, rather than carrying the slip into every downstream system.
	 */
	snapRoomBoundsToGrid(obj, cellSize, displayName) {
		const snap = value => Math.round((Number(value) || 0) / cellSize) * cellSize;
		const bounds = {
			x: snap(obj.x),
			y: snap(obj.y),
			width: Math.max(cellSize, snap(obj.x + obj.width) - snap(obj.x)),
			height: Math.max(cellSize, snap(obj.y + obj.height) - snap(obj.y))
		};
		if (bounds.x !== obj.x || bounds.y !== obj.y ||
			bounds.width !== obj.width || bounds.height !== obj.height) {
			console.warn(
				`[TileMapLoader] Room "${displayName}" is off the ${cellSize}px grid ` +
				`(${obj.x},${obj.y} ${obj.width}x${obj.height}) - snapped to ` +
				`(${bounds.x},${bounds.y} ${bounds.width}x${bounds.height}).`
			);
		}
		return bounds;
	}

	/**
	 * Parse a compact, object-local Tiled room mask. Rows are separated by `/`,
	 * `;`, or a newline; `1`/`#` marks a member cell and `0`/`.` an empty cell.
	 * The returned cells use absolute map-grid coordinates, which is the canonical
	 * SpatialRegion tilemask representation.
	 */
	parseTilemask(rawMask, originX, originY, cellSize = 32) {
		if (typeof rawMask !== 'string' || rawMask.trim() === '') return null;
		const rows = rawMask.trim().split(/[\/;\r\n]+/).map(row => row.trim()).filter(Boolean);
		if (rows.length === 0) return null;

		const originCellX = Math.floor((Number(originX) || 0) / cellSize);
		const originCellY = Math.floor((Number(originY) || 0) / cellSize);
		const cells = [];
		rows.forEach((row, rowIndex) => {
			[...row.replace(/\s+/g, '')].forEach((value, columnIndex) => {
				if (value === '1' || value === '#') {
					cells.push([originCellX + columnIndex, originCellY + rowIndex]);
				}
			});
		});
		return cells.length > 0 ? cells : null;
	}

	createSpawnsFromObjects(mapData) {
		mapData.objects = mapData.objects.filter(obj => {
			if (obj.name.toUpperCase() === 'SPAWN') {
				const type = obj?.properties?.type || 'myte';

				if (type === 'myte') {
					mapData.spawns.myte = { x: obj.x, y: obj.y };
				} else if (type === 'item') {
					mapData.spawns.items.push({ x: obj.x, y: obj.y });
				}
				return false; // Remove from objects
			}
			return true; // Keep in objects
		});
	}

	/**
	 * Extract terrain type mappings from map data
	 */
	extractTerrainTypes(mapData) {
		const terrainTypes = new Map();
	
		// Process each tileset to check for terrain properties
		mapData.tilesets.forEach(tileset => {
			// Debug the tileset to ensure tiles are loaded correctly

			Object.entries(tileset.tiles || {}).forEach(([tileIdStr, tile]) => {
				// Ensure we're working with the correct data structure
				if (!tile || !tile.properties) return;
				
				// Look for terrain property using different possible property names
				const terrain = tile.properties.terrain || 
								tile.properties.terrainType || 
								tile.properties.type;
	
				if (terrain) {
					// Map to our internal terrain type system
					const terrainType = this.terrainMapping[terrain.toLowerCase()] || GridSystem.defaultTerrain;
					
					// Save using global tile ID (tileset firstgid + local tile id)
					const globalTileId = tileset.firstgid + parseInt(tileIdStr);
					terrainTypes.set(globalTileId, terrainType);
				}
			});
		});
	
		return terrainTypes;
	}

	renderTileLayerToCanvas(layer, mapData, canvas) {
		const ctx = canvas.getContext('2d');
		const { tileWidth, tileHeight, width: mapWidth } = mapData;
		this._loadTilesetImages(mapData.tilesets).then(tilesetImages => {
			ctx.clearRect(0, 0, canvas.width, canvas.height);
			this._renderLayerToCanvas(ctx, layer, tilesetImages, mapData.tilesets, mapWidth, tileWidth, tileHeight);
		});
	}

	findTilesetForGid(gid, tilesets) {
		// Tilesets are ordered ascending by firstgid; walk backwards to find the first match
		for (let i = tilesets.length - 1; i >= 0; i--) {
			if (gid >= tilesets[i].firstgid) return tilesets[i];
		}
		return null;
	}

	async canvasToObjectUrl(canvas) {
		const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
		if (!blob) throw new Error('Canvas could not be encoded as a PNG blob');
		return URL.createObjectURL(blob);
	}

	async createMapBackgroundUrl(mapData) {
		try {
			const { layers, tilesets, tileWidth, tileHeight, width, height } = mapData.TileData;
			const canvas = document.createElement('canvas');
			canvas.width = width * tileWidth;
			canvas.height = height * tileHeight;
			const ctx = canvas.getContext('2d');

			const tilesetImages = await this._loadTilesetImages(tilesets);
			for (const layer of layers.filter(l => l.visible)) {
				const skippedIndices = SiteConfig.wallSystem?.enabled === true
					? this.getWallIndicesForLayer(mapData.walls, layer)
					: null;
				this._renderLayerToCanvas(ctx, layer, tilesetImages, tilesets, width, tileWidth, tileHeight, skippedIndices);
			}

			return await this.canvasToObjectUrl(canvas);
		} catch (e) {
			console.error('Error creating map background:', e);
			return null;
		}
	}

	// The baked background deliberately omits the authored wall tiles because
	// WallBuilder redraws them as tall pieces. This bakes the inverse — only
	// those tiles — so the 'hidden' presentation can still show the flat walls
	// the map author laid down in Tiled.
	async createWallTileOverlayUrl(mapData) {
		if (SiteConfig.wallSystem?.enabled !== true || !mapData?.walls?.cells?.length) return null;

		try {
			const { layers, tilesets, tileWidth, tileHeight, width, height } = mapData.TileData;
			const canvas = document.createElement('canvas');
			canvas.width = width * tileWidth;
			canvas.height = height * tileHeight;
			const ctx = canvas.getContext('2d');

			const tilesetImages = await this._loadTilesetImages(tilesets);
			let rendered = false;
			for (const layer of layers.filter(l => l.visible)) {
				const wallIndices = this.getWallIndicesForLayer(mapData.walls, layer);
				if (!wallIndices) continue;
				this._renderLayerToCanvas(
					ctx, layer, tilesetImages, tilesets, width, tileWidth, tileHeight, null, wallIndices
				);
				rendered = true;
			}

			return rendered ? await this.canvasToObjectUrl(canvas) : null;
		} catch (e) {
			console.error('Error creating wall tile overlay:', e);
			return null;
		}
	}

	/**
	 * Enhanced grid data generation with terrain types
	 */

generateGridData(mapData, gridConfig = {}) {
    const { layers: tileLayers, tilesets, tileWidth, tileHeight, width, height } = mapData.TileData;
    const cellSize = gridConfig.cellSize || tileWidth;
    const gridWidth = Math.ceil(mapData.dimensions.width / cellSize);
    const gridHeight = Math.ceil(mapData.dimensions.height / cellSize);

    const grid = [];
    for (let x = 0; x < gridWidth; x++) {
        grid[x] = [];
        for (let y = 0; y < gridHeight; y++) {
            grid[x][y] = {
                x: x * cellSize,
                y: y * cellSize,
                walkable: true,
                swimmable: false,
                conditionallyWalkable: false,
                conditionType: null,
                conditionId: null,
                objects: new Set(),
                terrainType: GridSystem.defaultTerrain
            };
        }
    }

    const visibleLayers = tileLayers.filter(l => l.visible);
    const wallIndicesByLayer = new Map(visibleLayers.map(layer => [
        layer.id,
        SiteConfig.wallSystem?.enabled === true
            ? this.getWallIndicesForLayer(mapData.walls, layer)
            : null
    ]));

    for (let ty = 0; ty < height; ty++) {
        for (let tx = 0; tx < width; tx++) {
            const tileX = tx * tileWidth;
            const tileY = ty * tileHeight;
            const index = ty * width + tx;

            for (const layer of visibleLayers) {
                if (wallIndicesByLayer.get(layer.id)?.has(index)) continue;
                const gid = layer.data[index];
                if (gid === 0) continue;

                const tileset = this.findTilesetForGid(gid, tilesets);
                if (!tileset) continue;

                const tileProps = tileset.tiles[gid - tileset.firstgid]?.properties;
                if (!tileProps) continue;

                if (tileProps.type === 'collider') {
                    if (tileProps.conditionType === 'door' || tileProps.interactive === 'door') {
                        this.markGridCellsConditional(grid, tileX, tileY, tileWidth, tileHeight, cellSize, 'door', tileProps.conditionId || tileProps.id);
                    } else {
                        this.markGridCellsUnwalkable(grid, tileX, tileY, tileWidth, tileHeight, cellSize);
                    }
                }

                const rawTerrain = tileProps.terrain || tileProps.terrainType;
                if (rawTerrain) {
                    const terrainType = this.terrainMapping[rawTerrain.toLowerCase()] || GridSystem.defaultTerrain;
                    this.applyTerrainTypeToGridCells(grid, tileX, tileY, tileWidth, tileHeight, cellSize, terrainType);
                    if (terrainType === 'shallow_water' || terrainType === 'deep_water') {
                        this.markGridCellsSwimmable(grid, tileX, tileY, tileWidth, tileHeight, cellSize);
                    }
                }
            }
        }
    }

    if (SiteConfig.wallSystem?.enabled === true && mapData.walls) {
        const openingsByCell = new Map();
        for (const opening of mapData.walls.openings) {
            for (const [x, y] of opening.cells) openingsByCell.set(`${x},${y}`, opening);
        }
        for (const wall of mapData.walls.cells) {
            const cell = grid[wall.x]?.[wall.y];
            if (!cell) continue;
            const opening = openingsByCell.get(`${wall.x},${wall.y}`);
            if (opening?.type === 'door') {
                cell.wallBlocksLineOfSight = false;
                continue;
            }
            cell.walkable = false;
            cell.tileWalkable = false;
            cell.wallBlocksLineOfSight = opening
                ? opening.blocksLineOfSight === true
                : wall.blocksLineOfSight !== false;
        }
    }

    return { grid, width: gridWidth, height: gridHeight, cellSize };
}


	_iterateCells(grid, tileX, tileY, tileWidth, tileHeight, cellSize, fn) {
		const x0 = Math.floor(tileX / cellSize);
		const y0 = Math.floor(tileY / cellSize);
		const x1 = Math.ceil((tileX + tileWidth) / cellSize);
		const y1 = Math.ceil((tileY + tileHeight) / cellSize);
		for (let gx = x0; gx < x1; gx++) {
			if (gx < 0 || gx >= grid.length) continue;
			for (let gy = y0; gy < y1; gy++) {
				if (gy >= 0 && gy < grid[gx].length) fn(grid[gx][gy]);
			}
		}
	}

	markGridCellsSwimmable(grid, tileX, tileY, tileWidth, tileHeight, cellSize) {
		this._iterateCells(grid, tileX, tileY, tileWidth, tileHeight, cellSize, cell => {
			cell.swimmable = true;
		});
	}

	markGridCellsConditional(grid, tileX, tileY, tileWidth, tileHeight, cellSize, conditionType, conditionId) {
		this._iterateCells(grid, tileX, tileY, tileWidth, tileHeight, cellSize, cell => {
			cell.walkable = false;
			cell.conditionallyWalkable = true;
			cell.conditionType = conditionType;
			cell.conditionId = conditionId;
		});
	}

	applyTerrainTypeToGridCells(grid, tileX, tileY, tileWidth, tileHeight, cellSize, terrainType) {
		this._iterateCells(grid, tileX, tileY, tileWidth, tileHeight, cellSize, cell => {
			cell.terrainType = terrainType;
		});
	}

	markGridCellsUnwalkable(grid, tileX, tileY, tileWidth, tileHeight, cellSize) {
		this._iterateCells(grid, tileX, tileY, tileWidth, tileHeight, cellSize, cell => {
			cell.walkable = false;
			cell.tileWalkable = false;
		});
	}

	convertToGameMapFormat(TileMapData) {
		// Create base map structure
		const gameMapData = {
			id: TileMapData.id,
			name: TileMapData.name,
			displayName: TileMapData.displayName,
			description: TileMapData.description || `A ${TileMapData.environment.location} map`,
			dimensions: TileMapData.dimensions,
			environment: TileMapData.environment,
			background: {
				color: '#f0f0f0' // Default background color
			},
			spawns: TileMapData.spawns,
			zones: TileMapData.zones || [],
			objects: [], // Initialize with empty array
			terrainTypes: TileMapData.terrainTypes, // Pass along terrain types
			properties: TileMapData.properties || {}, // Pass through all properties
			walls: TileMapData.walls,
			TileData: {
				layers: TileMapData.layers,
				tilesets: TileMapData.tilesets,
				tileWidth: TileMapData.tileWidth,
				tileHeight: TileMapData.tileHeight,
				width: TileMapData.width,
				height: TileMapData.height
			}
		};

		// Extract objects from the Tile map - only process each object once
		for (const obj of TileMapData.objects) {
			// Skip objects already processed as zones or spawns
			if (obj.type === 'ZONE' || obj.type === 'SPAWN') continue;

			// Convert Tile objects to game objects
			gameMapData.objects.push({
				id: obj.id,
				type: obj.properties?.type || obj.name || 'UNKNOWN',
				variant: obj.properties?.variant || 'default',
				x: obj.x,
				y: obj.y,
				tileWidth: obj.width || 0,
				tileHeight: obj.height || 0,
				properties: obj.properties || {}
			});
		}

		return gameMapData;
	}

	// Dispose resources
	dispose() {
		// Clear current map data
		this.currentMapData = null;
	}
}
