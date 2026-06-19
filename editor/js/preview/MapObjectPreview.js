// Read-only map object preview: object bounds, sprite (when the type defines
// one), spatial regions, surface slots per facing, and light radius.
// Region lookup mirrors MapObject.getRegionConfig: canonical spatial.regions
// first, then the legacy per-region config keys.
class MapObjectPreview {
    static REGION_IDS = ['collider', 'interaction', 'select', 'hit', 'pickup'];

    static LEGACY_REGION_KEYS = {
        collider: ['physics', 'collider'],
        interaction: ['interactionRegion'],
        select: ['selectbox'],
        hit: ['hitbox'],
        pickup: ['pickupbox']
    };

    constructor(container, record) {
        this.container = container;
        this.record = record;
        this.baseConfig = record.merged;

        this.variants = Array.isArray(this.baseConfig.variants) ? this.baseConfig.variants : [];
        this.currentVariant = this.variants[0] || null;

        const facings = Object.keys(this.baseConfig.slotsByFacing || {});
        this.facings = facings.length > 0 ? facings : [this.baseConfig.direction || 'S'];
        this.currentFacing = this.facings[0];

        this.zoom = 1;
        this.overlayState = { collider: true, slots: true, light: true };
    }

    get config() {
        const variantConfig = this.currentVariant
            ? this.baseConfig.variantConfigs?.[this.currentVariant]
            : null;
        return variantConfig
            ? EditorStore.mergeLayers(this.baseConfig, variantConfig)
            : this.baseConfig;
    }

    get size() {
        const size = this.config.size || {};
        return {
            width: size.width ?? 64,
            height: size.height ?? 64
        };
    }

    mount() {
        this.container.innerHTML = '';
        this.container.appendChild(this.buildControls());

        const { stage, subject } = PreviewControls.makeStage();
        this.subject = subject;
        this.container.appendChild(stage);
        this.container.appendChild(this.buildLegend());

        this.rebuild();
    }

    buildControls() {
        const row = PreviewControls.makeControlsRow();

        if (this.variants.length > 0) {
            row.appendChild(PreviewControls.makeGroup(
                'Variant',
                PreviewControls.makeSelect(this.variants, this.currentVariant, value => {
                    this.currentVariant = value;
                    this.rebuild();
                })
            ));
        }

        if (this.facings.length > 1) {
            row.appendChild(PreviewControls.makeGroup(
                'Facing',
                PreviewControls.makeSelect(this.facings, this.currentFacing, value => {
                    this.currentFacing = value;
                    this.rebuild();
                })
            ));
        }

        const states = this.baseConfig.visual?.states || [];
        if (states.length > 1) {
            this.stateLabel = PreviewControls.makeValueLabel(this.baseConfig.visual?.defaultState || states[0]);
            row.appendChild(PreviewControls.makeGroup(
                'State',
                PreviewControls.makeSelect(states, this.baseConfig.visual?.defaultState, value => {
                    this.stateLabel.textContent = value;
                }),
                this.stateLabel
            ));
        }

        this.zoomLabel = PreviewControls.makeValueLabel('100%');
        row.appendChild(PreviewControls.makeGroup(
            'Zoom',
            PreviewControls.makeButton('−', () => this.setZoom(this.zoom - 0.25)),
            this.zoomLabel,
            PreviewControls.makeButton('+', () => this.setZoom(this.zoom + 0.25))
        ));

        return row;
    }

    buildLegend() {
        const items = [];

        MapObjectPreview.REGION_IDS.forEach(regionId => {
            if (!this.resolveRegion(regionId)) return;
            items.push({
                id: regionId,
                label: regionId,
                color: EditorOverlayColors[regionId] || '#888888',
                active: this.overlayState[regionId] === true
            });
            if (this.overlayState[regionId] === undefined) this.overlayState[regionId] = false;
        });

        if (this.slotsForFacing().length > 0) {
            items.push({ id: 'slots', label: 'slots', color: EditorOverlayColors.slot, active: this.overlayState.slots });
        }

        if (this.config.lighting?.emitsLight || this.config.lightEmission) {
            items.push({ id: 'light', label: 'light radius', color: EditorOverlayColors.light, active: this.overlayState.light });
        }

        return PreviewControls.makeLegend(items, (id, isActive) => {
            this.overlayState[id] = isActive;
            this.rebuild();
        });
    }

    resolveRegion(regionId) {
        const canonical = this.config.spatial?.regions?.[regionId];
        if (canonical) return canonical;

        let node = this.config;
        for (const key of MapObjectPreview.LEGACY_REGION_KEYS[regionId]) {
            node = node?.[key];
        }
        return (node && typeof node === 'object') ? node : null;
    }

    regionRect(region) {
        return {
            x: region.x ?? region.offsetX ?? 0,
            y: region.y ?? region.offsetY ?? 0,
            width: region.width ?? this.size.width,
            height: region.height ?? this.size.height
        };
    }

    slotsForFacing() {
        return this.baseConfig.slotsByFacing?.[this.currentFacing] || [];
    }

    setZoom(zoom) {
        this.zoom = Math.min(4, Math.max(0.25, zoom));
        this.zoomLabel.textContent = `${Math.round(this.zoom * 100)}%`;
        this.subject.style.transform = `scale(${this.zoom})`;
    }

    rebuild() {
        const { width, height } = this.size;
        this.subject.innerHTML = '';
        this.subject.style.width = `${width}px`;
        this.subject.style.height = `${height}px`;
        this.subject.style.transform = `scale(${this.zoom})`;

        this.subject.appendChild(this.buildSprite(width, height));

        const overlayLayer = document.createElement('div');
        overlayLayer.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
        this.subject.appendChild(overlayLayer);

        MapObjectPreview.REGION_IDS.forEach(regionId => {
            if (!this.overlayState[regionId]) return;
            const region = this.resolveRegion(regionId);
            if (!region) return;
            overlayLayer.appendChild(PreviewControls.makeBoxOverlay(
                this.regionRect(region),
                EditorOverlayColors[regionId] || '#888888',
                regionId
            ));
        });

        if (this.overlayState.slots) {
            this.slotsForFacing().forEach(slot => {
                const rest = slot.restPosition || {};
                overlayLayer.appendChild(PreviewControls.makeMarkerOverlay(
                    (rest.xFactor ?? 0.5) * width,
                    (rest.yFactor ?? 0.5) * height,
                    EditorOverlayColors.slot,
                    `${slot.id}${slot.restFacing ? ` →${slot.restFacing}` : ''}`,
                    'point'
                ));
            });
        }

        const lighting = this.config.lighting;
        if (this.overlayState.light && (lighting?.emitsLight || this.config.lightEmission)) {
            overlayLayer.appendChild(PreviewControls.makeRadiusOverlay(
                width / 2,
                height / 2,
                lighting?.radius ?? 160,
                EditorOverlayColors.light,
                `light r=${lighting?.radius ?? 160}`
            ));
        }
    }

    buildSprite(width, height) {
        const visual = this.config.visual || {};
        const spriteSheet = visual.spriteSheet || this.config.spriteConfig?.spriteSheet;

        if (visual.renderType === 'split' && (this.config.splitSpritePrefix || this.currentVariant)) {
            const wrapper = document.createElement('div');
            wrapper.style.cssText = `position:relative;width:${width}px;height:${height}px;`;
            const prefix = this.config.splitSpritePrefix || this.currentVariant;
            ['back', 'front'].forEach(part => {
                const partEl = document.createElement('div');
                partEl.className = 'editor-stage__sprite';
                partEl.style.cssText =
                    `position:absolute;inset:0;background-image:url('images/MapObjects/${prefix}_${part}.png');background-size:cover;`;
                wrapper.appendChild(partEl);
            });
            return wrapper;
        }

        if (spriteSheet?.url) {
            const frameSize = spriteSheet.frameSize || { width, height };
            const sprite = document.createElement('div');
            sprite.className = 'editor-stage__sprite';
            sprite.style.width = `${frameSize.width}px`;
            sprite.style.height = `${frameSize.height}px`;
            sprite.style.backgroundImage = `url(${spriteSheet.url})`;
            return sprite;
        }

        const placeholder = document.createElement('div');
        placeholder.className = 'editor-stage__placeholder';
        placeholder.style.width = `${width}px`;
        placeholder.style.height = `${height}px`;
        placeholder.textContent = this.record.id;
        return placeholder;
    }

    refresh(record) {
        this.record = record;
        this.baseConfig = record.merged;
        this.rebuild();
    }

    destroy() {}
}
