class RoofRenderer {
    static SHADE_ROWS = Object.freeze({ dark: 0, neutral: 1, light: 2, 'mid-dark': 3, 'mid-light': 4 });
    static PART_ROWS = Object.freeze({
        flat: 5, slope: 6, hip: 7, ridge: 8, 'ridge-end': 9,
        peak: 10, valley: 11, 'gable-end': 12
    });
    static FACING_COLUMNS = Object.freeze({
        north: 0, east: 1, south: 2, west: 3,
        'north-east': 0, 'south-east': 1, 'south-west': 2, 'north-west': 3,
        x: 0, y: 1
    });

    constructor(gameMap, registry) {
        this.gameMap = gameMap;
        this.registry = registry;
        this.cellSize = gameMap.gridSystem?.config?.cellSize || 32;
        this.geometries = new Map();
        this.sections = new Map();
        this.container = null;
        this.buildVisible = SiteConfig.roofSystem?.hideInBuildMode !== true;
        this.hitTest = new RoofHitTest(this);
        this.sectionsRedrawn = 0;
        this._visibilityKey = '';
        this._visibilityStates = new Map();
        this._unsubscribers = [];
    }

    initialize(geometries) {
        this.geometries = geometries || new Map();
        this.invalidate([...this.geometries.values()].map(roof => roof.buildingId));
        const events = this.gameMap.eventManager;
        if (events) this._unsubscribers.push(
            events.on(EVENTS.WALL_PRESENTATION_CHANGED, () => this.syncVisibility(true)),
            events.on(EVENTS.GAME_MODE_CHANGED, ({ mode }) => {
                if (mode === GAME_MODES.BUILD) {
                    this.buildVisible = SiteConfig.roofSystem?.hideInBuildMode !== true;
                }
                this.syncVisibility(true);
            }),
            events.on(EVENTS.CONTAINER_ACTIVE_MYTE_CHANGED, () => this.syncVisibility(true))
        );
        return this;
    }

    ensureContainer() {
        if (this.container?.isConnected) return this.container;
        const layer = this.gameMap.layers.objects;
        if (!layer) return null;
        this.container = document.createElement('div');
        this.container.className = 'roof-surfaces';
        Object.assign(this.container.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
        layer.appendChild(this.container);
        return this.container;
    }

    setGeometries(geometries) { this.geometries = geometries || new Map(); }

    invalidate(buildingIds) {
        const dirty = new Set((buildingIds || []).map(String));
        for (const [key, record] of [...this.sections]) {
            const roof = this.geometries.get(record.plan.id);
            const plan = this.currentPlan(record.plan.buildingId);
            const section = roof?.sections.find(candidate => candidate.key === record.geometry.key);
            if (!roof || !plan || (dirty.has(record.plan.buildingId) &&
                (!section || record.signature !== this.signature(plan, section)))) {
                record.canvas.remove();
                this.sections.delete(key);
            }
        }
        let redrawn = 0;
        for (const roof of this.geometries.values()) {
            if (!dirty.has(roof.buildingId)) continue;
            const plan = this.currentPlan(roof.buildingId);
            if (!plan) continue;
            for (const section of roof.sections) {
                if (this.sections.has(`${plan.id}/${section.key}`)) continue;
                redrawn += Number(this.drawSection(plan, section));
            }
        }
        this.sectionsRedrawn += redrawn;
        this.syncVisibility(true);
        return redrawn;
    }

    currentPlan(buildingId) {
        const sourceDocument = this.previewDocument || this.gameMap.buildDocument;
        return sourceDocument?.level?.().roofs.forBuilding(buildingId) || null;
    }

    signature(plan, geometry) {
        return JSON.stringify([
            plan.style, plan.finishId, plan.colorId, geometry.heightPx,
            [...geometry.parts].map(([key, part]) => [key, part.part, part.facing, part.shade, part.edgeMask])
        ]);
    }

    drawSection(plan, geometry) {
        const root = this.ensureContainer();
        const atlas = this.registry.getAtlas(plan.finishId, plan.colorId);
        if (!root || !atlas || geometry.cells.size === 0) return false;
        const fascia = 3;
        const width = geometry.bounds.width * this.cellSize;
        const height = geometry.bounds.height * this.cellSize + fascia;
        const canvas = document.createElement('canvas');
        canvas.className = 'roof-surface';
        canvas.dataset.roofBuildingId = plan.buildingId;
        canvas.dataset.roofSection = geometry.key;
        canvas.width = width;
        canvas.height = height;
        const left = geometry.bounds.left * this.cellSize;
        const top = geometry.bounds.top * this.cellSize - geometry.heightPx;
        const zIndex = this.gameMap.getDepthZIndex(geometry.bounds.bottom * this.cellSize, 1);
        Object.assign(canvas.style, { position: 'absolute', left: `${left}px`, top: `${top}px`, zIndex: String(zIndex) });
        const context = canvas.getContext('2d');
        context.imageSmoothingEnabled = false;
        for (const key of geometry.cells) {
            const { x, y } = BuildKeys.parseCell(key);
            const part = geometry.parts.get(key);
            const dx = (x - geometry.bounds.left) * this.cellSize;
            const dy = (y - geometry.bounds.top) * this.cellSize;
            this.blit(context, atlas, RoofRenderer.SHADE_ROWS[part.shade] ?? 1, 0, dx, dy);
            const row = RoofRenderer.PART_ROWS[part.part];
            const column = part.part === 'flat' ? part.edgeMask : RoofRenderer.FACING_COLUMNS[part.facing] ?? 0;
            this.blit(context, atlas, row, column, dx, dy);
            if ((part.edgeMask & 4) !== 0) context.drawImage(atlas,
                column * this.cellSize, row * this.cellSize + this.cellSize - 3, this.cellSize, 3,
                dx, dy + this.cellSize, this.cellSize, 3);
        }
        root.appendChild(canvas);
        this.sections.set(`${plan.id}/${geometry.key}`, {
            canvas, plan, geometry, left, top, width, height, zIndex,
            signature: this.signature(plan, geometry)
        });
        return true;
    }

    blit(context, atlas, row, column, x, y) {
        context.drawImage(atlas, column * this.cellSize, row * this.cellSize,
            this.cellSize, this.cellSize, x, y, this.cellSize, this.cellSize);
    }

    isPresentationVisible() {
        const mode = this.gameMap.wallBuilder?.presentation || SiteConfig.wallSystem.defaultPresentation;
        if (mode === 'down' || mode === 'hidden') return false;
        return !this.gameMap.gameMode?.isBuild?.() || this.buildVisible;
    }

    cutawayBuildingIds() {
        const rooms = this.gameMap.wallBuilder?._cutawayRoomIds || new Set();
        const plans = this.gameMap.buildDocument?.level?.().rooms;
        return new Set([...rooms].map(id => plans?.get(id)?.buildingId).filter(Boolean));
    }

    syncVisibility(force = false) {
        const presentation = this.gameMap.wallBuilder?.presentation || SiteConfig.wallSystem.defaultPresentation;
        const cutaways = presentation === 'cutaway' ? this.cutawayBuildingIds() : new Set();
        const key = `${presentation}|${this.gameMap.gameMode?.mode}|${this.buildVisible}|${[...cutaways].sort()}`;
        const pending = [...this._visibilityStates.values()].some(state => state.hidden !== state.desired);
        if (!force && key === this._visibilityKey && !pending) return false;
        this._visibilityKey = key;
        const presentationVisible = this.isPresentationVisible();
        const now = WallBuilder.presentationNow();
        for (const record of this.sections.values()) {
            const autoDesired = presentation === 'cutaway' && record.plan.visibility === 'auto' &&
                cutaways.has(record.plan.buildingId);
            let state = this._visibilityStates.get(record.plan.buildingId);
            if (!state) state = { hidden: false, desired: false, since: now };
            if (state.desired !== autoDesired) state = { ...state, desired: autoDesired, since: now };
            const delay = autoDesired
                ? Number(SiteConfig.wallSystem.cutawayLowerDelayMs) || 0
                : Number(SiteConfig.wallSystem.cutawayRaiseDelayMs) || 0;
            if (presentation !== 'cutaway') state = { hidden: false, desired: false, since: now };
            else if (state.hidden !== state.desired && now - state.since >= delay) state.hidden = state.desired;
            this._visibilityStates.set(record.plan.buildingId, state);
            record.canvas.hidden = !presentationVisible || record.plan.visibility === 'hidden' ||
                (record.plan.visibility === 'auto' && state.hidden);
        }
        return true;
    }

    setBuildVisible(flag) { this.buildVisible = flag === true; this.syncVisibility(true); }
    update() { this.syncVisibility(); }

    createBuildingOverlay(buildingId, className, fill) {
        const overlays = [];
        for (const record of this.sections.values()) {
            if (record.plan.buildingId !== buildingId || record.canvas.hidden) continue;
            const canvas = document.createElement('canvas');
            canvas.className = `surface-paint-overlay ${className}`;
            canvas.width = record.width;
            canvas.height = record.height;
            Object.assign(canvas.style, {
                position: 'absolute', left: `${record.left}px`, top: `${record.top}px`,
                zIndex: String(record.zIndex + 1), pointerEvents: 'none'
            });
            const context = canvas.getContext('2d');
            context.fillStyle = fill;
            for (const key of record.geometry.cells) {
                const { x, y } = BuildKeys.parseCell(key);
                context.fillRect((x - record.geometry.bounds.left) * this.cellSize,
                    (y - record.geometry.bounds.top) * this.cellSize, this.cellSize, this.cellSize);
            }
            this.ensureContainer()?.appendChild(canvas);
            overlays.push(canvas);
        }
        return overlays;
    }

    dispose() {
        for (const unsubscribe of this._unsubscribers) unsubscribe();
        this._unsubscribers = [];
        for (const { canvas } of this.sections.values()) canvas.remove();
        this.sections.clear();
        this._visibilityStates.clear();
        this.container?.remove();
        this.container = null;
        this.geometries.clear();
    }
}
