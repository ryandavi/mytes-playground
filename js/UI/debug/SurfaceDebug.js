// SurfaceDebug — console tooling for the two systems that answer "which room
// owns this piece of the world": wall paint surfaces and room floors.
//
// Both are made of slices smaller than a cell — a junction cell draws up to
// four wall surfaces, and a floor stops on the CENTRELINE of the wall beside
// it — so "what colour is cell 12,3" is not a question either system can be
// asked from the outside. This asks it from the inside.
//
// Usage from DevTools console:
//   __surfaces.cell(12, 3)          // wall: mask, faces, and every painted slice
//   __surfaces.floor(14, 0)         // floor: which room owns each quarter of a cell
//   __surfaces.stretch(12, 3, 4)    // what one paint stroke at that pixel would cover
//   __surfaces.audit()              // every quarter-cell two rooms both claim, or neither
//   __surfaces.overlay()            // draw all of the above ON the map
//   __surfaces.overlay(false)       // take it back off
//   __surfaces.pick()               // click a bad floor edge; copies its report
//   __surfaces.download()           // the whole lot as JSON, for a bug report
//
// Coordinates are CELLS everywhere (x, y), never pixels — that is how the wall
// data, the room tilemasks and the Tiled map all index the world.

const SurfaceDebug = {
	// Quarter of a cell: the finest slice either system produces, since a wall's
	// half-cell post and a floor's half-cell bleed both land on a 16px line.
	QUARTER: 4,

	_map() {
		const map = MyteCore.instance?.getFirstContainer?.()?.gameMap;
		if (!map) throw new Error('[SurfaceDebug] Game not initialized');
		return map;
	},

	_walls() {
		const builder = this._map().wallBuilder;
		if (!builder) throw new Error('[SurfaceDebug] This map has no walls');
		return builder;
	},

	get cellSize() {
		return this._map().gridSystem?.config?.cellSize || 32;
	},

	// ── Walls ────────────────────────────────────────────────────────────────

	/**
	 * One wall cell, as the renderer sees it: the neighbour mask, the room each
	 * of its four faces looks into, and the slices it actually draws.
	 *
	 * `slices` is the answer to "why is that quarter the wrong colour": each one
	 * names the pixels it covers, whether it is the head-on band of an east-west
	 * wall or the post of a north-south one, and which room's paint it is
	 * wearing.
	 */
	cell(x, y) {
		const builder = this._walls();
		const raw = builder.cells.get(`${x},${y}`);
		if (!raw) return { cell: `${x},${y}`, wall: false };

		const mask = builder.computeMask(raw);
		const cache = builder.gameMap?.buildTransaction?.cache;
		const topology = cache ? { ...cache.topology, walls: cache.geometry } : null;
		const faces = Object.fromEntries(BuildKeys.FACES.map(face => [face, [0, 1].map(half => {
			const classification = cache
				? WallFaceResolver.classify({ x, y, face, half }, cache.grid, topology)
				: { kind: 'buried' };
			return classification.kind === 'room' ? classification.roomId : classification.kind;
		})]));
		const piece = builder.findPieceForCell(x, y);
		return {
			cell: `${x},${y}`,
			wall: true,
			mask,
			connections: SurfaceDebug.maskName(mask),
			piece: piece?.id ?? null,
			construction: raw.constructionId,
			opening: raw.opening?.type ?? null,
			faces,
			slices: builder.getCellSurfaces(raw).map(surface => ({
				px: `${surface.from}-${surface.to}`,
				part: surface.axis === 'horizontal' ? 'band' : 'post',
				face: surface.face,
				room: surface.roomId || '(outside)',
				finish: surface.finishId
			}))
		};
	},

	/** Every cell of one rendered piece, in the order it draws them. */
	piece(id) {
		const piece = this._walls().findPieceById(id);
		if (!piece) return null;
		return {
			id: piece.id,
			cells: piece.cells.map(cell => this.cell(cell.x, cell.y))
		};
	},

	/**
	 * What one paint stroke would cover, clicking `offset` pixels into the cell.
	 *
	 * The offset matters and is not optional: clicking the left quarter of a
	 * junction and the right quarter of the same cell select two different
	 * walls, which is the whole point of the slices.
	 */
	stretch(x, y, offset = 0) {
		const builder = this._walls();
		const raw = builder.cells.get(`${x},${y}`);
		if (!raw) return { cell: `${x},${y}`, wall: false };

		const clicked = builder.getCellSurfaces(raw)
			.filter(surface => offset >= surface.from && offset < surface.to)
			.pop();
		if (!clicked) return { cell: `${x},${y}`, slice: null, covers: [] };

		return {
			cell: `${x},${y}`,
			slice: `${clicked.from}-${clicked.to} ${clicked.face}`,
			room: clicked.roomId || '(outside)',
			finish: clicked.finishId,
			covers: builder.getPaintStretchSurfaces(clicked)
				.map(surface => `${surface.cell.x},${surface.cell.y} [${surface.from}-${surface.to}] ${surface.finishId}`)
				.sort()
		};
	},

	/** Every wall cell that draws a slice of the given room's paint. */
	roomWalls(roomId) {
		const builder = this._walls();
		const rows = [];
		for (const cell of builder.cells.values()) {
			for (const surface of builder.getCellSurfaces(cell)) {
				if (surface.roomId !== roomId) continue;
				rows.push(`${cell.x},${cell.y} [${surface.from}-${surface.to}] ${surface.face} ${surface.finishId}`);
			}
		}
		return rows.sort();
	},

	// ── Floors ───────────────────────────────────────────────────────────────

	/**
	 * Which room's floor is painted on each quarter of a cell.
	 *
	 * A room's floor runs half a cell past its own edge so it ends under the
	 * middle of the wall beside it, which means the four quarters of one cell
	 * can honestly belong to four different rooms. Two rooms on one quarter is
	 * a bug — they are drawn on separate canvases, so which one you see is
	 * whichever happened to be appended last.
	 */
	floor(x, y) {
		const size = this.cellSize;
		const quarter = size / this.QUARTER;
		const rows = {};
		for (let row = 0; row < 2; row++) {
			for (let column = 0; column < 2; column++) {
				const name = `${row === 0 ? 'top' : 'bottom'}-${column === 0 ? 'left' : 'right'}`;
				rows[name] = this.floorOwnersAt(
					(x * size) + (column * size / 2) + quarter,
					(y * size) + (row * size / 2) + quarter
				);
			}
		}
		return {
			cell: `${x},${y}`,
			wall: this._map().wallBuilder?.cells?.has(`${x},${y}`) ?? false,
			room: this._map().regionManager?.innermostAt?.(
				(x + 0.5) * size, (y + 0.5) * size, 'room', size
			)?.id ?? null,
			quarters: Object.fromEntries(Object.entries(rows).map(([name, owners]) => [
				name,
				owners.length === 0 ? '(bare ground)' : owners.join(' + ')
			]))
		};
	},

	_floorPlanOwners() {
		const map = this._map();
		const ownership = map.floorBuilder?.computeOwnership?.() ?? new Map();
		const ownerByBlock = new Map();
		for (const [roomId, blocks] of ownership) {
			for (const [blockX, blockY] of blocks) ownerByBlock.set(`${blockX},${blockY}`, roomId);
		}
		return ownerByBlock;
	},

	/** The ownership plan before it is rasterized into separate room canvases. */
	floorPlan(x, y, ownerByBlock = this._floorPlanOwners()) {
		const perCell = FloorRenderer.BLOCKS_PER_CELL;
		const quarters = {};
		for (let row = 0; row < perCell; row++) {
			for (let column = 0; column < perCell; column++) {
				const name = `${row === 0 ? 'top' : 'bottom'}-${column === 0 ? 'left' : 'right'}`;
				const blockX = (x * perCell) + column;
				const blockY = (y * perCell) + row;
				quarters[name] = ownerByBlock.get(`${blockX},${blockY}`) ?? '(bare ground)';
			}
		}
		return quarters;
	},

	/** Everything needed to explain the four floor quarters of one cell. */
	inspectFloor(x, y) {
		const map = this._map();
		const size = this.cellSize;
		const wall = map.wallBuilder?.cells?.get(`${x},${y}`) ?? null;
		const rooms = map.regionManager?.all?.('room') ?? [];
		const planOwners = this._floorPlanOwners();
		const roomsAt = (column, row) => {
			const mapX = (x + (column === 0 ? 0.25 : 0.75)) * size;
			const mapY = (y + (row === 0 ? 0.25 : 0.75)) * size;
			return rooms.filter(room => room.contains(mapX, mapY)).map(room => room.id);
		};
		return {
			cell: `${x},${y}`,
			rendered: this.floor(x, y).quarters,
			planned: this.floorPlan(x, y, planOwners),
			containingRooms: {
				'top-left': roomsAt(0, 0),
				'top-right': roomsAt(1, 0),
				'bottom-left': roomsAt(0, 1),
				'bottom-right': roomsAt(1, 1)
			},
			wall: wall ? this.cell(x, y) : { wall: false },
			neighbours: Object.fromEntries(WallBuilder.DIRECTIONS.map(direction => {
				const nextX = x + direction.dx;
				const nextY = y + direction.dy;
				return [direction.name, {
					cell: `${nextX},${nextY}`,
					wall: map.wallBuilder?.cells?.has(`${nextX},${nextY}`) ?? false,
					planned: this.floorPlan(nextX, nextY, planOwners)
				}];
			}))
		};
	},

	/** Arm one click on the map and copy a focused floor ownership report. */
	pick() {
		const container = MyteCore.instance?.getFirstContainer?.();
		const input = container?.inputHandler;
		if (!input?.screenToWorldCoordinates) {
			throw new Error('[SurfaceDebug] Container input is not ready');
		}
		const handler = event => {
			const point = input.screenToWorldCoordinates(event.pageX, event.pageY);
			const x = Math.floor(point.x / this.cellSize);
			const y = Math.floor(point.y / this.cellSize);
			const report = this.inspectFloor(x, y);
			this.lastPick = report;
			console.log('[SurfaceDebug] floor pick', JSON.stringify(report, null, 2));
			navigator.clipboard?.writeText(JSON.stringify(report, null, 2)).catch(() => {});
			event.preventDefault();
			event.stopImmediatePropagation();
		};
		document.addEventListener('pointerdown', handler, { capture: true, once: true });
		return 'picker armed — click a bad floor quarter; its report will be logged and copied';
	},

	/** Every room whose floor canvas has a pixel at this point in map space. */
	floorOwnersAt(mapX, mapY) {
		const renderer = this._map().floorBuilder;
		const blockX = Math.floor(mapX / renderer.blockSize);
		const blockY = Math.floor(mapY / renderer.blockSize);
		const roomId = renderer.ownershipGrid?.ownerAt(blockX, blockY);
		const surface = renderer.surfaces?.get(roomId);
		if (!surface) return [];
		const chunk = renderer.chunks?.get(renderer.chunkKeyOfBlock(blockX, blockY));
		const canvas = chunk?.canvas;
		if (!canvas) return [];
		const x = Math.floor(mapX - parseFloat(canvas.style.left));
		const y = Math.floor(mapY - parseFloat(canvas.style.top));
		if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return [];
		return canvas.getContext('2d').getImageData(x, y, 1, 1).data[3] > 0
			? [`${roomId}:${surface.finishId}`]
			: [];
	},

	/**
	 * Every quarter-cell two rooms both claim, and every one a room should have
	 * painted and did not.
	 *
	 * Overlaps are the flat defect — two canvases fighting over the same pixels,
	 * so which one you see is whichever was appended last. Gaps are the other
	 * half of the same question and are listed apart from them, because a bare
	 * quarter inside a room that HAS a floor is a hole while a room with no
	 * finish at all is opted out on purpose and shows the map as authored;
	 * those rooms are named once in `noFloor` instead of a line per quarter.
	 *
	 * `wallGaps` is the third list and the one this tool used to be blind to. A
	 * wall cell is not inside any room, so it was skipped outright — which
	 * excluded the exact ground the edge bleed EXISTS to cover, and let a bare
	 * sliver beside a wall pass an audit that reported nothing wrong.
	 *
	 * What separates a hole from the outdoors is not proximity to a floor —
	 * every exterior wall has floor on its inner half — but whether you could
	 * walk to it from off the map without crossing one. So the bare quarters are
	 * flooded from the map edge, and only the ones that fill cannot reach are
	 * reported: those are enclosed by floor on every side, which is the
	 * definition of a hole in it.
	 */
	audit() {
		const map = this._map();
		const size = this.cellSize;
		const quarter = size / this.QUARTER;
		const width = (map.gridSystem?.gridWidth || 0) * 2;
		const height = (map.gridSystem?.gridHeight || 0) * 2;
		const surfaces = map.floorBuilder?.surfaces;
		const overlaps = [];
		const gaps = [];
		const wallGaps = [];
		const noFloor = new Set();
		const bare = new Map();

		for (let row = 0; row < height; row++) {
			for (let column = 0; column < width; column++) {
				const x = Math.floor(column / 2);
				const y = Math.floor(row / 2);
				const owners = this.floorOwnersAt(
					(column * size / 2) + quarter,
					(row * size / 2) + quarter
				);
				const where = `${x},${y} ${row % 2 === 0 ? 'top' : 'bottom'}-${column % 2 === 0 ? 'left' : 'right'}`;
				if (owners.length > 1) { overlaps.push(`${where}: ${owners.join(' + ')}`); continue; }
				if (owners.length > 0) continue;

				const expectedOwner = map.floorBuilder?.ownershipGrid?.ownerAt(column, row) ?? null;
				if (expectedOwner && !surfaces?.has(expectedOwner)) {
					noFloor.add(expectedOwner);
					continue;
				}
				if (expectedOwner) gaps.push(`${where}: owned by ${expectedOwner}`);
				else bare.set(`${column},${row}`, where);
			}
		}

		const outdoors = new Set();
		const queue = [];
		const reach = (column, row) => {
			const key = `${column},${row}`;
			if (column < 0 || row < 0 || column >= width || row >= height) return;
			if (!bare.has(key) || outdoors.has(key)) return;
			outdoors.add(key);
			queue.push([column, row]);
		};
		for (let column = 0; column < width; column++) { reach(column, 0); reach(column, height - 1); }
		for (let row = 0; row < height; row++) { reach(0, row); reach(width - 1, row); }
		for (let index = 0; index < queue.length; index++) {
			const [column, row] = queue[index];
			reach(column - 1, row); reach(column + 1, row);
			reach(column, row - 1); reach(column, row + 1);
		}
		for (const [key, where] of bare) if (!outdoors.has(key)) wallGaps.push(where);

		return { overlaps, gaps, wallGaps, noFloor: [...noFloor] };
	},

	/** Rooms as both systems read them: shape, size, and the two finishes. */
	rooms() {
		const size = this.cellSize;
		return (this._map().regionManager?.all('room') ?? []).map(room => ({
			id: room.id,
			name: room.properties?.displayName ?? null,
			shape: room.shape?.kind,
			cells: room.areaInCells(size),
			bounds: room.bounds,
			wallFinish: room.properties?.wallFinishId ?? null,
			floorFinish: room.properties?.floorFinishId ?? null,
			autoDetected: room.properties?.autoDetected === true
		}));
	},

	// ── Overlay ──────────────────────────────────────────────────────────────

	/**
	 * The same answers, drawn on the map instead of printed.
	 *
	 * Floors tint by owning room, walls draw one bar per painted slice in the
	 * colour of the room that slice belongs to, and anything two rooms both
	 * claim is hatched red. A quarter-tile in the wrong colour is a thing you
	 * SEE, so the tool that explains it should be too.
	 */
	overlay(show = true) {
		this._overlay?.remove();
		this._overlay = null;
		if (!show) return 'overlay off';

		const map = this._map();
		const layer = map.layers?.objects;
		if (!layer) throw new Error('[SurfaceDebug] No object layer to draw on');
		const size = this.cellSize;
		const width = map.dimensions?.width || 0;
		const height = map.dimensions?.height || 0;

		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		canvas.className = 'surface-debug-overlay';
		Object.assign(canvas.style, {
			position: 'absolute', left: '0', top: '0', pointerEvents: 'none',
			zIndex: '2000000', imageRendering: 'pixelated'
		});
		const context = canvas.getContext('2d');

		const quarter = size / this.QUARTER;
		for (let y = 0; y < height / size; y++) {
			for (let x = 0; x < width / size; x++) {
				for (let row = 0; row < 2; row++) {
					for (let column = 0; column < 2; column++) {
						const px = (x * size) + (column * size / 2);
						const py = (y * size) + (row * size / 2);
						const owners = this.floorOwnersAt(px + quarter, py + quarter);
						if (owners.length === 0) continue;
						context.fillStyle = owners.length > 1
							? 'rgba(255, 0, 0, 0.55)'
							: SurfaceDebug.roomColor(owners[0].split(':')[0], 0.28);
						context.fillRect(px, py, size / 2, size / 2);
					}
				}
			}
		}

		// Wall slices sit on the cell's own footprint, not on the sprite that
		// rises above it — the sprite is 6 cells tall and would bury the floor
		// this is drawn to explain.
		const builder = map.wallBuilder;
		for (const cell of builder?.cells?.values() ?? []) {
			for (const surface of builder.getCellSurfaces(cell)) {
				context.fillStyle = SurfaceDebug.roomColor(surface.roomId, 0.95);
				context.fillRect(
					(cell.x * size) + surface.from,
					(cell.y * size) + (surface.axis === 'horizontal' ? size - 8 : 0),
					surface.to - surface.from,
					surface.axis === 'horizontal' ? 8 : size
				);
			}
		}

		layer.appendChild(canvas);
		this._overlay = canvas;
		return 'overlay on — floors tinted by room, wall slices barred, conflicts red';
	},

	// A stable colour per room id, so the same room reads the same on every
	// redraw and two rooms never come out indistinguishable by accident.
	roomColor(roomId, alpha) {
		if (!roomId) return `rgba(120, 120, 120, ${alpha})`;
		let hash = 0;
		for (let index = 0; index < roomId.length; index++) {
			hash = ((hash << 5) - hash + roomId.charCodeAt(index)) | 0;
		}
		return `hsla(${Math.abs(hash) % 360}, 75%, 55%, ${alpha})`;
	},

	maskName(mask) {
		const names = ['N', 'E', 'S', 'W'].filter((_, index) => (mask & (1 << index)) !== 0);
		return names.length > 0 ? names.join('+') : 'isolated';
	},

	// ── Bug reports ──────────────────────────────────────────────────────────

	/** Every wall cell and every room, as JSON — the whole surface state. */
	dump() {
		const builder = this._map().wallBuilder;
		return {
			mapId: this._map().id,
			rooms: this.rooms(),
			cells: [...(builder?.cells?.values() ?? [])]
				.sort((a, b) => a.y - b.y || a.x - b.x)
				.map(cell => this.cell(cell.x, cell.y)),
			floors: this.audit()
		};
	},

	download() {
		AuditHarness.download('surfaces', this.dump());
	}
};

window.__surfaces = SurfaceDebug;
