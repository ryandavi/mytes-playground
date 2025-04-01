// TileMapLoader.js - A class to load and parse Tiled TMX and TSX files with terrain support
class TileMapLoader {
	constructor(parent) {
		this.parent = parent;
		this.tilesets = new Map(); // Store loaded tilesets
		this.maps = new Map(); // Store loaded maps
		this.currentMapData = null; // Track current map data

		// Canvas elements for rendering
		this.layerCanvases = new Map(); // Store canvases for each layer

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

			// Create zones from object groups with specific names
			this.createZonesFromObjects(mapData);

			// Create spawns from objects with specific names
			this.createSpawnsFromObjects(mapData);
			

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

	async applyToGameMap(gameMap, mapData) {
		if (!gameMap || !mapData) return;

		// Set dimensions
		gameMap.dimensions = mapData.dimensions;
		gameMap.name = mapData.name;
		gameMap.id = mapData.id;

		gameMap.displayName = mapData.displayName;

		gameMap.description = mapData.description;
		gameMap.location = mapData.environment.location;

		console.log('Tile map dimensions:', gameMap.dimensions);

		// set canvas
		this.parent.parent.canvas.style.width = `${gameMap.dimensions.width}px`;
		this.parent.parent.canvas.style.height = `${gameMap.dimensions.height}px`;

		for (const layer of Object.values(this.parent.layers)) {
			if (layer) { // Ensure the layer exists before modifying it
				//layer.style.width = `${gameMap.dimensions.width}px`;
				//layer.style.height = `${gameMap.dimensions.height}px`;
			}
		}

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
			console.log("mapData.zones", mapData.zones);
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

		// set myte position to spawn point
		// get first myte
		let mytes = this.parent.parent.mytes;
		console.log(mytes.length);
		if (mytes.length > 0) {
			let myte = mytes[0];
			myte.setWrapperPosition(mapData.spawns.myte.x, mapData.spawns.myte.y);
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

		// Apply terrain data to pathfinding after objects have been added
		this.applyTerrainToGameMap(gameMap, mapData);
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
			console.log(`Found ${tileElements.length} tile elements in tileset ${tileset.name}`);
			
			for (const tileEl of tileElements) {
				const id = parseInt(tileEl.getAttribute('id'));
				const propsEl = tileEl.querySelector('properties');
				const props = this.parseProperties(propsEl);
				
				// Add debugging to see what properties we're finding
				if (props) {
					console.log(`Tile #${id} properties:`, props);
				}
				
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
		
		console.log(`Found ${propertyElements.length} properties`);
	
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
	
			// Debug the property being parsed
			console.log(`Parsing property: ${name}=${value} (type: ${type})`);
	
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

	/**
	 * Parse treasure chest item definitions from a string format
	 */
	parseItems(str) {
		// Clean up the string
		const cleanString = str.trim().replace(/\n/g, '');

		// Split by commas that are followed by an open brace
		const itemStrings = cleanString.split(/,(?=\s*{)/);

		return itemStrings.map(itemStr => {
			// Remove curly braces and split by commas
			const parts = itemStr.replace(/[{}]/g, '').split(',').map(part => part.trim());

			// Process each part to handle quotes and convert types
			const processedParts = parts.map(part => {
				// Remove quotes if present
				let processed = part.replace(/^["']|["']$/g, '');

				// Check if it's a range (e.g., "10-20")
				if (/^\d+\s*-\s*\d+$/.test(processed)) {
					const [min, max] = processed.split('-').map(Number);
					return [min, max]; // Return as array of two numbers
				}

				// Try to parse as number if possible
				if (!isNaN(processed) && processed !== '') {
					return Number(processed);
				}

				return processed;
			});

			// Create structured object with default values
			const result = {
				type: processedParts[0],
				variant: processedParts[1],
				quantity: processedParts[2] !== undefined ? processedParts[2] : 1,
				probability: processedParts[3] !== undefined ? processedParts[3] : 1
			};

			return result;
		});
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
			if (obj.name.toUpperCase() == 'ZONE' && obj.properties) {
				const type = obj.properties.type.toUpperCase() || 'REST';

				mapData.zones.push({
					id: `zone_${obj.properties.displayName.toLowerCase().replace(/[^a-zA-Z0-9]/g, '_')}`,
					type: type,
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

				return false; // Remove from objects
			}
			return true; // Keep in objects
		});
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
		
		console.log("[TileMapLoader] Extracting terrain types from tilesets");
	
		// Process each tileset to check for terrain properties
		mapData.tilesets.forEach(tileset => {
			// Debug the tileset to ensure tiles are loaded correctly
			console.log(`Processing tileset: ${tileset.name} with ${Object.keys(tileset.tiles || {}).length} tiles`);
			
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
					
					// More detailed logging for troubleshooting
					console.log(`Mapped tile ${tileset.name}:${tileIdStr} (global ID: ${globalTileId}) terrain:'${terrain}' to type: ${terrainType}`);
				}
			});
		});
	
		console.log(`[TileMapLoader] Extracted ${terrainTypes.size} terrain mappings`);
		return terrainTypes;
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

	/**
	 * Enhanced grid data generation with terrain types
	 */

generateGridData(mapData, gridConfig = {}) {
    const { tileWidth, tileHeight, width, height } = mapData.TileData;
    
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
                swimmable: false,
                conditionallyWalkable: false,
                conditionType: null, // 'door', 'gate', etc.
                conditionId: null,   // ID to reference the specific condition object
                objects: new Set(),
                terrainType: GridSystem.defaultTerrain // Default terrain type
            };
        }
    }

    // Process all tile layers to check for collision properties and terrain types
    const layers = mapData.TileData.layers.filter(layer => layer.visible);
    
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const tileX = x * tileWidth;
            const tileY = y * tileHeight;
            const index = y * width + x;
            
            // Process each visible layer from bottom to top
            for (const layer of layers) {
                const gid = layer.data[index];
                
                // Skip empty tiles
                if (gid === 0) continue;
                
                // Find tileset for this gid
                const tileset = this.findTilesetForGid(gid, mapData.TileData.tilesets);
                if (!tileset) continue;
                
                // Calculate the local tile ID within the tileset
                const localId = gid - tileset.firstgid;
                
                // Get tile properties from the tileset
                const tileProps = tileset.tiles[localId]?.properties;
                
                if (tileProps) {
                    // Check for collision property
                    if (tileProps.type === 'collider') {
                        // Check if it's a door or other conditional collider
                        if (tileProps.conditionType === 'door' || tileProps.interactive === 'door') {
                            this.markGridCellsConditional(grid, tileX, tileY, tileWidth, tileHeight, cellSize, 'door', tileProps.conditionId || tileProps.id);
                        } else {
                            this.markGridCellsUnwalkable(grid, tileX, tileY, tileWidth, tileHeight, cellSize);
                        }
                    }
                    
                    // Check for terrain type
                    if (tileProps.terrain || tileProps.terrainType) {
                        const terrainType = this.terrainMapping[tileProps.terrain?.toLowerCase() || 
                                                                tileProps.terrainType?.toLowerCase()] || 
                                            GridSystem.defaultTerrain;
                        
                        this.applyTerrainTypeToGridCells(grid, tileX, tileY, tileWidth, tileHeight, cellSize, terrainType);
                        
                        // Mark water tiles as swimmable
                        if (terrainType === 'shallow_water' || terrainType === 'deep_water') {
                            this.markGridCellsSwimmable(grid, tileX, tileY, tileWidth, tileHeight, cellSize);
                        }
                    }
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


markGridCellsSwimmable(grid, tileX, tileY, tileWidth, tileHeight, cellSize) {
    // Calculate the grid cell range this tile covers
    const startGridX = Math.floor(tileX / cellSize);
    const startGridY = Math.floor(tileY / cellSize);
    const endGridX = Math.ceil((tileX + tileWidth) / cellSize);
    const endGridY = Math.ceil((tileY + tileHeight) / cellSize);

    // Mark cells as swimmable
    for (let gridX = startGridX; gridX < endGridX; gridX++) {
        for (let gridY = startGridY; gridY < endGridY; gridY++) {
            if (gridX >= 0 && gridX < grid.length &&
                gridY >= 0 && gridY < grid[0].length) {
                grid[gridX][gridY].swimmable = true;
            }
        }
    }
}

// Add a new method to mark grid cells as conditionally walkable
markGridCellsConditional(grid, tileX, tileY, tileWidth, tileHeight, cellSize, conditionType, conditionId) {
    // Calculate the grid cell range this tile covers
    const startGridX = Math.floor(tileX / cellSize);
    const startGridY = Math.floor(tileY / cellSize);
    const endGridX = Math.ceil((tileX + tileWidth) / cellSize);
    const endGridY = Math.ceil((tileY + tileHeight) / cellSize);

    // Mark cells as conditionally walkable
    for (let gridX = startGridX; gridX < endGridX; gridX++) {
        for (let gridY = startGridY; gridY < endGridY; gridY++) {
            if (gridX >= 0 && gridX < grid.length &&
                gridY >= 0 && gridY < grid[0].length) {
                grid[gridX][gridY].walkable = false; // Initially not walkable
                grid[gridX][gridY].conditionallyWalkable = true;
                grid[gridX][gridY].conditionType = conditionType;
                grid[gridX][gridY].conditionId = conditionId;
            }
        }
    }
}



	/**
	* Apply terrain type to grid cells covered by a tile
	*/
	applyTerrainTypeToGridCells(grid, tileX, tileY, tileWidth, tileHeight, cellSize, terrainType) {
		// Calculate the grid cell range this tile covers
		const startGridX = Math.floor(tileX / cellSize);
		const startGridY = Math.floor(tileY / cellSize);
		const endGridX = Math.ceil((tileX + tileWidth) / cellSize);
		const endGridY = Math.ceil((tileY + tileHeight) / cellSize);

		// Apply terrain type to cells
		for (let gridX = startGridX; gridX < endGridX; gridX++) {
			for (let gridY = startGridY; gridY < endGridY; gridY++) {
				if (gridX >= 0 && gridX < grid.length &&
					gridY >= 0 && gridY < grid[0].length) {
					grid[gridX][gridY].terrainType = terrainType;
				}
			}
		}
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
					grid[gridX][gridY].tileWalkable = false; // Mark as unwalkable due to tile
				}
			}
		}
	}

	/**
	* Apply terrain data to pathfinding
	*/
	applyTerrainToGameMap(gameMap, mapData) {
		// Apply terrain data to grid system if it exists
		if (gameMap.gridSystem && gameMap.gridSystem.pathfinder) {
			console.log("[TileMapLoader] Applying terrain types to pathfinder");
	
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
			this.applyObjectTerrainModifiers(gameMap);
			
			// Update pathfinder to check if entity can swim when calculating paths
			if (gameMap.gridSystem.pathfinder.setTerrainCosts) {
				const originalIsWalkable = gameMap.gridSystem.pathfinder.isWalkable;
				
				// Override isWalkable to check swimming ability and conditional walkability
				gameMap.gridSystem.pathfinder.isWalkable = function(x, y, entity) {
					const node = this.grid.getNodeAt(x, y);
					if (!node) return false;
					
					// If it's a water tile, check if entity can swim
					if (!node.walkable && node.swimmable) {
						return entity && entity.canSwim === true;
					}
					
					// If it's a conditionally walkable tile (like a door), check the condition
					if (!node.walkable && node.conditionallyWalkable) {
						if (node.conditionType === 'door') {
							// Get the door object using conditionId
							const door = gameMap.getObjectById(node.conditionId);
							// Check if door exists and is open
							return door && door.isOpen === true;
						}
						// Add more condition types as needed
					}
					
					// Otherwise use the original walkable check
					return node.walkable;
				};
				
				// Update terrain costs
				gameMap.gridSystem.pathfinder.setTerrainCosts(customTerrainCosts);
			}
		}
	}
	/**
	* Check for objects that modify terrain and apply their effects
	*/
	applyObjectTerrainModifiers(gameMap) {
		if (!gameMap || !gameMap.gridSystem) return;

		const grid = gameMap.gridSystem.grid;

		// Check all map objects for terrain modifiers
		gameMap.objects.forEach(obj => {
			if (!obj.type) return;

			// Check if this object type modifies terrain
			const terrainType = this.terrainModifiers[obj.type.toUpperCase()];
			if (!terrainType) return;

			// Calculate grid cells covered by this object
			const objX = Math.floor(obj.posX / gameMap.gridSystem.config.cellSize);
			const objY = Math.floor(obj.posY / gameMap.gridSystem.config.cellSize);
			const objWidth = Math.ceil(obj.size.width / gameMap.gridSystem.config.cellSize);
			const objHeight = Math.ceil(obj.size.height / gameMap.gridSystem.config.cellSize);

			// Apply terrain type to these cells
			for (let x = objX; x < objX + objWidth; x++) {
				for (let y = objY; y < objY + objHeight; y++) {
					if (x >= 0 && x < grid.length &&
						y >= 0 && y < grid[x].length) {

						// Store the original terrain type if not already set
						if (!grid[x][y].originalTerrainType) {
							grid[x][y].originalTerrainType = grid[x][y].terrainType;
						}

						// Apply the new terrain type
						grid[x][y].terrainType = terrainType;

						// Store reference to the modifying object
						grid[x][y].terrainModifier = obj;
					}
				}
			}

			// Set terrain type on the object itself for reference
			obj.terrainType = terrainType;
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