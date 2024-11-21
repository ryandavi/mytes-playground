class CameraSystem {
    constructor(container) {
        this.container = container;
        this.position = new Vector2();
        this.target = new Vector2();
        this.easing = 10;
        this.zoomLevel = 1;
        this.targetZoomLevel = 1;
        this.zoomEasing = 5;
        this.isScrollable = { x: true, y: true };
        this.mode = CAMERA_FOLLOW_MODES.DRAG_TO_PAN;
        this.previousMode = CAMERA_FOLLOW_MODES.DRAG_TO_PAN;
        this.isDragging = false;
        this.dragStart = new Vector2();
        this.dragStartCamera = new Vector2();
        this.boundaries = null;

        this.canvas = this.container.canvas;
    }

	reset() {
        this.position = new Vector2();
        this.target = new Vector2();
        this.zoomLevel = 1;
        this.targetZoomLevel = 1;
        this.updateTransform();
    }

    setMode(newMode) {
        this.previousMode = this.mode;
        this.mode = newMode;
    }

    restorePreviousMode() {
        const temp = this.mode;
        this.mode = this.previousMode;
        this.previousMode = temp;
    }

    setTarget(x, y) {
        if (!this.boundaries) {
            this.calculateBoundaries();
        }

        this.target.x = this.isScrollable.x ? this.clampPosition(x, 'x') : 0;
        this.target.y = this.isScrollable.y ? this.clampPosition(y, 'y') : 0;
    }

    calculateBoundaries() {
        const containerRect = this.container.getContainerRect();
        const canvasRect = this.container.getCanvasRect();
        
        this.boundaries = {
            minX: Math.min(0, -(canvasRect.width - containerRect.width)),
            maxX: 0,
            minY: Math.min(0, -(canvasRect.height - containerRect.height)),
            maxY: 0,
            containerWidth: containerRect.width,
            containerHeight: containerRect.height,
            canvasWidth: canvasRect.width,
            canvasHeight: canvasRect.height
        };
    }

    clampPosition(value, axis) {
        if (!this.boundaries) return value;
        
        const min = axis === 'x' ? this.boundaries.minX : this.boundaries.minY;
        const max = axis === 'x' ? this.boundaries.maxX : this.boundaries.maxY;
        
        return Math.min(max, Math.max(min, value));
    }

    updateTransform() {
        const x = Math.round(this.position.x);
        const y = Math.round(this.position.y);
        
        this.canvas.style.transform = `translate(${x}px, ${y}px) scale(${this.zoomLevel})`;
    }

    setZoomLevel(zoom) {
        this.targetZoomLevel = Math.max(0.5, Math.min(2, zoom));
    }

    update() {
        if (!this.boundaries) {
            this.calculateBoundaries();
        }

        if (this.isDragging && this.mode === CAMERA_FOLLOW_MODES.DRAG_TO_PAN) {
            return;
        }

        // Update based on current mode
        const mousePos = this.container.getLocalMousePosition();
        
        switch (this.mode) {
            case CAMERA_FOLLOW_MODES.CURSOR:
                if (this.container.isMouseInBounds()) {
                    this.followCursor(mousePos);
                }
                break;
            case CAMERA_FOLLOW_MODES.CURSOR_EDGE:
                if (this.container.isMouseInBounds()) {
                    this.followCursorEdge(mousePos);
                }
                break;
            case CAMERA_FOLLOW_MODES.CHARACTER:
                if (this.container.activeMyte) {
                    this.followCharacter(this.container.activeMyte);
                }
                break;
        }

        // Update position with easing
        const dx = this.target.x - this.position.x;
        const dy = this.target.y - this.position.y;
        
        this.position.x += dx / this.easing;
        this.position.y += dy / this.easing;

        // Update zoom with easing
        const zoomDelta = this.targetZoomLevel - this.zoomLevel;
        this.zoomLevel += zoomDelta / this.zoomEasing;

        this.updateTransform();
    }



    init() {
        this.initEventListeners();
        this.calculateBoundaries();
    }

    initEventListeners() {
        // Mouse down starts drag
        this.canvas.addEventListener('mousedown', (e) => {
            if (this.mode === CAMERA_FOLLOW_MODES.DRAG_TO_PAN) {
                this.startDrag(e.clientX, e.clientY);
            }
        });

        // Mouse move updates drag
        document.addEventListener('mousemove', (e) => {
            if (this.isDragging && this.mode === CAMERA_FOLLOW_MODES.DRAG_TO_PAN) {
                this.updateDrag(e.clientX, e.clientY);
            }
        });

        // Mouse up ends drag
        document.addEventListener('mouseup', () => {
            this.endDrag();
        });

        // Recalculate boundaries on resize
        window.addEventListener('resize', () => {
            this.calculateBoundaries();
        });
    }

    calculateBoundaries() {
        const containerRect = this.container.element.getBoundingClientRect();
        const canvasRect = this.canvas.getBoundingClientRect();
        
        this.boundaries = {
            minX: Math.min(0, -(canvasRect.width - containerRect.width)),
            maxX: 0,
            minY: Math.min(0, -(canvasRect.height - containerRect.height)),
            maxY: 0,
            containerWidth: containerRect.width,
            containerHeight: containerRect.height,
            canvasWidth: canvasRect.width,
            canvasHeight: canvasRect.height
        };
    }

    startDrag(clientX, clientY) {
        this.isDragging = true;
        this.dragStart.x = clientX;
        this.dragStart.y = clientY;
        this.dragStartCamera.x = this.position.x;
        this.dragStartCamera.y = this.position.y;
        this.canvas.style.cursor = 'grabbing';
    }

    updateDrag(clientX, clientY) {
        const dx = clientX - this.dragStart.x;
        const dy = clientY - this.dragStart.y;

        this.setTarget(
            this.clampPosition(this.dragStartCamera.x + dx, 'x'),
            this.clampPosition(this.dragStartCamera.y + dy, 'y')
        );
    }

    endDrag() {
        this.isDragging = false;
        this.canvas.style.cursor = 'default';
    }

    setMode(newMode) {
        this.previousMode = this.mode;
        this.mode = newMode;
    }

    restorePreviousMode() {
        this.setMode(this.previousMode);
    }

    setTarget(x, y) {
        this.target.x = this.isScrollable.x ? x : 0;
        this.target.y = this.isScrollable.y ? y : 0;
    }

    setZoomLevel(zoom) {
        this.targetZoomLevel = Math.max(0.5, Math.min(2, zoom));
    }

    followCursor(mousePos) {
        if (!this.boundaries) return;

        const percentX = mousePos.x / this.boundaries.containerWidth;
        const percentY = mousePos.y / this.boundaries.containerHeight;

        this.setTarget(
            this.clampPosition(-(percentX * this.boundaries.canvasWidth - this.boundaries.containerWidth / 2), 'x'),
            this.clampPosition(-(percentY * this.boundaries.canvasHeight - this.boundaries.containerHeight / 2), 'y')
        );
    }

    followCharacter(myte) {
        if (!this.boundaries || !myte) return;

        const characterCenter = {
            x: myte.movement.position.x + myte.width / 2,
            y: myte.movement.position.y + myte.height / 2
        };

        this.setTarget(
            this.clampPosition(-(characterCenter.x - this.boundaries.containerWidth / 2), 'x'),
            this.clampPosition(-(characterCenter.y - this.boundaries.containerHeight / 2), 'y')
        );
    }

    followCursorEdge(mousePos) {
        if (!this.boundaries) return;

        const edgeThreshold = this.boundaries.containerWidth / 4;
        let newTarget = new Vector2(this.target.x, this.target.y);
        const easing = this.easing / 3;

        // Check horizontal edges
        if (mousePos.x < edgeThreshold) {
            newTarget.x += (edgeThreshold - mousePos.x) / easing;
        } else if (mousePos.x > this.boundaries.containerWidth - edgeThreshold) {
            newTarget.x -= (mousePos.x - (this.boundaries.containerWidth - edgeThreshold)) / easing;
        }

        // Check vertical edges
        if (mousePos.y < edgeThreshold) {
            newTarget.y += (edgeThreshold - mousePos.y) / easing;
        } else if (mousePos.y > this.boundaries.containerHeight - edgeThreshold) {
            newTarget.y -= (mousePos.y - (this.boundaries.containerHeight - edgeThreshold)) / easing;
        }

        this.setTarget(
            this.clampPosition(newTarget.x, 'x'),
            this.clampPosition(newTarget.y, 'y')
        );
    }

    clampPosition(value, axis) {
        if (!this.boundaries) return value;
        
        const min = axis === 'x' ? this.boundaries.minX : this.boundaries.minY;
        const max = axis === 'x' ? this.boundaries.maxX : this.boundaries.maxY;
        
        return Math.min(max, Math.max(min, value));
    }

    updatePosition() {
        // Calculate movement using easing
        const dx = this.target.x - this.position.x;
        const dy = this.target.y - this.position.y;
        
        // Update position with easing
        this.position.x += dx / this.easing;
        this.position.y += dy / this.easing;

        // Update zoom with easing
        const zoomDelta = this.targetZoomLevel - this.zoomLevel;
        this.zoomLevel += zoomDelta / this.zoomEasing;

        // Apply transform
        this.updateTransform();
    }

    updateTransform() {
        // Round positions to prevent subpixel rendering
        const x = Math.round(this.position.x);
        const y = Math.round(this.position.y);
        
        this.canvas.style.transform = `translate(${x}px, ${y}px) scale(${this.zoomLevel})`;
    }

    update() {
        // Recalculate boundaries if needed
        if (!this.boundaries) {
            this.calculateBoundaries();
        }

        // Skip updates if dragging in drag mode
        if (this.isDragging && this.mode === CAMERA_FOLLOW_MODES.DRAG_TO_PAN) {
            return;
        }

        // Update based on current mode
        const mousePos = this.container.getLocalMousePosition();
        
        switch (this.mode) {
            case CAMERA_FOLLOW_MODES.CURSOR:
                if (this.container.isMouseInBounds()) {
                    this.followCursor(mousePos);
                }
                break;

            case CAMERA_FOLLOW_MODES.CURSOR_EDGE:
                if (this.container.isMouseInBounds()) {
                    this.followCursorEdge(mousePos);
                }
                break;

            case CAMERA_FOLLOW_MODES.CHARACTER:
                this.followCharacter(this.container.activeMyte);
                break;
        }

        // Update camera position with easing
        this.updatePosition();
    }

    // Utility methods for external use
    worldToScreen(worldPos) {
        return {
            x: worldPos.x + this.position.x,
            y: worldPos.y + this.position.y
        };
    }

    screenToWorld(screenPos) {
        return {
            x: screenPos.x - this.position.x,
            y: screenPos.y - this.position.y
        };
    }

    isPointVisible(point) {
        if (!this.boundaries) return true;

        const screenPos = this.worldToScreen(point);
        return screenPos.x >= 0 && 
               screenPos.x <= this.boundaries.containerWidth &&
               screenPos.y >= 0 && 
               screenPos.y <= this.boundaries.containerHeight;
    }
}