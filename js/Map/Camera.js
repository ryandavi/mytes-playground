class Camera {
	constructor(parent, canvas, viewport) {
		// Core properties
		this.parent = parent;
		this.canvas = canvas;
		this.viewport = viewport;
		
		// Position properties
		this.posX = 0;
		this.posY = 0;
		this.targetX = 0;
		this.targetY = 0;
		this.easing = 10;
		this.draggingEasing = 20;
		
		// Zoom properties
		this.canZoom = true;
		this.zoomLevel = 1;
		this.targetZoomLevel = 1;
		this.zoomEasing = 5;
		this.minZoomLevel = 0.5;
		this.maxZoomLevel = 2.5;
		this.zoomStep = 0.1;
		this.zoomAnchor = null;
		
		// Camera behavior
		this.followMode = DEFAULT_CAMERA_FOLLOW_MODE;
		this.previousFollowMode = DEFAULT_CAMERA_FOLLOW_MODE;
		this.isScrollable = { x: true, y: true };
		this.useInstantMovement = false;
		this.limitToBounds = false;
		
		// Drag properties
		this.isDragging = false;
		this.dragStartX = 0;
		this.dragStartY = 0;
		this.dragStartCameraX = 0;
		this.dragStartCameraY = 0;
		
		// Initialize event handlers
		this.canvas.style.transformOrigin = 'top left';
		this._initEventListeners();
	}
	
	// ========== EVENT HANDLING ==========
	
	_initEventListeners() {
		// Bind methods to preserve 'this' context
		this._boundStartDrag = this.startDrag.bind(this);
		this._boundDrag = this.drag.bind(this);
		this._boundEndDrag = this.endDrag.bind(this);
		this._boundHandleZoom = this.handleZoom.bind(this);
		this.debouncedResetView = this.debounce(() => this.resetView(), 250);
		
		// Add listeners
		this.canvas.addEventListener('mousedown', this._boundStartDrag);
		document.addEventListener('mousemove', this._boundDrag);
		document.addEventListener('mouseup', this._boundEndDrag);
		this.canvas.addEventListener('wheel', this._boundHandleZoom, { passive: false });
		window.addEventListener('resize', this.debouncedResetView);
	}
	
	// ========== UTILITY METHODS ==========
	
	debounce(func, wait) {
		let timeout;
		return function() {
			const context = this;
			const args = arguments;
			clearTimeout(timeout);
			timeout = setTimeout(() => {
				func.apply(context, args);
			}, wait);
		};
	}
	
	throttle(func, limit) {
		let inThrottle;
		return function() {
			const context = this;
			const args = arguments;
			if (!inThrottle) {
				func.apply(context, args);
				inThrottle = true;
				setTimeout(() => inThrottle = false, limit);
			}
		};
	}
	
	updateTransform(x, y, zoom) {
		this.canvas.style.transform = `scale(${zoom.toFixed(3)}) translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`;
	}
	
	// ========== POSITION METHODS ==========
	
	setPosition(x, y) {
		this.posX = x;
		this.posY = y;
	}
	
	setTarget(x, y) {
		this.targetX = x;
		this.targetY = y;
	}
	
	// ========== MODE MANAGEMENT ==========
	
	setMode(i) {
		this.previousFollowMode = this.followMode;
		this.followMode = i;
		// this.parent.ui.debugMenu.updateCycleCamera(document.getElementById("cycleCamera"));

		this.parent.ui.debugMenu.updateButton('cycleCamera');
	}
	
	setToPreviousMode() {
		this.setMode(this.previousFollowMode);
	}
	
	// ========== ZOOM METHODS ==========
	
	setZoomLevel(zoom) {
		this.targetZoomLevel = Math.max(
			this.minZoomLevel,
			Math.min(this.maxZoomLevel, zoom)
		);
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
		const targetZoom = Math.max(
			this.minZoomLevel,
			Math.min(this.maxZoomLevel, zoom)
		);
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
		return this.zoomTo(1, {
			anchor: this.getViewportCenterAnchor(),
			immediate
		});
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

		const usableWidth = Math.max(1, viewportRect.width - padding * 2);
		const usableHeight = Math.max(1, viewportRect.height - padding * 2);
		const zoomX = usableWidth / canvasRect.width;
		const zoomY = usableHeight / canvasRect.height;

		let targetZoom = zoomX;
		if (mode === 'height') {
			targetZoom = zoomY;
		} else if (mode === 'contain') {
			targetZoom = Math.min(zoomX, zoomY);
		}

		targetZoom = Math.max(
			this.minZoomLevel,
			Math.min(this.maxZoomLevel, targetZoom)
		);

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

		if (this.followMode === CAMERA_FOLLOW_MODES.CHARACTER && this.parent.activeMyte) {
			const activeMyte = this.parent.activeMyte;
			return {
				screenX: containerRect.width / 2,
				screenY: containerRect.height / 2,
				worldX: activeMyte.posX + (activeMyte.size.width / 2),
				worldY: activeMyte.posY + (activeMyte.size.height / 2)
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
		let targetX = anchor.screenX / zoom - anchor.worldX;
		let targetY = anchor.screenY / zoom - anchor.worldY;

		return this.limitToBounds
			? this._clampToBounds(targetX, targetY, null, null, zoom)
			: { x: targetX, y: targetY };
	}

	handleZoom(e) {
		e.preventDefault();
		
		if (this.canZoom === false) return;
		
		// Calculate new zoom level
		const zoomDirection = e.deltaY < 0 ? 1 : -1;
		const newZoom = Math.max(
			this.minZoomLevel,
			Math.min(this.maxZoomLevel, this.targetZoomLevel + zoomDirection * this.zoomStep)
		);
		
		// Only proceed if zoom level is changing
		if (newZoom !== this.targetZoomLevel) {
			const anchor = this._getZoomAnchorForEvent(e);
			this.zoomAnchor = anchor;

			const newTarget = this._calculateAnchoredPosition(anchor, newZoom);
			this.setTarget(newTarget.x, newTarget.y);
			this.setZoomLevel(newZoom);
		}
	}
	
	// ========== DRAG METHODS ==========
	
	startDrag(e) {
		if (this.followMode === CAMERA_FOLLOW_MODES.DRAG_TO_PAN) {
			this._clearZoomAnchor();
			this.isDragging = true;
			this.dragStartX = e.clientX;
			this.dragStartY = e.clientY;
			this.dragStartCameraX = this.posX;
			this.dragStartCameraY = this.posY;
			this.canvas.style.cursor = 'grabbing';
			
			// Prevent text selection during drag
			e.preventDefault();
		}
	}
	
	drag(e) {
		if (!this.isDragging || this.followMode !== CAMERA_FOLLOW_MODES.DRAG_TO_PAN) return;
		
		const dx = (e.clientX - this.dragStartX) / this.zoomLevel;
		const dy = (e.clientY - this.dragStartY) / this.zoomLevel;
		
		// Apply drag only in scrollable directions
		let newX = this.isScrollable.x ? this.dragStartCameraX + dx : this.dragStartCameraX;
		let newY = this.isScrollable.y ? this.dragStartCameraY + dy : this.dragStartCameraY;
		
		// Apply bounds if needed
		if (this.limitToBounds) {
			const clampedPosition = this._clampToBounds(newX, newY);
			newX = clampedPosition.x;
			newY = clampedPosition.y;
		}
		
		this.setTarget(newX, newY);
	}
	
	endDrag() {
		this.isDragging = false;
		this.canvas.style.cursor = 'default';
	}
	
	// ========== FOLLOW METHODS ==========
	
	focusOn(entity) {
		if (!entity) return;
		
		const canvasRect = this.parent.getCanvasRect();
		const viewportRect = this.parent.getContainerRect();
		const entityRect = entity.size || (entity.getRect ? entity.getRect() : { width: 50, height: 50 });
		
		this.followCharacter(entity.posX, entity.posY, canvasRect, viewportRect, entityRect);
		
		// If instant movement is enabled, update position immediately
		if (this.useInstantMovement) {
			this.posX = this.targetX;
			this.posY = this.targetY;
			this.updateTransform(this.posX, this.posY, this.zoomLevel);
		}
	}
	
	followCursor(x, y, canvasRect, viewportRect) {
		// Only apply scrolling in directions that make sense
		if (!this.isScrollable.x && !this.isScrollable.y) return;
		const viewportWorld = this._getViewportWorldSize(viewportRect);
		
		// Get the percentage position of the mouse within the viewport
		const mouseXPercent = viewportWorld.width > 0 ? x / viewportWorld.width : 0;
		const mouseYPercent = viewportWorld.height > 0 ? y / viewportWorld.height : 0;
		
		// Calculate camera positions
		let cameraX = this.posX;
		let cameraY = this.posY;
		
		if (this.isScrollable.x) {
			cameraX = -Math.max(0, Math.min(mouseXPercent * canvasRect.width - viewportWorld.width / 2,
				canvasRect.width - viewportWorld.width));
		}
		
		if (this.isScrollable.y) {
			cameraY = -Math.max(0, Math.min(mouseYPercent * canvasRect.height - viewportWorld.height / 2,
				canvasRect.height - viewportWorld.height));
		}
		
		const targetPosition = this.limitToBounds
			? this._clampToBounds(cameraX, cameraY, canvasRect, viewportRect)
			: { x: cameraX, y: cameraY };
		this.setTarget(targetPosition.x, targetPosition.y);
	}
	
	followCharacter(x, y, canvasRect, viewportRect, elementRect) {
		if (!this.isScrollable.x && !this.isScrollable.y) return;
		
		const centerPos = this._calculateCenterPosition(x, y, viewportRect, elementRect);
		
		if (this.limitToBounds) {
			const clampedPosition = this._clampToBounds(centerPos.x, centerPos.y, canvasRect, viewportRect);
			centerPos.x = clampedPosition.x;
			centerPos.y = clampedPosition.y;
		}
		
		this.setTarget(centerPos.x, centerPos.y);
	}
	
	followCursorEdge(x, y, canvasRect, viewportRect) {
		if (!this.isScrollable.x && !this.isScrollable.y) return;
		const viewportWorld = this._getViewportWorldSize(viewportRect);
		
		// Edge thresholds (20% of viewport)
		const horizEdgeThreshold = viewportWorld.width * 0.2;
		const vertEdgeThreshold = viewportWorld.height * 0.2;
		
		// Start with current position
		let targetX = this.posX;
		let targetY = this.posY;
		
		// Adjust edge follow speed
		const easing = this.easing / 3;
		
		// Check horizontal edges if scrollable horizontally
		if (this.isScrollable.x) {
			if (x < horizEdgeThreshold) {
				// Moving toward left edge
				const intensity = 1 - (x / horizEdgeThreshold);
				targetX += (horizEdgeThreshold - x) / easing * intensity * 2;
			} else if (x > viewportWorld.width - horizEdgeThreshold) {
				// Moving toward right edge
				const intensity = (x - (viewportWorld.width - horizEdgeThreshold)) / horizEdgeThreshold;
				targetX -= (x - (viewportWorld.width - horizEdgeThreshold)) / easing * intensity * 2;
			}
		}
		
		// Check vertical edges if scrollable vertically
		if (this.isScrollable.y) {
			if (y < vertEdgeThreshold) {
				// Moving toward top edge
				const intensity = 1 - (y / vertEdgeThreshold);
				targetY += (vertEdgeThreshold - y) / easing * intensity * 2;
			} else if (y > viewportWorld.height - vertEdgeThreshold) {
				// Moving toward bottom edge
				const intensity = (y - (viewportWorld.height - vertEdgeThreshold)) / vertEdgeThreshold;
				targetY -= (y - (viewportWorld.height - vertEdgeThreshold)) / easing * intensity * 2;
			}
		}
		
		// Apply bounds
		const clampedPosition = this._clampToBounds(targetX, targetY, canvasRect, viewportRect);
		targetX = clampedPosition.x;
		targetY = clampedPosition.y;
		
		this.setTarget(targetX, targetY);
	}
	
	// ========== POSITION HELPERS ==========
	
	_calculateCenterPosition(x, y, viewportRect, elementRect) {
		const viewportWorld = this._getViewportWorldSize(viewportRect);
		const centerPosX = this.isScrollable.x 
			? -(x + (elementRect.width / 2) - (viewportWorld.width / 2)) 
			: this.posX;
			
		const centerPosY = this.isScrollable.y 
			? -(y + (elementRect.height / 2) - (viewportWorld.height / 2)) 
			: this.posY;
			
		return { x: centerPosX, y: centerPosY };
	}
	
	_getViewportWorldSize(viewportRect, zoom = this.zoomLevel) {
		return {
			width: viewportRect.width / zoom,
			height: viewportRect.height / zoom
		};
	}

	_calculateAxisBounds(contentSize, viewportSize) {
		if (contentSize <= viewportSize) {
			const centeredOffset = (viewportSize - contentSize) / 2;
			return { min: centeredOffset, max: centeredOffset };
		}

		return {
			min: -(contentSize - viewportSize),
			max: 0
		};
	}

	_calculateBounds(canvasRect, viewportRect, zoom = this.zoomLevel) {
		if (!canvasRect) canvasRect = this.parent.getCanvasRect();
		if (!viewportRect) viewportRect = this.parent.getContainerRect();
		const viewportWorld = this._getViewportWorldSize(viewportRect, zoom);
		const horizontalBounds = this._calculateAxisBounds(canvasRect.width, viewportWorld.width);
		const verticalBounds = this._calculateAxisBounds(canvasRect.height, viewportWorld.height);
		
		return {
			minX: horizontalBounds.min,
			maxX: horizontalBounds.max,
			minY: verticalBounds.min,
			maxY: verticalBounds.max
		};
	}

	_clampToBounds(x, y, canvasRect, viewportRect, zoom = this.zoomLevel) {
		const bounds = this._calculateBounds(canvasRect, viewportRect, zoom);
		return {
			x: this.isScrollable.x ? Math.min(bounds.maxX, Math.max(bounds.minX, x)) : x,
			y: this.isScrollable.y ? Math.min(bounds.maxY, Math.max(bounds.minY, y)) : y
		};
	}
	
	// ========== RESET METHODS ==========
	
	reset() {
		if (this.isScrollable.x) {
			this.setTarget(0, this.targetY);
		}
		
		if (this.isScrollable.y) {
			this.setTarget(this.targetX, 0);
		}
		
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
		if (!this.isScrollable.x && !this.isScrollable.y) return;
		
		const canvasRect = this.parent.getCanvasRect();
		const viewportRect = this.parent.getContainerRect();
		
		const centerPos = this._calculateCenterPosition(x, y, viewportRect, elementRect);
		
		if (this.limitToBounds) {
			const clampedPosition = this._clampToBounds(centerPos.x, centerPos.y, canvasRect, viewportRect);
			centerPos.x = clampedPosition.x;
			centerPos.y = clampedPosition.y;
		}
		
		this.setTarget(centerPos.x, centerPos.y);
		if (immediate) this.setPosition(centerPos.x, centerPos.y);
	}
	
	resetView(immediate = false) {
		console.log("resetting view");
		
		if (!this.parent.settings.limitMap) {
			this.resetToZero();
			return;
		}
		
		if (this.parent.activeMyte) {
			// Center to active myte
			this.centerToPosition(
				this.parent.activeMyte.posX, 
				this.parent.activeMyte.posY, 
				this.parent.activeMyte.size, 
				immediate
			);
			console.log("centered to active myte");
		} else if (this.parent.mytes.length > 0) {
			// Center to first myte
			this.centerToPosition(
				this.parent.mytes[0].posX, 
				this.parent.mytes[0].posY, 
				this.parent.mytes[0].size, 
				immediate
			);
		} else {
			// Fallback - center to middle of canvas
			const centerX = this.parent.getCanvasRect().width / 2;
			const centerY = this.parent.getCanvasRect().height / 2;
			this.centerToPosition(
				centerX, 
				centerY, 
				{ width: 0, height: 0 },
				immediate
			);
		}
	}
	
	// ========== UPDATE LOGIC ==========
	
	handleScroll() {
		return false;
	}
	
	update() {
		// Handle instant movement case
		if (this.useInstantMovement) {
			this.zoomLevel = this.targetZoomLevel;

			if (this.zoomAnchor) {
				const anchoredPosition = this._calculateAnchoredPosition(this.zoomAnchor, this.zoomLevel);
				this.setTarget(anchoredPosition.x, anchoredPosition.y);
			}

			this.posX = this.targetX;
			this.posY = this.targetY;
			this.updateTransform(this.posX, this.posY, this.zoomLevel);
			this._clearZoomAnchor();
			this.doCameraLogic();
			return;
		}

		// Update zoom level first so camera positioning can react to the actual visual zoom.
		const zoomDelta = this.targetZoomLevel - this.zoomLevel;
		this.zoomLevel += zoomDelta / this.zoomEasing;
		if (Math.abs(this.targetZoomLevel - this.zoomLevel) < 0.001) {
			this.zoomLevel = this.targetZoomLevel;
		}

		const isZoomAnchored = !!this.zoomAnchor && Math.abs(this.targetZoomLevel - this.zoomLevel) > 0.0001;

		if (isZoomAnchored) {
			const anchoredPosition = this._calculateAnchoredPosition(this.zoomAnchor, this.zoomLevel);
			this.setTarget(anchoredPosition.x, anchoredPosition.y);
			this.setPosition(anchoredPosition.x, anchoredPosition.y);
		} else {
			// Calculate the distance to move
			const deltaX = this.targetX - this.posX;
			const deltaY = this.targetY - this.posY;
			const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

			// Use adaptive easing based on distance and state
			const baseEasing = this.parent.activeMyte && this.parent.activeMyte.isDragging
				? this.draggingEasing
				: this.easing;

			const adaptiveEasing = Math.max(4, baseEasing - distance / 100);

			// Calculate steps
			const stepX = deltaX / adaptiveEasing;
			const stepY = deltaY / adaptiveEasing;

			// Snap to target if very close
			const snapThreshold = 0.5;
			if (distance < snapThreshold && Math.abs(zoomDelta) < 0.01) {
				this.setPosition(this.targetX, this.targetY);
				this.zoomLevel = this.targetZoomLevel;
			} else {
				this.setPosition(this.posX + stepX, this.posY + stepY);
			}
		}

		if (this.zoomAnchor && this.zoomLevel === this.targetZoomLevel) {
			const finalAnchoredPosition = this._calculateAnchoredPosition(this.zoomAnchor, this.zoomLevel);
			this.setTarget(finalAnchoredPosition.x, finalAnchoredPosition.y);
			this.setPosition(finalAnchoredPosition.x, finalAnchoredPosition.y);
			this._clearZoomAnchor();
		}
		
		// Update transform and camera logic
		this.updateTransform(this.posX, this.posY, this.zoomLevel);
		this.doCameraLogic();
	}
	
	doCameraLogic() {
		if (this.followMode === CAMERA_FOLLOW_MODES.DRAG_TO_PAN) {
			return; // Handled by drag event
		}
		
		const mouse = this.parent.inputHandler.getMouseContainerPosition();
		const canvasRect = this.parent.getCanvasRect();
		const containerRect = this.parent.getContainerRect();
		
		// Skip if mouse is not in container for cursor-based modes
		const isMouseInContainer = this.parent.isMouseInContainer();
		
		switch (this.followMode) {
			case CAMERA_FOLLOW_MODES.CURSOR:
				if (!isMouseInContainer) return;
				this.followCursor(mouse.x, mouse.y, canvasRect, containerRect);
				break;
				
			case CAMERA_FOLLOW_MODES.CURSOR_EDGE:
				if (!isMouseInContainer) return;
				this.followCursorEdge(mouse.x, mouse.y, canvasRect, containerRect);
				break;
				
			case CAMERA_FOLLOW_MODES.CHARACTER:
				if (this.parent.activeMyte) {
					this.followCharacter(
						this.parent.activeMyte.posX,
						this.parent.activeMyte.posY,
						canvasRect,
						containerRect,
						this.parent.activeMyte.size
					);
				}
				break;
		}
	}
	
	// ========== CLEANUP ==========
	
	dispose() {
		// Remove event listeners to prevent memory leaks
		this.canvas.removeEventListener('mousedown', this._boundStartDrag);
		document.removeEventListener('mousemove', this._boundDrag);
		document.removeEventListener('mouseup', this._boundEndDrag);
		this.canvas.removeEventListener('wheel', this._boundHandleZoom);
		window.removeEventListener('resize', this.debouncedResetView);
		
		// Clear references
		this.parent = null;
		this.canvas = null;
		this.viewport = null;
	}
}
