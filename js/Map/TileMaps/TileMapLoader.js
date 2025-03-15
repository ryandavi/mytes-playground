// TileMapLoader.js - A class to load and parse Tiled TMX and TSX files
class TileMapLoader {
	constructor(parent) {
		this.parent = parent;
		this.tilesets = new Map(); // Store loaded tilesets
		this.maps = new Map(); // Store loaded maps
		this.currentMapData = null; // Track current map data
        
        // Canvas elements for rendering
        this.layerCanvases = new Map(); // Store canvases for each layer
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

			// Create zones from object groups with specific names
			this.createZonesFromObjects(mapData);

			// Create spawns from objects with specific names
			this.createSpawnsFromObjects(mapData);

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

	async applyToGameMap(gameMap, mapData) {
		if (!gameMap || !mapData) return;

		// Set dimensions
		gameMap.dimensions = mapData.dimensions;

		// Set background from map
		const bgUrl = await this.createMapBackgroundUrl(mapData);
		if (bgUrl) {
			gameMap.setBackground({
				url: bgUrl,
				color: mapData.background?.color || '#f0f0f0'
			});
		} else if (mapData.background) {
			gameMap.setBackground(mapData.background);
		}

		// Generate grid data for the GridSystem
		const gridData = this.generateGridData(mapData, {
			cellSize: gameMap.gridSystem?.config?.cellSize || 32,
			collisionLayer: 'Collider'
		});

		// Update the grid system
		if (gameMap.gridSystem) {
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
				// External tileset - fetch the TSX file
				const response = await fetch(tilesetPath);
				if (!response.ok) throw new Error(`Failed to load tileset: ${response.status}`);
				const text = await response.text();
				
				// Parse the XML
				const parser = new DOMParser();
				const xmlDoc = parser.parseFromString(text, "text/xml");
				tilesetData = xmlDoc.querySelector('tileset');
			} else {
				// Embedded tileset - use the provided element
				tilesetData = tilesetEl;
			}

			if (!tilesetData) throw new Error('Invalid tileset data');

			// Basic tileset info
			const tileset = {
				name: tilesetData.getAttribute('name'),
				tileWidth: parseInt(tilesetData.getAttribute('tilewidth')),
				tileHeight: parseInt(tilesetData.getAttribute('tileheight')),
				tileCount: parseInt(tilesetData.getAttribute('tilecount')),
				columns: parseInt(tilesetData.getAttribute('columns')),
				firstgid,
				tiles: {},
				imageSource: '',
				imageWidth: 0,
				imageHeight: 0
			};

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
				tileset.tiles[id] = {
					id,
					properties: this.parseProperties(tileEl.querySelector('properties'))
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

	// OPTIMIZED: Render map using canvas instead of DOM elements
	renderMap(mapData, container) {
		if (!mapData || !container) return null;

		// Clear any existing layer canvases
		this.clearLayerCanvases();

		// Create layers container
		const layersContainer = document.createElement('div');
		layersContainer.className = 'layer tile-map';
		container.appendChild(layersContainer);

		const renderedLayers = {};

		// Create and render each layer
		for (const layer of mapData.TileData.layers) {
			if (!layer.visible) continue;

			// Create a canvas for this layer
			const canvas = document.createElement('canvas');
			canvas.width = mapData.dimensions.width;
			canvas.height = mapData.dimensions.height;
			canvas.className = `tile-layer ${layer.name.toLowerCase().replace(/\s+/g, '-')}`;
			canvas.style.opacity = layer.opacity.toString();
			canvas.style.position = 'absolute';
			canvas.style.top = '0';
			canvas.style.left = '0';

			// Render tiles to canvas
			this.renderTileLayerToCanvas(layer, mapData.TileData, canvas);

			layersContainer.appendChild(canvas);
			renderedLayers[layer.name] = canvas;
			
			// Store the canvas for later updates
			this.layerCanvases.set(layer.name, canvas);
		}

		return {
			container: layersContainer,
			layers: renderedLayers
		};
	}

	// Render tile layer to canvas instead of creating DOM elements
	renderTileLayerToCanvas(layer, mapData, canvas) {
		const ctx = canvas.getContext('2d');
		const { tileWidth, tileHeight, width: mapWidth } = mapData;

		// Create a promise to load all tileset images
		const loadTilesetImages = async () => {
			const tilesetImages = new Map();
			
			for (const tileset of mapData.tilesets) {
				if (tileset.imageSource) {
					// Check if image is already cached by ResourceManager
					let img = this.parent.parent?.resourceManager?.getSprite(tileset.name);
					
					if (!img) {
						// Load the image if not cached
						img = await new Promise((resolve) => {
							const image = new Image();
							image.onload = () => resolve(image);
							image.onerror = () => resolve(null);
							image.src = tileset.imageSource;
						});
                        
						// Cache it for future use if ResourceManager exists
						if (this.parent.parent?.resourceManager && img) {
							this.parent.parent.resourceManager.sprites.set(tileset.name, img);
						}
					}
					
					if (img) {
						tilesetImages.set(tileset.name, img);
					}
				}
			}
			
			return tilesetImages;
		};

		// Render tiles once images are loaded
		loadTilesetImages().then(tilesetImages => {
			// Clear canvas first
			ctx.clearRect(0, 0, canvas.width, canvas.height);
			
			// Only render the layer if the opacity is visible
			if (layer.opacity <= 0) return;
			
			// Apply layer opacity
			ctx.globalAlpha = layer.opacity;
			
			// Render each tile in the layer
			layer.data.forEach((gid, index) => {
				if (gid === 0) return; // Skip empty tiles
				
				// Calculate tile position
				const x = (index % mapWidth) * tileWidth;
				const y = Math.floor(index / mapWidth) * tileHeight;
				
				// Find tileset for this gid
				const tilesetInfo = this.findTilesetForGid(gid, mapData.tilesets);
				if (!tilesetInfo) return;
				
				// Get the image for this tileset
				const tilesetImage = tilesetImages.get(tilesetInfo.name);
				if (!tilesetImage) return;
				
				// Calculate tile position in the tileset image
				const localId = gid - tilesetInfo.firstgid;
				const tilesetColumns = tilesetInfo.columns;
				const tilesetX = (localId % tilesetColumns) * tileWidth;
				const tilesetY = Math.floor(localId / tilesetColumns) * tileHeight;
				
				// Draw the tile to canvas
				ctx.drawImage(
					tilesetImage,
					tilesetX, tilesetY,
					tileWidth, tileHeight,
					x, y,
					tileWidth, tileHeight
				);
			});
			
			// Reset global alpha
			ctx.globalAlpha = 1;
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

	// Creating a background image from the map for the full view
	async createMapBackgroundUrl(mapData) {
		try {
			const { tileWidth, tileHeight, width, height } = mapData.TileData;
			const { layers, tilesets } = mapData.TileData;

			// Create a canvas
			const canvas = document.createElement('canvas');
			canvas.width = width * tileWidth;
			canvas.height = height * tileHeight;

			const ctx = canvas.getContext('2d');

			// Load all tileset images
			const tilesetImages = {};
			
			for (const tileset of tilesets) {
				if (tileset.imageSource) {
					// First try to get from ResourceManager
					let img = this.parent.parent?.resourceManager?.getSprite(tileset.name);
					
					if (!img) {
						img = new Image();
						img.src = tileset.imageSource;
						await new Promise(resolve => {
							img.onload = resolve;
							img.onerror = resolve; // Continue even if image fails to load
						});
					}
					
					tilesetImages[tileset.name] = img;
				}
			}

			// Render visible, non-collision layers to the canvas
			const visibleLayers = layers.filter(
				layer => layer.visible // && layer.name !== 'Collider'
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

			return canvas.toDataURL('image/png');
		} catch (e) {
			console.error('Error creating map background:', e);
			return null;
		}
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
			objects: [], // Initialize with empty array
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
	
	// Update existing layer canvases
	updateLayerCanvas(layerName) {
		const canvas = this.layerCanvases.get(layerName);
		if (!canvas) return;
		
		// Get the current map data
		const mapData = this.currentMapData;
		if (!mapData) return;
		
		// Find the layer data
		const layer = mapData.TileData.layers.find(l => l.name === layerName);
		if (!layer) return;
		
		// Rerender the layer
		this.renderTileLayerToCanvas(layer, mapData.TileData, canvas);
	}
	
	// Clear all layer canvases
	clearLayerCanvases() {
		this.layerCanvases.forEach((canvas, layerName) => {
			const ctx = canvas.getContext('2d');
			ctx.clearRect(0, 0, canvas.width, canvas.height);
		});
	}
	
	// Dispose resources
	dispose() {
		// Clear canvases
		this.clearLayerCanvases();
		this.layerCanvases.clear();
		
		// Clear current map data
		this.currentMapData = null;
	}
}