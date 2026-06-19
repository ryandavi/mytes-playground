// Live Myte preview: drives the runtime SpriteAnimator over the merged species
// definition and draws spatial regions/anchors as toggleable overlays.
// Direction-aware values resolve through MyteDefinitionRegistry.getSpatialValue
// so the preview can never disagree with the game's own resolution rules.
class MytePreview {
    constructor(container, record) {
        this.container = container;
        this.record = record;
        this.definition = record.merged;
        this.spriteSets = this.definition?.visual?.spriteSets || {};
        this.frameSize = this.definition?.visual?.frameSize || { width: 192, height: 192 };
        this.sheet = MyteDefinitionRegistry.getSpriteSheetConfig(this.definition);

        const setNames = Object.keys(this.spriteSets);
        this.currentSet = setNames.includes('S') ? 'S' : (setNames[0] || null);
        this.zoom = 1;
        this.playing = true;
        this.animator = null;
        this._rafId = null;
        this._lastTime = null;

        this.overlayState = { anchors: true };
        Object.keys(this.definition?.spatial?.regions || {}).forEach(regionId => {
            this.overlayState[regionId] = regionId === 'collider';
        });
    }

    mount() {
        this.container.innerHTML = '';

        if (!this.currentSet) {
            const empty = document.createElement('div');
            empty.className = 'editor-stage__empty';
            empty.textContent = 'No sprite sets defined for this Myte.';
            this.container.appendChild(empty);
            return;
        }

        this.container.appendChild(this.buildControls());

        const { stage, subject } = PreviewControls.makeStage();
        this.subject = subject;
        this.subject.style.width = `${this.frameSize.width}px`;
        this.subject.style.height = `${this.frameSize.height}px`;

        this.spriteEl = document.createElement('div');
        this.spriteEl.className = 'editor-stage__sprite';
        this.spriteEl.style.width = `${this.frameSize.width}px`;
        this.spriteEl.style.height = `${this.frameSize.height}px`;
        this.spriteEl.style.backgroundImage = `url(${this.sheet.url})`;
        if (this.sheet.filter && this.sheet.filter !== 'none') {
            this.spriteEl.style.filter = this.sheet.filter;
        }
        this.subject.appendChild(this.spriteEl);

        this.overlayLayer = document.createElement('div');
        this.overlayLayer.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
        this.subject.appendChild(this.overlayLayer);

        this.container.appendChild(stage);
        this.container.appendChild(this.buildLegend());

        this.setSpriteSet(this.currentSet);
        this.applyZoom();
        this._lastTime = performance.now();
        this._rafId = requestAnimationFrame(time => this.tick(time));
    }

    buildControls() {
        const row = PreviewControls.makeControlsRow();

        row.appendChild(PreviewControls.makeGroup(
            'Sprite set',
            PreviewControls.makeSelect(Object.keys(this.spriteSets), this.currentSet, value => this.setSpriteSet(value))
        ));

        this.playButton = PreviewControls.makeButton('❚❚', () => this.togglePlay(), 'Play / pause');
        this.frameLabel = PreviewControls.makeValueLabel('');
        row.appendChild(PreviewControls.makeGroup(
            'Playback',
            this.playButton,
            PreviewControls.makeButton('▸|', () => this.step(), 'Step one frame'),
            this.frameLabel
        ));

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
        const items = Object.keys(this.definition?.spatial?.regions || {}).map(regionId => ({
            id: regionId,
            label: regionId,
            color: EditorOverlayColors[regionId] || '#888888',
            active: this.overlayState[regionId]
        }));

        if (Object.keys(this.definition?.spatial?.anchors || {}).length > 0) {
            items.push({
                id: 'anchors',
                label: 'anchors',
                color: EditorOverlayColors.anchor,
                active: this.overlayState.anchors
            });
        }

        return PreviewControls.makeLegend(items, (id, isActive) => {
            this.overlayState[id] = isActive;
            this.rebuildOverlays();
        });
    }

    // Spatial direction context: exact direction sets ("E") and direction-suffixed
    // sets ("idle_E") resolve directional overrides; anything else uses base values.
    directionForSet(setName) {
        const directions = ['N', 'S', 'E', 'W'];
        if (directions.includes(setName)) return setName;
        const suffix = setName.split('_').pop();
        return directions.includes(suffix) ? suffix : null;
    }

    setSpriteSet(setName) {
        this.currentSet = setName;
        const frames = this.spriteSets[setName] || [];
        this._currentFrames = Utility.deepClone(frames);
        if (!this.animator) {
            this.animator = new SpriteAnimator(frames, { loop: true });
        } else {
            this.animator.setFrames(frames, { loop: true });
        }
        this.applyFrame();
        this.rebuildOverlays();
    }

    // Re-read the (mutated) merged definition after an inspector edit without
    // resetting playback, zoom, or overlay toggles. Only restarts the animator
    // when the active set's frame data actually changed.
    refresh(record) {
        this.record = record;
        this.definition = record.merged;
        this.spriteSets = this.definition?.visual?.spriteSets || {};
        this.frameSize = this.definition?.visual?.frameSize || { width: 192, height: 192 };
        this.sheet = MyteDefinitionRegistry.getSpriteSheetConfig(this.definition);

        if (!this.subject) {
            this.mount();
            return;
        }

        this.subject.style.width = `${this.frameSize.width}px`;
        this.subject.style.height = `${this.frameSize.height}px`;
        this.spriteEl.style.width = `${this.frameSize.width}px`;
        this.spriteEl.style.height = `${this.frameSize.height}px`;
        this.spriteEl.style.backgroundImage = `url(${this.sheet.url})`;
        this.spriteEl.style.filter = (this.sheet.filter && this.sheet.filter !== 'none') ? this.sheet.filter : '';

        if (!this.spriteSets[this.currentSet]) {
            this.currentSet = Object.keys(this.spriteSets)[0] || null;
        }
        const frames = this.spriteSets[this.currentSet] || [];
        if (!EditorDocument.deepEqual(frames, this._currentFrames)) {
            this._currentFrames = Utility.deepClone(frames);
            this.animator.setFrames(frames, { loop: true });
        }
        this.applyFrame();
        this.rebuildOverlays();
    }

    togglePlay() {
        this.playing = !this.playing;
        this.playButton.textContent = this.playing ? '❚❚' : '▶';
    }

    step() {
        if (this.playing) this.togglePlay();
        const frame = this.animator.currentFrame;
        const baseInterval = 1000 / SiteConfig.myte.defaultAnimationFPS;
        const interval = Array.isArray(frame) && frame[2] != null ? frame[2] : baseInterval;
        this.animator.update(interval);
        if (this.animator.isComplete) this.animator.reset();
        this.applyFrame();
    }

    setZoom(zoom) {
        this.zoom = Math.min(3, Math.max(0.25, zoom));
        this.applyZoom();
    }

    applyZoom() {
        this.subject.style.transform = `scale(${this.zoom})`;
        this.zoomLabel.textContent = `${Math.round(this.zoom * 100)}%`;
    }

    applyFrame() {
        this.spriteEl.style.backgroundPosition =
            this.animator.getBackgroundPosition(this.frameSize.width, this.frameSize.height);

        const frame = this.animator.currentFrame;
        const coords = Array.isArray(frame) ? `[${frame[0]},${frame[1] ?? 0}]` : `[${frame ?? '-'}]`;
        this.frameLabel.textContent = `${this.animator.frameIndex + 1}/${this.animator.frameCount} ${coords}`;
    }

    rebuildOverlays() {
        this.overlayLayer.innerHTML = '';
        const direction = this.directionForSet(this.currentSet);

        Object.keys(this.definition?.spatial?.regions || {}).forEach(regionId => {
            if (!this.overlayState[regionId]) return;
            const region = MyteDefinitionRegistry.getSpatialValue(this.definition, 'regions', regionId, direction);
            if (!region) return;
            this.overlayLayer.appendChild(PreviewControls.makeBoxOverlay(
                region,
                EditorOverlayColors[regionId] || '#888888',
                regionId
            ));
        });

        if (this.overlayState.anchors) {
            Object.keys(this.definition?.spatial?.anchors || {}).forEach(anchorId => {
                const anchor = MyteDefinitionRegistry.getSpatialValue(this.definition, 'anchors', anchorId, direction);
                if (!anchor) return;
                this.overlayLayer.appendChild(PreviewControls.makeMarkerOverlay(
                    anchor.x,
                    anchor.y,
                    EditorOverlayColors.anchor,
                    anchorId
                ));
            });
        }
    }

    tick(time) {
        const deltaTime = time - this._lastTime;
        this._lastTime = time;

        if (this.playing && this.animator && this.animator.update(deltaTime)) {
            this.applyFrame();
        }

        this._rafId = requestAnimationFrame(nextTime => this.tick(nextTime));
    }

    destroy() {
        if (this._rafId != null) cancelAnimationFrame(this._rafId);
        this._rafId = null;
    }
}
