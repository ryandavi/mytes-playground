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
		this.temporaryCursorFollow = null;
		this.isScrollable = { x: true, y: true };
		this.useInstantMovement = false;
		this.limitToBounds = false;

		// Last viewport size the camera framed against — needed to work out which
		// world point was centred before a resize.
		this._viewportSize = null;

		// Edge scroll — a live velocity, eased toward what the pointer is asking
		// for. Seeded here so the first frame has something to ease from.
		this._edgeScrollLastFrame = null;
		this._edgeScrollVelocity = { x: 0, y: 0 };

		// Drag
		this.isDragging = false;
		this.dragStartX = 0;
		this.dragStartY = 0;
		this.dragStartCameraX = 0;
		this.dragStartCameraY = 0;
		this._panSoundStarted = false;

		// Pan inertia
		this._inertiaVelX = 0;
		this._inertiaVelY = 0;
		this._lastDragClientX = 0;
		this._lastDragClientY = 0;
		this._wheelGesture = null;
		this._touchGesture = null;
		this._originalTouchAction = this.canvas.style.touchAction;

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
		this._boundHandleZoom = this.handleWheel.bind(this);
		this._boundTouchStart = this.startTouchGesture.bind(this);
		this._boundTouchMove = this.moveTouchGesture.bind(this);
		this._boundTouchEnd = this.endTouchGesture.bind(this);
		this._boundTemporaryCursorMove = this._handleTemporaryCursorMove.bind(this);
		this.debouncedResetView = Utility.debounce(() => this.resetView(), 250);

		this.canvas.addEventListener('mousedown', this._boundStartDrag);
		document.addEventListener('mousemove', this._boundDrag);
		document.addEventListener('mouseup', this._boundEndDrag);
		document.addEventListener('pointermove', this._boundTemporaryCursorMove);
		document.addEventListener('touchmove', this._boundTemporaryCursorMove, { passive: true });
		document.addEventListener('dragover', this._boundTemporaryCursorMove);
		this.canvas.addEventListener('wheel', this._boundHandleZoom, { passive: false });
		this.canvas.addEventListener('touchstart', this._boundTouchStart, { passive: false });
		document.addEventListener('touchmove', this._boundTouchMove, { passive: false });
		document.addEventListener('touchend', this._boundTouchEnd, { passive: false });
		document.addEventListener('touchcancel', this._boundTouchEnd, { passive: false });
		this.canvas.style.touchAction = 'none';
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

	_playInteractionSound(soundId, options = {}) {
		this.parent?.core?.soundManager?.playWhenReady?.(soundId, options);
	}

	_playZoomSound(previousZoom, nextZoom) {
		if (nextZoom === previousZoom) return;
		const sounds = SiteConfig.ui.interactionSounds;
		this._playInteractionSound(sounds.zoom, {
			pitchScale: nextZoom > previousZoom ? sounds.zoomInPitch : sounds.zoomOutPitch,
			volume: sounds.zoomVolume
		});
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
		this._resetEdgeScroll();
		// A drag borrows the camera by parking it in LOCKED and remembering the
		// mode to hand back. Anything that changes the mode while that borrow is
		// open — entering Build mode mid-drag is the one that bites — has to
		// change what gets handed back, not the live mode, or the borrow ends by
		// restoring a mode the player left behind and Build mode comes out of a
		// placement stuck where the camera will not pan.
		if (this.temporaryCursorFollow && i !== CAMERA_FOLLOW_MODES.LOCKED) {
			this.temporaryCursorFollow.mode = i;
			return;
		}

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

	/**
	 * `blockedEdges` names viewport edges this drag must never scroll toward —
	 * see followCursorEdge. A drag that starts or ends in a panel outside the
	 * stage has to cross the band along that panel's edge, and scrolling there
	 * is never what the gesture meant: it drags the target out from under the
	 * pointer on the way in, and slides the map away on the way back out.
	 */
	beginTemporaryCursorFollow(owner, { blockedEdges = null } = {}) {
		if (!owner) return false;
		if (this.temporaryCursorFollow?.owner === owner) return true;
		if (this.temporaryCursorFollow) return false;

		this.cancelDragPan();
		this.temporaryCursorFollow = {
			owner,
			mode: this.followMode,
			cursor: this._getCurrentClientPosition(),
			blockedEdges: blockedEdges?.length ? [...blockedEdges] : null
		};
		this.setMode(CAMERA_FOLLOW_MODES.LOCKED);
		return true;
	}

	updateTemporaryCursorFollow(owner, clientX, clientY) {
		if (this.temporaryCursorFollow?.owner !== owner) return false;
		if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return false;
		this.temporaryCursorFollow.cursor = { x: clientX, y: clientY };
		this._applyTemporaryCursorFollow();
		return true;
	}

	_getCurrentClientPosition() {
		const input = this.parent?.inputHandler?.inputSystem?.state;
		const touch = input?.activeTouchId !== null && input?.activeTouchId !== undefined
			? input.touches?.get?.(input.activeTouchId)
			: null;
		const source = touch || input?.mouse;
		return Number.isFinite(source?.clientX) && Number.isFinite(source?.clientY)
			? { x: source.clientX, y: source.clientY }
			: null;
	}

	_handleTemporaryCursorMove(event) {
		if (!this.temporaryCursorFollow) return;
		const point = event.touches?.[0] || event.changedTouches?.[0] || event;
		if (!Number.isFinite(point.clientX) || !Number.isFinite(point.clientY)) return;
		this.temporaryCursorFollow.cursor = { x: point.clientX, y: point.clientY };
	}

	_applyTemporaryCursorFollow() {
		const cursor = this.temporaryCursorFollow?.cursor || this._getCurrentClientPosition();
		if (!cursor) return;

		const viewportRect = this.parent.getContainerRect();
		const zoom = this._getSafeZoomValue();
		const clientX = Math.max(viewportRect.left, Math.min(viewportRect.right, cursor.x));
		const clientY = Math.max(viewportRect.top, Math.min(viewportRect.bottom, cursor.y));
		// Dragging borrows the camera, it does not change how the camera works.
		// Forcing edge scrolling here overrode the player's chosen mode for the
		// length of every drag, so cursor following turned into edge scrolling
		// the moment you picked something up. Edge scrolling stays the fallback
		// for the modes that do not track the pointer at all, since a drag still
		// has to be able to reach off-screen wall.
		const follow = this.temporaryCursorFollow?.mode === CAMERA_FOLLOW_MODES.CURSOR
			? this.followCursor
			: this.followCursorEdge;
		const before = this.posX;
		const beforeY = this.posY;
		follow.call(
			this,
			(clientX - viewportRect.left) / zoom,
			(clientY - viewportRect.top) / zoom,
			this.parent.getCanvasRect(),
			viewportRect,
			this.temporaryCursorFollow?.blockedEdges || null
		);

		// The world moved under a pointer that did not. Whatever borrowed the
		// camera is positioning something from that pointer, and it only hears
		// about pointer events — so while edge scrolling ran, the dragged object
		// sat at the world position it had when you last twitched the mouse and
		// snapped forward on the next move. Telling the borrower is the whole
		// fix: it already knows how to place itself from a screen point.
		if (this.posX !== before || this.posY !== beforeY) {
			this.temporaryCursorFollow?.owner?.syncToCursor?.(clientX, clientY);
		}
	}

	endTemporaryCursorFollow(owner = null) {
		const state = this.temporaryCursorFollow;
		if (!state || (owner && state.owner !== owner)) return false;
		this.temporaryCursorFollow = null;
		this._resetEdgeScroll();
		this.setMode(state.mode);
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
		const previous = this.targetZoomLevel;
		this.targetZoomLevel = this._clampZoom(zoom);
		// Readouts subscribe rather than being poked by each caller — the wheel,
		// the buttons, fit-to-map and reset all land here, and only one of them
		// used to remember to update the label.
		if (this.targetZoomLevel !== previous) {
			this.parent?.eventManager?.emit?.(EVENTS.CAMERA_ZOOM_CHANGED, {
				zoom: this.targetZoomLevel
			});
		}
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

	// World-unit half-width/half-height of the visible viewport at the current
	// zoom — used by SoundManager to scale spatial audio range with screen size.
	getViewportWorldHalfExtents() {
		const viewportRect = this.parent.getContainerRect();
		return {
			halfWidth: (viewportRect.width / 2) / this.zoomLevel,
			halfHeight: (viewportRect.height / 2) / this.zoomLevel
		};
	}

	zoomTo(zoom, options = {}) {
		const previousZoom = this.targetZoomLevel;
		const targetZoom = this._clampZoom(zoom);
		const anchor = options.anchor || this.getViewportCenterAnchor();
		const targetPosition = this._calculateAnchoredPosition(anchor, targetZoom);

		this.zoomAnchor = anchor;
		this.setTarget(targetPosition.x, targetPosition.y);
		this.setZoomLevel(targetZoom);
		this._playZoomSound(previousZoom, targetZoom);

		if (options.immediate) {
			this.zoomLevel = this.targetZoomLevel;
			this.setPosition(targetPosition.x, targetPosition.y);
			this.updateTransform(this.posX, this.posY, this.zoomLevel);
			this._clearZoomAnchor();
		}

		return targetZoom;
	}

	// The viewport changed size (window resize, fullscreen toggle). Re-frame so
	// the world point that was centred stays centred and the map is re-clamped
	// to the new bounds — which is what centres a map smaller than the viewport
	// instead of leaving it pinned to the left.
	//
	// Always immediate: the player didn't move the camera, the window moved
	// under it. Easing here reads as the map drifting on its own.
	handleViewportResize() {
		const viewportRect = this.parent.getContainerRect();
		const canvasRect = this.parent.getCanvasRect();
		// Before the first map exists there is nothing to frame, and clamping
		// against a zero-size canvas would throw the camera across the stage.
		if (!viewportRect?.width || !viewportRect?.height) return;
		if (!canvasRect?.width || !canvasRect?.height) return;

		const previous = this._viewportSize ?? viewportRect;
		this._viewportSize = { width: viewportRect.width, height: viewportRect.height };

		this.zoomTo(this.zoomLevel, {
			immediate: true,
			anchor: {
				screenX: viewportRect.width / 2,
				screenY: viewportRect.height / 2,
				worldX: (previous.width / 2) / this.zoomLevel - this.posX,
				worldY: (previous.height / 2) / this.zoomLevel - this.posY
			}
		});
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
		const renderOffset = this.parent.getRenderOffset?.() || { x: 0, y: 0 };

		const followTarget = this.getCurrentFollowTarget();
		if (this.followMode === CAMERA_FOLLOW_MODES.CHARACTER && followTarget) {
			return {
				screenX: containerRect.width / 2,
				screenY: containerRect.height / 2,
				worldX: followTarget.posX + (followTarget.size.width / 2) + renderOffset.x,
				worldY: followTarget.posY + (followTarget.size.height / 2) + renderOffset.y
			};
		}

		const pageX = e.pageX ?? (fallbackClientX + window.scrollX);
		const pageY = e.pageY ?? (fallbackClientY + window.scrollY);
		const convertsToWorld = typeof this.parent.inputHandler?.screenToWorldCoordinates === 'function';
		const worldPoint = convertsToWorld
			? this.parent.inputHandler.screenToWorldCoordinates(pageX, pageY)
			: {
				x: pointerPoint.x / this.zoomLevel - this.posX,
				y: pointerPoint.y / this.zoomLevel - this.posY
			};

		return {
			screenX: pointerPoint.x,
			screenY: pointerPoint.y,
			worldX: worldPoint.x + (convertsToWorld ? renderOffset.x : 0),
			worldY: worldPoint.y + (convertsToWorld ? renderOffset.y : 0)
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
			const previousZoom = this.targetZoomLevel;
			const anchor    = this._getZoomAnchorForEvent(e);
			const newTarget = this._calculateAnchoredPosition(anchor, newZoom);
			this.zoomAnchor = anchor;
			this.setTarget(newTarget.x, newTarget.y);
			this.setZoomLevel(newZoom);
			this._playZoomSound(previousZoom, newZoom);
		}
	}

	handleWheel(e) {
		const config = SiteConfig.camera;
		const now = performance.now();
		if (!this._wheelGesture || now - this._wheelGesture.lastAt > config.wheelGestureIdleMs) {
			const trackpad = !e.ctrlKey && e.deltaMode === WheelEvent.DOM_DELTA_PIXEL &&
				(Math.abs(e.deltaX) > 0 || Math.abs(e.deltaY) < config.trackpadDeltaThreshold ||
				!Number.isInteger(e.deltaY));
			this._wheelGesture = { kind: trackpad ? 'pan' : 'zoom', lastAt: now };
		} else {
			this._wheelGesture.lastAt = now;
		}

		if (e.ctrlKey) {
			e.preventDefault();
			if (this.canZoom === false) return;
			const previousZoom = this.targetZoomLevel;
			const nextZoom = this._clampZoom(previousZoom * Math.exp(-e.deltaY * config.trackpadZoomSensitivity));
			if (nextZoom === previousZoom) return;
			const anchor = this._getZoomAnchorForEvent(e);
			const target = this._calculateAnchoredPosition(anchor, nextZoom);
			this.zoomAnchor = anchor;
			this.setTarget(target.x, target.y);
			this.setZoomLevel(nextZoom);
			return;
		}

		if (this._wheelGesture.kind === 'pan') {
			e.preventDefault();
			this.panBy(e.deltaX, e.deltaY);
			return;
		}
		this.handleZoom(e);
	}

	startTouchGesture(event) {
		if (event.touches.length >= 2) {
			this.beginPinchGesture(event);
			return;
		}
		if (event.touches.length !== 1 || this.followMode !== CAMERA_FOLLOW_MODES.DRAG_TO_PAN ||
			this.parent?.ui?.toolManager?.claimsMapDrag?.() === true) return;
		if (event.target?.closest?.('.map-object, .myte-wrapper, .myte')) return;
		const touch = event.touches[0];
		this._touchGesture = { kind: 'pan' };
		this.startDrag({ clientX: touch.clientX, clientY: touch.clientY, preventDefault: () => event.preventDefault() });
	}

	beginPinchGesture(event) {
		if (event.touches.length < 2) return;
		this.parent?.ui?.cancelBuildGesturesForCamera?.();
		this.endDrag();
		const [first, second] = [event.touches[0], event.touches[1]];
		const midpoint = { clientX: (first.clientX + second.clientX) / 2, clientY: (first.clientY + second.clientY) / 2 };
		this._touchGesture = {
			kind: 'pinch',
			distance: Math.max(1, Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY)),
			zoom: this.targetZoomLevel,
			anchor: this._getZoomAnchorForEvent(midpoint)
		};
		event.preventDefault();
	}

	moveTouchGesture(event) {
		if (event.touches.length >= 2) {
			if (this._touchGesture?.kind !== 'pinch') this.beginPinchGesture(event);
			const gesture = this._touchGesture;
			if (!gesture) return;
			const [first, second] = [event.touches[0], event.touches[1]];
			const distance = Math.max(1, Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY));
			const zoom = this._clampZoom(gesture.zoom * (distance / gesture.distance));
			const midpoint = this._getRawContainerPointFromClient(
				(first.clientX + second.clientX) / 2, (first.clientY + second.clientY) / 2
			);
			const anchor = { ...gesture.anchor, screenX: midpoint.x, screenY: midpoint.y };
			const target = this._calculateAnchoredPosition(anchor, zoom);
			this.zoomAnchor = anchor;
			this.setTarget(target.x, target.y);
			this.setZoomLevel(zoom);
			event.preventDefault();
			return;
		}
		if (this._touchGesture?.kind !== 'pan' || event.touches.length !== 1) return;
		const touch = event.touches[0];
		this.drag({ clientX: touch.clientX, clientY: touch.clientY });
		event.preventDefault();
	}

	endTouchGesture(event) {
		if (!this._touchGesture) return;
		if (event.touches.length >= 2) {
			this.beginPinchGesture(event);
			return;
		}
		this.endDrag();
		this._touchGesture = null;
		if (event.cancelable) event.preventDefault();
	}

	// ========== DRAG ==========

	startDrag(e) {
		if (this.followMode !== CAMERA_FOLLOW_MODES.DRAG_TO_PAN) return;
		// Walls and Paint drive their own left-button drag over the map, so the
		// camera stays out of the way rather than hauling the view along behind
		// a run of wall.
		if (this.parent?.ui?.toolManager?.claimsMapDrag?.() === true) return;
		this._clearZoomAnchor();
		this.isDragging = true;
		this.dragStartX = e.clientX;
		this.dragStartY = e.clientY;
		this._lastDragClientX = e.clientX;
		this._lastDragClientY = e.clientY;
		this._inertiaVelX = 0;
		this._inertiaVelY = 0;
		this._panSoundStarted = false;
		this.dragStartCameraX = this.posX;
		this.dragStartCameraY = this.posY;
		this.canvas.style.cursor = 'grabbing';
		e.preventDefault();
	}

	drag(e) {
		if (!this.isDragging || this.followMode !== CAMERA_FOLLOW_MODES.DRAG_TO_PAN) return;

		const dx = (e.clientX - this.dragStartX) / this.zoomLevel;
		const dy = (e.clientY - this.dragStartY) / this.zoomLevel;
		const sounds = SiteConfig.ui.interactionSounds;
		if (!this._panSoundStarted && Math.hypot(e.clientX - this.dragStartX, e.clientY - this.dragStartY) >= sounds.panThresholdPx) {
			this._panSoundStarted = true;
			this._playInteractionSound(sounds.panStart, { volume: sounds.panStartVolume });
		}

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

	/**
	 * Keyboard pan. Follow modes that re-centre every frame would undo it, so
	 * this drops the camera into manual pan first — the same thing grabbing the
	 * map with the mouse does.
	 */
	panBy(deltaX, deltaY) {
		if (this.followMode !== CAMERA_FOLLOW_MODES.DRAG_TO_PAN &&
			this.followMode !== CAMERA_FOLLOW_MODES.LOCKED) {
			this.setMode(CAMERA_FOLLOW_MODES.DRAG_TO_PAN);
		}

		let newX = this.isScrollable.x ? this.targetX - deltaX / this.zoomLevel : this.targetX;
		let newY = this.isScrollable.y ? this.targetY - deltaY / this.zoomLevel : this.targetY;

		if (this.limitToBounds) {
			const clamped = this._clampToBounds(newX, newY);
			newX = clamped.x;
			newY = clamped.y;
		}

		this.setTarget(newX, newY);
	}

	endDrag() {
		if (!this.isDragging) return;
		if (this._panSoundStarted) {
			const sounds = SiteConfig.ui.interactionSounds;
			this._playInteractionSound(sounds.panEnd, { volume: sounds.panEndVolume });
		}
		this.isDragging = false;
		this._panSoundStarted = false;
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

		let cameraX = this.targetX;
		let cameraY = this.targetY;

		if (this.isScrollable.x) {
			const t = this._cursorPanFraction(x, viewportWorld.width);
			if (t !== null) cameraX = -t * (canvasRect.width - viewportWorld.width);
		}
		if (this.isScrollable.y) {
			const t = this._cursorPanFraction(y, viewportWorld.height);
			if (t !== null) cameraY = -t * (canvasRect.height - viewportWorld.height);
		}

		const targetPosition = this.limitToBounds
			? this._clampToBounds(cameraX, cameraY, canvasRect, viewportRect)
			: { x: cameraX, y: cameraY };
		this.setTarget(targetPosition.x, targetPosition.y);
	}

	/**
	 * Where along the map this cursor position points, as 0–1, or null while the
	 * cursor is resting in the middle band and the camera should hold.
	 *
	 * The bands outside the dead zone are stretched back over the whole range,
	 * so the far edge of the viewport still reaches the far edge of the map —
	 * a dead zone that ate travel instead of trading it would leave parts of the
	 * map unreachable in this mode.
	 */
	_cursorPanFraction(position, viewportSize) {
		if (!(viewportSize > 0)) return null;

		const deadZone = Math.min(Math.max(SiteConfig.camera.cursorDeadZone ?? 0, 0), 0.9);
		const half = deadZone / 2;
		const live = 0.5 - half;
		const p = Math.min(Math.max(position / viewportSize, 0), 1);

		if (p >= 0.5 - half && p <= 0.5 + half) return null;
		if (live <= 0) return null;

		return p < 0.5
			? (p / live) * 0.5
			: 0.5 + ((p - (0.5 + half)) / live) * 0.5;
	}

	followCharacter(x, y, canvasRect, viewportRect, elementRect) {
		this._applyCenter(x, y, elementRect, false, canvasRect, viewportRect);
	}

	/**
	 * Edge scrolling is a velocity, not a destination: the camera moves while
	 * the pointer is in the band and stops when it leaves. Easing toward a
	 * target that is only ever a step ahead just added lag — the camera spent
	 * the whole gesture catching up to a point it never reached — so the
	 * position and its target move together and position smoothing stays out of
	 * it. What IS eased is the velocity, which is a different thing: see
	 * _advanceEdgeVelocity.
	 */
	followCursorEdge(x, y, canvasRect, viewportRect, blockedEdges = null) {
		if (!this.isScrollable.x && !this.isScrollable.y) return;
		const { horizThresh, vertThresh, viewportWorld } = this._getEdgeThresholds(viewportRect);
		const seconds = this._edgeScrollFrameSeconds();
		if (!(seconds > 0)) return;

		const velocity = this._edgeScrollVelocity;
		velocity.x = this._advanceEdgeVelocity(velocity.x, this.isScrollable.x
			? this._blockableEdgeVelocity(x, viewportWorld.width, horizThresh, blockedEdges, 'left', 'right')
			: 0, seconds);
		velocity.y = this._advanceEdgeVelocity(velocity.y, this.isScrollable.y
			? this._blockableEdgeVelocity(y, viewportWorld.height, vertThresh, blockedEdges, 'top', 'bottom')
			: 0, seconds);

		if (velocity.x === 0 && velocity.y === 0) return;

		const clamped = this._clampToBounds(
			this.posX + (velocity.x * seconds),
			this.posY + (velocity.y * seconds),
			canvasRect,
			viewportRect
		);

		// Running into the end of the map is a dead stop, not a stall: leaving
		// the velocity standing means backing off the edge and coming straight
		// back gets full speed instantly, with none of the ramp you just watched.
		if (clamped.x === this.posX) velocity.x = 0;
		if (clamped.y === this.posY) velocity.y = 0;
		if (clamped.x === this.posX && clamped.y === this.posY) return;

		this.setTarget(clamped.x, clamped.y);
		this.setPosition(clamped.x, clamped.y);
	}

	// Edge scrolling holds state between frames — a velocity that eases in and
	// out — so anything that interrupts it has to drop that state, or the next
	// gesture inherits the speed of the last one.
	_resetEdgeScroll() {
		this._edgeScrollLastFrame = null;
		this._edgeScrollVelocity = { x: 0, y: 0 };
	}

	// Wall clock, not SimClock: the camera still pans while the simulation is
	// paused in build mode, which is exactly when you most need it to.
	_edgeScrollFrameSeconds() {
		const now = performance.now();
		const previous = this._edgeScrollLastFrame;
		this._edgeScrollLastFrame = now;
		if (!Number.isFinite(previous)) return 0;
		return Math.min((now - previous) / 1000, SiteConfig.camera.edgeScrollMaxFrameSeconds);
	}

	// One axis of edge scrolling, with the edges this drag is not allowed to
	// scroll toward taken out. The band is still live on the other side of the
	// axis — blocking the bottom edge for a drag out of the inventory must not
	// cost you the top one.
	_blockableEdgeVelocity(position, viewportSize, threshold, blockedEdges, lowEdge, highEdge) {
		const target = this._edgeScrollVelocityTarget(position, viewportSize, threshold);
		if (target === 0 || !blockedEdges?.length) return target;
		const edge = position < threshold ? lowEdge : highEdge;
		return blockedEdges.includes(edge) ? 0 : target;
	}

	/**
	 * How fast the camera wants to move along one axis, in world px/sec, from a
	 * cursor position on that axis. Positive moves the view toward the low edge.
	 *
	 * Two separate things decide the feel, and conflating them is what made this
	 * read as one flat fast speed:
	 *
	 *   floor — the speed at the very inner edge of the band, as a fraction of
	 *   the full speed. It exists so crossing into the band does something; a
	 *   floor of zero meant you had to keep pushing before anything happened.
	 *   But it was set high enough (0.45 while dragging) that entering the band
	 *   *started at almost half speed*, and the whole band above that only ever
	 *   doubled it. That is the "fast and linear" — it is a step, not a ramp.
	 *
	 *   curve — how the remaining speed is distributed across the band. Linear
	 *   spends most of the band near the top speed, so the useful slow range is
	 *   a sliver you cannot aim at. An exponent above 1 keeps the inner half
	 *   gentle and saves the real acceleration for the outer quarter, which is
	 *   where the pointer is when you actually mean "go".
	 *
	 * Pinning the pointer against the edge is still the fastest the camera goes,
	 * and that top speed is deliberately high — the fix for "waiting at the edge"
	 * is a faster edge, not a hotter approach to it.
	 */
	_edgeScrollVelocityTarget(position, viewportSize, threshold) {
		if (!(threshold > 0)) return 0;

		const past = position < threshold
			? threshold - position
			: (position > viewportSize - threshold ? position - (viewportSize - threshold) : 0);
		if (past <= 0) return 0;

		const dragging = !!this.temporaryCursorFollow;
		const speed = dragging
			? SiteConfig.camera.dragEdgeScrollSpeed
			: SiteConfig.camera.edgeScrollSpeed;
		const floor = dragging
			? SiteConfig.camera.dragEdgeScrollMinSpeedFraction
			: SiteConfig.camera.edgeScrollMinSpeedFraction;

		const intensity = Utility.clamp(past / threshold, 0, 1);
		const curve = Math.max(1, SiteConfig.camera.edgeScrollCurve);
		const ramp = floor + (1 - floor) * Math.pow(intensity, curve);

		const magnitude = speed * ramp;
		return position < threshold ? magnitude : -magnitude;
	}

	/**
	 * Eases the actual velocity toward the wanted one with a fixed time
	 * constant, so the camera accelerates and decelerates instead of switching
	 * between moving and not moving.
	 *
	 * This is the part that makes it feel eased rather than linear, and it is
	 * deliberately NOT position smoothing — easing the position toward a target
	 * a step ahead is what added lag here before. A velocity lag costs nothing
	 * at full tilt (it converges in about three time constants, and after that
	 * the camera is simply moving at the speed you asked for) but it removes the
	 * discontinuity at both ends: entering the band spins up, and leaving it
	 * coasts to a stop instead of stopping dead under your hand.
	 */
	_advanceEdgeVelocity(current, target, seconds) {
		const tau = SiteConfig.camera.edgeScrollResponseSeconds;
		if (!(tau > 0)) return target;

		const next = current + ((target - current) * (1 - Math.exp(-seconds / tau)));

		// An exponential decay never actually reaches zero. Without a cutoff the
		// camera keeps creeping by a fraction of a pixel a frame forever, which
		// pins the render path awake and drifts the view while you are trying to
		// read it.
		return target === 0 && Math.abs(next) < SiteConfig.camera.edgeScrollStopSpeed ? 0 : next;
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

		const renderOffset = this.parent.getRenderOffset?.() || { x: 0, y: 0 };
		const dx = followTarget.posX + renderOffset.x - worldCenterX;
		const dy = followTarget.posY + renderOffset.y - worldCenterY;

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
		const t     = SimClock.now() / 1000;
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
		const renderOffset = this.parent.getRenderOffset?.() || { x: 0, y: 0 };
		return {
			x: this.isScrollable.x ? -(x + renderOffset.x + elementRect.width  / 2 - viewportWorld.width  / 2) : this.posX,
			y: this.isScrollable.y ? -(y + renderOffset.y + elementRect.height / 2 - viewportWorld.height / 2) : this.posY,
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
		const t = this.temporaryCursorFollow
			? SiteConfig.camera.dragEdgeThreshold
			: SiteConfig.camera.edgeThreshold;
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
			const dimensions = this.parent.gameMap?.dimensions || this.parent.getCanvasRect();
			this.centerToPosition(
				dimensions.width  / 2,
				dimensions.height / 2,
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
		if (this.temporaryCursorFollow) {
			this._applyTemporaryCursorFollow();
			return;
		}

		if (this.followMode === CAMERA_FOLLOW_MODES.DRAG_TO_PAN) return;

		// Viewport coordinates, NOT world coordinates. Both cursor modes compare
		// this against the viewport's own size — thresholds, dead zone, pan
		// fraction — so it has to be measured from the viewport's top-left.
		//
		// The default getMouseContainerPosition() converts on to world space,
		// which subtracts the map's render insets: the strip reserved above the
		// map for wall art to stand in. That shifted the pointer up by the whole
		// inset before it was compared against the viewport, so the top edge
		// triggered across half the screen while the bottom edge could never be
		// reached at all — the camera panned up and then did nothing — and
		// cursor mode's pan fraction could never reach 1, which is why the
		// bottom of the map was unreachable. Dragging was unaffected because
		// _applyTemporaryCursorFollow measures the pointer itself.
		const mouse       = this.parent.inputHandler.getMouseContainerPosition({ includeCamera: false });
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
		document.removeEventListener('pointermove', this._boundTemporaryCursorMove);
		document.removeEventListener('touchmove', this._boundTemporaryCursorMove);
		document.removeEventListener('dragover', this._boundTemporaryCursorMove);
		this.canvas.removeEventListener('wheel', this._boundHandleZoom);
		this.canvas.removeEventListener('touchstart', this._boundTouchStart);
		document.removeEventListener('touchmove', this._boundTouchMove);
		document.removeEventListener('touchend', this._boundTouchEnd);
		document.removeEventListener('touchcancel', this._boundTouchEnd);
		this.canvas.style.touchAction = this._originalTouchAction;
		window.removeEventListener('resize', this.debouncedResetView);

		this.parent = null;
		this.canvas = null;
	}
}
