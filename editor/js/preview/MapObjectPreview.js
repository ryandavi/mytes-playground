// Read-only (or editable) map object preview: object bounds, sprite, spatial
// regions, surface slots per facing, and light radius.
// When editable=true, region overlays gain drag-to-move and corner resize handles
// that write back through onEdit. Slot rest-points gain drag handles too.
class MapObjectPreview {
    static REGION_IDS = ['collider', 'interaction', 'select', 'hit', 'pickup'];

    constructor(container, record, { domain = null, onNavigate = null, onEdit = null } = {}) {
        this.container = container;
        this.record = record;
        this.baseConfig = record.merged;
        this.editable = domain?.writable ?? false;
        this.onEdit = onEdit;
        this.onNavigate = onNavigate;

        this.variants = Array.isArray(this.baseConfig.variants) ? this.baseConfig.variants : [];
        this.currentVariant = this.variants[0] || null;

        const facings = this._findSlotFacings();
        this.facings = facings.length > 0 ? facings : [this.baseConfig.direction || 'S'];
        this.currentFacing = this.facings[0];

        this.zoom = 1;
        this.overlayState = { collider: true, slots: true, light: true };
        this.labelsVisible = true;

        this._drag = null;
    }

    // Slots may live at top-level slotsByFacing OR inside actionConfigs.<id>.slotsByFacing
    _findActionSlots() {
        if (this.baseConfig.slotsByFacing) return this.baseConfig.slotsByFacing;
        const ac = this.baseConfig.actionConfigs || {};
        for (const cfg of Object.values(ac)) {
            if (cfg.slotsByFacing) return cfg.slotsByFacing;
        }
        return {};
    }

    _findSlotFacings() {
        const facings = new Set(Object.keys(this.baseConfig.slotsByFacing || this._findActionSlots()));
        const baseSockets = Object.values(this.baseConfig.sockets || {});
        if (baseSockets.length > 0) facings.add(this.baseConfig.direction || 'S');
        for (const socket of baseSockets) {
            Object.keys(socket?.byFacing || {}).forEach(facing => facings.add(facing));
        }
        for (const variant of Object.values(this.baseConfig.variantConfigs || {})) {
            Object.entries(variant?.directionConfigs || {}).forEach(([facing, direction]) => {
                if (direction?.sockets) facings.add(facing);
            });
        }
        return [...facings];
    }

    _slotActionConfigKey() {
        if (this.baseConfig.slotsByFacing) return null;
        const ac = this.baseConfig.actionConfigs || {};
        for (const [id, cfg] of Object.entries(ac)) {
            if (cfg.slotsByFacing) return id;
        }
        return null;
    }

    get config() {
        const variantConfig = this.currentVariant
            ? this.baseConfig.variantConfigs?.[this.currentVariant]
            : null;
        const merged = variantConfig
            ? EditorStore.mergeLayers(this.baseConfig, variantConfig)
            : this.baseConfig;
        const directionConfig = merged.directionConfigs?.[this.currentFacing];
        return directionConfig
            ? EditorStore.mergeLayers(merged, directionConfig)
            : merged;
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

        if (this.editable && this.onEdit) {
            row.appendChild(this.buildSpritesheetPicker());
        }

        return row;
    }

    buildSpritesheetPicker() {
        const DATALIST_ID = 'editor-mapobject-spritesheets';
        if (!document.getElementById(DATALIST_ID)) {
            const datalist = document.createElement('datalist');
            datalist.id = DATALIST_ID;
            document.body.appendChild(datalist);
            EditorApi.assets('map-objects').then(result => {
                (result.assets || []).forEach(url => {
                    const opt = document.createElement('option');
                    opt.value = url;
                    datalist.appendChild(opt);
                });
            }).catch(() => {});
        }

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'editor-field__input editor-field__input--string';
        input.value = this.baseConfig.visual?.spriteSheet?.url || '';
        input.placeholder = 'images/MapObjects/...';
        input.setAttribute('list', DATALIST_ID);
        input.style.width = '220px';
        input.addEventListener('change', () => {
            const url = input.value.trim();
            this.onEdit(['visual', 'spriteSheet', 'url'], url || null);
        });

        return PreviewControls.makeGroup('Spritesheet', input);
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

        items.push({ id: 'labels', label: 'labels', color: null, active: this.labelsVisible });

        return PreviewControls.makeLegend(items, (id, isActive) => {
            if (id === 'labels') {
                this.labelsVisible = isActive;
                this.subject.classList.toggle('editor-stage__subject--no-labels', !isActive);
            } else {
                this.overlayState[id] = isActive;
                this.rebuild();
            }
        });
    }

    resolveRegion(regionId) {
        return this.config.spatial?.regions?.[regionId] || null;
    }

    regionRect(region) {
        return {
            x: region.x ?? 0,
            y: region.y ?? 0,
            width: region.width ?? this.size.width,
            height: region.height ?? this.size.height
        };
    }

    slotsForFacing() {
        const sockets = this._getSocketEntries();
        if (sockets.length > 0) {
            return sockets.map(entry => ({
                id: entry.id,
                restPosition: entry.socket.position,
                restFacing: entry.socket.facing,
                socketPath: entry.path
            }));
        }

        const slots = this._findActionSlots();
        return slots[this.currentFacing] || [];
    }

    _getSocketEntries() {
        const variantDirection = this.currentVariant
            ? this.baseConfig.variantConfigs?.[this.currentVariant]?.directionConfigs?.[this.currentFacing]
            : null;
        const sourceSockets = variantDirection?.sockets ?? this.baseConfig.sockets;
        const sourcePath = variantDirection
            ? ['variantConfigs', this.currentVariant, 'directionConfigs', this.currentFacing, 'sockets']
            : ['sockets'];
        if (!sourceSockets || typeof sourceSockets !== 'object') return [];

        return Object.entries(sourceSockets).flatMap(([id, socket]) => {
            const override = socket?.byFacing?.[this.currentFacing];
            if (override === null) return [];
            const resolved = override && typeof override === 'object'
                ? EditorStore.mergeLayers(socket, override)
                : socket;
            return resolved?.position ? [{
                id,
                socket: resolved,
                path: override && typeof override === 'object'
                    ? [...sourcePath, id, 'byFacing', this.currentFacing, 'position']
                    : [...sourcePath, id, 'position']
            }] : [];
        });
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
            const rect = this.regionRect(region);
            const color = EditorOverlayColors[regionId] || '#888888';

            if (this.editable && this.onEdit) {
                overlayLayer.appendChild(this.buildDraggableRegion(regionId, region, rect, color));
            } else {
                overlayLayer.appendChild(PreviewControls.makeBoxOverlay(rect, color, regionId));
            }
        });

        if (this.overlayState.slots) {
            this.slotsForFacing().forEach((slot, index) => {
                const rest = slot.restPosition || {};
                const cx = (rest.xFactor ?? 0.5) * width;
                const cy = (rest.yFactor ?? 0.5) * height;
                if (this.editable && this.onEdit) {
                    overlayLayer.appendChild(this.buildDraggableSlot(slot, index, cx, cy));
                } else {
                    overlayLayer.appendChild(PreviewControls.makeMarkerOverlay(
                        cx, cy,
                        EditorOverlayColors.slot,
                        `${slot.id}${slot.restFacing ? ` →${slot.restFacing}` : ''}`,
                        'point'
                    ));
                }
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

    // ── Drag handles ─────────────────────────────────────────────────────────

    buildDraggableRegion(regionId, region, rect, color) {
        const wrapper = document.createElement('div');
        wrapper.className = 'editor-drag-region';
        wrapper.style.cssText = `
            position:absolute;
            left:${rect.x}px; top:${rect.y}px;
            width:${rect.width}px; height:${rect.height}px;
            box-sizing:border-box;
            pointer-events:auto;
            border:2px solid ${color};
            cursor:move;
            user-select:none;
        `;

        const label = document.createElement('span');
        label.className = 'editor-drag-region__label';
        label.textContent = regionId;
        label.style.cssText = `
            position:absolute; top:2px; left:4px;
            font-size:10px; line-height:1; color:${color};
            pointer-events:none;
        `;
        wrapper.appendChild(label);

        // Resize handles at each corner
        const corners = [
            { name: 'nw', cursor: 'nw-resize', style: 'top:-4px;left:-4px;' },
            { name: 'ne', cursor: 'ne-resize', style: 'top:-4px;right:-4px;' },
            { name: 'sw', cursor: 'sw-resize', style: 'bottom:-4px;left:-4px;' },
            { name: 'se', cursor: 'se-resize', style: 'bottom:-4px;right:-4px;' },
        ];
        corners.forEach(({ name, cursor, style }) => {
            const handle = document.createElement('div');
            handle.className = 'editor-drag-region__handle';
            handle.dataset.corner = name;
            handle.style.cssText = `
                position:absolute; ${style}
                width:8px; height:8px;
                background:${color}; border-radius:50%;
                cursor:${cursor}; pointer-events:auto;
            `;
            handle.addEventListener('mousedown', e => {
                e.stopPropagation();
                this._startResizeDrag(e, regionId, region, name);
            });
            wrapper.appendChild(handle);
        });

        wrapper.addEventListener('mousedown', e => {
            if (e.target !== wrapper && !e.target.classList.contains('editor-drag-region__label')) return;
            this._startMoveDrag(e, regionId, region);
        });

        return wrapper;
    }

    buildDraggableSlot(slot, index, cx, cy) {
        const wrapper = document.createElement('div');
        wrapper.className = 'editor-drag-slot';
        wrapper.style.cssText = `
            position:absolute;
            left:${cx - 8}px; top:${cy - 8}px;
            width:16px; height:16px;
            background:${EditorOverlayColors.slot};
            border-radius:50%;
            pointer-events:auto;
            cursor:move;
            user-select:none;
            box-sizing:border-box;
            border:2px solid #fff;
        `;
        wrapper.title = `${slot.id}${slot.restFacing ? ' →' + slot.restFacing : ''}`;

        wrapper.addEventListener('mousedown', e => {
            e.stopPropagation();
            this._startSlotDrag(e, slot, index);
        });

        return wrapper;
    }

    _startMoveDrag(e, regionId, region) {
        e.preventDefault();
        const startX = e.clientX;
        const startY = e.clientY;
        const origX = region.x ?? 0;
        const origY = region.y ?? 0;

        const onMove = mv => {
            const dx = Math.round((mv.clientX - startX) / this.zoom);
            const dy = Math.round((mv.clientY - startY) / this.zoom);
            this._previewRegionMove(regionId, origX + dx, origY + dy,
                region.width ?? this.size.width, region.height ?? this.size.height);
        };
        const onUp = mv => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            const dx = Math.round((mv.clientX - startX) / this.zoom);
            const dy = Math.round((mv.clientY - startY) / this.zoom);
            this._commitRegion(regionId, region, origX + dx, origY + dy,
                region.width ?? this.size.width, region.height ?? this.size.height);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }

    _startResizeDrag(e, regionId, region, corner) {
        e.preventDefault();
        const startX = e.clientX;
        const startY = e.clientY;
        const origX = region.x ?? 0;
        const origY = region.y ?? 0;
        const origW = region.width ?? this.size.width;
        const origH = region.height ?? this.size.height;

        const onMove = mv => {
            const { x, y, w, h } = this._applyCornerDelta(
                corner, origX, origY, origW, origH,
                (mv.clientX - startX) / this.zoom,
                (mv.clientY - startY) / this.zoom
            );
            this._previewRegionMove(regionId, x, y, w, h);
        };
        const onUp = mv => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            const { x, y, w, h } = this._applyCornerDelta(
                corner, origX, origY, origW, origH,
                (mv.clientX - startX) / this.zoom,
                (mv.clientY - startY) / this.zoom
            );
            this._commitRegion(regionId, region, x, y, w, h);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }

    _applyCornerDelta(corner, ox, oy, ow, oh, dx, dy) {
        dx = Math.round(dx); dy = Math.round(dy);
        let x = ox, y = oy, w = ow, h = oh;
        if (corner === 'nw') { x = ox + dx; y = oy + dy; w = Math.max(4, ow - dx); h = Math.max(4, oh - dy); }
        if (corner === 'ne') { y = oy + dy; w = Math.max(4, ow + dx); h = Math.max(4, oh - dy); }
        if (corner === 'sw') { x = ox + dx; w = Math.max(4, ow - dx); h = Math.max(4, oh + dy); }
        if (corner === 'se') { w = Math.max(4, ow + dx); h = Math.max(4, oh + dy); }
        return { x, y, w, h };
    }

    _startSlotDrag(e, slot, index) {
        e.preventDefault();
        const { width, height } = this.size;
        const startX = e.clientX;
        const startY = e.clientY;
        const origXF = slot.restPosition?.xFactor ?? 0.5;
        const origYF = slot.restPosition?.yFactor ?? 0.5;

        const onMove = mv => {
            const dx = (mv.clientX - startX) / this.zoom;
            const dy = (mv.clientY - startY) / this.zoom;
            const xf = Math.max(0, Math.min(1, origXF + dx / width));
            const yf = Math.max(0, Math.min(1, origYF + dy / height));
            this._previewSlotMove(index, xf, yf);
        };
        const onUp = mv => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            const dx = (mv.clientX - startX) / this.zoom;
            const dy = (mv.clientY - startY) / this.zoom;
            const xf = Math.round((Math.max(0, Math.min(1, origXF + dx / width))) * 100) / 100;
            const yf = Math.round((Math.max(0, Math.min(1, origYF + dy / height))) * 100) / 100;
            this._commitSlot(slot, index, xf, yf);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }

    _previewRegionMove(regionId, x, y, w, h) {
        const el = this.subject.querySelector(`.editor-drag-region[data-region="${regionId}"]`) ||
            this._findDragRegion(regionId);
        if (!el) return;
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
        el.style.width = `${w}px`;
        el.style.height = `${h}px`;
    }

    _findDragRegion(regionId) {
        const els = this.subject.querySelectorAll('.editor-drag-region');
        for (const el of els) {
            const label = el.querySelector('.editor-drag-region__label');
            if (label && label.textContent === regionId) return el;
        }
        return null;
    }

    _previewSlotMove(index, xf, yf) {
        const { width, height } = this.size;
        const slots = this.subject.querySelectorAll('.editor-drag-slot');
        const el = slots[index];
        if (!el) return;
        el.style.left = `${xf * width - 8}px`;
        el.style.top = `${yf * height - 8}px`;
    }

    _commitRegion(regionId, original, x, y, w, h) {
        if (!this.onEdit) return;
        const newRegion = { type: original.type || 'box', x, y, width: w, height: h };
        this.onEdit(['spatial', 'regions', regionId], newRegion);
    }

    _commitSlot(slot, index, xf, yf) {
        if (!this.onEdit) return;
        if (slot.socketPath) {
            this.onEdit(slot.socketPath, { xFactor: xf, yFactor: yf });
            return;
        }
        const ac = this._slotActionConfigKey();
        const path = ac
            ? ['actionConfigs', ac, 'slotsByFacing', this.currentFacing, index, 'restPosition']
            : ['slotsByFacing', this.currentFacing, index, 'restPosition'];
        this.onEdit(path, { xFactor: xf, yFactor: yf });
    }

    // ── Sprite ───────────────────────────────────────────────────────────────

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
        this.variants = Array.isArray(this.baseConfig.variants) ? this.baseConfig.variants : [];
        if (this.currentVariant && !this.variants.includes(this.currentVariant)) {
            this.currentVariant = this.variants[0] || null;
        }
        const facings = Object.keys(this._findActionSlots());
        this.facings = facings.length > 0 ? facings : [this.baseConfig.direction || 'S'];
        if (!this.facings.includes(this.currentFacing)) {
            this.currentFacing = this.facings[0];
        }
        this.mount();
    }

    destroy() {}
}
