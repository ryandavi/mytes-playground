
class Camera {

	constructor(parent, canvas, viewport) {

		this.parent = parent;
		// positions
		this.posX = 0;
		this.posY = 0;
		this.targetX = 0;
		this.targetY = 0;
		this.easing = 10; // Adjust this value to control camera smoothness

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
		
	}

	reset(){
		this.setTarget(0, 0);
		//this.setPosition(0, 0);
		this.setZoomLevel(1);
	}

	setMode(i) {
		this.previousFollowMode = this.followMode;
		this.followMode = i;
		this.parent.userInterface.updateCycleCamera(document.getElementById("cycleCamera"));
	}

	setToPreviousMode(){
		this.setMode(this.previousFollowMode);
	}


	updateTransform(x, y, zoom) {
		this.canvas.style.transform = `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px) scale(${zoom})`;
	}


	followCursor(x, y, canvasRect, viewportRect) {
		// Get the percentage position of the mouse within the viewport
		const mouseXPercent = x / viewportRect.width;
		const mouseYPercent = y / viewportRect.height;

		// Calculate the camera position based on the mouse percentage
		const cameraX = Math.max(0, Math.min(mouseXPercent * canvasRect.width - viewportRect.width / 2, canvasRect.width - viewportRect.width));
		const cameraY = Math.max(0, Math.min(mouseYPercent * canvasRect.height - viewportRect.height / 2, canvasRect.height - viewportRect.height));

		this.setTarget(-cameraX, -cameraY);

	}

	followCharacter(x, y, canvasRect, viewportRect, elementRect) {
		let posX = x + (elementRect.width / 2) - (viewportRect.width / 2);
		let posY = y + (elementRect.height / 2) - (viewportRect.height / 2);

		posX = Math.max(0, Math.min(canvasRect.width - viewportRect.width, posX));
		posY = Math.max(0, Math.min(canvasRect.height - viewportRect.height, posY));

		this.setTarget(-posX, -posY);
	}


	followCursorEdge(x, y, canvasRect, viewportRect) {
		const edgeThreshold = canvasRect.width / 4; // Distance from the edge of the viewport to start moving the camera

		let targetX = this.posX;
		let targetY = this.posY;

		let easing = this.easing / 3;

		// Check horizontal edges
		if (x < edgeThreshold) {
			targetX += (edgeThreshold - x) / easing;
		} else if (x > viewportRect.width - edgeThreshold) {
			targetX -= (x - (viewportRect.width - edgeThreshold)) / easing;
		}

		// Check vertical edges
		if (y < edgeThreshold) {
			targetY += (edgeThreshold - y) / easing;
		} else if (y > viewportRect.height - edgeThreshold) {
			targetY -= (y - (viewportRect.height - edgeThreshold)) / easing;
		}

		targetX = Math.min(0, Math.max(targetX, -(canvasRect.width - viewportRect.width)));
		targetY = Math.min(0, Math.max(targetY, -(canvasRect.height - viewportRect.height)));

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
		// Calculate the distance to move in each frame
		const deltaX = this.targetX - this.posX;
		const deltaY = this.targetY - this.posY;

		// Calculate the step for each frame
		const stepX = deltaX / this.easing;
		const stepY = deltaY / this.easing;

		// Update the zoom level
		const zoomDelta = this.targetZoomLevel - this.zoomLevel;
		const zoomStep = zoomDelta / this.zoomEasing;
		this.zoomLevel += zoomStep;

		// Check if the distance to the target is very close (you can adjust the threshold)
		const distanceToTarget = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
		const snapThreshold = 1; // Adjust as needed

		if (distanceToTarget < snapThreshold) {
			// Snap to the target positions
			this.setPosition(this.targetX, this.targetY);
		} else {
			// Update the object's position
			this.setPosition(this.posX + stepX, this.posY + stepY);
		}

		// Update the viewport
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
					this.followCharacter(this.parent.activeMyte.posX, this.parent.activeMyte.posY, canvasRect, containerRect, this.parent.activeMyte.getRect());
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
		}
	}

	drag(e) {
		if (this.isDragging && this.followMode === CAMERA_FOLLOW_MODES.DRAG_TO_PAN) {
			const dx = e.clientX - this.dragStartX;
			const dy = e.clientY - this.dragStartY;
			let newX = this.dragStartCameraX + dx;
			let newY = this.dragStartCameraY + dy;

			// Ensure the camera doesn't move beyond the canvas boundaries
			const canvasRect = this.parent.getCanvasRect();
			const viewportRect = this.parent.getContainerRect();

			newX = Math.min(0, Math.max(newX, -(canvasRect.width - viewportRect.width)));
			newY = Math.min(0, Math.max(newY, -(canvasRect.height - viewportRect.height)));

			this.setTarget(newX, newY);
		}
	}

	endDrag() {
		this.isDragging = false;
		this.canvas.style.cursor = 'default';
	}

}
