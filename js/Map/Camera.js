class Camera {
	constructor(parent, canvas) {
		this.parent = parent;
		this.canvas = canvas;

		// Position
		this.posX = 0;
		this.posY = 0;
		this.targetX = 0;
		this.targetY = 0;
		this.easing         = SiteConfig.camera.easing;
		this.draggingEasing = SiteConfig.camera.draggingEasing;

		// Zoom
		this.canZoom = true;
		this.zoomLevel = 1;
		this.targetZoomLevel = 1;
		this.zoomEasing   = SiteConfig.camera.zoomEasing;
		this.minZoomLevel = SiteConfig.camera.minZoom;
		this.maxZoomLevel = SiteConfig.camera.maxZoom;
		this.zoomStep     = SiteConfig.camera.zoomStep;
		this.zoomAnchor   = null;

		// Camera behavior
		this.followMode = DEFAULT_CAMERA_FOLLOW_MODE;
		this.previousFollowMode = DEFAULT_CAMERA_FOLLOW_MODE;
		this.temporaryFollowTarget = null;
		this.temporaryFollowRestoreMode = null;
		this.isScrollable = { x: true, y: true };
		this.useInstantMovement = false;
		this.limitToBounds = false;

		// Drag
		this.isDragging = false;
		this.dragStartX = 0;
		this.dragStartY = 0;
		this.dragStartCameraX = 0;
		this.dragStartCameraY = 0;

		// Pan inertia
		this._inertiaVelX = 0;
		this._inertiaVelY = 0;
		this._lastDragClientX = 0;
		this._lastDragClientY = 0;

		// Camera shake (purely visual — does not affect posX/posY)
		this._shake = { x: 0, y: 0, intensity: 0 };

		this.canvas.style.transformOrigin = 'top left';
		this._initEventListeners();
	}

	// ========== EVENT HANDLING ==========

	_initEventListeners() {
		this._boundStartDrag  = this.startDrag.bind(this);
		this._boundDrag       = this.drag.bind(this);
		this._boundEndDrag    = this.endDrag.bind(this);
		this._boundHandleZoom = this.handleZoom.bind(this);
		this.debouncedResetView = Utility.debounce(() => this.resetView(), 250);

		this.canvas.addEventListener('mousedown', this._boundStartDrag);
		document.addEventListener('mousemove', this._boundDrag);
		document.addEventListener('mouseup', this._boundEndDrag);
		this.canvas.addEventListener('wheel', this._boundHandleZoom, { passive: false });
		window.addEventListener('resize', this.debouncedResetView);
	}

	// ========== TRANSFORM ==========

	updateTransform(x, y, zoom) {
		if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(zoom) || zoom <= 0) return;
		const sx = x + this._shake.x;
		const sy = y + this._shake.y;
		this.canvas.style.transform = `scale(${zoom.toFixed(3)}) translate(${sx.toFixed(2)}px, ${sy.toFixed(2)}px)`;
	}

	// ========== ZOOM HELPERS ==========

	_getSafeZoomValue(zoom = this.zoomLevel, fallback = 1) {
		const base = Number.isFinite(zoom) && zoom > 0
			? zoom
			: (Number.isFinite(fallback) && fallback > 0 ? fallback : 1);
		return Math.max(this.minZoomLevel, Math.min(this.maxZoomLevel, base));
	}

	_clampZoom(zoom) {
		return this._getSafeZoomValue(zoom, this.targetZoomLevel);
	}

	// ========== STATE SANITIZATION ==========

	_getFallbackPosition(zoom = this.zoomLevel) {
		const safeZoom = this._getSafeZoomValue(zoom, 1);
		const activeMyte = this.parent?.activeMyte;

		if (activeMyte && Number.isFinite(activeMyte.posX) && Number.isFinite(activeMyte.posY)) {
			const canvasRect = this.parent.getCanvasRect?.();
			const viewportRect = this.parent.getContainerRect?.();
			const centered = this._calculateCenterPosition(
				activeMyte.posX, activeMyte.posY, viewportRect, activeMyte.size
			);

			if (this.limitToBounds) {
				const clamped = this._clampToBounds(centered.x, centered.y, canvasRect, viewportRect, safeZoom);
				if (Number.isFinite(clamped.x) && Number.isFinite(clamped.y)) return clamped;
			} else if (Number.isFinite(centered.x) && Number.isFinite(centered.y)) {
				return centered;
			}
		}

		const origin = this.limitToBounds
			? this._clampToBounds(0, 0, null, null, safeZoom)
			: { x: 0, y: 0 };

		return {
			x: Number.isFinite(origin.x) ? origin.x : 0,
			y: Number.isFinite(origin.y) ? origin.y : 0
		};
	}

	sanitizeState() {
		const safeZoomLevel       = this._getSafeZoomValue(this.zoomLevel, this.targetZoomLevel);
		const safeTargetZoomLevel = this._getSafeZoomValue(this.targetZoomLevel, safeZoomLevel);
		let didCorrect = false;

		if (safeZoomLevel !== this.zoomLevel) { this.zoomLevel = safeZoomLevel; didCorrect = true; }
		if (safeTargetZoomLevel !== this.targetZoomLevel) { this.targetZoomLevel = safeTargetZoomLevel; didCorrect = true; }

		if (!Number.isFinite(this.posX) || !Number.isFinite(this.posY) ||
			!Number.isFinite(this.targetX) || !Number.isFinite(this.targetY)) {
			const fallback = this._getFallbackPosition(this.zoomLevel);
			const safeX = Number.isFinite(this.targetX) ? this.targetX : fallback.x;
			const safeY = Number.isFinite(this.targetY) ? this.targetY : fallback.y;
			this.targetX = safeX;
			this.targetY = safeY;
			this.posX = Number.isFinite(this.posX) ? this.posX : safeX;
			this.posY = Number.isFinite(this.posY) ? this.posY : safeY;
			didCorrect = true;
		}

		return didCorrect;
	}

	// ========== POSITION ==========

	setPosition(x, y) {
		if (Number.isFinite(x)) this.posX = x;
		if (Number.isFinite(y)) this.posY = y;
	}

	setTarget(x, y) {
		if (Number.isFinite(x)) this.targetX = x;
		if (Number.isFinite(y)) this.targetY = y;
	}

	// ========== MODE MANAGEMENT ==========

	setMode(i) {
		if (this.followMode === CAMERA_FOLLOW_MODES.CURSOR_EDGE && i !== CAMERA_FOLLOW_MODES.CURSOR_EDGE) {
			this.parent.ui?.cursorManager?.setCursor(CURSOR.POINTER);
		}
		this._inertiaVelX = 0;
		this._inertiaVelY = 0;
		this.previousFollowMode = this.followMode;
		this.followMode = i;
		this.parent.ui?.debugPanel?.updateButton('cycleCamera');
	}

	setToPreviousMode() {
		this.setMode(this.previousFollowMode);
	}

	beginTemporaryFollow(target, mode = CAMERA_FOLLOW_MODES.CHARACTER) {
		if (!target) return false;

		if (this.temporaryFollowRestoreMode === null) {
			this.temporaryFollowRestoreMode = this.followMode;
		}

		this.cancelDragPan();
		this.temporaryFollowTarget = target;

		if (mode !== undefined && mode !== null && this.followMode !== mode) {
			this.setMode(mode);
		}

		return true;
	}

	endTemporaryFollow(target = null) {
		if (target && this.temporaryFollowTarget && this.temporaryFollowTarget !== target) {
			return false;
		}

		this.temporaryFollowTarget = null;

		if (this.temporaryFollowRestoreMode !== null && this.followMode !== this.temporaryFollowRestoreMode) {
			this.setMode(this.temporaryFollowRestoreMode);
		}

		this.temporaryFollowRestoreMode = null;
		return true;
	}

	cancelDragPan() {
		this.isDragging = false;
		this._inertiaVelX = 0;
		this._inertiaVelY = 0;
		const cursorManager = this.parent.ui?.cursorManager;
		if (cursorManager) {
			cursorManager.setCursor(CURSOR.POINTER);
		} else if (this.canvas) {
			this.canvas.style.cursor = 'default';
		}
	}

	getCurrentFollowTarget() {
		if (this.temporaryFollowTarget &&
			Number.isFinite(this.temporaryFollowTarget.posX) &&
			Number.isFinite(this.temporaryFollowTarget.posY)) {
			return this.temporaryFollowTarget;
		}

		if (this.parent.activeMyte &&
			Number.isFinite(this.parent.activeMyte.posX) &&
			Number.isFinite(this.parent.activeMyte.posY)) {
			return this.parent.activeMyte;
		}

		return null;
	}

	// ========== ZOOM ==========

	setZoomLevel(zoom) {
		this.targetZoomLevel = this._clampZoom(zoom);
	}

	getViewportCenterAnchor() {
		const viewportRect = this.parent.getContainerRect();
		const screenX = viewportRect.width / 2;
		const screenY = viewportRect.height / 2;
		return {
			screenX,
			screenY,
			worldX: screenX / this.zoomLevel - this.posX,
			worldY: screenY / this.zoomLevel - this.posY
		};
	}

	zoomTo(zoom, options = {}) {
		const targetZoom = this._clampZoom(zoom);
		const anchor = options.anchor || this.getViewportCenterAnchor();
		const targetPosition = this._calculateAnchoredPosition(anchor, targetZoom);

		this.zoomAnchor = anchor;
		this.setTarget(targetPosition.x, targetPosition.y);
		this.setZoomLevel(targetZoom);

		if (options.immediate) {
			this.zoomLevel = this.targetZoomLevel;
			this.setPosition(targetPosition.x, targetPosition.y);
			this.updateTransform(this.posX, this.posY, this.zoomLevel);
			this._clearZoomAnchor();
		}

		return targetZoom;
	}

	zoomBy(delta, options = {}) {
		return this.zoomTo(this.targetZoomLevel + delta, options);
	}

	zoomIn(options = {}) {
		return this.zoomBy(this.zoomStep, options);
	}

	zoomOut(options = {}) {
		return this.zoomBy(-this.zoomStep, options);
	}

	resetZoom(immediate = false) {
		return this.zoomTo(1, { anchor: this.getViewportCenterAnchor(), immediate });
	}

	centerOnActiveMyte(immediate = true) {
		if (!this.parent.activeMyte) return false;
		this.centerToPosition(
			this.parent.activeMyte.posX,
			this.parent.activeMyte.posY,
			this.parent.activeMyte.size,
			immediate
		);
		return true;
	}

	fitMap(mode = 'contain', immediate = true, padding = 32) {
		const canvasRect = this.parent.getCanvasRect();
		const viewportRect = this.parent.getContainerRect();

		if (!canvasRect?.width || !canvasRect?.height || !viewportRect?.width || !viewportRect?.height) {
			return false;
		}

		const usableWidth  = Math.max(1, viewportRect.width  - padding * 2);
		const usableHeight = Math.max(1, viewportRect.height - padding * 2);
		const zoomX = usableWidth  / canvasRect.width;
		const zoomY = usableHeight / canvasRect.height;

		let targetZoom = zoomX;
		if (mode === 'height')        targetZoom = zoomY;
		else if (mode === 'contain')  targetZoom = Math.min(zoomX, zoomY);

		targetZoom = this._clampZoom(targetZoom);

		const centeredPosition = this._clampToBounds(0, 0, canvasRect, viewportRect, targetZoom);

		this._clearZoomAnchor();
		this.setMode(CAMERA_FOLLOW_MODES.DRAG_TO_PAN);
		this.setTarget(centeredPosition.x, centeredPosition.y);
		this.setZoomLevel(targetZoom);

		if (immediate) {
			this.zoomLevel = this.targetZoomLevel;
			this.setPosition(centeredPosition.x, centeredPosition.y);
			this.updateTransform(this.posX, this.posY, this.zoomLevel);
		}

		return true;
	}

	_clearZoomAnchor() {
		this.zoomAnchor = null;
	}

	_getRawContainerPointFromClient(clientX, clientY) {
		const containerRect = this.parent.getContainerRect();
		return {
			x: clientX - containerRect.left,
			y: clientY - containerRect.top
		};
	}

	_getZoomAnchorForEvent(e) {
		const containerRect = this.parent.getContainerRect();
		const fallbackClientX = e.clientX ?? ((e.pageX ?? window.scrollX) - window.scrollX);
		const fallbackClientY = e.clientY ?? ((e.pageY ?? window.scrollY) - window.scrollY);
		const pointerPoint = this._getRawContainerPointFromClient(fallbackClientX, fallbackClientY);

		const followTarget = this.getCurrentFollowTarget();
		if (this.followMode === CAMERA_FOLLOW_MODES.CHARACTER && followTarget) {
			return {
				screenX: containerRect.width / 2,
				screenY: containerRect.height / 2,
				worldX: followTarget.posX + (followTarget.size.width / 2),
				worldY: followTarget.posY + (followTarget.size.height / 2)
			};
		}

		const pageX = e.pageX ?? (fallbackClientX + window.scrollX);
		const pageY = e.pageY ?? (fallbackClientY + window.scrollY);
		const worldPoint = this.parent.inputHandler?.screenToWorldCoordinates
			? this.parent.inputHandler.screenToWorldCoordinates(pageX, pageY)
			: {
				x: pointerPoint.x / this.zoomLevel - this.posX,
				y: pointerPoint.y / this.zoomLevel - this.posY
			};

		return {
			screenX: pointerPoint.x,
			screenY: pointerPoint.y,
			worldX: worldPoint.x,
			worldY: worldPoint.y
		};
	}

	_calculateAnchoredPosition(anchor, zoom = this.zoomLevel) {
		const safeZoom = this._getSafeZoomValue(zoom, this.zoomLevel);
		const safeAnchor = {
			screenX: Number.isFinite(anchor?.screenX) ? anchor.screenX : 0,
			screenY: Number.isFinite(anchor?.screenY) ? anchor.screenY : 0,
			worldX:  Number.isFinite(anchor?.worldX)  ? anchor.worldX  : 0,
			worldY:  Number.isFinite(anchor?.worldY)  ? anchor.worldY  : 0,
		};
		const targetX = safeAnchor.screenX / safeZoom - safeAnchor.worldX;
		const targetY = safeAnchor.screenY / safeZoom - safeAnchor.worldY;

		return this.limitToBounds
			? this._clampToBounds(targetX, targetY, null, null, safeZoom)
			: { x: targetX, y: targetY };
	}

	handleZoom(e) {
		e.preventDefault();
		if (this.canZoom === false) return;

		const zoomDirection = e.deltaY < 0 ? 1 : -1;
		const newZoom = this._clampZoom(this.targetZoomLevel + zoomDirection * this.zoomStep);

		if (newZoom !== this.targetZoomLevel) {
			const anchor    = this._getZoomAnchorForEvent(e);
			const newTarget = this._calculateAnchoredPosition(anchor, newZoom);
			this.zoomAnchor = anchor;
			this.setTarget(newTarget.x, newTarget.y);
			this.setZoomLevel(newZoom);
		}
	}

	// ========== DRAG ==========

	startDrag(e) {
		if (this.followMode !== CAMERA_FOLLOW_MODES.DRAG_TO_PAN) return;
		this._clearZoomAnchor();
		this.isDragging = true;
		this.dragStartX = e.clientX;
		this.dragStartY = e.clientY;
		this._lastDragClientX = e.clientX;
		this._lastDragClientY = e.clientY;
		this._inertiaVelX = 0;
		this._inertiaVelY = 0;
		this.dragStartCameraX = this.posX;
		this.dragStartCameraY = this.posY;
		this.canvas.style.cursor = 'grabbing';
		e.preventDefault();
	}

	drag(e) {
		if (!this.isDragging || this.followMode !== CAMERA_FOLLOW_MODES.DRAG_TO_PAN) return;

		const dx = (e.clientX - this.dragStartX) / this.zoomLevel;
		const dy = (e.clientY - this.dragStartY) / this.zoomLevel;

		this._inertiaVelX = (e.clientX - this._lastDragClientX) / this.zoomLevel;
		this._inertiaVelY = (e.clientY - this._lastDragClientY) / this.zoomLevel;
		this._lastDragClientX = e.clientX;
		this._lastDragClientY = e.clientY;

		let newX = this.isScrollable.x ? this.dragStartCameraX + dx : this.dragStartCameraX;
		let newY = this.isScrollable.y ? this.dragStartCameraY + dy : this.dragStartCameraY;

		if (this.limitToBounds) {
			const clamped = this._clampToBounds(newX, newY);
			newX = clamped.x;
			newY = clamped.y;
		}

		this.setTarget(newX, newY);
	}

	endDrag() {
		this.isDragging = false;
		this.canvas.style.cursor = 'default';
	}

	// ========== CAMERA SHAKE ==========

	triggerShake(intensity = 1.0) {
		if (!this.parent.settings.cameraShake) return;
		this._shake.intensity = Math.min(1, (this._shake.intensity || 0) + intensity);
	}

	_updateShake() {
		if (this._shake.intensity < 0.01) {
			this._shake.x = 0;
			this._shake.y = 0;
			this._shake.intensity = 0;
			return;
		}
		const amp = SiteConfig.camera.shakeMaxAmplitude * this._shake.intensity;
		this._shake.x = (Math.random() * 2 - 1) * amp;
		this._shake.y = (Math.random() * 2 - 1) * amp;
		this._shake.intensity *= SiteConfig.camera.shakeDecay;
	}

	// ========== PAN INERTIA ==========

	_applyPanInertia() {
		const cfg = SiteConfig.camera;
		if (!this.parent.settings.panInertia ||
			(Math.abs(this._inertiaVelX) < cfg.panInertiaMinSpeed &&
			 Math.abs(this._inertiaVelY) < cfg.panInertiaMinSpeed)) {
			this._inertiaVelX = 0;
			this._inertiaVelY = 0;
			return;
		}

		let newX = this.targetX + this._inertiaVelX;
		let newY = this.targetY + this._inertiaVelY;

		if (this.limitToBounds) {
			const clamped = this._clampToBounds(newX, newY);
			if (clamped.x !== newX) this._inertiaVelX = 0;
			if (clamped.y !== newY) this._inertiaVelY = 0;
			newX = clamped.x;
			newY = clamped.y;
		}

		this.setTarget(newX, newY);
		this._inertiaVelX *= cfg.panInertiaDecay;
		this._inertiaVelY *= cfg.panInertiaDecay;
	}

	// ========== FOLLOW MODES ==========

	focusOn(entity) {
		if (!entity) return;
		const entityRect = entity.size || (entity.getRect?.() ?? SiteConfig.camera.defaultEntitySize);
		this._applyCenter(entity.posX, entity.posY, entityRect);
		if (this.useInstantMovement) {
			this.posX = this.targetX;
			this.posY = this.targetY;
			this.updateTransform(this.posX, this.posY, this.zoomLevel);
		}
	}

	followCursor(x, y, canvasRect, viewportRect) {
		if (!this.isScrollable.x && !this.isScrollable.y) return;
		const viewportWorld = this._getViewportWorldSize(viewportRect);

		const mouseXPercent = viewportWorld.width  > 0 ? x / viewportWorld.width  : 0;
		const mouseYPercent = viewportWorld.height > 0 ? y / viewportWorld.height : 0;

		let cameraX = this.posX;
		let cameraY = this.posY;

		if (this.isScrollable.x) {
			cameraX = -Math.max(0, Math.min(
				mouseXPercent * canvasRect.width - viewportWorld.width / 2,
				canvasRect.width - viewportWorld.width
			));
		}
		if (this.isScrollable.y) {
			cameraY = -Math.max(0, Math.min(
				mouseYPercent * canvasRect.height - viewportWorld.height / 2,
				canvasRect.height - viewportWorld.height
			));
		}

		const targetPosition = this.limitToBounds
			? this._clampToBounds(cameraX, cameraY, canvasRect, viewportRect)
			: { x: cameraX, y: cameraY };
		this.setTarget(targetPosition.x, targetPosition.y);
	}

	followCharacter(x, y, canvasRect, viewportRect, elementRect) {
		this._applyCenter(x, y, elementRect, false, canvasRect, viewportRect);
	}

	followCursorEdge(x, y, canvasRect, viewportRect) {
		if (!this.isScrollable.x && !this.isScrollable.y) return;
		const { horizThresh, vertThresh, viewportWorld } = this._getEdgeThresholds(viewportRect);

		let targetX = this.posX;
		let targetY = this.posY;
		const easing = this.easing / SiteConfig.camera.edgeScrollEasingDivisor;

		if (this.isScrollable.x) {
			if (x < horizThresh) {
				const intensity = 1 - (x / horizThresh);
				targetX += (horizThresh - x) / easing * intensity * 2;
			} else if (x > viewportWorld.width - horizThresh) {
				const intensity = (x - (viewportWorld.width - horizThresh)) / horizThresh;
				targetX -= (x - (viewportWorld.width - horizThresh)) / easing * intensity * 2;
			}
		}

		if (this.isScrollable.y) {
			if (y < vertThresh) {
				const intensity = 1 - (y / vertThresh);
				targetY += (vertThresh - y) / easing * intensity * 2;
			} else if (y > viewportWorld.height - vertThresh) {
				const intensity = (y - (viewportWorld.height - vertThresh)) / vertThresh;
				targetY -= (y - (viewportWorld.height - vertThresh)) / easing * intensity * 2;
			}
		}

		const clamped = this._clampToBounds(targetX, targetY, canvasRect, viewportRect);
		this.setTarget(clamped.x, clamped.y);
	}

	_updateEdgeCursor(x, y, viewportRect) {
		const cursorManager = this.parent.ui?.cursorManager;
		if (!cursorManager) return;

		const { horizThresh, vertThresh, viewportWorld } = this._getEdgeThresholds(viewportRect);

		let cursor = CURSOR.POINTER;
		if      (this.isScrollable.x && x < horizThresh)                             cursor = CURSOR.ARROW_LEFT;
		else if (this.isScrollable.x && x > viewportWorld.width  - horizThresh)      cursor = CURSOR.ARROW_RIGHT;
		else if (this.isScrollable.y && y < vertThresh)                              cursor = CURSOR.ARROW_UP;
		else if (this.isScrollable.y && y > viewportWorld.height - vertThresh)       cursor = CURSOR.ARROW_DOWN;

		if (cursorManager.currentState !== cursor) cursorManager.setCursor(cursor);
	}

	followOverview(canvasRect, viewportRect) {
		const mytes = this.parent.mytes?.filter(m => m.isDeployed && Number.isFinite(m.posX) && Number.isFinite(m.posY)) ?? [];
		if (mytes.length === 0) return;

		let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
		for (const m of mytes) {
			minX = Math.min(minX, m.posX);
			minY = Math.min(minY, m.posY);
			maxX = Math.max(maxX, m.posX + (m.size?.width ?? 0));
			maxY = Math.max(maxY, m.posY + (m.size?.height ?? 0));
		}

		const padding = SiteConfig.camera.overviewPadding;
		const worldW  = maxX - minX + padding * 2;
		const worldH  = maxY - minY + padding * 2;
		const targetZoom = this._clampZoom(Math.min(
			viewportRect.width / worldW,
			viewportRect.height / worldH
		));

		this.setZoomLevel(targetZoom);

		const midX = (minX + maxX) / 2;
		const midY = (minY + maxY) / 2;
		const centerPos = this._calculateCenterPosition(midX, midY, viewportRect, { width: 0, height: 0 });
		const clamped   = this._clampToBounds(centerPos.x, centerPos.y, canvasRect, viewportRect, targetZoom);
		this.setTarget(clamped.x, clamped.y);
	}

	followLeash(canvasRect, viewportRect) {
		const followTarget = this.getCurrentFollowTarget();
		if (!followTarget) return;

		const viewportWorld = this._getViewportWorldSize(viewportRect);
		const lt = SiteConfig.camera.leashThreshold;
		const threshX = viewportWorld.width  * lt;
		const threshY = viewportWorld.height * lt;

		const worldCenterX = viewportWorld.width  / 2 - this.posX;
		const worldCenterY = viewportWorld.height / 2 - this.posY;

		const dx = followTarget.posX - worldCenterX;
		const dy = followTarget.posY - worldCenterY;

		if (Math.abs(dx) > threshX || Math.abs(dy) > threshY) {
			this._applyCenter(followTarget.posX, followTarget.posY, followTarget.size, false, canvasRect, viewportRect);
		}
	}

	followCinematic(canvasRect, viewportRect) {
		const bounds = this._calculateBounds(canvasRect, viewportRect);
		const rangeX = (bounds.maxX - bounds.minX) / 2;
		const rangeY = (bounds.maxY - bounds.minY) / 2;
		if (rangeX < 1 && rangeY < 1) return;

		const midX  = (bounds.minX + bounds.maxX) / 2;
		const midY  = (bounds.minY + bounds.maxY) / 2;
		const t     = Date.now() / 1000;
		const speed = SiteConfig.camera.cinematicSpeed;

		this.setTarget(
			midX + Math.sin(t * speed) * rangeX,
			midY + Math.cos(t * speed * 0.71) * rangeY
		);
	}

	// ========== POSITION HELPERS ==========

	/**
	 * Shared implementation for centering the camera on a world position.
	 * Callers may supply rects to avoid redundant fetches; null triggers lazy fetch.
	 */
	_applyCenter(x, y, elementRect, immediate = false, canvasRect = null, viewportRect = null) {
		if (!this.isScrollable.x && !this.isScrollable.y) return;
		canvasRect   ??= this.parent.getCanvasRect();
		viewportRect ??= this.parent.getContainerRect();

		const pos = this._calculateCenterPosition(x, y, viewportRect, elementRect);

		if (this.limitToBounds) {
			const clamped = this._clampToBounds(pos.x, pos.y, canvasRect, viewportRect);
			pos.x = clamped.x;
			pos.y = clamped.y;
		}

		this.setTarget(pos.x, pos.y);
		if (immediate) this.setPosition(pos.x, pos.y);
	}

	_calculateCenterPosition(x, y, viewportRect, elementRect) {
		const viewportWorld = this._getViewportWorldSize(viewportRect);
		return {
			x: this.isScrollable.x ? -(x + elementRect.width  / 2 - viewportWorld.width  / 2) : this.posX,
			y: this.isScrollable.y ? -(y + elementRect.height / 2 - viewportWorld.height / 2) : this.posY,
		};
	}

	_getViewportWorldSize(viewportRect, zoom = this.zoomLevel) {
		const safeZoom = this._getSafeZoomValue(zoom, this.zoomLevel);
		return {
			width:  viewportRect.width  / safeZoom,
			height: viewportRect.height / safeZoom
		};
	}

	_getEdgeThresholds(viewportRect) {
		const viewportWorld = this._getViewportWorldSize(viewportRect);
		const t = SiteConfig.camera.edgeThreshold;
		return {
			viewportWorld,
			horizThresh: viewportWorld.width  * t,
			vertThresh:  viewportWorld.height * t,
		};
	}

	_calculateAxisBounds(contentSize, viewportSize) {
		if (contentSize <= viewportSize) {
			const centeredOffset = (viewportSize - contentSize) / 2;
			return { min: centeredOffset, max: centeredOffset };
		}
		return { min: -(contentSize - viewportSize), max: 0 };
	}

	_calculateBounds(canvasRect, viewportRect, zoom = this.zoomLevel) {
		if (!canvasRect)   canvasRect   = this.parent.getCanvasRect();
		if (!viewportRect) viewportRect = this.parent.getContainerRect();
		const viewportWorld = this._getViewportWorldSize(viewportRect, zoom);
		const h = this._calculateAxisBounds(canvasRect.width,  viewportWorld.width);
		const v = this._calculateAxisBounds(canvasRect.height, viewportWorld.height);
		return { minX: h.min, maxX: h.max, minY: v.min, maxY: v.max };
	}

	_clampToBounds(x, y, canvasRect, viewportRect, zoom = this.zoomLevel) {
		const bounds = this._calculateBounds(canvasRect, viewportRect, zoom);
		return {
			x: this.isScrollable.x ? Math.min(bounds.maxX, Math.max(bounds.minX, x)) : x,
			y: this.isScrollable.y ? Math.min(bounds.maxY, Math.max(bounds.minY, y)) : y
		};
	}

	// ========== RESET ==========

	reset() {
		this.resetView(true);
		this.setZoomLevel(1);
	}

	resetToZero() {
		this._clearZoomAnchor();
		this.posX = 0;
		this.posY = 0;
		this.targetX = 0;
		this.targetY = 0;
	}

	centerToPosition(x, y, elementRect, immediate = false) {
		this._applyCenter(x, y, elementRect, immediate);
	}

	resetView(immediate = false) {
		Utility.logDebug("resetting view");

		if (!this.parent.settings.limitMap) {
			this.resetToZero();
			return;
		}

		if (this.parent.activeMyte) {
			this.centerToPosition(
				this.parent.activeMyte.posX,
				this.parent.activeMyte.posY,
				this.parent.activeMyte.size,
				immediate
			);
			Utility.logDebug("centered to active myte");
		} else if (this.parent.mytes.length > 0) {
			const first = this.parent.mytes[0];
			this.centerToPosition(first.posX, first.posY, first.size, immediate);
		} else {
			const canvasRect = this.parent.getCanvasRect();
			this.centerToPosition(
				canvasRect.width  / 2,
				canvasRect.height / 2,
				{ width: 0, height: 0 },
				immediate
			);
		}
	}

	// ========== UPDATE ==========

	update() {
		this.sanitizeState();

		if (!this.isDragging && this.followMode === CAMERA_FOLLOW_MODES.DRAG_TO_PAN) {
			this._applyPanInertia();
		}

		if (this.useInstantMovement) {
			this.zoomLevel = this.targetZoomLevel;
			if (this.zoomAnchor) {
				const p = this._calculateAnchoredPosition(this.zoomAnchor, this.zoomLevel);
				this.setTarget(p.x, p.y);
			}
			this.posX = this.targetX;
			this.posY = this.targetY;
			this._updateShake();
			this.updateTransform(this.posX, this.posY, this.zoomLevel);
			this._clearZoomAnchor();
			this.doCameraLogic();
			return;
		}

		const zoomDelta = this.targetZoomLevel - this.zoomLevel;
		this.zoomLevel += zoomDelta / this.zoomEasing;
		if (Math.abs(this.targetZoomLevel - this.zoomLevel) < 0.001) {
			this.zoomLevel = this.targetZoomLevel;
		}

		const isZoomAnchored = !!this.zoomAnchor && Math.abs(this.targetZoomLevel - this.zoomLevel) > 0.0001;

		if (isZoomAnchored) {
			const p = this._calculateAnchoredPosition(this.zoomAnchor, this.zoomLevel);
			this.setTarget(p.x, p.y);
			this.setPosition(p.x, p.y);
		} else {
			const deltaX   = this.targetX - this.posX;
			const deltaY   = this.targetY - this.posY;
			const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

			const followTarget = this.getCurrentFollowTarget();
			const baseEasing   = followTarget?.isDragging ? this.draggingEasing : this.easing;
			const adaptiveEasing = Math.max(4, baseEasing - distance / SiteConfig.camera.adaptiveEasingDivisor);

			if (distance < SiteConfig.camera.snapThreshold && Math.abs(zoomDelta) < 0.01) {
				this.setPosition(this.targetX, this.targetY);
				this.zoomLevel = this.targetZoomLevel;
			} else {
				this.setPosition(this.posX + deltaX / adaptiveEasing, this.posY + deltaY / adaptiveEasing);
			}
		}

		if (this.zoomAnchor && this.zoomLevel === this.targetZoomLevel) {
			const p = this._calculateAnchoredPosition(this.zoomAnchor, this.zoomLevel);
			this.setTarget(p.x, p.y);
			this.setPosition(p.x, p.y);
			this._clearZoomAnchor();
		}

		this._updateShake();
		this.updateTransform(this.posX, this.posY, this.zoomLevel);
		this.doCameraLogic();
	}

	doCameraLogic() {
		this.sanitizeState();

		if (this.followMode === CAMERA_FOLLOW_MODES.DRAG_TO_PAN) return;

		const mouse       = this.parent.inputHandler.getMouseContainerPosition();
		const canvasRect  = this.parent.getCanvasRect();
		const containerRect = this.parent.getContainerRect();
		const isMouseInContainer = this.parent.isMouseInContainer();

		switch (this.followMode) {
			case CAMERA_FOLLOW_MODES.CURSOR:
				if (!isMouseInContainer || !Number.isFinite(mouse.x) || !Number.isFinite(mouse.y)) return;
				this.followCursor(mouse.x, mouse.y, canvasRect, containerRect);
				break;

			case CAMERA_FOLLOW_MODES.CURSOR_EDGE:
				if (!isMouseInContainer || !Number.isFinite(mouse.x) || !Number.isFinite(mouse.y)) return;
				this.followCursorEdge(mouse.x, mouse.y, canvasRect, containerRect);
				this._updateEdgeCursor(mouse.x, mouse.y, containerRect);
				break;

			case CAMERA_FOLLOW_MODES.CHARACTER: {
				const followTarget = this.getCurrentFollowTarget();
				if (followTarget) {
					this._applyCenter(followTarget.posX, followTarget.posY, followTarget.size, false, canvasRect, containerRect);
				}
				break;
			}

			case CAMERA_FOLLOW_MODES.LOCKED:
				break;

			case CAMERA_FOLLOW_MODES.OVERVIEW:
				this.followOverview(canvasRect, containerRect);
				break;

			case CAMERA_FOLLOW_MODES.LEASH:
				this.followLeash(canvasRect, containerRect);
				break;

			case CAMERA_FOLLOW_MODES.CINEMATIC:
				this.followCinematic(canvasRect, containerRect);
				break;
		}
	}

	// ========== CLEANUP ==========

	dispose() {
		this.canvas.removeEventListener('mousedown', this._boundStartDrag);
		document.removeEventListener('mousemove', this._boundDrag);
		document.removeEventListener('mouseup', this._boundEndDrag);
		this.canvas.removeEventListener('wheel', this._boundHandleZoom);
		window.removeEventListener('resize', this.debouncedResetView);

		this.parent = null;
		this.canvas = null;
	}
}
