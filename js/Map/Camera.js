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
		this.draggingEasing = 75;
		
		// Zoom properties
		this.canZoom = false;
		this.zoomLevel = 1;
		this.targetZoomLevel = 1;
		this.zoomEasing = 5;
		
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
		this.canvas.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) scale(${zoom.toFixed(3)})`;
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
		this.targetZoomLevel = zoom;
	}
	
	handleZoom(e) {
		e.preventDefault();
		
		if (this.canZoom === false) return;
		
		// Get mouse position relative to canvas
		const rect = this.canvas.getBoundingClientRect();
		const mouseX = e.clientX - rect.left;
		const mouseY = e.clientY - rect.top;
		
		// Calculate new zoom level
		const zoomDirection = e.deltaY < 0 ? 1 : -1;
		const zoomFactor = 0.1;
		const newZoom = Math.max(0.5, Math.min(2.5, this.targetZoomLevel + zoomDirection * zoomFactor));
		
		// Only proceed if zoom level is changing
		if (newZoom !== this.targetZoomLevel) {
			// Calculate zoom point in world coordinates
			const worldX = mouseX - this.posX;
			const worldY = mouseY - this.posY;
			
			// Calculate new target position to zoom toward cursor
			const zoomRatio = newZoom / this.targetZoomLevel;
			this.setTarget(
				mouseX - worldX * zoomRatio,
				mouseY - worldY * zoomRatio
			);
			
			this.setZoomLevel(newZoom);
		}
	}
	
	// ========== DRAG METHODS ==========
	
	startDrag(e) {
		if (this.followMode === CAMERA_FOLLOW_MODES.DRAG_TO_PAN) {
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
		
		const dx = e.clientX - this.dragStartX;
		const dy = e.clientY - this.dragStartY;
		
		// Apply drag only in scrollable directions
		let newX = this.isScrollable.x ? this.dragStartCameraX + dx : this.dragStartCameraX;
		let newY = this.isScrollable.y ? this.dragStartCameraY + dy : this.dragStartCameraY;
		
		// Apply bounds if needed
		if (this.limitToBounds) {
			const bounds = this._calculateBounds();
			if (this.isScrollable.x) {
				newX = Math.min(0, Math.max(newX, bounds.minX));
			}
			
			if (this.isScrollable.y) {
				newY = Math.min(0, Math.max(newY, bounds.minY));
			}
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
		const entityRect = entity.getRect ? entity.getRect() : { width: 50, height: 50 };
		
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
		
		// Get the percentage position of the mouse within the viewport
		const mouseXPercent = x / viewportRect.width;
		const mouseYPercent = y / viewportRect.height;
		
		// Calculate camera positions
		let cameraX = this.posX;
		let cameraY = this.posY;
		
		if (this.isScrollable.x) {
			cameraX = -Math.max(0, Math.min(mouseXPercent * canvasRect.width - viewportRect.width / 2,
				canvasRect.width - viewportRect.width));
		}
		
		if (this.isScrollable.y) {
			cameraY = -Math.max(0, Math.min(mouseYPercent * canvasRect.height - viewportRect.height / 2,
				canvasRect.height - viewportRect.height));
		}
		
		this.setTarget(cameraX, cameraY);
	}
	
	followCharacter(x, y, canvasRect, viewportRect, elementRect) {
		if (!this.isScrollable.x && !this.isScrollable.y) return;
		
		const centerPos = this._calculateCenterPosition(x, y, viewportRect, elementRect);
		
		if (this.limitToBounds) {
			const bounds = this._calculateBounds(canvasRect, viewportRect);
			
			if (this.isScrollable.x) {
				centerPos.x = Math.min(0, Math.max(bounds.minX, centerPos.x));
			}
			
			if (this.isScrollable.y) {
				centerPos.y = Math.min(0, Math.max(bounds.minY, centerPos.y));
			}
		}
		
		this.setTarget(centerPos.x, centerPos.y);
	}
	
	followCursorEdge(x, y, canvasRect, viewportRect) {
		if (!this.isScrollable.x && !this.isScrollable.y) return;
		
		// Edge thresholds (20% of viewport)
		const horizEdgeThreshold = viewportRect.width * 0.2;
		const vertEdgeThreshold = viewportRect.height * 0.2;
		
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
			} else if (x > viewportRect.width - horizEdgeThreshold) {
				// Moving toward right edge
				const intensity = (x - (viewportRect.width - horizEdgeThreshold)) / horizEdgeThreshold;
				targetX -= (x - (viewportRect.width - horizEdgeThreshold)) / easing * intensity * 2;
			}
		}
		
		// Check vertical edges if scrollable vertically
		if (this.isScrollable.y) {
			if (y < vertEdgeThreshold) {
				// Moving toward top edge
				const intensity = 1 - (y / vertEdgeThreshold);
				targetY += (vertEdgeThreshold - y) / easing * intensity * 2;
			} else if (y > viewportRect.height - vertEdgeThreshold) {
				// Moving toward bottom edge
				const intensity = (y - (viewportRect.height - vertEdgeThreshold)) / vertEdgeThreshold;
				targetY -= (y - (viewportRect.height - vertEdgeThreshold)) / easing * intensity * 2;
			}
		}
		
		// Apply bounds
		const bounds = this._calculateBounds(canvasRect, viewportRect);
		targetX = Math.min(0, Math.max(targetX, bounds.minX));
		targetY = Math.min(0, Math.max(targetY, bounds.minY));
		
		this.setTarget(targetX, targetY);
	}
	
	// ========== POSITION HELPERS ==========
	
	_calculateCenterPosition(x, y, viewportRect, elementRect) {
		const centerPosX = this.isScrollable.x 
			? -(x + (elementRect.width / 2) - (viewportRect.width / 2)) 
			: this.posX;
			
		const centerPosY = this.isScrollable.y 
			? -(y + (elementRect.height / 2) - (viewportRect.height / 2)) 
			: this.posY;
			
		return { x: centerPosX, y: centerPosY };
	}
	
	_calculateBounds(canvasRect, viewportRect) {
		if (!canvasRect) canvasRect = this.parent.getCanvasRect();
		if (!viewportRect) viewportRect = this.parent.getContainerRect();
		
		return {
			minX: -(canvasRect.width - viewportRect.width),
			minY: -(canvasRect.height - viewportRect.height)
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
			const bounds = this._calculateBounds(canvasRect, viewportRect);
			
			if (this.isScrollable.x) {
				centerPos.x = Math.min(0, Math.max(bounds.minX, centerPos.x));
			}
			
			if (this.isScrollable.y) {
				centerPos.y = Math.min(0, Math.max(bounds.minY, centerPos.y));
			}
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
			this.posX = this.targetX;
			this.posY = this.targetY;
			this.zoomLevel = this.targetZoomLevel;
			this.updateTransform(this.posX, this.posY, this.zoomLevel);
			this.doCameraLogic();
			return;
		}
		
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
		
		// Update zoom level
		const zoomDelta = this.targetZoomLevel - this.zoomLevel;
		this.zoomLevel += zoomDelta / this.zoomEasing;
		
		// Snap to target if very close
		const snapThreshold = 0.5;
		if (distance < snapThreshold && Math.abs(zoomDelta) < 0.01) {
			this.setPosition(this.targetX, this.targetY);
			this.zoomLevel = this.targetZoomLevel;
		} else {
			this.setPosition(this.posX + stepX, this.posY + stepY);
		}
		
		// Update transform and camera logic
		this.updateTransform(this.posX, this.posY, this.zoomLevel);
		this.doCameraLogic();
	}
	
	doCameraLogic() {
		if (this.followMode === CAMERA_FOLLOW_MODES.DRAG_TO_PAN) {
			return; // Handled by drag event
		}
		
		const mouse = this.parent.getContainerMouse();
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
						this.parent.activeMyte.getRect()
					);
				} else if (isMouseInContainer) {
					// Fallback to cursor edge if no active myte
					this.followCursorEdge(mouse.x, mouse.y, canvasRect, containerRect);
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