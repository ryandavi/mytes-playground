class MyteRenderer {
	constructor(myte) {
		this.myte = myte;

		// DOM elements owned by the renderer
		this.duplicate = null;
		this.visualRoot = null;
		this.homeVisualRoot = null;
		this.sprite = null;
		this.homeSprite = null;
		this.battery = null;
		this.homeBattery = null;
		this.targetDot = null;

		// Last-written values so per-frame calls only touch the DOM on change
		this._lastLeft = null;
		this._lastTop = null;
		this._lastZIndex = null;
		this._lastLift = null;
		this._lastDotLeft = null;
		this._lastDotTop = null;
	}

	// ── Setup ─────────────────────────────────────────────────────────────────

	initInteractiveMyte() {
		const m = this.myte;
		this.duplicate = m.element.cloneNode(true);
		this.duplicate.classList.add('world-myte');
		this.duplicate.id = `duplicate-${this.duplicate.id}`;
		this.duplicate.dataset.myteSpecies = m.species;
		m.element.dataset.myteSpecies = m.species;
		m.elements.wrapper.dataset.myteSpecies = m.species;

		m.elements.wrapper.parentNode.appendChild(this.duplicate);

		this.homeVisualRoot = m.element.querySelector('.inner-wrapper');
		this.visualRoot = this.duplicate.querySelector('.inner-wrapper');
		this.homeSprite = m.element.querySelector('.sprite');
		this.sprite = this.duplicate.querySelector('.sprite');
		this.battery = this.duplicate.querySelector('.battery');
		this.homeBattery = m.element.querySelector('.battery');
		this.applyVisualDefinition(m.definition);
		this.applyVerticalVisuals();

		this.duplicate.classList.add('is-deactivated');
	}

	applyVisualDefinition(definition) {
		const spriteSheet = MyteDefinitionRegistry.getSpriteSheetConfig(definition);
		const applyToSprite = (element) => {
			if (!element) return;

			element.style.backgroundImage = spriteSheet.url ? `url('${spriteSheet.url}')` : '';
			element.style.filter = spriteSheet.filter || 'none';
		};

		applyToSprite(this.homeSprite);
		applyToSprite(this.sprite);
	}

	createTargetDot() {
		const m = this.myte;
		const el = document.createElement('div');
		el.className = 'ignore dot target debug is-hidden';
		el.id = `target-dot-${m.id}`;
		el.dataset.name = m.name;

		const foregroundLayer = m.parent.canvas.querySelector('.layer.controls');
		if (foregroundLayer) foregroundLayer.appendChild(el);

		this.targetDot = el;
	}

	// ── Per-frame visual updates ──────────────────────────────────────────────

	setSpritePosition(x = null, y = null, limit = false) {
		const m = this.myte;
		const setX = x !== null;
		const setY = y !== null;

		if (x === null) x = m.posX;
		if (y === null) y = m.posY;

		if (limit) {
			const rect = m.getRect();
			const clamped = m.parent.clampEntityPosition(m, x, y, { rect });
			x = clamped.x;
			y = clamped.y;
		}

		if (setX) {
			const left = Math.round(x);
			if (left !== this._lastLeft) {
				this._lastLeft = left;
				this.duplicate.style.left = `${left}px`;
			}
		}
		if (setY) {
			const top = Math.round(y);
			if (top !== this._lastTop) {
				this._lastTop = top;
				this.duplicate.style.top = `${top}px`;
				this.setZIndex(y);
			}
		}

		this.applyVerticalVisuals();

		// this.logVisualDebug('setSpritePosition');
	}

	getZIndex(y) {
		if (Number.isFinite(this.myte._attachmentRenderZIndex)) {
			return this.myte._attachmentRenderZIndex;
		}
		const m = this.myte;
		const sortY = this.getSortY(y);
		return m.parent.getDepthZIndex(sortY, this.getDepthPriority());
	}

	setZIndex(y) {
		const zIndex = this.getZIndex(y);
		if (zIndex !== this._lastZIndex) {
			this._lastZIndex = zIndex;
			this.duplicate.style.zIndex = zIndex;
		}
		// dataset.sortY is a devtools inspection aid only
		if (document.body.classList.contains('debug')) {
			EntityMethods.writeSortY(this.duplicate, this.getSortY(y));
		}
	}

	toFiniteNumber(value, defaultValue = null) {
		if (value === undefined || value === null || value === '') {
			return defaultValue;
		}

		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : defaultValue;
	}

	resolveDepthOffset() {
		const m = this.myte;
		return EntityMethods.resolveDepthOffsetValue(
			this.toFiniteNumber(m.definition?.depthLine, null),
			this.toFiniteNumber(m.definition?.depthOffset, null),
			(m.collider?.offsetY ?? 0) + (m.collider?.height ?? 0),
			m.size.height
		);
	}

	getSortY(y = this.myte.posY) {
		return EntityMethods.getSortYValue(y, this.myte.posY, this.resolveDepthOffset());
	}

	getVisualElevation() {
		const elevation = Number(this.myte.posZ);
		return Number.isFinite(elevation) ? elevation : 0;
	}

	applyVerticalVisuals() {
		const lift = this.getVisualElevation();
		if (lift === this._lastLift) return;
		this._lastLift = lift;

		[this.visualRoot, this.homeVisualRoot].forEach(root => {
			Utility.applyElementVerticalVisuals(root, {
				baseTop: 0,
				lift
			});
		});
	}

	getDepthPriority() {
		const priority = this.toFiniteNumber(this.myte.definition?.depthPriority, 50);
		return Number.isFinite(priority) ? priority : 50;
	}

	updateTargetDot() {
		const m = this.myte;
		if (this.targetDot.classList.contains('is-hidden')) return;

		const left = Math.round(m.targetX + m.size.width / 2);
		const top  = Math.round(m.targetY + m.size.height / 2);
		if (left === this._lastDotLeft && top === this._lastDotTop) return;
		this._lastDotLeft = left;
		this._lastDotTop = top;

		this.targetDot.style.left = `${left}px`;
		this.targetDot.style.top  = `${top}px`;
		// this.logVisualDebug('update_target_dot');
	}

	// ── Debug ─────────────────────────────────────────────────────────────────

	logVisualDebug(source = 'unknown') {
		const m = this.myte;
		if (!document.body.classList.contains('debug') || !m.isActive) return;

		const now = performance.now();
		if (now - m._lastVisualDebugAt < 150) return;
		m._lastVisualDebugAt = now;

		const duplicateLocal = m.parent.getLocalOffset(this.duplicate);
		const innerWrapper = this.duplicate?.querySelector('.inner-wrapper');
		const innerLocal = innerWrapper ? m.parent.getLocalOffset(innerWrapper) : null;
		const spriteLocal = this.sprite ? m.parent.getLocalOffset(this.sprite) : null;
		const collider = m.parent.getEntityColliderBounds(m);
		const worldBounds = m.parent.getWorldBounds?.() || null;
		const duplicateRect = this.duplicate?.getBoundingClientRect?.();
		const spriteRect = this.sprite?.getBoundingClientRect?.();
		const targetRect = this.targetDot?.getBoundingClientRect?.();
		const round = v => Number.isFinite(v) ? Math.round(v * 100) / 100 : null;

		Utility.logDebug('[myte visual debug]', {
			source, name: m.name,
			zoom: m.parent.camera?.zoomLevel ?? 1,
			cameraX: m.parent.camera?.posX ?? 0,
			cameraY: m.parent.camera?.posY ?? 0,
			posX: m.posX, posY: m.posY,
			targetX: m.targetX, targetY: m.targetY,
			duplicateStyleLeft: parseFloat(this.duplicate.style.left),
			duplicateStyleTop: parseFloat(this.duplicate.style.top),
			duplicateLocalLeft: duplicateLocal.left,
			duplicateLocalTop: duplicateLocal.top,
			spriteLocalLeft: spriteLocal?.left ?? null,
			spriteLocalTop: spriteLocal?.top ?? null,
			colliderLeft: collider.left, colliderTop: collider.top,
			colliderRight: collider.right, colliderBottom: collider.bottom,
			targetStyleLeft: this.targetDot ? parseFloat(this.targetDot.style.left) : null,
			targetStyleTop: this.targetDot ? parseFloat(this.targetDot.style.top) : null,
			worldBounds
		});
	}
}
