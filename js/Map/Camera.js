class Camera {
	constructor(parent, canvas, viewport) {
		this.parent = parent;
		// positions
		this.posX = 0;
		this.posY = 0;
		this.targetX = 0;
		this.targetY = 0;
		this.easing = 10; // Adjust this value to control camera smoothness

		this.canZoom = false;
		this.zoomLevel = 1; // Initial zoom level
		this.targetZoomLevel = 1; // Target zoom level
		this.zoomEasing = 5; // Easing for zoom transitions

		this.canvas = canvas;
		this.viewport = viewport;

		this.followMode = DEFAULT_CAMERA_FOLLOW_MODE;
		this.previousFollowMode = DEFAULT_CAMERA_FOLLOW_MODE;

		this.isScrollable = { x: true, y: true };

		// drag
		this.isDragging = false;
		this.dragStartX = 0;
		this.dragStartY = 0;
		this.dragStartCameraX = 0;
		this.dragStartCameraY = 0;

		// Add event listeners for drag functionality
		this.canvas.addEventListener('mousedown', this.startDrag.bind(this));
		document.addEventListener('mousemove', this.drag.bind(this));
		document.addEventListener('mouseup', this.endDrag.bind(this));

		// Add mouse wheel event for zooming
		this.canvas.addEventListener('wheel', this.handleZoom.bind(this), { passive: false });

		// Variable to control instant vs. eased movement
		this.useInstantMovement = false;


	}



	/**
	 * Focus the camera on a specific entity
	 * @param {Object} entity - The entity to focus on (needs posX, posY, and getRect method)
	 */
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

	/**
	 * Handles mouse wheel events for zooming
	 * @param {Event} e - The wheel event
	 */
	handleZoom(e) {
		e.preventDefault();

		if (this.canZoom === false) return;

		// Get mouse position relative to canvas to zoom toward cursor
		const rect = this.canvas.getBoundingClientRect();
		const mouseX = e.clientX - rect.left;
		const mouseY = e.clientY - rect.top;

		// Determine zoom direction
		const zoomDirection = e.deltaY < 0 ? 1 : -1;
		const zoomFactor = 0.1;

		// Calculate new zoom level
		const newZoom = Math.max(0.5, Math.min(2.5, this.targetZoomLevel + zoomDirection * zoomFactor));

		// Only proceed if zoom level is changing
		if (newZoom !== this.targetZoomLevel) {
			// Calculate zoom point in world coordinates
			const worldX = mouseX - this.posX;
			const worldY = mouseY - this.posY;

			// Calculate new target position to zoom toward cursor
			const zoomRatio = newZoom / this.targetZoomLevel;
			const newTargetX = mouseX - worldX * zoomRatio;
			const newTargetY = mouseY - worldY * zoomRatio;

			this.setTarget(newTargetX, newTargetY);
			this.setZoomLevel(newZoom);
		}
	}

	reset() {

		if (this.isScrollable.x) {
			this.setTarget(0, this.targetY);
		}

		if (this.isScrollable.y) {
			this.setTarget(this.targetX, 0);
		}

		this.setZoomLevel(1);
	}

	setMode(i) {
		this.previousFollowMode = this.followMode;
		this.followMode = i;
		this.parent.ui.debugMenu.updateCycleCamera(document.getElementById("cycleCamera"));
	}

	setToPreviousMode() {
		this.setMode(this.previousFollowMode);
	}

	updateTransform(x, y, zoom) {
		// Apply transform with more precise decimal places for smoother movement
		this.canvas.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) scale(${zoom.toFixed(3)})`;
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

		let posX = this.posX;
		let posY = this.posY;

		if (this.isScrollable.x) {
			posX = -(x + (elementRect.width / 2) - (viewportRect.width / 2));
			posX = Math.min(0, Math.max(-(canvasRect.width - viewportRect.width), posX));
		}

		if (this.isScrollable.y) {
			posY = -(y + (elementRect.height / 2) - (viewportRect.height / 2));
			posY = Math.min(0, Math.max(-(canvasRect.height - viewportRect.height), posY));
		}

		this.setTarget(posX, posY);
	}

	followCursorEdge(x, y, canvasRect, viewportRect) {
		if (!this.isScrollable.x && !this.isScrollable.y) return;

		// Make edge threshold responsive to viewport size (20% of viewport)
		const horizEdgeThreshold = viewportRect.width * 0.2;
		const vertEdgeThreshold = viewportRect.height * 0.2;

		let targetX = this.posX;
		let targetY = this.posY;

		// Adjust edge follow speed based on how far the cursor is from the edge
		let easing = this.easing / 3;

		// Check horizontal edges if scrollable horizontally
		if (this.isScrollable.x) {
			if (x < horizEdgeThreshold) {
				// Moving toward left edge
				const intensity = 1 - (x / horizEdgeThreshold); // 0 to 1, higher near edge
				targetX += (horizEdgeThreshold - x) / easing * intensity * 2;
			} else if (x > viewportRect.width - horizEdgeThreshold) {
				// Moving toward right edge
				const intensity = (x - (viewportRect.width - horizEdgeThreshold)) / horizEdgeThreshold;
				targetX -= (x - (viewportRect.width - horizEdgeThreshold)) / easing * intensity * 2;
			}

			// Keep within bounds
			targetX = Math.min(0, Math.max(targetX, -(canvasRect.width - viewportRect.width)));
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

			// Keep within bounds
			targetY = Math.min(0, Math.max(targetY, -(canvasRect.height - viewportRect.height)));
		}

		this.setTarget(targetX, targetY);
	}

	setPosition(x, y) {
		this.posX = x;
		this.posY = y;
	}

	setTarget(x, y) {
		this.targetX = x;
		this.targetY = y;
	}

	update() {
		// If instant movement is enabled, skip easing calculations
		if (this.useInstantMovement) {
			this.posX = this.targetX;
			this.posY = this.targetY;
			this.zoomLevel = this.targetZoomLevel;
			this.updateTransform(this.posX, this.posY, this.zoomLevel);
			this.doCameraLogic();
			return;
		}

		// Calculate the distance to move in each frame
		const deltaX = this.targetX - this.posX;
		const deltaY = this.targetY - this.posY;

		// Adaptive easing - faster for larger distances
		const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
		const adaptiveEasing = Math.max(4, this.easing - distance / 100);

		// Calculate the step for each frame
		const stepX = deltaX / adaptiveEasing;
		const stepY = deltaY / adaptiveEasing;

		// Update the zoom level
		const zoomDelta = this.targetZoomLevel - this.zoomLevel;
		const zoomStep = zoomDelta / this.zoomEasing;
		this.zoomLevel += zoomStep;

		// Check if the distance to the target is very close
		const snapThreshold = 0.5; // Reduced threshold for more precise positioning

		if (distance < snapThreshold && Math.abs(zoomDelta) < 0.01) {
			// Snap to the target positions
			this.setPosition(this.targetX, this.targetY);
			this.zoomLevel = this.targetZoomLevel; // Snap zoom too
		} else {
			// Update the object's position
			this.setPosition(this.posX + stepX, this.posY + stepY);
		}

		// Update the viewport
		this.updateTransform(this.posX, this.posY, this.zoomLevel);

		// Handle camera follow logic
		this.doCameraLogic();
	}

	doCameraLogic() {
		if (this.followMode === CAMERA_FOLLOW_MODES.DRAG_TO_PAN) {
			return; // Handled by drag event
		}

		const mouse = this.parent.getContainerMouse();
		const canvasRect = this.parent.getCanvasRect();
		const containerRect = this.parent.getContainerRect();

		switch (this.followMode) {
			case CAMERA_FOLLOW_MODES.CURSOR:
				if (!this.parent.isMouseInContainer()) return;
				this.followCursor(mouse.x, mouse.y, canvasRect, containerRect);
				break;
			case CAMERA_FOLLOW_MODES.CURSOR_EDGE:
				if (!this.parent.isMouseInContainer()) return;
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
				} else {
					if (!this.parent.isMouseInContainer()) return;
					this.followCursorEdge(mouse.x, mouse.y, canvasRect, containerRect);
				}
				break;
		}
	}

	setZoomLevel(zoom) {
		this.targetZoomLevel = zoom;
	}

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
		if (this.isDragging && this.followMode === CAMERA_FOLLOW_MODES.DRAG_TO_PAN) {
			const dx = e.clientX - this.dragStartX;
			const dy = e.clientY - this.dragStartY;
			let newX = this.dragStartCameraX + dx;
			let newY = this.dragStartCameraY + dy;

			// Only apply drag in scrollable directions
			if (!this.isScrollable.x) newX = this.dragStartCameraX;
			if (!this.isScrollable.y) newY = this.dragStartCameraY;

			// Ensure the camera doesn't move beyond the canvas boundaries
			const canvasRect = this.parent.getCanvasRect();
			const viewportRect = this.parent.getContainerRect();

			if (this.isScrollable.x) {
				newX = Math.min(0, Math.max(newX, -(canvasRect.width - viewportRect.width)));
			}

			if (this.isScrollable.y) {
				newY = Math.min(0, Math.max(newY, -(canvasRect.height - viewportRect.height)));
			}

			this.setTarget(newX, newY);
		}
	}

	endDrag() {
		this.isDragging = false;
		this.canvas.style.cursor = 'default';
	}

	dispose() {
		// Remove event listeners to prevent memory leaks
		this.canvas.removeEventListener('mousedown', this.startDrag);
		document.removeEventListener('mousemove', this.drag);
		document.removeEventListener('mouseup', this.endDrag);
		this.canvas.removeEventListener('wheel', this.handleZoom);

		// Clear references
		this.parent = null;
		this.canvas = null;
		this.viewport = null;
	}
}