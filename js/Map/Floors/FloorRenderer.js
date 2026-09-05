class FloorRenderer {
    static BLOCKS_PER_CELL = 2;

    constructor(gameMap, registry) {
        this.gameMap = gameMap;
        this.registry = registry;
        this.cellSize = gameMap.gridSystem?.config?.cellSize ?? 32;
        this.chunkCells = Number(SiteConfig.floorSystem?.chunkCells) || 8;
        this.surfaces = new Map();
        this.chunks = new Map();
        this.container = null;
        this.ownedBlocks = null;
        this.ownershipGrid = null;
        this.chunksRedrawn = 0;
    }

    get blockSize() {
        return this.cellSize / FloorRenderer.BLOCKS_PER_CELL;
    }

    build() {
        this.clear();
        this.ownedBlocks = null;
        if (!this.ownershipGrid) throw new Error('FloorRenderer requires the canonical build ownership grid');
        this.setOwnershipGrid(this.ownershipGrid);
        const dirty = new Set();
        for (const room of this.rooms()) {
            for (const [bx, by] of this.blocksOf(room.id)) dirty.add(this.chunkKeyOfBlock(bx, by));
        }
        for (const key of dirty) this.drawChunk(key);
        this.indexSurfaces();
        return this.surfaces.size;
    }

    setOwnershipGrid(grid) {
        this.ownershipGrid = grid;
        this.ownedBlocks = grid
            ? new Map(this.rooms().map(room => [room.id, grid.blocksOf(room.id)]))
            : new Map();
    }

    invalidate(blockKeys) {
        const dirty = new Set((blockKeys || []).map(blockKey => {
            const { bx, by } = BuildKeys.parseBlock(blockKey);
            return this.chunkKeyOfBlock(bx, by);
        }));
        let redrawn = 0;
        for (const key of dirty) redrawn += Number(this.drawChunk(key));
        this.indexSurfaces();
        return redrawn;
    }

    ensureContainer() {
        if (this.container?.isConnected) return this.container;
        const layer = this.gameMap.layers?.background;
        if (!layer) return null;
        this.container = document.createElement('div');
        this.container.className = 'floor-surfaces';
        Object.assign(this.container.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
        layer.appendChild(this.container);
        return this.container;
    }

    rooms() {
        return this.gameMap.regionManager?.all('room') ?? [];
    }

    resolveFinishId(room) {
        if (!room) return null;
        const previewPlan = this.previewDocument?.level?.().rooms.get(room.id);
        return previewPlan?.floorFinishId || room?.properties?.floorFinishId || SiteConfig.floorSystem?.defaultFinishId || null;
    }

    bleedBlocks() {
        const cells = Number(SiteConfig.floorSystem?.edgeBleedCells ?? 0.5);
        return Math.max(0, Math.round(cells * FloorRenderer.BLOCKS_PER_CELL));
    }

    blocksOf(roomId) {
        return this.ownedBlocks?.get(roomId) ?? [];
    }

    chunkKeyOfBlock(blockX, blockY) {
        const blocksPerChunk = this.chunkCells * FloorRenderer.BLOCKS_PER_CELL;
        return `${Math.floor(blockX / blocksPerChunk)},${Math.floor(blockY / blocksPerChunk)}`;
    }

    chunkArea(key) {
        const [chunkX, chunkY] = key.split(',').map(Number);
        const grid = this.gameMap.gridSystem;
        const x = chunkX * this.chunkCells * this.cellSize;
        const y = chunkY * this.chunkCells * this.cellSize;
        return {
            x,
            y,
            width: Math.min(this.chunkCells, Number(grid?.gridWidth) - chunkX * this.chunkCells) * this.cellSize,
            height: Math.min(this.chunkCells, Number(grid?.gridHeight) - chunkY * this.chunkCells) * this.cellSize
        };
    }

    drawChunk(key) {
        if (!this.ownershipGrid) return false;
        const container = this.ensureContainer();
        if (!container) return false;
        const area = this.chunkArea(key);
        if (area.width <= 0 || area.height <= 0) return false;
        const byFinish = new Map();
        const rooms = new Map(this.rooms().map(room => [room.id, room]));
        const blockX0 = Math.round(area.x / this.blockSize);
        const blockY0 = Math.round(area.y / this.blockSize);
        const blockX1 = blockX0 + Math.round(area.width / this.blockSize);
        const blockY1 = blockY0 + Math.round(area.height / this.blockSize);
        for (let by = blockY0; by < blockY1; by++) for (let bx = blockX0; bx < blockX1; bx++) {
            const room = rooms.get(this.ownershipGrid.ownerAt(bx, by));
            const finishId = this.resolveFinishId(room);
            if (!finishId || !this.registry?.getTile(finishId)) continue;
            if (!byFinish.has(finishId)) byFinish.set(finishId, []);
            byFinish.get(finishId).push([bx, by]);
        }
        if (!byFinish.size) {
            this.chunks.get(key)?.canvas.remove();
            this.chunks.delete(key);
            this.chunksRedrawn++;
            return true;
        }
        let chunk = this.chunks.get(key);
        if (!chunk) {
            const canvas = document.createElement('canvas');
            canvas.className = 'floor-surface floor-surface--chunk';
            canvas.dataset.floorChunk = key;
            Object.assign(canvas.style, { position: 'absolute', pointerEvents: 'none' });
            container.appendChild(canvas);
            chunk = { canvas, key };
            this.chunks.set(key, chunk);
        }
        const { canvas } = chunk;
        canvas.width = area.width;
        canvas.height = area.height;
        canvas.style.left = `${area.x}px`;
        canvas.style.top = `${area.y}px`;
        const context = canvas.getContext('2d');
        context.imageSmoothingEnabled = false;
        context.clearRect(0, 0, area.width, area.height);
        for (const [finishId, blocks] of byFinish) this.drawFinishBlocks(context, this.registry.getTile(finishId), blocks, area);
        this.chunksRedrawn++;
        return true;
    }

    drawFinishBlocks(context, tile, blocks, area) {
        context.save();
        context.beginPath();
        for (const [bx, by] of blocks) {
            context.rect((bx * this.blockSize) - area.x, (by * this.blockSize) - area.y, this.blockSize, this.blockSize);
        }
        context.clip();
        const tileSize = this.registry.tileSize;
        context.translate(-(area.x % tileSize), -(area.y % tileSize));
        context.fillStyle = context.createPattern(tile, 'repeat');
        context.fillRect(0, 0, area.width + tileSize, area.height + tileSize);
        context.restore();
    }

    indexSurfaces() {
        this.surfaces.clear();
        for (const room of this.rooms()) {
            const finishId = this.resolveFinishId(room);
            if (!finishId || !this.registry?.getTile(finishId)) continue;
            const chunks = new Set(this.blocksOf(room.id).map(([bx, by]) => this.chunkKeyOfBlock(bx, by)));
            this.surfaces.set(room.id, { finishId, chunks });
        }
    }

    createRoomOverlay(room, { fill, className = '', outline = null } = {}) {
        const area = this.paintedArea(room);
        const container = this.ensureContainer();
        if (!area || !container) return null;
        const canvas = this.createOverlayCanvas(area, room.id);
        canvas.className = className;
        const context = canvas.getContext('2d');
        this.clipToRoom(context, room, area);
        context.fillStyle = fill;
        context.fillRect(0, 0, area.width, area.height);
        context.restore();
        if (outline) this.strokeRoomEdges(context, room, area, outline);
        container.appendChild(canvas);
        return canvas;
    }

    createOverlayCanvas(area, roomId) {
        const canvas = document.createElement('canvas');
        canvas.width = area.width;
        canvas.height = area.height;
        canvas.dataset.roomId = roomId;
        Object.assign(canvas.style, { position: 'absolute', left: `${area.x}px`, top: `${area.y}px`, pointerEvents: 'none' });
        return canvas;
    }

    clipToRoom(context, room, area) {
        context.save();
        context.beginPath();
        for (const [bx, by] of this.blocksOf(room.id)) {
            context.rect((bx * this.blockSize) - area.x, (by * this.blockSize) - area.y, this.blockSize, this.blockSize);
        }
        context.clip();
    }

    strokeRoomEdges(context, room, area, colour) {
        const blocks = this.blocksOf(room.id);
        const owned = new Set(blocks.map(([bx, by]) => BuildKeys.block(bx, by)));
        context.save();
        context.strokeStyle = colour;
        context.lineWidth = 2;
        context.beginPath();
        for (const [bx, by] of blocks) {
            const left = bx * this.blockSize - area.x;
            const top = by * this.blockSize - area.y;
            if (!owned.has(BuildKeys.block(bx - 1, by))) { context.moveTo(left, top); context.lineTo(left, top + this.blockSize); }
            if (!owned.has(BuildKeys.block(bx + 1, by))) { context.moveTo(left + this.blockSize, top); context.lineTo(left + this.blockSize, top + this.blockSize); }
            if (!owned.has(BuildKeys.block(bx, by - 1))) { context.moveTo(left, top); context.lineTo(left + this.blockSize, top); }
            if (!owned.has(BuildKeys.block(bx, by + 1))) { context.moveTo(left, top + this.blockSize); context.lineTo(left + this.blockSize, top + this.blockSize); }
        }
        context.stroke();
        context.restore();
    }

    paintedArea(room) {
        const blocks = this.blocksOf(room?.id);
        if (!blocks.length) return null;
        const xs = blocks.map(block => block[0]);
        const ys = blocks.map(block => block[1]);
        const minX = Math.min(...xs);
        const minY = Math.min(...ys);
        return {
            x: minX * this.blockSize,
            y: minY * this.blockSize,
            width: (Math.max(...xs) - minX + 1) * this.blockSize,
            height: (Math.max(...ys) - minY + 1) * this.blockSize
        };
    }



    clear() {
        for (const { canvas } of this.chunks.values()) canvas.remove();
        this.chunks.clear();
        this.surfaces.clear();
    }

    dispose() {
        this.clear();
        this.ownedBlocks = null;
        this.ownershipGrid = null;
        this.container?.remove();
        this.container = null;
    }
}
