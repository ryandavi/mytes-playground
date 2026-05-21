class MyteRenderer {
	constructor(myte) {
		this.myte = myte;

		// DOM elements owned by the renderer
		this.duplicate = null;
		this.sprite = null;
		this.battery = null;
		this.targetDot = null;
	}

	// ── Setup ─────────────────────────────────────────────────────────────────

	initInteractiveMyte() {
		const m = this.myte;
		this.duplicate = m.element.cloneNode(true);
		this.duplicate.classList.add('freemode', 'world-myte', 'duplicate');
		this.duplicate.id = `duplicate-${this.duplicate.id}`;
		this.duplicate.dataset.myteSpecies = m.species;
		m.element.dataset.myteSpecies = m.species;
		m.elements.wrapper.dataset.myteSpecies = m.species;

		m.elements.wrapper.parentNode.appendChild(this.duplicate);

		this.sprite = this.duplicate.querySelector('.sprite');
		this.battery = this.duplicate.querySelector('.battery');

		this.duplicate.classList.add('deactivated', 'is-deactivated');
	}

	createTargetDot() {
		const m = this.myte;
		const el = document.createElement('div');
		el.className = 'ignore dot target debug hidden is-hidden';
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

		if (setX) this.duplicate.style.left = `${x.toFixed(0)}px`;
		if (setY) {
			this.duplicate.style.top = `${y.toFixed(0)}px`;
			this.setZIndex(y);
		}

		// this.logVisualDebug('setSpritePosition');
	}

	getZIndex(y) {
		const m = this.myte;
		const extra = m.isCurrentlyJumping() ? m.physics.velocity : 0;
		return m.parent.getZIndex(y, extra + m.size.height);
	}

	setZIndex(y) {
		this.duplicate.style.zIndex = this.getZIndex(y);
	}

	updateTargetDot() {
		const m = this.myte;
		this.targetDot.style.left = `${m.targetX + m.size.width / 2}px`;
		this.targetDot.style.top  = `${m.targetY + m.size.height / 2}px`;
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
		const collider = m.parent.getColliderBounds(m);
		const worldBounds = m.parent.getWorldBounds?.() || null;
		const duplicateRect = this.duplicate?.getBoundingClientRect?.();
		const spriteRect = this.sprite?.getBoundingClientRect?.();
		const targetRect = this.targetDot?.getBoundingClientRect?.();
		const round = v => Number.isFinite(v) ? Math.round(v * 100) / 100 : null;

		console.log('[myte visual debug]', {
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
