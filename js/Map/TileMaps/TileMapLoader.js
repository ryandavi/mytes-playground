// TileMapLoader.js - A class to load and parse Tiled TMX and TSX files
class TileMapLoader {
	constructor(parent) {
		this.parent = parent;
		this.tilesets = new Map(); // Store loaded tilesets
		this.maps = new Map(); // Store loaded maps
		this.tileCache = new Map(); // Cache for rendered tiles
		this.wangSets = new Map(); // Store wang tile definitions
	}
	async loadTileMap(mapPath) {
		try {
			// Fetch the TMX file
			const response = await fetch(mapPath);
			if (!response.ok) throw new Error(`Failed to load map: ${response.status}`);
			const text = await response.text();

			// Parse the XML
			const parser = new DOMParser();
			const xmlDoc = parser.parseFromString(text, "text/xml");

			// Basic map info
			const mapEl = xmlDoc.querySelector('map');
			if (!mapEl) throw new Error('Invalid TMX file: missing map element');

			const mapData = {
				id: mapPath.split('/').pop().replace('.tmx', ''),
				name: mapEl.getAttribute('name') || mapPath.split('/').pop().replace('.tmx', ''),
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
					location: 'interior' // Default, can be overridden by properties
				},
				spawns: {
					myte: { x: 100, y: 100 }, // Default spawn points
					items: []
				},
				zones: []
			};

			// Parse map properties to override defaults
			if (mapData.properties) {
				if (mapData.properties.environment) {
					mapData.environment.location = mapData.properties.environment;
				}

				if (mapData.properties.description) {
					mapData.description = mapData.properties.description;
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
					// Embedded tileset
					const tileset = this.parseEmbeddedTileset(tilesetEl, firstgid);
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

			// Create zones from object groups with specific names
			this.createZonesFromObjects(mapData);

			// Create spawns from objects with specific names
			this.createSpawnsFromObjects(mapData);

			// Convert to our game map format
			const gameMapData = this.convertToGameMapFormat(mapData);

			// Cache the map
			this.maps.set(mapData.id, gameMapData);

			return gameMapData;
		} catch (error) {
			console.error('Error loading Tile map:', error);
			throw error;
		}
	}


	async applyToGameMap(gameMap, mapData) {
		if (!gameMap || !mapData) return;

		// Set dimensions
		gameMap.dimensions = mapData.dimensions;

		// Set background
		if (mapData.background) {
			gameMap.setBackground(mapData.background);
		} else {
			// Create a background from the map
			const bgUrl = await this.createMapBackgroundUrl(mapData);
			if (bgUrl) {
				gameMap.setBackground({
					url: bgUrl,
					color: mapData.background?.color || '#f0f0f0'
				});
			}
		}

		// Generate grid data for the GridSystem
		const gridData = this.generateGridData(mapData, {
			cellSize: gameMap.gridSystem?.config?.cellSize || 32,
			collisionLayer: 'Collider'
		});

		// Update the grid system
		if (gameMap.gridSystem) {
			// Extend the existing grid system with the new grid data
			gameMap.gridSystem.updateFromTileGrid(gridData);
		}

		// Add zones
		if (mapData.zones) {
			for (const zoneData of mapData.zones) {
				gameMap.zoneManager.addZone(zoneData);
			}
		}

		// Set spawn points
		if (mapData.spawns) {
			Object.entries(mapData.spawns).forEach(([key, value]) => {
				gameMap.spawnPoints.set(key, value);
			});
		}

		// Add objects
		if (mapData.objects) {

			for (const objData of mapData.objects) {

				console.log(mapData.objects);
	
				gameMap.addObject(
					objData.type.toUpperCase(),
					objData.variant,
					objData.x,
					objData.y,
					objData.properties
				);
			}
		}
	}


	async loadTileset(tilesetPath, firstgid) {
		// Check if we've already loaded this tileset
		if (this.tilesets.has(tilesetPath)) {
			const existingTileset = this.tilesets.get(tilesetPath);
			return {
				...existingTileset,
				firstgid
			};
		}

		try {
			// Fetch the TSX file
			const response = await fetch(tilesetPath);
			if (!response.ok) throw new Error(`Failed to load tileset: ${response.status}`);
			const text = await response.text();

			// Parse the XML
			const parser = new DOMParser();
			const xmlDoc = parser.parseFromString(text, "text/xml");

			// Basic tileset info
			const tilesetEl = xmlDoc.querySelector('tileset');
			if (!tilesetEl) throw new Error('Invalid TSX file: missing tileset element');

			const tileset = {
				name: tilesetEl.getAttribute('name'),
				tileWidth: parseInt(tilesetEl.getAttribute('tilewidth')),
				tileHeight: parseInt(tilesetEl.getAttribute('tileheight')),
				tileCount: parseInt(tilesetEl.getAttribute('tilecount')),
				columns: parseInt(tilesetEl.getAttribute('columns')),
				firstgid,
				tiles: {},
				imageSource: '',
				imageWidth: 0,
				imageHeight: 0,
				wangSets: []
			};

			// Parse tileset image
			const imageEl = tilesetEl.querySelector('image');
			if (imageEl) {
				tileset.imageSource = this.resolveTilesetPath(tilesetPath, imageEl.getAttribute('source'));
				tileset.imageWidth = parseInt(imageEl.getAttribute('width'));
				tileset.imageHeight = parseInt(imageEl.getAttribute('height'));
			}

			// Parse individual tile properties
			const tileElements = tilesetEl.querySelectorAll('tile');
			for (const tileEl of tileElements) {
				const id = parseInt(tileEl.getAttribute('id'));
				tileset.tiles[id] = {
					id,
					properties: this.parseProperties(tileEl.querySelector('properties')),
					animation: this.parseAnimation(tileEl.querySelector('animation'))
				};

				// Parse collision data if present
				const objectGroupEl = tileEl.querySelector('objectgroup');
				if (objectGroupEl) {
					tileset.tiles[id].collision = this.parseCollision(objectGroupEl);
				}
			}

			// Parse Wang sets
			const wangSetElements = tilesetEl.querySelectorAll('wangset');
			for (const wangSetEl of wangSetElements) {
				const wangSet = this.parseWangSet(wangSetEl, tileset);
				tileset.wangSets.push(wangSet);
				this.wangSets.set(wangSet.name, wangSet);
			}

			// Cache the tileset
			this.tilesets.set(tilesetPath, tileset);

			return tileset;
		} catch (error) {
			console.error('Error loading tileset:', error);
			throw error;
		}
	}

	parseEmbeddedTileset(tilesetEl, firstgid) {
		const tileset = {
			name: tilesetEl.getAttribute('name'),
			tileWidth: parseInt(tilesetEl.getAttribute('tilewidth')),
			tileHeight: parseInt(tilesetEl.getAttribute('tileheight')),
			tileCount: parseInt(tilesetEl.getAttribute('tilecount')),
			columns: parseInt(tilesetEl.getAttribute('columns')),
			firstgid,
			tiles: {},
			wangSets: []
		};

		// Parse image
		const imageEl = tilesetEl.querySelector('image');
		if (imageEl) {
			tileset.imageSource = imageEl.getAttribute('source');
			tileset.imageWidth = parseInt(imageEl.getAttribute('width'));
			tileset.imageHeight = parseInt(imageEl.getAttribute('height'));
		}

		// Parse individual tile properties
		const tileElements = tilesetEl.querySelectorAll('tile');
		for (const tileEl of tileElements) {
			const id = parseInt(tileEl.getAttribute('id'));
			tileset.tiles[id] = {
				id,
				properties: this.parseProperties(tileEl.querySelector('properties')),
				animation: this.parseAnimation(tileEl.querySelector('animation'))
			};

			// Parse collision data if present
			const objectGroupEl = tileEl.querySelector('objectgroup');
			if (objectGroupEl) {
				tileset.tiles[id].collision = this.parseCollision(objectGroupEl);
			}
		}

		// Parse Wang sets
		const wangSetElements = tilesetEl.querySelectorAll('wangset');
		for (const wangSetEl of wangSetElements) {
			const wangSet = this.parseWangSet(wangSetEl, tileset);
			tileset.wangSets.push(wangSet);
			this.wangSets.set(wangSet.name, wangSet);
		}

		return tileset;
	}

	async parseLayer(layerEl, mapData) {
		const name = layerEl.getAttribute('name');
		const width = parseInt(layerEl.getAttribute('width'));
		const height = parseInt(layerEl.getAttribute('height'));
		const visible = layerEl.getAttribute('visible') !== '0';
		const opacity = parseFloat(layerEl.getAttribute('opacity') || '1');

		const layer = {
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

			const object = {
				id,
				x,
				y,
				width,
				height,
				type,
				name,
				gid,
				rotation,
				visible: objectEl.getAttribute('visible') !== '0',
				properties: this.parseProperties(objectEl.querySelector('properties'))
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
			const name = propEl.getAttribute('name');
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

	parseAnimation(animationEl) {
		if (!animationEl) return null;

		const frames = [];
		const frameElements = animationEl.querySelectorAll('frame');

		for (const frameEl of frameElements) {
			frames.push({
				tileid: parseInt(frameEl.getAttribute('tileid')),
				duration: parseInt(frameEl.getAttribute('duration'))
			});
		}

		return frames.length > 0 ? frames : null;
	}

	parseCollision(objectGroupEl) {
		const collisionObjects = [];
		const objectElements = objectGroupEl.querySelectorAll('object');

		for (const objectEl of objectElements) {
			const x = parseFloat(objectEl.getAttribute('x'));
			const y = parseFloat(objectEl.getAttribute('y'));
			const width = parseFloat(objectEl.getAttribute('width') || '0');
			const height = parseFloat(objectEl.getAttribute('height') || '0');

			const collisionObj = {
				x,
				y,
				width,
				height
			};

			// Check for polygon/polyline
			const polygonEl = objectEl.querySelector('polygon');
			const polylineEl = objectEl.querySelector('polyline');

			if (polygonEl) {
				collisionObj.polygon = this.parsePoints(polygonEl.getAttribute('points'));
			} else if (polylineEl) {
				collisionObj.polyline = this.parsePoints(polylineEl.getAttribute('points'));
			}

			collisionObjects.push(collisionObj);
		}

		return collisionObjects;
	}

	parseWangSet(wangSetEl, tileset) {
		const name = wangSetEl.getAttribute('name');
		const type = wangSetEl.getAttribute('type'); // 'corner' or 'edge'

		const wangSet = {
			name,
			type,
			colors: [],
			tiles: {}
		};

		// Parse Wang colors
		const colorElements = wangSetEl.querySelectorAll('wangcolor');
		for (const colorEl of colorElements) {
			wangSet.colors.push({
				name: colorEl.getAttribute('name'),
				color: colorEl.getAttribute('color'),
				tile: parseInt(colorEl.getAttribute('tile') || '-1'),
				probability: parseFloat(colorEl.getAttribute('probability') || '1')
			});
		}

		// Parse Wang tiles
		const tileElements = wangSetEl.querySelectorAll('wangtile');
		for (const tileEl of tileElements) {
			const tileId = parseInt(tileEl.getAttribute('tileid'));
			const wangId = tileEl.getAttribute('wangid').split(',').map(v => parseInt(v));

			wangSet.tiles[tileId] = {
				tileId,
				wangId,
				globalId: tileId + tileset.firstgid
			};
		}

		return wangSet;
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
		for (const obj of mapData.objects) {
			if (obj.type === 'ZONE' && obj.properties) {
				const zoneType = obj.properties.zoneType || 'REST';

				mapData.zones.push({
					id: obj.name || `zone_${obj.id}`,
					type: zoneType,
					bounds: {
						x: obj.x,
						y: obj.y,
						width: obj.width,
						height: obj.height
					},
					properties: {
						visible: obj.properties.visible !== false,
						strength: obj.properties.strength || 1.0,
						...obj.properties
					}
				});
			}
		}
	}

	createSpawnsFromObjects(mapData) {
		for (const obj of mapData.objects) {
			if (obj.type === 'SPAWN' && obj.properties) {
				const spawnType = obj.properties.spawnType || 'myte';

				if (spawnType === 'myte') {
					mapData.spawns.myte = { x: obj.x, y: obj.y };
				} else if (spawnType === 'item') {
					mapData.spawns.items.push({ x: obj.x, y: obj.y });
				}
			}
		}
	}

	renderMap(mapData, container) {
		if (!mapData || !container) return null;

		// Create layers container
		const layersContainer = document.createElement('div');
		layersContainer.className = 'layer tile-map';

		container.appendChild(layersContainer);

		const renderedLayers = {};

		// Create and render each layer
		for (const layer of mapData.TileData.layers) {
			if (!layer.visible) continue;

			const layerElement = document.createElement('div');
			layerElement.className = `tile-layer ${layer.name.toLowerCase().replace(/\s+/g, '-')}`;
			layerElement.style.opacity = layer.opacity.toString();

			// Render tiles
			this.renderTileLayer(layer, mapData.TileData, layerElement);

			layersContainer.appendChild(layerElement);
			renderedLayers[layer.name] = layerElement;
		}

		return {
			container: layersContainer,
			layers: renderedLayers
		};
	}

	renderTileLayer(layer, mapData, container) {
		const { tileWidth, tileHeight, width: mapWidth } = mapData;

		layer.data.forEach((gid, index) => {
			if (gid === 0) return; // Skip empty tiles

			// Calculate tile position
			const x = (index % mapWidth) * tileWidth;
			const y = Math.floor(index / mapWidth) * tileHeight;

			// Find tileset for this gid
			const tilesetInfo = this.findTilesetForGid(gid, mapData.tilesets);
			if (!tilesetInfo) return;

			// Calculate tile position in the tileset image
			const localId = gid - tilesetInfo.firstgid;
			const tilesetColumns = tilesetInfo.columns;
			const tilesetX = (localId % tilesetColumns) * tileWidth;
			const tilesetY = Math.floor(localId / tilesetColumns) * tileHeight;

			// Create tile element
			const tileElement = document.createElement('div');
			tileElement.className = 'tile';
			tileElement.style.left = `${x}px`;
			tileElement.style.top = `${y}px`;
			tileElement.style.width = `${tileWidth}px`;
			tileElement.style.height = `${tileHeight}px`;
			tileElement.style.backgroundImage = `url(${tilesetInfo.imageSource})`;
			tileElement.style.backgroundPosition = `-${tilesetX}px -${tilesetY}px`;

			container.appendChild(tileElement);

			// Add tile properties as data attributes
			const tileProperties = this.getTileProperties(gid, mapData.tilesets);
			if (tileProperties) {
				for (const [key, value] of Object.entries(tileProperties)) {
					tileElement.dataset[key] = value.toString();
				}
			}
		});
	}

	findTilesetForGid(gid, tilesets) {
		let result = null;

		// Find the tileset with the highest firstgid that's less than or equal to gid
		tilesets.forEach(tileset => {
			if (gid >= tileset.firstgid &&
				(result === null || tileset.firstgid > result.firstgid)) {
				result = tileset;
			}
		});

		return result;
	}

	getTileProperties(gid, tilesets) {
		const tileset = this.findTilesetForGid(gid, tilesets);
		if (!tileset) return null;

		const localId = gid - tileset.firstgid;
		const tileInfo = tileset.tiles[localId];

		return tileInfo?.properties || null;
	}

	createCollisionData(mapData, collisionLayerName = 'Collider') {
		const collisionLayer = mapData.TileData.layers.find(l => l.name === collisionLayerName);
		if (!collisionLayer) return [];

		const colliders = [];
		const { tileWidth, tileHeight, width: mapWidth } = mapData.TileData;

		collisionLayer.data.forEach((gid, index) => {
			if (gid === 0) return; // Skip empty tiles

			// Calculate tile position
			const x = (index % mapWidth) * tileWidth;
			const y = Math.floor(index / mapWidth) * tileHeight;

			// Create a collider for this tile
			colliders.push({
				x,
				y,
				width: tileWidth,
				height: tileHeight,
				tileId: gid,
				properties: this.getTileProperties(gid, mapData.TileData.tilesets)
			});
		});

		return this.optimizeColliders(colliders);
	}

	optimizeColliders(colliders) {
		if (colliders.length <= 1) return colliders;

		// First pass: merge horizontally adjacent colliders of the same height
		const horizontallyMerged = this.mergeCollidersHorizontally(colliders);

		// Second pass: merge vertically adjacent colliders of the same width
		const fullyMerged = this.mergeCollidersVertically(horizontallyMerged);

		return fullyMerged;
	}

	mergeCollidersHorizontally(colliders) {
		// Sort colliders by y, then x
		const sorted = [...colliders].sort((a, b) => {
			if (a.y === b.y) return a.x - b.x;
			return a.y - b.y;
		});

		const result = [];
		let current = { ...sorted[0] };

		for (let i = 1; i < sorted.length; i++) {
			const next = sorted[i];

			// If the next collider is horizontally adjacent and has the same height and y position
			if (next.y === current.y &&
				next.height === current.height &&
				next.x === current.x + current.width) {
				// Merge them
				current.width += next.width;
			} else {
				// Add the current merged collider to the result and start a new one
				result.push(current);
				current = { ...next };
			}
		}

		// Add the last collider
		result.push(current);

		return result;
	}

	mergeCollidersVertically(colliders) {
		// Sort colliders by x, then y
		const sorted = [...colliders].sort((a, b) => {
			if (a.x === b.x) return a.y - b.y;
			return a.x - b.x;
		});

		const result = [];
		let current = { ...sorted[0] };

		for (let i = 1; i < sorted.length; i++) {
			const next = sorted[i];

			// If the next collider is vertically adjacent and has the same width and x position
			if (next.x === current.x &&
				next.width === current.width &&
				next.y === current.y + current.height) {
				// Merge them
				current.height += next.height;
			} else {
				// Add the current merged collider to the result and start a new one
				result.push(current);
				current = { ...next };
			}
		}

		// Add the last collider
		result.push(current);

		return result;
	}

	generateGridData(mapData, gridConfig = {}) {
		const { tileWidth, tileHeight, width, height } = mapData.TileData;
		const collisionLayerName = gridConfig.collisionLayer || 'Collider';

		// Find the collision layer
		const collisionLayer = mapData.TileData.layers.find(l => l.name === collisionLayerName);
		if (!collisionLayer) {
			console.warn(`Collision layer "${collisionLayerName}" not found. Grid will be fully walkable.`);
		}

		// Determine cell size for the grid
		const cellSize = gridConfig.cellSize || tileWidth;

		// Calculate grid dimensions
		const gridWidth = Math.ceil(mapData.dimensions.width / cellSize);
		const gridHeight = Math.ceil(mapData.dimensions.height / cellSize);

		// Create grid cells
		const grid = [];
		for (let x = 0; x < gridWidth; x++) {
			grid[x] = [];
			for (let y = 0; y < gridHeight; y++) {
				grid[x][y] = {
					x: x * cellSize,
					y: y * cellSize,
					walkable: true,
					objects: new Set()
				};
			}
		}

		// Mark cells as unwalkable based on collision layer
		if (collisionLayer) {
			for (let y = 0; y < height; y++) {
				for (let x = 0; x < width; x++) {
					const index = y * width + x;
					const gid = collisionLayer.data[index];

					

					if (gid !== 0) {
						// This tile has collision, mark the corresponding grid cells as unwalkable
						const tileX = x * tileWidth;
						const tileY = y * tileHeight;

						

						// Mark grid cells covered by this tile
						this.markGridCellsUnwalkable(grid, tileX, tileY, tileWidth, tileHeight, cellSize);
					}
				}
			}
		}

		return {
			grid,
			width: gridWidth,
			height: gridHeight,
			cellSize: cellSize
		};
	}
	markGridCellsUnwalkable(grid, tileX, tileY, tileWidth, tileHeight, cellSize) {
		// Calculate the grid cell range this tile covers
		const startGridX = Math.floor(tileX / cellSize);
		const startGridY = Math.floor(tileY / cellSize);
		const endGridX = Math.ceil((tileX + tileWidth) / cellSize);
		const endGridY = Math.ceil((tileY + tileHeight) / cellSize);

		// Mark cells as unwalkable
		for (let gridX = startGridX; gridX < endGridX; gridX++) {
			for (let gridY = startGridY; gridY < endGridY; gridY++) {
				if (gridX >= 0 && gridX < grid.length &&
					gridY >= 0 && gridY < grid[0].length) {
					grid[gridX][gridY].walkable = false;
				}
			}
		}
	}
	createMapCanvas(mapData) {
		const { tileWidth, tileHeight, width, height } = mapData.TileData;
		const { layers, tilesets } = mapData.TileData;

		// Create a canvas
		const canvas = document.createElement('canvas');
		canvas.width = width * tileWidth;
		canvas.height = height * tileHeight;

		const ctx = canvas.getContext('2d');

		// Load all tileset images
		const tilesetImages = {};
		const loadTilesetImages = async () => {
			for (const tileset of tilesets) {
				if (tileset.imageSource) {
					const img = new Image();
					img.src = tileset.imageSource;
					await new Promise(resolve => {
						img.onload = resolve;
						img.onerror = resolve; // Continue even if image fails to load
					});
					tilesetImages[tileset.name] = img;
				}
			}
		};

		// Render layers
		const renderLayers = () => {
			// Render only visible, non-collision layers
			const visibleLayers = layers.filter(
				layer => layer.visible && layer.name !== 'Collider'
			);

			for (const layer of visibleLayers) {
				if (layer.opacity < 1) {
					ctx.globalAlpha = layer.opacity;
				}

				// Render each tile
				layer.data.forEach((gid, index) => {
					if (gid === 0) return; // Skip empty tiles

					// Calculate tile position
					const x = (index % width) * tileWidth;
					const y = Math.floor(index / width) * tileHeight;

					// Find tileset for this gid
					const tileset = this.findTilesetForGid(gid, tilesets);
					if (!tileset || !tilesetImages[tileset.name]) return;

					// Calculate position in the tileset image
					const localId = gid - tileset.firstgid;
					const tilesetColumns = tileset.columns;
					const tilesetX = (localId % tilesetColumns) * tileWidth;
					const tilesetY = Math.floor(localId / tilesetColumns) * tileHeight;

					// Draw the tile
					ctx.drawImage(
						tilesetImages[tileset.name],
						tilesetX, tilesetY, tileWidth, tileHeight,
						x, y, tileWidth, tileHeight
					);
				});

				// Reset global alpha
				ctx.globalAlpha = 1;
			}
		};

		// Return a promise that resolves with the canvas
		return new Promise(async (resolve) => {
			await loadTilesetImages();
			renderLayers();
			resolve(canvas);
		});
	}

	async createMapBackgroundUrl(mapData) {
		try {
			const canvas = await this.createMapCanvas(mapData);
			return canvas.toDataURL('image/png');
		} catch (e) {
			console.error('Error creating map background:', e);
			return null;
		}
	}
	
	convertToGameMapFormat(TileMapData) {
		// Create base map structure
		const gameMapData = {
			id: TileMapData.id,
			name: TileMapData.name,
			description: TileMapData.description || `A ${TileMapData.environment.location} map`,
			dimensions: TileMapData.dimensions,
			environment: TileMapData.environment,
			background: {
				color: '#f0f0f0' // Default background color
			},
			spawns: TileMapData.spawns,
			zones: TileMapData.zones || [],
			objects: [], // Initialize with empty array instead of TileMapData.objects
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
				type: obj.properties?.type || obj.name || 'UNKNOWN',
				variant: obj.properties?.variant || 'default',
				x: obj.x,
				y: obj.y,
				properties: obj.properties || {}
			});
		}
	
		return gameMapData;
	}




}